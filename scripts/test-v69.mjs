#!/usr/bin/env node
/**
 * v6.9: enchant success rates fall with each next star (70/55/40/28/20).
 * A miss does not strip stars, gold, or the item. Stone/item slot flow stays.
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
vm.runInContext(sliceLib('enchant-regrade-lib'), ctx);

const rate = vm.runInContext('enchantAttemptSuccessRate', ctx);
const pct = vm.runInContext('enchantAttemptSuccessPct', ctx);
const apply = vm.runInContext('applyEnchantAttempt', ctx);
const rates = vm.runInContext('ENCHANT_SUCCESS_RATES', ctx);

assert(rates.length === 5, 'five enchant steps');
assert(rate(0) === 0.70 && pct(0) === 70, '1st enchant is 70%');
assert(rate(1) === 0.55 && pct(1) === 55, '2nd enchant is 55%');
assert(rate(2) === 0.40 && pct(2) === 40, '3rd enchant is 40%');
assert(rate(3) === 0.28 && pct(3) === 28, '4th enchant is 28%');
assert(rate(4) === 0.20 && pct(4) === 20, '5th enchant is 20%');
assert(rate(0) > rate(1) && rate(1) > rate(2) && rate(2) > rate(3) && rate(3) > rate(4),
  'each next enchant is harder');
assert(pct(0, 0.04) === 74, 'enchant-success gear still adds on top of the table');
assert(pct(4, 0.08) === 28, 'late-star gear bonus cannot flatten the curve back to easy');

const kept = { star: 3 };
assert(apply(kept, false) === 3 && kept.star === 3, 'a miss does not downgrade stars');
const gained = { star: 3 };
assert(apply(gained, true) === 4 && gained.star === 4, 'a hit still fills the next star');

const upgradeFn = sliceFn('performStarUpgrade', 'attemptRegrade');
assert(upgradeFn.includes('enchantAttemptSuccessRate'), 'table rates drive the roll');
assert(upgradeFn.includes("equippedBonusFor('enchantSuccess')"), 'success gear still feeds the roll');
assert(upgradeFn.includes('applyEnchantAttempt'), 'star change goes through the no-downgrade helper');
assert(!upgradeFn.includes('inst.star - 1'), 'fail no longer strips a star');
assert(!upgradeFn.includes('nextStar <= REGRADE_SAFE_CEILING'), 'early stars are no longer free');

const chanceFn = sliceFn('enchantAttemptChancePct', 'enchantAttemptFromSlot');
assert(!chanceFn.includes('return 100'), 'UI chance is never a guaranteed 100%');
assert(chanceFn.includes('enchantSuccessChancePct(inst)'), 'UI chance uses the item\'s current star');

const attemptFn = sliceFn('enchantAttemptFromSlot', 'playEnchantAnimation');
assert(attemptFn.includes('reloadEnchantStoneSlot()'), 'stone slot still reloads after an attempt');
assert(!attemptFn.includes('table.stonePlaced = false'), 'attempt does not wipe the stone slot');
assert(attemptFn.includes('table.instanceId'), 'attempt still keys off the placed item');

const resultsFn = sliceFn('showEnchantResults', 'enchantCoachText');
assert(!resultsFn.includes('table.instanceId = null'), 'Continue leaves the item on the table');
assert(!resultsFn.includes('stonePlaced = false'), 'Continue still does not kick a loaded stone');
assert(resultsFn.includes("success ? '+1' : '0'"), 'fail results show no star loss');
assert(!resultsFn.includes("'−1'"), 'fail results no longer claim a downgrade');

const renderFn = sliceFn('renderEnchantModal', 'renderShopModal');
assert(renderFn.includes('enchantAttemptChancePct(inst, tmpl)'), 'table still prints this-attempt %');
assert(renderFn.includes('tutorial-guidance-glow'), 'enchant tutorial glow is unchanged');

assert(html.includes('3.4.24'), 'About version bumped for v6.9');

console.log('v6.9 tests ok — 70/55/40/28/20 enchant curve, miss keeps stars, slots persist');
