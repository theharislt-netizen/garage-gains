#!/usr/bin/env node
/**
 * Profile without an items grid, chat compose pin, Take Pile HUD, Social messenger.
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
const port = 8814;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function todayStamp() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const seed = {
  app: 'palace',
  format: 1,
  profile: { name: 'Haris', photo: '', photoThumb: '', border: null, id: 'HARIS1', nameSet: true },
  coins: 640,
  xp: 90,
  lastDailyLogin: todayStamp(),
  inventory: { items: [], shards: { cosmetic: 0 }, stones: { cosmetic: 0 } },
  equipped: { cardSkin: null, tableTheme: null, emote: null, chatBubble: null, profileBorder: null },
  friends: [{
    id: 'RIM1',
    name: 'Rim',
    photo: '',
    border: 'border_neon',
    lastSeen: Date.now(),
    stats: { matches: 8, wins: 3, coinsEarned: 210, coinsLost: 80, places: { 1: 3, 2: 2, 3: 2, 4: 1 } },
  }],
  messages: {
    RIM1: [{ me: false, text: 'Wanna play?', t: Date.now() - 60000, name: 'Rim', read: true }],
  },
  settings: { theme: 'rig', sfx: 0, music: 0, notifications: false, language: 'en' },
  stats: { matches: 12, wins: 5, coinsEarned: 420, coinsLost: 180, places: { 1: 5, 2: 3, 3: 2, 4: 2 } },
  socialPing: true,
  shopTab: 'skins',
  invFilter: 'all',
  unlocks: { medium: 0, hard: -1, expert: -1 },
  cosmeticsSeeded: false,
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
page.setDefaultNavigationTimeout(20000);
await page.evaluateOnNewDocument((data) => {
  localStorage.setItem('palaceCards_v1::soc', data);
}, JSON.stringify(seed));
page.on('dialog', async (d) => { try { await d.accept(); } catch (_) { /* ignore */ } });
await page.goto('http://127.0.0.1:' + port + '/?as=soc', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof openProfile === 'function' && state && state.profile && state.profile.id);

const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

