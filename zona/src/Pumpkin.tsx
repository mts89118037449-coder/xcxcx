import { isHalloween } from '../shared/halloween.ts';
import { useGame } from './game.tsx';
import { play } from './sound.ts';

const INK = '#1a1410';

/** Хэллоуин сейчас (или ?season=hw — посмотреть заранее). */
export const halloweenOn = () => isHalloween(Date.now()) || new URLSearchParams(location.search).get('season') === 'hw';

/** Тыква-находка: светится, по тапу — в копилку квеста. Найденная исчезает. */
export function PumpkinSpot({ id, x, y, scale = 1 }: { id: string; x: number; y: number; scale?: number }) {
  const { p, act, toast } = useGame();
  if (!halloweenOn() || p.pumpkins.includes(id)) return null;
  const find = async () => {
    const r = await act<{ found: number; total: number; gold: number; butts: number }>('pumpkinFind', { id });
    if (!r) return;
    play('pop');
    toast(r.gold ? `🎃 Все тыквы найдены! +${r.gold} 🪙 +${r.butts} 🚬` : `🎃 Тыква ${r.found}/${r.total}`);
  };
  return (
    <g
      className="npc-click pumpkin"
      transform={`translate(${x} ${y}) scale(${scale})`}
      onClick={(e) => {
        e.stopPropagation();
        find();
      }}
    >
      <ellipse cx={0} cy={2} rx={16} ry={4} fill="#000" opacity={0.3} />
      <ellipse cx={0} cy={-10} rx={16} ry={12} fill="#f08a1a" stroke={INK} strokeWidth={2} />
      <path d="M-6,-21 Q-8,-10 -6,1 M6,-21 Q8,-10 6,1" stroke="#c0620a" strokeWidth={1.6} fill="none" />
      <path d="M0,-21 q2,-6 7,-7" stroke="#3a6a2a" strokeWidth={3} fill="none" strokeLinecap="round" />
      <path className="pumpkin-face" d="M-9,-13 l4,-5 l4,5 Z M1,-13 l4,-5 l4,5 Z M-9,-6 q9,8 18,0 l-3,2 l-3,-2 l-3,2 l-3,-2 l-3,2 Z" fill="#ffe24a" stroke={INK} strokeWidth={0.8} />
    </g>
  );
}
