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

// Другие таблицы проекта (читаются, если у владельца есть к ним доступ)
const VOLUMES_ID = '1UfElwyFGpqPo93bvn1BSOKSF7ydP2X4kPDyLsYBo5f8';   // «Выполнение»: объёмы по этажам и неделям
const VUP_ID = '119zaY3sQ-7JtZ3JF2ILViGlGe6ULJuDf-jHep_O6X8w';       // «VUP CORE · ЕДИНАЯ БАЗА»: материалы, ход работ, статусы

const SHEET_PROGRESS = 'Прогресс';
const SHEET_JOURNAL = 'Журнал';
const SHEET_DOCS = 'Таблица';
const SHEET_REMARKS = 'Замечания АСГ';
const SHEET_EXPENSES = 'Счета';
const SHEET_ADVANCES = 'Для РП';
const SHEET_INCOME = 'Оплаты Глоракс';
const SHEET_NOMINATED = 'Номинированные материалы';
const SHEET_PERSONAL = 'Личные расходы';
const SHEET_TOOLS = 'УЧЁТ ИНСТРУМЕНТА ';
const SHEET_CONTRACT = 'Формула оплаты Глоракс ';

const PROGRESS_HEADER = ['Секция', 'Этаж', 'Вид работ', 'Процент', 'Обновлено', 'Примечание'];
const JOURNAL_HEADER = ['Дата', 'Секция', 'Тип', 'Наименование', 'Количество', 'Ед.', 'Примечание', 'ID'];
// Кровля — отдельный ключ, чтобы не совпадать с этажом при любой этажности; приложение само ставит её над последним этажом
const ROOF = 999;

// Всегда «Glorax_Учёт» по ID: скрипт может быть привязан к другому файлу (clasp создаёт свой контейнер)
let SS_CACHE_ = null;
/** Строки диапазона (отображаемые значения) с номером строки листа в r.row */
function rowsOf_(sh, startRow, ncols) {
  const n = sh.getLastRow() - startRow + 1;
  if (n < 1) return [];
  return sh.getRange(startRow, 1, n, ncols).getDisplayValues().map(function (r, i) { r.row = startRow + i; return r; });
}

function ss_() { return SS_CACHE_ || (SS_CACHE_ = SpreadsheetApp.openById(SPREADSHEET_ID)); }
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
      case 'setCell': res = setCell_(body); break;
      case 'addRow': res = addRow_(body); break;
      case 'updateExpense': res = updateExpense_(body.entry || {}, body.expect || {}); break;
      case 'deleteExpense': res = deleteExpense_(String(body.id)); break;
      default: throw new Error('Неизвестное действие: ' + body.action);
    }
    SpreadsheetApp.flush();
    stamp_();
    CacheService.getScriptCache().remove('EXTV');
    return json_(Object.assign({ ok: true, v: version_() }, res || {}));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* */ }
  }
}

/** Первый запуск после «Разрешить»: листы, триггеры, первый бэкап — без ручного запуска setup */
function ensureSetup_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_FOR') === SPREADSHEET_ID) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;           // setup уже идёт в другом запросе
  try {
    if (props.getProperty('SETUP_FOR') === SPREADSHEET_ID) return;
    setup();
    props.setProperty('SETUP_FOR', SPREADSHEET_ID);
  } catch (err) { console.error('setup: ' + err); }
  finally { lock.releaseLock(); }
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
  journalSheet_();
  // триггеры пересоздаются заново — на «Glorax_Учёт», без дублей
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['onSheetEdit', 'onSheetChange', 'backupToDrive'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SPREADSHEET_ID).onEdit().create();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(SPREADSHEET_ID).onChange().create();
  // ежедневный бэкап на Google Диск в 03:00
  ScriptApp.newTrigger('backupToDrive').timeBased().everyDays(1).atHour(3).inTimezone('Europe/Moscow').create();
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
/**
 * Версия данных = отметка правок «Glorax_Учёт» + время последнего изменения «Выполнения» и «VUP CORE».
 * Так приложение замечает правки во всех трёх таблицах (в чужих таблицах наши триггеры не работают).
 */
function version_() {
  const own = PropertiesService.getScriptProperties().getProperty('V') || stamp_();
  const cache = CacheService.getScriptCache();
  let ext = cache.get('EXTV');
  if (!ext) {
    ext = [SPREADSHEET_ID, VOLUMES_ID, VUP_ID].map(function (id) {
      try { return String(DriveApp.getFileById(id).getLastUpdated().getTime()); } catch (e) { return '0'; }
    }).join('.');
    cache.put('EXTV', ext, 15);
  }
  return own + '.' + ext;
}

