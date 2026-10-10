import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function engine(guildHour = 17) {
  const ctx = vm.createContext({ console, Intl, Date });
  const config = read('assets/js/config.js').replace('const TW_TB_HOUR_UTC = 17;', `const TW_TB_HOUR_UTC = ${guildHour};`);
  vm.runInContext(config, ctx);
  vm.runInContext(read('assets/js/time.js'), ctx);
  return ctx;
}

test('each GAC signup week shows the next defense date', () => {
  const ctx = engine();
  for (const [date, expected, week] of [
    ['2026-10-06T22:00:00Z', '7th Oct', 1],
    ['2026-10-13T22:00:00Z', '14th Oct', 2],
    ['2026-10-20T22:00:00Z', '21st Oct', 3],
  ]) {
    const status = ctx.getGacStatus(ctx.getGameStatus(Date.parse(date)));
    assert.equal(status.status, `Week ${week}`);
    assert.ok(status.sub.endsWith(expected), status.sub);
    assert.match(status.sub, /in 23 hours/);
  }
});

test('TW tracker crosses the guild boundary before the daily reset', () => {
  const ctx = engine();
  const phase = date => ctx.getGuildPhaseInfo(ctx.getGameStatus(Date.parse(date)));
  assert.equal(phase('2026-10-09T16:59:59Z').phaseIndex, 0);
  assert.equal(phase('2026-10-09T17:00:00Z').phaseIndex, 1);
  assert.equal(phase('2026-10-09T18:00:00Z').phaseIndex, 1);
});

test('TB starts and advances at its actual phase hour', () => {
  const ctx = engine();
  const phase = date => ctx.getGuildPhaseInfo(ctx.getGameStatus(Date.parse(date)));
  assert.equal(phase('2026-08-31T16:59:59Z').type, 'tw');
  assert.equal(phase('2026-08-31T17:00:00Z').type, 'tb');
  assert.equal(phase('2026-08-31T17:00:00Z').phaseIndex, 0);
  assert.equal(phase('2026-09-01T16:59:59Z').phaseIndex, 0);
  assert.equal(phase('2026-09-01T17:00:00Z').phaseIndex, 1);
});

test('guild phases later than the daily reset are not activated early', () => {
  const ctx = engine(19);
  assert.equal(ctx.getGuildPhaseInfo(ctx.getGameStatus(Date.parse('2026-10-09T18:01:00Z'))).phaseIndex, 0);
  assert.equal(ctx.getGuildPhaseInfo(ctx.getGameStatus(Date.parse('2026-10-09T19:00:00Z'))).phaseIndex, 1);
});

test('shipped Conquest planner stays active through the live final day', () => {
  const ctx = engine();
  vm.runInContext(read('assets/js/conquest.js'), ctx);
  const data = JSON.parse(read('assets/data/conquest-planner.json'));
  const live = JSON.parse(read('assets/data/live-events.json'));
  for (const entry of data.conquests) {
    const start = Date.parse(entry.starts + 'T18:00:00Z');
    const close = Date.parse(entry.ends + 'T18:00:00Z');
    assert.equal(close - start, 14 * 86400000, entry.id);
    const matching = live.events.find(e => e.kind === 'conquest' && e.startMs === start);
    if (matching) assert.equal(close, matching.endMs, 'planner and live closing instants agree');
    assert.equal(ctx.findConquestEntry({ conquests: [entry] }, close - 1).state, 'active');
    assert.equal(ctx.findConquestEntry({ conquests: [entry] }, close).state, 'past');
    assert.equal(ctx.getConquestStatus(ctx.getGameStatus(close - 1)).status, 'FINAL DAY');
  }
});
