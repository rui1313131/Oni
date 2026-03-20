// UI管理
const UI = (() => {
  let map = null;
  let markers = {};
  let itemMarkers = {};
  let trapMarkers = {};
  let areaCircle = null;
  let captureCircle = null;
  let minimapCtx = null;
  let currentScreen = 'splash';

  // 画面遷移
  function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    const target = document.getElementById('screen-' + screenId);
    if (!target) return;

    screens.forEach(s => {
      if (s.classList.contains('active')) {
        s.classList.add('fade-out');
        setTimeout(() => {
          s.classList.remove('active', 'fade-out');
        }, 400);
      }
    });

    setTimeout(() => {
      target.classList.add('active');
      currentScreen = screenId;
      // 広告の表示/非表示切り替え
      if (typeof AdManager !== 'undefined') {
        AdManager.onScreenChange(screenId);
      }
    }, currentScreen === 'splash' ? 0 : 200);
  }

  // トースト通知
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // アラート表示
  function showAlert(html, cssClass = '', duration = 2000) {
    const overlay = document.getElementById('alert-overlay');
    const content = document.getElementById('alert-content');
    content.className = 'alert-content ' + cssClass;
    content.innerHTML = html;
    overlay.style.display = 'flex';
    if (duration > 0) {
      setTimeout(() => {
        overlay.style.display = 'none';
      }, duration);
    }
  }

  function hideAlert() {
    document.getElementById('alert-overlay').style.display = 'none';
  }

  function showSafetyWarning(text) {
    const el = document.getElementById('safety-warning');
    document.getElementById('warning-text').textContent = text;
    el.style.display = 'flex';
    setTimeout(() => {
      el.style.display = 'none';
    }, 4000);
  }

  // ========== マップ ==========
  function initMap() {
    if (map) return;

    map = L.map('game-map', {
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false
    }).setView([35.6812, 139.7671], 17);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    const canvas = document.getElementById('minimap-canvas');
    if (canvas) {
      minimapCtx = canvas.getContext('2d');
    }
  }

  function updateMapCenter(lat, lng) {
    if (map) {
      map.setView([lat, lng], map.getZoom(), { animate: true });
    }
  }

  function drawAreaBoundary(center, radius) {
    if (!map) return;
    if (areaCircle) {
      map.removeLayer(areaCircle);
    }
    areaCircle = L.circle([center.lat, center.lng], {
      radius: radius,
      color: '#00f0ff',
      fillColor: '#00f0ff',
      fillOpacity: 0.03,
      opacity: 0.4,
      dashArray: '8, 4',
      weight: 2
    }).addTo(map);
  }

  function updatePlayerMarker(playerId, position, options = {}) {
    if (!map || !position) return;

    const {
      name = '???',
      role = 'runner',
      isSelf = false,
      isStealthed = false,
      isCaptured = false,
      isDecoy = false,
      team = null
    } = options;

    const markerId = isDecoy ? playerId + '_decoy' : playerId;

    if (isCaptured && !isSelf) {
      removeMarker(markerId);
      return;
    }

    if (isStealthed && !isSelf) {
      removeMarker(markerId);
      return;
    }

    const classNames = [
      'marker-dot',
      role,
      isSelf ? 'self' : '',
      isStealthed ? 'stealth' : '',
      isCaptured ? 'captured' : ''
    ].filter(Boolean).join(' ');

    const html = `
      <div class="player-marker ${isDecoy ? 'marker-decoy' : ''}">
        <div class="${classNames}" style="color: ${role === 'oni' ? 'var(--oni-red)' : 'var(--runner-blue)'}"></div>
        <div class="marker-name">${isDecoy ? name + '?' : name}</div>
      </div>
    `;

    const icon = L.divIcon({
      html: html,
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    if (markers[markerId]) {
      markers[markerId].setLatLng([position.lat, position.lng]);
      markers[markerId].setIcon(icon);
    } else {
      markers[markerId] = L.marker([position.lat, position.lng], { icon }).addTo(map);
    }
  }

  function removeMarker(markerId) {
    if (markers[markerId]) {
      map.removeLayer(markers[markerId]);
      delete markers[markerId];
    }
  }

  // ========== アイテムマーカー ==========
  function updateItemMarkers(items) {
    if (!map) return;

    // 削除されたアイテムを除去
    const currentIds = new Set(Object.keys(items));
    for (const id in itemMarkers) {
      if (!currentIds.has(id)) {
        map.removeLayer(itemMarkers[id]);
        delete itemMarkers[id];
      }
    }

    // アイテムを追加/更新
    for (const id in items) {
      const item = items[id];
      const info = ItemSystem.getItemInfo(item.type);
      if (!info) continue;

      const rarity = info.rarity || 'common';
      const iconHtml = Icons.get(info.iconKey || 'item_speed', 14);
      const html = `
        <div class="item-marker">
          <div class="item-marker-dot ${rarity}">${iconHtml}</div>
        </div>
      `;

      const icon = L.divIcon({
        html: html,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      if (itemMarkers[id]) {
        itemMarkers[id].setIcon(icon);
      } else {
        itemMarkers[id] = L.marker([item.lat, item.lng], { icon }).addTo(map);
      }
    }
  }

  function updateTrapMarkers(traps) {
    if (!map) return;

    const currentIds = new Set(Object.keys(traps));
    for (const id in trapMarkers) {
      if (!currentIds.has(id)) {
        map.removeLayer(trapMarkers[id]);
        delete trapMarkers[id];
      }
    }

    for (const id in traps) {
      const trap = traps[id];
      // 自分のトラップのみ表示
      if (trap.ownerId !== Utils.getPlayerId()) continue;

      const html = `<div class="trap-marker">${Icons.get('item_trap', 12)}</div>`;
      const icon = L.divIcon({
        html: html,
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      if (trapMarkers[id]) {
        // 位置は変わらないのでそのまま
      } else {
        trapMarkers[id] = L.marker([trap.lat, trap.lng], { icon }).addTo(map);
      }
    }
  }

  // ========== アイテムインベントリUI ==========
  function updateItemInventory(inventory) {
    for (let i = 0; i < 2; i++) {
      const slot = document.getElementById('item-slot-' + i);
      const iconEl = document.getElementById('item-icon-' + i);

      if (i < inventory.length) {
        const info = ItemSystem.getItemInfo(inventory[i].type);
        iconEl.innerHTML = info ? Icons.get(info.iconKey || 'item_speed', 22) : '?';
        slot.classList.add('has-item');
        slot.title = info ? info.name : '';
      } else {
        iconEl.innerHTML = '<span style="opacity:0.3;font-size:0.8rem">--</span>';
        slot.classList.remove('has-item');
        slot.title = '';
      }
    }
  }

  function showItemPickupEffect(iconKey) {
    const el = document.createElement('div');
    el.className = 'item-pickup-effect';
    el.innerHTML = Icons.get(iconKey || 'item_speed', 36);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  // ========== ボイスチャットUI ==========
  function showVoiceControl(enabled) {
    document.getElementById('voice-control').style.display = enabled ? 'flex' : 'none';
  }

  function updateVoiceUI(muted, peerCount) {
    const btn = document.getElementById('btn-voice-toggle');
    const icon = document.getElementById('voice-btn-icon');
    const peers = document.getElementById('voice-peers');

    btn.classList.toggle('muted', muted);
    btn.classList.toggle('active-voice', !muted && peerCount > 0);
    icon.innerHTML = muted ? Icons.get('mic_off', 20) : Icons.get('mic', 20);
    peers.textContent = peerCount;
  }

  function clearAllMarkers() {
    for (const id in markers) {
      if (map) map.removeLayer(markers[id]);
    }
    markers = {};
    for (const id in itemMarkers) {
      if (map) map.removeLayer(itemMarkers[id]);
    }
    itemMarkers = {};
    for (const id in trapMarkers) {
      if (map) map.removeLayer(trapMarkers[id]);
    }
    trapMarkers = {};
    if (areaCircle && map) map.removeLayer(areaCircle);
    if (captureCircle && map) map.removeLayer(captureCircle);
  }

  // ========== HUD更新 ==========
  function updateHUD(gameState) {
    // タイマー
    const timerEl = document.getElementById('hud-timer');
    timerEl.textContent = Utils.formatTime(gameState.remainingTime);
    timerEl.classList.toggle('warning', gameState.remainingTime < 30);

    // ロール表示
    const roleEl = document.getElementById('hud-role');
    if (gameState.gameMode === 'team') {
      roleEl.textContent = gameState.role === 'oni' ? '鬼チーム' : '逃走チーム';
    } else {
      roleEl.textContent = gameState.role === 'oni' ? '鬼' : '逃走者';
    }
    roleEl.className = 'hud-role ' + (gameState.role === 'oni' ? 'oni' : 'runner');

    // 生存者数
    const runners = Object.values(gameState.players).filter(p => p.role === 'runner');
    const alive = runners.filter(p => !p.captured).length;
    document.getElementById('hud-alive').textContent = `残り: ${alive}/${runners.length}`;

    // チーム戦スコア表示
    const teamScoreEl = document.getElementById('hud-team-score');
    if (gameState.gameMode === 'team') {
      const oniTeam = Object.values(gameState.players).filter(p => p.team === 'oni');
      const captured = gameState.capturedPlayers.length;
      teamScoreEl.style.display = 'inline';
      teamScoreEl.innerHTML = `<span style="color:var(--oni-red)">鬼×${oniTeam.length}</span> | <span style="color:var(--runner-blue)">捕獲: ${captured}</span>`;
    } else {
      teamScoreEl.style.display = 'none';
    }

    // スタミナ
    const staminaPct = SkillSystem.getStaminaPercent();
    const staminaFill = document.getElementById('stamina-fill');
    staminaFill.style.width = staminaPct + '%';
    staminaFill.classList.toggle('low', staminaPct < 25);

    // 弾数
    document.getElementById('shoot-ammo').textContent = ShootingSystem.getAmmo();

    // 距離インジケータ
    const dist = GameEngine.getDistanceToNearestEnemy();
    const distIndicator = document.getElementById('distance-indicator');
    if (dist !== null && dist < 200) {
      distIndicator.style.display = 'block';
      const zone = GameEngine.getDistanceZone(dist);
      const zoneEl = document.getElementById('distance-zone');
      zoneEl.textContent = zone.toUpperCase();
      zoneEl.className = 'distance-zone ' + zone;
      document.getElementById('distance-value').textContent = Math.round(dist) + 'm';
    } else {
      distIndicator.style.display = 'none';
    }

    // アイテムインベントリ
    updateItemInventory(ItemSystem.getInventory());
  }

  function updateSkillButtons(skills) {
    skills.forEach((skillId, index) => {
      const btn = document.getElementById(`skill-btn-${index + 1}`);
      const cdEl = document.getElementById(`skill-cd-${index + 1}`);
      const info = SkillSystem.getSkillInfo(skillId);

      if (!info) return;

      btn.dataset.skill = skillId;
      btn.querySelector('.skill-icon').innerHTML = Icons.get(info.iconKey, 28);
      btn.querySelector('.skill-name').textContent = info.name;

      const cdRemaining = SkillSystem.getCooldownRemaining(skillId);
      const isActive = SkillSystem.isActive(skillId);

      // EMP無効化チェック
      const empDisabled = ItemSystem.hasEffect('emp_disabled');

      btn.classList.toggle('on-cooldown', (cdRemaining > 0 && !isActive) || empDisabled);
      btn.classList.toggle('active-skill', isActive);

      if (empDisabled) {
        cdEl.textContent = 'EMP';
      } else if (cdRemaining > 0 && !isActive) {
        cdEl.textContent = Math.ceil(cdRemaining / 1000);
      } else {
        cdEl.textContent = '';
      }
    });
  }

  // ========== ミニマップ ==========
  function updateMinimap(players, myPos, areaCenter, areaRadius) {
    if (!minimapCtx || !myPos) return;

    const canvas = minimapCtx.canvas;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const scale = canvas.width / (areaRadius * 2.5);

    minimapCtx.clearRect(0, 0, canvas.width, canvas.height);

    // エリア円
    const areaR = areaRadius * scale;
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, areaR, 0, Math.PI * 2);
    minimapCtx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    minimapCtx.lineWidth = 1;
    minimapCtx.stroke();

    // アイテム表示
    const items = ItemSystem.getItems();
    for (const id in items) {
      const item = items[id];
      const dx = (item.lng - myPos.lng) * 111320 * Math.cos(myPos.lat * Math.PI / 180);
      const dy = (item.lat - myPos.lat) * 111320;
      const mx = cx + dx * scale;
      const my = cy - dy * scale;

      minimapCtx.beginPath();
      minimapCtx.arc(mx, my, 2, 0, Math.PI * 2);
      minimapCtx.fillStyle = '#ffee00';
      minimapCtx.fill();
    }

    // プレイヤー表示
    for (const pid in players) {
      const player = players[pid];
      if (!player.position || player.captured) continue;
      if (player.stealthActive && pid !== Utils.getPlayerId()) continue;

      const dx = (player.position.lng - myPos.lng) * 111320 * Math.cos(myPos.lat * Math.PI / 180);
      const dy = (player.position.lat - myPos.lat) * 111320;
      const mx = cx + dx * scale;
      const my = cy - dy * scale;

      minimapCtx.beginPath();
      minimapCtx.arc(mx, my, pid === Utils.getPlayerId() ? 4 : 3, 0, Math.PI * 2);
      minimapCtx.fillStyle = player.role === 'oni' ? '#ff2244' : '#00ccff';
      minimapCtx.fill();
    }

    // 自分
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, 4, 0, Math.PI * 2);
    minimapCtx.fillStyle = '#ffffff';
    minimapCtx.fill();
  }

  // ========== エフェクト ==========
  function showShootEffect() {
    const el = document.createElement('div');
    el.className = 'shoot-effect';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 500);
  }

  function showHitFlash() {
    const el = document.createElement('div');
    el.className = 'hit-flash';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 300);
  }

  function showCaptureFlash() {
    const el = document.createElement('div');
    el.className = 'capture-flash';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 500);
  }

  // ========== ロビー ==========
  function updateLobbyPlayers(players, hostId, gameMode, teams) {
    const list = document.getElementById('lobby-player-list');
    list.innerHTML = '';

    const avatarKeys = Icons.getAvatarKeys();
    let index = 0;

    for (const pid in players) {
      const player = players[pid];
      const isHostPlayer = pid === hostId;
      const team = teams ? teams[pid] : null;
      const el = document.createElement('div');
      el.className = 'player-item' + (isHostPlayer ? ' is-host' : '');

      let teamBadge = '';
      if (team) {
        const teamClass = team === 'oni' ? 'team-oni' : 'team-runner';
        const teamLabel = team === 'oni' ? '鬼' : '逃走';
        teamBadge = `<span class="team-badge ${teamClass}">${teamLabel}</span>`;
      }

      el.innerHTML = `
        <div class="player-avatar">${Icons.get(avatarKeys[index % avatarKeys.length], 22)}</div>
        <div class="player-info">
          <div class="player-name">${player.name}</div>
        </div>
        ${teamBadge}
        ${isHostPlayer ? '<span class="player-badge">ホスト</span>' : ''}
      `;
      list.appendChild(el);
      index++;
    }
  }

  function updateLobbyInfo(room) {
    // モードバッジ
    const badge = document.getElementById('lobby-mode-badge');
    const mode = room.settings?.gameMode || 'classic';
    badge.textContent = mode === 'team' ? 'チーム戦' : 'クラシック';
    badge.className = 'lobby-mode-badge ' + mode;

    // ボイス情報
    const voiceInfo = document.getElementById('lobby-voice-info');
    const voiceMode = room.settings?.voiceMode || 'off';
    if (voiceMode !== 'off') {
      voiceInfo.style.display = 'flex';
      const labels = { proximity: '近距離チャット', team: 'チーム内通話', all: '全体通話' };
      document.getElementById('lobby-voice-label').textContent = 'ボイスチャット: ' + (labels[voiceMode] || voiceMode);
    } else {
      voiceInfo.style.display = 'none';
    }
  }

  // ========== リザルト ==========
  function showResult(result) {
    const titleEl = document.getElementById('result-title');
    const winnerEl = document.getElementById('result-winner');
    const statsEl = document.getElementById('result-stats');

    if (result.winner === 'oni') {
      titleEl.textContent = result.gameMode === 'team' ? '鬼チームの勝利！' : '鬼の勝利！';
      winnerEl.innerHTML = `<span style="color:var(--oni-red)">${result.oniName}</span> が全員を捕獲！`;
    } else if (result.winner === 'runner') {
      titleEl.textContent = result.gameMode === 'team' ? '逃走チームの勝利！' : '逃走者の勝利！';
      const names = result.survivors.join(', ');
      winnerEl.innerHTML = `<span style="color:var(--runner-blue)">${names}</span> が逃げ切った！`;
    }

    let modeLabel = result.gameMode === 'team' ? 'チーム戦' : 'クラシック';

    statsEl.innerHTML = `
      <div class="stat-item">
        <span class="stat-label">モード</span>
        <span class="stat-value">${modeLabel}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">捕獲数</span>
        <span class="stat-value">${result.captured} / ${result.totalRunners}</span>
      </div>
      ${result.gameMode === 'team' ? `
      <div class="stat-item">
        <span class="stat-label">鬼チーム人数</span>
        <span class="stat-value">${result.totalOni}</span>
      </div>` : ''}
      <div class="stat-item">
        <span class="stat-label">経過時間</span>
        <span class="stat-value">${Utils.formatTime(result.duration)}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">終了理由</span>
        <span class="stat-value">${result.reason === 'timeout' ? '時間切れ' : '全員捕獲'}</span>
      </div>
    `;
  }

  function getMap() {
    return map;
  }

  return {
    showScreen, showToast, showAlert, hideAlert, showSafetyWarning,
    initMap, updateMapCenter, drawAreaBoundary,
    updatePlayerMarker, removeMarker, clearAllMarkers,
    updateItemMarkers, updateTrapMarkers,
    updateItemInventory, showItemPickupEffect,
    showVoiceControl, updateVoiceUI,
    updateHUD, updateSkillButtons, updateMinimap,
    showShootEffect, showHitFlash, showCaptureFlash,
    updateLobbyPlayers, updateLobbyInfo, showResult, getMap
  };
})();
