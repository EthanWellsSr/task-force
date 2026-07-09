# Map buildout plan: Killhouse, Vacant, Crash

This is the next-map roadmap after Shipment. The build order is:

1. Killhouse
2. Vacant
3. Crash

Reason: each map raises complexity in a controlled way. Killhouse proves a
tight indoor/training-yard map. Vacant adds a more complex office interior plus
parking-lot exterior. Crash then adds the full urban map problem: multiple
buildings, rooftops, streets, alleys, a central wreck landmark, and heavier bot
navigation.

## Research sources

Use these as the initial reference set. Each map still needs its own
`docs/<map>-reference.md` before code work starts.

- Call of Duty Maps: Killhouse
  https://callofdutymaps.com/cod-4-modern-warfare/killhouse/
  - COD4 DLC map, released April 1, 2008.
  - Location listed as Credenhill, United Kingdom.
  - Described as a "Speedball style warehouse interior" and strong for small
    teams.
  - Notes outside training grounds, a tower jump/landing red circle, and an
    AK-47 diagram poster visible from the center/target-practice room.

- Call of Duty Maps: Vacant
  https://callofdutymaps.com/cod-4-modern-warfare/vacant/
  - COD4 launch map, released November 5, 2007.
  - Location listed as Ukraine.
  - Described as a deserted Russian office with intense interior fighting.
  - Notes an empty parking lot, smokestacks, a blown-up truck outside the
    building, and exterior poster details.

- Call of Duty Maps: Crash
  https://callofdutymaps.com/cod-4-modern-warfare/crash/
  - COD4 launch map, released November 5, 2007.
  - Location listed as Basrah, Iraq.
  - Described as a desert town with a downed Sea Knight and strong team play.
  - Notes distant city skyline, smaller burning buildings, original helicopter
    development detail, and Winter Crash variant history.

- U4EA CoD4 map overview
  https://u4ealounge.com/cod4-map-overview/
  - Provides overhead/reference map links for standard COD4 maps, including
    Crash and Vacant.
  - Useful for validating lane shapes and callout placement after the text
    reference is written.

- COD Modding and Mapping Wiki: Gameflow Guidelines
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_%3A_Gameflow_Guidelines
  - Use as design guidance: draw routes before mapping, avoid bottleneck-only
    flow, place obstacles deliberately, clip models so players do not get stuck,
    and set spawn points in relation to objectives.

## Engine constraints to design around

- Maps live in `js/maps.js` as `build<Name>(scene, colliders)` and return
  `bounds`, `spawns`, and `waypointSeeds`.
- Compass should stay consistent with the existing docs: top-down renders use
  `+x = north/up`, `+z = east/right`, and `tf` generally starts on the
  negative-x side unless the map reference gives a stronger reason.
- Collision is AABB-first. Rotated or irregular visual meshes need stepped
  AABB hulls, not invisible lies that players can walk through.
- Bot navigation comes from `waypointSeeds`; vertical nodes need explicit y
  values and reachable step/ramp/chair/crate chains.
- Every solid visual object that matters for gameplay needs collision.
  Decorative-only skyline/background props must be clearly outside the
  playable path and not create misleading cover.
- Current modes to regression-test on every finished map: TDM, FFA, Gun Game,
  frag danger indicator, bot spawns/pathing, scoreboard/HUD, killstreaks, and
  throwables. Search & Destroy site anchors should be planned even before S&D
  is fully implemented.

## Global build slices for every map

These slices should be repeated for Killhouse, Vacant, and Crash.

1. Reference doc first
   - Create `docs/<map>-reference.md`.
   - Record sources, map identity, landmarks, intended scale, compass, rough
     ASCII schematic, team spawn axis, FFA spawn pockets, S&D site candidates,
     nav plan, collision risks, and intentional approximations.
   - The reference doc is the yardstick for the implementation. Do not start
     `js/maps.js` work until this exists.

