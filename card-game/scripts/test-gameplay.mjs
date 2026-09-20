#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const E = require(join(root, 'palace-engine.js'));
const html = readFileSync(join(root, 'card-game.html'), 'utf8');
const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

must(html.includes('palace-engine.js'), 'card-game.html must load palace-engine.js');
must(html.includes('play-hand') && html.includes('play-card'), 'home must use playing-card mode tiles');
must(html.includes('inv-slot-grid'), 'inventory must be a Rigcore slot grid');
must(html.includes('enchant-table') && html.includes('enchant-drop'), 'enchanting table layout required');
must(html.includes('craft-stone-card'), 'craft must use stone cards');
must(html.includes('id="tableWindow"'), 'full-screen match table required');
must(!html.includes('Match play ships with the game spec'), 'placeholder play toast must be gone');
must(html.includes('id="itemDetailPopup"'), 'item detail popup required');

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function find(player, rank) {
  return player.hand.filter((c) => c.rank === rank);
}

const m0 = E.newMatch({ seats: 4, difficulty: 'Easy', rng: seededRng(7) });
must(m0.players.length === 4, '4-seat match');
must(m0.players[0].hand.length === 3, 'starting hand is 3');
must(m0.players[0].up.length === 3 && m0.players[0].down.length === 3, '3 up and 3 down');
must(m0.draw.length === 52 - 4 * 9, 'remaining cards form the draw pile');

const pileAce = E.newMatch({ seats: 2, rng: seededRng(1) });
pileAce.pile = [{ id: 'AH', rank: 'A', suit: 'H' }];
pileAce.turn = 0;
pileAce.players[0].hand = [
  { id: '3S', rank: '3', suit: 'S' },
  { id: '2D', rank: '2', suit: 'D' },
  { id: '10C', rank: '10', suit: 'C' },
];
const legal = E.legalMoves(pileAce, 0);
must(!legal.some((mv) => mv.rank === '3'), '3 cannot beat Ace');
must(legal.some((mv) => mv.rank === '2'), '2 can be played on Ace');
must(legal.some((mv) => mv.rank === '10'), '10 can be played on Ace');

const ev10 = E.applyMove(pileAce, { type: 'play', seat: 0, cardIds: ['10C'], zone: 'hand' });
must(ev10.some((e) => e.type === 'burn'), '10 burns the pile');
must(pileAce.pile.length === 0, 'pile empty after 10');
must(pileAce.turn === 0, 'burner goes again');

const four = E.newMatch({ seats: 2, rng: seededRng(2) });
four.pile = [
  { id: '7H', rank: '7', suit: 'H' },
  { id: '7D', rank: '7', suit: 'D' },
  { id: '7C', rank: '7', suit: 'C' },
];
four.turn = 0;
four.players[0].hand = [
  { id: '7S', rank: '7', suit: 'S' },
  { id: '4H', rank: '4', suit: 'H' },
  { id: '9S', rank: '9', suit: 'S' },
];
const ev4 = E.applyMove(four, { type: 'play', seat: 0, cardIds: ['7S'], zone: 'hand' });
must(ev4.some((e) => e.type === 'burn' && e.fourKind), 'four of a kind burns');
must(four.pile.length === 0, 'pile empty after four-kind');

const reset = E.newMatch({ seats: 2, rng: seededRng(3) });
reset.pile = [{ id: 'KH', rank: 'K', suit: 'H' }];
reset.turn = 0;
reset.players[0].hand = [
  { id: '2S', rank: '2', suit: 'S' },
  { id: '3H', rank: '3', suit: 'H' },
  { id: '4D', rank: '4', suit: 'D' },
];
reset.players[0].hand.length = 3;
E.applyMove(reset, { type: 'play', seat: 0, cardIds: ['2S'], zone: 'hand' });
must(reset.turn === 1, '2 passes to next player');
reset.players[1].hand = [
  { id: '3C', rank: '3', suit: 'C' },
  { id: '6S', rank: '6', suit: 'S' },
  { id: '8H', rank: '8', suit: 'H' },
];
const after2 = E.legalMoves(reset, 1);
must(after2.some((mv) => mv.rank === '3'), 'after a 2, any rank is legal');

