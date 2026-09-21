#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const E = require(join(root, 'palace-engine.js'));
const html = readFileSync(join(root, 'card-game.html'), 'utf8');
const engineSrc = readFileSync(join(root, 'palace-engine.js'), 'utf8');
const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

must(html.includes('palace-engine.js'), 'card-game.html must load palace-engine.js');
must(html.includes('play-hand') && html.includes('play-card'), 'home must use playing-card mode tiles');
must(html.includes('mode-face') && html.includes('home-globe'), 'mode tiles must be UNO-style illustrated cards');
must(html.includes('table-rail') && html.includes('table-card') && html.includes('tier-play') && html.includes('seat-toggle'), 'mode setup uses upright table cards with stacked tiers');
must(!html.includes('class="stake-card') && !html.includes('stake-oval'), 'tilted per-difficulty stake cards are gone');
must(html.includes('Candlelight') && html.includes('Velvet Room') && html.includes('High Court') && html.includes('Midnight Crown'), 'tables use themed names not Easy/Medium/Hard/Expert');
must(html.includes('grid-auto-columns: calc(50% - 8px)'), 'about two table cards fit on screen');
must(html.includes('.table-card') && html.includes('transform: none'), 'table cards are straight, not tilted');
must(html.includes('header-currency') && html.includes('modeGold'), 'mode overlay header shows coins beside the title');
must(html.includes('header-copy') && html.includes('min-height: 36px'), 'header rows share a 36px control height');
must(!html.includes('Start · 30 coins'), 'standard setup is not the stacked difficulty card list');
must(html.includes('inv-slot-grid'), 'inventory must be a Rigcore slot grid');
must(html.includes('enchant-table') && html.includes('enchant-drop'), 'enchanting table layout required');
must(html.includes('craft-stone-card'), 'craft must use stone cards');
must(html.includes('id="tableWindow"'), 'full-screen match table required');
must(!html.includes('Match play ships with the game spec'), 'placeholder play toast must be gone');
must(html.includes('id="itemDetailPopup"'), 'item detail popup required');
must(html.includes('id="turnClock"') && html.includes('TURN_SECS'), 'per-turn mm:ss clock required');
must(html.includes('avatar-ring') && html.includes('count-badge'), 'turn ring + remaining-card badges required');
must(html.includes('fan-backs') && html.includes('emote-btn') && html.includes('speech-bubble'), 'opponent fans + emote bubbles required');
must(html.includes('opponentFanLayout') && html.includes('--fan-overlap'), 'opponent fans use a count-aware even layout');
must(html.includes('transform-origin: bottom center'), 'opponent fan cards pivot from the bottom of the arc');
must(!html.includes('(var(--i, 0) - 0.45) * 9deg'), 'opponent fan rotation is not biased to one side');
must(html.includes('fanBacksHtml(fanCount, place)'), 'every seat passes its place into the fan layout');
must(html.includes('accept-ripple') && html.includes('flyArc') && html.includes('comet'), 'play arc + accept ripple required');
must(html.includes('PLAY_FLY_MS') && html.includes('land: true') && html.includes('fireSpecialPulse'), 'play animation must fly, land, then pulse specials only');
must(html.includes('pileLandBounce') && html.includes('specialPulseKind'), 'landing bounce and 2/5/10-only pulse required');
must(html.includes('sp-ov') && html.includes('sp-2') && html.includes('sp-5') && html.includes('sp-10'), '2/5/10 special overlays required');
must(html.includes('pc-rank') && html.includes('pc-suit'), 'card faces must render rank and suit, not a suit-only ace pip');
must(html.includes('BOT_THINK_MIN') && html.includes('thinking'), 'bots wait with a thinking cue');
must(html.includes('enterBrowse') && html.includes('updateBrowseTarget') && html.includes('SWIPE_UP_PX'), 'hold-browse and swipe-up play are separate gestures');
must(html.includes('pcard.peeking') && html.includes('PEEK_MS'), 'press-and-hold peeks a card in place');
must(html.includes('function enterCarry') && html.includes('FLICK_MS') && html.includes('drag-follow'), 'swipe up picks the card up so it follows the finger');
must(html.includes('dt < FLICK_MS') && html.includes('flick || onPile'), 'a quick flick auto-plays; a held carry drops on the pile or returns');
must(html.includes('if (gesture.browsing)') && html.includes('PREVIEW_LIFT_RATIO') && html.includes('enterCarry(ev)'), 'a held preview can swipe up into a carry');
must(html.includes('gesture.carrying || gesture.browsing'), 'preview-hold never starts a pickup until the finger lifts, and a carry never starts preview');
must(html.includes('const DIRECT_CARRY_PX'), 'direct swipe-up has its own pickup threshold');
{
  const n = Number((html.match(/const DIRECT_CARRY_PX = (\d+)/) || [])[1]);
  const preview = Number((html.match(/const PREVIEW_LIFT_RATIO = ([0-9.]+)/) || [])[1]);
  must(n > 0 && n < 40, 'direct carry lifts after a short swipe, not a 70% card travel');
  must(n < 94 * preview, 'direct carry is shorter than the preview handoff');
  const moveAt = html.indexOf('const move = (ev) =>');
  const moveFn = html.slice(moveAt, html.indexOf('const end = (ev) =>'));
  const browseAt = moveFn.indexOf('if (gesture.browsing)');
  const carryAt = moveFn.indexOf('if (gesture.carrying)');
  const browseBlock = moveFn.slice(browseAt, carryAt);
  const directBlock = moveFn.slice(carryAt);
  must(browseBlock.includes('PREVIEW_LIFT_RATIO') && browseBlock.includes('liftThresh') && browseBlock.includes('enterCarry(ev)'), 'preview-hold → pickup still uses 70% of card height');
  must(!browseBlock.includes('DIRECT_CARRY_PX'), 'preview handoff does not use the direct-swipe threshold');
  must(directBlock.includes('DIRECT_CARRY_PX') && directBlock.includes('enterCarry(ev)'), 'a swipe that never entered preview uses DIRECT_CARRY_PX');
  must(!directBlock.includes('PREVIEW_LIFT_RATIO'), 'direct swipe-up is not gated by the 70% preview ratio');
  must(html.includes('PREVIEW_SKIP_PX') && html.includes('peekTimer'), 'an upward swipe skips preview instead of falling into the 70% handoff');
}
must(html.includes('function handleAppBack') && html.includes("window.handleAppBack = handleAppBack"), 'Android back is handled by the PALACE screen stack');
must(html.includes('function requestLeaveMatch') && html.includes("confirm('Leave this match?')"), 'back mid-match uses the same Leave confirmation as the table Leave button');
must(html.includes("Press back again to exit") && html.includes("return 'exit'"), 'home requires a second back press before the app exits');
must(html.includes('tabStack') && html.includes('fromBack'), 'tab screens pop back to the previous tab then home');
must(html.includes('layerOpen(\'modeOverlay\')') && html.includes('layerOpen(\'lobbyOverlay\')') && html.includes('layerOpen(\'joinOverlay\')'), 'back closes mode, lobby, and join overlays');
must(html.includes('layerOpen(\'enchantWindow\')') && html.includes('layerOpen(\'craftWindow\')') && html.includes('layerOpen(\'profileOverlay\')'), 'back closes enchant, craft, and profile');
must(html.includes('layerOpen(\'itemDetailPopup\')') && html.includes('inviteBanner'), 'back closes item detail and invite banners before screens');
must(html.includes('in-match') && html.includes('requestLeaveMatch'), 'an in-match back press asks to leave rather than exiting');
must(html.includes('body.on-home') && html.includes('html.on-home') && html.includes('bindHomeScrollLock') && html.includes('touch-action: pan-x') && html.includes('position: fixed'), 'the main menu does not scroll or rubber-band vertically');
must(html.includes('y > r.bottom + 96'), 'hold-browse still hits a card after it lifts for inspect');
must(html.includes('ignoreY: true') && html.includes('const use = hit || gesture.el'), 'hold-browse tracks cards by X and keeps inspect while the finger stays down');
must(html.includes('hideSeatFaceUps') && html.includes('paintSeatTable'), 'scooped Stage 2 cards leave the table as soon as the engine takes them');
must(html.includes('LAYOUT LOCK: Stage 2/3') && html.includes('design/stage23-table-slots-reference.jpg'), 'table pile CSS is locked to the reference screenshot');
{
  const lockAt = html.indexOf('LAYOUT LOCK: Stage 2/3');
  must(lockAt >= 0, 'layout lock comment is present');
  const slotCss = html.slice(lockAt, lockAt + 2200);
  must(/\.slot-down \{[^}]*top:\s*0;\s*left:\s*0/.test(slotCss), 'face-down sits at 0,0 under the face-up');
  must(/\.slot-up \{[^}]*top:\s*0;\s*left:\s*0/.test(slotCss), 'face-up sits on the same origin as face-down');
  must(!/slot-down \{[^}]*top:\s*(1[4-9]|[2-9]\d)px/.test(slotCss), 'Stage 3 must not peek out with a top offset');
  must(!/slot-up \{[^}]*left:\s*[1-9]\d*px/.test(slotCss), 'Stage 2 must not shift sideways off its Stage 3 card');
  must(slotCss.includes('margin-left: -16px') && slotCss.includes('max-width: 96px'), 'east/west tuck three overlapping face-ups like the reference');
  must(slotCss.includes('width: 40px') && slotCss.includes('height: 58px'), 'every seat uses the same 40×58 table-slot size');
  must(!slotCss.includes('width: 48px') && !slotCss.includes('width: 34px'), 'slots are not the peek box or a smaller side-seat size');
}
must(html.includes('if (empty) continue'), 'empty table slots are omitted so piles stay tucked like the old Stage 2 row');
must(engineSrc.includes('if (!match || !stockEmpty(match)) return \'hand\''), 'stage 2/3 stay closed without a match or while the stock remains');
must(engineSrc.includes('tableStagesOpen(match, player)'), 'bot moves and applyMove share the same stage-open gate');
must(engineSrc.includes('const moves = legalMoves(match, seat);'), 'bot AI uses the same legalMoves list as the human player');
must(!html.includes('function startCardDrag') && !html.includes('maybeBeginDrag'), 'holding a card does not start a drag clone');
must(html.includes('if (g.browsing || g.browseMoved)'), 'releasing a hold inspects only — it does not select or play');
must(html.includes('addEventListener(\'mousedown\', down)'), 'mouse fallback starts a press when pointer events are missing');
must(html.includes('if (!match || match.ended || match.settled) return;'), 'hand inspect works during bot turns, not only on your turn');
must(html.includes('handLayout') && html.includes('--overlap'), 'hand overlap tightens so a large hand still fits');
must(html.includes('hideDrawPile') && html.includes('draw-stack.empty'), 'empty draw pile is removed after the last card flies');
must(!html.includes('empty-pile'), 'empty discard pile does not render a placeholder card');
must(html.includes('discardPileCardsHtml') && html.includes('playSourceEl'), 'pile paint only uses real cards and never ghosts the discard');
must(html.includes('Bonus — tap a face-down card'), 'a 5 bonus at stage 3 asks you to pick a face-down slot');
must(engineSrc.includes('if (player.isBot) pickupOneDownIfStageThree'), 'only bots auto-flip a face-down card on a 5 bonus');
must(html.includes('drawEmpty ? \'\' : cardBackHtml()'), 'draw pile card-back is omitted when the stock is empty');
must(!html.includes('dt < 320'), 'taps are not dropped after a 320ms hold window');
must(html.includes('pruneSelectedIds') && html.includes('onHumanCardTap(g.id)'), 'a tap selects without auto-playing');
must(!html.includes('skipAuto'), 'a tap no longer auto-plays a singleton rank');
must(html.includes('Tap to select') && html.includes('flick or drag onto the pile'), 'the table hint separates select from flick/carry play');
must(html.includes('legalGlow'), 'legal plays still glow');
must(html.includes('sortHand(human.hand)'), 'the visible hand is sorted lowest to highest');
must(html.includes("ev.type === 'stageUp'") && html.includes('Face-up cards to hand'), 'stage-2 face-up scoop must animate into hand');
must(html.includes("ev.type === 'flip'") && html.includes('hide ? cardBackHtml()'), 'a failed blind flip folds into hand as a back for opponents');
must(html.includes('function blindFlyHtml') && html.includes('revealBlind = !hide || played'), 'opponent Stage 3 identity stays hidden unless that card is played');
must(!html.includes("const face = ev.card ? cardFaceHtml(ev.card, 'tiny') : cardBackHtml('tiny')"), 'failed opponent blinds are not flipped face-up in place');
must(engineSrc.includes('private: true'), 'a failed flip marks the pickup private so later renders do not keep the rank public');
must(html.includes("id ? ' data-id=\"' + String(id).replace"), 'stage 3 backs set data-id without a stray quote');
must(!html.includes("${st} ${id ? 'data-id=\"' + id + '\"' : ''}\">"), 'card backs do not emit a broken extra quote');
must(html.includes('Tap a face-down card'), 'stage-3 face-down cards must be tappable');
must(html.includes('#humanTableCards') && html.includes('pointer-events: none'), 'empty hand overlay must not swallow table-card taps');
must(html.includes('legalRanks.has(c.rank)'), 'every copy of a playable rank glows, not only the first grouped id');
must(html.includes('Bonus — tap matching ranks'), 'a 5 bonus still lets you tap a full matching-rank group');
must(!html.includes('bonus && cards.length !== 1'), 'bonus play does not reject a same-rank group');
must(html.includes('Matching ranks play together'), 'different-rank tap swaps selection with a match cue');
must(html.includes('Promise.all(ev.cards.map'), 'a matching set flies to the pile together');
must(!html.includes('function selectedPlayIds'), 'play consumes the current selection instead of rebuilding from the thrown card');
must(html.includes('PalaceEngine.ensureRankSelection') && html.includes('PalaceEngine.nextRankSelection'), 'tap and carry share the same selection helpers');
must(html.includes('function fillCarryClone') && html.includes('fillCarryClone(wrap, origin, selectedIds, gesture.id)'), 'carry clones every selected card as one unit');
must(html.includes('selectedIds.forEach((id) => {') && html.includes("el.classList.add('ghost')"), 'carry ghosts the whole selection, not only the touched card');
must(engineSrc.includes("GROUP_SPECIALS = { '2': true, '5': true, '10': true, A: true }"), '2/5/10/Ace are grouping-specials');
{
  const startAt = html.indexOf('function startCardPress');
  const startFn = html.slice(startAt, html.indexOf('function finishCardGesture'));
  must(startAt >= 0 && !startFn.includes('ensureRankSelection') && !startFn.includes('selectedIds'), 'press-and-hold does not populate selection');
  const browseAt = html.indexOf('function enterBrowse');
  const browseFn = html.slice(browseAt, html.indexOf('function positionCarry'));
  must(browseAt >= 0 && !browseFn.includes('ensureRankSelection') && !browseFn.includes('selectedIds'), 'hold-then-slide preview does not share selection state');
  const carryAt = html.indexOf('function enterCarry');
  const carryFn = html.slice(carryAt, html.indexOf('function moveCarry'));
  must(carryFn.includes('ensureRankSelection') && !carryFn.includes('isAutoGroupedRank('), 'carry pickup is rank-agnostic and consumes the current selection');
}
must(html.includes('humanWonMatch') && html.includes('leaveMatchView') && html.includes('rewards-open') && html.includes('Baseline share'), '1st place leaves the table for a full-screen rewards summary');
must(html.includes('humanFinishedMatch') && html.includes('shouldLeaveForRewards') && html.includes('settleIfDone'), 'going out settles the local client immediately');
must(html.includes('remainingAreOnlyBots') && html.includes('are not spectated'), 'remaining bots are not spectated after a win');
must(html.includes('PalaceEngine.syncSeat(match, p, refillEv)'), 'each turn refills from stock before table stages can open');
must(html.includes('activeZone(human, match)'), 'the table UI gates stage 2/3 with the draw pile, not hand-empty alone');
must(html.includes("if (match && ev.seat === match.humanSeat) break;"), 'winning out event skips leftover table animations');
must(html.includes("You're out") && html.includes('You never sit and watch the rest') && html.includes('seedLastCardFinish'), '2nd/3rd/last also leave for rewards with Play again');
must(!html.includes('id="turnBanner"') && !html.includes('turn-banner') && !html.includes('function flashBanner'), 'turn-status element under the pile is deleted');
must(!html.includes('Your turn') && !html.includes('is thinking'), 'no YOUR TURN / thinking text anywhere');
must(!html.includes('pc-pip">P') && !html.includes('pc-pip">pile'), 'card backs have no placeholder letter');
must(html.includes('pc-back-inner') && html.includes('pc-back-diamond'), 'card backs use a stock framed pattern with no letter');
must(html.includes('#1e3a6b') && html.includes('#c9a45b'), 'card backs use a stock navy/gold design');
must(html.includes('playBtnHtml') && html.includes('hintHtml') && html.includes('pile-count'), 'hand chrome is built from strings so a 0 cannot leak');
must(!html.includes("})() : ''}"), 'matching-rank hint is not an inlined IIFE in the table template');
must(html.includes('avatarArtHtml') && html.includes('table-watermark') && html.includes('table-leave-btn'), 'portrait avatars, table watermark, and HUD leave treatment required');
must(html.includes('SELECTION LOCK: table play surface'), 'table CSS locks native text selection on the play surface');
must(!html.includes('<span>PALACE</span>'), 'the table watermark word is not an HTML text node');
must(html.includes('function bindTableSelectionLock') && html.includes("addEventListener('selectstart'") && html.includes("addEventListener('selectionchange'"), 'long-press on the table cannot start a native text selection');
must(html.includes('#tableWindow ::selection') && html.includes('-webkit-touch-callout: none !important'), 'WebView copy/callout menus are disabled on the table');
must(!html.includes('sp-5">+1'), '5s do not show a +1 overlay');
must(html.includes('function tableSlotsHtml') && html.includes('seat-row table-slots') && html.includes('slot-up') && html.includes('slot-down'), 'stage 2 sits on stage 3 in 3 stacked slots');
must(html.includes("id=\"tableSlots-") || html.includes("id=\"tableSlots-'"), 'every opponent seat gets its own table-slot row');
must(html.includes('.table-slot.has-up .slot-down'), 'a cleared face-up slot reveals the face-down card underneath');
must(html.includes('tableSlotsHtml(p, { isHuman, zone, active, legalIds, legalRanks })'), 'every seat, not only the human, renders stacked table piles');
must(!html.includes("p.up.map((c) => cardFaceHtml(c, 'tiny'))") && !html.includes("p.down.map((c) => cardBackHtml('tiny'))"), 'opponents are not a face-up-only or 6-card spread row');

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
must(E.HAND_SIZE === 2, 'working hand size is 2');
must(m0.players[0].hand.length === 2, 'starting hand is 2');
must(m0.players[0].up.length === 3 && m0.players[0].down.length === 3, '3 up and 3 down');
must(m0.draw.length === 52 - 4 * 8, 'remaining cards form the draw pile');

