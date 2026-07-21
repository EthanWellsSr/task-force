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
    speed:.95, range:[26,52], model:'ar' },
  scar: { slot:'primary', cat:'Assault Rifle', name:'FN SCAR-H',
    dmg:40, minDmg:30, head:1.4, rpm:585, mag:20, reserve:100, reload:2.3, mode:'auto',
    spreadHip:.034, spreadAds:.0038, recoil:.019, bloom:.0055, zoom:1.35, adsTime:.26,
    speed:.94, range:[30,58], model:'ar' },
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
    speed:1.0, range:[16,34], model:'smg' },
  ump45: { slot:'primary', cat:'SMG', name:'HK UMP45',
    dmg:34, minDmg:22, head:1.4, rpm:600, mag:32, reserve:128, reload:1.95, mode:'auto',
    spreadHip:.025, spreadAds:.0045, recoil:.013, bloom:.0040, zoom:1.25, adsTime:.18,
    speed:1.0, range:[20,40], model:'smg' },
  vector: { slot:'primary', cat:'SMG', name:'KRISS VECTOR',
    dmg:21, minDmg:14, head:1.4, rpm:1090, mag:30, reserve:180, reload:1.8, mode:'auto',
    spreadHip:.026, spreadAds:.0050, recoil:.0075, bloom:.0028, zoom:1.25, adsTime:.17,
    speed:1.0, range:[14,30], model:'smg' },
  p90: { slot:'primary', cat:'SMG', name:'FN P90',
    dmg:23, minDmg:15, head:1.4, rpm:855, mag:50, reserve:150, reload:2.4, mode:'auto',
    spreadHip:.027, spreadAds:.0052, recoil:.011, bloom:.0035, zoom:1.25, adsTime:.19,
    speed:.99, range:[16,36], model:'smg' },
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
  // useless past 15 (Stopping Power flips the 96 blast to 120 — a full-auto
  // one-shot inside ~7 m; accepted, R870+SP one-shots even further, ~12 m).
  // rpm on the r870 is bot cadence/HUD only — the player's
  // cycle is pumpTime, same as the SPAS-12.
  r870: { slot:'primary', cat:'Shotgun', name:'REMINGTON 870 MCS',
    dmg:20, minDmg:5, head:1.2, rpm:60, mag:6, reserve:30, reload:2.7, mode:'pump',
    pellets:8, pumpTime:.8,
    spreadHip:.034, spreadAds:.02, recoil:.048, bloom:.004, zoom:1.15, adsTime:.24,
    speed:.94, range:[5,16], model:'shotgun' },
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
    speed:.92, range:[25,50], model:'sniper', defaultSight:'fixedScope', scopeOverlay:true,
    collateral:true },
  barrett: { slot:'primary', cat:'Sniper Rifle', name:'BARRETT M82',
    dmg:70, minDmg:56, head:1.8, rpm:190, mag:10, reserve:30, reload:3.3, mode:'semi',
    spreadHip:.12, spreadAds:.0012, recoil:.042, bloom:.006, zoom:6.0, adsTime:.4,
    speed:.9, range:[25,50], model:'sniper', defaultSight:'fixedScope', scopeOverlay:true,
    collateral:true },

  // ---------- PRIMARY: MARKSMAN RIFLES ----------
  // The M14 is the hybrid starter: sniper-adjacent damage and cadence with
  // AR-style irons, handling, bot movement, and attachment compatibility.
  // head 2.1 preserves its one-shot headshot inside ~29 m; the body can never
  // 2-shot without Stopping Power (49 x 2 = 98).
  m14: { slot:'primary', cat:'Marksman Rifle', name:'M14 EBR',
    dmg:49, minDmg:38, head:2.1, rpm:240, mag:15, reserve:45, reload:2.6, mode:'semi',
    spreadHip:.09, spreadAds:.0018, recoil:.030, bloom:.0075, zoom:1.35, adsTime:.28,
    speed:.93, range:[26,52], model:'marksman' },

  // ---------- SECONDARIES ----------
  usp: { slot:'secondary', cat:'Handgun', name:'HK USP45',
    dmg:32, minDmg:20, head:1.5, rpm:420, mag:12, reserve:48, reload:1.55, mode:'semi',
    spreadHip:.022, spreadAds:.0060, recoil:.016, bloom:.0050, zoom:1.2, adsTime:.14,
    speed:1.0, range:[14,32], model:'pistol' },
  deagle: { slot:'secondary', cat:'Handgun', name:'DESERT EAGLE',
    dmg:52, minDmg:35, head:1.6, rpm:250, mag:7, reserve:28, reload:1.8, mode:'semi',
    spreadHip:.030, spreadAds:.0058, recoil:.036, bloom:.0090, zoom:1.2, adsTime:.16,
    speed:1.0, range:[16,36], model:'pistol' },
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
  // Crossbow — the final secondary unlock. Its own category limits it to the
  // three explicitly supported optics; no muzzle, underbarrel, laser, mag, or
  // camo attachments mount. One bolt is loaded at a time from a 25-arrow
  // quiver; `perShotReload` starts the visible hand-load immediately after
  // every shot. Its bolt is a gravity-driven world projectile that deals
  // damage on impact and sticks to hit soldiers through their death fall. A
  // precise, slow one-shot body at close range (headshot one-shots at any
  // range).
  crossbow: { slot:'secondary', cat:'Crossbow', name:'CROSSBOW',
    // minDmg 67 keeps the stated rule honest: round(67 × 1.5) = 101, so the
    // headshot one-shots at ANY range (60 gave 90 past 44 m); far body stays
    // a 2-shot and the ~22 m body one-shot boundary is untouched.
    dmg:100, minDmg:67, head:1.5, rpm:55, mag:1, reserve:24, reload:1.2, mode:'bolt',
    perShotReload:true, projectileSpeed:85, projectileGravity:9.8,
    spreadHip:.02, spreadAds:.001, recoil:.015, bloom:.003, zoom:1.5, adsTime:.32,
    speed:.96, range:[22,48], model:'crossbow', collateral:true },
};

