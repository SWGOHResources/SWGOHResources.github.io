import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assetHashes, rootHtmlFiles, siteVersion, stampHtml, VERSION_META } from '../scripts/cache-bust.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('stampHtml swaps a stale ?v= for the file content hash', async () => {
  const versions = { 'assets/js/app.js': 'abc1234567' };
  const html = '<link rel="stylesheet" href="assets/js/app.js?v=41">';
  const { html: out, touched } = stampHtml(html, versions, 'site99');
  assert.match(out, /assets\/js\/app\.js\?v=abc1234567/);
  assert.doesNotMatch(out, /\?v=41/);
  assert.deepEqual(touched, ['assets/js/app.js']);
  assert.match(out, new RegExp(`<meta name="${VERSION_META}" content="site99">`));
});

test('stampHtml is idempotent and leaves external/anchor refs alone', async () => {
  const versions = { 'assets/css/main.css': 'deadbeef00' };
  const html = [
    '<link rel="stylesheet" href="assets/css/main.css?v=deadbeef00">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora">',
    '<a href="conquest.html">Conquest</a>',
    '<a href="#main">Skip</a>',
    `<meta name="${VERSION_META}" content="old">`,
  ].join('\n');
  const first = stampHtml(html, versions, 'site99').html;
  const second = stampHtml(first, versions, 'site99');
  assert.equal(second.html, first, 'second pass must be a no-op');
  assert.deepEqual(second.touched, []);
  assert.match(first, /fonts\.googleapis\.com\/css2\?family=Sora/);
  assert.match(first, /href="conquest\.html"/);
  assert.match(first, /href="#main"/);
});

test('siteVersion moves when any asset changes', async () => {
  const a = siteVersion({ 'a.png': '1111', 'b.css': '2222' });
  const b = siteVersion({ 'a.png': '1111', 'b.css': '9999' });
  const c = siteVersion({ 'a.png': '1111', 'b.css': '2222' });
  assert.notEqual(a, b);
  assert.equal(a, c);
  assert.match(a, /^[0-9a-f]{10}$/);
});

test('a removed asset still changes the site token', async () => {
  const withFile = siteVersion({ 'a.png': '1111' });
  const without = siteVersion({});
  assert.notEqual(withFile, without);
});

test('every committed page matches what cache-bust.mjs would stamp', async () => {
  const versions = await assetHashes(ROOT);
  const siteV = siteVersion(versions);
  const pages = await rootHtmlFiles(ROOT);
  assert.ok(pages.length, 'no root html files found');
  const stale = [];
  for (const name of pages) {
    const before = fs.readFileSync(path.join(ROOT, name), 'utf8');
    const { html } = stampHtml(before, versions, siteV);
    if (html !== before) stale.push(name);
  }
  assert.deepEqual(stale, [], `run \`npm run cache:bust\` — stale ?v= in: ${stale.join(', ')}`);
});

test('no page references a local asset that is missing on disk', async () => {
  const versions = await assetHashes(ROOT);
  const missing = [];
  for (const name of await rootHtmlFiles(ROOT)) {
    const html = fs.readFileSync(path.join(ROOT, name), 'utf8');
    for (const m of html.matchAll(/(?:href|src)="((?!https?:|\/\/|#|mailto:|data:)[^"?#]+)(?:\?[^"]*)?"/g)) {
      const ref = m[1];
      if (!/^(\/)?(assets\/|firebase-config\.js)/.test(ref)) continue;
      if (!fs.existsSync(path.join(ROOT, ref.replace(/^\//, '')))) missing.push(`${name} -> ${ref}`);
    }
  }
  assert.deepEqual(missing, []);
});
