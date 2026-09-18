import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const timeSource = fs.readFileSync(new URL('../assets/js/time.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../assets/js/config.js', import.meta.url), 'utf8');
const renderSource = fs.readFileSync(new URL('../assets/js/render.js', import.meta.url), 'utf8');
const dayMs = 86400000;

/* Real EVENT_ICONS from config.js so validator unknown-icon checks run
   against the true allowlist (config has no DOM deps, so it loads clean). */
const _configCtx = { ev: (icon, label) => ({ icon, label }) };
vm.createContext(_configCtx);
vm.runInContext(configSource, _configCtx);
// NOTE: const-declared globals aren't context properties — read it back
// by evaluating inside the same realm.
const realEventIcons = vm.runInContext('EVENT_ICONS', _configCtx);
const realSquareIcons = vm.runInContext('FIT_ART_ICONS', _configCtx);

function loadTimeEngine({ eraLength = 84, timeZone = 'UTC', datacronSets = [], gacStart = '2026-08-11', omit = [], hours = {}, lockOffsets = {}, commonDays = {}, episodeOverrides = {}, monthlyEvents = [] } = {}) {
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
    TW_PHASE_ICONS: ['tw_signup', 'tw_defense', 'tw_offense'],
    EVENT_ICONS: realEventIcons,
    FIT_ART_ICONS: realSquareIcons,
    MONTHLY_EVENTS: monthlyEvents,
    EPISODE_OVERRIDES: episodeOverrides,
    COMMON_DAYS: commonDays,
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

/* Full stack (config + time + render) with a stub DOM, for testing
   rendered output like the explorer day pills. */
function loadRenderEngine({ timeZone = 'UTC' } = {}) {
  const storage = new Map([['swgoh-tz', timeZone]]);
  const mkEl = () => ({
    innerHTML: '', textContent: '', hidden: false, disabled: false,
    scrollLeft: 0, dataset: {}, style: {}, value: '', title: '',
    contains: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const els = {};
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
    history: { replaceState: () => {} },
    document: {
      activeElement: null,
      getElementById: id => els[id] ??= mkEl(),
      querySelectorAll: () => [],
      createElement: () => mkEl(),
      body: mkEl(),
    },
  };
  vm.createContext(context);
  vm.runInContext(configSource, context);
  vm.runInContext(timeSource, context);
  vm.runInContext(renderSource, context);
  return { ctx: context, els };
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

test('GAC status reports the actual time until an intra-day transition', () => {
  const engine = loadTimeEngine();
  const status = engine.getGacStatus(engine.getGameStatus(Date.parse('2026-08-12T20:59:00Z')));

  assert.match(status.sub, /in 1 minute/);
});

test('GAC card dates use the 21:00 UTC transition', () => {
  const engine = loadTimeEngine({ timeZone: 'UTC+03:00' });
  const dayStart = Date.parse('2026-08-11T00:00:00Z');

  assert.equal(
    engine.fmtDayMonthUTC(engine.eventDisplayMs({ icon: 'gac_signup' }, dayStart)),
    '12th Aug'
  );
  assert.equal(
    engine.fmtDayMonthUTC(engine.eventDisplayMs({ icon: 'tw_signup' }, dayStart)),
    '11th Aug'
  );
});

test('timezone offsets are validated and applied to display instants', () => {
  const engine = loadTimeEngine({ timeZone: 'UTC+05:30' });
  const instant = Date.parse('2026-09-03T18:00:00Z');

  assert.equal(engine.tz(), 'UTC');
  assert.equal(engine.dms(instant), instant + (5.5 * 60 * 60 * 1000));
  assert.equal(engine.tzOffsetMinutes('UTC-08:00'), -480);
  assert.equal(engine.tzOffsetMinutes('UTC+14:15'), null);
});

test('GAC and Conquest countdowns include dates in the selected timezone', () => {
  const engine = loadTimeEngine({ timeZone: 'UTC+10:00' });
  const gacStatus = engine.getGacStatus({
    nowMs: Date.parse('2026-08-11T21:30:00Z'),
    gacCycleDay: 1,
    gacFormat: '5v5',
  });
  const conquestStatus = engine.getConquestStatus(engine.getGameStatus(Date.parse('2026-08-02T20:00:00Z')));

  assert.match(gacStatus.sub, /13th Aug/);
  assert.match(conquestStatus.main, /4th Aug/);
});

test('Conquest active countdown points to the Monday end boundary', () => {
  const engine = loadTimeEngine();
  const status = engine.getConquestStatus(engine.getGameStatus(Date.parse('2026-08-14T20:00:00Z')));

  assert.equal(status.main, 'Conquest Day 12 of 14');
  assert.match(status.sub, /^Ends in under 3 days · 17th Aug$/);
});

test('conquest countdown counts full days after today', () => {
  const engine = loadTimeEngine();
  // Day 5 of 14 (Ep1 dep 11): 9d23h out rounds up, owned explicitly.
  const status = engine.getConquestStatus(engine.getGameStatus(Date.parse('2026-08-07T19:00:00Z')));

  assert.equal(status.main, 'Conquest Day 5 of 14');
  assert.match(status.sub, /^Ends in under 10 days · 17th Aug$/);
});

test('dashboard countdowns own their rounding with over/under days', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.formatGacUntil(0, 25 * 3600000), 'in over 1 day');
  assert.equal(engine.formatGacUntil(0, 47 * 3600000), 'in under 2 days');
  assert.equal(engine.formatGacUntil(0, 49 * 3600000), 'in over 2 days');
  assert.equal(engine.formatGacUntil(0, 48 * 3600000), 'in 2 days');
  assert.equal(engine.formatGacUntil(0, 24 * 3600000), 'in 1 day');
  assert.equal(engine.formatGacUntil(0, 22 * 3600000 + 5 * 60000), 'in 22 hours');
  assert.equal(engine.formatGacUntil(0, 90 * 1000), 'in 1 minute');
  assert.equal(engine.formatGacUntil(0, 30 * 1000), 'in 1 minute');
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

test('schedule lookups degrade on invalid offsets', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.nextOccurrenceAbs([NaN, Infinity, 0, 85], 50, 84), 50);
  assert.ok(engine.validateScheduleConfig().every(issue => !issue.includes('OFFSETS')));
});

test('era unlock lookup skips an era that starts today', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.nextOccurrenceAbs([1], 1, 84), 1);
  assert.equal(engine.nextOccurrenceAbs([1], 2, 84), 85);
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

test('impossible GAC calendar dates fall back instead of rolling into another month', () => {
  const engine = loadTimeEngine({ gacStart: '2026-02-31' });
  const info = engine.gacInfoForTimestamp(Date.parse('2026-08-11T21:00:00Z'));
  assert.equal(info.cycleDay, 1);
  assert.equal(info.cycleNum, 0);
  assert.equal(info.format, '5v5');
  assert.equal(info.rawDays, 0);
});

test('GAC status uses a safe date when the start date is malformed or missing', () => {
  for (const options of [{ gacStart: 'not-a-date' }, { omit: ['GAC_CYCLE_START_DATE'] }]) {
    const engine = loadTimeEngine(options);
    const status = engine.getGacStatus(engine.getGameStatus(Date.parse('2026-08-11T21:30:00Z')));
    assert.doesNotMatch(status.sub, /Invalid Date/);
    assert.match(status.sub, /12th Aug/);
  }
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

test('malformed era dates fall back without crashing status calculation', () => {
  const engine = loadTimeEngine({ omit: ['ERA_START_DATE'] });
  assert.doesNotThrow(() => engine.getGameStatus(Date.parse('2026-07-28T19:00:00Z')));
  assert.equal(engine.getGameStatus(Date.parse('2026-07-28T19:00:00Z')).preEra, false);
  assert.ok(engine.validateScheduleConfig().some(issue => issue.includes('ERA_START_DATE')));
});

test('invalid datacron dates are ignored instead of rendering invalid dates', () => {
  const engine = loadTimeEngine({
    datacronSets: [null, { name: 'Bad', color: 'orange', expires: '2026-02-31' }],
  });
  assert.equal(engine.getCurrentDatacronSet(Date.parse('2026-09-03T19:00:00Z')), null);
  assert.ok(engine.validateScheduleConfig().some(issue => issue.includes('DATACRON_SETS[1]')));
});

test('date validation requires real canonical calendar dates', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.validateScheduleConfig().some(issue => issue.includes('ERA_START_DATE')), false);
  const invalid = loadTimeEngine();
  invalid.GAC_CYCLE_START_DATE = '2026-2-3';
  assert.ok(invalid.validateScheduleConfig().some(issue => issue.includes('GAC_CYCLE_START_DATE')));
});

test('date-only parsing preserves years below 100', () => {
  const engine = loadTimeEngine();
  assert.equal(new Date(engine.parseDateOnlyMs('0001-01-01')).toISOString(), '0001-01-01T00:00:00.000Z');
});

test('era status preserves years below 100', () => {
  const engine = loadTimeEngine();
  engine.ERA_START_DATE = '0001-01-01';
  const status = engine.getGameStatus(Date.parse('0001-01-01T18:00:00Z'));

  assert.equal(new Date(status.currentDayStartMs).toISOString(), '0001-01-01T00:00:00.000Z');
  assert.equal(status.preEra, false);
  assert.equal(status.eraDay, 1);
});

test('conquest volume ordinals use the correct suffix', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.conquestOrdinal(21), '21st');
  assert.equal(engine.conquestOrdinal(22), '22nd');
  assert.equal(engine.conquestOrdinal(23), '23rd');
  assert.equal(engine.conquestOrdinal(24), '24th');
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

test('invalid conquest settings fall back without crashing status or labels', () => {
  const engine = loadTimeEngine();
  engine.CONQUEST_START_DAY_IN_EP = '7';
  engine.CONQUEST_END_DAY_IN_EP = 0;
  engine.CONQUEST_DURATION_DAYS = NaN;

  assert.equal(engine.conquestStartDay(), 7);
  assert.equal(engine.conquestEndDay(), 20);
  assert.equal(engine.conquestDurationDays(), 14);
  assert.doesNotThrow(() => engine.getConquestStatus(engine.getGameStatus(Date.parse('2026-08-14T20:00:00Z'))));
  assert.match(
    engine.eventDateRangeLabel({ icon: 'conquest_start' }, Date.parse('2026-08-04T00:00:00Z')),
    /14 days/
  );
  const issues = engine.validateScheduleConfig();
  assert.ok(issues.some(issue => issue.includes('Conquest days')));
  assert.ok(issues.some(issue => issue.includes('CONQUEST_DURATION_DAYS')));
});

test('mismatched conquest duration falls back to the configured day span', () => {
  const engine = loadTimeEngine();
  engine.CONQUEST_DURATION_DAYS = 10;

  assert.equal(engine.conquestDurationDays(), 14);
  assert.ok(engine.validateScheduleConfig().some(issue => issue.includes('must match')));
});

test('conquest upcoming status counts to the start instant', () => {
  const engine = loadTimeEngine();
  // 23h out reads in hours, not "Starts in 1 day".
  const status = engine.getConquestStatus(engine.getGameStatus(Date.parse('2026-08-02T19:00:00Z')));

  assert.match(status.main, /^Starts in 23 hours ·/);
});

test('rotation cards use each family’s real daily start, not 18:00', () => {
  const engine = loadTimeEngine();
  const day = Date.parse('2026-09-14T00:00:00Z');
  const at = (icon) => new Date(engine.eventDisplayMs({ icon }, day)).toISOString();
  // Live game data: smuggling runs 10:00, fleet mastery 07:00 UTC.
  assert.equal(at('smugglersrun'), '2026-09-14T10:00:00.000Z');
  assert.equal(at('fleet_executor'), '2026-09-14T07:00:00.000Z');
  assert.equal(at('proving_ground'), '2026-09-14T18:00:00.000Z');
  // TW/TB go at 17:00 UTC; GAC/conquest/marquee/era keep theirs.
  assert.equal(at('tw_offense'), '2026-09-14T17:00:00.000Z');
  assert.equal(at('rote'), '2026-09-14T17:00:00.000Z');
  assert.equal(at('tb_ends'), '2026-09-14T17:00:00.000Z');
  assert.equal(at('gac_attack'), '2026-09-14T21:00:00.000Z');
  assert.equal(at('conquest_start'), '2026-09-14T18:00:00.000Z');
  assert.equal(at('marquee_1'), '2026-09-14T18:00:00.000Z');
  // …so tense flips at the real start: a smuggling run at noon UTC
  // has started (10:00), even though the 18:00 changeover is ahead.
  assert.equal(
    engine.tenseByStart("Smuggler's Run I Starts", { icon: 'smugglersrun' }, day, Date.parse('2026-09-14T12:00:00Z')),
    "Smuggler's Run I Started"
  );
  assert.equal(
    engine.tenseByStart("Smuggler's Run I Starts", { icon: 'smugglersrun' }, day, Date.parse('2026-09-14T09:00:00Z')),
    "Smuggler's Run I Starts"
  );
});

test('important-dates labels count hours under 24h out', () => {
  const engine = loadTimeEngine();
  const now = Date.parse('2026-09-14T14:55:00Z');
  assert.equal(engine.subDayCount(now, now + 3 * 3600000, 'In 1 day'), 'In 3h');
  assert.equal(engine.subDayCount(now, now + 20 * 60000, 'Expires today'), 'In 20m');
  assert.equal(engine.subDayCount(now, now + 3 * dayMs, 'In 3 days'), 'In 3 days');
  assert.equal(engine.subDayCount(now, now + 24 * 3600000, 'In 1 day'), 'In 1 day');
  assert.equal(engine.subDayCount(now, now - 1000, 'Expires today'), 'Expires today');
  assert.equal(engine.subDayCount(now, null, 'In 1 day'), 'In 1 day');
});

test('day counts own their rounding', () => {
  const engine = loadTimeEngine();
  const day = 86400000;
  assert.equal(engine.formatDayCount(2 * day), 'in 2 days');
  assert.equal(engine.formatDayCount(1 * day), 'in 1 day');
  assert.equal(engine.formatDayCount(2.04 * day), 'in over 2 days');
  assert.equal(engine.formatDayCount(2.92 * day), 'in under 3 days');
  // Important Dates fall back to plain day wording without a clock.
  assert.equal(engine.subDayCount(null, Date.now() + 3 * day, 'In 3 days'), 'In 3 days');
  assert.equal(engine.subDayCount(Date.now(), Date.now() + 3 * day, 'In 3 days'), 'In 3 days');
});

test('explorer opens on the incoming day shortly before changeover', () => {
  const engine = loadTimeEngine();
  const dayStart = Date.parse('2026-09-13T00:00:00Z');
  const changeover = dayStart + dayMs + 18 * 3600000; // next 18:00 UTC
  assert.equal(engine.activeDayPreviewHours(), 3);
  // 2h out previews the incoming day; 5h out stays on the in-game day.
  assert.equal(engine.defaultExplorerOffset(changeover - 2 * 3600000, dayStart), 1);
  assert.equal(engine.defaultExplorerOffset(changeover - 5 * 3600000, dayStart), 0);
  // Exactly at/past the changeover there is nothing to preview.
  assert.equal(engine.defaultExplorerOffset(changeover, dayStart), 0);
  assert.equal(engine.defaultExplorerOffset(changeover + 1000, dayStart), 0);
  assert.equal(engine.defaultExplorerOffset(null, dayStart), 0);
});

test('event-start pills count to each event start', () => {
  const engine = loadTimeEngine();
  const now = Date.parse('2026-09-14T14:55:00Z');
  // 18:00 changeover event 3h05m out; GAC at 21:00 is 6h05m out.
  assert.equal(engine.relForEventStart(Date.parse('2026-09-14T18:00:00Z'), now, 'In 1 day'), 'In 3h 5m');
  assert.equal(engine.relForEventStart(Date.parse('2026-09-14T21:00:00Z'), now, 'In 1 day'), 'In 6h 5m');
  // 36h-TB 06:00 moment 20m out reads in minutes.
  assert.equal(engine.relForEventStart(Date.parse('2026-09-14T15:15:00Z'), now, 'In 1 day'), 'In 20m');
  // Minutes disambiguate events sharing an hour: 2h45m vs 2h05m.
  assert.equal(engine.relForEventStart(now + (2 * 3600 + 45 * 60) * 1000, now, 'In 1 day'), 'In 2h 45m');
  assert.equal(engine.relForEventStart(now + (2 * 3600 + 5 * 60) * 1000, now, 'In 1 day'), 'In 2h 5m');
  assert.equal(engine.formatHoursMinutes(2 * 3600000 + 45 * 60000), '2h 45m');
  assert.equal(engine.formatHoursMinutes(45 * 60000), '45m');
  assert.equal(engine.formatHoursMinutes(30000), '1m');
  // Already started reads Now; far starts keep the day wording.
  assert.equal(engine.relForEventStart(now - 1000, now, 'In 1 day'), 'Now');
  assert.equal(engine.relForEventStart(now + 3 * dayMs, now, 'In 3 days'), 'In 3 days');
  assert.equal(engine.relForEventStart(null, now, 'In 1 day'), 'In 1 day');
});

test('TB choice is always Rise of the Empire regardless of run side', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.tbChoiceForRun(null).id, 'rote');
  assert.equal(engine.tbChoiceForRun({ phase1Ms: Date.parse('2026-08-31'), offset: 0 }).id, 'rote');
  assert.equal(engine.tbChoiceForRun({ phase1Ms: Date.parse('2026-09-14'), offset: 3 }).name, 'Rise of the Empire');
});

