// Локации в полуреалистичной манере: фактура стен, пятна, свет и тени.
// Каждая сцена — два SVG-слоя одинакового размера: статичный фон (с тяжёлыми
// фильтрами фактуры, рисуется один раз) и живой слой (анимации + персонаж),
// сверху — зерно и виньетка на CSS. Так анимации не перерисовывают фильтры.
// Система координат 360×280, пол на y≈236.

import type { ReactNode } from 'react';
import { FURNITURE, interiorById, type Spot } from '../../shared/content.ts';

const W = 360;
const H = 280;
export const FLOOR = 236;

function SceneDefs() {
  return (
    <defs>
      {/* Пятна и потёки: низкочастотный шум, окрашенный в грязно-бурый */}
      <filter id="sc-stains" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.011 0.03" numOctaves="4" seed="7" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0 0.07  2.4 0 0 0 -1.05" />
      </filter>
      {/* Мелкая фактура штукатурки/бетона */}
      <filter id="sc-grime" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="3" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.09  0 0 0 0 0.07  1.8 0 0 0 -0.75" />
      </filter>
      {/* Светлые сколы краски */}
      <filter id="sc-chips" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="11" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.72  0 0 0 0 0.7  0 0 0 0 0.62  6 0 0 0 -3.6" />
      </filter>
      <filter id="sc-blur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
      <filter id="sc-blur-s" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1" />
      </filter>
      <linearGradient id="sc-brick" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8e4631" />
        <stop offset="1" stopColor="#5f2a1b" />
      </linearGradient>
      <pattern id="sc-bricks" width="26" height="13" patternUnits="userSpaceOnUse">
        <rect width="26" height="13" fill="#8a8272" />
        <rect x="0.8" y="0.8" width="11.6" height="5" fill="url(#sc-brick)" />
        <rect x="13.6" y="0.8" width="11.6" height="5" fill="url(#sc-brick)" />
        <rect x="-5.7" y="7.3" width="11.6" height="5" fill="url(#sc-brick)" />
        <rect x="7.1" y="7.3" width="11.6" height="5" fill="url(#sc-brick)" />
        <rect x="19.9" y="7.3" width="11.6" height="5" fill="url(#sc-brick)" />
      </pattern>
      <pattern id="sc-ticking" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="#b9b5a6" />
        <rect width="1.4" height="6" fill="#56647a" />
        <rect x="3" width="0.6" height="6" fill="#7b8697" />
      </pattern>
      <pattern id="sc-springs" width="6" height="6" patternUnits="userSpaceOnUse">
        <path d="M0,0 L6,6 M6,0 L0,6" stroke="#4a5058" strokeWidth="0.7" />
      </pattern>
      <pattern id="sc-planks" width="60" height="11" patternUnits="userSpaceOnUse">
        <rect width="60" height="11" fill="#5a2a1f" />
        <path d="M0,10.5 H60 M38,0 V11" stroke="#2c130d" strokeWidth="0.8" />
        <path d="M4,4 C14,3 26,5 36,4" stroke="#6a3325" strokeWidth="0.6" fill="none" />
      </pattern>
      <linearGradient id="sc-steel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7c8794" />
        <stop offset="0.45" stopColor="#3f4a58" />
        <stop offset="1" stopColor="#262d36" />
      </linearGradient>
      <linearGradient id="sc-steel-v" x1="0" x2="1">
        <stop offset="0" stopColor="#262d36" />
        <stop offset="0.5" stopColor="#6d7886" />
        <stop offset="1" stopColor="#262d36" />
      </linearGradient>
      <linearGradient id="sc-wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7a5236" />
        <stop offset="1" stopColor="#4a2f1e" />
      </linearGradient>
      <radialGradient id="sc-lamp">
        <stop offset="0" stopColor="#ffe7a3" stopOpacity="0.5" />
        <stop offset="0.4" stopColor="#ffd98a" stopOpacity="0.16" />
        <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="sc-shaft" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff3cf" stopOpacity="0.2" />
        <stop offset="1" stopColor="#fff3cf" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="sc-beam" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff6c8" stopOpacity="0.45" />
        <stop offset="1" stopColor="#fff6c8" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="sc-floorlight" cx="0.5" cy="0.3" r="0.6">
        <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="sc-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#fff" stopOpacity="0.1" />
      </linearGradient>
    </defs>
  );
}

export function Scene({
  backdrop,
  children,
  className = '',
  onClick,
}: {
  backdrop: ReactNode;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const box = `0 0 ${W} ${H}`;
  return (
    <div className={`scene ${className}`} onClick={onClick}>
      <svg className="scene-layer" viewBox={box} aria-hidden>
        <SceneDefs />
        {backdrop}
      </svg>
      <svg className="scene-layer" viewBox={box}>
        <SceneDefs />
        {children}
      </svg>
      <div className="scene-fx" />
    </div>
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
  if (hour >= 22 || hour < 5) return { top: '#0b1026', bottom: '#253058', night: true };
  if (hour < 8) return { top: '#b8826a', bottom: '#e9c79a', night: false };
  if (hour < 18) return { top: '#7d9cb8', bottom: '#c9d6dc', night: false };
  return { top: '#9a5a44', bottom: '#e0a574', night: false };
}

/** Грязь поверх прямоугольника: пятна и мелкая фактура. */
function Grime({ x, y, w, h, stains = 0.6, grime = 0.35 }: { x: number; y: number; w: number; h: number; stains?: number; grime?: number }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} filter="url(#sc-stains)" opacity={stains} />
      <rect x={x} y={y} width={w} height={h} filter="url(#sc-grime)" opacity={grime} />
    </>
  );
}

