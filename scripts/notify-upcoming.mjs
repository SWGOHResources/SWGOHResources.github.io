// Sends upcoming-event phone notifications via ntfy (https://ntfy.sh).
//
// Runs on a schedule in CI (.github/workflows/notify.yml) — no backend,
// no account: the workflow POSTs to an ntfy topic and the phone's ntfy
// app (Android/iOS) shows a push for each subscribed topic.
//
//   NTFY_TOPIC=... NTFY_URL=https://ntfy.sh node scripts/notify-upcoming.mjs
//   DRY_RUN=1 node scripts/notify-upcoming.mjs   # log only, send nothing
//
// What gets notified: rotation changeover markers for today + tomorrow
// whose real start instant (eventStartMs — GAC 21:00, TW/TB 17:00,
// smuggling 10:00, fleet 07:00) falls inside [now-10m, now+45m], plus
// live Comlink events from assets/data/live-events.json starting in the
// same window. TW payout is skipped (30 seconds, no event running).
//
// Dedup: sent keys persist in assets/data/notify-state.json (committed
// back by the workflow), pruned to the last 7 days — a delayed or
// retried run never double-sends.

import fs from 'node:fs';
import vm from 'node:vm';

const NTFY_URL = (process.env.NTFY_URL ?? 'https://ntfy.sh').replace(/\/+$/, '');
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const LOOKAHEAD_MS = 45 * 60 * 1000;
const CATCHUP_MS = 10 * 60 * 1000;
const STATE_PATH = new URL('../assets/data/notify-state.json', import.meta.url);
const LIVE_PATH = new URL('../assets/data/live-events.json', import.meta.url);

// Pure picker (tested): which candidate starts are new + inside the
// window. candidates: [{ key, label, startMs, detail }].
// state: { [key]: startMs }. Returns { send, notified } where notified
// is the pruned+extended state to persist.
export function collectNotifications(candidates, state, nowMs, lookaheadMs = LOOKAHEAD_MS, catchupMs = CATCHUP_MS) {
  const from = nowMs - catchupMs;
  const to = nowMs + lookaheadMs;
  const notified = {};
  for (const [key, startMs] of Object.entries(state ?? {})) {
    if (Number.isFinite(startMs) && startMs > nowMs - 7 * 86400000) notified[key] = startMs;
  }
  const send = [];
  const seen = new Set();
  for (const c of candidates ?? []) {
    if (!c || seen.has(c.key) || notified[c.key]) continue;
    seen.add(c.key);
    if (!Number.isFinite(c.startMs) || c.startMs < from || c.startMs > to) continue;
    notified[c.key] = c.startMs;
    send.push(c);
  }
  send.sort((a, b) => a.startMs - b.startMs);
  return { send, notified };
}

export function phraseUntil(nowMs, startMs) {
  const diff = startMs - nowMs;
  if (diff <= 0) {
    const m = Math.max(1, Math.floor(-diff / 60000));
    return m < 60 ? `started ${m} minute${m === 1 ? '' : 's'} ago` : 'live now';
  }
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h < 1) return `in ${Math.max(1, m)} minute${m === 1 ? '' : 's'}`;
  return m > 0 ? `in ${h}h ${m}m` : `in ${h} hour${h === 1 ? '' : 's'}`;
}

function loadEngine() {
  const base = new URL('../assets/js/', import.meta.url);
  const read = (f) => fs.readFileSync(new URL(f, base), 'utf8');
  const ctx = {
    console, Intl, Date, Math, Number, String, Object, Array, Set, parseInt,
    localStorage: { getItem: () => null, setItem: () => {} },
    ev: (icon, label) => ({ icon, label }),
  };
  vm.createContext(ctx);
  vm.runInContext(read('config.js'), ctx);
  vm.runInContext(read('time.js'), ctx);
  vm.runInContext(read('render.js'), ctx);
  return ctx;
}

function readJson(url) {
  try {
    return JSON.parse(fs.readFileSync(url, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const nowMs = Date.now();
  const ctx = loadEngine();
  const run = (src) => vm.runInContext(src, ctx);
  const live = readJson(LIVE_PATH);
  const liveList = (live?.events ?? []).map((e) => ({ id: e.id, kind: e.kind, name: e.name, startMs: e.startMs }));
  // One shared picker (render.js upcomingStarts): rotation markers at
  // their real start instants plus live events, inside the window.
  const picked = run(`upcomingStarts(getGameStatus(${nowMs}), ${JSON.stringify(liveList)}, ${nowMs}, ${LOOKAHEAD_MS}, ${CATCHUP_MS})`);
  const candidates = picked.map((c) => ({ key: c.key, title: c.title, startMs: c.startMs }));

  const state = readJson(STATE_PATH) ?? {};
  console.log(`checked ${candidates.length} upcoming starts (${liveList.length} live)`);
  const { send, notified } = collectNotifications(candidates, state, nowMs);

  if (!NTFY_TOPIC) {
    console.log(`NTFY_TOPIC not set — ${send.length} notification(s) pending, sending nothing.`);
    for (const c of send) console.log(`  [dry] ${c.title} — ${phraseUntil(nowMs, c.startMs)}`);
    return;
  }

  let sent = 0;
  for (const c of send) {
    const when = phraseUntil(nowMs, c.startMs);
    const time = new Date(c.startMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    if (DRY_RUN) {
      console.log(`[dry] ${c.title} — ${when} (${time})`);
      continue;
    }
    try {
      const res = await fetch(`${NTFY_URL}/${encodeURIComponent(NTFY_TOPIC)}`, {
        method: 'POST',
        headers: { Title: c.title, Priority: '3', Tags: 'bell' },
        body: `${c.title} — ${when} (${time})`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`sent: ${c.title} — ${when}`);
      sent++;
    } catch (err) {
      console.warn(`send failed for ${c.key} (${err.message}) — will retry next run`);
      delete notified[c.key];
    }
  }

  if (!DRY_RUN && JSON.stringify(notified) !== JSON.stringify(state)) {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ updatedAt: nowMs, notified }, null, 1) + '\n');
    console.log(`state updated (${sent} sent, ${Object.keys(notified).length} tracked)`);
  } else {
    console.log(sent === 0 && !DRY_RUN ? 'nothing to send' : 'state unchanged');
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((err) => {
    console.error(`notify failed: ${err.message}`);
    process.exit(1);
  });
}