function progressSheet_() {
  let sh = ss_().getSheetByName(SHEET_PROGRESS);
  if (sh) return sh;
  sh = ss_().insertSheet(SHEET_PROGRESS);
  sh.getRange(1, 1, 1, PROGRESS_HEADER.length).setValues([PROGRESS_HEADER]).setFontWeight('bold').setBackground('#e3f3e8');
  sh.setFrozenRows(1);
  sh.getRange(2, 4, 1000, 1).setDataValidation(
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
    docsHead: safe_(function () { const r = readDocsRows_(); return r.head || []; }),
    remarks: readRemarks_(),
    fin: readFin_(),
    extra: readExtra_(),
    checks: safe_(checks_),
    updated: new Date().toISOString(),
  };
}

function readProgress_() {
  // проценты этажей берутся из «Выполнения»; лист «Прогресс» — только ручные значения, если он есть
  const sh = ss_().getSheetByName(SHEET_PROGRESS);
  if (!sh) return [];
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, PROGRESS_HEADER.length).getValues()
    .filter(function (r) { return r[0] !== '' && r[2] !== ''; })
    .map(function (r) {
      return {
        section: secId_(r[0]),
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
  const w = Math.min(sh.getLastColumn(), 30);
  const rows = sh.getRange(3, 1, last - 2, w).getDisplayValues().map(function (r, i) { r.push(i + 3); return r; }).filter(function (r) { return parseRowLabel_(r[0]); });
  rows.head = sh.getRange(1, 1, 2, w).getDisplayValues();
  return rows;
}

function readRemarks_() {
  const sh = ss_().getSheetByName(SHEET_REMARKS);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 6) return [];
  return rowsOf_(sh, 6, 24)
    .filter(function (r) { return r[4] || r[5]; })
    .map(function (r) {
      return { row: r.row, due1: r[9], n: r[0], text: r[4], short: r[5] || r[4], section: String(r[6]), who: r[7], due: r[16] || r[9], moves: r[17], status: r[19], done: r[20], state: r[22], note: r[23] };
    });
}

// ---------------------------------------------------------------- другие таблицы

function readExtra_() {
  const volumes = safe_(readVolumes_);
  return {
    structure: structure_(volumes),
    volumes: volumes,
    moves: safe_(readMoves_),
    worklog: safe_(readWorklog_),
    floorStatus: safe_(readFloorStatus_),
    plan: safe_(readPlan_),
    discrepancies: safe_(readDiscrepancies_),
    inventory: safe_(readInventory_),
    sources: safe_(sourcesInfo_),
  };
}

function sourcesInfo_() {
  const me = Session.getEffectiveUser().getEmail();
  return [['G', SPREADSHEET_ID], ['V', VOLUMES_ID], ['U', VUP_ID]].map(function (x) {
    const out = { key: x[0], id: x[1], title: '', canEdit: false, owner: '' };
    try { out.title = SpreadsheetApp.openById(x[1]).getName(); } catch (e) { out.error = 'нет доступа'; return out; }
    out.canEdit = canEdit_(x[1]);
    try { out.owner = DriveApp.getFileById(x[1]).getOwner().getEmail(); } catch (e) { /* */ }
    out.me = me;
    return out;
  });
}

/** Есть ли у владельца скрипта право записи в таблицу */
function canEdit_(id) {
  const cache = CacheService.getScriptCache();
  const k = 'CE_' + id, c = cache.get(k);
  if (c) return c === '1';
  let ok = false;
  try {
    const me = Session.getEffectiveUser().getEmail();
    const f = DriveApp.getFileById(id);
    ok = f.getOwner().getEmail() === me || f.getEditors().some(function (u) { return u.getEmail() === me; });
  } catch (e) { ok = false; }
  cache.put(k, ok ? '1' : '0', 300);
  return ok;
}

/** «Выполнение», листы «Секция 4/5»: B этаж, D вид работ, E объём, H выполнено, N принято (КС-6а), O… по неделям */
function readVolumes_() {
  const book = SpreadsheetApp.openById(VOLUMES_ID);
  const out = [];
  sectionSheets_(book).forEach(function (x) {
    const sec = x.id, sh = x.sheet;
    if (sh.getLastRow() < 3) return;
    const w = Math.min(sh.getLastColumn(), 60);
    const head = sh.getRange(2, 1, 1, w).getDisplayValues()[0];
    const weeks = [];
    for (let c = 14; c < w; c++) { const d = ddmmyy_(head[c]); if (d) weeks.push([c, d]); }
    const weekCols = {}; weeks.forEach(function (wk) { weekCols[wk[1]] = wk[0] + 1; });
    const rows = sh.getRange(3, 1, sh.getLastRow() - 2, w).getDisplayValues();
    let floor = null;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (/итого/i.test(r[0] + r[1] + r[3])) break;
      if (String(r[1]).trim() !== '') floor = parseFloor_(r[1]);
      const work = String(r[3]).trim();
      if (floor === null || !work) continue;
      const total = num_(r[4]);
      if (!total) continue;
      const weekly = {};
      weeks.forEach(function (wk) { const v = num_(r[wk[0]]); if (v) weekly[wk[1]] = v; });
      out.push({ row: i + 3, sheet: sh.getName(), weekCols: weekCols, section: sec, floor: floor, work: work, total: total, done: num_(r[7]), accepted: num_(r[13]), status: String(r[10]).trim(), due: String(r[9]).trim(), handover: String(r[0]).trim(), contractor: String(r[2]).trim(), weekly: weekly });
    }
  });
  return out;
}

