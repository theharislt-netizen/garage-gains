#!/usr/bin/env node
/**
 * Two-origin (phone-like) proof: ntfy relays only, no shared BroadcastChannel.
 * Host loads 127.0.0.1, guest loads localhost — different origins, same path
 * two phones use. Covers live Online status and join-by-code into one lobby.
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
const port = 8796;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function todayStamp() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const stamp = Date.now().toString(36).slice(-5).toUpperCase();
const HOST_ID = ('H' + stamp).slice(0, 10);
const GUEST_ID = ('G' + stamp).slice(0, 10);

function seed(name, id, friendId, friendName) {
  return {
    app: 'palace',
    format: 1,
    profile: { name, photo: '', border: null, id, nameSet: true },
    coins: 400,
    xp: 0,
    lastDailyLogin: todayStamp(),
    inventory: { items: [], shards: { cosmetic: 0 }, stones: { cosmetic: 0 } },
    equipped: { cardSkin: null, tableTheme: null, emote: null, chatBubble: null, profileBorder: null },
    friends: [{ id: friendId, name: friendName, lastSeen: Date.now() - 60000 }],
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

async function openPlayer(origin, alias, profile) {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
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

async function waitEval(page, fn, timeout = 25000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    try {
      last = await page.evaluate(fn);
      if (last) return last;
    } catch (_) { /* page may be mid-paint */ }
    await sleep(250);
  }
  return last;
}

function dumpNet() {
  return {
    origin: location.origin,
    id: state.profile && state.profile.id,
    friends: (state.friends || []).map((f) => f.id),
    online: typeof friendOnline === 'function' && (state.profile.id === window.__hostId
      ? friendOnline(window.__guestId)
      : friendOnline(window.__hostId)),
    relays: window.PalaceNet && PalaceNet.RELAYS,
    wanted: window.PalaceNet && PalaceNet.wantedSize,
    presence: Object.keys(presenceMap || {}),
  };
}

const host = await openPlayer(hostOrigin, 'host', seed('Host', HOST_ID, GUEST_ID, 'Guest'));
const guest = await openPlayer(guestOrigin, 'guest', seed('Guest', GUEST_ID, HOST_ID, 'Host'));
await host.evaluate((a, b) => { window.__hostId = a; window.__guestId = b; }, HOST_ID, GUEST_ID);
await guest.evaluate((a, b) => { window.__hostId = a; window.__guestId = b; }, HOST_ID, GUEST_ID);
await sleep(800);

