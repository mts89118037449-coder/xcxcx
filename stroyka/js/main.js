import { Store, SECTIONS, FLOORS, ROOF, floorName, floorShort, worksForFloor, ruToIso, isoToday } from './data.js';
import { BuildingScene } from './scene.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtN = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const store = new Store();
const state = {
  tab: 'summary',
  section: '4',
  floor: 1,
  metric: 'avg',
  month: (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })(),
  day: isoToday(),
};

// ---------- тема ----------
try { const t = localStorage.getItem('stroyka.theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* */ }
$('#btnTheme').onclick = () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('stroyka.theme', document.documentElement.dataset.theme); } catch { /* */ }
  scene.setTheme();
};

// ---------- 3D ----------
const scene = new BuildingScene($('#stage'), store);
scene.onSelect = (s, f) => { state.section = s; state.floor = f; setTab('floor'); };

$('#metric').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.metric = b.dataset.m;
  for (const x of $('#metric').children) x.classList.toggle('on', x === b);
  scene.setMetric(state.metric);
  renderKpis(); if (state.tab === 'summary') renderSummary();
};
$('#btnView').onclick = () => scene.resetView();
$('#viewMode').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  for (const x of $('#viewMode').children) x.classList.toggle('on', x === b);
  scene.setView(b.dataset.v);
  document.body.classList.toggle('project-view', b.dataset.v === 'project');
};

