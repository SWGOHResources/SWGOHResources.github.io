// Posts the site's daily schedule to Discord as a status embed followed
// by one message per live event — the same surfaces the homepage shows.
// Message 1 (status): era, GAC, TB, TW, conquest — short labeled fields
// in the style of the client-version alerts. Messages 2..N: one embed per
// event starting/ending that game day, each carrying the event's own
// artwork as the thumbnail (served from this repo's Pages site).
//
// Runs daily just after the 18:00 UTC game-day changeover
// (.github/workflows/digest.yml)
// plus on demand via workflow_dispatch. Needs no Comlink: rotation state
// comes from the site's own config.js + time.js and events from the
// committed assets/data/live-events.json snapshot, so posts can never
// drift from the page. One post set per era day via
// assets/data/digest-state.json (missing state posts immediately).
// Without DISCORD_EVENT_WEBHOOK_URL the job skips notify gracefully.
//
// Run: npm run digest:post
//   DRY_RUN=1 npm run digest:post   (print payloads, change nothing)

import fs from 'node:fs/promises';
import { readFileSync as fsSyncRead } from 'node:fs';
import vm from 'node:vm';

const LIVE_PATH = new URL('../assets/data/live-events.json', import.meta.url);
const STATE_PATH = new URL('../assets/data/digest-state.json', import.meta.url);
const DAY_MS = 86400000;
const SITE_URL = (process.env.SITE_URL ?? 'https://swgohresources.github.io').replace(/\/$/, '');
const MAX_EVENT_POSTS = 10;

const KIND_LABEL = {
  marquee: 'Marquee',
  'era-challenge': 'Era Challenge',
  journey: 'Journey Guide',
  conquest: 'Conquest',
  gac: 'GAC',
  fleet: 'Fleet Mastery',
  assault: 'Assault Battles',
  omega: 'Omega Battles',
  'smugglers-run': 'Smugglers Run',
  'credit-heist': 'Credit Heist',
  'daily-challenge': 'Daily Challenge',
  'proving-grounds': 'Proving Grounds',
  event: 'Event',
};

const KIND_COLOR = {
  marquee: 0xDD7B3B,
  'era-challenge': 0xDD7B3B,
  journey: 0xDD7B3B,
  conquest: 0x9686D6,
  // Proving Grounds + daily challenges wear the conquest family's
  // purple on the site (see liveRotationIcon/categoryFor); GAC its red.
  'proving-grounds': 0x9686D6,
  'daily-challenge': 0x9686D6,
  gac: 0xEF4444,
  fleet: 0x4F8FE0,
  assault: 0xDD7B3B,
  omega: 0xDD7B3B,
  'smugglers-run': 0xE0A552,
  'credit-heist': 0xE0A552,
  event: 0x56B8AD,
};

const ts = ms => `<t:${Math.floor(ms / 1000)}:F>`;
const artUrl = art => (art ? `${SITE_URL}/assets/img/${art}` : null);

// Status embed — short labeled rows in related pairs, mirroring the
// client-version alert layout. Pure and unit-tested. shownCount caps
// the "details follow" line: only MAX_EVENT_POSTS embeds are posted,
// so a busy day says how many were trimmed instead of implying all
// eventCount follow.
export function formatStatusPayload({ eraDay, eraLength, dateLabel, era, gac, tb, tw, conquest, eventCount, shownCount }) {
  const fields = [
    { name: 'Era', value: era, inline: true },
    { name: 'GAC', value: gac, inline: true },
    { name: 'Territory Battle', value: tb, inline: true },
    { name: 'Territory War', value: tw, inline: true },
  ];
  if (conquest) fields.push({ name: 'Conquest', value: conquest, inline: false });
  const shown = Number.isFinite(shownCount) ? shownCount : eventCount;
  const details = shown < eventCount ? ` — first ${shown} follow` : ' — details follow';
  return {
    embeds: [{
      title: `SWGOH Status — Era Day ${eraDay}/${eraLength} (${dateLabel})`,
      description: eventCount
        ? `${eventCount} event${eventCount === 1 ? '' : 's'} start${eventCount === 1 ? 's' : ''} today${details}.`
        : 'Quiet day — no events start today.',
      color: 0x5865F2,
      fields,
      footer: { text: 'SWGOH Resources daily status' },
      timestamp: new Date().toISOString(),
    }],
  };
}

