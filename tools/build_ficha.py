#!/usr/bin/env python3
"""Builds ficha.html and en/species-card.html: one long species card (the monarch), cut into
its sections, each beside a label that says what that part of the card does.

The bands in assets/ficha/<lang>-<key>.webp are slices of a stitched simulator capture of the
app's species card (iPhone 17 Pro, 1206 px wide, resized to 720). To refresh them, capture the
card again, stitch it, and cut it at the section rules; the heights below must match the files
(run with --check to compare them).

Run order when the site's chrome changes: build_ficha.py, then build_chrome.py (header and
waitlist on every page), then stamp_assets.js last.

  python3 tools/build_ficha.py           write both pages
  python3 tools/build_ficha.py --check   compare the band heights with the files (needs sips)
"""
import html
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# key, band height at 720 px wide (es, en)
BANDS = [
    ('hero', 466, 466), ('names', 361, 340), ('summary', 611, 548), ('ident', 994, 885),
    ('mine', 134, 134), ('spine', 821, 863), ('eco', 1376, 1268), ('culture', 1016, 978),
    ('reading', 401, 398), ('order', 423, 425), ('biomes', 664, 664), ('taxonomy', 418, 418),
    ('places', 325, 325), ('map', 229, 233), ('report', 122, 118), ('sources', 678, 682),
    ('bar', 215, 215),
]

LABELS = {
    'es': {
        'hero': ('La foto y el nombre', 'Arriba, las fotos con licencia abierta: desliza para ver más. Su nombre común, el científico debajo, y el dibujo de su familia en el círculo. La etiqueta UICN dice su estado de conservación; tócala y te explica qué significa.'),
        'names': ('El otro nombre y una frase para recordarla', 'Su nombre en el otro idioma, su familia y su orden. Luego, en cursiva, lo más sorprendente de la especie, dicho en una frase.'),
        'summary': ('El resumen', 'Qué es, cómo es y dónde vive, en pocas líneas. Si una palabra técnica lleva un subrayado punteado, tócala y la ficha te dice qué significa.'),
        'ident': ('Cómo reconocerla', 'Primero las marcas de campo: lo que miras para saber que es ella y no otra parecida. Después, la descripción completa: tamaño, colores, cómo se distinguen machos y hembras, y sus etapas.'),
        'mine': ('Tus avistamientos', 'Cada vez que la registras aparece aquí, con fecha y lugar. Es tu historia con esta especie.'),
        'spine': ('Con quién vive', 'Quién come a quién: de qué se alimenta, quién se la come y dónde vive. Solo aparecen relaciones con una fuente revisada, y cada una dice de dónde sale.'),
        'eco': ('Su papel en el ecosistema', 'Sus relaciones, su estado de conservación y lo que hace en el lugar donde vive, con las cifras de quien las midió.'),
        'culture': ('Usos culturales', 'Lo que la especie significa para la gente: tradiciones, nombres populares, usos. Siempre con el pueblo o el lugar que lo cuenta. Si hay usos medicinales, la ficha los cuenta como historia, nunca como consejo.'),
        'reading': ('Lecturas relacionadas', 'Artículos científicos que nombran la especie, para quien quiera ir más lejos. «Acceso libre» marca los que se pueden leer gratis.'),
        'order': ('Su grupo', 'Lo que comparte con sus parientes, y un enlace a la página completa del grupo en Aprender.'),
        'biomes': ('Dónde vive', 'Los ecosistemas de Colombia donde se encuentra. Cada uno abre su propia página.'),
        'taxonomy': ('Su lugar en el árbol de la vida', 'Reino, clase, orden, familia y género, de lo general a lo particular.'),
        'places': ('Dónde encontrarla', 'Lugares de Tawari donde se ha registrado. Toca uno para ver quién más vive allí.'),
        'map': ('Su distribución', 'Todos los registros de la especie, en el mapa de GBIF.'),
        'report': ('¿Algo no cuadra?', 'Si ves un error, cuéntanos desde aquí. Cada reporte llega al equipo.'),
        'sources': ('Las fuentes', 'Cada foto con su autor y su licencia, y cada texto con su fuente. En la ficha, la lista sigue hasta el final.'),
        'bar': ('Registrar avistamiento', 'Lo único que la ficha te pide: cuando la veas, regístrala. Queda en Mi Lista, con tu foto y tus notas.'),
    },
    'en': {
        'hero': ('The photo and the name', 'Up top, the openly licensed photos: swipe for more. Its common name, the scientific name below it, and its family\'s drawing in the circle. The IUCN tag gives its conservation status; tap it for what that means.'),
        'names': ('Its other name, and one line to remember it by', 'Its name in the other language, its family and its order. Then, in italics, the most surprising thing about the species, in one sentence.'),
        'summary': ('The summary', 'What it is, what it looks like and where it lives, in a few lines. If a technical word has a dotted underline, tap it and the card tells you what it means.'),
        'ident': ('How to recognise it', 'Field marks first: what to look at to tell it from look-alikes. Then the full description: size, colours, how males and females differ, and its life stages.'),
        'mine': ('Your sightings', 'Every time you log it, it shows up here, with the date and the place. Your own history with this species.'),
        'spine': ('Who it lives with', 'Who eats whom: what it feeds on, what eats it, and where it lives. Only relationships with a reviewed source appear, and each one says where it comes from.'),
        'eco': ('Its role in the ecosystem', 'Its relationships, its conservation status and what it does where it lives, with the figures of whoever measured them.'),
        'culture': ('Cultural uses', 'What the species means to people: traditions, popular names, uses. Always with the people or the place it comes from. Where there are medicinal uses, the card tells them as history, never as advice.'),
        'reading': ('Related reading', 'Scientific papers that name the species, for anyone who wants to go further. "Free to read" marks the ones you can open at no cost.'),
        'order': ('Its group', 'What it shares with its relatives, with a link to the group\'s full page in Learn.'),
        'biomes': ('Where it lives', 'The ecosystems of Colombia where it is found. Each one opens its own page.'),
        'taxonomy': ('Its place in the tree of life', 'Kingdom, class, order, family and genus, from the general to the particular.'),
        'places': ('Where to find it', 'Places in Tawari where it has been recorded. Tap one to see who else lives there.'),
        'map': ('Its distribution', 'Every record of the species, on GBIF\'s map.'),
        'report': ('Something not right?', 'If you spot a mistake, tell us from here. Every report reaches the team.'),
        'sources': ('The sources', 'Every photo with its author and licence, and every text with its source. On the card, the list runs to the end.'),
        'bar': ('Log a sighting', 'The one thing the card asks of you: when you see it, log it. It goes to My List, with your photo and your notes.'),
    },
}

