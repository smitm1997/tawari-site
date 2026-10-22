#!/usr/bin/env python3
"""Build privacidad.html (ES) and privacy.html (EN) from the Markdown drafts in the
Tawari repo. Stdlib only.

FAIL-CLOSED: the build refuses if either draft still carries a placeholder
([POR DEFINIR] / [TO BE DECIDED]), a DRAFT banner, or the reviewer-notes section.
Publishing an unfinished policy is worse than publishing none, so the script will
not produce a file it would be wrong to ship.

Usage:
  python3 tools/build_privacy.py --src ~/dev/Tawari/docs/legal --date 2026-09-30
Writes ./privacidad.html and ./privacy.html next to index.html.
"""
import argparse, hashlib, html, os, re, sys, datetime

BLOCKERS = [
    ("[POR DEFINIR]", "placeholder"),
    ("[TO BE DECIDED]", "placeholder"),
    ("BORRADOR — PENDIENTE", "draft banner"),
    ("DRAFT — PENDING", "draft banner"),
    ("## Notas para el revisor", "reviewer notes section"),
    ("## Reviewer notes", "reviewer notes section"),
]

# The policy's own contact address (docs/legal; the app's CONTACT_EMAIL, utils/contact.ts). The
# footer repeats it, so a page never names two addresses. It named an old .app domain until 11 Oct
# 2026, a domain Tawari does not own.
CONTACT = "hello@tawari.id"

PAGE = {
    "es": dict(file="privacidad.html", lang="es", other="privacy.html", other_lang="en",
               other_label="English", back="‹ Volver a Tawari", home="./", lang_nav="Idioma",
               updated="Última actualización", title="Política de privacidad · Tawari",
               desc="Qué datos recoge la aplicación Tawari, para qué y qué puedes hacer al respecto.",
               delete_para="<p><strong>Eliminación de tus datos.</strong>", delete_href="eliminar-cuenta.html",
               delete_anchor="eliminar-cuenta",
               delete_lead="Los pasos, con la app o sin ella, y lo que se borra y lo que se conserva:",
               delete_label="Eliminar tu cuenta de Tawari", delete_foot="Eliminar tu cuenta"),
    "en": dict(file="privacy.html", lang="en", other="privacidad.html", other_lang="es",
               other_label="Español", back="‹ Back to Tawari", home="en/", lang_nav="Language",
               updated="Last updated", title="Privacy policy · Tawari",
               desc="What the Tawari app collects, what it is used for, and what you can do about it.",
               delete_para="<p><strong>Deleting your data.</strong>", delete_href="delete-account.html",
               delete_anchor="delete-account",
               delete_lead="The steps, with or without the app, and what is deleted and what is kept:",
               delete_label="Delete your Tawari account", delete_foot="Delete your account"),
}


def inline(md: str) -> str:
    s = html.escape(md, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\b([a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})\b", r'<a href="mailto:\1">\1</a>', s)
    return s


def md_to_html(md: str) -> str:
    out, para, i = [], [], 0
    lines = md.splitlines()

    def flush():
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para.clear()

    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            flush(); i += 1; continue
        if ln.startswith("---"):
            flush(); out.append("<hr>"); i += 1; continue
        m = re.match(r"^(#{1,3})\s+(.*)", ln)
        if m:
            flush(); lvl = len(m.group(1)); out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>"); i += 1; continue
        if ln.startswith(">"):
            flush(); q = []
            while i < len(lines) and lines[i].startswith(">"):
                q.append(lines[i].lstrip("> ").rstrip()); i += 1
            out.append("<blockquote><p>" + inline(" ".join(q)) + "</p></blockquote>"); continue
        if ln.lstrip().startswith("|"):
            flush(); rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            rows = [r for r in rows if not all(re.fullmatch(r":?-{2,}:?", c) for c in r)]
            th = "".join(f"<th>{inline(c)}</th>" for c in rows[0])
            tds = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
            out.append(f"<table><thead><tr>{th}</tr></thead><tbody>{tds}</tbody></table>"); continue
        m = re.match(r"^\s*(?:[-*]|\d+\.)\s+(.*)", ln)
        if m:
            flush(); ordered = bool(re.match(r"^\s*\d+\.", ln)); items = []
            while i < len(lines) and re.match(r"^\s*(?:[-*]|\d+\.)\s+", lines[i]):
                item = [re.sub(r"^\s*(?:[-*]|\d+\.)\s+", "", lines[i])]; i += 1
                while i < len(lines) and lines[i].startswith("   ") and lines[i].strip():
                    item.append(lines[i].strip()); i += 1
                items.append("<li>" + inline(" ".join(item)) + "</li>")
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(items) + f"</{tag}>"); continue
        para.append(ln.strip()); i += 1
    flush()
    return "\n".join(out)


