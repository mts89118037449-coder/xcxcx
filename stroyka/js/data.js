// Модель данных и синхронизация с Google Sheets через Apps Script (см. apps-script/Code.gs).
import { SEED_DOCS_ROWS, SEED_REMARKS, SEED_JOURNAL } from './seed.js';

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
export const ALL_WORKS = ['Наружные стены', 'Перегородки', 'Кровля'];

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

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } },
};

const key = (s, f, w) => `${s}|${f}|${w}`;

export class Store {
  constructor() {
    const cfg = LS.get('stroyka.cfg', {});
    const qs = new URLSearchParams(location.search);
    this.url = qs.get('api') || cfg.url || '';
    this.token = qs.get('token') || cfg.token || '';
    this.progress = new Map();
    this.journal = [];
    this.docs = [];
    this.remarks = [];
    this.status = 'idle'; // idle | loading | ok | error | demo
    this.error = '';
    this.loadedAt = null;
    this.listeners = new Set();
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
  async load() {
    this.status = 'loading'; this.emit('status');
    try {
      if (this.connected) {
        const u = new URL(this.url);
        u.searchParams.set('action', 'all');
        if (this.token) u.searchParams.set('token', this.token);
        const r = await fetch(u.toString(), { redirect: 'follow' });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || 'Ошибка Apps Script');
        this.apply(data);
        this.status = 'ok';
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
      if (!this.progress.size) this.loadDemo();
    }
    this.emit('data'); this.emit('status');
  }

  apply(data) {
    this.docs = docsFromRows(data.docsRows || []);
    this.remarks = data.remarks || [];
    this.journal = (data.journal || []).map((j) => ({ ...j, qty: Number(j.qty) || 0 }));
    this.progress = new Map();
    const list = data.progress && data.progress.length ? data.progress : estimateFromDocs(this.docs);
    for (const p of list) this.progress.set(key(String(p.section), Number(p.floor), p.work), { ...p, section: String(p.section), floor: Number(p.floor), value: clampPct(p.value) });
  }

  loadDemo() {
    const saved = LS.get('stroyka.demo', null);
    this.docs = docsFromRows(SEED_DOCS_ROWS);
    this.remarks = SEED_REMARKS;
    this.journal = saved ? saved.journal : SEED_JOURNAL.slice();
    this.progress = new Map();
    const list = saved ? saved.progress : estimateFromDocs(this.docs);
    for (const p of list) this.progress.set(key(p.section, p.floor, p.work), p);
  }
  saveDemo() {
    if (this.connected) return;
    LS.set('stroyka.demo', { progress: [...this.progress.values()], journal: this.journal });
  }
  resetDemo() {
    try { localStorage.removeItem('stroyka.demo'); } catch { /* */ }
    this.loadDemo(); this.emit('data');
  }

  // ---------- вычисления ----------
  get(section, floor, work) {
    const p = this.progress.get(key(section, floor, work));
    return p ? p.value : 0;
  }
  /** work = 'avg' → среднее по видам работ этажа; иначе конкретный вид (null если не применим) */
  floorValue(section, floor, work = 'avg') {
    const works = worksForFloor(floor);
    if (work !== 'avg') return works.includes(work) ? this.get(section, floor, work) : null;
    return works.reduce((a, w) => a + this.get(section, floor, w), 0) / works.length;
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
  journalOn(date) { return this.journal.filter((j) => j.date === date); }
  peopleOn(date, section) {
    return this.journal.filter((j) => j.date === date && j.type === 'Люди' && (!section || j.section === section)).reduce((a, j) => a + j.qty, 0);
  }

  // ---------- запись ----------
  async post(payload) {
    const r = await fetch(this.url, {
      method: 'POST',
      // text/plain — «простой» запрос без CORS-preflight, Apps Script его принимает
      body: JSON.stringify({ ...payload, token: this.token }),
      redirect: 'follow',
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Ошибка записи');
    return data;
  }

  async setProgress(section, floor, work, value) {
    const v = clampPct(value);
    const updated = new Date().toISOString().slice(0, 16).replace('T', ' ');
    this.progress.set(key(section, floor, work), { section, floor, work, value: v, updated, note: '' });
    this.emit('data');
    if (!this.connected) { this.saveDemo(); return; }
    await this.post({ action: 'setProgress', section, floor, work, value: v });
  }

  async addJournal(entry) {
    const e = { ...entry, id: 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), qty: Number(entry.qty) || 0 };
    this.journal.push(e);
    this.emit('data');
    if (!this.connected) { this.saveDemo(); return e; }
    await this.post({ action: 'addJournal', entry: e });
    return e;
  }

  async deleteJournal(id) {
    this.journal = this.journal.filter((j) => j.id !== id);
    this.emit('data');
    if (!this.connected) { this.saveDemo(); return; }
    await this.post({ action: 'deleteJournal', id });
  }
}

function clampPct(v) {
  const n = Number(String(v).replace(',', '.').replace('%', ''));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}
