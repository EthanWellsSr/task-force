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

  // Destination for a positional sound: a StereoPannerNode into master,
  // or master itself when centered / panning is unsupported
  _dest(pan) {
    if (!pan || !this.ctx.createStereoPanner) return this.master;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  },

  // Rate-limit distant bot gunfire so 12 bots don't destroy the mix
  _allowShot() {
    const now = performance.now();
    if (now - this._shotWindow > 120) { this._shotWindow = now; this._recentShots = 0; }
    this._recentShots++;
    return this._recentShots <= 4;
  },

  // type: 'ar' | 'ak' | 'marksman' | 'smg' | 'lmg' | 'sniper' | 'pistol' | 'shotgun'
  // pan: -1 (left) .. 1 (right) from the listener's perspective
  // P55: suppressed — the crack drops into a flat low "pat": gain ×0.4,
  // band pulled to ~480 Hz, decay ×0.7, and NO thump oscillator at all.
  shot(type, dist = 0, pan = 0, suppressed = false) {
    if (!this.ensure()) return;
    if (dist > 0 && !this._allowShot()) return;
    const atten = dist <= 0 ? 1 : Math.max(0.04, 1 - dist / 85);
    const cfg = {
      ar:      { freq: 850,  decay: 0.13, gain: 0.5,  thump: 130 },
      ak:      { freq: 650,  decay: 0.17, gain: 0.6,  thump: 105 },
      marksman:{ freq: 520,  decay: 0.24, gain: 0.68, thump: 90  },
      smg:     { freq: 1100, decay: 0.09, gain: 0.42, thump: 160 },
      lmg:     { freq: 700,  decay: 0.16, gain: 0.55, thump: 110 },
      sniper:  { freq: 380,  decay: 0.42, gain: 0.85, thump: 70  },
      pistol:  { freq: 1250, decay: 0.08, gain: 0.42, thump: 180 },
      shotgun: { freq: 500,  decay: 0.3,  gain: 0.8,  thump: 85  },
    }[type] || { freq: 900, decay: 0.12, gain: 0.5, thump: 130 };

    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    // noise crack (a suppressed one is quieter, duller, shorter)
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = suppressed ? 480 : cfg.freq;
    bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    const decay = cfg.decay * (suppressed ? 0.7 : 1);
    this._env(g, cfg.gain * (suppressed ? 0.4 : 1) * atten, decay);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(t); src.stop(t + decay + 0.05);
    if (suppressed) return; // no thump — the "pat" is the whole report
    // low thump
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(cfg.thump, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    const g2 = this.ctx.createGain();
    this._env(g2, 0.4 * atten, 0.09);
    osc.connect(g2); g2.connect(out);
    osc.start(t); osc.stop(t + 0.12);
  },

  // crossbow release — a taut string "thwip" (noise sweeping high→low) over a
  // short low limb "thunk"; no gunpowder crack.
  bow(dist = 0, pan = 0) {
    if (!this.ensure()) return;
    if (dist > 0 && !this._allowShot()) return;
    const atten = dist <= 0 ? 1 : Math.max(0.04, 1 - dist / 85);
    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(2200, t);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.07);
    const g = this.ctx.createGain();
    this._env(g, 0.34 * atten, 0.08);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.12);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.09);
    const g2 = this.ctx.createGain();
    this._env(g2, 0.3 * atten, 0.1);
    osc.connect(g2); g2.connect(out);
    osc.start(t); osc.stop(t + 0.13);
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

  reload(profile = null, empty = false, duration = 0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    if (profile === 'ak') {
      // Steel magazine latch/reseat, followed only on an empty gun by the
      // right-side carrier pull and release. Event positions scale with the
      // live duration so Sleight of Hand remains synchronized.
      const dur = Math.max(0.4, duration || 2.35);
      const events = [
        { at: dur * 0.2, freq: 430, gain: 0.15 },
        { at: dur * 0.62, freq: 760, gain: 0.18 },
      ];
      if (empty) events.push(
        { at: dur * 0.82, freq: 330, gain: 0.16 },
        { at: dur * 0.91, freq: 940, gain: 0.2 });
      for (const ev of events) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = ev.freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.setValueAtTime(ev.gain, t + ev.at);
        g.gain.exponentialRampToValueAtTime(0.001, t + ev.at + 0.045);
        osc.connect(g); g.connect(this.master);
        osc.start(t + ev.at); osc.stop(t + ev.at + 0.06);
      }
      return;
    }
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

  // dist > 0: an enemy's step — attenuated, inaudible past ~18 m,
  // boosted vs the player's own so it reads as an awareness cue
  footstep(sprint, dist = 0, pan = 0) {
    if (!this.ensure()) return;
    const atten = dist <= 0 ? 1 : Math.min(1.3, 1.6 * (1 - dist / 18));
    if (atten <= 0.02) return;
    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = sprint ? 420 : 290;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime((sprint ? 0.055 : 0.038) * atten, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(lp); lp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.12);
    // subtle heel click
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(sprint ? 220 : 160, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.06);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.04 * atten, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(g2); g2.connect(out);
    osc.start(t); osc.stop(t + 0.08);
  },

  // grenade pin pull: tiny bright metallic click
  pinPull() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square'; osc.frequency.value = 2200;
    const g = this.ctx.createGain();
    this._env(g, 0.07, 0.03);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.05);
  },

  // grenade toss: short rising noise whoosh
  throwWhoosh() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(1600, t + 0.16);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.24);
  },

  // grenade bouncing off the world: dull metallic tick, inaudible far away
  grenadeBounce(dist = 0, pan = 0) {
    if (!this.ensure()) return;
    const atten = dist <= 0 ? 1 : Math.max(0, 1 - dist / 30);
    if (atten <= 0.03) return;
    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1900, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    const g = this.ctx.createGain();
    this._env(g, 0.12 * atten, 0.06);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + 0.08);
  },

  // stun grenade pop: sharp high crack + a lingering ears-ringing tone
  stunBang(dist = 0, pan = 0) {
    if (!this.ensure()) return;
    const atten = dist <= 0 ? 1 : Math.max(0.05, 1 - dist / 60);
    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    // crack
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1400;
    const g = this.ctx.createGain();
    this._env(g, 0.75 * atten, 0.13);
    src.connect(hp); hp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.16);
    // ring (only really audible close up — where you'd be stunned)
    const osc = this.ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 3400;
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.11 * atten * atten, t + 0.03);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    osc.connect(g2); g2.connect(out);
    osc.start(t); osc.stop(t + 1.4);
  },

  // P48: flashbang pop — harder and brighter than the stun's crack:
  // higher band, more gain, plus a split-second 2.6 kHz blip. No baked-in
  // ring — the ring (flashRing) belongs only to whoever got flashed.
  flashPop(dist = 0, pan = 0) {
    if (!this.ensure()) return;
    const atten = dist <= 0 ? 1 : Math.max(0.05, 1 - dist / 65);
    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    // crack
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2100;
    const g = this.ctx.createGain();
    this._env(g, 0.9 * atten, 0.11);
    src.connect(hp); hp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.14);
    // blip
    const osc = this.ctx.createOscillator();
    osc.type = 'square'; osc.frequency.value = 2600;
    const g2 = this.ctx.createGain();
    this._env(g2, 0.12 * atten, 0.05);
    osc.connect(g2); g2.connect(out);
    osc.start(t); osc.stop(t + 0.08);
  },

  // P48: the flashed PLAYER's ear-ring — a pure high sine that holds
  // while the whiteout holds, then dies with it. In your head, not in
  // the world: no distance, no pan, straight to master.
  flashRing(dur = 3) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 3700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.04);
    g.gain.setValueAtTime(0.15, t + Math.max(0.1, dur * 0.35));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.1);
  },

  // P51: snapshot pop — a sonar chirp: two quick rising sine pips a
  // fourth apart with a short ring-off. Reads "scanner", not "weapon" —
  // deliberately unlike every bang in the kit so victims can learn it.
  sonarPing(dist = 0, pan = 0) {
    if (!this.ensure()) return;
    const atten = dist <= 0 ? 1 : Math.max(0.05, 1 - dist / 55);
    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    for (const [at, f0, f1] of [[0, 920, 1500], [0.15, 1220, 2000]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0, t + at);
      osc.frequency.exponentialRampToValueAtTime(f1, t + at + 0.09);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.2 * atten, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + at + 0.38);
      osc.connect(g); g.connect(out);
      osc.start(t + at); osc.stop(t + at + 0.42);
    }
  },

  // P49: decoy grenade's fake gunshot — the AR crack recipe run muffled:
  // band dropped to ~550 Hz (jittered per pop so no two reads identical),
  // softer gain, duller thump. Reads as suppressed fire a block away.
  decoyShot(dist = 0, pan = 0) {
    if (!this.ensure()) return;
    const atten = dist <= 0 ? 1 : Math.max(0.04, 1 - dist / 70);
    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    // muffled noise crack
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480 + Math.random() * 180;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    this._env(g, 0.3 * atten, 0.12);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.17);
    // dull thump
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(105, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.07);
    const g2 = this.ctx.createGain();
    this._env(g2, 0.22 * atten, 0.09);
    osc.connect(g2); g2.connect(out);
    osc.start(t); osc.stop(t + 0.12);
  },

  // smoke grenade pop: soft thump + a hiss tail while the canister spews
  smokePop(dist = 0, pan = 0) {
    if (!this.ensure()) return;
    const atten = dist <= 0 ? 1 : Math.max(0.04, 1 - dist / 45);
    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    // thump
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const g = this.ctx.createGain();
    this._env(g, 0.5 * atten, 0.14);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + 0.16);
    // hiss sighing off as the cloud fills in
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true; // the buffer is 1 s, the hiss runs ~2.5
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(3200, t);
    bp.frequency.exponentialRampToValueAtTime(1400, t + 2.2);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.14 * atten, t + 0.08);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    src.connect(bp); bp.connect(g2); g2.connect(out);
    src.start(t); src.stop(t + 2.5);
  },

  // incoming napalm canister: short descending whistle
  incoming(dist = 0, pan = 0) {
    if (!this.ensure()) return;
    const atten = dist <= 0 ? 1 : Math.max(0.06, 1 - dist / 80);
    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06 * atten, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + 0.55);
  },

  // napalm impact: noise rumble + deep boom, attenuated & panned
  explosion(dist = 0, pan = 0) {
    if (!this.ensure()) return;
    const atten = dist <= 0 ? 1 : Math.max(0.06, 1 - dist / 90);
    const t = this.ctx.currentTime;
    const out = this._dest(pan);
    // rumble
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    const g = this.ctx.createGain();
    this._env(g, 0.9 * atten, 0.6);
    src.connect(lp); lp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.7);
    // boom
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.35);
    const g2 = this.ctx.createGain();
    this._env(g2, 0.7 * atten, 0.4);
    osc.connect(g2); g2.connect(out);
    osc.start(t); osc.stop(t + 0.45);
  },

  // tactical nuke deployed: wailing air-raid siren, three slow sweeps
  nukeSiren() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, t);
    for (let i = 0; i < 3; i++) {
      osc.frequency.linearRampToValueAtTime(760, t + i * 0.9 + 0.45);
      osc.frequency.linearRampToValueAtTime(520, t + i * 0.9 + 0.9);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.setValueAtTime(0.08, t + 2.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.7);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 2.8);
  },

  // nuke countdown: one sharp tick per second
  nukeTick() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square'; osc.frequency.value = 1050;
    const g = this.ctx.createGain();
    this._env(g, 0.12, 0.07);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.09);
  },

  // nuke cinematic: heavy bomber drone — two detuned saws swelling in,
  // holding through the run, fading as the plane leaves
  nukePlane() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    for (const f of [55, 57.5]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 2.2);
      g.gain.setValueAtTime(0.055, t + 5.5);
      g.gain.exponentialRampToValueAtTime(0.001, t + 9);
      osc.connect(lp); lp.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + 9.2);
    }
  },

  // nuke detonation (Tsar scale): a peak that momentarily drowns the whole
  // mix, then a ~10 s decaying rumble tail that carries through the
  // cinematic's post-impact hold. The cranked peaks route through a
  // compressor into master so they saturate instead of hard-clipping.
  nukeBlast() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10;
    comp.ratio.value = 14; comp.attack.value = 0.002; comp.release.value = 0.5;
    comp.connect(this.master);
    // main rumble: looped noise (buffer is 1 s), crack then a long tail
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(55, t + 6.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(2.8, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 1.3);
    g.gain.exponentialRampToValueAtTime(0.05, t + 9); // shallow, audible tail
    g.gain.exponentialRampToValueAtTime(0.001, t + 10);
    src.connect(lp); lp.connect(g); g.connect(comp);
    src.start(t); src.stop(t + 10.2);
    // deep sub boom, diving low and holding
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(84, t);
    osc.frequency.exponentialRampToValueAtTime(21, t + 3);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(2.2, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 6);
    osc.connect(g2); g2.connect(comp);
    osc.start(t); osc.stop(t + 6.2);
    // aftershock swell riding under the tail
    const src2 = this.ctx.createBufferSource();
    src2.buffer = this.noiseBuf; src2.loop = true;
    const lp2 = this.ctx.createBiquadFilter();
    lp2.type = 'lowpass'; lp2.frequency.value = 90;
    const g3 = this.ctx.createGain();
    g3.gain.setValueAtTime(0.001, t);
    g3.gain.exponentialRampToValueAtTime(1.1, t + 1.8);
    g3.gain.exponentialRampToValueAtTime(0.06, t + 9); // shallow, audible tail
    g3.gain.exponentialRampToValueAtTime(0.001, t + 9.5);
    src2.connect(lp2); lp2.connect(g3); g3.connect(comp);
    src2.start(t); src2.stop(t + 9.7);
  },

  // killstreak reward earned (banked, not yet deployed): two bright notes
  streakReady() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    [523, 784].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.14);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.09); osc.stop(t + i * 0.09 + 0.18);
    });
  },

  // UAV online: three quick ascending radar pings
  uav() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    [660, 880, 1175].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.16);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.11); osc.stop(t + i * 0.11 + 0.2);
    });
  },

  // Care Package claimed: short radio chirp plus a low confirmation thunk.
  carePackage() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    [740, 980, 740].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square'; osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.11, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.08);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.07); osc.stop(t + i * 0.07 + 0.1);
    });
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t + 0.22);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.36);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t + 0.22);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(g); g.connect(this.master);
    osc.start(t + 0.22); osc.stop(t + 0.42);
  },

  // P62: airstrike telegraph — a jet flyby building over the 1.4 s mark:
  // bandpassed noise swept up-and-over (cheap doppler) + gain that peaks
  // right as the first bomb lands, then tails off with the pass.
  jetInbound() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(280, t);
    bp.frequency.exponentialRampToValueAtTime(1450, t + 1.35);
    bp.frequency.exponentialRampToValueAtTime(480, t + 2.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 1.35);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 2.6);
  },

  // P61: counter-UAV — a descending two-tone call (the UAV's rising call
  // inverted) + a low detuned saw drone that hums for the jam's life at
  // ~20% of the UAV-call volume. stopJammer kills a live drone early
  // (match reset). Synth-only, no assets.
  _jamStop: null,
  jammer(dur = 15) {
    if (!this.ensure()) return;
    this.stopJammer();
    const t = this.ctx.currentTime;
    [880, 587].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.18);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.22);
    });
    // the drone: two saws a hair apart beat against each other
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 240;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.028, t + 0.6);
    g.gain.setValueAtTime(0.028, t + Math.max(0.7, dur - 0.8));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    lp.connect(g); g.connect(this.master);
    const oscs = [55, 55.8].map(f => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.1);
      return o;
    });
    this._jamStop = () => { for (const o of oscs) { try { o.stop(); } catch (e) {} } };
  },
  stopJammer() {
    if (this._jamStop) { this._jamStop(); this._jamStop = null; }
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
