import { faceOf } from '../shared/content.ts';
import { NY_LINES, isNewYear } from '../shared/newyear.ts';
import type { Look } from '../shared/types.ts';
import { PoseG } from './art/sprites.tsx';
import { NPC_RIGS } from './art/rig/npcs.ts';
import { useClock } from './art/rig/Toon.tsx';
import { useGame } from './game.tsx';
import { babble, play } from './sound.ts';

const INK = '#1a1410';
export const newYearOn = () => isNewYear(Date.now()) || new URLSearchParams(location.search).get('season') === 'ny';

/** Дед Мороз-конвоир: бушлат ОМОНа, колпак, седая борода. */
const MOROZ: Look = (() => {
  const base = NPC_RIGS['sheet/cast/omon']?.look ?? { equipped: {}, tattoos: [], str: 20 };
  return { ...base, equipped: { ...base.equipped, head: 'hat_santa', weapon: undefined }, face: faceOf({ hair: 7, beard: 5, jaw: 0, brow: 0 }) };
})();

/** Ёлка на плацу и Дед Мороз-конвоир с мешком: тапни — подарок раз в день. */
export function NewYearZone() {
  const { p, act, toast } = useGame();
  const t = useClock(newYearOn());
  if (!newYearOn()) return null;
  const s = t / 1000;
  const x = 170 + Math.sin(s * 0.25) * 40;
  const dir = Math.cos(s * 0.25) >= 0 ? 1 : -1;
  const gift = async () => {
    const r = await act<{ butts: number; gold: number; item: string | null }>('nyGift');
    if (!r) return;
    play('gold');
    const line = NY_LINES[Math.floor(Math.random() * NY_LINES.length)];
    babble(line, 'начальник');
    toast(`🎅 ${line} ${r.butts ? `+${r.butts} 🚬` : r.gold ? `+${r.gold} 🪙` : '+🎁 бинт'}`);
  };
  return (
    <g>
      {/* ёлка с гирляндой */}
      <g transform="translate(250 262)">
        <rect x={-4} y={-10} width={8} height={12} fill="#6a4a2a" stroke={INK} strokeWidth={1.4} />
        <path d="M0,-90 L-18,-60 H-10 L-26,-34 H-16 L-34,-10 H34 L16,-34 H26 L10,-60 H18 Z" fill="#2f7a3a" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        {[[-6, -66], [8, -50], [-14, -40], [12, -28], [-20, -18], [2, -36], [22, -16]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={2.6} fill={['#ff4a3a', '#ffd24a', '#4ab0ff'][i % 3]} stroke={INK} strokeWidth={0.6} opacity={Math.sin(s * 4 + i) > -0.3 ? 1 : 0.35} />
        ))}
        <path d="M0,-98 L3,-91 L10,-91 L4,-87 L6,-80 L0,-84 L-6,-80 L-4,-87 L-10,-91 L-3,-91 Z" fill="#ffd24a" stroke={INK} strokeWidth={1} />
        <rect x={-30} y={-6} width={14} height={10} fill="#d8302a" stroke={INK} strokeWidth={1.2} />
        <rect x={16} y={-8} width={12} height={12} fill="#3a6ac0" stroke={INK} strokeWidth={1.2} />
      </g>
      {/* Дед Мороз-конвоир */}
      <g className={p.nyToday ? undefined : 'npc-click'} onClick={(e) => (e.stopPropagation(), !p.nyToday && gift())}>
        <g transform={`translate(${x - 60 * 0.5} ${258 - 208 * 0.5}) scale(0.5)`}>
          <rect x={0} y={0} width={120} height={210} fill="#fff" opacity={0.001} />
          <PoseG name="stand" look={MOROZ} anim="walk" mirror={dir < 0} noShadow />
        </g>
        {/* мешок */}
        <g transform={`translate(${x - dir * 16} 240)`}>
          <path d="M-9,10 Q-12,-6 0,-8 Q12,-6 9,10 Z" fill="#c8302a" stroke={INK} strokeWidth={1.4} />
          <path d="M-3,-8 L3,-8" stroke="#ffd24a" strokeWidth={2} />
        </g>
        {!p.nyToday && (
          <g className="talk-bubble hot" transform={`translate(${x} 140)`}>
            <rect x={-12} y={-10} width={24} height={15} rx={7.5} fill="#ffd24a" stroke={INK} strokeWidth={0.8} />
            <text y={1.5} fontSize={9} textAnchor="middle">🎁</text>
          </g>
        )}
      </g>
    </g>
  );
}
