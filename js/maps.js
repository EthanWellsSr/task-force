// ============================================================
// Map construction. World collision = list of THREE.Box3.
// Bots navigate a waypoint graph auto-connected by line of sight.
// ============================================================

// Shared ray-vs-world helper. Returns nearest hit {dist, point} or null.
const _ray = new THREE.Ray();
const _hitVec = new THREE.Vector3();
function rayWorld(origin, dir, maxDist, colliders) {
  _ray.origin.copy(origin);
  _ray.direction.copy(dir);
  let best = null, bestDist = maxDist;
  for (let i = 0; i < colliders.length; i++) {
    const p = _ray.intersectBox(colliders[i], _hitVec);
    if (p) {
      const d = p.distanceTo(origin);
      if (d < bestDist) { bestDist = d; best = { dist: d, point: p.clone(), box: colliders[i] }; }
    }
  }
  return best;
}

// Segment LOS check (true = clear)
const _losDir = new THREE.Vector3();
function losClear(a, b, colliders) {
  _losDir.subVectors(b, a);
  const len = _losDir.length();
  if (len < 0.001) return true;
  _losDir.divideScalar(len);
  return !rayWorld(a, _losDir, len - 0.01, colliders);
}

// Body-width walkability check: center ray plus two shoulder rays offset
// by the bot's half-width. A zero-width LOS that threads a doorway or a
// rail end at a steep angle is not traversable for a 0.76-wide body —
// nav edges built from it strand bots against the frame.
const _corA = new THREE.Vector3(), _corB = new THREE.Vector3();
function _laneClear(a, b, ox, oz, dy, colliders) {
  _corA.set(a.x + ox, a.y + dy, a.z + oz);
  _corB.set(b.x + ox, b.y + dy, b.z + oz);
  return losClear(_corA, _corB, colliders);
}
function corridorClear(a, b, colliders) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const px = len < 0.001 ? 0.38 : -dz / len * 0.38;
  const pz = len < 0.001 ? 0 : dx / len * 0.38;
  // knee-height pass catches low blockers (rails, sofas, tall crates) that
  // sit below the eye ray but are too tall to step over; skipped on
  // climbing links (stairs), where rays must glide above the rising treads
  const heights = Math.abs(a.y - b.y) < 0.5 ? [0, -0.45] : [0];
  for (const dy of heights) {
    if (!_laneClear(a, b, 0, 0, dy, colliders)) return false;
    if (!_laneClear(a, b, px, pz, dy, colliders)) return false;
    if (!_laneClear(a, b, -px, -pz, dy, colliders)) return false;
  }
  return true;
}

class MapKit {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.windows = []; // vault-through traversal zones, filled by wall()
    this._mats = {};
  }
  mat(color) {
    if (!this._mats[color]) this._mats[color] = new THREE.MeshLambertMaterial({ color });
    return this._mats[color];
  }
  // Box centered at (cx, cy, cz)
  box(cx, cy, cz, w, h, d, color, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    m.position.set(cx, cy, cz);
    m.castShadow = opts.shadow !== false;
    m.receiveShadow = true;
    this.scene.add(m);
    if (opts.solid !== false) {
      this.colliders.push(new THREE.Box3(
        new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
        new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2)));
    }
    return m;
  }
  // Invisible collider only
  blocker(cx, cy, cz, w, h, d) {
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
      new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2)));
  }
  // Wall along 'x' or 'z' from coordinate a1 to a2 at fixed coordinate `at`.
  // openings: [{a, b, bottom (default 0), top (default 2.2)}] in the same axis coords.
  // Base of wall sits at y = y0 (default 0); opening heights are relative to y0.
  wall(axis, a1, a2, at, height, thick, color, openings = [], y0 = 0) {
    const segs = [];
    const ops = openings.slice().sort((p, q) => p.a - q.a);
    let cursor = a1;
    for (const o of ops) {
      if (o.a > cursor) segs.push({ a: cursor, b: o.a, y0: 0, y1: height });
      const bottom = o.bottom !== undefined ? o.bottom : 0;
      const top = o.top !== undefined ? o.top : 2.2;
      // window-sized openings (raised sill, room for a crouched player)
      // double as vault traversal zones
      if (bottom > 0.4 && top - bottom >= 1.3 && o.b - o.a >= 1.1)
        this.windows.push({ axis, a: o.a, b: o.b, at, sill: y0 + bottom, top: y0 + top });
      if (bottom > 0) segs.push({ a: o.a, b: o.b, y0: 0, y1: bottom });
      if (top < height) segs.push({ a: o.a, b: o.b, y0: top, y1: height });
      cursor = o.b;
    }
    if (cursor < a2) segs.push({ a: cursor, b: a2, y0: 0, y1: height });
    for (const s of segs) {
      const len = s.b - s.a, mid = (s.a + s.b) / 2, h = s.y1 - s.y0, cy = y0 + (s.y0 + s.y1) / 2;
      if (len <= 0.01 || h <= 0.01) continue;
      if (axis === 'x') this.box(mid, cy, at, len, h, thick, color);
      else this.box(at, cy, mid, thick, h, len, color);
    }
  }
  car(cx, cz, color) {
    this.box(cx, 0.55, cz, 1.8, 1.1, 4.2, color);
    this.box(cx, 1.35, cz + 0.2, 1.7, 0.7, 2.0, 0x1a1d20);
  }
  crate(cx, cz, size = 1.2, color = 0x7a6a4a) {
    this.box(cx, size / 2, cz, size, size, size, color);
  }
  beam(ax, ay, az, bx, by, bz, thick, color, opts = {}) {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 0.01) return null;
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick, len, thick), this.mat(color));
    m.position.copy(mid);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = opts.shadow !== false;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }
  // Slatted picket fence along 'x' or 'z' from a1 to a2 at fixed `at`.
  // gaps: [{a, b}] (gate openings) in the run axis. Slats are drawn as ONE
  // InstancedMesh per solid segment and every segment contributes exactly
  // ONE collider — per-slat boxes would bloat the collider list that every
  // rayWorld() call walks.
  picketFence(axis, a1, a2, at, color = 0xe6e4da, gaps = []) {
    const H = 1.15, TH = 0.055, SW = 0.09, PITCH = 0.19;
    const segs = [];
    let cur = a1;
    for (const g of gaps.slice().sort((p, q) => p.a - q.a)) {
      if (g.a > cur) segs.push([cur, g.a]);
      cur = Math.max(cur, g.b);
    }
    if (cur < a2) segs.push([cur, a2]);
    const alongX = axis === 'x';
    const geo = alongX ? new THREE.BoxGeometry(SW, H, TH) : new THREE.BoxGeometry(TH, H, SW);
    const m4 = new THREE.Matrix4();
    for (const [s0, s1] of segs) {
      const len = s1 - s0;
      if (len < 0.06) continue;
      const mid = (s0 + s1) / 2;
      const n = Math.max(2, Math.round(len / PITCH));
      const im = new THREE.InstancedMesh(geo, this.mat(color), n);
      for (let i = 0; i < n; i++) {
        const u = s0 + (i + 0.5) * (len / n);
        m4.setPosition(alongX ? u : at, H / 2, alongX ? at : u);
        im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      this.scene.add(im);
      // two rails, slightly proud of the slats, no collision of their own
      for (const ry of [0.35, 0.86]) {
        if (alongX) this.box(mid, ry, at, len, 0.09, TH * 1.6, color, { solid: false, shadow: false });
        else this.box(at, ry, mid, TH * 1.6, 0.09, len, color, { solid: false, shadow: false });
      }
      if (alongX) this.blocker(mid, H / 2, at, len, H, 0.16);
      else this.blocker(at, H / 2, mid, 0.16, H, len);
    }
  }
  barrel(cx, cz, color = 0x8a4a35) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 10), this.mat(color));
    m.position.set(cx, 0.55, cz);
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    this.blocker(cx, 0.55, cz, 0.8, 1.1, 0.8);
  }
}

