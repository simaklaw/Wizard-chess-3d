import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Guarantees i18n completeness stays closed: interface, en and ru expose
// exactly the same key sets with non-empty values, and every t.<key>
// referenced from the UI (App.tsx) and the engine resolves to a real key.
const ROOT = process.cwd();
const i18nSrc = fs.readFileSync(path.join(ROOT, 'src/i18n.ts'), 'utf-8');

function localeKeys(locale) {
  const start = i18nSrc.indexOf('  ' + locale + ': {');
  assert.ok(start !== -1, 'locale ' + locale + ' must exist in i18n.ts');
  const blockStart = i18nSrc.indexOf('{', start) + 1;
  const blockEnd = i18nSrc.indexOf('\n  }', blockStart); // first line at two-space indent closes the locale
  assert.ok(blockEnd > blockStart, 'locale ' + locale + ' block must be closed');
  const block = i18nSrc.slice(blockStart, blockEnd);
  const keys = [...block.matchAll(/^ {4}([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]);
  assert.ok(keys.length > 0, locale + ' must define keys');
  assert.equal(new Set(keys).size, keys.length, locale + ' must not contain duplicate keys');
  const values = [...block.matchAll(/^ {4}[A-Za-z_][A-Za-z0-9_]*:\s*'([^']*)'/gm)].map((m) => m[1]);
  assert.equal(values.length, keys.length, locale + ' values must be single-line quoted strings');
  for (const v of values) assert.ok(v.length > 0, locale + ' must not contain empty values');
  return keys;
}

function interfaceKeys() {
  const start = i18nSrc.indexOf('export interface Translations {');
  assert.ok(start !== -1, 'interface Translations must exist');
  const end = i18nSrc.indexOf('\n}', start);
  const block = i18nSrc.slice(start, end);
  const keys = [...block.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*): string;/gm)].map((m) => m[1]);
  assert.ok(keys.length > 0, 'interface must declare keys');
  return keys;
}

const interfaceSet = new Set(interfaceKeys());
const enKeys = localeKeys('en');
const ruKeys = localeKeys('ru');
const knownKeys = new Set([...interfaceKeys(), ...enKeys, ...ruKeys]);

test('i18n: interface, en and ru expose identical key sets', () => {
  assert.deepEqual([...enKeys].sort(), [...ruKeys].sort(), 'en and ru must have the same keys');
  assert.deepEqual([...interfaceKeys()].sort(), [...enKeys].sort(), 'interface must match en keys');
});

function usedTKeys(filePath) {
  const src = fs.readFileSync(path.join(ROOT, filePath), 'utf-8');
  return [...src.matchAll(/(?<![A-Za-z0-9_$.])t\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
}

test('i18n: every t.<key> referenced from App.tsx and the engine exists', () => {
  for (const file of ['src/App.tsx', 'src/wizardChessEngine.js']) {
    for (const key of usedTKeys(file)) {
      assert.ok(knownKeys.has(key), file + ' uses t.' + key + ' which is not defined in i18n');
    }
  }
});
