#!/usr/bin/env node
/**
 * Two-origin (phone-like) proof: ntfy only, no shared BroadcastChannel.
 * Host loads 127.0.0.1, guest loads localhost — different origins, so the
 * only path for turns / AFK / presence / invites is ntfy.sh, same as two phones.
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
const port = 8802;
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
    friends: [{ id: name === 'Host' ? 'GUESTTEST1' : 'HOSTTEST1', name: name === 'Host' ? 'Guest' : 'Host', lastSeen: Date.now() }],
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
await new Promise((r) => server.listen(port, '0.0.0.0', r));
await mkdir(artifacts, { recursive: true });

const hostOrigin = 'http://127.0.0.1:' + port;
const guestOrigin = 'http://localhost:' + port;
const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=820,900'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1 },
});

const probe = `(() => {
  window.__netLog = window.__netLog || [];
  window.__netMsg = window.__netMsg || [];
  if (!window.__netPatched) {
    window.__netPatched = true;
    const OrigES = window.EventSource;
    window.__esOpen = 0;
    window.EventSource = function (url, opts) {
      window.__esOpen += 1;
      window.__netLog.push({ t: Date.now(), kind: 'es-open', url: String(url).slice(0, 120) });
      const es = new OrigES(url, opts);
      es.addEventListener('error', () => {
        window.__netLog.push({ t: Date.now(), kind: 'es-err', ready: es.readyState, url: String(url).slice(0, 80) });
      });
      const close = es.close.bind(es);
      es.close = () => { window.__esOpen = Math.max(0, window.__esOpen - 1); close(); };
      return es;
    };
    window.EventSource.prototype = OrigES.prototype;
    const origFetch = window.fetch.bind(window);
    window.fetch = async function (url, opts) {
      const res = await origFetch(url, opts);
      if (String(url).includes('ntfy')) {
        window.__netLog.push({
          t: Date.now(),
          kind: 'ntfy',
          status: res.status,
          method: (opts && opts.method) || 'GET',
          bytes: opts && opts.body ? String(opts.body).length : 0,
          url: String(url).replace('https://ntfy.sh/', '').slice(0, 80),
        });
      }
      return res;
    };
  }
})()`;

async function openPlayer(origin, alias, profile) {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((key, data, boot) => {
    localStorage.setItem(key, data);
    eval(boot);
  }, 'palaceCards_v1::' + alias, JSON.stringify(profile), probe);
  page.on('dialog', async (d) => { try { await d.accept(); } catch (_) { /* ignore */ } });
  await page.goto(origin + '/?as=' + alias, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PalaceEngine && window.PalaceNet, { timeout: 15000 });
  await page.waitForFunction(() => state && state.profile && state.profile.id, { timeout: 8000 });
  await page.evaluate(() => {
    if (window.PalaceNet && !window.__msgHooked) {
      window.__msgHooked = true;
      PalaceNet.on((msg) => {
        window.__netMsg.push({ t: Date.now(), type: msg && msg.type, from: msg && msg.from, seat: msg && msg.seat, turn: msg && msg.match && msg.match.turn });
        if (window.__netMsg.length > 80) window.__netMsg.shift();
      });
    }
  });
  return page;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

