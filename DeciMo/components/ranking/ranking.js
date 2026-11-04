/* "Ranking reversal": the HARPER forecasters ranked by best-of-K ADE and by decision value (precaution-band skill).
   Vanilla JS + inline SVG, no library; works from file:// (data come from a script that sets a global).

   Data: data/ranking_harper.js sets window.DMF_RANKING (built by 可视化/DMF_TPAMI_FIGS_20261020/web/export_ranking.py):
   rows = forecasters x input (H, H+R) with ADE, FDE (m, lower is better), PBS (higher is better), miss10 (%), color,
   deterministic; kendall_tau_by_input: Kendall's tau between the two rankings over the forecasters of each input.
   Usage: DMFRanking.init(element, window.DMF_RANKING [, { view: 'both' | 'ade' | 'pbs' }]). */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var VIEWS = [
    { key: 'both', label: 'Both rankings' },
    { key: 'ade', label: 'Ranked by best-of-K ADE' },
    { key: 'pbs', label: 'Ranked by decision value' }
  ];
  var PAIR = [['SPARD', 'H'], ['SkeletonDiffusion', 'H']];   // highlighted when nothing is hovered: lower ADE, less value
  var DUR = 650;

  function prepare(data) {
    var rows = data.rows.map(function (r, i) {
      return { i: i, method: r.method, name: r.name, input: r.input, color: r.color, det: !!r.deterministic,
        ADE: r.ADE, FDE: r.FDE, PBS: r.PBS, miss10: r.miss10 };
    });
    var byAde = rows.slice().sort(function (a, b) { return a.ADE - b.ADE || a.i - b.i; });
    var byPbs = rows.slice().sort(function (a, b) { return b.PBS - a.PBS || a.i - b.i; });
    byAde.forEach(function (r, k) { r.rA = k + 1; });
    byPbs.forEach(function (r, k) { r.rP = k + 1; });
    var c = 0, d = 0;
    for (var a = 0; a < rows.length; a++) for (var b = a + 1; b < rows.length; b++) {
      var s = (rows[a].rA - rows[b].rA) * (rows[a].rP - rows[b].rP);
      if (s > 0) c++; else if (s < 0) d++;
    }
    var pair = PAIR.map(function (p) {
      var hit = null;
      rows.forEach(function (r) { if (r.method === p[0] && r.input === p[1]) hit = r; });
      return hit;
    });
    return { rows: rows, byAde: byAde, byPbs: byPbs, tau: (c - d) / (rows.length * (rows.length - 1) / 2),
      pair: pair[0] && pair[1] ? pair : null };
  }

  function h(tag, attrs, parent, text) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }
  function sv(tag, attrs, parent, text) {
    var el = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function f3(v) { return v.toFixed(3); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  var uid = 0;

  // marker: circle (sets of futures) or square (deterministic); filled with the robot history, hollow without
  function marker(r, parent, x, y, size) {
    var filled = r.input !== 'H', s = size || 4.6;
    var attrs = { fill: filled ? r.color : '#ffffff', stroke: filled ? '#ffffff' : r.color, 'stroke-width': filled ? 1.5 : 1.8 };
    if (r.det) { attrs.x = x - s + 0.6; attrs.y = y - s + 0.6; attrs.width = 2 * s - 1.2; attrs.height = 2 * s - 1.2; return sv('rect', attrs, parent); }
    attrs.cx = x; attrs.cy = y; attrs.r = s;
    return sv('circle', attrs, parent);
  }
  // "best-of-K ADE" with an italic K, as in the page text (SVG and HTML versions)
  function bestOfK(parent, svgMode, before, after, cap) {
    var mk = svgMode ? function (t, it) { return sv('tspan', it ? { 'font-style': 'italic' } : null, parent, t); }
      : function (t, it) { return it ? h('i', null, parent, t) : parent.appendChild(document.createTextNode(t)); };
    mk((before || '') + (cap ? 'Best-of-' : 'best-of-'), false); mk('K', true); mk(' ADE' + (after || ''), false);
    return parent;
  }
  function nameText(r, parent, x, y, anchor) {
    var t = sv('text', { x: x, y: y, 'text-anchor': anchor || 'end', class: 'name' }, parent);
    sv('tspan', null, t, r.name);
    sv('tspan', { class: 'inp', dx: 4 }, t, r.input);
    return t;
  }

  function init(container, data, opts) {
    if (!container) return null;
    opts = opts || {};
    container.classList.add('rk');
    if (!data || !data.rows || !data.rows.length) {
      clear(container);
      h('p', { class: 'rk-fail' }, container, 'The data of this component could not be loaded.');
      return null;
    }
    var P = prepare(data), rows = P.rows, N = rows.length;
    var id = 'rk' + (++uid);
    var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function reduced() { return !!(mq && mq.matches); }
    var st = { view: 'both', hover: null, pinned: null, dx: 0, y: {}, raf: 0 };
    VIEWS.forEach(function (v) { if (opts.view === v.key) st.view = v.key; });
    clear(container);

    // ---------------- controls, legend
    var bar = h('div', { class: 'rk-bar' }, container);
    var seg = h('div', { class: 'rk-seg', role: 'group', 'aria-label': 'View' }, bar);
    var btns = {};
    VIEWS.forEach(function (v) {
      var b = h('button', { type: 'button', 'aria-pressed': 'false' }, seg);
      var lab = h('span', null, b);
      if (v.key === 'ade') bestOfK(lab, false, 'Ranked by '); else lab.textContent = v.label;
      b.addEventListener('click', function () { setView(v.key, true); });
      btns[v.key] = b;
    });
    var tau = h('div', { class: 'rk-tau' }, bar);
    var tauIn = data.kendall_tau_by_input || {};
    tau.appendChild(document.createTextNode('Kendall’s τ = ' + (+tauIn['H+R']).toFixed(2) + ' (H+R), ' + (+tauIn.H).toFixed(2) + ' (H)'));
    h('span', { class: 'lbl' }, tau, 'between the two rankings');
    var keys = h('div', { class: 'rk-keys' }, container);
    [[{ input: 'H+R', det: false, color: '#5f6368' }, null, 'with the robot history (H+R)'],
      [{ input: 'H', det: false, color: '#5f6368' }, '5 4', 'human history only (H)'],
      [{ input: 'H+R', det: true, color: '#5f6368' }, 'none', 'deterministic forecaster (one future)']].forEach(function (k) {
      var sp = h('span', null, keys);
      var s = sv('svg', { width: 26, height: 12, viewBox: '0 0 26 12', 'aria-hidden': 'true', focusable: 'false' }, sp);
      if (k[1] !== 'none') sv('line', { x1: 1, y1: 6, x2: 25, y2: 6, stroke: '#5f6368', 'stroke-width': k[0].input === 'H' ? 1.6 : 2,
        'stroke-dasharray': k[1] || 'none' }, s);
      marker(k[0], s, 13, 6, 4.2);
      h('span', null, sp, k[2]);
    });

    // ---------------- chart
    var plot = h('div', { class: 'rk-plot', tabindex: '0', role: 'group',
      'aria-label': 'Forecasters ranked by best-of-K ADE and by decision value. Up and down arrow keys step through the forecasters.',
      'aria-describedby': id + '-read' }, container);
    var svg = sv('svg', { 'aria-hidden': 'true', focusable: 'false' }, plot);
    var read = h('p', { class: 'rk-read', id: id + '-read' }, container);
    var live = h('div', { class: 'rk-sr', 'aria-live': 'polite' }, container);
    var note = h('p', { class: 'rk-note' }, container);
    bestOfK(note, false, '', ': average error of the forecast future closest to the recorded one ' +
      '(deterministic forecasters: their single future), in meters, lower is better. Decision value: precaution-band skill (PBS), ' +
      'higher is better. Select a line, or use the arrow keys, to read both values.', true);
    var table = h('table', null, h('div', { class: 'rk-sr' }, container));
    h('caption', null, table, 'Forecasters on HARPER: best-of-K ADE and precaution-band skill with their ranks');
    var thr = h('tr', null, h('thead', null, table));
    ['Forecaster', 'Input', 'Best-of-K ADE (m)', 'Rank by ADE', 'Precaution-band skill', 'Rank by decision value'].forEach(function (t) {
      h('th', { scope: 'col' }, thr, t);
    });
    var tb = h('tbody', null, table);
    P.byAde.forEach(function (r) {
      var tr = h('tr', null, tb);
      h('th', { scope: 'row' }, tr, r.name);
      [r.input, f3(r.ADE), String(r.rA), f3(r.PBS), String(r.rP)].forEach(function (x) { h('td', null, tr, x); });
    });

    var L = null, G = {};
    function measure(probeFn) {
      var probe = sv('g', { transform: 'translate(-9999,-9999)' }, svg);
      var w = probeFn(probe);
      svg.removeChild(probe);
      return w;
    }
    function render() {
      var W = Math.max(280, Math.round(plot.clientWidth || 700));
      var narrow = W < 600;
      cancelAnimationFrame(st.raf);
      svg.setAttribute('class', st.view === 'both' ? 'view-slope' : 'view-list');
      clear(svg);
      var nameW = measure(function (g) {
        var m = 0;
        rows.forEach(function (r) { m = Math.max(m, nameText(r, g, 0, 0, 'start').getComputedTextLength()); });
        return m;
      }) || 140;
      var vW = measure(function (g) {
        var m = 0;
        rows.forEach(function (r) {
          [f3(r.ADE), f3(r.PBS)].forEach(function (x) { m = Math.max(m, sv('text', { class: 'val' }, g, x).getComputedTextLength()); });
        });
        return m;
      }) || 34;
      nameW = Math.ceil(nameW) + 6; vW = Math.ceil(vW) + 1;
      // rows 18 to 24 px apart, as far as the card still fits one screen (about 1280 x 720 and up)
      var fit = Math.floor(((global.innerHeight || 900) - 320) / N);
      var pitch = narrow ? 23 : Math.max(18, Math.min(24, fit)), top = 50, H = top + N * pitch + 6;
      var rankW = narrow ? 15 : 20, gap = narrow ? 6 : 9, mW = 5;
      var xL = rankW + gap + nameW + gap + vW + 8 + mW;
      var xR = narrow ? W - (mW + 8 + vW + 2) : W - (mW + 8 + vW + gap + nameW + gap + rankW);
      var listRight = xL + mW + 8 + vW;
      var dxList = Math.max(0, Math.round((W - listRight) / 2 - 4));
      function Y(rank) { return top + (rank - 0.5) * pitch; }
      L = { W: W, H: H, narrow: narrow, pitch: pitch, top: top, xL: xL, xR: xR, Y: Y, dxList: dxList, mW: mW, vW: vW };
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);

      // headers: slope view
      var hs = sv('g', { class: 'slope-only' }, svg);
      bestOfK(sv('text', { x: xL + mW, y: 16, 'text-anchor': 'end', class: 'head' }, hs), true, narrow ? '' : 'Ranked by ', '', narrow);
      sv('text', { x: xL + mW, y: 32, 'text-anchor': 'end', class: 'small' }, hs, 'rank 1: lowest error (m)');
      var rxA = narrow ? W : xR - mW, anc = narrow ? 'end' : 'start';
      sv('text', { x: rxA, y: 16, 'text-anchor': anc, class: 'head' }, hs, narrow ? 'Decision value' : 'Ranked by decision value');
      sv('text', { x: rxA, y: 32, 'text-anchor': anc, class: 'small' }, hs, 'rank 1: highest PBS');
      // headers: list view
      var hl = sv('g', { class: 'list-only', transform: 'translate(' + dxList + ',0)' }, svg);
      L.listTitle = sv('text', { x: rankW + gap, y: 16, class: 'head' }, hl, '');
      sv('text', { x: xL - mW - 8, y: 38, 'text-anchor': 'end', class: 'small' }, hl, 'ADE (m)');
      sv('text', { x: listRight, y: 38, 'text-anchor': 'end', class: 'small' }, hl, 'PBS');
      sv('line', { x1: 0, x2: listRight + 2, y1: top - 4, y2: top - 4, stroke: '#e6e6e6', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, hl);

      // rank numbers (left: they move with the list; right: slope view only, desktop)
      L.ranks = sv('g', null, svg);
      for (var k = 1; k <= N; k++) sv('text', { x: rankW, y: Y(k) + 4, 'text-anchor': 'end', class: 'small num' }, L.ranks, String(k));
      if (!narrow) {
        var rr = sv('g', { class: 'slope-only' }, svg);
        for (var k2 = 1; k2 <= N; k2++) sv('text', { x: W, y: Y(k2) + 4, 'text-anchor': 'end', class: 'small num' }, rr, String(k2));
      }

      // forecasters
      var layer = sv('g', null, svg);
      L.layer = layer;
      G = {};
      rows.forEach(function (r) {
        var g = sv('g', { class: 'rk-f' }, layer);
        var o = { g: g, r: r };
        var base = r.input === 'H' ? 1.6 : 2.1;
        o.base = base;
        o.line = sv('path', { class: 'rk-line slope-only', stroke: r.color, 'stroke-width': base,
          'stroke-dasharray': r.input === 'H' ? '5 4' : 'none' }, g);
        o.hit = sv('path', { class: 'rk-hit slope-only' }, g);
        o.left = sv('g', null, g);
        sv('rect', { class: 'rk-box', x: 0, y: -pitch / 2, width: listRight + 4, height: pitch }, o.left);
        nameText(r, o.left, xL - mW - 8 - vW - gap, 4.3, 'end');
        sv('text', { x: xL - mW - 8, y: 4.3, 'text-anchor': 'end', class: 'val' }, o.left, f3(r.ADE));
        marker(r, o.left, xL, 0);
        sv('text', { x: listRight, y: 4.3, 'text-anchor': 'end', class: 'val list-only' }, o.left, f3(r.PBS));
        o.right = sv('g', { class: 'slope-only', transform: 'translate(0,' + Y(r.rP) + ')' }, g);
        sv('rect', { class: 'rk-box', x: xR - mW - 4, y: -pitch / 2, width: W - xR + mW + 4, height: pitch }, o.right);
        marker(r, o.right, xR, 0);
        sv('text', { x: xR + mW + 8, y: 4.3, class: 'val' }, o.right, f3(r.PBS));
        if (!narrow) nameText(r, o.right, xR + mW + 8 + vW + gap, 4.3, 'start');
        g.addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') { st.hover = r.i; applyHighlight(false); } });
        g.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse' && st.hover === r.i) { st.hover = null; applyHighlight(false); } });
        g.addEventListener('click', function (ev) {
          ev.stopPropagation();
          st.pinned = st.pinned === r.i ? null : r.i;
          applyHighlight(false);
        });
        G[r.i] = o;
      });
      setListTitle();
      // place at the current state without animation
      var tgt = targets(st.view);
      st.dx = tgt.dx;
      rows.forEach(function (r) { st.y[r.i] = tgt.y[r.i]; });
      place();
      applyHighlight(false);
    }
    function setListTitle() {
      clear(L.listTitle);
      if (st.view === 'pbs') L.listTitle.textContent = 'Ranked by decision value (PBS)';
      else bestOfK(L.listTitle, true, 'Ranked by ');
    }
    function targets(view) {
      var y = {};
      rows.forEach(function (r) { y[r.i] = L.Y(view === 'pbs' ? r.rP : r.rA); });
      return { y: y, dx: view === 'both' ? 0 : L.dxList };
    }
    function place() {
      L.ranks.setAttribute('transform', 'translate(' + st.dx.toFixed(1) + ',0)');
      rows.forEach(function (r) {
        var o = G[r.i], yl = st.y[r.i], yr = L.Y(r.rP), x0 = L.xL + st.dx;
        o.left.setAttribute('transform', 'translate(' + st.dx.toFixed(1) + ',' + yl.toFixed(1) + ')');
        var d = 'M' + x0.toFixed(1) + ',' + yl.toFixed(1) + 'L' + L.xR.toFixed(1) + ',' + yr.toFixed(1);
        o.line.setAttribute('d', d);
        o.hit.setAttribute('d', d);
      });
    }
    function setView(view, user) {
      if (!L) return;
      var prev = st.view;
      st.view = view;
      VIEWS.forEach(function (v) { btns[v.key].setAttribute('aria-pressed', v.key === view ? 'true' : 'false'); });
      svg.setAttribute('class', view === 'both' ? 'view-slope' : 'view-list');
      setListTitle();
      var tgt = targets(view);
      cancelAnimationFrame(st.raf);
      if (reduced() || prev === view) {
        st.dx = tgt.dx;
        rows.forEach(function (r) { st.y[r.i] = tgt.y[r.i]; });
        place();
      } else {
        var from = { dx: st.dx, y: {} }, t0 = 0;
        rows.forEach(function (r) { from.y[r.i] = st.y[r.i]; });
        var frame = function (now) {
          if (!t0) t0 = now;
          var t = Math.min(1, (now - t0) / DUR), e = ease(t);
          st.dx = from.dx + (tgt.dx - from.dx) * e;
          rows.forEach(function (r) { st.y[r.i] = from.y[r.i] + (tgt.y[r.i] - from.y[r.i]) * e; });
          place();
          if (t < 1) st.raf = requestAnimationFrame(frame);
        };
        st.raf = requestAnimationFrame(frame);
      }
      if (user) {
        var order = view === 'pbs' ? P.byPbs : P.byAde;
        live.textContent = view === 'both' ? 'Both rankings side by side.'
          : (view === 'pbs' ? 'Ranked by decision value: ' : 'Ranked by best-of-K ADE: ') +
            order.slice(0, 5).map(function (r, k) { return (k + 1) + ' ' + r.name + ' ' + r.input; }).join(', ') + ', and so on.';
      }
    }

    function describe(r) {
      clear(read);
      var b = h('b', null, read, r.name);
      b.style.fontWeight = '700';
      bestOfK(read, false, ' (' + r.input + '): ', ' ');
      h('b', null, read, f3(r.ADE) + ' m');
      read.appendChild(document.createTextNode(' (rank ' + r.rA + ' of ' + N + '), decision value PBS '));
      h('b', null, read, f3(r.PBS));
      read.appendChild(document.createTextNode(' (rank ' + r.rP + ' of ' + N + ')'));
      if (r.miss10 != null) {
        read.appendChild(document.createTextNode(', and misses '));
        h('b', null, read, (+r.miss10).toFixed(1) + '%');   // the data hold the paper's rounding (1 decimal)
        read.appendChild(document.createTextNode(' of the entries at a false alarm rate of at most 10%.'));
      } else read.appendChild(document.createTextNode('.'));
    }
    function describePair() {
      clear(read);
      if (!P.pair) return;
      var a = P.pair[0], b = P.pair[1];   // a: lower ADE (SPARD), b: more value (SkeletonDiffusion)
      read.appendChild(document.createTextNode('Highlighted: '));
      h('b', null, read, b.name + ' (' + b.input + ')');
      bestOfK(read, false, ' has a higher ', ' than ');
      h('b', null, read, a.name + ' (' + a.input + ')');
      read.appendChild(document.createTextNode(', ' + f3(b.ADE) + ' against ' + f3(a.ADE) + ' m (rank ' + b.rA + ' against ' + a.rA +
        '), yet more decision value: PBS ' + f3(b.PBS) + ' against ' + f3(a.PBS) + ' (rank ' + b.rP + ' against ' + a.rP + ').'));
    }
    function applyHighlight(announce) {
      if (!L) return;
      var f = st.hover != null ? st.hover : st.pinned;
      var pairI = P.pair ? P.pair.map(function (r) { return r.i; }) : [];
      rows.forEach(function (r) {
        var o = G[r.i], on = f != null ? r.i === f : pairI.indexOf(r.i) >= 0;
        o.g.classList.toggle('hl', on);
        o.g.classList.toggle('dim', f != null && !on);
        o.g.classList.toggle('soft', f == null && pairI.length > 0 && !on);
        o.line.setAttribute('stroke-width', on ? o.base + 1.3 : o.base);
      });
      // draw the highlighted lines on top
      var raise = f != null ? [f] : pairI;
      raise.forEach(function (i) { if (G[i] && L.layer.lastChild !== G[i].g) L.layer.appendChild(G[i].g); });
      if (f != null) describe(rows[f]); else describePair();
      if (announce) live.textContent = read.textContent;
    }
    svg.addEventListener('click', function () { if (st.pinned != null) { st.pinned = null; applyHighlight(false); } });
    plot.addEventListener('keydown', function (ev) {
      var order = st.view === 'pbs' ? P.byPbs : P.byAde;
      var cur = st.pinned != null ? order.indexOf(rows[st.pinned]) : -1, k = cur;
      if (ev.key === 'ArrowDown') k = cur < 0 ? 0 : Math.min(N - 1, cur + 1);
      else if (ev.key === 'ArrowUp') k = cur < 0 ? 0 : Math.max(0, cur - 1);
      else if (ev.key === 'Home') k = 0;
      else if (ev.key === 'End') k = N - 1;
      else if (ev.key === 'Escape') { st.pinned = null; applyHighlight(true); return; }
      else return;
      ev.preventDefault();
      st.pinned = order[k].i;
      applyHighlight(true);
    });

    var lastW = 0, raf = 0;
    function onResize() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (Math.abs(plot.clientWidth - lastW) >= 1) { lastW = plot.clientWidth; render(); }
      });
    }
    lastW = plot.clientWidth;
    render();
    setView(st.view, false);
    if ('ResizeObserver' in global) new ResizeObserver(onResize).observe(plot);
    else global.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { render(); });

    return {
      setView: function (v) { setView(v, false); },
      highlight: function (method, input) {
        st.pinned = null;
        rows.forEach(function (r) { if (r.method === method && r.input === input) st.pinned = r.i; });
        applyHighlight(false);
      },
      prepared: P,
      state: st
    };
  }

  global.DMFRanking = { init: init, prepare: prepare };
})(typeof window !== 'undefined' ? window : this);
