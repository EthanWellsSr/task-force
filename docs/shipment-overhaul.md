# Shipment overhaul — layout rework plan (#21 follow-up)

Working doc (gitignored, like to-do-list.md). Written 2026-07-08 after the
`#21` build shipped with the **wrong interior topology**. Yardstick is
`docs/shipment-reference.md`, whose block-out section is being corrected in the
same pass (the original block-out was itself wrong — see below).

Everything below lives in `buildShipment`, `js/maps.js:950`, unless noted.

## What's wrong (the one-line version)

The containers themselves look great — keep `container()`, the weathered
palette, the double-stacked perimeter idiom, and the corrugation/frame/door
detailing. **The interior arrangement is a different map.**

The `#21` build (and the reference doc it was built against) put a **single
solid center block** + two lane flanks + **four corner container stacks**. Real
CoD4 Shipment is *"a basic square with four smaller squares made of shipping
containers inside it, creating an intersection. Extra angled shipping
containers that the player can traverse through and take cover in are leaned up
against each wall"* (Wikipedia, corroborated by the callout overhead below).

The identity of Shipment is the **central crossroads formed by a 2×2 of
containers** — not a center mass. That's the whole fix.

## Authoritative overhead

Source: the CoD4 Shipment compass/overhead callout
(`callofdutymaps.com/wp-content/uploads/shipmentcompass.png`), cross-checked
against the Wikipedia layout description and Activision's MW2019 Tactical Map
Intel: Shipment. Rendered +x north up, +z east right, matching our convention.

```
             N (+x) — sp spawn end
   ┌──────────[ === wall === ]──────────┐
   │ ·debris·      ▭▭▭▭▭ (N)     ·debris· │   N: one z-long HOLLOW container
   │            (hollow, open sides)      │      (walk-through), off the N wall
   │   ┌─────┐               ┌─────┐      │
   │   │ NW  │      N–S lane  │ NE  │      │   CENTER: four x-long containers in
 W │   │hollw│    ┌────────┐  │solid│      │ E   a 2×2. The cross-gap between them
(−z)│  └─────┘  E │  the + │W └─────┘      │(+z) is the signature intersection.
   │           ─lane crossroads lane─      │     Two of the four are HOLLOW
   │   ┌─────┐    └────────┘  ┌─────┐      │     (point-symmetric: NW + SE).
   │  ╱│ SW  │               │ SE  │╲      │
   │ ╱ │solid│               │hollw│ ╲     │   E/W: TWO leaned containers each,
   │╱  └─────┘   ▭▭▭▭▭ (S)   └─────┘  ╲    │     a shallow V against the wall —
   │ ·debris·  (hollow, open sides)  ·debris·│   traversable + climbable.
   └──────────[ === wall === ]──────────┘     │
             S (−x) — tf spawn end            CORNERS: debris (barrels, junk
                                              car, crates) — NOT container stacks.
```

## Decisions locked (2026-07-08)

**D1 — angled E/W containers → rotate the mesh, hull it with stepped AABBs.**
The whole engine is axis-aligned `Box3` (`moveEntity`/`_fitsAt` `js/main.js:8`,
throwables `:1780`, LOS `losClear`, minimap `:1087`, `buildNavGraph`
`intersectsBox` `js/maps.js:1131`). True oriented (OBB) colliders would touch
all six subsystems — out of scope for a map. Instead: draw the container body as
a **rotated mesh** (yaw quaternion, the `beam()` idiom `js/maps.js:125`), and
back it with **2–3 small axis-aligned collider boxes stepped along the leaned
diagonal** so collision, step-up, and nav hug the visible footprint. The lean is
shallow (~15–20°) so a 2-box stepped hull reads clean. Record the tiny
AABB-vs-mesh gaps at the ends as a known, sub-tuning-tolerance deviation.

**D2 — enterable containers → build true hollow walk-throughs.**
The two diagonal center containers and both N/S end containers are hollow: a new
`hollowContainer()` helper = two long side-wall boxes + a walkable roof slab +
(optionally) a lintel over each open end, all thin AABBs, **no full-body
collider**. Thread nav seeds straight down the open axis so bots path through.
Walkable roof feeds the climb routes (D-climb below). This is the CQB
walk-through / shoot-through flavor Shipment is known for.

## New block-out (metres, y = box-center height, 180° point-symmetric)

Container unit **6 (long) × 2.6 (wide) × 2.6 (tall)**, `H = 2.6`, tops walkable.

**Footprint: `bounds { x: 12, z: 11 }` (24 × 22 m).** Square up from the current
24×20 — real Shipment is near-square, a hair longer on the spawn axis. The extra
z eases the N/S lane pinch around the center 2×2.

### Perimeter (keep current idiom)
Double-stacked container walls, sealed by blockers + a tall cap.
- N/S walls at x = ±12, z-long units covering z −11..11 (4 units).
- E/W walls at z = ±11, x-long units covering x −12..12 (4 units).

### A. Center 2×2 — the crossroads (the identity)
Four x-long containers:
- `NW (+4.3, −2.4)`, `NE (+4.3, +2.4)`, `SW (−4.3, −2.4)`, `SE (−4.3, +2.4)`.
- Cross-gap: **N–S lane** at |z| ≲ 1.1 (~2.2 m), **E–W lane** at |x| ≲ 1.3
  (~2.6 m), meeting at the origin = the central intersection.