2. Menu registration shell
   - Add the map card to `index.html`.
   - Add card art class to `css/style.css`.
   - Register `MAPS.<id>` in `js/maps.js`.
   - Keep this separate from full geometry so the map can be loaded early and
     Chrome can catch missing asset/registration errors.

3. Playable footprint
   - Add floor, bounds, perimeter blockers, out-of-bounds scenery shells, and
     temporary labels/debug color coding.
   - Establish scale relative to existing maps:
     - Shipment: 26 x 24 m, tiny.
     - Rust: 52 x 52 m, compact outdoor vertical map.
     - Nuketown: 48 x 40 m, medium three-lane map.
   - Target scale should preserve route timing more than literal dimensions.

4. Route blockout
   - Build only lane-defining walls, major rooms, courtyards, streets, doors,
     and large cover.
   - Verify routes before decoration. Every route in the reference doc must
     have a player path and a bot path.

5. Collision pass
   - Audit every visible solid: walls, cars, crates, railings, stair rails,
     counters, desks, roof blockers, tower supports, helicopter wreck pieces.
   - Decide which small props are solid, which are decoration, and which are
     intentionally clipped into one larger simple collider.
   - Chrome-walk every doorway, alley, stair, ramp, roof edge, and cover gap.

6. Spawn pass
   - Add TDM spawn clusters, then FFA spawn pool.
   - Avoid immediate spawn-to-spawn sightlines.
   - Ensure no spawn is inside geometry or too close to a bot-blocking wall.
   - Place backup spawns near secondary routes, not only the main lane.

7. Bot navigation pass
   - Add primary route seeds, flank seeds, room-center seeds, doorway seeds,
     vertical seeds, cover/perch seeds, and S&D site approach seeds.
   - Run nav graph audit: no orphan seed islands, spawns connected, roofs
     reachable only when intentionally reachable.

8. Gameplay art pass
   - Add identity landmarks after collision is stable.
   - Use real geometry for inspectable subject matter: helicopter wreck,
     office desks/cubicles, warehouse plywood walls, target room, cars/trucks,
     tower, smokestacks, burning-building silhouettes.
   - Keep landmark silhouettes readable in first-person and minimap.

9. Chrome verification pass
   - Load local preview in Chrome.
   - Test TDM, FFA, Gun Game.
   - Walk all routes and climb paths.
   - Confirm collision matches visuals.
   - Confirm bots spawn, move, fight, throw grenades, and do not get stuck.
   - Confirm no console app errors. Pointer-lock automation errors are expected
     only when Chrome refuses pointer lock during automation.

## Map 1: Killhouse

### Identity target

Killhouse should feel like a compact SAS-style training warehouse, not a
general urban map. It is a speedball/kill-house interior built for small teams:
rectangular footprint, plywood/partition walls, central obstacle field, short
rooms, fast sightline breaks, and a tower/perch element. The outside training
grounds are flavor, not primary playable space.

Reference details to preserve:

- Indoor warehouse/training-house setting.
- Small-team pacing and extremely quick contact.
- Central floor visible from multiple short entries.
- Narrow rooms/corridors around the perimeter.
- Tower/perch with risky fall/jump behavior and a red landing circle.
- Long target-practice room with AK-47 diagram/poster detail.
- Exterior training grounds/buildings/trees visible beyond the playable space.

### Proposed compass and scale

- Compass: `+x = north/up`, `+z = east/right`.
- Long axis should run east/west in the visual reference, but in code keep the
  team axis on `x` for consistency: `tf` south/negative-x, `sp` north/positive-x.
- Tentative playable bounds: `x: 18`, `z: 25` (36 x 50 m). This makes it
  larger than Shipment but smaller and denser than Nuketown.
- If Chrome timing feels too long, shrink to 32 x 44 m; if bot pathing feels
  cramped, widen corridors without changing room topology.

### Topology plan

- Perimeter warehouse rectangle
  - Four high walls, mostly closed, with visual roof trusses/industrial shell.
  - No outdoor exits for gameplay; outside training-yard scenery is visible
    through upper gaps or beyond non-playable walls.