// T1: category-local weapon progression. Each weapon class starts with its
// weakest/least reliable pick at Level 1, then unlocks the next rank in that
// category on the matching level. Later category-XP work can reuse the rank
// metadata without re-auditing weapon order.
const WEAPON_UNLOCK_ORDER_BY_CATEGORY = {
  'Assault Rifle': ['f2000', 'm4a1', 'tar21', 'famas', 'scar', 'acr', 'fal'],
  'SMG': ['mac10', 'mp5k', 'p90', 'vector', 'ump45'],
  'LMG': ['rpd', 'mg4', 'm240', 'm60'],
  'Shotgun': ['aa12', 'r870'],
  'Marksman Rifle': ['m14'],
  'Sniper Rifle': ['intervention', 'barrett'],
};
const SECONDARY_UNLOCK_ORDER = ['usp', 'deagle', 'm9', 'g18', 'spas12', 'tomahawk', 'crossbow'];

// Annotate each def with its own key/progression metadata so per-weapon
// systems can branch on identity and unlock order without reverse lookups.
for (const k in WEAPONS) WEAPONS[k].key = k;
for (const cat in WEAPON_UNLOCK_ORDER_BY_CATEGORY) {
  WEAPON_UNLOCK_ORDER_BY_CATEGORY[cat].forEach((key, idx) => {
    if (!WEAPONS[key]) return;
    WEAPONS[key].categoryUnlockRank = idx + 1;
    WEAPONS[key].unlockLevel = idx + 1;
  });
}
SECONDARY_UNLOCK_ORDER.forEach((key, idx) => {
  if (!WEAPONS[key]) return;
  WEAPONS[key].secondaryUnlockRank = idx + 1;
  WEAPONS[key].unlockLevel = idx + 1;
});

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

function currentProfileLevel() {
  try {
    return Profile.load().level;
  } catch (e) {
    return 1;
  }
}

function currentWeaponCategoryLevel(cat) {
  try {
    return Profile.weaponCategoryLevel(cat);
  } catch (e) {
    return 1;
  }
}

function currentWeaponLevel(key) {
  try {
    return Profile.weaponSpecificLevel(key);
  } catch (e) {
    return 1;
  }
}

function currentSecondaryLevel() {
  try {
    return Profile.weaponCategoryLevel('Handgun');
  } catch (e) {
    return 1;
  }
}

function weaponUnlockLevel(def) {
  return def && (def.categoryUnlockRank || def.secondaryUnlockRank || unlockLevelOf(def));
}

function isWeaponUnlocked(def) {
  if (!def) return false;
  if (def.categoryUnlockRank) return def.categoryUnlockRank <= currentWeaponCategoryLevel(def.cat);
  if (def.secondaryUnlockRank) return def.secondaryUnlockRank <= currentSecondaryLevel();
  return unlockLevelOf(def) <= currentProfileLevel();
}

function isAttachmentUnlocked(att, weaponKey) {
  if (!att) return false;
  if (!weaponKey) return unlockLevelOf(att) <= currentProfileLevel();
  return unlockLevelOf(att) <= currentWeaponLevel(weaponKey);
}

function isUnlocked(def, level = currentProfileLevel(), weaponKey = null) {
  if (def && def.slot && (def.slot === 'primary' || def.slot === 'secondary')) return isWeaponUnlocked(def);
  if (def && def.pool === 'reticleColor') return def.unlockLevel <= currentWeaponLevel(weaponKey);
  if (def && ATTACHMENTS && ATTACHMENTS[def.id]) return isAttachmentUnlocked(def, weaponKey);
  return unlockLevelOf(def) <= level;
}

// Final Level 1-20 unlock table (P78-P80) — one readable reward per
// level 2-20. Level 1 is the silent starter kit, so it has no row.
// `pool` is documentation for UI/copy; metadata on the actual def still
// drives class-editor lock chips until gate enforcement lands.
const WEAPON_UNLOCK_ROWS = [];
for (const cat in WEAPON_UNLOCK_ORDER_BY_CATEGORY) {
  for (const id of WEAPON_UNLOCK_ORDER_BY_CATEGORY[cat]) {
    const w = WEAPONS[id];
    if (w && unlockLevelOf(w) > 1) WEAPON_UNLOCK_ROWS.push({ level: unlockLevelOf(w), id, name: w.name, pool: 'weapon' });
  }
}
for (const id of SECONDARY_UNLOCK_ORDER) {
  const w = WEAPONS[id];
  if (w && weaponUnlockLevel(w) > 1) WEAPON_UNLOCK_ROWS.push({ level: weaponUnlockLevel(w), id, name: w.name, pool: 'secondary' });
}

