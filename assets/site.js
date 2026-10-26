(() => {
  'use strict';

  const VIDEO_URL = 'assets/video/hero-scrub.mp4';
  const VIDEO_BYTES = 7805399;
  const POSTER_URL = 'assets/img/hero-poster.jpg';
  const PHONE = '79362845488';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');

  function rng(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }

  /* ---------- text splitting (seeded, rebuilt on language change) ---------- */
  function buildVisual(text, fx, rand, spread) {
    const vis = document.createElement('span');
    vis.setAttribute('aria-hidden', 'true');
    const words = text.split(/\s+/).filter(Boolean);
    const totalChars = words.join('').length;
    let ci = 0;
    words.forEach((word, wi) => {
      const w = document.createElement('span');
      w.className = 'w';
      if (fx === 'depth' || fx === 'rise') w.style.setProperty('--th', (wi / Math.max(1, words.length) * 0.5 + rand() * 0.05).toFixed(3));
      for (const ch of word) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = ch;
        if (fx === 'snap') {
          c.style.setProperty('--th', (ci / Math.max(1, totalChars) * spread + rand() * 0.06).toFixed(3));
          c.style.setProperty('--jx', ((rand() < 0.5 ? -1 : 1) * (18 + rand() * 40)).toFixed(1) + 'px');
        }
        ci++;
        w.appendChild(c);
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
    sr.textContent = text;
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

  /* ---------- i18n ---------- */
  const DICT = window.I18N || {};
  let lang = 'ru';
  function readLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && DICT[q]) return q;
    try { const s = localStorage.getItem('jr-lang'); if (s && DICT[s]) return s; } catch (e) {}
    return 'ru';
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
      if (el.classList.contains('split')) { el.dataset.text = v; }
      else el.textContent = v;
    });
    $$('.split').forEach((el, i) => splitEl(el, i));
    $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    const wa = $('#wa'); if (wa) wa.href = 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(d._wa);
    $$('.reel-play').forEach(b => b.setAttribute('aria-label', b.closest('.reel').classList.contains('playing') ? d._pause : d._play));
    if (save) { try { localStorage.setItem('jr-lang', l); } catch (e) {} }
    bands.forEach(b => { b.op = -1; b.k = -1; });
    if (scrubOn) updateCaptions(shown, performance.now());
  }

  /* ---------- hero scrub ---------- */
  const hero = $('#hero');
  const stage = $('.stage');
  const video = $('#hero-video');
  const posterLayer = $('.poster');
  const ring = $('.ring');
  const tcEl = $('#tc');
  const bands = $$('.band').map((el, i, all) => ({
    el, a: parseFloat(el.dataset.a), b: parseFloat(el.dataset.b),
    ramp: el.dataset.ramp ? parseFloat(el.dataset.ramp) : null,
    first: i === 0, last: i === all.length - 1, fx: el.dataset.fx, op: -1, k: -1, ks: -1, kb: -1
  }));

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
    if (Math.abs(cacheObj[key] - v) < 0.008 && !(v === 0 || v === 1) ) return;
    if (cacheObj[key] === v) return;
    cacheObj[key] = v;
    el.style.setProperty(name, v.toFixed(3));
  }

  function updateCaptions(p, now) {
    for (const b of bands) {
      const len = b.b - b.a;
      const f = Math.min(0.02, len / 3);
      const inE = b.first ? 1 : smoothstep(p, b.a, b.a + f);
      const outE = b.last ? 1 : 1 - smoothstep(p, b.b - f, b.b);
      const op = (p < b.a && !b.first) || (p > b.b && !b.last) ? 0 : inE * outE;
      if (Math.abs(op - b.op) > 0.004 || (op === 0 && b.op !== 0) || (op === 1 && b.op !== 1)) {
        b.op = op;
        b.el.style.opacity = op.toFixed(3);
        b.el.style.visibility = op <= 0 ? 'hidden' : 'visible';
      }
      const ramp = b.ramp || Math.min(0.025, len * 0.35) * (b.fx === 'rise' ? 2.2 : 1.6);
      let k = clamp((p - b.a) / ramp, 0, 1);
      if (b.first) k = Math.max(k, loadK);
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
    const t = (video.duration || 11.5) * shown;
    const s = Math.floor(t), fr = Math.floor((t - s) * 25);
    const str = '00:00:' + String(s).padStart(2, '0') + ':' + String(fr).padStart(2, '0');
    if (str === lastTC) return;
    lastTC = str; lastTCAt = now; tcEl.textContent = str;
  }

  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    if (loadK < 1) loadK = clamp((now - loadStart) / 1400, 0, 1);
    const k = 0.14;
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
    const converged = Math.abs(target - shown) < 0.0005 && loadK >= 1;
    if (converged) shown = target;
    requestSeek(shown * (video.duration || 0));
    updateCaptions(shown, now);
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
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'chev'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M5 9l7 7 7-7'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2');
    s.appendChild(p); return s;
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
      requestSeek(heroProgress() * video.duration);
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
    loadStart = performance.now();
    target = heroProgress();
    updateCaptions(shown, performance.now());
    if (rafId === null) rafId = requestAnimationFrame(tick);
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return;
    scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function applyHeroMode() {
    if (MQLS.some(m => m.matches)) disableScrub(); else enableScrub();
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
      ['.sec-head', '.sec-head > *'], ['.reels', '.reel'], ['.clients', '.clients li'],
      ['.ap-text', '.ap-text > *, .ap-list li'], ['.ap-media', '.ap-media img'], ['.mo-text', '.mo-text > *:not(.mo-done)'],
      ['.cards', '.card'], ['.extras', '.extras p'], ['.steps ol', '.steps li'], ['.ab-text', '.ab-text > *'],
      ['.ab-media', '.ab-media img'], ['.faq-list', 'details'], ['.ct-text', '.ct-text > *'], ['.contact', '.ct-media']
    ];
    groups.forEach(([, sel]) => $$(sel).forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--i', i % 8); }));
    if (reduceMQ.matches || !('IntersectionObserver' in window)) { $$('.rv').forEach(el => el.classList.add('in', 'settled')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        el.classList.add('in');
        io.unobserve(el);
        setTimeout(() => el.classList.add('settled'), 900 + 90 * 8);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    $$('.rv').forEach(el => io.observe(el));
  }

  /* ---------- living elements only while on screen ---------- */
  function setupLive() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('live', e.isIntersecting)), { threshold: 0.05 });
    $$('.sec').forEach(s => io.observe(s));
    const hio = new IntersectionObserver(es => es.forEach(e => {
      heroOnScreen = e.isIntersecting;
      if (heroOnScreen) onScroll();
    }), { threshold: 0 });
    hio.observe(hero);
  }

  /* ---------- reels: designed player, no autoplay ---------- */
  function setupReels() {
    let current = null;
    $$('.reel-play').forEach(btn => {
      const fig = btn.closest('.reel');
      btn.addEventListener('click', () => {
        let v = btn.querySelector('video');
        if (!v) {
          v = document.createElement('video');
          v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
          v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
          v.src = btn.dataset.src;
          btn.insertBefore(v, btn.querySelector('.play'));
        }
        if (fig.classList.contains('playing')) {
          v.pause(); fig.classList.remove('playing'); current = null;
        } else {
          if (current && current !== fig) { const cv = current.querySelector('video'); if (cv) cv.pause(); current.classList.remove('playing'); }
          v.play().catch(() => {}); fig.classList.add('playing'); current = fig;
        }
        const d = DICT[lang] || {};
        $$('.reel-play').forEach(b => b.setAttribute('aria-label', b.closest('.reel').classList.contains('playing') ? d._pause : d._play));
      });
    });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (!e.isIntersecting && e.target.classList.contains('playing')) {
          const v = e.target.querySelector('video'); if (v) v.pause(); e.target.classList.remove('playing');
        }
      }));
      $$('.reel').forEach(r => io.observe(r));
    }
  }

  /* ---------- the one interactive moment: hold to pull focus ---------- */
  const holdBtn = $('#hold');
  const moSec = $('#moment');
  const moImg = $('.mo-img');
  let holdF = 0, holding = false, holdRaf = null, holdLast = 0, holdDone = false, holdPinned = false;
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
    if (holding) holdF = Math.min(1, holdF + dt / 1500);
    else holdF = Math.max(0, holdF - dt / 900);
    holdRender();
    if (holdF >= 1) { holdFinish(false); holdRaf = null; holdLast = 0; return; }
    if (!holding && holdF <= 0) { holdRaf = null; holdLast = 0; return; }
    holdRaf = requestAnimationFrame(holdTick);
  }
  function holdStart(e) {
    if (holdDone) return;
    if (reduceMQ.matches) { holdFinish(true); return; }
    if (e && e.type === 'pointerdown') { try { holdBtn.setPointerCapture(e.pointerId); } catch (x) {} }
    holding = true;
    if (holdRaf === null) holdRaf = requestAnimationFrame(holdTick);
  }
  function holdEnd() {
    holding = false;
    if (!holdDone && holdRaf === null && holdF > 0) holdRaf = requestAnimationFrame(holdTick);
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
  addEventListener('scroll', () => { drawLine(); navState(); }, { passive: true });
  addEventListener('resize', () => { drawLine(); navState(); onScroll(); }, { passive: true });
  drawLine(); navState();

  MQLS.forEach(m => m.addEventListener('change', applyHeroMode));
  applyHeroMode();
  reduceMQ.addEventListener('change', e => { if (e.matches) pinToFinalStates(); else applyHeroMode(); });
  if (reduceMQ.matches) pinToFinalStates();

  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));
})();
