// Watches for SWGOH client (title) updates and records the current
// store + server versions in assets/data/client-version.json.
//
// Two stages are tracked, because they land at different times:
//   staged — a new client binary appears on the App Store (e.g. 0.40.6
//     showed up ~hours before the server enforced anything).
//   forced — the game server actually moves: the gamedata base version
//     (the "0.40.5" in "0.40.5:<hash>") or the assetVersion changes.
//     Routine server pushes only rotate the gamedata hash suffix — those
//     update the snapshot silently and never alert.
//
// Run: npm run versions:check
//   COMLINK_URL=http://my-host:3500 npm run versions:check
//
// CI (.github/workflows/client-watch.yml) runs this hourly, commits the
// snapshot on meaningful change, and posts to Discord when
// detectTransitions() reports a bump/flip.

const COMLINK_URL = process.env.COMLINK_URL ?? 'http://localhost:3500';
const OUT_PATH = new URL('../assets/data/client-version.json', import.meta.url);

export const APP_STORE_ID = '921022358';
export const APP_STORE_LOOKUP_URL =
  `https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=us`;
export const APP_STORE_PAGE_URL =
  `https://apps.apple.com/us/app/star-wars-galaxy-of-heroes/id${APP_STORE_ID}`;

// "0.40.5:<hash>" -> "0.40.5". The hash suffix rotates on routine
// server pushes; only a base change means a new data payload.
export function gamedataBase(v) {
  return String(v ?? '').split(':')[0];
}

// Pure transition check, unit-tested. oldSnap may be null (first run
// seeds the file and never alerts). verdict is one of:
// 'none' | 'store_bump' | 'forced_flip' | 'both'.
export function detectTransitions(oldSnap, newSnap) {
  if (!oldSnap || !newSnap) return { storeBump: false, forcedFlip: false, verdict: 'none' };
  const storeBump = Boolean(
    oldSnap.store?.version &&
    newSnap.store?.version &&
    newSnap.store.version !== oldSnap.store.version,
  );
  const oldBase = gamedataBase(oldSnap.server?.gamedata);
  const newBase = gamedataBase(newSnap.server?.gamedata);
  const baseChanged = Boolean(oldBase && newBase && oldBase !== newBase);
  const assetChanged = Boolean(
    oldSnap.server?.asset !== undefined &&
    newSnap.server?.asset !== undefined &&
    newSnap.server.asset !== oldSnap.server.asset,
  );
  // NOTE: serverVersion increments constantly and the localization
  // bundle rotates independently — neither implies a title update,
  // so both are recorded but ignored here.
  const forcedFlip = baseChanged || assetChanged;
  const verdict =
    storeBump && forcedFlip ? 'both'
    : storeBump ? 'store_bump'
    : forcedFlip ? 'forced_flip'
    : 'none';
  return { storeBump, forcedFlip, verdict };
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    ...opts,
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchStoreVersion() {
  const data = await fetchJson(APP_STORE_LOOKUP_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const r = data?.results?.[0];
  if (!r?.version) throw new Error('App Store lookup returned no version');
  return {
    version: String(r.version),
    releaseDate: r.currentVersionReleaseDate ?? null,
    releaseNotes: String(r.releaseNotes ?? '').slice(0, 1000) || null,
  };
}

async function fetchServerVersions() {
  const d = await fetchJson(`${COMLINK_URL}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: {} }),
  });
  return {
    gamedata: d.latestGamedataVersion ?? null,
    asset: d.assetVersion ?? null,
    serverVersion: d.serverVersion ?? null,
    loc: d.latestLocalizationBundleVersion ?? null,
  };
}

async function main() {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  let oldSnap = null;
  try {
    oldSnap = JSON.parse(await readFile(OUT_PATH, 'utf8'));
  } catch {
    oldSnap = null; // first run seeds the file
  }

  // Partial failure is fine: keep the last-known block for whichever
  // source flaked, so one hiccup never wipes good data or fakes a flip.
  const next = {
    checkedAt: Date.now(),
    store: oldSnap?.store ?? null,
    server: oldSnap?.server ?? null,
  };
  const errors = [];
  try {
    next.store = await fetchStoreVersion();
  } catch (err) {
    errors.push(`store: ${err.message}`);
  }
  try {
    next.server = await fetchServerVersions();
  } catch (err) {
    errors.push(`server: ${err.message}`);
  }
  if (!next.store && !next.server) {
    console.error(`versions:check failed (${errors.join('; ')}) — leaving snapshot untouched`);
    process.exit(1);
  }

  const { verdict } = detectTransitions(oldSnap, next);
  await mkdir(new URL('../assets/data/', import.meta.url), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(next, null, 1) + '\n');
  console.log(
    `versions: store=${next.store?.version ?? '?'} ` +
    `gamedata=${next.server?.gamedata ?? '?'} asset=${next.server?.asset ?? '?'} ` +
    `verdict=${verdict}${errors.length ? ` errors=[${errors.join('; ')}]` : ''}`,
  );
  console.log(`VERDICT=${verdict}`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(err => {
    console.error(`versions:check failed: ${err.message}`);
    process.exit(1);
  });
}
