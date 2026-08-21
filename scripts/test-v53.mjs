#!/usr/bin/env node
/**
 * v5.3: loadout is a gear window, hero badge icon stays on-screen,
 * relic/boost icons use stock photos, duplicate pulls pay salvage shards,
 * salvage has an in-game confirm, and box open/dismiss stay off the tap thread.
 */
import { access, readFile } from 'node:fs/promises';
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

const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(sliceLib('item-catalog-lib'), ctx);
const itemIconHtml = vm.runInContext('itemIconHtml', ctx);
const itemIconSvg = vm.runInContext('itemIconSvg', ctx);
const matIconSvg = vm.runInContext('matIconSvg', ctx);
const ITEMS_CATALOG = vm.runInContext('ITEMS_CATALOG', ctx);

assert(html.includes('id="invLoadoutEntry"'), 'Inventory has a Loadout button');
assert(html.includes('id="loadoutModal"') && html.includes('id="loadoutModalBody"'),
  'Loadout opens a dedicated gear window');
assert(!html.includes('id="invLoadout"'), 'loadout is not an always-open Inventory section');
assert(html.includes('function openLoadoutModal()'), 'Loadout button has an opener');
assert(html.includes("getElementById('invLoadoutEntry').onclick = openLoadoutModal"),
  'Inventory wires the Loadout button');

assert(html.includes('position: absolute; left: 4px;'),
  'rank icon sits inside the badge frame instead of hanging off the left');
assert(!html.includes('left: -17px'), 'rank icon no longer uses a negative offset');
assert(html.includes('.ml-badge-frame') && html.includes('padding-left: 22px'),
  'badge frame leaves room for the icon');
assert(html.includes('.name-badge-row') && html.includes('overflow: visibl'),
  'hero banner row does not clip the rank icon');

assert(html.includes('.item-photo'), 'photoreal item icons have CSS');
ITEMS_CATALOG.forEach(t => {
  const photo = itemIconHtml(t);
  assert(photo.includes('class="item-photo"'), t.id + ' uses a stock photo tag');
  assert(photo.includes('gear/' + t.id + '.jpg'), t.id + ' points at its photo file');
  const svg = itemIconSvg(t.id);
  assert(svg.includes('<svg'), t.id + ' still has an SVG fallback');
});
const SHARD_PATH = 'M12 2l6.5 9.2L12 22 5.5 11.2 12 2z';
const STONE_PATH = 'M12 2l8 6v8l-8 6-8-6V8l8-6z';
assert(matIconSvg('shards', 'boost').includes(SHARD_PATH), 'boost shards stay the diamond');
assert(matIconSvg('stone', 'relic').includes(STONE_PATH), 'relic stones stay the hex');

for (const t of ITEMS_CATALOG) {
  await access(join(root, 'gear', t.id + '.jpg'));
}

const openFn = html.slice(html.indexOf('function handleOpenBox'), html.indexOf('function dismissBoxReveal'));
assert(openFn.includes('coverBoxRevealOverlay(overlay, category)'), 'tap covers with the matching chest');
assert(!openFn.includes('paintBoxRevealOverlay'), 'tap must not write overlay innerHTML');
assert(!openFn.includes('innerHTML'), 'tap must not rebuild overlay markup');
assert(!openFn.includes('save()'), 'tap must not persist');
assert(!openFn.includes('renderShopModal'), 'tap must not rebuild the shop');
assert(!openFn.includes('feedbackBoxOpen'), 'SFX is not on the tap');
assert(openFn.indexOf('coverBoxRevealOverlay') < openFn.indexOf('openBoxFree'),
  'loot waits until after the cover class is on');

const dismissFn = html.slice(html.indexOf('function dismissBoxReveal'), html.indexOf('function getBoxRevealTier'));
assert(dismissFn.includes('hideBoxRevealOverlay'), 'dismiss hides immediately');
assert(!dismissFn.includes('renderShopModal'), 'dismiss does not rebuild the shop');
assert(!dismissFn.includes('renderInventoryTab'), 'dismiss does not rebuild inventory');
assert(dismissFn.includes('save()'), 'dismiss still persists later');
assert(dismissFn.includes('400'), 'persist is delayed off the hide frame');

assert(html.includes('id="boxArtBoost"') && html.includes('id="boxArtRelic"') && html.includes('id="boxArtStarter"'),
  'boost, relic, and starter chests are pre-mounted');
assert(html.includes('id="boxRevealPrize"'), 'prize is a separate layer over the premounted chests');

assert(html.includes('function salvagePayoutForStar'), 'salvage payout is shared');
assert(html.includes('function convertOwnedDuplicate'), 'duplicate pulls reuse salvage math');
assert(html.includes("kind: 'dupe-salvage'") || html.includes('kind: \'dupe-salvage\''),
  'duplicate conversion is salvage shards, not a flat gem payout');
assert(!html.includes('state.gems += 3'), 'duplicate pulls no longer grant a flat 3 gems');
assert(html.includes('id="salvageConfirmModal"'), 'salvage opens an in-game confirm');
assert(html.includes("You'll receive +${amount}"), 'confirm shows the salvage payout');
assert(html.includes('function openSalvageConfirm'), 'salvage confirm is not a browser dialog');
assert(!html.includes('if (!confirm(`Salvage'), 'browser confirm is gone from salvage');

assert(html.includes('3.4.13'), 'About version bumped for v5.3');

console.log('v5.3 tests ok — loadout window, banner icon, stock photos, salvage dupes, box tap lag');
