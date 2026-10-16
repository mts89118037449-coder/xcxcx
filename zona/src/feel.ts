// «Ощущения» игры: вибрация, отклик на тап, летящие награды, стоп-кадр удара и качество графики.
// Всё здесь работает с DOM напрямую и в своих слоях поверх React — ничего из дерева React не трогаем.

import { tg } from './api.ts';
import { playStep, setSfxHook, type Sfx } from './sound.ts';

// --- вибрация -----------------------------------------------------------------------------

export type Haptic = 'tap' | 'select' | 'hit' | 'heavy' | 'success' | 'error' | 'warning';

const HKEY = 'zona:haptic';
let hapticOn = (() => {
  try {
    return localStorage.getItem(HKEY) !== '0';
  } catch {
    return true;
  }
})();
export const hapticEnabled = () => hapticOn;
export function setHaptic(on: boolean) {
  hapticOn = on;
  try {
    localStorage.setItem(HKEY, on ? '1' : '0');
  } catch {
    /* приватный режим */
  }
  if (on) haptic('success');
}

/** Вибрация по смыслу: тап, выбор, удар, нокаут, награда, отказ. Вне Telegram — navigator.vibrate. */
export function haptic(kind: Haptic) {
  if (!hapticOn) return;
  const h = tg?.HapticFeedback;
  if (h) {
    if (kind === 'tap') h.impactOccurred('light');
    else if (kind === 'select') (h.selectionChanged ? h.selectionChanged() : h.impactOccurred('light'));
    else if (kind === 'hit') h.impactOccurred('medium');
    else if (kind === 'heavy') h.impactOccurred('heavy');
    else h.notificationOccurred(kind);
    return;
  }
  const ms: Record<Haptic, number | number[]> = { tap: 6, select: 4, hit: 18, heavy: [30, 30, 40], success: [12, 40, 18], error: [40, 30, 40], warning: 24 };
  try {
    navigator.vibrate?.(ms[kind]);
  } catch {
    /* нет вибро */
  }
}

// --- тап: где нажали и что нажали ----------------------------------------------------------

const tap = { x: innerWidth / 2, y: innerHeight / 2, el: null as HTMLElement | null, t: 0 };
/** Последняя точка касания — отсюда вылетают награды. */
export const lastTap = () => (performance.now() - tap.t < 4000 ? tap : { ...tap, x: innerWidth / 2, y: innerHeight * 0.45 });

/** Подсветить нажатую кнопку, пока сервер отвечает. Вернёт функцию «готово». */
export function markPending(): () => void {
  const el = performance.now() - tap.t < 600 ? tap.el : null;
  if (!el) return () => {};
  // крутилка — только если ответ задержался: быстрые действия не мигают
  const t = setTimeout(() => el.classList.add('pending'), 220);
  return () => {
    clearTimeout(t);
    el.classList.remove('pending');
  };
}

// --- летящие награды ----------------------------------------------------------------------

let layer: HTMLDivElement | null = null;
function flyLayer() {
  if (layer?.isConnected) return layer;
  layer = document.createElement('div');
  layer.className = 'fly-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  return layer;
}

/** Куда летит награда: счётчик в шапке. */
const TARGET: Record<string, string> = { '₽': 'money', '🚬': 'butts', '🪙': 'gold', '⭐': 'xp', '⚡': 'en', '❤️': 'hp', '🎖️': 'xp' };
let streak = 0;
let streakAt = 0;