- Two spawn ends
  - `tf` at south/negative-x: several points behind low plywood and crate cover.
  - `sp` at north/positive-x: mirrored spawn pocket with equivalent cover.
  - Each spawn must have at least three exits: left perimeter route, right
    perimeter route, and center route.

- Central kill floor
  - Open-ish central rectangle with short plywood barricades, crates, a small
    raised/boxed obstacle, and a broken diagonal cover piece.
  - The center should never be a pure open killbox; every 5-7 m needs a
    shoulder-height or chest-height interruption.

- Perimeter rooms and corridors
  - West side: small training rooms and offset corridor turns.
  - East side: tighter rooms plus a right-side route that can flank center.
  - Doorways should be wide enough for bots (`>= 1.4 m`) and visually clipped.

- Tower/perch
  - One climbable tower/perch overlooking part of the middle, not the whole map.
  - Access by stairs/crate chain/ramp rather than ladder-only, because bots need
    reachable y-aware nodes.
  - Add red landing circle as floor decal/flat mesh below. The game does not
    currently model fall death strongly enough to need exact kill behavior, but
    the landmark should exist.

- Target-practice room
  - Long narrow room along one side with target boards/silhouettes.
  - Add AK-47 poster/diagram as simple wall panel art.
  - Make this route playable but not dominant: it should be a lane with cover
    breaks, not a clean spawn-to-spawn sniper tube.

### Collision and nav risks

- Plywood partitions should be real colliders, but top edges should not snag
  the player or throwables.
- The tower needs conservative rail/blocker collision so players cannot slip
  through decorative gaps.
- Crate/barrier clusters should use coarse AABBs, not many tiny pieces that
  create stuck corners.
- Bot paths need explicit room-doorway-center-room threading; a flat grid will
  over-connect through walls.

### S&D future anchors

- Site A: target-practice room or adjacent side room.
- Site B: central/tower-side training floor.
- Attack/defense flow must avoid both sites being visible from one spawn.

### Killhouse implementation todo

- [ ] K1. Create `docs/killhouse-reference.md` with sources, schematic,
      bounds, spawn axis, lane names, target room, tower, and red-circle
      landing landmark.
- [ ] K2. Register map shell/card and load blank warehouse floor in Chrome.
- [ ] K3. Block perimeter warehouse, spawn pockets, central floor, side rooms,
      target room, and tower placeholder.
- [ ] K4. Add collision for all plywood partitions, crates, tower supports,
      railings, and target-room walls; Chrome-walk every doorway.
- [ ] K5. Add TDM/FFA spawns and waypoint seeds for center, side rooms,
      target room, spawn exits, and tower.
- [ ] K6. Add art pass: warehouse shell, plywood material, target silhouettes,
      AK diagram panel, red landing circle, exterior training-ground hints.
- [ ] K7. Chrome-test TDM/FFA/Gun Game, bot pathing, frag indicator, and no
      stuck points.

## Map 2: Vacant

### Identity target

Vacant should feel like a deserted Russian/Ukrainian office building attached
to an industrial exterior. The core is close interior combat: hallways, rooms,
doorways, cubicles/offices, and a parking-lot/loading-side exterior that gives
the map breathing room and alternate approach routes.

Reference details to preserve:

- Deserted Russian office identity.
- Intense interior fighting.
- Exterior empty parking lot.
- Big exterior buildings and smokestacks.
- Blown-up truck outside the building.
- Exterior poster/easter-egg panel can be abstracted as a readable wall sign.

### Proposed compass and scale

- Compass: `+x = north/up`, `+z = east/right`.
- Use a medium rectangular footprint: tentative `bounds { x: 26, z: 32 }`
  (52 x 64 m).
- Interior building occupies most of one side/center; parking lot and exterior
  yard occupy the opposite side.
- Compared to Nuketown, Vacant should be slightly wider and more interior-heavy
  but not as open.

### Topology plan