test('last usable guild event follows configured changeover hours', () => {
  const engine = loadTimeEngine({
    hours: { std: 20, gac: 22 },
    datacronSets: [{ name: 'Set', color: 'orange', expires: '2026-09-03' }],
  });
  const expiry = Date.parse('2026-09-03T21:30:00Z');
  const event = engine.getLastUsableGuildEvent(expiry, Date.parse('2026-07-28T00:00:00Z'));
  assert.equal(event.gac.item.icon, 'gac_attack');
  assert.equal(new Date(event.gac.dateMs).toISOString(), '2026-08-31T00:00:00.000Z');
});

test('locked TW remains usable after expiry and takes precedence over an overlapping GAC phase', () => {
  const engine = loadTimeEngine({
    gacStart: '2026-07-28',
    commonDays: {
      1: [{ icon: 'tw_signup', label: 'Signup Starts' }],
      2: [{ icon: 'tw_defense', label: 'Defense Phase Starts' }],
      3: [{ icon: 'tw_offense', label: 'Offense Phase Starts' }],
    },
  });
  const expiry = Date.parse('2026-07-30T18:00:00Z');
  const event = engine.getLastUsableGuildEvent(expiry, Date.parse('2026-07-28T00:00:00Z'));

  assert.equal(event.gac.item.icon, 'gac_attack');
  assert.equal(new Date(event.gac.dateMs).toISOString(), '2026-07-30T00:00:00.000Z');
  assert.equal(event.tw.item.icon, 'tw_offense');
  assert.equal(new Date(event.tw.dateMs).toISOString(), '2026-07-30T00:00:00.000Z');
  assert.equal(event.tw.twNumber, 1);
});

