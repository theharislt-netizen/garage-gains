#!/usr/bin/env node
/**
 * First-run onboarding chain: locked Inventory/Rank, starter box, separate
 * relic, enchant tutorial flag, then Rank walkthrough reward.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'garage-gains.html'), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(html.includes('id="warmupIntroOverlay"'), 'warmup intro overlay missing');
assert(html.includes("Let's do the warm-up"), 'warmup intro must go into warm-up, not dump to Dashboard');
assert(html.includes('data-warmup-intro-start'), 'warmup type picker must start the chosen warm-up');
assert(html.includes('Choose a Warm-Up'), 'warmup intro must offer a choice');
assert(html.includes('Start workout anyway'), 'warmup must stay optional');
assert(html.includes('+10% on today\'s workout') || html.includes('+10% on today\\\'s workout') || html.includes('+10% on today'), 'warmup bonus must be stated');
assert(html.includes('enchant-drop'), 'enchant table item/stone slots missing');
assert(html.includes('enchant-cast-btn'), 'enchant table action missing');
assert(html.includes('enchant-stat-table'), 'enchant results table missing');
assert(html.includes('Open Box'), 'starter box must be opened from a description');
assert(html.includes('starterOnly:true') || html.includes('starterOnly: true'), 'starter relic must not enter the shop pool');
assert(html.includes('tab.locked') || html.includes("classList.toggle('locked'"), 'Inventory/Rank tabs must gray out');
assert(html.includes('Claim starter reward'), 'rank walkthrough must award a reward');
assert(html.includes('shouldHideDashboardExtras'), 'new profiles must hide extra dashboard quests');

const begin = html.indexOf('/* === first-run-unlock-lib begin === */');
const end = html.indexOf('/* === first-run-unlock-lib end === */');
assert(begin >= 0 && end > begin, 'first-run-unlock-lib markers missing');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(html.slice(begin, end), ctx);

const {
  countCompletedWorkouts,
  ensureProgressionUnlock,
  isInventoryTabUnlocked,
  isRankTabUnlocked,
  shouldHideDashboardExtras,
  grantStarterVictoryBox,
  ensureTutorialAfterBaseline,
  needsBaselineQuest,
  shouldSkipBaselineTutorial,
  hasPreTutorialProgress,
  hasActuallyCompletedBaseline,
  ensureBaselineQuestFlags,
  markRankWalkthroughDone,
  openStarterVictoryBox,
  markEquipTutorialDone,
  markEnchantTutorialDone,
  ensureEquipTutorialFlags,
  itemBonusPercent,
  defaultProgression,
} = ctx;

const STARTER_RELIC_ID = 'wornCharm';
const RANK_WALKTHROUGH_GOLD = 80;
const RANK_WALKTHROUGH_GEMS = 1;

const fresh = { workoutLog: {}, inventory: { permanent: [], tempCharges: {}, shards: { boost: 0, relic: 0 }, stones: { boost: 0, relic: 0 } } };
assert(ensureProgressionUnlock(fresh) === true, 'new profile should seed progression');
assert(!isInventoryTabUnlocked(fresh) && !isRankTabUnlocked(fresh), 'new profile must lock Inventory and Rank');
assert(shouldHideDashboardExtras(fresh) === true, 'new profile dashboard must be workout-only');
fresh.totalPoints = 12;
fresh.workoutLog = { '2026-08-22': { completed: false, sets: { standardPushup: [10] } } };
fresh.onboarding = { name: 'Alex', freq: 5 };
assert(hasPreTutorialProgress(fresh) === false, 'first-session points must not count as veteran progress');
assert(shouldSkipBaselineTutorial(fresh) === false, 'first-run accounts stay in the baseline tutorial after the first set');
assert(needsBaselineQuest(fresh) === true, 'baseline quest stays open while Inventory is still locked');
assert(ensureBaselineQuestFlags(fresh) === false || fresh.progression.baselineQuestDone === false, 'first-set points must not mark baseline done');

const stuckFirstRun = {
  onboarding: { name: 'Alex' },
  totalPoints: 36,
  workoutLog: { '2026-08-22': { completed: false, sets: {} } },
  customExercises: { push: ['standardPushup'], pull: ['dbRow'], core: ['plank'] },
  inventory: { permanent: [], tempCharges: {}, shards: { boost: 0, relic: 0 }, stones: { boost: 0, relic: 0 }, boxes: [] },
  progression: Object.assign(defaultProgression(false), { baselineQuestDone: true, baselineIntroSeen: true }),
};
assert(isInventoryTabUnlocked(stuckFirstRun) === false, 'broken save still locks Inventory');
assert(hasActuallyCompletedBaseline(stuckFirstRun) === false, 'a skip flag is not a finished baseline');
assert(ensureTutorialAfterBaseline(stuckFirstRun) === false, 'do not grant the relic box until the baseline sets are done');
assert(ensureBaselineQuestFlags(stuckFirstRun) === true, 'load reopens a skip-flagged first-run baseline');
assert(needsBaselineQuest(stuckFirstRun) === true, 'Set Your Baseline comes back');
stuckFirstRun.workoutLog['2026-08-22'] = { completed: true, baselineQuest: true, sets: { standardPushup: [12, 10, 8] } };
assert(ensureTutorialAfterBaseline(stuckFirstRun) === true, 'a really finished baseline still grants the missed box');
assert(isInventoryTabUnlocked(stuckFirstRun) === true, 'healed save unlocks Inventory');
assert(stuckFirstRun.inventory.boxes.some(b => b.itemId === 'starterVictoryBox'), 'healed save has the First Victory Box');

