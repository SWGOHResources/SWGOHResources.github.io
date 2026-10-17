import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
async function fixture(hash, now = '2026-10-16T20:00:00Z', events = []) {
  const dom = new JSDOM(html, { url: `https://example.test/${hash}`, runScripts: 'dangerously' });
  const w = dom.window, NativeDate = w.Date;
  w.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [NativeDate.parse(now)])); }
    static now() { return NativeDate.parse(now); }
  };
  w.setInterval = w.setTimeout = () => 1;
  w.fetch = async () => ({ ok: true, json: async () => ({ pulledAt: NativeDate.parse(now), gameDataVersion: 'test', events }) });
  w.localStorage.setItem('swgoh-tz', 'UTC');
  w.scrollTo = () => {};
  for (const script of ['asseturl', 'config', 'time', 'render', 'app']) {
    vm.runInContext(fs.readFileSync(new URL(`../assets/js/${script}.js`, import.meta.url), 'utf8'), dom.getInternalVMContext());
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  return { dom, w, doc: w.document };
}

test('next-day navigation crosses day 84 and dated links survive live refresh', async () => {
  const f = await fixture('preview/card-layout.html#day-84');
  try {
    assert.doesNotMatch(f.doc.querySelector('#dayDetail').textContent, /Legends Ends/);
    f.doc.querySelector('#dayNext').click();
    assert.equal(f.w.location.hash, '#date-2026-10-20');
    assert.equal(f.w.location.pathname, '/preview/card-layout.html');
    assert.ok(f.doc.querySelector('#dayDetail .xcard[aria-label="Era of Myths & Legends Ends"]'));
    assert.match(f.doc.querySelector('#dayDetail').textContent, /Adelphi Ranger/);
    f.doc.querySelector('#dayNext').click();
    assert.equal(f.w.location.hash, '#date-2026-10-21');
    assert.doesNotMatch(f.doc.querySelector('#dayDetail').textContent, /Darth Jar Jar|The Ronin/);
  } finally { f.dom.window.close(); }

  const dated = await fixture('#date-2026-11-03');
  try {
    assert.equal(dated.w.location.hash, '#date-2026-11-03');
    assert.match(dated.doc.querySelector('#dayDetail').textContent, /B1 Mercenary Droid/);
    const nextEra = [...dated.doc.querySelectorAll('.sf-pill')].find(el => el.textContent.includes('Mandalorian'));
    nextEra.click();
    const visible = [...dated.doc.querySelectorAll('.tl-ep')].filter(el => !el.hidden);
    assert.equal(visible.length, 1);
    assert.match(visible[0].textContent, /Adelphi Ranger/);
    assert.match(visible[0].textContent, /B1 Mercenary Droid/);
    dated.doc.querySelector('#scheduleTodayBtn').click();
    assert.ok([...dated.doc.querySelectorAll('.tl-ep')].every(el => !el.hidden));
  } finally { dated.dom.window.close(); }
});

test('episode cards follow configured era lengths without repeating into the next era', async () => {
  const f = await fixture('#day-29');
  try {
    assert.equal(f.doc.querySelectorAll('.xcard[aria-label="Episode 2 Started"]').length, 1);
    assert.match(f.doc.querySelector('#dayDetail').textContent, /Episode 2 Begins/);
    const entries = day => f.w.getEventsForDay(Date.parse(day+'T00:00:00Z'));
    assert.equal(entries('2026-09-22').filter(item=>item.icon==='episode_start').length, 1);
    assert.equal(entries('2026-10-20').filter(item=>item.icon==='episode_start').length, 0);
    assert.equal(entries('2026-11-17').filter(item=>item.icon==='episode_start').length, 0);
    assert.ok(entries('2026-10-20').some(item=>item.icon==='era_changeover'));
  } finally { f.dom.window.close(); }
});

