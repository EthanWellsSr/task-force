# Progression, arsenal, equipment, perks, and killstreak buildout plan

This document is the yardstick for the XP/progression buildout. The goal is not
just to add a number that goes up. The goal is a COD-style progression spine:
play matches, earn persistent XP, level up, see meaningful unlocks, then use
those unlocks in Create-a-Class and killstreak selection.

## Locked design decisions

### XP and level rules

- XP is persistent across sessions and saved locally.
- Profile save key: `tf_profile`.
- Profile has a `version` field from day one.
- XP is profile-wide, not per class.
- First level cap: Level 20.
- No prestige in the first implementation, but the profile schema can reserve
  `prestige: 0`.
- XP curve:
  - Level 1 -> 2: 500 XP
  - Level 2 -> 3: 750 XP
  - Level 3 -> 4: 1000 XP
  - Continue adding +250 XP per level through Level 20.
- Multiple level-ups from one match payout are allowed.
- Rank display uses both numeric level and grounded arcade rank names:
  `LVL 7 - SERGEANT`.
- XP is accumulated during a match and committed to the persistent profile only
  when the match ends normally.
- Quitting early awards no XP.
- Local match settings still earn XP. Recruit bots, custom team size, custom
  score/time limits, TDM, FFA, and Gun Game all count.
- Oddball modes can earn XP even if they ignore loadout unlock gates.

### XP earn table

First pass values:

- Direct kill: +100 XP
- Assist: +25 XP
- Headshot bonus: +25 XP
- Melee kill bonus: +50 XP
- Normal killstreak kill: +50 XP
- Match complete: +100 XP
- Match win: +250 XP
- Nuke called: +1000 XP
- Nuke per-kill XP: 0

Notes:

- Killstreak kills are shown separately in the XP breakdown.
- Nuke gets a separate `Nuke Bonus: +1000` breakdown line.
- Nuke kills do not award per-kill XP.
- Nuke kills do not pad scoreboard kills.
- Nuke increments `nukesCalled`, not normal kill totals.

### Lifetime stats

Lifetime stats are saved in the profile and update immediately as events happen,
not at XP commit time.

Track at minimum:

- matchesPlayed
- wins
- losses
- quits
- kills
- deaths
- assists
- headshots
- meleeKills
- killstreakKills
- nukesCalled
- totalXpEarned

Rules:

- `matchesPlayed` increments at match start.
- `wins` and `losses` increment only when a match reaches a real end state.
- `quits` increments when the player exits mid-match.
- Kills, deaths, assists, headshots, melee kills, killstreak kills, and
  nukesCalled update immediately.
- `totalXpEarned` updates when XP commits at normal match end.
- No inflated stats: deaths update immediately too.
- Lifetime `kills` means direct player kills only: guns, melee, and direct
  equipment.
- Lifetime `killstreakKills` is separate.
- Scoreboard kills include both direct kills and killstreak kills because the
  in-match scoreboard is about combat impact.

### UI rules

- First pass does not show constant in-match XP spam.
- Main menu shows a compact profile badge.
- Create-a-Class shows the same compact profile badge.
- End screen shows:
  - XP breakdown
  - total match XP
  - old level -> new level if level-up happened
  - XP bar/progress to next level
  - all unlocks earned from any levels gained
  - compact lifetime stat deltas for the match
- Locked items are visible but disabled once gates are enforced.
- Locked items still show name, stats, preview, description, and unlock level.
- Locked item copy: `UNLOCKS AT LEVEL X`.
- Mid-match quit warning:
  `Quit match? Lifetime stats stay, this records a quit, and you earn no XP.`

### Unlock philosophy

- The first XP slice is a status/foundation slice: it builds profile, level,
  XP, XP payout, rank display, stat tracking, unlock metadata, and UI.
- First slice does not enforce lock gates yet.
- It must still be designed for future gates from day one.
- Unlock levels are hand-authored, not auto-generated.
- Level 1 starter items are silently available by default.
- Every level 2 through 20 should unlock something.
- First Level 1-20 table can be provisional until the arsenal/equipment/
  killstreak buildout is complete.
