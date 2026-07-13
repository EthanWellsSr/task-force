// ============================================================
// Weapon & perk definitions — tuned for 100 HP.
// dmg = body damage up close, minDmg = damage at/past range[1] meters.
// rpm = rounds per minute. mode: auto | semi | burst | bolt | pump
// spread values are radians of cone half-angle. speed = move speed mult.
// ============================================================

const WEAPONS = {
  // ---------- PRIMARY: ASSAULT RIFLES ----------
  m4a1: { slot:'primary', cat:'Assault Rifle', name:'M4A1',
    dmg:30, minDmg:20, head:1.4, rpm:780, mag:30, reserve:180, reload:2.05, mode:'auto',
    spreadHip:.030, spreadAds:.0035, recoil:.0135, bloom:.0042, zoom:1.35, adsTime:.24,
    speed:.95, range:[26,52], model:'ar', unlockLevel:1 },
  scar: { slot:'primary', cat:'Assault Rifle', name:'FN SCAR-H',
    dmg:40, minDmg:30, head:1.4, rpm:585, mag:20, reserve:100, reload:2.3, mode:'auto',
    spreadHip:.034, spreadAds:.0038, recoil:.019, bloom:.0055, zoom:1.35, adsTime:.26,
    speed:.94, range:[30,58], model:'ar', unlockLevel:6 },
  acr: { slot:'primary', cat:'Assault Rifle', name:'REMINGTON ACR',
    dmg:28, minDmg:21, head:1.4, rpm:705, mag:30, reserve:120, reload:2.1, mode:'auto',
    spreadHip:.028, spreadAds:.0026, recoil:.0085, bloom:.0030, zoom:1.35, adsTime:.24,
    speed:.95, range:[28,56], model:'ar' },
  tar21: { slot:'primary', cat:'Assault Rifle', name:'TAVOR TAR-21',
    dmg:34, minDmg:24, head:1.4, rpm:750, mag:30, reserve:120, reload:2.25, mode:'auto',
    spreadHip:.036, spreadAds:.0045, recoil:.017, bloom:.0052, zoom:1.35, adsTime:.25,
    speed:.94, range:[24,48], model:'ar' },
  famas: { slot:'primary', cat:'Assault Rifle', name:'FAMAS',
    dmg:35, minDmg:26, head:1.4, rpm:840, mag:30, reserve:120, reload:2.15, mode:'burst',
    burstCount:3, burstDelay:.19,
    spreadHip:.032, spreadAds:.0032, recoil:.014, bloom:.0040, zoom:1.35, adsTime:.24,
    speed:.95, range:[28,56], model:'ar' },
  fal: { slot:'primary', cat:'Assault Rifle', name:'FN FAL',
    dmg:48, minDmg:35, head:1.5, rpm:420, mag:20, reserve:100, reload:2.2, mode:'semi',
    spreadHip:.033, spreadAds:.0028, recoil:.021, bloom:.0048, zoom:1.35, adsTime:.25,
    speed:.95, range:[32,60], model:'ar' },
  // P24: the high-RPM hose AR — fastest auto in the AR band (875 vs M4A1's
  // 780), close TTK .206 sits between SCAR and M4A1 and never beats the
  // MP5K's .200; worst bloom of any auto AR + 16 minDmg past 44 m are the
  // levers that keep it a 15-30 m spray gun, not an everywhere gun.
  f2000: { slot:'primary', cat:'Assault Rifle', name:'FN F2000',
    dmg:26, minDmg:16, head:1.4, rpm:875, mag:30, reserve:150, reload:2.05, mode:'auto',
    spreadHip:.034, spreadAds:.0042, recoil:.0155, bloom:.0050, zoom:1.35, adsTime:.23,
    speed:.94, range:[22,44], model:'ar' },

  // ---------- PRIMARY: SMGs ----------
  mp5k: { slot:'primary', cat:'SMG', name:'HK MP5K',
    dmg:26, minDmg:16, head:1.4, rpm:900, mag:30, reserve:150, reload:1.85, mode:'auto',
    spreadHip:.024, spreadAds:.0048, recoil:.012, bloom:.0038, zoom:1.25, adsTime:.18,
    speed:1.0, range:[16,34], model:'smg', unlockLevel:1 },
  ump45: { slot:'primary', cat:'SMG', name:'HK UMP45',
    dmg:34, minDmg:22, head:1.4, rpm:600, mag:32, reserve:128, reload:1.95, mode:'auto',
    spreadHip:.025, spreadAds:.0045, recoil:.013, bloom:.0040, zoom:1.25, adsTime:.18,
    speed:1.0, range:[20,40], model:'smg', unlockLevel:3 },
  vector: { slot:'primary', cat:'SMG', name:'KRISS VECTOR',
    dmg:21, minDmg:14, head:1.4, rpm:1090, mag:30, reserve:180, reload:1.8, mode:'auto',
    spreadHip:.026, spreadAds:.0050, recoil:.0075, bloom:.0028, zoom:1.25, adsTime:.17,
    speed:1.0, range:[14,30], model:'smg', unlockLevel:8 },
  p90: { slot:'primary', cat:'SMG', name:'FN P90',
    dmg:23, minDmg:15, head:1.4, rpm:855, mag:50, reserve:150, reload:2.4, mode:'auto',
    spreadHip:.027, spreadAds:.0052, recoil:.011, bloom:.0035, zoom:1.25, adsTime:.19,
    speed:.99, range:[16,36], model:'smg', unlockLevel:14 },
  // P27: the ultra-close bullet hose — new rpm ceiling (1250), close TTK
  // .192 edges MP5K/UMP45 (.200) but only inside 10 m; the [10,22] window,
  // worst-in-class recoil/bloom/ADS spread and 96 reserve are the severity.
  // Best hip cone in the game + instant handling: hipfire IS the gun.
  mac10: { slot:'primary', cat:'SMG', name:'MAC-10',
    dmg:22, minDmg:11, head:1.4, rpm:1250, mag:32, reserve:96, reload:1.8, mode:'auto',
    spreadHip:.022, spreadAds:.0075, recoil:.019, bloom:.0060, zoom:1.25, adsTime:.16,
    speed:1.0, range:[10,22], model:'smg' },

  // ---------- PRIMARY: LMG ----------
  // Ladder: M240 the slow heavy hitter, MG4 the fast light one, RPD between
  // them on dmg/rpm/recoil/speed, M60E4 (P30) the very-heavy sustain anchor.
  rpd: { slot:'primary', cat:'LMG', name:'RPD',
    dmg:36, minDmg:28, head:1.4, rpm:660, mag:100, reserve:200, reload:4.4, mode:'auto',
    spreadHip:.044, spreadAds:.0050, recoil:.017, bloom:.0038, zoom:1.35, adsTime:.34,
    speed:.87, range:[32,64], model:'lmg' },
  m240: { slot:'primary', cat:'LMG', name:'M240',
    dmg:40, minDmg:32, head:1.4, rpm:600, mag:100, reserve:200, reload:5.0, mode:'auto',
    spreadHip:.048, spreadAds:.0055, recoil:.022, bloom:.0046, zoom:1.35, adsTime:.38,
    speed:.85, range:[34,68], model:'lmg' },
  mg4: { slot:'primary', cat:'LMG', name:'HK MG4',
    dmg:28, minDmg:20, head:1.4, rpm:850, mag:100, reserve:200, reload:4.0, mode:'auto',
    spreadHip:.040, spreadAds:.0046, recoil:.013, bloom:.0034, zoom:1.35, adsTime:.30,
    speed:.88, range:[28,56], model:'lmg' },
  // P30: the distance-proof belt anchor — 34 minDmg keeps a 3-shot kill at
  // EVERY range (flat .224 TTK, the FAL of LMGs), and 39 base dodges the SP
  // 2-shot (48.75 x 2 = 97.5 < 100, SP changes nothing). First belt-identity
  // mag (150/150), and it pays for all of it with the heaviest handling in
  // the game: .44 ADS, .82 speed, 6.2 reload, .026 kick.
  m60: { slot:'primary', cat:'LMG', name:'M60E4',
    dmg:39, minDmg:34, head:1.4, rpm:535, mag:150, reserve:150, reload:6.2, mode:'auto',
    spreadHip:.052, spreadAds:.0058, recoil:.026, bloom:.0050, zoom:1.35, adsTime:.44,
    speed:.82, range:[36,72], model:'lmg' },

  // ---------- PRIMARY: SHOTGUNS ----------
  // Pellet balance vs 100 HP: r870 one-shots to ~9-10 m (falloff + spread
  // shed pellets past that), aa12 is a 2-shot DPS monster inside 6 m and
  // useless past 15. rpm on the r870 is bot cadence/HUD only — the player's
  // cycle is pumpTime, same as the SPAS-12.
  r870: { slot:'primary', cat:'Shotgun', name:'REMINGTON 870 MCS',
    dmg:20, minDmg:5, head:1.2, rpm:60, mag:6, reserve:30, reload:2.7, mode:'pump',
    pellets:8, pumpTime:.8,
    spreadHip:.034, spreadAds:.02, recoil:.048, bloom:.004, zoom:1.15, adsTime:.24,
    speed:.94, range:[5,16], model:'shotgun', unlockLevel:1 },
  // P18: true full-auto (was semi-in-practice). The panic-hose identity —
  // hold to fire, mag gone in 1.6 s; heavy recoil/bloom + the [6,15]
  // falloff cliff make sustained fire past point-blank a losing trade.
  aa12: { slot:'primary', cat:'Shotgun', name:'ATCHISSON AA-12',
    dmg:12, minDmg:4, head:1.2, rpm:300, mag:8, reserve:40, reload:2.5, mode:'auto',
    pellets:8,
    spreadHip:.05, spreadAds:.034, recoil:.05, bloom:.02, zoom:1.15, adsTime:.22,
    speed:.93, range:[6,15], model:'shotgun' },

  // ---------- PRIMARY: SNIPERS ----------
  // Sniper balance: body shots one-shot only up close (Intervention) or never
  // (Barrett); headshots one-shot at any range. Falloff window sits in-map —
  // maps top out ~50 m, so [60,100] would never engage.
  intervention: { slot:'primary', cat:'Sniper Rifle', name:'CHEYTAC M200',
    dmg:100, minDmg:70, head:1.6, rpm:46, mag:5, reserve:25, reload:2.9, mode:'bolt',
    spreadHip:.11, spreadAds:.0006, recoil:.05, bloom:.002, zoom:6.0, adsTime:.36,
    speed:.92, range:[25,50], model:'sniper' },
  barrett: { slot:'primary', cat:'Sniper Rifle', name:'BARRETT M82',
    dmg:70, minDmg:56, head:1.8, rpm:190, mag:10, reserve:30, reload:3.3, mode:'semi',
    spreadHip:.12, spreadAds:.0012, recoil:.042, bloom:.006, zoom:6.0, adsTime:.4,
    speed:.9, range:[25,50], model:'sniper', unlockLevel:17 },
  // P33: marksman — zoom 2.8 deliberately ducks the `zoom > 3` scope gates
  // (no overlay/sway/wheel, faster feel for free). head 2.1 is a new family
  // ceiling by design: one-shot headshot inside ~29 m while the body can
  // never 2-shot (49 × 2 = 98), so body-spam stays mathematically dead.
  m14: { slot:'primary', cat:'Sniper Rifle', name:'M14 EBR',
    dmg:49, minDmg:38, head:2.1, rpm:240, mag:15, reserve:45, reload:2.6, mode:'semi',
    spreadHip:.09, spreadAds:.0018, recoil:.030, bloom:.0075, zoom:2.8, adsTime:.28,
    speed:.93, range:[26,52], model:'sniper' },

  // ---------- SECONDARIES ----------
  usp: { slot:'secondary', cat:'Handgun', name:'HK USP45',
    dmg:32, minDmg:20, head:1.5, rpm:420, mag:12, reserve:48, reload:1.55, mode:'semi',
    spreadHip:.022, spreadAds:.0060, recoil:.016, bloom:.0050, zoom:1.2, adsTime:.14,
    speed:1.0, range:[14,32], model:'pistol', unlockLevel:1 },
  deagle: { slot:'secondary', cat:'Handgun', name:'DESERT EAGLE',
    dmg:52, minDmg:35, head:1.6, rpm:250, mag:7, reserve:28, reload:1.8, mode:'semi',
    spreadHip:.030, spreadAds:.0058, recoil:.036, bloom:.0090, zoom:1.2, adsTime:.16,
    speed:1.0, range:[16,36], model:'pistol', unlockLevel:9 },
  // P36: the forgiving service pistol — wins on consistency, not paper
  // speed: ~half the USP's recoil/bloom, tightest pistol cones, fastest
  // ADS in the game, 15-round mag. Close TTK .375 sits between the Deagle
  // (.240) and USP (.429); 16 minDmg past 28 m is the price.
  m9: { slot:'secondary', cat:'Handgun', name:'BERETTA M9',
    dmg:26, minDmg:16, head:1.5, rpm:480, mag:15, reserve:60, reload:1.5, mode:'semi',
    spreadHip:.020, spreadAds:.0045, recoil:.009, bloom:.0030, zoom:1.2, adsTime:.13,
    speed:1.0, range:[12,28], model:'pistol' },
  g18: { slot:'secondary', cat:'Machine Pistol', name:'GLOCK 18',
    dmg:18, minDmg:12, head:1.4, rpm:1000, mag:33, reserve:99, reload:1.85, mode:'auto',
    spreadHip:.034, spreadAds:.0085, recoil:.011, bloom:.0042, zoom:1.2, adsTime:.15,
    speed:1.0, range:[10,26], model:'pistol' },
  spas12: { slot:'secondary', cat:'Shotgun', name:'FRANCHI SPAS-12',
    dmg:15, minDmg:5, head:1.2, rpm:66, mag:8, reserve:32, reload:2.9, mode:'pump',
    pellets:8, pumpTime:.55,
    spreadHip:.045, spreadAds:.028, recoil:.045, bloom:.004, zoom:1.15, adsTime:.22,
    speed:.98, range:[8,22], model:'shotgun' },

  // #16c: thrown, retrievable, instant-kill hatchet. `throwWeapon` reroutes
  // the fire path from firePlayerShot to throwTomahawk; mag is the one in
  // hand (1 held / 0 out), reserve 0 — retrieval (walking over the landed
  // axe) is the reload. Bots never get it (not in BOT_LOADOUTS). Stats are
  // mostly cosmetic (editor bars / HUD) since it neither shoots nor ADS-aims.
  tomahawk: { slot:'secondary', cat:'Melee', name:'TOMAHAWK',
    dmg:135, minDmg:135, head:1, rpm:60, mag:1, reserve:0, reload:0, mode:'throw',
    spreadHip:0, spreadAds:0, recoil:0, bloom:0, zoom:1.0, adsTime:.16,
    speed:1.0, range:[8,30], model:'tomahawk', throwWeapon:true },
};

