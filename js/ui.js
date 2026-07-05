// ============================================================
// UI — menus, create-a-class (localStorage), settings, HUD.
// main.js exposes window.MAIN = { startMatch, deploy, resume, quitMatch }.
// ============================================================

const UI = {
  settings: { sens: 1.0, fov: 80, volume: 0.7, difficulty: 'regular', teamSize: 6, scoreLimit: 75, timeLimit: 600 },
  classes: [],
  editIdx: 0,        // class being edited
  selectedClass: 0,  // class chosen on spawn screen

  $(id) { return document.getElementById(id); },

  init() {
    this.loadSettings();
    this.loadClasses();
    this.bindMenus();
    this.renderClassEditor();
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
  },
  saveSettings() { localStorage.setItem('tf_settings', JSON.stringify(this.settings)); },
  loadClasses() {
    try {
      const c = JSON.parse(localStorage.getItem('tf_classes'));
      if (Array.isArray(c) && c.length === 5) { this.classes = c; return; }
    } catch (e) {}
    this.classes = DEFAULT_CLASSES.map(c => JSON.parse(JSON.stringify(c)));
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
        MAIN.startMatch(card.dataset.map);
      });
    });
    this.$('btnClasses').onclick = () => { AudioSys.uiClick(); this.renderClassEditor(); this.show('classScreen'); };
    this.$('btnSettings').onclick = () => { AudioSys.uiClick(); this.renderSettings(); this.show('settingsScreen'); };
    this.$('btnClassBack').onclick = () => { AudioSys.uiClick(); this.saveClasses(); this.show(MAIN.inMatch() ? 'spawnScreen' : 'menu'); if (MAIN.inMatch()) this.renderSpawnScreen(); };
    this.$('btnSettingsBack').onclick = () => { AudioSys.uiClick(); this.show('menu'); };
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
  },

  renderPauseSettings() {
    const s = this.settings;
    this.$('pauseSens').value = s.sens; this.$('pauseSensVal').textContent = s.sens.toFixed(1);
    this.$('pauseFov').value = s.fov; this.$('pauseFovVal').textContent = s.fov.toFixed(0);
    this.$('pauseVol').value = s.volume; this.$('pauseVolVal').textContent = Math.round(s.volume * 100) + '%';
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
      c.primary = key; this.saveClasses(); this.renderClassEditor(); this.renderWeaponStats(key);
    });
    mkWeaponList('secondaryList', 'secondary', c.secondary, key => {
      c.secondary = key; this.saveClasses(); this.renderClassEditor(); this.renderWeaponStats(key);
    });
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
  },

  renderWeaponStats(key) {
    const w = WEAPONS[key];
    const wrap = this.$('weaponStats');
    let html = `<div style="font-weight:700;letter-spacing:1px;margin-bottom:8px">${w.name} <span style="color:#6a7060;font-size:9px">${w.cat} &middot; ${fireModeLabel(w)} &middot; ${w.mag} RND MAG</span></div>`;
    for (const [label, val] of weaponStatBars(w)) {
      html += `<div class="stat-row"><div class="s-label">${label}</div><div class="stat-bar"><div style="width:${Math.round(val * 100)}%"></div></div></div>`;
    }
    wrap.innerHTML = html;
  },

  // ---------- spawn screen ----------
  renderSpawnScreen(deathInfo) {
    const wrap = this.$('spawnClasses');
    wrap.innerHTML = '';
    this.classes.forEach((c, i) => {
      const div = document.createElement('div');
      div.className = 'spawn-class' + (i === this.selectedClass ? ' active' : '');
      const perkNames = c.perks.map(id => { const p = perkById(id); return p ? p.name : id; }).join(' / ');
      div.innerHTML = `<div class="sc-name">${c.name}</div>
        <div class="sc-weap">${WEAPONS[c.primary].name} + ${WEAPONS[c.secondary].name}</div>
        <div class="sc-perks">${perkNames}</div>`;
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
      el.textContent = 'RESPAWN IN ' + Math.ceil(t);
      btn.disabled = true;
    } else {
      el.textContent = '';
      btn.disabled = false;
    }
  },

  // ---------- HUD ----------
  killfeed(killerName, killerTeam, victimName, victimTeam, weaponName, headshot) {
    const feed = this.$('killfeed');
    const div = document.createElement('div');
    div.className = 'kf-entry';
    div.innerHTML = `<span class="kf-${killerTeam}">${killerName}</span>
      <span class="kf-weap"> [${weaponName}${headshot ? ' <span class="kf-hs">&#9678;</span>' : ''}] </span>
      <span class="kf-${victimTeam}">${victimName}</span>`;
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
    if (c.hp !== p.hp) {
      c.hp = p.hp;
      const hb = this.$('healthBar');
      hb.style.width = Math.max(0, p.hp) + '%';
      hb.style.background = p.hp > 55 ? '#7fb069' : p.hp > 25 ? '#d9a13d' : '#d05040';
      this.$('vignette').style.opacity = p.hp < 100 ? Math.min(0.9, (100 - p.hp) / 90) * (p.hp < 40 ? 1 : 0.6) : 0;
    }
  },

  updateScores(tf, sp, timeLeft) {
    const c = this._hudCache;
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

  buildScoreboard(combatants, tf, sp) {
    this.$('sbScoreTF').textContent = tf;
    this.$('sbScoreSP').textContent = sp;
    for (const team of ['tf', 'sp']) {
      const table = this.$(team === 'tf' ? 'sbTableTF' : 'sbTableSP');
      table.querySelector('thead tr').innerHTML = '<th>NAME</th><th>K</th><th>D</th><th>K/D</th>';
      const tbody = table.querySelector('tbody');
      tbody.innerHTML = '';
      combatants.filter(c => c.team === team)
        .sort((a, b) => b.kills - a.kills)
        .forEach(c => {
          const kd = c.deaths > 0 ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2);
          const tr = document.createElement('tr');
          if (c.isPlayer) tr.className = 'me';
          tr.innerHTML = `<td>${c.name}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${kd}</td>`;
          tbody.appendChild(tr);
        });
    }
  },

  showEnd(win, tf, sp, combatants) {
    const res = this.$('endResult');
    res.textContent = win === null ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT';
    res.className = win === null ? 'draw' : win ? 'win' : 'lose';
    this.$('endScore').textContent = `TASK FORCE  ${tf}  —  ${sp}  SPETSNAZ`;
    // reuse scoreboard tables inside end screen
    const boards = this.$('endBoards');
    boards.innerHTML = `
      <div class="sb-team"><div class="sb-head tf">TASK FORCE</div>
        <table><thead><tr><th>NAME</th><th>K</th><th>D</th><th>K/D</th></tr></thead><tbody id="endTF"></tbody></table></div>
      <div class="sb-team"><div class="sb-head sp">SPETSNAZ</div>
        <table><thead><tr><th>NAME</th><th>K</th><th>D</th><th>K/D</th></tr></thead><tbody id="endSP"></tbody></table></div>`;
    for (const team of ['tf', 'sp']) {
      const tbody = this.$(team === 'tf' ? 'endTF' : 'endSP');
      combatants.filter(c => c.team === team)
        .sort((a, b) => b.kills - a.kills)
        .forEach(c => {
          const kd = c.deaths > 0 ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2);
          const tr = document.createElement('tr');
          if (c.isPlayer) tr.className = 'me';
          tr.innerHTML = `<td>${c.name}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${kd}</td>`;
          tbody.appendChild(tr);
        });
    }
    this.show('endScreen');
  },
};
