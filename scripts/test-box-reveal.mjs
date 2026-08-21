#!/usr/bin/env node
/**
 * Box-open overlay: chest art on the shake, item stays visible after the
 * burst, tap-to-close is immediate, and Buy cannot fire another box while
 * the overlay (or its ghost-click guard) is active.
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

const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(sliceLib('v49-helpers-lib'), ctx);
vm.runInContext(sliceLib('box-reveal-lib'), ctx);

const { boxRevealIsBusy, boxRevealDismissGuardMs, boxBuildupInnerHtml, shopBoxArtSvg } = ctx;

assert(boxRevealDismissGuardMs() >= 300, 'ghost-click guard must cover the synthetic click delay');
assert(boxRevealIsBusy(100, true, 0) === true, 'open overlay blocks another buy');
assert(boxRevealIsBusy(100, false, 200) === true, 'post-dismiss window still blocks');
assert(boxRevealIsBusy(300, false, 200) === false, 'after the guard, buys work again');
assert(boxRevealIsBusy(0, false, 0) === false, 'idle shop is not blocked');

const boostArt = boxBuildupInnerHtml('boost', shopBoxArtSvg);
const relicArt = boxBuildupInnerHtml('relic', shopBoxArtSvg);
assert(boostArt.includes('<svg'), 'boost open uses the chest SVG, not the loot emoji');
assert(relicArt.includes('<svg'), 'relic open uses the chest SVG, not the loot emoji');
assert(boostArt !== relicArt, 'boost and relic chests stay visually distinct');
assert(boxBuildupInnerHtml('starter', shopBoxArtSvg) === '📦', 'starter box keeps the victory-box icon');

const handleOpen = html.slice(html.indexOf('function handleOpenBox'), html.indexOf('function getBoxRevealTier'));
assert(handleOpen.includes('boxRevealIsBusy'), 'Buy is ignored while the overlay is up');
assert(handleOpen.includes('showBoxReveal(category, outcome)'), 'box tap still opens the reveal');
assert(handleOpen.includes('coverBoxRevealOverlay'), 'tap paints the overlay cover first');
assert(handleOpen.indexOf('coverBoxRevealOverlay') < handleOpen.indexOf('openBoxFree'),
  'loot must wait until the overlay cover is on screen');
assert(!handleOpen.slice(handleOpen.indexOf('function handleOpenBox'), handleOpen.indexOf('function dismissBoxReveal')).includes('renderShopModal()'),
  'opening a box must not rebuild the shop under the overlay');
assert(handleOpen.includes('function dismissBoxReveal'), 'dismiss is a dedicated closer');
assert(handleOpen.includes('hideBoxRevealOverlay'), 'dismiss hides via the idle class, not a display:none hitch');
assert(handleOpen.indexOf('showBoxReveal') < handleOpen.indexOf('save()'), 'save waits until the overlay is gone');

const showFn = html.slice(html.indexOf('function showBoxReveal'), html.indexOf('document.getElementById(\'shopModalClose\')'));
assert(showFn.includes('paintBoxRevealOverlay'), 'build-up renders the chest, not the prize');
assert(showFn.includes('afterPaint(() => feedbackBoxOpen(tier))'), 'open SFX waits until after the overlay paints');
assert(showFn.includes('dismissBoxReveal()'), 'tap routes through the guarded dismiss');
assert(showFn.includes('Tap to close'), 'reveal tells you how to dismiss');
assert(showFn.includes('e.stopPropagation()'), 'overlay tap must not fall through to Buy');

const burstRuleAt = html.indexOf('.box-reveal-card .rarity-burst');
const burstRule = html.slice(burstRuleAt, html.indexOf('}', burstRuleAt) + 1);
assert(burstRule.includes('boxItemIn'), 'prize icon fades in and stays');
assert(!burstRule.includes('ruBurst'), 'prize icon must not use the fade-to-zero burst');
assert(html.includes('@keyframes boxItemIn'), 'item-in keyframes exist');
assert(!/transform:\s*scale/i.test(html.slice(html.indexOf('@keyframes boxItemIn'), html.indexOf('@keyframes boxBurstFlash'))),
  'item-in must not scale');

assert(html.includes("showBoxReveal('starter'"), 'starter box uses the starter build-up, not a shop chest');
assert(html.includes('3.4.9'), 'About version bumped for the box-open fix');

console.log('box-reveal tests ok — chest art on open, prize stays visible, Buy guarded after dismiss');
