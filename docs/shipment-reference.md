# Shipment reference + block-out plan (#21)

Build plan for the CoD4 **Shipment** map — a tiny, square-ish shipping
container yard with brutal close-quarters and almost no long sightlines. This
doc is the yardstick the `buildShipment` build is judged against, same role as
`nuketown-reference.md` / `rust-reference.md`.

## What Shipment is (CoD4)

- The smallest map in the series: a flat rectangular yard **walled in by
  shipping containers**, no exits.
- A **cluster of containers in the middle** you fight around and on top of,
  plus containers along the edges and stacked in the corners.
- **Four corner spawn zones**; in the real (chaotic) spawn system players
  flip corners constantly. We run TDM (two teams), so tf holds the south end
  and sp the north end — the four-corner idea is preserved as spawn *pockets*
  and is ready for §20b FFA to use all four independently.
- Sightlines are killed by the container walls: everything is a short lane or
  a corner peek. The only "height" is standing on a container.

## Compass + proportions

**+x = north, +z = east** (top-down renders +x up), matching Nuketown/Rust so
the tf(−) / sp(+) spawn convention carries over.

Much smaller than the others (Nuketown 48×40, Rust 52×52). Shipment is
**24 × 20 m playable** — `bounds { x: 12, z: 10 }`. Long axis is x (24 m,
north–south); the two team ends are the short (20 m) faces at x = ±12.

Container unit: **6 m long × 2.6 m wide × 2.6 m tall** (`H = 2.6`, tops
walkable). Perimeter runs are **double-stacked to 5.2 m** so a player on an
inner container can't peek out of the world; invisible blockers seal the box.

## Block-out (all coords in metres, y is box-center height)

Built with 180° point symmetry: most pieces are placed at `(x,z)` and mirrored
to `(−x,−z)` so both teams get an identical yard.

### Perimeter (enclosed container wall, double-stacked)
- **North / South walls** (x = ±12), containers long along z, spanning
  z −9..9 (three 6 m units centered at z = −6, 0, 6), stacked two high → 5.2 m.
- **East / West walls** (z = ±10), containers long along x, spanning
  x −12..12 (four 6 m units at x = ±9, ±3), stacked two high.
- Invisible blockers just outside each wall (and a tall cap) guarantee
  containment even where a climb reaches a wall top.

### Center cluster (the signature mass)
- Two containers straddling the origin, long along x:
  `box(0, 1.3, −1.5, 6, 2.6, 2.6)` and `box(0, 1.3, +1.5, 6, 2.6, 2.6)`.
- Reads as one solid **6 (x) × ~5.2 (z) × 2.6** block at map center; top is a
  contested high-ground platform. Leaves ~9 m lanes N and S of it and ~7 m
  side lanes E and W.
- **Climb onto center top:** a 3-crate step chain off the north face
  (risers 0.6/1.2/1.8, each ≤ the 0.55… wait — steps are boxes, the *rise
  between tops* is ≤0.55: crate tops at 0.9, 1.5, 2.1 then the 2.6 container)
  so both players and bots (step-up ≤0.55) can follow. Mirror chain off the
  south face.

### Flank containers (dogleg cover in the N/S lanes)
- `box(6, 1.3, −3.5, 2.6, 2.6, 6)` (long along z, N lane, pushed west) and its
  mirror `box(−6, 1.3, 3.5, …)` (S lane, pushed east). Force a dogleg down
  each long lane and give mid-lane cover.

### Corner stacks (the four corner zones)
- Two symmetric pairs cover all four corners:
  `box(9, 1.3, 7, 2.6, 2.6, 3.4)` + mirror `(−9,−7)`, and
  `box(9, 1.3, −7, …)` + mirror `(−9, 7)`. One container per corner, a couple
  stacked for a corner perch (climb via a single crate step so bots reach it).

### Scatter
- A few crates/barrels as garnish in the lanes after the masses read, placed
  clear of spawns and waypoint seeds.

## Schematic (top-down, +x up / north up)

```
              N (+x)  — sp spawn end
   ┌──────────[ === wall === ]──────────┐
   │  ▓stack        crate↑        ▓stack │
   │            ┌────────────┐           │
 W │   [flank]  │   CENTER   │           │ E
(−z)│   (west)  │   BLOCK    │           │(+z)
   │            └────────────┘  [flank]  │
   │  ▓stack        crate↓     (east,S)  │
   │  ▓stack                     ▓stack  │
   └──────────[ === wall === ]──────────┘
              S (−x)  — tf spawn end
```

## Spawns

Small map ⇒ spawns hug the two ends, tucked behind the end wall / corner
stacks so you don't spawn in the open center. Each team gets ~5 points across
its end for pickSpawn to spread across.

- **tf** (south, −x end): around `x ≈ −10.5`, `z` spread −6…6.
- **sp** (north, +x end): the point mirrors.

Verify none land inside a container or blocker, and that they're > ~3 m apart.

## Nav (`waypointSeeds`)

- Ground grid across the open floor (skip cells inside the center block /
  flanks / corner stacks — the graph filters seeds inside geometry, but keep
  the grid sensible).
- Lane seeds down both long lanes and both side lanes.
- **Elevated seeds** on the center-block top (and each climbable corner
  perch) with the `[x, z, y]` form, sitting on the 2.6 m surface, plus seeds
  on the crate-chain steps so bots can path up. Risers ≤0.55 keep the chain
  bot-followable.

## Build + verify protocol

1. `buildShipment(scene, colliders)` in maps.js (MapKit `k.box/blocker/crate`
   idiom), register in `MAPS`, add a `.map-card data-map="shipment"` +
   `shipment-art` to the menu (index.html / css).
2. DEBUG-harness verification on the running build:
   - Orthographic top-down (+x up), confirm the block-out matches this doc.
   - Spawns: none inside geometry, all on the floor, spread across the end.
   - Containers climbable where intended (center top + corner perch), tops
     walkable; the rest are solid cover.
   - `G.graph` covers the tight space (no isolated islands; elevated nodes on
     the center top are reachable).
   - No console errors; bots spawn, path, and fight in the space.
