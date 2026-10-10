// Refreshes conquest feat TITLES + DESCRIPTIONS in
// assets/data/conquest-planner.json from live gamedata (Comlink
// localization bundle) — the exact official text, no transcription.
// Sectors and keycard values are hand-maintained in planner JSON
// (see SECTOR_MAP / VALUE_MAP below) and preserved across refreshes;
// feats with no mapping land in the "unplaced" group for triage.
// Feat ART is pulled, not hand-maintained: each feat's `artAsset` is the
// swgoh-ae2 texture name for its icon, so `npm run conquest:pull` also
// refreshes assets/img/<art> from the extractor (same behaviour as the
// event art in pull-live-events.mjs — a persistent library, files already
// on disk are never re-downloaded).
//
// Run: npm run conquest:pull
//   COMLINK_URL=http://my-host:3500 npm run conquest:pull
//   VOL=25 CQID=cq-2026-09-28-c1 npm run conquest:pull
//
// Needs a reachable Comlink instance (same one as npm run events:pull)
// and, for the art, a swgoh-ae2 extractor (AE_URL, optional — without it
// the text still refreshes and the committed icons stay put).

import { readFile, writeFile } from 'node:fs/promises';
import { isMain } from './is-main.mjs';

const COMLINK_URL = process.env.COMLINK_URL ?? 'http://localhost:3500';
// swgoh-ae2 asset extractor (optional — the text sync doesn't need it, the
// feat icons do). Same host layout as comlink, as in events:pull.
const AE_URL = process.env.AE_URL ?? 'http://localhost:3123';
const VOL = process.env.VOL ?? '25';
const CQID = process.env.CQID ?? 'cq-2026-09-28-c1';
const PLANNER_PATH = new URL('../assets/data/conquest-planner.json', import.meta.url);
const IMG_DIR = new URL('../assets/img/', import.meta.url);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// loc stem -> planner feat id + fallback title (used when the volume
// has no NAME key for the feat).
const STEM_MAP = {
  BADBABY: ['badbaby', 'Bad Baby!'],
  BADMOTIVATOR: ['badmotivator', 'Bad Motivator'],
  BOMBS: ['bombs', 'Thermal Detonators'],
  BOUNTYPAID: ['bountypaid', 'Bounty Paid'],
  BUREAUCRAT: ['bureaucrat', 'Bureaucrat'],
  COLONELSORDERS: ['colonelsorders', "Colonel's Orders"],
  CRIMESYNDICATE: ['crimesyndicate', 'Crime Syndicate'],
  DEVASTATION: ['devastation', 'Devastation'],
  EVASION_DOWN: ['evasiondown', 'Evasion Down'],
  EVASION_UP: ['evasionup', 'Evasion Up'],
  FEAT_LEARN_CONTROL: ['learncontrol', 'Deployable Cooling Systems'],
  FINALWATCH: ['finalwatch', 'Final Watch'],
  FOLLOW_LEAD: ['followlead', 'Booming Voice'],
  GHOSTOFTHEREPUBLIC: ['ghost', 'Ghost of the Republic'],
  HONORGUARD: ['honorguard', 'Honor Guard'],
  'HONORGUARD_DESC_WIN|HONORGUARD_NAME': ['honorguard-win', 'Honor Guard (No KO)'],
  HOT: ['hot', 'Heal Over Time'],
  ISBFINEST: ['isfinest', "ISB's Finest"],
  KEEPINGTHEPEACE: ['keepingthepeace', 'Keeping the Peace'],
  KNOCKEMDEAD: ['knockemdead', "Knock 'Em Dead"],
  NEWREPUBLIC: ['newrepublic', 'For the New Republic'],
  NO_ATTACKERS: ['noattackers', 'No Attackers'],
  ON_THE_MOVE: ['onthemove', 'On the Move'],
  RETRIBUTION: ['retribution', 'Retribution'],
  STUN: ['stun', 'Stun'],
  THECHILD: ['thechild', 'The Child'],
  'THECHILD_DESC_WIN|THECHILD_NAME': ['thechild-win', 'The Child (No KO)'],
  UNCHOSENPATH: ['unchosenpath', 'The Unchosen Path'],
  DEEPCOVER: ['deepcover', 'Deep Cover'],
  UNDERTHEHELMET: ['underthehelmet', 'Under the Helmet'],
  UNLIKELY_ALLIANCE: ['unlikely', 'Unlikely Alliance'],
  WARLORDSENFORCER: ['warlords', "Warlord's Enforcer"],
  'WARLORDSENFORCER_DESC_WIN|WARLORDSENFORCER_NAME': ['warlords-win', "Warlord's Enforcer (No KO)"],
};

