// ============================================================
// Soldier models + bot AI.
// Bots patrol the waypoint graph, engage on line of sight, fire
// in bursts with skill-based hit chances, and respawn on a timer.
// ============================================================

const TEAM_COLORS = {
  tf: { uniform: 0x5a6248, vest: 0x3a4034, helmet: 0x4a5040, band: 0x4a90d0, skin: 0xc8a080 },
  sp: { uniform: 0x6a564a, vest: 0x453832, helmet: 0x5a3a32, band: 0xd05040, skin: 0xd0aa88 },
};

const FFA_PALETTE = [
  { uniform: 0x5c6b58, vest: 0x394235, helmet: 0x4b5748, band: 0xe8a33d, skin: 0xc8a080 },
  { uniform: 0x4f5e72, vest: 0x303845, helmet: 0x3c4656, band: 0x8ec4f0, skin: 0xd0aa88 },
  { uniform: 0x6f5a52, vest: 0x473936, helmet: 0x5a4944, band: 0xf09a8e, skin: 0xc89270 },
  { uniform: 0x59605f, vest: 0x383d3d, helmet: 0x454c4c, band: 0x9ad08e, skin: 0xd3a57f },
  { uniform: 0x655b75, vest: 0x40384b, helmet: 0x51465f, band: 0xcaa0ff, skin: 0xc8a080 },
  { uniform: 0x706348, vest: 0x473e2f, helmet: 0x5a503b, band: 0xf0d06a, skin: 0xd0aa88 },
];

const BOT_MOVE = {
  standHeight: 1.7,
  crouchHeight: 1.25,
  proneHeight: 0.65,
  standHit: 1.85,
  crouchHit: 1.35,
  proneHit: 0.72,
  sprintMult: 1.35,
  crouchMult: 0.58,
  proneMult: 0.35,
};

function entityChestY(ent) {
  if (ent && typeof ent.bodyHeight === 'function') return ent.pos.y + Math.max(0.38, ent.bodyHeight() * 0.68);
  if (ent && typeof ent.proneAmt === 'number') {
    const h = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.75, 1.25, ent.crouchAmt || 0), 0.6, ent.proneAmt || 0);
    return ent.pos.y + Math.max(0.35, h * 0.68);
  }
  return ent.pos.y + (ent && ent.prone ? 0.45 : ent && ent.crouched ? 0.9 : 1.2);
}

function teamColors(team) {
  if (TEAM_COLORS[team]) return TEAM_COLORS[team];
  let h = 0;
  for (let i = 0; i < team.length; i++) h = (h * 31 + team.charCodeAt(i)) >>> 0;
  return FFA_PALETTE[h % FFA_PALETTE.length];
}

function helmetColorForTeam(team) {
  if (typeof player !== 'undefined' && player.team && team === player.team) return 0x2468d8;
  return 0xc83232;
}

function makeNameSprite(name, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 48;
  const cx = cv.getContext('2d');
  cx.font = 'bold 26px Arial';
  cx.textAlign = 'center';
  cx.fillStyle = 'rgba(0,0,0,0.45)';
  const w = cx.measureText(name).width + 16;
  cx.fillRect(128 - w / 2, 6, w, 34);
  cx.fillStyle = color;
  cx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(1.7, 0.32, 1);
  sp.position.y = 2.05;
  return sp;
}

function soldierWeaponDef(ref) {
  if (!ref || typeof WEAPONS === 'undefined') return null;
  if (WEAPONS[ref]) return WEAPONS[ref];
  for (const key in WEAPONS)
    if (WEAPONS[key].name === ref) return WEAPONS[key];
  return null;
}

// Third-person held gun. Most of the legacy arsenal retains the compact
// generic silhouette, but the AK has a keyed Type 3 model so bots and the true
// kill-cam replay show the actual weapon used instead of a universal black box.
function buildSoldierWeaponMesh(ref) {
  const def = soldierWeaponDef(ref);
  const key = def ? def.key : '';
  const g = new THREE.Group();
  g.position.set(0, 1.3, 0.55);
  const mat = col => new THREE.MeshLambertMaterial({ color: col });
  const part = (w, h, d, col, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(col));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  if (key === 'ak47') {
    const steel = 0x24272a, steelHi = 0x34383b;
    const wood = 0x7d351f, woodDark = 0x562416;
    part(0.1, 0.14, 0.42, steel, 0, 0, -0.05);       // milled receiver
    part(0.085, 0.06, 0.32, steelHi, 0, 0.075, -0.04); // smooth cover
    part(0.11, 0.13, 0.28, wood, 0, -0.015, 0.3);    // handguard
    part(0.055, 0.055, 0.3, steelHi, 0, 0.035, 0.48); // gas tube
    part(0.04, 0.04, 0.42, steelHi, 0, 0.005, 0.67); // barrel
    part(0.055, 0.055, 0.09, steel, 0, 0.005, 0.91); // thread protector
    part(0.12, 0.16, 0.34, wood, 0, -0.005, -0.42);  // fixed stock
    const grip = part(0.065, 0.16, 0.065, woodDark, 0, -0.12, -0.14);
    grip.rotation.x = 0.2;
    for (const [y, z, rx] of [[-0.11, -0.06, -0.08], [-0.17, -0.03, -0.22], [-0.23, 0.02, -0.38]]) {
      const mag = part(0.075, 0.09, 0.1, steel, 0, y, z);
      mag.rotation.x = rx;
    }
    for (const y of [-0.14, -0.19, -0.24]) part(0.082, 0.012, 0.11, 0x151719, 0, y, 0);
    // Forward tangent notch + distant protected post, kept visible in replay.
    part(0.07, 0.035, 0.14, steel, 0, 0.105, 0.16);
    part(0.02, 0.08, 0.025, steel, -0.035, 0.105, 0.77);
    part(0.02, 0.08, 0.025, steel, 0.035, 0.105, 0.77);
    part(0.012, 0.07, 0.018, 0x111315, 0, 0.105, 0.77);
  } else {
    part(0.09, 0.14, 0.85, 0x22252a, 0, 0, 0);
  }
  g.userData.weaponKey = key;
  return g;
}