// Annotate each def with its own key so per-weapon systems (viewmodel
// recipes, attachments) can branch on identity without a reverse lookup.
for (const k in WEAPONS) WEAPONS[k].key = k;

// Fire mode label shown on the HUD
function fireModeLabel(w) {
  return { auto:'AUTO', semi:'SEMI', burst:'3-RND BURST', bolt:'BOLT ACTION', pump:'PUMP', throw:'THROWN' }[w.mode];
}

// Progression metadata (P11) — data-only, nothing enforces locks yet.
// Weapon/perk/attachment/camo defs may carry an optional `unlockLevel`;
// anything unmarked is treated as Level 1 (silently available starter
// gear). The provisional Level 1-20 table (P14) fills in the rest.
function unlockLevelOf(def) {
  return (def && def.unlockLevel) || 1;
}

// Provisional Level 1-20 unlock table (P14) — one reward per level 2-20,
// hand-authored from the progression plan. Level 1 is the silent starter
// kit, so it has no row. `id` is the def key (WEAPONS / ATTACHMENTS /
// perk / throwable id) when the item exists today; `future: true` rows
// are final-tuning placeholders (no def yet) the UI labels accordingly.
// Replaced by the real table after the arsenal/equipment/streak buildout.
const UNLOCK_TABLE = [
  { level: 2,  id: 'reddot',      name: 'RED DOT SIGHT',      future: false },
  { level: 3,  id: 'ump45',       name: 'HK UMP45',           future: false },
  { level: 4,  id: 'marathon',    name: 'MARATHON',           future: false },
  { level: 5,  id: 'smoke',       name: 'SMOKE',              future: false }, // throwable def lives in main.js
  { level: 6,  id: 'scar',        name: 'FN SCAR-H',          future: false },
  { level: 7,  id: 'holo',        name: 'HOLOGRAPHIC SIGHT',  future: false },
  { level: 8,  id: 'vector',      name: 'KRISS VECTOR',       future: false },
  { level: 9,  id: 'deagle',      name: 'DESERT EAGLE',       future: false },
  { level: 10, id: 'scavenger',   name: 'SCAVENGER',          future: false },
  { level: 11, id: null,          name: 'FULL-AUTO SHOTGUN',  future: true }, // pending final shotgun roster (P17-P22)
  { level: 12, id: 'laser',       name: 'LASER SIGHT',        future: false },
  { level: 13, id: 'coldblooded', name: 'COLD-BLOODED',       future: false },
  { level: 14, id: 'p90',         name: 'FN P90',             future: false },
  { level: 15, id: 'semtex',      name: 'SEMTEX',             future: false }, // P42: shipped (throwable def in main.js)
  { level: 16, id: 'ninja',       name: 'NINJA',              future: false },
  { level: 17, id: 'barrett',     name: 'BARRETT M82',        future: false },
  { level: 18, id: 'foregrip',    name: 'FOREGRIP',           future: false },
  { level: 19, id: null,          name: 'KILLSTREAK PERK',    future: true }, // 4th-slot or cheaper-streak Tier 1 perk (P38/P39)
  { level: 20, id: 'camoGold',    name: 'GOLD',               future: false },
];

