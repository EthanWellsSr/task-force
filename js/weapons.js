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

  // ---------- PRIMARY: LMG ----------
  rpd: { slot:'primary', cat:'LMG', name:'RPD',
    dmg:36, minDmg:28, head:1.4, rpm:660, mag:100, reserve:200, reload:4.4, mode:'auto',
    spreadHip:.044, spreadAds:.0050, recoil:.017, bloom:.0038, zoom:1.35, adsTime:.34,
    speed:.87, range:[32,64], model:'lmg' },

  // ---------- PRIMARY: SHOTGUNS ----------
  // Pellet balance vs 100 HP: r870 one-shots to ~9-10 m (falloff + spread
  // shed pellets past that), aa12 is a 2-shot DPS monster inside 6 m and
  // useless past 15. rpm on the r870 is bot cadence/HUD only — the player's
  // cycle is pumpTime, same as the SPAS-12.
  r870: { slot:'primary', cat:'Shotgun', name:'REMINGTON 870 MCS',
    dmg:20, minDmg:5, head:1.2, rpm:60, mag:6, reserve:30, reload:2.7, mode:'pump',
    pellets:8, pumpTime:.8,
    spreadHip:.034, spreadAds:.02, recoil:.048, bloom:.004, zoom:1.15, adsTime:.24,
    speed:.94, range:[5,16], model:'shotgun' },
  aa12: { slot:'primary', cat:'Shotgun', name:'ATCHISSON AA-12',
    dmg:12, minDmg:4, head:1.2, rpm:300, mag:8, reserve:40, reload:2.5, mode:'semi',
    pellets:8,
    spreadHip:.05, spreadAds:.034, recoil:.028, bloom:.006, zoom:1.15, adsTime:.22,
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
    speed:.9, range:[25,50], model:'sniper' },

  // ---------- SECONDARIES ----------
  usp: { slot:'secondary', cat:'Handgun', name:'HK USP45',
    dmg:32, minDmg:20, head:1.5, rpm:420, mag:12, reserve:48, reload:1.55, mode:'semi',
    spreadHip:.022, spreadAds:.0060, recoil:.016, bloom:.0050, zoom:1.2, adsTime:.14,
    speed:1.0, range:[14,32], model:'pistol' },
  deagle: { slot:'secondary', cat:'Handgun', name:'DESERT EAGLE',
    dmg:52, minDmg:35, head:1.6, rpm:250, mag:7, reserve:28, reload:1.8, mode:'semi',
    spreadHip:.030, spreadAds:.0058, recoil:.036, bloom:.0090, zoom:1.2, adsTime:.16,
    speed:1.0, range:[16,36], model:'pistol' },
  g18: { slot:'secondary', cat:'Machine Pistol', name:'GLOCK 18',
    dmg:18, minDmg:12, head:1.4, rpm:1000, mag:33, reserve:99, reload:1.85, mode:'auto',
    spreadHip:.034, spreadAds:.0085, recoil:.011, bloom:.0042, zoom:1.2, adsTime:.15,
    speed:1.0, range:[10,26], model:'pistol' },
  spas12: { slot:'secondary', cat:'Shotgun', name:'FRANCHI SPAS-12',
    dmg:15, minDmg:5, head:1.2, rpm:66, mag:8, reserve:32, reload:2.9, mode:'pump',
    pellets:8, pumpTime:.55,
    spreadHip:.045, spreadAds:.028, recoil:.045, bloom:.004, zoom:1.15, adsTime:.22,
    speed:.98, range:[8,22], model:'shotgun' },
};

// Annotate each def with its own key so per-weapon systems (viewmodel
// recipes, attachments) can branch on identity without a reverse lookup.
for (const k in WEAPONS) WEAPONS[k].key = k;

// Fire mode label shown on the HUD
function fireModeLabel(w) {
  return { auto:'AUTO', semi:'SEMI', burst:'3-RND BURST', bolt:'BOLT ACTION', pump:'PUMP' }[w.mode];
}

// ============================================================
// ATTACHMENTS — one pick per slot category, per weapon.
// mods = stat multipliers applied to the base def by resolveWeaponDef.
// cats = weapon categories the attachment mounts on (null = all).
// ============================================================
const ATTACH_SLOTS = ['optic', 'underbarrel', 'camo'];