// --- Хата -------------------------------------------------------------------

function bestBySpot(owned: string[]): Partial<Record<Spot, string>> {
  const res: Partial<Record<Spot, string>> = {};
  for (const f of FURNITURE) if (owned.includes(f.id)) res[f.spot] = f.id;
  return res;
}

/** Где стоит техника: на столе, на тумбочке или на полу. */
function techPos(f: Partial<Record<Spot, string>>) {
  if (f.table === 'f_table') return { x: 252, y: 158 };
  if (f.table === 'f_tumba') return { x: 264, y: 158 };
  return { x: 266, y: 206 };
}

export type InteriorIds = { wall: string; floor: string };
const DEFAULT_INTERIOR: InteriorIds = { wall: 'w_green', floor: 'f_planks' };

function CellBackdrop({ furniture, interior = DEFAULT_INTERIOR }: { furniture: string[]; interior?: InteriorIds }) {
  const f = bestBySpot(furniture);
  const wall = interiorById.get(interior.wall) ?? interiorById.get('w_green')!;
  const floor = interiorById.get(interior.floor) ?? interiorById.get('f_planks')!;
  const s = sky(new Date().getHours());
  const tech = techPos(f);
  return (
    <>
      {/* Штукатурка */}
      <linearGradient id="cell-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6e6b5c" />
        <stop offset="1" stopColor="#8a8672" />
      </linearGradient>
      <rect width={W} height={150} fill="url(#cell-wall)" />
      <Grime x={0} y={0} w={W} h={150} stains={0.75} grime={0.45} />
      {/* Отвалившаяся штукатурка, под ней кирпич */}
      <path d="M150,0 L214,0 L210,14 L198,24 L184,22 L172,30 L160,20 L154,10 Z" fill="url(#sc-bricks)" />
      <path d="M150,0 L154,10 L160,20 L172,30 L184,22 L198,24 L210,14 L214,0" fill="none" stroke="#cfc8b2" strokeWidth={1.4} />
      <path d="M152,2 L156,11 L161,21 L172,32 L184,24 L198,26 L211,15" fill="none" stroke="#000" strokeWidth={1.2} opacity={0.25} />
      <path d="M40,20 L48,34 L45,48 L52,60 M300,138 L310,128 L318,132 M112,6 L118,20" stroke="#3b372c" strokeWidth={0.7} fill="none" opacity={0.7} />
      {/* Крашеная панель */}
      <rect y={150} width={W} height={86} fill={wall.color} />
      <WallPattern id={wall.id} accent={wall.accent} />
      <rect y={150} width={W} height={86} filter="url(#sc-chips)" opacity={wall.id === 'w_green' ? 0.55 : 0.2} />
      <Grime x={0} y={150} w={W} h={86} stains={0.5} grime={0.3} />
      <rect y={150} width={W} height={4} fill={wall.accent} />
      <rect y={154} width={W} height={2} fill="#fff" opacity={0.12} />
      {wall.id === 'w_green' && [40, 96, 214, 340].map((x) => (
        <path key={x} d={`M${x},156 C${x + 0.6},166 ${x - 0.4},176 ${x + 0.4},${186 + (x % 30)}`} stroke="#1c2a20" strokeWidth={1.2} opacity={0.5} />
      ))}
      {/* Плинтус и пол */}
      <rect y={FLOOR - 4} width={W} height={5} fill="#1c120c" />
      {floor.id === 'f_planks' ? (
        <rect y={FLOOR} width={W} height={H - FLOOR} fill="url(#sc-planks)" />
      ) : (
        <>
          <rect y={FLOOR} width={W} height={H - FLOOR} fill={floor.color} />
          <FloorPattern id={floor.id} accent={floor.accent} />
        </>
      )}
      <rect y={FLOOR} width={W} height={H - FLOOR} filter="url(#sc-grime)" opacity={0.45} />
      <ellipse cx={200} cy={258} rx={120} ry={30} fill="url(#sc-floorlight)" />

      {/* Окно: ниша, небо, решётка, свет */}
      <g>
        <rect x={252} y={44} width={84} height={76} fill="#3b362c" />
        <path d="M252,44 L262,52 L262,112 L252,120 Z M336,44 L326,52 L326,112 L336,120 Z" fill="#26221c" />
        <path d="M252,44 L336,44 L326,52 L262,52 Z" fill="#1d1a15" />
        <linearGradient id="cell-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.top} />
          <stop offset="1" stopColor={s.bottom} />
        </linearGradient>
        <rect x={262} y={52} width={64} height={60} fill="url(#cell-sky)" />
        {s.night ? (
          <circle cx={308} cy={68} r={5} fill="#efe9c4" filter="url(#sc-blur-s)" />
        ) : (
          <path d="M262,96 L276,88 L290,92 L304,84 L318,90 L326,86 L326,112 L262,112 Z" fill="#6c6f6a" opacity={0.6} />
        )}
        <rect x={262} y={52} width={64} height={60} fill="url(#sc-glass)" />
        <rect x={262} y={52} width={64} height={60} filter="url(#sc-grime)" opacity={0.4} />
        {[272, 283, 294, 305, 316].map((x) => (
          <rect key={x} x={x - 1.6} y={52} width={3.2} height={60} fill="url(#sc-steel-v)" />
        ))}
        {[72, 92].map((y) => (
          <rect key={y} x={262} y={y - 1.6} width={64} height={3.2} fill="url(#sc-steel)" />
        ))}
        <rect x={246} y={118} width={96} height={6} fill="#4d463a" />
        <rect x={246} y={123} width={96} height={2} fill="#000" opacity={0.35} />
        {!s.night && <path d="M262,112 L326,112 L250,236 L120,236 Z" fill="url(#sc-shaft)" />}
      </g>
      {(f.window === 'f_curtains' || f.window === 'f_plant') && (
        <g>
          <rect x={244} y={38} width={100} height={3} fill="#3b2a1c" />
          <path d="M246,40 C252,60 250,90 254,124 L266,124 C262,96 266,66 262,40 Z" fill="#7a2622" />
          <path d="M342,40 C336,60 338,90 334,124 L322,124 C326,96 322,66 326,40 Z" fill="#7a2622" />
          <path d="M250,44 C254,70 253,100 256,122 M338,44 C334,70 335,100 332,122" stroke="#000" strokeWidth={1.4} opacity={0.3} fill="none" />
        </g>
      )}
      {f.window === 'f_plant' && (
        <g transform="translate(314 118)">
          <path d="M-6,0 L6,0 L4.5,-9 L-4.5,-9 Z" fill="#8c4a2c" />
          <path d="M0,-9 C-7,-16 -9,-22 -6,-27 M0,-9 C2,-18 7,-22 10,-24 M0,-9 C0,-17 -1,-24 0,-30" stroke="#2f5a2c" strokeWidth={2} fill="none" />
          <ellipse cx={-6} cy={-26} rx={3} ry={1.6} fill="#3e7038" />
          <ellipse cx={10} cy={-24} rx={3} ry={1.6} fill="#3e7038" />
          <circle cx={0} cy={-31} r={2.4} fill="#b8342e" />
        </g>
      )}

      {/* Над шконкой */}
      {f.wall === 'f_calendar' && (
        <g transform="translate(62 50)">
          <rect x={1.5} y={1.5} width={34} height={46} fill="#000" opacity={0.3} />
          <rect width={34} height={46} fill="#e9e3d2" />
          <rect x={3} y={3} width={28} height={24} fill="#c9a88e" />
          <path d="M11,27 C11,19 14,13 17,12 C20,13 23,19 23,27 Z" fill="#a8453e" />
          <circle cx={17} cy={10} r={3.2} fill="#d9a37f" />
          <path d="M13.5,8 C14,5 20,5 20.5,9 L21,13 C19,11 15,11 13,13 Z" fill="#6a3a1c" />
          <path d="M6,31 H28 M6,35 H28 M6,39 H28 M6,43 H22" stroke="#8a8474" strokeWidth={0.6} />
          <rect width={34} height={46} filter="url(#sc-grime)" opacity={0.4} />
        </g>
      )}
      {f.wall === 'f_carpet' && (
        <g transform="translate(22 30)">
          <rect x={2} y={3} width={120} height={82} fill="#000" opacity={0.3} />
          <rect width={120} height={82} fill="#6e1a1a" />
          <rect x={5} y={5} width={110} height={72} fill="none" stroke="#b58a3a" strokeWidth={3} />
          <rect x={10} y={10} width={100} height={62} fill="#8a2323" />
          {[30, 60, 90].map((cx) => (
            <g key={cx}>
              <path d={`M${cx},16 L${cx + 14},41 L${cx},66 L${cx - 14},41 Z`} fill="#1f3558" stroke="#c49a48" strokeWidth={1.2} />
              <path d={`M${cx},26 L${cx + 7},41 L${cx},56 L${cx - 7},41 Z`} fill="#a02a2a" stroke="#d9b060" strokeWidth={0.8} />
            </g>
          ))}
          <rect width={120} height={82} filter="url(#sc-grime)" opacity={0.6} />
          <rect width={120} height={82} fill="none" stroke="#3a0e0e" strokeWidth={1.5} />
        </g>
      )}
      {f.wall === 'f_icons' && (
        <g transform="translate(44 40)">
          {[0, 28, 56].map((x, i) => (
            <g key={x} transform={`translate(${x} ${i === 1 ? -6 : 0})`}>
              <rect x={1.5} y={2} width={24} height={32} fill="#000" opacity={0.3} />
              <rect width={24} height={32} fill="#a67a22" stroke="#5a3e0c" strokeWidth={1} />
              <rect x={3} y={3} width={18} height={26} fill="#4a2a14" />
              <circle cx={12} cy={12} r={5} fill="#d6ad4a" opacity={0.85} />
              <ellipse cx={12} cy={13} rx={2.6} ry={3.2} fill="#b98b62" />
              <path d="M7,29 C7,20 17,20 17,29 Z" fill="#6b1f1f" />
            </g>
          ))}
        </g>
      )}

      {/* Шконка с тенью */}
      <rect x={8} y={214} width={158} height={24} fill="#000" opacity={0.45} filter="url(#sc-blur)" />
      <g>
        <rect x={10} y={138} width={5} height={98} fill="url(#sc-steel-v)" />
        <rect x={158} y={138} width={5} height={98} fill="url(#sc-steel-v)" />
        <rect x={8} y={134} width={9} height={5} rx={2} fill="url(#sc-steel)" />
        <rect x={156} y={134} width={9} height={5} rx={2} fill="url(#sc-steel)" />
        <rect x={10} y={168} width={153} height={6} fill="url(#sc-steel)" />
        <rect x={10} y={214} width={153} height={4} fill="url(#sc-steel)" />
        <rect x={15} y={160} width={143} height={9} fill="url(#sc-springs)" />
        {!f.bed && (
          <>
            <rect x={15} y={158} width={143} height={3} fill="url(#sc-steel)" />
            <rect x={20} y={154} width={40} height={6} rx={1} fill="#7b7563" opacity={0.9} />
          </>
        )}
        {f.bed && (
          <g>
            <path d="M14,152 C14,148 16,146 20,146 L154,146 C158,146 160,148 160,152 L160,166 C160,169 158,170 155,170 L19,170 C16,170 14,169 14,166 Z" fill="url(#sc-ticking)" />
            <path d="M14,152 C14,148 16,146 20,146 L154,146 C158,146 160,148 160,152 L160,166 C160,169 158,170 155,170 L19,170 C16,170 14,169 14,166 Z" fill="url(#sc-steel)" opacity={0.25} />
            <rect x={14} y={146} width={146} height={24} filter="url(#sc-grime)" opacity={0.5} />
            <path d="M30,140 C22,140 18,144 20,150 C22,154 40,155 52,153 C58,152 60,146 56,142 C50,139 40,139 30,140 Z" fill="#d8d2c2" />
            <path d="M24,148 C32,151 44,151 54,148" stroke="#9b9585" strokeWidth={1} fill="none" />
          </g>
        )}
        {(f.bed === 'f_blanket' || f.bed === 'f_bed_vip') && (
          <g>
            <path d="M66,144 L160,144 L161,176 C150,179 90,179 64,176 Z" fill={f.bed === 'f_bed_vip' ? '#5e1320' : '#51553f'} stroke="#1a1a12" strokeWidth={0.8} />
            <rect x={64} y={144} width={97} height={34} filter="url(#sc-grime)" opacity={0.45} />
            <path d="M80,150 C84,160 82,170 84,176 M120,148 C118,158 122,168 120,177" stroke="#000" strokeWidth={1.2} opacity={0.25} fill="none" />
            {f.bed === 'f_blanket' && <path d="M65,152 L160,152 M65,168 L160,168" stroke="#6b7056" strokeWidth={3} opacity={0.8} />}
            {f.bed === 'f_bed_vip' && <path d="M66,146 L160,146 M65,175 L160,175" stroke="#c49a48" strokeWidth={1.6} />}
          </g>
        )}
        {f.bed === 'f_bed_vip' && (
          <g>
            <path d="M6,104 C10,92 30,92 34,104 L34,140 L6,140 Z" fill="url(#sc-wood)" stroke="#2a1a0e" strokeWidth={1} />
            <path d="M10,106 C14,98 26,98 30,106 L30,136 L10,136 Z" fill="none" stroke="#c49a48" strokeWidth={1} />
            <ellipse cx={46} cy={144} rx={14} ry={7} fill="#6d4a78" />
          </g>
        )}
      </g>

      {f.floor === 'f_rug' && (
        <g>
          <ellipse cx={196} cy={260} rx={86} ry={15} fill="#5e4326" />
          <ellipse cx={196} cy={260} rx={78} ry={11.5} fill="none" stroke="#9c7a44" strokeWidth={2.5} strokeDasharray="7 3" />
          <ellipse cx={196} cy={260} rx={60} ry={7} fill="none" stroke="#7a2a22" strokeWidth={2} />
          <ellipse cx={196} cy={260} rx={86} ry={15} filter="url(#sc-grime)" opacity={0.6} />
        </g>
      )}

      {f.corner === 'f_fridge' && (
        <g transform="translate(322 126)">
          <rect x={-3} y={100} width={42} height={12} fill="#000" opacity={0.4} filter="url(#sc-blur-s)" />
          <linearGradient id="fridge" x1="0" x2="1">
            <stop offset="0" stopColor="#c9ccc4" />
            <stop offset="0.5" stopColor="#f1f2ec" />
            <stop offset="1" stopColor="#a8aba3" />
          </linearGradient>
          <rect width={38} height={108} rx={6} fill="url(#fridge)" stroke="#6d706a" strokeWidth={1} />
          <path d="M0,36 H38" stroke="#6d706a" strokeWidth={1} />
          <rect x={4} y={16} width={3} height={14} rx={1} fill="#8d9189" />
          <rect x={4} y={44} width={3} height={20} rx={1} fill="#8d9189" />
          <text x={22} y={96} fontSize={6} textAnchor="middle" fill="#8d9189" fontWeight="bold" fontStyle="italic">
            ЗИЛ
          </text>
          <rect width={38} height={108} rx={6} filter="url(#sc-grime)" opacity={0.35} />
        </g>
      )}
      {f.corner === 'f_aquarium' && (
        <g transform="translate(312 166)">
          <rect x={4} y={36} width={40} height={34} fill="url(#sc-wood)" />
          <rect x={0} y={0} width={48} height={36} fill="#2d6a82" opacity={0.75} />
          <rect x={0} y={28} width={48} height={8} fill="#8a7a55" />
          <path d="M8,30 C6,20 10,14 8,8 M40,30 C42,22 38,16 41,10" stroke="#2d5a2a" strokeWidth={2} fill="none" />
          <rect x={0} y={0} width={48} height={36} fill="url(#sc-glass)" stroke="#9fc4cf" strokeWidth={1} />
          <rect x={0} y={-3} width={48} height={4} fill="#1a1a1a" />
        </g>
      )}

      {f.table === 'f_tumba' && (
        <g transform="translate(262 186)">
          <rect x={-2} y={46} width={48} height={8} fill="#000" opacity={0.45} filter="url(#sc-blur-s)" />
          <rect width={44} height={50} fill="url(#sc-wood)" stroke="#2a1a0e" strokeWidth={1} />
          <rect x={4} y={6} width={36} height={14} fill="#5b3a24" stroke="#2a1a0e" strokeWidth={0.8} />
          <rect x={4} y={24} width={36} height={22} fill="#5b3a24" stroke="#2a1a0e" strokeWidth={0.8} />
          <circle cx={22} cy={13} r={1.4} fill="#c9a86a" />
          <rect width={44} height={50} filter="url(#sc-grime)" opacity={0.4} />
        </g>
      )}
      {f.table === 'f_table' && (
        <g transform="translate(244 186)">
          <rect x={0} y={44} width={80} height={8} fill="#000" opacity={0.45} filter="url(#sc-blur-s)" />
          <rect width={80} height={7} fill="url(#sc-wood)" stroke="#2a1a0e" strokeWidth={1} />
          <rect x={5} y={7} width={5} height={43} fill="#4a2f1e" />
          <rect x={70} y={7} width={5} height={43} fill="#4a2f1e" />
          <rect x={10} y={10} width={60} height={4} fill="#3a2416" />
          <g transform="translate(58 -15)">
            <path d="M0,0 L13,0 L12,15 L1,15 Z" fill="#c8c4b8" stroke="#555" strokeWidth={0.7} />
            <path d="M13,3 C19,4 19,11 12.5,12" fill="none" stroke="#666" strokeWidth={1.3} />
            <ellipse cx={6.5} cy={0.5} rx={6.5} ry={1.5} fill="#2a160a" />
            <path d="M2,3 L2,13" stroke="#fff" strokeWidth={1} opacity={0.3} />
          </g>
          <rect x={30} y={-4} width={16} height={4} fill="#d8cfb8" transform="rotate(-6 38 -2)" />
        </g>
      )}
      {f.tech === 'f_radio' && (
        <g transform={`translate(${tech.x} ${tech.y})`}>
          <rect width={38} height={28} rx={3} fill="url(#sc-wood)" stroke="#1a100a" strokeWidth={1} />
          <circle cx={12} cy={15} r={8.5} fill="#1e1510" />
          <circle cx={12} cy={15} r={7} fill="none" stroke="#5a4232" strokeDasharray="1 1.2" />
          <rect x={24} y={6} width={11} height={5} fill="#d9c98e" />
          <path d="M26,8.5 H33" stroke="#7a2a1a" strokeWidth={0.6} />
          <circle cx={29} cy={20} r={2.6} fill="#9c8058" stroke="#3a2a1a" strokeWidth={0.5} />
        </g>
      )}
      {f.tech === 'f_tv' && (
        <g transform={`translate(${tech.x} ${tech.y - 4})`}>
          <path d="M12,0 L4,-14 M26,0 L34,-14" stroke="#2a2a2a" strokeWidth={1.2} />
          <rect width={42} height={32} rx={3} fill="url(#sc-wood)" stroke="#1a100a" strokeWidth={1} />
          <rect x={4} y={4} width={26} height={24} rx={4} fill="#1a2226" />
          <circle cx={36} cy={10} r={2.2} fill="#bdb49a" />
          <circle cx={36} cy={18} r={2.2} fill="#bdb49a" />
        </g>
      )}
    </>
  );
}