const UNLOCK_TABLE = [
  { level: 4,  id: 'marathon',     name: 'MARATHON',            pool: 'perk' },
  { level: 5,  id: 'smoke',        name: 'SMOKE',               pool: 'throwable' },
  { level: 6,  id: 'decoy',        name: 'DECOY',               pool: 'throwable' },
  { level: 6,  id: 'lightweight',  name: 'LIGHTWEIGHT',         pool: 'perk' },
  { level: 8,  id: 'c4',           name: 'C4',                  pool: 'throwable' },
  { level: 9,  id: 'snapshot',     name: 'SNAPSHOT',            pool: 'throwable' },
  { level: 10, id: 'scavenger',    name: 'SCAVENGER',           pool: 'perk' },
  { level: 11, id: 'claymore',     name: 'CLAYMORE',            pool: 'throwable' },
  { level: 12, id: 'commando',     name: 'COMMANDO',            pool: 'perk' },
  { level: 12, id: 'cuav',         name: 'COUNTER-UAV',         pool: 'killstreak' },
  { level: 12, id: 'flashbang',    name: 'FLASHBANG',           pool: 'throwable' },
  { level: 13, id: 'coldblooded',  name: 'COLD-BLOODED',        pool: 'perk' },
  { level: 14, id: 'throwingknife',name: 'THROWING KNIFE',      pool: 'throwable' },
  { level: 15, id: 'semtex',       name: 'SEMTEX',              pool: 'throwable' },
  { level: 16, id: 'arsenal',      name: 'ARSENAL',             pool: 'perk' },
  { level: 16, id: 'ninja',        name: 'NINJA',               pool: 'perk' },
  { level: 18, id: 'airstrike',    name: 'PRECISION AIRSTRIKE', pool: 'killstreak' },
  { level: 19, id: 'hardline',     name: 'HARDLINE',            pool: 'perk' },
].sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

const WEAPON_TRACK_UNLOCK_TABLE = [
  ...WEAPON_UNLOCK_ROWS,
  { level: 2,  id: 'reddot',       name: 'RED DOT SIGHT',       pool: 'attachment' },
  { level: 3,  id: 'foregrip',     name: 'FOREGRIP',            pool: 'attachment' },
  { level: 4,  id: 'laser',        name: 'LASER SIGHT',         pool: 'attachment' },
  { level: 5,  id: 'camoDesert',   name: 'DESERT CAMO',         pool: 'camo' },
  { level: 6,  id: 'camoWoodland', name: 'WOODLAND CAMO',       pool: 'camo' },
  { level: 6,  id: 'compensator',  name: 'COMPENSATOR',         pool: 'attachment' },
  { level: 7,  id: 'holo',         name: 'HOLOGRAPHIC SIGHT',   pool: 'attachment' },
  { level: 7,  id: 'camoUrban',    name: 'URBAN CAMO',          pool: 'camo' },
  { level: 8,  id: 'camoArctic',   name: 'ARCTIC CAMO',         pool: 'camo' },
  { level: 8,  id: 'extmags',      name: 'EXTENDED MAGS',       pool: 'attachment' },
  { level: 9,  id: 'acog',         name: 'ACOG SIGHT',          pool: 'attachment' },
  { level: 9,  id: 'camoJungle',   name: 'JUNGLE CAMO',         pool: 'camo' },
  { level: 9,  id: 'acogChevron',  name: 'ACOG CHEVRON',        pool: 'reticle' },
  { level: 10, id: 'camoDigital',  name: 'DIGITAL CAMO',        pool: 'camo' },
  { level: 10, id: 'suppressor',   name: 'SUPPRESSOR',          pool: 'attachment' },
  { level: 11, id: 'camoTiger',    name: 'TIGER CAMO',          pool: 'camo' },
  { level: 11, id: 'quickdraw',    name: 'QUICKDRAW GRIP',      pool: 'attachment' },
  { level: 12, id: 'variableScope',name: 'VARIABLE ZOOM SCOPE',  pool: 'attachment' },
  { level: 12, id: 'camoHex',      name: 'HEX CAMO',            pool: 'camo' },
  { level: 13, id: 'camoCarbon',   name: 'CARBON CAMO',         pool: 'camo' },
  { level: 14, id: 'camoRedline',  name: 'REDLINE CAMO',        pool: 'camo' },
  { level: 15, id: 'camoBlueSteel',name: 'BLUE STEEL CAMO',     pool: 'camo' },
  { level: 16, id: 'camoTopo',     name: 'TOPO CAMO',           pool: 'camo' },
  { level: 17, id: 'camoSplinter', name: 'SPLINTER CAMO',       pool: 'camo' },
  { level: 18, id: 'camoGold',     name: 'GOLD CAMO',           pool: 'camo' },
].sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

// A weapon-track reward (attachment/camo/reticle) is worth announcing for a
// weapon only if it can actually mount on it. Attachments and camos carry
// category lists; ACOG reticles ride the ACOG, so gate them on its mount list.
function weaponTrackRewardFits(row, w) {
  const att = ATTACHMENTS[row.id];
  if (att) return attachmentAllowed(att, w);
  if (row.pool === 'reticle') return !ATTACHMENTS.acog || attachmentAllowed(ATTACHMENTS.acog, w);
  return true;
}