// ============================================================
// NUKETOWN — reworked against docs/nuketown-reference.md (#17).
// Compass: +x = north, +z = east (top-down renders +x up, +z right).
// A straight two-lane street runs west-east between the two houses and
// dead-ends both ways: a pink house + lone car close the west end, a
// sandbag/barbed-wire blockade the east. GREEN house north, YELLOW
// house south, offset along the street but still overlapping across it
// so their upstairs windows face each other — the map's signature duel.
// Each house: slatted picket front yard, attached garage opening onto a
// driveway, and THREE ways upstairs (interior stair, exterior stair to
// the rear deck, and a crate-stack climb onto the garage roof and in
// through the upstairs window). Backyards behind each house are the team
// spawns (garden, shed, plus a swing set south).
// Two side lanes run from the backyard gates around to the street ends.
// Point-symmetric about the origin except the street ends and the two
// backyard signature props.
// ============================================================
function buildNuketown(scene, colliders) {
  const k = new MapKit(scene, colliders);
  const W = 28, D = 20; // half extents: x = across the street, z = along it
  const T = 0.3;
  const DESERT = 0xc9a97c, LAWN = 0x567f3c, ASPHALT = 0x5b5e63,
        SIDEWALK = 0x8f8d86, CONCRETE = 0x9b9890, CURB = 0xb0aca2,
        TEAL = 0x4fb3a5, YELLOW = 0xd8c052, PINK = 0xd8a8b8,
        TRIM = 0xf0eee6, GLASS = 0x262a30, POLE = 0x6a5138,
        wood = 0x8a6d4a, hedge = 0x4a6a3a, DIRT = 0x6b4b2e;
  const ns = { solid: false }, nsf = { solid: false, shadow: false };

  scene.background = new THREE.Color(0x9fc4e0);
  scene.fog = new THREE.Fog(0x9fc4e0, 70, 160);

  // ---- ground: desert beyond, lawn inside
  k.box(0, -0.55, 0, 160, 1, 160, DESERT, nsf);
  k.box(0, -0.5, 0, W * 2 + 2, 1, D * 2 + 2, LAWN);
  function disc(x, y, z, r, h, color) {                  // flat cylinder, visual only
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), k.mat(color));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---- street: straight two lanes the full length, with a turnaround
  // bulb at the west dead end (the only place a cul-de-sac circle belongs)
  const BULBZ = -10.2;
  disc(0, 0.012, BULBZ, 6.2, 0.024, SIDEWALK);
  disc(0, 0.03, BULBZ, 5.45, 0.02, CURB);
  disc(0, 0.03, BULBZ, 5.2, 0.024, ASPHALT);
  k.box(0, 0.03, 0.9, 8.4, 0.024, 30.2, ASPHALT, nsf);   // z: -14.2 .. 16.0
  for (const sx of [-1, 1]) {
    k.box(sx * 4.35, 0.045, 2.4, 0.3, 0.02, 27.2, CURB, nsf);      // z: -11.2 .. 16.0
    k.box(sx * 5.15, 0.012, 2.4, 1.3, 0.024, 27.2, SIDEWALK, nsf);
  }
  for (const z of [-6.5, -3.5, 7.5, 10.5, 13.5])
    k.box(0, 0.05, z, 0.22, 0.02, 1.5, 0xd8c860, nsf);   // centre dashes

  // ---- perimeter fence + invisible walls
  k.wall('z', -D, D, -W, 2.4, T, wood);
  k.wall('z', -D, D, W, 2.4, T, wood);
  k.wall('x', -W, W, -D, 2.4, T, wood);
  k.wall('x', -W, W, D, 2.4, T, wood);
  k.blocker(-W, 5, 0, 0.5, 10, D * 2);
  k.blocker(W, 5, 0, 0.5, 10, D * 2);
  k.blocker(0, 5, -D, W * 2, 10, 0.5);
  k.blocker(0, 5, D, W * 2, 10, 0.5);

  // Point-symmetric builder: s=1 lays out the south/yellow half,
  // s=-1 mirrors it through the origin for the north/green half.
  const xform = s => ({
    wall: (axis, a1, a2, at, h, thick, col, ops = [], y0 = 0) =>
      k.wall(axis, Math.min(s * a1, s * a2), Math.max(s * a1, s * a2), s * at, h, thick, col,
        ops.map(o => ({
          a: Math.min(s * o.a, s * o.b), b: Math.max(s * o.a, s * o.b),
          bottom: o.bottom, top: o.top,
        })), y0),
    box: (cx, cy, cz, w, h, d, col, opts) => k.box(s * cx, cy, s * cz, w, h, d, col, opts),
    blocker: (cx, cy, cz, w, h, d) => k.blocker(s * cx, cy, s * cz, w, h, d),
    picket: (axis, a1, a2, at, col, gaps = []) =>
      k.picketFence(axis, Math.min(s * a1, s * a2), Math.max(s * a1, s * a2), s * at, col,
        gaps.map(g => ({ a: Math.min(s * g.a, s * g.b), b: Math.max(s * g.a, s * g.b) }))),
  });

  // ---- house: footprint x -18..-9.5 (front wall on the street at
  // x=-9.5), z -9..3; attached garage z 3..7.4. Ground floor: living
  // room on the street, kitchen/back room behind. Second storey with
  // street-facing windows, a rear deck and a garage-roof window.
  const H1 = 2.8, H2 = 2.6, TOP = H1 + H2, GROOF = 2.75; // garage roof centre
  function house(s, wallC, innerC, roofC) {
    const t = xform(s);
    // ---- ground floor shell
    t.wall('z', -9, 3, -9.5, H1, T, wallC, [
      { a: -1.4, b: -0.2, top: 2.2 },                   // front door
      { a: -7.0, b: -4.6, bottom: 0.95, top: 2.6 },     // picture window (vaultable)
    ]);
    t.wall('z', -9, 3, -18, H1, T, wallC, [
      { a: -6.0, b: -4.8, top: 2.2 },                   // back door -> backyard spawn
      { a: 0.4, b: 2.0, bottom: 0.95, top: 2.6 },       // kitchen window
    ]);
    t.wall('x', -18, -9.5, -9, H1, T, wallC, [{ a: -16.2, b: -14.4, bottom: 0.95, top: 2.6 }]);
    t.wall('x', -18, -9.5, 3, H1, T, wallC, [{ a: -14.6, b: -13.4, top: 2.2 }]); // door -> garage
    t.wall('z', -7.0, 3, -13.5, H1, T, innerC, [{ a: -3.5, b: -2.3, top: 2.2 }]); // kitchen wall
    // ---- second storey
    t.wall('z', -9, 3, -9.5, H2, T, wallC, [
      { a: -7.6, b: -5.6, bottom: 0.9, top: 2.3 },      // the two street windows
      { a: -1.2, b: 0.8, bottom: 0.9, top: 2.3 },       // ...this one faces its twin
    ], H1);
    t.wall('z', -9, 3, -18, H2, T, wallC, [
      { a: -1.0, b: 0.2, top: 2.2 },                    // door out to the rear deck
      { a: -7.2, b: -5.6, bottom: 0.9, top: 2.3 },
    ], H1);
    t.wall('x', -18, -9.5, -9, H2, T, wallC, [{ a: -15.8, b: -14.0, bottom: 0.9, top: 2.3 }], H1);
    // sill 0.45 above the upstairs floor = 0.4 above the garage roof:
    // the "climb in through the main window" route (vault zone)
    t.wall('x', -18, -9.5, 3, H2, T, wallC, [{ a: -14.4, b: -12.8, bottom: 0.45, top: 2.05 }], H1);
    t.wall('x', -18, -14.0, -5.5, H2, T, innerC, [{ a: -16.4, b: -15.2, top: 2.2 }], H1); // bedroom
    // ---- upstairs floor slab, hole over the staircase
    const fC = 0x6e5637;
    t.box(-13.75, H1 - 0.075, -2.2, 8.5, 0.15, 10.4, fC);
    t.box(-16.0, H1 - 0.075, -8.2, 4.0, 0.15, 1.6, fC);
    t.box(-11.85, H1 + 0.42, -7.35, 4.7, 0.85, 0.1, innerC); // rail at the hole
    // ---- interior staircase (0.4 m risers: bots follow, stepUp is 0.55)
    for (let i = 0; i < 7; i++)
      t.box(-10.6 - 0.53 * i, 0.2 * (i + 1), -8.2, 0.53, 0.4 * (i + 1), 1.15, 0x7a6248);
    // ---- roof + chimney (stepped slabs fake a gable, wide eaves)
    t.box(-13.75, TOP + 0.14, -3, 9.9, 0.28, 13.4, roofC);
    t.box(-13.75, TOP + 0.42, -3, 6.6, 0.28, 13.4, roofC);
    t.box(-13.75, TOP + 0.7, -3, 3.4, 0.28, 13.4, roofC);
    t.box(-16.2, TOP + 0.95, -6.5, 0.8, 1.5, 0.8, 0x8a5a4a);
    t.box(-13.75, TOP - 0.1, -3, 10.1, 0.2, 13.6, TRIM, ns);   // fascia
    // ---- white trim: floor band + slim corner boards (not fence posts)
    t.box(-13.75, H1, -9.18, 8.9, 0.34, 0.12, TRIM, ns);
    t.box(-13.75, H1, 3.18, 8.9, 0.34, 0.12, TRIM, ns);
    t.box(-9.32, H1, -3, 0.12, 0.34, 12.4, TRIM, ns);
    t.box(-18.18, H1, -3, 0.12, 0.34, 12.4, TRIM, ns);
    t.box(-9.3, 0.88, -5.8, 0.12, 0.14, 2.7, TRIM, ns);        // picture-window sill
    t.box(-9.3, 2.67, -5.8, 0.12, 0.14, 2.7, TRIM, ns);        // ...and header
    t.box(-9.3, H1 + 0.83, -6.6, 0.12, 0.14, 2.3, TRIM, ns);   // upstairs sills
    t.box(-9.3, H1 + 0.83, -0.2, 0.12, 0.14, 2.3, TRIM, ns);
    // ---- attached garage, opening onto the street; roof is walkable
    t.wall('z', 3, 7.4, -18, H1, T, wallC);
    t.wall('x', -18, -9.5, 7.4, H1, T, wallC);
    t.wall('z', 3, 7.4, -9.5, H1, T, wallC, [{ a: 3.7, b: 6.7, top: 2.35 }]); // garage door
    t.box(-13.75, GROOF, 5.3, 8.9, 0.2, 5.4, roofC);
    t.box(-13.75, GROOF - 0.03, 5.3, 9.1, 0.12, 5.6, TRIM, ns);   // eave
    // ---- rear deck at second-floor level + exterior staircase down
    t.box(-19.3, 2.7, -0.15, 2.6, 0.2, 3.7, 0x9a7a55);
    for (const pz of [-1.6, 1.3]) t.box(-20.3, 1.3, pz, 0.16, 2.6, 0.16, 0x9a7a55);
    t.box(-20.55, 3.2, -0.15, 0.1, 0.8, 3.7, TRIM);
    t.box(-19.3, 3.2, -2.0, 2.6, 0.8, 0.1, TRIM);
    for (let i = 0; i < 7; i++)
      t.box(-19.3, 0.2 * (i + 1), 4.9 - 0.52 * i, 2.2, 0.4 * (i + 1), 0.52, 0x7a6248);
    k.beam(s * -20.45, 1.0, s * 4.95, s * -20.45, 3.15, s * 1.65, 0.12, 0x7a6248, ns);
    k.beam(s * -20.45, 0.55, s * 4.95, s * -20.45, 2.45, s * 1.65, 0.08, 0x7a6248, ns);
    // ---- furniture (kept against walls so bots keep clean lanes)
    t.box(-12.8, 0.4, -6.0, 1.1, 0.8, 2.2, 0x7a4a3a);        // sofa
    t.box(-17.3, 0.5, 1.4, 1.0, 1.0, 2.6, 0xb0aca0);         // kitchen counter
    t.box(-17.0, H1 + 0.3, -6.6, 1.5, 0.6, 2.0, 0x6a7a94);   // bed
    t.box(-16.8, H1 + 0.35, 2.0, 1.4, 0.7, 1.1, 0x84765a);   // dresser
  }
  house(1, YELLOW, 0xcfc7b2, 0x4e4a44);  // yellow house, south (shifted west)
  house(-1, TEAL, 0xcfc7b2, 0x55504a);   // green house, north (shifted east)

  // ---- yards: slatted picket front yard with a gate, driveway onto the
  // street, gated backyard spawn behind the house (one set per half)
  function yard(s) {
    const t = xform(s);
    const roofC = s > 0 ? 0x4e4a44 : 0x55504a;
    // front pickets: ONE collider per run (rayWorld is O(colliders))
    t.picket('z', -9.5, 2.6, -6.5, TRIM, [{ a: -1.35, b: -0.35 }]);   // gate to the walk
    t.picket('x', -9.5, -6.5, -9.5, TRIM);
    // porch: posts joined by rails, so they read as a porch not as posts
    t.box(-8.6, 0.05, -0.9, 1.8, 0.1, 3.0, CONCRETE, ns);
    for (const pz of [-2.2, 0.4]) t.box(-7.8, 1.2, pz, 0.16, 2.4, 0.16, TRIM);
    for (const ry of [0.55, 1.02]) t.box(-7.8, ry, -0.9, 0.1, 0.1, 2.6, TRIM, ns);
    t.box(-7.8, 2.28, -0.9, 0.14, 0.14, 2.8, TRIM, ns);      // porch beam
    t.box(-8.6, 2.5, -0.9, 2.0, 0.16, 3.4, roofC);
    t.box(-8.0, 0.02, -0.85, 3.0, 0.02, 1.2, CONCRETE, nsf); // front walk
    t.box(-6.0, 0.02, -0.85, 1.4, 0.02, 1.2, CONCRETE, nsf);
    t.box(-6.0, 0.5, -2.4, 0.12, 1.0, 0.12, 0x50524f);       // mailbox
    t.box(-6.0, 1.12, -2.4, 0.34, 0.26, 0.55, 0x9a3a30);
    // driveway pad out to the sidewalk
    t.box(-7.65, 0.02, 5.2, 3.7, 0.02, 4.4, SIDEWALK, nsf);
    // "series of climbable objects" -> garage roof -> upstairs window.
    // 0.5 m risers (under stepUp's 0.55, with float slack) so players and
    // bots can both walk the third upstairs route.
    const climb = [[-10.7, 0.5], [-11.65, 1.0], [-12.6, 1.5], [-13.55, 2.0], [-14.5, 2.5]];
    for (let i = 0; i < climb.length; i++)
      t.box(climb[i][0], climb[i][1] / 2, 8.5, 0.95, climb[i][1], 1.0, i % 2 ? 0x6e5e40 : 0x7a6a4a);
    // backyard spawn: deeper board-fenced yard with a gate at each end
    // onto the side lanes
    t.wall('x', -28, -18, -10.5, 2.2, T, wood, [{ a: -25.8, b: -24.4 }]);
    t.wall('z', -10.5, -9, -18, 2.2, T, wood);
    t.wall('x', -28, -18, 8.8, 2.2, T, wood, [{ a: -24.4, b: -23.0 }]);
    t.wall('z', 7.4, 8.8, -18, 2.2, T, wood);
    // garden plot at the very rear + shed + spawn cover
    t.box(-25.6, 0.03, -7.8, 3.6, 0.06, 3.6, DIRT, nsf);
    for (let i = 0; i < 3; i++) t.box(-25.6, 0.2, -9.0 + 1.2 * i, 3.2, 0.32, 0.4, hedge, ns);
    t.box(-26.2, 1.05, -4.65, 1.8, 2.1, 1.7, 0xdad7cc);
    t.box(-26.2, 2.2, -4.65, 2.1, 0.2, 2.0, wood, ns);
    t.box(-25.28, 0.95, -4.65, 0.06, 1.7, 0.7, 0x8a8478, ns);
    t.box(-23.2, 0.6, -9.6, 1.2, 1.2, 1.2, 0x7a6a4a);
    t.box(-26.2, 0.5, 3.2, 1.0, 1.0, 1.0, 0x6e5e40);
    // corner-lawn dressing on the side lane
    t.box(-20.5, 1.45, 14.5, 2.3, 2.5, 5.6, s > 0 ? 0xd8d5c8 : 0xcfd4c4); // camper
    t.box(-19.32, 1.9, 14.5, 0.06, 0.6, 4.2, GLASS, ns);
    t.box(-8.6, 0.85, 12.4, 1.3, 1.7, 3.2, hedge);
    t.box(-13.5, 0.85, 11.0, 3.0, 1.7, 1.2, hedge);
  }
  yard(1);
  yard(-1);

  // ---- backyard signature prop: complete swing set behind the yellow
  // house (south)
  (function swingSet(x, z) {
    const red = 0x9a3a30, chain = 0x3a3a38, seat = 0x2f5f8f;
    for (const sz of [-1.55, 1.55]) {
      k.beam(x - 0.95, 0.05, z + sz, x, 2.05, z + sz, 0.1, red, ns);
      k.beam(x + 0.95, 0.05, z + sz, x, 2.05, z + sz, 0.1, red, ns);
      k.beam(x - 0.72, 0.62, z + sz, x + 0.72, 0.62, z + sz, 0.08, red, ns);
    }
    k.box(x, 2.05, z, 0.14, 0.14, 3.35, red, ns);
    for (const sz of [-0.62, 0.62]) {
      k.beam(x - 0.16, 1.95, z + sz, x - 0.16, 0.52, z + sz, 0.035, chain, ns);
      k.beam(x + 0.16, 1.95, z + sz, x + 0.16, 0.52, z + sz, 0.035, chain, ns);
      k.box(x, 0.44, z + sz, 0.52, 0.07, 0.26, seat, ns);
    }
    k.blocker(x, 1.0, z, 2.0, 2.1, 3.7);
  })(-22.6, 0.6);
  // ---- west dead end: pink house, closed, with the lone car in front
  k.box(0, 2.5, -17.4, 15, 5.0, 4.8, PINK);
  k.box(0, 5.14, -17.4, 16.4, 0.28, 5.8, 0x6a6660);
  k.box(0, 5.42, -17.4, 11.0, 0.28, 5.8, 0x6a6660);
  k.box(-3.6, 5.8, -17.6, 0.8, 1.4, 0.8, 0x8a5a4a);         // chimney
  k.box(0, 4.9, -14.95, 15.2, 0.24, 0.14, TRIM, ns);        // fascia
  for (const sx of [-4.6, 4.6]) {
    k.box(sx, 1.6, -14.94, 2.2, 1.4, 0.08, GLASS, ns);      // windows
    k.box(sx, 3.7, -14.94, 2.0, 1.2, 0.08, GLASS, ns);
  }
  k.box(0, 1.15, -14.94, 1.3, 2.3, 0.1, 0x8a3a30, ns);      // front door
  k.box(0, 0.06, -14.4, 2.6, 0.12, 1.2, CONCRETE, ns);      // stoop
  k.car(-2.6, -12.8, 0xd8d5c8);                              // the lone car

  // ---- east dead end: sandbag + barbed-wire blockade, army truck behind
  k.box(0, 0.55, 16.3, 10.5, 1.1, 1.0, 0x8f8060);
  k.box(-3.4, 0.35, 15.5, 2.2, 0.7, 0.8, 0x8f8060);
  k.box(3.2, 0.35, 15.6, 1.8, 0.7, 0.8, 0x8f8060);
  for (let px = -5; px <= 5; px += 2.5) k.box(px, 0.9, 16.8, 0.1, 1.8, 0.1, 0x4a4a48);
  k.box(0, 1.35, 16.8, 11, 0.04, 0.04, 0x3a3a38, ns);
  k.box(0, 1.7, 16.8, 11, 0.04, 0.04, 0x3a3a38, ns);
  k.blocker(0, 3, 16.8, 13, 6, 1.6);
  k.box(0.5, 1.3, 18.4, 2.4, 2.2, 3.2, 0x4a5240);           // truck behind the wire
  k.box(0, 0.5, 11.0, 1.8, 1.0, 4.0, 0x2e2f33);             // burnt wreck, secondary cover
  k.box(0, 1.25, 11.2, 1.7, 0.55, 1.9, 0x232529);

  // ---- school bus, angled in the middle of the street
  const busG = new THREE.Group();
  function bpart(x, y, z, w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), k.mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    busG.add(m);
  }
  bpart(0, 1.7, 0, 2.5, 2.4, 8.4, 0xe8b820);        // body
  bpart(0, 3.02, 0, 2.55, 0.2, 8.5, 0xf0eee4);      // white roof
  bpart(0, 1.05, 4.9, 2.3, 1.1, 1.5, 0xe8b820);     // hood
  bpart(0, 0.62, 5.75, 2.3, 0.5, 0.2, 0x3a3d42);    // bumper
  bpart(0, 2.32, 4.24, 2.2, 1.0, 0.1, GLASS);       // windshield
  for (const sx of [-1, 1]) {
    bpart(sx * 1.28, 2.35, -0.4, 0.06, 0.85, 6.8, GLASS);
    bpart(sx * 1.28, 0.95, -0.4, 0.06, 0.35, 6.8, 0x1c1e22);
    for (const zw of [-2.9, 2.9]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), k.mat(0x1c1e22));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.15, 0.5, zw);
      wheel.castShadow = true;
      busG.add(wheel);
    }
  }
  const BUSX = -2.55, BUSZ = 0.7, BUSA = -0.22; // centre + yaw
  busG.position.set(BUSX, 0, BUSZ);
  busG.rotation.y = BUSA;
  scene.add(busG);
  const busSin = Math.sin(BUSA), busCos = Math.cos(BUSA);
  for (const off of [-2.8, 0, 2.8])
    k.blocker(BUSX + off * busSin, 1.55, BUSZ + off * busCos, 3.05, 3.1, 3.42);
  k.blocker(BUSX + 5.0 * busSin, 0.85, BUSZ + 5.0 * busCos, 2.6, 1.7, 2.25);

  // ---- moving truck beside the bus (open cargo hold facing the bus)
  const TRUCKX = 3.0;
  k.box(TRUCKX, 1.85, -1.5, 2.2, 3.0, 6.6, 0xd8d5cc);                   // trailer
  k.box(TRUCKX, 3.42, -1.5, 2.3, 0.14, 6.7, 0xe8e6df, ns);              // roof cap
  k.box(TRUCKX, 1.85, -4.82, 2.1, 2.8, 0.08, 0xb9b6ad, ns);             // rear doors
  k.box(TRUCKX, 1.15, 3.1, 2.1, 1.9, 2.6, 0xb03028);                    // cab
  k.box(TRUCKX, 2.2, 3.2, 1.9, 0.22, 2.2, 0x8a231e, ns);
  k.box(TRUCKX, 1.75, 4.42, 1.8, 0.7, 0.06, GLASS, ns);
  for (const sx of [-1, 1])
    for (const zw of [-3.9, -0.5, 3.8]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12), k.mat(0x1c1e22));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(TRUCKX + sx * 1.0, 0.45, zw);
      wheel.castShadow = true;
      scene.add(wheel);
    }

  // ---- street furniture
  function powerPole(x, z) {
    k.box(x, 2.6, z, 0.24, 5.2, 0.24, POLE);
    k.box(x, 4.75, z, 0.16, 0.16, 2.4, POLE, ns);
    k.box(x, 4.35, z, 0.14, 0.5, 0.14, 0x3a3d42, ns);
  }
  powerPole(-6.1, -7.0); powerPole(6.1, 7.0);
  powerPole(-6.1, 9.6); powerPole(6.1, -9.6);
  function lamp(x, z, armDir) {
    k.box(x, 1.9, z, 0.18, 3.8, 0.18, 0x8a8d90);
    k.box(x + armDir * 0.55, 3.75, z, 1.1, 0.1, 0.12, 0x8a8d90, ns);
    k.box(x + armDir * 1.05, 3.62, z, 0.45, 0.16, 0.3, 0xf0e8c0, ns);
  }
  lamp(5.9, 12.6, -1);
  lamp(-5.9, -4.8, 1);

  // ---- "WELCOME TO NUKETOWN" sign + population counter, by the bulb
  (function sign(x, z) {
    for (const dz of [-1.7, 1.7]) k.box(x, 1.35, z + dz, 0.16, 2.7, 0.16, wood);
    k.box(x, 2.5, z, 0.14, 1.5, 4.0, 0xe8e2cc);            // board
    k.box(x - 0.09, 2.86, z, 0.04, 0.5, 3.2, 0x2f5f8f, ns);
    k.box(x - 0.09, 2.18, z, 0.04, 0.34, 2.4, 0x9a3a30, ns);
    k.box(x, 1.35, z, 0.12, 0.9, 1.5, 0x2e2f33);           // population counter
    k.box(x - 0.08, 1.4, z, 0.04, 0.5, 1.1, 0xd8c860, ns);
  })(-7.6, -13.6);

  // ---- countdown tower on the horizon (visual only, out of bounds west)
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    k.box(-17 + dx * 1.0, 6.7, -26 + dz * 1.0, 0.18, 13.4, 0.18, 0x9096a0, nsf);
  for (const ty of [2.5, 6.5, 10.5, 13.3]) {
    k.box(-17, ty, -26, 2.2, 0.14, 0.14, 0x9096a0, nsf);
    k.box(-17, ty, -26, 0.14, 0.14, 2.2, 0x9096a0, nsf);
  }
  k.box(-17, 15.6, -26, 4.4, 2.2, 0.2, 0x2e2f33, nsf);     // countdown board
  k.box(-17, 15.6, -26.12, 3.4, 1.2, 0.06, 0xd83a30, nsf);

  // ---- scattered cover
  k.barrel(-6.3, 13.6); k.barrel(6.3, -13.6);
  k.barrel(-4.9, 6.6); k.barrel(4.9, -6.6);
  k.crate(-9.6, -16.8); k.crate(9.6, 16.8);

  // ---- waypoints: coarse grid + mirrored hand-placed lane/door seeds
  const grid = [];
  for (const x of [-26, -23.5, -20.5, -18.2, -16, -13, -10.7, -7.6, -5, -2.5, 0, 2.5, 5, 7.6, 10.7, 13, 16, 18.2, 20.5, 23.5, 26])
    for (const z of [-18.4, -16, -13, -10, -7, -4, -1.4, 1.4, 4, 7, 10, 13, 16, 18.4])
      grid.push([x, z]);
  const half = [
    [-5.8, -0.85], [-7.4, -0.85],          // front gate out / in
    [-7.6, -6.6], [-7.6, 1.8],             // front-yard corners
    [-8.7, -0.85],                          // porch
    [-10.7, -0.85],                         // inside the front door
    [-11.6, -5.6], [-11.6, 1.4],           // living room (clear of the sofa)
    [-12.9, -2.9], [-14.3, -2.9],          // kitchen doorway
    [-16.2, -1.2], [-15.6, 1.6],           // kitchen
    [-16.8, -5.4], [-19.4, -5.4],          // back door in / out
    [-14.0, 2.3], [-14.0, 3.9],            // house <-> garage door
    [-12.2, 5.5], [-16.2, 5.5],            // garage interior
    [-10.4, 5.4], [-8.3, 5.4],             // garage mouth
    [-6.6, 5.4], [-4.8, 5.4],              // driveway -> street
    [-20.6, -7.4], [-22.4, -2.8], [-22.6, 5.6], // old yard midline
    [-24.6, -7.4], [-26.2, -2.8], [-24.9, 1.2], [-26.0, 5.6], // deeper spawn yard
    [-25.0, -9.5], [-25.0, -11.6],         // backyard west gate
    [-24.0, 7.6], [-24.0, 9.9],            // backyard east gate (staggered)
    [-16.5, 12.0], [-11.0, 14.6],          // south-east side lane
    [-13.0, -11.5], [-9.0, -12.4],         // south-west side lane
    [-4.4, -12.6], [-2.0, -8.6],           // the turnaround bulb
    [-1.6, 8.0], [-1.6, 13.4],             // mid-street lane (bus side)
    [2.2, 8.0], [1.4, -6.4],               // mid-street lane (truck side)
    [-0.2, 14.6],                           // blockade front
    // upstairs — three routes in: interior stair, rear deck stair, roof
    [-10.55, -8.2, 0.4], [-14.6, -8.2, 2.8],
    [-11.6, -6.4, 2.8], [-11.6, -0.2, 2.8], // street-window room
    [-14.6, -6.6, 2.8],                     // hall, clear of the stair rail
    [-15.8, -4.9, 2.8], [-15.8, -6.1, 2.8], // bedroom door out / in
    [-16.5, -8.4, 2.8],                     // bedroom
    [-16.9, -0.4, 2.8],                     // inside the rear-deck door
    [-19.3, -0.4, 2.8], [-19.3, 1.9, 2.8],  // rear deck + head of the stair
    [-19.3, 4.64, 0.4],                     // foot of the rear stair
    [-10.7, 8.5, 0.5], [-11.65, 8.5, 1.0],  // crate-chain climb to the garage roof
    [-12.6, 8.5, 1.5], [-13.55, 8.5, 2.0],
    [-14.5, 8.5, 2.5], [-14.5, 6.7, 2.8],
    [-14.2, 3.2, 2.8], [-14.0, 2.25, 2.8],  // roof -> upstairs window landing
  ];
  const extra = [];
  for (const [x, z, y] of half) extra.push([x, z, y], [-x, -z, y]);

  return {
    name: 'NUKETOWN',
    bounds: { x: W, z: D },
    sun: { color: 0xfff2d8, intensity: 1.0, pos: [30, 45, 20] },
    hemi: { sky: 0xbcd8ec, ground: 0x4e6a3a, intensity: 0.75 },
    spawns: {
      tf: [[-25.0, -6.4], [-26.4, -2.0], [-24.8, 1.4], [-25.6, -9.2], [-26.2, 5.6], [-23.4, -8.2]],
      sp: [[25.0, 6.4], [26.4, 2.0], [24.8, -1.4], [25.6, 9.2], [26.2, -5.6], [23.4, 8.2]],
    },
    waypointSeeds: grid.concat(extra),
    windows: k.windows,
  };
}