ALSO = {
    'es': ('Algunas fichas también muestran', [
        ('Endémica', 'una etiqueta sobre la foto cuando la especie solo vive en Colombia.'),
        ('Introducida', 'dentro de una gincana, cuando la especie llegó de otra parte.'),
        ('Precaución', 'un aviso cuando la especie es tóxica o peligrosa.'),
        ('En revisión', 'mientras una persona revisa la ficha, un aviso pide precaución con la especie en el campo.'),
    ]),
    'en': ('Some cards also show', [
        ('Endemic', 'a tag on the photo when the species lives only in Colombia.'),
        ('Introduced', 'inside a Field-find, when the species came from elsewhere.'),
        ('Caution', 'a notice when the species is toxic or dangerous.'),
        ('Under review', 'while a person checks the card, a notice asks for caution with the species in the field.'),
    ]),
}

PAGE = {
    'es': dict(
        path='ficha.html', other='en/species-card.html', lang='es', locale='es_CO', alt_locale='en_US',
        assets='assets/', home='./',
        title='Cómo leer una ficha · Tawari',
        desc='La ficha de una especie en Tawari, de arriba abajo: la de la mariposa monarca, con lo que hace cada parte.',
        eyebrow='La ficha', h1='Cómo leer una ficha.',
        lede='Cada especie en Tawari tiene su ficha. Esta es la de la mariposa monarca, de arriba abajo, con lo que hace cada parte.',
        figalt='Ficha de la mariposa monarca en Tawari: ',
        caption='Capturas de la app en un iPhone, octubre de 2026. Fotos de la ficha: Daniel Hincapie y otros autores (CC BY y CC0, vía GBIF y Wikimedia Commons), con sus créditos en la sección de fuentes.',
        cta=('Conoce las gincanas', 'gincanas.html'), cta2=('Aprender', 'aprender.html'),
        next_text='Cada gincana es una lista de fichas como esta: las especies que de verdad viven en un lugar.',
        og_image='https://tawari.id/assets/og-es.jpg',
        og_alt='Ilustración: un tucán, mariposas azules, un felino, helechos y hongos alrededor de una etiqueta que dice «TAWARI, Guía de campo viva».',
    ),
    'en': dict(
        path='en/species-card.html', other='ficha.html', lang='en', locale='en_US', alt_locale='es_CO',
        assets='../assets/', home='./',
        title='How to read a species card · Tawari',
        desc='A Tawari species card from top to bottom: the monarch butterfly\'s, with what each part does.',
        eyebrow='The species card', h1='How to read a card.',
        lede='Every species in Tawari has its card. This is the monarch butterfly\'s, from top to bottom, with what each part does.',
        figalt='The monarch butterfly card in Tawari: ',
        caption='Screens from the app on an iPhone, October 2026. Card photos: Daniel Hincapie and other authors (CC BY and CC0, via GBIF and Wikimedia Commons), credited in the card\'s sources section.',
        cta=('Meet the Field-finds', 'field-finds.html'), cta2=('Learn', 'learn.html'),
        next_text='Every Field-find is a list of cards like this one: the species that really live in one place.',
        og_image='https://tawari.id/assets/og.jpg',
        og_alt='Illustration: a toucan, blue butterflies, a wild cat, ferns and mushrooms around a label reading "TAWARI, A Living Field Guide".',
    ),
}


def esc(s):
    return html.escape(s, quote=True)


