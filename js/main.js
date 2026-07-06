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
  scene: null, camera: null, renderer: null,
  colliders: [], graph: null,
  bots: [], combatants: [],
  scores: { tf: 0, sp: 0 },
  timeLeft: 600, time: 0,
  uavUntil: 0,
  pointerLocked: false,
};

const player = {
  isPlayer: true, name: 'YOU', team: 'tf',
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  hp: 100, alive: false, kills: 0, deaths: 0,
  crouched: false, crouchAmt: 0,
  stamina: 1, sprinting: false, winded: false,
  perks: new Set(),
  weapons: [], cur: 0,
  reloadT: 0, switchT: 0, fireCooldown: 0, burstQueue: 0,
  adsHeld: false, adsToggle: false, adsAmt: 0, bloom: 0,
  meleeT: 0, sinceDamage: 99, respawnT: 0,
  speedNow: 0, onGround: true,
  vault: null, forceCrouch: false,
  lastShotTime: -99,
  _stepT: 0, _killStreakCount: 0, _lastKillTime: -99, _streakKills: 0,
  _bankedStreaks: [], _streakSel: 0,
  equip: 'frag', equipLeft: 0, equipTac: 'stun', equipTacLeft: 0,
  equipSmoke: 'smoke', equipSmokeLeft: 0,
  throwT: 0, cooking: null, cookKind: null, cookSlot: null,
  stunT: 0, stunMax: 1,
};

const keys = {};
let firing = false, triggerEdge = false;

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
let vmKick = 0, bobPhase = 0;
const muzzleLight = new THREE.PointLight(0xffc070, 0, 9);
muzzleLight.position.set(0.12, -0.12, -0.9);
G.camera.add(muzzleLight);

const VM_POS = {
  hip: new THREE.Vector3(0.27, -0.25, -0.52),
  ads: new THREE.Vector3(0, -0.082, -0.38),
};

function buildViewModel(w) {
  if (vmGun) { vmRoot.remove(vmGun); }
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const part = (wd, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), mat(c));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const dark = 0x26282c, mid = 0x3a3d42, wood = 0x6e5637;
  const type = w.model;
  let len = 0.62, flashSize = 0.12;
  if (type === 'ar') {
    part(0.055, 0.085, 0.62, dark, 0, 0, -0.31);
    part(0.03, 0.03, 0.3, mid, 0, 0.005, -0.68);         // barrel
    part(0.04, 0.14, 0.1, mid, 0, -0.1, -0.2);           // mag
    part(0.05, 0.08, 0.16, dark, 0, -0.01, 0.02);        // stock
    part(0.014, 0.045, 0.02, dark, 0, 0.062, -0.55);     // front sight
    part(0.014, 0.04, 0.02, dark, 0, 0.06, -0.12);       // rear sight
    len = 0.83;
  } else if (type === 'smg') {
    part(0.055, 0.09, 0.42, dark, 0, 0, -0.21);
    part(0.028, 0.028, 0.16, mid, 0, 0.008, -0.48);
    part(0.038, 0.16, 0.08, mid, 0, -0.11, -0.12);
    part(0.014, 0.04, 0.02, dark, 0, 0.062, -0.38);
    part(0.014, 0.036, 0.02, dark, 0, 0.058, -0.06);
    len = 0.57; flashSize = 0.1;
  } else if (type === 'lmg') {
    part(0.065, 0.1, 0.7, dark, 0, 0, -0.35);
    part(0.034, 0.034, 0.3, mid, 0, 0.005, -0.83);
    part(0.12, 0.12, 0.1, mid, 0, -0.1, -0.25);          // drum
    part(0.05, 0.08, 0.14, wood, 0, -0.01, 0.04);
    part(0.014, 0.05, 0.02, dark, 0, 0.07, -0.62);
    len = 0.99; flashSize = 0.15;
  } else if (type === 'sniper') {
    part(0.05, 0.075, 0.9, dark, 0, 0, -0.45);
    part(0.026, 0.026, 0.32, mid, 0, 0.006, -1.0);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), mat(0x1c1e22));
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.07, -0.3);
    g.add(scope);
    part(0.045, 0.09, 0.2, wood, 0, -0.015, 0.05);
    len = 1.17; flashSize = 0.13;
  } else if (type === 'shotgun') {
    part(0.05, 0.08, 0.7, dark, 0, 0, -0.35);
    part(0.03, 0.03, 0.24, mid, 0, -0.045, -0.5);        // tube
    part(0.045, 0.05, 0.14, wood, 0, -0.045, -0.42);     // pump
    part(0.05, 0.075, 0.16, wood, 0, -0.005, 0.03);
    part(0.014, 0.04, 0.02, dark, 0, 0.056, -0.66);
    len = 0.72; flashSize = 0.14;
  } else { // pistol
    part(0.04, 0.07, 0.24, dark, 0, 0.03, -0.1);
    part(0.036, 0.13, 0.06, mid, 0, -0.05, -0.02);
    part(0.012, 0.03, 0.015, dark, 0, 0.078, -0.2);
    len = 0.24; flashSize = 0.08;
  }
  // muzzle flash quad
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(flashSize, flashSize),
    new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  flash.position.set(0, 0.005, -len);
  flash.visible = false;
  g.add(flash);
  g.userData.flash = flash;
  g.userData.muzzleLocal = new THREE.Vector3(0, 0, -len);
  g.position.copy(VM_POS.hip);
  vmGun = g;
  vmRoot.add(g);
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
  g.visible = false;
  vmRoot.add(g);
  return g;
})();

