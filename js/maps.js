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

class MapKit {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
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
  barrel(cx, cz, color = 0x8a4a35) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 10), this.mat(color));
    m.position.set(cx, 0.55, cz);
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    this.blocker(cx, 0.55, cz, 0.8, 1.1, 0.8);
  }
}

// ============================================================
// NUKETOWN — cul-de-sac layout: two two-storey houses set
// diagonally across the street, school bus dead center, picket-
// fenced front/flank yards, carport driveways, gated backyard
// spawns. The whole map is point-symmetric about the origin.
// ============================================================
function buildNuketown(scene, colliders) {
  const k = new MapKit(scene, colliders);
  const W = 18, D = 24; // half extents
  const T = 0.3;
  const wood = 0x8a6d4a;

  scene.background = new THREE.Color(0x9fc4e0);
  scene.fog = new THREE.Fog(0x9fc4e0, 70, 150);

  // ---- ground: lawn, street down the middle, cul-de-sac circle
  k.box(0, -0.5, 0, W * 2 + 2, 1, D * 2 + 2, 0x567f3c);
  k.box(0, 0.012, 0, 6, 0.024, D * 2, 0x5b5e63, { solid: false, shadow: false });
  const circle = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 6.8, 0.024, 28), k.mat(0x5b5e63));
  circle.position.set(0, 0.012, 0);
  circle.receiveShadow = true;
  scene.add(circle);
  for (const s of [-1, 1]) k.box(4.1 * s, 0.02, 0, 1.2, 0.024, D * 2, 0x8f8d86, { solid: false, shadow: false });
  for (let z = -22; z <= 22; z += 3)
    if (Math.abs(z) > 7.5) k.box(0, 0.03, z, 0.22, 0.02, 1.4, 0xd8c860, { solid: false, shadow: false });

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
  });

  // ---- house: footprint x -15..-5, z -17..-9, front faces the center.
  // Ground floor: living room + kitchen; staircase up to a second
  // storey with windows overlooking the street and front yard.
  function house(s, wallC, innerC, roofC) {
    const t = xform(s);
    const H1 = 2.8, H2 = 2.6, TOP = H1 + H2;
    // ground floor shell
    t.wall('x', -15, -5, -9, H1, T, wallC, [
      { a: -7.0, b: -5.8, top: 2.2 },                 // front door
      { a: -13.5, b: -11.5, bottom: 1.15, top: 2.45 },// picture window
    ]);
    t.wall('x', -15, -5, -17, H1, T, wallC, [
      { a: -13.6, b: -12.4, top: 2.2 },               // back door
      { a: -9.2, b: -7.6, bottom: 1.15, top: 2.3 },   // kitchen window
    ]);
    t.wall('z', -17, -9, -15, H1, T, wallC, [{ a: -14.2, b: -12.6, bottom: 1.15, top: 2.3 }]);
    t.wall('z', -17, -9, -5, H1, T, wallC, [{ a: -11.4, b: -9.8, bottom: 1.15, top: 2.3 }]);
    t.wall('x', -15, -9, -13, H1, T, innerC, [{ a: -11.6, b: -10.4, top: 2.2 }]); // kitchen wall
    // second storey
    t.wall('x', -15, -5, -9, H2, T, wallC, [
      { a: -13.2, b: -10.8, bottom: 0.9, top: 2.3 },
      { a: -7.6, b: -6.0, bottom: 0.9, top: 2.3 },
    ], H1);
    t.wall('x', -15, -5, -17, H2, T, wallC, [{ a: -12.4, b: -10.6, bottom: 0.9, top: 2.3 }], H1);
    t.wall('z', -17, -9, -15, H2, T, wallC, [], H1);
    t.wall('z', -17, -9, -5, H2, T, wallC, [{ a: -13.0, b: -11.0, bottom: 0.9, top: 2.3 }], H1);
    t.wall('z', -17, -13.2, -10, H2, T, innerC, [{ a: -14.6, b: -13.4, top: 2.2 }], H1); // bedroom wall
    // upstairs floor slab with a hole over the staircase
    const fC = 0x6e5637;
    t.box(-10.85, H1 - 0.075, -13, 8.3, 0.15, 8, fC);
    t.box(-5.85, H1 - 0.075, -10.25, 1.7, 0.15, 2.5, fC);
    t.box(-5.85, H1 - 0.075, -15.5, 1.7, 0.15, 3.0, fC);
    t.box(-6.78, H1 + 0.42, -12.75, 0.1, 0.85, 2.6, innerC); // rail at the hole
    // staircase along the east wall
    for (let i = 0; i < 7; i++)
      t.box(-5.72, 0.2 * (i + 1), -11.065 - 0.53 * i, 1.15, 0.4 * (i + 1), 0.53, 0x7a6248);
    // roof + chimney
    t.box(-10, TOP + 0.14, -13, 10.8, 0.28, 8.8, roofC);
    t.box(-10, TOP + 0.42, -13, 10.8, 0.28, 5.6, roofC);
    t.box(-12.6, TOP + 0.95, -14.6, 0.8, 1.5, 0.8, 0x8a5a4a);
    // porch
    t.box(-6.4, 0.05, -8.35, 2.4, 0.1, 1.5, 0x9b9890, { solid: false });
    t.box(-7.45, 1.2, -8.2, 0.16, 2.4, 0.16, 0xe6e4da);
    t.box(-5.35, 1.2, -8.2, 0.16, 2.4, 0.16, 0xe6e4da);
    t.box(-6.4, 2.48, -8.3, 2.7, 0.16, 1.8, roofC);
    // furniture (kept against walls so bots keep clean lanes)
    t.box(-14.3, 0.4, -10.8, 1.1, 0.8, 2.2, 0x7a4a3a);       // sofa
    t.box(-10.8, 0.5, -16.3, 2.6, 1.0, 1.0, 0xb0aca0);       // kitchen counter
    t.box(-13.7, H1 + 0.3, -15.6, 1.7, 0.6, 2.3, 0x6a7a94);  // bed
    t.box(-13.9, H1 + 0.35, -10.0, 1.4, 0.7, 1.0, 0x84765a); // dresser
  }
  house(1, 0xd7c05a, 0xcfc7b2, 0x55504a);   // yellow house, south-west
  house(-1, 0x9cba86, 0xcfc7b2, 0x4e4a44);  // green house, north-east

  function pickup(t, cx, cz, col) {
    t.box(cx, 0.8, cz, 1.9, 0.9, 4.4, col);
    t.box(cx, 1.62, cz - 1.2, 1.8, 0.75, 1.8, col);
    t.box(cx, 1.35, cz + 1.1, 1.6, 0.25, 2.0, 0x2a2d31, { solid: false }); // bed cavity
  }

  // ---- yards: picket-fenced front + flank yards, carport driveway,
  // gated backyard fence (one set per half, mirrored)
  function yard(s) {
    const t = xform(s);
    const P = 0xe6e4da, FH = 1.25, PT = 0.16;
    t.wall('z', -9, -4.2, -4, FH, PT, P, [{ a: -7.0, b: -5.8 }]);     // front yard, street side
    t.wall('x', -15, -4, -4.2, FH, PT, P, [{ a: -14.2, b: -13.0 }]);  // front yard, center side
    t.wall('x', -15, -9, 0, FH, PT, P, [{ a: -12.6, b: -11.4 }]);     // flank-yard divider
    t.wall('z', -4.2, 1.8, -4, FH, PT, P, [{ a: -2.6, b: -1.4 }]);    // street fence, flank yard
    t.wall('x', 3, 18, -17, 2.2, T, wood, [{ a: 9.4, b: 10.6 }]);     // backyard fence + gate
    // mailbox by the walkway
    t.box(-4.5, 0.5, -7.8, 0.12, 1.0, 0.12, 0x50524f);
    t.box(-4.5, 1.12, -7.8, 0.34, 0.26, 0.55, 0x9a3a30);
    // carport + pickup in the driveway yard
    for (const [px, pz] of [[6.4, -10.4], [6.4, -15.6], [11.6, -10.4], [11.6, -15.6]])
      t.box(px, 1.3, pz, 0.22, 2.6, 0.22, wood);
    t.box(9, 2.7, -13, 5.6, 0.2, 5.6, 0x74707a);
    pickup(t, 9, -12.8, s > 0 ? 0x6a7a94 : 0xa08040);
    // swing set at the back of the spawn (visual only)
    for (const dx of [-1.7, 1.7]) t.box(3.8 + dx, 1.1, -22.3, 0.14, 2.2, 0.14, 0x9a5a40, { solid: false });
    t.box(3.8, 2.22, -22.3, 3.8, 0.14, 0.14, 0x9a5a40, { solid: false });
  }
  yard(1);
  yard(-1);

  // ---- the school bus on the cul-de-sac circle
  k.box(0, 1.7, 0, 2.5, 2.4, 8.4, 0xe8b820);                        // body
  k.box(0, 3.02, 0, 2.55, 0.2, 8.5, 0xf0eee4);                      // roof
  k.box(0, 1.05, 4.9, 2.3, 1.1, 1.5, 0xe8b820);                     // hood
  k.box(0, 0.62, 5.75, 2.3, 0.5, 0.2, 0x3a3d42);                    // bumper
  k.box(0, 2.32, 4.24, 2.2, 1.0, 0.1, 0x262a30, { solid: false });  // windshield
  for (const sx of [-1, 1]) {
    k.box(sx * 1.28, 2.35, -0.4, 0.06, 0.85, 6.8, 0x262a30, { solid: false }); // window band
    k.box(sx * 1.28, 0.95, -0.4, 0.06, 0.35, 6.8, 0x1c1e22, { solid: false }); // black stripe
    for (const zw of [-2.9, 2.9]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), k.mat(0x1c1e22));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.15, 0.5, zw);
      wheel.castShadow = true;
      scene.add(wheel);
    }
  }

  // cars: two wagons flanking the bus (jump car -> bus roof),
  // one parked on the road edge by each driveway
  k.car(-3.2, 4.4, 0x7799aa);
  k.car(3.2, -4.4, 0xa05540);
  k.car(-1.6, -12, 0x9a4a3a);
  k.car(1.6, 12, 0x4a6a8a);

  // ---- mannequins in the yards (visual only)
  function mannequin(x, z) {
    const m = k.mat(0xe8e0d2);
    const g = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.72, 8), m);
    legs.position.y = 0.38;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.62, 8), m);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), m);
    head.position.y = 1.52;
    for (const p of [legs, torso, head]) { p.castShadow = true; g.add(p); }
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (const [mx, mz] of [[-11.6, -6.2], [-9.0, -5.3], [-13.0, 2.4], [-9.8, -2.6], [-5.9, 3.4]]) {
    mannequin(mx, mz);
    mannequin(-mx, -mz);
  }

  // scattered cover
  k.crate(-17.2, -22.9); k.crate(-15.9, -23.3, 1.0); k.barrel(4.2, -20.8);
  k.crate(17.2, 22.9); k.crate(15.9, 23.3, 1.0); k.barrel(-4.2, 20.8);
  k.barrel(-8.5, 5.6); k.barrel(8.5, -5.6);

  // ---- waypoints: coarse grid + mirrored hand-placed lane/door seeds
  const grid = [];
  for (const x of [-16, -11, -6.5, 0, 6.5, 11, 16])
    for (const z of [-21, -15, -11, -6.5, -2, 2, 6.5, 11, 15, 21])
      grid.push([x, z]);
  const half = [
    [-6.4, -7.7], [-6.5, -10.2],   // front door in/out
    [-9, -11], [-12.5, -10.8],     // living room
    [-11, -12.2], [-11, -13.8],    // kitchen doorway
    [-7.6, -13], [-8, -15.3],      // hall by the stairs / back room
    [-12.5, -15],                  // kitchen
    [-13, -16.1], [-13, -18.2],    // back door in/out
    [-5, -6.4], [-2.9, -6.4],      // front walkway gap
    [-13.6, -5.1], [-13.6, -3.2],  // front-yard west gate
    [-12, -1.3], [-12, 1.3],       // flank-yard fence gap
    [-4.9, -2], [-2.8, -2],        // street fence gap
    [-2.6, 0],                     // squeeze west of the bus
    [-4, -10.5], [-4, -14.5],      // driveway beside the house
    [10, -15.7], [10, -18.4],      // backyard gate
    [13, -13.5],                   // carport yard
  ];
  const extra = [];
  for (const [x, z] of half) extra.push([x, z], [-x, -z]);

  return {
    name: 'NUKETOWN',
    bounds: { x: W, z: D },
    sun: { color: 0xfff2d8, intensity: 1.0, pos: [30, 45, 20] },
    hemi: { sky: 0xbcd8ec, ground: 0x4e6a3a, intensity: 0.75 },
    spawns: {
      tf: [[-13, -20], [-7, -21], [-1, -20.5], [7, -21], [13, -20], [-16, -22]],
      sp: [[13, 20], [7, 21], [1, 20.5], [-7, 21], [-13, 20], [16, 22]],
    },
    waypointSeeds: grid.concat(extra),
  };
}