/** Листы «Секция …» в таблице объёмов — это и есть секции проекта (добавили лист — появилась секция) */
function sectionSheets_(book) {
  return book.getSheets().map(function (sh) {
    const m = sh.getName().match(/^\s*Секци[яи]\s*(.+?)\s*$/i);
    return m ? { id: m[1], sheet: sh } : null;
  }).filter(Boolean);
}

/** Структура проекта: секции (листы «Секция …») и этажность каждой (столбец «Этаж») — из таблицы, не из кода */
function structure_(vols) {
  const secs = {};
  try {
    sectionSheets_(SpreadsheetApp.openById(VOLUMES_ID)).forEach(function (x) {
      let top = 0;
      const n = x.sheet.getLastRow();
      if (n >= 3) x.sheet.getRange(3, 2, n - 2, 1).getDisplayValues().forEach(function (r) { const f = parseFloor_(r[0]); if (f !== null && f !== ROOF && f < 200) top = Math.max(top, f); });
      secs[x.id] = top;
    });
  } catch (e) { /* таблица недоступна — по строкам объёмов */ }
  (vols || []).forEach(function (v) { if (v.floor !== ROOF && v.floor < 200) secs[v.section] = Math.max(secs[v.section] || 0, v.floor); });
  return { sections: Object.keys(secs).map(function (id) { return { id: id, floors: secs[id] || 1 }; }), roofKey: ROOF };
}

/** «VUP CORE»: Движение материалов */
function readMoves_() {
  const sh = SpreadsheetApp.openById(VUP_ID).getSheetByName('Движение материалов');
  if (!sh || sh.getLastRow() < 2) return [];
  return rowsOf_(sh, 2, 14)
    .filter(function (r) { return r[0] || r[4]; })
    .map(function (r) {
      const zone = String(r[5]);
      const fm = zone.match(/(\d+)\s*этаж/i), sm = zone.match(/секци[яи]\s*(\d)/i);
      return { row: r.row, rawDate: r[2], id: r[0], date: pickDate_(r[2]) || pickDate_(r[8]) || pickDate_(r[11]), dateExact: !!pickDate_(r[2]), type: r[3], material: r[4], zone: zone,
        floor: fm ? +fm[1] : null, section: sm ? sm[1] : '', pallets: num_(r[6]), doc: r[8], status: r[9], comment: String(r[13]).slice(0, 300) };
    });
}

/** «VUP CORE»: Стройка · ход работ (бригады, число рабочих) */
function readWorklog_() {
  const sh = SpreadsheetApp.openById(VUP_ID).getSheetByName('Стройка · ход работ');
  if (!sh || sh.getLastRow() < 2) return [];
  return rowsOf_(sh, 2, 14)
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { row: r.row, id: r[0], section: String(r[2]), floor: parseFloor_(r[3]), brigade: r[4], stage: r[5], start: pickDate_(r[6]) || pickDate_(r[13]), end: pickDate_(r[7]), status: r[8], workers: num_(r[9]), shifts: num_(r[10]), volume: num_(r[11]), unit: r[12], source: r[13] }; });
}