function setSoldierWeapon(mesh, ref) {
  if (!mesh || !mesh.userData || !mesh.userData.body) return;
  const def = soldierWeaponDef(ref);
  const key = def ? def.key : '';
  if (mesh.userData.weaponKey === key && mesh.userData.gun) return;
  if (mesh.userData.gun) mesh.userData.body.remove(mesh.userData.gun);
  const gun = buildSoldierWeaponMesh(ref);
  mesh.userData.body.add(gun);
  mesh.userData.gun = gun;
  mesh.userData.weaponKey = key;
}

// Blocky soldier, origin at feet, facing +Z
function buildSoldierMesh(team, name, showTag, weaponRef = null) {
  const c = Object.assign({}, teamColors(team), { helmet: helmetColorForTeam(team) });
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const mat = col => new THREE.MeshLambertMaterial({ color: col });
  const part = (w, h, d, col, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(col));
    m.position.set(x, y, z);
    m.castShadow = true;
    body.add(m);
    return m;
  };
  // legs pivot at hip
  const mkLeg = x => {
    const geo = new THREE.BoxGeometry(0.26, 0.75, 0.3);
    geo.translate(0, -0.375, 0);
    const m = new THREE.Mesh(geo, mat(c.vest));
    m.position.set(x, 0.75, 0);
    m.castShadow = true;
    body.add(m);
    return m;
  };
  const legL = mkLeg(-0.16), legR = mkLeg(0.16);
  part(0.64, 0.65, 0.36, c.uniform, 0, 1.075, 0);          // torso
  part(0.2, 0.14, 0.38, c.band, -0.32, 1.28, 0);           // shoulder band
  part(0.3, 0.3, 0.28, c.skin, 0, 1.56, 0);                // head
  part(0.38, 0.16, 0.36, c.helmet, 0, 1.75, 0);            // helmet
  part(0.16, 0.16, 0.55, c.uniform, -0.24, 1.25, 0.3);     // arms forward
  part(0.16, 0.16, 0.45, c.uniform, 0.22, 1.28, 0.32);
  const gun = buildSoldierWeaponMesh(weaponRef);
  body.add(gun);
  // muzzle flash sprite
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  flash.position.set(0, 1.3, 1.05);
  flash.visible = false;
  body.add(flash);
  if (showTag) g.add(makeNameSprite(name, '#7ab4f0'));
  g.userData = { body, legL, legR, gun, flash,
    weaponKey: gun.userData.weaponKey };
  return g;
}

// Per-tier combat knobs beyond the classic four (acc/react/burst/view),
// all consumed in _fireShot / the burst logic — these used to be flat
// constants shared by every tier:
//   head    — headshot chance per landed hit (×w.head damage)
//   dmg     — global damage multiplier (the old flat ×0.8 nerf; veterans
//             hit for full weapon damage)
//   movePen — hit-chance multiplier vs a fast target (>4 m/s); high tiers
//             track a strafing player instead of whiffing
//   fall    — distance divisor in the hit-chance falloff clamp; bigger
//             stays lethal further out
//   scatter — miss-tracer jitter scale; small = misses read as grazes
//   pause   — burst pause [min,max] seconds (uptime between bursts)
//   lost    — seconds a lost target stays engaged before dropping to patrol
//   tactics — opportunistic cover/flank pathing while in combat
const BOT_SKILL = {
  recruit:  { acc: 0.10, react: 850, burst: [2, 5],  view: 38, head: 0.05, dmg: 0.8, movePen: 0.65, fall: 40, scatter: 1.4, pause: [0.60, 1.40], lost: 2.0 },
  regular:  { acc: 0.17, react: 550, burst: [3, 6],  view: 45, head: 0.10, dmg: 0.8, movePen: 0.72, fall: 45, scatter: 1.0, pause: [0.45, 1.05], lost: 2.5 },
  hardened: { acc: 0.30, react: 300, burst: [5, 9],  view: 55, head: 0.18, dmg: 0.9, movePen: 0.82, fall: 55, scatter: 0.6, pause: [0.30, 0.70], lost: 3.5 },
  veteran:  { acc: 0.60, react: 150, burst: [8, 14], view: 70, head: 0.30, dmg: 1.0, movePen: 0.92, fall: 70, scatter: 0.3, pause: [0.15, 0.40], lost: 5.0, tactics: true },
};

let _botCounter = 0;