const refill = E.newMatch({ seats: 2, rng: seededRng(12) });
refill.turn = 0;
refill.pile = [];
must(refill.players[0].hand.length === 2, '1v1 starting hand is 2');
const playId = refill.players[0].hand[0].id;
const drawBefore = refill.draw.length;
E.applyMove(refill, { type: 'play', seat: 0, cardIds: [playId] });
must(refill.players[0].hand.length === 2, 'draw back up to 2 after a play');
must(refill.draw.length === drawBefore - 1 || refill.phase === 'bonus', 'one card is taken from the draw pile (or 5 bonus keeps the floor)');

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
must(pileAce.turn === 1, '10 passes to the next player — no extra move');
pileAce.players[1].hand = [
  { id: '3C', rank: '3', suit: 'C' },
  { id: '6S', rank: '6', suit: 'S' },
];
const after10 = E.legalMoves(pileAce, 1);
must(after10.some((mv) => mv.rank === '3'), 'after a 10, the next player can play any rank on the empty pile');

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
must(four.turn === 1, 'four-kind burn passes to the next player — no extra move');

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
must(bonusMoves.some((mv) => mv.rank === '4' && mv.count === 1 && mv.cardIds.includes('4S')), 'bonus can play a single 4');
must(bonusMoves.some((mv) => mv.rank === '4' && mv.count === 1 && mv.cardIds.includes('4C')), 'every copy of a playable rank is legal on bonus, not only the first');
must(bonusMoves.some((mv) => mv.rank === '4' && mv.count === 2), 'bonus can play both 4s together as one play');
const evBonusPair = E.applyMove(five, { type: 'play', seat: 0, cardIds: ['4S', '4C'], zone: 'hand' });
must(evBonusPair.some((e) => e.type === 'play' && e.bonus && e.cards.length === 2), 'both 4s leave as one bonus play');
must(five.players[0].hand.every((c) => c.rank !== '4'), 'both bonus 4s are gone from hand');
must(five.phase === 'playing', 'a non-5 bonus group ends the 5 chain');
must(five.turn === 1, 'turn passes after the grouped bonus play');

