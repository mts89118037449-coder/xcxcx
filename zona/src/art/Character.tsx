// Персонаж, собранный из слоёв SVG: тело → наколки → шмот → оружие → голова.
// Координаты в собственной системе 120×230 (ступни на y≈208).

import type { ReactNode } from 'react';
import type { Look } from '../../shared/types.ts';

export type Mood = 'idle' | 'win' | 'hurt';

const SKIN = '#e6b08a';
const SKIN_SHADE = '#c68862';
const LINE = '#3b2418';
const INK = '#2c4d73';
const GOLD = '#e8b33c';

interface Props {
  look: Look;
  mood?: Mood;
  /** Без верха — видно наколки на груди и руках. */
  bare?: boolean;
  /** Отличает NPC: худой зэк, толстый начкар и т.д. */
  build?: number;
}

/** Мышцы растут с силой, но в разумных пределах. */
function bulkOf(str: number, build = 1): number {
  return Math.max(0.88, Math.min(1.32, 0.9 + (str - 5) * 0.01)) * build;
}

export function CharacterG({ look, mood = 'idle', bare = false, build }: Props) {
  const b = bulkOf(look.str, build);
  const X = (x: number) => 60 + (x - 60) * b;
  const eq = look.equipped;
  const body = !bare && eq.body ? BODY[eq.body] : undefined;
  const legs = eq.legs ? LEGS[eq.legs] : undefined;
  const armL = `M${X(35)},64 Q${X(23)},86 ${X(25)},104 Q${X(23)},120 ${X(24)},136`;
  const armR = `M${X(85)},64 Q${X(97)},86 ${X(95)},104 Q${X(97)},120 ${X(96)},136`;
  const sleeveL = `M${X(35)},64 Q${X(23)},86 ${X(25)},104 Q${X(23)},118 ${X(24)},128`;
  const sleeveR = `M${X(85)},64 Q${X(97)},86 ${X(95)},104 Q${X(97)},118 ${X(96)},128`;
  const shortL = `M${X(35)},64 Q${X(26)},78 ${X(25)},90`;
  const shortR = `M${X(85)},64 Q${X(94)},78 ${X(95)},90`;
  const torso = `M${X(34)},60 Q60,53 ${X(86)},60 L${X(84)},92 Q${X(80)},116 ${X(78)},124 L${X(42)},124 Q${X(40)},116 ${X(36)},92 Z`;
  const hands: [number, number][] = [
    [X(24), 140],
    [X(96), 140],
  ];
  const armW = 11 * b;

  return (
    <g className="char">
      <g className="char-breathe">
        {/* Ноги */}
        <Limb d="M50,122 L47,198" w={14} />
        <Limb d="M70,122 L73,198" w={14} />
        {!eq.feet && (
          <>
            <ellipse cx={45} cy={203} rx={9} ry={5} fill={SKIN} stroke={LINE} strokeWidth={1.2} />
            <ellipse cx={75} cy={203} rx={9} ry={5} fill={SKIN} stroke={LINE} strokeWidth={1.2} />
          </>
        )}

        {/* Торс и руки */}
        <path d={torso} fill={SKIN} stroke={LINE} strokeWidth={1.5} />
        <path d={`M${X(44)},80 Q${X(52)},86 60,82 Q${X(68)},86 ${X(76)},80`} fill="none" stroke={SKIN_SHADE} strokeWidth={1.3} />
        <path d="M55,100 Q60,103 65,100 M56,108 Q60,110 64,108" fill="none" stroke={SKIN_SHADE} strokeWidth={1} opacity={0.7} />
        <circle cx={60} cy={114} r={1.2} fill={SKIN_SHADE} />
        <Limb d={armL} w={armW} />
        <Limb d={armR} w={armW} />

        {/* Наколки — прямо на коже, под одеждой */}
        {look.tattoos.map((t) => (
          <g key={t} className="tattoo">
            {TATTOO[t]?.(X)}
          </g>
        ))}

        {/* Трусы, если нет штанов */}
        {!legs && (
          <path d="M39,117 L81,117 L83,148 L64,148 L60,134 L56,148 L37,148 Z" fill="#2c4a8c" stroke={LINE} strokeWidth={1.2} />
        )}
        {legs && (
          <g>
            <Limb d="M50,122 L47,194" w={17} color={legs.color} />
            <Limb d="M70,122 L73,194" w={17} color={legs.color} />
            <path d="M38,116 L82,116 L81,134 L39,134 Z" fill={legs.color} stroke={LINE} strokeWidth={1.2} />
            {legs.detail?.()}
          </g>
        )}
        {eq.feet && FEET[eq.feet]?.()}

        {/* Верх */}
        {body && (
          <g>
            {body.sleeves !== 'none' && (
              <>
                <Limb d={body.sleeves === 'long' ? sleeveL : shortL} w={armW + 4} color={body.color} />
                <Limb d={body.sleeves === 'long' ? sleeveR : shortR} w={armW + 4} color={body.color} />
              </>
            )}
            <path
              d={`M${X(32)},58 Q60,51 ${X(88)},58 L${X(86)},92 Q${X(84)},${body.long ? 150 : 118} ${X(body.long ? 88 : 82)},${body.long ? 172 : 130} L${X(body.long ? 32 : 38)},${body.long ? 172 : 130} Q${X(36)},${body.long ? 150 : 118} ${X(34)},92 Z`}
              fill={body.color}
              stroke={LINE}
              strokeWidth={1.5}
            />
            <path d="M52,56 L60,70 L68,56 Z" fill={SKIN} stroke={LINE} strokeWidth={1} />
            {body.detail?.(X)}
          </g>
        )}

        {/* Оружие — в правой руке, под кистью */}
        {eq.weapon && WEAPON[eq.weapon]?.(hands[1][0], hands[1][1])}
        {hands.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={6.2 * Math.min(b, 1.15)} fill={SKIN} stroke={LINE} strokeWidth={1.3} />
        ))}
        {eq.charm && CHARM[eq.charm]?.(X, hands)}

        {/* Голова */}
        <rect x={53} y={42} width={14} height={16} fill={SKIN} stroke={LINE} strokeWidth={1.2} />
        <ellipse cx={42.5} cy={31} rx={3.5} ry={5.5} fill={SKIN} stroke={LINE} strokeWidth={1.2} />
        <ellipse cx={77.5} cy={31} rx={3.5} ry={5.5} fill={SKIN} stroke={LINE} strokeWidth={1.2} />
        <ellipse cx={60} cy={29} rx={17} ry={20} fill={SKIN} stroke={LINE} strokeWidth={1.5} />
        {/* Бритая голова и щетина */}
        <path d="M44,22 Q46,8 60,8 Q74,8 76,22 Q68,15 60,15 Q52,15 44,22 Z" fill="#6f5a48" opacity={0.35} />
        <path d="M46,38 Q48,49 60,50 Q72,49 74,38 Q70,44 60,45 Q50,44 46,38 Z" fill="#6f5a48" opacity={0.25} />
        <path d="M46,22 L55,24.5 M65,24.5 L74,22" stroke={LINE} strokeWidth={2.2} strokeLinecap="round" />
        <g className="char-eyes">
          <ellipse cx={51} cy={29} rx={3.2} ry={2.4} fill="#fff" />
          <ellipse cx={69} cy={29} rx={3.2} ry={2.4} fill="#fff" />
          <circle cx={51.5} cy={29.2} r={1.5} fill="#2a1a10" />
          <circle cx={69.5} cy={29.2} r={1.5} fill="#2a1a10" />
        </g>
        <path d="M60,29 Q57,37 59.5,38.5 Q62,39 63,37.5" fill="none" stroke={SKIN_SHADE} strokeWidth={1.3} />
        {mood === 'win' && <path d="M52,42 Q60,49 68,42" fill="#7a2b22" stroke={LINE} strokeWidth={1.2} />}
        {mood === 'idle' && <path d="M53,43 Q60,44.5 67,43" fill="none" stroke={LINE} strokeWidth={1.6} strokeLinecap="round" />}
        {mood === 'hurt' && (
          <>
            <path d="M53,45 Q60,41.5 67,45" fill="none" stroke={LINE} strokeWidth={1.6} strokeLinecap="round" />
            <ellipse cx={51} cy={29} rx={5.5} ry={4.5} fill="#5d2f73" opacity={0.45} />
            <g transform="rotate(-25 67 16)">
              <rect x={61} y={13.5} width={12} height={5} rx={1} fill="#e8d2a8" stroke="#b89968" strokeWidth={0.6} />
              <rect x={65} y={10} width={4} height={12} rx={1} fill="#e8d2a8" stroke="#b89968" strokeWidth={0.6} />
            </g>
          </>
        )}
        {eq.head && HEAD[eq.head]?.()}
      </g>
    </g>
  );
}

