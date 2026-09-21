/* Field-find explorer — the three playable places, browsable with no install.
   Data: assets/finds.json, generated from the production database (see README).
   Bilingual by the `lang` attribute on <html>; no framework, no third-party request. */
(function () {
  'use strict';
  var ES = document.documentElement.lang !== 'en';

  var T = ES ? {
    all: 'Todas', of: 'de', species: 'especies', search: 'Busca un nombre…',
    none: 'Ninguna coincide con eso.', more: 'Ver más', records: 'registros', record: 'registro',
    noimg: 'sin foto por ahora',
    noimgLong: 'Todavía no tenemos una foto de esta especie que podamos mostrar.',
    endemic: 'ENDÉMICA', endemicLong: 'ENDÉMICA DE COLOMBIA', photo: 'Foto', illustration: 'Ilustración', close: 'Cerrar',
    unknown: 'autor no indicado'
  } : {
    all: 'All', of: 'of', species: 'species', search: 'Search for a name…',
    none: 'Nothing matches that.', more: 'Show more', records: 'records', record: 'record',
    noimg: 'no photo yet',
    noimgLong: "We don't have a photo of this species we can show yet.",
    endemic: 'ENDEMIC', endemicLong: 'ENDEMIC TO COLOMBIA', photo: 'Photo', illustration: 'Illustration', close: 'Close',
    unknown: 'photographer not recorded'
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
  function name(s) { return (ES ? s.es || s.en : s.en || s.es) || s.sci; }
  function el(id) { return document.getElementById(id); }

  function visible() {
    var t = term.trim().toLowerCase();
    return DATA[qi].species.filter(function (s) {
      if (group && s.group !== group) return false;
      if (!t) return true;
      return name(s).toLowerCase().indexOf(t) > -1 || s.sci.toLowerCase().indexOf(t) > -1;
    });
  }

  function render() {
    var place = DATA[qi], all = place.species;

    el('findTabs').innerHTML = DATA.map(function (p, i) {
      return '<button class="tab" role="tab" data-i="' + i + '" aria-selected="' + (i === qi) + '">' +
        esc(ES ? p.nameEs : p.name) + '<span class="n">' + p.species.length + '</span></button>';
    }).join('');

    var counts = {};
    all.forEach(function (s) { counts[s.group] = (counts[s.group] || 0) + 1; });
    el('findChips').innerHTML =
      '<button class="chip" data-g="" aria-pressed="' + (group === null) + '">' + T.all + '</button>' +
      Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).map(function (g) {
        return '<button class="chip" data-g="' + esc(g) + '" aria-pressed="' + (group === g) + '">' +
          esc(GROUP[g] || g) + '<span class="n">' + counts[g] + '</span></button>';
      }).join('');

    var list = visible();
    el('findCount').textContent = list.length + ' ' + T.of + ' ' + all.length + ' ' + T.species;

    if (!list.length) {
      el('findGrid').innerHTML = '<p class="empty">' + T.none + '</p>';
      el('findMore').hidden = true;
      return;
    }
    el('findGrid').innerHTML = list.slice(0, shown).map(function (s) {
      var thumb = s.img
        ? '<img class="thumb" loading="lazy" decoding="async" width="320" height="240" src="' + base + esc(s.img) + '" alt="">'
        : '<div class="noimg">' + T.noimg + '</div>';
      var b = '';
      if (s.endemic) b += '<span class="b end">' + T.endemic + '</span>';
      if (s.iucn && THREATENED[s.iucn]) b += '<span class="b thr">' + esc(s.iucn) + '</span>';
      return '<button class="card" data-id="' + esc(s.id) + '">' + thumb +
        '<div class="cbody"><div class="cname">' + esc(name(s)) + '</div>' +
        '<div class="csci">' + esc(s.sci) + '</div>' +
        (b ? '<div class="badges">' + b + '</div>' : '') + '</div></button>';
    }).join('');
    el('findMore').hidden = list.length <= shown;
    el('findMore').textContent = T.more + ' (' + (list.length - shown) + ')';
  }

  function open(s) {
    el('dlgFig').innerHTML = s.img
      ? '<img src="' + base + esc(s.img) + '" alt="">'
      : '<div class="noimg" style="aspect-ratio:4/3;border-radius:17px 17px 0 0;border-bottom:0">' + T.noimg + '</div>';
    el('dlgName').textContent = name(s);
    el('dlgSci').textContent = s.sci + (s.family ? ' · ' + s.family : '');
    var b = '';
    if (s.endemic) b += '<span class="b end">' + T.endemicLong + '</span>';
    if (s.iucn) b += '<span class="b' + (THREATENED[s.iucn] ? ' thr' : '') + '">' + esc(IUCN[s.iucn] || s.iucn) + '</span>';
    b += '<span class="b">' + esc(GROUP[s.group] || s.group) + '</span>';
    if (s.obs != null) b += '<span class="b">' + s.obs + ' ' + (s.obs === 1 ? T.record : T.records) + '</span>';
    el('dlgBadges').innerHTML = b;
    // CC BY and CC BY-SA require attribution; it ships with the photo, always.
    el('dlgCredit').textContent = s.img
      ? (s.kind === 'illustration' ? T.illustration : T.photo) + ': ' + (s.by || T.unknown) + ' · ' + s.lic + (s.src ? ' · ' + s.src : '')
      : T.noimgLong;
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
  var slow = setTimeout(function () {
    if (!DATA) el('findLoading').textContent = ES
      ? 'Está tardando más de lo normal. Si no aparece, recarga la página.'
      : 'This is taking longer than usual. If nothing appears, reload the page.';
  }, 10000);

  fetch(base + 'assets/finds.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { clearTimeout(slow); DATA = d; el('findLoading').hidden = true; el('findBody').hidden = false; render(); })
    .catch(function () {
      el('findLoading').textContent = ES
        ? 'No se pudo cargar la lista. Recarga la página.'
        : 'Could not load the list. Reload the page.';
    });
})();
