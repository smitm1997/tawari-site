/* Field-find explorer: three of the app's Field-finds, browsable with no install.
   Data: assets/finds.json, generated from the production database by
   tools/build_finds.js (see README), with the app's own list, name and photo rules.
   Bilingual by the `lang` attribute on <html>; no framework, no third-party request. */
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
    publicDomain: 'dominio público'
  } : {
    all: 'All', search: 'Search for a name…',
    none: 'Nothing matches that.', noneHint: 'It only searches this Field-find. Try the others, or the scientific name.', more: 'Show more',
    noimg: 'no photo yet',
    noimgLong: "We don't have a photo of this species we can show yet.",
    endemic: 'ENDEMIC', endemicLong: 'ENDEMIC TO COLOMBIA', photo: 'Photo', illustration: 'Illustration', close: 'Close',
    unknown: 'photographer not recorded', introduced: 'Introduced', cropped: 'cropped', deed: 'deed.en',
    publicDomain: 'public domain'
  };

  var GROUP = ES ? {
    bird: 'Aves', tree: 'Árboles', flowering_plant: 'Plantas con flor', insect: 'Insectos',
    reptile: 'Reptiles', mammal: 'Mamíferos', amphibian: 'Anfibios', fungi: 'Hongos',
    arachnid: 'Arácnidos', fern: 'Helechos', grass: 'Gramíneas',
    other_invertebrate: 'Otros invertebrados', other: 'Otros'
  } : {
    bird: 'Birds', tree: 'Trees', flowering_plant: 'Flowering plants', insect: 'Insects',
    reptile: 'Reptiles', mammal: 'Mammals', amphibian: 'Amphibians', fungi: 'Fungi',
    arachnid: 'Arachnids', fern: 'Ferns', grass: 'Grasses',
    other_invertebrate: 'Other invertebrates', other: 'Other'
  };

  // IUCN categories, spelled out. Never a difficulty label — difficulty_tier and
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
  var DATA = null, qi = 0, group = null, term = '', shown = PAGE;

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

  function visible() {
    var t = term.trim().toLowerCase();
    return DATA[qi].species.filter(function (s) {
      if (group && s.group !== group) return false;
      if (!t) return true;
      return [s.es, s.en, s.sci].some(function (v) { return v && v.toLowerCase().indexOf(t) > -1; });
    });
  }

  function render() {
    var place = DATA[qi], all = place.species;

    el('findTabs').innerHTML = DATA.map(function (p, i) {
      return '<button class="tab" data-i="' + i + '" aria-pressed="' + (i === qi) + '">' +
        esc(ES ? p.nameEs : p.name) + '</button>';
    }).join('');

    var counts = {};
    all.forEach(function (s) { counts[s.group] = (counts[s.group] || 0) + 1; });
    el('findChips').innerHTML =
      '<button class="chip" data-g="" aria-pressed="' + (group === null) + '">' + T.all + '</button>' +
      // Largest group first, as the app orders them, with the catch-all «Otros» last. The
      // figures stay internal: founder ruling 2026-09-23, no count is shown to a reader.
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
        ? '<img class="thumb" loading="lazy" decoding="async" width="320" height="240" src="' + base + esc(s.img) + '" alt="">'
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

  function open(s) {
    el('dlgFig').innerHTML = s.img
      ? '<img src="' + base + esc(s.img) + '" alt="">'
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

  root.addEventListener('click', function (e) {
    var tab = e.target.closest('.tab');
    if (tab) {
      qi = +tab.dataset.i; group = null; term = ''; shown = PAGE;
      el('findQ').value = '';
      render();
      return;
    }
    var chip = e.target.closest('.chip');
    if (chip) { group = chip.dataset.g || null; shown = PAGE; render(); return; }
    var card = e.target.closest('.card');
    if (card) {
      var s = DATA[qi].species.filter(function (x) { return x.id === card.dataset.id; })[0];
      if (s) open(s);
    }
  });
  el('findMore').addEventListener('click', function () { shown += PAGE; render(); });
  el('findQ').addEventListener('input', function (e) { term = e.target.value; shown = PAGE; render(); });
  el('dlgClose').addEventListener('click', function () { el('dlgSp').close(); });

  // If the list has not arrived in 10 s, say so instead of sitting on "Cargando…" —
  // a stuck loading line reads as "nothing here" to a visitor.
  function loadingSays(text) {
    el('findLoadingMsg').textContent = text;
    el('findLoadingImg').classList.remove('hover'); // it bobs while loading, and stops after 10 s
  }
  var slow = setTimeout(function () {
    if (!DATA) loadingSays(ES
      ? 'Está tardando más de lo normal. Si no aparece, recarga la página.'
      : 'This is taking longer than usual. If nothing appears, reload the page.');
  }, 10000);

  fetch(base + 'assets/finds.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { clearTimeout(slow); DATA = d; el('findLoading').hidden = true; el('findBody').hidden = false; render(); })
    .catch(function () {
      clearTimeout(slow);
      loadingSays(ES
        ? 'No se pudo cargar la lista. Recarga la página.'
        : 'Could not load the list. Reload the page.');
    });
})();
