// メインアプリケーション
const App = (() => {
  let currentSkills = ['stealth', 'scan'];
  let gameActive = false;
  let currentVoiceMode = 'off';
  let deferredInstallPrompt = null;

  async function init() {
    console.log('ONI アプリ初期化開始');

    // SVGアイコン注入
    injectIcons();

    const fbReady = await FirebaseConfig.init();
    loadSettings();

    // 広告初期化
    AdManager.init();

    setTimeout(() => {
      UI.showScreen('menu');
      updateConnectionStatus(fbReady);
      AdManager.onScreenChange('menu');
    }, 2500);

    setupEventListeners();
    checkInviteLink();
    registerServiceWorker();
    setupInstallPrompt();
  }

  function updateConnectionStatus(connected) {
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');
    if (connected) {
      dot.classList.add('connected');
      text.textContent = 'オンライン';
    } else {
      dot.classList.add('error');
      text.textContent = 'Firebase未設定 → 設定画面へ';
    }
  }

  function loadSettings() {
    document.getElementById('setting-night-mode').checked = Utils.getSetting('nightMode', false);
    document.getElementById('setting-vibration').checked = Utils.getSetting('vibration', true);
    document.getElementById('setting-sound').checked = Utils.getSetting('sound', true);
    document.getElementById('setting-high-accuracy').checked = Utils.getSetting('highAccuracy', true);

  }

  function setupEventListeners() {
    // メニューボタン
    document.getElementById('btn-create-room').addEventListener('click', () => {
      if (!FirebaseConfig.isReady()) {
        UI.showToast('先にFirebaseを設定してください', 'error');
        UI.showScreen('settings');
        return;
      }
      UI.showScreen('create');
    });

    document.getElementById('btn-join-room').addEventListener('click', () => {
      if (!FirebaseConfig.isReady()) {
        UI.showToast('先にFirebaseを設定してください', 'error');
        UI.showScreen('settings');
        return;
      }
      UI.showScreen('join');
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
      UI.showScreen('settings');
    });

    document.getElementById('btn-random-match').addEventListener('click', () => {
      if (!FirebaseConfig.isReady()) {
        UI.showToast('接続エラー', 'error');
        return;
      }
      UI.showScreen('random');
    });

    // 戻るボタン
    document.getElementById('btn-back-create').addEventListener('click', () => UI.showScreen('menu'));
    document.getElementById('btn-back-join').addEventListener('click', () => UI.showScreen('menu'));
    document.getElementById('btn-back-settings').addEventListener('click', () => UI.showScreen('menu'));
    document.getElementById('btn-back-random').addEventListener('click', () => {
      RandomMatch.cancel();
      UI.showScreen('menu');
    });

    // ランダムマッチ
    document.getElementById('btn-start-random').addEventListener('click', handleRandomMatch);
    document.getElementById('btn-cancel-random').addEventListener('click', () => {
      RandomMatch.cancel();
      document.getElementById('btn-start-random').style.display = 'block';
      document.getElementById('btn-cancel-random').style.display = 'none';
      document.getElementById('random-search-anim').style.display = 'none';
      document.getElementById('random-status-text').textContent = '対戦相手を検索します';
      document.getElementById('random-player-count').style.display = 'none';
    });
    document.getElementById('btn-back-lobby').addEventListener('click', async () => {
      await RoomManager.leaveRoom();
      UI.showScreen('menu');
    });

    // ルーム作成
    document.getElementById('btn-do-create').addEventListener('click', handleCreateRoom);

    // ルーム参加
    document.getElementById('btn-do-join').addEventListener('click', handleJoinRoom);

    // ゲーム開始
    document.getElementById('btn-start-game').addEventListener('click', handleStartGame);

    // ルームIDコピー
    document.getElementById('btn-copy-room-id').addEventListener('click', () => {
      const roomId = document.getElementById('lobby-room-id').textContent;
      navigator.clipboard.writeText(roomId).then(() => {
        UI.showToast('ルームIDをコピーしました', 'success');
      }).catch(() => {
        UI.showToast('コピーに失敗しました', 'error');
      });
    });

    // 招待リンク共有
    document.getElementById('btn-share-invite').addEventListener('click', () => {
      const roomId = document.getElementById('lobby-room-id').textContent;
      const url = `${location.origin}${location.pathname}?room=${roomId}`;
      navigator.clipboard.writeText(url).then(() => {
        UI.showToast('招待リンクをコピーしました', 'success');
      }).catch(() => {
        UI.showToast('コピーに失敗しました', 'error');
      });
    });

    // 設定保存
    document.getElementById('setting-night-mode').addEventListener('change', e => {
      Utils.setSetting('nightMode', e.target.checked);
    });
    document.getElementById('setting-vibration').addEventListener('change', e => {
      Utils.setSetting('vibration', e.target.checked);
    });
    document.getElementById('setting-sound').addEventListener('change', e => {
      Utils.setSetting('sound', e.target.checked);
    });
    document.getElementById('setting-high-accuracy').addEventListener('change', e => {
      Utils.setSetting('highAccuracy', e.target.checked);
    });


    // ゲーム内ボタン
    document.getElementById('skill-btn-1').addEventListener('click', () => handleSkillUse(0));
    document.getElementById('skill-btn-2').addEventListener('click', () => handleSkillUse(1));
    document.getElementById('btn-shoot').addEventListener('click', handleShoot);

    // アイテムスロット
    document.getElementById('item-slot-0').addEventListener('click', () => handleItemUse(0));
    document.getElementById('item-slot-1').addEventListener('click', () => handleItemUse(1));

    // ボイスチャットボタン
    document.getElementById('btn-voice-toggle').addEventListener('click', handleVoiceToggle);

    // リワード広告（スタミナ回復）
    document.getElementById('btn-reward-ad').addEventListener('click', handleRewardAd);

    // ゲーム内メニュー
    document.getElementById('btn-game-menu').addEventListener('click', () => {
      document.getElementById('game-menu-overlay').style.display = 'flex';
    });
    document.getElementById('btn-close-game-menu').addEventListener('click', () => {
      document.getElementById('game-menu-overlay').style.display = 'none';
    });
    document.getElementById('btn-leave-game').addEventListener('click', async () => {
      GameEngine.cleanup();
      LocationManager.stop();
      UI.clearAllMarkers();
      await RoomManager.leaveRoom();
      document.getElementById('game-menu-overlay').style.display = 'none';
      gameActive = false;
      UI.showScreen('menu');
    });

    // リザルト画面
    document.getElementById('btn-back-menu').addEventListener('click', () => {
      UI.showScreen('menu');
    });

    // RoomManagerのコールバック設定
    RoomManager.setCallback(handleRoomEvent);
  }

  // ========== ルーム操作 ==========
  async function handleCreateRoom() {
    const name = document.getElementById('create-player-name').value.trim();
    if (!name) {
      UI.showToast('プレイヤー名を入力してください', 'error');
      return;
    }

    const nightCheck = SafetySystem.checkNightRestriction();
    if (nightCheck.restricted) {
      UI.showToast(nightCheck.message, 'error');
      return;
    }

    try {
      const room = await RoomManager.createRoom(
        name,
        document.getElementById('create-room-name').value.trim(),
        document.getElementById('create-room-password').value,
        document.getElementById('create-time-limit').value,
        document.getElementById('create-area-radius').value,
        document.getElementById('create-game-mode').value,
        document.getElementById('create-oni-count').value,
        document.getElementById('create-max-players').value,
        document.getElementById('create-voice-mode').value
      );

      document.getElementById('lobby-room-id').textContent = room.id;
      document.getElementById('invite-link-area').style.display = 'block';
      document.getElementById('btn-start-game').style.display = 'block';
      document.getElementById('lobby-wait-text').style.display = 'none';

      UI.updateLobbyInfo(room);
      UI.showScreen('lobby');
      UI.showToast('ルームを作成しました', 'success');

      LocationManager.start();
    } catch (e) {
      UI.showToast(e.message, 'error');
    }
  }

  async function handleJoinRoom() {
    const name = document.getElementById('join-player-name').value.trim();
    const roomId = document.getElementById('join-room-id').value.trim().toUpperCase();

    if (!name) {
      UI.showToast('プレイヤー名を入力してください', 'error');
      return;
    }
    if (!roomId) {
      UI.showToast('ルームIDを入力してください', 'error');
      return;
    }

    try {
      const room = await RoomManager.joinRoom(
        name,
        roomId,
        document.getElementById('join-room-password').value
      );

      document.getElementById('lobby-room-id').textContent = room.id;
      document.getElementById('invite-link-area').style.display = 'none';
      document.getElementById('btn-start-game').style.display = 'none';
      document.getElementById('lobby-wait-text').style.display = 'block';

      if (RoomManager.getIsHost()) {
        document.getElementById('btn-start-game').style.display = 'block';
        document.getElementById('lobby-wait-text').style.display = 'none';
      }

      UI.updateLobbyInfo(room);
      UI.showScreen('lobby');
      UI.showToast('ルームに参加しました', 'success');

      LocationManager.start();
    } catch (e) {
      UI.showToast(e.message, 'error');
    }
  }

  async function handleStartGame() {
    try {
      await RoomManager.startGame();
    } catch (e) {
      UI.showToast(e.message, 'error');
    }
  }

  // ========== ルームイベント ==========
  function handleRoomEvent(event, data) {
    switch (event) {
      case 'playersChanged':
        if (data) {
          const room = RoomManager.getRoom();
          UI.updateLobbyPlayers(data, room?.hostId, room?.settings?.gameMode, room?.teams);
        }
        break;

      case 'countdown':
        UI.showAlert('<h2>ゲーム開始まで</h2><p style="font-size:3rem;font-weight:900;color:var(--neon-cyan)">5</p>', '', 0);
        let count = 5;
        const cdInterval = setInterval(() => {
          count--;
          if (count > 0) {
            UI.showAlert(`<h2>ゲーム開始まで</h2><p style="font-size:3rem;font-weight:900;color:var(--neon-cyan)">${count}</p>`, '', 0);
            Utils.vibrate([50]);
          } else {
            clearInterval(cdInterval);
            UI.hideAlert();
          }
        }, 1000);
        break;

      case 'gameStart':
        startGameplay(data);
        break;
    }
  }

  // ========== ゲームプレイ ==========
  function startGameplay(roomData) {
    UI.initMap();
    UI.showScreen('game');

    setTimeout(async () => {
      if (UI.getMap()) {
        UI.getMap().invalidateSize();
      }

      const { role, skills, team, gameMode, voiceMode } = GameEngine.init(
        roomData,
        Utils.getPlayerId(),
        RoomManager.getRoomRef(),
        handleGameEvent
      );

      currentSkills = skills;
      currentVoiceMode = voiceMode;
      UI.updateSkillButtons(currentSkills);

      // ロール通知
      let roleText, roleColor;
      if (gameMode === 'team') {
        roleText = role === 'oni' ? '鬼チーム' : '逃走チーム';
        roleColor = role === 'oni' ? 'var(--oni-red)' : 'var(--runner-blue)';
      } else {
        roleText = role === 'oni' ? '鬼' : '逃走者';
        roleColor = role === 'oni' ? 'var(--oni-red)' : 'var(--runner-blue)';
      }
      UI.showAlert(
        `<h2 style="color:${roleColor}">あなたは${roleText}です</h2>
         <p>${role === 'oni' ? '全員を捕まえろ！' : '鬼から逃げ切れ！'}</p>`,
        '', 3000
      );

      // エリア表示
      if (roomData.areaCenter) {
        UI.drawAreaBoundary(roomData.areaCenter, roomData.settings.areaRadius);
      }

      // ゲーム開始
      GameEngine.start(
        roomData.startTime || Date.now(),
        roomData.areaCenter || LocationManager.getPosition() || { lat: 35.6812, lng: 139.7671 }
      );

      // ボイスチャット初期化
      if (voiceMode !== 'off') {
        const voiceTeamOnly = voiceMode === 'team';
        const teams = roomData.teams || {};
        const voiceOk = await VoiceChat.init(
          RoomManager.getRoomRef(),
          Utils.getPlayerId(),
          team,
          teams
        );

        if (voiceOk) {
          if (voiceTeamOnly) {
            VoiceChat.setTeamOnly(true, team, teams);
          }
          UI.showVoiceControl(true);
          document.getElementById('game-menu-voice').style.display = 'block';
          UI.showToast('ボイスチャット接続中...', 'info');
        } else {
          UI.showToast('マイクアクセスが拒否されました', 'error');
        }
      }

      gameActive = true;
    }, 500);
  }

  // ========== ゲームイベント ==========
  function handleGameEvent(event, data, gameState) {
    switch (event) {
      case 'tick':
        updateGameDisplay(gameState);
        break;

      case 'capture':
        UI.showCaptureFlash();
        UI.showToast(`${gameState.players[data.playerId]?.name} を捕獲！`, 'success');
        Utils.vibrate([200, 100, 200]);
        break;

      case 'captured_self':
        UI.showAlert('<h2>捕獲された！</h2><p>ゲーム終了まで観戦モードです</p>', 'captured', 3000);
        Utils.vibrate([500, 200, 500]);
        break;

      case 'shieldBlock':
        UI.showAlert('<h2 style="color:var(--neon-cyan)">シールド発動！</h2><p>捕獲を1回防いだ！</p>', '', 2000);
        Utils.vibrate([50, 50, 50]);
        break;

      case 'skillUsed':
        if (data.skillId === 'scan') {
          UI.showAlert('<h2>SCANNING...</h2><p>全プレイヤーの位置を検出中</p>', 'scan', 2000);
        } else if (data.skillId === 'stealth') {
          UI.showToast('ステルス発動！', 'success');
        } else if (data.skillId === 'decoy') {
          UI.showToast('デコイ展開！', 'success');
        } else if (data.skillId === 'dash') {
          UI.showToast('ダッシュ！捕獲範囲拡大', 'success');
        }
        break;

      case 'shoot':
        UI.showShootEffect();
        if (data && data.hit) {
          UI.showToast(`ヒット！(${data.distance}m) - ${data.effect === 'slow' ? 'スロー' : '位置バレ'}`, 'success');
        }
        break;

      case 'hit_received':
        UI.showHitFlash();
        const effectName = data.effect === 'slow' ? 'スロー' : '位置バレ';
        UI.showToast(`攻撃を受けた！ ${effectName}効果`, 'error');
        break;

      case 'itemPickup':
        UI.showItemPickupEffect(data.itemInfo.iconKey);
        UI.showToast(`${data.itemInfo.name} を入手！`, 'success');
        break;

      case 'itemUsed':
        UI.showToast(`${data.info.name} を使用！`, 'info');
        break;

      case 'trapTriggered':
        UI.showHitFlash();
        UI.showToast('トラップにかかった！スロー効果', 'error');
        Utils.vibrate([200, 100, 200]);
        break;

      case 'safetyWarning':
        UI.showSafetyWarning(data.message);
        break;

      case 'gameEnded':
        gameActive = false;
        LocationManager.stop();
        VoiceChat.cleanup();
        UI.showVoiceControl(false);
        UI.showResult(data);
        // ゲーム終了時にインタースティシャル広告
        AdManager.showInterstitial();
        setTimeout(() => {
          UI.showScreen('result');
        }, 2000);
        break;
    }
  }

  function updateGameDisplay(gameState) {
    UI.updateHUD(gameState);
    UI.updateSkillButtons(currentSkills);

    // スタミナ20%以下でリワードボタン表示（Android時のみ）
    const rewardBtn = document.getElementById('btn-reward-ad');
    if (rewardBtn && AdManager.getPlatform() === 'android') {
      const staPct = SkillSystem.getStaminaPercent();
      rewardBtn.style.display = staPct <= 20 ? 'block' : 'none';
    }

    const myPos = LocationManager.getPosition();
    const myId = Utils.getPlayerId();

    if (myPos) {
      UI.updateMapCenter(myPos.lat, myPos.lng);
    }

    // 各プレイヤーのマーカー更新
    for (const pid in gameState.players) {
      const player = gameState.players[pid];
      const isSelf = pid === myId;
      const position = isSelf ? myPos : player.position;

      if (position) {
        let displayPos = position;
        if (!isSelf && player.velocity > 0.5 && player.lastUpdate) {
          const dt = (Date.now() - player.lastUpdate) / 1000;
          if (dt < 3) {
            displayPos = Utils.predictPosition(position, player.velocity, player.heading, dt * 0.5);
          }
        }

        UI.updatePlayerMarker(pid, displayPos, {
          name: player.name,
          role: player.role,
          isSelf,
          isStealthed: player.stealthActive,
          isCaptured: player.captured,
          team: player.team
        });
      }

      // デコイマーカー
      if (player.decoyPosition && pid !== myId) {
        UI.updatePlayerMarker(pid, player.decoyPosition, {
          name: player.name,
          role: player.role,
          isSelf: false,
          isDecoy: true
        });
      } else {
        UI.removeMarker(pid + '_decoy');
      }
    }

    // アイテムマーカー更新
    UI.updateItemMarkers(ItemSystem.getItems());
    UI.updateTrapMarkers(ItemSystem.getTraps());

    // ミニマップ更新
    if (myPos && gameState.areaCenter) {
      UI.updateMinimap(gameState.players, myPos, gameState.areaCenter, gameState.areaRadius);
    }

    // ボイスチャットUI更新
    if (currentVoiceMode !== 'off' && VoiceChat.getEnabled()) {
      const peerCount = VoiceChat.getConnectedPeers().length;
      UI.updateVoiceUI(VoiceChat.getMuted(), peerCount);
    }
  }

  // ========== スキル・射撃・アイテム ==========
  function handleSkillUse(index) {
    if (!gameActive) return;
    const skillId = currentSkills[index];
    if (!skillId) return;
    const result = GameEngine.useSkill(skillId);
    if (!result) {
      if (ItemSystem.hasEffect('emp_disabled')) {
        UI.showToast('EMP効果でスキル無効化中！', 'error');
      } else {
        UI.showToast('スキルを使用できません', 'error');
      }
    }
  }

  function handleShoot() {
    if (!gameActive) return;
    if (ShootingSystem.getAmmo() <= 0) {
      UI.showToast('弾切れ！リロード中...', 'error');
      return;
    }
    GameEngine.performShoot();
  }

  function handleItemUse(index) {
    if (!gameActive) return;
    const inventory = ItemSystem.getInventory();
    if (index >= inventory.length) {
      UI.showToast('アイテムがありません', 'error');
      return;
    }
    GameEngine.useItem(index);
  }

  async function handleRewardAd() {
    if (!gameActive) return;
    document.getElementById('btn-reward-ad').style.display = 'none';
    UI.showToast('広告を読み込み中...', 'info');
    const rewarded = await AdManager.showRewarded();
    if (rewarded) {
      // スタミナ全回復
      if (typeof SkillSystem !== 'undefined' && SkillSystem.restoreStamina) {
        SkillSystem.restoreStamina();
      }
      UI.showToast('スタミナ全回復！', 'success');
      Utils.vibrate([50, 30, 50]);
    }
  }

  function handleVoiceToggle() {
    if (!VoiceChat.getEnabled()) return;
    const muted = VoiceChat.toggleMute();
    UI.showToast(muted ? 'マイクOFF' : 'マイクON', 'info');
  }

  // ========== ランダムマッチ ==========
  async function handleRandomMatch() {
    const name = document.getElementById('random-player-name').value.trim();
    if (!name) {
      UI.showToast('プレイヤー名を入力してください', 'error');
      return;
    }

    document.getElementById('btn-start-random').style.display = 'none';
    document.getElementById('btn-cancel-random').style.display = 'block';
    document.getElementById('random-search-anim').style.display = 'flex';
    document.getElementById('random-status-text').textContent = '対戦相手を検索中...';

    LocationManager.start();

    RandomMatch.search(name, async (event, data) => {
      switch (event) {
        case 'waiting':
          document.getElementById('random-status-text').textContent = '対戦相手を待っています...';
          document.getElementById('random-player-count').style.display = 'block';
          document.getElementById('random-player-count').textContent = `${data.count}/${data.need}人`;
          break;

        case 'found':
          document.getElementById('random-status-text').textContent = 'マッチング成功！';
          document.getElementById('random-search-anim').style.display = 'none';
          Utils.vibrate([100, 50, 100]);

          // ロビーへ遷移
          document.getElementById('lobby-room-id').textContent = data.roomId;
          document.getElementById('invite-link-area').style.display = 'none';
          document.getElementById('btn-start-game').style.display = data.isHost ? 'block' : 'none';
          document.getElementById('lobby-wait-text').style.display = data.isHost ? 'none' : 'block';

          const room = RoomManager.getRoom();
          if (room) UI.updateLobbyInfo(room);
          UI.showScreen('lobby');
          UI.showToast('マッチング成功！', 'success');
          break;

        case 'error':
          document.getElementById('btn-start-random').style.display = 'block';
          document.getElementById('btn-cancel-random').style.display = 'none';
          document.getElementById('random-search-anim').style.display = 'none';
          document.getElementById('random-status-text').textContent = '対戦相手を検索します';
          document.getElementById('random-player-count').style.display = 'none';
          UI.showToast(data.message || 'マッチングエラー', 'error');
          break;
      }
    });
  }

  // ========== 招待リンク ==========
  function checkInviteLink() {
    const params = new URLSearchParams(location.search);
    const roomId = params.get('room');
    if (roomId) {
      document.getElementById('join-room-id').value = roomId;
      history.replaceState(null, '', location.pathname);
      setTimeout(() => {
        if (FirebaseConfig.isReady()) {
          UI.showScreen('join');
        }
      }, 3000);
    }
  }

  // ========== PWA ==========
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('Service Worker登録失敗:', err);
      });
    }
  }

  function setupInstallPrompt() {
    // PWAインストールプロンプト
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;

      // インストール済みでなければバナー表示
      const banner = document.getElementById('install-banner');
      if (banner && !window.matchMedia('(display-mode: standalone)').matches) {
        setTimeout(() => {
          banner.style.display = 'flex';
        }, 5000); // 5秒後に表示
      }
    });

    // インストールボタン
    const btnInstall = document.getElementById('btn-install');
    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          UI.showToast('アプリをインストールしました', 'success');
        }
        deferredInstallPrompt = null;
        document.getElementById('install-banner').style.display = 'none';
      });
    }

    // 閉じるボタン
    const btnClose = document.getElementById('btn-close-install');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        document.getElementById('install-banner').style.display = 'none';
      });
    }

    // 既にインストール済みの場合
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      document.getElementById('install-banner').style.display = 'none';
    });
  }

  function injectIcons() {
    const map = {
      'icon-create': ['bolt', 20],
      'icon-join': ['link', 20],
      'icon-random': ['random', 20],
      'icon-settings': ['gear', 20],
      'icon-search-anim': ['search', 28],
      'icon-copy': ['copy', 16],
      'icon-lobby-mic': ['mic', 16],
      'icon-shoot': ['crosshair', 28],
      'icon-warning': ['warning', 16],
      'icon-menu': ['menu', 18],
      'voice-btn-icon': ['mic', 20],
      'skill-icon-1': ['stealth', 28],
      'skill-icon-2': ['scan', 28],
    };
    for (const [id, [key, size]] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = Icons.get(key, size);
    }
    // 戻るボタン
    document.querySelectorAll('.icon-back').forEach(el => {
      el.innerHTML = Icons.get('back', 16);
    });
  }

  // 初期化実行
  document.addEventListener('DOMContentLoaded', init);

  return { init };
})();
