/**
 * API для «Стройка 3D» — двусторонняя связь веб-приложения с таблицей «Glorax_Учёт».
 *
 * Установка без компьютера: deploy/install.sh на VPS сам создаёт и публикует этот скрипт (clasp);
 * владельцу остаётся открыть выданную ссылку и нажать «Разрешить» — setup выполнится сам.
 *
 * Установка вручную:
 *   1. Откройте таблицу → Расширения → Apps Script, вставьте этот файл целиком, сохраните.
 *   2. Выберите функцию setup → Выполнить (выдайте доступ). Будут созданы листы «Прогресс» и «Журнал»
 *      и триггер, который отмечает любую правку в таблице — по этой отметке приложение
 *      за ~10 секунд подтягивает изменения, сделанные прямо в таблице.
 *   3. (Необязательно) Настройки проекта → Свойства скрипта → добавьте TOKEN = любой пароль.
 *   4. Начать развертывание → Новое развертывание → Веб-приложение:
 *        Запуск от имени: «Я», У кого есть доступ: «Все». Скопируйте URL …/exec.
 *   5. В приложении нажмите «Таблица…» и вставьте URL (и TOKEN, если задавали).
 *
 * Читает:  «Прогресс», «Журнал», «Таблица» (ИС/АОСР/замечания), «Замечания АСГ»,
 *          «Счета» (расходы), «Для РП» (авансы), «Оплаты Глоракс» (поступления),
 *          «Номинированные материалы» (заявки на поставку).
 * Пишет:   «Прогресс» (проценты по этажам), «Журнал» (люди и материалы по датам),
 *          «Счета» — только новой строкой при «+ Добавить расход» в приложении.
 * Остальные листы не трогает.
 */

// Таблица «Glorax_Учёт» — скрипт работает и встроенным в таблицу, и отдельным файлом на Диске
const SPREADSHEET_ID = '1H-0BjSxyU60e4O7LVViPMi1bJYX9quiKk1TFKsuHJlo';
// Папка «Стройка 3D — бэкапы» на Google Диске владельца
const BACKUP_FOLDER_ID = '1V9zW5kvqI9pC3eICf2vJ3-lg2JaHg-te';
const BACKUP_KEEP_DAYS = 60;

const SHEET_PROGRESS = 'Прогресс';
const SHEET_JOURNAL = 'Журнал';
const SHEET_DOCS = 'Таблица';
const SHEET_REMARKS = 'Замечания АСГ';
const SHEET_EXPENSES = 'Счета';
const SHEET_ADVANCES = 'Для РП';
const SHEET_INCOME = 'Оплаты Глоракс';
const SHEET_NOMINATED = 'Номинированные материалы';

const PROGRESS_HEADER = ['Секция', 'Этаж', 'Вид работ', 'Процент', 'Обновлено', 'Примечание'];
const JOURNAL_HEADER = ['Дата', 'Секция', 'Тип', 'Наименование', 'Количество', 'Ед.', 'Примечание', 'ID'];
const SECTIONS = ['4', '5'];
const ROOF = 17;

function ss_() { return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }

// ---------------------------------------------------------------- HTTP

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    checkToken_(p.token);
    ensureSetup_();
    // владелец открыл ссылку в браузере (после «Разрешить») — короткая страница вместо JSON
    if (!p.action) return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font:18px system-ui;padding:24px"><h2>✓ Стройка 3D подключена к таблице</h2><p>Триггеры и ежедневный бэкап на Google Диск включены. Страницу можно закрыть.</p></div>');
    if (p.action === 'version') return json_({ ok: true, v: version_() });
    return json_(Object.assign({ ok: true, v: version_() }, readAll_()));
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
      case 'updateJournal': res = updateJournal_(body.entry || {}); break;
      case 'addExpense': res = addExpense_(body.entry || {}); break;
      case 'updateExpense': res = updateExpense_(body.entry || {}, body.expect || {}); break;
      case 'deleteExpense': res = deleteExpense_(String(body.id)); break;
      default: throw new Error('Неизвестное действие: ' + body.action);
    }
    SpreadsheetApp.flush();
    return json_(Object.assign({ ok: true, v: stamp_() }, res || {}));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* */ }
  }
}