// End-screen unlock recap: every reward this match crossed, across all three
// progression tracks — account level (perks/throwables/killstreaks), weapon-
// category level (weapons), and weapon-specific level (attachments/camos/
// reticles). `commit` is the object from Profile.commitMatch. Returns an
// ordered list of display strings; empty when nothing new unlocked.
function unlocksFromCommit(commit) {
  const out = [];
  if (!commit) return out;

  // 1) Account-level rewards.
  const oldLvl = commit.oldLevel || 1, newLvl = commit.newLevel || 1;
  for (const row of UNLOCK_TABLE)
    if (row.level > oldLvl && row.level <= newLvl) out.push(row.name);

  // 2) Weapon unlocks — gated by the weapon's category track. Primaries key off
  //    their own category; secondaries share one track (currentSecondaryLevel
  //    reads the Handgun slot), so compare all secondaries against that entry.
  const oldW = commit.oldWeaponLevels || {}, newW = commit.newWeaponLevels || {};
  for (const id in WEAPONS) {
    const w = WEAPONS[id];
    let track = null, rank = 0;
    if (w.categoryUnlockRank) { track = w.cat; rank = w.categoryUnlockRank; }
    else if (w.secondaryUnlockRank) { track = 'Handgun'; rank = w.secondaryUnlockRank; }
    if (!track || rank <= 1) continue;
    if (rank > (oldW[track] || 1) && rank <= (newW[track] || 1)) out.push(w.name);
  }

  // 3) Attachment / camo / reticle unlocks — gated by each weapon's own level.
  //    Only weapons that earned XP appear in the level maps; for each, list the
  //    weapon-track rewards it crossed that actually mount on it.
  const oldWS = commit.oldWeaponSpecificLevels || {}, newWS = commit.newWeaponSpecificLevels || {};
  for (const key in newWS) {
    const from = oldWS[key] || 1, to = newWS[key] || 1;
    if (to <= from) continue;
    const w = WEAPONS[key];
    if (!w) continue;
    for (const row of WEAPON_TRACK_UNLOCK_TABLE) {
      if (row.pool === 'weapon' || row.pool === 'secondary') continue; // handled above
      if (row.level <= from || row.level > to) continue;
      if (!weaponTrackRewardFits(row, w)) continue;
      out.push(w.name + ' — ' + row.name);
    }
  }
  return out;
}

// ============================================================
// ATTACHMENTS — one pick per slot category, per weapon.
// mods = stat multipliers applied to the base def by resolveWeaponDef.
// cats = weapon categories the attachment mounts on (null = all).
// ============================================================
const ATTACH_SLOTS = ['optic', 'muzzle', 'underbarrel', 'laser', 'mag', 'camo']; // P55/P56: 'muzzle' + 'mag' slots (editor rows + save hygiene pick them up from here)

// Every weapon that fires a shot or projectile shares the same optic ladder.
// The thrown tomahawk is deliberately absent.
const SHOOTING_CATEGORIES = [
  'Assault Rifle', 'Marksman Rifle', 'SMG', 'LMG', 'Shotgun',
  'Sniper Rifle', 'Handgun', 'Machine Pistol', 'Crossbow',
];

