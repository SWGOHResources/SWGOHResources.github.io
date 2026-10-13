// Manual refresh only: npm run squads:pull. No server is needed by visitors.
// Fetch one pinned game-data revision, verify versions, and build a local
// portrait atlas so PNG export never depends on external-image CORS.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { buildSquadData } from './build-squad-data.mjs';
import { buildSquadPower } from './build-squad-power.mjs';
import { isMain } from './is-main.mjs';

const ROOT = new URL('../', import.meta.url);
async function get(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'swgohresources-squad-planner' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
export async function pullSquadData() {
  const commit = JSON.parse((await get('https://api.github.com/repos/swgoh-utils/gamedata/commits/main')).toString()).sha;
  const base = `https://raw.githubusercontent.com/swgoh-utils/gamedata/${commit}/`;
  const names = { units: 'units.json.br', loc: 'Loc_ENG_US.txt.json.br', ability: 'ability.json', skill: 'skill.json', category: 'category.json' };
  const versions = JSON.parse((await get(base + 'allVersions.json')).toString());
  const raw = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([key, file]) => {
    const bytes = await get(base + file);
    const value = JSON.parse((file.endsWith('.br') ? brotliDecompressSync(bytes) : bytes).toString());
    if (value.version !== versions[file]) throw new Error('Incomplete mirror revision: ' + file);
    return [key, value];
  })));
  const snapshot = buildSquadData(raw, commit);
  const gameData=JSON.parse((await get(base+'gameData.json')).toString());
  const power=JSON.stringify(buildSquadPower(snapshot.characters,gameData,commit))+'\n';
  let powerChanged=true;
  try { powerChanged=(await readFile(new URL('assets/data/squad-power.json',ROOT),'utf8'))!==power; } catch {}
  if(powerChanged) await writeFile(new URL('assets/data/squad-power.json',ROOT),power);
  const composites = Array(snapshot.characters.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < snapshot.characters.length) {
      const i = cursor++, u = snapshot.characters[i];
      const bytes = await get(snapshot.portraitSource + u.texture + '.png');
      composites[i] = { input: await sharp(bytes).resize(128, 128).png().toBuffer(),
        left: u.portrait % 20 * 128, top: Math.floor(u.portrait / 20) * 128 };
    }
  }));
  const atlas = await sharp({ create: { width: 2560, height: snapshot.atlas.rows * 128, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).webp({ quality: 88 }).toBuffer();
  const version = createHash('sha256').update(atlas).digest('hex').slice(0, 10);
  snapshot.atlas.path = '/assets/img/squads/portraits.webp?v=' + version;
  // Do not churn the data timestamp when a game refresh changes neither
  // the relevant kit/faction data nor the bundled portraits.
  try {
    const prior = JSON.parse(await readFile(new URL('assets/data/squad-planner.json', ROOT), 'utf8'));
    if (JSON.stringify({ ...prior, generatedAt: '' }) === JSON.stringify({ ...snapshot, generatedAt: '' })) return powerChanged;
  } catch { /* First generation. */ }
  await mkdir(new URL('assets/img/squads/', ROOT), { recursive: true });
  await writeFile(new URL('assets/img/squads/portraits.webp', ROOT), atlas);
  await writeFile(new URL('assets/data/squad-planner.json', ROOT), JSON.stringify(snapshot) + '\n');
  console.log(`squads:pull: ${snapshot.characters.length} characters, ${snapshot.factions.length} factions; data ${snapshot.gameVersion}`);
  return true;
}
if (isMain(import.meta.url)) pullSquadData().catch(err => { console.error('squads:pull failed: ' + err.message); process.exitCode = 1; });