const chain = E.newMatch({ seats: 2, rng: seededRng(31) });
chain.pile = [{ id: 'QH', rank: 'Q', suit: 'H' }];
chain.turn = 0;
chain.phase = 'playing';
chain.draw = [
  { id: '6C', rank: '6', suit: 'C' },
  { id: '8C', rank: '8', suit: 'C' },
  { id: '9C', rank: '9', suit: 'C' },
  { id: 'JC', rank: 'J', suit: 'C' },
];
chain.players[0].hand = [
  { id: '5H', rank: '5', suit: 'H' },
  { id: '5S', rank: '5', suit: 'S' },
  { id: '4D', rank: '4', suit: 'D' },
];
const evChain1 = E.applyMove(chain, { type: 'play', seat: 0, cardIds: ['5H'], zone: 'hand' });
must(chain.phase === 'bonus' && chain.turn === 0, 'first 5 grants a bonus play');
must(evChain1.some((e) => e.type === 'reset' && e.rank === '5'), 'first 5 resets the pile');
const evChain2 = E.applyMove(chain, { type: 'play', seat: 0, cardIds: ['5S'], zone: 'hand' });
must(evChain2.some((e) => e.type === 'play' && e.bonus && e.cards[0].id === '5S'), 'the second 5 is played as the bonus card');
must(evChain2.some((e) => e.type === 'reset' && e.rank === '5'), 'bonus 5 resets the pile again');
must(chain.phase === 'bonus' && chain.turn === 0, 'a bonus 5 grants another bonus play');
must(chain.players[0].hand.length >= 2, 'hand-size floor applies on every 5 in the chain');
must(chain.players[0].hand.some((c) => c.id === '4D'), 'unplayed cards stay available through the chain');
const evChain3 = E.applyMove(chain, { type: 'play', seat: 0, cardIds: ['4D'], zone: 'hand' });
must(evChain3.some((e) => e.type === 'play' && e.bonus && e.cards[0].id === '4D'), 'non-5 is played as the chained bonus');
must(chain.phase === 'playing', 'chain ends when the bonus card is not a 5');
must(chain.turn === 1, 'turn passes after a non-5 bonus card');

const noChain2 = E.newMatch({ seats: 2, rng: seededRng(32) });
noChain2.pile = [{ id: 'KH', rank: 'K', suit: 'H' }];
noChain2.turn = 0;
noChain2.phase = 'playing';
noChain2.draw = [{ id: '6C', rank: '6', suit: 'C' }, { id: '8C', rank: '8', suit: 'C' }];
noChain2.players[0].hand = [
  { id: '5D', rank: '5', suit: 'D' },
  { id: '2H', rank: '2', suit: 'H' },
];
E.applyMove(noChain2, { type: 'play', seat: 0, cardIds: ['5D'], zone: 'hand' });
must(noChain2.phase === 'bonus', '5 still grants bonus before a 2');
E.applyMove(noChain2, { type: 'play', seat: 0, cardIds: ['2H'], zone: 'hand' });
must(noChain2.phase === 'playing' && noChain2.turn === 1, 'a bonus 2 does not chain another bonus');

const pair2 = E.newMatch({ seats: 2, rng: seededRng(21) });
pair2.pile = [{ id: 'KH', rank: 'K', suit: 'H' }];
pair2.turn = 0;
pair2.phase = 'playing';
pair2.draw = [{ id: '4C', rank: '4', suit: 'C' }];
pair2.players[0].hand = [
  { id: '2H', rank: '2', suit: 'H' },
  { id: '2S', rank: '2', suit: 'S' },
  { id: '9D', rank: '9', suit: 'D' },
];
const pairMoves = E.legalMoves(pair2, 0);
must(pairMoves.some((m) => m.rank === '2' && m.count === 1), 'holding two 2s still allows playing only one');
must(pairMoves.some((m) => m.rank === '2' && m.count === 2), 'holding two 2s allows playing both together');
must(!pairMoves.some((m) => m.rank === '2' && m.count === 3), 'cannot play more copies than you hold');
const evPair = E.applyMove(pair2, { type: 'play', seat: 0, cardIds: ['2H', '2S'], zone: 'hand' });
must(evPair.filter((e) => e.type === 'play').length === 1, 'a matching set is one play event');
must(evPair.find((e) => e.type === 'play').cards.map((c) => c.id).sort().join() === '2H,2S', 'both selected 2s leave the hand together');
must(pair2.players[0].hand.every((c) => c.rank !== '2'), 'played 2s are gone from hand');
must(pair2.players[0].hand.some((c) => c.id === '9D'), 'the unselected 9 stays in hand');
must(evPair.filter((e) => e.type === 'reset').length === 1, 'a pair of 2s resets once as a group');
must(pair2.turn === 1, 'playing a pair advances the turn once');

