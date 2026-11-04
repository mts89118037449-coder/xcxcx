#!/usr/bin/env node
/**
 * Стройка 3D — собственный сервер (Node.js 18+, без внешних зависимостей).
 *
 * Раздаёт приложение и отдаёт API /api — тот же протокол, что у Apps Script (apps-script/Code.gs),
 * поэтому приложение работает с ним без изменений.
 *
 * Режимы (переменная MODE):
 *   standalone — данные хранятся на этом сервере (data/db.json). Google не нужен.
 *   proxy      — запросы идут в Google-таблицу (GOOGLE_API_URL), сервер держит её копию.
 *                Если Google недоступен, чтение идёт из копии (приложение покажет «копия сервера»),
 *                а запись — ошибкой «нет связи»: правки ждут в очереди на устройствах.
 * В обоих режимах при заданном GOOGLE_API_URL сервер каждые MIRROR_MINUTES снимает копию таблицы.
 *
 * Бэкапы: data/backups/*.json.gz — после правок (не чаще раза в 10 мин) и каждый час, с ротацией.
 *
 * Команды:
 *   node server/server.js                 запустить сервер
 *   node server/server.js backup          снять бэкап сейчас
 *   node server/server.js list            список бэкапов
 *   node server/server.js restore <файл>  восстановить db.json из бэкапа или файла «Скачать копию»
 *   node server/server.js pull            забрать все данные из Google-таблицы в db.json (переезд)
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = (k, d) => (process.env[k] ?? d);
const PORT = Number(env('PORT', 8080));
const HOST = env('HOST', '0.0.0.0');
const MODE = env('MODE', 'standalone');
const GOOGLE = env('GOOGLE_API_URL', '');
const GOOGLE_TOKEN = env('GOOGLE_TOKEN', '');
const TOKEN = env('API_TOKEN', '');
const DATA = path.resolve(env('DATA_DIR', path.join(ROOT, 'data')));
const BACKUPS = path.join(DATA, 'backups');
const KEEP = Number(env('BACKUP_KEEP', 400));
const MIRROR_MIN = Number(env('MIRROR_MINUTES', 5));
const DB_FILE = path.join(DATA, 'db.json');
const MIRROR_FILE = path.join(DATA, 'google-mirror.json');

fs.mkdirSync(BACKUPS, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ------------------------------------------------------------------ хранилище
const EMPTY = () => ({ v: String(Date.now()), progress: [], journal: [], docsRows: [], remarks: [], fin: { expenses: [], advances: [], income: [], nominated: [] } });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
let dbMtime = 0;
function writeJsonAtomic(file, obj) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file); // атомарно: файл никогда не остаётся «наполовину записанным»
  if (file === DB_FILE) dbMtime = fs.statSync(DB_FILE).mtimeMs;
}
/** db.json изменили снаружи (команда restore/pull при работающем сервере) — перечитать */
function syncFromDisk() {
  try {
    const m = fs.statSync(DB_FILE).mtimeMs;
    if (m > dbMtime + 1) { const d = readJson(DB_FILE, null); if (d) { db = d; dbMtime = m; log('db.json изменён снаружи — перечитан'); } }
  } catch { /* */ }
}
let db = readJson(DB_FILE, null);
if (db) dbMtime = fs.statSync(DB_FILE).mtimeMs;

/** Принять данные в любом из форматов: ответ ?action=all, файл «Скачать копию», бэкап сервера */
function normalize(x) {
  const d = x && x.format === 'stroyka-backup' ? x.data : x;
  if (!d || typeof d !== 'object') throw new Error('Неизвестный формат файла');
  const out = EMPTY();
  for (const k of ['progress', 'journal', 'docsRows', 'remarks']) if (Array.isArray(d[k])) out[k] = d[k];
  const f = d.fin || {};
  for (const k of ['expenses', 'advances', 'income', 'nominated']) if (Array.isArray(f[k])) out.fin[k] = f[k];
  if (f.summary) { out.fin.summary = f.summary; out.fin.partial = !!f.partial; }
  out.fin.expenses = out.fin.expenses.map((e) => ({ ...e, id: e.id || 'r' + (e.row || crypto.randomUUID().slice(0, 8)) }));
  out.journal = out.journal.map((j) => ({ ...j, id: j.id || 'j' + crypto.randomUUID().slice(0, 8) }));
  return out;
}

