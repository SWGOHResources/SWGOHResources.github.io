import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDigest } from '../scripts/post-schedule-digest.mjs';

const base = {
  eraDay: 50,
  eraLength: 84,
  dateLabel: 'Tuesday, 15th September 2026',
  gac: { main: 'Round 3 of 3 — Attack Phase', sub: 'Week 1 ends soon' },
  guildToday: 'Rise of the Empire Phase 2 Started',
  guildTomorrow: 'Rise of the Empire Phase 3 Starts',
  conquest: null,
  starting: [],
  ending: [],
};

test('digest mirrors the homepage surfaces', () => {
  const d = formatDigest(base);
  assert.match(d.embeds[0].title, /Era Day 50\/84/);
  const names = d.embeds[0].fields.map(f => f.name);
  assert.ok(names.some(n => n.includes('GAC')));
  assert.ok(names.some(n => n.includes('Guild Today')));
  assert.ok(names.some(n => n.includes('Guild Tomorrow')));
  assert.match(d.embeds[0].fields[0].value, /Round 3/);
});

test('digest lists starting and ending live events with timestamps', () => {
  const d = formatDigest({
    ...base,
    starting: [{ name: 'Blade and Bastion', kind: 'marquee', startMs: 1789495200000, endMs: 1789495200000 }],
    ending: [{ name: "Smuggler's Run", kind: 'smugglers-run', startMs: 1, endMs: 1789466400000 }],
  });
  const names = d.embeds[0].fields.map(f => f.name);
  assert.ok(names.some(n => n.includes('Starting today (1)')));
  assert.ok(names.some(n => n.includes('Ending today (1)')));
  const body = JSON.stringify(d);
  assert.match(body, /<t:1789495200:F>/);
  assert.match(body, /Blade and Bastion/);
});

test('digest notes conquest position and empty event days', () => {
  const d = formatDigest({ ...base, conquest: 'Conquest C3 — Day 5 of 14 — note' });
  assert.ok(JSON.stringify(d).includes('Day 5 of 14'));
  const empty = formatDigest(base);
  assert.ok(empty.embeds[0].fields.some(f => f.value.includes('No live events')));
});

test('digest stays within Discord embed limits', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `E${i}`, kind: 'event', startMs: i + 1, endMs: i + 2 }));
  const d = formatDigest({ ...base, starting: many, ending: many });
  assert.ok(d.embeds[0].fields.length <= 10);
  assert.ok(JSON.stringify(d).length < 6000);
});
