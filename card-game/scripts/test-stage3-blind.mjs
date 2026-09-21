#!/usr/bin/env node
/**
 * Opponent/bot Stage 3 cards must stay backs when they fold into hand.
 * Only a successful play may show the rank.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(join('/tmp', 'package.json'));
const puppeteer = require('puppeteer-core');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 8803;
const artifacts = '/opt/cursor/artifacts';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = decodeURIContent((req.url || '/').split('?')[0]);
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
function decodeURIContent(s) { return decodeURIComponent(s); }

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
page.on('pageerror', (err) => console.log('pageerror', err.message));
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('palaceCards_v1::blind', JSON.stringify({
    app: 'palace',
    format: 1,
    profile: { name: 'You', photo: '', border: null, id: 'BLIND1', nameSet: true },
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
await page.goto(origin + '/?as=blind', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.PalaceEngine && typeof startMatch === 'function');
await page.evaluate(() => {
  startMatch({ mode: 'practice', practiceSub: 'duel', seats: 2, difficulty: 'Easy', buyIn: 0 });
});
await page.waitForFunction(() => match && document.getElementById('tableWindow').classList.contains('show'), { timeout: 15000 });
await page.evaluate(() => {
  const start = Date.now();
  const wait = () => {
    if (!uiBusy || Date.now() - start > 8000) return;
    return new Promise((r) => setTimeout(r, 50)).then(wait);
  };
  return wait();
});

const markup = await page.evaluate(() => {
  const html = cardBackHtml('tiny slot-down', 'down-0');
  const box = document.createElement('div');
  box.innerHTML = html;
  const el = box.firstElementChild;
  return {
    html,
    childCount: box.children.length,
    className: el ? el.className : '',
    dataId: el ? el.getAttribute('data-id') : null,
    hasInner: !!(el && el.querySelector('.pc-back-inner')),
    hasRank: !!(el && el.querySelector('.pc-rank')),
    strayQuote: html.includes('"">'),
  };
});

const flights = await page.evaluate(async () => {
  match.draw = [];
  match.pile = [{ id: 'KH', rank: 'K', suit: 'H' }];
  match.turn = 1;
  match.phase = 'playing';
  match.ended = false;
  match.settled = false;
  match.humanSeat = 0;
  const you = match.players[0];
  const bot = match.players[1];
  you.isBot = false;
  you.hand = [{ id: '4C', rank: '4', suit: 'C' }];
  you.up = [];
  you.down = [
    { id: '3S', rank: '3', suit: 'S' },
    { id: '7D', rank: '7', suit: 'D' },
    { id: '9C', rank: '9', suit: 'C' },
  ];
  bot.isBot = true;
  bot.name = 'Dealer';
  bot.hand = [];
  bot.up = [];
  bot.down = [
    { id: '8H', rank: '8', suit: 'H' },
    { id: 'QD', rank: 'Q', suit: 'D' },
    { id: '4S', rank: '4', suit: 'S' },
  ];
  renderTable();
  const downs = [...document.querySelectorAll('#seat-1 .slot-down')].map((el) => ({
    className: el.className,
    hasRank: !!el.querySelector('.pc-rank'),
    hasBack: el.classList.contains('back'),
  }));
  const orig = flyArc;
  const seen = [];
  flyArc = (from, to, html, opts) => {
    seen.push({
      back: /pcard back/.test(html),
      rank: /pc-rank/.test(html),
      snippet: String(html).replace(/\s+/g, ' ').slice(0, 120),
    });
    return orig(from, to, html, opts);
  };
  const failEvents = PalaceEngine.applyMove(match, { type: 'flip', seat: 1, index: 0 });
  await animateEvents(failEvents);
  flyArc = orig;
  const afterFail = [...document.querySelectorAll('#seat-1 .pcard')].map((el) => ({
    className: el.className,
    hasRank: !!el.querySelector('.pc-rank'),
    hasBack: el.classList.contains('back'),
  }));
  return {
    failTypes: failEvents.map((e) => e.type + (e.private ? ':private' : '')),
    failFlights: seen,
    downsBefore: downs,
    afterFail,
    botHand: (match.players[1].hand || []).map((c) => c.id),
    botDown: (match.players[1].down || []).map((c) => c.id),
  };
});

await page.screenshot({ path: join(artifacts, 'stage3_bot_failed_flip_hidden.png') });

const winFlights = await page.evaluate(async () => {
  match.draw = [];
  match.pile = [{ id: '3C', rank: '3', suit: 'C' }];
  match.turn = 1;
  match.phase = 'playing';
  match.ended = false;
  match.settled = false;
  const bot = match.players[1];
  bot.isBot = true;
  bot.hand = [];
  bot.up = [];
  bot.down = [
    { id: 'QS', rank: 'Q', suit: 'S' },
    { id: '4D', rank: '4', suit: 'D' },
    { id: '7C', rank: '7', suit: 'C' },
  ];
  renderTable();
  const orig = flyArc;
  const seen = [];
  flyArc = (from, to, html, opts) => {
    seen.push({
      back: /pcard back/.test(html),
      rank: /pc-rank/.test(html),
      snippet: String(html).replace(/\s+/g, ' ').slice(0, 120),
    });
    return orig(from, to, html, opts);
  };
  const events = PalaceEngine.applyMove(match, { type: 'flip', seat: 1, index: 0 });
  await animateEvents(events);
  flyArc = orig;
  return {
    types: events.map((e) => e.type),
    flights: seen,
    pile: (match.pile || []).map((c) => c.id),
  };
});

await page.screenshot({ path: join(artifacts, 'stage3_bot_winning_flip_public.png') });

const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

must(markup.hasInner && !markup.hasRank && !markup.strayQuote && markup.dataId === 'down-0', 'stage 3 slot markup is a real back with a clean data-id');
must(markup.className.includes('back') && markup.className.includes('slot-down'), 'down slots keep the back class');
must(flights.downsBefore.length === 3 && flights.downsBefore.every((d) => d.hasBack && !d.hasRank), 'exposed opponent Stage 3 slots are backs, not ranks');
must(flights.failTypes.includes('flip') && flights.failTypes.includes('pickup:private'), 'failed bot flip folds privately into hand');
must(flights.failFlights.length > 0 && flights.failFlights.every((f) => f.back && !f.rank), 'failed bot Stage 3 fly animations never show a rank');
must(flights.botHand.includes('8H') && flights.botDown.length === 2, 'the failed blind sits in the bot hand, other blinds stay down');
must(winFlights.types.includes('play') && winFlights.flights.some((f) => f.rank), 'a winning bot flip is allowed to show the rank');
must(winFlights.pile.includes('QS'), 'the winning blind lands on the pile');

const report = { ok: fails.length === 0, fails, markup, flights, winFlights };
await writeFile(join(artifacts, 'stage3_blind_hide.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
server.close();
if (fails.length) process.exit(1);