try {
  const origins = await Promise.all([
    host.evaluate(() => location.origin),
    guest.evaluate(() => location.origin),
  ]);
  must(origins[0] !== origins[1], 'host and guest are on different origins (no BroadcastChannel)');
  console.log('ids', { HOST_ID, GUEST_ID, origins });

  await host.evaluate(() => showView('friends'));
  await guest.evaluate(() => showView('friends'));
  const online = await Promise.all([
    waitEval(host, () => typeof friendOnline === 'function' && friendOnline(window.__guestId), 25000),
    waitEval(guest, () => typeof friendOnline === 'function' && friendOnline(window.__hostId), 25000),
  ]);
  console.log('live online', online, await host.evaluate(dumpNet), await guest.evaluate(dumpNet));
  must(online[0], 'host sees guest Online over ntfy');
  must(online[1], 'guest sees host Online over ntfy');
  const hostFriendsText = await host.evaluate(() => (document.getElementById('friendsList') || {}).innerText || '');
  const guestFriendsText = await guest.evaluate(() => (document.getElementById('friendsList') || {}).innerText || '');
  console.log('host friends', hostFriendsText.replace(/\s+/g, ' ').trim());
  console.log('guest friends', guestFriendsText.replace(/\s+/g, ' ').trim());
  must(/Online/.test(hostFriendsText), 'host friends list says Online');
  must(/Online/.test(guestFriendsText), 'guest friends list says Online');
  await host.screenshot({ path: join(artifacts, 'mp_host_sees_guest_online.png') });
  await guest.screenshot({ path: join(artifacts, 'mp_guest_sees_host_online.png') });

  await host.evaluate(() => showView('home'));
  await host.evaluate(() => openLobby({ mode: 'standard', seats: 4, difficulty: 'Medium', buyIn: 100 }));
  const code = await host.evaluate(() => (document.getElementById('lobbyCodeText') || {}).textContent.trim());
  console.log('lobby code', code);
  must(code && code.length >= 4, 'host has a join code');

  await host.evaluate((gid) => inviteFriendToLobby(gid), GUEST_ID);
  await guest.waitForFunction(() => {
    const el = document.getElementById('inviteBanner');
    return !!(el && el.classList.contains('show') && /invited you/i.test(el.innerText || ''));
  }, { timeout: 20000 });
  const inviteCopy = await guest.evaluate(() => (document.getElementById('inviteBanner') || {}).innerText || '');
  console.log('guest invite', inviteCopy.replace(/\s+/g, ' ').trim());
  must(new RegExp(code, 'i').test(inviteCopy), 'invite carries the host lobby code');
  await guest.screenshot({ path: join(artifacts, 'mp_invite_received_guest.png') });

  await guest.evaluate(() => {
    const btn = document.getElementById('inviteAcceptBtn');
    if (btn) btn.click();
  });
  const joiningSnap = await guest.evaluate(() => {
    const s = window.__palaceSession && window.__palaceSession();
    const body = (document.getElementById('lobbyBody') || {}).innerText || '';
    const ids = ((s && s.seats) || []).map((row) => String((row && row.id) || '').toUpperCase());
    return {
      body,
      seated: !!(s && s.hostId) && ids.includes(window.__hostId),
      host: typeof isLobbyHost === 'function' && isLobbyHost(),
      emptyPads: document.querySelectorAll('.lobby-pad.open').length,
    };
  });
  console.log('joining snap', joiningSnap);
  must(/joining host lobby/i.test(joiningSnap.body) || joiningSnap.seated, 'accepting an invite does not open a new empty lobby');
  must(!joiningSnap.host, 'guest is never marked as host of the invite lobby');

  const [hostSeated, guestSeated] = await Promise.all([
    waitEval(host, () => {
      const s = window.__palaceSession && window.__palaceSession();
      const ids = ((s && s.seats) || []).map((row) => String((row && row.id) || '').toUpperCase());
      return ids.includes(window.__guestId);
    }, 25000),
    waitEval(guest, () => {
      const s = window.__palaceSession && window.__palaceSession();
      const ids = ((s && s.seats) || []).map((row) => String((row && row.id) || '').toUpperCase());
      return !!(s && s.hostId) && ids.includes(window.__hostId) && ids.includes(window.__guestId)
        && !/joining host lobby/i.test((document.getElementById('lobbyBody') || {}).innerText || '');
    }, 25000),
  ]);
  console.log('seated after invite', [!!hostSeated, !!guestSeated]);
  must(hostSeated, 'host lobby received the guest after they accepted the invite');
  must(guestSeated, 'guest joined the host lobby, not an empty session');

  const views = await Promise.all([
    host.evaluate(() => ({
      code: (document.getElementById('lobbyCodeText') || {}).textContent.trim(),
      names: [...document.querySelectorAll('.lobby-pad .pad-name')].map((n) => n.textContent.trim()),
      empty: document.querySelectorAll('.lobby-pad.open').length,
      origin: location.origin,
      host: typeof isLobbyHost === 'function' && isLobbyHost(),
    })),
    guest.evaluate(() => ({
      code: (document.getElementById('lobbyCodeText') || {}).textContent.trim(),
      names: [...document.querySelectorAll('.lobby-pad .pad-name')].map((n) => n.textContent.trim()),
      hostId: window.__palaceSession().hostId,
      you: ((document.querySelector('.lobby-pad.you .pad-name') || {}).textContent || '').trim(),
      origin: location.origin,
      host: typeof isLobbyHost === 'function' && isLobbyHost(),
      joining: /joining host lobby/i.test((document.getElementById('lobbyBody') || {}).innerText || ''),
    })),
  ]);
  console.log('lobby views', views);
  must(views[0].origin !== views[1].origin, 'join used two origins');
  must(views[0].code === views[1].code, 'both show the same lobby code');
  must(views[1].hostId === HOST_ID, 'guest session is hosted by the original host');
  must(views[0].host && !views[1].host, 'only the original host is the lobby host');
  must(views[0].names.some((n) => /guest/i.test(n)), 'host sees Guest seated');
  must(views[1].names.some((n) => /host/i.test(n)), 'guest sees Host seated');
  must(!views[1].joining, 'guest left the joining screen after seating');
  await host.screenshot({ path: join(artifacts, 'mp_join_code_host_lobby.png') });
  await guest.screenshot({ path: join(artifacts, 'mp_join_code_guest_lobby.png') });

  const onlineAfter = await Promise.all([
    host.evaluate(() => friendOnline(window.__guestId)),
    guest.evaluate(() => friendOnline(window.__hostId)),
  ]);
  console.log('online after join', onlineAfter);
  must(onlineAfter[0] && onlineAfter[1], 'presence stays live both ways after the invite join');

  await host.evaluate(() => leaveSession());
  await guest.evaluate(() => leaveSession());
  await sleep(800);

  await guest.evaluate(() => openLobby({ mode: 'standard', seats: 4, difficulty: 'Medium', buyIn: 100 }));
  const code2 = await guest.evaluate(() => (document.getElementById('lobbyCodeText') || {}).textContent.trim());
  await guest.evaluate((hid) => inviteFriendToLobby(hid), HOST_ID);
  await host.waitForFunction(() => {
    const el = document.getElementById('inviteBanner');
    return !!(el && el.classList.contains('show') && /invited you/i.test(el.innerText || ''));
  }, { timeout: 20000 });
  const reverseCopy = await host.evaluate(() => (document.getElementById('inviteBanner') || {}).innerText || '');
  console.log('host invite', reverseCopy.replace(/\s+/g, ' ').trim());
  must(new RegExp(code2, 'i').test(reverseCopy), 'reverse invite carries the guest-hosted lobby code');
  await host.screenshot({ path: join(artifacts, 'mp_invite_received_host.png') });
  await host.evaluate(() => {
    const btn = document.getElementById('inviteAcceptBtn');
    if (btn) btn.click();
  });
  const reverseSeated = await Promise.all([
    waitEval(guest, () => {
      const s = window.__palaceSession && window.__palaceSession();
      const ids = ((s && s.seats) || []).map((row) => String((row && row.id) || '').toUpperCase());
      return ids.includes(window.__hostId);
    }, 25000),
    waitEval(host, () => {
      const s = window.__palaceSession && window.__palaceSession();
      const ids = ((s && s.seats) || []).map((row) => String((row && row.id) || '').toUpperCase());
      return s && String(s.hostId).toUpperCase() === window.__guestId && ids.includes(window.__hostId);
    }, 25000),
  ]);
  console.log('reverse seated', reverseSeated);
  must(reverseSeated[0] && reverseSeated[1], 'invite works in the other direction into the same lobby');
  await guest.screenshot({ path: join(artifacts, 'mp_reverse_invite_guest_host.png') });
  await host.screenshot({ path: join(artifacts, 'mp_reverse_invite_host_guest.png') });
} catch (err) {
  fails.push(String(err && err.stack ? err.stack : err));
  try { await host.screenshot({ path: join(artifacts, 'mp_join_presence_host_fail.png') }); } catch (_) { /* ignore */ }
  try { await guest.screenshot({ path: join(artifacts, 'mp_join_presence_guest_fail.png') }); } catch (_) { /* ignore */ }
}

const report = { ok: fails.length === 0, fails, HOST_ID, GUEST_ID };
await writeFile(join(artifacts, 'mp_join_presence.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
if (fails.length) process.exit(1);
