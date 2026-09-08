'use strict';
/* ================================================================
   GymLog v2 · PWA-дневник тренировок
   Анимации: Motion One (vendor/motion.js) + CSS + собственная пружина шторки.
   Данные: сервер (SQLite/Postgres) или гостевой режим на localStorage.
   ================================================================ */

/* ---------- утилиты ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = n => (n == null || n === '') ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const fmtInt = n => fmt(Math.round(n));
const fmtVol = n => n >= 1000 ? (n / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : fmtInt(n);
const volLabel = n => n >= 1000 ? 'тоннаж, т' : 'объём, кг';
const pad2 = n => String(n).padStart(2, '0');
const localISO = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; // FIX: раньше toISOString → UTC-сдвиг даты
const today = () => localISO();
const human = d => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const setCount = q => +q.k || 1;
const setVol = q => setCount(q) * (+q.w || 0) * (+q.r || 0);
const sumVol = s => s.sets.reduce((a, q) => a + setVol(q), 0);
const setsN = s => s.sets.reduce((a, q) => a + setCount(q), 0);
const epley = (w, r) => r > 1 ? w * (1 + r / 30) : w;
const plural = (n, a, b, c) => { const m = n % 100, l = n % 10; return n + ' ' + (m > 10 && m < 20 ? c : l === 1 ? a : l > 1 && l < 5 ? b : c); };
const M = window.Motion || null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const anim = (...a) => (M && !reduceMotion.matches) ? M.animate(...a) : { finished: Promise.resolve() };

const ICONS = {
  plus : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  x    : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pen  : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20l4-1L20 7l-3-3L5 16l-1 4z"/></svg>',
  trash: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>',
  play : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
  check: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12l5 5L20 7"/></svg>',
  moon : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
  sun  : '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8"/></svg>',
  chevron: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  crown: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3.5 8.2l4.4 3.6L12 5.6l4.1 6.2 4.4-3.6-1.7 10.2H5.2z"/></svg>',
  eye  : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  eyeOff: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.5-6.5 10-6.5c2 0 3.7.6 5.1 1.4M22 12s-3.5 6.5-10 6.5c-2 0-3.7-.6-5.1-1.4M4 20L20 4"/></svg>',
  grip : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>',
  timer: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>',
  warn : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
  home : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>',
  cal  : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  bell : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>',
  user : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></svg>',
  export: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
};

/* ---------- данные ---------- */
const seed = () => ({
  profile: { name: '', age: '', weight: '' },
  weightLog: [],
  days: [
    { id: uid(), name: 'День A — Жим', exercises: [
      { id: uid(), name: 'Жим лёжа' }, { id: uid(), name: 'Жим стоя' }, { id: uid(), name: 'Отжимания на брусьях' } ] },
    { id: uid(), name: 'День B — Тяга', exercises: [
      { id: uid(), name: 'Становая тяга' }, { id: uid(), name: 'Подтягивания' }, { id: uid(), name: 'Тяга штанги в наклоне' } ] },
    { id: uid(), name: 'День C — Ноги', exercises: [
      { id: uid(), name: 'Приседания' }, { id: uid(), name: 'Выпады' }, { id: uid(), name: 'Подъём на носки' } ] },
  ],
  sessions: [],
  active: null,
  restSec: 90,
});

const normState = s => {
  s = s && typeof s === 'object' ? s : {};
  s.profile = s.profile || { name: '', age: '', weight: '' };
  s.days = Array.isArray(s.days) ? s.days : [];
  s.sessions = Array.isArray(s.sessions) ? s.sessions : [];
  s.weightLog = Array.isArray(s.weightLog) ? s.weightLog : [];
  s.restSec = +s.restSec || 90;
  if (s.active && !Array.isArray(s.active.sets)) s.active = null;
  delete s.theme; // тема теперь per-device, а не per-account
  return s;
};

/* FIX: кэш привязан к аккаунту — данные разных пользователей не смешиваются */
const DB = {
  key: 'gymlog.v2.guest',
  setUser(login) { this.key = login ? 'gymlog.v2.u.' + login : 'gymlog.v2.guest'; },
  load() {
    try {
      let raw = localStorage.getItem(this.key);
      if (!raw && this.key === 'gymlog.v2.guest') raw = localStorage.getItem('gymlog.v1'); // миграция
      const s = raw ? JSON.parse(raw) : null;
      return normState(s && s.days ? s : seed());
    } catch { return seed(); }
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(S)); } catch {} },
};

let S = seed();
let mode = 'guest';
let userLogin = '';
const theme = { get: () => localStorage.getItem('gymlog.theme') || 'light', set: v => localStorage.setItem('gymlog.theme', v) };

/* ---------- API ---------- */
const api = {
  token: localStorage.getItem('gymlog.token') || '',
  async call(path, method = 'GET', body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch('/api' + path, {
        method, cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || 'Ошибка сети (' + res.status + ')'), { status: res.status });
      return data;
    } finally { clearTimeout(t); }
  },
  async ping() {
    for (let i = 0; i < 2; i++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      try {
        const res = await fetch('/api/ping', { signal: ctrl.signal, cache: 'no-store' });
        if (res.ok) return true;
      } catch {} finally { clearTimeout(t); }
    }
    return false;
  },
};

/* ---------- сохранение + синхронизация с повтором ---------- */
let syncT, dirty = false, syncing = false;
function setSync(state) { $$('.sync-dot').forEach(d => { d.className = 'sync-dot ' + state; }); }
async function flush() {
  if (mode !== 'server' || !dirty || syncing) return;
  syncing = true; dirty = false; setSync('syncing');
  try {
    await api.call('/state', 'PUT', S);
    setSync('online');
  } catch (e) {
    dirty = true; setSync('offline');
    if (e.status === 401) { toast('Сессия истекла', '⚠️'); logoutLocal(); }
    else setTimeout(flush, 5000); // повтор
  } finally { syncing = false; if (dirty) setTimeout(flush, 300); }
}
function save() {
  DB.save();
  if (mode !== 'server') return;
  dirty = true;
  clearTimeout(syncT);
  syncT = setTimeout(flush, 500);
}
addEventListener('online', () => { if (dirty) flush(); });
addEventListener('pagehide', () => {
  if (mode === 'server' && api.token && dirty) {
    try {
      fetch('/api/state', { method: 'PUT', keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + api.token },
        body: JSON.stringify(S) }).catch(() => {});
    } catch {}
  }
});

/* ---------- тема ---------- */
function applyTheme(animate = false) {
  const t = theme.get();
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = t === 'dark' ? '#130F0A' : '#FF7A1A';
  const icon = t === 'dark' ? ICONS.sun : ICONS.moon;
  for (const b of $$('.theme-btn')) {
    b.innerHTML = icon;
    if (animate) { b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); }
  }
}
function toggleTheme(e) {
  const next = theme.get() === 'dark' ? 'light' : 'dark';
  theme.set(next);
  // круговая заливка от точки клика (View Transitions API), иначе — просто смена
  if (document.startViewTransition && !reduceMotion.matches && e) {
    const x = e.clientX, y = e.clientY;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(() => applyTheme(true));
    vt.ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 550, easing: 'cubic-bezier(.22,.75,.28,1)', pseudoElement: '::view-transition-new(root)' }));
  } else applyTheme(true);
}

/* ---------- тост ---------- */
let toastT;
(function toastSwipe() {
  const t = $('#toast'); let sx = 0, sy = 0;
  t.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; }, { passive: true });
  t.addEventListener('pointerup', e => { if (Math.abs(e.clientX - sx) > 30 || e.clientY - sy > 20) { t.classList.remove('show'); clearTimeout(toastT); } }, { passive: true });
})();
function toast(msg, ico = '') {
  const t = $('#toast');
  t.style.pointerEvents = ''; t.querySelector('.toast-msg').textContent = msg;
  t.querySelector('.toast-ico').textContent = ico;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2400);
}
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

/* ---------- конфетти ---------- */
function celebrate(big = false) {
  if (reduceMotion.matches || typeof confetti !== 'function') return;
  const colors = ['#FF7A1A', '#FF5E1A', '#FFC98A', '#FFFFFF', '#2FBF71'];
  if (big) {
    const end = Date.now() + 1200;
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: .7 }, colors, zIndex: 150 });
      confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: .7 }, colors, zIndex: 150 });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  } else {
    confetti({ particleCount: 70, spread: 75, startVelocity: 35, origin: { y: .75 }, colors, zIndex: 150, scalar: .9 });
  }
}

/* ---------- scroll-reveal: карточки ниже сгиба появляются при доскролле ---------- */
function reveal(root) {
  if (reduceMotion.matches) return;
  const els = [...root.querySelectorAll('.card,.hist,.rec')].filter(el => el.getBoundingClientRect().top > innerHeight);
  els.forEach(el => el.classList.add('reveal'));
  const show = el => el.classList.add('in');
  if (M?.inView) els.forEach(el => M.inView(el, () => { show(el); }, { margin: '0px 0px -8% 0px' }));
  else { const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { show(x.target); io.unobserve(x.target); } }), { rootMargin: '0px 0px -8% 0px' }); els.forEach(el => io.observe(el)); }
}

