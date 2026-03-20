// ユーティリティ関数
const Utils = (() => {
  // ランダムID生成
  function generateId(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  // プレイヤーID（Firebase Auth UID優先）
  function getPlayerId() {
    // Firebase Auth UIDがあればそれを使う（セキュリティルール対応）
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      return firebase.auth().currentUser.uid;
    }
    // フォールバック（認証前）
    let id = localStorage.getItem('oni_player_id');
    if (!id) {
      id = 'P_' + generateId(10) + '_' + Date.now().toString(36);
      localStorage.setItem('oni_player_id', id);
    }
    return id;
  }

  // 2点間の距離（メートル）- Haversine formula
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function toRad(deg) {
    return deg * Math.PI / 180;
  }

  // 方位角計算（度）
  function getBearing(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function toDeg(rad) {
    return rad * 180 / Math.PI;
  }

  // 線形補間
  function lerp(a, b, t) {
    return a + (b - a) * Math.min(1, Math.max(0, t));
  }

  // 座標の線形補間
  function lerpLatLng(pos1, pos2, t) {
    return {
      lat: lerp(pos1.lat, pos2.lat, t),
      lng: lerp(pos1.lng, pos2.lng, t)
    };
  }

  // 位置予測（速度と方向から）
  function predictPosition(pos, velocity, heading, deltaTime) {
    if (!velocity || velocity < 0.5) return pos;
    const distance = velocity * deltaTime;
    const headingRad = toRad(heading);
    const dLat = (distance * Math.cos(headingRad)) / 111320;
    const dLng = (distance * Math.sin(headingRad)) / (111320 * Math.cos(toRad(pos.lat)));
    return {
      lat: pos.lat + dLat,
      lng: pos.lng + dLng
    };
  }

  // 時間フォーマット（mm:ss）
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // タイムスタンプ
  function now() {
    return Date.now();
  }

  // バイブレーション
  function vibrate(pattern) {
    if (navigator.vibrate && getSetting('vibration', true)) {
      navigator.vibrate(pattern);
    }
  }

  // 設定取得
  function getSetting(key, defaultValue) {
    try {
      const val = localStorage.getItem('oni_setting_' + key);
      if (val === null) return defaultValue;
      return JSON.parse(val);
    } catch {
      return defaultValue;
    }
  }

  // 設定保存
  function setSetting(key, value) {
    localStorage.setItem('oni_setting_' + key, JSON.stringify(value));
  }

  // 夜間チェック
  function isNightTime() {
    const hour = new Date().getHours();
    return hour >= 21 || hour < 6;
  }

  // 簡易ハッシュ（パスワード用）
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  // 入力サニタイズ（XSS防止）
  function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .trim();
  }

  // プレイヤー名バリデーション
  function validatePlayerName(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 12) return false;
    // スクリプトタグや危険な文字を拒否
    if (/<|>|&|"|'|\//.test(trimmed)) return false;
    return true;
  }

  return {
    generateId, getPlayerId, getDistance, getBearing,
    lerp, lerpLatLng, predictPosition, formatTime, now,
    vibrate, getSetting, setSetting, isNightTime, simpleHash,
    sanitize, validatePlayerName
  };
})();