// ============================================================
// RUST — desert oil yard, MW2 layout per docs/rust-reference.md.
// Compass: +x = north, +z = east (top-down renders +x up). Zones:
// central multi-level tower, Pipeline along the north edge (over/
// under + spur), Oil Derrick NW, Front Gate NE (sp spawn) with the
// Comms Station shed, Red Containers + fuel tank on the east edge,
// Fuel Depot SE with the south barricade CQB pocket, Control Room
// and Maintenance south-center, Generators splitting mid west of
// the tower, Loading Dock SW (tf spawn), Blue Containers mid-west.
// #8b blockout: proportions + masses; #8c tower climb routes; #8d
// detail/cover pass (raised Control Room + slide into the faked-low
// Maintenance basin, generator pipes, dune pipe spur, zone garnish);
// #8e y-aware nav: seeds up the tower routes/platforms, a new derrick
// crate chain + rail gap feeding seeds on the derrick deck and the
// pipeline top.
// ============================================================
function buildRust(scene, colliders) {
  const k = new MapKit(scene, colliders);
  const W = 26; // 52×52 m playable square
  const rust = 0x8a5a3a, DECK = 0x6e4a2e, PIPE = 0x9a7a5a,
        DUNE = 0xa9885a, DUNE2 = 0xb59767, SHED = 0x7a6a55,
        MACHINE = 0x5a5e52, SANDBAG = 0x8f8060;

  scene.background = new THREE.Color(0xdcb887);
  scene.fog = new THREE.Fog(0xdcb887, 70, 150);

  // sand: desert plain beyond the dunes, solid slab inside
  k.box(0, -0.55, 0, 160, 1, 160, 0xbf9f68, { solid: false, shadow: false });
  k.box(0, -0.5, 0, W * 2 + 4, 1, W * 2 + 4, 0xc2a36b);

  // ---- perimeter: two-tier sand dunes (low foothill inside, taller
  // crest outside fake a slope) + wrecked-fence posts on the crest;
  // invisible walls do the real containment. The north crest has the
  // Front Gate opening (NE) — visual landmark, blocker keeps it shut.
  for (const s of [-1, 1]) {
    const gateOps = s > 0 ? [{ a: 14, b: 17.5, top: 2.6 }] : [];
    k.wall('z', -W - 3, W + 3, s * (W + 1.4), 3.2, 3.0, DUNE, gateOps); // N/S crest
    k.wall('x', -W - 3, W + 3, s * (W + 1.4), 3.2, 3.0, DUNE);         // E/W crest
    k.wall('z', -W, W, s * (W - 0.5), 1.3, 1.6, DUNE2,
      s > 0 ? [{ a: 13.5, b: 18, top: 1.3 }] : []);                    // foothills
    k.wall('x', -W, W, s * (W - 0.5), 1.3, 1.6, DUNE2);
    k.blocker(s * (W + 0.6), 6, 0, 1, 12, W * 2 + 6);
    k.blocker(0, 6, s * (W + 0.6), W * 2 + 6, 12, 1);
  }
  for (let i = -24; i <= 24; i += 5) {
    if ((i + 24) % 20 === 0) continue; // gaps read as wrecked fence
    for (const s of [-1, 1]) {
      k.box(s * (W + 1.4), 3.75, i, 0.14, 1.1, 0.14, 0x4a4a44, { solid: false });
      k.box(i, 3.75, s * (W + 1.4), 0.14, 1.1, 0.14, 0x4a4a44, { solid: false });
    }
  }
  // Front Gate posts flanking the crest opening
  k.box(W + 1.4, 1.8, 13.6, 0.55, 3.6, 0.55, 0x5c5852);
  k.box(W + 1.4, 1.8, 17.9, 0.55, 3.6, 0.55, 0x5c5852);

  // ---- central tower (#8c): multi-level derrick. Legs to 9.6 m, mid
  // platform at 3.3, railed top platform at 9.6, machinery maze between
  // the legs. Three walkable climb routes, every riser ≤ 0.53 (player
  // and bot step-up both handle ≤ 0.55):
  //   east crate-step chain (from the Red Containers side) -> mid platform,
  //   open stair up the west face: mid platform -> top through the NW
  //   rail gap (the reference's "pathways winding around the tower"),
  //   south exhaust chute: stepped duct, ground -> top (south rail gap).
  for (const [lx, lz] of [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]])
    k.box(lx, 4.8, lz, 0.55, 9.6, 0.55, rust);
  k.box(0, 3.3, 0, 6.6, 0.3, 6.6, DECK);            // mid platform
  k.box(0, 9.6, 0, 5.8, 0.3, 5.8, DECK);            // top platform
  k.box(0, 10.05, 2.9, 5.8, 0.6, 0.15, rust);       // top rails: east full,
  k.box(2.9, 10.05, 0, 0.15, 0.6, 5.8, rust);       // north full,
  k.box(-0.8, 10.05, -2.9, 4.2, 0.6, 0.15, rust);   // west (stair gap x 1.3..2.9 —
                                                    // open to the corner, so an
                                                    // arrival onto a leg top self-recovers),
  k.box(-2.9, 10.05, -1.25, 0.15, 0.6, 3.3, rust);  // south (chute gap z 0.4..2.9)
  // east crate-step chain: ground -> mid platform (risers 0.5, last 0.45)
  for (let i = 0; i < 6; i++) {
    const top = 0.5 * (i + 1);
    k.box(1.2, top / 2, 9.9 - 1.2 * i, 1.2, top, 1.2, i % 2 ? 0x6e5e40 : 0x7a6a4a);
  }
  // west stair: mid platform -> top, a steep open flight hung off the
  // frame on posts. Mount landing and arrival tread both sit between the
  // tower legs (|x| 2.525..3.075, they block a crossing player box), and
  // the landing is a full player-width deep — a sideways mount step onto
  // a tread-deep box can't fit, the next tread up occupies the head space.
  k.box(-1.95, 3.7125, -3.65, 1.1, 0.525, 1.1, DECK);   // mount landing, top 3.975
  for (let i = 2; i <= 11; i++)
    k.box(-1.22 + 0.36 * (i - 2), 3.45 + 0.2625 * i, -3.65, 0.36, 0.525 * i, 1.1, DECK);
  for (const px of [-1.6, 0.2, 1.8])
    k.box(px, 1.725, -3.65, 0.35, 3.45, 0.35, rust);
  // south exhaust chute: stepped duct from the ground to the top platform;
  // thin non-solid lips along both edges read as the duct walls
  for (let i = 1; i <= 18; i++) {
    const top = 0.53 * i, cx = -3.175 - 0.5 * (18 - i);
    k.box(cx, top / 2, 1.5, 0.5, top, 2.0, rust);
    k.box(cx, top + 0.2, 0.57, 0.5, 0.4, 0.14, DECK, { solid: false });
    k.box(cx, top + 0.2, 2.43, 0.5, 0.4, 0.14, DECK, { solid: false });
  }
  // under-tower machinery maze — one anchor per quadrant forces doglegs;
  // anything denser pinches the through-lanes under the 0.76 player width
  k.box(1.05, 0.8, -0.8, 1.4, 1.6, 1.5, MACHINE);
  k.box(-1.55, 0.6, 1.1, 1.4, 1.2, 1.6, MACHINE);
  k.box(2.4, 0.7, 2.4, 1.2, 1.4, 1.2, MACHINE);
  k.barrel(-1.2, -1.3);

  // ---- Pipeline: elevated pipe run covering the north edge, playable
  // over and under, with a spur toward the tower (visual cylinders +
  // one box collider each, supports every ~8 m)
  function pipeRun(cx, cz, len, alongZ) {
    for (const [oy, oa] of [[2.85, -0.45], [2.85, 0.45]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len, 12), k.mat(PIPE));
      if (alongZ) { m.rotation.x = Math.PI / 2; m.position.set(cx + oa, oy, cz); }
      else { m.rotation.z = Math.PI / 2; m.position.set(cx, oy, cz + oa); }
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }
    if (alongZ) k.blocker(cx, 3.0, cz, 2.0, 1.5, len);
    else k.blocker(cx, 3.0, cz, len, 1.5, 2.0);
  }
  pipeRun(21.5, 0, 48, true);                        // main run along the north edge
  pipeRun(14.5, -2, 14, false);                      // spur toward the tower
  pipeRun(24, 8, 5.5, false);                        // spur into the north dune
  for (const pz of [-22, -14, -6, 2, 10, 18])
    k.box(21.5, 1.15, pz, 0.5, 2.3, 0.5, rust);      // supports (walk-under stays clear)
  for (const px of [11.5, 18])
    k.box(px, 1.15, -2, 0.5, 2.3, 0.5, rust);
  k.box(24.2, 1.15, 8, 0.5, 2.3, 0.5, rust);         // dune-spur support

  // ---- Oil Derrick (NW): raised platform with top/ground/under levels.
  // Crate-step chain up the east face (#8e — the platform had no access;
  // same idiom as the tower's east chain, risers 0.5, last 0.35 onto the
  // 3.35 deck), and the pipeline-side rail is split with a gap so the
  // deck steps across onto the pipeline top (3.35 -> 3.75, riser 0.4;
  // the 0.3 m horizontal gap is bridged by the 0.76 body width)
  for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]])
    k.box(17.5 + lx, 1.6, -17.5 + lz, 0.45, 3.2, 0.45, rust);
  k.box(17.5, 3.2, -17.5, 5.4, 0.3, 5.4, DECK);
  k.box(17.5, 3.65, -20.1, 5.4, 0.6, 0.15, rust);    // rail on the perimeter faces
  k.box(20.1, 3.65, -19.3, 0.15, 0.6, 1.8, rust);    // pipeline-side rail, split:
  k.box(20.1, 3.65, -15.7, 0.15, 0.6, 1.8, rust);    // step-across gap z -18.4..-16.6
  k.box(16.8, 0.75, -16.8, 1.6, 1.5, 1.4, MACHINE);  // machinery underneath
  for (let i = 0; i < 6; i++) {
    const top = 0.5 * (i + 1);
    k.box(16.3, top / 2, -8.2 - 1.2 * i, 1.2, top, 1.2, i % 2 ? 0x6e5e40 : 0x7a6a4a);
  }

  // ---- Comms Station (NE, by the Front Gate): small corrugated shed
  k.wall('z', 9.5, 13, 16.6, 2.5, 0.2, SHED);
  k.wall('z', 9.5, 13, 13.6, 2.5, 0.2, SHED, [{ a: 10.5, b: 11.7, top: 2.1 }]);
  k.wall('x', 13.6, 16.6, 9.5, 2.5, 0.2, SHED);
  k.wall('x', 13.6, 16.6, 13, 2.5, 0.2, SHED);
  k.box(15.1, 2.6, 11.25, 3.6, 0.25, 4.1, 0x5a4a3a);
  k.box(15.1, 3.9, 12.4, 0.16, 2.4, 0.16, 0x8a8d90, { solid: false }); // antenna
  k.box(15.8, 0.4, 12.2, 1.4, 0.8, 0.8, 0x6a5a45);   // radio desk inside

  // ---- Front Gate verticality: stacked boxes inside the NE corner
  k.box(19.3, 0.75, 20.8, 1.5, 1.5, 1.5, 0x7a6a4a);
  k.box(19.3, 1.9, 20.4, 1.3, 1.3, 1.3, 0x6e5e40);

  // ---- Red Containers + fuel tank (east edge): transition lane between
  // Front Gate and Fuel Depot; hosts the tower mid-platform route (#8c)
  k.box(4, 1.3, 20.5, 6.5, 2.6, 2.5, 0x8a4a35);
  k.box(-2.5, 1.3, 19, 2.5, 2.6, 6, 0x9a4a30);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 5, 14), k.mat(0x8a8a45));
  tank.rotation.z = Math.PI / 2;
  tank.position.set(1, 1.4, 23);
  tank.castShadow = true; tank.receiveShadow = true;
  scene.add(tank);
  k.blocker(1, 1.4, 23, 5, 2.8, 2.8);

  // ---- Fuel Depot (SE): vertical tanks + barrier clutter
  for (const [tx, tz] of [[-18, 19.5], [-15.5, 16.5]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3.4, 14), k.mat(0x7a7a48));
    t.position.set(tx, 1.7, tz);
    t.castShadow = true; t.receiveShadow = true;
    scene.add(t);
    k.blocker(tx, 1.7, tz, 3.4, 3.4, 3.4);
  }
  k.box(-20.5, 0.65, 14.5, 2.8, 1.3, 0.9, 0x8a8478);

  // ---- south barricade CQB pocket (between Fuel Depot and Maintenance):
  // the tall scrap barricade is what kills the sightlines through here
  k.box(-19.5, 1.1, 9.5, 3.4, 2.2, 0.9, 0x6a5a45);
  k.box(-21, 0.55, 6, 0.9, 1.1, 3.4, SANDBAG);
  k.box(-22.5, 0.55, 11.5, 0.9, 1.1, 2.6, SANDBAG);
  k.crate(-18, 7, 1.2);

  // ---- Control Room (S-center): extremely small structure dividing
  // Generators from Maintenance, raised on a 1.06 m plinth — the engine
  // floor is clamped at y = 0 (moveEntity), so "Maintenance is low
  // ground" is faked by raising this side of it. Stepped entry from the
  // Generators (north) side, slide chute down the west face into the
  // Maintenance basin; every riser 0.53 (player and bot step-up ≤ 0.55)
  k.box(-11, 0.53, -1.5, 3.2, 1.06, 3.2, 0x6a5a48);            // plinth
  k.wall('z', -2.9, -0.1, -9.6, 2.3, 0.2, SHED, [{ a: -2.1, b: -0.9, top: 2.0 }], 1.06);
  k.wall('z', -2.9, -0.1, -12.4, 2.3, 0.2, SHED, [], 1.06);
  k.wall('x', -12.4, -9.6, -2.9, 2.3, 0.2, SHED, [{ a: -11.8, b: -10.6, top: 1.9 }], 1.06);
  k.wall('x', -12.4, -9.6, -0.1, 2.3, 0.2, SHED, [], 1.06);
  k.box(-11, 3.46, -1.5, 3.2, 0.25, 3.2, 0x5a4a3a);            // roof
  k.box(-12.0, 1.41, -0.7, 0.8, 0.7, 1.0, MACHINE);            // console
  k.box(-9.0, 0.265, -1.5, 0.7, 0.53, 1.2, 0x6a5a48);          // door entry step
  k.box(-11.2, 0.265, -3.6, 1.3, 0.53, 1.1, 0x6a5a48);         // slide tread

  // ---- Maintenance (S-center-west): the reference's low ground. A real
  // below-grade pit is impossible (world floor clamps at y = 0), so the
  // basin is faked: stained slab, steppable 0.45 m concrete lips (below
  // the 0.65 m nav knee ray, so no graph edges are cut) with open entries
  // toward the slide apron (N), the Loading Dock (W) and the CQB lane (E)
  k.box(-17, 0.015, -5.25, 8.0, 0.03, 6.5, 0x9c8455, { solid: false, shadow: false });
  const LIP = 0x8f8878;
  k.wall('z', -8.5, -6.2, -13, 0.45, 0.5, LIP);      // north edge (slide-apron gap)
  k.wall('z', -4.2, -2.0, -13, 0.45, 0.5, LIP);
  k.wall('x', -21, -18.6, -2.0, 0.45, 0.5, LIP);     // east edge (CQB-lane gap)
  k.wall('x', -16.2, -13, -2.0, 0.45, 0.5, LIP);
  k.wall('z', -8.5, -2.0, -21, 0.45, 0.5, LIP);      // south edge
  k.wall('x', -21, -18.8, -8.5, 0.45, 0.5, LIP);     // west edge (dock gap)
  k.wall('x', -16.4, -13, -8.5, 0.45, 0.5, LIP);
  k.crate(-17, -3, 1.3, 0x6e5e40); k.crate(-18.3, -3.6, 1.0, 0x7a6a4a);
  k.crate(-20, -7, 1.2);
  k.barrel(-16, -6.5); k.barrel(-19.8, -3.2, 0x5a6a45);
  // junked pipe on the basin floor (top 0.52: steppable, under the knee ray)
  const jp = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 2.6, 10), k.mat(PIPE));
  jp.rotation.x = Math.PI / 2; jp.position.set(-20.2, 0.26, -5.5);
  jp.castShadow = true; jp.receiveShadow = true;
  scene.add(jp);
  k.blocker(-20.2, 0.26, -5.5, 0.52, 0.52, 2.6);

  // ---- Generators: machinery blocks west of the tower splitting the
  // mid into north and south halves; pipes bridge the 0.6 m slots between
  // blocks (already too narrow to walk) so the split reads as one plant
  k.box(0.5, 1.1, -7.5, 2.4, 2.2, 3.2, MACHINE);
  k.box(-0.5, 0.95, -11, 2.0, 1.9, 2.6, MACHINE);
  k.box(1.5, 1.0, -14, 1.8, 2.0, 2.2, MACHINE);
  for (const [gx, gz, gy] of [[0, -9.4, 0.55], [0, -9.4, 1.15], [0.55, -12.6, 0.55], [0.55, -12.6, 1.15]]) {
    const gp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 10), k.mat(PIPE));
    gp.rotation.x = Math.PI / 2; gp.position.set(gx, gy, gz);
    gp.castShadow = true; gp.receiveShadow = true;
    scene.add(gp);
  }
  k.blocker(0, 0.85, -9.4, 0.7, 1.5, 2.2);
  k.blocker(0.55, 0.85, -12.6, 0.7, 1.5, 2.2);

  // ---- tri-level scaffold, SE face of the tower complex ([verify]
  // placement per the reference — recorded as approximate)
  for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]])
    k.box(-6 + lx, 1.9, 5.5 + lz, 0.35, 3.8, 0.35, 0x7a6248);
  k.box(-6, 1.7, 5.5, 3.6, 0.2, 3.6, 0x9a7a55);
  k.box(-6, 3.5, 5.5, 3.6, 0.2, 3.6, 0x9a7a55);

  // ---- Loading Dock (tf spawn, SW): container stack + barriers shield
  // the spawn pocket from the map without walling in the spawn points
  k.box(-15.5, 1.3, -16, 2.5, 2.6, 6, 0x4a6a8a);
  k.box(-15.5, 3.9, -15.2, 2.5, 2.6, 6, 0x5a7a4a);    // stacked second container
  k.box(-13.5, 1.3, -21.5, 6, 2.6, 2.5, 0x8a8a45);
  k.box(-12.5, 0.55, -16.5, 0.9, 1.1, 3.2, SANDBAG);
  k.box(-15, 0.55, -11.5, 3.2, 1.1, 0.9, SANDBAG);

  // ---- Blue Containers (mid-west edge): staggered pair forming the
  // short covered dogleg between Oil Derrick and Loading Dock
  k.box(3, 1.3, -18.5, 6, 2.6, 2.5, 0x4a6a8a);
  k.box(-3, 1.3, -22.3, 6, 2.6, 2.5, 0x3a5a7a);

  // ---- prop garnish (#8d): drums / pallets / tires per zone, placed
  // clear of waypoint seeds, spawn points, and the north under-pipe lane
  function pallet(cx, cz) { k.box(cx, 0.07, cz, 1.2, 0.14, 1.2, 0x8a6f45); }
  function tires(cx, cz) {
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.3, 12), k.mat(0x2e2e2c));
      t.position.set(cx + (i % 2 ? 0.05 : -0.04), 0.15 + 0.3 * i, cz + (i % 2 ? -0.05 : 0.04));
      t.castShadow = true; t.receiveShadow = true;
      scene.add(t);
    }
    k.blocker(cx, 0.45, cz, 1.04, 0.9, 1.04);
  }
  k.barrel(6, 8); k.barrel(6.8, 8.8);                // mid / tower surrounds
  k.crate(9, -7, 1.3, 0x6e5e40);
  k.crate(-7, 12, 1.2);
  k.barrel(-9, -12, 0x5a6a45);
  k.crate(12, 3, 1.1, 0x7a5a3a);
  tires(19.3, 18.9);                                 // Front Gate crate-stack clutter
  k.barrel(6.5, 18.6); pallet(7.7, 17.3);            // Red Containers lane
  k.barrel(-14.6, 19.4); k.barrel(-13.8, 18.8);      // Fuel Depot drums
  k.barrel(-15.2, 18.6, 0x5a6a45); pallet(-19.6, 13.2);
  tires(-21.5, 8.2);                                 // south CQB pocket
  pallet(15.0, -14.2); k.barrel(19.2, -15.0);        // Oil Derrick
  pallet(-11.8, -19.0); k.barrel(-10.5, -20.2);      // Loading Dock
  k.barrel(0.2, -17.0, 0x5a6a45);                    // Blue Containers dogleg
  pallet(-15, -7.5);                                 // basin pallet stack
  k.box(-15, 0.59, -7.3, 0.9, 0.9, 0.9, 0x7a6a4a);   // crate on the pallet

  // ---- waypoints: ground grid for the new footprint + lane/door seeds +
  // y-aware seeds (#8e) for the tower levels/climb routes, the derrick
  // deck, and the pipeline top. Elevated seeds sit ON their surface (the
  // graph's test box floats 0.56 above the seed y, clearing the next
  // 0.5/0.53 riser of a chain by design)
  const grid = [];
  for (const x of [-23, -17.5, -11.5, -5.5, 0, 5.5, 11.5, 17.5, 23])
    for (const z of [-23, -17.5, -11.5, -5.5, 0, 5.5, 11.5, 17.5, 23])
      grid.push([x, z]);
  const extra = [
    [20, 15.5], [22, 20],           // Front Gate pocket
    [12.8, 11.1], [15.1, 11.2],     // Comms Station door in/out
    [1, 17], [-2.5, 15],            // Red Containers lane
    [14, -5], [14, 1],              // under the pipeline spur
    [-8.3, -1.5], [-11, -1.5, 1.06], // Control Room door out/in (raised floor)
    [-11.2, -5],                    // slide bottom (Control Room -> basin)
    [-18, -4.8],                    // Maintenance basin
    [-20, 8], [-17, 11],            // south CQB pocket
    [-21.5, -15],                   // Loading Dock west lane
    [0, -20.6],                     // Blue Containers dogleg
    [4.5, -3.5], [-4.5, 3.5],       // tower corners
    // tower east crate chain (crates 0/2/4) -> mid platform arrival; the
    // mid seed links straight to the stair mount landing across the deck
    [1.2, 9.9, 0.5], [1.2, 7.5, 1.5], [1.2, 5.1, 2.5],
    [1.2, 2.2, 3.45],
    [-1.95, -3.65, 3.975],          // west stair mount landing
    [2.02, -3.65, 9.225],           // west stair top tread (one link per flight,
                                    // Nuketown-stair style)
    [1.8, -1.8, 9.75], [-1.8, 1.8, 9.75], // top platform (stair / chute rail gaps)
    [-13.3, 1.5],                   // chute ground apron
    // south chute, columns 1/6/11/16 — each seed sits 0.2 down-slope of
    // its column center: the columns are 0.5 deep vs the 0.76 body, so a
    // centered seed leaves a descending bot's feet propped 0.53 above the
    // node by the next column up, and the Δy<0.5 reach check never fires
    [-11.875, 1.5, 0.53], [-9.375, 1.5, 3.18],
    [-6.875, 1.5, 5.83], [-4.375, 1.5, 8.48],
    [16.3, -8.2, 0.5], [16.3, -11.8, 2.0],      // derrick crate chain (crates 0/3)
    [17.5, -17.5, 3.35], [19.4, -17.5, 3.35],   // derrick deck + rail-gap edge
    [21.5, -17.5, 3.75],            // pipeline top: derrick step-across junction
    [21.5, -22, 3.75], [21.5, -10, 3.75], [21.5, -2, 3.75], // main run
    [21.5, 6, 3.75], [21.5, 13, 3.75], [21.5, 20, 3.75],
    [16, -2, 3.75], [10, -2, 3.75], // tower-spur top (dead-ends short of the tip)
  ];

  return {
    name: 'RUST',
    bounds: { x: W, z: W },
    sun: { color: 0xffd9a8, intensity: 1.1, pos: [-25, 38, 15] },
    hemi: { sky: 0xe8c8a0, ground: 0x8a6a45, intensity: 0.7 },
    spawns: {
      tf: [[-21.5, -20.5], [-23, -17], [-17.5, -24], [-20, -13], [-13.5, -19], [-23, -23]],
      sp: [[21.5, 20.5], [23, 17], [17.5, 22.5], [19, 13], [13.5, 19], [23, 23]],
    },
    waypointSeeds: grid.concat(extra),
    windows: k.windows,
  };
}

