// Локации. Все сцены в системе координат 360×230, персонаж ставится поверх.

import type { ReactNode } from 'react';
import { FURNITURE, type Spot } from '../../shared/content.ts';

const W = 360;
const H = 230;

export function Scene({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <svg className={`scene ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" onClick={onClick}>
      <defs>
        <pattern id="bricks" width="24" height="12" patternUnits="userSpaceOnUse">
          <rect width="24" height="12" fill="#7a3f2c" />
          <path d="M0,0 H24 M0,6 H24 M0,12 H24 M6,0 V6 M18,6 V12" stroke="#4d2519" strokeWidth="1" />
        </pattern>
        <pattern id="concrete" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#6d6f6b" />
          <circle cx="7" cy="9" r="1" fill="#5d5f5b" />
          <circle cx="29" cy="23" r="1.3" fill="#5d5f5b" />
          <circle cx="17" cy="33" r="0.8" fill="#7c7e79" />
        </pattern>
        <radialGradient id="lamp-glow">
          <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="beam" x1="0" x2="1">
          <stop offset="0" stopColor="#fff6c8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff6c8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {children}
    </svg>
  );
}

/** Персонаж внутри сцены: ставим ступнями в точку (x, y). */
export function Place({ x, y, scale, children, className }: { x: number; y: number; scale: number; children: ReactNode; className?: string }) {
  return (
    <g transform={`translate(${x - 60 * scale} ${y - 208 * scale}) scale(${scale})`}>
      <g className={className}>{children}</g>
    </g>
  );
}

function sky(hour: number) {
  if (hour >= 22 || hour < 5) return { top: '#0e1430', bottom: '#27305a', night: true };
  if (hour < 8) return { top: '#f0a46b', bottom: '#f7d9a0', night: false };
  if (hour < 18) return { top: '#6fa3d8', bottom: '#b9d6ef', night: false };
  return { top: '#d8693f', bottom: '#f2b774', night: false };
}

function Window({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const s = sky(new Date().getHours());
  return (
    <g>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={s.top} />
        <stop offset="1" stopColor={s.bottom} />
      </linearGradient>
      <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} fill="#2b2420" />
      <rect x={x} y={y} width={w} height={h} fill="url(#sky)" />
      {s.night ? (
        <>
          <circle cx={x + w * 0.7} cy={y + h * 0.3} r={6} fill="#f4f1d0" />
          {[0.2, 0.45, 0.85].map((f, i) => <circle key={i} className="twinkle" cx={x + w * f} cy={y + h * (0.2 + i * 0.15)} r={0.9} fill="#fff" />)}
        </>
      ) : (
        <g className="cloud-drift">
          <ellipse cx={x + 12} cy={y + 14} rx={10} ry={4} fill="#fff" opacity={0.8} />
          <ellipse cx={x + 40} cy={y + 24} rx={8} ry={3} fill="#fff" opacity={0.7} />
        </g>
      )}
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x={x + ((i + 1) * w) / 6 - 1.5} y={y} width={3} height={h} fill="#3a3531" />
      ))}
      <rect x={x} y={y + h / 2 - 1.5} width={w} height={3} fill="#3a3531" />
      <rect x={x - 8} y={y + h + 4} width={w + 16} height={5} fill="#4a403a" />
    </g>
  );
}

function Crow({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-8,0 Q-4,-10 4,-8 L10,-2 L4,0 Z" fill="#141414" />
      <path d="M-8,0 L-14,3 L-7,2 Z" fill="#141414" />
      <g className="crow-head">
        <circle cx={6} cy={-10} r={4} fill="#141414" />
        <path d="M9,-11 L14,-9.5 L9,-8.5 Z" fill="#4a4a4a" />
        <circle cx={7} cy={-11} r={0.8} fill="#ddd" />
      </g>
      <path d="M-1,0 L-1,4 M2,0 L2,4" stroke="#333" strokeWidth={0.8} />
    </g>
  );
}

function Lamp({ x }: { x: number }) {
  return (
    <g>
      <circle className="lamp-flicker" cx={x} cy={40} r={70} fill="url(#lamp-glow)" />
      <path d={`M${x},0 L${x},26`} stroke="#222" strokeWidth={1.2} />
      <rect x={x - 3} y={24} width={6} height={5} fill="#333" />
      <circle className="lamp-flicker" cx={x} cy={33} r={5} fill="#fff4c4" />
    </g>
  );
}

/** Лучшая купленная вещь для каждого места в хате. */
function bestBySpot(owned: string[]): Partial<Record<Spot, string>> {
  const res: Partial<Record<Spot, string>> = {};
  for (const f of FURNITURE) if (owned.includes(f.id)) res[f.spot] = f.id;
  return res;
}

export function CellScene({ furniture, children }: { furniture: string[]; children?: ReactNode }) {
  const f = bestBySpot(furniture);
  return (
    <>
      {/* Стены и пол */}
      <rect width={W} height={H} fill="#5e6b4f" />
      <rect y={0} width={W} height={120} fill="#8a8a6e" />
      <path d="M0,118 H360" stroke="#3d4634" strokeWidth={3} />
      <path d="M232,0 L300,0 L292,22 L270,30 L250,20 Z" fill="url(#bricks)" />
      <path d="M232,0 L250,20 L270,30 L292,22 L300,0" fill="none" stroke="#5b5a48" strokeWidth={1.5} />
      <path d="M20,60 L32,70 L28,82 M320,140 L330,150" stroke="#4d5541" strokeWidth={0.8} fill="none" />
      <rect y={188} width={W} height={42} fill="#6e2d22" />
      <path d="M0,188 H360" stroke="#3a1811" strokeWidth={2} />

      <Window x={262} y={40} w={60} h={46} />
      {f.window === 'f_curtains' || f.window === 'f_plant' ? (
        <>
          <path d="M254,32 Q262,60 256,98 L268,98 Q272,60 270,32 Z" fill="#a23a33" opacity={0.95} />
          <path d="M330,32 Q322,60 328,98 L316,98 Q312,60 314,32 Z" fill="#a23a33" opacity={0.95} />
          <rect x={250} y={29} width={84} height={4} fill="#4a3526" />
        </>
      ) : null}
      {f.window === 'f_plant' && (
        <g transform="translate(300 90)">
          <path d="M-6,0 L6,0 L4,9 L-4,9 Z" fill="#a85a35" />
          <path d="M0,0 Q-8,-10 -6,-16 M0,0 Q2,-12 8,-14 M0,0 Q0,-9 -1,-18" stroke="#3e7d3a" strokeWidth={2.2} fill="none" />
          <circle cx={-1} cy={-19} r={2.5} fill="#e25555" />
        </g>
      )}
      <Crow x={276} y={90} />

      {/* Стена над шконкой */}
      {f.wall === 'f_calendar' && (
        <g transform="translate(58 38)">
          <rect width={30} height={40} fill="#f3eee0" stroke="#555" strokeWidth={0.6} />
          <rect x={3} y={3} width={24} height={20} fill="#f1b8a0" />
          <circle cx={15} cy={9} r={3.5} fill="#e0a07e" />
          <path d="M9,23 Q15,11 21,23 Z" fill="#c44" />
          <path d="M5,28 H25 M5,32 H25 M5,36 H25" stroke="#999" strokeWidth={0.6} />
        </g>
      )}
      {f.wall === 'f_carpet' && (
        <g transform="translate(20 22)">
          <rect width={110} height={70} fill="#9c2626" stroke="#5a1212" strokeWidth={2} />
          <rect x={6} y={6} width={98} height={58} fill="none" stroke="#e0b24a" strokeWidth={2} strokeDasharray="4 2" />
          {[22, 55, 88].map((cx) => (
            <path key={cx} d={`M${cx},16 L${cx + 12},35 L${cx},54 L${cx - 12},35 Z`} fill="#2d4f7a" stroke="#e0b24a" strokeWidth={1} />
          ))}
        </g>
      )}
      {f.wall === 'f_icons' && (
        <g transform="translate(40 30)">
          {[0, 26, 52].map((x, i) => (
            <g key={x} transform={`translate(${x} ${i === 1 ? -6 : 0})`}>
              <rect width={22} height={30} fill="#c9962c" stroke="#6b4b12" strokeWidth={1.2} />
              <rect x={3} y={3} width={16} height={24} fill="#6b3b1d" />
              <circle cx={11} cy={11} r={4.5} fill="#e8c35a" />
              <circle cx={11} cy={12} r={2.6} fill="#d7a47c" />
            </g>
          ))}
        </g>
      )}

      {/* Шконка */}
      <g>
        <rect x={10} y={128} width={150} height={10} fill="#2d4a7a" />
        <rect x={12} y={138} width={6} height={52} fill="#2d4a7a" />
        <rect x={152} y={138} width={6} height={52} fill="#2d4a7a" />
        <rect x={10} y={172} width={150} height={4} fill="#243c63" />
        {!f.bed && [20, 44, 68, 92, 116, 140].map((x) => <rect key={x} x={x} y={122} width={20} height={6} fill="#8b6a45" stroke="#5d4127" strokeWidth={0.6} />)}
        {f.bed && (
          <>
            <rect x={10} y={116} width={150} height={13} rx={4} fill={f.bed === 'f_bed_vip' ? '#f0e6d2' : '#d9d2bf'} stroke="#8d8570" strokeWidth={0.8} />
            <path d="M20,116 V128 M40,116 V128 M60,116 V128 M80,116 V128 M100,116 V128 M120,116 V128 M140,116 V128" stroke="#b7ae98" strokeWidth={0.6} />
            <ellipse cx={30} cy={112} rx={18} ry={8} fill="#f4f1e8" stroke="#a8a18e" strokeWidth={0.8} />
          </>
        )}
        {(f.bed === 'f_blanket' || f.bed === 'f_bed_vip') && (
          <path
            d="M70,114 L160,114 L160,136 L66,136 Z"
            fill={f.bed === 'f_bed_vip' ? '#8e1e2a' : '#5b6a4c'}
            stroke={f.bed === 'f_bed_vip' ? GOLDC : '#3d4733'}
            strokeWidth={1}
          />
        )}
        {f.bed === 'f_blanket' && <path d="M76,120 H158 M76,128 H158" stroke="#7d8a6b" strokeWidth={2} />}
        {f.bed === 'f_bed_vip' && (
          <>
            <path d="M6,98 Q20,86 34,98 L34,130 L6,130 Z" fill={GOLDC} stroke="#7a5a12" strokeWidth={1} />
            <ellipse cx={52} cy={112} rx={14} ry={7} fill="#c9a2d8" stroke="#8a6a9a" strokeWidth={0.8} />
            <path d="M80,124 H156" stroke={GOLDC} strokeWidth={1.5} strokeDasharray="3 2" />
          </>
        )}
      </g>

      {/* Пол */}
      {f.floor === 'f_rug' && (
        <g>
          <ellipse cx={190} cy={206} rx={70} ry={14} fill="#8a6a3c" />
          <ellipse cx={190} cy={206} rx={60} ry={10} fill="none" stroke="#c8a262" strokeWidth={2} strokeDasharray="6 3" />
        </g>
      )}

      {/* Угол */}
      {f.corner === 'f_fridge' && (
        <g transform="translate(326 110)">
          <rect width={32} height={82} rx={4} fill="#eef0ec" stroke="#8d918b" strokeWidth={1.2} />
          <path d="M0,30 H32" stroke="#8d918b" strokeWidth={1} />
          <rect x={4} y={14} width={3} height={12} rx={1} fill="#9aa" />
          <rect x={4} y={36} width={3} height={16} rx={1} fill="#9aa" />
          <text x={16} y={74} fontSize={6} textAnchor="middle" fill="#9aa" fontWeight="bold">ЗИЛ</text>
        </g>
      )}
      {f.corner === 'f_aquarium' && (
        <g transform="translate(318 132)">
          <rect x={4} y={34} width={34} height={24} fill="#4a3526" />
          <rect width={42} height={34} fill="#4fa3c7" opacity={0.6} stroke="#cfe8f2" strokeWidth={1.5} />
          <path d="M4,34 Q10,26 12,34 M30,34 Q32,24 36,34" stroke="#3e7d3a" strokeWidth={2} fill="none" />
          <g className="fish">
            <path d="M0,0 Q5,-4 10,0 Q5,4 0,0 Z M10,0 L14,-3 L14,3 Z" fill="#f39c3a" transform="translate(6 12)" />
          </g>
          <g className="fish fish-2">
            <path d="M0,0 Q4,-3 8,0 Q4,3 0,0 Z M8,0 L11,-2 L11,2 Z" fill="#f1d34a" transform="translate(20 22)" />
          </g>
          <circle className="bubble" cx={30} cy={28} r={1.2} fill="#e5f6fb" />
        </g>
      )}

      {/* Стол и техника */}
      {f.table === 'f_tumba' && (
        <g transform="translate(262 146)">
          <rect width={40} height={44} fill="#8b5e3c" stroke="#4d3220" strokeWidth={1.2} />
          <rect x={4} y={6} width={32} height={14} fill="#7a5134" stroke="#4d3220" strokeWidth={0.8} />
          <circle cx={20} cy={13} r={1.5} fill="#d9b36b" />
        </g>
      )}
      {f.table === 'f_table' && (
        <g transform="translate(248 146)">
          <rect width={72} height={6} fill="#8b5e3c" stroke="#4d3220" strokeWidth={1.2} />
          <rect x={4} y={6} width={5} height={38} fill="#6d4a30" />
          <rect x={63} y={6} width={5} height={38} fill="#6d4a30" />
          <g transform="translate(52 -14)">
            <path d="M0,0 H14 L12,14 H2 Z" fill="#c9c9c9" stroke="#666" strokeWidth={0.8} />
            <path d="M14,3 Q20,6 14,10" fill="none" stroke="#666" strokeWidth={1.2} />
            <path className="steam" d="M5,-2 Q2,-8 6,-12 Q9,-16 6,-22" fill="none" stroke="#fff" strokeWidth={1.4} opacity={0.6} />
          </g>
        </g>
      )}
      {f.tech && (
        <g transform={`translate(${f.table === 'f_table' ? 256 : f.table === 'f_tumba' ? 264 : 262} ${f.table === 'f_table' ? 118 : f.table === 'f_tumba' ? 118 : 162})`}>
          {f.tech === 'f_radio' && (
            <>
              <rect width={34} height={28} rx={3} fill="#5a3b28" stroke="#2a1a10" strokeWidth={1} />
              <circle cx={11} cy={14} r={8} fill="#2a1a10" />
              <circle cx={11} cy={14} r={6} fill="none" stroke="#6b4b36" strokeDasharray="1 1.5" />
              <rect x={22} y={6} width={9} height={4} fill="#e8d59a" />
              <circle cx={26} cy={20} r={2.5} fill="#b89968" />
              <text className="note" x={30} y={-2} fontSize={9} fill="#f6e6a6">♪</text>
            </>
          )}
          {f.tech === 'f_tv' && (
            <>
              <path d="M10,0 L4,-12 M24,0 L30,-12" stroke="#333" strokeWidth={1.2} />
              <rect width={36} height={28} rx={3} fill="#3a2a1e" stroke="#1a100a" strokeWidth={1} />
              <rect className="tv-screen" x={4} y={4} width={22} height={20} rx={3} fill="#6fb3d9" />
              <circle cx={31} cy={9} r={2} fill="#999" />
              <circle cx={31} cy={17} r={2} fill="#999" />
            </>
          )}
        </g>
      )}

      <Lamp x={232} />
      {children}
    </>
  );
}

const GOLDC = '#d8a534';

export function WorkScene({ children }: { children?: ReactNode }) {
  return (
    <>
      <rect width={W} height={H} fill="url(#concrete)" />
      <rect y={0} width={W} height={24} fill="#4a4c48" />
      {[40, 180, 320].map((x) => (
        <g key={x}>
          <path d={`M${x},0 L${x},14`} stroke="#222" />
          <path d={`M${x - 14},14 L${x + 14},14 L${x + 8},20 L${x - 8},20 Z`} fill="#3a3c38" />
          <ellipse className="lamp-flicker" cx={x} cy={60} rx={40} ry={50} fill="url(#lamp-glow)" />
        </g>
      ))}
      <rect x={70} y={26} width={220} height={18} fill="#8e2f2a" />
      <text x={180} y={39} fontSize={10} textAnchor="middle" fill="#f3e3c3" fontWeight="bold" letterSpacing={1}>
        НА СВОБОДУ — С ЧИСТОЙ СОВЕСТЬЮ
      </text>
      <rect y={188} width={W} height={42} fill="#44463f" />
      <path d="M0,188 H360" stroke="#2d2e2a" strokeWidth={2} />

      {/* Швейная машинка */}
      <g transform="translate(14 132)">
        <rect x={0} y={24} width={84} height={6} fill="#6d5236" />
        <rect x={4} y={30} width={4} height={28} fill="#3a3a3a" />
        <rect x={76} y={30} width={4} height={28} fill="#3a3a3a" />
        <path d="M18,24 L18,4 Q18,0 22,0 L58,0 Q62,0 62,4 L62,10 L52,10 L52,24 Z" fill="#2b2b2b" stroke="#111" />
        <rect x={20} y={2} width={30} height={5} fill="#c9a24a" />
        <path className="needle" d="M56,10 L56,20" stroke="#ccc" strokeWidth={1.2} />
        <rect x={40} y={20} width={30} height={4} fill="#3f6fa8" />
      </g>

      {/* Конвейер с ящиками */}
      <g transform="translate(246 150)">
        <rect x={0} y={14} width={114} height={8} fill="#2d2d2d" />
        {[6, 30, 54, 78, 102].map((x) => <circle key={x} cx={x} cy={18} r={3.5} fill="#555" stroke="#222" />)}
        <rect x={4} y={22} width={4} height={18} fill="#3a3a3a" />
        <rect x={104} y={22} width={4} height={18} fill="#3a3a3a" />
        <clipPath id="belt-clip">
          <rect x={0} y={-20} width={114} height={34} />
        </clipPath>
        <g clipPath="url(#belt-clip)">
        <g className="conveyor">
          {[0, 40, 80].map((x) => (
            <g key={x} transform={`translate(${x} 0)`}>
              <rect width={22} height={14} fill="#b58a52" stroke="#6d5030" />
              <path d="M0,5 H22" stroke="#8a6638" />
            </g>
          ))}
        </g>
        </g>
      </g>

      {/* Искры от болгарки */}
      <g transform="translate(236 128)">
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={i} className={`spark spark-${i}`} r={1.3} fill="#ffcf5a" />
        ))}
      </g>
      {children}
    </>
  );
}

export function YardScene({ children, tower = true }: { children?: ReactNode; tower?: boolean }) {
  const s = sky(new Date().getHours());
  return (
    <>
      <linearGradient id="yard-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={s.top} />
        <stop offset="1" stopColor={s.bottom} />
      </linearGradient>
      <rect width={W} height={H} fill="url(#yard-sky)" />
      {!s.night && (
        <g className="cloud-drift slow">
          <ellipse cx={60} cy={30} rx={26} ry={8} fill="#fff" opacity={0.75} />
          <ellipse cx={210} cy={18} rx={20} ry={6} fill="#fff" opacity={0.6} />
        </g>
      )}
      {s.night && <circle cx={60} cy={30} r={9} fill="#f4f1d0" />}
      {/* Забор с колючкой */}
      <rect y={92} width={W} height={70} fill="#8d8a7d" />
      {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M${i * 40},92 V162`} stroke="#77746a" strokeWidth={1.5} />)}
      <path d="M0,88 H360" stroke="#555" strokeWidth={1} />
      {Array.from({ length: 24 }, (_, i) => (
        <circle key={i} cx={i * 16 + 8} cy={84} r={7} fill="none" stroke="#6a6a6a" strokeWidth={1} />
      ))}
      {/* Вышка с прожектором */}
      {tower && (
        <g transform="translate(300 16)">
          <path className="searchlight" d="M18,10 L-160,150 L-90,170 Z" fill="url(#beam)" />
          <path d="M4,30 L0,146 M32,30 L36,146 M4,60 L32,90 M32,60 L4,90" stroke="#4a3b2e" strokeWidth={3} />
          <rect x={-4} y={12} width={44} height={20} fill="#6b5640" stroke="#3b2e22" />
          <path d="M-8,12 L18,-4 L44,12 Z" fill="#4a3b2e" />
          <rect x={4} y={16} width={10} height={10} fill="#222" />
          <circle cx={18} cy={10} r={4} fill="#fff6c8" />
        </g>
      )}
      {/* Асфальт и турник */}
      <rect y={160} width={W} height={70} fill="#5a5954" />
      <path d="M0,160 H360" stroke="#3f3e3a" strokeWidth={2} />
      <g transform="translate(22 108)">
        <path d="M0,0 V92 M60,0 V92" stroke="#3b4c63" strokeWidth={4} />
        <path d="M0,6 H60" stroke="#9aa" strokeWidth={2.5} />
      </g>
      <ellipse cx={330} cy={210} rx={12} ry={3} fill="#3f3e3a" />
      {children}
    </>
  );
}