// ============================================================
// ATTACHMENTS — one pick per slot category, per weapon.
// mods = stat multipliers applied to the base def by resolveWeaponDef.
// cats = weapon categories the attachment mounts on (null = all).
// ============================================================
const ATTACH_SLOTS = ['optic', 'muzzle', 'underbarrel', 'laser', 'mag', 'camo']; // P55/P56: 'muzzle' + 'mag' slots (editor rows + save hygiene pick them up from here)

const ATTACHMENTS = {
  reddot: { id:'reddot', name:'RED DOT SIGHT', slot:'optic',
    cats:['Assault Rifle','SMG','LMG','Shotgun'],
    mods:{ adsTime:.85, spreadAds:.9 }, unlockLevel:2 }, // first unlock (P13)
  // Holo identity vs the red dot: the bigger window aims tighter but the
  // bulkier housing aims up slower (still faster than irons). One optic per
  // slot, so it's mutually exclusive with the red dot via normalizeClass.
  holo: { id:'holo', name:'HOLOGRAPHIC SIGHT', slot:'optic',
    cats:['Assault Rifle','SMG','LMG','Shotgun'],
    mods:{ adsTime:.92, spreadAds:.82 }, unlockLevel:7 },
  // P54: ACOG — the magnified third optic. zoom composes multiplicatively
  // in resolveWeaponDef like every other stat: AR/LMG 1.35 -> ~2.6, SMG
  // 1.25 -> ~2.4, all deliberately under the zoom > 3 sniper-scope gates
  // (no overlay/wheel). The trade: magnification + a tighter ADS cone for
  // the slowest aim-up of the three optics. No shotguns (zoom is pointless
  // inside a 15 m falloff) and no snipers (they carry real scopes).
  acog: { id:'acog', name:'ACOG SIGHT', slot:'optic',
    cats:['Assault Rifle','SMG','LMG'],
    mods:{ zoom:1.9, adsTime:1.18, spreadAds:.7 } },
  // P55: suppressor — quiet fire for a shorter falloff band. The teeth:
  // bots' earshot on your shots drops 25 → ~9 m (noteShot ×0.35, composes
  // with ninja) and the minimap fire-flash never writes. The price: the
  // reserved rangeMult key (range is an [start, end] ARRAY the generic
  // mods loop can't touch — resolveWeaponDef scales both ends explicitly)
  // starts and ends damage falloff 25% earlier — untouched close, weaker
  // far, no flat damage penalty. `suppressed: true` is copied onto the
  // resolved def for the audio/noteShot/viewmodel branches. No shotguns
  // (falloff IS their identity; a silent one-shot-room gun is degenerate),
  // no snipers (a quiet one-shot-kill erases the positional trade). The
  // doc's 'Pistol' cat maps to this sandbox's 'Handgun' + 'Machine
  // Pistol' (the suppressed USP is the archetype — same call as P56).
  // No unlockLevel yet: doc suggested L14 — final slotting is P78's.
  suppressor: { id:'suppressor', name:'SUPPRESSOR', slot:'muzzle',
    cats:['Assault Rifle','SMG','LMG','Handgun','Machine Pistol'],
    mods:{ rangeMult:.75 }, suppressed:true },
  foregrip: { id:'foregrip', name:'FOREGRIP', slot:'underbarrel',
    cats:['Assault Rifle','SMG','LMG','Shotgun'],
    mods:{ recoil:.8, bloom:.8 }, unlockLevel:18 },
  // P57: quickdraw grip — snap-aim speed for a looser aimed cone, the
  // inverse of the holo/ACOG direction. DELIBERATELY shares underbarrel
  // with the foregrip: the one-pick-per-slot rule makes sustained-fire
  // control vs first-shot speed a real choice (#P55-design §3). Same
  // mount list as the foregrip. Stacks bounded with optics (reddot ×
  // quickdraw = .68 adsTime, paying 15% aimed bloom). No unlockLevel
  // yet: the doc suggested L17 — final slotting belongs to P78.
  quickdraw: { id:'quickdraw', name:'QUICKDRAW GRIP', slot:'underbarrel',
    cats:['Assault Rifle','SMG','LMG','Shotgun'],
    mods:{ adsTime:.8, spreadAds:1.15 } },
  // Laser (#19c): its own slot (underbarrel is the foregrip's), trades
  // concealment for a tighter hip cone. Beam drawn from the muzzle in
  // buildViewModel; color is a per-class pick like the reticle color.
  laser: { id:'laser', name:'LASER SIGHT', slot:'laser',
    cats:['Assault Rifle','SMG','LMG','Shotgun'],
    mods:{ spreadHip:.8 }, unlockLevel:12 },
  // P56: extended mags — +50% magazine for +15% reload time. Reserve is
  // deliberately UNMODIFIED: the total pool stays, you just visit it less
  // often (and Scavenger's mag×1.5 resupply quietly scales with the
  // resolved def — flagged-intentional synergy, see #P55-design §2). Odd
  // magazines round in resolveWeaponDef's mag special case. Snipers
  // excluded (7→10 bolt rounds is identity-flat; they already trade
  // everything for damage). The doc's cats said 'Pistol' — this sandbox's
  // category strings are 'Handgun' + 'Machine Pistol' (G18's 33-rounder
  // is the classic). No unlockLevel yet: the doc suggested L10 but P14's
  // table already holds L10 (Scavenger) — final slotting belongs to P78.
  extmags: { id:'extmags', name:'EXTENDED MAGS', slot:'mag',
    cats:['Assault Rifle','SMG','LMG','Handgun','Machine Pistol','Shotgun'],
    mods:{ mag:1.5, reload:1.15 } },
  camoDesert:   { id:'camoDesert',   name:'DESERT CAMO',   slot:'camo', cats:null, mods:{} },
  camoWoodland: { id:'camoWoodland', name:'WOODLAND CAMO', slot:'camo', cats:null, mods:{} },
  camoDigital:  { id:'camoDigital',  name:'DIGITAL CAMO',  slot:'camo', cats:null, mods:{} },
  camoGold:     { id:'camoGold',     name:'GOLD',          slot:'camo', cats:null, mods:{}, unlockLevel:20 },
};

