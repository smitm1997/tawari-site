# tawari.id

The public site for Tawari. Static HTML on GitHub Pages; pushing to `main` deploys.
Custom domain via `CNAME` (`tawari.id`), HTTPS enforced.

## Pages

| File | Language | Notes |
|---|---|---|
| `index.html` | Spanish (primary) | `lang="es"`, canonical `https://tawari.id/` |
| `en/index.html` | English | Same structure and the same claims |
| `gincanas.html` / `en/field-finds.html` | ES / EN | The 25 Field-finds, browsable (see the explorer below) |
| `ficha.html` / `en/species-card.html` | ES / EN | **Generated** by `tools/build_ficha.py`: one long species card (the monarch), each section labelled |
| `aprender.html` / `en/learn.html` | ES / EN | Learn: biomes, the families and groups, the essays |
| `estado.html` / `en/status.html` | ES / EN | Every counted figure. Linked from the footer, not the front page. |
| `privacidad.html` / `privacy.html` | ES / EN | **Generated** — see below |

**The header and the waitlist come from one place**, `tools/build_chrome.py`. Founder,
17 Oct 2026: only the first tab goes to the home page. The tabs are Inicio · Gincanas ·
La ficha · Aprender (Home · Field-finds · Species card · Learn). «Únete» / "Join" is a
button that scrolls to the waitlist form at the foot of the same page. The form's block
is copied from the home page of the same language (between `<!-- waitlist:start -->` and
`<!-- waitlist:end -->`), and its script is `assets/waitlist.js`. To change a tab or the
form, edit the tool or the home page's block, then run, in this order:

```
python3 tools/build_ficha.py      # only if the ficha page changed
python3 tools/build_chrome.py     # every page's header and waitlist
node tools/stamp_assets.js        # last
```

`build_privacy.py` and `build_ficha.py` write whole pages, so run `build_chrome.py` after
either one.

Shared styling is `assets/site.css`. Fonts are the app's own (Gelasio, IBM Plex Mono
— SIL OFL, licences in `assets/fonts/`), self-hosted as latin woff2 subsets. There is
no analytics, no tracking, and **no third-party request of any kind** — verify with
`performance.getEntriesByType('resource')` in the console; the list should contain
only `tawari.id`.

**Every stylesheet and script link carries a content stamp** (`assets/site.css?v=01bbba7f`).
GitHub Pages lets a browser keep an asset for 10 minutes, so without the stamp a deploy
can pair new HTML with the old stylesheet: on 16 Oct 2026 revision 2's place cards showed
as full-width bare photos to anyone who had visited before. After editing any
`assets/*.css` or `assets/*.js`, or regenerating a page, run last:

```
node tools/stamp_assets.js
```

`node tools/stamp_assets.js --check` changes nothing and exits 1 when a stamp is missing or
stale; run it before every push. The explorer's data (`assets/finds/*.json`) is fetched with
`cache: 'no-cache'` for the same reason.

## Vocabulary

**Spanish is the source.** English is the second version, never a translation that
reads like one. The word for a curated species list at one place is **«Gincana»** in
Spanish and **"Field-find"** in English — matching `utils/i18n.ts` in the app repo.
Do not write "Quest" on the site; the app moved off that word.

## Rules for the copy

- Every number is a live `COUNT(*)` from the production database on the date stated.
  Do not round, do not estimate, do not reuse a figure from a document. When the
  numbers change, change the date. Count with the app's own filters: `species.is_listed`
  for the catalogue, the place-list statuses of `utils/locationListStatuses.js` (no
  `unconfirmed`), `excluded_by_expert = false` for every Field-find, and
  `requires_review = false AND relationship_category IS NULL` for the spine. The status
  pages say in plain words what each figure counts.
- **Never show difficulty.** `difficulty_tier` and `difficulty_score` are internal and
  never reach a reader, here or in the app. An eBird-frequency "easy" bird presented
  as easy promises something the field does not deliver. Say "recorded often".
