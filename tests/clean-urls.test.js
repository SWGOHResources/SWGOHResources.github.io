import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { CLEAN_ROUTES } from '../scripts/cache-bust.mjs';

const root = new URL('../', import.meta.url);
const script = fs.readFileSync(new URL('assets/js/clean-urls.js', root), 'utf8');
const read = path => fs.readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');

test('plan edits and view changes retain the clean path and query with a root asset base', () => {
  const dom = new JSDOM('<head><base href="/"></head><body><div id="fixture"></div></body>', {
    url: 'https://example.test/conquest/?mode=hard', runScripts: 'outside-only',
  });
  try {
    const w = dom.window;
    w.scrollTo = () => {};
    w.eval(read('assets/js/conquest.js'));
    const entry = JSON.parse(read('assets/data/conquest-planner.json')).conquests[0];
    const app = w.document.getElementById('fixture');
    w.renderPlanner(app, { entry, state: 'active' }, Date.now(), { v: 'coverage', s: 330, f: [] });
    const check = () => {
      assert.equal(w.location.pathname, '/conquest/');
      assert.equal(w.location.search, '?mode=hard');
      return JSON.parse(w.atob(w.location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/')));
    };
    assert.equal(check().s, 330);
    const input = app.querySelector('[data-missed-input]');
    input.value = '12'; input.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(check().s, 318);
    app.querySelector('[data-map-feat="hot"]').dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    assert.deepEqual(check().f, ['hot']);
    app.querySelector('[data-view="planner"]').click();
    assert.equal(check().v, undefined);
  } finally { dom.window.close(); }
});

test('legacy URLs preserve query, exact plan hash, history state and back-navigation length', () => {
  for (const route of ['index', ...CLEAN_ROUTES]) {
    const clean = route === 'index' ? '/' : '/' + route + '/';
    for (const pathname of ['/' + route + '.html', clean + 'index.html']) {
      const dom = new JSDOM('', { url: 'https://example.test' + pathname + '?mode=hard#p=a_b-C+%2F', runScripts: 'outside-only' });
      try {
        const w = dom.window;
        w.history.replaceState({ retained: true }, '', w.location.href);
        const length = w.history.length;
        w.eval(script);
        assert.equal(w.location.href, 'https://example.test' + clean + '?mode=hard#p=a_b-C+%2F');
        assert.deepEqual(w.history.state, { retained: true });
        assert.equal(w.history.length, length);
      } finally { dom.window.close(); }
    }
  }
});

test('clean URLs and unknown paths stay untouched', () => {
  for (const pathname of ['/conquest/', '/missing.html', '/assets/example.html']) {
    const dom = new JSDOM('', { url: 'https://example.test' + pathname + '#keep', runScripts: 'outside-only' });
    try {
      const before = dom.window.location.href;
      dom.window.eval(script);
      assert.equal(dom.window.location.href, before);
    } finally { dom.window.close(); }
  }
});

test('published directory pages match their editable source and resolve assets and links from the site root', () => {
  for (const route of CLEAN_ROUTES) {
    const source = read(route + '.html');
    assert.equal(read(route + '/index.html'), source, 'Run npm run cache:bust to refresh ' + route);
    const dom = new JSDOM(source, { url: 'https://example.test/' + route + '/' });
    try {
      const doc = dom.window.document;
      assert.equal(doc.baseURI, 'https://example.test/');
      assert.equal(new URL('assets/data/conquest-planner.json', doc.baseURI).pathname, '/assets/data/conquest-planner.json');
      assert.equal(doc.querySelector('[rel="canonical"]').href, 'https://swgohresources.github.io/' + route + '/');
      for (const el of doc.querySelectorAll('[src], [href]')) {
        const url = new URL(el.src || el.href, doc.baseURI);
        if (url.origin !== 'https://example.test') continue;
        assert.ok(!url.pathname.startsWith('/' + route + '/assets/'), url.href);
        if (url.pathname.startsWith('/assets/')) assert.ok(fs.existsSync(new URL(url.pathname.slice(1), root)), url.href);
        if (el.tagName === 'A') assert.ok(!url.pathname.endsWith('.html'), url.href);
      }
      if (route === 'conquest') assert.equal(doc.querySelector('.skip-link').href, 'https://example.test/conquest/#main');
    } finally { dom.window.close(); }
  }
});
