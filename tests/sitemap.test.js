import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { stampSitemap } from '../scripts/stamp-sitemap.mjs';

const xml = '<url><loc>https://swgohresources.github.io/</loc>\n<lastmod>2026-10-15</lastmod></url>'
  + '<url><loc>https://swgohresources.github.io/conquest/</loc><lastmod>2026-09-26</lastmod></url>';

test('sitemap refresh changes only the homepage and is safe to rerun on the same day', () => {
  const next = stampSitemap(xml, '2026-10-16');
  assert.match(next, /<lastmod>2026-10-16<\/lastmod>/);
  assert.match(next, /conquest\/<\/loc><lastmod>2026-09-26<\/lastmod>/);
  assert.equal(stampSitemap(next, '2026-10-16'), next);
  assert.throws(() => stampSitemap('<urlset/>', '2026-10-16'), /entry not found/);
});

test('sitemap CLI succeeds twice and reports missing entries as failures', t => {
  const dir = fs.mkdtempSync(path.join(path.resolve(tmpdir()), 'swgoh sitemap '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'scripts'));
  for (const script of ['stamp-sitemap.mjs', 'is-main.mjs']) {
    fs.copyFileSync(new URL('../scripts/' + script, import.meta.url), path.join(dir, 'scripts', script));
  }
  const file = path.join(dir, 'sitemap.xml');
  fs.writeFileSync(file, xml);
  const run = () => spawnSync(process.execPath, [path.join(dir, 'scripts', 'stamp-sitemap.mjs')], { encoding: 'utf8', timeout: 10000 });
  const first = run(), second = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /already current/);
  fs.writeFileSync(file, '<urlset/>');
  const invalid = run();
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /entry not found/);
});
