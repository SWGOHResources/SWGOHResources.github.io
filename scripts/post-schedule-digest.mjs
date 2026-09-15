// Posts the site's daily schedule to Discord — the same surfaces the
// homepage shows: GAC status, guild Today/Tomorrow, conquest position,
// and the live events starting/ending that game day.
//
// Runs daily after the 18:00 UTC changeover (.github/workflows/digest.yml)
// plus on demand via workflow_dispatch. Needs no Comlink: it reads the
// committed assets/data/live-events.json snapshot (refreshed every 4h by
// the live-events job) and computes rotation state with the site's own
// config.js + time.js, so the post can never drift from the page.
//
// Dedupe: assets/data/digest-state.json records the last posted era day.
// Missing state (first run) posts immediately as an inaugural proof.
// Posts to DISCORD_EVENT_WEBHOOK_URL; without it the job tracks state
// and skips notify gracefully.
//
// Run: npm run digest:post
//   DRY_RUN=1 npm run digest:post   (print payload, write nothing)

import fs from 'node:fs/promises';
import { readFileSync as fsSyncRead } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url);
const LIVE_PATH = new URL('../assets/data/live-events.json', import.meta.url);
const STATE_PATH = new URL('../assets/data/digest-state.json', import.meta.url);
const DAY_MS = 86400000;

const KIND_LABEL = {
  marquee: '🏷️ Marquee',
  'era-challenge': '🏷️ Era Challenge',
  journey: '🗺️ Journey',
  conquest: '🟣 Conquest',
  gac: '🔴 GAC',
  fleet: '🚢 Fleet',
  assault: '⚔️ Assault',
  omega: '🟠 Omega',
  'smugglers-run': '📦 Smugglers Run',
  'credit-heist': '💰 Credit Heist',
  'daily-challenge': '🟣 Daily',
  'proving-grounds': '🟣 Proving Grounds',
  event: '🎲 Event',
};

const ts = ms => `<t:${Math.floor(ms / 1000)}:F>`;

// Pure payload builder — unit-tested with fixture status objects.
export function formatDigest({ eraDay, eraLength, dateLabel, gac, guildToday, guildTomorrow, conquest, starting, ending }) {
  const fields = [
    { name: '⚔️ GAC', value: `${gac.main} — ${gac.sub}`, inline: false },
    { name: '🛡️ Guild Today', value: guildToday, inline: true },
    { name: '🔭 Guild Tomorrow', value: guildTomorrow, inline: true },
  ];
  if (conquest) fields.push({ name: '🟣 Conquest', value: conquest, inline: false });
  const evLine = e => `${KIND_LABEL[e.kind] ?? '🎲 Event'} ${e.name} — ${ts(e.startMs)}`;
  if (starting.length) {
    fields.push({ name: `🟢 Starting today (${starting.length})`, value: starting.slice(0, 8).map(evLine).join('\n').slice(0, 1000), inline: false });
  }
  if (ending.length) {
    const endLine = e => `${KIND_LABEL[e.kind] ?? '🎲 Event'} ${e.name} — ends ${ts(e.endMs)}`;
    fields.push({ name: `🔴 Ending today (${ending.length})`, value: ending.slice(0, 8).map(endLine).join('\n').slice(0, 1000), inline: false });
  }
  if (!starting.length && !ending.length) {
    fields.push({ name: '📅 Events', value: 'No live events start or end today.', inline: false });
  }
  return {
    embeds: [{
      title: `SWGOH Today — Era Day ${eraDay}/${eraLength} (${dateLabel})`,
      color: 0x5865F2,
      fields: fields.slice(0, 10),
      footer: { text: 'SWGOH Resources daily digest' },
      timestamp: new Date().toISOString(),
    }],
  };
}