/* ---------- ripple на кнопках ---------- */
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.btn,.tab,.chip');
  if (!b || reduceMotion.matches) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(s);
  s.addEventListener('animationend', () => s.remove());
});

/* ---------- 3D-тильт карточек за курсором ---------- */
function tilt(els) {
  if (!matchMedia('(hover:hover) and (pointer:fine)').matches || reduceMotion.matches) return;
  for (const el of els) {
    if (!el.querySelector('.shine')) el.insertAdjacentHTML('beforeend', '<span class="shine"></span>');
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', x * 100 + '%'); el.style.setProperty('--my', y * 100 + '%');
      el.style.transform = `perspective(600px) rotateX(${(0.5 - y) * 10}deg) rotateY(${(x - 0.5) * 10}deg) translateY(-3px) scale(1.03)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }
}

/* ---------- magnetic hover (мышь): кнопка чуть тянется к курсору ---------- */
if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
  document.addEventListener('pointermove', e => {
    const el = e.target.closest('.btn.primary,.side-link:not(.active),.icon-btn');
    if (!el || reduceMotion.matches) return;
    const r = el.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / r.width, dy = (e.clientY - r.top - r.height / 2) / r.height;
    el.style.transform = `translate(${dx * 4}px,${dy * 4}px)`;
    el.addEventListener('pointerleave', () => { el.style.transform = ''; }, { once: true });
  }, { passive: true });
}

/* ---------- шторка: пружина, драг, инерция ---------- */
const springRaf = new WeakMap();
const getY = el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
function spring(el, toY, { vel = 0, zeta = 1, response = 0.35, onDone } = {}) {
  cancelAnimationFrame(springRaf.get(el));
  if (reduceMotion.matches) { el.style.transform = `translateY(${toY}px)`; return onDone?.(); }
  const k = (2 * Math.PI / response) ** 2, c = 2 * zeta * Math.sqrt(k);
  let x = getY(el), v = vel, last = performance.now();
  const tick = now => {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    v += (-k * (x - toY) - c * v) * dt; x += v * dt;
    const done = Math.abs(x - toY) < 0.5 && Math.abs(v) < 30;
    el.style.transform = `translateY(${done ? toY : x}px)`;
    if (done) return onDone?.();
    springRaf.set(el, requestAnimationFrame(tick));
  };
  springRaf.set(el, requestAnimationFrame(tick));
}
const project = v => v > 0 ? (v / 1000) * 0.998 / (1 - 0.998) : 0;
let sheetReturnFocus = null;
function setSheetOpen(open, vel = 0) {
  const el = $('#sheet'), bd = $('#sheetBackdrop');
  el.classList.toggle('open', open); bd.classList.toggle('open', open);
  bd.style.transition = ''; bd.style.opacity = '';
  const closedY = el.offsetHeight * 1.05 + 12;
  if (open && getY(el) < closedY) el.style.transform = `translateY(${closedY}px)`;
  if (open) {
    sheetReturnFocus = document.activeElement;
    el.setAttribute('aria-hidden', 'false');
    setTimeout(() => el.focus({ preventScroll: true }), 60);
  } else {
    el.setAttribute('aria-hidden', 'true');
    if (sheetReturnFocus?.focus && document.contains(sheetReturnFocus)) sheetReturnFocus.focus({ preventScroll: true });
    sheetReturnFocus = null;
  }
  spring(el, open ? 0 : closedY, { vel, zeta: Math.abs(vel) > 150 ? 0.8 : open ? 0.85 : 1, onDone: () => { if (!open) el.style.transform = ''; } });
}
function sheetShell(html) {
  const el = $('#sheet');
  el.innerHTML = `<div class="sheet-handle"></div>` + html;
  el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => setSheetOpen(false));
  $('#sheetBackdrop').onclick = () => setSheetOpen(false);
  setSheetOpen(true);
  return el;
}
function sheet(title, fields, onOk, okText = 'Сохранить') {
  const el = sheetShell(`<h3>${title}</h3>
    <form novalidate>${fields.map(f => `
      <label class="field"><span>${f.label}</span>
        <input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.attrs || ''}
               placeholder="${esc(f.ph || '')}" ${f.req ? 'required' : ''} autocomplete="off" enterkeyhint="done">
      </label>`).join('')}
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-cancel>Отмена</button>
        <button type="submit" class="btn primary">${okText}</button>
      </div>
    </form>`);
  el.querySelector('form').onsubmit = ev => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target).entries());
    for (const f of fields) if (f.req && !String(data[f.name] || '').trim()) {
      const inp = ev.target.elements[f.name]; inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.focus(); buzz(20); return;
    }
    setSheetOpen(false); onOk(data);
  };
  setTimeout(() => el.querySelector('input')?.focus(), 380);
}
function confirmSheet(text, onYes, yesText = 'Удалить', noText = 'Оставить') {
  const el = sheetShell(`<div class="confirm-ico">${ICONS.warn}</div><p class="confirm-text" style="text-align:center">${text}</p>
    <div class="sheet-actions">
      <button type="button" class="btn ghost" data-cancel>${noText}</button>
      <button type="button" class="btn danger" data-yes>${yesText}</button>
    </div>`);
  el.querySelector('[data-yes]').onclick = () => { setSheetOpen(false); onYes(); };
}
function sessionSheet(s) {
  const byEx = new Map();
  for (const q of s.sets) { if (!byEx.has(q.name)) byEx.set(q.name, []); byEx.get(q.name).push(q); }
  sheetShell(`<h3>${esc(s.name || s.dayName || 'Тренировка')}</h3>
    <p class="sheet-sub">${human(s.date)}${s.dayName && s.dayName !== s.name ? ' · ' + esc(s.dayName) : ''}${s.dur ? ' · ' + Math.round(s.dur / 60) + ' мин' : ''} · ${plural(setsN(s), 'подход', 'подхода', 'подходов')} · ${fmt(sumVol(s))} кг</p>
    <div class="sheet-scroll">${[...byEx].map(([name, qs], i) => `
      <div class="detail-ex" style="--i:${i}">
        <div class="detail-name">${esc(name)}</div>
        ${qs.map(q => `<div class="detail-set"><span class="detail-dot"></span>
            <span>${setCount(q)} × ${fmt(q.w)} кг × ${q.r} повт.</span><b>${fmt(setVol(q))} кг</b></div>`).join('')}
      </div>`).join('')}
    </div>
    <div class="sheet-actions"><button type="button" class="btn ghost" data-cancel>Закрыть</button></div>`);
}
const rubberband = (d, dim = 120, c = 0.55) => (d * dim * c) / (dim + c * Math.abs(d));
function makeSheetDraggable() {
  const el = $('#sheet'), bd = $('#sheetBackdrop');
  let base = 0, startY = 0, lastY = 0, lastT = 0, vel = 0, dragging = false;
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('input,button,form,select,textarea,.sheet-scroll')) return;
    dragging = true; base = getY(el); startY = lastY = e.clientY; lastT = performance.now(); vel = 0;
    el.setPointerCapture(e.pointerId); cancelAnimationFrame(springRaf.get(el)); bd.style.transition = 'none';
  });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    const now = performance.now(), dt = now - lastT;
    if (dt > 0) vel = 0.8 * vel + 0.2 * ((e.clientY - lastY) / dt);
    lastY = e.clientY; lastT = now;
    const y0 = base + e.clientY - startY, y = y0 >= 0 ? y0 : -rubberband(-y0);
    el.style.transform = `translateY(${y}px)`;
    bd.style.opacity = String(Math.max(0, 1 - Math.max(0, y) / (el.offsetHeight * 0.9)));
  });
  const endDrag = () => {
    if (!dragging) return; dragging = false;
    if (performance.now() - lastT > 100) vel = 0;
    const rest = base + lastY - startY + project(vel * 1000);
    setSheetOpen(!(vel > 0.5 || rest > el.offsetHeight * 0.5), vel * 1000); vel = 0;
  };
  el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag);
}

/* ---------- чипсы: колесо и драг мышью ---------- */
document.addEventListener('wheel', e => {
  const c = e.target.closest('.chips');
  if (!c || c.scrollWidth <= c.clientWidth) return;
  if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) { c.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false });
(function chipsMouseDrag() {
  let el = null, startX = 0, startLeft = 0, moved = false;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    const c = e.target.closest('.chips');
    if (!c || c.scrollWidth <= c.clientWidth) return;
    el = c; moved = false; startX = e.clientX; startLeft = c.scrollLeft;
  });
  document.addEventListener('pointermove', e => {
    if (!el) return; const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true; if (moved) el.scrollLeft = startLeft - dx;
  });
  const up = () => { if (el && moved) el.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true }); el = null; moved = false; };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
})();

/* фейд-маска чипсов: снимаем, когда доскроллили до конца */
const chipsEdge = c => { c.classList.toggle('scrollable', c.scrollWidth > c.clientWidth + 2); c.classList.toggle('at-end', c.scrollLeft + c.clientWidth >= c.scrollWidth - 2); };
document.addEventListener('scroll', e => { if (e.target.classList?.contains('chips')) chipsEdge(e.target); }, true);
const updateChips = () => $$('.chips').forEach(chipsEdge);

/* ---------- графики ---------- */
let gid = 0;
function lineChart(vals, labels = [], unit = 'кг') {
  if (!vals.length) return emptyBox('chart', 'Пока нет данных');
  const w = 340, h = 130, p = 14, id = 'g' + (++gid);
  const max = Math.max(...vals), min = Math.min(...vals);
  const X = i => vals.length > 1 ? p + i * (w - 2 * p) / (vals.length - 1) : w / 2;
  const Y = v => max > min ? h - p - (v - min) / (max - min) * (h - 2 * p) : h / 2;
  const pts = vals.map((v, i) => [+X(i).toFixed(1), +Y(v).toFixed(1)]);
  // сглаженная кривая (Catmull-Rom → Bezier)
  let line = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    line += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  const area = line + ` L ${pts.at(-1)[0]} ${h - 4} L ${pts[0][0]} ${h - 4} Z`;
  const grid = [0.25, 0.5, 0.75].map(t => { const y = +(p + t * (h - 2 * p)).toFixed(1); return `<line class="grid" x1="${p}" y1="${y}" x2="${w - p}" y2="${y}"/>`; }).join('');
  const marks = max > min ? `<text class="mark" x="3" y="10">${fmt(max)}</text><text class="mark" x="3" y="${h - 4}">${fmt(min)}</text>` : '';
  const lastPt = pts.at(-1);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".32"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}<path class="area" d="${area}" fill="url(#${id})"/><path d="${line}" class="line"/>${marks}
    <circle class="last-glow" cx="${lastPt[0]}" cy="${lastPt[1]}" r="6"/>
    ${pts.map((pt, i) => `<g class="dot-g" style="--i:${i}">
      <circle class="dot" cx="${pt[0]}" cy="${pt[1]}" r="3.5"/>
      <circle class="dot-hit" cx="${pt[0]}" cy="${pt[1]}" r="12" data-tip="${esc(labels[i] || '')} — ${fmt(vals[i])} ${unit}"></circle>
    </g>`).join('')}
  </svg>`;
}
function barChart(vals, labels = [], unit = 'кг') {
  if (!vals.length) return emptyBox('chart', 'Пока нет данных');
  const w = 340, h = 120, p = 8, bottom = 16, max = Math.max(...vals, 1);
  const bw = Math.min(28, (w - 2 * p) / vals.length - 6), step = (w - 2 * p) / vals.length;
  const topI = vals.indexOf(Math.max(...vals));
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">
    <defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-deep)"/></linearGradient></defs>
    ${vals.map((v, i) => {
      const bh = Math.max(3, (v / max) * (h - bottom - 10)), x = p + i * step + (step - bw) / 2, y = h - bottom - bh;
      return `<g class="dot-g" style="--i:${i};opacity:1;animation:none"><rect class="bar ${i === topI ? 'top' : ''}" style="--i:${i}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" data-tip="${esc(labels[i] || '')} — ${fmt(v)} ${unit}"/>
        <text class="bar-lbl" x="${(x + bw / 2).toFixed(1)}" y="${h - 3}">${esc(labels[i] || '')}</text></g>`;
    }).join('')}
  </svg>`;
}
/* тултип графика: следует за пальцем/мышью */
(function chartTips() {
  const tip = document.createElement('div'); tip.className = 'chart-tip'; document.body.appendChild(tip);
  let hideT;
  const show = (el, x, y) => {
    tip.textContent = el.dataset.tip; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('show');
    $$('.chart .dot-g.hot').forEach(g => g.classList.remove('hot')); el.closest('.dot-g')?.classList.add('hot');
    clearTimeout(hideT); hideT = setTimeout(() => { tip.classList.remove('show'); $$('.chart .hot').forEach(g => g.classList.remove('hot')); }, 2200);
  };
  document.addEventListener('pointermove', e => { const el = e.target.closest('[data-tip]'); if (el && e.pointerType === 'mouse') show(el, e.clientX, e.clientY - 8); });
  document.addEventListener('click', e => { const el = e.target.closest('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } });
})();

const ILL = {
  chart: '<svg viewBox="0 0 64 64"><rect class="fill" x="8" y="10" width="48" height="44" rx="10"/><path class="draw" d="M16 42l10-12 8 7 14-16"/><circle cx="48" cy="21" r="3"/></svg>',
  trophy: '<svg viewBox="0 0 64 64"><path class="fill" d="M20 12h24v14a12 12 0 0 1-24 0z"/><path class="draw" d="M20 12h24v14a12 12 0 0 1-24 0zM20 16h-6a6 6 0 0 0 6 10M44 16h6a6 6 0 0 1-6 10M32 38v8M22 50h20"/></svg>',
  list: '<svg viewBox="0 0 64 64"><rect class="fill" x="12" y="8" width="40" height="48" rx="8"/><path class="draw" d="M22 22h20M22 32h20M22 42h12"/><circle cx="17" cy="22" r="1.5"/><circle cx="17" cy="32" r="1.5"/><circle cx="17" cy="42" r="1.5"/></svg>',
  cal: '<svg viewBox="0 0 64 64"><rect class="fill" x="10" y="14" width="44" height="40" rx="8"/><path class="draw" d="M10 26h44M22 10v8M42 10v8"/><rect x="18" y="34" width="8" height="8" rx="2"/><rect x="34" y="34" width="8" height="8" rx="2"/></svg>',
  hand: '<svg viewBox="0 0 64 64"><path class="fill" d="M22 30V14a4 4 0 0 1 8 0v14"/><path class="draw" d="M22 30V14a4 4 0 0 1 8 0v14m0-6a4 4 0 0 1 8 0v8m0-4a4 4 0 0 1 8 0v14a14 14 0 0 1-28 0v-4l-6-8a4 4 0 0 1 6-5l4 5"/></svg>',
  bar: '<svg viewBox="0 0 64 64"><rect class="fill" x="6" y="24" width="52" height="16" rx="6"/><path class="draw" d="M14 20v24M22 16v32M42 16v32M50 20v24M6 32h8M50 32h8M22 32h20"/></svg>',
  shrug: '<svg viewBox="0 0 64 64"><circle class="fill" cx="32" cy="32" r="22"/><path class="draw" d="M22 40c3-4 17-4 20 0M24 26h.01M40 26h.01"/><circle cx="32" cy="32" r="22"/></svg>',
};
const emptyBox = (ill, text) => `<div class="empty"><span class="ill">${ILL[ill] || ILL.list}</span>${text}</div>`;

/* ---------- рекорды ---------- */
function records() {
  const map = {};
  for (const s of S.sessions) for (const q of s.sets) {
    const w = +q.w || 0, r = +q.r || 0, e1 = epley(w, r);
    const rec = map[q.name] || { w: 0, reps: 0, e1: 0, date: s.date };
    if (e1 > rec.e1 || (e1 === rec.e1 && w > rec.w)) { rec.w = w; rec.reps = r; rec.e1 = e1; rec.date = s.date; }
    map[q.name] = rec;
  }
  return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.e1 - a.e1);
}
/* лучший 1RM в упражнении до текущей тренировки (для детекта PR) */
function bestBefore(exName, exceptId) {
  let b = 0;
  for (const s of S.sessions) { if (s.id === exceptId) continue; for (const q of s.sets) if (q.name === exName) b = Math.max(b, epley(+q.w || 0, +q.r || 0)); }
  return b;
}
function lastPerformance(exName) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const qs = S.sessions[i].sets.filter(q => q.name === exName);
    if (qs.length) { const best = qs.reduce((m, q) => +q.w > +m.w ? q : m, qs[0]); return { date: S.sessions[i].date, w: +best.w, r: +best.r, k: setCount(best) }; }
  }
  return null;
}
function streak() {
  const days = new Set(S.sessions.map(s => s.date));
  if (!days.size) return 0;
  let n = 0; const d = new Date();
  if (!days.has(localISO(d))) d.setDate(d.getDate() - 1); // сегодня ещё не тренировался — не обнуляем
  while (days.has(localISO(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- count-up ---------- */
function countUp(el, target, fmtFn) {
  if (reduceMotion.matches || !target) { el.textContent = fmtFn(target); return; }
  const t0 = performance.now(), dur = 900;
  const tick = now => { const p = Math.min((now - t0) / dur, 1); el.textContent = fmtFn(target * (1 - Math.pow(1 - p, 4))); if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

/* ---------- Главная ---------- */
function renderHome() {
  const box = $('#screen-home');
  const total = S.sessions.length, vol = S.sessions.reduce((a, s) => a + sumVol(s), 0), recs = records(), st = streak();
  const hour = new Date().getHours();
  const greet = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const lastS = S.sessions.at(-1);
  const daysAgo = lastS ? Math.round((new Date(today()) - new Date(lastS.date)) / 864e5) : null;
  const sub = S.active ? 'Тренировка идёт — продолжайте в разделе «Зал»'
    : daysAgo === null ? 'Пора начать первую тренировку' : daysAgo === 0 ? 'Сегодня вы уже тренировались 💪' : daysAgo === 1 ? 'Последняя тренировка — вчера' : `Последняя тренировка — ${plural(daysAgo, 'день', 'дня', 'дней')} назад`;

  // неделя Пн–Вс
  const now = new Date(), dow = (now.getDay() + 6) % 7, monday = new Date(now); monday.setDate(now.getDate() - dow);
  const dates = new Set(S.sessions.map(s => s.date));
  const week = [...Array(7)].map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); const iso = localISO(d); return { l: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i], n: d.getDate(), done: dates.has(iso), today: iso === today() }; });
  const weekN = week.filter(x => x.done).length;

  const last = S.sessions.slice(-10);
  box.innerHTML = `
    <h1 class="hello">${S.profile.name ? `${greet}, <b>${esc(S.profile.name)}</b>!` : 'Готов к тренировке?'}</h1>
    <p class="hello-sub">${sub}</p>
    ${st ? `<div class="streak"><span class="fire">🔥</span> ${plural(st, 'день', 'дня', 'дней')} подряд</div>` : ''}
    <div class="stats">
      <div class="stat"><div class="stat-v" data-count="${total}" data-kind="int">0</div><div class="stat-l">тренировок</div></div>
      <div class="stat"><div class="stat-v" data-count="${vol}" data-kind="vol">0</div><div class="stat-l">${volLabel(vol)}</div></div>
      <div class="stat"><div class="stat-v" data-count="${recs.length}" data-kind="int">0</div><div class="stat-l">рекордов</div></div>
    </div>
    <div class="home-grid">
      <div class="card lift">
        <h2><span class="h2t">Эта неделя</span><small>${weekN} из 7</small></h2>
        <div class="week">${week.map((d, i) => `<div class="week-d" style="--i:${i}"><div class="week-cell ${d.done ? 'done' : ''} ${d.today ? 'today' : ''}">${d.done ? '✓' : `<span class="week-n">${d.n}</span>`}</div>${d.l}</div>`).join('')}</div>
      </div>
      <div class="card lift">
        <h2><span class="h2t">Объём тренировок</span></h2>
        ${lineChart(last.map(sumVol), last.map(s => human(s.date)))}
        <p class="hint">Тоннаж последних тренировок · нажмите на точку</p>
      </div>
      <div class="card lift">
        <h2><span class="h2t">Рекорды</span><small>по расчётному 1ПМ</small></h2>
        ${recs.length ? recs.slice(0, 6).map((r, i) => `
          <div class="rec ${i === 0 ? 'gold' : ''}" style="--i:${i}">
            <div class="medal">${i === 0 ? ICONS.crown : i + 1}</div>
            <div class="rec-info"><div class="rec-name">${esc(r.name)}</div><div class="rec-date">${human(r.date)} · ${r.w > 0 ? `${fmt(r.w)} кг × ${r.reps}` : `${r.reps} повт. (свой вес)`}</div></div>
            <div><div class="rec-val">${fmt(r.e1)}<small>кг</small></div><div class="rec-1rm">1ПМ</div></div>
          </div>`).join('') : emptyBox('trophy', 'Завершите первую тренировку —<br>рекорды появятся здесь')}
      </div>
      ${!S.active ? `<button class="btn primary wide big hero" id="homeStart" type="button">${ICONS.play} Начать тренировку</button>` : `<button class="btn primary wide big" id="homeStart" type="button">${ICONS.bell} Продолжить тренировку</button>`}
    </div>`;
  $$('#screen-home .stat-v').forEach(el => countUp(el, +el.dataset.count, el.dataset.kind === 'vol' ? fmtVol : fmtInt));
  tilt($$('#screen-home .stat'));
  $('#homeStart').onclick = () => { if (!S.active) startSession(); go('workout'); };
}

/* ---------- Аналитика ---------- */
let anDayId = null, anExId = null, anMetric = 'w';
function exHistory(exName) {
  const rows = [];
  for (const s of S.sessions) {
    const qs = s.sets.filter(q => q.name === exName); if (!qs.length) continue;
    rows.push({ s, qs, maxW: Math.max(...qs.map(q => +q.w || 0)), e1: Math.max(...qs.map(q => epley(+q.w || 0, +q.r || 0))), vol: qs.reduce((a, q) => a + setVol(q), 0) });
  }
  return rows.sort((a, b) => a.s.date < b.s.date ? -1 : a.s.date > b.s.date ? 1 : 0);
}
function renderAnalytics() {
  const box = $('#screen-analytics');
  const prevScroll = $$('#screen-analytics .chips').map(c => c.scrollLeft);
  // все упражнения (включая удалённые из плана, но встречавшиеся в истории)
  const allEx = [...new Set([...S.days.flatMap(d => d.exercises.map(e => e.name)), ...S.sessions.flatMap(s => s.sets.map(q => q.name))])];
  if (!allEx.length) { box.innerHTML = `<div class="screen-head"><h1>Аналитика</h1></div>${emptyBox('chart', 'Добавьте упражнения в расписание —<br>аналитика появится здесь')}`; return; }
  const day = S.days.find(d => d.id === anDayId) || S.days[0] || null;
  anDayId = day?.id || 'all';
  const exList = anDayId === 'all' || !day ? allEx : day.exercises.map(e => e.name);
  const exName = exList.includes(anExId) ? anExId : exList[0];
  anExId = exName;

  const rows = exName ? exHistory(exName) : [];
  const best = rows.reduce((m, r) => Math.max(m, r.maxW), 0), totalVol = rows.reduce((a, r) => a + r.vol, 0);
  const metricOf = r => anMetric === 'w' ? r.maxW : anMetric === 'e' ? r.e1 : r.vol;
  const vals = rows.map(metricOf);
  let trend = '';
  if (rows.length >= 2) {
    const a = metricOf(rows.at(-2)), b = metricOf(rows.at(-1)), d = a ? (b - a) / a * 100 : 0;
    trend = `<span class="trend ${d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat'}">${d > 0.5 ? '↑' : d < -0.5 ? '↓' : '→'} ${Math.abs(d).toFixed(0)}%</span>`;
  }
  // недельный объём (последние 8 недель)
  const weeks = {};
  for (const s of S.sessions) { const d = new Date(s.date + 'T00:00:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); const k = localISO(d); weeks[k] = (weeks[k] || 0) + sumVol(s); }
  const wk = Object.entries(weeks).sort().slice(-8);

  box.innerHTML = `
    <div class="screen-head"><h1>Аналитика</h1></div>
    <div class="card an-picker">
      <div class="sect-inline">День</div>
      <div class="chips">
        <button class="chip ${anDayId === 'all' ? 'on' : ''}" data-anday="all" type="button" style="--i:0">Все</button>
        ${S.days.map((d, i) => `<button class="chip ${d.id === anDayId ? 'on' : ''}" data-anday="${d.id}" type="button" style="--i:${i + 1}">${esc(d.name)}</button>`).join('')}
      </div>
      ${exList.length ? `<div class="sect-inline">Упражнение</div>
        <div class="chips">${exList.map((e, i) => `<button class="chip ${e === anExId ? 'on' : ''}" data-anex="${esc(e)}" type="button" style="--i:${i}">${esc(e)}</button>`).join('')}</div>
        <div class="sect-inline">Показатель</div>
        <div class="chips">
          <button class="chip ${anMetric === 'w' ? 'on' : ''}" data-anmetric="w" type="button">Макс. вес</button>
          <button class="chip ${anMetric === 'e' ? 'on' : ''}" data-anmetric="e" type="button">1ПМ</button>
          <button class="chip ${anMetric === 'v' ? 'on' : ''}" data-anmetric="v" type="button">Объём</button>
        </div>` : emptyBox('shrug', 'В этом дне нет упражнений')}
    </div>
    <div class="an-cols">
      <div class="an-col">
        <div class="card an-chart lift">
          <h2><span class="h2t">${esc(exName || 'Динамика')}</span>${trend}</h2>
          ${rows.length ? lineChart(vals, rows.map(r => human(r.s.date))) : emptyBox('bar', 'Пока нет данных —<br>выполните это упражнение на тренировке')}
          ${rows.length ? `<div class="stats an-stats">
              <div class="stat"><div class="stat-v">${fmt(best)}</div><div class="stat-l">лучший вес</div></div>
              <div class="stat"><div class="stat-v">${fmt(Math.max(...rows.map(r => r.e1)))}</div><div class="stat-l">1ПМ, кг</div></div>
              <div class="stat"><div class="stat-v">${fmtVol(totalVol)}</div><div class="stat-l">${volLabel(totalVol)}</div></div>
            </div>` : ''}
        </div>
        <div class="card lift">
          <h2><span class="h2t">Объём по неделям</span></h2>
          ${barChart(wk.map(x => x[1]), wk.map(x => human(x[0])))}
        </div>
      </div>
      <div class="an-col">
        <div class="sect">История упражнения</div>
        ${rows.length ? rows.slice().reverse().map((r, i) => `
          <div class="hist" data-session="${r.s.id}" style="--i:${i}">
            <div class="hist-info"><b>${human(r.s.date)} · ${esc(r.s.name || r.s.dayName)}</b>
              <div class="hist-sub">${r.qs.map(q => `${setCount(q)}×${fmt(q.w)}×${q.r}`).join(' · ')}</div></div>
            <div class="hist-vol">${fmt(metricOf(r))} кг</div><span class="hist-go">${ICONS.chevron}</span>
          </div>`).join('') : emptyBox('list', 'История пуста')}
      </div>
    </div>`;
  $$('#screen-analytics .chips').forEach((c, i) => { if (prevScroll[i]) c.scrollLeft = prevScroll[i]; });
}

/* ---------- Расписание ---------- */
function renderSchedule() {
  const box = $('#screen-schedule');
  box.innerHTML = `
    <div class="screen-head"><h1>Расписание</h1><button class="btn primary small" id="addDayBtn" type="button">${ICONS.plus} День</button></div>
    ${S.days.map((d, di) => `
      <div class="card day" data-id="${d.id}" style="animation-delay:${di * .06}s">
        <div class="day-head"><h3>${esc(d.name)}<span class="day-count">${d.exercises.length}</span></h3>
          <div class="row-btns">
            <button class="icon-btn" data-act="renDay" type="button" aria-label="Переименовать">${ICONS.pen}</button>
            <button class="icon-btn danger-h" data-act="delDay" type="button" aria-label="Удалить">${ICONS.trash}</button>
          </div></div>
        <div class="ex-list">${d.exercises.map((e, i) => `
          <div class="ex-item" data-ex="${e.id}" style="--i:${i}"><span class="ex-n">${i + 1}</span><span>${esc(e.name)}</span>
            <button class="icon-btn sm" data-act="renEx" data-ex="${e.id}" type="button" aria-label="Переименовать">${ICONS.pen}</button>
            <button class="icon-btn sm danger-h" data-act="delEx" data-ex="${e.id}" type="button" aria-label="Удалить">${ICONS.x}</button>
            <span class="drag" data-drag aria-label="Переместить">${ICONS.grip}</span>
          </div>`).join('') || emptyBox('list', 'Нет упражнений')}
        </div>
        <button class="btn ghost small" data-act="addEx" type="button">${ICONS.plus} Упражнение</button>
      </div>`).join('') || emptyBox('cal', 'Добавьте первый тренировочный день')}`;
  $('#addDayBtn').onclick = () => sheet('Новый день', [{ name: 'name', label: 'Название дня', ph: 'Например: День D — Руки', req: 1, attrs: 'maxlength="40"' }], d => {
    S.days.push({ id: uid(), name: d.name.trim(), exercises: [] });
    save(); rerender(renderSchedule); toast('День добавлен', '📅');
  });
  bindExDrag(box);
}
/* перетаскивание упражнений внутри дня (pointer events, работает и на тач) */
function bindExDrag(box) {
  let drag = null, list = null, ph = null;
  box.querySelectorAll('[data-drag]').forEach(h => h.addEventListener('pointerdown', e => {
    const item = h.closest('.ex-item'); list = item.parentElement; drag = item;
    h.setPointerCapture(e.pointerId); item.classList.add('dragging'); buzz(8);
    const move = ev => {
      const els = [...list.querySelectorAll('.ex-item:not(.dragging)')];
      els.forEach(x => x.classList.remove('drag-over'));
      const next = els.find(x => ev.clientY < x.getBoundingClientRect().top + x.offsetHeight / 2);
      if (next) { next.classList.add('drag-over'); ph = next; } else ph = null;
      const last = els.at(-1);
      if (!next && last) { list.appendChild(drag); } else if (next) list.insertBefore(drag, next);
    };
    const up = () => {
      h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up);
      list.querySelectorAll('.ex-item').forEach(x => x.classList.remove('dragging', 'drag-over'));
      const d = S.days.find(x => x.id === list.closest('.day').dataset.id);
      const order = [...list.querySelectorAll('.ex-item')].map(x => x.dataset.ex);
      d.exercises.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      save(); rerender(renderSchedule); drag = null;
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
  }));
}
function removeAnimated(el, done) { el.classList.add('removing'); el.addEventListener('animationend', done, { once: true }); setTimeout(done, 450); }

/* ---------- Тренировка ---------- */
let pendingFocusEx = null, sessTimerT = null, lastNewSet = null;
function startSession() { S.active = { id: uid(), name: '', dayId: null, date: today(), start: Date.now(), sets: [] }; save(); }
function collectDrafts() { const d = {}; $$('#screen-workout .set-form').forEach(f => { d[f.dataset.ex] = [f.k.value, f.w.value, f.r.value]; }); return d; }
function renderWorkout() {
  clearInterval(sessTimerT);
  const box = $('#screen-workout');
  if (S.active) return renderActive(box);
  box.innerHTML = `
    <div class="screen-head"><h1>Тренировка</h1></div>
    <button class="btn primary wide big hero" id="startBtn" type="button">${ICONS.play} Начать тренировку</button>
    ${S.sessions.length ? (() => { const l = S.sessions.at(-1); return `<div class="last-summary">${ICONS.check.replace('<svg', '<svg style="width:18px;height:18px;stroke:var(--ok);stroke-width:2.5;fill:none"')}<span>Последняя: <b>${esc(l.name || l.dayName)}</b> · ${human(l.date)}</span><span class="lsv">${fmt(sumVol(l))} кг</span></div>`; })() : `
    <div class="tips">
      <div class="tip" style="--i:0">${ICONS.cal}<div><b>1. Выберите день</b>план подтянется из расписания</div></div>
      <div class="tip" style="--i:1">${ICONS.plus}<div><b>2. Записывайте подходы</b>подходы × вес × повторы</div></div>
      <div class="tip" style="--i:2">${ICONS.timer}<div><b>3. Отдыхайте по таймеру</b>стартует сам после подхода</div></div>
      <div class="tip" style="--i:3">${ICONS.crown}<div><b>4. Бейте рекорды</b>PR отмечаем и празднуем</div></div>
    </div>`}
    <div class="sect">История</div>
    ${S.sessions.slice().reverse().slice(0, 15).map((s, i) => `
      <div class="hist" data-id="${s.id}" style="--i:${i}">
        <div class="hist-info"><b>${esc(s.name || s.dayName)}</b>
          <div class="hist-sub">${human(s.date)} · ${plural(setsN(s), 'подход', 'подхода', 'подходов')}${s.dur ? ' · ' + Math.round(s.dur / 60) + ' мин' : ''}</div></div>
        <div class="hist-vol">${fmt(sumVol(s))} кг</div>
        <div class="row-btns">
          <button class="icon-btn sm" data-hist="ren" type="button" aria-label="Переименовать">${ICONS.pen}</button>
          <button class="icon-btn sm danger-h" data-hist="del" type="button" aria-label="Удалить">${ICONS.trash}</button>
        </div>
        <span class="hist-go">${ICONS.chevron}</span>
      </div>`).join('') || emptyBox('list', 'История пуста — самое время начать')}`;
  $('#startBtn').onclick = () => { startSession(); renderWorkout(); };
}
function renderActive(box) {
  const a = S.active, drafts = collectDrafts();
  const day = S.days.find(d => d.id === a.dayId), exs = day ? day.exercises : [];
  const elapsed = () => { const s = Math.floor((Date.now() - (a.start || Date.now())) / 1000); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };
  box.innerHTML = `
    <div class="card session-top">
      <div class="session-meta">
        <input id="sessionName" class="session-name" type="text" maxlength="40" placeholder="Название тренировки" value="${esc(a.name)}" autocomplete="off">
        <div class="session-timer">${human(a.date)} · <span id="sessElapsed">${elapsed()}</span> · ${plural(setsN(a), 'подход', 'подхода', 'подходов')} · ${fmt(sumVol(a))} кг</div>
      </div>
      <button class="icon-btn" id="restBtn" type="button" aria-label="Таймер отдыха">${ICONS.timer}</button>
      <span class="live" aria-hidden="true"></span>
    </div>
    <div class="card day-pick">
      <div class="sect-inline">День тренировки</div>
      <div class="chips">${S.days.map((d, i) => `<button class="chip ${d.id === a.dayId ? 'on' : ''}" data-pick="${d.id}" type="button" style="--i:${i}">${esc(d.name)}</button>`).join('') || emptyBox('cal', 'Сначала создайте день в расписании')}</div>
    </div>
    ${day ? exs.map((e, ei) => {
        const sets = a.sets.filter(q => q.ex === e.id), prev = lastPerformance(e.name), before = bestBefore(e.name, a.id);
        return `<div class="card ex-card ${sets.length ? 'done-ex' : ''}" style="animation-delay:${ei * .05}s">
          ${sets.length ? `<span class="done-badge">${ICONS.check}</span>` : ''}
          <h3>${esc(e.name)}${prev && !sets.length ? `<span class="prev">прошлый раз: ${prev.k}×${fmt(prev.w)}×${prev.r}</span>` : ''}</h3>
          ${sets.length ? `<div class="sets">${sets.map((q, i) => `
            <div class="set-row ${q.id === lastNewSet ? 'new' : ''}"><span class="set-n">${i + 1}</span>
              <span class="set-val">${setCount(q)} × ${fmt(q.w)} <small>кг</small> × ${q.r}</span>
              ${before > 0 && epley(+q.w, +q.r) > before ? '<span class="set-pr">PR</span>' : ''}
              <button class="icon-btn sm danger-h" data-del="${q.id}" type="button" aria-label="Удалить запись">${ICONS.x}</button>
            </div>`).join('')}</div>` : ''}
          <form class="set-form" data-ex="${e.id}" novalidate>
            <div class="lbl"><span>подх.</span><span>вес, кг</span><span>повт.</span><span></span></div>
            <input name="k" type="number" min="1" max="50" value="${sets.at(-1) ? setCount(sets.at(-1)) : 3}" required inputmode="numeric" aria-label="Подходов">
            <input name="w" type="number" min="0" step="0.5" placeholder="${prev ? fmt(prev.w) : 'вес'}" required inputmode="decimal" aria-label="Вес">
            <input name="r" type="number" min="1" max="200" placeholder="${prev ? prev.r : 'повт'}" required inputmode="numeric" aria-label="Повторения" enterkeyhint="done">
            <button class="btn primary sq" type="submit" aria-label="Добавить">${ICONS.plus}</button>
          </form>
        </div>`;
      }).join('') || emptyBox('shrug', 'В этом дне нет упражнений —<br>добавьте их в расписании')
      : emptyBox('hand', 'Выберите день, чтобы вводить подходы')}
    <div class="session-actions">
      <button class="btn ghost" id="discardBtn" type="button">Прервать</button>
      <button class="btn primary" id="finishBtn" type="button">${ICONS.check} Завершить</button>
    </div>`;
  lastNewSet = null;
  sessTimerT = setInterval(() => { const el = $('#sessElapsed'); if (el) el.textContent = elapsed(); else clearInterval(sessTimerT); }, 1000);

  $$('#screen-workout .set-form').forEach(f => { const d = drafts[f.dataset.ex]; if (d) { f.k.value = d[0]; f.w.value = d[1]; f.r.value = d[2]; } });
  if (pendingFocusEx) { if (document.body.classList.contains('kb-open') || innerWidth >= 900) $(`#screen-workout .set-form[data-ex="${pendingFocusEx}"] input[name=w]`)?.focus({ preventScroll: true }); pendingFocusEx = null; }

  $('#sessionName').oninput = e => { a.name = e.target.value; save(); };
  $('#restBtn').onclick = () => startRest();
  $$('#screen-workout [data-pick]').forEach(c => c.onclick = () => { a.dayId = c.dataset.pick; save(); rerender(renderWorkout); });
  $$('#screen-workout .set-form').forEach(f => f.onsubmit = ev => {
    ev.preventDefault();
    const e = exs.find(x => x.id === f.dataset.ex);
    const k = Math.max(1, +f.k.value || 1), w = Math.max(0, +f.w.value || 0), r = +f.r.value || 0;
    if (!r || f.w.value === '') { const bad = !r ? f.r : f.w; bad.classList.remove('shake'); void bad.offsetWidth; bad.classList.add('shake'); bad.focus(); buzz(20); return; }
    const before = bestBefore(e.name, a.id);
    const newId = uid();
    a.sets.push({ id: newId, ex: e.id, name: e.name, k, w, r });
    pendingFocusEx = e.id; lastNewSet = newId; buzz(10);
    save(); rerender(renderWorkout);
    if (before > 0 && epley(w, r) > before) { celebrate(); buzz([20, 40, 20, 40, 40]); toast(`Новый рекорд: ${e.name}!`, '🏆'); }
    startRest(); // автостарт таймера отдыха
  });
  $$('#screen-workout [data-del]').forEach(b => b.onclick = () => {
    removeAnimated(b.closest('.set-row'), () => { a.sets = a.sets.filter(q => q.id !== b.dataset.del); save(); rerender(renderWorkout); });
  });
  $('#discardBtn').onclick = () => confirmSheet('Прервать тренировку? Введённые подходы не сохранятся.', () => { S.active = null; stopRest(); save(); renderWorkout(); toast('Тренировка отменена', '🚪'); }, 'Прервать', 'Продолжить');
  $('#finishBtn').onclick = () => {
    if (!a.sets.length) { toast('Добавьте хотя бы одну запись', '✍️'); return; }
    const recsBefore = records().length;
    S.sessions.push({ id: a.id, name: a.name.trim() || (day ? day.name : 'Тренировка'), dayId: a.dayId, dayName: day ? day.name : '', date: a.date, dur: a.start ? Math.round((Date.now() - a.start) / 1000) : 0, sets: a.sets });
    S.sessions.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
    S.active = null; stopRest(); save();
    buzz([12, 40, 18]); celebrate(true);
    toast(records().length > recsBefore ? 'Тренировка сохранена + новые рекорды!' : 'Тренировка сохранена', '🎉');
    go('home');
  };
}

