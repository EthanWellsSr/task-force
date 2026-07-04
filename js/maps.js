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
  // Base of wall sits at y = 0.
  wall(axis, a1, a2, at, height, thick, color, openings = []) {
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
      const len = s.b - s.a, mid = (s.a + s.b) / 2, h = s.y1 - s.y0, cy = (s.y0 + s.y1) / 2;
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
// NUKETOWN — two houses facing a bus across a small yard grid
// ============================================================
function buildNuketown(scene, colliders) {
  const k = new MapKit(scene, colliders);
  const W = 16, D = 22; // half extents

  scene.background = new THREE.Color(0x9fc4e0);
  scene.fog = new THREE.Fog(0x9fc4e0, 60, 130);

  // ground: lawn + center road strip
  k.box(0, -0.5, 0, W * 2 + 2, 1, D * 2 + 2, 0x4e7a3a);
  k.box(0, 0.012, 0, 7, 0.02, D * 2, 0x62646a, { solid: false, shadow: false });
  k.box(0, 0.025, 0, 0.25, 0.02, D * 2, 0xd8d5b0, { solid: false, shadow: false });

  // perimeter fences + tall invisible walls
  k.wall('z', -D, D, -W, 2.4, 0.3, 0x8a6d4a);
  k.wall('z', -D, D, W, 2.4, 0.3, 0x8a6d4a);
  k.wall('x', -W, W, -D, 2.4, 0.3, 0x8a6d4a);
  k.wall('x', -W, W, D, 2.4, 0.3, 0x8a6d4a);
  k.blocker(-W, 5, 0, 0.5, 10, D * 2);
  k.blocker(W, 5, 0, 0.5, 10, D * 2);
  k.blocker(0, 5, -D, W * 2, 10, 0.5);
  k.blocker(0, 5, D, W * 2, 10, 0.5);

  const H = 3.2, T = 0.3;

  // ---- House A (south, TF141 side): x -9..2, z -15.5..-8.5, pale yellow
  const cA = 0xc8b98a;
  k.wall('x', -9, 2, -8.5, H, T, cA, [
    { a: -8.2, b: -6.8, top: 2.2 },              // front door
    { a: -4.6, b: -2.2, bottom: 1.0, top: 2.3 }, // front window
  ]);
  k.wall('x', -9, 2, -15.5, H, T, cA, [{ a: -4.4, b: -3.0, top: 2.2 }]); // back door
  k.wall('z', -15.5, -8.5, -9, H, T, cA, [{ a: -13.4, b: -11.6, bottom: 1.0, top: 2.3 }]); // left window
  k.wall('z', -15.5, -8.5, 2, H, T, cA, [{ a: -12.4, b: -11.0, top: 2.2 }]); // right side door
  k.box(-3.5, H + 0.15, -12, 11.6, 0.3, 7.6, 0x6e5637); // roof
  k.box(-6.5, 0.5, -13.8, 2.4, 1.0, 1.0, 0x7a4a3a);     // interior counter

  // ---- House B (north, Spetsnaz side): x -2..9, z 8.5..15.5, pale green
  const cB = 0x9fb6a4;
  k.wall('x', -2, 9, 8.5, H, T, cB, [
    { a: 6.8, b: 8.2, top: 2.2 },
    { a: 2.2, b: 4.6, bottom: 1.0, top: 2.3 },
  ]);
  k.wall('x', -2, 9, 15.5, H, T, cB, [{ a: 3.0, b: 4.4, top: 2.2 }]);
  k.wall('z', 8.5, 15.5, 9, H, T, cB, [{ a: 11.6, b: 13.4, bottom: 1.0, top: 2.3 }]);
  k.wall('z', 8.5, 15.5, -2, H, T, cB, [{ a: 11.0, b: 12.4, top: 2.2 }]);
  k.box(3.5, H + 0.15, 12, 11.6, 0.3, 7.6, 0x5a4a3a);
  k.box(6.5, 0.5, 13.8, 2.4, 1.0, 1.0, 0x7a4a3a);

  // ---- center: bus + cars + cover
  k.box(1.2, 1.5, 0, 2.5, 3.0, 8.5, 0xc9a227);          // bus body
  k.box(1.2, 3.1, 0, 2.3, 0.2, 8.3, 0x8a7a2a);          // bus roof trim
  k.car(-7, -3, 0x7799aa);
  k.car(7, 3.5, 0xa05540);
  k.crate(-12, 0.5); k.crate(-11.2, 1.9, 1.0);
  k.crate(12, -1); k.crate(12.8, 0.4, 1.0);
  k.barrel(-4.5, 4); k.barrel(5.5, -4.5);

  // ---- mid-yard fences with gaps (lanes)
  const F = 1.9, FC = 0x9a8a6a;
  k.wall('x', -16, -9, -5.5, F, 0.3, FC);
  k.wall('x', -6.5, 3, -5.5, F, 0.3, FC);
  k.wall('x', 6, 12, -5.5, F, 0.3, FC);
  k.wall('x', -12, -6, 5.5, F, 0.3, FC);
  k.wall('x', -3, 6.5, 5.5, F, 0.3, FC);
  k.wall('x', 9, 16, 5.5, F, 0.3, FC);

  // waypoint seeds: grid + doorway/interior points
  const grid = [];
  for (const x of [-13, -8, -3, 2, 7, 12])
    for (const z of [-19, -14, -9, -4, 0, 4, 9, 14, 19])
      grid.push([x, z]);
  const extra = [
    [-7.5, -7.2], [-7.5, -10],   // A front door in/out
    [-3.7, -17], [-3.7, -14],    // A back door in/out
    [3.4, -11.7], [0.6, -11.7],  // A side door in/out
    [-3.5, -12],                 // A interior
    [7.5, 7.2], [7.5, 10],       // B front door
    [3.7, 17], [3.7, 14],        // B back door
    [-3.4, 11.7], [-0.6, 11.7],  // B side door
    [3.5, 12],                   // B interior
    [-1.5, -2.5], [3.8, 2.5],    // around bus
    [-7.8, -4.2], [-7.8, -6.8],  // south fence gap
    [7.8, 4.2], [7.8, 6.8],      // north fence gap
    [-2, 6.5], [2, -6.5],
  ];

  return {
    name: 'NUKETOWN',
    bounds: { x: W, z: D },
    sun: { color: 0xfff2d8, intensity: 1.0, pos: [30, 45, 20] },
    hemi: { sky: 0xbcd8ec, ground: 0x4e6a3a, intensity: 0.75 },
    spawns: {
      tf: [[-10, -19.5], [-4, -20], [2, -19.5], [8, -19], [-13, -18.5], [12, -19.5]],
      sp: [[10, 19.5], [4, 20], [-2, 19.5], [-8, 19], [13, 18.5], [-12, 19.5]],
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
