import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import {
  artSlug,
  cleanName,
  eventKind,
  prettifyCodeName,
  pullEventArt,
  resolveName,
  selectLiveEvents,
  simplifyName,
  titleCase,
  unitFromTexture,
} from '../scripts/pull-live-events.mjs';

const NOW = Date.parse('2026-09-13T23:00:00Z');
const H = 3600000;

test('cleanName strips in-game rich-text tags and escapes', () => {
  assert.equal(cleanName('BLADE AND BASTION\\n[c][FFC891]Special Marquee Event[-][/c]'), 'BLADE AND BASTION Special Marquee Event');
  assert.equal(cleanName('SMUGGLER\'S RUN\n[c][FFC891]Resource Event[-]'), "SMUGGLER'S RUN Resource Event");
  assert.equal(cleanName(null), '');
});

test('eventKind categorises known id families', () => {
  assert.equal(eventKind('EVENT_MARQUEE_STORMTROOPERCONCEPT'), 'marquee');
  assert.equal(eventKind('EC22_ImperialTrooperRogueOneScarif_1785717445'), 'era-challenge');
  assert.equal(eventKind('EVENT_FLEET_MASTERY_EXECUTOR'), 'fleet');
  assert.equal(eventKind('EVENT_ASSAULT_EMPIRE'), 'assault');
  assert.equal(eventKind('EVENT_RESOURCE_SMUGGLERS_RUN'), 'smugglers-run');
  assert.equal(eventKind('CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_83'), 'gac');
  assert.equal(eventKind('CONQUEST_VOL24'), 'conquest');
  assert.equal(eventKind('challenge_XP'), 'daily-challenge');
  assert.equal(eventKind('SOMETHING_ELSE'), 'event');
});

test('resolveName maps code names to display names', () => {
  const names = new Map([['EVENT_X_NAME', 'Real Name [c]Suffix[/c]']]);
  assert.equal(resolveName('EVENT_X_NAME', names, 'id1'), 'Real Name Suffix');
  assert.equal(resolveName('SEASON_83_EVENT_NAME', new Map(), 'GA2_SEASON_83A'), 'GAC Season 83');
  assert.equal(resolveName('TERRITORY_TOURNAMENT_EVENT_NAME', new Map(), 'CHAMP_X'), 'Grand Arena Championship');
  assert.equal(resolveName('SOME_NEW_THING', new Map(), 'id2'), 'Some New Thing');
  assert.equal(resolveName('FOO_GAC_BAR', new Map(), 'id3'), 'Foo GAC Bar');
  assert.equal(eventKind('GA2_SEASON_83A'), 'gac');
});

test('titleCase capitalises first letters, keeps acronyms', () => {
  assert.equal(titleCase('BLADE AND BASTION'), 'Blade and Bastion');
  assert.equal(titleCase("SMUGGLER'S RUN"), "Smuggler's Run");
  assert.equal(titleCase('GAC SEASON 83'), 'GAC Season 83');
  assert.equal(titleCase('CONQUEST'), 'Conquest');
  assert.equal(titleCase('STORMTROOPER (CONCEPT)'), 'Stormtrooper (Concept)');
});

test('simplifyName trims filler the type pill already shows', () => {
  assert.equal(simplifyName('Contraband Cargo Resource Event'), 'Contraband Cargo');
  assert.equal(simplifyName("Smuggler's Run Resource Event"), "Smuggler's Run");
  assert.equal(simplifyName('Blade and Bastion Special Marquee Event'), 'Blade and Bastion');
  assert.equal(simplifyName('Discarded Doctrine Journey Guide Fleet Mastery'), 'Discarded Doctrine');
  assert.equal(simplifyName('Defense of Dathomir Special Event'), 'Defense of Dathomir');
  assert.equal(simplifyName('Forest Moon Assault Battles'), 'Forest Moon Assault Battles');
  assert.equal(resolveName('SR_KEY', new Map([['SR_KEY', "SMUGGLER'S RUN\n[c]Resource Event"]]), 'id'), "Smuggler's Run");
});

test('prettifyCodeName reads like a title', () => {
  assert.equal(prettifyCodeName('EVENT_FOO_BAR'), 'Foo Bar');
  assert.equal(prettifyCodeName('SEASON_83_EVENT_NAME'), 'Season 83 Name');
});

test('unitFromTexture reads the unit out of game texture names', () => {
  assert.equal(unitFromTexture('tex.events_darthjarjar'), 'DARTHJARJAR');
  assert.equal(unitFromTexture('tex.events_icon_theronin'), 'THERONIN');
  assert.equal(unitFromTexture('tex.events_stormtrooperconcept'), 'STORMTROOPERCONCEPT');
  assert.equal(unitFromTexture('tex.events_x'), undefined);
  assert.equal(unitFromTexture(null), undefined);
});

