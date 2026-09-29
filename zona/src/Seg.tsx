import { useState } from 'react';

/** Раздел экрана, который помнится между заходами (у каждого игрока в своём браузере). */
export function useSeg<T extends string>(key: string, def: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(`seg:${key}`) as T | null;
      return saved && allowed.includes(saved) ? saved : def;
    } catch {
      return def;
    }
  });
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(`seg:${key}`, x);
    } catch {
      /* приватный режим — просто не запоминаем */
    }
  };
  return [v, set];
}

export interface SegItem<T extends string> {
  id: T;
  icon: string;
  label: string;
  /** точка или число — «здесь есть что сделать» */
  badge?: number | boolean;
}

/** Крупный переключатель разделов: иконка над подписью, всё в одну строку. */
export function SegBar<T extends string>({ items, value, onChange }: { items: SegItem<T>[]; value: T; onChange(v: T): void }) {
  return (
    <div className="segbar">
      {items.map((it) => (
        <button key={it.id} className={value === it.id ? 'active' : ''} onClick={() => onChange(it.id)}>
          <span className="segbar-icon">
            {it.icon}
            {it.badge ? <i className="segbar-badge">{typeof it.badge === 'number' ? it.badge : ''}</i> : null}
          </span>
          {it.label}
        </button>
      ))}
    </div>
  );
}
