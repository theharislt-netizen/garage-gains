#!/usr/bin/env node
/**
 * v5.2: box-open lag root cause (committed paint + idle persist),
 * RPG equipment slots/sets/set bonuses, and gear-slot icons.
 * Material shard/stone icons stay the v5.0 silhouettes.
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
function closeTo(a, b) {
  return Math.abs(a - b) < 1e-9;
}

function sliceLib(name) {
  const begin = html.indexOf(`/* === ${name} begin === */`);
  const end = html.indexOf(`/* === ${name} end === */`);
  assert(begin >= 0 && end > begin, name + ' markers missing');
  return html.slice(begin, end);
}

const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(sliceLib('box-reveal-lib'), ctx);
vm.runInContext(sliceLib('item-catalog-lib'), ctx);
vm.runInContext(sliceLib('equipment-sets-lib'), ctx);

const afterPaint = vm.runInContext('afterPaint', ctx);
const scheduleIdleWork = vm.runInContext('scheduleIdleWork', ctx);
const coverBoxRevealOverlay = vm.runInContext('coverBoxRevealOverlay', ctx);
const hideBoxRevealOverlay = vm.runInContext('hideBoxRevealOverlay', ctx);
const itemIconSvg = vm.runInContext('itemIconSvg', ctx);
const matIconSvg = vm.runInContext('matIconSvg', ctx);
const ITEMS_CATALOG = vm.runInContext('ITEMS_CATALOG', ctx);
const GEAR_SLOTS = vm.runInContext('GEAR_SLOTS', ctx);
const GEAR_SETS = vm.runInContext('GEAR_SETS', ctx);
const isGearSlotUnlockedAtLevel = vm.runInContext('isGearSlotUnlockedAtLevel', ctx);
const migrateEquippedToSlots = vm.runInContext('migrateEquippedToSlots', ctx);
const equippedSetCountsFromTemplates = vm.runInContext('equippedSetCountsFromTemplates', ctx);
const setBonusValueForEffect = vm.runInContext('setBonusValueForEffect', ctx);
const itemTemplate = vm.runInContext('itemTemplate', ctx);

assert(typeof afterPaint === 'function', 'afterPaint lives with the overlay helpers');
assert(typeof scheduleIdleWork === 'function', 'idle persist helper exists');
const afterPaintSrc = sliceLib('box-reveal-lib');
assert((afterPaintSrc.match(/requestAnimationFrame/g) || []).length >= 2,
  'afterPaint waits for a committed frame, not one rAF');
assert(afterPaintSrc.includes('requestIdleCallback') || afterPaintSrc.includes('scheduleIdleWork'),
  'idle work can yield past the hide/open paint');

const openFn = html.slice(html.indexOf('function handleOpenBox'), html.indexOf('function dismissBoxReveal'));
assert(openFn.includes('coverBoxRevealOverlay'), 'cover still happens on the tap');
assert(openFn.indexOf('coverBoxRevealOverlay') < openFn.indexOf('openBoxFree'),
  'loot still waits until after the cover');
assert(!openFn.includes('paintBoxRevealOverlay'), 'open tap must not write chest innerHTML');
assert(!openFn.includes('save()'), 'open tap must not persist');
assert(!openFn.includes('renderInventoryTab()'), 'open tap must not rebuild inventory');
assert(!openFn.includes('renderShopModal()'), 'open tap must not rebuild the shop');
assert(!openFn.includes('feedbackBoxOpen'), 'haptics are not on the open tap');

const dismissFn = html.slice(html.indexOf('function dismissBoxReveal'), html.indexOf('function getBoxRevealTier'));
assert(dismissFn.indexOf('hideBoxRevealOverlay') < dismissFn.indexOf('save()'),
  'overlay hides before persist');
assert(!dismissFn.includes('renderInventoryTab()'), 'inventory is not rebuilt on dismiss');
assert(!dismissFn.includes('renderShopModal()'), 'shop is not rebuilt on dismiss');
assert(dismissFn.includes('save()'), 'dismiss still persists, just later');
assert(dismissFn.includes('setTimeout'), 'persist is delayed off the hide frame');

const showFn = html.slice(html.indexOf('function showBoxReveal'), html.indexOf('document.getElementById(\'shopModalClose\')'));
assert(showFn.includes('feedbackBoxOpen(tier)'), 'SFX still plays after cover');
assert(!showFn.includes('paintBoxRevealOverlay'), 'reveal does not rewrite premounted chests');

const overlay = { classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(...cs) { cs.forEach(c => this._s.delete(c)); }, contains(c) { return this._s.has(c); } }, onclick: 'keep' };
coverBoxRevealOverlay(overlay);
hideBoxRevealOverlay(overlay);
assert(!overlay.classList.contains('box-reveal-on'), 'hide still idles the overlay');

assert(Array.isArray(GEAR_SLOTS) && GEAR_SLOTS.length === 8, 'eight named body slots');
['head', 'chest', 'legs', 'boots', 'amulet', 'ring', 'gloves', 'cloak'].forEach(id => {
  assert(GEAR_SLOTS.some(s => s.id === id), id + ' slot exists');
});
assert(isGearSlotUnlockedAtLevel('head', 1) && isGearSlotUnlockedAtLevel('amulet', 1),
  'level 1 unlocks starter armor and accessory slots');
assert(!isGearSlotUnlockedAtLevel('legs', 4) && isGearSlotUnlockedAtLevel('gloves', 5),
  'level 5 unlocks legs and gloves');
assert(!isGearSlotUnlockedAtLevel('boots', 9) && isGearSlotUnlockedAtLevel('cloak', 10),
  'level 10 unlocks boots and cloak');

assert(GEAR_SETS.ashenGrinder && GEAR_SETS.cinderforge && GEAR_SETS.vaultborn && GEAR_SETS.unbroken,
  'four named gear sets');
assert(GEAR_SETS.ashenGrinder.pieceCount === 4 && GEAR_SETS.vaultborn.pieceCount === 3,
  'set sizes match the roster');

const twoAshen = setBonusValueForEffect({ ashenGrinder: 2 }, 'points');
const fourAshenGold = setBonusValueForEffect({ ashenGrinder: 4 }, 'gold');
const fourAshenPts = setBonusValueForEffect({ ashenGrinder: 4 }, 'points');
assert(closeTo(twoAshen, 0.03), 'Ashen Grinder 2pc is +3% session points');
assert(closeTo(fourAshenGold, 0.06), 'Ashen Grinder 4pc is +6% session gold');
assert(closeTo(fourAshenPts, 0.03), 'full Ashen Grinder keeps the 2pc points bonus');
assert(closeTo(setBonusValueForEffect({ vaultborn: 3 }, 'gold'), 0.08), 'Vaultborn 2pc+full gold bonuses stack');
assert(closeTo(setBonusValueForEffect({ unbroken: 4 }, 'points'), 0.15), 'Unbroken 2pc+full point bonuses stack');
assert(closeTo(setBonusValueForEffect({ cinderforge: 4 }, 'enchantSuccess'), 0.04), 'Cinderforge 2pc enchant success');
assert(closeTo(setBonusValueForEffect({ cinderforge: 4 }, 'enchantXp'), 0.10), 'Cinderforge 4pc enchant XP');

const migrated = migrateEquippedToSlots(
  { boost: [{ kind: 'permanent', instanceId: 'i1' }, null, null], relic: [{ kind: 'permanent', instanceId: 'i2' }, null, null] },
  eq => eq.instanceId === 'i1' ? 'amulet' : 'head'
);
assert(migrated.slots.amulet.instanceId === 'i1' && migrated.slots.head.instanceId === 'i2',
  'legacy boost/relic arrays migrate onto named slots');
assert(!migrated.boost && !migrated.relic, 'migrated loadout is slot-only');
const already = migrateEquippedToSlots({ slots: { chest: { kind: 'permanent', instanceId: 'x' } } }, () => 'head');
assert(already.slots.chest.instanceId === 'x', 'already-migrated loadouts are kept');

const catalog = ITEMS_CATALOG;
const setPieces = { ashenGrinder: 0, cinderforge: 0, vaultborn: 0, unbroken: 0 };
const seenSlots = {};
catalog.forEach(t => {
  assert(t.slot, t.id + ' must declare a gear slot');
  assert(GEAR_SLOTS.some(s => s.id === t.slot), t.id + ' slot must be a known body slot');
  if (t.permanent) {
    assert(t.setId && GEAR_SETS[t.setId], t.id + ' permanent gear belongs to a named set');
    setPieces[t.setId] += 1;
    const key = t.setId + ':' + t.slot;
    assert(!seenSlots[key], t.id + ' collides with another piece of the same set in ' + t.slot);
    seenSlots[key] = t.id;
  } else {
    assert(!t.setId, t.id + ' temp items stay off sets');
  }
});
assert(setPieces.ashenGrinder === 4 && setPieces.cinderforge === 4, 'Ashen Grinder and Cinderforge are 4-piece');
assert(setPieces.vaultborn === 3, 'Vaultborn is 3-piece');
assert(setPieces.unbroken === 4, 'The Unbroken is 4 unique pieces');
assert(itemTemplate('wornCharm').slot === 'head' && itemTemplate('wornCharm').setId === 'ashenGrinder',
  'starter charm is the Ashen Grinder helm');
assert(itemTemplate('grindersChair').slot === 'chest', 'Throne is a chest piece');
assert(itemTemplate('legendaryDumbbell').slot === 'boots', 'Iron Sovereign is boots');
assert(itemTemplate('ironFocus').slot === 'amulet', 'Mindforge Sigil is an amulet');
assert(itemTemplate('featherweightWraps').slot === 'gloves' && !itemTemplate('featherweightWraps').setId,
  'wraps occupy gloves and stay off sets');

const counts = equippedSetCountsFromTemplates([
  itemTemplate('wornCharm'),
  itemTemplate('grindersChair'),
  itemTemplate('ironFocus'),
]);
assert(counts.ashenGrinder === 3, 'set counter tallies equipped templates');

assert(html.includes('id="invLoadoutEntry"') && html.includes('id="loadoutModal"'),
  'loadout is a button that opens a gear window');
assert(!html.includes('id="invLoadout"'), 'inventory no longer keeps the loadout panel open');
assert(html.includes('Set bonuses') && html.includes('gear-set-bonus'), 'set tracker is in the UI');
assert(html.includes('Unlocks at Level'), 'locked slots explain the unlock');
assert(html.includes("equippedSetBonusFor('points')"), 'session points include set bonuses');
assert(html.includes("equippedSetBonusFor('gold')"), 'session gold includes set bonuses');

const SHARD_PATH = 'M12 2l6.5 9.2L12 22 5.5 11.2 12 2z';
const STONE_PATH = 'M12 2l8 6v8l-8 6-8-6V8l8-6z';
assert(matIconSvg('shards', 'boost').includes(SHARD_PATH), 'boost shards stay the diamond');
assert(matIconSvg('shards', 'relic').includes(SHARD_PATH), 'relic shards stay the diamond');
assert(matIconSvg('stone', 'boost').includes(STONE_PATH), 'boost stones stay the hex');
assert(matIconSvg('stone', 'relic').includes(STONE_PATH), 'relic stones stay the hex');

const icons = {};
catalog.forEach(t => {
  const svg = itemIconSvg(t.id);
  assert(svg.includes('<svg'), t.id + ' still has a dedicated icon');
  icons[t.id] = svg;
});
assert(icons.wornCharm !== icons.vaultSigil && icons.wornCharm !== icons.crownUnbroken,
  'head pieces do not share an icon');
assert(icons.grindersChair.includes('M7.2 7.4 12 5.4'), 'chest piece is a breastplate');
assert(icons.oathboundBand.includes('M7.6 4.2h3.4v16.2') && icons.spellboundChisel.includes('M7.6 4.2h3.4v16.2'),
  'leg pieces are greaves');
assert(icons.cinderAnvil.includes('M5.6 8.4h5.4v8') && icons.legendaryDumbbell.includes('M5.6 8.4h5.4v8'),
  'boot pieces are boots');
assert(icons.ironFocus.includes('circle cx="12" cy="15"') && icons.firstLight.includes('circle cx="12" cy="15"'),
  'amulets are pendant silhouettes');
assert(icons.emberHalo.includes('circle cx="12" cy="14" r="6.2"') && icons.lastEmber.includes('circle cx="12" cy="14" r="6.2"'),
  'rings are ring silhouettes');
assert(icons.hexwick.includes('M6.8 11.2h10.4v8') && icons.featherweightWraps.includes('M7 11h10v8.2H7z'),
  'glove pieces are gauntlets');
assert(icons.lorequill.includes('M7 5.2 12 3.4 17 5.2') && icons.gildthread.includes('M7 5.2 12 3.4 17 5.2'),
  'cloaks are cloak silhouettes');
assert(icons.wornCharm !== icons.grindersChair, 'set pieces still look distinct');

assert(html.includes('3.4.13'), 'About version bumped for v5.2');

console.log('v5.2 tests ok — committed-paint box lag fix, equipment sets, gear icons, materials unchanged');