// swing keyframes (camera-space pos + euler), meleeT-relative: raise from
// off-screen bottom-right, slash across to low-left, drop out. The blade
// stays in left profile (rot.y ~ -1.1..-1.4) so it reads as a blade, not a
// grip-on box; the slash itself is the rot.x sweep tip-up -> tip-down
const KNIFE_POSES = {
  start:  { p: new THREE.Vector3(0.45, -0.55, -0.5),  r: new THREE.Vector3(0.3, -1.4, 0.4) },
  windup: { p: new THREE.Vector3(0.3, -0.14, -0.44),  r: new THREE.Vector3(0.6, -1.35, 0.4) },
  end:    { p: new THREE.Vector3(-0.3, -0.35, -0.48), r: new THREE.Vector3(-0.7, -1.1, -0.3) },
  exit:   { p: new THREE.Vector3(-0.32, -0.62, -0.5), r: new THREE.Vector3(-1.0, -1.1, -0.3) },
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
function drawMinimap() {
  if (!mmBg) return;
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
    } else if (uav || G.time - b.lastShotTime < 1.8) {
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
function pickSpawn(team) {
  const pts = G.map.spawns[team];
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
  ent.lastShotTime = G.time;
  // gunfire is loud: enemy bots within earshot learn the shooter's position
  // (Bot.hearShot halves the radius through walls). Ninja fires quieter.
  let earshot = 25;
  if (ent.isPlayer && ent.perks.has('ninja')) earshot *= 0.6;
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
const KILLSTREAKS = [
  {
    id: 'uav', name: 'UAV', kills: 5,
    deploy() {
      // 20 s of all living enemies on the minimap (drawMinimap);
      // the UAV keeps flying through the owner's death, COD-style
      G.uavUntil = G.time + 20;
      AudioSys.uav();
    },
  },
  {
    id: 'napalm', name: 'NAPALM STRIKE', kills: 10,
    deploy() { deployNapalm(); },
  },
  {
    id: 'nuke', name: 'TACTICAL NUKE', kills: 25,
    deploy() { deployNuke(); },
  },
];

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

// low-poly mushroom cloud sized to the map (unit height ~1.3×B), grown
// from ~0 by the cinematic; returns the group + the glow light inside it
function buildMushroomCloud(B) {
  const g = new THREE.Group();
  const puff = (r, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8),
      new THREE.MeshLambertMaterial({ color: c }));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const gray = 0x9a9284, dust = 0x8a8072;
  // stem
  puff(B * 0.14, 0, B * 0.12, 0, dust);
  puff(B * 0.17, 0, B * 0.38, 0, dust);
  puff(B * 0.20, 0, B * 0.66, 0, gray);
  // cap: center dome + a ring of puffs curling under it
  puff(B * 0.36, 0, B * 1.02, 0, gray);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    puff(B * 0.19, Math.sin(a) * B * 0.33, B * 0.88, Math.cos(a) * B * 0.33, dust);
  }
  // fireball glow at the base
  puff(B * 0.16, 0, B * 0.10, 0, 0xffa040).material =
    new THREE.MeshBasicMaterial({ color: 0xff9030 });
  const light = new THREE.PointLight(0xff8030, 6, B * 3);
  light.position.y = B * 0.25;
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
    plane, planeSpeed: span / 3.2, dropped: false,
    bomb: null, bombT: 0, dropY: 0,
    cloud: null, impactT: -1, shake: 0,
    endWin,
  };
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
    b.hurt(9999, b.team !== player.team ? player : null, 'TACTICAL NUKE', false);
  }
  // the owner dies too (damagePlayer would show the respawn screen
  // mid-cinematic, so just record the death directly)
  if (player.alive) {
    player.alive = false;
    player.hp = 0;
    player.deaths++;
    player._killStreakCount = 0;
    player._streakKills = 0;
  }
}

