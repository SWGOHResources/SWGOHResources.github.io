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

test('status embed reads like the client-version alerts', () => {
  const d = formatStatusPayload(status);
  const e = d.embeds[0];
  assert.match(e.title, /Era Day 50\/84/);
  assert.equal(e.fields.length, 4);
  for (const f of e.fields) assert.equal(f.inline, true);
  assert.match(e.fields[0].value, /Myths & Legends/);
  assert.match(e.description, /Quiet day/);
});

test('status embed adds conquest and event follow-up note', () => {
  const d = formatStatusPayload({ ...status, conquest: 'C3 — Day 5 of 14', eventCount: 3 });
  assert.equal(d.embeds[0].fields.length, 5);
  assert.equal(d.embeds[0].fields[4].inline, false);
  assert.match(d.embeds[0].description, /3 live events/);
});

test('event embeds wear their own artwork with timestamps', () => {
  const d = formatEventPayload({
    name: 'Blade and Bastion', kind: 'marquee',
    startMs: 1789495200000, endMs: 1789581600000, art: 'live/events-x.png',
  });
  const e = d.embeds[0];
  assert.equal(e.title, 'Blade and Bastion');
  assert.match(e.description, /Marquee/);
  assert.match(e.description, /<t:1789495200:F>/);
  assert.equal(e.thumbnail.url, 'https://swoghresources.github.io/assets/img/live/events-x.png');
});

test('event embeds degrade without artwork', () => {
  const d = formatEventPayload({
    name: 'Mystery', kind: 'whatever', startMs: 1, endMs: 2, art: null,
  });
  assert.ok(!('thumbnail' in d.embeds[0]));
  assert.match(d.embeds[0].description, /Event/);
});
