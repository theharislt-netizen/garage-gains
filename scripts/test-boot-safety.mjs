#!/usr/bin/env node
/**
 * Boot must survive: a half-finished Set Your Baseline quest, a new calendar
 * day, and a season that ended while the app was closed. A reward overlay
 * must not re-enter renderHeader (that stack-overflowed and left the splash
 * logo on screen).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'garage-gains.html'), 'utf8');
const bridge = await readFile(join(root, 'scripts/native-bridge.mjs'), 'utf8');
const prepare = await readFile(join(root, 'scripts/prepare-www.mjs'), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sliceFn(name, nextName) {
  const start = html.indexOf(`function ${name}(`);
  const end = nextName ? html.indexOf(`function ${nextName}(`) : html.length;
  assert(start >= 0 && end > start, name + ' function missing');
  return html.slice(start, end);
}

assert(html.includes('if (window.__seasonRolling) return'), 'ensureSeason has a re-entry guard');
assert(html.includes('window.__seasonRolling = true'), 'season rewards run after the date roll, not inside the while');
assert(html.includes('if (window.__renderingHeader) return'), 'renderHeader cannot nest');

const claimFn = sliceFn('renderClaimRewardsOverlay', 'renderProgressClaimDock');
assert(!claimFn.includes('renderHeader()'), 'reward overlay must not re-enter the header (that blew the boot stack)');
assert(claimFn.includes('updateLed()'), 'reward overlay still refreshes the points bar');

const initFn = sliceFn('init', 'appSafeTop');
assert(initFn.includes('try {'), 'init is try/caught so a later render error cannot kill the script');
assert(initFn.includes('init failed'), 'init logs the failure');
assert(initFn.includes('__rigcoreMarkReady'), 'successful boot tells the native shell the bundle is live');

const seasonFn = sliceFn('ensureSeason', 'creditSeasonPoints');
assert(seasonFn.includes('grantSeasonEndReward'), 'ended seasons still pay out');
assert(seasonFn.indexOf('ended.push') < seasonFn.indexOf('grantSeasonEndReward'), 'dates roll before reward overlays');
assert(seasonFn.includes('guard++ < 40'), 'broken endDate cannot loop forever');

assert(bridge.includes('hideSplashSoon()'), 'splash hides without waiting for the web app to finish init');
assert(bridge.includes('window.__rigcoreMarkReady'), 'app init can mark the live-update bundle ready');
assert(bridge.includes('setTimeout(markNativeReady, 8000)'), 'native ready has a fallback if init never returns');
assert(bridge.indexOf('hideSplashSoon()') < bridge.indexOf("document.addEventListener('DOMContentLoaded'"), 'splash hide is not gated on DOMContentLoaded');
assert(prepare.includes("html.replace(/<body([^>]*)>/i"), 'native-bridge is injected at the start of body, before the app script');

assert(html.includes('Recovered from a startup error'), 'failed init still shows a recovery toast');
assert(html.includes('dashboard ensure failed'), 'daily quest builders cannot abort Dashboard paint');

let jsdomRan = false;
try {
  const { JSDOM, VirtualConsole } = await import('jsdom');
  jsdomRan = true;
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => errors.push(err));
  const today = '2026-08-31';
  const save = {
    version: 4, theme: 'rig', weightLog: [], workoutLog: {}, bests: {},
    baselines: { standardPushup: { totalReps: 12, perSetAvg: 12, setCount: 1, date: '2026-08-30', source: 'tested' } },
    totalPoints: 76, streak: { current: 0, longest: 0, lastCompletedDate: null },
    unlockedBadges: [], equipment: ['chair', 'dumbbell'],
    onboarding: { name: 'HARIS', freq: 5, equipment: ['chair', 'dumbbell'] },
    customDaySchedule: { 0: null, 1: 'push', 2: 'pull', 3: 'core', 4: 'push', 5: 'pull', 6: null },
    customExercises: {
      push: ['chairDips', 'handsElevatedPushup', 'standardPushup', 'pikePushup', 'ohPress'],
      pull: ['dbRow', 'tableRow', 'dbCurl', 'hammerCurl', 'zottman', 'rearDelt'],
      core: ['weightedCrunch', 'declineSitup', 'legRaise', 'plank', 'hollowHold']
    },
    skills: {}, gold: 45, gems: 1,
    inventory: {
      permanent: [{ instanceId: 'i1787222238762701', itemId: 'grindersChair', star: 3 }],
      tempCharges: {}, shards: { boost: 8, relic: 30 }, stones: { boost: 0, relic: 0 }, boxes: []
    },
    equipped: { relic: [{ kind: 'permanent', instanceId: 'i1787222238762701' }], boost: [] },
    profile: { displayName: 'HARIS', equippedBanner: null, displayedAchievementIds: [] },
    season: { number: 1, startDate: '2026-07-01', endDate: '2026-08-26', points: 200 },
    progression: {
      version: 40, inventoryUnlocked: false, rankUnlocked: false, starterBoxGranted: false,
      starterBoxOpened: false, enchantTutorialDone: false, rankWalkthroughDone: false,
      warmupIntroSeen: false, mobilityIntroSeen: false, bossIntroSeen: false, quickLogIntroSeen: false,
      nudgeInventory: false, nudgeEnchant: false, nudgeRank: false, nudgeDashboard: false,
      nudgeEquip: false, equipTutorialDone: false, baselineQuestDone: false, baselineIntroSeen: true,
      grandfathered: false
    },
    baselineQuest: { signalIds: ['standardPushup', 'chairDips', 'dbRow', 'plank'], sets: { standardPushup: [12, 10], chairDips: [8] } },
    __testingEconomyClearedV33: true
  };
  class FakeDate extends Date {
    constructor(...args) { args.length ? super(...args) : super(today + 'T12:00:00'); }
    static now() { return Date.parse(today + 'T12:00:00'); }
  }
  const hung = setTimeout(() => { throw new Error('boot hung'); }, 4000);
  const dom = new JSDOM(html, {
    url: 'https://rigcore.local/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.Date = FakeDate;
      window.localStorage.setItem('garageGains_v1', JSON.stringify(save));
      window.localStorage.setItem('garageGains_v1::registry', JSON.stringify({
        profiles: [{ id: 'p1', name: 'HARIS', onboarded: true }], currentId: 'p1'
      }));
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
    }
  });
  await new Promise((r) => setTimeout(r, 400));
  clearTimeout(hung);
  const stack = errors.filter((e) => String(e && e.message || e).includes('Maximum call stack'));
  assert(stack.length === 0, 'season rollover must not blow the stack, got ' + stack[0]);
  const name = dom.window.document.getElementById('nbNameText');
  assert(name && name.textContent === 'HARIS', 'header still shows HARIS after a season roll');
  const card = dom.window.document.getElementById('baselineQuestCard');
  assert(card, 'half-finished Set Your Baseline still paints Resume on the next day');
  assert(card.textContent.includes('Resume'), 'quest card says Resume, not Begin');
} catch (e) {
  if (e && e.code === 'ERR_MODULE_NOT_FOUND' && String(e.message).includes('jsdom')) {
    console.log('jsdom not installed — source guards only');
  } else if (!jsdomRan) {
    throw e;
  } else {
    throw e;
  }
}

console.log('boot safety ok — season rollover cannot stack-overflow, baseline quest resumes');
