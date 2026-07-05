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
  pointerLocked: false,
};

const player = {
  isPlayer: true, name: 'YOU', team: 'tf',
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  hp: 100, alive: false, kills: 0, deaths: 0,
  crouched: false, crouchAmt: 0,
  stamina: 1, sprinting: false,
  perks: new Set(),
  weapons: [], cur: 0,
  reloadT: 0, switchT: 0, fireCooldown: 0, burstQueue: 0,
  adsHeld: false, adsToggle: false, adsAmt: 0, bloom: 0,
  meleeT: 0, sinceDamage: 99, respawnT: 0,
  speedNow: 0, onGround: true,
  vault: null, forceCrouch: false,
  lastShotTime: -99,
  _stepT: 0, _killStreakCount: 0, _lastKillTime: -99,
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
  let len = 0.62;
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
    len = 0.57;
  } else if (type === 'lmg') {
    part(0.065, 0.1, 0.7, dark, 0, 0, -0.35);
    part(0.034, 0.034, 0.3, mid, 0, 0.005, -0.83);
    part(0.12, 0.12, 0.1, mid, 0, -0.1, -0.25);          // drum
    part(0.05, 0.08, 0.14, wood, 0, -0.01, 0.04);
    part(0.014, 0.05, 0.02, dark, 0, 0.07, -0.62);
    len = 0.99;
  } else if (type === 'sniper') {
    part(0.05, 0.075, 0.9, dark, 0, 0, -0.45);
    part(0.026, 0.026, 0.32, mid, 0, 0.006, -1.0);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), mat(0x1c1e22));
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.07, -0.3);
    g.add(scope);
    part(0.045, 0.09, 0.2, wood, 0, -0.015, 0.05);
    len = 1.17;
  } else if (type === 'shotgun') {
    part(0.05, 0.08, 0.7, dark, 0, 0, -0.35);
    part(0.03, 0.03, 0.24, mid, 0, -0.045, -0.5);        // tube
    part(0.045, 0.05, 0.14, wood, 0, -0.045, -0.42);     // pump
    part(0.05, 0.075, 0.16, wood, 0, -0.005, 0.03);
    part(0.014, 0.04, 0.02, dark, 0, 0.056, -0.66);
    len = 0.72;
  } else { // pistol
    part(0.04, 0.07, 0.24, dark, 0, 0.03, -0.1);
    part(0.036, 0.13, 0.06, mid, 0, -0.05, -0.02);
    part(0.012, 0.03, 0.015, dark, 0, 0.078, -0.2);
    len = 0.24;
  }
  // muzzle flash quad
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  flash.position.set(0, 0.005, -len);
  flash.visible = false;
  g.add(flash);
  g.userData.flash = flash;
  g.userData.muzzleLocal = new THREE.Vector3(0, 0, -len);
  g.position.copy(VM_POS.hip);
  vmGun = g;
  vmRoot.add(g);
}

// ============================================================
// Effects — pooled tracers & impact sparks
// ============================================================
const FX = { tracers: [], sparks: [] };

function initFxPools(scene) {
  FX.tracers = []; FX.sparks = [];
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
function fxSpark(at, red) {
  const s = FX.sparks.find(s => s.ttl <= 0) || FX.sparks[0];
  s.sp.position.copy(at);
  s.sp.material.color.setHex(red ? 0xd03020 : 0xffffff);
  s.sp.scale.set(0.32, 0.32, 1);
  s.sp.visible = true;
  s.ttl = 0.14;
}
function fxUpdate(dt) {
  for (const t of FX.tracers) if (t.ttl > 0) { t.ttl -= dt; if (t.ttl <= 0) t.line.visible = false; }
  for (const s of FX.sparks) if (s.ttl > 0) {
    s.ttl -= dt;
    s.sp.scale.multiplyScalar(0.88);
    if (s.ttl <= 0) s.sp.visible = false;
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
    } else if (G.time - b.lastShotTime < 1.8) {
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
      if (streakMsg) {
        UI.showKillMsg(hsTag + streakMsg, true);
      } else {
        UI.showKillMsg(hsTag + 'YOU KILLED ' + victim.name, false);
      }
    }
  }
  UI.updateScores(G.scores.tf, G.scores.sp, G.timeLeft);
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
  player.alive = false;
  G.bots = [];

  const world = {
    scene: G.scene, colliders: G.colliders, graph: G.graph,
    api: {
      difficulty: UI.settings.difficulty,
      pickSpawn, getEnemies, registerKill, noteShot, audioPan,
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
  player.reloadT = 0; player.switchT = 0; player.burstQueue = 0;
  player.adsAmt = 0; player.adsToggle = false; player.bloom = 0;
  player.hp = 100;
  player.stamina = 1;
  player.sinceDamage = 99;
  player.vault = null;
  player.forceCrouch = false;
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
    player._killStreakCount = 0; // reset streak on death
    if (attacker) attacker.kills++;
    registerKill(attacker, player, weaponName, headshot);
    if (G.state === 'end') return;
    G.state = 'dead';
    player.respawnT = 3.5;
    document.exitPointerLock && document.exitPointerLock();
    UI.renderSpawnScreen(`KILLED BY ${attacker ? attacker.name : '?'}  [${weaponName}]`);
    UI.show('spawnScreen');
  }
}

function endMatch() {
  if (G.state === 'end') return;
  G.state = 'end';
  document.exitPointerLock && document.exitPointerLock();
  const win = G.scores.tf === G.scores.sp ? null : G.scores.tf > G.scores.sp;
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
  const s = 0.0021 * UI.settings.sens * fovScale;
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
  if (e.code === 'KeyX') player.adsToggle = !player.adsToggle;
});
document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Tab') UI.$('scoreboard').classList.add('hidden');
});
// Losing window focus never fires keyup/mouseup, so held inputs would stick
// (e.g. alt-tab while holding W = infinite auto-run). Clear everything on blur.
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  firing = false;
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
  const wantSprint = keys['ShiftLeft'] && keys['KeyW'] && !player.adsHeld && !firing && !player.crouched;
  if (wantSprint && (player.stamina > 0 || player.perks.has('marathon'))) {
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
  const canFire = player.reloadT <= 0 && player.switchT <= 0 && player.meleeT <= 0.5;
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
  muzzleLight.intensity = 2.2;
  if (vmGun) {
    vmGun.userData.flash.visible = true;
    vmGun.userData.flash.rotation.z = Math.random() * 3;
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
let swayT = 0;
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
    vmGun.position.lerp(target, Math.min(1, dt * 16));
    vmGun.rotation.x = vmKick * 0.09 + (player.sprinting ? -0.5 : 0);
    vmGun.rotation.y = player.sprinting ? 0.4 : 0;
    // hide gun when fully scoped
    const scoped = player.adsAmt > 0.85 && def.zoom > 3;
    vmGun.visible = !scoped;
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
    if (h && h.distanceTo(origin) < maxT) { found = b; break; }
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
  }

  if (G.scene) {
    if (player.alive || G.state === 'dead') updateCameraAndViewmodel(live ? dt : 0);
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

window.DEBUG = { G, player, startMatch, deploy };

UI.init();
UI.show('menu');
loop();
