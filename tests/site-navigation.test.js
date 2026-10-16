import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { CLEAN_ROUTES } from '../scripts/cache-bust.mjs';

const root = new URL('../', import.meta.url);
const expected = [['/', 'Home'], ['/conquest/', 'Conquest'], ['/era-chart/', 'Era Chart']];
const legal = [['/privacy/', 'Privacy'], ['/cookie-policy/', 'Cookies'], ['/terms/', 'Terms']];
const links = (doc, selector) => [...doc.querySelectorAll(selector)].map(a => [a.getAttribute('href'), a.textContent.trim()]);

test('every published page has consistent navigation and no links to retired pages', () => {
  const pages = ['index.html', '404.html', ...CLEAN_ROUTES.flatMap(route => [route + '.html', route + '/index.html'])];
  for (const page of pages) {
    const dom = new JSDOM(fs.readFileSync(new URL(page, root), 'utf8'));
    try {
      const doc = dom.window.document;
      assert.deepEqual(links(doc, '.topbar-tabs a'), expected, page + ' primary');
      assert.deepEqual(links(doc, '#mobilePanel .mp-link'), expected, page + ' mobile');
      assert.deepEqual(links(doc, '.footer-links a'), expected, page + ' footer');
      assert.deepEqual(links(doc, 'footer .legal-links a'), legal, page + ' legal');
      assert.equal(doc.querySelector('.mp-divider .mp-link'), null, page + ' divider must not contain links');
      assert.equal(doc.querySelector('a[href^="/squads"], a[href^="/materials"], a[href^="/game-timeline"]'), null, page + ' retired pages');
      for (const [href] of [...expected, ...legal]) {
        assert.ok(fs.existsSync(new URL(href === '/' ? 'index.html' : href.slice(1) + 'index.html', root)), href);
      }
    } finally { dom.window.close(); }
  }
});

test('retired pages are absent from sources, published routes and sitemap', () => {
  const sitemap = fs.readFileSync(new URL('sitemap.xml', root), 'utf8');
  for (const route of ['squads', 'materials', 'game-timeline']) {
    assert.equal(fs.existsSync(new URL(route + '.html', root)), false, route);
    assert.equal(fs.existsSync(new URL(route + '/', root)), false, route);
    assert.equal(CLEAN_ROUTES.includes(route), false, route);
    assert.ok(!sitemap.includes('/' + route + '/'), route);
  }
});
