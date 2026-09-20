#!/usr/bin/env node
// Fetch the Field-find species photos and write 320px WebP thumbnails we serve ourselves.
//
// WHY SELF-HOST. The source rows point at full-resolution originals spread over a dozen
// herbarium and observation hosts. Hot-linking them would (a) pull megabytes per card on
// the mobile connection most of this audience is on, (b) send every visitor's IP to
// twelve third parties, which the privacy policy says we do not do, and (c) break
// whenever one of those servers is slow or moves a file. Every photo here is CC0,
// CC BY, CC BY-SA or public domain — all of which permit derivatives and commercial
// use — so resizing and re-hosting is allowed, provided the credit travels with it.
// The credit does: it is in finds.json and rendered on every card's detail view.
//
//   node tools/fetch_find_photos.js <finds.json> <out-dir>
//
// Idempotent: a thumbnail that already exists is skipped. Failures are printed and the
// species keeps img:null, which the UI renders as an honest gap.
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('/Users/martinsmit/dev/Tawari/node_modules/sharp');

const [jsonPath, outDir] = process.argv.slice(2);
if (!jsonPath || !outDir) { console.error('usage: fetch_find_photos.js <finds.json> <out-dir>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const UA = 'TawariSiteBuild/1.0 (+https://tawari.id; hello@tawari.app) Node';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTH = 320, QUALITY = 72, CONCURRENCY = 1;

// iNaturalist's open-data bucket serves sized variants beside the original. Asking for
// `medium` moves a fraction of the bytes and is the polite request to make.
function politer(url) {
  return url.replace(/(inaturalist-open-data\.s3\.amazonaws\.com\/photos\/\d+\/)original(\.\w+)/, '$1medium$2');
}

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    const mod = url.startsWith('http://') ? http : https;
    const req = mod.get(url, { headers: { 'User-Agent': UA, Accept: 'image/*' }, timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

(async () => {
  const finds = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const jobs = [];
  for (const place of finds) {
    for (const s of place.species) {
      if (s.imgSrc) jobs.push({ id: s.id, url: politer(s.imgSrc), species: s });
    }
  }
  // one species can appear in more than one Field-find — fetch it once
  const seen = new Set();
  const unique = jobs.filter((j) => (seen.has(j.id) ? false : seen.add(j.id)));
  console.log(`${unique.length} unique photos to fetch (${jobs.length} card slots)`);

  let ok = 0, skipped = 0;
  const failed = [];
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const job = unique[cursor++];
      const rel = job.id + '.webp';
      const dest = path.join(outDir, rel);
      if (fs.existsSync(dest)) { skipped++; continue; }
      try {
        let buf = null;
        for (let attempt = 0; attempt < 4 && !buf; attempt++) {
          try { buf = await get(job.url); }
          catch (e) {
            if (!/429|503/.test(e.message) || attempt === 3) throw e;
            await sleep(1500 * (attempt + 1) + Math.floor(job.id.charCodeAt(0) % 500));
          }
        }
        await sharp(buf).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(dest);
        ok++;
      } catch (e) {
        failed.push({ id: job.id, sci: job.species.sci, url: job.url, why: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // point every species at its local thumbnail, or null it so the gap shows honestly
  let wired = 0;
  for (const place of finds) {
    for (const s of place.species) {
      const rel = s.id + '.webp';
      if (s.imgSrc && fs.existsSync(path.join(outDir, rel))) { s.img = 'assets/finds/' + rel; wired++; }
      else s.img = null;
      delete s.imgSrc;
    }
  }
  fs.writeFileSync(jsonPath, JSON.stringify(finds));

  const bytes = fs.readdirSync(outDir).filter((f) => f.endsWith('.webp'))
    .reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
  console.log(`fetched ${ok}, already had ${skipped}, failed ${failed.length}`);
  console.log(`${wired} card slots wired to a local thumbnail`);
  console.log(`thumbnails on disk: ${(bytes / 1048576).toFixed(1)} MB, avg ${Math.round(bytes / Math.max(1, fs.readdirSync(outDir).length / 1))} B`);
  if (failed.length) {
    console.log('\nFAILED (these species now show the honest gap):');
    for (const f of failed) console.log(`  ${f.sci.padEnd(34)} ${f.why}  ${f.url.slice(0, 70)}`);
  }
})();
