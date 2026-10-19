#!/usr/bin/env node
// Regenerate the Field-find explorer's data from the production database, READ ONLY, with
// the app's own rules, so the explorer shows what the app shows. Every active Field-find
// on a published place is read (quests.is_active AND locations.is_published, one active
// quest per place, as services/questService.ts getActiveQuestForLocation reads it):
//
//   - the list: quest_species with excluded_by_expert = false (CLAUDE.md: every quest
//     query filters it), minus a psychoactive or ceremonial hold (utils/fieldFindHold.ts:
//     a held card keeps its tile only when its hold is a hazard omission);
//   - the order: the app's (questService.getQuestSpecies, difficulty_score DESC, which is
//     the list's «seen often» sort); the most recorded, then the scientific name, only
//     break ties. The score is never shown;
//   - names: species.common_name_es / _en through the app's cleanName (utils/species.ts),
//     and an "English" name that is the Spanish text is dropped, because the app's rule
//     is that Spanish is never shown as English (localSpeciesName); place names as the
//     app's locationName draws them ('full' and 'label');
//   - the introduced mark: quest_species.establishment = 'introduced' WITH a source
//     (services/questService.ts introducedMarkOf);
//   - the photo: the card's hero, i.e. the clean rows (utils/licenseGate.js plus the
//     raw_license NC/ND veto, https and not a refusing host) ordered by host tier,
//     is_lead, sort_order, URL (services/speciesService.ts compareHeroCandidates);
//     the credit carries the author, the licence with its version and its deed, and
//     the source link.
//
// Where the site is stricter than the app (each entry below says why, and each is
// matched on the stored value, so it stops applying once the database is put right):
//   - SITE_HIDES_ES: a Spanish name whose only source is non-commercial is not shown
//     (founder ruling D-NAME-SOURCES: never NC); the scientific name leads instead;
//   - SITE_HIDES_EN: an "English" name that is Spanish text is not shown as English;
//   - CREDIT_FIX: a credit whose stored author is not the photo's author;
//   - FOCUS: where the page crops an upright photo whose subject the centre crop cuts;
//   - LICENCE_VERSION: the licence version read today from the source when the
//     database stores none. A licence with no version known links to its generic page
//     at creativecommons.org (which forwards to the current version), not to a deed.
//
//   NODE_PATH=~/dev/Tawari/node_modules node tools/build_finds.js [--app ~/dev/Tawari]
//   node tools/fetch_find_photos.js assets/finds/index.json assets/finds
//
// It connects with the app repo's read-only helper (scripts/register/registerCanary.js
// openReadOnly: READONLY_DATABASE_URL, a READ ONLY transaction, refuses otherwise). It
// writes nothing to the database. It writes, all under assets/finds/:
//   - index.json: the places (slug, names, label, department, natural region, species
//     count, photo-licence summary) grouped by Colombia's natural regions, and the
//     default place;
//   - <slug>.json, one per place: its species, with `imgSrc` on every species that has a
//     photo (and `img` already set when its thumbnail is on disk and still this hero's).
// It DELETES a local thumbnail whose credit no longer matches the hero (and thumbnails no
// species uses any more), so the fetcher downloads the current one, and a place file no
// active Field-find uses any more. Its report goes to stdout.
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