/** Иконки вылетают из точки тапа и дугой летят в свой счётчик; счётчик подпрыгивает. */
export function flyRewards(gains: { icon: string; bad?: boolean }[]) {
  if (lowFx() || !gains.length) return;
  const from = lastTap();
  const root = flyLayer();
  let k = 0;
  // серия наград подряд звучит всё выше
  const nowMs = performance.now();
  streak = nowMs - streakAt < 2500 ? Math.min(12, streak + 1) : 0;
  streakAt = nowMs;
  for (const g of gains) {
    if (g.bad) continue;
    const key = TARGET[g.icon];
    const target = key ? document.querySelector<HTMLElement>(`[data-wallet="${key}"]`) : null;
    if (!target) continue;
    const r = target.getBoundingClientRect();
    const tx = r.left + Math.min(r.width / 2, 24);
    const ty = r.top + r.height / 2;
    const n = key === 'money' || key === 'butts' || key === 'gold' ? 5 : 3;
    for (let i = 0; i < n; i++, k++) {
      const s = document.createElement('span');
      s.className = 'fly-icon';
      s.textContent = g.icon;
      root.appendChild(s);
      const sx = from.x + (Math.random() - 0.5) * 40;
      const sy = from.y + (Math.random() - 0.5) * 24;
      // дуга: сначала вверх-в-сторону, потом к счётчику
      const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 120;
      const my = Math.min(sy, ty) - 40 - Math.random() * 60;
      const delay = k * 55;
      const a = s.animate(
        [
          { transform: `translate(${sx}px, ${sy}px) scale(0.3)`, opacity: 0 },
          { transform: `translate(${sx}px, ${sy - 20}px) scale(1.25)`, opacity: 1, offset: 0.15 },
          { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${tx}px, ${ty}px) scale(0.6)`, opacity: 0.9 },
        ],
        { duration: 620, delay, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'backwards' },
      );
      const last = i === n - 1;
      a.onfinish = () => {
        s.remove();
        target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(1)' }], { duration: 180 });
        if (last) {
          playStep(streak);
          haptic('select');
        }
      };
    }
  }
}

// --- удар: стоп-кадр, тряска, вспышка -----------------------------------------------------

/** Стоп-кадр: на миг замираем все анимации внутри el — удар кажется тяжёлым. */
export function hitStop(el: Element | null, ms = 70) {
  if (!el || lowFx()) return;
  el.classList.add('hitstop');
  setTimeout(() => el.classList.remove('hitstop'), ms);
}

/** Тряска экрана: сила 1 — обычный удар, 2 — крит, 3 — нокаут. */
export function shake(el: Element | null, power: 1 | 2 | 3 = 1) {
  if (!el || calm()) return;
  const d = [0, 3, 6, 10][power];
  (el as HTMLElement).animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-d}px, ${d / 2}px)` },
      { transform: `translate(${d}px, ${-d / 2}px)` },
      { transform: `translate(${-d / 2}px, 0)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: 120 + power * 80, easing: 'ease-out' },
  );
}

/** Полный удар: стоп-кадр, потом тряска, звук и вибрация. */
export function impact(el: Element | null, kind: 'hit' | 'crit' | 'ko' = 'hit') {
  hitStop(el, kind === 'hit' ? 60 : 90);
  setTimeout(() => shake(el, kind === 'hit' ? 1 : kind === 'crit' ? 2 : 3), kind === 'hit' ? 60 : 90);
  haptic(kind === 'hit' ? 'hit' : 'heavy');
}

// --- простой: игрок ничего не трогает ----------------------------------------------------

let lastInput = performance.now();
const idleSubs = new Set<() => void>();
/** Сколько мс игрок ничего не трогал. */
export const idleFor = () => performance.now() - lastInput;
/** Подписка на «игрок снова здесь». */
export function onWake(f: () => void) {
  idleSubs.add(f);
  return () => idleSubs.delete(f);
}

// --- качество графики ---------------------------------------------------------------------

const root = document.documentElement;
/** Слабый телефон или «меньше анимаций» — облегчённая графика. */
export const lowFx = () => root.classList.contains('lowfx');
/** Человек просил меньше движения — без тряски. */
export const calm = () => root.classList.contains('calm');

const QKEY = 'zona:lowfx';
/** Режим графики: auto — по FPS, low — всегда облегчённая, high — всегда полная. */
export type FxMode = 'auto' | 'low' | 'high';
export function fxMode(): FxMode {
  try {
    const v = localStorage.getItem(QKEY);
    return v === 'low' || v === 'high' ? v : 'auto';
  } catch {
    return 'auto';
  }
}
export function setFxMode(m: FxMode) {
  try {
    localStorage.setItem(QKEY, m);
  } catch {
    /* приватный режим */
  }
  root.classList.toggle('lowfx', m === 'low' || (m === 'auto' && autoLow));
}

let autoLow = (() => {
  try {
    return localStorage.getItem('zona:autolow') === '1';
  } catch {
    return false;
  }
})();

/** Замер FPS: два окна подряд ниже 45 кадров — включаем облегчённую графику и запоминаем. */
function watchFps() {
  let frames = 0;
  let from = performance.now();
  let bad = 0;
  let windows = 0;
  const loop = (t: number) => {
    frames++;
    if (t - from >= 2000) {
      // свёрнутая вкладка не считается
      if (!document.hidden) {
        const fps = (frames * 1000) / (t - from);
        bad = fps < 45 ? bad + 1 : 0;
        windows++;
        if (bad >= 2 && !autoLow) {
          autoLow = true;
          try {
            localStorage.setItem('zona:autolow', '1');
          } catch {
            /* приватный режим */
          }
          if (fxMode() === 'auto') root.classList.add('lowfx');
        }
      }
      frames = 0;
      from = t;
      // замеряем первые полминуты — дальше не тратим кадры
      if (windows >= 15) return;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// --- подключение --------------------------------------------------------------------------

/** Звуки, которые ещё и чувствуются рукой. Удары в бою вибрируют сами (impact). */
const SFX_HAPTIC: Partial<Record<Sfx, Haptic>> = { win: 'success', lose: 'error', dice: 'select', card: 'select', thud: 'hit', unlock: 'success', whoosh: 'select', applause: 'success' };

export function initFeel() {
  setSfxHook((s) => {
    const h = SFX_HAPTIC[s];
    if (h) haptic(h);
  });
  const reduce = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) root.classList.add('calm');
  const mode = fxMode();
  if (mode === 'low' || (mode === 'auto' && (autoLow || reduce))) root.classList.add('lowfx');
  if (mode === 'auto' && !autoLow) watchFps();
  // мгновенный отклик: тап запомнили, кнопка дрогнула, телефон щёлкнул
  document.addEventListener(
    'pointerdown',
    (e) => {
      tap.x = e.clientX;
      tap.y = e.clientY;
      tap.t = performance.now();
      const b = (e.target as HTMLElement | null)?.closest<HTMLElement>('button, .tile, .job-tile, [role="button"]') ?? null;
      tap.el = b;
      const was = idleFor();
      lastInput = performance.now();
      if (was > 3000) idleSubs.forEach((f) => f());
      if (b && !(b as HTMLButtonElement).disabled) haptic('tap');
    },
    true,
  );
}
