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
const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=820,900'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1 },
});
await browser.defaultBrowserContext().overridePermissions(origin, ['notifications']);

async function openPlayer(alias, profile) {
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((key, data) => {
    localStorage.setItem(key, data);
  }, 'palaceCards_v1::' + alias, JSON.stringify(profile));
  page.on('dialog', async (d) => { try { await d.accept(); } catch (_) { /* ignore */ } });
  await page.goto(origin + '/?as=' + alias, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.PalaceEngine && window.PalaceNet);
  await page.waitForFunction(() => document.getElementById('nameSetupOverlay').style.display !== 'flex');
  return page;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

const host = await openPlayer('host', seed('Host', 'HOSTTEST1'));
const guest = await openPlayer('guest', seed('Guest', 'GUESTTEST1'));

try {
  const hostId = await host.evaluate(() => state.profile.id);
  const guestId = await guest.evaluate(() => state.profile.id);
  must(hostId === 'HOSTTEST1' && guestId === 'GUESTTEST1', 'seeded profile IDs');

  await host.evaluate(() => showView('friends'));
  await host.waitForSelector('#friendSearch');
  await host.click('#friendSearch');
  await host.type('#friendSearch', 'GUESTTEST1');
  await host.click('#addFriendBtn');

  await guest.waitForSelector('#inviteBanner.show', { timeout: 12000 });
  const friendBanner = await guest.evaluate(() => document.querySelector('#inviteBanner').innerText);
  must(/add you/i.test(friendBanner), 'guest sees friend request banner');
  await guest.click('#inviteAcceptBtn');
  await sleep(400);
  const guestFriends = await guest.evaluate(() => (state.friends || []).map((f) => f.id));
  const hostFriends = await host.evaluate(() => (state.friends || []).map((f) => f.id));
  must(guestFriends.includes('HOSTTEST1'), 'guest added host');
  must(hostFriends.includes('GUESTTEST1'), 'host added guest after accept');

  await host.evaluate(() => showView('home'));
  await host.click('[data-mode="practice"]');
  await host.waitForSelector('#startPracticeBtn');
  await host.click('[data-practice="duel"]');
  await sleep(150);
  await host.click('#startPracticeBtn');
  await host.waitForSelector('#lobbyOverlay', { timeout: 8000 });
  await host.waitForFunction(() => document.getElementById('lobbyOverlay').style.display === 'flex');
  const lobbyOpen = await host.evaluate(() => document.getElementById('lobbyOverlay').style.display === 'flex' && !!document.getElementById('lobbyCodeText'));
  must(lobbyOpen, 'practice Start opens the lobby, not the table');
  const tableHidden = await host.evaluate(() => !document.getElementById('tableWindow').classList.contains('show'));
  must(tableHidden, 'host is not dropped into a match from Start');
  const code = await host.evaluate(() => document.getElementById('lobbyCodeText').textContent.trim());
  must(code.length >= 4, 'lobby has a shareable code');

  await host.waitForSelector('[data-invite-friend="GUESTTEST1"]', { timeout: 8000 });
  await host.click('[data-invite-friend="GUESTTEST1"]');
  await guest.waitForSelector('#inviteBanner.show', { timeout: 12000 });
  const inviteText = await guest.evaluate(() => document.querySelector('#inviteBanner').innerText);
  must(/invited you/i.test(inviteText) && inviteText.includes(code), 'guest sees in-app lobby invite');
  const notifOk = await guest.evaluate(() => typeof Notification !== 'undefined' && Notification.permission === 'granted');
  must(notifOk, 'guest notification permission granted for push');
  await guest.click('#inviteAcceptBtn');
  await guest.waitForFunction(() => document.getElementById('lobbyOverlay').style.display === 'flex', { timeout: 12000 });
  await sleep(600);
  const guestSeated = await guest.evaluate(() => {
    const s = window.__palaceSession && window.__palaceSession();
    return !!(s && (s.seats || []).some((row) => row && row.id === 'GUESTTEST1'));
  });
  const hostSeesGuest = await host.evaluate(() => {
    const s = window.__palaceSession && window.__palaceSession();
    return !!(s && (s.seats || []).some((row) => row && row.id === 'GUESTTEST1'));
  });
  must(guestSeated && hostSeesGuest, 'guest is seated in the lobby on both clients');

  await host.click('#lobbyStartBtn');
  await host.waitForFunction(() => document.getElementById('tableWindow').classList.contains('show'), { timeout: 15000 });
  await guest.waitForFunction(() => document.getElementById('tableWindow').classList.contains('show'), { timeout: 15000 });
  await sleep(1800);

  const bothAtTable = await Promise.all([
    host.evaluate(() => !!(match && match.players.length === 2 && document.getElementById('tableWindow').classList.contains('show'))),
    guest.evaluate(() => !!(match && match.players.length === 2 && document.getElementById('tableWindow').classList.contains('show'))),
  ]);
  must(bothAtTable[0] && bothAtTable[1], 'both clients are in the match');

  const humans = await Promise.all([
    host.evaluate(() => match.players.filter((p) => !p.isBot).map((p) => p.profileId)),
    guest.evaluate(() => match.players.filter((p) => !p.isBot).map((p) => p.profileId)),
  ]);
  must(humans[0].includes('HOSTTEST1') && humans[0].includes('GUESTTEST1'), 'host match has two humans');
  must(humans[1].includes('HOSTTEST1') && humans[1].includes('GUESTTEST1'), 'guest match has two humans');

  await host.waitForFunction(() => typeof canActOnCards === 'function');
  const played = await host.evaluate(async () => {
    if (!match) return false;
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
    if (!legal) return false;
    await runMove(legal);
    return true;
  });
  must(played, 'host played a card');
  await sleep(1200);
  const guestSawPlay = await guest.evaluate(() => {
    if (!match || !match.pile.length) return false;
    return match.pile.some((c) => c.id === '4H' || c.rank === '4');
  });
  must(guestSawPlay, 'guest table received the host play');

  await guest.evaluate(() => showView('home'));
  const joinTile = await guest.evaluate(() => {
    const btn = document.querySelector('[data-mode="join"]');
    return btn ? btn.innerText.replace(/\s+/g, ' ') : '';
  });
  must(/Join Session/i.test(joinTile), 'Join Session tile is on home');
  await guest.click('[data-mode="join"]');
  await guest.waitForFunction(() => document.getElementById('joinOverlay').style.display === 'flex');
  must(true, 'Join Session overlay opens from home');

  const shots = {
    hostLobby: await host.screenshot({ path: join(artifacts, 'palace_mp_host_table.png') }),
    guestTable: await guest.screenshot({ path: join(artifacts, 'palace_mp_guest_table.png') }),
  };
  void shots;
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
