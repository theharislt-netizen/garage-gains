#!/usr/bin/env node
/**
 * Two-browser proof: matching turn ownership, AFK Easy auto-play,
 * invites after leaving, and a clean reload.
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
const port = 8798;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
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
    settings: { theme: 'rig', sfx: 0, music: 0, notifications: false, language: 'en' },
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
const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=820,900'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1 },
});

async function openPlayer(alias, profile) {
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((key, data) => {
    localStorage.setItem(key, data);
  }, 'palaceCards_v1::' + alias, JSON.stringify(profile));
  page.on('dialog', async (d) => { try { await d.accept(); } catch (_) { /* ignore */ } });
  await page.goto(origin + '/?as=' + alias, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PalaceEngine && window.PalaceNet, { timeout: 15000 });
  await page.waitForFunction(() => state && state.profile && state.profile.id, { timeout: 8000 });
  return page;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

async function waitEval(page, fn, timeout = 20000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    try {
      last = await page.evaluate(fn);
      if (last) return last;
    } catch (_) { /* mid-paint */ }
    await sleep(250);
  }
  return last;
}

function turnView() {
  return {
    you: (state.profile && state.profile.name) || '',
    seat: typeof mySeat === 'function' ? mySeat() : (match && match.humanSeat),
    turn: match && match.turn,
    myTurn: typeof isMyTurn === 'function' && isMyTurn(),
    south: ((document.querySelector('.seat.south .seat-name') || {}).textContent || '').trim(),
    sub: (document.getElementById('tableSub') || {}).textContent || '',
    active: ((document.querySelector('.seat.active .seat-name') || {}).textContent || '').trim(),
    pile: (match && match.pile || []).map((c) => c.id),
  };
}

const host = await openPlayer('host', seed('Host', 'HOSTTEST1'));
const guest = await openPlayer('guest', seed('Guest', 'GUESTTEST1'));
await sleep(400);

