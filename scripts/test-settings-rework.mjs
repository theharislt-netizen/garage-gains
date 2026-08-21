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
assert(homeSlice.includes('data-settings-sub="about"'), 'About must be a standalone Settings entry');
assert(homeSlice.includes('data-settings-sub="data"'), 'Data must be a Settings entry');
assert(homeSlice.includes('settings-group-label'), 'related options must be grouped');
assert(homeSlice.includes('settings-nav-row'), 'Settings home should use nav rows, not a flat dump');
assert(!homeSlice.includes('Add to Home Screen'), 'A2HS leftover must not stay on Settings home');
assert(!homeSlice.includes('id="resetBtn"'), 'Reset All Data must not sit on Settings home');
assert(!homeSlice.includes('Danger Zone'), 'Danger Zone grouping is gone — reset lives in Data');

const dataPaneStart = html.indexOf('data-settings-pane="data"');
const dataPane = html.slice(dataPaneStart, html.indexOf('</section>', dataPaneStart));
assert(dataPane.includes('id="resetBtn"'), 'Reset All Data must live in the Data pane');
assert(dataPane.includes('id="exportBtn"') && dataPane.includes('id="importBtn"'), 'Reset sits with backup/restore');

const aboutPaneStart = html.indexOf('data-settings-pane="about"');
assert(aboutPaneStart > 0, 'About pane missing');
const aboutPane = html.slice(aboutPaneStart, html.indexOf('data-settings-pane="data"', aboutPaneStart));
assert(aboutPane.includes('Version') && aboutPane.includes('3.4.5'), 'About pane must show the version');
assert(aboutPane.includes('Split'), 'About pane must show the split');

assert(!html.includes('id="addHomeBtn"'), 'Add to Home Screen control must be removed');
assert(!html.includes('data-settings-sub="shortcut"'), 'shortcut Settings entry must be removed');

console.log('settings rework tests ok — grouped home, nested Workout Editor, About standalone, Reset in Data');
