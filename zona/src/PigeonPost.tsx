import { useState } from 'react';
import { PIGEON } from '../shared/malyava.ts';
import { ModalHead } from './Nav.tsx';
import { FlyingPigeon } from './art/Critters.tsx';
import { useClock } from './art/rig/Toon.tsx';
import { useGame } from './game.tsx';
import { play } from './sound.ts';

/** Голубиная почта: выбрать, сколько бычков, — и смотреть, как голубь летит через забор. */
export function PigeonModal({ to, name, onClose }: { to: number; name: string; onClose(): void }) {
  const { p, act, busy } = useGame();
  const [butts, setButts] = useState(PIGEON.butts[0]);
  const [flight, setFlight] = useState<{ at: number; shot: boolean } | null>(null);
  const t = useClock(!!flight);
  const send = async () => {
    const r = await act<{ shot: boolean }>('pigeonSend', { id: to, butts });
    if (!r) return;
    setFlight({ at: performance.now(), shot: r.shot });
    setTimeout(() => play(r.shot ? 'lose' : 'coin'), 2200);
  };
  const k = flight ? Math.min(1, (t - flight.at) / 2400) : 0;
  // сбитый голубь падает на середине пути
  const fallK = flight?.shot ? Math.max(0, (k - 0.5) * 2) : 0;
  const x = 20 + (flight?.shot ? Math.min(k, 0.5) : k) * 260;
  const y = 70 - Math.sin(Math.min(k, flight?.shot ? 0.5 : 1) * Math.PI) * 40 + fallK * 90;
  const done = !!flight && k >= 1;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} title={`🕊️ Голубем — для ${name}`} />
        <svg viewBox="0 0 300 160" className="pillow-field">
          <rect width={300} height={160} fill="#9cc4e0" />
          <rect y={110} width={300} height={50} fill="#8a8574" stroke="#1a1410" strokeWidth={2} />
          <rect x={140} y={70} width={20} height={42} fill="#9a968a" stroke="#1a1410" strokeWidth={2} />
          {Array.from({ length: 4 }, (_, i) => <circle key={i} cx={143 + i * 5} cy={66} r={4} fill="none" stroke="#1a1410" strokeWidth={1.2} />)}
          <text x={30} y={140} fontSize={10} fontWeight={900} fill="#1a1410">ТЫ</text>
          <text x={250} y={140} fontSize={10} fontWeight={900} fill="#1a1410">{name.slice(0, 10)}</text>
          {flight && (
            <g transform={`translate(${x} ${y}) rotate(${fallK * 160}) scale(1.2)`}>
              <FlyingPigeon t={t} />
            </g>
          )}
          {flight?.shot && k > 0.45 && (
            <text x={150} y={40} fontSize={18} fontWeight={900} textAnchor="middle" fill="#fff" stroke="#1a1410" strokeWidth={0.8}>
              ЧПОК! 🎯
            </text>
          )}
        </svg>
        <div className={`verdict ${done && !flight!.shot ? 'win' : ''}`}>
          {done ? (flight!.shot ? 'Вертухай сбил голубя из рогатки. Бычки рассыпались по плацу.' : `Долетел! ${name} получил ${butts} 🚬`) : flight ? 'Летит…' : `Риск: ${PIGEON.shotPct}% — вертухаи стреляют из рогаток`}
        </div>
        {!flight && (
          <>
            <div className="chips">
              {PIGEON.butts.map((b) => (
                <button key={b} className={butts === b ? 'active' : ''} onClick={() => setButts(b)}>
                  {b} 🚬
                </button>
              ))}
            </div>
            <button className="btn btn-wide" disabled={busy || p.butts < butts} onClick={send}>
              🕊️ Запустить голубя
            </button>
          </>
        )}
        {done && (
          <button className="btn btn-wide" onClick={onClose}>
            Ясно
          </button>
        )}
      </div>
    </div>
  );
}
