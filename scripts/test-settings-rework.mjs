#!/usr/bin/env node
/**
 * Settings is a grouped home with a nested Workout Editor sub-screen.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'garage-gains.html'), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(html.includes('id="settingsHome"'), 'Settings home grouping missing');
assert(html.includes('id="settingsSubscreen"'), 'Settings nested screen missing');
assert(html.includes('id="settingsBackBtn"'), 'Workout Editor back button missing');
assert(html.includes('data-settings-sub="editor"'), 'Workout Editor must be a Settings entry, not inline on home');
assert(html.includes('data-settings-pane="editor"'), 'Workout Editor pane missing');
assert(html.includes('id="workoutEditorCard"'), 'day-list editor still mounts');
assert(html.includes('id="exercisesManagerCard"'), 'exercise catalog still mounts inside the editor');
assert(html.includes('we-day-tabs') || html.includes('we-day-tab'), 'Workout Editor should use day tabs instead of one long dump');

const homeSlice = html.slice(html.indexOf('id="settingsHome"'), html.indexOf('id="settingsSubscreen"'));
assert(!homeSlice.includes('id="workoutEditorCard"'), 'day lists must not stay on the Settings home');
assert(!homeSlice.includes('id="exercisesManagerCard"'), 'exercise catalog must not stay on the Settings home');
assert(homeSlice.includes('data-settings-sub="schedule"'), 'Weekly Schedule should be its own entry');
assert(homeSlice.includes('data-settings-sub="problems"'), 'Problem Areas should be its own entry');
assert(homeSlice.includes('settings-group-label'), 'related options must be grouped');
assert(homeSlice.includes('settings-nav-row'), 'Settings home should use nav rows, not a flat dump');

console.log('settings rework tests ok — grouped home, nested Workout Editor');
