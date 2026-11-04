/* DMF question explorer: one set of candidate futures answers every registered question.
   Vanilla JS; three.js r128 as a global (THREE, OrbitControls, fat lines from examples/js), loaded by the page or, if
   missing, injected on demand from the same exact CDN versions. Data: window.DMFX_INDEX (data/explorer/index.js) and one
   lazily injected script per window (data/explorer/<id>.js, sets window.DMFX[id]); no fetch/XHR, so it works on file://.
   Usage: DMFExplorer.init(document.getElementById('explorer'), { dataBase: '' }); */
(function (global) {
  'use strict';

  // ------------------------------------------------------------------------------------------------ constants
  var NS = 'http://www.w3.org/2000/svg';
  var THREE_SRC = [
    ['', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'],
    ['OrbitControls', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'],
    ['LineSegmentsGeometry', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/lines/LineSegmentsGeometry.js'],
    ['LineMaterial', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/lines/LineMaterial.js'],
    ['LineSegments2', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/lines/LineSegments2.js']
  ];
  var DELTAS = ['0.10', '0.20', '0.30', '0.50', '0.75'];       // registered warning distances; the first is delta_c
  var HNOM = [0.25, 0.5, 1];                                   // registered horizons (s), rounded up to whole frames
  var HLAB = ['.25', '.5', '1'];
  var ROWS = [['O', 'in'], ['O', 'out'], ['PR', 'in'], ['PR', 'out'], ['VR', 'in'], ['VR', 'out']];
  var QLAB = { O: 'O', PR: 'P/R', VR: 'VR' };
  var FLAB = { 'in': 'entry', out: 'exit' };
  var MAIN_EXIT = { HARPER: '0.50', UF: '0.50', COMFI: '0.30', CHICO: '0.30' };   // main exit question (Sec. V-A)
  var ORDER = ['DMF_HR', 'CoMusion_HR', 'HumanMAC_HR', 'AINet_HR', 'siMLPeG_HR'];
  var MSTYLE = { DMF_HR: { width: 2.6 } };
  var ROBOT_TXT = { spot: 'legged robot', panda: 'hand-guided arm', chain: 'industrial arm', base_point: 'mobile base' };
  var WARN = '#E69F00';
  var NQ = ROWS.length * DELTAS.length * HNOM.length;            // 90 registered questions per dataset
  var REC = '#141414';
  // Forecast futures (same convention as the paper figures and the videos): a future that answers the question with yes
  // (enters / leaves within h) is drawn in the forecaster's colour, one that does not in that colour mixed 45% with white;
  // both stay clearly visible.
  var FUT_MIX = 0.45, OP_YES = 0.95, OP_NO = 0.9;

  // ------------------------------------------------------------------------------------------------ small helpers
  function h(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function s(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function txt(parent, x, y, str, anchor, cls) {
    var t = s('text', { x: x, y: y, 'text-anchor': anchor || 'start', 'class': cls || null }, parent);
    t.textContent = str;
    return t;
  }
  function lineKey(color, dash, w, width, opacity) {
    w = w || 18;
    var g = s('svg', { width: w, height: 10, viewBox: '0 0 ' + w + ' 10', 'aria-hidden': 'true', focusable: 'false' });
    s('line', { x1: 1, y1: 5, x2: w - 1, y2: 5, stroke: color, 'stroke-width': width || 2, 'stroke-dasharray': dash || null,
      'stroke-linecap': dash ? 'butt' : 'round', 'stroke-opacity': opacity == null ? null : opacity }, g);
    return g;
  }
  // (2026-10-28) the legend of the 3D view draws small stick figures, as the paper's figures, the videos and the swatches
  // of site/base.css do: one figure per panel colour, 9 px apart
  var STICK = 'M7 5.6V12M7 12L4.4 18M7 12L9.6 18M7 6.4L4 11.2M7 6.4L10 11.2M7 5.6V2.9';
  function stickKey(colors, attrs) {
    var w = 14 + (colors.length - 1) * 9;
    var g = s('svg', { width: w, height: 20, viewBox: '0 0 ' + w + ' 20', 'aria-hidden': 'true', focusable: 'false' });
    colors.forEach(function (c, i) {
      var a = { d: STICK, transform: i ? 'translate(' + 9 * i + ' 0)' : null, fill: 'none', stroke: c, 'stroke-linejoin': 'round' };
      for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) a[k] = attrs[k];
      s('path', a, g);
    });
    return g;
  }
  function futKey(colors, yes) {               // legend swatch of the futures: one small stick figure per panel colour
    return stickKey(colors.map(function (c) { return yes ? c : mix(c, FUT_MIX); }),
      { 'stroke-width': yes ? 1.6 : 1.5, 'stroke-linecap': 'round', 'stroke-opacity': yes ? OP_YES : OP_NO });
  }
  function mix(hex, t) {                       // toward white by t
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * t); g = Math.round(g + (255 - g) * t); b = Math.round(b + (255 - b) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v) { return String(+(+v).toFixed(2)); }                                   // 0.20 -> "0.2"
  function sec(t) { var v = Math.round(t * 100) / 100; return Math.abs(v) < 0.005 ? 'now' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2) + ' s'; }
  function pFmt(c, K) { return K === 1 ? String(c) : (c / K).toFixed(2); }
  function niceStep(span, n) {
    var raw = span / n, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * p;
  }
  function ticks(a, b, n) {
    var st = niceStep(b - a, n), out = [];
    for (var t = Math.ceil(a / st - 1e-9) * st; t <= b + 1e-9; t += st) out.push(+t.toFixed(6));
    return out;
  }
  function nearest(arr, v) {
    var bi = 0;
    for (var i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[bi] - v)) bi = i;
    return bi;
  }
  function findEntry(index, id) { for (var i = 0; i < index.length; i++) if (index[i].id === id) return index[i]; return null; }

  // ------------------------------------------------------------------------------------------------ loading
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.async = false;
      el.onload = function () { resolve(); };
      el.onerror = function () { reject(new Error('Could not load ' + src)); };
      (document.head || document.documentElement).appendChild(el);
    });
  }
  function threeReady() {
    var T = global.THREE;
    return !!(T && T.OrbitControls && T.LineSegments2 && T.LineMaterial && T.LineSegmentsGeometry);
  }
  var threePromise = null;
  function ensureThree() {
    if (threeReady()) return Promise.resolve(global.THREE);
    if (!threePromise) {
      threePromise = THREE_SRC.reduce(function (p, it) {
        return p.then(function () {
          var T = global.THREE;
          if (it[0] === '' ? T : (T && T[it[0]])) return null;
          return loadScript(it[1]);
        });
      }, Promise.resolve()).then(function () {
        if (!threeReady()) throw new Error('three.js did not load');
        return global.THREE;
      });
    }
    return threePromise;
  }
  var inflight = {};
  function loadWindowData(entry, base) {
    var id = entry.id;
    if (global.DMFX && global.DMFX[id]) return Promise.resolve(global.DMFX[id]);
    if (!inflight[id]) {
      inflight[id] = loadScript(base + entry.file).then(function () {
        if (!(global.DMFX && global.DMFX[id])) throw new Error('No data in ' + entry.file);
        return global.DMFX[id];
      }, function (e) { delete inflight[id]; throw e; });
    }
    return inflight[id];
  }

  // ------------------------------------------------------------------------------------------------ model
  function bytes(b64) {
    var str = global.atob(b64), n = str.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = str.charCodeAt(i);
    return u;
  }
  function i16(b64) {                          // little-endian int16 millimetres -> Float32Array metres
    var u = bytes(b64), n = u.length >> 1, out = new Float32Array(n);
    for (var i = 0; i < n; i++) { var v = u[2 * i] | (u[2 * i + 1] << 8); out[i] = (v >= 32768 ? v - 65536 : v) / 1000; }
    return out;
  }

  /* The export is meant to be y-up with the floor at y = 0. Some windows arrive z-up (the person's head-to-foot extent lies
     along z); turn those to y-up, put the lowest joint of the person on the floor and the last observed joint 0 at x = z = 0. */
  function fixAxes(m) {
    var J = m.J, ry = 0, rz = 0;
    [m.hh, m.hf].forEach(function (A) {
      for (var f = 0, F = A.length / (J * 3); f < F; f++) {
        var y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (var j = 0; j < J; j++) {
          var o = (f * J + j) * 3;
          if (A[o + 1] < y0) y0 = A[o + 1]; if (A[o + 1] > y1) y1 = A[o + 1];
          if (A[o + 2] < z0) z0 = A[o + 2]; if (A[o + 2] > z1) z1 = A[o + 2];
        }
        ry += y1 - y0; rz += z1 - z0;
      }
    });
    if (!(rz > 1.5 * ry)) return false;
    var arrays = [m.hh, m.hf, m.rh, m.rf].concat(m.methods.map(function (mm) { return mm.cand; }));
    arrays.forEach(function (A) { for (var i = 0; i < A.length; i += 3) { var y = A[i + 1]; A[i + 1] = A[i + 2]; A[i + 2] = -y; } });
    var floor = Infinity;
    [m.hh, m.hf].forEach(function (A) { for (var i = 1; i < A.length; i += 3) if (A[i] < floor) floor = A[i]; });
    var o = (m.H - 1) * J * 3, cx = m.hh[o], cz = m.hh[o + 2];
    arrays.forEach(function (A) { for (var i = 0; i < A.length; i += 3) { A[i] -= cx; A[i + 1] -= floor; A[i + 2] -= cz; } });
    return true;
  }

  function buildModel(raw) {
    var m = {
      id: raw.id, ds: raw.dataset, dsname: raw.dsname || raw.dataset, win: raw.window, title: raw.title, fps: raw.fps, H: raw.H, T: raw.T,
      J: raw.J, links: raw.links, robot: raw.robot, q0: raw.default_question, guiding: raw.guiding_excluded || null,
      note: raw.model_note || null
    };
    m.hh = i16(raw.human_hist); m.hf = i16(raw.human_fut); m.rh = i16(raw.robot_hist); m.rf = i16(raw.robot_fut);
    m.methods = []; m.byKey = {};
    // only forecasters that see the robot history (H+R) are shown; a human-history-only arm is never listed
    raw.methods.filter(function (r) { return r.input !== 'H'; }).forEach(function (r) {
      var st = MSTYLE[r.key] || {};
      var mm = { key: r.key, name: r.name, input: r.input, color: r.color, K: r.K, cand: i16(r.cand), tau: bytes(r.tau),
        count: r.count, dist: {} };
      Object.keys(r.dist).forEach(function (k) { mm.dist[k] = i16(r.dist[k]); });
      mm.label = r.name;
      mm.det = r.K === 1;
      mm.dash = st.dash || (mm.det ? '6 4' : null);
      mm.c2 = r.color;                                                 // colour in the shared charts
      mm.width = st.width || 1.9;
      m.methods.push(mm);
      m.byKey[r.key] = mm;
    });
    m.methods.sort(function (a, b) {
      var ia = ORDER.indexOf(a.key), ib = ORDER.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var Q = raw.questions;
    m.qs = []; m.qById = {}; m.cells = [];
    for (var r = 0; r < ROWS.length; r++) m.cells.push([]);
    Q.ids.forEach(function (id, i) {
      var p = id.split('|'), hF = parseInt(p[3], 10), hi = nearest(HNOM, hF / m.fps);
      var q = { id: id, i: i, query: p[0], fam: p[1], dStr: p[2], delta: parseFloat(p[2]), hF: hF, hNom: HNOM[hi],
        eligible: !!Q.eligible[i], supported: Q.supported ? !!Q.supported[i] : true, tau: Q.target_tau[i] };
      q.ok = q.eligible && q.supported;
      q.event = q.tau <= hF;
      var row = -1, d = DELTAS.indexOf(p[2]);
      for (var k = 0; k < ROWS.length; k++) if (ROWS[k][0] === q.query && ROWS[k][1] === q.fam) row = k;
      if (row >= 0 && d >= 0) { q.r = row; q.c = d * 3 + hi; m.cells[row][q.c] = q; }
      m.qs.push(q);
      m.qById[id] = q;
    });
    m.nOk = m.qs.filter(function (q) { return q.ok; }).length;
    m.truth = {};
    Object.keys(raw.truth_dist).forEach(function (k) { m.truth[k] = Float32Array.from(raw.truth_dist[k]); });
    m.zup = fixAxes(m);
    return m;
  }
  function isHeldOut(r, c) { return ROWS[r][0] === 'VR' || Math.floor(c / 3) === 4; }
  function qName(q) {
    return QLAB[q.query] + ' ' + FLAB[q.fam] + ', δ = ' + num(q.delta) + ' m, h = ' + num(q.hNom) + ' s';
  }
  function qTag(m, q) {
    var t = [];
    if (q.query === 'O' && q.fam === 'in' && q.dStr === '0.20' && q.hNom === 1) t.push('reference question');
    if (q.query === 'O' && q.fam === 'out' && q.dStr === MAIN_EXIT[m.ds] && q.hNom === 1) t.push('main exit question');
    if (q.query === 'VR' || q.dStr === '0.75') t.push('held out from training');
    return t.join(', ');
  }
  function objName(q) { return q.query === 'VR' ? 'the virtual object' : 'the robot'; }
  function recText(m, q, short) {
    var verb = q.fam === 'in' ? 'enters' : 'leaves', noun = q.fam === 'in' ? 'entry' : 'exit';
    if (q.event) return 'Recorded: yes, ' + (short ? '' : 'the person ') + verb + ' at ' + sec(q.tau / m.fps) + (short ? '' : ' (frame ' + q.tau + ')');
    return 'Recorded: no ' + noun + ' within ' + num(q.hNom) + ' s';
  }

  // ------------------------------------------------------------------------------------------------ bodies (as in the paper's renderer)
  var R = { torso: 0.115, pelvis: 0.105, neck: 0.045, head: 0.105, uarm: 0.047, farm: 0.040, hand: 0.045, thigh: 0.068, shin: 0.052, foot: 0.040 };
  function torso(shR, shL, hpR, hpL, chest, belly) {
    return [[shR, shL, R.torso * 0.62, R.torso * 0.62], [chest, belly, R.torso, R.pelvis * 0.95], [hpR, hpL, R.pelvis * 0.85, R.pelvis * 0.85],
      [shR, hpR, R.torso * 0.55, R.pelvis * 0.7], [shL, hpL, R.torso * 0.55, R.pelvis * 0.7]];
  }
  function arm(a, e, w) { return [[a, e, R.uarm, R.farm * 1.05], [e, w, R.farm, R.farm * 0.85]]; }
  function leg(hp, k, a, t) { return [[hp, k, R.thigh, R.shin * 1.1], [k, a, R.shin, R.shin * 0.75], [a, t, R.foot, R.foot * 0.9]]; }
  function dMix(X, d, a, b, wa) { for (var i = 0; i < 3; i++) X[d * 3 + i] = X[a * 3 + i] * wa + X[b * 3 + i] * (1 - wa); }
  function dExt(X, d, a, b, len) {             // X[d] = X[b] + unit(X[b] - X[a]) * len
    var dx = X[b * 3] - X[a * 3], dy = X[b * 3 + 1] - X[a * 3 + 1], dz = X[b * 3 + 2] - X[a * 3 + 2];
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    X[d * 3] = X[b * 3] + dx / L * len; X[d * 3 + 1] = X[b * 3 + 1] + dy / L * len; X[d * 3 + 2] = X[b * 3 + 2] + dz / L * len;
  }
  function chicoFeet(X) {                      // no toe joints: a short foot forward of each ankle (the nose points forward)
    var sx = X[12] - X[3], sz = X[14] - X[5], fx = -sz, fz = sx, L = Math.sqrt(fx * fx + fz * fz) || 1;
    fx /= L; fz /= L;
    if (fx * (X[21] - X[24]) + fz * (X[23] - X[26]) < 0) { fx = -fx; fz = -fz; }
    X[60] = X[9] + fx * 0.13; X[61] = X[10] - 0.03; X[62] = X[11] + fz * 0.13;
    X[63] = X[18] + fx * 0.13; X[64] = X[19] - 0.03; X[65] = X[20] + fz * 0.13;
  }
  var BODY = {
    HARPER: { J: 21, nd: 7, derive: function (X) {
      dMix(X, 21, 6, 10, 0.5); dMix(X, 22, 21, 2, 0.65); dMix(X, 23, 13, 17, 0.5); dMix(X, 24, 23, 1, 0.5);
      dExt(X, 25, 3, 4, 0.06); dExt(X, 26, 7, 8, 0.05); dExt(X, 27, 11, 12, 0.05);
    }, cones: [].concat(torso(6, 10, 13, 17, 22, 24), [[3, 4, R.neck, R.neck]], arm(6, 7, 8), arm(10, 11, 12), leg(13, 14, 15, 16), leg(17, 18, 19, 20)),
    spheres: [[25, R.head], [26, R.hand], [27, R.hand]] },
    COMFI: { J: 20, nd: 6, derive: function (X) {
      dMix(X, 20, 0, 1, 0.5); dMix(X, 21, 20, 9, 0.7); dExt(X, 22, 9, 2, 0.07); dExt(X, 23, 9, 2, 0.17);
      dExt(X, 24, 3, 5, 0.05); dExt(X, 25, 4, 6, 0.05);
    }, cones: [].concat(torso(0, 1, 7, 8, 21, 9), [[2, 22, R.neck, R.neck]], arm(0, 3, 5), arm(1, 4, 6), leg(7, 10, 12, 16), leg(8, 11, 13, 17)),
    spheres: [[23, R.head], [24, R.hand], [25, R.hand]] },
    UF: { J: 23, nd: 3, derive: function (X) {
      dExt(X, 23, 5, 6, 0.05); dExt(X, 24, 9, 10, 0.05); dExt(X, 25, 13, 14, 0.05);
    }, cones: [].concat(torso(8, 12, 15, 19, 4, 1), [[5, 6, R.neck, R.neck]], arm(8, 9, 10), arm(12, 13, 14), leg(15, 16, 17, 18), leg(19, 20, 21, 22)),
    spheres: [[23, R.head], [24, R.hand], [25, R.hand]] },
    CHICO: { J: 15, nd: 7, derive: function (X) {
      dMix(X, 15, 8, 0, 0.75); dExt(X, 16, 0, 8, 0.10); dExt(X, 17, 0, 8, 0.24); dExt(X, 18, 10, 11, 0.05); dExt(X, 19, 13, 14, 0.05);
      chicoFeet(X);
    }, cones: [].concat(torso(9, 12, 1, 4, 15, 0), [[8, 16, R.neck, R.neck]], arm(9, 10, 11), arm(12, 13, 14), leg(1, 2, 3, 20), leg(4, 5, 6, 21)),
    spheres: [[17, R.head], [18, R.hand], [19, R.hand]] }
  };
  function bodySpec(m) {
    var b = BODY[m.ds];
    if (b && b.J === m.J) return b;
    var r = 0.06;
    return { J: m.J, nd: 0, cones: m.links.map(function (l) { return [l[0], l[1], r, r]; }), spheres: [] };
  }
  function robotSpec(rb) {
    var n = rb.n, links = rb.links || [];
    if (rb.kind === 'spot' && n >= 23) {         // as in the paper's renderer (toon3d.spot_parts); derived node n: the arm's base
      var cones = [], sph = [];
      [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]].forEach(function (l) {
        cones.push([l[0], l[1], 0.062, 0.045, 'dark'], [l[1], l[2], 0.034, 0.024, 'dark']);
        sph.push([l[2], 0.036, 'dark']);
      });
      cones.push([n, 21, 0.042, 0.042, 'dark'], [21, 22, 0.036, 0.036, 'dark']);
      sph.push([n, 0.06, 'dark']);
      return { nd: 1, cones: cones, spheres: sph, spotBox: true };
    }
    if (rb.kind === 'panda' || rb.kind === 'chain') {
      var panda = rb.kind === 'panda', rl = panda ? 0.058 : 0.05, rj = panda ? 0.066 : 0.056;
      var c2 = [], s2 = [];
      links.forEach(function (l) { if (l[0] !== l[1]) c2.push([l[0], l[1], rl, rl, 'link', true]); });
      for (var i = 0; i < n; i++) s2.push([i, rj, !panda && (i === 2 || i === 4 || i === 6) ? 'accent' : 'joint']);
      return { nd: 0, cones: c2, spheres: s2, stand: panda ? 0.34 : 0.3, plate: !panda };
    }
    if (rb.kind === 'base_point') return { nd: 0, cones: [], spheres: [], ufBase: true };
    var r = rb.radius || 0.05;
    return { nd: 0, cones: links.filter(function (l) { return l[0] !== l[1]; }).map(function (l) { return [l[0], l[1], r, r, 'link']; }), spheres: [] };
  }

  // ------------------------------------------------------------------------------------------------ 3D viewer
  function Viewer(THREE, host, onChange) {
    var self = this;
    this.T3 = THREE;
    this.host = host;
    this.onChange = onChange;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(canvas, host.firstChild);
    var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });   // throws without WebGL
    r.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    r.setClearColor(0xffffff, 1);
    r.autoClear = false;
    this.renderer = r;
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1.3, 0.05, 80);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4cb, 0.82));
    var dir = new THREE.DirectionalLight(0xffffff, 0.42);
    dir.position.set(-1.2, 1.7, 1.0);
    dir.target.position.set(0, 0, -1);
    this.camera.add(dir);
    this.camera.add(dir.target);
    this.depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.sphereGeo = new THREE.SphereGeometry(1, 20, 14);
    this.UP = new THREE.Vector3(0, 1, 0);
    this.WHITE = new THREE.Color(0xffffff);
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this.mats = {
      body: new THREE.MeshLambertMaterial({ color: '#c2c9d3' }),
      link: new THREE.MeshLambertMaterial({ color: '#eceef1' }),
      joint: new THREE.MeshLambertMaterial({ color: '#3a3f47' }),
      accent: new THREE.MeshLambertMaterial({ color: WARN }),
      dark: new THREE.MeshLambertMaterial({ color: '#353a42' }),
      spot: new THREE.MeshLambertMaterial({ color: '#f2c744' }),
      stand: new THREE.MeshLambertMaterial({ color: '#d9dce1' }),
      base: new THREE.MeshLambertMaterial({ color: '#e2e5e9' })
    };
    Object.keys(this.mats).forEach(function (k) { self.mats[k].userData.base = self.mats[k].color.clone(); });
    this.floorTex = this.makeFloorTexture();

    var c = new THREE.OrbitControls(this.camera, canvas);
    c.enableDamping = false;
    c.rotateSpeed = 0.75;
    c.zoomSpeed = 0.9;
    c.panSpeed = 0.7;
    c.minDistance = 0.6;
    c.maxDistance = 14;
    c.maxPolarAngle = Math.PI * 0.495;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    c.enableZoom = false;
    c.addEventListener('change', function () { self.dirty = true; self.onChange(); });
    c.addEventListener('start', function () { self.userMoved = true; });
    this.controls = c;
    // the wheel zooms after a press in the view (until the pointer leaves) or with Ctrl/Cmd; otherwise the page scrolls
    var armed = false;
    canvas.addEventListener('pointerdown', function () { armed = true; });
    canvas.addEventListener('pointerleave', function () { armed = false; });
    host.addEventListener('wheel', function (e) { c.enableZoom = armed || e.ctrlKey || e.metaKey; }, { capture: true, passive: true });
    // touch: one finger scrolls the page, two fingers rotate and zoom
    var oneFinger = function (e) { if (e.touches && e.touches.length < 2) e.stopPropagation(); };
    host.addEventListener('touchstart', oneFinger, { capture: true, passive: true });
    host.addEventListener('touchmove', oneFinger, { capture: true, passive: true });
    this.rects = [];
    this.panelKeys = [];
    this.showRec = true;
    this.dirty = true;
  }

  Viewer.prototype.makeFloorTexture = function () {
    var THREE = this.T3, cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    var g = cv.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(236,232,225,1)');
    gr.addColorStop(0.55, 'rgba(236,232,225,0.85)');
    gr.addColorStop(1, 'rgba(236,232,225,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(cv);
  };

  Viewer.prototype.layout = function (mode) {
    var W = Math.max(1, this.host.clientWidth), H = Math.max(1, this.host.clientHeight);
    this.cssW = W; this.cssH = H;
    this.renderer.setSize(W, H, false);
    if (mode === 'stack') {
      var h1 = Math.floor((H - 1) / 2);
      this.rects = [{ x: 0, y: 0, w: W, h: h1 }, { x: 0, y: h1 + 1, w: W, h: H - h1 - 1 }];
    } else {
      var w1 = Math.floor((W - 1) / 2);
      this.rects = [{ x: 0, y: 0, w: w1, h: H }, { x: w1 + 1, y: 0, w: W - w1 - 1, h: H }];
    }
    this.camera.aspect = this.rects[0].w / this.rects[0].h;
    this.camera.updateProjectionMatrix();
    if (this.model && !this.userMoved) this.fit();
    this.dirty = true;
  };

  function LineSet(THREE, parent, maxSeg, color, width, dashed, order, depthWrite, opacity) {
    var geo = new THREE.LineSegmentsGeometry();
    this.arr = new Float32Array(Math.max(1, maxSeg) * 6);
    this.buf = new THREE.InstancedInterleavedBuffer(this.arr, 6, 1);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(this.buf, 3, 0));
    geo.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(this.buf, 3, 3));
    if (dashed) {
      this.darr = new Float32Array(Math.max(1, maxSeg) * 2);
      this.dbuf = new THREE.InstancedInterleavedBuffer(this.darr, 2, 1);
      this.dbuf.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(this.dbuf, 1, 0));
      geo.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(this.dbuf, 1, 1));
    }
    geo.instanceCount = 0;
    var mat = new THREE.LineMaterial({ color: color, linewidth: width });
    if (dashed) { mat.defines.USE_DASH = ''; mat.dashSize = 0.04; mat.gapSize = 0.028; mat.dashScale = 1; }
    if (opacity != null && opacity < 1) { mat.transparent = true; mat.opacity = opacity; }
    mat.depthWrite = depthWrite;
    var obj = new THREE.LineSegments2(geo, mat);
    obj.frustumCulled = false;
    obj.renderOrder = order;
    obj.layers.set(2);
    parent.add(obj);
    this.geo = geo; this.mat = mat; this.obj = obj;
  }
  LineSet.prototype.commit = function (nSeg) {
    this.geo.instanceCount = nSeg;
    this.buf.needsUpdate = true;
    if (this.dbuf) this.dbuf.needsUpdate = true;
  };
  function writeSkel(arr, seg, P, links) {
    var o = seg * 6;
    for (var l = 0; l < links.length; l++) {
      var a = links[l][0] * 3, b = links[l][1] * 3;
      arr[o] = P[a]; arr[o + 1] = P[a + 1]; arr[o + 2] = P[a + 2];
      arr[o + 3] = P[b]; arr[o + 4] = P[b + 1]; arr[o + 5] = P[b + 2];
      o += 6;
    }
  }

  function roundedBox(THREE, sx, sy, sz, r) {   // box with rounded edges, like the rounded boxes of the paper's renderer
    var seg = 7, g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed(), d = 0.5 / seg;
    var P = g.attributes.position.array, N = g.attributes.normal.array, hx = sx / 2 - r, hy = sy / 2 - r, hz = sz / 2 - r;
    for (var i = 0; i < P.length; i += 3) {
      var x = Math.sign(P[i]), y = Math.sign(P[i + 1]), z = Math.sign(P[i + 2]);
      var nx = P[i] - x * d, ny = P[i + 1] - y * d, nz = P[i + 2] - z * d, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      N[i] = nx / l; N[i + 1] = ny / l; N[i + 2] = nz / l;
      P[i] = x * hx + N[i] * r; P[i + 1] = y * hy + N[i + 1] * r; P[i + 2] = z * hz + N[i + 2] * r;
    }
    return g;
  }

  function PartSet(viewer, parent, nBase, spec, defMat, occluder) {
    var THREE = viewer.T3, self = this;
    this.v = viewer;
    this.n = nBase;
    this.spec = spec;
    this.X = new Float32Array((nBase + (spec.nd || 0)) * 3);
    this.meshes = [];
    function add(mesh) {
      mesh.layers.set(0);
      if (occluder) mesh.layers.enable(1);
      parent.add(mesh);
      self.meshes.push(mesh);
      return mesh;
    }
    this.cones = [];
    var sl = [];
    (spec.cones || []).forEach(function (c) {
      var mk = c[4] || defMat;
      var mesh = add(new THREE.Mesh(new THREE.CylinderGeometry(c[3], c[2], 1, 18, 1, true), viewer.mats[mk]));
      self.cones.push({ a: c[0], b: c[1], mesh: mesh });
      if (!c[5]) sl.push([c[0], c[2], mk], [c[1], c[3], mk]);          // round end caps (robot links end in joint spheres)
    });
    (spec.spheres || []).forEach(function (sp) { sl.push([sp[0], sp[1], sp[2] || defMat]); });
    var groups = {};
    sl.forEach(function (sp) { (groups[sp[2]] = groups[sp[2]] || []).push(sp); });
    this.sgroups = Object.keys(groups).map(function (k) {
      var mesh = add(new THREE.InstancedMesh(viewer.sphereGeo, viewer.mats[k], groups[k].length));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      return { list: groups[k], mesh: mesh };
    });
    if (spec.spotBox) {                         // Spot: body (built on the first pose, its length from the corners) and front face
      this.box = add(new THREE.Mesh(new THREE.BufferGeometry(), viewer.mats.spot));
      this.face = add(new THREE.Mesh(roundedBox(THREE, 0.10, 0.16, 0.26, 0.035), viewer.mats.dark));
      this.boxL = -1;
    }
    if (spec.stand) this.stand = add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), viewer.mats.stand));
    if (spec.plate) this.plate = add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), viewer.mats.joint));
    if (spec.ufBase) {                          // schematic mobile base on the floor point (toon3d.uf_base_parts): base, column, head
      this.uf = [[0.44, 0.30, 0.44, 0.10, 0.15, 'base'], [0.20, 0.66, 0.20, 0.035, 0.62, 'stand'], [0.26, 0.16, 0.22, 0.045, 1.02, 'joint']]
        .map(function (b) {
          var mesh = add(new THREE.Mesh(roundedBox(THREE, b[0], b[1], b[2], b[3]), viewer.mats[b[5]]));
          mesh.userData.y = b[4];
          return mesh;
        });
    }
  }
  PartSet.prototype.update = function (P, off) {
    var X = this.X, v = this.v, n3 = this.n * 3, i;
    for (i = 0; i < n3; i++) X[i] = P[off + i];
    if (this.spec.derive) this.spec.derive(X);
    if (this.box) this.updateSpotBox(X);       // first: it also places the arm's base (derived node)
    for (i = 0; i < this.cones.length; i++) {
      var c = this.cones[i], a = c.a * 3, b = c.b * 3, mesh = c.mesh;
      v._v.set(X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]);
      var L = v._v.length();
      if (L < 1e-4) { mesh.visible = false; continue; }
      mesh.visible = true;
      v._v.multiplyScalar(1 / L);
      mesh.position.set((X[a] + X[b]) / 2, (X[a + 1] + X[b + 1]) / 2, (X[a + 2] + X[b + 2]) / 2);
      mesh.quaternion.setFromUnitVectors(v.UP, v._v);
      mesh.scale.set(1, L, 1);
    }
    for (var g = 0; g < this.sgroups.length; g++) {
      var G = this.sgroups[g];
      for (var j = 0; j < G.list.length; j++) {
        var it = G.list[j], o = it[0] * 3, r = it[1];
        v._m.makeScale(r, r, r);
        v._m.elements[12] = X[o]; v._m.elements[13] = X[o + 1]; v._m.elements[14] = X[o + 2];
        G.mesh.setMatrixAt(j, v._m);
      }
      G.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.stand) {
      var top = X[1] - (this.plate ? 0.05 : 0.03);
      this.stand.visible = top > 0.15;
      this.stand.position.set(X[0], top / 2, X[2]);
      this.stand.scale.set(this.spec.stand, Math.max(0.01, top), this.spec.stand);
    }
    if (this.plate) { this.plate.position.set(X[0], X[1] - 0.025, X[2]); this.plate.scale.set(0.24, 0.05, 0.24); }
    if (this.uf) for (i = 0; i < this.uf.length; i++) this.uf[i].position.set(X[0], this.uf[i].userData.y, X[2]);
  };
  /* Spot's body as in toon3d.spot_parts: a rounded box over the corner nodes 13-20 (rear 13-16, front 17-20), 0.15 m longer
     at each end, 0.20 m high and 0.32 m wide, level across (y up), with a dark face at the front; the arm starts on top of
     the body, 0.28 L forward of its centre (derived node n). Called every frame, so the body follows the walking robot. */
  PartSet.prototype.updateSpotBox = function (X) {
    var THREE = this.v.T3, o = this.n * 3, i, k, sg;
    var w = this.bw || (this.bw = { c: new THREE.Vector3(), a0: new THREE.Vector3(), a1: new THREE.Vector3(), a2: new THREE.Vector3() });
    var c = w.c.set(0, 0, 0), a0 = w.a0.set(0, 0, 0);
    for (i = 13; i <= 20; i++) {
      k = i * 3; sg = i >= 17 ? 0.25 : -0.25;
      c.x += X[k] / 8; c.y += X[k + 1] / 8; c.z += X[k + 2] / 8;
      a0.x += sg * X[k]; a0.y += sg * X[k + 1]; a0.z += sg * X[k + 2];
    }
    var L = a0.length(), a2 = w.a2.crossVectors(a0, this.v.UP), ok = L > 0.05 && a2.lengthSq() > 1e-8;
    this.box.visible = this.face.visible = ok;
    if (!ok) { X[o] = X[0]; X[o + 1] = X[1]; X[o + 2] = X[2]; return; }
    a0.multiplyScalar(1 / L);
    a2.normalize();
    var a1 = w.a1.crossVectors(a2, a0), hx = L / 2 + 0.15, hy = 0.10;
    if (Math.abs(L - this.boxL) > 0.005) {       // the body is rigid: built once per window (rebuilt only if L changes)
      this.box.geometry.dispose();
      this.box.geometry = roundedBox(THREE, 2 * hx, 2 * hy, 0.32, 0.045);
      this.boxL = L;
    }
    this.v._m.makeBasis(a0, a1, a2);
    this.box.quaternion.setFromRotationMatrix(this.v._m);
    this.face.quaternion.copy(this.box.quaternion);
    this.box.position.copy(c);
    this.face.position.copy(c).addScaledVector(a0, hx - 0.02);
    for (i = 0; i < 3; i++) X[o + i] = c.getComponent(i) + a1.getComponent(i) * hy + a0.getComponent(i) * L * 0.28;
  };

  Viewer.prototype.dispose = function () {
    if (!this.root) return;
    var sg = this.sphereGeo;
    this.root.traverse(function (o) {
      if (o.geometry && o.geometry !== sg) o.geometry.dispose();
      if (o.material && o.material.isLineMaterial) o.material.dispose();
      if (o.isInstancedMesh && o.dispose) o.dispose();
    });
    this.scene.remove(this.root);
    this.root = null;
  };

  Viewer.prototype.setModel = function (m) {
    var THREE = this.T3, self = this;
    this.dispose();
    this.model = m;
    this.userMoved = false;
    var root = new THREE.Group();
    this.scene.add(root);
    this.root = root;
    this.body = new PartSet(this, root, m.J, bodySpec(m), 'body', false);
    this.robot = new PartSet(this, root, m.robot.n, robotSpec(m.robot), 'link', true);
    this.lines = {};
    var nL = m.links.length;
    m.methods.forEach(function (mm) {
      self.lines[mm.key] = {     // futures that do not answer yes (tinted) first, then those that do (full colour) on top
        light: new LineSet(THREE, root, mm.K * nL, mix(mm.color, FUT_MIX), mm.K === 1 ? 2.0 : 1.2, false, 1, false, OP_NO),
        strong: new LineSet(THREE, root, mm.K * nL, mm.color, mm.K === 1 ? 2.2 : 1.45, false, 2, true, OP_YES)
      };
    });
    this.rec = new LineSet(THREE, root, nL, REC, 2.2, true, 3, false);
    this.rec.mat.transparent = true;              // same render list as the (translucent) futures, so it stays on top
    this.pose = new Float32Array(m.J * 3);
    this.rpose = new Float32Array(m.robot.n * 3);
    // scratch poses, sized for this window: robots (1-23 nodes) and skeletons (15-23 joints) differ between datasets, so
    // buffers kept from the first window would be too short for a larger one (its extra nodes would read as NaN)
    this.rtmp = new Float32Array(m.robot.n * 3);
    this.rtmp2 = new Float32Array(m.robot.n * 3);
    this.pose2 = new Float32Array(m.J * 3);
    this.pose3 = new Float32Array(m.J * 3);
    this.fit();
    this.dirty = true;
  };

  Viewer.prototype.setQuestion = function (q) {
    var m = this.model, self = this;
    this.q = q;
    this.yes = {};
    m.methods.forEach(function (mm) {
      var y = new Uint8Array(mm.K);
      for (var k = 0; k < mm.K; k++) y[k] = mm.tau[q.i * mm.K + k] <= q.hF ? 1 : 0;
      self.yes[mm.key] = y;
    });
    this.robotMoves = q.query === 'PR';
    var fade = q.query === 'VR';
    ['link', 'joint', 'accent', 'dark', 'spot', 'stand', 'base'].forEach(function (k) {
      var M = self.mats[k];
      M.color.copy(M.userData.base);
      if (fade) M.color.lerp(self.WHITE, 0.62);
    });
    this.lastS = null;
    this.dirty = true;
  };

  Viewer.prototype.fit = function () {
    var THREE = this.T3, m = this.model, bb = new THREE.Box3(), v = new THREE.Vector3(), i;
    function addAll(A) { for (var k = 0; k < A.length; k += 3) bb.expandByPoint(v.set(A[k], A[k + 1], A[k + 2])); }
    addAll(m.hh); addAll(m.hf); addAll(m.rh); addAll(m.rf);
    var n = m.robot.n, ro = (m.H - 1) * n * 3, J = m.J, ho = (m.H - 1) * J * 3;
    var rc = new THREE.Vector3(), pc = new THREE.Vector3();
    for (i = 0; i < n; i++) rc.add(v.set(m.rh[ro + i * 3], m.rh[ro + i * 3 + 1], m.rh[ro + i * 3 + 2]));
    rc.multiplyScalar(1 / n);
    for (i = 0; i < J; i++) pc.add(v.set(m.hh[ho + i * 3], m.hh[ho + i * 3 + 1], m.hh[ho + i * 3 + 2]));
    pc.multiplyScalar(1 / J);
    if (m.robot.kind === 'base_point') {         // the schematic base: 0.44 m wide, its head up to 1.10 m
      bb.expandByPoint(v.set(rc.x - 0.22, 1.1, rc.z - 0.22));
      bb.expandByPoint(v.set(rc.x + 0.22, 0, rc.z + 0.22));
    }
    bb.min.y = Math.min(bb.min.y, 0);
    bb.max.y += 0.2;                             // head spheres sit above the top joint on some skeletons
    bb.expandByScalar(0.07);
    var c = bb.getCenter(new THREE.Vector3());
    var dx = rc.x - pc.x, dz = rc.z - pc.z, dl = Math.sqrt(dx * dx + dz * dz);
    if (dl < 0.05) { dx = 1; dz = 0; } else { dx /= dl; dz /= dl; }
    var el = 13 * Math.PI / 180;
    var off = new THREE.Vector3(-dz * Math.cos(el), Math.sin(el), dx * Math.cos(el));    // side view; the robot on the right
    var f = off.clone().negate(), right = new THREE.Vector3().crossVectors(f, this.UP).normalize();
    var up = new THREE.Vector3().crossVectors(right, f);
    var tanV = Math.tan(this.camera.fov * Math.PI / 360), tanH = tanV * this.camera.aspect, D = 0;
    for (i = 0; i < 8; i++) {
      v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).sub(c);
      var x = v.dot(right), y = v.dot(up), z = v.dot(f);
      D = Math.max(D, Math.abs(x) / tanH - z, Math.abs(y) / tanV - z);
    }
    D *= 1.06;
    c.y += 0.02 * D;                             // a little room above the head for the panel label
    this.camera.position.copy(c).addScaledVector(off, D);
    this.controls.target.copy(c);
    this.camera.lookAt(c);
    this.controls.update();
    var fr = Math.max(2.4, 1.15 * Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z));
    if (!this.floor) {
      this.floor = new THREE.Mesh(new THREE.CircleGeometry(1, 72),
        new THREE.MeshBasicMaterial({ map: this.floorTex, transparent: true, depthWrite: false }));
      this.floor.rotation.x = -Math.PI / 2;
      this.floor.renderOrder = -1;
      this.scene.add(this.floor);
    }
    this.floor.position.set(c.x, -0.002, c.z);
    this.floor.scale.set(fr, fr, 1);
    this.dirty = true;
  };
  Viewer.prototype.resetCamera = function () { this.userMoved = false; this.fit(); };

  function lerpFrames(dst, A, f0, f1, a, n3) {
    var o0 = f0 * n3, o1 = f1 * n3;
    for (var i = 0; i < n3; i++) dst[i] = A[o0 + i] + (A[o1 + i] - A[o0 + i]) * a;
  }

  Viewer.prototype.update = function (sPos) {
    var m = this.model;
    if (!m || !this.q) return;
    if (sPos === this.lastS && !this.dirtyLines) return;
    this.lastS = sPos;
    this.dirtyLines = false;
    var H = m.H, T = m.T, J = m.J, n = m.robot.n, S = H + T - 1, i0, i1, a;
    var sv = clamp(sPos, 0, S);
    // the person: history, then the last observed pose
    var sb = Math.min(sv, H - 1);
    i0 = Math.floor(sb); i1 = Math.min(i0 + 1, H - 1); a = sb - i0;
    lerpFrames(this.pose, m.hh, i0, i1, a, J * 3);
    this.body.update(this.pose, 0);
    // the robot: history, then its recorded future (P/R questions) or its last observed pose
    var rp = this.rpose, n3 = n * 3;
    i0 = Math.floor(sv); i1 = Math.min(i0 + 1, S); a = sv - i0;
    var self = this;
    function robotAt(idx, dst) {
      if (idx <= H - 1) { for (var k = 0; k < n3; k++) dst[k] = m.rh[idx * n3 + k]; }
      else if (self.robotMoves) { var o = (idx - H) * n3; for (var k2 = 0; k2 < n3; k2++) dst[k2] = m.rf[o + k2]; }
      else { for (var k3 = 0; k3 < n3; k3++) dst[k3] = m.rh[(H - 1) * n3 + k3]; }
    }
    robotAt(i0, this.rtmp); robotAt(i1, this.rtmp2);
    for (var k = 0; k < n3; k++) rp[k] = this.rtmp[k] + (this.rtmp2[k] - this.rtmp[k]) * a;
    this.robot.update(rp, 0);
    // the futures
    var u = sv - (H - 1);
    this.futVisible = u > 1e-6;
    var keys = this.panelKeys;
    for (var key in this.lines) {
      if (!Object.prototype.hasOwnProperty.call(this.lines, key)) continue;
      var ls = this.lines[key];
      if (!this.futVisible || keys.indexOf(key) < 0) { ls.strong.commit(0); ls.light.commit(0); continue; }
      this.writeMethod(m.byKey[key], u);
    }
    if (this.futVisible) this.writeRecorded(u); else this.rec.commit(0);
    this.dirty = true;
  };
  Viewer.prototype.framePair = function (u) {
    var T = this.model.T, n0 = Math.floor(u), a = u - n0;
    if (n0 >= T) return [T, T, 0];
    return [n0, n0 + 1, a];
  };
  Viewer.prototype.writeMethod = function (mm, u) {
    var m = this.model, J = m.J, T = m.T, L = m.links, nL = L.length, K = mm.K, J3 = J * 3;
    var yes = this.yes[mm.key], ls = this.lines[mm.key], fp = this.framePair(u), n0 = fp[0], n1 = fp[1], a = fp[2];
    var last = (m.H - 1) * J3, P = this.pose2, ns = 0, nl = 0, C = mm.cand, hh = m.hh;
    for (var k = 0; k < K; k++) {
      var b1 = (k * T + n1 - 1) * J3, b0 = (k * T + n0 - 1) * J3;
      for (var i = 0; i < J3; i++) { var v0 = n0 === 0 ? hh[last + i] : C[b0 + i]; P[i] = v0 + (C[b1 + i] - v0) * a; }
      if (yes[k]) writeSkel(ls.strong.arr, (ns++) * nL, P, L); else writeSkel(ls.light.arr, (nl++) * nL, P, L);
    }
    ls.strong.commit(ns * nL);
    ls.light.commit(nl * nL);
  };
  Viewer.prototype.writeRecorded = function (u) {
    var m = this.model, J3 = m.J * 3, L = m.links, fp = this.framePair(u), n0 = fp[0], n1 = fp[1], a = fp[2];
    var last = (m.H - 1) * J3, P = this.pose3;
    for (var i = 0; i < J3; i++) { var v0 = n0 === 0 ? m.hh[last + i] : m.hf[(n0 - 1) * J3 + i]; P[i] = v0 + (m.hf[(n1 - 1) * J3 + i] - v0) * a; }
    writeSkel(this.rec.arr, 0, P, L);
    for (var l = 0; l < L.length; l++) {
      var o = l * 6, dx = this.rec.arr[o + 3] - this.rec.arr[o], dy = this.rec.arr[o + 4] - this.rec.arr[o + 1], dz = this.rec.arr[o + 5] - this.rec.arr[o + 2];
      this.rec.darr[2 * l] = 0;
      this.rec.darr[2 * l + 1] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    this.rec.commit(L.length);
  };

  Viewer.prototype.render = function () {
    if (!this.model || !this.rects.length) return;
    var r = this.renderer, Hc = this.cssH, cam = this.camera, sc = this.scene;
    r.setScissorTest(false);
    r.clear(true, true, true);
    r.setScissorTest(true);
    for (var p = 0; p < this.rects.length && p < this.panelKeys.length; p++) {
      var rc = this.rects[p], y = Hc - rc.y - rc.h, key = this.panelKeys[p];
      r.setViewport(rc.x, y, rc.w, rc.h);
      r.setScissor(rc.x, y, rc.w, rc.h);
      cam.layers.set(0);                                         // floor, robot, body
      r.render(sc, cam);
      r.clearDepth();
      cam.layers.set(1);                                         // the robot occludes the futures; the body does not
      sc.overrideMaterial = this.depthMat;
      r.render(sc, cam);
      sc.overrideMaterial = null;
      for (var k in this.lines) {
        if (!Object.prototype.hasOwnProperty.call(this.lines, k)) continue;
        var on = k === key;
        this.lines[k].strong.obj.visible = on;
        this.lines[k].light.obj.visible = on;
        if (on) { this.lines[k].strong.mat.resolution.set(rc.w, rc.h); this.lines[k].light.mat.resolution.set(rc.w, rc.h); }
      }
      this.rec.obj.visible = this.showRec && this.futVisible;
      this.rec.mat.resolution.set(rc.w, rc.h);
      cam.layers.set(2);
      r.render(sc, cam);
    }
    cam.layers.set(0);
    r.setScissorTest(false);
    this.dirty = false;
  };

  // ------------------------------------------------------------------------------------------------ charts
  function chartFrame(C, W, H) {
    clear(C.svg);
    C.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    C.svg.setAttribute('width', W);
    C.svg.setAttribute('height', H);
  }
  function median(vals) {
    var a = Array.prototype.slice.call(vals).sort(function (x, y) { return x - y; }), n = a.length;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }

  // ------------------------------------------------------------------------------------------------ app
  function App(root, index, opt) {
    this.root = root;
    this.index = index;
    this.opt = opt;
    this.base = opt.dataBase || '';
    this.models = {};
    this.st = { s: 0, playing: false, speed: 0.5, hold: 0, userPaused: false, rec: true, cmp: opt.compare || 'CoMusion_HR' };
    this.reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.autoplay = opt.autoplay !== false && !this.reduced;
    this.visible = false;
    this.narrow = false;
    this.build();
    var self = this;
    this.threeP = ensureThree().then(function (THREE) {
      try {
        self.viewer = new Viewer(THREE, self.ui.view, function () { self.requestFrame(); });
      } catch (e) {
        self.no3D('The 3D view needs WebGL, which this browser does not provide. The questions and charts below still work.');
        return;
      }
      self.viewer.showRec = self.st.rec;
      self.viewer.layout(self.narrow ? 'stack' : 'side');
      if (self.m) self.attachModel();
    }, function () {
      self.no3D('The 3D view needs three.js, which could not be loaded. The questions and charts below still work.');
    });
    this.observe();
    var first = opt.window && findEntry(index, opt.window) ? opt.window : index[0].id;
    this.selectWindow(first, opt.question, opt.time);
  }

  App.prototype.build = function () {
    var self = this, root = this.root, ui = this.ui = {};
    root.classList.add('dmfx');
    clear(root);
    ui.lead = h('p', 'dmfx-lead', root, 'Pick a window and any of the ' + NQ + ' questions. The same set of futures answers all of them.');
    // window picker
    ui.wins = h('div', 'dmfx-wins', root);
    ui.wins.setAttribute('role', 'group');
    ui.wins.setAttribute('aria-label', 'Test windows');
    ui.winBtns = {};
    this.index.forEach(function (e) {
      var b = h('button', 'dmfx-win', ui.wins);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      h('span', 'ds', b, e.dsname || e.dataset);
      h('span', 'tt', b, e.title);
      b.title = (e.dsname || e.dataset) + ': ' + e.title;
      b.addEventListener('click', function () { if (!self.m || self.m.id !== e.id) self.selectWindow(e.id); });
      ui.winBtns[e.id] = b;
    });
    ui.desc = h('p', 'dmfx-desc', root);
    // toolbar
    var bar = h('div', 'dmfx-bar', root);
    ui.cmp = h('div', 'dmfx-seg', bar);
    ui.cmp.setAttribute('role', 'group');
    ui.cmp.setAttribute('aria-label', 'Forecaster shown next to DeciMo');
    var tools = h('div', 'dmfx-seg', bar);
    // legend of the 3D view, right above it: every skeleton is a forecast future; the recorded future can be hidden
    var key = ui.key = h('div', 'dmfx-key', root);
    key.setAttribute('role', 'group');
    key.setAttribute('aria-label', 'Legend of the 3D view');
    h('span', 'dmfx-kl', key, 'Every colored skeleton is one forecast future:');
    ui.keyYes = h('span', 'dmfx-ki', key);
    ui.keyNo = h('span', 'dmfx-ki', key);
    ui.recBtn = h('button', 'dmfx-btn toggle dmfx-ki', key);
    ui.recBtn.type = 'button';
    ui.recBtn.setAttribute('aria-pressed', 'true');
    ui.recBtn.title = 'Show or hide the recorded future';
    ui.recBtn.appendChild(stickKey([REC], { 'stroke-width': 1.3, 'stroke-linecap': 'butt', 'stroke-dasharray': '2.2 1.3' }));
    h('span', null, ui.recBtn, 'recorded future');
    ui.recBtn.addEventListener('click', function () {
      self.st.rec = !self.st.rec;
      ui.recBtn.setAttribute('aria-pressed', self.st.rec ? 'true' : 'false');
      if (self.viewer) { self.viewer.showRec = self.st.rec; self.viewer.dirty = true; }
      self.requestFrame();
    });
    ui.speedBtn = h('button', 'dmfx-btn', tools, '0.5× speed');
    ui.speedBtn.type = 'button';
    ui.speedBtn.title = 'Playback speed';
    ui.speedBtn.addEventListener('click', function () {
      self.st.speed = self.st.speed === 1 ? 0.5 : 1;
      ui.speedBtn.textContent = (self.st.speed === 1 ? '1' : '0.5') + '× speed';
    });
    ui.resetBtn = h('button', 'dmfx-btn', tools, 'reset view');
    ui.resetBtn.type = 'button';
    ui.resetBtn.addEventListener('click', function () { if (self.viewer) { self.viewer.resetCamera(); self.requestFrame(); } });
    // 3D view
    ui.view = h('div', 'dmfx-view', root);
    ui.view.setAttribute('role', 'img');
    ui.labels = [h('div', 'dmfx-plabel', ui.view), h('div', 'dmfx-plabel', ui.view)];
    ui.sep = h('div', 'dmfx-sep', ui.view);
    ui.msg = h('div', 'dmfx-msg', ui.view, 'Loading…');
    // playback
    var ctl = h('div', 'dmfx-ctl', root);
    ui.play = h('button', 'dmfx-play', ctl);
    ui.play.type = 'button';
    ui.play.addEventListener('click', function () { if (self.st.playing) self.pause(true); else self.play(true); });
    var sc = h('div', 'dmfx-scrub', ctl);
    ui.trackH = h('div', 'dmfx-track hist', sc);
    ui.trackF = h('div', 'dmfx-track fut', sc);
    ui.markNow = h('div', 'dmfx-mark', sc);
    ui.markH = h('div', 'dmfx-mark h', sc);
    ui.ticks = h('div', 'dmfx-ticks', sc);
    ui.range = h('input', null, sc);
    ui.range.type = 'range';
    ui.range.min = '0';
    ui.range.step = '1';
    ui.range.setAttribute('aria-label', 'Time: the last observed second, then the forecast second');
    ui.range.addEventListener('input', function () {
      self.pause(true);
      self.st.s = +ui.range.value;
      self.requestFrame();
    });
    ui.time = h('span', 'dmfx-time', ctl, '');
    ui.time.setAttribute('aria-hidden', 'true');
    ui.note = h('p', 'dmfx-note', root);
    // grid + readout
    var main = h('div', 'dmfx-main', root);
    var gw = ui.gridwrap = h('div', 'dmfx-gridwrap', main);
    h('p', 'dmfx-h', gw, 'Questions');
    this.buildGrid(gw);
    var gl = h('div', 'dmfx-glegend', gw);
    var l1 = h('span', null, gl); h('span', 'dmfx-sq', l1); h('span', null, l1, 'asked in this window');
    var l2 = h('span', null, gl); h('span', 'dmfx-sq ho', l2); h('span', null, l2, 'held out from training');
    var l3 = h('span', null, gl); h('span', 'dmfx-sq ev', l3); h('span', null, l3, 'event recorded within h');
    var l4 = h('span', null, gl); h('span', 'dmfx-sq off', l4); h('span', null, l4, 'not asked');
    ui.tip = h('div', 'dmfx-tip', gw);
    ui.tip.hidden = true;
    var rd = ui.read = h('div', 'dmfx-read', main);
    ui.qt = h('p', 'dmfx-qt', rd);
    ui.qs = h('p', 'dmfx-qs', rd);
    ui.rec = h('p', 'dmfx-rec', rd);
    ui.bars = h('div', 'dmfx-bars', rd);
    ui.bfoot = h('p', 'dmfx-bfoot', rd);
    // charts
    var ch = h('div', 'dmfx-charts', root);
    ui.cdf = this.makeChart(ch, 'cdf', -1);
    ui.dist = [this.makeChart(ch, 'dist', 0), this.makeChart(ch, 'dist', 1)];
    ui.legend = h('div', 'dmfx-legend', root);
    ui.cap = h('p', 'dmfx-cap', root);
    ui.live = h('div', 'sr-only', root);
    ui.live.setAttribute('aria-live', 'polite');
    this.setPlayIcon();
  };

  App.prototype.makeChart = function (parent, kind, idx) {
    var self = this, C = { kind: kind, idx: idx };
    C.fig = h('figure', 'dmfx-chart', parent);
    C.ttl = h('div', 'ttl', C.fig);
    C.plot = h('div', 'plot', C.fig);
    C.plot.tabIndex = 0;
    C.svg = s('svg', { role: 'img' }, C.plot);
    C.tip = h('div', 'dmfx-tip', C.plot);
    C.tip.hidden = true;
    function at(e) {
      if (!C.geo) return null;
      var r = C.svg.getBoundingClientRect(), x = (e.clientX - r.left) * (C.geo.W / r.width);
      return clamp(Math.round(C.geo.inv(x)), C.geo.n0, C.geo.n1);
    }
    C.plot.addEventListener('pointermove', function (e) { var n = at(e); if (n != null) self.chartHover(C, n); });
    C.plot.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') self.chartHover(C, null); });
    C.plot.addEventListener('click', function (e) { var n = at(e); if (n != null) self.seekFrame(n); });
    C.plot.addEventListener('keydown', function (e) {
      if (!C.geo) return;
      var n = C.hover == null ? C.geo.n0 : C.hover;
      if (e.key === 'ArrowRight') n = Math.min(C.geo.n1, n + 1);
      else if (e.key === 'ArrowLeft') n = Math.max(C.geo.n0, n - 1);
      else if (e.key === 'Enter') { if (C.hover != null) self.seekFrame(C.hover); return; }
      else if (e.key === 'Escape') { self.chartHover(C, null); return; }
      else return;
      e.preventDefault();
      self.chartHover(C, n);
    });
    C.plot.addEventListener('blur', function () { self.chartHover(C, null); });
    return C;
  };

  App.prototype.buildGrid = function (parent) {
    var self = this, ui = this.ui;
    var t = ui.table = h('table', 'dmfx-qg', parent);
    t.setAttribute('role', 'grid');
    t.setAttribute('aria-label', 'Questions: query and event family (rows) by warning distance and horizon (columns)');
    var th = h('thead', null, t), r1 = h('tr', 'd', th), r2 = h('tr', null, th);
    var c1 = h('th', 'corner', r1); c1.innerHTML = '&delta; (m)';
    var c2 = h('th', 'corner', r2); c2.textContent = 'h (s)';
    DELTAS.forEach(function (d, i) {
      var x = h('th', i > 0 ? 'g0' : null, r1);
      x.colSpan = 3;
      if (i === 0) { x.innerHTML = '&delta;<sub>c</sub>'; x.title = 'contact threshold'; } else x.textContent = num(d);
      HLAB.forEach(function (lab, j) { var y = h('th', j === 0 && i > 0 ? 'g0' : null, r2, lab); y.setAttribute('aria-label', 'h ' + HNOM[j] + ' s'); });
    });
    var tb = h('tbody', null, t);
    ui.cells = [];
    ROWS.forEach(function (rw, r) {
      var tr = h('tr', null, tb), rh = h('th', null, tr);
      rh.scope = 'row';
      h('b', null, rh, QLAB[rw[0]]);
      rh.appendChild(document.createTextNode(' ' + FLAB[rw[1]]));
      var row = [];
      for (var c = 0; c < 15; c++) {
        var td = h('td', c % 3 === 0 && c > 0 ? 'g0' : null, tr);
        td.setAttribute('role', 'gridcell');
        td.tabIndex = -1;
        td.dataset.r = r;
        td.dataset.c = c;
        h('span', 'dmfx-sq off', td);
        row.push(td);
      }
      ui.cells.push(row);
    });
    t.addEventListener('click', function (e) {
      var td = e.target.closest ? e.target.closest('td') : null;
      if (!td || !self.m) return;
      var r = +td.dataset.r, c = +td.dataset.c, q = self.m.cells[r][c];
      self.focusCell(r, c, false);
      if (q && q.ok) { self.selectQuestion(q); self.showCellTip(r, c, false); }
      else self.showCellTip(r, c, true);
    });
    t.addEventListener('mouseover', function (e) {
      var td = e.target.closest ? e.target.closest('td') : null;
      if (td && self.m) self.showCellTip(+td.dataset.r, +td.dataset.c, false);
    });
    t.addEventListener('mouseleave', function () { self.hideTip(); });
    t.addEventListener('focusin', function (e) {
      var td = e.target.closest ? e.target.closest('td') : null;
      var kb = true;
      try { kb = td && td.matches(':focus-visible'); } catch (err) { kb = true; }
      if (td && kb && self.m) self.showCellTip(+td.dataset.r, +td.dataset.c, false);
    });
    t.addEventListener('focusout', function () { self.hideTip(); });
    t.addEventListener('keydown', function (e) {
      if (!self.m) return;
      var r = self.fr, c = self.fc;
      if (e.key === 'ArrowRight') c = Math.min(14, c + 1);
      else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
      else if (e.key === 'ArrowDown') r = Math.min(5, r + 1);
      else if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
      else if (e.key === 'Home') c = 0;
      else if (e.key === 'End') c = 14;
      else if (e.key === 'Enter' || e.key === ' ') { var q0 = self.m.cells[r][c]; if (q0 && q0.ok) self.selectQuestion(q0); e.preventDefault(); return; }
      else if (e.key === 'Escape') { self.hideTip(); return; }
      else return;
      e.preventDefault();
      self.focusCell(r, c, true);
      var q = self.m.cells[r][c];
      if (q && q.ok) self.selectQuestion(q);
      self.showCellTip(r, c, false);
    });
  };

  App.prototype.focusCell = function (r, c, move) {
    var cells = this.ui.cells;
    if (this.fr != null && cells[this.fr]) cells[this.fr][this.fc].tabIndex = -1;
    this.fr = r; this.fc = c;
    cells[r][c].tabIndex = 0;
    if (move) cells[r][c].focus();
  };

  App.prototype.cellTip = function (r, c) {
    var m = this.m, q = m.cells[r][c], rw = ROWS[r], d = DELTAS[Math.floor(c / 3)], hn = HNOM[c % 3];
    var head = QLAB[rw[0]] + ' ' + FLAB[rw[1]] + ', δ = ' + num(d) + ' m, h = ' + num(hn) + ' s';
    var lines = [];
    if (!q || !q.supported) {
      lines.push('Not in the data of this window: its forecasts cover ' + m.qs.length + ' of the ' + NQ + ' questions' +
        (m.note ? ' (' + cleanNote(m.note) + ')' : '') + '.');
    } else if (!q.eligible) {
      lines.push(rw[1] === 'in'
        ? 'Not asked: the person starts within ' + num(q.delta) + ' m of ' + objName(q) + ', so this window asks the exit question.'
        : 'Not asked: the person starts beyond ' + num(q.delta) + ' m of ' + objName(q) + ', so this window asks the entry question.');
    } else {
      lines.push(recText(m, q, true) + '.');
      lines.push(this.panelKeys().map(function (k) {
        var mm = m.byKey[k];
        return mm.label + ' ' + mm.count[q.i] + '/' + mm.K;
      }).join(' · '));
      if (isHeldOut(r, c)) lines.push('Held out from training and model selection.');
    }
    return { head: head, lines: lines };
  };
  function cleanNote(note) { return String(note).replace(/\s*\(author[^)]*\)\s*/i, '').trim(); }

  App.prototype.showCellTip = function (r, c, sticky) {
    var tip = this.ui.tip, info = this.cellTip(r, c), self = this;
    clear(tip);
    h('div', 'hd', tip, info.head);
    info.lines.forEach(function (l, i) { h('div', i ? 'mut' : null, tip, l); });
    tip.hidden = false;
    var td = this.ui.cells[r][c], wrap = this.ui.gridwrap.getBoundingClientRect(), b = td.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight, x = b.left - wrap.left + b.width / 2 - tw / 2, y = b.top - wrap.top - th - 6;
    x = clamp(x, 0, Math.max(0, wrap.width - tw));
    if (y < 0) y = b.bottom - wrap.top + 6;
    tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    clearTimeout(this.tipTimer);
    if (sticky) this.tipTimer = setTimeout(function () { self.hideTip(); }, 3500);
  };
  App.prototype.hideTip = function () { this.ui.tip.hidden = true; };

  App.prototype.updateGrid = function () {
    var m = this.m, cells = this.ui.cells;
    for (var r = 0; r < 6; r++) {
      for (var c = 0; c < 15; c++) {
        var td = cells[r][c], q = m.cells[r][c], sq = td.firstChild, ok = !!(q && q.ok);
        sq.className = 'dmfx-sq' + (ok ? (isHeldOut(r, c) ? ' ho' : '') + (q.event ? ' ev' : '') : ' off');
        td.setAttribute('aria-disabled', ok ? 'false' : 'true');
        td.setAttribute('aria-selected', 'false');
        var info = this.cellTip(r, c);
        td.setAttribute('aria-label', info.head + '. ' + info.lines.join(' '));
      }
    }
  };

  App.prototype.panelKeys = function () {
    var m = this.m, keys = [];
    if (!m) return keys;
    keys.push(m.byKey.DMF_HR ? 'DMF_HR' : m.methods[0].key);
    var c = this.st.cmp;
    if (!m.byKey[c] || c === keys[0]) {
      c = null;
      for (var i = 0; i < m.methods.length; i++) if (m.methods[i].key !== keys[0]) { c = m.methods[i].key; break; }
    }
    if (c) keys.push(c);
    return keys;
  };

  App.prototype.buildCompare = function () {
    var self = this, m = this.m, box = this.ui.cmp, keys = this.panelKeys();
    clear(box);
    h('span', 'lbl', box, 'Compare ' + ((m.byKey[keys[0]] || {}).name || 'DeciMo') + ' with');
    m.methods.forEach(function (mm) {
      if (mm.key === keys[0]) return;
      var b = h('button', 'dmfx-btn', box);
      b.type = 'button';
      b.setAttribute('aria-pressed', mm.key === keys[1] ? 'true' : 'false');
      b.appendChild(lineKey(mm.color, mm.det ? '5 3' : null, 16, 2));
      h('span', null, b, mm.label);
      if (mm.det) b.title = mm.name + ': deterministic, one future';
      b.addEventListener('click', function () { self.setCompare(mm.key); });
    });
  };

  App.prototype.setCompare = function (key) {
    if (!this.m || !this.m.byKey[key]) return;
    this.st.cmp = key;
    this.buildCompare();
    if (this.viewer) { this.viewer.panelKeys = this.panelKeys(); this.viewer.lastS = null; }
    this.renderLabels();
    this.renderKey();
    this.renderCharts();
    this.renderNote();
    this.requestFrame();
  };

  App.prototype.selectWindow = function (id, qid, time) {
    var self = this, entry = findEntry(this.index, id);
    if (!entry) return;
    Object.keys(this.ui.winBtns).forEach(function (k) { self.ui.winBtns[k].setAttribute('aria-pressed', k === id ? 'true' : 'false'); });
    this.ui.view.classList.add('is-busy');
    this.ui.msg.hidden = false;
    this.ui.msg.textContent = 'Loading ' + (entry.dsname || entry.dataset) + ' window (' + (Math.round(entry.kb / 102.4) / 10) + ' MB)…';
    var token = this.token = {};
    var cached = this.models[id];
    var p = cached ? Promise.resolve(cached) : loadWindowData(entry, this.base).then(function (raw) {
      var m = self.models[id] || (self.models[id] = buildModel(raw));
      if (global.DMFX) delete global.DMFX[id];
      return m;
    });
    p.then(function (m) {
      if (token !== self.token) return;
      self.setModel(m, qid, time);
    }).catch(function (err) {
      if (token !== self.token) return;
      self.ui.msg.textContent = 'Could not load ' + entry.file + ' (' + (err && err.message ? err.message : err) + ').';
    });
  };

  App.prototype.setModel = function (m, qid, time) {
    this.m = m;
    this.q = null;
    this.hideTip();
    var dmf = m.byKey.DMF_HR || m.methods[0];
    this.ui.lead.textContent = 'Pick a window and any of the ' + NQ + ' questions. The same ' + dmf.K + ' futures answer all of them.';
    this.ui.view.classList.remove('is-busy');
    if (this.failed3D) { this.ui.msg.hidden = false; this.ui.msg.textContent = this.failMsg; }
    else if (!this.viewer) { this.ui.msg.hidden = false; this.ui.msg.textContent = 'Loading the 3D view…'; }
    this.buildCompare();
    this.renderDesc();
    this.updateGrid();
    this.setupScrubber();
    var q = (qid && m.qById[qid] && m.qById[qid].ok) ? m.qById[qid] : m.qById[m.q0];
    if (!q || !q.ok) q = m.qs.filter(function (x) { return x.ok; })[0];
    var S = m.H + m.T - 1;
    if (typeof time === 'number') this.st.s = clamp(m.H - 1 + time * m.fps, 0, S);
    else if (time === 'end' || !this.autoplay || this.st.userPaused) this.st.s = S;
    else this.st.s = 0;
    this.st.hold = 0;
    if (this.viewer) this.attachModel();
    this.selectQuestion(q, true);
    if (this.autoplay && this.visible && !this.st.userPaused && typeof time !== 'number' && time !== 'end') this.play(false);
    this.renderLegend();
  };
  App.prototype.attachModel = function () {
    var v = this.viewer, m = this.m;
    this.ui.msg.hidden = true;
    v.setModel(m);
    v.panelKeys = this.panelKeys();
    v.layout(this.narrow ? 'stack' : 'side');
    if (this.q) v.setQuestion(this.q);
    this.renderLabels();
    this.requestFrame();
  };

  App.prototype.no3D = function (msg) {
    this.failed3D = true;
    this.failMsg = msg;
    this.ui.msg.hidden = false;
    this.ui.msg.textContent = msg;
    this.ui.labels.forEach(function (l) { l.hidden = true; });
    this.ui.sep.hidden = true;
  };

  App.prototype.selectQuestion = function (q, initial) {
    if (!q) return;
    this.q = q;
    var cells = this.ui.cells;
    for (var r = 0; r < 6; r++) for (var c = 0; c < 15; c++) cells[r][c].setAttribute('aria-selected', 'false');
    if (q.r != null) {
      cells[q.r][q.c].setAttribute('aria-selected', 'true');
      if (initial || this.fr == null) this.focusCell(q.r, q.c, false);
    }
    if (this.viewer && this.viewer.model === this.m) { this.viewer.panelKeys = this.panelKeys(); this.viewer.setQuestion(q); }
    this.placeHMark();
    this.renderReadout();
    this.renderCharts();
    this.renderLabels();
    this.renderKey();
    this.renderNote();
    this.announce();
    this.requestFrame();
  };

  // ---------------------------------------------------------------- text and readouts
  App.prototype.renderDesc = function () {
    var m = this.m, parts = [m.dsname + ', ' + (ROBOT_TXT[m.robot.kind] || 'robot'), 'window ' + m.win, m.fps + ' frames per second'];
    var t = parts.join(' · ') + '.';
    if (m.guiding && m.guiding.length) t += ' The forearms that guide the robot are left out of the distances.';
    if (m.robot.kind === 'base_point') t += ' The mobile base is drawn schematically around the one floor point that localizes it. Distances are measured to that point.';
    if (m.note) t += ' ' + cleanNote(m.note).replace(/^./, function (ch) { return ch.toUpperCase(); }) + '.';
    if (m.qs.length < NQ) t += ' The forecasts of this window cover ' + m.qs.length + ' of the ' + NQ + ' questions.';
    this.ui.desc.textContent = t;
    this.ui.view.setAttribute('aria-label', '3D view of ' + m.dsname + ' window ' + m.win + ': ' + m.title + '.');
  };

  App.prototype.renderReadout = function () {
    var m = this.m, q = this.q, ui = this.ui;
    clear(ui.qt);
    h('b', null, ui.qt, QLAB[q.query] + ' ' + FLAB[q.fam]);
    ui.qt.appendChild(document.createTextNode(', δ = ' + (q.dStr === DELTAS[0] ? 'δc = ' : '') + num(q.delta) + ' m, h = ' + num(q.hNom) + ' s'));
    var tag = qTag(m, q);
    if (tag) h('span', 'dmfx-tag', ui.qt, tag);
    var who = q.query === 'O' ? 'The robot holds its last observed pose. '
      : q.query === 'PR' ? 'The robot follows its executed motion. '
      : 'A virtual object on the robot’s side retreats from the person (not drawn). ';
    ui.qs.textContent = who + (q.fam === 'in'
      ? 'Will the person come within ' + num(q.delta) + ' m of ' + (q.query === 'VR' ? 'it' : 'the robot') + ' within ' + num(q.hNom) + ' s?'
      : 'Will the person move beyond ' + num(q.delta) + ' m of ' + (q.query === 'VR' ? 'it' : 'the robot') + ' and stay out, within ' + num(q.hNom) + ' s?');
    clear(ui.rec);
    ui.rec.appendChild(lineKey(REC, '4 3', 18, 2));
    h('span', null, ui.rec, recText(m, q, false) + '.');
    clear(ui.bars);
    m.methods.forEach(function (mm) {
      var row = h('div', 'dmfx-brow', ui.bars), c = mm.count[q.i];
      var nm = h('span', 'nm', row);
      h('span', null, nm, mm.label);
      nm.title = mm.name + ', with the robot history';
      var tr = h('span', 'tr', row), fi = h('span', 'fi', tr);
      fi.style.width = (100 * c / mm.K).toFixed(1) + '%';
      fi.style.background = mm.c2;
      h('b', 'p', row, pFmt(c, mm.K));
      h('span', 'c', row, c + '/' + mm.K);
      row.setAttribute('aria-label', mm.label + ': p-hat ' + pFmt(c, mm.K) + ', ' + c + ' of ' + mm.K + ' futures');
    });
    var hasDet = m.methods.some(function (mm) { return mm.det; });
    var Ks = m.methods.filter(function (mm) { return !mm.det; }).map(function (mm) { return mm.K; });
    var t = 'p̂: share of the ' + (Ks.length ? 'K = ' + Ks[0] : 'K') + ' futures in which the event occurs within h. ';
    t += 'All forecasters see the robot history.';
    if (hasDet) t += ' AINet is deterministic (one future).';
    ui.bfoot.textContent = t;
  };

  App.prototype.renderLabels = function () {
    var ui = this.ui, m = this.m, q = this.q, v = this.viewer;
    if (!m || !q) return;
    var keys = this.panelKeys(), rects = v ? v.rects : null;
    ui.labels.forEach(function (lab, i) {
      clear(lab);
      var mm = m.byKey[keys[i]];
      if (!mm || !rects || !rects[i]) { lab.hidden = true; return; }
      lab.hidden = false;
      var nm = h('span', 'nm', lab);
      nm.appendChild(lineKey(mm.color, null, 14, 2.5));
      h('span', null, nm, mm.label);
      h('span', 'ct', lab, (q.fam === 'in' ? 'entry' : 'exit') + ' within ' + num(q.hNom) + ' s: ' + mm.count[q.i] + '/' + mm.K);
      lab.style.left = (rects[i].x + 8) + 'px';
      lab.style.top = (rects[i].y + 8) + 'px';
    });
    if (rects && rects.length > 1) {
      ui.sep.hidden = false;
      if (this.narrow) { ui.sep.style.cssText = 'left:0;right:0;height:1px;top:' + (rects[1].y - 1) + 'px'; }
      else { ui.sep.style.cssText = 'top:0;bottom:0;width:1px;left:' + (rects[1].x - 1) + 'px'; }
    }
  };

  App.prototype.renderNote = function () {
    var ui = this.ui, q = this.q, n = ui.note;
    clear(n);
    var touch = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
    h('span', null, n, (q.query === 'PR' ? 'The robot replays its recorded motion. ' : q.query === 'VR'
      ? 'The virtual object is not drawn. ' : 'The robot holds its last observed pose. ') +
      (touch ? 'Two fingers rotate and zoom.' : 'Drag to rotate, and scroll to zoom after a click.'));
  };

  // the legend above the 3D view: dark = the future answers the question with yes, light = it does not (panel colours)
  App.prototype.renderKey = function () {
    var ui = this.ui, m = this.m, q = this.q;
    if (!m || !q) return;
    var cols = this.panelKeys().map(function (k) { return m.byKey[k].color; });
    var ev = (q.fam === 'in' ? 'enters ' : 'leaves ') + num(q.delta) + ' m within ' + num(q.hNom) + ' s';
    clear(ui.keyYes);
    ui.keyYes.appendChild(futKey(cols, true));
    h('span', null, ui.keyYes, ev);
    clear(ui.keyNo);
    ui.keyNo.appendChild(futKey(cols, false));
    h('span', null, ui.keyNo, 'does not');
    ui.key.setAttribute('aria-label', 'Legend of the 3D view: every colored skeleton is one forecast future. Dark: it ' + ev +
      '. Light: it does not. Black dashed: the recorded future.');
  };

  App.prototype.renderLegend = function () {
    var ui = this.ui, m = this.m;
    clear(ui.legend);
    m.methods.forEach(function (mm) {
      var sp = h('span', null, ui.legend);
      sp.appendChild(lineKey(mm.c2, mm.dash, 20, Math.min(mm.width, 2.4)));
      h('span', null, sp, mm.label);
    });
    var r = h('span', null, ui.legend); r.appendChild(lineKey(REC, null, 20, 1.8)); h('span', null, r, 'recorded');
    var d = h('span', null, ui.legend); d.appendChild(lineKey(WARN, '5 3', 20, 1.6)); h('span', null, d, 'warning distance δ');
    var hh = h('span', null, ui.legend); hh.appendChild(lineKey('#9aa0a6', '3 3', 20, 1.3)); h('span', null, hh, 'horizon h');
    ui.cap.textContent = 'F̂τ is the share of the futures whose first event comes by each time, and at the horizon it equals p̂. ' +
      'Distance panels: one thin line per future (dark: the event occurs within h, light: it does not), bold: their median, ' +
      'black: recorded. Hover or use the arrow keys to read values, and select a time to show it in 3D.';
  };

  App.prototype.announce = function () {
    var m = this.m, q = this.q;
    this.ui.live.textContent = qName(q) + '. ' + recText(m, q, false) + '. ' + m.methods.map(function (mm) {
      return mm.label + ' ' + mm.count[q.i] + ' of ' + mm.K;
    }).join(', ') + '.';
  };

  // ---------------------------------------------------------------- charts
  App.prototype.renderCharts = function () {
    if (!this.m || !this.q) return;
    this.drawCDF();
    var keys = this.panelKeys(), q = this.q, m = this.m, lo = Infinity, hi = -Infinity, k, i;
    for (k = 0; k < keys.length; k++) {
      var D = m.byKey[keys[k]].dist[q.query];
      if (D) for (i = 0; i < D.length; i++) { if (D[i] < lo) lo = D[i]; if (D[i] > hi) hi = D[i]; }
    }
    var tr = m.truth[q.query];
    if (tr) for (i = 0; i < tr.length; i++) { if (tr[i] < lo) lo = tr[i]; if (tr[i] > hi) hi = tr[i]; }
    lo = Math.min(lo, q.delta); hi = Math.max(hi, q.delta);
    var pad = Math.max(0.02, (hi - lo) * 0.06);
    this.dRange = [lo - pad, hi + pad];
    for (k = 0; k < 2; k++) this.drawDist(k);
    this.syncCursors();
  };

  App.prototype.chartSize = function (C) {
    return { W: Math.max(240, Math.round(C.plot.clientWidth || 300)), H: this.narrow ? 176 : 188 };
  };

  App.prototype.drawCDF = function () {
    var C = this.ui.cdf, m = this.m, q = this.q, fps = m.fps, hF = q.hF, hs = hF / fps, sz = this.chartSize(C), W = sz.W, H = sz.H;
    clear(C.ttl);
    var t = h('span', null, C.ttl);
    t.innerHTML = 'First-event time <i>F̂</i><sub>τ</sub>, ' + (q.fam === 'in' ? 'entry' : 'exit') + ' within ' + num(q.hNom) + ' s';
    chartFrame(C, W, H);
    var M = { t: 12, r: 12, b: 34, l: 40 }, pw = W - M.l - M.r, ph = H - M.t - M.b, svg = C.svg;
    function X(tt) { return M.l + tt / hs * pw; }
    function Y(v) { return M.t + (1 - v) * ph; }
    [0, 0.5, 1].forEach(function (v) {
      s('line', { x1: M.l, x2: M.l + pw, y1: Y(v), y2: Y(v), stroke: v === 0 ? '#bdc1c6' : '#ececec', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, svg);
      txt(svg, M.l - 6, Y(v) + 4, v === 0 ? '0' : v === 1 ? '1' : '0.5', 'end');
    });
    ticks(0, hs, 4).forEach(function (tt) {
      s('line', { x1: X(tt), x2: X(tt), y1: M.t + ph, y2: M.t + ph + 4, stroke: '#9aa0a6', 'stroke-width': 1 }, svg);
      txt(svg, X(tt), M.t + ph + 16, num(tt), 'middle');
    });
    txt(svg, M.l + pw / 2, H - 3, 'time from now (s)', 'middle', 'at');
    var yl = txt(svg, 0, 0, 'share of futures', 'middle', 'at');
    yl.setAttribute('transform', 'translate(9,' + (M.t + ph / 2) + ') rotate(-90)');
    if (q.event) {
      var xr = X(q.tau / fps);
      s('line', { x1: xr, x2: xr, y1: M.t, y2: M.t + ph, stroke: REC, 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }, svg);
      txt(svg, xr + (xr > M.l + pw * 0.7 ? -5 : 5), M.t + 9, 'recorded', xr > M.l + pw * 0.7 ? 'end' : 'start', 'lab');
    } else {
      txt(svg, M.l + 6, M.t + 10, 'recorded: no ' + (q.fam === 'in' ? 'entry' : 'exit') + ' within h', 'start', 'lab');
    }
    var series = [];
    this.m.methods.slice().reverse().forEach(function (mm) {
      var K = mm.K, F = new Float32Array(hF + 1), cnt = new Int32Array(hF + 2), k, n;
      for (k = 0; k < K; k++) { var tk = mm.tau[q.i * K + k]; if (tk >= 1 && tk <= hF) cnt[tk]++; }
      for (n = 1; n <= hF; n++) F[n] = F[n - 1] + cnt[n] / K;
      var d = 'M' + X(0).toFixed(1) + ',' + Y(0).toFixed(1);
      for (n = 1; n <= hF; n++) d += 'H' + X(n / fps).toFixed(1) + 'V' + Y(F[n]).toFixed(1);
      s('path', { d: d, fill: 'none', stroke: mm.c2, 'stroke-width': mm.width, 'stroke-dasharray': mm.dash, 'stroke-linejoin': 'round',
        'stroke-linecap': 'round' }, svg);
      if (mm.det) s('rect', { x: X(hs) - 3.5, y: Y(F[hF]) - 3.5, width: 7, height: 7, fill: mm.c2, stroke: '#ffffff', 'stroke-width': 1.5 }, svg);
      series.push({ mm: mm, F: F });
    });
    series.reverse();
    C.series = series;
    C.cursor = s('line', { x1: 0, x2: 0, y1: M.t, y2: M.t + ph, stroke: '#9aa0a6', 'stroke-width': 1, visibility: 'hidden' }, svg);
    C.cross = s('line', { x1: 0, x2: 0, y1: M.t, y2: M.t + ph, stroke: '#5f6368', 'stroke-width': 1, visibility: 'hidden' }, svg);
    C.geo = { W: W, H: H, M: M, pw: pw, ph: ph, n0: 0, n1: hF, X: function (n) { return X(n / fps); }, inv: function (x) { return (x - M.l) / pw * hs * fps; } };
    C.svg.setAttribute('aria-label', 'First-event times of the futures for the selected question. At the horizon: ' +
      series.map(function (sr) { return sr.mm.label + ' ' + sr.F[hF].toFixed(2); }).join(', ') + '.');
    C.hover = null;
    C.tip.hidden = true;
  };

  App.prototype.drawDist = function (idx) {
    var C = this.ui.dist[idx], m = this.m, q = this.q, keys = this.panelKeys(), key = keys[idx], mm = key ? m.byKey[key] : null;
    clear(C.ttl);
    if (!mm) { C.fig.hidden = true; return; }
    C.fig.hidden = false;
    var D = mm.dist[q.query], tr = m.truth[q.query];
    C.ttl.appendChild(lineKey(mm.color, mm.det ? '5 3' : null, 16, 2.4));
    h('span', null, C.ttl, mm.label + ': distance to ' + (q.query === 'VR' ? 'the virtual object' : 'the robot'));
    var sz = this.chartSize(C), W = sz.W, H = sz.H, fps = m.fps, T = m.T, ts = T / fps, lo = this.dRange[0], hi = this.dRange[1];
    chartFrame(C, W, H);
    var M = { t: 12, r: 12, b: 34, l: 40 }, pw = W - M.l - M.r, ph = H - M.t - M.b, svg = C.svg;
    function X(tt) { return M.l + tt / ts * pw; }
    function Y(v) { return M.t + (hi - v) / (hi - lo) * ph; }
    var yd = Y(q.delta);
    s('rect', { x: M.l, y: yd, width: pw, height: Math.max(0, M.t + ph - yd), fill: '#fbf4e6' }, svg);
    ticks(lo, hi, 4).forEach(function (v) {
      s('line', { x1: M.l, x2: M.l + pw, y1: Y(v), y2: Y(v), stroke: '#ececec', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, svg);
      txt(svg, M.l - 6, Y(v) + 4, (v < 0 ? '−' : '') + num(Math.abs(v)), 'end');
    });
    s('line', { x1: M.l, x2: M.l + pw, y1: M.t + ph, y2: M.t + ph, stroke: '#bdc1c6', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, svg);
    ticks(0, ts, 4).forEach(function (tt) {
      s('line', { x1: X(tt), x2: X(tt), y1: M.t + ph, y2: M.t + ph + 4, stroke: '#9aa0a6', 'stroke-width': 1 }, svg);
      txt(svg, X(tt), M.t + ph + 16, num(tt), 'middle');
    });
    txt(svg, M.l + pw / 2, H - 3, 'time from now (s)', 'middle', 'at');
    var yt = txt(svg, 0, 0, 'distance (m)', 'middle', 'at');
    yt.setAttribute('transform', 'translate(11,' + (M.t + ph / 2) + ') rotate(-90)');
    if (q.hF < T) {
      var xh = X(q.hF / fps);
      s('line', { x1: xh, x2: xh, y1: M.t, y2: M.t + ph, stroke: '#9aa0a6', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }, svg);
      txt(svg, xh + 4, M.t + 9, 'h', 'start', 'lab');
    }
    var yes = new Uint8Array(mm.K), K = mm.K, k, n, d;
    for (k = 0; k < K; k++) yes[k] = mm.tau[q.i * K + k] <= q.hF ? 1 : 0;
    var light = mix(mm.color, FUT_MIX);
    if (D) {
      [0, 1].forEach(function (pass) {                // the futures that do not answer yes first, those that do on top
        for (k = 0; k < K; k++) {
          if (yes[k] !== pass) continue;
          d = '';
          for (n = 1; n <= T; n++) d += (n === 1 ? 'M' : 'L') + X(n / fps).toFixed(1) + ',' + Y(D[k * T + n - 1]).toFixed(1);
          s('path', { d: d, fill: 'none', stroke: pass ? mm.color : light, 'stroke-width': K === 1 ? 2.2 : 0.95,
            'stroke-opacity': pass ? OP_YES : OP_NO, 'stroke-dasharray': K === 1 ? mm.dash : null, 'stroke-linejoin': 'round' }, svg);
        }
      });
    }
    s('line', { x1: M.l, x2: M.l + pw, y1: yd, y2: yd, stroke: WARN, 'stroke-width': 1.6, 'stroke-dasharray': '5 3' }, svg);
    txt(svg, M.l + pw - 2, yd - 4, 'δ = ' + num(q.delta) + ' m', 'end', 'lab');
    var med = new Float32Array(T);
    if (D) {
      var col = new Float32Array(K);
      for (n = 0; n < T; n++) { for (k = 0; k < K; k++) col[k] = D[k * T + n]; med[n] = median(col); }
      if (K > 1) {
        d = '';
        for (n = 1; n <= T; n++) d += (n === 1 ? 'M' : 'L') + X(n / fps).toFixed(1) + ',' + Y(med[n - 1]).toFixed(1);
        s('path', { d: d, fill: 'none', stroke: '#ffffff', 'stroke-width': 4.2, 'stroke-linejoin': 'round', 'stroke-opacity': 0.9 }, svg);
        s('path', { d: d, fill: 'none', stroke: mm.color, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      }
    }
    if (tr) {
      d = '';
      for (n = 1; n <= T; n++) d += (n === 1 ? 'M' : 'L') + X(n / fps).toFixed(1) + ',' + Y(tr[n - 1]).toFixed(1);
      s('path', { d: d, fill: 'none', stroke: REC, 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    }
    C.med = med; C.D = D; C.tr = tr; C.mm = mm;
    C.cursor = s('line', { x1: 0, x2: 0, y1: M.t, y2: M.t + ph, stroke: '#9aa0a6', 'stroke-width': 1, visibility: 'hidden' }, svg);
    C.cross = s('line', { x1: 0, x2: 0, y1: M.t, y2: M.t + ph, stroke: '#5f6368', 'stroke-width': 1, visibility: 'hidden' }, svg);
    C.geo = { W: W, H: H, M: M, pw: pw, ph: ph, n0: 1, n1: T, X: function (nn) { return X(nn / fps); }, inv: function (x) { return (x - M.l) / pw * ts * fps; } };
    C.svg.setAttribute('aria-label', 'Distance of each of the ' + K + ' futures of ' + mm.label + ' to ' + objName(q) + ' over the forecast second, with the recorded distance.');
    C.hover = null;
    C.tip.hidden = true;
  };

  App.prototype.chartHover = function (C, n) {
    if (!C.geo) return;
    if (n == null) { C.hover = null; C.cross.setAttribute('visibility', 'hidden'); C.tip.hidden = true; return; }
    var m = this.m, q = this.q, fps = m.fps, G = C.geo, x = G.X(n);
    C.hover = n;
    C.cross.setAttribute('x1', x); C.cross.setAttribute('x2', x); C.cross.setAttribute('visibility', 'visible');
    clear(C.tip);
    h('div', 'mut', C.tip, 't = ' + sec(n / fps) + ' (frame ' + n + ')');
    function row(val, color, dash, label) {
      var r = h('div', 'row', C.tip);
      h('b', null, r, val);
      r.appendChild(lineKey(color, dash, 16, 2));
      h('span', null, r, label);
    }
    if (C.kind === 'cdf') {
      C.series.forEach(function (sr) { row(sr.F[n].toFixed(2), sr.mm.c2, sr.mm.dash, sr.mm.label); });
      row(q.event && q.tau <= n ? 'yes' : 'not yet', REC, null, 'recorded');
    } else {
      var mm = C.mm, K = mm.K, inside = 0;
      if (C.D) for (var k = 0; k < K; k++) if (C.D[k * m.T + n - 1] < q.delta) inside++;
      if (K > 1) row(C.med[n - 1].toFixed(2) + ' m', mm.color, null, 'median of ' + mm.label);
      else row(C.D ? C.D[n - 1].toFixed(2) + ' m' : '', mm.color, mm.dash, mm.label);
      if (C.tr) row(C.tr[n - 1].toFixed(2) + ' m', REC, null, 'recorded');
      row(inside + '/' + K, mix(mm.color, 0.3), null, 'futures within δ now');
    }
    C.tip.hidden = false;
    var pr = C.plot.getBoundingClientRect(), sc = pr.width / G.W, tw = C.tip.offsetWidth, px = x * sc + 12;
    if (px + tw > pr.width) px = x * sc - 12 - tw;
    C.tip.style.transform = 'translate(' + Math.round(Math.max(0, px)) + 'px,' + Math.round(G.M.t * sc + 4) + 'px)';
  };

  App.prototype.seekFrame = function (n) {          // future frame n (1..T) or 0 = now
    var m = this.m;
    this.pause(true);
    this.st.s = clamp(m.H - 1 + n, 0, m.H + m.T - 1);
    this.requestFrame();
  };

  App.prototype.syncCursors = function () {
    var m = this.m;
    if (!m) return;
    var u = this.st.s - (m.H - 1), charts = [this.ui.cdf].concat(this.ui.dist);
    charts.forEach(function (C) {
      if (!C.cursor || !C.geo) return;
      var n = u * 1;
      var vis = n > 0 && n <= C.geo.n1 + 1e-6;
      if (vis) { var x = C.geo.X(Math.min(n, C.geo.n1)); C.cursor.setAttribute('x1', x); C.cursor.setAttribute('x2', x); }
      C.cursor.setAttribute('visibility', vis ? 'visible' : 'hidden');
    });
  };

  // ---------------------------------------------------------------- playback
  App.prototype.setupScrubber = function () {
    var m = this.m, ui = this.ui, S = m.H + m.T - 1;
    ui.range.max = String(S);
    function pos(i) { return 'calc(7px + (100% - 14px) * ' + (i / S).toFixed(5) + ')'; }
    ui.trackH.style.left = pos(0);
    ui.trackH.style.width = 'calc((100% - 14px) * ' + ((m.H - 1) / S).toFixed(5) + ')';
    ui.trackF.style.left = pos(m.H - 1);
    ui.trackF.style.right = '7px';
    ui.markNow.style.left = pos(m.H - 1);
    clear(ui.ticks);
    var a = h('span', null, ui.ticks, '−' + num(m.H / m.fps) + ' s'); a.style.left = '0'; a.style.transform = 'none';
    var b = h('span', null, ui.ticks, 'now'); b.style.left = pos(m.H - 1);
    var c = h('span', null, ui.ticks, '+' + num(m.T / m.fps) + ' s'); c.style.right = '0'; c.style.left = 'auto'; c.style.transform = 'none';
    this.placeHMark();
  };
  App.prototype.placeHMark = function () {
    var m = this.m, q = this.q, ui = this.ui, S = m.H + m.T - 1;
    if (!q || q.hF >= m.T) { ui.markH.hidden = true; return; }
    ui.markH.hidden = false;
    ui.markH.style.left = 'calc(7px + (100% - 14px) * ' + ((m.H - 1 + q.hF) / S).toFixed(5) + ')';
    ui.markH.title = 'horizon h';
  };

  App.prototype.setPlayIcon = function () {
    var b = this.ui.play;
    clear(b);
    var g = s('svg', { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': 'true' }, b);
    if (this.st.playing) { s('rect', { x: 3, y: 2.5, width: 3, height: 9, fill: '#2f2f2f' }, g); s('rect', { x: 8, y: 2.5, width: 3, height: 9, fill: '#2f2f2f' }, g); }
    else s('path', { d: 'M4 2.2 L12 7 L4 11.8 Z', fill: '#2f2f2f' }, g);
    b.setAttribute('aria-label', this.st.playing ? 'Pause' : 'Play');
  };
  App.prototype.play = function (user) {
    if (!this.m) return;
    var S = this.m.H + this.m.T - 1;
    if (this.st.s >= S - 1e-6) this.st.s = 0;
    this.st.playing = true;
    this.st.hold = 0;
    if (user) this.st.userPaused = false;
    this.lastNow = 0;
    this.setPlayIcon();
    this.requestFrame();
  };
  App.prototype.pause = function (user) {
    if (user) this.st.userPaused = true;
    if (!this.st.playing) return;
    this.st.playing = false;
    this.st.hold = 0;
    this.setPlayIcon();
  };
  App.prototype.requestFrame = function () {
    if (this.raf) return;
    var self = this;
    this.raf = global.requestAnimationFrame(function (now) { self.raf = 0; self.frame(now); });
  };
  App.prototype.frame = function (now) {
    var st = this.st, m = this.m;
    if (!m) return;
    var S = m.H + m.T - 1;
    if (st.playing) {
      var dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
      this.lastNow = now;
      if (st.hold > 0) { st.hold -= dt; if (st.hold <= 0) { st.hold = 0; st.s = 0; } }
      else { st.s += dt * m.fps * st.speed; if (st.s >= S) { st.s = S; st.hold = 1.2; } }
      this.requestFrame();
    } else this.lastNow = 0;
    var v = this.viewer;
    if (v && v.model === m && v.q) {
      v.update(st.s);
      if (v.dirty) v.render();
    }
    this.syncTime();
  };
  App.prototype.syncTime = function () {
    var m = this.m, ui = this.ui, fr = Math.round(this.st.s);
    if (String(fr) !== ui.range.value) ui.range.value = String(fr);
    var t = (this.st.s - (m.H - 1)) / m.fps;
    ui.time.textContent = sec(Math.round(t * m.fps) / m.fps);
    ui.range.setAttribute('aria-valuetext', ui.time.textContent);
    this.syncCursors();
  };

  // ---------------------------------------------------------------- visibility and size
  App.prototype.observe = function () {
    var self = this, root = this.root;
    if ('IntersectionObserver' in global) {
      new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        self.visible = e.isIntersecting && e.intersectionRatio >= 0.3;
        if (self.visible) { if (self.autoplay && !self.st.userPaused && !self.st.playing && self.m) self.play(false); }
        else if (self.st.playing) self.pause(false);
      }, { threshold: [0, 0.3, 0.6] }).observe(this.ui.view);
    } else this.visible = true;
    var raf = 0, lastW = -1;
    function onResize() {
      if (raf) return;
      raf = global.requestAnimationFrame(function () {
        raf = 0;
        var w = root.clientWidth;
        if (Math.abs(w - lastW) < 1) return;
        lastW = w;
        self.narrow = w < 640;
        root.classList.toggle('is-narrow', self.narrow);
        if (self.viewer) self.viewer.layout(self.narrow ? 'stack' : 'side');
        if (self.m && self.q) { self.renderLabels(); self.renderCharts(); }
        self.requestFrame();
      });
    }
    this.narrow = root.clientWidth < 640;
    root.classList.toggle('is-narrow', this.narrow);
    if ('ResizeObserver' in global) new ResizeObserver(onResize).observe(root);
    else global.addEventListener('resize', onResize);
  };

  App.prototype.api = function () {
    var self = this;
    return {
      selectWindow: function (id, qid, time) { self.selectWindow(id, qid, time); },
      selectQuestion: function (qid) { var q = self.m && self.m.qById[qid]; if (q && q.ok) self.selectQuestion(q); },
      setCompare: function (key) { self.setCompare(key); },
      play: function () { self.play(true); },
      pause: function () { self.pause(true); },
      seek: function (seconds) { if (self.m) { self.pause(true); self.st.s = clamp(self.m.H - 1 + seconds * self.m.fps, 0, self.m.H + self.m.T - 1); self.requestFrame(); } },
      state: function () {
        var m = self.m, q = self.q;
        return m && q ? { window: m.id, question: q.id, compare: self.panelKeys()[1], time: (self.st.s - (m.H - 1)) / m.fps, playing: self.st.playing,
          zup: m.zup, webgl: !!self.viewer, p: m.methods.map(function (mm) { return [mm.key, mm.count[q.i], mm.K]; }), tau: q.tau } : null;
      }
    };
  };

  function init(container, options) {
    options = options || {};
    var index = options.index || global.DMFX_INDEX;
    if (!container) throw new Error('DMFExplorer.init: no container element');
    if (!index || !index.length) {
      container.classList.add('dmfx');
      h('p', 'dmfx-fail', container, 'The explorer needs data/explorer/index.js, which is not loaded.');
      return null;
    }
    return new App(container, index, options).api();
  }

  global.DMFExplorer = { init: init };
})(window);
