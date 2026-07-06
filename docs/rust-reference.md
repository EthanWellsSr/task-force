# Rust reference study + gap list (#8a)

Yardstick doc for the Rust rework (#8b–#8f). Every accuracy assessment in
those items is judged against this catalog. Sources: Activision's MW2019
[Tactical Map Intel: Rust](https://blog.activision.com/call-of-duty/2020-02/Modern-Warfare-Tactical-Map-Intel-Rust)
(the 12-zone callout map — the remake is layout-faithful to MW2) and the
[COD Mobile Map Snapshot: Rust](https://blog.activision.com/call-of-duty/2020-04/Call-of-Duty-Mobile-Map-Snapshot-Rust)
(compass positions, tower climb routes), cross-checked against MW2 overhead
callout maps. Items I could not pin down from top-down references are
flagged **[verify]** — confirm or record as a deviation during #8b/#8d, do
not silently guess.

## Compass convention

**Game +x = north, +z = east** (right-handed with y-up). Chosen so the
existing spawn corners already match the real map's spawn axis:

- `spawns.tf` corner (−x, −z) = **southwest = Loading Dock** (Coalition).
- `spawns.sp` corner (+x, +z) = **northeast = Front Gate** (Allegiance).

All top-down screenshots for the accuracy assessments should be rendered
with +x up so "north up" matches the reference maps.

## Proportions

Real Rust is a small, roughly **square** playable area, a shade larger than
it feels — spawn-to-spawn diagonal runs ~8 s. Current `buildRust` is 34×34 m
(`W = 17`), which is too tight for the tower to read as *tall* relative to
the ground you cross. Nuketown here is 48×40 (`W=24, D=20`).

**Recommendation: bounds W = 26 (52×52 m).** Keeps it the small map of the
two while giving the pipeline run, the container clusters, and the
tower-dominates-all sightlines room to exist. Perimeter is **sand dunes**
(sloped berms, not the current uniform 3 m walls) with the wrecked-fence
line along them.

## Landmark catalog (the 12 zones + physical features)

Positions in compass terms; convert via the convention above.

### Center — the Tower (the map's identity)
Multi-level oil-derrick scaffold, climbable, top platform overlooks the
entire map. Levels, bottom to top:

1. **Under-tower maze** (ground): machinery/pipes between the legs — a
   close-quarters pocket you fight *through*, not just past. The current
   4-post + platform build has nothing here.
2. **Mid platform(s)** (~3–3.5 m): reached by **ladder on the east side**
   from the fuel-tank/shipping-crate area, plus "pathways winding around
   and further up the tower".
3. **Top platform** (~9–10 m, with rails): reached by the **south-facing
   exhaust chute** (a walkable diagonal chute/ramp) or continuing the
   ladder route. Dominant sightline over everything; the drop is lethal
   flavor in the real map.

Engine translation: no ladders exist — every climb route becomes a
step-chain/ramp of boxes with **risers ≤ 0.55 m** (`stepUp` in
js/main.js:1612) or bots can't follow (#8c/#8e). The chute is the natural
ramp; the east ladder becomes a crate-step chain.

### North edge — Pipeline
Elevated pipe run covering the northernmost side, playable **over and
under**, with a spur splitting off toward the tower and toward the north
fence. This is a full-edge traversal lane, not a prop.

### Northwest corner — Oil Derrick
Raised platform structure (distinct from the central tower) with top,
ground, and underneath levels. The current map has nothing in this corner.

### Northeast corner — Front Gate (`sp` spawn)
Gate in the perimeter fence, stacked boxes for verticality. **Comms
Station**, a small corrugated shed, sits nearby.

### East edge — Red Containers / fuel tank
Shipping-crate + fuel-tank cluster, the transition lane between Front Gate
and Fuel Depot; hosts the ladder/step route onto the tower's mid platform.

### Southeast corner — Fuel Depot
Moderately protected corner; the south side's **barricade + fuel depots**
make the southern approach the CQB pocket.

### South-center — Maintenance and Control Room
**Control Room**: extremely small structure dividing Generators from
Maintenance, with a **slide path down into Maintenance** — i.e. Maintenance
sits in the map's low ground (shallow sunken basin) **[verify exact pit
shape/depth from top-down]**. Maintenance holds objective-grade open space
with scattered cover.

### Center, flanking the tower — Generators
Generator machinery blocks that split the mid into north and south halves —
the mid-lane cover that keeps the tower from seeing *literally* everything
at ground level.

### Southwest corner — Loading Dock (`tf` spawn)
The most protected zone: barriers + container stacks. Container cover here
is part of the spawn's protection, distinct from the Blue Containers lane.

### West edge — Blue Containers
Container(s) forming a short covered path along the middle of the west
edge, the transition between Oil Derrick (NW) and Loading Dock (SW). The
open west end has cover pockets to its north and south.

### Tri-level scaffold structure
Named in the rework brief; this is the plank-level scaffold adjacent to
the tower complex **[verify position — likely the southeast face of the
tower complex toward Fuel Depot]**. Treat as part of the #8c tower-complex
build; record final placement honestly in assessment #1.

### Scatter props
Oil drums, wooden pallets/crates, tires throughout — cover garnish, placed
after lanes work (#8d).

## Reference top-down (schematic)

```
                       N  (+x)
        ┌────────────── Pipeline ──────────────┐
        │ Oil Derrick        Comms  FRONT GATE │
        │  (NW, raised)      Station  (sp spawn)│
        │                                       │
   W    │ Blue         Generators    Red        │   E
  (−z)  │ Containers  ┌─ TOWER ─┐   Containers  │  (+z)
        │ (mid-edge   │ mid/top │   fuel tank   │
        │  lane)      └─ maze ──┘   (tower      │
        │              Control Rm    ladder)    │
        │              ↓ slide                  │
        │ LOADING DOCK  Maintenance   Fuel      │
        │ (tf spawn,    (low ground)  Depot     │
        │  barriers)   [S barricade CQB]        │
        └───────────────────────────────────────┘
                       S  (−x)
```

Sight lines that make Rust play like Rust (the assessment must check
these, not just prop positions):

- **Tower top → everywhere**: the only all-seeing spot, paid for by a
  slow, exposed climb.
- **Long diagonals** spawn-to-spawn (Front Gate ↔ Loading Dock) broken
  only by the tower complex and Generators.
- **North lane** over/under the pipeline — a flank that trades exposure
  (on top) for slow cover (under).
- **West and east edge lanes** past the container clusters — short-cover
  hopscotch, no full-length sightline.
- **South CQB pocket** — barricade/fuel-depot clutter kills sightlines
  entirely.

## Gap list vs current `buildRust` (js/maps.js:557)

Essentially everything, itemized:

| Current (line) | Verdict |
|---|---|
| `W = 17` → 34×34 m (:559) | **Wrong size.** Rebound to W=26 (52×52). |
| Perimeter: uniform 3 m berm walls (:568-575) | **Wrong.** Should read as dunes + wrecked fence; Front Gate needs an actual gate landmark in the NE. |
| Tower: 4 posts, one 5×5 platform at y≈3, rails, 2 crate steps, decorative pole (:578-587) | **Rebuild ground-up (#8c).** No under-maze, no mid level, no top platform, ~3 m vs ~9-10 m, one crate-step route vs chute + east ladder routes. |
| 4 scattered single containers (:590-593) | **Regroup.** Blue Containers = W mid-edge lane; Red Containers = E mid-edge cluster with fuel tank; container stacks at Loading Dock. Random scatter matches nothing. |
| 1 shed at E-center (:596-599) | **Reposition/multiply.** Real sheds: Comms Station (NE), Control Room (S-center, with the Maintenance slide). |
| 1 pipe run, 7 m, 2 pipes, W of center (:602-609) | **Re-lay entirely.** The pipeline is the full north edge, elevated, walkable over AND under, with a spur toward the tower. Idiom (cylinders + box collider) is reusable. |
| Scattered crates/barrels (:612-617) | Fine as garnish; re-place per zone in #8d. |
| Spawns: tf (−,−) / sp (+,+) diagonal (:630-633) | **Keep the corners** — under the compass convention they're already Loading Dock (SW) and Front Gate (NE). Re-tune exact points to the new structures. |
| Missing entirely | Oil Derrick (NW), Front Gate structure, Comms Station, Generators, Control Room, Maintenance + low ground/pit, Fuel Depot, S barricade CQB pocket, tri-level scaffold, dunes. |
| `waypointSeeds`: flat 7×7 grid + 5 extras (:619-623) | **Rebuild (#8e).** New footprint + y-aware `[x,z,y]` seeds for every tower level, derrick platform, and pipeline top. |

## Accuracy-assessment protocol (for #8b, #8d, #8f)

1. Orthographic top-down via the DEBUG harness, +x up, full bounds in frame.
2. Side-by-side against the schematic/zone map above.
3. Written match/miss list, zone by zone (all 12), plus the five sight-line
   checks. A miss is a miss — fix it or record it as a known deviation with
   a reason. No "close enough".