/** Первый запуск: база из снимка таблицы, который лежит в приложении (js/seed*.js) */
async function seedDb() {
  const { SEED_DOCS_ROWS, SEED_REMARKS, SEED_JOURNAL } = await import('../js/seed.js');
  const { SEED_FIN } = await import('../js/seed-fin.js');
  const { docsFromRows, estimateFromDocs } = await import('../js/data.js');
  return normalize({
    progress: estimateFromDocs(docsFromRows(SEED_DOCS_ROWS)),
    journal: SEED_JOURNAL, docsRows: SEED_DOCS_ROWS, remarks: SEED_REMARKS,
    fin: { ...SEED_FIN, partial: true },
  });
}
if (!db) {
  db = await seedDb();
  writeJsonAtomic(DB_FILE, db);
  log('Создана база data/db.json из снимка таблицы на 04.11.2026');
}

// ------------------------------------------------------------------ бэкапы
const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
function backup(reason = 'manual', data = db) {
  const file = path.join(BACKUPS, `${stamp()}-${reason}.json.gz`);
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({ format: 'stroyka-backup', version: 1, exportedAt: new Date().toISOString(), reason, data })));
  const all = fs.readdirSync(BACKUPS).filter((f) => f.endsWith('.json.gz')).sort();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP))) fs.unlinkSync(path.join(BACKUPS, f));
  return file;
}
function readBackupFile(file) {
  const buf = fs.readFileSync(file);
  const txt = file.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return JSON.parse(txt);
}
let dirty = false, lastChangeBackup = 0;
function changed() {
  db.v = String(Date.now());
  writeJsonAtomic(DB_FILE, db);
  dirty = true;
  if (Date.now() - lastChangeBackup > 10 * 60 * 1000) { backup('change'); lastChangeBackup = Date.now(); dirty = false; }
}

// ------------------------------------------------------------------ операции (как в Code.gs)
const clampPct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const nowStr = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const money = (v) => typeof v === 'number' ? v : Number(String(v || '').replace(/[\s ₽]/g, '').replace(',', '.')) || 0;

function apply(body) {
  const e = body.entry || {};
  switch (body.action) {
    case 'setProgress': {
      const s = String(body.section), f = Number(body.floor), w = String(body.work);
      if (!['4', '5'].includes(s) || !(f >= 0 && f <= 17)) throw new Error('Неверная секция или этаж');
      const row = db.progress.find((p) => String(p.section) === s && Number(p.floor) === f && p.work === w);
      if (row) Object.assign(row, { value: clampPct(body.value), updated: nowStr(), note: '' });
      else db.progress.push({ section: s, floor: f, work: w, value: clampPct(body.value), updated: nowStr(), note: '' });
      return {};
    }
    case 'addJournal': {
      if (!e.date) throw new Error('Нет даты');
      const id = String(e.id || 'j' + crypto.randomUUID().slice(0, 8));
      if (!db.journal.some((j) => j.id === id)) db.journal.push({ id, date: e.date, section: String(e.section || 'Общее'), type: e.type === 'Люди' ? 'Люди' : 'Материал', name: String(e.name || ''), qty: Number(e.qty) || 0, unit: String(e.unit || ''), note: String(e.note || '') });
      return { id };
    }
    case 'updateJournal': {
      const j = db.journal.find((x) => x.id === e.id);
      if (!j) return apply({ action: 'addJournal', entry: e });
      Object.assign(j, { date: e.date, section: String(e.section || 'Общее'), type: e.type === 'Люди' ? 'Люди' : 'Материал', name: String(e.name || ''), qty: Number(e.qty) || 0, unit: String(e.unit || ''), note: String(e.note || '') });
      return {};
    }
    case 'deleteJournal': {
      const n = db.journal.length;
      db.journal = db.journal.filter((j) => j.id !== String(body.id));
      return { deleted: n - db.journal.length };
    }
    case 'addExpense': {
      const id = String(e.id || 'x' + crypto.randomUUID().slice(0, 8));
      if (!money(e.sum)) throw new Error('Нет суммы');
      if (!db.fin.expenses.some((x) => x.id === id)) {
        const n = Math.max(0, ...db.fin.expenses.map((x) => parseInt(x.n, 10) || 0)) + 1;
        db.fin.expenses.push({ id, app: true, n: String(n), date: e.date || '', cat: String(e.cat || 'Прочее'), who: String(e.who || ''), basis: String(e.basis || ''), note: String(e.note || ''), sum: money(e.sum) });
      }
      return { id };
    }
    case 'updateExpense': {
      const x = db.fin.expenses.find((y) => y.id === e.id);
      if (!x) return apply({ action: 'addExpense', entry: e });
      const exp = body.expect || {};
      if (!x.app && exp.sum != null && Math.abs(money(x.sum) - Number(exp.sum)) > 0.009) throw new Error('Строку уже изменили — обновите приложение и повторите');
      Object.assign(x, { date: e.date || x.date, cat: String(e.cat || x.cat), who: String(e.who || ''), basis: String(e.basis || ''), note: String(e.note || ''), sum: money(e.sum) });
      return {};
    }
    case 'deleteExpense': {
      const x = db.fin.expenses.find((y) => y.id === String(body.id));
      if (x && !x.app) throw new Error('Удалять можно только расходы, добавленные из приложения');
      db.fin.expenses = db.fin.expenses.filter((y) => y.id !== String(body.id));
      return {};
    }
    case 'restore': {
      backup('before-restore');
      const nd = normalize(body.data);
      db = { ...nd, v: String(Date.now()) };
      return { restored: { progress: db.progress.length, journal: db.journal.length, expenses: db.fin.expenses.length } };
    }
    default:
      throw new Error('Неизвестное действие: ' + body.action);
  }
}