/** «VUP CORE»: Стройка · статусы этажей */
function readFloorStatus_() {
  const sh = SpreadsheetApp.openById(VUP_ID).getSheetByName('Стройка · статусы этажей');
  if (!sh || sh.getLastRow() < 2) return [];
  return rowsOf_(sh, 2, 6)
    .filter(function (r) { return r[0] && r[1]; })
    .map(function (r) { return { row: r.row, section: String(r[0]), floor: parseFloor_(r[1]), status: r[2], date: pickDate_(r[3]), source: r[4], comment: r[5] }; });
}

/** «VUP CORE»: Стройка · план — потребность материала по этажам, паллет */
function readPlan_() {
  const sh = SpreadsheetApp.openById(VUP_ID).getSheetByName('Стройка · план');
  if (!sh || sh.getLastRow() < 2) return [];
  return rowsOf_(sh, 2, 8)
    .filter(function (r) { return r[0] && r[3]; })
    .map(function (r) {
      const zone = String(r[2]); const fm = zone.match(/(\d+)\s*этаж/i), sm = zone.match(/секци[яи]\s*(\d)/i);
      return { row: r.row, id: r[0], date: pickDate_(r[1]), zone: zone, floor: fm ? +fm[1] : null, section: sm ? sm[1] : '', material: r[3], pallets: num_(r[4]), source: r[5], rule: r[6], comment: r[7] };
    });
}

/** «VUP CORE»: Стройка · контроль расхождений */
function readDiscrepancies_() {
  const sh = SpreadsheetApp.openById(VUP_ID).getSheetByName('Стройка · контроль расхождений');
  if (!sh || sh.getLastRow() < 2) return [];
  return rowsOf_(sh, 2, 9)
    .filter(function (r) { return r[0] && r[2]; })
    .map(function (r) { return { row: r.row, section: String(r[0]), floor: parseFloor_(r[1]), material: r[2], plan: num_(r[3]), fact: num_(r[4]), diff: num_(r[5]), status: r[6], date: pickDate_(r[7]), note: r[8] }; });
}

/** «VUP CORE»: Стройка · инвентаризация склада */
function readInventory_() {
  const sh = SpreadsheetApp.openById(VUP_ID).getSheetByName('Стройка · инвентаризация склада');
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 9).getDisplayValues()
    .filter(function (r) { return r[2]; })
    .map(function (r) { return { id: r[0], date: pickDate_(r[1]), material: r[2], unit: r[3], qty: num_(r[4]), source: r[5], comment: r[6], calc: num_(r[7]), status: r[8] }; });
}

// ---------------------------------------------------------------- запись в любую разрешённую ячейку

const BOOKS = { G: SPREADSHEET_ID, V: VOLUMES_ID, U: VUP_ID };
/** Какие поля каких листов можно менять из приложения (номер колонки). Остальное — только чтение. */
const EDITABLE = {
  'G|Счета': { date: 3, cat: 4, who: 5, basis: 6, note: 7, sum: 8 },
  'G|Журнал': { date: 1, section: 2, type: 3, name: 4, qty: 5, unit: 6, note: 7 },
  'G|Для РП': { date: 4, sum: 6, status: 7, desc: 8 },
  'G|Оплаты Глоракс': { status: 3, date: 4, note: 5, sum: 6 },
  'G|Личные расходы': { date: 1, name: 2, sum: 3, who: 4, note: 5 },
  'G|УЧЁТ ИНСТРУМЕНТА ': { name: 2, qty: 3 },
  'G|Формула оплаты Глоракс ': { value: 2 },
  'G|Замечания АСГ': { due1: 10, due2: 11, due3: 12, due4: 13, due5: 14, due6: 15, due7: 16, status: 20, done: 21, note: 24 },
  'G|Таблица': { cell: 0 },
  'V|Секция 4': { total: 5, accepted: 14, week: 0 },
  'V|Секция 5': { total: 5, accepted: 14, week: 0 },
  'U|Движение материалов': { date: 3, type: 4, material: 5, zone: 6, pallets: 7, doc: 9, status: 10, comment: 14 },
  'U|Стройка · ход работ': { section: 3, floor: 4, brigade: 5, stage: 6, start: 7, end: 8, status: 9, workers: 10 },
  'U|Стройка · статусы этажей': { section: 1, floor: 2, status: 3, date: 4, source: 5, comment: 6 },
  'U|Стройка · план': { pallets: 5, comment: 8 },
  'U|Стройка · контроль расхождений': { status: 7, note: 9 },
};
const DATE_FIELDS = /^(date|done|start|end|due\d)$/;
const NUM_FIELDS = /^(sum|qty|pallets|workers|total|accepted|week|value)$/;

