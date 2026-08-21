#!/usr/bin/env node
/**
 * v5.1: box-open overlay paints before loot/SFX, and relic/boost icons
 * match the previous equipment/glyph language. Material icons stay put.
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
vm.runInContext(sliceLib('item-catalog-lib'), ctx);

const {
  coverBoxRevealOverlay,
  paintBoxRevealOverlay,
  hideBoxRevealOverlay,
  boxRevealBuildupHtml,
  itemIconSvg,
  matIconSvg,
  ITEMS_CATALOG,
} = Object.assign({
  coverBoxRevealOverlay: ctx.coverBoxRevealOverlay,
  paintBoxRevealOverlay: ctx.paintBoxRevealOverlay,
  hideBoxRevealOverlay: ctx.hideBoxRevealOverlay,
  boxRevealBuildupHtml: ctx.boxRevealBuildupHtml,
  itemIconSvg: ctx.itemIconSvg,
  matIconSvg: ctx.matIconSvg,
}, ctx);
const catalog = vm.runInContext('ITEMS_CATALOG', ctx);

const overlay = { classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(...cs) { cs.forEach(c => this._s.delete(c)); }, contains(c) { return this._s.has(c); } }, onclick: 'keep' };
const content = { html: '', querySelector(sel) { return sel === '#boxBuildupIcon' && this.html.includes('box-reveal-buildup') ? {} : null; }, set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; } };

assert(coverBoxRevealOverlay(overlay) === true, 'cover helper returns true');
assert(overlay.classList.contains('box-reveal-on'), 'cover makes the overlay visible');
assert(!overlay.classList.contains('unique-reveal'), 'cover is not the unique flash');
assert(overlay.onclick === null, 'cover disables skip-taps during buildup');

assert(paintBoxRevealOverlay(overlay, content, 'boost', () => '<svg id="chest"></svg>'), 'paint writes the chest');
assert(content.html.includes('box-reveal-buildup') && content.html.includes('id="chest"'), 'paint uses chest art');
const before = content.html;
paintBoxRevealOverlay(overlay, content, 'boost', () => '<svg id="other"></svg>');
assert(content.html === before, 'a second paint must not restart the shake SVG');

hideBoxRevealOverlay(overlay);
assert(!overlay.classList.contains('box-reveal-on'), 'hide returns the overlay to idle');

assert(html.includes('#boxRevealOverlay.box-reveal-on'), 'overlay uses a visibility class, not display:none');
assert(!html.includes('id="boxRevealOverlay" class="ob-overlay" style="display:none'),
  'overlay must stay in flex layout so the first open is not a display hitch');

const openFn = html.slice(html.indexOf('function handleOpenBox'), html.indexOf('function dismissBoxReveal'));
assert(openFn.indexOf('coverBoxRevealOverlay') < openFn.indexOf('openBoxFree'),
  'tap frame covers the shop before rolling loot');
assert(openFn.indexOf('coverBoxRevealOverlay') < openFn.indexOf('openBoxFree'),
  'cover is synchronous on the tap');
assert(openFn.includes('queueBoxOpenWork') || openFn.includes('afterPaint') || openFn.includes('setTimeout'),
  'loot waits off the tap thread');
assert(!openFn.includes('paintBoxRevealOverlay'), 'tap must not write chest innerHTML');

const showFn = html.slice(html.indexOf('function showBoxReveal'), html.indexOf('document.getElementById(\'shopModalClose\')'));
assert(showFn.includes('feedbackBoxOpen(tier)'), 'SFX still plays');
assert(!showFn.includes('afterPaint(() => feedbackBoxOpen(tier))'), 'SFX is not gated on afterPaint');

const SHARD_PATH = 'M12 2l6.5 9.2L12 22 5.5 11.2 12 2z';
const STONE_PATH = 'M12 2l8 6v8l-8 6-8-6V8l8-6z';
assert(matIconSvg('shards', 'boost').includes(SHARD_PATH), 'boost shards keep the v5.0 diamond');
assert(matIconSvg('shards', 'relic').includes(SHARD_PATH), 'relic shards keep the v5.0 diamond');
assert(matIconSvg('stone', 'boost').includes(STONE_PATH), 'boost stones keep the v5.0 hex');
assert(matIconSvg('stone', 'relic').includes(STONE_PATH), 'relic stones keep the v5.0 hex');

catalog.forEach(t => {
  const svg = itemIconSvg(t.id);
  assert(svg.includes('<svg'), t.id + ' still has a dedicated icon');
  assert(/stroke-width="1\.8"|fill="currentColor"/.test(svg),
    t.id + ' should use the previous 1.8-stroke / filled-glyph language');
});
assert(itemIconSvg('legendaryDumbbell').includes('rect x="3.2" y="4.2"'),
  'Iron Sovereign uses RPG boots with plate weights');
assert(itemIconSvg('grindersChair').includes('M7.2 7.4 12 5.4') && itemIconSvg('grindersChair').includes('M8.2 4.4v4'),
  'Throne of the Grind uses a chestplate silhouette');
assert(itemIconSvg('featherweightWraps').includes('M7 11h10v8.2H7z'),
  'Windrider Wraps use a gauntlet silhouette');
assert(itemIconSvg('doubleDown').includes('fill="currentColor"'),
  'Double Down stays a filled bolt like the previous set');
assert(itemIconSvg('firstLight') !== itemIconSvg('ironFocus'), 'new items still have distinct icons');

assert(html.includes('3.4.16'), 'About version bumped for v5.1');

console.log('v5.1 tests ok — overlay paints first, item icons match previous language, materials unchanged');
