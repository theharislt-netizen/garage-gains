#!/usr/bin/env node
/**
 * v7.0: enchant success table is 5 points lower than the v6.9 curve.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'garage-gains.html'), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sliceLib(name) {
  const begin = html.indexOf(`/* === ${name} begin === */`);
  const end = html.indexOf(`/* === ${name} end === */`);
  assert(begin >= 0 && end > begin, name + ' markers missing');
  return html.slice(begin, end);
}

const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(sliceLib('enchant-regrade-lib'), ctx);

const pct = vm.runInContext('enchantAttemptSuccessPct', ctx);
assert(pct(0) === 65, '1st is 65');
assert(pct(1) === 50, '2nd is 50');
assert(pct(2) === 35, '3rd is 35');
assert(pct(3) === 23, '4th is 23');
assert(pct(4) === 15, '5th is 15');
assert(html.includes('3.4.26'), 'About version bumped for v7.0');
console.log('v7.0 tests ok — enchant rates 65/50/35/23/15');
