# tawari.id

The public site for Tawari. Static HTML on GitHub Pages; pushing to `main` deploys.
Custom domain via `CNAME` (`tawari.id`), HTTPS enforced.

## Pages

| File | Language | Notes |
|---|---|---|
| `index.html` | Spanish (primary) | `lang="es"`, canonical `https://tawari.id/` |
| `en/index.html` | English | Same structure and the same claims |
| `estado.html` / `en/status.html` | ES / EN | Every counted figure. Linked from the footer, not the front page. |
| `privacidad.html` / `privacy.html` | ES / EN | **Generated** — see below |

Shared styling is `assets/site.css`. Fonts are the app's own (Gelasio, IBM Plex Mono
— SIL OFL, licences in `assets/fonts/`), self-hosted as latin woff2 subsets. There is
no analytics, no tracking, and **no third-party request of any kind** — verify with
`performance.getEntriesByType('resource')` in the console; the list should contain
only `tawari.id`.

## Vocabulary

**Spanish is the source.** English is the second version, never a translation that
reads like one. The word for a curated species list at one place is **«Gincana»** in
Spanish and **"Field-find"** in English — matching `utils/i18n.ts` in the app repo.
Do not write "Quest" on the site; the app moved off that word.

## Rules for the copy

- Every number is a live `COUNT(*)` from the production database on the date stated.
  Do not round, do not estimate, do not reuse a figure from a document. When the
  numbers change, change the date. Queries: `docs/handoff/WEBSITE_CLAIM_AUDIT.md`.
- **Never show difficulty.** `difficulty_tier` and `difficulty_score` are internal and
  never reach a reader, here or in the app. An eBird-frequency "easy" bird presented
  as easy promises something the field does not deliver. Say "recorded often".
- Do not explain that the site is being honest. Be specific instead.
- Name real species at real places. A sentence that could have been written without
  the database reads like it was.

## The Field-find explorer

`index.html` and `en/index.html` embed a browsable view of the three active
Field-finds — 300 species, no install, no session. Pieces:

- `assets/finds.json` — the data, generated from the production database.
- `assets/explorer.js` — rendering, bilingual off `<html lang>`.
- `assets/finds/<species-uuid>.webp` — 320 px thumbnails **we host**.

### Why the photos are self-hosted

The source rows point at full-resolution originals across a dozen herbarium and
observation hosts. Hot-linking them would pull megabytes per card on the mobile
connections this audience uses, leak every visitor's IP to twelve third parties
(contradicting the privacy policy), and break whenever one of those servers moved a
file. Every photo is CC0, CC BY, CC BY-SA or public domain — all of which permit
derivatives and commercial use — so resizing and re-hosting is allowed **provided the
credit travels with it**, which it does: `by` and `lic` are in `finds.json` and render
in every card's detail view. NC and ND licences are excluded entirely, because an app
with a paid tier is commercial use.

### Regenerating it

1. Run the query in `docs/handoff/WEBSITE_CLAIM_AUDIT.md` (§ Field-finds) against the
   production database, read-only, and save the result as `assets/finds.json`.
2. `node tools/fetch_find_photos.js assets/finds.json assets/finds`

The fetcher is idempotent for thumbnails but **consumes `imgSrc`** from the JSON, so
regenerate `finds.json` from the query before each run rather than re-running against
its own output. Unreachable sources are reported and leave `img: null`, which renders
as an honest gap rather than a substituted photograph.

Keep the places ordered best-documented first. Alphabetical puts Cerro de las Tres
Cruces — whose most-recorded species has three observations — in front of the
Botanical Garden's 428, which is the weakest possible first impression.

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

## Waitlist

The form posts one row to `public.waitlist` through Supabase's REST API using the
publishable key. Row-level security allows anonymous INSERT only — no select, update
or delete. Table and policy: `docs/handoff/sql/WS-D133-081-waitlist.sql`.

## Weight

Gzipped, as GitHub Pages serves them: `index.html` ~6 KB, `site.css` ~5 KB,
`explorer.js` ~3 KB, `finds.json` ~24 KB. Thumbnails are ~15 KB each and lazy-load, 24
at a time. A first visit that never scrolls past the hero costs roughly 185 KB,
measured at 375 px on 2026-09-21: fonts 75 KB and the hero screenshot 66 KB of it.
Opening all 100 cards of one Field-find adds 1.2 to 1.5 MB of thumbnails (measured
from `assets/finds/`), and the footer collage another 72 KB on a phone. Every
decorative image carries `loading="lazy"`; the only eager one is the explorer's
loading icon. Check it before shipping a change that adds images — most of this
audience is on mobile data.