function attachmentAllowed(att, def) {
  return !att.cats || att.cats.includes(def.cat);
}

// Reticle color presets (#19b) — applies to BOTH the red dot's dot and the
// holo's circle-dot. Stored per class as attachments[slot+'DotColor'] (an id
// string, not an attachment id — it isn't a slot pick), migrated to 'red'
// in normalizeClass, resolved to a hex via resolveWeaponDef.reticleColor.
const RETICLE_COLORS = [
  { id:'red',     name:'RED',     hex:0xff2020 },
  { id:'green',   name:'GREEN',   hex:0x35ff45 },
  { id:'cyan',    name:'CYAN',    hex:0x25dcff },
  { id:'amber',   name:'AMBER',   hex:0xffb025 },
  { id:'magenta', name:'MAGENTA', hex:0xff35d5 },
  { id:'white',   name:'WHITE',   hex:0xf2f2f2 },
];
function reticleHex(id) {
  const rc = RETICLE_COLORS.find(rc => rc.id === id);
  return (rc || RETICLE_COLORS[0]).hex;
}

// Laser color presets (#19c) — green is the iconic one, so it leads and is
// the migration default. Stored per class as attachments[slot+'LaserColor']
// (mirrors the reticle-color field), resolved to a hex via
// resolveWeaponDef.laserColor and applied to the beam + dot material.
const LASER_COLORS = [
  { id:'green', name:'GREEN', hex:0x30ff44 },
  { id:'red',   name:'RED',   hex:0xff2626 },
  { id:'blue',  name:'BLUE',  hex:0x3a86ff },
];
function laserHex(id) {
  const lc = LASER_COLORS.find(lc => lc.id === id);
  return (lc || LASER_COLORS[0]).hex;
}

