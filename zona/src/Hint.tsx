import { useState } from 'react';

const KEY = 'zona:hints';
function seen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Подсказка «впервые здесь»: показывается один раз, крестик — и больше не мешает. */
export function Hint({ id, icon, children }: { id: string; icon: string; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(() => seen().includes(id));
  if (hidden) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, JSON.stringify([...seen(), id]));
    } catch {
      /* приватный режим */
    }
  };
  return (
    <div className="first-hint" onClick={close}>
      <span className="first-hint-ico">{icon}</span>
      <span className="grow">{children}</span>
      <button className="first-hint-x" aria-label="Понятно">
        ✓
      </button>
    </div>
  );
}
