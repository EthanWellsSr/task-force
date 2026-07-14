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

      return { fresh, near, nearEnd, multiEnd, capEnd, corruptedClass };
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

    const modes = await page.evaluate(async () => {
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
      return { snapshots, stats: Profile.load().stats, afterLiveQuits, afterPausedQuit };
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