- New unlocks do not auto-equip.
- All five custom class slots stay available from Level 1.
- Once gates are enforced, default classes must be rebuilt so all five are legal
  Level 1 starter classes.
- Saved classes are sanitized when gates are enabled, on class load, and when
  profile level changes.
- Bots ignore player XP gates and can use the full arsenal.

### Starter kit

Starter gear:

- Primaries: M4A1, MP5K, R870
- Secondary: USP45
- Lethal: Frag
- Tactical: Stun
- Perks:
  - Tier 1: Sleight of Hand
  - Tier 2: Stopping Power
  - Tier 3: Steady Aim
- Attachments: none
- First attachment unlock: Red Dot Sight at Level 2
- Starter killstreaks: UAV and Napalm Strike

### Attachments

- Attachments unlock by overall player level in the first progression pass.
- Weapon-specific XP can be added later if the base system feels good.
- Attachments and camos should have `unlockLevel` metadata from the first XP
  foundation slice, even before gates enforce it.

### Killstreak rules

- Killstreaks use the same Level 1-20 unlock table as weapons, perks,
  equipment, attachments, and camos.
- Killstreak selection is per custom class.
- Default active killstreak slots: 3.
- A future Tier 1 perk can allow 4 active killstreak slots.
- A separate future Tier 1 perk can reduce every equipped streak requirement by
  1 kill, with a sane minimum floor.
- Those two killstreak perks are mutually exclusive because they live in the
  same perk tier.
- Starter streaks: UAV and Napalm Strike.
- Later streaks are XP-gated and visible while locked.
- Class changes apply killstreak selection only on respawn.
- Already banked streaks stay banked after class change.
- Banked streaks remain usable even if the new class does not have that streak
  selected.
- Unlock gates never block using an already-banked streak.
- Banked streaks consume only on successful activation.
- Banked streaks persist through death.
- Banked streaks do not persist across matches.
- Only one banked copy per killstreak at a time.
- Earning a duplicate already-banked streak gives no extra reward, ever.
- Direct player kills and direct player equipment kills count toward streak
  progress.
- Killstreak kills do not count toward streak progress.
- Assists do not count toward streak progress.
- Dying resets current streak progress, but not already-banked streaks.

## Remaining design decisions resolved by Codex

These are decisions we did not walk question-by-question, but they should be
treated as the default unless explicitly changed later.

### Profile and save shape

Use one profile object:

```js
{
  version: 1,
  level: 1,
  xp: 0,
  prestige: 0,
  stats: {
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    quits: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    headshots: 0,
    meleeKills: 0,
    killstreakKills: 0,
    nukesCalled: 0,
    totalXpEarned: 0
  }
}
```

Do not store derived values like current rank name or XP-to-next; compute them
from level/xp tables.

### Match XP state

Keep a match-local XP accumulator:

```js
{
  directKills: 0,
  killstreakKills: 0,
  assists: 0,
  headshots: 0,
  meleeKills: 0,
  nukeBonus: 0,
  matchComplete: 0,
  matchWin: 0,
  total: 0
}
```

This accumulator resets at match start, displays at match end, and commits only
at normal match end.

### Match stat deltas

Keep match-local deltas for end-screen recap, even though lifetime stats update
immediately:

```js
{
  kills: 0,
  deaths: 0,
  assists: 0,
  headshots: 0,
  meleeKills: 0,
  killstreakKills: 0,
  nukesCalled: 0,
  result: 'win' | 'loss' | 'draw' | null
}
```

### Draws

Draws give match-complete XP but no win XP. Lifetime can track `draws` later if
needed, but first pass can omit it unless draw screens become common.

### Gun Game XP attribution

Gun Game earns XP normally:

- direct kill +100
- headshot bonus if applicable
- melee/tomahawk demotion kill can get melee bonus only if it is classified as
  a melee/direct special kill
