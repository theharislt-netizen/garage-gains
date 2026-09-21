/**
 * PALACE lobby / friends net.
 * Same-origin tabs use BroadcastChannel. Phones and browsers publish over ntfy.sh.
 *
 * Subscriptions are remembered and reopened on resume. Closing the app to copy a
 * lobby code must not drop the host's lobby listener or friend presence.
 */
(function (root, factory) {
  const net = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = net;
  root.PalaceNet = net;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const NTFY = 'https://ntfy.sh/';
  const CHAN = 'palace-net-v1';
  const handlers = [];
  const sources = new Map();
  const wanted = new Set();
  const seen = [];
  let bc = null;
  let me = { id: '', name: 'Player' };
  let heartbeat = 0;

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
      if (seen.length > 120) seen.shift();
    }
    if (msg.from && me.id && sameNetId(msg.from, me.id)) return;
    handlers.forEach((fn) => {
      try { fn(msg); } catch (_) { /* ignore */ }
    });
  }

  function parseNtfy(raw) {
    try {
      const wrap = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!wrap || wrap.event && wrap.event !== 'message') return null;
      const body = wrap.message != null ? wrap.message : wrap;
      return typeof body === 'string' ? JSON.parse(body) : body;
    } catch (_) {
      return null;
    }
  }

  function openSource(top) {
    if (!top || typeof EventSource === 'undefined') return;
    const live = sources.get(top);
    if (live && live.readyState !== 2) return;
    if (live) {
      try { live.close(); } catch (_) { /* ignore */ }
      sources.delete(top);
    }
    const es = new EventSource(NTFY + encodeURIComponent(top) + '/sse?since=10m');
    es.onmessage = (ev) => {
      const msg = parseNtfy(ev.data);
      if (msg) emit(msg);
    };
    es.onerror = () => {
      if (es.readyState === 2 && wanted.has(top)) {
        sources.delete(top);
        setTimeout(() => { if (wanted.has(top)) openSource(top); }, 1200);
      }
    };
    sources.set(top, es);
  }

  function closeSource(top) {
    const es = sources.get(top);
    if (!es) return;
    try { es.close(); } catch (_) { /* ignore */ }
    sources.delete(top);
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
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(NTFY + encodeURIComponent(top), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Title: String(msg.type || kind).slice(0, 80),
            Tags: 'card',
            Priority: msg.type === 'invite' || msg.type === 'join' || msg.type === 'lobby' ? 'high' : 'default',
          },
          body: packed,
        });
        if (res.status !== 429) break;
      } catch (_) { /* offline */ break; }
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
    return msg;
  }

  function subscribe(kind, id) {
    const top = topic(kind, id);
    wanted.add(top);
    openSource(top);
  }

  function unsubscribe(kind, id) {
    const top = topic(kind, id);
    wanted.delete(top);
    closeSource(top);
  }

  function beat() {
    if (!me.id) return;
    publish('p', me.id, { type: 'presence', id: me.id, name: me.name, online: true });
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

  function resume() {
    ensureChannel();
    wanted.forEach((top) => openSource(top));
    if (me.id) {
      if (!heartbeat) heartbeat = setInterval(beat, 12000);
      beat();
    }
  }

  function connect(profile) {
    me = {
      id: String((profile && profile.id) || ''),
      name: String((profile && profile.name) || 'Player'),
    };
    ensureChannel();
    if (me.id) {
      subscribe('i', me.id);
      subscribe('p', me.id);
      resume();
    }
  }

  function disconnect() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = 0;
    if (me.id) publish('p', me.id, { type: 'presence', id: me.id, name: me.name, online: false });
    sources.forEach((es) => { try { es.close(); } catch (_) { /* ignore */ } });
    sources.clear();
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
  function presenceOf(id) { subscribe('p', id); }
  function dropPresence(id) { if (id && !sameNetId(id, me.id)) unsubscribe('p', id); }
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
    get me() { return me; },
  };
});
