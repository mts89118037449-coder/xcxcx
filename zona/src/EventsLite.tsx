// Лёгкая часть случаев: кнопка «!», строка наград, открытие. Тексты случаев — в Events.tsx, грузятся по требованию.
import { itemLabel } from './Perks.tsx';
import { NpcPortrait } from './art/sprites.tsx';
import { fmt, useGame } from './game.tsx';
import type { Got } from './Events.tsx';

const sign = (n: number) => (n > 0 ? `+${fmt(n)}` : `−${fmt(-n)}`);

/** Что изменилось после случая — одной строкой. */
export function gotLine(g: Omit<Got, 'text' | 'who' | 'name'> & { term?: number; debt?: number; rep?: Partial<Record<string, number>> }): string {
  const parts: string[] = [];
  if (g.debt) parts.push(`📒 долг +${fmt(g.debt)} ₽`);
  for (const [id, n] of Object.entries(g.rep ?? {})) if (n) parts.push(`${n > 0 ? '+' : ''}${n} ${id === 'brat' ? '🃏' : id === 'work' ? '⚒️' : '📋'}`);
  if (g.term) parts.push(`−${Math.round(g.term * 10) / 10} дн. срока`);
  if (g.money) parts.push(`${sign(g.money)} ₽`);
  if (g.butts) parts.push(`${sign(g.butts)} 🚬`);
  if (g.gold) parts.push(`${sign(g.gold)} 🪙`);
  if (g.xp) parts.push(`+${g.xp} опыта`);
  if (g.authority) parts.push(`${sign(g.authority)} 🎖️`);
  if (g.energy) parts.push(`${sign(g.energy)} ⚡`);
  if (g.hp) parts.push(`${sign(g.hp)} ❤️`);
  if (g.item) parts.push(itemLabel(g.item));
  return parts.join(' · ');
}

/** Открыть случай (текущий или только что выпавший во дворе) — сценой. */
export function useEvent() {
  const { openEvent } = useGame();
  return (id?: string) => openEvent(id);
}

/** Мигающий «!» — на зоне что-то случилось. */
export function EventButton() {
  const { p, now } = useGame();
  const open = useEvent();
  if (!p.event || p.event.until <= now) return null;
  // имя и лицо приходят с сервера — сами тексты случаев грузятся, только когда откроешь
  const ev = p.event;
  if (!ev.who) return null;
  return (
    // кружок с лицом того, кто ждёт: не закрывает кнопки внизу экрана
    <button className="event-btn" onClick={() => open()} aria-label={ev.name}>
      <span className="pulse-ring" />
      <NpcPortrait who={ev.who} className="event-face" tight />
      <b className="event-mark">!</b>
    </button>
  );
}
