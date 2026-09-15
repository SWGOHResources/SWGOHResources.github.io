// Diffs watched game-data files between title updates and reports what a
// flip brought: new packs, new units/art, new journeys, reward changes.
//
// Reads the enforced gamedata version from assets/data/client-version.json,
// downloads the same files from swgoh-utils/gamedata, and compares entry
// hashes against assets/data/gamedata-watch/*.json snapshots.
//
// Outcome (printed as CONTENT=<...> for the workflow):
//   diff    — real additions/changes found, snapshots + content-report.json
//             written, new art pulled.
//   none    — files match the snapshots, nothing written.
//   pending — gamedata repo hasn't synced to the enforced version yet;
//             nothing written, next hourly run retries.
//   seeded  — no snapshots existed; baselines written, never alerts.
//
// Compares canonical (key-sorted) hashes, so field reorder churn can't
// fake a change. Routine hash-suffix rotations with identical entries
// report none and write nothing (no commit churn).
//
// Run (only needed on forced flips; CI gates on the version verdict):
//   npm run content:diff
//   COMLINK_URL=... AE_URL=... SITE_URL=https://<org>.github.io npm run content:diff

import { createHash } from 'node:crypto';
import { artSlug, prettifyCodeName } from './pull-live-events.mjs';

const COMLINK_URL = process.env.COMLINK_URL ?? 'http://localhost:3500';
const AE_URL = process.env.AE_URL ?? 'http://localhost:3123';
const SITE_URL = (process.env.SITE_URL ?? 'https://swgohresources.github.io').replace(/\/$/, '');
const WATCH_URL = file =>
  `https://raw.githubusercontent.com/swgoh-utils/gamedata/main/${file}`;
const VERSIONS_PATH = new URL('../assets/data/client-version.json', import.meta.url);
const WATCH_DIR = new URL('../assets/data/gamedata-watch/', import.meta.url);
const ART_DIR = new URL('../assets/img/new/', import.meta.url);
const REPORT_PATH = new URL('../assets/data/content-report.json', import.meta.url);

// kind drives the Discord sections: packs | units | journeys | rewards.
const WATCHED = [
  { file: 'mysteryBox.json', kind: 'packs', idKeys: ['id'] },
  { file: 'galacticBundle.json', kind: 'packs', idKeys: ['id'] },
  { file: 'powerUpBundle.json', kind: 'packs', idKeys: ['id'] },
  { file: 'lightspeedToken.json', kind: 'packs', idKeys: ['id'] },
  { file: 'units_gas.json', kind: 'units', idKeys: ['baseId'] },
  { file: 'unitGuideDefinition.json', kind: 'journeys', idKeys: ['unitBaseId'] },
  { file: 'conquestDefinition.json', kind: 'rewards', idKeys: ['id'] },
  { file: 'conquestMission.json', kind: 'rewards', idKeys: ['id'] },
  { file: 'seasonRewardTable.json', kind: 'rewards', idKeys: ['id'] },
  { file: 'episodeDefinition.json', kind: 'rewards', idKeys: ['id'] },
  { file: 'table.json', kind: 'rewards', idKeys: ['id'] },
];

const MAX_LIST = 20; // per-section ids kept in the report
const MAX_ART = 8; // portraits pulled per flip

// Key-sorted canonical form so Serializable-equal entries hash equal.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function entryHash(entry) {
  return createHash('sha1').update(canonical(entry)).digest('hex').slice(0, 12);
}

// Entries are list items keyed by id/baseId/unitBaseId; a top-level dict
// (episodeDefinition) is treated as id -> value sections.
export function normalizeEntries(data, idKeys) {
  if (Array.isArray(data)) {
    const out = [];
    for (const e of data) {
      if (!e || typeof e !== 'object') continue;
      const key = idKeys.map(k => e[k]).find(k => k !== undefined && k !== null);
      if (key === undefined) continue;
      out.push({ key: String(key), entry: e });
    }
    return out;
  }
  if (data && typeof data === 'object') {
    return Object.entries(data).map(([key, entry]) => ({ key: String(key), entry }));
  }
  return [];
}

// Snapshot payload: sorted hash multisets per key (see diffEntries).
export function buildSnapshot(newEntries) {
  const items = {};
  for (const { key, entry } of newEntries) {
    (items[key] ??= []).push(entryHash(entry));
  }
  for (const arr of Object.values(items)) arr.sort();
  return items;
}

