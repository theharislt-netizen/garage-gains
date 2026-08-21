#!/usr/bin/env node
/**
 * v5.4: buying/opening a box must not hitch once the chest is on screen.
 * Cover is class-only on the tap, loot waits for a committed paint + idle,
 * reveal must not recast cover classes (that restarted the shake), and the
 * prize card is pre-mounted so the burst does not rewrite overlay HTML.
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
vm.runInContext(sliceLib('box-reveal-lib'), ctx);
const queueBoxOpenWork = vm.runInContext('queueBoxOpenWork', ctx);
const afterPaint = vm.runInContext('afterPaint', ctx);
assert(typeof queueBoxOpenWork === 'function', 'open work is queued off the tap');
assert(typeof afterPaint === 'function', 'queue waits for a committed frame');

const lib = sliceLib('box-reveal-lib');
assert(lib.includes('function queueBoxOpenWork'), 'queue helper lives with the overlay');
assert((lib.match(/requestAnimationFrame/g) || []).length >= 2, 'queue still waits two frames');

const openFn = html.slice(html.indexOf('function handleOpenBox'), html.indexOf('function dismissBoxReveal'));
assert(openFn.includes('coverBoxRevealOverlay(overlay, category)'), 'tap still covers first');
assert(openFn.includes('queueBoxOpenWork'), 'loot is not a raw 110ms dump during the shake');
assert(openFn.indexOf('coverBoxRevealOverlay') < openFn.indexOf('openBoxFree'),
  'loot still waits until after the cover class');
assert(!openFn.includes('paintBoxRevealOverlay'), 'tap must not write chest innerHTML');
assert(!openFn.includes('innerHTML'), 'tap must not rebuild overlay markup');
assert(!openFn.includes('save()'), 'tap must not persist');
assert(!openFn.includes('renderShopModal'), 'tap must not rebuild the shop');
assert(!openFn.includes('feedbackBoxOpen'), 'SFX is not on the tap');
assert(!openFn.includes('refreshHeaderCurrency()') || openFn.indexOf('queueBoxOpenWork') < openFn.indexOf('refreshHeaderCurrency()'),
  'gold chips wait until after the cover yields');
assert(openFn.includes('coverShopForBoxReveal(true)'), 'shop stops painting under the chest');

const showFn = html.slice(html.indexOf('function showBoxReveal'), html.indexOf('document.getElementById(\'shopModalClose\')'));
assert(!showFn.includes('coverBoxRevealOverlay'), 'reveal must not recast cover classes mid-shake');
assert(!showFn.includes('prize.innerHTML') && !showFn.includes('prizeHtml'),
  'prize is not rebuilt with innerHTML');
assert(showFn.includes('fillBoxRevealPrize'), 'prize fills premounted nodes');
assert(showFn.includes('feedbackBoxOpen(tier)'), 'SFX still plays, just after the prize');
assert(showFn.includes('scheduleIdleWork'), 'SFX is idle-deferred off the prize frame');

assert(html.includes('id="boxPrizeCard"') && html.includes('id="boxPrizeName"') && html.includes('id="boxPrizeBody"'),
  'prize card is pre-mounted in the overlay');
assert(html.includes('id="boxPrizeBurst"') && html.includes('id="boxPrizeUnique"'),
  'burst flashes are pre-mounted');
assert(html.includes('shop-behind-box'), 'shop can hide without a rebuild');
assert(!html.includes('#boxRevealOverlay .box-art-boost,\n  #boxRevealOverlay .box-art-relic,\n  #boxRevealOverlay .box-art-starter { display: none; }')
  && !html.includes('.box-art-starter { display: none; }'),
  'chests must not toggle display:none on open');
assert(html.includes('visibility: visible; opacity: 1'),
  'the active chest fades in instead of mounting');
assert(html.includes('#boxRevealOverlay.box-reveal-on .box-reveal-buildup') && html.includes('animation: boxShake'),
  'shake runs on the visible overlay, not only while the chest is display-toggled');
assert(!html.includes('filter: drop-shadow(0 0 8px var(--a1))'),
  'rare pulse must not use filter:drop-shadow');

const starterOpen = html.slice(html.indexOf("id=\"itemDetailOpenBoxBtn\""), html.indexOf('if (target.kind === \'permanent\')'));
assert(starterOpen.includes('queueBoxOpenWork'), 'starter box uses the same yielded open');
assert(starterOpen.indexOf('coverBoxRevealOverlay') < starterOpen.indexOf('openStarterVictoryBox'),
  'starter loot waits until the overlay is on');

assert(html.includes('3.4.15'), 'About version bumped for v5.4');

console.log('v5.4 tests ok — box open yields a frame, no mid-shake recast, premounted prize');
