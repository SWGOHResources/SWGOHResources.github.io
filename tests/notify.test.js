import assert from 'node:assert/strict';
import test from 'node:test';
import { collectNotifications, phraseUntil } from '../scripts/notify-upcoming.mjs';

const NOW = Date.parse('2026-09-14T16:00:00Z');
const M = 60000;
const H = 3600000;

test('picker sends starts inside the window, skips the rest', () => {
  const { send, notified } = collectNotifications([
    { key: 'a', title: 'Soon', startMs: NOW + 20 * M },
    { key: 'b', title: 'Too far', startMs: NOW + 2 * H },
    { key: 'c', title: 'Too old', startMs: NOW - 30 * M },
    { key: 'd', title: 'Just started', startMs: NOW - 5 * M },
  ], {}, NOW, 45 * M, 10 * M);
  assert.deepEqual(send.map(c => c.key), ['d', 'a']);
  assert.ok(notified.a && notified.d && !notified.b && !notified.c);
});

test('picker dedups already-notified keys and prunes week-old state', () => {
  const { send, notified } = collectNotifications(
    [
      { key: 'a', title: 'Soon', startMs: NOW + 20 * M },
      { key: 'a', title: 'Soon dup', startMs: NOW + 20 * M },
      { key: 'b', title: 'Fresh', startMs: NOW + 30 * M },
    ],
    { a: NOW + 20 * M, old: NOW - 8 * 86400000 },
    NOW, 45 * M, 10 * M,
  );
  assert.deepEqual(send.map(c => c.key), ['b']);
  assert.ok(!('old' in notified) && notified.a && notified.b);
});

test('phrasing counts down and back up from the start', () => {
  assert.equal(phraseUntil(NOW, NOW + 20 * M), 'in 20 minutes');
  assert.equal(phraseUntil(NOW, NOW + (2 * H + 5 * M)), 'in 2h 5m');
  assert.equal(phraseUntil(NOW, NOW + 2 * H), 'in 2 hours');
  assert.equal(phraseUntil(NOW, NOW - 5 * M), 'started 5 minutes ago');
  assert.equal(phraseUntil(NOW, NOW - 2 * H), 'live now');
});