/** Персонаж отдельной картинкой. */
export function Character(props: Props & { className?: string; height?: number }) {
  return (
    <svg className={props.className} viewBox="0 0 120 215" height={props.height} role="img" aria-label="Персонаж">
      <CharacterG {...props} />
    </svg>
  );
}

function Limb({ d, w, color = SKIN }: { d: string; w: number; color?: string }) {
  return (
    <>
      <path d={d} fill="none" stroke={LINE} strokeWidth={w + 3} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

// --- Одежда -----------------------------------------------------------------

type Xf = (x: number) => number;

interface BodyArt {
  color: string;
  sleeves: 'none' | 'short' | 'long';
  long?: boolean; // шинель ниже колен
  detail?: (X: Xf) => ReactNode;
}

const stripe = (X: Xf) => (
  <>
    {[-2.5, 0, 2.5].map((o) => (
      <g key={o}>
        <path d={`M${X(33) + o},66 Q${X(23) + o},88 ${X(24) + o},126`} stroke="#fff" strokeWidth={0.9} fill="none" />
        <path d={`M${X(87) - o},66 Q${X(97) - o},88 ${X(96) - o},126`} stroke="#fff" strokeWidth={0.9} fill="none" />
      </g>
    ))}
  </>
);

const epaulettes = (X: Xf, color = GOLD) => (
  <>
    <rect x={X(34)} y={56} width={12} height={5} rx={1.5} fill={color} stroke={LINE} strokeWidth={0.8} transform={`rotate(12 ${X(40)} 58)`} />
    <rect x={X(74)} y={56} width={12} height={5} rx={1.5} fill={color} stroke={LINE} strokeWidth={0.8} transform={`rotate(-12 ${X(80)} 58)`} />
  </>
);

const BODY: Record<string, BodyArt> = {
  body_robe: {
    color: '#2e3746',
    sleeves: 'long',
    detail: () => (
      <>
        <rect x={64} y={78} width={14} height={8} fill="#e9e4d6" stroke={LINE} strokeWidth={0.6} />
        <path d="M66,81 L76,81 M66,83.5 L73,83.5" stroke="#555" strokeWidth={0.8} />
        {[76, 90, 104, 118].map((y) => <circle key={y} cx={60} cy={y} r={1.3} fill="#11151c" />)}
      </>
    ),
  },
  body_quilted: {
    color: '#23262b',
    sleeves: 'long',
    detail: (X) => (
      <>
        {[72, 82, 92, 102, 112, 122].map((y) => (
          <path key={y} d={`M${X(36)},${y} L${X(84)},${y}`} stroke="#3c4048" strokeWidth={1} />
        ))}
        <path d="M60,70 L60,130" stroke="#111" strokeWidth={1.2} />
      </>
    ),
  },
  body_leather: {
    color: '#5b3322',
    sleeves: 'long',
    detail: (X) => (
      <>
        <path d={`M52,56 L${X(40)},76 L56,72 Z M68,56 L${X(80)},76 L64,72 Z`} fill="#6e412c" stroke={LINE} strokeWidth={0.9} />
        <path d="M60,70 L60,130" stroke="#c9c9c9" strokeWidth={1.2} strokeDasharray="1.5 1.5" />
        <path d={`M${X(38)},100 L${X(48)},100 M${X(72)},100 L${X(82)},100`} stroke="#3b2015" strokeWidth={1.2} />
      </>
    ),
  },
  body_tracksuit: {
    color: '#1f4ea3',
    sleeves: 'long',
    detail: (X) => (
      <>
        {stripe(X)}
        <path d="M60,70 L60,130" stroke="#e6e6e6" strokeWidth={1.3} />
        <path d="M52,56 L60,62 L68,56" fill="none" stroke="#fff" strokeWidth={1.4} />
      </>
    ),
  },
  drop_coat: {
    color: '#5c6152',
    sleeves: 'long',
    long: true,
    detail: (X) => (
      <>
        {epaulettes(X)}
        {[80, 96, 112, 128].map((y) => (
          <g key={y}>
            <circle cx={55} cy={y} r={1.6} fill={GOLD} />
            <circle cx={65} cy={y} r={1.6} fill={GOLD} />
          </g>
        ))}
        <rect x={X(34)} y={120} width={X(86) - X(34)} height={5} fill="#3b2a1a" />
      </>
    ),
  },
  npc_uniform: {
    color: '#55623f',
    sleeves: 'long',
    detail: (X) => (
      <>
        {epaulettes(X, '#8e2f2a')}
        <rect x={X(36)} y={118} width={X(84) - X(36)} height={6} fill="#2b2014" />
        <rect x={57} y={117} width={6} height={8} fill={GOLD} stroke={LINE} strokeWidth={0.5} />
        <path d={`M${X(42)},82 L${X(52)},82 L${X(52)},90 L${X(42)},90 Z M${X(68)},82 L${X(78)},82 L${X(78)},90 L${X(68)},90 Z`} fill="none" stroke="#3f4a2e" strokeWidth={1} />
      </>
    ),
  },
  npc_rags: {
    color: '#77705f',
    sleeves: 'none',
    detail: (X) => (
      <>
        <rect x={X(44)} y={98} width={9} height={8} fill="#5d5647" transform={`rotate(-8 ${X(48)} 102)`} />
        <path d={`M${X(40)},128 L${X(46)},122 L${X(52)},130 L${X(60)},122 L${X(68)},130 L${X(76)},122 L${X(80)},128`} fill="none" stroke={LINE} strokeWidth={1} />
      </>
    ),
  },
};

interface LegsArt {
  color: string;
  detail?: () => ReactNode;
}

const LEGS: Record<string, LegsArt> = {
  legs_pants: { color: '#3a4251' },
  legs_cargo: {
    color: '#5c5a3a',
    detail: () => (
      <>
        <rect x={39} y={148} width={8} height={10} fill="#4c4a2e" stroke={LINE} strokeWidth={0.7} />
        <rect x={73} y={148} width={8} height={10} fill="#4c4a2e" stroke={LINE} strokeWidth={0.7} />
      </>
    ),
  },
  legs_jeans: {
    color: '#6f8fbb',
    detail: () => (
      <>
        {[
          [46, 140],
          [72, 156],
          [49, 172],
          [74, 132],
          [46, 186],
        ].map(([x, y], i) => (
          <ellipse key={i} cx={x} cy={y} rx={3.5} ry={2.2} fill="#c4d4ea" opacity={0.8} />
        ))}
      </>
    ),
  },
  npc_pants: { color: '#4d5a39', detail: () => <path d="M47,132 L45,192 M73,132 L75,192" stroke="#8e2f2a" strokeWidth={1.4} /> },
};

const FEET: Record<string, () => ReactNode> = {
  feet_slippers: () => (
    <>
      {[45, 75].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={204} rx={10} ry={4.5} fill="#1d2a4a" stroke={LINE} strokeWidth={1} />
          <ellipse cx={x} cy={200} rx={7} ry={3} fill={SKIN} stroke={LINE} strokeWidth={1} />
          <path d={`M${x - 6},200 Q${x},196 ${x + 6},200`} stroke="#2f4f8f" strokeWidth={3} fill="none" />
        </g>
      ))}
    </>
  ),
  feet_kirza: () => (
    <>
      {[45, 75].map((x) => (
        <g key={x}>
          <path d={`M${x - 7},176 L${x + 7},176 L${x + 7},200 L${x + (x < 60 ? 3 : 11)},200 L${x + (x < 60 ? 3 : 11)},207 L${x - (x < 60 ? 11 : 3)},207 L${x - (x < 60 ? 11 : 3)},200 L${x - 7},200 Z`} fill="#1a1a1a" stroke="#000" strokeWidth={1} />
          <path d={`M${x - 6},180 L${x + 6},180`} stroke="#333" strokeWidth={1} />
        </g>
      ))}
    </>
  ),
  feet_sneakers: () => (
    <>
      {[45, 75].map((x) => (
        <g key={x}>
          <path d={`M${x - 10},206 Q${x - 11},196 ${x - 3},195 L${x + 5},195 Q${x + 11},198 ${x + 10},206 Z`} fill="#f2f2f2" stroke={LINE} strokeWidth={1} />
          <rect x={x - 10} y={204} width={20} height={3} fill="#c0392b" />
          <path d={`M${x - 5},199 L${x + 3},201`} stroke="#1f4ea3" strokeWidth={1.8} />
        </g>
      ))}
    </>
  ),
};

