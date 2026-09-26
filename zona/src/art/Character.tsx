// Персонаж в полуреалистичной манере: пропорции ~6,5 голов, объём градиентами,
// мышечный рельеф, детальное лицо со щетиной. Собирается из слоёв:
// тело → наколки → штаны/обувь → верх → оружие → кисти → голова → головной убор.
// Координаты в собственной системе 120×215 (ступни на y≈208). Левая рука
// рисуется один раз и отражается зеркально.

import type { ReactNode } from 'react';
import type { Look } from '../../shared/types.ts';

export type Mood = 'idle' | 'win' | 'hurt';

const LINE = '#24140c';
const SHADE = '#7a4630';
const LIGHT = '#f7d3b3';
const INK = '#263b52';
const GOLD = '#d9a53a';

interface Props {
  look: Look;
  mood?: Mood;
  /** Без верха — видно наколки на груди и руках. */
  bare?: boolean;
  /** Телосложение NPC: худой шнырь, здоровый начкар и т.д. */
  build?: number;
}

/** Мышцы растут с силой, но в разумных пределах. */
function bulkOf(str: number, build = 1): number {
  return Math.max(0.9, Math.min(1.28, 0.92 + (str - 5) * 0.009)) * build;
}

type Xf = (x: number) => number;

/** Зеркальная копия левой половины. */
const Mirror = ({ children }: { children: ReactNode }) => <g transform="translate(120 0) scale(-1 1)">{children}</g>;

export function CharDefs() {
  return (
    <defs>
      <linearGradient id="ch-skin" x1="0" x2="1">
        <stop offset="0" stopColor="#9c6444" />
        <stop offset="0.22" stopColor="#cf946d" />
        <stop offset="0.5" stopColor="#e2ad86" />
        <stop offset="0.8" stopColor="#c88a63" />
        <stop offset="1" stopColor="#8e583a" />
      </linearGradient>
      <radialGradient id="ch-head" cx="0.42" cy="0.4" r="0.72">
        <stop offset="0" stopColor="#ebb993" />
        <stop offset="0.6" stopColor="#d49a73" />
        <stop offset="1" stopColor="#9a5f40" />
      </radialGradient>
      <linearGradient id="ch-cloth" x1="0" x2="1">
        <stop offset="0" stopColor="#000" stopOpacity="0.45" />
        <stop offset="0.3" stopColor="#000" stopOpacity="0.05" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0.1" />
        <stop offset="0.75" stopColor="#000" stopOpacity="0.1" />
        <stop offset="1" stopColor="#000" stopOpacity="0.5" />
      </linearGradient>
      <linearGradient id="ch-cloth-v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.06" />
        <stop offset="1" stopColor="#000" stopOpacity="0.3" />
      </linearGradient>
      <linearGradient id="ch-metal" x1="0" x2="1">
        <stop offset="0" stopColor="#5b6168" />
        <stop offset="0.45" stopColor="#d5dade" />
        <stop offset="1" stopColor="#4a4f55" />
      </linearGradient>
      <linearGradient id="ch-gold" x1="0" x2="1">
        <stop offset="0" stopColor="#8a6212" />
        <stop offset="0.45" stopColor="#f5d57a" />
        <stop offset="1" stopColor="#8a6212" />
      </linearGradient>
      <linearGradient id="ch-boot" x1="0" x2="1">
        <stop offset="0" stopColor="#050505" />
        <stop offset="0.4" stopColor="#3a3a3a" />
        <stop offset="0.55" stopColor="#151515" />
        <stop offset="1" stopColor="#000" />
      </linearGradient>
      <radialGradient id="ch-shadow">
        <stop offset="0" stopColor="#000" stopOpacity="0.55" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <pattern id="ch-stubble" width="1.1" height="1.1" patternUnits="userSpaceOnUse">
        <circle cx="0.3" cy="0.3" r="0.2" fill="#2b1e16" opacity="0.55" />
        <circle cx="0.85" cy="0.8" r="0.16" fill="#2b1e16" opacity="0.45" />
      </pattern>
      <filter id="ch-ink" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="0.12" />
      </filter>
      <filter id="ch-soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="0.6" />
      </filter>
    </defs>
  );
}

export function CharacterG({ look, mood = 'idle', bare = false, build }: Props) {
  const b = bulkOf(look.str, build);
  const X: Xf = (x) => 60 + (x - 60) * b;
  const eq = look.equipped;
  const body = !bare && eq.body ? BODY[eq.body] : undefined;
  const legs = eq.legs ? LEGS[eq.legs] : undefined;
  const hand: [number, number] = [X(28.5), 142];
  const handR: [number, number] = [120 - X(28.5), 142];

  return (
    <g className="char">
      <CharDefs />
      <ellipse cx={60} cy={209} rx={30} ry={4.5} fill="url(#ch-shadow)" />
      <g className="char-breathe">
        {/* Ноги и ступни */}
        <Legs />
        {/* Торс */}
        <Torso X={X} />
        {/* Руки (без кистей) */}
        <Arm X={X} />
        <Mirror>
          <Arm X={X} />
        </Mirror>

        {/* Наколки — на коже, под одеждой */}
        {look.tattoos.map((t) => (
          <g key={t} className="tattoo" filter="url(#ch-ink)" opacity={0.78}>
            {TATTOO[t]?.(X)}
          </g>
        ))}

        {/* Низ */}
        {legs ? <Pants art={legs} /> : <Boxers />}
        {eq.feet && FEET[eq.feet]?.()}

        {/* Верх */}
        {body && <Top art={body} X={X} />}

        {/* Оружие под кистью правой руки, затем кисти */}
        {eq.weapon && WEAPON[eq.weapon]?.(handR[0], handR[1])}
        <Hand X={X} />
        <Mirror>
          <Hand X={X} />
        </Mirror>
        {eq.charm && CHARM[eq.charm]?.(X, hand, handR)}

        {/* Голова чуть крупнее анатомической — так персонаж читается на маленьком экране */}
        <g transform="translate(60 42) scale(1.14) translate(-60 -42)">
          <Head mood={mood} />
          {eq.head && HEAD[eq.head]?.()}
        </g>
      </g>
    </g>
  );
}

/** Персонаж отдельной картинкой. */
export function Character(props: Props & { className?: string; height?: number }) {
  return (
    <svg className={props.className} viewBox="0 -6 120 221" height={props.height} role="img" aria-label="Персонаж">
      <CharacterG {...props} />
    </svg>
  );
}

// --- Тело -------------------------------------------------------------------

function Legs() {
  const leg =
    'M41,108 C39.5,126 39.5,142 41.5,156 C41,164 40,174 41.5,186 C42,191 42.5,195 43,198 L53.5,198 C54,192 55,184 55.5,176 C56,168 56.5,162 56.8,156 C57.8,146 59,134 60,122 Z';
  const foot =
    'M42.8,196.5 C41,200 38.5,203 38,206 C37.8,208.5 41,209.3 46,209 C50,208.8 53.5,208.6 54.4,207.5 C54.8,204.5 54,200.5 53.6,196.5 Z';
  const half = (
    <>
      <path d={leg} fill="url(#ch-skin)" stroke={LINE} strokeWidth={0.8} />
      <path d="M43.5,155.5 Q48,158.5 53.5,155.8 M42,166 C42.5,174 43.5,180 45,186" fill="none" stroke={SHADE} strokeWidth={0.6} opacity={0.6} />
      <path d={foot} fill="url(#ch-skin)" stroke={LINE} strokeWidth={0.8} />
      <path d="M39.5,207 L39.8,205.2 M42,208 L42.2,206 M44.5,208.4 L44.6,206.4" stroke={SHADE} strokeWidth={0.5} />
    </>
  );
  return (
    <g>
      {half}
      <Mirror>{half}</Mirror>
    </g>
  );
}

