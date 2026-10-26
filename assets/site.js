(() => {
  'use strict';

  const VIDEO_URL = 'assets/video/hero-scrub.mp4';
  const VIDEO_BYTES = 7805399;
  const POSTER_URL = 'assets/img/hero-poster.jpg';
  const PHONE = '79362845488';

  // Hero timeline in scroll progress (0..1 through the pinned hero).
  const INTRO_END = 0.15;   // flying through the lens
  const VSTART = 0.08;      // the footage starts moving once you are partly through
  const SHUT = { a: 0.49, c1: 0.515, c2: 0.565, b: 0.59 };   // shutter blink over the photo change

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const easeOutBack = t => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const vt = p => clamp((p - VSTART) / (1 - VSTART), 0, 1);
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const fineMQ = matchMedia('(pointer: fine)');

  function rng(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }

  /* ---------- rich text: {words} are set in the italic accent face ---------- */
  const plain = str => str.replace(/[{}]/g, '');
  function parseRich(str) {
    const out = [];
    const re = /\{([^}]*)\}/g;
    let last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) out.push({ t: str.slice(last, m.index), em: false });
      out.push({ t: m[1], em: true });
      last = re.lastIndex;
    }
    if (last < str.length) out.push({ t: str.slice(last), em: false });
    return out;
  }
  function setRich(el, str) {
    el.textContent = '';
    for (const seg of parseRich(str)) {
      if (seg.em) { const e = document.createElement('em'); e.textContent = seg.t; el.appendChild(e); }
      else el.appendChild(document.createTextNode(seg.t));
    }
  }
  // Words as lists of runs, so "{сцену}." stays one word with an accented run and a plain run.
  function tokenize(str) {
    const words = [];
    let cur = [];
    for (const seg of parseRich(str)) {
      for (const part of seg.t.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { if (cur.length) { words.push(cur); cur = []; } }
        else cur.push({ t: part, em: seg.em });
      }
    }
    if (cur.length) words.push(cur);
    return words;
  }

  /* ---------- text splitting (seeded, rebuilt on language change) ---------- */
  function buildVisual(text, fx, rand, spread) {
    const vis = document.createElement('span');
    vis.setAttribute('aria-hidden', 'true');
    const words = tokenize(text);
    const totalChars = words.reduce((n, w) => n + w.reduce((m, r) => m + r.t.length, 0), 0);
    let ci = 0;
    words.forEach((runs, wi) => {
      const w = document.createElement('span');
      w.className = 'w';
      if (fx === 'depth' || fx === 'rise') w.style.setProperty('--th', (wi / Math.max(1, words.length) * 0.5 + rand() * 0.05).toFixed(3));
      for (const run of runs) {
        let host = w;
        if (run.em) { host = document.createElement('span'); host.className = 'acc'; w.appendChild(host); }
        for (const ch of run.t) {
          const c = document.createElement('span');
          c.className = 'c';
          c.textContent = ch;
          if (fx === 'snap') {
            c.style.setProperty('--th', (ci / Math.max(1, totalChars) * spread + rand() * 0.06).toFixed(3));
            c.style.setProperty('--jx', ((rand() < 0.5 ? -1 : 1) * (18 + rand() * 40)).toFixed(1) + 'px');
          }
          ci++;
          host.appendChild(c);
        }
      }
      vis.appendChild(w);
      if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
    });
    return vis;
  }

  function splitEl(el, idx) {
    const text = el.dataset.text || el.textContent.trim();
    el.dataset.text = text;
    const band = el.closest('.band');
    const fx = band ? band.dataset.fx : '';
    const spread = band && band.dataset.spread ? parseFloat(band.dataset.spread) : 0.55;
    el.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'sr';
    sr.textContent = plain(text);
    el.appendChild(sr);
    if (fx === 'focus') {
      const wrap = document.createElement('span');
      wrap.className = 'focus-wrap';
      wrap.setAttribute('aria-hidden', 'true');
      const soft = buildVisual(text, fx, rng(101 + idx), spread); soft.classList.add('soft');
      const sharp = buildVisual(text, fx, rng(101 + idx), spread); sharp.classList.add('sharp');
      wrap.append(soft, sharp);
      el.appendChild(wrap);
    } else {
      el.appendChild(buildVisual(text, fx, rng(101 + idx), spread));
    }
  }

  /* ---------- SVG helpers: the iris and the lens barrel ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  let uid = 0;

  // Seven straight blades; each covers a half-plane whose inner edge sits at distance d
  // from the centre, so the opening is a heptagon. d <= 0 is closed, d >= 100 is wide open.
  function buildIris(svg, clip) {
    const N = 7, id = 'ir' + (++uid);
    svg.setAttribute('viewBox', '-100 -100 200 200');
    const defs = svgEl('defs', {}, svg);
    const lg = svgEl('linearGradient', { id: id + 'g', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svgEl('stop', { offset: 0, 'stop-color': '#262e4a' }, lg);
    svgEl('stop', { offset: 0.16, 'stop-color': '#10131f' }, lg);
    svgEl('stop', { offset: 1, 'stop-color': '#040509' }, lg);
    let root = svg;
    if (clip) {
      const cp = svgEl('clipPath', { id: id + 'c' }, defs);
      svgEl('circle', { r: 100 }, cp);
      root = svgEl('g', { 'clip-path': `url(#${id}c)` }, svg);
    }
    const blades = [], edges = [];
    for (let i = 0; i < N; i++) {
      const g = svgEl('g', {}, root);
      blades.push({ g, r: svgEl('rect', { x: -260, y: 0, width: 520, height: 420, fill: `url(#${id}g)` }, g) });
    }
    for (let i = 0; i < N; i++) {
      const g = svgEl('g', {}, root);
      edges.push({ g, l: svgEl('line', { x1: 0, y1: 0, x2: 260, y2: 0, stroke: 'rgba(170,186,240,.34)', 'stroke-width': 0.7 }, g) });
    }
    if (clip) svgEl('circle', { r: 99.4, fill: 'none', stroke: 'rgba(0,0,0,.65)', 'stroke-width': 1.4 }, svg);
    let lastD = null;
    return function setIris(d) {
      d = Math.round(d * 10) / 10;
      if (d === lastD) return;
      lastD = d;
      const twist = 14 + (1 - clamp(d / 100, 0, 1)) * 52;
      const half = Math.max(0, d) * Math.tan(Math.PI / N);
      for (let i = 0; i < N; i++) {
        const t = `rotate(${(i * 360 / N + twist).toFixed(2)})`;
        blades[i].g.setAttribute('transform', t);
        blades[i].r.setAttribute('y', d);
        edges[i].g.setAttribute('transform', t);
        edges[i].l.setAttribute('x1', (-half).toFixed(2));
        edges[i].l.setAttribute('y1', d);
        edges[i].l.setAttribute('y2', d);
      }
    };
  }

  function buildBarrel(svg) {
    svg.setAttribute('viewBox', '-100 -100 200 200');
    svg.setAttribute('class', 'barrel');
    const id = 'br' + (++uid);
    const rot = { transform: 'rotate(-90)' };
    svgEl('circle', Object.assign({ r: 99, fill: 'none', stroke: 'rgba(236,233,228,.62)', 'stroke-width': 1.1, pathLength: 1, class: 'draw' }, rot), svg);
    svgEl('circle', Object.assign({ r: 92.5, fill: 'none', stroke: 'rgba(236,233,228,.2)', 'stroke-width': 0.7, pathLength: 1, class: 'draw d2' }, rot), svg);
    svgEl('circle', Object.assign({ r: 80.8, fill: 'none', stroke: 'rgba(236,233,228,.5)', 'stroke-width': 1, pathLength: 1, class: 'draw d3' }, rot), svg);
    let d = '';
    for (let a = 0; a < 360; a += 5) {
      const len = a % 30 === 0 ? 5.2 : 2.8, rad = a * Math.PI / 180, s = Math.sin(rad), c = -Math.cos(rad);
      d += `M${(93.6 * s).toFixed(2)} ${(93.6 * c).toFixed(2)}L${((93.6 + len) * s).toFixed(2)} ${((93.6 + len) * c).toFixed(2)}`;
    }
    svgEl('path', { d, stroke: 'rgba(236,233,228,.42)', 'stroke-width': 0.6, class: 'ticks' }, svg);
    const defs = svgEl('defs', {}, svg);
    svgEl('path', { id: id + 'p', d: 'M0 -86.4A86.4 86.4 0 1 1 0 86.4A86.4 86.4 0 1 1 0 -86.4' }, defs);
    const text = svgEl('text', { class: 'engr', 'font-size': 5.3, fill: 'rgba(236,233,228,.6)', 'letter-spacing': 0.9, style: "font-family:'JetBrains Mono',monospace" }, svg);
    const tp = svgEl('textPath', { href: '#' + id + 'p', textLength: (2 * Math.PI * 86.4 * 0.985).toFixed(1), lengthAdjust: 'spacing' }, text);
    tp.textContent = 'CORREA JR FILMS · 35 mm 1:1.4 · MOSCOW · Ø 77 mm · ВИДЕО И ФОТО ·';
    svgEl('circle', { cx: 0, cy: -96.3, r: 1.7, fill: '#4a77ff', class: 'idx' }, svg);
  }

  const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
  function fStop(d) {
    if (d <= 3) return 'f/22';
    const f = 1.4 * 100 / Math.min(100, d);
    let best = 22;
    for (const s of STOPS) if (Math.abs(Math.log(s / f)) < Math.abs(Math.log(best / f))) best = s;
    return 'f/' + best;
  }

  /* ---------- the lens: wordmark with an iris for the O ---------- */
  function createLens(rig, ap) {
    const apIn = ap.firstElementChild;
    const mk = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
    const group = mk('div', 'lens-group', rig);
    const iris = svgEl('svg', { class: 'lens-iris' }, group);
    const setIris = buildIris(iris, true);
    const glass = mk('div', 'lens-glass', group);
    mk('i', '', glass);
    const wm = mk('div', 'wm', group);
    const row = mk('div', 'wm-row', wm);
    const letter = (ch, i) => { const l = mk('span', 'wm-l', row); const s = mk('span', '', l); s.textContent = ch; s.style.setProperty('--i', i); };
    letter('C', 0);
    const wmO = mk('span', 'wm-o', row);
    buildBarrel(svgEl('svg', {}, wmO));
    const fEl = mk('span', 'wm-f', wmO);
    fEl.textContent = 'f/22';
    ['R', 'R', 'E', 'A'].forEach((ch, i) => letter(ch, i + 2));
    const jr = mk('em', 'wm-jr', row); jr.textContent = 'Jr';
    const kicker = mk('p', 'wm-kicker', wm); kicker.dataset.i18n = 'hero.kicker';
    const cue = mk('p', 'wm-cue', wm);
    const cueText = mk('span', '', cue); cueText.dataset.i18n = 'hero.cue';
    mk('i', '', cue);

    let zmax = 1;
    const last = { z: -1, wo: -1, go: -1, off: null, f: '', iris: null, closed: null };
    function layout() {
      const prev = group.style.transform;
      group.style.transform = 'none';
      const gr = group.getBoundingClientRect();
      const o = wmO.getBoundingClientRect();
      if (gr.width && o.width) {
        const hx = o.left + o.width / 2 - gr.left;
        const hy = o.top + o.height / 2 - gr.top;
        const hr = o.width / 2 * 0.806;
        group.style.setProperty('--hx', hx.toFixed(1) + 'px');
        group.style.setProperty('--hy', hy.toFixed(1) + 'px');
        group.style.setProperty('--hr', hr.toFixed(1) + 'px');
        group.style.transformOrigin = `${hx.toFixed(1)}px ${hy.toFixed(1)}px`;
        ap.style.setProperty('--apx', (hx - hr).toFixed(1) + 'px');
        ap.style.setProperty('--apy', (hy - hr).toFixed(1) + 'px');
        ap.style.setProperty('--apd', (hr * 2).toFixed(1) + 'px');
        ap.style.setProperty('--apw', gr.width.toFixed(1) + 'px');
        ap.style.setProperty('--aph', gr.height.toFixed(1) + 'px');
        apIn.style.transformOrigin = `${hx.toFixed(1)}px ${hy.toFixed(1)}px`;
        zmax = Math.hypot(Math.max(hx, gr.width - hx), Math.max(hy, gr.height - hy)) / hr * 1.04;
      }
      group.style.transform = prev;
      last.z = -1;
    }
    function set(q, dRest) {
      const z = Math.pow(zmax, smoothstep(q, 0.22, 1));
      const closed = q < 0.999;
      if (closed !== last.closed) {
        last.closed = closed; last.z = -1;
        ap.classList.toggle('closed', closed);
        if (!closed) { ap.style.transform = ''; apIn.style.transform = ''; }
      }
      if (closed && Math.abs(z - last.z) > 0.0008) {
        last.z = z;
        group.style.transform = `translate3d(0,0,0) scale(${z.toFixed(4)})`;
        ap.style.transform = `translate3d(0,0,0) scale(${z.toFixed(4)})`;
        apIn.style.transform = `translate3d(0,0,0) scale(${(1 / z).toFixed(5)})`;
      }
      // Each piece is hidden as soon as it is fully faded, so the compositor stops drawing it.
      const wo = +(1 - smoothstep(q, 0.26, 0.58)).toFixed(3);
      if (wo !== last.wo) { last.wo = wo; wm.style.opacity = wo; wm.style.visibility = wo > 0 ? '' : 'hidden'; }
      const go = +(1 - smoothstep(q, 0.3, 0.62)).toFixed(3);
      if (go !== last.go) { last.go = go; glass.style.opacity = go; glass.style.visibility = go > 0 ? '' : 'hidden'; }
      const d = dRest + (104 - dRest) * smoothstep(q, 0, 0.36);
      const irisOn = d < 100.5;
      if (irisOn !== last.iris) { last.iris = irisOn; iris.style.visibility = irisOn ? '' : 'hidden'; }
      if (irisOn) setIris(d);
      const f = fStop(d);
      if (f !== last.f) { last.f = f; fEl.textContent = f; }
      const off = q >= 0.999;
      if (off !== last.off) { last.off = off; rig.classList.toggle('off', off); }
    }
    return { layout, set };
  }

  /* ---------- i18n ---------- */
  const DICT = window.I18N || {};
  let lang = 'ru';
  function readLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && DICT[q]) return q;
    try { const s = localStorage.getItem('jr-lang'); if (s && DICT[s]) return s; } catch (e) {}
    return 'ru';
  }

  // Manifesto: one span per word, lit as the reader moves down the page.
  const mfEl = $('.mf-text');
  let mfWords = [], mfCache = [];
  function buildManifesto(str) {
    mfEl.textContent = '';
    tokenize(str).forEach((runs, i, all) => {
      const w = document.createElement('span');
      w.className = 'mw';
      for (const run of runs) {
        if (run.em) { const e = document.createElement('em'); e.textContent = run.t; w.appendChild(e); }
        else w.appendChild(document.createTextNode(run.t));
      }
      mfEl.appendChild(w);
      if (i < all.length - 1) mfEl.appendChild(document.createTextNode(' '));
    });
    mfWords = $$('.mw', mfEl);
    mfCache = mfWords.map(() => -1);
    updateManifesto();
  }
  function updateManifesto() {
    if (!mfWords.length) return;
    const r = mfEl.getBoundingClientRect(), vh = innerHeight;
    if (r.bottom < -vh || r.top > vh * 2) return;
    const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.25), 0, 1);
    const n = mfWords.length;
    mfWords.forEach((w, i) => {
      const v = Math.round((0.16 + 0.84 * clamp(p * (n + 2) - i, 0, 1)) * 100) / 100;
      if (v !== mfCache[i]) { mfCache[i] = v; w.style.setProperty('--o', v); }
    });
  }

  function applyLang(l, save) {
    const d = DICT[l];
    if (!d) return;
    lang = l;
    document.documentElement.lang = l;
    document.title = d._title;
    const md = $('meta[name="description"]'); if (md) md.setAttribute('content', d._desc);
    $$('[data-i18n]').forEach(el => {
      const v = d[el.dataset.i18n];
      if (v == null) return;
      if (el.classList.contains('split')) el.dataset.text = v;
      else if (el === mfEl) buildManifesto(v);
      else if (v.includes('{')) setRich(el, v);
      else el.textContent = v;
    });
    $$('.split').forEach((el, i) => splitEl(el, i));
    $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    const wa = $('#wa'); if (wa) wa.href = 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(d._wa);
    refreshReelLabels();
    if (save) { try { localStorage.setItem('jr-lang', l); } catch (e) {} }
    bands.forEach(b => { b.op = -1; b.k = -1; b.ks = -1; b.kb = -1; });
    if (scrubOn) updateCaptions(shown, performance.now());
    requestAnimationFrame(() => { if (lensD) lensD.layout(); if (lensM) lensM.layout(); if (scrubOn) updateIntro(shown); });
  }

  /* ---------- hero scrub ---------- */
  const hero = $('#hero');
  const stage = $('.stage');
  const video = $('#hero-video');
  const posterLayer = $('.poster');
  const ring = $('.ring');
  const tcEl = $('#tc');
  const shutterSvg = $('.shutter');
  const flashEl = $('.flash');
  const bands = $$('.band').map((el, i, all) => ({
    el, a: parseFloat(el.dataset.a), b: parseFloat(el.dataset.b),
    ramp: el.dataset.ramp ? parseFloat(el.dataset.ramp) : null,
    last: i === all.length - 1, fx: el.dataset.fx, op: -1, k: -1, ks: -1, kb: -1
  }));
  const lensD = createLens($('.stage .lens-rig'), $('.stage .ap'));
  const lensM = createLens($('.static-hero .lens-rig'), $('.static-hero .ap'));
  const setShutter = buildIris(shutterSvg, false);
  shutterSvg.setAttribute('preserveAspectRatio', 'xMidYMid slice');

  let heroOnScreen = true;
  let target = 0, shown = 0, rafId = null, lastTick = 0;
  let loadK = 0, loadStart = 0;
  let seekBusy = false, pendingTime = null;
  let scrubOn = false, heroInit = false;

  function heroProgress() {
    const r = hero.getBoundingClientRect();
    const range = hero.offsetHeight - innerHeight;
    return range > 0 ? clamp(-r.top / range, 0, 1) : 0;
  }

  function requestSeek(t) {
    if (!video.duration) return;
    if (seekBusy) { pendingTime = t; return; }
    seekBusy = true;
    video.currentTime = t;
  }
  video.addEventListener('seeked', () => {
    seekBusy = false;
    if (pendingTime !== null) { const t = pendingTime; pendingTime = null; requestSeek(t); }
  });
  video.addEventListener('error', () => { seekBusy = false; pendingTime = null; failVideo(); });

  function setVar(el, name, v, cacheObj, key) {
    if (cacheObj[key] === v) return;
    if (Math.abs(cacheObj[key] - v) < 0.008 && v !== 0 && v !== 1) return;
    cacheObj[key] = v;
    el.style.setProperty(name, v.toFixed(3));
  }

  function updateCaptions(p, now) {
    for (const b of bands) {
      const len = b.b - b.a;
      const f = Math.min(0.02, len / 3);
      const inE = smoothstep(p, b.a, b.a + f);
      const outE = b.last ? 1 : 1 - smoothstep(p, b.b - f, b.b);
      const op = p < b.a || (p > b.b && !b.last) ? 0 : inE * outE;
      if (Math.abs(op - b.op) > 0.004 || (op === 0 && b.op !== 0) || (op === 1 && b.op !== 1)) {
        b.op = op;
        b.el.style.opacity = op.toFixed(3);
        b.el.style.visibility = op <= 0 ? 'hidden' : 'visible';
      }
      const ramp = b.ramp || Math.min(0.025, len * 0.35) * (b.fx === 'rise' ? 2.2 : 1.6);
      const k = clamp((p - b.a) / ramp, 0, 1);
      setVar(b.el, '--k', k, b, 'k');
      if (b.fx === 'rise') {
        setVar(b.el, '--ks', clamp((k - 0.66) * 4, 0, 1), b, 'ks');
        setVar(b.el, '--kb', clamp((k - 0.78) * 5, 0, 1), b, 'kb');
      }
    }
    updateTC(now);
  }

  let lastTC = '', lastTCAt = 0;
  function updateTC(now) {
    if (!tcEl || now - lastTCAt < 100) return;
    const t = (video.duration || 11.5) * vt(shown);
    const s = Math.floor(t), fr = Math.floor((t - s) * 25);
    const str = '00:00:' + String(s).padStart(2, '0') + ':' + String(fr).padStart(2, '0');
    if (str === lastTC) return;
    lastTC = str; lastTCAt = now; tcEl.textContent = str;
  }

  let insideState = null;
  function updateIntro(p) {
    lensD.set(clamp(p / INTRO_END, 0, 1), 34 * easeOutBack(loadK));
    const inside = p > INTRO_END * 0.9;
    if (inside !== insideState) { insideState = inside; stage.classList.toggle('inside', inside); }
  }

  let shutVis = null, lastFlash = -1;
  function updateShutter(p) {
    const inWin = p > SHUT.a && p < SHUT.b;
    if (inWin !== shutVis) { shutVis = inWin; shutterSvg.style.visibility = inWin ? 'visible' : 'hidden'; }
    if (inWin) {
      const k = smoothstep(p, SHUT.a, SHUT.c1) * (1 - smoothstep(p, SHUT.c2, SHUT.b));
      setShutter(160 * (1 - k) - 6 * k);
    }
    const fl = +(0.3 * smoothstep(p, SHUT.c2 - 0.004, SHUT.c2 + 0.004) * (1 - smoothstep(p, SHUT.c2 + 0.004, SHUT.b))).toFixed(3);
    if (fl !== lastFlash) { lastFlash = fl; flashEl.style.opacity = fl; }
  }

  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    if (loadK < 1) loadK = clamp((now - loadStart) / 1700, 0, 1);
    const k = 0.14;
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
    const converged = Math.abs(target - shown) < 0.0005 && loadK >= 1;
    if (converged) shown = target;
    requestSeek(vt(shown) * (video.duration || 0));
    updateCaptions(shown, now);
    updateIntro(shown);
    updateShutter(shown);
    if (converged) { rafId = null; lastTick = 0; }
    else rafId = requestAnimationFrame(tick);
  }

  let lateState = null;
  function onScroll() {
    target = heroProgress();
    if (stage.classList.contains('video-failed')) {
      const late = target > 0.5;
      if (late !== lateState) { lateState = late; stage.classList.toggle('late', late); }
    }
    if (rafId === null && heroOnScreen && scrubOn) rafId = requestAnimationFrame(tick);
  }

  function makeChevron() {
    const s = svgEl('svg', { viewBox: '0 0 24 24', class: 'chev', 'aria-hidden': 'true' });
    svgEl('path', { d: 'M5 9l7 7 7-7', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, s);
    return s;
  }
  function failVideo() {
    if (stage.classList.contains('video-failed')) return;
    if (ring && ring.parentNode) ring.replaceWith(makeChevron());
    stage.classList.add('video-failed');
    const pe = $('.poster-end');
    if (pe) pe.style.backgroundImage = "url('assets/img/hero-ending.jpg')";
    lateState = null; onScroll();
  }

  async function loadHeroBlob() {
    const ctrl = new AbortController();
    let watchdog = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error('video ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0, lastRing = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ctrl.abort(), 20000);
      chunks.push(value);
      got += value.length;
      const frac = Math.min(1, got / total);
      const now = performance.now();
      if (now - lastRing > 100 || frac === 1) { lastRing = now; ring.style.setProperty('--ld', Math.round(126 * (1 - frac))); }
    }
    clearTimeout(watchdog);
    ring.style.setProperty('--ld', 0);
    video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    video.load();
    video.addEventListener('canplay', () => {
      requestSeek(vt(heroProgress()) * video.duration);
      stage.classList.add('video-ready');
    }, { once: true });
  }

  function initHeroOnce() {
    if (heroInit) return;
    heroInit = true;
    posterLayer.style.backgroundImage = "url('" + POSTER_URL + "')";
    let started = false;
    const start = () => { if (started) return; started = true; loadHeroBlob().catch(failVideo); };
    const img = new Image();
    img.onload = start; img.onerror = start; img.src = POSTER_URL;
    setTimeout(start, 4000);
  }

  const GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  const MQLS = GATES.map(q => matchMedia(q));

  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    initHeroOnce();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(b => { b.op = -1; b.k = -1; b.ks = -1; b.kb = -1; });
    unpinFinalStates();
    lensD.layout();
    if (!loadStart) loadStart = performance.now();
    target = heroProgress();
    updateCaptions(shown, performance.now());
    updateIntro(shown);
    if (rafId === null) rafId = requestAnimationFrame(tick);
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return;
    scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ---------- phones and portrait tablets: the lens opens on its own, then a short push-in ---------- */
  const shBox = $('.static-hero');
  const shVideo = $('.sh-video');
  let shPrepared = false, shIntro = 'idle';
  function prepareStaticVideo() {
    if (shPrepared || !shVideo) return;
    shPrepared = true;
    shVideo.poster = 'assets/img/hero-mobile-poster.jpg';
    shVideo.src = 'assets/video/hero-mobile.mp4';
    shVideo.addEventListener('error', () => shBox.classList.remove('sh-on'));
  }
  function playStatic() {
    if (!shVideo || reduceMQ.matches) return;
    prepareStaticVideo();
    shBox.classList.add('sh-on');
    const pr = shVideo.play();
    if (pr && pr.catch) pr.catch(() => shBox.classList.remove('sh-on'));
  }
  function runStaticIntro() {
    if (shIntro !== 'idle') return;
    if (reduceMQ.matches) { shIntro = 'done'; shBox.classList.add('sh-done'); return; }
    shIntro = 'running';
    prepareStaticVideo();
    shBox.classList.add('sh-on');
    lensM.layout();
    lensM.set(0, 0);
    const t0 = performance.now();
    let played = false;
    const step = now => {
      if (shIntro !== 'running') return;
      const t = (now - t0) / 1000;
      if (!played && t >= 1.25) { played = true; playStatic(); }
      const q = clamp((t - 1.35) / 1.5, 0, 1);
      lensM.set(q, 34 * easeOutBack(clamp(t / 1.1, 0, 1)));
      if (q >= 1) { shIntro = 'done'; shBox.classList.add('sh-done'); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function endStaticIntro() {
    if (shIntro === 'running') shIntro = 'done';
    lensM.set(1, 34);
    shBox.classList.add('sh-done');
  }

  function applyHeroMode() {
    if (MQLS.some(m => m.matches)) { disableScrub(); runStaticIntro(); }
    else { if (shVideo && shPrepared) shVideo.pause(); enableScrub(); }
  }

  /* ---------- scroll-drawn process line ---------- */
  const steps = $('.steps');
  const stepsLine = $('.steps-line');
  let lastDraw = -1, linePinned = false;
  function drawLine() {
    if (!steps || linePinned) return;
    const r = steps.getBoundingClientRect();
    const p = clamp((innerHeight * 0.85 - r.top) / (innerHeight * 0.6), 0, 1);
    const v = +(1 - p).toFixed(3);
    if (v !== lastDraw) { lastDraw = v; stepsLine.style.setProperty('--draw', v); }
  }

  /* ---------- reduced motion: pin and unpin final states ---------- */
  function pinToFinalStates() {
    linePinned = true;
    if (stepsLine) stepsLine.style.setProperty('--draw', 0);
    $$('.rv').forEach(el => el.classList.add('in', 'settled'));
    if (!holdDone) { holdPinned = true; holdFinish(true); }
    endStaticIntro();
    if (shVideo) { shVideo.pause(); shBox.classList.remove('sh-on'); }
    disableScrub();
  }
  function unpinFinalStates() {
    linePinned = false; lastDraw = -1; drawLine();
    if (holdPinned) {
      holdPinned = false; holdDone = false; holdF = 0; holdRender();
      moSec.classList.remove('done'); moImg.classList.remove('shot');
    }
  }

  /* ---------- reveal choreography ---------- */
  function setupReveals() {
    const groups = [
      '.sec-head > *', '.mf-sign', '.reel', '.ap-text > *, .ap-list li', '.ap-media img', '.mo-text > *:not(.mo-done)',
      '.sv-row', '.sv-foot > *', '.steps li', '.ab-text > *', '.ab-media img', '.faq-list details', '.ct-text > *', '.ct-media'
    ];
    groups.forEach(sel => $$(sel).forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--i', i % 8); }));
    if (reduceMQ.matches || !('IntersectionObserver' in window)) { $$('.rv').forEach(el => el.classList.add('in', 'settled')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        el.classList.add('in');
        io.unobserve(el);
        setTimeout(() => el.classList.add('settled'), 1000 + 90 * 8);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    $$('.rv').forEach(el => io.observe(el));
  }

  /* ---------- living elements only while on screen ---------- */
  function setupLive() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('live', e.isIntersecting)), { threshold: 0.05 });
    $$('.sec, .clients').forEach(s => io.observe(s));
    const hio = new IntersectionObserver(es => es.forEach(e => {
      heroOnScreen = e.isIntersecting;
      if (heroOnScreen) onScroll();
    }), { threshold: 0 });
    hio.observe(hero);
  }

  /* ---------- cursor label over media, floating preview over services (fine pointers) ---------- */
  const cur = $('.cursor');
  const curLabel = $('.cursor-label');
  const svFloat = $('.sv-float');
  const svImg = svFloat.querySelector('img');
  let mx = -400, my = -400, cx = -400, cy = -400, fx = -400, fy = -400, cs = 0.2, curOn = false, curRaf = null, curTarget = null;
  const pointerFx = () => fineMQ.matches && !reduceMQ.matches;
  function curTick() {
    cx += (mx - cx) * 0.24; cy += (my - cy) * 0.24;
    fx += (mx - fx) * 0.11; fy += (my - fy) * 0.11;
    const ts = curOn ? 1 : 0.2;
    cs += (ts - cs) * 0.2;
    cur.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0) scale(${cs.toFixed(3)})`;
    svFloat.style.transform = `translate3d(${fx.toFixed(1)}px,${fy.toFixed(1)}px,0) rotate(${clamp((mx - fx) * 0.04, -8, 8).toFixed(2)}deg)`;
    const still = Math.abs(mx - cx) < 0.3 && Math.abs(my - cy) < 0.3 && Math.abs(mx - fx) < 0.3 && Math.abs(my - fy) < 0.3 && Math.abs(ts - cs) < 0.005;
    curRaf = still ? null : requestAnimationFrame(curTick);
  }
  function kickCursor() { if (curRaf === null) curRaf = requestAnimationFrame(curTick); }
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !pointerFx()) return;
    mx = e.clientX; my = e.clientY;
    if (cx < -300) { cx = fx = mx; cy = fy = my; }
    kickCursor();
  }, { passive: true });
  function cursorText() {
    const d = DICT[lang] || {};
    const fig = curTarget && curTarget.closest('.reel');
    return fig && fig.dataset.pinned === '1' ? d._cursorPause : d._cursor;
  }
  $$('[data-cursor]').forEach(el => {
    el.addEventListener('mouseenter', () => { if (!pointerFx()) return; curTarget = el; curOn = true; curLabel.textContent = cursorText(); cur.classList.add('on'); kickCursor(); });
    el.addEventListener('mouseleave', () => { curOn = false; curTarget = null; cur.classList.remove('on'); kickCursor(); });
  });
  const svList = $('.sv-list');
  $$('.sv-row').forEach(row => row.addEventListener('mouseenter', () => {
    if (!pointerFx()) return;
    if (svImg.getAttribute('src') !== row.dataset.img) svImg.src = row.dataset.img;
    svFloat.classList.add('on'); kickCursor();
  }));
  if (svList) svList.addEventListener('mouseleave', () => svFloat.classList.remove('on'));

  /* ---------- reels: hover to preview, click to keep playing (tap on touch) ---------- */
  function refreshReelLabels() {
    const d = DICT[lang] || {};
    $$('.reel-play').forEach(b => b.setAttribute('aria-label', b.closest('.reel').classList.contains('playing') ? d._pause : d._play));
    if (curOn) curLabel.textContent = cursorText();
  }
  function reelVideo(btn) {
    let v = btn.querySelector('video');
    if (!v) {
      v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.src = btn.dataset.src;
      btn.insertBefore(v, btn.querySelector('.play'));
    }
    return v;
  }
  function setReel(fig, play) {
    const btn = $('.reel-play', fig);
    if (play) {
      $$('.reel.playing').forEach(o => { if (o !== fig) { setReelOff(o); } });
      reelVideo(btn).play().catch(() => {});
      fig.classList.add('playing');
    } else setReelOff(fig);
    refreshReelLabels();
  }
  function setReelOff(fig) {
    const v = $('video', fig);
    if (v) v.pause();
    fig.classList.remove('playing');
    fig.dataset.pinned = '0';
  }
  function setupReels() {
    $$('.reel').forEach(fig => {
      const btn = $('.reel-play', fig);
      fig.dataset.pinned = '0';
      btn.addEventListener('mouseenter', () => { if (pointerFx() && fig.dataset.pinned !== '1') setReel(fig, true); });
      btn.addEventListener('mouseleave', () => { if (pointerFx() && fig.dataset.pinned !== '1') setReel(fig, false); });
      btn.addEventListener('click', () => {
        const pinned = fig.dataset.pinned === '1';
        if (pinned) { setReel(fig, false); }
        else { setReel(fig, true); fig.dataset.pinned = '1'; }
        refreshReelLabels();
      });
    });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (!e.isIntersecting && e.target.classList.contains('playing')) { setReelOff(e.target); refreshReelLabels(); }
      }));
      $$('.reel').forEach(r => io.observe(r));
    }
  }

  /* ---------- the one interactive moment: hold to pull focus ---------- */
  const holdBtn = $('#hold');
  const moSec = $('#moment');
  const moImg = $('.mo-img');
  let holdF = 0, holding = false, holdRaf = null, holdLast = 0, holdDone = false, holdPinned = false, holdReset = false;
  function holdRender() {
    moImg.style.setProperty('--f', holdF.toFixed(3));
    holdBtn.style.setProperty('--f', holdF.toFixed(3));
  }
  function holdFinish(instant) {
    if (holdDone) return;
    holdDone = true; holdF = 1; holdRender();
    moSec.classList.add('done');
    if (!instant) { moImg.classList.remove('shot'); void moImg.offsetWidth; moImg.classList.add('shot'); }
  }
  function holdTick(now) {
    const dt = Math.min(64, now - (holdLast || now)); holdLast = now;
    // A new press after a capture first eases the photo back out of focus, then focuses again.
    if (holdReset) { holdF = Math.max(0, holdF - dt / 380); if (holdF <= 0) holdReset = false; }
    else if (holding) holdF = Math.min(1, holdF + dt / 1500);
    else holdF = Math.max(0, holdF - dt / 900);
    holdRender();
    if (!holdReset && holdF >= 1) { holdFinish(false); holdRaf = null; holdLast = 0; return; }
    if (!holdReset && !holding && holdF <= 0) { holdRaf = null; holdLast = 0; return; }
    holdRaf = requestAnimationFrame(holdTick);
  }
  function holdStart(e) {
    if (reduceMQ.matches) { holdFinish(true); return; }
    if (holdDone) { holdDone = false; holdReset = true; moSec.classList.remove('done'); moImg.classList.remove('shot'); }
    if (e && e.type === 'pointerdown') { try { holdBtn.setPointerCapture(e.pointerId); } catch (x) {} }
    holding = true;
    if (holdRaf === null) holdRaf = requestAnimationFrame(holdTick);
  }
  function holdEnd() {
    holding = false;
    if (!holdDone && holdRaf === null && (holdF > 0 || holdReset)) holdRaf = requestAnimationFrame(holdTick);
  }
  if (holdBtn) {
    holdBtn.addEventListener('pointerdown', holdStart);
    holdBtn.addEventListener('pointerup', holdEnd);
    holdBtn.addEventListener('pointercancel', holdEnd);
    holdBtn.addEventListener('lostpointercapture', holdEnd);
    holdBtn.addEventListener('contextmenu', e => e.preventDefault());
    holdBtn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); holdStart(); } });
    holdBtn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') holdEnd(); });
  }

  /* ---------- nav state ---------- */
  const nav = $('.nav');
  let navSolid = null;
  function navState() {
    const solid = scrollY > (hero.offsetHeight - innerHeight * 1.1) || MQLS.some(m => m.matches) && scrollY > 40;
    if (solid !== navSolid) { navSolid = solid; nav.classList.toggle('solid', solid); }
  }

  /* ---------- boot ---------- */
  applyLang(readLang(), false);
  $$('.lang button').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang, true)));
  setupReveals();
  setupLive();
  setupReels();
  addEventListener('scroll', () => { drawLine(); navState(); updateManifesto(); }, { passive: true });
  addEventListener('resize', () => {
    drawLine(); navState(); updateManifesto();
    lensD.layout(); lensM.layout();
    if (scrubOn) { updateIntro(shown); onScroll(); }
  }, { passive: true });
  drawLine(); navState();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lensD.layout(); lensM.layout(); if (scrubOn) updateIntro(shown); });

  MQLS.forEach(m => m.addEventListener('change', applyHeroMode));
  applyHeroMode();
  reduceMQ.addEventListener('change', e => { if (e.matches) pinToFinalStates(); else applyHeroMode(); });
  if (reduceMQ.matches) pinToFinalStates();

  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));
})();
