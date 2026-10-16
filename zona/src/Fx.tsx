import { useEffect, useRef, useState } from 'react';
import { consumableById } from '../shared/perks.ts';
import type { Look } from '../shared/types.ts';
import { PoseG } from './art/sprites.tsx';
import { fmt } from './game.tsx';

/** Число, которое прокручивается к новому значению, а не прыгает. Рост — с задержкой, пока долетают иконки. */
export function RollNum({ value, fmt: f = fmt }: { value: number; fmt?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const [up, setUp] = useState(0);
  useEffect(() => {
    const a = from.current;
    if (a === value) return;
    const grow = value > a;
    const delay = grow ? 420 : 0;
    const dur = Math.min(700, 250 + Math.log10(Math.abs(value - a) + 1) * 120);
    let raf = 0;
    const t0 = performance.now() + delay;
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0) / dur));
      const e = 1 - (1 - k) ** 3;
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    if (grow) setUp((u) => u + 1);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return (
    <span key={up} className={up ? 'roll-up' : undefined}>
      {f(shown)}
    </span>
  );
}

export interface FxChip {
  id: number;
  icon: string;
  text: string;
  bad?: boolean;
}

let seq = 0;
const LEVEL_LINES = [
  'Начальник колонии недоволен',
  'Мама гордилась бы. Наверное',
  'Срок тот же, зато уважения больше',
  'Сокамерники уже прячут тапки',
  'Опыт не пропьёшь. Хотя пытались',
  'Ещё уровень — и тебя сфотографируют для стенда «Их разыскивает полиция»',
  'Вертухай записал в блокнот. Это хорошо или плохо — неизвестно',
];
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
export function FxLayer({ chips, levelUp, look, level }: { chips: FxChip[]; levelUp: boolean; look: Look; level: number }) {
  return (
    <div className="fx-layer" aria-hidden>
      {/* награды — строкой под шапкой, не поверх лица персонажа */}
      <div className="fx-row">
        {chips.map((c, i) => (
          <div key={c.id} className={`fx-chip ${c.bad ? 'bad' : ''}`} style={{ animationDelay: `${i * 0.12}s` }}>
            <span>{c.icon}</span>
            {c.text}
          </div>
        ))}
      </div>
      {/* новый уровень — целая сцена: лучи, герой ликует, крупная цифра */}
      {levelUp && (
        <div className="fx-level-scene">
          <div className="fx-rays" />
          <svg viewBox="-40 -10 200 230" className="fx-level-hero">
            <PoseG name="stand" look={look} anim="cheer" fx={{ smile: true }} startKey={level} />
          </svg>
          <div className="fx-level">
            <b>НОВЫЙ УРОВЕНЬ</b>
            <span>{level}</span>
            <small>{LEVEL_LINES[level % LEVEL_LINES.length]}</small>
          </div>
        </div>
      )}
    </div>
  );
}