const HEAD: Record<string, () => ReactNode> = {
  cap_knit: () => (
    <>
      <path d="M42,24 Q41,4 60,4 Q79,4 78,24 Z" fill="#434b59" stroke={LINE} strokeWidth={1.2} />
      <rect x={41} y={18} width={38} height={7} rx={2} fill="#353c48" stroke={LINE} strokeWidth={1} />
    </>
  ),
  cap_ushanka: () => (
    <>
      <rect x={37} y={18} width={9} height={24} rx={4} fill="#6b4f36" stroke={LINE} strokeWidth={1} />
      <rect x={74} y={18} width={9} height={24} rx={4} fill="#6b4f36" stroke={LINE} strokeWidth={1} />
      <path d="M40,22 Q38,0 60,0 Q82,0 80,22 Z" fill="#3e4a38" stroke={LINE} strokeWidth={1.2} />
      <rect x={39} y={14} width={42} height={9} rx={4} fill="#7a5c40" stroke={LINE} strokeWidth={1} />
      <circle cx={60} cy={9} r={2.4} fill="#c0392b" />
    </>
  ),
  cap_bandana: () => (
    <>
      <path d="M43,20 Q43,6 60,6 Q77,6 77,20 Z" fill="#9c2a26" stroke={LINE} strokeWidth={1.2} />
      <rect x={42} y={16} width={36} height={6} fill="#b73530" stroke={LINE} strokeWidth={1} />
      <path d="M77,18 L86,14 L84,22 Z M77,19 L85,26 L80,27 Z" fill="#9c2a26" stroke={LINE} strokeWidth={0.8} />
      {[48, 56, 64, 72].map((x) => <circle key={x} cx={x} cy={12} r={1} fill="#f1d9c0" />)}
    </>
  ),
  cap_gold: () => (
    <>
      <path d="M42,20 Q42,5 60,5 Q78,5 78,20 Z" fill="#d6a032" stroke={LINE} strokeWidth={1.2} />
      <path d="M42,19 Q60,24 78,19 L79,23 Q60,31 41,23 Z" fill="#b8841f" stroke={LINE} strokeWidth={1} />
      <text x={60} y={16} fontSize={6} textAnchor="middle" fill="#3b2418" fontWeight="bold">
        ПАХАН
      </text>
    </>
  ),
  drop_crown: () => (
    <>
      <path d="M44,15 L47,1 L53,9 L60,-2 L67,9 L73,1 L76,15 Z" fill={GOLD} stroke={LINE} strokeWidth={1.2} />
      <circle cx={60} cy={9} r={2} fill="#c0392b" />
      <circle cx={51} cy={11} r={1.4} fill="#2e86de" />
      <circle cx={69} cy={11} r={1.4} fill="#27ae60" />
    </>
  ),
  npc_guard_cap: () => (
    <>
      <ellipse cx={60} cy={10} rx={22} ry={6} fill="#55623f" stroke={LINE} strokeWidth={1.2} />
      <rect x={43} y={10} width={34} height={8} fill="#8e2f2a" stroke={LINE} strokeWidth={1} />
      <path d="M44,18 Q60,25 76,18 L76,20 Q60,28 44,20 Z" fill="#111" />
      <circle cx={60} cy={13} r={2.4} fill={GOLD} stroke={LINE} strokeWidth={0.5} />
    </>
  ),
  npc_officer_cap: () => (
    <>
      <ellipse cx={60} cy={9} rx={25} ry={7} fill="#4a5140" stroke={LINE} strokeWidth={1.2} />
      <rect x={42} y={9} width={36} height={9} fill="#2a2f25" stroke={LINE} strokeWidth={1} />
      <path d="M43,18 Q60,26 77,18 L77,21 Q60,29 43,21 Z" fill="#111" />
      <path d="M52,13 L68,13" stroke={GOLD} strokeWidth={1.5} />
      <circle cx={60} cy={9} r={3} fill={GOLD} stroke={LINE} strokeWidth={0.5} />
    </>
  ),
};