- match complete/win XP at match end

Gun Game ignores unlock gates for forced ladder weapons.

### Class sanitation fallback

When unlock gates are enforced:

- locked primary -> M4A1
- locked secondary -> USP45
- locked lethal -> Frag
- locked tactical -> Stun
- locked perk -> starter perk for that tier
- locked attachment/camo -> removed
- locked killstreak -> remove from selected streaks; refill from legal starter
  streaks if fewer than required active slots remain

### Debug tools

Add under a clearly labeled dev/progression testing section:

- Reset profile
- Add XP
- Set Level 10
- Max Level
- Rebuild legal starter classes
- Clear classes

All destructive/debug actions need a deliberate confirmation.

## Build order

The order matters. Unlock gates should not ship before the sandbox has enough
things to unlock.

1. XP foundation/status slice
2. Shotgun expansion, including the full-auto shotgun
3. Assault rifle expansion
4. SMG expansion
5. LMG expansion
6. Sniper/marksman expansion
7. Secondary expansion
8. Perk expansion
9. Lethal equipment expansion
10. Tactical equipment expansion
11. Attachment and camo expansion
12. Killstreak buildout
13. Killstreak selector
14. Gun Game ladder rebuild
15. Final Level 1-20 unlock table
16. Unlock gate enforcement
17. Full Chrome regression pass

## Arsenal expansion target

The current roster already has useful coverage, but progression needs more
texture and more late-level rewards.

### Shotguns

Current:

- R870
- AA-12
- SPAS-12

Buildout:

- Add a true fully automatic shotgun as the immediate requested feature if the
  current AA-12 remains semi-behaving in code/UI.
- Consider an over-under or double-barrel high-risk shotgun as a later unlock.
- Keep shotgun roles crisp:
  - pump one-shot reliability
  - semi-auto pressure
  - full-auto panic hose with severe range/ammo limits
  - heavy burst/double shot if added

### Assault rifles

Current:

- M4A1
- SCAR-H
- ACR
- TAR-21
- FAMAS
- FAL

Buildout:

- Add at least one iconic high-fire-rate AR.
- Add one late-level precision/low-recoil AR if ACR is not enough.
- Add one heavy recoil/high-damage AR if SCAR/FAL need a sibling.
- Keep ARs as the baseline midrange class, not best-in-slot everywhere.

### SMGs

Current:

- MP5K
- UMP45
- Vector
- P90

Buildout:

- Add one ultra-close bullet hose.
- Add one accurate controllable SMG.
- Add one heavy slow SMG.
- Preserve the rule: SMGs beat ARs in mobility/close range, lose at midrange.

### LMGs

Current:

- RPD
- M240
- MG4

Buildout:

- Add one controllable lighter LMG.
- Add one very heavy sustained-fire option.
- Consider attachment hooks for belt/mag identity later.
- LMGs should dominate lanes but pay in ADS, reload, and movement.

### Snipers and marksman rifles

Current:

- Intervention
- Barrett

Buildout:

- Add at least one semi-auto marksman rifle with lower zoom/faster handling.
- Add one heavier bolt or anti-materiel identity if needed.
- Keep one-shot rules explicit. Headshots should matter.

### Secondaries

Current:

- USP45
- Desert Eagle
- Glock 18
- SPAS-12
- Tomahawk

Buildout:

- Add at least one low-recoil pistol.
- Add one revolver/heavy pistol identity.
- Add one burst or compact machine pistol.
- Decide whether special secondaries include launchers later; do not add
  launchers until explosion/counterplay rules are clear.

## Perk expansion target

Current perks:

- Tier 1: Marathon, Sleight of Hand, Scavenger
- Tier 2: Stopping Power, Lightweight, Cold-Blooded
- Tier 3: Steady Aim, Ninja, Commando

Buildout:

### Tier 1: utility/economy

