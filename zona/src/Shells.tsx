import { ModalHead } from './Nav.tsx';
import { useState } from 'react';
import { SHELLS } from '../shared/content.ts';
import { NpcPortrait } from './art/sprites.tsx';
import { fmt, useGame } from './game.tsx';

type Phase = 'bet' | 'shuffle' | 'pick' | 'reveal';

/** Напёрстки с Лёхой: шарик прячется, напёрстки крутятся, угадай где. */
export function ShellGame({ onClose }: { onClose(): void }) {
  const { p, act, toast } = useGame();
  const max = SHELLS.betPerLevel * p.level;
  const bets = [SHELLS.minBet, Math.round(max / 4 / 50) * 50, Math.round(max / 2 / 50) * 50, max].filter((b, i, a) => b >= SHELLS.minBet && a.indexOf(b) === i);
  const [bet, setBet] = useState(bets[0]);
  const [phase, setPhase] = useState<Phase>('bet');
  const [order, setOrder] = useState([0, 1, 2]); // позиция каждого напёрстка
  const [result, setResult] = useState<{ ball: number; win: boolean; payout: number; pick: number } | null>(null);

  const start = () => {
    if (p.money < bet) return toast('Не хватает денег', 'err');
    setResult(null);
    setPhase('shuffle');
    let n = 0;
    const id = setInterval(() => {
      setOrder((o) => {
        const a = [...o];
        const i = Math.floor(Math.random() * 3);
        const j = (i + 1 + Math.floor(Math.random() * 2)) % 3;
        [a[i], a[j]] = [a[j], a[i]];
        return a;
      });
      if (++n >= 7) {
        clearInterval(id);
        setTimeout(() => setPhase('pick'), 260);
      }
    }, 260);
  };

  const pick = async (cup: number) => {
    if (phase !== 'pick') return;
    setPhase('reveal');
    const r = await act<{ ball: number; win: boolean; payout: number }>('shells', { bet, pick: cup });
    if (!r) return setPhase('bet');
    setResult({ ...r, pick: cup });
    toast(r.win ? `Угадал! +${fmt(r.payout - bet)} ₽` : `Мимо. −${fmt(bet)} ₽`, r.win ? 'ok' : 'err');
  };

  const lifted = (cup: number) => phase === 'reveal' && result && (cup === result.ball || cup === result.pick);

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body shells" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={onClose} />
        <div className="shells-top">
          <NpcPortrait who="sheet/rival/3" className="shells-lyoha" />
          <div>
            <b>Лёха-напёрсточник</b>
            <p className="muted small">
              {phase === 'pick' ? '«Ну, где шарик? Не зевай!»' : phase === 'shuffle' ? '«Следи за руками…»' : result ? (result.win ? '«Глазастый… Ещё?»' : '«Бывает. Отыграешься?»') : `«Ставь и следи. Угадал — ${SHELLS.payout}× твоё»`}
            </p>
          </div>
        </div>
        <svg className="shells-table" viewBox="0 0 300 130">
          <rect x={0} y={60} width={300} height={70} rx={10} fill="#3a2a1c" />
          <rect x={6} y={66} width={288} height={58} rx={8} fill="#2c5a3a" />
          {[0, 1, 2].map((cup) => {
            const x = 50 + order[cup] * 100;
            const up = lifted(cup);
            return (
              <g key={cup} style={{ transform: `translate(${x}px, ${up ? -26 : 0}px)`, transition: 'transform 0.24s ease-in-out', cursor: phase === 'pick' ? 'pointer' : 'default' }} onClick={() => pick(cup)}>
                {phase === 'reveal' && result?.ball === cup && <circle cx={0} cy={112 + (up ? 26 : 0)} r={7} fill="#e8e0cc" stroke="#555" />}
                <path d="M-26,110 L-18,56 Q0,48 18,56 L26,110 Z" fill="#7a3f22" stroke="#2a150a" strokeWidth={1.5} />
                <path d="M-18,64 Q0,58 18,64" stroke="#a45a32" strokeWidth={3} fill="none" />
                <ellipse cx={0} cy={110} rx={26} ry={5} fill="#5a2d18" />
                {phase === 'pick' && <circle className="pulse-ring" cx={0} cy={82} r={30} fill="none" stroke="#f2c14e" strokeWidth={2} />}
              </g>
            );
          })}
        </svg>
        {(phase === 'bet' || (phase === 'reveal' && result)) && (
          <>
            <div className="chips" style={{ justifyContent: 'center' }}>
              {bets.map((b) => (
                <button key={b} className={bet === b ? 'active' : ''} onClick={() => setBet(b)}>
                  {fmt(b)} ₽
                </button>
              ))}
            </div>
            <button className="btn btn-wide" disabled={p.shellsLeft <= 0} onClick={start}>
              {p.shellsLeft > 0 ? `Крутить · ставка ${fmt(bet)} ₽` : 'На сегодня хватит'}
            </button>
            <div className="muted small center" style={{ marginTop: 6 }}>Партий сегодня осталось: {p.shellsLeft}</div>
          </>
        )}
        {phase === 'pick' && <div className="center"><b>Жми на напёрсток</b></div>}
      </div>
    </div>
  );
}
