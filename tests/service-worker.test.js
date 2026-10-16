import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('mutable era artwork revalidates online and remains available offline', async () => {
  const handlers = {}, entries = new Map();
  let version = 'era09', offline = false, fetches = 0;
  const response = value => ({ ok: true, value, clone: () => response(value) });
  const cache = {
    match: async req => entries.get(req.url || req),
    put: async (req, res) => entries.set(req.url || req, res),
  };
  const ctx = vm.createContext({
    URL,
    self: { location: { origin: 'https://swgohresources.github.io' }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { match: cache.match, open: async () => cache },
    fetch: async () => { fetches++; if(offline) throw Error('offline'); return response(version); },
  });
  vm.runInContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), ctx);
  const request = async path => {
    let pending;
    const writes = [];
    handlers.fetch({
      request: { method: 'GET', mode: 'cors', url: 'https://swgohresources.github.io' + path },
      respondWith: value => { pending = value; },
      waitUntil: value => writes.push(value),
    });
    const value = (await pending).value;
    await Promise.all(writes);
    return value;
  };
  assert.equal(await request('/assets/img/live/era-icon.png'), 'era09');
  version = 'era10';
  assert.equal(await request('/assets/img/live/era-icon.png'), 'era10');
  offline = true;
  assert.equal(await request('/assets/img/live/era-icon.png'), 'era10');
  offline = false;
  for (const module of ['app', 'conquest', 'era-chart', 'site']) {
    version = 'first';
    assert.equal(await request('/assets/js/' + module + '.js'), 'first');
    version = 'second';
    assert.equal(await request('/assets/js/' + module + '.js'), 'second', 'module imports must not stay pinned after a planner update');
    offline = true;
    assert.equal(await request('/assets/js/' + module + '.js'), 'second', 'visited planner modules remain available offline');
    offline = false;
  }
  version = 'era10';
  assert.equal(await request('/assets/img/events/conquest.png'), 'era10');
  const prior = fetches;
  version = 'new';
  assert.equal(await request('/assets/img/events/conquest.png'), 'era10');
  assert.equal(fetches, prior, 'immutable local art remains cache-first');
});

function worker() {
  const handlers = {}, entries = new Map();
  let status = 200, value = 'good', offline = false;
  const response = () => new Response(value, { status });
  const key = req => req.url || req;
  const cache = { match: async req => entries.get(key(req)), put: async (req, res) => entries.set(key(req), res) };
  const deleted = [];
  const ctx = vm.createContext({
    URL,
    self: { location: { origin: 'https://example.test' }, clients: { claim: async () => {} },
      addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { match: cache.match, open: async () => cache,
      keys: async () => ['another-app', 'swgoh-schedule-v9', 'swgoh-schedule-v10', 'swgoh-schedule-v11'],
      delete: async name => deleted.push(name) },
    fetch: async () => { if (offline) throw Error('offline'); return response(); },
  });
  vm.runInContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), ctx);
  return {
    handlers, deleted,
    network: (code, body, disconnected = false) => { status = code; value = body; offline = disconnected; },
    async request(path, mode = 'cors', headers = new Headers()) {
      let pending; const writes = [];
      handlers.fetch({ request: { url: 'https://example.test' + path, method: 'GET', mode, headers },
        respondWith: promise => { pending = promise; }, waitUntil: promise => writes.push(promise) });
      if (!pending) return null;
      const res = await pending; await Promise.all(writes);
      return { status: res.status, text: await res.clone().text() };
    },
  };
}

test('server errors preserve successful page, data and module caches without caching error pages', async () => {
  const w = worker();
  for (const [path, mode] of [['/conquest/', 'navigate'], ['/assets/data/live-events.json', 'cors'], ['/assets/js/era-chart.js', 'cors']]) {
    w.network(200, 'good');
    assert.equal((await w.request(path, mode)).text, 'good');
    w.network(503, 'unavailable');
    assert.equal((await w.request(path, mode)).text, 'good');
    w.network(404, 'not found');
    assert.equal((await w.request(path, mode)).status, 404);
    w.network(200, '', true);
    assert.equal((await w.request(path, mode)).text, 'good', 'failed requests must not replace the offline copy');
  }
});

test('cold errors stay errors and range downloads bypass Cache Storage', async () => {
  const w = worker();
  w.network(503, 'unavailable');
  assert.equal((await w.request('/unvisited/', 'navigate')).status, 503);
  assert.equal(await w.request('/assets/data/large-download.bin', 'cors', new Headers({ Range: 'bytes=0-99' })), null);
  w.network(200, '', true);
  await assert.rejects(w.request('/unvisited/', 'navigate'), /offline/);
});

test('activation removes only this application’s old caches', async () => {
  const w = worker(); let pending;
  w.handlers.activate({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(w.deleted, ['swgoh-schedule-v9', 'swgoh-schedule-v10']);
});