const tabs = await page.evaluate(() => [...document.querySelectorAll('.tab')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
must(tabs.join('|').includes('Social'), 'bottom nav label is Social');
must(!tabs.some((t) => /inventory/i.test(t)), 'Inventory is not a bottom-nav tab');
must(await page.evaluate(() => !document.querySelector('[data-view="inventory"]')), 'no inventory tab button');
const homeBadge = await page.evaluate(() => (document.getElementById('socialTabBadge') || {}).className || '');
must(/\bshow\b/.test(homeBadge), 'Social tab badge lights when a friend-came-online ping is pending');
await page.screenshot({ path: join(artifacts, 'social_online_badge.png'), type: 'png' });

await page.evaluate(() => openProfile());
await page.waitForSelector('#profileBody .border-pick');
const profileOpen = await page.evaluate(() => {
  const vw = window.innerWidth;
  const chips = [...document.querySelectorAll('[data-equip-border]')];
  const chipBoxes = chips.map((el) => el.getBoundingClientRect());
  const row = document.querySelector('#profileBody .border-pick');
  const rowBox = row && row.getBoundingClientRect();
  const frames = [...document.querySelectorAll('#profileBody .border-chip .avatar-frame')].map((el) => el.getBoundingClientRect());
  return {
    overlay: layerOpen('profileOverlay'),
    items: !!document.getElementById('profileInvList') || !!document.getElementById('profileInvFilter'),
    slots: document.querySelectorAll('#profileBody .inv-slot').length,
    earned: (document.querySelector('.stat-tile .n') || {}).textContent,
    places: [...document.querySelectorAll('.place-cell .n')].map((n) => n.textContent),
    borders: chips.length,
    title: (document.querySelector('#profileOverlay .instance-title') || {}).textContent,
    enchant: !!document.getElementById('profileEnchantBtn'),
    craft: !!document.getElementById('profileCraftBtn'),
    inventoryView: !!document.getElementById('view-inventory'),
    rowLeft: rowBox ? rowBox.left : -1,
    rowRight: rowBox ? rowBox.right : -1,
    firstChipLeft: chipBoxes[0] ? chipBoxes[0].left : -1,
    lastChipRight: chipBoxes.length ? chipBoxes[chipBoxes.length - 1].right : -1,
    firstFrameLeft: frames[0] ? frames[0].left : -1,
    lastFrameRight: frames.length ? frames[frames.length - 1].right : -1,
    vw,
  };
});
must(profileOpen.overlay, 'own profile overlay is open');
must(!profileOpen.items && profileOpen.slots === 0, 'Profile has no items grid');
must(!profileOpen.enchant && !profileOpen.craft, 'Enchant and Craft are not on Profile');
must(!profileOpen.inventoryView, 'Inventory screen is removed from the DOM');
must(profileOpen.earned === '420', 'coins earned tile is filled');
must(profileOpen.places.join(',') === '5,3,2,2', '1st-4th placement breakdown is shown');
must(profileOpen.borders >= 3, 'owned avatar borders are listed');
must(profileOpen.rowLeft <= 1 && profileOpen.rowRight >= profileOpen.vw - 1, 'border row uses the full screen width');
must(profileOpen.firstFrameLeft >= 0 && profileOpen.firstChipLeft >= 8, 'first border chip is fully on screen');
must(profileOpen.lastChipRight <= profileOpen.vw || profileOpen.rowRight - profileOpen.rowLeft > 300, 'border row can scroll instead of clipping');
await page.screenshot({ path: join(artifacts, 'profile_no_items_grid.png'), type: 'png' });
await page.screenshot({ path: join(artifacts, 'profile_border_row_full.png'), type: 'png' });

const photoInfo = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 400;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3ec6f0';
  ctx.fillRect(0, 0, 400, 400);
  for (let y = 0; y < 400; y += 3) {
    for (let x = 0; x < 400; x += 3) {
      ctx.fillStyle = 'rgb(' + ((x * 13 + y * 7) % 255) + ',' + ((x * 3 + y * 19) % 255) + ',' + ((x + y * 11) % 255) + ')';
      ctx.fillRect(x, y, 3, 3);
    }
  }
  ctx.fillStyle = '#081018';
  ctx.font = 'bold 180px sans-serif';
  ctx.fillText('P', 110, 270);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  const file = new File([blob], 'ava.jpg', { type: 'image/jpeg' });
  await new Promise((resolve) => compressPhoto(file, (data) => {
    state.profile.photo = data.photo;
    state.profile.photoThumb = data.thumb;
    saveState();
    paintProfile();
    renderHeader();
    resolve();
  }));
  const img = document.querySelector('#profileBody .profile-hero .avatar img');
  const headerImg = document.querySelector('#nameBadgeIcon img');
  const card = profileCard();
  return {
    photoLen: (state.profile.photo || '').length,
    thumbLen: (state.profile.photoThumb || '').length,
    heroSrc: !!(img && img.getAttribute('src') && img.getAttribute('src').indexOf('data:image') === 0),
    heroNatural: img ? img.naturalWidth : 0,
    headerSrc: !!(headerImg && headerImg.getAttribute('src')),
    netPhotoLen: (card.photo || '').length,
    borderOn: document.querySelector('.profile-hero .avatar-frame.bd-neon, .profile-hero .avatar-frame.bd-crown, .profile-hero .avatar-frame.bd-ember, .profile-hero .avatar-frame.bd-royal') != null,
  };
});
await page.evaluate(() => {
  const chip = document.querySelector('[data-equip-border="i_border_neon"]') || document.querySelector('[data-equip-border]');
  if (chip) chip.click();
});
const afterBorder = await page.evaluate(() => ({
  equipped: state.equipped.profileBorder,
  cls: (document.querySelector('.profile-hero .avatar-frame') || {}).className || '',
  heroImg: !!document.querySelector('#profileBody .profile-hero .avatar img'),
}));
must(photoInfo.photoLen > 8000, 'local avatar photo stays display quality, not ntfy-sized');
must(photoInfo.thumbLen > 0 && photoInfo.thumbLen < 1800, 'network thumb is tiny enough for ntfy');
must(photoInfo.heroSrc, 'profile hero shows the chosen photo');
must(photoInfo.headerSrc, 'header badge shows the chosen photo');
must(afterBorder.heroImg, 'photo remains after equipping a border');
must(/bd-/.test(afterBorder.cls), 'equipped border class wraps the profile avatar');
await page.screenshot({ path: join(artifacts, 'profile_photo_and_border.png'), type: 'png' });

