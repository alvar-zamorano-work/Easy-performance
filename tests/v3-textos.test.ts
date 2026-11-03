// Textos de la pantalla de la v3: las mismas claves en castellano e inglés, todas las que usa la página existen y no hay rayas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../web-v3/src/', import.meta.url));
const es: Record<string, string> = JSON.parse(readFileSync(join(SRC, 'textos.es.json'), 'utf8'));
const en: Record<string, string> = JSON.parse(readFileSync(join(SRC, 'textos.en.json'), 'utf8'));

test('textos v3: las mismas claves en los dos idiomas y ninguna vacía', () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const k of Object.keys(es)) { assert.ok(es[k].length, 'vacía en es: ' + k); assert.ok(en[k].length, 'vacía en en: ' + k); }
});

test('textos v3: los mismos marcadores {x} en los dos idiomas', () => {
  const marcas = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const k of Object.keys(es)) assert.equal(marcas(es[k]), marcas(en[k]), k);
});

test('textos v3: sin rayas y con "IA" en castellano', () => {
  for (const [k, v] of Object.entries(es)) { assert.doesNotMatch(v, /[—–]/, k); assert.doesNotMatch(v, /\bAI\b/, k); }
  for (const [k, v] of Object.entries(en)) assert.doesNotMatch(v, /[—–]/, k);
});

test('textos v3: toda clave fija que usa la página existe', () => {
  const faltan: string[] = [];
  for (const f of readdirSync(SRC).filter((x) => /\.(js|html)$/.test(x) && x !== 'textos.js')) {
    const s = readFileSync(join(SRC, f), 'utf8');
    for (const m of s.matchAll(/\bt\(\s*'([^']+)'\s*([,)])/g)) if (!(m[1] in es)) faltan.push(f + ': ' + m[1]);
    for (const m of s.matchAll(/\btn\(\s*'([^']+)'\s*,/g)) if (!(m[1] + '.1' in es) || !(m[1] + '.n' in es)) faltan.push(f + ': ' + m[1] + '.1/.n');
    for (const m of s.matchAll(/data-t="([^"]+)"/g)) if (!(m[1] in es)) faltan.push(f + ': ' + m[1]);
  }
  assert.deepEqual(faltan, []);
});
