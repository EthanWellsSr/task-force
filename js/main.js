// ============================================================
// Main engine: renderer, player controller, gunplay, physics,
// effects, HUD, match flow, game loop.
// ============================================================

// ---------- shared AABB movement (used by player + bots) ----------
function _boxOverlap(c, pos, halfW, height) {
  return pos.x - halfW < c.max.x - 1e-4 && pos.x + halfW > c.min.x + 1e-4 &&
         pos.y < c.max.y - 1e-4 && pos.y + height > c.min.y + 1e-4 &&
         pos.z - halfW < c.max.z - 1e-4 && pos.z + halfW > c.min.z + 1e-4;
}
// Can the entity stand with its feet at y without intersecting anything?
function _fitsAt(pos, y, halfW, height, colliders) {
  const test = { x: pos.x, y, z: pos.z };
  for (const c of colliders) {
    if (c.max.y <= 0.02) continue;
    if (_boxOverlap(c, test, halfW, height)) return false;
  }
  return true;
}
// stepUp > 0 lets the entity vault onto ledges up to that far above its feet
function moveEntity(pos, halfW, height, dx, dy, dz, colliders, stepUp = 0) {
  const eps = 0.001;
  let grounded = false;
  if (dx !== 0) {
    pos.x += dx;
    for (const c of colliders) {
      if (c.max.y <= 0.02) continue;
      if (_boxOverlap(c, pos, halfW, height)) {
        const rise = c.max.y - pos.y;
        if (stepUp > 0 && rise > 0 && rise <= stepUp && _fitsAt(pos, c.max.y + eps, halfW, height, colliders)) {
          pos.y = c.max.y + eps;
          continue;
        }
        pos.x = dx > 0 ? c.min.x - halfW - eps : c.max.x + halfW + eps;
      }
    }
  }
  if (dz !== 0) {
    pos.z += dz;
    for (const c of colliders) {
      if (c.max.y <= 0.02) continue;
      if (_boxOverlap(c, pos, halfW, height)) {
        const rise = c.max.y - pos.y;
        if (stepUp > 0 && rise > 0 && rise <= stepUp && _fitsAt(pos, c.max.y + eps, halfW, height, colliders)) {
          pos.y = c.max.y + eps;
          continue;
        }
        pos.z = dz > 0 ? c.min.z - halfW - eps : c.max.z + halfW + eps;
      }
    }
  }
  if (dy !== 0) {
    pos.y += dy;
    for (const c of colliders) {
      if (c.max.y <= 0.02) continue;
      if (_boxOverlap(c, pos, halfW, height)) {
        if (dy < 0) { pos.y = c.max.y; grounded = true; }
        else pos.y = c.min.y - height - eps;
      }
    }
  }
  if (pos.y < 0) { pos.y = 0; grounded = true; }
  return grounded;
}

// ---------- global state ----------
const G = {
  state: 'menu',   // menu | spawn | playing | dead | paused | end
  mapId: null, map: null,
  modeId: 'tdm', mode: null,
  scene: null, camera: null, renderer: null,
  colliders: [], graph: null,
  bots: [], combatants: [],
  scores: { tf: 0, sp: 0 },
  timeLeft: 600, time: 0,
  uavUntil: 0,
  // P61: counter-UAV comms jam. jamTeam = the team the jam LANDED ON
  // ('*' in FFA = everyone but the deployer, resolved via jamFrom since
  // FFA teams are per-combatant). Read through commsJammed(ent).
  jamUntil: 0, jamTeam: null, jamFrom: null,
  pointerLocked: false,
};

const MODES = {
  tdm: {
    id: 'tdm',
    name: 'TEAM DEATHMATCH',
    structure: 'teams',
    teams: ['tf', 'sp'],
    scoreSource: 'teamKills',
    respawn: true,
    roundBased: false,
    hudGoal: 'FIRST TO',
    teamLabels: { tf: 'TASK FORCE', sp: 'SPETSNAZ' },
  },
  ffa: {
    id: 'ffa',
    name: 'FREE-FOR-ALL',
    structure: 'ffa',
    teams: [],
    scoreSource: 'playerKills',
    respawn: true,
    roundBased: false,
    hudGoal: 'FIRST TO',
    teamLabels: {},
  },
  gungame: {
    id: 'gungame',
    name: 'GUN GAME',
    structure: 'ffa',
    teams: [],
    scoreSource: 'gunLadder',
    respawn: true,
    roundBased: false,
    goalText: 'GUN GAME — FINISH THE LADDER',
    teamLabels: {},
  },
};

// P74: the 16-tier ladder (#P73-design): pistols (skill floor rising) →
// shotguns (one-shot rhythm) → SMGs (spray control) → ARs (discipline) →
// LMG (power/pig) → bolt sniper (precision wall) → tomahawk finale.
// Every consumer is length-generic (clamps/length reads), so the array IS
// the ladder. Deliberate skips per the audit docs: FAMAS (bot burst path
// missing — dead bot tier until P25), Barrett M82 (semi bot path would
// out-fire the bolt — lobby-clearing sniper bot), M14 EBR (same, plus
// back-to-back sniper tiers kill flow). 'intervention' is the CheyTac.
const GUN_LADDER = ['m9', 'usp', 'deagle', 'g18', 'spas12', 'r870', 'aa12', 'mac10',
  'vector', 'ump45', 'm4a1', 'scar', 'fal', 'm60', 'intervention', 'tomahawk'];

function modeById(id) {
  return MODES[id] || MODES.tdm;
}

function isGunGameMode(mode = G.mode) {
  return mode && mode.scoreSource === 'gunLadder';
}

function makeModeScores(mode) {
  const scores = {};
  for (const team of mode.teams) scores[team] = 0;
  return scores;
}

function shuffledBotNames(team) {
  const names = BOT_NAMES[team] || BOT_NAMES.sp;
  return names.slice().sort(() => Math.random() - 0.5);
}

function shuffledFfaNames() {
  return [...BOT_NAMES.tf, ...BOT_NAMES.sp].sort(() => Math.random() - 0.5);
}

function syncFfaScores() {
  if (!G.mode || G.mode.structure !== 'ffa') return;
  for (const c of G.combatants) {
    if (isGunGameMode()) G.scores[c.team] = Math.min((c.tier || 0) + 1, GUN_LADDER.length);
    else if (G.scores[c.team] === undefined) G.scores[c.team] = c.kills || 0;
  }
}

function rankedCombatants(combatants) {
  return combatants.slice().sort((a, b) =>
    ((G.scores[b.team] || 0) - (G.scores[a.team] || 0)) ||
    (b.kills - a.kills) || ((a.deaths || 0) - (b.deaths || 0)) || a.name.localeCompare(b.name));
}

function weaponStateForKey(key) {
  const w = WEAPONS[key];
  return { def: w, mag: w.mag, reserve: w.reserve };
}

function gunGameWeaponKey(c) {
  return GUN_LADDER[Math.min(c.tier || 0, GUN_LADDER.length - 1)];
}

function setPlayerGunGameWeapon() {
  player.weapons = [weaponStateForKey(gunGameWeaponKey(player))];
  player.cur = 0;
  player.reloadT = 0; player.switchT = 0; player.burstQueue = 0; player.fireCooldown = 0;
  player.adsToggle = false;
  if (player.alive) buildViewModel(curW().def);
}

function setBotGunGameWeapon(bot) {
  bot.weapon = WEAPONS[gunGameWeaponKey(bot)];
  bot.magLeft = bot.weapon.mag;
  bot.reloadT = 0;
  bot.burstLeft = 0;
  bot.shotT = 0;
  bot.lethal = null;
  bot.grenLeft = 0;
}

function prepareGunGameCombatant(c) {
  c.tier = 0;
  c._gunGameComplete = false;
  G.scores[c.team] = 1;
  if (!c.isPlayer) setBotGunGameWeapon(c);
}

function advanceGunGame(killer, victim, weaponName) {
  // P45: the throwing knife demotes too — all three are humiliation kills
  if (weaponName === 'KNIFE' || weaponName === 'TOMAHAWK' || weaponName === 'THROWING KNIFE') {
    victim.tier = Math.max(0, (victim.tier || 0) - 1);
    victim._gunGameComplete = false;
    G.scores[victim.team] = Math.min((victim.tier || 0) + 1, GUN_LADDER.length);
    if (!victim.isPlayer) setBotGunGameWeapon(victim);
  }
  if ((killer.tier || 0) >= GUN_LADDER.length - 1) {
    killer._gunGameComplete = true;
    G.scores[killer.team] = GUN_LADDER.length;
    return;
  }
  killer.tier = (killer.tier || 0) + 1;
  G.scores[killer.team] = Math.min(killer.tier + 1, GUN_LADDER.length);
  if (killer.isPlayer) setPlayerGunGameWeapon();
  else setBotGunGameWeapon(killer);
}

function addModeKillScore(killer, victim, weaponName) {
  const mode = G.mode || MODES.tdm;
  if (!killer || killer.team === victim.team) return;
  if (mode.scoreSource === 'gunLadder') {
    advanceGunGame(killer, victim, weaponName || '');
  } else if (mode.scoreSource === 'teamKills' || mode.scoreSource === 'playerKills') {
    G.scores[killer.team] = (G.scores[killer.team] || 0) + 1;
  }
}

function modeScoreLimitReached() {
  const mode = G.mode || MODES.tdm;
  if (isGunGameMode(mode)) return G.combatants.some(c => c._gunGameComplete);
  const keys = mode.structure === 'ffa' ? Object.keys(G.scores) : mode.teams;
  return keys.some(team => (G.scores[team] || 0) >= UI.settings.scoreLimit);
}

function modeWinResult(forcedWin) {
  if (forcedWin !== undefined) return forcedWin;
  const mode = G.mode || MODES.tdm;
  const teams = mode.teams;
  if (mode.structure === 'teams' && teams.length === 2) {
    const a = G.scores[teams[0]] || 0;
    const b = G.scores[teams[1]] || 0;
    if (a === b) return null;
    return (G.scores[player.team] || 0) > (G.scores[player.team === teams[0] ? teams[1] : teams[0]] || 0);
  }
  if (mode.structure === 'ffa') {
    if (isGunGameMode(mode)) {
      const winner = G.combatants.find(c => c._gunGameComplete);
      return winner ? winner === player : null;
    }
    const ranked = rankedCombatants(G.combatants);
    if (!ranked.length) return null;
    const top = ranked[0].kills;
    const tiedTop = ranked.filter(c => c.kills === top);
    if (tiedTop.length > 1 && tiedTop.includes(player)) return null;
    return ranked[0] === player;
  }
  return null;
}

G.mode = MODES.tdm;

const player = {
  isPlayer: true, name: 'YOU', team: 'tf',
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  hp: 100, alive: false, kills: 0, deaths: 0, assists: 0,
  recentDamagers: [], // #16d: who's chipped me this engagement (assist source)
  crouched: false, crouchAmt: 0,
  prone: false, proneAmt: 0,
  stamina: 1, sprinting: false, winded: false,
  perks: new Set(),
  weapons: [], cur: 0,
  reloadT: 0, switchT: 0, fireCooldown: 0, burstQueue: 0,
  adsHeld: false, adsToggle: false, adsAmt: 0, bloom: 0,
  zoomLevel: 6, // #18e: live sniper zoom (×), wheel-adjustable while scoped
  meleeT: 0, sinceDamage: 99, respawnT: 0, spawnProtectT: 0,
  speedNow: 0, onGround: true,
  airVX: 0, airVZ: 0, airSpeedCap: 0, // #18d: horizontal momentum preserved through a jump
  vault: null, forceCrouch: false,
  lastShotTime: -99,
  _stepT: 0, _killStreakCount: 0, _lastKillTime: -99, _streakKills: 0,
  _bankedStreaks: [], _streakSel: 0,
  // P60: per-life awarded set (>= trigger needs it — see registerKill) +
  // the streak loadout, computed at spawn in deploy() and nowhere else
  _streakAwarded: new Set(), equippedStreakIds: [],
  // #16a: one lethal ([F]) + one tactical ([T]) equipment, chosen per class
  // (either can be null = NONE). Set from the class in deploy().
  equip: 'frag', equipLeft: 0, equipTac: 'stun', equipTacLeft: 0,
  throwT: 0, cooking: null, cookKind: null, cookSlot: null,
  stunT: 0, stunMax: 1,
  flashT: 0, flashMaxT: 1, // P48: whiteout timer + its applied duration
};

const keys = {};
let firing = false, triggerEdge = false;

// #18e: sniper wheel-zoom range/step (×)
const ZOOM_MIN = 3, ZOOM_MAX = 8, ZOOM_STEP = 0.5;

const BOT_NAMES = {
  tf: ['HAVOC', 'FLINT', 'JESTER', 'MUSTANG', 'TALON', 'RATTLER', 'ONYX', 'DRIFTER', 'SABLE', 'VANDAL', 'CUTTER'],
  sp: ['GRIGORI', 'ANATOLY', 'VIKTOR', 'KIRIL', 'LEV', 'OLEG', 'SASHA', 'DMITRI', 'BORIS', 'ANDREI', 'PAVEL'],
};

// ============================================================
// Renderer / camera / viewmodel setup
// ============================================================
const canvas = document.getElementById('game');
G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
G.renderer.setSize(window.innerWidth, window.innerHeight);
G.renderer.shadowMap.enabled = true;
G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

G.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.06, 300);
G.camera.rotation.order = 'YXZ';

window.addEventListener('resize', () => {
  G.renderer.setSize(window.innerWidth, window.innerHeight);
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
});

// viewmodel (gun) attached to the camera
const vmRoot = new THREE.Group();
G.camera.add(vmRoot);
let vmGun = null, vmMuzzle = new THREE.Vector3();
const _laserOrigin = new THREE.Vector3(), _laserDir = new THREE.Vector3();
const _laserPt = new THREE.Vector3(), _laserMid = new THREE.Vector3(), _laserSeg = new THREE.Vector3();
const _laserUpY = new THREE.Vector3(0, 1, 0);
let vmKick = 0, bobPhase = 0;
const muzzleLight = new THREE.PointLight(0xffc070, 0, 9);
muzzleLight.position.set(0.12, -0.12, -0.9);
G.camera.add(muzzleLight);

const VM_POS = {
  hip: new THREE.Vector3(0.27, -0.25, -0.52),
  ads: new THREE.Vector3(0, -0.082, -0.38),
};

// Muzzle-flash quad size per weapon class (#15b tuning)
const VM_FLASH = { ar: 0.12, smg: 0.1, lmg: 0.15, sniper: 0.13, shotgun: 0.14, pistol: 0.08 };

const VM_RETICLE = {
  reddot: 0.005,
  holoDot: 0.004,
  holoRingInner: 0.0085,
  holoRingOuter: 0.011,
  acogHair: 0.0042, // P54: crosshair bar thickness (arms are 5x this)
};

// Red dot mount points (#9c): rail-top y + mount z per weapon key
// (model-type keys cover the generic fallback bodies). The dot centers
// 0.039 above y; buildViewModel shifts userData.adsPos so it lands on
// screen center at full ADS.
const VM_OPTIC = {
  m4a1: { y: 0.059, z: -0.18 },
  scar: { y: 0.055, z: -0.14 },
  acr: { y: 0.041, z: -0.16 },
  tar21: { y: 0.048, z: -0.1 },
  famas: { y: 0.066, z: -0.13 },
  fal: { y: 0.04, z: -0.12 },
  mp5k: { y: 0.043, z: -0.1 },
  ump45: { y: 0.045, z: -0.12 },
  vector: { y: 0.05, z: -0.15 },
  p90: { y: 0.052, z: -0.18 },
  rpd: { y: 0.045, z: -0.15 },
  m240: { y: 0.05, z: -0.16 },
  mg4: { y: 0.046, z: -0.14 },
  spas12: { y: 0.04, z: -0.1 },
  r870: { y: 0.038, z: -0.1 },
  aa12: { y: 0.05, z: -0.14 },
  ar: { y: 0.0425, z: -0.14 }, smg: { y: 0.045, z: -0.12 },
  lmg: { y: 0.05, z: -0.15 }, shotgun: { y: 0.04, z: -0.12 },
};

// Foregrip mount points (#9d): y = handguard/body underside (grip top), z =
// spot along the fore-end — per weapon because handguard depths/spans differ
// (model-type keys cover the generic fallback bodies). Stats (recoil/bloom
// ×.8) already flow through resolveWeaponDef; this table is visual only.
const VM_GRIP = {
  m4a1: { y: -0.039, z: -0.5 },
  scar: { y: -0.045, z: -0.42 },
  acr: { y: -0.043, z: -0.47 },
  tar21: { y: -0.066, z: -0.5 },
  famas: { y: -0.045, z: -0.36 },
  fal: { y: -0.042, z: -0.46 },
  mp5k: { y: -0.055, z: -0.23 },
  ump45: { y: -0.045, z: -0.3 },
  vector: { y: -0.088, z: -0.33 },
  p90: { y: -0.07, z: -0.3 },
  rpd: { y: -0.042, z: -0.47 },
  m240: { y: -0.045, z: -0.5 },
  mg4: { y: -0.05, z: -0.5 },
  spas12: { y: -0.054, z: -0.4 },
  r870: { y: -0.054, z: -0.42 },
  aa12: { y: -0.04, z: -0.36 },
  ar: { y: -0.042, z: -0.45 }, smg: { y: -0.045, z: -0.32 },
  lmg: { y: -0.05, z: -0.5 }, shotgun: { y: -0.07, z: -0.42 },
};

// Hand anchors (#10a): trigger-hand fist [y, z] on the pistol grip per
// weapon key (model-type keys cover the generic fallback bodies). The
// support fist derives from VM_GRIP (handguard underside / pump sleeve);
// `sup` overrides it where no grip point exists (pistols: mag well,
// snipers: fore stock) or where the derivation sits wrong (MP5K wraps
// its built-in vertical grip).
const VM_HANDS = {
  m4a1: { trig: [-0.09, -0.05] },
  scar: { trig: [-0.088, -0.02] },
  acr: { trig: [-0.09, -0.04] },
  tar21: { trig: [-0.088, -0.24] },
  famas: { trig: [-0.092, -0.2] },
  fal: { trig: [-0.086, -0.04] },
  mp5k: { trig: [-0.072, -0.02], sup: [-0.115, -0.23, 'grip'] },
  ump45: { trig: [-0.088, -0.05] },
  vector: { trig: [-0.105, -0.03] },
  p90: { trig: [-0.105, -0.2] },
  rpd: { trig: [-0.088, -0.06] },
  m240: { trig: [-0.088, -0.05] },
  mg4: { trig: [-0.088, -0.05] },
  intervention: { trig: [-0.092, -0.1], sup: [-0.052, -0.45] },
  barrett: { trig: [-0.092, -0.04], sup: [-0.062, -0.5] },
  usp: { trig: [-0.075, -0.01], sup: [-0.105, 0.008, 'grip'] },
  deagle: { trig: [-0.08, 0], sup: [-0.115, 0.015, 'grip'] },
  g18: { trig: [-0.068, 0], sup: [-0.1, 0.012, 'grip'] },
  spas12: { trig: [-0.085, -0.03] },
  r870: { trig: [-0.085, -0.02] },
  aa12: { trig: [-0.09, 0.04] },
  ar: { trig: [-0.088, -0.06] }, smg: { trig: [-0.09, -0.02] },
  lmg: { trig: [-0.088, -0.05] }, sniper: { trig: [-0.08, -0.08], sup: [-0.055, -0.45] },
  shotgun: { trig: [-0.085, -0.03] }, pistol: { trig: [-0.068, 0], sup: [-0.096, 0.012, 'grip'] },
};

// Mag pull (#10b): gun-local travel of the mag part + support hand when
// the reload anim pulls it, with an rx tip so the mag rocks out instead
// of sliding straight. Default suits underslung box mags; the P90's
// top-mounted mag lifts up and back off the rail instead.
const VM_MAG_PULL = {
  p90: { x: 0, y: 0.075, z: 0.15, rx: -0.25 },
  default: { x: 0, y: -0.17, z: 0.06, rx: 0.45 },
};

// Camo palettes (#9e): 4 shades dark→light per camo, zero stat effect.
// A part's original color maps onto the ramp by luminance (camoShade), so
// recipe-local colors (SCAR tan, TAR-21 olive, P90 shell) recolor too —
// swapping only the injected dark/mid/wood would leave those guns bare.
// pattern camos multiply a shared grayscale blotch CanvasTexture into the
// Lambert color; gold is a flat swap. Attachment parts stay black.
const VM_CAMOS = {
  camoDesert:   { shades: [0x4f4530, 0x7d6c48, 0xa38e61, 0xc4ad7e], pattern: true },
  camoWoodland: { shades: [0x1f2b1a, 0x3a4f2e, 0x59683f, 0x7c8656], pattern: true },
  camoDigital:  { shades: [0x2b3134, 0x4a555b, 0x6b797f, 0x93a1a6], pattern: true },
  camoGold:     { shades: [0x7a5714, 0xa87c1e, 0xd2a428, 0xf0c94e], pattern: false },
};

// Shared blotch overlay for pattern camos — white base so the Lambert
// color shows through, gray ellipses darken into camo splotches. Box UVs
// stretch it per face, so splotch scale varies per part like real wraps.
let _camoTex = null;
function camoTexture() {
  if (_camoTex) return _camoTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 64, 64);
  const blots = [
    [9, 11, 12, 7, '#a0a0a0'], [34, 5, 10, 8, '#c4c4c4'], [55, 14, 11, 9, '#adadad'],
    [20, 30, 9, 11, '#b8b8b8'], [45, 34, 13, 8, '#9c9c9c'], [4, 44, 8, 9, '#c0c0c0'],
    [26, 52, 12, 8, '#a6a6a6'], [54, 54, 9, 10, '#bcbcbc'], [40, 20, 6, 6, '#949494'],
  ];
  for (const [x, y, rx, ry, c] of blots) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  _camoTex = new THREE.CanvasTexture(cv);
  return _camoTex;
}

// Map an original part color onto a camo shade ramp by luminance —
// gradient stops, not bands, so within-gun contrast (receiver vs mag vs
// furniture) survives the swap instead of flattening to one shade.
function camoShade(orig, shades) {
  const c = new THREE.Color(orig);
  const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  const t = Math.min(1, l / 0.55) * (shades.length - 1);
  const i = Math.min(shades.length - 2, Math.floor(t));
  return new THREE.Color(shades[i]).lerp(new THREE.Color(shades[i + 1]), t - i);
}

