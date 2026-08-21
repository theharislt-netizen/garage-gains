#!/usr/bin/env node
/**
 * Checks the exact anonymous URLs RIGCORE fetches on launch.
 * Exit 0 only when the phone can download an update with no GitHub token.
 */
const REPO = 'theharislt-netizen/garage-gains';
const REFS = ['cursor/android-apk-eee8', 'main'];

async function headOrGet(url, method = 'GET') {
  const res = await fetch(url, {
    method,
    headers: { 'User-Agent': 'RIGCORE-Android-Verify' },
    redirect: 'follow',
  });
  return { url, status: res.status, ok: res.ok, bytes: method === 'GET' ? (await res.arrayBuffer()).byteLength : 0 };
}

const results = [];
let ready = false;
let picked = null;

for (const ref of REFS) {
  const manifestUrl = `https://raw.githubusercontent.com/${REPO}/${ref}/live-update/manifest.json?t=${Date.now()}`;
  const man = await headOrGet(manifestUrl);
  results.push(man);
  if (!man.ok) continue;
  const json = await fetch(manifestUrl).then((r) => r.json()).catch(() => null);
  if (!json?.version) continue;
  const zipUrl = `https://raw.githubusercontent.com/${REPO}/${ref}/live-update/www.zip?v=${encodeURIComponent(json.version)}`;
  const zip = await headOrGet(zipUrl);
  results.push(zip);
  if (zip.ok && zip.bytes > 1000) {
    ready = true;
    picked = { ref, version: json.version, zipBytes: zip.bytes };
    break;
  }
}

const visibility = await fetch(`https://api.github.com/repos/${REPO}`, {
  headers: { 'User-Agent': 'RIGCORE-Android-Verify', Accept: 'application/vnd.github+json' },
}).then(async (r) => {
  const j = await r.json();
  return { status: r.status, private: j.private, visibility: j.visibility };
}).catch((e) => ({ error: String(e) }));

const report = { ready, visibility, picked, results };
console.log(JSON.stringify(report, null, 2));
if (!ready) {
  console.error('LIVE UPDATE NOT PUBLIC — phone cannot auto-update until the GitHub repo is public.');
  process.exit(1);
}
console.error(`LIVE UPDATE PUBLIC — ${picked.ref} ${picked.version} (${picked.zipBytes} byte zip)`);