async function waitEval(page, fn, timeout = 25000) {
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

function dumpView() {
  const s = window.__palaceSession && window.__palaceSession();
  return {
    you: state.profile && state.profile.name,
    id: state.profile && state.profile.id,
    origin: location.origin,
    seat: typeof mySeat === 'function' ? mySeat() : null,
    humanSeat: match && match.humanSeat,
    turn: match && match.turn,
    myTurn: typeof isMyTurn === 'function' && isMyTurn(),
    guest: typeof isNetGuest === 'function' && isNetGuest(),
    host: typeof isLobbyHost === 'function' && isLobbyHost(),
    uiBusy: !!uiBusy,
    started: !!(s && s.started),
    code: s && s.code,
    hostId: s && s.hostId,
    south: ((document.querySelector('.seat.south .seat-name') || {}).textContent || '').trim(),
    active: ((document.querySelector('.seat.active .seat-name') || {}).textContent || '').trim(),
    pile: (match && match.pile || []).map((c) => c.id),
    inMatch: document.body.classList.contains('in-match'),
    esOpen: window.__esOpen || 0,
    ntfyFail: (window.__netLog || []).filter((x) => x.kind === 'ntfy' && x.status >= 400).slice(-6),
    lastMsg: (window.__netMsg || []).slice(-8).map((m) => m.type + (m.turn != null ? '@' + m.turn : '')),
    onlineFriend: typeof friendOnline === 'function' && (state.profile.id === 'HOSTTEST1' ? friendOnline('GUESTTEST1') : friendOnline('HOSTTEST1')),
  };
}

async function playIfMine(page) {
  return page.evaluate(async () => {
    if (!match || typeof isMyTurn !== 'function' || !isMyTurn() || uiBusy) return { played: false, reason: 'not-mine' };
    const seat = mySeat();
    const legal = PalaceEngine.legalMoves(match, seat);
    const mv = legal.find((m) => m.type === 'play') || legal.find((m) => m.type === 'pickup') || legal[0];
    if (!mv) return { played: false, reason: 'no-legal' };
    await runMove(mv);
    return { played: true, mv: { type: mv.type, seat: mv.seat, ids: mv.cardIds } };
  });
}

const host = await openPlayer(hostOrigin, 'host', seed('Host', 'HOSTTEST1'));
const guest = await openPlayer(guestOrigin, 'guest', seed('Guest', 'GUESTTEST1'));
await sleep(800);

const log = [];
function note(label, data) {
  log.push({ t: Date.now(), label, data });
  console.log(label, JSON.stringify(data));
}

try {
  await host.evaluate(() => showView('friends'));
  await guest.evaluate(() => showView('friends'));
  const online = await Promise.all([
    waitEval(host, () => typeof friendOnline === 'function' && friendOnline('GUESTTEST1'), 20000),
    waitEval(guest, () => typeof friendOnline === 'function' && friendOnline('HOSTTEST1'), 20000),
  ]);
  note('presence-before', online);
  must(online[0] && online[1], 'ntfy-only: both friends show Online before the match');
  await host.screenshot({ path: join(artifacts, 'mp_stall_presence_before.png') });
  await guest.screenshot({ path: join(artifacts, 'mp_stall_presence_before_guest.png') });

  await host.evaluate(() => showView('home'));
  await host.evaluate(() => openLobby({ mode: 'practice', practiceSub: 'duel', seats: 2, difficulty: 'Easy', buyIn: 0 }));
  const code = await host.evaluate(() => (document.getElementById('lobbyCodeText') || {}).textContent.trim());
  note('lobby-code', { code, hostOrigin, guestOrigin });
  must(code && code.length >= 4, 'host has a join code');

  await guest.evaluate((c) => joinLobby(c), code);
  const seated = await Promise.all([
    waitEval(host, () => {
      const s = window.__palaceSession && window.__palaceSession();
      return (s && s.seats || []).some((row) => row && String(row.id).toUpperCase() === 'GUESTTEST1');
    }, 25000),
    waitEval(guest, () => {
      const s = window.__palaceSession && window.__palaceSession();
      return !!(s && s.hostId) && (s.seats || []).some((row) => row && String(row.id).toUpperCase() === 'GUESTTEST1');
    }, 25000),
  ]);
  note('seated', seated);
    if (!seated[0] || !seated[1]) {
      must(false, 'ntfy-only join-by-code seats both players in one lobby');
      throw new Error('guest never seated — aborting match');
    }

  await host.evaluate(() => startLobbyMatch());
  await waitEval(host, () => !!(match && document.getElementById('tableWindow').classList.contains('show')), 20000);
  await waitEval(guest, () => !!(match && document.getElementById('tableWindow').classList.contains('show')), 25000);
  await waitEval(host, () => !!(match && !uiBusy && match.players[match.turn] && !match.players[match.turn].isBot), 25000);
  await sleep(600);

  let views = await Promise.all([host.evaluate(dumpView), guest.evaluate(dumpView)]);
  note('turn-0', views);
  must(views[0].origin !== views[1].origin, 'host and guest are on different origins (no BroadcastChannel)');
  must(views[0].turn === views[1].turn, 'both clients share the same turn index after deal');
  must(views[0].myTurn !== views[1].myTurn, 'exactly one client believes it is their turn');
  must(views[0].seat === 0 && views[1].seat === 1, 'host seat 0, guest seat 1');
  await host.screenshot({ path: join(artifacts, 'mp_stall_turn0_host.png') });
  await guest.screenshot({ path: join(artifacts, 'mp_stall_turn0_guest.png') });

  // Play up to 4 real turns over ntfy (the phone path).
  for (let i = 0; i < 4; i++) {
    views = await Promise.all([host.evaluate(dumpView), guest.evaluate(dumpView)]);
    const turnBefore = views[0].turn;
    const actor = views[0].myTurn ? host : guest;
    const actorName = views[0].myTurn ? 'host' : 'guest';
    const played = await playIfMine(actor);
    note('play-' + i, { actorName, played, turnBefore, hostBusy: views[0].uiBusy, guestBusy: views[1].uiBusy });
    const startWait = Date.now();
    while (Date.now() - startWait < 15000) {
      views = await Promise.all([host.evaluate(dumpView), guest.evaluate(dumpView)]);
      if (views[0].turn === views[1].turn && views[0].myTurn !== views[1].myTurn && views[0].pile.join() === views[1].pile.join() && (views[0].turn !== turnBefore || views[0].pile.length)) break;
      await sleep(300);
    }
    views = await Promise.all([host.evaluate(dumpView), guest.evaluate(dumpView)]);
    note('after-play-' + i, views);
    must(views[0].turn === views[1].turn, 'after play ' + i + ' both clients still share turn');
    must(views[0].myTurn !== views[1].myTurn, 'after play ' + i + ' exactly one client has the turn');
    must(views[0].turn !== turnBefore || views[0].pile.length > 0, 'turn did not stall after play ' + i);
  }

  views = await Promise.all([host.evaluate(dumpView), guest.evaluate(dumpView)]);
  const pileBefore = JSON.stringify(views[0].pile);
  const turnBefore = views[0].turn;
  note('pre-afk', views);
  await host.evaluate(() => { uiBusy = false; turnDeadline = Date.now() - 50; tickTurnClock(); });
  await guest.evaluate(() => { uiBusy = false; turnDeadline = Date.now() - 50; tickTurnClock(); });
  let moved = false;
  const startAfk = Date.now();
  let afterAfk = views;
  while (Date.now() - startAfk < 12000) {
    afterAfk = await Promise.all([host.evaluate(dumpView), guest.evaluate(dumpView)]);
    moved = afterAfk[0].turn === afterAfk[1].turn
      && afterAfk[0].myTurn !== afterAfk[1].myTurn
      && (afterAfk[0].turn !== turnBefore || JSON.stringify(afterAfk[0].pile) !== pileBefore);
    if (moved) break;
    await sleep(300);
  }
  note('after-afk', { turnBefore, moved, afterAfk });
  must(moved, 'AFK timeout auto-played over ntfy');
  must(afterAfk[0].turn === afterAfk[1].turn, 'guest received the AFK play over ntfy');
  await host.screenshot({ path: join(artifacts, 'mp_stall_afk_host.png') });
  await guest.screenshot({ path: join(artifacts, 'mp_stall_afk_guest.png') });

  await host.evaluate(() => { if (typeof closeTable === 'function') closeTable(); });
  await guest.evaluate(() => { if (typeof closeTable === 'function') closeTable(); });
  await sleep(800);
  await host.evaluate(() => showView('friends'));
  await guest.evaluate(() => showView('friends'));
  const onlineAfter = await Promise.all([
    waitEval(host, () => typeof friendOnline === 'function' && friendOnline('GUESTTEST1'), 15000),
    waitEval(guest, () => typeof friendOnline === 'function' && friendOnline('HOSTTEST1'), 15000),
  ]);
  note('presence-after', onlineAfter);
  must(onlineAfter[0] && onlineAfter[1], 'friends still Online after leaving the match');
  await host.screenshot({ path: join(artifacts, 'mp_stall_presence_after.png') });

  await host.evaluate(() => openLobby({ mode: 'practice', practiceSub: 'duel', seats: 2, difficulty: 'Easy', buyIn: 0 }));
  await host.evaluate(() => {
    pendingInviteSeat = 1;
    inviteFriendToLobby('GUESTTEST1');
  });
  const invited = await waitEval(guest, () => {
    const el = document.getElementById('inviteBanner');
    return !!(el && el.classList.contains('show') && /invited you/i.test(el.innerText || ''));
  }, 15000);
  note('reinvite', invited);
  must(invited, 'guest receives a lobby invite after the match over ntfy');
  await guest.screenshot({ path: join(artifacts, 'mp_stall_invite_after.png') });

  await guest.evaluate(() => {
    const btn = document.getElementById('inviteAcceptBtn');
    if (btn) btn.click();
  });
  const reseated = await waitEval(host, () => {
    const s = window.__palaceSession && window.__palaceSession();
    return (s && s.seats || []).some((row) => row && String(row.id).toUpperCase() === 'GUESTTEST1');
  }, 20000);
  note('rejoin', reseated);
  must(reseated, 'accepted invite seats the guest in the new lobby');
  await host.screenshot({ path: join(artifacts, 'mp_stall_rejoin_lobby.png') });
} catch (err) {
  fails.push(String(err && err.stack ? err.stack : err));
  try { await host.screenshot({ path: join(artifacts, 'mp_stall_host_fail.png') }); } catch (_) { /* ignore */ }
  try { await guest.screenshot({ path: join(artifacts, 'mp_stall_guest_fail.png') }); } catch (_) { /* ignore */ }
}

const dumps = await Promise.all([
  host.evaluate(dumpView).catch((e) => String(e)),
  guest.evaluate(dumpView).catch((e) => String(e)),
  host.evaluate(() => (window.__netLog || []).slice(-20)).catch(() => []),
  guest.evaluate(() => (window.__netLog || []).slice(-20)).catch(() => []),
]);
const report = { ok: fails.length === 0, fails, log, dumps };
await writeFile(join(artifacts, 'mp_ntfy_stall.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fails: report.fails }, null, 2));
await browser.close();
server.close();
if (fails.length) process.exit(1);