const WEAPON: Record<string, (x: number, y: number) => ReactNode> = {
  wpn_spoon: (x, y) => (
    <g>
      <path d={`M${x},${y} L${x + 3},${y - 24}`} stroke="#9aa2ab" strokeWidth={2.4} strokeLinecap="round" />
      <path d={`M${x + 3},${y - 24} L${x + 5},${y - 31}`} stroke="#d7dde3" strokeWidth={1.2} />
      <ellipse cx={x + 0.5} cy={y + 6} rx={3} ry={4.5} fill="#b5bdc6" stroke={LINE} strokeWidth={0.8} />
    </g>
  ),
  wpn_rebar: (x, y) => (
    <g>
      <path d={`M${x - 1},${y + 16} L${x + 5},${y - 46}`} stroke="#5f4b3d" strokeWidth={4.5} strokeLinecap="round" />
      <path d={`M${x - 1},${y + 16} L${x + 5},${y - 46}`} stroke="#8a6b52" strokeWidth={4.5} strokeDasharray="1.5 3" />
    </g>
  ),
  wpn_knuckles: (x, y) => (
    <g>
      <rect x={x - 7} y={y - 9} width={14} height={6} rx={2} fill="#9aa2ab" stroke={LINE} strokeWidth={0.9} />
      {[-4.5, -1.5, 1.5, 4.5].map((o) => <circle key={o} cx={x + o} cy={y - 9} r={1.8} fill="#c7cdd4" stroke={LINE} strokeWidth={0.5} />)}
    </g>
  ),
  wpn_chain: (x, y) => (
    <g fill="none" stroke="#8d949b" strokeWidth={1.6}>
      {Array.from({ length: 9 }, (_, i) => (
        <ellipse key={i} cx={x + 2 + Math.sin(i / 2) * 3} cy={y + 6 + i * 5} rx={i % 2 ? 1.4 : 2.6} ry={3} />
      ))}
    </g>
  ),
  wpn_golden: (x, y) => (
    <g>
      <rect x={x - 2} y={y - 4} width={4} height={14} rx={1} fill="#5b3322" />
      <path d={`M${x - 2.5},${y - 5} L${x + 2.5},${y - 5} L${x + 1},${y - 30} Z`} fill={GOLD} stroke={LINE} strokeWidth={0.8} />
      <rect x={x - 4.5} y={y - 6} width={9} height={2} fill="#b8841f" />
    </g>
  ),
  drop_baton: (x, y) => (
    <g>
      <path d={`M${x},${y + 12} L${x + 6},${y - 40}`} stroke="#141414" strokeWidth={5.5} strokeLinecap="round" />
      <path d={`M${x - 5},${y - 10} L${x + 4},${y - 8}`} stroke="#141414" strokeWidth={3} strokeLinecap="round" />
    </g>
  ),
};

