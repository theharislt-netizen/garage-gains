#!/usr/bin/env node
/**
 * Android back must pop PALACE screens instead of exiting the app.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(join('/tmp', 'package.json'));
const puppeteer = require('puppeteer-core');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = '/opt/cursor/artifacts';
const port = 8812;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let rel = url === '/' ? 'card-game.html' : url.replace(/^\//, '');
  if (rel.includes('..')) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(join(root, rel));
    res.writeHead(200, { 'Content-Type': mime[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));
await mkdir(artifacts, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.setDefaultNavigationTimeout(20000);
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('palaceCards_v1::back', JSON.stringify({
    app: 'palace', format: 1,
    profile: { name: 'Alex', photo: '', border: null, id: 'BACK1', nameSet: true },
    coins: 400, xp: 0, lastDailyLogin: '2099-01-01',
    inventory: { items: [], shards: { cosmetic: 0 }, stones: { cosmetic: 0 } },
    equipped: { cardSkin: null, tableTheme: null, emote: null, chatBubble: null, profileBorder: null },
    friends: [],
    settings: { theme: 'rig', sfx: 0, music: 0, notifications: false, language: 'en' },
    stats: { matches: 0, wins: 0 }, shopTab: 'skins', invFilter: 'all',
    unlocks: { medium: 0, hard: -1, expert: -1 }, cosmeticsSeeded: true,
  }));
});
await page.goto('http://127.0.0.1:' + port + '/?as=back', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof handleAppBack === 'function' && typeof openMode === 'function');

function snap() {
  return page.evaluate(() => ({
    view: currentViewId(),
    mode: layerOpen('modeOverlay'),
    lobby: layerOpen('lobbyOverlay'),
    join: layerOpen('joinOverlay'),
    profile: layerOpen('profileOverlay'),
    enchant: layerOpen('enchantWindow'),
    craft: layerOpen('craftWindow'),
    table: !!(document.getElementById('tableWindow') && document.getElementById('tableWindow').classList.contains('show')),
    inMatch: document.body.classList.contains('in-match'),
    toast: (document.getElementById('toast') && document.getElementById('toast').textContent) || '',
    stack: tabStack.slice(),
  }));
}

const firstHome = await page.evaluate(() => handleAppBack());
const home1 = await snap();
await page.screenshot({ path: join(artifacts, 'back_home_toast.png'), type: 'png' });
const secondHome = await page.evaluate(() => handleAppBack());

await page.evaluate(() => showView('shop'));
const shopOpen = await snap();
const shopBack = await page.evaluate(() => handleAppBack());
const afterShop = await snap();

await page.evaluate(() => { showView('shop'); showView('inventory'); });
const invOpen = await snap();
await page.evaluate(() => handleAppBack());
const invToShop = await snap();
await page.evaluate(() => handleAppBack());
const invToHome = await snap();

await page.evaluate(() => openMode('practice'));
const modeOpen = await snap();
await page.screenshot({ path: join(artifacts, 'back_mode_open.png'), type: 'png' });
await page.evaluate(() => handleAppBack());
const modeClosed = await snap();
await page.screenshot({ path: join(artifacts, 'back_mode_to_home.png'), type: 'png' });

await page.evaluate(() => openMode('practice'));
await page.waitForSelector('#startPracticeBtn');
await page.click('#startPracticeBtn');
await page.waitForFunction(() => layerOpen('lobbyOverlay'));
const lobbyOpen = await snap();
await page.screenshot({ path: join(artifacts, 'back_lobby_open.png'), type: 'png' });
await page.evaluate(() => handleAppBack());
const lobbyToMode = await snap();
await page.screenshot({ path: join(artifacts, 'back_lobby_to_mode.png'), type: 'png' });
await page.evaluate(() => handleAppBack());
const lobbyToHome = await snap();

await page.evaluate(() => openJoin());
const joinOpen = await snap();
await page.evaluate(() => handleAppBack());
const joinClosed = await snap();

await page.evaluate(() => openProfile());
const profileOpen = await snap();
await page.evaluate(() => handleAppBack());
const profileClosed = await snap();

await page.evaluate(() => { showView('inventory'); openEnchant(); });
const enchantOpen = await snap();
await page.evaluate(() => handleAppBack());
const enchantClosed = await snap();

await page.evaluate(() => openCraft());
const craftOpen = await snap();
await page.evaluate(() => handleAppBack());
const craftClosed = await snap();

page.once('dialog', (d) => d.dismiss());
await page.evaluate(() => startMatch({ mode: 'practice', practiceSub: 'duel', seats: 2, difficulty: 'Easy', buyIn: 0 }));
await page.waitForFunction(() => document.body.classList.contains('in-match'));
const matchOpen = await snap();
const matchStay = await page.evaluate(() => handleAppBack());
const stillMatch = await snap();
await page.screenshot({ path: join(artifacts, 'back_match_confirm_stay.png'), type: 'png' });

page.once('dialog', (d) => d.accept());
const matchLeave = await page.evaluate(() => handleAppBack());
const afterMatch = await snap();
await page.screenshot({ path: join(artifacts, 'back_match_left_home.png'), type: 'png' });

const report = {
  ok: firstHome === 'stay' && /exit/i.test(home1.toast) && secondHome === 'exit'
    && shopOpen.view === 'shop' && shopBack === 'stay' && afterShop.view === 'home'
    && invOpen.view === 'inventory' && invToShop.view === 'shop' && invToHome.view === 'home'
    && modeOpen.mode && !modeClosed.mode && modeClosed.view === 'home'
    && lobbyOpen.lobby && lobbyOpen.mode && !lobbyToMode.lobby && lobbyToMode.mode && !lobbyToHome.mode
    && joinOpen.join && !joinClosed.join
    && profileOpen.profile && !profileClosed.profile
    && enchantOpen.enchant && !enchantClosed.enchant && enchantClosed.view === 'inventory'
    && craftOpen.craft && !craftClosed.craft
    && matchOpen.inMatch && matchStay === 'stay' && stillMatch.inMatch
    && matchLeave === 'stay' && !afterMatch.inMatch && !afterMatch.table,
  firstHome, secondHome, home1, shopOpen, afterShop, invOpen, invToShop, invToHome,
  modeOpen, modeClosed, lobbyOpen, lobbyToMode, lobbyToHome, joinOpen, joinClosed,
  profileOpen, profileClosed, enchantOpen, enchantClosed, craftOpen, craftClosed,
  matchOpen, matchStay, stillMatch, matchLeave, afterMatch,
};
await writeFile(join(artifacts, 'android_back_nav.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
if (!report.ok) process.exit(1);