// Short mod summary for the class editor rows ("ADS TIME -15% · ADS SPREAD -10%")
const ATTACH_STAT_LABELS = { adsTime:'ADS TIME', spreadAds:'ADS SPREAD', spreadHip:'HIP SPREAD', recoil:'RECOIL', bloom:'BLOOM', zoom:'ZOOM', mag:'MAG', reload:'RELOAD', rangeMult:'RANGE' }; // P55/P56 labels
function attachmentDesc(att) {
  const parts = [];
  for (const stat in att.mods) {
    const pct = Math.round((att.mods[stat] - 1) * 100);
    parts.push((ATTACH_STAT_LABELS[stat] || stat.toUpperCase()) + ' ' + (pct > 0 ? '+' : '') + pct + '%');
  }
  return parts.length ? parts.join(' · ') : 'COSMETIC';
}

// Single source of resolved weapon stats: base def + attachment modifiers.
// Everything that reads weapon stats for the player (deploy's weapon state,
// fire path, startReload, editor stat bars) must pull from this — never
// apply modifiers ad hoc. Returns the base def itself when nothing valid
// is attached; otherwise a copy carrying `attachments` (valid ids, for the
// viewmodel to branch on) with mods multiplied in.
function resolveWeaponDef(key, attIds, dotColor, laserColor) {
  const base = WEAPONS[key];
  const ids = (attIds || []).filter(id => ATTACHMENTS[id] && attachmentAllowed(ATTACHMENTS[id], base));
  if (!ids.length) return base;
  const def = Object.assign({}, base);
  def.range = base.range.slice();
  def.attachments = ids;
  def.reticleColor = reticleHex(dotColor); // buildViewModel tints the dot/holo reticle with this
  def.laserColor = laserHex(laserColor);   // ...and the laser beam/dot with this
  for (const id of ids) {
    const mods = ATTACHMENTS[id].mods;
    for (const stat in mods) {
      // P55: range is an [falloffStart, falloffEnd] ARRAY — the reserved
      // rangeMult key scales both ends explicitly (the scalar loop below
      // would just NaN a nonexistent def.rangeMult field)
      if (stat === 'rangeMult') { def.range[0] *= mods[stat]; def.range[1] *= mods[stat]; continue; }
      def[stat] *= mods[stat];
    }
    if (ATTACHMENTS[id].suppressed) def.suppressed = true; // P55: rides the resolved def for audio/AI/viewmodel
  }
  // P56: mag is a round count — an odd base ×1.5 lands on .5 (Deagle
  // 7 → 10.5), so a modified mag rounds to NEAREST (Math.round: 10.5 →
  // 11, generous by half a round; even bases multiply exact, untouched)
  if (def.mag !== base.mag) def.mag = Math.round(def.mag);
  return def;
}

