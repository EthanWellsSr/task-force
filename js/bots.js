// ============================================================
// Soldier models + bot AI.
// Bots patrol the waypoint graph, engage on line of sight, fire
// in bursts with skill-based hit chances, and respawn on a timer.
// ============================================================

const TEAM_COLORS = {
  tf: { uniform: 0x5a6248, vest: 0x3a4034, helmet: 0x4a5040, band: 0x4a90d0, skin: 0xc8a080 },
  sp: { uniform: 0x6a564a, vest: 0x453832, helmet: 0x5a3a32, band: 0xd05040, skin: 0xd0aa88 },
};

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

// Blocky soldier, origin at feet, facing +Z
function buildSoldierMesh(team, name, showTag) {
  const c = TEAM_COLORS[team];
  const g = new THREE.Group();
  const mat = col => new THREE.MeshLambertMaterial({ color: col });
  const part = (w, h, d, col, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(col));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // legs pivot at hip
  const mkLeg = x => {
    const geo = new THREE.BoxGeometry(0.26, 0.75, 0.3);
    geo.translate(0, -0.375, 0);
    const m = new THREE.Mesh(geo, mat(c.vest));
    m.position.set(x, 0.75, 0);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const legL = mkLeg(-0.16), legR = mkLeg(0.16);
  part(0.64, 0.65, 0.36, c.uniform, 0, 1.075, 0);          // torso
  part(0.2, 0.14, 0.38, c.band, -0.32, 1.28, 0);           // shoulder band
  part(0.3, 0.3, 0.28, c.skin, 0, 1.56, 0);                // head
  part(0.38, 0.16, 0.36, c.helmet, 0, 1.75, 0);            // helmet
  part(0.16, 0.16, 0.55, c.uniform, -0.24, 1.25, 0.3);     // arms forward
  part(0.16, 0.16, 0.45, c.uniform, 0.22, 1.28, 0.32);
  const gun = part(0.09, 0.14, 0.85, 0x22252a, 0, 1.3, 0.55);
  // muzzle flash sprite
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  flash.position.set(0, 1.3, 1.05);
  flash.visible = false;
  g.add(flash);
  if (showTag) g.add(makeNameSprite(name, '#7ab4f0'));
  g.userData = { legL, legR, gun, flash };
  return g;
}

const BOT_SKILL = {
  recruit:  { acc: 0.10, react: 850, burst: [2, 5],  view: 38 },
  regular:  { acc: 0.17, react: 550, burst: [3, 6],  view: 45 },
  hardened: { acc: 0.26, react: 380, burst: [4, 8],  view: 52 },
  veteran:  { acc: 0.36, react: 250, burst: [5, 10], view: 60 },
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
    this.lastShotTime = -99; // minimap does G.time - lastShotTime; keep it a number pre-first-shot
    this.velY = 0;
    this.onGround = true;
    this.alive = false;
    this.hp = 100;
    this.kills = 0; this.deaths = 0;
    this.speedNow = 0;
    this.crouched = false;

    const lo = BOT_LOADOUTS[Math.floor(Math.random() * BOT_LOADOUTS.length)];
    this.weapon = WEAPONS[lo.primary];
    this.magLeft = this.weapon.mag;
    this.reloadT = 0;

    const s = BOT_SKILL[world.api.difficulty] || BOT_SKILL.regular;
    const v = 0.8 + Math.random() * 0.4;
    this.skill = { acc: s.acc * v, react: s.react / v, burst: s.burst, view: s.view };

    this.mesh = buildSoldierMesh(team, name, team === 'tf');
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
  }

  spawn() {
    const p = this.world.api.pickSpawn(this.team);
    this.pos.copy(p);
    // face the map center rather than whatever yaw we died holding
    this.yaw = Math.atan2(-p.x, -p.z);
    this.velY = 0;
    this.onGround = true;
    this.hp = 100;
    this.alive = true;
    this.magLeft = this.weapon.mag;
    this.reloadT = 0;
    this.target = null; this.lastKnown = null;
    this.lastShotTime = -99; // don't let a pre-death shot flash our new spot on the minimap
    this.path = null;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, this.yaw, 0);
    this.mesh.position.copy(this.pos);
    this.lastPos.copy(this.pos);
    this.stuckT = 0;
    this.stunT = 0; this.dazeT = 0; // death clears the stars
  }

  // A shot rang out: enemies within earshot learn the shooter's position
  // and go investigate. Walls muffle — a blocked line halves the radius.
  hearShot(shooter, radius) {
    if (!this.alive || shooter === this || shooter.team === this.team) return;
    const d = this.pos.distanceTo(shooter.pos);
    if (d > radius) return;
    if (d > radius * 0.5) {
      const ear = new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z);
      const src = new THREE.Vector3(shooter.pos.x, shooter.pos.y + 1.2, shooter.pos.z);
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

  hurt(dmg, attacker, weaponName, headshot) {
    if (!this.alive) return;
    this.hp -= dmg;
    // getting shot reveals the attacker
    if (attacker && attacker.team !== this.team && attacker.alive) {
      this.lastKnown = attacker.pos.clone();
      if (!this.target) this.reactT = this.skill.react * 0.5;
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.deaths++;
      if (attacker) attacker.kills++;
      this.respawnT = 4;
      this.deathAnimT = 2.2;
      this.world.api.registerKill(attacker, this, weaponName, headshot);
    }
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
      chest.set(e.pos.x, e.pos.y + 1.2, e.pos.z);
      if (!losClear(eye, chest, this.world.colliders)) continue;
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
      if (this.lostT > 2.5) { this.target = null; this.path = null; }
    }
  }

  _fireShot() {
    const w = this.weapon;
    const t = this.target;
    if (!t || !t.alive) return;
    const dist = this.pos.distanceTo(t.pos);
    const muzzle = new THREE.Vector3(this.pos.x, this.pos.y + 1.45, this.pos.z);

    // hard wall check per shot — a blocked line of fire can never damage
    const chestCheck = new THREE.Vector3(t.pos.x, t.pos.y + 1.2, t.pos.z);
    const blocked = !losClear(muzzle, chestCheck, this.world.colliders);

    // skill roll
    let chance = this.skill.acc * THREE.MathUtils.clamp(1.55 - dist / 45, 0.25, 1.2);
    if (t.speedNow > 4) chance *= 0.72;
    if (t.crouched) chance *= 0.85;
    if (w.model === 'sniper') chance *= 1.25;
    if (this.dazeT > 0) chance *= 0.25; // stun aftermath: can barely aim
    const hit = !blocked && Math.random() < chance;

    // damage with falloff
    const fall = THREE.MathUtils.clamp((dist - w.range[0]) / (w.range[1] - w.range[0]), 0, 1);
    let dmg = THREE.MathUtils.lerp(w.dmg, w.minDmg, fall) * 0.8;
    if (w.pellets) dmg *= w.pellets * 0.5;
    const headshot = hit && Math.random() < 0.1;
    if (headshot) dmg *= w.head;

    // tracer: to the chest if hit, offset if missed
    const aim = new THREE.Vector3(t.pos.x, t.pos.y + 1.2, t.pos.z);
    if (!hit) {
      aim.x += (Math.random() - 0.5) * 2.4;
      aim.y += (Math.random() - 0.3) * 1.6;
      aim.z += (Math.random() - 0.5) * 2.4;
    }
    const dir = aim.clone().sub(muzzle).normalize();
    const wallHit = rayWorld(muzzle, dir, muzzle.distanceTo(aim) + 2, this.world.colliders);
    const end = (wallHit && wallHit.dist < muzzle.distanceTo(aim) - 0.5) ? wallHit.point : aim;
    this.world.api.tracer(muzzle, end);
    this.flashT = 0.05;

    AudioSys.shot(w.model, this.pos.distanceTo(this.world.api.playerPos()),
      this.world.api.audioPan(this.pos));
    this.world.api.noteShot(this);

    if (hit) {
      if (t.isPlayer) this.world.api.playerDamage(Math.round(dmg), this, w.name, headshot);
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
      if (this.respawnT <= 0 && this.world.api.matchLive()) this.spawn();
      return;
    }

    // ---- stunned: frozen in place — no turning, moving, perceiving or
    // firing; gravity still applies so a stunned bot doesn't hover
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.velY -= 13 * dt;
      this.onGround = moveEntity(this.pos, 0.38, 1.7, 0, this.velY * dt, 0,
        this.world.colliders, 0);
      if (this.onGround && this.velY < 0) this.velY = 0;
      this.speedNow = 0;
      if (this.flashT > 0) { this.flashT -= dt; ud.flash.visible = this.flashT > 0; }
      this.mesh.position.copy(this.pos);
      ud.legL.rotation.x *= 0.8;
      ud.legR.rotation.x *= 0.8;
      return;
    }
    if (this.dazeT > 0) this.dazeT -= dt;

    // ---- perception (staggered)
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.15; this._scanForTarget(); }

    if (this.reactT > 0) this.reactT -= dt;
    if (this.reloadT > 0) this.reloadT -= dt;
    if (this.flashT > 0) { this.flashT -= dt; ud.flash.visible = this.flashT > 0; ud.flash.rotation.z = Math.random() * Math.PI * 2; }

    const w = this.weapon;
    let moveX = 0, moveZ = 0, wantYaw = this.yaw;

    if (this.target && this.target.alive) {
      // ---- combat: face target, strafe, fire bursts
      const dx = this.target.pos.x - this.pos.x, dz = this.target.pos.z - this.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      wantYaw = Math.atan2(dx, dz);
      // strafe unless sniping
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.7 + Math.random() * 0.9; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      if (w.model !== 'sniper' && dist > 4) {
        const px = Math.cos(wantYaw), pz = -Math.sin(wantYaw);
        moveX = px * this.strafeDir * 0.55;
        moveZ = pz * this.strafeDir * 0.55;
        if (dist > 26) { moveX += Math.sin(wantYaw) * 0.5; moveZ += Math.cos(wantYaw) * 0.5; }
      }
      // firing — only while the target is actually visible (canSee is
      // refreshed by the perception scan; _fireShot re-verifies per shot)
      if (this.reactT <= 0 && this.reloadT <= 0 && this.canSee) {
        this.shotT -= dt;
        if (this.burstLeft <= 0) {
          this.burstPause -= dt;
          if (this.burstPause <= 0) {
            const [bMin, bMax] = this.skill.burst;
            this.burstLeft = w.mode === 'auto' ? bMin + Math.floor(Math.random() * (bMax - bMin + 1)) : 1;
            this.burstPause = 0.45 + Math.random() * 0.6;
            if (w.mode === 'bolt') this.burstPause += 0.9;
            if (w.mode === 'semi') this.burstPause = 0.25 + Math.random() * 0.3;
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
    const speed = 4.6;
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    this.speedNow = len * speed;
    let sx = 0, sz = 0;
    if (len > 0.01) {
      // partial-length move vectors (strafing) keep their reduced speed
      sx = (moveX / len) * speed * Math.min(1, len) * dt;
      sz = (moveZ / len) * speed * Math.min(1, len) * dt;
    }
    this.velY -= 13 * dt;
    this.onGround = moveEntity(this.pos, 0.38, 1.7, sx, this.velY * dt, sz,
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
        this._stepT = this.speedNow > 3.5 ? 0.38 : 0.5;
        AudioSys.footstep(this.speedNow > 3.5,
          this.pos.distanceTo(this.world.api.playerPos()),
          this.world.api.audioPan(this.pos));
      }
    }

    // ---- animate
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
    if (this.speedNow > 0.5) {
      this.walkPhase += dt * 9;
      const s = Math.sin(this.walkPhase) * 0.55;
      ud.legL.rotation.x = s;
      ud.legR.rotation.x = -s;
    } else {
      ud.legL.rotation.x *= 0.8;
      ud.legR.rotation.x *= 0.8;
    }
  }
}