function Torso({ X }: { X: Xf }) {
  const d = `M${X(54)},38 C${X(49)},42 ${X(44)},43.5 ${X(38)},45.5 C${X(33)},47 ${X(30)},52 ${X(30.5)},58 L${X(37)},70
    C${X(38.5)},80 ${X(40.5)},92 ${X(42)},102 C${X(42.5)},108 ${X(41.5)},113 ${X(42)},118 L60,122 L${X(78)},118
    C${X(78.5)},113 ${X(77.5)},108 ${X(78)},102 C${X(79.5)},92 ${X(81.5)},80 ${X(83)},70 L${X(89.5)},58
    C${X(90)},52 ${X(87)},47 ${X(82)},45.5 C${X(76)},43.5 ${X(71)},42 ${X(66)},38 Z`;
  return (
    <g>
      <path d={d} fill="url(#ch-skin)" stroke={LINE} strokeWidth={0.9} />
      {/* Ключицы, грудь, пресс, косые */}
      <g fill="none" strokeLinecap="round">
        <path d={`M${X(45)},47.5 C${X(50)},49.5 ${X(54)},49 58,47 M${X(75)},47.5 C${X(70)},49.5 ${X(66)},49 62,47`} stroke={SHADE} strokeWidth={0.6} opacity={0.7} />
        <path d={`M${X(45)},48.6 C${X(50)},50.4 ${X(54)},50 57.5,48.3`} stroke={LIGHT} strokeWidth={0.5} opacity={0.5} />
        <path d={`M${X(39.5)},63 C${X(45)},71.5 ${X(53)},72.5 59.5,67.5 M${X(80.5)},63 C${X(75)},71.5 ${X(67)},72.5 60.5,67.5`} stroke={SHADE} strokeWidth={1} opacity={0.75} />
        <path d={`M${X(42)},57 C${X(47)},55 ${X(53)},56 56,59`} stroke={LIGHT} strokeWidth={1} opacity={0.35} />
        <path d="M60,51 L60,67 M60,73 L60,104" stroke={SHADE} strokeWidth={0.6} opacity={0.45} />
        {[80, 88.5, 97].map((y) => (
          <path key={y} d={`M${X(53)},${y} Q56.5,${y + 1.4} 59.4,${y + 0.5} M${X(67)},${y} Q63.5,${y + 1.4} 60.6,${y + 0.5}`} stroke={SHADE} strokeWidth={0.55} opacity={0.4} />
        ))}
        <path d={`M${X(43)},82 C${X(46)},93 ${X(49)},102 ${X(51)},114 M${X(77)},82 C${X(74)},93 ${X(71)},102 ${X(69)},114`} stroke={SHADE} strokeWidth={0.7} opacity={0.45} />
      </g>
      <ellipse cx={60} cy={106} rx={0.9} ry={1.3} fill={SHADE} opacity={0.8} />
    </g>
  );
}

function armPath(X: Xf) {
  return `M${X(44)},45 C${X(36)},45 ${X(30)},49 ${X(29)},58 C${X(28)},66 ${X(27)},76 ${X(27.5)},86 C${X(27.8)},92 ${X(26.5)},96 ${X(26)},100
    C${X(25)},108 ${X(24.5)},118 ${X(25.5)},128 L${X(26)},133.5 L${X(31.5)},133.5 C${X(32.5)},124 ${X(34)},112 ${X(34)},104
    C${X(34.2)},98 ${X(34.8)},94 ${X(35.5)},90 C${X(36.5)},82 ${X(37.5)},74 ${X(38)},68 C${X(40)},60 ${X(42)},52 ${X(44)},45 Z`;
}

function Arm({ X }: { X: Xf }) {
  return (
    <g>
      <path d={armPath(X)} fill="url(#ch-skin)" stroke={LINE} strokeWidth={0.9} />
      <g fill="none" strokeLinecap="round">
        {/* дельта, бицепс, локоть, предплечье */}
        <path d={`M${X(29.8)},61 C${X(31.5)},66 ${X(33.5)},68.5 ${X(36.5)},70`} stroke={SHADE} strokeWidth={0.7} opacity={0.6} />
        <path d={`M${X(35)},75 C${X(34)},81 ${X(34.2)},86 ${X(35)},90`} stroke={SHADE} strokeWidth={0.6} opacity={0.55} />
        <path d={`M${X(31)},56 C${X(30)},64 ${X(30)},72 ${X(30.4)},82`} stroke={LIGHT} strokeWidth={1.1} opacity={0.35} />
        <path d={`M${X(27)},99 Q${X(29.5)},101 ${X(31.5)},99.5`} stroke={SHADE} strokeWidth={0.5} opacity={0.6} />
        <path d={`M${X(27.2)},104 C${X(29)},110 ${X(30)},116 ${X(30)},124`} stroke={SHADE} strokeWidth={0.55} opacity={0.5} />
        <path d={`M${X(28.6)},106 C${X(29.8)},112 ${X(30.6)},118 ${X(31)},126`} stroke="#8a5236" strokeWidth={0.3} opacity={0.5} />
      </g>
    </g>
  );
}

function Hand({ X }: { X: Xf }) {
  const x0 = X(28.5);
  const t = (dx: number, y: number) => `${x0 + dx},${y}`;
  return (
    <g>
      <path
        d={`M${t(-2.8, 132.5)} C${t(-4.6, 136)} ${t(-5.4, 141)} ${t(-5, 146)} C${t(-4.6, 150)} ${t(-2.6, 152.5)} ${t(0, 152.5)} C${t(2.8, 152.5)} ${t(4.6, 150)} ${t(4.8, 146)} C${t(4.9, 141)} ${t(4.3, 136)} ${t(3.3, 132.5)} Z`}
        fill="url(#ch-skin)"
        stroke={LINE}
        strokeWidth={0.8}
      />
      <path d={`M${t(-4.3, 145)} Q${t(0, 146.6)} ${t(4.4, 145)} M${t(-4, 148.5)} Q${t(0, 150)} ${t(4.1, 148.4)}`} fill="none" stroke={SHADE} strokeWidth={0.45} opacity={0.8} />
      <path d={`M${t(3.3, 136)} C${t(5.3, 138)} ${t(5.7, 141)} ${t(4.3, 143.5)}`} fill="none" stroke={SHADE} strokeWidth={0.55} />
      <path d={`M${t(-3.5, 137)} C${t(-4.1, 140)} ${t(-4.2, 142)} ${t(-3.9, 144)}`} fill="none" stroke={LIGHT} strokeWidth={0.6} opacity={0.4} />
    </g>
  );
}