// ------------------------------------------------------------------ Google: копия и прокси
async function googleFetch(params, body) {
  const u = new URL(GOOGLE);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  if (GOOGLE_TOKEN && !body) u.searchParams.set('token', GOOGLE_TOKEN);
  const ctl = AbortSignal.timeout(30000);
  const r = await fetch(u, body ? { method: 'POST', body: JSON.stringify({ ...body, token: GOOGLE_TOKEN || body.token }), signal: ctl, redirect: 'follow' } : { signal: ctl, redirect: 'follow' });
  const data = await r.json();
  return data;
}
let mirrorAt = null;
async function mirror() {
  if (!GOOGLE) return null;
  try {
    const data = await googleFetch({ action: 'all' });
    if (!data.ok) throw new Error(data.error || 'ошибка Apps Script');
    const prev = readJson(MIRROR_FILE, null);
    writeJsonAtomic(MIRROR_FILE, data);
    mirrorAt = new Date();
    if (!prev || prev.v !== data.v) backup('google', normalize(data));
    return data;
  } catch (e) {
    log('Копия Google не снята:', e.message);
    return null;
  }
}

// ------------------------------------------------------------------ HTTP
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.gs': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const PUBLIC = ['index.html', 'sw.js', 'css', 'js', 'vendor', 'apps-script', 'README.md'];

function send(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(JSON.stringify(obj));
}
function checkToken(t) {
  if (TOKEN && String(t || '') !== TOKEN) throw Object.assign(new Error('Неверный токен'), { code: 403 });
}
function readBody(req) {
  return new Promise((ok, bad) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 20e6) { bad(new Error('Слишком большой запрос')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', bad);
  });
}