function CellLive({ furniture }: { furniture: string[] }) {
  const f = bestBySpot(furniture);
  const tech = techPos(f);
  const night = sky(new Date().getHours()).night;
  return (
    <>
      {/* Лампа на шнуре */}
      <path d="M232,0 L232,34" stroke="#111" strokeWidth={1.2} />
      <rect x={228.5} y={32} width={7} height={6} rx={1} fill="#2a2a2a" />
      <circle className="lamp-flicker" cx={232} cy={44} r={100} fill="url(#sc-lamp)" />
      <circle className="lamp-flicker" cx={232} cy={43} r={5.5} fill="#fff5cf" />
      {/* Пыль в луче из окна */}
      {!night &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <circle key={i} className={`dust dust-${i}`} cx={250 - i * 14} cy={140 + (i % 3) * 22} r={0.9} fill="#fff6d8" />
        ))}
      <Crow x={286} y={117} />
      {f.corner === 'f_aquarium' && (
        <g transform="translate(312 166)">
          <g className="fish">
            <path d="M0,0 Q5,-3.5 10,0 Q5,3.5 0,0 Z M10,0 L14,-3 L14,3 Z" fill="#e2872c" transform="translate(8 11)" />
          </g>
          <g className="fish fish-2">
            <path d="M0,0 Q4,-2.6 8,0 Q4,2.6 0,0 Z M8,0 L11,-2 L11,2 Z" fill="#e6c84a" transform="translate(24 21)" />
          </g>
          <circle className="bubble" cx={36} cy={28} r={1.1} fill="#dff3fa" />
          <circle className="bubble bubble-2" cx={38} cy={28} r={0.8} fill="#dff3fa" />
        </g>
      )}
      {f.table === 'f_table' && <path className="steam" d="M308,168 Q305,162 309,156 Q312,150 309,144" fill="none" stroke="#fff" strokeWidth={1.6} opacity={0.5} />}
      {f.tech === 'f_radio' && (
        <text className="note" x={tech.x + 34} y={tech.y - 2} fontSize={10} fill="#efe2b0">
          ♪
        </text>
      )}
      {f.tech === 'f_tv' && <rect className="tv-screen" x={tech.x + 4} y={tech.y} width={26} height={24} rx={4} opacity={0.75} />}
    </>
  );
}

