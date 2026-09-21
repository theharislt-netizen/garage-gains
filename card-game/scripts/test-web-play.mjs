#!/usr/bin/env node
/**
 * Browser play loader must unzip the live table and reach the home UI,
 * including from a join hash. A write-then-read inflate deadlocks on large
 * zip entries and leaves friends stuck on "Updating to …".
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
const port = 8808;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.zip': 'application/zip',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let rel = url === '/' ? 'scripts/web-play.html' : url.replace(/^\//, '');
  if (rel === 'www.zip') rel = 'live-update/www.zip';
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

const zip = await readFile(join(root, 'live-update/www.zip'));
const u8 = new Uint8Array(zip);
const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
let eocd = -1;
for (let i = u8.length - 22; i >= 0; i--) {
  if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
}
const count = view.getUint16(eocd + 10, true);
let p = view.getUint32(eocd + 16, true);
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
let unzipped = 0;
const t0 = Date.now();
for (let n = 0; n < count; n++) {
  const method = view.getUint16(p + 10, true);
  const comp = view.getUint32(p + 20, true);
  const nameLen = view.getUint16(p + 28, true);
  const extraLen = view.getUint16(p + 30, true);
  const commentLen = view.getUint16(p + 32, true);
  const localOff = view.getUint32(p + 42, true);
  const name = new TextDecoder().decode(u8.slice(p + 46, p + 46 + nameLen));
  p += 46 + nameLen + extraLen + commentLen;
  const lname = view.getUint16(localOff + 26, true);
  const lextra = view.getUint16(localOff + 28, true);
  const data = u8.slice(localOff + 30 + lname + lextra, localOff + 30 + lname + lextra + comp);
  if (method === 8) await inflateRaw(data);
  unzipped += 1;
  if (name === 'index.html' && method === 8 && data.length < 1000) throw new Error('index.html too small');
}
const unzipMs = Date.now() - t0;
if (unzipMs > 8000) throw new Error('unzip too slow: ' + unzipMs);

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.setDefaultNavigationTimeout(40000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:' + port + '/#j=JOIN1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const boot = document.querySelector('#boot p');
  if (boot && /Load failed/i.test(boot.textContent || '')) return 'fail:' + boot.textContent;
  if (document.querySelector('[data-view="home"], #nameSetupOverlay, #joinOverlay, #homeView')) return 'ok';
  return false;
}, { timeout: 25000 });
await new Promise((r) => setTimeout(r, 400));
const state = await page.evaluate(() => {
  const boot = document.querySelector('#boot p');
  return {
    href: location.href,
    hash: location.hash,
    boot: boot ? boot.textContent : '',
    hasHome: !!(document.querySelector('[data-view="home"]') || document.getElementById('homeView') || document.querySelector('.mode-hand, #modeHand')),
    hasName: !!document.getElementById('nameSetupOverlay'),
    hasJoin: !!document.getElementById('joinOverlay'),
    title: document.title,
    body: (document.body && document.body.innerText || '').slice(0, 160),
  };
});
await page.screenshot({ path: join(artifacts, 'web_play_join_link_boots.png'), type: 'png' });
await browser.close();
server.close();

const stuck = /Updating to/i.test(state.boot);
const ok = !stuck && state.hash.includes('j=JOIN1') && (state.hasHome || state.hasName || state.hasJoin || /PALACE/i.test(state.body));
const report = { ok, unzipped, unzipMs, stuck, state, errors: errors.slice(0, 8) };
await writeFile(join(artifacts, 'web_play_boot.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(1);
