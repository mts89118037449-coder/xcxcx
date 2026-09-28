import { useEffect, useRef, useState } from 'react';
import { PULLUPS } from '../shared/content.ts';
import { PoseG } from './art/sprites.tsx';
import { lookOf, timeLeft, useGame } from './game.tsx';

const SECONDS = 10;

/** Турник: 10 секунд жми как можно чаще. Энергия не нужна. */
export function Pullups({ onClose }: { onClose(): void }) {
  const { p, now, act, toast } = useGame();
  const [phase, setPhase] = useState<'ready' | 'go' | 'done'>('ready');
  const [reps, setReps] = useState(0);
  const [left, setLeft] = useState(SECONDS);
  const [up, setUp] = useState(false);
  const repsRef = useRef(0);
  const ready = now >= p.pullupsReadyAt && p.pullupsLeft > 0;

  useEffect(() => {
    if (phase !== 'go') return;
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'go' && left <= 0) {
      setPhase('done');
      act('pullups', { reps: repsRef.current });
    }
  }, [left, phase, act, toast]);

  const tap = () => {
    if (phase === 'ready') setPhase('go');
    if (phase === 'done') return;
    repsRef.current = Math.min(PULLUPS.maxReps, repsRef.current + 1);
    setReps(repsRef.current);
    setUp(true);
    setTimeout(() => setUp(false), 90);
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <h2>💪 Турник</h2>
        <div className="pull-stage">
          <svg width={220} height={230} viewBox="0 -10 120 230">
            <rect x={6} y={0} width={4} height={220} fill="#5a6470" />
            <rect x={110} y={0} width={4} height={220} fill="#5a6470" />
            <rect x={6} y={4} width={108} height={3} fill="#9aa2ab" />
            <g style={{ transform: `translateY(${up ? -18 : 0}px)`, transition: 'transform 0.08s' }}>
              <PoseG name="stand" look={lookOf(p)} noShadow />
            </g>
          </svg>
          <div className="pull-count" style={{ position: 'absolute', right: 10, top: 10 }}>{reps}</div>
        </div>
        {ready || phase !== 'ready' ? (
          <>
            <button className="btn pull-btn" disabled={phase === 'done'} onClick={tap}>
              {phase === 'ready' ? 'Начать — жми часто!' : phase === 'go' ? `Подтянуться! · ${left}с` : `Готово: ${reps}`}
            </button>
            <div className="muted small center" style={{ marginTop: 6 }}>
              Энергия не нужна · {PULLUPS.repsPerXp} подтягивания = 1 опыт · подходов сегодня: {p.pullupsLeft}
            </div>
          </>
        ) : (
          <div className="muted center">
            {p.pullupsLeft <= 0 ? 'На сегодня хватит — приходи завтра' : `Руки отдыхают ещё ${timeLeft(p.pullupsReadyAt - now)}`}
          </div>
        )}
      </div>
    </div>
  );
}
