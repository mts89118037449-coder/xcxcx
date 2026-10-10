// Живность и массовка в стиле «Южного парка»: плоские цвета, толстый чёрный контур, круглые глаза.
// Все двигаются от общих часов — 20 кадров в секунду, «вырезная» анимация.
import { useState } from 'react';
import { Rig } from './rig/Rig.tsx';
import { useClock } from './rig/Toon.tsx';
import { NPC_RIGS } from './rig/npcs.ts';

const INK = '#1a1410';

/** Мультяшный глаз: белый круг, зрачок смотрит по направлению. */
function Eye({ x, y, r = 3.2, look = 0.6 }: { x: number; y: number; r?: number; look?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth={1} />
      <circle cx={x + r * 0.35 * look} cy={y} r={r * 0.38} fill={INK} />
    </g>
  );
}

/** Овчарка: бежит рысцой, язык наружу. Рисуется мордой вправо, ноги на y=0. */
export function Dog({ t, color = '#8a5a2c', sit }: { t: number; color?: string; sit?: boolean }) {
  const s = t / 1000;
  const leg = sit ? 0 : Math.sin(s * 14) * 5;
  const bob = sit ? 0 : Math.abs(Math.sin(s * 14)) * 1.5;
  const tail = Math.sin(s * (sit ? 8 : 16)) * 12;
  return (
    <g transform={`translate(0 ${-bob})`}>
      {/* хвост */}
      <path d="M-16,-20 q-8,-6 -10,-14" transform={`rotate(${tail} -16 -20)`} stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />
      <path d="M-16,-20 q-8,-6 -10,-14" transform={`rotate(${tail} -16 -20)`} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* лапы */}
      {[-11, -5, 6, 12].map((x, i) => (
        <rect key={x} x={x - 2.2} y={sit && i < 2 ? -8 : -12} width={4.4} height={sit && i < 2 ? 8 : 12} rx={2} fill={color} stroke={INK} strokeWidth={1.4} transform={`rotate(${(i % 2 ? leg : -leg) * (sit ? 0 : 1)} ${x} -12)`} />
      ))}
      {/* туловище */}
      <ellipse cx={0} cy={sit ? -16 : -18} rx={18} ry={9} fill={color} stroke={INK} strokeWidth={1.8} transform={sit ? 'rotate(-18 0 -16)' : undefined} />
      <ellipse cx={-2} cy={-20} rx={9} ry={5} fill="#3a2410" opacity={0.6} />
      {/* голова */}
      <g transform={`translate(${sit ? 14 : 18} ${sit ? -32 : -28})`}>
        <path d="M-6,-10 L-2,-20 L2,-9 Z" fill="#3a2410" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        <path d="M2,-10 L8,-19 L9,-7 Z" fill="#3a2410" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        <circle r={10} fill={color} stroke={INK} strokeWidth={1.8} />
        <ellipse cx={9} cy={3} rx={7} ry={5} fill="#c99a6a" stroke={INK} strokeWidth={1.4} />
        <circle cx={15} cy={1} r={2.4} fill={INK} />
        <path d="M8,7 q2,6 5,4 l-1,-4 Z" fill="#e2687a" stroke={INK} strokeWidth={1} />
        <Eye x={0} y={-3} />
        <Eye x={6} y={-4} />
      </g>
    </g>
  );
}

/** Ворона: сидит, крутит головой, иногда каркает (клюв открывается). */
export function Crow({ t, seed = 0, body = '#2a2a30', beak = '#e0a92a', word = 'КАР!' }: { t: number; seed?: number; body?: string; beak?: string; word?: string }) {
  const s = t / 1000 + seed;
  const turn = Math.sin(s * 0.9) > 0 ? 1 : -1;
  const caw = s % 5 < 0.35;
  const hop = s % 7 < 0.25 ? -4 : 0;
  return (
    <g transform={`translate(0 ${hop}) scale(${turn} 1)`}>
      <path d="M-8,-6 L-16,-2 L-9,-2 Z" fill="#222" stroke={INK} strokeWidth={1} />
      <ellipse cx={0} cy={-7} rx={9} ry={6.5} fill={body} stroke={INK} strokeWidth={1.6} />
      <circle cx={6} cy={-14} r={5} fill={body} stroke={INK} strokeWidth={1.6} />
      <path d={caw ? 'M10,-15 L17,-17 L11,-13 L17,-10 L10,-12 Z' : 'M10,-15 L17,-13 L10,-11 Z'} fill={beak} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Eye x={7} y={-15} r={2} look={1} />
      <path d="M-2,0 v3 M2,0 v3" stroke="#e0a92a" strokeWidth={1.4} />
      {caw && (
        <text x={18} y={-22} fontSize={8} fontWeight={900} fill="#fff" stroke={INK} strokeWidth={0.5}>
          {word}
        </text>
      )}
    </g>
  );
}

