#!/usr/bin/env node
/**
 * v7.1 / spec v6.9: no clipped reward count badge, tighter horizontal
 * multi-item reveal, universal shards/stones, mobility on rest days.
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
vm.runInContext(sliceLib('box-reveal-lib'), ctx);

const layout = vm.runInContext('layoutBatchPrizes', ctx);
const ten = layout(10);
const center = ten.find(s => s.role === 'center');
const sats = ten.filter(s => s.role === 'sat');
const vSpan = Math.max(...sats.map(s => Math.abs(s.top - center.top)));
const hSpan = Math.max(...sats.map(s => Math.abs(s.left - 50)));
assert(hSpan > vSpan, 'multi-item reveal is wider than it is tall, got h=' + hSpan + ' v=' + vSpan);
assert(vSpan <= 36, 'satellites stay in a tight band under the featured item, vSpan=' + vSpan);
const three = layout(3);
assert(three.filter(s => s.role === 'sat').every(s => Math.abs(s.top - three[0].top) > 8),
  'side items sit on a row below the featured prize');

const merged = vm.runInContext('consolidateBoxOutcomes', ctx)([
  { kind: 'stone', category: 'relic', amount: 1, rarity: 'common', result: { kind: 'stone', tmpl: { name: 'Common Relic Enchantment Stone', maxStar: 2 } } },
  { kind: 'stone', category: 'relic', amount: 1, rarity: 'rare', result: { kind: 'stone', tmpl: { name: 'Rare Relic Enchantment Stone', maxStar: 4 } } },
  { kind: 'shards', category: 'relic', amount: 20 },
  { kind: 'shards', category: 'relic', amount: 24 }
]);
const stone = merged.find(o => o.kind === 'stone');
const shards = merged.find(o => o.kind === 'shards');
assert(stone && stone.amount === 2, 'rarity stones collapse into one stack');
assert(stone.result.tmpl.name === 'Relic Enchantment Stones ×2', 'stone name is the universal type, got ' + (stone.result && stone.result.tmpl && stone.result.tmpl.name));
assert(!stone.rarity && !(stone.result.tmpl && stone.result.tmpl.maxStar), 'consolidated stones have no rarity tier');
assert(shards && shards.amount === 44 && shards.result.tmpl.name.indexOf('×44') >= 0, 'shards still stack into one labeled pile');

assert(!html.includes('STONE_RARITY_DEFS'), 'stone rarity table is gone');
assert(!html.includes('Common Relic Enchantment Stone') && !html.includes('${picked.label}'),
  'box drops no longer name Common/Uncommon/Rare stones');
const openFn = sliceFn('openBoxFree', 'openBox');
assert(openFn.includes('${catName} Enchantment Stone'), 'box stones use the universal name');
assert(!openFn.includes('picked.rarity'), 'box stones do not roll a rarity tier');

const chipFn = sliceFn('boxBatchChipHtml', 'fillBoxRevealBatch');
assert(!chipFn.includes('box-batch-count'), 'corner xN badge is not rendered on reward chips');
assert(chipFn.includes('box-batch-name'), 'quantity lives on the bottom name label');
assert(!html.includes('.box-batch-count'), 'clipped corner-badge CSS is gone');

const ensureFn = sliceFn('ensureMobilityQuests', 'isMobilitySlotUnlocked');
assert(!ensureFn.includes('getTodayDayType() === null'), 'mobility quests generate on rest days');
const renderFn = sliceFn('renderMobilitySection', 'renderMorningStretchSection');
assert(!renderFn.includes('getTodayDayType() === null'), 'mobility section still renders on rest days');

vm.runInContext(sliceFn('flattenMatStack', 'ensureInventoryShape'), ctx);
assert(vm.runInContext('flattenMatStack({ common: 3, rare: 5 })', ctx) === 8,
  'legacy rarity-keyed piles merge into one count');
assert(vm.runInContext('flattenMatStack(12)', ctx) === 12, 'plain counts stay numbers');

assert(html.includes('3.4.26'), 'About version bumped');
console.log('v7.1 tests ok — no corner badge, horizontal cluster, universal mats, rest-day mobility');
