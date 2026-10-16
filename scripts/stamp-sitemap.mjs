// Stamps the homepage <lastmod> in sitemap.xml to today's date.
// The schedule rolls daily, so the index entry goes stale within a day;
// policy pages are yearly and intentionally left untouched.
// Run: npm run sitemap (also fine to run on every deploy).
import fs from 'node:fs';
import { isMain } from './is-main.mjs';

export function stampSitemap(xml, today = new Date().toISOString().slice(0, 10)) {
  const entry = /(<loc>https:\/\/swgohresources\.github\.io\/<\/loc>\s*<lastmod>)[\d-]+(<\/lastmod>)/;
  if (!entry.test(xml)) throw new Error('homepage lastmod entry not found');
  return xml.replace(entry, `$1${today}$2`);
}

if (isMain(import.meta.url)) {
  try {
    const url = new URL('../sitemap.xml', import.meta.url);
    const xml = fs.readFileSync(url, 'utf8');
    const next = stampSitemap(xml);
    if (next !== xml) fs.writeFileSync(url, next);
    console.log(next === xml ? 'sitemap: homepage lastmod already current' : 'sitemap: homepage lastmod updated');
  } catch (error) {
    console.error(`sitemap: ${error.message}`);
    process.exitCode = 1;
  }
}