// Migration + hygiene for saved classes: old bare-key saves get an empty
// attachments field instead of being dropped; unknown ids, ids the weapon's
// category can't mount, and duplicate slot-category picks are pruned
// (weapon swaps in the editor route back through here too).
function normalizeClass(c) {
  if (!c.attachments || typeof c.attachments !== 'object') c.attachments = {};
  for (const slot of ['primary', 'secondary']) {
    const def = WEAPONS[c[slot]];
    const ids = Array.isArray(c.attachments[slot]) ? c.attachments[slot] : [];
    const used = new Set();
    c.attachments[slot] = ids.filter(id => {
      const a = ATTACHMENTS[id];
      if (!a || !def || !attachmentAllowed(a, def) || used.has(a.slot)) return false;
      used.add(a.slot);
      return true;
    });
    // reticle color (#19b): pre-color saves (and junk values) default to red
    const ck = slot + 'DotColor';
    if (!RETICLE_COLORS.some(rc => rc.id === c.attachments[ck])) c.attachments[ck] = 'red';
    // laser color (#19c): pre-laser saves (and junk values) default to green
    const lk = slot + 'LaserColor';
    if (!LASER_COLORS.some(lc => lc.id === c.attachments[lk])) c.attachments[lk] = 'green';
  }
  // throwables (#16a): pre-#16a saves have no equipment fields — default to
  // the classic FRAG + STUN loadout (smoke is now a tactical alternative, not
  // an always-on third slot). Junk values fall back too.
  if (!['frag', 'semtex', 'c4', 'claymore', 'throwingknife', 'none'].includes(c.lethal)) c.lethal = 'frag'; // P42-P45: legal lethals
  if (!['stun', 'smoke', 'decoy', 'snapshot', 'flashbang', 'none'].includes(c.tactical)) c.tactical = 'stun'; // P48/P49/P51: legal tacticals
  return c;
}