// Per-weapon viewmodel recipes: each builds the real gun's silhouette from
// part()/cyl() primitives and returns the muzzle distance (len). Sight line
// stays at local y ~0.06 so the shared VM_POS.ads still centers the irons
// (a mounted optic re-centers via userData.adsPos instead). Iron-sight
// parts go through `s` (not `p`) so an optic can hide them; centerline
// carry-handle / rail parts that would occlude an optic go through `o`;
// a built-in vertical foregrip goes through `u` so the foregrip attachment
// replaces it instead of doubling up (only the MP5K has one); mag parts go
// through `m` so the reload anim (#10b) can pull them — guns whose mag isn't
// a separate visible part (pistol-grip mags, SPAS tube, Vector mag-in-grip)
// skip it and only play the tilt + hand motion; pump sleeves / bolt handles
// go through `k` so the cycle anim (#10c) can slide them.
// Weapons without a recipe fall back to the generic per-class body below.
const VM_RECIPES = {
  m4a1({ p, s, m, dark, mid, black }) {
    p(0.055, 0.085, 0.46, dark, 0, 0, -0.23);        // receiver
    p(0.058, 0.068, 0.24, mid, 0, -0.005, -0.55);    // round handguard
    p(0.045, 0.016, 0.34, black, 0, 0.051, -0.29);   // flat-top rail
    p(0.024, 0.024, 0.18, mid, 0, 0.005, -0.72);     // barrel
    m(0.038, 0.14, 0.09, mid, 0, -0.1, -0.18);       // straight STANAG mag
    p(0.034, 0.045, 0.14, mid, 0, 0.008, 0.05);      // buffer tube
    p(0.05, 0.08, 0.06, dark, 0, -0.002, 0.14);      // collapsible stock pad
    p(0.03, 0.07, 0.035, dark, 0, -0.072, -0.05);    // pistol grip
    s(0.014, 0.045, 0.02, dark, 0, 0.062, -0.58);    // front post
    s(0.02, 0.032, 0.025, dark, 0, 0.058, -0.12);    // rear sight
    return 0.82;
  },
  scar({ p, s, m, black }) {
    const tan = 0x8d7c58, tanDk = 0x6f6248;
    p(0.055, 0.1, 0.56, tan, 0, 0.005, -0.27);       // tall slab receiver
    p(0.026, 0.026, 0.22, black, 0, 0.012, -0.65);   // barrel
    m(0.04, 0.12, 0.085, tanDk, 0, -0.095, -0.16);   // 20-rd box mag
    p(0.05, 0.09, 0.16, tan, 0, 0.005, 0.09);        // wide stock
    p(0.04, 0.028, 0.1, tanDk, 0, 0.062, 0.08);      // cheek riser
    p(0.03, 0.07, 0.035, black, 0, -0.07, -0.02);    // grip
    s(0.014, 0.042, 0.02, black, 0, 0.062, -0.54);   // folding front sight
    s(0.018, 0.034, 0.02, black, 0, 0.058, -0.08);
    return 0.78;
  },
  acr({ p, s, m, dark, mid }) {
    const poly = 0x454a52;
    p(0.055, 0.082, 0.4, poly, 0, 0, -0.22);         // upper
    p(0.06, 0.07, 0.26, dark, 0, -0.008, -0.5);      // wide handguard
    p(0.024, 0.024, 0.16, mid, 0, 0.006, -0.7);      // barrel
    m(0.038, 0.13, 0.09, dark, 0, -0.1, -0.17);      // mag
    p(0.046, 0.085, 0.18, poly, 0, -0.005, 0.08);    // folding stock
    p(0.03, 0.07, 0.035, dark, 0, -0.072, -0.04);    // grip
    s(0.014, 0.042, 0.02, dark, 0, 0.06, -0.56);
    s(0.018, 0.034, 0.02, dark, 0, 0.056, -0.1);
    return 0.78;
  },
  tar21({ p, s, m, dark }) {
    const olive = 0x565e49;
    p(0.06, 0.095, 0.62, olive, 0, 0, -0.19);        // one-piece bullpup body
    p(0.055, 0.075, 0.14, olive, 0, -0.028, -0.53);  // sloped fore-end
    p(0.026, 0.026, 0.16, dark, 0, 0.01, -0.62);     // barrel
    m(0.038, 0.12, 0.08, dark, 0, -0.1, 0.04);       // mag BEHIND the grip
    p(0.03, 0.062, 0.04, dark, 0, -0.072, -0.24);    // grip well forward
    s(0.014, 0.04, 0.02, dark, 0, 0.062, -0.44);
    s(0.018, 0.032, 0.02, dark, 0, 0.058, 0);
    return 0.7;
  },
  famas({ p, s, m, dark, mid }) {
    p(0.055, 0.08, 0.56, dark, 0, -0.005, -0.15);    // bullpup body
    p(0.026, 0.026, 0.26, mid, 0, 0.008, -0.55);     // barrel
    p(0.022, 0.022, 0.46, mid, 0, 0.055, -0.13);     // full-length carry handle
    p(0.016, 0.03, 0.02, mid, 0, 0.038, 0.07);       // handle posts
    p(0.016, 0.03, 0.02, mid, 0, 0.038, -0.33);
    m(0.038, 0.115, 0.075, mid, 0, -0.1, 0.06);      // mag behind grip
    p(0.03, 0.062, 0.04, dark, 0, -0.075, -0.2);     // grip
    s(0.012, 0.03, 0.018, dark, 0, 0.062, -0.34);    // sights at the handle ends
    s(0.014, 0.026, 0.018, dark, 0, 0.06, 0.08);
    return 0.7;
  },
  fal({ p, s, m, dark, mid, wood }) {
    p(0.05, 0.08, 0.5, dark, 0, 0, -0.25);           // long slim receiver
    p(0.022, 0.022, 0.4, mid, 0, 0.008, -0.66);      // slim barrel
    m(0.036, 0.12, 0.085, mid, 0, -0.095, -0.16);    // 20-rd mag
    p(0.05, 0.085, 0.18, wood, 0, -0.005, 0.08);     // wood stock
    p(0.03, 0.068, 0.04, wood, 0, -0.07, -0.04);     // wood grip
    p(0.054, 0.06, 0.18, wood, 0, -0.012, -0.44);    // wood handguard
    s(0.014, 0.05, 0.02, dark, 0, 0.062, -0.78);     // tall front sight
    s(0.016, 0.032, 0.02, dark, 0, 0.055, -0.06);
    return 0.88;
  },
  mp5k({ p, s, u, m, dark, mid }) {
    // MP5K identity: ultra-short front, vertical foregrip, a forward-curling
    // 30-rd banana ahead of the pistol grip, no stock, HK drum rear sight.
    p(0.05, 0.078, 0.34, dark, 0, 0, -0.12);         // slim stubby receiver
    p(0.026, 0.026, 0.06, mid, 0, 0.004, -0.33);     // very short snub barrel
    p(0.055, 0.06, 0.11, mid, 0, -0.03, -0.26);      // fat front handguard
    u(0.036, 0.098, 0.05, dark, 0, -0.108, -0.26);   // built-in vertical foregrip
    m(0.032, 0.092, 0.052, mid, 0, -0.07, -0.12);    // 30-rd banana, upper body...
    const m2 = m(0.03, 0.092, 0.05, mid, 0, -0.162, -0.138); // ...lower half, meeting it
    m2.rotation.x = 0.4;                             // curls forward toward the muzzle
    const grip = p(0.032, 0.076, 0.048, dark, 0, -0.052, -0.005); // pistol grip
    grip.rotation.x = -0.2;                          // raked back
    p(0.044, 0.078, 0.05, dark, 0, 0, 0.055);        // short receiver rear cap (no stock)
    s(0.022, 0.038, 0.024, dark, 0, 0.06, -0.3);     // hooded front sight
    s(0.026, 0.032, 0.024, dark, 0, 0.056, 0.02);    // HK drum rear sight
    return 0.34;
  },
  ump45({ p, s, m, dark }) {
    // UMP45 identity: long flat polymer receiver, a long slightly forward-
    // raked .45 stick mag, and a skeletal side-folding stock (thin strut +
    // buttplate) reading from the over-the-shoulder angle.
    const poly = 0x3d4148;
    p(0.05, 0.084, 0.44, poly, 0, 0, -0.16);         // long flat polymer receiver
    p(0.024, 0.024, 0.12, dark, 0, 0.006, -0.44);    // barrel
    const mag = m(0.034, 0.16, 0.062, dark, 0, -0.12, -0.11); // long .45 stick mag
    mag.rotation.x = 0.16;                            // slight forward rake
    const grip = p(0.032, 0.072, 0.046, dark, 0, -0.055, 0.0); // pistol grip
    grip.rotation.x = -0.16;                          // raked back
    p(0.026, 0.024, 0.19, poly, 0, 0.028, 0.135);    // upper folding-stock strut
    p(0.02, 0.05, 0.02, poly, 0, -0.008, 0.135);     // stock crossbar
    p(0.03, 0.088, 0.026, poly, 0, 0.02, 0.235);     // buttplate
    s(0.013, 0.038, 0.02, dark, 0, 0.06, -0.37);     // front post
    s(0.015, 0.032, 0.02, dark, 0, 0.057, -0.02);    // rear sight
    return 0.5;
  },
  vector({ p, s, dark, mid }) {
    p(0.05, 0.06, 0.42, dark, 0, 0.02, -0.17);       // upper rail/receiver
    p(0.052, 0.085, 0.2, dark, 0, -0.045, -0.27);    // deep recoil housing
    const grip = p(0.036, 0.13, 0.05, mid, 0, -0.095, -0.03); // mag-in-grip
    grip.rotation.x = -0.12;
    p(0.028, 0.045, 0.14, dark, 0, 0.025, 0.06);     // thin stock bar
    p(0.036, 0.06, 0.03, dark, 0, 0.01, 0.13);       // butt pad
    p(0.024, 0.024, 0.07, mid, 0, 0.02, -0.41);      // barrel
    s(0.012, 0.034, 0.018, dark, 0, 0.062, -0.36);
    s(0.014, 0.03, 0.018, dark, 0, 0.058, 0);
    return 0.46;
  },
  p90({ p, s, m, dark }) {
    const shell = 0x3c4038, magc = 0x6a7562;
    p(0.055, 0.09, 0.52, shell, 0, -0.025, -0.11);   // one-piece bullpup shell
    m(0.045, 0.028, 0.36, magc, 0, 0.038, -0.14);    // top-mounted mag
    p(0.05, 0.06, 0.06, shell, 0, 0.03, 0.12);       // humped butt
    p(0.024, 0.024, 0.09, dark, 0, 0.02, -0.41);     // barrel stub
    p(0.04, 0.06, 0.05, shell, 0, -0.095, -0.2);     // trigger-loop grip
    s(0.026, 0.03, 0.05, dark, 0, 0.062, -0.2);      // reflex sight block
    s(0.012, 0.024, 0.016, dark, 0, 0.06, -0.32);
    return 0.46;
  },
  rpd({ p, s, m, dark, mid, wood }) {
    p(0.06, 0.09, 0.5, dark, 0, 0, -0.25);           // receiver
    p(0.028, 0.028, 0.42, mid, 0, 0.008, -0.68);     // long barrel
    m(0.11, 0.11, 0.1, mid, 0, -0.09, -0.22);        // belt drum
    p(0.048, 0.08, 0.16, wood, 0, -0.005, 0.06);     // wood stock
    p(0.03, 0.065, 0.04, wood, 0, -0.07, -0.06);     // wood grip
    p(0.054, 0.055, 0.14, wood, 0, -0.015, -0.47);   // wood handguard
    p(0.012, 0.012, 0.22, dark, 0.02, -0.035, -0.76);  // folded bipod legs
    p(0.012, 0.012, 0.22, dark, -0.02, -0.035, -0.76);
    s(0.014, 0.05, 0.02, dark, 0, 0.065, -0.84);     // tall front sight
    s(0.016, 0.034, 0.02, dark, 0, 0.058, -0.1);
    return 0.9;
  },
  // M240 — the heavy: all-steel black, long barrel, boxy hanging ammo box
  // (not the RPD's round drum), folding carry handle on a top rail.
  m240({ p, s, o, m, dark, mid }) {
    p(0.066, 0.1, 0.56, dark, 0, 0, -0.26);          // heavy receiver
    p(0.034, 0.034, 0.5, mid, 0, 0.006, -0.76);      // long heavy barrel
    p(0.03, 0.05, 0.14, dark, 0, 0.022, -0.56);      // gas tube / bipod collar
    m(0.1, 0.13, 0.15, dark, 0, -0.115, -0.15);      // rectangular ammo box
    p(0.055, 0.02, 0.05, mid, 0, -0.045, -0.15);     // belt feed lip
    o(0.022, 0.05, 0.3, dark, 0, 0.056, -0.28);      // top carry-handle rail
    o(0.03, 0.05, 0.055, dark, 0, 0.084, -0.4);      // folding carry handle
    p(0.05, 0.085, 0.16, dark, 0, -0.005, 0.08);     // solid stock
    p(0.04, 0.06, 0.03, dark, 0, -0.005, 0.18);      // butt pad
    p(0.03, 0.065, 0.04, dark, 0, -0.072, -0.05);    // grip
    p(0.012, 0.012, 0.26, dark, 0.03, -0.04, -0.82); // folded bipod legs
    p(0.012, 0.012, 0.26, dark, -0.03, -0.04, -0.82);
    s(0.014, 0.05, 0.02, dark, 0, 0.066, -0.86);     // tall front sight
    s(0.016, 0.034, 0.02, dark, 0, 0.058, -0.08);    // rear
    return 0.98;
  },
  // MG4 — the fast light one: modern olive polymer, ventilated handguard,
  // smaller plastic ammo box, full-length top rail, skeletal folding stock.
  mg4({ p, s, m, dark, mid }) {
    const poly = 0x4a4d42;
    p(0.058, 0.092, 0.5, poly, 0, 0, -0.23);         // polymer receiver
    p(0.028, 0.028, 0.44, mid, 0, 0.006, -0.7);      // barrel
    p(0.05, 0.05, 0.2, dark, 0, -0.008, -0.5);       // ventilated handguard
    m(0.085, 0.11, 0.12, poly, 0, -0.1, -0.16);      // plastic ammo box
    p(0.02, 0.05, 0.32, dark, 0, 0.056, -0.25);      // full-length top rail
    p(0.046, 0.075, 0.16, poly, 0, -0.005, 0.07);    // folding stock
    p(0.024, 0.03, 0.1, dark, 0, 0.024, 0.1);        // stock strut
    p(0.03, 0.065, 0.04, dark, 0, -0.072, -0.05);    // grip
    p(0.012, 0.012, 0.22, dark, 0.025, -0.038, -0.78); // folded bipod legs
    p(0.012, 0.012, 0.22, dark, -0.025, -0.038, -0.78);
    s(0.014, 0.044, 0.02, dark, 0, 0.06, -0.8);      // front sight
    s(0.016, 0.032, 0.02, dark, 0, 0.056, -0.06);    // rear
    return 0.92;
  },
  intervention({ p, m, k, cyl, dark, mid }) {
    p(0.045, 0.07, 0.6, dark, 0, 0, -0.3);           // chassis
    p(0.024, 0.024, 0.46, mid, 0, 0.006, -0.83);     // long fluted barrel
    p(0.04, 0.04, 0.08, dark, 0, 0.006, -1.09);      // muzzle brake
    cyl(0.034, 0.24, 0x1c1e22, 0, 0.072, -0.26);     // scope
    k(0.055, 0.016, 0.016, mid, 0.048, 0.03, -0.07); // bolt handle arm, right side
    k(0.02, 0.022, 0.022, dark, 0.082, 0.03, -0.07); // bolt knob
    p(0.028, 0.024, 0.22, dark, 0, 0.028, 0.12);     // skeleton stock spine
    p(0.024, 0.02, 0.18, dark, 0, -0.042, 0.13);     // skeleton lower rail
    p(0.034, 0.1, 0.035, dark, 0, -0.005, 0.24);     // butt plate
    p(0.03, 0.07, 0.04, mid, 0, -0.075, -0.1);       // grip
    m(0.034, 0.055, 0.08, mid, 0, -0.06, -0.32);     // box mag
    p(0.012, 0.012, 0.16, dark, 0.02, -0.03, -0.85); // folded bipod
    p(0.012, 0.012, 0.16, dark, -0.02, -0.03, -0.85);
    return 1.15;
  },
  barrett({ p, m, cyl, dark, mid }) {
    p(0.058, 0.09, 0.72, dark, 0, 0, -0.28);         // thick receiver
    p(0.03, 0.03, 0.3, mid, 0, 0.008, -0.78);        // barrel
    p(0.062, 0.055, 0.14, dark, 0, 0.008, -0.99);    // huge arrow muzzle brake
    p(0.095, 0.035, 0.07, mid, 0, 0.008, -0.97);     // brake side fins
    m(0.042, 0.1, 0.15, mid, 0, -0.095, -0.3);       // long box mag
    cyl(0.032, 0.22, 0x1c1e22, 0, 0.075, -0.18);     // scope
    p(0.05, 0.09, 0.045, dark, 0, -0.005, 0.1);      // butt pad
    p(0.03, 0.07, 0.04, dark, 0, -0.075, -0.04);     // grip
    p(0.02, 0.05, 0.3, mid, 0, -0.062, -0.55);       // lower spring housing
    return 1.06;
  },
  usp({ p, dark, mid }) {
    p(0.04, 0.052, 0.25, dark, 0, 0.036, -0.105);    // squared slide
    p(0.038, 0.028, 0.2, mid, 0, 0, -0.1);           // frame w/ rail
    p(0.036, 0.115, 0.06, mid, 0, -0.055, -0.01);    // grip
    p(0.012, 0.01, 0.05, dark, 0, -0.022, -0.16);    // trigger guard
    p(0.012, 0.026, 0.015, dark, 0, 0.075, -0.21);
    p(0.016, 0.024, 0.015, dark, 0, 0.073, -0.01);
    return 0.24;
  },
  deagle({ p, dark }) {
    const steel = 0x565b63;
    p(0.05, 0.06, 0.31, steel, 0, 0.03, -0.135);     // huge slab slide
    p(0.028, 0.018, 0.3, steel, 0, 0.066, -0.13);    // flat top rib
    p(0.044, 0.03, 0.22, dark, 0, -0.005, -0.1);     // frame
    p(0.04, 0.12, 0.065, dark, 0, -0.062, 0);        // big grip
    p(0.014, 0.012, 0.05, dark, 0, -0.028, -0.17);   // trigger guard
    p(0.012, 0.024, 0.015, dark, 0, 0.085, -0.26);   // sights on the rib
    p(0.018, 0.022, 0.015, dark, 0, 0.083, -0.02);
    return 0.29;
  },
  g18({ p, m, dark, mid }) {
    const poly = 0x33363b;
    p(0.038, 0.048, 0.22, dark, 0, 0.032, -0.095);   // compact slide
    p(0.036, 0.026, 0.17, poly, 0, -0.002, -0.085);  // frame
    p(0.034, 0.1, 0.055, poly, 0, -0.052, 0);        // grip
    m(0.026, 0.1, 0.038, mid, 0, -0.15, 0.005);      // 33-rd extended mag
    p(0.011, 0.024, 0.014, dark, 0, 0.068, -0.185);
    p(0.014, 0.022, 0.014, dark, 0, 0.066, 0);
    return 0.22;
  },
  spas12({ p, s, k, dark, mid }) {
    const poly = 0x2c2f34;
    p(0.05, 0.08, 0.34, dark, 0, 0, -0.11);          // receiver
    p(0.038, 0.042, 0.42, mid, 0, 0.03, -0.44);      // barrel + heat shield
    p(0.028, 0.028, 0.4, dark, 0, -0.028, -0.43);    // mag tube below
    k(0.05, 0.052, 0.15, poly, 0, -0.028, -0.4);     // pump sleeve
    p(0.026, 0.02, 0.16, mid, 0, 0.035, 0.1);        // folding-stock top bar
    p(0.04, 0.062, 0.03, dark, 0, 0.01, 0.19);       // butt pad
    p(0.03, 0.065, 0.04, dark, 0, -0.068, -0.03);    // grip
    s(0.014, 0.036, 0.02, dark, 0, 0.062, -0.62);
    s(0.016, 0.03, 0.02, dark, 0, 0.058, -0.04);
    return 0.68;
  },
  r870({ p, s, k, dark, mid }) {
    const poly = 0x2f3236;
    p(0.048, 0.075, 0.36, dark, 0, 0, -0.1);         // steel receiver
    p(0.026, 0.026, 0.48, mid, 0, 0.03, -0.5);       // barrel
    p(0.024, 0.024, 0.42, dark, 0, -0.028, -0.47);   // mag tube below
    k(0.05, 0.052, 0.16, poly, 0, -0.028, -0.42);    // pump sleeve
    p(0.042, 0.068, 0.18, poly, 0, -0.002, 0.12);    // synthetic stock
    p(0.04, 0.06, 0.03, dark, 0, 0.002, 0.22);       // butt pad
    p(0.03, 0.065, 0.04, poly, 0, -0.068, -0.02);    // pistol grip
    s(0.012, 0.034, 0.02, dark, 0, 0.06, -0.72);     // bead front post
    s(0.016, 0.03, 0.02, dark, 0, 0.058, -0.03);     // rear notch
    return 0.75;
  },
  aa12({ p, s, m, dark, mid }) {
    const poly = 0x33363a;
    p(0.056, 0.09, 0.6, poly, 0, 0.005, -0.16);      // slab receiver, integral stock line
    p(0.05, 0.075, 0.16, poly, 0, -0.002, 0.2);      // thick butt
    p(0.032, 0.032, 0.2, mid, 0, 0.022, -0.55);      // fat barrel
    m(0.07, 0.1, 0.1, mid, 0, -0.092, -0.16);        // 8-rd drum mag
    p(0.03, 0.065, 0.04, dark, 0, -0.072, 0.04);     // grip behind the drum
    s(0.014, 0.034, 0.02, dark, 0, 0.065, -0.52);    // front sight tower
    s(0.016, 0.03, 0.02, dark, 0, 0.06, -0.04);      // rear tower
    return 0.66;
  },
};

function buildViewModel(w) {
  if (vmGun) { vmRoot.remove(vmGun); }
  // #16c: the tomahawk is its own held viewmodel (an axe + one fist), built
  // apart from the gun machinery — no sights/mag/attachments. axeBody groups
  // the hatchet so it can hide while the axe is out (thrown, mag 0).
  if (w.model === 'tomahawk') { vmGun = buildAxeViewModel(); vmRoot.add(vmGun); return; }
  const g = new THREE.Group();
  // camo (#9e): while camoOn, every part color routes through the shade
  // ramp (+ blotch map for pattern camos); cleared after the base gun so
  // mounted attachments (optic, foregrip) keep their black furniture
  const camoId = w.attachments && w.attachments.find(id => VM_CAMOS[id]);
  let camoOn = camoId ? VM_CAMOS[camoId] : null;
  const mat = c => new THREE.MeshLambertMaterial(camoOn
    ? { color: camoShade(c, camoOn.shades), map: camoOn.pattern ? camoTexture() : null }
    : { color: c });
  const part = (wd, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), mat(c));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const cyl = (r, l, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 10), mat(c));
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const irons = [];
  const sight = (...a) => { const m = part(...a); irons.push(m); return m; };
  const opticObstructions = [];
  const opticClearance = (...a) => { const m = part(...a); opticObstructions.push(m); return m; };
  const builtinGrips = [];
  const ugrip = (...a) => { const m = part(...a); builtinGrips.push(m); return m; };
  const magParts = [];
  const magp = (...a) => { const m = part(...a); magParts.push(m); return m; };
  const cycleParts = [];
  const cyclep = (...a) => { const m = part(...a); cycleParts.push(m); return m; };
  const dark = 0x26282c, mid = 0x3a3d42, wood = 0x6e5637, black = 0x1a1c1f;
  const type = w.model;
  const flashSize = VM_FLASH[type] || 0.12;
  let len = 0.62;
  const recipe = VM_RECIPES[w.key];
  if (recipe) {
    len = recipe({ p: part, s: sight, o: opticClearance, u: ugrip, m: magp, k: cyclep, cyl, dark, mid, wood, black });
  } else if (type === 'ar') {
    part(0.055, 0.085, 0.62, dark, 0, 0, -0.31);
    part(0.03, 0.03, 0.3, mid, 0, 0.005, -0.68);         // barrel
    magp(0.04, 0.14, 0.1, mid, 0, -0.1, -0.2);           // mag
    part(0.05, 0.08, 0.16, dark, 0, -0.01, 0.02);        // stock
    sight(0.014, 0.045, 0.02, dark, 0, 0.062, -0.55);    // front sight
    sight(0.014, 0.04, 0.02, dark, 0, 0.06, -0.12);      // rear sight
    len = 0.83;
  } else if (type === 'smg') {
    part(0.055, 0.09, 0.42, dark, 0, 0, -0.21);
    part(0.028, 0.028, 0.16, mid, 0, 0.008, -0.48);
    magp(0.038, 0.16, 0.08, mid, 0, -0.11, -0.12);
    sight(0.014, 0.04, 0.02, dark, 0, 0.062, -0.38);
    sight(0.014, 0.036, 0.02, dark, 0, 0.058, -0.06);
    len = 0.57;
  } else if (type === 'lmg') {
    part(0.065, 0.1, 0.7, dark, 0, 0, -0.35);
    part(0.034, 0.034, 0.3, mid, 0, 0.005, -0.83);
    magp(0.12, 0.12, 0.1, mid, 0, -0.1, -0.25);          // drum
    part(0.05, 0.08, 0.14, wood, 0, -0.01, 0.04);
    sight(0.014, 0.05, 0.02, dark, 0, 0.07, -0.62);
    len = 0.99;
  } else if (type === 'sniper') {
    part(0.05, 0.075, 0.9, dark, 0, 0, -0.45);
    part(0.026, 0.026, 0.32, mid, 0, 0.006, -1.0);
    cyl(0.032, 0.2, 0x1c1e22, 0, 0.07, -0.3);
    part(0.045, 0.09, 0.2, wood, 0, -0.015, 0.05);
    len = 1.17;
  } else if (type === 'shotgun') {
    part(0.05, 0.08, 0.7, dark, 0, 0, -0.35);
    part(0.03, 0.03, 0.24, mid, 0, -0.045, -0.5);        // tube
    cyclep(0.045, 0.05, 0.14, wood, 0, -0.045, -0.42);   // pump
    part(0.05, 0.075, 0.16, wood, 0, -0.005, 0.03);
    sight(0.014, 0.04, 0.02, dark, 0, 0.056, -0.66);
    len = 0.72;
  } else { // pistol
    part(0.04, 0.07, 0.24, dark, 0, 0.03, -0.1);
    part(0.036, 0.13, 0.06, mid, 0, -0.05, -0.02);
    part(0.012, 0.03, 0.015, dark, 0, 0.078, -0.2);
    len = 0.24;
  }
  camoOn = null; // base gun built — attachments below stay black
  // optics (#9c red dot, #19b holo): hide the irons, mount the housing on
  // the rail, and shift the ADS anchor so the reticle — not the 0.06 iron
  // line — hits screen center. Reticle color comes off the resolved def
  // (per-class pick, defaults red).
  g.userData.adsPos = VM_POS.ads.clone();
  const opticId = w.attachments && (w.attachments.includes('reddot') ? 'reddot'
    : w.attachments.includes('holo') ? 'holo'
    : w.attachments.includes('acog') ? 'acog' : null); // P54
  if (opticId) {
    for (const m of irons) m.visible = false;
    for (const m of opticObstructions) m.visible = false;
    const mnt = VM_OPTIC[w.key] || VM_OPTIC[type] || { y: 0.045, z: -0.12 };
    const glow = () => new THREE.MeshBasicMaterial({ color: w.reticleColor || 0xff2020, side: THREE.DoubleSide });
    part(0.04, 0.014, 0.08, black, 0, mnt.y + 0.007, mnt.z);          // rail base
    let retY;
    if (opticId === 'reddot') {
      retY = mnt.y + 0.039;
      part(0.007, 0.05, 0.026, black, -0.0215, retY, mnt.z);          // tube walls
      part(0.007, 0.05, 0.026, black, 0.0215, retY, mnt.z);
      part(0.05, 0.007, 0.026, black, 0, mnt.y + 0.0675, mnt.z);      // tube top
      const dot = new THREE.Mesh(new THREE.BoxGeometry(VM_RETICLE.reddot, VM_RETICLE.reddot, 0.004), glow());
      dot.position.set(0, retY, mnt.z);
      g.add(dot);
    } else if (opticId === 'acog') {
      // P54: ACOG — closed magnifier silhouette built as an open-eyeline
      // frame (solid boxes would black out screen center at ADS): riser,
      // four tube walls, a wider objective-bell collar up front. Crosshair
      // reticle (two thin bars) sits on the eyepiece plane and tints with
      // the same per-class reticle color as the dot/holo.
      retY = mnt.y + 0.043;
      part(0.03, 0.012, 0.03, black, 0, mnt.y + 0.017, mnt.z);        // riser
      part(0.007, 0.042, 0.12, black, -0.0215, retY, mnt.z);          // tube walls
      part(0.007, 0.042, 0.12, black, 0.0215, retY, mnt.z);
      part(0.05, 0.007, 0.12, black, 0, retY + 0.0215, mnt.z);
      part(0.05, 0.007, 0.12, black, 0, retY - 0.0215, mnt.z);
      part(0.008, 0.056, 0.02, black, -0.028, retY, mnt.z - 0.068);   // objective bell collar
      part(0.008, 0.056, 0.02, black, 0.028, retY, mnt.z - 0.068);
      part(0.064, 0.008, 0.02, black, 0, retY + 0.028, mnt.z - 0.068);
      part(0.064, 0.008, 0.02, black, 0, retY - 0.028, mnt.z - 0.068);
      const hair = VM_RETICLE.acogHair;
      const hbar = new THREE.Mesh(new THREE.BoxGeometry(hair * 5, hair, 0.003), glow());
      hbar.position.set(0, retY, mnt.z);
      g.add(hbar);
      const vbar = new THREE.Mesh(new THREE.BoxGeometry(hair, hair * 5, 0.003), glow());
      vbar.position.set(0, retY, mnt.z);
      g.add(vbar);
    } else {
      // holo: wide flat open window frame with a circle-dot reticle
      retY = mnt.y + 0.046;
      part(0.008, 0.056, 0.03, black, -0.034, retY, mnt.z);           // window side walls
      part(0.008, 0.056, 0.03, black, 0.034, retY, mnt.z);
      part(0.076, 0.008, 0.03, black, 0, retY + 0.032, mnt.z);        // frame top
      part(0.076, 0.012, 0.04, black, 0, retY - 0.034, mnt.z);        // emitter shelf
      const ring = new THREE.Mesh(new THREE.RingGeometry(VM_RETICLE.holoRingInner, VM_RETICLE.holoRingOuter, 20), glow());
      ring.position.set(0, retY, mnt.z);
      g.add(ring);
      const dot = new THREE.Mesh(new THREE.BoxGeometry(VM_RETICLE.holoDot, VM_RETICLE.holoDot, 0.003), glow());
      dot.position.set(0, retY, mnt.z);
      g.add(dot);
    }
    g.userData.adsPos.y = -retY; // camera-space y=0 at full ADS → reticle exactly on the aim point
  }
  // foregrip (#9d): vertical grip hung off the handguard underside — collar
  // at the mount, raked shaft, bottom cap. A recipe's built-in grip (MP5K)
  // hides so the mounted one replaces it.
  if (w.attachments && w.attachments.includes('foregrip')) {
    for (const m of builtinGrips) m.visible = false;
    const mnt = VM_GRIP[w.key] || VM_GRIP[type] || { y: -0.045, z: -0.35 };
    part(0.04, 0.014, 0.056, black, 0, mnt.y - 0.007, mnt.z);            // mount collar
    const shaft = part(0.032, 0.1, 0.04, black, 0, mnt.y - 0.062, mnt.z - 0.006);
    shaft.rotation.x = 0.12;                                             // slight forward rake
    part(0.036, 0.014, 0.044, black, 0, mnt.y - 0.115, mnt.z - 0.012);   // flared bottom cap
  }
  // laser (#19c): a small emitter box on the handguard rail plus a bright
  // beam that raycasts to the first wall each frame (updateCameraAndViewmodel
  // sets the length + dot). Mount derives off the foregrip's handguard point
  // — right side of the rail, near barrel height — so no per-gun table.
  if (w.attachments && w.attachments.includes('laser')) {
    const lm = VM_GRIP[w.key] || VM_GRIP[type] || { y: -0.045, z: -0.35 };
    const ex = 0.05, ey = lm.y + 0.052, ez = lm.z + 0.02;      // emitter local pos
    part(0.028, 0.026, 0.055, black, ex, ey, ez);              // rail-mounted housing
    const beamCol = w.laserColor || 0x30ff44;
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.006),
      new THREE.MeshBasicMaterial({ color: beamCol }));
    lens.position.set(ex, ey, ez - 0.03);                      // glowing front lens
    g.add(lens);
    // beam: unit-length cylinder along its Y axis, positioned/oriented/scaled
    // per frame to span emitter → crosshair dot; additive so it reads as light
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 6),
      new THREE.MeshBasicMaterial({ color: beamCol, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(beam);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8),
      new THREE.MeshBasicMaterial({ color: beamCol, transparent: true, opacity: 0.9, depthWrite: false }));
    g.add(dot);
    g.userData.laser = { beam, dot, emit: new THREE.Vector3(ex, ey, ez - 0.03), maxLen: 60 };
  }
  // mag handle (#10b): tagged mag parts re-parent into one group so the
  // reload anim moves them as a unit — rest pose is the zero transform,
  // and the per-gun pull direction rides userData with them. Guns with
  // no tagged mag (pistol-grip mags, tube-fed) get no handle and only
  // play the tilt + hand motion.
  g.userData.magPull = VM_MAG_PULL[w.key] || VM_MAG_PULL.default;
  if (magParts.length) {
    const mg = new THREE.Group();
    g.add(mg);
    for (const pm of magParts) mg.add(pm);
    g.userData.magPart = mg;
  }
  // pump/bolt handle (#10c): tagged cycle parts (pump sleeve, bolt arm +
  // knob) re-parent into one group at zero transform like the mag, so the
  // cycle anim slides them as a unit and rest = identity.
  if (cycleParts.length) {
    const pg = new THREE.Group();
    g.add(pg);
    for (const pm of cycleParts) pg.add(pm);
    g.userData.pumpPart = pg;
  }
  // hands (#10a): box-built arms as children of the gun group, so bob/
  // kick/sprint pose carries them for free. Two hand styles: 'grip'
  // wraps a vertical grip (fingers stacked down the front face), 'cup'
  // cradles the handguard from below (fingers curling up the far side).
  // The sleeve hangs off a wrist pivot GROUP behind the hand, so wrist +
  // cuff + forearm rotate together like a joint — no hand/sleeve gap at
  // any angle. Built after camoOn clears so skin/sleeve never remap;
  // mat() is plain Lambert here.
  const skin = 0xc49a6c, glove = 0x24261f, sleeve = 0x44503b;
  const arm = (hy, hz, style, side, foreYaw, forePitch) => {
    const a = new THREE.Group();
    a.position.set(style === 'grip' ? side * 0.006 : 0, hy, hz);
    const b = (wd, hh, dd, c, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(wd, hh, dd), mat(c));
      m.position.set(px, py, pz);
      a.add(m);
      return m;
    };
    if (style === 'grip') {
      b(0.05, 0.052, 0.055, glove, 0, 0.004, 0.012);        // back of hand over the grip
      for (let i = 0; i < 3; i++)                           // fingers wrap the front face
        b(0.048, 0.0125, 0.026, skin, 0, 0.014 - i * 0.016, -0.024);
      b(0.014, 0.03, 0.018, skin, side * -0.03, 0.014, -0.002); // thumb, camera side
    } else {
      b(0.056, 0.05, 0.062, glove, 0, -0.006, 0);           // palm under the handguard
      for (let i = 0; i < 3; i++)                           // fingers curl up the far side
        b(0.014, 0.038, 0.014, skin, 0.028, 0.018, -0.018 + i * 0.018);
      b(0.014, 0.03, 0.017, skin, -0.029, 0.01, 0.01);      // thumb, camera side
    }
    const wrist = new THREE.Group();                        // joint pivot at the hand's back edge
    wrist.position.set(side * 0.004, -0.01, style === 'grip' ? 0.03 : 0.046);
    wrist.rotation.set(forePitch, foreYaw, side * -0.12);
    a.add(wrist);
    const seg = (wd, hh, dd, c, pz) => {                    // origin at the segment's front face
      const geo = new THREE.BoxGeometry(wd, hh, dd);
      geo.translate(0, 0, dd / 2 + pz);
      const m = new THREE.Mesh(geo, mat(c));
      wrist.add(m);
      return m;
    };
    seg(0.042, 0.042, 0.034, skin, -0.01);                  // bare wrist
    seg(0.066, 0.062, 0.05, sleeve, 0.02);                  // rolled jacket cuff
    seg(0.058, 0.054, 0.5, sleeve, 0.064);                  // forearm sleeve (runs off-frame)
    g.add(a);
    return a;
  };
  const hnd = VM_HANDS[w.key] || VM_HANDS[type] || VM_HANDS.ar;
  g.userData.armTrigger = arm(hnd.trig[0], hnd.trig[1], 'grip', 1, 0.18, 0.66);
  // #10c moves the trigger hand to the bolt handle — rest saved like the
  // support arm's below
  g.userData.armTrigger.userData.rest = g.userData.armTrigger.position.clone();
  const gm = VM_GRIP[w.key] || VM_GRIP[type];
  const sup = (w.attachments && w.attachments.includes('foregrip') && gm)
    ? [gm.y - 0.055, gm.z - 0.005, 'grip']                  // wrap the mounted grip shaft
    : hnd.sup || (gm ? [gm.y - 0.024, gm.z] : [-0.05, -0.4]);
  // #10b/#10c animate the support arm — rest pose saved so the animator
  // can offset from it and snap back
  g.userData.armSupport = arm(sup[0], sup[1], sup[2] || 'cup', -1, -0.38, 0.68);
  g.userData.armSupport.userData.rest = g.userData.armSupport.position.clone();
  // P55: suppressor — one dark tube hung off the muzzle, aligned by the
  // same per-model `len` every recipe already declares (so AR/SMG/pistol
  // alignment is free). The flash quad mounts past it and HALVES —
  // suppressed shots flash small.
  let muzzleZ = -len, fSize = flashSize;
  if (w.attachments && w.attachments.includes('suppressor')) {
    cyl(0.027, 0.22, 0x17191c, 0, 0.005, -len - 0.1);  // the can
    cyl(0.017, 0.02, 0x0d0e10, 0, 0.005, -len - 0.205); // dark bore cap
    muzzleZ = -len - 0.21;
    fSize = flashSize * 0.5;
  }
  // muzzle flash quad
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(fSize, fSize),
    new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  flash.position.set(0, 0.005, muzzleZ);
  flash.visible = false;
  g.add(flash);
  g.userData.flash = flash;
  g.userData.muzzleLocal = new THREE.Vector3(0, 0, muzzleZ);
  g.position.copy(VM_POS.hip);
  vmGun = g;
  vmRoot.add(g);
}