// ---------- вкладки ----------
function setTab(t) {
  state.tab = t;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === t);
  for (const el of document.querySelectorAll('.tab')) el.hidden = el.id !== `tab-${t}`;
  if (t === 'floor') scene.select(state.section, state.floor); else scene.select(null);
  render();
}
$('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); };

function render() {
  renderKpis();
  if (state.tab === 'summary') renderSummary();
  if (state.tab === 'floor') renderFloor();
  if (state.tab === 'calendar') renderCalendar();
}

// ---------- KPI поверх сцены ----------
function renderKpis() {
  const today = isoToday();
  const lastPeople = (s) => {
    const dates = store.journal.filter((j) => j.type === 'Люди' && j.section === s && j.date <= today).map((j) => j.date).sort();
    const d = dates[dates.length - 1];
    return d ? { n: store.peopleOn(d, s), d } : null;
  };
  $('#kpis').innerHTML = SECTIONS.map((s) => {
    const p = lastPeople(s);
    return `<div class="kpi"><div class="kpi-h">Секция ${s}</div>
      <div class="kpi-v">${Math.round(store.sectionValue(s, state.metric))}<small>%</small></div>
      <div class="bar"><i style="width:${store.sectionValue(s, state.metric)}%"></i></div>
      <div class="kpi-s">${p ? `${p.n} чел. · ${shortDate(p.d)}` : 'людей нет в журнале'}</div></div>`;
  }).join('');
}

// ---------- Сводка ----------
function renderSummary() {
  const el = $('#tab-summary');
  const open = store.remarks.filter((r) => store.isOpenRemark(r)).sort((a, b) => ruToIso(a.due).localeCompare(ruToIso(b.due)));
  const today = isoToday();
  const works = ['Наружные стены', 'Перегородки', 'Кровля'];
  el.innerHTML = `
    <div class="cards">
      ${SECTIONS.map((s) => `
        <div class="card">
          <div class="card-h">Секция ${s}</div>
          <div class="big">${Math.round(store.sectionValue(s, 'avg'))}<small>%</small></div>
          ${works.map((w) => { const v = store.sectionValue(s, w); return `<div class="row-bar"><span>${w}</span><div class="bar"><i style="width:${v}%"></i></div><b>${Math.round(v)}%</b></div>`; }).join('')}
        </div>`).join('')}
    </div>
    <h3>Фасад по этажам <span class="muted">· ${state.metric === 'avg' ? 'все работы' : state.metric.toLowerCase()}</span></h3>
    <div class="facade" role="grid">
      ${[...FLOORS].reverse().map((f) => `
        <div class="f-row">
          ${SECTIONS.map((s) => {
            const v = store.floorValue(s, f, state.metric);
            const bad = store.remarksFor(s, f).some((r) => store.isOpenRemark(r));
            return `<button class="f-cell ${v === null ? 'na' : ''}" data-s="${s}" data-f="${f}" title="Секция ${s} · ${floorName(f)} · ${v === null ? 'не применимо' : Math.round(v) + '%'}">
              <i style="width:${v ?? 0}%" class="${v >= 100 ? 'full' : ''}"></i>${bad ? '<em class="dot"></em>' : ''}<span>${v === null ? '' : Math.round(v) + '%'}</span></button>`;
          }).join(`<span class="f-num">${floorShort(f)}</span>`)}
        </div>`).join('')}
      <div class="f-row f-foot"><span>Секция 4</span><span></span><span>Секция 5</span></div>
    </div>
    <h3>Открытые поручения <span class="muted">· ${open.length}</span></h3>
    <ul class="remarks">
      ${open.map((r) => { const iso = ruToIso(r.due); const late = iso && iso < today; return `
        <li class="${late ? 'late' : ''}"><div><b>${esc(r.short || r.text)}</b>${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}</div>
        <div class="r-meta"><span>с. ${esc(r.section)}</span><span>${esc(r.due)}</span>${Number(r.moves) ? `<span title="переносов">↻${esc(r.moves)}</span>` : ''}</div></li>`; }).join('') || '<li class="muted">Нет открытых поручений</li>'}
    </ul>
    ${store.status === 'demo' ? '<p class="note">Демо-режим: проценты — стартовая оценка по листу «Таблица» (есть ИС/АОСР → 100%, есть замечания → 50%). Поправьте их на вкладке «Этаж» или подключите таблицу.</p>' : ''}
  `;
  el.querySelectorAll('.f-cell').forEach((b) => b.onclick = () => { state.section = b.dataset.s; state.floor = +b.dataset.f; setTab('floor'); });
}

// ---------- Этаж ----------
function renderFloor() {
  const el = $('#tab-floor');
  const s = state.section, f = state.floor;
  const doc = (w) => store.docs.find((d) => d.floor === f && d.work === w);
  const rem = store.remarksFor(s, f);
  el.innerHTML = `
    <div class="floor-nav">
      <div class="seg small">${SECTIONS.map((x) => `<button data-sec="${x}" class="${x === s ? 'on' : ''}">Секция ${x}</button>`).join('')}</div>
      <div class="stepper">
        <button class="btn ghost small" data-step="-1" ${f === 0 ? 'disabled' : ''} aria-label="Этаж ниже">▼</button>
        <select id="floorSel">${FLOORS.map((x) => `<option value="${x}" ${x === f ? 'selected' : ''}>${floorName(x)}</option>`).join('')}</select>
        <button class="btn ghost small" data-step="1" ${f === ROOF ? 'disabled' : ''} aria-label="Этаж выше">▲</button>
      </div>
    </div>
    <div class="big floor-big">${Math.round(store.floorValue(s, f))}<small>%</small><span class="muted"> ${floorName(f).toLowerCase()}, секция ${s}</span></div>
    ${worksForFloor(f).map((w) => {
      const v = store.get(s, f, w);
      const d = doc(w);
      const dd = d ? d[s] : null;
      return `
      <div class="work" data-w="${esc(w)}">
        <div class="work-h"><b>${esc(w)}</b><span class="val"><input type="number" min="0" max="100" step="5" value="${v}" aria-label="${esc(w)}, %">%</span></div>
        <input type="range" min="0" max="100" step="5" value="${v}" style="--v:${v}%" aria-label="${esc(w)}">
        <div class="quick">${[0, 25, 50, 75, 100].map((q) => `<button class="chip" data-q="${q}">${q}%</button>`).join('')}</div>
        ${dd ? `<div class="docs">
          <span class="${dd.is ? 'ok' : ''}">ИС: ${esc(dd.is || 'нет')}</span>
          <span class="${dd.aosr ? 'ok' : ''}">АОСР: ${esc(dd.aosr || 'нет')}</span>
          ${dd.rem ? `<span class="rem" title="Замечания по АОСР (лист «Таблица»)">Замечания: ${esc(dd.rem)}</span>` : ''}
        </div>` : ''}
      </div>`;
    }).join('')}
    <h3>Поручения по этажу</h3>
    <ul class="remarks">${rem.map((r) => `<li class="${store.isOpenRemark(r) ? 'late' : 'done'}"><div><b>${esc(r.short)}</b><div class="muted">${esc(r.state || r.status)}${r.note ? ' · ' + esc(r.note) : ''}</div></div><div class="r-meta"><span>${esc(r.due)}</span></div></li>`).join('') || '<li class="muted">Нет поручений с упоминанием этого этажа</li>'}</ul>
    <p class="muted small-note">Изменения сохраняются ${store.connected ? 'в лист «Прогресс» Google Таблицы' : 'в этом браузере (демо-режим)'}.</p>
  `;
  el.querySelectorAll('[data-sec]').forEach((b) => b.onclick = () => { state.section = b.dataset.sec; scene.select(state.section, state.floor); renderFloor(); });
  el.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => { state.floor = Math.max(0, Math.min(ROOF, state.floor + +b.dataset.step)); scene.select(state.section, state.floor); renderFloor(); });
  $('#floorSel', el).onchange = (e) => { state.floor = +e.target.value; scene.select(state.section, state.floor); renderFloor(); };
  el.querySelectorAll('.work').forEach((box) => {
    const w = box.dataset.w;
    const range = $('input[type=range]', box), num = $('input[type=number]', box);
    const commit = (v) => { range.value = v; num.value = v; range.style.setProperty('--v', v + '%'); save(s, f, w, v); };
    range.oninput = () => { num.value = range.value; range.style.setProperty('--v', range.value + '%'); preview(s, f, w, +range.value); };
    range.onchange = () => commit(+range.value);
    num.onchange = () => commit(Math.max(0, Math.min(100, +num.value || 0)));
    box.querySelectorAll('[data-q]').forEach((q) => q.onclick = () => commit(+q.dataset.q));
  });
}

