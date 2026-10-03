import { useEffect, useState } from 'react';
import type { DialogSpec } from './game.tsx';
import { NpcPortrait } from './art/sprites.tsx';

/** Разговор с персонажем: портрет, реплика печатается, ниже — ответы. */
export function DialogBox({ d, onClose }: { d: DialogSpec; onClose(): void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= d.text.length ? n : n + 2)), 18);
    return () => clearInterval(id);
  }, [d.text]);
  const typing = shown < d.text.length;
  return (
    <div className="modal dialog-modal" onClick={onClose}>
      <div className="dialog" onClick={(e) => (typing ? setShown(d.text.length) : e.stopPropagation())}>
        {d.who.startsWith('sheet/') && (
          <div className="dialog-pic">
            <NpcPortrait who={d.who} />
          </div>
        )}
        <div className="dialog-body">
          <b>{d.name}</b>
          <p>{d.text.slice(0, shown)}</p>
          <div className="dialog-opts" style={{ visibility: typing ? 'hidden' : 'visible' }}>
            {d.options.map((o, i) => (
              <button
                key={i}
                className="dialog-opt"
                data-tut={o.tut}
                disabled={o.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!o.keepOpen) onClose();
                  o.onPick?.();
                }}
              >
                ▸ {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