// #16c: held tomahawk viewmodel — a box-built hatchet gripped in one fist.
// The hatchet lives in a userData.axeBody group so updateCameraAndViewmodel
// can hide it while the axe is airborne/on the ground (mag 0), leaving the
// empty hand. Safe with the shared update loop: it carries adsPos +
// muzzleLocal and no magPart/pumpPart/laser, all of which are guarded there.
function buildAxeViewModel() {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (wd, h, d, c, x, y, z, group) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), mat(c));
    m.position.set(x, y, z);
    (group || g).add(m);
    return m;
  };
  const wood = 0x6e5637, steel = 0x9aa0a6, edge = 0xc6ccd2, glove = 0x24261f, skin = 0xc49a6c, sleeve = 0x44503b;
  // the hatchet, tilted so the head reads against the sky as you hold it
  const axe = new THREE.Group();
  axe.rotation.set(0.15, 0, -0.12);
  g.add(axe);
  box(0.028, 0.028, 0.44, wood, 0, 0, -0.14, axe);         // haft (runs forward)
  box(0.03, 0.02, 0.05, wood, 0, 0.03, 0.06, axe);         // pommel knob
  box(0.026, 0.15, 0.06, steel, 0, 0.055, -0.34, axe);     // head cheek
  box(0.02, 0.17, 0.03, edge, -0.01, 0.055, -0.37, axe);   // bit / cutting edge
  box(0.03, 0.05, 0.06, steel, 0, 0.055, -0.29, axe);      // poll behind the eye
  g.userData.axeBody = axe;
  // a single fist wrapping the haft (camera-side thumb), with a short sleeve
  const hand = new THREE.Group();
  hand.position.set(0, -0.01, -0.02);
  box(0.05, 0.052, 0.06, glove, 0, 0, 0, hand);            // back of hand
  for (let i = 0; i < 3; i++) box(0.048, 0.0125, 0.026, skin, 0, 0.014 - i * 0.016, -0.03, hand); // fingers
  box(0.014, 0.03, 0.018, skin, -0.03, 0.014, -0.004, hand); // thumb
  box(0.06, 0.055, 0.16, sleeve, 0, -0.015, 0.09, hand);   // cuff + forearm running off-frame
  g.add(hand);
  // shared-loop contract: an ADS anchor and a (never-shown) muzzle point
  g.userData.adsPos = new THREE.Vector3(0.04, -0.12, -0.4);
  g.userData.muzzleLocal = new THREE.Vector3(0, 0, -0.4);
  g.position.copy(VM_POS.hip);
  return g;
}

// melee knife viewmodel — built once, shown only during the meleeT swing
const vmKnife = (() => {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const part = (wd, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), mat(c));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  part(0.023, 0.033, 0.094, 0x2a2620, 0, 0, 0.053);     // grip
  part(0.045, 0.04, 0.015, 0x3a3d42, 0, 0, 0);          // guard
  part(0.01, 0.032, 0.17, 0xb9c0c8, 0, 0.003, -0.094);  // blade
  part(0.01, 0.017, 0.05, 0xb9c0c8, 0, 0.01, -0.2);     // tip
  part(0.011, 0.008, 0.145, 0x878f98, 0, -0.014, -0.085); // edge
  // left hand + forearm gripping the knife — a fist thrust reads as a stab
  // instead of a floating blade; the forearm trails back-and-down toward the
  // shoulder so the arm comes in from the lower-left as the stab drives right
  const skin = 0xc49a6c, glove = 0x24261f, sleeve = 0x44503b;
  part(0.052, 0.05, 0.078, glove, 0, -0.006, 0.078);    // fist wrapping the grip
  part(0.05, 0.014, 0.052, skin, 0, 0.026, 0.062);      // knuckles
  part(0.016, 0.03, 0.03, skin, -0.031, 0.004, 0.045);  // thumb, camera side
  const fore = new THREE.Group();
  fore.position.set(0, -0.012, 0.1);
  fore.rotation.set(0.32, -0.85, 0);                    // trail off toward screen-left
  const seg = (w, h, d, c, z) => {
    const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, 0, d / 2 + z);
    const m = new THREE.Mesh(geo, mat(c)); fore.add(m); return m;
  };
  seg(0.055, 0.052, 0.04, skin, 0.0);                   // wrist
  seg(0.07, 0.066, 0.06, sleeve, 0.03);                 // rolled cuff
  seg(0.062, 0.058, 0.5, sleeve, 0.08);                 // forearm, runs off-frame
  g.add(fore);
  g.visible = false;
  vmRoot.add(g);
  return g;
})();

// stab keyframes (camera-space pos + euler), meleeT-relative: the left fist
// enters from the lower-LEFT, cocks back, then THRUSTS the blade forward while
// crossing to the RIGHT, and retracts down-right. The blade points forward
// (rot.y ~ 0, small ± yaw) the whole time so it reads as a stab, not a slash;
// the thrust is the z push (pulled-back -0.3 -> extended -0.7), the left->right
// is the x sweep (-0.34 -> +0.2)
const KNIFE_POSES = {
  start:  { p: new THREE.Vector3(-0.36, -0.32, -0.42), r: new THREE.Vector3(0.1, 0.5, 0.05) },
  windup: { p: new THREE.Vector3(-0.26, -0.22, -0.4),  r: new THREE.Vector3(0.06, 0.45, 0.05) },
  end:    { p: new THREE.Vector3(0.16, -0.2, -0.72),   r: new THREE.Vector3(0.02, -0.15, -0.05) },
  exit:   { p: new THREE.Vector3(0.3, -0.5, -0.5),     r: new THREE.Vector3(0.15, -0.25, -0.05) },
};
function poseKnife(a, b, u) {
  vmKnife.position.lerpVectors(a.p, b.p, u);
  vmKnife.rotation.set(
    THREE.MathUtils.lerp(a.r.x, b.r.x, u),
    THREE.MathUtils.lerp(a.r.y, b.r.y, u),
    THREE.MathUtils.lerp(a.r.z, b.r.z, u));
}

// ============================================================
// Effects — pooled tracers & impact sparks
// ============================================================
const FX = { tracers: [], sparks: [], fires: [], smokes: [] };

function initFxPools(scene) {
  FX.tracers = []; FX.sparks = []; FX.fires = []; FX.smokes = [];
  for (let i = 0; i < 30; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffdf9a, transparent: true, opacity: 0.85 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    FX.tracers.push({ line, ttl: 0 });
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const cx = cv.getContext('2d');
  const grad = cx.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,235,180,1)');
  grad.addColorStop(0.4, 'rgba(255,180,80,0.7)');
  grad.addColorStop(1, 'rgba(255,150,50,0)');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(cv);
  for (let i = 0; i < 20; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.visible = false;
    sp.scale.set(0.3, 0.3, 1);
    scene.add(sp);
    FX.sparks.push({ sp, ttl: 0 });
  }
  // napalm flames: additive fire sprites that linger and flicker
  const fcv = document.createElement('canvas');
  fcv.width = fcv.height = 64;
  const fcx = fcv.getContext('2d');
  const fgrad = fcx.createRadialGradient(32, 32, 2, 32, 32, 32);
  fgrad.addColorStop(0, 'rgba(255,240,170,1)');
  fgrad.addColorStop(0.35, 'rgba(255,140,40,0.85)');
  fgrad.addColorStop(0.7, 'rgba(200,60,20,0.4)');
  fgrad.addColorStop(1, 'rgba(120,30,10,0)');
  fcx.fillStyle = fgrad;
  fcx.fillRect(0, 0, 64, 64);
  const fireTex = new THREE.CanvasTexture(fcv);
  for (let i = 0; i < 40; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: fireTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.visible = false;
    scene.add(sp);
    FX.fires.push({ sp, ttl: 0, max: 1, size: 1, seed: 0 });
  }
  // smoke puffs: soft gray billboards, normal blending so they read opaque
  const scv = document.createElement('canvas');
  scv.width = scv.height = 64;
  const scx = scv.getContext('2d');
  const sgrad = scx.createRadialGradient(32, 32, 4, 32, 32, 32);
  sgrad.addColorStop(0, 'rgba(206,209,205,0.95)');
  sgrad.addColorStop(0.55, 'rgba(186,191,187,0.6)');
  sgrad.addColorStop(1, 'rgba(170,176,171,0)');
  scx.fillStyle = sgrad;
  scx.fillRect(0, 0, 64, 64);
  const smokeTex = new THREE.CanvasTexture(scv);
  for (let i = 0; i < 36; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTex, transparent: true, depthWrite: false }));
    sp.visible = false;
    scene.add(sp);
    FX.smokes.push({ sp, ttl: 0, max: 1, size: 1, seed: 0 });
  }
}
function fxTracer(from, to) {
  const t = FX.tracers.find(t => t.ttl <= 0) || FX.tracers[0];
  const pos = t.line.geometry.attributes.position.array;
  pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
  pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.visible = true;
  t.ttl = 0.055;
}
function fxSpark(at, red, scale = 0.32) {
  const s = FX.sparks.find(s => s.ttl <= 0) || FX.sparks[0];
  s.sp.position.copy(at);
  s.sp.material.color.setHex(red ? 0xd03020 : 0xffffff);
  s.sp.scale.set(scale, scale, 1);
  s.sp.visible = true;
  s.ttl = 0.14;
}
function fxFire(at, ttl, size) {
  const f = FX.fires.find(f => f.ttl <= 0) || FX.fires[0];
  f.sp.position.copy(at);
  f.ttl = f.max = ttl;
  f.size = size;
  f.seed = Math.random() * 10;
  f.sp.visible = true;
}
function fxSmoke(at, ttl, size) {
  const s = FX.smokes.find(s => s.ttl <= 0) || FX.smokes[0];
  s.sp.position.copy(at);
  s.ttl = s.max = ttl;
  s.size = size;
  s.seed = Math.random() * 10;
  s.sp.material.rotation = Math.random() * Math.PI * 2;
  s.sp.visible = true;
}
function fxUpdate(dt) {
  for (const t of FX.tracers) if (t.ttl > 0) { t.ttl -= dt; if (t.ttl <= 0) t.line.visible = false; }
  for (const s of FX.sparks) if (s.ttl > 0) {
    s.ttl -= dt;
    s.sp.scale.multiplyScalar(0.88);
    if (s.ttl <= 0) s.sp.visible = false;
  }
  for (const f of FX.fires) if (f.ttl > 0) {
    f.ttl -= dt;
    if (f.ttl <= 0) { f.sp.visible = false; continue; }
    const life = f.ttl / f.max;
    const flick = 0.85 + 0.3 * Math.sin((f.max - f.ttl) * 23 + f.seed);
    const s = f.size * (0.55 + life * 0.45) * flick;
    f.sp.scale.set(s, s * 1.25, 1);
    f.sp.material.opacity = Math.min(1, life * 2.5);
  }
  for (const s of FX.smokes) if (s.ttl > 0) {
    s.ttl -= dt;
    if (s.ttl <= 0) { s.sp.visible = false; continue; }
    const age = s.max - s.ttl;
    // billow up fast, hang, then thin out over the last couple of seconds
    const sc = s.size * (0.35 + 0.65 * Math.min(1, age / 0.9) + age * 0.02);
    s.sp.scale.set(sc, sc, 1);
    s.sp.material.opacity = 0.88 * Math.min(1, age / 0.45) * Math.min(1, s.ttl / 2);
    s.sp.material.rotation += dt * 0.1 * (s.seed > 5 ? 1 : -1);
    s.sp.position.y += dt * 0.05; // lazy drift upward
  }
}

// ============================================================
// Minimap
// ============================================================
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');
let mmBg = null, mmScale = 1;

function buildMinimapBg() {
  mmBg = document.createElement('canvas');
  mmBg.width = mmBg.height = 150;
  const c = mmBg.getContext('2d');
  c.fillStyle = 'rgba(20,26,16,0.9)';
  c.fillRect(0, 0, 150, 150);
  const half = Math.max(G.map.bounds.x, G.map.bounds.z) + 1;
  mmScale = 150 / (half * 2);
  c.fillStyle = 'rgba(200,200,190,0.45)';
  for (const b of G.colliders) {
    const h = b.max.y - b.min.y;
    if (h < 1.2 || b.max.y < 1.2 || b.min.y > 1.8) continue;
    const x = (b.min.x + half) * mmScale, y = (b.min.z + half) * mmScale;
    c.fillRect(x, y, (b.max.x - b.min.x) * mmScale, (b.max.z - b.min.z) * mmScale);
  }
}
let _jamTagShown = false; // P61: tag-line refresh fires on jam start/end transitions
function drawMinimap() {
  if (!mmBg) return;
  // P61: jammed comms — the victim's minimap is static: darkened collider
  // print, per-frame speckle, NO dots (yours or theirs), no player arrow.
  // PRECEDENCE, explicitly: the jam BEATS a running UAV (the counter in
  // Counter-UAV) by suppressing its benefit rather than clearing
  // uavUntil — a jam that ends mid-UAV hands the UAV back its remainder.
  const jammed = commsJammed(player);
  if (jammed !== _jamTagShown) { _jamTagShown = jammed; refreshStreakTag(); }
  if (jammed) {
    mmCtx.clearRect(0, 0, 150, 150);
    mmCtx.globalAlpha = 0.4;
    mmCtx.drawImage(mmBg, 0, 0);
    mmCtx.globalAlpha = 1;
    mmCtx.fillStyle = 'rgba(205,210,200,0.55)';
    for (let i = 0; i < 70; i++) mmCtx.fillRect(Math.random() * 150, Math.random() * 150, 2, 1);
    return;
  }
  const uav = G.time < G.uavUntil;
  const half = Math.max(G.map.bounds.x, G.map.bounds.z) + 1;
  const toMap = (x, z) => [(x + half) * mmScale, (z + half) * mmScale];
  mmCtx.clearRect(0, 0, 150, 150);
  mmCtx.drawImage(mmBg, 0, 0);
  for (const b of G.bots) {
    if (!b.alive) continue;
    const [x, y] = toMap(b.pos.x, b.pos.z);
    if (b.team === player.team) {
      mmCtx.fillStyle = '#5aa0e0';
      mmCtx.beginPath(); mmCtx.arc(x, y, 2.5, 0, 7); mmCtx.fill();
    } else if (uav || G.time - b.lastShotTime < 1.8 || G.time < b.pingedUntil) { // P51: snapshot mark, live-tracking
      mmCtx.fillStyle = '#e05a4a';
      mmCtx.beginPath(); mmCtx.arc(x, y, 2.5, 0, 7); mmCtx.fill();
    }
  }
  if (player.alive) {
    const [x, y] = toMap(player.pos.x, player.pos.z);
    mmCtx.save();
    mmCtx.translate(x, y);
    mmCtx.rotate(-player.yaw + Math.PI);
    mmCtx.fillStyle = '#ffffff';
    mmCtx.beginPath();
    mmCtx.moveTo(0, -5); mmCtx.lineTo(3.5, 4); mmCtx.lineTo(-3.5, 4);
    mmCtx.closePath(); mmCtx.fill();
    mmCtx.restore();
  }
}

// ============================================================
// Match lifecycle
// ============================================================
function spawnPointsForTeam(team) {
  if (G.mode && G.mode.structure === 'ffa') {
    const pts = [];
    for (const k in G.map.spawns) pts.push(...G.map.spawns[k]);
    return pts;
  }
  return G.map.spawns[team] || G.map.spawns.tf || [];
}

function pickSpawn(team) {
  const pts = spawnPointsForTeam(team);
  const enemies = G.combatants.filter(c => c.team !== team && c.alive);
  const mates = G.combatants.filter(c => c.team === team && c.alive);
  let best = null, bestScore = -1e9;
  for (const [x, z] of pts) {
    let minE = 999;
    for (const e of enemies) {
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < minE) minE = d;
    }
    let minM = 999;
    for (const m of mates) {
      const d = Math.hypot(m.pos.x - x, m.pos.z - z);
      if (d < minM) minM = d;
    }
    // reward distance from enemies; heavily penalize spawning on top of a
    // living teammate so two bots respawning the same frame don't overlap
    let score = minE + Math.random() * 8;
    if (minM < 3) score -= (3 - minM) * 20;
    if (score > bestScore) { bestScore = score; best = [x, z]; }
  }
  return new THREE.Vector3(best[0], 0, best[1]);
}

function getEnemies(team) {
  return G.combatants.filter(c => c.team !== team);
}

function noteShot(ent) {
  // P55: the firing def — resolved (attachment-modified) for the player,
  // the base weapon for bots (bots don't mount attachments today, so the
  // suppressed branch is live scaffolding on their side)
  const def = ent.isPlayer ? curW().def : ent.weapon;
  const suppressed = !!(def && def.suppressed);
  // P55: a suppressed shot never writes lastShotTime — no 1.8 s red-dot
  // flash on the enemy minimap (player-only scaffolding today: only bots
  // are drawn as enemy dots, and bots don't run suppressors — but the
  // hook is the hook)
  if (!suppressed) ent.lastShotTime = G.time;
  // gunfire is loud: enemy bots within earshot learn the shooter's position
  // (Bot.hearShot halves the radius through walls). Ninja fires quieter.
  let earshot = 25;
  if (ent.isPlayer && ent.perks.has('ninja')) earshot *= 0.6;
  // P55: suppressed fire barely carries — ×0.35 (25 → ~9 m), MULTIPLICATIVE
  // with ninja (→ ~5 m) like every other modifier in this codebase
  if (suppressed) earshot *= 0.35;
  for (const b of G.bots) b.hearShot(ent, earshot);
}

// Stereo pan (-1..1) of a world position from the player's point of view:
// dot of the flat direction-to-source with the camera's right vector
// (right = (cos yaw, -sin yaw), matching the movement basis).
// Scaled to ±0.9 so a source dead to the side keeps a trace in the far ear.
function audioPan(srcPos) {
  const dx = srcPos.x - player.pos.x, dz = srcPos.z - player.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.001) return 0;
  return 0.9 * (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
}

// ---------- killstreak rewards (COD-style, manual deploy) ----------
// Earned once per life at a kills-since-death threshold, banked (banked
// rewards survive death), cycled with [3] and deployed with [G].
// P60 (#P60-design §1): id-keyed registry (the THROWABLES/MAPS
// convention); KILLSTREAK_ORDER drives UI lists and threshold order.
// selectable = may occupy a class streak slot (P67 wires the picker);
// special = always armed for everyone, never a slot (the nuke).
// weaponName = the kill-attribution tag a DEPLOYED streak's kills carry;
// STREAK_WEAPON_NAMES derives from it and gates streak progress — the
// locked rule "killstreak kills never feed streak progress" (this is the
// P60 bug fix: napalm kills used to march toward the nuke). P61–P65 add
// cuav/carepackage/airstrike defs here; the earn loop is count-agnostic.
const KILLSTREAKS = {
  uav: {
    id: 'uav', name: 'UAV', kills: 5, unlockLevel: 1, // P12: starter streak
    selectable: true, weaponName: null, // reveals — it never kills
    deploy() {
      // 20 s of all living enemies on the minimap (drawMinimap);
      // the UAV keeps flying through the owner's death, COD-style
      G.uavUntil = G.time + 20;
      AudioSys.uav();
    },
  },
  cuav: {
    id: 'cuav', name: 'COUNTER-UAV', kills: 4, unlockLevel: 11, // #P60-design §2: the cheapest slot — it protects, it can't kill
    selectable: true, weaponName: null, // it jams — it never kills
    deploy() { deployCounterUav(); },
  },
  napalm: {
    id: 'napalm', name: 'NAPALM STRIKE', kills: 10, unlockLevel: 1, // P12: starter streak
    selectable: true, weaponName: 'NAPALM',
    deploy() { deployNapalm(); },
  },
  nuke: {
    id: 'nuke', name: 'TACTICAL NUKE', kills: 25,
    selectable: false, special: true, // always armed, never a slot
    weaponName: 'TACTICAL NUKE',
    deploy() { deployNuke(); },
  },
};
const KILLSTREAK_ORDER = ['cuav', 'uav', 'napalm', 'nuke']; // P61: cuav leads — ladder position 4 < 5
// Kill-source guard set, derived once (locked rule: killstreak kills do
// not count toward streak progress — covers NAPALM today, AIRSTRIKE etc.
// automatically the day their defs land with a weaponName)
const STREAK_WEAPON_NAMES = new Set(
  Object.values(KILLSTREAKS).map(k => k.weaponName).filter(Boolean));

