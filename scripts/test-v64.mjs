#!/usr/bin/env node
/**
 * v6.4: earned boxes land sealed in Inventory; Open uses the primary
 * Equip-button style; shop Buy still opens immediately after paying.
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

function sliceFn(name, nextName) {
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf(`function ${nextName}(`);
  assert(start >= 0 && end > start, name + ' function missing');
  return html.slice(start, end);
}

function sliceLib(name) {
  const begin = html.indexOf(`/* === ${name} begin === */`);
  const end = html.indexOf(`/* === ${name} end === */`);
  assert(begin >= 0 && end > begin, name + ' markers missing');
  return html.slice(begin, end);
}

const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(sliceLib('first-run-unlock-lib'), ctx);

const {
  grantSealedBox,
  sealedBoxRewardLine,
  boxTemplate,
  boxMatchesInvFilter,
} = ctx;

const bag = { inventory: { permanent: [], tempCharges: {}, shards: { boost: 0, relic: 0 }, stones: { boost: 0, relic: 0 }, boxes: [] } };
const boost = grantSealedBox(bag, 'boost');
const relic = grantSealedBox(bag, 'relic');
assert(boost && boost.itemId === 'shopBoostBox', 'boost rewards grant a sealed Boost Box');
assert(relic && relic.itemId === 'shopRelicBox', 'relic rewards grant a sealed Relic Box');
assert(bag.inventory.boxes.length === 2, 'both boxes sit in Inventory unopened');
assert(bag.inventory.boxes.every(b => b.opened === false), 'reward boxes are sealed');
assert(bag.inventory.permanent.length === 0, 'granting a box must not roll its inner item yet');
assert((bag.inventory.shards.boost || 0) === 0 && (bag.inventory.shards.relic || 0) === 0, 'granting a box must not dump shards');
assert((bag.inventory.stones.boost || 0) === 0 && (bag.inventory.stones.relic || 0) === 0, 'granting a box must not dump stones');
assert(boost.instanceId !== relic.instanceId, 'each sealed box has its own instance id');

const line = sealedBoxRewardLine({ inventory: { boxes: [] } }, 'boost');
assert(line.label === 'Boost Box', 'reward copy names the box, not the inner loot');
assert(line.value === 'x1', 'reward copy states the quantity received');

assert(boxTemplate('shopBoostBox').category === 'boost', 'boost box template is categorized');
assert(boxTemplate('shopRelicBox').category === 'relic', 'relic box template is categorized');
assert(boxTemplate('starterVictoryBox').id === 'starterVictoryBox', 'starter ids still resolve to the victory box');
assert(boxMatchesInvFilter({ itemId: 'shopBoostBox', opened: false }, 'boost') === true, 'boost filter shows boost boxes');
assert(boxMatchesInvFilter({ itemId: 'shopBoostBox', opened: false }, 'relic') === false, 'relic filter hides boost boxes');
assert(boxMatchesInvFilter({ itemId: 'starterVictoryBox', opened: false }, 'relic') === true, 'starter box still appears on Relic');
assert(boxMatchesInvFilter({ itemId: 'shopRelicBox', opened: true }, 'all') === false, 'opened boxes are not listed');

function assertNoAutoOpen(fnSrc, name) {
  assert(!fnSrc.includes('openBoxFree'), name + ' must not auto-open a box');
  assert(fnSrc.includes('sealedBoxRewardLine'), name + ' stashes a sealed box and tells the player');
}

assertNoAutoOpen(sliceFn('defeatBoss', 'bossLootPreviewLines'), 'defeatBoss');
const defeatFn = sliceFn('defeatBoss', 'bossLootPreviewLines');
assert(defeatFn.indexOf('sealedBoxRewardLine') < defeatFn.indexOf('save()'),
  'boss boxes are written into Inventory before save');
assertNoAutoOpen(sliceFn('grantSeasonEndReward', 'daysBetweenDates'), 'grantSeasonEndReward');
assertNoAutoOpen(sliceFn('claimDailyLogin', 'skillXpForLevel'), 'claimDailyLogin');
assertNoAutoOpen(sliceFn('checkLevelUp', 'getStreakTier'), 'checkLevelUp');

const handleOpen = sliceFn('handleOpenBox', 'dismissBoxReveal');
assert(handleOpen.includes('openBoxFree'), 'shop Buy still opens the paid box immediately');
assert(!handleOpen.includes('grantSealedBox'), 'shop purchases are not stashed sealed');

const invOpen = sliceFn('openInventoryBox', 'openShopModal');
assert(invOpen.includes('openBoxFree'), 'Inventory Open rolls the sealed box with no gold charge');
assert(invOpen.includes('showBoxReveal(category, outcome)'), 'Inventory Open uses the same reveal as the shop');
assert(invOpen.includes('openStarterVictoryBox'), 'starter box still uses its tutorial open path');
assert(!invOpen.includes('state.gold'), 'Inventory Open must not charge gold');

const boxBtn = html.slice(html.indexOf('id="itemDetailOpenBoxBtn"') - 80, html.indexOf('id="itemDetailOpenBoxBtn"') + 40);
assert(boxBtn.includes('inv-btn-equip'), 'Open Box uses the primary Equip button style');
assert(html.includes('Open Box'), 'Open Box label is still present');

const activateBtn = html.slice(html.indexOf('id="itemDetailActivateBtn"') - 90, html.indexOf('id="itemDetailActivateBtn"') + 40);
assert(activateBtn.includes('inv-btn-equip'), 'Activate was a missed primary and now matches Equip');

const destroyBtn = html.slice(html.indexOf('id="itemDetailDestroyBtn"') - 50, html.indexOf('id="itemDetailDestroyBtn"') + 40);
assert(!destroyBtn.includes('inv-btn-equip'), 'Destroy stays a secondary action');
assert(html.includes('class="inv-btn" id="salvageConfirmCancel"'), 'Cancel stays a secondary bordered button');

assert(html.includes('3.4.20'), 'About version bumped for v6.4');

console.log('v6.4 tests ok — earned boxes stay sealed, shop still opens on Buy, Open/Activate match Equip');