const ATTACHMENTS = {
  reddot: { id:'reddot', name:'RED DOT SIGHT', slot:'optic',
    cats:SHOOTING_CATEGORIES, zoom:1.35,
    mods:{ adsTime:.85, spreadAds:.9 }, unlockLevel:2 }, // first unlock (P13)
  // Holo identity vs the red dot: the bigger window aims tighter but the
  // bulkier housing aims up slower (still faster than irons). One optic per
  // slot, so it's mutually exclusive with the red dot via normalizeClass.
  holo: { id:'holo', name:'HOLOGRAPHIC SIGHT', slot:'optic',
    cats:SHOOTING_CATEGORIES, zoom:1.35,
    mods:{ adsTime:.92, spreadAds:.82 }, unlockLevel:7 },
  // ACOG is the fixed 3x tier. Optic magnification is absolute so the same
  // sight never inherits a sniper's 6x base zoom or varies by weapon class.
  acog: { id:'acog', name:'ACOG SIGHT', slot:'optic',
    cats:SHOOTING_CATEGORIES, zoom:3,
    mods:{ adsTime:1.18, spreadAds:.7 }, unlockLevel:9 },
  // Final optic tier: every shooting weapon can trade the slowest ADS time
  // for the tightest cone and a 4x-8x wheel-adjustable sight picture.
  variableScope: { id:'variableScope', name:'VARIABLE ZOOM SCOPE', slot:'optic',
    cats:SHOOTING_CATEGORIES, zoom:4, variableZoom:true, scopeOverlay:true,
    mods:{ adsTime:1.24, spreadAds:.62 }, unlockLevel:12 },
  // P55: suppressor — quiet fire for a shorter falloff band. The teeth:
  // bots' earshot on your shots drops 25 → ~9 m (noteShot ×0.35, composes
  // with ninja) and the minimap fire-flash never writes. The trade:
  // quieter, softer recoil, but the reserved rangeMult key (range is an
  // [start, end] ARRAY the generic mods loop can't touch —
  // resolveWeaponDef scales both ends explicitly) starts and ends damage
  // falloff 25% earlier — untouched close, weaker far, no flat damage
  // penalty. `suppressed: true` is copied onto the
  // resolved def for the audio/noteShot/viewmodel branches. No shotguns
  // (falloff IS their identity; a silent one-shot-room gun is degenerate),
  // no snipers (a quiet one-shot-kill erases the positional trade). The
  // doc's 'Pistol' cat maps to this sandbox's 'Handgun' + 'Machine
  // Pistol' (the suppressed USP is the archetype — same call as P56).
  // Compensator — the muzzle slot's recoil-control option, unlocked before the
  // suppressor. A ported brake bleeds off muzzle climb (strong recoil cut +
  // tighter sustained bloom); the trade is it's loud and flashy (no
  // suppression) and it shares the muzzle slot, so it's mutually exclusive with
  // the suppressor. Mounts on every firearm category.
  compensator: { id:'compensator', name:'COMPENSATOR', slot:'muzzle',
    cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'],
    mods:{ recoil:.75, bloom:.9 }, unlockLevel:6 },
  suppressor: { id:'suppressor', name:'SUPPRESSOR', slot:'muzzle',
    cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Handgun','Machine Pistol'],
    mods:{ rangeMult:.75, recoil:.9 }, suppressed:true, unlockLevel:10 },
  foregrip: { id:'foregrip', name:'FOREGRIP', slot:'underbarrel',
    cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun'],
    mods:{ recoil:.8, bloom:.8 }, unlockLevel:3 },
  // P57: quickdraw grip — snap-aim speed for a looser aimed cone, the
  // inverse of the holo/ACOG direction. DELIBERATELY shares underbarrel
  // with the foregrip: the one-pick-per-slot rule makes sustained-fire
  // control vs first-shot speed a real choice (#P55-design §3). Same
  // mount list as the foregrip. Stacks bounded with optics (reddot ×
  // quickdraw = .68 adsTime; quickdraw's +15% spreadAds nets +3.5% after
  // the reddot's ×.9).
  quickdraw: { id:'quickdraw', name:'QUICKDRAW GRIP', slot:'underbarrel',
    cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun'],
    mods:{ adsTime:.8, spreadAds:1.15 }, unlockLevel:11 },
  // Laser (#19c): its own slot (underbarrel is the foregrip's), trades
  // concealment for a tighter hip cone. Beam drawn from the muzzle in
  // buildViewModel; color is a per-class pick like the reticle color.
  laser: { id:'laser', name:'LASER SIGHT', slot:'laser',
    cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun'],
    mods:{ spreadHip:.8 }, unlockLevel:4 },
  // P56: extended mags — +50% magazine for +15% reload time. Reserve is
  // deliberately UNMODIFIED: the total pool stays, you just visit it less
  // often (and Scavenger's mag×1.5 resupply quietly scales with the
  // resolved def — flagged-intentional synergy, see #P55-design §2). Odd
  // magazines round in resolveWeaponDef's mag special case. Snipers
  // excluded (7→10 bolt rounds is identity-flat; they already trade
  // everything for damage). The doc's cats said 'Pistol' — this sandbox's
  // category strings are 'Handgun' + 'Machine Pistol' (G18's 33-rounder
  // is the classic).
  extmags: { id:'extmags', name:'EXTENDED MAGS', slot:'mag',
    cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Handgun','Machine Pistol','Shotgun'],
    mods:{ mag:1.5, reload:1.15 }, unlockLevel:8 },
  // T2: cosmetic-only camo ladder. All camos are locked until Level 5,
  // then one camo unlocks per level with Gold as the final camo.
  camoDesert:    { id:'camoDesert',    name:'DESERT CAMO',     slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:5,  desc:'TAN FIELD PATTERN' },
  camoWoodland:  { id:'camoWoodland',  name:'WOODLAND CAMO',   slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:6,  desc:'GREEN FIELD PATTERN' },
  camoUrban:     { id:'camoUrban',     name:'URBAN CAMO',      slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:7,  desc:'GRAY CITY PATTERN' },
  camoArctic:    { id:'camoArctic',    name:'ARCTIC CAMO',     slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:8,  desc:'WHITE FIELD PATTERN' },
  camoJungle:    { id:'camoJungle',    name:'JUNGLE CAMO',     slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:9,  desc:'DENSE GREEN PATTERN' },
  camoDigital:   { id:'camoDigital',   name:'DIGITAL CAMO',    slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:10, desc:'GRAY DIGITAL PATTERN' },
  camoTiger:     { id:'camoTiger',     name:'TIGER CAMO',      slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:11, desc:'STRIPED FIELD PATTERN' },
  camoHex:       { id:'camoHex',       name:'HEX CAMO',        slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:12, desc:'ANGULAR HEX PATTERN' },
  camoCarbon:    { id:'camoCarbon',    name:'CARBON CAMO',     slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:13, desc:'DARK CARBON WEAVE' },
  camoRedline:   { id:'camoRedline',   name:'REDLINE CAMO',    slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:14, desc:'RED ACCENT PATTERN' },
  camoBlueSteel: { id:'camoBlueSteel', name:'BLUE STEEL CAMO', slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:15, desc:'BLUE METAL PATTERN' },
  camoTopo:      { id:'camoTopo',      name:'TOPO CAMO',       slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:16, desc:'CONTOUR LINE PATTERN' },
  camoSplinter:  { id:'camoSplinter',  name:'SPLINTER CAMO',   slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:17, desc:'SHARP SPLINTER PATTERN' },
  camoGold:      { id:'camoGold',      name:'GOLD CAMO',       slot:'camo', cats:['Assault Rifle','Marksman Rifle','SMG','LMG','Shotgun','Sniper Rifle','Handgun','Machine Pistol'], mods:{}, unlockLevel:18, desc:'ASPIRATIONAL GOLD FINISH' },
};

