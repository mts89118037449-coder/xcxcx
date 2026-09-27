import { eventById } from '../shared/events.ts';
import { itemLabel } from './Perks.tsx';
import { fmt, useGame } from './game.tsx';

interface Got {
  text: string;
  who: string;
  name: string;
  money: number;
  butts: number;
  gold: number;
  xp: number;
  authority: number;
  energy: number;
  hp: number;
  item: string | null;
}

const sign = (n: number) => (n > 0 ? `+${fmt(n)}` : `−${fmt(-n)}`);

/** Что изменилось после случая — одной строкой. */
export function gotLine(g: Omit<Got, 'text' | 'who' | 'name'>): string {
  const parts: string[] = [];
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

/** Открыть текущий случай: персонаж, ситуация, варианты — и итог следующей репликой. */
export function useEvent() {
  const { p, act, say } = useGame();
  return (id?: string) => {
    const ev = eventById.get(id ?? p.event?.id ?? '');
    if (!ev) return;
    const ration = 30 + p.level * 15;
    say({
      who: ev.who,
      name: ev.name,
      text: ev.text,
      options: ev.options.map((o, i) => {
        const cost = o.cost ?? {};
        const money = Math.round((cost.money ?? 0) * ration);
        const label = o.label.replace(/\(\d+(?:[.,]\d+)? пайк[аи]?\)/, `(${fmt(money)} ₽)`);
        return {
          label,
          disabled: p.money < money || p.butts < (cost.butts ?? 0) || p.gold < (cost.gold ?? 0),
          onPick: async () => {
            const r = await act<Got>('event', { choice: i });
            if (!r) return;
            const line = gotLine(r);
            say({ who: r.who, name: r.name, text: `${r.text}${line ? `\n\n${line}` : ''}`, options: [{ label: 'Ясно' }] });
          },
        };
      }),
    });
  };
}

/** Мигающий «!» — на зоне что-то случилось. */
export function EventButton() {
  const { p, now } = useGame();
  const open = useEvent();
  if (!p.event || p.event.until <= now) return null;
  const ev = eventById.get(p.event.id);
  if (!ev) return null;
  return (
    <button className="event-btn" onClick={() => open()}>
      <span className="pulse-ring" />❗ {ev.name}
    </button>
  );
}