// P60/P70: effective threshold — HARDLINE discounts by one kill (floor 2,
// the sane minimum). Special streaks (nuke) are never "equipped", so
// hardline exempts them by construction.
function effKills(ks) {
  return ks.special ? ks.kills : Math.max(2, ks.kills - (player.perks.has('hardline') ? 1 : 0));
}

// P61: is this entity's comms jammed right now? jamTeam is the team the
// jam LANDED ON; the FFA sentinel '*' means everyone but the deployer
// (jamFrom), since FFA teams are per-combatant strings.
function commsJammed(ent) {
  if (G.time >= G.jamUntil) return false;
  return G.jamTeam === '*' ? ent.team !== G.jamFrom : ent.team === G.jamTeam;
}

// P61: Counter-UAV — nonlethal 15 s comms jam against everyone who isn't
// on the deployer's side. Layer (a), engine flag: the victim team's
// minimap statics out and their UAV benefit dies for the duration
// (scaffolding today — only the player HAS a minimap and bots don't
// deploy streaks). Layer (b), the teeth: jammed bots lose hearShot intel
// (guard in bots.js) — enemies stop converging on your gunfire for 15 s,
// the push window a CUAV buys. Pure information war: no damage, no
// blind, no slow.
const CUAV_DUR = 15;
function deployCounterUav() {
  G.jamUntil = G.time + CUAV_DUR;
  if (G.mode && G.mode.structure === 'teams') {
    G.jamTeam = G.mode.teams.find(t => t !== player.team) || null;
  } else {
    G.jamTeam = '*'; // FFA: the jam lands on the whole lobby but you
  }
  G.jamFrom = player.team;
  AudioSys.jammer(CUAV_DUR);
}

// ---- napalm strike (#7b): random bombardment across the map ----
// Canisters rain down staggered over ~5 s; each impact burns a radius
// with distance falloff, blocked by walls (losClear). Team-safe: only
// enemies of the owner take damage — never the owner or teammates.
// Like the UAV, an in-flight strike keeps falling through the owner's
// death (updateNapalm runs while the match is live, not per-life).
const NAPALM = { count: 16, radius: 6.5, dmg: 155, minDmg: 35 };
const _napalmDrops = [];
const _dropDown = new THREE.Vector3(0, -1, 0);
const _dropProbe = new THREE.Vector3();
const _impactAt = new THREE.Vector3();
const _burnAt = new THREE.Vector3();
const _fallA = new THREE.Vector3();
const _fallB = new THREE.Vector3();

function deployNapalm() {
  const bx = Math.max(2, G.map.bounds.x - 2), bz = Math.max(2, G.map.bounds.z - 2);
  for (let i = 0; i < NAPALM.count; i++) {
    const x = (Math.random() * 2 - 1) * bx;
    const z = (Math.random() * 2 - 1) * bz;
    // land on whatever is under the sky at this point (roofs count)
    _dropProbe.set(x, 40, z);
    const hit = rayWorld(_dropProbe, _dropDown, 40, G.colliders);
    _napalmDrops.push({
      x, y: hit ? hit.point.y : 0, z,
      t: 0.8 + i * 0.27 + Math.random() * 0.2, // staggered impacts
      fall: 0.5, // canister streak visible this long before impact
      whistled: false,
    });
  }
}

function napalmImpact(d) {
  _impactAt.set(d.x, d.y + 0.5, d.z);
  // flash + lingering flames
  fxFire(_impactAt, 0.3, 4.5);
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 2.4;
    _burnAt.set(d.x + Math.sin(a) * r, d.y + 0.5 + Math.random() * 0.5, d.z + Math.cos(a) * r);
    fxFire(_burnAt, 2.2 + Math.random() * 1.6, 1.4 + Math.random() * 1.2);
  }
  AudioSys.explosion(Math.hypot(d.x - player.pos.x, d.z - player.pos.z), audioPan(_impactAt));
  for (const b of G.bots) {
    if (!b.alive || b.team === player.team) continue; // team-safe
    const dist = Math.hypot(b.pos.x - d.x, b.pos.z - d.z);
    if (dist > NAPALM.radius || Math.abs(b.pos.y - d.y) > 3.5) continue;
    _burnAt.set(b.pos.x, b.pos.y + 1.2, b.pos.z);
    if (!losClear(_impactAt, _burnAt, G.colliders)) continue; // cover protects
    const dmg = THREE.MathUtils.lerp(NAPALM.dmg, NAPALM.minDmg, dist / NAPALM.radius);
    b.hurt(Math.round(dmg), player, 'NAPALM', false);
  }
}

function updateNapalm(dt) {
  for (let i = _napalmDrops.length - 1; i >= 0; i--) {
    const d = _napalmDrops[i];
    d.t -= dt;
    if (d.t <= 0) {
      _napalmDrops.splice(i, 1);
      napalmImpact(d);
    } else if (d.t < d.fall) {
      if (!d.whistled) {
        d.whistled = true;
        AudioSys.incoming(Math.hypot(d.x - player.pos.x, d.z - player.pos.z),
          audioPan(_fallB.set(d.x, d.y, d.z)));
      }
      // canister streak: accelerating in on a fixed diagonal from the sky
      const sx = d.x + 16, sy = d.y + 30, sz = d.z + 11;
      const u = 1 - d.t / d.fall, e = u * u;
      const trail = Math.max(0, e - 0.15);
      _fallA.set(sx + (d.x - sx) * trail, sy + (d.y - sy) * trail, sz + (d.z - sz) * trail);
      _fallB.set(sx + (d.x - sx) * e, sy + (d.y - sy) * e, sz + (d.z - sz) * e);
      fxTracer(_fallA, _fallB);
    }
  }
}

// ---- tactical nuke (#7c): dramatic countdown, then a cinematic — the
// camera pulls out over the map, a bomber crosses the sky and drops the
// bomb, the whiteout fades into a growing mushroom cloud, everyone dies,
// and the match ends as a win for the owner's team, MW2-style.
// Like the other streaks the countdown keeps running through the owner's
// death (updateNuke runs while the match is live) and dies at match end.
const NUKE_COUNTDOWN = 10;
let _nukeT = -1;   // seconds until the cinematic; <0 = none in the air
let _cine = null;  // nuke cinematic state (G.state === 'nukecine')
const _cineCamPos = new THREE.Vector3();
const _cineLook = new THREE.Vector3();

function deployNuke() {
  _nukeT = NUKE_COUNTDOWN;
  AudioSys.nukeSiren();
  Profile.onNukeCalled();        // P5: immediate lifetime stat
  Profile.MatchXP.onNukeCalled(); // P4: flat +1000, no per-kill XP
}

function updateNuke(dt) {
  if (_nukeT < 0) return;
  const prevSec = Math.ceil(_nukeT);
  _nukeT -= dt;
  if (_nukeT <= 0) {
    _nukeT = -1;
    startNukeCinematic();
    return;
  }
  const sec = Math.ceil(_nukeT);
  if (sec !== prevSec) AudioSys.nukeTick();
  UI.setNukeCountdown(sec);
}

// box-built strategic bomber, nose facing +x
function buildNukePlane() {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const part = (w, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const body = 0x4a4f45, wing = 0x3e423a, dark = 0x2e3230;
  part(9, 1.1, 1.1, body, 0, 0, 0);          // fuselage
  part(1.6, 0.85, 0.85, dark, 5.2, 0, 0);    // nose
  part(3.4, 0.18, 12, wing, 0.4, 0.2, 0);    // main wing
  part(1.5, 0.14, 4.2, wing, -4.1, 0.35, 0); // tailplane
  part(1.6, 2.1, 0.16, wing, -4.2, 1.1, 0);  // fin
  for (const z of [-4.4, -2.4, 2.4, 4.4])    // engine pods under the wing
    part(1.4, 0.5, 0.5, dark, 1.3, -0.35, z);
  g.scale.set(1.6, 1.6, 1.6);
  return g;
}

// the bomb itself: fat cylinder-ish body + tail fins, nose facing +x
function buildNukeBomb() {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const part = (w, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  part(1.8, 0.55, 0.55, 0x33362f, 0, 0, 0);
  part(0.5, 0.4, 0.4, 0x272a24, 1.1, 0, 0);
  part(0.5, 0.14, 1.1, 0x272a24, -0.85, 0, 0); // tail fins
  part(0.5, 1.1, 0.14, 0x272a24, -0.85, 0, 0);
  return g;
}

// Tsar Bomba-scale low-poly mushroom cloud: total height ~5× the map's
// half-extent and a cap wider than the whole play area, so the map reads
// as a diorama under it. Grown from ~0 by the cinematic; returns the
// group + the glow light inside it
function buildMushroomCloud(B) {
  const H = B * 5; // ground zero → cap dome
  const g = new THREE.Group();
  const puff = (r, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8),
      new THREE.MeshLambertMaterial({ color: c }));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const gray = 0x9a9284, dust = 0x8a8072;
  // stem: a fat column of puffs all the way up to the cap
  puff(H * 0.09, 0, H * 0.05, 0, dust);
  puff(H * 0.11, 0, H * 0.16, 0, dust);
  puff(H * 0.13, 0, H * 0.30, 0, dust);
  puff(H * 0.14, 0, H * 0.45, 0, gray);
  puff(H * 0.15, 0, H * 0.60, 0, gray);
  // ground-dust skirt around the stem base
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    puff(H * 0.10, Math.sin(a) * H * 0.13, H * 0.07, Math.cos(a) * H * 0.13, dust);
  }
  // cap: center dome + a wide ring curling under it + an upper crown
  puff(H * 0.30, 0, H * 0.88, 0, gray);
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2;
    puff(H * 0.15, Math.sin(a) * H * 0.24, H * 0.74, Math.cos(a) * H * 0.24, dust);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i + 0.5) / 7 * Math.PI * 2;
    puff(H * 0.13, Math.sin(a) * H * 0.15, H * 1.0, Math.cos(a) * H * 0.15, gray);
  }
  // fireball glow at the base
  puff(H * 0.11, 0, H * 0.06, 0, 0xffa040).material =
    new THREE.MeshBasicMaterial({ color: 0xff9030 });
  const light = new THREE.PointLight(0xff8030, 10, H * 2);
  light.position.y = H * 0.12;
  g.add(light);
  return { group: g, light };
}

// endWin (optional): when set (true/false/null), this is the end-of-match
// Nuketown nuke — cosmetic, and the held result is shown afterwards.
// When omitted it's the killstreak nuke: everyone dies, owner's team wins.
function startNukeCinematic(endWin) {
  G.state = 'nukecine';
  UI.setNukeCountdown(null);
  UI.show(null); // no HUD, no menus — the world is the whole screen
  document.exitPointerLock && document.exitPointerLock();
  if (vmGun) vmGun.visible = false;
  vmKnife.visible = false;
  document.getElementById('scopeOverlay').classList.add('hidden');
  G.camera.fov = UI.settings.fov; // undo any ADS zoom
  G.camera.updateProjectionMatrix();
  const B = Math.max(G.map.bounds.x, G.map.bounds.z);
  const span = B * 2.6;
  const plane = buildNukePlane();
  plane.position.set(-span, B * 1.5, -B * 0.4);
  G.scene.add(plane);
  _cine = {
    t: 0, B,
    // camera glides from the player's eyes to a vantage over the map
    camFrom: G.camera.position.clone(),
    lookFrom: G.camera.position.clone()
      .add(G.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(12)),
    camTo: new THREE.Vector3(0, B * 1.15, B * 2.3),
    lookTo: new THREE.Vector3(0, 4, 0),
    // post-impact pull-back: far/high enough that the full-grown ~5×B
    // cloud fits in frame with the map a diorama under it
    camFar: new THREE.Vector3(0, B * 2.9, B * 4.7),
    lookFar: new THREE.Vector3(0, B * 2.3, 0),
    plane, planeSpeed: span / 3.2, dropped: false,
    bomb: null, bombT: 0, dropY: 0,
    cloud: null, impactT: -1, shake: 0,
    fogNear: G.scene.fog.near, fogFar: G.scene.fog.far,
    camFarPlane: G.camera.far,
    endWin,
  };
  // the pull-back vantage sits inside the gameplay fog band and near the
  // 300 far plane — push both out for the show, restored at finish
  G.scene.fog.near = B * 7;
  G.scene.fog.far = B * 16;
  G.camera.far = B * 18;
  G.camera.updateProjectionMatrix();
  AudioSys.nukePlane();
}

function nukeImpact(x, z) {
  const c = _cine;
  c.impactT = 0;
  c.shake = 1;
  UI.nukeFlash();
  AudioSys.nukeBlast();
  const cloud = buildMushroomCloud(c.B);
  cloud.group.position.set(x, 0, z);
  cloud.group.scale.set(0.05, 0.05, 0.05);
  G.scene.add(cloud.group);
  c.cloud = cloud;
  for (let i = 0; i < 12; i++) { // burning ground around the zero point
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * c.B * 0.45;
    _burnAt.set(x + Math.sin(a) * r, 0.6, z + Math.cos(a) * r);
    fxFire(_burnAt, 3 + Math.random() * 2, 2 + Math.random() * 2);
  }
  if (c.endWin !== undefined) {
    // end-of-match nuke: purely cosmetic — bots flop for the camera, but
    // the scoreboard is already decided and must not change
    for (const b of G.bots) {
      if (!b.alive) continue;
      b.alive = false;
      b.deathAnimT = 2.2;
    }
    return;
  }
  // killstreak nuke — everyone dies for real: enemies credit the owner
  // (score + killfeed), teammates die uncredited — no friendly kills
  for (const b of G.bots) {
    if (!b.alive) continue;
    // nuke kills through spawn invuln by design (#18a) — bypassProtect = true
    b.hurt(9999, b.team !== player.team ? player : null, 'TACTICAL NUKE', false, true);
  }
  // the owner dies too (damagePlayer would show the respawn screen
  // mid-cinematic, so just record the death directly)
  if (player.alive) {
    player.alive = false;
    player.hp = 0;
    player.deaths++;
    Profile.onDeath(); // P5: dying to your own nuke is still a death
    player._killStreakCount = 0;
    player._streakKills = 0;
    player._streakAwarded.clear(); // P60: dying to your own nuke resets the awarded set too
  }
}

function updateNukeCine(dt) {
  const c = _cine;
  if (!c) return;
  c.t += dt;

  // camera: smoothstep glide out to the drop vantage, then after impact a
  // second, much longer pull-back that tracks the cloud's growth (plus
  // impact shake)
  const u = Math.min(1, c.t / 2.2), e = u * u * (3 - 2 * u);
  _cineCamPos.lerpVectors(c.camFrom, c.camTo, e);
  _cineLook.lerpVectors(c.lookFrom, c.lookTo, e);
  if (c.impactT >= 0) {
    const z = Math.min(1, c.impactT / 6.5), ez = z * z * (3 - 2 * z);
    _cineCamPos.lerpVectors(c.camTo, c.camFar, ez);
    _cineLook.lerpVectors(c.lookTo, c.lookFar, ez);
  }
  if (c.shake > 0) {
    c.shake -= dt * 0.16;
    const s = Math.max(0, c.shake) * c.B * 0.14;
    _cineCamPos.x += (Math.random() - 0.5) * s;
    _cineCamPos.y += (Math.random() - 0.5) * s;
    _cineCamPos.z += (Math.random() - 0.5) * s;
  }
  G.camera.position.copy(_cineCamPos);
  G.camera.lookAt(_cineLook);

  // bomber: straight run, releases over the middle, climbs away after
  c.plane.position.x += c.planeSpeed * dt;
  if (c.dropped) c.plane.position.y += dt * 2.5;
  if (!c.dropped && c.plane.position.x >= -c.B * 0.25) {
    c.dropped = true;
    c.bomb = buildNukeBomb();
    c.bomb.position.copy(c.plane.position);
    c.bomb.position.y -= 1.4;
    c.dropY = c.bomb.position.y;
    G.scene.add(c.bomb);
    c.bombT = 0;
    AudioSys.incoming(0, 0);
  }
  if (c.bomb) {
    c.bombT += dt;
    const f = Math.min(1, c.bombT / 1.7);
    c.bomb.position.y = c.dropY * (1 - f * f); // accelerating fall
    c.bomb.position.x += c.planeSpeed * 0.35 * (1 - f) * dt; // carried speed bleeds off
    c.bomb.rotation.z = -f * 1.2; // noses over as it falls
    if (f >= 1) {
      const bx = c.bomb.position.x, bz = c.bomb.position.z;
      G.scene.remove(c.bomb);
      c.bomb = null;
      nukeImpact(bx, bz);
    }
  }

  // after impact: the cloud swells while the flash fades, then match end
  if (c.impactT >= 0) {
    c.impactT += dt;
    const g = Math.min(1, c.impactT / 6.5);
    const s = 0.05 + 0.95 * (1 - Math.pow(1 - g, 3)); // fast rise, slow finish
    c.cloud.group.scale.set(s, s, s);
    c.cloud.group.rotation.y += dt * 0.06;
    c.cloud.light.intensity = Math.max(0, 10 * (1 - c.impactT / 7));
    for (const b of G.bots) if (!b.alive) b.update(dt); // death anims play out
    if (c.impactT >= 10.5) {
      G.scene.fog.near = c.fogNear;
      G.scene.fog.far = c.fogFar;
      G.camera.far = c.camFarPlane;
      G.camera.updateProjectionMatrix();
      // end-of-match nuke shows the held result; the killstreak nuke
      // wins for the owner's team no matter the score
      const win = c.endWin !== undefined ? c.endWin : true;
      _cine = null;
      finishMatch(win);
    }
  }
}

// ---------- throwables (#6): shared framework for frag/stun/smoke ----------
// One equipment kind per life (player.equip), thrown with [F]. A thrown
// grenade is a small AABB projectile: gravity + axis-separated sweeps
// against the world colliders that reflect instead of stop (bounce), a
// fuse, then the kind's detonate(). Frag is the first kind: radial damage
// with distance falloff, blocked by walls (losClear), COD-style — hurts
// enemies (credited to the thrower) and the thrower (uncredited, so no
// friendly-kill score), never teammates.
// #16a: each throwable carries its loadout `slot` — 'lethal' ([F]) or
// 'tactical' ([T]). A class picks one per slot (or NONE); the tactical slot
// is a real stun-vs-smoke choice. The old always-on third smoke slot is gone.
const THROWABLES = {
  frag: {
    name: 'FRAG', slot: 'lethal', unlockLevel: 1, // P12: starter lethal
    count: 2, fuse: 3.6, radius: 7, dmg: 125, minDmg: 25,
    color: 0x3d4a33, throwSpeed: 15, throwUp: 3.4,
    detonate: fragDetonate,
  },
  // P42: semtex — the sticky lethal. First surface OR combatant contact
  // pins it; stuck to a combatant it rides them and kills through any
  // cover (they're wearing it — fragDetonate handles that up front).
  // noCookOff like the stun: the fuse holds in hand and burns a fixed
  // 2.25 s from release. The trade vs the frag: no cooking and no bounce
  // control, for stick certainty and a slightly tighter blast (r6 vs 7).
  // model: 'semtex' = squat tan body + red arming light, reads vs frag.
  semtex: {
    name: 'SEMTEX', slot: 'lethal', unlockLevel: 15, // P14: provisional table L15
    count: 2, fuse: 2.25, radius: 6, dmg: 125, minDmg: 25,
    sticky: true, noCookOff: true, model: 'semtex',
    color: 0x6f5f38, throwSpeed: 15, throwUp: 3.4,
    detonate: fragDetonate,
  },
  // P43: C4 — the remote charge. Short heavy lob, sticks like the semtex
  // (same sticky path), and its Infinity fuse never burns down: it fires
  // only on the manual trigger — pressing the lethal key again while the
  // charge is out (detonateRemoteCharges on the keydown path). Single
  // charge, despawns with its owner's death. Player-only; bots never
  // place one. model: 'c4' = flat olive slab + antenna.
  c4: {
    name: 'C4', slot: 'lethal',
    count: 1, fuse: Infinity, radius: 7, dmg: 125, minDmg: 25,
    sticky: true, remote: true, noCookOff: true, model: 'c4',
    color: 0x4a5230, throwSpeed: 9, throwUp: 2.6,
    detonate: fragDetonate,
  },
  // P44: claymore — the placed proximity mine. A stubby toss that plants
  // upright on its first floor rest, facing where the owner aimed at
  // placement. An ENEMY entering the tripRange/60-degree cone in front
  // (LOS-checked) starts the tripDelay beep window — the classic
  // sprint-past counterplay — then a directional blast: frag falloff in
  // the frontal arc only, nothing behind the faceplate. Owner/teammates
  // never trip it. Persists through owner death as area denial; the next
  // placement replaces it (one active per owner). Player-only; bots
  // never place one. model: 'claymore' = slab on prongs, green blink.
  claymore: {
    name: 'CLAYMORE', slot: 'lethal',
    count: 1, fuse: Infinity, radius: 5, dmg: 125, minDmg: 25,
    plants: true, proximity: true, noCookOff: true, model: 'claymore',
    tripRange: 3.5, tripDot: 0.866, tripDelay: 0.35, // dot = cos(30°) half-angle
    color: 0x55603c, throwSpeed: 4, throwUp: 1.6,
    detonate: claymoreDetonate,
  },
  // P45: throwing knife — the lethal-slot humiliation pick. NOT grenade
  // physics: startCooking short-circuits on def.knife into an instant
  // flat throw that delegates to the tomahawk engine (throwKnife pushes
  // into _tomahawks with kind:'knife') — same per-step body sweep (any
  // direct hit is an instant kill), same stick-on-first-contact, same
  // walk-over ground pickup, which restores this slot's count instead of
  // the tomahawk weapon slot. No fuse, no blast, and it never enters
  // _throwables, so the danger arrow can't see it. dmg/radius here are
  // display-only; the kill is the engine's 9999. Kills demote in Gun
  // Game like KNIFE/TOMAHAWK (it's a humiliation kill).
  throwingknife: {
    name: 'THROWING KNIFE', slot: 'lethal',
    count: 1, fuse: Infinity, radius: 0, dmg: 135, minDmg: 135,
    knife: true, noCookOff: true,
    color: 0x8a9096, throwSpeed: 27, throwUp: 1.6,
    detonate: null, // never detonates — it never enters _throwables
  },
  // stun: zero damage — anyone caught in the radius with a clear line to
  // the bang is stunned; duration scales with proximity (stunMax at
  // ground zero, stunMin at the edge). Short fuse so it pops near where
  // it lands. Tactical slot: thrown with [T], frags keep [F].
  // noCookOff: a real flashbang can't cook off — the fuse holds while in
  // hand ([T] holds forever) and only burns after release.
  // model: 'flashbang' gives it its own mesh (cylinder, no bulge) so it
  // reads as a stun in flight, not a recolored frag.
  stun: {
    name: 'STUN', slot: 'tactical', unlockLevel: 1, // P12: starter tactical
    count: 2, fuse: 1.8, radius: 8, dmg: 0, minDmg: 0,
    stunMax: 4, stunMin: 1.2, noCookOff: true, model: 'flashbang',
    color: 0x5a6a72, throwSpeed: 17, throwUp: 3.0,
    detonate: stunDetonate,
  },
  // smoke: no damage — the pop spawns a lingering cloud (radius here is
  // the cloud's, not a blast's) that blocks sight lines both ways via
  // smokeBlocked. Own slot on [E]; one per life, it's strong cover.
  smoke: {
    name: 'SMOKE', slot: 'tactical', unlockLevel: 5, // P14: provisional table L5
    count: 1, fuse: 1.5, radius: 4.5, dmg: 0, minDmg: 0,
    smokeDur: 8,
    color: 0x4a5346, throwSpeed: 15, throwUp: 3.2,
    detonate: smokeDetonate,
  },
  // P49: decoy — the misinformation tactical. No blast at all: it lands,
  // arms on its first rest (plants-style, no fuse — Infinity never burns),
  // and for ~8 s emits jittered fake gunshots. Each emit pops a muffled
  // shot sound and calls hearShot(radius 25) on the bots — hearShot's own
  // guards do the rest: engaged bots (this.target set) never re-path off
  // it, un-engaged enemies walk over to investigate a firefight that
  // isn't there. Ends silently and despawns. Player-only; bots never
  // throw tacticals. model: 'decoy' = stubby can + amber blink.
  decoy: {
    name: 'DECOY', slot: 'tactical',
    count: 1, fuse: Infinity, radius: 0, dmg: 0, minDmg: 0,
    decoy: true, decoyDur: 8, noCookOff: true, model: 'decoy',
    color: 0x6a5c3a, throwSpeed: 15, throwUp: 3.2,
    detonate: null, // never detonates — the emitter branch removes it
  },
  // P51: snapshot — the recon tactical. Pops on a short fuse (cookable,
  // like the smoke) and marks every enemy within 14 m — THROUGH WALLS,
  // radius-only, no LOS gate (documented balance decision: the ball IS
  // the lever, a whiffed throw reveals nobody) — as live minimap dots
  // for pingDur seconds (drawMinimap reads b.pos each frame, so the
  // marks track movement). Victims learn nothing but the pop's sound;
  // bots don't read minimaps, so the ignorance is symmetric. Player-only;
  // bots never throw tacticals. Distinct teal body, default silhouette.
  snapshot: {
    name: 'SNAPSHOT', slot: 'tactical',
    count: 1, fuse: 1.5, radius: 14, dmg: 0, minDmg: 0,
    pingDur: 5,
    color: 0x3e6a6e, throwSpeed: 15, throwUp: 3.2,
    detonate: snapDetonate,
  },
  // P48: flashbang — blinds instead of freezes (the stun distinction:
  // stun = crowd control, see-but-can't-act; flash = denial of
  // information, act-but-can't-see). Same LOS'd blastFactor rule as the
  // stun (radius 9), duration lerp(flashMax..flashMin) by proximity,
  // then FACING-GATED: eyes on the bang take it all, looking away halves
  // it, and smoke between bang and victim blocks it outright (smoke
  // counters flash). Victims keep full movement and look speed — the
  // punishment is whiteout + accuracy, not legs. noCookOff like the
  // stun: real flashbangs don't cook. model: 'ninebang' = brighter
  // twin-band cylinder so it reads apart from the stun in flight.
  flashbang: {
    name: 'FLASHBANG', slot: 'tactical',
    count: 1, fuse: 1.6, radius: 9, dmg: 0, minDmg: 0,
    flashMax: 3.5, flashMin: 0.8, noCookOff: true, model: 'ninebang',
    color: 0x878e96, throwSpeed: 17, throwUp: 3.0,
    detonate: flashDetonate,
  },
};
const GREN_R = 0.08, GREN_H = 0.16, GREN_BOUNCE = 0.42;
const GREN_GRAVITY = 13;
const GREN_STEP_BOUNCED = 1, GREN_STEP_REST = 2;
const GREN_PREVIEW_DT = 1 / 60, GREN_PREVIEW_POINTS = 64;
const GREN_PREVIEW_ARC_SKIP = 0.08;
const GREN_THROW_FORWARD = 0.28, GREN_THROW_RIGHT = 0.34;
const _throwables = [];
const _blastAt = new THREE.Vector3();
const _victimAt = new THREE.Vector3();
const _fragDangerForward = new THREE.Vector3();
const _fragDangerRight = new THREE.Vector3();
const _fragDangerDelta = new THREE.Vector3();
let _grenadePreview = null;
const _grenPreviewPos = new THREE.Vector3();
const _grenPreviewVel = new THREE.Vector3();
const _grenPreviewDir = new THREE.Vector3();
const _grenThrowRight = new THREE.Vector3();
const _grenWorldUp = new THREE.Vector3(0, 1, 0);