try {
  await host.evaluate(() => sendFriendRequest('GUESTTEST1'));
  await waitEval(guest, () => {
    const el = document.getElementById('inviteBanner');
    return !!(el && el.classList.contains('show') && /add you/i.test(el.innerText || ''));
  }, 8000);
  await guest.evaluate(() => {
    const btn = document.getElementById('inviteAcceptBtn');
    if (btn) btn.click();
  });
  await sleep(400);
  await host.evaluate(() => showView('friends'));
  await guest.evaluate(() => showView('friends'));
  const onlineBefore = await Promise.all([
    waitEval(host, () => typeof friendOnline === 'function' && friendOnline('GUESTTEST1')),
    waitEval(guest, () => typeof friendOnline === 'function' && friendOnline('HOSTTEST1')),
  ]);
  console.log('online before match', onlineBefore);
  must(onlineBefore[0], 'host sees guest Online before the match');
  must(onlineBefore[1], 'guest sees host Online before the match');

  await host.evaluate(() => openLobby({ mode: 'practice', practiceSub: 'duel', seats: 2, difficulty: 'Easy', buyIn: 0 }));
  const code = await host.evaluate(() => (document.getElementById('lobbyCodeText') || {}).textContent.trim());
  await guest.evaluate((c) => joinLobby(c), code);
  await waitEval(host, () => {
    const s = window.__palaceSession && window.__palaceSession();
    return (s && s.seats || []).some((row) => row && String(row.id).toUpperCase() === 'GUESTTEST1');
  }, 15000);
  await waitEval(guest, () => {
    const s = window.__palaceSession && window.__palaceSession();
    return !!(s && s.hostId);
  }, 15000);

  await host.evaluate(() => startLobbyMatch());
  await waitEval(host, () => !!(match && document.getElementById('tableWindow').classList.contains('show')), 15000);
  await waitEval(guest, () => !!(match && document.getElementById('tableWindow').classList.contains('show')), 15000);
  await waitEval(host, () => !!(match && !uiBusy && match.players[match.turn] && !match.players[match.turn].isBot), 20000);
  await sleep(400);

  const views = await Promise.all([host.evaluate(turnView), guest.evaluate(turnView)]);
  console.log('turn views', views);
  must(views[0].seat === 0 && /host/i.test(views[0].south), 'host sits south as Host');
  must(views[1].seat === 1 && /guest/i.test(views[1].south), 'guest sits south as Guest');
  must(views[0].turn === views[1].turn, 'both clients share the same turn index');
  must(views[0].myTurn !== views[1].myTurn, 'exactly one client believes it is their turn');
  const actor = views[0].myTurn ? 'Host' : 'Guest';
  must(views[0].myTurn === (views[0].turn === 0), 'host isMyTurn matches turn === 0');
  must(views[1].myTurn === (views[1].turn === 1), 'guest isMyTurn matches turn === 1');
  if (views[0].myTurn) must(/host/i.test(views[0].active) || !views[0].active, 'host ring is on Host when it is host turn');
  else must(/guest/i.test(views[0].active), 'host ring points at Guest when it is guest turn');
  if (views[1].myTurn) must(/guest/i.test(views[1].active) || !views[1].active, 'guest ring is on Guest when it is guest turn');
  else must(/host/i.test(views[1].active), 'guest ring points at Host when it is host turn');
  await host.screenshot({ path: join(artifacts, 'mp_turn_host_view.png') });
  await guest.screenshot({ path: join(artifacts, 'mp_turn_guest_view.png') });

  const pileBefore = JSON.stringify(views[0].pile);
  const turnBefore = views[0].turn;
  await host.evaluate(() => { uiBusy = false; turnDeadline = Date.now() - 50; tickTurnClock(); });
  await guest.evaluate(() => { uiBusy = false; turnDeadline = Date.now() - 50; tickTurnClock(); });
  const afkOk = await waitEval(host, () => {
    if (!match) return false;
    return true;
  }, 2000);
  let moved = false;
  const startAfk = Date.now();
  let afterAfk = views;
  while (Date.now() - startAfk < 8000) {
    afterAfk = await Promise.all([host.evaluate(turnView), guest.evaluate(turnView)]);
    moved = afterAfk[0].turn !== turnBefore || JSON.stringify(afterAfk[0].pile) !== pileBefore
      || afterAfk[1].turn !== turnBefore || JSON.stringify(afterAfk[1].pile) !== pileBefore;
    if (moved) break;
    await sleep(250);
  }
  console.log('after AFK', { turnBefore, moved, afterAfk, afkOk });
  must(moved, 'AFK timeout auto-played a card or advanced the turn');
  await waitEval(guest, () => match && match.turn === 1 || (match && match.pile && match.pile.length), 8000);
  afterAfk = await Promise.all([host.evaluate(turnView), guest.evaluate(turnView)]);
  console.log('after AFK synced', afterAfk);
  must(afterAfk[0].turn === afterAfk[1].turn, 'guest received the AFK play and shares the new turn');
  await host.screenshot({ path: join(artifacts, 'mp_afk_autoplay.png') });

  await host.evaluate(() => { if (typeof closeTable === 'function') closeTable(); else if (typeof requestLeaveMatch === 'function') requestLeaveMatch(); });
  await guest.evaluate(() => { if (typeof closeTable === 'function') closeTable(); else if (typeof requestLeaveMatch === 'function') requestLeaveMatch(); });
  await sleep(500);

  await host.evaluate(() => showView('friends'));
  await guest.evaluate(() => showView('friends'));
  const onlineAfter = await Promise.all([
    waitEval(host, () => typeof friendOnline === 'function' && friendOnline('GUESTTEST1')),
    waitEval(guest, () => typeof friendOnline === 'function' && friendOnline('HOSTTEST1')),
  ]);
  console.log('online after match', onlineAfter);
  must(onlineAfter[0], 'host still sees guest Online after leaving the match');
  must(onlineAfter[1], 'guest still sees host Online after leaving the match');
  await host.screenshot({ path: join(artifacts, 'mp_online_after_match.png') });

  await host.evaluate(() => openLobby({ mode: 'practice', practiceSub: 'duel', seats: 2, difficulty: 'Easy', buyIn: 0 }));
  await host.evaluate(() => {
    pendingInviteSeat = 1;
    inviteFriendToLobby('GUESTTEST1');
  });
  const invited = await waitEval(guest, () => {
    const el = document.getElementById('inviteBanner');
    return !!(el && el.classList.contains('show') && /invited you/i.test(el.innerText || ''));
  }, 10000);
  console.log('reinvite', invited);
  must(invited, 'guest can still receive a lobby invite after leaving the match');
  await guest.screenshot({ path: join(artifacts, 'mp_invite_after_leave.png') });

  await host.reload({ waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.PalaceEngine && window.PalaceNet && state && state.profile && state.profile.id, { timeout: 15000 });
  const booted = await host.evaluate(() => ({
    id: state.profile.id,
    inMatch: document.body.classList.contains('in-match'),
    home: document.body.classList.contains('on-home') || !!(document.getElementById('view-home') && document.getElementById('view-home').classList.contains('active')),
  }));
  console.log('reload', booted);
  must(booted.id === 'HOSTTEST1' && !booted.inMatch, 'app relaunches to the home shell after a full reload');
  await host.screenshot({ path: join(artifacts, 'mp_relaunch_home.png') });
} catch (err) {
  fails.push(String(err && err.stack ? err.stack : err));
  try { await host.screenshot({ path: join(artifacts, 'mp_turn_afk_host_fail.png') }); } catch (_) { /* ignore */ }
  try { await guest.screenshot({ path: join(artifacts, 'mp_turn_afk_guest_fail.png') }); } catch (_) { /* ignore */ }
}

const report = { ok: fails.length === 0, fails };
await writeFile(join(artifacts, 'mp_turn_afk.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
if (fails.length) process.exit(1);
