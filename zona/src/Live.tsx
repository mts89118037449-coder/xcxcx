import { useState } from 'react';
import { timeLeft, useGame } from './game.tsx';

/** Полоска события зоны под шапкой: что идёт и сколько осталось. Нажал — подробности. */
export function LiveBanner() {
  const { p, now } = useGame();
  const [open, setOpen] = useState(false);
  const l = p.live;
  if (!l || l.endsAt <= now) return null;
  return (
    <>
      <button className={`live-strip live-${l.id}`} onClick={() => setOpen(true)}>
        <span className="live-emoji">{l.emoji}</span>
        <span className="grow">
          <b>{l.name}</b> · {l.short}
        </span>
        <small>⏳ {timeLeft(l.endsAt - now)}</small>
      </button>
      {open && (
        <div className="modal" onClick={() => setOpen(false)}>
          <div className={`modal-body live-modal live-${l.id}`} onClick={(e) => e.stopPropagation()}>
            <div className="live-big">{l.emoji}</div>
            <h2>{l.name}</h2>
            <p>{l.desc}</p>
            <div className="live-fx">{l.short}</div>
            <p className="muted small">Ещё {timeLeft(l.endsAt - now)}. Событие общее для всей зоны.</p>
            <button className="btn btn-wide" onClick={() => setOpen(false)}>
              Понял
            </button>
          </div>
        </div>
      )}
    </>
  );
}