// Branched on the def's model, not a kind check (defs carry behavior):
// default is the frag/smoke sphere-and-cap silhouette; 'flashbang' is the
// stun's — straight cylinder body, lighter band, dark top cap.
function buildGrenadeMesh(def) {
  const g = new THREE.Group();
  if (def.model === 'claymore') {
    // "FRONT TOWARD ENEMY": slab on splayed prongs, green ready blink on
    // the face. Local +z is the watched direction (rotation.y = facingYaw).
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.03),
      new THREE.MeshLambertMaterial({ color: def.color }));
    body.position.y = 0.1;
    g.add(body);
    for (const s of [-1, 1]) {
      const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 5),
        new THREE.MeshLambertMaterial({ color: 0x2c3128 }));
      prong.position.set(s * 0.045, 0.045, 0);
      prong.rotation.z = s * 0.35;
      g.add(prong);
    }
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0x46ff58 }));
    light.position.set(0, 0.125, 0.018);
    g.add(light);
    g.userData.blinkLight = light;
    return g;
  }
  if (def.model === 'c4') {
    // flat olive slab + antenna — reads as a planted charge, not a grenade
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.11),
      new THREE.MeshLambertMaterial({ color: def.color }));
    slab.position.y = 0.03;
    g.add(slab);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 5),
      new THREE.MeshLambertMaterial({ color: 0x22261f }));
    ant.position.set(0.055, 0.1, 0.03);
    g.add(ant);
    return g;
  }
  if (def.model === 'semtex') {
    // squat puck + always-bright red arming light — sticky, not a frag
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshLambertMaterial({ color: def.color }));
    body.scale.y = 0.85;
    body.position.y = 0.07;
    g.add(body);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xff2e1f }));
    light.position.y = 0.135;
    g.add(light);
    return g;
  }
  if (def.model === 'decoy') {
    // stubby can + amber status light (blinks while emitting) — smaller
    // than the stun's cylinder so it reads as a gadget, not a grenade
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 10),
      new THREE.MeshLambertMaterial({ color: def.color }));
    body.position.y = 0.055;
    g.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.025, 10),
      new THREE.MeshLambertMaterial({ color: 0x33382c }));
    cap.position.y = 0.115;
    g.add(cap);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffb03a }));
    light.position.y = 0.14;
    g.add(light);
    g.userData.blinkLight = light;
    return g;
  }
  if (def.model === 'ninebang') {
    // P48: brighter steel cylinder with TWIN dark vent bands — twin bands
    // vs the stun's single light one is the in-flight tell
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.17, 10),
      new THREE.MeshLambertMaterial({ color: def.color }));
    body.position.y = 0.085;
    g.add(body);
    for (const y of [0.06, 0.115]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.051, 0.051, 0.028, 10),
        new THREE.MeshLambertMaterial({ color: 0x2b3036 }));
      band.position.y = y;
      g.add(band);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8),
      new THREE.MeshLambertMaterial({ color: 0x1f2429 }));
    cap.position.y = 0.19;
    g.add(cap);
    return g;
  }
  if (def.model === 'flashbang') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10),
      new THREE.MeshLambertMaterial({ color: def.color }));
    body.position.y = 0.08;
    g.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 0.035, 10),
      new THREE.MeshLambertMaterial({ color: 0x9fb2c0 }));
    band.position.y = 0.11;
    g.add(band);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.045, 8),
      new THREE.MeshLambertMaterial({ color: 0x2f363c }));
    cap.position.y = 0.182;
    g.add(cap);
    return g;
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6),
    new THREE.MeshLambertMaterial({ color: def.color }));
  body.scale.y = 1.25;
  body.position.y = 0.08;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.045),
    new THREE.MeshLambertMaterial({ color: 0x707668 }));
  cap.position.y = 0.17;
  g.add(cap);
  return g;
}

function initGrenadePreview(scene) {
  const group = new THREE.Group();
  group.visible = false;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.43, 40),
    new THREE.MeshBasicMaterial({
      color: 0x9eff8c, transparent: true, opacity: 0.88,
      depthWrite: false, side: THREE.DoubleSide,
    }));
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const positions = new Float32Array(GREN_PREVIEW_POINTS * 3);
  const dotsGeo = new THREE.BufferGeometry();
  dotsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dotsGeo.setDrawRange(0, 0);
  const dots = new THREE.Points(dotsGeo, new THREE.PointsMaterial({
    color: 0xdfffd6, size: 4.5, transparent: true, opacity: 0.62,
    depthWrite: false, sizeAttenuation: false,
  }));
  group.add(dots);
  scene.add(group);
  _grenadePreview = { group, ring, dots, positions };
}

function setPlayerThrowableLaunch(out, dir) {
  G.camera.getWorldDirection(dir);
  _grenThrowRight.crossVectors(dir, _grenWorldUp);
  if (_grenThrowRight.lengthSq() < 1e-5) _grenThrowRight.set(1, 0, 0);
  else _grenThrowRight.normalize();
  return out.set(player.pos.x, player.pos.y + eyeHeight() - 0.12, player.pos.z)
    .addScaledVector(_grenThrowRight, GREN_THROW_RIGHT)
    .addScaledVector(dir, GREN_THROW_FORWARD);
}

function spawnThrowable(def, fuse, speed, up) {
  const dir = G.camera.getWorldDirection(_shotDir);
  const pos = setPlayerThrowableLaunch(new THREE.Vector3(), dir);
  const vel = new THREE.Vector3().copy(dir).multiplyScalar(speed);
  vel.y += up; // lob arc
  const mesh = buildGrenadeMesh(def);
  mesh.position.copy(pos);
  G.scene.add(mesh);
  const t = { def, mesh, pos, vel, fuse,
    spin: 5 + Math.random() * 3, sinceBounce: 0 };
  // P44: a planting def remembers the aim direction at placement — the
  // planted mine watches (and blasts) along this horizontal facing
  if (def.plants) {
    const fl = Math.hypot(dir.x, dir.z) || 1;
    t.facingX = dir.x / fl;
    t.facingZ = dir.z / fl;
    t.facingYaw = Math.atan2(t.facingX, t.facingZ);
  }
  _throwables.push(t);
}

// #16b: a bot lobs a throwable at aimPos. Bots don't cook (instant throw),
// so it spawns with the full fuse. A ballistic solve picks the launch
// velocity that lands the grenade near aimPos over a distance-scaled flight
// time; skill-scaled scatter keeps low tiers from being pinpoint mortars.
// owner=bot on the throwable routes credit/damage through fragDetonate.
function spawnBotThrowable(bot, kind, aimPos) {
  const def = THROWABLES[kind];
  if (!def) return;
  const from = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
  // scatter grows as accuracy drops (recruits ~±2 m, veterans ~±0.5 m)
  const spread = (1.0 - Math.min(0.9, bot.skill.acc || 0.15)) * 2.2;
  const ax = aimPos.x + (Math.random() - 0.5) * spread;
  const az = aimPos.z + (Math.random() - 0.5) * spread;
  const dx = ax - from.x, dz = az - from.z;
  const D = Math.hypot(dx, dz) || 0.001;
  const T = THREE.MathUtils.clamp(D / 13 + 0.4, 0.55, 1.7); // longer throws hang longer
  const g = 13; // matches updateThrowables gravity
  const vh = D / T;                                   // horizontal speed
  const vy = ((aimPos.y - from.y) + 0.5 * g * T * T) / T; // vertical lob
  const vel = new THREE.Vector3(dx / D * vh, vy, dz / D * vh);
  const mesh = buildGrenadeMesh(def);
  mesh.position.copy(from);
  G.scene.add(mesh);
  _throwables.push({ def, mesh, pos: from.clone(), vel, fuse: def.fuse,
    spin: 5 + Math.random() * 3, sinceBounce: 0, owner: bot });
  AudioSys.throwWhoosh();
}

// COD-style cooking: key down pulls the pin (committed — the grenade is
// spent and its fuse burns in hand), key up throws with the remaining
// fuse. Cook too long and it detonates in hand; dying mid-cook drops it.
// The two slots share one pair of hands — 'lethal' ([F]), 'tactical' ([T])
// — so only one grenade cooks at a time. An empty slot's kind is null, so
// startCooking no-ops on it (THROWABLES[null] is undefined).
const EQUIP_SLOTS = {
  lethal:   { kind: 'equip',    left: 'equipLeft' },
  tactical: { kind: 'equipTac', left: 'equipTacLeft' },
};
function startCooking(slot = 'lethal') {
  if (G.state !== 'playing' || !player.alive) return;
  const fields = EQUIP_SLOTS[slot];
  const kind = player[fields.kind];
  const def = THROWABLES[kind];
  if (!def || player[fields.left] <= 0 || player.cooking !== null) return;
  if (player.throwT > 0 || player.switchT > 0 || player.meleeT > 0.33) return;
  // P45: a knife doesn't cook or lob — it leaves flat on the keydown
  // (throwKnife delegates flight/kill/pickup to the tomahawk engine)
  if (def.knife) {
    player[fields.left]--;
    throwKnife();
    return;
  }
  player[fields.left]--;
  player.cooking = def.fuse;
  player.cookKind = kind;
  player.cookSlot = slot;
  AudioSys.pinPull();
}

// slot given: only the keyup matching the cooking slot throws (releasing
// [T] must not lob a frag cooked on [F]); omitted (blur) throws whatever
function releaseThrow(slot) {
  if (player.cooking === null) return;
  if (slot && slot !== player.cookSlot) return;
  const def = THROWABLES[player.cookKind];
  const fuse = player.cooking;
  player.cooking = null;
  player.spawnProtectT = 0; // #18a: throwing ends spawn invuln immediately
  player.throwT = 0.55; // re-throw cooldown; also drives the viewmodel animation
  // P44: one active claymore per owner — a fresh placement replaces the
  // old one (COD rule; also the only way a mine ever leaves before match
  // end, since claymores persist through their owner's death)
  if (def.proximity) {
    for (let i = _throwables.length - 1; i >= 0; i--) {
      const o = _throwables[i];
      if (o.def.proximity && (o.owner || player) === player) {
        G.scene.remove(o.mesh);
        _throwables.splice(i, 1);
      }
    }
  }
  spawnThrowable(def, fuse, def.throwSpeed, def.throwUp);
  AudioSys.throwWhoosh();
}

// instant pin-pull + lob in one call (DEBUG / tests)
function throwEquipment(slot = 'lethal') { startCooking(slot); releaseThrow(slot); }

// P43: pressing the lethal key with a live C4 out detonates it instead of
// starting another throw (the keydown path tries this first). Fires every
// player-owned remote charge — in flight or stuck. Player-only mechanic;
// bots never place remote charges. Returns true if anything fired.
function detonateRemoteCharges() {
  let fired = false;
  for (let i = _throwables.length - 1; i >= 0; i--) {
    const t = _throwables[i];
    if (!t.def.remote || (t.owner || player) !== player) continue;
    G.scene.remove(t.mesh);
    _throwables.splice(i, 1);
    t.def.detonate(t);
    fired = true;
  }
  return fired;
}

function settleThrowableBounce(v, dt) {
  let result = 0;
  if (-v.y * GREN_BOUNCE < 1.0) { v.y = 0; result |= GREN_STEP_REST; }
  else { v.y *= -GREN_BOUNCE; result |= GREN_STEP_BOUNCED; }
  v.x *= 0.75; v.z *= 0.75;
  if (result & GREN_STEP_REST) {
    const f = Math.max(0, 1 - 4 * dt);
    v.x *= f; v.z *= f;
  }
  return result;
}

function applyThrowableGroundFriction(v, dt) {
  const f = Math.max(0, 1 - 4 * dt);
  v.x *= f; v.z *= f;
}

function stepThrowableMotion(p, v, dt, colliders) {
  let result = 0;
  v.y -= GREN_GRAVITY * dt;
  p.x += v.x * dt;
  for (const c of colliders) {
    if (c.max.y <= 0.02) continue;
    if (_boxOverlap(c, p, GREN_R, GREN_H)) {
      p.x = v.x > 0 ? c.min.x - GREN_R - 0.001 : c.max.x + GREN_R + 0.001;
      v.x *= -GREN_BOUNCE;
      result |= GREN_STEP_BOUNCED;
    }
  }
  p.z += v.z * dt;
  for (const c of colliders) {
    if (c.max.y <= 0.02) continue;
    if (_boxOverlap(c, p, GREN_R, GREN_H)) {
      p.z = v.z > 0 ? c.min.z - GREN_R - 0.001 : c.max.z + GREN_R + 0.001;
      v.z *= -GREN_BOUNCE;
      result |= GREN_STEP_BOUNCED;
    }
  }
  p.y += v.y * dt;
  for (const c of colliders) {
    if (c.max.y <= 0.02) continue;
    if (_boxOverlap(c, p, GREN_R, GREN_H)) {
      if (v.y < 0) { p.y = c.max.y + 0.001; result |= settleThrowableBounce(v, dt); }
      else { p.y = c.min.y - GREN_H - 0.001; v.y *= -GREN_BOUNCE; result |= GREN_STEP_BOUNCED; }
    }
  }
  if (p.y <= 0 && v.y <= 0) {
    p.y = 0;
    if (v.y < 0) result |= settleThrowableBounce(v, dt);
    else { result |= GREN_STEP_REST; applyThrowableGroundFriction(v, dt); }
  }
  return result;
}

function writeGrenadePreviewPoint(gp, pointCount, pos) {
  const j = pointCount * 3;
  gp.positions[j] = pos.x;
  gp.positions[j + 1] = pos.y + 0.025;
  gp.positions[j + 2] = pos.z;
}

function updateGrenadePreview() {
  if (!_grenadePreview) return;
  const gp = _grenadePreview;
  if (G.state !== 'playing' || !player.alive || player.cooking === null) {
    gp.group.visible = false;
    return;
  }
  const def = THROWABLES[player.cookKind];
  if (!def) {
    gp.group.visible = false;
    return;
  }

  setPlayerThrowableLaunch(_grenPreviewPos, _grenPreviewDir);
  _grenPreviewVel.copy(_grenPreviewDir).multiplyScalar(def.throwSpeed);
  _grenPreviewVel.y += def.throwUp;

  let remaining = Math.max(0, player.cooking);
  const maxSteps = Math.min(360, Math.max(0, Math.floor(remaining / GREN_PREVIEW_DT)));
  const sampleEvery = Math.max(1, Math.ceil(maxSteps / (GREN_PREVIEW_POINTS - 1)));
  let pointCount = 0, steps = 0, lastWrite = -1;
  const skipSteps = Math.min(maxSteps, Math.floor(GREN_PREVIEW_ARC_SKIP / GREN_PREVIEW_DT));
  if (skipSteps === 0) {
    writeGrenadePreviewPoint(gp, pointCount++, _grenPreviewPos);
    lastWrite = steps;
  }
  while (remaining > GREN_PREVIEW_DT && steps < 360) {
    remaining -= GREN_PREVIEW_DT;
    steps++;
    const st = stepThrowableMotion(_grenPreviewPos, _grenPreviewVel, GREN_PREVIEW_DT, G.colliders);
    if (steps >= skipSteps && steps % sampleEvery === 0 && pointCount < GREN_PREVIEW_POINTS) {
      writeGrenadePreviewPoint(gp, pointCount++, _grenPreviewPos);
      lastWrite = steps;
    }
    // P42: a sticky pins at first contact — the preview arc stops there.
    // P44: a planting def stops where it would come to rest.
    if (def.sticky && (st & (GREN_STEP_BOUNCED | GREN_STEP_REST))) break;
    if (def.plants && (st & GREN_STEP_REST)) break;
  }
  if (lastWrite !== steps && pointCount < GREN_PREVIEW_POINTS) {
    writeGrenadePreviewPoint(gp, pointCount++, _grenPreviewPos);
  }

  gp.dots.geometry.setDrawRange(0, pointCount);
  gp.dots.geometry.attributes.position.needsUpdate = true;
  gp.ring.position.set(_grenPreviewPos.x, _grenPreviewPos.y + 0.03, _grenPreviewPos.z);
  gp.group.visible = true;
}

function updateThrowables(dt) {
  for (let i = _throwables.length - 1; i >= 0; i--) {
    const t = _throwables[i];
    t.fuse -= dt;
    if (t.fuse <= 0) {
      G.scene.remove(t.mesh);
      _throwables.splice(i, 1);
      t.def.detonate(t);
      continue;
    }
    const p = t.pos, v = t.vel;
    // P42: a stuck semtex skips physics — pinned to a surface, or riding
    // its victim at chest height. A victim who dies mid-ride drops the
    // pin where they fell (stuckTo clears, position freezes).
    if (t.stuck) {
      if (t.stuckTo) {
        if (t.stuckTo.alive) p.set(t.stuckTo.pos.x, t.stuckTo.pos.y + 1.15, t.stuckTo.pos.z);
        else t.stuckTo = null;
      }
      t.mesh.position.copy(p);
      continue;
    }
    // P49: an armed decoy skips physics — blink the amber light and emit
    // jittered fake gunshots on a 0.7–1.2 s timer. Each emit is a muffled
    // pop + a hearShot(25) broadcast; hearShot's own team/alive/!target
    // guards make it enemy-only and never break target acquisition.
    // Timer out: despawn silently (no detonate — there's nothing to blow).
    if (t.decoyActive) {
      const bl = t.mesh.userData.blinkLight;
      if (bl) bl.visible = (G.time % 0.55) < 0.3;
      t.decoyLeft -= dt;
      if (t.decoyLeft <= 0) {
        G.scene.remove(t.mesh);
        _throwables.splice(i, 1);
        continue;
      }
      t.decoyNext -= dt;
      if (t.decoyNext <= 0) {
        t.decoyNext = 0.7 + Math.random() * 0.5;
        const owner = t.owner || player;
        AudioSys.decoyShot(
          Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z), audioPan(t.pos));
        _blastAt.copy(t.pos);
        for (const b of G.bots) b.hearShot({ pos: _blastAt, team: owner.team }, 25);
      }
      continue;
    }
    // P44: a planted claymore skips physics — blink the ready light, watch
    // the cone, and once tripped burn the short delay then fire
    if (t.planted) {
      const bl = t.mesh.userData.blinkLight;
      if (bl) bl.visible = (G.time % 1.1) < 0.65;
      if (t.tripT !== undefined) {
        t.tripT -= dt;
        if (t.tripT <= 0) {
          G.scene.remove(t.mesh);
          _throwables.splice(i, 1);
          t.def.detonate(t);
        }
        continue;
      }
      const owner = t.owner || player;
      let tripped = null;
      for (const b of G.bots) {
        if (!b.alive || b.team === owner.team) continue;
        if (claymoreSees(t, b.pos)) { tripped = b; break; }
      }
      if (!tripped && owner !== player && player.alive &&
          player.team !== owner.team && claymoreSees(t, player.pos)) tripped = player;
      if (tripped) {
        t.tripT = t.def.tripDelay;
        // the arming click — the audible tell that starts the sprint window
        AudioSys.grenadeBounce(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(p));
      }
      continue;
    }
    t.sinceBounce += dt;
    const step = stepThrowableMotion(p, v, dt, G.colliders);
    // P44: a claymore plants upright on its first floor rest, aimed along
    // the facing captured at placement
    // P49: a decoy arms on its first rest — from here it's a static
    // emitter (branch above). Short randomized lead-in before the first
    // pop so back-to-back throws don't fire in lockstep.
    if (t.def.decoy && (step & GREN_STEP_REST)) {
      t.decoyActive = true;
      t.decoyLeft = t.def.decoyDur;
      t.decoyNext = 0.35 + Math.random() * 0.4;
      v.set(0, 0, 0);
      t.mesh.position.copy(p);
      t.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
      continue;
    }
    if (t.def.plants && (step & GREN_STEP_REST)) {
      t.planted = true;
      v.set(0, 0, 0);
      t.mesh.position.copy(p);
      t.mesh.rotation.set(0, t.facingYaw, 0);
      AudioSys.grenadeBounce(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(p));
      continue;
    }
    // P42: sticky contact — the first combatant OR surface it touches
    // pins it. Combatants are checked as a cylinder around the torso;
    // the thrower can't stick themselves (launch offset starts inside
    // their own cylinder).
    if (t.def.sticky) {
      const owner = t.owner || player;
      let rider = null;
      for (const b of G.bots) {
        if (!b.alive || b === owner) continue;
        if (Math.hypot(p.x - b.pos.x, p.z - b.pos.z) < 0.5 &&
            p.y > b.pos.y - 0.1 && p.y < b.pos.y + 1.9) { rider = b; break; }
      }
      if (!rider && owner !== player && player.alive &&
          Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 0.5 &&
          p.y > player.pos.y - 0.1 && p.y < player.pos.y + 1.9) rider = player;
      if (rider || (step & (GREN_STEP_BOUNCED | GREN_STEP_REST))) {
        t.stuck = true;
        t.stuckTo = rider;
        v.set(0, 0, 0);
        // the stick thunk — reuse the bounce foley at the pin point
        AudioSys.grenadeBounce(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(p));
        t.mesh.position.copy(p);
        continue;
      }
    }
    if ((step & GREN_STEP_BOUNCED) && t.sinceBounce > 0.12 && Math.hypot(v.x, v.y, v.z) > 1.2) {
      t.sinceBounce = 0;
      AudioSys.grenadeBounce(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(p));
    }
    t.mesh.position.copy(p);
    if (!(step & GREN_STEP_REST)) {
      t.mesh.rotation.x += t.spin * dt;
      t.mesh.rotation.z += t.spin * 0.6 * dt;
    }
  }
}

// P44: directional proximity check — inside tripRange, within the frontal
// cone (dot vs tripDot = cos of the half-angle), on a similar floor level,
// with a clear line from the mine to the victim's knees-to-chest.
function claymoreSees(t, victimPos) {
  const dx = victimPos.x - t.pos.x, dz = victimPos.z - t.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > t.def.tripRange || Math.abs(victimPos.y - t.pos.y) > 2) return false;
  if (d > 0.001 && (dx * t.facingX + dz * t.facingZ) / d < t.def.tripDot) return false;
  // same ray heights as blastFactor (+0.4 sensor, +1.2 chest) so a trip
  // implies the blast's own LOS — ground clutter can't cause a dud fire
  _blastAt.set(t.pos.x, t.pos.y + 0.4, t.pos.z);
  _victimAt.set(victimPos.x, victimPos.y + 1.2, victimPos.z);
  return losClear(_blastAt, _victimAt, G.colliders);
}

function fragDangerInfo() {
  if (G.state !== 'playing' || !player.alive) return null;
  let best = null;
  for (const t of _throwables) {
    // P42: any live lethal (frag, semtex, future) trips the danger arrow.
    // P43/P44: remote charges AND proximity mines are deliberately
    // EXCLUDED — no fuse means no urgency window for the scan to key on;
    // the counterplay for a planted C4/claymore is spotting it, not an
    // arrow (the claymore's beep-then-boom is its own last warning).
    if (t.def.slot !== 'lethal' || t.def.dmg <= 0 || t.def.remote || t.def.proximity) continue;
    const owner = t.owner || player;
    if (owner === player || owner.team === player.team) continue;
    const f = blastFactor(t.def, t.pos, player.pos);
    if (f < 0) continue;
    const dist = Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
    const fuseUrgency = 1 - THREE.MathUtils.clamp(t.fuse / t.def.fuse, 0, 1);
    const risk = (1 - f) * 0.7 + fuseUrgency * 0.3;
    if (!best || risk > best.risk) best = { throwable: t, distance: dist, fuse: t.fuse, risk };
  }
  if (!best) return null;

  G.camera.getWorldDirection(_fragDangerForward);
  _fragDangerForward.y = 0;
  if (_fragDangerForward.lengthSq() < 1e-5) _fragDangerForward.set(0, 0, -1);
  else _fragDangerForward.normalize();
  _fragDangerRight.crossVectors(_fragDangerForward, _grenWorldUp).normalize();
  _fragDangerDelta.set(
    best.throwable.pos.x - player.pos.x,
    0,
    best.throwable.pos.z - player.pos.z
  );
  if (_fragDangerDelta.lengthSq() < 1e-5) _fragDangerDelta.copy(_fragDangerForward);
  else _fragDangerDelta.normalize();
  const side = _fragDangerDelta.dot(_fragDangerRight);
  const ahead = _fragDangerDelta.dot(_fragDangerForward);
  return {
    angle: Math.atan2(side, ahead),
    distance: best.distance,
    urgent: best.fuse <= 1.1,
    name: best.throwable.def.name, // P42: ui can label SEMTEX vs FRAG
  };
}

// ============================================================
// #16c: Tomahawk — a thrown, retrievable, instant-kill secondary.
// Reuses the grenade integrator's feel (gravity 13, axis sweeps) but sticks
// on first contact instead of bouncing, adds per-step segment-vs-bot hit
// detection (any hit = kill), and drops a ground pickup that the owner walks
// over to reload. `_tomahawks` = in flight, `_axePickups` = resting.
// ============================================================
const _tomahawks = [];
const _axePickups = [];
const TOMA_R = 0.09, TOMA_H = 0.1;   // sweep box half-size (thin blade)
const TOMA_SPEED = 27, TOMA_UP = 1.6; // flatter/faster than a lobbed grenade
const TOMA_PICKUP_R = 1.3;           // walk-over retrieval radius
const _axeRay = new THREE.Ray();
const _axeBox = new THREE.Box3();
const _axeHitPt = new THREE.Vector3();
const _axeStep = new THREE.Vector3();