function updateNukeCine(dt) {
  const c = _cine;
  if (!c) return;
  c.t += dt;

  // camera: smoothstep glide out, then hold (plus impact shake)
  const u = Math.min(1, c.t / 2.2), e = u * u * (3 - 2 * u);
  _cineCamPos.lerpVectors(c.camFrom, c.camTo, e);
  _cineLook.lerpVectors(c.lookFrom, c.lookTo, e);
  if (c.shake > 0) {
    c.shake -= dt * 0.8;
    const s = Math.max(0, c.shake) * 0.5;
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
    const g = Math.min(1, c.impactT / 4);
    const s = 0.05 + 0.95 * (1 - Math.pow(1 - g, 3)); // fast rise, slow finish
    c.cloud.group.scale.set(s, s, s);
    c.cloud.group.rotation.y += dt * 0.12;
    c.cloud.light.intensity = Math.max(0, 6 * (1 - c.impactT / 3));
    for (const b of G.bots) if (!b.alive) b.update(dt); // death anims play out
    if (c.impactT >= 4.5) {
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
const THROWABLES = {
  frag: {
    name: 'FRAG', count: 2, fuse: 3.6, radius: 7, dmg: 125, minDmg: 25,
    color: 0x3d4a33, throwSpeed: 15, throwUp: 3.4,
    detonate: fragDetonate,
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
    name: 'STUN', count: 2, fuse: 1.8, radius: 8, dmg: 0, minDmg: 0,
    stunMax: 4, stunMin: 1.2, noCookOff: true, model: 'flashbang',
    color: 0x5a6a72, throwSpeed: 17, throwUp: 3.0,
    detonate: stunDetonate,
  },
  // smoke: no damage — the pop spawns a lingering cloud (radius here is
  // the cloud's, not a blast's) that blocks sight lines both ways via
  // smokeBlocked. Own slot on [E]; one per life, it's strong cover.
  smoke: {
    name: 'SMOKE', count: 1, fuse: 1.5, radius: 4.5, dmg: 0, minDmg: 0,
    smokeDur: 8,
    color: 0x4a5346, throwSpeed: 15, throwUp: 3.2,
    detonate: smokeDetonate,
  },
};
const GREN_R = 0.08, GREN_H = 0.16, GREN_BOUNCE = 0.42;
const _throwables = [];
const _blastAt = new THREE.Vector3();
const _victimAt = new THREE.Vector3();

// Branched on the def's model, not a kind check (defs carry behavior):
// default is the frag/smoke sphere-and-cap silhouette; 'flashbang' is the
// stun's — straight cylinder body, lighter band, dark top cap.
function buildGrenadeMesh(def) {
  const g = new THREE.Group();
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

function spawnThrowable(def, fuse, speed, up) {
  const dir = G.camera.getWorldDirection(_shotDir);
  const pos = new THREE.Vector3(player.pos.x, player.pos.y + eyeHeight() - 0.1, player.pos.z)
    .addScaledVector(dir, 0.35);
  const vel = new THREE.Vector3().copy(dir).multiplyScalar(speed);
  vel.y += up; // lob arc
  const mesh = buildGrenadeMesh(def);
  mesh.position.copy(pos);
  G.scene.add(mesh);
  _throwables.push({ def, mesh, pos, vel, fuse,
    spin: 5 + Math.random() * 3, sinceBounce: 0 });
}

// COD-style cooking: key down pulls the pin (committed — the grenade is
// spent and its fuse burns in hand), key up throws with the remaining
// fuse. Cook too long and it detonates in hand; dying mid-cook drops it.
// The slots share one pair of hands — 'lethal' ([F]), 'tactical' ([T]),
// 'smoke' ([E]) — so only one grenade cooks at a time.
const EQUIP_SLOTS = {
  lethal:   { kind: 'equip',      left: 'equipLeft' },
  tactical: { kind: 'equipTac',   left: 'equipTacLeft' },
  smoke:    { kind: 'equipSmoke', left: 'equipSmokeLeft' },
};
function startCooking(slot = 'lethal') {
  if (G.state !== 'playing' || !player.alive) return;
  const fields = EQUIP_SLOTS[slot];
  const kind = player[fields.kind];
  const def = THROWABLES[kind];
  if (!def || player[fields.left] <= 0 || player.cooking !== null) return;
  if (player.throwT > 0 || player.switchT > 0 || player.meleeT > 0.5) return;
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
  player.throwT = 0.55; // re-throw cooldown; also drives the viewmodel animation
  spawnThrowable(def, fuse, def.throwSpeed, def.throwUp);
  AudioSys.throwWhoosh();
}

// instant pin-pull + lob in one call (DEBUG / tests)
function throwEquipment(slot = 'lethal') { startCooking(slot); releaseThrow(slot); }

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
    t.sinceBounce += dt;
    v.y -= 13 * dt; // same gravity as the player
    let bounced = false;
    // axis-separated sweep like moveEntity, but reflecting instead of stopping
    p.x += v.x * dt;
    for (const c of G.colliders) {
      if (c.max.y <= 0.02) continue;
      if (_boxOverlap(c, p, GREN_R, GREN_H)) {
        p.x = v.x > 0 ? c.min.x - GREN_R - 0.001 : c.max.x + GREN_R + 0.001;
        v.x *= -GREN_BOUNCE;
        bounced = true;
      }
    }
    p.z += v.z * dt;
    for (const c of G.colliders) {
      if (c.max.y <= 0.02) continue;
      if (_boxOverlap(c, p, GREN_R, GREN_H)) {
        p.z = v.z > 0 ? c.min.z - GREN_R - 0.001 : c.max.z + GREN_R + 0.001;
        v.z *= -GREN_BOUNCE;
        bounced = true;
      }
    }
    p.y += v.y * dt;
    let rest = false;
    const landed = () => { // downward hit: bounce, or settle when nearly spent
      if (-v.y * GREN_BOUNCE < 1.0) { v.y = 0; rest = true; }
      else { v.y *= -GREN_BOUNCE; bounced = true; }
      v.x *= 0.75; v.z *= 0.75; // ground hits scrub lateral speed too
    };
    for (const c of G.colliders) {
      if (c.max.y <= 0.02) continue;
      if (_boxOverlap(c, p, GREN_R, GREN_H)) {
        if (v.y < 0) { p.y = c.max.y + 0.001; landed(); }
        else { p.y = c.min.y - GREN_H - 0.001; v.y *= -GREN_BOUNCE; bounced = true; }
      }
    }
    if (p.y <= 0 && v.y <= 0) { p.y = 0; if (v.y < 0) landed(); else rest = true; }
    if (rest) { // rolling friction
      const f = Math.max(0, 1 - 4 * dt);
      v.x *= f; v.z *= f;
    }
    if (bounced && t.sinceBounce > 0.12 && Math.hypot(v.x, v.y, v.z) > 1.2) {
      t.sinceBounce = 0;
      AudioSys.grenadeBounce(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(p));
    }
    t.mesh.position.copy(p);
    if (!rest) {
      t.mesh.rotation.x += t.spin * dt;
      t.mesh.rotation.z += t.spin * 0.6 * dt;
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

function fragDetonate(t) {
  const def = t.def, p = t.pos;
  _blastAt.set(p.x, p.y + 0.4, p.z);
  fxFire(_blastAt, 0.3, 4);
  for (let i = 0; i < 4; i++) {
    _victimAt.set(p.x + (Math.random() - 0.5) * 1.6, p.y + 0.3 + Math.random() * 0.8,
      p.z + (Math.random() - 0.5) * 1.6);
    fxFire(_victimAt, 0.3 + Math.random() * 0.3, 1.2 + Math.random());
  }
  AudioSys.explosion(Math.hypot(p.x - player.pos.x, p.z - player.pos.z), audioPan(_blastAt));
  for (const b of G.bots) {
    if (!b.alive || b.team === player.team) continue; // teammates are safe
    const dmg = blastDamage(def, p, b.pos);
    if (dmg > 0) b.hurt(dmg, player, def.name, false);
  }
  // the thrower's own grenade hurts them (null attacker: a self-kill
  // credits no one, same rule as the nuke's owner death)
  const selfDmg = blastDamage(def, p, player.pos);
  if (selfDmg > 0) damagePlayer(selfDmg, null, def.name, false);
  // the blast is loud — enemies within earshot investigate the spot
  _blastAt.set(p.x, p.y + 0.4, p.z); // blastDamage reuses the scratch
  for (const b of G.bots) b.hearShot({ pos: _blastAt, team: player.team }, 30);
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

// white flash + heavily slowed look/move; stunMax remembers the applied
// duration so the overlay can fade as a fraction of it
function stunPlayer(dur) {
  if (dur <= player.stunT) return;
  player.stunT = dur;
  player.stunMax = dur;
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

// selector under the minimap: what's banked, what's selected, how to deploy
function refreshStreakTag() {
  const b = player._bankedStreaks;
  if (!b.length) { UI.setStreakTag(null); return; }
  let txt = '▲ ' + b[player._streakSel].name + ' — [G]';
  if (b.length > 1) txt += '  ' + (player._streakSel + 1) + '/' + b.length + ' [3]';
  UI.setStreakTag(txt);
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

function registerKill(killer, victim, weaponName, headshot) {
  if (killer && killer.team !== victim.team) {
    G.scores[killer.team]++;
    UI.killfeed(killer.name, killer.team, victim.name, victim.team, weaponName, headshot);
    if (killer.isPlayer) {
      AudioSys.hit(true);
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
      // deploy — announced on its own banner, not in the kill message
      killer._streakKills++;
      for (const ks of KILLSTREAKS)
        if (killer._streakKills === ks.kills) earnKillstreak(ks);
      if (streakMsg) {
        UI.showKillMsg(hsTag + streakMsg, true);
      } else {
        UI.showKillMsg(hsTag + 'YOU KILLED ' + victim.name, false);
      }
    }
  }
  UI.updateScores(G.scores.tf, G.scores.sp, G.timeLeft);
  // (endMatch is a no-op during the nuke cinematic, so the killstreak
  // nuke's mass kill can't trip the score limit mid-scene)
  if (G.scores.tf >= UI.settings.scoreLimit || G.scores.sp >= UI.settings.scoreLimit) endMatch();
}

function startMatch(mapId) {
  G.mapId = mapId;
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
  buildMinimapBg();

  // combatants
  G.scores = { tf: 0, sp: 0 };
  G.timeLeft = UI.settings.timeLimit > 0 ? UI.settings.timeLimit : Infinity;
  G.time = 0;
  player.kills = 0; player.deaths = 0;
  player._streakKills = 0;
  player._bankedStreaks = []; player._streakSel = 0;
  refreshStreakTag();
  G.uavUntil = 0; // G.time restarts at 0, so a stale value would be a free UAV
  _napalmDrops.length = 0; // no strikes carry across a rematch
  _throwables.length = 0;  // in-flight grenades die with the old scene
  _smokeClouds.length = 0; // active smoke too (sprites rebuild with the pools)
  player.stunT = 0;        // a rematch shakes the stars off
  UI.stunOverlay(0);
  _nukeT = -1;             // nor an in-flight nuke countdown
  _cine = null;            // cinematic props die with the old scene
  UI.setNukeCountdown(null);
  UI.clearNukeFlash();
  player.alive = false;
  G.bots = [];

  const world = {
    scene: G.scene, colliders: G.colliders, graph: G.graph,
    api: {
      difficulty: UI.settings.difficulty,
      pickSpawn, getEnemies, registerKill, noteShot, audioPan, smokeBlocked,
      tracer: fxTracer,
      playerPos: () => player.pos,
      playerTeam: player.team,
      playerDamage: damagePlayer,
      matchLive: () => G.state === 'playing' || G.state === 'dead',
    },
  };
  const n = UI.settings.teamSize;
  const namesTf = BOT_NAMES.tf.slice().sort(() => Math.random() - 0.5);
  const namesSp = BOT_NAMES.sp.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < n - 1; i++) G.bots.push(new Bot(namesTf[i], 'tf', world));
  for (let i = 0; i < n; i++) G.bots.push(new Bot(namesSp[i], 'sp', world));
  G.combatants = [player, ...G.bots];

  document.getElementById('scoreLimitLabel').textContent = UI.settings.scoreLimit;
  UI.updateScores(0, 0, G.timeLeft);
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
  const mkState = key => {
    const w = WEAPONS[key];
    return { def: w, mag: w.mag, reserve: w.reserve * (player.perks.has('scavenger') ? 2 : 1) };
  };
  player.weapons = [mkState(cls.primary), mkState(cls.secondary)];
  player.cur = 0;
  player.reloadT = 0; player.switchT = 0; player.burstQueue = 0; player.meleeT = 0;
  player.equipLeft = THROWABLES[player.equip].count;
  player.equipTacLeft = THROWABLES[player.equipTac].count;
  player.equipSmokeLeft = THROWABLES[player.equipSmoke].count;
  player.throwT = 0; player.cooking = null; player.cookKind = null; player.cookSlot = null;
  player.stunT = 0;
  player.adsAmt = 0; player.adsToggle = false; player.bloom = 0;
  player.hp = 100;
  player.stamina = 1;
  player.winded = false;
  player.sinceDamage = 99;
  player.vault = null;
  player.forceCrouch = false;
  player.crouched = false;
  player.crouchAmt = 0;
  player.pos.copy(pickSpawn(player.team));
  player.vel.set(0, 0, 0);
  player.yaw = player.team === 'tf' ? (G.mapId === 'rust' ? Math.PI * 1.25 : Math.PI) : 0;
  player.pitch = 0;
  player.alive = true;
  buildViewModel(curW().def);
  G.state = 'playing';
  UI.show('hud');
  lockPointer();
}

function curW() { return player.weapons[player.cur]; }

function damagePlayer(dmg, attacker, weaponName, headshot) {
  if (!player.alive || G.state !== 'playing') return;
  player.hp -= dmg;
  player.sinceDamage = 0;
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
    player._killStreakCount = 0; // reset streak on death
    player._streakKills = 0;     // streak progress resets; banked rewards survive death
    if (attacker) attacker.kills++;
    registerKill(attacker, player, weaponName, headshot);
    // that kill may have ended the match (or started the Nuketown
    // end-of-match nuke) — don't clobber the state with 'dead'
    if (G.state === 'end' || G.state === 'nukecine') return;
    G.state = 'dead';
    player.respawnT = 3.5;
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
  const win = forcedWin !== undefined ? forcedWin
    : G.scores.tf === G.scores.sp ? null : G.scores.tf > G.scores.sp;
  if (G.mapId === 'nuketown') { startNukeCinematic(win); return; }
  finishMatch(win);
}

// the actual match end: state flip + end screen (win: true/false/null)
function finishMatch(win) {
  if (G.state === 'end') return;
  G.state = 'end';
  document.exitPointerLock && document.exitPointerLock();
  AudioSys.matchEnd(win !== false);
  UI.showEnd(win, G.scores.tf, G.scores.sp, G.combatants);
}

function quitMatch() {
  G.state = 'menu';
  document.exitPointerLock && document.exitPointerLock();
  UI.show('menu');
}

function rematch() { startMatch(G.mapId); }

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

document.addEventListener('keydown', e => {
  if (e.code === 'Tab' && (G.state === 'playing' || G.state === 'dead')) {
    e.preventDefault();
    if (e.repeat) return;
    UI.buildScoreboard(G.combatants, G.scores.tf, G.scores.sp);
    UI.$('scoreboard').classList.remove('hidden');
  }
  if (e.repeat) return;
  keys[e.code] = true;
  if (G.state !== 'playing') return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyC') toggleCrouch();
  if (e.code === 'KeyQ') switchWeapon(player.cur === 0 ? 1 : 0);
  if (e.code === 'Digit1') switchWeapon(0);
  if (e.code === 'Digit2') switchWeapon(1);
  if (e.code === 'KeyV') tryMelee();
  if (e.code === 'KeyF') startCooking('lethal');   // pin out; leaves on release
  if (e.code === 'KeyT') startCooking('tactical'); // stun, same cook mechanics
  if (e.code === 'KeyE') startCooking('smoke');    // smoke, same cook mechanics
  if (e.code === 'KeyX') player.adsToggle = !player.adsToggle;
  if (e.code === 'KeyG') deployKillstreak();
  if (e.code === 'Digit3') cycleKillstreak();
});
document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Tab') UI.$('scoreboard').classList.add('hidden');
  if (e.code === 'KeyF') releaseThrow('lethal');
  if (e.code === 'KeyT') releaseThrow('tactical');
  if (e.code === 'KeyE') releaseThrow('smoke');
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
  if (player.crouched) {
    // need headroom to stand
    const test = player.pos.clone();
    const ok = !G.colliders.some(c => c.max.y > 0.02 &&
      _boxOverlap(c, test, 0.38, 1.75));
    if (!ok) return;
  }
  player.crouched = !player.crouched;
}

function switchWeapon(idx) {
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
  player.meleeT = 0.9;
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
function eyeHeight() { return THREE.MathUtils.lerp(1.62, 1.12, player.crouchAmt); }

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

function updatePlayer(dt) {
  const w = curW();
  const def = w.def;

  // ---- crouch smoothing (vaulting forces a low profile; after a vault
  // the player stays low until there is headroom to stand)
  if (player.forceCrouch && _fitsAt(player.pos, player.pos.y, 0.38, 1.75, G.colliders))
    player.forceCrouch = false;
  const lowWant = (player.crouched || player.vault || player.forceCrouch) ? 1 : 0;
  player.crouchAmt += (lowWant - player.crouchAmt) * Math.min(1, dt * (player.vault ? 14 : 10));

  // ---- sprint & stamina (sprinting breaks an ADS toggle)
  // hysteresis: exhaustion locks sprint until stamina recovers past 0.25,
  // otherwise the drain/regen pair re-arms the gate every frame and sprint
  // flickers on/off forever at stamina 0
  if (player.stamina <= 0) player.winded = true;
  else if (player.stamina >= 0.25) player.winded = false;
  const wantSprint = (keys['ShiftLeft'] || keys['ShiftRight']) && keys['KeyW'] && !player.adsHeld && !firing && !player.crouched;
  if (wantSprint && (!player.winded || player.perks.has('marathon'))) {
    player.sprinting = true;
    player.adsToggle = false;
    if (!player.perks.has('marathon')) player.stamina = Math.max(0, player.stamina - dt / 4.5);
  } else {
    player.sprinting = false;
    player.stamina = Math.min(1, player.stamina + dt / 3);
  }

  // ---- ADS amount (hold RMB or toggle with X)
  const adsActive = player.adsHeld || player.adsToggle;
  const adsTarget = (adsActive && !player.sprinting && player.switchT <= 0) ? 1 : 0;
  const rate = dt / def.adsTime;
  player.adsAmt += THREE.MathUtils.clamp(adsTarget - player.adsAmt, -rate, rate);
  const fovBase = UI.settings.fov;
  G.camera.fov = THREE.MathUtils.lerp(fovBase, fovBase / def.zoom, player.adsAmt);
  G.camera.updateProjectionMatrix();

  // ---- movement
  let ix = 0, iz = 0;
  if (keys['KeyW']) iz -= 1;
  if (keys['KeyS']) iz += 1;
  if (keys['KeyA']) ix -= 1;
  if (keys['KeyD']) ix += 1;
  const ilen = Math.hypot(ix, iz);
  let speed = 5.2 * def.speed;
  if (player.perks.has('lightweight')) speed *= 1.08;
  if (player.sprinting) speed *= 1.42;
  if (player.crouchAmt > 0.5) speed *= 0.55;
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
    if (keys['Space'] && player.onGround) {
      player.vel.y = 5.5;
      player.onGround = false;
    }
    const height = THREE.MathUtils.lerp(1.75, 1.25, player.crouchAmt);
    // step assist: on the ground it climbs low ledges; mid-jump it vaults crate tops
    const stepUp = player.onGround ? 0.55 : (player.vel.y > -3 ? 0.6 : 0);
    player.onGround = moveEntity(player.pos, 0.38, height, vx * dt, player.vel.y * dt, vz * dt, G.colliders, stepUp);
    if (player.onGround && player.vel.y < 0) player.vel.y = 0;
    // airborne movement into a window opening starts an assisted vault
    if (!player.onGround) tryStartVault(vx, vz);
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
  if (player.sinceDamage > 4 && player.hp < 100 && player.hp > 0)
    player.hp = Math.min(100, player.hp + 42 * dt);

  // ---- timers
  if (player.switchT > 0) player.switchT -= dt;
  if (player.meleeT > 0) player.meleeT -= dt;
  if (player.throwT > 0) player.throwT -= dt;
  if (player.stunT > 0) player.stunT -= dt;
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
  const canFire = player.reloadT <= 0 && player.switchT <= 0 && player.meleeT <= 0.5 &&
    player.cooking === null; // the trigger hand is holding a live grenade
  if (canFire && player.fireCooldown <= 0) {
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
  if (player.crouchAmt > 0.5) hip *= 0.8;
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

function firePlayerShot(w) {
  const def = w.def;
  w.mag--;
  noteShot(player);
  AudioSys.shot(def.model, 0);

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
  let anyHit = false, anyKill = false;
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
    let bestT = wall ? wall.dist : 150;
    let hitBot = null, hitHead = false;

    for (const b of G.bots) {
      if (!b.alive || b.team === player.team) continue;
      _bodyBox.min.set(b.pos.x - 0.36, b.pos.y, b.pos.z - 0.36);
      _bodyBox.max.set(b.pos.x + 0.36, b.pos.y + 1.44, b.pos.z + 0.36);
      _headBox.min.set(b.pos.x - 0.2, b.pos.y + 1.44, b.pos.z - 0.2);
      _headBox.max.set(b.pos.x + 0.2, b.pos.y + 1.85, b.pos.z + 0.2);
      _ray.origin.copy(_shotOrigin); _ray.direction.copy(_shotDir);
      const hHit = _ray.intersectBox(_headBox, _hitVec);
      if (hHit) {
        const d = hHit.distanceTo(_shotOrigin);
        if (d < bestT) { bestT = d; hitBot = b; hitHead = true; continue; }
      }
      const bHit = _ray.intersectBox(_bodyBox, _hitVec);
      if (bHit) {
        const d = bHit.distanceTo(_shotOrigin);
        if (d < bestT) { bestT = d; hitBot = b; hitHead = false; }
      }
    }

    const end = _shotEnd.copy(_shotOrigin).addScaledVector(_shotDir, bestT);
    if (pellets === 1 || p % 2 === 0) fxTracer(_muzzleWorld, end);

    if (hitBot) {
      const fall = THREE.MathUtils.clamp((bestT - def.range[0]) / (def.range[1] - def.range[0]), 0, 1);
      let dmg = THREE.MathUtils.lerp(def.dmg, def.minDmg, fall);
      if (hitHead) dmg *= def.head;
      if (player.perks.has('stopping')) dmg *= 1.25;
      const wasAlive = hitBot.alive;
      hitBot.hurt(Math.round(dmg), player, def.name, hitHead);
      fxSpark(end, true);
      anyHit = true;
      if (wasAlive && !hitBot.alive) anyKill = true;
    } else if (wall) {
      fxSpark(end, false);
    }
  }

  if (anyHit) {
    UI.showHitmarker(anyKill);
    if (!anyKill) AudioSys.hit(false);
  }
}

// ============================================================
// Camera & viewmodel per-frame
// ============================================================
let swayT = 0, cookDip = 0;
function updateCameraAndViewmodel(dt) {
  const def = curW().def;
  swayT += dt;

  let yaw = player.yaw, pitch = player.pitch;
  // sniper sway when scoped
  if (player.adsAmt > 0.8 && def.zoom > 3 && !keys['ShiftLeft']) {
    yaw += Math.sin(swayT * 1.7) * 0.0025;
    pitch += Math.sin(swayT * 2.3 + 1) * 0.002;
  }
  G.camera.position.set(player.pos.x, player.pos.y + eyeHeight(), player.pos.z);
  G.camera.rotation.set(pitch, yaw, 0);

  // melee: quick-swap to the knife and slash across the screen — pure lerp
  // keyframes off meleeT; the knife hides exactly when canFire's melee gate
  // (meleeT <= 0.5) reopens, so the gun is never hidden while fireable
  const melee = player.meleeT > 0.5;
  vmKnife.visible = melee;
  if (melee) {
    const t = player.meleeT;
    if (t > 0.8) poseKnife(KNIFE_POSES.start, KNIFE_POSES.windup, (0.9 - t) / 0.1);
    else if (t > 0.62) {
      const u = (0.8 - t) / 0.18;
      poseKnife(KNIFE_POSES.windup, KNIFE_POSES.end, u * u * (3 - 2 * u));
    } else poseKnife(KNIFE_POSES.end, KNIFE_POSES.exit, (0.62 - t) / 0.12);
  }

  // viewmodel position: hip <-> ads, bob, kick
  if (vmGun) {
    const target = new THREE.Vector3().lerpVectors(VM_POS.hip, VM_POS.ads, player.adsAmt);
    if (player.speedNow > 0.5 && player.onGround) {
      bobPhase += dt * (player.sprinting ? 11 : 8);
      const bobAmt = (player.sprinting ? 0.02 : 0.011) * (1 - player.adsAmt * 0.9);
      target.x += Math.sin(bobPhase) * bobAmt;
      target.y += Math.abs(Math.cos(bobPhase)) * bobAmt;
    }
    vmKick = Math.max(0, vmKick - dt * 7);
    target.z += vmKick * 0.05;
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
    // while the knife is out the gun hides lowered, so the return lerp
    // reads as re-raising it
    if (melee) target.y -= 0.3;
    vmGun.position.lerp(target, Math.min(1, dt * 16));
    vmGun.rotation.x = vmKick * 0.09 + (player.sprinting ? -0.5 : 0) - dip * 0.25;
    vmGun.rotation.y = player.sprinting ? 0.4 : 0;
    vmGun.rotation.z = dip * 0.5;
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
      updateTargetName(dt);
    }
    if (G.state === 'dead') {
      player.respawnT -= dt;
      UI.setRespawnCountdown(player.respawnT);
    }

    fxUpdate(dt);
    updateThrowables(dt);
    updateSmokeClouds(dt);
    updateNapalm(dt);
    updateNuke(dt);

    // HUD
    if (player.alive) {
      UI.updateHud(player, curW().def, curW());
      UI.updateScores(G.scores.tf, G.scores.sp, G.timeLeft);
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
  smokeClouds: () => _smokeClouds, smokeBlocked };

UI.init();
UI.show('menu');
loop();