/* ---------- таймер отдыха ---------- */
const rest = { left: 0, total: 0, t: null, end: 0 };
const CIRC = 263.9;
function drawRest() {
  const el = $('#rest'); if (el.hidden) return;
  $('#restTime').textContent = `${Math.floor(rest.left / 60)}:${pad2(rest.left % 60)}`;
  const p = rest.left / Math.max(rest.total, 1);
  $('#restProg').style.strokeDashoffset = CIRC * (1 - p);
  $('#restBar').style.transform = `scaleX(${p})`;
  el.classList.toggle('warn', rest.left <= 5 && rest.left > 0);
}
function startRest(sec = S.restSec || 90) {
  const el = $('#rest');
  rest.total = rest.left = sec; rest.end = Date.now() + sec * 1000;
  el.hidden = false; el.classList.remove('out', 'warn'); drawRest();
  clearInterval(rest.t);
  rest.t = setInterval(() => {
    rest.left = Math.max(0, Math.round((rest.end - Date.now()) / 1000)); drawRest();
    if (rest.left <= 0) { clearInterval(rest.t); buzz([80, 60, 80, 60, 160]); toast('Отдых окончен — погнали!', '⚡'); setTimeout(stopRest, 700); }
  }, 250);
}
function stopRest() {
  clearInterval(rest.t);
  const el = $('#rest'); if (el.hidden) return;
  el.classList.add('out'); setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 350);
}
function adjustRest(d) { rest.left = Math.max(0, rest.left + d); rest.total = Math.max(rest.total, rest.left); rest.end = Date.now() + rest.left * 1000; drawRest(); }

