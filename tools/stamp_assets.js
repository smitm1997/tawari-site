#!/usr/bin/env node
// Give every stylesheet and script link a version stamp taken from the file's content
// (assets/site.css?v=1a2b3c4d), so a deploy never pairs new HTML with a stylesheet the
// browser still holds. GitHub Pages lets a browser keep assets/site.css for 10 minutes
// (cache-control: max-age=600); on 16 Oct 2026, revision 2's place cards rendered as
// full-width bare photos for visitors who had the old stylesheet. A changed file gets a
// new URL, so it is fetched at once; an unchanged file keeps its URL and its cache.
//
//   node tools/stamp_assets.js           rewrite the stamps in every page
//   node tools/stamp_assets.js --check   change nothing; exit 1 if a stamp is missing or stale
//
// Run it last, after any edit to assets/*.css or assets/*.js and after build_privacy.py.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');

function pages() {
  const top = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  const en = fs.readdirSync(path.join(ROOT, 'en')).filter(f => f.endsWith('.html')).map(f => path.join('en', f));
  return top.concat(en);
}

const stamps = {};
function stampOf(asset) {
  if (!(asset in stamps)) {
    const file = path.join(ROOT, 'assets', asset);
    if (!fs.existsSync(file)) throw new Error(`a page links assets/${asset}, which does not exist`);
    stamps[asset] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
  }
  return stamps[asset];
}

// href="assets/site.css", href="../assets/site.css", href="/assets/site.css", with or
// without an earlier ?v= stamp.
const LINK = /((?:href|src)=")((?:\.\.\/|\/)?assets\/)([\w.-]+\.(?:css|js))(?:\?v=[0-9a-f]*)?(")/g;

let stale = 0;
for (const page of pages()) {
  const file = path.join(ROOT, page);
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(LINK, (m, attr, dir, asset, close) => `${attr}${dir}${asset}?v=${stampOf(asset)}${close}`);
  if (after === before) continue;
  stale++;
  if (CHECK) console.log(`stale: ${page}`);
  else { fs.writeFileSync(file, after); console.log(`stamped: ${page}`); }
}
for (const [asset, v] of Object.entries(stamps)) console.log(`  assets/${asset}?v=${v}`);
if (CHECK && stale) { console.log(`${stale} page(s) need node tools/stamp_assets.js`); process.exit(1); }
if (!stale) console.log('every stamp is current');
