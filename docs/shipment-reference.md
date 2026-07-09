# Shipment reference + block-out plan (#21)

Build plan for the CoD4 **Shipment** map — a tiny, square-ish shipping
container yard with brutal close-quarters and almost no long sightlines. This
doc is the yardstick the `buildShipment` build is judged against, same role as
`nuketown-reference.md` / `rust-reference.md`.

> **✅ Reworked (2026-07-08, #21b).** The original `#21` interior (single
> center block + lane flanks + corner container-stacks) was **wrong topology**
> and has been rebuilt. Real Shipment is a **2×2 of containers forming a
> central crossroads**, with hollow walk-through containers off the N/S walls,
> leaned container pairs against the E/W walls, and **debris** (not container
> stacks) in the corners. The sections below now describe the **implemented**
> layout; `docs/shipment-overhaul.md` is the rationale/history doc.

## What Shipment is (CoD4)

- The smallest map in the series: a flat rectangular yard **walled in by
  shipping containers**, no exits.
- A **2×2 of containers in the middle** forming a crossroads you fight around,
  through, and on top of, plus containers leaned against the edges and
  **debris** (not stacks) in the corners.
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
**26 × 24 m playable** — `bounds { x: 13, z: 12 }` — square-ish, like real
Shipment (a hair longer on the north–south spawn axis). The two team ends are
the x = ±13 faces.

Container unit: **6 m long × 2.6 m wide × 2.6 m tall** (`H = 2.6`, tops
walkable). Perimeter runs are **double-stacked to 5.2 m** so a player on an
inner container can't peek out of the world; invisible blockers seal the box.

## Block-out (implemented — all coords in metres, y is box-center height)

Built with 180° point symmetry: pieces are placed at `(x,z)` and mirrored to
`(−x,−z)` so both teams get an identical yard. Lives in `buildShipment`,
`js/maps.js`. Container helpers: `container()` (solid), `hollowContainer()`
(walk-through: two thin side-wall colliders + a walkable roof slab, **open
ends, no body collider**), `leanedContainer()` + `steppedHull()` (yawed mesh
backed by an axis-aligned stepped hull, since the engine is AABB-only).

### Perimeter (enclosed container wall, double-stacked)
- **North / South walls** (x = ±13), containers long along z, four 6 m units
  at z = ±9, ±3, stacked two high → 5.2 m.
- **East / West walls** (z = ±12), containers long along x, four 6 m units at
  x = ±9, ±3 (the ±12..13 ends are wrapped by the N/S walls), stacked two high.
- Invisible blocker caps just outside each wall (full body height, z ±12.6 /
  x ±13.6) guarantee containment even where a climb reaches a wall top — the
  caps alone seal the box, so no wall gap can leak.

### A. Center 2×2 — the crossroads (the identity)
Four x-long containers at `(±4.3, ±2.4)` leaving a **2.2 m N–S lane** (|z|≲1.1)
and a **2.6 m E–W lane** (|x|≲1.3) that meet at the origin — the signature
intersection.
- **Hollow walk-throughs (open along x):** `NW (4.3, −2.4)` + mirror
  `SE (−4.3, 2.4)`. `hollowContainer(..., 'x', …)`.
- **Solid climb-on-top perches:** `NE (4.3, 2.4)` + mirror `SW (−4.3, −2.4)`.
- **Climb onto each solid perch:** a 5-crate step chain off its outer (±z)
  face — crate tops 0.5 → 2.5 then a 0.1 step onto the 2.6 roof. Every rise is
  well under the 0.55 step-up (a rise of *exactly* 0.55 fails a float compare
  and strands bots, so the last crate is 2.5, not 2.05). The two hollow center
  containers are walk-throughs, not perches — you cut through them, not over.

### B. N/S end containers (hollow walk-throughs)
- z-long `hollowContainer` at `(10.5, 0)` and mirror `(−10.5, 0)`, ~1 m off the
  end wall, **open along z** (E/W ends). They cap the ends of the N–S lane —
  you weave around them (or shoot/walk through) rather than run a straight
  spawn-to-spawn shot. Team spawns tuck to the flanks around them.

### C. E/W leaned pairs (yawed cover against the side walls)
- Two `leanedContainer`s each near the side walls: `(3.4, −10.25)` /
  `(-3.4, -10.25)` (yaw ∓0.28 rad ≈ ∓16°) and true 180° mirrors on `+z`,
  forming a shallow **V** with a narrow gap on the x = 0 lane. They cap the E–W
  lane before the wall. The visible mesh is rotated about y; collision is a
  **5-box stepped AABB hull** marched along the yawed centerline with slight
  padding so the visible solid containers remain impenetrable. This
  intentionally over-covers the rotated mesh a little, because true OBB
  colliders would touch movement, throwables, LOS, minimap and nav.