// Colombia's six natural regions, in the order the picker draws them (north to south, then
// the islands). A region with no live place draws nothing.
const REGIONS = [
  { id: 'caribe', es: 'Caribe', en: 'Caribbean' },
  { id: 'andina', es: 'Andina', en: 'Andean' },
  { id: 'pacifica', es: 'Pacífica', en: 'Pacific' },
  { id: 'orinoquia', es: 'Orinoquía', en: 'Orinoquía' },
  { id: 'amazonia', es: 'Amazonía', en: 'Amazon' },
  { id: 'insular', es: 'Insular', en: 'Insular' },
];
// Department (locations.region) to natural region, fixed. A department that spans two
// regions takes the one most of it lies in, which is also where every live place in it
// lies today: Antioquia, Cauca, Nariño and Valle del Cauca are Andina (the Botanical
// Garden of Cali, Puracé and La Cocha are all in the Andes). A place on the other side of
// such a line goes in PLACE_REGION. A department missing here stops the build, so a place
// in a new department is placed by a person, never by a guess.
const DEPT_REGION = {
  'Amazonas': 'amazonia', 'Antioquia': 'andina', 'Arauca': 'orinoquia', 'Atlántico': 'caribe',
  'Bogotá D.C.': 'andina', 'Bolívar': 'caribe', 'Boyacá': 'andina', 'Caldas': 'andina',
  'Caquetá': 'amazonia', 'Casanare': 'orinoquia', 'Cauca': 'andina', 'Cesar': 'caribe',
  'Chocó': 'pacifica', 'Córdoba': 'caribe', 'Cundinamarca': 'andina', 'Guainía': 'amazonia',
  'Guaviare': 'amazonia', 'Huila': 'andina', 'La Guajira': 'caribe', 'Magdalena': 'caribe',
  'Meta': 'orinoquia', 'Nariño': 'andina', 'Norte de Santander': 'andina', 'Putumayo': 'amazonia',
  'Quindío': 'andina', 'Risaralda': 'andina', 'San Andrés y Providencia': 'insular',
  'Santander': 'andina', 'Sucre': 'caribe', 'Tolima': 'andina', 'Valle del Cauca': 'andina',
  'Vaupés': 'amazonia', 'Vichada': 'orinoquia',
};
// locations.slug -> region, for a place whose natural region is not its department's.
const PLACE_REGION = {};
// The hashes the site used before every Field-find was on it (gincanas.html#sonso, linked
// from the home page's three cards). They keep opening the same place.
const LEGACY_HASH = {
  'c523fc50-fb13-463e-a9a0-608d164efe6c': 'jb-cali',
  'a2912929-c9ef-42b0-a5e7-fe23e6d79b33': 'sonso',
  'ec58a04f-0e76-4d59-a274-5e493272b380': 'tres-cruces',
};
// The page's hash for a place: its short label, lower case, without accents (#tayrona,
// #jb-cali, #la-macarena).
const slugOf = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// The licence family the page's photo line names, from the credit's own licence text
// (licenceOf below): CC BY, CC BY-SA, CC0, or the public domain. The same rule is in
// tools/fetch_find_photos.js, which recounts once the thumbnails are on disk.
const licFamily = (lic) => (/^CC BY-SA/.test(lic) ? 'CC BY-SA' : /^CC BY/.test(lic) ? 'CC BY' : /^CC0/.test(lic) ? 'CC0' : 'PD');

// Read 12 Oct 2026: SiB Catálogo record 56c77cf4f0106c67230e73ef gives «Tingua de Pico
// Rojo» under CC BY-NC-SA 4.0, rights Asociación Bogotana de Ornitología, and the ACO
// 2007 list has no other name for it (WP-199, bucket C). Pending the founder's ruling.
const SITE_HIDES_ES = { 'Gallinula galeata': 'Tingua de pico rojo' };
// Spanish text stored in common_name_en (the Spanish page still shows the Spanish name).
const SITE_HIDES_EN = { 'Sciurus granatensis': 'Ardilla de cola roja', 'Alcantarea imperialis': 'Bromelia Imperial' };
// Read 12 Oct 2026, GBIF occurrence 4601936523 (Kew K002085707): media rightsHolder
// «Royal Botanic Gardens, Kew», no creator; «Croat, T.B.» is the specimen's collector.
const KEW_K002085707 = { by: 'Royal Botanic Gardens, Kew', src: 'GBIF', srcUrl: 'https://www.gbif.org/occurrence/4601936523' };
const CREDIT_FIX = {
  'https://d2jcv3kl45hlgi.cloudfront.net/386433e2f08d216197dc2aa058d0425b.jpg': KEW_K002085707,
  'https://d2jcv3kl45hlgi.cloudfront.net/8a2d4238a5c89edd2e8e5c4df6750e2f.jpg': KEW_K002085707,
};
// Read 12 Oct 2026 from GBIF's iNaturalist Research-grade Observations dataset, the
// photo's own media licence (occurrence key in the comment). The database stores only
// iNaturalist's unversioned code (cc-by, cc-by-sa).
const LICENCE_VERSION = {
  'https://inaturalist-open-data.s3.amazonaws.com/photos/690782089/large.jpg': '4.0', // GBIF 6480224471, by-sa/4.0
  'https://inaturalist-open-data.s3.amazonaws.com/photos/6715134/large.jpeg': '4.0', // GBIF 1457587162, by-sa/4.0
  'https://inaturalist-open-data.s3.amazonaws.com/photos/11722205/large.jpeg': '4.0', // GBIF 3070265432, by/4.0
};