function Crow({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-10,0 Q-5,-12 5,-10 L12,-3 L5,0 Z" fill="#101010" />
      <path d="M-4,-7 Q2,-9 7,-6" stroke="#333" strokeWidth={0.8} fill="none" />
      <path d="M-10,0 L-17,4 L-9,2 Z" fill="#101010" />
      <g className="crow-head">
        <circle cx={7} cy={-12} r={4.4} fill="#141414" />
        <path d="M10.5,-13.2 L16.5,-11.4 L10.5,-10 Z" fill="#3a3a3a" />
        <circle cx={8.2} cy={-13} r={0.8} fill="#cfcfcf" />
      </g>
      <path d="M-1,0 L-1,5 M2.5,0 L2.5,5" stroke="#2a2a2a" strokeWidth={0.9} />
    </g>
  );
}

export function CellScene({ furniture, interior, children, onClick }: { furniture: string[]; interior?: InteriorIds; children?: ReactNode; onClick?: () => void }) {
  return (
    <Scene backdrop={<CellBackdrop furniture={furniture} interior={interior} />} onClick={onClick}>
      <CellLive furniture={furniture} />
      {children}
    </Scene>
  );
}

// --- Промзона ----------------------------------------------------------------

function WorkBackdrop() {
  return (
    <>
      <rect width={W} height={FLOOR} fill="#6a6b64" />
      <Grime x={0} y={0} w={W} h={FLOOR} stains={0.8} grime={0.55} />
      {[90, 180, 270].map((x) => (
        <path key={x} d={`M${x},0 V${FLOOR}`} stroke="#4a4b45" strokeWidth={1.2} />
      ))}
      <path d="M0,118 H360" stroke="#4a4b45" strokeWidth={1.2} />
      {/* Трубы */}
      <rect y={60} width={W} height={7} fill="url(#sc-steel)" />
      <rect y={72} width={W} height={4} fill="url(#sc-steel)" opacity={0.8} />
      {[40, 150, 260].map((x) => (
        <rect key={x} x={x} y={57} width={6} height={22} rx={1} fill="#2a2f35" />
      ))}
      <rect x={336} y={60} width={7} height={FLOOR - 60} fill="url(#sc-steel-v)" />
      <path d="M200,67 C200,80 203,90 201,100" stroke="#6b3a1c" strokeWidth={2} opacity={0.45} />
      {/* Лозунг на кумаче */}
      <g>
        <path d="M60,20 L300,20 L298,44 L62,44 Z" fill="#7a211d" />
        <path d="M110,20 C112,30 110,38 112,44 M190,20 C188,30 191,38 189,44 M250,20 C252,30 250,38 252,44" stroke="#000" strokeWidth={1.4} opacity={0.2} />
        <text x={180} y={36.5} fontSize={10.5} textAnchor="middle" fill="#ecdcbc" fontWeight={800} letterSpacing={0.8}>
          НА СВОБОДУ — С ЧИСТОЙ СОВЕСТЬЮ
        </text>
        <rect x={60} y={20} width={240} height={24} filter="url(#sc-grime)" opacity={0.5} />
      </g>
      {/* Электрощиток */}
      <g transform="translate(20 96)">
        <rect width={30} height={40} fill="#4c5a4c" stroke="#222" />
        <path d="M12,12 L18,12 L13,22 L19,22 L10,34 L13,24 L8,24 Z" fill="#e0c23a" />
        <rect width={30} height={40} filter="url(#sc-grime)" opacity={0.5} />
      </g>
      {/* Пол */}
      <rect y={FLOOR} width={W} height={H - FLOOR} fill="#44453f" />
      <rect y={FLOOR} width={W} height={H - FLOOR} filter="url(#sc-grime)" opacity={0.6} />
      <ellipse cx={90} cy={262} rx={30} ry={5} fill="#15150f" opacity={0.5} filter="url(#sc-blur-s)" />
      <path d="M0,236 H360" stroke="#22231f" strokeWidth={2} />

      {/* Швейная машина на столе */}
      <g transform="translate(10 176)">
        <rect x={0} y={56} width={100} height={8} fill="#000" opacity={0.45} filter="url(#sc-blur-s)" />
        <rect x={0} y={24} width={100} height={6} fill="url(#sc-wood)" />
        <rect x={6} y={30} width={4} height={30} fill="url(#sc-steel-v)" />
        <rect x={90} y={30} width={4} height={30} fill="url(#sc-steel-v)" />
        <path d="M22,24 L22,4 Q22,0 26,0 L64,0 Q68,0 68,4 L68,11 L57,11 L57,24 Z" fill="#1c1c1c" stroke="#000" />
        <path d="M24,2 L64,2" stroke="#b8923e" strokeWidth={2.4} />
        <path d="M26,5 L60,5" stroke="#fff" strokeWidth={0.8} opacity={0.15} />
        <rect x={42} y={19} width={36} height={5} fill="#3a5a8a" />
      </g>
      {/* Конвейер */}
      <g transform="translate(244 196)">
        <rect x={0} y={38} width={116} height={6} fill="#000" opacity={0.45} filter="url(#sc-blur-s)" />
        <rect x={0} y={14} width={116} height={9} fill="#232323" />
        {[6, 30, 54, 78, 102].map((x) => (
          <circle key={x} cx={x} cy={18.5} r={3.6} fill="url(#sc-steel)" stroke="#111" />
        ))}
        <rect x={4} y={23} width={5} height={17} fill="url(#sc-steel-v)" />
        <rect x={106} y={23} width={5} height={17} fill="url(#sc-steel-v)" />
      </g>
    </>
  );
}