async function handleApi(req, res, url) {
  syncFromDisk();
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' }); return res.end(); }
    if (req.method === 'GET') {
      const p = Object.fromEntries(url.searchParams);
      checkToken(p.token);
      if (MODE === 'proxy' && GOOGLE) {
        try {
          const data = await googleFetch(p.action === 'version' ? { action: 'version' } : { action: 'all' });
          if (p.action !== 'version' && data.ok) { writeJsonAtomic(MIRROR_FILE, data); mirrorAt = new Date(); }
          return send(res, 200, data);
        } catch {
          const m = readJson(MIRROR_FILE, null);
          if (!m) return send(res, 502, { ok: false, error: 'Google недоступен, копии ещё нет' });
          return send(res, 200, p.action === 'version' ? { ok: true, v: m.v } : { ...m, ok: true, stale: true, staleAt: mirrorAt && mirrorAt.toISOString() });
        }
      }
      if (p.action === 'version') return send(res, 200, { ok: true, v: db.v });
      if (p.action === 'backups') return send(res, 200, { ok: true, files: fs.readdirSync(BACKUPS).filter((f) => f.endsWith('.gz')).sort().reverse().slice(0, 100) });
      return send(res, 200, { ok: true, ...db });
    }
    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      checkToken(body.token);
      if (MODE === 'proxy' && GOOGLE) {
        if (body.action === 'restore') throw new Error('В режиме proxy восстановление делается в Google-таблице; переключитесь на standalone');
        try {
          const out = await googleFetch(null, body);
          if (out.ok) mirror(); // копия на сервере сразу включает свежую правку
          return send(res, 200, out);
        }
        catch { return send(res, 502, { ok: false, error: 'Google недоступен — правка останется в очереди на устройстве' }); }
      }
      const out = apply(body);
      changed();
      return send(res, 200, { ok: true, v: db.v, ...out });
    }
    send(res, 405, { ok: false, error: 'Метод не поддерживается' });
  } catch (e) {
    send(res, e.code || 200, { ok: false, error: e.message });
  }
}

async function handleStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const top = rel.split('/')[0];
  if (!PUBLIC.includes(top)) { res.writeHead(404); return res.end('Not found'); }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  // config.js собирается на лету: приложение само подключается к этому серверу
  if (rel === 'js/config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    return res.end(`export const API_URL = new URL('api', location.href).href;\nexport const API_TOKEN = ${JSON.stringify(env('CLIENT_TOKEN', ''))};\n`);
  }
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': rel.startsWith('vendor/') ? 'public, max-age=604800' : 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
}

function serve() {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api' || url.pathname === '/api/') return handleApi(req, res, url);
    if (url.pathname === '/healthz') return send(res, 200, { ok: true, mode: MODE, v: db.v, mirrorAt });
    return handleStatic(req, res, url);
  });
  srv.listen(PORT, HOST, () => log(`Стройка 3D: http://${HOST}:${PORT}  режим=${MODE}  данные=${DATA}${GOOGLE ? '  копия Google каждые ' + MIRROR_MIN + ' мин' : ''}`));
  setInterval(() => { if (dirty) { backup('hourly'); dirty = false; } }, 60 * 60 * 1000);
  if (GOOGLE) { mirror(); setInterval(mirror, MIRROR_MIN * 60 * 1000); }
  const stop = () => { if (dirty) backup('shutdown'); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

// ------------------------------------------------------------------ CLI
const [cmd, arg] = process.argv.slice(2);
if (!cmd || cmd === 'serve') serve();
else if (cmd === 'backup') { console.log('Бэкап:', backup('manual')); }
else if (cmd === 'list') { for (const f of fs.readdirSync(BACKUPS).sort()) console.log(f, (fs.statSync(path.join(BACKUPS, f)).size / 1024).toFixed(0) + ' КБ'); }
else if (cmd === 'restore') {
  if (!arg) { console.error('Укажите файл: node server/server.js restore data/backups/<файл>.json.gz'); process.exit(1); }
  const file = fs.existsSync(arg) ? arg : path.join(BACKUPS, arg);
  backup('before-restore');
  db = { ...normalize(readBackupFile(file)), v: String(Date.now()) };
  writeJsonAtomic(DB_FILE, db);
  console.log(`Восстановлено из ${file}: прогресс ${db.progress.length}, журнал ${db.journal.length}, расходы ${db.fin.expenses.length}. Работающий сервер подхватит данные сам.`);
}
else if (cmd === 'pull') {
  if (!GOOGLE) { console.error('Задайте GOOGLE_API_URL'); process.exit(1); }
  const data = await mirror() || readJson(MIRROR_FILE, null);
  if (!data) { console.error('Google недоступен и копии нет'); process.exit(1); }
  backup('before-pull');
  db = { ...normalize(data), v: String(Date.now()) };
  writeJsonAtomic(DB_FILE, db);
  console.log(`Данные из таблицы перенесены в ${DB_FILE}: расходов ${db.fin.expenses.length}, журнал ${db.journal.length}. Запускайте с MODE=standalone.`);
}
else { console.error('Неизвестная команда. Доступно: serve | backup | list | restore <файл> | pull'); process.exit(1); }
