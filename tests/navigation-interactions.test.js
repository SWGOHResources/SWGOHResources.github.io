import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const script = fs.readFileSync(new URL('assets/js/navigation.js', root), 'utf8');

function fixture(page = 'index') {
  const dom = new JSDOM(fs.readFileSync(new URL(page + '.html', root), 'utf8'), {
    url: 'https://example.test/', runScripts: 'outside-only',
  });
  const w = dom.window;
  let changed;
  const media = { matches: true, addEventListener: (_, fn) => { changed = fn; } };
  w.matchMedia = () => media;
  w.eval(script);
  const doc = w.document;
  return { dom, w, doc, toggle: doc.getElementById('navToggle'), panel: doc.getElementById('mobilePanel'), desktop: () => { media.matches = false; changed(); } };
}

test('mobile navigation opens once and Escape restores focus across page controllers', () => {
  for(const [page, controller] of [['index', null], ['conquest', 'site'], ['privacy', 'legal']]) {
    const f = fixture(page);
    try {
      if(controller) f.w.eval(fs.readFileSync(new URL('assets/js/' + controller + '.js', root), 'utf8'));
      assert.equal(f.panel.hidden, true);
      f.toggle.click();
      assert.equal(f.panel.hidden, false, page);
      assert.equal(f.toggle.getAttribute('aria-expanded'), 'true');
      const link = f.panel.querySelector('a');
      link.focus();
      link.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.equal(f.panel.hidden, true);
      assert.equal(f.toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(f.doc.activeElement, f.toggle);
    } finally { f.dom.window.close(); }
  }
});

test('outside clicks, selected links, focus leaving and desktop resizing dismiss the menu', () => {
  const f = fixture();
  try {
    const outside = f.doc.querySelector('main');
    f.toggle.click();
    outside.click();
    assert.equal(f.panel.hidden, true);
    f.toggle.click();
    const link = f.panel.querySelector('a');
    link.addEventListener('click', event => event.preventDefault());
    link.click();
    assert.equal(f.panel.hidden, true);
    f.toggle.click();
    link.focus();
    outside.setAttribute('tabindex', '-1');
    outside.focus();
    assert.equal(f.panel.hidden, true);
    f.toggle.click();
    link.focus();
    f.desktop();
    assert.equal(f.panel.hidden, true);
    assert.equal(f.toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(f.doc.activeElement, f.doc.querySelector('.topbar-tabs [aria-current="page"]'));
  } finally { f.dom.window.close(); }
});