### D. Corners — debris, not containers
- Junk cars on the NE/SW diagonal, barrel + crate clusters on the NW/SE
  diagonal, plus a barrel/crate against each corner. Cover height only —
  nothing tall enough to perch on or peek the world. **No corner container
  stacks.**

### Scatter
- A crate + barrel tucked into two of the side pockets, deliberately **off**
  the four lanes and the crossroads (which stay open) and clear of spawns and
  waypoint seeds.

## Schematic (top-down, +x up / north up) — CORRECTED

The signature is the **central crossroads formed by a 2×2 of containers**, not
a center mass. Two center containers (NW + SE) and both N/S end containers are
**hollow walk-throughs**; the E/W walls each get a **leaned pair**; corners are
**debris**. Full detail in `docs/shipment-overhaul.md`.

```
             N (+x) — sp spawn end
   ┌──────────[ === wall === ]──────────┐
   │ ·debris·      ▭▭▭ (N hollow)  ·debris· │
   │   ┌─────┐               ┌─────┐      │
 W │   │ NW  │   N–S lane    │ NE  │      │ E
(−z)│  │hollw│  ┌────────┐   │solid│      │(+z)
   │   └─────┘ E│ the +  │W  └─────┘      │
   │           ─crossroads─               │
   │   ┌─────┐  └────────┘   ┌─────┐      │
   │  ╱│ SW  │               │ SE  │╲     │
   │ ╱ │solid│  ▭▭▭ (S hollow)│hollw│ ╲    │
   │ ·debris·               └─────┘ ·debris·│
   └──────────[ === wall === ]──────────┘
             S (−x) — tf spawn end
   (E/W leaned container pairs sit in the ╱╲ slots against the side walls.)
```

## Spawns

Small map ⇒ spawns hug the two ends. The z-long end hollow blocks z ≈ 0, so
each team gets **5 points**: four tucked to the flanks at `x ≈ ±11.2`
(z = ±3.8 and ±7.2) plus one forward lane point at `(±7.6, 0)`, for pickSpawn to
spread across.

- **tf** (south, −x end): `[−11.2, 7.2]`, `[−11.2, 3.8]`, `[−11.2, −3.8]`,
  `[−11.2, −7.2]`, `[−7.6, 0]`.
- **sp** (north, +x end): the 180° mirror.

All ten verified on the floor, clear of every collider (incl. stepped leaned
hulls) and ≳3 m apart.

## Nav (`waypointSeeds`)

- Crossroads hub + seeds down all four lanes + a perimeter ring; the graph
  rejects any seed that lands inside geometry.
- **Walk-through seeds** threaded straight through both hollow center
  containers (open along x) and both N/S end hollows (open along z) so bots use
  the walk-throughs.
- **Elevated seeds** (`[x, z, y]`) up each solid perch's 5-crate chain and onto
  its 2.6 m roof.
- **Deviation (bot roofs):** only the two **solid** center perches (NE + SW)
  are bot-navigable roofs. They sit ~9.85 m apart, beyond the 8.6 m nav-link
  limit, so no cross-gap roof edge forms. The hollow center/end roofs and the
  leaned tops are left as **player-only parkour** (no bot seeds) — seeding them
  would create cross-gap roof edges (LOS is clear over the lane gaps but a bot
  walking one would fall). This keeps `G.graph` one clean component.

## Build + verify protocol

1. `buildShipment(scene, colliders)` in maps.js (MapKit + the map-local
   `container` / `hollowContainer` / `leanedContainer` / `steppedHull`
   helpers), registered in `MAPS`, with a `.map-card data-map="shipment"` +
   `shipment-art` menu card (index.html / css).
2. DEBUG-harness verification on the running build (2026-07-08, #21b):
   - Top-down (colliders projected +x up): 2×2 crossroads with the
     NW/SE-hollow + NE/SW-solid diagonal, N/S end-hollow roofs, E/W leaned V's,
     corner debris, open crossroads — no corner container stacks. ✓
   - Walk-throughs: player body traverses both center hollows (x 0.7→7.75) and
     both N/S hollows (z −4.2→4.2). ✓
   - Climb: both solid perches reach y = 2.6 up the crate chain (bot step-up
     0.55); the chain dead-ended at y 2.05 until the final rise was dropped
     below 0.55. ✓
   - Containment: pushes into all four boundaries stop inside the walls (N wall
     at x 11.32; E/W capped by the leaned V + full-height blocker caps). ✓
   - `G.graph`: **one** connected component (63 nodes), all 14 elevated nodes
     reachable; all 10 spawns clear. No console errors; nuketown/rust
     unaffected.
   - Widened ~1 m per side (2026-07-08): bounds 24×22 → 26×24; walls, N/S end
     hollows, E/W leaned pairs, corner debris and spawns all shifted out with
     the walls; the center 2×2 stayed put, opening up the lanes.
