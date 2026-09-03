import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const timeSource = fs.readFileSync(new URL('../assets/js/time.js', import.meta.url), 'utf8');
const dayMs = 86400000;

function loadTimeEngine({ eraLength = 84, timeZone = 'UTC', datacronSets = [], gacStart = '2026-08-11', omit = [], hours = {}, lockOffsets = {} } = {}) {
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
    ev: (icon, label) => ({ icon, label }),
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    ERA_START_DATE: '2026-07-28',
    ERA_LENGTH_DAYS: eraLength,
    EPISODE_LENGTH_DAYS: 28,
    TZ_STORAGE_KEY: 'swgoh-tz',
    GAC_CYCLE_START_DATE: gacStart,
    TB_SIDE_ANCHOR_DATE: '2026-08-31',
    TB_RUN_GAP_DAYS: 14,
    TB_SIDE_ANCHOR_SIDE: 'light',
    TB_DEFS: {
      rote: { name: 'Rise of the Empire', phases: 6, hoursPerPhase: 24 },
    },
    TB_CHOICE_STORAGE_KEY: 'tb',
    MONTHLY_EVENTS: [],
    EPISODE_OVERRIDES: {},
    COMMON_DAYS: {},
    DATACRON_SETS: datacronSets,
    CONQUEST_END_OFFSETS: [49],
    ERA_START_OFFSETS: [1],
    STD_CHANGEOVER_HOUR_UTC: hours.std,
    GAC_CHANGEOVER_HOUR_UTC: hours.gac,
    CONQUEST_ROSTER_LOCK_OFFSET_DAYS: lockOffsets.conquest,
    ERA_ROSTER_LOCK_OFFSET_DAYS: lockOffsets.era,
  };
  for (const key of omit) delete context[key];
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

test('schedule lookups degrade instead of hanging on empty offsets', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.nextOccurrenceAbs([], 50, 84), 50);
  assert.equal(engine.nextOccurrenceAbs(null, 50, 84), 50);
});

test('pre-era days wrap instead of going negative', () => {
  const engine = loadTimeEngine({ eraLength: 84 });
  const base = Date.parse('2026-07-28T00:00:00Z');
  assert.equal(engine.absDayToInfo(0, base).eraDay, 84);
  assert.equal(engine.absDayToInfo(-83, base).eraDay, 1);
});

test('pre-era status reports a countdown instead of fake Day 1', () => {
  const engine = loadTimeEngine({ timeZone: 'UTC' });
  const st = engine.getGameStatus(Date.parse('2026-07-27T12:00:00Z'));
  assert.equal(st.preEra, true);
  assert.equal(st.daysUntilEra, 1);
  assert.equal(st.eraDay, 1);
  const sameDay = engine.getGameStatus(Date.parse('2026-07-28T10:00:00Z'));
  assert.equal(sameDay.preEra, true);
  assert.equal(sameDay.daysUntilEra, 0);
  const live = engine.getGameStatus(Date.parse('2026-07-28T19:00:00Z'));
  assert.equal(live.preEra, false);
  assert.equal(live.daysUntilEra, 0);
});

test('bad GAC start date falls back to a safe default', () => {
  const engine = loadTimeEngine({ gacStart: 'not-a-date' });
  const info = engine.gacInfoForTimestamp(Date.parse('2026-08-11T21:00:00Z'));
  assert.equal(info.cycleDay, 1);
  assert.equal(info.cycleNum, 0);
  assert.equal(info.format, '5v5');
  assert.equal(info.rawDays, 0);
});

test('datacron lookup handles empty and fully-expired configs', () => {
  const empty = loadTimeEngine({ datacronSets: [] });
  assert.equal(empty.getCurrentDatacronSet(Date.parse('2026-09-03T19:00:00Z')), null);

  const stale = loadTimeEngine({
    datacronSets: [{ name: 'Old', color: 'orange', expires: '2026-09-03' }],
  });
  const current = stale.getCurrentDatacronSet(Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(current.name, 'Old');
  assert.equal(current.allExpired, true);
});

test('validator passes a healthy config', () => {
  const engine = loadTimeEngine({
    datacronSets: [{ name: 'Set', color: 'orange', expires: '2026-10-01' }],
  });
  assert.equal(engine.validateScheduleConfig().length, 0);
});

test('validator reports missing config without throwing', () => {
  const engine = loadTimeEngine({ omit: ['ERA_LENGTH_DAYS', 'DATACRON_SETS'] });
  assert.doesNotThrow(() => engine.validateScheduleConfig());
  assert.ok(engine.validateScheduleConfig().some(issue => issue.includes('ERA_LENGTH_DAYS')));
  assert.ok(engine.validateScheduleConfig().some(issue => issue.includes('DATACRON_SETS')));
});

test('invalid changeover hours fall back and are reported', () => {
  const engine = loadTimeEngine({ hours: { std: 25, gac: NaN } });
  assert.equal(engine.stdHour(), 18);
  assert.equal(engine.gacHour(), 21);
  assert.equal(engine.validateScheduleConfig().filter(issue => issue.includes('CHANGEOVER_HOUR')).length, 2);
});

test('invalid roster lock offsets fall back and are reported', () => {
  const engine = loadTimeEngine({ lockOffsets: { conquest: NaN, era: -1 } });
  assert.equal(engine.conquestLockOffsetDays(), 2);
  assert.equal(engine.eraLockOffsetDays(), 1);
  assert.equal(engine.validateScheduleConfig().filter(issue => issue.includes('ROSTER_LOCK_OFFSET')).length, 2);
});

test('last usable guild event follows configured changeover hours', () => {
  const engine = loadTimeEngine({
    hours: { std: 20, gac: 22 },
    datacronSets: [{ name: 'Set', color: 'orange', expires: '2026-09-03' }],
  });
  const expiry = Date.parse('2026-09-03T21:30:00Z');
  const event = engine.getLastUsableGuildEvent(expiry, Date.parse('2026-07-28T00:00:00Z'));
  assert.equal(event.item.icon, 'gac_attack');
  assert.equal(new Date(event.dateMs).toISOString(), '2026-08-31T00:00:00.000Z');
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
