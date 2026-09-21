#!/usr/bin/env node
/**
 * Checks the anonymous URLs PALACE fetches on launch.
 * Exit 0 only when the installed APK can download the newest zip with no token.
 *
 * The phone still first-matches INSTALL_CHANNEL until it applies a bundle that
 * contains newest-wins. This script fails if that channel is behind another ref.
 */
import {
  INSTALL_CHANNEL,
  UPDATE_DIR,
  UPDATE_REPO as REPO,
  UPDATE_REFS,
  pickNewestCandidate,
  refsFromManifest,
  uniqueRefs,
} from './live-update-select.mjs';

const headers = { 'User-Agent': 'PALACE-Android-Verify', Accept: 'application/vnd.github+json' };

async function getJson(url) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, ok: res.ok, data };
}

function decodeManifest(data) {
  if (data?.version) return data;
  if (data?.content && data.encoding === 'base64') {
    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  }
  return null;
}

async function probeRef(ref) {
  const manRes = await getJson(
    `https://api.github.com/repos/${REPO}/contents/${UPDATE_DIR}/manifest.json?ref=${encodeURIComponent(ref)}`
  );
  const manifest = decodeManifest(manRes.data);
  if (!manifest?.version) return null;
  const commit = await getJson(
    `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(UPDATE_DIR + '/manifest.json')}&sha=${encodeURIComponent(ref)}&per_page=1`
  );
  const row = Array.isArray(commit.data) ? commit.data[0] : commit.data;
  const sha = row?.sha;
  const committedAt = row?.commit?.committer?.date || row?.commit?.author?.date || '';
  const zipUrl = sha
    ? `https://raw.githubusercontent.com/${REPO}/${sha}/${UPDATE_DIR}/www.zip?v=${encodeURIComponent(manifest.version)}`
    : `https://raw.githubusercontent.com/${REPO}/${ref}/${UPDATE_DIR}/www.zip?v=${encodeURIComponent(manifest.version)}&t=${Date.now()}`;
  return {
    version: manifest.version,
    zipUrl,
    ref,
    committedAt,
    extraRefs: refsFromManifest(manifest),
    checksum: manifest.checksum || '',
  };
}

const vis = await getJson(`https://api.github.com/repos/${REPO}`);
const seen = new Set();
let queue = uniqueRefs(UPDATE_REFS);
const candidates = [];
while (queue.length && seen.size < 12) {
  const batch = queue.filter((ref) => !seen.has(ref));
  queue = [];
  for (const ref of batch) seen.add(ref);
  const results = await Promise.all(batch.map((ref) => probeRef(ref).catch(() => null)));
  for (const candidate of results) {
    if (!candidate?.version) continue;
    candidates.push(candidate);
    for (const extra of candidate.extraRefs || []) {
      if (!seen.has(extra)) queue.push(extra);
    }
  }
}

const newest = pickNewestCandidate(candidates);
const installCopy = candidates.find((c) => c.ref === INSTALL_CHANNEL);
const zipRes = newest?.zipUrl ? await fetch(newest.zipUrl, { headers: { 'User-Agent': 'PALACE-Android-Verify' } }) : null;
const zipBytes = zipRes && zipRes.ok ? (await zipRes.arrayBuffer()).byteLength : 0;
const channelStale = Boolean(newest && installCopy && newest.version !== installCopy.version);
const ready = Boolean(
  vis.data?.private === false &&
  newest?.version &&
  zipRes?.ok &&
  zipBytes > 1000 &&
  !channelStale
);

const report = {
  ready,
  visibility: { status: vis.status, private: vis.data?.private, visibility: vis.data?.visibility },
  installChannel: INSTALL_CHANNEL,
  installVersion: installCopy?.version || null,
  newest: newest ? { ref: newest.ref, version: newest.version, committedAt: newest.committedAt, zipBytes } : null,
  channelStale,
  probed: candidates.map((c) => ({ ref: c.ref, version: c.version, committedAt: c.committedAt })),
  apkBuiltin: '0.1.0',
  willUpdateOnOpen: Boolean(ready && newest.version !== '0.1.0'),
  zipUrl: newest?.zipUrl || null,
};
console.log(JSON.stringify(report, null, 2));
if (!ready) {
  if (channelStale) {
    console.error(`LIVE UPDATE STALE CHANNEL — phones first-match ${INSTALL_CHANNEL} (${installCopy.version}) and will ignore newer ${newest.ref} (${newest.version}). Publish www.zip to ${INSTALL_CHANNEL}.`);
  } else {
    console.error('LIVE UPDATE NOT PUBLIC — phone cannot auto-update until a live-update zip is on GitHub.');
  }
  process.exit(1);
}
console.error(`LIVE UPDATE PUBLIC — newest ${newest.ref} ${newest.version} also on ${INSTALL_CHANNEL} (${zipBytes} byte zip)`);