// ============================================================
// SHIPMENT — CoD4 container yard, per docs/shipment-reference.md (#21) as
// corrected by docs/shipment-overhaul.md (#21b). Compass: +x = north,
// +z = east (top-down +x up). A tiny 26×24 m walled yard, the smallest map
// here. The identity is a central CROSSROADS formed by a 2×2 of shipping
// containers (two hollow walk-throughs on the NW+SE diagonal, two solid
// climb-on-top perches on the NE+SW diagonal). Hollow walk-through
// containers sit off the N/S end walls, leaned (yawed) container pairs lean
// against the E/W side walls, and the corners hold debris (junk cars,
// barrels, crates) — NOT container stacks. Double-stacked container
// perimeter, no exits. tf spawns hug the south (−x) end, sp the north (+x)
// end. 180° point symmetry so both halves are identical. Brutal CQB.
// The engine is AABB-only, so leaned containers rotate the visible mesh but
// collide via a stepped axis-aligned hull; see leanedContainer/steppedHull.
// ============================================================
function buildShipment(scene, colliders) {
  const k = new MapKit(scene, colliders);
  const W = 13, D = 12;    // 26 × 24 m playable (square-ish, real Shipment)
  const H = 2.6, CL = 6;   // container height (tops walkable) + long-axis length
  // weathered container palette (desaturated, oxidised — not primaries)
  const BLUE = 0x3a5670, GREEN = 0x4a6540, YELL = 0x9c8636, RUST = 0x8a4b34,
        GREY = 0x565a5c, TEAL = 0x3d6b64, MAROON = 0x6e3d38, CRATE = 0x6f5f3f,
        FRAME = 0x2b2f31;   // dark corten steel frame/corrugation shadow

  scene.background = new THREE.Color(0x8f9aa6);
  scene.fog = new THREE.Fog(0x8f9aa6, 55, 120);

  // ground: gravel yard slab over a wider dirt plain
  k.box(0, -0.55, 0, 120, 1, 120, 0x6f6a60, { solid: false, shadow: false });
  k.box(0, -0.5, 0, W * 2 + 4, 1, D * 2 + 4, 0x7c766a);
  // faded painted deck lines + oil stains for texture
  for (const sx of [-1, 1]) k.box(sx * 5.5, 0.02, 0, 0.18, 0.02, D * 2 - 2, 0x8a8474, { solid: false, shadow: false });
  k.box(0, 0.02, 0, 3.2, 0.02, 2.0, 0x5f5a52, { solid: false, shadow: false });

  const shade = (hex, f) => {
    const r = Math.min(255, ((hex >> 16) & 255) * f) | 0;
    const g = Math.min(255, ((hex >> 8) & 255) * f) | 0;
    const b = Math.min(255, (hex & 255) * f) | 0;
    return (r << 16) | (g << 8) | b;
  };
  // Vertical corrugation ribs proud of both long faces of a container, as a
  // single InstancedMesh. `ofs` pushes the ribs out to the visible face for
  // hollow containers whose face sits at a wall, not at ±1.3.
  function ribs(cx, cy, cz, ax, len, color, ofs = 1.3) {
    const nR = Math.max(3, Math.round((len - 0.3) / 0.32));
    const ribH = H - 0.34, pr = 0.05, hl = len / 2;
    const geo = new THREE.BoxGeometry(ax ? 0.075 : pr, ribH, ax ? pr : 0.075);
    const im = new THREE.InstancedMesh(geo, k.mat(shade(color, 0.7)), nR * 2);
    const m4 = new THREE.Matrix4(); let n = 0;
    for (const side of [-1, 1])
      for (let i = 0; i < nR; i++) {
        const u = -hl + (i + 0.5) * (len / nR), c = (ofs + pr / 2) * side;
        m4.setPosition(ax ? cx + u : cx + c, cy, ax ? cz + c : cz + u);
        im.setMatrixAt(n++, m4);
      }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
  }
  // Steel frame (decorative, no collision): 4 corner posts + top & bottom
  // perimeter rails, sized to a footprint half-extents (hx, hz).
  function frame(cx, cy, cz, hx, hz) {
    const P = 0.12, dec = { solid: false }, lo = cy - H / 2, hi = cy + H / 2;
    for (const su of [-1, 1]) for (const sv of [-1, 1])
      k.box(cx + su * hx, cy, cz + sv * hz, P, H, P, FRAME, dec);
    for (const y of [lo + P / 2, hi - P / 2]) {
      k.box(cx, y, cz + hz, 2 * hx, P, P, FRAME, dec);
      k.box(cx, y, cz - hz, 2 * hx, P, P, FRAME, dec);
      k.box(cx + hx, y, cz, P, P, 2 * hz, FRAME, dec);
      k.box(cx - hx, y, cz, P, P, 2 * hz, FRAME, dec);
    }
  }
  // A detailed SOLID shipping container: solid body (the only collider)
  // dressed with corrugated ribs, a corner-post + rail steel frame, and
  // cargo doors with locking rods on one end. Everything but the body is
  // decorative, so collision/nav are unchanged from a plain box.
  function container(cx, cy, cz, axis, color, len = CL) {
    const ax = axis === 'x';
    k.box(cx, cy, cz, ax ? len : 2.6, H, ax ? 2.6 : len, color);   // body + collider
    ribs(cx, cy, cz, ax, len, color);
    frame(cx, cy, cz, ax ? len / 2 : 1.3, ax ? 1.3 : len / 2);
    // end doors (one end): centre seam + 4 vertical locking rods + 2 handles
    const hl = len / 2, dec = { solid: false };
    const ex = ax ? cx + hl + 0.03 : cx, ez = ax ? cz : cz + hl + 0.03;
    k.box(ex, cy, ez, ax ? 0.04 : 0.1, H - 0.3, ax ? 0.1 : 0.04, shade(color, 0.55), dec);
    for (const o of [-0.85, -0.32, 0.32, 0.85]) {
      k.box(ax ? ex : cx + o, cy, ax ? cz + o : ez, ax ? 0.05 : 0.07, H - 0.5, ax ? 0.07 : 0.05, FRAME, dec);
      k.box(ax ? ex + 0.02 : cx + o, cy - 0.15, ax ? cz + o : ez + 0.02, ax ? 0.06 : 0.16, 0.1, ax ? 0.16 : 0.06, FRAME, dec);
    }
  }

  // A HOLLOW, walk-through container (S1): two long thin side walls plus a
  // walkable roof slab are the ONLY colliders — the ends are OPEN (decorative
  // frame/lintel only, no body/end collider) so a player or bot walks
  // straight through along the long axis. Nav seeds thread the open axis.
  function hollowContainer(cx, cy, cz, axis, color) {
    const len = CL, ax = axis === 'x', hl = len / 2, hw = 1.3;
    const lo = cy - H / 2, hi = cy + H / 2, WT = 0.14;
    // two long side walls (colliders), thin across the short axis, full height
    for (const sv of [-1, 1]) {
      const wx = ax ? cx : cx + sv * hw, wz = ax ? cz + sv * hw : cz;
      k.box(wx, cy, wz, ax ? len : WT, H, ax ? WT : len, color);
    }
    ribs(cx, cy, cz, ax, len, color, hw + WT / 2);
    // walkable roof slab (collider), interior floor tint (decorative)
    k.box(cx, hi - WT / 2, cz, ax ? len : 2.6, WT, ax ? 2.6 : len, shade(color, 0.86));
    k.box(cx, lo + 0.03, cz, ax ? len : 2.6, 0.05, ax ? 2.6 : len, shade(color, 0.5), { solid: false });
    frame(cx, cy, cz, ax ? hl : hw, ax ? hw : hl);
    // open-end header lintels (decorative — sit above head height, no block)
    const dk = shade(color, 0.72), dec = { solid: false };
    for (const su of [-1, 1]) {
      const ex = ax ? cx + su * hl : cx, ez = ax ? cz : cz + su * hl;
      k.box(ex, hi - 0.18, ez, ax ? 0.1 : 2.6, 0.28, ax ? 2.6 : 0.1, dk, dec);
    }
  }

  // A LEANED (yawed) container (S2/D1): the visible mesh rotates about y, but
  // the engine is AABB-only, so collision is a stepped hull of small
  // axis-aligned blocker boxes marched along the yawed centerline
  // (steppedHull). Visible mesh and hull disagree only by small slivers at
  // the ends / mid-flanks — an intentional, sub-tuning-tolerance deviation,
  // because true OBB colliders would touch movement, throwables, LOS,
  // minimap and nav (all axis-aligned) — out of scope for a map.
  function leanedContainer(cx, cz, yaw, color) {
    const len = CL, hl = len / 2, hw = 1.3, cy = 1.3, P = 0.12;
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    g.rotation.y = yaw;
    const add = (geo, col, x, y, z) => {
      const m = new THREE.Mesh(geo, k.mat(col));
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      g.add(m); return m;
    };
    add(new THREE.BoxGeometry(len, H, 2.6), color, 0, 0, 0);   // body (mesh only)
    // corrugation ribs on both long faces (local space)
    const nR = Math.max(3, Math.round((len - 0.3) / 0.32)), ribH = H - 0.34, pr = 0.05;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, ribH, pr), k.mat(shade(color, 0.7)), nR * 2);
    const m4 = new THREE.Matrix4(); let n = 0;
    for (const side of [-1, 1])
      for (let i = 0; i < nR; i++) {
        m4.setPosition(-hl + (i + 0.5) * (len / nR), 0, (hw + pr / 2) * side);
        im.setMatrixAt(n++, m4);
      }
    im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true;
    g.add(im);
    // steel frame: 4 corner posts + top/bottom rails (local space)
    for (const su of [-1, 1]) for (const sv of [-1, 1])
      add(new THREE.BoxGeometry(P, H, P), FRAME, su * hl, 0, sv * hw);
    for (const y of [-H / 2 + P / 2, H / 2 - P / 2]) for (const sv of [-1, 1])
      add(new THREE.BoxGeometry(len, P, P), FRAME, 0, y, sv * hw);
    // cargo doors on one end
    add(new THREE.BoxGeometry(0.06, H - 0.3, 2.4), shade(color, 0.55), hl + 0.02, 0, 0);
    scene.add(g);
    steppedHull(cx, cz, yaw, len);
  }
  // Stepped AABB hull for a leaned container: 3 axis-aligned blocker boxes
  // marched along the yawed centerline, each tightly bounding a ~len/3 slice
  // of the yawed footprint. Tops sit at H (walkable if a climb reaches them;
  // here they are cover only). Overlapping so the roof reads continuous.
  function steppedHull(cx, cz, yaw, len) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw), seg = len / 3, WD = 2.6;
    const bw = Math.abs(seg * cs) + Math.abs(WD * sn) + 0.04;
    const bd = Math.abs(seg * sn) + Math.abs(WD * cs) + 0.04;
    for (const u of [-seg, 0, seg])
      k.blocker(cx + u * cs, 1.3, cz + u * sn, bw, H, bd);
  }

  // ---- perimeter (S3): double-stacked container wall, no exits. N/S walls
  // run along z at x = ±W (4 units, cover z −12..12), E/W walls along x at
  // z = ±D (4 units at x = ±9, ±3, cover x −12..12; the ±12..13 ends are
  // wrapped by the N/S walls). Invisible blockers seal + cap the box so a
  // player on an inner container can't peek or slip out.
  const wallCols = [BLUE, RUST, GREEN, YELL, GREY, TEAL, MAROON];
  for (const s of [-1, 1]) {
    let ci = 0;
    for (const z of [-9, -3, 3, 9])
      for (let lvl = 0; lvl < 2; lvl++)
        container(s * W, 1.3 + lvl * H, z, 'z', wallCols[(ci++ + (s > 0 ? 2 : 0)) % wallCols.length]);
    for (const x of [-9, -3, 3, 9])
      for (let lvl = 0; lvl < 2; lvl++)
        container(x, 1.3 + lvl * H, s * D, 'x', wallCols[(ci++ + (s > 0 ? 1 : 3)) % wallCols.length]);
    k.blocker(s * (W + 0.6), 5, 0, 1, 14, D * 2 + 4);   // N/S containment cap
    k.blocker(0, 5, s * (D + 0.6), W * 2 + 4, 14, 1);   // E/W containment cap
  }

  // ---- A. Center 2×2 — the crossroads (S4, the identity). Four x-long
  // containers with a 2.2 m N–S lane (|z|≲1.1) and a 2.6 m E–W lane (|x|≲1.3)
  // meeting at the origin. NW + SE are HOLLOW walk-throughs (open along x);
  // NE + SW are SOLID climb-on-top perches. Point-symmetric.
  container(4.3, 1.3, 2.4, 'x', RUST);        // NE solid
  container(-4.3, 1.3, -2.4, 'x', BLUE);      // SW solid (mirror)
  hollowContainer(4.3, 1.3, -2.4, 'x', GREEN);  // NW hollow
  hollowContainer(-4.3, 1.3, 2.4, 'x', YELL);   // SE hollow (mirror)

  // ---- B. N/S end containers (S4): z-long HOLLOW walk-throughs ~1 m off each
  // end wall, open along z (E/W ends). Team spawns tuck behind/beside them.
  hollowContainer(10.5, 1.3, 0, 'z', TEAL);    // N end hollow
  hollowContainer(-10.5, 1.3, 0, 'z', MAROON); // S end hollow (mirror)

  // ---- C. E/W leaned pairs (S4/D1): two yawed containers each against the
  // side walls, forming a shallow V with a narrow gap on the x = 0 lane.
  for (const s of [-1, 1]) {
    leanedContainer(s * 3.4, s * -9.7, s * -0.28, GREY);   // outer of the V
    leanedContainer(s * -3.4, s * -9.7, s * 0.28, GREEN);  // inner of the V
  }

  // ---- D. Corners (S4): debris only — junk cars on the NE/SW diagonal,
  // barrel + crate clusters on the NW/SE diagonal. Cover height, nothing
  // tall enough to perch on or peek the world.
  function cornerDebris(sx, sz, withCar) {
    if (withCar) k.car(sx * 9.6, sz * 10.2, 0x6a6660);
    else k.crate(sx * 9.4, sz * 10.4, 1.1, 0x6a5a3c);
    k.barrel(sx * 10.8, sz * 10.6); k.barrel(sx * 8.4, sz * 11.0);
    k.crate(sx * 11.0, sz * 11.2, 1.0);
  }
  cornerDebris(1, 1, true); cornerDebris(-1, -1, true);    // NE, SW: cars
  cornerDebris(1, -1, false); cornerDebris(-1, 1, false);  // NW, SE: clusters

  // ---- D-climb. Verticality (S5): a 5-crate step chain onto each SOLID
  // center perch (NE + SW), off its outer (±z) face. Crate tops rise 0.5 →
  // 2.5 then a 0.1 step onto the 2.6 container — every rise well under the
  // 0.55 step-up so both players and bots follow (a rise of exactly 0.55
  // fails a float compare, so the last crate is 2.5, not 2.05). The hollow
  // center/end roofs are left as player-only parkour (no bot seeds) to avoid
  // cross-gap roof edges in the AABB/LOS nav graph.
  const climbZs = [6.1, 5.6, 5.1, 4.6, 4.1], climbTops = [0.5, 1.0, 1.5, 2.0, 2.5];
  for (const s of [-1, 1])
    for (let i = 0; i < climbZs.length; i++)
      k.box(s * 4.3, climbTops[i] / 2, s * climbZs[i], 0.9, climbTops[i], 0.6, CRATE);

  // ---- scatter garnish in the four quadrant open areas, deliberately OFF the
  // four lanes and the crossroads (those must stay open) and clear of spawns,
  // waypoint seeds and the leaned/corner masses.
  k.barrel(5.8, 5.8); k.barrel(-5.8, -5.8);          // NE / SW quadrant
  k.crate(5.8, -5.8, 1.0); k.crate(-5.8, 5.8, 1.0);  // NW / SE quadrant

  // ---- spawns (S6): tf south (−x), sp north (+x). Five points per team
  // across the end, tucked to the flanks (the end hollow blocks z≈0) plus
  // one forward lane point. Verified clear of all geometry + leaned hulls.
  const spN = [[11.2, -7.2], [11.2, -3.8], [11.2, 3.8], [11.2, 7.2], [7.6, 0]];
  const spawns = { sp: spN, tf: spN.map(([x, z]) => [-x, -z]) };

  // ---- waypoints (S7): crossroads hub + four lanes + perimeter ring, seeds
  // threaded through both hollow center containers and both N/S hollows, plus
  // y-aware seeds up each solid perch's crate chain onto its roof. Point-
  // symmetric: push2/push3 add a seed and its 180° mirror. buildNavGraph
  // filters any seed that lands inside geometry.
  const seeds = [[0, 0]];               // crossroads hub (self-symmetric)
  const push2 = (x, z) => { seeds.push([x, z], [-x, -z]); };
  const push3 = (x, z, y) => { seeds.push([x, z, y], [-x, -z, y]); };
  push2(3.5, 0); push2(7.6, 0);                       // N–S lane
  push2(0, 3.5); push2(0, 7.6);                       // E–W lane
  push2(4.3, 7.2); push2(8.4, 7.2); push2(8.8, 3.6);  // NE-side pockets
  push2(4.3, -7.2); push2(8.4, -7.2); push2(8.8, -3.6); // NW-side pockets
  push2(11.0, 7.4); push2(11.0, -7.4);                // near-spawn ring
  push2(11.0, 3.8); push2(11.0, -3.8);
  // NW center hollow walk-through (open along x): interior + both entries
  push2(4.3, -2.4); push2(2.4, -2.4); push2(6.2, -2.4);
  push2(0.7, -2.4); push2(8.4, -2.4);
  // N end hollow walk-through (open along z): interior + both end entries
  push2(10.5, 0); push2(10.5, 1.9); push2(10.5, -1.9);
  push2(10.5, 3.9); push2(10.5, -3.9);
  // NE solid perch: crate chain treads + roof top (mirrored → SW perch)
  for (let i = 0; i < climbZs.length; i++) push3(4.3, climbZs[i], climbTops[i]);
  push3(4.3, 3.0, 2.6); push3(4.3, 2.0, 2.6);

  return {
    name: 'SHIPMENT',
    bounds: { x: W, z: D },
    sun: { color: 0xf2f4f8, intensity: 1.0, pos: [18, 40, -22] },
    hemi: { sky: 0xbcccdc, ground: 0x6a6258, intensity: 0.8 },
    spawns,
    waypointSeeds: seeds,
    windows: k.windows,
  };
}

