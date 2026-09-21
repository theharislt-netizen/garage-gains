#!/usr/bin/env node
/**
 * Two-browser PALACE lobby E2E: name/id already set, friend request,
 * lobby invite, accept, join, start, play a card on both clients.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(join('/tmp', 'package.json'));
const puppeteer = require('puppeteer-core');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 8794;
const artifacts = '/opt/cursor/artifacts';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function todayStamp() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function seed(name, id) {
  return {
    app: 'palace',
    format: 1,
    profile: { name, photo: '', border: null, id, nameSet: true },
    coins: 400,
    xp: 0,
    lastDailyLogin: todayStamp(),
    inventory: { items: [], shards: { cosmetic: 0 }, stones: { cosmetic: 0 } },
    equipped: { cardSkin: null, tableTheme: null, emote: null, chatBubble: null, profileBorder: null },
    friends: [],
    settings: { theme: 'rig', sfx: 0, music: 0, notifications: true, language: 'en' },
    stats: { matches: 0, wins: 0 },
    shopTab: 'skins',
    invFilter: 'all',
    unlocks: { medium: 0, hard: -1, expert: -1 },
    cosmeticsSeeded: true,
  };
}

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
console.log('launching chrome');
const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=820,900'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1 },
});
console.log('chrome up');
await browser.defaultBrowserContext().overridePermissions(origin, ['notifications']);

async function openPlayer(alias, profile) {
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(20000);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => console.log(alias, 'pageerror', err.message));
  page.on('console', (msg) => {
    const t = msg.text();
    if (/error|fail/i.test(t)) console.log(alias, 'console', t);
  });
  await page.evaluateOnNewDocument((key, data) => {
    localStorage.setItem(key, data);
  }, 'palaceCards_v1::' + alias, JSON.stringify(profile));
  page.on('dialog', async (d) => { try { await d.accept(); } catch (_) { /* ignore */ } });
  console.log('goto', alias);
  await page.goto(origin + '/?as=' + alias, { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('loaded', alias, await page.title());
  await page.waitForFunction(() => window.PalaceEngine && window.PalaceNet, { timeout: 15000 });
  const setup = await page.evaluate(() => document.getElementById('nameSetupOverlay') && document.getElementById('nameSetupOverlay').style.display === 'flex');
  if (setup) {
    console.log(alias, 'filling name setup');
    await page.click('#nameSetupInput');
    await page.type('#nameSetupInput', profile.profile.name);
    await page.click('#nameSetupSave');
    await page.waitForFunction(() => document.getElementById('nameSetupOverlay').style.display !== 'flex', { timeout: 8000 });
  }
  console.log('ready', alias, await page.evaluate(() => ({ id: state.profile.id, name: state.profile.name, nameSet: state.profile.nameSet })));
  return page;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

const host = await openPlayer('host', seed('Host', 'HOSTTEST1'));
const guest = await openPlayer('guest', seed('Guest', 'GUESTTEST1'));
console.log('both pages ready');
await sleep(400);

try {
  const hostNet = await host.evaluate(() => ({ id: PalaceNet.me.id, name: PalaceNet.me.name }));
  const guestNet = await guest.evaluate(() => ({ id: PalaceNet.me.id, name: PalaceNet.me.name }));
  console.log('net', hostNet, guestNet);
  must(hostNet.id === 'HOSTTEST1' && guestNet.id === 'GUESTTEST1', 'seeded profile IDs');

  console.log('friend request');
  await host.evaluate(() => sendFriendRequest('GUESTTEST1'));
  const sawFriend = await guest.evaluate(async () => {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const el = document.getElementById('inviteBanner');
      if (el && el.classList.contains('show') && /add you/i.test(el.innerText)) return el.innerText;
      await new Promise((r) => setTimeout(r, 100));
    }
    return document.getElementById('inviteBanner') ? document.getElementById('inviteBanner').innerText : '';
  });
  console.log('friend banner', sawFriend.slice(0, 80));
  must(/add you/i.test(sawFriend), 'guest sees friend request banner');
  await guest.evaluate(() => {
    const btn = document.getElementById('inviteAcceptBtn');
    if (btn) btn.click();
  });
  await sleep(500);
  const guestFriends = await guest.evaluate(() => (state.friends || []).map((f) => f.id));
  const hostFriends = await host.evaluate(() => (state.friends || []).map((f) => f.id));
  console.log('friends', hostFriends, guestFriends);
  must(guestFriends.includes('HOSTTEST1'), 'guest added host');
  must(hostFriends.includes('GUESTTEST1'), 'host added guest after accept');

  console.log('open practice lobby');
  await host.evaluate(() => openLobby({ mode: 'practice', practiceSub: 'duel', seats: 4, difficulty: 'Easy', buyIn: 0 }));
  const lobbyOpen = await host.evaluate(() => document.getElementById('lobbyOverlay').style.display === 'flex' && !!document.getElementById('lobbyCodeText'));
  must(lobbyOpen, 'practice Start opens the lobby, not the table');
  const tableHidden = await host.evaluate(() => !document.getElementById('tableWindow').classList.contains('show'));
  must(tableHidden, 'host is not dropped into a match from Start');
  const code = await host.evaluate(() => document.getElementById('lobbyCodeText').textContent.trim());
  console.log('lobby code', code);
  must(code.length >= 4, 'lobby has a shareable code');

  const hostLobbyUi = await host.evaluate(() => {
    const start = document.getElementById('lobbyStartBtn');
    const r = start ? start.getBoundingClientRect() : { top: -1, bottom: -1 };
    return {
      pads: document.querySelectorAll('.lobby-pad').length,
      plus: document.querySelectorAll('.lobby-pad.open').length,
      you: ((document.querySelector('.lobby-pad.you .pad-name') || {}).textContent || '').trim(),
      slots: document.querySelectorAll('.lobby-slot').length,
      startInView: r.top >= 0 && r.bottom <= (window.innerHeight || 0) + 8,
    };
  });
  console.log('host lobby ui', hostLobbyUi);
  must(hostLobbyUi.pads === 4 && hostLobbyUi.plus === 3 && hostLobbyUi.slots === 0, 'lobby shows 4 compact pads, not full-width rows');
  must(/host/i.test(hostLobbyUi.you), 'host pad is first and labeled Host');
  must(hostLobbyUi.startInView, 'Start match is visible without scrolling');
  await host.screenshot({ path: join(artifacts, 'palace_lobby_host_pads.png') });

  await host.evaluate(() => {
    const plus = document.querySelector('[data-invite-open]');
    if (plus) plus.click();
  });
  const sheetOpen = await host.evaluate(() => {
    const el = document.getElementById('lobbyInviteSheet');
    return !!(el && el.classList.contains('show') && document.querySelector('[data-invite-friend="GUESTTEST1"]'));
  });
  must(sheetOpen, 'empty pad opens invite sheet with the guest');
  await host.evaluate(() => inviteFriendToLobby('GUESTTEST1'));
  const inviteText = await guest.evaluate(async () => {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const el = document.getElementById('inviteBanner');
      if (el && el.classList.contains('show') && /invited you/i.test(el.innerText)) return el.innerText;
      await new Promise((r) => setTimeout(r, 100));
    }
    return document.getElementById('inviteBanner') ? document.getElementById('inviteBanner').innerText : '';
  });
  console.log('invite banner', inviteText.slice(0, 80));
  must(/invited you/i.test(inviteText) && inviteText.includes(code), 'guest sees in-app lobby invite');
  const notifOk = await guest.evaluate(() => typeof Notification !== 'undefined' && Notification.permission === 'granted');
  must(notifOk, 'guest notification permission granted for push');
  await guest.evaluate(() => {
    const btn = document.getElementById('inviteAcceptBtn');
    if (btn) btn.click();
  });
  await sleep(800);
  const guestSeated = await guest.evaluate(() => {
    const s = window.__palaceSession && window.__palaceSession();
    return !!(s && (s.seats || []).some((row) => row && row.id === 'GUESTTEST1'));
  });
  const hostSeesGuest = await host.evaluate(() => {
    const s = window.__palaceSession && window.__palaceSession();
    return !!(s && (s.seats || []).some((row) => row && row.id === 'GUESTTEST1'));
  });
  console.log('seated', { guestSeated, hostSeesGuest });
  must(guestSeated && hostSeesGuest, 'guest is seated in the lobby on both clients');

  const guestLobbyUi = await guest.evaluate(() => {
    const pads = [...document.querySelectorAll('.lobby-pad')];
    const start = document.getElementById('lobbyStartBtn');
    const r = start ? start.getBoundingClientRect() : { top: -1, bottom: -1 };
    return {
      pads: pads.length,
      firstYou: pads[0] ? pads[0].classList.contains('you') : false,
      you: ((document.querySelector('.lobby-pad.you .pad-name') || {}).textContent || '').trim(),
      startInView: r.top >= 0 && r.bottom <= (window.innerHeight || 0) + 8,
    };
  });
  console.log('guest lobby ui', guestLobbyUi);
  must(guestLobbyUi.pads === 4 && guestLobbyUi.firstYou && /guest/i.test(guestLobbyUi.you), 'guest sees their avatar pad first');
  must(guestLobbyUi.startInView, 'guest Start/waiting button is visible without scrolling');
  await guest.screenshot({ path: join(artifacts, 'palace_lobby_guest_pads.png') });

  console.log('start match');
  await host.evaluate(() => startLobbyMatch());
  await sleep(500);
  await host.waitForFunction(() => document.getElementById('tableWindow').classList.contains('show'), { timeout: 15000 });
  await guest.waitForFunction(() => !!(match && document.getElementById('tableWindow').classList.contains('show')), { timeout: 15000 });
  await sleep(800);
  const bothAtTable = await Promise.all([
    host.evaluate(() => !!(match && match.players.length === 4 && document.getElementById('tableWindow').classList.contains('show'))),
    guest.evaluate(() => !!(match && match.players.length === 4 && document.getElementById('tableWindow').classList.contains('show'))),
  ]);
  console.log('table', bothAtTable);
  must(bothAtTable[0] && bothAtTable[1], 'both clients are in the match');

  const humans = await Promise.all([
    host.evaluate(() => match.players.filter((p) => !p.isBot).map((p) => p.profileId)),
    guest.evaluate(() => match.players.filter((p) => !p.isBot).map((p) => p.profileId)),
  ]);
  must(humans[0].includes('HOSTTEST1') && humans[0].includes('GUESTTEST1'), 'host match has two humans');
  must(humans[1].includes('HOSTTEST1') && humans[1].includes('GUESTTEST1'), 'guest match has two humans');

  const perspectives = await Promise.all([
    host.evaluate(() => ({
      humanSeat: match.humanSeat,
      south: ((document.querySelector('.seat.south .seat-name') || {}).textContent || '').trim(),
      places: [...document.querySelectorAll('.seat')].map((el) => ({
        seat: Number(el.dataset.seat),
        place: ['south', 'north', 'east', 'west'].find((c) => el.classList.contains(c)),
        name: ((el.querySelector('.seat-name') || {}).textContent || '').trim(),
      })),
    })),
    guest.evaluate(() => ({
      humanSeat: match.humanSeat,
      south: ((document.querySelector('.seat.south .seat-name') || {}).textContent || '').trim(),
      places: [...document.querySelectorAll('.seat')].map((el) => ({
        seat: Number(el.dataset.seat),
        place: ['south', 'north', 'east', 'west'].find((c) => el.classList.contains(c)),
        name: ((el.querySelector('.seat-name') || {}).textContent || '').trim(),
      })),
    })),
  ]);
  console.log('perspectives', JSON.stringify(perspectives));
  must(perspectives[0].humanSeat === 0 && /host/i.test(perspectives[0].south), 'host south seat is Host');
  must(perspectives[1].humanSeat === 1 && /guest/i.test(perspectives[1].south), 'guest south seat is Guest, not the host');
  must(!/host/i.test(perspectives[1].south), 'guest does not label the self seat as Host');
  const guestHostPlace = (perspectives[1].places.find((p) => /host/i.test(p.name)) || {}).place;
  must(guestHostPlace && guestHostPlace !== 'south', 'host is an opponent seat on the guest screen');
  await host.screenshot({ path: join(artifacts, 'palace_mp_host_table.png') });
  await guest.screenshot({ path: join(artifacts, 'palace_mp_guest_table.png') });

  const played = await host.evaluate(async () => {
    const start = Date.now();
    while (uiBusy && Date.now() - start < 12000) await new Promise((r) => setTimeout(r, 100));
    if (!match || uiBusy) return { ok: false, busy: !!uiBusy };
    match.turn = match.humanSeat;
    match.phase = 'playing';
    const you = match.players[match.humanSeat];
    you.hand = [
      { id: '4H', rank: '4', suit: 'H' },
      { id: '7C', rank: '7', suit: 'C' },
    ];
    match.pile = [{ id: '3C', rank: '3', suit: 'C' }];
    renderTable();
    const legal = PalaceEngine.legalMoves(match, match.humanSeat).find((m) => m.type === 'play');
    if (!legal) return { ok: false, legal: false };
    await runMove(legal);
    return { ok: true, pile: (match.pile || []).map((c) => c.id) };
  });
  must(played && played.ok, 'host played a card');
  await sleep(2000);
  const guestSnap = await guest.evaluate(() => ({
    pile: (match && match.pile || []).map((c) => c.id),
    turn: match && match.turn,
    started: !!(window.__palaceSession && window.__palaceSession() && window.__palaceSession().started),
  }));
  console.log('guest snap', guestSnap, 'host play', played);
  const guestSawPlay = guestSnap.pile.includes('4H') || guestSnap.pile.some((id) => String(id).startsWith('4'));
  must(guestSawPlay, 'guest table received the host play');

  const fourSeatViews = await guest.evaluate(() => {
    const names = ['Haris', 'Rim', 'Ada', 'Bo'];
    const out = [];
    for (let you = 0; you < 4; you++) {
      match.players = names.map((name, i) => ({
        seat: i,
        name,
        isBot: i !== you,
        profileId: 'P' + i,
        hand: [{ id: '4H' + i, rank: '4', suit: 'H' }],
        up: [],
        down: [],
        out: false,
        place: 0,
      }));
      match.humanSeat = you;
      state.profile.id = 'P' + you;
      renderTable();
      out.push({
        you,
        south: ((document.querySelector('.seat.south .seat-name') || {}).textContent || '').trim(),
        places: [...document.querySelectorAll('.seat')].map((el) => ({
          seat: Number(el.dataset.seat),
          place: ['south', 'north', 'east', 'west'].find((c) => el.classList.contains(c)),
        })),
      });
    }
    return out;
  });
  console.log('four seat views', JSON.stringify(fourSeatViews));
  must(fourSeatViews.length === 4 && fourSeatViews.every((v) => v.south === ['Haris', 'Rim', 'Ada', 'Bo'][v.you]), 'every 4p client sees itself at south');
  must(fourSeatViews[1].places.find((p) => p.seat === 0).place === 'west', 'guest seat 1 sees host at west');
  must(fourSeatViews[2].places.find((p) => p.seat === 0).place === 'north', 'seat 2 sees host across at north');

  const joinTile = await guest.evaluate(() => {
    const btn = document.querySelector('[data-mode="join"]');
    return btn ? btn.innerText.replace(/\s+/g, ' ') : '';
  });
  must(/Join Session/i.test(joinTile), 'Join Session tile is on home');
  await guest.evaluate(() => openJoin());
  const joinOpen = await guest.evaluate(() => document.getElementById('joinOverlay').style.display === 'flex');
  must(joinOpen, 'Join Session overlay opens from home');
} catch (err) {
  fails.push(String(err && err.stack ? err.stack : err));
  try { await host.screenshot({ path: join(artifacts, 'palace_mp_host_fail.png') }); } catch (_) { /* ignore */ }
  try { await guest.screenshot({ path: join(artifacts, 'palace_mp_guest_fail.png') }); } catch (_) { /* ignore */ }
}

const report = {
  ok: fails.length === 0,
  fails,
  hostUrl: origin + '/?as=host',
  guestUrl: origin + '/?as=guest',
};
await writeFile(join(artifacts, 'palace_mp_e2e.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
server.close();
if (fails.length) process.exit(1);
