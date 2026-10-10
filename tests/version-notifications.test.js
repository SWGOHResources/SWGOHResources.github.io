import assert from 'node:assert/strict';
import test from 'node:test';
import { queueVersionNotifications } from '../scripts/check-client-version.mjs';
import { deliverVersionNotifications, versionNotificationPayload } from '../scripts/notify-client-version.mjs';

const snapshot = (version, asset = 1) => ({
  checkedAt: Date.parse('2026-10-10T12:00:00Z'),
  store: { version, releaseDate: '2026-10-10', releaseNotes: 'Notes' },
  server: { gamedata: '0.40.6:hash', asset },
});

test('a failed alert stays queued even after observation is committed', async () => {
  const old = snapshot('1');
  const observed = snapshot('2');
  observed.pendingNotifications = queueVersionNotifications(old, observed);
  let saved = observed;
  await assert.rejects(deliverVersionNotifications(observed, {
    webhook: 'https://example.invalid/test',
    fetchImpl: async () => ({ ok: false, status: 503 }),
    save: async next => { saved = next; },
  }), /HTTP 503/);
  const nextRun = { ...snapshot('2'), pendingNotifications: queueVersionNotifications(saved, snapshot('2')) };
  assert.equal(nextRun.pendingNotifications.length, 1);
  assert.equal(nextRun.pendingNotifications[0].id, observed.pendingNotifications[0].id);
  let requests = 0;
  const count = await deliverVersionNotifications(nextRun, {
    webhook: 'https://example.invalid/test',
    fetchImpl: async () => { requests++; return { ok: true }; },
    save: async next => { saved = next; },
  });
  assert.equal(count, 1);
  assert.equal(requests, 1);
  assert.deepEqual(saved.pendingNotifications, []);
});

test('partial successes are checkpointed and retry only the remaining alerts', async () => {
  const first = snapshot('2');
  first.pendingNotifications = queueVersionNotifications(snapshot('1'), first);
  const second = snapshot('3', 2);
  second.pendingNotifications = queueVersionNotifications(first, second);
  assert.equal(second.pendingNotifications.length, 2);
  let saved = second, calls = 0;
  await assert.rejects(deliverVersionNotifications(second, {
    webhook: 'https://example.invalid/test',
    fetchImpl: async () => ({ ok: ++calls === 1, status: 429 }),
    save: async next => { saved = next; },
  }), /HTTP 429/);
  assert.equal(saved.pendingNotifications.length, 1);
  assert.equal(saved.pendingNotifications[0].snapshot.store.version, '3');
  const bodies = [];
  await deliverVersionNotifications(saved, {
    webhook: 'https://example.invalid/test',
    fetchImpl: async (url, opts) => { bodies.push(JSON.parse(opts.body)); return { ok: true }; },
    save: async next => { saved = next; },
  });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].embeds[0].fields[0].value, '3');
  assert.deepEqual(saved.pendingNotifications, []);
});

test('queue preserves pending alerts without duplicating a transition', () => {
  const next = snapshot('2');
  const pending = queueVersionNotifications(snapshot('1'), next);
  const old = { ...snapshot('1'), pendingNotifications: pending };
  assert.equal(queueVersionNotifications(old, next).length, 1);
  assert.deepEqual(queueVersionNotifications(null, next), []);
  assert.equal(queueVersionNotifications({ ...next, pendingNotifications: pending }, next).length, 1);
});

test('missing webhook retains the queue and checkpoint failures stay retryable', async () => {
  const cur = snapshot('2');
  cur.pendingNotifications = queueVersionNotifications(snapshot('1'), cur);
  assert.equal(await deliverVersionNotifications(cur, { fetchImpl: () => { throw Error('must not post'); } }), 0);
  await assert.rejects(deliverVersionNotifications(cur, {
    webhook: 'https://example.invalid/test',
    fetchImpl: async () => ({ ok: true }),
    save: async () => { throw Error('disk failure'); },
  }), /disk failure/);
  assert.equal(cur.pendingNotifications.length, 1);
});

test('delayed alerts retain the original transition details', () => {
  const cur = snapshot('2', 2);
  const notification = queueVersionNotifications(snapshot('1'), cur)[0];
  const payload = versionNotificationPayload(notification);
  assert.match(payload.embeds[0].title, /new client \+ server flip/);
  assert.equal(payload.embeds[0].timestamp, new Date(cur.checkedAt).toISOString());
  assert.equal(payload.embeds[0].fields[0].value, '2');
});