const keepOne = E.newMatch({ seats: 2, rng: seededRng(24) });
keepOne.pile = [{ id: '3C', rank: '3', suit: 'C' }];
keepOne.turn = 0;
keepOne.phase = 'playing';
keepOne.players[0].hand = [
  { id: '6H', rank: '6', suit: 'H' },
  { id: '6D', rank: '6', suit: 'D' },
  { id: '6S', rank: '6', suit: 'S' },
];
const tripleMoves = E.legalMoves(keepOne, 0);
must(tripleMoves.some((m) => m.rank === '6' && m.count === 1), 'three of a kind can play 1');
must(tripleMoves.some((m) => m.rank === '6' && m.count === 2), 'three of a kind can play 2');
must(tripleMoves.some((m) => m.rank === '6' && m.count === 3), 'three of a kind can play all 3');
E.applyMove(keepOne, { type: 'play', seat: 0, cardIds: ['6H'], zone: 'hand' });
must(keepOne.players[0].hand.filter((c) => c.rank === '6').length === 2, 'playing one of three 6s keeps the other two');
must(keepOne.turn === 1, 'playing a single from a matching set still advances once');

const twoFives = E.newMatch({ seats: 2, rng: seededRng(22) });
twoFives.pile = [{ id: 'QH', rank: 'Q', suit: 'H' }];
twoFives.turn = 0;
twoFives.phase = 'playing';
twoFives.draw = [
  { id: '6C', rank: '6', suit: 'C' },
  { id: '8C', rank: '8', suit: 'C' },
  { id: '9C', rank: '9', suit: 'C' },
];
twoFives.players[0].hand = [
  { id: '5H', rank: '5', suit: 'H' },
  { id: '5S', rank: '5', suit: 'S' },
  { id: '4D', rank: '4', suit: 'D' },
];
must(E.legalMoves(twoFives, 0).some((m) => m.rank === '5' && m.count === 2), 'two 5s can be played together');
const evFives = E.applyMove(twoFives, { type: 'play', seat: 0, cardIds: ['5H', '5S'], zone: 'hand' });
must(evFives.filter((e) => e.type === 'play').length === 1, 'grouped 5s are one play');
must(evFives.filter((e) => e.type === 'reset').length === 1, 'grouped 5s reset once');
must(twoFives.phase === 'bonus', 'grouped 5s grant one bonus play total');
must(twoFives.turn === 0, 'grouped 5s keep the turn for that one bonus');
const groupedBonus = E.legalMoves(twoFives, 0);
must(groupedBonus.length >= 1 && groupedBonus.every((mv) => mv.count === 1), 'bonus after grouped 5s is still a single card');
must(!groupedBonus.some((mv) => mv.rank === '5'), 'both grouped 5s already left the hand');
E.applyMove(twoFives, { type: 'play', seat: 0, cardIds: groupedBonus[0].cardIds, zone: 'hand' });
must(twoFives.phase === 'playing', 'grouped 5s grant one bonus; a non-5 bonus ends the turn');
must(twoFives.turn === 1, 'turn passes after the single non-5 bonus card');

const groupedThenChain = E.newMatch({ seats: 2, rng: seededRng(33) });
groupedThenChain.pile = [{ id: 'QH', rank: 'Q', suit: 'H' }];
groupedThenChain.turn = 0;
groupedThenChain.phase = 'playing';
groupedThenChain.draw = [
  { id: '6C', rank: '6', suit: 'C' },
  { id: '8C', rank: '8', suit: 'C' },
];
groupedThenChain.players[0].hand = [
  { id: '5H', rank: '5', suit: 'H' },
  { id: '5D', rank: '5', suit: 'D' },
  { id: '5S', rank: '5', suit: 'S' },
];
E.applyMove(groupedThenChain, { type: 'play', seat: 0, cardIds: ['5H', '5D'], zone: 'hand' });
must(groupedThenChain.phase === 'bonus', 'a pair of 5s still grants one bonus');
const afterPair = E.applyMove(groupedThenChain, { type: 'play', seat: 0, cardIds: ['5S'], zone: 'hand' });
must(afterPair.some((e) => e.type === 'play' && e.bonus), 'the leftover 5 can be the bonus card');
must(groupedThenChain.phase === 'bonus' && groupedThenChain.turn === 0, 'bonus 5 after a grouped 5 still chains');

const pairFour = E.newMatch({ seats: 2, rng: seededRng(23) });
pairFour.pile = [
  { id: '8H', rank: '8', suit: 'H' },
  { id: '8D', rank: '8', suit: 'D' },
];
pairFour.turn = 0;
pairFour.phase = 'playing';
pairFour.players[0].hand = [
  { id: '8C', rank: '8', suit: 'C' },
  { id: '8S', rank: '8', suit: 'S' },
  { id: '4H', rank: '4', suit: 'H' },
];
const evPairFour = E.applyMove(pairFour, { type: 'play', seat: 0, cardIds: ['8C', '8S'], zone: 'hand' });
must(evPairFour.some((e) => e.type === 'burn' && e.fourKind), 'a pair that completes four-of-a-kind burns');
must(pairFour.pile.length === 0, 'pile empty after completing four-kind with a pair');
must(pairFour.turn === 1, 'four-kind from a pair play passes once');

const quadHand = E.newMatch({ seats: 2, rng: seededRng(25) });
quadHand.pile = [{ id: '3H', rank: '3', suit: 'H' }];
quadHand.turn = 0;
quadHand.phase = 'playing';
quadHand.players[0].hand = [
  { id: '7H', rank: '7', suit: 'H' },
  { id: '7D', rank: '7', suit: 'D' },
  { id: '7C', rank: '7', suit: 'C' },
  { id: '7S', rank: '7', suit: 'S' },
];
const evQuad = E.applyMove(quadHand, { type: 'play', seat: 0, cardIds: ['7H', '7D', '7C', '7S'], zone: 'hand' });
must(evQuad.some((e) => e.type === 'burn' && e.fourKind), 'playing four of a kind from hand burns');
must(quadHand.pile.length === 0, 'pile empty after a four-of-a-kind play');
must(quadHand.turn === 1, 'four-of-a-kind from hand passes once');

const stageTwo = E.newMatch({ seats: 2, rng: seededRng(6) });
stageTwo.draw = [];
stageTwo.pile = [{ id: '6H', rank: '6', suit: 'H' }];
stageTwo.turn = 0;
stageTwo.phase = 'playing';
stageTwo.players[0].hand = [{ id: '9S', rank: '9', suit: 'S' }];
stageTwo.players[0].up = [
  { id: '3C', rank: '3', suit: 'C' },
  { id: '8D', rank: '8', suit: 'D' },
  { id: 'QH', rank: 'Q', suit: 'H' },
];
const evStage = E.applyMove(stageTwo, { type: 'play', seat: 0, cardIds: ['9S'], zone: 'hand' });
const stageEv = evStage.find((e) => e.type === 'stageUp');
must(stageEv && stageEv.cards.length === 3, 'empty hand + empty draw scoops all 3 face-up cards at once');
must(stageTwo.players[0].up.length === 0, 'face-up row is empty after the stage-2 scoop');
must(stageTwo.players[0].hand.length === 3, 'scooped face-up cards land in hand as a batch');
must(stageTwo.players[0].hand.map((c) => c.id).sort().join() === '3C,8D,QH', 'the same 3 face-up cards move into hand');
must(evStage.filter((e) => e.type === 'stageUp').length === 1, 'scoop is one batch event, not one card at a time');
must(stageTwo.turn === 1, 'a normal last-hand card scoops, then passes the turn');
must(E.activeZone(stageTwo.players[0]) === 'hand', 'after scoop, play continues from hand');
must(!E.legalMoves(stageTwo, 0).some((m) => m.zone === 'up'), 'face-up cards are not played off the table after scoop');

