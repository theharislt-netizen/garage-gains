#!/usr/bin/env node
/**
 * v5.5: tutorial (Set Your Baseline) must not grant the First Victory Box
 * after a single set. The quest finishes only when every signal lift has
 * logged its real suggested set count — same rule as Workout Complete.
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
vm.runInContext(sliceLib('v48-helpers-lib'), ctx);
vm.runInContext(sliceLib('first-run-unlock-lib'), ctx);

const {
  hasFinishedSuggestedSets,
  baselineQuestIsFinished,
  pickSignalExercises,
  grantStarterVictoryBox,
  countCompletedWorkouts,
  defaultProgression,
} = ctx;

assert(typeof hasFinishedSuggestedSets === 'function', 'hasFinishedSuggestedSets is exported');
assert(typeof baselineQuestIsFinished === 'function', 'baselineQuestIsFinished is exported');

assert(hasFinishedSuggestedSets(1, 1) === true, 'one logged set finishes a 1-set exercise');
assert(hasFinishedSuggestedSets(1, 3) === false, 'one logged set does not finish a 3-set exercise');
assert(hasFinishedSuggestedSets(2, 3) === false, 'two of three sets is still short');
assert(hasFinishedSuggestedSets(3, 3) === true, 'three of three sets finishes the exercise');
assert(hasFinishedSuggestedSets(4, 3) === true, 'extra sets still count as finished');
assert(hasFinishedSuggestedSets(0, 3) === false, 'zero sets is not finished');
assert(hasFinishedSuggestedSets(1, null) === true, 'missing suggestedSets falls back to 1');
assert(hasFinishedSuggestedSets(0, undefined) === false, 'missing suggestedSets still requires one logged set');
assert(hasFinishedSuggestedSets(1, 0) === true, 'invalid 0 suggestedSets falls back to 1');

const quest = [
  { id: 'standardPushup', suggestedSets: 4 },
  { id: 'dbRow', suggestedSets: 3 },
  { id: 'plank', suggestedSets: 2 },
];

assert(baselineQuestIsFinished([], { standardPushup: [10] }) === false, 'empty quest is not finished');
assert(baselineQuestIsFinished(quest, {}) === false, 'no logged sets is not finished');
assert(baselineQuestIsFinished(quest, { standardPushup: [12] }) === false, 'first set of the first lift is not a finished quest');

const oneEach = {
  standardPushup: [12],
  dbRow: [10],
  plank: [40],
};
assert(baselineQuestIsFinished(quest, oneEach) === false, 'one set on every signal lift is not enough');

const firstLiftDone = {
  standardPushup: [12, 11, 10, 9],
  dbRow: [10],
  plank: [40],
};
assert(baselineQuestIsFinished(quest, firstLiftDone) === false, 'finishing one exercise does not finish the quest');

const almost = {
  standardPushup: [12, 11, 10, 9],
  dbRow: [10, 9, 8],
  plank: [40],
};
assert(baselineQuestIsFinished(quest, almost) === false, 'short last exercise still blocks the reward');

const genuine = {
  standardPushup: [12, 11, 10, 9],
  dbRow: [10, 9, 8],
  plank: [40, 38],
};
assert(baselineQuestIsFinished(quest, genuine) === true, 'quest finishes only when every lift has its suggested sets');

const boxed = { progression: defaultProgression(false), inventory: { boxes: [] } };
boxed.workoutLog = { '2026-08-21': { completed: true, baselineQuest: true, sets: genuine } };
assert(countCompletedWorkouts(boxed) === 1, 'finished baseline session is the first completed workout');
assert(grantStarterVictoryBox(boxed) === true, 'First Victory Box still grants after a genuinely finished first session');
assert(boxed.progression.starterBoxGranted === true, 'starter box flag is set on genuine completion');

const buildFn = sliceFn('buildBaselineQuestExercises', 'showBaselineIntro');
assert(!buildFn.includes('suggestedSets: 1'), 'baseline quest must not force suggestedSets to 1');
assert(buildFn.includes('pacing: BASELINE_QUEST_PACING'), 'baseline quest still uses test-set pacing copy');
assert(buildFn.includes('...e'), 'catalog fields stay on each signal lift');
assert(buildFn.includes('baselineQuestSuggestedSets'), 'baseline quest caps sets per exercise');

const commitFn = sliceFn('commitSet', 'deleteSet');
assert(commitFn.includes('baselineQuestIsFinished(questList, sets)'), 'commitSet waits for genuine quest completion');
assert(!commitFn.includes('length >= 1'), 'commitSet must not treat a single logged set as quest completion');
assert(!commitFn.includes('allTested'), 'old all-tested-after-one-set check is gone');

const completeFn = sliceFn('completeBaselineQuest', 'enterInstance');
assert(completeFn.includes('baselineQuestIsFinished(questList, rec.sets)'), 'completeBaselineQuest refuses unfinished quests');
assert(completeFn.includes('grantStarterVictoryBox(state)'), 'starter box still grants from the completed quest');
assert(completeFn.includes("title:'Baseline Complete'"), 'reward title is workout-complete, not a single set');
assert(!completeFn.includes("title:'Baseline Set'"), 'old single-set reward title is gone');

assert(html.includes('3.4.19'), 'About version bumped for v5.5');

const routine = [
  { id: 'standardPushup', day: 'push', suggestedSets: 4, equip: [] },
  { id: 'dbRow', day: 'pull', suggestedSets: 3, equip: ['dumbbell'] },
  { id: 'plank', day: 'core', suggestedSets: 2, isTime: true, equip: [] },
  { id: 'dbCurl', day: 'pull', suggestedSets: 3, equip: ['dumbbell'] },
];
const signals = pickSignalExercises(routine);
assert(signals.every(s => (s.suggestedSets || 0) > 1), 'default signal lifts have more than one suggested set');

console.log('v5.5 tests ok — tutorial reward waits for full suggested sets, not the first set');
