// Ошибки в браузере игрока: шлём на сервер (одинаковые там склеиваются),
// а последние держим под рукой — их приложит жалоба.
import { ERRLOG } from '../shared/support.ts';
import { ApiError, authHeaderValue } from './api.ts';

export const BUILD = document.querySelector('script[type=module]')?.getAttribute('src') ?? 'dev';

const recent: { t: number; msg: string }[] = [];
let sent = 0;

/** Последние ошибки и неудачные действия — для жалобы. */
export function recentErrors() {
  return recent.slice(-8);
}

/** Запомнить неудачу (например, отказ сервера) — без отправки на сервер. */
export function noteFailure(msg: string) {
  recent.push({ t: Date.now(), msg: msg.slice(0, 200) });
  if (recent.length > 20) recent.shift();
}

export function logError(msg: string, stack = '') {
  noteFailure(msg);
  if (sent >= ERRLOG.perSession) return;
  sent++;
  const body = JSON.stringify({ msg: msg.slice(0, ERRLOG.maxMsg), stack: stack.slice(0, ERRLOG.maxStack), ua: navigator.userAgent.slice(0, 200) });
  fetch('/log', { method: 'POST', headers: { 'content-type': 'application/json', authorization: authHeaderValue() }, body, keepalive: true }).catch(() => null);
}

export function initErrorLog() {
  window.addEventListener('error', (e) => {
    // ошибки загрузки картинок и скриптов сторонних расширений не интересны
    if (!e.message) return;
    // «Script error.» без файла и строки — чужой скрипт (Telegram, расширение): браузер прячет подробности,
    // починить по ней нечего — не засоряем журнал админа
    if (/^Script error\.?$/i.test(e.message) && !e.filename && !e.lineno) return;
    logError(e.message, e.error instanceof Error ? (e.error.stack ?? '') : `${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (r instanceof ApiError) return; // отказ сервера — не ошибка кода
    logError(r instanceof Error ? r.message : String(r), r instanceof Error ? (r.stack ?? '') : '');
  });
}
