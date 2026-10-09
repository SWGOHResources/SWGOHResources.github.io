// Stamps every local asset reference with a content hash, so a changed
// file can never be served from a browser/CDN cache under its old URL.
//
// Why this exists: `?v=41`-style integers were bumped by hand on every
// deploy, and images had no version at all. Both go stale silently — the
// page keeps the old CSS/JS, or an old feat icon reappears after you
// replaced the PNG at the same path. A content hash fixes that: the URL
// changes exactly when the bytes change, and only then.
//
// What it does:
//   1. hashes every file under assets/ (css/js/json/img/data)
//   2. rewrites `?v=` on every local href/src in each root *.html to that
//      file's own hash
//   3. writes one site-wide token into <meta name="swgoh-asset-v"> so
//      runtime-built image URLs can be versioned too (see
//      assets/js/asseturl.js) — CSS can't do this, but main.css has no
//      url() references
//
// Idempotent: running it twice in a row changes nothing the second time.
// tests/cache-bust.test.js fails if the committed HTML has drifted from
// what this script would produce, so forgetting to run it is caught.
//
// Run: npm run cache:bust
//   (the events/conquest pull scripts chain it, since they're what
//    add or replace images)

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ASSET_DIR = path.join(ROOT, 'assets');
export const VERSION_META = 'swgoh-asset-v';
// Hashed rather than skipped: a file can be deleted without its
// references disappearing from the HTML, and that has to change the token.
const ASSET_EXT = new Set([
  '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.webp', '.avif',
  '.gif', '.svg', '.ico', '.woff', '.woff2', '.txt', '.webmanifest',
]);
const LOCAL_REF = /(\s(?:href|src)=")((?!https?:|\/\/|#|mailto:|data:|tel:|javascript:)[^"]+?)(\?v=[0-9a-z]+)?(")/gi;

export function shortHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 10);
}

async function walk(dir, base, out) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (ASSET_EXT.has(path.extname(e.name).toLowerCase())) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/** repo-relative path -> short content hash, for every asset on disk. */
export async function assetHashes(root = ROOT) {
  const files = (await walk(path.join(root, 'assets'), root, [])).sort();
  const versions = {};
  for (const rel of files) {
    let buf;
    try {
      buf = await readFile(path.join(root, rel));
    } catch {
      buf = Buffer.alloc(0); // vanished mid-walk; still gets a token
    }
    versions[rel] = shortHash(buf);
  }
  return versions;
}

/** One token for the whole site: changes if any asset's bytes change. */
export function siteVersion(versions) {
  return shortHash(Object.keys(versions).sort().map(k => `${k}:${versions[k]}`).join('\n'));
}

/**
 * Rewrites a page's local asset refs to their own content hash and
 * refreshes the site-wide meta token. Returns the new HTML plus the list
 * of paths whose `?v=` actually moved, so a caller can report it.
 */
export function stampHtml(html, versions, siteV) {
  const touched = [];
  const out = html.replace(LOCAL_REF, (m, head, ref, oldV, tail) => {
    // Strip any existing query/hash before looking the file up, and match
    // root-relative refs ("/assets/…") against the same repo-relative keys.
    const clean = ref.split('#')[0].split('?')[0];
    const v = versions[clean] || versions[clean.replace(/^\/+/, '')];
    if (!v) return m; // not a local asset we hash (page links, etc.)
    if (oldV === `?v=${v}`) return m;
    touched.push(clean);
    return `${head}${clean}?v=${v}${tail}`;
  });

  const meta = `<meta name="${VERSION_META}" content="${siteV}">`;
  let next;
  if (new RegExp(`<meta name="${VERSION_META}"[^>]*>`).test(out)) {
    next = out.replace(new RegExp(`<meta name="${VERSION_META}"[^>]*>`), meta);
  } else if (/<head[^>]*>/i.test(out)) {
    next = out.replace(/<head[^>]*>/i, h => `${h}\n    ${meta}`);
  } else {
    next = meta + out;
  }
  if (next !== out && !touched.length) touched.push(VERSION_META);
  return { html: next, touched };
}

export async function rootHtmlFiles(root = ROOT) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.html'))
    .map(e => e.name)
    .sort();
}

async function main() {
  const versions = await assetHashes();
  const siteV = siteVersion(versions);
  let dirty = 0;
  for (const name of await rootHtmlFiles()) {
    const file = path.join(ROOT, name);
    const before = await readFile(file, 'utf8');
    const { html, touched } = stampHtml(before, versions, siteV);
    if (html === before) continue;
    await writeFile(file, html);
    dirty += 1;
    console.log(`${name}: ${touched.join(', ') || VERSION_META}`);
  }
  console.log(
    `cache:bust ${siteV} — ${Object.keys(versions).length} assets, ${dirty} page${dirty === 1 ? '' : 's'} updated`,
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(err => {
    console.error(`cache:bust failed: ${err.message}`);
    process.exit(1);
  });
}