const CHARM: Record<string, (X: Xf, hands: [number, number][]) => ReactNode> = {
  charm_beads: (_X, [[x, y]]) => (
    <g>
      {Array.from({ length: 11 }, (_, i) => {
        const a = (i / 10) * Math.PI;
        return <circle key={i} cx={x - 6 + Math.cos(a) * 6} cy={y + 4 + Math.sin(a) * 12} r={1.5} fill="#2a1a10" />;
      })}
      <path d={`M${x},${y + 16} L${x},${y + 22} M${x - 2},${y + 18} L${x + 2},${y + 18}`} stroke="#2a1a10" strokeWidth={1} />
    </g>
  ),
  charm_ring: (_X, [, [x, y]]) => <circle cx={x - 2} cy={y + 3} r={2.2} fill="none" stroke={GOLD} strokeWidth={1.8} />,
  charm_cross: () => (
    <g>
      <path d="M50,56 Q60,86 70,56" fill="none" stroke={GOLD} strokeWidth={1.6} strokeDasharray="2 1" />
      <path d="M60,76 L60,90 M55.5,80 L64.5,80" stroke={GOLD} strokeWidth={2.8} strokeLinecap="round" />
    </g>
  ),
  drop_keys: (X) => (
    <g stroke="#b8a15a" strokeWidth={1.4} fill="none">
      <circle cx={X(42)} cy={128} r={3.5} />
      <path d={`M${X(40)},131 L${X(38)},142 L${X(35)},142 M${X(38)},138 L${X(35)},138`} />
      <path d={`M${X(44)},131 L${X(46)},141 L${X(49)},141`} />
    </g>
  ),
};