function loadEngine() {
  const base = new URL('../assets/js/', import.meta.url);
  const configSource = fsSyncRead(new URL('config.js', base), 'utf8');
  const timeSource = fsSyncRead(new URL('time.js', base), 'utf8');
  const storage = new Map([['swgoh-tz', 'UTC']]);
  const context = {
    console, Intl, Date, Math, Number, String, Object, Array, Set, parseInt,
    ev: (icon, label) => ({ icon, label }),
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  vm.createContext(context);
  vm.runInContext(configSource, context);
  vm.runInContext(timeSource, context);
  return src => vm.runInContext(src, context);
}

async function main() {
  const dry = process.env.DRY_RUN === '1';
  const run = loadEngine();
  const nowMs = Date.now();
  const st = run(`getGameStatus(${nowMs})`);
  const dayStart = st.currentDayStartMs;
  const dayEnd = dayStart + DAY_MS;

  let state = null;
  try {
    state = JSON.parse(await fs.readFile(STATE_PATH, 'utf8'));
  } catch {
    state = null;
  }
  const dayKey = `${st.eraDay}/${st.currentEraStartMs}`;
  if (state?.lastPostedDay === dayKey) {
    console.log(`DIGEST=none (already posted for ${dayKey})`);
    return;
  }

  const gac = run(`getGacStatus(getGameStatus(${nowMs}))`);
  const guildToday = run(`getGuildEventSummary(${st.episode}, ${st.dayInEp}, ${dayStart}, ${nowMs})`);
  const tmrwDayIndex = (st.eraDay % run('eraLengthDays()')) + 1;
  const tmrwEp = Math.floor((tmrwDayIndex - 1) / run('episodeLengthDays()')) + 1;
  const tmrwDayInEp = ((tmrwDayIndex - 1) % run('episodeLengthDays()')) + 1;
  const guildTomorrow = run(`getGuildEventSummary(${tmrwEp}, ${tmrwDayInEp}, ${dayStart + DAY_MS}, ${nowMs})`);
  const cq = run(`conquestInfoForDay(${st.episode}, ${st.dayInEp})`);
  const conquest = cq ? `Conquest C${cq.cNum} — Day ${cq.day} of ${cq.total}${cq.finalDay ? ' (final day)' : ''} — ${cq.note}` : null;
  const dateLabel = run(`fmtDateLongUTC(${dayStart})`);

  const snap = JSON.parse(await fs.readFile(LIVE_PATH, 'utf8'));
  const starting = [];
  const ending = [];
  for (const e of snap.events ?? []) {
    if (e.startMs >= dayStart && e.startMs < dayEnd) starting.push(e);
    else if (e.endMs > dayStart && e.endMs <= dayEnd) ending.push(e);
  }
  starting.sort((a, b) => a.startMs - b.startMs);
  ending.sort((a, b) => a.endMs - b.endMs);

  const payload = formatDigest({
    eraDay: st.eraDay,
    eraLength: run('eraLengthDays()'),
    dateLabel,
    gac: { main: String(gac.main), sub: String(gac.sub) },
    guildToday: String(guildToday),
    guildTomorrow: String(guildTomorrow),
    conquest,
    starting,
    ending,
  });

  if (dry) {
    console.log(JSON.stringify(payload, null, 1).slice(0, 3000));
    console.log(`DIGEST=preview (dayKey=${dayKey}, starting=${starting.length}, ending=${ending.length})`);
    return;
  }

  const webhook = process.env.DISCORD_EVENT_WEBHOOK_URL ?? '';
  if (!webhook) {
    console.log('DIGEST=skipped (DISCORD_EVENT_WEBHOOK_URL not set — state untouched)');
    return;
  }
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Discord -> HTTP ${res.status}`);
  await fs.writeFile(STATE_PATH, JSON.stringify({ lastPostedDay: dayKey, postedAt: nowMs }, null, 1) + '\n');
  console.log(`DIGEST=posted (dayKey=${dayKey}, starting=${starting.length}, ending=${ending.length})`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(err => {
    console.error(`digest:post failed: ${err.message}`);
    process.exit(1);
  });
}