test('selectLiveEvents prefers the Comlink unit, then the texture unit', () => {
  const events = [
    {
      id: 'EVENT_MARQUEE_JAXXON', nameKey: 'K1', marqueeUnitBaseId: 'JAXXON',
      image: 'tex.events_jaxxon', icon: 'tex.events_icon_jaxxon',
      instance: [{ startTime: String(NOW - H), endTime: String(NOW + H) }],
    },
    {
      id: 'progressionevent_MEESALESS_MASSACRE', nameKey: 'K2',
      image: 'tex.events_darthjarjar', icon: 'tex.events_icon_darthjarjar',
      instance: [{ startTime: String(NOW - H), endTime: String(NOW + H) }],
    },
  ];
  const out = selectLiveEvents(events, new Map([['K1', 'Action Jaxxon'], ['K2', 'Terrible Tings']]), NOW);
  assert.equal(out[0].unit, 'JAXXON');
  assert.equal(out[1].unit, 'DARTHJARJAR');
});
test('selectLiveEvents keeps scheduled instances, drops permanent ones', () => {
  const events = [
    {
      id: 'EVENT_MARQUEE_X', nameKey: 'K',
      instance: [{ startTime: String(NOW - H), endTime: String(NOW + H) }],
    },
    {
      id: 'EVENT_JOURNEY_PERMANENT', nameKey: 'K2',
      instance: [{ startTime: String(NOW - 5 * 365 * 24 * H), endTime: String(NOW + 100 * 365 * 24 * H) }],
    },
    {
      id: 'EVENT_OLD', nameKey: 'K3',
      instance: [{ startTime: String(NOW - 30 * 24 * H), endTime: String(NOW - 29 * 24 * H) }],
    },
  ];
  const names = new Map([['K', 'Marquee [c]X[/c]'], ['K2', 'Journey'], ['K3', 'Old']]);
  const out = selectLiveEvents(events, names, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'EVENT_MARQUEE_X');
  assert.equal(out[0].name, 'Marquee X');
  assert.equal(out[0].live, true);
  assert.equal(out[0].kind, 'marquee');
});

test('selectLiveEvents drops GAC (hardcoded round cards cover it)', () => {
  const events = [
    {
      id: 'CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_83', nameKey: 'K1',
      instance: [{ startTime: String(NOW - H), endTime: String(NOW + 7 * 24 * H) }],
    },
    {
      id: 'EVENT_MARQUEE_X', nameKey: 'K2',
      instance: [{ startTime: String(NOW - H), endTime: String(NOW + H) }],
    },
  ];
  const out = selectLiveEvents(events, new Map([['K1', 'GAC'], ['K2', 'Marquee']]), NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'EVENT_MARQUEE_X');
});
test('selectLiveEvents drops daily filler', () => {
  const events = [
    { id: 'challenge_XP', nameKey: 'K1', instance: [{ startTime: String(NOW - H), endTime: String(NOW + H) }] },
    { id: 'shipevent_SC01UPGRADE', nameKey: 'K2', instance: [{ startTime: String(NOW - H), endTime: String(NOW + H) }] },
    { id: 'EVENT_ASSAULT_EMPIRE', nameKey: 'K3', instance: [{ startTime: String(NOW - H), endTime: String(NOW + H) }] },
  ];
  const out = selectLiveEvents(events, new Map([['K1', 'a'], ['K2', 'b'], ['K3', 'c']]), NOW);
  assert.deepEqual(out.map(e => e.id), ['EVENT_ASSAULT_EMPIRE']);
});
test('selectLiveEvents marks future instances as not live', () => {
  const events = [
    {
      id: 'EVENT_ASSAULT_EMPIRE', nameKey: 'K',
      instance: [{ startTime: String(NOW + H), endTime: String(NOW + 2 * H) }],
    },
  ];
  const out = selectLiveEvents(events, new Map([['K', 'Training Droids']]), NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].live, false);
});

