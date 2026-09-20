#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const L = require(join(root, 'palace-lobby.js'));
const E = require(join(root, 'palace-engine.js'));
const html = readFileSync(join(root, 'card-game.html'), 'utf8');
const install = readFileSync(join(root, 'scripts/install-page.html'), 'utf8');
const prepare = readFileSync(join(root, 'scripts/prepare-www.mjs'), 'utf8');
const fails = [];
function must(cond, msg) { if (!cond) fails.push(msg); }

must(L.normalizeCode(' ab-12 ') === 'AB12', 'codes normalize to A-Z0-9');
must(L.readJoinCode('?join=7k2m9q', '') === '7K2M9Q', 'query join codes parse');
must(L.readJoinCode('', '#join=ABC234') === 'ABC234', 'hash join codes parse');
must(L.inviteLink('AB12CD', 'https://example.com/play/').includes('join=AB12CD'), 'invite links carry the code');
must(L.WEB_PLAY_URL.includes('/palace/play/'), 'public web table URL is set');

const host = { id: 'PHOST01', name: 'Haris' };
const lobby = L.createLobby({ mode: 'standard', seats: 4, difficulty: 'Easy', buyIn: 30 }, host);
must(lobby.code.length === 6, 'lobby codes are 6 characters');
must(lobby.seats.length === 4 && lobby.seats[0].kind === 'host', 'standard lobby has 4 seats, host in seat 1');
must(lobby.seats.filter((s) => s.kind === 'open').length === 3, 'three seats start open');

const guest = L.joinLobby(lobby, { id: 'PGUEST1', name: 'Ada' });
must(guest.ok && guest.seat === 1, 'first guest takes the first open seat');
must(lobby.seats[1].kind === 'human' && lobby.seats[1].name === 'Ada', 'joined seat is marked human');

const duel = L.createLobby({ mode: 'practice', practiceSub: 'duel', seats: 2, difficulty: 'Medium' }, host);
must(duel.seats.length === 2, 'duel lobby has 2 seats');

const opts = L.matchOpts(lobby);
must(opts.humanSeats.join(',') === '0,1', 'match opts keep host + guest as humans');
must(opts.names[1] === 'Ada' && opts.names[2] == null, 'open seats stay unnamed so the engine fills bots');

const match = E.newMatch({
  seats: opts.seats,
  difficulty: opts.difficulty,
  humanSeats: opts.humanSeats,
  names: ['Haris', 'Ada', null, null],
  rng: () => 0.2,
});
must(!match.players[0].isBot && !match.players[1].isBot, 'invited humans are not bots');
must(match.players[2].isBot && match.players[3].isBot, 'leftover seats are bots');

const timeoutSeat = match.players[0];
timeoutSeat.hand = [
  { id: 'KH', rank: 'K', suit: 'H' },
  { id: '4C', rank: '4', suit: 'C' },
];
match.pile = [{ id: '3D', rank: '3', suit: 'D' }];
match.turn = 0;
match.phase = 'playing';
const easy = E.chooseBotMove(match, Object.assign({}, timeoutSeat, { difficulty: 'Easy' }), () => 0);
must(easy && easy.type === 'play' && easy.cardIds.includes('4C'), 'Easy AFK plays the lowest legal card');

must(html.includes('id="startFromLobbyBtn"') || html.includes('Start match'), 'host starts the match from the lobby');
must(install.includes('./play/') && install.includes('Play in a browser'), 'install page links the web table');
must(prepare.includes("join(docs, 'play')") && prepare.includes('palace-lobby.js'), 'prepare:www publishes the web client');
must(existsSync(join(root, 'palace-lobby.js')), 'palace-lobby.js exists');

if (fails.length) {
  console.error('LOBBY CHECKS FAILED:');
  for (const f of fails) console.error(' -', f);
  process.exit(1);
}
console.log('PALACE lobby / AFK / web-client checks passed');
