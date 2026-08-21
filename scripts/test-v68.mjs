#!/usr/bin/env node
/**
 * v6.8: Relic equip no longer drops off the loadout; bulk rewards stack;
 * stars on prize + inventory tiles; unique flash plays on 10x opens;
 * Buy 10 is discounted.
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
vm.runInContext(sliceLib('v49-helpers-lib'), ctx);
vm.runInContext(sliceLib('box-reveal-lib'), ctx);
vm.runInContext(sliceLib('equipment-sets-lib'), ctx);

const SHOP_BOX_PRICE = vm.runInContext('SHOP_BOX_PRICE', ctx);
const SHOP_BOX_BULK_PRICE = vm.runInContext('SHOP_BOX_BULK_PRICE', ctx);
const shopBoxGoldCost = vm.runInContext('shopBoxGoldCost', ctx);
const consolidateBoxOutcomes = vm.runInContext('consolidateBoxOutcomes', ctx);
const migrateEquippedToSlots = vm.runInContext('migrateEquippedToSlots', ctx);

assert(SHOP_BOX_PRICE === 80, 'single box still costs 80g');
assert(SHOP_BOX_BULK_PRICE === 700, 'Buy 10 is 700g, not 800');
assert(shopBoxGoldCost(1) === 80, 'Buy 1 is the unit price');
assert(shopBoxGoldCost(10) === 700, 'Buy 10 uses the bulk discount');
assert(shopBoxGoldCost(10) < SHOP_BOX_PRICE * 10, 'bulk is cheaper than 10x');

const stacked = consolidateBoxOutcomes([
  { kind: 'shards', category: 'boost', amount: 4 },
  { kind: 'shards', category: 'boost', amount: 3 },
  { kind: 'shards', category: 'relic', amount: 5 },
  { kind: 'item', result: { kind: 'temp', tmpl: { id: 'doubleDown', name: 'Double Down' } } },
  { kind: 'item', result: { kind: 'temp', tmpl: { id: 'doubleDown', name: 'Double Down' } } },
  { kind: 'item', result: { kind: 'new', tmpl: { id: 'emberHalo', name: 'Ember Halo', unique: false }, inst: { star: 0, starCap: 3 } } }
]);
assert(stacked.length === 4, '7 pulls collapse to 4 entries, got ' + stacked.length);
const boostShards = stacked.find(o => o.kind === 'shards' && o.category === 'boost');
assert(boostShards && boostShards.amount === 7, 'boost shards merge to x7');
assert(boostShards.result.tmpl.name.indexOf('×7') >= 0, 'merged shard name shows quantity');
const dd = stacked.find(o => o.stackCount === 2);
assert(dd && dd.result.tmpl.name.indexOf('×2') >= 0, 'temp boosts stack into one chip');
assert(stacked.filter(o => o.kind === 'item' && o.result && o.result.kind === 'new').length === 1,
  'unique permanents stay separate');

const migrate = migrateEquippedToSlots;
const kept = migrate(
  { slots: { cloak: { kind: 'permanent', instanceId: 'anvil' }, amulet: { kind: 'permanent', instanceId: 'charm' } } },
  () => 'ring'
);
assert(kept.slots.cloak.instanceId === 'anvil' && kept.slots.amulet.instanceId === 'charm',
  'already-valid relic slots are not reshuffled on every inventory render');
assert(!kept.slots.ring, 'stable loadouts do not get rewritten onto a different slot');

const shapeFn = sliceFn('ensureInventoryShape', 'grantItem');
assert(shapeFn.includes('seenIds'), 'duplicate instance ids are split so a second relic cannot vanish');
assert(shapeFn.includes("eq.kind === 'permanent'"), 'equipped relics are kept while their inventory row still exists');
assert(!shapeFn.includes('if (!getEquippedEffectForSlot(id)) delete slots[id]'),
  'loadout slots are not wiped just because the effect helper missed a frame');

const invFn = sliceFn('renderInventoryTab', 'positionItemDetailPopup');
assert(invFn.includes('itemVisualHtml(tmpl, inst'), 'inventory grid still uses the shared starred visual');
assert(html.includes('.inv-slot-icon { font-size: 26px; line-height: 1; width: 100%; height: 100%'),
  'inventory thumbnails fill the tile so the star shelf is visible');

const prizeFn = sliceFn('fillBoxRevealPrize', 'revealFilledBoxPrize');
assert(prizeFn.includes('itemStarsHtml(tmpl, inst)'), 'single-box prize paints stars from the rolled instance');
const batchFn = sliceFn('fillBoxRevealBatch', 'showBoxReveal');
assert(batchFn.includes('consolidateBoxOutcomes'), 'bulk reveal stacks duplicate materials first');
assert(batchFn.includes('__boxUniqueCount'), 'bulk reveal counts every unique/5-star pull');
const chipFn = sliceFn('boxBatchChipHtml', 'fillBoxRevealBatch');
assert(chipFn.includes('itemStarsHtml'), 'batch chips show stars');
assert(chipFn.includes('box-batch-count'), 'stacked materials show an xN badge');

assert(html.includes('#boxRevealOverlay.box-prize-on.box-batch-on #boxPrizeCard'),
  'bulk opens hide the single card, not the unique flash layer');
assert(!html.includes('#boxRevealOverlay.box-prize-on.box-batch-on #boxRevealPrize {\n    opacity: 0'),
  'unique flash is not opacity-0 during Buy 10');
const revealFn = sliceFn('revealFilledBoxPrize', 'boxOutcomeStarScore');
assert(revealFn.includes('uniqueCount > 0'), 'unique animation fires when any 5-star is in the batch');
assert(revealFn.includes('__boxUniqueReplay'), 'each extra 5-star retriggers the unique flash');

const shopFn = sliceFn('renderShopModal', 'coverShopForBoxReveal');
assert(shopFn.includes('shopBoxGoldCost(10)'), 'shop Buy 10 uses the discounted total');
assert(shopFn.includes('700g') || shopFn.includes('${bulk}g'), 'Buy 10 shows the discounted gold');

assert(html.includes('3.4.23'), 'About version bumped for v6.8');

console.log('v6.8 tests ok — relic equip keep, stacked rewards, stars, unique 10x flash, Buy 10 = 700g');
