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
const VOLUMES_ID = '1UfElwyFGpqPo93bvn1BSOKSF7ydP2X4kPDyLsYBo5f8';   // «Выполнение»: объёмы по этажам и неделям (объект по умолчанию)
const SHEET_OBJECTS = 'Объекты';    // реестр объектов (отдельная таблица «Стройка · объекты»): Название | Ссылка | Тип | Примечание
let CUR_V = VOLUMES_ID;             // таблица объёмов выбранного объекта
// Режим объекта: 'glorax' — проект «Glorax» из трёх таблиц (Glorax_Учёт + Выполнение + VUP CORE);
//                'book'   — самостоятельный объект: ВСЁ в одной таблице по шаблону (объёмы, журнал, расходы, замечания, документы, прогресс)
let MODE = 'glorax';
let CUR_OBJ = null;
const VUP_ID = '119zaY3sQ-7JtZ3JF2ILViGlGe6ULJuDf-jHep_O6X8w';       // «VUP CORE · ЕДИНАЯ БАЗА»: материалы, ход работ, статусы

const SHEET_PROGRESS = 'Прогресс';
const SHEET_JOURNAL = 'Журнал';
let SHEET_DOCS = 'Таблица';
let SHEET_REMARKS = 'Замечания АСГ';
let SHEET_EXPENSES = 'Счета';
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

/** Основная таблица данных: «Glorax_Учёт» у проекта Glorax, у самостоятельного объекта — его собственная таблица */
function ss_() { return SS_CACHE_ || (SS_CACHE_ = SpreadsheetApp.openById(MODE === 'book' ? CUR_V : SPREADSHEET_ID)); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }

// ---------------------------------------------------------------- HTTP

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    checkToken_(p.token);
    ensureSetup_();
    selectObject_(p.obj);
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
    selectObject_(body.obj);
    lock.waitLock(20000);
    let res;
    switch (body.action) {
      case 'setProgress': res = setProgress_(String(body.section), typeof body.floor === 'number' || /^\d+$/.test(String(body.floor)) ? Number(body.floor) : String(body.floor), String(body.work), Number(body.value)); break;
      case 'addJournal': res = addJournal_(body.entry || {}); break;
      case 'deleteJournal': res = deleteJournal_(String(body.id)); break;
      case 'updateJournal': res = updateJournal_(body.entry || {}); break;
      case 'addExpense': res = addExpense_(body.entry || {}); break;
      case 'setCell': res = setCell_(body); break;
      case 'addRow': res = addRow_(body); break;
      case 'newObject': res = newObject_(body); break;
      case 'updateExpense': res = updateExpense_(body.entry || {}, body.expect || {}); break;
      case 'deleteExpense': res = deleteExpense_(String(body.id)); break;
      default: throw new Error('Неизвестное действие: ' + body.action);
    }
    SpreadsheetApp.flush();
    stamp_();
    CacheService.getScriptCache().remove('EXTV' + CUR_V);
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
  // каждый объект реестра: копия его таблицы + JSON всех данных приложения
  safe_(readObjects_).forEach(function (o) {
    try {
      selectObject_(o.id);
      const name = DriveApp.getFileById(ss_().getId()).getName();
      DriveApp.getFileById(ss_().getId()).makeCopy(name + ' — бэкап ' + stamp, folder);
      const data = { format: 'stroyka-backup', version: 1, exportedAt: new Date().toISOString(), source: 'apps-script', object: o.name, data: readAll_() };
      folder.createFile('stroyka-backup-' + String(o.name).replace(/[^\wа-яё]+/gi, '_').slice(0, 40) + '-' + stamp.replace(/[ :]/g, '-') + '.json', JSON.stringify(data), 'application/json');
    } catch (e) { console.error('backup ' + o.name + ': ' + e); }
  });
  selectObject_('');
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
  let ext = cache.get('EXTV' + CUR_V);
  if (!ext) {
    ext = (MODE === 'book' ? [CUR_V] : [SPREADSHEET_ID, CUR_V, VUP_ID]).map(function (id) {
      try { return String(DriveApp.getFileById(id).getLastUpdated().getTime()); } catch (e) { return '0'; }
    }).join('.');
    cache.put('EXTV' + CUR_V, ext, 15);
  }
  return own + '.' + ext;
}

