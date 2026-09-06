// Stamps the homepage <lastmod> in sitemap.xml to today's date.
// The schedule rolls daily, so the index entry goes stale within a day;
// policy pages are yearly and intentionally left untouched.
// Run: npm run sitemap (also fine to run on every deploy).
import fs from 'node:fs';

const url = new URL('../sitemap.xml', import.meta.url);
const today = new Date().toISOString().slice(0, 10);
let xml = fs.readFileSync(url, 'utf8');
const next = xml.replace(
  /(<loc>https:\/\/swgohresources\.github\.io\/<\/loc>\s*<lastmod>)[\d-]+(<\/lastmod>)/,
  `$1${today}$2`
);
if (next === xml) {
  console.error('sitemap: homepage lastmod entry not found, nothing changed');
  process.exit(1);
}
fs.writeFileSync(url, next);
console.log(`sitemap: homepage lastmod -> ${today}`);
