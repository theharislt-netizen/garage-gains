/**
 * Shared live-update channel list and newest-wins selection.
 *
 * Installed APKs still first-match on UPDATE_REFS[0] until they download a
 * bundle that contains this picker. Always publish www.zip to that channel
 * or phones keep the older copy and report "latest".
 */
export const UPDATE_REPO = 'theharislt-netizen/garage-gains';
export const UPDATE_DIR = 'card-game/live-update';
export const INSTALL_CHANNEL = 'cursor/winner-kick-rewards-e78b';
export const UPDATE_REFS = [
  INSTALL_CHANNEL,
  'cursor/card-game-setup-e78b',
  'cursor/palace-lobby-afk-web-b503',
  'main',
];

export function uniqueRefs(refs) {
  const out = [];
  const seen = new Set();
  for (const ref of refs || []) {
    const r = String(ref || '').trim();
    if (!r || seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out;
}

export function refsFromManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return [];
  const refs = [];
  if (Array.isArray(manifest.refs)) {
    for (const r of manifest.refs) refs.push(r);
  }
  if (Array.isArray(manifest.urls)) {
    for (const url of manifest.urls) {
      const m = String(url || '').match(
        /(?:raw\.githubusercontent\.com\/[^/]+\/[^/]+\/|(?:www\.)?github\.com\/[^/]+\/[^/]+\/(?:raw|blob)\/)(.+?)\/card-game\/live-update\//
      );
      if (m) refs.push(decodeURIComponent(m[1]));
    }
  }
  return uniqueRefs(refs);
}

export function committedAtMs(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Prefer the manifest that landed on GitHub most recently.
 * Content-hash versions are not ordered, so commit time is the only
 * reliable "this is the update you missed" signal.
 */
export function pickNewestCandidate(candidates) {
  const ready = (candidates || []).filter((c) => c && c.version && c.zipUrl);
  if (!ready.length) return null;

  const dated = ready.filter((c) => committedAtMs(c.committedAt) > 0);
  const pool = dated.length ? dated : ready;
  pool.sort((a, b) => {
    const dt = committedAtMs(b.committedAt) - committedAtMs(a.committedAt);
    if (dt !== 0) return dt;
    // Same commit age (or no dates): stay on the installed APK channel so
    // Last-Modified / extra-ref probes cannot bounce between two zips.
    if (a.ref === INSTALL_CHANNEL && b.ref !== INSTALL_CHANNEL) return -1;
    if (b.ref === INSTALL_CHANNEL && a.ref !== INSTALL_CHANNEL) return 1;
    return String(b.version).localeCompare(String(a.version));
  });
  return pool[0];
}
