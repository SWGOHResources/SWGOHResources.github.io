import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const timeSource = fs.readFileSync(new URL('../assets/js/time.js', import.meta.url), 'utf8');
const dayMs = 86400000;

function loadTimeEngine({ eraLength = 84, timeZone = 'UTC', datacronSets = [] } = {}) {
  const storage = new Map([['swgoh-tz', timeZone]]);
  const context = {
    console,
    Intl,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    Set,
    parseInt,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    ERA_START_DATE: '2026-07-28',
    ERA_LENGTH_DAYS: eraLength,
    EPISODE_LENGTH_DAYS: 28,
    TZ_STORAGE_KEY: 'swgoh-tz',
    GAC_CYCLE_START_DATE: '2026-08-11',
    TB_SIDE_ANCHOR_DATE: '2026-08-31',
    TB_RUN_GAP_DAYS: 14,
    TB_SIDE_ANCHOR_SIDE: 'light',
    TB_DEFS: {},
    TB_CHOICE_STORAGE_KEY: 'tb',
    MONTHLY_EVENTS: [],
    EPISODE_OVERRIDES: {},
    COMMON_DAYS: {},
    DATACRON_SETS: datacronSets,
    CONQUEST_END_OFFSETS: [49],
    ERA_START_OFFSETS: [1],
  };
  vm.createContext(context);
  vm.runInContext(timeSource, context);
  return context;
}

test('era rollover follows configured lengths', () => {
  const base = Date.parse('2026-07-28T00:00:00Z');

  for (const eraLength of [56, 70, 84]) {
    const engine = loadTimeEngine({ eraLength });
    assert.equal(engine.absDayToInfo(eraLength, base).eraDay, eraLength);
    assert.equal(engine.absDayToInfo(eraLength + 1, base).eraDay, 1);
    assert.equal(engine.dateMsToEraInfo(base + eraLength * dayMs, base).eraDay, 1);
  }
});

test('GAC changes exactly at 21:00 UTC and remains independent', () => {
  const engine = loadTimeEngine();
  const before = Date.parse('2026-08-11T20:59:59Z');
  const reset = Date.parse('2026-08-11T21:00:00Z');

  assert.equal(engine.gacInfoForTimestamp(before).cycleDay, 28);
  assert.equal(engine.gacInfoForTimestamp(reset).cycleDay, 1);
  assert.equal(engine.gacInfoForTimestamp(reset).format, '5v5');
});

test('timezone offsets are validated and applied to display instants', () => {
  const engine = loadTimeEngine({ timeZone: 'UTC+05:30' });
  const instant = Date.parse('2026-09-03T18:00:00Z');

  assert.equal(engine.tz(), 'UTC');
  assert.equal(engine.dms(instant), instant + (5.5 * 60 * 60 * 1000));
  assert.equal(engine.tzOffsetMinutes('UTC-08:00'), -480);
  assert.equal(engine.tzOffsetMinutes('UTC+14:15'), null);
});

test('journey rerun month end clamps to the destination month', () => {
  const engine = loadTimeEngine({ timeZone: 'UTC' });
  const start = Date.parse('2026-01-31T18:00:00Z');

  assert.match(
    engine.eventDateRangeLabel({ icon: 'journey_rerun_2' }, start),
    /31st Jan.*28th Feb.*1 month/
  );
});

test('datacron expiration is evaluated at 18:00 UTC', () => {
  const sets = [
    { name: 'Old', color: 'orange', expires: '2026-09-03' },
    { name: 'New', color: 'pink', expires: '2026-10-01' },
  ];
  const engine = loadTimeEngine({ datacronSets: sets });

  assert.equal(engine.getCurrentDatacronSet(Date.parse('2026-09-03T17:59:59Z')).name, 'Old');
  assert.equal(engine.getCurrentDatacronSet(Date.parse('2026-09-03T18:00:00Z')).name, 'Old');
  assert.equal(engine.getCurrentDatacronSet(Date.parse('2026-09-03T18:00:01Z')).name, 'New');
});
