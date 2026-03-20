// ランダムマッチシステム
const RandomMatch = (() => {
  let matchRef = null;
  let myEntryRef = null;
  let queueListener = null;
  let myStatusListener = null;
  let matchTimer = null;
  let callback = null;
  let isSearching = false;
  let myPlayerId = null;
  let myPlayerName = '';

  const MATCH_TIMEOUT = 60000;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 4;

  async function search(playerName, cb) {
    if (!FirebaseConfig.isReady()) return;
    if (isSearching) return;

    callback = cb;
    isSearching = true;
    myPlayerId = Utils.getPlayerId();
    myPlayerName = playerName;

    const db = FirebaseConfig.getDB();
    matchRef = db.ref('matchmaking');
    myEntryRef = matchRef.child(myPlayerId);

    // 古いエントリを掃除（30秒以上前のものを削除）
    const snapshot = await matchRef.once('value');
    const queue = snapshot.val() || {};
    const now = Date.now();
    const cleanups = {};
    for (const [pid, data] of Object.entries(queue)) {
      if (now - data.joinedAt > MATCH_TIMEOUT + 10000) {
        cleanups[pid] = null;
      }
    }
    if (Object.keys(cleanups).length > 0) {
      await matchRef.update(cleanups);
    }

    // 自分をキューに追加
    await myEntryRef.set({
      name: playerName,
      joinedAt: Date.now(),
      status: 'waiting'
    });
    myEntryRef.onDisconnect().remove();

    // 自分のステータス監視（matchedになったらルーム参加）
    myStatusListener = myEntryRef.on('value', snap => {
      const data = snap.val();
      if (!data) return;
      if (data.status === 'matched' && data.roomId) {
        joinMatchedRoom(data.roomId);
      }
    });

    // キュー全体を監視（ホスト判定用）
    queueListener = matchRef.on('value', snap => {
      const queue = snap.val() || {};
      const waiting = Object.entries(queue)
        .filter(([id, d]) => d.status === 'waiting')
        .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

      if (callback) {
        callback('waiting', { count: waiting.length, need: MIN_PLAYERS });
      }

      // 最低人数が揃い、自分が最古参（ホスト役）
      if (waiting.length >= MIN_PLAYERS && waiting[0][0] === myPlayerId) {
        const matchPlayers = waiting.slice(0, MAX_PLAYERS);
        createMatchRoom(matchPlayers);
      }
    });

    // タイムアウト
    matchTimer = setTimeout(() => {
      if (isSearching) {
        cleanup();
        if (callback) callback('error', { message: 'タイムアウト — 対戦相手が見つかりませんでした' });
      }
    }, MATCH_TIMEOUT);
  }

  async function createMatchRoom(players) {
    // 二重作成防止
    if (!isSearching) return;
    const db = FirebaseConfig.getDB();

    // まず全員のステータスをmatchingに変更（他のホスト候補が作成しないよう）
    const lockUpdates = {};
    players.forEach(([pid]) => { lockUpdates[pid + '/status'] = 'matching'; });
    await matchRef.update(lockUpdates);

    // ルーム作成
    const roomId = 'RM' + Utils.generateId(5);
    const roomRef = db.ref('rooms/' + roomId);

    const playersData = {};
    players.forEach(([pid, data]) => {
      playersData[pid] = {
        name: data.name,
        joinedAt: Date.now(),
        ready: false
      };
    });

    await roomRef.set({
      id: roomId,
      name: 'ランダムマッチ',
      hostId: myPlayerId,
      password: null,
      settings: {
        timeLimit: 300,
        areaRadius: 200,
        maxPlayers: MAX_PLAYERS,
        gameMode: 'classic',
        oniCount: 1,
        voiceMode: 'proximity'
      },
      players: playersData,
      status: 'waiting',
      createdAt: Date.now(),
      isRandomMatch: true
    });

    // 全プレイヤーにルームIDを通知
    const matchUpdates = {};
    players.forEach(([pid]) => {
      matchUpdates[pid + '/status'] = 'matched';
      matchUpdates[pid + '/roomId'] = roomId;
    });
    await matchRef.update(matchUpdates);
  }

  async function joinMatchedRoom(roomId) {
    if (!isSearching) return;

    // リスナーを先に外す（二重呼び出し防止）
    stopListeners();

    try {
      // ホストの場合はcreateRoomではなくjoinRoom
      const room = await RoomManager.joinRoom(myPlayerName, roomId, '');

      // キューから削除
      if (myEntryRef) {
        myEntryRef.onDisconnect().cancel();
        myEntryRef.remove();
      }

      isSearching = false;
      if (matchTimer) { clearTimeout(matchTimer); matchTimer = null; }

      if (callback) {
        callback('found', {
          roomId: roomId,
          isHost: RoomManager.getIsHost()
        });
      }
    } catch (e) {
      // joinに失敗した場合（既に満員等）
      if (callback) callback('error', { message: e.message });
      cleanup();
    }
  }

  function stopListeners() {
    if (queueListener && matchRef) {
      matchRef.off('value', queueListener);
      queueListener = null;
    }
    if (myStatusListener && myEntryRef) {
      myEntryRef.off('value', myStatusListener);
      myStatusListener = null;
    }
  }

  function cancel() {
    cleanup();
  }

  function cleanup() {
    stopListeners();
    if (matchTimer) { clearTimeout(matchTimer); matchTimer = null; }
    if (myEntryRef) {
      myEntryRef.remove();
      myEntryRef.onDisconnect().cancel();
      myEntryRef = null;
    }
    isSearching = false;
  }

  return { search, cancel, cleanup };
})();
