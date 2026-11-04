// Модель данных и синхронизация с Google Sheets через Apps Script (см. apps-script/Code.gs).
import { SEED_DOCS_ROWS, SEED_REMARKS, SEED_JOURNAL } from './seed.js';
import { SEED_FIN } from './seed-fin.js';
import { API_URL, API_TOKEN } from './config.js';

// Структура проекта приходит из таблиц: каждый лист-часть («Секция 4», «Квартира 12», «Цех 2»…) в «Выполнении»
// и упорядоченный список уровней в его столбце B (этажи, помещения, пролёты, зоны). Значения «живые» (export let).
//   LAYOUT 'stack' — уровни-этажи друг над другом (МКД, корпус);
//          'plan'  — помещения рядом на плане (квартира, офис, ремонт);
//          'hall'  — пролёты/зоны вдоль длинного здания (цех, склад, ангар).
export const ROOF_KEY = 999;         // так кровлю передаёт таблица
export let SECTIONS = ['4', '5'];
export let TOP = 16;                 // stack: верхний этаж; plan/hall: число уровней
export let ROOF = 17;                // stack: ключ кровли = TOP + 1; иначе −1 (кровли нет)
export let FLOORS = [];              // номера уровней в приложении
export let LAYOUT = 'stack';
export let PROFILE = { type: 'mkd', name: '', part: 'Секция', level: 'Этаж' };
export let T = {};                   // слова интерфейса: «Секция»/«Квартира», «этаж»/«помещение»… в нужных падежах
export const MKD_WORKS = ['Наружные стены', 'Перегородки', 'Инженерка', 'Кровля'];
export let WORKS = MKD_WORKS.slice();
export const ALL_WORKS = MKD_WORKS;
let LEVELS = [];                     // plan/hall: [{ key, label }], индекс = номер уровня
let LEVEL_IDX = new Map();
let PART_LEVELS = {};

// Склонения известных слов: [именительный, родительный, винительный, мн. число, сокращение]; незнакомое — как есть
const WORDS = {
  'секция': ['Секция', 'секции', 'секцию', 'Секции', 'с.'], 'секции': ['Секция', 'секции', 'секцию', 'Секции', 'с.'],
  'корпус': ['Корпус', 'корпуса', 'корпус', 'Корпуса', 'корп.'], 'здание': ['Здание', 'здания', 'здание', 'Здания', 'зд.'],
  'блок': ['Блок', 'блока', 'блок', 'Блоки', 'бл.'], 'подъезд': ['Подъезд', 'подъезда', 'подъезд', 'Подъезды', 'п.'],
  'квартира': ['Квартира', 'квартиры', 'квартиру', 'Квартиры', 'кв.'], 'кв.': ['Квартира', 'квартиры', 'квартиру', 'Квартиры', 'кв.'], 'кв': ['Квартира', 'квартиры', 'квартиру', 'Квартиры', 'кв.'],
  'помещение': ['Помещение', 'помещения', 'помещение', 'Помещения', 'пом.'], 'офис': ['Офис', 'офиса', 'офис', 'Офисы', 'оф.'],
  'цех': ['Цех', 'цеха', 'цех', 'Цеха', 'цех'], 'склад': ['Склад', 'склада', 'склад', 'Склады', 'скл.'], 'ангар': ['Ангар', 'ангара', 'ангар', 'Ангары', 'анг.'],
  'пролёт': ['Пролёт', 'пролёта', 'пролёт', 'Пролёты', 'пр.'], 'пролет': ['Пролёт', 'пролёта', 'пролёт', 'Пролёты', 'пр.'],
  'участок': ['Участок', 'участка', 'участок', 'Участки', 'уч.'], 'объект': ['Объект', 'объекта', 'объект', 'Объекты', 'об.'],
  'очередь': ['Очередь', 'очереди', 'очередь', 'Очереди', 'оч.'], 'этаж': ['Этаж', 'этажа', 'этаж', 'Этажи', 'эт.'],
  'зона': ['Зона', 'зоны', 'зону', 'Зоны', 'зона'], 'комната': ['Комната', 'комнаты', 'комнату', 'Комнаты', 'комн.'],
  'оси': ['Оси', 'осей', 'оси', 'Оси', 'оси'], 'уровень': ['Уровень', 'уровня', 'уровень', 'Уровни', 'ур.'],
};
const DAT_PL = { 'Этажи': 'этажам', 'Помещения': 'помещениям', 'Пролёты': 'пролётам', 'Зоны': 'зонам', 'Комнаты': 'комнатам', 'Оси': 'осям', 'Уровни': 'уровням' };
function word(w) {
  const s = String(w || '').trim();
  const x = WORDS[s.toLowerCase()] || [s, s.toLowerCase(), s.toLowerCase(), s, s.toLowerCase().slice(0, 4) + '.'];
  return { one: x[0], gen: x[1], acc: x[2], pl: x[3], short: x[4] };
}
function makeTerms() {
  const p = word(PROFILE.part || 'Секция'), l = word(PROFILE.level || 'Этаж');
  const objName = { mkd: 'МКД', flat: 'Помещения', industrial: 'Промышленный объект' }[PROFILE.type] || 'Объект';
  T = {
    part: p.one, partL: p.one.toLowerCase(), partGen: p.gen, partAcc: p.acc, parts: p.pl, partsL: p.pl.toLowerCase(), partShort: p.short,
    level: l.one, levelL: l.one.toLowerCase(), levelGen: l.gen, levelAcc: l.acc, levels: l.pl, levelsL: l.pl.toLowerCase(), levelShort: l.short,
    levelsDat: DAT_PL[l.pl] || l.pl.toLowerCase(), object: PROFILE.name || objName,
  };
}