// Entries repeat per key (units_gas.json carries one row per rarity
// tier, all sharing a baseId), so snapshots store a sorted multiset of
// hashes per key and the diff compares multisets — variant reorder or
// per-variant rows can never fake a change.
export function diffEntries(oldItems, newEntries) {
  const fresh = new Map(Object.entries(buildSnapshot(newEntries)));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, arr] of fresh) {
    const old = (oldItems[key] ?? []).slice().sort();
    if (!(key in oldItems)) added.push(key);
    else if (old.join(',') !== arr.join(',')) changed.push(key);
  }
  for (const key of Object.keys(oldItems)) {
    if (!fresh.has(key)) removed.push(key);
  }
  return { added, removed, changed };
}

// First plausible display-name key, else the raw id for later resolution.
export function findNameKey(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const stack = [entry];
  while (stack.length) {
    const cur = stack.pop();
    if (Array.isArray(cur)) { stack.push(...cur); continue; }
    if (!cur || typeof cur !== 'object') continue;
    for (const [k, v] of Object.entries(cur)) {
      if (typeof v === 'string' && /(name|title)/i.test(k) && /^[A-Z0-9_]+$/.test(v)) return v;
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

// First tex.* reference — downloadable portrait/banner art.
export function findTex(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const stack = [entry];
  while (stack.length) {
    const cur = stack.pop();
    if (Array.isArray(cur)) { stack.push(...cur); continue; }
    if (!cur || typeof cur !== 'object') continue;
    for (const v of Object.values(cur)) {
      if (typeof v === 'string' && v.startsWith('tex.')) return v;
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000), ...opts });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function resolveNames(nameKeys) {
  const out = new Map();
  const uniq = [...new Set(nameKeys.filter(Boolean))];
  if (!uniq.length) return out;
  const meta = await fetchJson(`${COMLINK_URL}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: {} }),
  });
  const loc = await fetchJson(`${COMLINK_URL}/localization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: { id: `${meta.latestLocalizationBundleVersion}:ENG_US` },
      unzip: true,
      enums: false,
    }),
  });
  const dirty = String(loc['Loc_ENG_US.txt'] ?? '').split('\n');
  const table = new Map();
  for (const line of dirty) {
    const i = line.indexOf('|');
    if (i > 0) table.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  for (const k of uniq) {
    const raw = table.get(k);
    out.set(k, raw ? raw.replace(/\\n/g, ' ').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim() : null);
  }
  return out;
}

export function displayName(nameKey, key, nameMap) {
  const hit = nameKey && nameMap.get(nameKey);
  if (hit) return hit.replace(/\\n/g, ' ').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  if (/^[A-Z0-9_]{4,}$/.test(String(key))) return prettifyCodeName(key);
  return String(key);
}

async function pullArt(texNames, assetVersion) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(ART_DIR, { recursive: true });
  const saved = new Map(); // tex -> site url
  for (const tex of texNames.slice(0, MAX_ART)) {
    const file = artSlug(tex);
    try {
      const res = await fetch(
        `${AE_URL}/Asset/single?version=${assetVersion}&assetName=${encodeURIComponent(tex)}`,
        { signal: AbortSignal.timeout(60000) },
      );
      const buf = Buffer.from(await res.arrayBuffer());
      if (!res.ok || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') continue;
      await writeFile(new URL(file, ART_DIR), buf);
      saved.set(tex, `${SITE_URL}/assets/img/new/${file}`);
    } catch {
      // One flaky texture never blocks the report.
    }
  }
  return saved;
}

async function main() {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  const client = JSON.parse(await readFile(VERSIONS_PATH, 'utf8'));
  const expected = client.server?.gamedata;
  if (!expected) throw new Error('client-version.json has no server.gamedata');
  const { readdir } = await import('node:fs/promises');
  let haveSnapshots = true;
  try {
    await readdir(WATCH_DIR);
  } catch {
    haveSnapshots = false;
  }

  const olds = new Map();
  if (haveSnapshots) {
    for (const spec of WATCHED) {
      try {
        olds.set(spec.file, JSON.parse(await readFile(new URL(spec.file, WATCH_DIR), 'utf8')));
      } catch {
        haveSnapshots = false;
        break;
      }
    }
  }
  if (!haveSnapshots) {
    await mkdir(WATCH_DIR, { recursive: true });
    for (const spec of WATCHED) {
      const raw = await fetchJson(WATCH_URL(spec.file));
      const items = buildSnapshot(normalizeEntries(raw.data ?? raw, spec.idKeys));
      await writeFile(new URL(spec.file, WATCH_DIR), JSON.stringify({ gamedata: raw.version ?? null, items }, null, 1) + '\n');
    }
    console.log('CONTENT=seeded');
    console.log('content: baselines seeded, no alert');
    return;
  }

  // All-or-nothing: if the gamedata mirror hasn't synced to the enforced
  // version yet, leave everything untouched for the next hourly retry.
  const raws = new Map();
  for (const spec of WATCHED) raws.set(spec.file, await fetchJson(WATCH_URL(spec.file)));
  const synced = [...raws.values()].every(r => (r.version ?? null) === expected);
  if (!synced) {
    console.log('CONTENT=pending');
    console.log(`content: mirror not yet at ${expected} — retry next run`);
    return;
  }

  const sections = { packs: [], journeys: [], units: [], rewards: [] };
  const nameKeys = [];
  const texWants = []; // {tex, label}
  let touched = 0;
  const nextSnaps = new Map();
  for (const spec of WATCHED) {
    const raw = raws.get(spec.file);
    const entries = normalizeEntries(raw.data ?? raw, spec.idKeys);
    const byKey = new Map(entries.map(e => [e.key, e.entry]));
    const { added, removed, changed } = diffEntries(olds.get(spec.file).items ?? {}, entries);
    if (!added.length && !removed.length && !changed.length) continue;
    touched++;
    const items = buildSnapshot(entries);
    nextSnaps.set(spec.file, { gamedata: raw.version ?? expected, items });
    const interesting = [...added.map(key => ({ key, tag: '+' })), ...changed.map(key => ({ key, tag: '~' }))];
    for (const { key, tag } of interesting.slice(0, MAX_LIST)) {
      const entry = byKey.get(key);
      const nk = findNameKey(entry);
      if (nk) nameKeys.push(nk);
      const tex = findTex(entry);
      if (tex) texWants.push({ tex, key });
      sections[spec.kind].push({ key, tag, nameKey: nk, tex: tex ?? null, name: null, artUrl: null });
    }
    if (added.length + changed.length > MAX_LIST) {
      sections[spec.kind].push({ key: `…and ${added.length + changed.length - MAX_LIST} more in ${spec.file}`, tag: '', nameKey: null, tex: null, name: null, artUrl: null });
    }
    for (const key of removed.slice(0, 5)) {
      sections[spec.kind].push({ key, tag: '-', nameKey: null, tex: null, name: null, artUrl: null });
    }
  }

  if (!touched) {
    console.log('CONTENT=none');
    console.log('content: entries match snapshots, nothing to report');
    return;
  }

  const nameMap = await resolveNames(nameKeys);
  const artUrls = await pullArt([...new Set(texWants.map(t => t.tex))], client.server?.asset);
  for (const list of Object.values(sections)) {
    for (const item of list) {
      if (item.nameKey || item.key) item.name = displayName(item.nameKey, item.key, nameMap);
      if (item.tex && artUrls.has(item.tex)) item.artUrl = artUrls.get(item.tex);
    }
  }
  const total = Object.values(sections).reduce((n, l) => n + l.length, 0);

  for (const [file, snap] of nextSnaps) {
    await writeFile(new URL(file, WATCH_DIR), JSON.stringify(snap, null, 1) + '\n');
  }
  await mkdir(new URL('../assets/data/', import.meta.url), { recursive: true });
  await writeFile(
    REPORT_PATH,
    JSON.stringify(
      { checkedAt: Date.now(), gamedata: expected, storeVersion: client.store?.version ?? null, total, sections },
      null, 1,
    ) + '\n',
  );
  console.log(`CONTENT=diff`);
  console.log(`content: ${total} new/changed entries across ${touched} files (packs=${sections.packs.length} journeys=${sections.journeys.length} units=${sections.units.length} rewards=${sections.rewards.length})`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(err => {
    console.error(`content:diff failed: ${err.message}`);
    process.exit(1);
  });
}
