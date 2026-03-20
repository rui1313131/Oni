// アイテムシステム
const ItemSystem = (() => {
  // アイテム定義
  const ITEM_TYPES = {
    speed_boost: {
      name: 'スピードブースト',
      iconKey: 'item_speed',
      color: '#ffee00',
      description: '移動速度を10秒間強化（捕獲半径がわずかに拡大）',
      duration: 10000,
      rarity: 'common',
      effect: (playerId, gameState) => {
        return { type: 'speed_boost', duration: 10000 };
      }
    },
    shield: {
      name: 'シールド',
      iconKey: 'item_shield',
      color: '#00f0ff',
      description: '1回だけ捕獲を無効化',
      duration: 20000,
      rarity: 'rare',
      effect: (playerId, gameState) => {
        return { type: 'shield', duration: 20000, charges: 1 };
      }
    },
    trap: {
      name: 'トラップ',
      iconKey: 'item_trap',
      color: '#ff00aa',
      description: '設置型。踏んだプレイヤーを3秒間スロー',
      duration: 60000,
      rarity: 'common',
      effect: (playerId, gameState) => {
        return { type: 'trap', slowDuration: 3000 };
      }
    },
    emp: {
      name: 'EMP',
      iconKey: 'item_emp',
      color: '#aa44ff',
      description: '半径30m内の敵のスキルを10秒間無効化',
      duration: 0,
      rarity: 'rare',
      effect: (playerId, gameState) => {
        return { type: 'emp', radius: 30, disableDuration: 10000 };
      }
    },
    radar: {
      name: 'レーダー',
      iconKey: 'item_radar',
      color: '#00ff88',
      description: '15秒間、全プレイヤーの位置を表示',
      duration: 15000,
      rarity: 'uncommon',
      effect: (playerId, gameState) => {
        return { type: 'radar', duration: 15000 };
      }
    },
    stamina_pack: {
      name: 'スタミナパック',
      iconKey: 'item_stamina',
      color: '#00ff88',
      description: 'スタミナを全回復',
      duration: 0,
      rarity: 'common',
      effect: (playerId, gameState) => {
        return { type: 'stamina_pack' };
      }
    },
    swap: {
      name: 'スワップ',
      iconKey: 'item_swap',
      color: '#ffee00',
      description: '最も近い敵と位置を入れ替える',
      duration: 0,
      rarity: 'legendary',
      effect: (playerId, gameState) => {
        return { type: 'swap' };
      }
    },
    invisibility: {
      name: '完全透明化',
      iconKey: 'item_invis',
      color: '#8888aa',
      description: '5秒間完全に不可視（ステルスより強力）',
      duration: 5000,
      rarity: 'legendary',
      effect: (playerId, gameState) => {
        return { type: 'invisibility', duration: 5000 };
      }
    }
  };

  // レアリティごとのスポーン重み
  const RARITY_WEIGHTS = {
    common: 50,
    uncommon: 30,
    rare: 15,
    legendary: 5
  };

  // スポーン設定
  const SPAWN_INTERVAL = 20000;     // 20秒間隔でスポーン
  const MAX_ITEMS_ON_MAP = 8;       // マップ上の最大アイテム数
  const PICKUP_RADIUS = 8;          // 拾得半径（メートル）
  const MAX_INVENTORY = 2;          // 最大所持数

  let items = {};                   // マップ上のアイテム { id: { type, position, spawnedAt } }
  let inventory = [];               // 自分の所持品 [{ type, pickedAt }]
  let activeEffects = {};           // 発動中の効果 { effectType: { endTime, ... } }
  let placedTraps = {};             // 設置されたトラップ { id: { position, ownerId } }
  let spawnTimer = null;
  let roomRef = null;
  let areaCenter = null;
  let areaRadius = 200;
  let isHost = false;

  function init(dbRef, center, radius, host) {
    roomRef = dbRef;
    areaCenter = center;
    areaRadius = radius;
    isHost = host;
    items = {};
    inventory = [];
    activeEffects = {};
    placedTraps = {};

    // Firebaseリスナー
    listenForItems();

    // ホストだけがスポーンを管理
    if (isHost) {
      spawnTimer = setInterval(spawnItem, SPAWN_INTERVAL);
      // 初期スポーン（3個）
      for (let i = 0; i < 3; i++) {
        setTimeout(() => spawnItem(), i * 1000);
      }
    }
  }

  function listenForItems() {
    if (!roomRef) return;

    // アイテムの出現と消失を監視
    roomRef.child('items').on('value', snapshot => {
      const data = snapshot.val() || {};
      items = {};
      for (const id in data) {
        if (!data[id].pickedBy) {
          items[id] = data[id];
        }
      }
    });

    // トラップ監視
    roomRef.child('traps').on('value', snapshot => {
      placedTraps = snapshot.val() || {};
    });

    // アイテム効果イベント監視
    roomRef.child('itemEvents').on('child_added', snapshot => {
      const event = snapshot.val();
      handleItemEvent(event);
    });
  }

  function spawnItem() {
    if (!roomRef || !areaCenter) return;

    const itemCount = Object.keys(items).length;
    if (itemCount >= MAX_ITEMS_ON_MAP) return;

    // ランダムなアイテムタイプを選択（レアリティ加重）
    const itemType = pickRandomItemType();

    // エリア内のランダムな位置
    const position = randomPositionInArea(areaCenter, areaRadius * 0.8);

    const itemId = 'item_' + Utils.generateId(8);
    const itemData = {
      type: itemType,
      lat: position.lat,
      lng: position.lng,
      spawnedAt: Date.now(),
      pickedBy: null
    };

    roomRef.child('items/' + itemId).set(itemData);
  }

  function pickRandomItemType() {
    const types = Object.keys(ITEM_TYPES);
    const weights = types.map(t => RARITY_WEIGHTS[ITEM_TYPES[t].rarity]);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < types.length; i++) {
      random -= weights[i];
      if (random <= 0) return types[i];
    }
    return types[0];
  }

  function randomPositionInArea(center, radius) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const dLat = (r * Math.cos(angle)) / 111320;
    const dLng = (r * Math.sin(angle)) / (111320 * Math.cos(center.lat * Math.PI / 180));
    return {
      lat: center.lat + dLat,
      lng: center.lng + dLng
    };
  }

  // プレイヤー位置でアイテム拾得をチェック
  function checkPickup(playerPos, playerId) {
    if (!playerPos) return null;
    if (inventory.length >= MAX_INVENTORY) return null;

    for (const id in items) {
      const item = items[id];
      const dist = Utils.getDistance(
        playerPos.lat, playerPos.lng,
        item.lat, item.lng
      );

      if (dist <= PICKUP_RADIUS) {
        return pickupItem(id, item, playerId);
      }
    }
    return null;
  }

  function pickupItem(itemId, item, playerId) {
    // Firebase上でピックアップをマーク
    if (roomRef) {
      roomRef.child('items/' + itemId + '/pickedBy').set(playerId);
    }

    // ローカルから削除
    delete items[itemId];

    // インベントリに追加
    const inventoryItem = {
      type: item.type,
      pickedAt: Date.now()
    };
    inventory.push(inventoryItem);

    Utils.vibrate([50, 30, 50]);

    return {
      itemType: item.type,
      itemInfo: ITEM_TYPES[item.type]
    };
  }

  // アイテムを使用
  function useItem(index, playerPos, playerId) {
    if (index < 0 || index >= inventory.length) return null;

    const item = inventory[index];
    const itemInfo = ITEM_TYPES[item.type];
    if (!itemInfo) return null;

    // インベントリから除去
    inventory.splice(index, 1);

    const effectResult = itemInfo.effect(playerId);

    // 即時効果
    switch (effectResult.type) {
      case 'speed_boost':
        activeEffects.speed_boost = { endTime: Date.now() + effectResult.duration };
        break;

      case 'shield':
        activeEffects.shield = { endTime: Date.now() + effectResult.duration, charges: effectResult.charges };
        break;

      case 'trap':
        if (playerPos) {
          const trapId = 'trap_' + Utils.generateId(6);
          const trapData = {
            lat: playerPos.lat,
            lng: playerPos.lng,
            ownerId: playerId,
            placedAt: Date.now()
          };
          if (roomRef) {
            roomRef.child('traps/' + trapId).set(trapData);
          }
        }
        break;

      case 'emp':
        // EMPイベントを全プレイヤーに通知
        if (roomRef && playerPos) {
          roomRef.child('itemEvents').push({
            type: 'emp',
            senderId: playerId,
            lat: playerPos.lat,
            lng: playerPos.lng,
            radius: effectResult.radius,
            disableDuration: effectResult.disableDuration,
            timestamp: Date.now()
          });
        }
        break;

      case 'radar':
        activeEffects.radar = { endTime: Date.now() + effectResult.duration };
        break;

      case 'stamina_pack':
        // スタミナ回復はSkillSystemに委譲
        return { type: 'stamina_pack', applied: true };

      case 'swap':
        if (roomRef) {
          roomRef.child('itemEvents').push({
            type: 'swap',
            senderId: playerId,
            timestamp: Date.now()
          });
        }
        break;

      case 'invisibility':
        activeEffects.invisibility = { endTime: Date.now() + effectResult.duration };
        break;
    }

    // Firebase通知
    if (roomRef) {
      roomRef.child('itemEvents').push({
        type: 'item_used',
        itemType: item.type,
        playerId: playerId,
        timestamp: Date.now()
      });
    }

    Utils.vibrate([100]);

    return {
      type: item.type,
      info: itemInfo,
      effect: effectResult
    };
  }

  // トラップ判定
  function checkTraps(playerPos, playerId) {
    if (!playerPos) return null;

    for (const trapId in placedTraps) {
      const trap = placedTraps[trapId];
      if (trap.ownerId === playerId) continue; // 自分のトラップは踏まない

      const dist = Utils.getDistance(
        playerPos.lat, playerPos.lng,
        trap.lat, trap.lng
      );

      if (dist <= 5) { // 5m以内で起動
        // トラップ消去
        if (roomRef) {
          roomRef.child('traps/' + trapId).remove();
          roomRef.child('itemEvents').push({
            type: 'trap_triggered',
            trapId: trapId,
            victimId: playerId,
            ownerId: trap.ownerId,
            timestamp: Date.now()
          });
        }
        delete placedTraps[trapId];
        return { type: 'trap', ownerId: trap.ownerId };
      }
    }
    return null;
  }

  function handleItemEvent(event) {
    const myId = Utils.getPlayerId();

    switch (event.type) {
      case 'emp':
        if (event.senderId === myId) break;
        const myPos = LocationManager.getPosition();
        if (myPos) {
          const dist = Utils.getDistance(myPos.lat, myPos.lng, event.lat, event.lng);
          if (dist <= event.radius) {
            activeEffects.emp_disabled = { endTime: Date.now() + event.disableDuration };
          }
        }
        break;

      case 'trap_triggered':
        if (event.victimId === myId) {
          activeEffects.slowed = { endTime: Date.now() + 3000 };
        }
        break;
    }
  }

  // 効果チェック
  function hasEffect(effectType) {
    if (!activeEffects[effectType]) return false;
    if (Date.now() > activeEffects[effectType].endTime) {
      delete activeEffects[effectType];
      return false;
    }
    return true;
  }

  // シールドで捕獲を1回ブロック
  function tryBlockCapture() {
    if (!activeEffects.shield || activeEffects.shield.charges <= 0) return false;
    if (Date.now() > activeEffects.shield.endTime) {
      delete activeEffects.shield;
      return false;
    }
    activeEffects.shield.charges--;
    if (activeEffects.shield.charges <= 0) {
      delete activeEffects.shield;
    }
    return true;
  }

  function getItems() {
    return items;
  }

  function getInventory() {
    return inventory;
  }

  function getActiveEffects() {
    // 期限切れを掃除
    const now = Date.now();
    for (const key in activeEffects) {
      if (activeEffects[key].endTime && now > activeEffects[key].endTime) {
        delete activeEffects[key];
      }
    }
    return { ...activeEffects };
  }

  function getTraps() {
    return placedTraps;
  }

  function getItemInfo(type) {
    return ITEM_TYPES[type] || null;
  }

  function cleanup() {
    if (spawnTimer) clearInterval(spawnTimer);
    if (roomRef) {
      roomRef.child('items').off();
      roomRef.child('traps').off();
      roomRef.child('itemEvents').off();
    }
    items = {};
    inventory = [];
    activeEffects = {};
    placedTraps = {};
  }

  return {
    ITEM_TYPES, init, checkPickup, useItem, checkTraps,
    hasEffect, tryBlockCapture,
    getItems, getInventory, getActiveEffects, getTraps, getItemInfo,
    cleanup, PICKUP_RADIUS, MAX_INVENTORY
  };
})();
