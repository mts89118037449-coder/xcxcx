import { dayDiff, Store, SECTIONS, FLOORS, ROOF, TOP, LAYOUT, PROFILE, T, WORKS, BY_EXPENSES, levelsOf, floorName, floorShort, ruToIso, isoToday, EXPENSE_CATS, floorsInText } from './data.js';
import { BuildingScene } from './scene.js';
import { UnitsScene } from './scene-units.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtN = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const store = new Store();
const state = {
  tab: 'summary',
  section: SECTIONS[0],
  open: new Set(),   // развёрнутые категории этажа
  floor: LAYOUT === 'stack' ? 1 : (levelsOf(SECTIONS[0])[0] ?? 0),
  metric: 'avg',
  month: (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })(),
  day: isoToday(),
  money: 'contract',
  expCat: 'all',
  expPart: 'all',
  stockTab: (() => { try { return localStorage.getItem('stroyka.stk') || 'stock'; } catch { return 'stock'; } })(),
  sum: (() => { try { return localStorage.getItem('stroyka.sum') || 'main'; } catch { return 'main'; } })(),
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

// подпись проекта — по структуре из таблиц
/** Название объекта в шапке: из реестра, из листа «Проект» или из таблицы */
function setObjName() {
  const o = store.objInfo;
  $('#objName').textContent = (o && o.name) || PROFILE.name || T.object || 'Объект';
}
const listParts = () => (SECTIONS.length > 1 ? `${T.partsL} ${SECTIONS.slice(0, -1).join(', ')} и ${SECTIONS[SECTIONS.length - 1]}` : `${T.partL} ${SECTIONS[0]}`);
$('.sub').textContent = BY_EXPENSES ? `${SECTIONS.join(', ')} · учёт расходов` : `${T.object} · ${listParts()} · ${LAYOUT === 'stack' ? TOP + ' этажей' : `${T.levels}: ${FLOORS.length}`}`;
document.title = `Стройка 3D — ${T.object}`;
setObjName();
// высота шапки — чтобы закреплённое 3D на телефоне вставало сразу под ней
const syncTopH = () => document.documentElement.style.setProperty('--toph', $('.top').offsetHeight + 'px');
syncTopH(); addEventListener('resize', syncTopH);
{ const tb = document.querySelector('.tabs [data-tab="floor"] span'); if (tb) tb.textContent = T.level; }
// «Что показать»: для МКД — укрупнённые группы, для других объектов — виды работ из таблицы
function renderMetricButtons() {
  const list = WORKS;   // разделы, которые есть в таблице объекта
  $('#metric').innerHTML = `<button data-m="avg" class="${state.metric === 'avg' ? 'on' : ''}">Все работы</button>` + list.map((w) => `<button data-m="${esc(w)}" class="${state.metric === w ? 'on' : ''}">${esc(w)}</button>`).join('');
}
renderMetricButtons();
// ---------- 3D ----------
const scene = LAYOUT === 'stack' ? new BuildingScene($('#stage'), store) : new UnitsScene($('#stage'), store);
scene.onSelect = (s, f, catId) => {
  openFloor(s, f, catId);
  $('#hintTap').hidden = true; try { localStorage.setItem('stroyka.tapped', '1'); } catch { /* */ }
};

$('#metric').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.metric = b.dataset.m;
  for (const x of $('#metric').children) x.classList.toggle('on', x === b);
  scene.setMetric(state.metric); updateViewLabel();
  renderKpis(); if (state.tab === 'summary') renderSummary();
};
$('#btnView').onclick = () => { scene.select(null); scene.resetView(true); };
scene.onSection = (s) => { state.section = s; renderFloor(); toast(`${T.part} ${s} — нажмите на ${T.levelAcc}, чтобы открыть`); };
// ---------- панель «Вид» ----------
const vp = $('#viewPanel');
const openVP = (on) => { vp.hidden = !on; $('#btnViewPanel').setAttribute('aria-expanded', String(on)); };
$('#btnViewPanel').onclick = (e) => { e.stopPropagation(); openVP(vp.hidden); };
$('#vpClose').onclick = () => openVP(false);
document.addEventListener('click', (e) => { if (!vp.hidden && !vp.contains(e.target) && e.target !== $('#btnViewPanel')) openVP(false); });
function updateViewLabel() {
  const m = state.metric === 'avg' ? 'все работы' : state.metric.toLowerCase();
  const v = { fact: 'как сейчас', progress: 'проценты цветом', project: 'как будет' }[scene.view];
  $('#viewLabel').textContent = state.metric === 'avg' ? `Вид: ${v}` : `${v} · ${m}`;
  $('#viewNote').textContent = { fact: (LAYOUT === 'stack' ? 'Готовые части выглядят как на проекте, остальное — каркас.' : 'Каждое помещение заполняется по проценту работ.') + ' Зелёная полоса показывает, сколько сделано.', progress: 'Чем больше сделано, тем больше зелёного.', project: 'Как объект будет выглядеть после завершения.' }[scene.view];
  const sun = scene.sunInfo;
  $('#sunNote').textContent = sun ? sun.text : '';
}
$('#qualityMode').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  for (const x of $('#qualityMode').children) x.classList.toggle('on', x === b);
  scene.setQuality(b.dataset.q === 'hq');
};
for (const x of $('#qualityMode').children) x.classList.toggle('on', (x.dataset.q === 'hq') === scene.hq);
$('#timeMode').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  for (const x of $('#timeMode').children) x.classList.toggle('on', x === b);
  scene.setTime(b.dataset.t); updateViewLabel();
};
setInterval(() => { if (scene.timeMode === 'now') { scene.setTime('now'); updateViewLabel(); } }, 10 * 60 * 1000);
// подсказка «нажмите на этаж» — пока человек ни разу не открыл этаж
let tapped = false; try { tapped = !!localStorage.getItem('stroyka.tapped'); } catch { /* */ }
if (!tapped) { $('#hintTap').hidden = false; setTimeout(() => { $('#hintTap').hidden = true; }, 7000); }
function renderLegend(v) {
  const shell = LAYOUT === 'stack' ? 'каркас, не начато' : 'не начато';
  const L = {
    fact: `<span><i class="sw sw-facade"></i>готово</span><span><i class="sw sw-strip"></i>полоса — % ${T.levelGen}</span><span><i class="sw sw-shell"></i>${shell}</span><span><i class="sw sw-red"></i>открытые замечания</span>`,
    progress: '<span><i class="sw sw-green"></i>выполнено</span><span><i class="sw sw-full"></i>100%</span><span><i class="sw sw-shell"></i>не начато</span><span><i class="sw sw-red"></i>открытые замечания</span>',
    project: '<span><i class="sw sw-facade"></i>проектный вид после завершения</span>',
  }[v];
  $('#legend').innerHTML = L + `<span class="hint">Клик: ${T.levelL} — подробности · колесо — масштаб</span>`;
}
renderLegend('fact');
$('#hintTap').textContent = `Нажмите на ${T.levelAcc} — откроются объёмы, замечания и материалы`;
$('#viewMode').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  for (const x of $('#viewMode').children) x.classList.toggle('on', x === b);
  scene.setView(b.dataset.v); updateViewLabel();
  document.body.classList.toggle('project-view', b.dataset.v === 'project');
  renderLegend(b.dataset.v);
};

