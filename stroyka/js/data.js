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
export let BY_EXPENSES = false;     // в таблице объекта только расходы (частей с объёмами нет)
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
    part: /^объект$/i.test(p.one) ? '' : p.one, partL: /^объект$/i.test(p.one) ? '' : p.one.toLowerCase(), partGen: p.gen, partAcc: p.acc, parts: p.pl, partsL: p.pl.toLowerCase(), partShort: p.short,
    level: l.one, levelL: l.one.toLowerCase(), levelGen: l.gen, levelAcc: l.acc, levels: l.pl, levelsL: l.pl.toLowerCase(), levelShort: l.short,
    levelsDat: DAT_PL[l.pl] || l.pl.toLowerCase(), object: PROFILE.name || objName,
  };
}

/** Тип объекта: из листа «Проект» (Тип объекта), иначе по слову частей и виду уровней */
function detectType(prj, parts) {
  const numeric = parts.some((p) => (p.levels || []).length) && parts.every((p) => (p.levels || []).every((l) => typeof l.key === 'number'));
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
  BY_EXPENSES = !!st.byExpenses;
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
  const st = { byExpenses: !!structure.byExpenses, sections: parts.map((p) => p.id), profile: { type, name: prj.name || '', part: prj.part || 'Секция', level: prj.level || 'Этаж' } };
  if (type === 'mkd') {
    st.layout = 'stack';
    st.top = Math.max(...parts.map((x) => Number(x.floors) || 0)) || 16;
  } else {
    st.layout = type === 'industrial' ? 'hall' : 'plan';
    const levels = [], idx = new Map();
    st.partLevels = {};
    for (const p of parts) {
      st.partLevels[p.id] = [];
      // у части нет уровней (например, в таблице только расходы) — один уровень «весь объект», чтобы часть была на модели
      const lv = (p.levels || []).length ? p.levels : [{ key: 'Весь объект', label: 'Весь объект' }];
      for (const l of lv) {
        const k = String(l.key);
        if (!idx.has(k)) { idx.set(k, levels.length); levels.push({ key: l.key, label: String(l.label) }); }
        st.partLevels[p.id].push(idx.get(k));
      }
    }
    st.levels = levels;
  }
  let prev = null; try { prev = JSON.parse(localStorage.getItem(STRUCT_KEY) || 'null'); } catch { /* */ }
  const sig = (x) => JSON.stringify([x.sections, x.layout, x.top || 0, x.profile, x.levels || [], x.partLevels || {}, !!x.byExpenses]);
  const cur = prev || { sections: SECTIONS, layout: LAYOUT, top: LAYOUT === 'stack' ? TOP : 0, profile: PROFILE };
  const changed = sig(st) !== sig(cur);
  try { localStorage.setItem(STRUCT_KEY, JSON.stringify(st)); } catch { /* */ }
  setStructure(st);
  return changed;
}
/** Виды работ проекта (не МКД) — из строк объёмов, в порядке таблицы */
export function setWorks(list) { WORKS = sortWorks(list); }

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
// Разделы работ: любой вид работ из таблицы попадает в раздел по ключевым словам (или по листу «Разделы» объекта).
// Порядок важен: «Штукатурка фасада» — Фасад, а не Отделка; «Внутр. СКЦ» — Перегородки.
const W = (s) => new RegExp(s, 'i');
const NB = '(?![а-яёa-z])', NA = '(?:^|[^а-яёa-z])';
export const WORK_SECTIONS = [
  ['Каркас', W(`фундам|монолит|бетон|каркас|металлоконстр|армир|колонн|перекрыт|ростверк|сва[яиё]|земляны|котлован`)],
  ['Наружные стены', W(`наруж|кирпич|кладка\\s+(наружн|стен)`)],
  ['Фасад', W(`фасад|утепл|облицов|навесн|клинкер|сайдинг`)],
  ['Окна и двери', W(`${NA}окн|окон|витраж|двер|остеклен|пвх${NB}`)],
  ['Кровля', W(`кровл|кровел|водосток|парапет`)],
  ['Перегородки', W(`перегород|гкл|гипсокарт|пгп|внутр\\.?\\s*(скц|гб|стен|кладк|газоб|кирпич)|${NA}скц|${NA}гб${NB}`)],
  ['Электрика', W(`электр|${NA}эом|${NA}эм${NB}|кабел|освещ|${NA}щит|розет|выключат|заземл|молниезащ`)],
  ['Вода и канализация', W(`водо|${NA}вк${NB}|канализ|сантех|${NA}хвс|${NA}гвс|стояк|унитаз|ванн|смесител|дренаж`)],
  ['Отопление и вентиляция', W(`отопл|${NA}ов${NB}|вентил|кондиц|${NA}итп|радиатор|теплоснаб|тепловой\\s+узел|дымоход|газоснаб`)],
  ['Связь и слаботочка', W(`слаботоч|связ|интернет|домофон|${NA}скуд|видеонабл|телевид|${NA}сс${NB}|${NA}скс|диспетчер|антенн`)],
  ['Пожарная безопасность', W(`пожар|${NA}апс|соуэ|дымоудал|спринкл|огнезащ|противопож`)],
  ['Лифты', W(`лифт|эскалат`)],
  ['Отделка', W(`отделк|штукатур|шпатл|покраск|окраск|${NA}обо[иея]|плитк|стяжк|${NA}пол(ы|а|ов)?${NB}|потол|ламинат|керамогран|малярн|наливн|линолеум|паркет|чистов|черновая`)],
  ['Инженерка', W(`инженер`)],
  ['Благоустройство', W(`благоустр|озелен|асфальт|бордюр|мощен|${NA}маф${NB}|тротуар|газон|ограждени`)],
];
let WORK_MAP = [];   // из листа «Разделы» объекта: [{ match: 'кабель', section: 'Электрика' }]
export function setWorkMap(list) { WORK_MAP = (list || []).map((x) => ({ match: String(x.match || '').toLowerCase().trim(), section: String(x.section || '').trim() })).filter((x) => x.match && x.section); }
/** Вид работ из таблицы → раздел приложения. Ничего не теряется: не распознанное — отдельным разделом под своим именем. */
export function workGroup(work, floor) {
  const w = String(work || '').toLowerCase();
  if (!w.trim()) return null;
  const own = WORK_MAP.find((x) => w.includes(x.match));
  if (own) return own.section;
  if (LAYOUT === 'stack' && floor === ROOF) return 'Кровля';
  const hit = WORK_SECTIONS.find(([, re]) => re.test(w));
  return hit ? hit[0] : cleanWork(work) || null;
}
/** Единица измерения из названия: «Кабель, м» → «м» */
export function workUnit(work) { const m = String(work || '').match(/,\s*([^,]+?)\.?\s*$/); return m ? m[1].toLowerCase().replace(/\s+/g, '') : ''; }
/** Порядок разделов: как в справочнике, затем свои */
export function sortWorks(list) {
  const order = WORK_SECTIONS.map(([n]) => n);
  return [...new Set(list)].sort((a, b) => { const i = order.indexOf(a), j = order.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b, 'ru'); });
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
/** Лист «Документы» самостоятельного объекта (строка = часть × уровень × вид работ) → тот же вид, что docsFromRows */
export function docsFromList(list) {
  const out = [];
  for (const x of list || []) {
    const floor = fromKey(x.level);
    if (floor === null) continue;
    const work = workGroup(x.work, floor) || x.work;
    out.push({ floor, work, label: `${x.work}`, row: x.row, sheet: x.sheet, [String(x.section)]: { is: x.is || '', aosr: x.aosr || '', rem: x.rem || '', cols: { is: 4, aosr: 5, rem: 6 } } });
  }
  return out;
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
/** «7–9, 12», «Все», «Кровля», «Подвал»/«ТП» → уровни приложения; null — не указано, 'all' — все */
export function levelsIn(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (/^все/i.test(t)) return 'all';
  const out = new Set();
  for (const tok of t.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
    if (LAYOUT !== 'stack') { const i = fromKey(tok); if (i != null) out.add(i); else floorsInText(tok).forEach((f) => out.add(f)); continue; }
    const r = tok.match(/^(\d{1,2})\s*(?:[–\-—]|по)\s*(\d{1,2})/);
    if (r) { for (let i = +r[1]; i <= +r[2]; i++) out.add(i); continue; }
    if (/^(подвал|тп|техпод)/i.test(tok)) { out.add(0); continue; }
    if (/^кровл/i.test(tok)) { out.add(ROOF); continue; }
    const n = parseInt(tok, 10); if (Number.isFinite(n)) out.add(n);
  }
  return [...out];
}
/** «4, 5», «Секция 4», «Все» → список частей */
export function sectionsIn(text) {
  const t = String(text ?? '').trim();
  if (!t) return [];
  if (/^все/i.test(t)) return SECTIONS.slice();
  return t.split(/[,;]+/).map((x) => x.trim().replace(/^[а-яё.]+\s+/i, '')).filter((x) => SECTIONS.includes(x));
}
/** Уровни в столбце «Этаж» компактно: [7,8,9,12] → «7–9, 12» */
export function levelsText(list) {
  if (LAYOUT !== 'stack') return list.map((f) => floorName(f)).join(', ');
  const name = (f) => (f === 0 ? 'Подвал' : f === ROOF ? 'Кровля' : String(f));
  const a = [...list].sort((x, y) => x - y), out = [];
  for (let i = 0; i < a.length; i++) {
    let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1 && a[j + 1] !== ROOF && a[i] !== 0) j++;
    out.push(j - i >= 2 ? `${a[i]}–${a[j]}` : j > i ? `${name(a[i])}, ${name(a[j])}` : name(a[i]));
    i = j;
  }
  return out.join(', ');
}
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
  const out = [...res].filter((f) => f >= 1 && f <= TOP);
  if (/кровл|кровел|парапет|надстройк/i.test(s)) out.push(ROOF);   // «кладка на кровле», «парапет» — кровля
  if (/подвал/i.test(s)) out.push(0);
  return out;
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
const dayMs = 864e5;
const isoN = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export function dayDiff(a, b) { return Math.round((isoN(b) - isoN(a)) / dayMs); }
export function addDays(d, n) { const t = new Date(isoN(d) + n * dayMs); return t.toISOString().slice(0, 10); }
const norm = (x) => String(x || '').trim().toLowerCase().replace(/\s+/g, ' ');
/** Процент раздела: по стоимости строк, если есть; при одной единице измерения — по объёму; иначе среднее строк (метры кабеля и штуки розеток не складываются) */
function groupPct(g) {
  const items = g.items;
  const p = (it) => Math.min(1, (it.done || 0) / it.total) * 100;
  if (items.every((it) => it.cost > 0)) return items.reduce((a, it) => a + p(it) * it.cost, 0) / items.reduce((a, it) => a + it.cost, 0);
  const units = new Set(items.map((it) => workUnit(it.work)));
  if (units.size <= 1) return (g.done / g.total) * 100;
  return items.reduce((a, it) => a + p(it), 0) / items.length;
}
/** Ключи уровней из таблиц → номера уровней приложения (один раз, при загрузке) */
function mapFloors(e) {
  if (!e) return;
  for (const k of ['orders', 'gpr']) for (const v of e[k] || []) if (v && 'level' in v) v.floor = v.level === null || v.level === '' ? null : fromKey(v.level);
  for (const k of ['volumes', 'floorStatus', 'worklog', 'moves', 'plan', 'discrepancies', 'acts']) for (const v of e[k] || []) if (v && 'floor' in v) v.floor = fromKey(v.floor);
}