function clean(s) {
  return String(s ?? '')
    .replace(/\\n/g, ' ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

export async function pullFeatText(vol = VOL) {
  const metadata = await post('/metadata', { payload: {} });
  const loc = await post('/localization', {
    payload: { id: `${metadata.latestLocalizationBundleVersion}:ENG_US` },
    unzip: true,
    enums: false,
  });
  const map = new Map();
  for (const line of String(loc['Loc_ENG_US.txt'] ?? '').split('\n')) {
    const i = line.indexOf('|');
    if (i > 0) map.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  const prefix = `CONQUEST_VOL${vol}_`;
  const feats = {};
  for (const [rawStem, [id, fallbackTitle]] of Object.entries(STEM_MAP)) {
    // A stem like "X_DESC_WIN|X_NAME" reads a fixed desc key plus the
    // sibling NAME key (miniboss "in squad" variants).
    const [stem, nameKey] = rawStem.split('|');
    const descKey = nameKey ? prefix + stem : null;
    const name = map.get(prefix + (nameKey ?? stem + '_NAME'));
    const entry = { id, title: name ? clean(name) : fallbackTitle, desc: {} };
    for (const diff of ['EASY', 'NORMAL', 'HARD']) {
      const d = descKey ? map.get(descKey) : (map.get(prefix + stem + '_' + diff + '_DESC') ?? map.get(prefix + stem + '_DESC'));
      if (d && !entry.desc[diff.toLowerCase()]) entry.desc[diff.toLowerCase()] = clean(d);
    }
    // Shared (non-suffixed) DESC covers difficulties without their own.
    const shared = descKey ? null : map.get(prefix + stem + '_DESC');
    if (shared) {
      for (const diff of ['easy', 'normal', 'hard']) entry.desc[diff] ??= clean(shared);
    }
    if (Object.keys(entry.desc).length) feats[id] = entry;
  }
  return feats;
}

// Downloads each feat's icon through swgoh-ae2 into assets/img/<art>, where
// `artAsset` is the ae2 texture name the icon came from. The directory is a
// persistent library: a file already on disk is reused as-is, so a rerun
// can't re-download good art and a flaky extractor can never blank an icon
// (same contract as pullEventArt in pull-live-events.mjs). Never throws — a
// dead extractor only costs the new icons, the text sync still lands.
// opts override the image dir + extractor URL (tests). imgDir accepts a file
// URL object, a file URL string, or a plain path, for the same reason
// pullEventArt's artDir does.
export async function pullFeatArt(feats, assetVersion, opts = {}) {
  const { pathToFileURL } = await import('node:url');
  const { mkdir, readFile: read, writeFile: write } = await import('node:fs/promises');
  const rawDir = opts.imgDir ?? IMG_DIR;
  const dir = rawDir instanceof URL ? rawDir
    : String(rawDir).startsWith('file:') ? new URL(String(rawDir))
    // Trailing slash: without it a plain path resolves as a *file* base and
    // every feat.art lands one directory too high.
    : pathToFileURL(String(rawDir).replace(/\/*$/, '/'));
  const aeUrl = opts.aeUrl ?? AE_URL;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const counts = { pulled: 0, kept: 0, missing: 0 };
  let aeDown = false;
  for (const feat of feats ?? []) {
    const asset = feat?.artAsset;
    if (!asset || !feat.art) continue;
    const to = new URL(feat.art, dir);
    try {
      const buf = await read(to);
      if (buf.subarray(0, 8).equals(PNG_MAGIC)) {
        counts.kept++;
        continue;
      }
    } catch { /* not on disk yet — pull it below */ }
    if (aeDown) {
      counts.missing++;
      continue;
    }
    // Pace the pulls: rapid-fire downloads flake on the CG side.
    await sleep(2000);
    let buf = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(
          `${aeUrl}/Asset/single?version=${assetVersion}&assetName=${encodeURIComponent(asset)}`,
        );
        const body = Buffer.from(await res.arrayBuffer());
        if (res.ok && body.subarray(0, 8).equals(PNG_MAGIC)) {
          buf = body;
          break;
        }
        console.warn(`art: ${asset} attempt ${attempt} -> bad response (HTTP ${res.status}, ${body.length}b)`);
      } catch (err) {
        // A connection error means the extractor itself is gone, not that
        // this texture is bad — stop hammering it and keep the committed art.
        console.warn(`art: extractor unreachable at ${aeUrl} (${err.message}) — keeping committed art`);
        aeDown = true;
        break;
      }
      await sleep(2000 * attempt);
    }
    if (!buf) {
      counts.missing++;
      continue;
    }
    await mkdir(new URL('.', to), { recursive: true });
    await write(to, buf);
    counts.pulled++;
  }
  if (counts.missing) {
    console.warn(`art: ${counts.missing} feat icon(s) not pulled from ${aeUrl} — keeping the committed file(s)`);
  }
  return counts;
}

async function main() {
  const feats = await pullFeatText();
  const planner = JSON.parse(await readFile(PLANNER_PATH, 'utf8'));
  const cq = (planner.conquests ?? []).find(c => c.id === CQID);
  if (!cq) throw new Error(`conquest ${CQID} not found in planner JSON`);
  let updated = 0, added = 0;
  const byId = {};
  for (const diff of Object.values(cq.difficulties ?? {})) {
    for (const g of diff.groups ?? []) {
      for (const f of g.feats ?? []) byId[f.id] = f;
    }
  }
  for (const [id, feat] of Object.entries(feats)) {
    const cur = byId[id];
    if (cur) {
      if (cur.title !== feat.title || JSON.stringify(cur.desc ?? cur.description) !== JSON.stringify(feat.desc)) {
        cur.title = feat.title;
        delete cur.description;
        cur.desc = feat.desc;
        updated++;
      }
    } else {
      // New feat text landed (e.g. delayed data push) — stage it in an
      // "Unplaced feats" group for triage; sector/values need a human.
      const diffs = Object.values(cq.difficulties ?? {});
      const first = diffs[0];
      if (first) {
        let bucket = first.groups.find(g => g.name === 'Unplaced feats');
        if (!bucket) {
          bucket = { name: 'Unplaced feats', feats: [] };
          first.groups.push(bucket);
        }
        bucket.feats.push({ id, title: feat.title, desc: feat.desc, keycards: 0, triage: true });
        added++;
      }
    }
  }
  await writeFile(PLANNER_PATH, JSON.stringify(planner, null, 1) + '\n');
  // Art after the text: the data file lands even if the extractor is down.
  // Every difficulty's feats, so a future difficulty with artAsset keys
  // gets its icons too.
  const allFeats = [];
  for (const diff of Object.values(cq.difficulties ?? {})) {
    for (const g of diff.groups ?? []) for (const f of g.feats ?? []) allFeats.push(f);
  }
  const art = await pullFeatArt(allFeats, (await post('/metadata', { payload: {} })).assetVersion);
  console.log(
    `conquest:pull vol ${VOL}: ${updated} refreshed, ${added} staged for triage, ` +
    `art ${art.pulled} pulled, ${art.kept} already on disk` +
    (art.missing ? `, ${art.missing} missing` : ''),
  );
}

if (isMain(import.meta.url)) {
  main().catch(err => {
    console.error(`conquest:pull failed: ${err.message}`);
    process.exit(1);
  });
}
