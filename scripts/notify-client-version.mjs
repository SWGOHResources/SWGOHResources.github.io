import { readFile, writeFile } from 'node:fs/promises';
import { APP_STORE_PAGE_URL } from './check-client-version.mjs';
import { isMain } from './is-main.mjs';

const SNAPSHOT_PATH = new URL('../assets/data/client-version.json', import.meta.url);

export function versionNotificationPayload(notification) {
  const { verdict, snapshot: cur } = notification;
  const forced = verdict === 'forced_flip' || verdict === 'both';
  const title = verdict === 'both'
    ? 'SWGOH title update: new client + server flip'
    : forced ? 'SWGOH title update now enforced'
      : 'SWGOH client update staged (not enforced yet)';
  const notes = (cur.store?.releaseNotes ?? '').slice(0, 900);
  return {
    embeds: [{
      title,
      url: APP_STORE_PAGE_URL,
      color: forced ? 0xE13232 : 0xF5C518,
      fields: [
        { name: 'App Store client', value: String(cur.store?.version ?? '?'), inline: true },
        { name: 'Released', value: String(cur.store?.releaseDate ?? 'unknown'), inline: true },
        { name: 'Server gamedata', value: String(cur.server?.gamedata ?? '?'), inline: false },
        { name: 'Server asset', value: String(cur.server?.asset ?? '?'), inline: true },
        ...(notes ? [{ name: 'Store notes', value: notes, inline: false }] : []),
      ],
      footer: { text: 'SWGOH Resources version watch' },
      timestamp: new Date(cur.checkedAt).toISOString(),
    }],
  };
}

export async function deliverVersionNotifications(snapshot, { webhook, fetchImpl = fetch, save } = {}) {
  const pending = [...(snapshot.pendingNotifications ?? [])];
  if (!webhook || !pending.length) return 0;
  if (typeof save !== 'function') throw new Error('A delivery checkpoint writer is required');
  let delivered = 0;
  while (pending.length) {
    const notification = pending[0];
    const res = await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(versionNotificationPayload(notification)),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Discord notification ${notification.id} -> HTTP ${res.status}`);
    pending.shift();
    // Persist each success, including partial delivery before a later
    // request fails. The workflow commits this file even on failure.
    await save({ ...snapshot, pendingNotifications: [...pending] });
    delivered++;
  }
  return delivered;
}

async function main() {
  const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
  const webhook = process.env.DISCORD_WEBHOOK_URL ?? '';
  if (!webhook) {
    console.log('notifications skipped: DISCORD_WEBHOOK_URL not set (queue retained)');
    return;
  }
  const delivered = await deliverVersionNotifications(snapshot, {
    webhook,
    save: next => writeFile(SNAPSHOT_PATH, JSON.stringify(next, null, 1) + '\n'),
  });
  console.log(`client notifications delivered: ${delivered}`);
}

if (isMain(import.meta.url)) {
  main().catch(err => {
    console.error(`versions:notify failed: ${err.message}`);
    process.exitCode = 1;
  });
}