const stillDraw = E.newMatch({ seats: 2, rng: seededRng(8) });
stillDraw.draw = [{ id: '2C', rank: '2', suit: 'C' }, { id: '4D', rank: '4', suit: 'D' }];
stillDraw.pile = [{ id: '6C', rank: '6', suit: 'C' }];
stillDraw.turn = 0;
stillDraw.players[0].hand = [{ id: '9H', rank: '9', suit: 'H' }];
stillDraw.players[0].up = [
  { id: '3H', rank: '3', suit: 'H' },
  { id: '8C', rank: '8', suit: 'C' },
  { id: 'QS', rank: 'Q', suit: 'S' },
];
const evStill = E.applyMove(stillDraw, { type: 'play', seat: 0, cardIds: ['9H'], zone: 'hand' });
must(!evStill.some((e) => e.type === 'stageUp'), 'do not scoop face-up cards while the draw pile still has cards');
must(stillDraw.players[0].up.length === 3, 'face-up row stays on the table while drawing');
must(stillDraw.players[0].hand.length === 2, 'emptying the hand refills from the draw pile up to 2');
must(evStill.some((e) => e.type === 'draw'), 'the refill comes from the stock, not the table');
must(E.activeZone(stillDraw.players[0], stillDraw) === 'hand', 'stage 2 stays closed while the stock has cards');
must(!E.legalMoves(stillDraw, 0).some((m) => m.zone === 'up' || m.type === 'flip'), 'cannot play face-up or face-down while the draw pile remains');

const freshGate = E.newMatch({ seats: 4, rng: seededRng(7) });
must(freshGate.draw.length > 0, 'a fresh deal has a draw pile');
must(E.activeZone(freshGate.players[0], freshGate) === 'hand', 'a fresh match is stage 1 (hand)');
must(freshGate.players[0].up.length === 3 && freshGate.players[0].down.length === 3, 'table cards exist from the deal');
must(!E.legalMoves(freshGate, 0).some((m) => m.zone === 'up' || m.zone === 'down' || m.type === 'flip'), 'stage 2/3 cards are not legal at match start');

const earlyUp = E.newMatch({ seats: 2, rng: seededRng(9) });
earlyUp.turn = 0;
earlyUp.phase = 'playing';
earlyUp.draw = [{ id: '2C', rank: '2', suit: 'C' }, { id: '4D', rank: '4', suit: 'D' }];
earlyUp.pile = [{ id: '3C', rank: '3', suit: 'C' }];
earlyUp.players[0].hand = [];
earlyUp.players[0].up = [
  { id: 'KH', rank: 'K', suit: 'H' },
  { id: '9D', rank: '9', suit: 'D' },
  { id: '8S', rank: '8', suit: 'S' },
];
must(E.activeZone(earlyUp.players[0], earlyUp) === 'hand', 'empty hand still reads as stage 1 if the stock remains');
must(!E.legalMoves(earlyUp, 0).some((m) => m.zone === 'up' || m.type === 'flip'), 'face-up/down cards are not legal until the stock is empty');
const stealUp = E.applyMove(earlyUp, { type: 'play', seat: 0, cardIds: ['KH'], zone: 'up' });
must(!stealUp.some((e) => e.type === 'play'), 'playing a face-up card is rejected while the draw pile remains');
must(earlyUp.players[0].up.some((c) => c.id === 'KH'), 'the face-up king stays on the table');
E.syncSeat(earlyUp, earlyUp.players[0]);
must(earlyUp.players[0].hand.length === 2, 'syncSeat draws back up to 2 from stock');
must(earlyUp.players[0].up.length === 3, 'syncSeat does not scoop face-up cards while stock remains');

const botEarly = E.newMatch({ seats: 2, rng: seededRng(19), humanSeat: 0 });
botEarly.turn = 1;
botEarly.phase = 'playing';
botEarly.pile = [{ id: '3C', rank: '3', suit: 'C' }];
botEarly.draw = [
  { id: '2C', rank: '2', suit: 'C' },
  { id: '6D', rank: '6', suit: 'D' },
  { id: '7H', rank: '7', suit: 'H' },
];
botEarly.players[1].hand = [];
botEarly.players[1].up = [
  { id: 'KH', rank: 'K', suit: 'H' },
  { id: '9D', rank: '9', suit: 'D' },
  { id: '8S', rank: '8', suit: 'S' },
];
botEarly.players[1].down = [
  { id: '4C', rank: '4', suit: 'C' },
  { id: 'JS', rank: 'J', suit: 'S' },
  { id: 'QD', rank: 'Q', suit: 'D' },
];
const botEarlyMove = E.chooseBotMove(botEarly, botEarly.players[1], seededRng(21));
must(botEarly.players[1].hand.length === 2, 'a bot with an empty hand draws from stock before table stages');
must(botEarly.players[1].up.length === 3 && botEarly.players[1].down.length === 3, 'bot Stage 2/3 cards stay on the table while the stock remains');
must(botEarlyMove && botEarlyMove.zone !== 'up' && botEarlyMove.type !== 'flip', 'bot AI cannot play Stage 2/3 while the draw pile remains');
must(!E.tableStagesOpen(botEarly, botEarly.players[1]), 'shared tableStagesOpen is false for that bot');
const stealBotUp = E.applyMove(botEarly, { type: 'play', seat: 1, cardIds: ['KH'], zone: 'up' });
must(!stealBotUp.some((e) => e.type === 'play'), 'applyMove rejects a bot Stage 2 play while the stock remains');
must(botEarly.players[1].up.some((c) => c.id === 'KH'), 'the bot face-up king stays on the table');

const fiveEdge = E.newMatch({ seats: 2, rng: seededRng(10) });
fiveEdge.draw = [];
fiveEdge.pile = [{ id: 'KH', rank: 'K', suit: 'H' }];
fiveEdge.turn = 0;
fiveEdge.phase = 'playing';
fiveEdge.players[0].hand = [{ id: '5D', rank: '5', suit: 'D' }];
fiveEdge.players[0].up = [
  { id: '3S', rank: '3', suit: 'S' },
  { id: '8H', rank: '8', suit: 'H' },
  { id: 'QD', rank: 'Q', suit: 'D' },
];
const evFiveEdge = E.applyMove(fiveEdge, { type: 'play', seat: 0, cardIds: ['5D'], zone: 'hand' });
const stageAt = evFiveEdge.findIndex((e) => e.type === 'stageUp');
const playAt = evFiveEdge.findIndex((e) => e.type === 'play');
must(stageAt >= 0 && playAt >= 0 && playAt < stageAt, 'face-up scoop happens after the 5 is played');
must(fiveEdge.players[0].up.length === 0, '5-at-boundary scoops face-up cards off the table');
must(fiveEdge.players[0].hand.length === 3, '5-at-boundary hand is the 3 scooped cards');
must(fiveEdge.phase === 'bonus', '5 at the stage-2 boundary still grants bonus play');
must(fiveEdge.turn === 0, '5 at the stage-2 boundary keeps the turn');
const fiveBonus = E.legalMoves(fiveEdge, 0);
must(fiveBonus.length >= 1 && fiveBonus.every((m) => m.type === 'play' && m.zone === 'hand'), 'bonus is chosen from the scooped hand, not the table');
must(fiveBonus.some((m) => m.cardIds.includes('3S')), 'bonus can pick a scooped face-up card');
must(!evFiveEdge.some((e) => e.type === 'draw'), 'empty draw pile does not draw before the scooped bonus');

const fivePairEdge = E.newMatch({ seats: 2, rng: seededRng(16) });
fivePairEdge.draw = [];
fivePairEdge.pile = [{ id: 'KH', rank: 'K', suit: 'H' }];
fivePairEdge.turn = 0;
fivePairEdge.phase = 'playing';
fivePairEdge.players[0].hand = [{ id: '5D', rank: '5', suit: 'D' }];
fivePairEdge.players[0].up = [
  { id: '4S', rank: '4', suit: 'S' },
  { id: '4H', rank: '4', suit: 'H' },
  { id: 'QD', rank: 'Q', suit: 'D' },
];
fivePairEdge.players[0].down = [
  { id: '3S', rank: '3', suit: 'S' },
  { id: '8H', rank: '8', suit: 'H' },
  { id: 'JC', rank: 'J', suit: 'C' },
];
const evFivePairEdge = E.applyMove(fivePairEdge, { type: 'play', seat: 0, cardIds: ['5D'], zone: 'hand' });
must(evFivePairEdge.some((e) => e.type === 'stageUp'), 'playing the last hand 5 scoops Stage 2 into hand');
must(fivePairEdge.phase === 'bonus', 'the last Stage 1 5 still grants bonus play');
must(fivePairEdge.players[0].hand.map((c) => c.rank).sort().join() === '4,4,Q', 'bonus hand is the three scooped face-up cards');
const pairBonus = E.legalMoves(fivePairEdge, 0);
must(pairBonus.some((m) => m.rank === '4' && m.count === 1 && m.cardIds.includes('4S')), 'each scooped 4 is legal on the Stage 1→2 bonus');
must(pairBonus.some((m) => m.rank === '4' && m.count === 1 && m.cardIds.includes('4H')), 'the other scooped 4 is also legal on that bonus');
must(pairBonus.some((m) => m.rank === '4' && m.count === 2), 'the Stage 1→2 bonus can play both matching 4s together');
const evPairBonus = E.applyMove(fivePairEdge, { type: 'play', seat: 0, cardIds: ['4S', '4H'], zone: 'hand' });
must(evPairBonus.some((e) => e.type === 'play' && e.bonus && e.cards.length === 2), 'both scooped 4s leave as one bonus play');
must(fivePairEdge.players[0].hand.every((c) => c.rank !== '4'), 'both bonus 4s are gone after the Stage 1→2 group');
must(fivePairEdge.phase === 'playing', 'a non-5 group ends the bonus after the Stage 1→2 scoop');

