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
    assert.equal(f.doc.querySelector('#dayDetail .xcard[aria-label="Era of Myths & Legends Ends"]'), null);
    assert.ok(f.doc.querySelector('#dayDetail .xcard[aria-label="Era of The Mandalorian and Grogu Starts"]'));
    assert.match(f.doc.querySelector('#dayDetail').textContent, /Green Ranger/);
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

test('only additive-drop cards offer details, including when other events carry unit data', async () => {
  const live = JSON.parse(fs.readFileSync(new URL('../assets/data/live-events.json', import.meta.url), 'utf8'));
  const nonDrop = { ...live.events.find(e=>Array.isArray(e.units)), id:'SPECIAL_REWARD_EVENT', name:'Special Reward Event' };
  const f = await fixture('#day-82', '2026-10-17T20:00:00Z', [...live.events, nonDrop]);
  try {
    const buttons = f.doc.querySelectorAll('#dayDetail .game-event-action');
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].getAttribute('aria-label'), 'Details for Additive Drops: Wave 1');
    assert.ok(!f.doc.querySelector('.game-event-card[aria-label="Special Reward Event"] button'));
    assert.ok(!f.doc.querySelector('.game-event-card[aria-label="Terrible Things"] button'));
    f.w.jumpExplorer(79 - f.w.getGameStatus().eraDay);
    assert.ok(f.doc.querySelector('.game-event-card[aria-label="Client Update"]'));
    assert.equal(f.doc.querySelectorAll('#dayDetail .game-event-action').length, 0);
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

test('card clocks switch from start countdown to end countdown in place', async () => {
  const startMs = Date.parse('2026-10-20T18:00:00Z');
  const endMs = Date.parse('2026-10-27T18:00:00Z');
  const f = await fixture('#date-2026-10-20', '2026-10-20T17:59:00Z', [{
    id:'EVENT_MARQUEE_ADELPHIRANGER', name:'Adelphi Ranger Marquee', unit:'ADELPHIRANGER', kind:'marquee', startMs, endMs
  }]);
  try {
    const timer = f.doc.querySelector(`[data-clock-start="${startMs}"][data-clock-end="${endMs}"]`);
    assert.ok(timer);
    assert.equal(timer.textContent, 'In 1m');
    const card = timer.closest('.game-event-card');
    f.w.refreshClockDisplays(f.w.getGameStatus(startMs));
    assert.match(timer.textContent, /^Ends in /);
    assert.equal(timer.dataset.timingKind, 'time');
    f.w.refreshClockDisplays(f.w.getGameStatus(endMs - 3600000));
    assert.equal(timer.textContent, 'Ends in 1h');
    assert.ok(f.doc.contains(card));
    f.w.refreshClockDisplays(f.w.getGameStatus(endMs));
    assert.equal(timer.textContent, 'Expired');
    assert.equal(timer.dataset.timingKind, 'status');
  } finally { f.dom.window.close(); }
});

test('marquees appear on their last daily run but not on the challenge handover date', async () => {
  const f = await fixture('#day-77', '2026-10-12T20:00:00Z', [{
    id:'EVENT_MARQUEE_THERONIN', name:'The Ronin Marquee', unit:'THERONIN', kind:'marquee',
    startMs:Date.parse('2026-10-06T18:00:00Z'), endMs:Date.parse('2026-10-13T18:00:00Z')
  }]);
  try {
    assert.ok(f.doc.querySelector(".game-event-card[aria-label=\"The Wanderer's Blade\"]"));
    f.doc.querySelector('#dayNext').click();
    assert.ok(!f.doc.querySelector(".game-event-card[aria-label=\"The Wanderer's Blade\"]"));
    assert.match(f.doc.querySelector('#dayDetail').textContent, /Era Challenge/);
  } finally { f.dom.window.close(); }
  const rotation = await fixture('#day-77', '2026-10-12T20:00:00Z');
  try {
    assert.ok(rotation.w.rotationEventsForDay(Date.parse('2026-10-12T00:00:00Z')).some(entry=>entry.item.icon==='marquee_6'));
    assert.ok(!rotation.w.rotationEventsForDay(Date.parse('2026-10-13T00:00:00Z')).some(entry=>entry.item.icon==='marquee_6'));
  } finally { rotation.dom.window.close(); }
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
    assert.equal(f.w.searchSchedule('Darth Jar Jar', 'future', f.w.getGameStatus()).length, 0);
    const status = f.w.getGameStatus(Date.parse('2026-11-23T20:00:00Z'));
    assert.match(f.w.getConquestStatus(status).title, /3/);
  } finally { f.dom.window.close(); }
});

