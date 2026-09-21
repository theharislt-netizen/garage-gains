#!/usr/bin/env node
/**
 * Guards the PALACE project setup: separate save key, reused inventory shell,
 * and the same live-update/APK wiring as RIGCORE.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..');
const fails = [];

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function must(cond, msg) {
  if (!cond) fails.push(msg);
}

const html = read('card-game.html');
const bridge = read('scripts/native-bridge.mjs');
const makeLive = read('scripts/make-live-bundle.mjs');
const pkg = JSON.parse(read('package.json'));
const cap = JSON.parse(read('capacitor.config.json'));
const gradle = read('android/app/build.gradle');
const strings = read('android/app/src/main/res/values/strings.xml');
const workflow = readFileSync(join(repoRoot, '.github/workflows/card-game-android.yml'), 'utf8');

must(html.includes("const STORE_KEY = 'palaceCards_v1'"), 'card-game.html must use palaceCards_v1');
must(!html.includes("STORE_KEY = 'garageGains_v1'") && !html.includes("getItem('garageGains_v1')"), 'card-game.html must not read/write garageGains_v1');
must(html.includes('APP_NAME = \'PALACE\''), 'app title must be PALACE');
must(html.includes('data-view="home"') && html.includes('data-view="shop"'), 'home/shop tabs required');
must(html.includes('id="view-inventory"') && html.includes('id="invEnchantEntry"') && html.includes('id="invCraftEntry"'), 'inventory shell remains in the DOM for Profile item browsing');
must(html.includes('id="profileInvFilter"') && html.includes('id="profileInvList"'), 'owned items browse inside Profile by category');
must(!html.includes("showView('inventory')"), 'Profile does not navigate away to a separate Inventory screen');
must(html.includes('>Social<') && html.includes('data-view="friends"') && html.includes('data-view="settings"'), 'Social tab replaces Friends');
must(!html.includes('data-view="inventory"'), 'Inventory is not a bottom-nav tab');
must(html.includes('data-view="subscription"'), 'subscription tab required');
must(html.includes('id="enchantWindow"'), 'enchant window overlay required');
must(html.includes('id="exportBtn"') && html.includes('id="importBtn"') && html.includes('id="addHomeBtn"'), 'settings backup + add-home hooks required for native-bridge');
must(html.includes('palace-net.js'), 'card-game.html must load palace-net.js');
must(existsSync(join(root, 'palace-net.js')), 'palace-net.js required');
must(existsSync(join(root, 'scripts/web-play.html')), 'web play loader required');
{
  const play = read('scripts/web-play.html');
  must(play.includes("pipeThrough(new DecompressionStream('deflate-raw'))"), 'web play unzip must pipe inflate or large files deadlock');
  must(!play.includes('getWriter()'), 'web play must not write-then-read DecompressionStream');
  must(play.includes('document.write(html)'), 'web play must boot in-place so iPhone join links are not stuck on Updating');
  must(!play.includes('location.replace'), 'web play must not navigate to a blob URL');
  must(play.includes('./www.zip'), 'web play prefers the same-origin zip on GitHub Pages');
}
must(read('scripts/prepare-www.mjs').includes('palace-net.js'), 'prepare:www copies palace-net.js');
must(read('scripts/prepare-www.mjs').includes('web-play.html'), 'prepare:www writes the play loader');
must(read('scripts/prepare-www.mjs').includes('www.zip'), 'prepare:www copies the live zip next to the play loader');
must(read('scripts/install-page.html').includes('./play/'), 'install page links the browser table');
must(html.includes('Starting balance') || html.includes('400'), 'starter coins (400) should be in the shell');
must(html.includes('function buildBackupPayload') || html.includes('window.buildBackupPayload'), 'backup payload must be exposed');
must(html.includes('applyImportedBackupText'), 'import hook must be exposed');
must(html.includes('showToast'), 'toast helper required');
must(html.includes('function handleAppBack'), 'card-game.html owns Android back navigation');
must(bridge.includes('handleAppBack') && bridge.includes("result === 'exit'"), 'native back button asks PALACE before exiting');
must(!bridge.includes('canGoBack'), 'native back must not treat WebView history as the app stack');

must(bridge.includes("STORE_KEY = 'palaceCards_v1'"), 'native-bridge must use palaceCards_v1');
must(!bridge.includes('garageGains_v1'), 'native-bridge must not use garageGains_v1');
must(bridge.includes("UPDATE_DIR = 'card-game/live-update'"), 'live-update path must be card-game/live-update');
must(bridge.includes("cursor/card-game-setup-e78b"), 'live-update must poll this branch first');
must(bridge.includes('CapacitorUpdater.download'), 'Capgo updater download required');
must(bridge.includes('checkAndApplyUpdate'), 'auto-update on open required');

must(makeLive.includes("UPDATE_DIR = 'card-game/live-update'"), 'bundle script must publish under card-game/live-update');
must(pkg.dependencies['@capgo/capacitor-updater'], 'Capgo updater dependency required');
must(cap.appId === 'com.palace.app', 'applicationId / appId must be com.palace.app');
must(cap.appName === 'PALACE', 'capacitor appName must be PALACE');
must(gradle.includes('applicationId "com.palace.app"'), 'Android applicationId must be com.palace.app');
must(gradle.includes('versionName "0.1.0"'), 'APK versionName must start at 0.1.0');
must(strings.includes('>PALACE<'), 'Android launcher label must be PALACE');
must(workflow.includes('card-game/dist/PALACE.apk') || workflow.includes('dist/PALACE.apk'), 'CI must upload PALACE.apk');
must(existsSync(join(root, 'android/app/keystore/palace-release.p12')), 'release keystore missing');
must(!existsSync(join(root, 'android/app/keystore/rigcore-release.p12')), 'must not ship the RIGCORE keystore in this app');

if (fails.length) {
  console.error('SETUP CHECKS FAILED:');
  for (const f of fails) console.error(' -', f);
  process.exit(1);
}
console.log('PALACE setup checks passed');
console.log(JSON.stringify({
  storeKey: 'palaceCards_v1',
  appId: cap.appId,
  liveUpdateDir: 'card-game/live-update',
  updateBranch: 'cursor/card-game-setup-e78b',
  apk: 'card-game/dist/PALACE.apk',
}, null, 2));
