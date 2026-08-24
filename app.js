'use strict';
/* ================================================================
   GymLog · PWA-дневник тренировок, чистый JS без зависимостей

   Данные:
   • С сервером (node server.js или деплой на Vercel) — у каждого
     пользователя своя база: локально SQLite, на деплое PostgreSQL.
     Вход по логину и паролю, состояние синхронизируется с сервером.
   • Без сервера (просто статика) — гостевой режим на localStorage:
     приложение стартует сразу, ничего не ругается.
   ================================================================ */

/* ---------- утилиты ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = n => (n == null || n === '') ? '—' : Number(n).toLocaleString('ru-RU');
const today = () => new Date().toISOString().slice(0, 10);
const human = d => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const setCount = q => +q.k || 1; // q.k — сколько подходов в записи (старый формат = 1 подход)
const sumVol = s => s.sets.reduce((a, q) => a + setCount(q) * (+q.w || 0) * (+q.r || 0), 0);

const ICONS = {
  plus : '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  x    : '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pen  : '<svg viewBox="0 0 24 24"><path d="M4 20l4-1L20 7l-3-3L5 16l-1 4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>',
  play : '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 7"/></svg>',
  moon : '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
  sun  : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
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
  theme: 'light',
});

/* локальный кэш (гостевой режим + офлайн-копия состояния) */
const DB = {
  key: 'gymlog.v1',
  load() {
    try { const s = JSON.parse(localStorage.getItem(this.key)); return s && s.days && s.profile ? s : seed(); }
    catch { return seed(); }
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(S)); } catch {} },
};

let S = DB.load();
let mode = 'guest';      // 'guest' | 'server'
let userLogin = '';

/* ---------- API-клиент ---------- */
const api = {
  token: localStorage.getItem('gymlog.token') || '',
  async call(path, method = 'GET', body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), path === '/ping' ? 2500 : 10000);
    try {
      const res = await fetch('/api' + path, {
        method,
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
    // две попытки с щедрым таймаутом: первый запрос может попасть в холодный
    // старт serverless-функции, второй обычно идёт по тёплому инстансу
    for (let i = 0; i < 2; i++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch('/api/ping', { signal: ctrl.signal });
        if (res.ok) return true;
      } catch {} finally { clearTimeout(t); }
    }
    return false;
  },
};

/* сохранение: всегда в локальный кэш; при работе с сервером — ещё и PUT (с дебаунсом) */
let syncT;
function save() {
  DB.save();
  if (mode !== 'server') return;
  clearTimeout(syncT);
  syncT = setTimeout(() => api.call('/state', 'PUT', S).catch(() => {}), 400);
}
/* досылаем состояние при закрытии вкладки */
addEventListener('pagehide', () => {
  if (mode === 'server' && api.token) {
    try {
      fetch('/api/state', {
        method: 'PUT', keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + api.token },
        body: JSON.stringify(S),
      }).catch(() => {});
    } catch {}
  }
});

/* ---------- тема ---------- */
function applyTheme() {
  document.documentElement.dataset.theme = S.theme;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = S.theme === 'dark' ? '#151109' : '#FF7A1A';
  const icon = S.theme === 'dark' ? ICONS.sun : ICONS.moon;
  $('#themeBtn').innerHTML = icon;
  $('#themeBtnSide').innerHTML = icon;
}

/* ---------- тост ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- шторка ---------- */
function sheet(title, fields, onOk, okText = 'Сохранить') {
  const el = $('#sheet'), bd = $('#sheetBackdrop');
  el.innerHTML = `<div class="sheet-handle"></div><h3>${title}</h3>
    <form>${fields.map(f => `
      <label class="field"><span>${f.label}</span>
        <input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}"
               placeholder="${esc(f.ph || '')}" ${f.req ? 'required' : ''} autocomplete="off">
      </label>`).join('')}
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-cancel>Отмена</button>
        <button type="submit" class="btn primary">${okText}</button>
      </div>
    </form>`;
  const close = () => { el.classList.remove('open'); bd.classList.remove('open'); };
  el.querySelector('[data-cancel]').onclick = close;
  bd.onclick = close;
  el.querySelector('form').onsubmit = ev => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target).entries());
    close(); onOk(data);
  };
  el.classList.add('open'); bd.classList.add('open');
  setTimeout(() => el.querySelector('input')?.focus(), 380);
}