test('TW numbering identifies the second signup in a GAC week', () => {
  const engine = loadTimeEngine({
    gacStart: '2026-07-28',
    commonDays: {
      1: [{ icon: 'tw_signup', label: 'Signup Starts' }],
      2: [{ icon: 'tw_defense', label: 'Defense Phase Starts' }],
      3: [{ icon: 'tw_offense', label: 'Offense Phase Starts' }],
      4: [{ icon: 'tw_payout', label: 'Payout' }, { icon: 'tw_signup', label: 'Signup Starts' }],
      5: [{ icon: 'tw_defense', label: 'Defense Phase Starts' }],
      6: [{ icon: 'tw_offense', label: 'Offense Phase Starts' }],
      7: [{ icon: 'tw_payout', label: 'Payout' }],
    },
  });
  const expiry = Date.parse('2026-08-04T18:00:00Z');
  const event = engine.getLastUsableGuildEvent(expiry, Date.parse('2026-07-28T00:00:00Z'));

  assert.equal(event.tw.item.icon, 'tw_payout');
  assert.equal(event.tw.twNumber, 2);
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

test('relative day labels distinguish past from upcoming', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.relativeDayLabel(0), 'Now');
  assert.equal(engine.relativeDayLabel(1), 'In 1 day');
  assert.equal(engine.relativeDayLabel(2), 'In 2 days');
  assert.equal(engine.relativeDayLabel(-1), 'Yesterday');
  assert.equal(engine.relativeDayLabel(-2), '2 days ago');
});