// box-built hatchet used for both the thrown mesh and the ground pickup
function buildTomahawkMesh() {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (wd, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), mat(c));
    m.position.set(x, y, z); m.castShadow = true; g.add(m);
  };
  box(0.03, 0.03, 0.4, 0x6e5637, 0, 0, 0);        // haft along z
  box(0.026, 0.15, 0.06, 0x9aa0a6, 0, 0.04, -0.2); // head
  box(0.02, 0.17, 0.03, 0xc6ccd2, -0.01, 0.04, -0.23); // bit
  return g;
}

function throwTomahawk(w) {
  const dir = G.camera.getWorldDirection(_shotDir);
  const pos = new THREE.Vector3(player.pos.x, player.pos.y + eyeHeight() - 0.05, player.pos.z)
    .addScaledVector(dir, 0.4);
  const vel = new THREE.Vector3().copy(dir).multiplyScalar(TOMA_SPEED);
  vel.y += TOMA_UP;
  const mesh = buildTomahawkMesh();
  mesh.position.copy(pos);
  G.scene.add(mesh);
  _tomahawks.push({ mesh, pos, vel, spin: 26 });
  w.mag = 0;                 // it's out of hand now
  player.spawnProtectT = 0;  // throwing ends spawn invuln (like firing)
  player.throwT = 0.55;      // drives the viewmodel throw dip
  AudioSys.throwWhoosh();
}

// P45: box-built throwing knife for the thrown mesh + ground pickup —
// slimmer than the axe so the two pickups read differently at a glance
function buildKnifeMesh() {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (wd, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), mat(c));
    m.position.set(x, y, z); m.castShadow = true; g.add(m);
  };
  box(0.022, 0.03, 0.16, 0x3a3f35, 0, 0, 0.1);    // grip
  box(0.012, 0.05, 0.26, 0xc6ccd2, 0, 0, -0.11);  // blade
  box(0.05, 0.05, 0.02, 0x5a5f57, 0, 0, 0.015);   // guard
  return g;
}

// P45: the lethal-slot knife throw — same launch/feel as the tomahawk,
// tagged kind:'knife' so the shared engine routes the kill name, pickup
// mesh, and retrieval (equipLeft, not the tomahawk weapon slot) correctly
function throwKnife() {
  const dir = G.camera.getWorldDirection(_shotDir);
  const pos = new THREE.Vector3(player.pos.x, player.pos.y + eyeHeight() - 0.05, player.pos.z)
    .addScaledVector(dir, 0.4);
  const vel = new THREE.Vector3().copy(dir).multiplyScalar(TOMA_SPEED);
  vel.y += TOMA_UP;
  const mesh = buildKnifeMesh();
  mesh.position.copy(pos);
  G.scene.add(mesh);
  _tomahawks.push({ mesh, pos, vel, spin: 26, kind: 'knife' });
  player.spawnProtectT = 0;
  player.throwT = 0.55;
  AudioSys.throwWhoosh();
}

// a landed axe/knife: rests on the ground/wall as a walk-over pickup
function dropAxePickup(at, kind) {
  const mesh = kind === 'knife' ? buildKnifeMesh() : buildTomahawkMesh();
  mesh.position.copy(at);
  mesh.rotation.set(Math.PI * 0.5, Math.random() * Math.PI, 0); // lie flat, random spin
  G.scene.add(mesh);
  _axePickups.push({ mesh, pos: at.clone(), kind });
}

function updateTomahawks(dt) {
  for (let i = _tomahawks.length - 1; i >= 0; i--) {
    const t = _tomahawks[i], p = t.pos, v = t.vel;
    v.y -= 13 * dt; // grenade gravity
    _axeStep.copy(v).multiplyScalar(dt);
    const stepLen = _axeStep.length();

    // --- in-flight kill: sweep this frame's segment vs enemy body boxes,
    // take the nearest hit. Any contact is lethal (dmg ≫ max hp).
    if (stepLen > 1e-4) {
      _axeRay.origin.copy(p);
      _axeRay.direction.copy(_axeStep).multiplyScalar(1 / stepLen);
      let hitBot = null, hitDist = stepLen;
      for (const b of G.bots) {
        if (!b.alive || b.team === player.team || b.spawnProtectT > 0) continue;
        _axeBox.min.set(b.pos.x - 0.4, b.pos.y, b.pos.z - 0.4);
        _axeBox.max.set(b.pos.x + 0.4, b.pos.y + 1.8, b.pos.z + 0.4);
        if (_axeRay.intersectBox(_axeBox, _axeHitPt)) {
          const d = _axeHitPt.distanceTo(p);
          if (d <= hitDist) { hitDist = d; hitBot = b; }
        }
      }
      if (hitBot) {
        // instant kill; the name drives Gun Game demotion + melee XP
        hitBot.hurt(9999, player, t.kind === 'knife' ? 'THROWING KNIFE' : 'TOMAHAWK', false);
        UI.showHitmarker(true);
        AudioSys.hit(false);
        _axeRay.at(hitDist, _axeHitPt);
        _axeHitPt.y = Math.max(0, _axeHitPt.y);
        G.scene.remove(t.mesh);
        _tomahawks.splice(i, 1);
        dropAxePickup(_axeHitPt, t.kind); // drops where it struck (retrieve on foot)
        continue;
      }
    }

    // --- integrate + stick on first solid contact (axis sweeps, no bounce)
    let stuck = false;
    p.x += v.x * dt;
    for (const c of G.colliders) {
      if (c.max.y <= 0.02) continue;
      if (_boxOverlap(c, p, TOMA_R, TOMA_H)) { p.x = v.x > 0 ? c.min.x - TOMA_R - 0.001 : c.max.x + TOMA_R + 0.001; stuck = true; }
    }
    p.z += v.z * dt;
    for (const c of G.colliders) {
      if (c.max.y <= 0.02) continue;
      if (_boxOverlap(c, p, TOMA_R, TOMA_H)) { p.z = v.z > 0 ? c.min.z - TOMA_R - 0.001 : c.max.z + TOMA_R + 0.001; stuck = true; }
    }
    p.y += v.y * dt;
    for (const c of G.colliders) {
      if (c.max.y <= 0.02) continue;
      if (_boxOverlap(c, p, TOMA_R, TOMA_H)) { p.y = v.y < 0 ? c.max.y + 0.001 : c.min.y - TOMA_H - 0.001; stuck = true; }
    }
    if (p.y <= 0 && v.y <= 0) { p.y = 0; stuck = true; }
    t.mesh.position.copy(p);
    t.mesh.rotation.x += t.spin * dt; // end-over-end tumble
    if (stuck) {
      AudioSys.grenadeBounce(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(p));
      G.scene.remove(t.mesh);
      _tomahawks.splice(i, 1);
      dropAxePickup(p, t.kind);
    }
  }

  // --- retrieval: walk over a landed axe/knife. An axe refills the
  // tomahawk weapon slot; a knife (P45) refills the lethal equip count —
  // and only when the knife is the equipped lethal and not already full.
  if (player.alive) {
    const slot = player.weapons.find(wp => wp.def.throwWeapon);
    for (let i = _axePickups.length - 1; i >= 0; i--) {
      const pk = _axePickups[i];
      if (Math.abs(pk.pos.y - player.pos.y) >= 2 ||
          Math.hypot(pk.pos.x - player.pos.x, pk.pos.z - player.pos.z) >= TOMA_PICKUP_R) continue;
      if (pk.kind === 'knife') {
        if (player.equip !== 'throwingknife' ||
            player.equipLeft >= THROWABLES.throwingknife.count) continue;
        player.equipLeft++;
      } else {
        if (!slot || slot.mag >= 1) continue;
        slot.mag = 1; // back in hand
      }
      G.scene.remove(pk.mesh);
      _axePickups.splice(i, 1);
      AudioSys.reload();
      break;
    }
  }
}

// blast center is knee height (+0.4) so table/crate tops don't shadow a
// bot standing right next to them; victims checked at chest height.
// Returns dist/radius (0 = ground zero, 1 = edge), or -1 when out of
// range, more than a floor apart, or behind cover.
function blastFactor(def, at, victimPos) {
  const dist = Math.hypot(victimPos.x - at.x, victimPos.z - at.z);
  if (dist > def.radius || Math.abs(victimPos.y - at.y) > 3.5) return -1;
  _blastAt.set(at.x, at.y + 0.4, at.z);
  _victimAt.set(victimPos.x, victimPos.y + 1.2, victimPos.z);
  if (!losClear(_blastAt, _victimAt, G.colliders)) return -1; // cover protects
  return dist / def.radius;
}

function blastDamage(def, at, victimPos) {
  const f = blastFactor(def, at, victimPos);
  return f < 0 ? 0 : Math.round(THREE.MathUtils.lerp(def.dmg, def.minDmg, f));
}

// #16b: a throwable carries its `owner` (the thrower) so a bot's frag
// credits the bot and can hurt the player. Player throws leave owner unset,
// so it defaults to the player — the original behaviour.
function fragDetonate(t) {
  const def = t.def, p = t.pos;
  const owner = t.owner || player;
  // P42: a semtex riding its victim deals full damage through any cover —
  // they're wearing it. Handled up front; the area loops below skip them.
  const stuckTo = t.stuckTo || null;
  if (stuckTo === player) {
    if (player.alive) damagePlayer(def.dmg, owner === player ? null : owner, def.name, false);
  } else if (stuckTo && stuckTo.alive) {
    stuckTo.hurt(def.dmg, stuckTo === owner ? null : owner, def.name, false);
  }
  _blastAt.set(p.x, p.y + 0.4, p.z);
  fxFire(_blastAt, 0.3, 4);
  for (let i = 0; i < 4; i++) {
    _victimAt.set(p.x + (Math.random() - 0.5) * 1.6, p.y + 0.3 + Math.random() * 0.8,
      p.z + (Math.random() - 0.5) * 1.6);
    fxFire(_victimAt, 0.3 + Math.random() * 0.3, 1.2 + Math.random());
  }
  AudioSys.explosion(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(_blastAt));
  for (const b of G.bots) {
    if (!b.alive || b === stuckTo) continue; // stuck victim already paid in full
    // teammates are safe, but the frag still hurts the thrower themselves
    if (b.team === owner.team && b !== owner) continue;
    const dmg = blastDamage(def, p, b.pos);
    // a self-blast credits no one (same rule as the player's own frag)
    if (dmg > 0) b.hurt(dmg, b === owner ? null : owner, def.name, false);
  }
  // the player: their own frag hurts them uncredited; an enemy bot's frag
  // hurts and credits the bot through the normal damage path
  if (owner === player) {
    const selfDmg = blastDamage(def, p, player.pos);
    if (selfDmg > 0) damagePlayer(selfDmg, null, def.name, false);
  } else if (owner.team !== player.team && stuckTo !== player) {
    const dmg = blastDamage(def, p, player.pos);
    if (dmg > 0) damagePlayer(dmg, owner, def.name, false);
  }
  // the blast is loud — enemies within earshot investigate the spot
  _blastAt.set(p.x, p.y + 0.4, p.z); // blastDamage reuses the scratch
  for (const b of G.bots) b.hearShot({ pos: _blastAt, team: owner.team }, 30);
}

// P44: claymore blast — frag-style falloff (blastDamage handles radius,
// height and LOS) but DIRECTIONAL: only victims in front of the faceplate
// (positive dot with the stored facing) take damage; behind takes zero.
// Point-blank (< 0.4 m, e.g. standing on it) always counts as in front.
function claymoreDetonate(t) {
  const def = t.def, p = t.pos;
  const owner = t.owner || player;
  const inFront = (victimPos) => {
    const dx = victimPos.x - p.x, dz = victimPos.z - p.z;
    const d = Math.hypot(dx, dz);
    return d < 0.4 || (dx * t.facingX + dz * t.facingZ) / d > 0;
  };
  _blastAt.set(p.x, p.y + 0.2, p.z);
  fxFire(_blastAt, 0.3, 3.5);
  AudioSys.explosion(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(_blastAt));
  for (const b of G.bots) {
    if (!b.alive) continue;
    if (b.team === owner.team && b !== owner) continue; // teammates safe
    if (!inFront(b.pos)) continue;
    const dmg = blastDamage(def, p, b.pos);
    if (dmg > 0) b.hurt(dmg, b === owner ? null : owner, def.name, false);
  }
  // the owner CAN be clipped by their own mine's frontal arc (frag rule:
  // self-damage, uncredited); an enemy's mine credits its owner
  if (owner === player) {
    if (inFront(player.pos)) {
      const selfDmg = blastDamage(def, p, player.pos);
      if (selfDmg > 0) damagePlayer(selfDmg, null, def.name, false);
    }
  } else if (owner.team !== player.team && inFront(player.pos)) {
    const dmg = blastDamage(def, p, player.pos);
    if (dmg > 0) damagePlayer(dmg, owner, def.name, false);
  }
  // the blast is loud — enemies within earshot investigate the spot
  _blastAt.set(p.x, p.y + 0.2, p.z);
  for (const b of G.bots) b.hearShot({ pos: _blastAt, team: owner.team }, 30);
}

// stun (#6): no damage — anyone caught in the radius with a clear line
// to the bang is stunned. COD-style that includes teammates AND the
// thrower (only the player throws grenades, so a stunned teammate is
// always your own fault). Duration scales with proximity.
function stunDetonate(t) {
  const def = t.def, p = t.pos;
  _blastAt.set(p.x, p.y + 0.4, p.z);
  fxSpark(_blastAt, false, 4.5); // white pop, not fire
  AudioSys.stunBang(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(_blastAt));
  for (const b of G.bots) {
    if (!b.alive) continue; // teammates get stunned too
    const f = blastFactor(def, p, b.pos);
    if (f >= 0) b.stun(THREE.MathUtils.lerp(def.stunMax, def.stunMin, f));
  }
  if (player.alive) {
    const f = blastFactor(def, p, player.pos);
    if (f >= 0) stunPlayer(THREE.MathUtils.lerp(def.stunMax, def.stunMin, f));
  }
  // the bang is loud — enemies within earshot investigate the spot
  _blastAt.set(p.x, p.y + 0.4, p.z); // blastFactor reuses the scratch
  for (const b of G.bots) b.hearShot({ pos: _blastAt, team: player.team }, 30);
}

// P51: snapshot pop — pure intel, no blast, no capability effects. Every
// enemy within the def's radius (3-D distance, THROUGH WALLS — no LOS
// gate by design) is marked: b.pingedUntil feeds drawMinimap's enemy-dot
// condition, and since the map reads b.pos live the dot tracks them for
// the full window. Death clears it via spawn() (a respawned bot isn't
// the bot you scanned). The pop is the victims' only tell — a sonar
// chirp, loud enough that nearby enemies come look (hearShot like the
// other tacticals' bangs).
function snapDetonate(t) {
  const def = t.def, p = t.pos;
  const owner = t.owner || player;
  fxSpark(_blastAt.set(p.x, p.y + 0.4, p.z), false, 2.2); // small pale pop
  AudioSys.sonarPing(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(_blastAt));
  for (const b of G.bots) {
    if (!b.alive || b.team === owner.team) continue;
    if (b.pos.distanceTo(p) > def.radius) continue;
    b.pingedUntil = G.time + def.pingDur;
  }
  _blastAt.set(p.x, p.y + 0.4, p.z);
  for (const b of G.bots) b.hearShot({ pos: _blastAt, team: owner.team }, 20);
}

// white flash + heavily slowed look/move; stunMax remembers the applied
// duration so the overlay can fade as a fraction of it
function stunPlayer(dur) {
  if (dur <= player.stunT) return;
  player.stunT = dur;
  player.stunMax = dur;
}

// P48: flashbang pop — blinds instead of freezes. Same LOS'd blastFactor
// rule as the stun (COD-style: teammates and the thrower eat it too),
// with two extra gates the stun doesn't have: smoke between bang and
// victim's eyes blocks it outright (smoke counters flash), and FACING
// scales it — dot(aimDir, toBang) > 0.2 takes the full proximity-lerped
// duration, looking away halves it. Movement and look speed stay whole;
// the whole punishment is vision (blindT/flashT) + accuracy (dazeT).
const FLASH_FACING_DOT = 0.2;
function flashDetonate(t) {
  const def = t.def, p = t.pos;
  _blastAt.set(p.x, p.y + 0.4, p.z);
  fxSpark(_blastAt, false, 6.5); // hard white pop, bigger than the stun's
  AudioSys.flashPop(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(_blastAt));
  const flashDur = (f, facingDot) =>
    THREE.MathUtils.lerp(def.flashMax, def.flashMin, f) * (facingDot > FLASH_FACING_DOT ? 1 : 0.5);
  for (const b of G.bots) {
    if (!b.alive) continue; // teammates get flashed too — your own fault
    const f = blastFactor(def, p, b.pos);
    if (f < 0) continue;
    _blastAt.set(p.x, p.y + 0.4, p.z); // blastFactor reuses the scratch
    _victimAt.set(b.pos.x, b.pos.y + 1.6, b.pos.z);
    if (smokeBlocked(_victimAt, _blastAt)) continue; // pre-smoke counters it
    const dx = p.x - b.pos.x, dz = p.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    // bot forward = (sin yaw, cos yaw), same convention as spawn()'s yaw
    b.flash(flashDur(f, (Math.sin(b.yaw) * dx + Math.cos(b.yaw) * dz) / d));
  }
  if (player.alive) {
    const f = blastFactor(def, p, player.pos);
    if (f >= 0) {
      _blastAt.set(p.x, p.y + 0.4, p.z);
      _victimAt.set(player.pos.x, player.pos.y + eyeHeight(), player.pos.z);
      if (!smokeBlocked(_victimAt, _blastAt)) {
        const dir = G.camera.getWorldDirection(_shotDir);
        const dx = p.x - player.pos.x, dz = p.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
        flashPlayer(flashDur(f, (dir.x * dx + dir.z * dz) / d));
      }
    }
  }
  // the bang is loud — enemies within earshot investigate the spot
  _blastAt.set(p.x, p.y + 0.4, p.z);
  for (const b of G.bots) b.hearShot({ pos: _blastAt, team: player.team }, 30);
}

// P48: player whiteout — flashMaxT remembers the applied duration so the
// overlay (UI lane's half) can shape hold-then-fade as a fraction of it.
// Look and move speed untouched, unlike the stun. The ear-ring lives and
// dies with the same duration.
function flashPlayer(dur) {
  if (dur <= player.flashT) return;
  player.flashT = dur;
  player.flashMaxT = dur;
  AudioSys.flashRing(dur);
}

// smoke (#6): detonation spawns a lingering cloud that blocks sight lines
// both ways. Blocking is a segment-vs-sphere test (smokeBlocked) run by
// the vision checks — bot target acquisition, bot line of fire, and the
// player's crosshair name — NOT by blast damage or bot hearing: sound
// carries through smoke, and only solid cover protects from a frag.
const _smokeClouds = [];
const SMOKE_SEE_THROUGH = 2.0; // metres of smoke a sight line tolerates —
                               // point-blank inside the cloud you still see shapes

// the blocking sphere swells to full size, holds, then thins out with the
// visuals over the cloud's last moments
function smokeRadius(c) {
  const age = c.max - c.ttl;
  return c.r * Math.min(1, age / 0.7) * Math.min(1, c.ttl / 1.5);
}

// true when the a→b segment passes through more than SMOKE_SEE_THROUGH
// metres of any active cloud (chord length inside the sphere)
function smokeBlocked(a, b) {
  if (!_smokeClouds.length) return false;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.001) return false;
  for (const c of _smokeClouds) {
    const r = smokeRadius(c);
    if (r <= 0.5) continue; // still blooming / nearly gone
    const cx = c.pos.x - a.x, cy = c.pos.y - a.y, cz = c.pos.z - a.z;
    const t0 = (cx * dx + cy * dy + cz * dz) / len;
    const d2 = cx * cx + cy * cy + cz * cz - t0 * t0;
    if (d2 >= r * r) continue;
    const h = Math.sqrt(r * r - d2);
    if (Math.min(t0 + h, len) - Math.max(t0 - h, 0) > SMOKE_SEE_THROUGH) return true;
  }
  return false;
}

function updateSmokeClouds(dt) {
  for (let i = _smokeClouds.length - 1; i >= 0; i--) {
    const c = _smokeClouds[i];
    c.ttl -= dt;
    if (c.ttl <= 0) _smokeClouds.splice(i, 1);
  }
}

function smokeDetonate(t) {
  const def = t.def, p = t.pos;
  // blocking sphere centered at chest height so it covers standing sight lines
  _smokeClouds.push({ pos: new THREE.Vector3(p.x, p.y + 1.1, p.z),
    r: def.radius, ttl: def.smokeDur, max: def.smokeDur });
  // layered puffs: a dense core plus a low ring around it
  _blastAt.set(p.x, p.y + 1.0, p.z);
  fxSmoke(_blastAt, def.smokeDur, def.radius * 1.5);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const rr = def.radius * (0.35 + Math.random() * 0.45);
    _victimAt.set(p.x + Math.sin(a) * rr, p.y + 0.4 + Math.random() * 1.6,
      p.z + Math.cos(a) * rr);
    fxSmoke(_victimAt, def.smokeDur * (0.8 + Math.random() * 0.25),
      def.radius * (0.8 + Math.random() * 0.5));
  }
  AudioSys.smokePop(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(p));
  // the pop is audible — nearby enemies come look (quieter than a frag)
  _blastAt.set(p.x, p.y + 0.4, p.z);
  for (const b of G.bots) b.hearShot({ pos: _blastAt, team: player.team }, 20);
}

// selector under the minimap: what's banked, what's selected, how to
// deploy. P61: while your comms are jammed the line leads with the
// warning (drawMinimap refreshes this on jam start/end transitions).
function refreshStreakTag() {
  const parts = [];
  if (commsJammed(player)) parts.push('⚠ COMMS JAMMED');
  const b = player._bankedStreaks;
  if (b.length) {
    let txt = '▲ ' + b[player._streakSel].name + ' — [G]';
    if (b.length > 1) txt += '  ' + (player._streakSel + 1) + '/' + b.length + ' [3]';
    parts.push(txt);
  }
  UI.setStreakTag(parts.length ? parts.join('   ') : null);
}

function earnKillstreak(ks) {
  player._bankedStreaks.push(ks);
  player._streakSel = player._bankedStreaks.length - 1; // select the newest
  UI.showStreakBanner(ks.name + ' READY — PRESS [G]');
  AudioSys.streakReady();
  refreshStreakTag();
}

function cycleKillstreak() {
  if (player._bankedStreaks.length < 2) return;
  player._streakSel = (player._streakSel + 1) % player._bankedStreaks.length;
  refreshStreakTag();
}

function deployKillstreak() {
  const b = player._bankedStreaks;
  if (!b.length) return;
  const ks = b.splice(player._streakSel, 1)[0];
  if (player._streakSel >= b.length) player._streakSel = 0;
  ks.deploy();
  UI.showStreakBanner(ks.name + ' ONLINE');
  refreshStreakTag();
}

// #16d: log an enemy hit on the victim (assist source). Only enemy damage
// is recorded — friendly fire and self-damage never earn an assist. One
// entry per attacker, its time refreshed on each new hit.
const ASSIST_WINDOW = 5; // seconds of "current engagement" (~the regen delay)
function recordDamage(victim, attacker) {
  if (!attacker || attacker === victim || attacker.team === victim.team) return;
  if (!victim.recentDamagers) victim.recentDamagers = [];
  const e = victim.recentDamagers.find(d => d.attacker === attacker);
  if (e) e.t = G.time;
  else victim.recentDamagers.push({ attacker, t: G.time });
}

function registerKill(killer, victim, weaponName, headshot) {
  if (killer && killer.team !== victim.team) {
    // #16d: everyone who damaged the victim this engagement (within the
    // window) other than the killer gets an assist; the player gets a ping
    if (victim.recentDamagers) {
      for (const d of victim.recentDamagers) {
        if (d.attacker === killer || G.time - d.t > ASSIST_WINDOW) continue;
        d.attacker.assists = (d.attacker.assists || 0) + 1;
        if (d.attacker.isPlayer) {
          UI.showKillMsg('+ASSIST', false);
          Profile.onAssist();        // P5: immediate lifetime stat
          Profile.MatchXP.onAssist(); // P4: +25 match XP
        }
      }
      victim.recentDamagers.length = 0; // engagement's over
    }
    addModeKillScore(killer, victim, weaponName);
    UI.killfeed(killer.name, killer.team, victim.name, victim.team, weaponName, headshot);
    if (killer.isPlayer) {
      AudioSys.hit(true);
      // P4/P5: XP + lifetime stats by kill source. Nuke kills award nothing
      // (the +1000 nuke bonus lands at deployNuke); napalm is a killstreak
      // kill (never a direct kill); melee/headshot bonuses stack on direct.
      if (weaponName === 'TACTICAL NUKE') {
        // no XP, no kill stats — by design
      } else if (weaponName === 'NAPALM') {
        Profile.onKillstreakKill();
        Profile.MatchXP.onKillstreakKill();
      } else {
        Profile.onKill();
        Profile.MatchXP.onDirectKill();
        if (headshot) { Profile.onHeadshot(); Profile.MatchXP.onHeadshot(); }
        if (weaponName === 'KNIFE' || weaponName === 'TOMAHAWK' || weaponName === 'THROWING KNIFE') {
          Profile.onMeleeKill();  // P45: knife kills count as melee bonus
          Profile.MatchXP.onMeleeKill();
        }
      }
      // kill streak tracking (resets if more than 4 s between kills)
      const STREAK_WINDOW = 4.0;
      if (G.time - killer._lastKillTime <= STREAK_WINDOW) {
        killer._killStreakCount++;
      } else {
        killer._killStreakCount = 1;
      }
      killer._lastKillTime = G.time;
      const streakLabels = [null, null, 'DOUBLE KILL!', 'TRIPLE KILL!', 'MULTI KILL!', 'RAMPAGE!', 'UNSTOPPABLE!'];
      const streakMsg = streakLabels[Math.min(killer._killStreakCount, streakLabels.length - 1)];
      const hsTag = headshot ? 'HEADSHOT! ' : '';
      // killstreak rewards: kills-since-death (not the 4 s multi-kill
      // window above) hitting a threshold banks that reward for manual
      // deploy — announced on its own banner, not in the kill message.
      // P60, per the locked rules: (1) killstreak kills (NAPALM today,
      // AIRSTRIKE tomorrow — STREAK_WEAPON_NAMES) never feed progress,
      // so a 10-streak napalm can't march its owner toward the nuke;
      // (2) the trigger is >= with a per-life awarded set (hardline can
      // drop two streaks onto the same effective number, and === would
      // skip one); (3) a streak already sitting in the bank re-earns
      // NOTHING — no duplicate copy, no substitute reward — but the
      // award still burns for this life (no re-earn after deploying it).
      if (!STREAK_WEAPON_NAMES.has(weaponName)) {
        killer._streakKills++;
        for (const id of killer.equippedStreakIds || []) {
          const ks = KILLSTREAKS[id];
          if (killer._streakAwarded.has(id) || killer._streakKills < effKills(ks)) continue;
          killer._streakAwarded.add(id);
          if (!killer._bankedStreaks.some(b => b.id === id)) earnKillstreak(ks);
        }
      }
      if (streakMsg) {
        UI.showKillMsg(hsTag + streakMsg, true);
      } else {
        UI.showKillMsg(hsTag + 'YOU KILLED ' + victim.name, false);
      }
    }
  }
  UI.updateScores(G.mode, G.scores, G.timeLeft, G.combatants);
  // (endMatch is a no-op during the nuke cinematic, so the killstreak
  // nuke's mass kill can't trip the score limit mid-scene)
  if (modeScoreLimitReached()) endMatch();
}