test('committed live-events.json is fresh and well-formed', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../assets/data/live-events.json', import.meta.url), 'utf8'));
  assert.ok(Number.isFinite(data.pulledAt));
  assert.ok(typeof data.gameDataVersion === 'string' && data.gameDataVersion.length > 0);
  assert.ok(Array.isArray(data.events) && data.events.length > 0);
  for (const e of data.events) {
    assert.ok(e.id && e.name && e.kind);
    assert.ok(e.startMs < e.endMs);
    assert.ok(!('assetName' in e) && !('iconAsset' in e), 'internal fields leaked into JSON');
    if (e.art) {
      assert.ok(
        fs.existsSync(new URL(`../assets/img/${e.art}`, import.meta.url)),
        `missing art file: ${e.art}`,
      );
    }
  }
  // Pulled recently enough to be useful (stale banner appears after 48h).
  assert.ok(Date.now() - data.pulledAt < 48 * H, 'live-events.json is stale, run npm run events:pull');
});

/* Render engine check: the live section builds from cached data. */
const configSource = fs.readFileSync(new URL('../assets/js/config.js', import.meta.url), 'utf8');
const timeSource = fs.readFileSync(new URL('../assets/js/time.js', import.meta.url), 'utf8');
const renderSource = fs.readFileSync(new URL('../assets/js/render.js', import.meta.url), 'utf8');

function loadRenderEngine() {
  const storage = new Map([['swgoh-tz', 'UTC']]);
  const mkEl = () => ({
    innerHTML: '', textContent: '', hidden: false, disabled: false,
    scrollLeft: 0, dataset: {}, style: {}, value: '', title: '',
    contains: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const els = {};
  const context = {
    console, Intl, Date, Math, Number, String, Object, Array, Set, parseInt,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    history: { replaceState: () => {} },
    document: {
      activeElement: null,
      getElementById: id => els[id] ??= mkEl(),
      querySelectorAll: () => [],
      createElement: () => mkEl(),
      body: mkEl(),
    },
  };
  vm.createContext(context);
  vm.runInContext(configSource, context);
  vm.runInContext(timeSource, context);
  vm.runInContext(renderSource, context);
  return { ctx: context, els };
}

test('live cards use pulled art, falling back to bundled art', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const pulled = run(`liveCardHTML(
    { id: 'a', name: 'Blade and Bastion', kind: 'marquee', unit: 'X', art: 'live/events-stormtrooperconcept.png', startMs: ${NOW - H}, endMs: ${NOW + H} },
    'Now')`);
  assert.match(pulled, /live\/events-stormtrooperconcept\.png/);
  assert.match(pulled, /xcard-rel is-today">Now</);
  assert.doesNotMatch(pulled, /xcard-cat/);
  const fallback = run(`liveCardHTML(
    { id: 'b', name: 'Soon Thing', kind: 'omega', startMs: ${NOW + H}, endMs: ${NOW + 2 * H} },
    'In 2 days')`);
  // Omega has no rotation icon: era fallback art.
  assert.match(fallback, /events\/eraicon\.png/);
  assert.match(fallback, /xcard-rel">In 2 days</);
  assert.doesNotMatch(fallback, /xcard-cat/);
});

test('live card accents match the rotation families', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  // Rotation marquee cards are era orange; rotation proving-grounds
  // cards are conquest purple — live cards must agree.
  const cases = [
    ['marquee', 'var(--orange)'],
    ['era-challenge', 'var(--orange)'],
    ['assault', 'var(--orange)'],
    ['omega', 'var(--orange)'],
    ['journey', 'var(--orange)'],
    ['conquest', 'var(--purple)'],
    ['daily-challenge', 'var(--purple)'],
    ['proving-grounds', 'var(--purple)'],
    ['fleet', 'var(--steel)'],
    ['smugglers-run', 'var(--amber)'],
    ['credit-heist', 'var(--amber)'],
  ];
  for (const [kind, accent] of cases) {
    const html = run(`liveCardHTML(
      { id: 'm', name: 'Some Event', kind: '${kind}', startMs: ${NOW - H}, endMs: ${NOW + H} },
      'Now')`);
    assert.match(html, new RegExp(accent.replace(/[()]/g, '\\$&')), kind);
  }
  // Spot-check against the real rotation mapping.
  assert.equal(run(`categoryFor('marquee_1')`), 'era');
  assert.equal(run(`categoryFor('proving_ground')`), 'conquest');
});

test('live cards fall back to generic art for unknown kinds', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const html = run(`liveCardHTML({ id: 'x', name: 'Mystery', kind: 'whatever', startMs: ${NOW - H}, endMs: ${NOW + H} }, 'Now')`);
  assert.match(html, /events\/eraicon\.png/);
  assert.match(html, /Mystery/);
});

test('explorer day view overlays live events touching that day', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  // Unit-level: overlap follows the UTC calendar day bucket.
  // Anchored to dayStart — now-based offsets flake outside 18:00-00:00 UTC,
  // when Date.now() sits in the next calendar bucket past currentDayStartMs.
  const dayStart = run('getGameStatus().currentDayStartMs');
  const now = run('Date.now()');
  run(`liveEventsCache = { pulledAt: ${now}, gameDataVersion: 'v', events: [
    { id: 'a', name: 'Live Thing', kind: 'marquee', startMs: ${dayStart} + 3600000, endMs: ${dayStart} + 7200000 },
    { id: 'b', name: 'Far Future', kind: 'omega', startMs: ${dayStart} + 30 * 86400000 + 3600000, endMs: ${dayStart} + 31 * 86400000 }
  ] }`);
  assert.equal(run(`liveEventsForDay(${dayStart}).length`), 1);
  assert.equal(run(`liveEventsForDay(${dayStart} + 30 * 86400000).length`), 1);
  assert.equal(run(`liveEventsForDay(${dayStart} + 5 * 86400000).length`), 0);
  // Rendered: viewed day leads with live image cards carrying the same
  // relative-day pill as hardcoded cards.
  run('renderExplorer(getGameStatus())');
  assert.match(els.dayDetail.innerHTML, /class="xcard"/);
  assert.match(els.dayDetail.innerHTML, /Live Thing/);
  assert.match(els.dayDetail.innerHTML, /xcard-rel is-today">Now</);
  assert.doesNotMatch(els.dayStrip.innerHTML, /has-live/);
});

test('explorer renders rotation-only when no live snapshot is loaded', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  run('renderExplorer(getGameStatus())');
  assert.doesNotMatch(els.dayDetail.innerHTML, /art-badge">LIVE/);
  assert.doesNotMatch(els.dayStrip.innerHTML, /has-live/);
});

test('mid-span long runners show as boss-row badges, not cards', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const dayStart = run('getGameStatus().currentDayStartMs');
  // Started 2 days ago (Day 3 of 7), ends in 5 days.
  run(`liveEventsCache = { pulledAt: ${NOW}, gameDataVersion: 'v', events: [
    { id: 'c', name: 'Long Thing', kind: 'conquest', art: 'live/x.png',
      startMs: ${dayStart} - 2 * 86400000 + 3600000, endMs: ${dayStart} + 5 * 86400000 }
  ] }`);
  assert.equal(run(`liveEventsForDay(${dayStart}).length`), 1);
  assert.equal(run(`splitLiveDay(liveEventsForDay(${dayStart}), ${dayStart}).starting.length`), 0);
  assert.equal(run(`splitLiveDay(liveEventsForDay(${dayStart}), ${dayStart}).ongoing.length`), 1);
  run('renderExplorer(getGameStatus())');
  assert.match(els.dayDetail.innerHTML, /day-boss day-live/);
  assert.match(els.dayDetail.innerHTML, /Long Thing/);
  assert.match(els.dayDetail.innerHTML, /Day 3 of 7/);
  assert.doesNotMatch(els.dayDetail.innerHTML, /<h4>Long Thing<\/h4>/);
  assert.doesNotMatch(els.dayStrip.innerHTML, /has-live/);
});

