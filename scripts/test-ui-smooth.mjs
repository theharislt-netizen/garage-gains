#!/usr/bin/env node
/**
 * Box-open and Enchant entry must paint the overlay before heavy save/render
 * work, and must not use full-screen scale animations that hitch on Android.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'garage-gains.html'), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const handleOpen = html.slice(html.indexOf('function handleOpenBox'), html.indexOf('function getBoxRevealTier'));
assert(handleOpen.includes('showBoxReveal(category, outcome)'), 'box tap still opens the reveal');
const openOnly = handleOpen.slice(handleOpen.indexOf('function handleOpenBox'), handleOpen.indexOf('function dismissBoxReveal'));
assert(!openOnly.includes('renderShopModal()'), 'opening a box must not rebuild the shop under the overlay');
assert(!openOnly.includes('save()'), 'save waits until dismiss, not the open tap');
assert(openOnly.includes('coverBoxRevealOverlay'), 'tap paints a cover before loot');
assert(openOnly.indexOf('coverBoxRevealOverlay') < openOnly.indexOf('openBoxFree'), 'loot waits until after the overlay cover');
const revealAt = handleOpen.indexOf('showBoxReveal');
const saveAt = handleOpen.indexOf('save()');
assert(revealAt >= 0 && saveAt > revealAt, 'save must not run before the overlay is shown');
assert(!handleOpen.includes('renderHeader()'), 'opening a box must not rebuild the sticky header on the tap');

const openBoxFn = html.slice(html.indexOf('function openBox(category)'), html.indexOf('const REGRADE_SAFE_CEILING'));
assert(!openBoxFn.includes('renderHeader()'), 'openBox itself must not render the header');
assert(!openBoxFn.includes('save()'), 'openBox defers persist so the overlay can paint first');

const revealClose = html.slice(html.indexOf('overlay.onclick = (e) =>'), html.indexOf('}, meta.buildMs);'));
assert(revealClose.includes('dismissBoxReveal()'), 'tap still dismisses the reveal');
assert(!revealClose.includes('renderShopModal()'), 'dismiss tap must not rebuild the shop on the same frame');
assert(!revealClose.includes('renderHeader()'), 'dismissing a box must not rebuild the whole header');
assert(handleOpen.includes('hideBoxRevealOverlay'), 'dismiss hides the overlay immediately');
assert(!handleOpen.includes('renderShopModal()'), 'dismiss must not rebuild the shop');
assert(!handleOpen.includes('renderInventoryTab()'), 'dismiss must not rebuild inventory on the hide frame');

const starterOpen = html.slice(html.indexOf("id=\"itemDetailOpenBoxBtn\""), html.indexOf('if (target.kind === \'permanent\')'));
assert(starterOpen.includes('showBoxReveal'), 'starter box still uses the reveal');
assert(starterOpen.includes('coverBoxRevealOverlay'), 'starter open covers the screen first');
assert(starterOpen.indexOf('coverBoxRevealOverlay') < starterOpen.indexOf('openStarterVictoryBox'), 'starter loot waits until the overlay is on');
assert(!starterOpen.includes('renderHeader()'), 'starter box must not rebuild the header under the overlay');

const openEnchant = html.slice(html.indexOf('function openEnchantModal()'), html.indexOf('function closeEnchantModal()'));
assert(openEnchant.includes('renderEnchantModal()'), 'enchant still mounts the table');
assert(openEnchant.includes("win.style.display = 'block'"), 'enchant window still takes over');
assert(openEnchant.indexOf('renderEnchantModal()') < openEnchant.indexOf("win.style.display = 'block'"), 'build the table before showing the window');
assert(!openEnchant.includes('offsetWidth'), 'must not force a layout flush to restart the book animation');
assert(html.includes('translateY(10px)') && html.includes('enchantBookOpen'), 'enchant entry is a short fade/slide, not a page-scale');
assert(!html.includes('scaleX(0.25)'), 'enchant must not scale the whole window');
assert(!html.includes('enchantTableShimmer'), 'enchant table must not keep a spinning conic-gradient');
assert(!html.includes('transform: scale(2.6)'), 'box burst must not scale a full-screen flash');

console.log('ui-smooth tests ok — box overlay paints first, enchant entry is a fade');
