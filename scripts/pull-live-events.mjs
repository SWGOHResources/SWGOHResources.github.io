// Pulls live in-game events from a running swgoh-comlink service and
// writes them to assets/data/live-events.json for the static site.
//
// The site is hosted on GitHub Pages (no backend), so the browser can't
// call Comlink directly. Instead this script runs at build/refresh time:
//
//   npm run events:pull
//   COMLINK_URL=http://my-host:3500 npm run events:pull
//
// It needs a reachable Comlink instance (default http://localhost:3500):
//   docker run --name swgoh-comlink -d --env APP_NAME=my-app \
//     -p 3500:3000 ghcr.io/swgoh-utils/swgoh-comlink:latest
//
// Only time-limited scheduled events overlapping [now-1d, now+14d] are
// kept. Permanent unlocks (journeys, galactic legends, fleet preludes —
// endTime far in the future) are excluded; they never change and would
// drown the live list.

const COMLINK_URL = process.env.COMLINK_URL ?? 'http://localhost:3500';
// swgoh-ae2 asset extractor (optional — without it events keep the
// bundled fallback art). Same host layout as comlink:
//   docker run --name swgoh-ae -d -p 3123:8080 ghcr.io/swgoh-utils/swgoh-ae2:latest
const AE_URL = process.env.AE_URL ?? 'http://localhost:3123';
const LIVE_ART_DIR = new URL('../assets/img/live/', import.meta.url);
const OUT_PATH = new URL('../assets/data/live-events.json', import.meta.url);

const WINDOW_PAST_MS = 24 * 3600 * 1000;
const WINDOW_FUTURE_MS = 14 * 24 * 3600 * 1000;
const PERMANENT_DURATION_MS = 365 * 24 * 3600 * 1000;

