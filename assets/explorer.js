/* Field-find explorer: every one of the app's Field-finds, browsable with no install.
   Data: assets/finds/index.json (the places, grouped by Colombia's natural regions) and
   one assets/finds/<slug>.json per place, fetched when the place is opened. Both are
   generated from the production database by tools/build_finds.js (see README), with the
   app's own list, name and photo rules. Bilingual by the `lang` attribute on <html>; no
   framework, no third-party request. */
(function () {
  'use strict';
  var ES = document.documentElement.lang !== 'en';

  var T = ES ? {
    all: 'Todas', search: 'Busca un nombre…',
    none: 'Ninguna coincide con eso.', noneHint: 'Solo busca en esta gincana. Prueba en las otras, o con el nombre científico.', more: 'Ver más',
    noimg: 'sin foto por ahora',
    noimgLong: 'Todavía no tenemos una foto de esta especie que podamos mostrar.',
    endemic: 'ENDÉMICA', endemicLong: 'ENDÉMICA DE COLOMBIA', photo: 'Foto', illustration: 'Ilustración', close: 'Cerrar',
    unknown: 'autor no indicado', introduced: 'Introducida', cropped: 'recortada', deed: 'deed.es',
    publicDomain: 'dominio público',
    pick: function (n) { return 'Elige una de las ' + n + ' gincanas'; }, region: function (r) { return 'región ' + r; },
    species: function (n) { return n + (n === 1 ? ' especie' : ' especies'); },
    loading: 'Cargando…', placeFailed: 'No se pudo cargar esta gincana. Prueba otra vez.',
    lic: function (cc, pd) {
      if (!cc.length) return pd ? 'Las fotos de esta gincana son de dominio público. Cada una lleva su crédito: toca una especie para verlo.' : '';
      return 'Las fotos de esta gincana tienen licencia ' + list(cc, ' o ') + (pd ? ', o son de dominio público' : '') +
        '. Cada una lleva su crédito: toca una especie para verlo.';
    }
  } : {
    all: 'All', search: 'Search for a name…',
    none: 'Nothing matches that.', noneHint: 'It only searches this Field-find. Try the others, or the scientific name.', more: 'Show more',
    noimg: 'no photo yet',
    noimgLong: "We don't have a photo of this species we can show yet.",
    endemic: 'ENDEMIC', endemicLong: 'ENDEMIC TO COLOMBIA', photo: 'Photo', illustration: 'Illustration', close: 'Close',
    unknown: 'photographer not recorded', introduced: 'Introduced', cropped: 'cropped', deed: 'deed.en',
    publicDomain: 'public domain',
    pick: function (n) { return 'Choose one of the ' + n + ' Field-finds'; }, region: function (r) { return r + ' region'; },
    species: function (n) { return n + ' species'; },
    loading: 'Loading…', placeFailed: 'Could not load this Field-find. Try again.',
    lic: function (cc, pd) {
      if (!cc.length) return pd ? 'The photos in this Field-find are in the public domain. Each one carries its credit: tap a species to see it.' : '';
      return 'The photos in this Field-find are licensed ' + list(cc, ' or ') + (pd ? ', or are in the public domain' : '') +
        '. Each one carries its credit: tap a species to see it.';
    }
  };
  function list(a, last) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + last + a[a.length - 1]; }

  var GROUP = ES ? {
    bird: 'Aves', tree: 'Árboles', flowering_plant: 'Plantas con flor', insect: 'Insectos',
    reptile: 'Reptiles', mammal: 'Mamíferos', amphibian: 'Anfibios', fungi: 'Hongos',
    arachnid: 'Arácnidos', fern: 'Helechos', grass: 'Gramíneas', fish: 'Peces',
    other_invertebrate: 'Otros invertebrados', other: 'Otros'
  } : {
    bird: 'Birds', tree: 'Trees', flowering_plant: 'Flowering plants', insect: 'Insects',
    reptile: 'Reptiles', mammal: 'Mammals', amphibian: 'Amphibians', fungi: 'Fungi',
    arachnid: 'Arachnids', fern: 'Ferns', grass: 'Grasses', fish: 'Fish',
    other_invertebrate: 'Other invertebrates', other: 'Other'
  };

  // IUCN categories, spelled out. Never a difficulty label: difficulty_tier and
  // difficulty_score are internal and never reach a reader.
  var IUCN = ES ? {
    LC: 'Preocupación menor', NT: 'Casi amenazada', VU: 'Vulnerable',
    EN: 'En peligro', CR: 'En peligro crítico', DD: 'Datos insuficientes'
  } : {
    LC: 'Least concern', NT: 'Near threatened', VU: 'Vulnerable',
    EN: 'Endangered', CR: 'Critically endangered', DD: 'Data deficient'
  };
  var THREATENED = { VU: 1, EN: 1, CR: 1 };
  var PAGE = 24;

  var root = document.getElementById('finds');
  if (!root) return;
  var base = root.getAttribute('data-base') || '';
  // INDEX: the places. LISTS: a place's species, by slug, once fetched. cur: the open place.
  var INDEX = null, LISTS = {}, cur = null, group = null, term = '', shown = PAGE;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // The app's localSpeciesName (utils/species.ts): the common name in the page's language
  // headlines; without one the scientific name does, in italics. A Spanish name is never
  // shown as English. On the Spanish page an English name, when there is one, goes under
  // the scientific name instead.
  function label(s) {
    var common = ES ? s.es : s.en;
    if (common) return { primary: common, italic: false, secondary: s.sci, secItalic: true };
    return { primary: s.sci, italic: true, secondary: ES && s.en ? s.en : null, secItalic: false };
  }
  function el(id) { return document.getElementById(id); }
  // The page crops each photo to 4:3 from its centre; `pos` moves the crop up for an upright
  // photo whose subject the centre would cut (tools/build_finds.js FOCUS).
  function focus(s) { return s.pos != null ? ' style="object-position:50% ' + (+s.pos) + '%"' : ''; }
  function place(slug) { return INDEX.places.filter(function (p) { return p.slug === slug; })[0] || null; }
  function regionName(id) { var r = INDEX.regions.filter(function (x) { return x.id === id; })[0]; return r ? (ES ? r.es : r.en) : id; }
  function placeLabel(p) { return ES ? p.labelEs : p.label; }

  // A place can be opened by link: gincanas.html#tayrona. The hash is the place's slug;
  // the hashes the page used before (#jb-cali, #sonso, #tres-cruces, linked from the home
  // page) and the database's own slugs are aliases of it.
  function fromHash() {
    var h = decodeURIComponent((location.hash || '').slice(1)).toLowerCase();
    if (!h) return null;
    var hit = INDEX.places.filter(function (p) { return p.slug === h || (p.aliases || []).indexOf(h) > -1; })[0];
    return hit ? hit.slug : null;
  }

  // ── The place picker: a chip grid under small region headings; under 640 px a native
  //    select grouped by region (CSS shows one of the two). ──
  function drawPicker() {
    var regions = INDEX.regions.filter(function (r) { return INDEX.places.some(function (p) { return p.region === r.id; }); });
    var sel = '<label class="picker-label" for="findPlace">' + T.pick(INDEX.places.length) + '</label>' +
      '<select class="picker-select" id="findPlace">' + regions.map(function (r) {
        return '<optgroup label="' + esc(ES ? r.es : r.en) + '">' + INDEX.places.filter(function (p) { return p.region === r.id; }).map(function (p) {
          return '<option value="' + esc(p.slug) + '">' + esc(placeLabel(p)) + ' · ' + esc(p.dept) + '</option>';
        }).join('') + '</optgroup>';
      }).join('') + '</select>';
    var grid = '<div class="picker-grid">' + regions.map(function (r) {
      return '<div class="picker-region" role="group" aria-labelledby="pr-' + esc(r.id) + '">' +
        '<p class="picker-h" id="pr-' + esc(r.id) + '">' + esc(ES ? r.es : r.en) + '</p><div class="picker-chips">' +
        INDEX.places.filter(function (p) { return p.region === r.id; }).map(function (p) {
          return '<button type="button" class="pchip" data-slug="' + esc(p.slug) + '" aria-pressed="false" title="' +
            esc((ES ? p.nameEs : p.name) + ' · ' + p.dept) + '">' + esc(placeLabel(p)) + '</button>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';
    el('findTabs').innerHTML = sel + grid;
    el('findPlace').addEventListener('change', function (e) { select(e.target.value); });
  }
  function markPicker() {
    var chips = el('findTabs').querySelectorAll('.pchip');
    for (var i = 0; i < chips.length; i++) chips[i].setAttribute('aria-pressed', String(chips[i].getAttribute('data-slug') === cur));
    el('findPlace').value = cur;
  }

  function visible() {
    var t = term.trim().toLowerCase();
    return LISTS[cur].filter(function (s) {
      if (group && s.group !== group) return false;
      if (!t) return true;
      return [s.es, s.en, s.sci].some(function (v) { return v && v.toLowerCase().indexOf(t) > -1; });
    });
  }

  function drawHead() {
    var p = place(cur);
    el('findName').textContent = ES ? p.nameEs : p.name;
    el('findMeta').textContent = p.dept + ' · ' + T.region(regionName(p.region)) + ' · ' + T.species(p.count);
    var cc = ['CC BY', 'CC BY-SA'].filter(function (k) { return p.lic && p.lic[k]; });
    el('findLic').textContent = T.lic(cc, !!(p.lic && (p.lic.CC0 || p.lic.PD)));
  }

  function render() {
    var all = LISTS[cur];
    var counts = {};
    all.forEach(function (s) { counts[s.group] = (counts[s.group] || 0) + 1; });
    el('findChips').innerHTML =
      '<button class="chip" data-g="" aria-pressed="' + (group === null) + '">' + T.all + '</button>' +
      // Largest group first, as the app orders them, with the catch-all «Otros» last. The
      // group figures are not shown (founder ruling 2026-09-23).
      Object.keys(counts).sort(function (a, b) {
        return (a === 'other') - (b === 'other') || counts[b] - counts[a];
      }).map(function (g) {
        return '<button class="chip" data-g="' + esc(g) + '" aria-pressed="' + (group === g) + '">' +
          esc(GROUP[g] || g) + '</button>';
      }).join('');

    var list = visible();

    if (!list.length) {
      el('findGrid').innerHTML = '<div class="find-state" style="grid-column:1/-1"><img src="' + base + 'assets/eyebrow/state-empty.webp" alt="" width="60" height="60"><p role="status">' + T.none + '</p>' +
        (term ? '<p class="hint">' + T.noneHint + '</p>' : '') + '</div>';
      el('findMore').hidden = true;
      return;
    }
    el('findGrid').innerHTML = list.slice(0, shown).map(function (s) {
      var thumb = s.img
        ? '<img class="thumb" loading="lazy" decoding="async" width="320" height="240" src="' + base + esc(s.img) + '"' + focus(s) + ' alt="">'
        : '<div class="noimg">' + T.noimg + '</div>';
      var b = '';
      if (s.endemic) b += '<span class="b end">' + T.endemic + '</span>';
      if (s.introduced) b += '<span class="b">' + T.introduced + '</span>';
      if (s.iucn && THREATENED[s.iucn]) b += '<span class="b thr">' + esc(s.iucn) + '</span>';
      var n = label(s);
      return '<button class="card" data-id="' + esc(s.id) + '">' + thumb +
        '<div class="cbody"><div class="cname' + (n.italic ? ' sci' : '') + '">' + esc(n.primary) + '</div>' +
        (n.secondary ? '<div class="csci' + (n.secItalic ? '' : ' roman') + '">' + esc(n.secondary) + '</div>' : '') +
        (b ? '<div class="badges">' + b + '</div>' : '') + '</div></button>';
    }).join('');
    var rest = list.length - shown;
    el('findMore').hidden = rest <= 0;
    if (rest > 0) el('findMore').textContent = T.more;
  }

  // no-cache: ask the server every time (a 304 when unchanged), so the data never lags
  // the page that renders it
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  // Open a place: its list is fetched the first time, then kept. A reply for a place the
  // reader has already left is dropped.
  function select(slug, first) {
    if (!place(slug)) return;
    cur = slug; group = null; term = ''; shown = PAGE;
    el('findQ').value = '';
    markPicker();
    // The tab keeps the hash current; a page opened at an old or alias hash shows the slug.
    if ((!first || location.hash) && location.hash.slice(1) !== slug && history.replaceState) history.replaceState(null, '', '#' + slug);
    if (LISTS[slug]) { show(); return; }
    el('findBody').setAttribute('aria-busy', 'true');
    return getJSON(base + 'assets/finds/' + slug + '.json').then(function (d) {
      LISTS[slug] = d.species;
      if (cur === slug) show();
    }, function () {
      if (cur !== slug) return;
      el('findBody').removeAttribute('aria-busy');
      if (first) throw new Error('place');
      el('findGrid').innerHTML = '<div class="find-state" style="grid-column:1/-1"><p role="status">' + T.placeFailed + '</p></div>';
      el('findChips').innerHTML = '';
      el('findMore').hidden = true;
    });
  }
  function show() {
    el('findBody').removeAttribute('aria-busy');
    el('findLoading').hidden = true;
    el('findBody').hidden = false;
    drawHead();
    render();
  }

  root.addEventListener('click', function (e) {
    var pc = e.target.closest('.pchip');
    if (pc) { if (pc.getAttribute('data-slug') !== cur) select(pc.getAttribute('data-slug')); return; }
    var chip = e.target.closest('.chip');
    if (chip) { group = chip.dataset.g || null; shown = PAGE; render(); return; }
    var card = e.target.closest('.card');
    if (card && LISTS[cur]) {
      var s = LISTS[cur].filter(function (x) { return x.id === card.dataset.id; })[0];
      if (s) open(s);
    }
  });
  el('findMore').addEventListener('click', function () { shown += PAGE; render(); });
  el('findQ').addEventListener('input', function (e) { term = e.target.value; shown = PAGE; if (LISTS[cur]) render(); });
  el('dlgClose').addEventListener('click', function () { el('dlgSp').close(); });
  window.addEventListener('hashchange', function () { var s = INDEX && fromHash(); if (s && s !== cur) select(s); });

  function open(s) {
    el('dlgFig').innerHTML = s.img
      ? '<img src="' + base + esc(s.img) + '"' + focus(s) + ' alt="">'
      : '<div class="noimg" style="aspect-ratio:4/3;border-radius:17px 17px 0 0;border-bottom:0">' + T.noimg + '</div>';
    var n = label(s);
    el('dlgName').textContent = n.primary;
    el('dlgName').className = 'dname' + (n.italic ? ' sci' : '');
    // Under the headline: the scientific name (or, when it headlines, the English name),
    // then the family.
    el('dlgSci').textContent = (n.secondary || '') + (n.secondary && s.family ? ' · ' : '') + (s.family || '');
    el('dlgSci').className = 'dsci' + (n.secItalic || !n.secondary ? '' : ' roman');
    var b = '';
    if (s.endemic) b += '<span class="b end">' + T.endemicLong + '</span>';
    if (s.introduced) b += '<span class="b">' + T.introduced + '</span>';
    if (s.iucn) b += '<span class="b' + (THREATENED[s.iucn] ? ' thr' : '') + '">' + esc(IUCN[s.iucn] || s.iucn) + '</span>';
    b += '<span class="b">' + esc(GROUP[s.group] || s.group) + '</span>';
    el('dlgBadges').innerHTML = b;
    // CC BY and CC BY-SA require attribution; it ships with the photo, always: the author,
    // the licence linked to its deed (when its version is known), the source linked to the
    // original, and «recortada», because the dialog draws the photo cropped to 4:3 (the
    // app's photoCreditLine does the same).
    var c = el('dlgCredit');
    c.textContent = '';
    if (!s.img) { c.textContent = T.noimgLong; el('dlgSp').showModal(); return; }
    function link(text, href) {
      if (!href) return document.createTextNode(text);
      var a = document.createElement('a');
      a.href = href; a.textContent = text; a.rel = 'noopener'; a.target = '_blank';
      return a;
    }
    c.appendChild(document.createTextNode((s.kind === 'illustration' ? T.illustration : T.photo) + ': ' + (s.by || T.unknown) + ' · '));
    // The bare public-domain statement prints in the reader's language (the app's
    // sourcePublicDomain). A licence with no known version links to its generic page
    // as is (licExact), because CC publishes no deed without a version.
    var lic = s.lic === 'Public domain' ? T.publicDomain : s.lic;
    c.appendChild(link(lic, s.licUrl ? (s.licExact ? s.licUrl : s.licUrl + T.deed) : null));
    if (s.src) { c.appendChild(document.createTextNode(' · ')); c.appendChild(link(s.src, s.srcUrl)); }
    c.appendChild(document.createTextNode(' · ' + T.cropped));
    el('dlgSp').showModal();
  }

  // If the list has not arrived in 10 s, say so instead of sitting on "Cargando…":
  // a stuck loading line reads as "nothing here" to a visitor.
  function loadingSays(text) {
    el('findLoadingMsg').textContent = text;
    el('findLoadingImg').classList.remove('hover'); // it bobs while loading, and stops after 10 s
  }
  var slow = setTimeout(function () {
    if (!cur || !LISTS[cur]) loadingSays(ES
      ? 'Está tardando más de lo normal. Si no aparece, recarga la página.'
      : 'This is taking longer than usual. If nothing appears, reload the page.');
  }, 10000);

  // The index, then the place the link names (or the best-documented one).
  getJSON(base + 'assets/finds/index.json')
    .then(function (d) {
      INDEX = d;
      drawPicker();
      return select(fromHash() || d.default, true);
    })
    .then(function () { clearTimeout(slow); })
    .catch(function () {
      clearTimeout(slow);
      loadingSays(ES
        ? 'No se pudo cargar la lista. Recarga la página.'
        : 'Could not load the list. Reload the page.');
    });
})();
