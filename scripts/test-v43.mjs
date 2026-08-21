#!/usr/bin/env node
/**
 * v4.3: Enchant Continue stays on-screen, reward SFX, Settings cleanup,
 * Rank claimed-button state, box XOR + modest item-rate bump, daily gold
 * review, Quick-Log FAB scroll collapse.
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

// 1. Enchant Continue is pinned outside the scroll region, overlay is fixed.
assert(html.includes('enchant-results-scroll'), 'enchant result card must scroll independently of Continue');
assert(html.includes('position: fixed') && html.includes('enchant-results'), 'enchant results overlay must be viewport-fixed');
const showEnchant = html.slice(html.indexOf('function showEnchantResults'), html.indexOf('function enchantCoachText'));
assert(showEnchant.includes('enchant-results-scroll'), 'result stats live in the scroll region');
assert(showEnchant.includes('id="enchantResultsClose"'), 'Continue button still exists');
assert(showEnchant.indexOf('enchant-results-scroll') < showEnchant.indexOf('enchantResultsClose'), 'Continue is after the scroll region');
assert(!/enchant-results-scroll[\s\S]*enchantResultsClose[\s\S]*<\/div>\s*`/.test(showEnchant.replace(/\n/g, ' ')), 'Continue must not be nested inside the scroll region');
assert(html.includes('feedbackEnchantCast') && html.includes('feedbackEnchantSuccess') && html.includes('feedbackEnchantFail'), 'enchant attempt/success/fail cues missing');

// 2. Reward SFX + mute path.
assert(html.includes('function feedbackBoxReceived'), 'receiving a box needs a cue');
assert(html.includes('function feedbackBoxOpen'), 'opening a box needs a cue');
assert(html.includes('function feedbackRewardClaim'), 'claiming a reward needs a cue');
assert(html.includes('feedbackBoxOpen(tier)'), 'box reveal must play the open cue');
assert(html.includes('feedbackBoxReceived()'), 'granting the first victory box must play the receive cue');
assert(html.includes('feedbackRewardClaim()'), 'claim buttons must play the claim cue');
assert(html.includes('if (!state.soundEnabled'), 'new tones must still respect the mute toggle');
assert(html.includes('if (!state.hapticsEnabled) return'), 'haptics must still respect the mute toggle');

// 3. Settings cleanup.
assert(!html.includes('id="addHomeBtn"'), 'Add to Home Screen must be gone');
assert(!html.includes('data-settings-sub="shortcut"'), 'A2HS Settings row must be gone');
assert(!html.includes('Danger Zone'), 'Danger Zone grouping must be gone');
assert(html.includes('data-settings-sub="about"') && html.includes('data-settings-pane="about"'), 'About is a standalone Settings entry');
const dataPane = html.slice(html.indexOf('data-settings-pane="data"'), html.indexOf('</section>', html.indexOf('data-settings-pane="data"')));
assert(dataPane.includes('id="resetBtn"') && dataPane.includes('id="exportBtn"'), 'Reset All Data belongs in the Data pane');

// 4. Rank claimed button.
assert(html.includes("go-btn${claimed ? ' claimed' : ''}"), 'claimed Rank button must get the claimed class');
assert(html.includes('.go-btn:disabled, .go-btn.claimed'), 'claimed Rank button has a themed disabled style');

// 5. Box loot XOR + modest item-rate bump.
const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(sliceLib('box-loot-lib'), ctx);
const {
  rollBoxPrimaryKind,
  rollBoxRareKind,
  estimatedBoxItemRate,
  isExclusiveBoxKind,
  boxOutcomeGrantsItemAndStone,
} = ctx;
assert(typeof estimatedBoxItemRate === 'function', 'box-loot-lib must export estimatedBoxItemRate');
assert(estimatedBoxItemRate() > 0.09 && estimatedBoxItemRate() < 0.16, 'item rate should land around 11%, not common');
assert(estimatedBoxItemRate() > 0.12 * 0.5, 'item rate must beat the old ~5–7% after sharing the 12% rare slice');
assert(isExclusiveBoxKind('item') && isExclusiveBoxKind('stone') && isExclusiveBoxKind('shards'));
assert(!boxOutcomeGrantsItemAndStone({ kind: 'item', result: { kind: 'new' } }), 'plain item outcome is exclusive');
assert(!boxOutcomeGrantsItemAndStone({ kind: 'stone', amount: 1 }), 'plain stone outcome is exclusive');
assert(boxOutcomeGrantsItemAndStone({ kind: 'item', stone: 1 }), 'item+stone combo must be detected');
assert(rollBoxPrimaryKind(() => 0) === 'shards');
assert(rollBoxPrimaryKind(() => 0.99) === 'rare');
assert(rollBoxRareKind(() => 0) === 'item');
assert(rollBoxRareKind(() => 0.99) === 'stone');
assert(html.includes('BOX_OUTCOME_WEIGHTS = { shards: 0.82, rare: 0.18 }'), 'rare slice bumped from 12% to 18%');
assert(html.includes('BOX_RARE_KIND_WEIGHTS = { item: 0.62, stone: 0.38 }'), 'items take a modest majority of the rare slice');
assert(html.includes('extraLine: \'+1 Relic Enchantment Stone\''), 'onboarding starter box still shows relic+stone');
const handleOpen = html.slice(html.indexOf('function handleOpenBox'), html.indexOf('function getBoxRevealTier'));
assert(!handleOpen.includes('extraLine'), 'shop/regular boxes must not attach a bonus stone line');
assert(html.includes('function openStarterVictoryBox'), 'starter combo path must remain');

// 6. Daily gold review (also covered by test-rank-rewards).
vm.createContext(ctx);
vm.runInContext(sliceLib('rank-rewards-lib'), ctx);
assert(ctx.getRankRewards('warrior').dailyGold === 20, 'Warrior daily gold was reviewed down from 30');
assert(ctx.getRankRewards('mythicalimmortal').dailyGold === 360, 'Immortal daily gold was reviewed down from 600');
assert(ctx.rankRewardsAreProgressive({
  warrior: ctx.getRankRewards('warrior'),
  elite: ctx.getRankRewards('elite'),
  master: ctx.getRankRewards('master'),
  grandmaster: ctx.getRankRewards('grandmaster'),
  epic: ctx.getRankRewards('epic'),
  legend: ctx.getRankRewards('legend'),
  mythic: ctx.getRankRewards('mythic'),
  mythicalhonor: ctx.getRankRewards('mythicalhonor'),
  mythicalglory: ctx.getRankRewards('mythicalglory'),
  mythicalimmortal: ctx.getRankRewards('mythicalimmortal'),
}), 'reviewed daily gold must stay strictly progressive');

// 7. Quick-Log FAB color + same scroll-collapse pattern as sticky sub.
assert(html.includes('linear-gradient(135deg, var(--a1), var(--a2))'), 'FAB needs accent color treatment');
assert(html.includes('function setStickyCollapsed'), 'FAB and sticky sub must share one collapse helper');
assert(html.includes('quickLogFab') && html.includes('setStickyCollapsed(true)'), 'scroll-down must collapse the FAB via the shared helper');
assert(html.includes('.quick-log-fab.collapsed'), 'FAB collapsed visual matches the hide-on-scroll-down pattern');

console.log('v4.3 tests ok — enchant Continue, SFX, Settings, claimed Rank, box XOR, daily gold, FAB scroll');