// Strip in-game rich-text tags: colour codes like [FFC891], open/close
// tags like [c]...[/c] and [-], plus literal \n escapes from the bundle.
export function cleanName(raw) {
  return String(raw ?? '')
    .replace(/\\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Some nameKeys have no localization entry — they're code names for a
// real thing. Resolve them here instead of showing the raw key.
const NAME_OVERRIDES = [
  [/^SEASON_(\d+)_EVENT_NAME$/, m => `GAC Season ${m[1]}`],
  [/^TERRITORY_TOURNAMENT_EVENT_NAME$/, () => 'Grand Arena Championship'],
];

// Last resort for an unresolved UPPER_SNAKE key: make it readable
// ("EVENT_FOO_BAR" -> "Foo Bar"). Short all-caps tokens are kept as
// acronyms ("GAC", "TW"); longer words are title-cased.
export function prettifyCodeName(key) {
  return String(key ?? '')
    .split('_')
    .filter(w => w && !/^EVENT$/i.test(w))
    .map(w => (/^(GAC|TW|TB|CQ|GL|DS|LS)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
    .trim();
}

// Display names use Title Case — the game bundle ships them in shouty
// caps ("BLADE AND BASTION"). Known acronyms and numerals stay as-is,
// small words stay lowercase unless first.
const TITLE_KEEP = new Set(['GAC', 'TW', 'TB', 'CQ', 'GL', 'DS', 'LS', 'II', 'III', 'IV', 'V', 'VI']);
const TITLE_SMALL = new Set(['and', 'of', 'the', 'a', 'an', 'in', 'on', 'for', 'to', 'with', 'vs', 'vs.']);
export function titleCase(s) {
  return String(s ?? '')
    .split(' ')
    .map((w, i) => {
      if (i > 0 && TITLE_SMALL.has(w.toLowerCase())) return w.toLowerCase();
      if (TITLE_KEEP.has(w.toUpperCase()) && w === w.toUpperCase()) return w;
      const low = w.toLowerCase();
      return low.replace(/[a-z]/, c => c.toUpperCase());
    })
    .join(' ');
}

// Redundant filler the type pill already conveys — trimmed so names
// read like event names ("Contraband Cargo", not
// "Contraband Cargo Resource Event"). Longest match first.
const NAME_TRIMS = [
  ' Special Marquee Event',
  ' Journey Guide Fleet Mastery',
  ' Resource Event',
  ' Special Event',
];
export function simplifyName(name) {
  let s = String(name ?? '');
  for (const suffix of NAME_TRIMS) {
    if (s.endsWith(suffix)) {
      s = s.slice(0, -suffix.length);
      break;
    }
  }
  return s.trim();
}

// Display names are Title Cased — the game bundle ships them in shouty
// caps ("BLADE AND BASTION"), which reads badly on the cards.
export function resolveName(nameKey, nameMap, fallbackId) {
  let raw;
  if (nameMap.has(nameKey)) raw = cleanName(nameMap.get(nameKey));
  else {
    raw = null;
    for (const [re, fmt] of NAME_OVERRIDES) {
      const m = re.exec(String(nameKey ?? ''));
      if (m) { raw = fmt(m); break; }
    }
    if (raw == null) {
      if (/^[A-Z0-9_]{4,}$/.test(String(nameKey ?? ''))) raw = prettifyCodeName(nameKey);
      else raw = cleanName(nameKey) || cleanName(fallbackId) || String(fallbackId ?? '');
    }
  }
  return simplifyName(titleCase(raw));
}
export function eventKind(id) {
  const s = String(id ?? '');
  if (/^EVENT_MARQUEE_/.test(s)) return 'marquee';
  if (/^EC\d+_/.test(s) || /ERACHALLENGE|ERA_CHALLENGE/.test(s)) return 'era-challenge';
  if (/FLEET_MASTERY|shipevent_SC/.test(s)) return 'fleet';
  if (/^EVENT_ASSAULT_/.test(s)) return 'assault';
  if (/^EVENT_OMEGA_BATTLES_/.test(s)) return 'omega';
  if (/^EVENT_RESOURCE_SMUGGLERS_RUN/.test(s)) return 'smugglers-run';
  if (/^EVENT_CREDIT_HEIST/.test(s)) return 'credit-heist';
  if (/^CHAMPIONSHIPS_GRAND_ARENA/.test(s)) return 'gac';
  if (/^GA\d+_SEASON_/.test(s)) return 'gac';
  if (/^CONQUEST_/.test(s)) return 'conquest';
  if (/^challenge_/.test(s)) return 'daily-challenge';
  if (/PROVING_GROUND/i.test(s)) return 'proving-grounds';
  if (/JOURNEY|HERO_|GALACTICLEGEND|LEGEND/i.test(s)) return 'journey';
  return 'event';
}

// Unit the event is for, from the texture name when Comlink doesn't
// say (only true marquees carry marqueeUnitBaseId). Lets the page
// match journey-ish events to their rotation slots by unit instead of
// fragile name guessing (tex.events_darthjarjar -> DARTHJARJAR).
// Generic leftovers too short to be a unit resolve to undefined.
export function unitFromTexture(assetName) {
  const s = String(assetName ?? '').replace(/^tex\./i, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const prefix of ['EVENTSICON', 'EVENTS', 'EVENT', 'ICON']) {
    if (s.startsWith(prefix) && s.length > prefix.length + 3) return s.slice(prefix.length);
  }
  return undefined;
}

// Keep one entry per event id: the instance overlapping the window,
// preferring the instance closest to now. Permanent events (duration
// over a year) are dropped. GAC is dropped too: Comlink only exposes
// the season container / championship window with no round info, while
// the page renders per-round GAC cards from its own cycle config.
export function selectLiveEvents(gameEvents, nameMap, nowMs) {
  const from = nowMs - WINDOW_PAST_MS;
  const to = nowMs + WINDOW_FUTURE_MS;
  const out = [];
  for (const e of gameEvents ?? []) {
    let best = null;
    for (const inst of e.instance ?? []) {
      const s = Number(inst.startTime);
      const t = Number(inst.endTime);
      if (!Number.isFinite(s) || !Number.isFinite(t)) continue;
      if (t - s > PERMANENT_DURATION_MS) continue; // permanent unlock
      if (t < from || s > to) continue; // outside the window
      if (!best || Math.abs(s - nowMs) < Math.abs(best.startMs - nowMs)) {
        best = { startMs: s, endMs: t };
      }
    }
    if (!best) continue;
    const kind = eventKind(e.id);
    if (kind === 'gac') continue; // covered by the hardcoded round cards
    // Daily filler, not events: rotating credit/ability/gear challenges
    // and ship material dailies. They'd noise up every single day.
    if (/^(challenge_|shipevent_)/.test(e.id)) continue;
    out.push({
      id: e.id,
      name: resolveName(e.nameKey, nameMap, e.id),
      kind,
      // Unit the event is for (marquee/era-challenge portraits, and
      // journey-ish events via their texture name). Used by the page to
      // pick the exact card art and to match rotation slots to live
      // events; absent for other events.
      unit: e.marqueeUnitBaseId || unitFromTexture(e.image) || unitFromTexture(e.icon) || undefined,
      // Game texture names ("tex.events_x" -> asset "events_x") for the
      // art pull below. Image first, icon as backup. Internal — stripped
      // before writing the JSON.
      assetName: String(e.image || '').replace(/^tex\./, '') || undefined,
      iconAsset: String(e.icon || '').replace(/^tex\./, '') || undefined,
      startMs: best.startMs,
      endMs: best.endMs,
      live: best.startMs <= nowMs && nowMs <= best.endMs,
    });
  }
  out.sort((a, b) => a.startMs - b.startMs);
  return out;
}

export function artSlug(assetName) {
  return (
    String(assetName ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '.png'
  );
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Per-event art overrides, tried before the image/icon textures.
// Used when the event references atlas sprites that aren't downloadable
// (e.g. conquest) — these are hand-verified game assets for those events.
const ART_OVERRIDES = {
  CONQUEST_VOL24: ['conquestpass_promo_basic_01', 'conquestpass_promo_plus_01'],
};

// Downloads each event's game texture via swgoh-ae2 into
// assets/img/live/ and sets e.art (path relative to IMG_BASE).
// The directory is a persistent library: files already on disk are
// reused as-is (events rerun, so yesterday's art is tomorrow's), and
// nothing is ever auto-deleted — a flaky download can never wipe good
// art or lock in a generic fallback the way re-downloading could.
// opts override the directory + extractor URL (tests).
// opts override the directory + extractor URL (tests). artDir accepts
// a file: URL object, a file: URL string, or a plain path — a URL
// *string* must never reach mkdir/readFile directly, or the fs treats
// "file:///tmp/…" as a literal relative path and litters the repo.
export async function pullEventArt(events, assetVersion, opts = {}) {
  const { pathToFileURL } = await import('node:url');
  const rawDir = opts.artDir ?? LIVE_ART_DIR;
  const dirUrl = rawDir instanceof URL ? rawDir
    : String(rawDir).startsWith('file:') ? new URL(String(rawDir))
    : pathToFileURL(String(rawDir));
  const dir = dirUrl;
  const aeUrl = opts.aeUrl ?? AE_URL;
  const { mkdir, writeFile, readFile } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
  async function onDisk(file) {
    try {
      const buf = await readFile(new URL(file, dir));
      return buf.subarray(0, 8).equals(PNG_MAGIC) ? buf : null;
    } catch {
      return null;
    }
  }
  // Per-event ordered candidates: overrides, then image, then icon.
  // Processed level by level (every event's primary first) so a shared
  // fallback icon can never claim an event whose own texture simply
  // hasn't been tried yet.
  const lists = (events ?? []).map(e => ({
    e,
    cands: [...(ART_OVERRIDES[e.id] ?? []), e.assetName, e.iconAsset].filter(Boolean),
  }));
  const fetched = new Map(); // assetName -> file (downloaded this run)
  let aeDown = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function fetchAsset(assetName) {
    // CG-side downloads flake occasionally — retry before giving up on
    // the specific texture (the caller then tries the icon, then the
    // bundled fallback, so one hiccup never locks in generic art).
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(
          `${aeUrl}/Asset/single?version=${assetVersion}&assetName=${encodeURIComponent(assetName)}`,
        );
        const buf = Buffer.from(await res.arrayBuffer());
        if (res.ok && buf.subarray(0, 8).equals(PNG_MAGIC)) return buf;
        console.warn(`art: ${assetName} attempt ${attempt} -> bad response (HTTP ${res.status}, ${buf.length}b)`);
      } catch (err) {
        console.warn(`art: ${assetName} attempt ${attempt} failed (${err.message})`);
      }
      await sleep(2000 * attempt);
    }
    return null;
  }
  for (let level = 0; ; level++) {
    let any = false;
    for (const { e, cands } of lists) {
      if (e.art || level >= cands.length) continue;
      any = true;
      const assetName = cands[level];
      const file = artSlug(assetName);
      if (fetched.get(assetName) === file || await onDisk(file)) {
        fetched.set(assetName, file);
        e.art = `live/${file}`;
        continue;
      }
      if (aeDown) continue;
      // Pace bundle downloads: rapid-fire pulls flake on the CG side.
      await sleep(2000);
      let buf = null;
      try {
        buf = await fetchAsset(assetName);
      } catch (err) {
        console.warn(`art: extractor unreachable at ${aeUrl} (${err.message}) — keeping fallback art`);
        aeDown = true;
      }
      if (buf) {
        await writeFile(new URL(file, dir), buf);
        fetched.set(assetName, file);
        // Path relative to IMG_BASE ('assets/img/'), like every other
        // art reference on the page.
        e.art = `live/${file}`;
      }
    }
    if (!any) break;
  }
  for (const e of events ?? []) {
    if (!e.art) delete e.art;
    delete e.assetName;
    delete e.iconAsset;
  }
  return events;
}

// Episode pass premium emblem for the changeover/end-of-era cards,
// which have no live event of their own. Picks the newest
// icon_episode_era_premium_NN texture so new eras adopt automatically —
// no config edits, no hand-added files. Re-downloads every pull — one
// tiny file — and never throws: a failed refresh keeps the committed
// file and the pull still succeeds.
export async function ensureEraIconArt(assetVersion, opts = {}) {
  const aeUrl = opts.aeUrl ?? AE_URL;
  const { pathToFileURL } = await import('node:url');
  const rawDir = opts.artDir ?? LIVE_ART_DIR;
  const dirUrl = rawDir instanceof URL ? rawDir
    : String(rawDir).startsWith('file:') ? new URL(String(rawDir))
    : pathToFileURL(String(rawDir));
  try {
    const listRes = await fetch(`${aeUrl}/Asset/list?version=${assetVersion}`);
    if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
    const names = await listRes.json();
    let best = null;
    for (const n of Array.isArray(names) ? names : []) {
      const m = /^icon_episode_era_premium_(\d+)$/.exec(String(n || ''));
      if (m && (!best || Number(m[1]) > Number(best[1]))) best = m;
    }
    if (!best) throw new Error('no icon_episode_era_premium_NN texture listed');
    const res = await fetch(
      `${aeUrl}/Asset/single?version=${assetVersion}&assetName=${encodeURIComponent(best[0])}`,
    );
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new Error(`bad response (HTTP ${res.status}, ${buf.length}b)`);
    }
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(dirUrl, { recursive: true });
    await writeFile(new URL('era-icon.png', dirUrl), buf);
    console.log(`art: era icon -> era${best[1]} (${(buf.length / 1024).toFixed(0)}kb)`);
    return true;
  } catch (err) {
    console.warn(`art: era icon refresh skipped (${err.message}) — keeping committed file`);
    return false;
  }
}

async function post(path, body) {
  const res = await fetch(`${COMLINK_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const nowMs = Date.now();
  console.log(`comlink: ${COMLINK_URL}`);

  const metadata = await post('/metadata', { payload: {} });
  const gameDataVersion = metadata.latestGamedataVersion;
  const locVersion = metadata.latestLocalizationBundleVersion;
  console.log(`gamedata: ${gameDataVersion} / loc: ${locVersion}`);

  const [{ gameEvent }, loc] = await Promise.all([
    post('/getEvents', { enums: false }),
    post('/localization', {
      payload: { id: `${locVersion}:ENG_US` },
      unzip: true,
      enums: false,
    }),
  ]);

  const nameMap = new Map();
  for (const line of String(loc['Loc_ENG_US.txt'] ?? '').split('\n')) {
    const i = line.indexOf('|');
    if (i > 0) nameMap.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }

  const events = selectLiveEvents(gameEvent, nameMap, nowMs);
  const live = events.filter(e => e.live).length;
  console.log(`events: ${gameEvent.length} total -> ${events.length} scheduled (${live} live now)`);

  await pullEventArt(events, metadata.assetVersion);
  const withArt = events.filter(e => e.art).length;
  console.log(`art: ${withArt}/${events.length} pulled game textures`);

  await ensureEraIconArt(metadata.assetVersion);

  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(new URL('../assets/data/', import.meta.url), { recursive: true });
  await writeFile(
    OUT_PATH,
    JSON.stringify({ pulledAt: nowMs, gameDataVersion, events }, null, 1) + '\n',
  );
  console.log(`wrote ${new URL(OUT_PATH).pathname}`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(err => {
    console.error(`events:pull failed: ${err.message}`);
    console.error(`Is comlink running? COMLINK_URL=${COMLINK_URL}`);
    process.exit(1);
  });
}