// ---------- вкладки ----------
function setTab(t) {
  if (t === 'tour') { openTour(); return; }
  state.tab = t;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === t);
  for (const el of document.querySelectorAll('.tab')) el.hidden = el.id !== `tab-${t}`;
  if (t === 'floor') scene.select(state.section, state.floor); else scene.select(null);
  render();
  // вкладка всегда открывается с начала: на телефоне — сразу под 3D, на компьютере — верх панели
  if (mobile.matches) scrollTo({ top: 0, behavior: 'instant' }); else { const el = $('#tab-' + t); if (el) el.scrollTop = 0; }
}
$('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); };

function render() {
  renderKpis();
  if (state.tab === 'summary') renderSummary();
  renderFloor();
  if (state.tab === 'calendar') renderCalendar();
  if (state.tab === 'money') renderMoney();
  if (state.tab === 'stock') renderStock();
}

// ---------- KPI поверх сцены ----------
/** Люди на объекте: по секциям из журнала; если записано только общее число — оно; иначе — численность бригад */
function peopleNow() {
  const today = isoToday();
  const ppl = store.allJournal().filter((j) => j.type === 'Люди' && j.date <= today);
  const last = (pred) => { const d = ppl.filter(pred).map((j) => j.date).sort().pop(); return d ? { d, n: ppl.filter((j) => j.date === d && pred(j)).reduce((a, j) => a + j.qty, 0) } : null; };
  const bySec = Object.fromEntries(SECTIONS.map((s) => [s, last((j) => j.section === s)]));
  const general = last((j) => !SECTIONS.includes(j.section));
  const lastDay = ppl.map((j) => j.date).sort().pop() || '';
  const dayTotal = lastDay ? ppl.filter((j) => j.date === lastDay).reduce((a, j) => a + j.qty, 0) : 0;
  const br = store.brigadeStats();
  const isItr = (b) => /итр/i.test(b.type || '') || /^итр/i.test(b.name);
  const brSec = Object.fromEntries(SECTIONS.map((s) => [s, br.filter((b) => !isItr(b) && b.section === s).reduce((a, b) => a + (b.people || 0), 0)]));
  const brShared = br.filter((b) => !isItr(b) && !SECTIONS.includes(b.section)).reduce((a, b) => a + (b.people || 0), 0);
  const itr = br.filter(isItr).reduce((a, b) => a + (b.people || 0), 0);
  const brTotal = br.reduce((a, b) => a + (b.people || 0), 0);
  return { bySec, general, lastDay, dayTotal, brSec, brShared, itr, brTotal, total: dayTotal || brTotal };
}
function renderKpis() {
  const P = peopleNow();
  $('#kpis').innerHTML = SECTIONS.map((s) => {
    const p = P.bySec[s];
    const useGen = P.general && (!p || P.general.d > p.d);   // общая запись свежее — показываем её
    const line = useGen ? `на объекте ${P.general.n} чел. · ${shortDate(P.general.d)}`
      : p ? `${p.n} чел. · ${shortDate(p.d)}`
      : P.brSec[s] ? `по бригадам ${P.brSec[s]} чел.` : P.brTotal ? `бригады: ${P.brTotal} чел. на объекте` : 'людей нет в журнале';
    return `<div class="kpi"><div class="kpi-h">${T.part} ${s}</div>
      <div class="kpi-v">${pct(store.sectionValue(s, state.metric))}</div>
      <div class="bar"><i style="width:${store.sectionValue(s, state.metric) || 0}%"></i></div>
      <div class="kpi-s">${line}</div></div>`;
  }).join('');
}
/** Подвкладка «Люди»: последний день по журналу, по секциям и общее; численность бригад и ИТР */
function peopleBlock(P) {
  const rows = SECTIONS.map((s) => `<div class="row-kv"><span>${esc(T.part)} ${esc(s)}</span><b>${P.bySec[s] ? `${P.bySec[s].n} чел. <span class="muted">· ${shortDate(P.bySec[s].d)}</span>` : '<span class="muted">не указано</span>'}</b></div>`).join('');
  return `<h3>Вышли на работу ${P.lastDay ? `<span class="muted">· последний день в журнале ${shortDate(P.lastDay)}</span>` : ''}</h3>
    <div class="gpr-card">${rows}
      ${P.general ? `<div class="row-kv"><span>Без секции (общее)</span><b>${P.general.n} чел. <span class="muted">· ${shortDate(P.general.d)}</span></b></div>` : ''}
      <div class="row-kv"><span><b>Всего за ${P.lastDay ? shortDate(P.lastDay) : '—'}</b></span><b>${P.dayTotal || '—'}</b></div></div>
    <div class="add-row"><button class="btn small" type="button" data-goto-people>+ Люди вышли сегодня</button></div>`;
}

// ---------- Сводка ----------
function renderSummary() {
  const el = $('#tab-summary');
  const open = store.remarks.filter((r) => store.isOpenRemark(r)).sort((a, b) => ruToIso(a.due).localeCompare(ruToIso(b.due)));
  const today = isoToday();
  const works = WORKS;
  const fcols = SECTIONS.length === 2 && LAYOUT === 'stack' ? '' : `grid-template-columns: ${LAYOUT === 'stack' ? '22px' : 'minmax(64px, auto)'} repeat(${SECTIONS.length}, minmax(0, 1fr))`;
  const on = store.objects.length;
  // «Обзор» — подвкладки вместо длинной ленты
  const ordersOpen = (store.extra.orders || []).filter((o) => store.isOpenOrder(o));
  const lateN = ordersOpen.filter((o) => o.due && o.due < today).length + open.filter((r) => ruToIso(r.due) && ruToIso(r.due) < today).length;
  const sched = SECTIONS.map((x) => store.sectionSchedule(x)).filter(Boolean);
  const lag = sched.length ? Math.max(...sched.map((x) => x.lagAdjusted || 0)) : 0;
  const ppl = peopleNow();
  const subs = [
    ['main', 'Сводка', ''],
    ['tasks', 'Поручения', ordersOpen.length + open.length ? `<em class="${lateN ? 'cnt bad' : 'cnt'}">${ordersOpen.length + open.length}</em>` : ''],
    ...(sched.length ? [['plan', 'График', lag ? `<em class="${lag > 14 ? 'cnt bad' : 'cnt'}">−${lag} дн</em>` : '']] : []),
    ['people', 'Люди', ppl.total ? `<em class="cnt">${ppl.total}</em>` : ''],
    ['floors', T.levels, ''],
    ['data', 'Сверка', (store.checks || []).some((c) => !c.ok) ? '<em class="cnt bad">!</em>' : ''],
  ];
  if (!subs.some(([k]) => k === state.sum)) state.sum = 'main';
  const body = {
    main: `    ${PROFILE.type !== 'mkd' ? '' : `<div class="renders" aria-label="Проект — тендерные визуализации">
      ${[1, 2, 3].map((i) => `<button class="rthumb" data-r="${i}"><img src="assets/renders/render-${i}.jpg" alt="Проектная визуализация ${i}" loading="lazy"></button>`).join('')}
      <span class="rcap">Проект — как будет выглядеть</span>
    </div>`}
    ${BY_EXPENSES && store.connected && !store.finLocked ? `<details class="fold obj-track"><summary>📐 Вести ход работ по объектам — добавить листы объёмов</summary>
      <p class="muted small-note">Сейчас в таблице только расходы. Для каждого объекта (${esc(SECTIONS.join(', '))}) появится лист «Объект …»: помещения × виды работ, объём и выполнено по неделям. Расходы не меняются.</p>
      <label>Помещения или зоны<input id="apLevels" value="Кухня, Санузел, Комната 1, Коридор"></label>
      <button class="btn small" type="button" id="apGo">Добавить листы объёмов</button></details>` : ''}
    <div class="cards">
      ${SECTIONS.map((s) => `
        <div class="card">
          <div class="card-h">${T.part} ${s}</div>
          <div class="big">${BY_EXPENSES ? rubShort(store.fin.expenses.filter((e) => e.section === s).reduce((a, e) => a + e.sum, 0)) : pct(store.sectionValue(s, 'avg'))}</div>
          ${(() => { const sp = store.fin.expenses.filter((e) => e.section === s).reduce((a, e) => a + e.sum, 0); return sp && !BY_EXPENSES ? `<div class="row-bar"><span>Потрачено</span><span></span><b>${rubShort(sp)}</b></div>` : ''; })()}
          ${store.sectionValue(s, 'avg') == null && store.extra.structure && store.extra.structure.byExpenses ? `<p class="muted small-note">потрачено · ${store.fin.expenses.filter((e) => e.section === s).length} опер.</p>` : ''}
          ${store.sectionValue(s, 'avg') == null && !(store.extra.structure && store.extra.structure.byExpenses) ? `<p class="muted small-note">Объёмов пока нет: впишите «Общий объём» (столбец E) в лист «${esc(T.part)} ${esc(s)}»${store.obj ? ` — <a href="https://docs.google.com/spreadsheets/d/${esc(store.obj)}/edit" target="_blank" rel="noopener">открыть таблицу ↗</a>` : ''}.</p>` : ''}
          ${works.map((w) => { const v = store.sectionValue(s, w); return `<div class="row-bar"><span>${w}</span><div class="bar"><i style="width:${v || 0}%"></i></div><b>${pct(v)}</b></div>`; }).join('')}
        </div>`).join('')}
    </div>
    ${(() => { const D = store.contractValue('D'), E = store.contractValue('E'); if (!D || !E) return ''; const p = E / D * 100; return `<button class="contract-card" data-goto="money">
      <span>Выполнено по договору</span><b>${p.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</b>
      <div class="bar"><i style="width:${p}%"></i></div><em>${rubShort(E)} из ${rubShort(D)} ₽</em></button>`; })()}
`,
    tasks: `${ordersBlock()}
    <h3>Протоколы генподрядчика <span class="muted">· открыто ${open.length}</span></h3>
    <ul class="remarks">
      ${open.map((r) => remarkHtml(r, true)).join('') || '<li class="muted">Нет открытых поручений</li>'}
    </ul>
`,
    plan: `${gprBlock()}`,
    people: `${peopleBlock(ppl)}${brigadeBlock()}`,
    floors: `    <h3>По ${T.levelsDat} <span class="muted">· ${state.metric === 'avg' ? 'все работы' : state.metric.toLowerCase()}</span></h3>
    <div class="facade" role="grid">
      ${(LAYOUT === 'stack' ? [...FLOORS].reverse() : FLOORS).map((f) => `
        <div class="f-row" style="${fcols}">
          ${SECTIONS.length !== 2 || LAYOUT !== 'stack' ? `<span class="f-num">${floorShort(f)}</span>` : ''}${SECTIONS.map((s) => {
            const v = store.floorValue(s, f, state.metric);
            const bad = store.remarksFor(s, f).some((r) => store.isOpenRemark(r));
            return `<button class="f-cell ${v === null ? 'na' : ''}" data-s="${s}" data-f="${f}" title="${T.part} ${s} · ${floorName(f)} · ${v === null ? 'не применимо' : Math.round(v) + '%'}">
              <i style="width:${v ?? 0}%" class="${v >= 100 ? 'full' : ''}"></i>${bad ? '<em class="dot"></em>' : ''}<span>${v === null ? '' : Math.round(v) + '%'}</span></button>`;
          }).join(SECTIONS.length === 2 && LAYOUT === 'stack' ? `<span class="f-num">${floorShort(f)}</span>` : '')}
        </div>`).join('')}
      <div class="f-row f-foot" style="${fcols}">${SECTIONS.length !== 2 || LAYOUT !== 'stack' ? '<span></span>' : ''}${SECTIONS.map((s) => `<span>${T.part} ${esc(s)}</span>`).join(SECTIONS.length === 2 && LAYOUT === 'stack' ? '<span></span>' : '')}</div>
    </div>
`,
    data: `${checksHtml()}${sourcesHtml()}`,
  }[state.sum];
  el.innerHTML = `
    <div class="obj-card">
      <div><span class="muted">Объект</span><b>${esc((store.objInfo && store.objInfo.name) || PROFILE.name || T.object)}</b><span class="muted">${esc(listParts())}</span></div>
      <div class="obj-card-a">${on > 1 ? `<button class="btn ghost small" data-objdlg="list">Сменить (${on})</button>` : ''}${store.finLocked ? '' : '<button class="btn small" data-objdlg="new">+ Новый объект</button>'}</div>
    </div>
    <div class="subtabs" role="tablist">${subs.map(([k, t, c]) => `<button role="tab" data-sub="${k}" class="${state.sum === k ? 'on' : ''}">${esc(t)}${c}</button>`).join('')}</div>
    <div class="subbody">${body}</div>`;
  el.querySelectorAll('[data-goto-people]').forEach((b) => b.onclick = () => { setTab('calendar'); const t = document.querySelector('#addType [data-t="Люди"]'); if (t) t.click(); document.querySelector('#addForm')?.scrollIntoView({ behavior: 'smooth' }); });
  el.querySelectorAll('[data-sub]').forEach((b) => b.onclick = () => { state.sum = b.dataset.sub; try { localStorage.setItem('stroyka.sum', state.sum); } catch { /* */ } renderSummary(); el.scrollTop = 0; if (mobile.matches) scrollTo({ top: 0 }); });
  el.querySelectorAll('.f-cell').forEach((b) => b.onclick = () => openFloor(b.dataset.s, +b.dataset.f));
  el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { $('#renderImg').src = `assets/renders/render-${b.dataset.r}.jpg`; $('#renderDlg').showModal(); });
  const ap = $('#apGo', el);
  if (ap) ap.onclick = () => busy(ap, 'Добавляю…', async () => {
    const levels = $('#apLevels', el).value.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
    if (!(await ask([`Добавить листы объёмов: ${SECTIONS.map((x) => 'Объект ' + x).join(', ')}`, `Помещения: ${levels.join(', ')}`], `Таблица ${BOOK.G}. Существующие листы не изменятся.`))) throw new Error('Отменено');
    const res = await store.post({ action: 'addParts', parts: SECTIONS, levels });
    toast('✓ Добавлены листы: ' + (res.added || []).join(', ')); setTimeout(() => location.reload(), 800);
  });
  el.querySelectorAll('[data-objdlg]').forEach((b) => b.onclick = () => openObjects(b.dataset.objdlg === 'new'));
  el.querySelectorAll('[data-floor]').forEach((b) => b.onclick = () => { const [sec, fl] = b.dataset.floor.split('|'); openFloor(sec, +fl, 'remarks'); });
  el.querySelectorAll('[data-goto]').forEach((b) => b.onclick = () => { state.money = 'contract'; setTab(b.dataset.goto); });
}

// ---------- Источники и сверка ----------
function sourcesHtml() {
  const src = store.extra.sources || [];
  if (!src.length) return '';
  const what = { G: 'счета, авансы, поступления, договор, личные расходы, инструмент, журнал, поручения, ИС/АОСР', V: `${store.extra.volumes.length} строк объёмов по этажам`, U: `${store.extra.moves.length} движений материала, ${store.extra.plan.length} строк плана, ${store.extra.worklog.length} — ход работ, ${store.extra.floorStatus.length} статусов этажей` };
  return `<details class="fold"><summary>Откуда данные · ${src.length} табл.</summary><ul class="sources">${src.map((x) => `<li><div><b>${esc((x.title || '').trim() || x.id)}</b><div class="muted">${esc(what[x.key] || '')}</div></div>
    <span class="${x.error ? 'err-t' : x.canEdit ? 'chip-ok' : 'chip-ro'}">${x.error ? esc(x.error) : x.canEdit ? 'чтение и запись' : 'только просмотр'}</span>
    ${!x.error && !x.canEdit ? `<p class="muted small-note">Чтобы править из приложения, владелец (${esc(x.owner || '—')}) должен дать «Редактор» для ${esc(x.me || 'вашего аккаунта')}.</p>` : ''}</li>`).join('')}</ul></details>`;
}
function checksHtml() {
  const c = store.checks || [];
  if (!c.length) return '';
  const bad = c.filter((x) => !x.ok);
  const row = (x) => `<li class="${x.ok ? 'ok' : 'bad'}"><span>${x.ok ? '✓' : '⚠'}</span><div>${esc(x.name)}<div class="muted">в таблице ${fmtN(x.table)} · в приложении ${fmtN(x.app)}</div></div></li>`;
  // всё сходится — одна строка; расхождения — видны сразу
  return `${bad.length ? `<h3><span class="err-t">⚠ Не сходится с итогами таблицы: ${bad.length}</span></h3><ul class="checks">${bad.map(row).join('')}</ul>` : ''}
    <details class="fold"><summary>${bad.length ? 'Все проверки' : '✓ Цифры сходятся с итогами таблицы'} · ${c.length}</summary><ul class="checks">${c.map((x) => `<li class="${x.ok ? 'ok' : 'bad'}"><span>${x.ok ? '✓' : '⚠'}</span><div>${esc(x.name)}<div class="muted">в таблице ${fmtN(x.table)} · в приложении ${fmtN(x.app)}</div></div></li>`).join('')}</ul></details>`;
}

// ---------- Этаж ----------
const BOOK = new Proxy({}, { get: (_, k) => `«${(store.bookInfo(k).title || { G: 'таблица объекта', V: 'объёмы', U: 'VUP CORE' }[k] || '').trim()}»` });
const pct = (v) => (v == null ? '—' : Math.round(v) + '%');
/** Понедельник текущей недели (ISO) — колонка недели в «Выполнении» */
function thisMonday() { const d = new Date(); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// ---------- Этаж: категории-аккордеон ----------
/** Категория: заголовок со сводкой; нажатие разворачивает. Пустая — видна, но не раскрывается. */
function cat(id, icon, title, summary, body, tone = '') {
  const empty = !body;
  const open = !empty && state.open.has(id);
  return `<section class="cat ${tone} ${open ? 'open' : ''} ${empty ? 'empty' : ''}" data-cat="${id}">
    <button type="button" class="cat-h" ${empty ? 'disabled' : `aria-expanded="${open}"`}>
      <i class="cat-i" aria-hidden="true">${icon}</i><b>${title}</b><span class="cat-s">${summary}</span>${empty ? '' : '<em class="cat-chev" aria-hidden="true">›</em>'}
    </button>
    ${open ? `<div class="cat-b">${body}</div>` : ''}
  </section>`;
}

function floorHtml() {
  const s = state.section, f = state.floor;
  const fl = floorName(f).toLowerCase();
  const doc = (w) => store.docs.find((d) => d.floor === f && d.work === w && d[s]);
  const wk = thisMonday();
  const fv = store.floorValue(s, f);
  const works = store.worksFor(s, f);
  const lv = levelsOf(s);

  // 1. Работы — каждый вид разворачивается отдельно
  const workHtml = works.map((w) => {
    const v = store.get(s, f, w);
    const g = store.volumeGroup(s, f, w);
    const id = 'w:' + w;
    const open = state.open.has(id);
    const names = store.brigadeStats().map((b) => b.name);
    const money = !store.finLocked;
    const body = g ? `<div class="tablewrap"><table class="voltab"><thead><tr><th>Вид работ</th><th>Исполнитель</th><th>Объём</th><th>Принято КС-6а</th><th>Неделя с ${shortDate(wk)}</th><th>Выполнено</th>${money ? '<th>Расценка, ₽</th><th>Сумма, ₽</th>' : ''}</tr></thead><tbody>
          ${g.items.map((it) => {
            const vs = (fld, val, lbl, extra = {}) => ev(fmtN(val || 0), { b: 'V', s: it.sheet, r: it.row, f: fld, raw: val || 0, expect: val || '', type: 'number', label: `${it.work}, ${fl}, с. ${s}: ${lbl}`, prop: fld, list: 'extra.volumes', ...extra });
            const col = it.weekCols && it.weekCols[wk];
            const wv = (it.weekly || {})[wk] || 0;
            const rate = store.rateOf(it);
            const who = ev(esc(it.contractor || '— назначить'), { b: 'V', s: it.sheet, r: it.row, f: 'contractor', raw: it.contractor || '', expect: it.contractor || '', type: 'text', options: ['', ...names], label: `${it.work}, ${fl}, с. ${s}: исполнитель`, prop: 'contractor', list: 'extra.volumes' });
            return `<tr><td>${esc(it.work)}${it.due ? `<div class="muted">срок ${esc(it.due)}${it.status ? ' · ' + esc(it.status) : ''}</div>` : ''}</td><td>${who}</td><td>${vs('total', it.total, 'общий объём')}</td><td>${vs('accepted', it.accepted, 'принято по КС-6а')}</td>
              <td>${col ? vs('week', wv, `за неделю с ${shortDate(wk)}`, { c: col, prop: '' }) : '<span class="muted">нет колонки</span>'}</td>
              <td><b>${fmtN(it.done)}</b> <span class="muted">${Math.round(it.done / it.total * 100)}%</span></td>
              ${money ? `<td>${(() => { const hb = store.extra.handbook || {}; const c = (hb.contractors || []).find((x) => x.name.trim().toLowerCase() === String(it.contractor || '').trim().toLowerCase()); const col = hb.workCol && hb.workCol[it.work];
                return c && col ? ev(rate ? fmtN(rate) : 'задать', { b: 'V', s: 'Справочник', r: c.row, f: 'cell', c: col, raw: c.rates[it.work] || '', expect: c.rates[it.work] || '', type: 'number', label: `Расценка «${c.name}» — ${it.work}, ₽ за ед. (для всех этажей)` }) : (rate ? fmtN(rate) : `<span class="muted">${it.contractor ? '—' : 'назначьте исполнителя'}</span>`); })()}</td><td>${rate ? rub(Math.min(it.done, it.total) * rate) : '—'}</td>` : ''}</tr>`;
          }).join('')}
        </tbody></table></div>
        <p class="muted small-note">«Выполнено» таблица считает сама из принятого и недельных объёмов — поэтому меняется через них.</p>`
      : `<p class="muted small-note">Нет строки в таблице «Выполнение» для: ${esc(fl)} — процент не известен.</p>`;
    return `<div class="sub-cat ${open ? 'open' : ''}" data-cat="${esc(id)}">
      <button type="button" class="sub-h" aria-expanded="${open}"><b>${esc(w)}</b><span class="bar"><i style="width:${v || 0}%"></i></span><span class="val-ro">${pct(v)}</span><em class="cat-chev">›</em></button>
      ${open ? `<div class="sub-b">${body}</div>` : ''}</div>`;
  }).join('');
  const weekBtn = works.some((w) => store.volumeGroup(s, f, w)) ? `<div class="add-row"><button class="btn small" type="button" data-week="${esc(s)}|${f}">📏 Внести объём за неделю</button></div>` : '';
  const worksSum = works.length ? (works.length > 3 ? `${works.length} видов · ${pct(fv)}` : works.map((w) => `${esc(w.split(' ')[0])} ${pct(store.get(s, f, w))}`).join(' · ')) : 'нет данных';

  // 2. Замечания: поручения АСГ с упоминанием этажа + замечания по АОСР из листа «Таблица»
  const rem = store.remarksFor(s, f);
  const openRem = rem.filter((r) => store.isOpenRemark(r));
  const dspec = (d, k, val, lbl) => ({ b: 'G', s: d.sheet || 'Таблица', r: d.row, f: 'cell', c: d[s].cols[k], raw: val, expect: val, type: 'text', label: `${lbl}: ${d.label}, ${T.partL} ${s}`, prop: '', list: 'docsRows' });
  const docRows = works.map((w) => ({ w, d: doc(w) })).filter((x) => x.d && x.d[s] && x.d.row);
  const aosrRem = docRows.filter((x) => x.d[s].cols.rem);
  const aosrOpen = aosrRem.filter((x) => x.d[s].rem).length;
  const remBody = (rem.length || aosrRem.length) ? `
    ${openRem.length ? `<ul class="remarks">${openRem.map((r) => remarkHtml(r)).join('')}</ul>` : ''}
    ${aosrRem.length ? `<div class="kv-list">${aosrRem.map((x) => `<div class="kv"><span>По АОСР · ${esc(x.w.toLowerCase())}</span>${ev(esc(x.d[s].rem || 'нет'), dspec(x.d, 'rem', x.d[s].rem, 'Замечания по АОСР'))}</div>`).join('')}</div>` : ''}
    ${rem.length > openRem.length ? `<details class="done-list"><summary>Выполненные · ${rem.length - openRem.length}</summary><ul class="remarks">${rem.filter((r) => !store.isOpenRemark(r)).map((r) => remarkHtml(r)).join('')}</ul></details>` : ''}` : '';
  const remN = openRem.length + aosrOpen;
  const ords = store.ordersFor(s, f);
  const ordOpen = ords.filter((o) => store.isOpenOrder(o)).length;
  const canAddRem = store.objInfo && store.objInfo.mode === 'book';
  const ordHtml = ords.length ? `<h4 class="sub-h4">📌 От руководителя</h4><ul class="remarks">${ords.map(orderHtml).join('')}</ul>` : '';
  const remBodyFull = ordHtml + (remBody || (canAddRem ? '<p class="muted small-note">Замечаний нет.</p>' : '')) + (canAddRem ? '<div class="add-row"><button class="btn small" data-add="remark">+ Замечание</button></div>' : '');

  // 3. Документы ИС / АОСР
  const isN = docRows.filter((x) => x.d[s].is).length, aoN = docRows.filter((x) => x.d[s].aosr).length;
  const acts = (store.extra.acts || []).filter((a) => String(a.section) === s && a.floor === f);
  const actsHtml = acts.length ? `<h4 class="sub-h4">Акты передачи · VUP CORE</h4><ul class="totals">${acts.map((a) => `<li><span><b>Акт ${esc(a.number || '')}</b> · ${esc(a.work || '')}${a.date ? ` <em class="muted">${shortDate(a.date)}</em>` : ''}<div class="muted">${esc(a.chain || '')}${a.status ? ' · ' + esc(a.status) : ''}</div></span>${a.link ? `<a class="btn ghost small" href="${esc(a.link)}" target="_blank" rel="noopener">фото ↗</a>` : ''}</li>`).join('')}</ul>` : '';
  const docsBody0 = docRows.length ? `<table class="doctab"><thead><tr><th></th><th>ИС</th><th>АОСР</th></tr></thead><tbody>
    ${docRows.map((x) => `<tr><td>${esc(x.w)}</td>
      <td class="${x.d[s].is ? 'ok' : ''}">${x.d[s].cols.is ? ev(esc(x.d[s].is || 'нет'), dspec(x.d, 'is', x.d[s].is, 'ИС')) : '—'}</td>
      <td class="${x.d[s].aosr ? 'ok' : ''}">${x.d[s].cols.aosr ? ev(esc(x.d[s].aosr || 'нет'), dspec(x.d, 'aosr', x.d[s].aosr, 'АОСР')) : '—'}</td></tr>`).join('')}
    </tbody></table>` : '';
  const docsBody = (docsBody0 || '') + actsHtml;

  // 4. Материал на этаж (VUP CORE)
  const mv = store.movesTo(s, f);
  const mvBody = mv.length ? `<ul class="totals">${mv.map((m) => `<li><span>${esc(m.material)}${m.date ? ` <em class="muted">${m.dateExact ? '' : '≈ '}${shortDate(m.date)}</em>` : ''}</span><b class="num">${ev(fmtN(m.pallets) + ' пал.', { b: 'U', s: 'Движение материалов', r: m.row, f: 'pallets', raw: m.pallets, expect: m.pallets, type: 'number', label: `${m.material} → ${m.zone}: паллет`, prop: 'pallets', list: 'extra.moves' })}</b></li>`).join('')}</ul>` : '';
  const pal = mv.reduce((a, m) => a + (m.pallets || 0), 0);
  const palQ = mv.map((m) => store.palletsTo(m.material, m.pallets || 0)).filter(Boolean);
  const palM = palQ.length ? Object.entries(palQ.reduce((a, c) => ((a[c.unit] = (a[c.unit] || 0) + c.qty), a), {})).map(([u, q]) => `≈ ${fmtN(Math.round(q))} ${u}`).join(', ') : '';

  // 5. Люди и бригады (VUP CORE · ход работ)
  const wl = store.worklogOf(s, f);
  const wlBody = wl.length ? `<ul class="totals">${wl.map((w) => `<li><span>${esc(w.stage)}${w.brigade && !/не уточн/i.test(w.brigade) ? ' · ' + esc(w.brigade) : ''}${w.start ? ' · с ' + shortDate(w.start) : ''}</span><b>${ev((w.workers ? fmtN(w.workers) : '—') + ' чел.', { b: 'U', s: 'Стройка · ход работ', r: w.row, f: 'workers', raw: w.workers || '', expect: w.workers || '', type: 'number', label: `${w.stage}, ${fl}: число рабочих`, prop: 'workers', list: 'extra.worklog' })}</b></li>`).join('')}</ul>` : '';
  const ppl = wl.reduce((a, w) => a + (Number(w.workers) || 0), 0);
  const brig = (store.extra.brigades || []).filter((b) => !b.section || b.section === s);
  const brigN = brig.reduce((a, b) => a + (b.people || 0), 0);
  const wlFull = (wlBody || '') + (brig.length ? `<h4 class="sub-h4">Бригады ${brig.some((b) => b.section) ? `${esc(T.partGen)} ${esc(s)}` : 'на объекте'} · ${fmtN(brigN)} чел.</h4>${brigadesHtml(brig)}` : '');

  // 6. Статус этажа (VUP CORE)
  const st = store.floorStatusOf(s, f);
  const stBody = st.length ? st.map((x) => `<div class="fstatus"><b>${ev(esc(x.status), { b: 'U', s: 'Стройка · статусы этажей', r: x.row, f: 'status', raw: x.status, expect: x.status, type: 'text', label: `Статус этажа ${f}, ${T.partL} ${s}`, prop: 'status', list: 'extra.floorStatus' })}</b><span>${x.date ? shortDate(x.date) : ''} · ${esc(x.source || 'VUP CORE')}</span>${x.comment ? `<p>${esc(x.comment)}</p>` : ''}</div>`).join('') : '';

  return `
    <div class="floor-nav">
      ${SECTIONS.length > 1 ? `<div class="seg small">${SECTIONS.map((x) => `<button data-sec="${esc(x)}" class="${x === s ? 'on' : ''}">${T.part} ${esc(x)}</button>`).join('')}</div>` : `<b>${T.part} ${esc(s)}</b>`}
      <div class="stepper">
        <button class="btn ghost small" data-step="-1" ${lv.indexOf(f) <= 0 ? 'disabled' : ''} aria-label="${LAYOUT === 'stack' ? 'Этаж ниже' : 'Предыдущий'}">${LAYOUT === 'stack' ? '▼' : '◀'}</button>
        <select class="floor-sel" aria-label="${T.level}">${lv.map((x) => `<option value="${x}" ${x === f ? 'selected' : ''}>${esc(floorName(x))}</option>`).join('')}</select>
        <button class="btn ghost small" data-step="1" ${lv.indexOf(f) >= lv.length - 1 ? 'disabled' : ''} aria-label="${LAYOUT === 'stack' ? 'Этаж выше' : 'Следующий'}">${LAYOUT === 'stack' ? '▲' : '▶'}</button>
      </div>
    </div>
    <div class="big floor-big">${fv == null ? '<span class="nodata">нет данных</span>' : pct(fv)}<span class="muted"> ${fl}, ${T.partL} ${esc(s)}</span></div>
    <div class="cats">
      ${cat('works', '▥', 'Работы', worksSum, works.length ? weekBtn + workHtml : '')}
      ${cat('remarks', '!', 'Замечания и поручения', remN + ordOpen ? `<span class="err-t">${remN + ordOpen} открыт.</span>` : (rem.length || aosrRem.length || ords.length) ? 'открытых нет' : 'нет', (rem.length || aosrRem.length || ords.length || canAddRem) ? remBodyFull : '', remN + ordOpen ? 'warn' : '')}
      ${(() => { const g = store.scheduleOf(s, f); if (!g) return '';
        const gs = (row) => ({ b: 'G', s: 'ГПР', r: row.row, f: 'received', raw: row.received || '', expect: row.received ? row.received.split('-').reverse().join('.') : '', type: 'date', label: `${row.name}: этаж передан (факт)`, prop: 'received', list: 'extra.gpr' });
        const sum = g.status === 'готово' ? 'готово' : g.lag > 0 ? `<span class="${g.lag > 7 ? 'err-t' : ''}">отставание ≈ ${g.lag} дн.</span>` : g.status;
        const body = `<ul class="totals">${g.rows.map((r) => `<li><span><b>${esc(r.work)}</b><div class="muted">план ${shortDate(r.start)} – ${shortDate(r.end)}${r.shift ? ` · с учётом передачи до ${shortDate(r.e2)}` : ''}</div>
            <div class="muted">должно быть ${Math.round(r.expected)}% · факт ${r.fact == null ? '—' : Math.round(r.fact) + '%'} · ${r.lag > 0 ? `<span class="${r.lag > 7 ? 'err-t' : ''}">отстаём ≈ ${r.lag} дн.</span>` : esc(r.status)}</div></span>
            ${g.handover ? '' : `<span class="muted">передан: ${store.finLocked ? (r.received ? shortDate(r.received) : '—') : ev(r.received ? shortDate(r.received) : 'отметить', gs(r))}</span>`}</li>`).join('')}</ul>
          ${g.receivedSrc && !/Выполнение/.test(g.receivedSrc) ? `<div class="row-kv"><span>Передан по данным</span><b>${shortDate(g.received)} <span class="muted">· ${esc(g.receivedSrc)}</span></b></div>` : ''}
          ${g.handover ? `<div class="row-kv"><span>Этаж передан (факт) <em class="muted">· «Выполнение», столбец A</em></span><b>${store.finLocked ? (g.handover.date ? shortDate(g.handover.date) : '—') : ev(g.handover.date ? shortDate(g.handover.date) : 'отметить', { b: 'V', s: g.handover.sheet, r: g.handover.row, f: 'handover', raw: g.handover.date || '', expect: g.handover.raw || '', type: 'date', label: `${T.part} ${s}, ${fl}: дата передачи этажа`, prop: 'handover', list: 'extra.volumes' })}</b></div>` : ''}
          ${g.shift ? `<p class="muted small-note">Этаж передан на ${g.shift} дн. позже графика — срок сдвинут.</p>` : ''}`;
        return cat('plan', '📅', 'График (ГПР)', sum, body, g.lag > 7 ? 'warn' : ''); })()}
      ${cat('docs', '▤', 'Документы', (docRows.length ? `ИС ${isN}/${docRows.length} · АОСР ${aoN}/${docRows.length}` : 'нет строки в «Таблице»') + (acts.length ? ` · актов ${acts.length}` : ''), docsBody)}
      ${cat('mat', '▣', 'Материал', mv.length ? `${mv.length} подач · ${fmtN(pal)} пал.${palM ? ' · ' + palM : ''}` : 'нет', mvBody)}
      ${cat('people', '👷', 'Люди и бригады', wl.length ? `${wl.length} в работе${ppl ? ' · ' + fmtN(ppl) + ' чел.' : ''}` : brig.length ? `${brig.length} бригад · ${fmtN(brigN)} чел.` : 'нет', wlFull)}
      ${cat('status', '◉', 'Статус', st.length ? esc(st[0].status) : 'нет', stBody)}
    </div>
    <p class="hint-line">Нажмите категорию, чтобы развернуть. Значения со значком ✎ записываются прямо в ячейку таблицы.</p>`;
}

/** Поручение руководителя: текст, кому, где, срок; рабочие отмечают «Выполнено» */
function orderHtml(o) {
  const today = isoToday();
  const late = store.isOpenOrder(o) && o.due && o.due < today;
  const sp = (f, raw, type, label, extra = {}) => ({ b: 'G', s: 'Поручения', r: o.row, f, raw, expect: raw, type, label: `Поручение «${o.text.slice(0, 40)}»: ${label}`, prop: f, list: 'extra.orders', ...extra });
  const where = [o.section ? `${T.partShort}${o.section}` : '', o.floor != null ? floorShort(o.floor) + (LAYOUT === 'stack' && o.floor > 0 && o.floor !== ROOF ? ' эт.' : '') : ''].filter(Boolean).join(' · ');
  return `<li class="${store.isOpenOrder(o) ? (late ? 'late' : '') : 'done'} order"><div><b>${esc(o.text)}</b>
    <div class="muted">${o.who ? '👷 ' + esc(o.who) + ' · ' : ''}${where ? esc(where) + ' · ' : ''}${ev(esc(o.status || 'В работе'), sp('status', o.status || 'В работе', 'text', 'статус', { options: ['В работе', 'Выполнено', 'Отменено'] }))}</div>
    ${where && o.section && o.floor != null ? `<span class="r-go"><button type="button" class="chip-go" data-floor="${esc(o.section)}|${o.floor}">открыть ${esc(where)} ›</button></span>` : ''}</div>
    <div class="r-meta">${o.due ? `<span class="${late ? 'err-t' : ''}">срок ${shortDate(o.due)}${late ? ' · просрочено' : ''}</span>` : ''}</div></li>`;
}
function ordersBlock() {
  const list = (store.extra.orders || []).filter((o) => store.isOpenOrder(o)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const all = (store.extra.orders || []).length;
  if (!all && store.finLocked) return '';
  return `<div class="orders-box"><h3>📌 Поручения руководителя <span class="muted">· ${list.length ? list.length + ' в работе' : 'нет открытых'}</span></h3>
    ${list.length ? `<ul class="remarks">${list.map(orderHtml).join('')}</ul>` : ''}
    ${store.finLocked ? '' : '<div class="add-row"><button class="btn small" data-add="order">+ Поручение</button></div>'}</div>`;
}
/** ГПР по секциям: что должно идти сейчас, что по факту, отставание и задержки передачи этажей */
function gprBlock() {
  const rows = SECTIONS.map((s) => [s, store.sectionSchedule(s)]).filter(([, x]) => x);
  if (!rows.length) return '';
  const rng = (fs) => { if (!fs.length) return '—'; const a = Math.min(...fs), b = Math.max(...fs); return a === b ? floorShort(a) : `${floorShort(a)}–${floorShort(b)}`; };
  return `<h3>График (ГПР)</h3><div class="gpr-cards">${rows.map(([s, x]) => `<div class="gpr-card ${x.lagAdjusted > 14 ? 'bad' : x.lagAdjusted > 0 ? 'warn' : 'ok'}">
      <div class="card-h">${esc(T.part)} ${esc(s)}</div>
      <div class="row-kv"><span>К сегодня по графику</span><b>${Math.round(x.planPct)}%</b></div>
      <div class="row-kv"><span>Сделано по факту</span><b>${Math.round(x.factPct)}%</b></div>
      <div class="bar gpr-bar"><i style="width:${Math.min(100, x.factPct)}%"></i><em style="left:${Math.min(100, x.planPct)}%"></em></div>
      <div class="row-kv"><span>Отставание по договору</span><b class="${x.lagContract > 14 ? 'err-t' : ''}">${x.lagContract ? '≈ ' + x.lagContract + ' дн.' : 'нет'}</b></div>
      <div class="row-kv"><span>С учётом поздней передачи этажей</span><b class="${x.lagAdjusted > 14 ? 'err-t' : ''}">${x.lagAdjusted ? '≈ ' + x.lagAdjusted + ' дн.' : 'нет'}</b></div>
      <div class="row-kv"><span>По графику сейчас</span><b>${x.now.length ? esc(rng(x.now)) + (LAYOUT === 'stack' ? ' эт.' : '') : x.shouldDone.length >= x.floors.length ? 'всё по графику завершено' : '—'}</b></div>
      <div class="row-kv"><span>Готово этажей</span><b>${x.done.length} <span class="muted">из ${x.doneByPlan} по графику</span></b></div>
      <div class="row-kv"><span>В работе</span><b>${esc(rng(x.inWork))}</b></div>
      <div class="row-kv"><span>Сильнее всего отстаёт</span><b class="${x.maxLag > 7 ? 'err-t' : ''}">${x.maxLag > 0 ? '≈ ' + x.maxLag + ' дн.' + (x.worst ? ` · ${esc(floorShort(x.worst.f))}${LAYOUT === 'stack' ? ' эт.' : ''}` : '') : 'нет'}</b></div>
      <div class="row-kv"><span>Этажи переданы позже</span><b>${x.shifted.length ? `${x.shifted.length} шт., до +${x.maxShift} дн.` : '<span class="muted">не отмечено</span>'}</b></div>
      <div class="row-kv"><span>Окончание по графику</span><b>${x.end ? shortDate(x.end) : '—'}</b></div></div>`).join('')}</div>
    ${handoverHtml()}
    <p class="muted small-note">«К сегодня по графику» — доля всего графика (по стоимости этапов), которая уже должна быть сделана; отставание — на сколько дней факт позади графика. «С учётом поздней передачи» — если в листе «ГПР» отмечено, что этаж получили позже, срок сдвигается: эта часть задержки не наша.</p>`;
}
/** Таблица «Передача этажей»: по каждому этажу — когда по ГПР, когда фактически и откуда дата */
function handoverHtml() {
  const t = SECTIONS.map((s) => [s, store.handoverTable(s)]).filter(([, r]) => r.length);
  if (!t.length) return '';
  const known = t.reduce((a, [, r]) => a + r.filter((x) => x.fact).length, 0);
  const floors = [...new Set(t.flatMap(([, r]) => r.map((x) => x.floor)))].sort((a, b) => b - a);
  const cell = (r) => !r ? '<td></td>' : `<td>${shortDate(r.plan)}${r.fact ? `<div class="${r.shift > 0 ? 'err-t' : 'okc'}">→ ${shortDate(r.fact)}${r.shift ? ` (${r.shift > 0 ? '+' : ''}${r.shift} дн.)` : ''}</div><div class="muted">${esc(r.src || '')}</div>` : '<div class="muted">факт —</div>'}</td>`;
  return `<details class="fold" ${known ? 'open' : ''}><summary>Передача этажей · дат по факту: ${known}</summary>
    <div class="tablewrap"><table class="doctab hand"><thead><tr><th></th>${t.map(([s]) => `<th>${esc(T.part)} ${esc(s)}<div class="muted">план → факт</div></th>`).join('')}</tr></thead><tbody>
    ${floors.map((f) => `<tr><td><button type="button" class="chip-go" data-floor="${esc(t[0][0])}|${f}">${esc(floorShort(f))}</button></td>${t.map(([, r]) => cell(r.find((x) => x.floor === f))).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="muted small-note">Факт берётся: «Выполнение» → столбец A «Дата передачи этажа»; если пусто — акт передачи из VUP CORE («Акты стройки»); если нет — лист «ГПР», «Этаж передан». Отметить дату: нажмите этаж → «График (ГПР)» → «Этаж передан».</p></details>`;
}
/** Бригады в «Обзоре»: кто, сколько человек, где работает, сколько сделал (и на какую сумму — у руководителя) */
function brigadeBlock() {
  const br = store.brigadeStats();
  if (!br.length) return '';
  const isItr = (b) => /итр/i.test(b.type || '') || /^итр/i.test(b.name);
  const n = br.filter((b) => !isItr(b)).reduce((a, b) => a + (b.people || 0), 0), itr = br.filter(isItr).reduce((a, b) => a + (b.people || 0), 0);
  const assigned = br.some((b) => b.rows.length);
  const fl = (b) => { const by = {}; for (const k of b.floors) { const [sec, f] = k.split('|'); (by[sec] ||= []).push(+f); } return Object.entries(by).map(([sec, fs]) => `${T.partShort}${sec}: ${fs.sort((x, y) => x - y).map(floorShort).join(', ')}`).join(' · '); };
  const hb = store.extra.handbook || {};
  const bs = (b) => (b.hbRow && hb.cols && hb.cols.people > 0
    ? { b: 'V', s: 'Справочник', r: b.hbRow, f: 'cell', c: hb.cols.people, raw: b.people || '', expect: b.people || '', type: 'number', label: `Бригада «${b.name}»: человек` }
    : { b: 'G', s: 'Бригады', r: b.sheetRow, f: 'people', raw: b.people || '', expect: b.people || '', type: 'number', label: `Бригада «${b.name}»: человек`, prop: 'people', list: 'extra.brigades' });
  return `<h3>Бригады <span class="muted">· ${fmtN(n)} чел.${itr || br.some(isItr) ? ` + ИТР ${itr ? fmtN(itr) : '?'} = ${fmtN(n + itr)}` : ''}</span></h3>
    <ul class="totals brig">${br.map((b) => `<li><span><b>${esc(b.name)}</b>${b.type ? ` <em class="chip-s">${esc(b.type)}</em>` : ''}
      ${b.rows.length ? `<div class="muted">${esc(fl(b))}</div><div class="muted">${b.byWork.map((w) => `${esc(cleanW(w.work))} ${fmtN(w.done)}/${fmtN(w.total)} ${esc(unitOf(w.work))}`).join(' · ')}</div>` : b.works ? `<div class="muted">${esc(b.works)}</div>` : ''}
      ${!store.finLocked && b.earned != null ? `<div class="muted">выполнено на <b>${rub(b.earned)}</b>${Object.keys(b.rates).length ? ' · расценки: ' + Object.entries(b.rates).map(([w, r]) => `${esc(cleanW(w))} ${fmtN(r)} ₽`).join(', ') : ''}</div>` : ''}
      ${b.phone ? `<div class="muted"><a href="tel:${esc(b.phone.replace(/[^+\d]/g, ''))}">${esc(b.phone)}</a></div>` : ''}${b.note ? `<div class="muted">${esc(b.note)}</div>` : ''}</span>
      <b class="num">${b.sheetRow || b.hbRow ? ev(b.people ? fmtN(b.people) + ' чел.' : '<span class="err-t">уточнить</span>', bs(b)) : (b.people ? fmtN(b.people) + ' чел.' : '')}</b></li>`).join('')}</ul>
    ${assigned ? '' : `<p class="muted small-note">В «Выполнении» у строк объёмов не указан «Исполнитель» — назначьте бригаду на этаже (Работы → вид работ → «Исполнитель»), и здесь появится, где она работает и сколько сделала.</p>`}
    <div class="add-row"><button class="btn ghost small" data-add="brigade">+ Бригада</button></div>`;
}
const cleanW = (w) => String(w || '').replace(/,\s*[^,]+$/, '');
const unitOf = (w) => { const m = String(w || '').match(/,\s*([^,]+)$/); return m ? m[1] : ''; };
/** Бригады (лист «Бригады»): численность правится прямо здесь */
function brigadesHtml(list) {
  if (!list.length) return '';
  const bs = (b, f, raw, type, lbl, extra = {}) => ({ b: 'G', s: 'Бригады', r: b.row, f, raw, expect: raw, type, label: `Бригада «${b.name}»: ${lbl}`, prop: f, list: 'extra.brigades', ...extra });
  return `<ul class="totals brig">${list.map((b) => `<li><span><b>${esc(b.name)}</b>${b.type ? ` <em class="chip-s">${esc(b.type)}</em>` : ''}${b.works ? `<div class="muted">${esc(b.works)}</div>` : ''}${b.note ? `<div class="muted">${esc(b.note)}</div>` : ''}</span>
    <b class="num">${ev(b.people ? fmtN(b.people) + ' чел.' : '<span class="err-t">уточнить</span>', bs(b, 'people', b.people || '', 'number', 'человек'))}</b></li>`).join('')}</ul>`;
}
/** Где показан этаж: в панели справа (компьютер) и/или в нижней шторке (телефон) */
function renderFloor() {
  const targets = [];
  if (state.tab === 'floor') targets.push($('#tab-floor'));
  if (!$('#sheet').hidden) targets.push($('#sheetBody'));
  if (!targets.length) return;
  const html = floorHtml();
  for (const el of targets) {
    const keep = el.scrollTop;
    el.innerHTML = html;
    el.scrollTop = keep;
    bindFloor(el);
  }
  $('#sheetTitle').textContent = `${T.part} ${state.section} · ${floorName(state.floor)}`;
}
function bindFloor(el) {
  const go = () => { scene.select(state.section, state.floor); scene.focusFloor(state.section, state.floor); renderFloor(); };
  el.querySelectorAll('[data-sec]').forEach((b) => b.onclick = () => { state.section = b.dataset.sec; const lv = levelsOf(state.section); if (!lv.includes(state.floor)) state.floor = lv[0]; go(); });
  el.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => { const lv = levelsOf(state.section); const i = Math.max(0, Math.min(lv.length - 1, lv.indexOf(state.floor) + +b.dataset.step)); state.floor = lv[i]; go(); });
  el.querySelector('.floor-sel').onchange = (e) => { state.floor = +e.target.value; go(); };
  el.querySelectorAll('.cat-h:not([disabled]), .sub-h').forEach((b) => b.onclick = () => {
    const id = b.parentElement.dataset.cat;
    if (state.open.has(id)) state.open.delete(id); else state.open.add(id);
    renderFloor();
  });
}

/** Открыть этаж (из 3D, из обзора, из поручения). cat — какую категорию сразу развернуть. */
function openFloor(s, f, catId) {
  state.section = s; state.floor = f;
  if (catId) state.open.add(catId);
  scene.select(s, f);
  scene.focusFloor(s, f);
  if (mobile.matches) { openSheet(); }
  else { setTab('floor'); $('.side').scrollTop = 0; $('#tab-floor').scrollTop = 0; }
  if (catId) setTimeout(() => document.querySelectorAll(`[data-cat="${catId}"]`).forEach((x) => x.scrollIntoView({ block: 'nearest', behavior: 'smooth' })), 60);
}

// ---------- нижняя шторка этажа (телефон) ----------
function openSheet() {
  const sh = $('#sheet');
  sh.hidden = false;
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => sh.classList.add('up'));
  renderFloor();
}
function closeSheet() {
  const sh = $('#sheet');
  sh.classList.remove('up');
  document.body.classList.remove('sheet-open');
  setTimeout(() => { sh.hidden = true; }, 220);
  if (state.tab !== 'floor') scene.select(null);
}
$('#sheetClose').onclick = closeSheet;
(() => {   // смахнуть вниз — закрыть
  const h = $('#sheetGrip'), sh = $('#sheet');
  let y0 = null;
  h.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; y0 = e.clientY; h.setPointerCapture(e.pointerId); sh.style.transition = 'none'; });
  h.addEventListener('pointermove', (e) => { if (y0 != null) sh.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
  const end = (e) => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; sh.style.transition = ''; sh.style.transform = ''; if (dy > 70) closeSheet(); };
  h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
})();
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

/** Поручение с редактируемыми статусом и датой выполнения */
function remarkHtml(r, links = false) {
  const sec = SECTIONS.includes(String(r.section)) ? String(r.section) : null;
  const fls = links && sec ? floorsInText(r.short + ' ' + r.text) : [];
  const go = fls.length ? `<span class="r-go">${fls.slice(0, 6).map((f) => `<button type="button" class="chip-go" data-floor="${esc(sec)}|${f}" title="Открыть">${T.partShort}${esc(sec)} · ${esc(floorShort(f))}${LAYOUT === 'stack' ? ' эт.' : ''} ›</button>`).join('')}${fls.length > 6 ? '…' : ''}</span>` : '';
  const spec = (f, raw, type, label, extra = {}) => ({ b: 'G', s: r.sheet || 'Замечания АСГ', r: r.row, f, raw, expect: raw, type, label: `${r.short}: ${label}`, prop: f === 'status' ? 'status' : f === 'done' ? 'done' : '', list: 'remarks', ...extra });
  return `<li class="${store.isOpenRemark(r) ? 'late' : 'done'}"><div><b>${esc(r.short)}</b>
    <div class="muted">${r.row ? ev(esc(r.status || 'статус'), spec('status', r.status, 'text', 'статус по протоколу', { options: ['В работе', 'Срыв сроков', 'Выполнено'] })) : esc(r.status)}${r.note ? ' · ' + esc(r.note) : ''}</div>${go}</div>
    <div class="r-meta"><span>срок ${esc(r.due)}</span>${r.row ? `<span>выполнено: ${ev(esc(r.done || '—'), spec('done', ruToIso(r.done) || '', 'date', 'дата выполнения'))}</span>` : ''}</div></li>`;
}

// ---------- редактирование любого значения ----------
/** Значение, которое можно изменить: нажатие → окно «было → станет» → запись в ячейку таблицы */
function ev(display, spec) {
  if (!spec.r) return display;
  const can = store.canEditBook(spec.b);
  if (!can) return `<span class="ro-v">${display}</span>`;   // нельзя менять — просто значение, без значков
  return `<button type="button" class="ev" data-edit="${esc(JSON.stringify(spec))}" title="Изменить в таблице">${display}<i aria-hidden="true">✎</i></button>`;
}
function editDialog(title, fields, where) {
  const dlg = $('#editDlg');
  $('#edTitle').textContent = title;
  $('#edWhere').textContent = where || '';
  $('#edFields').innerHTML = fields.map((x, i) => `<label>${esc(x.label)}${x.options
    ? `<select id="ed${i}">${x.options.map((o) => `<option ${String(o) === String(x.value) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : `<input id="ed${i}" type="${x.type === 'number' ? 'number' : x.type === 'date' ? 'date' : 'text'}" step="any" value="${esc(x.value ?? '')}">`}
    ${x.was !== undefined ? `<small class="muted">Сейчас в таблице: ${esc(x.was === '' ? 'пусто' : x.was)}</small>` : ''}</label>`).join('');
  return new Promise((resolve) => {
    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'yes' ? fields.map((x, i) => $('#ed' + i).value) : null);
    dlg.showModal();
    setTimeout(() => $('#ed0')?.focus(), 50);
  });
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-edit]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const spec = JSON.parse(b.dataset.edit);
  if (!store.canEditBook(spec.b)) {
    const bi = store.bookInfo(spec.b);
    toast(store.connected ? `Только просмотр: у ${bi.me || 'вашего аккаунта'} нет прав на запись в ${BOOK[spec.b]}. Попросите владельца (${bi.owner || 'автора таблицы'}) дать доступ «Редактор».` : 'Таблица не подключена — менять нельзя.', true);
    return;
  }
  const res = await editDialog(spec.label, [{ label: 'Новое значение', value: spec.raw ?? '', was: spec.raw ?? '', type: spec.type, options: spec.options }],
    `Запишется в таблицу ${BOOK[spec.b]}, лист «${spec.s.trim()}», строка ${spec.r}. После записи таблица вернёт значение, и приложение его сверит.`);
  if (!res) return;
  const v = res[0];
  if (String(v) === String(spec.raw ?? '')) { toast('Значение не изменилось'); return; }
  store.setCell(spec, v);
});

function preview(s, f, w, v) {
  const p = store.progress.get(`${s}|${f}|${w}`);
  if (p) p.value = v; else store.progress.set(`${s}|${f}|${w}`, { section: s, floor: f, work: w, value: v });
  scene.update(); renderKpis();
  const big = $('.floor-big'); if (big) big.firstChild.textContent = pct(store.floorValue(s, f));
}

const pending = new Map();
const original = new Map();
function save(s, f, w, v, orig) {
  const k = `${s}|${f}|${w}`;
  if (!original.has(k)) original.set(k, orig ?? store.get(s, f, w));
  clearTimeout(pending.get(k));
  preview(s, f, w, v);
  pending.set(k, setTimeout(async () => {
    const old = original.get(k); original.delete(k);
    if (old === v) return;
    const yes = await ask([`${T.part} ${s}, ${floorName(f).toLowerCase()} — ${w.toLowerCase()}: ${old}% → ${v}%`], store.connected ? `Лист «Прогресс» таблицы ${BOOK.G}.` : '');
    if (yes) store.setProgress(s, f, w, v);
    else { preview(s, f, w, old); renderFloor(); toast('Изменение отменено'); }
  }, 450));
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
  const monthEntries = store.allJournal().filter((j) => j.date.startsWith(monthPrefix));
  const maxPeople = Math.max(1, ...Array.from({ length: days }, (_, i) => store.peopleOn(iso(i + 1))));
  const dueMap = {};
  for (const r of store.remarks) { const d = ruToIso(r.due); if (d && store.isOpenRemark(r)) (dueMap[d] ||= []).push(r); }
  for (const o of store.extra.orders || []) if (o.due && store.isOpenOrder(o)) (dueMap[o.due] ||= []).push({ short: '📌 ' + o.text, section: o.section });

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push('<div class="c-cell empty"></div>');
  for (let d = 1; d <= days; d++) {
    const k = iso(d);
    const ps = SECTIONS.map((x) => [x, store.peopleOn(k, x)]), pAll = store.peopleOn(k), pSec = ps.reduce((a, x) => a + x[1], 0);
    const mats = store.journalOn(k).filter((j) => j.type === 'Материал').length;
    const spent = store.expenseTotal(store.expensesOn(k));
    const heat = pAll / maxPeople;
    cells.push(`<button class="c-cell ${k === today ? 'today' : ''} ${k === state.day ? 'sel' : ''}" data-d="${k}" style="--heat:${(heat * 0.55).toFixed(2)}">
      <span class="c-d">${d}</span>
      <span class="c-chips">
        ${ps.map(([x, n], i) => n ? `<span class="chip-s s${i % 2 ? 5 : 4}" title="${T.part} ${esc(x)}: ${n} чел.">${esc(x)}·${n}</span>` : '').join('')}
        ${pAll - pSec > 0 ? `<span class="chip-s" title="Общее: ${pAll - pSec} чел.">∑·${pAll - pSec}</span>` : ''}
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
    ${(dueMap[state.day] || []).map((r) => `<div class="due">Срок: ${esc(r.short)} (${T.partShort} ${esc(r.section)})</div>`).join('')}
    <ul class="entries">
      ${dayEntries.map((j) => `<li class="${j.type === 'Люди' ? 'e-people' : 'e-mat'}">
        <span class="e-ico">${j.type === 'Люди' ? '👷' : j.kind === 'feed' ? '⬆️' : '🚚'}</span>
        <div><b>${esc(j.name || j.type)}</b> — ${fmtN(j.qty)} ${esc(j.unit)}<div class="muted">${esc(j.section === 'Общее' ? 'Общее' : T.part + ' ' + j.section)}${j.note ? ' · ' + esc(j.note) : ''}</div></div>
        ${j.ro ? `<span class="src">${esc(j.src)}</span>` : `<button class="x ed" data-edj="${esc(j.id)}" aria-label="Изменить">✎</button><button class="x" data-del="${esc(j.id)}" aria-label="Удалить">×</button>`}</li>`).join('') || '<li class="muted">Записей нет</li>'}
    </ul>

    ${(() => { const ex = store.expensesOn(state.day); return ex.length ? `<h3>Расходы за день <span class="muted">· ${rub(store.expenseTotal(ex))}</span></h3><ul class="entries">${ex.map((e) => `<li><span class="cat-dot" style="--c:${CAT_COLORS[e.cat] || '#888'}"></span><div><b>${esc(e.note || e.basis || e.cat)}</b><div class="muted">${esc(e.cat)} · ${esc(e.who || '')}</div></div><b class="num">${rub(e.sum)}</b></li>`).join('')}</ul>` : ''; })()}

    <form class="add" id="addForm">
      <div class="seg small" id="addType"><button type="button" data-t="Люди" class="on">👷 Люди вышли</button><button type="button" data-t="Материал">🚚 Материал приехал</button></div>
      <div class="grid2">
        <label>${T.part}<select name="section">${SECTIONS.map((x) => `<option>${esc(x)}</option>`).join('')}<option>Общее</option></select></label>
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
    const j = store.journal.find((x) => x.id === b.dataset.del);
    if (!(await ask([`Удалить из «Журнала»: ${j ? `${j.date}, ${j.name} — ${j.qty} ${j.unit}` : b.dataset.del}`]))) return;
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
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const entry = { date: fd.get('date'), section: fd.get('section'), type, name: fd.get('name') || (type === 'Люди' ? 'Рабочие' : 'Материал'), qty: fd.get('qty'), unit: fd.get('unit'), note: fd.get('note') };
    if (!(await ask([`${editId ? 'Исправить' : 'Добавить'} в «Журнал»: ${entry.date}, ${T.partL} ${entry.section}, ${entry.name} — ${entry.qty} ${entry.unit}`], store.connected ? `Лист «Журнал» таблицы ${BOOK.G}.` : ''))) return;
    state.day = entry.date;
    const [ey, em] = entry.date.split('-').map(Number);
    state.month = { y: ey, m: em - 1 };
    if (editId) store.updateJournal({ ...entry, id: editId }); else store.addJournal(entry);
    form.reset();
  };
}

// ---------- Склад: материал, план подачи, расхождения, инструмент ----------
function renderStock() {
  const el = $('#tab-stock');
  const st = store.stock();
  const pv = store.planVsFact();
  const dis = store.extra.discrepancies;
  const inv = store.extra.inventory;
  const tools = store.fin.tools;
  const byFloor = {};
  for (const p of pv) { const k = `${p.section}|${p.floor}`; (byFloor[k] ||= []).push(p); }
  const floors = Object.keys(byFloor).sort((a, b) => { const [s1, f1] = a.split('|'), [s2, f2] = b.split('|'); return s1.localeCompare(s2) || f2 - f1; });
  // «Склад» — подвкладки: на складе, подача по этажам, расхождения, инвентаризация, инструмент
  const subs = [
    ['stock', 'На складе', st.length ? `<em class="cnt">${st.length}</em>` : ''],
    ...((store.extra.materials || []).length ? [['need', 'Потребность', '']] : []),
    ...(floors.length ? [['feed', 'Подача по ' + T.levelsDat, '']] : []),
    ...(dis.length ? [['dis', 'Расхождения', `<em class="cnt bad">${dis.length}</em>`]] : []),
    ...(inv.length ? [['inv', 'Инвентаризация', `<em class="cnt">${inv.length}</em>`]] : []),
    ['tools', 'Инструмент', tools.length ? `<em class="cnt">${tools.length}</em>` : ''],
  ];
  if (!subs.some(([k]) => k === state.stockTab)) state.stockTab = 'stock';
  const body = {
    stock: `    <div class="kpis3">
      <div><span>Материал на складе</span><b>${fmtN(st.reduce((a, r) => a + Math.max(0, r.left), 0))} пал.</b></div>
      <div><span>Расхождений</span><b>${dis.length}</b></div>
      <div><span>Инструмент</span><b>${tools.length} поз.</b></div>
    </div>
    <h3>Материал на складе <span class="muted">· поступило − подано на объект</span></h3>
    ${st.length ? `<div class="tablewrap"><table class="voltab stock"><thead><tr><th>Материал</th><th>Поступило</th><th>Подано</th><th>Остаток</th><th>≈ хватит на</th></tr></thead><tbody>
      ${st.map((r) => `<tr><td title="${esc(r.names.join(' · '))}">${esc(r.material)}</td><td>${fmtN(r.in)}</td><td>${fmtN(r.out)}</td><td><b class="${r.left < 0 ? 'neg' : ''}">${fmtN(r.left)}</b></td><td>${(() => { const c = store.palletsTo(r.material, Math.max(0, r.left)); return c ? `${fmtN(Math.round(c.qty * 10) / 10)} ${esc(c.unit)}` : '<span class="muted">нет нормы</span>'; })()}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small-note">Паллеты, по листу «Движение материалов» (VUP CORE). Отрицательный остаток — подачу записали, а поступление нет: стоит сверить.</p>` : '<p class="muted">Нет движений материала.</p>'}
    <div class="add-row"><button class="btn" data-add="move-in">+ Материал приехал</button><button class="btn ghost" data-add="move-feed">+ Подача ${LAYOUT === 'stack' ? 'на этаж' : 'в ' + T.levelAcc}</button></div>
`,
    need: needHtml(),
    feed: `    ${floors.length ? `<h3>План подачи · по ${T.levelsDat}</h3>${floors.map((k) => { const [sec, fl] = k.split('|'); const rows = byFloor[k]; return `<div class="planbox"><div class="planh"><b>${T.part} ${sec} · ${fl} этаж</b>${store.floorStatusOf(sec, +fl).map((x) => `<span class="chip-ok">${esc(x.status)}</span>`).join('')}</div>
      <table class="voltab"><tbody>${rows.map((p) => `<tr><td>${esc(p.key)}</td><td>план ${ev(fmtN(p.pallets), { b: 'U', s: 'Стройка · план', r: p.row, f: 'pallets', raw: p.pallets, expect: p.pallets, type: 'number', label: `План ${p.key}, ${p.zone}: паллет`, prop: 'pallets', list: 'extra.plan' })}</td><td>подано ${fmtN(p.fed)}</td><td><b class="${p.fed < p.pallets ? 'neg' : 'okc'}">${p.fed >= p.pallets ? '✓' : '−' + fmtN(p.pallets - p.fed)}</b></td></tr>`).join('')}</tbody></table></div>`; }).join('')}` : ''}
`,
    dis: `    ${dis.length ? `<h3>Расхождения <span class="muted">· требуют сверки</span></h3><ul class="remarks">${dis.map((d) => `<li class="late"><div><b>${T.part} ${esc(d.section)}, ${d.floor} эт. · ${esc(d.material)}</b><div class="muted">План ${fmtN(d.plan)}, учтено ${fmtN(d.fact)} — не хватает ${fmtN(d.diff)} пал.</div></div><div class="r-meta"><span>${ev(esc(d.status), { b: 'U', s: 'Стройка · контроль расхождений', r: d.row, f: 'status', raw: d.status, expect: d.status, type: 'text', label: `Расхождение ${d.material}, ${d.floor} эт.: статус`, options: ['Требуется сверка', 'Сверено', 'Исправлено'], prop: 'status', list: 'extra.discrepancies' })}</span></div></li>`).join('')}</ul>` : ''}
`,
    inv: `    ${inv.length ? `<h3>Инвентаризация склада</h3><ul class="totals">${inv.map((x) => `<li><span>${esc(x.material)} <em class="muted">${x.date ? shortDate(x.date) : ''}</em></span><b class="num">${fmtN(x.qty)} ${esc(x.unit)}</b></li>`).join('')}</ul>` : ''}
`,
    tools: `    <h3>Инструмент <span class="muted">· лист «УЧЁТ ИНСТРУМЕНТА»${tools[0] && tools[0].date ? ', на ' + shortDate(tools[0].date) : ''}</span></h3>
    <ul class="totals tools">${tools.map((x) => `<li><span>${ev(esc(x.name), { b: 'G', s: 'УЧЁТ ИНСТРУМЕНТА ', r: x.row, f: 'name', raw: x.name, expect: x.name, type: 'text', label: 'Инструмент: наименование', prop: 'name', list: 'fin.tools' })}</span><b class="num">${ev(esc(x.qty || '—'), { b: 'G', s: 'УЧЁТ ИНСТРУМЕНТА ', r: x.row, f: 'qty', raw: x.qty, expect: x.qty, type: 'text', label: `${x.name}: количество`, prop: 'qty', list: 'fin.tools' })}</b></li>`).join('') || '<li class="muted">Нет данных</li>'}</ul>
    <button class="btn" data-add="tool">+ Инструмент</button>
`,
  }[state.stockTab];
  el.innerHTML = `<div class="subtabs" role="tablist">${subs.map(([k, t, c]) => `<button role="tab" data-stk="${k}" class="${state.stockTab === k ? 'on' : ''}">${esc(t)}${c}</button>`).join('')}</div>
    <div class="subbody">${body}</div>`;
  el.querySelectorAll('[data-stk]').forEach((b) => b.onclick = () => { state.stockTab = b.dataset.stk; try { localStorage.setItem('stroyka.stk', state.stockTab); } catch { /* */ } renderStock(); el.scrollTop = 0; if (mobile.matches) scrollTo({ top: 0 }); });
}

/** «Склад» → «Потребность»: осталось сделать → сколько поддонов → сколько есть → сколько заказать; нормы правятся тут же */
function needHtml() {
  const mats = store.extra.materials || [];
  const ms = (m, k, lbl) => ev(m[k] ? fmtN(m[k]) : '—', { b: 'V', s: 'Материалы', r: m.row, f: 'cell', c: m.cols[k], raw: m[k] || '', expect: m[k] || '', type: 'number', label: `${m.name}: ${lbl}` });
  const secs = SECTIONS.map((s) => [s, store.demand(s)]).filter(([, d]) => d.length);
  return `${secs.map(([s, d]) => `<h3>${esc(T.part)} ${esc(s)}</h3>${d.map((w) => `<div class="planbox"><div class="planh"><b>${esc(w.work)}</b><span class="muted">осталось ${fmtN(Math.round(w.left * 10) / 10)} из ${fmtN(Math.round(w.total))} ${esc(w.unit)}</span></div>
      <table class="voltab"><tbody>${w.mats.map((m) => `<tr><td>${esc(m.name)}</td><td>${m.need != null ? `нужно <b>${fmtN(Math.ceil(m.need))}</b> пал.` : '<span class="muted">нет нормы</span>'}</td><td class="muted">на складе ${fmtN(m.onSite)}</td><td>${m.need != null ? (Math.ceil(m.need) - m.onSite > 0 ? `<span class="err-t">заказать ${fmtN(Math.ceil(m.need) - m.onSite)}</span>` : '<span class="okc">хватает</span>') : ''}</td></tr>`).join('')}</tbody></table>
      ${w.mats.length > 1 ? '<p class="muted small-note">Несколько материалов на один вид работ — потребность указана, если делать всё этим материалом.</p>' : ''}</div>`).join('')}`).join('') || '<p class="muted">Нет видов работ с нормами материала.</p>'}
    <h3>Нормы: сколько в одном поддоне <span class="muted">· «Выполнение» → «Материалы»</span></h3>
    <div class="tablewrap"><table class="voltab"><thead><tr><th>Материал</th><th>Шт/под.</th><th>Длина, мм</th><th>Высота, мм</th><th>Толщина, мм</th><th>м³/под. (если без размеров)</th><th>= м²/под.</th><th>= м³/под.</th></tr></thead><tbody>
    ${mats.map((m) => `<tr><td>${esc(m.name)}<div class="muted">${esc(m.work)}</div></td><td>${ms(m, 'pcs', 'шт на поддоне')}</td><td>${ms(m, 'len', 'длина камня, мм')}</td><td>${ms(m, 'height', 'высота камня, мм')}</td><td>${ms(m, 'thick', 'толщина стены, мм')}</td><td>${ms(m, 'm3in', 'м³ на поддоне')}</td><td><b>${m.m2 ? fmtN(Math.round(m.m2 * 100) / 100) : '—'}</b></td><td><b>${m.m3 ? fmtN(Math.round(m.m3 * 1000) / 1000) : '—'}</b></td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small-note">Заполните шт на поддоне и размер камня (или м³ на поддоне из накладной) — таблица сама посчитает м² и м³, а приложение — потребность и остаток в м².</p>`;
}

// ---------- добавление строк в таблицы ----------
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  const k = b.dataset.add;
  const today = isoToday();
  const defs = {
    order: { book: 'G', sheet: 'Поручения', title: 'Поручение от руководителя', fixed: { date: today, status: 'В работе' }, fields: [['text', 'Что сделать', 'text', ''], ['who', 'Кому (бригада)', 'text', ''], ['section', `${T.part || 'Часть'} (можно пусто)`, 'text', state.tab === 'floor' ? state.section : ''], ['level', `${T.level} (можно пусто)`, 'text', state.tab === 'floor' ? (LAYOUT === 'stack' ? String(state.floor) : floorName(state.floor)) : ''], ['due', 'Срок', 'date', '']] },
    brigade: (store.extra.handbook || {}).cols && store.extra.handbook.cols.people > 0
      ? { book: 'V', sheet: 'Справочник', title: 'Новая бригада («Выполнение» → «Справочник»)', fields: [['name', 'Бригада (бригадир)', 'text', ''], ['people', 'Человек', 'number', ''], ['type', 'Тип: свои / наёмные / ИТР', 'text', 'свои'], ['section', `${T.part || 'Часть'} (пусто — все)`, 'text', ''], ['phone', 'Телефон / примечание', 'text', '']] }
      : { book: 'G', sheet: 'Бригады', title: 'Новая бригада', fields: [['name', 'Бригада (бригадир)', 'text', ''], ['people', 'Человек', 'number', ''], ['type', 'Тип: свои / наёмные', 'text', 'свои'], ['section', `${T.part || 'Часть'} (пусто — все)`, 'text', ''], ['works', 'Виды работ', 'text', '']] },
    remark: { book: 'G', sheet: 'Замечания', title: `Замечание: ${T.partL} ${state.section}, ${floorName(state.floor).toLowerCase()}`, fixed: { date: today, section: state.section, level: LAYOUT === 'stack' ? (state.floor === 0 ? 'Подвал' : state.floor === ROOF ? 'Кровля' : String(state.floor)) : floorName(state.floor), status: 'В работе' }, fields: [['text', 'Замечание', 'text', ''], ['who', 'Ответственный', 'text', ''], ['due', 'Срок', 'date', '']] },
    tool: { book: 'G', sheet: 'УЧЁТ ИНСТРУМЕНТА ', title: 'Новый инструмент', fields: [['name', 'Наименование', 'text', ''], ['qty', 'Количество', 'text', '']] },
    personal: { book: 'G', sheet: 'Личные расходы', title: 'Новый личный расход', fields: [['date', 'Дата', 'date', today], ['name', 'Наименование', 'text', ''], ['sum', 'Сумма, ₽', 'number', ''], ['who', 'Плательщик', 'text', ''], ['note', 'Примечание', 'text', '']] },
    'move-in': { book: 'U', sheet: 'Движение материалов', title: 'Материал приехал на склад', fields: [['date', 'Дата', 'date', today], ['material', 'Материал', 'text', 'СКЦ 190 мм'], ['pallets', 'Паллет', 'number', ''], ['doc', 'Документ (ТТН / сообщение)', 'text', ''], ['comment', 'Комментарий', 'text', '']], fixed: { type: 'Поступление', zone: 'Склад', status: 'Подтверждено' } },
    'move-feed': { book: 'U', sheet: 'Движение материалов', title: `Подача материала: ${T.levelL}`, fields: [['date', 'Дата', 'date', today], ['material', 'Материал', 'text', 'СКЦ 190 мм'], ['zone', 'Этаж и секция', 'text', `${state.floor || 1} этаж, ${T.partL} ${state.section}`], ['pallets', 'Паллет', 'number', ''], ['comment', 'Комментарий', 'text', '']], fixed: { type: 'Подача на этаж', status: 'Подтверждено' } },
  }[k];
  if (!defs) return;
  if (!store.canEditBook(defs.book)) { const bi = store.bookInfo(defs.book); toast(`Только просмотр: нет прав на запись в ${BOOK[defs.book]}. Владелец (${bi.owner || '—'}) должен дать «Редактор».`, true); return; }
  const res = await editDialog(defs.title, defs.fields.map(([, label, type, value]) => ({ label, type, value })), `Новая строка в таблице ${BOOK[defs.book]}, лист «${defs.sheet.trim()}».`);
  if (!res) return;
  const values = { ...(defs.fixed || {}) };
  defs.fields.forEach(([f], i) => { values[f] = res[i]; });
  store.addRow(defs.book, defs.sheet, values, defs.title + ': ' + defs.fields.map(([f]) => values[f]).filter(Boolean).slice(0, 3).join(', '));
});

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
  // разделы — только те, для которых в таблице объекта есть листы и данные
  const has = { contract: store.fin.contract.length, exp: true, adv: store.fin.advances.length, sup: true, inc: store.fin.income.length, pers: store.fin.personal.length };
  const views = [['contract', 'Договор'], ['exp', 'Расходы'], ['adv', 'Авансы'], ['sup', 'Поставки'], ['inc', 'Поступления'], ['pers', 'Личные']].filter(([k]) => has[k]);
  if (!views.some(([k]) => k === state.money)) state.money = views[0][0];
  const head = `<div class="subtabs" role="tablist">${views.map(([k, t]) => `<button role="tab" data-mv="${k}" class="${state.money === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
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
    const partsE = [...new Set(fin.expenses.map((e) => e.section).filter(Boolean))];
    const byPart = {}; for (const e of fin.expenses) if (e.section) byPart[e.section] = (byPart[e.section] || 0) + e.sum;
    const catsAll = [...new Set([...EXPENSE_CATS, ...fin.expenses.map((e) => e.cat)])];
    const list = fin.expenses
      .filter((e) => state.expPart === 'all' || e.section === state.expPart)
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
      ${partsE.length > 1 ? `<h3>По объектам</h3>${bars(Object.entries(byPart).sort((a, b) => b[1] - a[1]).map(([p, v]) => [p, v, 'var(--green)', total ? Math.round((v / total) * 100) + '%' : '']), Math.max(...Object.values(byPart)))}` : ''}
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
            <label>Категория<select name="cat">${catsAll.filter((c) => c !== 'Чеки').map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
          </div>
          ${partsE.length || SECTIONS.length > 1 ? `<label>${esc(T.part)}<select name="section">${[...new Set([...partsE, ...SECTIONS])].map((p) => `<option ${p === (state.expPart !== 'all' ? state.expPart : '') ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>` : ''}
          <label>Контрагент<input name="who" list="whoList" required></label>
          <datalist id="whoList">${Object.keys(who).map((w) => `<option value="${esc(w)}">`).join('')}</datalist>
          <label>Основание<input name="basis" placeholder="Оплата по счету № … от …"></label>
          <label>Примечание<input name="note" placeholder="Арматура"></label>
          <label>Сумма, ₽<input name="sum" type="number" step="0.01" min="0" required></label>
          <div class="form-actions"><button class="btn" type="submit">${state.expEdit ? 'Сохранить' : 'Записать'} ${store.connected ? 'в таблицу' : 'на устройство'}</button>${state.expEdit ? '<button class="btn ghost" type="button" id="expCancel">Отмена</button>' : ''}</div>
        </form>
      </details>

      <h3>Операции <span class="muted">· ${list.length} на ${rub(listSum)}</span></h3>
      <div class="filters">
        <input type="search" id="expQ" placeholder="Поиск: контрагент, примечание…" value="${esc(state.expQuery)}">
        ${partsE.length > 1 ? `<div class="chips">${['all', ...partsE].map((p) => `<button class="chip ${state.expPart === p ? 'on' : ''}" data-part="${esc(p)}">${p === 'all' ? 'Все объекты' : esc(p)}</button>`).join('')}</div>` : ''}
        <div class="chips">${['all', ...catsAll.filter((c) => fin.expenses.some((e) => e.cat === c))].map((c) => `<button class="chip ${state.expCat === c ? 'on' : ''}" data-cat="${esc(c)}">${c === 'all' ? 'Все' : esc(c)}</button>`).join('')}</div>
      </div>
      <ul class="entries ops">${list.slice(0, state.expLimit).map((e) => `<li>
        <span class="cat-dot" style="--c:${CAT_COLORS[e.cat] || '#888'}"></span>
        <div><b>${esc(e.note || e.basis || e.cat)}</b><div class="muted">${e.date ? (e.approx ? '≈ ' : '') + shortDate(e.date) + ' · ' : ''}${esc(e.who || '')}${partsE.length > 1 && e.section && state.expPart === 'all' ? ' · ' + esc(e.section) : ''}</div></div>
        <b class="num">${rub(e.sum)}</b>${e.ro ? '' : `<button class="x ed" data-edx="${esc(e.id)}" aria-label="Изменить">✎</button>`}${e.local || e.app ? `<button class="x" data-delx="${esc(e.id)}" aria-label="Удалить">×</button>` : ''}</li>`).join('') || '<li class="muted">Ничего не найдено</li>'}</ul>
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
      <ul class="entries ops">${adv.map((a) => { const sp = (f, raw, type, lbl, extra = {}) => ({ b: 'G', s: 'Для РП', r: a.row, f, raw, expect: raw, type, label: `Аванс №${a.n}: ${lbl}`, prop: f, list: 'fin.advances', ...extra }); return `<li><span class="cat-dot" style="--c:${stColor(a.status)}"></span><div><b>${esc(a.desc || a.type)}</b><div class="muted">№${esc(a.n)} · ${a.date ? ev(shortDate(a.date), sp('date', a.date, 'date', 'дата платежа')) : ''} · ${ev(esc(a.status), sp('status', a.status, 'text', 'статус', { options: ['Оплачен', 'Утвержден', 'Согласование в 1С', 'Отклонён'] }))}</div></div><b class="num">${ev(rub(a.sum), sp('sum', a.sum, 'number', 'сумма, ₽'))}</b></li>`; }).join('')}</ul>`;
  }

  if (state.money === 'sup') {
    const items = [];
    for (const j of store.allJournal().filter((j) => j.type === 'Материал')) items.push({ date: j.date, approx: j.approx, name: j.name, qty: j.qty, unit: j.unit, who: j.section === 'Общее' ? 'Общее' : T.part + ' ' + j.section, src: j.src || 'Журнал' });
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
      <ul class="entries ops">${items.map((x) => `<li class="e-mat"><span class="e-ico">🚚</span><div><b>${esc(x.name)}</b><div class="muted">${x.date ? (x.approx ? '≈ ' : '') + shortDate(x.date) : ''} · ${esc(x.who)} · ${x.src}</div></div><b class="num">${fmtN(x.qty)} ${esc(x.unit)}</b></li>`).join('')}</ul>
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
      <h3>Счета заказчику</h3>
      <ul class="entries ops">${inc.map((x) => { const sp = (f, raw, type, lbl, extra = {}) => ({ b: 'G', s: 'Оплаты Глоракс', r: x.row, f, raw, expect: raw, type, label: `Счёт Глоракс «${x.note || ''}»: ${lbl}`, prop: f, list: 'fin.income', ...extra }); return `<li><span class="cat-dot" style="--c:${/^оплачено/i.test(x.status) ? 'var(--green)' : 'var(--amber)'}"></span><div><b>${esc(x.note || 'Счёт')}</b><div class="muted">${x.date ? shortDate(x.date) + ' · ' : ''}${ev(esc(x.status), sp('status', x.status, 'text', 'статус', { options: ['Оплачено', 'Не оплачено'] }))}</div></div><b class="num">${ev(rub(x.sum), sp('sum', x.sum, 'number', 'сумма, ₽'))}</b></li>`; }).join('') || '<li class="muted">Нет счетов</li>'}</ul>`;
  }

  if (state.money === 'contract') {
    const cv = (k) => store.contractValue(k);
    const D = cv('D'), E = cv('E'), B = cv('B');
    const pct = D && E ? (E / D) * 100 : 0;
    const phys = SECTIONS.reduce((a, x) => a + (store.sectionValue(x) || 0), 0) / SECTIONS.length;
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
      <div class="hbar"><span>Оплачено по договору</span><div class="bar"><i style="width:${pct}%"></i></div><b>${Math.round(pct)}%</b></div>
      <div class="hbar"><span>Выполнено работ</span><div class="bar"><i style="width:${phys}%;background:var(--blue)"></i></div><b>${Math.round(phys)}%</b></div>
      <div class="hbar"><span>Потрачено от выполненного</span><div class="bar"><i style="width:${E ? Math.min(100, spent / E * 100) : 0}%;background:var(--amber)"></i></div><b>${E ? Math.round(spent / E * 100) : 0}%</b></div>
      <h3>Договор: расчёт оплаты</h3>
      <ul class="totals">${fin.contract.map((c) => `<li><span>${esc(c.label.replace(/^[A-ZА-ЯЁ]\s*-\s*/, ''))}</span><b class="num">${c.formula ? `${rub(c.value)}` : ev(rub(c.value), { b: 'G', s: 'Формула оплаты Глоракс ', r: c.row, f: 'value', raw: c.value, expect: c.value, type: 'number', label: c.label.trim(), prop: 'value', list: 'fin.contract' })}</b></li>`).join('')}</ul>

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
      <ul class="entries ops">${list.map((x) => `<li><span class="cat-dot" style="--c:var(--blue)"></span><div><b>${ev(esc(x.name), { b: 'G', s: 'Личные расходы', r: x.row, f: 'name', raw: x.name, expect: x.name, type: 'text', label: 'Личный расход: наименование', prop: 'name', list: 'fin.personal' })}</b><div class="muted">${x.date ? (x.approx ? '≈ ' : '') + shortDate(x.date) + ' · ' : ''}${esc(x.who)}${x.note ? ' · ' + esc(x.note) : ''}</div></div><b class="num">${ev(rub(x.sum), { b: 'G', s: 'Личные расходы', r: x.row, f: 'sum', raw: x.sum, expect: x.sum, type: 'number', label: `${x.name}: сумма, ₽`, prop: 'sum', list: 'fin.personal' })}</b></li>`).join('') || '<li class="muted">Нет записей</li>'}</ul>
      <button class="btn" data-add="personal">+ Личный расход</button>`;
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
  el.querySelectorAll('[data-delx]').forEach((b) => b.onclick = async () => { const x = store.fin.expenses.find((e) => e.id === b.dataset.delx); if (await ask([`Удалить расход: ${x ? `${x.who}, ${x.note || ''} — ${rub(x.sum)}` : ''}`], 'Строка будет удалена из листа «Счета».')) store.deleteExpense(b.dataset.delx); });
  el.querySelectorAll('[data-edx]').forEach((b) => b.onclick = () => { state.expEdit = b.dataset.edx; renderMoney(); $('#expForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  const xc = $('#expCancel', el); if (xc) xc.onclick = () => { state.expEdit = null; renderMoney(); };
  const sa = $('#supAdd', el); if (sa) sa.onclick = () => { setTab('calendar'); const t = document.querySelector('#addType [data-t="Материал"]'); if (t) t.click(); document.querySelector('#addForm')?.scrollIntoView({ behavior: 'smooth' }); };
  const f = $('#expForm', el);
  const ed = state.expEdit && store.fin.expenses.find((x) => x.id === state.expEdit);
  el.querySelectorAll('[data-part]').forEach((b) => b.onclick = () => { state.expPart = b.dataset.part; state.expLimit = 40; renderMoney(); });
  if (f && ed) { if (f.section && ed.section) f.section.value = ed.section; f.date.value = ed.date || isoToday(); f.cat.value = ed.cat; f.who.value = ed.who || ''; f.basis.value = ed.basis || ''; f.note.value = ed.note || ''; f.sum.value = ed.sum; }
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const x = { date: fd.get('date'), cat: fd.get('cat'), who: fd.get('who'), basis: fd.get('basis'), note: fd.get('note'), sum: fd.get('sum'), ...(fd.get('section') ? { section: fd.get('section') } : {}) };
    if (!(await ask([`${ed ? 'Исправить' : 'Добавить'} расход: ${x.date}, ${x.cat}, ${x.who}${x.note ? ', ' + x.note : ''} — ${rub(+x.sum || 0)}${ed ? ` (было ${rub(ed.sum)})` : ''}`], store.connected ? `Лист «${(ed && ed.sheet) || x.section || store.expSheet}»${ed && ed.row ? ', строка ' + ed.row : ''} таблицы ${BOOK.G}.` : ''))) return;
    if (ed) store.updateExpense({ ...ed, ...x }); else store.addExpense(x);
    state.expEdit = null;
    renderMoney();
  };
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- 3D-тур: камера и стройка по прокрутке ----------
function tourSteps() {
  const sv = (x) => Math.round(store.sectionValue(x) || 0);
  const open = (s) => store.remarks.filter((r) => String(r.section) === s && store.isOpenRemark(r)).length;
  const w = (s, k) => Math.round(store.sectionValue(s, k) || 0);
  const ppl = (s) => { const d = store.journal.filter((j) => j.type === 'Люди' && j.section === s).map((j) => j.date).sort().pop(); return d ? `${store.peopleOn(d, s)} чел. (${shortDate(d)})` : 'нет данных'; };
  const mats = store.journal.filter((j) => j.type === 'Материал').length + store.fin.nominated.length;
  const cats = store.byCategory();
  const total = store.fin.partial && store.fin.summary ? store.fin.summary.total : store.expenseTotal();
  const n2 = (i) => String(i).padStart(2, '0');
  return [
    ['01', `${T.object} · ${SECTIONS.length === 1 ? T.part + ' ' + SECTIONS[0] : T.parts + ': ' + SECTIONS.length} · ${LAYOUT === 'stack' ? TOP + ' этажей' : T.levels + ': ' + FLOORS.length}`, 'Прокручивайте вниз: объект построится до текущего состояния.'],
    ['02', LAYOUT === 'stack' ? 'Каркас поднимается' : 'Работы по уровням', `${T.levels} заливаются зелёным по факту выполнения. Сейчас готово: ${SECTIONS.map((x) => `${T.partL} ${x} — ${sv(x)}%`).join(', ')}.`],
    ...SECTIONS.map((x, i) => [n2(i + 3), `${T.part} ${x} · ${sv(x)}%`, `${(PROFILE.type === 'mkd' ? ['Наружные стены', 'Перегородки'] : WORKS.slice(0, 3)).map((k) => `${k} ${w(x, k)}%`).join(', ')}. На объекте: ${ppl(x)}. Открытых поручений: ${open(x)}.`]),
    [n2(SECTIONS.length + 3), 'Материал и деньги', `Поставок в учёте: ${mats}. Авансы за номинированный материал: ${rubShort(store.expenseTotal(store.fin.advances))}. Расходы: ${rubShort(total)}, из них работы ${rubShort(cats['Работы'] || 0)}, материалы ${rubShort(cats['Материалы'] || 0)}.`],
    [n2(SECTIONS.length + 4), 'Сверху', 'Двор, парковка и кран. Нажмите «Закрыть тур», чтобы вернуться к редактированию.'],
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
updateViewLabel();
addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('touring')) closeTour(); });

// ---------- мобильный вид: 3D закреплено сверху, прокрутка страницы вращает модель ----------
const mobile = matchMedia('(max-width: 900px)');
let lastY = scrollY;
addEventListener('scroll', () => {
  const dy = scrollY - lastY; lastY = scrollY;
  if (mobile.matches && !document.body.classList.contains('touring')) scene.orbitBy(dy * 0.002);
}, { passive: true });
$('#btnLegend').onclick = () => document.body.classList.toggle('legend-on');
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
    el.innerHTML = '<span>Таблица не подключена — показан пример данных. Подключите Google-таблицу объекта, чтобы данные шли онлайн и правки записывались обратно (один раз, около 3 минут).</span><button class="btn small" id="bannerBtn">Подключить</button>';
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
  if (k === 'journal') rows = [['Дата', T.part, 'Тип', 'Наименование', 'Количество', 'Ед.', 'Примечание'], ...store.journal.map((j) => [j.date, j.section, j.type, j.name, num(j.qty), j.unit, j.note])];
  if (k === 'progress') rows = [[T.part, T.level, 'Вид работ', 'Процент', 'Обновлено'], ...[...store.progress.values()].map((p) => [p.section, floorName(p.floor), p.work, p.value, p.updated || ''])];
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

// ---------- подтверждение записи ----------
function ask(lines, where) {
  let skipUntil = 0; try { skipUntil = +localStorage.getItem('stroyka.noask') || 0; } catch { /* */ }
  if (Date.now() < skipUntil) return Promise.resolve(true);
  const dlg = $('#confirmDlg');
  $('#cfTitle').textContent = store.connected ? 'Записать в Google-таблицу?' : 'Сохранить на этом устройстве?';
  $('#cfList').innerHTML = lines.map((l) => `<li>${esc(l)}</li>`).join('');
  $('#cfWhere').textContent = where || (store.connected ? `Изменение сразу уйдёт в таблицу ${BOOK.G}. После записи таблица вернёт строку, и приложение её сверит.` : 'Таблица не подключена — изменение останется на устройстве.');
  $('#cfSkip').checked = false;
  return new Promise((resolve) => {
    dlg.returnValue = '';
    dlg.onclose = () => {
      const yes = dlg.returnValue === 'yes';
      if (yes && $('#cfSkip').checked) { try { localStorage.setItem('stroyka.noask', String(Date.now() + 10 * 60000)); } catch { /* */ } }
      resolve(yes);
    };
    dlg.showModal();
  });
}

// ---------- журнал синхронизации ----------
function renderSync() {
  const st = { ok: '✓', queued: '…', error: '✖', mismatch: '⚠' };
  $('#syncState').textContent = store.connected
    ? `Приложение проверяет таблицы каждые 10 секунд. ${store.queue.length ? `В очереди на запись: ${store.queue.length}.` : 'Очередь пуста — всё записано.'}${store.loadedAt ? ' Данные загружены в ' + store.loadedAt.toLocaleTimeString('ru-RU') + '.' : ''}`
    : 'Таблица не подключена.';
  $('#syncList').innerHTML = store.log.map((x) => `<li class="sl-${x.status} sl-${x.dir}">
    <span class="sl-ico">${x.dir === 'in' ? '⬇' : '⬆'}${st[x.status] || ''}</span>
    <div><b>${esc(x.text)}</b><div class="muted">${new Date(x.at).toLocaleString('ru-RU')}${x.where ? ' · ' + esc(x.where) : ''}${x.verified === true ? ' · проверено в таблице' : x.verified === false ? ' · ТАБЛИЦА ВЕРНУЛА ДРУГОЕ ЗНАЧЕНИЕ' : ''}</div></div></li>`).join('') || '<li class="muted">Пока ничего не записывалось</li>';
}
$('#status').style.cursor = 'pointer';
$('#status').title = 'Журнал синхронизации';
$('#status').onclick = () => { renderSync(); $('#syncDlg').showModal(); };
$('#syncCheck').onclick = async () => { await store.load(); renderSync(); toast('Таблицы перечитаны'); };

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
  if (what && what.type === 'saved') { renderStatus(); toast(`✓ Записано в таблицу${what.where ? ': ' + what.where : ''}${what.verified ? ' · проверено' : what.verified === false ? ' · ⚠ таблица вернула другое значение' : ''}`, what.verified === false); }
  if (what && what.type === 'incoming') toast('⬇ Обновлено из таблиц: ' + what.text);
  if (what === 'log' && $('#syncDlg').open) renderSync();
  if (what === 'saved-local') toast('Сохранено на устройстве · таблица не подключена');
  if (what && what.type === 'rejected') toast('Таблица не приняла изменение: ' + what.message, true);
  if (what === 'data' && store.structureChanged) { location.reload(); return; }   // в таблицах другие секции/этажность — перестроить 3D
  if (what === 'data') { renderMetricButtons(); setObjName(); }
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

// ---------- объекты: переключение и новый объект из шаблона ----------
const KIND_TPL = {
  mkd: { parts: 'Секции', partsPh: '4, 5', levels: 'Этажей (число)', levelsPh: '16', works: ['Монолит перекрытий, м³', 'Кладка наружных стен, м³', 'Перегородки, м²', 'Фасад: утепление и облицовка, м²', 'Окна, шт', 'Электрика, т.', 'Водоснабжение и канализация, т.', 'Отопление и вентиляция, т.', 'Слаботочные системы, т.', 'Пожарная сигнализация, т.', 'Отделка МОП, м²'] },
  flat: { parts: 'Квартиры (номера)', partsPh: '12, 15, 27', levels: 'Помещения', levelsPh: 'Кухня, Санузел, Комната 1, Коридор', works: ['Перегородки, м²', 'Электрика, т.', 'Водоснабжение и канализация, т.', 'Слаботочка, т.', 'Штукатурка стен, м²', 'Стяжка пола, м²', 'Плитка, м²', 'Чистовая отделка, м²', 'Двери, шт'] },
  office: { parts: 'Помещения / этажи', partsPh: '1, 2', levels: 'Зоны', levelsPh: 'Open space, Переговорная, Санузел, Кухня', works: ['Перегородки ГКЛ, м²', 'Электрика, т.', 'Слаботочка и СКС, т.', 'Вентиляция и кондиционирование, т.', 'Пожарная сигнализация, т.', 'Потолки, м²', 'Покраска, м²', 'Полы, м²', 'Двери, шт'] },
  industrial: { parts: 'Цеха / корпуса', partsPh: '1', levels: 'Пролёты / зоны', levelsPh: 'Оси 1–3, Оси 3–5, Оси 5–7, АБК', works: ['Фундаменты, м³', 'Монтаж каркаса, т', 'Кровля, м²', 'Фасад: сэндвич-панели, м²', 'Ворота и окна, шт', 'Электрика, т.', 'Водоснабжение и канализация, т.', 'Отопление и вентиляция, т.', 'Пожарная безопасность, т.', 'Полы, м²', 'Благоустройство, м²'] },
};
let noKind = 'mkd';
function setKind(k) {
  noKind = k;
  const t = KIND_TPL[k];
  for (const b of $('#noKind').children) b.classList.toggle('on', b.dataset.k === k);
  $('#noPartsL').textContent = t.parts; $('#noParts').placeholder = t.partsPh;
  $('#noLevelsL').textContent = t.levels; $('#noLevels').placeholder = t.levelsPh;
  $('#noWorks').value = t.works.join('\n');
}
$('#noKind').onclick = (e) => { const b = e.target.closest('button'); if (b) setKind(b.dataset.k); };
function renderObjects() {
  const list = store.objects.length ? store.objects : [{ id: '', name: 'Выполнение', note: 'по умолчанию' }];
  const cur = store.obj || (list[0] && list[0].id);
  $('#objList').innerHTML = list.map((o) => `<li class="${o.id === cur ? 'on' : ''}">
    <button type="button" class="obj-item" data-obj="${esc(o.id)}"><b>${esc(o.name)}</b><span class="muted">${esc([o.type, o.note].filter(Boolean).join(' · '))}</span></button>
    <a class="btn ghost small" href="https://docs.google.com/spreadsheets/d/${esc(o.id)}/edit" target="_blank" rel="noopener" title="Открыть таблицу">↗</a>
    ${o === list[0] || store.finLocked ? '' : `<button type="button" class="btn ghost small" data-unlink=""${esc(o.id)}" title="Убрать из списка (таблица останется на Диске)">✕</button>`}</li>`).join('');
  $('#objList').querySelectorAll('[data-unlink]').forEach((b) => b.onclick = async () => {
    const o = list.find((x) => x.id === b.dataset.unlink);
    if (!(await ask([`Убрать «${o.name}» из списка объектов?`], 'Сама таблица останется на Google Диске — её можно подключить снова по ссылке.'))) return;
    try { await store.post({ action: 'removeObject', id: o.id }); if (store.obj === o.id) store.setObject(''); location.reload(); } catch (e) { toast('Не удалось: ' + e.message, true); }
  });
  const tpl = store.extra.template;
  $('#tplCopy').href = tpl ? `https://docs.google.com/spreadsheets/d/${tpl}/copy` : '#';
  const me = (store.extra.sources || []).find((x) => x.me);
  if (me) $('#noMe').textContent = me.me;
  $('#objList').querySelectorAll('[data-obj]').forEach((b) => b.onclick = () => {
    const id = b.dataset.obj === (list[0] && list[0].id) ? '' : b.dataset.obj;
    if (id === (store.obj || '')) { $('#objDlg').close(); return; }
    store.setObject(id); location.reload();
  });
}
function openObjects(newOne) {
  if (!store.connected) { toast('Сначала подключите таблицу (⚙ вверху справа)', true); return; }
  renderObjects(); setKind(noKind);
  $('#objNew').open = false;
  $('#objDlg').showModal();
  if (newOne) setTimeout(() => { $('#objAdd').scrollIntoView({ block: 'start' }); $('#noQuickName').focus(); }, 60);
}
$('#btnObj').onclick = () => openObjects(false);
const splitList = (v) => String(v || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
$('#noCreate').onclick = async () => {
  const name = $('#noName').value.trim() || ({ mkd: 'Новый МКД', flat: 'Ремонт квартир', office: 'Офис', industrial: 'Цех' })[noKind];
  const parts = splitList($('#noParts').value || $('#noParts').placeholder);
  const lv = $('#noLevels').value.trim() || $('#noLevels').placeholder;
  const levels = noKind === 'mkd' ? Number(lv) || 16 : splitList(lv);
  const works = $('#noWorks').value.split('\n').map((x) => x.trim()).filter(Boolean);
  const t = KIND_TPL[noKind];
  const yes = await ask([`Новая таблица «Стройка · ${name}»`, `${t.parts}: ${parts.join(', ')}`, `${t.levels}: ${Array.isArray(levels) ? levels.join(', ') : levels}`, `Виды работ: ${works.length}`], 'Таблица появится на вашем Google Диске и в листе «Объекты».');
  if (!yes) return;
  const btn = $('#noCreate'); btn.disabled = true; btn.textContent = 'Создаю таблицу…';
  try {
    const res = await store.newObject({ name, kind: noKind, parts, levels, works });
    toast('✓ Таблица создана — открываю объект');
    store.setObject(res.id);
    setTimeout(() => location.reload(), 600);
  } catch (e) {
    toast('Не удалось создать: ' + e.message, true);
    btn.disabled = false; btn.textContent = 'Создать таблицу и открыть объект';
  }
};

/** Открыть объект после создания/подключения */
function switchTo(id, msg) { toast(msg); store.setObject(id); setTimeout(() => location.reload(), 700); }
async function busy(btn, label, fn) {
  const t = btn.textContent; btn.disabled = true; btn.textContent = label;
  try { await fn(); } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = t; }
}
$('#noCopy').onclick = () => busy($('#noCopy'), 'Создаю…', async () => {
  const name = $('#noQuickName').value.trim() || 'Новый объект';
  const res = await store.post({ action: 'copyTemplate', name });
  switchTo(res.id, `✓ Таблица «Стройка · ${name}» создана — открываю`);
});
$('#noAdd').onclick = () => busy($('#noAdd'), 'Проверяю…', async () => {
  const url = $('#noUrl').value.trim();
  if (!/docs\.google\.com\/spreadsheets\/d\/|^[\w-]{25,}$/.test(url)) throw new Error('Вставьте ссылку на Google-таблицу');
  const res = await store.post({ action: 'addObject', url });
  switchTo(res.id, res.already ? 'Эта таблица уже подключена — открываю' : `✓ Подключено${res.added && res.added.length ? ' · добавлены листы: ' + res.added.join(', ') : ''}`);
});

// ---------- вид для рабочих / вход руководителя ----------
/** Без входа — без финансов: вкладка «Финансы» становится замком, управление объектами скрыто */
function applyRole() {
  const locked = store.finLocked;
  document.body.classList.toggle('worker', locked);
  const tab = document.querySelector('.tabs [data-tab="money"]');
  if (tab) { tab.querySelector('i').textContent = locked ? '🔒' : '₽'; tab.title = locked ? 'Финансы — вход руководителя' : ''; }
  if (locked && state.tab === 'money') setTab('summary');
  $('#finState').textContent = !store.connected ? 'Таблица не подключена.' : locked ? 'Сейчас — вид для рабочих: финансов нет. Войдите, чтобы открыть финансы и управление объектами.' : 'Вы вошли как руководитель на этом устройстве.';
  $('#finActs').innerHTML = !store.connected ? '' : locked ? '<button class="btn" type="button" id="finIn">🔒 Войти по паролю</button>'
    : '<button class="btn ghost" type="button" id="finPass">Сменить пароль</button><button class="btn ghost" type="button" id="finOut">Выйти — вид для рабочих</button>';
  const i = $('#finIn'); if (i) i.onclick = () => { $('#settings').close(); openLogin(); };
  const o = $('#finOut'); if (o) o.onclick = () => { store.logout(); $('#settings').close(); toast('Вид для рабочих: финансы скрыты'); };
  const pw = $('#finPass'); if (pw) pw.onclick = async () => {
    const r = await editDialog('Новый пароль руководителя', [{ label: 'Пароль (не короче 4 символов)', type: 'text', value: '' }], 'Вход на других устройствах будет сброшен.');
    if (!r) return;
    try { await store.changeFinPassword(r[0]); toast('✓ Пароль изменён'); } catch (e) { toast(e.message, true); }
  };
}
function openLogin() {
  $('#loginPass').value = ''; $('#loginErr').hidden = true;
  $('#loginDlg').showModal(); setTimeout(() => $('#loginPass').focus(), 50);
}
$('#loginForm').onsubmit = async (e) => {
  if (e.submitter && e.submitter.value === 'no') return;
  e.preventDefault();
  const b = $('#loginGo'); b.disabled = true;
  try { await store.login($('#loginPass').value); $('#loginDlg').close(); toast('✓ Вы вошли как руководитель'); setTab('money'); }
  catch (err) { $('#loginErr').textContent = err.message; $('#loginErr').hidden = false; }
  finally { b.disabled = false; }
};
// нажатие на «🔒 Финансы» без входа — окно пароля
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab="money"]');
  if (b && store.finLocked) { e.stopImmediatePropagation(); openLogin(); }
}, true);
store.on((w) => { if (w === 'data') applyRole(); });
applyRole();

// ---------- быстрый ввод: «＋» и объём за неделю одной формой ----------
const thisWeek = () => thisMonday();
/** Объём за неделю по всем видам работ этажа — одной формой, запись пачкой */
async function openWeekForm(sec, fl) {
  const wk = thisWeek();
  const items = store.extra.volumes.filter((v) => String(v.section) === String(sec) && v.floor === fl && v.weekCols && v.weekCols[wk]);
  if (!items.length) { toast('Для этого ' + T.levelGen + ' в «Выполнении» нет колонки текущей недели', true); return; }
  if (!store.canEditBook('V')) { toast('Только просмотр: нет прав на запись в «Выполнение»', true); return; }
  const res = await editDialog(`Объём за неделю с ${shortDate(wk)} · ${T.part} ${sec}, ${floorName(fl).toLowerCase()}`,
    items.map((it) => ({ label: `${it.work}${it.contractor ? ' · ' + it.contractor : ''} (всего ${fmtN(it.total)}, сделано ${fmtN(it.done)})`, type: 'number', value: (it.weekly || {})[wk] || '' })),
    'Пустое поле — без изменений. Запишется в «Выполнение» в колонку текущей недели; «Выполнено» таблица пересчитает сама.');
  if (!res) return;
  const changes = items.map((it, i) => ({ it, v: String(res[i]).trim(), old: (it.weekly || {})[wk] || 0 })).filter((x) => x.v !== '' && Number(x.v.replace(',', '.')) !== Number(x.old));
  if (!changes.length) { toast('Изменений нет'); return; }
  if (!(await ask(changes.map((x) => `${x.it.work}: ${fmtN(x.old)} → ${x.v}`), `«Выполнение», лист «${changes[0].it.sheet}», неделя с ${shortDate(wk)}.`))) return;
  for (const x of changes) store.setCell({ b: 'V', s: x.it.sheet, r: x.it.row, f: 'week', c: x.it.weekCols[wk], expect: x.old || '', label: `${x.it.work}, ${floorName(fl).toLowerCase()}, с. ${sec}: за неделю с ${shortDate(wk)}`, prop: '', list: 'extra.volumes' }, x.v);
  toast(`Отправлено строк: ${changes.length}`);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-week]'); if (!b) return;
  const [sec, fl] = b.dataset.week.split('|'); openWeekForm(sec, +fl);
});
/** «＋» — меню частых записей */
function fabItems() {
  const boss = !store.finLocked;
  return [
    ['people', '👷', 'Люди вышли сегодня'],
    ['week', '📏', `Объём за неделю · ${T.part} ${state.section}, ${floorName(state.floor).toLowerCase()}`],
    ['move-in', '🚚', 'Материал приехал'],
    ['move-feed', '⬆', `Подача материала ${LAYOUT === 'stack' ? 'на этаж' : 'в ' + T.levelAcc}`],
    ...(boss ? [['order', '📌', 'Поручение рабочим'], ['brigade', '🧱', 'Бригада'], ['expense', '₽', 'Расход']] : []),
  ];
}
const fabMenu = $('#fabMenu');
$('#fab').onclick = (e) => {
  e.stopPropagation();
  if (!fabMenu.hidden) { fabMenu.hidden = true; return; }
  fabMenu.innerHTML = `<div class="fab-h">Добавить</div>` + fabItems().map(([k, i, t]) => `<button type="button" role="menuitem" data-fab="${k}"><i>${i}</i>${esc(t)}</button>`).join('');
  fabMenu.hidden = false;
};
document.addEventListener('click', (e) => { if (!fabMenu.hidden && !fabMenu.contains(e.target) && e.target !== $('#fab')) fabMenu.hidden = true; });
fabMenu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fab]'); if (!b) return;
  fabMenu.hidden = true;
  const k = b.dataset.fab;
  if (k === 'people') { setTab('calendar'); state.day = isoToday(); renderCalendar(); const t = document.querySelector('#addType [data-t="Люди"]'); if (t) t.click(); document.querySelector('#addForm')?.scrollIntoView({ behavior: 'smooth' }); return; }
  if (k === 'week') { openWeekForm(state.section, state.floor); return; }
  if (k === 'expense') { state.money = 'exp'; setTab('money'); setTimeout(() => { const d = document.querySelector('#tab-money .add-exp'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth' }); } }, 50); return; }
  const t = document.createElement('button'); t.dataset.add = k; t.hidden = true; document.body.appendChild(t); t.click(); t.remove();
});
