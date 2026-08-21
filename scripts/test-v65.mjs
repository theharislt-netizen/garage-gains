#!/usr/bin/env node
/**
 * v6.5: new-item glow clears on view and is cyan; box art is unified;
 * hero banner drops the rank tag; stars are headroom (no 1-star spawn);
 * set counts use Loadout slots; currency chips refresh on spend;
 * boss HP depletes; enchant tutorial glows the real item/stone;
 * Victory box uses Relic art; reward copy names the box ×1.
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
vm.runInContext(sliceLib('v44-helpers-lib'), ctx);
vm.runInContext(sliceLib('v45-helpers-lib'), ctx);
vm.runInContext(sliceLib('v47-helpers-lib'), ctx);
vm.runInContext(sliceLib('v49-helpers-lib'), ctx);
vm.runInContext(sliceLib('item-catalog-lib'), ctx);
vm.runInContext(sliceLib('equipment-sets-lib'), ctx);
vm.runInContext(sliceLib('first-run-unlock-lib'), ctx);

const {
  acknowledgeItemType,
  stripNewItemGlow,
  shouldFlashItemType,
  invSlotGlowClass,
  shopBoxArtSvg,
  boxArtHtml,
  boxArtKind,
  bossHpBarPct,
  bossHpRemaining,
  rollRegularStar,
  starRowHtml,
  itemStarCap,
  loadoutSlotCount,
  gearSetPieceCount,
  setBonusBreakdownForTemplate,
  itemTemplate,
  sealedBoxRewardLine,
  boxTemplate,
} = ctx;
const REGULAR_STAR_TIERS = vm.runInContext('REGULAR_STAR_TIERS', ctx);
const REGULAR_STAR_WEIGHTS = vm.runInContext('REGULAR_STAR_WEIGHTS', ctx);
const ITEMS_CATALOG = vm.runInContext('ITEMS_CATALOG', ctx);

assert(html.includes('.inv-slot.new-item-glow'), 'new-item glow has its own CSS class');
assert(html.includes('newItemGlowPulse'), 'new-item glow uses a dedicated cyan pulse');
assert(html.includes('tutorial-guidance-glow-pulse'), 'tutorial glow pulse is unchanged');
const newGlowAt = html.indexOf('.inv-slot.new-item-glow');
const newGlowRule = html.slice(newGlowAt, html.indexOf('}', newGlowAt) + 1);
assert(newGlowRule.includes('--a2-rgb'), 'new-item glow is cyan (accent 2), not tutorial purple');
const tutGlowAt = html.indexOf('.inv-slot.tutorial-guidance-glow');
const tutGlowRule = html.slice(tutGlowAt, html.indexOf('}', tutGlowAt) + 1);
assert(tutGlowRule.includes('--a1-rgb'), 'tutorial glow stays purple (accent 1)');

assert(typeof stripNewItemGlow === 'function', 'viewing an item can strip the new-item glow immediately');
const fakeSlot = { classList: { _s: new Set(['inv-slot', 'new-item-glow']), contains(c) { return this._s.has(c); }, remove(...cs) { cs.forEach(c => this._s.delete(c)); } } };
assert(stripNewItemGlow(fakeSlot) === true, 'strip reports when a new-item glow was present');
assert(!fakeSlot.classList.contains('new-item-glow'), 'glow class is gone after view');
assert(fakeSlot.classList.contains('inv-slot'), 'the slot itself is not rebuilt away');
const finishFn = sliceFn('finishItemDetailRender', 'openItemDetailModal');
assert(finishFn.includes('stripNewItemGlow(target.anchorEl)'), 'opening the detail popup clears the glow without leaving Inventory');

const bag = { inventory: { everOwnedTypes: ['item:emberHalo'], unseenTypes: ['item:emberHalo'] } };
assert(shouldFlashItemType(bag, 'item:emberHalo') === true, 'unseen items still flash');
acknowledgeItemType(bag, 'item:emberHalo');
assert(shouldFlashItemType(bag, 'item:emberHalo') === false, 'viewing acknowledges the type');
assert(invSlotGlowClass({ progression: { starterBoxGranted: true, starterBoxOpened: false } }, 'starterVictoryBox', true) === 'tutorial-guidance-glow',
  'tutorial box still uses the purple guidance glow');

const relicArt = shopBoxArtSvg('relic');
const boostArt = shopBoxArtSvg('boost');
assert(relicArt.includes('<svg') && boostArt.includes('<svg'), 'shop box art is SVG');
assert(relicArt !== boostArt, 'Relic and Boost boxes stay visually distinct');
assert(boxArtKind('shopBoostBox') === 'boost' && boxArtKind('boost') === 'boost', 'boost ids map to boost art');
assert(boxArtKind('shopRelicBox') === 'relic' && boxArtKind('starterVictoryBox') === 'relic',
  'Relic box and Victory box share Relic art');
assert(boxArtHtml('shopRelicBox') === boxArtHtml('starterVictoryBox'),
  'Victory box artwork matches the Relic box');
assert(boxArtHtml('shopBoostBox') !== boxArtHtml('shopRelicBox'),
  'Boost box artwork stays different from Relic');
const invBoxes = html.slice(html.indexOf('const boxSlots = sealedBoxes.map'), html.indexOf('const permSlots = permItems.map'));
assert(invBoxes.includes('boxArtHtml(boxId)'), 'Inventory boxes use the Shop art helper');
assert(!invBoxes.includes('tmpl.icon'), 'Inventory boxes do not use a separate emoji icon');
const detailFn = sliceFn('renderItemDetailModal', 'openInventoryBox');
assert(detailFn.includes('boxArtHtml(box.itemId'), 'item-detail box popup uses the same Shop art');
assert(html.includes('id="boxArtStarter"') && html.includes('id="boxArtRelic"'),
  'box-open overlay still has dedicated Relic and Victory chests');
const starterArt = html.slice(html.indexOf('id="boxArtStarter"'), html.indexOf('id="boxRevealPrize"'));
const relicOverlay = html.slice(html.indexOf('id="boxArtRelic"'), html.indexOf('id="boxArtStarter"'));
assert(starterArt.includes('M32 34l8 5v7') && relicOverlay.includes('M32 34l8 5v7'),
  'Victory overlay chest matches the Relic chest path');
assert(!starterArt.includes('📦'), 'Victory overlay is not a cardboard emoji');

const hero = html.slice(html.indexOf('id="nameBadge"'), html.indexOf('id="nbStreak"'));
assert(!hero.includes('rankTag') && !hero.includes('rank-tag'),
  'hero banner no longer shows a rank name tag next to the player name');
assert(hero.includes('id="nbNameText"'), 'hero banner still shows the player name');
assert(html.includes('id="statsRankTag"'), 'Stats still shows its Level tag');

assert(REGULAR_STAR_TIERS.join(',') === '0,2,3,4', 'spawn tiers are 0, 2, 3, 4 — no 1-star');
assert(!REGULAR_STAR_TIERS.includes(1), '1-star cannot roll');
assert(REGULAR_STAR_WEIGHTS.length === 4, 'weights match the four spawn tiers');
assert(rollRegularStar(() => 0.01) === 0, 'low rolls still land on 0-star');
assert(rollRegularStar(() => 0.999) === 4, 'high rolls land on 4-star, never 1');
for (let i = 0; i < 20; i++) {
  const rolled = rollRegularStar(() => (i + 0.5) / 20);
  assert(rolled !== 1, 'no slice of the weighted table returns 1-star');
}
const twoStar = starRowHtml({ permanent: true }, 0, { star: 0, starCap: 2 });
assert(!(twoStar.match(/star-on/g) || []).length, 'a 2-star spawn shows zero filled stars');
assert((twoStar.match(/star-off/g) || []).length === 2, 'a 2-star spawn shows two gray headroom stars');
const threeStar = starRowHtml({ permanent: true }, 0, { star: 0, starCap: 3 });
assert((threeStar.match(/star-off/g) || []).length === 3 && !(threeStar.match(/star-on/g) || []).length,
  'a 3-star spawn is three unfilled stars');
const enchanted = starRowHtml({ permanent: true }, 1, { star: 1, starCap: 2 });
assert((enchanted.match(/star-on/g) || []).length === 1 && (enchanted.match(/star-off/g) || []).length === 1,
  'enchanting fills headroom one star at a time');
assert(starRowHtml({ permanent: true }, 0, { star: 0, starCap: 0 }) === '',
  '0-star items have no star row');
assert(itemStarCap({ permanent: true }, { starCap: 1 }) === 2,
  'legacy 1-star caps migrate up to 2 rather than spawning as 1');
const grantFn = sliceFn('grantItem', 'itemRarityWeight');
assert(grantFn.includes('star: 0, starCap'), 'new items spawn with zero filled stars and a rolled cap');
const loadoutFn = sliceFn('loadoutFrameHtml', 'renderEquippedSummary');
assert(loadoutFn.includes('itemStarsHtml'), 'Loadout frames show the same star headroom');
assert(html.includes('id="boxPrizeStars"'), 'box-open prize cards show stars');

const cinder = setBonusBreakdownForTemplate(itemTemplate('cinderAnvil'), { cinderforge: 2 });
assert(cinder.pieceCount === 3, 'Cinderforge detail uses 3 Relic slots, not the 4-piece roster');
assert(cinder.equipped === 2, 'equipped numerator is unchanged');
assert(html.includes('EQUIPPED'), 'item detail labels the set count as EQUIPPED');
assert(gearSetPieceCount('cinderforge') === loadoutSlotCount('relic')
  || gearSetPieceCount('cinderforge') === loadoutSlotCount('boost'),
  'set-piece helper is the Loadout slot count, not catalog length');
assert(ITEMS_CATALOG.filter(t => t.setId === 'cinderforge').length === 4,
  'Cinderforge still has four catalog pieces — the denominator must ignore that');

const currencySrc = html.slice(html.indexOf('function refreshHeaderCurrency'), html.indexOf('document.querySelectorAll(\'.tab\')'));
assert(currencySrc.includes('shopGemsVal') && currencySrc.includes('invGemsCount') && currencySrc.includes('invGoldGems'),
  'every on-screen gold/gem chip is patched from one helper');
assert(html.includes('id="shopGemsVal"'), 'Shop gem balance has a live id');
const openBoxFn = sliceFn('handleOpenBox', 'dismissBoxReveal');
assert(openBoxFn.includes('refreshHeaderCurrency()'), 'buying a box refreshes currency immediately');
assert(openBoxFn.indexOf('state.gold -= cost') < openBoxFn.indexOf('refreshHeaderCurrency()'),
  'the chip updates after the spend, on the same tap');
const buyFn = sliceFn('buyDirectItem', 'unlockTitle');
assert(buyFn.includes('refreshHeaderCurrency()'), 'direct shop spends also refresh chips');
const invFn = sliceFn('renderInventoryTab', 'positionItemDetailPopup');
assert(!invFn.includes("invGoldGems').textContent = ''") && !invFn.includes('invGemsCount\').textContent = \'\''),
  'Inventory no longer blanks the Store gold and Enchant gem chips');

assert(bossHpBarPct(0, 100) === 100, 'boss HP bar starts full');
assert(bossHpBarPct(40, 100) === 60, 'logged progress depletes the bar');
assert(bossHpBarPct(100, 100) === 0, 'defeat is an empty bar, not a full one');
assert(bossHpRemaining(40, 100) === 60, 'remaining HP is total minus progress');
const bossesFn = sliceFn('renderBossesSection', 'renderQuestsSection');
assert(bossesFn.includes('bossHpBarPct(progress, total)'), 'dashboard boss cards use remaining HP');
const instFn = sliceFn('renderInstanceView', 'maybeAutoCommitFirstLoop');
assert(instFn.includes('bossHpBarPct(progress, total)'), 'in-fight HP bar depletes the same way');
assert(instFn.includes('HP ${remaining} / ${total}'), 'fight view labels remaining / total HP');

const enchantFn = sliceFn('renderEnchantModal', 'renderShopModal');
assert(enchantFn.includes("p.itemId === STARTER_RELIC_ID"), 'enchant item picker glows the starter relic');
assert(enchantFn.includes('tutorial-guidance-glow'), 'enchant picker uses the tutorial glow');
assert(enchantFn.includes('id="enchantStonePickCard"'), 'enchant stone picker has a dedicated card');
assert(enchantFn.includes("enchantStonePickCard") && enchantFn.includes('tutorial-guidance-glow'),
  'the stone itself glows until it is placed');

const line = sealedBoxRewardLine({ inventory: { boxes: [] } }, 'boost');
assert(line.label === 'Boost Box' && line.value === 'x1', 'boost reward names Boost Box x1');
const relicLine = sealedBoxRewardLine({ inventory: { boxes: [] } }, 'relic');
assert(relicLine.label === 'Relic Box' && relicLine.value === 'x1', 'relic reward names Relic Box x1');
assert(!html.includes('Added to Inventory'), 'generic added-to-inventory copy is gone');
assert(html.includes("label: 'First Victory Box', value: 'x1'"), 'Victory box reward copy names the box and quantity');
assert(boxTemplate('starterVictoryBox').name === 'First Victory Box', 'starter template name is unchanged');

assert(html.includes('3.4.25'), 'About version bumped for v6.5');

console.log('v6.5 tests ok — glow, box art, banner, stars, set count, gems, boss HP, enchant glow, victory art, reward copy');