test('live conquest badges keep the conquest purple, others use boss orange', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const dayStart = run('getGameStatus().currentDayStartMs');
  run(`liveEventsCache = { pulledAt: ${NOW}, gameDataVersion: 'v', events: [
    { id: 'c', name: 'Live Conquest', kind: 'conquest', art: 'live/x.png',
      startMs: ${dayStart} - 2 * 86400000 + 3600000, endMs: ${dayStart} + 5 * 86400000 },
    { id: 'm', name: 'Live Marquee', kind: 'marquee', art: 'live/y.png',
      startMs: ${dayStart} - 2 * 86400000 + 3600000, endMs: ${dayStart} + 5 * 86400000 }
  ] }`);
  run('renderExplorer(getGameStatus())');
  assert.match(els.dayDetail.innerHTML, /day-boss day-live day-live-cq/);
  assert.match(els.dayDetail.innerHTML, /day-boss day-live" title="Live Marquee/);
});

test('events that ended before the changeover read Expired, not Now', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const dayStart = run('getGameStatus().currentDayStartMs');
  // Short event that started and ended earlier in the current game day.
  run(`liveEventsCache = { pulledAt: ${NOW}, gameDataVersion: 'v', events: [
    { id: 'x', name: 'Over Thing', kind: 'assault',
      startMs: ${dayStart} + 3600000, endMs: ${dayStart} + 7200000 }
  ] }`);
  run('renderExplorer(getGameStatus())');
  assert.match(els.dayDetail.innerHTML, /<h4>Over Thing<\/h4>/);
  assert.match(els.dayDetail.innerHTML, /xcard-rel is-expired">Expired</);
});