/* ---------- Профиль ---------- */
function renderProfile() {
  const box = $('#screen-profile');
  const wl = S.weightLog.slice(-20);
  const wDiff = wl.length >= 2 ? wl.at(-1).v - wl[0].v : 0;
  box.innerHTML = `
    <div class="screen-head"><h1>Профиль</h1></div>
    <div class="card">
      <label class="field"><span>Имя</span><input id="pName" type="text" placeholder="Как вас зовут?" maxlength="30" autocomplete="off" value="${esc(S.profile.name)}"></label>
      <div class="grid2">
        <label class="field"><span>Возраст</span><input id="pAge" type="number" min="5" max="120" placeholder="лет" inputmode="numeric" value="${esc(S.profile.age)}"></label>
        <label class="field"><span>Вес, кг</span><input id="pWeight" type="number" min="20" max="300" step="0.1" placeholder="кг" inputmode="decimal" value="${esc(S.profile.weight)}"></label>
      </div>
      <label class="field" style="margin-bottom:0"><span>Отдых между подходами <span class="range-val" id="restVal">${S.restSec} с</span></span>
        <input id="pRest" type="range" min="30" max="300" step="15" value="${S.restSec}" style="--pct:${(S.restSec - 30) / 270 * 100}%"></label>
    </div>
    <div class="card lift">
      <h2><span class="h2t">Динамика веса</span>${wl.length >= 2 ? `<span class="trend ${wDiff < 0 ? 'down' : wDiff > 0 ? 'up' : 'flat'}">${wDiff > 0 ? '+' : ''}${fmt(wDiff)} кг</span>` : ''}</h2>
      ${lineChart(wl.map(w => w.v), wl.map(w => human(w.d)))}
    </div>
    ${mode === 'server' ? `<div class="card"><h2><span class="h2t">Аккаунт</span></h2>
      <p class="hint" style="margin:0 0 12px">Вы вошли как <b>${esc(userLogin)}</b>. Данные хранятся в базе и доступны с любого устройства.</p>
      <button class="btn ghost" id="logoutBtn" type="button" style="width:100%">Выйти</button></div>`
    : `<div class="card"><h2><span class="h2t">Гостевой режим</span></h2>
      <p class="hint" style="margin:0 0 12px">Данные хранятся только в этом браузере.${serverAvailable ? ' Войдите в аккаунт, чтобы синхронизировать между устройствами.' : ''}</p>
      ${serverAvailable ? '<button class="btn primary" id="loginBtn" type="button" style="width:100%">Войти / Регистрация</button>' : ''}</div>`}
    <div class="card">
      <h2><span class="h2t">Данные</span></h2>
      <div class="grid2">
        <button class="btn ghost" id="exportBtn" type="button">${ICONS.export} Экспорт</button>
        <button class="btn ghost" id="importBtn" type="button">Импорт JSON</button>
      </div>
      <input type="file" id="importFile" accept="application/json" hidden>
      <p class="hint">Сброс удалит все тренировки и расписание${mode === 'server' ? ' в этом аккаунте' : ' на этом устройстве'}.</p>
      <button class="btn danger" id="resetBtn" type="button" style="margin-top:8px">Сбросить все данные</button>
    </div>
    <p class="foot"><b>GymLog</b> v2 · сделано с любовью к железу</p>`;
  $('#pName').oninput = e => { S.profile.name = e.target.value.trim(); save(); };
  $('#pAge').onchange = e => { S.profile.age = +e.target.value || ''; save(); };
  $('#pWeight').onchange = e => {
    const v = +e.target.value || '';
    if (v) { const last = S.weightLog.at(-1); if (last && last.d === today()) last.v = v; else if (!last || last.v !== v) S.weightLog.push({ d: today(), v }); } // FIX: одна запись в день
    S.profile.weight = v; save(); rerender(renderProfile);
  };
  $('#pRest').oninput = e => { S.restSec = +e.target.value; const v = $('#restVal'); v.textContent = S.restSec + ' с'; v.classList.remove('bump'); void v.offsetWidth; v.classList.add('bump'); e.target.style.setProperty('--pct', (S.restSec - 30) / 270 * 100 + '%'); };
  $('#pRest').onchange = () => save();
  $('#logoutBtn') && ($('#logoutBtn').onclick = async () => { try { await api.call('/logout', 'POST'); } catch {} logoutLocal(); });
  $('#loginBtn') && ($('#loginBtn').onclick = () => { localStorage.removeItem('gymlog.guest'); showAuth(); });
  $('#exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gymlog-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Экспорт готов', '📦');
  };
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const s = normState(JSON.parse(await f.text())); if (!s.days) throw 0;
      confirmSheet('Заменить текущие данные импортированными?', () => { S = s; save(); go('home'); toast('Данные импортированы', '✅'); }, 'Заменить');
    } catch { toast('Не удалось прочитать файл', '❌'); }
  };
  $('#resetBtn').onclick = () => confirmSheet('Удалить все данные и начать заново?', () => { S = seed(); save(); go('home'); toast('Данные сброшены', '🧹'); });
}

