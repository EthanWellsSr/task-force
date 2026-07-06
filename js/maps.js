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
      { a: -12.6, b: -10.4, bottom: 1.15, top: 2.6 },  // picture window
    ]);
    t.wall('z', -14, -4, -17, H1, T, wallC, [
      { a: -11.7, b: -10.5, top: 2.2 },                // back door -> backyard spawn
      { a: -7.2, b: -5.4, bottom: 1.15, top: 2.6 },    // kitchen window
    ]);
    t.wall('x', -17, -8, -14, H1, T, wallC, [{ a: -14.8, b: -13.0, bottom: 1.15, top: 2.6 }]);
    t.wall('x', -17, -8, -4, H1, T, wallC, [{ a: -16.2, b: -14.4, bottom: 1.15, top: 2.6 }]);
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
    t.box(-7.8, 2.67, -11.5, 0.12, 0.14, 2.5, TRIM, ns);         // ...and header
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
    [-10.2, -9.5], [-10.2, -12.0],         // living room (clear of the sofa)
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
    // upstairs: stair mount (on the first tread) -> top landing, then rooms
    [-8.72, -4.75, 0.4], [-13.4, -4.7, 2.8],
    [-10.4, -6.9, 2.8],                     // hall by the stair rail
    [-9.3, -10.5, 2.8], [-9.3, -13.0, 2.8], // street-side window room
    [-14.0, -8.3, 2.8], [-14.0, -9.7, 2.8], // bedroom door out/in
    [-15.3, -10.5, 2.8],                    // bedroom
  ];
  const extra = [];
  for (const [x, z, y] of half) extra.push([x, z, y], [-x, -z, y]);

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
// #8b blockout: proportions + masses; tower climb routes are #8c,
// detail/cover/pit are #8d, y-aware nav is #8e.
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
  for (const pz of [-22, -14, -6, 2, 10, 18])
    k.box(21.5, 1.15, pz, 0.5, 2.3, 0.5, rust);      // supports (walk-under stays clear)
  for (const px of [11.5, 18])
    k.box(px, 1.15, -2, 0.5, 2.3, 0.5, rust);

  // ---- Oil Derrick (NW): raised platform with top/ground/under levels
  for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]])
    k.box(17.5 + lx, 1.6, -17.5 + lz, 0.45, 3.2, 0.45, rust);
  k.box(17.5, 3.2, -17.5, 5.4, 0.3, 5.4, DECK);
  k.box(17.5, 3.65, -20.1, 5.4, 0.6, 0.15, rust);    // rail on the open faces
  k.box(20.1, 3.65, -17.5, 0.15, 0.6, 5.4, rust);
  k.box(16.8, 0.75, -16.8, 1.6, 1.5, 1.4, MACHINE);  // machinery underneath

  // ---- Comms Station (NE, by the Front Gate): small corrugated shed
  k.wall('z', 9.5, 13, 16.6, 2.5, 0.2, SHED);
  k.wall('z', 9.5, 13, 13.6, 2.5, 0.2, SHED, [{ a: 10.5, b: 11.7, top: 2.1 }]);
  k.wall('x', 13.6, 16.6, 9.5, 2.5, 0.2, SHED);
  k.wall('x', 13.6, 16.6, 13, 2.5, 0.2, SHED);
  k.box(15.1, 2.6, 11.25, 3.6, 0.25, 4.1, 0x5a4a3a);
  k.box(15.1, 3.9, 12.4, 0.16, 2.4, 0.16, 0x8a8d90, { solid: false }); // antenna

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
  // Generators from Maintenance; the slide/pit into Maintenance is #8d
  k.wall('z', -2.9, -0.1, -9.6, 2.3, 0.2, SHED, [{ a: -2.1, b: -0.9, top: 2.0 }]);
  k.wall('z', -2.9, -0.1, -12.4, 2.3, 0.2, SHED);
  k.wall('x', -12.4, -9.6, -2.9, 2.3, 0.2, SHED);
  k.wall('x', -12.4, -9.6, -0.1, 2.3, 0.2, SHED);
  k.box(-11, 2.4, -1.5, 3.2, 0.25, 3.2, 0x5a4a3a);

  // ---- Maintenance (low ground, S-center-west): open space + scattered
  // cover; the sunken basin is deferred to #8d ([verify] in the reference)
  k.crate(-17, -3, 1.3, 0x6e5e40); k.crate(-18.3, -3.6, 1.0, 0x7a6a4a);
  k.crate(-20, -7, 1.2);
  k.barrel(-16, -6.5);

  // ---- Generators: machinery blocks west of the tower splitting the
  // mid into north and south halves
  k.box(0.5, 1.1, -7.5, 2.4, 2.2, 3.2, MACHINE);
  k.box(-0.5, 0.95, -11, 2.0, 1.9, 2.6, MACHINE);
  k.box(1.5, 1.0, -14, 1.8, 2.0, 2.2, MACHINE);

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

  // scattered cover (light garnish; the real prop pass is #8d)
  k.barrel(6, 8); k.barrel(6.8, 8.8);
  k.crate(9, -7, 1.3, 0x6e5e40);
  k.crate(-7, 12, 1.2);
  k.barrel(-9, -12, 0x5a6a45);
  k.crate(12, 3, 1.1, 0x7a5a3a);

  // ---- waypoints: ground grid for the new footprint + lane/door seeds;
  // y-aware tower/derrick/pipeline seeds are #8e
  const grid = [];
  for (const x of [-23, -17.5, -11.5, -5.5, 0, 5.5, 11.5, 17.5, 23])
    for (const z of [-23, -17.5, -11.5, -5.5, 0, 5.5, 11.5, 17.5, 23])
      grid.push([x, z]);
  const extra = [
    [20, 15.5], [22, 20],           // Front Gate pocket
    [12.8, 11.1], [15.1, 11.2],     // Comms Station door in/out
    [1, 17], [-2.5, 15],            // Red Containers lane
    [14, -5], [14, 1],              // under the pipeline spur
    [-8.3, -1.5], [-11, -1.5],      // Control Room door in/out
    [-18, -4.8],                    // Maintenance
    [-20, 8], [-17, 11],            // south CQB pocket
    [-21.5, -15],                   // Loading Dock west lane
    [0, -20.6],                     // Blue Containers dogleg
    [4.5, -3.5], [-4.5, 3.5],       // tower corners
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

const MAPS = { nuketown: buildNuketown, rust: buildRust };

// ============================================================
// Waypoint graph — filter seeds that land inside geometry, then
// connect pairs with clear waist-height line of sight.
// Seeds are [x, z] (ground) or [x, z, y] (elevated: stairs, floors).
// ============================================================
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
      if (corridorClear(a, b, colliders)) { edges[i].push(j); edges[j].push(i); }
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
