// 位置情報管理
const LocationManager = (() => {
  let watchId = null;
  let currentPosition = null;
  let positionHistory = [];
  let velocity = 0;
  let heading = 0;
  let accuracy = 999;
  let lastUpdate = 0;
  let callbacks = [];
  let deviceHeading = null;

  // 加速度センサーデータ
  let acceleration = { x: 0, y: 0, z: 0 };
  let lastAccelMagnitude = 0;

  const MAX_HISTORY = 20;
  const HIGH_ACCURACY = true;

  function start() {
    if (!navigator.geolocation) {
      console.error('Geolocation APIが利用できません');
      return false;
    }

    const options = {
      enableHighAccuracy: Utils.getSetting('highAccuracy', true),
      maximumAge: 1000,
      timeout: 10000
    };

    watchId = navigator.geolocation.watchPosition(
      onPositionUpdate,
      onPositionError,
      options
    );

    // 方位センサー
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', onDeviceOrientation);
    }

    // 加速度センサー
    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', onDeviceMotion);
    }

    return true;
  }

  function stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    window.removeEventListener('deviceorientation', onDeviceOrientation);
    window.removeEventListener('devicemotion', onDeviceMotion);
  }

  function onPositionUpdate(pos) {
    const now = Date.now();
    const newPos = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      timestamp: now
    };

    // 速度計算
    if (currentPosition) {
      const dt = (now - lastUpdate) / 1000;
      if (dt > 0) {
        const dist = Utils.getDistance(
          currentPosition.lat, currentPosition.lng,
          newPos.lat, newPos.lng
        );
        velocity = dist / dt;
        heading = Utils.getBearing(
          currentPosition.lat, currentPosition.lng,
          newPos.lat, newPos.lng
        );
      }
    }

    // GPS heading があればそちらを使用
    if (newPos.heading !== null && !isNaN(newPos.heading)) {
      heading = newPos.heading;
    }

    // GPS speed があればそちらを使用
    if (newPos.speed !== null && !isNaN(newPos.speed) && newPos.speed >= 0) {
      velocity = newPos.speed;
    }

    currentPosition = newPos;
    accuracy = newPos.accuracy;
    lastUpdate = now;

    // 履歴追加
    positionHistory.push({ ...newPos, velocity, heading });
    if (positionHistory.length > MAX_HISTORY) {
      positionHistory.shift();
    }

    // コールバック実行
    callbacks.forEach(cb => cb(newPos, velocity, heading));
  }

  function onPositionError(err) {
    console.warn('位置情報エラー:', err.message);
  }

  function onDeviceOrientation(e) {
    if (e.alpha !== null) {
      deviceHeading = e.alpha;
    }
  }

  function onDeviceMotion(e) {
    if (e.accelerationIncludingGravity) {
      acceleration = {
        x: e.accelerationIncludingGravity.x || 0,
        y: e.accelerationIncludingGravity.y || 0,
        z: e.accelerationIncludingGravity.z || 0
      };
      lastAccelMagnitude = Math.sqrt(
        acceleration.x ** 2 +
        acceleration.y ** 2 +
        acceleration.z ** 2
      );
    }
  }

  function getPosition() {
    return currentPosition;
  }

  function getVelocity() {
    return velocity;
  }

  function getHeading() {
    return deviceHeading !== null ? deviceHeading : heading;
  }

  function getAccuracy() {
    return accuracy;
  }

  function getAcceleration() {
    return lastAccelMagnitude;
  }

  // 予測位置を取得
  function getPredictedPosition(deltaTime = 1) {
    if (!currentPosition) return null;
    return Utils.predictPosition(currentPosition, velocity, heading, deltaTime);
  }

  // 位置データをシリアライズ（Firebase送信用）
  function serialize() {
    if (!currentPosition) return null;
    return {
      lat: currentPosition.lat,
      lng: currentPosition.lng,
      v: Math.round(velocity * 100) / 100,
      h: Math.round(heading),
      a: Math.round(accuracy),
      t: Date.now()
    };
  }

  function onChange(callback) {
    callbacks.push(callback);
  }

  function removeCallback(callback) {
    callbacks = callbacks.filter(cb => cb !== callback);
  }

  return {
    start, stop, getPosition, getVelocity, getHeading,
    getAccuracy, getAcceleration, getPredictedPosition,
    serialize, onChange, removeCallback
  };
})();
