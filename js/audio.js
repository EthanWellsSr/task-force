// ============================================================
// Procedural audio — WebAudio synthesis, no asset files.
// ============================================================
const AudioSys = {
  ctx: null, master: null, noiseBuf: null,
  volume: 0.7,
  _recentShots: 0, _shotWindow: 0,

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // 1 second of white noise, reused by every gunshot
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { return false; }
  },

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  },

  _env(gainNode, peak, decay) {
    const t = this.ctx.currentTime;
    gainNode.gain.setValueAtTime(peak, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + decay);
  },

  // Rate-limit distant bot gunfire so 12 bots don't destroy the mix
  _allowShot() {
    const now = performance.now();
    if (now - this._shotWindow > 120) { this._shotWindow = now; this._recentShots = 0; }
    this._recentShots++;
    return this._recentShots <= 4;
  },

  // type: 'ar' | 'smg' | 'lmg' | 'sniper' | 'pistol' | 'shotgun'
  shot(type, dist = 0) {
    if (!this.ensure()) return;
    if (dist > 0 && !this._allowShot()) return;
    const atten = dist <= 0 ? 1 : Math.max(0.04, 1 - dist / 85);
    const cfg = {
      ar:      { freq: 850,  decay: 0.13, gain: 0.5,  thump: 130 },
      smg:     { freq: 1100, decay: 0.09, gain: 0.42, thump: 160 },
      lmg:     { freq: 700,  decay: 0.16, gain: 0.55, thump: 110 },
      sniper:  { freq: 380,  decay: 0.42, gain: 0.85, thump: 70  },
      pistol:  { freq: 1250, decay: 0.08, gain: 0.42, thump: 180 },
      shotgun: { freq: 500,  decay: 0.3,  gain: 0.8,  thump: 85  },
    }[type] || { freq: 900, decay: 0.12, gain: 0.5, thump: 130 };

    const t = this.ctx.currentTime;
    // noise crack
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = cfg.freq; bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    this._env(g, cfg.gain * atten, cfg.decay);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + cfg.decay + 0.05);
    // low thump
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(cfg.thump, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    const g2 = this.ctx.createGain();
    this._env(g2, 0.4 * atten, 0.09);
    osc.connect(g2); g2.connect(this.master);
    osc.start(t); osc.stop(t + 0.12);
  },

  hit(kill = false) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = kill ? 520 : 1600;
    const g = this.ctx.createGain();
    this._env(g, 0.22, kill ? 0.18 : 0.05);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.2);
    if (kill) {
      const o2 = this.ctx.createOscillator();
      o2.type = 'square'; o2.frequency.value = 780;
      const g2 = this.ctx.createGain();
      this._env(g2, 0.18, 0.22);
      o2.connect(g2); g2.connect(this.master);
      o2.start(t + 0.07); o2.stop(t + 0.32);
    }
  },

  reload() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    [0, 0.12].forEach((dt, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square'; osc.frequency.value = i ? 900 : 600;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, t + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.03);
      osc.connect(g); g.connect(this.master);
      osc.start(t + dt); osc.stop(t + dt + 0.05);
    });
  },

  dry() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square'; osc.frequency.value = 1400;
    const g = this.ctx.createGain();
    this._env(g, 0.08, 0.025);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.04);
  },

  hurt() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    const g = this.ctx.createGain();
    this._env(g, 0.25, 0.13);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.16);
  },

  uiClick() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 700;
    const g = this.ctx.createGain();
    this._env(g, 0.1, 0.05);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.07);
  },

  footstep(sprint) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = sprint ? 420 : 290;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(sprint ? 0.055 : 0.038, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.12);
    // subtle heel click
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(sprint ? 220 : 160, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.06);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.04, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(g2); g2.connect(this.master);
    osc.start(t); osc.stop(t + 0.08);
  },

  matchEnd(win) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const notes = win ? [392, 494, 587, 784] : [392, 370, 311, 262];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle'; osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.18, t + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.16 + 0.3);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.16); osc.stop(t + i * 0.16 + 0.35);
    });
  },
};
