/* tawari.id motion: sections rise into place as they scroll in, their parts one after another.
   Progressive: nothing is hidden unless this script runs and the reader allows motion (no
   prefers-reduced-motion), so a page without JavaScript, a print, or a reader who asked for
   less motion sees every section at rest. The looks live in site.css («motion», end of file). */
(function () {
  var doc = document.documentElement;

  // the header lifts off the page once it moves
  var bar = document.querySelector('.bar');
  if (bar) {
    var lifted = false;
    var onScroll = function () {
      var now = window.scrollY > 8;
      if (now !== lifted) { lifted = now; bar.classList.toggle('lifted', now); }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  // what rises in: the home page marks its blocks .reveal; the Learn page's blocks are named here
  var AUTO = '.lr-head, .lr-biomes > li, .lr-kingdom, .lr-essays > li, .lr-cta, .wait, .finds';
  [].forEach.call(document.querySelectorAll(AUTO), function (el) { el.classList.add('reveal'); });
  // a long row (a kingdom's families) comes in a few at a time, never more than half a second
  [].forEach.call(document.querySelectorAll('.lr-fam'), function (ul) {
    [].forEach.call(ul.children, function (li, i) { li.style.setProperty('--i', Math.min(i, 14)); });
  });

  var els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  doc.classList.add('motion');

  // blocks that arrive together go one after another, in reading order
  var io = new IntersectionObserver(function (entries) {
    var seen = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
    seen.sort(function (a, b) {
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    });
    seen.forEach(function (el, i) {
      el.style.setProperty('--d', Math.min(i, 6) * 90 + 'ms');
      el.classList.add('in');
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
  [].forEach.call(els, function (el) { io.observe(el); });

  // the Field-find grid: each newly drawn set of cards deals in, a few at a time
  var grid = document.getElementById('findGrid');
  if (grid && 'MutationObserver' in window) {
    new MutationObserver(function (records) {
      var i = 0;
      records.forEach(function (r) {
        [].forEach.call(r.addedNodes, function (n) {
          if (n.nodeType === 1) { n.style.setProperty('--i', Math.min(i, 12)); n.classList.add('deal'); i++; }
        });
      });
    }).observe(grid, { childList: true });
  }
})();
