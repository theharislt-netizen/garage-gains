/**
 * PALACE lobby / friends net.
 * Same-origin tabs use BroadcastChannel. Phones and browsers publish over ntfy.sh.
 *
 * One EventSource covers every wanted topic (ntfy comma-subscribe). Separate
 * SSE sockets per topic hit the browser's 6-connection cap and silently drop
 * match snaps or friend presence — the phone-only stall / Offline bug.
 */
(function (root, factory) {
  const net = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = net;
  root.PalaceNet = net;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const NTFY = 'https://ntfy.sh/';
  const CHAN = 'palace-net-v1';
  const handlers = [];
  const wanted = new Set();
  const seen = [];
  let bc = null;
  let me = { id: '', name: 'Player' };
  let heartbeat = 0;
  let mux = null;
  let muxTimer = 0;
  let muxBackoff = 1200;

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

  function wantedKey() {
    return [...wanted].filter(Boolean).sort().join(',');
  }

  function closeMux() {
    if (!mux) return;
    try { mux.es.close(); } catch (_) { /* ignore */ }
    mux = null;
  }

  function openMux(force) {
    if (typeof EventSource === 'undefined') return;
    const key = wantedKey();
    if (!key) {
      closeMux();
      return;
    }
    if (!force && mux && mux.key === key && mux.es && mux.es.readyState !== 2) return;
    closeMux();
    const es = new EventSource(NTFY + key + '/sse?since=10m');
    es.onmessage = (ev) => {
      muxBackoff = 1200;
      const msg = parseNtfy(ev.data);
      if (msg) emit(msg);
    };
    es.onerror = () => {
      if (es.readyState === 2 && wanted.size) {
        if (mux && mux.es === es) {
          try { mux.es.close(); } catch (_) { /* ignore */ }
          mux = null;
        }
        clearTimeout(muxTimer);
        const wait = muxBackoff;
        muxBackoff = Math.min(15000, Math.round(muxBackoff * 1.7));
        muxTimer = setTimeout(() => { if (wanted.size) openMux(true); }, wait);
      }
    };
    mux = { es, key };
  }

  function scheduleMux(force) {
    clearTimeout(muxTimer);
    muxTimer = setTimeout(() => openMux(!!force), force ? 0 : 60);
  }

  function openSource() { openMux(); }
  function closeSource() { /* multiplexed — openMux() rebuilds from `wanted` */ }

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
            Priority: msg.type === 'invite' || msg.type === 'join' || msg.type === 'lobby' || msg.type === 'snap' || msg.type === 'move' || msg.type === 'timeout' ? 'high' : 'default',
          },
          body: packed,
        });
        if (res.ok) break;
        if (res.status !== 429 && res.status < 500) break;
      } catch (_) { /* offline */ break; }
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
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

  function resume(force) {
    ensureChannel();
    if (force || !mux || !mux.es || mux.es.readyState === 2) scheduleMux(true);
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
    clearTimeout(muxTimer);
    if (me.id) publish('p', me.id, { type: 'presence', id: me.id, name: me.name, online: false });
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
    openMux, closeMux, openSource, closeSource,
    get me() { return me; },
    get wantedSize() { return wanted.size; },
  };
});
