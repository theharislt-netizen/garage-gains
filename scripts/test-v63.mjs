#!/usr/bin/env node
/**
 * v6.3: item-detail popup must render then clamp on screen; material slots
 * must not idle-glow; star rows must show filled vs empty distinctly.
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

function sliceFn(name, nextName) {
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf(`function ${nextName}(`);
  assert(start >= 0 && end > start, name + ' function missing');
  return html.slice(start, end);
}

const posFn = sliceFn('positionItemDetailPopup', 'finishItemDetailRender');
assert(!posFn.includes('rect.top > 220'), 'popup must not pin with unconstrained bottom from a 220px heuristic');
assert(!/popup\.style\.bottom\s*=\s*\(window\.innerHeight/.test(posFn), 'popup must not grow upward via bottom anchoring');
assert(posFn.includes('appSafeTop'), 'popup top is clamped below the status-bar safe area');
assert(posFn.includes('nav.tabbar'), 'popup bottom is clamped above the tab bar');
assert(posFn.includes("popup.style.bottom = 'auto'"), 'popup uses top positioning only');

const openFn = sliceFn('openItemDetailModal', 'closeItemDetailModal');
assert(openFn.includes('renderItemDetailModal()'), 'popup content is rendered before measuring');
assert(!openFn.includes('positionItemDetailPopup'), 'open does not position an empty popup');
assert(html.includes('finishItemDetailRender()'), 'position runs after the card HTML is in the DOM');

const popupRuleAt = html.indexOf('#itemDetailPopup {');
assert(popupRuleAt >= 0, 'item detail popup rule exists');
const popupRule = html.slice(popupRuleAt, html.indexOf('}', popupRuleAt) + 1);
assert(popupRule.includes('max-height'), 'popup has a viewport max-height so the photo cannot clip off-screen');

const matSlots = html.slice(html.indexOf('const matSlots ='), html.indexOf('const filledCount'));
assert(!matSlots.includes('unlock-pulse'), 'material slots must not carry the standing unlock glow');
assert(!matSlots.includes('shouldFlashItemType'), 'material slots are not new-item flash targets');
assert(matSlots.includes('data-slot-mat'), 'materials still render as tappable slots');

assert(html.includes('.star-on') && html.includes('.star-off'), 'filled and empty stars have distinct classes');
const starRowRuleAt = html.indexOf('.star-row {');
const starRowRule = html.slice(starRowRuleAt, html.indexOf('}', starRowRuleAt) + 1);
assert(!starRowRule.includes('color: var(--gain)'), 'the star row itself must not paint empty stars gold');

const starStart = html.indexOf('function starRowHtml');
const starEnd = html.indexOf('const ITEMS_CATALOG');
assert(starStart >= 0 && starEnd > starStart, 'starRowHtml is present');
const starCtx = {
  itemMaxStar(tmpl) { return tmpl && tmpl.unique ? 5 : 4; },
  Number,
  Math,
};
vm.createContext(starCtx);
vm.runInContext(html.slice(starStart, starEnd), starCtx);
const two = starCtx.starRowHtml({ permanent: true }, 2);
assert(two.includes('star-on') && two.includes('star-off'), '2-star items render both filled and empty marks');
assert((two.match(/star-on/g) || []).length === 2, '2-star row has two filled stars');
assert((two.match(/star-off/g) || []).length === 2, '2-star row has two empty stars up to max 4');
const unique = starCtx.starRowHtml({ permanent: true, unique: true }, 5);
assert((unique.match(/star-on/g) || []).length === 5, 'unique items show five filled stars');
assert(!(unique.match(/star-off/g) || []).length, 'unique 5-star row has no empty marks');
const zero = starCtx.starRowHtml({ permanent: true }, 0);
assert((zero.match(/star-off/g) || []).length === 4, '0-star still shows four empty marks');

assert(html.includes('3.4.19'), 'About version bumped for v6.3 / v6.4');

console.log('v6.3 tests ok — popup clamps after render, materials do not idle-glow, stars distinguish filled vs empty');
