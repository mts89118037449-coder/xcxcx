import { Store, SECTIONS, FLOORS, ROOF, floorName, floorShort, worksForFloor, ruToIso, isoToday, EXPENSE_CATS } from './data.js';
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
  money: 'contract',
  expCat: 'all',
  expQuery: '',
  expLimit: 40,
};
const CAT_COLORS = { 'Материалы': '#2e9e57', 'Работы': '#1f6feb', 'Услуги': '#d08a00', 'Логистика': '#8b5cf6', 'Прочее': '#8a8780' };
const rub = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';
const rubShort = (n) => n >= 1e6 ? (n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн' : n >= 1e3 ? Math.round(n / 1e3) + ' тыс' : Math.round(n) + ' ₽';

// ---------- тема ----------
try { const t = localStorage.getItem('stroyka.theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* */ }
$('#btnTheme2').onclick = () => $('#btnTheme').click();
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
  const L = {
    fact: '<span><i class="sw sw-facade"></i>готово</span><span><i class="sw sw-strip"></i>полоса — % этажа</span><span><i class="sw sw-shell"></i>каркас, не начато</span><span><i class="sw sw-red"></i>открытые замечания</span>',
    progress: '<span><i class="sw sw-green"></i>выполнено</span><span><i class="sw sw-full"></i>100%</span><span><i class="sw sw-shell"></i>не начато</span><span><i class="sw sw-red"></i>открытые замечания</span>',
    project: '<span><i class="sw sw-facade"></i>проектный вид после завершения</span>',
  }[b.dataset.v];
  $('#legend').innerHTML = L + '<span class="hint">Клик по этажу — редактирование · колесо — масштаб</span>';
};

// ---------- вкладки ----------
function setTab(t) {
  if (t === 'tour') { openTour(); return; }
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
  if (state.tab === 'money') renderMoney();
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
    ${(() => { const D = store.contractValue('D'), E = store.contractValue('E'); if (!D || !E) return ''; const p = E / D * 100; return `<button class="contract-card" data-goto="money">
      <span>Выполнено по договору</span><b>${p.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</b>
      <div class="bar"><i style="width:${p}%"></i></div><em>${rubShort(E)} из ${rubShort(D)} ₽</em></button>`; })()}
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
    ${[...store.progress.values()].some((p) => /оценка/.test(p.note || '')) ? '<p class="note">Часть процентов — стартовая оценка по листу «Таблица» (есть ИС/АОСР → 100%, есть замечания → 50%). Уточните их на вкладке «Этаж» или в листе «Прогресс».</p>' : ''}
  `;
  el.querySelectorAll('.f-cell').forEach((b) => b.onclick = () => { state.section = b.dataset.s; state.floor = +b.dataset.f; setTab('floor'); });
  el.querySelectorAll('[data-goto]').forEach((b) => b.onclick = () => { state.money = 'contract'; setTab(b.dataset.goto); });
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
    <p class="muted small-note">Изменения сохраняются ${store.connected ? 'в лист «Прогресс» Google Таблицы' : 'пока только на этом устройстве — таблица не подключена'}.</p>
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
    store.setProgress(s, f, w, v);
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
    const spent = store.expenseTotal(store.expensesOn(k));
    const heat = pAll / maxPeople;
    cells.push(`<button class="c-cell ${k === today ? 'today' : ''} ${k === state.day ? 'sel' : ''}" data-d="${k}" style="--heat:${(heat * 0.55).toFixed(2)}">
      <span class="c-d">${d}</span>
      <span class="c-chips">
        ${p4 ? `<span class="chip-s s4" title="Секция 4: ${p4} чел.">4·${p4}</span>` : ''}
        ${p5 ? `<span class="chip-s s5" title="Секция 5: ${p5} чел.">5·${p5}</span>` : ''}
        ${pAll - p4 - p5 > 0 ? `<span class="chip-s" title="Общее: ${pAll - p4 - p5} чел.">∑·${pAll - p4 - p5}</span>` : ''}
        ${mats ? `<span class="chip-m" title="Поставок: ${mats}">🚚${mats > 1 ? mats : ''}</span>` : ''}
        ${spent ? `<span class="chip-r" title="Расходы: ${rub(spent)}">₽${rubShort(spent).replace(' ₽', '')}</span>` : ''}
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
      <span>Расходы: <b>${rub(store.expenseTotal(store.fin.expenses.filter((e) => e.date.startsWith(monthPrefix))))}</b></span>
    </div>

    <h3>${dd} ${MONTHS_GEN[dm - 1]} ${dy}</h3>
    ${(dueMap[state.day] || []).map((r) => `<div class="due">Срок: ${esc(r.short)} (с. ${esc(r.section)})</div>`).join('')}
    <ul class="entries">
      ${dayEntries.map((j) => `<li class="${j.type === 'Люди' ? 'e-people' : 'e-mat'}">
        <span class="e-ico">${j.type === 'Люди' ? '👷' : '🚚'}</span>
        <div><b>${esc(j.name || j.type)}</b> — ${fmtN(j.qty)} ${esc(j.unit)}<div class="muted">${esc(j.section === 'Общее' ? 'Общее' : 'Секция ' + j.section)}${j.note ? ' · ' + esc(j.note) : ''}</div></div>
        <button class="x ed" data-edj="${esc(j.id)}" aria-label="Изменить">✎</button><button class="x" data-del="${esc(j.id)}" aria-label="Удалить">×</button></li>`).join('') || '<li class="muted">Записей нет</li>'}
    </ul>

    ${(() => { const ex = store.expensesOn(state.day); return ex.length ? `<h3>Расходы за день <span class="muted">· ${rub(store.expenseTotal(ex))}</span></h3><ul class="entries">${ex.map((e) => `<li><span class="cat-dot" style="--c:${CAT_COLORS[e.cat] || '#888'}"></span><div><b>${esc(e.note || e.basis || e.cat)}</b><div class="muted">${esc(e.cat)} · ${esc(e.who || '')}</div></div><b class="num">${rub(e.sum)}</b></li>`).join('')}</ul>` : ''; })()}

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
      <div class="form-actions"><button class="btn" type="submit" data-submit>Добавить запись</button><button class="btn ghost" type="button" data-cancel hidden>Отмена</button></div>
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
    store.deleteJournal(b.dataset.del);
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
  let editId = null;
  el.querySelectorAll('[data-edj]').forEach((b) => b.onclick = () => {
    const j = store.journal.find((x) => x.id === b.dataset.edj); if (!j) return;
    editId = j.id;
    $(`#addType [data-t="${j.type}"]`, el)?.click();
    form.section.value = j.section; form.date.value = j.date; form.name.value = j.name; form.qty.value = j.qty; form.unit.value = j.unit; form.note.value = j.note || '';
    $('[data-submit]', form).textContent = 'Сохранить изменения';
    $('[data-cancel]', form).hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('[data-cancel]', form).onclick = () => renderCalendar();
  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const entry = { date: fd.get('date'), section: fd.get('section'), type, name: fd.get('name') || (type === 'Люди' ? 'Рабочие' : 'Материал'), qty: fd.get('qty'), unit: fd.get('unit'), note: fd.get('note') };
    state.day = entry.date;
    const [ey, em] = entry.date.split('-').map(Number);
    state.month = { y: ey, m: em - 1 };
    if (editId) store.updateJournal({ ...entry, id: editId }); else store.addJournal(entry);
    form.reset();
  };
}

// ---------- Учёт: расходы, авансы, поставки, поступления ----------
function bars(rows, max) {
  return rows.map(([label, v, color, extra]) => `<div class="hbar"><span title="${esc(label)}">${esc(label)}</span><div class="bar"><i style="width:${max ? (v / max) * 100 : 0}%;background:${color || 'var(--green)'}"></i></div><b>${rubShort(v)}</b>${extra ? `<em>${extra}</em>` : ''}</div>`).join('');
}
function monthChart(byMonth, cats) {
  const months = Object.keys(byMonth).sort();
  if (!months.length) return '<p class="muted">Нет операций с датой.</p>';
  const tot = (m) => cats.reduce((a, c) => a + (byMonth[m][c] || 0), 0);
  const max = Math.max(...months.map(tot));
  return `<div class="vchart">${months.map((m) => {
    const [y, mm] = m.split('-').map(Number);
    return `<div class="vcol" title="${MONTHS[mm - 1]} ${y}: ${rub(tot(m))}"><b>${rubShort(tot(m))}</b><div class="vstack" style="height:${(tot(m) / max) * 100}%">${cats.map((c) => byMonth[m][c] ? `<i style="flex:${byMonth[m][c]};background:${CAT_COLORS[c] || 'var(--green)'}"></i>` : '').join('')}</div><span>${MONTHS[mm - 1].slice(0, 3)}</span></div>`;
  }).join('')}</div>`;
}

function renderMoney() {
  const el = $('#tab-money');
  const views = [['contract', 'Договор'], ['exp', 'Расходы'], ['adv', 'Авансы'], ['sup', 'Поставки'], ['inc', 'Поступления'], ['pers', 'Личные'], ['tools', 'Инструмент']];
  const head = `<div class="money-seg" role="tablist">${views.map(([k, t]) => `<button data-mv="${k}" class="chip ${state.money === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  let body = '';
  const fin = store.fin;

  if (state.money === 'exp') {
    const cats = store.byCategory();
    const total = fin.partial && fin.summary ? fin.summary.total : store.expenseTotal();
    const count = fin.partial && fin.summary ? fin.summary.count : fin.expenses.length;
    const maxCat = Math.max(...Object.values(cats));
    const who = {};
    for (const e of fin.expenses) if (e.who) who[e.who] = (who[e.who] || 0) + e.sum;
    const top = Object.entries(who).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const q = state.expQuery.toLowerCase();
    const list = fin.expenses
      .filter((e) => state.expCat === 'all' || e.cat === state.expCat)
      .filter((e) => !q || `${e.who} ${e.note} ${e.basis}`.toLowerCase().includes(q))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const listSum = store.expenseTotal(list);
    body = `
      <div class="kpis3">
        <div><span>Всего расходов</span><b>${rubShort(total)}</b></div>
        <div><span>Операций</span><b>${count}</b></div>
        <div><span>Средний платёж</span><b>${rubShort(count ? total / count : 0)}</b></div>
      </div>
      <h3>По категориям</h3>
      ${bars(Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, v, CAT_COLORS[c], total ? Math.round((v / total) * 100) + '%' : '']), maxCat)}
      <h3>По месяцам ${fin.partial ? '<span class="muted">· пока только август</span>' : ''}</h3>
      ${monthChart(store.byMonth(), EXPENSE_CATS)}
      <div class="legend-row">${EXPENSE_CATS.map((c) => `<span><i style="background:${CAT_COLORS[c]}"></i>${c}</span>`).join('')}</div>
      <h3>Крупнейшие получатели</h3>
      ${bars(top.map(([w, v]) => [w, v, 'var(--blue)']), top[0] ? top[0][1] : 0)}

      <details class="add-exp" ${state.expEdit ? 'open' : ''}>
        <summary class="btn">${state.expEdit ? '✎ Изменить расход' : '+ Добавить расход'}</summary>
        <form class="add" id="expForm">
          <div class="grid2">
            <label>Дата<input type="date" name="date" value="${isoToday()}" required></label>
            <label>Категория<select name="cat">${EXPENSE_CATS.map((c) => `<option>${c}</option>`).join('')}</select></label>
          </div>
          <label>Контрагент<input name="who" list="whoList" required></label>
          <datalist id="whoList">${Object.keys(who).map((w) => `<option value="${esc(w)}">`).join('')}</datalist>
          <label>Основание<input name="basis" placeholder="Оплата по счету № … от …"></label>
          <label>Примечание<input name="note" placeholder="Арматура"></label>
          <label>Сумма, ₽<input name="sum" type="number" step="0.01" min="0" required></label>
          <div class="form-actions"><button class="btn" type="submit">${state.expEdit ? 'Сохранить' : 'Записать'} ${store.connected ? 'в лист «Счета»' : 'на устройство'}</button>${state.expEdit ? '<button class="btn ghost" type="button" id="expCancel">Отмена</button>' : ''}</div>
        </form>
      </details>

      <h3>Операции <span class="muted">· ${list.length} на ${rub(listSum)}</span></h3>
      <div class="filters">
        <input type="search" id="expQ" placeholder="Поиск: контрагент, примечание…" value="${esc(state.expQuery)}">
        <div class="chips">${['all', ...EXPENSE_CATS].map((c) => `<button class="chip ${state.expCat === c ? 'on' : ''}" data-cat="${c}">${c === 'all' ? 'Все' : c}</button>`).join('')}</div>
      </div>
      <ul class="entries ops">${list.slice(0, state.expLimit).map((e) => `<li>
        <span class="cat-dot" style="--c:${CAT_COLORS[e.cat] || '#888'}"></span>
        <div><b>${esc(e.note || e.basis || e.cat)}</b><div class="muted">${e.date ? (e.approx ? '≈ ' : '') + shortDate(e.date) + ' · ' : ''}${esc(e.who || '')}</div></div>
        <b class="num">${rub(e.sum)}</b><button class="x ed" data-edx="${esc(e.id)}" aria-label="Изменить">✎</button>${e.local || e.app ? `<button class="x" data-delx="${esc(e.id)}" aria-label="Удалить">×</button>` : ''}</li>`).join('') || '<li class="muted">Ничего не найдено</li>'}</ul>
      ${list.length > state.expLimit ? `<button class="btn ghost more" id="expMore">Показать ещё ${Math.min(40, list.length - state.expLimit)}</button>` : ''}
      ${fin.partial ? '<p class="note">Итоги и категории посчитаны по всем 355 операциям листа «Счета». Список и график пока показывают только август: полный реестр загрузится, когда таблица будет подключена онлайн (кнопка «Таблица»).</p>' : ''}`;
  }

  if (state.money === 'adv') {
    const adv = fin.advances.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = store.expenseTotal(adv);
    const st = {};
    for (const a of adv) st[a.status] = (st[a.status] || 0) + a.sum;
    const sup = {};
    for (const a of adv) { const k = (a.desc || 'Без описания').split(/[\s—-]/)[0].replace(/[()]/g, '') || '—'; sup[k] = (sup[k] || 0) + a.sum; }
    const supTop = Object.entries(sup).sort((a, b) => b[1] - a[1]);
    const byM = {};
    for (const a of adv) if (a.date) { const k = a.date.slice(0, 7); (byM[k] ||= {})['Материалы'] = (byM[k]['Материалы'] || 0) + a.sum; }
    const stColor = (x) => /оплач/i.test(x) ? 'var(--green)' : /утвер/i.test(x) ? 'var(--blue)' : 'var(--amber)';
    body = `
      <div class="kpis3">
        <div><span>Авансов</span><b>${adv.length}</b></div>
        <div><span>Сумма</span><b>${rubShort(total)}</b></div>
        <div><span>Оплачено</span><b>${rubShort(st['Оплачен'] || 0)}</b></div>
      </div>
      <h3>По статусу</h3>
      ${bars(Object.entries(st).map(([k, v]) => [k, v, stColor(k)]), total)}
      <h3>По поставщикам</h3>
      ${bars(supTop.map(([k, v]) => [k, v, 'var(--green)']), supTop[0] ? supTop[0][1] : 0)}
      <h3>По месяцам</h3>
      ${monthChart(byM, ['Материалы'])}
      <h3>Заявки <span class="muted">· лист «Для РП»</span></h3>
      <ul class="entries ops">${adv.map((a) => `<li><span class="cat-dot" style="--c:${stColor(a.status)}"></span><div><b>${esc(a.desc || a.type)}</b><div class="muted">№${esc(a.n)} · ${a.date ? shortDate(a.date) : ''} · ${esc(a.status)}</div></div><b class="num">${rub(a.sum)}</b></li>`).join('')}</ul>`;
  }

  if (state.money === 'sup') {
    const items = [];
    for (const j of store.journal.filter((j) => j.type === 'Материал')) items.push({ date: j.date, name: j.name, qty: j.qty, unit: j.unit, who: j.section === 'Общее' ? 'Общее' : 'Секция ' + j.section, src: 'Журнал' });
    for (const n of fin.nominated) for (const [name, qty] of n.items || []) {
      const dup = items.some((x) => x.date === n.date && x.name.startsWith(name));
      if (!dup) items.push({ date: n.date, name, qty: Number(String(qty).replace(',', '.')) || 0, unit: '', who: n.who, src: 'Номинированные' });
    }
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const tot = {};
    for (const x of items) { const k = `${x.name}|${x.unit}`; tot[k] = (tot[k] || 0) + x.qty; }
    const matAdv = store.expenseTotal(fin.advances);
    const matExp = (store.byCategory()['Материалы']) || 0;
    body = `
      <div class="kpis3">
        <div><span>Поставок</span><b>${items.length}</b></div>
        <div><span>Авансы за материал</span><b>${rubShort(matAdv)}</b></div>
        <div><span>Расходы «Материалы»</span><b>${rubShort(matExp)}</b></div>
      </div>
      <h3>Итого по материалам</h3>
      <ul class="totals">${Object.entries(tot).map(([k, v]) => { const [n, u] = k.split('|'); return `<li><span>${esc(n)}</span><b>${fmtN(v)} ${esc(u)}</b></li>`; }).join('') || '<li class="muted">Поставок пока нет</li>'}</ul>
      <h3>Поставки по датам</h3>
      <ul class="entries ops">${items.map((x) => `<li class="e-mat"><span class="e-ico">🚚</span><div><b>${esc(x.name)}</b><div class="muted">${x.date ? shortDate(x.date) : ''} · ${esc(x.who)} · ${x.src}</div></div><b class="num">${fmtN(x.qty)} ${esc(x.unit)}</b></li>`).join('')}</ul>
      <button class="btn" id="supAdd">+ Отметить поставку в календаре</button>`;
  }

  if (state.money === 'inc') {
    const inc = fin.income;
    const got = store.expenseTotal(inc.filter((x) => /^оплачено/i.test(x.status || '')));
    const spent = fin.partial && fin.summary ? fin.summary.total : store.expenseTotal();
    const adv = store.expenseTotal(fin.advances.filter((a) => /оплач/i.test(a.status)));
    body = `
      <div class="kpis3">
        <div><span>Получено</span><b>${rubShort(got)}</b></div>
        <div><span>Авансы за материал</span><b>${rubShort(adv)}</b></div>
        <div><span>Расходы</span><b>${rubShort(spent)}</b></div>
      </div>
      <h3>Баланс</h3>
      ${bars([['Поступления + авансы', got + adv, 'var(--green)'], ['Расходы (лист «Счета»)', spent, 'var(--red)']], Math.max(got + adv, spent))}
      <p class="muted small-note">Разница: <b>${rub(got + adv - spent)}</b>. Авансы за номинированный материал Глоракс платит поставщикам напрямую.</p>
      <h3>Счета Глоракс <span class="muted">· лист «Оплаты Глоракс»</span></h3>
      <ul class="entries ops">${inc.map((x) => `<li><span class="cat-dot" style="--c:${/^оплачено/i.test(x.status) ? 'var(--green)' : 'var(--amber)'}"></span><div><b>${esc(x.note || 'Счёт')}</b><div class="muted">${x.date ? shortDate(x.date) : ''} · ${esc(x.status)}</div></div><b class="num">${rub(x.sum)}</b></li>`).join('') || '<li class="muted">Нет счетов</li>'}</ul>`;
  }

  if (state.money === 'contract') {
    const cv = (k) => store.contractValue(k);
    const D = cv('D'), E = cv('E'), B = cv('B');
    const pct = D && E ? (E / D) * 100 : 0;
    const phys = (store.sectionValue('4') + store.sectionValue('5')) / 2;
    const spent = fin.partial && fin.summary ? fin.summary.total : store.expenseTotal();
    const rows = [
      ['Стоимость работ по договору', D], ['Выполнено работ', E], ['Принято по КС-2', B],
      ['Остаток незачтённого аванса', cv('C')], ['Сумма к оплате (А = B·(1 − C/(D − E)))', cv('A')], ['Всего к оплате', cv('всего к оплате')],
      ['Обеспечительное удержание СМР', cv('удерж')], ['Зачёт номинированных материалов', cv('зачёт')], ['Компенсация', cv('компенс')],
    ].filter(([, v]) => v != null);
    body = fin.contract.length ? `
      <div class="kpis3">
        <div><span>Договор</span><b>${rubShort(D || 0)}</b></div>
        <div><span>Выполнено</span><b>${pct.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</b></div>
        <div><span>Остаток работ</span><b>${rubShort((D || 0) - (E || 0))}</b></div>
      </div>
      <h3>Выполнение</h3>
      <div class="hbar"><span>По деньгам (E / D)</span><div class="bar"><i style="width:${pct}%"></i></div><b>${Math.round(pct)}%</b></div>
      <div class="hbar"><span>По этажам (стены, перегородки)</span><div class="bar"><i style="width:${phys}%;background:var(--blue)"></i></div><b>${Math.round(phys)}%</b></div>
      <div class="hbar"><span>Расходы к выполненному</span><div class="bar"><i style="width:${E ? Math.min(100, spent / E * 100) : 0}%;background:var(--amber)"></i></div><b>${E ? Math.round(spent / E * 100) : 0}%</b></div>
      <h3>Формула оплаты Глоракс</h3>
      <ul class="totals">${rows.map(([l, v]) => `<li><span>${esc(l)}</span><b class="num">${rub(v)}</b></li>`).join('')}</ul>
      <p class="muted small-note">Лист «Формула оплаты Глоракс». Расходы — лист «Счета»: ${rub(spent)}.</p>` : '<p class="muted">Лист «Формула оплаты Глоракс» не найден.</p>';
  }

  if (state.money === 'pers') {
    const list = fin.personal.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const byWho = {};
    for (const x of list) byWho[x.who || '—'] = (byWho[x.who || '—'] || 0) + x.sum;
    const top = Object.entries(byWho).sort((a, b) => b[1] - a[1]);
    body = `
      <div class="kpis3">
        <div><span>Записей</span><b>${list.length}</b></div>
        <div><span>Сумма</span><b>${rubShort(store.expenseTotal(list))}</b></div>
        <div><span>Плательщиков</span><b>${top.length}</b></div>
      </div>
      <h3>Кто платил</h3>
      ${bars(top.map(([w, v]) => [w, v, 'var(--blue)']), top[0] ? top[0][1] : 0)}
      <h3>Записи <span class="muted">· лист «Личные расходы»</span></h3>
      <ul class="entries ops">${list.map((x) => `<li><span class="cat-dot" style="--c:var(--blue)"></span><div><b>${esc(x.name)}</b><div class="muted">${x.date ? (x.approx ? '≈ ' : '') + shortDate(x.date) + ' · ' : ''}${esc(x.who)}${x.note ? ' · ' + esc(x.note) : ''}</div></div><b class="num">${rub(x.sum)}</b></li>`).join('') || '<li class="muted">Нет записей</li>'}</ul>`;
  }

  if (state.money === 'tools') {
    const t = fin.tools;
    body = `
      <div class="kpis3">
        <div><span>Позиций</span><b>${t.length}</b></div>
        <div><span>Остатки на</span><b>${t[0] && t[0].date ? shortDate(t[0].date) : '—'}</b></div>
        <div><span>Лист</span><b>Инструмент</b></div>
      </div>
      <h3>Остатки инструмента</h3>
      <ul class="totals">${t.map((x) => `<li><span>${esc(x.name)}</span><b class="num">${esc(x.qty || '—')}</b></li>`).join('') || '<li class="muted">Нет данных</li>'}</ul>`;
  }

  el.innerHTML = head + body;
  el.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => { state.money = b.dataset.mv; renderMoney(); });
  el.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { state.expCat = b.dataset.cat; state.expLimit = 40; renderMoney(); });
  const q = $('#expQ', el);
  if (q) q.oninput = debounce(() => { state.expQuery = q.value; state.expLimit = 40; renderMoney(); const nq = $('#expQ'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }, 250);
  const more = $('#expMore', el); if (more) more.onclick = () => { state.expLimit += 40; renderMoney(); };
  el.querySelectorAll('[data-delx]').forEach((b) => b.onclick = () => { if (confirm('Удалить расход из листа «Счета»?')) store.deleteExpense(b.dataset.delx); });
  el.querySelectorAll('[data-edx]').forEach((b) => b.onclick = () => { state.expEdit = b.dataset.edx; renderMoney(); $('#expForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  const xc = $('#expCancel', el); if (xc) xc.onclick = () => { state.expEdit = null; renderMoney(); };
  const sa = $('#supAdd', el); if (sa) sa.onclick = () => { setTab('calendar'); const t = document.querySelector('#addType [data-t="Материал"]'); if (t) t.click(); document.querySelector('#addForm')?.scrollIntoView({ behavior: 'smooth' }); };
  const f = $('#expForm', el);
  const ed = state.expEdit && store.fin.expenses.find((x) => x.id === state.expEdit);
  if (f && ed) { f.date.value = ed.date || isoToday(); f.cat.value = ed.cat; f.who.value = ed.who || ''; f.basis.value = ed.basis || ''; f.note.value = ed.note || ''; f.sum.value = ed.sum; }
  if (f) f.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const x = { date: fd.get('date'), cat: fd.get('cat'), who: fd.get('who'), basis: fd.get('basis'), note: fd.get('note'), sum: fd.get('sum') };
    if (ed) store.updateExpense({ ...ed, ...x }); else store.addExpense(x);
    state.expEdit = null;
    renderMoney();
  };
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- 3D-тур: камера и стройка по прокрутке ----------
function tourSteps() {
  const s4 = Math.round(store.sectionValue('4')), s5 = Math.round(store.sectionValue('5'));
  const open = (s) => store.remarks.filter((r) => String(r.section) === s && store.isOpenRemark(r)).length;
  const w = (s, k) => Math.round(store.sectionValue(s, k));
  const ppl = (s) => { const d = store.journal.filter((j) => j.type === 'Люди' && j.section === s).map((j) => j.date).sort().pop(); return d ? `${store.peopleOn(d, s)} чел. (${shortDate(d)})` : 'нет данных'; };
  const mats = store.journal.filter((j) => j.type === 'Материал').length + store.fin.nominated.length;
  const cats = store.byCategory();
  const total = store.fin.partial && store.fin.summary ? store.fin.summary.total : store.expenseTotal();
  return [
    ['01', 'Две секции, 16 этажей', 'Прокручивайте вниз: дом построится до текущего состояния.'],
    ['02', 'Каркас поднимается', `Этажи заливаются зелёным по факту выполнения. Сейчас готово: секция 4 — ${s4}%, секция 5 — ${s5}%.`],
    ['03', `Секция 4 · ${s4}%`, `Наружные стены ${w('4', 'Наружные стены')}%, перегородки ${w('4', 'Перегородки')}%. На объекте: ${ppl('4')}. Открытых поручений: ${open('4')}.`],
    ['04', `Секция 5 · ${s5}%`, `Наружные стены ${w('5', 'Наружные стены')}%, перегородки ${w('5', 'Перегородки')}%. На объекте: ${ppl('5')}. Открытых поручений: ${open('5')}.`],
    ['05', 'Материал и деньги', `Поставок в учёте: ${mats}. Авансы за номинированный материал: ${rubShort(store.expenseTotal(store.fin.advances))}. Расходы: ${rubShort(total)}, из них работы ${rubShort(cats['Работы'] || 0)}, материалы ${rubShort(cats['Материалы'] || 0)}.`],
    ['06', 'Сверху', 'Двор, парковка и кран. Нажмите «Закрыть тур», чтобы вернуться к редактированию.'],
  ];
}
function openTour() {
  const t = $('#tour');
  $('#tourSteps').innerHTML = tourSteps().map(([n, h, p]) => `<section class="tour-step"><div class="tour-card"><span class="tour-n">${n}</span><h2>${esc(h)}</h2><p>${esc(p)}</p></div></section>`).join('') + '<section class="tour-step tour-end"></section>';
  t.hidden = false;
  t.scrollTop = 0;
  document.body.classList.add('touring');
  scene.setTour(true);
  scene.resize();
  scene.tour(0);
  t.focus();
}
function closeTour() {
  $('#tour').hidden = true;
  document.body.classList.remove('touring');
  scene.setTour(false);
  requestAnimationFrame(() => scene.resize());
}
$('#tour').addEventListener('scroll', () => {
  const t = $('#tour');
  const p = t.scrollTop / Math.max(1, t.scrollHeight - t.clientHeight);
  $('#tourBar').style.width = (p * 100).toFixed(1) + '%';
  scene.tour(p);
}, { passive: true });
$('#tourClose').onclick = closeTour;
$('#btnTour').onclick = openTour;
addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('touring')) closeTour(); });

// ---------- мобильный вид: 3D закреплено сверху, прокрутка страницы вращает модель ----------
const mobile = matchMedia('(max-width: 900px)');
let lastY = scrollY;
addEventListener('scroll', () => {
  const dy = scrollY - lastY; lastY = scrollY;
  if (mobile.matches && !document.body.classList.contains('touring')) scene.orbitBy(dy * 0.002);
}, { passive: true });
$('#btnExpand').onclick = () => { document.body.classList.toggle('stage-big'); setTimeout(() => scene.resize(), 320); };

function shortDate(iso) { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS_GEN[m - 1]}`; }

// ---------- статус, настройки ----------
function renderBanner() {
  let el = $('#connectBanner');
  if (store.connected) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'connectBanner';
    el.className = 'banner';
    el.innerHTML = '<span>Данные вашей таблицы «Glorax_Учёт» на 04.11.2026. Чтобы они обновлялись онлайн, а правки записывались обратно в таблицу, подключите её — это один раз и около 3 минут.</span><button class="btn small" id="bannerBtn">Подключить</button>';
    document.querySelector('.top').after(el);
    $('#bannerBtn').onclick = () => $('#btnSettings').click();
  }
}

function renderStatus() {
  const el = $('#status');
  const map = { loading: ['Загрузка…', ''], ok: ['Онлайн · таблица', 'ok'], demo: ['Таблица не подключена', 'warn'], error: ['Ошибка связи', 'err'], idle: ['—', ''] };
  let [t, cls] = map[store.status] || map.idle;
  const n = store.queue.length;
  if (store.connected && n && store.syncError) { t = `Нет связи · в очереди ${n}`; cls = 'err'; }
  else if (store.connected && (store.flushing || n)) { t = 'Сохранение…'; cls = 'warn'; }
  else if (store.status === 'ok' && store.stale) { t = 'Копия сервера · Google недоступен'; cls = 'warn'; }
  else if (store.status === 'error' && store.cachedAt) { t = 'Нет связи · копия ' + new Date(store.cachedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); cls = 'err'; }
  else if (store.status === 'ok') {
    const at = store.lastCheck || store.loadedAt;
    t = 'Онлайн · ' + (at ? at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
  }
  el.textContent = t;
  el.className = 'pill ' + cls;
  el.title = store.syncError || store.error || (store.loadedAt ? 'Данные из таблицы загружены в ' + store.loadedAt.toLocaleTimeString('ru-RU') + '. Проверка изменений каждые 10 с.' : '');
}

$('#btnReload').onclick = () => store.load();
$('#btnSettings').onclick = () => { $('#cfgUrl').value = store.url; $('#cfgToken').value = store.token; $('#settings').showModal(); };
$('#btnSave').onclick = () => { store.saveConfig($('#cfgUrl').value, $('#cfgToken').value); store.load(); };
$('#btnDemoReset').onclick = () => { if (confirm('Удалить правки, сохранённые на этом устройстве?')) { store.resetDemo(); $('#settings').close(); toast('Локальные правки удалены'); } };

// ---------- резервные копии ----------
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const stampName = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
function csv(rows) {
  // «;» и BOM — чтобы русский Excel открыл файл без настройки
  return '\ufeff' + rows.map((r) => r.map((v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(';')).join('\r\n');
}
const num = (n) => String(n).replace('.', ',');
$('#bkJson').onclick = () => { download(`stroyka-backup-${stampName()}.json`, JSON.stringify(store.exportBackup(), null, 1), 'application/json'); toast('Копия скачана'); };
document.querySelectorAll('[data-csv]').forEach((b) => b.onclick = () => {
  const k = b.dataset.csv;
  let rows;
  if (k === 'expenses') rows = [['№', 'Дата', 'Категория', 'Контрагент', 'Основание', 'Примечание', 'Сумма, ₽'], ...store.fin.expenses.map((e) => [e.n || '', e.date, e.cat, e.who, e.basis, e.note, num(e.sum)])];
  if (k === 'journal') rows = [['Дата', 'Секция', 'Тип', 'Наименование', 'Количество', 'Ед.', 'Примечание'], ...store.journal.map((j) => [j.date, j.section, j.type, j.name, num(j.qty), j.unit, j.note])];
  if (k === 'progress') rows = [['Секция', 'Этаж', 'Вид работ', 'Процент', 'Обновлено'], ...[...store.progress.values()].map((p) => [p.section, floorName(p.floor), p.work, p.value, p.updated || ''])];
  download(`stroyka-${k}-${stampName()}.csv`, csv(rows), 'text/csv;charset=utf-8');
});
$('#bkFile').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    let text;
    if (f.name.endsWith('.gz')) text = await new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    else text = await f.text();
    const obj = JSON.parse(text);
    const where = store.connected ? 'на сервер — текущие данные сервера будут заменены (перед этим сервер сам сделает бэкап)' : 'на это устройство';
    if (!confirm('Восстановить копию ' + where + '?')) return;
    toast(await store.importBackup(obj));
  } catch (err) { toast('Не удалось восстановить: ' + err.message, true); }
  e.target.value = '';
};

let toastT;
function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

// Пока человек заполняет форму, свежие данные из таблицы не перерисовывают панель — применим после
let renderPending = false;
const typing = () => { const a = document.activeElement; return a && a.closest && a.closest('.side form, .side .filters') && /INPUT|SELECT|TEXTAREA/.test(a.tagName); };
document.addEventListener('focusout', () => setTimeout(() => { if (renderPending && !typing()) { renderPending = false; render(); } }, 50));

store.on((what) => {
  if (what === 'status') { renderStatus(); renderBanner(); }
  if (what === 'sync') renderStatus();
  if (what === 'saved') { renderStatus(); toast('✓ Записано в таблицу'); }
  if (what === 'saved-local') toast('Сохранено на устройстве · таблица не подключена');
  if (what && what.type === 'rejected') toast('Таблица не приняла изменение: ' + what.message, true);
  if (what === 'data') {
    scene.update();
    if (typing()) { renderPending = true; renderKpis(); } else render();
  }
});
setInterval(renderStatus, 5000);

renderStatus();
store.load();
// офлайн-режим: приложение откроется и без связи (последняя копия данных на устройстве)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__stroyka = { store, scene, state };
