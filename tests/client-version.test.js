import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  detectTransitions,
  gamedataBase,
} from '../scripts/check-client-version.mjs';

const snap = (storeVersion, gamedata, asset) => ({
  checkedAt: 1,
  store: { version: storeVersion, releaseDate: 'd', releaseNotes: 'n' },
  server: { gamedata, asset, serverVersion: '1', loc: 'L' },
});

test('gamedataBase strips the rotating hash suffix', () => {
  assert.equal(gamedataBase('0.40.5:MoxBSQUYRjuplwCT1HagpQ'), '0.40.5');
  assert.equal(gamedataBase('0.40.6:abc'), '0.40.6');
  assert.equal(gamedataBase(null), '');
});

test('identical snapshots report no transition', () => {
  const s = snap('0.40.6', '0.40.5:AAA', 100048);
  assert.equal(detectTransitions(s, snap('0.40.6', '0.40.5:AAA', 100048)).verdict, 'none');
});

test('first run (no baseline) seeds without alerting', () => {
  assert.equal(detectTransitions(null, snap('0.40.6', '0.40.5:AAA', 100048)).verdict, 'none');
});

test('store-only bump reports store_bump', () => {
  const { verdict, storeBump, forcedFlip } = detectTransitions(
    snap('0.40.3', '0.40.5:AAA', 100048),
    snap('0.40.6', '0.40.5:AAA', 100048),
  );
  assert.equal(verdict, 'store_bump');
  assert.equal(storeBump, true);
  assert.equal(forcedFlip, false);
});

test('routine hash-suffix rotation never alerts', () => {
  // Sep 2–4 pattern: same 0.40.5 base, new hash. Snapshot updates,
  // workflow commits, but no Discord post.
  const { verdict } = detectTransitions(
    snap('0.40.6', '0.40.5:AAA', 100048),
    snap('0.40.6', '0.40.5:BBB', 100048),
  );
  assert.equal(verdict, 'none');
});

test('localization-only rotation never alerts', () => {
  const a = snap('0.40.6', '0.40.5:AAA', 100048);
  const b = { ...snap('0.40.6', '0.40.5:AAA', 100048), server: { gamedata: '0.40.5:AAA', asset: 100048, serverVersion: '999', loc: 'NEW' } };
  assert.equal(detectTransitions(a, b).verdict, 'none');
});

test('gamedata base change reports forced_flip', () => {
  assert.equal(
    detectTransitions(
      snap('0.40.6', '0.40.5:AAA', 100048),
      snap('0.40.6', '0.40.6:ZZZ', 100048),
    ).verdict,
    'forced_flip',
  );
});

test('asset change reports forced_flip', () => {
  assert.equal(
    detectTransitions(
      snap('0.40.6', '0.40.5:AAA', 100048),
      snap('0.40.6', '0.40.5:AAA', 100049),
    ).verdict,
    'forced_flip',
  );
});

test('simultaneous store + server move reports both', () => {
  assert.equal(
    detectTransitions(
      snap('0.40.3', '0.40.5:AAA', 100048),
      snap('0.40.6', '0.40.6:ZZZ', 100049),
    ).verdict,
    'both',
  );
});

test('committed client-version.json is well-formed', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../assets/data/client-version.json', import.meta.url), 'utf8'));
  assert.ok(Number.isFinite(data.checkedAt));
  assert.ok(typeof data.store?.version === 'string' && data.store.version.length > 0);
  assert.ok(typeof data.server?.gamedata === 'string' && data.server.gamedata.length > 0);
  assert.ok(Number.isFinite(data.server?.asset));
});
