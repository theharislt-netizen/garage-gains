#!/usr/bin/env node
/**
 * Direct swipe-up must pick up well before 70% of card height.
 * Preview-hold still requires 70% to hand off into carry.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(join('/tmp', 'package.json'));
const puppeteer = require('puppeteer-core');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 8799;
const artifacts = '/cursor/stores/self/artifacts';
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

const origin = 'http://127.0.0.1:' + port;
const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.setDefaultNavigationTimeout(20000);
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('palaceCards_v1::swipe', JSON.stringify({
    app: 'palace',
    format: 1,
    profile: { name: 'Alex', photo: '', border: null, id: 'SWIPE1', nameSet: true },
    coins: 400,
    xp: 0,
    lastDailyLogin: '2099-01-01',
    inventory: { items: [], shards: { cosmetic: 0 }, stones: { cosmetic: 0 } },
    equipped: { cardSkin: null, tableTheme: null, emote: null, chatBubble: null, profileBorder: null },
    friends: [],
    settings: { theme: 'rig', sfx: 0, music: 0, notifications: false, language: 'en' },
    stats: { matches: 0, wins: 0 },
    shopTab: 'skins',
    invFilter: 'all',
    unlocks: { medium: 0, hard: -1, expert: -1 },
    cosmeticsSeeded: true,
  }));
});
await page.goto(origin + '/?as=swipe', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.PalaceEngine && typeof startMatch === 'function');
await page.evaluate(() => {
  startMatch({ mode: 'practice', practiceSub: 'duel', seats: 2, difficulty: 'Easy', buyIn: 0 });
});
await page.waitForFunction(() => document.querySelectorAll('#humanHand .pcard').length >= 1, { timeout: 15000 });
await page.evaluate(() => {
  const start = Date.now();
  const wait = () => {
    if (!uiBusy || Date.now() - start > 8000) return;
    return new Promise((r) => setTimeout(r, 50)).then(wait);
  };
  return wait();
});
await page.evaluate(() => {
  match.turn = match.humanSeat;
  match.phase = 'playing';
  const you = match.players[match.humanSeat];
  you.hand = [
    { id: '4H', rank: '4', suit: 'H' },
    { id: '7C', rank: '7', suit: 'C' },
  ];
  match.pile = [{ id: '3C', rank: '3', suit: 'C' }];
  uiBusy = false;
  renderTable();
});
await page.waitForFunction(() => document.querySelector('#humanHand .pcard[data-id="4H"]'));

async function fire(kind, target, x, y) {
  await page.evaluate((kind, sel, x, y) => {
    const el = kind === 'down' ? document.querySelector(sel) : document;
    el.dispatchEvent(new PointerEvent(kind === 'down' ? 'pointerdown' : kind === 'move' ? 'pointermove' : 'pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: 42,
      pointerType: 'touch',
      buttons: kind === 'up' ? 0 : 1,
      clientX: x,
      clientY: y,
    }));
  }, kind, target, x, y);
}

const pt = await page.evaluate(() => {
  const el = document.querySelector('#humanHand .pcard[data-id="4H"]');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height, direct: DIRECT_CARRY_PX, preview: PREVIEW_LIFT_RATIO };
});

function stateOf() {
  return page.evaluate(() => ({
    carrying: !!(gesture && gesture.carrying),
    browsing: !!(gesture && gesture.browsing),
    follow: !!document.querySelector('.fly-card.drag-follow'),
  }));
}

await fire('down', '#humanHand .pcard[data-id="4H"]', pt.x, pt.y);
await fire('move', '', pt.x, pt.y - 16);
await fire('move', '', pt.x, pt.y - 30);
const afterDirect = await stateOf();
await page.screenshot({ path: join(artifacts, 'palace_direct_swipe_pickup.png'), type: 'png' });
await fire('up', '', pt.x, pt.y - 30);
await page.waitForFunction(() => !gesture, { timeout: 4000 }).catch(() => {});

await page.evaluate(() => { uiBusy = false; selectedIds = []; renderTable(); });
await page.waitForFunction(() => document.querySelector('#humanHand .pcard[data-id="4H"]'));

const pt2 = await page.evaluate(() => {
  const el = document.querySelector('#humanHand .pcard[data-id="4H"]');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
});
await fire('down', '#humanHand .pcard[data-id="4H"]', pt2.x, pt2.y);
await page.waitForFunction(() => !!(gesture && gesture.browsing), { timeout: 2000 });
const midPreview = await page.evaluate((x, y) => {
  document.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, cancelable: true, pointerId: 42, pointerType: 'touch', buttons: 1, clientX: x, clientY: y,
  }));
  return {
    carrying: !!(gesture && gesture.carrying),
    browsing: !!(gesture && gesture.browsing),
    follow: !!document.querySelector('.fly-card.drag-follow'),
  };
}, pt2.x, pt2.y - 30);
await page.screenshot({ path: join(artifacts, 'palace_preview_30px_still_hold.png'), type: 'png' });
const previewLift = Math.ceil(pt2.h * pt.preview);
const afterPreview = await page.evaluate((x, y) => {
  document.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, cancelable: true, pointerId: 42, pointerType: 'touch', buttons: 1, clientX: x, clientY: y,
  }));
  return {
    carrying: !!(gesture && gesture.carrying),
    browsing: !!(gesture && gesture.browsing),
    follow: !!document.querySelector('.fly-card.drag-follow'),
  };
}, pt2.x, pt2.y - previewLift);
await page.screenshot({ path: join(artifacts, 'palace_preview_70_handoff.png'), type: 'png' });
await fire('up', '', pt2.x, pt2.y - previewLift);

const report = {
  ok: afterDirect.carrying && afterDirect.follow && !midPreview.carrying && midPreview.browsing && afterPreview.carrying,
  cardH: pt.h,
  directPx: pt.direct,
  previewRatio: pt.preview,
  afterDirect,
  midPreview,
  afterPreview,
  previewLift,
};
await writeFile(join(artifacts, 'palace_direct_swipe_carry.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
if (!report.ok) process.exit(1);
