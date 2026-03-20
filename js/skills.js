// スキルシステム
const SkillSystem = (() => {
  const SKILLS = {
    stealth: {
      name: 'ステルス',
      iconKey: 'stealth',
      description: '一定時間、他プレイヤーのマップから消える',
      duration: 8000,      // 8秒
      cooldown: 30000,     // 30秒
      staminaCost: 30,
      forRoles: ['runner']
    },
    scan: {
      name: 'スキャン',
      iconKey: 'scan',
      description: '全プレイヤーの位置を数秒間表示',
      duration: 5000,      // 5秒
      cooldown: 25000,     // 25秒
      staminaCost: 25,
      forRoles: ['oni', 'runner']
    },
    decoy: {
      name: 'デコイ',
      iconKey: 'decoy',
      description: '偽の位置信号を生成',
      duration: 10000,     // 10秒
      cooldown: 35000,     // 35秒
      staminaCost: 20,
      forRoles: ['runner']
    },
    dash: {
      name: 'ダッシュ',
      iconKey: 'dash',
      description: '捕獲判定範囲を一時的に拡大',
      duration: 5000,      // 5秒
      cooldown: 20000,     // 20秒
      staminaCost: 35,
      forRoles: ['oni']
    }
  };

  let activeSkills = {};   // { skillId: { endTime, ... } }
  let cooldowns = {};      // { skillId: endTime }
  let playerRole = 'runner';
  let stamina = 100;
  const MAX_STAMINA = 100;
  const STAMINA_REGEN = 3;  // per second
  let lastStaminaTick = 0;

  // 現在のロールに基づいたスキル設定を取得
  function getSkillsForRole(role) {
    playerRole = role;
    if (role === 'oni') {
      return ['scan', 'dash'];
    } else {
      return ['stealth', 'scan'];
    }
  }

  function getSkillInfo(skillId) {
    return SKILLS[skillId] || null;
  }

  function canUseSkill(skillId) {
    const skill = SKILLS[skillId];
    if (!skill) return false;
    if (!skill.forRoles.includes(playerRole)) return false;
    if (cooldowns[skillId] && Date.now() < cooldowns[skillId]) return false;
    if (stamina < skill.staminaCost) return false;
    return true;
  }

  function useSkill(skillId) {
    if (!canUseSkill(skillId)) return null;

    const skill = SKILLS[skillId];
    const now = Date.now();

    // スタミナ消費
    stamina -= skill.staminaCost;

    // アクティブスキルとして登録
    activeSkills[skillId] = {
      endTime: now + skill.duration,
      startTime: now
    };

    // クールタイム設定
    cooldowns[skillId] = now + skill.cooldown;

    return {
      skillId,
      duration: skill.duration,
      endTime: activeSkills[skillId].endTime,
      cooldownEnd: cooldowns[skillId]
    };
  }

  function isActive(skillId) {
    if (!activeSkills[skillId]) return false;
    if (Date.now() > activeSkills[skillId].endTime) {
      delete activeSkills[skillId];
      return false;
    }
    return true;
  }

  function getCooldownRemaining(skillId) {
    if (!cooldowns[skillId]) return 0;
    const remaining = cooldowns[skillId] - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  function getActiveSkills() {
    // 期限切れを削除
    const now = Date.now();
    for (const id in activeSkills) {
      if (now > activeSkills[id].endTime) {
        delete activeSkills[id];
      }
    }
    return { ...activeSkills };
  }

  // スタミナ更新
  function updateStamina() {
    const now = Date.now();
    if (lastStaminaTick === 0) {
      lastStaminaTick = now;
      return stamina;
    }

    const dt = (now - lastStaminaTick) / 1000;
    lastStaminaTick = now;

    // 移動速度に応じて消費
    const velocity = LocationManager.getVelocity();
    if (velocity > 3) { // 走っている場合
      stamina -= dt * 5 * (velocity / 5);
    } else {
      stamina += dt * STAMINA_REGEN;
    }

    stamina = Math.max(0, Math.min(MAX_STAMINA, stamina));
    return stamina;
  }

  function getStamina() {
    return stamina;
  }

  function getStaminaPercent() {
    return (stamina / MAX_STAMINA) * 100;
  }

  function reset() {
    activeSkills = {};
    cooldowns = {};
    stamina = MAX_STAMINA;
    lastStaminaTick = 0;
  }

  // デコイの位置を生成（現在位置の近くにランダム）
  function generateDecoyPosition(playerPos) {
    if (!playerPos) return null;
    const offsetLat = (Math.random() - 0.5) * 0.0008; // ~40m
    const offsetLng = (Math.random() - 0.5) * 0.0008;
    return {
      lat: playerPos.lat + offsetLat,
      lng: playerPos.lng + offsetLng
    };
  }

  return {
    SKILLS, getSkillsForRole, getSkillInfo, canUseSkill,
    useSkill, isActive, getCooldownRemaining, getActiveSkills,
    updateStamina, getStamina, getStaminaPercent, reset,
    generateDecoyPosition
  };
})();
