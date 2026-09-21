#!/usr/bin/env node
/**
 * Two-browser proof: live friend presence, then Join Session code puts
 * both players in the SAME lobby (including after the host backgrounds).
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
  page.setDefaultTimeout(20000);
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

const host = await openPlayer('host', seed('Host', 'HOSTTEST1'));
const guest = await openPlayer('guest', seed('Guest', 'GUESTTEST1'));
await sleep(400);

try {
  await host.evaluate(() => sendFriendRequest('GUESTTEST1'));
  await guest.waitForFunction(() => {
    const el = document.getElementById('inviteBanner');
    return !!(el && el.classList.contains('show') && /add you/i.test(el.innerText || ''));
  }, { timeout: 8000 });
  await guest.evaluate(() => {
    const btn = document.getElementById('inviteAcceptBtn');
    if (btn) btn.click();
  });
  await sleep(500);
  must(await host.evaluate(() => (state.friends || []).some((f) => f.id === 'GUESTTEST1')), 'host added guest');
  must(await guest.evaluate(() => (state.friends || []).some((f) => f.id === 'HOSTTEST1')), 'guest added host');

  await host.evaluate(() => showView('friends'));
  await guest.evaluate(() => showView('friends'));
  const online = await Promise.all([
    host.waitForFunction(() => typeof friendOnline === 'function' && friendOnline('GUESTTEST1'), { timeout: 12000 }).then(() => true).catch(() => false),
    guest.waitForFunction(() => typeof friendOnline === 'function' && friendOnline('HOSTTEST1'), { timeout: 12000 }).then(() => true).catch(() => false),
  ]);
  console.log('live online', online);
  must(online[0], 'host sees guest Online');
  must(online[1], 'guest sees host Online');
  const hostFriendsText = await host.evaluate(() => (document.getElementById('friendsList') || {}).innerText || '');
  const guestFriendsText = await guest.evaluate(() => (document.getElementById('friendsList') || {}).innerText || '');
  must(/Online/.test(hostFriendsText), 'host friends list says Online');
  must(/Online/.test(guestFriendsText), 'guest friends list says Online');
  await host.screenshot({ path: join(artifacts, 'mp_host_sees_guest_online.png') });
  await guest.screenshot({ path: join(artifacts, 'mp_guest_sees_host_online.png') });

  await host.evaluate(() => showView('home'));
  await host.evaluate(() => openLobby({ mode: 'practice', practiceSub: 'duel', seats: 4, difficulty: 'Easy', buyIn: 0 }));
  const code = await host.evaluate(() => (document.getElementById('lobbyCodeText') || {}).textContent.trim());
  console.log('lobby code', code);
  must(code && code.length >= 4, 'host has a join code');

  await host.evaluate(() => PalaceNet.disconnect());
  await guest.evaluate((c) => joinLobby(c), code);
  await sleep(400);
  await host.evaluate(() => {
    PalaceNet.resume();
    if (session && session.code) PalaceNet.watchLobby(session.code);
  });

  const seated = await Promise.all([
    host.waitForFunction(() => {
      const s = window.__palaceSession && window.__palaceSession();
      return !!(s && (s.seats || []).some((row) => row && row.id === 'GUESTTEST1'));
    }, { timeout: 12000 }).then(() => true).catch(() => false),
    guest.waitForFunction(() => {
      const s = window.__palaceSession && window.__palaceSession();
      return !!(s && s.hostId && (s.seats || []).some((row) => row && row.id === 'HOSTTEST1') && (s.seats || []).some((row) => row && row.id === 'GUESTTEST1'));
    }, { timeout: 12000 }).then(() => true).catch(() => false),
  ]);
  console.log('seated after join-by-code', seated);
  must(seated[0], 'host lobby received the guest after join-by-code');
  must(seated[1], 'guest joined the host lobby, not an empty session');

  const views = await Promise.all([
    host.evaluate(() => ({
      code: (document.getElementById('lobbyCodeText') || {}).textContent.trim(),
      names: [...document.querySelectorAll('.lobby-pad .pad-name')].map((n) => n.textContent.trim()),
      empty: document.querySelectorAll('.lobby-pad.open').length,
    })),
    guest.evaluate(() => ({
      code: (document.getElementById('lobbyCodeText') || {}).textContent.trim(),
      names: [...document.querySelectorAll('.lobby-pad .pad-name')].map((n) => n.textContent.trim()),
      hostId: window.__palaceSession().hostId,
      you: ((document.querySelector('.lobby-pad.you .pad-name') || {}).textContent || '').trim(),
    })),
  ]);
  console.log('lobby views', views);
  must(views[0].code === views[1].code, 'both show the same lobby code');
  must(views[1].hostId === 'HOSTTEST1', 'guest session is hosted by the original host');
  must(views[0].names.some((n) => /guest/i.test(n)), 'host sees Guest seated');
  must(views[1].names.some((n) => /host/i.test(n)), 'guest sees Host seated');
  await host.screenshot({ path: join(artifacts, 'mp_join_code_host_lobby.png') });
  await guest.screenshot({ path: join(artifacts, 'mp_join_code_guest_lobby.png') });
} catch (err) {
  fails.push(String(err && err.stack ? err.stack : err));
  try { await host.screenshot({ path: join(artifacts, 'mp_join_presence_host_fail.png') }); } catch (_) { /* ignore */ }
  try { await guest.screenshot({ path: join(artifacts, 'mp_join_presence_guest_fail.png') }); } catch (_) { /* ignore */ }
}

const report = { ok: fails.length === 0, fails };
await writeFile(join(artifacts, 'mp_join_presence.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
if (fails.length) process.exit(1);
