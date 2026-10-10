import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../assets/js/' + name + '.js', import.meta.url), 'utf8');
function browser(date = '2026-10-09T20:59:00Z', { withRender = false, fetchImpl } = {}) {
  let clock = Date.parse(date);
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  let renders = 0, clockUpdates = 0, loads = 0;
  const intervals = [], listeners = new Map();
  const doc = {
    cookie: '', hidden: false, activeElement: null,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (type, fn) => listeners.set(type, fn),
  };
  const ctx = vm.createContext({
    console: { warn() {}, log() {} }, Intl, Date: ClockDate, document: doc,
    navigator: {}, location: { hash: '', protocol: 'file:' },
    window: { addEventListener() {} },
    setTimeout() {}, setInterval: (fn, ms) => intervals.push({ fn, ms }),
    fetch: fetchImpl,
  });
  vm.runInContext(read('config'), ctx);
  vm.runInContext(read('time'), ctx);
  if(withRender) vm.runInContext(read('render'), ctx);
  else {
    ctx.explorerOffset = 0;
    ctx.explorerBoundsFor = () => ({ minOffset: -84, maxOffset: 84 });
    ctx.loadLiveEvents = () => { loads++; return Promise.resolve(false); };
  }
  ctx.renderAll = () => { renders++; };
  ctx.refreshClockDisplays = () => { clockUpdates++; };
  vm.runInContext(read('app'), ctx);
  return {
    ctx, doc, listeners,
    advance: date => { clock = typeof date === 'number' ? date : Date.parse(date); },
    tick: ms => intervals.filter(i => i.ms === ms).forEach(i => i.fn()),
    counts: () => ({ renders, clockUpdates, loads }),
  };
}

test('delayed ticks recover both GAC and standard-day transitions', () => {
  const b = browser();
  const initial = b.counts().renders;
  b.advance('2026-10-09T21:00:03Z');
  b.tick(1000);
  assert.equal(b.counts().renders, initial + 1);
  b.tick(60000);
  assert.equal(b.counts().renders, initial + 1, 'no duplicate boundary render');
  b.advance('2026-10-10T18:05:00Z');
  b.tick(1000);
  assert.equal(b.counts().renders, initial + 2);
});

test('guild boundary triggers rendering and quiet minutes update clocks in place', () => {
  const b = browser('2026-10-09T16:59:00Z');
  const initial = b.counts();
  b.advance('2026-10-09T17:00:03Z');
  b.tick(1000);
  assert.equal(b.counts().renders, initial.renders + 1);
  b.advance('2026-10-09T17:02:00Z');
  b.tick(1000);
  assert.equal(b.counts().renders, initial.renders + 1);
  assert.equal(b.counts().clockUpdates, initial.clockUpdates + 2);
});

test('live refresh coalesces requests, avoids unchanged renders and retains good data on errors', async () => {
  let calls = 0, fail = false, release;
  const snapshot = { pulledAt: Date.parse('2026-10-09T20:59:00Z'), gameDataVersion: 'v1', events: [] };
  const b = browser(undefined, { withRender: true, fetchImpl: () => {
    calls++;
    return new Promise(resolve => { release = () => resolve({ ok: !fail, status: 503, json: async () => ({ ...snapshot }) }); });
  } });
  const first = b.ctx.loadLiveEvents();
  assert.equal(calls, 1);
  assert.equal(b.ctx.loadLiveEvents(), first);
  release();
  await first;
  const afterFirst = b.counts().renders;
  b.advance('2026-10-09T21:13:00Z');
  await b.ctx.loadLiveEvents();
  assert.equal(calls, 1, 'refresh interval respected');
  b.advance('2026-10-09T21:14:00Z');
  const unchanged = b.ctx.loadLiveEvents(); release(); await unchanged;
  assert.equal(calls, 2);
  assert.equal(b.counts().renders, afterFirst, 'same events do not rebuild DOM');
  b.advance('2026-10-09T21:29:00Z'); fail = true;
  const failed = b.ctx.loadLiveEvents(); release(); await failed;
  assert.equal(vm.runInContext('liveEventsCache.gameDataVersion', b.ctx), 'v1');
  b.advance('2026-10-09T21:29:30Z');
  await b.ctx.loadLiveEvents(); assert.equal(calls, 3);
  b.advance('2026-10-09T21:30:00Z'); fail = false; snapshot.gameDataVersion = 'v2';
  const changed = b.ctx.loadLiveEvents(); release(); await changed;
  assert.equal(calls, 4);
  assert.equal(vm.runInContext('liveEventsCache.gameDataVersion', b.ctx), 'v2');
  assert.equal(b.counts().renders, afterFirst + 1);
});

test('visible minutes and returning to a tab request refreshed live data', () => {
  const b = browser();
  b.tick(60000);
  assert.equal(b.counts().loads, 2);
  b.doc.hidden = true; b.tick(60000);
  assert.equal(b.counts().loads, 2);
  b.doc.hidden = false; b.listeners.get('visibilitychange')();
  assert.equal(b.counts().loads, 3);
});

test('clock-only rendering updates countdown text without replacing DOM', () => {
  const ctx = vm.createContext({ console, Intl, Date });
  vm.runInContext(read('config'), ctx);
  vm.runInContext(read('time'), ctx);
  vm.runInContext(read('render'), ctx);
  const nodes = new Map();
  const container = {
    innerHTML: 'sentinel',
    querySelector: selector => {
      if(!nodes.has(selector)) nodes.set(selector, { textContent: '' });
      return nodes.get(selector);
    },
  };
  ctx.document = { getElementById: id => ['statusDashboard', 'unlockWindows'].includes(id) ? container : null };
  ctx.refreshClockDisplays(ctx.getGameStatus(Date.parse('2026-10-13T22:00:00Z')));
  assert.match(nodes.get('[data-clock="gac-sub"]').textContent, /in 23 hours/);
  ctx.refreshClockDisplays(ctx.getGameStatus(Date.parse('2026-10-13T23:00:00Z')));
  assert.match(nodes.get('[data-clock="gac-sub"]').textContent, /in 22 hours/);
  assert.equal(container.innerHTML, 'sentinel');
});