// --- Наколки ----------------------------------------------------------------

const TATTOO: Record<string, (X: Xf) => ReactNode> = {
  // Кот на левом предплечье
  t_cat: (X) => (
    <g transform={`translate(${X(24)} 118)`} fill={INK} opacity={0.85}>
      <circle r={3.4} />
      <path d="M-3.2,-1.5 L-2.8,-5.5 L-0.8,-3 Z M3.2,-1.5 L2.8,-5.5 L0.8,-3 Z" />
      <path d="M-1.4,-0.5 L-0.6,-0.5 M0.6,-0.5 L1.4,-0.5" stroke="#e6b08a" strokeWidth={0.7} />
    </g>
  ),
  // Паутина на левом плече
  t_spider: (X) => (
    <g transform={`translate(${X(32)} 70)`} stroke={INK} strokeWidth={0.6} fill="none" opacity={0.85}>
      {[3, 6, 9].map((r) => <path key={r} d={`M${-r},0 A${r},${r} 0 0 1 ${r},0`} />)}
      {[-60, -30, 0, 30, 60].map((a) => <path key={a} d={`M0,0 L${Math.sin((a * Math.PI) / 180) * 10},${-Math.cos((a * Math.PI) / 180) * 10}`} />)}
      <circle cx={2} cy={-5} r={1.5} fill={INK} />
    </g>
  ),
  // Купола на груди
  t_church: () => (
    <g fill={INK} opacity={0.8}>
      {[-9, 0, 9].map((o, i) => (
        <g key={o} transform={`translate(${60 + o} ${i === 1 ? 92 : 95})`}>
          <path d="M-3.5,0 Q-4,-5 0,-8 Q4,-5 3.5,0 Z" />
          <path d="M0,-8 L0,-12 M-1.5,-10.5 L1.5,-10.5" stroke={INK} strokeWidth={0.8} />
          <rect x={-3} y={0} width={6} height={6} opacity={0.7} />
        </g>
      ))}
    </g>
  ),
  // Восьмиконечные звёзды под ключицами
  t_stars: (X) => (
    <g fill={INK} opacity={0.85}>
      {[X(43), X(77)].map((x) => (
        <path key={x} transform={`translate(${x} 70)`} d="M0,-5 L1.2,-1.2 L5,0 L1.2,1.2 L0,5 L-1.2,1.2 L-5,0 L-1.2,-1.2 Z M-3.5,-3.5 L0,-1 L3.5,-3.5 L1,0 L3.5,3.5 L0,1 L-3.5,3.5 L-1,0 Z" />
      ))}
    </g>
  ),
  // Роза за колючкой на правом предплечье
  t_rose: (X) => (
    <g transform={`translate(${X(96)} 118)`} opacity={0.85}>
      <circle r={3.2} fill={INK} />
      <path d="M-1.5,-0.5 Q0,-2 1.5,-0.5 Q0,1.5 -1.5,-0.5" stroke="#e6b08a" strokeWidth={0.5} fill="none" />
      <path d="M0,3 L0,9" stroke={INK} strokeWidth={0.9} />
      <path d="M-5,6 L5,6" stroke={INK} strokeWidth={0.6} strokeDasharray="1 1" />
    </g>
  ),
  // Тигр на правом плече
  t_tiger: (X) => (
    <g transform={`translate(${X(89)} 76)`} opacity={0.85}>
      <circle r={5} fill="#d98a2b" opacity={0.75} />
      <path d="M-3,-3 L-1,-1 M3,-3 L1,-1 M-4,1 L-2,1 M4,1 L2,1 M-1.5,3 L1.5,3" stroke={INK} strokeWidth={1} />
      <circle cx={-1.8} cy={-0.5} r={0.7} fill={INK} />
      <circle cx={1.8} cy={-0.5} r={0.7} fill={INK} />
    </g>
  ),
  // Орёл на животе
  t_eagle: () => (
    <g transform="translate(60 108)" fill={INK} opacity={0.8}>
      <path d="M0,-2 L-14,-8 L-10,-2 L-15,0 L-8,2 L-3,4 L0,8 L3,4 L8,2 L15,0 L10,-2 L14,-8 Z" />
      <path d="M-3,-6 L-2,-10 L0,-7 L2,-10 L3,-6 Z" fill="#b8841f" />
    </g>
  ),
};

/** Внешность боссов — тем же конструктором. */
export const BOSS_LOOKS: Record<string, { look: Look; build: number }> = {
  b_rat: { look: { equipped: { body: 'npc_rags', legs: 'legs_pants', feet: 'feet_slippers', weapon: 'wpn_spoon' }, tattoos: ['t_cat'], str: 1 }, build: 0.85 },
  b_guard: { look: { equipped: { body: 'npc_uniform', head: 'npc_guard_cap', legs: 'npc_pants', feet: 'feet_kirza', weapon: 'drop_baton' }, tattoos: [], str: 12 }, build: 1 },
  b_chief: { look: { equipped: { body: 'npc_uniform', head: 'npc_guard_cap', legs: 'npc_pants', feet: 'feet_kirza', weapon: 'wpn_chain', charm: 'drop_keys' }, tattoos: [], str: 30 }, build: 1.12 },
  b_warden: { look: { equipped: { body: 'drop_coat', head: 'npc_officer_cap', legs: 'npc_pants', feet: 'feet_kirza', weapon: 'drop_baton' }, tattoos: [], str: 20 }, build: 1.1 },
};
