# Nuketown reference study + gap list (#17a)

Yardstick doc for the Nuketown rework (#17b–#17f), same shape as
docs/rust-reference.md. Every accuracy assessment in those items is judged
against this catalog.

## Which Nuketown

**Original *Black Ops* (2010) Nuketown**, as re-verified against its
layout-faithful remakes (*Nuketown '84*, COD Mobile, BO6/BO7 *Nuketown
2025* — all keep the same footprint, house positions and vehicle
placement; 2025 only re-skins the props). Chosen because the existing
`buildNuketown` was already aimed at it (teal + yellow houses, school bus,
moving truck, mannequins) and because the original's props (fallout
shelter, swing set, population-counter sign) are the ones people mean when
they say "Nuketown".

Sources used:

- Activision, [COD Mobile Map Snapshot: Nuketown](https://blog.activision.com/call-of-duty/2019-10/Call-of-Duty-Mobile-Map-Snapshot-Nuketown)
  — the load-bearing source. Gives compass positions ("north green-blue
  house and the south yellow house"), spawns ("teams spawn on opposite
  sides of the map in the backyard of two houses"), both street ends ("to
  the west is a lone car that sits in front of a pink house at the end of
  the dead end"; "to the east … a blockade in front of the vista"), the
  three upstairs entries, and the second-floor sniper sightlines.
- Activision, [Tips for dominating Nuketown '84](https://blog.playstation.com/2020/11/24/tips-for-dominating-nuketown-84-in-black-ops-cold-war-live-now/)
  — the rear balcony + exterior staircase down to the back lawn.
- [Call of Duty Maps: Nuketown](https://callofdutymaps.com/black-ops/nuketown/)
  — Nevada test-site setting, desert flats + mountains beyond the fence,
  the countdown tower outside the fence, the Treyarch Unified School
  District bus, mannequins, named mailboxes (Woods = yellow house,
  Mason = green house).
- COD Wiki [Nuketown trivia](https://callofduty.fandom.com/wiki/Nuketown_(map)/Trivia)
  — house numbers (yellow 11, green 13), the *Welcome to Nuketown* sign
  with its live population counter, the swing set + shed behind the yellow
  house, the fallout shelter behind the green house.
- Matthew Menke, [Nuketown level analysis](https://medium.com/@Shiiver/nuketown-level-analysis-1c61077928be)
  — lane structure: perimeter routes around the houses, interior routes
  through them, the central avenue between the vehicles, ~15 s to cross.

Anything I could not pin down from a reference is flagged **[verify]** —
confirm it or record it as a deliberate deviation during #17b/#17d/#17f.
Do not silently guess.

## Compass convention

**Game +x = north, +z = east** (right-handed, y-up). This makes the
Activision compass fall out of the existing geometry:

- Green/teal house = **north** (+x half).
- Yellow house = **south** (−x half).
- Pink house at the street's dead end = **west** (−z end).
- Roadblock / blockade = **east** (+z end).
- Team spawns are the two **backyards**: north backyard (+x edge) and
  south backyard (−x edge).

Top-down renders for the assessments use an `OrthographicCamera` at
`(0, 80, 0)` with `up = (1, 0, 0)`, which puts **+x (north) up and +z
(east) right** — verified by projecting probe points. The current code has
teal on −x and yellow on +x, i.e. the two house colors are swapped
relative to reference; see the gap list.

## Proportions

Nuketown is tiny — "crossing it takes about 15 seconds". The long axis is
**across** the street (backyard → house → front yard → street → front
yard → house → backyard), not along it. Current bounds are **48 m (x,
across) × 40 m (z, along the street)**, which is the right shape and about
the right size. **Keep `W = 24, D = 20`.** No fog/`buildMushroomCloud`/
sniper-falloff retuning needed (all keyed to bounds, which don't move).

## Landmark catalog

### The two houses (the map's identity — Nuketown's "tower")

Two two-storey houses facing each other across the street, **offset along
the street** so the map is point-symmetric, not mirror-symmetric — but
they still **overlap across the street** so the upstairs windows of one
frame the upstairs windows of the other. The window-to-window duel over
the street is the single most identity-defining sightline on the map.

- **North house**: green/blue ("greenhouse", Mason's, number 13).
- **South house**: yellow (Woods's, number 11).
- Ground floor: living room to the street, kitchen behind, front door onto
  a porch, back door onto the backyard.
- Second floor: bedroom(s) with **windows over the street**, plus a
  **rear balcony/deck**.
- **Three upstairs entries** (all three must exist and be bot-walkable):
  1. interior staircase from the ground floor;
  2. **an exterior staircase from the backyard up to the rear deck**,
     which has a door inside;
  3. **through the front/main window via climbable objects** (in-engine:
     a crate/AC-unit step chain onto the attached garage roof, then in
     through an upstairs window). **[verify]** — reference says only "a
     series of climbable objects"; the garage-roof route is our engine
     translation.
- **Attached garage** on the flank of each house, opening onto a driveway
  that runs out to the street. Interior door into the house.
- Mailbox by each front walk.

### The street (the "cul-de-sac")

A straight two-lane residential street running west–east between the two
front yards, dead-ended at both ends. Curbs + sidewalks both sides, centre
dashes. This whole middle zone is what players call *the cul-de-sac*.

- **School bus** (yellow, "Treyarch Unified School District"), parked at an
  angle in the middle of the street.
- **Moving/delivery truck** with an open cargo hold, beside the bus. The
  bus + truck form the mid-street cover pair; you squeeze between them.
- Additional cars as secondary cover.

**[verify]**: reference top-downs show a straight street; no round
turnaround circle is visible mid-map. A modest **turnaround bulb at the
west dead end** (in front of the pink house) is the only place a
cul-de-sac circle belongs.

### West end — pink house + lone car (dead end)

"A lone car that sits in front of a pink house at the end of the dead
end." A **residential** pink/salmon house closing the street, not an
industrial building.

### East end — the blockade

"A blockade in front of the vista where the rest of the community lives."
Jersey barriers / sandbags / wire across the road, with a military vehicle
behind it. **[verify]** exact make-up; sandbag + barbed wire is an
acceptable approximation.

### Front yards

Shallow lawns between the picket fence and each porch. **Real, slatted
white picket fences** with a gate onto the front walk — this is the
signature look of the map's foreground (and the subject of #13).

### Backyards (the spawns)

Each backyard is its team's spawn. Fenced with tall board fence, gates at
both ends onto the side lanes. Contents:

- both: a **garden plot** at the very rear, a **shed** for cover.
- south/yellow: a **swing set**.
- north/green: a **fallout shelter** (bunker hatch/mound).

### Side lanes

The perimeter routes: from each backyard gate, along the outside of that
house's yard, past a corner lawn, out to a street end. These are the two
flank lanes; they and the street are the map's three routes.

### Signature props

- **"Welcome to Nuketown" sign** with a live population counter, by the
  road at a street end.
- **Mannequins** scattered through the yards and street.
- **Countdown tower** on the horizon outside the fence (nuclear-test
  timer).
- Desert flats + mountains beyond the perimeter fence; power poles, street
  lamps.

## Reference top-down (schematic)

```
                          N  (+x)
        ┌──────────────────────────────────────────┐
        │  garden  shed   NORTH BACKYARD  swing?   │  ← sp spawn
        │  ┌──────────── board fence ───────────┐  │
        │  │  GREEN HOUSE   ┌───────┐           │  │
   W    │  │  (2 storey,    │garage │  rear deck│  │   E
  (−z)  │  │   number 13)   └───────┘ + ext.stair  │  (+z)
        │  └── porch ── picket fence ── gate ───┘  │
 pink   │        ░░░░░░ STREET ░░░ bus ░░ truck ░░ │  block-
 house  │  ┌── gate ── picket fence ── porch ────┐ │  ade
 + car  │  │ rear deck   ┌───────┐  YELLOW HOUSE │ │
        │  │ + ext.stair │garage │  (number 11)  │ │
        │  └──────────── board fence ───────────┘  │
        │  fallout shelter   SOUTH BACKYARD  shed  │  ← tf spawn
        └──────────────────────────────────────────┘
                          S  (−x)
```

(The two houses are offset along z — green shifted east, yellow shifted
west **[verify]** which way — but their footprints still overlap across
the street.)

Sight lines that make Nuketown play like Nuketown. **The assessments must
check these, not just prop positions:**

1. **Upstairs window → upstairs window** across the street, both ways.
   Must be clear over the bus/truck roofs.
2. **The mid-street lane**, full length, broken only by the bus + truck.
3. **The two flank lanes** (backyard gate → corner lawn → street end),
   with cover but no full-length sightline.
4. **Second-floor overlook of the enemy front yard and the street** from
   each upstairs window.
5. **Rear-deck overlook of one's own backyard** (and therefore of the
   enemy pushing your spawn through the side gate).
6. **Spawn-to-spawn** must NOT be a clean line — the houses block it.

## Gap list vs current `buildNuketown` (js/maps.js:150)

The bones are right (two mirrored two-storey houses, street between them,
bus + truck, backyard spawns, dead ends both sides). The gaps are
proportion, the houses' interior/vertical structure, and the props.

| # | Current (line) | Verdict |
|---|---|---|
| G1 | Bounds `W=24, D=20` (:152) | **Keep.** Right shape, right size. |
| G2 | Teal house on −x, yellow on +x (:273-274) | **Swap.** Reference: green/blue is north (+x), yellow is south (−x). |
| G3 | House z-centres at ∓9, depth 10 → **zero overlap across the street** (:216-225) | **Move.** The two houses never face each other; the identity window duel is impossible. Re-centre to ∓3 with a 12 m street-facing length so ~6 m of façade directly faces. |
| G4 | Big asphalt **circle** r=7.2 + curb/sidewalk rings at the origin, street only as a spur south (:175-185) | **Rebuild.** No round cul-de-sac mid-map in reference. Straight two-lane street the full z length, curbs + sidewalks + centre dashes, with a **turnaround bulb at the west dead end** only. |
| G5 | 18×4 m **pink industrial hall** with two red roll-up doors, 20.6 m grey roof, rooftop vent, white carport posts (:348-362) | **Rebuild as a pink two-storey house** with a porch, gable roof and the lone car in front. It is a *house* at the dead end, not a facility. |
| G6 | Front "pickets" are solid 1.25 m slab walls (`wall()`, colour `0xe6e4da`) with stub segments (:293-295) | **Rebuild (#13b).** Real slatted picket runs (slats + top/bottom rail), **one collider per run**, gate gaps preserved. |
| G7 | Free-standing white posts: porch posts (:264-265), pergola posts (:340-341), facility carport posts (:359), full-height TRIM corner boards (:255-256) | **Orphan-post pass (#13c).** Connect (rails), slim (corner boards → thin trim), or delete. Confirm visually first (#13a). |
| G8 | Upstairs reachable **only** by the interior staircase (:242-243) | **Missing 2 of 3 entries.** Add the rear deck + exterior staircase, and a climbable chain (crates → garage roof → upstairs window). Risers ≤ 0.55 m or bots can't follow (`stepUp`, js/main.js:2670). |
| G9 | Open **carport** with a pickup under it (:308-313) | **Rebuild as a garage**: three walls + open front, interior door to the house, walkable roof (feeds G8's climb route). |
| G10 | No rear deck / balcony; a teal-only front balcony rail (:276-277) and a yellow-only ground pergola (:339-344) | **Replace** both with the symmetric rear deck + exterior stair on each house. |
| G11 | Backyards: shed + 2 crates + camper (:315-326) | **Add** the garden plot (both), **swing set** (south/yellow), **fallout shelter** (north/green). Keep shed. |
| G12 | Missing: *Welcome to Nuketown* sign + population counter | **Add** by the road at a street end. Counter can read the live combatant count **[verify]** — a static number is acceptable. |
| G13 | Radio tower on the NW horizon (:485-492) | **Reskin** as the nuclear **countdown tower** (mast + a big counter board). |
| G14 | Barricade: sandbags + barbed wire + army truck at +z (:364-372) | **Keep**, re-place to the new street end. Approximation, recorded. |
| G15 | Mannequins scattered singly (:478-483) | **Group** them into reference-style tableaux (front lawns, porch, street). |
| G16 | Spawns in the backyards (:545-548) | **Keep the corners**; re-tune to the new backyard footprints. |
| G17 | `waypointSeeds`: 11×10 grid + mirrored hand seeds (:499-536) | **Rebuild (#17e).** New footprint; y-aware seeds for both upstairs, both rear decks, both garage roofs. |
| G18 | Camper in the corner lawn (:322-323), hedges | Fine as garnish; re-place per zone in #17d. |

## Accuracy-assessment protocol (for #17b, #17d, #17f)

1. Orthographic top-down via the DEBUG harness, `up=(1,0,0)` so **+x
   (north) is up and +z (east) is right**, full bounds in frame.
2. Side-by-side against the schematic above.
3. Written match/miss list, zone by zone (houses, street, both ends, front
   yards, backyards, side lanes, props), plus the **six sight-line
   checks**. A miss is a miss — fix it or record it as a known deviation
   with a reason. No "close enough".
4. #17f additionally: full-lobby soak (spawns, no stuck bots, no falls
   through colliders), nuke cinematic still frames the map, and eye-level
   screenshots down each of the three lanes and out of both upstairs
   windows.
