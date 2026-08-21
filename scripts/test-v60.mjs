#!/usr/bin/env node
/**
 * v6: hero rank icon+badge share rank color/glow; baseline tutorial is two
 * sets across a wider exercise mix; inventory refreshes after box-open;
 * reward items have no glow (Enchant glows instead); "Gear shouldn't be
 * removed" lives on unequip of an active set piece, not under Loadout.
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
vm.runInContext(sliceLib('v47-helpers-lib'), ctx);
vm.runInContext(sliceLib('equipment-sets-lib'), ctx);
vm.runInContext(sliceLib('first-run-unlock-lib'), ctx);

const {
  baselineQuestSuggestedSets,
  signalVarietyKey,
  pickSignalExercises,
  shouldTutorialGuideEnchant,
  suppressRewardItemGlow,
  invRewardItemGlowClass,
  invSlotGlowClass,
  setBonusWouldDropOnUnequip,
  setBonusBreakdownForTemplate,
  openStarterVictoryBox,
  grantStarterVictoryBox,
  defaultProgression,
} = ctx;

assert(vm.runInContext('BASELINE_QUEST_MAX_SETS', ctx) === 2, 'baseline tutorial caps at two sets');
assert(baselineQuestSuggestedSets({ suggestedSets: 4 }) === 2, 'push-up 4-set catalog is capped to 2');
assert(baselineQuestSuggestedSets({ suggestedSets: 3 }) === 2, '3-set catalog is capped to 2');
assert(baselineQuestSuggestedSets({ suggestedSets: 2 }) === 2, 'already-2 stays 2');
assert(baselineQuestSuggestedSets({ suggestedSets: 1 }) === 1, 'a 1-set catalog lift is not padded up');
assert(baselineQuestSuggestedSets({}) === 2, 'missing catalog sets default to the 2-set cap');

const curl = { id: 'dbCurl', day: 'pull', suggestedSets: 3, equip: ['dumbbell'], focus: ['arms'] };
const row = { id: 'dbRow', day: 'pull', suggestedSets: 3, equip: ['dumbbell'], focus: ['back'] };
const press = { id: 'ohPress', day: 'push', suggestedSets: 3, equip: ['dumbbell'], focus: ['shoulders'] };
const pushup = { id: 'standardPushup', day: 'push', suggestedSets: 4, equip: [], focus: ['chest'] };
assert(signalVarietyKey(curl) !== signalVarietyKey(row), 'curl and row are distinct varieties');
assert(signalVarietyKey(press) !== signalVarietyKey(curl), 'press and curl are distinct varieties');

const routine = [pushup, press, row, curl,
  { id: 'chairDips', day: 'push', suggestedSets: 3, equip: ['chair'], focus: ['chest', 'arms'] },
  { id: 'plank', day: 'core', suggestedSets: 2, isTime: true, equip: [], focus: ['core'] },
];
const signals = pickSignalExercises(routine);
assert(signals.some(s => s.id === 'dbCurl'), 'baseline tutorial includes dumbbell curls');
assert(signals.some(s => s.id === 'dbRow'), 'baseline tutorial still includes a compound dumbbell lift');
assert(signals.some(s => s.id === 'ohPress'), 'baseline tutorial includes a dumbbell press');
assert(signals.some(s => s.id === 'standardPushup'), 'bodyweight push stays in the mix');
assert(signals.every(s => baselineQuestSuggestedSets(s) <= 2), 'no signal asks for more than two sets');

const buildFn = sliceFn('buildBaselineQuestExercises', 'showBaselineIntro');
assert(buildFn.includes('baselineQuestSuggestedSets'), 'quest list applies the two-set cap');

const headerFn = sliceFn('renderHeader', 'populateRankBar');
assert(headerFn.includes('applyRankPairChrome'), 'hero banner paints icon and badge together');
assert(headerFn.includes('applyRankPairChrome(nameBadgeIcon, nameBadge'), 'icon and badge share the rank pair helper');
assert(html.includes('function applyRankPairChrome'), 'rank pair helper exists');
assert(html.includes("frameEl.style.setProperty('--rank-color'"), 'shared frame carries the rank color');
assert(html.includes("badgeEl.style.setProperty('--rank-color'"), 'badge border uses the rank color');
assert(html.includes('box-shadow: 0 0 8px var(--rank-color'), 'icon and badge share a rank-colored glow');

const dismissFn = sliceFn('dismissBoxReveal', 'getBoxRevealTier');
assert(dismissFn.includes('hideBoxRevealOverlay'), 'overlay hides first');
assert(dismissFn.includes('renderInventoryTab()'), 'inventory re-renders after a box-open');
assert(dismissFn.indexOf('hideBoxRevealOverlay') < dismissFn.indexOf('renderInventoryTab()'),
  'inventory refresh is not on the hide frame');
assert(dismissFn.includes('afterPaint'), 'inventory refresh waits for a committed paint');

const boxed = {
  progression: defaultProgression(false),
  inventory: { permanent: [], tempCharges: {}, shards: { boost: 0, relic: 0 }, stones: { boost: 0, relic: 0 }, boxes: [] },
};
assert(grantStarterVictoryBox(boxed) === true, 'starter box still grants');
assert(shouldTutorialGuideEnchant(boxed) === false, 'Enchant does not glow before the box is opened');
const loot = openStarterVictoryBox(boxed);
assert(loot && loot.relicInst, 'opening the box grants the relic');
assert(shouldTutorialGuideEnchant(boxed) === true, 'Enchant glows once the reward is in Inventory');
assert(suppressRewardItemGlow(boxed) === true, 'reward-item glow is suppressed in this tutorial step');
assert(invRewardItemGlowClass(boxed, loot.relicInst, { id: 'wornCharm' }, false, () => 'star-glow-3') === '',
  'the received relic has no inventory glow');
assert(invSlotGlowClass(boxed, 'starterVictoryBox', true) !== 'tutorial-guidance-glow',
  'opened box no longer uses the tutorial item glow');

const invFn = sliceFn('renderInventoryTab', 'positionItemDetailPopup');
assert(invFn.includes('shouldTutorialGuideEnchant(state)'), 'Enchant button uses the tutorial glow');
assert(invFn.includes('invRewardItemGlowClass'), 'inventory items use the no-reward-glow helper');
assert(!invFn.includes("nudgeEquip) && inst.itemId === STARTER_RELIC_ID"),
  'starter relic no longer keeps a leftover tutorial glow');

assert(!html.includes('inv-primary-sub">Gear'), 'Loadout button has no Gear subtitle');
assert(html.includes("Gear shouldn't be removed"), 'the keep-gear copy still exists');
assert(html.includes('item-unequip-warn'), 'the copy lives on item detail, not the Loadout button');
assert(html.includes('setBonusWouldDropOnUnequip'), 'warning is gated on an active set bonus');

const twoPiece = { ashenGrinder: 2 };
const tmpl = { setId: 'ashenGrinder' };
assert(setBonusWouldDropOnUnequip(tmpl, twoPiece) === true, 'unequipping a 2-piece bonus warns');
assert(setBonusWouldDropOnUnequip(tmpl, { ashenGrinder: 1 }) === false, 'one piece is not an active bonus');
assert(setBonusWouldDropOnUnequip({ setId: 'nope' }, twoPiece) === false, 'non-set gear does not warn');
assert(setBonusBreakdownForTemplate(tmpl, twoPiece).bonuses[0].active === true, '2-piece bonus is active');

assert(html.includes('3.4.24'), 'About version bumped for v6');

console.log('v6 tests ok — rank pair color, 2-set baseline variety, inventory refresh, no item glow, set-unequip warning');