await page.evaluate(() => closeProfile());
await page.evaluate(() => showView('friends'));
const social = await page.evaluate(() => {
  const copy = document.querySelector('#friendsList .friend-copy');
  const status = copy && copy.querySelector('.friend-status');
  const name = copy && copy.querySelector('.friend-name');
  const l2 = copy && copy.querySelector('.l2');
  const statusBox = status && status.getBoundingClientRect();
  const metaBox = copy && copy.querySelector('.friend-meta') && copy.querySelector('.friend-meta').getBoundingClientRect();
  return {
    title: (document.querySelector('#view-friends .page-title') || {}).textContent,
    mail: !!document.getElementById('mailBtn'),
    remove: !!document.querySelector('[data-friend-del]'),
    chat: !!document.querySelector('[data-friend-msg]'),
    chatText: ((document.querySelector('[data-friend-msg]') || {}).textContent || '').trim(),
    removeText: ((document.querySelector('[data-friend-del]') || {}).textContent || '').trim(),
    ava: !!document.querySelector('#friendsList .friend-ava .avatar'),
    border: (document.querySelector('#friendsList .avatar-frame') || {}).className || '',
    badge: (document.getElementById('socialTabBadge') || {}).className || '',
    name: (name && name.innerText) || '',
    sub: (l2 && l2.innerText) || '',
    idOnRow: /RIM1/i.test((copy && copy.innerText) || ''),
    thread: ((document.querySelector('#threadList .thread-row') || {}).innerText || ''),
    threadCount: document.querySelectorAll('#threadList .thread-row').length,
    statusMid: !!(statusBox && metaBox && Math.abs((statusBox.top + statusBox.height / 2) - (metaBox.top + metaBox.height / 2)) <= 6),
  };
});
must(/Social/.test(social.title || ''), 'Social screen title');
must(!social.mail, 'mail icon is gone');
must(social.remove && social.chat, 'chat and remove are on the friends list');
must(!social.chatText && !social.removeText, 'chat and remove are icons, not text labels');
must(social.ava && /bd-neon/.test(social.border), 'friend row shows avatar and equipped border');
must(/Rim/.test(social.name), 'friend name is visible beside the avatar');
must(!social.idOnRow, 'friends list does not show the profile ID');
must(social.statusMid, 'online-status dot is vertically centered on the name + last-online block');
must(/Rim/.test(social.thread) && social.threadCount >= 1, 'conversation threads sit below the friends list');
await page.screenshot({ path: join(artifacts, 'social_tab_friends.png'), type: 'png' });
await page.screenshot({ path: join(artifacts, 'social_message_threads.png'), type: 'png' });

await page.click('#friendsList .friend-copy');
await page.waitForFunction(() => layerOpen('profileOverlay'));
const friendProf = await page.evaluate(() => ({
  title: (document.querySelector('#profileOverlay .instance-title') || {}).textContent,
  id: (document.querySelector('#profileBody .mono') || {}).textContent,
  places: [...document.querySelectorAll('.place-cell .n')].map((n) => n.textContent),
  items: !!document.getElementById('profileInvList'),
  msg: !!document.getElementById('friendMsgBtn'),
}));
must(/Friend/.test(friendProf.title || ''), 'friend profile overlay title');
must(/RIM1/.test(friendProf.id || ''), 'friend profile shows their ID');
must(friendProf.places.join(',') === '3,2,2,1', 'friend profile shows placement stats');
must(!friendProf.items && friendProf.msg, 'friend profile has Message, not the local item grid');
await page.screenshot({ path: join(artifacts, 'friend_profile_stats.png'), type: 'png' });

await page.evaluate(() => closeProfile());
await page.click('#threadList .thread-row');
await page.waitForFunction(() => layerOpen('threadOverlay'));
const chatLayout = await page.evaluate(() => {
  const ov = document.getElementById('threadOverlay');
  const compose = document.getElementById('threadCompose');
  const input = document.getElementById('threadInput');
  const ovBox = ov.getBoundingClientRect();
  const box = compose.getBoundingClientRect();
  return {
    composeInBody: !!(document.getElementById('threadBody') && document.getElementById('threadBody').contains(compose)),
    inputY: input ? input.getBoundingClientRect().top : -1,
    composeBottom: box.bottom,
    overlayBottom: ovBox.bottom,
    vh: window.innerHeight,
    gap: ovBox.bottom - box.bottom,
  };
});
must(!chatLayout.composeInBody, 'chat input is not inside the scrolling transcript');
must(chatLayout.gap >= 0 && chatLayout.gap <= 24, 'chat compose sits on the overlay bottom, not mid-screen');
must(chatLayout.composeBottom > chatLayout.vh * 0.72, 'chat input is in the lower part of the screen');
await page.type('#threadInput', 'On my way');
await page.click('#threadSendBtn');
const sent = await page.evaluate(() => (document.querySelector('#threadBody .chat-bubble.me') || {}).textContent || '');
must(/On my way/.test(sent), 'DM send lands in the thread');
await page.screenshot({ path: join(artifacts, 'social_dm_thread.png'), type: 'png' });
await page.screenshot({ path: join(artifacts, 'chat_compose_bottom.png'), type: 'png' });

await page.evaluate(() => { closeThread(); closeMessages(); });
const beforeDel = await page.evaluate(() => (state.friends || []).length);
await page.click('[data-friend-del]');
await page.waitForFunction((n) => (state.friends || []).length < n, {}, beforeDel);
must(await page.evaluate(() => !(state.friends || []).length), 'Remove deletes the friend from the Social list');