/** «СКЦ 160 мм / ПОЛИГРАН 160 ПГ C50», «ПОЛИГРАН 160» → «СКЦ 160»; «Газобетон 100 мм · КСМ» → «Газобетон 100» */
/** «СТД Петрович (БЦК)» → ['стд', 'петрович', 'бцк']: слова поставщика для поиска в накладной */
function supplierWords(sup) { return norm(sup).split(/[^a-zа-яё0-9]+/).filter((w) => w.length >= 3).map((w) => w.slice(0, 7)); }
/** «Пара перчаток», «перчатки 2 пары» → один ключ; «Диск алмазный 230» = «алмазный диск 230» */
export function consKey(name) {
  return String(name || '').toLowerCase().replace(/ё/g, 'е').replace(/[×*х](?=\d)|(?<=\d)[×*х]/g, 'x').split(/[^a-zа-я0-9x.]+/)
    .filter((w) => w && !/^(пара|пары|пар|шт|штук|с|и|для)$/.test(w)).map((w) => (/^\d/.test(w) ? w : w.slice(0, 5))).sort().join(' ');
}
export function materialKey(name) {
  const s = String(name || '').toLowerCase();
  const size = (s.match(/(\d{2,3})\s*(?:мм|пг|\b)/) || [])[1];
  if (/скц|полигран|камень/.test(s)) return `СКЦ ${size || ''}`.trim() + (/полнотел/.test(s) ? ' полнотелый' : /пустотел/.test(s) ? ' пустотелый' : '');
  if (/газобет|газобл|(?<![а-яё])гб(?![а-яё])/.test(s)) return `Газобетон ${size || ''}`.trim();
  if (/клей/.test(s)) return 'Клей';
  if (/цпс|пескобет|смесь/.test(s)) return 'ЦПС';
  return String(name || '').trim();
}