- Do not explain that the site is being honest. Be specific instead.
- Name real species at real places. A sentence that could have been written without
  the database reads like it was.

## The Field-find explorer

`gincanas.html` and `en/field-finds.html` hold a browsable view of every live Field-find
in the app (17 Oct 2026: 25 places, 1,497 entries, 900 species), no install, no session.
Pieces:

- `assets/finds/index.json`: the places (slug, names, short label, department, natural
  region, species count, photo-licence summary) and the place the page opens on;
  `assets/finds/<slug>.json`: one place's species, fetched when the place is opened. Both
  are generated from the production database by `tools/build_finds.js`.
- `assets/explorer.js`: rendering, bilingual off `<html lang>`. Names follow the app's
  `localSpeciesName` (the common name in the page's language, else the scientific name in
  italics; Spanish is never shown as English), and a species introduced at that place
  carries the app's «Introducida» / "Introduced" tag. Where the site is stricter than the
  app, `tools/build_finds.js` says so in four short lists, each matched on the stored
  value so it lapses once the database is put right: a Spanish name whose only source is
  non-commercial is not shown (D-NAME-SOURCES), an "English" name that is Spanish text
  is not shown as English, a credit that names the wrong person is corrected, and a
  licence version the database lacks is read from the source. A licence with no known
  version links to its generic page at creativecommons.org (`licExact`), and the public
  domain prints as «dominio público» / "public domain".
- `assets/finds.css`: the place picker, linked from the two Field-find pages only. From
  640 px a chip grid under one small heading per natural region (Caribe, Andina,
  Pacífica, Orinoquía, Amazonía, Insular; a region with no place draws nothing); under
  640 px one native select grouped by region. The department-to-region table is
  `DEPT_REGION` in `tools/build_finds.js`; a department it lacks stops the build.
- Links: `gincanas.html#tayrona` opens a place. The hash is the place's short label
  without accents (`#jb-cali`, `#la-macarena`); the database slug
  (`#parque-nacional-tayrona`) and the hashes the home page used before (`#sonso`) are
  aliases of it.
- `assets/finds/<species-uuid>.webp`: 320 px thumbnails **we host**.

### Why the photos are self-hosted

The source rows point at full-resolution originals across a dozen herbarium and
observation hosts. Hot-linking them would pull megabytes per card on the mobile
connections this audience uses, leak every visitor's IP to twelve third parties
(contradicting the privacy policy), and break whenever one of those servers moved a
file. Every photo is CC0, CC BY, CC BY-SA or public domain — all of which permit
derivatives and commercial use, so resizing and re-hosting is allowed **provided the
credit travels with it**, which it does: `by`, `lic` (with its version when the source
gives one), `licUrl` (the deed), `src` and `srcUrl` (the original) are in each place's file,
and every card's detail view prints the author, links the licence to its deed and the
source to the original, and says «recortada» / "cropped", because the dialog crops the
photo to 4:3. NC and ND licences are excluded entirely, because an app
with a paid tier is commercial use.

### Regenerating it

1. `NODE_PATH=~/dev/Tawari/node_modules node tools/build_finds.js` reads every active
   Field-find on a published place read-only (the app repo's `openReadOnly`, `READONLY_DATABASE_URL`), with the app's
   rules: `excluded_by_expert = false`, the psychoactive or ceremonial hold pulled, the
   app's order (`difficulty_score` descending, never shown), names live, the introduced
   mark, and the card's hero photo (licence gate, NC/ND veto, https, the hero order of
   `services/speciesService.ts`). It writes `assets/finds/index.json` and one
   `assets/finds/<slug>.json` per place with `imgSrc`, deletes a thumbnail whose credit
   no longer matches the hero, every thumbnail no species uses and the file of a place
   no longer live, and prints what changed.
2. `node tools/fetch_find_photos.js assets/finds/index.json assets/finds`

