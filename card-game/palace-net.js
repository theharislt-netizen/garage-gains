/**
 * PALACE lobby / friends net.
 * Same-origin tabs use BroadcastChannel. Phones publish over public ntfy
 * relays. ntfy.sh 429s and comma-subscribe EventSource URLs fail on Android
 * WebView (one dead socket, no presence / no joins), so we:
 *   - listen per topic (inbox, lobby, match) with no commas
 *   - publish to several relays
 *   - push presence into friends' inboxes instead of extra presence sockets
 *   - poll as a fallback when EventSource goes quiet
 */
(function (root, factory) {
  const net = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = net;
  root.PalaceNet = net;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const RELAYS = [
    'https://ntfy.envs.net/',
    'https://ntfy.sh/',
    'https://ntfy.adminforge.de/',
  ];
  const CHAN = 'palace-net-v1';
  const handlers = [];
  const wanted = new Set();
  const peers = new Set();
  const live = new Map();
  const seen = [];
  let bc = null;
  let me = { id: '', name: 'Player' };
  let heartbeat = 0;
  let muxTimer = 0;

  function topic(kind, id) {
    return ('pal1' + kind + String(id || '').toLowerCase()).replace(/[^a-z0-9_-]/g, '').slice(0, 64);
  }

  function sameNetId(a, b) {
    return String(a || '').toUpperCase() === String(b || '').toUpperCase() && String(a || '') !== '';
  }

  function fingerprint(msg) {
    return String(msg.nid || '') + '|' + String(msg.t || '') + '|' + String(msg.from || '') + '|' + String(msg.type || '');
  }

  function emit(msg) {
    if (!msg || typeof msg !== 'object') return;
    const key = fingerprint(msg);
    if (key.length > 3 && seen.indexOf(key) >= 0) return;
    if (key.length > 3) {
      seen.push(key);
      if (seen.length > 200) seen.shift();
    }
    if (msg.from && me.id && sameNetId(msg.from, me.id)) return;
    handlers.forEach((fn) => {
      try { fn(msg); } catch (_) { /* ignore */ }
    });
  }

  function parseWrap(raw) {
    try {
      const wrap = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!wrap || (wrap.event && wrap.event !== 'message')) return { wrap: wrap || null, msg: null, id: '' };
      let body = wrap.message != null ? wrap.message : wrap;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (_) { return { wrap, msg: null, id: wrap.id || '' }; }
      }
      return { wrap, msg: body && typeof body === 'object' ? body : null, id: wrap.id || '' };
    } catch (_) {
      return { wrap: null, msg: null, id: '' };
    }
  }

  function parseNtfy(raw) {
    return parseWrap(raw).msg;
  }

  function ingest(raw, rec) {
    const parsed = parseWrap(raw);
    if (parsed.id && rec) rec.since = parsed.id;
    if (parsed.msg) {
      if (rec) rec.lastAt = Date.now();
      emit(parsed.msg);
    }
  }

  function closeEs(rec) {
    if (!rec || !rec.es) return;
    try { rec.es.close(); } catch (_) { /* ignore */ }
    rec.es = null;
  }

  function openEs(top, rec) {
    if (typeof EventSource === 'undefined') return;
    closeEs(rec);
    const base = rec.relay || RELAYS[0];
    const since = rec.since || '10m'; // replay since=10m of retained ntfy messages
    const url = base + encodeURIComponent(top) + '/sse?' + 'since=' + encodeURIComponent(since);
    const es = new EventSource(url);
    es.onmessage = (ev) => ingest(ev.data, rec);
    es.onerror = () => {
      if (es.readyState !== 2) return;
      if (rec.es === es) rec.es = null;
      try { es.close(); } catch (_) { /* ignore */ }
      const idx = RELAYS.indexOf(rec.relay);
      rec.relay = RELAYS[(idx + 1) % RELAYS.length];
      rec.esTimer = setTimeout(() => {
        if (live.get(top) === rec) openEs(top, rec);
      }, rec.backoff || 1200);
      rec.backoff = Math.min(15000, Math.round((rec.backoff || 1200) * 1.7));
    };
    rec.es = es;
    rec.backoff = 1200;
  }

  async function pollRelay(base, top, rec) {
    const url = base + encodeURIComponent(top) + '/json?poll=1&since=' + encodeURIComponent(rec.since || '2m');
    const res = await fetch(url);
    if (!res.ok) return;
    const text = await res.text();
    String(text || '').split('\n').forEach((line) => {
      if (line.trim()) ingest(line, rec);
    });
  }

  async function tickPoll(top, rec) {
    if (rec.pollBusy) return;
    rec.pollBusy = true;
    try {
      const healthy = rec.es && rec.es.readyState === 1 && Date.now() - (rec.lastAt || 0) < 20000;
      const bases = healthy
        ? RELAYS.filter((r) => r !== rec.relay)
        : RELAYS.slice();
      for (let i = 0; i < bases.length; i++) {
        try { await pollRelay(bases[i], top, rec); } catch (_) { /* relay down */ }
      }
    } finally {
      rec.pollBusy = false;
    }
  }

  function listenTopic(top) {
    if (live.has(top)) return;
    const rec = {
      es: null,
      relay: RELAYS[0],
      since: '10m',
      lastAt: 0,
      backoff: 1200,
      esTimer: 0,
      pollTimer: 0,
      pollBusy: false,
    };
    live.set(top, rec);
    openEs(top, rec);
    rec.pollTimer = setInterval(() => { tickPoll(top, rec); }, 4000);
    tickPoll(top, rec);
  }

  function unlistenTopic(top) {
    const rec = live.get(top);
    if (!rec) return;
    clearTimeout(rec.esTimer);
    clearInterval(rec.pollTimer);
    closeEs(rec);
    live.delete(top);
  }

  function syncListeners() {
    wanted.forEach((top) => listenTopic(top));
    [...live.keys()].forEach((top) => {
      if (!wanted.has(top)) unlistenTopic(top);
    });
  }

  function closeMux() {
    [...live.keys()].forEach(unlistenTopic);
  }

  function openMux(force) {
    if (force) closeMux();
    syncListeners();
  }

  function scheduleMux(force) {
    clearTimeout(muxTimer);
    muxTimer = setTimeout(() => openMux(!!force), force ? 0 : 60);
  }

  function openSource() { openMux(); }
  function closeSource() { /* per-topic — openMux() rebuilds from `wanted` */ }

  async function postRelay(base, top, packed, msg) {
    const res = await fetch(base + encodeURIComponent(top), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Title: String(msg.type || 'msg').slice(0, 80),
        Tags: 'card',
        Priority: msg.type === 'invite' || msg.type === 'join' || msg.type === 'lobby' || msg.type === 'snap' || msg.type === 'move' || msg.type === 'timeout' || msg.type === 'dm' || msg.type === 'chat' ? 'high' : 'default',
      },
      body: packed,
    });
    return res;
  }

  async function publish(kind, id, payload) {
    const msg = Object.assign({
      t: Date.now(),
      from: me.id,
      nid: Math.random().toString(36).slice(2, 10),
    }, payload || {});
    const packed = JSON.stringify(msg);
    try {
      if (bc) bc.postMessage({ kind, id, msg });
    } catch (_) { /* ignore */ }
    const top = topic(kind, id);
    await Promise.all(RELAYS.map(async (base) => {
      for (let i = 0; i < 4; i++) {
        try {
          const res = await postRelay(base, top, packed, msg);
          if (res.ok) return;
          if (res.status !== 429 && res.status < 500) return;
        } catch (_) { /* relay down */ return; }
        await new Promise((r) => setTimeout(r, 800 * Math.pow(2, i)));
      }
    }));
    return msg;
  }

  function subscribe(kind, id) {
    wanted.add(topic(kind, id));
    scheduleMux();
  }

  function unsubscribe(kind, id) {
    wanted.delete(topic(kind, id));
    scheduleMux();
  }

  function presenceBody(online) {
    return {
      type: 'presence',
      id: me.id,
      name: me.name,
      online: online !== false,
      border: me.border || null,
    };
  }

  function beat() {
    if (!me.id) return;
    const body = presenceBody(true);
    publish('p', me.id, body);
    peers.forEach((id) => {
      if (!sameNetId(id, me.id)) publish('i', id, body);
    });
  }

  function ensureChannel() {
    if (bc || typeof BroadcastChannel === 'undefined') return;
    try {
      bc = new BroadcastChannel(CHAN);
      bc.onmessage = (ev) => {
        const msg = ev && ev.data && ev.data.msg;
        if (msg) emit(msg);
      };
    } catch (_) { bc = null; }
  }

  function resume(force) {
    ensureChannel();
    if (force) openMux(true);
    else scheduleMux(false);
    if (me.id) {
      if (!heartbeat) heartbeat = setInterval(beat, 12000);
      beat();
    }
  }

  function connect(profile) {
    me = {
      id: String((profile && profile.id) || ''),
      name: String((profile && profile.name) || 'Player'),
      border: String((profile && profile.border) || ''),
    };
    ensureChannel();
    if (me.id) {
      subscribe('i', me.id);
      resume();
    }
  }

  function disconnect() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = 0;
    clearTimeout(muxTimer);
    if (me.id) {
      const body = presenceBody(false);
      publish('p', me.id, body);
      peers.forEach((id) => {
        if (!sameNetId(id, me.id)) publish('i', id, body);
      });
    }
    closeMux();
    if (bc) {
      try { bc.close(); } catch (_) { /* ignore */ }
      bc = null;
    }
  }

  function on(fn) {
    if (typeof fn === 'function') handlers.push(fn);
    return () => {
      const i = handlers.indexOf(fn);
      if (i >= 0) handlers.splice(i, 1);
    };
  }

  function inbox(to, payload) { return publish('i', to, payload); }
  function presenceOf(id) {
    if (!id) return;
    const n = String(id);
    const fresh = !peers.has(n);
    peers.add(n);
    if (fresh && me.id) publish('i', n, presenceBody(true));
  }
  function dropPresence(id) {
    if (id) peers.delete(String(id));
  }
  function lobbyPub(code, payload) { return publish('l', code, payload); }
  function matchPub(code, payload) { return publish('m', code, payload); }
  function watchLobby(code) { subscribe('l', code); }
  function watchMatch(code) { subscribe('m', code); }
  function leaveRoom(code) {
    unsubscribe('l', code);
    unsubscribe('m', code);
  }

  return {
    topic, connect, disconnect, resume, on, publish, subscribe, unsubscribe,
    inbox, presenceOf, dropPresence, lobbyPub, matchPub, watchLobby, watchMatch, leaveRoom, beat,
    openMux, closeMux, openSource, closeSource,
    RELAYS,
    get me() { return me; },
    get wantedSize() { return wanted.size; },
  };
});
