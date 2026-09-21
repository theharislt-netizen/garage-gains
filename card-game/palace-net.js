/**
 * PALACE lobby / friends net.
 * Same-origin tabs use BroadcastChannel. Phones use public ntfy relays.
 *
 * Root causes this file guards against:
 * - ntfy.sh 429 / JSON-API POST swallowing invite bodies
 * - Android CORS preflight on application/json + custom headers
 * - comma-subscribe EventSource URLs that never deliver on WebView
 * - one `since` cursor shared across relays (message ids are per-server,
 *   so a ntfy.sh id used on envs.net silently drops new invites/joins)
 * - a 10-minute inbox replay that resurrects old presence beats and invites
 *   as if the friend were live and had just invited you
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
  const relayFailUntil = {};
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
      if (seen.length > 400) seen.shift();
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

  function ingest(raw, rec, base) {
    const parsed = parseWrap(raw);
    if (parsed.id && rec && base) rec.since[base] = parsed.id;
    if (parsed.msg) {
      if (rec) rec.lastAt = Date.now();
      emit(parsed.msg);
    }
  }

  function topicKind(top) {
    if (String(top || '').indexOf('pal1l') === 0 || String(top || '').indexOf('pal1m') === 0) return 'room';
    return 'inbox';
  }

  function seedSince(top) {
    // Inbox/presence: 20s is enough to catch a beat or invite during connect.
    // Lobby/match: 30s to catch a host snapshot. Never 10m — that replays
    // ghost Online status and invites the friend never just sent.
    return topicKind(top) === 'room' ? '30s' : '20s';
  }

  function sinceOf(rec, base) {
    return (rec && rec.since && rec.since[base]) || seedSince(rec && rec.top);
  }

  function relayOk(base) {
    return Date.now() >= (relayFailUntil[base] || 0);
  }

  function markRelay(base, status) {
    if (status === 429) relayFailUntil[base] = Date.now() + 20000;
    else if (status >= 500) relayFailUntil[base] = Date.now() + 8000;
  }

  function closeEs(rec) {
    if (!rec || !rec.es) return;
    try { rec.es.close(); } catch (_) { /* ignore */ }
    rec.es = null;
  }

  function openEs(top, rec) {
    if (typeof EventSource === 'undefined') return;
    closeEs(rec);
    const usable = RELAYS.filter(relayOk);
    const base = usable.includes(rec.relay) ? rec.relay : (usable[0] || RELAYS[0]);
    rec.relay = base;
    rec.top = top;
    const since = sinceOf(rec, base);
    const url = base + encodeURIComponent(top) + '/sse?' + 'since=' + encodeURIComponent(since);
    const es = new EventSource(url);
    es.onmessage = (ev) => ingest(ev.data, rec, base);
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

  async function nativeGet(url) {
    const CapHttp = (typeof window !== 'undefined' && (window.CapacitorHttp || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp)));
    if (!CapHttp || !CapHttp.get) return null;
    try {
      const r = await CapHttp.get({ url, connectTimeout: 8000, readTimeout: 8000 });
      if (r && r.status === 200) return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    } catch (_) { /* fall through */ }
    return null;
  }

  async function nativePost(url, body) {
    const CapHttp = (typeof window !== 'undefined' && (window.CapacitorHttp || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp)));
    if (!CapHttp || !CapHttp.post) return null;
    try {
      return await CapHttp.post({
        url,
        data: body,
        headers: { 'Content-Type': 'text/plain' },
        connectTimeout: 8000,
        readTimeout: 8000,
      });
    } catch (_) { return null; }
  }

  async function pollRelay(base, top, rec) {
    if (!relayOk(base)) return;
    const url = base + encodeURIComponent(top) + '/json?poll=1&since=' + encodeURIComponent(sinceOf(rec, base));
    let text = '';
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) { markRelay(base, res.status); return; }
      if (!res.ok) return;
      text = await res.text();
    } catch (_) {
      text = (await nativeGet(url)) || '';
    }
    String(text || '').split('\n').forEach((line) => {
      if (line.trim()) ingest(line, rec, base);
    });
  }

  async function tickPoll(top, rec) {
    if (rec.pollBusy) return;
    rec.pollBusy = true;
    try {
      for (let i = 0; i < RELAYS.length; i++) {
        try { await pollRelay(RELAYS[i], top, rec); } catch (_) { /* relay down */ }
      }
    } finally {
      rec.pollBusy = false;
    }
  }

  function freshSince(top) {
    const s = {};
    const seed = seedSince(top);
    RELAYS.forEach((r) => { s[r] = seed; });
    return s;
  }

  function listenTopic(top) {
    if (live.has(top)) return;
    const rec = {
      es: null,
      relay: RELAYS[0],
      top,
      since: freshSince(top),
      lastAt: 0,
      backoff: 1200,
      esTimer: 0,
      pollTimer: 0,
      pollBusy: false,
    };
    live.set(top, rec);
    openEs(top, rec);
    rec.pollTimer = setInterval(() => { tickPoll(top, rec); }, 2000);
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
    if (force) {
      live.forEach((rec, top) => {
        closeEs(rec);
        openEs(top, rec);
      });
    }
    syncListeners();
  }

  function scheduleMux(force) {
    clearTimeout(muxTimer);
    muxTimer = setTimeout(() => openMux(!!force), force ? 0 : 60);
  }

  function openSource() { openMux(); }
  function closeSource() { /* per-topic — openMux() rebuilds from `wanted` */ }

  async function postRelay(base, top, packed) {
    const url = base + encodeURIComponent(top);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: packed,
      });
      markRelay(base, res.status);
      return res;
    } catch (_) {
      const native = await nativePost(url, packed);
      if (native) {
        markRelay(base, native.status);
        return { ok: native.status >= 200 && native.status < 300, status: native.status };
      }
      throw _;
    }
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
    const order = RELAYS.filter(relayOk).concat(RELAYS.filter((r) => !relayOk(r)));
    await Promise.all(order.map(async (base) => {
      if (!relayOk(base) && base !== order[0]) return;
      for (let i = 0; i < 3; i++) {
        try {
          const res = await postRelay(base, top, packed);
          if (res && res.ok) return;
          if (res && res.status !== 429 && res.status < 500) return;
        } catch (_) { return; }
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
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

  function stopBeat() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = 0;
  }

  function away() {
    stopBeat();
    if (!me.id) return;
    const body = presenceBody(false);
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
    stopBeat();
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
    topic, connect, disconnect, resume, away, on, publish, subscribe, unsubscribe,
    inbox, presenceOf, dropPresence, lobbyPub, matchPub, watchLobby, watchMatch, leaveRoom, beat,
    openMux, closeMux, openSource, closeSource,
    RELAYS,
    get me() { return me; },
    get wantedSize() { return wanted.size; },
  };
});