- Fourth active killstreak slot
- Killstreaks cost 1 fewer kill
- Existing Sleight of Hand, Marathon, Scavenger remain here
- Consider a gear-focused perk later, like extra tactical/lethal, only if
  equipment balance can handle it

### Tier 2: power/survival

- Keep Stopping Power/Lightweight/Cold-Blooded as core identities.
- Add one survivability or explosive-resistance perk if equipment gets stronger.
- Be careful: Tier 2 is where raw fight power lives, so new perks must be
  balanced against Stopping Power.

### Tier 3: handling/stealth/specialist

- Existing Steady Aim, Ninja, Commando stay here.
- Add a handling perk if the arsenal expands enough: faster weapon swap or
  faster equipment throw.
- Do not put killstreak economy here; that belongs Tier 1.

## Equipment expansion target

Equipment needs enough variety that XP unlocks are meaningful.

### Lethal equipment

Implement one at a time:

- Semtex/sticky grenade
- C4/remote charge
- Claymore or proximity mine
- Throwing knife or tomahawk equipment variant
- Incendiary/molotov if area denial can be made readable

Each lethal needs:

- clear HUD label
- throw/place/use rules
- bot behavior if bots can use it
- danger/counterplay indicator if appropriate
- collision/LOS behavior
- Chrome test on at least Shipment and one larger map

### Tactical equipment

Implement one at a time:

- Flashbang distinct from stun
- Decoy/noise grenade
- EMP/scrambler pulse
- Snapshot/recon ping
- Heartbeat-style temporary sensor
- Smoke variants only if they add real gameplay

Each tactical needs:

- clear effect duration
- readable audiovisual feedback
- bot reaction rules
- UI/HUD prompts
- counterplay or limitation
- Chrome verification

## Killstreak buildout target

Existing:

- UAV
- Napalm Strike
- Tactical Nuke

Starter selectable:

- UAV
- Napalm Strike

Nuke remains special and should not behave like a normal selectable streak
unless the current game already treats it that way.

Candidate future streaks:

- Counter-UAV / Jammer
- Care Package if a pickup/drop system is acceptable
- Predator-style missile only if camera/control support is built
- Sentry gun only if deployable AI/turret logic is worth the cost
- Precision airstrike as a simpler alternative to controlled missiles
- Helicopter support only if aerial target/LOS rules are manageable

Keep each streak distinct, readable, and cheap to test in Chrome.

## First Level 1-20 provisional unlock table

This table is deliberately provisional. It exists so the XP foundation can show
future unlocks and level-up rewards before the full arsenal exists.

- Level 1: Starter kit silently available
- Level 2: Red Dot Sight
- Level 3: UMP45
- Level 4: Marathon
- Level 5: Smoke
- Level 6: SCAR-H
- Level 7: Holographic Sight
- Level 8: UAV/Napalm selector slot polish or first new killstreak if built
- Level 9: Desert Eagle
- Level 10: Scavenger
- Level 11: AA-12/full-auto shotgun slot, depending on final shotgun roster
- Level 12: Laser Sight
- Level 13: Cold-Blooded
- Level 14: P90
- Level 15: Semtex or first new lethal
- Level 16: Ninja
- Level 17: Barrett
- Level 18: Foregrip
- Level 19: fourth-streak-slot perk or cheaper-streak perk
- Level 20: Gold camo or high-prestige-style weapon/perk reward

After arsenal/equipment/killstreak expansion, replace this with a real table
that gives every level 2-20 a satisfying item.

## Chrome verification requirements

Every implementation slice that changes gameplay or UI needs Chrome testing.

Minimum coverage:

- fresh profile
- profile with XP just below level-up
- multi-level payout
- level cap
- reset profile
- debug Add XP / Set Level / Max Level
- end-screen XP breakdown
- quit warning and quit stat
- lifetime stat immediate updates
- class sanitation after gates
- locked item visible/disabled behavior
- bots using full arsenal despite player locks
- Gun Game earning XP while ignoring gates
- killstreak bank/selection/perk behavior
- no console app errors
