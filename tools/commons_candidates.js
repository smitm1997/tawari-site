#!/usr/bin/env node
// Find openly licensed Wikimedia Commons photos for species that have none we can show.
//
// Candidates only. Nothing here is published: a search by scientific name can return a
// congener, a mislabelled upload or a herbarium sheet, and a wrong-species photo in front
// of an ornithologist is exactly the failure this project exists to avoid. A person picks.
//
// Licence rule = utils/licenseGate.js in the app repo: CC0, public domain, CC BY, CC BY-SA.
// NC and ND are rejected outright; so is anything unrecognised.
//
//   node tools/commons_candidates.js <nophoto.json> <out.json>
'use strict';
const fs = require('fs');
const https = require('https');

const [inPath, outPath] = process.argv.slice(2);
const UA = 'TawariSiteBuild/1.0 (+https://tawari.id; hello@tawari.app) Node';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PER_SPECIES = 4;

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA }, timeout: 30000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => (res.statusCode === 200 ? resolve(JSON.parse(body)) : reject(new Error('HTTP ' + res.statusCode))));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

// Mirrors utils/licenseGate.js classifyLicense — allowed only for CC0 / PD / CC BY / CC BY-SA.
function licenceOk(raw) {
  if (!raw) return null;
  const low = String(raw).toLowerCase();
  if (/\bcc0\b|cc[\s_-]*zero|\bpd\b|public[\s_-]*domain/.test(low)) return 'CC0/PD';
  const words = new Set(low.split(/[^a-z]+/).filter(Boolean));
  if (!words.has('by') || words.has('nc') || words.has('nd')) return null;
  for (const w of words) if (!['cc', 'by', 'sa'].includes(w)) return null;
  return words.has('sa') ? 'CC BY-SA' : 'CC BY';
}

const strip = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

(async () => {
  const species = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const out = [];
  for (const sp of species) {
    const q = `"${sp.sci}"`;
    const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', format: 'json', generator: 'search', gsrsearch: q, gsrnamespace: '6',
      gsrlimit: '20', prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '480',
    });
    let pages = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      try { pages = Object.values((await getJSON(url)).query?.pages || {}); break; }
      catch (e) { if (attempt === 3) console.error(`  ${sp.sci}: ${e.message}`); await sleep(2000 * (attempt + 1)); }
    }
    const genus = sp.sci.split(' ')[0].toLowerCase();
    const epithet = (sp.sci.split(' ')[1] || '').toLowerCase();
    const cands = pages
      .map((p) => {
        const ii = p.imageinfo?.[0] || {};
        const m = ii.extmetadata || {};
        const lic = licenceOk(m.LicenseShortName?.value);
        const title = p.title.replace(/^File:/, '');
        const tl = title.toLowerCase();
        return {
          title,
          page: ii.descriptionurl,
          thumb: ii.thumburl,
          full: ii.url,
          w: ii.width, h: ii.height, mime: ii.mime,
          licence: lic,
          licenceRaw: m.LicenseShortName?.value || null,
          author: strip(m.Artist?.value) || null,
          desc: strip(m.ImageDescription?.value).slice(0, 180),
          // both halves of the binomial in the filename is the strongest cheap identity signal
          nameMatch: tl.includes(genus) && tl.includes(epithet) ? 'binomial' : tl.includes(genus) ? 'genus-only' : 'none',
          herbarium: /herbar|specimen|isotype|holotype|syntype|sheet|\bmo-\d|\bny\d/.test(tl + ' ' + (m.ImageDescription?.value || '').toLowerCase()),
        };
      })
      .filter((c) => c.licence && /image\/(jpeg|png|webp)/.test(c.mime) && c.w >= 400)
      // living-organism photos with the full binomial in the name first; herbarium sheets last
      .sort((a, b) =>
        (a.herbarium - b.herbarium) ||
        (({ binomial: 0, 'genus-only': 1, none: 2 })[a.nameMatch] - ({ binomial: 0, 'genus-only': 1, none: 2 })[b.nameMatch]) ||
        (b.w - a.w))
      .slice(0, PER_SPECIES);
    out.push({ ...sp, candidates: cands });
    const best = cands[0];
    console.log(`${String(cands.length).padStart(2)}  ${sp.sci.padEnd(30)} ${best ? `${best.licence.padEnd(8)} ${best.nameMatch.padEnd(10)} ${best.herbarium ? 'HERBARIUM ' : ''}${best.title.slice(0, 44)}` : 'no usable candidate'}`);
    await sleep(900);
  }
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  const covered = out.filter((s) => s.candidates.length).length;
  console.log(`\n${covered}/${out.length} species have at least one openly licensed candidate`);
})();
