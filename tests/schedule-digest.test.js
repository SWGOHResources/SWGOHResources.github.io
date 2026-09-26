import assert from 'node:assert/strict';
import test from 'node:test';
import { formatEventPayload, formatStatusPayload } from '../scripts/post-schedule-digest.mjs';

const status = {
  eraDay: 50,
  eraLength: 84,
  dateLabel: 'Tuesday, 15th September 2026',
  era: 'Era of Myths & Legends — Day 50/84 · ends 20th Oct',
  gac: 'Round 3 of 3 — Attack Phase — Week 1 ends soon',
  tb: 'Rise of the Empire — Phase 2 of 6',
  tw: 'Intermission',
  conquest: null,
  eventCount: 0,
};

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

test('status embed uses neat labeled rows with no emojis', () => {
  const d = formatStatusPayload(status);
  const e = d.embeds[0];
  assert.match(e.title, /Era Day 50\/84/);
  assert.deepEqual(e.fields.map(f => f.name), ['Era', 'GAC', 'Territory Battle', 'Territory War']);
  for (const f of e.fields) assert.equal(f.inline, true);
  assert.doesNotMatch(JSON.stringify(d), EMOJI_RE);
  assert.match(e.description, /Quiet day/);
});

test('status embed adds conquest full-width and event follow-up note', () => {
  const d = formatStatusPayload({ ...status, conquest: 'C3 — Day 5 of 14', eventCount: 3 });
  assert.equal(d.embeds[0].fields.length, 5);
  assert.equal(d.embeds[0].fields[4].inline, false);
  assert.match(d.embeds[0].description, /3 events start today/);
});

test('status embed notes when event posts are capped', () => {
  const d = formatStatusPayload({ ...status, eventCount: 15, shownCount: 10 });
  assert.match(d.embeds[0].description, /15 events start today — first 10 follow/);
  const full = formatStatusPayload({ ...status, eventCount: 3, shownCount: 3 });
  assert.match(full.embeds[0].description, /3 events start today — details follow/);
});

test('proving grounds embeds wear the conquest purple', () => {
  const d = formatEventPayload({ name: 'X', kind: 'proving-grounds', startMs: 1, endMs: 2, art: null });
  assert.equal(d.embeds[0].color, 0x9686D6);
});

test('event embeds show type/start/end rows plus full artwork', () => {
  const d = formatEventPayload({
    name: 'Blade and Bastion', kind: 'marquee',
    startMs: 1789495200000, endMs: 1789581600000, art: 'live/events-x.png',
  });
  const e = d.embeds[0];
  assert.equal(e.title, 'Blade and Bastion');
  assert.deepEqual(e.fields.map(f => f.name), ['Type', 'Starts', 'Ends']);
  for (const f of e.fields) assert.equal(f.inline, true);
  assert.match(e.fields[1].value, /<t:1789495200:F>/);
  assert.equal(e.image.url, 'https://swgohresources.github.io/assets/img/live/events-x.png');
  assert.doesNotMatch(JSON.stringify(d), EMOJI_RE);
});

test('event embeds degrade without artwork', () => {
  const d = formatEventPayload({
    name: 'Mystery', kind: 'whatever', startMs: 1, endMs: 2, art: null,
  });
  assert.ok(!('image' in d.embeds[0]) && !('thumbnail' in d.embeds[0]));
  assert.equal(d.embeds[0].fields[0].value, 'Event');
});
