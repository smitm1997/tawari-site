#!/usr/bin/env node
// Fetch the Field-find species photos and write 320px WebP thumbnails we serve ourselves.
//
// WHY SELF-HOST. The source rows point at full-resolution originals spread over a dozen
// herbarium and observation hosts. Hot-linking them would (a) pull megabytes per card on
// the mobile connection most of this audience is on, (b) send every visitor's IP to
// twelve third parties, which the privacy policy says we do not do, and (c) break
// whenever one of those servers is slow or moves a file. Every photo here is CC0,
// CC BY, CC BY-SA or public domain (tools/build_finds.js keeps only what the app's
// utils/licenseGate.js allows), all of which permit derivatives and commercial use, so
// resizing and re-hosting is allowed, provided the credit travels with it. It does: it is
// in each place's file and rendered on every card's detail view.
//
//   node tools/fetch_find_photos.js assets/finds/index.json assets/finds
//
// It reads the index and every place file it lists, fetches each species' `imgSrc` once
// (a species in several Field-finds is one photo), then points `img` at the thumbnail,
// drops `imgSrc`, and recounts each place's photo-licence summary in the index.
//
// POLITE AND RESUMABLE. One request at a time, a pause between requests, Retry-After
// honoured on a 429 or 503 and a long backoff without one (Wikimedia and GBIF refuse
// parallel readers). iNaturalist is asked for its `medium` size and Wikimedia Commons for
// a 500 px thumbnail (the original when Commons has no such thumbnail), so a 320 px
// thumbnail never costs a full-size original. A thumbnail already on disk is skipped and
// each one is written whole (to a temporary name, then renamed), so a run stopped at any
// point resumes where it stopped: run tools/build_finds.js, then this, again. The
// User-Agent names the site and nothing else.
//
// A failure is printed and the species keeps img:null, which the UI renders as an honest
// gap.
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('/Users/martinsmit/dev/Tawari/node_modules/sharp');

const [indexPath, outDir] = process.argv.slice(2);
if (!indexPath || !outDir) { console.error('usage: fetch_find_photos.js <assets/finds/index.json> <out-dir>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const UA = 'TawariBot/1.0 (+https://tawari.id)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTH = 320, QUALITY = 72;
const PAUSE = 1200;               // between two requests, always
const ATTEMPTS = 5;               // per URL, on a 429 / 503 / network error
const BACKOFF = [5000, 15000, 45000, 90000];

// The licence family the page's photo line names (the same rule as tools/build_finds.js).
const licFamily = (lic) => (/^CC BY-SA/.test(lic) ? 'CC BY-SA' : /^CC BY/.test(lic) ? 'CC BY' : /^CC0/.test(lic) ? 'CC0' : 'PD');

// The URLs to try for one photo, the lightest first.
function candidates(url) {
  // iNaturalist's open-data bucket serves sized variants beside the original.
  const inat = url.replace(/(inaturalist-open-data\.s3\.amazonaws\.com\/photos\/\d+\/)(?:original|large)(\.\w+)$/i, '$1medium$2');
  if (inat !== url) return [inat, url];
  // Wikimedia Commons: /commons/a/ab/Name.jpg has a thumbnail at /commons/thumb/a/ab/Name.jpg/500px-Name.jpg.
  const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png))$/i);
  if (m) return [`${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/500px-${m[4]}`, url];
  return [url];
}

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(Object.assign(new Error('too many redirects'), { status: 0 }));
    const mod = url.startsWith('http://') ? http : https;
    const req = mod.get(url, { headers: { 'User-Agent': UA, Accept: 'image/*' }, timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        const e = new Error('HTTP ' + res.statusCode);
        e.status = res.statusCode;
        e.retryAfter = Number(res.headers['retry-after']) || 0;
        return reject(e);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { status: 0 })));
    req.on('error', (e) => { if (e.status === undefined) e.status = 0; reject(e); });
  });
}