/* ---------- Вход ---------- */
let authMode = 'login', serverAvailable = false;
function setAuthMode(m) {
  authMode = m;
  $('#authTabs').classList.toggle('right', m === 'register');
  $('#tabLogin').classList.toggle('on', m === 'login'); $('#tabReg').classList.toggle('on', m === 'register');
  $('#tabLogin').setAttribute('aria-selected', m === 'login'); $('#tabReg').setAttribute('aria-selected', m === 'register');
  $('#authSubmit .btn-label').textContent = m === 'login' ? 'Войти' : 'Создать аккаунт';
  $('#aPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
}
async function enterServer() {
  const me = await api.call('/me');
  userLogin = me.login; mode = 'server'; DB.setUser(userLogin); localStorage.setItem('gymlog.login', userLogin); localStorage.removeItem('gymlog.guest');
  const { state } = await api.call('/state');
  if (state && state.days) S = normState(state);
  else {
    // FIX: только для нового аккаунта предлагаем перенести гостевые данные — и только если они есть
    const guest = (() => { try { return JSON.parse(localStorage.getItem('gymlog.v2.guest') || localStorage.getItem('gymlog.v1')); } catch { return null; } })();
    S = guest && guest.sessions && guest.sessions.length ? normState(guest) : seed();
    dirty = true; flush();
  }
  DB.save(); setSync('online');
  document.body.classList.remove('auth-mode');
  go(screens.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
}
function logoutLocal() {
  localStorage.removeItem('gymlog.token'); localStorage.removeItem('gymlog.login'); localStorage.removeItem('gymlog.guest'); api.token = ''; mode = 'guest'; userLogin = ''; dirty = false;
  DB.setUser(''); S = DB.load(); stopRest(); setSync('guest'); showAuth();
}
function showAuth() {
  document.body.classList.add('auth-mode'); setAuthMode('login'); $('#authError').textContent = '';
  $('#guestBtn').hidden = false;
  setTimeout(() => $('#aLogin')?.focus(), 400);
}
function enterGuest() {
  mode = 'guest'; DB.setUser(''); S = DB.load(); DB.save(); setSync('guest');
  document.body.classList.remove('auth-mode');
  go(screens.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
}
function bindAuth() {
  $('#tabLogin').onclick = () => setAuthMode('login'); $('#tabReg').onclick = () => setAuthMode('register');
  $('#guestBtn').onclick = () => { localStorage.setItem('gymlog.guest', '1'); enterGuest(); toast('Гостевой режим — данные только на этом устройстве', '👤'); };
  const eye = $('#passEye'), pass = $('#aPass');
  eye.innerHTML = ICONS.eye;
  eye.onclick = () => {
    const show = pass.type === 'password'; pass.type = show ? 'text' : 'password';
    eye.innerHTML = show ? ICONS.eyeOff : ICONS.eye; eye.classList.toggle('on', show);
    eye.setAttribute('aria-pressed', String(show)); eye.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
    pass.focus({ preventScroll: true });
  };
  $('#authForm').onsubmit = async ev => {
    ev.preventDefault();
    const btn = $('#authSubmit'), login = $('#aLogin').value.trim(), pw = pass.value;
    $('#authError').textContent = '';
    if (!login || !pw) { const bad = !login ? $('#aLogin') : pass; bad.classList.remove('shake'); void bad.offsetWidth; bad.classList.add('shake'); bad.focus(); return; }
    btn.disabled = true; btn.classList.add('loading');
    try {
      const data = await api.call('/' + authMode, 'POST', { login, password: pw });
      api.token = data.token; localStorage.setItem('gymlog.token', data.token);
      pass.value = ''; if (pass.type === 'text') eye.click();
      await enterServer();
      toast(authMode === 'login' ? 'С возвращением!' : 'Аккаунт создан', authMode === 'login' ? '👋' : '🎉');
    } catch (e) {
      $('#authError').textContent = ''; void $('#authError').offsetWidth; $('#authError').textContent = e.message; buzz(30);
    } finally { btn.disabled = false; btn.classList.remove('loading'); setAuthMode(authMode); }
  };
}

/* ---------- роутер ---------- */
const screens = ['home', 'analytics', 'schedule', 'workout', 'profile'];
const NAV = [['home', 'Главная', ICONS.home], ['analytics', 'Аналитика', ICONS.chart], ['schedule', 'План', ICONS.cal], ['workout', 'Зал', ICONS.bell], ['profile', 'Профиль', ICONS.user]];
const render = { home: renderHome, analytics: renderAnalytics, schedule: renderSchedule, workout: renderWorkout, profile: renderProfile };
let curScreen = null;
function movePill(pill, btn) { if (!pill || !btn) return; pill.style.opacity = 1; pill.style.width = btn.offsetWidth + 'px'; pill.style.height = btn.offsetHeight + 'px'; pill.style.transform = `translate(${btn.offsetLeft}px,${btn.offsetTop}px)`; }
function swapScreens(prev, next) {
  const nextEl = $('#screen-' + next), prevEl = $('#screen-' + prev);
  if (reduceMotion.matches || !prevEl || prev === next) {
    prevEl?.classList.remove('active', 'leaving', 'to-l', 'to-r'); nextEl.classList.add('active'); return;
  }
  const dir = screens.indexOf(next) > screens.indexOf(prev) ? 'r' : 'l';
  // уходящий экран — статичный «снимок»: клон без анимаций, оригинал сразу освобождается
  const ghost = prevEl.cloneNode(true);
  ghost.id = ''; ghost.className = 'screen ghost leaving ' + (dir === 'r' ? 'to-l' : 'to-r');
  ghost.style.height = prevEl.offsetHeight + 'px';
  ghost.setAttribute('aria-hidden', 'true');
  prevEl.classList.remove('active');
  prevEl.innerHTML = ''; // чистим, чтобы при возврате всё отрисовалось заново с анимациями
  nextEl.after(ghost);
  ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
  setTimeout(() => ghost.remove(), 500);
  nextEl.classList.remove('entering', 'from-r', 'from-l');
  void nextEl.offsetWidth;
  nextEl.classList.add('active', 'entering', 'from-' + dir);
  nextEl.addEventListener('animationend', function h(e) { if (e.target === nextEl) { nextEl.classList.remove('entering', 'from-r', 'from-l'); nextEl.removeEventListener('animationend', h); } });
  setTimeout(() => nextEl.classList.remove('entering', 'from-r', 'from-l'), 600);
}
function go(name) {
  $$('.no-anim').forEach(b => b.classList.remove('no-anim'));
  const prev = curScreen && screens.includes(curScreen) ? curScreen : null;
  if (prev) swapScreens(prev, name); else screens.forEach(n => $('#screen-' + n).classList.toggle('active', n === name));
  curScreen = name;
  $$('[data-tab]').forEach(el => { const on = el.dataset.tab === name; el.classList.toggle('active', on); on ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current'); });
  movePill($('.tab-pill'), $(`.tabbar [data-tab="${name}"]`)); movePill($('.side-pill'), $(`.sidebar [data-tab="${name}"]`));
  render[name]();
  updateBadges(); requestAnimationFrame(() => { updateChips(); reveal($('#screen-' + name)); });
  try { if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name); } catch {}
  window.scrollTo({ top: 0, behavior: 'instant' });
}
const rerender = fn => { $('#screen-' + curScreen).classList.add('no-anim'); fn(); updateBadges(); updateChips(); };
function updateBadges() {
  $$('[data-tab="workout"] .badge').forEach(b => b.remove());
  if (S.active) $$('[data-tab="workout"]').forEach(b => b.insertAdjacentHTML('beforeend', '<span class="badge"></span>'));
}

/* ---------- события ---------- */
function bindEvents() {
  makeSheetDraggable();
  $('#tabs').insertAdjacentHTML('beforeend', NAV.map(([id, l, ic]) => `<button class="tab" data-tab="${id}" type="button">${ic}<span>${l}</span></button>`).join(''));
  $('#sideNav').insertAdjacentHTML('beforeend', NAV.map(([id, l, ic], i) => `<button class="side-link" data-tab="${id}" type="button" style="--i:${i}">${ic}<span>${l}</span></button>`).join(''));
  $$('[data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));
  addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet').classList.contains('open')) setSheetOpen(false); });
  addEventListener('resize', () => { movePill($('.tab-pill'), $('.tabbar .tab.active')); movePill($('.side-pill'), $('.sidebar .side-link.active')); });
  addEventListener('hashchange', () => { const n = location.hash.slice(1); if (screens.includes(n) && !document.body.classList.contains('auth-mode') && n !== curScreen) go(n); });
  $$('.theme-btn').forEach(b => b.onclick = toggleTheme);

  // Нижний UI (таббар, таймер, тост) прибивается к низу ВИЗУАЛЬНОГО viewport'а.
  // На мобильном Chrome/PWA CSS `bottom` у fixed считается от layout-viewport и уезжает.
  const dock = $('#dock');
  let lastTop = -1;
  const pinBottomUI = () => {
    if (innerWidth >= 900) { dock.style.top = ''; $('#toast').style.top = ''; document.documentElement.style.setProperty('--tab-space', '40px'); lastTop = -1; return; }
    const vv = window.visualViewport;
    const h = vv ? vv.height : innerHeight, off = vv ? vv.offsetTop : 0;
    const dockH = dock.offsetHeight || 66;
    const bottom = off + h - safeProbe.offsetHeight - 12;
    const top = Math.round(bottom - dockH);
    if (top !== lastTop) { dock.style.top = top + 'px'; lastTop = top; }
    $('#toast').style.top = (top - 60) + 'px';
    document.documentElement.style.setProperty('--tab-space', (dockH + 40) + 'px');
  };
  const safeProbe = document.createElement('div');
  safeProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom);pointer-events:none;visibility:hidden';
  document.body.appendChild(safeProbe);
  addEventListener('resize', pinBottomUI); addEventListener('orientationchange', () => setTimeout(pinBottomUI, 80));
  if (window.visualViewport) { visualViewport.addEventListener('resize', pinBottomUI); visualViewport.addEventListener('scroll', pinBottomUI); }
  addEventListener('scroll', pinBottomUI, { passive: true });
  new ResizeObserver(pinBottomUI).observe(dock); // таймер появился/исчез — док пересчитал top
  pinBottomUI(); setTimeout(pinBottomUI, 300); setTimeout(pinBottomUI, 1500);

  // клавиатура: только по реальному сжатию визуального viewport (visualViewport),
  // а не по фокусу — иначе панель мигает при автопереходе фокуса и на десктопе
  if (window.visualViewport) {
    let baseH = visualViewport.height;
    visualViewport.addEventListener('resize', () => {
      if (visualViewport.height > baseH) baseH = visualViewport.height;
      document.body.classList.toggle('kb-open', baseH - visualViewport.height > 160);
    });
    addEventListener('orientationchange', () => setTimeout(() => { baseH = visualViewport.height; document.body.classList.remove('kb-open'); }, 300));
  }

  // таймер отдыха
  $$('#rest [data-rest]').forEach(b => b.onclick = () => { const v = b.dataset.rest; if (v === 'stop') stopRest(); else adjustRest(+v); buzz(6); });

  // делегирование: расписание
  $('#screen-schedule').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-act]'); if (!btn) return;
    const d = S.days.find(x => x.id === btn.closest('.day')?.dataset.id); if (!d) return;
    const act = btn.dataset.act;
    if (act === 'delDay') confirmSheet(`Удалить «${esc(d.name)}»?`, () => {
      removeAnimated(btn.closest('.day'), () => { S.days = S.days.filter(x => x !== d); if (S.active?.dayId === d.id) S.active.dayId = null; save(); rerender(renderSchedule); toast('День удалён', '🗑️'); });
    });
    if (act === 'renDay') sheet('Переименовать день', [{ name: 'name', label: 'Название', value: d.name, req: 1, attrs: 'maxlength="40"' }], r => { d.name = r.name.trim(); save(); rerender(renderSchedule); });
    if (act === 'addEx') sheet('Новое упражнение', [{ name: 'name', label: 'Упражнение', ph: 'Например: Жим лёжа', req: 1, attrs: 'maxlength="50"' }], x => { d.exercises.push({ id: uid(), name: x.name.trim() }); save(); rerender(renderSchedule); });
    if (act === 'renEx') { const e = d.exercises.find(x => x.id === btn.dataset.ex); sheet('Переименовать упражнение', [{ name: 'name', label: 'Название', value: e.name, req: 1, attrs: 'maxlength="50"' }], r => { e.name = r.name.trim(); save(); rerender(renderSchedule); }); }
    if (act === 'delEx') removeAnimated(btn.closest('.ex-item'), () => { d.exercises = d.exercises.filter(x => x.id !== btn.dataset.ex); save(); rerender(renderSchedule); });
  });
  // история тренировок
  $('#screen-workout').addEventListener('click', ev => {
    const b = ev.target.closest('[data-hist]');
    if (b) {
      const s = S.sessions.find(x => x.id === b.closest('.hist').dataset.id); if (!s) return;
      if (b.dataset.hist === 'del') confirmSheet(`Удалить тренировку «${esc(s.name || s.dayName)}»?`, () => {
        removeAnimated(b.closest('.hist'), () => { S.sessions = S.sessions.filter(x => x !== s); save(); rerender(renderWorkout); buzz(12); toast('Тренировка удалена', '🗑️'); });
      });
      else sheet('Переименовать тренировку', [{ name: 'name', label: 'Название', value: s.name || s.dayName, req: 1, attrs: 'maxlength="40"' }], r => { s.name = r.name.trim(); save(); rerender(renderWorkout); });
      return;
    }
    const h = ev.target.closest('.hist[data-id]'); if (h) { const s = S.sessions.find(x => x.id === h.dataset.id); if (s) sessionSheet(s); }
  });
  // аналитика
  $('#screen-analytics').addEventListener('click', ev => {
    const dc = ev.target.closest('[data-anday]'); if (dc) { anDayId = dc.dataset.anday; anExId = null; rerender(renderAnalytics); return; }
    const ec = ev.target.closest('[data-anex]'); if (ec) { anExId = ec.dataset.anex; rerender(renderAnalytics); return; }
    const m = ev.target.closest('[data-anmetric]'); if (m) { anMetric = m.dataset.anmetric; rerender(renderAnalytics); return; }
    const h = ev.target.closest('[data-session]'); if (h) { const s = S.sessions.find(x => x.id === h.dataset.session); if (s) sessionSheet(s); }
  });
}

/* ---------- старт ---------- */
(async function boot() {
  const t0 = performance.now();
  applyTheme(); bindEvents(); bindAuth();
  serverAvailable = await api.ping();
  const finishBoot = () => {
    const wait = Math.max(0, 1400 - (performance.now() - t0)); // дать сплэшу дожить до конца анимации
    setTimeout(() => {
      document.body.classList.remove('booting');
      $('#splash').classList.add('hide');
      requestAnimationFrame(() => { movePill($('.tab-pill'), $('.tabbar .tab.active')); movePill($('.side-pill'), $('.sidebar .side-link.active')); });
      if (S.active && curScreen === 'workout') { /* таймер отдыха не восстанавливаем — нет смысла */ }
    }, wait);
  };
  if (serverAvailable) {
    if (api.token) {
      try { await enterServer(); return finishBoot(); }
      catch (e) {
        if (e.status === 401) { localStorage.removeItem('gymlog.token'); api.token = ''; }
        else { // сеть моргнула / холодный старт БД — не выкидываем на логин, работаем из кэша
          mode = 'server'; userLogin = localStorage.getItem('gymlog.login') || ''; DB.setUser(userLogin); S = DB.load(); setSync('offline'); dirty = true;
          document.body.classList.remove('auth-mode');
          go(screens.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
          setTimeout(flush, 3000);
          return finishBoot();
        }
      }
    }
    if (localStorage.getItem('gymlog.guest') === '1') enterGuest(); else showAuth();
  } else {
    enterGuest();
  }
  finishBoot();
})();

/* ---------- Service Worker + мягкое обновление ---------- */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const offerUpdate = sw => {
        const t = $('#toast');
        t.querySelector('.toast-msg').innerHTML = 'Доступна новая версия · <b style="text-decoration:underline;cursor:pointer" id="swReload">Обновить</b>';
        t.querySelector('.toast-ico').textContent = '✨';
        t.style.pointerEvents = 'auto'; t.classList.add('show'); clearTimeout(toastT);
        $('#swReload').onclick = () => { sw.postMessage('SKIP_WAITING'); };
      };
      if (reg.waiting) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw); });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000); // проверка раз в час
    } catch {}
  });
}
addEventListener('offline', () => { if (mode === 'server') { setSync('offline'); toast('Нет сети — изменения сохранятся локально', '📴'); } });
addEventListener('online', () => { if (mode === 'server') toast('Сеть вернулась — синхронизирую', '📶'); });
