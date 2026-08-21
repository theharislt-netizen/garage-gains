#!/usr/bin/env node
/**
 * Copies garage-gains.html into www/index.html, swaps Google Fonts for
 * locally bundled woff2 files, injects the native bridge, copies www to
 * docs/ for GitHub Pages, and writes live-update/ for Android + iPhone.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile, access, cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import * as esbuild from 'esbuild';
import { makeLiveBundle } from './make-live-bundle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');
const docs = join(root, 'docs');
const fontsDir = join(www, 'fonts');

const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function download(url, dest, headers = {}) {
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function ensureFonts() {
  await mkdir(fontsDir, { recursive: true });
  const cssPath = join(fontsDir, 'fonts.css');
  if (await exists(cssPath)) {
    const existing = await readFile(cssPath, 'utf8');
    const localFiles = [...existing.matchAll(/url\(\.\/([^)]+)\)/g)].map((m) => m[1]);
    const allPresent =
      existing.includes('@font-face') &&
      localFiles.length > 0 &&
      (await Promise.all(localFiles.map((f) => exists(join(fontsDir, f))))).every(Boolean);
    if (allPresent) return;
  }

  const cssRes = await fetch(FONT_CSS_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    },
  });
  if (!cssRes.ok) throw new Error(`Font CSS fetch failed: ${cssRes.status}`);
  let css = await cssRes.text();
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
  if (urls.length === 0) throw new Error('No font file URLs found in Google Fonts CSS');

  let i = 0;
  for (const url of urls) {
    i += 1;
    const ext = url.includes('.woff2') ? 'woff2' : url.includes('.woff') ? 'woff' : 'ttf';
    const name = `font-${i}.${ext}`;
    const dest = join(fontsDir, name);
    if (!(await exists(dest))) {
      process.stdout.write(`Downloading ${name}...\n`);
      await download(url, dest);
    }
    css = css.split(url).join(`./${name}`);
  }
  await writeFile(cssPath, css);
}

async function bundleNativeBridge() {
  await esbuild.build({
    entryPoints: [join(root, 'scripts/native-bridge.mjs')],
    outfile: join(www, 'native-bridge.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2019'],
    minify: true,
    legalComments: 'none',
  });
}

function patchHtml(html) {
  html = html.replace(
    /<meta name="viewport"[^>]*>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">'
  );

  if (!html.includes('theme-color')) {
    html = html.replace(
      '</title>',
      '</title>\n<meta name="theme-color" content="#09080f">\n<meta name="color-scheme" content="dark">'
    );
  }

  html = html.replace(
    /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+" rel="stylesheet">/,
    '<link rel="stylesheet" href="./fonts/fonts.css">'
  );

  const inject = `
<style id="native-app-css">
  html.native-app, html.native-app body { background: #09080f; }
</style>
<script src="./native-bridge.js"></script>
`;
  if (!html.includes('native-bridge.js')) {
    html = html.replace('</body>', `${inject}</body>`);
  }
  if (!html.includes('apple-mobile-web-app-capable')) {
    html = html.replace(
      '</title>',
      '</title>\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="RIGCORE">\n<link rel="apple-touch-icon" href="./icon.png">\n<link rel="manifest" href="./manifest.webmanifest">'
    );
  }
  return html;
}

await mkdir(www, { recursive: true });
await ensureFonts();
await bundleNativeBridge();

const src = join(root, 'garage-gains.html');
const html = patchHtml(await readFile(src, 'utf8'));
await writeFile(join(www, 'index.html'), html);
await writeFile(join(www, '.nojekyll'), '');
await writeFile(
  join(www, 'manifest.webmanifest'),
  JSON.stringify({
    name: 'RIGCORE',
    short_name: 'RIGCORE',
    start_url: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#09080f',
    theme_color: '#09080f',
    icons: [{ src: './icon.png', sizes: '1024x1024', type: 'image/png' }],
  }, null, 2) + '\n'
);

const iconSrc = join(root, 'resources/icon.png');
if (await exists(iconSrc)) {
  await copyFile(iconSrc, join(www, 'icon.png'));
}

await makeLiveBundle();

await rm(docs, { recursive: true, force: true });
await cp(www, docs, { recursive: true });
console.log('www/ prepared (docs/ updated for GitHub Pages)');
