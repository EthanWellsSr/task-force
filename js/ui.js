// ============================================================
// UI — menus, create-a-class (localStorage), settings, HUD.
// main.js exposes window.MAIN = { startMatch, deploy, resume, quitMatch }.
// ============================================================

const DEFAULT_KEYBINDS = {
  moveForward: 'KeyW',
  moveBack: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  crouch: 'KeyC',
  prone: 'KeyZ',
  reload: 'KeyR',
  swapWeapon: 'KeyQ',
  primaryWeapon: 'Digit1',
  secondaryWeapon: 'Digit2',
  melee: 'KeyV',
  lethal: 'KeyF',
  tactical: 'KeyT',
  adsToggle: 'KeyX',
  deployStreak: 'KeyG',
  cycleStreak: 'Digit3',
};

const KEYBIND_ACTIONS = [
  ['moveForward', 'Move Forward'],
  ['moveBack', 'Move Back'],
  ['moveLeft', 'Move Left'],
  ['moveRight', 'Move Right'],
  ['sprint', 'Sprint / Steady Scope'],
  ['jump', 'Jump'],
  ['crouch', 'Crouch'],
  ['prone', 'Prone'],
  ['reload', 'Reload'],
  ['swapWeapon', 'Swap Weapon'],
  ['primaryWeapon', 'Primary Weapon'],
  ['secondaryWeapon', 'Secondary Weapon'],
  ['melee', 'Melee'],
  ['lethal', 'Lethal Equipment'],
  ['tactical', 'Tactical Equipment'],
  ['adsToggle', 'Toggle ADS'],
  ['deployStreak', 'Deploy Killstreak'],
  ['cycleStreak', 'Cycle Killstreak'],
];

const RESERVED_KEY_CODES = new Set(['Tab', 'Escape']);
const KEY_LABELS = {
  ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT',
  ControlLeft: 'CTRL', ControlRight: 'CTRL',
  AltLeft: 'ALT', AltRight: 'ALT',
  Space: 'SPACE',
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
  Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
};