const stage3 = E.newMatch({ seats: 2, rng: seededRng(13) });
stage3.draw = [];
stage3.pile = [{ id: 'KH', rank: 'K', suit: 'H' }];
stage3.turn = 0;
stage3.phase = 'playing';
stage3.players[0].hand = [];
stage3.players[0].up = [];
stage3.players[0].down = [
  { id: '3S', rank: '3', suit: 'S' },
  { id: '8H', rank: '8', suit: 'H' },
  { id: 'QD', rank: 'Q', suit: 'D' },
];
const downMoves = E.legalMoves(stage3, 0);
must(downMoves.filter((m) => m.type === 'flip').length === 3, 'stage 3 offers a choice of each face-down card');
must(downMoves.some((m) => m.type === 'pickup'), 'stage 3 still allows taking the pile');
const evDown = E.applyMove(stage3, { type: 'flip', seat: 0, index: 1 });
must(evDown.some((e) => e.type === 'flip' && e.card && e.card.id === '8H'), 'the chosen face-down card is revealed');
must(evDown.some((e) => e.type === 'pickup' && e.private), 'a failed blind flip picks up the pile privately');
must(stage3.players[0].hand.map((c) => c.id).sort().join() === '8H,KH', 'the flipped card and the pile fold into hand');
must(stage3.players[0].down.length === 2, 'the other face-down cards stay on the table');
must(stage3.pile.length === 0, 'the failed flip takes the discard pile');
must(stage3.turn === 1, 'a failed blind flip ends the turn');
must(E.activeZone(stage3.players[0], stage3) === 'hand', 'after the failed flip, play continues from a private hand');

const beatBlind = E.newMatch({ seats: 2, rng: seededRng(33) });
beatBlind.draw = [];
beatBlind.pile = [{ id: '3C', rank: '3', suit: 'C' }];
beatBlind.turn = 0;
beatBlind.phase = 'playing';
beatBlind.players[0].hand = [];
beatBlind.players[0].up = [];
beatBlind.players[0].down = [
  { id: 'QS', rank: 'Q', suit: 'S' },
  { id: '4D', rank: '4', suit: 'D' },
  { id: '7C', rank: '7', suit: 'C' },
];
const evBeat = E.applyMove(beatBlind, { type: 'flip', seat: 0, index: 0 });
must(evBeat.some((e) => e.type === 'flip' && e.card && e.card.id === 'QS'), 'a winning blind card is shown as it is flipped');
must(evBeat.some((e) => e.type === 'play' && e.cards.some((c) => c.id === 'QS')), 'a blind card that beats the pile is played face-up');
must(beatBlind.pile.some((c) => c.id === 'QS'), 'the winning blind card stays public on the pile');
must(beatBlind.players[0].hand.length === 0, 'a winning flip is not folded into hand');
must(beatBlind.players[0].down.length === 2, 'unflipped blinds stay on the table');

const fiveDown = E.newMatch({ seats: 2, rng: seededRng(14) });
fiveDown.draw = [];
fiveDown.pile = [{ id: 'AS', rank: 'A', suit: 'S' }];
fiveDown.turn = 0;
fiveDown.phase = 'playing';
fiveDown.players[0].hand = [{ id: '5C', rank: '5', suit: 'C' }];
fiveDown.players[0].up = [];
fiveDown.players[0].down = [
  { id: '4S', rank: '4', suit: 'S' },
  { id: '9H', rank: '9', suit: 'H' },
  { id: 'JC', rank: 'J', suit: 'C' },
];
const evFiveDown = E.applyMove(fiveDown, { type: 'play', seat: 0, cardIds: ['5C'], zone: 'hand' });
must(!evFiveDown.some((e) => e.type === 'stageDown'), 'a human 5 at stage 3 does not auto-flip a face-down card');
must(fiveDown.players[0].hand.length === 0, 'the hand stays empty so the player can choose a slot');
must(fiveDown.players[0].down.length === 3, 'all three face-down cards stay until a slot is chosen');
must(fiveDown.phase === 'bonus' && fiveDown.turn === 0, '5 at stage 3 still grants bonus play');
const bonusFlips = E.legalMoves(fiveDown, 0);
must(bonusFlips.filter((m) => m.type === 'flip').length === 3, 'the bonus is choosing which face-down slot to flip');
must(!bonusFlips.some((m) => m.type === 'pickup'), 'bonus play cannot take the pile');
const evPickDown = E.applyMove(fiveDown, { type: 'flip', seat: 0, index: 2 });
must(evPickDown.some((e) => e.type === 'flip' && e.card && e.card.id === 'JC'), 'the chosen face-down slot is the one revealed');
must(evPickDown.some((e) => e.type === 'play' && e.cards.some((c) => c.id === 'JC')), 'a blind card that beats the pile is played face-up');
must(fiveDown.players[0].hand.length === 0, 'a successful bonus flip does not stay in hand');
must(fiveDown.players[0].down.length === 2, 'the other two face-down cards stay put');
must(fiveDown.pile.some((c) => c.id === 'JC'), 'the revealed bonus card lands on the pile');
must(fiveDown.turn === 1, 'turn passes after the bonus blind card is played');

const botFiveDown = E.newMatch({ seats: 2, rng: seededRng(15) });
botFiveDown.draw = [];
botFiveDown.pile = [{ id: 'AS', rank: 'A', suit: 'S' }];
botFiveDown.turn = 0;
botFiveDown.phase = 'playing';
botFiveDown.players[0].isBot = true;
botFiveDown.players[0].hand = [{ id: '5C', rank: '5', suit: 'C' }];
botFiveDown.players[0].up = [];
botFiveDown.players[0].down = [
  { id: '4S', rank: '4', suit: 'S' },
  { id: '9H', rank: '9', suit: 'H' },
  { id: 'JC', rank: 'J', suit: 'C' },
];
const evBotFiveDown = E.applyMove(botFiveDown, { type: 'play', seat: 0, cardIds: ['5C'], zone: 'hand' });
must(evBotFiveDown.some((e) => e.type === 'stageDown'), 'bots still auto-place one face-down card for a 5 bonus');
must(botFiveDown.players[0].hand.length === 1, 'the bot bonus hand is the auto-flipped card');
must(botFiveDown.phase === 'bonus', 'the bot still gets the 5 bonus play');

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

const strat = E.newMatch({ seats: 2, rng: seededRng(6) });
strat.pile = [{ id: '3C', rank: '3', suit: 'C' }];
strat.turn = 0;
strat.phase = 'playing';
strat.players[0].hand = [
  { id: 'KH', rank: 'K', suit: 'H' },
  { id: '9D', rank: '9', suit: 'D' },
];
const stratMoves = E.legalMoves(strat, 0);
must(stratMoves.some((m) => m.type === 'play' && m.rank === 'K'), 'a King can still beat a 3');
must(stratMoves.some((m) => m.type === 'pickup'), 'Take pile stays available as a strategic choice');
const evStrat = E.applyMove(strat, { type: 'pickup', seat: 0 });
must(evStrat.some((e) => e.type === 'pickup'), 'strategic pickup is applied even when a play was legal');
must(strat.pile.length === 0, 'strategic pickup empties the pile');
must(strat.players[0].hand.some((c) => c.id === '3C'), 'strategic pickup takes the pile into hand');
must(strat.turn === 1, 'strategic pickup ends the turn');
must(!E.legalMoves(strat, 1).some((m) => m.type === 'pickup'), 'empty pile has no pickup');

