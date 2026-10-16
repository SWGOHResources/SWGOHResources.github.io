import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
function fixture(t, page = 'index.html') {
  const dom = new JSDOM(read(page), { url: 'https://example.test/' + page, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, doc = w.document;
  const timers = new Map(); let nextTimer = 0;
  w.setTimeout = fn => { timers.set(++nextTimer, fn); return nextTimer; };
  w.clearTimeout = id => timers.delete(id);
  w.setInterval = () => 0;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.fetch = async () => ({ ok: true, json: async () => ({ pulledAt: Date.now(), events: [] }) });
  w.eval(read('assets/js/site.js'));
  if (page === 'index.html') {
    w.eval(['config', 'time', 'render', 'app'].map(name => read(`assets/js/${name}.js`)).join('\n'));
  }
  return { w, doc, timers, get: id => doc.getElementById(id), key: (key, shiftKey = false) => {
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  } };
}

test('every page uses the shared chrome once, ahead of the homepage wiring', () => {
  for (const page of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const dom = new JSDOM(read(page));
    try {
      const scripts = [...dom.window.document.scripts].map(s => s.getAttribute('src')?.split('?')[0]);
      assert.equal(scripts.filter(src => src?.endsWith('/site.js')).length, 1, page);
      assert.equal(scripts.some(src => src?.endsWith('/legal.js')), false, page);
      if (page === 'index.html') assert.ok(scripts.findIndex(s => s?.endsWith('/site.js')) < scripts.findIndex(s => s?.endsWith('/app.js')));
    } finally { dom.window.close(); }
  }
});

test('mobile menus close on Escape, outside clicks, navigation and focus leaving', t => {
  for (const page of ['index.html', 'conquest.html', 'privacy.html']) {
    const h = fixture(t, page), toggle = h.get('navToggle'), panel = h.get('mobilePanel');
    toggle.focus(); toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true', page);
    panel.querySelector('a').focus(); h.key('Escape');
    assert.equal(panel.classList.contains('open'), false, page);
    assert.equal(h.doc.activeElement, toggle, page);
    toggle.click(); h.doc.body.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false', page);
    toggle.click();
    panel.querySelector('a').addEventListener('click', e => e.preventDefault());
    panel.querySelector('a').click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false', page);
    toggle.click(); h.doc.querySelector('main').tabIndex = -1; h.doc.querySelector('main').focus();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false', page);
  }
});

test('report dialogs trap focus and restore a visible control after mobile launch', t => {
  for (const page of ['index.html', 'privacy.html', 'cookie-policy.html', 'terms.html']) {
    const h = fixture(t, page), modal = h.get('aboutModal'), toggle = h.get('navToggle');
    toggle.click(); h.get('openAboutBtnMobile').focus(); h.get('openAboutBtnMobile').click();
    assert.equal(modal.getAttribute('aria-hidden'), 'false', page);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false', page);
    assert.equal(h.doc.activeElement, h.get('closeAboutBtn'), page);
    h.key('Tab', true);
    assert.equal(h.doc.activeElement, h.get('closeAboutBtn2'), page);
    h.key('Tab');
    assert.equal(h.doc.activeElement, h.get('closeAboutBtn'), page);
    h.key('Escape');
    assert.equal(modal.getAttribute('aria-hidden'), 'true', page);
    assert.equal(h.doc.activeElement, toggle, page);
    assert.equal(h.doc.body.classList.contains('modal-open'), false, page);
  }
});

test('schedule, report and wave dialogs never stack and restore their own openers', t => {
  const h = fixture(t);
  const schedule = h.get('openFullScheduleBtn'), report = h.get('openAboutBtnHeader');
  schedule.focus(); schedule.click();
  assert.equal(h.get('fullScheduleModal').getAttribute('aria-hidden'), 'false');
  report.focus(); report.click();
  assert.equal(h.get('fullScheduleModal').getAttribute('aria-hidden'), 'true');
  assert.equal(h.doc.querySelectorAll('.modal-backdrop.open').length, 1);
  h.key('Escape'); assert.equal(h.doc.activeElement, report);
  h.w.openModal(h.get('bonusWaveModal'));
  h.get('closeBonusWaveBtn').click();
  assert.equal(h.doc.querySelectorAll('.modal-backdrop.open').length, 0);
});

test('repeated copy clicks restore the original handle and live-region state', async t => {
  const h = fixture(t, 'conquest.html'), button = h.doc.querySelector('.discord-copy-btn');
  const original = button.innerHTML, copied = [];
  h.w.navigator.clipboard = { writeText: async text => copied.push(text) };
  h.w.copyDiscordHandle(button); await Promise.resolve();
  h.w.copyDiscordHandle(button); await Promise.resolve();
  assert.match(button.textContent, /Copied/);
  assert.deepEqual(copied, ['granddom', 'granddom']);
  assert.equal(h.timers.size, 1);
  [...h.timers.values()][0]();
  assert.equal(button.innerHTML, original);
  assert.equal(button.hasAttribute('aria-live'), false);
});

test('cookie dismissal and decorative stars initialize once on all page types', t => {
  for (const page of ['index.html', 'conquest.html', 'privacy.html']) {
    const h = fixture(t, page);
    assert.equal(h.get('cookieNotice').hidden, false, page);
    h.get('dismissCookieNotice').click();
    assert.equal(h.get('cookieNotice').hidden, true, page);
    assert.match(h.doc.cookie, /swgoh_cookie_notice=dismissed/);
    const stars = h.get('starfield');
    if (stars) assert.equal(stars.children.length, 46, page);
  }
});
