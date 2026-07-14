const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync('js/weapons.js', 'utf8'), context, { filename: 'js/weapons.js' });
const mainSource = fs.readFileSync('js/main.js', 'utf8');

function run(source) {
  return vm.runInContext(source, context);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const data = plain(run(`({
  weapons: WEAPONS,
  attachments: ATTACHMENTS,
  perks: PERKS,
  unlockTable: UNLOCK_TABLE,
  defaultClasses: DEFAULT_CLASSES,
  botLoadouts: BOT_LOADOUTS,
})`));

for (const [key, weapon] of Object.entries(data.weapons)) {
  assert.strictEqual(weapon.key, key, `${key} should carry its own key`);
  assert.ok(['primary', 'secondary'].includes(weapon.slot), `${key} should have a valid slot`);
  assert.ok(weapon.cat && weapon.name && weapon.model, `${key} should have display/model metadata`);
  assert.ok(weapon.dmg > 0 && weapon.minDmg > 0 && weapon.rpm > 0, `${key} should have positive damage/rpm`);
  assert.ok(weapon.mag > 0 && weapon.reserve >= 0 && weapon.reload >= 0, `${key} should have sane ammo/reload`);
  assert.ok(Array.isArray(weapon.range) && weapon.range.length === 2 && weapon.range[0] <= weapon.range[1], `${key} should have valid range`);
  assert.ok(weapon.speed > 0 && weapon.speed <= 1.05, `${key} should have sane movement speed`);
  assert.ok(weapon.spreadHip >= 0 && weapon.spreadAds >= 0 && weapon.recoil >= 0 && weapon.bloom >= 0, `${key} should have sane handling`);
}

for (const loadout of data.botLoadouts) {
  assert.ok(data.weapons[loadout.primary], `bot primary ${loadout.primary} should exist`);
  assert.strictEqual(data.weapons[loadout.primary].slot, 'primary', `bot primary ${loadout.primary} should be primary`);
  assert.ok(data.weapons[loadout.secondary], `bot secondary ${loadout.secondary} should exist`);
  assert.strictEqual(data.weapons[loadout.secondary].slot, 'secondary', `bot secondary ${loadout.secondary} should be secondary`);
  assert.ok(loadout.lethal === null || loadout.lethal === 'frag', `bot lethal ${loadout.lethal} should be supported`);
}

const gatedBotPrimaries = data.botLoadouts
  .map(loadout => loadout.primary)
  .filter(id => data.weapons[id] && data.weapons[id].unlockLevel > 1);
assert.ok(gatedBotPrimaries.includes('scar'), 'bot pool should keep gated weapons independent of player unlock gates');
assert.ok(gatedBotPrimaries.includes('p90'), 'bot pool should keep late-game weapons available to AI');

const unlockRefs = {
  weapon: id => !!data.weapons[id],
  attachment: id => !!data.attachments[id],
  camo: id => !!data.attachments[id] && data.attachments[id].slot === 'camo',
  perk: id => Object.values(data.perks).some(tier => tier.some(perk => perk.id === id)),
  throwable: id => ['smoke', 'semtex'].includes(id),
  killstreak: id => ['cuav', 'airstrike'].includes(id),
};
for (const row of data.unlockTable) {
  assert.ok(row.level >= 2 && row.level <= 20, `${row.id} unlock level should be 2-20`);
  assert.ok(unlockRefs[row.pool], `${row.id} should use a known unlock pool`);
  assert.ok(unlockRefs[row.pool](row.id), `${row.id} should resolve in ${row.pool} pool`);
}

const unlockLevels = data.unlockTable.map(row => row.level);
assert.deepStrictEqual(unlockLevels, [...new Set(unlockLevels)], 'unlock table should have one reward per level');
assert.strictEqual(Math.min(...unlockLevels), 2, 'unlock table should start at Level 2');
assert.strictEqual(Math.max(...unlockLevels), 20, 'unlock table should end at Level 20');

const resolved = plain(run(`({
  baseM4: resolveWeaponDef('m4a1', []),
  redDotM4: resolveWeaponDef('m4a1', ['reddot']),
  holoM4: resolveWeaponDef('m4a1', ['holo']),
  acogM4: resolveWeaponDef('m4a1', ['acog']),
  suppressorM4: resolveWeaponDef('m4a1', ['suppressor']),
  extMagM4: resolveWeaponDef('m4a1', ['extmags']),
  quickdrawM4: resolveWeaponDef('m4a1', ['quickdraw']),
  goldM4: resolveWeaponDef('m4a1', ['camoGold']),
})`));

assert.ok(resolved.redDotM4.adsTime < resolved.baseM4.adsTime, 'red dot should improve ADS time');
assert.ok(resolved.holoM4.spreadAds < resolved.baseM4.spreadAds, 'holo should improve ADS spread');
assert.ok(resolved.acogM4.zoom > resolved.baseM4.zoom && resolved.acogM4.adsTime > resolved.baseM4.adsTime, 'ACOG should trade zoom for slower ADS');
assert.ok(resolved.suppressorM4.suppressed, 'suppressor should mark resolved weapon suppressed');
assert.ok(resolved.suppressorM4.range[0] < resolved.baseM4.range[0] && resolved.suppressorM4.range[1] < resolved.baseM4.range[1], 'suppressor should shorten range');
assert.ok(resolved.extMagM4.mag > resolved.baseM4.mag && resolved.extMagM4.reload > resolved.baseM4.reload, 'extended mags should increase mag and reload time');
assert.ok(resolved.quickdrawM4.adsTime < resolved.baseM4.adsTime && resolved.quickdrawM4.spreadAds > resolved.baseM4.spreadAds, 'quickdraw should trade ADS speed for ADS spread');
assert.strictEqual(resolved.goldM4.dmg, resolved.baseM4.dmg, 'camo should not change damage');
assert.strictEqual(resolved.goldM4.mag, resolved.baseM4.mag, 'camo should not change magazine');

const roleChecks = plain(run(`({
  aa12: WEAPONS.aa12,
  r870: WEAPONS.r870,
  mac10: WEAPONS.mac10,
  p90: WEAPONS.p90,
  f2000: WEAPONS.f2000,
  m60: WEAPONS.m60,
  mg4: WEAPONS.mg4,
  m9: WEAPONS.m9,
  deagle: WEAPONS.deagle,
})`));

assert.strictEqual(roleChecks.aa12.mode, 'auto', 'AA-12 should be the automatic shotgun');
assert.ok(roleChecks.aa12.range[1] < roleChecks.r870.range[1], 'AA-12 should have shorter reach than the pump shotgun');
assert.ok(roleChecks.mac10.rpm > roleChecks.p90.rpm, 'MAC-10 should own the SMG hose role');
assert.ok(roleChecks.f2000.rpm > data.weapons.m4a1.rpm, 'F2000 should own high-RPM AR role');
assert.ok(roleChecks.m60.mag > roleChecks.mg4.mag && roleChecks.m60.speed < roleChecks.mg4.speed, 'M60 should trade huge belt for mobility');
assert.ok(roleChecks.m9.recoil < roleChecks.deagle.recoil && roleChecks.m9.mag > roleChecks.deagle.mag, 'M9 should be the forgiving pistol');
assert.ok(mainSource.includes('const penetrates = def.zoom > 3;'), 'collateral penetration should follow high-zoom sniper optics, not weapon category');

for (const cls of data.defaultClasses) {
  const sanitized = plain(run(`sanitizeClassForLevel(${JSON.stringify(cls)}, 1)`));
  assert.strictEqual(sanitized.primary, cls.primary, `${cls.name} primary should be legal at Level 1`);
  assert.strictEqual(sanitized.secondary, cls.secondary, `${cls.name} secondary should be legal at Level 1`);
  assert.deepStrictEqual(sanitized.perks, cls.perks, `${cls.name} perks should be legal at Level 1`);
  assert.strictEqual(sanitized.lethal, cls.lethal, `${cls.name} lethal should be legal at Level 1`);
  assert.strictEqual(sanitized.tactical, cls.tactical, `${cls.name} tactical should be legal at Level 1`);
  assert.deepStrictEqual(sanitized.killstreaks, cls.killstreaks, `${cls.name} streaks should be legal at Level 1`);
  assert.deepStrictEqual(sanitized.attachments.primary, cls.attachments.primary, `${cls.name} primary attachments should be legal at Level 1`);
  assert.deepStrictEqual(sanitized.attachments.secondary, cls.attachments.secondary, `${cls.name} secondary attachments should be legal at Level 1`);
}

console.log('arsenal-static.test.js passed');
