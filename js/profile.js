// ============================================================
// Player profile — persistent XP / level / lifetime stats under
// localStorage key `tf_profile` (P1), the pure Level 1-20 curve
// and rank-name helpers (P2), the match-local XP accumulator
// (P3), and immediate lifetime-stat mutators + match-stat deltas
// (P5). No UI or gameplay wiring lives here; main/ui call in.
// Curve: L1->2 = 500 XP, +250 per level after, capped at L20.
// profile.xp is TOTAL career XP — levelFromTotalXp/progressToNext
// are the canonical readers; nothing stores derived values
// (rank name, xp-to-next, into-level remainders).
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
    p.xp = this._int(raw.xp, 0, 0);
    p.level = this.levelFromTotalXp(p.xp);
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

  // ---------- P3: match-local XP accumulator ----------

  // First-pass earn table (progression plan, "XP earn table").
  // matchComplete/matchWin are committed by P6 at normal match end.
  XP_EARN: {
    directKill: 100, assist: 25, headshotBonus: 25, meleeBonus: 50,
    killstreakKill: 50, nukeBonus: 1000, matchComplete: 100, matchWin: 250,
  },

  // Match-scoped XP by earn category (values are XP, not counts —
  // this is the end-screen breakdown). Resets at match start /
  // rematch / map change via reset()/Profile.resetMatch(). Nothing
  // here touches the persistent profile; commit is P6's job.
  // Nuke kills award no per-kill XP: never call onDirectKill or
  // onKillstreakKill for them — only onNukeCalled once per nuke.
  MatchXP: {
    directKills: 0, killstreakKills: 0, assists: 0, headshots: 0,
    meleeKills: 0, nukeBonus: 0, matchComplete: 0, matchWin: 0,
    total: 0,

    reset() {
      this.directKills = 0; this.killstreakKills = 0; this.assists = 0;
      this.headshots = 0; this.meleeKills = 0; this.nukeBonus = 0;
      this.matchComplete = 0; this.matchWin = 0; this.total = 0;
    },

    _add(field, xp) { this[field] += xp; this.total += xp; },

    onDirectKill()     { this._add('directKills',     Profile.XP_EARN.directKill); },
    // Killstreak kills are their own breakdown line — never directKills.
    onKillstreakKill() { this._add('killstreakKills', Profile.XP_EARN.killstreakKill); },
    onAssist()         { this._add('assists',         Profile.XP_EARN.assist); },
    // Bonuses stack on top of onDirectKill for the same kill.
    onHeadshot()       { this._add('headshots',       Profile.XP_EARN.headshotBonus); },
    onMeleeKill()      { this._add('meleeKills',      Profile.XP_EARN.meleeBonus); },
    onNukeCalled()     { this._add('nukeBonus',       Profile.XP_EARN.nukeBonus); },
    // Once per match (P6 calls these at normal match end; idempotent).
    onMatchComplete()  { if (!this.matchComplete) this._add('matchComplete', Profile.XP_EARN.matchComplete); },
    onMatchWin()       { if (!this.matchWin)      this._add('matchWin',      Profile.XP_EARN.matchWin); },

    snapshot() {
      return {
        directKills: this.directKills, killstreakKills: this.killstreakKills,
        assists: this.assists, headshots: this.headshots,
        meleeKills: this.meleeKills, nukeBonus: this.nukeBonus,
        matchComplete: this.matchComplete, matchWin: this.matchWin,
        total: this.total,
      };
    },
  },

  // ---------- P5: match deltas + immediate lifetime stats ----------

  // Match-local stat deltas for the end-screen recap (these are
  // counts; lifetime stats persist immediately and separately).
  // result stays null until onMatchResult; quits leave it null.
  MatchStats: {
    kills: 0, deaths: 0, assists: 0, headshots: 0, meleeKills: 0,
    killstreakKills: 0, nukesCalled: 0, result: null,

    reset() {
      this.kills = 0; this.deaths = 0; this.assists = 0; this.headshots = 0;
      this.meleeKills = 0; this.killstreakKills = 0; this.nukesCalled = 0;
      this.result = null;
    },

    snapshot() {
      return {
        kills: this.kills, deaths: this.deaths, assists: this.assists,
        headshots: this.headshots, meleeKills: this.meleeKills,
        killstreakKills: this.killstreakKills, nukesCalled: this.nukesCalled,
        result: this.result,
      };
    },
  },

  // Guards commitMatch: one commit per match, re-armed by resetMatch.
  _matchCommitted: false,

  resetMatch() {
    this.MatchXP.reset();
    this.MatchStats.reset();
    this._matchCommitted = false;
  },

  // Generic immediate lifetime bump: load -> add -> save, one
  // localStorage write per event (fine at this scale). Unknown stat
  // names are ignored. Returns the saved profile.
  bumpStat(name, n = 1) {
    const p = this.load();
    if (name in p.stats) {
      p.stats[name] += this._int(n, 1, 0);
      this.save(p);
    }
    return p;
  },

  // Per-event helpers: bump the lifetime stat immediately AND the
  // match delta. XP is separate — pair with the MatchXP call at the
  // same call site (see the wiring map in the P3/P5 handoff notes).
  onMatchStart() { this.resetMatch(); return this.bumpStat('matchesPlayed'); },
  // Direct player kills only (guns/melee/direct equipment) — never
  // killstreak or nuke kills.
  onKill()           { this.MatchStats.kills++;           return this.bumpStat('kills'); },
  onDeath()          { this.MatchStats.deaths++;          return this.bumpStat('deaths'); },
  onAssist()         { this.MatchStats.assists++;         return this.bumpStat('assists'); },
  onHeadshot()       { this.MatchStats.headshots++;       return this.bumpStat('headshots'); },
  onMeleeKill()      { this.MatchStats.meleeKills++;      return this.bumpStat('meleeKills'); },
  onKillstreakKill() { this.MatchStats.killstreakKills++; return this.bumpStat('killstreakKills'); },
  onNukeCalled()     { this.MatchStats.nukesCalled++;     return this.bumpStat('nukesCalled'); },

  // Match-end helpers — caller (P6/P10 wiring) decides the moment.
  // 'win'|'loss' bump lifetime; 'draw' only records the delta result.
  onMatchResult(result) {
    this.MatchStats.result = result;
    if (result === 'win') return this.bumpStat('wins');
    if (result === 'loss') return this.bumpStat('losses');
    return this.load();
  },
  // Mid-match exit: records the quit, never touches result/XP.
  onQuit() { return this.bumpStat('quits'); },

  // ---------- P6: match-end XP commit ----------

  // Normal match end only (quit path is P10 and never commits).
  // result: 'win' | 'loss' | 'draw'. Adds the match-complete line
  // (+ win line on 'win'; draws get complete XP but no win XP),
  // records the lifetime result, then commits MatchXP.total into
  // profile.xp (total career XP) and totalXpEarned. Level recomputes
  // from total XP — multi-level jumps allowed, clamped at L20.
  // Idempotent per match: second call before the next resetMatch/
  // onMatchStart is a no-op returning null.
  commitMatch(result) {
    if (this._matchCommitted) return null;
    this._matchCommitted = true;
    this.MatchXP.onMatchComplete();
    if (result === 'win') this.MatchXP.onMatchWin();
    this.onMatchResult(result);
    const earned = this.MatchXP.total;
    const p = this.load();
    const oldLevel = p.level;
    p.xp += earned;
    p.stats.totalXpEarned += earned;
    p.level = this.levelFromTotalXp(p.xp);
    this.save(p);
    return {
      xp: this.MatchXP.snapshot(),
      stats: this.MatchStats.snapshot(),
      oldLevel,
      newLevel: p.level,
      leveledUp: p.level > oldLevel,
      totalXp: p.xp,
      progress: this.progressToNext(p.xp),
    };
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
    ok(n.level === 1 && n.xp === 0 && n.prestige === 0, 'clamps/coerces bad fields');
    ok(n.stats.kills === 0 && n.stats.wins === 3 && !('junk' in n), 'stat coercion, junk dropped');

    // P3: match XP accumulator (earn table + category isolation)
    const mx = this.MatchXP;
    mx.reset();
    ok(mx.total === 0 && mx.directKills === 0, 'MatchXP reset zeroed');
    mx.onDirectKill(); mx.onHeadshot();              // headshot kill = 100 + 25
    mx.onDirectKill(); mx.onMeleeKill();             // melee kill = 100 + 50
    mx.onAssist();                                   // + 25
    mx.onKillstreakKill();                           // + 50, NOT a direct kill
    mx.onNukeCalled();                               // + 1000, no per-kill XP
    ok(mx.directKills === 200, 'direct kills = 200 XP');
    ok(mx.headshots === 25 && mx.meleeKills === 50, 'bonus lines');
    ok(mx.assists === 25, 'assist = 25 XP');
    ok(mx.killstreakKills === 50 && mx.directKills === 200, 'killstreak kill not a direct kill');
    ok(mx.nukeBonus === 1000, 'nuke = flat 1000');
    ok(mx.total === 1350, 'total = sum of categories');
    mx.onMatchComplete(); mx.onMatchComplete();      // idempotent
    mx.onMatchWin(); mx.onMatchWin();
    ok(mx.matchComplete === 100 && mx.matchWin === 250 && mx.total === 1700, 'match end lines once');
    ok(mx.snapshot().total === 1700, 'MatchXP snapshot');
    mx.reset();
    ok(mx.total === 0 && mx.nukeBonus === 0 && mx.matchWin === 0, 'reset re-zeroes');

    // P5: lifetime bumps + match deltas (restore the real save after)
    let savedRaw = null;
    try { savedRaw = localStorage.getItem(this.KEY); } catch (e) {}
    this.reset();
    this.onMatchStart();
    ok(this.load().stats.matchesPlayed === 1, 'matchesPlayed persisted at match start');
    ok(this.MatchStats.kills === 0 && this.MatchStats.result === null, 'deltas reset at match start');
    this.onKill(); this.onKill(); this.onDeath(); this.onHeadshot();
    this.onMeleeKill(); this.onKillstreakKill(); this.onAssist(); this.onNukeCalled();
    let lp = this.load();
    ok(lp.stats.kills === 2 && lp.stats.deaths === 1, 'kills/deaths persist immediately');
    ok(lp.stats.headshots === 1 && lp.stats.meleeKills === 1 && lp.stats.killstreakKills === 1
      && lp.stats.assists === 1 && lp.stats.nukesCalled === 1, 'other stats persist immediately');
    const ds = this.MatchStats.snapshot();
    ok(ds.kills === 2 && ds.deaths === 1 && ds.nukesCalled === 1, 'match deltas track counts');
    this.onMatchResult('win');
    ok(this.load().stats.wins === 1 && this.MatchStats.result === 'win', 'win recorded');
    this.onMatchResult('draw');
    lp = this.load();
    ok(lp.stats.wins === 1 && lp.stats.losses === 0 && this.MatchStats.result === 'draw', 'draw bumps nothing');
    this.onQuit();
    ok(this.load().stats.quits === 1, 'quit recorded');
    this.bumpStat('totalXpEarned', 1700);
    ok(this.load().stats.totalXpEarned === 1700, 'bumpStat with amount persists');
    this.bumpStat('notAStat');
    ok(!('notAStat' in this.load().stats), 'unknown stat ignored');
    this.resetMatch();
    ok(this.MatchStats.kills === 0 && this.MatchXP.total === 0
      && this.load().stats.kills === 2, 'resetMatch clears deltas/XP, lifetime survives');

    // P6: match-end commit
    this.reset(); this.resetMatch();
    mx.onDirectKill(); mx.onDirectKill();          // 200
    let res = this.commitMatch('win');             // +100 complete +250 win = 550
    ok(res && res.totalXp === 550 && res.xp.total === 550, 'win commit totals 550');
    ok(res.oldLevel === 1 && res.newLevel === 2 && res.leveledUp === true, 'level 1 -> 2');
    ok(res.progress.level === 2 && res.progress.current === 50 && res.progress.needed === 750, 'commit progress');
    ok(res.stats.result === 'win', 'result in commit snapshot');
    let cp = this.load();
    ok(cp.xp === 550 && cp.level === 2 && cp.stats.totalXpEarned === 550 && cp.stats.wins === 1, 'commit persisted');
    ok(this.commitMatch('win') === null, 'second commit is a null no-op');
    ok(this.load().xp === 550 && this.load().stats.wins === 1, 'no double commit');
    // draw: complete XP, no win XP, no lifetime win/loss
    this.onMatchStart();                           // re-arms commit
    mx.onDirectKill();                             // 100
    res = this.commitMatch('draw');                // +100 complete = 200
    ok(res.totalXp === 750 && res.xp.matchComplete === 100 && res.xp.matchWin === 0, 'draw pays complete only');
    cp = this.load();
    ok(cp.stats.wins === 1 && cp.stats.losses === 0 && res.stats.result === 'draw', 'draw bumps neither');
    ok(res.oldLevel === 2 && res.newLevel === 2 && !res.leveledUp, 'no level-up on small draw');
    // loss + multi-level jump: 2 nukes + complete = 2100 -> 2850 total = L4
    this.onMatchStart();
    mx.onNukeCalled(); mx.onNukeCalled();
    res = this.commitMatch('loss');
    ok(res.totalXp === 2850 && res.oldLevel === 2 && res.newLevel === 4 && res.leveledUp, 'multi-level jump 2 -> 4');
    cp = this.load();
    ok(cp.stats.losses === 1 && cp.stats.totalXpEarned === 2850, 'loss + totalXpEarned track commits');
    // cap clamp: hand-set xp near the top, then a big win
    cp.xp = 52000; this.save(cp);                  // totalXpEarned untouched by design
    this.onMatchStart();
    mx.onNukeCalled();                             // 1000 +100 complete +250 win = 1350
    res = this.commitMatch('win');
    ok(res.oldLevel === 19 && res.newLevel === 20 && res.totalXp === 53350, 'clamps at L20');
    ok(res.progress.level === 20 && res.progress.current === 0 && res.progress.needed === 0, 'cap progress');
    ok(this.load().stats.totalXpEarned === 4200, 'totalXpEarned counts commits only, not raw xp');
    // put the real profile back
    try {
      if (savedRaw === null) localStorage.removeItem(this.KEY);
      else localStorage.setItem(this.KEY, savedRaw);
    } catch (e) {}

    if (!fails) console.log('[Profile selfTest] all assertions passed');
    return fails === 0;
  },
};

if (PROFILE_DEBUG) Profile._selfTest();