test('schedule navigation works without search controls', async () => {
  const f = await fixture('#day-83', '2026-10-17T20:00:00Z');
  try {
    assert.equal(f.doc.querySelector('#scheduleSearch'), null);
    assert.equal(f.doc.querySelector('[data-search-scope]'), null);
    assert.ok(f.doc.querySelector('.day-detail-title #dayToday'));
    assert.equal(f.doc.querySelectorAll('#dayToday').length, 1);
    f.doc.querySelector('#dayNext').click();
    assert.equal(f.w.location.hash, '#day-84');
    f.doc.querySelector('#dayToday').click();
    assert.equal(f.w.location.hash, `#day-${f.w.getGameStatus().eraDay}`);
    assert.equal(f.doc.querySelector('#dayToday').disabled, true);
  } finally { f.dom.window.close(); }
});

test('event names and types agree across cards and search while raw names remain searchable', async () => {
  const events = [
    { id:'legendary-names', name:'Terrible Tings Legendary Event', kind:'event', unit:'DARTHJARJAR', startMs:Date.parse('2026-09-22T18:00:00Z'), endMs:Date.parse('2026-10-20T18:00:00Z') },
    { id:'assault-names', name:'Military Might Assault Battles', kind:'assault', startMs:Date.parse('2026-10-17T07:00:00Z'), endMs:Date.parse('2026-10-18T07:00:00Z') },
  ];
  const f = await fixture('#day-82', '2026-10-17T20:00:00Z', events);
  try {
    const legendary = f.doc.querySelector('.game-event-card[aria-label="Terrible Things"]');
    assert.ok(legendary);
    assert.equal(legendary.querySelector('h4').textContent, 'Terrible Things');
    assert.equal(legendary.querySelector('.xcard-kicker').textContent, 'Era Legendary Event');
    assert.doesNotMatch(legendary.textContent, /Terrible Tings Legendary Event/);
    assert.equal(legendary.querySelector('button'), null);
    for(const query of ['Terrible Things', 'Terrible Tings', 'Darth Jar Jar']){
      const result = f.w.searchSchedule(query, 'all', f.w.getGameStatus())[0];
      assert.ok(result, query);
      assert.equal(result.label, 'Terrible Things');
      assert.match(result.type, /Era Legendary Event/);
    }
    const assault = f.doc.querySelector('.game-event-card[aria-label="Military Might"]');
    assert.ok(assault);
    assert.equal(assault.querySelector('.xcard-kicker').textContent, 'Assault Battle');
    assert.equal(assault.querySelector('button'), null);
  } finally { f.dom.window.close(); }
});


test('shipment Wednesdays retain the client update without a separate shipment card', async () => {
  const f = await fixture('#date-2026-10-28');
  try {
    assert.ok(f.doc.querySelector('.game-event-card[aria-label="Client Update"]'));
    assert.doesNotMatch(f.doc.querySelector('#dayDetail').textContent, /Shipment Update|Previous Era Shards/);
    assert.doesNotMatch(f.doc.querySelector('#fullSchedule').textContent, /Previous Era Shards Added to Shipments/);
    assert.equal(f.w.searchSchedule('shipments', 'all', f.w.getGameStatus()).length, 0);
  } finally { f.dom.window.close(); }
});


test('Conquest cards use volume titles and run descriptions across rollover and live overrides', async () => {
  const f = await fixture('#date-2026-10-27');
  try {
    const conquest = () => [...f.doc.querySelectorAll('.game-event-card')].find(e=>e.querySelector('.xcard-kicker').textContent === 'Conquest');
    assert.equal(conquest().querySelector('h4').textContent, 'Volume 25');
    assert.equal(conquest().querySelector('.game-event-footer p').textContent, '2nd Run of Volume Begins');
    const next = f.w.conquestVolumeInfo(Date.parse('2026-12-21T18:00:00Z'));
    assert.equal(next.volume, 26);
    assert.equal(next.run, 1);
    const matches = f.w.searchSchedule('Volume 25 Conquest', 'all', f.w.getGameStatus());
    assert.ok(matches.some(result=>result.label === 'Volume 25' && result.type === 'Conquest'));
  } finally { f.dom.window.close(); }
  const live = await fixture('#date-2026-10-27', '2026-10-17T20:00:00Z', [{
    id:'CONQUEST_VOL26', name:'Conquest', kind:'conquest',
    startMs:Date.parse('2026-10-26T18:00:00Z'), endMs:Date.parse('2026-11-09T18:00:00Z')
  }]);
  try {
    const cards = [...live.doc.querySelectorAll('.game-event-card')].filter(e=>e.querySelector('.xcard-kicker').textContent === 'Conquest');
    assert.equal(cards.length, 1);
    assert.equal(cards[0].querySelector('h4').textContent, 'Volume 26');
    assert.equal(cards[0].querySelector('.game-event-footer p').textContent, '2nd Run of Volume Begins');
  } finally { live.dom.window.close(); }
});

