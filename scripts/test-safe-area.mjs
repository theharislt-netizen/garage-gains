#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'garage-gains.html'), 'utf8');
const need = [
  'viewport-fit=cover',
  '--app-sat',
  '--app-sab',
  'padding-top: var(--app-sat)',
  'calc(16px + var(--app-sat))',
  '#enchantWindow',
  '#exerciseWikiOverlay',
  '.ob-overlay { position: fixed; inset: 0; z-index: 300; background: var(--bg); display: flex; flex-direction: column; padding-top: var(--app-sat); }',
  'function appSafeTop()',
  'window.syncHeaderHeight = syncHeaderHeight',
];
const missing = need.filter((s) => !html.includes(s));
if (missing.length) {
  console.error('safe-area layout check failed:');
  for (const s of missing) console.error(' - missing', JSON.stringify(s));
  process.exit(1);
}
console.log('safe-area layout ok — status bar / Leave / Back use --app-sat');