- Office building core
  - Build a large L/block-like office mass with several connected rooms.
  - Include main hallway spine, side offices, cubicle/open-office area, storage
    room, and a back/loading corridor.
  - Doorways should be real negative space, not decorative wall decals.

- Parking lot/exterior
  - Open paved area with parked cars, blown-up truck, jersey barriers, loading
    cover, fences, and line-of-sight blockers.
  - The parking lot must be playable, but it should be dangerous if crossed
    carelessly.
  - Add smokestacks and big industrial shells outside the playable bounds as
    skyline/scenery.

- Main routes
  - Interior long hallway route: fast but risky due to door angles.
  - Office/cubicle route: denser, more cover, more corners.
  - Exterior parking route: longer but clearer flank.
  - Loading/back route: connects exterior to interior without forcing center.

- Spawn ends
  - One team starts near parking/loading exterior.
  - Other team starts deeper around the opposite office/warehouse side.
  - Each spawn needs a protected exit into both interior and exterior lanes.

- Room readability
  - Use color/material zoning: office walls, concrete exterior, darker storage,
    parking asphalt, metal loading/fence.
  - Interior needs enough visual landmarks that players do not feel lost in a
    gray maze.

### Collision and nav risks

- Doorway density can break bots if seeds are too sparse. Every doorway needs
  paired seeds on both sides.
- Thin interior walls should have simple AABB colliders with enough thickness
  to block LOS and grenades reliably.
- Cars/trucks should use simple hulls and should not create tire-sized snag
  geometry.
- Exterior open area needs sightline blockers so it does not become a sniper
  lane across the whole map.

### S&D future anchors

- Site A: interior office/cubicle room, forcing attackers inside.
- Site B: exterior/loading/parking side near truck cover, forcing a different
  route.
- Defenders should be able to rotate through interior hallways; attackers can
  split exterior and interior.

### Vacant implementation todo

- [ ] V1. Create `docs/vacant-reference.md` with source notes, overhead
      interpretation, office/parking topology, room list, spawn axis, S&D site
      candidates, and collision risks.
- [ ] V2. Register map shell/card and load floor/perimeter in Chrome.
- [ ] V3. Block office building footprint, hallway spine, side offices,
      cubicle/storage rooms, loading route, and parking lot.
- [ ] V4. Add collision for all walls, doors, cars, truck, fences, barriers,
      loading props, and exterior blockers.
- [ ] V5. Add spawns and nav: doorway pairs, hallway seeds, office room seeds,
      parking-lot cover seeds, loading-route seeds, and FFA pockets.
- [ ] V6. Add art pass: deserted office material, cubicles/desks, truck,
      smokestacks, exterior poster panel, industrial skyline.
- [ ] V7. Chrome-test interior collision, bot room traversal, exterior flank
      use, grenade warning, and all existing modes.

## Map 3: Crash

### Identity target

Crash is the largest and highest-risk build in this sequence. It should feel
like a desert town built around a downed Sea Knight helicopter. The key is not
just the helicopter model; it is the surrounding urban route network: main
building, rooftop positions, side streets, back alley, shop/arcade-like lower
buildings, tower/backyard areas, and tight chokepoints around the wreck.

Reference details to preserve:

- Basrah/Iraq desert-town setting.
- Downed Sea Knight helicopter at/near the center.
- Strong team-game flow.
- Smaller burning buildings and distant city skyline.
- Multiple buildings around the wreck.
- Rooftop/vertical combat and alley/street rotations.
- Recognizable callout-style landmarks from overhead references: helicopter
  wreck, main building, rooftop, shop, back street, back alley, arcade, tower,
  backyard, blue building/factory-style side structures.

### Proposed compass and scale

- Compass: `+x = north/up`, `+z = east/right`.
- Tentative playable bounds: `x: 34`, `z: 36` (68 x 72 m).
- This should become the largest current map, but still compressed enough for
  bots and the existing weapon ranges.
- The helicopter/wreck courtyard should be slightly off-center, with buildings
  wrapping it.