/* ---------- подтверждение (тематическая замена confirm()) ---------- */
function confirmSheet(text, onYes, yesText = 'Удалить') {
  const el = $('#sheet'), bd = $('#sheetBackdrop');
  el.innerHTML = `<div class="sheet-handle"></div><p class="confirm-text">${text}</p>
    <div class="sheet-actions">
      <button type="button" class="btn ghost" data-cancel>Отмена</button>
      <button type="button" class="btn danger" data-yes>${yesText}</button>
    </div>`;
  const close = () => { el.classList.remove('open'); bd.classList.remove('open'); };
  el.querySelector('[data-cancel]').onclick = close;
  bd.onclick = close;
  el.querySelector('[data-yes]').onclick = () => { close(); onYes(); };
  el.classList.add('open'); bd.classList.add('open');
}

/* ---------- детали тренировки (read-only шторка) ---------- */
function sessionSheet(s) {
  const el = $('#sheet'), bd = $('#sheetBackdrop');
  const byEx = new Map();
  for (const q of s.sets) {
    if (!byEx.has(q.name)) byEx.set(q.name, []);
    byEx.get(q.name).push(q);
  }
  const setsN = s.sets.reduce((a, q) => a + setCount(q), 0);
  el.innerHTML = `<div class="sheet-handle"></div>
    <h3>${esc(s.name || s.dayName || 'Тренировка')}</h3>
    <p class="sheet-sub">${human(s.date)}${s.dayName ? ' · ' + esc(s.dayName) : ''} · ${setsN} подходов · ${fmt(sumVol(s))} кг</p>
    <div class="sheet-scroll">${[...byEx].map(([name, qs]) => `
      <div class="detail-ex">
        <div class="detail-name">${esc(name)}</div>
        ${qs.map(q => `
          <div class="detail-set">
            <span class="detail-dot"></span>
            <span>${setCount(q)} × ${fmt(q.w)} кг × ${q.r} повт.</span>
            <b>${fmt(setCount(q) * (+q.w || 0) * (+q.r || 0))} кг</b>
          </div>`).join('')}
      </div>`).join('')}
    </div>
    <div class="sheet-actions">
      <button type="button" class="btn ghost" data-cancel>Закрыть</button>
    </div>`;
  const close = () => { el.classList.remove('open'); bd.classList.remove('open'); };
  el.querySelector('[data-cancel]').onclick = close;
  bd.onclick = close;
  el.classList.add('open'); bd.classList.add('open');
}

/* ---------- драг шторки за любую точку (кроме полей/кнопок) ---------- */
function makeSheetDraggable() {
  const el = $('#sheet'), bd = $('#sheetBackdrop');
  let startY = 0, currentY = 0, dragging = false;

  el.addEventListener('pointerdown', e => {
    if (e.target.closest('input,button,form,select,textarea,.sheet-scroll')) return;
    dragging = true;
    startY = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.style.transition = 'none'; // на время драга — 1:1 без CSS-transition
  });

  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    currentY = Math.max(0, e.clientY - startY); // тянуть можно только вниз
    el.style.transform = `translateY(${currentY}px)`;
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    el.style.transition = '';
    if (currentY > 90) { el.classList.remove('open'); bd.classList.remove('open'); }
    el.style.transform = '';
    currentY = 0;
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
}

/* ---------- прокрутка рядов чипсов: колесо и драг мышью (десктоп) ---------- */
document.addEventListener('wheel', e => {
  const c = e.target.closest('.chips');
  if (!c || c.scrollWidth <= c.clientWidth) return;
  if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
    c.scrollLeft += e.deltaY;
    e.preventDefault();
  }
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
    if (!el) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    if (moved) el.scrollLeft = startLeft - dx;
  });
  const up = () => {
    if (el && moved) // после прокрутки клик не должен выбирать чип
      el.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true });
    el = null; moved = false;
  };
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
})();