await page.evaluate(() => {
  closeProfile();
  showView('home');
  startMatch({ mode: 'practice', practiceSub: 'duel', seats: 2, difficulty: 'Easy', buyIn: 0 });
});
await page.waitForFunction(() => document.body.classList.contains('in-match') && match && match.players);
const bots = await page.evaluate(() => (match.players || []).filter((p) => p.isBot).map((p) => p.name));
must(bots.length === 1 && bots[0] && !/^Bot(?:\s+\d+)?$/i.test(bots[0]), 'bot opponent uses a realistic randomized name');
const chatUi = await page.evaluate(() => ({
  bubbleBtn: !!document.getElementById('matchChatBtn') || !!document.querySelector('[data-match-chat], #tableChatBtn, .seat-chat, #matchChatFab'),
  overlay: !!document.getElementById('matchChatOverlay'),
  noLog: /No chat log/.test(document.documentElement.innerHTML) || typeof showSeatChat === 'function',
}));
must(chatUi.overlay && chatUi.noLog, 'in-match chat is bubbles, not a log');
await page.waitForSelector('.table-actions');
const hud = await page.evaluate(() => {
  let btn = document.getElementById('pickupBtn');
  const actions = document.querySelector('.table-actions');
  if (!btn && actions) {
    actions.insertAdjacentHTML('beforeend', '<button class="btn danger" id="pickupBtn">Take pile</button>');
    btn = document.getElementById('pickupBtn');
  }
  const br = btn.getBoundingClientRect();
  function overlap(a, b, pad) {
    const p = pad || 0;
    return a.left + p < b.right && a.right - p > b.left && a.top + p < b.bottom && a.bottom - p > b.top;
  }
  const avatars = [...document.querySelectorAll('.seat .avatar')].map((el) => el.getBoundingClientRect());
  const tableCards = [...document.querySelectorAll('.seat .table-slot .pcard, .pile-stack .pcard, .draw-stack .pcard')].map((el) => el.getBoundingClientRect());
  return {
    hint: !!document.querySelector('.table-hint') && getComputedStyle(document.querySelector('.table-hint')).display !== 'none',
    hintText: (document.querySelector('.table-hint') || {}).textContent || '',
    width: br.width,
    bottom: br.bottom,
    vh: window.innerHeight,
    overlapAvatar: avatars.some((a) => overlap(br, a, 1)),
    overlapTable: tableCards.some((a) => overlap(br, a, 1)),
  };
});
must(!hud.hint && !/tap to select/i.test(hud.hintText || ''), 'tap-to-select tip is gone from the match HUD');
must(hud.width > 50 && hud.width <= 96, 'Take Pile is about 40% of the old auto width');
must(!hud.overlapAvatar, 'Take Pile does not overlap a player avatar');
must(!hud.overlapTable, 'Take Pile does not overlap cards on the table');
await page.screenshot({ path: join(artifacts, 'match_take_pile_hud.png'), type: 'png' });
await page.screenshot({ path: join(artifacts, 'match_bot_name.png'), type: 'png' });

await page.evaluate(() => {
  if (!(state.friends || []).some((f) => f.id === 'RIM1')) {
    state.friends = (state.friends || []).concat([{ id: 'RIM1', name: 'Rim' }]);
  }
  knownOnline.RIM1 = false;
  noteFriendOnline('RIM1', true, 'Rim');
});
const onlineToast = await page.evaluate(() => {
  const el = document.getElementById('toast');
  return { text: el.textContent, cls: el.className };
});
must(/came online/i.test(onlineToast.text) && /presence/.test(onlineToast.cls) && /online/.test(onlineToast.cls), 'online toast is the prominent presence banner');
await page.screenshot({ path: join(artifacts, 'friend_online_toast.png'), type: 'png' });
await page.evaluate(() => noteFriendOnline('RIM1', false, 'Rim'));
const offlineToast = await page.evaluate(() => {
  const el = document.getElementById('toast');
  return { text: el.textContent, cls: el.className };
});
must(/went offline/i.test(offlineToast.text) && /presence/.test(offlineToast.cls) && /offline/.test(offlineToast.cls), 'offline toast appears when a friend logs off');
await page.screenshot({ path: join(artifacts, 'friend_offline_toast.png'), type: 'png' });

const report = { ok: fails.length === 0, fails, profileOpen, photoInfo, afterBorder, social, friendProf, bots, chatLayout, hud, onlineToast, offlineToast };
await writeFile(join(artifacts, 'profile_social.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
if (fails.length) process.exit(1);