test('relative day labels count hours when tomorrow is hours away', () => {
  const engine = loadTimeEngine();
  const dayStart = Date.UTC(2026, 8, 13); // midnight UTC game-day base
  const changeover = dayStart + dayMs + 18 * 3600000; // tomorrow's 18:00 UTC
  // 3h out reads as hours, not "In 1 day".
  assert.equal(engine.relativeDayLabel(1, changeover - 3 * 3600000, dayStart), 'In 3h');
  // Under an hour reads in minutes.
  assert.equal(engine.relativeDayLabel(1, changeover - 30 * 60000, dayStart), 'In 30m');
  // Just after today's changeover, tomorrow is ~24h out — still day wording past 24h.
  assert.equal(engine.relativeDayLabel(1, dayStart + 18 * 3600000 - 60000, dayStart), 'In 1 day');
  // Day offsets beyond tomorrow are untouched by the hours logic.
  assert.equal(engine.relativeDayLabel(2, changeover - 3 * 3600000, dayStart), 'In 2 days');
  assert.equal(engine.relativeDayLabel(0, changeover - 3 * 3600000, dayStart), 'Now');
});

test('pre-era countdown follows the display timezone calendar', () => {
  const engine = loadTimeEngine({ timeZone: 'UTC+14:00' });
  // 2026-07-27T10:00Z is Jul 28 at +14; the changeover lands Jul 29 local.
  const st = engine.getGameStatus(Date.parse('2026-07-27T10:00:00Z'));
  assert.equal(st.preEra, true);
  assert.equal(st.daysUntilEra, 1);
  // 2026-07-28T10:00Z is Jul 29 at +14, the changeover's local day.
  const sameDay = engine.getGameStatus(Date.parse('2026-07-28T10:00:00Z'));
  assert.equal(sameDay.preEra, true);
  assert.equal(sameDay.daysUntilEra, 0);
});