test('main schedule details open the additive layout and restore keyboard focus', async () => {
  const live = JSON.parse(fs.readFileSync(new URL('../assets/data/live-events.json', import.meta.url), 'utf8'));
  const f = await fixture('#day-81', '2026-10-16T20:00:00Z', live.events);
  try {
    const button = f.doc.querySelector('button[data-bonus-wave]');
    assert.ok(button);
    assert.equal(button.textContent, 'DETAILS');
    button.focus();
    button.click();
    const modal = f.doc.querySelector('#bonusWaveModal');
    assert.equal(modal.getAttribute('aria-hidden'), 'false');
    assert.equal(modal.querySelector('.reward-header h3').textContent, 'EVENT DETAILS');
    assert.equal(modal.querySelectorAll('.bdrop-row').length, 2);
    assert.equal(modal.querySelectorAll('.bdrop-reward-icon').length, 2);
    assert.match(modal.textContent, /Mk 7 Kyrotech Salvage/);
    assert.equal(modal.querySelectorAll('button').length, 1);
    f.w.renderAll({ preserveFocus:true });
    assert.ok(f.doc.contains(button));
    f.doc.dispatchEvent(new f.w.KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    assert.equal(modal.getAttribute('aria-hidden'), 'true');
    assert.equal(f.doc.activeElement, button);
  } finally { f.dom.window.close(); }
});

test('other details buttons show the selected event timing and clear wave rewards', async () => {
  const f = await fixture('#day-79');
  try {
    const button = [...f.doc.querySelectorAll('.game-event-action')].find(item=>item.getAttribute('aria-label')==='Details for Client Update');
    assert.ok(button);
    button.click();
    const modal = f.doc.querySelector('#bonusWaveModal');
    assert.equal(modal.getAttribute('aria-hidden'), 'false');
    assert.equal(f.doc.querySelector('#bonusWaveTitle').textContent, 'Client Update');
    assert.match(f.doc.querySelector('#bonusWaveWindow').textContent, /14th Oct/);
    assert.equal(modal.querySelectorAll('.bdrop-row').length, 0);
    assert.match(modal.textContent, /Reward details unavailable/);
  } finally { f.dom.window.close(); }
});

test('card timing switches from countdown to expired status without replacing the card', async () => {
  const live = JSON.parse(fs.readFileSync(new URL('../assets/data/live-events.json', import.meta.url), 'utf8'));
  const f = await fixture('#day-82', '2026-10-16T20:00:00Z', live.events);
  try {
    const timer = [...f.doc.querySelectorAll('[data-clock-end]')].find(node => node.dataset.timingKind === 'time');
    assert.ok(timer);
    const card = timer.closest('.game-event-card');
    f.w.refreshClockDisplays(f.w.getGameStatus(Number(timer.dataset.clockEnd) + 1));
    assert.ok(f.doc.contains(card));
    assert.equal(timer.textContent, 'Expired');
    assert.equal(timer.dataset.timingKind, 'status');
    assert.ok(timer.classList.contains('is-expired'));
  } finally { f.dom.window.close(); }
});

test('ongoing cards retain their original schedule window and leave only Coliseum in the boss row', async () => {
  const live = JSON.parse(fs.readFileSync(new URL('../assets/data/live-events.json', import.meta.url), 'utf8'));
  const f = await fixture('#day-83', '2026-10-17T20:00:00Z', live.events);
  try {
    assert.equal(f.doc.querySelectorAll('.day-indicators > *').length, 1);
    assert.match(f.doc.querySelector('.day-indicators').textContent, /Coliseum boss/);
    const bonus = f.doc.querySelector('.game-event-card button[data-bonus-wave]');
    assert.ok(bonus);
    bonus.click();
    assert.equal(f.doc.querySelectorAll('#bonusWaveBody .bdrop-row').length, 2);
    assert.match(f.doc.querySelector('#bonusWaveWindow').textContent, /16th Oct/);
    assert.match(f.doc.querySelector('#dayDetail').textContent, /The Ronin|Terrible Tings/);
  } finally { f.dom.window.close(); }
});

test('rotation continuations preserve start dates, expire at their actual end, and respect live windows', async () => {
  const f = await fixture('#day-7');
  try {
    const date = '2026-08-03';
    const entries = f.w.rotationEventsForDay(Date.parse(date+'T00:00:00Z'));
    const marquee = entries.find(entry=>entry.item.icon==='marquee_1');
    assert.ok(marquee);
    assert.equal(marquee.dateMs, Date.parse('2026-07-28T00:00:00Z'));
    assert.equal(marquee.startMs, Date.parse('2026-07-28T18:00:00Z'));
    const continuations = entries.filter(entry=>entry.dateMs < Date.parse(date+'T00:00:00Z'));
    assert.ok(!continuations.some(entry=>entry.item.icon.startsWith('gac_') || entry.item.icon==='rote' || entry.item.icon.startsWith('fleet_')));
    assert.ok(!f.w.rotationEventsForDay(Date.parse('2026-08-05T00:00:00Z')).some(entry=>entry.item.icon==='marquee_1'));
  } finally { f.dom.window.close(); }
  const actual = await fixture('#day-7', '2026-08-03T20:00:00Z', [{
    id:'EVENT_MARQUEE_MARAJADE', name:'Mara Jade Skywalker Marquee', unit:'MARAJADESKYWALKER', kind:'marquee',
    startMs:Date.parse('2026-07-28T18:00:00Z'), endMs:Date.parse('2026-07-31T00:00:00Z')
  }]);
  try {
    assert.ok(!actual.w.rotationEventsForDay(Date.parse('2026-08-03T00:00:00Z')).some(entry=>entry.item.icon==='marquee_1'));
  } finally { actual.dom.window.close(); }
});

test('the active shorter era has one episode and preserves the independent Conquest cycle', async () => {
  const f = await fixture('#day-15', '2026-11-03T20:00:00Z');
  try {
    assert.match(f.doc.querySelector('#eraTitle').textContent, /Mandalorian and Grogu/);
    assert.equal(f.doc.querySelector('#mhOfVal').textContent, '/ 28');
    assert.equal(f.doc.querySelector('#mhEpVal').textContent, '1 of 1');
    assert.doesNotMatch(f.doc.querySelector('#eventJump').textContent, /Darth Jar Jar/);
    const status = f.w.getGameStatus(Date.parse('2026-11-23T20:00:00Z'));
    assert.match(f.w.getConquestStatus(status).title, /3/);
  } finally { f.dom.window.close(); }
});