/* ---------- графики (чистый SVG) ---------- */
let gid = 0;
function lineChart(vals, labels = [], unit = 'кг') {
  if (!vals.length) return '<div class="empty">Пока нет данных</div>';
  const w = 340, h = 130, p = 14, id = 'g' + (++gid);
  const max = Math.max(...vals), min = Math.min(...vals);
  const X = i => vals.length > 1 ? p + i * (w - 2 * p) / (vals.length - 1) : w / 2;
  const Y = v => max > min ? h - p - (v - min) / (max - min) * (h - 2 * p) : h / 2;
  const pts = vals.map((v, i) => [+X(i).toFixed(1), +Y(v).toFixed(1)]);
  const line = pts.map((pt, i) => (i ? 'L' : 'M') + pt[0] + ' ' + pt[1]).join(' ');
  const area = line + ` L ${pts.at(-1)[0]} ${h - 4} L ${pts[0][0]} ${h - 4} Z`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".32"/>
      <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/>
    <path d="${line}" class="line"/>
    ${pts.map((pt, i) => `<circle class="dot" style="--i:${i}" cx="${pt[0]}" cy="${pt[1]}" r="3.2">
      <title>${labels[i] || ''} — ${fmt(vals[i])} ${unit}</title></circle>`).join('')}
  </svg>`;
}

/* ---------- рекорды ---------- */
function records() {
  const map = {};
  for (const s of S.sessions) for (const q of s.sets) {
    const r = map[q.name] || { w: 0, reps: 0, date: s.date };
    if (+q.w > r.w) { r.w = +q.w; r.reps = +q.r; r.date = s.date; }
    map[q.name] = r;
  }
  return Object.entries(map)
    .map(([name, v]) => ({ name, ...v, rm: Math.round(v.w * (1 + v.reps / 30)) }))
    .sort((a, b) => b.w - a.w);
}

/* ---------- главный экран ---------- */
function renderHome() {
  const total = S.sessions.length;
  const vol = S.sessions.reduce((a, s) => a + sumVol(s), 0);
  const recs = records();

  $('#homeHello').innerHTML = S.profile.name
    ? `Привет, <b>${esc(S.profile.name)}</b>! 💪` : 'Готов к тренировке? 💪';

  $('#homeStats').innerHTML = `
    <div class="stat"><div class="stat-v">${total}</div><div class="stat-l">тренировок</div></div>
    <div class="stat"><div class="stat-v">${vol >= 1000 ? (vol / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : fmt(vol)}</div>
      <div class="stat-l">${vol >= 1000 ? 'тоннаж, т' : 'объём, кг'}</div></div>
    <div class="stat"><div class="stat-v">${recs.length}</div><div class="stat-l">рекордов</div></div>`;

  const last = S.sessions.slice(-12);
  $('#volumeChart').innerHTML = lineChart(last.map(sumVol), last.map(s => human(s.date)));

  $('#records').innerHTML = recs.length
    ? recs.slice(0, 8).map((r, i) => `
      <div class="rec ${i === 0 ? 'gold' : ''}" style="--i:${i}">
        <div class="medal">${i === 0 ? '👑' : i + 1}</div>
        <div class="rec-info">
          <div class="rec-name">${esc(r.name)}</div>
          <div class="rec-date">${human(r.date)} · ${r.reps} повт. · 1RM ≈ ${fmt(r.rm)} кг</div>
        </div>
        <div class="rec-val">${fmt(r.w)}<small>кг</small></div>
      </div>`).join('')
    : '<div class="empty">Завершите первую тренировку —<br>рекорды появятся здесь</div>';
}

/* ---------- аналитика ---------- */
let anDayId = null;    // выбранный день расписания
let anExId = null;     // выбранное упражнение
let anMetric = 'w';    // 'w' — максимальный вес, 'v' — объём за тренировку

/* все тренировки, где встречалось упражнение (по дате, по возрастанию) */
function exHistory(exName) {
  const rows = [];
  for (const s of S.sessions) {
    const qs = s.sets.filter(q => q.name === exName);
    if (!qs.length) continue;
    rows.push({
      s, qs,
      maxW: Math.max(...qs.map(q => +q.w || 0)),
      vol: qs.reduce((a, q) => a + setCount(q) * (+q.w || 0) * (+q.r || 0), 0),
    });
  }
  rows.sort((a, b) => a.s.date < b.s.date ? -1 : a.s.date > b.s.date ? 1 : 0);
  return rows;
}

function renderAnalytics() {
  const box = $('#analyticsBox');
  const prevScroll = $$('#analyticsBox .chips').map(c => c.scrollLeft);
  if (!S.days.length) {
    box.innerHTML = '<div class="empty">Сначала создайте день в расписании —<br>аналитика появится здесь</div>';
    return;
  }
  const day = S.days.find(d => d.id === anDayId) || S.days[0];
  anDayId = day.id;
  const ex = day.exercises.find(e => e.id === anExId) || day.exercises[0] || null;
  anExId = ex ? ex.id : null;

  const rows = ex ? exHistory(ex.name) : [];
  const best = rows.reduce((m, r) => Math.max(m, r.maxW), 0);
  const totalVol = rows.reduce((a, r) => a + r.vol, 0);
  const last = rows.at(-1);

  const chartVals = rows.map(r => anMetric === 'w' ? r.maxW : r.vol);
  const chart = rows.length
    ? lineChart(chartVals, rows.map(r => human(r.s.date)))
    : '<div class="empty">Пока нет данных —<br>выполните это упражнение на тренировке</div>';

  box.innerHTML = `
    <div class="card an-picker">
      <div class="sect-inline">День</div>
      <div class="chips">${S.days.map(d =>
        `<button class="chip ${d.id === day.id ? 'on' : ''}" data-anday="${d.id}" type="button">${esc(d.name)}</button>`).join('')}
      </div>
      ${day.exercises.length ? `
        <div class="sect-inline">Упражнение</div>
        <div class="chips">${day.exercises.map(e =>
          `<button class="chip ${e.id === anExId ? 'on' : ''}" data-anex="${e.id}" type="button">${esc(e.name)}</button>`).join('')}
        </div>
        <div class="sect-inline">Показатель</div>
        <div class="chips">
          <button class="chip ${anMetric === 'w' ? 'on' : ''}" data-anmetric="w" type="button">Макс. вес</button>
          <button class="chip ${anMetric === 'v' ? 'on' : ''}" data-anmetric="v" type="button">Объём</button>
        </div>`
      : '<div class="empty">В этом дне нет упражнений —<br>добавьте их в расписании</div>'}
    </div>
    <div class="an-cols">
      <div class="an-col">
        <div class="card an-chart">
          <h2>${ex ? esc(ex.name) : 'Динамика'}</h2>
          ${chart}
          ${rows.length ? `
            <div class="stats an-stats">
              <div class="stat"><div class="stat-v">${fmt(best)}</div><div class="stat-l">лучший вес, кг</div></div>
              <div class="stat"><div class="stat-v">${rows.length}</div><div class="stat-l">тренировок</div></div>
              <div class="stat"><div class="stat-v">${totalVol >= 1000 ? (totalVol / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : fmt(totalVol)}</div>
                <div class="stat-l">${totalVol >= 1000 ? 'тоннаж, т' : 'объём, кг'}</div></div>
            </div>
            <p class="hint">${anMetric === 'w' ? 'Максимальный вес на каждой тренировке' : 'Суммарный объём упражнения за тренировку'} · нажатие на точку покажет дату</p>` : ''}
        </div>
      </div>
      <div class="an-col">
        <div class="sect">История</div>
        ${rows.length ? rows.slice().reverse().map((r, i) => `
          <div class="hist an-hist" data-session="${r.s.id}" style="--i:${i}">
            <div class="hist-info">
              <b>${human(r.s.date)} · ${esc(r.s.name || r.s.dayName)}</b>
              <div class="hist-sub">${r.qs.map(q => `${setCount(q)}×${fmt(q.w)}×${q.r}`).join(' · ')}</div>
            </div>
            <div class="hist-vol">${fmt(anMetric === 'w' ? r.maxW : r.vol)} кг</div>
            <span class="hist-go">${ICONS.chevron}</span>
          </div>`).join('')
        : '<div class="empty">История пуста</div>'}
      </div>
    </div>`;
  // выбор чипса перерисовывает экран — не сбрасываем горизонтальную прокрутку
  $$('#analyticsBox .chips').forEach((c, i) => { if (prevScroll[i]) c.scrollLeft = prevScroll[i]; });
}

/* ---------- расписание ---------- */
function renderSchedule() {
  $('#daysList').innerHTML = S.days.map(d => `
    <div class="card day" data-id="${d.id}">
      <div class="day-head">
        <h3>${esc(d.name)}</h3>
        <div class="row-btns">
          <button class="icon-btn" data-act="renDay" type="button" aria-label="Переименовать">${ICONS.pen}</button>
          <button class="icon-btn" data-act="delDay" type="button" aria-label="Удалить">${ICONS.trash}</button>
        </div>
      </div>
      <div class="ex-list">${d.exercises.map(e => `
        <div class="ex-item"><span>${esc(e.name)}</span>
          <button class="icon-btn sm" data-act="delEx" data-ex="${e.id}" type="button" aria-label="Удалить">${ICONS.x}</button>
        </div>`).join('') || '<div class="empty">Нет упражнений</div>'}
      </div>
      <button class="btn ghost small" data-act="addEx" type="button">${ICONS.plus} Упражнение</button>
    </div>`).join('') || '<div class="empty">Добавьте первый тренировочный день</div>';
}

/* ---------- тренировка ---------- */
let pendingFocusEx = null; // куда вернуть фокус после перерисовки

/* черновики полей ввода — чтобы при добавлении записи не сбрасывался
   ввод, сделанный в карточках других упражнений */
function collectDrafts() {
  const drafts = {};
  $$('#workoutBox .set-form').forEach(f => {
    drafts[f.dataset.ex] = [f.k.value, f.w.value, f.r.value];
  });
  return drafts;
}

function renderWorkout() {
  const box = $('#workoutBox');
  if (S.active) return renderActive(box);

  box.innerHTML = `
    <div class="screen-head"><h1>Тренировка</h1></div>
    <button class="btn primary wide big" id="startBtn" type="button">${ICONS.play} Начать тренировку</button>
    <div class="sect">История</div>
    ${S.sessions.slice().reverse().slice(0, 10).map(s => `
      <div class="hist" data-id="${s.id}">
        <div class="hist-info">
          <b>${esc(s.name || s.dayName)}</b>
          <div class="hist-sub">${human(s.date)} · ${s.sets.reduce((a, q) => a + setCount(q), 0)} подходов</div>
        </div>
        <div class="hist-vol">${fmt(sumVol(s))} кг</div>
        <div class="row-btns">
          <button class="icon-btn sm" data-hist="ren" type="button" aria-label="Переименовать">${ICONS.pen}</button>
          <button class="icon-btn sm" data-hist="del" type="button" aria-label="Удалить">${ICONS.trash}</button>
        </div>
        <span class="hist-go">${ICONS.chevron}</span>
      </div>`).join('') || '<div class="empty">История пуста</div>'}`;

  $('#startBtn').onclick = () => {
    S.active = { id: uid(), name: '', dayId: null, date: today(), sets: [] };
    save(); renderWorkout();
  };
}

function renderActive(box) {
  const a = S.active;
  const drafts = collectDrafts();
  const day = S.days.find(d => d.id === a.dayId);
  const exs = day ? day.exercises : [];
  box.innerHTML = `
    <div class="card session-top">
      <div class="session-meta">
        <input id="sessionName" class="session-name" type="text" maxlength="40"
               placeholder="Название тренировки" value="${esc(a.name)}" autocomplete="off">
        <div class="hist-sub">${human(a.date)} · тренировка идёт</div>
      </div>
      <span class="live" title="Идёт тренировка"></span>
    </div>
    <div class="card day-pick">
      <div class="sect-inline">День тренировки</div>
      <div class="chips">${S.days.map(d =>
        `<button class="chip ${d.id === a.dayId ? 'on' : ''}" data-pick="${d.id}" type="button">${esc(d.name)}</button>`).join('')
        || '<div class="empty">Сначала создайте день в расписании</div>'}</div>
    </div>
    ${day
      ? exs.map(e => {
          const sets = a.sets.filter(q => q.ex === e.id);
          return `<div class="card ex-card">
            <h3>${esc(e.name)}</h3>
            ${sets.length ? `<div class="sets">${sets.map(q => `
              <div class="set-row">
                <span class="set-val">${setCount(q)} × ${fmt(q.w)} кг × ${q.r}</span>
                <button class="icon-btn sm" data-del="${q.id}" type="button" aria-label="Удалить запись">${ICONS.x}</button>
              </div>`).join('')}</div>` : ''}
            <form class="set-form" data-ex="${e.id}">
              <input name="k" type="number" min="1" value="3" placeholder="подх" required inputmode="numeric" aria-label="Сколько подходов">
              <input name="w" type="number" min="0" step="0.5" placeholder="вес" required inputmode="decimal" aria-label="Вес">
              <input name="r" type="number" min="1" placeholder="повт" required inputmode="numeric" aria-label="Повторения">
              <button class="btn primary sq" type="submit" aria-label="Добавить">${ICONS.plus}</button>
            </form>
          </div>`;
        }).join('') || '<div class="empty">В этом дне нет упражнений —<br>добавьте их в расписании</div>'
      : '<div class="empty">Выберите день, чтобы вводить подходы</div>'}
    <div class="session-actions">
      <button class="btn ghost" id="discardBtn" type="button">Отменить</button>
      <button class="btn primary" id="finishBtn" type="button">${ICONS.check} Завершить</button>
    </div>`;

  // вернуть черновики и фокус — ввод в других карточках не теряется
  $$('#workoutBox .set-form').forEach(f => {
    const d = drafts[f.dataset.ex];
    if (d) { f.k.value = d[0]; f.w.value = d[1]; f.r.value = d[2]; }
  });
  if (pendingFocusEx) {
    const f = $(`#workoutBox .set-form[data-ex="${pendingFocusEx}"]`);
    f?.querySelector('input[name=w]')?.focus();
    pendingFocusEx = null;
  }

  $('#sessionName').oninput = e => { a.name = e.target.value; save(); };
  $$('#workoutBox [data-pick]').forEach(c => c.onclick = () => {
    a.dayId = c.dataset.pick; save(); renderWorkout();
  });
  $$('#workoutBox .set-form').forEach(f => f.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(f);
    const e = exs.find(x => x.id === f.dataset.ex);
    a.sets.push({ id: uid(), ex: e.id, name: e.name, k: Math.max(1, +fd.get('k') || 1), w: +fd.get('w') || 0, r: +fd.get('r') || 0 });
    pendingFocusEx = e.id;
    save(); renderWorkout();
  });
  $$('#workoutBox [data-del]').forEach(b => b.onclick = () => {
    a.sets = a.sets.filter(q => q.id !== b.dataset.del);
    save(); renderWorkout();
  });
  $('#discardBtn').onclick = () => {
    confirmSheet('Отменить тренировку? Введённые подходы не сохранятся.', () => {
      S.active = null; save(); renderWorkout();
    }, 'Отменить');
  };
  $('#finishBtn').onclick = () => {
    if (!a.sets.length) return toast('Добавьте хотя бы одну запись');
    S.sessions.push({
      id: a.id,
      name: a.name.trim() || (day ? day.name : 'Тренировка'),
      dayId: a.dayId, dayName: day ? day.name : '', date: a.date, sets: a.sets,
    });
    S.active = null; save();
    toast('Тренировка сохранена 💪');
    go('home');
  };
}

