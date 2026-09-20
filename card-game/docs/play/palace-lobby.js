/**
 * PALACE pre-match lobby + invite bus.
 * Local tabs sync through BroadcastChannel / localStorage.
 * Remote devices use PeerJS when the public broker is reachable.
 */
(function (root, factory) {
  const api = factory();
  root.PalaceLobby = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const WEB_PLAY_URL = 'https://theharislt-netizen.github.io/garage-gains/palace/play/';
  const STORAGE_PREFIX = 'palaceLobbyBus_';
  const CHANNEL_NAME = 'palace-lobby-bus';
  const PEER_PREFIX = 'palace-';

  function makeCode(len) {
    const n = len || 6;
    let out = '';
    for (let i = 0; i < n; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return out;
  }

  function makePlayerId() {
    return 'P' + makeCode(6);
  }

  function normalizeCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  function readJoinCode(search, hash) {
    try {
      const q = new URLSearchParams(search || '');
      if (q.get('join')) return normalizeCode(q.get('join'));
    } catch (_) { /* ignore */ }
    try {
      const h = String(hash || '').replace(/^#/, '');
      const q = new URLSearchParams(h.includes('=') ? h : h.replace(/^join=/, 'join='));
      if (q.get('join')) return normalizeCode(q.get('join'));
      if (/^[A-Z0-9]{4,8}$/.test(h)) return h;
    } catch (_) { /* ignore */ }
    return '';
  }

  function publicPlayUrl() {
    if (typeof location !== 'undefined' && /^https?:/i.test(location.protocol || '')) {
      const host = location.hostname || '';
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return String(location.origin + location.pathname).replace(/index\.html$/i, '');
      }
    }
    return WEB_PLAY_URL;
  }

  function inviteLink(code, pageUrl) {
    const base = String(pageUrl || publicPlayUrl()).split('#')[0]
      .replace(/[?&]join=[^&]*/g, '')
      .replace(/[?&]$/, '');
    const sep = base.indexOf('?') >= 0 ? '&' : '?';
    return base + sep + 'join=' + encodeURIComponent(normalizeCode(code));
  }

  function createLobby(cfg, host) {
    const seats = Math.max(2, Math.min(4, (cfg && cfg.seats) || 4));
    const list = [{
      seat: 0,
      id: host.id,
      name: host.name || 'Host',
      kind: 'host',
    }];
    for (let i = 1; i < seats; i++) {
      list.push({ seat: i, id: null, name: null, kind: 'open' });
    }
    return {
      code: makeCode(6),
      hostId: host.id,
      cfg: Object.assign({}, cfg, { seats }),
      seats: list,
      status: 'lobby',
    };
  }

  function seatOf(lobby, playerId) {
    if (!lobby || !playerId) return -1;
    const found = lobby.seats.find((s) => s.id === playerId);
    return found ? found.seat : -1;
  }

  function joinLobby(lobby, player) {
    if (!lobby || lobby.status === 'closed') return { ok: false, error: 'Lobby closed' };
    if (lobby.status === 'playing' || lobby.status === 'starting') {
      const existing = seatOf(lobby, player.id);
      if (existing >= 0) return { ok: true, lobby, seat: existing, already: true };
      return { ok: false, error: 'Match already started' };
    }
    const already = seatOf(lobby, player.id);
    if (already >= 0) return { ok: true, lobby, seat: already, already: true };
    const open = lobby.seats.find((s) => s.kind === 'open');
    if (!open) return { ok: false, error: 'Lobby is full' };
    open.id = player.id;
    open.name = player.name || 'Player';
    open.kind = 'human';
    return { ok: true, lobby, seat: open.seat };
  }

  function leaveLobby(lobby, playerId) {
    if (!lobby) return lobby;
    lobby.seats.forEach((s) => {
      if (s.id === playerId && s.kind !== 'host') {
        s.id = null;
        s.name = null;
        s.kind = 'open';
      }
    });
    return lobby;
  }

  function humanSeats(lobby) {
    return (lobby.seats || []).filter((s) => s.kind === 'host' || s.kind === 'human').map((s) => s.seat);
  }

  function matchOpts(lobby) {
    const names = (lobby.seats || []).map((s) => (s.kind === 'open' ? null : s.name));
    return Object.assign({}, lobby.cfg, {
      seats: lobby.seats.length,
      humanSeats: humanSeats(lobby),
      names,
    });
  }

  function snapshot(lobby) {
    return JSON.parse(JSON.stringify(lobby));
  }

  function createBus() {
    const subs = [];
    let bc = null;
    const peers = [];
    let guestConn = null;
    let peer = null;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(CHANNEL_NAME);
        bc.onmessage = (ev) => { if (ev && ev.data) fan(ev.data); };
      } catch (_) { /* ignore */ }
    }

    function onStorage(ev) {
      if (!ev || !ev.key || ev.key.indexOf(STORAGE_PREFIX) !== 0 || !ev.newValue) return;
      try { fan(JSON.parse(ev.newValue)); } catch (_) { /* ignore */ }
    }
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

    function fan(msg) {
      subs.slice().forEach((fn) => {
        try { fn(msg); } catch (_) { /* ignore */ }
      });
    }

    function send(code, payload) {
      const msg = Object.assign({ code: normalizeCode(code), at: Date.now() }, payload || {});
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_PREFIX + msg.code, JSON.stringify(msg));
        }
      } catch (_) { /* ignore */ }
      try { if (bc) bc.postMessage(msg); } catch (_) { /* ignore */ }
      peers.forEach((c) => { try { c.send(msg); } catch (_) { /* ignore */ } });
      if (guestConn) { try { guestConn.send(msg); } catch (_) { /* ignore */ } }
      fan(msg);
      return msg;
    }

    function subscribe(fn) {
      subs.push(fn);
      return function () {
        const i = subs.indexOf(fn);
        if (i >= 0) subs.splice(i, 1);
      };
    }

    function attachConn(conn, relay) {
      conn.on('data', (msg) => {
        if (!msg) return;
        if (relay) {
          peers.forEach((c) => {
            if (c !== conn) { try { c.send(msg); } catch (_) { /* ignore */ } }
          });
        }
        fan(msg);
      });
    }

    function loadPeerScript() {
      return new Promise((resolve, reject) => {
        if (typeof Peer !== 'undefined') return resolve();
        if (typeof document === 'undefined') return reject(new Error('no document'));
        const existing = document.querySelector('script[data-palace-peerjs]');
        if (existing) {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject(new Error('peerjs')));
          return;
        }
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
        s.async = true;
        s.dataset.palacePeerjs = '1';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('peerjs'));
        document.head.appendChild(s);
      });
    }

    function enableRemote(code, opts) {
      const isHost = !!(opts && opts.host);
      return loadPeerScript().then(function () {
        return new Promise((resolve) => {
          const id = isHost ? PEER_PREFIX + normalizeCode(code) : PEER_PREFIX + normalizeCode(code) + '-' + makeCode(4).toLowerCase();
          try { if (peer) peer.destroy(); } catch (_) { /* ignore */ }
          peer = new Peer(id);
          const timer = setTimeout(() => resolve(false), 6000);
          peer.on('error', () => {
            clearTimeout(timer);
            resolve(false);
          });
          peer.on('open', () => {
            if (isHost) {
              peer.on('connection', (conn) => {
                peers.push(conn);
                conn.on('open', () => attachConn(conn, true));
                conn.on('close', () => {
                  const i = peers.indexOf(conn);
                  if (i >= 0) peers.splice(i, 1);
                });
              });
              clearTimeout(timer);
              resolve(true);
              return;
            }
            const conn = peer.connect(PEER_PREFIX + normalizeCode(code));
            conn.on('open', () => {
              guestConn = conn;
              attachConn(conn, false);
              clearTimeout(timer);
              resolve(true);
            });
            conn.on('error', () => {
              clearTimeout(timer);
              resolve(false);
            });
          });
        });
      }).catch(() => false);
    }

    function close() {
      try { if (bc) bc.close(); } catch (_) { /* ignore */ }
      try { if (peer) peer.destroy(); } catch (_) { /* ignore */ }
      peers.length = 0;
      guestConn = null;
      peer = null;
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    }

    return { send, subscribe, enableRemote, close };
  }

  return {
    WEB_PLAY_URL,
    makeCode,
    makePlayerId,
    normalizeCode,
    readJoinCode,
    publicPlayUrl,
    inviteLink,
    createLobby,
    joinLobby,
    leaveLobby,
    seatOf,
    humanSeats,
    matchOpts,
    snapshot,
    createBus,
  };
});
