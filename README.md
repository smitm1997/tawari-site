# tawari.id

The public site for Tawari. Static HTML on GitHub Pages; pushing to `main` deploys.
Custom domain via `CNAME` (`tawari.id`).

## Pages

| File | Language | Notes |
|---|---|---|
| `index.html` | Spanish (primary) | `lang="es"`, canonical `https://tawari.id/` |
| `en/index.html` | English | Same structure and the same claims; `hreflang` links both ways |
| `privacidad.html` | Spanish | **Generated** from `~/dev/Tawari/docs/legal/privacy-policy.es.md` |
| `privacy.html` | English | **Generated** from `~/dev/Tawari/docs/legal/privacy-policy.en.md` |

Shared styling is `assets/site.css`. Fonts are the app's own (Gelasio, IBM Plex
Mono — SIL OFL, licences in `assets/fonts/`), self-hosted as latin woff2 subsets so
the page makes no third-party requests. There is no analytics and no tracking.

## Rules for the copy

Every number on the page is a live `COUNT(*)` from the database on the date the page
states. Do not round, do not estimate, do not reuse a figure from a document. When
the numbers change, change the date. The audit that produced the current figures,
with each SQL query, is `~/dev/Tawari/docs/handoff/WEBSITE_CLAIM_AUDIT.md`.

Screenshots in `assets/screens/` are real captures from the app on the iOS
simulator. Name the species and the place in the caption. Never stage a thin card.

## Privacy pages

Edit the Markdown drafts in the Tawari repo, then:

```
python3 tools/build_privacy.py --src ~/dev/Tawari/docs/legal --date 2026-09-30
```

The builder **refuses** to write anything while a draft still contains
`[POR DEFINIR]` / `[TO BE DECIDED]`, the DRAFT banner, or the reviewer-notes section.

## Waitlist

The form posts one row to `public.waitlist` through Supabase's REST API using the
publishable key. Row-level security allows anonymous INSERT only. The table and its
policy are created by the founder with the SQL in
`~/dev/Tawari/docs/handoff/sql/` (see the WS-D133 file).

## Screenshots

Capture on the simulator, then convert with `tools/shots.js` (uses the `sharp`
already installed in the Tawari repo):

```
node tools/shots.js /path/to/captures assets/screens
```