/** Первый запуск после «Разрешить»: листы, триггеры, первый бэкап — без ручного запуска setup */
function ensureSetup_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_DONE')) return;
  try { setup(); props.setProperty('SETUP_DONE', new Date().toISOString()); }
  catch (err) { console.error('setup: ' + err); }
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
  // триггеры «при изменении»: любая правка в таблице меняет отметку версии
  const have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('onSheetEdit') < 0) ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss_()).onEdit().create();
  if (have.indexOf('onSheetChange') < 0) ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss_()).onChange().create();
  // ежедневный бэкап на Google Диск в 03:00
  if (have.indexOf('backupToDrive') < 0) ScriptApp.newTrigger('backupToDrive').timeBased().everyDays(1).atHour(3).create();
  stamp_();
  backupToDrive();
}

/**
 * Бэкап на Google Диск: полная копия таблицы + JSON всех данных приложения.
 * Запускается триггером каждый день; можно запустить вручную. Копии старше BACKUP_KEEP_DAYS — в корзину.
 */
function backupToDrive() {
  const folder = backupFolder_();
  const tz = tz_();
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  DriveApp.getFileById(ss_().getId()).makeCopy('Glorax_Учёт — бэкап ' + stamp, folder);
  const data = { format: 'stroyka-backup', version: 1, exportedAt: new Date().toISOString(), source: 'apps-script', data: readAll_() };
  folder.createFile('stroyka-backup-' + stamp.replace(/[ :]/g, '-') + '.json', JSON.stringify(data), 'application/json');
  const limit = Date.now() - BACKUP_KEEP_DAYS * 864e5;
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getDateCreated().getTime() < limit && /бэкап|stroyka-backup/.test(f.getName())) f.setTrashed(true);
  }
}
function backupFolder_() {
  try { return DriveApp.getFolderById(BACKUP_FOLDER_ID); } catch (e) { /* папку удалили — создадим заново */ }
  const it = DriveApp.getFoldersByName('Стройка 3D — бэкапы');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Стройка 3D — бэкапы');
}

/** Триггер: правка ячеек вручную */
function onSheetEdit(e) { stamp_(); }
/** Триггер: вставка/удаление строк, листов, вставка данных */
function onSheetChange(e) { stamp_(); }

