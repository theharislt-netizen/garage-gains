#!/usr/bin/env node
/**
 * v5.8: Loadout is three Relic slots (Amulet, Ring, Cloak) and three Boost
 * slots. Equipped items leave the Inventory list, set bonuses live on item
 * detail (active tiers green), shard prize cards compose correctly, and
 * Enchanting Table placeholders are centered.
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
vm.runInContext(sliceLib('equipment-sets-lib'), ctx);

const ITEMS_CATALOG = vm.runInContext('ITEMS_CATALOG', ctx);
const GEAR_SLOTS = vm.runInContext('GEAR_SLOTS', ctx);
const RELIC_SLOT_IDS = vm.runInContext('RELIC_SLOT_IDS', ctx);
const BOOST_SLOT_IDS = vm.runInContext('BOOST_SLOT_IDS', ctx);
const itemTemplate = vm.runInContext('itemTemplate', ctx);
const migrateEquippedToSlots = vm.runInContext('migrateEquippedToSlots', ctx);
const canonicalLoadoutSlotId = vm.runInContext('canonicalLoadoutSlotId', ctx);
const firstOpenBoostSlot = vm.runInContext('firstOpenBoostSlot', ctx);
const setBonusBreakdownForTemplate = vm.runInContext('setBonusBreakdownForTemplate', ctx);
const equippedSetCountsFromTemplates = vm.runInContext('equippedSetCountsFromTemplates', ctx);
const isRelicSlotId = vm.runInContext('isRelicSlotId', ctx);
const isBoostSlotId = vm.runInContext('isBoostSlotId', ctx);

assert(RELIC_SLOT_IDS.join(',') === 'amulet,ring,cloak', 'relic slots are Amulet, Ring, Cloak');
assert(BOOST_SLOT_IDS.join(',') === 'boost1,boost2,boost3', 'three generic boost slots');
assert(GEAR_SLOTS.length === 6, 'loadout is locked to six slots');
assert(!GEAR_SLOTS.some(s => s.id === 'boots'), 'Boots is not a loadout slot');
assert(GEAR_SLOTS.filter(s => s.kind === 'relic').length === 3, 'three relic slots');
assert(GEAR_SLOTS.filter(s => s.kind === 'boost').length === 3, 'three boost slots');

ITEMS_CATALOG.filter(t => t.category === 'relic').forEach(t => {
  assert(isRelicSlotId(t.slot), t.id + ' relic maps to Amulet/Ring/Cloak');
});
ITEMS_CATALOG.filter(t => t.category === 'boost').forEach(t => {
  assert(t.slot === 'boost', t.id + ' boost uses the generic boost slot');
});

assert(canonicalLoadoutSlotId('head', {}) === null, 'old Head slot is dropped');
assert(canonicalLoadoutSlotId('boots', {}) === null, 'old Boots slot is dropped');
assert(canonicalLoadoutSlotId('amulet', {}) === 'amulet', 'Amulet is a relic slot');
assert(canonicalLoadoutSlotId('boost', {}) === 'boost1', 'first boost lands in Boost I');
assert(firstOpenBoostSlot({ boost1: { kind: 'permanent' } }) === 'boost2', 'second boost uses the next empty slot');

const remapped = migrateEquippedToSlots(
  { slots: { head: { kind: 'permanent', instanceId: 'charm' }, boots: { kind: 'permanent', instanceId: 'iron' }, amulet: { kind: 'permanent', instanceId: 'sigil' } } },
  eq => {
    if (eq.instanceId === 'charm') return 'amulet';
    if (eq.instanceId === 'iron') return 'cloak';
    return 'boost';
  }
);
assert(remapped.slots.amulet.instanceId === 'charm', 'old Head relic remaps to Amulet');
assert(remapped.slots.cloak.instanceId === 'iron', 'old Boots relic remaps to Cloak');
assert(remapped.slots.boost1.instanceId === 'sigil', 'old accessory remaps onto a Boost slot');
assert(!remapped.slots.head && !remapped.slots.boots, 'legacy body keys are gone');

const ashen = [
  itemTemplate('wornCharm'),
  itemTemplate('grindersChair'),
  itemTemplate('ironFocus'),
];
const counts = equippedSetCountsFromTemplates(ashen);
const breakdown = setBonusBreakdownForTemplate(itemTemplate('wornCharm'), counts);
assert(breakdown && breakdown.setName === 'Ashen Grinder', 'item detail can load the set');
assert(breakdown.equipped === 3 && breakdown.bonuses[0].active === true, '2-piece tier is active with 3 equipped');
assert(breakdown.bonuses[1].active === false, '4-piece tier stays inactive until the set is complete');
const locked = setBonusBreakdownForTemplate(itemTemplate('wornCharm'), { ashenGrinder: 1 });
assert(locked.bonuses.every(b => b.active === false), 'unmet tiers stay inactive');

const invFn = sliceFn('renderInventoryTab', 'positionItemDetailPopup');
assert(invFn.includes('return !findEquippedSlot'), 'equipped permanents are hidden from Inventory');

const equipFn = sliceFn('equipItem', 'unequipItem');
assert(equipFn.includes('pickLoadoutSlotId'), 'equip places into the loadout slot');
assert(equipFn.includes('returnEquippedEntryToInventory'), 'replacing a temp returns it to Inventory');

const unequipFn = sliceFn('unequipItem', 'findEquippedSlot');
assert(unequipFn.includes('returnEquippedEntryToInventory'), 'unequip returns temps to Inventory');

const loadoutFn = sliceFn('renderEquippedSummary', 'renderInventoryTab');
assert(loadoutFn.includes('loadout-sheet') && loadoutFn.includes('loadout-relics') && loadoutFn.includes('loadout-boosts'),
  'loadout is two distinct Relic / Boost columns');
assert(loadoutFn.includes('openItemDetailModal'), 'tapping a filled loadout slot opens item info');
assert(!loadoutFn.includes('Set bonuses'), 'set bonus tracker is not rendered on Loadout');

const detailFn = sliceFn('renderItemDetailModal', 'openShopModal');
assert(detailFn.includes('itemSetBonusHtml(tmpl)'), 'item detail shows the set bonus breakdown');
assert(detailFn.includes("'Unequip'"), 'equipped items can be unequipped from the detail view');

assert(html.includes('loadout-frame-ring'), 'loadout uses framed slot art');
assert(html.includes("filled ? 'filled' : 'empty'"), 'empty slots have an intentional empty frame');
assert(html.includes('#boxPrizeIcon.is-mat'), 'shard prize cards hide the photo frame');
assert(html.includes('item-photo[hidden]'), 'hidden prize photos cannot leak as broken images');
assert(html.includes("iconWrap.classList.add('is-mat')"), 'mat rewards switch the prize icon to SVG mode');

const enchantCssAt = html.indexOf('.enchant-drop-ic {');
assert(enchantCssAt >= 0, 'enchant slot icon is a shared rule');
const enchantRule = html.slice(enchantCssAt, html.indexOf('}', enchantCssAt) + 1);
assert(enchantRule.includes('display: flex') && enchantRule.includes('align-items: center') && enchantRule.includes('justify-content: center'),
  'ITEM and STONE placeholders share a centered icon box');

assert(html.includes('3.4.15'), 'About version bumped for v5.8');

console.log('v5.8 tests ok — 3+3 loadout, inventory move, set bonuses on items, shard card, enchant centering');