test('TB end and TW payout markers stay in the timing engine but leave schedule views', async () => {
  const f = await fixture('#day-75');
  try {
    const dates = Array.from({length:28}, (_, i)=>Date.parse('2026-10-01T00:00:00Z')+i*86400000);
    const payoutDate = dates.find(date=>f.w.getEventsForDay(date).some(e=>e.icon === 'tw_payout'));
    assert.ok(Number.isFinite(payoutDate));
    f.w.jumpExplorer((payoutDate-f.w.getGameStatus().currentDayStartMs)/86400000);
    assert.ok(!f.doc.querySelector('.game-event-card[aria-label*="Payout"]'));
    assert.doesNotMatch(f.doc.querySelector('#fullSchedule').textContent, /Territory War Payout|TW Payout|Territory Battle End/);
    assert.equal(f.w.searchSchedule('TW Payout', 'all', f.w.getGameStatus()).length, 0);
    f.w.jumpExplorer(83 - f.w.getGameStatus().eraDay);
    assert.ok(!f.doc.querySelector('.game-event-card[aria-label*="Ends"]'));
    assert.ok(!f.doc.querySelector('.game-event-card[aria-label*="Ended"]'));
    assert.equal(f.doc.querySelector('#statusDashboard'), null);
    assert.equal(f.doc.querySelectorAll('#unlockWindows > div').length, 2);
    assert.ok(f.w.getGuildPhaseInfo(f.w.getGameStatus()));
  } finally { f.dom.window.close(); }
});


test('day cards pin additive drops, then sort new starts ahead of continuing events by importance across sources', async () => {
  const start = Date.parse('2026-10-26T00:00:00Z'), day = 86400000;
  const events = [
    { id:'legendary', name:'Terrible Tings Legendary Event', kind:'event', unit:'DARTHJARJAR', startMs:start-6*day, endMs:start+10*day },
    { id:'omega', name:'Endor Omega Battles', kind:'omega', startMs:start+7*3600000, endMs:start+day+7*3600000 },
    { id:'marquee', name:'Action Jaxxon', kind:'marquee', unit:'JAXXON', startMs:start-6*day, endMs:start+3*day },
    { id:'EVENT_BONUS_PRIORITY_TEST', name:'Additive Drops', kind:'special', startMs:start-2*day, endMs:start+3*day },
    { id:'assault', name:'Military Might Assault Battles', kind:'assault', startMs:start+8*3600000, endMs:start+day+8*3600000 },
    { id:'EVENT_MARQUEE_ADELPHIRANGER', name:'Green Ranger', kind:'marquee', unit:'ADELPHIRANGER', startMs:start+18*3600000, endMs:start+7*day },
    { id:'fleet_LEVIATHAN', name:'Dark Sovereign', kind:'fleet', startMs:start+10*3600000, endMs:start+day+10*3600000 },
    { id:'bounties', name:'Galactic Bounties I', kind:'event', startMs:start+11*3600000, endMs:start+day+11*3600000 },
  ];
  const f = await fixture('#date-2026-10-26', '2026-10-17T20:00:00Z', events);
  try {
    const cards = () => [...f.doc.querySelectorAll('#dayDetail .game-event-card')];
    const names = () => cards().map(e=>e.getAttribute('aria-label'));
    const before = (a,b) => {
      const order = names();
      assert.ok(order.includes(a), a);
      assert.ok(order.includes(b), b);
      assert.ok(order.indexOf(a)<order.indexOf(b), `${a} before ${b}: ${order.join(', ')}`);
    };
    assert.equal(names()[0], 'Additive Drops');
    before('Green Ranger', 'Volume 25');
    before('Volume 25', 'Rise of the Empire Phase 1 Starts');
    before('Rise of the Empire Phase 1 Starts', 'Galactic Bounties I');
    before('Galactic Bounties I', 'Military Might');
    before('Military Might', 'Dark Sovereign');
    before('Dark Sovereign', "Smuggler's Run I");
    before("Smuggler's Run I", 'Endor');
    before('Endor', 'Action Jaxxon');
    before('Action Jaxxon', 'Terrible Things');
    const groups = cards().slice(1).map(e=>Number(e.querySelector('[data-clock-start]').dataset.clockStart)>=start ? 0 : 1);
    assert.deepEqual(groups, [...groups].sort());
    f.doc.querySelector('#dayNext').click();
    assert.equal(names()[0], 'Additive Drops');
    before('Rise of the Empire Phase 2 Starts', 'Green Ranger');
    before('Green Ranger', 'Terrible Things');
    assert.equal(names().filter(name=>name === 'Green Ranger').length, 1);
  } finally { f.dom.window.close(); }
});