- **Hollow pair (walk-through):** `NW` + its mirror `SE`. Open ends face along x
  (into the N and S lanes). Solid pair: `NE` + `SW`.

### B. N/S end containers (hollow, enterable from a side)
- z-long hollow container at `(+9.6, 0)` and mirror `(−9.6, 0)`, ~1 m off the
  end wall. Open ends face E/W. Team spawns tuck behind them.

### C. E/W leaned pairs (D1)
- Two containers each near z = ±10.2, yaw ~±18° into a shallow V:
  west ≈ `(+2.6, −9.9)` and `(−2.6, −9.6)`; east mirror. Walkable tops.

### D. Corners — debris, not containers
- Barrel clusters (`k.barrel`), a junk car (`k.car`), a crate or two
  (`k.crate`) tucked into each corner. Cover height only; nothing tall enough
  to peek the world or stack into a perch.

### D-climb. Verticality
- Crate step-chains (risers ≤ 0.55 so bots step-up, `js/main.js` step logic)
  onto the center-block roofs and the hollow-container roofs. Keep the existing
  chain idiom, re-placed to the new masses. Cross-map "roof running" between the
  2×2 and the leaned pairs is a bonus if the gaps allow a jump; don't force it.

### Spawns
- tf (south, −x end): ~5 points across x ≈ −11, z spread −6…6, behind the S
  container / SW corner.
- sp (north, +x end): the point mirrors.
- Verify none land inside geometry (incl. the stepped-AABB hulls) and > ~3 m apart.

### Nav (`waypointSeeds`)
- Ground grid over the four lanes + the perimeter ring; skip cells inside the
  masses (graph filters them, but keep the grid honest).
- **Seeds straight through both hollow center containers and both hollow N/S
  containers** so bots use the walk-throughs.
- y-aware `[x, z, y]` seeds on every walkable roof (2×2 tops, hollow-container
  roofs, leaned tops) + on each crate-chain tread.

## Work sequence

- **S1 — `hollowContainer()` helper** in MapKit/maps.js: side walls + roof +
  open ends, thin AABBs, no body collider. Unit-test collision by eye (bot
  walks through, stands on roof).
- **S2 — rotated-container support (D1):** yaw param on the container draw +
  a `stepped-hull` collider helper (N small AABBs along the leaned axis).
- **S3 — rebuild `buildShipment` interior** to the block-out above: delete the
  center block / flanks / corner stacks; add the 2×2, N/S hollows, E/W leaned
  pairs, corner debris, re-placed climb chains.
- **S4 — spawns + `waypointSeeds`** rebuilt for the new footprint (walk-through
  + roof seeds).
- **S5 — correct `docs/shipment-reference.md`** block-out/schematic/spawn/nav
  sections to match this (yardstick must be right). *(Doing the schematic +
  "what Shipment is" now; full block-out rewrite lands with S3.)*

## Verify protocol (DEBUG harness, per the memory workflow — don't commit)

1. Orthographic top-down, +x up, full bounds — confirm the **2×2 crossroads**,
   N/S hollows, E/W leaned V's, and corner debris match the overhead above.
2. Walk-throughs: bot + player path through both hollow center containers and
   both N/S containers; roofs walkable; leaned tops walkable.
3. Climb: crate chains reach every intended roof at ≤0.55 risers; bots follow.
4. `G.graph`: no isolated islands; elevated + walk-through nodes reachable.
5. Spawns: none inside geometry (incl. stepped hulls), all on the floor, spread.
6. Eye-level shots down each of the four lanes + through the central crossroads;
   no console errors; bots spawn, path, and fight the space.
7. Zone-by-zone match/miss list vs the overhead. A miss is a miss — fix it or
   record it as a known deviation with a reason. No "close enough".

## Implemented — intentional deviations (2026-07-08, #21b)

The rework landed to plan except:

- **Bot roof seeds only on the two SOLID center perches (NE + SW), not "every
  walkable roof."** The plan (Nav §, D-climb) wanted y-aware seeds on all
  roofs. But this engine's nav is AABB + zero-width LOS: two same-height roof
  seeds ≤ 8.6 m apart with clear LOS over a floor gap get a bidirectional edge,
  and a bot walking it falls into the gap. The solid perches sit ~9.85 m apart
  (beyond the 8.6 m link limit), so they seed safely; the hollow center/end
  roofs and leaned tops are left as **player-only parkour** (no bot seeds) to
  keep `G.graph` one clean component. Net: the two hollow center containers are
  walk-*throughs*, the two solid ones are climb-*overs* — a clean split.
- **N/S end hollows at x ±9.5** (plan said ±9.6) and **leaned yaw ≈ 16°**
  (plan said 15–20°) — trivial, within tolerance.
- **Spawns at x ±10.2** (plan said ±11): x ±11 lands inside the end-wall
  container body; ±10.2 clears it.
- **Climb chain last crate at 2.5, not 2.05:** a final rise of exactly 0.55
  fails a float compare (`2.6 − 2.05 = 0.5500000000000003 > 0.55`) and strands
  bots on the top crate, so the chain steps 0.5 → 2.5 then 0.1 onto the roof.