/** Тип объекта: из листа «Проект» (Тип объекта), иначе по слову частей и виду уровней */
function detectType(prj, parts) {
  const numeric = parts.every((p) => (p.levels || []).every((l) => typeof l.key === 'number'));
  const t = String(prj.type || '').toLowerCase(), w = String(prj.part || '').toLowerCase();
  if (/пром|цех|склад|ангар|завод|произв/.test(t)) return 'industrial';
  if (/кварт|офис|помещ|ремонт|отдел|интерьер/.test(t)) return 'flat';
  if (/мкд|жил|дом|много|здан|корпус/.test(t)) return numeric ? 'mkd' : 'flat';
  if (/цех|склад|ангар|прол/.test(w)) return 'industrial';
  if (/кв|помещ|офис/.test(w)) return 'flat';
  return numeric ? 'mkd' : 'flat';
}
function setStructure(st) {
  SECTIONS = st.sections && st.sections.length ? st.sections.map(String) : ['1'];
  PROFILE = { type: 'mkd', name: '', part: 'Секция', level: 'Этаж', ...(st.profile || {}) };
  LAYOUT = st.layout || 'stack';
  LEVELS = st.levels || [];
  LEVEL_IDX = new Map(LEVELS.map((l, i) => [String(l.key), i]));
  if (LAYOUT === 'stack') {
    TOP = Math.max(1, Math.min(60, st.top | 0 || 16));
    ROOF = TOP + 1;
    FLOORS = Array.from({ length: TOP + 2 }, (_, i) => i);
    PART_LEVELS = Object.fromEntries(SECTIONS.map((s) => [s, FLOORS]));
  } else {
    TOP = LEVELS.length; ROOF = -1;
    FLOORS = LEVELS.map((_, i) => i);
    PART_LEVELS = Object.fromEntries(SECTIONS.map((s) => [s, (st.partLevels && st.partLevels[s]) || FLOORS]));
  }
  WORKS = PROFILE.type === 'mkd' ? MKD_WORKS.slice() : (st.works || []);
  makeTerms();
}
const STRUCT_KEY = 'stroyka.structure.v2';
setStructure({ sections: SECTIONS, top: TOP });
try { const st = JSON.parse(localStorage.getItem(STRUCT_KEY) || 'null'); if (st && st.sections) setStructure(st); } catch { /* */ }

/** Уровни конкретной части (у квартир — свои помещения, у секций — общий набор этажей) */
export function levelsOf(s) { return PART_LEVELS[s] || FLOORS; }

/** Применить структуру из таблиц; true — если она поменялась (нужно перестроить 3D) */
export function configure(structure) {
  if (!structure || !Array.isArray(structure.sections) || !structure.sections.length) return false;
  const parts = structure.sections.map((x) => ({ ...x, id: String(x.id) })).sort((a, b) => a.id.localeCompare(b.id, 'ru', { numeric: true }));
  const prj = structure.project || {};
  const type = detectType(prj, parts);
  const st = { sections: parts.map((p) => p.id), profile: { type, name: prj.name || '', part: prj.part || 'Секция', level: prj.level || 'Этаж' } };
  if (type === 'mkd') {
    st.layout = 'stack';
    st.top = Math.max(...parts.map((x) => Number(x.floors) || 0)) || 16;
  } else {
    st.layout = type === 'industrial' ? 'hall' : 'plan';
    const levels = [], idx = new Map();
    st.partLevels = {};
    for (const p of parts) {
      st.partLevels[p.id] = [];
      for (const l of p.levels || []) {
        const k = String(l.key);
        if (!idx.has(k)) { idx.set(k, levels.length); levels.push({ key: l.key, label: String(l.label) }); }
        st.partLevels[p.id].push(idx.get(k));
      }
    }
    st.levels = levels;
  }
  let prev = null; try { prev = JSON.parse(localStorage.getItem(STRUCT_KEY) || 'null'); } catch { /* */ }
  const sig = (x) => JSON.stringify([x.sections, x.layout, x.top || 0, x.profile, x.levels || [], x.partLevels || {}]);
  const cur = prev || { sections: SECTIONS, layout: LAYOUT, top: LAYOUT === 'stack' ? TOP : 0, profile: PROFILE };
  const changed = sig(st) !== sig(cur);
  try { localStorage.setItem(STRUCT_KEY, JSON.stringify(st)); } catch { /* */ }
  setStructure(st);
  return changed;
}
/** Виды работ проекта (не МКД) — из строк объёмов, в порядке таблицы */
export function setWorks(list) { if (PROFILE.type !== 'mkd') WORKS = list; }

/** Ключ уровня из таблицы → номер в приложении (null — такого уровня нет в структуре) */
export function fromKey(f) {
  if (f === null || f === undefined || f === '') return null;
  if (LAYOUT === 'stack') { const n = Number(f); return n === ROOF_KEY ? ROOF : Number.isFinite(n) ? n : null; }
  const i = LEVEL_IDX.get(String(f));
  return i === undefined ? null : i;
}
/** Номер уровня в приложении → ключ для записи в таблицу */
export function toKey(f) {
  if (LAYOUT === 'stack') return f === ROOF ? ROOF_KEY : f;
  return LEVELS[f] ? LEVELS[f].key : f;
}

export function floorName(f) {
  if (LAYOUT !== 'stack') return LEVELS[f] ? LEVELS[f].label : `${T.level} ${f}`;
  if (f === 0) return 'Подвал';
  if (f === ROOF) return 'Кровля';
  return `${f} этаж`;
}
export function floorShort(f) {
  if (LAYOUT !== 'stack') { const l = LEVELS[f] ? LEVELS[f].label : String(f); return l.length > 9 ? l.slice(0, 8) + '…' : l; }
  if (f === 0) return 'П';
  if (f === ROOF) return 'К';
  return String(f);
}
export function worksForFloor(f) {
  if (PROFILE.type !== 'mkd') return [];
  if (f === 0) return ['Перегородки'];
  if (f === ROOF) return ['Кровля'];
  return ['Наружные стены', 'Перегородки'];
}
/** «Штукатурка стен, м²» → «Штукатурка стен» */
export function cleanWork(work) {
  return String(work || '').replace(/\s*,\s*(м²|м2|м³|м3|кв\.?\s*м|куб\.?\s*м|шт|п\.?\s*м|м\.?\s*п|пог\.?\s*м|т|кг|компл)\.?\s*$/i, '').replace(/\s+/g, ' ').trim();
}
/** Вид работ из «Выполнения» → группа работ приложения. Для МКД — укрупнённые группы, иначе — как в таблице. */
export function workGroup(work, floor) {
  if (PROFILE.type !== 'mkd') return cleanWork(work) || null;
  if (floor === ROOF) return 'Кровля';
  if (/наруж|кирпич/i.test(work)) return 'Наружные стены';
  if (/внутр/i.test(work)) return 'Перегородки';
  if (/инженер/i.test(work)) return 'Инженерка';
  return null;
}