function stamp_() {
  const v = String(Date.now());
  PropertiesService.getScriptProperties().setProperty('V', v);
  return v;
}
function version_() {
  return PropertiesService.getScriptProperties().getProperty('V') || stamp_();
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
    fin: readFin_(),
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

// ---------------------------------------------------------------- финансы

function readFin_() {
  return { expenses: safe_(readExpenses_), advances: safe_(readAdvances_), income: safe_(readIncome_), nominated: safe_(readNominated_) };
}
function safe_(fn) { try { return fn(); } catch (e) { return []; } }

/** «Счета»: с 5-й строки. A №, B дата счёта, C дата платежа, D категория, E контрагент, F основание, G примечание, H сумма */
function readExpenses_() {
  const sh = ss_().getSheetByName(SHEET_EXPENSES);
  if (!sh || sh.getLastRow() < 5) return [];
  const n = sh.getLastRow() - 4;
  const disp = sh.getRange(5, 1, n, 8).getDisplayValues();
  const raw = sh.getRange(5, 8, n, 1).getValues();
  const out = [];
  disp.forEach(function (r, i) {
    const sum = num_(raw[i][0]);
    if (!sum) return;
    const mark = String(r[6] || '').match(/\[app:([\w-]+)\]/);
    out.push({
      id: mark ? mark[1] : 'r' + (i + 5), app: !!mark,
      n: r[0], row: i + 5,
      date: findDate_(r[2]) || findDate_(r[1]) || findDate_(r[5]) || findDate_(r[6]),
      cat: String(r[3] || 'Прочее').trim(), who: String(r[4] || '').trim(),
      basis: String(r[5] || '').replace(/\s+/g, ' ').slice(0, 160), note: String(r[6] || '').replace(/\s*\[app:[\w-]+\]/, '').replace(/\s+/g, ' ').slice(0, 120),
      sum: sum,
    });
  });
  return out;
}

/** «Для РП»: с 3-й строки. A №, C тип, D дата, F сумма, G статус, H описание */
function readAdvances_() {
  const sh = ss_().getSheetByName(SHEET_ADVANCES);
  if (!sh || sh.getLastRow() < 3) return [];
  return sh.getRange(3, 1, sh.getLastRow() - 2, 8).getDisplayValues()
    .filter(function (r) { return /^\d+$/.test(String(r[0]).trim()) && num_(r[5]); })
    .map(function (r) { return { n: r[0], type: String(r[2]).replace('Аванс за ', '').replace(/^н/, 'Н'), date: findDate_(r[3]), sum: num_(r[5]), status: r[6], desc: r[7] }; });
}

/** «Оплаты Глоракс»: с 4-й строки. A №, B дата счёта, C статус, D дата платежа, E примечание, F сумма */
function readIncome_() {
  const sh = ss_().getSheetByName(SHEET_INCOME);
  if (!sh || sh.getLastRow() < 4) return [];
  return sh.getRange(4, 1, sh.getLastRow() - 3, 6).getDisplayValues()
    .filter(function (r) { return num_(r[5]); })
    .map(function (r) { return { n: r[0], date: findDate_(r[3]) || findDate_(String(r[1]).replace(/\//g, '.')), status: r[2], note: r[4], sum: num_(r[5]) }; });
}

/** «Номинированные материалы»: заголовок в 5-й строке, материалы — колонки J и правее */
function readNominated_() {
  const sh = ss_().getSheetByName(SHEET_NOMINATED);
  if (!sh || sh.getLastRow() < 6) return [];
  const w = sh.getLastColumn();
  const head = sh.getRange(5, 1, 1, w).getDisplayValues()[0];
  return sh.getRange(6, 1, sh.getLastRow() - 5, w).getDisplayValues()
    .map(function (r) {
      const items = [];
      for (let c = 9; c < w; c++) if (head[c] && num_(r[c])) items.push([String(head[c]).trim(), num_(r[c])]);
      return { date: findDate_(r[2]) || findDate_(r[1]) || findDate_(r[3]), who: r[6], basis: r[7], note: String(r[8] || '').trim(), sum: num_(r[4]), items: items };
    })
    .filter(function (x) { return x.items.length || x.sum; });
}

/** Новый расход → следующая строка после последней заполненной суммы в «Счета» */
function addExpense_(e) {
  const sh = ss_().getSheetByName(SHEET_EXPENSES);
  if (!sh) throw new Error('Нет листа «' + SHEET_EXPENSES + '»');
  const sum = num_(e.sum);
  if (!sum) throw new Error('Нет суммы');
  const last = sh.getLastRow();
  const sums = last >= 5 ? sh.getRange(5, 8, last - 4, 1).getValues() : [];
  const nums = last >= 5 ? sh.getRange(5, 1, last - 4, 1).getValues() : [];
  let row = 5, maxN = 0;
  sums.forEach(function (v, i) { if (num_(v[0])) row = i + 6; });
  nums.forEach(function (v) { const k = parseInt(v[0], 10); if (k > maxN) maxN = k; });
  const p = String(e.date || '').split('-').map(Number);
  const d = p.length === 3 ? new Date(p[0], p[1] - 1, p[2]) : new Date();
  sh.getRange(row, 1, 1, 8).setValues([[maxN + 1, '', d, String(e.cat || 'Прочее'), String(e.who || ''), String(e.basis || ''), String(e.note || '') + ' [app:' + String(e.id || Utilities.getUuid().slice(0, 8)) + ']', sum]]);
  sh.getRange(row, 3).setNumberFormat('dd.MM.yyyy');
  return { row: row };
}

/** Найти строку расхода: по метке [app:id] или по номеру строки 'r123' */
function findExpenseRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 5) return 0;
  const m = String(id).match(/^r(\d+)$/);
  if (m) return Number(m[1]);
  const notes = sh.getRange(5, 7, last - 4, 1).getValues();
  for (let i = 0; i < notes.length; i++) if (String(notes[i][0]).indexOf('[app:' + id + ']') >= 0) return i + 5;
  return 0;
}

function updateExpense_(e, expect) {
  const sh = ss_().getSheetByName(SHEET_EXPENSES);
  const row = findExpenseRow_(sh, e.id);
  if (!row) return addExpense_(e);
  const cur = sh.getRange(row, 1, 1, 8).getValues()[0];
  // защита: строку могли сдвинуть или изменить в таблице — тогда не перезаписываем чужие данные
  if (/^r\d+$/.test(e.id) && expect && expect.sum != null && Math.abs(num_(cur[7]) - Number(expect.sum)) > 0.009) {
    throw new Error('Строка ' + row + ' в «Счета» изменилась в таблице — обновите приложение и повторите');
  }
  const p = String(e.date || '').split('-').map(Number);
  const mark = String(cur[6]).match(/\s*\[app:[\w-]+\]/);
  sh.getRange(row, 3, 1, 6).setValues([[p.length === 3 ? new Date(p[0], p[1] - 1, p[2]) : cur[2], String(e.cat || cur[3]), String(e.who || ''), String(e.basis || ''), String(e.note || '') + (mark ? mark[0] : ''), num_(e.sum)]]);
  sh.getRange(row, 3).setNumberFormat('dd.MM.yyyy');
  return { row: row };
}

/** Удаляет только строки, добавленные из приложения */
function deleteExpense_(id) {
  const sh = ss_().getSheetByName(SHEET_EXPENSES);
  if (/^r\d+$/.test(id)) throw new Error('Строки, внесённые в таблице вручную, удаляйте в самой таблице');
  const row = findExpenseRow_(sh, id);
  if (row) sh.deleteRow(row);
  return { deleted: row ? 1 : 0 };
}

function num_(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v || '').replace(/[\s\u00a0₽]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
const RU_M_ = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
function findDate_(text) {
  if (text instanceof Date) return Utilities.formatDate(text, tz_(), 'yyyy-MM-dd');
  const s = String(text || '');
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  m = s.toLowerCase().match(/(\d{1,2})\s+([а-я]+)\s+(\d{4})/);
  if (m) {
    for (let i = 0; i < RU_M_.length; i++) {
      const x = RU_M_[i];
      if (m[2].indexOf(x) === 0 && (x !== 'ма' || m[2] === 'мая' || m[2] === 'май')) return m[3] + '-' + ('0' + (i + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
  }
  return '';
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

function updateJournal_(e) {
  const sh = journalSheet_();
  const n = sh.getLastRow() - 1;
  const ids = n > 0 ? sh.getRange(2, 8, n, 1).getValues() : [];
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(e.id)) {
      const p = String(e.date).split('-').map(Number);
      sh.getRange(i + 2, 1, 1, 7).setValues([[new Date(p[0], p[1] - 1, p[2]), String(e.section || 'Общее'), e.type === 'Люди' ? 'Люди' : 'Материал', String(e.name || ''), Number(e.qty) || 0, String(e.unit || ''), String(e.note || '')]]);
      return { row: i + 2 };
    }
  }
  return addJournal_(e); // строку удалили в таблице — создаём заново
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