function preview(s, f, w, v) {
  const p = store.progress.get(`${s}|${f}|${w}`);
  if (p) p.value = v; else store.progress.set(`${s}|${f}|${w}`, { section: s, floor: f, work: w, value: v });
  scene.update(); renderKpis();
  const big = $('.floor-big'); if (big) big.firstChild.textContent = Math.round(store.floorValue(s, f));
}

const pending = new Map();
function save(s, f, w, v) {
  const k = `${s}|${f}|${w}`;
  clearTimeout(pending.get(k));
  pending.set(k, setTimeout(async () => {
    try { await store.setProgress(s, f, w, v); toast(store.connected ? 'Сохранено в таблицу' : 'Сохранено (демо)'); }
    catch (e) { toast('Не удалось сохранить: ' + e.message, true); }
  }, 350));
  preview(s, f, w, v);
}

// ---------- Календарь ----------
function renderCalendar() {
  const el = $('#tab-calendar');
  const { y, m } = state.month;
  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7; // Пн = 0
  const days = new Date(y, m + 1, 0).getDate();
  const iso = (d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const today = isoToday();
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const monthEntries = store.journal.filter((j) => j.date.startsWith(monthPrefix));
  const maxPeople = Math.max(1, ...Array.from({ length: days }, (_, i) => store.peopleOn(iso(i + 1))));
  const dueMap = {};
  for (const r of store.remarks) { const d = ruToIso(r.due); if (d && store.isOpenRemark(r)) (dueMap[d] ||= []).push(r); }

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push('<div class="c-cell empty"></div>');
  for (let d = 1; d <= days; d++) {
    const k = iso(d);
    const p4 = store.peopleOn(k, '4'), p5 = store.peopleOn(k, '5'), pAll = store.peopleOn(k);
    const mats = store.journalOn(k).filter((j) => j.type === 'Материал').length;
    const heat = pAll / maxPeople;
    cells.push(`<button class="c-cell ${k === today ? 'today' : ''} ${k === state.day ? 'sel' : ''}" data-d="${k}" style="--heat:${(heat * 0.55).toFixed(2)}">
      <span class="c-d">${d}</span>
      <span class="c-chips">
        ${p4 ? `<span class="chip-s s4" title="Секция 4: ${p4} чел.">4·${p4}</span>` : ''}
        ${p5 ? `<span class="chip-s s5" title="Секция 5: ${p5} чел.">5·${p5}</span>` : ''}
        ${pAll - p4 - p5 > 0 ? `<span class="chip-s" title="Общее: ${pAll - p4 - p5} чел.">∑·${pAll - p4 - p5}</span>` : ''}
        ${mats ? `<span class="chip-m" title="Поставок: ${mats}">🚚${mats > 1 ? mats : ''}</span>` : ''}
      </span>
      ${dueMap[k] ? `<em class="dot" title="Срок поручений: ${dueMap[k].length}"></em>` : ''}
    </button>`);
  }

  const dayEntries = store.journalOn(state.day);
  const [dy, dm, dd] = state.day.split('-').map(Number);
  const matTotals = {};
  for (const j of monthEntries.filter((j) => j.type === 'Материал')) { const k = `${j.name}|${j.unit}`; matTotals[k] = (matTotals[k] || 0) + j.qty; }
  const peopleDays = [...new Set(monthEntries.filter((j) => j.type === 'Люди').map((j) => j.date))];
  const avgPeople = peopleDays.length ? peopleDays.reduce((a, d) => a + store.peopleOn(d), 0) / peopleDays.length : 0;

  el.innerHTML = `
    <div class="cal-head">
      <button class="btn ghost small" data-mv="-1" aria-label="Предыдущий месяц">◀</button>
      <b>${MONTHS[m]} ${y}</b>
      <button class="btn ghost small" data-mv="1" aria-label="Следующий месяц">▶</button>
      <button class="btn ghost small" data-mv="0">Сегодня</button>
    </div>
    <div class="cal">
      ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((x) => `<div class="c-dow">${x}</div>`).join('')}
      ${cells.join('')}
    </div>
    <div class="cal-stats">
      <span>Среднее за день: <b>${fmtN(Math.round(avgPeople))} чел.</b></span>
      <span>Поставок: <b>${monthEntries.filter((j) => j.type === 'Материал').length}</b></span>
    </div>

    <h3>${dd} ${MONTHS_GEN[dm - 1]} ${dy}</h3>
    ${(dueMap[state.day] || []).map((r) => `<div class="due">Срок: ${esc(r.short)} (с. ${esc(r.section)})</div>`).join('')}
    <ul class="entries">
      ${dayEntries.map((j) => `<li class="${j.type === 'Люди' ? 'e-people' : 'e-mat'}">
        <span class="e-ico">${j.type === 'Люди' ? '👷' : '🚚'}</span>
        <div><b>${esc(j.name || j.type)}</b> — ${fmtN(j.qty)} ${esc(j.unit)}<div class="muted">${esc(j.section === 'Общее' ? 'Общее' : 'Секция ' + j.section)}${j.note ? ' · ' + esc(j.note) : ''}</div></div>
        <button class="x" data-del="${esc(j.id)}" aria-label="Удалить">×</button></li>`).join('') || '<li class="muted">Записей нет</li>'}
    </ul>

    <form class="add" id="addForm">
      <div class="seg small" id="addType"><button type="button" data-t="Люди" class="on">👷 Люди вышли</button><button type="button" data-t="Материал">🚚 Материал приехал</button></div>
      <div class="grid2">
        <label>Секция<select name="section"><option>4</option><option>5</option><option>Общее</option></select></label>
        <label>Дата<input type="date" name="date" value="${state.day}" required></label>
      </div>
      <label><span data-lbl>Бригада / профессия</span><input name="name" list="names" placeholder="Каменщики" ></label>
      <datalist id="names">${[...new Set(store.journal.map((j) => j.name).filter(Boolean))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="grid2">
        <label>Количество<input name="qty" type="number" step="any" min="0" required></label>
        <label>Ед.<input name="unit" value="чел." list="units"></label>
      </div>
      <datalist id="units"><option value="чел."><option value="м³"><option value="шт."><option value="поддон"><option value="т"><option value="машина"></datalist>
      <label>Примечание<input name="note"></label>
      <button class="btn" type="submit">Добавить запись</button>
    </form>

    ${Object.keys(matTotals).length ? `<h3>Материал за месяц</h3><ul class="totals">${Object.entries(matTotals).map(([k, v]) => { const [n, u] = k.split('|'); return `<li><span>${esc(n)}</span><b>${fmtN(v)} ${esc(u)}</b></li>`; }).join('')}</ul>` : ''}
  `;

  el.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => {
    const mv = +b.dataset.mv;
    if (mv === 0) { const d = new Date(); state.month = { y: d.getFullYear(), m: d.getMonth() }; state.day = isoToday(); }
    else { const d = new Date(y, m + mv, 1); state.month = { y: d.getFullYear(), m: d.getMonth() }; }
    renderCalendar();
  });
  el.querySelectorAll('.c-cell[data-d]').forEach((b) => b.onclick = () => { state.day = b.dataset.d; renderCalendar(); });
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Удалить запись?')) return;
    try { await store.deleteJournal(b.dataset.del); toast('Удалено'); } catch (e) { toast('Ошибка: ' + e.message, true); }
  });

  const form = $('#addForm', el);
  let type = 'Люди';
  $('#addType', el).onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    type = b.dataset.t;
    for (const x of $('#addType', el).children) x.classList.toggle('on', x === b);
    $('[data-lbl]', form).textContent = type === 'Люди' ? 'Бригада / профессия' : 'Материал';
    form.name.placeholder = type === 'Люди' ? 'Каменщики' : 'Газобетон 650х200х250';
    form.unit.value = type === 'Люди' ? 'чел.' : 'м³';
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const entry = { date: fd.get('date'), section: fd.get('section'), type, name: fd.get('name') || (type === 'Люди' ? 'Рабочие' : 'Материал'), qty: fd.get('qty'), unit: fd.get('unit'), note: fd.get('note') };
    state.day = entry.date;
    const [ey, em] = entry.date.split('-').map(Number);
    state.month = { y: ey, m: em - 1 };
    try { await store.addJournal(entry); toast(store.connected ? 'Записано в лист «Журнал»' : 'Записано (демо)'); }
    catch (err) { toast('Ошибка: ' + err.message, true); }
  };
}