/* ---------- профиль ---------- */
function renderProfile() {
  $('#pName').value = S.profile.name;
  $('#pAge').value = S.profile.age;
  $('#pWeight').value = S.profile.weight;
  $('#weightChart').innerHTML = lineChart(S.weightLog.map(w => w.v), S.weightLog.map(w => human(w.d)));

  const acc = $('#accountCard');
  if (mode === 'server') {
    acc.hidden = false;
    $('#accountInfo').innerHTML = `Вы вошли как <b>${esc(userLogin)}</b>. Данные хранятся в базе и доступны на любом устройстве после входа.`;
    $('#guestHint').hidden = true;
  } else {
    acc.hidden = true;
    $('#guestHint').hidden = false;
  }
}

/* ---------- вход / регистрация ---------- */
let authMode = 'login';
function setAuthMode(m) {
  authMode = m;
  $('#tabLogin').classList.toggle('on', m === 'login');
  $('#tabReg').classList.toggle('on', m === 'register');
  $('#authSubmit').textContent = m === 'login' ? 'Войти' : 'Создать аккаунт';
  $('#aPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
}

async function enterServer() {
  mode = 'server';
  const me = await api.call('/me');
  userLogin = me.login;
  const { state } = await api.call('/state');
  S = state && state.days && state.profile ? state : DB.load(); // пустой аккаунт → подхватываем локальные данные
  applyTheme();
  document.body.classList.remove('auth-mode');
  go('home');
  if (!state) save(); // сразу зальём стартовое состояние на сервер
}

function showAuth() {
  document.body.classList.add('auth-mode');
  setAuthMode('login');
  $('#authError').textContent = '';
  setTimeout(() => $('#aLogin')?.focus(), 350);
}

function bindAuth() {
  $('#tabLogin').onclick = () => setAuthMode('login');
  $('#tabReg').onclick = () => setAuthMode('register');
  $('#authForm').onsubmit = async ev => {
    ev.preventDefault();
    const btn = $('#authSubmit');
    btn.disabled = true;
    $('#authError').textContent = '';
    try {
      const data = await api.call('/' + authMode, 'POST', {
        login: $('#aLogin').value, password: $('#aPass').value,
      });
      api.token = data.token;
      localStorage.setItem('gymlog.token', data.token);
      $('#aPass').value = '';
      await enterServer();
      toast(authMode === 'login' ? 'С возвращением! 💪' : 'Аккаунт создан 🎉');
    } catch (e) {
      $('#authError').textContent = e.message;
    } finally {
      btn.disabled = false;
      setAuthMode(authMode);
    }
  };
}

/* ---------- роутер ---------- */
const screens = ['home', 'analytics', 'schedule', 'workout', 'profile'];
const render = { home: renderHome, analytics: renderAnalytics, schedule: renderSchedule, workout: renderWorkout, profile: renderProfile };

function go(name) {
  screens.forEach(n => {
    $('#screen-' + n).classList.toggle('active', n === name);
    $(`.tabbar [data-tab="${n}"]`).classList.toggle('active', n === name);
    $(`.sidebar [data-tab="${n}"]`)?.classList.toggle('active', n === name);
  });
  render[name]();
  try { if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name); } catch {}
  window.scrollTo({ top: 0 });
}

