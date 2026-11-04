// Модель данных и синхронизация с Google Sheets через Apps Script (см. apps-script/Code.gs).
import { SEED_DOCS_ROWS, SEED_REMARKS, SEED_JOURNAL } from './seed.js';
import { SEED_FIN } from './seed-fin.js';
import { API_URL, API_TOKEN } from './config.js';

export const SECTIONS = ['4', '5'];
export const FLOORS = Array.from({ length: 18 }, (_, i) => i); // 0 = подвал, 1..16, 17 = кровля
export const ROOF = 17;

export function floorName(f) {
  if (f === 0) return 'Подвал';
  if (f === ROOF) return 'Кровля';
  return `${f} этаж`;
}
export function floorShort(f) {
  if (f === 0) return 'П';
  if (f === ROOF) return 'К';
  return String(f);
}
export function worksForFloor(f) {
  if (f === 0) return ['Перегородки'];
  if (f === ROOF) return ['Кровля'];
  return ['Наружные стены', 'Перегородки'];
}
export const ALL_WORKS = ['Наружные стены', 'Перегородки', 'Инженерка', 'Кровля'];
/** Вид работ из таблицы «Выполнение» → группа работ приложения */
export function workGroup(work, floor) {
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

/** Строки листа «Таблица» → документы по этажам */
export function docsFromRows(rows) {
  const out = [];
  for (const r of rows) {
    const p = parseRowLabel(r[0]);
    if (!p) continue;
    out.push({
      ...p,
      label: r[0],
      '4': { is: r[1] || '', aosr: r[3] || '', rem: r[5] || '' },
      '5': { is: r[2] || '', aosr: r[4] || '', rem: r[6] || '' },
    });
  }
  return out;
}

/** Стартовая оценка процента по документам: есть ИС/АОСР → 100, есть замечания → 50, иначе 0. */
export function estimateFromDocs(docs) {
  const list = [];
  for (const s of SECTIONS) for (const f of FLOORS) for (const w of worksForFloor(f)) {
    const d = docs.find((x) => x.floor === f && x.work === w);
    const v = d ? (d[s].is || d[s].aosr ? 100 : d[s].rem ? 50 : 0) : 0;
    list.push({ section: s, floor: f, work: w, value: v, updated: '', note: 'оценка по листу «Таблица»' });
  }
  return list;
}

/** Номера этажей, упомянутые в тексте замечания: «6 эт.», «2–5 эт.», «8–9 этаж», «1 по 15 этаж». */
export function floorsInText(text) {
  const s = String(text || '');
  const res = new Set();
  const re = /(\d{1,2})\s*(?:[–\-—]|по)\s*(\d{1,2})\s*(?:эт|этаж)|(\d{1,2})\s*(?:эт\.|этаж|эт\b)|этаж[а-я]*\s*(\d{1,2})/gi;
  let m;
  while ((m = re.exec(s))) {
    if (m[1] && m[2]) { for (let i = +m[1]; i <= +m[2]; i++) res.add(i); }
    else if (m[3]) res.add(+m[3]);
    else if (m[4]) res.add(+m[4]);
  }
  return [...res].filter((f) => f >= 1 && f <= 16);
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

export class Store {
  constructor() {
    const cfg = LS.get('stroyka.cfg', {});
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
    this.extra = { volumes: [], moves: [], worklog: [], floorStatus: [], sources: [] };
    this.vol = new Map();
    this.version = null;
    this.flushing = false;
    this.syncError = '';
  }

  get connected() { return !!this.url; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { for (const fn of this.listeners) fn(what); }

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
      if (c) { this.apply(c.data); for (const op of this.queue) this.applyLocal(op); this.emit('data'); }
    }
    try {
      if (this.connected) {
        const u = new URL(this.url);
        u.searchParams.set('action', 'all');
        if (this.token) u.searchParams.set('token', this.token);
        const r = await fetch(u.toString(), { redirect: 'follow' });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || 'Ошибка Apps Script');
        this.apply(data);
        this.stale = data.stale ? (data.staleAt || 'да') : null;
        this.cacheSave(data);
        this.version = data.v || this.version;
        for (const op of this.queue) this.applyLocal(op); // неотправленные правки не теряются
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
        for (const op of this.queue) this.applyLocal(op);
        this.cachedAt = c.at;
        this.error += ' · показана копия на устройстве от ' + new Date(c.at).toLocaleString('ru-RU');
        this.startLiveSync();
      } else if (!this.progress.size) this.loadDemo();
    }
    this.emit('data'); this.emit('status');
  }

  apply(data) {
    this.docsRows = data.docsRows || [];
    this.docs = docsFromRows(this.docsRows);
    this.remarks = data.remarks || [];
    this.fin = normFin(data.fin || {});
    this.setExtra(data.extra);
    this.journal = (data.journal || []).map((j) => ({ ...j, qty: Number(j.qty) || 0 }));
    this.progress = new Map();
    const list = data.progress && data.progress.length ? data.progress : estimateFromDocs(this.docs);
    for (const p of list) this.progress.set(key(String(p.section), Number(p.floor), p.work), { ...p, section: String(p.section), floor: Number(p.floor), value: clampPct(p.value) });
  }

  loadDemo() {
    const saved = LS.get('stroyka.demo', null);
    this.docsRows = SEED_DOCS_ROWS;
    this.docs = docsFromRows(SEED_DOCS_ROWS);
    this.remarks = SEED_REMARKS;
    this.journal = saved ? saved.journal : SEED_JOURNAL.slice();
    this.fin = normFin({ ...SEED_FIN, expenses: [...SEED_FIN.expenses, ...((saved && saved.expenses) || [])] });
    this.fin.partial = true;
    this.progress = new Map();
    const list = saved ? saved.progress : estimateFromDocs(this.docs);
    for (const p of list) this.progress.set(key(p.section, p.floor, p.work), p);
  }
  // ---------- резервные копии ----------
  cacheSave(data) {
    try { localStorage.setItem('stroyka.cache', JSON.stringify({ at: Date.now(), src: this.url, data })); } catch { /* нет места — не критично */ }
  }
  cacheLoad() {
    const c = LS.get('stroyka.cache', null);
    return c && c.src === this.url ? c : null;
  }
  /** Полная копия данных приложения (формат понимают сервер и кнопка «Восстановить») */
  snapshot() {
    return {
      extra: this.extra,
      progress: [...this.progress.values()], journal: this.journal, docsRows: this.docsRows || [], remarks: this.remarks,
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
    this.extra = { volumes: e.volumes || [], moves: e.moves || [], worklog: e.worklog || [], floorStatus: e.floorStatus || [], sources: e.sources || [] };
    this.vol = new Map();
    for (const v of this.extra.volumes) {
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
    if (fl) return ALL_WORKS.filter((w) => fl[w]);
    return worksForFloor(floor);
  }
  isVolumeBased(section, floor, work) { return !!this.volumeGroup(section, floor, work); }

  // ---------- вычисления ----------
  get(section, floor, work) {
    const g = this.volumeGroup(section, floor, work);
    if (g) return Math.round((g.done / g.total) * 100);
    const p = this.progress.get(key(section, floor, work));
    return p ? p.value : 0;
  }
  /** work = 'avg' → среднее по видам работ этажа; иначе конкретный вид (null если не применим) */
  floorValue(section, floor, work = 'avg') {
    const works = this.worksFor(section, floor);
    if (work !== 'avg') return works.includes(work) ? this.get(section, floor, work) : null;
    return works.length ? works.reduce((a, w) => a + this.get(section, floor, w), 0) / works.length : 0;
  }
  sectionValue(section, work = 'avg') {
    let sum = 0, n = 0;
    for (const f of FLOORS) {
      const v = this.floorValue(section, f, work);
      if (v === null) continue;
      sum += v; n++;
    }
    return n ? sum / n : 0;
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
        body: JSON.stringify({ ...payload, token: this.token }),
        redirect: 'follow',
      });
    } catch (e) { const err = new Error('Нет связи с таблицей'); err.network = true; throw err; }
    let data;
    try { data = await r.json(); } catch { const err = new Error('Таблица не ответила'); err.network = true; throw err; }
    if (!data.ok) throw new Error(data.error || 'Ошибка записи');
    return data;
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
    }
  }

  /** Записать операцию: локально сразу, в таблицу — через очередь */
  commit(op) {
    op.at = new Date().toISOString().slice(0, 16).replace('T', ' ');
    this.applyLocal(op);
    this.emit('data');
    if (!this.connected) { this.saveDemo(); this.emit('saved-local'); return; }
    this.queue.push(op);
    LS.set('stroyka.queue', this.queue);
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
          this.emit('saved');
        } catch (err) {
          if (err.network) { this.syncError = err.message; this.retryLater(); break; }
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
