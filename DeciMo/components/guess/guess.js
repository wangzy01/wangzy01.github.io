/* "Which person steps in?" Requires window.DMF_GUESS (data/guess_harper.js).
   Usage: DMFGuess.init(document.getElementById('guess'), {base: ''})  -- base: path prefix of videos/ (page folder). */
(function () {
  'use strict';
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function fmt(p) { return p.toFixed(2); }

  function init(root, opts) {
    const D = window.DMF_GUESS;
    if (!root || !D) return;
    const base = (opts && opts.base) || '';
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cur = 0;
    const picks = {};                     // round index -> 'A' | 'B'
    root.classList.add('guess');
    root.innerHTML = '';
    const top = el('div', {class: 'guess-top'});
    const rb = el('div', {class: 'guess-rounds', role: 'group', 'aria-label': 'Rounds'});
    const score = el('div', {class: 'guess-score', 'aria-live': 'polite'});
    top.append(rb, score);
    const stage = el('div', {class: 'guess-stage'});
    const video = el('video', {muted: '', playsinline: '', preload: 'metadata', width: '1920', height: '1080', controls: ''});
    video.muted = true;                   // 16:9, no layout shift; native controls to pause and scrub (author 2026-10-23)
    stage.append(video);
    // replay controls under the video (author 2026-10-23: the clips must be easy to watch again and again)
    const ctl = el('div', {class: 'guess-ctl', role: 'group', 'aria-label': 'Replay'});
    const bReplay = el('button', {type: 'button', class: 'guess-replay'}, '<span aria-hidden="true">&#8635;</span> Replay the history');
    const bHist = el('button', {type: 'button', class: 'guess-replay', hidden: ''}, '<span aria-hidden="true">&#8634;</span> Watch the history again');
    ctl.append(bReplay, bHist);
    // shown with the reveal, right under the video: every colored skeleton is a forecast future
    const key = el('div', {class: 'guess-key', hidden: ''},
      '<span><i class="sw h"></i>last observed</span><span><i class="sw r"></i>recorded future</span>' +
      '<span class="lead-in">Every colored skeleton is one forecast future of DeciMo:</span>' +
      '<span><i class="sw y"></i>enters 0.2&nbsp;m within 1&nbsp;s</span><span><i class="sw n"></i>does not</span>');
    const ask = el('div', {class: 'guess-ask'});
    ask.append(el('span', {class: 'q'}, D.question.replace('the person', 'person A or B')));
    const pick = el('div', {class: 'guess-pick'});
    const bA = el('button', {type: 'button'}, 'A steps in');
    const bB = el('button', {type: 'button'}, 'B steps in');
    pick.append(bA, bB);
    ask.append(pick);
    const res = el('div', {class: 'guess-result', hidden: ''});
    // two columns when the game is wide enough (guess.css, container query): the video and its legend on the left; the
    // rounds, the question, the answers and the reveal on the right, so that a round fits one screen
    const main = el('div', {class: 'guess-main'}), side = el('div', {class: 'guess-side'}), wrap = el('div', {class: 'guess-in'});
    main.append(stage, ctl, key);
    side.append(top, ask, res);
    wrap.append(main, side);
    root.append(wrap);
    const btns = D.rounds.map((r, i) => {
      const b = el('button', {type: 'button'}, 'Round ' + r.round);
      b.addEventListener('click', () => show(i));
      rb.append(b);
      return b;
    });

    let part = 'history';
    function setVideo(r, p_, play) {
      part = p_;
      const mp4 = base + (part === 'history' ? r.history : r.reveal);
      const webm = base + (part === 'history' ? r.history_webm : r.reveal_webm);
      video.innerHTML = '';
      video.append(el('source', {src: webm, type: 'video/webm'}), el('source', {src: mp4, type: 'video/mp4'}));
      video.loop = part === 'history';           // the observed second loops; the reveal plays once
      // posters follow videos/posters/<name>.jpg; the reveal poster shows the outcome, so it is set only after a guess
      const poster = part === 'history' ? r.poster : r.reveal.replace(/^videos\//, 'videos/posters/').replace(/\.mp4$/, '.jpg');
      video.setAttribute('poster', base + poster);
      key.hidden = part === 'history';
      video.load();
      if (play === undefined ? !reduce : play) { const pr = video.play(); if (pr && pr.catch) pr.catch(() => {}); }
      // the replay buttons follow the state: before an answer, the history; after it, the forecast and the history
      const answered = cur in picks;
      bReplay.innerHTML = '<span aria-hidden="true">&#8635;</span> ' + (answered && part === 'reveal' ? 'Replay the forecast' :
        answered ? 'Show the forecast again' : 'Replay the history');
      bReplay.setAttribute('aria-label', bReplay.textContent.replace(/^\W+/, ''));
      bHist.hidden = !(answered && part === 'reveal');
    }
    function replay() {
      const r = D.rounds[cur];
      if ((cur in picks) && part !== 'reveal') { setVideo(r, 'reveal', true); return; }
      video.currentTime = 0;
      const pr = video.play(); if (pr && pr.catch) pr.catch(() => {});
    }
    bReplay.addEventListener('click', replay);
    bHist.addEventListener('click', () => setVideo(D.rounds[cur], 'history', true));
    function updateScore() {
      const n = Object.keys(picks).length;
      const ok = Object.keys(picks).filter(i => picks[i] === D.rounds[i].answer).length;
      score.textContent = n ? ('Your guesses: ' + ok + ' of ' + n + ' right') : '';
      btns.forEach((b, i) => {
        b.setAttribute('aria-current', i === cur ? 'true' : 'false');
        b.innerHTML = 'Round ' + D.rounds[i].round + (i in picks ? '<span class="done">' +
          (picks[i] === D.rounds[i].answer ? '✓' : '✗') + '</span>' : '');
      });
    }
    function show(i) {
      cur = i;
      const r = D.rounds[i];
      if (i in picks) { reveal(i, false); } else {
        res.hidden = true;
        bA.disabled = bB.disabled = false;
        root.classList.remove('is-answered');
        setVideo(r, 'history');
      }
      updateScore();
    }
    function bar(p, color, truth) {   // the value sits inside a long bar (white) and right after a short one
      const inside = p > 0.3, at = inside ? '6px' : 'calc(' + (100 * p).toFixed(1) + '% + 6px)';
      return '<div class="guess-bar' + (truth ? ' truth' : '') + '"><span style="width:' + (100 * p).toFixed(1) +
        '%;background:' + color + '"></span><em style="left:' + at + (inside ? ';color:#fff' : '') + '">' + fmt(p) + '</em></div>';
    }
    function reveal(i, play) {
      const r = D.rounds[i];
      const mine = picks[i];
      bA.disabled = bB.disabled = true;
      root.classList.add('is-answered');
      setVideo(r, 'reveal', play ? true : undefined);   // answering is a user action: the reveal plays
      const win = r.answer, other = win === 'A' ? 'B' : 'A';
      const t = r[win].time_s;
      let html = '<div class="guess-verdict">' + (mine === win ? '<b>Right.</b> ' : '<b>Not this time.</b> ') +
        'Person ' + win + ' came within 0.2 m after ' + t.toFixed(2) + ' s, and person ' + other + ' did not. ' +
        'Forecast probability of an entry:</div><div class="guess-table" role="table">' +
        '<span class="h" role="columnheader"></span><span class="h" role="columnheader">A</span>' +
        '<span class="h" role="columnheader">B</span>';
      D.methods.forEach(m => {
        html += '<span class="m" style="color:' + m.color + '">' + m.name + '</span>' +
          bar(r.A.p[m.key].p, m.color, win === 'A') + bar(r.B.p[m.key].p, m.color, win === 'B');
      });
      html += '</div><div class="guess-note">Outlined: the person who stepped in. ' + D.note + '</div>';
      if (i < D.rounds.length - 1) html += '<button type="button" class="guess-next">Next round</button>';
      res.innerHTML = html;
      res.hidden = false;
      const nx = res.querySelector('.guess-next');
      if (nx) nx.addEventListener('click', () => show(i + 1));
      updateScore();
    }
    bA.addEventListener('click', () => { picks[cur] = 'A'; reveal(cur, true); });
    bB.addEventListener('click', () => { picks[cur] = 'B'; reveal(cur, true); });
    show(0);
  }
  window.DMFGuess = {init: init};
})();
