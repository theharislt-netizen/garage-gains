#!/usr/bin/env node
/**
 * Themed table cards: upright stacked tiers, lobby-on-tap, unlocks and save carry over.
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
const port = 8816;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function todayStamp() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const carried = {
  app: 'palace',
  format: 1,
  profile: { name: 'Haris', photo: '', border: null, id: 'HARIS1', nameSet: true },
  coins: 777,
  xp: 140,
  lastDailyLogin: todayStamp(),
  inventory: { items: [], shards: { cosmetic: 0 }, stones: { cosmetic: 0 } },
  equipped: { cardSkin: null, tableTheme: null, emote: null, chatBubble: null, profileBorder: null },
  friends: [{ id: 'RIM1', name: 'Rim', lastSeen: 1700000000000 }],
  settings: { theme: 'rig', sfx: 0, music: 0, notifications: false, language: 'en' },
  stats: { matches: 11, wins: 6 },
  shopTab: 'skins',
  invFilter: 'all',
  unlocks: { medium: 2, hard: 0, expert: -1 },
  cosmeticsSeeded: true,
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
page.setDefaultTimeout(20000);
await page.evaluateOnNewDocument((key, data) => {
  localStorage.setItem(key, data);
}, 'palaceCards_v1::tables', JSON.stringify(carried));
await page.goto('http://127.0.0.1:' + port + '/?as=tables', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.PalaceEngine && typeof openMode === 'function');

const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

try {
  const loaded = await page.evaluate(() => ({
    coins: state.coins,
    xp: state.xp,
    wins: state.stats.wins,
    matches: state.stats.matches,
    unlocks: { ...state.unlocks },
    name: state.profile.name,
    id: state.profile.id,
    friend: (state.friends || [])[0],
    key: Object.keys(localStorage).find((k) => k.startsWith('palaceCards_v1')),
  }));
  console.log('loaded save', loaded);
  must(loaded.coins === 777, 'carried coin balance');
  must(loaded.xp === 140 && loaded.wins === 6 && loaded.matches === 11, 'carried xp and match stats');
  must(loaded.unlocks.medium === 2 && loaded.unlocks.hard === 0 && loaded.unlocks.expert === -1, 'carried unlocks');
  must(loaded.name === 'Haris' && loaded.id === 'HARIS1', 'carried profile');
  must(loaded.friend && loaded.friend.id === 'RIM1' && loaded.friend.lastSeen === 1700000000000, 'carried friend lastSeen');
  must(loaded.key && loaded.key.startsWith('palaceCards_v1'), 'still palaceCards_v1');

  const homeCard = await page.evaluate(() => {
    const el = document.querySelector('.play-card');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { height: r.height, css: getComputedStyle(el).height };
  });
  must(homeCard && homeCard.height >= 210 && homeCard.height <= 280, 'mode-select cards are the 268px-capped height');

  await page.evaluate(() => openMode('standard'));
  await page.waitForSelector('.table-card');
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.table-card')];
    const vw = window.innerWidth;
    const rows = [...document.querySelectorAll('.tier-play')].map((b) => ({
      diff: b.dataset.diff,
      buy: Number(b.dataset.buy),
      open: b.dataset.open,
      text: b.innerText.replace(/\s+/g, ' ').trim(),
      locked: b.classList.contains('locked'),
    }));
    const names = cards.map((c) => ((c.querySelector('h3') || {}).textContent || '').trim());
    const railBox = document.querySelector('.table-rail').getBoundingClientRect();
    const boxes = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, visible: r.left < vw - 8 && r.right > 8 };
    });
    const first = boxes[0] || { left: 0, right: 0, top: 0, bottom: 0, height: 0 };
    const overlay = document.getElementById('modeOverlay').getBoundingClientRect();
    const body = document.getElementById('modeBody').getBoundingClientRect();
    const rot = cards.map((c) => getComputedStyle(c).transform);
    return {
      count: cards.length,
      names,
      rows,
      boxes,
      rot,
      vw,
      vh: window.innerHeight,
      leftGap: first.left - railBox.left,
      overlayMid: (overlay.top + overlay.bottom) / 2,
      bodyMid: (body.top + body.bottom) / 2,
      cardMid: (first.top + first.bottom) / 2,
      cardH: first.height,
      cardW: first.width,
      fullyOn: boxes.filter((b) => b.left >= -4 && b.right <= vw + 4).length,
      hasEasy: document.body.innerText.includes('Easy'),
      tiltOval: !!document.querySelector('.stake-oval, .stake-card'),
      themedRows: /side table|main felt|high roller|audience|council|throne|night watch|inner vault|crown table/i.test(document.body.innerText),
    };
  });
  console.log('layout', JSON.stringify({ count: layout.count, names: layout.names, cardW: layout.cardW, cardH: layout.cardH, fullyOn: layout.fullyOn, bodyMid: layout.bodyMid, cardMid: layout.cardMid }));
  must(layout.count === 6, 'six themed table cards');
  must(layout.names[0] === 'VELVET ROOM' || layout.names[0] === 'Velvet Room', 'first table is Velvet Room');
  must(layout.names.includes('VELVET ROOM') || layout.names.includes('Velvet Room'), 'Medium table is Velvet Room');
  must(layout.names.includes('HIGH COURT') || layout.names.includes('High Court'), 'Hard table is High Court');
  must(layout.names.includes('MIDNIGHT CROWN') || layout.names.includes('Midnight Crown'), 'Expert table is Midnight Crown');
  must(layout.names.includes('EMBER GALLERY') || layout.names.includes('Ember Gallery'), 'fifth table is Ember Gallery');
  must(layout.names.includes('OBSIDIAN COURT') || layout.names.includes('Obsidian Court'), 'sixth table is Obsidian Court');
  must(layout.names.includes('DRAGON CROWN') || layout.names.includes('Dragon Crown'), 'seventh table is Dragon Crown');
  must(!layout.tiltOval, 'no tilted stake cards');
  must(layout.rot.every((t) => !t || t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'), 'cards are upright');
  must(layout.fullyOn === 2, 'exactly two table cards fit on screen');
  must(layout.cardW >= layout.vw * 0.42 && layout.cardW <= layout.vw * 0.52, 'each card is about half the screen wide');
  must(Math.abs(layout.cardH - homeCard.height) <= 4, 'challenge cards use the same height as mode-select cards');
  must(Math.abs(layout.cardMid - layout.bodyMid) <= 48, 'cards are vertically centered in the mode body');
  must(!layout.themedRows, 'inner rows are not themed sub-names');

  const byBuy = Object.fromEntries(layout.rows.map((r) => [r.buy, r]));
  must(byBuy[100] && byBuy[100].open === '1' && byBuy[200].open === '1' && byBuy[300].open === '1', 'Velvet Room all open from medium:2');
  must(byBuy[500] && byBuy[500].open === '1', 'High Court 500 open from hard:0');
  must(byBuy[700] && byBuy[700].open === '0' && byBuy[700].locked, 'High Court 700 still locked');
  must(byBuy[1200] && byBuy[1200].open === '0', 'Midnight Crown still locked');
  must(byBuy[2500] && byBuy[2500].open === '0', 'Ember Gallery stays locked until Midnight Crown tier III');
  must(byBuy[10000] && byBuy[10000].open === '0', 'Dragon Crown stays locked at the end of the chain');
  must(/\btier i\b/i.test(byBuy[100].text) && /\btier ii\b/i.test(byBuy[200].text) && /\btier iii\b/i.test(byBuy[300].text), 'Velvet rows are Tier I / II / III + priced');
  must(/🪙 100/.test(byBuy[100].text) && /🪙 200/.test(byBuy[200].text) && /🪙 300/.test(byBuy[300].text), 'Velvet rows still show coin costs');
  must(/\btier i\b/i.test(byBuy[500].text) && /\btier ii\b/i.test(byBuy[700].text) && /\btier iii\b/i.test(byBuy[900].text), 'High Court rows are Tier I / II / III');

  await page.screenshot({ path: join(artifacts, 'standard_table_cards.png'), type: 'png' });
  await page.evaluate(() => {
    const velvet = document.querySelector('.table-card.art-medium');
    if (velvet) velvet.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  const velvetCenter = await page.evaluate(() => {
    const card = document.querySelector('.table-card.art-medium');
    const r = card.getBoundingClientRect();
    const vw = window.innerWidth;
    return {
      fullyOn: r.left >= -4 && r.right <= vw + 4,
      labels: [...card.querySelectorAll('.tier-play')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()),
    };
  });
  console.log('velvetCenter', velvetCenter);
  must(velvetCenter.fullyOn, 'Velvet Room card can be scrolled fully on screen');
  must(velvetCenter.labels.length === 3 && velvetCenter.labels.every((t, i) => new RegExp('tier ' + ['i', 'ii', 'iii'][i] + '\\b', 'i').test(t)), 'Velvet Room inner rows are Tier I / II / III');
  await page.screenshot({ path: join(artifacts, 'standard_velvet_tiers.png'), type: 'png' });
  await page.evaluate(() => {
    const hard = document.querySelector('.table-card.art-hard');
    if (hard) hard.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
  await page.screenshot({ path: join(artifacts, 'standard_locked_tiers.png'), type: 'png' });

  await page.click('.tier-play[data-buy="700"]');
  const lockedToast = await page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
  const stillMode = await page.evaluate(() => document.getElementById('modeOverlay').style.display === 'flex' && document.getElementById('lobbyOverlay').style.display !== 'flex');
  must(/previous stake/i.test(lockedToast), 'locked row explains unlock rule');
  must(stillMode, 'locked row does not open the lobby');

  await page.click('.tier-play[data-buy="100"]');
  await page.waitForFunction(() => document.getElementById('lobbyOverlay').style.display === 'flex');
  const lobby = await page.evaluate(() => {
    const s = window.__palaceSession && window.__palaceSession();
    return { mode: s && s.cfg && s.cfg.mode, difficulty: s && s.cfg && s.cfg.difficulty, buyIn: s && s.cfg && s.cfg.buyIn };
  });
  console.log('lobby', lobby);
  must(lobby.mode === 'standard' && lobby.difficulty === 'Medium' && lobby.buyIn === 100, 'Velvet Room row opens Medium 100 lobby');
  await page.screenshot({ path: join(artifacts, 'standard_tier_opens_lobby.png'), type: 'png' });

  await page.evaluate(() => { hideLobby(false); closeMode(); });
  await page.evaluate(() => openMode('practice'));
  await page.waitForSelector('.table-card .tier-play');
  const practice = await page.evaluate(() => ({
    cards: document.querySelectorAll('.table-card').length,
    plays: [...document.querySelectorAll('.tier-play')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()),
    names: [...document.querySelectorAll('.table-card h3')].map((h) => h.textContent.trim()),
  }));
  must(practice.cards === 6 && practice.plays.length === 6, 'practice has one play row per themed table');
  must(practice.plays.every((t) => /Play/i.test(t)), 'practice rows are Play, not coin stakes');
  await page.screenshot({ path: join(artifacts, 'practice_table_cards.png'), type: 'png' });
  await page.click('.table-card.art-medium .tier-play');
  await page.waitForFunction(() => document.getElementById('lobbyOverlay').style.display === 'flex');
  const pLobby = await page.evaluate(() => {
    const s = window.__palaceSession && window.__palaceSession();
    return { mode: s.cfg.mode, difficulty: s.cfg.difficulty, buyIn: s.cfg.buyIn };
  });
  must(pLobby.mode === 'practice' && pLobby.difficulty === 'Medium' && pLobby.buyIn === 0, 'Velvet Room play opens Medium practice lobby');

  const after = await page.evaluate(() => ({
    coins: state.coins,
    unlocks: { ...state.unlocks },
    wins: state.stats.wins,
  }));
  must(after.coins === 777 && after.unlocks.medium === 2 && after.wins === 6, 'opening lobbies did not reset the save');

  await page.evaluate(() => { hideLobby(false); closeMode(); });
  await page.evaluate(() => {
    state.unlocks = { medium: 3, hard: 3, expert: 3, legend: 3, mythic: 3, dragon: 3 };
    saveState();
    openMode('standard');
  });
  await page.waitForSelector('.table-card.art-dragon');
  await page.evaluate(() => {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = '';
      toast.classList.remove('show');
      toast.style.opacity = '0';
    }
    const el = document.querySelector('.table-card.art-legend');
    if (el) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  const newLadder = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.tier-play')].map((b) => ({
      diff: b.dataset.diff,
      buy: Number(b.dataset.buy),
      open: b.dataset.open,
      text: b.innerText.replace(/\s+/g, ' ').trim(),
    }));
    return {
      names: [...document.querySelectorAll('.table-card h3')].map((h) => h.textContent.trim()),
      candle: /candlelight/i.test(document.body.innerText),
      ember: rows.filter((r) => r.diff === 'Legend').map((r) => r.buy + ':' + r.open),
      mythic: rows.filter((r) => r.diff === 'Mythic').map((r) => r.buy + ':' + r.open),
      dragon: rows.filter((r) => r.diff === 'Dragon').map((r) => r.buy + ':' + r.open),
      boss: !!document.querySelector('.table-card.boss.art-dragon .table-fx'),
      spark: !!document.querySelector('.table-card.art-legend .fx-spark'),
      emberFx: !!document.querySelector('.table-card.art-mythic .fx-ember'),
      fireFx: (document.querySelectorAll('.table-card.art-dragon .fx-fire span') || []).length,
    };
  });
  must(!newLadder.candle, 'Candlelight copy is gone from Standard');
  must(newLadder.ember.join(',') === '2500:1,3000:1,4000:1', 'Ember Gallery tiers 2500/3000/4000 unlock');
  must(newLadder.mythic.join(',') === '5000:1,6500:1,8000:1', 'Obsidian Court tiers 5000/6500/8000 unlock');
  must(newLadder.dragon.join(',') === '10000:1,15000:1,20000:1', 'Dragon Crown tiers 10000/15000/20000 unlock');
  must(newLadder.boss, 'Dragon Crown has the boss fire treatment');
  must(newLadder.spark, 'Ember Gallery has a light spark treatment');
  must(newLadder.emberFx, 'Obsidian Court has ember flames');
  must(newLadder.fireFx >= 8, 'Dragon Crown has a full fire ring');
  await page.screenshot({ path: join(artifacts, 'ember_gallery_card.png'), type: 'png' });
  await page.evaluate(() => {
    const el = document.querySelector('.table-card.art-mythic');
    if (el) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  await page.screenshot({ path: join(artifacts, 'obsidian_court_card.png'), type: 'png' });
  await page.evaluate(() => {
    const el = document.querySelector('.table-card.art-dragon');
    if (el) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  await page.screenshot({ path: join(artifacts, 'dragon_crown_boss.png'), type: 'png' });
} catch (err) {
  fails.push(String(err && err.stack ? err.stack : err));
  try { await page.screenshot({ path: join(artifacts, 'table_cards_fail.png'), type: 'png' }); } catch (_) { /* ignore */ }
}

const report = { ok: fails.length === 0, fails };
await writeFile(join(artifacts, 'table_cards_proof.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
if (fails.length) process.exit(1);
