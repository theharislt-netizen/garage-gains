#!/usr/bin/env node
/**
 * Rank tab must show current perks and a ladder of every rank's rewards.
 * Higher ranks must pay strictly more.
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

assert(html.includes('Your Rank Rewards'), 'Rank tab must show current rank rewards');
assert(html.includes('All Rank Rewards'), 'Rank tab must list every rank\'s rewards');
assert(html.includes('formatRankRewardSummary'), 'ladder summaries must exist');

const begin = html.indexOf('/* === rank-rewards-lib begin === */');
const end = html.indexOf('/* === rank-rewards-lib end === */');
assert(begin >= 0 && end > begin, 'rank-rewards-lib markers missing');

const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(html.slice(begin, end), ctx);

const {
  getRankRewards,
  formatWeeklyBoxLabel,
  formatRankRewardSummary,
  rankRewardDetailRows,
  rankGoldPerkMultiplierFromPct,
  rankRewardsAreProgressive,
} = ctx;

function getTable() {
  return getRankRewards('warrior') && {
    warrior: getRankRewards('warrior'),
    elite: getRankRewards('elite'),
    master: getRankRewards('master'),
    grandmaster: getRankRewards('grandmaster'),
    epic: getRankRewards('epic'),
    legend: getRankRewards('legend'),
    mythic: getRankRewards('mythic'),
    mythicalhonor: getRankRewards('mythicalhonor'),
    mythicalglory: getRankRewards('mythicalglory'),
    mythicalimmortal: getRankRewards('mythicalimmortal'),
  };
}

const table = getTable();
assert(rankRewardsAreProgressive(table), 'each rank must pay more than the last');

const warrior = getRankRewards('warrior');
const immortal = getRankRewards('mythicalimmortal');
assert(warrior.dailyGold >= 20, 'Warrior daily gold must be a real check-in');
assert(warrior.dailyGold < 30, 'v4.3 review cut Warrior daily gold from 30');
assert(immortal.dailyGold >= warrior.dailyGold * 10, 'Immortal daily gold must dwarf Warrior');
assert(immortal.dailyGold <= 400, 'Immortal daily gold must not outpace training (~2–4× a session, not 600)');
assert(immortal.sessionGoldPct === 100, 'Immortal doubles workout gold');
assert(getRankRewards('master').weeklyBoostBoxes >= 1, 'Master unlocks weekly boxes');
assert(getRankRewards('epic').weeklyRelicBoxes >= 1 && getRankRewards('epic').rankUpItem, 'Epic adds relic box + rank-up item');
assert(rankGoldPerkMultiplierFromPct(8) === 1.08, '8% perk is 1.08x gold');
assert(formatWeeklyBoxLabel(warrior) === 'None', 'Warrior has no weekly boxes');
assert(formatRankRewardSummary(warrior).includes('20g/day'), 'summary includes daily gold');
assert(rankRewardDetailRows(warrior).length >= 5, 'current-rank card has the full perk list');

console.log('rank rewards tests ok —', immortal.dailyGold + 'g/day at Immortal, +' + immortal.sessionGoldPct + '% workout gold');