test('missing era lengths fall back without poisoning status', () => {
  const engine = loadTimeEngine({ omit: ['ERA_LENGTH_DAYS', 'EPISODE_LENGTH_DAYS'] });
  assert.equal(engine.eraLengthDays(), 84);
  assert.equal(engine.episodeLengthDays(), 28);
  const st = engine.getGameStatus(Date.parse('2026-08-14T20:00:00Z'));
  assert.equal(st.eraDay, 18);
  assert.equal(st.episode, 1);
  assert.equal(st.dayInEp, 18);
  assert.ok(engine.validateScheduleConfig().some(issue => issue.includes('ERA_LENGTH_DAYS')));
  assert.ok(engine.validateScheduleConfig().some(issue => issue.includes('EPISODE_LENGTH_DAYS')));
});

test('started events render in past tense', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.tensedLabel('Phase 4 Starts', true), 'Phase 4 Started');
  assert.equal(engine.tensedLabel('Territory Battle Ends', true), 'Territory Battle Ended');
  assert.equal(engine.tensedLabel('Phase 4 Starts', false), 'Phase 4 Starts');
  assert.equal(engine.tensedLabel('Payout', true), 'Payout');
  assert.equal(engine.tensedLabel('Phase 2 Continues', true), 'Phase 2 Continues');
});

test('event start instants prefer TB transition moments over changeovers', () => {
  const engine = loadTimeEngine();
  const midnight = Date.parse('2026-08-10T00:00:00Z');
  assert.equal(engine.eventStartMs({ icon: 'tw_signup' }, midnight), midnight + 17 * 3600000);
  assert.equal(engine.eventStartMs({ icon: 'gac_attack' }, midnight), midnight + 21 * 3600000);
  assert.equal(engine.eventStartMs({ icon: 'rote', tbStartMoment: midnight + 6 * 3600000 }, midnight), midnight + 6 * 3600000);
  assert.equal(engine.eventStartMs({ icon: 'rote', tbEndMoment: midnight + 6 * 3600000 }, midnight), midnight + 6 * 3600000);
});

test('guild summaries tense by the event start instant', () => {
  const engine = loadTimeEngine({
    commonDays: { 5: [{ icon: 'tw_offense', label: 'Offense Phase Starts' }] },
  });
  const dayStart = Date.parse('2026-08-04T00:00:00Z');
  assert.equal(
    engine.getGuildEventSummary(1, 5, dayStart, Date.parse('2026-08-04T16:00:00Z')),
    'TW Offense Phase Starts'
  );
  assert.equal(
    engine.getGuildEventSummary(1, 5, dayStart, Date.parse('2026-08-04T18:00:00Z')),
    'TW Offense Phase Started'
  );
  assert.equal(engine.getGuildEventSummary(1, 5, dayStart), 'TW Offense Phase Starts');
});

test('TW payout days read as intermission on the guild card', () => {
  const engine = loadTimeEngine({
    commonDays: { 5: [{ icon: 'tw_payout', label: 'Payout' }] },
  });
  const dayStart = Date.parse('2026-08-04T00:00:00Z');
  // Payout lands in the inbox in seconds — no event is running.
  assert.equal(engine.getGuildEventSummary(1, 5, dayStart, Date.parse('2026-08-04T19:00:00Z')), 'Guild Intermission');
});

test('bonus proving grounds runs the day before proving grounds', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  for (const ep of [1, 2, 3]) {
    const pre = run(`getDayEvents(${ep}, 20).map(i => i.label)`);
    const pg = run(`getDayEvents(${ep}, 21).map(i => i.label)`);
    assert.ok(pre.some(l => /Bonus Proving Grounds/.test(l)), `ep ${ep} day 20 bonus`);
    assert.ok(pre.some(l => l === 'Payout'), `ep ${ep} day 20 keeps payout`);
    assert.ok(pg.some(l => l === 'Proving Grounds'), `ep ${ep} day 21 regular`);
  }
  // Same art, accent and start hour as the regular card.
  const bonus = run(`JSON.stringify({ art: assetFor('proving_ground'), cat: categoryFor('proving_ground'),
    start: eventDisplayMs({ icon: 'proving_ground' }, ${Date.parse('2026-08-10T00:00:00Z')}) })`);
  assert.equal(
    bonus,
    JSON.stringify({ art: 'events/provingground.png', cat: 'conquest', start: Date.parse('2026-08-10T18:00:00Z') })
  );
});

