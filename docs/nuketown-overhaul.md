# Nuketown overhaul — remaining polish list

Working doc (gitignored, like to-do-list.md). Updated 2026-07-08 after the
post-#17 backyard/prop cleanup. Yardstick stays `docs/nuketown-reference.md`.

Everything below lives in `buildNuketown`, `js/maps.js`, unless noted.

## Current state

The big layout pass is in place: straight street, color-correct houses, deeper
backyards, slatted front pickets, rear decks/exterior stairs, garage climb
route, complete swing set, no mannequins, and no north-backyard hatch/fallout
prop.

Completed/removed from the previous version of this doc:

- O1 rear exterior stairs widened to 2.2 m with handrails.
- O2 white corner-post trim removed; mannequin "white posts" removed entirely.
- O3 fallout shelter/hatch removed after repeated visual read issues.
- O4 swing set rebuilt as connected A-frames with chains/seats.
- Bus/truck separated so the center street cover pair has breathing room.
- Backyards deepened by expanding Nuketown x-bounds from 24 to 28.

## O5. Full visual audit after deeper-yard resize

**Why:** Expanding the backyards changed the map bounds, nav seeds, spawn
positions, perimeter walls, and minimap proportions. The code checks pass, but
the last few bugs were obvious only at eye level.

**Do:** Capture fresh screenshots from:

- both backyard spawns looking toward the house;
- both rear decks looking into the backyard;
- both side lanes from backyard gate to street end;
- center street between bus/truck;
- both garages, including the garage-roof climb route.

**Fix if seen:** any floating/slab-like prop, wall clipping, oversized shadow,
badly pinched side lane, or prop that looks like part of a house landed in the
wrong place.

**Verify:** `node --check js/maps.js`, nav graph `0` orphans / `0`
unreachable, all spawns clear, browser smoke test.

## O6. Rebalance deeper backyard cover

**Why:** The rear fences are farther from the houses now, but the cover layout
is still mostly the old shallow-yard layout shifted backward. The yards may
feel too empty at the rear and too cluttered near the house/garage edge.

**Do:** After playing both sides, adjust only the backyard cover pieces:

- keep a clear route from spawn to rear stair;
- keep both backyard gate routes readable;
- spread shed/garden/crates so the rear half of each yard has useful cover;
- avoid large roof-like slabs or low grey props in the north yard.

**Verify:** spawn-to-stair and spawn-to-gate bot paths still work; no spawn
point intersects cover.

## O7. North backyard identity replacement

**Why:** The fallout shelter was reference-correct in concept, but in this
engine it repeatedly read as a random roof/bed/garage artifact. Nuketown still
benefits from a distinct north-backyard identity prop, but it must be visually
unambiguous.

**Do:** If adding a replacement, prefer a small vertical or wall-mounted prop
instead of a low horizontal hatch. Good candidates:

- warning placard mounted flat on the rear fence;
- small concrete utility box against the fence;
- painted radiation symbol on the board fence using simple flat boxes.

**Avoid:** any freestanding low grey slab, angled hatch, separate sign post, or
object placed near the garage side of the yard.

**Verify:** eye-level north backyard shot. If it does not read instantly, remove
it rather than iterating.

## O8. Center vehicle sightline pass

**Why:** The bus/truck separation fixed the cramped overlap, but widening the
gap may make the center street too open or change the upstairs-window duel.

**Do:** Check:

- street-level squeeze route between bus and truck;
- upstairs window-to-window sightline over the vehicles;
- both vehicle flank lanes around the outside edges;
- whether bots get stuck strafing around the bus/truck blockers.

**Fix if needed:** nudge bus/truck positions in small increments only. Preserve
the cover pair identity and keep enough space for player movement.

## O9. Garage and climb-route readability

**Why:** The garage-roof route is mechanically important but easy to make look
like random stacked boxes or house geometry clipping into the garage.

**Do:** Inspect both garages and climb routes from ground level. The route
should read as intentional climbable objects leading to the roof/window, not as
broken house pieces.

**Possible fixes:**

- recolor climb boxes as crates/AC units;
- add small non-colliding trim on garage door edges;
- remove any decorative garage roof/eave piece that appears to intrude indoors.

**Verify:** player can climb it; bot route remains connected; garage interior
is visually clean.

## Verification protocol

For each future Nuketown touch:

1. `node --check js/maps.js`
2. map/nav audit: `0` orphans, one connected component, all spawn points clear
3. browser smoke test on a cache-busted local preview
4. eye-level screenshot of the changed area

Ignore the recurring Chromium-internal `UnknownError` unless gameplay breaks or
an app-level stack trace appears.
