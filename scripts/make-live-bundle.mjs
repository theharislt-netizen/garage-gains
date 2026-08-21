#!/usr/bin/env node
/**
 * Packs www/ into a Capgo-compatible zip (index.html at zip root) and writes
 * live-update/manifest.json. Version is a content hash so identical trees
 * produce identical artifacts (safe for auto-commit / skip redundant OTA).
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');
const outDir = join(root, 'live-update');
const REPO = 'theharislt-netizen/garage-gains';
const REFS = ['cursor/android-apk-eee8', 'main'];

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

export async function makeLiveBundle() {
  const files = (await walk(www))
    .filter((f) => !f.endsWith('bundle-version.json'))
    .sort();
  if (!files.some((f) => f.endsWith('index.html'))) {
    throw new Error('www/index.html missing — run prepare:www first');
  }

  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(relative(www, f).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(await readFile(f));
  }
  const version = '3.3.0-g' + hash.digest('hex').slice(0, 10);
  await writeFile(join(www, 'bundle-version.json'), JSON.stringify({ version }, null, 2) + '\n');

  await mkdir(outDir, { recursive: true });
  const zipPath = join(outDir, 'www.zip');
  const py = `
import hashlib, json, os, zipfile, sys
from pathlib import Path
www = Path(sys.argv[1])
zip_path = Path(sys.argv[2])
files = []
for p in sorted(www.rglob('*')):
    if not p.is_file() or p.name.startswith('.'):
        continue
    rel = p.relative_to(www).as_posix()
    files.append((rel, p.read_bytes()))
# rebuild zip with fixed timestamps for a stable checksum
with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for rel, data in files:
        info = zipfile.ZipInfo(rel, date_time=(2024, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3
        zf.writestr(info, data)
print('zipped', len(files), 'files')
`;
  const r = spawnSync('python3', ['-c', py, www, zipPath], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || 'zip failed');
  }

  const zipBytes = await readFile(zipPath);
  const checksum = createHash('sha256').update(zipBytes).digest('hex');
  const manifest = {
    version,
    checksum,
    url: `https://raw.githubusercontent.com/${REPO}/${REFS[0]}/live-update/www.zip`,
    urls: REFS.map((ref) => `https://raw.githubusercontent.com/${REPO}/${ref}/live-update/www.zip`),
  };
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`live-update bundle ${version} (${(zipBytes.length / 1024).toFixed(0)} KB)`);
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await makeLiveBundle();
}