def build(lang):
    p = PAGE[lang]
    a = p['assets']
    canon = 'https://tawari.id/' + p['path']
    other = 'https://tawari.id/' + p['other']
    es_url, en_url = (canon, other) if lang == 'es' else (other, canon)
    rows = []
    for i, (key, h_es, h_en) in enumerate(BANDS, 1):
        h = h_es if lang == 'es' else h_en
        title, body = LABELS[lang][key]
        rows.append(
            f'''    <div class="part part-{key}" id="{key}">
      <div class="pl reveal"><span class="pn" aria-hidden="true">{i}</span><div><h2>{esc(title)}</h2><p>{esc(body)}</p></div></div>
      <div class="pi"><img src="{a}ficha/{lang}-{key}.webp" alt="{esc(p['figalt'] + title)}" width="360" height="{round(h / 2)}" loading="{'eager' if i <= 2 else 'lazy'}" decoding="async"></div>
    </div>''')
    also_title, also = ALSO[lang]
    also_items = '\n'.join(f'        <li><b>{esc(t)}:</b> {esc(d)}</li>' for t, d in also)
    other_rel = ('en/species-card.html' if lang == 'es' else '../ficha.html')
    other_label = 'English' if lang == 'es' else 'Español'
    other_lang = 'en' if lang == 'es' else 'es'
    nav_label = 'Secciones' if lang == 'es' else 'Sections'
    # the footer collage and footer, from the home page of the same language (same folder depth)
    home = open(os.path.join(ROOT, 'index.html' if lang == 'es' else 'en/index.html'), encoding='utf-8').read()
    i, j = home.find('<div class="collage"'), home.find('</footer>')
    if i < 0 or j < 0:
        sys.exit('the home page has no collage or footer to copy')
    foot = home[i:j + len('</footer>')]
    return f'''<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(p['title'])}</title>
<meta name="description" content="{esc(p['desc'])}">
<link rel="canonical" href="{canon}">
<link rel="alternate" hreflang="es" href="{es_url}">
<link rel="alternate" hreflang="en" href="{en_url}">
<link rel="alternate" hreflang="x-default" href="{es_url}">
<meta property="og:type" content="website">
<meta property="og:locale" content="{p['locale']}">
<meta property="og:locale:alternate" content="{p['alt_locale']}">
<meta property="og:url" content="{canon}">
<meta property="og:site_name" content="Tawari">
<meta property="og:title" content="{esc(p['title'])}">
<meta property="og:description" content="{esc(p['desc'])}">
<meta property="og:image" content="{p['og_image']}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{esc(p['og_alt'])}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F7F6F2">
<link rel="icon" href="{a}favicon-32.png" type="image/png">
<link rel="apple-touch-icon" href="{a}mark-morpho-180.png">
<link rel="preload" href="{a}fonts/Gelasio-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{a}site.css">
<link rel="stylesheet" href="{a}ficha.css">
</head>
<body>

<header class="bar">
  <a class="wordmark" href="{p['home']}"><img src="{a}mark-morpho-56.webp" alt="" width="28" height="28">Tawari</a>
  <nav class="nav" aria-label="{nav_label}"></nav>
  <div class="lang"><a href="{other_rel}" hreflang="{other_lang}" lang="{other_lang}">{other_label}</a></div>
</header>

<main id="top">

<div class="page-head">
  <div class="wrap">
    <p class="eyebrow">{esc(p['eyebrow'])}</p>
    <h1>{esc(p['h1'])}</h1>
    <p class="lede">{esc(p['lede'])}</p>
  </div>
</div>

<section class="anatomy-sec">
  <div class="wrap">
    <div class="anatomy">
{chr(10).join(rows)}
    </div>
    <p class="credits anat-credit">{esc(p['caption'])}</p>
    <div class="also reveal">
      <h2>{esc(also_title)}</h2>
      <ul>
{also_items}
      </ul>
    </div>
    <div class="after">
      <a class="btn btn-primary" href="{p['cta'][1]}">{esc(p['cta'][0])}</a>
      <p>{esc(p['next_text'])}</p>
    </div>
  </div>
</section>

</main>

{foot}
<script src="{a}motion.js" defer></script>
</body>
</html>
'''


def check():
    bad = 0
    for key, h_es, h_en in BANDS:
        for lang, h in (('es', h_es), ('en', h_en)):
            f = os.path.join(ROOT, 'assets', 'ficha', f'{lang}-{key}.webp')
            out = subprocess.run(['sips', '-g', 'pixelHeight', f], capture_output=True, text=True).stdout
            got = int(out.strip().split()[-1])
            if got != h:
                bad += 1
                print(f'{lang}-{key}: file {got} px, table {h} px')
    print('heights match' if not bad else f'{bad} mismatched')
    return bad


if __name__ == '__main__':
    if '--check' in sys.argv:
        sys.exit(1 if check() else 0)
    for lang in ('es', 'en'):
        out = os.path.join(ROOT, PAGE[lang]['path'])
        with open(out, 'w', encoding='utf-8') as fh:
            fh.write(build(lang))
        print('wrote', PAGE[lang]['path'])