// ============================================================
// PERKS — three tiers, one pick per tier
// ============================================================
const PERKS = {
  1: [
    { id:'marathon',  name:'MARATHON',          desc:'Unlimited sprint', unlockLevel:4 },
    { id:'soh',       name:'SLEIGHT OF HAND',   desc:'Reload 50% faster', unlockLevel:1 },
    { id:'scavenger', name:'SCAVENGER',         desc:'Resupply ammo from bodies you pass over', unlockLevel:10 },
    // P38/P39: killstreak-economy perks — data + UI listing only for now.
    // Selecting/saving works today; behavior lands with the killstreak
    // selector (P69: arsenal's fourth slot) and data-driven thresholds
    // (P70: hardline's discount). Safe as inert data because every perk
    // check in main.js is an id-keyed player.perks.has('<id>') lookup.
    // Same tier = mutually exclusive by the one-pick-per-tier rule.
    { id:'arsenal',   name:'ARSENAL',           desc:'Equip a fourth killstreak slot' },
    { id:'hardline',  name:'HARDLINE',          desc:'Killstreaks cost 1 less kill' },
  ],
  2: [
    { id:'stopping',    name:'STOPPING POWER', desc:'+25% bullet damage', unlockLevel:1 },
    { id:'lightweight', name:'LIGHTWEIGHT',    desc:'Move 8% faster' },
    { id:'coldblooded', name:'COLD-BLOODED',   desc:'Bots spot you from 30% closer', unlockLevel:13 },
  ],
  3: [
    { id:'steadyaim', name:'STEADY AIM', desc:'35% tighter hip fire', unlockLevel:1 },
    { id:'ninja',     name:'NINJA',      desc:'Silent steps, quieter shots, bots react 40% slower', unlockLevel:16 },
    { id:'commando',  name:'COMMANDO',   desc:'Extended melee lunge range' },
  ],
};