function WorkLive() {
  return (
    <>
      {[60, 180, 300].map((x) => (
        <g key={x}>
          <path d={`M${x},0 L${x},84`} stroke="#151515" />
          <path d={`M${x - 16},84 L${x + 16},84 L${x + 9},92 L${x - 9},92 Z`} fill="#2e302c" />
          <ellipse className="lamp-flicker" cx={x} cy={150} rx={64} ry={90} fill="url(#sc-lamp)" />
          <ellipse cx={x} cy={92} rx={6} ry={2} fill="#fff4c8" />
        </g>
      ))}
      <path className="needle" d="M73,187 L73,197" stroke="#ccc" strokeWidth={1.2} />
      <g transform="translate(244 196)">
        <clipPath id="belt-clip">
          <rect x={0} y={-20} width={116} height={34} />
        </clipPath>
        <g clipPath="url(#belt-clip)">
          <g className="conveyor">
            {[0, 40, 80].map((x) => (
              <g key={x} transform={`translate(${x} 0)`}>
                <rect width={24} height={14} fill="#9a7446" stroke="#5a3e1e" />
                <path d="M0,5 H24 M12,0 V5" stroke="#6d4f2a" />
              </g>
            ))}
          </g>
        </g>
      </g>
      <g transform="translate(232 170)">
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={i} className={`spark spark-${i}`} r={1.3} fill="#ffcf5a" />
        ))}
      </g>
    </>
  );
}