function keyLabel(code) {
  if (!code) return '?';
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

const UI = {
  settings: { sens: 1.0, fov: 80, volume: 0.7, difficulty: 'regular', teamSize: 6, scoreLimit: 75, timeLimit: 600 },
  classes: [],
  editIdx: 0,        // class being edited
  selectedClass: 0,  // class chosen on spawn screen
  selectedMode: 'tdm',
  capturingBind: null,

  $(id) { return document.getElementById(id); },

  init() {
    this.loadSettings();
    this.loadClasses();
    this.bindMenus();
    this.renderClassEditor();
    this.renderControlHints();
    AudioSys.setVolume(this.settings.volume);
    // cache crosshair line elements so crosshairSpread() avoids per-frame querySelector calls
    this._chT = document.querySelector('.ch-t');
    this._chB = document.querySelector('.ch-b');
    this._chL = document.querySelector('.ch-l');
    this._chR = document.querySelector('.ch-r');
  },

  // ---------- persistence ----------
  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('tf_settings'));
      if (s) Object.assign(this.settings, s);
    } catch (e) {}
    this.normalizeKeybinds();
  },
  saveSettings() { localStorage.setItem('tf_settings', JSON.stringify(this.settings)); },
  normalizeKeybinds() {
    const src = this.settings.keybinds && typeof this.settings.keybinds === 'object'
      ? this.settings.keybinds : {};
    this.settings.keybinds = { ...DEFAULT_KEYBINDS };
    for (const action in DEFAULT_KEYBINDS) {
      if (typeof src[action] === 'string' && !RESERVED_KEY_CODES.has(src[action]))
        this.settings.keybinds[action] = src[action];
    }
  },
  loadClasses() {
    try {
      const c = JSON.parse(localStorage.getItem('tf_classes'));
      // normalizeClass migrates pre-attachment saves (bare weapon keys) in place
      if (Array.isArray(c) && c.length === 5) { this.classes = c.map(normalizeClass); return; }
    } catch (e) {}
    this.classes = DEFAULT_CLASSES.map(c => normalizeClass(JSON.parse(JSON.stringify(c))));
  },
  saveClasses() { localStorage.setItem('tf_classes', JSON.stringify(this.classes)); },

  // ---------- screens ----------
  show(id) {
    for (const s of ['menu', 'classScreen', 'settingsScreen', 'spawnScreen', 'pauseScreen', 'endScreen', 'hud', 'scoreboard'])
      this.$(s).classList.add('hidden');
    if (id === 'pauseScreen') this.renderPauseSettings();
    if (id) this.$(id).classList.remove('hidden');
  },

  bindMenus() {
    document.querySelectorAll('.map-card').forEach(card => {
      card.addEventListener('click', () => {
        AudioSys.uiClick();
        MAIN.startMatch(card.dataset.map, this.selectedMode);
      });
    });
    const modeSelect = this.$('modeSelect');
    if (modeSelect) {
      this.selectedMode = modeSelect.value || 'tdm';
      modeSelect.addEventListener('change', e => {
        AudioSys.uiClick();
        this.selectedMode = e.target.value || 'tdm';
      });
    }
    this.$('btnClasses').onclick = () => { AudioSys.uiClick(); this.renderClassEditor(); this.show('classScreen'); };
    this.$('btnSettings').onclick = () => { AudioSys.uiClick(); this.renderSettings(); this.show('settingsScreen'); };
    this.$('btnClassBack').onclick = () => { AudioSys.uiClick(); this.saveClasses(); this.show(MAIN.inMatch() ? 'spawnScreen' : 'menu'); if (MAIN.inMatch()) this.renderSpawnScreen(); };
    this.$('btnSettingsBack').onclick = () => { AudioSys.uiClick(); this.capturingBind = null; this.show('menu'); };
    this.$('btnDeploy').onclick = () => { AudioSys.uiClick(); MAIN.deploy(); };
    this.$('btnResume').onclick = () => MAIN.resume();
    this.$('btnChangeClass').onclick = () => { AudioSys.uiClick(); this.renderClassEditor(); this.show('classScreen'); };
    this.$('btnQuitMatch').onclick = () => { AudioSys.uiClick(); MAIN.quitMatch(); };
    this.$('btnRematch').onclick = () => { AudioSys.uiClick(); MAIN.rematch(); };
    this.$('btnEndMenu').onclick = () => { AudioSys.uiClick(); MAIN.quitMatch(); };

    // settings inputs
    const bindRange = (id, key, valId, fmt) => {
      const el = this.$(id);
      el.addEventListener('input', () => {
        this.settings[key] = parseFloat(el.value);
        this.$(valId).textContent = fmt(this.settings[key]);
        this.saveSettings();
        if (key === 'volume') AudioSys.setVolume(this.settings.volume);
        if (key === 'fov') MAIN.applyFov();
      });
    };
    bindRange('setSens', 'sens', 'setSensVal', v => v.toFixed(1));
    bindRange('setFov', 'fov', 'setFovVal', v => v.toFixed(0));
    bindRange('setVol', 'volume', 'setVolVal', v => Math.round(v * 100) + '%');
    // same settings, reachable mid-match from the pause menu
    bindRange('pauseSens', 'sens', 'pauseSensVal', v => v.toFixed(1));
    bindRange('pauseFov', 'fov', 'pauseFovVal', v => v.toFixed(0));
    bindRange('pauseVol', 'volume', 'pauseVolVal', v => Math.round(v * 100) + '%');
    this.$('setDiff').addEventListener('change', e => { this.settings.difficulty = e.target.value; this.saveSettings(); });
    this.$('setTeamSize').addEventListener('change', e => { this.settings.teamSize = parseInt(e.target.value); this.saveSettings(); });
    this.$('setScoreLimit').addEventListener('change', e => { this.settings.scoreLimit = parseInt(e.target.value); this.saveSettings(); });
    this.$('setTimeLimit').addEventListener('change', e => { this.settings.timeLimit = parseInt(e.target.value); this.saveSettings(); });

    document.addEventListener('keydown', e => this.captureKeybind(e), true);

    this.$('className').addEventListener('input', e => {
      this.classes[this.editIdx].name = e.target.value.toUpperCase() || 'CUSTOM ' + (this.editIdx + 1);
      this.renderClassSlots();
      this.saveClasses();
    });
  },

  renderSettings() {
    const s = this.settings;
    this.$('setSens').value = s.sens; this.$('setSensVal').textContent = s.sens.toFixed(1);
    this.$('setFov').value = s.fov; this.$('setFovVal').textContent = s.fov.toFixed(0);
    this.$('setVol').value = s.volume; this.$('setVolVal').textContent = Math.round(s.volume * 100) + '%';
    this.$('setDiff').value = s.difficulty;
    this.$('setTeamSize').value = String(s.teamSize);
    this.$('setScoreLimit').value = String(s.scoreLimit);
    this.$('setTimeLimit').value = String(s.timeLimit);
    this.renderKeybinds();
    this.renderControlHints();
  },

  renderPauseSettings() {
    const s = this.settings;
    this.$('pauseSens').value = s.sens; this.$('pauseSensVal').textContent = s.sens.toFixed(1);
    this.$('pauseFov').value = s.fov; this.$('pauseFovVal').textContent = s.fov.toFixed(0);
    this.$('pauseVol').value = s.volume; this.$('pauseVolVal').textContent = Math.round(s.volume * 100) + '%';
  },

  codeFor(action) { return this.settings.keybinds[action] || DEFAULT_KEYBINDS[action]; },
  bindLabel(action) { return keyLabel(this.codeFor(action)); },
  actionMatches(action, code) { return this.codeFor(action) === code; },
  actionDown(action, keyState) { return !!keyState[this.codeFor(action)]; },

  setKeybind(action, code) {
    if (!DEFAULT_KEYBINDS[action] || RESERVED_KEY_CODES.has(code)) return false;
    const oldCode = this.codeFor(action);
    const other = Object.keys(DEFAULT_KEYBINDS).find(a => a !== action && this.codeFor(a) === code);
    if (other) this.settings.keybinds[other] = oldCode;
    this.settings.keybinds[action] = code;
    this.saveSettings();
    this.renderKeybinds();
    this.renderControlHints();
    this._hudCache.lethalKey = this._hudCache.tacKey = null;
    return true;
  },

  captureKeybind(e) {
    if (!this.capturingBind) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const status = this.$('keybindStatus');
    if (e.code === 'Escape') {
      this.capturingBind = null;
      if (status) status.textContent = 'Rebind canceled.';
      this.renderKeybinds();
      return;
    }
    if (RESERVED_KEY_CODES.has(e.code)) {
      if (status) status.textContent = keyLabel(e.code) + ' is reserved.';
      return;
    }
    this.setKeybind(this.capturingBind, e.code);
    this.capturingBind = null;
    if (status) status.textContent = 'Saved.';
  },

  renderKeybinds() {
    const wrap = this.$('keybindList');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const [action, label] of KEYBIND_ACTIONS) {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      const waiting = this.capturingBind === action;
      row.innerHTML = `<span>${label}</span><button class="keybind-btn${waiting ? ' listening' : ''}">${waiting ? 'PRESS KEY' : this.bindLabel(action)}</button>`;
      row.querySelector('button').onclick = () => {
        AudioSys.uiClick();
        this.capturingBind = action;
        const status = this.$('keybindStatus');
        if (status) status.textContent = 'Press a key for ' + label + '. Esc cancels.';
        this.renderKeybinds();
      };
      wrap.appendChild(row);
    }
  },

  renderControlHints() {
    const menu = this.$('menuControlHint');
    if (menu) menu.textContent = 'Click a map to deploy | ' +
      `${this.bindLabel('moveForward')}${this.bindLabel('moveLeft')}${this.bindLabel('moveBack')}${this.bindLabel('moveRight')} move | ` +
      'Mouse aim | LMB fire | ' + this.bindLabel('adsToggle') + ' toggles aim down sights';
    const spawn = this.$('spawnControlHint');
    if (spawn) spawn.textContent =
      `${this.bindLabel('moveForward')}${this.bindLabel('moveLeft')}${this.bindLabel('moveBack')}${this.bindLabel('moveRight')} move | ` +
      `${this.bindLabel('adsToggle')} aim down sights | ${this.bindLabel('sprint')} sprint | ` +
      `${this.bindLabel('jump')} jump | ${this.bindLabel('crouch')} crouch | ${this.bindLabel('prone')} prone | ${this.bindLabel('reload')} reload | ` +
      `${this.bindLabel('primaryWeapon')}/${this.bindLabel('secondaryWeapon')} or ${this.bindLabel('swapWeapon')} swap weapon | ` +
      `${this.bindLabel('melee')} melee | ${this.bindLabel('lethal')} lethal | ${this.bindLabel('tactical')} tactical | ` +
      `${this.bindLabel('deployStreak')} deploy killstreak | ${this.bindLabel('cycleStreak')} cycle killstreaks | TAB scoreboard | ESC pause`;
    const lethal = this.$('lethalLabel');
    if (lethal) lethal.textContent = 'LETHAL [' + this.bindLabel('lethal') + ']';
    const tactical = this.$('tacticalLabel');
    if (tactical) tactical.textContent = 'TACTICAL [' + this.bindLabel('tactical') + ']';
  },

  // ---------- create-a-class ----------
  renderClassSlots() {
    const wrap = this.$('classSlots');
    wrap.innerHTML = '';
    this.classes.forEach((c, i) => {
      const div = document.createElement('div');
      div.className = 'class-slot' + (i === this.editIdx ? ' active' : '');
      div.innerHTML = `<div class="cs-name">${c.name}</div>
        <div class="cs-detail">${WEAPONS[c.primary].name} + ${WEAPONS[c.secondary].name}</div>`;
      div.onclick = () => { AudioSys.uiClick(); this.editIdx = i; this.renderClassEditor(); };
      wrap.appendChild(div);
    });
  },

  renderClassEditor() {
    const c = this.classes[this.editIdx];
    this.renderControlHints();
    this.renderClassSlots();
    this.$('className').value = c.name;

    const mkWeaponList = (elId, slot, selectedKey, onPick) => {
      const wrap = this.$(elId);
      wrap.innerHTML = '';
      for (const key in WEAPONS) {
        const w = WEAPONS[key];
        if (w.slot !== slot) continue;
        const div = document.createElement('div');
        div.className = 'weapon-item' + (key === selectedKey ? ' selected' : '');
        div.innerHTML = `<span>${w.name}</span><span class="w-cat">${w.cat}</span>`;
        div.onclick = () => { AudioSys.uiClick(); onPick(key); };
        div.onmouseenter = () => this.renderWeaponStats(key);
        wrap.appendChild(div);
      }
    };
    mkWeaponList('primaryList', 'primary', c.primary, key => {
      c.primary = key; normalizeClass(c); this.saveClasses(); this.renderClassEditor(); this.renderWeaponStats(key);
    });
    mkWeaponList('secondaryList', 'secondary', c.secondary, key => {
      c.secondary = key; normalizeClass(c); this.saveClasses(); this.renderClassEditor(); this.renderWeaponStats(key);
    });

    // attachment picker: per slot-category rows for the equipped weapon,
    // click toggles (picking another in a category swaps it out)
    const mkAttachList = (elId, slot) => {
      const wrap = this.$(elId);
      wrap.innerHTML = '';
      const def = WEAPONS[c[slot]];
      const picked = c.attachments[slot];
      for (const cat of ATTACH_SLOTS) {
        const opts = Object.values(ATTACHMENTS).filter(a => a.slot === cat && attachmentAllowed(a, def));
        if (!opts.length) continue;
        const head = document.createElement('div');
        head.className = 'attach-cat';
        head.textContent = cat.toUpperCase();
        wrap.appendChild(head);
        for (const a of opts) {
          const div = document.createElement('div');
          div.className = 'weapon-item' + (picked.includes(a.id) ? ' selected' : '');
          div.innerHTML = `<span>${a.name}</span><span class="w-cat">${attachmentDesc(a)}</span>`;
          div.onclick = () => {
            AudioSys.uiClick();
            const i = picked.indexOf(a.id);
            if (i >= 0) picked.splice(i, 1);
            else {
              for (let j = picked.length - 1; j >= 0; j--)
                if (ATTACHMENTS[picked[j]].slot === cat) picked.splice(j, 1);
              picked.push(a.id);
            }
            this.saveClasses(); this.renderClassEditor(); this.renderWeaponStats(c[slot]);
          };
          div.onmouseenter = () => this.renderWeaponStats(c[slot]);
          wrap.appendChild(div);
        }
        // reticle color chips (#19b): only while an optic is equipped —
        // one shared pick per weapon, tints red dot and holo alike
        if (cat === 'optic' && picked.some(id => ATTACHMENTS[id] && ATTACHMENTS[id].slot === 'optic')) {
          const row = document.createElement('div');
          row.className = 'reticle-row';
          row.innerHTML = '<span class="reticle-label">SIGHT COLOR</span>';
          const cur = c.attachments[slot + 'DotColor'] || 'red';
          for (const rc of RETICLE_COLORS) {
            const chip = document.createElement('div');
            chip.className = 'reticle-chip' + (rc.id === cur ? ' selected' : '');
            chip.style.background = '#' + rc.hex.toString(16).padStart(6, '0');
            chip.title = rc.name;
            chip.onclick = () => {
              AudioSys.uiClick();
              c.attachments[slot + 'DotColor'] = rc.id;
              this.saveClasses(); this.renderClassEditor();
            };
            row.appendChild(chip);
          }
          wrap.appendChild(row);
        }
        // laser color chips (#19c): only while a laser is equipped, same
        // mechanism as the reticle row
        if (cat === 'laser' && picked.includes('laser')) {
          const row = document.createElement('div');
          row.className = 'reticle-row';
          row.innerHTML = '<span class="reticle-label">LASER COLOR</span>';
          const cur = c.attachments[slot + 'LaserColor'] || 'green';
          for (const lc of LASER_COLORS) {
            const chip = document.createElement('div');
            chip.className = 'reticle-chip' + (lc.id === cur ? ' selected' : '');
            chip.style.background = '#' + lc.hex.toString(16).padStart(6, '0');
            chip.title = lc.name;
            chip.onclick = () => {
              AudioSys.uiClick();
              c.attachments[slot + 'LaserColor'] = lc.id;
              this.saveClasses(); this.renderClassEditor();
            };
            row.appendChild(chip);
          }
          wrap.appendChild(row);
        }
      }
    };
    mkAttachList('primaryAttach', 'primary');
    mkAttachList('secondaryAttach', 'secondary');
    this.renderWeaponStats(c.primary);

    [1, 2, 3].forEach(tier => {
      const wrap = this.$('perk' + tier + 'List');
      wrap.innerHTML = '';
      PERKS[tier].forEach(p => {
        const div = document.createElement('div');
        div.className = 'perk-item' + (c.perks[tier - 1] === p.id ? ' selected' : '');
        div.innerHTML = `<span>${p.name}</span><span class="p-desc">${p.desc}</span>`;
        div.onclick = () => { AudioSys.uiClick(); c.perks[tier - 1] = p.id; this.saveClasses(); this.renderClassEditor(); };
        wrap.appendChild(div);
      });
    });

    // #16a: equipment pickers — a per-slot throwable (from THROWABLES) or NONE.
    // The tactical slot is the real choice (stun vs smoke).
    const mkThrowList = (elId, slotField, cat) => {
      const wrap = this.$(elId);
      wrap.innerHTML = '';
      const opts = Object.keys(THROWABLES).filter(id => THROWABLES[id].slot === cat)
        .map(id => ({ id, name: THROWABLES[id].name }));
      opts.push({ id: 'none', name: 'NONE' });
      const cur = c[slotField] || 'none';
      for (const o of opts) {
        const div = document.createElement('div');
        div.className = 'weapon-item' + (o.id === cur ? ' selected' : '');
        div.innerHTML = `<span>${o.name}</span>`;
        div.onclick = () => { AudioSys.uiClick(); c[slotField] = o.id; this.saveClasses(); this.renderClassEditor(); };
        wrap.appendChild(div);
      }
    };
    mkThrowList('lethalList', 'lethal', 'lethal');
    mkThrowList('tacticalList', 'tactical', 'tactical');
  },

  renderWeaponStats(key) {
    // the class's equipped weapons show attachment-modified stats; hovering
    // an unequipped weapon shows its base def (no attachments picked yet)
    const c = this.classes[this.editIdx];
    const slot = key === c.primary ? 'primary' : key === c.secondary ? 'secondary' : null;
    const w = slot ? resolveWeaponDef(key, c.attachments[slot]) : WEAPONS[key];
    const wrap = this.$('weaponStats');
    let html = `<div style="font-weight:700;letter-spacing:1px;margin-bottom:8px">${w.name} <span style="color:#6a7060;font-size:9px">${w.cat} &middot; ${fireModeLabel(w)} &middot; ${w.mag} RND MAG</span></div>`;
    for (const [label, val] of weaponStatBars(w)) {
      html += `<div class="stat-row"><div class="s-label">${label}</div><div class="stat-bar"><div style="width:${Math.round(val * 100)}%"></div></div></div>`;
    }
    wrap.innerHTML = html;
  },

  // ---------- spawn screen ----------
  renderSpawnScreen(deathInfo) {
    this.renderControlHints();
    const wrap = this.$('spawnClasses');
    wrap.innerHTML = '';
    this.classes.forEach((c, i) => {
      const div = document.createElement('div');
      div.className = 'spawn-class' + (i === this.selectedClass ? ' active' : '');
      const perkNames = c.perks.map(id => { const p = perkById(id); return p ? p.name : id; }).join(' / ');
      // #16a: equipment line — lethal + tactical picks (skip NONE slots)
      const eq = [c.lethal, c.tactical].filter(k => k && k !== 'none' && THROWABLES[k])
        .map(k => THROWABLES[k].name).join(' / ') || 'NO EQUIPMENT';
      div.innerHTML = `<div class="sc-name">${c.name}</div>
        <div class="sc-weap">${WEAPONS[c.primary].name} + ${WEAPONS[c.secondary].name}</div>
        <div class="sc-perks">${perkNames}</div>
        <div class="sc-perks">${eq}</div>`;
      div.onclick = () => { AudioSys.uiClick(); this.selectedClass = i; this.renderSpawnScreen(deathInfo); };
      wrap.appendChild(div);
    });
    const di = this.$('deathInfo');
    if (deathInfo) {
      di.classList.remove('hidden');
      this.$('killedByText').textContent = deathInfo;
      this.$('spawnTitle').textContent = 'CHANGE LOADOUT?';
    } else {
      di.classList.add('hidden');
      this.$('spawnTitle').textContent = 'CHOOSE YOUR LOADOUT';
    }
  },

  setRespawnCountdown(t) {
    const el = this.$('respawnCountdown');
    const btn = this.$('btnDeploy');
    if (t > 0) {
      el.textContent = isFinite(t) ? 'RESPAWN IN ' + Math.ceil(t) : 'WAITING FOR ROUND END';
      btn.disabled = true;
    } else {
      el.textContent = '';
      btn.disabled = false;
    }
  },

  // ---------- HUD ----------
  teamClass(team) {
    return team === 'tf' || team === 'sp' ? team : 'ffa';
  },

  killfeed(killerName, killerTeam, victimName, victimTeam, weaponName, headshot) {
    const feed = this.$('killfeed');
    const div = document.createElement('div');
    div.className = 'kf-entry';
    div.innerHTML = `<span class="kf-${this.teamClass(killerTeam)}">${killerName}</span>
      <span class="kf-weap"> [${weaponName}${headshot ? ' <span class="kf-hs">&#9678;</span>' : ''}] </span>
      <span class="kf-${this.teamClass(victimTeam)}">${victimName}</span>`;
    feed.prepend(div);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    setTimeout(() => { div.style.opacity = '0'; }, 4200);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5000);
  },

  // Called every frame — only touch the DOM when a value actually changed.
  _hudCache: {},
  updateHud(p, weapon, state) {
    const c = this._hudCache;
    if (c.mag !== state.mag) { c.mag = state.mag; this.$('ammoMag').textContent = state.mag; }
    if (c.reserve !== state.reserve) { c.reserve = state.reserve; this.$('ammoReserve').textContent = state.reserve; }
    if (c.weapon !== weapon.name) { c.weapon = weapon.name; this.$('weaponName').textContent = weapon.name; }
    const mode = fireModeLabel(weapon);
    if (c.mode !== mode) { c.mode = mode; this.$('fireMode').textContent = mode; }
    const low = state.mag <= Math.max(3, weapon.mag * 0.2);
    if (c.low !== low) { c.low = low; this.$('ammoCount').classList.toggle('low', low); }
    // #16a: two equipment counters — lethal + tactical. An unequipped
    // (null) slot hides entirely; the kind is part of the cache key so a
    // class change relabels it (frag→none, stun→smoke, etc.)
    const lethalKey = (p.equip || 'none') + ':' + p.equipLeft + ':' + this.codeFor('lethal');
    if (c.lethalKey !== lethalKey) {
      c.lethalKey = lethalKey;
      const el = this.$('grenadeCount');
      if (p.equip) {
        el.textContent = THROWABLES[p.equip].name + ' ×' + p.equipLeft + '  [' + this.bindLabel('lethal') + ']';
        el.classList.toggle('none', p.equipLeft <= 0);
        el.classList.remove('hidden');
      } else el.classList.add('hidden');
    }
    const tacKey = (p.equipTac || 'none') + ':' + p.equipTacLeft + ':' + this.codeFor('tactical');
    if (c.tacKey !== tacKey) {
      c.tacKey = tacKey;
      const el = this.$('tacCount');
      if (p.equipTac) {
        el.textContent = THROWABLES[p.equipTac].name + ' ×' + p.equipTacLeft + '  [' + this.bindLabel('tactical') + ']';
        el.classList.toggle('none', p.equipTacLeft <= 0);
        el.classList.remove('hidden');
      } else el.classList.add('hidden');
    }
    if (c.hp !== p.hp) {
      c.hp = p.hp;
      const hb = this.$('healthBar');
      hb.style.width = Math.max(0, p.hp) + '%';
      hb.style.background = p.hp > 55 ? '#7fb069' : p.hp > 25 ? '#d9a13d' : '#d05040';
      this.$('vignette').style.opacity = p.hp < 100 ? Math.min(0.9, (100 - p.hp) / 90) * (p.hp < 40 ? 1 : 0.6) : 0;
    }
    // #18e: live zoom readout, shown only while scoped on a high-zoom optic
    const zoomTxt = (weapon.zoom > 3 && p.adsAmt > 0.5) ? p.zoomLevel.toFixed(1) + '×' : '';
    if (c.zoom !== zoomTxt) {
      c.zoom = zoomTxt;
      const el = this.$('zoomLevel');
      el.textContent = zoomTxt;
      el.classList.toggle('hidden', !zoomTxt);
    }
  },

  updateFragDanger(info) {
    const c = this._hudCache;
    const el = this.$('fragDanger');
    if (!info) {
      if (c.fragDanger !== 'hidden') {
        c.fragDanger = 'hidden';
        el.classList.add('hidden');
        el.classList.remove('urgent');
      }
      return;
    }
    const dist = Math.max(0, Math.round(info.distance));
    const key = dist + ':' + info.angle.toFixed(2) + ':' + (info.urgent ? 1 : 0);
    if (c.fragDanger === key) return;
    c.fragDanger = key;
    el.style.setProperty('--frag-angle', info.angle.toFixed(3) + 'rad');
    el.querySelector('.frag-label').textContent = 'FRAG ' + dist + 'm';
    el.classList.toggle('urgent', info.urgent);
    el.classList.remove('hidden');
  },

  updateModeLabels(mode, scoreLimit) {
    if (!mode) return;
    if (mode.structure === 'ffa') {
      const tfName = document.querySelector('#scorebar .team-score.tf .tname');
      const spName = document.querySelector('#scorebar .team-score.sp .tname');
      if (tfName) tfName.textContent = 'YOU';
      if (spName) spName.textContent = 'LEADER';
      const wrap = this.$('scoreboard').querySelector('.sb-wrap');
      if (wrap) wrap.innerHTML = `
        <div class="sb-team ffa"><div class="sb-head ffa">${mode.name}</div>
          <table id="sbTableFFA"><thead><tr><th>RANK</th><th>NAME</th><th>SCORE</th><th>A</th><th>D</th><th>K/D</th></tr></thead><tbody></tbody></table></div>`;
      const obj = this.$('objText');
      if (obj) obj.textContent = mode.goalText || `${mode.name} — ${mode.hudGoal || 'FIRST TO'} ${scoreLimit}`;
      return;
    }
    const teams = mode.teams || [];
    const left = teams[0] || 'tf', right = teams[1] || 'sp';
    const labels = mode.teamLabels || {};
    const leftName = labels[left] || left.toUpperCase();
    const rightName = labels[right] || right.toUpperCase();
    const tfName = document.querySelector('#scorebar .team-score.tf .tname');
    const spName = document.querySelector('#scorebar .team-score.sp .tname');
    if (tfName) tfName.textContent = leftName;
    if (spName) spName.textContent = rightName;
    const wrap = this.$('scoreboard').querySelector('.sb-wrap');
    if (wrap) wrap.innerHTML = `
      <div class="sb-team">
        <div class="sb-head tf">${leftName} &mdash; <span id="sbScoreTF"></span></div>
        <table id="sbTableTF"><thead><tr><th>NAME</th><th>K</th><th>A</th><th>D</th><th>K/D</th></tr></thead><tbody></tbody></table>
      </div>
      <div class="sb-team">
        <div class="sb-head sp">${rightName} &mdash; <span id="sbScoreSP"></span></div>
        <table id="sbTableSP"><thead><tr><th>NAME</th><th>K</th><th>A</th><th>D</th><th>K/D</th></tr></thead><tbody></tbody></table>
      </div>`;
    const obj = this.$('objText');
    if (obj) obj.textContent = mode.goalText || `${mode.name} — ${mode.hudGoal || 'FIRST TO'} ${scoreLimit}`;
  },

  updateScores(mode, scores, timeLeft, combatants) {
    const c = this._hudCache;
    let tf, sp;
    if (mode && mode.structure === 'ffa') {
      const ranked = (combatants || []).slice().sort((a, b) =>
        ((scores[b.team] || 0) - (scores[a.team] || 0)) ||
        (b.kills - a.kills) || ((a.deaths || 0) - (b.deaths || 0)) || a.name.localeCompare(b.name));
      const me = (combatants || []).find(x => x.isPlayer);
      tf = me ? scores[me.team] || me.kills || 0 : 0;
      sp = ranked.length ? scores[ranked[0].team] || ranked[0].kills || 0 : 0;
    } else {
      const teams = (mode && mode.teams) || ['tf', 'sp'];
      tf = scores[teams[0]] || 0;
      sp = scores[teams[1]] || 0;
    }
    if (c.tf !== tf) { c.tf = tf; this.$('scoreTF').textContent = tf; }
    if (c.sp !== sp) { c.sp = sp; this.$('scoreSP').textContent = sp; }
    let timer;
    if (!isFinite(timeLeft)) {
      timer = '∞';
    } else {
      const m = Math.floor(Math.max(0, timeLeft) / 60), s = Math.floor(Math.max(0, timeLeft) % 60);
      timer = m + ':' + String(s).padStart(2, '0');
    }
    if (c.timer !== timer) { c.timer = timer; this.$('matchTimer').textContent = timer; }
  },

  showHitmarker(kill) {
    const hm = this.$('hitmarker');
    hm.classList.remove('hidden');
    hm.classList.toggle('kill', !!kill);
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => hm.classList.add('hidden'), kill ? 160 : 90);
  },

  // killstreak announce banner at the top of the screen — earned
  // ("UAV READY — PRESS [G]") and deployed ("UAV ONLINE") both flow through it
  showStreakBanner(text) {
    const el = this.$('streakBanner');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._sbT);
    this._sbT = setTimeout(() => el.classList.add('hidden'), 2500);
  },

  // tactical nuke countdown, big and red under the scorebar (null hides it);
  // called every frame while a nuke is inbound, so gate the DOM write
  _nukeSec: null,
  setNukeCountdown(sec) {
    if (sec === this._nukeSec) return;
    this._nukeSec = sec;
    const el = this.$('nukeCountdown');
    if (sec === null) { el.classList.add('hidden'); return; }
    el.textContent = '☢ TACTICAL NUKE INBOUND — ' + sec + ' ☢';
    el.classList.remove('hidden');
  },

  // stun whiteout: opacity driven per frame while the player is stunned
  // (main loop passes 0 when not — cache gates the DOM write)
  _stunV: 0,
  stunOverlay(v) {
    if (v === this._stunV) return;
    this._stunV = v;
    this.$('stunFlash').style.opacity = v;
  },

  // detonation whiteout: snap to full white, then fade to reveal the end screen
  nukeFlash() {
    const el = this.$('nukeFlash');
    el.classList.remove('fade');
    el.classList.add('flash');
    void el.offsetWidth; // commit the full-white frame so the fade transitions from it
    el.classList.remove('flash');
    el.classList.add('fade');
  },
  clearNukeFlash() {
    this.$('nukeFlash').classList.remove('flash', 'fade');
  },

  // banked-killstreak selector under the minimap (null hides it)
  setStreakTag(text) {
    const el = this.$('streakTag');
    if (text) {
      el.textContent = text;
      el.classList.remove('hidden');
    } else el.classList.add('hidden');
  },

  showKillMsg(text, streak = false) {
    const el = this.$('killMsg');
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.toggle('streak', streak);
    clearTimeout(this._kmT);
    this._kmT = setTimeout(() => { el.classList.add('hidden'); el.classList.remove('streak'); }, 2000);
  },

  damageDirection(angle) {
    const el = this.$('dmgIndicator');
    el.style.transform = `rotate(${angle}rad)`;
    el.style.opacity = 1;
    clearTimeout(this._diT);
    this._diT = setTimeout(() => { el.style.opacity = 0; }, 600);
  },

  crosshairSpread(px, visible) {
    this._chT.style.transform = `translate(0px,${-px}px)`;
    this._chB.style.transform = `translate(0px,${px}px)`;
    this._chL.style.transform = `translate(${-px}px,0px)`;
    this._chR.style.transform = `translate(${px}px,0px)`;
    this.$('crosshair').style.opacity = visible ? 1 : 0;
  },

  buildScoreboard(mode, combatants, scores) {
    if (mode && mode.structure === 'ffa') {
      const table = this.$('sbTableFFA');
      const scoreHead = mode.scoreSource === 'gunLadder' ? 'TIER' : 'K';
      table.querySelector('thead tr').innerHTML = `<th>RANK</th><th>NAME</th><th>${scoreHead}</th><th>A</th><th>D</th><th>K/D</th>`;
      const tbody = table.querySelector('tbody');
      tbody.innerHTML = '';
      combatants.slice()
        .sort((a, b) => ((scores[b.team] || 0) - (scores[a.team] || 0)) ||
          (b.kills - a.kills) || ((a.deaths || 0) - (b.deaths || 0)) || a.name.localeCompare(b.name))
        .forEach((c, i) => {
          const kd = c.deaths > 0 ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2);
          const tr = document.createElement('tr');
          if (c.isPlayer) tr.className = 'me';
          tr.innerHTML = `<td>${i + 1}</td><td>${c.name}</td><td>${scores[c.team] || c.kills}</td><td>${c.assists || 0}</td><td>${c.deaths}</td><td>${kd}</td>`;
          tbody.appendChild(tr);
        });
      return;
    }
    const teams = (mode && mode.teams) || ['tf', 'sp'];
    this.$('sbScoreTF').textContent = scores[teams[0]] || 0;
    this.$('sbScoreSP').textContent = scores[teams[1]] || 0;
    for (const team of teams) {
      const table = this.$(team === 'tf' ? 'sbTableTF' : 'sbTableSP');
      table.querySelector('thead tr').innerHTML = '<th>NAME</th><th>K</th><th>A</th><th>D</th><th>K/D</th>';
      const tbody = table.querySelector('tbody');
      tbody.innerHTML = '';
      combatants.filter(c => c.team === team)
        .sort((a, b) => b.kills - a.kills)
        .forEach(c => {
          const kd = c.deaths > 0 ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2);
          const tr = document.createElement('tr');
          if (c.isPlayer) tr.className = 'me';
          tr.innerHTML = `<td>${c.name}</td><td>${c.kills}</td><td>${c.assists || 0}</td><td>${c.deaths}</td><td>${kd}</td>`;
          tbody.appendChild(tr);
        });
    }
  },

  // P7: compact XP recap panel on the end screen. commit is the object
  // returned by Profile.commitMatch (null on double-fire -> panel hidden).
  renderEndXp(commit) {
    const el = this.$('endXp');
    if (!commit) { el.classList.add('hidden'); return; }
    const x = commit.xp, s = commit.stats;
    const lines = [
      ['DIRECT KILLS',    s.kills,           x.directKills],
      ['KILLSTREAK KILLS',s.killstreakKills, x.killstreakKills],
      ['ASSISTS',         s.assists,         x.assists],
      ['HEADSHOT BONUS',  s.headshots,       x.headshots],
      ['MELEE BONUS',     s.meleeKills,      x.meleeKills],
      ['NUKE BONUS',      s.nukesCalled,     x.nukeBonus],
      ['MATCH COMPLETE',  0,                 x.matchComplete],
      ['VICTORY',         0,                 x.matchWin],
    ].filter(l => l[2] > 0);
    const rows = lines.map(l =>
      `<div class="xp-line"><span>${l[0]}${l[1] > 1 ? ' ×' + l[1] : ''}</span><span>+${l[2]}</span></div>`).join('');
    const lvl = commit.leveledUp
      ? `LVL ${commit.oldLevel} → LVL ${commit.newLevel} — ${Profile.rankName(commit.newLevel)}`
      : `LVL ${commit.newLevel} — ${Profile.rankName(commit.newLevel)}`;
    // P13: unlock summary — every item whose unlockLevel falls inside the
    // levels gained this match (data-only; nothing is enforced yet)
    let unlockRows = '';
    if (commit.leveledUp) {
      const pools = [WEAPONS, ATTACHMENTS];
      const unlocked = [];
      for (const pool of pools)
        for (const k in pool) {
          const u = pool[k].unlockLevel;
          if (u > commit.oldLevel && u <= commit.newLevel) unlocked.push(pool[k].name);
        }
      for (const tier of Object.values(PERKS))
        for (const perk of tier) {
          const u = perk.unlockLevel;
          if (u > commit.oldLevel && u <= commit.newLevel) unlocked.push(perk.name);
        }
      unlockRows = unlocked.map(n =>
        `<div class="xp-unlock">UNLOCKED — ${n}</div>`).join('');
    }
    const pr = commit.progress;
    const pct = pr.needed > 0 ? Math.round(100 * pr.current / pr.needed) : 100;
    el.innerHTML = `
      <div class="xp-lines">${rows}
        <div class="xp-line total"><span>TOTAL XP</span><span>+${x.total}</span></div></div>
      <div class="xp-level${commit.leveledUp ? ' up' : ''}">${lvl}</div>${unlockRows}
      <div class="xp-bar"><div class="xp-fill" style="width:${pct}%"></div></div>
      <div class="xp-progress">${pr.needed > 0 ? pr.current + ' / ' + pr.needed + ' XP' : 'MAX LEVEL'}</div>
      <div class="xp-deltas">K ${s.kills}&nbsp;&nbsp;D ${s.deaths}&nbsp;&nbsp;A ${s.assists}&nbsp;&nbsp;HS ${s.headshots}</div>`;
    el.classList.remove('hidden');
  },

  showEnd(mode, win, scores, combatants, commit) {
    this.renderEndXp(commit);
    if (mode && mode.structure === 'ffa') {
      const res = this.$('endResult');
      res.textContent = win === null ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT';
      res.className = win === null ? 'draw' : win ? 'win' : 'lose';
      const ranked = combatants.slice()
        .sort((a, b) => ((scores[b.team] || 0) - (scores[a.team] || 0)) ||
          (b.kills - a.kills) || ((a.deaths || 0) - (b.deaths || 0)) || a.name.localeCompare(b.name));
      const meRank = ranked.findIndex(c => c.isPlayer) + 1;
      const leader = ranked[0];
      const me = combatants.find(c => c.isPlayer);
      this.$('endScore').textContent = leader && me
        ? `#${meRank}  YOU ${scores[me.team] || 0}  —  LEADER ${scores[leader.team] || leader.kills}`
        : '';
      const boards = this.$('endBoards');
      const scoreHead = mode.scoreSource === 'gunLadder' ? 'TIER' : 'K';
      boards.innerHTML = `
        <div class="sb-team ffa"><div class="sb-head ffa">${mode.name}</div>
          <table><thead><tr><th>RANK</th><th>NAME</th><th>${scoreHead}</th><th>A</th><th>D</th><th>K/D</th></tr></thead><tbody id="endFFA"></tbody></table></div>`;
      const tbody = this.$('endFFA');
      ranked.forEach((c, i) => {
        const kd = c.deaths > 0 ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2);
        const tr = document.createElement('tr');
        if (c.isPlayer) tr.className = 'me';
        tr.innerHTML = `<td>${i + 1}</td><td>${c.name}</td><td>${scores[c.team] || c.kills}</td><td>${c.assists || 0}</td><td>${c.deaths}</td><td>${kd}</td>`;
        tbody.appendChild(tr);
      });
      this.show('endScreen');
      return;
    }
    const teams = (mode && mode.teams) || ['tf', 'sp'];
    const labels = (mode && mode.teamLabels) || {};
    const left = teams[0], right = teams[1];
    const leftName = labels[left] || left.toUpperCase();
    const rightName = labels[right] || right.toUpperCase();
    const leftScore = scores[left] || 0;
    const rightScore = scores[right] || 0;
    const res = this.$('endResult');
    res.textContent = win === null ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT';
    res.className = win === null ? 'draw' : win ? 'win' : 'lose';
    this.$('endScore').textContent = `${leftName}  ${leftScore}  —  ${rightScore}  ${rightName}`;
    // reuse scoreboard tables inside end screen
    const boards = this.$('endBoards');
    boards.innerHTML = `
      <div class="sb-team"><div class="sb-head tf">${leftName}</div>
        <table><thead><tr><th>NAME</th><th>K</th><th>A</th><th>D</th><th>K/D</th></tr></thead><tbody id="endTF"></tbody></table></div>
      <div class="sb-team"><div class="sb-head sp">${rightName}</div>
        <table><thead><tr><th>NAME</th><th>K</th><th>A</th><th>D</th><th>K/D</th></tr></thead><tbody id="endSP"></tbody></table></div>`;
    for (const team of teams) {
      const tbody = this.$(team === 'tf' ? 'endTF' : 'endSP');
      combatants.filter(c => c.team === team)
        .sort((a, b) => b.kills - a.kills)
        .forEach(c => {
          const kd = c.deaths > 0 ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2);
          const tr = document.createElement('tr');
          if (c.isPlayer) tr.className = 'me';
          tr.innerHTML = `<td>${c.name}</td><td>${c.kills}</td><td>${c.assists || 0}</td><td>${c.deaths}</td><td>${kd}</td>`;
          tbody.appendChild(tr);
        });
    }
    this.show('endScreen');
  },
};
