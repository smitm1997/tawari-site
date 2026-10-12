#!/usr/bin/env node
// Regenerate assets/finds.json from the production database, READ ONLY, with the app's
// own rules, so the explorer shows what the app shows:
//
//   - the list: quest_species with excluded_by_expert = false (CLAUDE.md: every quest
//     query filters it), minus a psychoactive or ceremonial hold (utils/fieldFindHold.ts:
//     a held card keeps its tile only when its hold is a hazard omission);
//   - names: species.common_name_es / _en through the app's cleanName (utils/species.ts),
//     and an "English" name that is the Spanish text is dropped, because the app's rule
//     is that Spanish is never shown as English (localSpeciesName);
//   - the introduced mark: quest_species.establishment = 'introduced' WITH a source
//     (services/questService.ts introducedMarkOf);
//   - the photo: the card's hero, i.e. the clean rows (utils/licenseGate.js plus the
//     raw_license NC/ND veto, https and not a refusing host) ordered by host tier,
//     is_lead, sort_order, URL (services/speciesService.ts compareHeroCandidates);
//     the credit carries the author, the licence with its version and its deed, and
//     the source link.
//
//   node tools/build_finds.js [--app ~/dev/Tawari]
//   node tools/fetch_find_photos.js assets/finds.json assets/finds
//
// It connects with the app repo's read-only helper (scripts/register/registerCanary.js
// openReadOnly: READONLY_DATABASE_URL, a READ ONLY transaction, refuses otherwise). It
// writes nothing to the database. It writes assets/finds.json with `imgSrc` on every
// species that has a photo, and DELETES a local thumbnail whose credit no longer matches
// the hero (and thumbnails no species uses any more), so the fetcher downloads the
// current one. Its report goes to stdout.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const argApp = process.argv.indexOf('--app');
const APP = argApp > -1 ? process.argv[argApp + 1] : path.join(os.homedir(), 'dev/Tawari');
const SITE = path.join(__dirname, '..');
const { openReadOnly } = require(path.join(APP, 'scripts/register/registerCanary.js'));
const { classifyLicense } = require(path.join(APP, 'utils/licenseGate.js'));
const { hostTierRank, isServableImageUrl } = require(path.join(APP, 'utils/imageHostTier.js'));

// Best-documented first (README): the Botanical Garden's 428 records before Tres Cruces' 3.
const PLACES = [
  { questId: 'c523fc50-fb13-463e-a9a0-608d164efe6c', label: 'JB Cali' },
  { questId: 'a2912929-c9ef-42b0-a5e7-fe23e6d79b33', label: 'Laguna de Sonso' },
  { questId: 'ec58a04f-0e76-4d59-a274-5e493272b380', label: 'Tres Cruces' },
];

const NAME_PLACEHOLDER = /^(sin(\s+nombre)?|s\/n|n\/a|desconocido)$/i; // utils/species.ts
function cleanName(raw) {
  if (raw == null) return null;
  for (const seg of String(raw).split('|')) { const t = seg.trim(); if (t && !NAME_PLACEHOLDER.test(t)) return t; }
  return null;
}
const rawHasNcNd = (raw) => raw != null && /(^|[^a-z])n[cd]([^a-z]|$)/i.test(String(raw));
const isClean = (r) => !!r.image_url && classifyLicense(r.license).allowed && !rawHasNcNd(r.raw_license) && isServableImageUrl(r.image_url);
function heroOrder(a, b) {
  const at = hostTierRank(a.image_url), bt = hostTierRank(b.image_url);
  if (at !== bt) return at - bt;
  const al = a.is_lead === true ? 0 : 1, bl = b.is_lead === true ? 0 : 1;
  if (al !== bl) return al - bl;
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER, bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return String(a.image_url).localeCompare(String(b.image_url));
}

