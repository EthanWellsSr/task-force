# TASK FORCE — Browser Team Deathmatch vs Bots

A fast, close-quarters browser FPS with bots. No install, no build step.

### ▶ [Play it here](https://ethanwellssr.github.io/task-force/)

## How to play

**Option 1:** Play in your browser at the link above.

**Option 2:** Double-click `index.html` — it runs straight from the file.

**Option 3:** Serve it locally:

```
cd task-force
python3 -m http.server 8642
```

Then open http://localhost:8642 in Chrome/Safari/Firefox.

Click a map (Nuketown, Rust, or Shipment) to start a Team Deathmatch, pick a class, and hit DEPLOY. Click the game once to capture your mouse.

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click | Fire |
| X | Aim down sights (toggle) |
| Right click (hold) | Aim down sights (mouse users) |
| Shift + W | Sprint |
| Space | Jump |
| C | Crouch (toggle) |
| R | Reload |
| 1 / 2 or Q | Swap weapon |
| V | Melee knife |
| Tab (hold) | Scoreboard |
| Esc | Pause |

## Features

- **Game modes** — Team Deathmatch (Task Force vs Spetsnaz, first to the score limit,
  default 75, or 10 minutes), Free-for-All, and Gun Game (climb the weapon ladder)
- **Create-a-Class** — 5 editable slots (saved in your browser), 22 weapons
  - *Assault rifles:* M4A1, FN SCAR-H, Remington ACR, Tavor TAR-21, FAMAS, FN FAL
  - *SMGs:* HK MP5K, HK UMP45, KRISS Vector, FN P90
  - *LMGs:* RPD, M240, HK MG4
  - *Shotguns:* Remington 870 MCS, Atchisson AA-12, Franchi SPAS-12
  - *Sniper rifles:* CheyTac M200, Barrett M82
  - *Sidearms:* HK USP45, Desert Eagle, Glock 18
  - *Melee:* Tomahawk (throwable)
  - plus attachments (red dot, holographic, foregrip, laser, camos)
- **Perks** — 3 tiers: Marathon / Sleight of Hand / Scavenger, Stopping Power /
  Lightweight / Cold-Blooded, Steady Aim / Ninja / Commando
- **Bots** — 4 difficulty levels (Options menu), they patrol, hunt, strafe, and use the killfeed like you do
- **Maps** — Nuketown, Rust, and Shipment
- Health regen, hitmarkers, headshots, killfeed, minimap (enemies show when they fire),
  sniper scope sway (hold Shift to steady), damage direction indicator

Built with Three.js (bundled locally, MIT licensed). Everything else is hand-rolled vanilla JS.

---

*This is a non-commercial educational project. It is not affiliated with or endorsed by
Activision. "Nuketown", "Rust", and "Shipment" are trademarks of Activision Publishing, Inc.*
