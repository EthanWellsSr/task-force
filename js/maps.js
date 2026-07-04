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
// NUKETOWN — faithful cul-de-sac layout: street runs north-south
// and dead-ends both ways (red-door facility at the north end,
// sandbag/barbed-wire barricade at the south end). Two two-storey
// houses with white trim face each other across the curb-and-sidewalk
// ringed cul-de-sac circle — teal house on the west (shifted north),
// yellow house on the east (shifted south) — with picket-fenced front
// yards, attached carports opening onto the circle, and gated backyard
// spawns behind each house. The facility fronts a full-width concrete
// forecourt that closes off the north end of the circle. Angled school
// bus + white moving truck sit on the circle, a burnt wreck blocks the
// south entrance, and power poles / lamps / sheds / mannequins dress
// the yards. Point-symmetric about the origin except the two street
// ends and per-house dressing (teal patio + balcony, yellow back deck
// + pergola).
// ============================================================
function buildNuketown(scene, colliders) {
  const k = new MapKit(scene, colliders);
  const W = 24, D = 20; // half extents: x = east-west, z = along the street
  const T = 0.3;
  // named palette (matched to the reference shots)
  const DESERT = 0xc9a97c, LAWN = 0x567f3c, ASPHALT = 0x5b5e63,
        SIDEWALK = 0x8f8d86, CONCRETE = 0x9b9890, CURB = 0xb0aca2,
        TEAL = 0x4fb3a5, YELLOW = 0xd8c052, PINK = 0xd8a8b8, RED = 0xb03030,
        TRIM = 0xf0eee6, GLASS = 0x262a30, POLE = 0x6a5138,
        wood = 0x8a6d4a, hedge = 0x4a6a3a;
  const ns = { solid: false }, nsf = { solid: false, shadow: false };

  scene.background = new THREE.Color(0x9fc4e0);
  scene.fog = new THREE.Fog(0x9fc4e0, 70, 160);

  // ---- ground/road: desert beyond, lawn inside, cul-de-sac circle with
  // a concrete apron ring, curbed street south to the barricade
  k.box(0, -0.55, 0, 160, 1, 160, DESERT, nsf);          // desert plain
  k.box(0, -0.5, 0, W * 2 + 2, 1, D * 2 + 2, LAWN);      // lawn slab = map floor
  function disc(x, y, z, r, h, color) {                  // flat cylinder, visual only
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), k.mat(color));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
  }
  disc(0, 0.008, 0, 9.0, 0.016, SIDEWALK);               // sidewalk ring around the circle
  disc(0, 0.02, 0, 7.5, 0.02, CURB);                     // curb ring
  disc(0, 0.032, 0, 7.2, 0.024, ASPHALT);                // cul-de-sac circle
  k.box(0, 0.02, 11.5, 7.2, 0.024, 10.6, ASPHALT, nsf);  // street: circle -> south barricade
  k.box(0, 0.014, -12.4, 17, 0.028, 7.2, CONCRETE, nsf); // forecourt: circle -> facility
  for (const s of [-1, 1]) {
    k.box(3.72 * s, 0.034, 11.6, 0.26, 0.052, 10.2, CURB, nsf);   // curb strips
    k.box(4.55 * s, 0.02, 11.7, 1.4, 0.03, 10.4, SIDEWALK, nsf);  // sidewalks
  }
  for (const z of [9.7, 12.4, 15.1])
    k.box(0, 0.045, z, 0.22, 0.02, 1.4, 0xd8c860, nsf);  // lane dashes (south street only)

  // ---- perimeter fence + invisible walls
  k.wall('z', -D, D, -W, 2.4, T, wood);
  k.wall('z', -D, D, W, 2.4, T, wood);
  k.wall('x', -W, W, -D, 2.4, T, wood);
  k.wall('x', -W, W, D, 2.4, T, wood);
  k.blocker(-W, 5, 0, 0.5, 10, D * 2);
  k.blocker(W, 5, 0, 0.5, 10, D * 2);
  k.blocker(0, 5, -D, W * 2, 10, 0.5);
  k.blocker(0, 5, D, W * 2, 10, 0.5);

  // Point-symmetric builder: s=1 lays out the west/teal half,
  // s=-1 mirrors it through the origin for the east/yellow half.
  const xform = s => ({
    wall: (axis, a1, a2, at, h, thick, col, ops = [], y0 = 0) =>
      k.wall(axis, Math.min(s * a1, s * a2), Math.max(s * a1, s * a2), s * at, h, thick, col,
        ops.map(o => ({
          a: Math.min(s * o.a, s * o.b), b: Math.max(s * o.a, s * o.b),
          bottom: o.bottom, top: o.top,
        })), y0),
    box: (cx, cy, cz, w, h, d, col, opts) => k.box(s * cx, cy, s * cz, w, h, d, col, opts),
  });

  // ---- house: footprint x -17..-8, z -14..-4, front wall at x=-8
  // facing the street. Ground floor: living room + kitchen behind;
  // staircase up to a second storey overlooking the street.
  function house(s, wallC, innerC, roofC) {
    const t = xform(s);
    const H1 = 2.8, H2 = 2.6, TOP = H1 + H2;
    // ground floor shell
    t.wall('z', -14, -4, -8, H1, T, wallC, [
      { a: -7.5, b: -6.3, top: 2.2 },                  // front door
      { a: -12.6, b: -10.4, bottom: 1.15, top: 2.45 }, // picture window
    ]);
    t.wall('z', -14, -4, -17, H1, T, wallC, [
      { a: -11.7, b: -10.5, top: 2.2 },                // back door -> backyard spawn
      { a: -7.0, b: -5.5, bottom: 1.15, top: 2.3 },    // kitchen window
    ]);
    t.wall('x', -17, -8, -14, H1, T, wallC, [{ a: -14.6, b: -13.0, bottom: 1.15, top: 2.3 }]);
    t.wall('x', -17, -8, -4, H1, T, wallC, [{ a: -16.0, b: -14.5, bottom: 1.15, top: 2.3 }]);
    t.wall('z', -14, -7, -12.5, H1, T, innerC, [{ a: -10.4, b: -9.2, top: 2.2 }]); // kitchen wall
    // second storey
    t.wall('z', -14, -4, -8, H2, T, wallC, [
      { a: -13.0, b: -11.0, bottom: 0.9, top: 2.3 },   // windows over the street
      { a: -7.4, b: -5.8, bottom: 0.9, top: 2.3 },
    ], H1);
    t.wall('z', -14, -4, -17, H2, T, wallC, [{ a: -11.2, b: -9.4, bottom: 0.9, top: 2.3 }], H1);
    t.wall('x', -17, -8, -14, H2, T, wallC, [{ a: -13.6, b: -11.8, bottom: 0.9, top: 2.3 }], H1);
    t.wall('x', -17, -8, -4, H2, T, wallC, [], H1);
    t.wall('x', -17, -12.7, -9, H2, T, innerC, [{ a: -14.6, b: -13.4, top: 2.2 }], H1); // bedroom wall
    // upstairs floor slab with a hole over the staircase
    const fC = 0x6e5637;
    t.box(-12.5, H1 - 0.075, -9.7, 9, 0.15, 8.6, fC);
    t.box(-14.85, H1 - 0.075, -4.7, 4.3, 0.15, 1.4, fC);
    t.box(-10.35, H1 + 0.42, -5.45, 4.7, 0.85, 0.1, innerC); // rail at the hole
    // staircase along the south wall
    for (let i = 0; i < 7; i++)
      t.box(-8.865 - 0.53 * i, 0.2 * (i + 1), -4.75, 0.53, 0.4 * (i + 1), 1.15, 0x7a6248);
    // roof + chimney (stepped slabs fake a gable; wide eaves so the
    // grey roofs dominate the top-down view)
    t.box(-12.5, TOP + 0.14, -9, 10.6, 0.28, 11.6, roofC);
    t.box(-12.5, TOP + 0.42, -9, 7.0, 0.28, 11.6, roofC);
    t.box(-12.5, TOP + 0.7, -9, 3.6, 0.28, 11.6, roofC);
    t.box(-14.8, TOP + 0.95, -12, 0.8, 1.5, 0.8, 0x8a5a4a);
    // white trim: floor-line band, corner boards, fascia, window sills
    t.box(-12.5, H1, -3.82, 9.4, 0.36, 0.12, TRIM, ns);
    t.box(-12.5, H1, -14.18, 9.4, 0.36, 0.12, TRIM, ns);
    t.box(-7.82, H1, -9, 0.12, 0.36, 10.4, TRIM, ns);
    t.box(-17.18, H1, -9, 0.12, 0.36, 10.4, TRIM, ns);
    for (const [cx, cz] of [[-8, -4], [-8, -14], [-17, -4], [-17, -14]])
      t.box(cx, TOP / 2, cz, 0.44, TOP, 0.44, TRIM, ns);
    t.box(-12.5, TOP - 0.1, -9, 10.8, 0.2, 11.8, TRIM, ns);      // fascia under roof
    t.box(-7.8, 1.08, -11.5, 0.12, 0.14, 2.5, TRIM, ns);         // picture window sill
    t.box(-7.8, 2.52, -11.5, 0.12, 0.14, 2.5, TRIM, ns);         // ...and header
    t.box(-7.8, H1 + 0.83, -12.0, 0.12, 0.14, 2.4, TRIM, ns);    // upstairs sills
    t.box(-7.8, H1 + 0.83, -6.6, 0.12, 0.14, 2.0, TRIM, ns);
    // porch
    t.box(-7.1, 0.05, -6.9, 1.8, 0.1, 2.6, 0x9b9890, { solid: false });
    t.box(-6.35, 1.2, -5.75, 0.16, 2.4, 0.16, 0xe6e4da);
    t.box(-6.35, 1.2, -8.05, 0.16, 2.4, 0.16, 0xe6e4da);
    t.box(-7.15, 2.48, -6.9, 2.1, 0.16, 3.0, roofC);
    // furniture (kept against walls so bots keep clean lanes)
    t.box(-10.5, 0.4, -13.2, 2.2, 0.8, 1.1, 0x7a4a3a);       // sofa
    t.box(-16.35, 0.5, -9.2, 1.0, 1.0, 2.6, 0xb0aca0);       // kitchen counter
    t.box(-15.8, H1 + 0.3, -12.6, 2.2, 0.6, 1.7, 0x6a7a94);  // bed
    t.box(-16.3, H1 + 0.35, -6.2, 1.1, 0.7, 1.4, 0x84765a);  // dresser
  }
  house(1, TEAL, 0xcfc7b2, 0x55504a);   // teal house, west (shifted north)
  house(-1, YELLOW, 0xcfc7b2, 0x4e4a44); // yellow house, east (shifted south)
  // teal-only front balcony rail above the porch roof (visual only)
  k.box(-6.3, 3.0, -6.9, 0.1, 0.75, 3.0, TRIM, ns);
  k.box(-6.3, 3.4, -6.9, 0.14, 0.1, 3.1, TRIM, ns);

  function pickup(t, cx, cz, col) {
    t.box(cx, 0.8, cz, 1.9, 0.9, 4.4, col);
    t.box(cx, 1.62, cz - 1.2, 1.8, 0.75, 1.8, col);
    t.box(cx, 1.35, cz + 1.1, 1.6, 0.25, 2.0, 0x2a2d31, { solid: false }); // bed cavity
  }

  // ---- yards: picket-fenced front yard with a gate, gated backyard
  // spawn behind the house, carport driveway on the flank, hedges,
  // camper in the far corner lawn (one set per half, mirrored)
  function yard(s) {
    const t = xform(s);
    const P = 0xe6e4da, FH = 1.25, PT = 0.16;
    // front yard pickets: run along the sidewalk ring and stop at the
    // porch, so no fence stands on the circle asphalt
    t.wall('z', -14.5, -6.0, -5, FH, PT, P, [{ a: -7.6, b: -6.6 }]);
    t.wall('x', -8, -5, -14.5, FH, PT, P);
    t.wall('x', -6.2, -5, -6.0, FH, PT, P);
    // backyard spawn fences: gates at both ends + fillers to the house
    t.wall('x', -24, -17, -16.5, 2.2, T, wood, [{ a: -21.8, b: -20.6 }]);
    t.wall('x', -24, -17, -2.5, 2.2, T, wood, [{ a: -21.8, b: -20.6 }]);
    t.wall('z', -16.5, -14, -17, 2.2, T, wood);
    t.wall('z', -4, -2.5, -17, 2.2, T, wood);
    // walkway from the porch gate to the sidewalk ring
    t.box(-6.5, 0.02, -6.9, 3.4, 0.04, 1.1, 0x9b9890, { solid: false, shadow: false });
    t.box(-4.2, 0.02, -6.9, 1.4, 0.04, 1.1, 0x9b9890, { solid: false, shadow: false });
    // mailbox by the walkway
    t.box(-4.5, 0.5, -8.4, 0.12, 1.0, 0.12, 0x50524f);
    t.box(-4.5, 1.12, -8.4, 0.34, 0.26, 0.55, 0x9a3a30);
    // carport attached to the house flank, opening toward the circle;
    // concrete driveway pad runs out to the sidewalk ring
    t.box(-11.4, 0.015, -1.3, 6.0, 0.03, 5.6, 0x8f8d86, { solid: false, shadow: false });
    for (const [px, pz] of [[-14, 1.2], [-9, 1.2]])
      t.box(px, 1.3, pz, 0.22, 2.6, 0.22, wood);
    t.box(-11.5, 2.7, -1.3, 5.6, 0.2, 5.4, 0x74707a);
    pickup(t, -11.5, -1.2, s > 0 ? 0xd8d5c8 : 0xa08040); // pickup on the driveway
    // backyard garden shed by the rear gate
    t.box(-22.9, 1.05, -3.9, 1.8, 2.1, 1.7, 0xdad7cc);
    t.box(-22.9, 2.2, -3.9, 2.1, 0.2, 2.0, wood, ns);
    t.box(-21.98, 0.95, -3.9, 0.06, 1.7, 0.7, 0x8a8478, ns);
    // hedges: one on the lawn south of the driveway, one row on the corner lawn
    t.box(-7.8, 0.85, 5.4, 1.3, 1.7, 3.2, hedge);
    t.box(-11, 0.85, 8.6, 5.0, 1.7, 1.2, hedge);
    // camper in the far corner lawn
    t.box(-18.5, 1.45, 11.5, 2.3, 2.5, 5.6, s > 0 ? 0xd8d5c8 : 0xcfd4c4);
    t.box(-19.68, 1.9, 11.5, 0.06, 0.6, 4.2, 0x262a30, { solid: false });
    // spawn cover crates in the backyard
    t.box(-23, 0.6, -14.8, 1.2, 1.2, 1.2, 0x7a6a4a);
    t.box(-22.6, 0.5, -13.5, 1.0, 1.0, 1.0, 0x6e5e40);
  }
  yard(1);
  yard(-1);

  // ---- teal-side dressing: small concrete patio inside the front yard,
  // slab path across the southwest lawn (lawn otherwise fills the yard)
  k.box(-6.9, 0.012, -11.6, 2.0, 0.024, 4.6, CONCRETE, nsf);
  for (let i = 0; i < 4; i++)
    k.box(-13.8 - 1.55 * i, 0.03, 9.8, 1.15, 0.05, 0.9, CONCRETE, nsf);

  // ---- yellow-side dressing: wooden back deck with pergola outside the
  // rear door (backyard spawn side), hedges by the front pickets
  k.box(18.15, 0.09, 10.0, 2.0, 0.18, 3.6, 0x9a7a55, ns);      // deck boards
  for (const [px, pz] of [[17.45, 8.4], [17.45, 11.6], [19.05, 8.4], [19.05, 11.6]])
    k.box(px, 1.25, pz, 0.18, 2.5, 0.18, TRIM);                // pergola posts
  k.box(18.15, 2.56, 10.0, 2.0, 0.12, 3.7, 0x9a7a55, ns);      // pergola cap
  for (let i = 0; i < 5; i++)
    k.box(18.15, 2.7, 8.6 + 0.7 * i, 2.2, 0.08, 0.16, wood, ns); // slats
  k.box(5.9, 0.75, 13.6, 1.3, 1.5, 1.3, hedge);                // front hedges
  k.box(10.8, 0.8, 13.6, 1.3, 1.6, 1.3, hedge);

  // ---- far red/white facility capping the north end of the street:
  // pink hall, two red roll-up doors, wide grey roof with a carport
  // overhang on white posts, rooftop vent, concrete forecourt
  k.box(0, 2.1, -18, 18, 4.2, 4, PINK);
  k.box(0, 4.32, -17.55, 20.6, 0.24, 6.3, 0x6a6660);      // main roof + front overhang
  k.box(0, 4.62, -17.9, 13.5, 0.36, 4.0, 0x6a6660);       // upper roof step
  k.box(2.5, 4.95, -18.1, 1.7, 0.9, 1.3, 0x5c5852, ns);   // rooftop vent box
  for (const sx of [-1, 1]) {
    k.box(sx * 4.4, 1.5, -15.96, 5.6, 3.0, 0.08, RED, ns);   // red roll-up door
    k.box(sx * 4.4, 3.12, -15.94, 5.8, 0.25, 0.06, TRIM, ns);
    k.box(sx * 8.85, 2.1, -15.9, 0.3, 4.2, 0.3, TRIM, ns);   // corner boards
    k.box(sx * 8.2, 2.05, -14.6, 0.24, 4.1, 0.24, TRIM);     // carport posts
  }
  k.box(0, 1.5, -15.95, 0.9, 3.0, 0.1, TRIM, ns);         // pier between the doors
  k.box(0, 4.2, -15.9, 18.2, 0.28, 0.14, TRIM, ns);       // fascia line

  // ---- sandbag + barbed-wire barricade sealing the south end
  k.box(0, 0.55, 16.4, 10.5, 1.1, 1.0, 0x8f8060);
  k.box(-3.4, 0.35, 15.6, 2.2, 0.7, 0.8, 0x8f8060);
  k.box(3.2, 0.35, 15.7, 1.8, 0.7, 0.8, 0x8f8060);
  for (let px = -5; px <= 5; px += 2.5) k.box(px, 0.9, 16.9, 0.1, 1.8, 0.1, 0x4a4a48);
  k.box(0, 1.35, 16.9, 11, 0.04, 0.04, 0x3a3a38, { solid: false });
  k.box(0, 1.7, 16.9, 11, 0.04, 0.04, 0x3a3a38, { solid: false });
  k.blocker(0, 3, 16.9, 13, 6, 1.6);
  k.box(0.5, 1.3, 18.2, 2.4, 2.2, 3.2, 0x4a5240); // army truck behind the wire
  // fence off the dead corners behind each street end
  k.wall('x', -24, -6, 16.5, 2.4, T, wood);
  k.wall('z', 16.5, 20, 6, 2.4, T, wood);
  k.wall('x', 6, 24, -16.5, 2.4, T, wood);
  k.wall('z', -20, -16.5, -6, 2.4, T, wood);
  k.blocker(-15, 4, 16.5, 18, 8, 0.4);
  k.blocker(15, 4, -16.5, 18, 8, 0.4);

  // ---- school bus on the circle, angled with its nose toward the
  // southwest (as in the reference). Visuals live in a rotated group;
  // collision is four axis-aligned blockers tracking the hull.
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
    bpart(sx * 1.28, 2.35, -0.4, 0.06, 0.85, 6.8, GLASS);    // window band
    bpart(sx * 1.28, 0.95, -0.4, 0.06, 0.35, 6.8, 0x1c1e22); // black stripe
    for (const zw of [-2.9, 2.9]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), k.mat(0x1c1e22));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.15, 0.5, zw);
      wheel.castShadow = true;
      busG.add(wheel);
    }
  }
  const BUSX = -2.8, BUSZ = 1.8, BUSA = -0.25; // centre + yaw (nose swings west)
  busG.position.set(BUSX, 0, BUSZ);
  busG.rotation.y = BUSA;
  scene.add(busG);
  const busSin = Math.sin(BUSA), busCos = Math.cos(BUSA);
  for (const off of [-2.8, 0, 2.8])
    k.blocker(BUSX + off * busSin, 1.55, BUSZ + off * busCos, 3.15, 3.1, 3.42);
  k.blocker(BUSX + 5.0 * busSin, 0.85, BUSZ + 5.0 * busCos, 2.65, 1.7, 2.25); // hood/bumper

  // ---- white moving truck beside the bus (red cab toward the barricade)
  k.box(2.35, 1.85, -1.4, 2.3, 3.0, 6.6, 0xd8d5cc);                  // trailer
  k.box(2.35, 3.42, -1.4, 2.4, 0.14, 6.7, 0xe8e6df, ns);             // roof cap
  k.box(2.35, 1.85, -4.72, 2.2, 2.8, 0.08, 0xb9b6ad, ns);            // rear doors
  k.box(2.35, 1.15, 3.2, 2.2, 1.9, 2.6, 0xb03028);                   // cab
  k.box(2.35, 2.2, 3.3, 2.0, 0.22, 2.2, 0x8a231e, ns);               // cab roof
  k.box(2.35, 1.75, 4.52, 1.9, 0.7, 0.06, GLASS, { solid: false });  // windshield
  for (const sx of [-1, 1])
    for (const zw of [-3.8, -0.4, 3.9]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12), k.mat(0x1c1e22));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(2.35 + sx * 1.05, 0.45, zw);
      wheel.castShadow = true;
      scene.add(wheel);
    }

  // ---- cars: burnt wreck at the south road entrance, white car parked
  // by the facility driveway
  k.box(0.5, 0.5, 10.6, 1.8, 1.0, 4.0, 0x2e2f33);              // wreck shell
  k.box(0.5, 1.25, 10.8, 1.7, 0.55, 1.9, 0x232529);            // caved-in cabin
  k.box(0.5, 1.02, 9.0, 1.6, 0.3, 0.8, 0x1a1c1f, ns);          // crumpled hood
  k.car(-2.2, -12.6, 0xd8d5c8);

  // ---- street furniture: power poles and lamp posts along the road
  function powerPole(x, z) {
    k.box(x, 2.6, z, 0.24, 5.2, 0.24, POLE);
    k.box(x, 4.75, z, 0.16, 0.16, 2.4, POLE, ns);              // crossarm
    k.box(x, 4.35, z, 0.14, 0.5, 0.14, 0x3a3d42, ns);          // transformer can
  }
  powerPole(-5.4, 7.4);
  powerPole(5.4, -7.4);
  powerPole(-5.5, -11.5);
  powerPole(5.5, 11.5);
  function lamp(x, z, armDir) {
    k.box(x, 1.9, z, 0.18, 3.8, 0.18, 0x8a8d90);
    k.box(x + armDir * 0.55, 3.75, z, 1.1, 0.1, 0.12, 0x8a8d90, ns);
    k.box(x + armDir * 1.05, 3.62, z, 0.45, 0.16, 0.3, 0xf0e8c0, ns);
  }
  lamp(4.6, 10.5, -1);
  lamp(-4.6, -10.5, 1);

  // ---- small utility sheds in the far lawn corners
  for (const s of [-1, 1]) {
    k.box(s * -21.9, 1.15, s * 14.0, 2.6, 2.3, 2.2, s > 0 ? 0xdad7cc : 0x9ab08a);
    k.box(s * -21.9, 2.42, s * 14.0, 2.9, 0.24, 2.5, 0x6a6660, ns);
  }

  // ---- mannequins in the yards (visual only)
  function mannequin(x, z, y = 0) {
    const m = k.mat(0xe8e0d2);
    const g = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.72, 8), m);
    legs.position.y = 0.38;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.62, 8), m);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), m);
    head.position.y = 1.52;
    for (const p of [legs, torso, head]) { p.castShadow = true; g.add(p); }
    g.position.set(x, y, z);
    scene.add(g);
  }
  for (const [mx, mz] of [[-6.4, -11.8], [-6.2, -5.2], [-4.5, 7.8], [-14.5, 11.5], [-19.8, -18.6]]) {
    mannequin(mx, mz);
    mannequin(-mx, -mz);
  }
  mannequin(-7.0, -7.6, 0.1); // on the teal porch
  mannequin(18.2, 9.2, 0.18); // on the yellow back deck

  // ---- radio tower on the horizon (visual only, out of bounds NW)
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    k.box(-17 + dx * 1.0, 6.7, -26 + dz * 1.0, 0.18, 13.4, 0.18, 0x9096a0, { solid: false });
  for (const ty of [2.5, 6.5, 10.5, 13.3]) {
    k.box(-17, ty, -26, 2.2, 0.14, 0.14, 0x9096a0, { solid: false });
    k.box(-17, ty, -26, 0.14, 0.14, 2.2, 0x9096a0, { solid: false });
  }
  k.box(-17, 14.7, -26, 0.12, 2.6, 0.12, 0x9096a0, { solid: false });

  // scattered cover
  k.barrel(-13.5, -18.6); k.barrel(13.5, 18.6);
  k.barrel(-4.9, 8.6); k.barrel(4.9, -8.6);
  k.crate(9.5, -13.5); k.crate(-9.5, 13.5);

  // ---- waypoints: coarse grid + mirrored hand-placed lane/door seeds
  const grid = [];
  for (const x of [-22, -18.5, -14.5, -10.5, -6.3, 0, 6.3, 10.5, 14.5, 18.5, 22])
    for (const z of [-18.3, -14.8, -11, -7, -2.5, 2.5, 7, 11, 14.8, 18.3]) {
      if (z > 16 && x < -6) continue;  // dead corner behind the barricade
      if (z < -16 && x > 6) continue;  // dead corner behind the garage
      grid.push([x, z]);
    }
  const half = [
    [-4.2, -6.9], [-6.0, -6.9],           // front gate out/in
    [-6.3, -10.5], [-6.3, -4.5],          // front yard corners
    [-9.3, -6.9],                          // inside the front door
    [-10.2, -9.5], [-10.2, -12.8],         // living room
    [-11.6, -9.8], [-13.6, -9.8],          // kitchen doorway
    [-14.8, -7.2], [-14.6, -12.3],         // kitchen
    [-15.9, -11.1], [-18.3, -11.1],        // back door in/out
    [-20.5, -8.5], [-19.5, -13.5], [-19.5, -4.5], // backyard spawn
    [-21.2, -15.1], [-21.2, -17.9],        // backyard north gate
    [-21.2, -3.9], [-21.2, -1.1],          // backyard south gate
    [-12.5, -15.0], [-8.8, -15.0],         // corridor behind the house
    [-4.9, -14.6], [-0.4, -13.9], [1.8, -14.9], // facility forecourt
    [-15.6, -1.3], [-8.7, -2.9],           // carport back strip / driveway mouth
    [-11.5, 3.2], [-11.5, 6.6],            // lawn south of the carport
    [-6.1, -2.6], [-8.6, 0.3],             // picket corner / driveway edge
    [-4.9, 1.0], [-5.8, 5.0],              // lane west of the angled bus
    [0.15, 0.5], [0.15, 4.8], [0.15, -4.2], // lane between bus and truck
    [-1.6, 9.8], [-2.5, 12.5],             // street south lane (west of wreck)
    [1.9, 11.6], [0, 13.6],                // street south lane (east of wreck)
    [-1.5, 15.2],                           // barricade front
    [-11, 10.6], [-6.9, 12],               // corner lawn lanes
    [-18.5, 15.2],                          // behind the camper
  ];
  const extra = [];
  for (const [x, z] of half) extra.push([x, z], [-x, -z]);

  return {
    name: 'NUKETOWN',
    bounds: { x: W, z: D },
    sun: { color: 0xfff2d8, intensity: 1.0, pos: [30, 45, 20] },
    hemi: { sky: 0xbcd8ec, ground: 0x4e6a3a, intensity: 0.75 },
    spawns: {
      tf: [[-20.5, -8], [-19, -12.5], [-21.5, -13.5], [-19, -4.5], [-22, -6], [-21, -10.5]],
      sp: [[20.5, 8], [19, 12.5], [21.5, 13.5], [19, 4.5], [22, 6], [21, 10.5]],
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