function Head({ mood }: { mood: Mood }) {
  const head =
    'M60,4.5 C66.8,4.5 71.2,9.5 71.2,17 C71.2,21 70.8,24.5 70,27.5 C69.2,31 67.4,34.3 64.6,36.4 C63.2,37.4 61.6,38 60,38 C58.4,38 56.8,37.4 55.4,36.4 C52.6,34.3 50.8,31 50,27.5 C49.2,24.5 48.8,21 48.8,17 C48.8,9.5 53.2,4.5 60,4.5 Z';
  const ear = (
    <>
      <path d="M49.3,17.5 C47.1,16.6 46.2,18.8 46.6,21.5 C47,24.6 48.1,26.4 50.1,26.6 Z" fill="url(#ch-head)" stroke={LINE} strokeWidth={0.7} />
      <path d="M48.9,19.3 C47.8,19.6 47.6,21.8 48.3,23.8" fill="none" stroke={SHADE} strokeWidth={0.5} />
    </>
  );
  const eye = (
    <>
      <path d="M53,21 C54,20 56.3,19.9 57.5,20.9 C56.4,21.8 54.2,21.9 53,21 Z" fill="#e6dccf" />
      <circle cx={55.4} cy={20.9} r={0.95} fill="#3b2a1c" />
      <circle cx={55.4} cy={20.9} r={0.45} fill="#0b0705" />
      <circle cx={55.7} cy={20.6} r={0.22} fill="#fff" />
      <path d="M52.8,20.9 C54,19.6 56.4,19.5 57.7,20.8" fill="none" stroke={LINE} strokeWidth={0.7} strokeLinecap="round" />
      <path d="M53.4,21.7 Q55.3,22.5 57.2,21.6 M53.6,23 Q55.3,23.8 57,23" fill="none" stroke={SHADE} strokeWidth={0.35} opacity={0.6} />
    </>
  );
  const brow = <path d="M52.3,18.4 C53.8,16.9 56,16.6 58.2,17.3 L58.1,18.3 C56.2,17.9 54.2,18.2 52.6,19.2 Z" fill="#35221a" />;
  const fold = <path d="M57,28.6 C56,30 55.6,31.6 56.1,33.2" fill="none" stroke={SHADE} strokeWidth={0.45} opacity={0.5} />;
  return (
    <g>
      {/* Шея */}
      <path d="M54.2,29 C54.6,35 54.3,39 53.2,42.5 L66.8,42.5 C65.7,39 65.4,35 65.8,29 Z" fill="url(#ch-skin)" stroke={LINE} strokeWidth={0.8} />
      <path d="M55.5,38 C57,41 63,41 64.5,38 L65,41.5 C62.5,43 57.5,43 55,41.5 Z" fill="#000" opacity={0.18} />
      <path d="M56.2,36 L58,42 M63.8,36 L62,42" stroke={SHADE} strokeWidth={0.45} opacity={0.5} />
      {ear}
      <Mirror>{ear}</Mirror>
      <path d={head} fill="url(#ch-head)" stroke={LINE} strokeWidth={0.9} />
      {/* Бритая голова, тень на скуле, щетина */}
      <path d="M49.2,17 C49,9.5 53.5,4.6 60,4.6 C66.5,4.6 71,9.5 70.8,17 C69,13 65,10.5 60,10.5 C55,10.5 51,13 49.2,17 Z" fill="url(#ch-stubble)" opacity={0.7} />
      <path d="M49.2,17 C49,9.5 53.5,4.6 60,4.6 C66.5,4.6 71,9.5 70.8,17 C69,13 65,10.5 60,10.5 C55,10.5 51,13 49.2,17 Z" fill="#5a4636" opacity={0.18} />
      <ellipse cx={56} cy={9} rx={4} ry={2} fill="#fff" opacity={0.14} />
      <path d="M67.2,19 C69.6,25 68.8,32 64.6,36.4 C66.4,31 67.4,25.5 66.4,19 Z" fill="#000" opacity={0.16} />
      <path d="M50.3,26.5 C51.5,32 55,37.6 60,38 C65,37.6 68.5,32 69.7,26.5 C68,28.8 66,29.8 64,30.3 C62.5,33.6 57.5,33.6 56,30.3 C54,29.8 52,28.8 50.3,26.5 Z" fill="url(#ch-stubble)" />
      <path d="M56.5,29.6 C58,29 62,29 63.5,29.6 L63,31 C61.5,30.6 58.5,30.6 57,31 Z" fill="url(#ch-stubble)" />
      <path d="M53,24.5 C54.5,25.5 55.5,25.5 56.5,25 M67,24.5 C65.5,25.5 64.5,25.5 63.5,25" fill="none" stroke={SHADE} strokeWidth={0.4} opacity={0.4} />

      <g className="char-eyes">
        {eye}
        <Mirror>{eye}</Mirror>
      </g>
      {brow}
      <Mirror>{brow}</Mirror>
      <path d="M59.3,17.5 L59.6,19.3 M60.7,17.5 L60.4,19.3" stroke={SHADE} strokeWidth={0.4} opacity={0.6} />

      {/* Нос */}
      <path d="M58.9,21 C58.7,23.5 58.3,25.5 57.7,27.2" fill="none" stroke={SHADE} strokeWidth={0.5} opacity={0.6} />
      <path d="M57.3,27.3 C57.8,28.6 59,28.8 60,28.4 C61,28.8 62.2,28.6 62.7,27.3" fill="none" stroke="#6a3a24" strokeWidth={0.6} />
      <path d="M57.6,26.5 Q56.8,27.5 57.4,28.3 M62.4,26.5 Q63.2,27.5 62.6,28.3" fill="none" stroke={SHADE} strokeWidth={0.4} />
      <ellipse cx={60.3} cy={26.4} rx={0.8} ry={0.6} fill="#fff" opacity={0.22} />
      {fold}
      <Mirror>{fold}</Mirror>

      {/* Рот */}
      {mood === 'win' ? (
        <path d="M56.8,31.3 C58.5,33.8 61.5,33.8 63.2,31.3 C61.5,32 58.5,32 56.8,31.3 Z" fill="#efe5d4" stroke="#5a2e20" strokeWidth={0.5} />
      ) : (
        <>
          <path d={mood === 'hurt' ? 'M57.2,32 C58.5,31.2 61.5,31.2 62.8,32' : 'M57.2,31.6 C58.5,31.2 61.5,31.2 62.8,31.6'} fill="none" stroke="#5a2e20" strokeWidth={0.7} strokeLinecap="round" />
          <path d="M58.2,32.7 C59.4,33.3 60.6,33.3 61.8,32.7" fill="none" stroke={SHADE} strokeWidth={0.5} opacity={0.55} />
        </>
      )}
      <path d="M59.5,29 L59.6,30.8 M60.5,29 L60.4,30.8 M58.5,35.3 Q60,36 61.5,35.3" fill="none" stroke={SHADE} strokeWidth={0.35} opacity={0.4} />

      {mood === 'hurt' && (
        <>
          <ellipse cx={55.3} cy={21.3} rx={3.4} ry={2.8} fill="#4e2552" opacity={0.5} filter="url(#ch-soft)" />
          <path d="M63.8,16.2 L66.6,18.2" stroke="#8e1b1b" strokeWidth={0.7} strokeLinecap="round" />
          <path d="M65.5,17.6 C65.6,19 65.4,20 65.2,20.8" stroke="#8e1b1b" strokeWidth={0.4} opacity={0.8} />
          <path d="M61.3,32.6 C61.5,33.8 61.3,34.6 61,35.2" stroke="#8e1b1b" strokeWidth={0.4} />
          <g transform="rotate(-20 55 11)">
            <rect x={51.5} y={9.8} width={7} height={2.4} rx={0.4} fill="#e1c9a0" stroke="#a88a5c" strokeWidth={0.3} />
          </g>
        </>
      )}
    </g>
  );
}

// --- Низ --------------------------------------------------------------------

interface LegsArt {
  color: string;
  detail?: () => ReactNode;
}

const PANTS =
  'M40.5,106 L79.5,106 C80.5,118 80,134 78.5,150 C78,164 78.8,180 78.5,198 L65,198 C64.8,184 64,168 63,156 C62,146 61,134 60,126 C59,134 58,146 57,156 C56,168 55.2,184 55,198 L41.5,198 C41.2,180 42,164 41.5,150 C40,134 39.5,118 40.5,106 Z';

function Pants({ art }: { art: LegsArt }) {
  return (
    <g>
      <path d={PANTS} fill={art.color} stroke={LINE} strokeWidth={0.9} />
      <path d={PANTS} fill="url(#ch-cloth)" />
      <g fill="none" stroke="#000" strokeWidth={0.6} opacity={0.35}>
        <path d="M40.8,111 L79.2,111 M60,111 L60,124" />
        <path d="M48.5,126 L48.2,196 M71.5,126 L71.8,196" opacity={0.5} />
        <path d="M43,152 Q47,156 53,153 M44,158 Q49,161 55,158 M77,152 Q73,156 67,153 M76,158 Q71,161 65,158" />
        <path d="M42,192 Q48,190 55,193 M78,192 Q72,190 65,193" />
      </g>
      <path d="M51,114 C50,130 50.5,150 51,170" stroke="#fff" strokeWidth={0.8} opacity={0.08} fill="none" />
      {art.detail?.()}
    </g>
  );
}

function Boxers() {
  const d = 'M40.5,106 L79.5,106 C80.5,118 81.5,128 82,140 L63.5,142 C62.5,136 61.5,130 60,126 C58.5,130 57.5,136 56.5,142 L38,140 C38.5,128 39.5,118 40.5,106 Z';
  return (
    <g>
      <path d={d} fill="#2a4a86" stroke={LINE} strokeWidth={0.9} />
      <path d={d} fill="url(#ch-cloth)" />
      <path d="M40.5,106 L79.5,106 L79.7,110 L40.3,110 Z" fill="#1c3260" />
      <path d="M45,114 Q47,126 44,138 M75,114 Q73,126 76,138 M60,112 L60,125" fill="none" stroke="#000" strokeWidth={0.5} opacity={0.3} />
    </g>
  );
}