// The page crops every photo to 4:3 from its centre (site.css). These heroes are upright
// photos whose subject's head the centre crop cuts off; the page crops them from 15% down
// instead (object-position, `pos` on the species). Chosen by eye on 17 Oct 2026 from all
// 216 portrait thumbnails, each at 0, 15, 30 and 50%. Matched on the hero's URL, so an
// entry lapses when the app's hero changes.
const FOCUS = {
  'https://inaturalist-open-data.s3.amazonaws.com/photos/605693913/original.jpg': 15, // Buteogallus anthracinus
  'https://inaturalist-open-data.s3.amazonaws.com/photos/605120014/original.jpg': 15, // Nycticorax nycticorax
  'https://upload.wikimedia.org/wikipedia/commons/c/c5/Porphyrio_martinica_%2853612882274%29.jpg': 15, // Porphyrio martinica
  'https://upload.wikimedia.org/wikipedia/commons/4/46/Pharomachrus_fulgidus_518265753.jpg': 15, // Pharomachrus fulgidus
  'https://inaturalist-open-data.s3.amazonaws.com/photos/610444786/original.jpg': 15, // Manacus manacus
  'https://inaturalist-open-data.s3.amazonaws.com/photos/609989508/original.jpg': 15, // Dendroplex picus
  'https://inaturalist-open-data.s3.amazonaws.com/photos/608009791/original.jpg': 15, // Anisognathus igniventris
  'https://inaturalist-open-data.s3.amazonaws.com/photos/608007825/original.jpg': 15, // Diglossa humeralis
  'https://upload.wikimedia.org/wikipedia/commons/c/c1/Margarornis_squamiger_-NBII_Image_Gallery-a00214.jpg': 15, // Margarornis squamiger
  'https://inaturalist-open-data.s3.amazonaws.com/photos/620952970/original.jpg': 15, // Calliphlox mitchellii
  'https://upload.wikimedia.org/wikipedia/commons/9/96/Greenish_Puffleg_%28Haplophaedia_aureliae%29.jpg': 15, // Haplophaedia aureliae
  'https://upload.wikimedia.org/wikipedia/commons/a/a3/Patagioenas_subvinacea_Paloma_colorada_Ruddy_Pigeon_%2836720583912%29.jpg': 15, // Patagioenas subvinacea
  'https://upload.wikimedia.org/wikipedia/commons/1/1a/Tangara_nigroviridis.jpg': 15, // Tangara nigroviridis
  'https://inaturalist-open-data.s3.amazonaws.com/photos/624772585/original.jpg': 15, // Amazona mercenaria
  'https://upload.wikimedia.org/wikipedia/commons/f/f1/Microcerculus_marginatus.jpg': 15, // Microcerculus marginatus
  'https://upload.wikimedia.org/wikipedia/commons/b/b6/Tangara_chilensis_309100152.jpg': 15, // Tangara chilensis
  // a near-square photo whose head is at its top edge: crop from the top
  'https://inaturalist-open-data.s3.amazonaws.com/photos/250763779/original.jpg': 0, // Tyrannus melancholicus
};
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
  if (!ver && LICENCE_VERSION[row.image_url]) ver = LICENCE_VERSION[row.image_url];
  const base = v.code === 'by' ? 'CC BY' : 'CC BY-SA';
  // No version known: the licence's generic page, printed as is (no deed suffix).
  if (!ver) return { name: base, url: `https://creativecommons.org/licenses/${v.code}/`, exact: true };
  const port = v.jurisdiction ? `${v.jurisdiction}/` : '';
  return { name: `${base} ${ver}${v.jurisdiction ? ' ' + v.jurisdiction.toUpperCase() : ''}`, url: `https://creativecommons.org/licenses/${v.code}/${ver}/${port}` };
}
function sourceOf(row) {
  const u = String(row.source_link || row.image_url || '').toLowerCase();
  if (u.includes('wikimedia') || u.includes('wikipedia')) return 'Wikimedia Commons';
  if (u.includes('inaturalist')) return 'iNaturalist';
  if (u.includes('gbif')) return 'GBIF';
  const named = { gbif: 'GBIF', inaturalist: 'iNaturalist', wikimedia: 'Wikimedia Commons' };
  return named[String(row.source || '').toLowerCase()] || row.source || null;
}
const author = (s) => (s ? String(s).replace(/^photo by\s+/i, '').replace(/\s+/g, ' ').trim() : null);