function startMatch(mapId, modeId = 'tdm') {
  Profile.onMatchStart(); // P5: matchesPlayed++ and resets MatchXP/MatchStats
  G.mapId = mapId;
  G.modeId = modeById(modeId).id;
  G.mode = modeById(G.modeId);
  G.colliders = [];
  G.scene = new THREE.Scene();
  G.scene.add(G.camera);

  G.map = MAPS[mapId](G.scene, G.colliders);
  const sun = new THREE.DirectionalLight(G.map.sun.color, G.map.sun.intensity);
  sun.position.set(...G.map.sun.pos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = Math.max(G.map.bounds.x, G.map.bounds.z) + 8;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.far = 150;
  G.scene.add(sun);
  G.scene.add(new THREE.HemisphereLight(G.map.hemi.sky, G.map.hemi.ground, G.map.hemi.intensity));

  G.graph = buildNavGraph(G.map.waypointSeeds, G.colliders);
  initFxPools(G.scene);
  initGrenadePreview(G.scene);
  buildMinimapBg();

  // combatants
  G.scores = makeModeScores(G.mode);
  G.timeLeft = UI.settings.timeLimit > 0 ? UI.settings.timeLimit : Infinity;
  G.time = 0;
  player.kills = 0; player.deaths = 0; player.assists = 0;
  player.recentDamagers.length = 0; // #16d
  player._streakKills = 0;
  player._streakAwarded.clear(); // P60: awarded set resets with progress
  player._bankedStreaks = []; player._streakSel = 0; // locked: the bank dies at match start ONLY
  refreshStreakTag();
  G.uavUntil = 0; // G.time restarts at 0, so a stale value would be a free UAV
  G.jamUntil = 0; G.jamTeam = null; G.jamFrom = null; // P61: same rationale — no jam carries across matches
  AudioSys.stopJammer(); // ...and the drone dies with it
  _napalmDrops.length = 0; // no strikes carry across a rematch
  _throwables.length = 0;  // in-flight grenades die with the old scene
  _tomahawks.length = 0;   // #16c: flying axes + ground pickups die with it too
  _axePickups.length = 0;
  _smokeClouds.length = 0; // active smoke too (sprites rebuild with the pools)
  player.stunT = 0;        // a rematch shakes the stars off
  UI.stunOverlay(0);
  player.flashT = 0;       // P48: and blinks the whiteout off
  UI.updateFlash && UI.updateFlash(0, 1);
  _nukeT = -1;             // nor an in-flight nuke countdown
  _cine = null;            // cinematic props die with the old scene
  UI.setNukeCountdown(null);
  UI.clearNukeFlash();
  player.alive = false;
  G.bots = [];
  player.team = G.mode.structure === 'ffa' ? 'ffa0' : G.mode.teams[0] || 'tf';

  const world = {
    scene: G.scene, colliders: G.colliders, graph: G.graph,
    api: {
      difficulty: UI.settings.difficulty,
      pickSpawn, getEnemies, registerKill, noteShot, audioPan, smokeBlocked,
      commsJammed, // P61: hearShot's jam gate
      tracer: fxTracer,
      throwGrenade: spawnBotThrowable, // #16b: bot lobs a frag
      recordDamage,                    // #16d: log a damager for assists

      playerPos: () => player.pos,
      playerTeam: player.team,
      playerDamage: damagePlayer,
      matchLive: () => G.state === 'playing' || G.state === 'dead',
      canRespawn: () => !!(G.mode || MODES.tdm).respawn,
      prepareBotSpawn: bot => { if (isGunGameMode()) setBotGunGameWeapon(bot); },
    },
  };
  const n = UI.settings.teamSize;
  if (G.mode.structure === 'ffa') {
    const names = shuffledFfaNames();
    const count = Math.max(1, n * 2 - 1);
    for (let i = 0; i < count; i++) G.bots.push(new Bot(names[i % names.length], 'ffa' + (i + 1), world));
  } else {
    for (const team of G.mode.teams) {
      const names = shuffledBotNames(team);
      const count = team === player.team ? n - 1 : n;
      for (let i = 0; i < count; i++) G.bots.push(new Bot(names[i % names.length], team, world));
    }
  }
  G.combatants = [player, ...G.bots];
  if (isGunGameMode()) {
    for (const c of G.combatants) prepareGunGameCombatant(c);
  }
  syncFfaScores();

  UI.updateModeLabels(G.mode, UI.settings.scoreLimit);
  UI.updateScores(G.mode, G.scores, G.timeLeft, G.combatants);
  document.getElementById('killfeed').innerHTML = '';

  G.state = 'spawn';
  player.respawnT = 0;
  UI.renderSpawnScreen();
  UI.setRespawnCountdown(0);
  UI.show('spawnScreen');
}

function deploy() {
  if (player.respawnT > 0) return;
  const cls = UI.classes[UI.selectedClass];
  player.perks = new Set(cls.perks);
  // P60: the streak loadout is computed AT SPAWN and nowhere else (P71's
  // "selection applies on respawn only" falls out of that). Until P67
  // stores streak ids on the class, everyone runs every selectable streak
  // (today that's the uav+napalm starter pair — behavior unchanged);
  // special streaks (nuke) ALWAYS arm, appended after — never a slot.
  player.equippedStreakIds = KILLSTREAK_ORDER.filter(id => KILLSTREAKS[id].selectable);
  for (const id of KILLSTREAK_ORDER) if (KILLSTREAKS[id].special) player.equippedStreakIds.push(id);
  const mkState = slot => {
    // resolved def (base + attachment mods) — every curW().def consumer
    // (fire path, startReload, HUD, viewmodel) reads modified stats from here
    const w = resolveWeaponDef(cls[slot], cls.attachments && cls.attachments[slot],
      cls.attachments && cls.attachments[slot + 'DotColor'],
      cls.attachments && cls.attachments[slot + 'LaserColor']);
    // SCAVENGER no longer doubles reserve here (#6) — it resupplies off
    // corpses in updateScavenger(); everyone spawns with normal reserve
    return { def: w, mag: w.mag, reserve: w.reserve };
  };
  if (isGunGameMode()) {
    setPlayerGunGameWeapon();
  } else {
    player.weapons = [mkState('primary'), mkState('secondary')];
    player.cur = 0;
  }
  player.reloadT = 0; player.switchT = 0; player.burstQueue = 0; player.meleeT = 0;
  // #16a: equipment is a per-class pick now — an unequipped slot ('none') is
  // null with a 0 count, so its key no-ops and its HUD counter hides
  player.equip = (!isGunGameMode() && cls.lethal && cls.lethal !== 'none') ? cls.lethal : null;
  player.equipTac = (!isGunGameMode() && cls.tactical && cls.tactical !== 'none') ? cls.tactical : null;
  player.equipLeft = player.equip ? THROWABLES[player.equip].count : 0;
  player.equipTacLeft = player.equipTac ? THROWABLES[player.equipTac].count : 0;
  player.throwT = 0; player.cooking = null; player.cookKind = null; player.cookSlot = null;
  player.stunT = 0;
  player.flashT = 0; // P48: death blinks the whiteout off
  player.recentDamagers.length = 0; // #16d: fresh life, no carried-over damagers
  player.adsAmt = 0; player.adsToggle = false; player.bloom = 0;
  player.hp = 100;
  player.spawnProtectT = 3; // #18a: 3 s of spawn invuln, cancelled by firing/throwing
  player.stamina = 1;
  player.winded = false;
  player.sinceDamage = 99;
  player.vault = null;
  player.forceCrouch = false;
  player.crouched = false;
  player.crouchAmt = 0;
  player.prone = false;
  player.proneAmt = 0;
  player.pos.copy(pickSpawn(player.team));
  player.vel.set(0, 0, 0);
  player.yaw = G.mode && G.mode.structure === 'ffa'
    ? Math.random() * Math.PI * 2
    : player.team === 'tf' ? (G.mapId === 'rust' ? Math.PI * 1.25 : Math.PI) : 0;
  player.pitch = 0;
  player.alive = true;
  buildViewModel(curW().def);
  G.state = 'playing';
  UI.show('hud');
  lockPointer();
}

function curW() { return player.weapons[player.cur]; }

function damagePlayer(dmg, attacker, weaponName, headshot, bypassProtect) {
  if (!player.alive || G.state !== 'playing') return;
  if (player.spawnProtectT > 0 && !bypassProtect) return; // #18a spawn invuln
  player.hp -= dmg;
  player.sinceDamage = 0;
  recordDamage(player, attacker); // #16d
  AudioSys.hurt();
  if (attacker) {
    const worldAng = Math.atan2(attacker.pos.x - player.pos.x, attacker.pos.z - player.pos.z);
    let rel = worldAng - (player.yaw + Math.PI);
    UI.damageDirection(-rel);
  }
  if (player.hp <= 0) {
    player.hp = 0;
    player.alive = false;
    player.deaths++;
    if (player.cooking !== null) { // dying mid-cook drops the live grenade
      const cdef = THROWABLES[player.cookKind];
      const fuse = player.cooking;
      player.cooking = null;
      spawnThrowable(cdef, fuse, 1.2, 1.2);
    }
    // P43: a dead owner's remote charges despawn — no orphaned C4. This
    // also swallows a mid-cook C4 the drop above just spawned (a fuseless
    // charge with no living trigger hand is a dud, not a hazard).
    for (let i = _throwables.length - 1; i >= 0; i--) {
      const t = _throwables[i];
      if (t.def.remote && (t.owner || player) === player) {
        G.scene.remove(t.mesh);
        _throwables.splice(i, 1);
      }
    }
    player._killStreakCount = 0; // reset streak on death
    player._streakKills = 0;     // streak progress resets; banked rewards survive death
    player._streakAwarded.clear(); // P60: a fresh life can earn everything again
    Profile.onDeath();           // P5: immediate lifetime stat
    if (attacker) attacker.kills++;
    registerKill(attacker, player, weaponName, headshot);
    // that kill may have ended the match (or started the Nuketown
    // end-of-match nuke) — don't clobber the state with 'dead'
    if (G.state === 'end' || G.state === 'nukecine') return;
    G.state = 'dead';
    player.respawnT = (G.mode || MODES.tdm).respawn ? 3.5 : Infinity;
    document.exitPointerLock && document.exitPointerLock();
    UI.renderSpawnScreen(`KILLED BY ${attacker ? attacker.name : '?'}  [${weaponName}]`);
    UI.show('spawnScreen');
  }
}

// forcedWin (optional): true/false forces the result regardless of score —
// the tactical nuke ends the match as a win for its owner's team.
// On Nuketown every match ends with the test-site nuke going off: the
// result is computed here, then the cinematic plays (cosmetic — no stat
// changes) and hands the held result to finishMatch. A no-op while the
// cinematic is already running (the killstreak nuke's mass kill would
// otherwise trip the score limit mid-scene).
function endMatch(forcedWin) {
  if (G.state === 'end' || G.state === 'nukecine') return;
  const win = modeWinResult(forcedWin);
  if (G.mapId === 'nuketown') { startNukeCinematic(win); return; }
  finishMatch(win);
}

// the actual match end: state flip + end screen (win: true/false/null)
function finishMatch(win) {
  if (G.state === 'end') return;
  G.state = 'end';
  // P6: commit match XP to the profile exactly once per real match end.
  // win: true/false/null (draw). Result object held for the P7 end screen.
  G.lastCommit = Profile.commitMatch(win === true ? 'win' : win === false ? 'loss' : 'draw');
  document.exitPointerLock && document.exitPointerLock();
  AudioSys.matchEnd(win !== false);
  UI.showEnd(G.mode, win, G.scores, G.combatants, G.lastCommit);
}

function quitMatch() {
  // P5/P10: only a live match counts as a quit — this same button is the
  // end screen's "menu", where the match already committed via finishMatch.
  if (G.state === 'playing' || G.state === 'dead') Profile.onQuit();
  G.state = 'menu';
  document.exitPointerLock && document.exitPointerLock();
  UI.show('menu');
}

function rematch() { startMatch(G.mapId, G.modeId); }

// ============================================================
// Input
// ============================================================
function lockPointer() {
  try { canvas.requestPointerLock(); } catch (e) {}
}

document.addEventListener('pointerlockchange', () => {
  G.pointerLocked = document.pointerLockElement === canvas;
  if (!G.pointerLocked && G.state === 'playing') {
    G.state = 'paused';
    UI.show('pauseScreen');
  }
});

canvas.addEventListener('click', () => {
  if (G.state === 'playing' && !G.pointerLocked) lockPointer();
});

document.addEventListener('mousemove', e => {
  if (!G.pointerLocked || (G.state !== 'playing')) return;
  const fovScale = G.camera.fov / UI.settings.fov;
  let s = 0.0021 * UI.settings.sens * fovScale;
  if (player.stunT > 0) s *= 0.15; // stunned: look speed heavily slowed
  player.yaw -= e.movementX * s;
  player.pitch -= e.movementY * s;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.53, 1.53);
});

document.addEventListener('mousedown', e => {
  AudioSys.ensure();
  if (G.state !== 'playing' || !G.pointerLocked) return;
  if (e.button === 0) { firing = true; triggerEdge = true; }
  if (e.button === 2) player.adsHeld = true;
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) firing = false;
  if (e.button === 2) player.adsHeld = false;
});
document.addEventListener('contextmenu', e => e.preventDefault());

// #18e: mouse-wheel variable zoom while scoped on a high-zoom optic. Wheel up
// zooms in, down zooms out, clamped 3×–8×. No-ops (but still eats the scroll)
// unscoped or on a non-sniper — we deliberately don't bind wheel to weapon
// switch. zoomLevel resets to the def's base each time you leave ADS (see
// updatePlayer), so every scope-in starts at the weapon's default zoom.
document.addEventListener('wheel', e => {
  if (!G.pointerLocked || G.state !== 'playing') return;
  e.preventDefault();
  const def = curW().def;
  if (def.zoom <= 3 || player.adsAmt < 0.5) return; // only while actually scoped
  const step = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  player.zoomLevel = THREE.MathUtils.clamp(player.zoomLevel + step, ZOOM_MIN, ZOOM_MAX);
}, { passive: false });

document.addEventListener('keydown', e => {
  if (e.code === 'Tab' && (G.state === 'playing' || G.state === 'dead')) {
    e.preventDefault();
    if (e.repeat) return;
    UI.buildScoreboard(G.mode, G.combatants, G.scores);
    UI.$('scoreboard').classList.remove('hidden');
  }
  if (e.repeat) return;
  keys[e.code] = true;
  if (G.state !== 'playing') return;
  if (UI.actionMatches('reload', e.code)) startReload();
  if (UI.actionMatches('crouch', e.code)) toggleCrouch();
  if (UI.actionMatches('prone', e.code)) toggleProne();
  if (UI.actionMatches('swapWeapon', e.code)) switchWeapon(player.cur === 0 ? 1 : 0);
  if (UI.actionMatches('primaryWeapon', e.code)) switchWeapon(0);
  if (UI.actionMatches('secondaryWeapon', e.code)) switchWeapon(1);
  if (UI.actionMatches('melee', e.code)) tryMelee();
  if (UI.actionMatches('lethal', e.code)) {
    // P43: a placed C4 fires on the same key; otherwise pin out as usual
    if (!detonateRemoteCharges()) startCooking('lethal');
  }
  if (UI.actionMatches('tactical', e.code)) startCooking('tactical'); // tactical (stun/smoke), same mechanics
  if (UI.actionMatches('adsToggle', e.code)) player.adsToggle = !player.adsToggle;
  if (UI.actionMatches('deployStreak', e.code)) deployKillstreak();
  if (UI.actionMatches('cycleStreak', e.code)) cycleKillstreak();
});
document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Tab') UI.$('scoreboard').classList.add('hidden');
  if (UI.actionMatches('lethal', e.code)) releaseThrow('lethal');
  if (UI.actionMatches('tactical', e.code)) releaseThrow('tactical');
});
// Losing window focus never fires keyup/mouseup, so held inputs would stick
// (e.g. alt-tab while holding W = infinite auto-run). Clear everything on blur.
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  firing = false;
  releaseThrow(); // focus loss eats the keyup — a cooking grenade leaves now
  player.adsHeld = false;
  UI.$('scoreboard').classList.add('hidden');
});

function toggleCrouch() {
  // from prone, C rises one stance to crouch (needs crouch-height headroom)
  if (player.prone) {
    if (!_fitsAt(player.pos, player.pos.y, 0.38, 1.25, G.colliders)) return;
    player.prone = false;
    player.crouched = true;
    return;
  }
  if (player.crouched) {
    // need headroom to stand
    if (!_fitsAt(player.pos, player.pos.y, 0.38, 1.75, G.colliders)) return;
  }
  player.crouched = !player.crouched;
}

function toggleProne() {
  if (player.prone) {
    // stand straight up from prone — needs full standing headroom
    if (!_fitsAt(player.pos, player.pos.y, 0.38, 1.75, G.colliders)) return;
    player.prone = false;
  } else {
    // drop to the deck; prone supersedes crouch and always fits (lowest profile)
    player.prone = true;
    player.crouched = false;
  }
}

function switchWeapon(idx) {
  if (isGunGameMode() || idx < 0 || idx >= player.weapons.length) return;
  if (idx === player.cur || player.switchT > 0) return;
  player.cur = idx;
  player.switchT = 0.4;
  player.reloadT = 0;
  player.burstQueue = 0;
  player.adsToggle = false;
  buildViewModel(curW().def);
}

function startReload() {
  const w = curW();
  if (player.reloadT > 0 || player.switchT > 0) return;
  if (w.mag >= w.def.mag || w.reserve <= 0) return;
  player.reloadT = w.def.reload * (player.perks.has('soh') ? 0.5 : 1);
  player.burstQueue = 0;
  AudioSys.reload();
}

function tryMelee() {
  if (player.meleeT > 0) return;
  player.meleeT = 0.6;
  const range = player.perks.has('commando') ? 3.2 : 1.9;
  const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  for (const b of G.bots) {
    if (!b.alive || b.team === player.team) continue;
    if (Math.abs(b.pos.y - player.pos.y) > 1.8) continue; // no knifing through floors
    const to = b.pos.clone().sub(player.pos); to.y = 0;
    const d = to.length();
    if (d > range) continue;
    to.normalize();
    if (to.dot(fwd) < 0.5) continue;
    b.hurt(135, player, 'KNIFE', false);
    UI.showHitmarker(true);
    AudioSys.hit(false);
    break;
  }
}

// ============================================================
// Player update
// ============================================================
// eye glides standing → crouch, then further down to a prone deck line (~0.35 m).
// The two amounts are mutually exclusive targets (going prone drives crouchAmt→0),
// so the nested lerp reads cleanly through the crouch↔prone transition.
function eyeHeight() {
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.62, 1.12, player.crouchAmt), 0.35, player.proneAmt);
}

// ---- window vaulting: airborne movement into a window opening gets
// carried through with a short assisted mantle instead of a wall hit.
// vx/vz are the current input velocities in world units/s.
function tryStartVault(vx, vz) {
  const wins = G.map && G.map.windows;
  if (!wins || !wins.length) return;
  const p = player.pos;
  for (const wz of wins) {
    const alongX = wz.axis === 'x'; // wall spans x, crossing moves along z
    const span = alongX ? p.x : p.z;
    const perp = alongX ? p.z : p.x;
    const vperp = alongX ? vz : vx;
    if (span < wz.a + 0.35 || span > wz.b - 0.35) continue;
    if (Math.abs(perp - wz.at) > 0.85) continue;
    if (p.y < wz.sill - 0.95 || p.y > wz.sill + 0.6) continue;
    const side = perp > wz.at ? 1 : -1;
    if (vperp * -side < 1.0) continue;  // must be moving into the opening
    // steer the crossing onto a lane clear of the frame, exit past the wall
    const lane = THREE.MathUtils.clamp(span, wz.a + 0.45, wz.b - 0.45);
    const exit = wz.at - side * 0.8;
    player.vault = {
      t: 0, dur: 0.42,
      sx: p.x, sy: p.y, sz: p.z,
      ex: alongX ? lane : exit,
      ey: wz.sill + 0.12,
      ez: alongX ? exit : lane,
    };
    player.vel.y = 0;
    player.onGround = false;
    return;
  }
}

function updateVault(dt) {
  const v = player.vault;
  v.t += dt;
  const u = Math.min(1, v.t / v.dur);
  const e = u * u * (3 - 2 * u);
  player.pos.x = THREE.MathUtils.lerp(v.sx, v.ex, e);
  player.pos.z = THREE.MathUtils.lerp(v.sz, v.ez, e);
  // feet clear the sill early in the crossing, then hold
  const uy = Math.min(1, u / 0.6);
  player.pos.y = THREE.MathUtils.lerp(v.sy, v.ey, uy * uy * (3 - 2 * uy));
  if (u >= 1) {
    player.vault = null;
    player.forceCrouch = true; // stay low until there's headroom to stand
    player.vel.y = 0;
  }
}

// SCAVENGER (#6): while alive with the perk, passing within ~1.2 m of any
// corpse (enemy or teammate) that hasn't been looted yet tops up reserve ammo
// on both guns — capped at each def's max reserve. Each body resupplies once
// (`_looted`, cleared on respawn). The tomahawk slot refills off its own
// ground pickup, so it's skipped here.
const SCAV_R = 1.2;
function updateScavenger() {
  if (!player.alive || !player.perks.has('scavenger')) return;
  for (const b of G.bots) {
    if (b.alive || b._looted) continue;
    if (Math.abs(b.pos.y - player.pos.y) > 2) continue; // don't loot through floors
    if (Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z) > SCAV_R) continue;
    b._looted = true;
    let gained = false;
    for (const wp of player.weapons) {
      if (wp.def.throwWeapon) continue;
      const max = wp.def.reserve;
      if (wp.reserve >= max) continue;
      wp.reserve = Math.min(max, wp.reserve + Math.ceil(wp.def.mag * 1.5)); // ~1.5 mags
      gained = true;
    }
    if (gained) { UI.showKillMsg('+AMMO', false); AudioSys.reload(); }
  }
}