test('short mid-span events show nothing that day', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const dayStart = run('getGameStatus().currentDayStartMs');
  // 20h event that started yesterday — mid-span but under 24h total.
  run(`liveEventsCache = { pulledAt: ${NOW}, gameDataVersion: 'v', events: [
    { id: 's', name: 'Short Thing', kind: 'assault',
      startMs: ${dayStart} - 12 * 3600000, endMs: ${dayStart} + 8 * 3600000 }
  ] }`);
  run('renderExplorer(getGameStatus())');
  assert.doesNotMatch(els.dayDetail.innerHTML, /Short Thing/);
  assert.doesNotMatch(els.dayDetail.innerHTML, /day-live/);
});

test('long runners get full cards on their start day', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const dayStart = run('getGameStatus().currentDayStartMs');
  run(`liveEventsCache = { pulledAt: ${NOW}, gameDataVersion: 'v', events: [
    { id: 'd', name: 'Starts Today', kind: 'assault', art: 'live/y.png',
      startMs: ${dayStart} + 3600000, endMs: ${dayStart} + 3 * 86400000 }
  ] }`);
  run('renderExplorer(getGameStatus())');
  assert.match(els.dayDetail.innerHTML, /<h4>Starts Today<\/h4>/);
  assert.doesNotMatch(els.dayDetail.innerHTML, /day-live/);
  assert.doesNotMatch(els.dayStrip.innerHTML, /has-live/);
});

test('liveCoveredIcons maps live starts to rotation icons', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const covered = run(`JSON.stringify([...liveCoveredIcons([
    { id: 'EVENT_RESOURCE_SMUGGLERS_RUN', kind: 'smugglers-run' },
    { id: 'EVENT_MARQUEE_X', kind: 'marquee', unit: 'X', name: 'Mara Jade Skywalker Marquee' },
    { id: 'EVENT_FLEET_MASTERY_EXECUTOR', kind: 'fleet' },
    { id: 'CONQUEST_VOL24', kind: 'conquest' },
    { id: 'EVENT_ASSAULT_EMPIRE', kind: 'assault' }
  ])].sort())`);
  assert.equal(covered, JSON.stringify(['conquest_end', 'conquest_start', 'fleet_executor', 'marquee_1', 'smugglersrun']));
});

test('slot matcher links rotation slots to live events by unit, family-gated', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const dayStart = run('getGameStatus().currentDayStartMs');
  run(`liveEventsCache = { pulledAt: ${NOW}, gameDataVersion: 'v', events: [
    { id: 'm', name: 'Action Jaxxon', kind: 'marquee', unit: 'JAXXON',
      startMs: ${dayStart} - 86400000, endMs: ${dayStart} + 5 * 86400000 },
    { id: 't', name: 'Terrible Tings Legendary Event', kind: 'event', unit: 'DARTHJARJAR',
      startMs: ${dayStart} - 86400000, endMs: ${dayStart} + 20 * 86400000 }
  ] }`);
  // Marquee slot claims the marquee live event…
  assert.equal(run(`liveMatchesForSlot('marquee_5', ${dayStart}).map(e => e.id).join(',')`), 'm');
  // …but never its unit's era-challenge slot (different family, both real).
  assert.equal(run(`liveMatchesForSlot('era_challenge_5', ${dayStart}).length`), 0);
  // The journey slot matches by texture-derived unit despite the kind gap.
  assert.equal(run(`liveMatchesForSlot('journey_guide', ${dayStart}).map(e => e.id).join(',')`), 't');
  // Starting coverage follows the same rule, so the guide card is
  // suppressed while an unrelated assault never covers anything.
  const covered = run(`JSON.stringify([...liveCoveredIcons([
    { id: 't', name: 'Terrible Tings Legendary Event', kind: 'event', unit: 'DARTHJARJAR' }
  ])])`);
  assert.equal(covered, JSON.stringify(['journey_guide']));
});

