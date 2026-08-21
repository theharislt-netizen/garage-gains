#!/usr/bin/env node
/**
 * v6.7: enchant item slot stays after Continue; Shop Buy 1 / Buy 10 with a
 * multi-item reveal (best star centered); Destroy quantity selector; salvage
 * scales by star-cap and enchant level.
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
vm.runInContext(sliceLib('item-catalog-lib'), ctx);

const { layoutBatchPrizes } = ctx;

assert(typeof layoutBatchPrizes === 'function', 'batch prize layout helper exists');
const one = layoutBatchPrizes(1);
assert(one.length === 1 && one[0].role === 'center', 'a single result is the featured center');
const ten = layoutBatchPrizes(10);
assert(ten.length === 10, '10-open layout has 10 slots');
assert(ten.filter(s => s.role === 'center').length === 1, 'exactly one featured center');
assert(ten.filter(s => s.role === 'sat').length === 9, 'the other nine orbit the featured item');
const center = ten.find(s => s.role === 'center');
assert(center.left === 50, 'featured item is horizontally centered');
const sats = ten.filter(s => s.role === 'sat');
assert(sats.every(s => Math.abs(s.left - 50) > 4 || Math.abs(s.top - center.top) > 4),
  'orbiting prizes are not stacked on the featured item');
const three = layoutBatchPrizes(3);
assert(three.length === 3 && three[0].role === 'center', 'layout works for any batch size, not just 10');

vm.runInContext(`
const SALVAGE_BASE_SHARDS = 8;
function isUniqueItem(tmpl) { return !!(tmpl && tmpl.unique); }
` + sliceFn('salvageStarTier', 'convertOwnedDuplicate'), ctx);

const junk = ctx.salvagePayoutForItem({ unique: false }, { star: 0, starCap: 0 });
const cap4 = ctx.salvagePayoutForItem({ unique: false }, { star: 0, starCap: 4 });
const cap4Enchanted = ctx.salvagePayoutForItem({ unique: false }, { star: 4, starCap: 4 });
const unique5 = ctx.salvagePayoutForItem({ unique: true }, { star: 0, starCap: 5 });
const unique5Filled = ctx.salvagePayoutForItem({ unique: true }, { star: 5, starCap: 5 });
assert(junk === 8, '0-star junk still pays the original 8-shard floor, got ' + junk);
assert(cap4 >= junk * 8, 'an unenchanted 4-star-cap item pays far more than junk, got ' + cap4 + ' vs ' + junk);
assert(cap4Enchanted > cap4, 'enchanted filled stars add salvage on top of the star-cap tier');
assert(unique5 > cap4, 'a unique 5-star item outpays a regular 4-cap');
assert(unique5Filled > unique5, 'a fully enchanted unique is worth more than the same unique unenchanted');
assert(ctx.salvagePayoutForStar(0) === 8, 'legacy star helper still returns 8 at 0');
assert(ctx.salvagePayoutForStar(5) > ctx.salvagePayoutForStar(0) * 10,
  'legacy 0 vs 5 star gap is large, not +4 shards per star');

const resultsFn = sliceFn('showEnchantResults', 'enchantCoachText');
assert(!resultsFn.includes('table.instanceId = null'), 'Continue leaves the item on the Enchanting Table');
assert(!resultsFn.includes('stonePlaced = false'), 'Continue still does not kick a loaded stone');

const shopFn = sliceFn('renderShopModal', 'coverShopForBoxReveal');
assert(shopFn.includes('Buy 1') && shopFn.includes('Buy 10'), 'Shop offers Buy 1 and Buy 10');
assert(shopFn.includes('data-box-qty="10"'), 'Buy 10 is wired on chests');
assert(shopFn.includes('data-buy-qty="10"'), 'Buy 10 is wired on supplies');
assert(shopFn.includes('handleOpenBox(\'boost\', 1)'), 'Buy 1 still opens a box immediately');

const openFn = sliceFn('handleOpenBox', 'dismissBoxReveal');
assert(openFn.includes('openBoxFree(category)'), 'shop purchases still open immediately');
assert(openFn.includes('qty <= 1') && openFn.includes('showBoxReveal(category, outcome)'),
  'Buy 1 uses the single-item reveal');
assert(openFn.includes('showBoxReveal(category, outcomes)'), 'Buy 10 passes the full outcome set');
assert(openFn.includes('shopBoxGoldCost(qty)'), 'gold is charged with the bulk discount for 10');
assert(!openFn.includes('grantSealedBox'), 'shop purchases are not stashed sealed');

const showFn = sliceFn('showBoxReveal', 'youtubeDeepLink');
assert(showFn.includes('fillBoxRevealBatch'), 'multi-item opens use the batch prize layer');
assert(showFn.includes('box-batch-on'), 'batch reveal toggles the multi-item overlay class');
assert(html.includes('id="boxBatchPrize"'), 'batch prize mount exists');
assert(html.includes('box-batch-center'), 'featured prize has a center class');
const scoreFn = sliceFn('boxOutcomeStarScore', 'boxBatchChipHtml');
assert(scoreFn.includes('unique ? 1000'), 'unique / 5-star outcomes rank above lower caps');
const fillBatch = sliceFn('fillBoxRevealBatch', 'showBoxReveal');
assert(fillBatch.includes('layoutBatchPrizes'), 'batch fill uses the reusable layout helper');
assert(fillBatch.includes('b.score - a.score'), 'highest-star item is placed first (center)');

const destroyFn = sliceFn('openDestroyConfirm', 'closeDestroyConfirm');
assert(destroyFn.includes('destroyQtySlider'), 'Destroy confirm has a quantity slider');
assert(destroyFn.includes('destroyQtyMinus') && destroyFn.includes('destroyQtyPlus'),
  'Destroy confirm has plus/minus steppers');
assert(destroyFn.includes('destroyTempCharge(itemId, qty)'), 'confirming Destroy consumes the chosen count');
assert(destroyFn.includes('max="${have}"'), 'quantity max is the full stack');
const destroyCharge = sliceFn('destroyTempCharge', 'salvageItem');
assert(destroyCharge.includes('Math.min(have'), 'Destroy clamps to the owned stack');

const salvageItemFn = sliceFn('salvageItem', 'returnEquippedEntryToInventory');
assert(salvageItemFn.includes('salvagePayoutForItem(tmpl, inst)'), 'salvaging uses cap + enchant, not filled-star only');
const salvageConfirm = sliceFn('openSalvageConfirm', 'closeSalvageConfirm');
assert(salvageConfirm.includes('salvagePayoutForItem(tmpl, inst)'), 'salvage confirm shows the rescaled payout');

assert(html.includes('3.4.25'), 'About version bumped for v6.7');

console.log('v6.7 tests ok — persistent enchant item, Buy 1/10 batch reveal, destroy qty, salvage rebalance');