function shortDate(iso) { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS_GEN[m - 1]}`; }

// ---------- статус, настройки ----------
function renderStatus() {
  const el = $('#status');
  const map = { loading: ['Загрузка…', ''], ok: ['Google Таблица', 'ok'], demo: ['Демо-режим', 'warn'], error: ['Ошибка связи', 'err'], idle: ['—', ''] };
  const [t, cls] = map[store.status] || map.idle;
  el.textContent = t;
  el.className = 'pill ' + cls;
  el.title = store.error || (store.loadedAt ? 'Обновлено ' + store.loadedAt.toLocaleTimeString('ru-RU') : '');
}

$('#btnReload').onclick = () => store.load();
$('#btnSettings').onclick = () => { $('#cfgUrl').value = store.url; $('#cfgToken').value = store.token; $('#settings').showModal(); };
$('#btnSave').onclick = () => { store.saveConfig($('#cfgUrl').value, $('#cfgToken').value); store.load(); };
$('#btnDemoReset').onclick = () => { if (confirm('Сбросить локальные правки демо-режима?')) { store.resetDemo(); $('#settings').close(); toast('Демо сброшено'); } };

let toastT;
function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

store.on((what) => {
  if (what === 'status') renderStatus();
  if (what === 'data') { scene.update(); render(); }
});

// автообновление раз в 2 минуты, если подключена таблица
setInterval(() => { if (store.connected && !document.hidden) store.load(); }, 120000);

renderStatus();
store.load();
window.__stroyka = { store, scene, state };