test('rotation cards wear the matched live art and marquee name', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const dayStart = run('getGameStatus().currentDayStartMs');
  run(`liveEventsCache = { pulledAt: ${NOW}, gameDataVersion: 'v', events: [
    { id: 'm', name: 'Action Jaxxon', kind: 'marquee', unit: 'JAXXON', art: 'live/events-jaxxon.png',
      startMs: ${dayStart} - 86400000, endMs: ${dayStart} + 5 * 86400000 }
  ] }`);
  const card = run(`explorerCardHTML({ icon: 'marquee_5', label: 'Jaxxon Marquee' }, ${dayStart}, 'Now', null, ${NOW})`);
  assert.match(card, /live\/events-jaxxon\.png/);
  assert.match(card, /<h4>Action Jaxxon<\/h4>/);
  // Without a live match the committed live portrait remains (the old
  // hardcoded placeholder file is gone).
  run('liveEventsCache = null');
  const plain = run(`explorerCardHTML({ icon: 'marquee_5', label: 'Jaxxon Marquee' }, ${dayStart}, 'Now', null, ${NOW})`);
  assert.match(plain, /live\/events-jaxxon\.png/);
  assert.match(plain, /<h4>Jaxxon Marquee<\/h4>/);
});

test('ongoing live matches suppress the rotation card, badge represents', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  // Era day 71 carries a journey_guide rotation card; Terrible Tings
  // (started day 57) is ongoing there.
  const target = run(`(() => {
    const st = getGameStatus();
    const dMs = st.currentEraStartMs + (71 - 1) * 86400000;
    return { o: 71 - st.eraDay, dMs };
  })()`);
  run(`liveEventsCache = { pulledAt: ${NOW}, gameDataVersion: 'v', events: [
    { id: 't', name: 'Terrible Tings Legendary Event', kind: 'event', unit: 'DARTHJARJAR', art: 'live/x.png',
      startMs: ${target.dMs} - 14 * 86400000, endMs: ${target.dMs} + 14 * 86400000 }
  ] };
  explorerOffset = ${target.o};`);
  run('renderExplorer(getGameStatus())');
  assert.doesNotMatch(els.dayDetail.innerHTML, /Journey Guide<\/h4>/);
  assert.match(els.dayDetail.innerHTML, /Terrible Tings Legendary Event/);
  assert.match(els.dayDetail.innerHTML, /day-badge/);
});

test('journey rotation badge yields to the matched live event', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const dayStart = run('getGameStatus().currentDayStartMs');
  const windows = [{ icon: 'journey_guide', day: 3, total: 14 }];
  // Control: no live data, the rotation window badges the day.
  assert.match(run(`rotationBadgesHTML(${JSON.stringify(windows)}, [], ${dayStart})`), /Darth Jar Jar Journey Guide/);
  // Matched (same unit, different kind): the live event wins, no double.
  run(`liveEventsCache = { pulledAt: ${NOW}, gameDataVersion: 'v', events: [
    { id: 't', name: 'Terrible Tings Legendary Event', kind: 'event', unit: 'DARTHJARJAR',
      startMs: ${dayStart} - 86400000, endMs: ${dayStart} + 86400000 }
  ] }`);
  const dayLive = run(`liveEventsForDay(${dayStart})`);
  assert.equal(run(`rotationBadgesHTML(${JSON.stringify(windows)}, ${JSON.stringify(dayLive)}, ${dayStart})`), '');
});

test('live cards suppress the matching rotation card', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  // Find a visible pill day whose rotation includes a smuggling run.
  const off = run(`(() => {
    const st = getGameStatus();
    for (let o = -6; o <= 6; o++) {
      const d = explorerDayAt(st, o);
      if (d.items.some(i => i.icon === 'smugglersrun')) return { o, dMs: d.dMs };
    }
    return null;
  })()`);
  assert.ok(off, 'expected a smugglersrun rotation day in range');
  run(`liveEventsCache = { pulledAt: Date.now(), gameDataVersion: 'v', events: [
    { id: 'EVENT_RESOURCE_SMUGGLERS_RUN', name: "SMUGGLER'S RUN Resource Event", kind: 'smugglers-run',
      art: 'live/events-smugglersrun.png', startMs: ${off.dMs} + 3600000, endMs: ${off.dMs} + 86400000 }
  ] };
  explorerOffset = ${off.o};`);
  run('renderExplorer(getGameStatus())');
  assert.match(els.dayDetail.innerHTML, /SMUGGLER'S RUN Resource Event/);
  assert.doesNotMatch(els.dayDetail.innerHTML, /Smuggler's Run (I|II|III)/);
});

test('live GAC entries never reach the explorer even if present', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const dayStart = run('getGameStatus().currentDayStartMs');
  run(`liveEventsCache = { pulledAt: ${NOW}, gameDataVersion: 'v', events: [
    { id: 'g', name: 'GAC Season 83', kind: 'gac', startMs: ${dayStart} - 3600000, endMs: ${dayStart} + 86400000 }
  ] }`);
  assert.equal(run(`liveEventsForDay(${dayStart}).length`), 0);
});