/** Лист «Прогресс»: у объекта по умолчанию — в «Glorax_Учёт», у остальных — в таблице самого объекта */
function progressBook_() { return ss_(); }
function progressSheet_() {
  let sh = progressBook_().getSheetByName(SHEET_PROGRESS);
  if (sh) return sh;
  sh = progressBook_().insertSheet(SHEET_PROGRESS);
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
  try { const ids = sectionSheets_(SpreadsheetApp.openById(CUR_V)).map(function (x) { return x.id; }); if (ids.length) sh.getRange('B2:B').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ids.concat(['Общее']), true).setAllowInvalid(true).build()); } catch (e) { /* */ }
  return sh;
}

// ---------------------------------------------------------------- чтение

function readAll_() {
  if (MODE === 'book') {
    return {
      progress: safe_(readProgress_), journal: safe_(readJournal_), docsRows: [], docsHead: [], docsList: safe_(readDocsBook_),
      remarks: safe_(readRemarksBook_), fin: readFin_(), extra: readExtra_(), checks: safe_(checks_),
      object: CUR_OBJ, updated: new Date().toISOString(),
    };
  }
  return {
    object: CUR_OBJ,
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
  let sh = null;
  try { sh = progressBook_().getSheetByName(SHEET_PROGRESS); } catch (e) { return []; }
  if (!sh) return [];
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, PROGRESS_HEADER.length).getValues()
    .filter(function (r) { return r[0] !== '' && r[2] !== ''; })
    .map(function (r) {
      return {
        section: secId_(r[0]),
        floor: levelKey_(r[1]),
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
      id: id, date: date, section: secId_(r[1] || 'Общее'),
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
    objects: safe_(readObjects_),
    object: CUR_V,
    registry: safe_(function () { return registryBook_().getUrl(); }),
    volumes: volumes,
    moves: MODE === 'book' ? [] : safe_(readMoves_),
    worklog: MODE === 'book' ? [] : safe_(readWorklog_),
    floorStatus: MODE === 'book' ? [] : safe_(readFloorStatus_),
    plan: MODE === 'book' ? [] : safe_(readPlan_),
    discrepancies: MODE === 'book' ? [] : safe_(readDiscrepancies_),
    inventory: MODE === 'book' ? [] : safe_(readInventory_),
    sources: safe_(sourcesInfo_),
  };
}

function sourcesInfo_() {
  const me = Session.getEffectiveUser().getEmail();
  return (MODE === 'book' ? [['G', CUR_V], ['V', CUR_V]] : [['G', SPREADSHEET_ID], ['V', CUR_V], ['U', VUP_ID]]).map(function (x) {
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
  const book = SpreadsheetApp.openById(CUR_V);
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
      if (String(r[1]).trim() !== '') floor = levelKey_(r[1]);
      const work = String(r[3]).trim();
      if (floor === null || !work) continue;
      const total = num_(r[4]);
      if (!total) continue;
      const weekly = {};
      weeks.forEach(function (wk) { const v = num_(r[wk[0]]); if (v) weekly[wk[1]] = v; });
      out.push({ row: i + 3, sheet: sh.getName(), weekCols: weekCols, section: sec, floor: floor, work: work, total: total, cost: num_(r[12]) || (num_(r[11]) * total) || 0, done: num_(r[7]), accepted: num_(r[13]), status: String(r[10]).trim(), due: String(r[9]).trim(), handover: String(r[0]).trim(), contractor: String(r[2]).trim(), weekly: weekly });
    }
  });
  return out;
}

/** Слова, которыми в таблице объёмов называют части объекта: «Секция 4», «Квартира 12», «Цех 2», «Корпус Б»… */
const PART_WORDS = ['Секция', 'Секции', 'Корпус', 'Здание', 'Блок', 'Подъезд', 'Квартира', 'Кв.', 'Кв', 'Помещение', 'Офис', 'Цех', 'Склад', 'Ангар', 'Пролёт', 'Пролет', 'Участок', 'Объект', 'Очередь'];
/** Листы-части в таблице объёмов: по слову из листа «Проект» (Часть), иначе — по известным словам */
function sectionSheets_(book) {
  const prj = readProject_();
  const words = prj.part ? [prj.part] : PART_WORDS;
  const re = new RegExp('^\\s*(' + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')\\s*(.*?)\\s*$', 'i');
  return book.getSheets().map(function (sh) {
    const m = sh.getName().match(re);
    if (!m) return null;
    return { id: m[2] || sh.getName(), word: m[1], sheet: sh };
  }).filter(Boolean);
}

/** Лист «Проект» (необязательный, в «Выполнении» или «Glorax_Учёт»): строки «параметр | значение».
 *  Тип объекта (МКД / квартира / помещение / промышленный…), Название, Часть (слово листа: Секция, Квартира, Цех),
 *  Уровень (Этаж, Помещение, Пролёт, Зона). Без листа всё определяется по названиям листов и столбцу уровней. */
function readProject_() {
  if (readProject_.c) return readProject_.c;
  const out = {};
  (MODE === 'book' ? [CUR_V] : [CUR_V, SPREADSHEET_ID]).forEach(function (id) {
    if (out._found) return;
    let sh = null;
    try { sh = SpreadsheetApp.openById(id).getSheetByName('Проект'); } catch (e) { /* */ }
    if (!sh || sh.getLastRow() < 1) return;
    out._found = true;
    sh.getRange(1, 1, Math.min(sh.getLastRow(), 40), 2).getDisplayValues().forEach(function (r) {
      const k = String(r[0]).trim().toLowerCase(), v = String(r[1]).trim();
      if (!v) return;
      if (/^тип/.test(k)) out.type = v;
      else if (/назв/.test(k)) out.name = v;
      else if (/^част|^раздел|^секц/.test(k)) out.part = v;
      else if (/^уров|^этаж|^помещ/.test(k)) out.level = v;
    });
  });
  delete out._found;
  readProject_.c = out;
  return out;
}

/** Лист «Разделы» (необязательный): A — слово из названия работы, B — раздел. «кабель → Электрика», «ВК → Вода и канализация» */
function readWorkMap_() {
  const book = MODE === 'book' ? ss_() : SpreadsheetApp.openById(CUR_V);
  const sh = book.getSheetByName('Разделы');
  if (!sh || sh.getLastRow() < 2) return [];
  const out = [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues();
  for (let i = 0; i < rows.length; i++) {   // до первой пустой строки — ниже может быть справка
    const m = String(rows[i][0]).trim(), sec = String(rows[i][1]).trim();
    if (!m) break;
    if (sec) out.push({ match: m, section: sec });
  }
  return out;
}
/** Структура проекта — из таблицы, не из кода: части (листы) и упорядоченный список уровней каждой (столбец B) */
function structure_(vols) {
  const prj = readProject_();
  const parts = [];
  let word = '', levelWord = '';
  try {
    sectionSheets_(SpreadsheetApp.openById(CUR_V)).forEach(function (x) {
      word = word || x.word;
      const n = x.sheet.getLastRow();
      const levels = [], seen = {};
      if (n >= 2) {
        const col = x.sheet.getRange(2, 2, n - 1, 1).getDisplayValues();
        levelWord = levelWord || String(col[0][0]).trim();
        for (let i = 1; i < col.length; i++) {
          const raw = String(col[i][0]).trim();
          if (!raw) continue;
          if (/итого/i.test(raw)) break;
          const k = levelKey_(raw);
          if (k === null || seen[k]) continue;
          seen[k] = 1; levels.push({ key: k, label: raw });
        }
      }
      parts.push({ id: x.id, levels: levels });
    });
  } catch (e) { /* таблица недоступна — по строкам объёмов */ }
  if (!parts.length) {
    const by = {};
    (vols || []).forEach(function (v) { if (!by[v.section]) by[v.section] = { id: v.section, levels: [], seen: {} }; if (!by[v.section].seen[v.floor]) { by[v.section].seen[v.floor] = 1; by[v.section].levels.push({ key: v.floor, label: String(v.floor) }); } });
    Object.keys(by).forEach(function (k) { parts.push({ id: k, levels: by[k].levels }); });
  }
  parts.forEach(function (p) {
    const nums = p.levels.filter(function (l) { return typeof l.key === 'number' && l.key !== ROOF; }).map(function (l) { return l.key; });
    p.floors = nums.length ? Math.max.apply(null, nums) : 0;
  });
  return { sections: parts, roofKey: ROOF, workMap: safe_(readWorkMap_), project: { type: prj.type || '', name: prj.name || '', part: prj.part || word || 'Секция', level: prj.level || levelWord || 'Этаж' } };
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
    .map(function (r) { return { row: r.row, id: r[0], section: String(r[2]), floor: levelKey_(r[3]), brigade: r[4], stage: r[5], start: pickDate_(r[6]) || pickDate_(r[13]), end: pickDate_(r[7]), status: r[8], workers: num_(r[9]), shifts: num_(r[10]), volume: num_(r[11]), unit: r[12], source: r[13] }; });
}

/** «VUP CORE»: Стройка · статусы этажей */
function readFloorStatus_() {
  const sh = SpreadsheetApp.openById(VUP_ID).getSheetByName('Стройка · статусы этажей');
  if (!sh || sh.getLastRow() < 2) return [];
  return rowsOf_(sh, 2, 6)
    .filter(function (r) { return r[0] && r[1]; })
    .map(function (r) { return { row: r.row, section: String(r[0]), floor: levelKey_(r[1]), status: r[2], date: pickDate_(r[3]), source: r[4], comment: r[5] }; });
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
    .map(function (r) { return { row: r.row, section: String(r[0]), floor: levelKey_(r[1]), material: r[2], plan: num_(r[3]), fact: num_(r[4]), diff: num_(r[5]), status: r[6], date: pickDate_(r[7]), note: r[8] }; });
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

const BOOKS = { get G() { return MODE === 'book' ? CUR_V : SPREADSHEET_ID; }, get V() { return CUR_V; }, get U() { return MODE === 'book' ? '' : VUP_ID; } };
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
  // самостоятельный объект (шаблон «Стройка · объект»)
  'G|Расходы': { date: 3, cat: 4, who: 5, basis: 6, note: 7, sum: 8 },
  'G|Замечания': { date: 2, section: 3, level: 4, text: 5, who: 6, due: 7, status: 8, done: 9, note: 10 },
  'G|Документы': { cell: 0, section: 1, level: 2, work: 3, is: 4, aosr: 5, rem: 6 },
  'V|*': { total: 5, accepted: 14, week: 0 },   // любой лист-часть таблицы объёмов
  'U|Движение материалов': { date: 3, type: 4, material: 5, zone: 6, pallets: 7, doc: 9, status: 10, comment: 14 },
  'U|Стройка · ход работ': { section: 3, floor: 4, brigade: 5, stage: 6, start: 7, end: 8, status: 9, workers: 10 },
  'U|Стройка · статусы этажей': { section: 1, floor: 2, status: 3, date: 4, source: 5, comment: 6 },
  'U|Стройка · план': { pallets: 5, comment: 8 },
  'U|Стройка · контроль расхождений': { status: 7, note: 9 },
};
const DATE_FIELDS = /^(date|done|start|end|due\d?)$/;
const NUM_FIELDS = /^(sum|qty|pallets|workers|total|accepted|week|value)$/;

function cellValue_(field, v) {
  if (v === '' || v == null) return '';
  if (DATE_FIELDS.test(field)) { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : String(v); }
  if (NUM_FIELDS.test(field)) { const n = num_(v); if (isNaN(n)) throw new Error('Нужно число'); return n; }
  return String(v);
}
function sheetFor_(b, s) {
  const id = BOOKS[b]; if (!id) throw new Error('Неизвестная таблица');
  if ((b !== 'G' || MODE === 'book') && !canEdit_(id)) throw new Error('Нет прав на запись в эту таблицу — нужен доступ «Редактор»');
  const sh = SpreadsheetApp.openById(id).getSheetByName(s);
  if (!sh) throw new Error('Нет листа «' + s + '»');
  return sh;
}

/** {b, s, r, f, c?, value, expect} → запись в ячейку с проверками: поле разрешено, не формула, не изменилось в таблице */
function setCell_(q) {
  const map = EDITABLE[q.b + '|' + q.s] || (q.b === 'V' && isPartSheet_(q.s) ? EDITABLE['V|*'] : null);
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
    out.push({ name: '«' + SHEET_EXPENSES + '»: итог в ячейке H1 и сумма всех строк', table: total, app: Math.round(sum * 100) / 100 });
  } catch (e) { /* */ }
  try {
    const book = SpreadsheetApp.openById(CUR_V);
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
        out.push({ name: '«' + x.sheet.getName() + '»: ' + work + ' — выполнено (строка «Итого») и сумма по уровням', table: num_(r[7]), app: Math.round(app * 100) / 100 });
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
  if (floor === null || floor === undefined || floor === '' || (typeof floor === 'number' && !(floor >= 0 && (floor <= 200 || floor === ROOF)))) throw new Error('Неверный этаж / помещение');
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const sh = progressSheet_();
  const n = Math.max(0, sh.getLastRow() - 1);
  const vals = n ? sh.getRange(2, 1, n, 3).getValues() : [];
  const now = new Date();
  for (let i = 0; i < vals.length; i++) {
    if (secId_(vals[i][0]) === String(section) && String(levelKey_(vals[i][1])) === String(floor) && String(vals[i][2]).trim() === work) {
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
function secId_(v) { const t = String(v == null ? '' : v).trim(); const m = t.match(new RegExp('^(' + PART_WORDS.map(function (w) { return w.replace('.', '\\.'); }).join('|') + ')\\s+(.+)$', 'i')); return m ? m[2].trim() : t; }
function floorLabel_(f) { return f === 0 ? 'Подвал' : f === ROOF ? 'Кровля' : String(f); }
/** Ключ уровня: номер этажа (подвал 0, кровля ROOF) или название помещения / пролёта / зоны как есть */
function levelKey_(v) { const f = parseFloor_(v); if (f !== null) return f; const t = String(v == null ? '' : v).trim(); return t || null; }
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


// ---------------------------------------------------------------- объекты: реестр, переключение, новый объект из шаблона

/** «https://docs.google.com/spreadsheets/d/ID/edit» или голый ID → ID */
function sheetId_(v) { const m = String(v || '').match(/\/d\/([\w-]{20,})/); return m ? m[1] : (String(v || '').match(/^[\w-]{20,}$/) || [''])[0]; }

/** Реестр объектов — отдельная таблица «Стройка · объекты» (не внутри какого-либо проекта). Создаётся сама. */
function registryBook_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('REGISTRY_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* удалили — создадим заново */ } }
  const book = SpreadsheetApp.create('Стройка · объекты');
  const sh = book.getSheets()[0].setName(SHEET_OBJECTS);
  sh.getRange(1, 1, 2, 4).setValues([
    ['Название', 'Ссылка на таблицу объекта', 'Тип', 'Примечание'],
    ['Glorax · МКД, секции 4 и 5', 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit', 'Glorax (3 таблицы)', 'объёмы — «Выполнение», материалы — «VUP CORE»'],
  ]);
  sh.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#e3f3e8');
  sh.setFrozenRows(1); sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 420); sh.setColumnWidth(3, 160); sh.setColumnWidth(4, 320);
  sh.getRange(4, 1).setValue('Первая строка — объект, который приложение открывает по умолчанию. Новый объект: «+ Новый объект из шаблона» в приложении или ссылка на копию шаблона здесь.');
  try { DriveApp.getFileById(book.getId()).moveTo(workFolder_()); } catch (e) { /* */ }
  props.setProperty('REGISTRY_ID', book.getId());
  return book;
}
/** Папка «Стройка 3D» на Диске владельца скрипта: реестр и таблицы новых объектов */
function workFolder_() {
  const it = DriveApp.getFoldersByName('Стройка 3D');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Стройка 3D');
}
function readObjects_() {
  const out = [];
  try {
    const sh = registryBook_().getSheetByName(SHEET_OBJECTS);
    if (sh && sh.getLastRow() >= 2) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues().forEach(function (r, i) {
        const id = sheetId_(r[1]);
        if (!id || out.some(function (o) { return o.id === id; })) return;
        const glorax = id === SPREADSHEET_ID || id === VOLUMES_ID;
        out.push({ id: id, name: String(r[0] || 'Объект').trim(), type: String(r[2] || '').trim(), note: String(r[3] || '').trim(), row: i + 2, mode: glorax ? 'glorax' : 'book' });
      });
    }
  } catch (e) { /* реестр недоступен */ }
  if (!out.length) out.push({ id: SPREADSHEET_ID, name: 'Glorax · МКД', type: 'Glorax (3 таблицы)', note: '', mode: 'glorax' });
  return out;
}
/** Выбрать объект запроса — только из реестра (произвольные таблицы не открываются). Пусто — первый в реестре. */
function selectObject_(id) {
  const list = readObjects_();
  const o = list.filter(function (x) { return x.id === id; })[0] || list[0];
  MODE = o.mode; SS_CACHE_ = null; readProject_.c = null;
  CUR_V = MODE === 'book' ? o.id : VOLUMES_ID;
  SHEET_EXPENSES = MODE === 'book' ? 'Расходы' : 'Счета';
  SHEET_REMARKS = MODE === 'book' ? 'Замечания' : 'Замечания АСГ';
  SHEET_DOCS = MODE === 'book' ? 'Документы' : 'Таблица';
  CUR_OBJ = { id: o.id, name: o.name, type: o.type, mode: o.mode, isDefault: o === list[0] };
}
function isPartSheet_(name) {
  try { return sectionSheets_(SpreadsheetApp.openById(CUR_V)).some(function (x) { return x.sheet.getName() === name; }); } catch (e) { return false; }
}

/** «Замечания» объекта: A № | B Дата | C Часть | D Уровень | E Замечание | F Ответственный | G Срок | H Статус | I Выполнено | J Примечание */
function readRemarksBook_() {
  const sh = ss_().getSheetByName(SHEET_REMARKS);
  if (!sh || sh.getLastRow() < 2) return [];
  return rowsOf_(sh, 2, 10)
    .filter(function (r) { return String(r[4]).trim(); })
    .map(function (r) {
      const t = String(r[4]).trim();
      return { row: r.row, n: r[0], date: pickDate_(r[1]), section: secId_(r[2]), level: levelKey_(r[3]), text: t, short: t.length > 90 ? t.slice(0, 88) + '…' : t, who: r[5], due: r[6], status: r[7], done: r[8], note: r[9], sheet: SHEET_REMARKS };
    });
}
/** «Документы» объекта: A Часть | B Уровень | C Вид работ | D ИС | E АОСР | F Замечания по АОСР */
function readDocsBook_() {
  const sh = ss_().getSheetByName(SHEET_DOCS);
  if (!sh || sh.getLastRow() < 2) return [];
  return rowsOf_(sh, 2, 6)
    .filter(function (r) { return String(r[0]).trim() && String(r[1]).trim(); })
    .map(function (r) { return { row: r.row, section: secId_(r[0]), level: levelKey_(r[1]), work: String(r[2]).trim(), is: r[3], aosr: r[4], rem: r[5], sheet: SHEET_DOCS }; });
}

/** Шаблоны видов работ по типу объекта (их можно поменять в созданной таблице) */
const OBJECT_TEMPLATES = {
  mkd:        { type: 'МКД', part: 'Секция', level: 'Этаж', works: ['Монолит перекрытий, м³', 'Кладка наружных стен, м³', 'Перегородки, м²', 'Фасад: утепление и облицовка, м²', 'Окна, шт', 'Электрика, т.', 'Водоснабжение и канализация, т.', 'Отопление и вентиляция, т.', 'Слаботочные системы, т.', 'Пожарная сигнализация, т.', 'Отделка МОП, м²'] },
  flat:       { type: 'Ремонт квартир', part: 'Квартира', level: 'Помещение', works: ['Перегородки, м²', 'Электрика, т.', 'Водоснабжение и канализация, т.', 'Слаботочка, т.', 'Штукатурка стен, м²', 'Стяжка пола, м²', 'Плитка, м²', 'Чистовая отделка, м²', 'Двери, шт'] },
  office:     { type: 'Офис', part: 'Помещение', level: 'Зона', works: ['Перегородки ГКЛ, м²', 'Электрика, т.', 'Слаботочка и СКС, т.', 'Вентиляция и кондиционирование, т.', 'Пожарная сигнализация, т.', 'Потолки, м²', 'Покраска, м²', 'Полы, м²', 'Двери, шт'] },
  industrial: { type: 'Промышленный', part: 'Цех', level: 'Пролёт', works: ['Фундаменты, м³', 'Монтаж каркаса, т', 'Кровля, м²', 'Фасад: сэндвич-панели, м²', 'Ворота и окна, шт', 'Электрика, т.', 'Водоснабжение и канализация, т.', 'Отопление и вентиляция, т.', 'Пожарная безопасность, т.', 'Полы, м²', 'Благоустройство, м²'] },
};
function weekDates_(n) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * 4);   // 4 недели назад, понедельник
  const out = [];
  for (let i = 0; i < n; i++) { out.push(Utilities.formatDate(d, tz_(), 'dd.MM.yy')); d.setDate(d.getDate() + 7); }
  return out;
}
function headRow_(sh, values) {
  sh.getRange(1, 1, 1, values.length).setValues([values]).setFontWeight('bold').setBackground('#e3f3e8');
  sh.setFrozenRows(1);
}
/**
 * Новый самостоятельный объект: одна таблица со всем — части (объёмы по уровням и неделям), «Проект», «Журнал»
 * (люди и поставки), «Расходы», «Замечания», «Документы» (ИС/АОСР), «Как заполнять». Регистрируется в «Стройка · объекты».
 * q: { name, kind: mkd|flat|office|industrial, parts: ['12','15'], levels: ['Кухня', …] или число этажей, works: [...] }
 */
function newObject_(q) {
  const tpl = OBJECT_TEMPLATES[q.kind] || OBJECT_TEMPLATES.flat;
  const name = String(q.name || tpl.type).trim().slice(0, 80);
  const parts = (q.parts || []).map(String).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 40);
  if (!parts.length) parts.push('1');
  let levels = q.levels;
  if (typeof levels === 'number' || /^\d+$/.test(String(levels))) { const n = Math.min(60, Number(levels)); levels = ['Подвал']; for (let i = 1; i <= n; i++) levels.push(String(i)); levels.push('Кровля'); }
  levels = (levels || []).map(String).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 80);
  if (!levels.length) levels = ['1'];
  const works = (q.works && q.works.length ? q.works : tpl.works).map(String).slice(0, 30);
  const book = SpreadsheetApp.create('Стройка · ' + name);
  const weeks = weekDates_(16);
  const head = ['Дата передачи', tpl.level, 'Исполнитель', 'Вид работ', 'Общий объём', 'Остаток', '% остатка', 'Выполнено всего', '% выполн.', 'Срок', 'Статус', 'Расценка', 'Стоимость', 'Принято КС-6а'].concat(weeks);
  const W = head.length, lastCol = columnLetter_(W);
  parts.forEach(function (p, pi) {
    const sh = pi === 0 ? book.getSheets()[0].setName(tpl.part + ' ' + p) : book.insertSheet(tpl.part + ' ' + p);
    const rows = [[tpl.part + ' ' + p].concat(new Array(W - 1).fill('')), head];
    levels.forEach(function (l) {
      works.forEach(function (w, wi) {
        const r = rows.length + 1;
        const line = new Array(W).fill('');
        line[1] = wi === 0 ? l : ''; line[3] = w;
        line[5] = '=IF(E' + r + '="","",E' + r + '-H' + r + ')';
        line[6] = '=IF(N(E' + r + ')=0,"",F' + r + '/E' + r + ')';
        line[7] = '=N(N' + r + ')+SUM(O' + r + ':' + lastCol + r + ')';
        line[8] = '=IF(N(E' + r + ')=0,"",H' + r + '/E' + r + ')';
        line[12] = '=IF(N(L' + r + ')=0,"",E' + r + '*L' + r + ')';
        rows.push(line);
      });
    });
    const end = rows.length;
    rows.push(new Array(W).fill(''));
    rows.push(['Итого по секции'].concat(new Array(W - 1).fill('')));
    works.forEach(function (w) {
      const r = rows.length + 1, line = new Array(W).fill('');
      line[3] = w;
      line[4] = '=SUMIF($D$3:$D$' + end + ',D' + r + ',E$3:E$' + end + ')';
      line[7] = '=SUMIF($D$3:$D$' + end + ',D' + r + ',H$3:H$' + end + ')';
      rows.push(line);
    });
    sh.getRange(2, 15, 1, W - 14).setNumberFormat('@');   // даты недель — текстом «ДД.ММ.ГГ»
    sh.getRange(1, 1, rows.length, W).setValues(rows);
    sh.getRange(2, 1, 1, W).setFontWeight('bold').setBackground('#e3f3e8').setWrap(true);
    sh.getRange(3, 5, end - 2, 1).setBackground('#fffbe0');
    sh.getRange(3, 7, rows.length, 1).setNumberFormat('0%'); sh.getRange(3, 9, rows.length, 1).setNumberFormat('0%');
    sh.setFrozenRows(2); sh.setFrozenColumns(4);
    sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
    sh.getRange(3, 4, end - 2, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(works, true).setAllowInvalid(true).build());
  });
  const partList = SpreadsheetApp.newDataValidation().requireValueInList(parts.concat(['Общее']), true).setAllowInvalid(true).build();
  const levelList = SpreadsheetApp.newDataValidation().requireValueInList(levels.slice(0, 500), true).setAllowInvalid(true).build();
  // Проект
  const prj = book.insertSheet('Проект');
  prj.getRange(1, 1, 5, 2).setValues([['Тип объекта', tpl.type], ['Название', name], ['Часть', tpl.part], ['Уровень', tpl.level], ['Виды работ', works.join('; ')]]);
  prj.getRange(1, 1, 5, 1).setFontWeight('bold'); prj.setColumnWidth(1, 180); prj.setColumnWidth(2, 420);
  // Журнал: люди и поставки
  const jr = book.insertSheet(SHEET_JOURNAL);
  headRow_(jr, ['Дата', tpl.part, 'Тип', 'Наименование', 'Количество', 'Ед.', 'Примечание', 'ID']);
  jr.getRange('A2:A').setNumberFormat('dd.MM.yyyy');
  jr.getRange('B2:B').setDataValidation(partList);
  jr.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Люди', 'Материал'], true).build());
  // Расходы — та же раскладка, что у «Счетов»: итог в H1, строки с 5-й
  const ex = book.insertSheet('Расходы');
  ex.getRange(1, 7, 1, 2).setValues([['Итоговая сумма=', '=SUM(H5:H)']]).setFontWeight('bold');
  ex.getRange(4, 1, 1, 8).setValues([['№', 'Дата счёта', 'Дата платежа', 'Категория', 'Контрагент', 'Основание', 'Назначение', 'Сумма']]).setFontWeight('bold').setBackground('#e3f3e8');
  ex.setFrozenRows(4);
  ex.getRange('B5:C').setNumberFormat('dd.MM.yyyy');
  ex.getRange('D5:D').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Материалы', 'Работы', 'Услуги', 'Логистика', 'Прочее'], true).setAllowInvalid(true).build());
  ex.getRange('H5:H').setNumberFormat('#,##0.00');
  // Замечания
  const rm = book.insertSheet('Замечания');
  headRow_(rm, ['№', 'Дата', tpl.part, tpl.level, 'Замечание', 'Ответственный', 'Срок', 'Статус', 'Выполнено', 'Примечание']);
  rm.getRange('B2:B').setNumberFormat('dd.MM.yyyy'); rm.getRange('G2:G').setNumberFormat('dd.MM.yyyy'); rm.getRange('I2:I').setNumberFormat('dd.MM.yyyy');
  rm.getRange('C2:C').setDataValidation(partList); rm.getRange('D2:D').setDataValidation(levelList);
  rm.getRange('H2:H').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['В работе', 'Срыв сроков', 'Выполнено'], true).setAllowInvalid(true).build());
  rm.setColumnWidth(5, 380);
  // Документы: ИС / АОСР по части × уровню × виду работ
  const dc = book.insertSheet('Документы');
  headRow_(dc, [tpl.part, tpl.level, 'Вид работ', 'ИС', 'АОСР', 'Замечания по АОСР']);
  const drows = [];
  parts.forEach(function (p) { levels.forEach(function (l) { works.forEach(function (w) { if (drows.length < 3000) drows.push([p, l, w, '', '', '']); }); }); });
  if (drows.length) dc.getRange(2, 1, drows.length, 6).setValues(drows);
  dc.setColumnWidth(3, 220);
  // Разделы: какие работы к какому разделу (приложение и само узнаёт электрику, воду, связь, фасады, отделку…)
  const sec = book.insertSheet('Разделы');
  headRow_(sec, ['Слово в названии работы', 'Раздел']);
  sec.getRange(2, 1, 6, 2).setValues([['кабель', 'Электрика'], ['ВК', 'Вода и канализация'], ['ОВ', 'Отопление и вентиляция'], ['СКС', 'Связь и слаботочка'], ['вентфасад', 'Фасад'], ['МОП', 'Отделка']]);
  sec.getRange(9, 1).setValue('Необязательно: без этого листа разделы определяются автоматически. Строка выше пустой строки переопределяет автоматику.');
  sec.setColumnWidth(1, 240); sec.setColumnWidth(2, 220);
  // Как заполнять
  const help = book.insertSheet('Как заполнять');
  help.getRange(1, 1, 9, 1).setValues([
    ['Это самостоятельная таблица объекта «' + name + '»: приложение берёт отсюда всё — объёмы, людей и поставки, расходы, замечания, документы.'],
    ['Листы «' + tpl.part + ' …» — части объекта. Новая часть: копия листа с новым именем («' + tpl.part + ' 2»).'],
    ['Столбец B — ' + tpl.level.toLowerCase() + ': в первой строке группы, ниже — виды работ этого уровня. E — общий объём (без него строка не учитывается), N — принято по КС-6а, с колонки O — объём за неделю (в шапке — понедельник ДД.ММ.ГГ). H считается формулой.'],
    ['«Журнал» — люди и поставки по датам (Тип: Люди / Материал).'],
    ['«Расходы» — счета и платежи; итог в H1 сверяется с суммой строк.'],
    ['«Замечания» — с частью и уровнем: в приложении появятся красным на модели и в категории «Замечания».'],
    ['«Документы» — ИС и АОСР по каждому виду работ.'],
    ['«Проект» — тип объекта и слова интерфейса (Часть, Уровень).'],
    ['Лист «Прогресс» появится сам, если проценты вводить вручную из приложения.'],
  ]);
  help.setColumnWidth(1, 900); help.getRange(1, 1, 9, 1).setWrap(true);
  // в реестр объектов
  const list = registryBook_().getSheetByName(SHEET_OBJECTS);
  list.appendRow([name, book.getUrl(), tpl.type, 'создан из приложения ' + Utilities.formatDate(new Date(), tz_(), 'dd.MM.yyyy')]);
  try { DriveApp.getFileById(book.getId()).moveTo(workFolder_()); } catch (e) { /* останется в корне Диска */ }
  SpreadsheetApp.flush();
  return { id: book.getId(), url: book.getUrl(), sheet: SHEET_OBJECTS, row: list.getLastRow(), check: { display: name } };
}
function columnLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
