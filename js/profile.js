// ============================================================
// Player profile — persistent XP / level / lifetime stats under
// localStorage key `tf_profile` (P1), plus the pure Level 1-20
// curve and rank-name helpers (P2). No UI or gameplay wiring
// lives here; main/ui call into Profile.
// Curve: L1->2 = 500 XP, +250 per level after, capped at L20.
// The profile never stores derived values (rank name, xp-to-next)
// — always compute them from the helpers below.
// ============================================================

// Flip to true to run the console self-test block at load.
const PROFILE_DEBUG = false;

const Profile = {
  KEY: 'tf_profile',
  VERSION: 1,
  LEVEL_CAP: 20,

  // Grounded arcade ranks, index 0 = Level 1. Spec pins SERGEANT
  // at Level 7 and the ladder tops out at COMMANDER (Level 20).
  RANK_NAMES: [
    'PRIVATE',              // 1
    'PRIVATE FIRST CLASS',  // 2
    'SPECIALIST',           // 3
    'LANCE CORPORAL',       // 4
    'CORPORAL',             // 5
    'MASTER CORPORAL',      // 6
    'SERGEANT',             // 7
    'STAFF SERGEANT',       // 8
    'SERGEANT FIRST CLASS', // 9
    'MASTER SERGEANT',      // 10
    'FIRST SERGEANT',       // 11
    'SERGEANT MAJOR',       // 12
    'WARRANT OFFICER',      // 13
    'SECOND LIEUTENANT',    // 14
    'FIRST LIEUTENANT',     // 15
    'CAPTAIN',              // 16
    'MAJOR',                // 17
    'LIEUTENANT COLONEL',   // 18
    'COLONEL',              // 19
    'COMMANDER',            // 20
  ],

  // ---------- P1: profile shape + persistence ----------

  defaultStats() {
    return {
      matchesPlayed: 0, wins: 0, losses: 0, quits: 0,
      kills: 0, deaths: 0, assists: 0, headshots: 0,
      meleeKills: 0, killstreakKills: 0, nukesCalled: 0,
      totalXpEarned: 0,
    };
  },

  defaultProfile() {
    return {
      version: this.VERSION,
      level: 1,
      xp: 0,
      prestige: 0,
      stats: this.defaultStats(),
    };
  },

  // Coerce anything (bad JSON output, missing fields, wrong types,
  // hand-edited saves) into a valid profile. Never throws. Unknown
  // keys are dropped so the saved shape stays exact.
  normalize(raw) {
    const p = this.defaultProfile();
    if (!raw || typeof raw !== 'object') return p;
    p.level = this._int(raw.level, 1, 1, this.LEVEL_CAP);
    p.xp = this._int(raw.xp, 0, 0);
    p.prestige = this._int(raw.prestige, 0, 0);
    const s = raw.stats;
    if (s && typeof s === 'object')
      for (const k in p.stats) p.stats[k] = this._int(s[k], 0, 0);
    return p;
  },

  // Non-finite / non-number -> def; otherwise floor and clamp.
  _int(v, def, min, max) {
    if (typeof v !== 'number' || !isFinite(v)) return def;
    v = Math.floor(v);
    if (v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return v;
  },

  load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) {}
    return this.normalize(raw);
  },

  save(profile) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.normalize(profile)));
      return true;
    } catch (e) { return false; } // quota / private-mode: never throw
  },

  reset() {
    const p = this.defaultProfile();
    this.save(p);
    return p;
  },

  // ---------- P2: level curve + rank helpers (all pure) ----------

  // XP cost of the level -> level+1 step. L1->2 = 500, then +250
  // per level. 0 at/past the cap (there is no next level).
  xpForLevelUp(level) {
    if (level < 1 || level >= this.LEVEL_CAP) return 0;
    return 500 + 250 * (level - 1);
  },

  // Cumulative total XP needed to *reach* a level (L1 = 0). Closed
  // form of the sum; L20 = 52,250.
  xpThreshold(level) {
    if (level <= 1) return 0;
    if (level > this.LEVEL_CAP) level = this.LEVEL_CAP;
    return 125 * (level - 1) * (level + 2);
  },

  // Level for a lifetime XP total, clamped to 1..LEVEL_CAP.
  levelFromTotalXp(totalXp) {
    if (!(totalXp > 0)) return 1;
    let level = 1;
    while (level < this.LEVEL_CAP && totalXp >= this.xpThreshold(level + 1)) level++;
    return level;
  },

  // Progress within the current level: { level, current, needed }.
  // current = XP into the level, needed = size of the step. At the
  // cap both are 0 (UI can render a full/hidden bar).
  progressToNext(totalXp) {
    const level = this.levelFromTotalXp(totalXp);
    if (level >= this.LEVEL_CAP) return { level, current: 0, needed: 0 };
    return {
      level,
      current: Math.max(0, Math.floor(totalXp) - this.xpThreshold(level)),
      needed: this.xpForLevelUp(level),
    };
  },

  rankName(level) {
    if (level < 1) level = 1;
    if (level > this.LEVEL_CAP) level = this.LEVEL_CAP;
    return this.RANK_NAMES[level - 1];
  },

  // ---------- self-test (PROFILE_DEBUG only) ----------

  _selfTest() {
    let fails = 0;
    const ok = (cond, msg) => { if (!cond) { fails++; console.error('[Profile selfTest] FAIL:', msg); } };

    // curve steps
    ok(this.xpForLevelUp(1) === 500, 'L1->2 = 500');
    ok(this.xpForLevelUp(2) === 750, 'L2->3 = 750');
    ok(this.xpForLevelUp(3) === 1000, 'L3->4 = 1000');
    ok(this.xpForLevelUp(19) === 5000, 'L19->20 = 5000');
    ok(this.xpForLevelUp(20) === 0, 'no step past cap');
    // cumulative thresholds
    ok(this.xpThreshold(1) === 0, 'reach L1 = 0');
    ok(this.xpThreshold(2) === 500, 'reach L2 = 500');
    ok(this.xpThreshold(3) === 1250, 'reach L3 = 1250');
    ok(this.xpThreshold(20) === 52250, 'reach L20 = 52250');
    // level from total XP
    ok(this.levelFromTotalXp(0) === 1, '0 XP = L1');
    ok(this.levelFromTotalXp(499) === 1, '499 XP = L1');
    ok(this.levelFromTotalXp(500) === 2, '500 XP = L2');
    ok(this.levelFromTotalXp(52249) === 19, '52249 XP = L19');
    ok(this.levelFromTotalXp(52250) === 20, '52250 XP = L20');
    ok(this.levelFromTotalXp(1e9) === 20, 'clamps at L20');
    // progress
    const pr = this.progressToNext(600);
    ok(pr.level === 2 && pr.current === 100 && pr.needed === 750, 'progress at 600 XP');
    const cap = this.progressToNext(99999);
    ok(cap.level === 20 && cap.current === 0 && cap.needed === 0, 'progress at cap');
    // ranks
    ok(this.RANK_NAMES.length === 20, '20 rank names');
    ok(this.rankName(1) === 'PRIVATE', 'L1 = PRIVATE');
    ok(this.rankName(7) === 'SERGEANT', 'L7 = SERGEANT');
    ok(this.rankName(20) === 'COMMANDER', 'L20 = COMMANDER');
    // normalize / recovery
    const d = this.normalize(null);
    ok(d.version === 1 && d.level === 1 && d.xp === 0 && d.prestige === 0, 'null -> default');
    ok(Object.keys(d.stats).length === 12, 'stats has 12 fields');
    const n = this.normalize({ level: 99, xp: -5, prestige: 'x', stats: { kills: '7', wins: 3.9 }, junk: 1 });
    ok(n.level === 20 && n.xp === 0 && n.prestige === 0, 'clamps/coerces bad fields');
    ok(n.stats.kills === 0 && n.stats.wins === 3 && !('junk' in n), 'stat coercion, junk dropped');

    if (!fails) console.log('[Profile selfTest] all assertions passed');
    return fails === 0;
  },
};

if (PROFILE_DEBUG) Profile._selfTest();