const veteran = { workoutLog: { '2026-01-01': { completed: true, sets: {} } }, inventory: { permanent: [] } };
assert(ensureProgressionUnlock(veteran) === true, 'existing save should grandfather');
assert(isInventoryTabUnlocked(veteran) && isRankTabUnlocked(veteran), 'people with workouts must keep Inventory and Rank');
assert(shouldHideDashboardExtras(veteran) === false, 'veterans keep the full dashboard');
assert(ensureProgressionUnlock(veteran) === false, 'second pass must not rewrite progression');
assert(veteran.progression.mobilityIntroSeen === false, 'grandfathered profiles still see Mobility intro once');
assert(veteran.progression.bossIntroSeen === false, 'grandfathered profiles still see Boss intro once');
assert(veteran.progression.quickLogIntroSeen === false, 'grandfathered profiles still see Quick-Log intro once');
assert(defaultProgression(true).warmupIntroSeen === true, 'veteran warmup intro stays skipped');
assert(defaultProgression(true).equipTutorialDone === true, 'veteran equip tutorial stays skipped');
assert(defaultProgression(false).equipTutorialDone === false, 'new profiles must equip their first relic');
assert(defaultProgression(true).mobilityIntroSeen === false, 'Mobility intro is not auto-true for veterans');

const admin = { __adminSandbox: true, workoutLog: {} };
assert(ensureProgressionUnlock(admin) === true);
assert(isInventoryTabUnlocked(admin) && isRankTabUnlocked(admin), 'admin sandbox must not be gated');

const mid = {
  workoutLog: { '2026-08-21': { completed: true, sets: { a: [10] } } },
  inventory: { permanent: [], tempCharges: {}, shards: { boost: 0, relic: 0 }, stones: { boost: 0, relic: 0 }, boxes: [] },
  progression: {
    version: 40,
    inventoryUnlocked: false,
    rankUnlocked: false,
    starterBoxGranted: false,
    starterBoxOpened: false,
    enchantTutorialDone: false,
    rankWalkthroughDone: false,
    nudgeInventory: false,
    nudgeEnchant: false,
    nudgeRank: false,
  },
};
assert(countCompletedWorkouts(mid) === 1, 'one completed workout');
assert(grantStarterVictoryBox(mid) === true, 'first workout grants the box');
assert(isInventoryTabUnlocked(mid) === true, 'box delivery unlocks Inventory');
assert(isRankTabUnlocked(mid) === false, 'Rank stays locked until enchant tutorial');
assert(mid.inventory.boxes.length === 1 && mid.inventory.boxes[0].itemId === 'starterVictoryBox', 'box is a physical inventory item');
assert(grantStarterVictoryBox(mid) === false, 'must not grant a second starter box');

const loot = openStarterVictoryBox(mid);
assert(loot && loot.stoneAmount === 1, 'opening the box grants a stone');
assert(mid.inventory.permanent.some(x => x.itemId === STARTER_RELIC_ID && x.star === 0 && x.starCap === 2),
  'guaranteed unenchanted 2-star-cap relic');
assert(mid.inventory.stones.relic === 1, 'one enchantment stone');
assert(mid.inventory.boxes.length === 0, 'opened box leaves inventory');
assert(mid.progression.nudgeEnchant === true, 'Enchant is the next onboarding pulse');
assert(mid.progression.nudgeEquip === false, 'reward items do not keep an equip glow');
assert(openStarterVictoryBox(mid) === null, 'cannot open the same box twice');

assert(markEquipTutorialDone(mid) === true, 'equip tutorial completes only after Equip');
assert(mid.progression.equipTutorialDone === true, 'equip flag is recorded');
assert(mid.progression.nudgeEnchant === true, 'Enchant entry should pulse after equipping');

assert(markEnchantTutorialDone(mid) === true, 'enchant tutorial completion is recorded');
assert(isRankTabUnlocked(mid) === true, 'Rank unlocks after enchant tutorial');
assert(mid.progression.nudgeRank === true, 'Rank tab should pulse');

assert(shouldHideDashboardExtras(mid) === true, 'other quests stay hidden until Rank is claimed');
mid.workoutLog['2026-08-21'].baselineQuest = true;
const prize = markRankWalkthroughDone(mid);
assert(prize && prize.gold === RANK_WALKTHROUGH_GOLD && prize.gems === RANK_WALKTHROUGH_GEMS, 'rank intro pays a milestone reward');
assert(mid.progression.nudgeDashboard === true, 'Rank hands the last glow to Dashboard');
assert(shouldHideDashboardExtras(mid) === false, 'the full Dashboard opens after Rank');
assert(markRankWalkthroughDone(mid) === null, 'rank intro reward is once');

const charm = { baseValue: 0.02, effectType: 'points', scope: 'session' };
assert(itemBonusPercent(charm, 0) === 2, '0-star charm is +2%');
assert(itemBonusPercent(charm, 1) === 3.2, '1-star charm is +3.2%');

const missingEquip = { progression: { grandfathered: true } };
assert(ensureEquipTutorialFlags(missingEquip) === true, 'missing equip flags are filled');
assert(missingEquip.progression.equipTutorialDone === true, 'veterans skip the equip tutorial');

console.log('first-run unlock ok — locked tabs, starter box, equip, enchant then rank');