const MAPS = { nuketown: buildNuketown, rust: buildRust, shipment: buildShipment };

// ============================================================
// Waypoint graph — filter seeds that land inside geometry, then
// connect pairs with clear waist-height line of sight.
// Seeds are [x, z] (ground) or [x, z, y] (elevated: stairs, floors).
// Steep links (beyond the 0.55 step-up) are DIRECTED: bidirectional
// only when the terrain under the link rises with it (stairs, chutes,
// crate chains — climbable both ways); open-air links (a clear ray off
// a ledge/pipe to the ground) get the downhill direction only. Before
// this, BFS hop-counts preferred those drop links uphill and bots
// jittered under waypoints they could never reach (#8e).
// ============================================================
const _cbMid = new THREE.Vector3();
const _cbDown = new THREE.Vector3(0, -1, 0);
function _climbable(pa, pb, colliders) {
  const hiY = Math.max(pa.y, pb.y), loY = Math.min(pa.y, pb.y);
  _cbMid.set((pa.x + pb.x) / 2, hiY + 0.3, (pa.z + pb.z) / 2);
  const hit = rayWorld(_cbMid, _cbDown, hiY + 1.3, colliders);
  const ground = hit ? hit.point.y : 0;
  return ground >= (hiY + loY) / 2 - 0.6;
}
function buildNavGraph(seeds, colliders) {
  const pts = [];
  const testMin = new THREE.Vector3(), testMax = new THREE.Vector3();
  const testBox = new THREE.Box3(testMin, testMax);
  for (const [x, z, y = 0] of seeds) {
    // test box bottom sits above step-up height so climbable ledges
    // (stair treads) don't reject a seed; width matches the bot body
    testMin.set(x - 0.38, y + 0.56, z - 0.38);
    testMax.set(x + 0.38, y + 1.6, z + 0.38);
    let blocked = false;
    for (const c of colliders) {
      if (c.intersectsBox(testBox)) { blocked = true; break; }
    }
    if (!blocked) pts.push(new THREE.Vector3(x, y, z));
  }
  const edges = pts.map(() => []);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = pts[i].distanceTo(pts[j]);
      if (d > 8.6) continue;
      a.copy(pts[i]); a.y += 1.1;
      b.copy(pts[j]); b.y += 1.1;
      if (!corridorClear(a, b, colliders)) continue;
      const dy = pts[j].y - pts[i].y;
      if (Math.abs(dy) <= 0.55 || _climbable(pts[i], pts[j], colliders)) {
        edges[i].push(j); edges[j].push(i);
      } else if (dy > 0) {
        edges[j].push(i);              // j higher: drop-only, j -> i
      } else {
        edges[i].push(j);              // i higher: drop-only, i -> j
      }
    }
  }
  return { points: pts, edges };
}