The fetcher runs one request at a time with a pause between requests, honours
Retry-After, asks iNaturalist for its `medium` size and Wikimedia Commons for a 500 px
thumbnail, and identifies itself as `TawariBot/1.0 (+https://tawari.id)`. It skips a
thumbnail already on disk and writes each one whole, so a stopped run resumes: run
step 1, then step 2, again. It **consumes `imgSrc`** from the place files, so run step 1
before each run rather than re-running against its own output. Unreachable sources are
reported and leave `img: null`, which renders as an honest gap rather than a substituted
photograph.

The page opens on the best-documented place, the one whose list rests on the most
records (the sum of its species' observation counts), never on the thinnest: Cerro de
las Tres Cruces' most-recorded species has three observations.

## Footer collage

`assets/collage/` is the WS-D142 collage, baked from the canvas boards and the app's
own icon set (`final-icons/` in the app repo): a 495 × 230 phone vignette at 2× under
480 px, and the 1280 × 280 band at 1×, 1.5× and 2× from 480 px up (cropped to centre
below 1280, scaled above it). A visitor downloads one of the four, and only when the
footer comes near: 72 KB on a phone, 107 to 316 KB on a desktop. The band is
decorative (`aria-hidden`, `alt=""`). The specimen label in its centre is HTML, not
pixels, so it stays sharp and reads «Guía de campo viva» / "Living field guide".

To change it, edit `tools/collage-layout.json` (each icon's box, rotation, flip and
paint order, read off the boards) and run:

```
node tools/bake_collage.js --icons ~/dev/Tawari/final-icons --sharp ~/dev/Tawari/node_modules/sharp
```

On unchanged inputs it reproduces the committed files byte for byte. The icons are
family- and order-level drawings, not portraits of species, and the set has no morpho,
toucan, heliconia or cat: never caption the band with a species it does not show. The
script refuses the platypus wildcard (`other/buckets/other`), the generic mammal and
the cultivated plants.

## Privacy pages

Edit the Markdown in the app repo, then:

```
python3 tools/build_privacy.py --src ~/dev/Tawari/docs/legal --date "<es date>" --date-en "<en date>"
```

The builder **refuses** to write while a draft still contains `[POR DEFINIR]` /
`[TO BE DECIDED]`, the DRAFT banner, or the reviewer-notes section.

## La ficha

`ficha.html` and `en/species-card.html` show the monarch's card from the app, cut into its
17 sections (`assets/ficha/<lang>-<section>.webp`, 720 px wide, 1.1 MB for both languages,
lazy-loaded below the first two). Each band is a slice of a stitched simulator capture:
iPhone 17 Pro, 17 Oct 2026, the app in Spanish and in English. On a wide screen the bands
stack into one continuous card with a numbered label beside each; on a phone each label
sits above its slice. The labels and band heights live in `tools/build_ficha.py`;
`--check` compares the heights with the files. After a new capture, re-cut the bands at
the section rules, update the heights, run the tool, then `build_chrome.py` and the stamp.

## Waitlist

The form posts one row to `public.waitlist` through Supabase's REST API using the
publishable key. Row-level security allows anonymous INSERT only — no select, update
or delete. Table and policy: `docs/handoff/sql/WS-D133-081-waitlist.sql`.

## Weight

Gzipped, as GitHub Pages serves them: `index.html` ~7 KB, `site.css` ~5 KB,
`explorer.js` ~4 KB, and one place's `assets/finds/<slug>.json` instead of the old single
`finds.json`. Thumbnails are ~15 KB each and lazy-load, 24
at a time. A first visit that never scrolls past the hero costs roughly 185 KB,
measured at 375 px on 2026-09-21: fonts 75 KB and the hero screenshot 66 KB of it (the 17 Oct recapture, 540 px wide, is 82 KB to 86 KB).
Opening every card of one Field-find adds 0.7 to 1.4 MB of thumbnails (measured from
`assets/finds/` on 12 Oct 2026), and the footer collage another 72 KB on a phone. Every
decorative image carries `loading="lazy"`; the only eager one is the explorer's
loading icon. Check it before shipping a change that adds images — most of this
audience is on mobile data.
