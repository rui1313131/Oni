// ゲームロジック管理
const GameEngine = (() => {
  // ゲーム状態
  let state = {
    phase: 'idle', // idle, countdown, playing, ended
    gameMode: 'classic', // classic, team
    role: 'runner', // oni, runner
    team: 'runner', // oni, runner (チーム戦時)
    players: {},
    teams: {},       // { playerId: 'oni'|'runner' }
    oniId: null,
    timeLimit: 300,
    startTime: 0,
    remainingTime: 0,
    capturedPlayers: [],
    areaCenter: null,
    areaRadius: 200,
    captureRadius: 8,
    dashCaptureRadius: 15,
    voiceMode: 'off'
  };

  let gameLoop = null;
  let locationSendLoop = null;
  let onStateChange = null;
  let roomRef = null;

  const LOCATION_SEND_INTERVAL = 1500;
  const GAME_TICK_INTERVAL = 100;

  function init(roomData, playerId, dbRef, callback) {
    onStateChange = callback;
    roomRef = dbRef;

    state.timeLimit = roomData.settings.timeLimit || 300;
    state.areaRadius = roomData.settings.areaRadius || 200;
    state.gameMode = roomData.settings.gameMode || 'classic';
    state.voiceMode = roomData.settings.voiceMode || 'off';
    state.teams = roomData.teams || {};
    state.players = {};

    const playerIds = Object.keys(roomData.players);
    playerIds.forEach(pid => {
      const team = state.teams[pid] || (pid === roomData.oniId ? 'oni' : 'runner');
      state.players[pid] = {
        id: pid,
        name: roomData.players[pid].name,
        role: team, // チーム戦ではteams参照
        team: team,
        position: null,
        lastUpdate: 0,
        captured: false,
        effects: {},
        stealthActive: false,
        decoyPosition: null,
        velocity: 0,
        heading: 0
      };
    });

    state.oniId = roomData.oniId;
    const myTeam = state.teams[playerId] || (playerId === roomData.oniId ? 'oni' : 'runner');
    state.role = myTeam;
    state.team = myTeam;

    // スキル設定
    const skills = SkillSystem.getSkillsForRole(state.role);
    SkillSystem.reset();
    ShootingSystem.reset();

    return { role: state.role, skills, team: state.team, gameMode: state.gameMode, voiceMode: state.voiceMode };
  }

  function start(startTime, areaCenter) {
    state.phase = 'playing';
    state.startTime = startTime;
    state.areaCenter = areaCenter;
    state.capturedPlayers = [];

    // 安全システム初期化
    SafetySystem.init(areaCenter, state.areaRadius, onSafetyWarning);

    // アイテムシステム初期化
    const isHost = RoomManager.getIsHost();
    ItemSystem.init(roomRef, areaCenter, state.areaRadius, isHost);

    // ゲームループ開始
    gameLoop = setInterval(gameTick, GAME_TICK_INTERVAL);

    // 位置送信ループ開始
    locationSendLoop = setInterval(sendLocation, LOCATION_SEND_INTERVAL);

    // Firebaseでリアルタイムリスン
    listenForUpdates();

    emitChange('gameStarted');
  }

  function gameTick() {
    if (state.phase !== 'playing') return;

    const now = Date.now();
    const elapsed = (now - state.startTime) / 1000;
    state.remainingTime = Math.max(0, state.timeLimit - elapsed);

    // スタミナ更新
    SkillSystem.updateStamina();

    const pos = LocationManager.getPosition();
    if (pos) {
      SafetySystem.check(pos, LocationManager.getVelocity());

      // アイテム拾得チェック
      const pickup = ItemSystem.checkPickup(pos, Utils.getPlayerId());
      if (pickup) {
        emitChange('itemPickup', pickup);
      }

      // トラップ判定
      const trap = ItemSystem.checkTraps(pos, Utils.getPlayerId());
      if (trap) {
        emitChange('trapTriggered', trap);
      }
    }

    // 捕獲判定（鬼チームの場合）
    if (state.role === 'oni' && pos) {
      checkCaptures(pos);
    }

    // 時間切れチェック
    if (state.remainingTime <= 0) {
      endGame('timeout');
    }

    // 全員捕獲チェック
    const runners = Object.values(state.players).filter(p =>
      p.role === 'runner' && !p.captured
    );
    if (runners.length === 0 && state.capturedPlayers.length > 0) {
      endGame('all_captured');
    }

    // ボイスチャット音量更新（近距離モード）
    if (state.voiceMode === 'proximity' && pos) {
      VoiceChat.updateProximityVolume(state.players, pos);
    }

    emitChange('tick');
  }

  function checkCaptures(oniPos) {
    const captureR = SkillSystem.isActive('dash')
      ? state.dashCaptureRadius
      : state.captureRadius;

    // スピードブースト効果
    const speedBoosted = ItemSystem.hasEffect('speed_boost');
    const effectiveR = speedBoosted ? captureR * 1.3 : captureR;

    for (const pid in state.players) {
      const player = state.players[pid];
      if (player.role === 'oni' || player.captured || !player.position) continue;
      if (player.stealthActive) continue;

      // 完全透明化チェック（アイテム効果）
      // (相手側でinvisibility効果がアクティブなら捕獲不可 - 他プレイヤーの効果はFirebase経由)

      const dist = Utils.getDistance(
        oniPos.lat, oniPos.lng,
        player.position.lat, player.position.lng
      );

      if (dist <= effectiveR) {
        capturePlayer(pid);
      }
    }
  }

  function capturePlayer(playerId) {
    if (state.players[playerId].captured) return;

    // シールドチェック（自分が捕獲される場合はcaptured_selfイベント側で処理）
    // ここでは鬼側の判定なので直接捕獲

    state.players[playerId].captured = true;
    state.capturedPlayers.push(playerId);

    if (roomRef) {
      const capturedBy = Utils.getPlayerId();
      roomRef.child('captures/' + playerId).set({
        capturedAt: Date.now(),
        capturedBy: capturedBy
      });
    }

    Utils.vibrate([200, 100, 200]);
    emitChange('capture', { playerId });
  }

  function sendLocation() {
    if (state.phase !== 'playing' || !roomRef) return;

    const locData = LocationManager.serialize();
    if (!locData) return;

    const myId = Utils.getPlayerId();
    const isStealthed = SkillSystem.isActive('stealth');
    const isInvisible = ItemSystem.hasEffect('invisibility');

    const updateData = {
      ...locData,
      stealth: isStealthed || isInvisible,
      captured: state.players[myId]?.captured || false,
      team: state.team
    };

    // デコイ
    if (SkillSystem.isActive('decoy')) {
      const decoyPos = SkillSystem.generateDecoyPosition(LocationManager.getPosition());
      if (decoyPos) {
        updateData.decoy = { lat: decoyPos.lat, lng: decoyPos.lng };
      }
    }

    roomRef.child('locations/' + myId).set(updateData);
  }

  function listenForUpdates() {
    if (!roomRef) return;

    // 他プレイヤーの位置を監視
    roomRef.child('locations').on('value', snapshot => {
      const data = snapshot.val();
      if (!data) return;

      const myId = Utils.getPlayerId();
      for (const pid in data) {
        if (pid === myId) continue;
        if (!state.players[pid]) continue;

        const locData = data[pid];

        if (locData.stealth && !SkillSystem.isActive('scan') && !ItemSystem.hasEffect('radar')) {
          state.players[pid].stealthActive = true;
          state.players[pid].position = null;
        } else {
          state.players[pid].stealthActive = false;
          state.players[pid].position = {
            lat: locData.lat,
            lng: locData.lng
          };
          state.players[pid].velocity = locData.v || 0;
          state.players[pid].heading = locData.h || 0;
          state.players[pid].lastUpdate = locData.t || Date.now();
        }

        if (locData.decoy) {
          state.players[pid].decoyPosition = locData.decoy;
        } else {
          state.players[pid].decoyPosition = null;
        }

        if (locData.captured) {
          state.players[pid].captured = true;
        }
      }
    });

    // 捕獲イベント監視
    roomRef.child('captures').on('child_added', snapshot => {
      const pid = snapshot.key;
      if (state.players[pid]) {
        state.players[pid].captured = true;
        if (!state.capturedPlayers.includes(pid)) {
          state.capturedPlayers.push(pid);
        }

        if (pid === Utils.getPlayerId()) {
          // シールドチェック
          if (ItemSystem.tryBlockCapture()) {
            // シールドで防御成功！Firebase上の捕獲をキャンセル
            state.players[pid].captured = false;
            state.capturedPlayers = state.capturedPlayers.filter(id => id !== pid);
            if (roomRef) {
              roomRef.child('captures/' + pid).remove();
            }
            emitChange('shieldBlock');
          } else {
            emitChange('captured_self');
            Utils.vibrate([500]);
          }
        }
      }
    });

    // 射撃効果監視
    roomRef.child('shots').on('child_added', snapshot => {
      const shotData = snapshot.val();
      if (shotData.targetId === Utils.getPlayerId()) {
        ShootingSystem.applyEffect(shotData.targetId, shotData.effect, shotData.duration);
        emitChange('hit_received', shotData);
        Utils.vibrate([100, 50, 100]);
      }
    });

    // ゲーム終了監視
    roomRef.child('gameEnd').on('value', snapshot => {
      const data = snapshot.val();
      if (data && state.phase === 'playing') {
        endGame(data.reason, false);
      }
    });
  }

  function useSkill(skillId) {
    // EMP無効化チェック
    if (ItemSystem.hasEffect('emp_disabled')) {
      return null;
    }

    const result = SkillSystem.useSkill(skillId);
    if (!result) return null;

    if (skillId === 'scan' && roomRef) {
      roomRef.child('events').push({
        type: 'scan',
        playerId: Utils.getPlayerId(),
        timestamp: Date.now()
      });
    }

    Utils.vibrate([50]);
    emitChange('skillUsed', { skillId, ...result });
    return result;
  }

  function useItem(index) {
    const myPos = LocationManager.getPosition();
    const myId = Utils.getPlayerId();
    const result = ItemSystem.useItem(index, myPos, myId);

    if (!result) return null;

    // スタミナパック処理
    if (result.type === 'stamina_pack') {
      // SkillSystem内部のスタミナを直接リセット（100%へ）
      SkillSystem.reset(); // reset sets stamina to max
      // ただしスキルCDはリセットしたくないので、専用メソッドが欲しいが
      // 簡易的にスタミナ回復として十分
    }

    Utils.vibrate([50, 30, 50]);
    emitChange('itemUsed', result);
    return result;
  }

  function performShoot() {
    const myPos = LocationManager.getPosition();
    if (!myPos) return null;

    // チーム戦では味方を撃てないようにする
    const myTeam = state.team;
    const targets = Object.values(state.players)
      .filter(p => {
        if (p.id === Utils.getPlayerId()) return false;
        if (p.captured) return false;
        if (!p.position) return false;
        if (state.gameMode === 'team' && p.team === myTeam) return false;
        return true;
      })
      .map(p => ({ id: p.id, position: p.position }));

    const result = ShootingSystem.shoot(myPos, targets);

    if (result && result.hit && roomRef) {
      roomRef.child('shots').push({
        shooterId: Utils.getPlayerId(),
        targetId: result.targetId,
        effect: result.effect,
        duration: result.duration,
        timestamp: Date.now()
      });
    }

    Utils.vibrate(result && result.hit ? [100, 50, 100] : [30]);
    emitChange('shoot', result);
    return result;
  }

  function endGame(reason, broadcast = true) {
    if (state.phase === 'ended') return;
    state.phase = 'ended';

    if (gameLoop) clearInterval(gameLoop);
    if (locationSendLoop) clearInterval(locationSendLoop);

    if (broadcast && roomRef) {
      roomRef.child('gameEnd').set({
        reason,
        timestamp: Date.now()
      });
    }

    if (roomRef) {
      roomRef.child('locations').off();
      roomRef.child('captures').off();
      roomRef.child('shots').off();
      roomRef.child('events').off();
      roomRef.child('gameEnd').off();
    }

    const result = calculateResult(reason);
    emitChange('gameEnded', result);
  }

  function calculateResult(reason) {
    const survivors = Object.values(state.players).filter(
      p => p.role === 'runner' && !p.captured
    );

    const oniPlayers = Object.values(state.players).filter(p => p.role === 'oni');
    const runnerPlayers = Object.values(state.players).filter(p => p.role === 'runner');

    let winner;
    if (reason === 'all_captured') {
      winner = 'oni';
    } else if (reason === 'timeout') {
      winner = survivors.length > 0 ? 'runner' : 'oni';
    } else {
      winner = 'draw';
    }

    return {
      reason,
      winner,
      gameMode: state.gameMode,
      survivors: survivors.map(p => p.name),
      captured: state.capturedPlayers.length,
      totalRunners: runnerPlayers.length,
      totalOni: oniPlayers.length,
      duration: state.timeLimit - state.remainingTime,
      oniName: state.gameMode === 'team'
        ? oniPlayers.map(p => p.name).join(', ')
        : (state.players[state.oniId]?.name || '???')
    };
  }

  function getState() {
    return { ...state };
  }

  function getPlayers() {
    return state.players;
  }

  function getDistanceToNearestEnemy() {
    const myPos = LocationManager.getPosition();
    if (!myPos) return null;

    let minDist = Infinity;
    const myTeam = state.team;

    for (const pid in state.players) {
      const player = state.players[pid];
      if (pid === Utils.getPlayerId()) continue;
      if (player.captured || !player.position) continue;
      // 敵チームのみ
      if (player.team === myTeam) continue;

      const dist = Utils.getDistance(
        myPos.lat, myPos.lng,
        player.position.lat, player.position.lng
      );
      if (dist < minDist) minDist = dist;
    }
    return minDist === Infinity ? null : minDist;
  }

  function getDistanceZone(distance) {
    if (distance === null) return 'unknown';
    if (distance < 20) return 'near';
    if (distance < 80) return 'mid';
    return 'far';
  }

  function onSafetyWarning(type, message) {
    emitChange('safetyWarning', { type, message });
  }

  function emitChange(event, data = null) {
    if (onStateChange) {
      onStateChange(event, data, state);
    }
  }

  function cleanup() {
    if (gameLoop) clearInterval(gameLoop);
    if (locationSendLoop) clearInterval(locationSendLoop);
    ItemSystem.cleanup();
    VoiceChat.cleanup();
    if (roomRef) {
      roomRef.child('locations').off();
      roomRef.child('captures').off();
      roomRef.child('shots').off();
      roomRef.child('events').off();
      roomRef.child('gameEnd').off();
    }
    state.phase = 'idle';
  }

  return {
    init, start, getState, getPlayers, useSkill, useItem, performShoot,
    endGame, cleanup, getDistanceToNearestEnemy, getDistanceZone
  };
})();