const LEGS: Record<string, LegsArt> = {
  legs_pants: { color: '#363d4a' },
  legs_cargo: {
    color: '#555338',
    detail: () => (
      <g stroke={LINE} strokeWidth={0.5}>
        <path d="M40.8,142 L48,142 L48.2,156 L41.2,156 Z M79.2,142 L72,142 L71.8,156 L78.8,156 Z" fill="#48462e" />
        <path d="M40.8,145 L48,145 M79.2,145 L72,145" />
      </g>
    ),
  },
  legs_jeans: {
    color: '#5e7ea8',
    detail: () => (
      <g fill="#c7d6ea" opacity={0.5} filter="url(#ch-soft)">
        <ellipse cx={47} cy={132} rx={4} ry={7} />
        <ellipse cx={73} cy={140} rx={4} ry={8} />
        <ellipse cx={48} cy={165} rx={3.5} ry={6} />
        <ellipse cx={72} cy={172} rx={3} ry={6} />
      </g>
    ),
  },
  npc_pants: {
    color: '#48533a',
    detail: () => <path d="M41.5,112 L42.2,197 M78.5,112 L77.8,197" stroke="#7d1f1c" strokeWidth={1} />,
  },
};

const FEET: Record<string, () => ReactNode> = {
  feet_slippers: () => {
    const half = (
      <>
        <path d="M37,207.6 C37,210.4 42,210.9 47,210.7 C51.5,210.5 55.2,210.2 55.4,208.2 L54.8,207.4 C51,208.6 42,209.4 37.2,207 Z" fill="#141c30" />
        <path d="M40.5,201.2 C44,199 50,199 54,201 L54.3,203.8 C50,202 44,202 40.2,203.8 Z" fill="#284a8a" stroke={LINE} strokeWidth={0.5} />
      </>
    );
    return (
      <g>
        {half}
        <Mirror>{half}</Mirror>
      </g>
    );
  },
  feet_kirza: () => {
    const boot = 'M41.3,168 L55.8,168 C56,180 55.7,191 55.5,199 C55.6,203 55.9,206 55.6,210 L36.8,210 C36.4,206.5 38.5,203 41.6,201 C41.4,190 41.1,179 41.3,168 Z';
    const half = (
      <>
        <path d={boot} fill="url(#ch-boot)" stroke="#000" strokeWidth={0.7} />
        <path d="M41.3,168 L55.8,168 L55.8,170.5 L41.3,170.5 Z" fill="#222" />
        <path d="M44,172 C43.8,182 44,192 43.6,200" stroke="#fff" strokeWidth={0.7} opacity={0.18} fill="none" />
        <path d="M36.8,208.4 L55.6,208.4" stroke="#444" strokeWidth={0.6} />
        <path d="M42,188 Q48,190 55,188 M42,195 Q48,197 55,195" stroke="#000" strokeWidth={0.6} opacity={0.6} fill="none" />
      </>
    );
    return (
      <g>
        {half}
        <Mirror>{half}</Mirror>
      </g>
    );
  },
  feet_sneakers: () => {
    const shoe = 'M41.6,195.5 L54.2,195.5 C55,199.5 55.4,204 55.2,208.6 C50,210.6 40,210.6 36.8,209 C36.4,205.5 38.4,202 41.6,199.8 Z';
    const half = (
      <>
        <path d={shoe} fill="#ecebe6" stroke={LINE} strokeWidth={0.7} />
        <path d={shoe} fill="url(#ch-cloth)" opacity={0.6} />
        <path d="M36.8,207.2 C40,208.8 50,208.8 55.2,207.2 L55.2,208.6 C50,210.6 40,210.6 36.8,209 Z" fill="#b8352a" />
        <path d="M44,198.5 L49,205 M46,197.5 L51,204 M48,196.8 L53,203" stroke="#1d3f86" strokeWidth={0.9} />
        <path d="M42,199.5 L47,197.8" stroke="#777" strokeWidth={0.4} />
      </>
    );
    return (
      <g>
        {half}
        <Mirror>{half}</Mirror>
      </g>
    );
  },
};

// --- Верх -------------------------------------------------------------------

interface BodyArt {
  color: string;
  sleeves: 'none' | 'short' | 'long';
  long?: boolean; // шинель ниже колен
  collar?: boolean; // стойка-воротник вместо выреза
  detail?: (X: Xf) => ReactNode;
  sleeveDetail?: (X: Xf) => ReactNode;
}

function topPath(X: Xf, long?: boolean) {
  const bottom = long
    ? `C${X(38.5)},130 ${X(36)},155 ${X(35)},174 L${X(85)},174 C${X(84)},155 ${X(81.5)},130 ${X(80.5)},108`
    : `L${X(39.5)},126 L${X(80.5)},126 L${X(80.5)},108`;
  return `M${X(53)},37.5 C${X(48)},41 ${X(43)},42.5 ${X(37)},44.2 C${X(31.5)},45.8 ${X(28.5)},51 ${X(29)},58 L${X(35.5)},70
    C${X(37)},82 ${X(38.5)},96 ${X(39.5)},108 ${bottom} C${X(81.5)},96 ${X(83)},82 ${X(84.5)},70 L${X(91)},58
    C${X(91.5)},51 ${X(88.5)},45.8 ${X(83)},44.2 C${X(77)},42.5 ${X(72)},41 ${X(67)},37.5 Z`;
}

function sleevePath(X: Xf, kind: 'short' | 'long') {
  if (kind === 'short') {
    return `M${X(44)},43.5 C${X(35)},43.5 ${X(28.3)},48 ${X(27.2)},58 C${X(26.6)},63 ${X(26.3)},68 ${X(26.3)},73 L${X(38.8)},73 C${X(39.3)},70 ${X(39.5)},69 ${X(39.8)},68 Z`;
  }
  return `M${X(44)},43.5 C${X(35)},43.5 ${X(28.3)},48 ${X(27.2)},58 C${X(26)},66 ${X(25.4)},76 ${X(25.8)},86 C${X(26)},92 ${X(24.8)},96 ${X(24.3)},100
    C${X(23.3)},108 ${X(22.8)},118 ${X(23.8)},129 L${X(33.6)},129 C${X(34.4)},120 ${X(35.8)},110 ${X(35.9)},104 C${X(36)},98 ${X(36.6)},94 ${X(37.3)},90
    C${X(38.3)},82 ${X(39.3)},74 ${X(39.8)},68 Z`;
}

function Top({ art, X }: { art: BodyArt; X: Xf }) {
  const torso = topPath(X, art.long);
  const sleeve =
    art.sleeves === 'none' ? null : (
      <g>
        <path d={sleevePath(X, art.sleeves)} fill={art.color} stroke={LINE} strokeWidth={0.9} />
        <path d={sleevePath(X, art.sleeves)} fill="url(#ch-cloth)" />
        {art.sleeves === 'long' && (
          <g fill="none" stroke="#000" strokeWidth={0.55} opacity={0.4}>
            <path d={`M${X(24)},125.5 L${X(33.8)},125.5`} />
            <path d={`M${X(27)},96 Q${X(31)},98 ${X(36)},95 M${X(26.5)},101 Q${X(30.5)},103.5 ${X(35.5)},100.5 M${X(28)},72 Q${X(33)},74 ${X(38.5)},71`} />
          </g>
        )}
        {art.sleeveDetail?.(X)}
      </g>
    );
  return (
    <g>
      <path d={torso} fill={art.color} stroke={LINE} strokeWidth={0.9} />
      <path d={torso} fill="url(#ch-cloth)" />
      <path d={torso} fill="url(#ch-cloth-v)" />
      {/* складки ткани */}
      <g fill="none" stroke="#000" strokeWidth={0.55} opacity={0.3}>
        <path d={`M${X(40)},100 C${X(45)},104 ${X(50)},105 ${X(54)},103 M${X(80)},100 C${X(75)},104 ${X(70)},105 ${X(66)},103`} />
        <path d={`M${X(38.5)},72 C${X(42)},76 ${X(45)},82 ${X(46)},88 M${X(81.5)},72 C${X(78)},76 ${X(75)},82 ${X(74)},88`} />
      </g>
      {art.collar ? (
        <path d="M53.5,37 C55,41.5 65,41.5 66.5,37 L67.5,43 C64,46 56,46 52.5,43 Z" fill={art.color} stroke={LINE} strokeWidth={0.7} />
      ) : (
        <path d="M54,38 L60,52 L66,38 C64,40 56,40 54,38 Z" fill="url(#ch-skin)" stroke={LINE} strokeWidth={0.6} />
      )}
      {art.detail?.(X)}
      {sleeve}
      {sleeve && <Mirror>{sleeve}</Mirror>}
    </g>
  );
}

