import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSnapshot,
  canonical,
  diffEntries,
  displayName,
  entryHash,
  findNameKey,
  findTex,
  normalizeEntries,
} from '../scripts/diff-gamedata.mjs';

test('canonical is key-order independent', () => {
  assert.equal(canonical({ b: 1, a: [3, 2] }), canonical({ a: [3, 2], b: 1 }));
  assert.notEqual(canonical({ a: [1, 2] }), canonical({ a: [2, 1] }));
});

test('normalizeEntries keys lists and dicts', () => {
  const list = normalizeEntries([{ id: 'A', v: 1 }, { id: 'B' }], ['id']);
  assert.deepEqual(list.map(e => e.key), ['A', 'B']);
  const dict = normalizeEntries({ X: { v: 1 } }, ['id']);
  assert.deepEqual(dict.map(e => e.key), ['X']);
  // Entries without any id key are skipped, never crash the diff.
  assert.equal(normalizeEntries([{ v: 1 }], ['id']).length, 0);
});

test('duplicate-key variants compare as multisets', () => {
  // units_gas.json repeats each baseId per rarity tier: identical
  // multisets (even reordered) report none...
  const variants = [
    { key: 'U', entry: { t: 1 } },
    { key: 'U', entry: { t: 2 } },
  ];
  const old = buildSnapshot(variants);
  assert.deepEqual(diffEntries(old, [...variants].reverse()), { added: [], removed: [], changed: [] });
  // ...while a genuinely changed variant reports the key once.
  const changed = [
    { key: 'U', entry: { t: 1 } },
    { key: 'U', entry: { t: 3 } },
  ];
  assert.deepEqual(diffEntries(old, changed).changed, ['U']);
});

test('added and removed keys are reported once', () => {
  const old = buildSnapshot([{ key: 'A', entry: { v: 1 } }]);
  const r = diffEntries(old, [{ key: 'B', entry: { v: 2 } }]);
  assert.deepEqual(r.added, ['B']);
  assert.deepEqual(r.removed, ['A']);
  assert.deepEqual(r.changed, []);
});

test('findNameKey prefers loc-style name/title keys', () => {
  assert.equal(findNameKey({ nameKey: 'UNIT_X_NAME', id: 'X' }), 'UNIT_X_NAME');
  assert.equal(findNameKey({ titleKey: 'EVENT_Y_NAME' }), 'EVENT_Y_NAME');
  assert.equal(findNameKey({ id: 'X' }), null);
  assert.equal(findNameKey(null), null);
});

test('findTex returns the first tex reference', () => {
  assert.equal(findTex({ thumbnailName: 'tex.charui_x', id: 'X' }), 'tex.charui_x');
  assert.equal(findTex({ nested: { art: 'tex.foo' } }), 'tex.foo');
  assert.equal(findTex({ id: 'X' }), null);
});

test('displayName resolves, then prettifies, then falls back', () => {
  const names = new Map([['UNIT_X_NAME', 'Real Name [c]x[/c]']]);
  assert.equal(displayName('UNIT_X_NAME', 'X', names), 'Real Name x');
  assert.equal(displayName(null, 'STORMTROOPERCONCEPT', new Map()), 'Stormtrooperconcept');
  assert.equal(displayName(null, 'odd id', new Map()), 'odd id');
});