// BFS path between waypoint indices
function navPath(graph, from, to) {
  if (from === to) return [to];
  const prev = new Array(graph.points.length).fill(-1);
  const q = [from];
  prev[from] = from;
  while (q.length) {
    const cur = q.shift();
    for (const n of graph.edges[cur]) {
      if (prev[n] === -1) {
        prev[n] = cur;
        if (n === to) {
          const path = [to];
          let p = to;
          while (p !== from) { p = prev[p]; path.push(p); }
          return path.reverse();
        }
        q.push(n);
      }
    }
  }
  return null;
}

// Up to `max` waypoint indices visible from pos at waist height,
// nearest first. Scans only the closest candidates to bound cost.
const _nwA = new THREE.Vector3(), _nwB = new THREE.Vector3();
function visibleWaypoints(graph, pos, colliders, max = 1) {
  const order = graph.points
    .map((p, i) => [pos.distanceTo(p), i])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  _nwA.set(pos.x, pos.y + 1.1, pos.z);
  const tries = Math.min(order.length, 16);
  for (let k = 0; k < tries && out.length < max; k++) {
    const i = order[k][1];
    _nwB.copy(graph.points[i]); _nwB.y += 1.1;
    if (corridorClear(_nwA, _nwB, colliders)) out.push(i);
  }
  return out;
}

// With colliders, prefers the nearest waypoint that is visible at waist
// height — a position pushed off the graph (e.g. wall-adjacent) must not
// resolve to a node on the far side of that wall, or every path starts
// from an unreachable node. Falls back to pure distance if nothing among
// the closest candidates is visible.
function nearestWaypoint(graph, pos, colliders) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < graph.points.length; i++) {
    const d = pos.distanceTo(graph.points[i]);
    if (d < bd) { bd = d; best = i; }
  }
  if (!colliders) return best;
  const vis = visibleWaypoints(graph, pos, colliders, 1);
  return vis.length ? vis[0] : best;
}
