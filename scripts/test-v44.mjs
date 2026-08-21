#!/usr/bin/env node
/**
 * v4.4: warmup type picker starts the quest, set-gated pacing, no rest after
 * the last exercise, Level 2 after a typical first workout, level-up deferred
 * to reward claim, purple unlock flash, unseen-type inventory flash, no
 * Enchant on item popups, materials info-only, Craft Stones icons, equip
 * tutorial, dashboard chrome reset after instances.
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

// 1. Warm-up tutorial goes to type selection then starts.
assert(html.includes("Let's do the warm-up"), 'intro CTA must take them into a warm-up');
assert(html.includes('function showWarmupTypePicker'), 'type picker helper missing');
assert(html.includes('data-warmup-intro-start'), 'type picker must start the chosen option');
assert(html.includes('startWarmupQuest(optionId)'), 'picking a type must start the quest');
assert(html.includes("enterInstance({ type: 'warmup', optionId })"), 'picking a type must enter the warm-up instance');
const yesHandler = html.slice(html.indexOf("id=\"warmupIntroYes\""), html.indexOf('function showWarmupTypePicker'));
assert(yesHandler.includes('showWarmupTypePicker'), 'Let\'s do the warm-up must open the type picker, not dump to Dashboard');
assert(!yesHandler.includes('renderToday()'), 'yes-click must not only refresh the Dashboard');

// 2. Baseline bar sits below the day header.
assert(html.includes('max-height: min(72dvh, 560px)'), 'sticky sub must have room for date + LED');
assert(html.includes('.day-header') && html.includes('z-index: 2'), 'day header stays above the LED');
assert(html.includes('keepLed') || html.includes("type === 'workout'"), 'workout instance keeps the baseline bar visible under the date');

// 3. Set-specific pacing.
const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(sliceLib('v44-helpers-lib'), ctx);
const {
  getLevel,
  pointsForLevel,
  typicalFirstWorkoutPoints,
  pacingNoteForSet,
  hasRemainingSuggestedWork,
  itemTypeKey,
  noteItemTypeGranted,
  acknowledgeItemType,
  shouldFlashItemType,
  ensureSeenItemTypes,
} = ctx;
assert(pacingNoteForSet('Max effort on set 1, later sets drop.', 0).includes('set 1'), 'set-1 tip shows on set 1');
assert(pacingNoteForSet('Max effort on set 1, later sets drop.', 1) === '', 'set-1 tip hidden on set 2');
assert(pacingNoteForSet('Hold back on set 1 — go all out on set 2.', 0).includes('set 1'), 'two-set tip shows on set 1');
assert(pacingNoteForSet('Hold back on set 1 — go all out on set 2.', 1).includes('set 2'), 'two-set tip shows on set 2');
assert(pacingNoteForSet('Hold back on set 1 — go all out on set 2.', 2) === '', 'two-set tip hidden on set 3');
assert(pacingNoteForSet('Keep a steady pace.', 2) === 'Keep a steady pace.', 'generic pacing stays on every set');
assert(html.includes('pacingNoteForSet(ex.pacing, activeIdx)'), 'workout cards gate pacing by the active set');

// 4. No rest after the last exercise.
assert(hasRemainingSuggestedWork(2, 3, [{ loggedCount: 0, suggestedSets: 3 }]) === true, 'more sets of this exercise still need rest');
assert(hasRemainingSuggestedWork(3, 3, [{ loggedCount: 0, suggestedSets: 3 }]) === true, 'another exercise remaining still needs rest');
assert(hasRemainingSuggestedWork(3, 3, [{ loggedCount: 3, suggestedSets: 3 }]) === false, 'last set of last exercise must not rest');
assert(html.includes('hasRemainingSuggestedWork'), 'commitSet must consult remaining work');
assert(html.includes('else clearRestTimer()'), 'last set must clear any rest timer');

// 5. Level 2 after first workout; level-up on claim.
assert(pointsForLevel(2) === 150, 'curve K retuned from 50 to 150');
assert(getLevel(0) === 1, 'new accounts start at Level 1');
assert(getLevel(149) === 1 && getLevel(150) === 2, 'Level 2 starts at 150 pts');
assert(getLevel(599) === 2 && getLevel(600) === 3, 'Level 3 starts at 600 pts');
const first = typicalFirstWorkoutPoints();
assert(first > 200 && first < 500, 'typical first workout is a few hundred pts');
assert(getLevel(first) === 2, 'typical first workout must land on Level 2, not 3+');
assert(getLevel(400) === 2, 'a strong first session still stays at Level 2');
assert(pointsForLevel(2) === 150 && pointsForLevel(3) === 600);
const creditFn = html.slice(html.indexOf('function creditPoints'), html.indexOf('function flushPendingLevelUp'));
assert(!creditFn.includes('checkLevelUp('), 'creditPoints must not fire level-up mid-grind');
assert(html.includes('function flushPendingLevelUp'), 'level-up flush helper missing');
assert(html.includes('flushPendingLevelUp()'), 'Claim Rewards must flush the pending level-up');

// 6 + 7. Purple unlock flash + unseen-type-only item flash.
assert(html.includes('#b455f5') && html.includes('slotUnlockPulse'), 'unlock flash uses app purple');
assert(html.includes('tabUnlockPulse') && html.includes('scale(1.16)'), 'tab unlock flash is stronger');
const freshInv = { inventory: { permanent: [], tempCharges: {}, shards: { relic: 0, boost: 0 }, stones: { relic: 0, boost: 0 }, boxes: [] } };
assert(ensureSeenItemTypes(freshInv) === true);
assert(noteItemTypeGranted(freshInv, itemTypeKey('item', 'wornCharm')) === true, 'first relic type flashes');
assert(shouldFlashItemType(freshInv, itemTypeKey('item', 'wornCharm')) === true);
assert(noteItemTypeGranted(freshInv, itemTypeKey('item', 'wornCharm')) === false, 'duplicate type does not flash');
assert(acknowledgeItemType(freshInv, itemTypeKey('item', 'wornCharm')) === true);
assert(shouldFlashItemType(freshInv, itemTypeKey('item', 'wornCharm')) === false, 'viewing info clears the flash');
assert(noteItemTypeGranted(freshInv, itemTypeKey('shards', 'relic')) === true);
assert(noteItemTypeGranted(freshInv, itemTypeKey('shards', 'relic')) === false, 'more shards of a known type stay quiet');
const veteranInv = { inventory: { permanent: [{ itemId: 'wornCharm' }], shards: { relic: 5, boost: 0 }, stones: { relic: 1, boost: 0 }, tempCharges: {}, boxes: [] } };
assert(ensureSeenItemTypes(veteranInv) === true);
assert(shouldFlashItemType(veteranInv, itemTypeKey('item', 'wornCharm')) === false, 'already-owned types do not flash on migrate');

// 8. Item popup: no Enchant; Equip/Salvage restyled.
assert(!html.includes('id="itemDetailEnchantBtn"'), 'Enchant button must be gone from item info');
assert(html.includes('inv-btn-equip'), 'Equip needs a prominent button style');
assert(html.includes('inv-btn-salvage') && html.includes('#ff5c5c'), 'Salvage must be clearly red');

// 9. Materials info-only.
const matIdx = html.indexOf("target.kind === 'mat'");
assert(matIdx > 0, 'material detail branch missing');
const matPopup = html.slice(matIdx, matIdx + 1800);
assert(!matPopup.includes('itemDetailCraftBtn'), 'shard popup must not Craft');
assert(!matPopup.includes('itemDetailOpenEnchantBtn'), 'stone popup must not Open Enchant');
assert(matPopup.includes('Enchanting Table'), 'materials still explain where they are used');

// 10. Craft Stones visual rework.
assert(html.includes('craft-stone-grid') && html.includes('craft-stone-icon'), 'Craft Stones needs icons, not a plain list');
assert(html.includes('Crafts 💠 Relic Enchantment Stone'), 'craft cards show what they produce');

// 11. Onboarding through Equip.
assert(html.includes('function markEquipTutorialDone'), 'equip tutorial flag missing');
assert(html.includes('nudgeEquip'), 'equip highlight flag missing');
assert(html.includes("itemId === STARTER_RELIC_ID"), 'starter relic is the equip tutorial target');

// 12. Post-instance dashboard chrome reset.
assert(html.includes('function resetDashboardChrome'), 'dashboard chrome reset helper missing');
assert(html.includes("classList.remove('instance-no-scroll', 'rest-focus')") || html.includes("classList.remove('instance-no-scroll', 'rest-focus')"), 'instance scroll lock must clear');
assert(html.includes('resetDashboardChrome()'), 'leave/complete paths must reset chrome');

console.log('v4.4 ok — warmup picker, pacing, rest, level claim, purple flash, inventory, craft, equip, chrome');
