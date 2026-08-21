#!/usr/bin/env node
/**
 * v6.1: Relic/Boost equipped counts use the real Loadout slot totals (3/3),
 * and leftover unequippable slot types (Boots and other retired body slots)
 * cannot linger in the catalog, drop tables, or saved inventory.
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
const loadoutSlotCount = vm.runInContext('loadoutSlotCount', ctx);
const loadoutSlotsOfKind = vm.runInContext('loadoutSlotsOfKind', ctx);
const canonicalItemSlotId = vm.runInContext('canonicalItemSlotId', ctx);
const isEquippableItemSlot = vm.runInContext('isEquippableItemSlot', ctx);
const gearSetPieceCount = vm.runInContext('gearSetPieceCount', ctx);
const retireOrphanGearItems = vm.runInContext('retireOrphanGearItems', ctx);
const setBonusBreakdownForTemplate = vm.runInContext('setBonusBreakdownForTemplate', ctx);
const itemTemplate = vm.runInContext('itemTemplate', ctx);

assert(RELIC_SLOT_IDS.length === 3 && loadoutSlotCount('relic') === RELIC_SLOT_IDS.length,
  'relic equipped-count denominator comes from the Loadout slot list');
assert(BOOST_SLOT_IDS.length === 3 && loadoutSlotCount('boost') === BOOST_SLOT_IDS.length,
  'boost equipped-count denominator comes from the Loadout slot list');
assert(loadoutSlotsOfKind('relic').map(s => s.id).join(',') === 'amulet,ring,cloak',
  'relic Loadout slots are Amulet, Ring, Cloak');
assert(loadoutSlotsOfKind('boost').map(s => s.id).join(',') === 'boost1,boost2,boost3',
  'boost Loadout slots are Boost I–III');
assert(!GEAR_SLOTS.some(s => s.id === 'boots' || s.id === 'head' || s.id === 'chest' || s.id === 'legs' || s.id === 'gloves'),
  'retired body slots are not Loadout slots');

const capacityFn = sliceFn('getEquipSlotCapacity', 'loadoutFilledCount');
assert(capacityFn.includes('return loadoutSlotCount(category)'),
  'equip capacity is the live Loadout slot count, not a hardcoded 4');
assert(html.includes("getEquipSlotCapacity('relic')") === false, 'capacity helper is not independently hardcoded at call sites');

const loadoutFn = sliceFn('renderEquippedSummary', 'renderInventoryTab');
assert(loadoutFn.includes("loadoutSlotCount('relic')") && loadoutFn.includes("loadoutSlotCount('boost')"),
  'Loadout titles pull relic and boost denominators from the slot list');
assert(loadoutFn.includes("loadoutFilledCount('relic')") && loadoutFn.includes("loadoutFilledCount('boost')"),
  'Loadout titles pull filled counts from the same slot list');
assert(loadoutFn.includes('loadoutSlotsOfKind(\'relic\')') && loadoutFn.includes('loadoutSlotsOfKind(\'boost\')'),
  'Loadout frames render from the same slot list as the counts');
assert(loadoutFn.includes('Relics ${relicFilled} / ${relicTotal}'),
  'Relics header shows filled / total');
assert(loadoutFn.includes('Boosts ${boostFilled} / ${boostTotal}'),
  'Boosts header shows filled / total');
assert(!loadoutFn.includes(' / 4'), 'Loadout does not hardcode a 4-slot relic denominator');

const poolFn = sliceFn('eligibleItemPool', 'effectiveItemValue');
assert(poolFn.includes('isEquippableItemSlot(i)'), 'box pools skip unequippable slot types');

const grantFn = sliceFn('grantItem', 'itemRarityWeight');
assert(grantFn.includes('isEquippableItemSlot(tmpl)'), 'granting refuses unequippable leftovers');

const shapeFn = sliceFn('ensureInventoryShape', 'grantItem');
assert(shapeFn.includes('retireOrphanGearItems(state.inventory)'),
  'owned unequippable items convert on load');

assert(canonicalItemSlotId({ category: 'relic', slot: 'boots' }) === 'cloak',
  'legacy Boots items remap onto Cloak');
assert(canonicalItemSlotId({ category: 'relic', slot: 'head' }) === 'amulet',
  'legacy Head items remap onto Amulet');
assert(canonicalItemSlotId({ category: 'relic', slot: 'chest' }) === 'cloak',
  'legacy Chest items remap onto Cloak');
assert(canonicalItemSlotId({ category: 'relic', slot: 'legs' }) === 'ring',
  'legacy Legs items remap onto Ring');
assert(canonicalItemSlotId({ category: 'relic', slot: 'gloves' }) === 'cloak',
  'legacy Gloves items remap onto Cloak');
assert(canonicalItemSlotId({ category: 'boost', slot: 'boost' }) === 'boost',
  'boosts stay on the generic boost slot');
assert(isEquippableItemSlot({ category: 'relic', slot: 'boots' }) === true,
  'remapped Boots leftovers are still equippable');
assert(isEquippableItemSlot({ category: 'relic', slot: 'amulet' }) === true,
  'Amulet relics are equippable');
assert(isEquippableItemSlot({ category: 'relic', slot: 'waist' }) === false,
  'unknown relic slots are not equippable');

ITEMS_CATALOG.forEach(t => {
  assert(isEquippableItemSlot(t), t.id + ' uses a currently-equippable slot');
  assert(t.slot !== 'boots' && t.slot !== 'head' && t.slot !== 'chest' && t.slot !== 'legs' && t.slot !== 'gloves',
    t.id + ' is not typed as a retired body slot');
});
assert(!html.includes("slot:'boots'") && !html.includes('slot:\'boots\''),
  'catalog source has no Boots slot entries');

const ashenCount = gearSetPieceCount('ashenGrinder');
const ashen = setBonusBreakdownForTemplate(itemTemplate('wornCharm'), { ashenGrinder: 1 });
assert(ashen.pieceCount === 3, 'item-detail set count uses 3 Loadout slots');
assert(ashenCount === 3, 'set-piece helper is the slot count, not the 4-piece catalog roster');
assert(ITEMS_CATALOG.filter(t => t.setId === 'ashenGrinder').length === 4,
  'Ashen Grinder still has four catalog pieces — the denominator must ignore that');
const cinder = setBonusBreakdownForTemplate(itemTemplate('cinderAnvil'), { cinderforge: 2 });
assert(cinder.pieceCount === 3 && cinder.equipped === 2, 'Cinderforge detail shows 2/3, not 2/4');

const inv = {
  permanent: [
    { instanceId: 'keep', itemId: 'wornCharm', star: 1 },
    { instanceId: 'ghost', itemId: 'oldBootsOfPower', star: 2 },
  ],
  tempCharges: { vanishedGreaves: 2, featherweightWraps: 1 },
  shards: { relic: 0, boost: 0 },
};
const payout = retireOrphanGearItems(inv);
assert(inv.permanent.length === 1 && inv.permanent[0].itemId === 'wornCharm',
  'valid relics stay in Inventory');
assert(!inv.tempCharges.vanishedGreaves, 'unknown temps leave Inventory');
assert(inv.tempCharges.featherweightWraps === 1, 'valid temps stay');
assert(payout.relicShards === 8 && inv.shards.relic === 8,
  'unknown permanents convert to relic shards (lib fallback is 8 without salvagePayoutForStar)');
assert(payout.boostShards === 16 && inv.shards.boost === 16,
  'two unknown temps convert to boost shards');

assert(html.includes('3.4.26'), 'About version bumped for v6.1');

console.log('v6.1 tests ok — relic/boost counts from Loadout slots, Boots leftovers remapped or salvaged');
