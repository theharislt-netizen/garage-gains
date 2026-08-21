#!/usr/bin/env node
/**
 * v5.0: shared 0–4 star pool vs unique 5-star roster, weighted drops,
 * enchant-effect items, custom icons, colored shards/stones, unique glow
 * and legendary reveal.
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

function rngFrom(values) {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i += 1;
    return v;
  };
}

const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(sliceLib('item-catalog-lib'), ctx);
vm.runInContext(sliceLib('first-run-unlock-lib'), ctx);

const REGULAR_MAX_STAR = vm.runInContext('REGULAR_MAX_STAR', ctx);
const UNIQUE_STAR = vm.runInContext('UNIQUE_STAR', ctx);
const REGULAR_STAR_WEIGHTS = vm.runInContext('REGULAR_STAR_WEIGHTS', ctx);
const REGULAR_STAR_TIERS = vm.runInContext('REGULAR_STAR_TIERS', ctx);
const UNIQUE_ITEM_CHANCE = vm.runInContext('UNIQUE_ITEM_CHANCE', ctx);
const ITEMS_CATALOG = vm.runInContext('ITEMS_CATALOG', ctx);
const {
  itemTemplate,
  itemIconSvg,
  matIconSvg,
  isUniqueItem,
  itemMaxStar,
  rollRegularStar,
  grantStarForTemplate,
  pickBoxItemTemplate,
  starGlowClass,
  itemRevealTier,
  itemBonusPercent,
  itemBonusStatLabel,
} = ctx;

assert(REGULAR_MAX_STAR === 4, 'regular pool caps at 4');
assert(UNIQUE_STAR === 5, 'uniques are 5-star');
assert(UNIQUE_ITEM_CHANCE < 0.15 && UNIQUE_ITEM_CHANCE > 0, 'uniques stay rarer than the 0–4 curve');
assert(REGULAR_STAR_TIERS.join(',') === '0,2,3,4', 'spawn tiers skip 1-star');
assert(REGULAR_STAR_WEIGHTS.length === 4, 'weights cover 0, 2, 3, and 4 star');
for (let i = 1; i < REGULAR_STAR_WEIGHTS.length; i++) {
  assert(REGULAR_STAR_WEIGHTS[i] < REGULAR_STAR_WEIGHTS[i - 1],
    `tier ${REGULAR_STAR_TIERS[i]} must be rarer than tier ${REGULAR_STAR_TIERS[i - 1]}`);
}

assert(rollRegularStar(() => 0.01) === 0, 'low rolls land on 0-star');
assert(rollRegularStar(() => 0.999) === 4, 'high rolls can still hit 4-star');

const regulars = ITEMS_CATALOG.filter(t => t.permanent && !t.unique);
const uniques = ITEMS_CATALOG.filter(t => t.permanent && t.unique);
assert(regulars.length >= 8, 'shared 0–4 roster should be the majority');
assert(uniques.length >= 3, 'unique 5-star roster exists');
regulars.forEach(t => {
  assert(t.maxStar === 4 && !t.unique, t.id + ' is a shared-pool regular');
  assert(itemMaxStar(t) === 4, t.id + ' itemMaxStar is 4');
  assert(grantStarForTemplate(t, () => 0.01) === 0, t.id + ' can roll 0-star');
});
uniques.forEach(t => {
  assert(t.unique === true && t.maxStar === 5, t.id + ' is a unique 5-star');
  assert(isUniqueItem(t) === true, t.id + ' isUniqueItem');
  assert(grantStarForTemplate(t, () => 0) === 5, t.id + ' always grants at 5');
  assert(itemRevealTier(t, 5) === 'unique', t.id + ' reveal is unique');
});

const pool = ITEMS_CATALOG.filter(t => !t.starterOnly);
const uniquePick = pickBoxItemTemplate(pool, rngFrom([0.01, 0]));
assert(uniquePick && uniquePick.unique, 'rng below UNIQUE_ITEM_CHANCE can return a unique');
const regularPick = pickBoxItemTemplate(pool, rngFrom([0.5, 0.01, 0.01]));
assert(regularPick && !regularPick.unique, 'rng above UNIQUE_ITEM_CHANCE stays in the 0–4 pool');

assert(starGlowClass(5, false) === 'star-glow-5', '5-star glow class');
assert(starGlowClass(4, true) === 'star-glow-5', 'unique flag forces 5-star glow');
assert(starGlowClass(4, false) === 'star-glow-4', '4-star keeps accent glow');
assert(starGlowClass(3, false) === 'star-glow-3', '3-star has a quieter glow');
assert(itemRevealTier({ permanent: true }, 4) === 'rare', '4-star regulars are rare, not unique');
assert(itemRevealTier({ permanent: true }, 0) === 'common', '0-star regulars are common');

const boostShard = matIconSvg('shards', 'boost');
const relicShard = matIconSvg('shards', 'relic');
const boostStone = matIconSvg('stone', 'boost');
const relicStone = matIconSvg('stone', 'relic');
assert(boostShard !== relicShard, 'Relic and Boost shards must differ by color class');
assert(boostStone !== relicStone, 'Relic and Boost stones must differ by color class');
assert(boostShard.includes('mat-boost') && relicShard.includes('mat-relic'), 'shard pair uses boost/relic color classes');
assert(boostStone.includes('mat-boost') && relicStone.includes('mat-relic'), 'stone pair uses boost/relic color classes');
const shardPaths = [...boostShard.matchAll(/d="([^"]+)"/g)].map(m => m[1]).join('|');
const relicShardPaths = [...relicShard.matchAll(/d="([^"]+)"/g)].map(m => m[1]).join('|');
assert(shardPaths === relicShardPaths && shardPaths.length > 0, 'shards share the same silhouette');
const stonePaths = [...boostStone.matchAll(/d="([^"]+)"/g)].map(m => m[1]).join('|');
const relicStonePaths = [...relicStone.matchAll(/d="([^"]+)"/g)].map(m => m[1]).join('|');
assert(stonePaths === relicStonePaths && stonePaths.length > 0, 'stones share the same silhouette');
assert(shardPaths !== stonePaths, 'shards and stones are different shapes');

ITEMS_CATALOG.forEach(t => {
  const svg = itemIconSvg(t.id);
  assert(svg.includes('<svg'), t.id + ' needs a dedicated SVG icon');
});

['hexwick', 'lorequill', 'cinderAnvil', 'spellboundChisel'].forEach(id => {
  const t = itemTemplate(id);
  assert(t, id + ' must exist');
  assert(t.effectType === 'enchantSuccess' || t.effectType === 'enchantXp', id + ' ties into enchanting');
});
assert(itemBonusStatLabel(itemTemplate('hexwick')) === 'Enchant success');
assert(itemBonusStatLabel(itemTemplate('lorequill')) === 'Enchant XP');
assert(itemBonusStatLabel(itemTemplate('lastEmber')) === 'Enchant success');

const charm = itemTemplate('wornCharm');
assert(charm && charm.starterOnly, 'wornCharm stays the starter relic');
assert(charm.baseValue === 0.02, 'starter relic base value unchanged');
assert(itemBonusPercent(charm, 0) === 2, '0-star charm is still +2%');
assert(itemBonusPercent(charm, 1) === 3.2, '1-star charm is still +3.2%');

assert(html.includes('.star-glow-5'), '5-star unique glow CSS exists');
assert(html.includes('unique-reveal'), 'legendary overlay class exists');
assert(html.includes('boxUniqueFlash') || html.includes('@keyframes boxUniqueFlash'), 'unique flash keyframes exist');
assert(html.includes('A unique has awakened'), 'unique pulls get dedicated reveal copy');
assert(html.includes("tier === 'legendary' || tier === 'unique'"), 'unique pulls use the legendary SFX');
assert(html.includes("equippedBonusFor('enchantSuccess')"), 'enchant success items feed fail chance');
assert(html.includes("equippedBonusFor('enchantXp')"), 'enchant XP items feed skill XP');
assert(html.includes('pickBoxItemTemplate(items)'), 'box item rolls use the unique/regular split');
assert(html.includes('grantStarForTemplate(tmpl)'), 'grants roll stars from the shared pool');

const revealFn = html.slice(html.indexOf('function getBoxRevealTier'), html.indexOf('const BOX_TIER_META'));
assert(revealFn.includes('itemRevealTier(tmpl, star)'), 'reveal tier uses the rolled star, not the template ceiling');
assert(!revealFn.includes('tmpl.maxStar') || revealFn.includes('outcome.kind === \'stone\''),
  'item reveals must not key off tmpl.maxStar');

const glow5At = html.indexOf('.inv-slot.star-glow-5');
const glow5 = html.slice(glow5At, html.indexOf('.inv-slot .star-row'));
assert(!/transform:\s*scale/i.test(glow5), '5-star glow must not use transform scale');
const uniqueCss = html.slice(html.indexOf('#boxRevealOverlay.unique-reveal'), html.indexOf('@keyframes tierPulse'));
assert(!/transform:\s*scale/i.test(uniqueCss), 'unique flash/glow must not use transform scale');

const craftFn = html.slice(html.indexOf('function renderEnchantModal'), html.indexOf('function renderShopModal'));
assert(craftFn.includes("matIconHtml('shards', 'relic')"), 'relic shard craft uses the colored shard icon');
assert(craftFn.includes("matIconHtml('shards', 'boost')"), 'boost shard craft uses the colored shard icon');
assert(!craftFn.includes('🔹') && !craftFn.includes('💠'), 'craft UI must not use identical emoji for both types');
assert(craftFn.includes('itemVisualHtml(t, p') || craftFn.includes('itemIconHtml(t)'), 'enchant picker uses dedicated item icons');

assert(html.includes('3.4.24'), 'About version bumped for v5.0');

console.log('v5.0 tests ok — shared 0–4 pool, unique roster, weighted stars, enchant items, icons, unique glow/reveal');
