#!/usr/bin/env node
/**
 * Quick-log catalog ranking: bodyweight, no-equipment moves surface first
 * on the unfiltered list; search still reaches the full catalog.
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

assert(html.includes('id="quickLogFab"'), 'Dashboard plus button missing');
assert(html.includes('id="quickLogOverlay"'), 'quick-log overlay missing');
assert(html.includes('id="quickLogSearch"'), 'quick-log search bar missing');
assert(html.includes('renderExerciseCardsInto'), 'set logging must reuse the workout card builder');
assert(html.includes('refreshAfterSetChange'), 'quick-log must refresh through the shared set-log path');
assert(html.includes('unitPoints(exId, val)'), 'points must use the same unitPoints rate as scheduled sets');
assert(!html.includes('quickLogPoints'), 'must not invent a separate ad-hoc points formula');

const begin = html.indexOf('/* === quick-log-lib begin === */');
const end = html.indexOf('/* === quick-log-lib end === */');
assert(begin >= 0 && end > begin, 'quick-log-lib markers missing');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(html.slice(begin, end), ctx);

const { adHocRank, sortAdHocCatalog, getAdHocBodyweightIds } = ctx;
const AD_HOC_BODYWEIGHT_IDS = getAdHocBodyweightIds();
assert(Array.isArray(AD_HOC_BODYWEIGHT_IDS) && AD_HOC_BODYWEIGHT_IDS.includes('standardPushup'), 'push-ups must be in the ad-hoc set');
assert(AD_HOC_BODYWEIGHT_IDS.includes('legRaise'), 'sit-up-like bodyweight core must be in the ad-hoc set');
assert(AD_HOC_BODYWEIGHT_IDS.includes('plank'), 'plank must be in the ad-hoc set');

const catalog = [
  { id: 'ohPress', name: 'Single-Arm Overhead Press', muscle: 'Shoulders', day: 'push', equip: ['dumbbell'] },
  { id: 'standardPushup', name: 'Standard Push-Ups', muscle: 'Overall Chest', day: 'push', equip: [] },
  { id: 'dbRow', name: 'Single-Arm Dumbbell Row', muscle: 'Back', day: 'pull', equip: ['dumbbell'] },
  { id: 'plank', name: 'Plank', muscle: 'Core Stability', day: 'core', equip: [], isTime: true },
  { id: 'legRaise', name: 'Leg Raise', muscle: 'Lower Abs', day: 'core', equip: [] },
  { id: 'archivedOne', name: 'Old Move', muscle: 'Arms', day: 'pull', equip: [], archived: true },
];

const ranked = sortAdHocCatalog(catalog, '');
assert(ranked[0].id === 'standardPushup', 'push-ups should lead the default list, got ' + ranked[0].id);
assert(ranked.map(e => e.id).includes('plank'), 'plank should appear unfiltered');
assert(ranked.findIndex(e => e.id === 'ohPress') > ranked.findIndex(e => e.id === 'plank'), 'equipment moves sit below bodyweight');
assert(!ranked.some(e => e.archived), 'archived exercises stay out of the picker');
assert(adHocRank({ id: 'standardPushup' }) < adHocRank({ id: 'ohPress', equip: ['dumbbell'] }), 'bodyweight ranks above loaded presses');

const searched = sortAdHocCatalog(catalog, 'row');
assert(searched.length === 1 && searched[0].id === 'dbRow', 'search must still reach equipment exercises');

const pushSearch = sortAdHocCatalog(catalog, 'push');
assert(pushSearch.some(e => e.id === 'standardPushup'), 'search by name still finds push-ups');

console.log('quick-log tests ok — bodyweight first, full catalog via search');