const epaulettes = (X: Xf, color: string) => (
  <g stroke={LINE} strokeWidth={0.5}>
    <path d={`M${X(33)},47 L${X(44)},44.5 L${X(44.6)},47.4 L${X(33.6)},50.2 Z`} fill={color} />
    <path d={`M${X(87)},47 L${X(76)},44.5 L${X(75.4)},47.4 L${X(86.4)},50.2 Z`} fill={color} />
    <circle cx={X(42)} cy={46.4} r={0.8} fill={GOLD} />
    <circle cx={X(78)} cy={46.4} r={0.8} fill={GOLD} />
  </g>
);

const buttons = (ys: number[], x = 60, color = '#15181e') => ys.map((y) => <circle key={y} cx={x} cy={y} r={0.9} fill={color} stroke="#000" strokeWidth={0.2} />);

const BODY: Record<string, BodyArt> = {
  body_robe: {
    color: '#29313f',
    sleeves: 'long',
    detail: (X) => (
      <>
        <path d="M60,52 L60,126" stroke="#000" strokeWidth={0.6} opacity={0.5} />
        {buttons([58, 72, 86, 100, 114])}
        <rect x={X(64)} y={60} width={11} height={6} fill="#dcd6c6" stroke={LINE} strokeWidth={0.4} />
        <path d={`M${X(64) + 1.2},62 L${X(64) + 9.5},62 M${X(64) + 1.2},64 L${X(64) + 7},64`} stroke="#555" strokeWidth={0.5} />
        <path d={`M${X(44)},90 L${X(53)},90 L${X(53)},98 L${X(44)},98`} fill="none" stroke="#000" strokeWidth={0.5} opacity={0.4} />
      </>
    ),
  },
  body_quilted: {
    color: '#202327',
    sleeves: 'long',
    collar: true,
    detail: (X) => (
      <>
        {[54, 62, 70, 78, 86, 94, 102, 110, 118].map((y) => (
          <path key={y} d={`M${X(37)},${y} Q60,${y + 1.5} ${X(83)},${y}`} stroke="#43474e" strokeWidth={0.6} fill="none" />
        ))}
        <path d="M60,44 L60,126" stroke="#000" strokeWidth={0.9} />
        {buttons([56, 70, 84, 98, 112], 61.8, '#0a0a0a')}
      </>
    ),
    sleeveDetail: (X) => (
      <g stroke="#43474e" strokeWidth={0.55} fill="none">
        {[62, 72, 82, 92, 102, 112, 121].map((y) => (
          <path key={y} d={`M${X(26)},${y} Q${X(31)},${y + 1.4} ${X(37.5)},${y - 0.5}`} />
        ))}
      </g>
    ),
  },
  body_leather: {
    color: '#442619',
    sleeves: 'long',
    detail: (X) => (
      <>
        <path d={`M53.5,38 L${X(41)},60 L55,66 L60,52 Z M66.5,38 L${X(79)},60 L65,66 L60,52 Z`} fill="#55311f" stroke={LINE} strokeWidth={0.6} />
        <path d="M60,52 L60,126" stroke="#b9b9b9" strokeWidth={0.8} strokeDasharray="0.8 0.6" />
        <path d={`M${X(38)},62 C${X(40)},80 ${X(41)},96 ${X(42)},110`} stroke="#fff" strokeWidth={1.4} opacity={0.12} fill="none" />
        <path d={`M${X(56)},70 C${X(57)},85 ${X(57)},100 ${X(57)},118`} stroke="#fff" strokeWidth={0.9} opacity={0.1} fill="none" />
        <path d={`M${X(42)},102 L${X(52)},104 M${X(78)},102 L${X(68)},104`} stroke="#1a0c06" strokeWidth={0.9} />
      </>
    ),
    sleeveDetail: (X) => <path d={`M${X(30)},58 C${X(29)},76 ${X(28)},96 ${X(27)},122`} stroke="#fff" strokeWidth={1.2} opacity={0.12} fill="none" />,
  },
  body_tracksuit: {
    color: '#1b4495',
    sleeves: 'long',
    collar: true,
    detail: () => (
      <>
        <path d="M60,44 L60,126" stroke="#e8e8e8" strokeWidth={0.8} />
        <path d="M53.5,37 C55,41.5 65,41.5 66.5,37" stroke="#fff" strokeWidth={0.9} fill="none" />
        <path d="M60.9,46 L62.4,46 L62.4,50 L60.9,50 Z" fill="#ddd" />
      </>
    ),
    sleeveDetail: (X) => (
      <g fill="none" stroke="#f2f2f2" strokeWidth={0.75}>
        {[0.8, 2.2, 3.6].map((o) => (
          <path key={o} d={`M${X(29 + o * 0.3)},${50 + o} C${X(27.5 + o)},64 ${X(26.6 + o)},78 ${X(27 + o)},88 C${X(27.2 + o)},96 ${X(25.6 + o)},104 ${X(25 + o)},112 C${X(24.5 + o)},118 ${X(24.8 + o)},122 ${X(25 + o)},125`} />
        ))}
      </g>
    ),
  },
  drop_coat: {
    color: '#565b4c',
    sleeves: 'long',
    long: true,
    collar: true,
    detail: (X) => (
      <>
        {epaulettes(X, '#6b7058')}
        <path d="M60,44 L60,174" stroke="#000" strokeWidth={0.8} opacity={0.5} />
        {[58, 72, 86, 100].map((y) => (
          <g key={y}>
            <circle cx={55} cy={y} r={1.1} fill="url(#ch-gold)" stroke={LINE} strokeWidth={0.2} />
            <circle cx={65} cy={y} r={1.1} fill="url(#ch-gold)" stroke={LINE} strokeWidth={0.2} />
          </g>
        ))}
        <path d={`M${X(39.5)},112 L${X(80.5)},112 L${X(80.6)},117 L${X(39.4)},117 Z`} fill="#3a2a1a" stroke={LINE} strokeWidth={0.5} />
        <rect x={57.5} y={111.5} width={5} height={6} fill="none" stroke="url(#ch-gold)" strokeWidth={0.9} />
        <path d={`M${X(44)},130 C${X(43)},148 ${X(42)},160 ${X(41)},172 M${X(76)},130 C${X(77)},148 ${X(78)},160 ${X(79)},172`} stroke="#000" strokeWidth={0.6} opacity={0.35} fill="none" />
      </>
    ),
  },
  npc_uniform: {
    color: '#4b573a',
    sleeves: 'long',
    collar: true,
    detail: (X) => (
      <>
        {epaulettes(X, '#7a2420')}
        <path d="M60,44 L60,126" stroke="#000" strokeWidth={0.6} opacity={0.5} />
        {buttons([54, 66, 78, 90, 102], 60, '#b58a2c')}
        <path d={`M${X(42)},60 L${X(52)},60 L${X(52)},70 L${X(42)},70 Z M${X(68)},60 L${X(78)},60 L${X(78)},70 L${X(68)},70 Z`} fill="none" stroke="#2f3822" strokeWidth={0.6} />
        <path d={`M${X(42)},60 L${X(52)},60 L${X(51)},63 L${X(43)},63 Z M${X(68)},60 L${X(78)},60 L${X(77)},63 L${X(69)},63 Z`} fill="#3f4a30" />
        <path d={`M${X(39.2)},110 L${X(80.8)},110 L${X(80.8)},115 L${X(39.2)},115 Z`} fill="#2a1d12" stroke={LINE} strokeWidth={0.5} />
        <rect x={57.2} y={109.6} width={5.6} height={5.8} rx={0.6} fill="url(#ch-gold)" stroke={LINE} strokeWidth={0.3} />
      </>
    ),
  },
  npc_rags: {
    color: '#6b6454',
    sleeves: 'none',
    detail: (X) => (
      <>
        <ellipse cx={X(47)} cy={92} rx={3} ry={2.2} fill="url(#ch-skin)" stroke={LINE} strokeWidth={0.4} />
        <rect x={X(66)} y={76} width={7} height={6} fill="#57503f" stroke={LINE} strokeWidth={0.4} transform={`rotate(-8 ${X(69)} 79)`} />
        <path d={`M${X(39.5)},126 L${X(44)},119 L${X(48)},127 L${X(54)},120 L${X(60)},128 L${X(66)},120 L${X(72)},127 L${X(76)},119 L${X(80.5)},126 Z`} fill="#0e0b08" opacity={0.25} />
        <path d="M52,74 L55,86 M66,94 L68,104" stroke="#000" strokeWidth={0.5} opacity={0.3} />
      </>
    ),
  },
};

