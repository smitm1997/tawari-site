#!/usr/bin/env python3
"""The site's chrome, from one place: the header tabs and the waitlist block on every page.

Founder, 17 Oct 2026: only the first tab goes to the home page; every other tab is its own
page. Tabs: Inicio · Gincanas · La ficha · Aprender (Home · Field-finds · Species card · Learn),
plus an «Únete» button that goes to the waitlist form at the foot of the SAME page, so it never
leaves the page you are on.

- The header of each page is rebuilt (the page's own language link is kept as it is).
- The waitlist block is copied from the home page of the same language (between the
  <!-- waitlist:start --> and <!-- waitlist:end --> markers) to just after </main>.
- The form's script lives in assets/waitlist.js; this adds the tag where it is missing.

Run order: build_privacy.py and build_ficha.py first (they write whole pages), then this,
then tools/stamp_assets.js last.   python3 tools/build_chrome.py [page ...]
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TABS = {
    'es': [('home', './', 'Inicio'), ('gincanas', 'gincanas.html', 'Gincanas'), ('ficha', 'ficha.html', 'La ficha'), ('aprender', 'aprender.html', 'Aprender')],
    'en': [('home', './', 'Home'), ('gincanas', 'field-finds.html', 'Field-finds'), ('ficha', 'species-card.html', 'Species card'), ('aprender', 'learn.html', 'Learn')],
}
JOIN = {'es': ('Únete', '#lista', 'Secciones'), 'en': ('Join', '#waitlist', 'Sections')}

# page: (language, current tab or None, base for tab links, asset prefix)
PAGES = {
    'index.html': ('es', 'home', '', 'assets/'),
    'gincanas.html': ('es', 'gincanas', '', 'assets/'),
    'ficha.html': ('es', 'ficha', '', 'assets/'),
    'aprender.html': ('es', 'aprender', '', 'assets/'),
    'estado.html': ('es', None, '', 'assets/'),
    'privacidad.html': ('es', None, '', 'assets/'),
    'en/index.html': ('en', 'home', '', '../assets/'),
    'en/field-finds.html': ('en', 'gincanas', '', '../assets/'),
    'en/species-card.html': ('en', 'ficha', '', '../assets/'),
    'en/learn.html': ('en', 'aprender', '', '../assets/'),
    'en/status.html': ('en', None, '', '../assets/'),
    'privacy.html': ('en', None, 'en/', 'assets/'),
}
HOME = {'es': 'index.html', 'en': 'en/index.html'}
START, END = '<!-- waitlist:start -->', '<!-- waitlist:end -->'


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as fh:
        return fh.read()


def write(p, s):
    with open(os.path.join(ROOT, p), 'w', encoding='utf-8') as fh:
        fh.write(s)


def header(page, old):
    lang, cur, base, assets = PAGES[page]
    lang_div = re.search(r'<(div|nav) class="lang"[^>]*>.*?</(div|nav)>', old, re.S)
    if not lang_div:
        sys.exit(f'{page}: no language link in the header')
    home = base or './'
    links = []
    for key, target, label in TABS[lang]:
        href = home if target == './' else base + target
        aria = ' aria-current="page"' if key == cur else ''
        links.append(f'    <a href="{href}"{aria}>{label}</a>')
    join, anchor, nav_label = JOIN[lang]
    return (f'<header class="bar">\n'
            f'  <a class="wordmark" href="{home}"><img src="{assets}mark-morpho-56.webp" alt="" width="28" height="28">Tawari</a>\n'
            f'  <nav class="nav" aria-label="{nav_label}">\n' + '\n'.join(links) + '\n  </nav>\n'
            f'  <div class="bar-end"><a class="join" href="{anchor}">{join}</a>{lang_div.group(0)}</div>\n'
            f'</header>')


def waitlist_block(lang):
    s = read(HOME[lang])
    i, j = s.find(START), s.find(END)
    if i < 0 or j < 0:
        sys.exit(f'{HOME[lang]}: no waitlist markers')
    return s[i:j + len(END)]


def main(only=None):
    blocks = {lang: waitlist_block(lang) for lang in ('es', 'en')}
    for page, (lang, cur, base, assets) in PAGES.items():
        if only and page not in only:
            continue
        s = read(page)
        old = re.search(r'<header class="bar">.*?</header>', s, re.S)
        if not old:
            sys.exit(f'{page}: no header')
        s = s[:old.start()] + header(page, old.group(0)) + s[old.end():]
        if page != HOME[lang]:
            block = blocks[lang]
            # links inside the block are relative to the home page of that language
            if page == 'privacy.html':
                block = block.replace('href="../privacy.html"', 'href="privacy.html"')
            if START in s:
                i, j = s.find(START), s.find(END)
                s = s[:i] + block + s[j + len(END):]
            else:
                k = s.find('</main>')
                if k < 0:
                    sys.exit(f'{page}: no </main>')
                k += len('</main>')
                s = s[:k] + '\n\n' + block + s[k:]
        tag = f'<script src="{assets}waitlist.js" defer></script>'
        if 'waitlist.js' not in s:
            s = s.replace('</body>', tag + '\n</body>', 1)
        write(page, s)
        print('chrome:', page)


if __name__ == '__main__':
    main(set(sys.argv[1:]) or None)
