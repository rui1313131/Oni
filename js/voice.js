// ボイスチャット（WebRTC P2P + Firebase Signaling）
const VoiceChat = (() => {
  let localStream = null;
  let peers = {};           // { peerId: RTCPeerConnection }
  let audioElements = {};   // { peerId: HTMLAudioElement }
  let roomRef = null;
  let myId = null;
  let isEnabled = false;
  let isMuted = false;
  let teamOnly = false;     // チーム戦時、チーム内のみ通話
  let myTeam = null;
  let playerTeams = {};     // { playerId: team }

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ];

  async function init(dbRef, playerId, team, teams) {
    roomRef = dbRef;
    myId = playerId;
    myTeam = team;
    playerTeams = teams || {};

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      isEnabled = true;
      console.log('マイクアクセス取得');
    } catch (err) {
      console.warn('マイクアクセス拒否:', err);
      isEnabled = false;
      return false;
    }

    // シグナリング監視
    listenSignaling();

    // 自分の存在を通知
    if (roomRef) {
      roomRef.child('voiceReady/' + myId).set({
        team: myTeam,
        timestamp: Date.now()
      });
      roomRef.child('voiceReady/' + myId).onDisconnect().remove();
    }

    return true;
  }

  function listenSignaling() {
    if (!roomRef) return;

    // 新しいプレイヤーがvoiceに参加した時
    roomRef.child('voiceReady').on('child_added', snapshot => {
      const peerId = snapshot.key;
      if (peerId === myId) return;

      const data = snapshot.val();

      // チームモードで別チームならスキップ
      if (teamOnly && myTeam && data.team && data.team !== myTeam) return;

      // 自分のIDが小さい方がoffer側（衝突回避）
      if (myId < peerId) {
        createOffer(peerId);
      }
    });

    // プレイヤー離脱時
    roomRef.child('voiceReady').on('child_removed', snapshot => {
      const peerId = snapshot.key;
      closePeer(peerId);
    });

    // Offer受信
    roomRef.child('voiceSignal/' + myId + '/offers').on('child_added', async snapshot => {
      const data = snapshot.val();
      if (!data) return;
      const fromId = data.from;

      // チームモードチェック
      if (teamOnly && myTeam && playerTeams[fromId] && playerTeams[fromId] !== myTeam) return;

      await handleOffer(fromId, data.sdp);
      snapshot.ref.remove(); // 処理済みを削除
    });

    // Answer受信
    roomRef.child('voiceSignal/' + myId + '/answers').on('child_added', async snapshot => {
      const data = snapshot.val();
      if (!data) return;
      const fromId = data.from;

      await handleAnswer(fromId, data.sdp);
      snapshot.ref.remove();
    });

    // ICE Candidate受信
    roomRef.child('voiceSignal/' + myId + '/candidates').on('child_added', async snapshot => {
      const data = snapshot.val();
      if (!data) return;
      const fromId = data.from;

      await handleCandidate(fromId, data.candidate);
      snapshot.ref.remove();
    });
  }

  function createPeerConnection(peerId) {
    if (peers[peerId]) {
      peers[peerId].close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[peerId] = pc;

    // ローカルストリームのトラックを追加
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // ICE Candidate
    pc.onicecandidate = event => {
      if (event.candidate && roomRef) {
        roomRef.child('voiceSignal/' + peerId + '/candidates').push({
          from: myId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    // リモートストリーム受信
    pc.ontrack = event => {
      const remoteStream = event.streams[0];
      if (!audioElements[peerId]) {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.id = 'voice-audio-' + peerId;
        document.body.appendChild(audio);
        audioElements[peerId] = audio;
      }
      audioElements[peerId].srcObject = remoteStream;
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        closePeer(peerId);
      }
    };

    return pc;
  }

  async function createOffer(peerId) {
    const pc = createPeerConnection(peerId);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (roomRef) {
        roomRef.child('voiceSignal/' + peerId + '/offers').push({
          from: myId,
          sdp: pc.localDescription.toJSON()
        });
      }
    } catch (err) {
      console.error('Offer作成エラー:', err);
    }
  }

  async function handleOffer(fromId, sdp) {
    const pc = createPeerConnection(fromId);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (roomRef) {
        roomRef.child('voiceSignal/' + fromId + '/answers').push({
          from: myId,
          sdp: pc.localDescription.toJSON()
        });
      }
    } catch (err) {
      console.error('Answer作成エラー:', err);
    }
  }

  async function handleAnswer(fromId, sdp) {
    const pc = peers[fromId];
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.error('Answer処理エラー:', err);
    }
  }

  async function handleCandidate(fromId, candidateData) {
    const pc = peers[fromId];
    if (!pc) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidateData));
    } catch (err) {
      console.error('ICE Candidate追加エラー:', err);
    }
  }

  function closePeer(peerId) {
    if (peers[peerId]) {
      peers[peerId].close();
      delete peers[peerId];
    }
    if (audioElements[peerId]) {
      audioElements[peerId].srcObject = null;
      audioElements[peerId].remove();
      delete audioElements[peerId];
    }
  }

  // ミュート切替
  function toggleMute() {
    if (!localStream) return false;

    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });
    return isMuted;
  }

  function getMuted() {
    return isMuted;
  }

  function getEnabled() {
    return isEnabled;
  }

  function getConnectedPeers() {
    return Object.keys(peers).filter(id => {
      const pc = peers[id];
      return pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected');
    });
  }

  // チームモード設定
  function setTeamOnly(enabled, team, teams) {
    teamOnly = enabled;
    myTeam = team;
    playerTeams = teams || {};
  }

  // 距離に基づく音量調整（近距離チャット）
  function updateProximityVolume(players, myPos) {
    if (!myPos) return;

    for (const peerId in audioElements) {
      const player = players[peerId];
      if (!player || !player.position) {
        audioElements[peerId].volume = 0.5;
        continue;
      }

      const dist = Utils.getDistance(
        myPos.lat, myPos.lng,
        player.position.lat, player.position.lng
      );

      // 50m以内は最大音量、200m超えたら無音
      let volume;
      if (dist <= 50) {
        volume = 1.0;
      } else if (dist >= 200) {
        volume = 0.0;
      } else {
        volume = 1.0 - (dist - 50) / 150;
      }

      audioElements[peerId].volume = Math.max(0, Math.min(1, volume));
    }
  }

  function cleanup() {
    // 全ピア接続を閉じる
    for (const peerId in peers) {
      closePeer(peerId);
    }

    // ローカルストリーム停止
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }

    // Firebase上の自分の情報を削除
    if (roomRef && myId) {
      roomRef.child('voiceReady/' + myId).remove();
      roomRef.child('voiceSignal/' + myId).remove();
    }

    // Firebaseリスナー解除
    if (roomRef) {
      roomRef.child('voiceReady').off();
      roomRef.child('voiceSignal/' + myId + '/offers').off();
      roomRef.child('voiceSignal/' + myId + '/answers').off();
      roomRef.child('voiceSignal/' + myId + '/candidates').off();
    }

    peers = {};
    audioElements = {};
    isEnabled = false;
    isMuted = false;
  }

  return {
    init, toggleMute, getMuted, getEnabled,
    getConnectedPeers, setTeamOnly, updateProximityVolume,
    cleanup
  };
})();
