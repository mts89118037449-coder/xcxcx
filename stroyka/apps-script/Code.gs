/**
 * API для «Стройка 3D» — двусторонняя связь веб-приложения с таблицей «Glorax_Учёт».
 *
 * Установка:
 *   1. Откройте таблицу → Расширения → Apps Script, вставьте этот файл целиком, сохраните.
 *   2. Выберите функцию setup → Выполнить (выдайте доступ). Будут созданы листы «Прогресс» и «Журнал».
 *   3. (Необязательно) Настройки проекта → Свойства скрипта → добавьте TOKEN = любой пароль.
 *   4. Начать развертывание → Новое развертывание → Веб-приложение:
 *        Запуск от имени: «Я», У кого есть доступ: «Все». Скопируйте URL …/exec.
 *   5. В приложении нажмите «Таблица…» и вставьте URL (и TOKEN, если задавали).
 *
 * Читает:  «Прогресс», «Журнал», «Таблица» (ИС/АОСР/замечания), «Замечания АСГ».
 * Пишет:   «Прогресс» (проценты по этажам), «Журнал» (люди и материалы по датам).
 * Остальные листы не трогает.
 */

const SHEET_PROGRESS = 'Прогресс';
const SHEET_JOURNAL = 'Журнал';
const SHEET_DOCS = 'Таблица';
const SHEET_REMARKS = 'Замечания АСГ';

const PROGRESS_HEADER = ['Секция', 'Этаж', 'Вид работ', 'Процент', 'Обновлено', 'Примечание'];
const JOURNAL_HEADER = ['Дата', 'Секция', 'Тип', 'Наименование', 'Количество', 'Ед.', 'Примечание', 'ID'];
const SECTIONS = ['4', '5'];
const ROOF = 17;

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }

// ---------------------------------------------------------------- HTTP

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    checkToken_(p.token);
    return json_(Object.assign({ ok: true }, readAll_()));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    lock.waitLock(20000);
    let res;
    switch (body.action) {
      case 'setProgress': res = setProgress_(String(body.section), Number(body.floor), String(body.work), Number(body.value)); break;
      case 'addJournal': res = addJournal_(body.entry || {}); break;
      case 'deleteJournal': res = deleteJournal_(String(body.id)); break;
      default: throw new Error('Неизвестное действие: ' + body.action);
    }
    return json_(Object.assign({ ok: true }, res || {}));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* */ }
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(t) {
  const need = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (need && String(t || '') !== need) throw new Error('Неверный токен');
}

// ---------------------------------------------------------------- setup

function setup() {
  progressSheet_();
  journalSheet_();
}

function progressSheet_() {
  let sh = ss_().getSheetByName(SHEET_PROGRESS);
  if (sh) return sh;
  sh = ss_().insertSheet(SHEET_PROGRESS);
  sh.getRange(1, 1, 1, PROGRESS_HEADER.length).setValues([PROGRESS_HEADER]).setFontWeight('bold').setBackground('#e3f3e8');
  sh.setFrozenRows(1);
  // стартовые значения — оценка по листу «Таблица»
  const docs = readDocsRows_();
  const rows = [];
  SECTIONS.forEach(function (s) {
    for (let f = 0; f <= ROOF; f++) {
      worksForFloor_(f).forEach(function (w) {
        let v = 0;
        docs.forEach(function (r) {
          const p = parseRowLabel_(r[0]);
          if (!p || p.floor !== f || p.work !== w) return;
          const is = s === '4' ? r[1] : r[2], aosr = s === '4' ? r[3] : r[4], rem = s === '4' ? r[5] : r[6];
          v = (is || aosr) ? 100 : rem ? 50 : 0;
        });
        rows.push([s, floorLabel_(f), w, v, '', 'оценка по листу «Таблица»']);
      });
    }
  });
  sh.getRange(2, 1, rows.length, PROGRESS_HEADER.length).setValues(rows);
  sh.getRange(2, 4, rows.length, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(0, 100).setAllowInvalid(false).build());
  // зелёная шкала прямо в таблице
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.NUMBER, '100')
    .setRanges([sh.getRange(2, 4, 1000, 1)]).build();
  sh.setConditionalFormatRules([rule]);
  sh.autoResizeColumns(1, PROGRESS_HEADER.length);
  return sh;
}

function journalSheet_() {
  let sh = ss_().getSheetByName(SHEET_JOURNAL);
  if (sh) return sh;
  sh = ss_().insertSheet(SHEET_JOURNAL);
  sh.getRange(1, 1, 1, JOURNAL_HEADER.length).setValues([JOURNAL_HEADER]).setFontWeight('bold').setBackground('#e3f3e8');
  sh.setFrozenRows(1);
  sh.getRange('A2:A').setNumberFormat('dd.MM.yyyy');
  sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Люди', 'Материал'], true).build());
  sh.getRange('B2:B').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['4', '5', 'Общее'], true).build());
  return sh;
}

// ---------------------------------------------------------------- чтение

function readAll_() {
  return {
    progress: readProgress_(),
    journal: readJournal_(),
    docsRows: readDocsRows_(),
    remarks: readRemarks_(),
    updated: new Date().toISOString(),
  };
}

