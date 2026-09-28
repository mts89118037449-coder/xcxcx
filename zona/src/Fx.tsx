import { consumableById } from '../shared/perks.ts';
import { fmt } from './game.tsx';

export interface FxChip {
  id: number;
  icon: string;
  text: string;
  bad?: boolean;
}

let seq = 0;
const sign = (n: number) => (n > 0 ? `+${fmt(n)}` : `−${fmt(-n)}`);

/** Что игрок получил (или потерял) — из ответа сервера любого действия. */
export function gainsOf(result: unknown): { chips: FxChip[]; levelUps: number } {
  if (!result || typeof result !== 'object' || 'rounds' in result) return { chips: [], levelUps: 0 };
  const r0 = result as Record<string, unknown>;
  const r = (r0.reward && typeof r0.reward === 'object' ? { ...r0, ...(r0.reward as object) } : r0) as Record<string, unknown>;
  const chips: FxChip[] = [];
  const num = (k: string, icon: string) => {
    const v = r[k];
    if (typeof v === 'number' && v !== 0) chips.push({ id: ++seq, icon, text: sign(v), bad: v < 0 });
  };
  num('money', '₽');
  num('gold', '🪙');
  num('xp', '⭐');
  num('authority', '🎖️');
  num('butts', '🚬');
  num('energy', '⚡');
  num('hp', '❤️');
  num('chifir', '☕');
  const items = [...(Array.isArray(r.items) ? r.items : []), ...(typeof r.item === 'string' ? [r.item] : [])];
  for (const id of items) {
    const c = consumableById.get(String(id));
    if (c) chips.push({ id: ++seq, icon: c.emoji, text: c.name });
  }
  return { chips, levelUps: typeof r.levelUps === 'number' ? r.levelUps : 0 };
}

/** Иконки наград всплывают над экраном одна за другой. */
export function FxLayer({ chips, levelUp }: { chips: FxChip[]; levelUp: boolean }) {
  return (
    <div className="fx-layer" aria-hidden>
      {chips.map((c, i) => (
        <div key={c.id} className={`fx-chip ${c.bad ? 'bad' : ''}`} style={{ animationDelay: `${i * 0.14}s`, left: '50%', top: `calc(30% + ${i * 50}px)` }}>
          <span>{c.icon}</span>
          {c.text}
        </div>
      ))}
      {levelUp && (
        <div className="fx-level">
          <b>НОВЫЙ УРОВЕНЬ</b>
          <span>⭐</span>
        </div>
      )}
    </div>
  );
}
