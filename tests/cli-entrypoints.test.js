import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { isMain } from '../scripts/is-main.mjs';

test('entry comparison converts URL-encoded paths and rejects imports', () => {
  const entry = path.resolve('a directory with spaces', 'command.mjs');
  assert.ok(isMain(pathToFileURL(entry).href, entry));
  assert.equal(isMain(pathToFileURL(entry).href, path.resolve('other.mjs')), false);
  assert.equal(isMain(pathToFileURL(entry).href, ''), false);
});

test('all maintenance CLI entry points execute from a path with spaces', () => {
  const dir = fs.mkdtempSync(path.join(path.resolve(tmpdir()), 'swgoh cli '));
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    for (const folder of ['scripts', 'assets/js', 'assets/data']) {
      fs.mkdirSync(path.join(dir, folder), { recursive: true });
      for(const file of fs.readdirSync(path.join(root, folder))) {
        if (!fs.statSync(path.join(root, folder, file)).isFile()) continue;
        fs.copyFileSync(path.join(root, folder, file), path.join(dir, folder, file));
      }
    }
    fs.rmSync(path.join(dir, 'assets/data/digest-state.json'), { force:true });
    const mock = path.join(dir, 'mock-fetch.mjs');
    fs.writeFileSync(mock, `
      globalThis.fetch = async url => {
        let data;
        if(String(url).includes('itunes.apple.com')) data = { results: [{version:'cli-test'}] };
        else if(String(url).endsWith('/metadata')) data = { latestGamedataVersion:'0.40.6:cli', latestLocalizationBundleVersion:'cli', assetVersion:1 };
        else if(String(url).endsWith('/getEvents')) data = { gameEvent: [{ id:'EVENT_ASSAULT_TEST', nameKey:'TEST', instance:[{startTime:Date.now()-3600000,endTime:Date.now()+3600000}] }] };
        else if(String(url).endsWith('/localization')) data = { 'Loc_ENG_US.txt':'TEST|Test Event\\nCONQUEST_VOL25_HOT_HARD_DESC|CLI test description' };
        else data = [];
        return {ok:true,json:async()=>data};
      };
    `);
    const commands = [
      ['pull-live-events.mjs', /wrote .*live-events\.json/],
      ['pull-conquest-feats.mjs', /conquest:pull vol 25:/],
      ['check-client-version.mjs', /VERDICT=/],
      ['post-schedule-digest.mjs', /DIGEST=skipped/],
      ['notify-client-version.mjs', /notifications skipped/],
    ];
    for (const [command, output] of commands) {
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, path.join(dir, 'scripts', command)], {
        cwd: dir,
        env: { ...process.env, DISCORD_WEBHOOK_URL:'', DISCORD_EVENT_WEBHOOK_URL:'', DRY_RUN:'', VOL:'25', CQID:'cq-2026-09-28-c1' },
        encoding:'utf8', timeout:10000,
      });
      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
      assert.match(result.stdout, output, command);
    }
  } finally {
    fs.rmSync(dir, { recursive:true, force:true });
  }
});