class Bot {
  // world: { scene, colliders, graph, api: { registerKill, getEnemies, pickSpawn,
  //          tracer, playerDamage, playerPos, difficulty } }
  constructor(name, team, world) {
    this.name = name;
    this.team = team;
    this.world = world;
    this.isPlayer = false;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.lastShotTime = -99; // minimap does G.time - lastShotTime; keep it a number pre-first-shot
    this.velY = 0;
    this.onGround = true;
    this.alive = false;
    this.hp = 100;
    this.kills = 0; this.deaths = 0; this.assists = 0;
    this.recentDamagers = []; // #16d: enemy hits this life (assist source)
    this.speedNow = 0;
    this.crouched = false;
    this.prone = false;
    this.sprinting = false;
    this.crouchAmt = 0;
    this.proneAmt = 0;
    this.stanceT = 0;

    const lo = BOT_LOADOUTS[Math.floor(Math.random() * BOT_LOADOUTS.length)];
    this.weapon = WEAPONS[lo.primary];
    this.magLeft = this.weapon.mag;
    this.reloadT = 0;
    this.lethal = lo.lethal || null; // #16b: throwable pick (frag or none)
    this.grenLeft = 0;   // grenades left this life (reset in spawn)
    this.grenCdT = 0;    // throw cooldown / initial arm delay

    const difficulty = world.api.difficultyForTeam ? world.api.difficultyForTeam(team) : world.api.difficulty;
    const s = BOT_SKILL[difficulty] || BOT_SKILL.regular;
    this.difficulty = difficulty || 'regular';
    const v = 0.8 + Math.random() * 0.4;
    this.skill = { ...s, acc: s.acc * v, react: s.react / v };

    this.mesh = buildSoldierMesh(team, name, team === 'tf', this.weapon.key);
    this.mesh.visible = false;
    world.scene.add(this.mesh);

    // AI state
    this.path = null; this.pathIdx = 0;
    this.target = null;
    this.reactT = 0;
    this.shotT = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.strafeDir = 1; this.strafeT = 0;
    this.lastKnown = null; this.lostT = 0;
    this.canSee = false;
    this.combatPath = null; this.combatPathIdx = 0;
    this.tacticT = 0; this.tacticKind = null;
    this.scanT = Math.random() * 0.15;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.lastUnstickWp = -1; this.unstickN = 0;
    this.wanderT = 0; this.wanderDir = { x: 0, z: 0 };
    this.respawnT = 1 + Math.random() * 2;
    this.deathAnimT = 0;
    this.walkPhase = Math.random() * 10;
    this.flashT = 0;
    this._stepT = 0;
    this.stunT = 0; // stun grenade: frozen while > 0
    this.dazeT = 0; // ...and accuracy stays blown until this runs out
    this.blindT = 0; // P48 flashbang: whiteout — perceiving nothing while > 0
    this.spawnProtectT = 0; // #18a: spawn invuln window, set on spawn()
  }