export function WorkScene({ children }: { children?: ReactNode }) {
  return (
    <Scene backdrop={<WorkBackdrop />}>
      <WorkLive />
      {children}
    </Scene>
  );
}

// --- Двор --------------------------------------------------------------------

function YardBackdrop({ tower }: { tower: boolean }) {
  const s = sky(new Date().getHours());
  return (
    <>
      <linearGradient id="yard-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={s.top} />
        <stop offset="1" stopColor={s.bottom} />
      </linearGradient>
      <rect width={W} height={150} fill="url(#yard-sky)" />
      {s.night && <circle cx={70} cy={36} r={9} fill="#efe9c4" filter="url(#sc-blur-s)" />}
      {/* Барак за забором */}
      <path d="M150,70 L230,50 L310,70 L310,110 L150,110 Z" fill="#4c4a44" />
      <path d="M144,72 L230,46 L316,72 L310,74 L230,52 L150,74 Z" fill="#2f2e2a" />
      {[170, 200, 260, 290].map((x) => (
        <rect key={x} x={x} y={80} width={10} height={12} fill="#20201c" />
      ))}
      {/* Бетонный забор */}
      <rect y={104} width={W} height={100} fill="#8a887d" />
      <Grime x={0} y={104} w={W} h={100} stains={0.9} grime={0.55} />
      {Array.from({ length: 10 }, (_, i) => (
        <g key={i}>
          <rect x={i * 40 - 1} y={104} width={3} height={100} fill="#5f5d55" />
          <rect x={i * 40 + 2} y={104} width={1} height={100} fill="#b3b0a4" opacity={0.4} />
        </g>
      ))}
      <rect y={100} width={W} height={5} fill="#6d6b62" />
      {/* Колючая проволока */}
      <path d="M0,86 H360" stroke="#555" strokeWidth={0.8} />
      {Array.from({ length: 30 }, (_, i) => (
        <g key={i}>
          <ellipse cx={i * 12.5 + 6} cy={92} rx={7} ry={8} fill="none" stroke="#3e3e3e" strokeWidth={1.1} />
          <ellipse cx={i * 12.5 + 5} cy={91} rx={7} ry={8} fill="none" stroke="#9a9a9a" strokeWidth={0.4} opacity={0.6} />
        </g>
      ))}
      {tower && (
        <g transform="translate(290 18)">
          <path d="M6,40 L0,186 M36,40 L42,186 M6,80 L36,120 M36,80 L6,120 M3,150 L39,150" stroke="#3b3024" strokeWidth={3.2} />
          <rect x={-6} y={20} width={54} height={24} fill="#5b4a36" stroke="#2a2016" />
          <rect x={-6} y={20} width={54} height={24} filter="url(#sc-grime)" opacity={0.6} />
          <path d="M-12,20 L21,0 L54,20 Z" fill="#3a2f22" />
          <rect x={4} y={25} width={12} height={12} fill="#141414" />
          <rect x={24} y={25} width={12} height={12} fill="#141414" />
        </g>
      )}
      {/* Асфальт */}
      <rect y={196} width={W} height={H - 196} fill="#4e4d48" />
      <rect y={196} width={W} height={H - 196} filter="url(#sc-grime)" opacity={0.7} />
      <rect y={196} width={W} height={H - 196} filter="url(#sc-stains)" opacity={0.5} />
      <path d="M30,230 L52,236 L60,250 M250,220 L262,232 L280,234 L286,248" stroke="#2a2a26" strokeWidth={0.9} fill="none" />
      <ellipse cx={300} cy={258} rx={34} ry={6} fill="#6d7478" opacity={0.45} />
      <path d="M0,196 H360" stroke="#33322e" strokeWidth={2} />
      {/* Турник */}
      <g transform="translate(22 130)">
        <rect x={-2} y={0} width={4} height={118} fill="url(#sc-steel-v)" />
        <rect x={60} y={0} width={4} height={118} fill="url(#sc-steel-v)" />
        <rect x={0} y={6} width={62} height={3} fill="url(#sc-steel)" />
      </g>
    </>
  );
}