/** «5 этаж наружные стены» → { floor: 5, work: 'Наружные стены' } */
export function parseRowLabel(label) {
  const s = String(label || '').trim().toLowerCase();
  if (!s) return null;
  if (LAYOUT !== 'stack') {   // «Кухня отделка», «Пролёт 1–2 полы»: начало — уровень, дальше — вид работ
    let best = -1, len = 0;
    LEVELS.forEach((l, i) => { const t = l.label.toLowerCase(); if (t.length > len && s.startsWith(t)) { best = i; len = t.length; } });
    if (best < 0) return null;
    const rest = s.slice(len).trim();
    const work = WORKS.find((w) => rest && (w.toLowerCase().startsWith(rest) || rest.startsWith(w.toLowerCase().split(' ')[0]))) || null;
    return work ? { floor: best, work } : null;
  }
  if (s.startsWith('кровл')) return { floor: ROOF, work: 'Кровля' };
  let floor = null;
  if (s.startsWith('подвал')) floor = 0;
  const m = s.match(/^(\d+)\s*этаж/);
  if (m) floor = Number(m[1]);
  if (floor === null) return null;
  const work = s.includes('наружн') ? 'Наружные стены' : s.includes('перегород') ? 'Перегородки' : null;
  if (!work) return null;
  return { floor, work };
}

const DEFAULT_DOCS_HEAD = [['', 'ИС', '', 'АОСР', '', 'Замечания по АОСР', ''], ['', 'С4', 'С5', 'С4', 'С5', 'С4', 'С5']];
/** Шапка листа «Таблица» (строки 1–2) → какие колонки чьи: [{ c (1-based), kind: is|aosr|rem, section }] */
export function docsColumns(head) {
  const h = head && head.length >= 2 ? head : DEFAULT_DOCS_HEAD;
  const cols = [];
  let block = '';
  for (let i = 1; i < h[1].length; i++) {
    if (String(h[0][i] || '').trim()) block = String(h[0][i]).toLowerCase();
    const sec = String(h[1][i] || '').trim().replace(/^(секци[яи]|с|c)\s*/i, '');
    if (!sec) continue;
    const kind = /замеч/.test(block) ? 'rem' : /аоср/.test(block) ? 'aosr' : /^\s*ис(?![а-яё])|исполн/.test(block) ? 'is' : null;
    if (kind) cols.push({ c: i + 1, kind, section: sec });
  }
  return cols;
}
/** Строки листа «Таблица» → документы по этажам: { floor, work, row, [секция]: { is, aosr, rem, cols } } */
export function docsFromRows(rows, head) {
  const cols = docsColumns(head);
  const out = [];
  for (const r of rows) {
    const p = parseRowLabel(r[0]);
    if (!p) continue;
    const last = r[r.length - 1];
    const d = { ...p, label: r[0], row: typeof last === 'number' ? last : null };
    for (const x of cols) {
      const o = (d[x.section] ||= { is: '', aosr: '', rem: '', cols: {} });
      o[x.kind] = r[x.c - 1] || '';
      o.cols[x.kind] = x.c;
    }
    out.push(d);
  }
  return out;
}

/** Стартовая оценка процента по документам: есть ИС/АОСР → 100, есть замечания → 50, иначе 0. */
export function estimateFromDocs(docs) {
  const list = [];
  for (const s of SECTIONS) for (const f of FLOORS) for (const w of worksForFloor(f)) {
    const d = docs.find((x) => x.floor === f && x.work === w);
    const v = d && d[s] ? (d[s].is || d[s].aosr ? 100 : d[s].rem ? 50 : 0) : 0;
    list.push({ section: s, floor: f, work: w, value: v, updated: '', note: 'оценка по листу «Таблица»' });
  }
  return list;
}

/** Номера этажей, упомянутые в тексте замечания: «6 эт.», «2–5 эт.», «8–9 этаж», «1 по 15 этаж». */
export function floorsInText(text) {
  const s = String(text || '');
  if (LAYOUT !== 'stack') { const t = s.toLowerCase(); return LEVELS.map((l, i) => (l.label.length >= 3 && t.includes(l.label.toLowerCase()) ? i : -1)).filter((i) => i >= 0); }
  const res = new Set();
  const re = /(\d{1,2})\s*(?:[–\-—]|по)\s*(\d{1,2})\s*(?:эт|этаж)|(\d{1,2})\s*(?:эт\.|этаж|эт(?![а-яё]))|этаж[а-я]*\s*(\d{1,2})/gi;
  let m;
  while ((m = re.exec(s))) {
    if (m[1] && m[2]) { for (let i = +m[1]; i <= +m[2]; i++) res.add(i); }
    else if (m[3]) res.add(+m[3]);
    else if (m[4]) res.add(+m[4]);
  }
  return [...res].filter((f) => f >= 1 && f <= TOP);
}