const ATTACHMENTS = {
  reddot: { id:'reddot', name:'RED DOT SIGHT', slot:'optic',
    cats:['Assault Rifle','SMG','LMG','Shotgun'],
    mods:{ adsTime:.85, spreadAds:.9 } },
  foregrip: { id:'foregrip', name:'FOREGRIP', slot:'underbarrel',
    cats:['Assault Rifle','SMG','LMG','Shotgun'],
    mods:{ recoil:.8, bloom:.8 } },
  camoDesert:   { id:'camoDesert',   name:'DESERT CAMO',   slot:'camo', cats:null, mods:{} },
  camoWoodland: { id:'camoWoodland', name:'WOODLAND CAMO', slot:'camo', cats:null, mods:{} },
  camoDigital:  { id:'camoDigital',  name:'DIGITAL CAMO',  slot:'camo', cats:null, mods:{} },
  camoGold:     { id:'camoGold',     name:'GOLD',          slot:'camo', cats:null, mods:{} },
};

function attachmentAllowed(att, def) {
  return !att.cats || att.cats.includes(def.cat);
}

// Short mod summary for the class editor rows ("ADS TIME -15% · ADS SPREAD -10%")
const ATTACH_STAT_LABELS = { adsTime:'ADS TIME', spreadAds:'ADS SPREAD', recoil:'RECOIL', bloom:'BLOOM' };
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
function resolveWeaponDef(key, attIds) {
  const base = WEAPONS[key];
  const ids = (attIds || []).filter(id => ATTACHMENTS[id] && attachmentAllowed(ATTACHMENTS[id], base));
  if (!ids.length) return base;
  const def = Object.assign({}, base);
  def.range = base.range.slice();
  def.attachments = ids;
  for (const id of ids) {
    const mods = ATTACHMENTS[id].mods;
    for (const stat in mods) def[stat] *= mods[stat];
  }
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
  }
  return c;
}

// ============================================================
// PERKS — three tiers, one pick per tier
// ============================================================
const PERKS = {
  1: [
    { id:'marathon',  name:'MARATHON',          desc:'Unlimited sprint' },
    { id:'soh',       name:'SLEIGHT OF HAND',   desc:'Reload 50% faster' },
    { id:'scavenger', name:'SCAVENGER',         desc:'Double reserve ammo' },
  ],
  2: [
    { id:'stopping',    name:'STOPPING POWER', desc:'+25% bullet damage' },
    { id:'lightweight', name:'LIGHTWEIGHT',    desc:'Move 8% faster' },
    { id:'coldblooded', name:'COLD-BLOODED',   desc:'Bots spot you from 30% closer' },
  ],
  3: [
    { id:'steadyaim', name:'STEADY AIM', desc:'35% tighter hip fire' },
    { id:'ninja',     name:'NINJA',      desc:'Silent steps, quieter shots, bots react 40% slower' },
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
  { name:'CINDERLINE',  primary:'m4a1',         secondary:'usp',    perks:['soh','stopping','steadyaim'],      attachments:{ primary:[], secondary:[] } },
  { name:'IRONWAKE',    primary:'famas',        secondary:'g18',    perks:['marathon','lightweight','ninja'],  attachments:{ primary:[], secondary:[] } },
  { name:'ASHRUNNER',   primary:'rpd',          secondary:'deagle', perks:['scavenger','stopping','steadyaim'],attachments:{ primary:[], secondary:[] } },
  { name:'RAVENFALL',   primary:'intervention', secondary:'usp',    perks:['soh','coldblooded','ninja'],       attachments:{ primary:[], secondary:[] } },
  { name:'DUSTKNIFE',   primary:'ump45',        secondary:'spas12', perks:['marathon','lightweight','commando'],attachments:{ primary:[], secondary:[] } },
];

// Loadout pool bots draw from
const BOT_LOADOUTS = [
  { primary:'m4a1',   secondary:'usp' },
  { primary:'scar',   secondary:'deagle' },
  { primary:'acr',    secondary:'usp' },
  { primary:'tar21',  secondary:'g18' },
  { primary:'famas',  secondary:'usp' },
  { primary:'fal',    secondary:'deagle' },
  { primary:'mp5k',   secondary:'usp' },
  { primary:'ump45',  secondary:'spas12' },
  { primary:'vector', secondary:'g18' },
  { primary:'p90',    secondary:'usp' },
  { primary:'rpd',    secondary:'deagle' },
  { primary:'r870',   secondary:'usp' },
  { primary:'aa12',   secondary:'g18' },
  { primary:'intervention', secondary:'usp' },
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