// --- Головные уборы ------------------------------------------------------------

const HEAD: Record<string, () => ReactNode> = {
  cap_knit: () => (
    <g>
      <path d="M48.3,17 C47.9,8.5 53,2.8 60,2.8 C67,2.8 72.1,8.5 71.7,17 Z" fill="#3d4450" stroke={LINE} strokeWidth={0.8} />
      <path d="M48.3,17 C47.9,8.5 53,2.8 60,2.8 C67,2.8 72.1,8.5 71.7,17 Z" fill="url(#ch-cloth)" />
      {[52, 55, 58, 61, 64, 67].map((x) => <path key={x} d={`M${x},${x < 60 ? 5 : 4.5} L${x + (x - 60) * 0.25},13.5`} stroke="#000" strokeWidth={0.4} opacity={0.3} />)}
      <path d="M47.8,13 C52,15 68,15 72.2,13 L72.4,18.2 C68,20 52,20 47.6,18.2 Z" fill="#323843" stroke={LINE} strokeWidth={0.6} />
      {[49, 51.5, 54, 56.5, 59, 61.5, 64, 66.5, 69, 71].map((x) => <path key={x} d={`M${x},14 L${x},19`} stroke="#000" strokeWidth={0.35} opacity={0.35} />)}
    </g>
  ),
  cap_ushanka: () => (
    <g>
      <path d="M46.4,13.5 C44.8,20 45,26.5 46.8,30.5 C48.4,31.6 50,31 50.7,29.4 L50.5,15.5 Z" fill="#5a4430" stroke={LINE} strokeWidth={0.6} />
      <path d="M73.6,13.5 C75.2,20 75,26.5 73.2,30.5 C71.6,31.6 70,31 69.3,29.4 L69.5,15.5 Z" fill="#5a4430" stroke={LINE} strokeWidth={0.6} />
      <path d="M47.3,14.2 C46.8,5 53,0.8 60,0.8 C67,0.8 73.2,5 72.7,14.2 Z" fill="#3c3f33" stroke={LINE} strokeWidth={0.8} />
      <path d="M47.3,14.2 C46.8,5 53,0.8 60,0.8 C67,0.8 73.2,5 72.7,14.2 Z" fill="url(#ch-cloth)" />
      <path d="M46.6,15.2 C52,12.2 68,12.2 73.4,15.2 L73.2,8.6 C68,6.4 52,6.4 46.8,8.6 Z" fill="#6b5039" stroke={LINE} strokeWidth={0.6} />
      <g stroke="#3b2a1c" strokeWidth={0.4} opacity={0.6}>
        {[48, 50.5, 53, 55.5, 58, 60.5, 63, 65.5, 68, 70.5].map((x) => <path key={x} d={`M${x},8.5 l0.5,4.5`} />)}
      </g>
      <path d="M60,8.3 L60.8,10 L62.6,10.1 L61.2,11.2 L61.7,13 L60,12 L58.3,13 L58.8,11.2 L57.4,10.1 L59.2,10 Z" fill="#a8261f" stroke="#5e0f0b" strokeWidth={0.2} />
    </g>
  ),
  cap_bandana: () => (
    <g>
      <path d="M48.8,15.8 C48.6,7.5 53.4,3.6 60,3.6 C66.6,3.6 71.4,7.5 71.2,15.8 C66,14 54,14 48.8,15.8 Z" fill="#8e2420" stroke={LINE} strokeWidth={0.7} />
      <path d="M48.8,15.8 C48.6,7.5 53.4,3.6 60,3.6 C66.6,3.6 71.4,7.5 71.2,15.8 C66,14 54,14 48.8,15.8 Z" fill="url(#ch-cloth)" />
      {[
        [53, 9],
        [57, 6.5],
        [62, 7],
        [66.5, 9.5],
        [55, 12.5],
        [64, 12.3],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x},${y} q1,-1.4 2,0 q-1,1.4 -2,0`} fill="#e9d6c0" opacity={0.8} />
      ))}
      <path d="M71,13.5 C73.5,12.5 76,11.5 77.5,13 C76,14.8 73.5,15 71.2,15.3 Z M71,15 C73,16.5 74.5,19 74,21.5 C72.5,20.5 71.3,18.5 70.8,16.5 Z" fill="#7a1e1a" stroke={LINE} strokeWidth={0.5} />
    </g>
  ),
  cap_gold: () => (
    <g>
      <path d="M48.5,15 C48.2,6.5 53.5,2.8 60,2.8 C66.5,2.8 71.8,6.5 71.5,15 Z" fill="#c9952d" stroke={LINE} strokeWidth={0.8} />
      <path d="M48.5,15 C48.2,6.5 53.5,2.8 60,2.8 C66.5,2.8 71.8,6.5 71.5,15 Z" fill="url(#ch-cloth)" />
      <path d="M60,2.9 L60,14 M54,4.5 C53,8 52.8,11 53,14.5 M66,4.5 C67,8 67.2,11 67,14.5" stroke="#000" strokeWidth={0.4} opacity={0.3} fill="none" />
      <path d="M48.5,14.2 C54,16.4 66,16.4 71.5,14.2 C70,18.2 66,19.4 60,19.4 C54,19.4 50,18.2 48.5,14.2 Z" fill="#9c7020" stroke={LINE} strokeWidth={0.7} />
      <path d="M50,16.5 C55,18 65,18 70,16.5" stroke="#000" strokeWidth={0.5} opacity={0.3} fill="none" />
      <text x={60} y={11.5} fontSize={2.9} textAnchor="middle" fill="#2a1a08" fontWeight={800} letterSpacing={0.1}>
        ПАХАН
      </text>
    </g>
  ),
  drop_crown: () => (
    <g>
      <path d="M50,11.5 L51.3,1.5 L55,6.6 L60,-0.6 L65,6.6 L68.7,1.5 L70,11.5 C66,12.8 54,12.8 50,11.5 Z" fill="url(#ch-gold)" stroke={LINE} strokeWidth={0.7} />
      <path d="M50.5,9.3 C55,10.5 65,10.5 69.5,9.3" stroke="#7a560f" strokeWidth={0.6} fill="none" />
      <circle cx={60} cy={7} r={1.2} fill="#a01d1d" stroke="#3b0707" strokeWidth={0.2} />
      <circle cx={54.5} cy={9} r={0.8} fill="#1f5fae" />
      <circle cx={65.5} cy={9} r={0.8} fill="#1d8a4a" />
    </g>
  ),
  npc_guard_cap: () => (
    <g>
      <ellipse cx={60} cy={6.5} rx={15} ry={4.4} fill="#46513a" stroke={LINE} strokeWidth={0.7} />
      <path d="M48.3,6.5 L71.7,6.5 L71,12.2 C66,13.7 54,13.7 49,12.2 Z" fill="#6e1f1b" stroke={LINE} strokeWidth={0.6} />
      <path d="M49,11.6 C54,13.9 66,13.9 71,11.6 C69,16 65,17.2 60,17.2 C55,17.2 51,16 49,11.6 Z" fill="#0b0b0b" />
      <path d="M52,14 C56,15.4 64,15.4 68,14" stroke="#fff" strokeWidth={0.5} opacity={0.3} fill="none" />
      <circle cx={60} cy={8.8} r={1.5} fill="url(#ch-gold)" stroke={LINE} strokeWidth={0.2} />
    </g>
  ),
  npc_officer_cap: () => (
    <g>
      <ellipse cx={60} cy={5.8} rx={17} ry={5} fill="#434a3a" stroke={LINE} strokeWidth={0.7} />
      <path d="M47.8,5.8 L72.2,5.8 L71.3,12.4 C66,14 54,14 48.7,12.4 Z" fill="#23281e" stroke={LINE} strokeWidth={0.6} />
      <path d="M48.7,11.8 C54,14.2 66,14.2 71.3,11.8 C69.2,16.4 65,17.6 60,17.6 C55,17.6 50.8,16.4 48.7,11.8 Z" fill="#0b0b0b" />
      <path d="M50.5,11.2 C55,12.2 65,12.2 69.5,11.2" stroke="url(#ch-gold)" strokeWidth={0.9} fill="none" />
      <circle cx={60} cy={7.6} r={2} fill="url(#ch-gold)" stroke={LINE} strokeWidth={0.2} />
      <path d="M56.5,7.6 L54,6.2 M63.5,7.6 L66,6.2" stroke={GOLD} strokeWidth={0.7} />
    </g>
  ),
};

// --- Оружие (в правой руке) и талисманы ------------------------------------------

const WEAPON: Record<string, (x: number, y: number) => ReactNode> = {
  wpn_spoon: (x, y) => (
    <g>
      <path d={`M${x - 0.8},${y - 2} L${x + 0.4},${y - 26} L${x + 1.2},${y - 26} L${x + 0.8},${y - 2} Z`} fill="url(#ch-metal)" stroke={LINE} strokeWidth={0.3} />
      <ellipse cx={x} cy={y + 12} rx={2.6} ry={3.8} fill="url(#ch-metal)" stroke={LINE} strokeWidth={0.4} />
    </g>
  ),
  wpn_rebar: (x, y) => (
    <g>
      <path d={`M${x - 1.8},${y + 20} L${x + 1.4},${y - 52} L${x + 4.4},${y - 52} L${x + 1.4},${y + 20} Z`} fill="#6b4a33" stroke={LINE} strokeWidth={0.4} />
      {Array.from({ length: 17 }, (_, i) => (
        <path key={i} d={`M${x - 1.6 + i * 0.19},${y + 17 - i * 4.2} l3,-1`} stroke="#3e2a1b" strokeWidth={0.6} />
      ))}
      <path d={`M${x + 1},${y + 18} L${x + 3.4},${y - 50}`} stroke="#b0835c" strokeWidth={0.5} opacity={0.6} />
    </g>
  ),
  wpn_knuckles: (x, y) => (
    <g>
      <rect x={x - 5.3} y={y + 1.8} width={10.6} height={3.8} rx={1.4} fill="url(#ch-metal)" stroke={LINE} strokeWidth={0.4} />
      {[-3.7, -1.2, 1.3, 3.8].map((o) => (
        <circle key={o} cx={x + o} cy={y + 3.7} r={1.3} fill="none" stroke="#a8afb6" strokeWidth={0.6} />
      ))}
    </g>
  ),
  wpn_chain: (x, y) => (
    <g fill="none" strokeWidth={0.9}>
      {Array.from({ length: 12 }, (_, i) => (
        <ellipse key={i} cx={x + 1 + Math.sin(i / 2.2) * 2.5} cy={y + 10 + i * 3.6} rx={i % 2 ? 0.8 : 1.7} ry={2.1} stroke={i % 2 ? '#7c838a' : '#b8bec4'} />
      ))}
    </g>
  ),
  wpn_golden: (x, y) => (
    <g>
      <path d={`M${x - 1.6},${y - 6} L${x + 1.6},${y - 6} L${x + 0.3},${y - 32} Z`} fill="url(#ch-gold)" stroke={LINE} strokeWidth={0.4} />
      <path d={`M${x},${y - 7} L${x + 0.2},${y - 28}`} stroke="#7a560f" strokeWidth={0.3} />
      <rect x={x - 3.4} y={y - 7} width={6.8} height={1.6} rx={0.4} fill="url(#ch-gold)" stroke={LINE} strokeWidth={0.3} />
      <rect x={x - 1.4} y={y + 8} width={2.8} height={4} rx={0.8} fill="#3a2215" />
    </g>
  ),
  drop_baton: (x, y) => (
    <g>
      <path d={`M${x - 1.8},${y + 14} L${x + 2.2},${y - 44} L${x + 5.6},${y - 44} L${x + 1.8},${y + 14} Z`} fill="#111" stroke="#000" strokeWidth={0.4} />
      <path d={`M${x + 0.6},${y + 10} L${x + 3.8},${y - 40}`} stroke="#fff" strokeWidth={0.5} opacity={0.2} />
      <path d={`M${x - 5},${y - 8} L${x + 2},${y - 7}`} stroke="#111" strokeWidth={2.2} strokeLinecap="round" />
    </g>
  ),
};

const CHARM: Record<string, (X: Xf, hand: [number, number], handR: [number, number]) => ReactNode> = {
  charm_beads: (_X, [x, y]) => (
    <g>
      {Array.from({ length: 15 }, (_, i) => {
        const a = (i / 14) * Math.PI;
        return <circle key={i} cx={x - 1 + Math.cos(a) * 4} cy={y + 9 + Math.sin(a) * 10} r={0.95} fill="#241208" stroke="#000" strokeWidth={0.15} />;
      })}
      <path d={`M${x - 1},${y + 19} L${x - 1},${y + 24} M${x - 2.6},${y + 20.6} L${x + 0.6},${y + 20.6}`} stroke="#241208" strokeWidth={0.7} />
    </g>
  ),
  charm_ring: (_X, _h, [x, y]) => (
    <g>
      <ellipse cx={x + 1.6} cy={y + 4.3} rx={1.6} ry={0.9} fill="none" stroke="url(#ch-gold)" strokeWidth={1} />
      <rect x={x + 0.6} y={y + 2.6} width={2} height={1.4} fill="#1c1c1c" stroke={GOLD} strokeWidth={0.3} />
    </g>
  ),
  charm_cross: (X) => (
    <g>
      <path d={`M${X(54.5)},40 C55.5,52 58,57 60,59 C62,57 64.5,52 ${X(65.5)},40`} fill="none" stroke="url(#ch-gold)" strokeWidth={0.8} strokeDasharray="1 0.4" />
      <path d="M60,59 L60,69 M57,62.5 L63,62.5" stroke="url(#ch-gold)" strokeWidth={1.8} />
      <path d="M60,59 L60,69 M57,62.5 L63,62.5" stroke="#7a560f" strokeWidth={0.3} />
    </g>
  ),
  drop_keys: (X) => (
    <g fill="none" stroke="#a8914e" strokeWidth={0.8}>
      <circle cx={X(43)} cy={114} r={2.4} />
      <path d={`M${X(41.5)},116 L${X(40)},125 L${X(38.3)},125 M${X(40.5)},122 L${X(38.8)},122`} />
      <path d={`M${X(44.5)},116 L${X(45.5)},124 L${X(47.5)},124`} />
      <path d={`M${X(43)},116.4 L${X(43)},126.5`} stroke="#7d7d7d" />
    </g>
  ),
};

// --- Наколки ------------------------------------------------------------------

const TATTOO: Record<string, (X: Xf) => ReactNode> = {
  // Кот на левом предплечье
  t_cat: (X) => (
    <g transform={`translate(${X(29.6)} 113)`} fill={INK}>
      <path d="M-2.6,1.5 C-2.8,-1 -2.2,-2.6 -1.8,-3.6 L-1,-1.9 C-0.3,-2.1 0.3,-2.1 1,-1.9 L1.8,-3.6 C2.2,-2.6 2.8,-1 2.6,1.5 C2,3.4 -2,3.4 -2.6,1.5 Z" />
      <path d="M-2.2,3 C-2.8,6 -2,9 0,9.5 C2,9 2.8,6 2.2,3 Z" opacity={0.85} />
      <path d="M2,8.6 C3.6,8 4.2,6 3.4,4.4" stroke={INK} strokeWidth={0.5} fill="none" />
      <circle cx={-0.9} cy={-0.2} r={0.35} fill="#e0a882" />
      <circle cx={0.9} cy={-0.2} r={0.35} fill="#e0a882" />
    </g>
  ),
  // Паутина на левом плече
  t_spider: (X) => (
    <g transform={`translate(${X(33.5)} 59)`} stroke={INK} strokeWidth={0.35} fill="none">
      {[2.5, 4.8, 7].map((r) => (
        <path key={r} d={`M${-r},0 Q${-r * 0.7},${-r * 0.55} 0,${-r} Q${r * 0.7},${-r * 0.55} ${r},0`} />
      ))}
      {[-80, -40, 0, 40, 80].map((a) => (
        <path key={a} d={`M0,0 L${Math.sin((a * Math.PI) / 180) * 7.5},${-Math.cos((a * Math.PI) / 180) * 7.5}`} />
      ))}
      <path d="M1.5,-3.2 L1.5,-1.2" />
      <ellipse cx={1.5} cy={-0.6} rx={0.9} ry={1.1} fill={INK} />
    </g>
  ),
  // Купола на груди
  t_church: () => (
    <g transform="translate(60 62)" fill={INK}>
      <path d="M-8,10 L-8,3 L8,3 L8,10 Z" opacity={0.75} />
      <path d="M-6.5,3 L-6.5,6 M-3,3 L-3,6 M3,3 L3,6 M6.5,3 L6.5,6" stroke="#d9a07a" strokeWidth={0.6} />
      {[-5.2, 0, 5.2].map((o, i) => (
        <g key={o} transform={`translate(${o} ${i === 1 ? -2.4 : 0})`}>
          <path d="M-2.2,3 C-2.8,1 -2,-1 0,-2.8 C2,-1 2.8,1 2.2,3 Z" />
          <path d="M0,-2.8 L0,-5.8 M-1.1,-4.8 L1.1,-4.8" stroke={INK} strokeWidth={0.45} />
        </g>
      ))}
    </g>
  ),
  // Восьмиконечные звёзды под ключицами
  t_stars: (X) => (
    <g fill={INK}>
      {[X(47.5), X(72.5)].map((x) => (
        <g key={x} transform={`translate(${x} 54.5)`}>
          <path d="M0,-3.4 L0.8,-0.8 L3.4,0 L0.8,0.8 L0,3.4 L-0.8,0.8 L-3.4,0 L-0.8,-0.8 Z" />
          <path d="M-2.4,-2.4 L0,-0.6 L2.4,-2.4 L0.6,0 L2.4,2.4 L0,0.6 L-2.4,2.4 L-0.6,0 Z" opacity={0.75} />
          <circle r={0.6} fill="#e0a882" />
        </g>
      ))}
    </g>
  ),
  // Роза за колючкой на правом предплечье
  t_rose: (X) => (
    <g transform={`translate(${120 - X(29.6)} 110)`}>
      <path d="M0,-2.8 C2,-2.8 2.8,-0.8 2,0.8 C1,2.4 -1,2.4 -2,0.8 C-2.8,-0.8 -2,-2.8 0,-2.8 Z" fill={INK} />
      <path d="M-1,-1 C0,-2 1.2,-1 0.6,0.2 C0,1 -1.2,0.4 -0.8,-0.6" stroke="#e0a882" strokeWidth={0.35} fill="none" />
      <path d="M0,2.2 C0.3,5 -0.2,8 0.2,11 M0,6 C1.4,5.2 2.2,5.6 2.6,6.4" stroke={INK} strokeWidth={0.5} fill="none" />
      <path d="M-3.5,4.5 L3.5,3.5 M-3.5,8.5 L3.5,7.5" stroke={INK} strokeWidth={0.35} strokeDasharray="0.6 0.5" />
    </g>
  ),
  // Тигр на правом плече
  t_tiger: (X) => (
    <g transform={`translate(${120 - X(32.8)} 61)`}>
      <path d="M-3.8,-1 C-4,-3.4 -2.8,-4.6 -2,-4.2 L-1,-3 C-0.3,-3.3 0.3,-3.3 1,-3 L2,-4.2 C2.8,-4.6 4,-3.4 3.8,-1 C3.8,2.4 2,4.2 0,4.4 C-2,4.2 -3.8,2.4 -3.8,-1 Z" fill={INK} opacity={0.9} />
      <path d="M-2.6,-0.6 L-1.2,0 M2.6,-0.6 L1.2,0 M-1,2.4 L1,2.4 M-3,1.2 L-1.8,1.4 M3,1.2 L1.8,1.4 M0,-2.8 L0,-1.4" stroke="#e0a882" strokeWidth={0.4} />
      <circle cx={-1.4} cy={-0.6} r={0.5} fill="#e8c860" />
      <circle cx={1.4} cy={-0.6} r={0.5} fill="#e8c860" />
    </g>
  ),
  // Орёл с короной на животе
  t_eagle: () => (
    <g transform="translate(60 92)" fill={INK}>
      <path d="M0,-2 C-3,-4 -7,-6 -12,-5 C-9,-3.6 -8,-2.6 -9.5,-1.6 C-7,-1.4 -5,-0.6 -4,0.6 C-2.6,1 -1.4,2 -1,4 L0,6.5 L1,4 C1.4,2 2.6,1 4,0.6 C5,-0.6 7,-1.4 9.5,-1.6 C8,-2.6 9,-3.6 12,-5 C7,-6 3,-4 0,-2 Z" />
      <circle cx={0} cy={-3} r={1.3} />
      <path d="M-1.8,-5 L-1.2,-7.5 L0,-5.8 L1.2,-7.5 L1.8,-5 Z" opacity={0.8} />
    </g>
  ),
};

/** Внешность боссов — тем же конструктором. */
export const BOSS_LOOKS: Record<string, { look: Look; build: number }> = {
  b_rat: { look: { equipped: { body: 'npc_rags', legs: 'legs_pants', feet: 'feet_slippers', weapon: 'wpn_spoon' }, tattoos: ['t_cat'], str: 1 }, build: 0.9 },
  b_guard: { look: { equipped: { body: 'npc_uniform', head: 'npc_guard_cap', legs: 'npc_pants', feet: 'feet_kirza', weapon: 'drop_baton' }, tattoos: [], str: 12 }, build: 1 },
  b_chief: { look: { equipped: { body: 'npc_uniform', head: 'npc_guard_cap', legs: 'npc_pants', feet: 'feet_kirza', weapon: 'wpn_chain', charm: 'drop_keys' }, tattoos: [], str: 30 }, build: 1.1 },
  b_warden: { look: { equipped: { body: 'drop_coat', head: 'npc_officer_cap', legs: 'npc_pants', feet: 'feet_kirza', weapon: 'drop_baton' }, tattoos: [], str: 20 }, build: 1.08 },
};

/** Вещь отдельно от персонажа — для иконок магазина и инвентаря. */
export function ItemOnly({ id, slot }: { id: string; slot: string }) {
  const X: Xf = (x) => x;
  const hx = 60;
  const hy = 120;
  const handAt = (x: number) => (
    <g transform={`translate(${x - X(28.5)} ${hy - 142})`}>
      <Hand X={X} />
    </g>
  );
  let art: ReactNode = null;
  if (slot === 'head') {
    art = (
      <>
        <Head mood="idle" />
        {HEAD[id]?.()}
      </>
    );
  } else if (slot === 'body' && BODY[id]) {
    art = <Top art={BODY[id]} X={X} />;
  } else if (slot === 'legs' && LEGS[id]) {
    art = <Pants art={LEGS[id]} />;
  } else if (slot === 'feet') {
    art = FEET[id]?.();
  } else if (slot === 'weapon') {
    art = (
      <>
        {/* по диагонали, чтобы длинное оружие влезало в квадратную иконку */}
        <g transform={`rotate(40 ${hx} ${hy})`}>{WEAPON[id]?.(hx, hy)}</g>
      </>
    );
  } else if (slot === 'charm') {
    art =
      id === 'charm_beads' ? (
        <>
          {handAt(hx)}
          {CHARM[id](X, [hx, hy], [hx, hy])}
        </>
      ) : id === 'charm_ring' ? (
        <>
          {handAt(hx)}
          {CHARM[id](X, [hx, hy], [hx, hy])}
        </>
      ) : (
        CHARM[id]?.(X, [hx, hy], [hx, hy])
      );
  }
  return (
    <g>
      <CharDefs />
      {art}
    </g>
  );
}