const sameText = (a, b) => (author(a) || '').toLowerCase() === (author(b) || '').toLowerCase();
const byLabel = (a, b) => a.labelEs.localeCompare(b.labelEs, 'es');

(async () => {
  const DIR = path.join(SITE, 'assets/finds');
  const LEGACY = path.join(SITE, 'assets/finds.json'); // the three-place file this replaces
  // What the site holds now, to tell a thumbnail that is still its hero's from one that is not.
  const oldById = new Map();
  const oldFiles = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const oldPlaces = oldFiles.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).species);
  if (fs.existsSync(LEGACY)) for (const p of JSON.parse(fs.readFileSync(LEGACY, 'utf8'))) oldPlaces.push(p.species);
  for (const list of oldPlaces) for (const s of list) oldById.set(s.id, s);

  const c = await openReadOnly();
  let quests, rows, imgs;
  try {
    // Every active Field-find on a published place: the app reads one active quest per
    // place (getActiveQuestForLocation), and RLS hides an unpublished place.
    quests = (await c.query(
      `SELECT q.id::text AS id, l.id::text AS location_id, l.slug AS db_slug, l.name, l.name_es,
              l.label_name, l.label_name_es, l.region AS dept, l.country_code
         FROM quests q JOIN locations l ON l.id = q.location_id
        WHERE q.is_active = true AND l.is_published = true`)).rows;
    const ids = quests.map((q) => q.id);
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
  if (!quests.length) throw new Error('no active Field-find on a published place: refusing to write an empty explorer');
  const perPlace = new Map();
  for (const q of quests) {
    if (perPlace.has(q.location_id)) throw new Error(`${q.name}: more than one active Field-find on one place (the app reads one)`);
    perPlace.set(q.location_id, q);
  }

  const imgsBy = new Map();
  for (const r of imgs) { if (!imgsBy.has(r.species_id)) imgsBy.set(r.species_id, []); imgsBy.get(r.species_id).push(r); }

  const places = [];
  const files = new Map(); // slug -> species list
  const stale = new Set();
  const report = { pulled: [], noPhotoRows: [], refusedByGate: [], newPhoto: [], renamed: [], siteHidden: [], creditFixed: [] };
  for (const q of quests) {
    const region = PLACE_REGION[q.db_slug] || DEPT_REGION[q.dept];
    if (!region) throw new Error(`${q.name}: department «${q.dept}» has no natural region in DEPT_REGION; add it (or the place to PLACE_REGION)`);
    // locationName (utils/species.ts): 'full' and 'label', in each language.
    const label = q.label_name || q.name;
    const labelEs = q.label_name_es || q.label_name || q.name_es || q.name;
    const slug = slugOf(labelEs);
    const list = rows.filter((r) => r.quest_id === q.id)
      .filter((r) => {
        const pull = r.requires_review === true && r.hold_kind !== 'hazard_omission';
        if (pull) report.pulled.push(`${labelEs}: ${r.sci}`);
        return !pull;
      })
      // The app's order (getQuestSpecies: difficulty_score DESC, the «seen often» sort).
      // The score is never shown; the most recorded, then the name, only break ties.
      .sort((a, b) => (b.difficulty_score - a.difficulty_score) || (b.obs - a.obs) || a.sci.localeCompare(b.sci));
    const species = list.map((r) => {
      let es = cleanName(r.es);
      let en = cleanName(r.en);
      if (en && es && en.toLowerCase() === es.toLowerCase()) en = null; // Spanish stored as English
      if (en && SITE_HIDES_EN[r.sci] === en) { en = null; report.siteHidden.push(`EN «${r.en}» (${r.sci})`); }
      if (es && SITE_HIDES_ES[r.sci] === es) { es = null; report.siteHidden.push(`ES «${r.es}» (${r.sci})`); }
      const s = {
        id: r.id, sci: r.sci, es, en, group: r.group, family: r.family || null,
        iucn: r.iucn && r.iucn !== 'NE' ? r.iucn : null,
        endemic: r.endemic === true,
        introduced: r.establishment === 'introduced' && !!String(r.establishment_source || '').trim(),
        obs: r.obs,
      };
      const o = oldById.get(r.id);
      if (o && (o.es || null) !== es) report.renamed.push(`${o.es} -> ${es} (${r.sci})`);
      const all = imgsBy.get(r.id) || [];
      const hero = all.filter(isClean).sort(heroOrder)[0] || null;
      if (!hero) {
        // No row passes the licence gate, the NC/ND veto, https and the host check: the
        // card shows the honest gap, never a substitute.
        (all.length ? report.refusedByGate : report.noPhotoRows).push(`${labelEs}: ${r.sci}${all.length ? ` (${all.length} rows refused)` : ''}`);
        return Object.assign(s, { img: null });
      }
      const lic = licenceOf(hero);
      Object.assign(s, {
        by: author(hero.creator), lic: lic.name, licUrl: lic.url,
        src: sourceOf(hero), srcUrl: /^https?:\/\//.test(hero.source_link || '') ? hero.source_link : null,
        img: null, imgSrc: hero.image_url,
      });
      if (lic.exact) s.licExact = true;
      if (FOCUS[hero.image_url] != null) s.pos = FOCUS[hero.image_url];
      const fix = CREDIT_FIX[hero.image_url];
      if (fix) { Object.assign(s, fix); report.creditFixed.push(`${r.sci}: ${author(hero.creator)} -> ${fix.by}`); }
      // A thumbnail stays only while it is still this hero's: the same author, licence and
      // source link as the credit it was made under. A thumbnail fetched for a credit the
      // fetcher has not yet written back (imgSrc still set) counts as that credit's.
      const thumb = path.join(DIR, r.id + '.webp');
      const same = !!(o && (o.img || o.imgSrc) && sameText(o.by, s.by)
        && classifyLicense(o.lic).allowed && classifyLicense(o.lic).code === classifyLicense(hero.license).code
        && (o.srcUrl || null) === (s.srcUrl || null));
      if (fs.existsSync(thumb) && !same) stale.add(thumb);
      if (!same) report.newPhoto.push(`${r.sci}: ${o && o.by ? o.by : '(none)'} -> ${s.by}`);
      return s;
    });
    const aliases = [...new Set([q.db_slug, LEGACY_HASH[q.id]].filter((a) => a && a !== slug))];
    places.push({
      slug, aliases, questId: q.id, name: q.name, nameEs: q.name_es || q.name, label, labelEs,
      dept: q.dept, region, count: species.length,
      records: species.reduce((n, s) => n + (s.obs || 0), 0),
    });
    files.set(slug, species);
  }

  // Every hash names one place: a slug or an alias used twice stops the build.
  const taken = new Map();
  for (const p of places) for (const h of [p.slug, ...p.aliases]) {
    if (taken.has(h)) throw new Error(`hash #${h} names both ${taken.get(h)} and ${p.labelEs}`);
    taken.set(h, p.labelEs);
  }

  // Thumbnails: drop the stale and the unused, then point every species at the one on disk.
  const used = new Set([...files.values()].flatMap((l) => l.map((s) => s.id + '.webp')));
  // (a .part is a thumbnail the fetcher was writing when it was stopped)
  const orphans = fs.readdirSync(DIR).filter((f) => (f.endsWith('.webp') && !used.has(f)) || f.endsWith('.part')).map((f) => path.join(DIR, f));
  for (const f of new Set([...stale, ...orphans])) fs.unlinkSync(f);
  for (const list of files.values()) for (const s of list) {
    if (s.imgSrc && fs.existsSync(path.join(DIR, s.id + '.webp'))) s.img = 'assets/finds/' + s.id + '.webp';
  }

  // The photo-licence summary is of what the page can show now; the fetcher recounts it.
  for (const p of places) {
    const shown = files.get(p.slug).filter((s) => s.img || s.imgSrc);
    p.photos = shown.length;
    p.lic = {};
    for (const s of shown) { const k = licFamily(s.lic); p.lic[k] = (p.lic[k] || 0) + 1; }
  }

  // Natural region, then the label; the default is the best-documented place, the one
  // whose list rests on the most records (README: never open on the thinnest list).
  const order = REGIONS.map((r) => r.id);
  places.sort((a, b) => (order.indexOf(a.region) - order.indexOf(b.region)) || byLabel(a, b));
  const best = places.slice().sort((a, b) => (b.records - a.records) || (b.photos - a.photos) || byLabel(a, b))[0];
  const index = {
    asOf: new Date().toISOString().slice(0, 10),
    default: best.slug,
    regions: REGIONS.filter((r) => places.some((p) => p.region === r.id)),
    places: places.map(({ records, ...p }) => p),
  };

  for (const f of oldFiles) if (!files.has(f.replace(/\.json$/, ''))) fs.unlinkSync(path.join(DIR, f));
  for (const [slug, species] of files) fs.writeFileSync(path.join(DIR, slug + '.json'), JSON.stringify({ slug, species }));
  fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(index));
  if (fs.existsSync(LEGACY)) { fs.unlinkSync(LEGACY); console.log('removed assets/finds.json (replaced by assets/finds/index.json and one file per place)'); }

  const distinct = new Set([...files.values()].flatMap((l) => l.map((s) => s.id)));
  console.log(`${places.length} Field-finds, ${[...files.values()].reduce((n, l) => n + l.length, 0)} entries, ${distinct.size} distinct species; default #${best.slug}`);
  console.log(places.map((p) => `${p.region.padEnd(9)} #${p.slug.padEnd(16)} ${p.nameEs}: ${p.count} species, ${p.photos} with a photo, ${files.get(p.slug).filter((s) => s.es).length} with a Spanish name, ${files.get(p.slug).filter((s) => s.introduced).length} introduced`).join('\n'));
  console.log(`thumbnails removed: ${stale.size} replaced, ${orphans.length} no longer used`);
  const SHOW = process.argv.includes('--all') ? Infinity : 40; // --all prints every line
  for (const [k, v] of Object.entries(report)) console.log(`${k} (${v.length})${v.length ? ':\n  ' + v.slice(0, SHOW).join('\n  ') + (v.length > SHOW ? `\n  ... and ${v.length - SHOW} more (--all)` : '') : ''}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