function YardLive({ tower }: { tower: boolean }) {
  const s = sky(new Date().getHours());
  return (
    <>
      {!s.night && (
        <g className="cloud-drift slow" opacity={0.7}>
          <ellipse cx={60} cy={30} rx={30} ry={7} fill="#fff" filter="url(#sc-blur-s)" />
          <ellipse cx={200} cy={20} rx={24} ry={5} fill="#fff" filter="url(#sc-blur-s)" />
        </g>
      )}
      {tower && (
        <g transform="translate(290 18)">
          <path className="searchlight" d="M16,26 L-170,196 L-90,210 Z" fill="url(#sc-beam)" />
          <circle cx={16} cy={26} r={4} fill="#fff6c8" />
        </g>
      )}
    </>
  );
}

export function YardScene({ children, tower = true }: { children?: ReactNode; tower?: boolean }) {
  return (
    <Scene backdrop={<YardBackdrop tower={tower} />}>
      <YardLive tower={tower} />
      {children}
    </Scene>
  );
}

/** Рисунок нижней панели стены под выбранную отделку. */
function WallPattern({ id, accent }: { id: string; accent: string }) {
  if (id === 'w_tiles') {
    return (
      <g stroke={accent} strokeWidth={0.8}>
        {Array.from({ length: 8 }, (_, i) => <path key={`h${i}`} d={`M0,${156 + i * 11} H${W}`} />)}
        {Array.from({ length: 33 }, (_, i) => <path key={`v${i}`} d={`M${i * 11},154 V${FLOOR}`} />)}
      </g>
    );
  }
  if (id === 'w_wood') {
    return (
      <g stroke={accent} strokeWidth={1.2}>
        {Array.from({ length: 30 }, (_, i) => <path key={i} d={`M${i * 12 + 6},154 V${FLOOR}`} />)}
      </g>
    );
  }
  if (id === 'w_royal') {
    return (
      <g fill="none" stroke={accent} strokeWidth={0.8} opacity={0.8}>
        {Array.from({ length: 12 }, (_, i) =>
          Array.from({ length: 3 }, (_, j) => (
            <path key={`${i}-${j}`} d={`M${i * 32 + 8 + (j % 2) * 16},${170 + j * 22} l6,-7 l6,7 l-6,7 z`} />
          )),
        )}
        <path d={`M0,158 H${W} M0,${FLOOR - 6} H${W}`} strokeWidth={1.5} />
      </g>
    );
  }
  if (id === 'w_blue') {
    return <path d={`M0,195 H${W}`} stroke={accent} strokeWidth={2} />;
  }
  return null;
}

function FloorPattern({ id, accent }: { id: string; accent: string }) {
  const h = H - FLOOR;
  if (id === 'f_tile') {
    return (
      <g stroke={accent} strokeWidth={1}>
        {Array.from({ length: 4 }, (_, i) => <path key={`h${i}`} d={`M0,${FLOOR + i * 12} H${W}`} />)}
        {Array.from({ length: 19 }, (_, i) => <path key={`v${i}`} d={`M${i * 20},${FLOOR} V${H}`} />)}
      </g>
    );
  }
  if (id === 'f_parquet') {
    return (
      <g stroke={accent} strokeWidth={1}>
        {Array.from({ length: 40 }, (_, i) => (
          <path key={i} d={`M${i * 10},${FLOOR} l10,${h / 2} l-10,${h / 2}`} fill="none" />
        ))}
      </g>
    );
  }
  // линолеум: крупный «ромбик»
  return (
    <g stroke={accent} strokeWidth={0.8} opacity={0.7}>
      {Array.from({ length: 24 }, (_, i) => <path key={i} d={`M${i * 18 - 20},${H} L${i * 18 + 20},${FLOOR} M${i * 18 - 20},${FLOOR} L${i * 18 + 20},${H}`} />)}
    </g>
  );
}
