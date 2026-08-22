#!/usr/bin/env node
/**
 * Urgent tutorial / baseline fixes:
 * 1. Baseline never overwrites an assigned workout plan; HARIS HTML plan restores.
 * 2. Tutorial box grants a 2-star (enchantable) relic, not a 0-cap 0-star.
 * 3. Enchant tutorial glow persists until the enchant step is completed.
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

function sliceLib(name) {
  const begin = html.indexOf(`/* === ${name} begin === */`);
  const end = html.indexOf(`/* === ${name} end === */`);
  assert(begin >= 0 && end > begin, name + ' markers missing');
  return html.slice(begin, end);
}

function sliceFn(name, nextName) {
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf(`function ${nextName}(`);
  assert(start >= 0 && end > start, name + ' function missing');
  return html.slice(start, end);
}

const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(sliceLib('v47-helpers-lib'), ctx);
vm.runInContext(sliceLib('v48-helpers-lib'), ctx);
vm.runInContext(sliceLib('item-catalog-lib'), ctx);
vm.runInContext(sliceLib('first-run-unlock-lib'), ctx);

const {
  applyForecastedBaselines,
  shouldTutorialGuideEnchant,
  acknowledgeTutorialEnchantTap,
  defaultProgression,
  needsBaselineQuest,
  shouldHideDashboardExtras,
  shouldSkipBaselineTutorial,
  ensureBaselineQuestFlags,
  hasAssignedWorkoutPlan,
  hasLoggedWorkoutSets,
  hasPreTutorialProgress,
  hasNonStarterPermanentItems,
  ensureTutorialAfterBaseline,
  isInventoryTabUnlocked,
  restoreHarisHtmlPlan,
  shouldRestoreHarisHtmlPlan,
  harisHtmlPlanIsIntact,
  ensureStarterRelicEnchantable,
  openStarterVictoryBox,
  grantStarterVictoryBox,
  itemStarCap,
  starRowHtml,
  itemStarsHtml,
} = ctx;
const STARTER_RELIC_ID = vm.runInContext('STARTER_RELIC_ID', ctx);
const STARTER_RELIC_STAR_CAP = vm.runInContext('STARTER_RELIC_STAR_CAP', ctx);
const HARIS_HTML_CUSTOM_EXERCISES = vm.runInContext('HARIS_HTML_CUSTOM_EXERCISES', ctx);

assert(STARTER_RELIC_STAR_CAP === 2, 'a 2-star drop means cap 2, not two filled stars');
assert(itemStarCap({ id: 'wornCharm', permanent: true, starterOnly: true }, { star: 0, starCap: 0 }) === 2,
  'a leftover 0-cap tutorial relic is treated as a 2-star cap so Enchant is not already maxed');
const dropRow = starRowHtml({ id: 'wornCharm', permanent: true, starterOnly: true }, 0, { star: 0, starCap: 2 });
assert(!(dropRow.match(/star-on/g) || []).length, 'tutorial prize is unenchanted');
assert((dropRow.match(/star-off/g) || []).length === 2, 'tutorial prize shows two empty headroom stars');
assert(itemStarsHtml({ id: 'wornCharm', permanent: true, starterOnly: true }, { star: 0, starCap: 0 }).includes('star-row'),
  '0-cap starter relic still renders a 2-star row after the cap repair');
assert(html.includes('id="boxPrizeStars"') && html.indexOf('id="boxPrizeStars"') > html.indexOf('id="boxPrizeIcon"')
  && html.indexOf('id="boxPrizeStars"') < html.indexOf('id="boxPrizeName"'),
  'victory-box stars sit under the art, not clipped inside the portrait');
const closeEnchant = sliceFn('closeEnchantModal', 'returnEnchantStoneIfNeeded');
assert(closeEnchant.includes("classList.toggle('tutorial-guidance-glow', shouldTutorialGuideEnchant(state))"),
  'leaving Enchant without finishing puts the glow back immediately');
const invShape = sliceFn('ensureInventoryShape', 'grantItem');
assert(invShape.includes("t.id === 'wornCharm'") && invShape.includes('inst.starCap = 2'),
  'inventory normalize gives a stuck 0-cap tutorial relic a 2-star cap');
assert(!invShape.includes('inst.star = 2'), 'inventory normalize does not pre-enchant the tutorial relic');

const boxed = {
  progression: defaultProgression(false),
  inventory: { permanent: [], tempCharges: {}, shards: { boost: 0, relic: 0 }, stones: { boost: 0, relic: 0 }, boxes: [] },
};
assert(grantStarterVictoryBox(boxed) === true, 'starter box grants');
const loot = openStarterVictoryBox(boxed);
assert(loot && loot.relicInst, 'opening grants the relic');
assert(loot.relicInst.star === 0, 'tutorial relic drops unenchanted, got star ' + loot.relicInst.star);
assert(loot.relicInst.starCap === 2, 'tutorial relic is a 2-star cap item, got cap ' + loot.relicInst.starCap);

const stuck = {
  inventory: { permanent: [{ instanceId: 'i-starter-relic', itemId: STARTER_RELIC_ID, star: 0, starCap: 0 }] },
  progression: defaultProgression(false),
};
assert(ensureStarterRelicEnchantable(stuck) === true, 'existing 0-cap starter relic is repaired');
assert(stuck.inventory.permanent[0].star === 0 && stuck.inventory.permanent[0].starCap === 2,
  'repaired starter relic is an unenchanted 2-star item');
const prefilled = {
  inventory: { permanent: [{ instanceId: 'i-starter-relic', itemId: STARTER_RELIC_ID, star: 2, starCap: 4 }] },
  progression: defaultProgression(false),
};
assert(ensureStarterRelicEnchantable(prefilled) === true, 'mistaken pre-enchanted starter relic is undone');
assert(prefilled.inventory.permanent[0].star === 0 && prefilled.inventory.permanent[0].starCap === 2,
  'tutorial relic returns to a 0/2 drop so Enchant can run');

assert(shouldTutorialGuideEnchant(boxed) === true, 'Enchant glows after the box opens');
assert(acknowledgeTutorialEnchantTap(boxed.progression) === false, 'visiting the table is not completing the step');
assert(shouldTutorialGuideEnchant(boxed) === true, 'glow remains after backing out of Enchant');
boxed.progression.enchantTutorialDone = true;
assert(shouldTutorialGuideEnchant(boxed) === false, 'glow ends only after a real enchant');

const openEnchant = sliceFn('openEnchantModal', 'closeEnchantModal');
assert(!openEnchant.includes('acknowledgeTutorialEnchantTap'), 'openEnchantModal does not consume the glow');
assert(!openEnchant.includes("classList.remove('tutorial-guidance-glow'"),
  'openEnchantModal does not strip the Enchant glow class');

const completeFn = sliceFn('completeBaselineQuest', 'enterInstance');
assert(!completeFn.includes('generateRoutine('), 'baseline completion never regenerates the workout plan');
assert(completeFn.includes('preservedPlan'), 'baseline completion snapshots the assigned plan');
assert(completeFn.includes('state.customExercises = preservedPlan'), 'baseline completion writes the plan back');

const forecastFn = sliceFn('applyForecastedBaselines', 'isLedKeepingInstance');
assert(forecastFn.includes('Never adds, removes, or reorders'), 'forecast helper documents stats-only writes');

const routine = [
  { id: 'chairDips', suggestedSets: 3 },
  { id: 'dbRow', suggestedSets: 3 },
];
const baselines = { dbRow: { totalReps: 24, perSetAvg: 8, setCount: 3, source: 'tested' } };
applyForecastedBaselines(baselines, routine, [{ id: 'dbRow', family: 'dumbbell', isTime: false, perSetAvg: 8 }], '2026-08-22');
assert(baselines.chairDips && baselines.chairDips.source === 'forecast', 'missing lifts get numbers');
assert(baselines.dbRow.source === 'tested', 'tested signal is not rewritten');

const fresh = { workoutLog: {}, inventory: { permanent: [] }, progression: defaultProgression(false) };
assert(needsBaselineQuest(fresh) === true, 'brand-new profiles still get the baseline quest');
assert(shouldHideDashboardExtras(fresh) === true, 'brand-new profiles still hide extra quests');

const firstRunMidBaseline = {
  onboarding: { name: 'Alex', freq: 5, equipment: [], focus: 'full' },
  totalPoints: 18,
  workoutLog: { '2026-08-22': { completed: false, sets: {} } },
  baselineQuest: { signalIds: ['standardPushup'], sets: { standardPushup: [12] } },
  customExercises: { push: ['standardPushup'], pull: ['dbRow'], core: ['plank'] },
  inventory: { permanent: [] },
  progression: defaultProgression(false),
};
assert(hasLoggedWorkoutSets(firstRunMidBaseline) === false, 'baseline test sets live on the quest record, not the day log');
assert(hasPreTutorialProgress(firstRunMidBaseline) === false, 'first-session points are not veteran progress');
assert(shouldSkipBaselineTutorial(firstRunMidBaseline) === false, 'logging the first baseline set must not skip the tutorial');
assert(needsBaselineQuest(firstRunMidBaseline) === true, 'first-run still needs the baseline quest after the first set');
assert(ensureBaselineQuestFlags(firstRunMidBaseline) === false, 'first-run flags stay open during the baseline');
assert(firstRunMidBaseline.progression.baselineQuestDone === false, 'baselineQuestDone must not flip mid-quest');

const stuckAfterBaseline = {
  onboarding: { name: 'Alex', freq: 5 },
  totalPoints: 40,
  workoutLog: { '2026-08-22': { completed: false, sets: {} } },
  baselineQuest: { signalIds: ['standardPushup'], sets: { standardPushup: [12, 10, 8] } },
  customExercises: { push: ['standardPushup'] },
  inventory: { permanent: [], boxes: [] },
  progression: Object.assign(defaultProgression(false), { baselineQuestDone: true, baselineIntroSeen: true }),
};
assert(needsBaselineQuest(stuckAfterBaseline) === false, 'a wrongly-closed quest no longer blocks the dashboard');
assert(isInventoryTabUnlocked(stuckAfterBaseline) === false, 'stuck save still has Inventory locked');
assert(ensureTutorialAfterBaseline(stuckAfterBaseline) === true, 'load recovers the missed First Victory Box');
assert(isInventoryTabUnlocked(stuckAfterBaseline) === true, 'recovery unlocks Inventory');
assert(stuckAfterBaseline.progression.starterBoxGranted === true, 'recovery grants the starter box');
assert(stuckAfterBaseline.progression.nudgeInventory === true, 'recovery resumes the inventory tutorial glow');
assert(ensureTutorialAfterBaseline(stuckAfterBaseline) === false, 'recovery is once');

assert(completeFn.includes('alreadyRewarded'), 'completeBaselineQuest still grants when skip flags flipped early');
assert(completeFn.includes('grantStarterVictoryBox(state)'), 'baseline completion still grants the First Victory Box');
assert(completeFn.includes('!needsBaselineQuest(state) && alreadyRewarded'), 'completeBaselineQuest only exits early after the box was actually granted');

const harisLive = {
  profile: { displayName: 'HARIS' },
  onboarding: null,
  totalPoints: 64,
  workoutLog: { '2026-08-19': { completed: false, sets: { weightedCrunch: [12, 10, 10] } } },
  customExercises: { push: ['standardPushup'], pull: ['dbRow'], core: ['plank'] },
  inventory: { permanent: [{ itemId: 'grindersChair', star: 3 }] },
  progression: defaultProgression(false),
};
assert(hasLoggedWorkoutSets(harisLive) === true, 'incomplete logged sets still count as progress');
assert(hasPreTutorialProgress(harisLive) === true, 'HARIS-like save is pre-tutorial progress');
assert(shouldSkipBaselineTutorial(harisLive) === true, 'existing custom-plan accounts skip the blocking baseline quest');
assert(needsBaselineQuest(harisLive) === false, 'HARIS is not trapped on Set Your Baseline');
assert(shouldHideDashboardExtras(harisLive) === false, 'existing progress keeps other quests visible');
assert(hasNonStarterPermanentItems(harisLive) === true, 'HARIS already owns gym items');
assert(ensureBaselineQuestFlags(harisLive) === true, 'live save is grandfathered out of the tutorial quest');
assert(harisLive.progression.baselineQuestDone === true, 'baselineQuestDone is set so the Workout card returns');
assert(ensureTutorialAfterBaseline(harisLive) === false, 'HARIS is not given a first-run victory box');

assert(hasAssignedWorkoutPlan({ customExercises: HARIS_HTML_CUSTOM_EXERCISES }) === true, 'HTML backup plan counts as assigned');
assert(shouldRestoreHarisHtmlPlan(harisLive) === true, 'a stripped HARIS plan is restored');
assert(restoreHarisHtmlPlan(harisLive) === true, 'restore writes the HTML backup exercises');
assert(harisHtmlPlanIsIntact(harisLive) === true, 'restored plan includes lower-chest and arm-widening lifts');
assert(harisLive.customExercises.push.includes('handsElevatedPushup'), 'hands-elevated push-up is back');
assert(harisLive.customExercises.pull.includes('zottman'), 'zottman curl is back');
assert(restoreHarisHtmlPlan(harisLive) === false, 'a second restore is a no-op');

const other = { profile: { displayName: 'Alex' }, customExercises: { push: ['standardPushup'] } };
assert(shouldRestoreHarisHtmlPlan(other) === false, 'non-HARIS profiles are not rewritten');

assert(html.includes('they never replace your assigned workout plan'), 'baseline intro no longer implies a new routine');
assert(!completeFn.includes('generateRoutine(state.onboarding)'), 'completeBaselineQuest does not call generateRoutine');

console.log('v7.2 tests ok — plan preserved, HARIS restore, 2-star tutorial relic, Enchant glow persists, baseline skip does not eat the box');