const five = E.newMatch({ seats: 2, rng: seededRng(4) });
five.pile = [{ id: 'QH', rank: 'Q', suit: 'H' }];
five.turn = 0;
five.draw = [
  { id: '6C', rank: '6', suit: 'C' },
  { id: '8C', rank: '8', suit: 'C' },
  { id: '9C', rank: '9', suit: 'C' },
];
five.players[0].hand = [
  { id: '5H', rank: '5', suit: 'H' },
  { id: '4S', rank: '4', suit: 'S' },
  { id: '4C', rank: '4', suit: 'C' },
];
E.applyMove(five, { type: 'play', seat: 0, cardIds: ['5H'], zone: 'hand' });
must(five.phase === 'bonus', '5 enters bonus play');
must(five.turn === 0, '5 keeps the turn for bonus');
must(five.players[0].hand.length >= 2, '5 keeps a 2-card floor for bonus');
const bonusMoves = E.legalMoves(five, 0);
must(bonusMoves.every((mv) => mv.count === 1), 'bonus is a single card');
must(bonusMoves.length >= 1, 'bonus has at least one card');

const stuck = E.newMatch({ seats: 2, rng: seededRng(5) });
stuck.pile = [{ id: 'AS', rank: 'A', suit: 'S' }];
stuck.turn = 0;
stuck.players[0].hand = [
  { id: '3D', rank: '3', suit: 'D' },
  { id: '4C', rank: '4', suit: 'C' },
  { id: '6H', rank: '6', suit: 'H' },
];
const stuckMoves = E.legalMoves(stuck, 0);
must(stuckMoves.length === 1 && stuckMoves[0].type === 'pickup', 'must pick up when nothing is legal');
E.applyMove(stuck, { type: 'pickup', seat: 0 });
must(stuck.players[0].hand.some((c) => c.rank === 'A'), 'pickup takes the pile');
must(stuck.pile.length === 0, 'pile empty after pickup');

const botMatch = E.newMatch({ seats: 2, difficulty: 'Easy', rng: seededRng(9) });
botMatch.turn = 1;
const botMove = E.chooseBotMove(botMatch, botMatch.players[1], seededRng(11));
must(botMove && botMove.type, 'easy bot returns a move');

must(E.payoutFor(1, 30, 4) === 60, '4p 1st is 50% of pool');
must(E.payoutFor(4, 30, 4) === 0, '4p last takes nothing');
must(E.isBuyInUnlocked({ medium: 0, hard: -1, expert: -1 }, 'Easy', 30), 'easy 30 always unlocked');
must(!E.isBuyInUnlocked({ medium: 0, hard: -1, expert: -1 }, 'Medium', 200), 'medium 200 starts locked');
const unlocked = E.nextUnlocks({ medium: 0, hard: -1, expert: -1 }, 'Medium', 100, true);
must(E.isBuyInUnlocked(unlocked, 'Medium', 200), 'winning medium 100 unlocks 200');

const auto = E.newMatch({ seats: 4, difficulty: 'Easy', rng: seededRng(99) });
auto.players.forEach((p) => { p.isBot = true; });
let guard = 0;
while (!auto.ended && guard++ < 8000) {
  const p = auto.players[auto.turn];
  const mv = E.chooseBotMove(auto, p, seededRng(guard + 3));
  const ev = E.applyMove(auto, mv);
  if (!ev.length) {
    const fb = E.legalMoves(auto, p.seat)[0];
    if (!fb) break;
    E.applyMove(auto, fb);
  }
}
must(auto.ended, 'a 4-bot Easy match should finish');
must(auto.finishOrder.length === 4, 'all four seats get a place');

if (fails.length) {
  console.error('GAMEPLAY CHECKS FAILED:');
  fails.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('PALACE gameplay checks passed');
console.log(JSON.stringify({
  hand: E.HAND_SIZE,
  buyIns: E.BUYINS,
  sampleBot: botMove.type,
  fivePhase: five.phase,
}, null, 2));