/** Крыса: перебегает, останавливается понюхать. Мордой вправо. */
export function Rat({ t }: { t: number }) {
  const s = t / 1000;
  const leg = Math.sin(s * 24) * 3;
  return (
    <g>
      <path d="M-10,-4 q-10,2 -16,-4" stroke="#c98a8a" strokeWidth={2} fill="none" strokeLinecap="round" />
      {[-5, 4].map((x, i) => (
        <rect key={x} x={x - 1.5} y={-4} width={3} height={4} fill="#c98a8a" transform={`rotate(${i ? leg : -leg} ${x} -4)`} />
      ))}
      <ellipse cx={0} cy={-6} rx={10} ry={5.5} fill="#8a8a92" stroke={INK} strokeWidth={1.5} />
      <circle cx={9} cy={-8} r={4.4} fill="#8a8a92" stroke={INK} strokeWidth={1.4} />
      <circle cx={7} cy={-13} r={2.6} fill="#e2a0a0" stroke={INK} strokeWidth={1} />
      <circle cx={14} cy={-7} r={1.3} fill="#e2687a" />
      <Eye x={10} y={-9} r={1.8} look={1} />
    </g>
  );
}

/** Таракан: шустрый, усы шевелятся. */
export function Roach({ t }: { t: number }) {
  const s = t / 1000;
  const w = Math.sin(s * 30) * 2;
  return (
    <g>
      <path d={`M5,-3 q6,-4 9,${-3 + w} M5,-2 q7,-1 10,${1 - w}`} stroke={INK} strokeWidth={0.8} fill="none" />
      <ellipse cx={0} cy={-3} rx={6} ry={3.4} fill="#6a3a1a" stroke={INK} strokeWidth={1.2} />
      <circle cx={5} cy={-3} r={2} fill="#4a2410" stroke={INK} strokeWidth={1} />
    </g>
  );
}

/** Кто бегает туда-сюда: позиция — «пила» между a и b, разворот на краях. */
function patrol(t: number, a: number, b: number, speed: number, pause = 0.6) {
  const len = Math.abs(b - a);
  const leg = len / speed + pause;
  const c = (t / 1000) % (leg * 2);
  const fwd = c < leg;
  const k = Math.min(1, (fwd ? c : c - leg) / (len / speed));
  const x = fwd ? a + (b - a) * k : b + (a - b) * k;
  return { x, dir: (fwd ? 1 : -1) * Math.sign(b - a), moving: k < 1 };
}

/** Массовка карты зоны: вертухай с псом в патруле, ворона на заборе, крыса у столовой. */
export function ZoneLife() {
  const t = useClock(true);
  const [t0] = useState(t);
  const lt = t - t0;
  const guard = patrol(lt, 200, 330, 26, 1.4);
  const dog = patrol(lt + 300, 214, 344, 26, 1.4);
  const rat = patrol(lt, 150, 196, 60, 2.5);
  const omon = NPC_RIGS['sheet/cast/omon'];
  const hour = new Date().getHours();
  const night = hour >= 22 || hour < 6 || new URLSearchParams(location.search).has('night');
  return (
    <g className="zone-life" pointerEvents="none">
      <ZoneSigns />
      {/* ворона на колючке */}
      <g transform="translate(118 58) scale(0.7)">
        <Crow t={lt} />
      </g>
      <g transform="translate(332 62) scale(0.6)">
        <Crow t={lt} seed={2.3} />
      </g>
      {/* патруль: вертухай и пёс */}
      {omon && (
        <g transform={`translate(${guard.x - 60 * 0.42} ${206 - 208 * 0.42}) scale(0.42)`}>
          <Rig look={omon.look} anim={guard.moving ? 'walk' : 'idle'} mirror={guard.dir < 0} fidget={false} />
        </g>
      )}
      <g transform={`translate(${dog.x} 212) scale(${dog.dir < 0 ? -0.55 : 0.55} 0.55)`}>
        <Dog t={dog.moving ? lt : 0} sit={!dog.moving} />
      </g>
      {/* крыса у ларька */}
      <g transform={`translate(${rat.x} 182) scale(${rat.dir < 0 ? -0.6 : 0.6} 0.6)`}>
        <Rat t={rat.moving ? lt : 0} />
      </g>
      {night && <NightLights t={lt} />}
    </g>
  );
}