/* ---------- события ---------- */
function bindEvents() {
  makeSheetDraggable();
  $$('.tabbar [data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));
  $$('.sidebar [data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));
  addEventListener('hashchange', () => {
    const n = location.hash.slice(1);
    if (screens.includes(n) && !document.body.classList.contains('auth-mode')) go(n);
  });

  const toggleTheme = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); };
  $('#themeBtn').onclick = toggleTheme;
  $('#themeBtnSide').onclick = toggleTheme;

  // расписание
  $('#addDayBtn').onclick = () => sheet('Новый день', [{ name: 'name', label: 'Название дня', ph: 'Например: День D — Руки', req: 1 }], d => {
    if (!d.name.trim()) return;
    S.days.push({ id: uid(), name: d.name.trim(), exercises: [] });
    save(); renderSchedule(); toast('День добавлен');
  });

  $('#daysList').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const d = S.days.find(x => x.id === btn.closest('.day').dataset.id);
    if (!d) return;
    const act = btn.dataset.act;
    if (act === 'delDay') {
      confirmSheet(`Удалить «${d.name}»?`, () => {
        S.days = S.days.filter(x => x !== d);
        if (S.active?.dayId === d.id) S.active = null;
        save(); renderSchedule();
      });
    }
    if (act === 'renDay') sheet('Переименовать день', [{ name: 'name', label: 'Название', value: d.name, req: 1 }], r => {
      d.name = r.name.trim() || d.name; save(); renderSchedule();
    });
    if (act === 'addEx') sheet('Новое упражнение', [{ name: 'name', label: 'Упражнение', ph: 'Например: Жим лёжа', req: 1 }], x => {
      if (!x.name.trim()) return;
      d.exercises.push({ id: uid(), name: x.name.trim() });
      save(); renderSchedule();
    });
    if (act === 'delEx') {
      d.exercises = d.exercises.filter(x => x.id !== btn.dataset.ex);
      save(); renderSchedule();
    }
  });

  // история тренировок: просмотр, переименование и удаление
  $('#workoutBox').addEventListener('click', ev => {
    const b = ev.target.closest('[data-hist]');
    if (b) {
      const s = S.sessions.find(x => x.id === b.closest('.hist').dataset.id);
      if (!s) return;
      if (b.dataset.hist === 'del') {
        confirmSheet(`Удалить тренировку «${s.name || s.dayName}»?`, () => {
          S.sessions = S.sessions.filter(x => x !== s);
          save(); renderWorkout(); toast('Тренировка удалена');
        });
      } else {
        sheet('Переименовать тренировку', [{ name: 'name', label: 'Название', value: s.name || s.dayName, req: 1 }], r => {
          s.name = r.name.trim() || s.name; save(); renderWorkout();
        });
      }
      return;
    }
    const h = ev.target.closest('.hist[data-id]');
    if (h) {
      const s = S.sessions.find(x => x.id === h.dataset.id);
      if (s) sessionSheet(s);
    }
  });

  // аналитика: выбор дня, упражнения, показателя; история — детали тренировки
  $('#analyticsBox').addEventListener('click', ev => {
    const dayChip = ev.target.closest('[data-anday]');
    if (dayChip) { anDayId = dayChip.dataset.anday; anExId = null; renderAnalytics(); return; }
    const exChip = ev.target.closest('[data-anex]');
    if (exChip) { anExId = exChip.dataset.anex; renderAnalytics(); return; }
    const m = ev.target.closest('[data-anmetric]');
    if (m) { anMetric = m.dataset.anmetric; renderAnalytics(); return; }
    const h = ev.target.closest('[data-session]');
    if (h) {
      const s = S.sessions.find(x => x.id === h.dataset.session);
      if (s) sessionSheet(s);
    }
  });

  // профиль
  $('#pName').oninput = e => { S.profile.name = e.target.value.trim(); save(); };
  $('#pAge').onchange = e => { S.profile.age = +e.target.value || ''; save(); };
  $('#pWeight').onchange = e => {
    const v = +e.target.value || '';
    if (v && S.weightLog.at(-1)?.v !== v) S.weightLog.push({ d: today(), v });
    S.profile.weight = v;
    save(); renderProfile();
  };
  $('#logoutBtn').onclick = async () => {
    try { await api.call('/logout', 'POST'); } catch {}
    localStorage.removeItem('gymlog.token');
    api.token = '';
    showAuth();
  };
  $('#resetBtn').onclick = () => {
    confirmSheet('Удалить все данные и начать заново?', () => {
      S = seed(); save(); applyTheme(); go('home'); toast('Данные сброшены');
    });
  };
}

/* ---------- старт ---------- */
(async function boot() {
  applyTheme();
  bindEvents();
  bindAuth();

  if (await api.ping()) {
    // сервер доступен → работаем через базу
    if (api.token) {
      try { await enterServer(); return; }
      catch { localStorage.removeItem('gymlog.token'); api.token = ''; }
    }
    showAuth();
  } else {
    // сервера нет (просто статика) → гостевой режим, всё локально
    mode = 'guest';
    document.body.classList.remove('auth-mode');
    go(screens.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
  }
})();

// Service worker — только по http(s), чтобы file:// не ругался
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}