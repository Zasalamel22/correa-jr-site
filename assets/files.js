// Client files: the photographer shares a Yandex Disk folder and sends the client its code
// (the part after /d/ in the share link). The page lists the folder through the public
// Yandex Disk API and hands out download links. No server of our own, nothing is stored here.
(() => {
  'use strict';

  const API = 'https://cloud-api.yandex.net/v1/disk/public/resources';
  const PAGE = 60;

  const $ = s => document.querySelector(s);
  const form = $('#fl-form');
  if (!form) return;
  const input = $('#fl-code');
  const status = $('#fl-status');
  const result = $('#fl-result');
  const nameEl = $('#fl-name');
  const metaEl = $('#fl-meta');
  const allBtn = $('#fl-all');
  const dirsEl = $('#fl-dirs');
  const grid = $('#fl-grid');
  const moreBtn = $('#fl-more');
  const box = $('#fl-box');
  const boxMedia = $('#fl-box-media');
  const boxName = $('#fl-box-name');
  const boxDl = $('#fl-box-dl');
  const boxClose = $('#fl-box-close');

  const lang = () => (window.I18N && window.I18N[document.documentElement.lang] ? document.documentElement.lang : 'ru');
  const T = () => window.I18N[lang()]._fl;

  // Accepts the bare code or any form of the share link.
  function parseCode(raw) {
    const s = (raw || '').trim();
    const m = s.match(/(?:yadi\.sk|disk\.(?:360\.)?yandex\.[a-z.]+)\/(?:d|i)\/([A-Za-z0-9_-]{4,80})/);
    const code = m ? m[1] : s;
    return /^[A-Za-z0-9_-]{4,80}$/.test(code) ? code : null;
  }
  const keyFor = code => 'https://disk.yandex.ru/d/' + code;

  function fmtSize(bytes) {
    const u = T().units;
    let v = bytes, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    const n = new Intl.NumberFormat(lang(), { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 }).format(v);
    return n + ' ' + u[i];
  }
  const kindOf = it => {
    const t = it.media_type || (it.mime_type || '').split('/')[0];
    return t === 'video' ? 'video' : t === 'image' ? 'image' : 'file';
  };

  let state = null;   // { code, path, items, total, offset, name, size }
  let reqId = 0;

  function setStatus(msg, kind) {
    status.textContent = msg || '';
    status.className = 'fl-status' + (kind ? ' is-' + kind : '');
  }

  async function api(params, endpoint = '') {
    const res = await fetch(API + endpoint + '?' + new URLSearchParams(params), { headers: { Accept: 'application/json' } });
    let body = null;
    try { body = await res.json(); } catch (e) {}
    if (!res.ok) { const err = new Error((body && body.error) || 'HTTP ' + res.status); err.status = res.status; throw err; }
    return body;
  }

  async function open(code, path, offset) {
    const my = ++reqId;
    if (!offset) { setStatus(T().loading, 'busy'); result.setAttribute('aria-busy', 'true'); }
    try {
      const data = await api({ public_key: keyFor(code), path: path || '/', limit: PAGE, offset: offset || 0, preview_size: 'L', preview_crop: 'false', sort: 'name' });
      if (my !== reqId) return;
      const list = data._embedded || { items: data.type === 'file' ? [data] : [], total: data.type === 'file' ? 1 : 0 };
      if (!offset) {
        state = { code, path: path || '/', items: [], total: list.total || 0, name: data.name, isFile: data.type === 'file' };
        grid.textContent = '';
        dirsEl.textContent = '';
      }
      state.items.push(...list.items);
      state.offset = (offset || 0) + list.items.length;
      render(list.items, !offset);
      setStatus('');
    } catch (e) {
      if (my !== reqId) return;
      const t = T();
      setStatus(e.status === 404 ? t.notFound : e.status === 403 ? t.blocked : t.network, 'error');
      if (!offset) result.hidden = true;
    } finally {
      if (my === reqId) result.removeAttribute('aria-busy');
    }
  }

  function render(items, fresh) {
    const t = T();
    result.hidden = false;
    if (fresh) {
      nameEl.textContent = state.name || '';
      const back = state.path !== '/';
      if (back) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'fl-chip fl-back'; b.textContent = t.back;
        b.addEventListener('click', () => open(state.code, state.path.replace(/\/[^/]+\/?$/, '') || '/'));
        dirsEl.appendChild(b);
      }
    }
    for (const it of items) {
      if (it.type === 'dir') {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'fl-chip';
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
        b.append(document.createTextNode(it.name));
        b.addEventListener('click', () => open(state.code, it.path));
        dirsEl.appendChild(b);
        continue;
      }
      grid.appendChild(tile(it));
    }
    const files = state.items.filter(i => i.type !== 'dir');
    const bytes = files.reduce((n, i) => n + (i.size || 0), 0);
    const dirCount = state.items.length - files.length;
    if (!files.length && !dirCount) setStatus(t.empty);
    metaEl.textContent = files.length ? t.count(Math.max(files.length, state.total - dirCount)) + ' · ' + fmtSize(bytes) + (state.total > state.items.length ? '+' : '') : '';
    allBtn.textContent = state.isFile ? t.download : t.all;
    allBtn.hidden = !files.length;
    moreBtn.textContent = t.more;
    moreBtn.hidden = state.offset >= state.total;
  }

  function tile(it) {
    const t = T();
    const kind = kindOf(it);
    const li = document.createElement('li');
    li.className = 'fl-tile is-' + kind;
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'fl-thumb';
    view.setAttribute('aria-label', it.name);
    if (it.preview) {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.src = it.preview;
      img.addEventListener('error', () => { img.remove(); view.classList.add('no-preview'); }, { once: true });
      view.appendChild(img);
    } else view.classList.add('no-preview');
    const badge = document.createElement('span');
    badge.className = 'fl-kind';
    badge.textContent = kind === 'video' ? t.video : kind === 'image' ? t.photo : t.file;
    view.appendChild(badge);
    if (kind === 'video') view.insertAdjacentHTML('beforeend', '<span class="fl-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></span>');
    view.addEventListener('click', () => (kind === 'file' ? download(it) : show(it)));
    const cap = document.createElement('div');
    cap.className = 'fl-cap';
    const nm = document.createElement('p');
    nm.className = 'fl-file';
    nm.textContent = it.name;
    const sz = document.createElement('p');
    sz.className = 'fl-size';
    sz.textContent = it.size ? fmtSize(it.size) : '';
    const dl = document.createElement('a');
    dl.className = 'fl-dl';
    dl.textContent = t.download;
    dl.rel = 'noopener';
    dl.href = it.file || '#';
    dl.setAttribute('aria-label', t.download + ': ' + it.name);
    if (!it.file) dl.addEventListener('click', e => { e.preventDefault(); download(it); });
    cap.append(nm, sz, dl);
    li.append(view, cap);
    return li;
  }

  // A fresh link from the API for one file (path) or for the whole folder (zip).
  async function download(it) {
    if (it && it.file) { location.assign(it.file); return; }
    const t = T();
    try {
      const params = { public_key: keyFor(state.code) };
      if (it) params.path = it.path;
      else if (state.path !== '/') params.path = state.path;
      const link = await api(params, '/download');
      if (link && link.href) location.assign(link.href);
    } catch (e) {
      setStatus(e.status === 403 ? t.blocked : t.network, 'error');
    }
  }

  /* ---------- lightbox: big photo, or the video when the browser can play it ---------- */
  let lastFocus = null;
  function show(it) {
    const t = T();
    lastFocus = document.activeElement;
    boxMedia.textContent = '';
    boxName.textContent = it.name;
    boxDl.textContent = t.download;
    boxDl.href = it.file || '#';
    boxDl.onclick = it.file ? null : e => { e.preventDefault(); download(it); };
    boxClose.textContent = t.close;
    if (kindOf(it) === 'video' && it.file) {
      const v = document.createElement('video');
      v.controls = true; v.playsInline = true; v.preload = 'metadata';
      if (it.preview) v.poster = it.preview;
      v.src = it.file;
      v.addEventListener('error', () => { v.remove(); const p = document.createElement('p'); p.className = 'fl-box-msg'; p.textContent = t.cantPlay; boxMedia.appendChild(p); }, { once: true });
      boxMedia.appendChild(v);
    } else if (it.preview) {
      const img = document.createElement('img');
      img.alt = it.name;
      img.referrerPolicy = 'no-referrer';
      img.src = it.preview.replace(/([?&]size=)[^&]*/, '$1XXXL');
      boxMedia.appendChild(img);
    } else {
      const p = document.createElement('p'); p.className = 'fl-box-msg'; p.textContent = kindOf(it) === 'video' ? t.cantPlay : it.name; boxMedia.appendChild(p);
    }
    box.hidden = false;
    document.documentElement.classList.add('fl-lock');
    boxClose.focus();
  }
  function hide() {
    if (box.hidden) return;
    const v = boxMedia.querySelector('video');
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    boxMedia.textContent = '';
    box.hidden = true;
    document.documentElement.classList.remove('fl-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  boxClose.addEventListener('click', hide);
  box.addEventListener('click', e => { if (e.target === box) hide(); });
  document.addEventListener('keydown', e => {
    if (box.hidden) return;
    if (e.key === 'Escape') hide();
    if (e.key === 'Tab') {   // keep focus inside the dialog
      const f = [...box.querySelectorAll('a[href], button, video[controls]')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- wiring ---------- */
  form.addEventListener('submit', e => {
    e.preventDefault();
    const code = parseCode(input.value);
    if (!code) { setStatus(T().invalid, 'error'); result.hidden = true; input.focus(); return; }
    input.value = code;
    try { history.replaceState(null, '', '?code=' + encodeURIComponent(code) + '#files'); } catch (x) {}
    open(code);
  });
  allBtn.addEventListener('click', () => {
    if (state.isFile) { download(state.items[0]); return; }
    setStatus(T().preparing, 'busy');
    download(null).then(() => setStatus(''));
  });
  moreBtn.addEventListener('click', () => open(state.code, state.path, state.offset));
  document.addEventListener('jr:lang', () => {
    if (!state) return;
    grid.textContent = '';
    dirsEl.textContent = '';
    render(state.items, true);
  });

  // Links like ?code=XXXX#files open the client's folder straight away.
  const fromUrl = parseCode(new URLSearchParams(location.search).get('code'));
  if (fromUrl) {
    input.value = fromUrl;
    open(fromUrl);
    requestAnimationFrame(() => $('#files').scrollIntoView({ behavior: 'instant', block: 'start' }));
  }
})();
