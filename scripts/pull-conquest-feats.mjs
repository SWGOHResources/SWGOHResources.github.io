// Refreshes conquest feat TITLES + DESCRIPTIONS in
// assets/data/conquest-planner.json from live gamedata (Comlink
// localization bundle) — the exact official text, no transcription.
// Sectors, keycard values and art are hand-maintained in planner JSON
// (see SECTOR_MAP / VALUE_MAP below) and preserved across refreshes;
// feats with no mapping land in the "unplaced" group for triage.
//
// Run: npm run conquest:pull
//   COMLINK_URL=http://my-host:3500 npm run conquest:pull
//   VOL=25 CQID=cq-2026-09-28-c1 npm run conquest:pull
//
// Needs a reachable Comlink instance (same one as npm run events:pull).

import { readFile, writeFile } from 'node:fs/promises';
import { isMain } from './is-main.mjs';

const COMLINK_URL = process.env.COMLINK_URL ?? 'http://localhost:3500';
const VOL = process.env.VOL ?? '25';
const CQID = process.env.CQID ?? 'cq-2026-09-28-c1';
const PLANNER_PATH = new URL('../assets/data/conquest-planner.json', import.meta.url);

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
  console.log(`conquest:pull vol ${VOL}: ${updated} refreshed, ${added} staged for triage`);
}

if (isMain(import.meta.url)) {
  main().catch(err => {
    console.error(`conquest:pull failed: ${err.message}`);
    process.exit(1);
  });
}
