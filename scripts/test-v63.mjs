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

function sliceLib(name) {
  const begin = html.indexOf(`/* === ${name} begin === */`);
  const end = html.indexOf(`/* === ${name} end === */`);
  assert(begin >= 0 && end > begin, name + ' markers missing');
  return html.slice(begin, end);
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

const starCtx = { console, Math };
vm.createContext(starCtx);
vm.runInContext(sliceLib('item-catalog-lib'), starCtx);
const two = starCtx.starRowHtml({ permanent: true }, 0, { star: 0, starCap: 2 });
assert(!(two.match(/star-on/g) || []).length, 'fresh 2-star items spawn with no filled stars');
assert((two.match(/star-off/g) || []).length === 2, '2-star spawn shows two gray headroom stars');
const unique = starCtx.starRowHtml({ permanent: true, unique: true }, 5, { star: 5, starCap: 5 });
assert((unique.match(/star-on/g) || []).length === 5, 'unique items can show five filled stars after enchanting');
assert(!(unique.match(/star-off/g) || []).length, 'unique 5-star filled row has no empty marks');
const zero = starCtx.starRowHtml({ permanent: true }, 0, { star: 0, starCap: 0 });
assert(zero === '', '0-star items have no star row');
const enchanted = starCtx.starRowHtml({ permanent: true }, 1, { star: 1, starCap: 2 });
assert((enchanted.match(/star-on/g) || []).length === 1, 'enchanting fills one star of headroom');
assert((enchanted.match(/star-off/g) || []).length === 1, 'remaining headroom stays gray');

assert(html.includes('3.4.22'), 'About version bumped for v6.3 / v6.4');

console.log('v6.3 tests ok — popup clamps after render, materials do not idle-glow, stars distinguish filled vs empty');
