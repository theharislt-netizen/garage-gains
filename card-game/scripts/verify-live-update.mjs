#!/usr/bin/env node
/**
 * Checks the exact anonymous URLs PALACE fetches on launch.
 * Exit 0 only when the phone can download an update with no GitHub token.
 */
const REPO = 'theharislt-netizen/garage-gains';
const REF = 'cursor/card-game-setup-e78b';
const UPDATE_DIR = 'card-game/live-update';
const headers = { 'User-Agent': 'PALACE-Android-Verify', Accept: 'application/vnd.github+json' };

async function getJson(url) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, ok: res.ok, data };
}

const vis = await getJson(`https://api.github.com/repos/${REPO}`);
const manRes = await getJson(`https://api.github.com/repos/${REPO}/contents/${UPDATE_DIR}/manifest.json?ref=${encodeURIComponent(REF)}`);
let manifest = null;
if (manRes.data?.content && manRes.data.encoding === 'base64') {
  manifest = JSON.parse(Buffer.from(manRes.data.content, 'base64').toString('utf8'));
}
const commit = await getJson(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(REF)}`);
const sha = commit.data?.sha;
const zipUrl = sha
  ? `https://raw.githubusercontent.com/${REPO}/${sha}/${UPDATE_DIR}/www.zip`
  : manRes.data?.download_url;
const zipRes = zipUrl ? await fetch(zipUrl, { headers: { 'User-Agent': 'PALACE-Android-Verify' } }) : null;
const zipBytes = zipRes && zipRes.ok ? (await zipRes.arrayBuffer()).byteLength : 0;

const ready = Boolean(
  vis.data?.private === false &&
  manifest?.version &&
  sha &&
  zipRes?.ok &&
  zipBytes > 1000
);

const report = {
  ready,
  visibility: { status: vis.status, private: vis.data?.private, visibility: vis.data?.visibility },
  picked: ready ? { ref: REF, version: manifest.version, commit: sha, zipBytes } : null,
  apkBuiltin: '0.1.0',
  willUpdateOnOpen: Boolean(ready && manifest.version !== '0.1.0'),
  zipUrl,
};
console.log(JSON.stringify(report, null, 2));
if (!ready) {
  console.error('LIVE UPDATE NOT PUBLIC — phone cannot auto-update until this branch is pushed with card-game/live-update/.');
  process.exit(1);
}
console.error(`LIVE UPDATE PUBLIC — ${REF} ${manifest.version} @ ${sha.slice(0, 7)} (${zipBytes} byte zip)`);
