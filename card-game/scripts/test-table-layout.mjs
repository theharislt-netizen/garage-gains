#!/usr/bin/env node
/**
 * Phone-viewport layout checks for Stage 2-on-3 stacking.
 * Requires puppeteer-core + Chrome. Skipped automatically if either is missing.
 */
import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = process.env.LAYOUT_ARTIFACTS || '/opt/cursor/artifacts';
const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/card-game.html';
    const file = join(root, rel.replace(/^\//, ''));
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function resolvePuppeteer() {
  const require = createRequire(import.meta.url);
  const paths = [
    '/tmp/node_modules/puppeteer-core',
    join(root, 'node_modules/puppeteer-core'),
    'puppeteer-core',
  ];
  for (const p of paths) {
    try {
      return require(p);
    } catch {
      /* try next */
    }
  }
  return null;
}

function chromePath() {
  for (const p of ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium']) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function measure(page) {
  return page.evaluate(() => {
    const feltEl = document.getElementById('tableFelt');
    const felt = feltEl.getBoundingClientRect();
    const pad = 2;
    const spills = [];
    const noteSpill = (kind, id, r) => {
      if (r.left < felt.left - pad || r.right > felt.right + pad || r.top < felt.top - pad || r.bottom > felt.bottom + pad) {
        spills.push({
          kind, id,
          left: Math.round(r.left - felt.left),
          right: Math.round(r.right - felt.right),
          top: Math.round(r.top - felt.top),
          bottom: Math.round(r.bottom - felt.bottom),
        });
      }
    };
    const seats = [...document.querySelectorAll('.seat')].map((seat) => {
      const slots = [...seat.querySelectorAll('.table-slot')];
      const slotInfo = slots.map((slot) => {
        const r = slot.getBoundingClientRect();
        noteSpill('slot', seat.id + ':' + slot.dataset.slot, r);
        const up = slot.querySelector('.slot-up');
        const down = slot.querySelector('.slot-down');
        const upR = up ? up.getBoundingClientRect() : null;
        const downR = down ? down.getBoundingClientRect() : null;
        if (up) noteSpill('up', up.dataset.id, upR);
        if (down) noteSpill('down', down.dataset.id, downR);
        const stacked = !!(up && down)
          && Math.abs(upR.left - downR.left) < 1.5
          && Math.abs(upR.top - downR.top) < 1.5;
        return {
          slot: Number(slot.dataset.slot),
          w: slot.offsetWidth,
          h: slot.offsetHeight,
          hasUp: !!up,
          hasDown: !!down,
          stacked,
          upSize: up ? { w: up.offsetWidth, h: up.offsetHeight } : null,
          downSize: down ? { w: down.offsetWidth, h: down.offsetHeight } : null,
        };
      });
      return {
        id: seat.id,
        place: ['north', 'south', 'east', 'west'].find((c) => seat.classList.contains(c)),
        slotCount: slots.length,
        slots: slotInfo,
      };
    });
    const handEls = [...document.querySelectorAll('#humanHand .pcard')];
    const hand = handEls.map((c) => ({ w: c.offsetWidth, h: c.offsetHeight }));
    handEls.forEach((c) => noteSpill('hand', c.dataset.id, c.getBoundingClientRect()));
    const southSlots = [...document.querySelectorAll('#humanTableCards .table-slot')];
    let southGap = null;
    if (southSlots.length && handEls.length) {
      const tableBottom = Math.max(...southSlots.map((s) => s.getBoundingClientRect().bottom));
      const handTop = Math.min(...handEls.map((c) => c.getBoundingClientRect().top));
      southGap = Math.round(handTop - tableBottom);
    }
    const sizes = new Set();
    seats.forEach((s) => s.slots.forEach((slot) => {
      sizes.add(slot.w + 'x' + slot.h);
      if (slot.upSize) sizes.add(slot.upSize.w + 'x' + slot.upSize.h);
      if (slot.downSize) sizes.add(slot.downSize.w + 'x' + slot.downSize.h);
    }));
    return {
      felt: { w: Math.round(felt.width), h: Math.round(felt.height) },
      seats,
      handCount: hand.length,
      handSize: hand[0] || null,
      southGap,
      sizes: [...sizes],
      spills,
    };
  });
}

function checkScene(name, info, opts) {
  const o = opts || {};
  must(info.seats.length === 4, name + ': four seats render');
  info.seats.forEach((seat) => {
    must(seat.slotCount <= 3, name + ': ' + seat.place + ' has at most 3 stacked slots (got ' + seat.slotCount + ')');
    seat.slots.forEach((slot) => {
      must(slot.w === 40 && slot.h === 58, name + ': ' + seat.place + ' slot ' + slot.slot + ' is 40x58 (got ' + slot.w + 'x' + slot.h + ')');
      if (slot.upSize) must(slot.upSize.w === 40 && slot.upSize.h === 58, name + ': ' + seat.place + ' Stage 2 is 40x58');
      if (slot.downSize) must(slot.downSize.w === 40 && slot.downSize.h === 58, name + ': ' + seat.place + ' Stage 3 is 40x58');
      if (slot.hasUp && slot.hasDown) {
        must(slot.stacked, name + ': ' + seat.place + ' slot ' + slot.slot + ' stacks Stage 2 on Stage 3');
      }
    });
  });
  must(info.spills.length === 0, name + ': cards stay on the felt ' + JSON.stringify(info.spills.slice(0, 4)));
  must(info.sizes.length <= 1, name + ': one table-card size ' + info.sizes.join(','));
  if (o.handCount != null) must(info.handCount === o.handCount, name + ': hand count ' + info.handCount + ' != ' + o.handCount);
  if (info.handSize) must(info.handSize.w === 64 && info.handSize.h === 94, name + ': hand cards stay 64x94 (got ' + info.handSize.w + 'x' + info.handSize.h + ')');
  if (o.expectSouthGap && info.handCount > 0) {
    must(info.southGap == null || info.southGap >= -8, name + ': Stage 2/3 must not cover the hand (gap ' + info.southGap + 'px)');
  }
  if (o.southSlots != null) {
    const south = info.seats.find((s) => s.place === 'south');
    must(south && south.slotCount === o.southSlots, name + ': south has ' + o.southSlots + ' slots (got ' + (south && south.slotCount) + ')');
  }
}

async function main() {
  const puppeteer = resolvePuppeteer();
  const chrome = chromePath();
  if (!puppeteer || !chrome) {
    console.log('PALACE table layout checks skipped (no puppeteer-core/chrome)');
    return;
  }
  mkdirSync(artifacts, { recursive: true });
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    for (const viewport of [{ w: 390, h: 844, name: 'phone' }, { w: 360, h: 740, name: 'narrow' }]) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.w, height: viewport.h, deviceScaleFactor: 2, isMobile: true });
      await page.goto('http://127.0.0.1:' + port + '/card-game.html?test=1', { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluate(() => {
        window.__palaceTest.startMatch({
          mode: 'practice',
          seats: 4,
          difficulty: 'Easy',
          buyIn: 0,
          names: ['You', 'Bluff', 'Queen', 'Dealer'],
        });
        window.__palaceTest.paintNow();
      });
      await page.waitForSelector('#humanTableCards .table-slot');

      const dealt = await measure(page);
      checkScene(viewport.name + ' dealt 2-card hand', dealt, { handCount: 2, expectSouthGap: true, southSlots: 3 });
      must(dealt.seats.every((s) => s.slotCount === 3 && s.slots.every((sl) => sl.hasUp && sl.hasDown && sl.stacked)),
        viewport.name + ': every seat starts with 3 stacked Stage 2-on-3 slots');
      await page.screenshot({ path: join(artifacts, 'palace-stack-' + viewport.name + '-dealt.png'), type: 'png' });

      await page.evaluate(() => {
        const m = window.__palaceTest.match();
        const ranks = ['4', '8', '9', '9', 'Q', 'K', 'A'];
        const suits = ['H', 'S', 'D', 'H', 'D', 'S', 'D'];
        m.players[0].hand = ranks.map((rank, i) => ({ id: 'H7' + i, rank, suit: suits[i] }));
        window.__palaceTest.paintNow();
      });
      const seven = await measure(page);
      checkScene(viewport.name + ' 7-card hand', seven, { handCount: 7, expectSouthGap: true, southSlots: 3 });
      await page.screenshot({ path: join(artifacts, 'palace-stack-' + viewport.name + '-hand7.png'), type: 'png' });

      await page.evaluate(() => {
        const m = window.__palaceTest.match();
        m.players[0].hand = Array.from({ length: 10 }, (_, i) => ({
          id: 'H10' + i, rank: String((i % 9) + 3 === 11 ? 'J' : (i % 9) + 3), suit: ['S', 'H', 'D', 'C'][i % 4],
        }));
        window.__palaceTest.paintNow();
      });
      const ten = await measure(page);
      checkScene(viewport.name + ' 10-card hand', ten, { handCount: 10, expectSouthGap: true, southSlots: 3 });
      await page.screenshot({ path: join(artifacts, 'palace-stack-' + viewport.name + '-hand10.png'), type: 'png' });

      await page.evaluate(() => {
        const m = window.__palaceTest.match();
        m.players[0].up = m.players[0].up.filter((c) => c.slot !== 1);
        window.__palaceTest.paintNow();
      });
      const hole = await measure(page);
      checkScene(viewport.name + ' slot-1 revealed', hole, { expectSouthGap: true, southSlots: 3 });
      const southHole = hole.seats.find((s) => s.place === 'south');
      const revealed = southHole.slots.find((s) => s.slot === 1);
      must(revealed && !revealed.hasUp && revealed.hasDown, viewport.name + ': clearing Stage 2 in slot 1 shows that slot\'s Stage 3');
      must(southHole.slots.filter((s) => s.slot !== 1).every((s) => s.hasUp && s.hasDown && s.stacked),
        viewport.name + ': the other two slots stay stacked');
      await page.screenshot({ path: join(artifacts, 'palace-stack-' + viewport.name + '-reveal.png'), type: 'png' });

      await page.evaluate(() => {
        const m = window.__palaceTest.match();
        m.players.forEach((p) => { p.up = []; });
        m.players[0].hand = [];
        m.players[2].hand = [];
        window.__palaceTest.paintNow();
      });
      const downs = await measure(page);
      checkScene(viewport.name + ' Stage 3 only', downs, { handCount: 0, southSlots: 3 });
      must(downs.seats.every((s) => s.slots.every((sl) => !sl.hasUp && sl.hasDown)),
        viewport.name + ': empty Stage 2 leaves 3 face-down slots');
      await page.screenshot({ path: join(artifacts, 'palace-stack-' + viewport.name + '-stage3.png'), type: 'png' });

      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (fails.length) {
    console.error('TABLE LAYOUT CHECKS FAILED:');
    fails.forEach((f) => console.error(' -', f));
    process.exit(1);
  }
  console.log('PALACE table layout checks passed');
}

await main();
