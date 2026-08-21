#!/usr/bin/env node
/**
 * v5.4: the phone video showed a frozen chest then a hard-cut prize, and
 * shard cards with a broken <img> plus a floating diamond. Prior passes
 * only deferred loot; this pass drives the shake with WAAPI (visibility-
 * hidden CSS animation never ticked on Android WebView), fades the prize
 * in after a premount, hides shard photos with display:none !important,
 * and defers shop-unhide off the close tap.
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

const ctx = {
  console,
  Math,
  window: {},
  requestAnimationFrame(fn) { fn(); return 1; }
};
vm.createContext(ctx);
vm.runInContext(sliceLib('box-reveal-lib'), ctx);
vm.runInContext(sliceLib('item-catalog-lib'), ctx);

const startChestShake = vm.runInContext('startChestShake', ctx);
const stopChestShake = vm.runInContext('stopChestShake', ctx);
const coverBoxRevealOverlay = vm.runInContext('coverBoxRevealOverlay', ctx);
assert(typeof startChestShake === 'function', 'shake is a WAAPI helper, not a CSS-only hope');
assert(typeof stopChestShake === 'function', 'shake can be cancelled on prize/dismiss');

let animateCalls = 0;
const chest = {
  classList: { add() {}, remove() {} },
  offsetWidth: 96,
  animate(keyframes, opts) {
    animateCalls += 1;
    assert(Array.isArray(keyframes) && keyframes.length >= 2, 'WAAPI keyframes rotate the chest');
    assert(String(JSON.stringify(keyframes)).includes('rotate'), 'shake keyframes use transform rotate');
    assert(opts && opts.iterations === Infinity, 'shake loops for the whole buildup');
    return { cancel() {} };
  }
};
const overlay = {
  classList: { add() {}, remove() {}, toggle() {} },
  querySelector(sel) { return sel.includes('boost') ? chest : null; },
  onclick: null
};
assert(startChestShake(overlay, 'boost') === true, 'boost chest starts a shake');
assert(animateCalls >= 1, 'Element.animate actually ran');
stopChestShake();
assert(coverBoxRevealOverlay(overlay, 'boost') === true, 'cover still returns true');
assert(animateCalls >= 2, 'cover starts the shake on the tap, before loot');

const lib = sliceLib('box-reveal-lib');
assert(lib.includes('el.animate'), 'shake uses the Web Animations API');
assert(lib.includes('function startChestShake'), 'shake helper is in the overlay lib');
assert(lib.includes('function stopChestShake'), 'stop helper is in the overlay lib');

const openFn = html.slice(html.indexOf('function handleOpenBox'), html.indexOf('function dismissBoxReveal'));
assert(openFn.includes('coverBoxRevealOverlay(overlay, category)'), 'tap still covers first');
assert(openFn.includes('queueBoxOpenWork'), 'loot still waits off the tap');
assert(openFn.indexOf('coverBoxRevealOverlay') < openFn.indexOf('openBoxFree'),
  'loot still waits until after the cover class');
assert(!openFn.includes('paintBoxRevealOverlay'), 'tap must not write chest innerHTML');
assert(!openFn.includes('innerHTML'), 'tap must not rebuild overlay markup');
assert(!openFn.includes('save()'), 'tap must not persist');
assert(!openFn.includes('renderShopModal'), 'tap must not rebuild the shop');
assert(!openFn.includes('feedbackBoxOpen'), 'SFX is not on the tap');
assert(openFn.includes('coverShopForBoxReveal(true)'), 'shop stops painting under the chest');

const dismissFn = html.slice(html.indexOf('function dismissBoxReveal'), html.indexOf('function getBoxRevealTier'));
assert(dismissFn.includes('hideBoxRevealOverlay'), 'dismiss hides the overlay on the tap');
assert(dismissFn.includes('afterPaint'), 'shop unhide waits for a committed frame');
assert(dismissFn.indexOf('hideBoxRevealOverlay') < dismissFn.indexOf('coverShopForBoxReveal(false)'),
  'overlay hides before the shop is shown again');
assert(!dismissFn.includes('renderShopModal'), 'dismiss does not rebuild the shop');
assert(dismissFn.includes('renderInventoryTab'), 'dismiss refreshes inventory after hide');
assert(dismissFn.indexOf('hideBoxRevealOverlay') < dismissFn.indexOf('renderInventoryTab'),
  'inventory refresh waits until after hide');
assert(dismissFn.includes('save()'), 'dismiss still persists later');

const showFn = html.slice(html.indexOf('function showBoxReveal'), html.indexOf('document.getElementById(\'shopModalClose\')'));
assert(!showFn.includes('coverBoxRevealOverlay'), 'reveal must not recast cover classes mid-shake');
assert(showFn.includes('fillBoxRevealPrize'), 'prize fills premounted nodes during the shake');
assert(showFn.includes('revealFilledBoxPrize'), 'prize class is applied after the buildup, not on fill');
assert(showFn.includes('feedbackBoxOpen(tier)'), 'SFX still plays, just after the prize');
assert(showFn.includes('scheduleIdleWork'), 'SFX is idle-deferred off the prize frame');
assert(showFn.indexOf('fillBoxRevealPrize') < showFn.indexOf('revealFilledBoxPrize'),
  'prize nodes are filled before the visible cutover');

const fillFn = html.slice(html.indexOf('function fillBoxRevealPrize'), html.indexOf('function revealFilledBoxPrize'));
assert(fillFn.includes("outcome.kind === 'shards'"), 'shard rewards take a dedicated icon path');
assert(fillFn.includes('matIconHtml'), 'shard/stone rewards use the diamond/hex SVG');
assert(fillFn.includes('photo.hidden = true'), 'shard path hides the gear photo');
assert(fillFn.includes("classList.add('is-mat')"), 'shard path marks the icon wrap as mat-only');
assert(!fillFn.includes("classList.add('box-prize-on')"), 'filling the prize must not show it yet');
assert(!fillFn.includes("photo.src = 'gear/'") || fillFn.indexOf("kind === 'shards'") < fillFn.indexOf("photo.src = 'gear/'"),
  'shard rewards must not point the img at a gear photo');

assert(html.includes('#boxPrizePhoto[hidden]') && html.includes('display: none !important'),
  'hidden prize photos cannot be overridden by .item-photo { display:block }');
assert(html.includes('#boxPrizeIcon.is-mat .item-photo'), 'mat rewards force the img out of layout');
assert(html.includes('#boxPrizeMat') && html.includes('align-items: center'),
  'shard SVG is flex-centered in its frame');
assert(html.includes('will-change: transform'), 'chest is promoted for a compositor shake');
assert(html.includes('transition: opacity 0.24s ease-out') || html.includes('transition: opacity 0.24s'),
  'prize fades in instead of hard-cutting');
assert(!html.includes('#boxRevealOverlay.box-reveal-on .box-reveal-buildup {\n    animation: boxShake'),
  'CSS animation is not attached to every buildup while chests are still hidden');
assert(html.includes('.box-reveal-buildup.is-shaking'),
  'CSS shake is a fallback class, not the visibility-hidden default');
assert(html.includes('Android WebView drops CSS and WAAPI') || html.includes('visibility-hidden'),
  'the buried WebView visibility bug is documented next to the chest CSS');

assert(html.includes('id="boxPrizeCard"') && html.includes('id="boxPrizeName"') && html.includes('id="boxPrizeBody"'),
  'prize card is pre-mounted in the overlay');
assert(html.includes('id="boxPrizeBurst"') && html.includes('id="boxPrizeUnique"'),
  'burst flashes are pre-mounted');
assert(html.includes('shop-behind-box'), 'shop can hide without a rebuild');

const starterOpen = html.slice(html.indexOf('function openInventoryBox'), html.indexOf('function openShopModal'));
assert(starterOpen.includes('queueBoxOpenWork'), 'starter box uses the same yielded open');
assert(starterOpen.includes('coverBoxRevealOverlay'), 'starter cover starts the shake via the shared helper');
assert(html.includes('openInventoryBox(box)'), 'Inventory Open Box button routes through the shared opener');

assert(html.includes('3.4.21'), 'About version bumped for v5.4');

const matIconHtml = vm.runInContext('matIconHtml', ctx);
const shardSvg = matIconHtml('shards', 'boost');
assert(shardSvg.includes('<svg'), 'boost shards render as SVG, not an img');
assert(shardSvg.includes('M12 2l6.5 9.2L12 22 5.5 11.2 12 2z'), 'boost shards keep the diamond');
assert(!shardSvg.includes('item-photo'), 'shard HTML is not a gear photo tag');

console.log('v5.4 tests ok — WAAPI chest shake, premounted fade-in prize, shard icon is SVG-only');