test('GAC eligibility stays integrated without roster-lock dates', async () => {
  const f = await fixture('#day-83', '2026-10-18T12:00:00Z');
  try {
    const hero = f.doc.querySelector('#mergedHero');
    const deadlines = f.doc.querySelector('#unlockWindows');
    assert.ok(hero.contains(f.doc.querySelector('#eraEligibility')));
    assert.match(f.doc.querySelector('#eraEligibility').textContent, /Era units first GAC.*Week 3 \(5v5\)/s);
    assert.doesNotMatch(hero.textContent, /Roster locks/);
    assert.equal(f.doc.querySelector('[data-clock="era-end"]'), null);
    assert.equal(f.doc.querySelector('section[aria-label="Important dates"]'), null);
    assert.ok(deadlines.closest('.explorer'));
    assert.equal(f.doc.querySelector('.explorer-note'), null);
    assert.equal(deadlines.children.length, 2);
    assert.equal(deadlines.children[0].querySelector('h2').textContent, 'Conquest Unit Unlock');
    assert.equal(deadlines.children[1].querySelector('h2').textContent, 'Supremacy Directive + FDC');
    assert.doesNotMatch(deadlines.textContent, /3rd of volume|Datacron expiration/);
    assert.match(deadlines.children[0].textContent, /First GAC.*Week 2 \(5v5\)/s);
    assert.match(deadlines.children[1].textContent, /Last GAC.*Week 3 \(5v5\).*Last TW.*War 2/s);
    assert.match(deadlines.children[1].textContent, /Supremacy Directive/);
    assert.match(deadlines.querySelector('.usage-tw dd').textContent, /^War 2Signup 22 Oct$/);
    assert.equal(deadlines.children[1].querySelector('.usage-gac .usage-dates').textContent, '20–26 Oct');
    assert.equal(deadlines.children[0].querySelector('.usage-gac .usage-dates').textContent, '8–14 Dec');
    assert.equal(deadlines.querySelectorAll('.usage-gac').length, 2);
    assert.doesNotMatch(deadlines.textContent, /Payout/);
    const clock = deadlines.querySelector('[data-clock="cron-expiry"]');
    assert.match(clock.textContent, /In .*days/);
    f.w.refreshClockDisplays(f.w.getGameStatus());
    assert.equal(deadlines.querySelector('[data-clock="cron-expiry"]'), clock);
    f.w.localStorage.setItem('swgoh-tz', 'Europe/London');
    f.w.renderAll();
    assert.doesNotMatch(f.doc.querySelector('#eraEligibility').textContent, /Roster locks|21st Oct/);
    assert.doesNotMatch(deadlines.textContent, /Roster locks|9th Dec/);
    assert.match(deadlines.querySelector('.deadline-heading').textContent, /Unlocks 7 Dec/);
    assert.match(deadlines.children[1].textContent, /29 Oct, 18:00 GMT/);
  } finally { f.dom.window.close(); }

  const unknown = await fixture('', '2026-11-20T12:00:00Z');
  try {
    assert.match(unknown.doc.querySelector('#eraEligibility').textContent, /TBA/);
    assert.doesNotMatch(unknown.doc.querySelector('#eraEligibility').textContent, /NaN|Invalid Date/);
  } finally { unknown.dom.window.close(); }
});
