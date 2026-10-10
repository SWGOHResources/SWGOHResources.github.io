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
  assert.equal(await request('/assets/img/events/conquest.png'), 'era10');
  const prior = fetches;
  version = 'new';
  assert.equal(await request('/assets/img/events/conquest.png'), 'era10');
  assert.equal(fetches, prior, 'immutable local art remains cache-first');
});