def add_delete_link(body: str, p: dict, path: str) -> str:
    """The account-deletion page (eliminar-cuenta.html / delete-account.html), linked right after the
    policy's own deletion paragraph in section 6, with an anchor, as Google Play asks of a policy that
    mentions deletion (WP-253). Fail-closed: if the paragraph has moved or been reworded, stop rather
    than publish a policy without the link."""
    i = body.find(p["delete_para"])
    if i < 0:
        sys.exit(f"REFUSED: {os.path.basename(path)} has no {p['delete_para']!r} paragraph to hang the "
                 f"deletion-page link on. Update PAGE in this tool. Nothing was written.")
    j = body.find("</p>", i) + len("</p>")
    link = (f'\n<p id="{p["delete_anchor"]}">{p["delete_lead"]} '
            f'<a href="{p["delete_href"]}"><strong>{p["delete_label"]}</strong></a>.</p>')
    return body[:j] + link + body[j:]


def build(lang: str, src_dir: str, date: str, css_href: str) -> str:
    p = PAGE[lang]
    path = os.path.join(src_dir, f"privacy-policy.{lang}.md")
    md = open(path, encoding="utf-8").read()
    for needle, why in BLOCKERS:
        if needle in md:
            sys.exit(f"REFUSED: {os.path.basename(path)} still contains a {why} ({needle!r}). "
                     f"Resolve it in the Markdown, then rebuild. Nothing was written.")
    # Drop the "Versión / Version" metadata line — the page carries its own date.
    md = re.sub(r"^\*\*Versi[oó]n:\*\*.*$|^\*\*Version:\*\*.*$", "", md, flags=re.M)
    body = add_delete_link(md_to_html(md), p, path)
    return f"""<!DOCTYPE html>
<html lang="{p['lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{p['title']}</title>
<meta name="description" content="{html.escape(p['desc'])}">
<link rel="canonical" href="https://tawari.id/{p['file']}">
<link rel="alternate" hreflang="es" href="https://tawari.id/privacidad.html">
<link rel="alternate" hreflang="en" href="https://tawari.id/privacy.html">
<link rel="icon" href="assets/favicon-32.png" type="image/png">
<link rel="stylesheet" href="{css_href}">
</head>
<body class="doc">
<header class="bar">
  <a class="wordmark" href="{p['home']}"><img src="assets/mark-morpho-56.webp" alt="" width="28" height="28">Tawari</a>
  <nav class="lang" aria-label="{p['lang_nav']}"><a href="{p['other']}" hreflang="{p['other_lang']}" lang="{p['other_lang']}">{p['other_label']}</a></nav>
</header>
<main class="prose">
<p class="eyebrow"><a href="{p['home']}">{p['back']}</a></p>
{body}
<p class="meta">{p['updated']}: {date}</p>
</main>
<footer class="foot"><p>© 2026 Tawari · <a href="mailto:{CONTACT}">{CONTACT}</a> · <a href="{p['delete_href']}">{p['delete_foot']}</a></p></footer>
</body>
</html>
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="directory holding privacy-policy.es.md / .en.md")
    ap.add_argument("--date", required=True, help="effective date, Spanish wording (e.g. 18 de septiembre de 2026)")
    ap.add_argument("--date-en", dest="date_en", required=True, help="the same date in English wording (e.g. 18 September 2026)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), ".."))
    a = ap.parse_args()
    src = os.path.expanduser(a.src)
    dates = {"es": a.date, "en": a.date_en}
    with open(os.path.join(os.path.dirname(__file__), "..", "assets", "site.css"), "rb") as f:
        css_v = hashlib.sha256(f.read()).hexdigest()[:8]  # the stamp tools/stamp_assets.js gives
    pages = {lang: build(lang, src, dates[lang], f"assets/site.css?v={css_v}") for lang in ("es", "en")}  # both must pass before either is written
    for lang, doc in pages.items():
        dest = os.path.join(a.out, PAGE[lang]["file"])
        with open(dest, "w", encoding="utf-8") as f:
            f.write(doc)
        print(f"wrote {dest} ({len(doc.encode('utf-8'))} bytes)")