### Topology plan

- Central crash courtyard
  - Downed Sea Knight hull as the dominant center landmark.
  - Wreck should provide partial cover but not be a single impenetrable blob:
    split into hull, tail/rotor debris, and low rubble cover.
  - Surround with broken walls, cars, small fires/smoke visuals, and sightline
    blockers.

- Main building
  - Large multi-room building near center, with at least one climbable roof or
    upper floor/perch.
  - Interior should connect two or three routes but not be a single straight
    tunnel.
  - Roof access should be bot-reachable via stairs/ramp/crate chain.

- Rooftop/shop side
  - Opposite side building cluster with roof/upper balcony and lower shop room.
  - Keep rooftop sightlines strong but partial; roofs must not see every spawn.

- Back street and back alley
  - Back street: longer exterior route with cars, wall cuts, and building
    entrances.
  - Back alley: tighter route behind lower buildings, good for flanks and FFA
    spawns.
  - Both must connect around the crash courtyard without forcing center.

- Tower/backyard/blue-building side
  - Add a tower-like high landmark or upper-room perch.
  - Backyard/side courtyard with lower cover and route into the crash area.
  - Blue/factory-side building can be color-coded to improve callout identity.

- Spawn ends
  - Team spawns should be on opposite urban edges, protected by buildings and
    initial corner cover.
  - Each team needs three first exits: street, interior/building, alley/flank.
  - FFA spawns should use building pockets and alley corners, not the open
    helicopter courtyard.

### Collision and nav risks

- Helicopter wreck is the major technical risk. Use a readable visual group
  backed by several simple AABB hulls; avoid fine rotor geometry as collision.
- Rooftops require strict blockers so players cannot fall or escape outside
  the map unintentionally.
- Stairs/ramp chains must stay under bot step limits or use ramp boxes.
- Urban clutter must not turn into invisible snag fields. Cars and rubble get
  simplified hulls.
- Bot LOS and grenade LOS need walls thick enough to behave consistently.

### S&D future anchors

- Site A: crash courtyard/near wreck, iconic and exposed.
- Site B: shop/rooftop or backyard-side building, more interior/defensible.
- Attackers should have a risky center push and two flanks; defenders should
  rotate through buildings, not across the whole open courtyard.

### Crash implementation todo

- [ ] C1. Create `docs/crash-reference.md` with source notes, labeled overhead
      callouts, scale plan, building list, rooftop plan, spawn axis, and S&D
      site candidates.
- [ ] C2. Register map shell/card and load desert-town floor/perimeter in
      Chrome.
- [ ] C3. Block out central crash courtyard, helicopter placeholder, main
      building, rooftop/shop side, back street, back alley, tower/backyard, and
      spawn pockets.
- [ ] C4. Build helicopter wreck visual and collider set; Chrome-test that
      every visible solid piece is impenetrable and every intended gap is
      passable.
- [ ] C5. Add building interiors, stairs/roof access, roof blockers, and
      vertical waypoint seeds.
- [ ] C6. Add TDM/FFA spawns and dense urban nav graph: streets, alleys,
      interiors, rooftops, courtyard edges, and spawn exits.
- [ ] C7. Add art pass: desert town palette, burning-building silhouettes,
      cars, rubble, signs, shop/factory/blue-building identity, skyline.
- [ ] C8. Chrome-test full gameplay: TDM/FFA/Gun Game, rooftops, bots, grenade
      warning, killstreaks, minimap readability, and no stuck/escape routes.

## Acceptance standard for the three-map batch

- Each map has its own reference doc before code.
- Each map can be selected from the menu.
- Each map has TDM and FFA-safe spawn pools.
- Gun Game works without special-case map logic.
- Bots can traverse all major intended routes.
- All route-defining visible solids are impenetrable.
- No player can escape bounds.
- Throwables bounce and explode plausibly in the new geometry.
- Frag danger indicator works on each map.
- Chrome verification is recorded for every implementation slice that changes
  gameplay or map geometry.
