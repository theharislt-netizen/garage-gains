#!/usr/bin/env node
/**
 * Morning Stretch must be a real full-body flow, not two 30s mobility snippets
 * with a 62% workout-day bonus.
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

assert(/MOBILITY_MORNING_REWARD_PCT = 0\.40/.test(html), 'morning bonus must be 40% of workout basis, not 62%');
assert(!html.includes('MOBILITY_MORNING_REWARD_PCT = 0.62'), 'old 62% morning bonus must be gone');
assert(!html.includes("const tmpl = pickMobilityTemplate(issueTargets[0]);"), 'morning stretch must not reuse 2-move mobility templates');

const begin = html.indexOf('/* === morning-stretch-lib begin === */');
const end = html.indexOf('/* === morning-stretch-lib end === */');
assert(begin >= 0 && end > begin, 'morning-stretch-lib markers missing');

const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(html.slice(begin, end), ctx);

const {
  morningStretchHoldSeconds,
  pickMorningStretchTemplateFrom,
  shouldRebuildMorningStretch,
  getMorningStretchLib,
} = ctx;

const {
  version: MORNING_STRETCH_VERSION,
  minMoves: MORNING_STRETCH_MIN_MOVES,
  minHoldSeconds: MORNING_STRETCH_MIN_HOLD_SECONDS,
  templates: MORNING_STRETCH_TEMPLATES,
} = getMorningStretchLib();

assert(MORNING_STRETCH_VERSION === 2, 'stretch version 2');
assert(MORNING_STRETCH_MIN_MOVES === 8, 'at least 8 moves');
assert(MORNING_STRETCH_TEMPLATES.length >= 3, 'need rotating full-body flows');

const ids = new Set();
for (const tmpl of MORNING_STRETCH_TEMPLATES) {
  assert(tmpl.moves.length >= MORNING_STRETCH_MIN_MOVES, tmpl.id + ' too short');
  const hold = morningStretchHoldSeconds(tmpl.moves);
  assert(hold >= 8 * MORNING_STRETCH_MIN_HOLD_SECONDS, tmpl.id + ' hold time too low: ' + hold);
  for (const m of tmpl.moves) {
    assert(m.isTime === true, tmpl.id + ' ' + m.id + ' must be a timed hold');
    assert(m.target >= MORNING_STRETCH_MIN_HOLD_SECONDS, tmpl.id + ' ' + m.name + ' hold too short');
    assert(!ids.has(m.id), 'duplicate move id ' + m.id);
    ids.add(m.id);
  }
}

assert(shouldRebuildMorningStretch({
  status: 'available',
  stretchVersion: 1,
  moves: [{ id: 'x', isTime: true, target: 30 }, { id: 'y', isTime: true, target: 30 }],
}), 'old 2-move available sessions must rebuild');
assert(!shouldRebuildMorningStretch({
  status: 'completed',
  stretchVersion: 1,
  moves: [{ id: 'x' }],
}), 'do not rebuild a finished session');
assert(!shouldRebuildMorningStretch({
  status: 'available',
  stretchVersion: 2,
  moves: MORNING_STRETCH_TEMPLATES[0].moves,
}), 'current full flow should stay');

const first = pickMorningStretchTemplateFrom(MORNING_STRETCH_TEMPLATES, 'msRiseOpen');
assert(first && first.id !== 'msRiseOpen', 'rotation should skip the last template');

console.log('morning stretch tests ok —', MORNING_STRETCH_TEMPLATES.length, 'flows,', ids.size, 'timed holds');