export function ruToIso(d) {
  const m = String(d || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
export function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const RU_MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
/** Ищет дату в произвольном тексте: «17.04.2026», «2026-04-17», «от 4 июля 2026 г.» → ISO */
export function findDate(text) {
  const s = String(text || '');
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.toLowerCase().match(/(\d{1,2})\s+([а-я]+)\s+(\d{4})/);
  if (m) {
    const i = RU_MONTHS.findIndex((x) => m[2].startsWith(x) && (x !== 'ма' || m[2].startsWith('мая') || m[2] === 'май'));
    if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}
/** «1 234 567,89» / «10523.85» / 1234 → число */
export function money(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v || '').replace(/[\s\u00a0₽]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
export const EXPENSE_CATS = ['Материалы', 'Работы', 'Услуги', 'Логистика', 'Прочее'];

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } },
};

const key = (s, f, w) => `${s}|${f}|${w}`;
/** Ключи уровней из таблиц → номера уровней приложения (один раз, при загрузке) */
function mapFloors(e) {
  if (!e) return;
  for (const k of ['volumes', 'floorStatus', 'worklog', 'moves', 'plan', 'discrepancies']) for (const v of e[k] || []) if (v && 'floor' in v) v.floor = fromKey(v.floor);
}

/** «СКЦ 160 мм / ПОЛИГРАН 160 ПГ C50», «ПОЛИГРАН 160» → «СКЦ 160»; «Газобетон 100 мм · КСМ» → «Газобетон 100» */
export function materialKey(name) {
  const s = String(name || '').toLowerCase();
  const size = (s.match(/(\d{2,3})\s*(?:мм|пг|\b)/) || [])[1];
  if (/скц|полигран|камень/.test(s)) return `СКЦ ${size || ''}`.trim() + (/полнотел/.test(s) ? ' полнотелый' : /пустотел/.test(s) ? ' пустотелый' : '');
  if (/газобет|газобл|(?<![а-яё])гб(?![а-яё])/.test(s)) return `Газобетон ${size || ''}`.trim();
  if (/клей/.test(s)) return 'Клей';
  if (/цпс|пескобет|смесь/.test(s)) return 'ЦПС';
  return String(name || '').trim();
}

export class Store {
  constructor() {
    const cfg = LS.get('stroyka.cfg', {});
    this.obj = LS.get('stroyka.obj', '');   // выбранный объект — ID его таблицы объёмов ('' — по умолчанию)
    const qs = new URLSearchParams(location.search);
    this.url = qs.get('api') || cfg.url || API_URL || '';
    this.token = qs.get('token') || cfg.token || API_TOKEN || '';
    this.progress = new Map();
    this.journal = [];
    this.docs = [];
    this.remarks = [];
    this.fin = { expenses: [], advances: [], income: [], nominated: [], personal: [], tools: [], contract: [], summary: null, partial: false };
    this.status = 'idle'; // idle | loading | ok | error | demo
    this.error = '';
    this.loadedAt = null;
    this.listeners = new Set();
    this.queue = LS.get('stroyka.queue', []);
    this.extra = { volumes: [], moves: [], worklog: [], floorStatus: [], plan: [], discrepancies: [], inventory: [], sources: [] };
    this.vol = new Map();
    this.version = null;
    this.log = LS.get('stroyka.synclog', []);   // журнал синхронизации: записи в таблицу и изменения из таблиц
    this.flushing = false;
    this.syncError = '';
  }

  get connected() { return !!this.url; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { for (const fn of this.listeners) fn(what); }

  /** Переключить объект: другая таблица объёмов, своя структура и 3D */
  setObject(id) { this.obj = id || ''; LS.set('stroyka.obj', this.obj); }
  get objects() { return (this.extra && this.extra.objects) || []; }
  /** Создать таблицу нового объекта по шаблону (на Google Диске владельца) и вернуть её ID */
  async newObject(spec) { return this.post({ action: 'newObject', ...spec }); }

  saveConfig(url, token) {
    this.url = (url || '').trim();
    this.token = (token || '').trim();
    LS.set('stroyka.cfg', { url: this.url, token: this.token });
  }

  // ---------- чтение ----------
  async load(silent = false) {
    if (!silent) { this.status = 'loading'; this.emit('status'); }
    // первый показ — сразу из копии на устройстве, пока идёт запрос к таблице
    if (this.connected && !this.progress.size) {
      const c = this.cacheLoad();
      if (c) { this.apply(c.data); for (const op of this.queue) if ((op.obj || '') === (this.obj || '')) this.applyLocal(op); this.emit('data'); }
    }
    try {
      if (this.connected) {
        const u = new URL(this.url);
        u.searchParams.set('action', 'all');
        if (this.obj) u.searchParams.set('obj', this.obj);
        if (this.token) u.searchParams.set('token', this.token);
        const r = await fetch(u.toString(), { redirect: 'follow' });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || 'Ошибка Apps Script');
        const before = this.progress.size ? this.digest() : null;
        this.apply(data);
        if (before) {
          const ch = this.diffDigest(before, this.digest());
          if (ch.length) { this.addLog({ dir: 'in', status: 'ok', text: 'Из таблиц: ' + ch.join('; ') }); this.emit({ type: 'incoming', text: ch.join('; ') }); }
        }
        this.stale = data.stale ? (data.staleAt || 'да') : null;
        this.cacheSave(data);
        this.version = data.v || this.version;
        for (const op of this.queue) if ((op.obj || '') === (this.obj || '')) this.applyLocal(op); // неотправленные правки не теряются
        this.status = 'ok';
        this.startLiveSync();
        this.flush();
      } else {
        this.loadDemo();
        this.status = 'demo';
      }
      this.error = '';
      this.loadedAt = new Date();
    } catch (e) {
      console.error(e);
      this.error = String(e.message || e);
      this.status = 'error';
      // сервер недоступен — показываем последнюю копию, сохранённую на этом устройстве
      const c = this.connected && this.cacheLoad();
      if (c && !this.progress.size) {
        this.apply(c.data);
        for (const op of this.queue) if ((op.obj || '') === (this.obj || '')) this.applyLocal(op);
        this.cachedAt = c.at;
        this.error += ' · показана копия на устройстве от ' + new Date(c.at).toLocaleString('ru-RU');
        this.startLiveSync();
      } else if (!this.progress.size) this.loadDemo();
    }
    this.emit('data'); this.emit('status');
  }

  apply(data) {
    if (data.extra && configure(data.extra.structure)) this.structureChanged = true;
    this.docsRows = data.docsRows || [];
    this.docsHead = data.docsHead || null;
    this.docs = docsFromRows(this.docsRows, this.docsHead);
    this.remarks = data.remarks || [];
    this.fin = normFin(data.fin || {});
    if (this.obj && data.extra) {   // другой объект: поручения, ИС/АОСР и данные VUP CORE относятся к основному МКД
      data = { ...data, remarks: [], docsRows: [], docsHead: null, extra: { ...data.extra, moves: [], worklog: [], floorStatus: [], plan: [], discrepancies: [], inventory: [] } };
      this.docsRows = []; this.docs = []; this.remarks = [];
    }
    mapFloors(data.extra);
    this.setExtra(data.extra);
    this.checks = data.checks || [];
    this.journal = (data.journal || []).map((j) => ({ ...j, qty: Number(j.qty) || 0 }));
    this.progress = new Map();
    const list = data.progress || [];   // никаких оценок: проценты — из «Выполнения», ручные значения — из листа «Прогресс»
    for (const p of list) { const f = fromKey(p.floor); if (f === null) continue; this.progress.set(key(String(p.section), f, p.work), { ...p, section: String(p.section), floor: f, value: clampPct(p.value) }); }
  }

  loadDemo() {
    const saved = LS.get('stroyka.demo', null);
    this.docsRows = SEED_DOCS_ROWS;
    this.docs = docsFromRows(SEED_DOCS_ROWS, null);
    this.remarks = SEED_REMARKS;
    this.journal = saved ? saved.journal : [];
    this.fin = normFin({ ...SEED_FIN, expenses: [...SEED_FIN.expenses, ...((saved && saved.expenses) || [])] });
    this.fin.partial = true;
    this.progress = new Map();
    const list = saved ? saved.progress : [];
    for (const p of list) this.progress.set(key(p.section, p.floor, p.work), p);
  }
  // ---------- резервные копии ----------
  cacheSave(data) {
    try { localStorage.setItem('stroyka.cache', JSON.stringify({ at: Date.now(), src: this.url + '#' + (this.obj || ''), data })); } catch { /* нет места — не критично */ }
  }
  cacheLoad() {
    const c = LS.get('stroyka.cache', null);
    return c && c.src === this.url + '#' + (this.obj || '') ? c : null;
  }
  /** Полная копия данных приложения (формат понимают сервер и кнопка «Восстановить») */
  snapshot() {
    return {
      extra: this.extra,
      progress: [...this.progress.values()], journal: this.journal, docsRows: this.docsRows || [], docsHead: this.docsHead || null, remarks: this.remarks,
      fin: { expenses: this.fin.expenses, advances: this.fin.advances, income: this.fin.income, nominated: this.fin.nominated, personal: this.fin.personal, tools: this.fin.tools, contract: this.fin.contract, summary: this.fin.summary, partial: this.fin.partial },
    };
  }
  exportBackup() {
    return { format: 'stroyka-backup', version: 1, exportedAt: new Date().toISOString(), source: this.url || 'snapshot', data: this.snapshot() };
  }
  /** Восстановление: на свой сервер (MODE=standalone) — целиком; без подключения — на это устройство */
  async importBackup(obj) {
    const d = obj && obj.format === 'stroyka-backup' ? obj.data : obj;
    if (!d || !Array.isArray(d.progress)) throw new Error('Это не файл резервной копии приложения');
    if (this.connected) {
      const res = await this.post({ action: 'restore', data: obj });
      await this.load();
      return res.restored ? `Восстановлено на сервере: прогресс ${res.restored.progress}, журнал ${res.restored.journal}, расходы ${res.restored.expenses}` : 'Восстановлено';
    }
    this.apply(d);
    this.saveDemo();
    this.emit('data');
    return 'Копия загружена на это устройство';
  }

  saveDemo() {
    if (this.connected) return;
    LS.set('stroyka.demo', { progress: [...this.progress.values()], journal: this.journal, expenses: this.fin.expenses.filter((e) => e.local) });
  }
  resetDemo() {
    try { localStorage.removeItem('stroyka.demo'); } catch { /* */ }
    this.loadDemo(); this.emit('data');
  }

  /** Данные других таблиц: «Выполнение» (объёмы) и «VUP CORE» (материалы, ход работ, статусы этажей) */
  setExtra(x) {
    const e = x || {};
    this.extra = { volumes: e.volumes || [], moves: e.moves || [], worklog: e.worklog || [], floorStatus: e.floorStatus || [], plan: e.plan || [], discrepancies: e.discrepancies || [], inventory: e.inventory || [], sources: e.sources || [], structure: e.structure || null, objects: e.objects || [], object: e.object || '' };
    this.vol = new Map();
    if (PROFILE.type !== 'mkd') setWorks([...new Set(this.extra.volumes.map((v) => workGroup(v.work, v.floor)).filter(Boolean))]);
    for (const v of this.extra.volumes) {
      if (v.floor === null || v.floor === undefined) continue;
      const g = workGroup(v.work, Number(v.floor));
      if (!g || !(v.total > 0)) continue;
      const k = `${v.section}|${Number(v.floor)}`;
      const fl = this.vol.get(k) || {};
      const grp = (fl[g] ||= { total: 0, done: 0, items: [] });
      grp.total += v.total; grp.done += Math.min(v.done || 0, v.total); grp.items.push(v);
      this.vol.set(k, fl);
    }
  }
  volumeGroup(section, floor, work) { const fl = this.vol.get(`${section}|${floor}`); return fl ? fl[work] || null : null; }
  /** Виды работ этажа: по таблице «Выполнение», если в ней есть этот этаж, иначе стандартный набор */
  worksFor(section, floor) {
    const fl = this.vol.get(`${section}|${floor}`);
    if (fl) return WORKS.filter((w) => fl[w]);
    return worksForFloor(floor);
  }
  isVolumeBased(section, floor, work) { return !!this.volumeGroup(section, floor, work); }

  // ---------- вычисления ----------
  get(section, floor, work) {
    const g = this.volumeGroup(section, floor, work);
    if (g) return Math.round((g.done / g.total) * 100);
    const p = this.progress.get(key(section, floor, work));
    return p ? p.value : null;   // нет данных — не 0 и не оценка
  }
  /** work = 'avg' → среднее по видам работ этажа; иначе конкретный вид (null если не применим) */
  floorValue(section, floor, work = 'avg') {
    const works = this.worksFor(section, floor);
    if (work !== 'avg') return works.includes(work) ? this.get(section, floor, work) : null;
    const vals = works.map((w) => this.get(section, floor, w)).filter((v) => v != null);
    return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
  }
  sectionValue(section, work = 'avg') {
    let sum = 0, n = 0;
    for (const f of levelsOf(section)) {
      const v = this.floorValue(section, f, work);
      if (v === null) continue;
      sum += v; n++;
    }
    return n ? sum / n : null;
  }
  remarksFor(section, floor) {
    return this.remarks.filter((r) => String(r.section) === section && floorsInText(r.short + ' ' + r.text).includes(floor));
  }
  isOpenRemark(r) { return !/выполнено/i.test(r.status || '') && !r.done; }
  /** Журнал + записи из «VUP CORE» (только чтение): поставки/подачи материала и рабочие по ходу работ */
  allJournal() {
    const ext = [];
    for (const m of this.extra.moves) {
      if (!m.date) continue;
      const feed = /подач/i.test(m.type);
      ext.push({ id: 'vup-' + m.id, date: m.date, approx: !m.dateExact, section: m.section || 'Общее', type: 'Материал', kind: feed ? 'feed' : 'in',
        name: m.material + (feed ? ` → ${m.zone}` : ''), qty: m.pallets, unit: 'пал.', note: m.doc, ro: true, src: 'VUP CORE' });
    }
    for (const w of this.extra.worklog) {
      if (!w.start || !w.workers) continue;
      ext.push({ id: 'vupw-' + w.id, date: w.start, section: w.section || 'Общее', type: 'Люди', name: `${w.stage || 'Работы'}${w.floor != null ? `, ${w.floor} эт.` : ''}${w.brigade && !/не уточн/i.test(w.brigade) ? ` (${w.brigade})` : ''}`, qty: w.workers, unit: 'чел.', note: w.status, ro: true, src: 'VUP CORE' });
    }
    return this.journal.concat(ext);
  }
  journalOn(date) { return this.allJournal().filter((j) => j.date === date); }
  peopleOn(date, section) {
    return this.allJournal().filter((j) => j.date === date && j.type === 'Люди' && (!section || j.section === section)).reduce((a, j) => a + j.qty, 0);
  }
  /** Склад по VUP CORE: поступления минус подачи на этажи, по материалам (паллеты) */
  stock() {
    const rows = {};
    for (const m of this.extra.moves) {
      const k = materialKey(m.material);
      const r = (rows[k] ||= { material: k, names: new Set(), in: 0, out: 0 });
      r.names.add(m.material);
      if (/подач/i.test(m.type)) r.out += m.pallets || 0; else if (/поступ|приход|приём|прием/i.test(m.type)) r.in += m.pallets || 0;
    }
    return Object.values(rows).map((r) => ({ ...r, names: [...r.names], left: r.in - r.out })).sort((a, b) => a.material.localeCompare(b.material, 'ru'));
  }
  /** План подачи на этажи (VUP CORE «Стройка · план») против фактических подач */
  planVsFact() {
    return this.extra.plan.map((p) => {
      const fed = this.extra.moves.filter((m) => /подач/i.test(m.type) && m.section === p.section && m.floor === p.floor && materialKey(m.material) === materialKey(p.material)).reduce((a, m) => a + (m.pallets || 0), 0);
      return { ...p, key: materialKey(p.material), fed };
    });
  }
  floorStatusOf(section, floor) { return this.extra.floorStatus.filter((x) => String(x.section) === section && Number(x.floor) === floor); }
  movesTo(section, floor) { return this.extra.moves.filter((m) => m.section === section && m.floor === floor); }
  worklogOf(section, floor) { return this.extra.worklog.filter((w) => String(w.section) === section && Number(w.floor) === floor); }

  // ---------- запись: очередь операций → Apps Script ----------
  // Любая правка сразу применяется в приложении и ставится в очередь. Очередь хранится
  // на устройстве и отправляется в таблицу немедленно; при пропаже связи — повтор каждые 10 с.
  async post(payload) {
    let r;
    try {
      r = await fetch(this.url, {
        method: 'POST',
        // text/plain — «простой» запрос без CORS-preflight, Apps Script его принимает
        body: JSON.stringify({ obj: this.obj || '', ...payload, ...(payload.action === 'setProgress' ? { floor: toKey(payload.floor) } : {}), token: this.token }),
        redirect: 'follow',
      });
    } catch (e) { const err = new Error('Нет связи с таблицей'); err.network = true; throw err; }
    let data;
    try { data = await r.json(); } catch { const err = new Error('Таблица не ответила'); err.network = true; throw err; }
    if (!data.ok) throw new Error(data.error || 'Ошибка записи');
    return data;
  }

  addLog(item) {
    this.log.unshift({ at: new Date().toISOString(), ...item });
    this.log = this.log.slice(0, 60);
    LS.set('stroyka.synclog', this.log);
    this.emit('log');
  }
  /** Человеческое описание операции (для подтверждения и журнала) */
  describe(op) {
    const e = op.entry || {};
    switch (op.action) {
      case 'setProgress': return `Прогресс: секция ${op.section}, ${floorName(op.floor).toLowerCase()}, ${op.work.toLowerCase()} → ${op.value}%`;
      case 'addJournal': return `Журнал: ${e.date}, секция ${e.section}, ${e.name} — ${e.qty} ${e.unit || ''}`;
      case 'updateJournal': return `Журнал (исправление): ${e.date}, ${e.name} — ${e.qty} ${e.unit || ''}`;
      case 'deleteJournal': { const j = this.journal.find((x) => x.id === op.id) || op.prev || {}; return `Журнал (удаление): ${j.date || ''} ${j.name || op.id}`; }
      case 'addExpense': return `Счета: ${e.date}, ${e.who}, ${e.note || e.basis || ''} — ${Math.round(e.sum).toLocaleString('ru-RU')} ₽`;
      case 'updateExpense': return `Счета (исправление): ${e.who}, ${e.note || ''} — ${Math.round(e.sum).toLocaleString('ru-RU')} ₽`;
      case 'deleteExpense': return `Счета (удаление): ${op.id}`;
      case 'setCell': return `${op.label || op.f}: → ${op.value}`;
      case 'addRow': return `${op.label || 'Новая строка'} (${op.s})`;
    }
    return op.action;
  }
  /** Сверка: таблица вернула то, что мы записали? */
  verify(op, res) {
    const c = res && res.check;
    if (!c) return null;
    if (op.action === 'setProgress') return c.value === op.value;
    if (/Journal$/.test(op.action) && op.entry) return Math.abs((c.qty || 0) - (Number(op.entry.qty) || 0)) < 1e-6;
    if (/Expense$/.test(op.action) && op.entry) return Math.abs((c.sum || 0) - (Number(op.entry.sum) || 0)) < 0.01;
    if (op.action === 'setCell') {
      const want = String(op.value).trim(), got = c.value;
      if (typeof got === 'number') return Math.abs(got - Number(want.replace(/\s/g, '').replace(',', '.'))) < 0.005;
      return String(got).trim() === want || String(c.display).trim() === want;
    }
    if (op.action === 'addRow') return !!c.display;
    return null;
  }

  /** Можно ли писать в таблицу: G — «Glorax_Учёт», V — «Выполнение», U — «VUP CORE» */
  canEditBook(b) {
    if (!this.connected) return false;
    const src = (this.extra.sources || []).find((x) => x.key === b);
    return b === 'G' ? true : !!(src && src.canEdit);
  }
  bookInfo(b) { return (this.extra.sources || []).find((x) => x.key === b) || {}; }
  /** Записать одно значение в ячейку таблицы (через очередь, с подтверждением снаружи) */
  setCell(spec, value) {
    this.commit({ action: 'setCell', b: spec.b, s: spec.s, r: spec.r, f: spec.f, c: spec.c, value, expect: spec.expect, label: spec.label, prop: spec.prop, list: spec.list });
  }
  addRow(b, s, values, label) { this.commit({ action: 'addRow', b, s, values, label }); }

  /** Сводка данных — чтобы после перезагрузки показать, что поменялось в таблицах */
  digest() {
    return {
      prog: new Map([...this.progress].map(([k, p]) => [k, p.value])),
      j: new Set(this.journal.map((j) => `${j.id}|${j.date}|${j.qty}|${j.name}`)),
      ex: this.fin.expenses.length, exSum: Math.round(this.fin.expenses.reduce((a, e) => a + e.sum, 0)),
      vol: Math.round(this.extra.volumes.reduce((a, v) => a + (v.done || 0), 0) * 100) / 100,
      mv: this.extra.moves.length, wl: this.extra.worklog.length, plan: this.extra.plan.length, st: this.extra.floorStatus.length,
    };
  }
  diffDigest(a, b) {
    const out = [];
    let pc = 0; for (const [k, v] of b.prog) if (a.prog.get(k) !== v) pc++;
    if (pc) out.push(`«Прогресс»: ${pc} изм.`);
    let ja = 0, jd = 0; for (const x of b.j) if (!a.j.has(x)) ja++; for (const x of a.j) if (!b.j.has(x)) jd++;
    if (ja || jd) out.push(`«Журнал»: ${ja ? '+' + ja : ''}${ja && jd ? ' / ' : ''}${jd ? '−' + jd : ''}`);
    if (a.ex !== b.ex || a.exSum !== b.exSum) out.push(`«Счета»: ${a.ex}→${b.ex} операций, ${(b.exSum - a.exSum).toLocaleString('ru-RU')} ₽`);
    if (a.vol !== b.vol) out.push(`«Выполнение»: выполнено ${b.vol > a.vol ? '+' : ''}${(Math.round((b.vol - a.vol) * 100) / 100).toLocaleString('ru-RU')}`);
    if (a.mv !== b.mv || a.wl !== b.wl || a.plan !== b.plan || a.st !== b.st) out.push(`VUP CORE: движений ${a.mv}→${b.mv}, ход работ ${a.wl}→${b.wl}, план ${a.plan}→${b.plan}, статусы ${a.st}→${b.st}`);
    return out;
  }

  /** Применить операцию к локальным данным (и до отправки, и поверх свежей загрузки) */
  applyLocal(op) {
    const e = op.entry;
    switch (op.action) {
      case 'setProgress':
        this.progress.set(key(op.section, op.floor, op.work), { section: op.section, floor: op.floor, work: op.work, value: op.value, updated: op.at || '', note: '' });
        break;
      case 'addJournal':
        if (!this.journal.some((j) => j.id === e.id)) this.journal.push({ ...e });
        break;
      case 'updateJournal':
        this.journal = this.journal.map((j) => (j.id === e.id ? { ...j, ...e } : j));
        break;
      case 'deleteJournal':
        this.journal = this.journal.filter((j) => j.id !== op.id);
        break;
      case 'addExpense':
        if (!this.fin.expenses.some((x) => x.id === e.id)) this.fin.expenses.push({ ...e });
        break;
      case 'updateExpense':
        this.fin.expenses = this.fin.expenses.map((x) => (x.id === e.id ? { ...x, ...e } : x));
        break;
      case 'deleteExpense':
        this.fin.expenses = this.fin.expenses.filter((x) => x.id !== op.id);
        break;
      case 'setCell': {
        // сразу показать новое значение; точное значение вернёт таблица при следующей загрузке
        if (op.f === 'cell' && op.list === 'docsRows') {
          const r = (this.docsRows || []).find((x) => x[x.length - 1] === op.r);
          if (r) { r[op.c - 1] = op.value; this.docs = docsFromRows(this.docsRows, this.docsHead); }
          break;
        }
        const list = op.list && op.list.split('.').reduce((o, k) => (o ? o[k] : null), this);
        if (Array.isArray(list) && op.prop) {
          const rec = list.find((x) => x.row === op.r && (!x.sheet || x.sheet === op.s));
          if (rec) {
            if (op.f === 'week') { const iso = Object.keys(rec.weekCols || {}).find((d) => rec.weekCols[d] === op.c); if (iso) { rec.weekly = { ...(rec.weekly || {}), [iso]: Number(op.value) || 0 }; } }
            else rec[op.prop] = /^(sum|qty|pallets|workers|total|accepted|value)$/.test(op.f) ? Number(String(op.value).replace(',', '.')) : op.value;
          }
          if (op.list === 'extra.volumes') this.setExtra(this.extra);
        }
        break;
      }
    }
  }

  /** Записать операцию: локально сразу, в таблицу — через очередь */
  commit(op) {
    op.at = new Date().toISOString().slice(0, 16).replace('T', ' ');
    op.obj = this.obj || '';   // правка уйдёт в таблицу того объекта, где её сделали
    this.applyLocal(op);
    this.emit('data');
    if (!this.connected) { this.saveDemo(); this.emit('saved-local'); return; }
    this.queue.push(op);
    LS.set('stroyka.queue', this.queue);
    this.addLog({ dir: 'out', status: 'queued', text: this.describe(op) });
    this.flush();
  }

  async flush() {
    if (this.flushing || !this.connected || !this.queue.length) return;
    this.flushing = true; this.emit('sync');
    try {
      while (this.queue.length) {
        const op = this.queue[0];
        try {
          const res = await this.post(op);
          if (res.v) this.version = res.v;
          if (res.id && op.entry && res.id !== op.entry.id) this.applyLocal({ action: op.action.replace('add', 'update'), entry: { ...op.entry, id: res.id } });
          this.syncError = '';
          const ok = this.verify(op, res);
          const where = res.sheet ? `лист «${res.sheet}»${res.row ? ', строка ' + res.row : ''}` : '';
          this.addLog({ dir: 'out', status: ok === false ? 'mismatch' : 'ok', text: this.describe(op), where, verified: ok });
          this.emit({ type: 'saved', where, verified: ok });
        } catch (err) {
          if (err.network) { this.syncError = err.message; this.retryLater(); break; }
          this.addLog({ dir: 'out', status: 'error', text: this.describe(op), where: err.message });
          this.emit({ type: 'rejected', message: err.message }); // таблица отклонила — не блокируем очередь
        }
        this.queue.shift();
        LS.set('stroyka.queue', this.queue);
      }
    } finally {
      this.flushing = false; this.emit('sync');
    }
  }
  retryLater() { clearTimeout(this.retryT); this.retryT = setTimeout(() => this.flush(), 10000); }

  // ---------- чтение изменений из таблицы ----------
  /** Лёгкая проверка: изменилась ли таблица (отметку ставит триггер скрипта при любой правке) */
  async checkVersion() {
    if (!this.connected || this.flushing || this.queue.length || this.status === 'loading') return;
    try {
      const u = new URL(this.url);
      u.searchParams.set('action', 'version');
      if (this.obj) u.searchParams.set('obj', this.obj);
      if (this.token) u.searchParams.set('token', this.token);
      const data = await (await fetch(u.toString(), { redirect: 'follow' })).json();
      if (data.ok && data.v && data.v !== this.version) await this.load(true);
      else if (data.ok) { this.lastCheck = new Date(); this.emit('sync'); }
    } catch { /* следующая проверка через 10 с */ }
  }
  startLiveSync() {
    if (this.liveT) return;
    this.liveT = setInterval(() => { if (!document.hidden) this.checkVersion(); }, 10000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.flush(); this.checkVersion(); } });
    addEventListener('focus', () => this.checkVersion());
    addEventListener('online', () => { this.flush(); this.checkVersion(); });
  }

  setProgress(section, floor, work, value) {
    this.commit({ action: 'setProgress', section, floor, work, value: clampPct(value) });
  }
  addJournal(entry) {
    const e = { ...entry, id: 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), qty: Number(entry.qty) || 0 };
    this.commit({ action: 'addJournal', entry: e });
    return e;
  }
  updateJournal(entry) { this.commit({ action: 'updateJournal', entry: { ...entry, qty: Number(entry.qty) || 0 } }); }
  deleteJournal(id) { this.commit({ action: 'deleteJournal', id }); }
}

