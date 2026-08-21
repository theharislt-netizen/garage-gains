#!/usr/bin/env node
/**
 * Dashboard quest sections: independently collapsible, start expanded,
 * persist until the person expands them again.
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

assert(html.includes('data-dash-collapse="morning"') || html.includes("dashQuestTitleHtml('morning'"), 'Morning Stretch must be collapsible');
assert(html.includes("dashQuestTitleHtml('warmup'") || html.includes('data-dash-collapse="warmup"'), 'Warm-Up must be collapsible');
assert(html.includes("dashQuestTitleHtml('mobility'") || html.includes('data-dash-collapse="mobility"'), 'Mobility must be collapsible');
assert(html.includes("dashQuestTitleHtml('quests'") || html.includes('data-dash-collapse="quests"'), 'Rest Day Quests must be collapsible');
assert(html.includes("dashQuestTitleHtml('bosses'") || html.includes('data-dash-collapse="bosses"'), 'Bosses must be collapsible');
assert(html.includes('dashCollapsed'), 'collapsed state must persist on the save blob');
assert(!/window\.__warmupSectionOpened = false; \/\/ v2\.9: starts collapsed again each fresh day/.test(html), 'warmup must not reset collapsed on a new day');

const begin = html.indexOf('/* === dash-collapse-lib begin === */');
const end = html.indexOf('/* === dash-collapse-lib end === */');
assert(begin >= 0 && end > begin, 'dash-collapse-lib markers missing');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(html.slice(begin, end), ctx);

const {
  ensureDashCollapsed,
  isDashSectionCollapsed,
  toggleDashSectionCollapsed,
  getDashQuestSectionIds,
} = ctx;
const DASH_QUEST_SECTION_IDS = getDashQuestSectionIds();

assert(DASH_QUEST_SECTION_IDS.includes('morning') && DASH_QUEST_SECTION_IDS.includes('warmup'), 'required quest section ids');
assert(DASH_QUEST_SECTION_IDS.includes('mobility') && DASH_QUEST_SECTION_IDS.includes('quests') && DASH_QUEST_SECTION_IDS.includes('bosses'));

const fresh = {};
ensureDashCollapsed(fresh);
assert(fresh.dashCollapsed && typeof fresh.dashCollapsed === 'object', 'missing map is created');
for (const id of DASH_QUEST_SECTION_IDS) {
  assert(isDashSectionCollapsed(fresh, id) === false, id + ' must start expanded');
}

assert(toggleDashSectionCollapsed(fresh, 'mobility') === true, 'first toggle collapses');
assert(isDashSectionCollapsed(fresh, 'mobility') === true, 'mobility stays collapsed');
assert(isDashSectionCollapsed(fresh, 'bosses') === false, 'other sections stay expanded');
assert(toggleDashSectionCollapsed(fresh, 'mobility') === false, 'second toggle expands');
assert(isDashSectionCollapsed(fresh, 'mobility') === false, 'manual expand clears the flag');

const loaded = { dashCollapsed: { warmup: true, quests: true } };
assert(isDashSectionCollapsed(loaded, 'warmup') === true, 'persisted collapse survives reload');
assert(isDashSectionCollapsed(loaded, 'quests') === true, 'each section remembers independently');
assert(isDashSectionCollapsed(loaded, 'morning') === false, 'unspecified sections stay expanded');

console.log('dash collapse tests ok — per-section, default expanded, persistent');