/** Запись относится к части и уровню: по столбцам «Секция»/«Этаж» (можно «4, 5», «7–9», «Все»), иначе — старым способом */
/** Замечание/поручение про численность людей — к этажам не относится, показывается отдельно */
export function isPeopleItem(r) {
  if (r.tp) return /^люд|численн|персонал/i.test(r.tp);
  return /количеств\S* людей|численност|людей на секц|\d+\s*чел(?![а-яё])/i.test(`${r.short || ''} ${r.text || ''}`);
}
function placeMatch(secText, levelText, section, floor, fallback) {
  const lv = levelsIn(levelText);
  if (lv === null) return fallback();
  const secs = sectionsIn(secText);
  if (!secs.includes(String(section))) return false;
  return lv === 'all' ? levelsOf(section).includes(floor) : lv.includes(floor);
}
export class Store {
  constructor() {
    const cfg = LS.get('stroyka.cfg', {});
    this.obj = LS.get('stroyka.obj', '');
    this.finKey = LS.get('stroyka.fin', '');   // вход руководителя (выдаёт сервер после пароля)   // выбранный объект — ID его таблицы объёмов ('' — по умолчанию)
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

  /** Ключ руководителя — только своему серверу (у Google-скрипта напрямую заголовков нет) */
  finHeaders() {
    try { if (this.finKey && new URL(this.url, location.href).origin === location.origin) return { 'X-Fin': this.finKey }; } catch { /* */ }
    return {};
  }
  /** Вход руководителя: финансы и управление объектами */
  async login(password) {
    const res = await this.post({ action: 'login', password, obj: this.obj || '' });
    this.finKey = res.fin; LS.set('stroyka.fin', this.finKey);
    if (res.data && res.data.ok) {   // сервер сразу отдал свою свежую копию с финансами — не ждём Google
      this.apply(res.data);
      for (const op of this.queue) if ((op.obj || '') === (this.obj || '')) this.applyLocal(op);
      this.emit('data');
      this.load(true);   // а свежие данные из таблиц — в фоне
    } else await this.load();
  }
  logout() { this.finKey = ''; LS.set('stroyka.fin', ''); this.load(); }
  async changeFinPassword(password) { const res = await this.post({ action: 'finPassword', password }); this.finKey = res.fin; LS.set('stroyka.fin', this.finKey); }
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
        const r = await fetch(u.toString(), { redirect: 'follow', headers: this.finHeaders() });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || 'Ошибка Apps Script');
        const before = this.progress.size ? this.digest() : null;
        this.apply(data);
        if (before) {
          const ch = this.diffDigest(before, this.digest());
          if (ch.length) { this.addLog({ dir: 'in', status: 'ok', text: 'Из таблиц: ' + ch.join('; ') }); this.emit({ type: 'incoming', text: ch.join('; ') }); }
        }
        this.stale = data.stale ? (data.staleAt || 'да') : null;
        this.staleWhy = data.stale ? data.staleWhy || '' : '';
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
    this.docs = data.docsList ? docsFromList(data.docsList) : docsFromRows(this.docsRows, this.docsHead);
    this.remarks = (data.remarks || []).map((r) => (r.level !== undefined ? { ...r, floor: fromKey(r.level) } : r));
    this.objInfo = data.object || null;
    this.finLocked = !!data.finLocked;   // вид для рабочих: сервер не прислал финансы
    this.expSheet = data.object && data.object.mode === 'book' ? 'Расходы' : 'Счета';
    this.fin = normFin(data.fin || {});
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
    this.extra = { volumes: e.volumes || [], moves: e.moves || [], worklog: e.worklog || [], floorStatus: e.floorStatus || [], plan: e.plan || [], discrepancies: e.discrepancies || [], inventory: e.inventory || [], sources: e.sources || [], structure: e.structure || null, objects: e.objects || [], object: e.object || '', template: e.template || '', registry: e.registry || '', brigades: e.brigades || [], acts: e.acts || [], handbook: e.handbook || { contractors: [], norms: {}, works: [] }, orders: e.orders || [], orderTemplates: e.orderTemplates || [], consumables: e.consumables || [], gpr: e.gpr || [], materials: e.materials || [] };
    this.vol = new Map();
    setWorkMap(e.structure && e.structure.workMap);
    const groups = this.extra.volumes.filter((v) => v.total > 0 && v.floor != null).map((v) => workGroup(v.work, Number(v.floor))).filter(Boolean);
    if (groups.length) setWorks(groups); else if (PROFILE.type === 'mkd') setWorks(MKD_WORKS);
    for (const v of this.extra.volumes) {
      if (v.floor === null || v.floor === undefined) continue;
      const g = workGroup(v.work, Number(v.floor));
      if (!g || !(v.total > 0)) continue;
      const k = `${v.section}|${Number(v.floor)}`;
      const fl = this.vol.get(k) || {};
      const grp = (fl[g] ||= { total: 0, done: 0, cost: 0, items: [] });
      grp.total += v.total; grp.done += Math.min(v.done || 0, v.total); grp.cost += v.cost || 0; grp.items.push(v);
      this.vol.set(k, fl);
    }
    for (const fl of this.vol.values()) for (const g of Object.values(fl)) g.pct = groupPct(g);
  }
  // ---------- поручения руководителя ----------
  isOpenOrder(o) { return !/выполн|отмен/i.test(o.status || '') && !o.done; }
  ordersFor(section, floor) { return (this.extra.orders || []).filter((o) => !isPeopleItem(o) && placeMatch(o.sectionText ?? o.section, o.levelText, section, floor, () => String(o.section) === String(section) && o.floor === floor)); }

  // ---------- ГПР: план против факта ----------
  /** Этаж по графику: плановые даты, передача этажа (сдвиг), ожидаемый и фактический %, отставание в днях */
  scheduleOf(section, floor) {
    const rows = (this.extra.gpr || []).filter((g) => String(g.section) === String(section) && g.floor === floor);
    if (!rows.length) return null;
    const today = isoToday();
    const ho = this.handoverOf(section, floor);
    const act = this.handoverAct(section, floor);
    const recv = (ho && ho.date) ? { date: ho.date, src: '«Выполнение»' } : act ? { date: act.date, src: `акт ${act.number || ''}`.trim(), act } : null;
    const items = rows.map((r) => {
      // передача этажа: «Выполнение» (столбец A) → акт передачи (VUP CORE) → лист «ГПР»
      const received = (recv && recv.date) || r.received || '';
      const shift = received ? Math.max(0, dayDiff(r.start, received)) : (r.shift || 0);
      const s2 = addDays(r.start, shift), e2 = addDays(r.end, shift);
      const dur = Math.max(1, dayDiff(s2, e2));
      const fact = this.gprFact(section, floor, r.work);
      const expected = Math.max(0, Math.min(100, (dayDiff(s2, today) / dur) * 100));
      let lag = null, status;
      if (fact != null && fact >= 99.5) status = 'готово';
      else if (today < s2) status = 'по графику ещё не начат';
      else { lag = dayDiff(addDays(s2, Math.round(((fact || 0) / 100) * dur)), today); status = lag <= 0 ? 'в графике' : lag <= 7 ? 'небольшое отставание' : 'отставание'; }
      return { ...r, received, shift, s2, e2, fact, expected, lag, status };
    });
    const worst = items.filter((x) => x.lag != null).sort((a, b) => b.lag - a.lag)[0];
    const main = items.find((x) => /кладк/i.test(x.work)) || items[0];
    return { rows: items, start: items.map((x) => x.start).sort()[0], s2: items.map((x) => x.s2).sort()[0], e2: items.map((x) => x.e2).sort().pop(),
      shift: Math.max(0, ...items.map((x) => x.shift || 0)), received: items.map((x) => x.received).filter(Boolean).sort()[0] || '', handover: ho,
      receivedSrc: recv ? recv.src : items.some((x) => x.received) ? 'лист «ГПР»' : '',
      fact: main.fact, expected: main.expected, lag: worst ? worst.lag : null, status: items.every((x) => x.status === 'готово') ? 'готово' : worst ? worst.status : main.status };
  }
  /** Дата передачи этажа из «Выполнения» (столбец A первой строки этажа) и где её писать */
  handoverOf(section, floor) {
    const items = this.extra.volumes.filter((v) => String(v.section) === String(section) && v.floor === floor);
    const it = items.find((v) => v.handover) || items[0];
    if (!it) return null;
    const m = String(it.handover || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    const iso = m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
    return { date: iso, raw: it.handover || '', sheet: it.sheet, row: it.floorRow || it.row };
  }
  /** Акт передачи этажа из VUP CORE «Акты стройки» (самый ранний по этому этажу) */
  handoverAct(section, floor) {
    return (this.extra.acts || []).filter((a) => String(a.section) === String(section) && a.floor === floor && a.date).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }
  /** Передача этажей по секции: план (начало по ГПР) и факт с источником */
  handoverTable(section) {
    const floors = [...new Set((this.extra.gpr || []).filter((g) => String(g.section) === String(section) && g.floor != null).map((g) => g.floor))].sort((a, b) => a - b);
    return floors.map((f) => { const g = this.scheduleOf(section, f); return { floor: f, plan: g.start, fact: g.received, src: g.receivedSrc, shift: g.received ? dayDiff(g.start, g.received) : null }; });
  }
  /** Факт по строке ГПР: кладка → наружные стены + перегородки, обстройка шахт → инженерка, надстройка → кровля; иначе — раздел по названию */
  gprFact(section, floor, work) {
    const w = String(work || '').toLowerCase();
    const groups = /шахт/.test(w) ? ['Инженерка'] : /кровл|надстрой/.test(w) ? ['Кровля'] : /кладк/.test(w) && PROFILE.type === 'mkd' ? ['Наружные стены', 'Перегородки'] : [workGroup(work, floor)];
    const vals = groups.map((g) => this.get(section, floor, g)).filter((v) => v != null);
    if (vals.length) return vals.reduce((a, v) => a + v, 0) / vals.length;
    return this.floorValue(section, floor, 'avg');
  }
  /** Секция по графику: какие этажи должны идти сейчас, что фактически, максимальное отставание и сдвиги передачи */
  sectionSchedule(section) {
    const floors = [...new Set((this.extra.gpr || []).filter((g) => String(g.section) === String(section) && g.floor != null).map((g) => g.floor))].sort((a, b) => a - b);
    if (!floors.length) return null;
    const today = isoToday();
    const sch = floors.map((f) => ({ f, ...this.scheduleOf(section, f) }));
    const now = sch.filter((x) => x.s2 <= today && today <= x.e2).map((x) => x.f);
    const shouldDone = sch.filter((x) => x.e2 < today).map((x) => x.f);
    const done = sch.filter((x) => x.fact != null && x.fact >= 90).map((x) => x.f);
    const doneByPlan = sch.filter((x) => x.e2 < today).length;
    const inWork = sch.filter((x) => x.fact != null && x.fact > 0 && x.fact < 90).map((x) => x.f);
    const late = sch.filter((x) => x.lag != null && x.lag > 0);
    const worst = late.sort((a, b) => b.lag - a.lag)[0] || null;
    const shifted = sch.filter((x) => x.shift > 0);
    const end = (this.extra.gpr || []).filter((g) => String(g.section) === String(section)).map((g) => g.end2 || g.end).sort().pop();
    // накопленный график секции: сколько % (по стоимости, иначе по длительности) должно быть сделано к дате — против факта
    const items = sch.flatMap((x) => x.rows || []);
    const wsum = items.reduce((a, r) => a + (r.cost || r.days || 1), 0) || 1;
    const planAt = (d, adj) => items.reduce((a, r) => { const s0 = adj ? r.s2 : r.start, e0 = adj ? r.e2 : r.end; const k = Math.max(0, Math.min(1, dayDiff(s0, d) / Math.max(1, dayDiff(s0, e0)))); return a + k * (r.cost || r.days || 1); }, 0) / wsum * 100;
    const factPct = items.reduce((a, r) => a + ((r.fact || 0) / 100) * (r.cost || r.days || 1), 0) / wsum * 100;
    const lagBy = (adj) => { const first = items.map((r) => (adj ? r.s2 : r.start)).sort()[0]; if (!first) return 0; let d = today; while (d > first && planAt(d, adj) > factPct + 0.05) d = addDays(d, -1); return Math.max(0, dayDiff(d, today)); };
    const planPct = planAt(today, false), planPctAdj = planAt(today, true);
    const lagContract = lagBy(false), lagAdjusted = lagBy(true);
    return { planPct, planPctAdj, factPct, lagContract, lagAdjusted, floors, sch, now, shouldDone, doneByPlan, done, inWork, worst, maxLag: worst ? worst.lag : 0, shifted, maxShift: Math.max(0, ...sch.map((x) => x.shift || 0)), end };
  }

  /** Расценка строки объёма: из самой строки («Расценка») или из «Справочника» по исполнителю и виду работ */
  rateOf(v) {
    if (v.rate) return v.rate;
    const c = (this.extra.handbook.contractors || []).find((x) => norm(x.name) === norm(v.contractor));
    return c ? (c.rates[v.work] || c.rates[Object.keys(c.rates).find((k) => norm(k) === norm(v.work))] || 0) : 0;
  }
  /** Бригады: «Справочник» (исполнители, расценки, телефон) + столбец «Исполнитель» в объёмах + лист «Бригады» (численность).
   *  Для каждой — где работает и сколько сделано (и на какую сумму — у руководителя). */
  brigadeStats() {
    const map = new Map();
    const get = (name) => { const k = norm(name); if (!map.has(k)) map.set(k, { name: String(name).trim(), rows: [], people: 0, rates: {}, phone: '', type: '', section: '', works: '', note: '', sheetRow: 0 }); return map.get(k); };
    for (const c of this.extra.handbook.contractors || []) Object.assign(get(c.name), { rates: c.rates, phone: c.phone, hbRow: c.row, people: c.people || 0, type: c.type || '', section: c.section || '' });
    for (const b of this.extra.brigades || []) Object.assign(get(b.name), { people: b.people, type: b.type, section: b.section, works: b.works, note: b.note, sheetRow: b.row });
    for (const v of this.extra.volumes) if (v.contractor && v.total > 0) get(v.contractor).rows.push(v);
    return [...map.values()].map((b) => {
      const byWork = {};
      let earned = 0, priced = false;
      for (const v of b.rows) {
        const w = (byWork[v.work] ||= { work: v.work, total: 0, done: 0 });
        w.total += v.total; w.done += Math.min(v.done || 0, v.total);
        const r = this.rateOf(v); if (r) { priced = true; earned += Math.min(v.done || 0, v.total) * r; }
      }
      const floors = [...new Set(b.rows.map((v) => `${v.section}|${v.floor}`))];
      return { ...b, byWork: Object.values(byWork), floors, earned: priced ? earned : null };
    }).sort((a, b) => (b.rows.length - a.rows.length) || (b.people - a.people) || a.name.localeCompare(b.name, 'ru'));
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
    if (g) return Math.round(g.pct);
    const p = this.progress.get(key(section, floor, work));
    return p ? p.value : null;   // нет данных — не 0 и не оценка
  }
  /** work = 'avg' → среднее по видам работ этажа; иначе конкретный вид (null если не применим) */
  floorValue(section, floor, work = 'avg') {
    const works = this.worksFor(section, floor);
    if (work !== 'avg') return works.includes(work) ? this.get(section, floor, work) : null;
    // разделы весят по стоимости, если она есть в таблице у всех; иначе — поровну
    const rows = works.map((w) => ({ v: this.get(section, floor, w), c: (this.volumeGroup(section, floor, w) || {}).cost || 0 })).filter((x) => x.v != null);
    if (!rows.length) return null;
    const byCost = rows.every((x) => x.c > 0);
    const wsum = rows.reduce((a, x) => a + (byCost ? x.c : 1), 0);
    return rows.reduce((a, x) => a + x.v * (byCost ? x.c : 1), 0) / wsum;
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
    // у самостоятельного объекта уровень замечания указан явно; у Glorax — ищется в тексте («6 эт.»)
    return this.remarks.filter((r) => !isPeopleItem(r) && placeMatch(r.section, r.levelText, section, floor, () => String(r.section) === section && (r.floor !== undefined ? r.floor === floor : floorsInText(r.short + ' ' + r.text).includes(floor))));
  }
  /** Требования генподрядчика по людям (не по этажам): «Увеличить количество людей. Секция 4» */
  peopleRemarks() { return this.remarks.filter((r) => isPeopleItem(r)); }
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
  // ---------- материалы: пересчёт поддонов в м² / м³ и потребность ----------
  /** Норма материала из листа «Материалы»: по ключу материала; если в названии/документе подачи есть поставщик
   *  («ТН КСМ», «Лентехстром») — строка этого поставщика, иначе первая строка с заполненной нормой */
  normOf(material, hint = '') {
    const k = materialKey(material);
    const rows = (this.extra.materials || []).filter((m) => materialKey(m.name) === k);
    if (!rows.length) return null;
    const h = norm(`${material} ${hint}`);
    const bySup = h && rows.find((m) => supplierWords(m.supplier).some((w) => h.includes(w)));
    return bySup || rows.find((m) => m.m2 || m.m3) || rows[0];
  }
  /** Поддоны → объём в единицах вида работ (м² стены или м³) */
  palletsTo(material, pallets, hint = '') {
    const n = this.normOf(material, hint);
    if (!n) return null;
    const unit = workUnit(n.work) || 'м²';
    const per = /м³|м3|куб/.test(unit) ? n.m3 : n.m2;
    return per ? { qty: pallets * per, unit, per, work: n.work, supplier: n.supplier || '', m3: pallets * (n.m3 || 0), price: n.price || 0 } : null;
  }
  /** Потребность по секции: сколько осталось сделать по каждому виду работ и сколько это поддонов каждого подходящего материала */
  demand(section) {
    const stock = this.stock();
    const out = [];
    const works = [...new Set((this.extra.materials || []).map((m) => m.work).filter(Boolean))];
    for (const w of works) {
      const vols = this.extra.volumes.filter((v) => String(v.section) === String(section) && v.work === w);
      if (!vols.length) continue;
      const left = vols.reduce((a, v) => a + Math.max(0, v.total - Math.min(v.done || 0, v.total)), 0);
      const total = vols.reduce((a, v) => a + v.total, 0);
      const unit = workUnit(w);
      const all = (this.extra.materials || []).filter((m) => m.work === w);
      const mats = all.filter((m) => m.m2 || m.m3 || !all.some((o) => o !== m && materialKey(o.name) === materialKey(m.name) && (o.m2 || o.m3))).map((m) => {
        const per = /м³|м3|куб/.test(unit) ? m.m3 : m.m2;
        const st = stock.find((r) => r.material === materialKey(m.name));
        return { ...m, per, need: per ? left / per : null, onSite: st ? Math.max(0, st.left) : 0 };
      });
      out.push({ work: w, unit, total, left, mats });
    }
    return out;
  }
  // ---------- расходники: средний расход, остаток, на сколько хватит, что заказать ----------
  /** weeks — на сколько недель вперёд считать потребность */
  consumables(weeks = 4) {
    const rows = (this.extra.consumables || []).filter((r) => r.name);
    if (!rows.length) return null;
    const today = isoToday();
    const isOut = (r) => /выдач|выдал|расход/i.test(r.type), isIn = (r) => /приход|поступ|купл/i.test(r.type), isInv = (r) => /остат|пересч|инвент/i.test(r.type),
      isReq = (r) => /заявк|потреб|заказ/i.test(r.type), isBack = (r) => /возвр/i.test(r.type), isLent = (r) => /занял|в долг|долг|одолж/i.test(`${r.note} ${r.type}`);
    const outs = rows.filter((r) => isOut(r) && r.date);
    const start = outs.map((r) => r.date).sort()[0] || today;
    const days = Math.max(7, dayDiff(start, today) + 1);   // период учёта: с первой выдачи (не меньше недели)
    const items = new Map();
    for (const r of rows) {
      const k = consKey(r.name);
      if (!items.has(k)) items.set(k, { key: k, name: r.name, unit: r.unit || 'шт', rows: [], who: {}, used: 0, lent: {}, back: {} });
      const it = items.get(k); it.rows.push(r); if (r.unit && !it.unit) it.unit = r.unit;
      if (isOut(r) && isLent(r)) it.lent[r.who || '—'] = (it.lent[r.who || '—'] || 0) + r.qty;
      else if (isOut(r)) { it.used += r.qty; it.who[r.who || 'не указано'] = (it.who[r.who || 'не указано'] || 0) + r.qty; }
      if (isBack(r)) it.back[r.who || '—'] = (it.back[r.who || '—'] || 0) + r.qty;
    }
    const list = [...items.values()].map((it) => {
      const perWeek = (it.used / days) * 7;
      // остаток: последний пересчёт + приход и возвраты после него − выдачи после него
      const inv = it.rows.filter((r) => isInv(r) && r.date).sort((a, b) => a.date.localeCompare(b.date)).pop();
      const after = (r) => !inv || (r.date && r.date > inv.date);
      let stock = null;
      if (inv || it.rows.some(isIn)) stock = (inv ? inv.qty : 0) + it.rows.filter((r) => (isIn(r) || isBack(r)) && after(r)).reduce((a, r) => a + r.qty, 0) - it.rows.filter((r) => isOut(r) && after(r)).reduce((a, r) => a + r.qty, 0);
      const req = it.rows.filter((r) => isReq(r)).sort((a, b) => (a.date || '').localeCompare(b.date || '')).pop() || null;
      const daysLeft = stock != null && perWeek > 0 ? Math.max(0, stock) / (perWeek / 7) : null;
      const owed = Object.entries(it.lent).map(([who, q]) => [who, q - (it.back[who] || 0)]).filter(([, q]) => q > 0);
      return { ...it, perWeek, stock, inv, req, daysLeft, reqWeeks: req && perWeek > 0 ? req.qty / perWeek : null,
        need: Math.max(0, Math.ceil(perWeek * weeks - Math.max(0, stock || 0))), owed,
        who: Object.entries(it.who).sort((a, b) => b[1] - a[1]) };
    }).sort((a, b) => (b.perWeek - a.perWeek) || a.name.localeCompare(b.name, 'ru'));
    // кто сколько берёт: по получателям, в неделю
    const byWho = {};
    for (const r of rows) if (isOut(r) && !isLent(r)) { const w = r.who || 'не указано'; ((byWho[w] ||= {})[r.name] ||= 0); byWho[w][r.name] += r.qty; }
    return { start, days, weeks, list, byWho: Object.entries(byWho).map(([who, m]) => ({ who, items: Object.entries(m).sort((a, b) => b[1] - a[1]), total: Object.values(m).reduce((a, q) => a + q, 0) })).sort((a, b) => b.total - a.total) };
  }
  // ---------- аналитика ----------
  /** Прошедшие недели из «Выполнения» (даты в шапке столбцов O…) */
  pastWeeks() {
    const today = isoToday(), set = new Set();
    for (const v of this.extra.volumes) for (const d of Object.keys(v.weekCols || v.weekly || {})) if (d <= today) set.add(d);
    return [...set].sort();
  }
  /** Вес строки объёма в готовности части: по стоимости, если она есть у всех строк, иначе поровну */
  weightsOf(vols) {
    const byCost = vols.length && vols.every((v) => v.cost > 0);
    const W = vols.reduce((a, v) => a + (byCost ? v.cost : 1), 0) || 1;
    return (v) => (byCost ? v.cost : 1) / W;
  }
  /** Темп части: прирост готовности по неделям, средний за 4 недели, прогноз окончания и сравнение с ГПР */
  pace(section) {
    const vols = this.extra.volumes.filter((v) => String(v.section) === String(section) && v.total > 0);
    if (!vols.length) return null;
    const wt = this.weightsOf(vols), today = isoToday();
    const series = this.pastWeeks().map((d) => ({ week: d, pct: vols.reduce((a, v) => a + (((v.weekly || {})[d] || 0) / v.total) * wt(v) * 100, 0) }));
    const sv = this.sectionValue(section, 'avg');   // та же готовность, что на карточке части
    const done = sv != null ? sv : vols.reduce((a, v) => a + (Math.min(v.done || 0, v.total) / v.total) * wt(v) * 100, 0);
    const last = series.slice(-4);
    const avg = last.length ? last.reduce((a, x) => a + x.pct, 0) / last.length : 0;
    const left = Math.max(0, 100 - done);
    const moving = last.filter((x) => x.pct > 0).length;   // прогноз — только когда есть хотя бы 2 недели с движением
    const weeksLeft = left <= 0.05 ? 0 : avg > 0 && moving >= 2 ? left / avg : null;
    const forecast = weeksLeft != null ? addDays(today, Math.ceil(weeksLeft * 7)) : '';
    const sch = this.sectionSchedule(section);
    const planEnd = sch ? sch.sch.map((x) => x.e2).filter(Boolean).sort().pop() || sch.end || '' : '';
    const contractEnd = sch ? sch.end || '' : '';
    const needPace = planEnd && left > 0.05 ? left / Math.max(1, dayDiff(today, planEnd) / 7) : null;
    return { section, series, done, avg, moving, left, weeksLeft, forecast, planEnd, contractEnd, needPace, delay: forecast && planEnd ? dayDiff(planEnd, forecast) : null, week: series[series.length - 1] || null };
  }
  /** Выработка бригад за 4 последние недели: объём по видам работ, на человека в неделю; начислено по расценкам */
  brigadeOutput() {
    const all = this.pastWeeks(), weeks = all.slice(-4), n = weeks.length || 1, lastW = all[all.length - 1], month = isoToday().slice(0, 7);
    return this.brigadeStats().map((b) => {
      const byWork = {};
      let m4 = 0, mWeek = 0, mMonth = 0, priced = false;
      for (const v of b.rows) {
        const r = this.rateOf(v) || 0; if (r) priced = true;
        for (const [d, q] of Object.entries(v.weekly || {})) {
          if (weeks.includes(d)) { (byWork[v.work] ||= { work: v.work, unit: workUnit(v.work), q: 0 }).q += q; m4 += q * r; }
          if (d === lastW) mWeek += q * r;
          if (d.slice(0, 7) === month) mMonth += q * r;
        }
      }
      const works = Object.values(byWork).map((x) => ({ ...x, perWeek: x.q / n, perPerson: b.people ? x.q / n / b.people : null }));
      return { name: b.name, people: b.people, type: b.type, works, weekKey: lastW, earnedWeek: priced ? mWeek : null, earned4: priced ? m4 : null, earnedMonth: priced ? mMonth : null, earned: b.earned };
    }).filter((b) => b.works.length || b.earned);
  }
  /** Расход материала по этажам: подано (поддоны → м²/м³ по норме поставщика) против уложенного по «Выполнению» */
  materialUse() {
    const rows = new Map();
    for (const m of this.extra.moves) {
      if (!/подач/i.test(m.type || '') || m.floor == null || !m.section) continue;
      const c = this.palletsTo(m.material, m.pallets || 0, `${m.doc || ''} ${m.comment || ''}`);
      const nrm = this.normOf(m.material);
      const work = c ? c.work : nrm ? nrm.work : '';
      const k = `${m.section}|${m.floor}|${norm(work) || materialKey(m.material)}`;
      const r = rows.get(k) || { section: String(m.section), floor: m.floor, work, unit: c ? c.unit : workUnit(work), pallets: 0, fed: 0, noNorm: new Set(), mats: new Set() };
      r.pallets += m.pallets || 0; r.mats.add(materialKey(m.material));
      if (c) r.fed += c.qty; else r.noNorm.add(materialKey(m.material));
      rows.set(k, r);
    }
    return [...rows.values()].map((r) => {
      const vols = r.work ? this.extra.volumes.filter((v) => String(v.section) === r.section && v.floor === r.floor && norm(v.work) === norm(r.work)) : [];
      const total = vols.reduce((a, v) => a + v.total, 0), laid = vols.reduce((a, v) => a + Math.min(v.done || 0, v.total), 0);
      const finished = total > 0 && laid >= total * 0.95;
      const over = finished && r.fed && !r.noNorm.size ? (r.fed / laid - 1) * 100 : null;
      return { ...r, mats: [...r.mats], noNorm: [...r.noNorm], total, laid, finished, over };
    }).sort((a, b) => a.section.localeCompare(b.section, 'ru', { numeric: true }) || a.floor - b.floor);
  }
  /** Деньги против графика: стоимость по ГПР — сколько должно быть сделано к сегодня и сколько сделано; начислено бригадам */
  moneyVsPlan(section) {
    const sch = this.sectionSchedule(section);
    const C = (this.extra.gpr || []).filter((g) => String(g.section) === String(section)).reduce((a, g) => a + (g.cost || 0), 0);
    const vols = this.extra.volumes.filter((v) => String(v.section) === String(section));
    const labor = vols.reduce((a, v) => a + Math.min(v.done || 0, v.total) * (this.rateOf(v) || 0), 0);
    const laborAll = vols.reduce((a, v) => a + v.total * (this.rateOf(v) || 0), 0);
    if (!C && !labor) return null;
    return { section, total: C, plan: sch && C ? (sch.planPct / 100) * C : null, planAdj: sch && C ? (sch.planPctAdj / 100) * C : null, fact: sch && C ? (sch.factPct / 100) * C : null, labor, laborAll };
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
        headers: this.finHeaders(),
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
            else rec[op.prop] = /^(sum|qty|pallets|workers|total|accepted|value|people|rate)$/.test(op.f) ? Number(String(op.value).replace(',', '.')) : op.value;
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
      const data = await (await fetch(u.toString(), { redirect: 'follow', headers: this.finHeaders() })).json();
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
