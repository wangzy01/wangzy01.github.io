/* "Be the robot": what each forecaster is worth to a robot with cost ratio alpha, on the HARPER test windows.
   Vanilla JS + inline SVG, no library; works from file:// (data come from a script that sets a global).

   Data: data/robot_game_harper.js sets window.DMF_ROBOT_GAME
   (built by 可视化/DMF_TPAMI_FIGS_20261020/web/export_robot_game.py).
   Usage: DMFRobotGame.init(element, window.DMF_ROBOT_GAME [, { alpha: 0.1, episode: 'xy_act15_30hz',
          episodes: ['t_act15_30hz', ...], episodesNote: '...' }]).
   episodes (optional): the only episodes offered by the episode strip, in this order (the page passes four of them;
   all windows still count in the table). episodesNote (optional): a sentence under the strip heading.

   Rules, exactly as in the evaluation (they reproduce value_curve.csv.gz):
   - a forecaster's robot takes the precaution iff 1e4 * count > alpha_int * K (i.e. p = count / K > alpha);
     the worst-case speed rule takes it iff worst_case = 1, whatever alpha;
   - regret per window, in units of the avoidable loss: alpha for a precaution without an entry,
     1 - alpha for an entry without a precaution, 0 otherwise; S = mean over the windows;
   - base rate s = mean(target); climatology regret Sclim = min(alpha, s) - alpha * s;
     relative value V(alpha) = (Sclim - S) / Sclim;
   - fixed row order: precaution-band skill PBS = 1 - (integral of S) / (integral of Sclim) over alpha in [0.02, 0.2]
     with uniform weight, i.e. the average of V over the band weighted by Sclim (the PBS reported in the paper). */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var BAND = [0.02, 0.2];
  var WORST_SPEED = 1.6;                 // m/s, the constant speed assumed by the worst-case rule
  var RULE = 'worst_case';
  var STRIP_KEYS = ['DMF', 'CoMusion', 'HumanMAC', 'AINet', RULE];
  var QUIET = 0, CAUGHT = 1, MISSED = 2, ALARM = 3;
  var OUT = [
    { label: 'no action needed', color: '#c9cdd2' },
    { label: 'caught entry', color: '#2f2f2f' },
    { label: 'missed entry', color: '#c0392b' },
    { label: 'false alarm', color: '#d69200' }
  ];
  var RULE_STYLE = { color: '#4d4d4d', dash: '4 3' };
  var X_MAJOR = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
  var X_MINOR = [0.005, 0.006, 0.007, 0.008, 0.009, 0.03, 0.04, 0.06, 0.07, 0.08, 0.09, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9];

  // ------------------------------------------------------------------ model (no DOM; also used by the node check)
  function buildModel(D) {
    var n = D.n, e = D.target, i, j, k;
    if (!n || !e || e.length !== n || !D.methods || !D.alpha_int) throw new Error('DMF_ROBOT_GAME: unexpected data');
    var nEnt = 0;
    for (i = 0; i < n; i++) nEnt += e[i];
    var s = nEnt / n;
    var grid = D.alpha_int.slice();
    var alpha = grid.map(function (a) { return a / 1e4; });
    var q = String(D.question || '').split('|');
    var delta = parseFloat(q[2]);
    var hFrames = parseInt(q[3], 10);
    var fpsMatch = /_(\d+)hz$/.exec(D.episodes[0] || '');
    var fps = fpsMatch ? parseInt(fpsMatch[1], 10) : 30;

    var lo = BAND[0], hi = BAND[1];
    var mid = Math.max(lo, Math.min(hi, s));
    var climInt = (1 - s) * (mid * mid - lo * lo) / 2 + s * ((hi - mid) - (hi * hi - mid * mid) / 2);

    var rows = D.methods.map(function (m) {
      return { key: m.key, name: m.name, shortName: m.name, color: m.color, deterministic: !!m.deterministic, K: m.K,
        count: m.count, rule: false };
    });
    rows.push({ key: RULE, name: 'Worst-case speed rule', shortName: 'Worst-case rule', color: RULE_STYLE.color,
      deterministic: true, K: 1, flag: D.worst_case, rule: true });

    rows.forEach(function (r) {
      var G = grid.length;
      r.caught = new Array(G); r.missed = new Array(G); r.alarm = new Array(G); r.V = new Array(G);
      if (r.rule) {
        var c = 0, f = 0;
        for (i = 0; i < n; i++) if (r.flag[i] === 1) { if (e[i] === 1) c++; else f++; }
        for (j = 0; j < G; j++) { r.caught[j] = c; r.alarm[j] = f; }
      } else {
        var h1 = [], h0 = [];
        for (k = 0; k <= r.K; k++) { h1.push(0); h0.push(0); }
        for (i = 0; i < n; i++) (e[i] === 1 ? h1 : h0)[r.count[i]]++;
        for (j = 0; j < G; j++) {
          var c2 = 0, f2 = 0;
          for (k = 0; k <= r.K; k++) if (1e4 * k > grid[j] * r.K) { c2 += h1[k]; f2 += h0[k]; }
          r.caught[j] = c2; r.alarm[j] = f2;
        }
      }
      for (j = 0; j < G; j++) {
        var a = alpha[j];
        r.missed[j] = nEnt - r.caught[j];
        var S = (a * r.alarm[j] + (1 - a) * r.missed[j]) / n;
        var Sc = Math.min(a, s) - a * s;
        r.V[j] = (Sc - S) / Sc;
      }
      // precaution-band skill: regret integrated over alpha in [lo, hi] (closed form per window)
      var tot = 0;
      for (i = 0; i < n; i++) {
        if (r.rule) {
          if (e[i] === 0 && r.flag[i] === 1) tot += (hi * hi - lo * lo) / 2;
          else if (e[i] === 1 && r.flag[i] !== 1) tot += (hi - lo) - (hi * hi - lo * lo) / 2;
        } else {
          var p = r.count[i] / r.K;
          if (e[i] === 0) { var u = Math.min(hi, p); if (u > lo) tot += (u * u - lo * lo) / 2; }
          else { var l = Math.max(lo, p); if (l < hi) tot += (hi - l) - (hi * hi - l * l) / 2; }
        }
      }
      r.pbs = 1 - (tot / n) / climInt;
    });

    var order = rows.slice().sort(function (a, b) { return b.pbs - a.pbs; });
    var byKey = {};
    rows.forEach(function (r) { byKey[r.key] = r; });
    var bestOther = null;
    order.forEach(function (r) { if (!bestOther && !r.rule && r.key !== 'DMF') bestOther = r; });

    var eps = D.episodes.map(function (id, kk) {
      var m = /^(.+?)_act(\d+)/.exec(id);
      return { k: kk, id: id, subject: m ? m[1] : id, action: m ? parseInt(m[2], 10) : kk, idx: [], nEnt: 0 };
    });
    for (i = 0; i < n; i++) { var ep = eps[D.episode[i]]; ep.idx.push(i); ep.nEnt += e[i]; }
    var gaps = {};
    eps.forEach(function (ep2) {
      for (var t = 1; t < ep2.idx.length; t++) {
        var g = D.start[ep2.idx[t]] - D.start[ep2.idx[t - 1]];
        gaps[g] = (gaps[g] || 0) + 1;
      }
    });
    var step = 1, best = -1;
    Object.keys(gaps).forEach(function (g) { if (gaps[g] > best) { best = gaps[g]; step = +g; } });
    var epList = eps.filter(function (x) { return x.idx.length > 0; }).sort(function (a, b) {
      return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : a.action - b.action;
    });

    function decide(r, i2, j2) { return r.rule ? r.flag[i2] === 1 : 1e4 * r.count[i2] > grid[j2] * r.K; }
    function outcome(r, i2, j2) {
      var act = decide(r, i2, j2);
      return e[i2] === 1 ? (act ? CAUGHT : MISSED) : (act ? ALARM : QUIET);
    }
    function epTally(ep2, r, j2) {
      var t = { caught: 0, missed: 0, alarm: 0, quiet: 0 };
      ep2.idx.forEach(function (i2) {
        var o = outcome(r, i2, j2);
        if (o === CAUGHT) t.caught++; else if (o === MISSED) t.missed++; else if (o === ALARM) t.alarm++; else t.quiet++;
      });
      return t;
    }
    function indexOfAlpha(a) {
      var la = Math.log(a), bi = 0, bd = Infinity;
      for (var t = 0; t < alpha.length; t++) { var d = Math.abs(Math.log(alpha[t]) - la); if (d < bd) { bd = d; bi = t; } }
      return bi;
    }
    // Default episode: DMF has strictly fewer missed entries AND fewer false alarms than each comparator at alpha_j;
    // if several, the largest regret margin over the best comparator (fallbacks: weak dominance, then margin).
    function pickEpisode(j2, refKey, otherKeys) {
      var ref = byKey[refKey], a = alpha[j2], pick = null;
      eps.forEach(function (ep2) {
        if (!ep2.nEnt || !ref) return;
        var t = epTally(ep2, ref, j2), strict = true, weak = true, margin = Infinity;
        otherKeys.forEach(function (key) {
          var o = byKey[key];
          if (!o) return;
          var u = epTally(ep2, o, j2);
          if (!(t.missed < u.missed && t.alarm < u.alarm)) strict = false;
          if (!(t.missed <= u.missed && t.alarm <= u.alarm)) weak = false;
          margin = Math.min(margin, (a * u.alarm + (1 - a) * u.missed) - (a * t.alarm + (1 - a) * t.missed));
        });
        var rank = strict ? 2 : (weak && margin > 0 ? 1 : 0);
        if (!pick || rank > pick.rank || (rank === pick.rank && margin > pick.margin)) pick = { ep: ep2, rank: rank, margin: margin };
      });
      return pick ? pick.ep : null;
    }

    return {
      n: n, nEnt: nEnt, nNon: n - nEnt, s: s, grid: grid, alpha: alpha, delta: delta, hFrames: hFrames, fps: fps,
      horizon: hFrames / fps, rows: rows, order: order, byKey: byKey, bestOther: bestOther, eps: eps, epList: epList,
      step: step, decide: decide, outcome: outcome, epTally: epTally, indexOfAlpha: indexOfAlpha, pickEpisode: pickEpisode,
      band: [indexOfAlpha(BAND[0]), indexOfAlpha(BAND[1])], data: D
    };
  }

  // ------------------------------------------------------------------ helpers
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
  function fmtV(v) { var a = Math.abs(v); return (v < 0 && a >= 0.0005 ? '−' : '') + a.toFixed(3); }
  function fmtA(a) { return String(+a.toFixed(4)); }
  function fmtPct(a) { return String(+(a * 100).toFixed(2)) + '%'; }
  function fmtInt(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtTick(v) { return v === 0 ? '0' : (v < 0 ? '−' : '') + String(Math.abs(v)); }
  function fmtSec(f, fps) { return (f / fps).toFixed(1) + ' s'; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  var uid = 0;

  function lineKey(color, dash, w, width) {
    var s = sv('svg', { width: w || 18, height: 10, viewBox: '0 0 ' + (w || 18) + ' 10', 'aria-hidden': 'true', focusable: 'false' });
    sv('line', { x1: 1, y1: 5, x2: (w || 18) - 1, y2: 5, stroke: color, 'stroke-width': width || 2,
      'stroke-dasharray': dash || 'none', 'stroke-linecap': dash ? 'butt' : 'round' }, s);
    return s;
  }
  // outcome glyph: a tick above the baseline (precaution), below it (missed entry), or only the baseline
  function glyph(kind, parent, x, y) {
    var g = parent ? sv('g', { transform: 'translate(' + (x || 0) + ',' + (y || 0) + ')' }, parent)
      : sv('svg', { width: 12, height: 18, viewBox: '0 0 12 18', 'aria-hidden': 'true', focusable: 'false' });
    if (kind === 'entry') { sv('rect', { x: 3, y: 2, width: 6, height: 14, fill: OUT[CAUGHT].color }, g); return g; }
    sv('rect', { x: 0, y: 8.5, width: 12, height: 1, fill: OUT[QUIET].color }, g);
    if (kind === CAUGHT || kind === ALARM) sv('rect', { x: 3, y: 0, width: 6, height: 9, fill: OUT[kind].color }, g);
    if (kind === MISSED) sv('rect', { x: 3, y: 9, width: 6, height: 9, fill: OUT[kind].color }, g);
    return g;
  }
  function barPath(x0, x1, y, hgt, r) {
    var w = Math.abs(x1 - x0);
    if (w < 0.25) return '';
    r = Math.max(0, Math.min(r, w, hgt / 2));
    var sgn = x1 >= x0 ? 1 : -1;
    return 'M' + x0.toFixed(2) + ',' + y + 'H' + (x1 - sgn * r).toFixed(2) + 'Q' + x1.toFixed(2) + ',' + y + ' ' + x1.toFixed(2) + ',' + (y + r) +
      'V' + (y + hgt - r) + 'Q' + x1.toFixed(2) + ',' + (y + hgt) + ' ' + (x1 - sgn * r).toFixed(2) + ',' + (y + hgt) + 'H' + x0.toFixed(2) + 'Z';
  }

  // ------------------------------------------------------------------ view
  function init(container, data, opts) {
    if (!container) return null;
    opts = opts || {};
    container.classList.add('rg');
    if (!data || !data.methods) {
      clear(container);
      h('p', { class: 'rg-fail' }, container, 'The data of this component could not be loaded.');
      return null;
    }
    var M = buildModel(data), D = data;
    if (opts.episodes && opts.episodes.length) {
      var keep = opts.episodes.map(String);
      M.epList = M.epList.filter(function (ep) { return keep.indexOf(ep.id) >= 0; })
        .sort(function (a, b) { return keep.indexOf(a.id) - keep.indexOf(b.id); });
    }
    var restricted = !!(opts.episodes && opts.episodes.length && M.epList.length);
    var id = 'rg' + (++uid);
    var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function reduced() { return !!(mq && mq.matches); }
    var stripRows = (opts.stripKeys || STRIP_KEYS).map(function (k) { return M.byKey[k]; }).filter(Boolean);
    var defEp = M.pickEpisode(M.indexOfAlpha(0.1), 'DMF', stripRows.filter(function (r) { return !r.rule && r.key !== 'DMF'; })
      .map(function (r) { return r.key; }));
    var st = {
      j: M.indexOfAlpha(opts.alpha != null ? +opts.alpha : 0.1),
      ep: null, cur: null, playing: false, timer: 0, dir: 1
    };
    M.epList.forEach(function (ep) { if (opts.episode && ep.id === opts.episode && ep.idx.length) st.ep = ep; });
    if (!st.ep) st.ep = (defEp && M.epList.indexOf(defEp) >= 0) ? defEp : M.epList[0];
    var deltaTxt = String(+M.delta.toFixed(2)) + ' m', horTxt = String(+M.horizon.toFixed(2)) + ' s';

    clear(container);

    // ---------------- part 1: cost ratio, sweep, slider with V(alpha) of DMF and the best other forecaster
    var p1 = h('div', { class: 'rg-part' }, container);
    var top = h('div', { class: 'rg-top' }, p1);
    var read = h('div', { class: 'rg-read' }, top);
    var alphaEl = h('span', { class: 'rg-alpha' }, read);
    var noteEl = h('span', { class: 'rg-note' }, read);
    var playBtn = h('button', { type: 'button', class: 'rg-btn', 'aria-pressed': 'false' }, top);
    var playIcon = sv('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true', focusable: 'false' }, playBtn);
    var playTxt = h('span', null, playBtn);
    var slider = h('div', { class: 'rg-slider', role: 'slider', tabindex: '0', 'aria-label': 'Cost ratio alpha',
      'aria-valuemin': String(M.alpha[0]), 'aria-valuemax': String(M.alpha[M.alpha.length - 1]),
      'aria-describedby': id + '-sl-help' }, p1);
    var slSvg = sv('svg', { 'aria-hidden': 'true', focusable: 'false' }, slider);
    h('span', { id: id + '-sl-help', class: 'rg-sr' }, p1,
      'Left and right arrow keys move to the previous or next evaluated cost ratio, and Page Up and Page Down jump ten.');
    var keys = h('div', { class: 'rg-keys' }, p1);
    var kd = h('span', null, keys); kd.appendChild(lineKey(M.byKey.DMF ? M.byKey.DMF.color : '#0072B2', null, 18, 2.6)); h('span', null, kd, M.byKey.DMF ? M.byKey.DMF.name : 'DeciMo');
    if (M.bestOther) {
      var kb = h('span', null, keys); kb.appendChild(lineKey(M.bestOther.color, null, 18, 2));
      h('span', null, kb, M.bestOther.name + ' (most valuable of the others over the band)');
    }
    var kbd = h('span', null, keys);
    var bandSw = sv('svg', { width: 18, height: 10, viewBox: '0 0 18 10', 'aria-hidden': 'true', focusable: 'false' }, kbd);
    sv('rect', { x: 0, y: 0, width: 18, height: 10, fill: '#eaf2fa' }, bandSw);
    h('span', null, kbd, 'precaution band, α from ' + fmtA(BAND[0]) + ' to ' + fmtA(BAND[1]));

    // ---------------- part 2: ranked bars
    var p2 = h('div', { class: 'rg-part rg-bars' }, container);
    var barsTitle = h('p', { class: 'rg-h' }, p2);
    var barsSub = h('p', { class: 'rg-sub' }, p2);
    var barsSvg = sv('svg', { 'aria-hidden': 'true', focusable: 'false' }, p2);
    var table = h('table', null, h('div', { class: 'rg-sr' }, p2));
    var tcap = h('caption', null, table);
    var thead = h('thead', null, table), thr = h('tr', null, thead);
    ['Forecaster', 'Relative value V', 'Precaution-band skill', 'Entries caught', 'Entries missed', 'False alarms'].forEach(function (t) {
      h('th', { scope: 'col' }, thr, t);
    });
    var tbody = h('tbody', null, table);

    // ---------------- part 3: episode strip
    var p3 = h('div', { class: 'rg-part rg-strip' }, container);
    p3.style.position = 'relative';
    h('p', { class: 'rg-h' }, p3, restricted ? 'Test episodes, window by window' : 'One test episode, window by window');
    if (restricted && opts.episodesNote) h('p', { class: 'rg-strip-note' }, p3, opts.episodesNote);
    var head = h('div', { class: 'rg-strip-head' }, p3);
    h('label', { for: id + '-ep' }, head, restricted ? 'Example' : 'Episode');
    var nav = h('span', { class: 'rg-epnav' }, head);
    var prevBtn = h('button', { type: 'button', class: 'rg-btn icon', 'aria-label': 'Previous episode' }, nav);
    var chev = function (btn, dir) {
      var s = sv('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true', focusable: 'false' }, btn);
      sv('path', { d: dir < 0 ? 'M7.5 2.5L4 6l3.5 3.5' : 'M4.5 2.5L8 6l-3.5 3.5', fill: 'none', stroke: '#3c4043', 'stroke-width': 1.6,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s);
    };
    chev(prevBtn, -1);
    var sel = h('select', { id: id + '-ep', class: 'rg-select' }, nav);
    var nextBtn = h('button', { type: 'button', class: 'rg-btn icon', 'aria-label': 'Next episode' }, nav);
    chev(nextBtn, 1);
    var info = h('span', { class: 'rg-strip-info', 'aria-live': 'polite' }, head);
    var groups = {};
    M.epList.forEach(function (ep) {
      var g = restricted ? sel : groups[ep.subject];
      if (!g) g = groups[ep.subject] = h('optgroup', { label: 'Subject ' + ep.subject }, sel);
      h('option', { value: String(ep.k) }, g, (restricted ? 'Subject ' : '') + ep.subject + ', action ' + ep.action + ' (' + fmtInt(ep.idx.length) + ' windows, ' +
        fmtInt(ep.nEnt) + ' with an entry)');
    });
    var legend = h('div', { class: 'rg-legend' }, p3);
    [['entry', 'recorded entry'], [CAUGHT, OUT[CAUGHT].label], [MISSED, OUT[MISSED].label], [ALARM, OUT[ALARM].label],
      [QUIET, OUT[QUIET].label]].forEach(function (it) {
      var sp = h('span', null, legend);
      sp.appendChild(glyph(it[0]));
      h('span', null, sp, it[1]);
    });
    var body = h('div', { class: 'rg-strip-body' }, p3);
    var labSvg = sv('svg', { 'aria-hidden': 'true', focusable: 'false' }, body);
    var scroller = h('div', { class: 'rg-strip-scroll', tabindex: '0', role: 'group',
      'aria-label': 'Windows of the episode. Use the left and right arrow keys to read one window at a time' }, body);
    var plotSvg = sv('svg', { 'aria-hidden': 'true', focusable: 'false' }, scroller);
    var cntSvg = sv('svg', { 'aria-hidden': 'true', focusable: 'false' }, body);
    var tip = h('div', { class: 'rg-tip', hidden: '' }, p3);
    var foot = h('p', { class: 'rg-strip-foot' }, p3);
    foot.textContent = 'Ticks above the line: the robot slows down. Ticks below: an entry it did not slow down for. The worst-case rule ' +
      'slows down whenever the person could come within ' + deltaTxt + ' in ' + horTxt + ' at ' + WORST_SPEED + ' m/s, and ' +
      'the forecasters slow down when p̂ > α.';
    var live = h('div', { class: 'rg-sr', 'aria-live': 'polite' }, container);

    // ================================================================ slider
    var SL = null;
    function renderSlider() {
      var W = Math.max(260, Math.round(slider.clientWidth || 600));
      var narrow = W < 560;
      var H = narrow ? 128 : 146;
      var m = { t: 18, r: narrow ? 10 : 14, l: narrow ? 30 : 38 };
      var pb = H - 46, trackY = pb + 13;
      var pw = W - m.l - m.r, ph = pb - m.t;
      var a0 = M.alpha[0], a1 = M.alpha[M.alpha.length - 1], l0 = Math.log(a0), l1 = Math.log(a1);
      var YMIN = -0.4, YMAX = 1;
      function X(a) { return m.l + (Math.log(a) - l0) / (l1 - l0) * pw; }
      function Y(v) { return m.t + (YMAX - v) / (YMAX - YMIN) * ph; }
      SL = { W: W, H: H, m: m, pb: pb, trackY: trackY, pw: pw, X: X, Y: Y, l0: l0, l1: l1, YMIN: YMIN, YMAX: YMAX };
      slSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      slSvg.setAttribute('width', W);
      slSvg.setAttribute('height', H);
      clear(slSvg);
      var defs = sv('defs', null, slSvg);
      var cp = sv('clipPath', { id: id + '-clip' }, defs);
      sv('rect', { x: m.l, y: m.t - 3, width: pw, height: ph + 3 }, cp);
      sv('rect', { x: X(BAND[0]), y: m.t, width: X(BAND[1]) - X(BAND[0]), height: ph, fill: '#eaf2fa' }, slSvg);
      sv('text', { x: (X(BAND[0]) + X(BAND[1])) / 2, y: m.t - 5, 'text-anchor': 'middle', class: 'band-label' }, slSvg, 'precaution band');
      [1, 0.5, 0].forEach(function (v) {
        sv('line', { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), stroke: v === 0 ? '#9aa0a6' : '#ececec', 'stroke-width': 1,
          'shape-rendering': 'crispEdges' }, slSvg);
        sv('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'small' }, slSvg, fmtTick(v));
      });
      sv('text', { x: m.l + pw, y: Y(1) - 4, 'text-anchor': 'end', class: 'small' }, slSvg, 'V(α)');
      var g = sv('g', { 'clip-path': 'url(#' + id + '-clip)' }, slSvg);
      [M.bestOther, M.byKey.DMF].forEach(function (r) {
        if (!r) return;
        var d = '';
        for (var t = 0; t < M.alpha.length; t++) d += (t ? 'L' : 'M') + X(M.alpha[t]).toFixed(1) + ',' + Y(Math.max(YMIN - 0.05, r.V[t])).toFixed(1);
        sv('path', { d: d, stroke: r.color, 'stroke-width': r.key === 'DMF' ? 2.6 : 2, class: 'curve' }, g);
      });
      // track, ticks, labels
      sv('line', { x1: X(a0), x2: X(a1), y1: trackY, y2: trackY, stroke: '#dadce0', 'stroke-width': 4, 'stroke-linecap': 'round' }, slSvg);
      sv('line', { x1: X(BAND[0]), x2: X(BAND[1]), y1: trackY, y2: trackY, stroke: '#9ec5e8', 'stroke-width': 4 }, slSvg);
      X_MINOR.forEach(function (a) {
        sv('line', { x1: X(a), x2: X(a), y1: trackY + 5, y2: trackY + 8, stroke: '#9aa0a6', 'stroke-width': 1 }, slSvg);
      });
      X_MAJOR.forEach(function (a) {
        sv('line', { x1: X(a), x2: X(a), y1: trackY + 5, y2: trackY + 10, stroke: '#80868b', 'stroke-width': 1 }, slSvg);
        sv('text', { x: X(a), y: trackY + 24, 'text-anchor': 'middle', class: 'small' }, slSvg, fmtA(a));
      });
      SL.cursor = sv('line', { y1: m.t, y2: trackY, stroke: '#5f6368', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, slSvg);
      SL.dots = sv('g', null, slSvg);
      SL.thumb = sv('circle', { cy: trackY, r: 7.5, fill: '#ffffff', stroke: '#2f2f2f', 'stroke-width': 2 }, slSvg);
      placeSlider();
    }
    function placeSlider() {
      if (!SL) return;
      var a = M.alpha[st.j], x = SL.X(a);
      SL.cursor.setAttribute('x1', x); SL.cursor.setAttribute('x2', x);
      SL.thumb.setAttribute('cx', x);
      clear(SL.dots);
      [M.bestOther, M.byKey.DMF].forEach(function (r) {
        if (!r) return;
        var v = r.V[st.j];
        if (v < SL.YMIN || v > SL.YMAX) return;
        sv('circle', { cx: x, cy: SL.Y(v), r: r.key === 'DMF' ? 4.5 : 4, fill: r.color, stroke: '#ffffff', 'stroke-width': 2 }, SL.dots);
      });
    }
    var dragging = false;
    function fromPointer(ev) {
      var rect = slSvg.getBoundingClientRect();
      if (!rect.width) return;
      var px = (ev.clientX - rect.left) * (SL.W / rect.width);
      var a = Math.exp(SL.l0 + (px - SL.m.l) / SL.pw * (SL.l1 - SL.l0));
      a = Math.min(M.alpha[M.alpha.length - 1], Math.max(M.alpha[0], a));
      var j = M.indexOfAlpha(a);
      if (j !== st.j) setAlpha(j, 'pointer');
    }
    slider.addEventListener('pointerdown', function (ev) {
      if (ev.button) return;
      stopSweep();
      dragging = true;
      try { slider.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
      if (ev.pointerType === 'mouse') { ev.preventDefault(); slider.focus({ preventScroll: true }); }
      fromPointer(ev);
    });
    slider.addEventListener('pointermove', function (ev) { if (dragging) fromPointer(ev); });
    function endDrag() { dragging = false; }
    slider.addEventListener('pointerup', endDrag);
    slider.addEventListener('pointercancel', endDrag);
    slider.addEventListener('lostpointercapture', endDrag);
    slider.addEventListener('keydown', function (ev) {
      var j = st.j, last = M.alpha.length - 1;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') j += 1;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') j -= 1;
      else if (ev.key === 'PageUp') j += 10;
      else if (ev.key === 'PageDown') j -= 10;
      else if (ev.key === 'Home') j = 0;
      else if (ev.key === 'End') j = last;
      else return;
      ev.preventDefault();
      stopSweep();
      setAlpha(Math.max(0, Math.min(last, j)), 'key');
    });

    // ================================================================ sweep
    function setPlayUI() {
      clear(playIcon);
      if (st.playing) {
        sv('rect', { x: 2, y: 1.5, width: 3, height: 9, rx: 0.6, fill: '#3c4043' }, playIcon);
        sv('rect', { x: 7, y: 1.5, width: 3, height: 9, rx: 0.6, fill: '#3c4043' }, playIcon);
      } else {
        sv('path', { d: 'M3 1.5L10.5 6 3 10.5Z', fill: '#3c4043' }, playIcon);
      }
      playTxt.textContent = st.playing ? 'Pause the sweep' : 'Sweep the precaution band';
      playBtn.setAttribute('aria-pressed', st.playing ? 'true' : 'false');
    }
    function sweepStep() {
      var lo = M.band[0], hi = M.band[1], nj = st.j + st.dir;
      if (nj > hi) { st.dir = -1; nj = st.j - 1; } else if (nj < lo) { st.dir = 1; nj = st.j + 1; }
      setAlpha(nj, 'sweep');
      st.timer = setTimeout(sweepStep, reduced() ? 900 : 380);
    }
    function startSweep() {
      if (st.playing) return;
      st.playing = true;
      var lo = M.band[0], hi = M.band[1];
      if (st.j < lo || st.j > hi) { st.dir = 1; setAlpha(lo, 'sweep'); } else st.dir = st.j >= hi ? -1 : 1;
      setPlayUI();
      st.timer = setTimeout(sweepStep, reduced() ? 900 : 380);
    }
    function stopSweep() {
      if (!st.playing) return;
      clearTimeout(st.timer);
      st.playing = false;
      setPlayUI();
    }
    playBtn.addEventListener('click', function () { if (st.playing) stopSweep(); else startSweep(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopSweep(); });

    // ================================================================ ranked bars
    var BL = null, shown = {}, tween = 0;
    var VMIN = -0.5, VMAX = 1;
    function renderBars() {
      var W = Math.max(260, Math.round(p2.clientWidth || 600));
      var narrow = W < 640;
      var rows = M.order, nR = rows.length;
      var pitch = narrow ? 44 : 27, headH = narrow ? 4 : 40, axisH = narrow ? 30 : 44;
      var H = headH + nR * pitch + axisH;
      var xb0, xb1, xPbs = 0, xC = 0, xMi = 0, xFa = 0;
      if (narrow) { xb0 = 118; xb1 = W - 50; }
      else { xPbs = 196; xb0 = 218; xFa = W - 2; xMi = xFa - 116; xC = xMi - 70; xb1 = xC - 112; }
      function X(v) { return xb0 + (Math.max(VMIN, Math.min(VMAX, v)) - VMIN) / (VMAX - VMIN) * (xb1 - xb0); }
      BL = { W: W, H: H, narrow: narrow, pitch: pitch, headH: headH, xb0: xb0, xb1: xb1, X: X, rows: {} };
      barsSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      barsSvg.setAttribute('width', W);
      barsSvg.setAttribute('height', H);
      clear(barsSvg);
      var gy0 = headH - (narrow ? 0 : 4), gy1 = headH + nR * pitch;
      // hover rows (behind everything)
      rows.forEach(function (r, t) {
        sv('rect', { x: 0, y: headH + t * pitch, width: W, height: pitch, class: 'row-hit' }, barsSvg);
      });
      // grid
      [VMIN, 0, 0.5, VMAX].forEach(function (v) {
        var segs = narrow ? rows.map(function (r, t) { return [headH + t * pitch + 4, headH + t * pitch + 24]; }) : [[gy0, gy1]];
        segs.forEach(function (sg) {
          sv('line', { x1: X(v), x2: X(v), y1: sg[0], y2: sg[1], stroke: v === 0 ? '#9aa0a6' : '#ececec', 'stroke-width': 1,
            'shape-rendering': 'crispEdges' }, barsSvg);
        });
        sv('text', { x: X(v), y: gy1 + 16, 'text-anchor': 'middle', class: 'small num' }, barsSvg, fmtTick(v));
      });
      if (!narrow) {
        sv('text', { x: (xb0 + xb1) / 2, y: gy1 + 34, 'text-anchor': 'middle', class: 'small' }, barsSvg,
          '0: knowing only the base rate · 1: knowing the future');
        // column heads
        sv('text', { x: 0, y: 15, class: 'small' }, barsSvg, 'Forecaster');
        sv('text', { x: xPbs, y: 15, 'text-anchor': 'end', class: 'small' }, barsSvg, 'PBS');
        sv('text', { x: xPbs, y: 30, 'text-anchor': 'end', class: 'small' }, barsSvg, 'fixed order');
        BL.headV = sv('text', { x: xb0, y: 15, class: 'small' }, barsSvg, '');
        sv('text', { x: xb0, y: 30, class: 'small' }, barsSvg, 'bars below ' + fmtTick(VMIN) + ' are cut off');
        [[xC, CAUGHT, 'caught', M.nEnt], [xMi, MISSED, 'missed', M.nEnt], [xFa, ALARM, 'false alarms', M.nNon]].forEach(function (c) {
          var w = c[2].length > 7 ? 86 : 52;
          glyph(c[1], barsSvg, 0, 0).setAttribute('transform', 'translate(' + (c[0] - w) + ',4.5) scale(.66)');
          sv('text', { x: c[0] - w + 12, y: 15, class: 'small ink' }, barsSvg, c[2]);
          sv('text', { x: c[0], y: 30, 'text-anchor': 'end', class: 'small num' }, barsSvg, 'of ' + fmtInt(c[3]));
        });
      }
      rows.forEach(function (r, t) {
        var y0 = headH + t * pitch, isD = r.key === 'DMF';
        var o = { y0: y0 };
        var nameCls = isD ? 'strong' : 'ink';
        if (narrow) {
          var yc = y0 + 14;
          o.bh = isD ? 12 : 10; o.by = yc - o.bh / 2;
          sv('text', { x: 0, y: yc + 4, class: nameCls }, barsSvg, r.shortName);
          o.stats = sv('text', { x: 0, y: y0 + 34, class: 'small num' }, barsSvg, '');
        } else {
          var yc2 = y0 + pitch / 2;
          o.bh = isD ? 14 : 12; o.by = yc2 - o.bh / 2;
          sv('text', { x: 0, y: yc2 + 4.5, class: nameCls }, barsSvg, r.name);
          sv('text', { x: xPbs, y: yc2 + 4.5, 'text-anchor': 'end', class: 'num' + (isD ? ' strong' : '') }, barsSvg, fmtV(r.pbs));
          o.c = sv('text', { x: xC, y: yc2 + 4.5, 'text-anchor': 'end', class: 'num ' + nameCls }, barsSvg, '');
          o.mi = sv('text', { x: xMi, y: yc2 + 4.5, 'text-anchor': 'end', class: 'num ' + nameCls }, barsSvg, '');
          o.fa = sv('text', { x: xFa, y: yc2 + 4.5, 'text-anchor': 'end', class: 'num ' + nameCls }, barsSvg, '');
        }
        o.bar = sv('path', r.rule ? { fill: '#f1f3f4', stroke: RULE_STYLE.color, 'stroke-width': 1.3, 'stroke-dasharray': RULE_STYLE.dash }
          : { fill: r.color }, barsSvg);
        o.brk = sv('path', { d: '', stroke: '#ffffff', 'stroke-width': 1.6, fill: 'none' }, barsSvg);
        o.val = sv('text', { y: o.by + o.bh / 2 + 4.3, class: 'num ' + (isD ? 'strong' : 'ink') }, barsSvg, '');
        BL.rows[r.key] = o;
      });
      updateBars(false);
    }
    function drawBar(r, v) {
      var o = BL.rows[r.key];
      if (!o) return;
      var x0 = BL.X(0), x1 = BL.X(v), cut = v < VMIN;
      o.bar.setAttribute('d', barPath(x0, x1, o.by, o.bh, cut ? 0 : 3));
      o.brk.setAttribute('d', cut ? 'M' + (x1 + 7) + ',' + (o.by + o.bh + 1) + 'l4,' + (-o.bh - 2) + 'M' + (x1 + 11) + ',' + (o.by + o.bh + 1) + 'l4,' + (-o.bh - 2) : '');
      var lx = v >= 0 ? x1 + 6 : x0 + 6;
      o.val.setAttribute('x', lx.toFixed(1));
    }
    function updateBars(animate) {
      if (!BL) return;
      var j = st.j, a = M.alpha[j];
      barsTitle.textContent = 'What each forecaster is worth at α = ' + fmtA(a);
      barsSub.textContent = (BL.narrow ? 'Relative value V(α). ' : 'Relative value V(α) over the ' + fmtInt(M.n) + ' HARPER test windows. ') +
        'Rows keep the order of the precaution-band skill (PBS), a weighted average of the value over the band. ' +
        (BL.narrow ? 'Caught and missed: of the ' + fmtInt(M.nEnt) + ' windows with an entry. False alarms: of the ' + fmtInt(M.nNon) + ' without.'
          : 'Right: of the ' + fmtInt(M.nEnt) + ' windows with an entry within ' + horTxt + ', those the robot caught or missed, and of the ' +
            fmtInt(M.nNon) + ' without, those in which it slowed down anyway.');
      if (BL.headV) BL.headV.textContent = 'V(α) at α = ' + fmtA(a);
      M.order.forEach(function (r) {
        var o = BL.rows[r.key];
        o.val.textContent = fmtV(r.V[j]);
        if (BL.narrow) {
          o.stats.textContent = 'PBS ' + fmtV(r.pbs) + ' · caught ' + fmtInt(r.caught[j]) + ' · missed ' + fmtInt(r.missed[j]) +
            ' · false alarms ' + fmtInt(r.alarm[j]);
        } else {
          o.c.textContent = fmtInt(r.caught[j]);
          o.mi.textContent = fmtInt(r.missed[j]);
          o.fa.textContent = fmtInt(r.alarm[j]);
        }
      });
      // accessible table
      tcap.textContent = 'Relative value at alpha ' + fmtA(a) + ', in the order of the precaution-band skill';
      clear(tbody);
      M.order.forEach(function (r) {
        var tr = h('tr', null, tbody);
        h('th', { scope: 'row' }, tr, r.name);
        [fmtV(r.V[j]), fmtV(r.pbs), fmtInt(r.caught[j]), fmtInt(r.missed[j]), fmtInt(r.alarm[j])].forEach(function (x) { h('td', null, tr, x); });
      });
      // bars: tween from the shown values to the new ones
      cancelAnimationFrame(tween);
      var from = {}, to = {};
      M.order.forEach(function (r) { to[r.key] = r.V[j]; from[r.key] = shown[r.key] != null ? shown[r.key] : r.V[j]; });
      if (!animate || reduced()) {
        M.order.forEach(function (r) { shown[r.key] = to[r.key]; drawBar(r, to[r.key]); });
        return;
      }
      var t0 = 0, dur = st.playing ? 300 : 220;
      function frame(now) {
        if (!t0) t0 = now;
        var t = Math.min(1, (now - t0) / dur), k = ease(t);
        M.order.forEach(function (r) {
          var f = Math.max(VMIN - 0.2, from[r.key]), g = Math.max(VMIN - 0.2, to[r.key]);
          var v = t >= 1 ? to[r.key] : f + (g - f) * k;
          shown[r.key] = v;
          drawBar(r, v);
        });
        if (t < 1) tween = requestAnimationFrame(frame);
      }
      tween = requestAnimationFrame(frame);
    }

    // ================================================================ episode strip
    var SP = null;
    function epPos(k) { return D.start[st.ep.idx[k]]; }
    function renderStrip() {
      var bodyW = Math.max(260, Math.round(body.clientWidth || 600));
      var narrow = bodyW < 560;
      var labW = narrow ? 94 : 130, cntW = narrow ? 80 : 134;
      var viewW = Math.max(100, bodyW - labW - cntW);
      var ep = st.ep, idx = ep.idx;
      var f0 = D.start[idx[0]], f1 = D.start[idx[idx.length - 1]] + M.step;
      var span = Math.max(1, f1 - f0), pad = 4;
      var ppf = Math.min(3, Math.max(narrow ? 0.75 : 0.3, (viewW - 2 * pad) / span));
      var plotW = Math.max(viewW, Math.ceil(span * ppf + 2 * pad));
      var topH = 32, pitch = 25, nRows = 1 + stripRows.length, H = topH + nRows * pitch + 6;
      function X(f) { return pad + (f - f0) * ppf; }
      var tw = M.step * ppf; tw = tw > 3 ? tw - 1 : tw; tw = Math.max(1, tw);
      SP = { narrow: narrow, labW: labW, cntW: cntW, viewW: viewW, f0: f0, ppf: ppf, plotW: plotW, topH: topH, pitch: pitch, H: H, X: X,
        tw: tw, pad: pad };
      body.style.gridTemplateColumns = labW + 'px minmax(0, 1fr) ' + cntW + 'px';
      tip.classList.toggle('below', narrow);
      if (!narrow) tip.style.transform = '';

      // labels
      labSvg.setAttribute('width', labW); labSvg.setAttribute('height', H); labSvg.setAttribute('viewBox', '0 0 ' + labW + ' ' + H);
      clear(labSvg);
      sv('text', { x: 0, y: 20, class: 'small' }, labSvg, narrow ? 'start (s)' : 'window start (s)');
      var names = [{ name: 'Recorded entry' }].concat(stripRows);
      names.forEach(function (r, t) {
        var yc = topH + t * pitch + pitch / 2;
        var isD = r.key === 'DMF';
        var x = 0;
        if (!narrow && r.key) {
          var g = sv('g', { transform: 'translate(0,' + (yc - 5) + ')' }, labSvg);
          sv('line', { x1: 1, y1: 5, x2: 15, y2: 5, stroke: r.color, 'stroke-width': r.rule ? 1.6 : 2.4,
            'stroke-dasharray': r.rule ? RULE_STYLE.dash : 'none', 'stroke-linecap': r.rule ? 'butt' : 'round' }, g);
          x = 22;
        }
        sv('text', { x: x, y: yc + 4, class: isD ? 'strong' : 'ink' }, labSvg, r.key ? r.shortName : r.name);
      });

      // plot
      plotSvg.setAttribute('width', plotW); plotSvg.setAttribute('height', H); plotSvg.setAttribute('viewBox', '0 0 ' + plotW + ' ' + H);
      clear(plotSvg);
      var secs = [1, 2, 5, 10, 15, 20, 30, 60, 120], tickS = secs[secs.length - 1];
      for (var q = 0; q < secs.length; q++) if (secs[q] * M.fps * ppf >= (narrow ? 52 : 64)) { tickS = secs[q]; break; }
      var tf = tickS * M.fps;
      sv('line', { x1: 0, x2: plotW, y1: topH - 6, y2: topH - 6, stroke: '#e6e6e6', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, plotSvg);
      for (var f = Math.ceil(f0 / tf) * tf; f <= f1; f += tf) {
        var xt = X(f);
        sv('line', { x1: xt, x2: xt, y1: topH - 11, y2: topH - 6, stroke: '#9aa0a6', 'stroke-width': 1 }, plotSvg);
        sv('text', { x: xt, y: topH - 15, 'text-anchor': 'middle', class: 'small num' }, plotSvg, String(f / M.fps));
      }
      SP.layers = [];
      for (var t = 0; t < nRows; t++) {
        var yc = topH + t * pitch + pitch / 2;
        var lay = { yc: yc, base: sv('path', { fill: OUT[QUIET].color }, plotSvg) };
        if (t === 0) lay.entry = sv('path', { fill: OUT[CAUGHT].color }, plotSvg);
        else {
          lay[CAUGHT] = sv('path', { fill: OUT[CAUGHT].color }, plotSvg);
          lay[ALARM] = sv('path', { fill: OUT[ALARM].color }, plotSvg);
          lay[MISSED] = sv('path', { fill: OUT[MISSED].color }, plotSvg);
        }
        SP.layers.push(lay);
      }
      // static: baselines of every row and the recorded entries
      var dBase = '', dEnt = '';
      idx.forEach(function (i) {
        var x = X(D.start[i]).toFixed(2);
        dBase += 'M' + x + ',0h' + tw.toFixed(2) + 'v1h' + (-tw).toFixed(2) + 'z';
        if (D.target[i] === 1) dEnt += 'M' + x + ',' + (SP.layers[0].yc - 7) + 'h' + tw.toFixed(2) + 'v14h' + (-tw).toFixed(2) + 'z';
      });
      SP.layers.forEach(function (lay, t2) {
        lay.base.setAttribute('d', dBase);
        lay.base.setAttribute('transform', 'translate(0,' + (lay.yc - 0.5) + ')');
        if (t2 === 0) lay.entry.setAttribute('d', dEnt);
      });
      SP.cursor = sv('line', { y1: topH - 6, y2: H - 2, stroke: '#5f6368', 'stroke-width': 1, visibility: 'hidden',
        'shape-rendering': 'crispEdges' }, plotSvg);

      // counts column
      cntSvg.setAttribute('width', cntW); cntSvg.setAttribute('height', H); cntSvg.setAttribute('viewBox', '0 0 ' + cntW + ' ' + H);
      clear(cntSvg);
      var cx1 = narrow ? 34 : 50, cx2 = cntW - 2;
      if (narrow) {
        sv('text', { x: cx1, y: 20, 'text-anchor': 'end', class: 'small' }, cntSvg, 'missed');
        sv('text', { x: cx2, y: 8, 'text-anchor': 'end', class: 'small' }, cntSvg, 'false');
        sv('text', { x: cx2, y: 20, 'text-anchor': 'end', class: 'small' }, cntSvg, 'alarms');
      } else {
        sv('text', { x: cx1, y: 20, 'text-anchor': 'end', class: 'small' }, cntSvg, 'missed');
        sv('text', { x: cx2, y: 20, 'text-anchor': 'end', class: 'small' }, cntSvg, 'false alarms');
      }
      SP.cnt = [];
      for (var t3 = 0; t3 < nRows; t3++) {
        var yc3 = topH + t3 * pitch + pitch / 2 + 4;
        var isD = t3 > 0 && stripRows[t3 - 1].key === 'DMF';
        var cls = 'num ' + (t3 === 0 ? 'small' : isD ? 'strong' : 'ink');
        SP.cnt.push([sv('text', { x: cx1, y: yc3, 'text-anchor': 'end', class: cls }, cntSvg, ''),
          sv('text', { x: cx2, y: yc3, 'text-anchor': 'end', class: cls }, cntSvg, '')]);
      }
      var nE = ep.nEnt, nN = idx.length - ep.nEnt;
      SP.cnt[0][0].textContent = 'of ' + fmtInt(nE);
      SP.cnt[0][1].textContent = 'of ' + fmtInt(nN);

      var infoTxt = ((f1 - M.step - f0) / M.fps).toFixed(1) + ' s, one window every ' + (M.step / M.fps).toFixed(2) + ' s' +
        (narrow ? '. Tap a window to read it.' : '. Hover or use the arrow keys to read a window.');
      if (info.textContent !== infoTxt) info.textContent = infoTxt;
      sel.value = String(ep.k);
      updateStrip();
      if (st.cur != null) showWin(Math.min(st.cur, idx.length - 1), false);
      else if (narrow) showWin(defaultWin(), false);
    }
    function firstEntry() {
      var idx = st.ep.idx;
      for (var k = 0; k < idx.length; k++) if (D.target[idx[k]] === 1) return k;
      return 0;
    }
    // first window with an entry on which the forecasters (not the rule) decide differently; else the first entry
    function defaultWin() {
      var idx = st.ep.idx, fc = stripRows.filter(function (r) { return !r.rule; });
      for (var k = 0; k < idx.length; k++) {
        if (D.target[idx[k]] !== 1) continue;
        var o0 = M.outcome(fc[0], idx[k], st.j);
        for (var t = 1; t < fc.length; t++) if (M.outcome(fc[t], idx[k], st.j) !== o0) return k;
      }
      return firstEntry();
    }
    function updateStrip() {
      if (!SP) return;
      var j = st.j, idx = st.ep.idx, tw = SP.tw.toFixed(2);
      stripRows.forEach(function (r, t) {
        var lay = SP.layers[t + 1], yc = lay.yc, d = {}, tl = { missed: 0, alarm: 0 };
        d[CAUGHT] = ''; d[ALARM] = ''; d[MISSED] = '';
        idx.forEach(function (i) {
          var o = M.outcome(r, i, j);
          if (o === QUIET) return;
          var x = SP.X(D.start[i]).toFixed(2);
          if (o === MISSED) { d[o] += 'M' + x + ',' + yc + 'h' + tw + 'v9h-' + tw + 'z'; tl.missed++; }
          else { d[o] += 'M' + x + ',' + (yc - 9) + 'h' + tw + 'v9h-' + tw + 'z'; if (o === ALARM) tl.alarm++; }
        });
        lay[CAUGHT].setAttribute('d', d[CAUGHT]);
        lay[ALARM].setAttribute('d', d[ALARM]);
        lay[MISSED].setAttribute('d', d[MISSED]);
        SP.cnt[t + 1][0].textContent = fmtInt(tl.missed);
        SP.cnt[t + 1][1].textContent = fmtInt(tl.alarm);
      });
      if (st.cur != null && !tip.hidden) fillTip(st.cur);
    }
    function nearestWin(f) {
      var idx = st.ep.idx, lo = 0, hi = idx.length - 1, c = f - M.step / 2;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (D.start[idx[mid]] < c) lo = mid + 1; else hi = mid; }
      if (lo > 0 && Math.abs(D.start[idx[lo - 1]] - c) <= Math.abs(D.start[idx[lo]] - c)) lo -= 1;
      return lo;
    }
    function fillTip(k) {
      var i = st.ep.idx[k], j = st.j;
      clear(tip);
      h('div', { class: 'hd' }, tip, 'Window start ' + fmtSec(D.start[i], M.fps) + ' (frame ' + D.start[i] + ') · distance to the robot ' +
        D.d0[i].toFixed(2) + ' m');
      h('div', { class: 'hd' }, tip, D.target[i] === 1
        ? 'Recorded: the person comes within ' + deltaTxt + ' after ' + (D.target_tau[i] / M.fps).toFixed(2) + ' s'
        : 'Recorded: no entry within ' + horTxt);
      var rowsEl = h('div', { class: 'rows' }, tip);
      stripRows.forEach(function (r) {
        var row = h('div', { class: 'row' }, rowsEl);
        h('b', null, row, r.rule ? '—' : (r.K > 1 ? (r.count[i] / r.K).toFixed(2) : String(r.count[i])));
        row.appendChild(lineKey(r.color, r.rule ? RULE_STYLE.dash : null, 16, r.rule ? 1.6 : 2));
        h('span', { class: 'nm' }, row, r.shortName);
        var o = M.outcome(r, i, j);
        row.appendChild(glyph(o));
        h('span', { class: 'oc' }, row, OUT[o].label);
      });
      var hint = h('div', { class: 'hd' }, tip, 'p̂: share of the forecast futures that enter. The robot slows down when p̂ > ' + fmtA(M.alpha[j]));
      hint.style.marginTop = '.2rem';
      hint.style.marginBottom = '0';
    }
    function showWin(k, announce) {
      if (!SP) return;
      st.cur = k;
      var i = st.ep.idx[k], x = SP.X(D.start[i]) + SP.tw / 2;
      SP.cursor.setAttribute('x1', x.toFixed(1)); SP.cursor.setAttribute('x2', x.toFixed(1));
      SP.cursor.setAttribute('visibility', 'visible');
      fillTip(k);
      tip.hidden = false;
      if (!SP.narrow) {
        var pr = p3.getBoundingClientRect(), br = body.getBoundingClientRect(), sr = plotSvg.getBoundingClientRect();
        var xc = sr.left + x - pr.left, tw = tip.offsetWidth, left = xc + 14;
        if (left + tw > pr.width - 2) left = xc - 14 - tw;
        if (left < 2) left = 2;
        var topY = br.top - pr.top + SP.topH;
        tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(topY) + 'px)';
      }
      if (announce) {
        var j = st.j;
        live.textContent = 'Window start ' + fmtSec(D.start[i], M.fps) + ', ' + (D.target[i] === 1 ? 'entry' : 'no entry') + '. ' +
          stripRows.map(function (r) { return r.shortName + ': ' + OUT[M.outcome(r, i, j)].label; }).join(', ') + '.';
      }
    }
    function hideTip() {
      if (SP && SP.narrow) return;
      st.cur = null;
      tip.hidden = true;
      if (SP) SP.cursor.setAttribute('visibility', 'hidden');
    }
    function ensureVisible(k) {
      var x = SP.X(epPos(k)), w = scroller.clientWidth, sl = scroller.scrollLeft;
      if (x < sl + 16) scroller.scrollLeft = Math.max(0, x - 16);
      else if (x > sl + w - 16) scroller.scrollLeft = x - w + 32;
    }
    function onStripPointer(ev) {
      var r = plotSvg.getBoundingClientRect();
      var f = SP.f0 + (ev.clientX - r.left - SP.pad) / SP.ppf;
      showWin(nearestWin(f), false);
    }
    plotSvg.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'mouse' || ev.buttons || ev.pointerType === 'pen') onStripPointer(ev); });
    plotSvg.addEventListener('pointerdown', onStripPointer);
    plotSvg.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse' && document.activeElement !== scroller) hideTip(); });
    scroller.addEventListener('scroll', function () { if (SP && !SP.narrow && st.cur != null && !tip.hidden) showWin(st.cur, false); });
    scroller.addEventListener('keydown', function (ev) {
      var len = st.ep.idx.length, k = st.cur == null ? defaultWin() : st.cur, stp = ev.shiftKey ? 10 : 1;
      if (ev.key === 'ArrowRight') k = st.cur == null ? k : Math.min(len - 1, k + stp);
      else if (ev.key === 'ArrowLeft') k = st.cur == null ? k : Math.max(0, k - stp);
      else if (ev.key === 'Home') k = 0;
      else if (ev.key === 'End') k = len - 1;
      else if (ev.key === 'Escape') { hideTip(); return; }
      else return;
      ev.preventDefault();
      ensureVisible(k);
      showWin(k, true);
    });
    scroller.addEventListener('focus', function () { if (st.cur == null) { var k = defaultWin(); ensureVisible(k); showWin(k, true); } });
    scroller.addEventListener('blur', function () { hideTip(); });

    function setEpisode(ep, focusSel) {
      if (!ep || ep === st.ep) return;
      st.ep = ep;
      st.cur = null;
      tip.hidden = true;
      renderStrip();
      scrollToEntries();
      if (focusSel) sel.focus();
    }
    function scrollToEntries() {
      if (!SP) return;
      var k = firstEntry(), x = SP.X(epPos(k));
      scroller.scrollLeft = SP.plotW > scroller.clientWidth ? Math.max(0, x - scroller.clientWidth / 3) : 0;
    }
    sel.addEventListener('change', function () { setEpisode(M.eps[+sel.value]); });
    function stepEpisode(d) {
      var L = M.epList, t = L.indexOf(st.ep);
      setEpisode(L[(t + d + L.length) % L.length]);
    }
    prevBtn.addEventListener('click', function () { stepEpisode(-1); });
    nextBtn.addEventListener('click', function () { stepEpisode(1); });

    // ================================================================ alpha
    function setAlpha(j, how) {
      st.j = j;
      var a = M.alpha[j], inBand = a >= BAND[0] - 1e-12 && a <= BAND[1] + 1e-12;
      clear(alphaEl);
      alphaEl.appendChild(document.createTextNode('Cost ratio α = '));
      h('b', null, alphaEl, fmtA(a));
      noteEl.textContent = 'precaution costs ' + fmtPct(a) + ' of the loss it avoids, so the robot slows down when p̂ > ' + fmtA(a) +
        (inBand ? ' (inside the precaution band)' : '');
      slider.setAttribute('aria-valuenow', String(a));
      slider.setAttribute('aria-valuetext', 'alpha ' + fmtA(a) + (inBand ? ', in the precaution band' : ''));
      placeSlider();
      updateBars(how !== 'init');
      updateStrip();
      if (how === 'key') {
        var dm = M.byKey.DMF, bo = M.bestOther;
        live.textContent = 'alpha ' + fmtA(a) + '. ' + (dm ? dm.name + ' ' + fmtV(dm.V[j]) + ', ' + fmtInt(dm.missed[j]) + ' missed, ' +
          fmtInt(dm.alarm[j]) + ' false alarms' : '') + (bo ? '. ' + bo.name + ' ' + fmtV(bo.V[j]) : '') + '.';
      }
    }

    // ================================================================ layout
    var lastW = 0, raf = 0;
    function renderAll() {
      renderSlider();
      renderBars();
      renderStrip();
    }
    function onResize() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var w = container.clientWidth;
        if (Math.abs(w - lastW) >= 1) { lastW = w; renderAll(); }
      });
    }
    setPlayUI();
    lastW = container.clientWidth;
    renderAll();
    setAlpha(st.j, 'init');
    scrollToEntries();
    if ('ResizeObserver' in global) new ResizeObserver(onResize).observe(container);
    else global.addEventListener('resize', onResize);

    return {
      model: M,
      setAlpha: function (a) { stopSweep(); setAlpha(M.indexOfAlpha(a), 'api'); },
      setEpisode: function (name) { M.eps.forEach(function (ep) { if (ep.id === name) setEpisode(ep); }); },
      showWindow: function (k) { showWin(k, false); },
      play: startSweep,
      pause: stopSweep,
      state: st
    };
  }

  global.DMFRobotGame = { init: init, model: buildModel, BAND: BAND };
})(typeof window !== 'undefined' ? window : this);