function perkById(id) {
  for (const tier of [1, 2, 3]) {
    const p = PERKS[tier].find(p => p.id === id);
    if (p) return p;
  }
  return null;
}

// Default classes
const DEFAULT_CLASSES = [
  { name:'CINDERLINE',  primary:'m4a1',         secondary:'usp',    perks:['soh','stopping','steadyaim'],      lethal:'frag', tactical:'stun',  attachments:{ primary:[], secondary:[] } },
  { name:'IRONWAKE',    primary:'famas',        secondary:'g18',    perks:['marathon','lightweight','ninja'],  lethal:'frag', tactical:'smoke', attachments:{ primary:[], secondary:[] } },
  { name:'ASHRUNNER',   primary:'rpd',          secondary:'deagle', perks:['scavenger','stopping','steadyaim'],lethal:'frag', tactical:'stun',  attachments:{ primary:[], secondary:[] } },
  { name:'RAVENFALL',   primary:'intervention', secondary:'usp',    perks:['soh','coldblooded','ninja'],       lethal:'frag', tactical:'smoke', attachments:{ primary:[], secondary:[] } },
  { name:'DUSTKNIFE',   primary:'ump45',        secondary:'spas12', perks:['marathon','lightweight','commando'],lethal:'frag', tactical:'stun',  attachments:{ primary:[], secondary:[] } },
];

// Loadout pool bots draw from. #16b: each carries a `lethal` throwable pick
// (mirroring the class `lethal` field) so bots can arc a frag — one per life,
// see Bot.grenLeft. null = no grenade (snipers stay ranged, not chuckers).
const BOT_LOADOUTS = [
  { primary:'m4a1',   secondary:'usp',    lethal:'frag' },
  { primary:'scar',   secondary:'deagle', lethal:'frag' },
  { primary:'acr',    secondary:'usp',    lethal:'frag' },
  { primary:'tar21',  secondary:'g18',    lethal:'frag' },
  { primary:'famas',  secondary:'usp',    lethal:'frag' },
  { primary:'fal',    secondary:'deagle', lethal:'frag' },
  { primary:'f2000',  secondary:'g18',    lethal:'frag' },
  { primary:'mp5k',   secondary:'usp',    lethal:'frag' },
  { primary:'ump45',  secondary:'spas12', lethal:'frag' },
  { primary:'vector', secondary:'g18',    lethal:'frag' },
  { primary:'p90',    secondary:'usp',    lethal:'frag' },
  { primary:'mac10',  secondary:'usp',    lethal:'frag' },
  { primary:'rpd',    secondary:'deagle', lethal:'frag' },
  { primary:'m240',   secondary:'usp',    lethal:'frag' },
  { primary:'mg4',    secondary:'deagle', lethal:'frag' },
  { primary:'m60',    secondary:'usp',    lethal:'frag' },
  { primary:'r870',   secondary:'usp',    lethal:'frag' },
  { primary:'aa12',   secondary:'g18',    lethal:'frag' },
  { primary:'intervention', secondary:'usp', lethal:null },
  { primary:'barrett', secondary:'usp', lethal:null },    // P32 flag: was player-only
  { primary:'m14',     secondary:'usp', lethal:'frag' },  // P33: marksman, not a full sniper
];

// Normalized 0..1 stats for the class editor bars
function weaponStatBars(w) {
  // Pellet guns show full-blast damage (per-pellet dmg reads as a pea
  // shooter), and pump guns cycle at pumpTime, not rpm (rpm is bot cadence).
  const hit = w.dmg * (w.pellets || 1);
  const cycleRpm = w.mode === 'pump' ? 60 / w.pumpTime : w.rpm;
  const dps = hit * (cycleRpm / 60);
  return [
    ['DAMAGE',    Math.min(1, hit / 70)],
    ['FIRE RATE', Math.min(1, cycleRpm / 1100)],
    ['DPS',       Math.min(1, dps / 420)],
    ['RANGE',     Math.min(1, w.range[1] / 100)],
    ['ACCURACY',  Math.min(1, 1 - w.recoil / .05)],
    ['MOBILITY',  Math.min(1, (w.speed - .8) / .2)],
  ];
}
