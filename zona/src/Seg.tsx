import { useEffect, useState } from 'react';

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
  // переход «из подсказки»: открыть нужный раздел, даже если экран уже на месте
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; value: string }>).detail;
      if (d.key === key && allowed.includes(d.value as T)) setV(d.value as T);
    };
    window.addEventListener('seg-jump', on);
    return () => window.removeEventListener('seg-jump', on);
  }, [key]);
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
        <button key={it.id} data-tut={`seg-${it.id}`} className={value === it.id ? 'active' : ''} onClick={() => onChange(it.id)}>
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

/** Открыть раздел на экране: запоминаем и сообщаем уже открытому экрану. */
export function jumpSeg(key: string, value: string) {
  try {
    localStorage.setItem(`seg:${key}`, value);
  } catch {
    /* ничего */
  }
  window.dispatchEvent(new CustomEvent('seg-jump', { detail: { key, value } }));
}