function updatePlayer(dt) {
  const w = curW();
  const def = w.def;

  // ---- spawn invulnerability (#18a): count down the 3 s window
  if (player.spawnProtectT > 0) player.spawnProtectT -= dt;

  // ---- crouch smoothing (vaulting forces a low profile; after a vault
  // the player stays low until there is headroom to stand)
  if (player.forceCrouch && _fitsAt(player.pos, player.pos.y, 0.38, 1.75, G.colliders))
    player.forceCrouch = false;
  const lowWant = (player.crouched || player.vault || player.forceCrouch) ? 1 : 0;
  player.crouchAmt += (lowWant - player.crouchAmt) * Math.min(1, dt * (player.vault ? 14 : 10));
  // prone is a third stance below crouch; slightly slower to drop/rise than crouch
  const proneWant = player.prone ? 1 : 0;
  player.proneAmt += (proneWant - player.proneAmt) * Math.min(1, dt * 8);

  // ---- sprint & stamina (sprinting breaks an ADS toggle)
  // hysteresis: exhaustion locks sprint until stamina recovers past 0.25,
  // otherwise the drain/regen pair re-arms the gate every frame and sprint
  // flickers on/off forever at stamina 0
  if (player.stamina <= 0) player.winded = true;
  else if (player.stamina >= 0.25) player.winded = false;
  const wantSprint = UI.actionDown('sprint', keys) && UI.actionDown('moveForward', keys) &&
    !player.adsHeld && !firing && !player.crouched && !player.prone;
  // #18d: sprint can only start/stop on the ground — the state is then frozen
  // through the jump so a sprint-jump stays fast and a walk-jump can't flip
  // into a sprint mid-air (the ×1.42 speed only bakes in at takeoff)
  if (player.onGround) {
    if (wantSprint && (!player.winded || player.perks.has('marathon'))) {
      player.sprinting = true;
      player.adsToggle = false;
      if (!player.perks.has('marathon')) player.stamina = Math.max(0, player.stamina - dt / 4.5);
    } else {
      player.sprinting = false;
      player.stamina = Math.min(1, player.stamina + dt / 3);
    }
  } else {
    // airborne: sprint frozen at its takeoff value; stamina trickles back
    player.stamina = Math.min(1, player.stamina + dt / 3);
  }

  // ---- ADS amount (hold RMB or toggle with X). Reloading lowers the gun
  // out of ADS (COD-style) so the #10b reload roll never fights the sight
  // line; a held RMB re-aims the moment reloadT runs out.
  const adsActive = player.adsHeld || player.adsToggle;
  const adsTarget = (adsActive && !player.sprinting && player.switchT <= 0 && player.reloadT <= 0) ? 1 : 0;
  const rate = dt / def.adsTime;
  player.adsAmt += THREE.MathUtils.clamp(adsTarget - player.adsAmt, -rate, rate);
  const fovBase = UI.settings.fov;
  // #18e: high-zoom optics use the wheel-adjusted zoomLevel; it resets to the
  // def's base whenever you're out of ADS so each scope-in starts at default.
  // Everything else (non-snipers) just uses def.zoom directly.
  if (def.zoom > 3) { if (player.adsAmt < 0.05) player.zoomLevel = def.zoom; }
  const effZoom = def.zoom > 3 ? player.zoomLevel : def.zoom;
  G.camera.fov = THREE.MathUtils.lerp(fovBase, fovBase / effZoom, player.adsAmt);
  G.camera.updateProjectionMatrix();

  // ---- movement
  let ix = 0, iz = 0;
  if (UI.actionDown('moveForward', keys)) iz -= 1;
  if (UI.actionDown('moveBack', keys)) iz += 1;
  if (UI.actionDown('moveLeft', keys)) ix -= 1;
  if (UI.actionDown('moveRight', keys)) ix += 1;
  const ilen = Math.hypot(ix, iz);
  let speed = 5.2 * def.speed;
  if (player.perks.has('lightweight')) speed *= 1.08;
  if (player.sprinting) speed *= 1.42;
  if (player.proneAmt > 0.5) speed *= 0.35;
  else if (player.crouchAmt > 0.5) speed *= 0.55;
  else if (player.adsAmt > 0.5) speed *= 0.6;
  if (player.stunT > 0) speed *= 0.4; // stunned: legs barely answer

  // rotate input (x = right, z = back) into world space:
  // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
  let vx = 0, vz = 0;
  if (ilen > 0) {
    const nx = ix / ilen, nz = iz / ilen;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    vx = (rx * nx - fx * nz) * speed;
    vz = (rz * nx - fz * nz) * speed;
  }
  player.speedNow = Math.hypot(vx, vz);

  if (player.vault) {
    // assisted mantle through a window: scripted arc, no wall collision
    updateVault(dt);
  } else {
    // gravity & jump
    player.vel.y -= 13 * dt;
    if (UI.actionDown('jump', keys) && player.onGround && !player.prone) {
      player.vel.y = 5.5;
      player.onGround = false;
    }
    // #18d: horizontal velocity actually applied this frame. On the ground the
    // keys drive it directly (full authority) and we keep a takeoff snapshot
    // fresh every grounded frame — so the moment you leave the ground (jump OR
    // walk off a ledge) that momentum is preserved. Airborne, it carries: zero
    // input coasts (no mid-air stop), input only *steers* the arc at low
    // authority and can never push speed past the takeoff cap.
    let mvx, mvz;
    if (player.onGround) {
      mvx = vx; mvz = vz;
      player.airVX = vx; player.airVZ = vz; player.airSpeedCap = Math.hypot(vx, vz);
    } else {
      if (ilen > 0) {
        const k = Math.min(1, 2.0 * dt); // ~air-steer authority toward the wanted dir
        player.airVX += (vx - player.airVX) * k;
        player.airVZ += (vz - player.airVZ) * k;
        const m = Math.hypot(player.airVX, player.airVZ);
        if (m > player.airSpeedCap) {
          player.airVX = player.airVX / m * player.airSpeedCap;
          player.airVZ = player.airVZ / m * player.airSpeedCap;
        }
      }
      mvx = player.airVX; mvz = player.airVZ;
    }
    player.speedNow = Math.hypot(mvx, mvz);
    const height = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.75, 1.25, player.crouchAmt), 0.6, player.proneAmt);
    // step assist: on the ground it climbs low ledges; mid-jump it vaults crate tops
    const stepUp = player.onGround ? 0.55 : (player.vel.y > -3 ? 0.6 : 0);
    player.onGround = moveEntity(player.pos, 0.38, height, mvx * dt, player.vel.y * dt, mvz * dt, G.colliders, stepUp);
    if (player.onGround && player.vel.y < 0) player.vel.y = 0;
    // airborne movement into a window opening starts an assisted vault
    if (!player.onGround) tryStartVault(mvx, mvz);
  }

  // ---- footstep audio
  if (player.onGround && player.speedNow > 0.5 && !player.vault) {
    const stepInterval = player.sprinting ? 0.33 : 0.50;
    player._stepT -= dt;
    if (player._stepT <= 0) {
      player._stepT = stepInterval;
      // Ninja: silent footsteps
      if (!player.perks.has('ninja')) AudioSys.footstep(player.sprinting);
    }
  } else if (!player.onGround) {
    player._stepT = 0; // reset so first step after landing plays immediately
  }

  // ---- health regen
  player.sinceDamage += dt;
  if (player.sinceDamage > 4 && player.hp < 100 && player.hp > 0) {
    player.hp = Math.min(100, player.hp + 42 * dt);
    // healed to full: the engagement's over, so those hits can't assist (#16d)
    if (player.hp >= 100) player.recentDamagers.length = 0;
  }

  // ---- timers
  if (player.switchT > 0) player.switchT -= dt;
  if (player.meleeT > 0) player.meleeT -= dt;
  if (player.throwT > 0) player.throwT -= dt;
  if (player.stunT > 0) player.stunT -= dt;
  if (player.flashT > 0) player.flashT -= dt; // P48
  if (player.cooking !== null && !THROWABLES[player.cookKind].noCookOff) {
    player.cooking -= dt;
    if (player.cooking <= 0) { // cooked too long: it goes off in hand
      const cdef = THROWABLES[player.cookKind];
      player.cooking = null;
      cdef.detonate({ def: cdef, pos: player.pos.clone() });
    }
  }
  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  player.bloom = Math.max(0, player.bloom - dt * 0.09);
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) {
      const need = def.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
  }

  // ---- firing
  if (firing && player.sprinting) player.sprinting = false;
  const canFire = player.reloadT <= 0 && player.switchT <= 0 && player.meleeT <= 0.33 &&
    player.cooking === null; // the trigger hand is holding a live grenade
  if (canFire && player.fireCooldown <= 0 && def.throwWeapon) {
    // #16c: a throw weapon lobs on the trigger edge instead of shooting;
    // an empty hand (already thrown, mag 0) just dry-clicks until retrieved
    if (triggerEdge) {
      if (w.mag > 0) { throwTomahawk(w); player.fireCooldown = 0.6; }
      else AudioSys.dry();
    }
  } else if (canFire && player.fireCooldown <= 0) {
    let wants = false;
    if (def.mode === 'auto') wants = firing;
    else if (def.mode === 'burst') {
      if (triggerEdge && player.burstQueue <= 0) player.burstQueue = def.burstCount;
      wants = player.burstQueue > 0;
    } else wants = triggerEdge; // semi / bolt / pump
    if (wants) {
      if (w.mag <= 0) {
        AudioSys.dry();
        startReload();
        firing = false;
      } else {
        firePlayerShot(w);
        if (def.mode === 'burst') {
          player.burstQueue--;
          player.fireCooldown = player.burstQueue > 0 ? 60 / def.rpm : def.burstDelay;
        } else if (def.mode === 'pump') {
          player.fireCooldown = def.pumpTime;
        } else {
          player.fireCooldown = 60 / def.rpm;
        }
      }
    }
  }
  triggerEdge = false;

  // auto-reload on empty mag after a beat
  if (w.mag <= 0 && player.reloadT <= 0 && w.reserve > 0 && player.fireCooldown <= 0) startReload();
}

function currentSpread() {
  const w = curW().def;
  let hip = w.spreadHip;
  if (player.perks.has('steadyaim')) hip *= 0.65;
  if (player.proneAmt > 0.5) hip *= 0.5;       // deck-steady: tightest hipfire
  else if (player.crouchAmt > 0.5) hip *= 0.8;
  hip *= 1 + Math.min(1, player.speedNow / 6) * 0.6;
  if (!player.onGround) hip *= 2.2;
  let spread = THREE.MathUtils.lerp(hip, w.spreadAds, player.adsAmt);
  spread += player.bloom * (1 - player.adsAmt * 0.65);
  return spread;
}

const _shotDir = new THREE.Vector3();
const _muzzleWorld = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _realUp = new THREE.Vector3();
const _shotOrigin = new THREE.Vector3();
const _shotEnd = new THREE.Vector3();
const _bodyBox = new THREE.Box3();
const _headBox = new THREE.Box3();
const _sparkPt = new THREE.Vector3();
const _collatHits = []; // #18f: per-pellet list of enemies the shot passes through

function firePlayerShot(w) {
  const def = w.def;
  player.spawnProtectT = 0; // #18a: firing ends spawn invuln immediately
  w.mag--;
  noteShot(player);
  AudioSys.shot(def.model, 0, 0, def.suppressed); // P55: suppressed defs report the quiet voice

  // muzzle flash
  muzzleLight.intensity = 1.4;
  if (vmGun) {
    const fl = vmGun.userData.flash;
    fl.visible = true;
    fl.rotation.z = Math.random() * 3;
    fl.scale.setScalar(0.75 + Math.random() * 0.5);
    setTimeout(() => { if (vmGun) vmGun.userData.flash.visible = false; }, 45);
  }
  vmKick = Math.min(1, vmKick + 0.6);

  // recoil
  player.pitch += def.recoil * (0.8 + Math.random() * 0.4);
  player.yaw += def.recoil * 0.35 * (Math.random() - 0.5);
  player.bloom = Math.min(0.05, player.bloom + def.bloom);

  // muzzle world position
  if (vmGun) {
    _muzzleWorld.copy(vmGun.userData.muzzleLocal);
    vmGun.localToWorld(_muzzleWorld);
  } else {
    _muzzleWorld.copy(G.camera.position);
  }

  const spread = currentSpread();
  const pellets = def.pellets || 1;
  let anyHit = false, anyKill = false, killCount = 0;
  // #18f: snipers punch through unlimited stacked bodies at full damage
  // (classic COD collateral); every other gun stops at the first body
  const penetrates = def.zoom > 3 || def.cat === 'Sniper Rifle';
  _shotOrigin.copy(G.camera.position);

  for (let p = 0; p < pellets; p++) {
    // direction with spread
    G.camera.getWorldDirection(_shotDir);
    const s1 = (Math.random() - 0.5) * 2 * spread;
    const s2 = (Math.random() - 0.5) * 2 * spread;
    _right.crossVectors(_shotDir, _up).normalize();
    _realUp.crossVectors(_right, _shotDir).normalize();
    _shotDir.addScaledVector(_right, s1).addScaledVector(_realUp, s2).normalize();

    const wall = rayWorld(_shotOrigin, _shotDir, 150, G.colliders);
    const wallDist = wall ? wall.dist : 150;

    // #18f: gather EVERY enemy nearer than the wall, keeping the closer of
    // each bot's head/body box (with its headshot flag), then sort front-to-back
    _collatHits.length = 0;
    for (const b of G.bots) {
      if (!b.alive || b.team === player.team) continue;
      _bodyBox.min.set(b.pos.x - 0.36, b.pos.y, b.pos.z - 0.36);
      _bodyBox.max.set(b.pos.x + 0.36, b.pos.y + 1.44, b.pos.z + 0.36);
      _headBox.min.set(b.pos.x - 0.2, b.pos.y + 1.44, b.pos.z - 0.2);
      _headBox.max.set(b.pos.x + 0.2, b.pos.y + 1.85, b.pos.z + 0.2);
      _ray.origin.copy(_shotOrigin); _ray.direction.copy(_shotDir);
      let d = Infinity, head = false;
      const hHit = _ray.intersectBox(_headBox, _hitVec);
      if (hHit) { d = hHit.distanceTo(_shotOrigin); head = true; }
      const bHit = _ray.intersectBox(_bodyBox, _hitVec);
      if (bHit) { const bd = bHit.distanceTo(_shotOrigin); if (bd < d) { d = bd; head = false; } }
      if (d < wallDist) _collatHits.push({ bot: b, dist: d, head });
    }
    _collatHits.sort((a, b) => a.dist - b.dist);
    const victims = penetrates ? _collatHits : _collatHits.slice(0, 1);

    // tracer runs to the true stop point: the wall for a through-and-through
    // sniper shot, otherwise the first body (or the wall if the pellet whiffs)
    const stopDist = (penetrates || _collatHits.length === 0) ? wallDist : _collatHits[0].dist;
    const end = _shotEnd.copy(_shotOrigin).addScaledVector(_shotDir, stopDist);
    if (pellets === 1 || p % 2 === 0) fxTracer(_muzzleWorld, end);

    for (const v of victims) {
      const fall = THREE.MathUtils.clamp((v.dist - def.range[0]) / (def.range[1] - def.range[0]), 0, 1);
      let dmg = THREE.MathUtils.lerp(def.dmg, def.minDmg, fall);
      if (v.head) dmg *= def.head;
      if (player.perks.has('stopping')) dmg *= 1.25;
      const wasAlive = v.bot.alive;
      v.bot.hurt(Math.round(dmg), player, def.name, v.head);
      _sparkPt.copy(_shotOrigin).addScaledVector(_shotDir, v.dist);
      fxSpark(_sparkPt, true);
      anyHit = true;
      if (wasAlive && !v.bot.alive) { anyKill = true; killCount++; }
    }
    if (victims.length === 0 && wall) fxSpark(end, false);
  }

  if (anyHit) {
    UI.showHitmarker(anyKill);
    if (!anyKill) AudioSys.hit(false);
  }
  // #18f: a single penetrating shot that drops two or more enemies is a
  // collateral — a cheap flourish over the normal killfeed/streak callouts
  if (penetrates && killCount >= 2) UI.showKillMsg('COLLATERAL!', true);
}

// ============================================================
// Camera & viewmodel per-frame
// ============================================================
let swayT = 0, cookDip = 0;
const _ss = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u); // clamped smoothstep

function updateCameraAndViewmodel(dt) {
  const def = curW().def;
  swayT += dt;

  let yaw = player.yaw, pitch = player.pitch;
  // sniper sway when scoped
  if (player.adsAmt > 0.8 && def.zoom > 3 && !UI.actionDown('sprint', keys)) {
    yaw += Math.sin(swayT * 1.7) * 0.0025;
    pitch += Math.sin(swayT * 2.3 + 1) * 0.002;
  }
  G.camera.position.set(player.pos.x, player.pos.y + eyeHeight(), player.pos.z);
  G.camera.rotation.set(pitch, yaw, 0);

  // melee: quick-swap to the knife and slash across the screen — pure lerp
  // keyframes off meleeT; the knife hides exactly when canFire's melee gate
  // (meleeT <= 0.33) reopens, so the gun is never hidden while fireable.
  // The whole 0.6 s swing is these same thresholds scaled from the old 0.9 s.
  const melee = player.meleeT > 0.33;
  vmKnife.visible = melee;
  if (melee) {
    const t = player.meleeT;
    if (t > 0.53) poseKnife(KNIFE_POSES.start, KNIFE_POSES.windup, (0.6 - t) / 0.07);
    else if (t > 0.41) {
      const u = (0.53 - t) / 0.12;
      poseKnife(KNIFE_POSES.windup, KNIFE_POSES.end, u * u * (3 - 2 * u));
    } else poseKnife(KNIFE_POSES.end, KNIFE_POSES.exit, (0.41 - t) / 0.08);
  }

  // viewmodel position: hip <-> ads, bob, kick
  if (vmGun) {
    // #16c: the held hatchet vanishes while it's airborne/on the ground
    // (mag 0), leaving the empty throwing hand until it's retrieved
    if (vmGun.userData.axeBody) vmGun.userData.axeBody.visible = curW().mag > 0;
    const target = new THREE.Vector3().lerpVectors(VM_POS.hip, vmGun.userData.adsPos || VM_POS.ads, player.adsAmt);
    if (player.speedNow > 0.5 && player.onGround) {
      bobPhase += dt * (player.sprinting ? 11 : 8);
      const bobAmt = (player.sprinting ? 0.02 : 0.011) * (1 - player.adsAmt * 0.9);
      target.x += Math.sin(bobPhase) * bobAmt;
      target.y += Math.abs(Math.cos(bobPhase)) * bobAmt;
    }
    vmKick = Math.max(0, vmKick - dt * 7);
    target.z += vmKick * 0.05;
    // Prone hip fire settles the gun lower/pulled in, but ADS must fade that
    // offset out. The ADS anchor is calibrated so optic reticles sit at camera
    // center; keeping a full prone offset made shots miss the visible dot.
    const proneHipAmt = player.proneAmt * (1 - player.adsAmt);
    if (proneHipAmt > 0.001) { target.y -= proneHipAmt * 0.05; target.z += proneHipAmt * 0.03; }
    // grenade: the gun holds dipped down-right while cooking, and the
    // release plays the same dip as a quick lob swing
    cookDip += ((player.cooking !== null ? 1 : 0) - cookDip) * Math.min(1, dt * 10);
    let dip = cookDip;
    if (player.throwT > 0) {
      const u = 1 - player.throwT / 0.55;
      dip = Math.max(dip, Math.sin(Math.min(1, u * 1.15) * Math.PI));
    }
    if (dip > 0.001) {
      target.x += dip * 0.16;
      target.y -= dip * 0.2;
    }
    // reload (#10b): three lerp phases off the reloadT countdown,
    // normalized to the live reload duration so Sleight of Hand plays
    // the same anim at double speed. Phase 1 the gun rolls magwell-to-
    // camera while the support hand pulls the mag down/out, phase 2 the
    // hand seats the fresh mag, phase 3 racks the charging handle
    // (quick z-jerk toward the camera).
    let rTilt = 0, rOut = 0, rRack = 0;
    if (player.reloadT > 0) {
      const t = 1 - player.reloadT / (def.reload * (player.perks.has('soh') ? 0.5 : 1));
      rTilt = _ss(t / 0.22) - _ss((t - 0.55) / 0.24);   // roll out, hold, roll back
      rOut = _ss(t / 0.3) - _ss((t - 0.38) / 0.3);      // mag out 0→0.3, back in by 0.68
      rRack = _ss((t - 0.8) / 0.09) - _ss((t - 0.9) / 0.09); // handle jerk at the end
    }
    // pump/bolt cycle (#10c): for pump/bolt weapons fireCooldown IS the
    // cycle window (pumpTime / 60÷rpm), so the anim normalizes against it
    // like reload does against reloadT. Pump: the tagged sleeve slides
    // back then forward with the support hand riding it. Bolt: the
    // trigger hand leaves the grip, works the handle back/forward while
    // the gun rolls its right side up into view, then returns. Reload
    // owns the arms when both would run (R during a cycle); the switchT
    // gate keeps a residual fireCooldown from the PREVIOUS gun (it's
    // per-player) from playing a cycle tail on a freshly switched one.
    let pOut = 0, bReach = 0;
    const boltMode = def.mode === 'bolt';
    if (player.reloadT <= 0 && player.switchT <= 0 && player.fireCooldown > 0 &&
        (def.mode === 'pump' || boltMode)) {
      const ct = 1 - player.fireCooldown / (boltMode ? 60 / def.rpm : def.pumpTime);
      if (boltMode) {
        bReach = _ss((ct - 0.06) / 0.16) - _ss((ct - 0.76) / 0.18); // hand to the bolt, home at the end
        pOut = _ss((ct - 0.28) / 0.16) - _ss((ct - 0.5) / 0.16);    // bolt back 0.28–0.44, forward 0.5–0.66
      } else {
        pOut = _ss((ct - 0.18) / 0.24) - _ss((ct - 0.58) / 0.3);    // back 0.18–0.42, forward 0.58–0.88
      }
    }
    target.x -= rTilt * 0.035;
    target.y -= rTilt * 0.05 + bReach * 0.02;
    target.z += rRack * 0.05;
    const mag = vmGun.userData.magPart, pull = vmGun.userData.magPull;
    if (mag) {
      mag.position.set(pull.x * rOut, pull.y * rOut, pull.z * rOut);
      mag.rotation.x = pull.rx * rOut;
    }
    const cyc = vmGun.userData.pumpPart;
    if (cyc) cyc.position.z = pOut * (boltMode ? 0.06 : 0.075);
    const armS = vmGun.userData.armSupport;
    if (armS && armS.userData.rest) {
      const rest = armS.userData.rest;
      armS.position.set(
        rest.x + pull.x * rOut,
        rest.y + pull.y * rOut + rRack * 0.05,
        // rack slides the support hand back to the receiver (~z −0.06);
        // hands already at/behind it (pistols) stay put
        rest.z + pull.z * rOut + rRack * Math.max(0, -0.06 - rest.z) +
          (boltMode ? 0 : pOut * 0.075));
    }
    const armT = vmGun.userData.armTrigger;
    if (armT && armT.userData.rest) {
      const rt = armT.userData.rest;
      // bolt work: fist up/right to the handle, ride the pull, back home
      armT.position.set(
        rt.x + bReach * 0.07,
        rt.y + bReach * 0.115,
        rt.z + bReach * 0.04 + (boltMode ? pOut * 0.06 : 0));
    }
    // while the knife is out the gun hides lowered, so the return lerp
    // reads as re-raising it
    if (melee) target.y -= 0.3;
    vmGun.position.lerp(target, Math.min(1, dt * 16));
    // pump yank tips the muzzle up a touch (bolt pOut skips it — the
    // gun holds still while only the hand works the handle)
    vmGun.rotation.x = vmKick * 0.09 + (player.sprinting ? -0.5 : 0) - dip * 0.25 + rTilt * 0.12 - rRack * 0.08 + (boltMode ? 0 : pOut * 0.05);
    vmGun.rotation.y = player.sprinting ? 0.4 : 0;
    // roll is negative (top-to-the-right) so the magwell swings toward
    // the camera instead of hiding behind the receiver; bolt work rolls
    // positive so the right-side handle comes up into view
    vmGun.rotation.z = dip * 0.5 - rTilt * 0.42 + bReach * 0.18;
    // laser (#19c): each frame land the dot on the crosshair's world point
    // and converge the beam onto it from the offset emitter. Hidden at ADS
    // (COD-style) so it never clutters the sight, and while sprinting (the
    // gun swings off-axis, so the beam would shoot off-screen); one ray/
    // frame, pooled meshes, no allocations here.
    const laser = vmGun.userData.laser;
    if (laser) {
      const show = player.adsAmt < 0.5 && !player.sprinting;
      laser.beam.visible = laser.dot.visible = show;
      if (show) {
        vmGun.updateWorldMatrix(true, false);
        // aim along the CROSSHAIR, not the barrel: same origin/direction the
        // fire path uses (camera center, no spread), so the dot lands exactly
        // on the reticle's world point. The beam then converges to that point
        // from the offset emitter — like a real zeroed laser.
        _laserOrigin.copy(G.camera.position);
        G.camera.getWorldDirection(_laserDir);
        const hit = rayWorld(_laserOrigin, _laserDir, laser.maxLen, G.colliders);
        if (hit) _laserPt.copy(hit.point);
        else _laserPt.copy(_laserOrigin).addScaledVector(_laserDir, laser.maxLen);
        laser.dot.visible = !!hit; // no dot when the ray reaches open sky
        // world hit point → gun-local (beam + dot are children of the gun),
        // so the dot stays pinned to the crosshair even as the gun bobs/sways
        vmGun.worldToLocal(_laserPt);
        laser.dot.position.copy(_laserPt);
        // beam spans emitter → dot: sit at the midpoint, length = separation,
        // Y axis rotated to point from the emitter at the dot
        _laserMid.addVectors(laser.emit, _laserPt).multiplyScalar(0.5);
        laser.beam.position.copy(_laserMid);
        _laserSeg.subVectors(_laserPt, laser.emit);
        const len = _laserSeg.length();
        laser.beam.scale.set(1, len, 1);
        if (len > 1e-5) laser.beam.quaternion.setFromUnitVectors(_laserUpY, _laserSeg.divideScalar(len));
      }
    }
    // hide gun when fully scoped
    const scoped = player.adsAmt > 0.85 && def.zoom > 3;
    vmGun.visible = !scoped && !melee;
    document.getElementById('scopeOverlay').classList.toggle('hidden', !scoped);
  }
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 22);
}

// enemy name under crosshair
let nameT = 0;
function updateTargetName(dt) {
  nameT -= dt;
  if (nameT > 0) return;
  nameT = 0.1;
  const el = document.getElementById('targetName');
  const dir = G.camera.getWorldDirection(_shotDir);
  const origin = G.camera.position;
  const wall = rayWorld(origin, dir, 90, G.colliders);
  const maxT = wall ? wall.dist : 90;
  let found = null;
  for (const b of G.bots) {
    if (!b.alive || b.team === player.team) continue;
    _bodyBox.min.set(b.pos.x - 0.45, b.pos.y, b.pos.z - 0.45);
    _bodyBox.max.set(b.pos.x + 0.45, b.pos.y + 1.85, b.pos.z + 0.45);
    _ray.origin.copy(origin); _ray.direction.copy(dir);
    const h = _ray.intersectBox(_bodyBox, _hitVec);
    if (h && h.distanceTo(origin) < maxT) {
      _victimAt.set(b.pos.x, b.pos.y + 1.2, b.pos.z);
      if (smokeBlocked(origin, _victimAt)) continue; // can't ID through smoke
      found = b; break;
    }
  }
  if (found) {
    el.textContent = found.name;
    el.classList.remove('hidden');
  } else el.classList.add('hidden');
}

// ============================================================
// Main loop
// ============================================================
let lastT = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  let dt = Math.min(0.033, (now - lastT) / 1000);
  lastT = now;

  const live = G.state === 'playing' || G.state === 'dead';
  if (live) {
    G.time += dt;
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) { G.timeLeft = 0; endMatch(); }

    for (const b of G.bots) b.update(dt);

    if (G.state === 'playing' && player.alive) {
      updatePlayer(dt);
      updateScavenger(); // #6: resupply reserve off corpses
      updateTargetName(dt);
    }
    if (G.state === 'dead') {
      player.respawnT -= dt;
      UI.setRespawnCountdown(player.respawnT);
    }

    fxUpdate(dt);
    updateThrowables(dt);
    UI.updateFragDanger(fragDangerInfo());
    updateGrenadePreview();
    updateTomahawks(dt); // #16c
    updateSmokeClouds(dt);
    updateNapalm(dt);
    updateNuke(dt);

    // HUD
    if (player.alive) {
      UI.updateHud(player, curW().def, curW());
      UI.updateScores(G.mode, G.scores, G.timeLeft, G.combatants);
      const spreadPx = Math.tan(currentSpread() + 0.004) /
        Math.tan(THREE.MathUtils.degToRad(G.camera.fov / 2)) * (window.innerHeight / 2);
      UI.crosshairSpread(6 + spreadPx, player.adsAmt < 0.5 && !player.sprinting);
      document.getElementById('reloadHint').classList.toggle('hidden', player.reloadT <= 0);
      document.getElementById('sprintBar').style.width =
        (player.perks.has('marathon') ? 100 : player.stamina * 100) + '%';
    }
    drawMinimap();
    // stun whiteout: snaps to full, fades out over the stun's duration
    // (UI gates the DOM write, so this only costs while stunned)
    UI.stunOverlay(player.alive && player.stunT > 0
      ? Math.min(1, 1.3 * player.stunT / player.stunMax) : 0);
    // P48: flash whiteout — the #flashWhite overlay + opacity shaping is
    // the UI lane's half. Contract: UI.updateFlash(flashT, flashMaxT)
    // every frame (raw seconds; 0 when unflashed/dead so it self-clears);
    // suggested shape: opaque white while flashT/flashMaxT > 0.4 (the
    // ~60% hold), then fade to 0. Guarded so mechanics ship first.
    UI.updateFlash && UI.updateFlash(player.alive ? Math.max(0, player.flashT) : 0, player.flashMaxT);
  } else if (G.state === 'nukecine') {
    // nuke cinematic: the world freezes, the camera belongs to the show
    fxUpdate(dt);
    updateNukeCine(dt);
  }

  if (G.scene) {
    if ((player.alive || G.state === 'dead') && G.state !== 'nukecine')
      updateCameraAndViewmodel(live ? dt : 0);
    G.renderer.render(G.scene, G.camera);
  }
}

// ============================================================
// Public API for the UI layer
// ============================================================
window.MAIN = {
  startMatch, deploy, quitMatch, rematch,
  inMatch: () => G.state !== 'menu',
  resume() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    UI.show('hud');
    lockPointer();
  },
  applyFov() {
    G.camera.fov = UI.settings.fov;
    G.camera.updateProjectionMatrix();
  },
};

window.DEBUG = { G, player, startMatch, deploy, cine: () => _cine,
  nukeT: v => v === undefined ? _nukeT : (_nukeT = v),
  throwables: () => _throwables, throwEquipment, startCooking, releaseThrow,
  grenadePreview: () => _grenadePreview,
  spawnBotThrowable, // #16b
  tomahawks: () => _tomahawks, axePickups: () => _axePickups, throwTomahawk, // #16c
  updateTomahawks, switchWeapon, curW,
  smokeClouds: () => _smokeClouds, smokeBlocked };

UI.init();
UI.show('menu');
loop();