function readProgress_() {
  const sh = progressSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, PROGRESS_HEADER.length).getValues()
    .filter(function (r) { return r[0] !== '' && r[2] !== ''; })
    .map(function (r) {
      return {
        section: String(r[0]).replace(/\D/g, '') || String(r[0]),
        floor: parseFloor_(r[1]),
        work: String(r[2]).trim(),
        value: pct_(r[3]),
        updated: r[4] instanceof Date ? Utilities.formatDate(r[4], tz_(), 'yyyy-MM-dd HH:mm') : String(r[4] || ''),
        note: String(r[5] || ''),
      };
    })
    .filter(function (p) { return p.floor !== null; });
}

function readJournal_() {
  const sh = journalSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const vals = sh.getRange(2, 1, n, JOURNAL_HEADER.length).getValues();
  const out = [];
  vals.forEach(function (r, i) {
    if (r[0] === '' && r[3] === '') return;
    const date = toIsoDate_(r[0]);
    if (!date) return;
    let id = String(r[7] || '');
    if (!id) { // строки, добавленные вручную, получают ID
      id = 'r' + Utilities.getUuid().slice(0, 8);
      sh.getRange(i + 2, 8).setValue(id);
    }
    out.push({
      id: id, date: date, section: String(r[1] || 'Общее').replace(/^Секция\s*/i, ''),
      type: /люд|чел/i.test(String(r[2])) ? 'Люди' : 'Материал',
      name: String(r[3] || ''), qty: Number(String(r[4]).replace(',', '.')) || 0, unit: String(r[5] || ''), note: String(r[6] || ''),
    });
  });
  return out;
}

function readDocsRows_() {
  const sh = ss_().getSheetByName(SHEET_DOCS);
  if (!sh) return [];
  const last = Math.min(sh.getLastRow(), 80);
  if (last < 3) return [];
  return sh.getRange(3, 1, last - 2, 7).getDisplayValues().filter(function (r) { return parseRowLabel_(r[0]); });
}

function readRemarks_() {
  const sh = ss_().getSheetByName(SHEET_REMARKS);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 6) return [];
  return sh.getRange(6, 1, last - 5, 24).getDisplayValues()
    .filter(function (r) { return r[4] || r[5]; })
    .map(function (r) {
      return { n: r[0], text: r[4], short: r[5] || r[4], section: String(r[6]), who: r[7], due: r[16] || r[9], moves: r[17], status: r[19], done: r[20], state: r[22], note: r[23] };
    });
}

// ---------------------------------------------------------------- запись

function setProgress_(section, floor, work, value) {
  if (SECTIONS.indexOf(section) < 0) throw new Error('Секция должна быть 4 или 5');
  if (!(floor >= 0 && floor <= ROOF)) throw new Error('Неверный этаж');
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const sh = progressSheet_();
  const n = Math.max(0, sh.getLastRow() - 1);
  const vals = n ? sh.getRange(2, 1, n, 3).getValues() : [];
  const now = new Date();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).replace(/\D/g, '') === section && parseFloor_(vals[i][1]) === floor && String(vals[i][2]).trim() === work) {
      sh.getRange(i + 2, 4, 1, 3).setValues([[v, now, '']]);
      sh.getRange(i + 2, 5).setNumberFormat('dd.MM.yyyy HH:mm');
      return { row: i + 2 };
    }
  }
  sh.appendRow([section, floorLabel_(floor), work, v, now, '']);
  return { row: sh.getLastRow() };
}

function addJournal_(e) {
  if (!e.date) throw new Error('Нет даты');
  const sh = journalSheet_();
  const p = String(e.date).split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  const id = String(e.id || ('j' + Utilities.getUuid().slice(0, 8)));
  sh.appendRow([d, String(e.section || 'Общее'), e.type === 'Люди' ? 'Люди' : 'Материал', String(e.name || ''), Number(e.qty) || 0, String(e.unit || ''), String(e.note || ''), id]);
  return { id: id };
}

function deleteJournal_(id) {
  const sh = journalSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return { deleted: 0 };
  const ids = sh.getRange(2, 8, n, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === id) { sh.deleteRow(i + 2); return { deleted: 1 }; }
  }
  return { deleted: 0 };
}

// ---------------------------------------------------------------- утилиты

function worksForFloor_(f) {
  if (f === 0) return ['Перегородки'];
  if (f === ROOF) return ['Кровля'];
  return ['Наружные стены', 'Перегородки'];
}
function floorLabel_(f) { return f === 0 ? 'Подвал' : f === ROOF ? 'Кровля' : String(f); }
function parseFloor_(v) {
  const s = String(v).trim().toLowerCase();
  if (s.indexOf('подвал') === 0) return 0;
  if (s.indexOf('кровл') === 0) return ROOF;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}
function parseRowLabel_(label) {
  const s = String(label || '').trim().toLowerCase();
  if (!s) return null;
  if (s.indexOf('кровл') === 0) return { floor: ROOF, work: 'Кровля' };
  let floor = null;
  if (s.indexOf('подвал') === 0) floor = 0;
  const m = s.match(/^(\d+)\s*этаж/);
  if (m) floor = Number(m[1]);
  if (floor === null) return null;
  const work = s.indexOf('наружн') >= 0 ? 'Наружные стены' : s.indexOf('перегород') >= 0 ? 'Перегородки' : null;
  return work ? { floor: floor, work: work } : null;
}
function pct_(v) {
  if (typeof v === 'number') return Math.round(v > 0 && v <= 1 && v % 1 !== 0 ? v * 100 : v); // поддержка формата «50%»
  const n = Number(String(v).replace('%', '').replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n);
}
function toIsoDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  const m = String(v).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  const m2 = String(v).match(/^\d{4}-\d{2}-\d{2}/);
  return m2 ? m2[0] : '';
}
