#!/usr/bin/env node
/**
 * Extracts the backup unwrap helpers from garage-gains.html and checks that
 * old raw dumps, wrapped native exports, and empty files behave correctly.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'garage-gains.html'), 'utf8');
const begin = html.indexOf('/* === backup-restore-lib begin === */');
const end = html.indexOf('/* === backup-restore-lib end === */');
if (begin < 0 || end < 0 || end <= begin) {
  throw new Error('backup-restore-lib markers missing from garage-gains.html');
}
const lib = html.slice(begin, end);
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(lib, ctx);

const {
  parseBackupText,
  unwrapBackup,
  backupHasProgress,
  countBackupWorkouts,
} = ctx;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const rawProgress = {
  version: 4,
  theme: 'rig',
  workoutLog: {
    '2026-08-01': { day: 'push', completed: true, points: 80, sets: { chairDips: [12, 10] } },
    '2026-08-02': { day: 'pull', completed: true, points: 60, sets: { rows: [8] } },
  },
  totalPoints: 140,
  onboarding: { name: 'Haris', freq: 5, equipment: ['chair'] },
  customExercises: { push: ['chairDips'], pull: ['rows'], core: [] },
  profile: { displayName: 'Haris' },
  weightLog: [{ date: '2026-08-01', kg: 61.5 }],
};

const unwrapped = unwrapBackup(rawProgress);
assert(unwrapped && unwrapped.totalPoints === 140, 'raw state should unwrap');
assert(backupHasProgress(unwrapped), 'raw state should count as progress');
assert(countBackupWorkouts(unwrapped) === 2, 'should count completed sessions');

const wrappedNative = { v: 1, savedAt: '2026-08-20T00:00:00.000Z', state: rawProgress };
assert(unwrapBackup(wrappedNative).totalPoints === 140, 'native {v,state} wrapper should unwrap');

const wrappedApp = { app: 'rigcore', format: 1, exportedAt: '2026-08-21T00:00:00.000Z', state: rawProgress };
assert(unwrapBackup(wrappedApp).workoutLog['2026-08-01'].completed, 'app wrapper should unwrap');

const localStorageDump = { garageGains_v1: JSON.stringify(rawProgress) };
assert(unwrapBackup(localStorageDump).totalPoints === 140, 'localStorage dump should unwrap');

const doubleEncoded = JSON.stringify(JSON.stringify(rawProgress));
assert(unwrapBackup(parseBackupText(doubleEncoded)).totalPoints === 140, 'double-encoded JSON should parse');

const bomText = '\uFEFF' + JSON.stringify(rawProgress);
assert(unwrapBackup(parseBackupText(bomText)).totalPoints === 140, 'BOM prefix should be stripped');

const junkAround = 'preview\n' + JSON.stringify({ app: 'rigcore', state: rawProgress }) + '\nend';
assert(unwrapBackup(parseBackupText(junkAround)).totalPoints === 140, 'junk around JSON should still parse');

assert(unwrapBackup({}) === null, 'empty object is not a backup');
assert(unwrapBackup({ v: 1, savedAt: 'x', state: {} }) === null, 'empty nested state is not a backup');
assert(unwrapBackup({ title: 'RIGCORE backup', text: 'file.json' }) === null, 'share metadata is not a backup');
assert(!backupHasProgress({}), 'empty object has no progress');
assert(!backupHasProgress({ theme: 'rig' }), 'theme-only object has no progress');

let threw = false;
try { parseBackupText(''); } catch { threw = true; }
assert(threw, 'empty text should fail parse');

threw = false;
try { parseBackupText('not json'); } catch { threw = true; }
assert(threw, 'invalid text should fail parse');

const oldAssignBug = Object.assign(
  { workoutLog: {}, totalPoints: 0, theme: 'rig' },
  wrappedNative
);
assert(!oldAssignBug.workoutLog['2026-08-01'], 'shallow assign of wrapper must not look like restored log');
assert(unwrapBackup(wrappedNative).workoutLog['2026-08-01'], 'unwrap fixes the wrapper assign bug');

function applyLikeApp(text) {
  let parsed;
  try { parsed = parseBackupText(text); } catch { return { ok: false, reason: 'parse' }; }
  const extracted = unwrapBackup(parsed);
  if (!extracted) return { ok: false, reason: 'unwrap' };
  if (!backupHasProgress(extracted)) return { ok: false, reason: 'empty' };
  return { ok: true, state: Object.assign({ workoutLog: {}, totalPoints: 0, theme: 'rig' }, extracted) };
}

const appliedWrapped = applyLikeApp(JSON.stringify(wrappedNative));
assert(appliedWrapped.ok && appliedWrapped.state.totalPoints === 140, 'wrapped native export should apply');
assert(appliedWrapped.state.workoutLog['2026-08-01'].completed, 'applied state must keep workout history');

const appliedRaw = applyLikeApp(JSON.stringify(rawProgress));
assert(appliedRaw.ok && appliedRaw.state.customExercises.push[0] === 'chairDips', 'raw browser export should apply');

assert(applyLikeApp('{}').ok === false, 'empty JSON must not toast-success');
assert(applyLikeApp('{"title":"RIGCORE backup"}').ok === false, 'share metadata must not toast-success');

console.log('backup restore tests passed');
