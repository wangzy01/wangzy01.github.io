/* site/site.js -- behaviour of the project page (index.html).
   Vanilla JS, no library; works when the page is opened from disk.
     1 header: scrollspy for every [data-nav] link (aria-current="true"), header shadow once the page is scrolled
     2 navigation: fade edges of the header nav if its pills ever overflow, and the "Sections" menu button (<= 1080 px)
     3 videos: muted, looped, play while at least half visible; never with prefers-reduced-motion
     4 video tabs: one player per group; a tab switches the source, the poster, the label and the caption
     5 lightbox: figures open in a native <dialog>; x, Esc or the backdrop closes it and returns the focus
     6 BibTeX copy button
     7 first-use cue: the "Interactive" label and the primary control of a card pulse softly when they come into view,
       until the card is first used (at most three times; never with prefers-reduced-motion)
     8 interactive V(alpha) chart (data/vcurve_harper.js, the reference question under O only)
     9 DMFSite.whenNear(element, fn): run fn once the element comes near the viewport (used for the explorer and the
       guessing game, so that their data and videos load only when needed) */
(function () {
  'use strict';
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var header = $('.hdr');
  function hdrH() { return header ? header.getBoundingClientRect().height : 0; }
  // no transitions while the page and its components set their first state (base.css: html.is-loading)
  var docEl = document.documentElement;
  docEl.classList.add('is-loading');
  function loaded() { requestAnimationFrame(function () { requestAnimationFrame(function () { docEl.classList.remove('is-loading'); }); }); }
  if (document.readyState === 'complete') loaded(); else window.addEventListener('load', loaded);

  /* ---------------------------------------------------------------------------------------------- 1 scrollspy */
  var links = $$('[data-nav]');
  var ids = [];
  links.forEach(function (a) { if (ids.indexOf(a.getAttribute('data-nav')) < 0) ids.push(a.getAttribute('data-nav')); });
  var targets = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
  var current;
  var menuLabel = $('[data-current-label]');
  function setActive(id) {
    if (id === current) return;
    current = id;
    links.forEach(function (a) {
      if (a.getAttribute('data-nav') === id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    if (menuLabel) {
      var a = id ? $('[data-nav="' + id + '"][data-label]') : null;
      menuLabel.textContent = a ? a.getAttribute('data-label') : 'Sections';
    }
    var sc = $('.nav-scroll');
    var pill = id && sc ? $('[data-nav="' + id + '"]', sc) : null;
    if (pill && sc.scrollWidth > sc.clientWidth + 1) {            // keep the current pill inside the scroller
      var l = pill.offsetLeft, r = l + pill.offsetWidth, pad = 60;          // clear of the 56-px fade edges
      if (l < sc.scrollLeft + pad || r > sc.scrollLeft + sc.clientWidth - pad) {
        var left = Math.max(0, l - pad);
        if (sc.scrollTo) sc.scrollTo({ left: left, behavior: reduce ? 'auto' : 'smooth' }); else sc.scrollLeft = left;
      }
    }
  }
  function spy() {
    var line = hdrH() + window.innerHeight * 0.28, id = null;
    targets.forEach(function (t) { if (t.getBoundingClientRect().top <= line) id = t.id; });
    var doc = document.documentElement;
    if (targets.length && window.innerHeight + window.scrollY >= doc.scrollHeight - 2) {
      var last = targets[targets.length - 1];                    // at the very bottom: the last section if it is in view
      if (last.getBoundingClientRect().bottom > hdrH()) id = last.id;
    }
    setActive(id);
  }
  var spyRaf = 0;
  window.addEventListener('scroll', function () {
    if (!spyRaf) spyRaf = requestAnimationFrame(function () { spyRaf = 0; spy(); cueCheck(); });
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 4);
  }, { passive: true });
  window.addEventListener('resize', function () { spy(); cueCheck(); });

  /* ---------------------------------------------------------------------------------------------- 2a scroller with fade edges */
  $$('.nav-scroll').forEach(function (sc) {
    var box = sc.parentNode;
    function edges() {
      box.classList.toggle('fade-l', sc.scrollLeft > 2);
      box.classList.toggle('fade-r', sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2);
    }
    sc.addEventListener('scroll', edges, { passive: true });
    window.addEventListener('resize', edges);
    if ('ResizeObserver' in window) new ResizeObserver(edges).observe(sc.firstElementChild || sc);   // e.g. when the fonts arrive
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(edges);
    edges();
  });

  /* ---------------------------------------------------------------------------------------------- 2b "Sections" menu */
  $$('[data-menu-button]').forEach(function (btn) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    function set(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
    }
    btn.addEventListener('click', function () { set(btn.getAttribute('aria-expanded') !== 'true'); });
    panel.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a[href^="#"]')) set(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { set(false); btn.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (btn.getAttribute('aria-expanded') === 'true' && !panel.contains(e.target) && !btn.contains(e.target)) set(false);
    });
    window.addEventListener('resize', function () { if (window.getComputedStyle(btn).display === 'none') set(false); });
  });

  /* ---------------------------------------------------------------------------------------------- 3 videos */
  var vids = $$('video.autoplay-visible');
  if (!reduce && 'IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting && en.intersectionRatio >= 0.5) {
          if (!v.dataset.userPaused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        } else if (!v.paused) { v.dataset.autoPaused = '1'; v.pause(); }
      });
    }, { threshold: [0, 0.5] });
    vids.forEach(function (v) {
      v.addEventListener('pause', function () {
        if (v.dataset.autoPaused) delete v.dataset.autoPaused;
        else if (!document.hidden && !v.ended) v.dataset.userPaused = '1';
      });
      v.addEventListener('play', function () { delete v.dataset.userPaused; });
      vio.observe(v);
    });
  }

  /* ---------------------------------------------------------------------------------------------- 4 video tabs */
  $$('.vtabs').forEach(function (box) {
    var items = JSON.parse($('.vtabs-data', box).textContent);
    var v = $('video', box), cap = $('figcaption', box);
    var tabs = $$('[role="tab"]', box);
    function select(i, focus) {
      var it = items[i], playing = !v.paused;
      tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
      if (focus) tabs[i].focus();
      v.innerHTML = '<source src="videos/' + it.name + '.webm" type="video/webm"><source src="videos/' + it.name + '.mp4" type="video/mp4">';
      v.poster = 'videos/posters/' + it.name + '.jpg';
      v.setAttribute('aria-label', it.label);
      cap.innerHTML = it.caption;
      v.load();
      if (playing && !reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    }
    tabs.forEach(function (t, i) {
      t.tabIndex = i === 0 ? 0 : -1;
      t.addEventListener('click', function () { if (t.getAttribute('aria-selected') !== 'true') select(i, false); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, n = tabs.length;
        if (k === 'ArrowRight') { e.preventDefault(); select((i + 1) % n, true); }
        else if (k === 'ArrowLeft') { e.preventDefault(); select((i + n - 1) % n, true); }
        else if (k === 'Home') { e.preventDefault(); select(0, true); }
        else if (k === 'End') { e.preventDefault(); select(n - 1, true); }
      });
    });
  });

  /* lightbox:begin -------------------------------------------------------------------------------- 5 lightbox
     A figure (button.zoom) opens over the page: dimmed backdrop, the PNG fitted to the viewport (at most its pixel
     width) with the figure's caption; the x button, Esc or a click on the backdrop closes it and returns the focus to
     the figure. No navigation and no history entry; the page does not scroll while it is open. */
  (function () {
    var dlg = document.getElementById('lightbox');
    if (!dlg) return;
    var fig = $('.lb-fig', dlg), cap = $('.lb-cap', dlg), closeBtn = $('.lb-close', dlg);
    var modal = typeof dlg.showModal === 'function', img = null, opener = null;
    if (!modal) dlg.classList.add('no-modal');
    function fit() {
      if (!img || !dlg.open) return;
      var small = window.innerWidth <= 768, pad = small ? 8 : 12, top = small ? 52 : 64, bottom = small ? 12 : 28;
      var capH = cap.hidden ? 0 : cap.offsetHeight + 10;
      img.style.maxHeight = Math.max(120, window.innerHeight - top - bottom - 2 * pad - capH) + 'px';
      img.style.maxWidth = Math.min(window.innerWidth - (small ? 16 : 64) - 2 * pad, +img.getAttribute('width') || 2240) + 'px';
    }
    function open(trigger) {
      var src = $('img', trigger);
      if (!src) return;
      opener = trigger;
      if (!img) { img = document.createElement('img'); fig.insertBefore(img, cap); }
      img.width = +src.getAttribute('width');
      img.height = +src.getAttribute('height');
      img.alt = src.alt || '';
      img.src = src.currentSrc || src.src;
      var f = trigger.closest('figure'), fc = f ? $('figcaption', f) : null;
      cap.innerHTML = fc ? fc.innerHTML : '';
      cap.hidden = !fc;
      var sbw = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.classList.add('lb-lock');
      if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
      if (modal) dlg.showModal(); else dlg.setAttribute('open', '');
      fit();
      closeBtn.focus();
    }
    function close() {
      if (!dlg.open) return;
      if (modal) dlg.close(); else dlg.removeAttribute('open');
      document.documentElement.classList.remove('lb-lock');
      document.body.style.paddingRight = '';
      if (opener) opener.focus();
    }
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('button.zoom') : null;
      if (t) { e.preventDefault(); open(t); }
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });       // the backdrop around the figure
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });        // Esc
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }                 // the close button is the only control
    });
    closeBtn.addEventListener('click', close);
    window.addEventListener('resize', fit);
  })();
  /* lightbox:end */

  /* ---------------------------------------------------------------------------------------------- 6 BibTeX copy */
  var cb = document.getElementById('copy-bib');
  if (cb) cb.addEventListener('click', function () {
    var pre = document.getElementById('bib-text'), txt = pre.textContent, label = $('span', cb);
    function done() { label.textContent = 'Copied'; setTimeout(function () { label.textContent = 'Copy'; }, 1500); }
    function fallback() {
      var r = document.createRange(); r.selectNodeContents(pre);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      try { if (document.execCommand('copy')) done(); } catch (e) { /* the text stays selected */ }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback);
    else fallback();
  });

  /* ---------------------------------------------------------------------------------------------- 7 first-use cue */
  var cues = $$('.icard[data-cue]').map(function (card) {
    var c = { card: card, used: false, shown: 0, inView: false, timer: 0 };
    function marked() { return $$('.cue-target', card); }
    c.target = function () { var sel = card.getAttribute('data-cue'); return (sel && $(sel, card)) || $('.icard-hd', card); };
    c.stop = function () {
      clearTimeout(c.timer);
      card.classList.remove('is-cued');
      marked().forEach(function (t) { t.classList.remove('cue-target'); });
    };
    c.start = function () {
      if (c.used || reduce || c.shown >= 3) return;
      c.shown++;
      var sel = card.getAttribute('data-cue');
      if (sel) $$(sel, card).forEach(function (t) { t.classList.add('cue-target'); });
      card.classList.add('is-cued');
      c.timer = setTimeout(c.stop, 7800);                         // three soft pulses, then rest
    };
    function use() { if (c.used) return; c.used = true; card.classList.add('was-used'); c.stop(); }
    card.addEventListener('pointerdown', use, { passive: true });
    card.addEventListener('keydown', use);
    return c;
  });
  function cueCheck() {
    if (reduce || !cues) return;
    var top = hdrH(), vh = window.innerHeight;
    cues.forEach(function (c) {
      if (c.used) return;
      var r = c.target().getBoundingClientRect();
      var vis = Math.min(r.bottom, vh) - Math.max(r.top, top);
      var seen = r.height > 0 && vis >= Math.min(r.height, 0.6 * (vh - top)) * 0.9;
      if (seen && !c.inView) { c.inView = true; c.start(); }
      else if (!seen && c.inView && vis <= 0) { c.inView = false; c.stop(); }
    });
  }

  /* ---------------------------------------------------------------------------------------------- 8 V(alpha) chart */
  (function () {
    var root = document.getElementById('vchart');
    if (!root) return;
    var NS = 'http://www.w3.org/2000/svg';
    var GREY = '#b4b9c0';
    var STYLE = {
      DMF: { color: '#0072B2', width: 3.2 },
      CoMusion: { color: '#D55E00', width: 2 },
      HumanMAC: { color: '#882255', width: 2 },
      SkeletonDiffusion: { color: '#009E73', width: 2 },
      AINet: { color: '#4D4D4D', width: 2, dash: '7 4' },
      siMLPeG: { color: GREY, width: 1.6 },
      MotionDEQ: { color: GREY, width: 1.6, dash: '5 4' },
      SeSGCN: { color: GREY, width: 1.6, dash: '5 4' },
      siMLPe: { color: GREY, width: 1.6, dash: '5 4' }
    };
    var ORDER = ['DMF', 'CoMusion', 'HumanMAC', 'SkeletonDiffusion', 'AINet', 'siMLPeG', 'MotionDEQ', 'SeSGCN', 'siMLPe'];
    var X_MIN = 0.005, X_MAX = 0.99, Y_MIN = -0.4, Y_MAX = 1.0, BAND = [0.02, 0.2];
    var X_MAJOR = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
    var X_MINOR = [0.005, 0.006, 0.007, 0.008, 0.009, 0.03, 0.04, 0.06, 0.07, 0.08, 0.09, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9];
    var Y_TICKS = [-0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0];
    var legendEl = $('.vchart-legend', root);
    var plot = $('.vchart-plot', root);
    var svg = plot.querySelector(':scope > svg');
    var tip = $('.vchart-tip', plot);
    var live = $('[aria-live]', plot);

    function node(name, attrs, parent) {
      var e = document.createElementNS(NS, name);
      for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    }
    function lineKey(st, w) {
      var s = node('svg', { width: w || 22, height: 10, viewBox: '0 0 ' + (w || 22) + ' 10', 'aria-hidden': 'true' });
      node('line', { x1: 1, y1: 5, x2: (w || 22) - 1, y2: 5, stroke: st.color, 'stroke-width': Math.min(st.width, 3),
        'stroke-dasharray': st.dash || 'none', 'stroke-linecap': 'round' }, s);
      return s;
    }
    function fmtV(v) { return (v < 0 ? '−' : '') + Math.abs(v).toFixed(3); }
    function fmtA(a) { return String(+a.toFixed(4)); }
    function fmtTick(v) { return v === 0 ? '0' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(1); }

    function start(data) {
      var methods = {}, keys = [];
      data.methods.forEach(function (m) {
        methods[m.key] = { key: m.key, label: m.label, alpha: m.alpha || data.alpha, value: m.value, hidden: false,
          style: STYLE[m.key] || { color: GREY, width: 1.6, dash: m.deterministic ? '5 4' : null } };
      });
      ORDER.forEach(function (k) { if (methods[k]) keys.push(k); });
      data.methods.forEach(function (m) { if (keys.indexOf(m.key) < 0) keys.push(m.key); });
      var grid = methods[keys[0]].alpha;
      var state = { idx: null, focus: null, geo: null, paths: {} };

      function nearestIndex(arr, a) {
        var la = Math.log(a), best = 0, bd = Infinity;
        for (var i = 0; i < arr.length; i++) { var d = Math.abs(Math.log(arr[i]) - la); if (d < bd) { bd = d; best = i; } }
        return best;
      }
      function valueAt(m, a) { return m.value[nearestIndex(m.alpha, a)]; }

      // legend: one toggle button per forecaster
      keys.forEach(function (k) {
        var m = methods[k];
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-pressed', 'true');
        b.title = 'Hide or show ' + m.label;
        b.appendChild(lineKey(m.style, 18));
        var t = document.createElement('span');
        t.textContent = m.label;
        b.appendChild(t);
        b.addEventListener('click', function () {
          m.hidden = !m.hidden;
          b.setAttribute('aria-pressed', m.hidden ? 'false' : 'true');
          if (state.paths[k]) state.paths[k].style.display = m.hidden ? 'none' : '';
          if (state.idx !== null) show(state.idx, false);
        });
        function emph(on) {
          state.focus = on ? k : null;
          keys.forEach(function (o) { if (state.paths[o]) state.paths[o].classList.toggle('dim', on && o !== k); });
        }
        b.addEventListener('mouseenter', function () { emph(true); });
        b.addEventListener('mouseleave', function () { emph(false); });
        b.addEventListener('focus', function () { emph(true); });
        b.addEventListener('blur', function () { emph(false); });
        legendEl.appendChild(b);
      });

      function render() {
        var W = Math.max(280, Math.round(plot.clientWidth));
        var narrow = W < 560;
        var H = Math.round(Math.min(440, Math.max(270, Math.min(W * 0.46, window.innerHeight - 330))));   // the card fits one screen
        var M = { t: 12, r: narrow ? 10 : 16, b: 44, l: narrow ? 44 : 52 };
        var pw = W - M.l - M.r, ph = H - M.t - M.b;
        var lx0 = Math.log(X_MIN), lx1 = Math.log(X_MAX);
        function X(a) { return M.l + (Math.log(a) - lx0) / (lx1 - lx0) * pw; }
        function Y(v) { return M.t + (Y_MAX - v) / (Y_MAX - Y_MIN) * ph; }
        state.geo = { W: W, H: H, M: M, pw: pw, ph: ph, X: X, Y: Y, narrow: narrow };
        tip.classList.toggle('below', narrow);   // phones: a readout under the plot instead of an overlay
        if (!narrow) tip.style.transform = '';

        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        svg.setAttribute('width', W);
        svg.setAttribute('height', H);
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        var defs = node('defs', {}, svg);
        var clip = node('clipPath', { id: 'vchart-clip' }, defs);
        node('rect', { x: M.l, y: M.t - 2, width: pw, height: ph + 2 }, clip);

        // precaution band
        node('rect', { x: X(BAND[0]), y: M.t, width: X(BAND[1]) - X(BAND[0]), height: ph, fill: '#eaf2fa' }, svg);
        var bl = node('text', { x: (X(BAND[0]) + X(BAND[1])) / 2, y: Y(-0.3), 'text-anchor': 'middle', 'class': 'band-label' }, svg);
        bl.textContent = 'precaution band';

        // grid and y axis
        Y_TICKS.forEach(function (v) {
          node('line', { x1: M.l, x2: M.l + pw, y1: Y(v), y2: Y(v), stroke: v === 0 ? '#9aa0a6' : '#ececec', 'stroke-width': 1,
            'shape-rendering': 'crispEdges' }, svg);
          var t = node('text', { x: M.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, svg);
          t.textContent = fmtTick(v);
        });
        // x axis
        node('line', { x1: M.l, x2: M.l + pw, y1: M.t + ph, y2: M.t + ph, stroke: '#80868b', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, svg);
        X_MINOR.forEach(function (a) {
          node('line', { x1: X(a), x2: X(a), y1: M.t + ph, y2: M.t + ph + 3, stroke: '#9aa0a6', 'stroke-width': 1 }, svg);
        });
        X_MAJOR.forEach(function (a) {
          node('line', { x1: X(a), x2: X(a), y1: M.t + ph, y2: M.t + ph + 5, stroke: '#80868b', 'stroke-width': 1 }, svg);
          var t = node('text', { x: X(a), y: M.t + ph + 18, 'text-anchor': 'middle' }, svg);
          t.textContent = fmtA(a);
        });
        var xt = node('text', { x: M.l + pw / 2, y: H - 6, 'text-anchor': 'middle', 'class': 'axis-title' }, svg);
        xt.textContent = 'cost ratio α';
        var yt = node('text', { x: 0, y: 0, 'text-anchor': 'middle', 'class': 'axis-title',
          transform: 'translate(' + 13 + ',' + (M.t + ph / 2) + ') rotate(-90)' }, svg);
        yt.textContent = 'relative value V(α)';

        // curves (DMF last, on top)
        var g = node('g', { 'clip-path': 'url(#vchart-clip)' }, svg);
        state.paths = {};
        keys.slice().reverse().forEach(function (k) {
          var m = methods[k], d = '';
          for (var i = 0; i < m.alpha.length; i++) d += (i ? 'L' : 'M') + X(m.alpha[i]).toFixed(1) + ',' + Y(m.value[i]).toFixed(1);
          var p = node('path', { d: d, stroke: m.style.color, 'stroke-width': m.style.width, 'class': 'series' }, g);
          if (m.style.dash) p.setAttribute('stroke-dasharray', m.style.dash);
          if (m.hidden) p.style.display = 'none';
          if (state.focus && state.focus !== k) p.classList.add('dim');
          state.paths[k] = p;
        });

        // hover layer
        state.cross = node('line', { y1: M.t, y2: M.t + ph, stroke: '#5f6368', 'stroke-width': 1, visibility: 'hidden',
          'shape-rendering': 'crispEdges' }, svg);
        state.dots = node('g', {}, svg);
        var hit = node('rect', { x: M.l, y: 0, width: pw, height: H, fill: 'transparent', style: 'cursor: crosshair' }, svg);
        function fromEvent(e) {
          var r = svg.getBoundingClientRect();
          var px = (e.clientX - r.left) * (W / r.width);
          var a = Math.exp(lx0 + (px - M.l) / pw * (lx1 - lx0));
          show(nearestIndex(grid, Math.min(X_MAX, Math.max(X_MIN, a))), false);
        }
        hit.addEventListener('pointermove', fromEvent);
        hit.addEventListener('pointerdown', fromEvent);
        hit.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
        if (narrow && state.idx === null) state.idx = nearestIndex(grid, 0.1);
        if (state.idx !== null) show(state.idx, false);
      }

      function show(i, announce) {
        var G = state.geo;
        state.idx = i;
        var a = grid[i], x = G.X(a);
        state.cross.setAttribute('x1', x);
        state.cross.setAttribute('x2', x);
        state.cross.setAttribute('visibility', 'visible');
        while (state.dots.firstChild) state.dots.removeChild(state.dots.firstChild);
        var rows = [];
        keys.forEach(function (k) {
          var m = methods[k];
          if (m.hidden) return;
          var v = valueAt(m, a);
          rows.push({ m: m, v: v });
          if (v >= Y_MIN && v <= Y_MAX)
            node('circle', { cx: x, cy: G.Y(v), r: k === 'DMF' ? 4.5 : 3.5, fill: m.style.color, stroke: '#ffffff', 'stroke-width': 1.5 }, state.dots);
        });
        rows.sort(function (p, q) { return q.v - p.v; });
        while (tip.firstChild) tip.removeChild(tip.firstChild);
        var hd = document.createElement('div');
        hd.className = 'hd';
        hd.textContent = 'α = ' + fmtA(a) + (a >= BAND[0] && a <= BAND[1] ? '  ·  precaution band' : '');
        tip.appendChild(hd);
        var list = document.createElement('div');
        list.className = 'rows';
        list.style.setProperty('--n', Math.ceil(rows.length / 2));
        tip.appendChild(list);
        rows.forEach(function (r) {
          var row = document.createElement('div');
          row.className = 'row';
          var b = document.createElement('b');
          b.textContent = fmtV(r.v);
          var name = document.createElement('span');
          name.textContent = r.m.label;
          row.appendChild(b);
          row.appendChild(lineKey(r.m.style, 16));
          row.appendChild(name);
          list.appendChild(row);
        });
        tip.hidden = rows.length === 0;
        if (!G.narrow) {
          var tw = tip.offsetWidth, left = x + 14;
          if (left + tw > G.W - 2) left = x - 14 - tw;
          if (left < 2) left = 2;
          tip.style.transform = 'translate(' + Math.round(left) + 'px,' + (G.M.t + 6) + 'px)';
        }
        if (announce) live.textContent = 'alpha ' + fmtA(a) + ': ' + rows.map(function (r) { return r.m.label + ' ' + fmtV(r.v); }).join(', ');
      }
      function hide() {
        if (state.geo && state.geo.narrow) return;   // the readout under the plot stays
        state.idx = null;
        if (state.cross) state.cross.setAttribute('visibility', 'hidden');
        if (state.dots) while (state.dots.firstChild) state.dots.removeChild(state.dots.firstChild);
        tip.hidden = true;
      }

      plot.addEventListener('keydown', function (e) {
        var i = state.idx === null ? nearestIndex(grid, 0.1) : state.idx, step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowRight') i = Math.min(grid.length - 1, i + (state.idx === null ? 0 : step));
        else if (e.key === 'ArrowLeft') i = Math.max(0, i - (state.idx === null ? 0 : step));
        else if (e.key === 'Home') i = 0;
        else if (e.key === 'End') i = grid.length - 1;
        else if (e.key === 'Escape') { hide(); return; }
        else return;
        e.preventDefault();
        show(i, true);
      });
      plot.addEventListener('focus', function () { if (state.idx === null) show(nearestIndex(grid, 0.1), true); });
      plot.addEventListener('blur', hide);

      var lastW = 0, raf = 0;
      function onResize() {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          if (Math.abs(plot.clientWidth - lastW) >= 1) { lastW = plot.clientWidth; render(); }
        });
      }
      if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(plot);
      else window.addEventListener('resize', onResize);
      lastW = plot.clientWidth;
      render();
      // an initial readout (data-initial-alpha) shows at once that the chart can be read at any cost ratio
      var ia = parseFloat(root.getAttribute('data-initial-alpha'));
      if (!isNaN(ia) && state.idx === null) show(nearestIndex(grid, ia), false);
    }

    function fail() {
      var p = document.createElement('p');
      p.className = 'vchart-note';
      p.textContent = 'The chart data could not be loaded.';
      root.insertBefore(p, plot);
      plot.style.display = 'none';
    }
    if (window.VCURVE_HARPER) start(window.VCURVE_HARPER);
    else if (window.fetch) fetch('data/vcurve_harper.json').then(function (r) { return r.json(); }).then(start).catch(fail);
    else fail();
  })();

  /* ---------------------------------------------------------------------------------------------- 9 start when near */
  function whenNear(el, fn, margin) {
    if (!el) return;
    var done = false;
    function go() {
      if (done) return;
      done = true;
      try { fn(el); } catch (e) { if (window.console) console.error(e); }
      setTimeout(cueCheck, 300);
    }
    var m = margin || 900, r = el.getBoundingClientRect();
    if (!('IntersectionObserver' in window) || (r.top < window.innerHeight + m && r.bottom > -m)) { go(); return; }   // already near
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (en) { return en.isIntersecting; })) { io.disconnect(); go(); }
    }, { rootMargin: m + 'px 0px ' + m + 'px 0px' });
    io.observe(el);
  }
  window.DMFSite = { whenNear: whenNear };

  spy();
  if (header) header.classList.toggle('is-scrolled', window.scrollY > 4);   // e.g. after a reload in the middle of the page
  if (document.readyState === 'complete') cueCheck(); else window.addEventListener('load', cueCheck);
})();
