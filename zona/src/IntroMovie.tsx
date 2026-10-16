import { useEffect, useState } from 'react';
import { Place } from './art/Scenes.tsx';
import { Crow, Dog } from './art/Critters.tsx';
import { ImageG, PoseG, useNpc } from './art/sprites.tsx';
import { useClock } from './art/rig/Toon.tsx';
import type { RigAnim } from './art/rig/Rig.tsx';
import { lookOf, useGame } from './game.tsx';
import { babble, play } from './sound.ts';

const INK = '#1a1410';
const LEN = 15000;

/** Титры ролика: когда какая подпись. */
const CAPS: [number, string][] = [
  [0, 'Автозак. Пункт назначения — «Зона». Обратный билет не прилагается.'],
  [4000, 'Ворота открываются. Только внутрь.'],
  [6500, 'Конвой: «Выходи. Добро пожаловать. Чувствуй себя как дома — тут теперь дом»'],
  [10000, 'Здравствуй, зона. Срок пошёл.'],
  [13000, ''],
];

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Мультяшный ролик заезда: автозак, ворота, конвой, первый шаг на зону. Показывается один раз. */
export function IntroMovie({ onDone }: { onDone(): void }) {
  const { p } = useGame();
  const guard = useNpc('sheet/cast/omon');
  const now = useClock(true);
  const [t0] = useState(now);
  const t = now - t0;
  const cap = [...CAPS].reverse().find(([at]) => t >= at)?.[1] ?? '';
  useEffect(() => {
    if (cap) babble(cap, 'Рассказчик');
  }, [cap]);
  useEffect(() => {
    const ts = [setTimeout(() => play('event'), 4000), setTimeout(() => play('step'), 6500), setTimeout(() => play('level'), 13000)];
    return () => ts.forEach(clearTimeout);
  }, []);
  // автозак въезжает и останавливается у ворот
  const vanX = -140 + ease(clamp(t / 3800)) * 230;
  const gate = ease(clamp((t - 4000) / 1800));
  // герой выходит из автозака и идёт к бараку
  const heroOut = t >= 6500;
  const walk = clamp((t - 9800) / 3000);
  const heroX = 170 + walk * 120;
  const heroAnim: RigAnim = t < 9800 ? (t < 8000 ? 'cold' : 'shrug') : walk < 1 ? 'walk' : 'wave';
  const shake = t < 3800 ? Math.sin(t / 40) * 1.2 : 0;
  const done = t >= LEN;
  return (
    <div className="modal intro-movie" onClick={(e) => e.stopPropagation()}>
      <div className="movie-frame">
        <svg viewBox="0 0 360 280" width="100%">
          {/* небо и забор */}
          <rect width={360} height={280} fill="#9cc4e0" />
          <ellipse cx={70} cy={40} rx={34} ry={11} fill="#fff" />
          <ellipse cx={270} cy={30} rx={40} ry={12} fill="#fff" />
          <rect y={90} width={360} height={110} fill="#b07a5a" stroke={INK} strokeWidth={2.5} />
          {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M0,${100 + i * 9} H360`} stroke="#9a6a4a" strokeWidth={1.4} />)}
          {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={i * 12.5} cy={84} r={6} fill="none" stroke={INK} strokeWidth={1.4} />)}
          {/* вышка */}
          <g transform="translate(300 18)">
            <path d="M4,30 L0,74 M24,30 L28,74" stroke={INK} strokeWidth={2.4} />
            <rect x={-4} y={14} width={36} height={18} fill="#8a5a34" stroke={INK} strokeWidth={2} />
            <path d="M-8,14 L14,0 L36,14 Z" fill="#5a3a24" stroke={INK} strokeWidth={2} />
          </g>
          <g transform="translate(316 10) scale(0.7)">
            <Crow t={t} seed={1} />
          </g>
          {/* ворота: створки разъезжаются */}
          <rect x={110} y={96} width={140} height={104} fill="#2a2a30" />
          <text x={180} y={150} fontSize={9} textAnchor="middle" fill="#ffd24a" fontWeight={900} opacity={gate}>
            ДОБРО ПОЖАЛОВАТЬ
          </text>
          <rect x={110 - gate * 70} y={96} width={70} height={104} fill="#6a7078" stroke={INK} strokeWidth={2.4} />
          <rect x={180 + gate * 70} y={96} width={70} height={104} fill="#6a7078" stroke={INK} strokeWidth={2.4} />
          <circle cx={170 - gate * 70} cy={150} r={4} fill="#c0302a" stroke={INK} strokeWidth={1} />
          <circle cx={190 + gate * 70} cy={150} r={4} fill="#c0302a" stroke={INK} strokeWidth={1} />
          {/* дорога */}
          <rect y={200} width={360} height={80} fill="#7a7564" stroke={INK} strokeWidth={2} />
          {[30, 120, 210, 300].map((x) => <rect key={x} x={x} y={238} width={40} height={4} fill="#d8ccb0" />)}
          {/* пёс у ворот лает */}
          <g transform="translate(70 232) scale(0.6)">
            <Dog t={t} sit={t < 6000} />
          </g>
          {heroOut && guard && (
            <Place x={88 + Math.min(1, (t - 6500) / 600) * 20} y={250} scale={0.55}>
              <ImageG url={guard.url} height={guard.height} anim={t < 9800 ? 'talk' : 'crossed'} />
            </Place>
          )}
          {heroOut && (
            <Place x={heroX} y={252} scale={0.58}>
              <PoseG name="stand" look={lookOf(p)} anim={heroAnim} startKey={heroAnim} />
            </Place>
          )}
          {/* автозак */}
          <g transform={`translate(${vanX} ${150 + shake})`}>
            <rect x={0} y={20} width={130} height={60} rx={6} fill="#6a7a5a" stroke={INK} strokeWidth={2.4} />
            <rect x={96} y={4} width={44} height={50} rx={6} fill="#6a7a5a" stroke={INK} strokeWidth={2.4} />
            <rect x={104} y={10} width={30} height={20} fill="#9cd0f0" stroke={INK} strokeWidth={2} />
            <rect x={14} y={30} width={22} height={14} fill="#2a2a30" stroke={INK} strokeWidth={1.6} />
            {[19, 25, 31].map((x) => <path key={x} d={`M${x},30 V44`} stroke="#8a8a92" strokeWidth={1.4} />)}
            <text x={60} y={66} fontSize={9} textAnchor="middle" fill="#fff" fontWeight={900}>
              СПЕЦТРАНС
            </text>
            {[26, 108].map((x) => (
              <g key={x} transform={`translate(${x} 82) rotate(${t / 4})`}>
                <circle r={11} fill="#2a2a30" stroke={INK} strokeWidth={2} />
                <path d="M-6,0 H6 M0,-6 V6" stroke="#8a8a92" strokeWidth={2} />
              </g>
            ))}
            {t < 3800 && <ellipse cx={-8} cy={70} rx={10} ry={6} fill="#ddd" opacity={0.7} className="steam" />}
          </g>
          {t >= 13000 && (
            <g className="movie-logo">
              <rect x={60} y={40} width={240} height={70} rx={10} fill="#5a5a62" stroke={INK} strokeWidth={4} />
              <text x={180} y={92} fontSize={46} fontWeight={900} textAnchor="middle" fill="#d8d0c0" stroke={INK} strokeWidth={2} letterSpacing={4}>
                ZONA
              </text>
            </g>
          )}
        </svg>
        {cap && <div className="movie-cap" key={cap}>{cap}</div>}
      </div>
      <button className="btn btn-wide" onClick={onDone}>
        {done ? 'Начать ▸' : 'Пропустить ⏭'}
      </button>
    </div>
  );
}