const botMatch = E.newMatch({ seats: 2, difficulty: 'Easy', rng: seededRng(9) });
botMatch.turn = 1;
const botMove = E.chooseBotMove(botMatch, botMatch.players[1], seededRng(11));
must(botMove && botMove.type, 'easy bot returns a move');

must(E.payoutFor(1, 30, 4) === 60, '4p 1st is 50% of pool');
must(E.payoutFor(4, 30, 4) === 0, '4p last takes nothing');

const dealtSorted = E.newMatch({ seats: 2, rng: seededRng(7) });
const dealtOrder = dealtSorted.players[0].hand.map((c) => E.faceOrder(c.rank));
must(dealtOrder.length === 2 && dealtOrder[0] <= dealtOrder[1], 'dealt hand is already lowest to highest');

const sortDraw = E.newMatch({ seats: 2, rng: seededRng(12) });
sortDraw.turn = 0;
sortDraw.phase = 'playing';
sortDraw.pile = [{ id: '3H', rank: '3', suit: 'H' }];
sortDraw.draw = [
  { id: 'AH', rank: 'A', suit: 'H' },
  { id: '2C', rank: '2', suit: 'C' },
];
sortDraw.players[0].hand = [
  { id: '4S', rank: '4', suit: 'S' },
  { id: 'KH', rank: 'K', suit: 'H' },
];
E.applyMove(sortDraw, { type: 'play', seat: 0, cardIds: ['4S'] });
must(sortDraw.players[0].hand.map((c) => c.rank).join() === '2,K', 'drawn cards land in ascending rank order');
must(sortDraw.draw.map((c) => c.id).join() === 'AH', 'un-drawn stock stays on the pile');

const emptyDraw = E.newMatch({ seats: 2, rng: seededRng(12) });
emptyDraw.turn = 0;
emptyDraw.phase = 'playing';
emptyDraw.pile = [{ id: '3H', rank: '3', suit: 'H' }];
emptyDraw.draw = [{ id: '2C', rank: '2', suit: 'C' }];
emptyDraw.players[0].hand = [
  { id: '4S', rank: '4', suit: 'S' },
  { id: '9D', rank: '9', suit: 'D' },
];
E.applyMove(emptyDraw, { type: 'play', seat: 0, cardIds: ['4S'] });
must(emptyDraw.draw.length === 0, 'last stock cards leave the draw pile empty');
must(emptyDraw.players[0].hand.map((c) => c.rank).join() === '2,9', 'the last drawn card is sorted into the hand');

const sortPick = E.newMatch({ seats: 2, rng: seededRng(6) });
sortPick.pile = [
  { id: 'AS', rank: 'A', suit: 'S' },
  { id: '2C', rank: '2', suit: 'C' },
];
sortPick.turn = 0;
sortPick.phase = 'playing';
sortPick.players[0].hand = [
  { id: 'KH', rank: 'K', suit: 'H' },
  { id: '9D', rank: '9', suit: 'D' },
];
E.applyMove(sortPick, { type: 'pickup', seat: 0 });
must(sortPick.players[0].hand.map((c) => c.rank).join() === '2,9,K,A', 'pickup re-sorts the hand lowest to highest');

const unsorted = [
  { id: 'AH', rank: 'A', suit: 'H' },
  { id: '3C', rank: '3', suit: 'C' },
  { id: 'KH', rank: 'K', suit: 'H' },
  { id: '5D', rank: '5', suit: 'D' },
];
must(E.sortHand(unsorted).map((c) => c.rank).join() === '3,5,K,A', 'sortHand is 2–A ascending');

const winEarly = E.newMatch({ seats: 4, rng: seededRng(40) });
winEarly.draw = [];
winEarly.pile = [{ id: '3C', rank: '3', suit: 'C' }];
winEarly.turn = 0;
winEarly.phase = 'playing';
winEarly.players[0].hand = [{ id: '9H', rank: '9', suit: 'H' }];
winEarly.players[0].up = [];
winEarly.players[0].down = [];
winEarly.players[1].hand = [{ id: '8H', rank: '8', suit: 'H' }];
winEarly.players[2].hand = [{ id: '7H', rank: '7', suit: 'H' }];
winEarly.players[3].hand = [{ id: '6H', rank: '6', suit: 'H' }];
const evWin = E.applyMove(winEarly, { type: 'play', seat: 0, cardIds: ['9H'], zone: 'hand' });
must(winEarly.players[0].out && winEarly.players[0].place === 1, 'emptying all cards finishes 1st');
must(evWin.some((e) => e.type === 'out' && e.seat === 0 && e.place === 1), '1st place is an out event');
must(!winEarly.ended, 'the match keeps running for everyone else after 1st');
must(winEarly.turn !== 0, 'the winner does not take another turn');
must(winEarly.players.filter((p) => !p.out).length === 3, 'three players remain after 1st goes out');
must(html.includes('humanFinishedMatch()') && html.includes('settleIfDone()'), 'the UI leaves as soon as the local player is out even if the engine match continues');

const winSecond = E.newMatch({ seats: 4, rng: seededRng(41) });
winSecond.draw = [];
winSecond.pile = [{ id: '3C', rank: '3', suit: 'C' }];
winSecond.turn = 1;
winSecond.phase = 'playing';
winSecond.players[0].hand = [];
winSecond.players[0].up = [];
winSecond.players[0].down = [];
winSecond.players[0].out = true;
winSecond.players[0].place = 1;
winSecond.finishOrder = [0];
winSecond.players[1].hand = [{ id: '9H', rank: '9', suit: 'H' }];
winSecond.players[1].up = [];
winSecond.players[1].down = [];
winSecond.players[2].hand = [{ id: '7H', rank: '7', suit: 'H' }];
winSecond.players[3].hand = [{ id: '6H', rank: '6', suit: 'H' }];
const evSecond = E.applyMove(winSecond, { type: 'play', seat: 1, cardIds: ['9H'], zone: 'hand' });
must(winSecond.players[1].out && winSecond.players[1].place === 2, 'emptying all cards in 2nd still finishes that seat');
must(evSecond.some((e) => e.type === 'out' && e.seat === 1 && e.place === 2), '2nd place is an out event');
must(!winSecond.ended, 'the match keeps running after 2nd goes out');
must(E.isBuyInUnlocked({ medium: 0, hard: -1, expert: -1 }, 'Easy', 30), 'easy 30 always unlocked');
must(!E.isBuyInUnlocked({ medium: 0, hard: -1, expert: -1 }, 'Medium', 200), 'medium 200 starts locked');
const unlocked = E.nextUnlocks({ medium: 0, hard: -1, expert: -1 }, 'Medium', 100, true);
must(E.isBuyInUnlocked(unlocked, 'Medium', 200), 'winning medium 100 unlocks 200');
must(E.BUYINS.Easy[0] === 30 && E.BUYINS.Medium[0] === 100 && E.BUYINS.Hard[0] === 500 && E.BUYINS.Expert[0] === 1200, 'coin ladder is unchanged');
must(html.includes("unlocks: { ...defaultState().unlocks, ...(src.unlocks || {}) }"), 'imports keep existing unlocks');
must(html.includes("const STORE_KEY = 'palaceCards_v1'"), 'save key is still palaceCards_v1');