test('GAC pill names week and round without the phase suffix', () => {
  const engine = loadTimeEngine();
  for (const stamp of ['2026-08-12T12:00:00Z', '2026-08-13T12:00:00Z', '2026-08-14T12:00:00Z', '2026-08-15T12:00:00Z']) {
    const s = engine.getGacStatus(engine.getGameStatus(Date.parse(stamp)));
    assert.match(s.status, /^Week \d+(, Round \d+)?$/);
  }
  assert.equal(engine.getGacStatus(engine.getGameStatus(Date.parse('2026-08-11T12:00:00Z'))).status, 'OFF-WEEK');
});

test('TB phase summaries tense by the event start instant', () => {
  const engine = loadTimeEngine({
    commonDays: { 10: [{ icon: 'rote', label: 'Phase 4 Starts' }] },
  });
  const dayStart = Date.parse('2026-08-10T00:00:00Z');
  assert.equal(
    engine.getGuildEventSummary(1, 10, dayStart, Date.parse('2026-08-10T10:00:00Z')),
    'Rise of the Empire Phase 4 Starts'
  );
  assert.equal(
    engine.getGuildEventSummary(1, 10, dayStart, Date.parse('2026-08-10T19:00:00Z')),
    'Rise of the Empire Phase 4 Started'
  );
});

test('off-week GAC locks roll into Week 1 of the next cycle', () => {
  const engine = loadTimeEngine();
  // deepEqual can't cross the vm realm boundary (prototypes differ),
  // so the week/format fields are compared individually.
  const cases = [
    [1, '5v5', 1, '5v5'],
    [21, '5v5', 3, '5v5'],
    [22, '5v5', 1, '3v3'],
    [28, '3v3', 1, '5v5'],
  ];
  for (const [cycleDay, format, week, nextFormat] of cases) {
    const usable = engine.gacUsableWeek(cycleDay, format);
    assert.equal(usable.week, week);
    assert.equal(usable.format, nextFormat);
  }
});

test('validator flags malformed schedule tables', () => {
  const engine = loadTimeEngine({
    commonDays: { 3: 'oops', 4: [{ icon: 'tw_signup' }] },
    episodeOverrides: { 1: { 7: [{ icon: 'rote', label: 'Phase 1 Starts' }] , 8: 'nope' } },
    monthlyEvents: [{ icon: 'fleet_executor', label: 'Exec', dayOfMonth: 32 }],
  });
  const issues = engine.validateScheduleConfig();
  assert.ok(issues.some(issue => issue.includes('COMMON_DAYS[3]')));
  assert.ok(issues.some(issue => issue.includes('COMMON_DAYS[4][0]')));
  assert.ok(issues.some(issue => issue.includes('EPISODE_OVERRIDES[1][8]')));
  assert.ok(issues.some(issue => issue.includes('MONTHLY_EVENTS[0]')));
});

test('malformed schedule entries degrade instead of crashing', () => {
  const engine = loadTimeEngine({
    commonDays: { 5: ['oops', { icon: 'tw_offense', label: 'Offense Phase Starts' }, { icon: 'broken' }] },
    monthlyEvents: 'nope',
  });
  const dayStart = Date.parse('2026-08-04T00:00:00Z');
  assert.equal(engine.getDayEvents(1, 5).map(item => item.icon).join(','), 'tw_offense');
  assert.equal(engine.getMonthlyEvents(dayStart).length, 0);
  assert.doesNotThrow(() => engine.getEventsForDay(dayStart, 1, 5));
  assert.equal(
    engine.getGuildEventSummary(1, 5, dayStart, Date.parse('2026-08-04T19:00:00Z')),
    'TW Offense Phase Started'
  );
});

test('day hash links parse absolute era days', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.dayFromHash('#day-1'), 1);
  assert.equal(engine.dayFromHash('#day-84'), 84);
  assert.equal(engine.dayFromHash('#day-0'), null);
  assert.equal(engine.dayFromHash('#day-85'), null);
  assert.equal(engine.dayFromHash(''), null);
  assert.equal(engine.dayFromHash('#foo'), null);
  assert.equal(engine.dayFromHash('#day-abc'), null);
  assert.equal(engine.dayFromHash(null), null);
});

test('day hash bounds follow the configured era length', () => {
  const engine = loadTimeEngine({ eraLength: 56 });
  assert.equal(engine.dayFromHash('#day-56'), 56);
  assert.equal(engine.dayFromHash('#day-57'), null);
});

test('future cards count to their own start instant, not the changeover', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  // Find a future day whose rotation includes a GAC card (21:00 UTC start).
  const off = run(`(() => {
    const st = getGameStatus();
    for (let o = 1; o <= 13; o++) {
      const d = explorerDayAt(st, o);
      if (d.items.some(i => i.icon.startsWith('gac_'))) return o;
    }
    return null;
  })()`);
  assert.ok(off, 'expected a GAC rotation day ahead');
  run(`explorerOffset = ${off}; renderExplorer(getGameStatus())`);
  // Every pill counts forward on a future day — never past wording…
  const pills = [...els.dayDetail.innerHTML.matchAll(/xcard-rel[^"]*">([^<]+)</g)].map(m => m[1]);
  assert.ok(pills.length > 0, 'expected cards on the GAC day');
  for (const p of pills) assert.match(p, /^(Now|In )/);
  assert.ok(!pills.some(p => /Yesterday|ago/.test(p)), 'no past wording on a future day');
  // …and GAC pills never claim the 18:00 changeover moment.
  assert.ok(pills.some(p => /^In /.test(p)), 'expected countdown pills');
});