function cellValue_(field, v) {
  if (v === '' || v == null) return '';
  if (DATE_FIELDS.test(field)) { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : String(v); }
  if (NUM_FIELDS.test(field)) { const n = num_(v); if (isNaN(n)) throw new Error('Нужно число'); return n; }
  return String(v);
}
function sheetFor_(b, s) {
  const id = BOOKS[b]; if (!id) throw new Error('Неизвестная таблица');
  if (b !== 'G' && !canEdit_(id)) throw new Error('Нет прав на запись в эту таблицу — нужен доступ «Редактор»');
  const sh = SpreadsheetApp.openById(id).getSheetByName(s);
  if (!sh) throw new Error('Нет листа «' + s + '»');
  return sh;
}

/** {b, s, r, f, c?, value, expect} → запись в ячейку с проверками: поле разрешено, не формула, не изменилось в таблице */
function setCell_(q) {
  const map = EDITABLE[q.b + '|' + q.s];
  if (!map || !(q.f in map)) throw new Error('Это поле не редактируется из приложения');
  let col = map[q.f];
  const sh = sheetFor_(q.b, q.s);
  if (q.f === 'week') {
    col = Number(q.c);
    if (!(col >= 15) || !ddmmyy_(sh.getRange(2, col).getDisplayValue())) throw new Error('Неверная неделя');
  }
  if (q.f === 'cell') {   // «Таблица»: колонки ИС/АОСР/замечаний по секциям, кроме названия строки
    col = Number(q.c);
    if (!(col >= 2 && col <= sh.getLastColumn())) throw new Error('Неверная колонка');
  }
  const row = Number(q.r);
  if (!(row >= 2)) throw new Error('Неверная строка');
  const cell = sh.getRange(row, col);
  if (cell.getFormula()) throw new Error('В ячейке формула — значение считается из других ячеек, его нельзя поменять напрямую');
  const before = cell.getDisplayValue();
  if (q.expect != null && !same_(before, q.expect)) throw new Error('Ячейку уже изменили в таблице: сейчас «' + before + '». Обновите приложение и повторите');
  cell.setValue(cellValue_(q.f, q.value));
  if (DATE_FIELDS.test(q.f) && cell.getValue() instanceof Date) cell.setNumberFormat('dd.MM.yyyy');
  SpreadsheetApp.flush();
  return { sheet: q.s, row: row, cell: cell.getA1Notation(), before: before, check: { display: cell.getDisplayValue(), value: cell.getValue() instanceof Date ? toIsoDate_(cell.getValue()) : cell.getValue() } };
}

