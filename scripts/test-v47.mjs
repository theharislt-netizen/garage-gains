#!/usr/bin/env node
/**
 * v4.7: no Level 1 celebration, tutorial drop is the box only,
 * distinct tutorial guidance glow, instance-enter does not replay on tab back.
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
vm.runInContext(sliceLib('v47-helpers-lib'), ctx);
vm.runInContext(sliceLib('first-run-unlock-lib'), ctx);

const {
  getLevel,
  shouldCelebrateLevel,
  shouldTutorialGuideBox,
  invSlotGlowClass,
  tutorialAwardIsBoxOnly,
  grantStarterVictoryBox,
  defaultProgression,
} = ctx;

assert(getLevel(0) === 1 && getLevel(149) === 1 && getLevel(150) === 2, 'displayed level starts at 1');
assert(shouldCelebrateLevel(0, 0, getLevel) === false, 'staying at 0 pts is not a celebration');
assert(shouldCelebrateLevel(0, 149, getLevel) === false, 'still Level 1 is not a celebration');
assert(shouldCelebrateLevel(0, 150, getLevel) === true, 'reaching Level 2 is a genuine level-up');
assert(shouldCelebrateLevel(150, 150, getLevel) === false, 'already Level 2 does not re-fire');
assert(shouldCelebrateLevel(150, 600, getLevel) === true, 'Level 2 → 3 still celebrates');

function oldGetLevel(points) {
  return Math.floor(Math.sqrt(Math.max(0, points) / 150));
}
assert(oldGetLevel(0) === 0 && oldGetLevel(150) === 1, '0-indexed helper matches the false Level 1 case');
assert(shouldCelebrateLevel(0, 149, oldGetLevel) === false, '0-indexed Level 1 is suppressed');
assert(shouldCelebrateLevel(0, 150, oldGetLevel) === false, '0-indexed "reached 1" is not a celebration');
assert(shouldCelebrateLevel(0, 600, oldGetLevel) === true, '0-indexed Level 2 still celebrates');

const checkFn = html.slice(html.indexOf('function checkLevelUp'), html.indexOf('const STREAK_TIERS'));
assert(checkFn.includes('shouldCelebrateLevel(prevPoints, newPoints, getLevel)'), 'checkLevelUp gates on genuine climbs');
assert(html.includes('shouldCelebrateLevel(prevTotal, newTotal, getLevel)'), 'XP bar Level Up copy uses the same gate');

const boxed = {
  progression: defaultProgression(false),
  inventory: { permanent: [], tempCharges: {}, shards: { boost: 0, relic: 0 }, stones: { boost: 0, relic: 0 }, boxes: [] },
};
assert(grantStarterVictoryBox(boxed) === true, 'tutorial grants the First Victory Box');
assert(tutorialAwardIsBoxOnly(boxed) === true, 'tutorial drop is the sealed box only');
assert((boxed.inventory.permanent || []).length === 0, 'no relic is granted alongside the box');
assert((boxed.inventory.shards.boost || 0) === 0 && (boxed.inventory.shards.relic || 0) === 0, 'no shards alongside the box');
assert((boxed.inventory.stones.relic || 0) === 0, 'stones wait until the box is opened');
assert(html.includes('Tutorial drop is the sealed box only'), 'grantStarterVictoryBox documents box-only drop');

assert(shouldTutorialGuideBox(boxed, 'starterVictoryBox') === true, 'unopened starter box is the guided tap target');
assert(shouldTutorialGuideBox(boxed, 'shopBoostBox') === false, 'other boxes do not use the tutorial glow');
assert(invSlotGlowClass(boxed, 'starterVictoryBox', true) === 'tutorial-guidance-glow', 'guidance glow wins over new-item flash');
boxed.progression.starterBoxOpened = true;
assert(shouldTutorialGuideBox(boxed, 'starterVictoryBox') === false, 'guidance glow clears once the box is opened');
assert(invSlotGlowClass(boxed, 'starterVictoryBox', true) === 'new-item-glow', 'opened/other items keep the subtler new-item glow');
assert(invSlotGlowClass(boxed, 'starterVictoryBox', false) === '', 'viewed items have no glow');

const invRender = html.slice(html.indexOf('const boxSlots = sealedBoxes.map'), html.indexOf('const permSlots = permItems.map'));
assert(invRender.includes('invSlotGlowClass'), 'inventory box slots use the dual-glow helper');
assert(html.includes('.inv-slot.tutorial-guidance-glow'), 'inventory slots have a dedicated guidance-glow rule');
assert(html.includes('.unlock-pulse') && html.includes('tutorial-guidance-glow'), 'both glow types still exist');
const slotGlowAt = html.indexOf('.inv-slot.tutorial-guidance-glow');
const slotGlowRule = html.slice(slotGlowAt, html.indexOf('}', slotGlowAt) + 1);
assert(!/transform|scale\s*\(/i.test(slotGlowRule), 'guidance glow must not use transform/scale');

const switchFn = html.slice(html.indexOf('function switchView(name)'), html.indexOf('function renderUpcoming()'));
assert(switchFn.includes("classList.remove('instance-enter')"), 'tab changes strip the workout-entry animation class');
const renderInst = html.slice(html.indexOf('function renderInstanceView()'), html.indexOf('function renderToday()'));
assert(renderInst.includes("addEventListener('animationend'"), 'enter animation removes itself when it finishes');
assert(renderInst.includes('window.__instanceJustEntered'), 'enter class is only added on a real entry');
assert(html.includes("instView.classList.remove('instance-enter')"), 'dashboard chrome still clears leftover enter class');

assert(html.includes('3.4.23'), 'About version bumped for v4.7');

console.log('v4.7 tests ok — no Level 1 celebration, box-only tutorial drop, dual glows, instance-enter stripped on tab change');
