#!/usr/bin/env node
/**
 * v6.6: Salvage dismisses the item popup first; stars render from one helper
 * everywhere including the box-open prize; the enchant stone slot stays loaded
 * while stones remain; Destroy matches Salvage styling with an in-app confirm.
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
vm.runInContext(sliceLib('item-catalog-lib'), ctx);

const {
  itemStarsHtml,
  itemStarSource,
  itemVisualHtml,
  itemTemplate,
} = ctx;

assert(typeof itemStarsHtml === 'function', 'shared star helper exists');
assert(typeof itemVisualHtml === 'function', 'shared item visual helper exists');

const ember = itemTemplate('emberHalo');
const threeStar = itemStarsHtml(ember, { star: 0, starCap: 3 });
assert((threeStar.match(/star-off/g) || []).length === 3, 'star helper paints spawn headroom');
assert(itemVisualHtml(ember, { star: 2, starCap: 3 }).includes('star-row'), 'item visual always includes stars');
assert(itemVisualHtml(ember, { star: 2, starCap: 3 }).includes('item-photo'), 'item visual still shows the icon');
assert(itemStarsHtml({ name: 'Temp', permanent: false }, { star: 3 }) === '', 'temps have no star row');
const fromResult = itemStarSource(ember, { kind: 'new', tmpl: ember, star: 0, starCap: 4, inst: { star: 0, starCap: 4 } });
assert(fromResult.starCap === 4 && fromResult.star === 0, 'box outcomes resolve nested inst stars');

const salvageClick = html.slice(html.indexOf('id="itemDetailSalvageBtn"'), html.indexOf("} else if (target.kind === 'mat')"));
assert(salvageClick.includes('closeItemDetailModal()'), 'Salvage tap closes the item popup');
assert(salvageClick.indexOf('closeItemDetailModal()') < salvageClick.indexOf('openSalvageConfirm'),
  'item popup closes before the salvage confirm opens');
const salvageFn = sliceFn('openSalvageConfirm', 'closeSalvageConfirm');
assert(salvageFn.includes('closeItemDetailModal()'), 'openSalvageConfirm also dismisses leftover popup chrome');
assert(html.includes('#salvageConfirmModal, #destroyConfirmModal { z-index: 260; }'),
  'confirm sheets sit above the item-detail tooltip');

const prizeFn = sliceFn('fillBoxRevealPrize', 'revealFilledBoxPrize');
assert(prizeFn.includes('itemStarsHtml'), 'box-open prize uses the shared star helper');
assert(!prizeFn.includes('starRowHtml(tmpl, inst && inst.star'), 'prize fill is not an ad-hoc starRowHtml path');
assert(html.includes('id="boxPrizeStars"'), 'prize card has a star mount');
assert(html.includes('#boxPrizeStars .star-row') && html.includes('font-size: 20px'),
  'prize-card stars are large enough to read');

const invFn = sliceFn('renderInventoryTab', 'positionItemDetailPopup');
assert(invFn.includes('itemVisualHtml(tmpl, inst'), 'Inventory grid uses the shared item visual');
const loadoutFn = sliceFn('loadoutFrameHtml', 'renderEquippedSummary');
assert(loadoutFn.includes('itemStarsHtml'), 'Loadout frames use the shared star helper');
const detailFn = sliceFn('renderItemDetailModal', 'openInventoryBox');
assert(detailFn.includes('itemStarsHtml(tmpl, inst)'), 'item detail popup uses the shared star helper');
const enchantRender = sliceFn('renderEnchantModal', 'renderShopModal');
assert(enchantRender.includes('itemStarsHtml(tmpl, inst)'), 'enchant item slot shows stars');
assert(enchantRender.includes('itemVisualHtml(t, p'), 'enchant picker uses the shared item visual');
const resultsFn = sliceFn('showEnchantResults', 'enchantCoachText');
assert(resultsFn.includes('itemVisualHtml'), 'enchant results show stars with the item');

const attemptFn = sliceFn('enchantAttemptFromSlot', 'playEnchantAnimation');
assert(attemptFn.includes('reloadEnchantStoneSlot()'), 'enchant reloads the stone slot after an attempt');
assert(!attemptFn.includes('table.stonePlaced = false'), 'enchant no longer always clears the stone slot');
const reloadFn = sliceFn('reloadEnchantStoneSlot', 'enchantTableReady');
assert(reloadFn.includes('have > 0'), 'stone stays loaded while inventory still has that type');
assert(reloadFn.includes('table.stonePlaced = true'), 'remaining stones keep stonePlaced true');
assert(reloadFn.includes('table.stonePlaced = false'), 'stone slot clears only at zero remaining');
assert(resultsFn.includes('table.instanceId = null'), 'item slot still resets after Continue');
assert(!resultsFn.includes('stonePlaced = false'), 'Continue does not kick a still-loaded stone');
const placeItemFn = sliceFn('placeEnchantItem', 'selectEnchantItem');
assert(placeItemFn.includes('tmpl.category !== table.category'),
  'picking another item of the same type keeps the loaded stone');

assert(html.includes('id="destroyConfirmModal"') && html.includes('id="destroyConfirmBody"'),
  'Destroy uses an in-app confirm modal');
assert(html.includes("function openDestroyConfirm("), 'Destroy has a dedicated in-app opener');
assert(!html.includes('confirm(`Destroy 1'), 'Destroy no longer uses a native system dialog');
const destroyBtn = html.slice(html.indexOf('id="itemDetailDestroyBtn"') - 80, html.indexOf('id="itemDetailDestroyBtn"') + 40);
assert(destroyBtn.includes('inv-btn-salvage'), 'Destroy button matches Salvage danger styling');
const destroyFn = sliceFn('openDestroyConfirm', 'closeDestroyConfirm');
assert(destroyFn.includes('inv-btn-salvage'), 'Destroy confirm action is the red Salvage style');
assert(destroyFn.includes('closeItemDetailModal()'), 'Destroy confirm dismisses the item popup first');
assert(destroyFn.includes('destroyTempCharge(itemId)'), 'confirming Destroy still consumes one charge');
assert(html.includes("getElementById('destroyConfirmClose')"), 'Destroy confirm close is wired');

assert(html.includes('3.4.21'), 'About version bumped for v6.6');

console.log('v6.6 tests ok — salvage popup close, shared stars, persistent stone slot, in-app Destroy');
