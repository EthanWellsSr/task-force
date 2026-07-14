const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function makeContext() {
  const store = new Map();
  return vm.createContext({
    console,
    localStorage: {
      getItem: key => store.has(key) ? store.get(key) : null,
      setItem: (key, val) => { store.set(key, String(val)); },
      removeItem: key => { store.delete(key); },
    },
  });
}

function loadScript(context, path) {
  vm.runInContext(fs.readFileSync(path, 'utf8'), context, { filename: path });
}

function run(context, source) {
  return vm.runInContext(source, context);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const context = makeContext();
loadScript(context, 'js/weapons.js');
loadScript(context, 'js/profile.js');
const mainSource = fs.readFileSync('js/main.js', 'utf8');
const uiSource = fs.readFileSync('js/ui.js', 'utf8');
const htmlSource = fs.readFileSync('index.html', 'utf8');

run(context, `
  var THROWABLES = {
    frag: { name:'FRAG', slot:'lethal', count:2, unlockLevel:1 },
    semtex: { name:'SEMTEX', slot:'lethal', count:1, unlockLevel:15 },
    stun: { name:'STUN', slot:'tactical', count:2, unlockLevel:1 },
    smoke: { name:'SMOKE', slot:'tactical', count:1, unlockLevel:5 }
  };
  var KILLSTREAKS = {
    uav: { id:'uav', name:'UAV', kills:5, selectable:true, unlockLevel:1 },
    cuav: { id:'cuav', name:'COUNTER-UAV', kills:4, selectable:true, unlockLevel:12 },
    carepackage: { id:'carepackage', name:'CARE PACKAGE', kills:6, selectable:true, unlockLevel:1 },
    airstrike: { id:'airstrike', name:'PRECISION AIRSTRIKE', kills:8, selectable:true, unlockLevel:18 },
    napalm: { id:'napalm', name:'NAPALM STRIKE', kills:10, selectable:true, unlockLevel:1 },
    nuke: { id:'nuke', name:'TACTICAL NUKE', kills:25, selectable:false, special:true, unlockLevel:1 }
  };
  var KILLSTREAK_ORDER = ['cuav','uav','carepackage','airstrike','napalm','nuke'];
`);

assert.strictEqual(run(context, 'Profile._selfTest()'), true, 'Profile self-test should pass');

assert.deepStrictEqual(
  plain(run(context, `
    Profile.normalize({ level: 20, xp: 0, stats: { kills: 2 } });
  `)),
  {
    version: 1,
    level: 1,
    xp: 0,
    prestige: 0,
    stats: {
      matchesPlayed: 0, wins: 0, losses: 0, quits: 0,
      kills: 2, deaths: 0, assists: 0, headshots: 0,
      meleeKills: 0, killstreakKills: 0, nukesCalled: 0,
      totalXpEarned: 0,
    },
  },
  'Profile.normalize should derive level from total XP'
);

const sanitized = plain(run(context, `
  sanitizeClassForLevel({
    name:'CORRUPT',
    primary:'barrett',
    secondary:'deagle',
    perks:['hardline','coldblooded','ninja'],
    lethal:'semtex',
    tactical:'smoke',
    killstreaks:['cuav','airstrike','napalm'],
    attachments:{ primary:['reddot','holo','camoGold'], secondary:['camoGold'] }
  }, 1);
`));

assert.strictEqual(sanitized.primary, 'intervention', 'locked sniper should fall back within category');
assert.strictEqual(sanitized.secondary, 'usp', 'locked handgun should fall back to starter handgun');
assert.deepStrictEqual(sanitized.perks, ['soh', 'stopping', 'steadyaim'], 'locked perks should fall back by tier');
assert.strictEqual(sanitized.lethal, 'frag', 'locked lethal should fall back to starter lethal');
assert.strictEqual(sanitized.tactical, 'stun', 'locked tactical should fall back to starter tactical');
assert.deepStrictEqual(sanitized.killstreaks, ['napalm'], 'locked streaks should be pruned while legal picks remain');
assert.deepStrictEqual(sanitized.attachments.primary, [], 'locked attachments/camos should be pruned');
assert.deepStrictEqual(sanitized.attachments.secondary, [], 'locked secondary camos should be pruned');

const invalidWeaponClass = plain(run(context, `
  sanitizeClassForLevel({
    name:'BAD WEAPONS',
    primary:'missing_primary',
    secondary:'missing_secondary',
    perks:['soh','stopping','steadyaim'],
    lethal:'frag',
    tactical:'stun',
    killstreaks:['uav','carepackage','napalm'],
    attachments:{ primary:['reddot'], secondary:['camoGold'] }
  }, 1);
`));

assert.strictEqual(invalidWeaponClass.primary, 'm4a1', 'invalid primary id should fall back to starter primary');
assert.strictEqual(invalidWeaponClass.secondary, 'usp', 'invalid secondary id should fall back to starter secondary');
assert.deepStrictEqual(invalidWeaponClass.attachments.primary, [], 'invalid primary attachments should be pruned after fallback');
assert.deepStrictEqual(invalidWeaponClass.attachments.secondary, [], 'invalid secondary attachments should be pruned after fallback');

assert.deepStrictEqual(
  plain(run(context, `
    sanitizeClassForLevel({
      name:'LOCKED STREAKS',
      primary:'m4a1',
      secondary:'usp',
      perks:['soh','stopping','steadyaim'],
      lethal:'frag',
      tactical:'stun',
      killstreaks:['cuav','airstrike'],
      attachments:{ primary:[], secondary:[] }
    }, 1).killstreaks;
  `)),
  ['uav', 'carepackage', 'napalm'],
  'All-locked streak picks should fall back to starter defaults'
);

assert.deepStrictEqual(
  plain(run(context, `UNLOCK_TABLE.filter(row => row.level > 1 && row.level <= 4).map(row => row.name);`)),
  ['RED DOT SIGHT', 'HK UMP45', 'MARATHON'],
  'Multi-level unlock summaries should include every crossed unlock'
);

assert.deepStrictEqual(
  plain(run(context, `UNLOCK_TABLE.filter(row => row.level > 20 && row.level <= Profile.LEVEL_CAP).map(row => row.name);`)),
  [],
  'Level cap should not produce phantom unlock rows'
);

assert.deepStrictEqual(
  plain(run(context, `
    const near = {
      l1: Profile.levelFromTotalXp(Math.max(0, Profile.xpThreshold(2) - 1)),
      l1Xp: Math.max(0, Profile.xpThreshold(2) - 1),
      capLevel: Profile.levelFromTotalXp(Profile.xpThreshold(Profile.LEVEL_CAP)),
      capXp: Profile.xpThreshold(Profile.LEVEL_CAP)
    };
    near;
  `)),
  { l1: 1, l1Xp: 499, capLevel: 20, capXp: 52250 },
  'Near-level dev math should land just below the next level and stay sane at cap'
);

assert.ok(
  mainSource.includes("G.state === 'paused') Profile.onQuit()"),
  'Pause-menu quit should count as a quit'
);
assert.ok(
  htmlSource.includes('id="devNearLevel"') && uiSource.includes("this.$('devNearLevel').onclick"),
  'Near-level dev tool should be present and wired'
);

console.log('progression-static.test.js passed');