// ============================================================
// RUST — desert oil yard with a central tower
// ============================================================
function buildRust(scene, colliders) {
  const k = new MapKit(scene, colliders);
  const W = 17;

  scene.background = new THREE.Color(0xdcb887);
  scene.fog = new THREE.Fog(0xdcb887, 45, 110);

  // sand
  k.box(0, -0.5, 0, W * 2 + 2, 1, W * 2 + 2, 0xc2a36b);

  // perimeter berms + invisible walls
  k.wall('z', -W, W, -W, 3.0, 0.8, 0xa9885a);
  k.wall('z', -W, W, W, 3.0, 0.8, 0xa9885a);
  k.wall('x', -W, W, -W, 3.0, 0.8, 0xa9885a);
  k.wall('x', -W, W, W, 3.0, 0.8, 0xa9885a);
  k.blocker(-W, 6, 0, 1, 12, W * 2);
  k.blocker(W, 6, 0, 1, 12, W * 2);
  k.blocker(0, 6, -W, W * 2, 12, 1);
  k.blocker(0, 6, W, W * 2, 12, 1);

  // ---- central tower (player can climb the crate steps)
  const rust = 0x8a5a3a;
  for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]])
    k.box(lx, 1.4, lz, 0.45, 2.8, 0.45, rust);
  k.box(0, 2.95, 0, 5, 0.3, 5, 0x6e4a2e);          // platform
  k.box(0, 3.35, -2.4, 5, 0.5, 0.2, rust);          // rails
  k.box(0, 3.35, 2.4, 5, 0.5, 0.2, rust);
  k.box(-2.4, 3.35, 0, 0.2, 0.5, 5, rust);
  k.box(3.6, 0.45, 2.8, 1.5, 0.9, 1.5, 0x7a6a4a);   // step 1
  k.box(3.6, 1.0, 1.0, 1.5, 2.0, 1.5, 0x6e5e40);    // step 2
  k.box(0, 4.2, 0, 0.35, 2.2, 0.35, rust);          // derrick pole

  // ---- containers
  k.box(-9, 1.3, -7, 6, 2.6, 2.5, 0x8a4a35);
  k.box(8, 1.3, 6.5, 6, 2.6, 2.5, 0x4a6a8a);
  k.box(-6, 1.3, 9.5, 6, 2.6, 2.5, 0x5a7a4a);
  k.box(9, 1.3, -8, 2.5, 2.6, 6, 0x8a8a45);

  // ---- shed (three walls + roof)
  k.wall('x', 9.5, 13.5, -3, 2.6, 0.25, 0x7a6a55);
  k.wall('z', -3, 0.5, 13.5, 2.6, 0.25, 0x7a6a55);
  k.wall('x', 9.5, 13.5, 0.5, 2.6, 0.25, 0x7a6a55, [{ a: 10.2, b: 11.6, top: 2.2 }]);
  k.box(11.5, 2.75, -1.25, 4.4, 0.3, 3.9, 0x5a4a3a);

  // ---- pipes (visual cylinders + box colliders)
  for (const [px, pz, py] of [[-8, 3, 0.55], [-8, 3, 1.6]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 7, 12), k.mat(0x9a7a5a));
    m.rotation.z = Math.PI / 2;
    m.position.set(px, py, pz);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  k.blocker(-8, 1.1, 3, 7, 2.2, 1.1);

  // scattered cover
  k.crate(-3, -8, 1.3, 0x6e5e40); k.crate(-4.4, -8.4, 1.0, 0x7a6a4a);
  k.crate(4, 9, 1.3, 0x6e5e40);
  k.crate(-12, 5, 1.2); k.crate(12, -12.5, 1.2);
  k.crate(0, -12.5, 1.4, 0x7a5a3a);
  k.barrel(-11, -2); k.barrel(-10.2, -3.2); k.barrel(5, -5); k.barrel(11, 10);
  k.barrel(2.5, 5.5); k.barrel(-2.5, -5.2, 0x5a6a45);

  const grid = [];
  for (const x of [-13, -8, -4, 0, 4, 8, 13])
    for (const z of [-13, -8, -4, 0, 4, 8, 13])
      grid.push([x, z]);
  const extra = [[11, 1.5], [11, -1.5], [-6, 6], [6, -3], [-3, 3]];

  return {
    name: 'RUST',
    bounds: { x: W, z: W },
    sun: { color: 0xffd9a8, intensity: 1.1, pos: [-25, 38, 15] },
    hemi: { sky: 0xe8c8a0, ground: 0x8a6a45, intensity: 0.7 },
    spawns: {
      tf: [[-14, -14], [-10, -15], [-15, -10], [-14, -5], [-5, -14.5], [-12, -12]],
      sp: [[14, 14], [10, 15], [15, 10], [14, 5], [5, 14.5], [12, 12]],
    },
    waypointSeeds: grid.concat(extra),
  };
}

const MAPS = { nuketown: buildNuketown, rust: buildRust };

// ============================================================
// Waypoint graph — filter seeds that land inside geometry, then
// connect pairs with clear waist-height line of sight.
// ============================================================
function buildNavGraph(seeds, colliders) {
  const pts = [];
  const testMin = new THREE.Vector3(), testMax = new THREE.Vector3();
  const testBox = new THREE.Box3(testMin, testMax);
  for (const [x, z] of seeds) {
    testMin.set(x - 0.45, 0.2, z - 0.45);
    testMax.set(x + 0.45, 1.6, z + 0.45);
    let blocked = false;
    for (const c of colliders) {
      if (c.intersectsBox(testBox)) { blocked = true; break; }
    }
    if (!blocked) pts.push(new THREE.Vector3(x, 0, z));
  }
  const edges = pts.map(() => []);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = pts[i].distanceTo(pts[j]);
      if (d > 8.6) continue;
      a.copy(pts[i]); a.y = 1.1;
      b.copy(pts[j]); b.y = 1.1;
      if (losClear(a, b, colliders)) { edges[i].push(j); edges[j].push(i); }
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

function nearestWaypoint(graph, pos) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < graph.points.length; i++) {
    const d = pos.distanceTo(graph.points[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
