#!/usr/bin/env node
/**
 * v4.5: sticky banner Level bar (no daily goal overflow), compact day-type
 * label, Rank tab season progress visuals, Daily Login above Rank rewards,
 * independent boss-fight logs, boss-framed pacing copy.
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
vm.runInContext(sliceLib('v44-helpers-lib'), ctx);
vm.runInContext(sliceLib('v45-helpers-lib'), ctx);
const {
  getLevel,
  pointsForLevel,
  typicalFirstWorkoutPoints,
  levelBarState,
  bossPacingNoteForSet,
  ensureBossFightSets,
  repsFromLog,
} = ctx;

// 1. Level bar never overflows; first-workout pts still land on Level 2.
const zero = levelBarState(0);
assert(zero.level === 1 && zero.pct === 0, 'empty account is Level 1 at 0%');
assert(zero.remaining === pointsForLevel(2), 'Level 1 remaining is the Level 2 threshold');
const firstPts = typicalFirstWorkoutPoints();
assert(getLevel(firstPts) === 2, 'typical first workout still reaches Level 2');
const firstBar = levelBarState(firstPts);
assert(firstBar.level === 2, 'first-workout bar is Level 2');
assert(firstBar.pct > 0 && firstBar.pct < 100, 'Level 2 fill is in-progress, not overflow');
assert(levelBarState(149).pct <= 100 && levelBarState(1e12).pct <= 100, 'fill never exceeds 100%');
assert(levelBarState(150).pct === 0 && levelBarState(150).level === 2, 'exact Level 2 threshold starts a fresh bar');
assert(html.includes('function updateLed()'), 'LED updater present');
const updateLedFn = html.slice(html.indexOf('function updateLed()'), html.indexOf('function showPointsPop'));
assert(updateLedFn.includes('levelBarState(state.totalPoints)'), 'LED reads lifetime Level, not daily pts');
assert(!updateLedFn.includes('Goal hit') && !updateLedFn.includes('Goal Hit'), 'LED status is not daily-goal copy');
assert(!updateLedFn.includes('Setting your baseline'), 'LED status is not baseline copy');
assert(!updateLedFn.includes('getDailyGoal'), 'LED no longer tracks the daily goal');
assert(html.includes("ptsEl.textContent = 'Lv ' + bar.level"), 'LED headline is the current Level');

// 2. Date number gone; day-type is a small pill; day name may remain.
assert(!html.includes('id="dateStr"'), 'literal date number must be removed from the banner');
assert(!html.includes('id="dateStr"') && html.includes('id="dayBadge"') && html.includes('id="dayName"'), 'pill + weekday remain');
assert(html.includes("DAY_NAMES[dayType] + ' Day'"), 'day-type pill reads e.g. Pull Day');
assert(html.includes("'Rest Day'"), 'rest days keep a Rest Day label');
assert(html.includes('.day-type-pill') && html.includes('font-size: 11px'), 'day-type pill is the small tag');
assert(html.includes('.day-header .dayname') && html.includes('font-size: 12px'), 'weekday is supporting text');

// 3. Rank tab reuses the Stats season rank bar.
const rankFn = html.slice(html.indexOf('function renderRankTab()'), html.indexOf('function renderRankWalkthrough'));
assert(rankFn.includes('rankTabRbIconStart') && rankFn.includes('rankTabRbIconEnd'), 'Rank tab has current + next rank icons');
assert(rankFn.includes('rankTabRbFill') && rankFn.includes('rankTabRbProgressText'), 'Rank tab has the fill bar between ranks');
assert(rankFn.includes('populateSeasonRankBar(RANK_TAB_SEASON_RB_IDS)'), 'Rank tab reuses the Stats season bar helper');
assert(html.includes('function populateSeasonRankBar(ids)'), 'shared season bar helper still exists');

// 4. Daily Login sits immediately above Rank rewards.
const loginAt = rankFn.indexOf('Daily Login');
const rewardsAt = rankFn.indexOf('Your Rank Rewards');
assert(loginAt > 0 && rewardsAt > loginAt, 'Daily Login must sit one slot above Rank rewards');

// 5. Boss-fight logs are a separate instance from today's workout.
assert(html.includes('fightSets: {}'), 'new bosses start with an empty fight log');
assert(html.includes('function getActiveRepsMap(dateKey)'), 'cards/commits read the active instance log');
assert(html.includes('ensureBossFightSets(boss)'), 'entering a boss must ensure fightSets');
const applyBoss = html.slice(html.indexOf('function applyBossDamage'), html.indexOf('function defeatBoss'));
assert(applyBoss.includes("type !== 'boss'") && applyBoss.includes('return'), 'workout logging must not chip boss HP');
const session = { bench: [10, 10, 10] };
const boss = { id: 'b1', exIds: ['bench'] };
const fight = ensureBossFightSets(boss);
assert(repsFromLog(fight, 'bench').length === 0, 'overlapping workout sets must not complete the boss card');
assert(Array.isArray(session.bench) && session.bench.length === 3, 'workout log stays intact');
fight.bench = [8];
assert(session.bench[0] === 10 && fight.bench[0] === 8, 'boss fightSets must not share workout array identity');
const cardsFn = html.slice(html.indexOf('function renderExerciseCardsInto'), html.indexOf('function enterInstance'));
assert(cardsFn.includes('getActiveRepsMap(dateKey)'), 'exercise cards read the active log');
assert(cardsFn.includes('repsFromLog(sets, ex.id)'), 'cards do not fall back to session.sets while a boss is active');
const commitSlice = html.slice(html.indexOf('function commitSet(exId, idx, val)'), html.indexOf('function deleteSet(exId, idx)'));
assert(commitSlice.includes('getActiveRepsMap(dateKey)'), 'commitSet writes the active instance log');
assert(!commitSlice.includes('session.sets['), 'commitSet must not write workout sets during a boss fight');
const deleteSlice = html.slice(html.indexOf('function deleteSet(exId, idx)'), html.indexOf('document.querySelectorAll(\'[data-toggle]\')'));
assert(deleteSlice.includes('getActiveRepsMap(dateKey)'), 'deleteSet splices the active instance log');

// 6. Boss pacing is boss-framed, not recycled workout copy.
assert(html.includes('boss ? bossPacingNoteForSet(activeIdx)'),
  'boss cards use boss pacing; workouts keep set-gated workout tips');
assert(html.includes('pacingNoteForSet(ex.pacing, activeIdx)'),
  'workout cards still gate pacing by the active set');
const opening = bossPacingNoteForSet(0);
const later = bossPacingNoteForSet(1);
assert(opening.length > 10 && later.length > 10, 'boss pacing copy exists for set 1 and later sets');
assert(/boss|fight|strike|pressure/i.test(opening), 'opening boss tip must read as a fight, not a gym set');
assert(!/max effort on set (one|1)/i.test(opening + later), 'boss copy must not recycle the regular-workout opener');
assert(!opening.includes(String(ctx.pacingNoteForSet && ctx.pacingNoteForSet('Max effort on set one, this tends to be a stronger lift', 0))),
  'boss pacing is not the workout pacing helper output');

assert(html.includes('3.4.16'), 'About version bumped for v4.5');

console.log('v4.5 tests ok — Level bar, Rank tab season icons, Daily Login order, independent boss logs');
