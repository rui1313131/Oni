// 射撃システム
const ShootingSystem = (() => {
  const MAX_AMMO = 3;
  const SHOOT_RANGE = 50;       // 50m射程
  const RELOAD_TIME = 15000;    // 15秒でリロード
  const SLOW_DURATION = 5000;   // スロー効果5秒
  const REVEAL_DURATION = 8000; // 位置バレ効果8秒

  let ammo = MAX_AMMO;
  let lastReloadTime = 0;
  let effects = {};  // { playerId: { type, endTime } }

  function shoot(shooterPos, targets) {
    if (ammo <= 0) return null;
    ammo--;

    if (ammo < MAX_AMMO && lastReloadTime === 0) {
      lastReloadTime = Date.now();
      scheduleReload();
    }

    // 最も近いターゲットを探す
    let closestTarget = null;
    let closestDist = Infinity;

    for (const target of targets) {
      if (!target.position) continue;
      const dist = Utils.getDistance(
        shooterPos.lat, shooterPos.lng,
        target.position.lat, target.position.lng
      );
      if (dist < SHOOT_RANGE && dist < closestDist) {
        closestDist = dist;
        closestTarget = target;
      }
    }

    if (closestTarget) {
      // ヒット！
      const effectType = Math.random() > 0.5 ? 'slow' : 'reveal';
      const duration = effectType === 'slow' ? SLOW_DURATION : REVEAL_DURATION;

      return {
        hit: true,
        targetId: closestTarget.id,
        effect: effectType,
        duration: duration,
        distance: Math.round(closestDist)
      };
    }

    return { hit: false };
  }

  function scheduleReload() {
    setTimeout(() => {
      if (ammo < MAX_AMMO) {
        ammo++;
        lastReloadTime = Date.now();
        if (ammo < MAX_AMMO) {
          scheduleReload();
        } else {
          lastReloadTime = 0;
        }
      }
    }, RELOAD_TIME);
  }

  function applyEffect(playerId, effectType, duration) {
    effects[playerId] = {
      type: effectType,
      endTime: Date.now() + duration
    };
  }

  function getEffect(playerId) {
    if (!effects[playerId]) return null;
    if (Date.now() > effects[playerId].endTime) {
      delete effects[playerId];
      return null;
    }
    return effects[playerId];
  }

  function hasEffect(playerId, effectType) {
    const effect = getEffect(playerId);
    return effect !== null && effect.type === effectType;
  }

  function getAmmo() {
    return ammo;
  }

  function reset() {
    ammo = MAX_AMMO;
    lastReloadTime = 0;
    effects = {};
  }

  return {
    shoot, applyEffect, getEffect, hasEffect,
    getAmmo, reset, SHOOT_RANGE, MAX_AMMO
  };
})();