  bodyHeight() {
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(BOT_MOVE.standHeight, BOT_MOVE.crouchHeight, this.crouchAmt),
      BOT_MOVE.proneHeight,
      this.proneAmt);
  }

  hitHeight() {
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(BOT_MOVE.standHit, BOT_MOVE.crouchHit, this.crouchAmt),
      BOT_MOVE.proneHit,
      this.proneAmt);
  }

  _canUseHeight(height) {
    return typeof _fitsAt !== 'function' || _fitsAt(this.pos, this.pos.y, 0.38, height, this.world.colliders);
  }

  _setMovementAbility(kind) {
    if (kind === 'prone') {
      this.prone = true;
      this.crouched = false;
      this.sprinting = false;
    } else if (kind === 'crouch') {
      if (!this._canUseHeight(BOT_MOVE.crouchHeight)) return;
      this.prone = false;
      this.crouched = true;
      this.sprinting = false;
    } else {
      if (!this._canUseHeight(BOT_MOVE.standHeight)) return;
      this.prone = false;
      this.crouched = false;
      this.sprinting = kind === 'sprint';
    }
  }

  _updateMovementAbility(dt, moveLen, dist) {
    this.stanceT -= dt;
    let next = 'stand';
    const moving = moveLen > 0.25;
    if (this.target && this.target.alive) {
      const visibleCombat = this.canSee || (this.blindT > 0 && this.lastKnown);
      if (!visibleCombat && this.lastKnown && moving) next = 'sprint';
      else if (this.reloadT > 0.35 || this.tacticKind === 'cover') next = 'crouch';
      else if (visibleCombat && dist > 16 && !moving &&
               (this.weapon.model === 'sniper' || this.weapon.model === 'lmg')) next = 'prone';
      else if (visibleCombat && !moving && dist > 8) next = 'crouch';
      else next = 'stand';
    } else if (this.lastKnown && moving) {
      next = 'sprint';
    }
    if (next !== 'sprint' && this.sprinting) this.sprinting = false;
    if (this.stanceT <= 0 || next === 'sprint' || this.prone || this.crouched) {
      this._setMovementAbility(next);
      this.stanceT = next === 'prone' ? 1.1 : next === 'crouch' ? 0.7 : 0.35;
    }
  }

  _updatePose(dt) {
    const cWant = this.crouched ? 1 : 0;
    const pWant = this.prone ? 1 : 0;
    this.crouchAmt += (cWant - this.crouchAmt) * Math.min(1, dt * 10);
    this.proneAmt += (pWant - this.proneAmt) * Math.min(1, dt * 8);
    const body = this.mesh.userData.body;
    if (body) {
      const yScale = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1, 0.73, this.crouchAmt), 0.36, this.proneAmt);
      const zScale = THREE.MathUtils.lerp(1, 1.35, this.proneAmt);
      body.scale.set(1, yScale, zScale);
    }
    this.mesh.userData.botPose = {
      crouched: this.crouched,
      prone: this.prone,
      sprinting: this.sprinting,
      bodyHeight: this.bodyHeight(),
      hitHeight: this.hitHeight(),
    };
  }

  spawn() {
    const p = this.world.api.pickSpawn(this.team);
    this.pos.copy(p);
    // face the map center rather than whatever yaw we died holding
    this.yaw = Math.atan2(-p.x, -p.z);
    this.pitch = 0;
    this.velY = 0;
    this.onGround = true;
    this.crouched = false; this.prone = false; this.sprinting = false;
    this.crouchAmt = 0; this.proneAmt = 0; this.stanceT = 0;
    this.hp = 100;
    this.alive = true;
    this._looted = false; // #6: fresh corpse can be looted again by SCAVENGER
    if (this.world.api.prepareBotSpawn) this.world.api.prepareBotSpawn(this);
    this.magLeft = this.weapon.mag;
    this.reloadT = 0;
    this.target = null; this.lastKnown = null;
    this.lastShotTime = -99; // don't let a pre-death shot flash our new spot on the minimap
    this.pingedUntil = 0; // P51: a snapshot mark dies with the marked life
    this.path = null; this.combatPath = null; this.tacticKind = null;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, this.yaw, 0);
    this.mesh.position.copy(this.pos);
    this.lastPos.copy(this.pos);
    this.stuckT = 0;
    this.stunT = 0; this.dazeT = 0; this.blindT = 0; // death clears the stars (and the whiteout)
    this.spawnProtectT = 3; // #18a: 3 s spawn invuln, cancelled by firing
    // #16b: one frag per life, with a short arm delay so a bot doesn't lob
    // off the spawn instantly
    this.grenLeft = this.lethal ? 1 : 0;
    this.grenCdT = 3 + Math.random() * 3;
    this.recentDamagers.length = 0; // #16d: fresh life clears assist sources
  }

  // A shot rang out: enemies within earshot learn the shooter's position
  // and go investigate. Walls muffle — a blocked line halves the radius.
  hearShot(shooter, radius) {
    if (!this.alive || shooter === this || shooter.team === this.team) return;
    // P61: jammed comms cut the radio — no lastKnown intel from gunfire
    // or explosions while the jam holds. Eyes still work (the vision
    // loop) and getting shot still reveals the attacker (hurt()).
    if (this.world.api.commsJammed && this.world.api.commsJammed(this)) return;
    const d = this.pos.distanceTo(shooter.pos);
    if (d > radius) return;
    if (d > radius * 0.5) {
      const ear = new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z);
      const src = new THREE.Vector3(shooter.pos.x, entityChestY(shooter), shooter.pos.z);
      if (!losClear(ear, src, this.world.colliders)) return;
    }
    // re-path only toward a genuinely new position — automatics call this
    // ~10×/s and re-rolling the path every shot would jitter and cost
    const fresh = !this.lastKnown || this.lastKnown.distanceTo(shooter.pos) > 4;
    this.lastKnown = shooter.pos.clone();
    if (fresh && !this.target) this.path = null;
  }

  // A stun grenade got them: aim and movement freeze while stunT runs,
  // and accuracy stays blown (dazeT, see _fireShot) for a beat after
  // they can move again — recovering, not instantly back to laser aim.
  stun(dur) {
    if (!this.alive) return;
    this.stunT = Math.max(this.stunT, dur);
    this.dazeT = Math.max(this.dazeT, dur + 2);
  }

  // P48: a flashbang got them: the world is white. blindT gates the
  // perception scan — no fresh acquisitions, canSee forced false — so an
  // engaged bot keeps its target but falls back to spraying blind at
  // lastKnown; accuracy stays blown (dazeT) while they blink it off.
  // Movement and turning stay whole: flash denies information, not legs.
  flash(dur) {
    if (!this.alive) return;
    this.blindT = Math.max(this.blindT, dur);
    this.dazeT = Math.max(this.dazeT, dur + 2);
  }

  hurt(dmg, attacker, weaponName, headshot, bypassProtect) {
    if (!this.alive) return false;
    if (this.spawnProtectT > 0 && !bypassProtect) return false; // #18a spawn invuln
    this.hp -= dmg;
    this.world.api.recordDamage(this, attacker); // #16d: assist tracking
    // getting shot reveals the attacker
    if (attacker && attacker.team !== this.team && attacker.alive) {
      this.lastKnown = attacker.pos.clone();
      if (!this.target) this.reactT = this.skill.react * 0.5 / 1000; // react is ms
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.deaths++;
      if (attacker) attacker.kills++;
      this.respawnT = 4;
      this.deathAnimT = 2.2;
      if (this.world.api.noteReplayDeath) this.world.api.noteReplayDeath(this);
      this.world.api.registerKill(attacker, this, weaponName, headshot);
    }
    return true;
  }

  _pickNewPath() {
    const g = this.world.graph;
    if (!g.points.length) return;
    const from = nearestWaypoint(g, this.pos, this.world.colliders);
    let to;
    if (this.lastKnown && Math.random() < 0.75) {
      to = nearestWaypoint(g, this.lastKnown, this.world.colliders);
    } else {
      to = Math.floor(Math.random() * g.points.length);
    }
    const path = navPath(g, from, to);
    this.path = path;
    // walk to the entry waypoint first unless already standing on it —
    // heading straight for the second node can cut through geometry
    this.pathIdx = (path && path.length > 1 && this.pos.distanceTo(g.points[from]) < 1.1) ? 1 : 0;
  }

  _setCombatPath(to, kind) {
    const g = this.world.graph;
    const from = nearestWaypoint(g, this.pos, this.world.colliders);
    const path = navPath(g, from, to);
    if (!path || path.length < 2) return false;
    this.combatPath = path;
    this.combatPathIdx = this.pos.distanceTo(g.points[from]) < 1.1 ? 1 : 0;
    this.tacticKind = kind;
    return true;
  }

  _pickVeteranTactic(kind) {
    const g = this.world.graph;
    const targetPos = this.target && this.target.alive ? this.target.pos : this.lastKnown;
    if (!this.skill.tactics || !targetPos || !g.points.length) return false;

    const from = nearestWaypoint(g, this.pos, this.world.colliders);
    const targetChest = new THREE.Vector3(targetPos.x, targetPos.y + 1.2, targetPos.z);
    const botFromTarget = new THREE.Vector2(this.pos.x - targetPos.x, this.pos.z - targetPos.z);
    if (botFromTarget.lengthSq() < 0.001) botFromTarget.set(0, 1);
    botFromTarget.normalize();

    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < g.points.length; i++) {
      if (i === from) continue;
      const p = g.points[i];
      if (p.y > 0.75) continue; // keep combat tactics grounded and predictable
      const selfD = this.pos.distanceTo(p);
      if (selfD < 2.5 || selfD > 18) continue;
      const targetD = targetChest.distanceTo(new THREE.Vector3(p.x, p.y + 1.2, p.z));
      if (targetD < 4 || targetD > this.skill.view) continue;

      const eye = new THREE.Vector3(p.x, p.y + 1.6, p.z);
      const targetSees = losClear(targetChest, eye, this.world.colliders) &&
        !this.world.api.smokeBlocked(targetChest, eye);
      const seesTarget = losClear(eye, targetChest, this.world.colliders) &&
        !this.world.api.smokeBlocked(eye, targetChest);

      const rel = new THREE.Vector2(p.x - targetPos.x, p.z - targetPos.z).normalize();
      const lateral = Math.abs(botFromTarget.x * rel.y - botFromTarget.y * rel.x);
      const path = navPath(g, from, i);
      if (!path || path.length < 2 || path.length > 8) continue;

      let score = -Infinity;
      if (kind === 'cover') {
        if (!targetSees) score = 9 - selfD * 0.25 + Math.min(targetD, 18) * 0.08 + Math.random();
      } else {
        if (seesTarget && lateral > 0.42) score = lateral * 8 - selfD * 0.22 - path.length * 0.2 + Math.random();
      }
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best >= 0 && this._setCombatPath(best, kind);
  }

  _updateVeteranTactic(dt, dist) {
    if (!this.skill.tactics || !this.target || !this.target.alive) return;
    if (this.combatPath && this.combatPathIdx < this.combatPath.length) return;
    this.combatPath = null; this.tacticKind = null;
    this.tacticT -= dt;
    if (this.tacticT > 0) return;

    const needsCover = this.reloadT > 0.35 || this.hp < 45 || (!this.canSee && this.lastKnown);
    const shouldFlank = this.canSee && dist > 7 && dist < 42 && Math.random() < 0.65;
    if (needsCover && this._pickVeteranTactic('cover')) {
      this.tacticT = 1.0 + Math.random() * 0.6;
    } else if (shouldFlank && this._pickVeteranTactic('flank')) {
      this.tacticT = 2.0 + Math.random() * 1.4;
    } else {
      this.tacticT = 0.7 + Math.random() * 0.8;
    }
  }

  // Stuck against geometry: pull back onto the graph by walking straight
  // at a nearby visible waypoint instead of re-rolling the same path.
  // Rotates among a few candidates because "visible" is a zero-width ray:
  // a snag dead-ahead (post edge, low furniture) can block the body while
  // LOS stays clear, so retrying the same waypoint would loop forever.
  _unstick() {
    this.path = null;
    if (this.target && this.target.alive) return; // combat strafing self-corrects
    const g = this.world.graph;
    if (!g.points.length) return;
    if (this.unstickN >= 2) {
      // straight walks at visible waypoints keep clipping the same snag
      // (all candidates can be collinear, e.g. a corridor) — wander a
      // random direction instead until some angle slides the bot free
      const a = Math.random() * Math.PI * 2;
      this.wanderDir = { x: Math.sin(a), z: Math.cos(a) };
      this.wanderT = 0.4 + Math.random() * 0.5;
      return;
    }
    let cands = visibleWaypoints(g, this.pos, this.world.colliders, 4);
    if (cands.length > 1) cands = cands.filter(i => i !== this.lastUnstickWp);
    const wp = cands.length ? cands[Math.floor(Math.random() * cands.length)]
                            : nearestWaypoint(g, this.pos);
    this.lastUnstickWp = wp;
    this.path = [wp];
    this.pathIdx = 0;
  }

  _scanForTarget() {
    // P48: flashed — perceive nothing. Keep the current target (the
    // engagement survives the blink) but canSee goes false, which routes
    // the combat block to blind-spraying at lastKnown. lostT doesn't
    // grow here: the loss clock starts when the eyes come back.
    if (this.blindT > 0) { this.canSee = false; return; }
    const enemies = this.world.api.getEnemies(this.team);
    let best = null, bestD = Infinity;
    const eye = new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z);
    const chest = new THREE.Vector3();
    for (const e of enemies) {
      if (!e.alive) continue;
      let view = this.skill.view;
      if (e.isPlayer && e.perks && e.perks.has('coldblooded')) view *= 0.7;
      const d = this.pos.distanceTo(e.pos);
      if (d > view) continue;
      // field of view check (ignored if enemy is very close or hurt us recently)
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const angTo = Math.atan2(dx, dz);
      let diff = Math.abs(angTo - this.yaw) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      const isKnown = this.lastKnown && e.pos.distanceTo(this.lastKnown) < 6;
      if (d > 4 && diff > 1.05 && !isKnown) continue;
      chest.set(e.pos.x, entityChestY(e), e.pos.z);
      if (!losClear(eye, chest, this.world.colliders)) continue;
      if (this.world.api.smokeBlocked(eye, chest)) continue; // smoke is opaque
      if (d < bestD) { bestD = d; best = e; }
    }
    this.canSee = !!best;
    if (best) {
      if (this.target !== best) {
        let react = this.skill.react;
        if (best.isPlayer && best.perks && best.perks.has('ninja')) react *= 1.4;
        this.reactT = Math.max(this.reactT, react / 1000 * (0.75 + Math.random() * 0.5));
        this.target = best;
      }
      this.lastKnown = best.pos.clone();
      this.lostT = 0;
    } else if (this.target) {
      this.lostT += 0.15;
      // high tiers hold the engagement on a lost target longer before
      // shrugging and going back to patrol
      if (this.lostT > this.skill.lost) { this.target = null; this.path = null; }
    }
  }

  _fireShot() {
    const w = this.weapon;
    const t = this.target;
    if (!t || !t.alive) return;
    this.spawnProtectT = 0; // #18a: firing ends this bot's spawn invuln
    // P48: a blinded bot shoots at where it LAST SAW the target, not at
    // the live position — every aim/LOS/hit computation below anchors on
    // `tp`. A hit can only land if the target actually stayed near that
    // spot (checked after the roll); otherwise the burst is pure spray.
    const blindAim = this.blindT > 0 && this.lastKnown ? this.lastKnown : null;
    const tp = blindAim || t.pos;
    const dist = this.pos.distanceTo(tp);
    const muzzle = new THREE.Vector3(this.pos.x, this.pos.y + 1.45, this.pos.z);

    // hard wall check per shot — a blocked line of fire can never damage;
    // smoke counts (a target lost in smoke gets sprayed at, never hit)
    const chestCheck = new THREE.Vector3(tp.x, entityChestY(t), tp.z);
    const blocked = !losClear(muzzle, chestCheck, this.world.colliders) ||
      this.world.api.smokeBlocked(muzzle, chestCheck);

    // P76: Gun Game's final tomahawk tier is a close-range thrown weapon,
    // not a generic hitscan firearm. Bots must push in and make a risky,
    // readable throw instead of sniping with the axe definition.
    if (w.throwWeapon) {
      if (dist > 11 || blocked) return;
      let chance = this.skill.acc * THREE.MathUtils.clamp(1.15 - dist / 13, 0.08, 0.65);
      if (t.speedNow > 4) chance *= this.skill.movePen;
      if (this.dazeT > 0) chance *= 0.2;
      const hit = Math.random() < chance && (!blindAim || t.pos.distanceTo(blindAim) < 1.5);
      const aim = new THREE.Vector3(tp.x, entityChestY(t), tp.z);
      if (!hit) {
        aim.x += (Math.random() - 0.5) * 2.2;
        aim.y += (Math.random() - 0.25) * 1.2;
        aim.z += (Math.random() - 0.5) * 2.2;
      }
      this.world.api.tracer(muzzle, aim);
      AudioSys.throwWhoosh();
      if (hit) {
        if (t.isPlayer) this.world.api.playerDamage(150, this, w.name, false, false, { origin: muzzle.clone(), aim: aim.clone() });
        else t.hurt(150, this, w.name, false);
      }
      this.magLeft--;
      if (this.magLeft <= 0) {
        this.reloadT = w.reload;
        this.magLeft = w.mag;
        this.burstLeft = 0;
      }
      return;
    }

    // skill roll — falloff distance, moving-target penalty, headshot rate
    // and the damage multiplier all come off the tier (see BOT_SKILL)
    let chance = this.skill.acc * THREE.MathUtils.clamp(1.55 - dist / this.skill.fall, 0.25, 1.2);
    if (t.speedNow > 4) chance *= this.skill.movePen;
    if (t.prone) chance *= 0.55;      // flat on the deck: hardest target
    else if (t.crouched) chance *= 0.85;
    if (w.model === 'sniper') chance *= 1.25;
    if (this.dazeT > 0) chance *= 0.25; // stun aftermath: can barely aim
    const hit = !blocked && Math.random() < chance &&
      (!blindAim || t.pos.distanceTo(blindAim) < 2); // P48: moved off the spot = unhittable while blind

    // damage with falloff
    const fall = THREE.MathUtils.clamp((dist - w.range[0]) / (w.range[1] - w.range[0]), 0, 1);
    let dmg = THREE.MathUtils.lerp(w.dmg, w.minDmg, fall) * this.skill.dmg;
    if (w.pellets) dmg *= w.pellets * 0.5;
    const headshot = hit && Math.random() < this.skill.head;
    if (headshot) dmg *= w.head;

    // tracer: to the chest if hit, offset if missed — high tiers scatter
    // tight, so even their misses crack close (blind spray anchors on tp)
    const aim = new THREE.Vector3(tp.x, entityChestY(t), tp.z);
    if (!hit) {
      const sc = this.skill.scatter;
      aim.x += (Math.random() - 0.5) * 2.4 * sc;
      aim.y += (Math.random() - 0.3) * 1.6 * sc;
      aim.z += (Math.random() - 0.5) * 2.4 * sc;
    }
    const dir = aim.clone().sub(muzzle).normalize();
    this.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    const wallHit = rayWorld(muzzle, dir, muzzle.distanceTo(aim) + 2, this.world.colliders);
    const end = (wallHit && wallHit.dist < muzzle.distanceTo(aim) - 0.5) ? wallHit.point : aim;
    this.world.api.tracer(muzzle, end);
    this.flashT = 0.05;

    AudioSys.shot(w.audio || w.model, this.pos.distanceTo(this.world.api.playerPos()),
      this.world.api.audioPan(this.pos), w.suppressed); // P55: scaffolding — bot defs carry no attachments today
    this.world.api.noteShot(this);

    if (hit) {
      if (t.isPlayer) this.world.api.playerDamage(Math.round(dmg), this, w.name, headshot, false, { origin: muzzle.clone(), aim: aim.clone() });
      else t.hurt(Math.round(dmg), this, w.name, headshot);
    }

    this.magLeft--;
    if (this.magLeft <= 0) {
      this.reloadT = w.reload; // per-weapon reload, same rule as the player
      this.magLeft = w.mag;
      this.burstLeft = 0;
    }
  }

  update(dt) {
    const ud = this.mesh.userData;

    // ---- dead: play fall anim, wait for respawn
    if (!this.alive) {
      if (this.deathAnimT > 0) {
        this.deathAnimT -= dt;
        this.mesh.rotation.x = Math.max(this.mesh.rotation.x - dt * 7, -Math.PI / 2);
        if (this.deathAnimT <= 0) this.mesh.visible = false;
      }
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.world.api.matchLive() &&
          (!this.world.api.canRespawn || this.world.api.canRespawn())) this.spawn();
      return;
    }

    // ---- spawn invulnerability (#18a): tick even while stunned so the
    // window can't be extended by getting flashed right off the spawn
    if (this.spawnProtectT > 0) this.spawnProtectT -= dt;

    // ---- stunned: frozen in place — no turning, moving, perceiving or
    // firing; gravity still applies so a stunned bot doesn't hover
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.velY -= 13 * dt;
      this._updatePose(dt);
      this.onGround = moveEntity(this.pos, 0.38, this.bodyHeight(), 0, this.velY * dt, 0,
        this.world.colliders, 0);
      if (this.onGround && this.velY < 0) this.velY = 0;
      this.speedNow = 0;
      if (this.flashT > 0) { this.flashT -= dt; ud.flash.visible = this.flashT > 0; }
      // P53: daze/blind clocks keep running while stunned — the early return
      // below must not extend their real-world duration past the design window
      if (this.dazeT > 0) this.dazeT -= dt;
      if (this.blindT > 0) this.blindT -= dt;
      this.mesh.position.copy(this.pos);
      ud.legL.rotation.x *= 0.8;
      ud.legR.rotation.x *= 0.8;
      return;
    }
    if (this.dazeT > 0) this.dazeT -= dt;
    if (this.blindT > 0) this.blindT -= dt; // P48: blinking the flash off

    // ---- perception (staggered)
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.15; this._scanForTarget(); }

    if (this.reactT > 0) this.reactT -= dt;
    if (this.reloadT > 0) this.reloadT -= dt;
    if (this.grenCdT > 0) this.grenCdT -= dt; // #16b throw cooldown
    if (this.flashT > 0) { this.flashT -= dt; ud.flash.visible = this.flashT > 0; ud.flash.rotation.z = Math.random() * Math.PI * 2; }

    const w = this.weapon;
    let moveX = 0, moveZ = 0, wantYaw = this.yaw;
    let targetDist = Infinity;

    if (this.target && this.target.alive) {
      // ---- combat: face target, strafe, fire bursts
      // P48: blinded, the bot can't track — it faces (and sprays at) the
      // target's LAST KNOWN spot instead of its live position
      const anchor = this.blindT > 0 && this.lastKnown ? this.lastKnown : this.target.pos;
      const dx = anchor.x - this.pos.x, dz = anchor.z - this.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      targetDist = dist;
      wantYaw = Math.atan2(dx, dz);
      this._updateVeteranTactic(dt, dist);
      // ---- grenade throw (#16b): lob a frag to flush a target holding
      // cover (out of sight but still engaged) or to dislodge a camper at
      // range — never point-blank (self-blast) or across the whole map, and
      // on a long cooldown so it's a threat, not a mortar barrage
      if (this.grenLeft > 0 && this.grenCdT <= 0) {
        const aim = this.canSee ? this.target.pos : this.lastKnown;
        if (aim) {
          const gd = Math.hypot(aim.x - this.pos.x, aim.z - this.pos.z);
          if (gd > 8 && gd < 26 && (!this.canSee || this.target.speedNow < 2)) {
            this.world.api.throwGrenade(this, this.lethal, aim);
            this.spawnProtectT = 0; // throwing ends spawn invuln (like firing)
            this.grenLeft--;
            this.grenCdT = 7 + Math.random() * 4;
          }
        }
      }
      // Veteran tactical movement can temporarily replace the simple strafe:
      // move through a graph path toward cover or a flank, while still facing
      // and firing at the target whenever line of fire is clear.
      if (this.combatPath && this.combatPathIdx < this.combatPath.length) {
        const wp = this.world.graph.points[this.combatPath[this.combatPathIdx]];
        const tx = wp.x - this.pos.x, tz = wp.z - this.pos.z;
        const td = Math.sqrt(tx * tx + tz * tz);
        if (td < 0.9 && Math.abs(wp.y - this.pos.y) < 0.5) this.combatPathIdx++;
        else { moveX = tx / td; moveZ = tz / td; }
      } else {
        this.combatPath = null; this.tacticKind = null;
      }
      // strafe unless sniping or following a veteran tactic path
      this.strafeT -= dt;
      if (!this.combatPath) {
        if (this.strafeT <= 0) { this.strafeT = 0.7 + Math.random() * 0.9; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      }
      if (!this.combatPath && w.model !== 'sniper' && dist > 4) {
        const px = Math.cos(wantYaw), pz = -Math.sin(wantYaw);
        moveX = px * this.strafeDir * 0.55;
        moveZ = pz * this.strafeDir * 0.55;
        // shotgun bots push in to their falloff range instead of plinking
        const pushDist = w.throwWeapon ? 8 : w.pellets ? 10 : 26;
        if (dist > pushDist) { moveX += Math.sin(wantYaw) * 0.5; moveZ += Math.cos(wantYaw) * 0.5; }
      }
      // firing — only while the target is actually visible (canSee is
      // refreshed by the perception scan; _fireShot re-verifies per shot).
      // P48: a BLINDED bot keeps shooting — blind, at lastKnown (_fireShot
      // re-anchors); suppressive spray is the flash's designed output.
      if (this.reactT <= 0 && this.reloadT <= 0 &&
          (this.canSee || (this.blindT > 0 && this.lastKnown))) {
        this.shotT -= dt;
        if (this.burstLeft <= 0) {
          this.burstPause -= dt;
          if (this.burstPause <= 0) {
            const [bMin, bMax] = this.skill.burst;
            const [pMin, pMax] = this.skill.pause;
            this.burstLeft = w.mode === 'auto' ? bMin + Math.floor(Math.random() * (bMax - bMin + 1))
              : w.mode === 'burst' ? (w.burstCount || 3) : 1;
            this.burstPause = pMin + Math.random() * (pMax - pMin);
            if (w.mode === 'bolt') this.burstPause += 0.9;
            if (w.mode === 'semi') this.burstPause = Math.min(this.burstPause, 0.25 + Math.random() * 0.3);
            if (w.mode === 'burst') this.burstPause = Math.max(this.burstPause, w.burstDelay || 0.19);
          }
        }
        if (this.burstLeft > 0 && this.shotT <= 0) {
          this.shotT = 60 / w.rpm;
          this.burstLeft--;
          this._fireShot();
        }
      }
    } else if (this.wanderT > 0) {
      // ---- unstick wander (see _unstick)
      this.wanderT -= dt;
      moveX = this.wanderDir.x; moveZ = this.wanderDir.z;
      wantYaw = Math.atan2(moveX, moveZ);
    } else {
      // ---- patrol
      if (!this.path || this.pathIdx >= this.path.length) this._pickNewPath();
      if (this.path && this.pathIdx < this.path.length) {
        const wp = this.world.graph.points[this.path[this.pathIdx]];
        const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        // reached only when at the waypoint's level too — standing under an
        // upstairs node must not count, and a stair node must not register
        // from halfway up the flight (turning early clips the hole rail)
        if (d < 0.9 && Math.abs(wp.y - this.pos.y) < 0.5) this.pathIdx++;
        else {
          moveX = dx / d; moveZ = dz / d;
          wantYaw = Math.atan2(dx, dz);
        }
      }
      if (this.lastKnown && this.pos.distanceTo(this.lastKnown) < 2.5) this.lastKnown = null;
    }

    // ---- turn smoothly
    let dy = wantYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += THREE.MathUtils.clamp(dy, -8 * dt, 8 * dt);

    // ---- move with collisions (same physics as the player: gravity +
    // step-up so bots climb stairs and low ledges, and fall off edges)
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    this._updateMovementAbility(dt, len, targetDist);
    this._updatePose(dt);
    let speed = 4.6 * ((this.weapon && this.weapon.speed) || 1); // P31: bots pay the weapon mobility tax too
    if (this.sprinting && this.onGround) speed *= BOT_MOVE.sprintMult;
    else if (this.proneAmt > 0.5) speed *= BOT_MOVE.proneMult;
    else if (this.crouchAmt > 0.5) speed *= BOT_MOVE.crouchMult;
    this.speedNow = len * speed;
    let sx = 0, sz = 0;
    if (len > 0.01) {
      // partial-length move vectors (strafing) keep their reduced speed
      sx = (moveX / len) * speed * Math.min(1, len) * dt;
      sz = (moveZ / len) * speed * Math.min(1, len) * dt;
    }
    this.velY -= 13 * dt;
    this.onGround = moveEntity(this.pos, 0.38, this.bodyHeight(), sx, this.velY * dt, sz,
      this.world.colliders, this.onGround ? 0.55 : 0);
    if (this.onGround && this.velY < 0) this.velY = 0;
    if (len > 0.01) {
      // stuck detection while pathing
      this.stuckT += dt;
      if (this.stuckT > 1.2) {
        if (this.pos.distanceTo(this.lastPos) < 0.35) { this.unstickN++; this._unstick(); }
        else this.unstickN = 0;
        this.lastPos.copy(this.pos);
        this.stuckT = 0;
      }
    }

    // ---- footstep audio: enemy steps only, panned + attenuated, so the
    // player can track unseen hostiles by ear (teammates would be noise)
    if (this.team !== this.world.api.playerTeam && this.onGround && this.speedNow > 0.5) {
      this._stepT -= dt;
      if (this._stepT <= 0) {
        this._stepT = this.sprinting ? 0.33 : this.speedNow > 3.5 ? 0.38 : 0.55;
        AudioSys.footstep(this.sprinting || this.speedNow > 3.5,
          this.pos.distanceTo(this.world.api.playerPos()),
          this.world.api.audioPan(this.pos));
      }
    }

    // ---- animate
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
    if (this.speedNow > 0.5) {
      this.walkPhase += dt * 9;
      const s = Math.sin(this.walkPhase) * (this.sprinting ? 0.75 : this.proneAmt > 0.5 ? 0.25 : 0.55);
      ud.legL.rotation.x = s;
      ud.legR.rotation.x = -s;
    } else {
      ud.legL.rotation.x *= 0.8;
      ud.legR.rotation.x *= 0.8;
    }
  }
}
