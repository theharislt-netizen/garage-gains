#!/usr/bin/env node
/**
 * v4.2: one-time Mobility/Boss/Quick-Log intros, tap-to-claim Level/Rank,
 * Quick-Log counting as a full trained day, unified exercise reward XP fill.
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

assert(html.includes('id="featureIntroOverlay"'), 'feature intro overlay missing');
assert(html.includes('id="progressClaimDock"'), 'level/rank claim dock missing');
assert(html.includes('id="progressClaimOverlay"'), 'level/rank claim overlay missing');
assert(html.includes('id="progressClaimContinue"'), 'Continue action missing on level/rank claim');
assert(html.includes('withFeatureIntro'), 'first-tap intros must intercept feature entry');
assert(html.includes("withFeatureIntro('mobility'"), 'Mobility Start/Resume must show intro');
assert(html.includes("withFeatureIntro('boss'"), 'Boss Start/Resume must show intro');
assert(html.includes("withFeatureIntro('quickLog'"), 'Quick-Log FAB must show intro');
assert(html.includes('kind:\'quickLog\'') || html.includes('kind:"quickLog"') || html.includes("kind:'quickLog'"), 'Quick-Log leave must use the unified reward screen');
assert(html.includes("kind:'boss'") || html.includes('kind:"boss"'), 'Boss defeat must use the unified reward screen');
assert(html.includes("label:'Points'") && html.includes('Boss Defeated'), 'Boss overlay must include a Points line for XP fill');
assert(html.includes('getCrXpFillMs'), 'XP bar fill duration must be explicit and visible');

const levelFn = html.slice(html.indexOf('function checkLevelUp'), html.indexOf('const STREAK_TIERS'));
assert(!levelFn.includes('queueReward'), 'level-up must not use the full exercise reward overlay');
assert(levelFn.includes('enqueueProgressClaim'), 'level-up must queue a tap-to-claim icon');

const rankFn = html.slice(html.indexOf('function creditSeasonPoints'), html.indexOf('function grantSeasonEndReward'));
assert(!rankFn.includes('queueReward'), 'rank-up must not use the full exercise reward overlay');
assert(rankFn.includes('enqueueProgressClaim'), 'rank-up must queue a tap-to-claim icon');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(sliceLib('feature-intro-lib'), ctx);
vm.runInContext(sliceLib('trained-day-lib'), ctx);
vm.runInContext(sliceLib('progress-claim-lib'), ctx);

const {
  ensureFeatureIntroFlags,
  shouldShowFeatureIntro,
  markFeatureIntroSeen,
  getFeatureIntroCopy,
  sessionHasLoggedSets,
  computeSessionPointsFromSets,
  shouldCountAsTrainedDay,
  isUntrainedRestOrSkipped,
  previousStreakAnchor,
  getCrXpFillMs,
  isExerciseCompletionKind,
  ensurePendingProgressClaims,
  enqueueProgressClaim,
  dismissProgressClaim,
} = ctx;

assert(getCrXpFillMs() >= 1000, 'XP fill must be a visible animation, not a snap');
assert(isExerciseCompletionKind('workout') && isExerciseCompletionKind('warmup') && isExerciseCompletionKind('mobility') && isExerciseCompletionKind('boss') && isExerciseCompletionKind('quickLog'), 'exercise completions share one reward kind family');
assert(!isExerciseCompletionKind('level') && !isExerciseCompletionKind('rank'), 'level/rank are not exercise completions');

const copyM = getFeatureIntroCopy('mobility');
const copyB = getFeatureIntroCopy('boss');
const copyQ = getFeatureIntroCopy('quickLog');
assert(copyM && copyM.title && copyM.body, 'Mobility intro copy missing');
assert(copyB && copyB.title && copyB.body, 'Boss intro copy missing');
assert(copyQ && copyQ.title && copyQ.body, 'Quick-Log intro copy missing');

const prog = {};
assert(ensureFeatureIntroFlags(prog) === true, 'missing flags should be filled');
assert(prog.mobilityIntroSeen === false && prog.bossIntroSeen === false && prog.quickLogIntroSeen === false, 'intros default unseen');
assert(shouldShowFeatureIntro(prog, 'mobility') && shouldShowFeatureIntro(prog, 'boss') && shouldShowFeatureIntro(prog, 'quickLog'), 'each feature starts unseen');
markFeatureIntroSeen(prog, 'mobility');
assert(shouldShowFeatureIntro(prog, 'mobility') === false, 'dismissed Mobility intro must never return');
assert(shouldShowFeatureIntro(prog, 'boss') === true, 'Boss intro is independent');
assert(ensureFeatureIntroFlags(prog) === false, 'already-false/true flags must not reset');
assert(prog.mobilityIntroSeen === true, 'must not un-see a dismissed intro');

const veteranProg = { version: 40, warmupIntroSeen: true };
assert(ensureFeatureIntroFlags(veteranProg) === true);
assert(veteranProg.warmupIntroSeen === true, 'must not rewrite warmup intro');
assert(veteranProg.mobilityIntroSeen === false, 'v4.0 veterans still get Mobility intro once');

const emptySess = { sets: {} };
const restSess = { sets: { plank: [30] } };
const mixedSess = { sets: { bench: [8, 8], standardPushup: [10] } };
const partialSched = { sets: { bench: [8] } };
assert(sessionHasLoggedSets(emptySess) === false);
assert(sessionHasLoggedSets(restSess) === true);
assert(shouldCountAsTrainedDay({ session: restSess, dayType: null, skipped: false, scheduledIds: [], suggestedSets: {} }) === true, 'rest-day Quick-Log counts as a trained day');
assert(shouldCountAsTrainedDay({ session: emptySess, dayType: null, skipped: false, scheduledIds: [], suggestedSets: {} }) === false, 'empty rest day is not trained');
assert(shouldCountAsTrainedDay({
  session: mixedSess, dayType: 'push', skipped: false,
  scheduledIds: ['bench'], suggestedSets: { bench: 3 }
}) === true, 'ad-hoc sets on a workout day still count even if the scheduled work is unfinished');
assert(shouldCountAsTrainedDay({
  session: partialSched, dayType: 'push', skipped: false,
  scheduledIds: ['bench'], suggestedSets: { bench: 3 }
}) === false, 'a partial scheduled workout without Quick-Log is not a finished day');
assert(shouldCountAsTrainedDay({
  session: { sets: { bench: [8, 8, 8] } }, dayType: 'push', skipped: false,
  scheduledIds: ['bench'], suggestedSets: { bench: 3 }
}) === true, 'finishing the scheduled workout still counts');

const unit = (id, v) => (id === 'standardPushup' ? v * 2 : v);
assert(computeSessionPointsFromSets(mixedSess, unit) === 8 + 8 + 20, 'session points must include Quick-Log ids, not only the scheduled list');

assert(isUntrainedRestOrSkipped(null, false, false) === true, 'idle rest days are skipped in streak walk-back');
assert(isUntrainedRestOrSkipped(null, false, true) === false, 'a trained rest day is a streak anchor');
assert(isUntrainedRestOrSkipped('push', false, false) === false, 'missed workout days still break the streak');

const days = ['2026-08-19', '2026-08-20', '2026-08-21'];
function addDays(key, n) {
  const i = days.indexOf(key) + n;
  return days[Math.max(0, Math.min(days.length - 1, i))] || key;
}
const trainedRest = previousStreakAnchor('2026-08-21', addDays, (cursor) => {
  if (cursor === '2026-08-20') return { dayType: null, skipped: false, trained: true };
  return { dayType: 'push', skipped: false, trained: cursor === '2026-08-19' };
});
assert(trainedRest === '2026-08-20', 'streak walk-back must stop on a Quick-Log rest day, got ' + trainedRest);

const idleRest = previousStreakAnchor('2026-08-21', addDays, (cursor) => {
  if (cursor === '2026-08-20') return { dayType: null, skipped: false, trained: false };
  return { dayType: 'push', skipped: false, trained: true };
});
assert(idleRest === '2026-08-19', 'untrained rest days are still skipped in walk-back');

const s = {};
assert(ensurePendingProgressClaims(s) === true);
enqueueProgressClaim(s, { id: 'level-12', kind: 'level', title: 'Level 12!', lines: [{ label: 'Gold', value: '+24' }] });
enqueueProgressClaim(s, { id: 'rank-elite', kind: 'rank', title: 'Rank Up' });
assert(s.pendingProgressClaims.length === 2, 'level and rank claims stack independently');
dismissProgressClaim(s, 'level-12');
assert(s.pendingProgressClaims.length === 1 && s.pendingProgressClaims[0].id === 'rank-elite', 'Continue dismisses only that claim');

console.log('v4.2 tests ok — intros, tap-to-claim, trained-day Quick-Log, unified XP fill');
