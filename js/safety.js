// 安全機能
const SafetySystem = (() => {
  let areaCenter = null;
  let areaRadius = 200; // メートル
  let warningCallback = null;
  let lastSpeedWarning = 0;

  const SPEED_WARNING_THRESHOLD = 8; // m/s (~29km/h) 自転車以上
  const SPEED_WARNING_INTERVAL = 10000; // 10秒間隔
  const AREA_WARNING_THRESHOLD = 0.85; // エリアの85%で警告

  function init(center, radius, onWarning) {
    areaCenter = center;
    areaRadius = radius;
    warningCallback = onWarning;
  }

  function check(position, velocity) {
    if (!position || !areaCenter) return;

    // エリア外チェック
    const distFromCenter = Utils.getDistance(
      position.lat, position.lng,
      areaCenter.lat, areaCenter.lng
    );

    const ratio = distFromCenter / areaRadius;

    if (ratio > 1) {
      warn('area_out', 'エリア外です！戻ってください');
    } else if (ratio > AREA_WARNING_THRESHOLD) {
      warn('area_near', 'エリア境界に近づいています');
    }

    // 速度チェック（急加速＝車に乗っている可能性）
    const now = Date.now();
    if (velocity > SPEED_WARNING_THRESHOLD && (now - lastSpeedWarning) > SPEED_WARNING_INTERVAL) {
      lastSpeedWarning = now;
      warn('speed', '速度が速すぎます！安全に注意してください');
    }

    // 加速度チェック
    const accel = LocationManager.getAcceleration();
    if (accel > 25) { // 急激な加速
      warn('accel', '急な動きを検知しました。安全に注意！');
    }

    return {
      distFromCenter,
      ratio,
      isOutside: ratio > 1,
      isNearBorder: ratio > AREA_WARNING_THRESHOLD
    };
  }

  function warn(type, message) {
    if (warningCallback) {
      warningCallback(type, message);
    }
  }

  // 夜間制限チェック
  function checkNightRestriction() {
    if (Utils.getSetting('nightMode', false) && Utils.isNightTime()) {
      return {
        restricted: true,
        message: '夜間モード: 21時〜6時はプレイが制限されています'
      };
    }
    return { restricted: false };
  }

  function getAreaCenter() {
    return areaCenter;
  }

  function getAreaRadius() {
    return areaRadius;
  }

  function isInsideArea(position) {
    if (!areaCenter || !position) return true;
    const dist = Utils.getDistance(
      position.lat, position.lng,
      areaCenter.lat, areaCenter.lng
    );
    return dist <= areaRadius;
  }

  return {
    init, check, checkNightRestriction,
    getAreaCenter, getAreaRadius, isInsideArea
  };
})();
