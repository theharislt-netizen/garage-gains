#!/usr/bin/env node
/**
 * v4.9: RPG shop storefront — tiles with art + descriptions, no owned
 * inventory, app-matched Buy buttons, equal-priced distinct boxes.
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
const SHOP_BOX_PRICE = vm.runInContext('SHOP_BOX_PRICE', ctx);
const SHOP_BOX_COPY = vm.runInContext('SHOP_BOX_COPY', ctx);
const {
  boxesPricedEqually,
  shopBoxArtSvg,
  shopSupplyArtSvg,
  shopStorefrontItems,
} = ctx;

assert(SHOP_BOX_PRICE === 80, 'shared box price should be a round gold amount');
assert(boxesPricedEqually({ boost: SHOP_BOX_PRICE, relic: SHOP_BOX_PRICE }), 'equal costs pass');
assert(!boxesPricedEqually({ boost: 60, relic: 90 }), '60/90 must no longer count as equal');
assert(html.includes('const BOX_COST = { boost: SHOP_BOX_PRICE, relic: SHOP_BOX_PRICE }'),
  'Boost Box and Relic Box must share one price');

const boostArt = shopBoxArtSvg('boost');
const relicArt = shopBoxArtSvg('relic');
assert(boostArt.includes('<svg') && relicArt.includes('<svg'), 'boxes need real SVG artwork');
assert(boostArt !== relicArt, 'Boost Box and Relic Box must not share the same art');
assert(boostArt.includes('29 6l4 8') || /bolt|lightning|L29 6/i.test(boostArt), 'boost art should read as a charged crate');
assert(/shield|l8 5v7|M32 34/i.test(relicArt), 'relic art should read as an ornate chest');

const freezeArt = shopSupplyArtSvg('streakFreeze');
const boostSupply = shopSupplyArtSvg('guaranteedBoost');
assert(freezeArt.includes('<svg') && boostSupply.includes('<svg'), 'supplies need icons, not text-only labels');
assert(freezeArt !== boostSupply, 'freeze and Double Down icons must differ');

const catalog = shopStorefrontItems(
  { boost: SHOP_BOX_PRICE, relic: SHOP_BOX_PRICE },
  [
    { id: 'streakFreeze', name: 'Streak Freeze Token', cost: 350, desc: 'Protects your streak once if you miss a scheduled day.' },
    { id: 'guaranteedBoost', name: 'Guaranteed Double Down', cost: 50, desc: 'Directly grants one Double Down boost charge — no box needed.' },
  ]
);
assert(catalog.length === 4, 'storefront lists boxes + supplies');
catalog.forEach(item => {
  assert(item.name && item.desc && item.desc.length > 12, 'every SKU needs a short description: ' + item.id);
  assert(typeof item.cost === 'number' && item.cost > 0, 'every SKU needs a price: ' + item.id);
  assert(item.art, 'every SKU needs art: ' + item.id);
});
assert(catalog[0].cost === catalog[1].cost, 'the two chests must cost the same');

const shopFn = html.slice(html.indexOf('function renderShopModal()'), html.indexOf('function handleOpenBox'));
assert(shopFn.includes('shop-grid') && shopFn.includes('shop-tile'), 'shop must render a tile storefront, not a text list');
assert(shopFn.includes('shop-tile-art') && shopFn.includes('shop-tile-desc'), 'tiles carry art and description');
assert(shopFn.includes('shop-tile-${id}') || (shopFn.includes('shop-tile-boost') && shopFn.includes('shop-tile-relic')),
  'chests keep distinct visual classes');
assert(shopFn.includes('class="go-btn"'), 'Buy buttons reuse the app go-btn');
assert(!shopFn.includes('buy-btn'), 'old shop-only buy-btn must be gone');
assert(!shopFn.includes('Your Items'), 'Shop must not list owned inventory');
assert(!shopFn.includes('data-equip-perm') && !shopFn.includes('data-regrade'), 'equip/regrade stay out of the Shop');
assert(!shopFn.includes('box-card') && !shopFn.includes('direct-item-row'), 'plain list markup must be gone');
assert(SHOP_BOX_COPY.boost.desc !== SHOP_BOX_COPY.relic.desc, 'chest blurbs must differ');

assert(html.includes('id="shopModal"') && html.includes('>Store<'), 'shop modal is titled Store');
assert(html.includes('.shop-grid') && html.includes('grid-template-columns: 1fr 1fr'), 'storefront is a card grid');
assert(!/transform:\s*scale/i.test(html.slice(html.indexOf('.shop-tile {'), html.indexOf('.inv-item-row'))),
  'shop tiles must not use scale transforms');
assert(html.includes('3.4.21'), 'About version bumped for v4.9');

console.log('v4.9 tests ok — storefront tiles, no Your Items, go-btn Buy, equal distinct boxes');