test('live cards mirror rotation structure, art and accents', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  // Marquee: portrait art, era accent, ERA badge — exactly like the
  // hardcoded marquee_4 card. No type pills anywhere.
  const marquee = run(`liveCardHTML(
    { id: 'm', name: 'Blade And Bastion', kind: 'marquee', unit: 'STORMTROOPERCONCEPT', startMs: ${NOW - H}, endMs: ${NOW + H} },
    'Now')`);
  const rotation = run(`explorerCardHTML({ icon: 'marquee_4', label: 'Stormtrooper (Concept) Marquee' }, ${NOW}, 'Now', null, ${NOW})`);
  for (const cls of ['xcard-art', 'art-badge', 'xcard-shade', 'xcard-art-meta', 'xcard-rel', 'xcard-body']) {
    assert.match(marquee, new RegExp(cls), cls);
  }
  assert.match(marquee, /marquee\/marquee4event\.png/);
  assert.match(marquee, /art-badge">ERA</);
  assert.match(marquee, /<h4>Blade And Bastion<\/h4>/);
  assert.match(marquee, /xcard-rel is-today">Now</);
  assert.doesNotMatch(marquee, /xcard-cat/);
  // Same accent variable and same rel pill as the rotation card.
  const accentOf = html => html.match(/--accent:([^;]+);/)[1];
  assert.equal(accentOf(marquee), accentOf(rotation));
  assert.match(rotation, /xcard-rel is-today">Now</);
  assert.doesNotMatch(rotation, /xcard-cat/);
  // Fleet mastery: executor art.
  const fleet = run(`liveCardHTML(
    { id: 'f', name: 'Discarded Doctrine', kind: 'fleet', startMs: ${NOW + H}, endMs: ${NOW + 2 * H} },
    'In 2 days')`);
  assert.match(fleet, /events\/executor\.png/);
  assert.match(fleet, /xcard-rel">In 2 days</);
  // No in-game-experiment leftovers.
  assert.doesNotMatch(marquee, /xcard-art-top|xcard-promo|xcard-livepill|xcard-countdown/);
});

test('cards show start instant plus whole-hour duration', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const rotation = run(`explorerCardHTML({ icon: 'tw_offense', label: 'Offense Phase Starts' }, ${NOW}, 'Now', null, ${NOW})`);
  assert.match(rotation, /xw-start">\w{3}.*\d{2}:\d{2} UTC/);
  assert.match(rotation, /xw-dur">24 hrs</);
  const live = run(`liveCardHTML(
    { id: 'm', name: 'Blade And Bastion', kind: 'marquee', startMs: ${NOW - H}, endMs: ${NOW + H} },
    'Now')`);
  assert.match(live, /xw-dur">2 hrs</);
  const moment = run(`explorerCardHTML({ icon: 'client_update', label: 'Client Update' }, ${NOW}, 'Now', null, ${NOW})`);
  assert.match(moment, /xw-start"/);
  assert.match(moment, /xw-dur">N\/A</);
});
test('live conquest surfaces wear the banner, never promo art', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const card = run(`liveCardHTML(
    { id: 'c', name: 'Conquest', kind: 'conquest', art: 'live/conquestpass-promo-basic-01.png', startMs: ${NOW - H}, endMs: ${NOW + H} },
    'Now')`);
  assert.match(card, /events\/conquest\.png/);
  assert.doesNotMatch(card, /conquestpass-promo/);
  const badges = run(`liveBadgesHTML(
    [{ id: 'c', name: 'Conquest', kind: 'conquest', art: 'live/conquestpass-promo-basic-01.png', startMs: ${NOW - 2 * 86400000}, endMs: ${NOW + 5 * 86400000} }],
    ${NOW})`);
  assert.match(badges, /events\/conquest\.png/);
  assert.doesNotMatch(badges, /conquestpass-promo/);
});

test('rotation window badges render Day X of Y and yield to live kinds', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const html = run(`rotationBadgesHTML([{ icon: 'marquee_1', day: 3, total: 7 }], [])`);
  assert.match(html, /day-badge/);
  assert.match(html, /Day 3 of 7/);
  assert.match(html, /Mara Jade Skywalker Marquee/);
  assert.equal(run(`rotationBadgesHTML([{ icon: 'marquee_1', day: 3, total: 7 }], [{ kind: 'marquee' }])`), '');
  assert.equal(run(`rotationBadgesHTML([], [])`), '');
});

test('cards carry a family kicker above the title', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  const rotation = run(`explorerCardHTML({ icon: 'marquee_1', label: 'Marquee' }, ${NOW}, 'Now', null, ${NOW})`);
  assert.match(rotation, /xcard-kicker">ERA</);
  const live = run(`liveCardHTML(
    { id: 'm', name: 'Blade And Bastion', kind: 'marquee', startMs: ${NOW - H}, endMs: ${NOW + H} },
    'Now')`);
  assert.match(live, /xcard-kicker">ERA</);
});

test('TB is always Rise of the Empire with no selector buttons', () => {
  const { ctx } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  // tbChoiceForRun ignores any run context — always RotE.
  assert.equal(run(`tbChoiceForRun(null).id`), 'rote');
  assert.equal(run(`tbChoiceForRun({ side: 'dark', offset: 0 }).id`), 'rote');
  assert.equal(run(`tbChoiceForRun({ side: 'light', offset: 3 }).name`), 'Rise of the Empire');
  // RotE cards render with no picker buttons anywhere.
  const html = run(`explorerCardHTML(
    { icon: 'rote', label: 'Rise of the Empire Phase 1 Starts' }, ${NOW}, 'Now',
    { def: tbChoiceForRun(), offset: 0, phase1Ms: ${NOW}, art: 'tb/rise-of-the-empire.png' }, ${NOW})`);
  assert.match(html, /Rise of the Empire/);
  assert.doesNotMatch(html, /tb-pick-btn/);
  assert.doesNotMatch(html, /setTbChoice/);
});
test('shared fallback icons never pre-empt specific textures', async () => {
  // Regression: a shared icon file on disk (or a fast icon download)
  // must not claim an event whose own texture simply hasn't been tried
  // yet. Every event's primary candidate goes first.
  const png = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
    0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 98, 248, 255, 255, 63,
    0, 5, 254, 2, 254, 167, 53, 129, 57, 0, 0, 0, 0, 73, 69,
    78, 68, 174, 66, 96, 130,
  ]);
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://x').searchParams.get('assetName');
    if (name === 'img_b') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(png);
    } else {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  // NOTE: os.tmpdir() is not used — this sandbox reports a relative
  // TMPDIR that would litter the repo. Plain /tmp works everywhere CI
  // runs, and the dir is removed afterwards.
  const { rm } = await import('node:fs/promises');
  let dir = '';
  try {
    dir = await mkdtemp('/tmp/live-art-test-');
    const dirUrl = pathToFileURL(dir + path.sep).href;
    await writeFile(path.join(dir, 'img-a.png'), png);
    await writeFile(path.join(dir, 'shared.png'), png);
    const events = [
      { id: 'A', kind: 'x', assetName: 'img_a', iconAsset: 'shared', startMs: 1, endMs: 2 },
      { id: 'B', kind: 'x', assetName: 'img_b', iconAsset: 'shared', startMs: 1, endMs: 2 },
    ];
    await pullEventArt(events, 1, { artDir: dirUrl, aeUrl: `http://127.0.0.1:${server.address().port}` });
    assert.equal(artSlug('img_a'), 'img-a.png');
    assert.equal(events[0].art, 'live/img-a.png');
    assert.equal(events[1].art, 'live/img-b.png');
    assert.ok(fs.existsSync(path.join(dir, 'img-b.png')));
  } finally {
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

test('live conquest suppresses the rotation conquest badge', () => {
  const { ctx, els } = loadRenderEngine();
  const run = src => vm.runInContext(src, ctx);
  // Find a visible pill day inside an active conquest run.
  const target = run(`(() => {
    const st = getGameStatus();
    for (let o = -6; o <= 6; o++) {
      const d = explorerDayAt(st, o);
      if (conquestInfoForDay(d.ep, d.dayInEp)) return { o, dMs: d.dMs };
    }
    return null;
  })()`);
  assert.ok(target, 'expected a conquest rotation day in range');
  // Control: rotation badge shows without live data.
  run(`explorerOffset = ${target.o};`);
  run('renderExplorer(getGameStatus())');
  assert.match(els.dayDetail.innerHTML, /day-conquest/);
  // With live conquest touching the day: rotation badge gone, live shown.
  run(`liveEventsCache = { pulledAt: Date.now(), gameDataVersion: 'v', events: [
    { id: 'CONQUEST_VOL24', name: 'Conquest Live', kind: 'conquest', art: 'live/x.png',
      startMs: ${target.dMs} - 86400000, endMs: ${target.dMs} + 5 * 86400000 }
  ] };`);
  run('renderExplorer(getGameStatus())');
  assert.doesNotMatch(els.dayDetail.innerHTML, /day-conquest/);
  assert.match(els.dayDetail.innerHTML, /Conquest Live/);
});