// One message per event that starts today: related facts in a neat row
// (type / start / end) plus the event's full artwork. Pure and tested.
export function formatEventPayload(e) {
  const kind = KIND_LABEL[e.kind] ?? 'Event';
  const img = artUrl(e.art);
  return {
    embeds: [{
      title: e.name,
      color: KIND_COLOR[e.kind] ?? 0x56B8AD,
      fields: [
        { name: 'Type', value: kind, inline: true },
        { name: 'Starts', value: ts(e.startMs), inline: true },
        { name: 'Ends', value: ts(e.endMs), inline: true },
      ],
      ...(img ? { image: { url: img } } : {}),
      footer: { text: 'SWGOH Resources' },
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

  const snap = JSON.parse(await fs.readFile(LIVE_PATH, 'utf8'));
  const liveStarts = (snap.events ?? []).map(e => ({ startMs: e.startMs, endMs: e.endMs }));
  // The posted day is the latest day (never before the in-game day)
  // with an event that has started — the same default the homepage
  // explorer opens on. Just after the 18:00 UTC changeover that is the
  // new game day; its morning starts are still ahead, so the offset is
  // 0 and the post covers the fresh day.
  const postedOffset = run(`defaultExplorerOffset(${nowMs}, ${st.currentDayStartMs}, ${JSON.stringify(liveStarts)})`);
  const off = Number.isFinite(postedOffset) ? Math.max(0, postedOffset) : 0;
  const dayStart = st.currentDayStartMs + (off * DAY_MS);
  const dayEnd = dayStart + DAY_MS;
  const eraLen = run('eraLengthDays()');
  const postedEraDay = ((st.eraDay - 1 + off) % eraLen + eraLen) % eraLen + 1;
  const postedEp = Math.floor((postedEraDay - 1) / run('episodeLengthDays()')) + 1;
  const postedDayInEp = ((postedEraDay - 1) % run('episodeLengthDays()')) + 1;

  let state = null;
  try {
    state = JSON.parse(await fs.readFile(STATE_PATH, 'utf8'));
  } catch {
    state = null;
  }
  const dayKey = `${postedEraDay}/${st.currentEraStartMs}`;
  if (state?.lastPostedDay === dayKey) {
    console.log(`DIGEST=none (already posted for ${dayKey})`);
    return;
  }

  const eraLength = eraLen;
  const eraName = run(`typeof ERA_NAME !== 'undefined' ? ERA_NAME : 'Current Era'`);
  // Rollover day (the last game day closes at this changeover) — the
  // same date the Important Dates card and the hero end label show.
  const eraEndMs = st.currentEraStartMs + eraLength * DAY_MS;
  const era = `${eraName} — Day ${postedEraDay}/${eraLength} · ends ${run(`fmtDayMonthUTC(${eraEndMs})`)}`;

  const gac = run(`getGacStatus(getGameStatus(${nowMs}))`);
  const gacLine = `${gac.main} — ${gac.sub}`;

  const phase = run(`getGuildPhaseInfo(getGameStatus(${nowMs}))`);
  let tb = 'Between runs';
  let tw = 'Intermission';
  if (phase?.type === 'tb') {
    tb = phase.complete
      ? 'Rise of the Empire complete'
      : `Rise of the Empire — Phase ${(phase.phaseIndex ?? 0) + 1} of ${phase.phases ?? 6}`;
  } else if (phase?.type === 'tw') {
    const labels = run('TW_PHASE_LABELS');
    tw = phase.complete ? 'Complete' : `TW ${labels[phase.phaseIndex] ?? ''} phase`.trim();
  }

  const cq = run(`conquestInfoForDay(${postedEp}, ${postedDayInEp})`);
  const conquest = cq ? `C${cq.cNum} — Day ${cq.day} of ${cq.total}${cq.finalDay ? ' (final day)' : ''} — ${cq.note}` : null;
  const dateLabel = run(`fmtDateLongUTC(${dayStart})`);

  // Starts only: ending-soon events are yesterday's news, not today's.
  const todays = [];
  for (const e of snap.events ?? []) {
    if (e.startMs >= dayStart && e.startMs < dayEnd) todays.push(e);
  }
  todays.sort((a, b) => a.startMs - b.startMs);
  const listed = todays.slice(0, MAX_EVENT_POSTS);

  const status = formatStatusPayload({
    eraDay: postedEraDay, eraLength, dateLabel, era,
    gac: gacLine, tb, tw, conquest, eventCount: todays.length, shownCount: listed.length,
  });
  const posts = [status, ...listed.map(formatEventPayload)];

  if (dry) {
    for (const p of posts) console.log(JSON.stringify(p).slice(0, 1200));
    console.log(`DIGEST=preview (dayKey=${dayKey}, posts=${posts.length})`);
    return;
  }

  const webhook = process.env.DISCORD_EVENT_WEBHOOK_URL ?? '';
  if (!webhook) {
    console.log('DIGEST=skipped (DISCORD_EVENT_WEBHOOK_URL not set — state untouched)');
    return;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (const [i, payload] of posts.entries()) {
    if (i > 0) await sleep(400);
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Discord post ${i + 1}/${posts.length} -> HTTP ${res.status}`);
  }
  await fs.writeFile(STATE_PATH, JSON.stringify({ lastPostedDay: dayKey, postedAt: nowMs, posts: posts.length }, null, 1) + '\n');
  console.log(`DIGEST=posted (dayKey=${dayKey}, posts=${posts.length})`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(err => {
    console.error(`digest:post failed: ${err.message}`);
    process.exit(1);
  });
}