/** Табличка с надписью: кривая, прибита одним гвоздём. */
function Sign({ x, y, w, text, rot = 0, bg = '#f2e6c8', fg = '#2a1a10', size = 5.4 }: { x: number; y: number; w: number; text: string; rot?: number; bg?: string; fg?: string; size?: number }) {
  const lines = text.split('\n');
  const h = lines.length * (size + 1.6) + 3;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1.5} fill={bg} stroke={INK} strokeWidth={1.2} />
      <circle cx={0} cy={-h / 2 + 2} r={0.9} fill={INK} />
      {lines.map((l, i) => (
        <text key={i} x={0} y={-h / 2 + 2.6 + (i + 1) * (size + 1.2) - 1} fontSize={size} fontWeight={900} textAnchor="middle" fill={fg} fontFamily="system-ui, sans-serif">
          {l}
        </text>
      ))}
    </g>
  );
}

/** Вывески-шутки на зданиях и бельё на верёвке — зона как мультик. */
function ZoneSigns() {
  return (
    <g className="zone-signs">
      {/* бельевая верёвка между бараком и ларьком */}
      <path d="M118,150 Q128,158 140,151" stroke={INK} strokeWidth={0.8} fill="none" />
      <g transform="translate(124 152) rotate(6)">
        <rect x={-3} y={0} width={7} height={9} fill="#e8e8e8" stroke={INK} strokeWidth={0.8} />
        {[2, 5, 8].map((y) => <rect key={y} x={-3} y={y} width={7} height={1.4} fill="#2a2a30" />)}
      </g>
      <g transform="translate(134 154) rotate(-4)">
        <path d="M-3,0 h6 l1,7 h-3 v-3 h-2 v3 h-3 Z" fill="#3e5a7a" stroke={INK} strokeWidth={0.8} />
      </g>
      <Sign x={40} y={150} w={40} text={'ОСТОРОЖНО:\nЗЛОЙ ДЕД'} rot={-6} />
      <Sign x={163} y={130} w={34} text={'СКИДКИ НА\nСВОБОДУ 0%'} rot={4} bg="#ffd24a" size={4.6} />
      <Sign x={163} y={44} w={36} text={'ГРЕХИ — ДО 18:00'} rot={-3} size={4.4} />
      <Sign x={268} y={120} w={44} text={'ПЛАН — ЗАКОН.\nПАЛЫЧ — ТОЖЕ'} rot={3} bg="#c9d6de" size={4.4} />
      <Sign x={332} y={128} w={34} text={'ЗЕЛЁНКА\n24/7'} rot={-5} bg="#c8f0c0" size={4.8} />
      <Sign x={282} y={214} w={36} text={'ТУТ НЕ\nКОПАТЬ! ➘'} rot={8} bg="#f3d2c8" fg="#8a1a10" size={4.6} />
    </g>
  );
}

/** Ночь: темнота и два прожектора с вышек шарят по двору. */
function NightLights({ t }: { t: number }) {
  const s = t / 1000;
  const a1 = Math.sin(s * 0.5) * 32 + 30;
  const a2 = Math.sin(s * 0.42 + 2) * 32 - 30;
  return (
    <g>
      <rect width={360} height={280} fill="#0a1030" opacity={0.42} />
      {[
        [334, 34, a1],
        [24, 40, a2],
      ].map(([x, y, a], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
          <path d="M0,0 L-34,230 L34,230 Z" fill="#fff6c8" opacity={0.22} />
          <ellipse cx={0} cy={226} rx={34} ry={9} fill="#fff6c8" opacity={0.28} />
          <circle r={4} fill="#fffbe0" stroke={INK} strokeWidth={1} />
        </g>
      ))}
    </g>
  );
}