const groupCards = [
  { id: '4S', rank: '4', suit: 'S' },
  { id: '4H', rank: '4', suit: 'H' },
  { id: '4D', rank: '4', suit: 'D' },
  { id: '4C', rank: '4', suit: 'C' },
  { id: '5S', rank: '5', suit: 'S' },
  { id: '5H', rank: '5', suit: 'H' },
  { id: 'AH', rank: 'A', suit: 'H' },
  { id: 'AS', rank: 'A', suit: 'S' },
  { id: 'KS', rank: 'K', suit: 'S' },
  { id: 'KH', rank: 'K', suit: 'H' },
];
must(E.isAutoGroupedRank('4') && E.isAutoGroupedRank('K') && E.isAutoGroupedRank('J'), 'regular ranks auto-group');
must(!E.isAutoGroupedRank('2') && !E.isAutoGroupedRank('5') && !E.isAutoGroupedRank('10') && !E.isAutoGroupedRank('A'), '2/5/10/Ace are single-select by default');
must(!E.isSpecial('A'), 'Ace is grouping-special only — engine specials stay 2/5/10');
must(E.defaultRankSelection(groupCards, '4H').join(',') === '4S,4H,4D,4C', 'touching a regular rank selects every copy');
must(E.defaultRankSelection(groupCards, '5H').join(',') === '5H', 'touching a special rank selects only that copy');
must(E.defaultRankSelection(groupCards, 'AH').join(',') === 'AH', 'touching an Ace selects only that Ace');
{
  let sel = E.defaultRankSelection(groupCards, '4S');
  must(sel.length === 4, 'four-of-a-kind starts at 4');
  sel = E.nextRankSelection(groupCards, sel, '4S');
  must(sel.join(',') === '4H,4D,4C', 'first tap drops the tapped copy');
  sel = E.nextRankSelection(groupCards, sel, '4H');
  must(sel.join(',') === '4D,4C', 'second tap drops one more');
  sel = E.nextRankSelection(groupCards, sel, '4D');
  must(sel.join(',') === '4C', 'third tap leaves one');
  sel = E.nextRankSelection(groupCards, sel, '4C');
  must(sel.join(',') === '4S,4H,4D,4C', 'tap at 1 wraps back to all copies');
  sel = E.nextRankSelection(groupCards, sel, '4S');
  must(sel.length === 3, 'the cycle repeats');
}
{
  let sel = E.defaultRankSelection(groupCards, '5S');
  must(sel.join(',') === '5S', 'two 5s start as one');
  sel = E.nextRankSelection(groupCards, sel, '5H');
  must(sel.join(',') === '5S,5H', 'tapping the other 5 adds it');
  sel = E.nextRankSelection(groupCards, sel, '5H');
  must(sel.join(',') === '5S', 'tapping an extra 5 can drop it back to one');
  sel = E.nextRankSelection(groupCards, [], 'AH');
  must(sel.join(',') === 'AH', 'empty Ace selection defaults to one');
  sel = E.nextRankSelection(groupCards, sel, 'AS');
  must(sel.join(',') === 'AH,AS', 'Aces build up one tap at a time');
}
must(E.ensureRankSelection(groupCards, ['4H', '4D'], '4S').join(',') === '4H,4D', 'carry keeps a pared same-rank selection');
must(E.ensureRankSelection(groupCards, ['4H', '4D'], 'KS').join(',') === 'KS,KH', 'carry on a new regular rank starts a fresh auto-group');
must(E.ensureRankSelection(groupCards, [], '4S').length === 4, 'empty carry auto-groups regulars');
must(E.ensureRankSelection(groupCards, [], '5S').join(',') === '5S', 'empty carry on a special stays single');
must(E.nextRankSelection(groupCards, ['4S', '4H', '4D', '4C'], '5S').join(',') === '5S', 'tapping a different rank replaces the selection');

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

must(html.includes('id="lobbyOverlay"') && html.includes('id="joinOverlay"') && html.includes('id="nameSetupOverlay"'), 'lobby, join, and name setup overlays required');
must(html.includes('Join Session') && html.includes('data-mode="join"'), 'Ranked tile is Join Session');
must(!html.includes('data-mode="ranked"'), 'ranked mode tile is gone');
must(html.includes('palace-net.js') && html.includes('function openLobby'), 'net + lobby helpers are loaded');
must(html.includes("openLobby({ mode: mode === 'custom' ? 'custom' : 'practice'"), 'practice and custom Start open the lobby');
must(html.includes("openLobby({ mode: 'standard'"), 'standard Start opens the lobby');
must(!html.includes("startMatch({ mode: 'practice'"), 'practice Start does not skip the lobby');
must(!html.includes("startMatch({ mode: 'standard', seats: 4"), 'standard Start does not skip the lobby');
must(html.includes('function openNameSetup') && html.includes('makeProfileId'), 'nameless players get a name + unique ID');
must(html.includes('type: \'invite\'') && html.includes('inviteAcceptBtn') && html.includes('new Notification'), 'lobby invites are in-app plus push');
must(html.includes('function seatScreenPlace') && html.includes('const place = seatScreenPlace(p.seat, n, match.humanSeat)'), 'table rotates around the local player');
must(html.includes('function localHumanSeat') && html.includes('seatIndexForLocalPlayer'), 'each client resolves its own seat from profile id');
must(html.includes('lobby-pads') && html.includes('lobby-pad') && html.includes('openLobbyInviteSheet'), 'lobby uses compact avatar pads with + invite');
must(!html.includes('lobby-slot') && !html.includes('Tap to invite a friend'), 'full-width open-seat rows are gone');
{
  const rf = html.slice(html.indexOf('function renderFriends'), html.indexOf('function renderSettings'));
  must(rf.includes('friendPresenceLine') && rf.includes('Online'), 'friends list shows online status');
  must(rf.includes('Last online') || html.includes("return formatLastOnline"), 'offline friends use last-seen copy');
  must(!rf.includes('inv-btn') && !rf.includes('>Invite<'), 'friends tab is not an invite launcher');
}
must(html.includes('INVITE_COOL_MS = 5000'), 'invite cooldown is 5 seconds');
must(html.includes('function armInviteCooldown') && html.includes('function inviteOnCooldown'), 'invite cooldown helpers exist');
must(html.includes('armInviteCooldown(\'friend\'') && html.includes('armInviteCooldown(\'seat\''), 'invite cooldown keys friend and seat');
must(html.includes('.inv-btn') && html.includes('border-radius: 100px') && html.includes('rgba(18, 16, 25, 0.78)'), 'action buttons share the HUD pill panel');
{
  const start = html.indexOf('function formatLastOnline');
  const end = html.indexOf('\nfunction friendLastSeen', start);
  must(start > 0 && end > start, 'formatLastOnline is defined');
  const formatLastOnline = new Function(html.slice(start, end) + '; return formatLastOnline;')();
  const now = 1700000000000;
  must(formatLastOnline(now - 5 * 60 * 1000, now) === 'Last online 5 minutes ago', 'last seen 5 minutes');
  must(formatLastOnline(now - 3 * 60 * 60 * 1000, now) === 'Last online 3 hours ago', 'last seen 3 hours');
  must(formatLastOnline(now - 2 * 24 * 60 * 60 * 1000, now) === 'Last online 2 days ago', 'last seen 2 days');
  must(formatLastOnline(0, now) === 'Offline', 'never seen stays Offline');
  must(formatLastOnline(now - 1000, now) === 'Last online just now', 'sub-minute last seen');
}

const Net = require(join(root, 'palace-net.js'));
must(typeof Net.topic === 'function' && Net.topic('l', 'ABC12') === 'pal1labc12', 'lobby topic is compact');

const twoHumans = E.newMatch({
  roster: [
    { name: 'Host', bot: false, id: 'HOST1' },
    { name: 'Guest', bot: false, id: 'GUEST1' },
  ],
  humanSeat: 0,
  rng: seededRng(3),
});
must(twoHumans.players.length === 2 && !twoHumans.players[0].isBot && !twoHumans.players[1].isBot, 'roster can seat two humans');
must(twoHumans.players[1].profileId === 'GUEST1', 'roster keeps profile ids');
const packed = E.packMatch(twoHumans);
must(packed && JSON.stringify(packed).length < 3500, 'packed match fits a ntfy payload');
const back = E.unpackMatch(packed, 1);
must(back.humanSeat === 1 && back.players[1].hand.length === E.HAND_SIZE, 'guest hydrates from a host snapshot');
must(back.players[0].hand[0].rank && back.players[0].hand[0].suit, 'unpacked cards keep rank and suit');

function seatScreenPlace(seat, n, you) {
  const map = {
    2: ['south', 'north'],
    3: ['south', 'east', 'west'],
    4: ['south', 'east', 'north', 'west'],
  };
  const base = map[n];
  const rel = ((seat - you) % n + n) % n;
  return base[rel];
}
must(seatScreenPlace(0, 2, 0) === 'south' && seatScreenPlace(1, 2, 0) === 'north', '2p host: self south, friend north');
must(seatScreenPlace(1, 2, 1) === 'south' && seatScreenPlace(0, 2, 1) === 'north', '2p guest: self south, host north');
must(seatScreenPlace(0, 3, 1) === 'west' && seatScreenPlace(1, 3, 1) === 'south' && seatScreenPlace(2, 3, 1) === 'east', '3p seat 1 rotation');
must(seatScreenPlace(2, 4, 2) === 'south' && seatScreenPlace(3, 4, 2) === 'east' && seatScreenPlace(0, 4, 2) === 'north' && seatScreenPlace(1, 4, 2) === 'west', '4p seat 2 rotation');
must(seatScreenPlace(0, 4, 3) === 'east' && seatScreenPlace(3, 4, 3) === 'south', '4p last seat is south for that client');

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