// One URL, retried only when the server asks us to slow down or the network dropped.
async function fetchPolitely(url) {
  for (let attempt = 0; ; attempt++) {
    try { return await get(url); }
    catch (e) {
      const retryable = e.status === 429 || e.status === 503 || e.status === 0;
      if (!retryable || attempt >= ATTEMPTS - 1) throw e;
      const wait = Math.max((Number(e.retryAfter) || 0) * 1000, BACKOFF[Math.min(attempt, BACKOFF.length - 1)]);
      console.log(`  ${e.message} on ${new URL(url).host}: waiting ${Math.round(wait / 1000)} s`);
      await sleep(wait);
    }
  }
}

(async () => {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const dataDir = path.dirname(indexPath);
  const files = index.places.map((p) => ({ place: p, file: path.join(dataDir, p.slug + '.json') }));
  for (const f of files) f.data = JSON.parse(fs.readFileSync(f.file, 'utf8'));

  // one species can appear in more than one Field-find: fetch it once
  const jobs = new Map();
  let slots = 0;
  for (const f of files) for (const s of f.data.species) if (s.imgSrc) { slots++; if (!jobs.has(s.id)) jobs.set(s.id, s); }
  const todo = [...jobs.values()].filter((s) => !fs.existsSync(path.join(outDir, s.id + '.webp')));
  console.log(`${jobs.size} species with a photo (${slots} card slots): ${jobs.size - todo.length} already on disk, ${todo.length} to fetch`);

  let ok = 0, done = 0;
  const failed = [];
  for (const s of todo) {
    const dest = path.join(outDir, s.id + '.webp');
    let lastErr = null;
    for (const url of candidates(s.imgSrc)) {
      try {
        const buf = await fetchPolitely(url);
        const tmp = dest + '.part';
        await sharp(buf).rotate().resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(tmp);
        fs.renameSync(tmp, dest);
        ok++; lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        try { fs.unlinkSync(dest + '.part'); } catch (_) { /* nothing half-written */ }
        // A 429 that outlasted the backoff is not a missing thumbnail: do not fall through
        // to a heavier URL on the same host.
        if (e.status === 429 || e.status === 503) break;
      } finally {
        await sleep(PAUSE);
      }
    }
    if (lastErr) failed.push({ id: s.id, sci: s.sci, url: s.imgSrc, why: lastErr.message });
    if (++done % 20 === 0) console.log(`  ${done}/${todo.length}: ${ok} written, ${failed.length} failed`);
  }

  // point every species at its local thumbnail, or null it so the gap shows honestly, and
  // recount what each place can show
  let wired = 0;
  for (const f of files) {
    for (const s of f.data.species) {
      if (s.imgSrc && fs.existsSync(path.join(outDir, s.id + '.webp'))) { s.img = 'assets/finds/' + s.id + '.webp'; wired++; }
      // a second run without the build: keep a wired thumbnail only while it is on disk
      else if (s.imgSrc || !(s.img && fs.existsSync(path.join(outDir, s.id + '.webp')))) s.img = null;
      delete s.imgSrc;
    }
    const shown = f.data.species.filter((s) => s.img);
    f.place.photos = shown.length;
    f.place.lic = {};
    for (const s of shown) { const k = licFamily(s.lic); f.place.lic[k] = (f.place.lic[k] || 0) + 1; }
    fs.writeFileSync(f.file, JSON.stringify(f.data));
  }
  fs.writeFileSync(indexPath, JSON.stringify(index));

  const webps = fs.readdirSync(outDir).filter((f) => f.endsWith('.webp'));
  const bytes = webps.reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
  console.log(`fetched ${ok}, already had ${jobs.size - todo.length}, failed ${failed.length}`);
  console.log(`${wired} card slots wired to a local thumbnail`);
  console.log(`thumbnails on disk: ${webps.length}, ${(bytes / 1048576).toFixed(1)} MB, avg ${Math.round(bytes / Math.max(1, webps.length))} B`);
  if (failed.length) {
    console.log('\nFAILED (these species now show the honest gap; run build_finds.js and this again to retry):');
    for (const f of failed) console.log(`  ${f.sci.padEnd(34)} ${f.why}  ${f.url.slice(0, 90)}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
