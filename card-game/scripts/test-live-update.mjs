#!/usr/bin/env node
/**
 * Guards newest-wins live-update selection so a zip sitting only on a
 * feature branch is not ignored because UPDATE_REFS[0] still has an older copy.
 */
import {
  INSTALL_CHANNEL,
  UPDATE_REFS,
  committedAtMs,
  pickNewestCandidate,
  refsFromManifest,
  uniqueRefs,
} from './live-update-select.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];

function must(cond, msg) {
  if (!cond) fails.push(msg);
}

const older = {
  version: '0.1.0-gf32a31711a',
  zipUrl: 'https://example.test/old.zip',
  ref: INSTALL_CHANNEL,
  committedAt: '2026-04-01T00:00:00Z',
};
const newer = {
  version: '0.1.0-g9b819b0cf9',
  zipUrl: 'https://example.test/new.zip',
  ref: 'cursor/palace-lobby-afk-web-b503',
  committedAt: '2026-09-21T00:00:00Z',
};

const firstMatch = UPDATE_REFS[0] === INSTALL_CHANNEL ? older : newer;
must(firstMatch.version === older.version, 'fixture: installed channel is the stale first match');
must(
  pickNewestCandidate([older, newer]).version === newer.version,
  'must pick the newer feature-branch zip, not the first matching ref'
);
must(
  pickNewestCandidate([newer, older]).version === newer.version,
  'newest wins regardless of probe order'
);
must(
  pickNewestCandidate([older])?.ref === INSTALL_CHANNEL,
  'still accepts the install channel when it is the only copy'
);
must(pickNewestCandidate([]) === null, 'empty list → null');
must(pickNewestCandidate([{ version: 'x' }]) === null, 'missing zipUrl is ignored');

const undatedNew = { ...newer, committedAt: '' };
must(
  pickNewestCandidate([older, undatedNew]).version === older.version,
  'dated candidates beat undated ones (commit date lookup is required)'
);
must(
  pickNewestCandidate([undatedNew, { ...older, committedAt: '' }]).ref === INSTALL_CHANNEL,
  'when no dates exist, prefer the installed APK channel so probes cannot flap'
);

must(committedAtMs('2026-09-21T00:00:00Z') > committedAtMs('2026-04-01T00:00:00Z'), 'date parse order');
must(committedAtMs('') === 0, 'empty date is 0');
must(uniqueRefs(['main', 'main', ' cursor/x ']).join(',') === 'main,cursor/x', 'uniqueRefs trims and dedupes');

const manifest = {
  refs: ['cursor/palace-lobby-afk-web-b503', INSTALL_CHANNEL],
  urls: [
    `https://raw.githubusercontent.com/theharislt-netizen/garage-gains/${INSTALL_CHANNEL}/card-game/live-update/www.zip`,
    'https://raw.githubusercontent.com/theharislt-netizen/garage-gains/cursor/card-game-setup-e78b/card-game/live-update/www.zip',
  ],
};
const discovered = refsFromManifest(manifest);
must(discovered.includes('cursor/palace-lobby-afk-web-b503'), 'manifest.refs are followed');
must(discovered.includes('cursor/card-game-setup-e78b'), 'slash-containing refs parsed from urls');
must(discovered.includes(INSTALL_CHANNEL), 'install channel parsed from urls');

const bridge = readFileSync(join(root, 'scripts/native-bridge.mjs'), 'utf8');
must(bridge.includes('pickNewestCandidate'), 'native-bridge must pick newest, not first-match');
must(bridge.includes('live-update-select.mjs'), 'native-bridge shares the channel list');
must(bridge.includes('commit?.sha || ref'), 'raw fallback must use the commit SHA, not the cached branch URL');
must(!bridge.includes('Last-Modified'), 'CDN Last-Modified must not rank zips — it flaps between channels');
must(!bridge.includes('for (const extra of candidate.extraRefs'), 'manifest extra refs must not enqueue more channels');
must(bridge.includes('APPLIED_KEY') && bridge.includes("reason === 'resume'"), 'one apply per session and a resume cooldown stop update loops');
must(!/for \(const ref of UPDATE_REFS\) \{\s*try \{\s*const api = await fetchManifestFromApi/.test(bridge),
  'native-bridge must not first-match-return inside the ref loop');

const makeLive = readFileSync(join(root, 'scripts/make-live-bundle.mjs'), 'utf8');
must(makeLive.includes('INSTALL_CHANNEL') || makeLive.includes('live-update-select'), 'bundle script shares the channel list');
must(!makeLive.includes('rev-parse --abbrev-ref'), 'the zip manifest does not advertise the working git branch');
must(UPDATE_REFS[0] === INSTALL_CHANNEL, 'install channel stays first so old APKs still find a zip');

if (fails.length) {
  console.error('LIVE-UPDATE CHECKS FAILED:');
  for (const f of fails) console.error(' -', f);
  process.exit(1);
}
console.log('PALACE live-update checks passed');
console.log(JSON.stringify({
  installChannel: INSTALL_CHANNEL,
  refs: UPDATE_REFS,
  pickedFromStaleFirstMatch: pickNewestCandidate([older, newer]).version,
}, null, 2));
