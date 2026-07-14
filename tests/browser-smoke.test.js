const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

function requirePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_REQUIRE,
    path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),
    'playwright',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (e) {}
  }
  throw new Error('Playwright is required. Set PLAYWRIGHT_REQUIRE to its module path.');
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  const found = candidates.find(file => fs.existsSync(file));
  if (!found) throw new Error('Chrome/Chromium is required. Set CHROME_EXECUTABLE to a browser binary.');
  return found;
}

function contentType(file) {
  const ext = path.extname(file);
  return {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
  }[ext] || 'application/octet-stream';
}

function startServer(root) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'content-type': contentType(file) });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function expectedBrowserNoise(text) {
  return text.includes('favicon.ico') ||
    text.includes('404') ||
    text.includes('pointer lock') ||
    text.includes('root document');
}

async function run() {
  const { chromium } = requirePlaywright();
  const root = process.cwd();
  const server = await startServer(root);
  const port = server.address().port;
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromeExecutable(),
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' && !expectedBrowserNoise(text)) errors.push(text);
    });
    page.on('pageerror', err => {
      if (!expectedBrowserNoise(err.message)) errors.push(err.message);
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    const progression = await page.evaluate(() => {
      const text = id => document.getElementById(id)?.textContent || '';
      window.localStorage.clear();
      Profile.reset();
      UI.loadClasses();
      UI.renderProfileBadge();
      const fresh = {
        badge: text('menuBadge'),
        profile: Profile.load(),
        classes: UI.classes.map(c => ({
          name: c.name,
          primary: c.primary,
          secondary: c.secondary,
          perks: c.perks.slice(),
          lethal: c.lethal,
          tactical: c.tactical,
          killstreaks: c.killstreaks.slice(),
        })),
      };

      let p = Profile.load();
      p.xp = Profile.xpThreshold(2) - 1;
      p.level = Profile.levelFromTotalXp(p.xp);
      Profile.save(p);
      UI.renderProfileBadge();
      const near = { badge: text('menuBadge'), profile: Profile.load() };
      Profile.resetMatch();
      Profile.MatchXP.onDirectKill();
      const nearCommit = Profile.commitMatch('draw');
      UI.renderEndXp(nearCommit);
      const nearEnd = {
        levelText: document.querySelector('#endXp .xp-level')?.textContent || '',
        unlocks: [...document.querySelectorAll('#endXp .xp-unlock')].map(el => el.textContent),
        progress: document.querySelector('#endXp .xp-progress')?.textContent || '',
        profile: Profile.load(),
      };

      Profile.reset();
      p = Profile.load();
      p.xp = Profile.xpThreshold(2);
      p.level = Profile.levelFromTotalXp(p.xp);
      Profile.save(p);
      Profile.resetMatch();
      Profile.MatchXP.onNukeCalled();
      Profile.MatchXP.onNukeCalled();
      const multiCommit = Profile.commitMatch('loss');
      UI.renderEndXp(multiCommit);
      const multiEnd = {
        levelText: document.querySelector('#endXp .xp-level')?.textContent || '',
        unlocks: [...document.querySelectorAll('#endXp .xp-unlock')].map(el => el.textContent),
        profile: Profile.load(),
      };

      p = Profile.load();
      p.xp = Profile.xpThreshold(Profile.LEVEL_CAP);
      p.level = Profile.levelFromTotalXp(p.xp);
      Profile.save(p);
      Profile.resetMatch();
      Profile.MatchXP.onNukeCalled();
      const capCommit = Profile.commitMatch('win');
      UI.renderEndXp(capCommit);
      const capEnd = {
        levelText: document.querySelector('#endXp .xp-level')?.textContent || '',
        unlocks: [...document.querySelectorAll('#endXp .xp-unlock')].map(el => el.textContent),
        progress: document.querySelector('#endXp .xp-progress')?.textContent || '',
        profile: Profile.load(),
      };

      window.localStorage.setItem('tf_classes', JSON.stringify([
        { name:'BAD', primary:'missing_primary', secondary:'missing_secondary', perks:['hardline','coldblooded','ninja'], lethal:'semtex', tactical:'smoke', killstreaks:['cuav','airstrike'], attachments:{ primary:['reddot'], secondary:['camoGold'] } },
        ...DEFAULT_CLASSES.slice(1).map(c => JSON.parse(JSON.stringify(c))),
      ]));
      Profile.reset();
      UI.loadClasses();
      const corruptedClass = JSON.parse(JSON.stringify(UI.classes[0]));

      Profile.reset();
      UI.loadClasses();
      UI.editIdx = 0;
      UI.selectedClass = 0;
      UI.renderClassEditor();
      const lockedScar = [...document.querySelectorAll('#primaryList .weapon-item.locked')]
        .find(el => el.textContent.includes('FN SCAR-H'));
      const level1PrimaryBefore = UI.classes[0].primary;
      if (lockedScar) lockedScar.click();
      const level1Editor = {
        primaryBefore: level1PrimaryBefore,
        primaryAfterLockedClick: UI.classes[0].primary,
        lockedPrimaryCount: document.querySelectorAll('#primaryList .weapon-item.locked').length,
        lockedPerkCount: document.querySelectorAll('#perk1List .perk-item.locked, #perk2List .perk-item.locked, #perk3List .perk-item.locked').length,
        lockedEquipmentCount: document.querySelectorAll('#lethalList .weapon-item.locked, #tacticalList .weapon-item.locked').length,
        lockedStreakCount: document.querySelectorAll('#streakList .weapon-item.locked').length,
      };

      p = Profile.load();
      p.xp = Profile.xpThreshold(Profile.LEVEL_CAP);
      p.level = Profile.levelFromTotalXp(p.xp);
      Profile.save(p);
      UI.classes[0] = sanitizeClassForLevel({
        name:'MAXKIT',
        primary:'p90',
        secondary:'deagle',
        perks:['hardline','coldblooded','ninja'],
        lethal:'semtex',
        tactical:'smoke',
        killstreaks:['cuav','airstrike','napalm'],
        attachments:{ primary:['reddot','camoGold'], secondary:['camoGold'] },
      });
      UI.saveClasses();
      UI.loadClasses();
      UI.editIdx = 0;
      UI.selectedClass = 0;
      UI.renderClassEditor();
      UI.renderSpawnScreen();
      const editorText = document.getElementById('classScreen').textContent;
      const spawnText = document.getElementById('spawnClasses').textContent;
      MAIN.startMatch('rust', 'tdm');
      MAIN.deploy();
      const deployedMaxClass = {
        weapon: DEBUG.curW().def.key,
        weaponName: DEBUG.curW().def.name,
        attachments: DEBUG.curW().def.attachments || [],
        secondary: DEBUG.player.weapons[1].def.key,
        perks: [...DEBUG.player.perks],
        equip: DEBUG.player.equip,
        equipTac: DEBUG.player.equipTac,
        streaks: DEBUG.player.equippedStreakIds.slice(),
      };
      MAIN.quitMatch();
      const maxClass = JSON.parse(JSON.stringify(UI.classes[0]));
      const maxRender = { editorText, spawnText };

      return { fresh, near, nearEnd, multiEnd, capEnd, corruptedClass, level1Editor, maxClass, maxRender, deployedMaxClass };
    });

    assert.ok(progression.fresh.badge.includes('LVL 1'), 'fresh profile badge should show Level 1');
    assert.strictEqual(progression.fresh.profile.level, 1, 'fresh profile should be Level 1');
    assert.ok(progression.near.badge.includes('499 / 500 XP'), 'near-level tool should land 1 XP below Level 2');
    assert.ok(progression.nearEnd.levelText.includes('LVL 1') && progression.nearEnd.levelText.includes('LVL 2'), 'near-level payout should level up');
    assert.ok(progression.nearEnd.unlocks.some(t => t.includes('RED DOT SIGHT')), 'near-level payout should show Red Dot unlock');
    assert.ok(progression.multiEnd.levelText.includes('LVL 2') && progression.multiEnd.levelText.includes('LVL 4'), 'multi payout should jump Level 2 to 4');
    for (const label of ['HK UMP45', 'MARATHON'])
      assert.ok(progression.multiEnd.unlocks.some(t => t.includes(label)), `multi payout should show ${label}`);
    assert.ok(progression.capEnd.levelText.includes('LVL 20'), 'cap display should stay Level 20');
    assert.deepStrictEqual(progression.capEnd.unlocks, [], 'cap display should not show phantom unlocks');
    assert.strictEqual(progression.capEnd.progress, 'MAX LEVEL', 'cap progress should read MAX LEVEL');
    assert.strictEqual(progression.corruptedClass.primary, 'm4a1', 'bad primary should migrate to starter primary');
    assert.strictEqual(progression.corruptedClass.secondary, 'usp', 'bad secondary should migrate to starter secondary');
    assert.strictEqual(progression.level1Editor.primaryAfterLockedClick, progression.level1Editor.primaryBefore, 'Level 1 locked primary click should be inert');
    assert.ok(progression.level1Editor.lockedPrimaryCount > 0, 'Level 1 editor should render locked weapons');
    assert.ok(progression.level1Editor.lockedPerkCount > 0, 'Level 1 editor should render locked perks');
    assert.ok(progression.level1Editor.lockedEquipmentCount > 0, 'Level 1 editor should render locked equipment');
    assert.ok(progression.level1Editor.lockedStreakCount > 0, 'Level 1 editor should render locked streaks');
    assert.strictEqual(progression.maxClass.primary, 'p90', 'max class should persist P90');
    assert.strictEqual(progression.maxClass.secondary, 'deagle', 'max class should persist Deagle');
    assert.deepStrictEqual(progression.maxClass.perks, ['hardline', 'coldblooded', 'ninja'], 'max class should persist high-level perks');
    assert.strictEqual(progression.maxClass.lethal, 'semtex', 'max class should persist Semtex');
    assert.strictEqual(progression.maxClass.tactical, 'smoke', 'max class should persist Smoke');
    assert.deepStrictEqual(progression.maxClass.killstreaks, ['cuav', 'airstrike', 'napalm'], 'max class should persist high-level streaks');
    for (const label of ['FN P90', 'DESERT EAGLE', 'GOLD CAMO', 'SEMTEX', 'SMOKE', 'COUNTER-UAV', 'PRECISION AIRSTRIKE'])
      assert.ok(progression.maxRender.editorText.includes(label) || progression.maxRender.spawnText.includes(label), `max class render should include ${label}`);
    assert.strictEqual(progression.deployedMaxClass.weapon, 'p90', 'max class should deploy P90');
    assert.deepStrictEqual(progression.deployedMaxClass.attachments, ['reddot', 'camoGold'], 'max class should deploy primary optic and camo');
    assert.strictEqual(progression.deployedMaxClass.secondary, 'deagle', 'max class should deploy Deagle');
    assert.deepStrictEqual(progression.deployedMaxClass.perks, ['hardline', 'coldblooded', 'ninja'], 'max class should deploy high-level perks');
    assert.strictEqual(progression.deployedMaxClass.equip, 'semtex', 'max class should deploy Semtex');
    assert.strictEqual(progression.deployedMaxClass.equipTac, 'smoke', 'max class should deploy Smoke');
    for (const id of ['cuav', 'airstrike', 'napalm', 'nuke'])
      assert.ok(progression.deployedMaxClass.streaks.includes(id), `max class should deploy ${id} streak`);

    const modes = await page.evaluate(async () => {
      const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
      window.localStorage.clear();
      Profile.reset();
      UI.loadClasses();
      UI.settings.teamSize = 2;
      UI.settings.scoreLimit = 30;
      UI.settings.timeLimit = 300;
      const snapshots = [];
      for (const mode of ['tdm', 'ffa', 'gungame']) {
        MAIN.startMatch('rust', mode);
        MAIN.deploy();
        await new Promise(resolve => requestAnimationFrame(resolve));
        snapshots.push({
          mode,
          state: DEBUG.G.state,
          visible: [...document.querySelectorAll('.screen')].find(el => !el.classList.contains('hidden'))?.id,
          modeId: DEBUG.G.modeId,
          modeName: DEBUG.G.mode.name,
          structure: DEBUG.G.mode.structure,
          playerTeam: DEBUG.player.team,
          alive: DEBUG.player.alive,
          weapon: DEBUG.curW().def.key,
          weaponName: DEBUG.curW().def.name,
          perks: [...DEBUG.player.perks],
          equippedStreakIds: DEBUG.player.equippedStreakIds.slice(),
          equip: DEBUG.player.equip,
          equipTac: DEBUG.player.equipTac,
          botCount: DEBUG.G.bots.length,
          combatants: DEBUG.G.combatants.length,
          scores: JSON.parse(JSON.stringify(DEBUG.G.scores)),
        });
        MAIN.quitMatch();
      }
      const afterLiveQuits = Profile.load().stats.quits;
      MAIN.startMatch('rust', 'tdm');
      MAIN.deploy();
      DEBUG.G.state = 'paused';
      MAIN.quitMatch();
      const afterPausedQuit = Profile.load().stats.quits;
      const xpModes = [];
      for (const mode of ['tdm', 'ffa']) {
        Profile.reset();
        UI.settings.scoreLimit = 1;
        UI.settings.timeLimit = 300;
        MAIN.startMatch('rust', mode);
        MAIN.deploy();
        const target = DEBUG.G.bots.find(b => b.team !== DEBUG.player.team);
        if (!target.alive) target.spawn();
        target.spawnProtectT = 0;
        target.hurt(9999, DEBUG.player, DEBUG.curW().def.name, true, true);
        xpModes.push({
          mode,
          state: DEBUG.G.state,
          score: clone(DEBUG.G.scores),
          commit: clone(DEBUG.G.lastCommit),
          profile: Profile.load(),
        });
        MAIN.quitMatch();
      }

      Profile.reset();
      UI.classes[UI.selectedClass] = sanitizeClassForLevel({
        name:'LOCKED',
        primary:'barrett',
        secondary:'deagle',
        perks:['hardline','coldblooded','ninja'],
        lethal:'semtex',
        tactical:'smoke',
        killstreaks:['cuav','airstrike'],
        attachments:{ primary:['camoGold'], secondary:['camoGold'] },
      });
      UI.settings.scoreLimit = 30;
      MAIN.startMatch('rust', 'gungame');
      MAIN.deploy();
      const expectedLadder = ['m9', 'usp', 'deagle', 'g18', 'spas12', 'r870', 'aa12', 'mac10',
        'vector', 'ump45', 'm4a1', 'scar', 'fal', 'm60', 'intervention', 'tomahawk'];
      const ladderChecks = [];
      const ladderBot = DEBUG.G.bots.find(b => b.team !== DEBUG.player.team);
      if (!ladderBot.alive) ladderBot.spawn();
      for (let tier = 0; tier < expectedLadder.length; tier++) {
        DEBUG.player.tier = tier;
        setPlayerGunGameWeapon();
        UI.updateHud(DEBUG.player, DEBUG.curW().def, DEBUG.curW());
        const beforeSwitch = DEBUG.player.cur;
        DEBUG.switchWeapon(1);
        ladderBot.tier = tier;
        ladderBot.lethal = 'frag';
        ladderBot.grenLeft = 1;
        setBotGunGameWeapon(ladderBot);
        ladderChecks.push({
          tier,
          expected: expectedLadder[tier],
          playerWeapon: DEBUG.curW().def.key,
          hudWeapon: document.getElementById('weaponName').textContent,
          hudMag: document.getElementById('ammoMag').textContent,
          hudReserve: document.getElementById('ammoReserve').textContent,
          beforeSwitch,
          afterSwitch: DEBUG.player.cur,
          botWeapon: ladderBot.weapon.key,
          botLethal: ladderBot.lethal,
          botGrenLeft: ladderBot.grenLeft,
        });
      }
      DEBUG.player.tier = 11;
      setPlayerGunGameWeapon();
      const lockedTierWeapon = DEBUG.curW().def.key;
      DEBUG.player.tier = 999;
      const ggTarget = DEBUG.G.bots.find(b => b.team !== DEBUG.player.team);
      if (!ggTarget.alive) ggTarget.spawn();
      ggTarget.spawnProtectT = 0;
      ggTarget.hurt(9999, DEBUG.player, 'TOMAHAWK', false, true);
      const gunGameXp = {
        state: DEBUG.G.state,
        complete: DEBUG.player._gunGameComplete,
        lockedTierWeapon,
        ladderChecks,
        score: JSON.parse(JSON.stringify(DEBUG.G.scores)),
        commit: clone(DEBUG.G.lastCommit),
        profile: Profile.load(),
      };
      MAIN.quitMatch();

      const equipmentDeploy = [];
      const lethalIds = ['frag', 'semtex', 'c4', 'claymore', 'throwingknife'];
      const tacticalIds = ['stun', 'smoke', 'decoy', 'snapshot', 'flashbang'];
      Profile.reset();
      const maxProfile = Profile.load();
      maxProfile.xp = Profile.xpThreshold(Profile.LEVEL_CAP);
      maxProfile.level = Profile.LEVEL_CAP;
      Profile.save(maxProfile);
      for (const lethal of lethalIds) {
        for (const tactical of tacticalIds) {
          UI.classes[UI.selectedClass] = sanitizeClassForLevel({
            name:'EQUIP',
            primary:'m4a1',
            secondary:'usp',
            perks:['soh','stopping','steadyaim'],
            lethal,
            tactical,
            killstreaks:['uav','carepackage','napalm'],
            attachments:{ primary:[], secondary:[] },
          });
          MAIN.startMatch('rust', 'tdm');
          MAIN.deploy();
          equipmentDeploy.push({
            lethal,
            tactical,
            equip: DEBUG.player.equip,
            equipLeft: DEBUG.player.equipLeft,
            equipTac: DEBUG.player.equipTac,
            equipTacLeft: DEBUG.player.equipTacLeft,
          });
          MAIN.quitMatch();
        }
      }

      function enemyNear(dx = 4, dz = 0) {
        const bot = DEBUG.G.bots.find(b => b.team !== DEBUG.player.team);
        if (!bot.alive) bot.spawn();
        bot.pos.copy(DEBUG.player.pos).add(new THREE.Vector3(dx, 0, dz));
        bot.hp = 100;
        bot.alive = true;
        bot.spawnProtectT = 0;
        bot.stunT = 0;
        bot.blindT = 0;
        bot.pingedUntil = 0;
        return bot;
      }

      Profile.reset();
      MAIN.startMatch('rust', 'tdm');
      MAIN.deploy();
      const equipmentEffects = {};
      let bot = enemyNear();
      THROWABLES.frag.detonate({ def: THROWABLES.frag, pos: bot.pos.clone(), owner: DEBUG.player });
      equipmentEffects.fragKilled = !bot.alive;
      bot = enemyNear();
      THROWABLES.semtex.detonate({ def: THROWABLES.semtex, pos: bot.pos.clone(), owner: DEBUG.player, stuckTo: bot });
      equipmentEffects.semtexStuckKilled = !bot.alive;
      bot = enemyNear();
      THROWABLES.c4.detonate({ def: THROWABLES.c4, pos: bot.pos.clone(), owner: DEBUG.player });
      equipmentEffects.c4Killed = !bot.alive;
      bot = enemyNear(0.3, 0);
      THROWABLES.claymore.detonate({ def: THROWABLES.claymore, pos: DEBUG.player.pos.clone(), owner: DEBUG.player, facingX: 1, facingZ: 0 });
      equipmentEffects.claymoreKilled = !bot.alive;
      bot = enemyNear();
      THROWABLES.stun.detonate({ def: THROWABLES.stun, pos: bot.pos.clone(), owner: DEBUG.player });
      equipmentEffects.stunApplied = bot.stunT > 0;
      THROWABLES.smoke.detonate({ def: THROWABLES.smoke, pos: DEBUG.player.pos.clone(), owner: DEBUG.player });
      equipmentEffects.smokeClouds = DEBUG.smokeClouds().length;
      bot = enemyNear();
      THROWABLES.snapshot.detonate({ def: THROWABLES.snapshot, pos: bot.pos.clone(), owner: DEBUG.player });
      equipmentEffects.snapshotPinged = bot.pingedUntil > DEBUG.G.time;
      bot = enemyNear();
      THROWABLES.flashbang.detonate({ def: THROWABLES.flashbang, pos: bot.pos.clone(), owner: DEBUG.player });
      equipmentEffects.flashApplied = bot.blindT > 0;
      UI.classes[UI.selectedClass] = sanitizeClassForLevel({
        name:'KNIFE',
        primary:'m4a1',
        secondary:'usp',
        perks:['soh','stopping','steadyaim'],
        lethal:'throwingknife',
        tactical:'decoy',
        killstreaks:['uav','carepackage','napalm'],
        attachments:{ primary:[], secondary:[] },
      });
      MAIN.startMatch('rust', 'tdm');
      MAIN.deploy();
      const beforeKnife = DEBUG.tomahawks().length;
      DEBUG.throwEquipment('lethal');
      const afterKnife = DEBUG.tomahawks().length;
      DEBUG.player.throwT = 0;
      DEBUG.throwEquipment('tactical');
      const decoyOut = DEBUG.throwables().some(t => t.def && t.def.decoy);
      equipmentEffects.throwingKnifeSpawned = afterKnife > beforeKnife;
      equipmentEffects.decoySpawned = decoyOut;
      MAIN.quitMatch();

      return { snapshots, stats: Profile.load().stats, afterLiveQuits, afterPausedQuit, xpModes, gunGameXp, equipmentDeploy, equipmentEffects };
    });

    const byMode = Object.fromEntries(modes.snapshots.map(s => [s.mode, s]));
    for (const mode of ['tdm', 'ffa', 'gungame']) {
      assert.ok(['playing', 'paused'].includes(byMode[mode].state), `${mode} should deploy into a live state`);
      assert.strictEqual(byMode[mode].alive, true, `${mode} player should deploy alive`);
      assert.ok(byMode[mode].botCount > 0, `${mode} should spawn bots`);
    }
    assert.strictEqual(byMode.tdm.structure, 'teams', 'TDM should use team structure');
    assert.strictEqual(byMode.tdm.playerTeam, 'tf', 'TDM player should be Task Force');
    assert.strictEqual(byMode.ffa.structure, 'ffa', 'FFA should use FFA structure');
    assert.strictEqual(byMode.ffa.playerTeam, 'ffa0', 'FFA player should have ffa0 team id');
    assert.strictEqual(Object.keys(byMode.ffa.scores).length, 4, 'FFA should create one score entry per combatant');
    assert.strictEqual(byMode.gungame.weapon, 'm9', 'Gun Game should force M9 starter');
    assert.deepStrictEqual(byMode.gungame.perks, [], 'Gun Game should clear class perks');
    assert.deepStrictEqual(byMode.gungame.equippedStreakIds, [], 'Gun Game should clear class streaks');
    assert.strictEqual(byMode.gungame.equip, null, 'Gun Game should clear lethal equipment');
    assert.strictEqual(byMode.gungame.equipTac, null, 'Gun Game should clear tactical equipment');
    assert.strictEqual(modes.afterLiveQuits, 3, 'live quits should increment quit stat');
    assert.strictEqual(modes.afterPausedQuit, 4, 'paused quit should increment quit stat');
    for (const result of modes.xpModes) {
      assert.strictEqual(result.state, 'end', `${result.mode} should end at score limit`);
      assert.ok(result.commit && result.commit.xp.total > 0, `${result.mode} should commit XP`);
      assert.strictEqual(result.profile.stats.kills, 1, `${result.mode} should persist lifetime kill`);
      assert.strictEqual(result.profile.stats.totalXpEarned, result.commit.xp.total, `${result.mode} should persist earned XP`);
    }
    assert.strictEqual(modes.gunGameXp.state, 'end', 'Gun Game final kill should end the match');
    assert.strictEqual(modes.gunGameXp.complete, true, 'Gun Game final kill should mark player complete');
    assert.strictEqual(modes.gunGameXp.lockedTierWeapon, 'scar', 'Gun Game should force locked ladder weapons at Level 1');
    for (const check of modes.gunGameXp.ladderChecks) {
      assert.strictEqual(check.playerWeapon, check.expected, `player tier ${check.tier} should force ${check.expected}`);
      assert.ok(check.hudWeapon.length > 0, `player tier ${check.tier} should render a HUD weapon name`);
      assert.ok(Number(check.hudMag) >= 0, `player tier ${check.tier} should render current ammo`);
      assert.ok(Number(check.hudReserve) >= 0, `player tier ${check.tier} should render reserve ammo`);
      assert.strictEqual(check.beforeSwitch, 0, `player tier ${check.tier} should start on slot 0`);
      assert.strictEqual(check.afterSwitch, 0, `player tier ${check.tier} should lock weapon switching`);
      assert.strictEqual(check.botWeapon, check.expected, `bot tier ${check.tier} should force ${check.expected}`);
      assert.strictEqual(check.botLethal, null, `bot tier ${check.tier} should clear lethal`);
      assert.strictEqual(check.botGrenLeft, 0, `bot tier ${check.tier} should clear grenade count`);
    }
    assert.ok(modes.gunGameXp.commit && modes.gunGameXp.commit.xp.total > 0, 'Gun Game should commit XP');
    assert.strictEqual(modes.gunGameXp.profile.stats.kills, 1, 'Gun Game should persist lifetime kill');
    assert.strictEqual(modes.gunGameXp.profile.stats.totalXpEarned, modes.gunGameXp.commit.xp.total, 'Gun Game should persist earned XP');
    for (const row of modes.equipmentDeploy) {
      assert.strictEqual(row.equip, row.lethal, `${row.lethal}/${row.tactical} should deploy lethal`);
      assert.ok(row.equipLeft > 0, `${row.lethal} should deploy with count`);
      assert.strictEqual(row.equipTac, row.tactical, `${row.lethal}/${row.tactical} should deploy tactical`);
      assert.ok(row.equipTacLeft > 0, `${row.tactical} should deploy with count`);
    }
    assert.strictEqual(modes.equipmentEffects.fragKilled, true, 'frag should damage enemies through real detonate path');
    assert.strictEqual(modes.equipmentEffects.semtexStuckKilled, true, 'stuck semtex should kill through real detonate path');
    assert.strictEqual(modes.equipmentEffects.c4Killed, true, 'C4 should damage enemies through real detonate path');
    assert.strictEqual(modes.equipmentEffects.claymoreKilled, true, 'claymore should damage enemies in its frontal arc');
    assert.strictEqual(modes.equipmentEffects.stunApplied, true, 'stun should apply bot stun');
    assert.ok(modes.equipmentEffects.smokeClouds > 0, 'smoke should create a smoke cloud');
    assert.strictEqual(modes.equipmentEffects.snapshotPinged, true, 'snapshot should ping an enemy bot');
    assert.strictEqual(modes.equipmentEffects.flashApplied, true, 'flashbang should blind an enemy bot');
    assert.strictEqual(modes.equipmentEffects.throwingKnifeSpawned, true, 'throwing knife should spawn a thrown knife');
    assert.strictEqual(modes.equipmentEffects.decoySpawned, true, 'decoy should spawn a decoy throwable');
    assert.deepStrictEqual(errors, [], 'browser smoke should have no app console/page errors');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

run()
  .then(() => console.log('browser-smoke.test.js passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