/** {b, s, values:{поле: значение}} → новая строка в конце списка */
function addRow_(q) {
  const map = EDITABLE[q.b + '|' + q.s];
  if (!map) throw new Error('В этот лист нельзя добавлять строки из приложения');
  const sh = sheetFor_(q.b, q.s);
  let last = sh.getLastRow();
  // первая пустая строка после последней заполненной в колонке A/B (листы бывают с предзаполненными категориями)
  const vals = sh.getRange(1, 1, last, 2).getDisplayValues();
  while (last > 1 && !vals[last - 1][0] && !vals[last - 1][1]) last--;
  const row = last + 1;
  const width = Math.max.apply(null, Object.keys(map).map(function (k) { return map[k]; }).concat([1]));
  const line = sh.getRange(row, 1, 1, width).getValues()[0];
  Object.keys(q.values || {}).forEach(function (k) { if (map[k]) line[map[k] - 1] = cellValue_(k, q.values[k]); });
  if (q.b === 'U' && !line[0]) line[0] = 'APP-' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss');
  sh.getRange(row, 1, 1, width).setValues([line]);
  SpreadsheetApp.flush();
  return { sheet: q.s, row: row, check: { display: sh.getRange(row, 1, 1, width).getDisplayValues()[0].join(' | ') } };
}
function norm_(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
/** «Значение не изменилось»: числа сравниваются как числа, даты как даты, остальное как текст */
function same_(a, b) {
  const A = norm_(a), B = norm_(b);
  if (A === B) return true;
  const na = Number(A.replace(/[\s₽%]/g, '').replace(',', '.')), nb = Number(B.replace(/[\s₽%]/g, '').replace(',', '.'));
  if (A !== '' && B !== '' && !isNaN(na) && !isNaN(nb)) return Math.abs(na - nb) < 0.005;
  const da = pickDate_(A), db = pickDate_(B);
  return !!da && da === db;
}

// ---------------------------------------------------------------- сверка: итоги таблиц против того, что видит приложение

function checks_() {
  const out = [];
  try {
    const sh = ss_().getSheetByName(SHEET_EXPENSES);
    const total = num_(sh.getRange('H1').getValue());
    const sum = readExpenses_().reduce(function (a, e) { return a + e.sum; }, 0);
    out.push({ name: '«Счета»: итог в ячейке H1 и сумма всех строк', table: total, app: Math.round(sum * 100) / 100 });
  } catch (e) { /* */ }
  try {
    const book = SpreadsheetApp.openById(VOLUMES_ID);
    const vols = readVolumes_();
    sectionSheets_(book).forEach(function (x) {
      const sec = x.id, sh = x.sheet;
      const rows = sh.getRange(3, 1, sh.getLastRow() - 2, 9).getDisplayValues();
      let inTotals = false;
      rows.forEach(function (r) {
        if (/итого по секции/i.test(r[0])) { inTotals = true; return; }
        if (!inTotals || !r[3] || /руб/i.test(r[3])) return;
        const work = String(r[3]).trim();
        const app = vols.filter(function (v) { return v.section === sec && v.work === work; }).reduce(function (a, v) { return a + v.done; }, 0);
        out.push({ name: '«Выполнение», секция ' + sec + ': ' + work + ' — выполнено (строка «Итого») и сумма этажей', table: num_(r[7]), app: Math.round(app * 100) / 100 });
      });
    });
  } catch (e) { /* */ }
  return out.map(function (c) { c.ok = Math.abs((c.table || 0) - (c.app || 0)) < 0.011; return c; });
}

/** «02.11.26» / «02.11.2026» → ISO (для шапки недель; будущие даты допустимы) */
function ddmmyy_(v) {
  const m = String(v || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (!m) return '';
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

// ---------------------------------------------------------------- финансы

function readFin_() {
  return {
    expenses: safe_(readExpenses_), advances: safe_(readAdvances_), income: safe_(readIncome_), nominated: safe_(readNominated_),
    personal: safe_(readPersonal_), tools: safe_(readTools_), contract: safe_(readContract_),
  };
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
  let prevDate = '';
  disp.forEach(function (r, i) {
    const sum = num_(raw[i][0]);
    if (!sum) return;
    const mark = String(r[6] || '').match(/\[app:([\w-]+)\]/);
    // дата: «Дата платежа» → «Дата счёта» → лучшая дата из основания/примечания → дата строки выше
    let date = pickDate_(r[2]) || pickDate_(r[1]) || pickDate_(r[5] + ' ' + r[6]);
    const approx = !date && !!prevDate;
    if (!date) date = prevDate;
    prevDate = date || prevDate;
    out.push({
      id: mark ? mark[1] : 'r' + (i + 5), app: !!mark,
      n: r[0], row: i + 5,
      date: date, approx: approx,
      cat: String(r[3] || 'Прочее').trim(), who: String(r[4] || '').trim(),
      basis: String(r[5] || '').replace(/\s+/g, ' ').slice(0, 160), note: String(r[6] || '').replace(/\s*\[app:[\w-]+\]/, '').replace(/\s+/g, ' ').slice(0, 120),
      sum: sum,
    });
  });
  return out;
}

/** «Личные расходы»: с 3-й строки. A дата, B наименование, C сумма, D плательщик, E примечание */
function readPersonal_() {
  const sh = ss_().getSheetByName(SHEET_PERSONAL);
  if (!sh || sh.getLastRow() < 3) return [];
  let prev = '';
  return rowsOf_(sh, 3, 5)
    .filter(function (r) { return num_(r[2]); })
    .map(function (r) {
      const d = pickDate_(r[0]); const approx = !d && !!prev; const date = d || prev; prev = date;
      return { row: r.row, date: date, approx: approx, name: String(r[1]).trim(), sum: num_(r[2]), who: String(r[3]).trim(), note: String(r[4]).trim() };
    });
}

/** «УЧЁТ ИНСТРУМЕНТА»: дата остатков в B1, со 3-й строки: A №, B наименование, C количество */
function readTools_() {
  const sh = ss_().getSheetByName(SHEET_TOOLS);
  if (!sh || sh.getLastRow() < 3) return [];
  const date = pickDate_(sh.getRange(1, 2).getDisplayValue());
  return rowsOf_(sh, 3, 3)
    .filter(function (r) { return String(r[1]).trim(); })
    .map(function (r) { return { row: r.row, n: r[0], name: String(r[1]).trim(), qty: String(r[2]).trim(), date: date }; });
}

/** «Формула оплаты Глоракс»: пары «подпись — значение» (подписи в колонке C, значения в B; справа — доп. значение в D) */
function readContract_() {
  const sh = ss_().getSheetByName(SHEET_CONTRACT);
  if (!sh) return [];
  const n = Math.min(sh.getLastRow(), 40);
  const v = sh.getRange(1, 1, n, 5).getDisplayValues();
  const f = sh.getRange(1, 1, n, 5).getFormulas();
  const out = [];
  v.forEach(function (r, i) {
    const label = String(r[2] || '').trim();
    if (label && num_(r[1]) && !/^\d/.test(label)) out.push({ row: i + 1, label: label, value: num_(r[1]), formula: !!f[i][1], extra: num_(r[3]) || null });
  });
  return out;
}

/** «Для РП»: с 3-й строки. A №, C тип, D дата, F сумма, G статус, H описание */
function readAdvances_() {
  const sh = ss_().getSheetByName(SHEET_ADVANCES);
  if (!sh || sh.getLastRow() < 3) return [];
  return rowsOf_(sh, 3, 8)
    .filter(function (r) { return /^\d+$/.test(String(r[0]).trim()) && num_(r[5]); })
    .map(function (r) { return { row: r.row, n: r[0], type: String(r[2]).replace('Аванс за ', '').replace(/^н/, 'Н'), date: pickDate_(r[3]), sum: num_(r[5]), status: r[6], desc: r[7] }; });
}

/** «Оплаты Глоракс»: с 4-й строки. A №, B дата счёта, C статус, D дата платежа, E примечание, F сумма */
function readIncome_() {
  const sh = ss_().getSheetByName(SHEET_INCOME);
  if (!sh || sh.getLastRow() < 4) return [];
  return rowsOf_(sh, 4, 6)
    .filter(function (r) { return num_(r[5]); })
    .map(function (r) { return { row: r.row, n: r[0], date: findDate_(r[3]) || findDate_(String(r[1]).replace(/\//g, '.')), status: r[2], note: r[4], sum: num_(r[5]) }; });
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
  SpreadsheetApp.flush();
  return { sheet: SHEET_EXPENSES, row: row, check: { sum: num_(sh.getRange(row, 8).getValue()) } };
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
  SpreadsheetApp.flush();
  return { sheet: SHEET_EXPENSES, row: row, check: { sum: num_(sh.getRange(row, 8).getValue()) } };
}

/** Удаляет только строки, добавленные из приложения */
function deleteExpense_(id) {
  const sh = ss_().getSheetByName(SHEET_EXPENSES);
  if (/^r\d+$/.test(id)) throw new Error('Строки, внесённые в таблице вручную, удаляйте в самой таблице');
  const row = findExpenseRow_(sh, id);
  if (row) sh.deleteRow(row);
  return { deleted: row ? 1 : 0, sheet: SHEET_EXPENSES, row: row };
}

function num_(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v || '').replace(/[\s\u00a0₽]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
const RU_M_ = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
/**
 * Все даты в тексте: «17.04.2026», «2026-04-17», «от 4 июля 2026», ««19» мая», «22 мая», «18.05.202» (опечатка года).
 * Без года (или с обрезанным годом) — текущий год. Возвращает лучшую: самую позднюю правдоподобную;
 * дата из будущего (опечатка «2027») сдвигается на год назад.
 */
function pickDate_(text) {
  if (text instanceof Date) return Utilities.formatDate(text, tz_(), 'yyyy-MM-dd');
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return '';
  const now = new Date();
  const Y = now.getFullYear();
  const max = Utilities.formatDate(new Date(now.getTime() + 31 * 864e5), tz_(), 'yyyy-MM-dd');
  const iso = function (y, m, d) { return (m >= 1 && m <= 12 && d >= 1 && d <= 31) ? y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2) : ''; };
  const c = [];
  let m;
  const re1 = /(\d{4})-(\d{2})-(\d{2})/g;
  while ((m = re1.exec(s))) c.push(iso(+m[1], +m[2], +m[3]));
  const re2 = /(?:^|[^\d№\/])(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})(?!\d)/g;
  while ((m = re2.exec(s))) c.push(iso(m[3].length === 4 ? +m[3] : Y, +m[2], +m[1]));
  const re3 = /(?:^|[^\d№\/.,])(\d{1,2})\.(\d{1,2})(?![\d.\/])/g;      // 28.04 — без года
  while ((m = re3.exec(s))) c.push(iso(Y, +m[2], +m[1]));
  const re4 = /«?(\d{1,2})»?\s+([а-я]+)(?:\s+(\d{4}))?/g;
  while ((m = re4.exec(s))) {
    for (let i = 0; i < RU_M_.length; i++) {
      const x = RU_M_[i];
      if (m[2].indexOf(x) === 0 && (x !== 'ма' || m[2] === 'мая' || m[2] === 'май')) { c.push(iso(m[3] ? +m[3] : Y, i + 1, +m[1])); break; }
    }
  }
  const ok = c.filter(function (d) { return d && d >= '2025-01-01' && d <= max; }).sort();
  if (ok.length) return ok[ok.length - 1];
  const fut = c.filter(function (d) { return d && d > max; }).map(function (d) { return (+d.slice(0, 4) - 1) + d.slice(4); }).filter(function (d) { return d <= max; }).sort();
  return fut.length ? fut[fut.length - 1] : '';
}

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
  if (!section) throw new Error('Нет секции');
  if (!(floor >= 0 && (floor <= 200 || floor === ROOF))) throw new Error('Неверный этаж');
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const sh = progressSheet_();
  const n = Math.max(0, sh.getLastRow() - 1);
  const vals = n ? sh.getRange(2, 1, n, 3).getValues() : [];
  const now = new Date();
  for (let i = 0; i < vals.length; i++) {
    if (secId_(vals[i][0]) === String(section) && parseFloor_(vals[i][1]) === floor && String(vals[i][2]).trim() === work) {
      sh.getRange(i + 2, 4, 1, 3).setValues([[v, now, '']]);
      sh.getRange(i + 2, 5).setNumberFormat('dd.MM.yyyy HH:mm');
      SpreadsheetApp.flush();
      return { sheet: SHEET_PROGRESS, row: i + 2, check: { value: pct_(sh.getRange(i + 2, 4).getValue()) } };
    }
  }
  sh.appendRow([section, floorLabel_(floor), work, v, now, '']);
  SpreadsheetApp.flush();
  return { sheet: SHEET_PROGRESS, row: sh.getLastRow(), check: { value: pct_(sh.getRange(sh.getLastRow(), 4).getValue()) } };
}

function addJournal_(e) {
  if (!e.date) throw new Error('Нет даты');
  const sh = journalSheet_();
  const p = String(e.date).split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  const id = String(e.id || ('j' + Utilities.getUuid().slice(0, 8)));
  sh.appendRow([d, String(e.section || 'Общее'), e.type === 'Люди' ? 'Люди' : 'Материал', String(e.name || ''), Number(e.qty) || 0, String(e.unit || ''), String(e.note || ''), id]);
  SpreadsheetApp.flush();
  return { id: id, sheet: SHEET_JOURNAL, row: sh.getLastRow(), check: journalCheck_(sh, sh.getLastRow()) };
}

function updateJournal_(e) {
  const sh = journalSheet_();
  const n = sh.getLastRow() - 1;
  const ids = n > 0 ? sh.getRange(2, 8, n, 1).getValues() : [];
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(e.id)) {
      const p = String(e.date).split('-').map(Number);
      sh.getRange(i + 2, 1, 1, 7).setValues([[new Date(p[0], p[1] - 1, p[2]), String(e.section || 'Общее'), e.type === 'Люди' ? 'Люди' : 'Материал', String(e.name || ''), Number(e.qty) || 0, String(e.unit || ''), String(e.note || '')]]);
      SpreadsheetApp.flush();
      return { sheet: SHEET_JOURNAL, row: i + 2, check: journalCheck_(sh, i + 2) };
    }
  }
  return addJournal_(e); // строку удалили в таблице — создаём заново
}

function journalCheck_(sh, row) {
  const r = sh.getRange(row, 1, 1, 8).getValues()[0];
  return { date: toIsoDate_(r[0]), name: String(r[3]), qty: Number(String(r[4]).replace(',', '.')) || 0, id: String(r[7]) };
}

function deleteJournal_(id) {
  const sh = journalSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return { deleted: 0 };
  const ids = sh.getRange(2, 8, n, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === id) { sh.deleteRow(i + 2); return { deleted: 1, sheet: SHEET_JOURNAL, row: i + 2 }; }
  }
  return { deleted: 0 };
}

// ---------------------------------------------------------------- утилиты

function worksForFloor_(f) {
  if (f === 0) return ['Перегородки'];
  if (f === ROOF) return ['Кровля'];
  return ['Наружные стены', 'Перегородки'];
}
function secId_(v) { return String(v).replace(/^\s*Секци[яи]\s*/i, '').trim(); }
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