test('day pills show era-day numbers with a calendar caption', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const st = run('getGameStatus()');
  run(`explorerOffset = ${-(st.eraDay - 1)}; renderExplorer(getGameStatus())`);
  const nums = [...els.dayStrip.innerHTML.matchAll(/dp-num">(\d+)/g)].map(m => Number(m[1]));
  assert.deepEqual(nums, [1, 2, 3, 4, 5, 6, 7]);
  assert.match(els.dayStrip.innerHTML, /dp-date">28 Jul</);
  assert.match(els.dayStrip.innerHTML, /aria-label="Day 1, /);
});

test('timezone parts include the calendar month', () => {
  const engine = loadTimeEngine({ timeZone: 'UTC' });
  const parts = engine.tzDayParts(Date.parse('2026-08-04T18:00:00Z'));
  assert.equal(parts.dow, 'Tue');
  assert.equal(parts.num, '4');
  assert.equal(parts.month, 'Aug');
});

test('unknown TW icons hide the tracker but keep the label, and are reported', () => {
  const engine = loadTimeEngine({
    commonDays: { 18: [{ icon: 'tw_bogus', label: 'Bogus Phase Starts' }] },
  });
  const st = engine.getGameStatus(Date.parse('2026-08-14T20:00:00Z'));
  assert.equal(st.dayInEp, 18);
  assert.equal(engine.getGuildPhaseInfo(st), null);
  assert.equal(
    engine.getGuildEventSummary(st.episode, st.dayInEp, st.currentDayStartMs, st.nowMs),
    'TW Bogus Phase Started'
  );
  assert.ok(engine.validateScheduleConfig().some(issue => issue.includes('tw_bogus')));
});

test('fit-art detection follows the config allowlist', () => {
  const engine = loadTimeEngine();
  for (const icon of ['gac_attack', 'client_update', 'shipment_update', 'era_changeover', 'era_end']) {
    assert.equal(engine.isFitArt(icon), true, icon);
  }
  for (const icon of ['marquee_1', 'marquee_5', 'era_challenge_5', 'rote', 'conquest_start', 'fleet_executor', 'tw_offense', 'smugglersrun', null, '']) {
    assert.equal(engine.isFitArt(icon), false, String(icon));
  }
});

test('fit-art icons all exist in EVENT_ICONS', () => {
  const engine = loadTimeEngine();
  const known = new Set(Object.keys(engine.EVENT_ICONS));
  for (const icon of engine.FIT_ART_ICONS) {
    assert.ok(known.has(icon), icon);
  }
});

test('event durations read in whole hours, markers read null', () => {
  const engine = loadTimeEngine();
  const day = Date.parse('2026-08-04T00:00:00Z');
  assert.equal(engine.eventDurationHours({ icon: 'conquest_start' }, day, null), 336);
  assert.equal(engine.eventDurationHours({ icon: 'marquee_1' }, day, null), 168);
  assert.equal(engine.eventDurationHours({ icon: 'era_challenge_2' }, day, null), 168);
  assert.equal(engine.eventDurationHours({ icon: 'journey_guide' }, day, null), 336);
  assert.equal(engine.eventDurationHours({ icon: 'journey_rerun_1' }, day, null), 168);
  assert.equal(engine.eventDurationHours({ icon: 'tw_offense' }, day, null), 24);
  assert.equal(engine.eventDurationHours({ icon: 'smugglersrun' }, day, null), 24);
  assert.equal(engine.eventDurationHours({ icon: 'rote' }, day, null), 24);
  // Single-day families: TW phases, fleet masteries, era battles,
  // Proving Grounds and the Ultimate Journey all run 24 hours.
  for (const icon of ['tw_signup', 'tw_defense', 'tw_offense', 'fleet_executor', 'fleet_leviathan', 'fleet_profundity', 'era_battle_1', 'era_battle_2', 'proving_ground', 'ultimate_journey']) {
    assert.equal(engine.eventDurationHours({ icon }, day, null), 24, icon);
  }
  assert.equal(engine.eventDurationHours({ icon: 'rote' }, day, { def: { hoursPerPhase: 36 } }), 36);
  assert.equal(engine.eventDurationHours({ icon: 'rote', tbEndMoment: day }, day, { def: { hoursPerPhase: 36 } }), null);
  for (const icon of ['tw_payout', 'client_update', 'era_changeover', null, '']) {
    assert.equal(engine.eventDurationHours({ icon }, day, null), null, String(icon));
  }
});

test('durations read the way players say them: hours, then days and hours', () => {
  const engine = loadTimeEngine();
  assert.equal(engine.formatDurationHours(2), '2 hrs');
  assert.equal(engine.formatDurationHours(24), '24 hrs');
  assert.equal(engine.formatDurationHours(36), '1 day 12 hrs');
  assert.equal(engine.formatDurationHours(168), '7 days');
  assert.equal(engine.formatDurationHours(336), '14 days');
  assert.equal(engine.formatDurationHours(25), '1 day 1 hr');
  assert.equal(engine.formatDurationHours(null), 'N/A');
});

test('event starts render weekday, date, clock and zone', () => {
  const engine = loadTimeEngine({ timeZone: 'UTC' });
  // 2026-09-12 is a Saturday.
  assert.match(engine.fmtEventStart(Date.parse('2026-09-12T18:00:00Z')), /Sat.*12th Sep.*18:00 UTC/);
});

test('rotation windows cover marquee, era-challenge and journey spans', () => {
  const engine = loadTimeEngine({ episodeOverrides: {
    1: { 1: [{ icon: 'marquee_1', label: 'M' }], 8: [{ icon: 'era_challenge_1', label: 'E' }] },
    3: { 1: [{ icon: 'journey_guide', label: 'J' }], 15: [{ icon: 'journey_guide', label: 'J' }] },
  } });
  // VM-realm objects fail deepStrictEqual on prototype — compare JSON.
  const win = (ep, day) => JSON.stringify(engine.rotationWindowsForDay(ep, day));
  assert.equal(win(1, 3), JSON.stringify([{ icon: 'marquee_1', day: 3, total: 7 }]));
  assert.equal(win(1, 10), JSON.stringify([{ icon: 'era_challenge_1', day: 3, total: 7 }]));
  assert.equal(win(1, 20), '[]');
  assert.equal(win(3, 20), JSON.stringify([{ icon: 'journey_guide', day: 6, total: 14 }]));
  assert.equal(win(3, 29), '[]');
});

test('transparent-subject cards render contained over a blurred fill', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const fit = run(`explorerCardHTML({icon:"gac_attack",label:"GAC Round 1 Attack (Week 1)"}, Date.parse("2026-08-04T00:00:00Z"), "Now", null, 0)`);
  const square = run(`explorerCardHTML({icon:"client_update",label:"Client Update"}, Date.parse("2026-08-04T00:00:00Z"), "Now", null, 0)`);
  const tall = run(`explorerCardHTML({icon:"marquee_1",label:"Marquee"}, Date.parse("2026-08-04T00:00:00Z"), "Now", null, 0)`);
  const cover = run(`explorerCardHTML({icon:"tw_offense",label:"Offense Phase Starts"}, Date.parse("2026-08-04T00:00:00Z"), "Now", null, 0)`);
  assert.ok(fit.includes('xcard-art fit'));
  assert.ok(fit.includes('art-fill'));
  assert.ok(square.includes('xcard-art fit'));
  assert.ok(square.includes('art-fill'));
  for (const plain of [tall, cover]) {
    assert.ok(!plain.includes('xcard-art fit'));
    assert.ok(!plain.includes('art-fill'));
  }
});

test('off-cadence datacron drops show by announcement, skipped weeks stay quiet', () => {
  const engine = loadTimeEngine();
  engine.DATACRON_SETS = [
    { name: 'Duty and Defiance', color: 'orange', added: '2026-09-16', expires: '2026-12-17', hasFDC: false },
  ];
  engine.DATACRON_ANCHOR_DATE = '2026-09-16';
  engine.DATACRON_ANCHOR_COLOR = 'orange';
  engine.DATACRON_SKIP_DATES = ['2026-09-23'];
  engine.DATACRON_COLOR_ORDER = ['orange', 'pink', 'green', 'blue'];
  const sep16 = Date.parse('2026-09-16T00:00:00Z');
  const sep23 = Date.parse('2026-09-23T00:00:00Z');
  // Sep 16 sits twelve days out from conquest (a structural miss) but
  // the set is announced, so the drop card renders with its name…
  assert.equal(engine.isDatacronDropDay(sep16, 50), true);
  assert.equal(engine.datacronNameForDrop(sep16, 'orange'), 'Duty and Defiance');
  assert.ok(engine.getClientUpdateEvents(sep16, 2, 22).some(e => e.label === 'New Datacron Set Added (Duty and Defiance)'));
  // …while Sep 23 is structurally a drop Wednesday that never fired.
  assert.equal(engine.isDatacronDropDay(sep23, 57), false);
  assert.ok(!engine.getClientUpdateEvents(sep23, 3, 1).some(e => /Datacron Set Added/.test(e.label)));
  // The color rotation restarts from the new anchor.
  assert.equal(engine.datacronColorForDrop(sep16), 'orange');
  assert.equal(engine.datacronColorForDrop(Date.parse('2026-10-14T00:00:00Z')), 'pink');
});

test('datacron skip dates are validated', () => {
  const engine = loadTimeEngine({
    datacronSets: [{ name: 'Set', color: 'orange', added: '2026-09-16', expires: '2026-12-17' }],
  });
  engine.DATACRON_SKIP_DATES = ['2026-09-23'];
  assert.ok(!engine.validateScheduleConfig().some(issue => issue.includes('SKIP')));
  engine.DATACRON_SKIP_DATES = ['2026-02-31'];
  assert.ok(engine.validateScheduleConfig().some(issue => issue.includes('DATACRON_SKIP_DATES[0]')));
});

test('era ends with its own card wearing the era splash', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  // Last day of the era (Ep3 day 28) carries the end-of-era card…
  const target = run(`(() => {
    const st = getGameStatus();
    const dMs = st.currentEraStartMs + (84 - 1) * 86400000;
    return { o: 84 - st.eraDay, dMs };
  })()`);
  run(`explorerOffset = ${target.o}; renderExplorer(getGameStatus())`);
  assert.match(els.dayDetail.innerHTML, /Ends<\/h4>/);
  assert.match(els.dayDetail.innerHTML, /live\/era-icon\.png/);
  // …and the changeover shares the splash instead of the tiny icon.
  const changeover = run(`explorerCardHTML({ icon: 'era_changeover', label: 'Era Changeover' }, ${target.dMs}, 'Now', null, 0)`);
  assert.match(changeover, /live\/era-icon\.png/);
  assert.match(changeover, /xcard-art fit/);
  assert.match(changeover, /art-fill/);
  assert.ok(run('validateScheduleConfig()').length === 0);
});