function attachmentAllowed(att, def) {
  return !att.cats || att.cats.includes(def.cat);
}

// Reticle color presets (#19b) — applies to BOTH the red dot's dot and the
// holo's circle-dot. Stored per class as attachments[slot+'DotColor'] (an id
// string, not an attachment id — it isn't a slot pick), migrated to 'red'
// in normalizeClass, resolved to a hex via resolveWeaponDef.reticleColor.
const RETICLE_COLORS = [
  { id:'red',     name:'RED',     hex:0xff2020, unlockLevel:1, pool:'reticleColor' },
  { id:'green',   name:'GREEN',   hex:0x35ff45, unlockLevel:9, pool:'reticleColor' },
  { id:'cyan',    name:'CYAN',    hex:0x25dcff, unlockLevel:11, pool:'reticleColor' },
  { id:'amber',   name:'AMBER',   hex:0xffb025, unlockLevel:13, pool:'reticleColor' },
  { id:'magenta', name:'MAGENTA', hex:0xff35d5, unlockLevel:15, pool:'reticleColor' },
  { id:'white',   name:'WHITE',   hex:0xf2f2f2, unlockLevel:17, pool:'reticleColor' },
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

const ACOG_RETICLES = [
  { id:'cross', name:'CROSS', unlockLevel:9 },
  { id:'chevron', name:'CHEVRON', unlockLevel:9 },
];

// Short mod summary for the class editor rows ("ADS TIME -15% · ADS SPREAD -10%")
const ATTACH_STAT_LABELS = { adsTime:'ADS TIME', spreadAds:'ADS SPREAD', spreadHip:'HIP SPREAD', recoil:'RECOIL', bloom:'BLOOM', zoom:'ZOOM', mag:'MAG', reload:'RELOAD', rangeMult:'RANGE' }; // P55/P56 labels
function attachmentDesc(att) {
  const parts = [];
  if (att.zoom) parts.push('ZOOM ' + att.zoom.toFixed(att.zoom % 1 ? 2 : 0) + 'x');
  for (const stat in att.mods) {
    const pct = Math.round((att.mods[stat] - 1) * 100);
    parts.push((ATTACH_STAT_LABELS[stat] || stat.toUpperCase()) + ' ' + (pct > 0 ? '+' : '') + pct + '%');
  }
  return parts.length ? parts.join(' · ') : (att.desc || 'COSMETIC');
}

// Single source of resolved weapon stats: base def + attachment modifiers.
// Everything that reads weapon stats for the player (deploy's weapon state,
// fire path, startReload, editor stat bars) must pull from this — never
// apply modifiers ad hoc. Returns the base def itself when nothing valid
// is attached; otherwise a copy carrying `attachments` (valid ids, for the
// viewmodel to branch on) with mods multiplied in.
// allowAll bypasses the category-fit filter — used only by fixed reward presets
// (Daring David) whose curated loadout is allowed to mount cross-category (e.g.
// a red dot + laser on a machine pistol) regardless of the normal mount rules.
function resolveWeaponDef(key, attIds, dotColor, laserColor, acogReticle, allowAll = false) {
  const base = WEAPONS[key];
  const ids = (attIds || []).filter(id => ATTACHMENTS[id] && (allowAll || attachmentAllowed(ATTACHMENTS[id], base)));
  if (!ids.length) return base;
  const def = Object.assign({}, base);
  def.range = base.range.slice();
  def.attachments = ids;
  def.reticleColor = reticleHex(dotColor); // buildViewModel tints the dot/holo reticle with this
  def.laserColor = laserHex(laserColor);   // ...and the laser beam/dot with this
  def.acogReticle = ACOG_RETICLES.some(r => r.id === acogReticle) ? acogReticle : 'cross';
  for (const id of ids) {
    const att = ATTACHMENTS[id];
    const mods = att.mods;
    for (const stat in mods) {
      // P55: range is an [falloffStart, falloffEnd] ARRAY — the reserved
      // rangeMult key scales both ends explicitly (the scalar loop below
      // would just NaN a nonexistent def.rangeMult field)
      if (stat === 'rangeMult') { def.range[0] *= mods[stat]; def.range[1] *= mods[stat]; continue; }
      def[stat] *= mods[stat];
    }
    if (att.zoom) def.zoom = att.zoom;
    if (att.suppressed) def.suppressed = true; // P55: rides the resolved def for audio/AI/viewmodel
    if (att.slot === 'optic') {
      def.scopeOverlay = !!att.scopeOverlay;
      def.variableZoom = !!att.variableZoom;
    }
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
const DEFAULT_KILLSTREAK_IDS = ['uav', 'carepackage', 'napalm'];

function streakSlotLimit(c) {
  return c && Array.isArray(c.perks) && c.perks.includes('arsenal') ? 4 : 3;
}

function selectableKillstreakIds() {
  if (typeof KILLSTREAK_ORDER === 'undefined' || typeof KILLSTREAKS === 'undefined')
    return DEFAULT_KILLSTREAK_IDS.slice();
  return KILLSTREAK_ORDER.filter(id => KILLSTREAKS[id] && KILLSTREAKS[id].selectable);
}

function firstUnlockedWeapon(slot, level, preferredCat = null) {
  if (preferredCat) {
    for (const key in WEAPONS)
      if (WEAPONS[key].slot === slot && WEAPONS[key].cat === preferredCat && isUnlocked(WEAPONS[key], level)) return key;
  }
  for (const key in WEAPONS)
    if (WEAPONS[key].slot === slot && isUnlocked(WEAPONS[key], level)) return key;
  return slot === 'secondary' ? 'usp' : 'm4a1';
}

function firstUnlockedPerk(tier, level) {
  const pick = (PERKS[tier] || []).find(p => isUnlocked(p, level));
  return pick ? pick.id : (PERKS[tier] && PERKS[tier][0] ? PERKS[tier][0].id : null);
}

function firstUnlockedThrowable(slot, level) {
  if (typeof THROWABLES !== 'undefined') {
    for (const id in THROWABLES)
      if (THROWABLES[id].slot === slot && isUnlocked(THROWABLES[id], level)) return id;
  }
  return slot === 'tactical' ? 'stun' : 'frag';
}

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
    const ak = slot + 'AcogReticle';
    if (!ACOG_RETICLES.some(r => r.id === c.attachments[ak])) c.attachments[ak] = 'cross';
    // laser color (#19c): pre-laser saves (and junk values) default to green
    const lk = slot + 'LaserColor';
    if (!LASER_COLORS.some(lc => lc.id === c.attachments[lk])) c.attachments[lk] = 'green';
  }
  // throwables (#16a): pre-#16a saves have no equipment fields — default to
  // the classic FRAG + STUN loadout (smoke is now a tactical alternative, not
  // an always-on third slot). Junk values fall back too.
  if (!['frag', 'semtex', 'c4', 'claymore', 'throwingknife', 'none'].includes(c.lethal)) c.lethal = 'frag'; // P42-P45: legal lethals
  if (!['stun', 'smoke', 'decoy', 'snapshot', 'flashbang', 'none'].includes(c.tactical)) c.tactical = 'stun'; // P48/P49/P51: legal tacticals

  // P67/P69: killstreak selection lives on each class. Old saves receive a
  // three-streak default; ARSENAL classes may carry four. Special streaks
  // (Nuke) are never selectable here and are appended at spawn by main.js.
  const legalStreaks = selectableKillstreakIds();
  const selected = Array.isArray(c.killstreaks) ? c.killstreaks : DEFAULT_KILLSTREAK_IDS;
  const seenStreaks = new Set();
  c.killstreaks = selected.filter(id => {
    if (!legalStreaks.includes(id) || seenStreaks.has(id)) return false;
    seenStreaks.add(id);
    return true;
  }).slice(0, streakSlotLimit(c));
  if (!c.killstreaks.length) c.killstreaks = DEFAULT_KILLSTREAK_IDS.filter(id => legalStreaks.includes(id)).slice(0, streakSlotLimit(c));
  return c;
}

function sanitizeClassForLevel(c, level = currentProfileLevel()) {
  normalizeClass(c);
  if (!WEAPONS[c.primary] || !isWeaponUnlocked(WEAPONS[c.primary])) c.primary = firstUnlockedWeapon('primary', level, WEAPONS[c.primary] && WEAPONS[c.primary].cat);
  if (!WEAPONS[c.secondary] || !isWeaponUnlocked(WEAPONS[c.secondary])) c.secondary = firstUnlockedWeapon('secondary', level, WEAPONS[c.secondary] && WEAPONS[c.secondary].cat);

  for (const slot of ['primary', 'secondary']) {
    const def = WEAPONS[c[slot]];
    c.attachments[slot] = (c.attachments[slot] || []).filter(id => {
      const a = ATTACHMENTS[id];
      return a && attachmentAllowed(a, def) && isAttachmentUnlocked(a, c[slot]);
    });
    if (!isUnlocked(RETICLE_COLORS.find(rc => rc.id === c.attachments[slot + 'DotColor']), level, c[slot]))
      c.attachments[slot + 'DotColor'] = 'red';
    if (!ACOG_RETICLES.some(r => r.id === c.attachments[slot + 'AcogReticle'] && r.unlockLevel <= currentWeaponLevel(c[slot])))
      c.attachments[slot + 'AcogReticle'] = 'cross';
  }

  for (const tier of [1, 2, 3]) {
    // tier-scoped lookup: a perk id sitting in the wrong tier slot (hand-edited
    // save) must fail validation, or two same-tier perks could stack
    const p = (PERKS[tier] || []).find(x => x.id === c.perks[tier - 1]);
    if (!p || !isUnlocked(p, level)) c.perks[tier - 1] = firstUnlockedPerk(tier, level);
  }

  if (typeof THROWABLES !== 'undefined') {
    // 'none' is a deliberate unequipped slot (editor offers it, deploy nulls it) —
    // it needs no unlock and must survive sanitation
    if (c.lethal !== 'none' && (!THROWABLES[c.lethal] || !isUnlocked(THROWABLES[c.lethal], level))) c.lethal = firstUnlockedThrowable('lethal', level);
    if (c.tactical !== 'none' && (!THROWABLES[c.tactical] || !isUnlocked(THROWABLES[c.tactical], level))) c.tactical = firstUnlockedThrowable('tactical', level);
  }

  const legalStreaks = selectableKillstreakIds()
    .filter(id => typeof KILLSTREAKS === 'undefined' || (KILLSTREAKS[id] && isUnlocked(KILLSTREAKS[id], level)));
  c.killstreaks = (c.killstreaks || [])
    .filter(id => legalStreaks.includes(id))
    .slice(0, streakSlotLimit(c));
  if (!c.killstreaks.length)
    c.killstreaks = DEFAULT_KILLSTREAK_IDS.filter(id => legalStreaks.includes(id)).slice(0, streakSlotLimit(c));
  return normalizeClass(c);
}

// ============================================================
// PERKS — three tiers, one pick per tier
// ============================================================
const PERKS = {
  1: [
    { id:'marathon',  name:'MARATHON',          desc:'Unlimited sprint', unlockLevel:4 },
    { id:'soh',       name:'SLEIGHT OF HAND',   desc:'Reload 50% faster', unlockLevel:1 },
    { id:'scavenger', name:'SCAVENGER',         desc:'Resupply ammo from bodies you pass over', unlockLevel:10 },
    // P38/P39 → P69/P70: killstreak-economy perks, both fully live —
    // arsenal's fourth slot via streakSlotLimit (this file) and hardline's
    // discount via effKills in main.js (max(2, kills − 1), nuke exempt).
    // Same tier = mutually exclusive by the one-pick-per-tier rule.
    { id:'arsenal',   name:'ARSENAL',           desc:'Equip a fourth killstreak slot', unlockLevel:16 },
    { id:'hardline',  name:'HARDLINE',          desc:'Killstreaks cost 1 less kill', unlockLevel:19 },
  ],
  2: [
    { id:'stopping',    name:'STOPPING POWER', desc:'+25% bullet damage', unlockLevel:1 },
    { id:'lightweight', name:'LIGHTWEIGHT',    desc:'Move 8% faster', unlockLevel:6 },
    { id:'coldblooded', name:'COLD-BLOODED',   desc:'Bots spot you from 30% closer', unlockLevel:13 },
  ],
  3: [
    { id:'steadyaim', name:'STEADY AIM', desc:'35% tighter hip fire', unlockLevel:1 },
    { id:'ninja',     name:'NINJA',      desc:'Silent steps, quieter shots, bots react 40% slower', unlockLevel:16 },
    { id:'commando',  name:'COMMANDO',   desc:'Extended melee lunge range', unlockLevel:12 },
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
  { name:'CINDERLINE',  primary:'f2000', secondary:'usp', perks:['soh','stopping','steadyaim'], lethal:'frag', tactical:'stun', killstreaks:DEFAULT_KILLSTREAK_IDS.slice(), attachments:{ primary:[], secondary:[] } },
  { name:'IRONWAKE',    primary:'mac10', secondary:'usp', perks:['soh','stopping','steadyaim'], lethal:'frag', tactical:'stun', killstreaks:DEFAULT_KILLSTREAK_IDS.slice(), attachments:{ primary:[], secondary:[] } },
  { name:'ASHRUNNER',   primary:'rpd',   secondary:'usp', perks:['soh','stopping','steadyaim'], lethal:'frag', tactical:'stun', killstreaks:DEFAULT_KILLSTREAK_IDS.slice(), attachments:{ primary:[], secondary:[] } },
  { name:'RAVENFALL',   primary:'m14',   secondary:'usp', perks:['soh','stopping','steadyaim'], lethal:'frag', tactical:'stun', killstreaks:DEFAULT_KILLSTREAK_IDS.slice(), attachments:{ primary:[], secondary:[] } },
  { name:'DUSTKNIFE',   primary:'aa12',  secondary:'usp', perks:['soh','stopping','steadyaim'], lethal:'frag', tactical:'stun', killstreaks:DEFAULT_KILLSTREAK_IDS.slice(), attachments:{ primary:[], secondary:[] } },
];

// Daring David — a fixed reward class (class 5, beyond the five editable slots).
// It only unlocks after earning a Tactical Nuke on every map at Veteran enemy
// difficulty (Profile.daringDavidUnlocked — the code gate is exactly 'veteran'). The loadout is fixed and
// bypasses the normal unlock-level and mount-category gates: resolveWeaponDef is
// called with allowAll for it, and deploy() never sanitizes it. Its weapons also
// carry a hidden bottomless-magazine Easter egg (unlimited ammo, no reload) that
// is deliberately NOT surfaced in the unlock description.
const DARING_DAVID = {
  name: 'DARING DAVID',
  preset: true,
  primary: 'm4a1', secondary: 'g18',
  perks: ['soh', 'stopping', 'steadyaim'], // sleight of hand / stopping power / steady aim
  lethal: 'frag', tactical: 'stun',
  killstreaks: ['uav', 'napalm', 'airstrike'],
  attachments: {
    primary: ['acog', 'foregrip', 'compensator', 'extmags', 'laser', 'camoRedline'],
    primaryAcogReticle: 'cross', primaryDotColor: 'green', primaryLaserColor: 'green',
    secondary: ['reddot', 'laser'],
    secondaryDotColor: 'green', secondaryLaserColor: 'green',
  },
  unlockDesc: 'Earn a Tactical Nuke (25-kill streak) on every map on Veteran enemy difficulty.',
};
// class-select index for Daring David: it sits just past the editable classes.
const DARING_DAVID_INDEX = DEFAULT_CLASSES.length; // 5

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
