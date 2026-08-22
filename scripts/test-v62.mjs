#!/usr/bin/env node
/**
 * v6.2: Dashboard must not flash a gradient/ghost overlay after a workout or
 * on later tab switches. Tutorial nav glows (Inventory, Rank, Enchant) clear
 * on the directed tap, not on a later re-render.
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
vm.runInContext(sliceLib('v47-helpers-lib'), ctx);
vm.runInContext(sliceLib('first-run-unlock-lib'), ctx);

const {
  acknowledgeTutorialNavTap,
  acknowledgeTutorialEnchantTap,
  shouldTutorialGuideEnchant,
  viewTabFadeShouldReplay,
  openStarterVictoryBox,
  grantStarterVictoryBox,
  defaultProgression,
} = ctx;

assert(viewTabFadeShouldReplay() === false, 'tab views never replay a fade-in');

const viewRuleAt = html.indexOf('.view.active {');
assert(viewRuleAt >= 0, 'active view rule exists');
const viewRule = html.slice(viewRuleAt, html.indexOf('}', viewRuleAt) + 1);
assert(viewRule.includes('display: block'), 'active views are shown');
assert(!/animation\s*:/.test(viewRule), 'active Dashboard view has no fadeIn animation');
assert(!html.includes('animation: fadeIn'), 'fadeIn is not attached to tab views');

const switchFn = sliceFn('switchView', 'renderUpcoming');
assert(switchFn.includes("classList.remove('instance-enter')"), 'tab changes still strip instance-enter');
assert(switchFn.includes('resetDashboardChrome()'), 'leaving a finished instance clears leftover overlay chrome');
assert(switchFn.includes("if (name === 'today') renderToday()"), 'returning to Dashboard re-renders without leftover instance sheet');
assert(switchFn.includes('syncTabLocks()'), 'tab switches refresh nav glow classes');

const renderToday = html.slice(html.indexOf('function renderToday()'), html.indexOf('function finalizeSessionIfNeeded'));
const dashBranch = renderToday.slice(renderToday.indexOf("if (window.__activeInstance)"));
assert(dashBranch.indexOf('resetDashboardChrome()') < dashBranch.indexOf("dashboardNormalContent').style.display = ''"),
  'instance overlay hides before the Dashboard sections are shown');

const resetFn = sliceFn('resetDashboardChrome', 'renderInstanceView');
assert(resetFn.includes("classList.remove('flash-active')"), 'battle-flash overlay is cleared with the instance');
assert(resetFn.includes("classList.remove('instance-fixed-scroll', 'instance-enter')"),
  'fixed instance sheet cannot linger over Workout/Warm-up/Mobility');

const finalizeFn = sliceFn('finalizeSessionIfNeeded', 'recomputeBests');
assert(finalizeFn.includes('resetDashboardChrome()'), 'finishing a workout tears down the instance overlay');

const crAt = html.indexOf('.cr-overlay {');
const crRule = html.slice(crAt, html.indexOf('.cr-overlay.show', crAt));
assert(crRule.includes('display: none'), 'reward overlay is not a lingering opacity-0 sheet');
assert(!crRule.includes('transition: opacity'), 'reward overlay does not fade a gradient ghost over Dashboard');

const p = defaultProgression(false);
p.nudgeInventory = true;
p.nudgeRank = true;
assert(acknowledgeTutorialNavTap(p, 'inventory') === true, 'Inventory tap consumes the nav glow');
assert(p.nudgeInventory === false, 'Inventory glow flag is cleared on tap');
assert(p.nudgeRank === true, 'Inventory tap does not clear Rank');
assert(acknowledgeTutorialNavTap(p, 'inventory') === false, 'a second Inventory tap is a no-op');
assert(acknowledgeTutorialNavTap(p, 'rank') === true, 'Rank tap consumes its glow');
assert(p.nudgeRank === false, 'Rank glow flag is cleared on tap');

const tabClick = html.slice(html.indexOf("document.querySelectorAll('.tab').forEach"), html.indexOf('function switchView(name)'));
assert(tabClick.includes('acknowledgeTutorialNavTap(state.progression, view)'),
  'nav clicks acknowledge the tutorial glow before the view changes');
assert(tabClick.includes('syncTabLocks()'), 'nav class is updated on the same tap, not a later Dashboard render');

const boxed = {
  progression: defaultProgression(false),
  inventory: { permanent: [], tempCharges: {}, shards: { boost: 0, relic: 0 }, stones: { boost: 0, relic: 0 }, boxes: [] },
};
assert(grantStarterVictoryBox(boxed) === true, 'starter box still grants');
assert(shouldTutorialGuideEnchant(boxed) === false, 'Enchant does not glow before the box is opened');
const loot = openStarterVictoryBox(boxed);
assert(loot && loot.relicInst, 'opening the box grants the relic');
assert(shouldTutorialGuideEnchant(boxed) === true, 'Enchant glows once the box is opened');
assert(acknowledgeTutorialEnchantTap(boxed.progression) === false, 'opening Enchant does not consume the glow');
assert(shouldTutorialGuideEnchant(boxed) === true, 'Enchant glow stays after visiting the table');
assert(boxed.progression.enchantTutorialDone !== true, 'enchanting itself is still unfinished');
boxed.progression.enchantTutorialDone = true;
assert(shouldTutorialGuideEnchant(boxed) === false, 'Enchant glow clears only after the enchant step completes');

const openEnchant = sliceFn('openEnchantModal', 'closeEnchantModal');
assert(!openEnchant.includes('acknowledgeTutorialEnchantTap(state.progression)'),
  'opening Enchant does not acknowledge the tutorial step');
assert(!openEnchant.includes("classList.remove('tutorial-guidance-glow'"),
  'Enchant button glow is not stripped just because the table opened');

assert(html.includes('3.4.26'), 'About version bumped for v6.2');

console.log('v6.2 tests ok — no Dashboard fade ghost, workout chrome resets, Enchant glow lasts until enchant completes');
