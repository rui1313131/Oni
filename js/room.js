// ルーム管理
const RoomManager = (() => {
  let currentRoom = null;
  let roomRef = null;
  let playerId = null;
  let isHost = false;
  let onRoomEvent = null;

  function setCallback(callback) {
    onRoomEvent = callback;
  }

  async function createRoom(playerName, roomName, password, timeLimit, areaRadius, gameMode, oniCount, maxPlayers, voiceMode) {
    if (!FirebaseConfig.isReady()) {
      throw new Error('Firebase未設定');
    }

    playerId = Utils.getPlayerId();
    const roomId = Utils.generateId(6);
    const db = FirebaseConfig.getDB();
    roomRef = db.ref('rooms/' + roomId);

    const roomData = {
      id: roomId,
      name: roomName || 'Room ' + roomId,
      hostId: playerId,
      password: password ? Utils.simpleHash(password) : null,
      settings: {
        timeLimit: parseInt(timeLimit) || 300,
        areaRadius: parseInt(areaRadius) || 200,
        maxPlayers: parseInt(maxPlayers) || 4,
        gameMode: gameMode || 'classic',   // 'classic' or 'team'
        oniCount: parseInt(oniCount) || 1, // チーム戦の鬼人数
        voiceMode: voiceMode || 'off'      // 'off', 'proximity', 'team', 'all'
      },
      players: {
        [playerId]: {
          name: playerName,
          joinedAt: Date.now(),
          ready: false
        }
      },
      status: 'waiting',
      createdAt: Date.now()
    };

    await roomRef.set(roomData);

    currentRoom = roomData;
    isHost = true;

    roomRef.child('players/' + playerId).onDisconnect().remove();
    listenRoom();

    return roomData;
  }

  async function joinRoom(playerName, roomId, password) {
    if (!FirebaseConfig.isReady()) {
      throw new Error('Firebase未設定');
    }

    playerId = Utils.getPlayerId();
    const db = FirebaseConfig.getDB();
    roomRef = db.ref('rooms/' + roomId);

    const snapshot = await roomRef.once('value');
    const roomData = snapshot.val();

    if (!roomData) {
      throw new Error('ルームが見つかりません');
    }

    if (roomData.status !== 'waiting') {
      throw new Error('ゲーム中のため参加できません');
    }

    if (roomData.password) {
      if (!password || Utils.simpleHash(password) !== roomData.password) {
        throw new Error('パスワードが違います');
      }
    }

    const playerCount = roomData.players ? Object.keys(roomData.players).length : 0;
    const maxP = roomData.settings.maxPlayers || 4;
    if (playerCount >= maxP) {
      throw new Error('ルームが満員です');
    }

    await roomRef.child('players/' + playerId).set({
      name: playerName,
      joinedAt: Date.now(),
      ready: false
    });

    roomRef.child('players/' + playerId).onDisconnect().remove();

    currentRoom = { ...roomData, players: { ...roomData.players, [playerId]: { name: playerName } } };
    isHost = roomData.hostId === playerId;

    listenRoom();

    return currentRoom;
  }

  function listenRoom() {
    if (!roomRef) return;

    roomRef.child('players').on('value', snapshot => {
      const players = snapshot.val() || {};
      if (currentRoom) {
        currentRoom.players = players;
      }
      emit('playersChanged', players);
    });

    roomRef.child('status').on('value', snapshot => {
      const status = snapshot.val();
      if (currentRoom) {
        currentRoom.status = status;
      }

      if (status === 'countdown') {
        emit('countdown');
      } else if (status === 'playing') {
        roomRef.once('value').then(snap => {
          emit('gameStart', snap.val());
        });
      }
    });
  }

  async function startGame() {
    if (!isHost || !roomRef) return;

    const snapshot = await roomRef.once('value');
    const roomData = snapshot.val();
    const playerIds = Object.keys(roomData.players);
    const mode = roomData.settings.gameMode || 'classic';

    if (playerIds.length < 2) {
      throw new Error('最低2人必要です');
    }

    let teams = {};

    if (mode === 'team') {
      // チーム戦：鬼チームと逃走チームに分ける
      const oniCount = Math.min(
        roomData.settings.oniCount || 1,
        playerIds.length - 1
      );

      // シャッフル
      const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
      const oniTeam = shuffled.slice(0, oniCount);
      const runnerTeam = shuffled.slice(oniCount);

      oniTeam.forEach(pid => { teams[pid] = 'oni'; });
      runnerTeam.forEach(pid => { teams[pid] = 'runner'; });

      const pos = LocationManager.getPosition();
      const areaCenter = pos ? { lat: pos.lat, lng: pos.lng } : { lat: 35.6812, lng: 139.7671 };

      await roomRef.update({
        teams: teams,
        oniId: oniTeam[0], // 互換性のためメインの鬼ID
        areaCenter: areaCenter,
        startTime: Date.now() + 5000,
        status: 'countdown'
      });
    } else {
      // クラシック：ランダムに1人鬼
      const oniId = playerIds[Math.floor(Math.random() * playerIds.length)];
      playerIds.forEach(pid => {
        teams[pid] = pid === oniId ? 'oni' : 'runner';
      });

      const pos = LocationManager.getPosition();
      const areaCenter = pos ? { lat: pos.lat, lng: pos.lng } : { lat: 35.6812, lng: 139.7671 };

      await roomRef.update({
        teams: teams,
        oniId: oniId,
        areaCenter: areaCenter,
        startTime: Date.now() + 5000,
        status: 'countdown'
      });
    }

    setTimeout(async () => {
      await roomRef.child('status').set('playing');
    }, 5000);
  }

  async function leaveRoom() {
    if (!roomRef || !playerId) return;

    await roomRef.child('players/' + playerId).remove();

    if (isHost) {
      const snapshot = await roomRef.child('players').once('value');
      const remaining = snapshot.val();
      if (!remaining || Object.keys(remaining).length === 0) {
        await roomRef.remove();
      } else {
        const newHostId = Object.keys(remaining)[0];
        await roomRef.child('hostId').set(newHostId);
      }
    }

    roomRef.off();
    currentRoom = null;
    roomRef = null;
    isHost = false;
  }

  function getRoom() {
    return currentRoom;
  }

  function getRoomRef() {
    return roomRef;
  }

  function getPlayerId() {
    return playerId;
  }

  function getIsHost() {
    return isHost;
  }

  function emit(event, data) {
    if (onRoomEvent) {
      onRoomEvent(event, data);
    }
  }

  return {
    setCallback, createRoom, joinRoom, startGame,
    leaveRoom, getRoom, getRoomRef, getPlayerId, getIsHost
  };
})();
