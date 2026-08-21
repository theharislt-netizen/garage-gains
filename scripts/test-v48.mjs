#!/usr/bin/env node
/**
 * v4.8: first-session Set Your Baseline quest, signal-exercise tests,
 * forecasted coverage, silent refine, intro screen, Dashboard default,
 * tutorial guidance glow.
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

const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(sliceLib('v48-helpers-lib'), ctx);
vm.runInContext(sliceLib('first-run-unlock-lib'), ctx);

const {
  signalFamilyKey,
  pickSignalExercises,
  forecastPerSetAvg,
  silentlyRefineForecastedBaseline,
  observedPerformanceFromSets,
  applyForecastedBaselines,
  ensureBaselineQuestRecord,
  isLedKeepingInstance,
  defaultProgression,
  ensureBaselineQuestFlags,
  needsBaselineQuest,
  grantStarterVictoryBox,
  countCompletedWorkouts,
} = ctx;

const routine = [
  { id: 'standardPushup', day: 'push', suggestedSets: 4, equip: [] },
  { id: 'pikePushup', day: 'push', suggestedSets: 3, equip: [] },
  { id: 'chairDips', day: 'push', suggestedSets: 3, equip: ['chair'] },
  { id: 'ohPress', day: 'push', suggestedSets: 3, equip: ['dumbbell'] },
  { id: 'dbRow', day: 'pull', suggestedSets: 3, equip: ['dumbbell'] },
  { id: 'dbCurl', day: 'pull', suggestedSets: 3, equip: ['dumbbell'] },
  { id: 'tableRow', day: 'pull', suggestedSets: 3, equip: ['table'] },
  { id: 'rearDelt', day: 'pull', suggestedSets: 2, equip: [] },
  { id: 'legRaise', day: 'core', suggestedSets: 3, equip: [] },
  { id: 'plank', day: 'core', suggestedSets: 2, isTime: true, equip: [] },
  { id: 'hollowHold', day: 'core', suggestedSets: 2, isTime: true, equip: [] },
  { id: 'weightedCrunch', day: 'core', suggestedSets: 3, equip: ['dumbbell'] },
];

assert(signalFamilyKey(routine[4]) === 'dumbbell', 'dbRow is a dumbbell signal family');
assert(signalFamilyKey(routine[9]) === 'timed', 'plank is the timed family');
assert(signalFamilyKey(routine[0]) === 'bodyweight:push', 'unequipped push is bodyweight:push');

const signals = pickSignalExercises(routine);
assert(signals.length < routine.length, 'signal subset must be smaller than the full routine');
assert(signals.length >= 3, 'enough signal families to cover the routine');
assert(signals.some(s => s.id === 'dbRow'), 'dumbbell family prefers dbRow');
assert(signals.some(s => s.id === 'dbCurl'), 'dumbbell curls are tested as their own variety, not skipped');
assert(signals.some(s => s.id === 'ohPress'), 'dumbbell press is included as a distinct focus');
assert(signals.some(s => s.id === 'plank'), 'timed family prefers plank');
assert(signals.some(s => s.id === 'standardPushup'), 'bodyweight push prefers standard push-up');
assert(!signals.some(s => s.id === 'hollowHold'), 'second timed hold is forecasted from plank');

const signalResults = [
  { id: 'dbRow', family: 'dumbbell', isTime: false, perSetAvg: 12 },
  { id: 'plank', family: 'timed', isTime: true, perSetAvg: 40 },
  { id: 'standardPushup', family: 'bodyweight:push', isTime: false, perSetAvg: 20 },
];
assert(forecastPerSetAvg({ id: 'dbCurl', family: 'dumbbell', isTime: false }, signalResults) === 12 * 0.9, 'same-family forecast is 90% of the signal');
assert(forecastPerSetAvg({ id: 'hollowHold', family: 'timed', isTime: true }, signalResults) === 40 * 0.9, 'timed family forecast is 90% of plank');
assert(forecastPerSetAvg({ id: 'rearDelt', family: 'bodyweight:pull', isTime: false }, signalResults) === 12 * 0.7, 'cross-family reps use 70% of the first matching-mode signal');
assert(forecastPerSetAvg({ id: 'unknownHold', family: 'timed', isTime: true }, []) === 30, 'empty signals fall back to 30s');

const baselines = {};
signalResults.forEach(s => {
  baselines[s.id] = { totalReps: s.perSetAvg, perSetAvg: s.perSetAvg, setCount: 1, date: '2026-08-21', source: 'tested' };
});
applyForecastedBaselines(baselines, routine, signalResults, '2026-08-21');
routine.forEach(ex => {
  assert(baselines[ex.id], 'every routine exercise gets a starting baseline: ' + ex.id);
});
assert(baselines.dbRow.source === 'tested', 'tested signals stay tested');
assert(baselines.dbCurl.source === 'forecast', 'untested dumbbell work is forecasted');
assert(baselines.hollowHold.source === 'forecast', 'untested timed work is forecasted');

const obs = observedPerformanceFromSets([16, 14, 12]);
assert(obs && obs.perSetAvg === 14 && obs.setCount === 3, 'observed performance averages logged sets');
const bl = { perSetAvg: 10, setCount: 3, date: '2026-08-21', source: 'forecast', refineCount: 0 };
const r1 = silentlyRefineForecastedBaseline(bl, obs);
assert(r1.source === 'forecast', 'first refine stays silent/forecast');
assert(r1.perSetAvg === 10 * 0.7 + 14 * 0.3, 'EMA 70/30 toward observed');
assert(bl.source === 'forecast' && bl.perSetAvg === 10, 'refine must not mutate the stored object in place');
const r2 = silentlyRefineForecastedBaseline(r1, obs);
const r3 = silentlyRefineForecastedBaseline(r2, obs);
assert(r3.source === 'tested', 'after three samples the estimate graduates to tested');
assert(silentlyRefineForecastedBaseline({ source: 'tested', perSetAvg: 10 }, obs).source === 'tested', 'tested baselines are not EMA-rewritten here');

assert(needsBaselineQuest({ progression: defaultProgression(false) }) === true, 'new profiles need the baseline quest');
assert(needsBaselineQuest({ progression: defaultProgression(true) }) === false, 'veterans skip the baseline quest');
assert(needsBaselineQuest({ __adminSandbox: true, progression: defaultProgression(false) }) === false, 'admin sandbox skips the quest');
assert(defaultProgression(false).baselineQuestDone === false, 'new defaultProgression leaves the quest open');
assert(defaultProgression(true).baselineQuestDone === true && defaultProgression(true).baselineIntroSeen === true, 'unlocked defaults skip intro and quest');

const legacy = { workoutLog: {}, progression: { version: 40, inventoryUnlocked: false, grandfathered: false } };
assert(ensureBaselineQuestFlags(legacy) === true, 'v40 saves get additive baseline flags');
assert(legacy.progression.baselineQuestDone === false, 'empty v40 saves still need the quest');
const vet = { workoutLog: { '2026-01-01': { completed: true } }, progression: { version: 40, inventoryUnlocked: true, grandfathered: true } };
assert(ensureBaselineQuestFlags(vet) === true, 'veteran v40 saves get flags once');
assert(vet.progression.baselineQuestDone === true, 'veterans with workouts skip the quest');

const rec = ensureBaselineQuestRecord({});
assert(Array.isArray(rec.signalIds) && rec.sets && typeof rec.sets === 'object', 'quest record seeds signalIds + sets');
assert(isLedKeepingInstance({ type: 'baseline' }) && isLedKeepingInstance({ type: 'workout' }), 'baseline keeps the LED like a workout');
assert(!isLedKeepingInstance({ type: 'boss' }), 'boss still hides the LED');

const boxed = { progression: defaultProgression(false), inventory: { boxes: [] } };
boxed.workoutLog = { '2026-08-21': { completed: true, baselineQuest: true, sets: {} } };
assert(countCompletedWorkouts(boxed) === 1, 'baseline session counts as the first completed workout');
assert(grantStarterVictoryBox(boxed) === true, 'first completed baseline quest still grants the First Victory Box');

assert(html.includes('Set Your Baseline'), 'quest title is on the Dashboard card');
assert(html.includes('Day One: Setting Your Baseline.'), 'intro title matches the spec');
assert(html.includes('id="baselineIntroOverlay"'), 'dedicated intro overlay exists');
assert(html.includes("type: 'baseline'"), 'baseline is a distinct instance type');
assert(html.includes('function completeBaselineQuest'), 'completing the quest is a dedicated path');
assert(html.includes('grantStarterVictoryBox(state)'), 'starter box is still granted from the first completed session');
assert(html.includes('applyForecastedBaselines'), 'forecasting runs when the quest completes');
assert(html.includes('silentlyRefineForecastedBaseline'), 'later sessions silently refine forecasts');
assert(!/recalculat(e|ing) your baseline/i.test(html), 'no visible recalculation copy');
assert(html.includes("switchView('today')"), 'new profiles can be sent to Dashboard');
const finishFn = html.slice(html.indexOf('function finishOnboarding()'), html.indexOf('function renderProblemProfileEditor()'));
assert(finishFn.includes("switchView('today')"), 'finishing onboarding opens Dashboard, not Settings');
const switchFn = html.slice(html.indexOf('function switchProfile('), html.indexOf('function createProfile()'));
assert(switchFn.includes('!meta.onboarded') && switchFn.includes("switchView('today')"), 'new profiles created from Settings land on Dashboard');
assert(html.includes('tutorial-guidance-glow'), 'first quest card uses the guidance glow');
assert(html.includes('id="baselineQuestCard"'), 'Dashboard has a dedicated baseline quest card');
const glowAt = html.indexOf('.tutorial-guidance-glow');
const glowRule = html.slice(glowAt, html.indexOf('}', glowAt) + 1);
assert(glowRule.includes('animation: tutorial-guidance-glow-pulse'), 'glow pulses with box-shadow');
assert(!/transform|scale\s*\(/i.test(glowRule), 'guidance glow must not use transform/scale');
assert(html.includes("source: 'forecast'") && html.includes("source: 'tested'"), 'baselines record tested vs forecast origin');
assert(html.includes('3.4.21'), 'About version bumped for v4.8');

console.log('v4.8 tests ok — baseline quest, signal forecasts, silent refine, intro, Dashboard default, glow');