export function normFin(f) {
  const exp = (f.expenses || []).map((e) => ({ ...e, sum: money(e.sum), date: e.date || findDate(e.basis) || '', cat: e.cat || 'Прочее' }));
  return {
    expenses: exp,
    advances: (f.advances || []).map((a) => ({ ...a, sum: money(a.sum) })),
    income: (f.income || []).map((a) => ({ ...a, sum: money(a.sum) })),
    nominated: f.nominated || [],
    personal: (f.personal || []).map((a) => ({ ...a, sum: money(a.sum) })),
    tools: f.tools || [],
    contract: f.contract || [],
    summary: f.summary || null,
    partial: !!f.partial,
  };
}

Object.assign(Store.prototype, {
  /** Значение из «Формулы оплаты» по первой букве/началу подписи: 'D', 'E', 'B', 'С', 'А', 'удерж', 'Зачёт', 'Компенс' */
  contractValue(key) {
    const k = key.toLowerCase();
    const row = this.fin.contract.find((c) => {
      const l = c.label.toLowerCase().replace(/^[\s]+/, '');
      return k.length === 1 ? (l[0] === k || l[0] === ({ a: 'а', c: 'с' })[k]) && /^.\s*-/.test(l) : l.includes(k);
    });
    return row ? row.value : null;
  },
  expensesOn(date) { return this.fin.expenses.filter((e) => e.date === date); },
  expenseTotal(list = this.fin.expenses) { return list.reduce((a, e) => a + e.sum, 0); },
  /** Итоги по категориям: из сводки листа «Счета» (снимок) или из строк */
  byCategory() {
    if (this.fin.summary && this.fin.partial) return this.fin.summary.cats;
    const r = {};
    for (const c of EXPENSE_CATS) r[c] = 0;
    for (const e of this.fin.expenses) r[e.cat] = (r[e.cat] || 0) + e.sum;
    return r;
  },
  byMonth(list = this.fin.expenses) {
    const r = {};
    for (const e of list) {
      if (!e.date) continue;
      const k = e.date.slice(0, 7);
      (r[k] ||= {})[e.cat] = (r[k][e.cat] || 0) + e.sum;
    }
    return r;
  },
  addExpense(e) {
    const x = { ...e, sum: money(e.sum), local: !this.connected, app: true, id: 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) };
    this.commit({ action: 'addExpense', entry: x });
    return x;
  },
  /** Изменить любую строку «Счета» (по id строки, с проверкой на сервере) */
  updateExpense(e) {
    const prev = this.fin.expenses.find((x) => x.id === e.id) || {};
    this.commit({ action: 'updateExpense', entry: { ...e, sum: money(e.sum) }, expect: { sum: prev.sum, who: prev.who } });
  },
  /** Удалить можно только расход, добавленный из приложения */
  deleteExpense(id) { this.commit({ action: 'deleteExpense', id }); },
});

function clampPct(v) {
  const n = Number(String(v).replace(',', '.').replace('%', ''));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}
