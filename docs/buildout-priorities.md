# Buildout priorities

This document is the opinionated execution layer on top of:

- `to-do-list.md`
- `docs/map-buildout-plan.md`
- `docs/progression-buildout-plan.md`

The detailed docs are strong. The main risk is that the backlog is now large
enough to hide the next shippable slice. Use this file to keep the work ordered
around playable value and regression risk.

## Read of the current backlog

The to-do list is in good shape technically:

- Completed work is recorded with useful implementation and verification notes.
- New work is split into small enough tasks to land independently.
- The map plan correctly insists on reference docs before geometry.
- The progression plan correctly delays lock enforcement until there is enough
  content to unlock.

The weak spot is priority visibility. Map expansion, XP progression, weapon
expansion, equipment, perks, killstreaks, Gun Game rebuilds, and unlock gates are
all valid, but they should not be treated as equal next steps.

## Recommended strategy

Prioritize systems that create replay value without closing off existing fun.

That means:

1. Add persistent XP/profile/status.
2. Add one new map using the reference-first workflow.
3. Expand the sandbox with weapons/equipment/killstreaks.
4. Rebuild Gun Game around the bigger sandbox.
5. Enforce unlock gates only after the unlock table is worth enforcing.

## Immediate next slice: XP foundation

Do the first progression batch before more content work:

- Profile data model and persistence
- Level curve/rank helpers
- Match-local XP accumulator
- Combat XP events
- Immediate lifetime stat tracking
- Match-end XP commit
- End-screen XP recap
- Main menu/Create-a-Class profile badge
- Debug profile tools
- Mid-match quit warning
- Unlock metadata and visible unlock hints, with no enforcement

Why this first:

- It makes every existing mode and map more replayable.
- It gives future weapons, perks, equipment, and maps a place in the player loop.
- It creates the save/version/migration foundation before the class system gets
  more complex.
- It avoids the biggest design trap: locking content before the game has enough
  content variety.

Definition of done:

- Fresh profile creates and reloads from `tf_profile`.
- Bad localStorage recovers cleanly.
- TDM, FFA, and Gun Game all earn XP.
- Quitting records a quit and commits no XP.
- End screen shows XP, level progress, and match stat deltas.
- Profile badge appears in menu and Create-a-Class.
- Unlock metadata displays without preventing selection.
- Chrome pass records no app console errors.

## Immediate map slice: Killhouse

After the XP foundation, build Killhouse before Vacant or Crash.

Why Killhouse first:

- It has the smallest surface area of the three new maps.
- It stresses indoor collision, side rooms, tower/perch access, and short bot
  routing without the full urban complexity of Crash.
- It gives a fast new playable space that complements Shipment, Rust, and
  Nuketown.

Preferred order:

1. `docs/killhouse-reference.md`
2. Menu card and blank map shell
3. Warehouse perimeter and spawn pockets
4. Central floor, side rooms, target room, tower placeholder
5. Collision, TDM/FFA spawns, and waypoint seeds
6. Art pass and identity landmarks
7. TDM/FFA/Gun Game Chrome verification

Definition of done:

- The reference doc exists before `js/maps.js` changes.
- Map loads from the menu with no console errors.
- Bots can reach every major route and intended perch.
- Spawns are not inside geometry and do not create immediate spawn-to-spawn
  sightlines.
- All route-defining visible solids have collision.
- Frag warning, throwables, killstreaks, minimap, and all modes still work.

## Defer for now

These are good ideas, but they should not be the next implementation target:

- Unlock gate enforcement. It needs the bigger sandbox first.
- Final Level 1-20 unlock tuning. The arsenal/equipment roster is not final.
- Care Package, Predator-style missile, Sentry Gun, or helicopter support. Each
  creates a large new interaction system.
- Crash. Build it after Killhouse and Vacant have proven the map workflow.
- Extra weapon additions before XP foundation, unless one is being used as a
  small isolated balance/test task.

## Suggested milestone order

### Milestone 1: Progression spine

Goal: make current gameplay persistently rewarding.

Tasks:

- Progression items 1-16 from `to-do-list.md`.
- No enforced locks.
- No major arsenal expansion.

### Milestone 2: Killhouse

Goal: ship one new map with the reference-first workflow.

Tasks:

- Map items 23a-23d from `to-do-list.md`.
- Keep the first version compact and playable before adding decorative detail.

### Milestone 3: Sandbox expansion

Goal: add enough rewards to make Level 1-20 meaningful.

Tasks:

- Full-auto shotgun audit/addition.
- One category at a time for AR, SMG, LMG, sniper/marksman, secondary.
- Perk, lethal, tactical, attachment, camo, and killstreak additions.
- Balance pass after each category, not only at the end.

### Milestone 4: Gun Game rebuild

Goal: make Gun Game benefit from the expanded sandbox.

Tasks:

- Draft expanded ladder.
- Implement forced-loadout behavior for new item types only when needed.
- Verify player and bot tiers, XP, and win logic.

### Milestone 5: Unlock gates

Goal: turn progression into real availability rules.

Tasks:

- Final Level 1-20 unlock table.
- Lock display and selection enforcement.
- Saved class sanitation.
- Fresh/mid/max profile regressions.

## Working rule

Every shipped slice should improve one of three things:

- replay value
- playable space
- sandbox variety

If a task does not clearly improve one of those, it should wait.