/** Кот: рыжий, толстый, с презрением. Сидит, машет хвостом, иногда умывается. Мордой вправо. */
export function Cat({ t, walk, color = '#e08a3a' }: { t: number; walk?: boolean; color?: string }) {
  const s = t / 1000;
  const tail = Math.sin(s * 3) * 18;
  const wash = !walk && s % 9 > 7.5;
  const leg = walk ? Math.sin(s * 12) * 4 : 0;
  const blinkEyes = s % 4 < 0.12;
  return (
    <g>
      <path d="M-12,-10 q-12,-2 -12,-16" transform={`rotate(${tail} -12 -10)`} stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d="M-12,-10 q-12,-2 -12,-16" transform={`rotate(${tail} -12 -10)`} stroke={color} strokeWidth={3.6} fill="none" strokeLinecap="round" />
      {walk &&
        [-8, -2, 5, 10].map((x, i) => (
          <rect key={x} x={x - 2} y={-8} width={4} height={8} rx={2} fill={color} stroke={INK} strokeWidth={1.2} transform={`rotate(${i % 2 ? leg : -leg} ${x} -8)`} />
        ))}
      <ellipse cx={0} cy={walk ? -12 : -10} rx={walk ? 15 : 12} ry={walk ? 7 : 10} fill={color} stroke={INK} strokeWidth={1.8} />
      <path d="M-5,-18 q3,4 0,8 M1,-19 q3,4 0,8" stroke="#b0601c" strokeWidth={1.6} fill="none" />
      <g transform={`translate(${walk ? 14 : 9} ${walk ? -20 : -22}) rotate(${wash ? 14 : 0})`}>
        <path d="M-7,-5 L-6,-14 L-1,-7 Z M2,-7 L7,-14 L7,-5 Z" fill={color} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        <circle r={8} fill={color} stroke={INK} strokeWidth={1.8} />
        {blinkEyes ? (
          <path d="M-5,-1 h3 M2,-1 h3" stroke={INK} strokeWidth={1.4} />
        ) : (
          <>
            <ellipse cx={-3} cy={-1} rx={2.6} ry={3} fill="#e8f080" stroke={INK} strokeWidth={0.9} />
            <ellipse cx={3.4} cy={-1} rx={2.6} ry={3} fill="#e8f080" stroke={INK} strokeWidth={0.9} />
            <rect x={-3.5} y={-3} width={1} height={4} fill={INK} />
            <rect x={2.9} y={-3} width={1} height={4} fill={INK} />
          </>
        )}
        <path d="M-1,3 h2 l-1,1.4 Z" fill="#e2687a" />
        <path d="M-9,3 h5 M4,3 h5" stroke={INK} strokeWidth={0.6} />
        {wash && <ellipse cx={6} cy={4} rx={3} ry={2.4} fill={color} stroke={INK} strokeWidth={1.2} />}
      </g>
    </g>
  );
}

/** Питомец игрока в хате: живёт по своим часам. */
export function LivePet({ kind }: { kind: string }) {
  const t = useClock(true);
  const [t0] = useState(t);
  const lt = t - t0;
  if (kind === 'cat') {
    const w = patrol(lt, 214, 286, 14, 6);
    return (
      <g transform={`translate(${w.x} 266) scale(${w.dir < 0 ? -0.95 : 0.95} 0.95)`}>
        <Cat t={lt} walk={w.moving} />
      </g>
    );
  }
  if (kind === 'rat') {
    const w = patrol(lt, 30, 120, 50, 3);
    return (
      <g transform={`translate(${w.x} 268) scale(${w.dir < 0 ? -0.8 : 0.8} 0.8)`}>
        <Rat t={w.moving ? lt : 0} />
      </g>
    );
  }
  return (
    <g transform="translate(228 124) scale(0.8)">
      <Crow t={lt} body="#8b93a0" beak="#d9a07a" word="ГУЛЬ!" seed={1.1} />
    </g>
  );
}
