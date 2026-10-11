import { useEffect, useState } from 'react';
import { PILLOW, PILLOW_MOVES, PILLOW_TAUNTS, type PillowMove } from '../shared/pillow.ts';
import type { Look } from '../shared/types.ts';
import { Table } from './Minigames.tsx';
import { Place } from './art/Scenes.tsx';
import { PoseG } from './art/sprites.tsx';
import type { RigAnim } from './art/rig/Rig.tsx';
import { lookOf, useGame } from './game.tsx';
import { play } from './sound.ts';

interface Res {
  rival: string;
  his: PillowMove[];
  rounds: number[];
  win: boolean;
  draw: boolean;
  butts: number;
  look: Look | null;
}

/** Перья: летят из точки удара. */
function Feathers({ x, y, n = 8 }: { x: number; y: number; n?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: n }, (_, i) => (
        <path
          key={i}
          className="feather"
          style={{ ['--fx' as string]: `${Math.cos((i / n) * Math.PI * 2) * 40}px`, ['--fy' as string]: `${Math.sin((i / n) * Math.PI * 2) * 30 - 20}px`, animationDelay: `${i * 0.03}s` }}
          d="M0,0 q4,-6 0,-12 q-4,6 0,12 Z"
          fill="#fff"
          stroke="#1a1410"
          strokeWidth={0.6}
        />
      ))}
    </g>
  );
}

export function PillowGame({ onClose }: { onClose(): void }) {
  const { p, act, busy } = useGame();
  const [moves, setMoves] = useState<PillowMove[]>([]);
  const [res, setRes] = useState<Res | null>(null);
  const [step, setStep] = useState(-1);
  const [taunt] = useState(() => PILLOW_TAUNTS[Math.floor(Math.random() * PILLOW_TAUNTS.length)]);
  useEffect(() => {
    if (!res || step >= 3) return;
    const t = setTimeout(() => {
      const next = step + 1;
      setStep(next);
      if (next < 3) play(res.rounds[next] === 0 ? 'miss' : 'hit');
      else play(res.win ? 'win' : res.draw ? 'click' : 'lose');
    }, step < 0 ? 300 : 1000);
    return () => clearTimeout(t);
  }, [res, step]);
  const fight = async () => {
    const r = await act<Res>('pillow', { moves });
    if (r) {
      setRes(r);
      setStep(-1);
    }
  };
  const again = () => {
    setRes(null);
    setMoves([]);
    setStep(-1);
  };
  const cur = res && step >= 0 && step < 3 ? res.rounds[step] : null;
  const done = !!res && step >= 3;
  const meAnim: RigAnim = done ? (res!.win ? 'cheer' : res!.draw ? 'shrug' : 'koSpin') : cur === null ? 'guard' : cur >= 0 ? 'punch' : 'hit';
  const himAnim: RigAnim = done ? (res!.win ? 'koSpin' : res!.draw ? 'shrug' : 'cheer') : cur === null ? 'guard' : cur <= 0 ? 'punch' : 'hit';
  const rivalLook = res?.look ?? { equipped: { body: 'body_robe' }, tattoos: [], str: 10, face: 2 };
  return (
    <Table who="sheet/rival/3" title="🪶 Подушечный бой" left={`боёв сегодня: ${p.games.pillow}`} onClose={onClose}>
      <svg viewBox="0 0 300 180" className="pillow-field">
        <rect width={300} height={180} fill="#5b5348" />
        {Array.from({ length: 8 }, (_, k) => <rect key={k} x={k * 40 + (k % 2) * 6} y={20 + (k % 3) * 30} width={34} height={14} fill="#4a4339" />)}
        <rect y={146} width={300} height={34} fill="#7a4a2a" stroke="#1a1410" strokeWidth={2} />
        <Place x={95} y={170} scale={0.62}>
          <PoseG name="stand" look={lookOf(p)} anim={meAnim} startKey={`m${step}`} hold="pillow" />
        </Place>
        <Place x={205} y={170} scale={0.62}>
          <PoseG name="stand" look={rivalLook} anim={himAnim} startKey={`h${step}`} mirror hold="pillow" />
        </Place>
        {cur !== null && cur !== 0 && <Feathers key={step} x={cur > 0 ? 200 : 100} y={80} />}
        {done && res!.win && <Feathers key="end" x={150} y={60} n={16} />}
        {res && step >= 0 && step < 3 && (
          <text x={150} y={30} fontSize={16} fontWeight={900} textAnchor="middle" fill="#fff" stroke="#1a1410" strokeWidth={0.8}>
            {PILLOW_MOVES.find((m) => m.id === moves[step])?.emoji} vs {PILLOW_MOVES.find((m) => m.id === res.his[step])?.emoji} · {cur! > 0 ? 'ТВОЙ!' : cur! < 0 ? 'ЕГО!' : 'НИЧЬЯ'}
          </text>
        )}
      </svg>
      <div className={`verdict ${done && res!.win ? 'win' : ''}`}>
        {done
          ? res!.win
            ? `Победа над ${res!.rival}! +${res!.butts} 🚬, +${PILLOW.winAuthority} ⭐`
            : res!.draw
              ? `Ничья с ${res!.rival}. Обои в перьях.`
              : `${res!.rival} победил. ${taunt}`
          : res
            ? `Против тебя: ${res.rival}`
            : 'Выбери три удара. Голова бьёт бок, бок пробивает блок, блок держит голову.'}
      </div>
      {!res && (
        <>
          <div className="pillow-moves">
            {PILLOW_MOVES.map((m) => (
              <button key={m.id} className="btn btn-dark" disabled={moves.length >= 3} onClick={() => setMoves([...moves, m.id])}>
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
          <div className="pillow-plan">
            {[0, 1, 2].map((i) => (
              <span key={i} onClick={() => setMoves(moves.filter((_, k) => k !== i))}>
                {moves[i] ? PILLOW_MOVES.find((m) => m.id === moves[i])!.emoji : '?'}
              </span>
            ))}
          </div>
          <button className="btn btn-wide" disabled={busy || moves.length < 3 || p.games.pillow <= 0} onClick={fight}>
            {p.games.pillow <= 0 ? 'Подушки отобрали до завтра' : 'В бой!'}
          </button>
        </>
      )}
      {done && (
        <button className="btn btn-wide" disabled={p.games.pillow <= 0} onClick={again}>
          {p.games.pillow <= 0 ? 'Завтра' : 'Ещё раунд'}
        </button>
      )}
    </Table>
  );
}