// The licence as the credit prints it, and its deed without the language suffix (the page
// adds deed.es / deed.en). The version comes from the stored licence, or from raw_license
// when that names the same licence (utils/photoCredit.ts licenceDeedUrl). Unknown stays
// unknown: no version, no deed link.
function licenceOf(row) {
  const v = classifyLicense(row.license);
  if (!v.allowed) return null;
  if (v.code === 'cc0/pd') {
    const both = `${row.license} ${row.raw_license || ''}`.toLowerCase();
    if (/\bcc0\b|cc[\s_-]*zero|publicdomain\/zero/.test(both)) return { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
    return { name: row.license, url: null };
  }
  const one = (s) => { const m = new Set(String(s || '').toLowerCase().match(/\d\.\d/g) || []); return m.size === 1 ? [...m][0] : null; };
  let ver = one(row.license);
  if (!ver && row.raw_license) {
    const rv = classifyLicense(row.raw_license);
    if (rv.allowed && rv.code === v.code) ver = one(row.raw_license);
  }
  const base = v.code === 'by' ? 'CC BY' : 'CC BY-SA';
  if (!ver) return { name: base, url: null };
  const port = v.jurisdiction ? `${v.jurisdiction}/` : '';
  return { name: `${base} ${ver}${v.jurisdiction ? ' ' + v.jurisdiction.toUpperCase() : ''}`, url: `https://creativecommons.org/licenses/${v.code}/${ver}/${port}` };
}
function sourceOf(row) {
  const u = String(row.source_link || row.image_url || '').toLowerCase();
  if (u.includes('wikimedia') || u.includes('wikipedia')) return 'Wikimedia Commons';
  if (u.includes('inaturalist')) return 'iNaturalist';
  if (u.includes('gbif')) return 'GBIF';
  return row.source || null;
}
const author = (s) => (s ? String(s).replace(/^photo by\s+/i, '').trim() : null);

(async () => {
  const oldPath = path.join(SITE, 'assets/finds.json');
  const old = fs.existsSync(oldPath) ? JSON.parse(fs.readFileSync(oldPath, 'utf8')) : [];
  const oldById = new Map();
  for (const p of old) for (const s of p.species) oldById.set(s.id, s);

  const c = await openReadOnly();
  let quests, rows, imgs;
  try {
    const ids = PLACES.map((p) => p.questId);
    quests = (await c.query(
      `SELECT q.id::text AS id, q.is_active, l.name, l.name_es, l.is_published
         FROM quests q JOIN locations l ON l.id = q.location_id WHERE q.id = ANY($1::uuid[])`, [ids])).rows;
    rows = (await c.query(
      `SELECT qs.quest_id::text, qs.species_id::text AS id, qs.observation_count AS obs, qs.difficulty_score,
              qs.establishment, qs.establishment_source,
              s.scientific_name AS sci, s.common_name_es AS es, s.common_name_en AS en,
              s.iconic_group AS "group", s.family, s.iucn_status AS iucn, s.is_endemic_colombia AS endemic,
              sd.requires_review, sd.content_public->'_hold'->>'kind' AS hold_kind
         FROM quest_species qs
         JOIN species s ON s.id = qs.species_id
         LEFT JOIN species_detail sd ON sd.species_id = qs.species_id
        WHERE qs.quest_id = ANY($1::uuid[]) AND qs.excluded_by_expert = false`, [ids])).rows;
    imgs = (await c.query(
      `SELECT species_id::text, image_url, creator, license, raw_license, source, source_link, is_lead, sort_order
         FROM species_images WHERE species_id = ANY($1::uuid[])`, [[...new Set(rows.map((r) => r.id))]])).rows;
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    await c.end();
  }

  const imgsBy = new Map();
  for (const r of imgs) { if (!imgsBy.has(r.species_id)) imgsBy.set(r.species_id, []); imgsBy.get(r.species_id).push(r); }

  const out = [];
  const stale = [];
  const report = { pulled: [], noPhoto: [], newPhoto: [], renamed: [] };
  for (const place of PLACES) {
    const q = quests.find((x) => x.id === place.questId);
    if (!q || !q.is_active || !q.is_published) throw new Error(`${place.label}: the quest is not active on a published place`);
    const list = rows.filter((r) => r.quest_id === place.questId)
      .filter((r) => {
        const pull = r.requires_review === true && r.hold_kind !== 'hazard_omission';
        if (pull) report.pulled.push(`${place.label}: ${r.sci}`);
        return !pull;
      })
      // The most recorded first; the score only breaks ties and is never shown.
      .sort((a, b) => (b.obs - a.obs) || (b.difficulty_score - a.difficulty_score) || a.sci.localeCompare(b.sci));
    const species = list.map((r) => {
      const es = cleanName(r.es);
      let en = cleanName(r.en);
      if (en && es && en.toLowerCase() === es.toLowerCase()) en = null; // Spanish stored as English
      const s = {
        id: r.id, sci: r.sci, es, en, group: r.group, family: r.family || null,
        iucn: r.iucn && r.iucn !== 'NE' ? r.iucn : null,
        endemic: r.endemic === true,
        introduced: r.establishment === 'introduced' && !!String(r.establishment_source || '').trim(),
        obs: r.obs,
      };
      const o = oldById.get(r.id);
      if (o && (o.es || null) !== es) report.renamed.push(`${o.es} -> ${es} (${r.sci})`);
      const hero = (imgsBy.get(r.id) || []).filter(isClean).sort(heroOrder)[0] || null;
      if (!hero) { report.noPhoto.push(`${place.label}: ${r.sci}`); return Object.assign(s, { img: null }); }
      const lic = licenceOf(hero);
      Object.assign(s, {
        by: author(hero.creator), lic: lic.name, licUrl: lic.url,
        src: sourceOf(hero), srcUrl: /^https?:\/\//.test(hero.source_link || '') ? hero.source_link : null,
        img: null, imgSrc: hero.image_url,
      });
      // A thumbnail stays only while it is still this hero's (same author and licence).
      const thumb = path.join(SITE, 'assets/finds', r.id + '.webp');
      const same = o && o.img && author(o.by) && author(o.by).toLowerCase() === s.by.toLowerCase()
        && classifyLicense(o.lic).allowed && classifyLicense(o.lic).code === classifyLicense(hero.license).code;
      if (fs.existsSync(thumb) && !same) stale.push(thumb);
      if (!same) report.newPhoto.push(`${r.sci}: ${o && o.by ? o.by : '(none)'} -> ${s.by}`);
      return s;
    });
    out.push({ name: q.name, label: place.label, nameEs: q.name_es, questId: place.questId, species });
  }

  const used = new Set(out.flatMap((p) => p.species.map((s) => s.id + '.webp')));
  const dir = path.join(SITE, 'assets/finds');
  const orphans = fs.readdirSync(dir).filter((f) => f.endsWith('.webp') && !used.has(f)).map((f) => path.join(dir, f));
  for (const f of [...new Set([...stale, ...orphans])]) fs.unlinkSync(f);
  fs.writeFileSync(oldPath, JSON.stringify(out));

  console.log(out.map((p) => `${p.nameEs}: ${p.species.length} species, ${p.species.filter((s) => s.es).length} with a Spanish name, ${p.species.filter((s) => s.introduced).length} introduced`).join('\n'));
  console.log(`thumbnails removed: ${stale.length} replaced, ${orphans.length} no longer used`);
  for (const [k, v] of Object.entries(report)) console.log(`${k} (${v.length})${v.length ? ':\n  ' + v.join('\n  ') : ''}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
