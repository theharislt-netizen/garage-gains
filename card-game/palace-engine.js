/**
 * PALACE / Shithead rules engine (pure state, no DOM).
 * Specials: 2 reset, 5 reset+bonus (bonus 5s chain), 10 burn, four-of-a-kind burn.
 */
(function (root, factory) {
  const engine = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  root.PalaceEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SUITS = ['S', 'H', 'D', 'C'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const HAND_SIZE = 2;
  const TABLE_UP = 3;
  const TABLE_DOWN = 3;
  const SPECIALS = { '2': true, '5': true, '10': true };
  // Grouping-only: 2/5/10/Ace start as a single card. Regular ranks auto-select every copy.
  // Engine play rules still use SPECIALS (Ace is not a 2/5/10).
  const GROUP_SPECIALS = { '2': true, '5': true, '10': true, A: true };
  const BUYINS = {
    Easy: [30],
    Medium: [100, 200, 300],
    Hard: [500, 700, 900],
    Expert: [1200, 1500, 1800],
  };
  const XP_WIN = { Easy: 50, Medium: 100, Hard: 150, Expert: 200 };
  const BOT_NAMES = ['Ace', 'Bluff', 'Queen', 'Dealer', 'Hex', 'Nova'];

  function suitGlyph(s) {
    return { S: '♠', H: '♥', D: '♦', C: '♣' }[s] || s;
  }
  function isRed(s) { return s === 'H' || s === 'D'; }
  function isSpecial(rank) { return !!SPECIALS[rank]; }
  function isAutoGroupedRank(rank) { return !GROUP_SPECIALS[rank]; }

  function rankCopyIds(cards, rank) {
    return (cards || []).filter((c) => c.rank === rank).map((c) => c.id);
  }

  function defaultRankSelection(cards, touchedId) {
    const card = (cards || []).find((c) => c.id === touchedId);
    if (!card) return [];
    if (isAutoGroupedRank(card.rank)) return rankCopyIds(cards, card.rank);
    return [card.id];
  }

  function nextRankSelection(cards, currentIds, tappedId) {
    const list = cards || [];
    const tapped = list.find((c) => c.id === tappedId);
    if (!tapped) return (currentIds || []).slice();
    const current = (currentIds || []).filter((id) => list.some((c) => c.id === id));
    const first = list.find((c) => c.id === current[0]);
    if (!current.length || !first || first.rank !== tapped.rank) {
      return defaultRankSelection(list, tappedId);
    }
    const allIds = rankCopyIds(list, tapped.rank);
    if (isAutoGroupedRank(tapped.rank)) {
      const selected = current.filter((id) => allIds.includes(id));
      if (selected.length <= 1) return allIds.slice();
      if (selected.includes(tappedId)) return selected.filter((id) => id !== tappedId);
      return selected.slice(0, -1);
    }
    if (current.includes(tappedId)) {
      const next = current.filter((id) => id !== tappedId);
      return next.length ? next : [tappedId];
    }
    return current.concat([tappedId]);
  }

  function ensureRankSelection(cards, currentIds, touchedId) {
    const list = cards || [];
    const touched = list.find((c) => c.id === touchedId);
    if (!touched) return (currentIds || []).slice();
    const current = (currentIds || []).filter((id) => list.some((c) => c.id === id));
    const first = list.find((c) => c.id === current[0]);
    if (current.length && first && first.rank === touched.rank) {
      const live = rankCopyIds(list, touched.rank);
      const kept = current.filter((id) => live.includes(id));
      return kept.length ? kept : defaultRankSelection(list, touchedId);
    }
    return defaultRankSelection(list, touchedId);
  }

  function rankValue(rank) {
    const map = { '3': 1, '4': 2, '6': 3, '7': 4, '8': 5, '9': 6, J: 7, Q: 8, K: 9, A: 10 };
    return map[rank] || 0;
  }

  function faceOrder(rank) {
    const map = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
    return map[rank] || 0;
  }

  function makeDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ id: rank + suit, rank, suit });
      }
    }
    return deck;
  }

  function shuffle(arr, rng) {
    const rand = rng || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function cloneCard(c) {
    return { id: c.id, rank: c.rank, suit: c.suit };
  }

  function topCard(match) {
    return match.pile.length ? match.pile[match.pile.length - 1] : null;
  }

  function pileIsReset(match) {
    const top = topCard(match);
    if (!top) return true;
    return top.rank === '2' || top.rank === '5';
  }

  function canPlayCardOnPile(match, card) {
    if (!match.pile.length || pileIsReset(match)) return true;
    if (isSpecial(card.rank)) return true;
    const top = topCard(match);
    if (isSpecial(top.rank) && top.rank !== '2' && top.rank !== '5') {
      return isSpecial(card.rank) || rankValue(card.rank) >= rankValue(top.rank);
    }
    return rankValue(card.rank) >= rankValue(top.rank);
  }

  function canPlayCards(match, cards, bonus) {
    if (!cards || !cards.length) return false;
    const rank = cards[0].rank;
    if (!cards.every((c) => c.rank === rank)) return false;
    return canPlayCardOnPile(match, cards[0]);
  }

  function completesFour(pile) {
    if (pile.length < 4) return false;
    const r = pile[pile.length - 1].rank;
    let n = 0;
    for (let i = pile.length - 1; i >= 0; i--) {
      if (pile[i].rank === r) n += 1;
      else break;
    }
    return n >= 4;
  }

  function stockEmpty(match) {
    return !!(match && match.draw && match.draw.length === 0);
  }

  function tableStagesOpen(match, player) {
    return !!(player && !player.out && !player.hand.length && stockEmpty(match));
  }

  function activeZone(player, match) {
    if (!player || player.out) return 'out';
    if (player.hand.length) return 'hand';
    // Missing match or a live draw pile: stay on Stage 1. Same gate for humans and bots.
    if (!match || !stockEmpty(match)) return 'hand';
    if (player.up.length) return 'up';
    if (player.down.length) return 'down';
    return 'out';
  }

  function zoneCards(player, match) {
    const z = activeZone(player, match);
    if (z === 'hand') return player.hand;
    if (z === 'up') return player.up;
    if (z === 'down') return player.down;
    return [];
  }

  function livingSeats(match) {
    return match.players.map((p, i) => (p.out ? -1 : i)).filter((i) => i >= 0);
  }

  function nextSeat(match, from) {
    const n = match.players.length;
    for (let i = 1; i <= n; i++) {
      const s = (from + i) % n;
      if (!match.players[s].out) return s;
    }
    return from;
  }

  function drawFromPile(match, player, n, events) {
    let took = 0;
    while (took < n && match.draw.length) {
      const c = match.draw.pop();
      player.hand.push(c);
      took += 1;
      if (events) events.push({ type: 'draw', seat: player.seat, card: c });
    }
    if (took) player.hand = sortHand(player.hand);
    if (!match.draw.length && !match.drawEmptyAt && match.started) {
      match.drawEmptyAt = {
        circulating: match.players.reduce((s, p) => s + p.hand.length + p.up.length + p.down.length, 0),
      };
    }
    return took;
  }

  function pickupFaceUpIfStageTwo(match, player, events) {
    if (!tableStagesOpen(match, player) || !player.up.length) return false;
    const cards = player.up.splice(0, player.up.length);
    player.hand.push(...cards);
    player.hand = sortHand(player.hand);
    if (events) events.push({ type: 'stageUp', seat: player.seat, cards: cards.map(cloneCard) });
    return true;
  }

  function takeDownToHand(player, index, events) {
    if (!player || !player.down.length) return null;
    const idx = Math.max(0, Math.min(player.down.length - 1, index | 0));
    const card = player.down.splice(idx, 1)[0];
    player.hand.push(card);
    player.hand = sortHand(player.hand);
    if (events) events.push({ type: 'stageDown', seat: player.seat, card: cloneCard(card), index: idx });
    return card;
  }

  function pickupOneDownIfStageThree(match, player, events, index) {
    if (!tableStagesOpen(match, player) || player.up.length || !player.down.length) return null;
    return takeDownToHand(player, index == null ? 0 : index, events);
  }

  function refillFromStock(match, player, events) {
    if (!player || player.out || !match) return;
    const need = HAND_SIZE - player.hand.length;
    if (need > 0 && match.draw.length) drawFromPile(match, player, need, events);
  }

  function syncSeat(match, player, events) {
    refillFromStock(match, player, events);
    pickupFaceUpIfStageTwo(match, player, events);
  }

  function drawUp(match, player, events) {
    // Draw from stock first. Face-up/down stages only open after the stock is empty.
    syncSeat(match, player, events);
  }

  function drawFloorBeforeFive(match, player, fiveCount, events) {
    while (player.hand.length - fiveCount < HAND_SIZE && match.draw.length) {
      drawFromPile(match, player, 1, events);
    }
  }

  function takeCards(player, zone, ids) {
    const src = zone === 'up' ? player.up : zone === 'down' ? player.down : player.hand;
    const taken = [];
    ids.forEach((id) => {
      const i = src.findIndex((c) => c.id === id);
      if (i >= 0) taken.push(src.splice(i, 1)[0]);
    });
    return taken;
  }

  function sortHand(cards) {
    return cards.slice().sort((a, b) => faceOrder(a.rank) - faceOrder(b.rank) || a.suit.localeCompare(b.suit));
  }

  function groupByRank(cards) {
    const map = {};
    cards.forEach((c) => {
      if (!map[c.rank]) map[c.rank] = [];
      map[c.rank].push(c);
    });
    return Object.keys(map).map((rank) => ({ rank, cards: map[rank] }));
  }

  function legalMoves(match, seat) {
    const player = match.players[seat];
    if (!player || player.out || match.ended) return [];
    const bonus = match.phase === 'bonus';
    const zone = activeZone(player, match);
    if (zone === 'out') return [];
    if (zone === 'up' || zone === 'down') {
      if (!tableStagesOpen(match, player)) return match.pile.length && !bonus
        ? [{ type: 'pickup', seat }]
        : [];
    }
    if (zone === 'down') {
      const flips = player.down.map((c, i) => ({ type: 'flip', seat, index: i, zone: 'down' }));
      if (!bonus && match.pile.length) flips.push({ type: 'pickup', seat });
      return flips;
    }
    const cards = zone === 'up' ? player.up : player.hand;
    const groups = groupByRank(cards);
    const moves = [];
    groups.forEach((g) => {
      g.cards.forEach((c) => {
        if (canPlayCards(match, [c], bonus)) {
          moves.push({
            type: 'play',
            seat,
            zone,
            cardIds: [c.id],
            rank: g.rank,
            count: 1,
          });
        }
      });
      for (let n = 2; n <= g.cards.length; n++) {
        const set = g.cards.slice(0, n);
        if (canPlayCards(match, set, bonus)) {
          moves.push({
            type: 'play',
            seat,
            zone,
            cardIds: set.map((c) => c.id),
            rank: g.rank,
            count: n,
          });
        }
      }
    });
    if (!bonus && match.pile.length) moves.push({ type: 'pickup', seat });
    return moves;
  }

  function markOut(match, player, events) {
    if (player.out) return;
    if (player.hand.length || player.up.length || player.down.length) return;
    player.out = true;
    player.place = match.finishOrder.length + 1;
    match.finishOrder.push(player.seat);
    events.push({ type: 'out', seat: player.seat, place: player.place, name: player.name });
  }

  function maybeEnd(match, events) {
    const alive = match.players.filter((p) => !p.out);
    if (alive.length <= 1) {
      if (alive.length === 1) {
        alive[0].out = true;
        alive[0].place = match.players.length;
        match.finishOrder.push(alive[0].seat);
        events.push({ type: 'out', seat: alive[0].seat, place: alive[0].place, name: alive[0].name, loser: true });
      }
      match.ended = true;
      match.phase = 'ended';
      events.push({ type: 'end', finishOrder: match.finishOrder.slice() });
    }
  }

  function applyPlay(match, player, cards, events, opts) {
    match.pile.push(...cards);
    events.push({ type: 'play', seat: player.seat, cards: cards.map(cloneCard), from: opts.from, bonus: !!opts.bonus });

    const rank = cards[0].rank;
    const four = completesFour(match.pile);
    const burn = rank === '10' || four;

    if (burn) {
      const burnt = match.pile.splice(0);
      match.burned.push(...burnt);
      events.push({ type: 'burn', seat: player.seat, cards: burnt.map(cloneCard), fourKind: four });
    } else if (rank === '2' || rank === '5') {
      events.push({ type: 'reset', seat: player.seat, rank });
    }

    markOut(match, player, events);
    if (match.ended) return events;
    maybeEnd(match, events);
    if (match.ended) return events;

    if (player.out) {
      match.phase = 'playing';
      match.turn = nextSeat(match, player.seat);
      return events;
    }

    // Stage 1→2 scoop, then Stage 3, BEFORE the 5 bonus / draw-up-to-2 check.
    pickupFaceUpIfStageTwo(match, player, events);
    // Every 5 — opening play or bonus card — resets and grants another bonus play.
    if (rank === '5' && !burn) {
      // Humans choose which face-down slot to flip as the bonus. Bots auto-pick.
      if (player.isBot) pickupOneDownIfStageThree(match, player, events);
      drawFloorBeforeFive(match, player, 0, events);
      if (zoneCards(player, match).length) {
        match.phase = 'bonus';
        return events;
      }
    }

    match.phase = 'playing';
    drawUp(match, player, events);
    markOut(match, player, events);
    maybeEnd(match, events);
    if (!match.ended) match.turn = nextSeat(match, player.seat);
    return events;
  }

  function applyMove(match, move) {
    const events = [];
    if (!match || match.ended) return events;
    const player = match.players[move.seat];
    if (!player || player.out) return events;
    if (move.seat !== match.turn) return events;

    if (move.type === 'pickup') {
      if (match.phase === 'bonus') return events;
      if (!match.pile.length) return events;
      const taken = match.pile.splice(0);
      player.hand.push(...taken);
      player.hand = sortHand(player.hand);
      events.push({ type: 'pickup', seat: player.seat, cards: taken.map(cloneCard) });
      match.phase = 'playing';
      match.turn = nextSeat(match, player.seat);
      return events;
    }

    if (move.type === 'flip') {
      if (!tableStagesOpen(match, player) || player.up.length) return events;
      if (activeZone(player, match) !== 'down') return events;
      if (!player.down.length) return events;
      const idx = Math.max(0, Math.min(player.down.length - 1, move.index | 0));
      const card = player.down.splice(idx, 1)[0];
      if (!card) return events;
      events.push({ type: 'flip', seat: player.seat, card: cloneCard(card), index: idx });
      const bonus = match.phase === 'bonus';
      if (canPlayCards(match, [card], bonus)) {
        return applyPlay(match, player, [card], events, { from: 'down', bonus });
      }
      const taken = match.pile.splice(0);
      player.hand.push(card, ...taken);
      player.hand = sortHand(player.hand);
      events.push({
        type: 'pickup',
        seat: player.seat,
        cards: [cloneCard(card), ...taken.map(cloneCard)],
        private: true,
      });
      match.phase = 'playing';
      match.turn = nextSeat(match, player.seat);
      return events;
    }

    if (move.type === 'play') {
      const bonus = match.phase === 'bonus';
      const useZone = activeZone(player, match);
      if ((useZone === 'up' || useZone === 'down' || move.zone === 'up' || move.zone === 'down')
          && !tableStagesOpen(match, player)) {
        return events;
      }
      const cards = takeCards(player, useZone, move.cardIds || []);
      if (!cards.length) return events;
      if (!canPlayCards(match, cards, bonus)) {
        const dest = useZone === 'up' ? player.up : player.hand;
        dest.push(...cards);
        return events;
      }
      return applyPlay(match, player, cards, events, { from: useZone, bonus });
    }
    return events;
  }

  function weakUp(player) {
    if (!player.up.length) return true;
    const avg = player.up.reduce((s, c) => s + faceOrder(c.rank), 0) / player.up.length;
    return avg < 9;
  }

  function chooseBotMove(match, player, rng) {
    const rand = rng || Math.random;
    const seat = player.seat;
    syncSeat(match, player);
    // Same legalMoves / activeZone / tableStagesOpen gate as the human player.
    const moves = legalMoves(match, seat);
    if (!moves.length) return { type: 'pickup', seat };
    if (match.phase === 'bonus') {
      const plays = moves.filter((m) => m.type === 'play');
      plays.sort((a, b) => faceOrder(a.rank) - faceOrder(b.rank));
      return plays[0] || moves[0];
    }
    const flips = moves.filter((m) => m.type === 'flip');
    if (flips.length) return flips[0];
    const plays = moves.filter((m) => m.type === 'play');
    if (!plays.length) return moves[0];

    const diff = player.difficulty || 'Easy';
    const holdFive = { Easy: 0, Medium: 0.7, Hard: 0.9, Expert: 0.95 }[diff] || 0;
    const shedLow = { Easy: 0.2, Medium: 0.7, Hard: 0.85, Expert: 0.9 }[diff] || 0.5;
    const multiP = { Easy: 0.4, Medium: 0.8, Hard: 1, Expert: 1 }[diff] || 0.5;
    const tradeoff = { Easy: 0, Medium: 0.5, Hard: 1, Expert: 1 }[diff] || 0;
    const loading = { Easy: 0, Medium: 0.6, Hard: 1, Expert: 1 }[diff] || 0;

    function pickCount(rankPlays) {
      rankPlays.sort((a, b) => b.count - a.count);
      const max = rankPlays[0];
      if (max.count > 1 && rand() < multiP) return max;
      return rankPlays.find((p) => p.count === 1) || max;
    }

    const byRank = {};
    plays.forEach((m) => {
      if (!byRank[m.rank]) byRank[m.rank] = [];
      byRank[m.rank].push(m);
    });
    let candidates = Object.keys(byRank).map((rank) => pickCount(byRank[rank]));

    const nonFive = candidates.filter((m) => m.rank !== '5');
    if (candidates.some((m) => m.rank === '5') && nonFive.length && rand() < holdFive) {
      candidates = nonFive;
    }

    const has2 = candidates.find((m) => m.rank === '2');
    const has10 = candidates.find((m) => m.rank === '10');
    if (has2 && has10 && rand() < tradeoff && match.draw.length > 8 && weakUp(player)) {
      return has10;
    }

    const next = match.players[nextSeat(match, seat)];
    if (next && !next.out && loading > 0 && rand() < loading) {
      const nz = activeZone(next, match);
      if (nz === 'up' || nz === 'down') {
        const nextMax = next.up.reduce((m, c) => Math.max(m, rankValue(c.rank)), 0);
        const loaders = candidates.filter((m) => !isSpecial(m.rank) && rankValue(m.rank) > nextMax);
        if (loaders.length) {
          loaders.sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
          return loaders[0];
        }
      }
    }

    if (rand() < shedLow) {
      candidates.sort((a, b) => faceOrder(a.rank) - faceOrder(b.rank));
    } else {
      candidates.sort((a, b) => faceOrder(b.rank) - faceOrder(a.rank));
    }
    if (diff === 'Easy') {
      candidates.sort((a, b) => faceOrder(a.rank) - faceOrder(b.rank));
    }
    return candidates[0];
  }

  function firstSeat(match) {
    for (let i = 0; i < match.players.length; i++) {
      if (match.players[i].hand.some((c) => c.rank === '3')) return i;
    }
    return 0;
  }

  function dealMatch(match, deck) {
    match.players.forEach((p) => {
      p.down = [];
      p.up = [];
      p.hand = [];
      for (let i = 0; i < TABLE_DOWN; i++) p.down.push(deck.pop());
      for (let i = 0; i < TABLE_UP; i++) p.up.push(deck.pop());
      for (let i = 0; i < HAND_SIZE; i++) p.hand.push(deck.pop());
      p.hand = sortHand(p.hand);
    });
    match.draw = deck;
    match.pile = [];
    match.turn = firstSeat(match);
  }

  function newMatch(opts) {
    const o = opts || {};
    const seats = Math.max(2, Math.min(4, o.seats || 4));
    const difficulty = o.difficulty || 'Easy';
    const humanSeat = o.humanSeat == null ? 0 : o.humanSeat;
    const rng = o.rng || Math.random;
    const names = o.names || [];
    const roster = Array.isArray(o.roster) ? o.roster : null;
    const players = [];
    const seatCount = roster && roster.length ? Math.max(2, Math.min(4, roster.length)) : seats;
    for (let i = 0; i < seatCount; i++) {
      const row = roster && roster[i] ? roster[i] : null;
      const isBot = row ? !!row.bot : i !== humanSeat;
      players.push({
        seat: i,
        name: (row && row.name) || names[i] || (isBot ? BOT_NAMES[i % BOT_NAMES.length] : 'You'),
        isBot,
        profileId: row && row.id ? row.id : null,
        difficulty,
        hand: [],
        up: [],
        down: [],
        out: false,
        place: 0,
      });
    }
    const match = {
      id: o.id || 'm' + Date.now(),
      mode: o.mode || 'standard',
      practiceSub: o.practiceSub || null,
      difficulty,
      buyIn: o.buyIn || 0,
      players,
      draw: [],
      pile: [],
      burned: [],
      turn: 0,
      phase: 'playing',
      ended: false,
      finishOrder: [],
      started: true,
      drawEmptyAt: null,
      humanSeat,
    };
    const deck = o.deck ? o.deck.slice() : shuffle(makeDeck(), rng);
    dealMatch(match, deck);
    return match;
  }

  function cardFromId(id) {
    if (!id) return null;
    if (typeof id === 'object') return cloneCard(id);
    const s = String(id);
    const suit = s.slice(-1);
    const rank = s.slice(0, -1);
    return { id: s, rank, suit };
  }

  function packCards(list) {
    return (list || []).map((c) => (c && c.id) || c).filter(Boolean);
  }

  function unpackCards(list) {
    return (list || []).map(cardFromId).filter(Boolean);
  }

  function packMatch(match) {
    if (!match) return null;
    return {
      id: match.id,
      mode: match.mode,
      practiceSub: match.practiceSub || null,
      difficulty: match.difficulty,
      buyIn: match.buyIn || 0,
      turn: match.turn,
      phase: match.phase,
      ended: !!match.ended,
      settled: !!match.settled,
      finishOrder: (match.finishOrder || []).slice(),
      drawEmptyAt: match.drawEmptyAt || null,
      d: packCards(match.draw),
      p: packCards(match.pile),
      b: packCards(match.burned),
      pl: (match.players || []).map((x) => ({
        s: x.seat,
        n: x.name,
        bot: !!x.isBot,
        id: x.profileId || null,
        o: !!x.out,
        pl: x.place || 0,
        h: packCards(x.hand),
        u: packCards(x.up),
        dn: packCards(x.down),
      })),
    };
  }

  function unpackMatch(raw, humanSeat) {
    const src = raw || {};
    return {
      id: src.id || 'm',
      mode: src.mode || 'standard',
      practiceSub: src.practiceSub || null,
      difficulty: src.difficulty || 'Easy',
      buyIn: src.buyIn || 0,
      players: (src.pl || []).map((x) => ({
        seat: x.s,
        name: x.n,
        isBot: !!x.bot,
        profileId: x.id || null,
        difficulty: src.difficulty || 'Easy',
        hand: unpackCards(x.h),
        up: unpackCards(x.u),
        down: unpackCards(x.dn),
        out: !!x.o,
        place: x.pl || 0,
      })),
      draw: unpackCards(src.d),
      pile: unpackCards(src.p),
      burned: unpackCards(src.b),
      turn: src.turn || 0,
      phase: src.phase || 'playing',
      ended: !!src.ended,
      finishOrder: src.finishOrder || [],
      started: true,
      drawEmptyAt: src.drawEmptyAt || null,
      humanSeat: humanSeat == null ? 0 : humanSeat,
      settled: !!src.settled,
    };
  }

  function payoutShare(place, seats) {
    if (seats <= 2) return place === 1 ? 1 : 0;
    if (seats === 3) return [0, 0.65, 0.35, 0][place] || 0;
    return [0, 0.5, 0.3, 0.2, 0][place] || 0;
  }

  function payoutFor(place, buyIn, seats) {
    return Math.round(buyIn * seats * payoutShare(place, seats));
  }

  function nextUnlocks(unlocks, difficulty, buyIn, won) {
    const u = Object.assign({ medium: 0, hard: -1, expert: -1 }, unlocks || {});
    if (!won) return u;
    const idx = (BUYINS[difficulty] || []).indexOf(buyIn);
    if (idx < 0) return u;
    if (difficulty === 'Easy') u.medium = Math.max(u.medium, 0);
    if (difficulty === 'Medium') {
      u.medium = Math.max(u.medium, idx + 1);
      if (idx >= 2) u.hard = Math.max(u.hard, 0);
    }
    if (difficulty === 'Hard') {
      u.hard = Math.max(u.hard, idx + 1);
      if (idx >= 2) u.expert = Math.max(u.expert, 0);
    }
    if (difficulty === 'Expert') u.expert = Math.max(u.expert, idx + 1);
    return u;
  }

  function isBuyInUnlocked(unlocks, difficulty, buyIn) {
    const u = Object.assign({ medium: 0, hard: -1, expert: -1 }, unlocks || {});
    const idx = (BUYINS[difficulty] || []).indexOf(buyIn);
    if (idx < 0) return false;
    if (difficulty === 'Easy') return true;
    if (difficulty === 'Medium') return idx <= u.medium;
    if (difficulty === 'Hard') return u.hard >= 0 && idx <= u.hard;
    if (difficulty === 'Expert') return u.expert >= 0 && idx <= u.expert;
    return false;
  }

  return {
    SUITS, RANKS, HAND_SIZE, TABLE_UP, TABLE_DOWN, BUYINS, XP_WIN, BOT_NAMES,
    suitGlyph, isRed, isSpecial, isAutoGroupedRank, rankValue, faceOrder,
    rankCopyIds, defaultRankSelection, nextRankSelection, ensureRankSelection,
    makeDeck, shuffle, cloneCard, topCard, canPlayCardOnPile, canPlayCards,
    completesFour, activeZone, zoneCards, tableStagesOpen, legalMoves, applyMove, chooseBotMove, syncSeat,
    newMatch, sortHand, payoutFor, nextUnlocks, isBuyInUnlocked, nextSeat, livingSeats,
    cardFromId, packMatch, unpackMatch,
  };
});
