// Места зоны: баня, столовая, библиотека, клуб, свиданка, промка, ШИЗО. Координаты 360×280, пол с y=236.
import type { ReactNode } from 'react';
import type { PlaceId } from '../../shared/places.ts';
import { FLOOR, Scene } from './Scenes.tsx';

const W = 360;
const H = 280;

const Grime = ({ o = 0.35 }: { o?: number }) => (
  <>
    <rect width={W} height={FLOOR} filter="url(#sc-grime)" opacity={o} />
    <rect width={W} height={FLOOR} filter="url(#sc-stains)" opacity={o * 0.8} />
  </>
);

function Floor({ color, tiles }: { color: string; tiles?: string }) {
  return (
    <>
      <rect y={FLOOR} width={W} height={H - FLOOR} fill={color} />
      {tiles &&
        Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${i * 30 - 10},${FLOOR} L${i * 36 - 60},${H}`} stroke={tiles} strokeWidth={0.8} />)}
      {tiles && [248, 262].map((y) => <path key={y} d={`M0,${y} H${W}`} stroke={tiles} strokeWidth={0.8} />)}
      <rect y={FLOOR} width={W} height={H - FLOOR} filter="url(#sc-grime)" opacity={0.45} />
      <rect y={FLOOR - 3} width={W} height={3} fill="#000" opacity={0.3} />
    </>
  );
}

/** Кафель стен: сетка поверх заливки. */
function Tiles({ y0, y1, size, fill, line }: { y0: number; y1: number; size: number; fill: string; line: string }) {
  const cols = Math.ceil(W / size);
  const rows = Math.ceil((y1 - y0) / size);
  return (
    <g>
      <rect y={y0} width={W} height={y1 - y0} fill={fill} />
      {Array.from({ length: cols }, (_, i) => <path key={`v${i}`} d={`M${i * size},${y0} V${y1}`} stroke={line} strokeWidth={0.7} />)}
      {Array.from({ length: rows }, (_, i) => <path key={`h${i}`} d={`M0,${y0 + i * size} H${W}`} stroke={line} strokeWidth={0.7} />)}
    </g>
  );
}

function Lamp({ x, w = 110 }: { x: number; w?: number }) {
  return (
    <>
      <rect x={x - w / 2 + 10} y={4} width={w - 20} height={5} rx={2} fill="#f5f2e2" />
      <rect className="lamp-flicker" x={x - w / 2 - 20} y={9} width={w + 40} height={130} fill="url(#sc-lamp)" opacity={0.5} />
    </>
  );
}

function Window({ x, y, w = 50, h = 44 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-3} y={-3} width={w + 6} height={h + 6} fill="#3a3a36" />
      <rect width={w} height={h} fill="#8fb0c8" />
      <rect width={w} height={h} fill="url(#sc-glass)" />
      {Array.from({ length: Math.floor(w / 9) }, (_, i) => <rect key={i} x={5 + i * 9} width={2.4} height={h} fill="#2a2a28" />)}
      <rect y={h / 2 - 1} width={w} height={2.4} fill="#2a2a28" />
    </g>
  );
}

// --- Баня -------------------------------------------------------------------------------

function Bath() {
  return (
    <>
      <rect width={W} height={FLOOR} fill="#5b4a38" />
      {/* бревенчатая стена */}
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i}>
          <rect y={i * 20} width={W} height={19} rx={9} fill={i % 2 ? '#7a5a3a' : '#835f3c'} />
          <path d={`M0,${i * 20 + 15} H${W}`} stroke="#4a3522" strokeWidth={1} opacity={0.6} />
        </g>
      ))}
      <Grime o={0.4} />
      {/* полок в две ступени */}
      <g>
        <rect x={10} y={150} width={200} height={10} fill="#b58a58" stroke="#5e4125" />
        <rect x={10} y={190} width={240} height={10} fill="#b58a58" stroke="#5e4125" />
        {[20, 100, 190].map((x) => <rect key={x} x={x} y={160} width={8} height={30} fill="#7a5530" />)}
        {[20, 120, 230].map((x) => <rect key={x} x={x} y={200} width={8} height={36} fill="#7a5530" />)}
      </g>
      {/* печь-каменка */}
      <g transform="translate(270 118)">
        <rect x={0} y={0} width={70} height={118} fill="#3a3632" stroke="#1d1b19" />
        {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={10 + (i % 5) * 12 + (i > 4 ? 6 : 0)} cy={i > 4 ? -6 : 2} r={7} fill={['#6d6a64', '#807b72', '#5d5a55'][i % 3]} />)}
        <rect x={16} y={60} width={38} height={26} fill="#1b1512" />
        <rect className="lamp-flicker" x={18} y={64} width={34} height={20} fill="#e2742a" opacity={0.85} />
        <path d="M0,40 H70" stroke="#1d1b19" />
      </g>
      {/* шайки и веник */}
      <g transform="translate(40 172)">
        <path d="M0,0 H26 L22,18 H4 Z" fill="#a8753f" stroke="#5a3a1e" />
        <path d="M2,6 H24 M3,12 H23" stroke="#5a3a1e" />
      </g>
      <g transform="translate(150 130) rotate(-20)">
        <path d="M0,0 L4,30" stroke="#6b4a25" strokeWidth={3} />
        <ellipse cx={3} cy={-10} rx={12} ry={16} fill="#4f6b34" />
        <ellipse cx={-3} cy={-14} rx={8} ry={10} fill="#5f7e3e" />
      </g>
      <Floor color="#6b5236" />
    </>
  );
}

// --- Столовая ------------------------------------------------------------------------------

function Canteen() {
  return (
    <>
      <rect width={W} height={FLOOR} fill="#b9b39a" />
      <Tiles y0={120} y1={FLOOR} size={14} fill="#d8d6c8" line="#a8a594" />
      <rect y={116} width={W} height={4} fill="#5d7b6a" />
      <Grime />
      {/* окно раздачи */}
      <g transform="translate(120 40)">
        <rect width={130} height={80} fill="#2a2621" stroke="#555" strokeWidth={2} />
        <rect x={6} y={6} width={118} height={56} fill="#3b342c" />
        <rect className="lamp-flicker" x={6} y={6} width={118} height={56} fill="#e8d7a0" opacity={0.25} />
        {[20, 50, 80].map((x) => (
          <g key={x}>
            <rect x={x} y={34} width={24} height={22} fill="#9aa0a4" stroke="#555" />
            <path className="steam" d={`M${x + 12},30 Q${x + 8},22 ${x + 12},14`} stroke="#fff" strokeWidth={1.5} fill="none" opacity={0.5} />
          </g>
        ))}
        <rect x={0} y={62} width={130} height={18} fill="#8a8f92" stroke="#555" />
        <text x={65} y={-6} fontSize={9} textAnchor="middle" fill="#3a3a30" fontWeight="bold">
          РАЗДАЧА
        </text>
      </g>
      {/* меню на стене */}
      <g transform="translate(20 30)">
        <rect width={70} height={74} fill="#efe8d0" stroke="#9a9a92" />
        <text x={35} y={12} fontSize={7} textAnchor="middle" fill="#8a2a22" fontWeight="bold">
          МЕНЮ
        </text>
        {['Каша перловая', 'Щи пустые', 'Хлеб 300 г', 'Чай'].map((t, i) => (
          <text key={t} x={6} y={26 + i * 12} fontSize={6} fill="#3a3a30">
            {t}
          </text>
        ))}
      </g>
      <g transform="translate(274 30)">
        <rect width={66} height={48} fill="#d9d2b8" stroke="#9a9a92" />
        <text x={33} y={20} fontSize={6.5} textAnchor="middle" fill="#2a4a8a" fontWeight="bold">
          ХЛЕБ — ВСЕМУ
        </text>
        <text x={33} y={32} fontSize={6.5} textAnchor="middle" fill="#2a4a8a" fontWeight="bold">
          ГОЛОВА
        </text>
      </g>
      {/* длинный стол с лавками */}
      <g>
        <rect x={0} y={188} width={W} height={10} fill="#8c6a44" stroke="#4d3822" />
        <rect x={0} y={198} width={W} height={4} fill="#5a4128" />
        {[30, 170, 320].map((x) => <rect key={x} x={x} y={202} width={8} height={34} fill="#4d3822" />)}
        {[40, 120, 210, 290].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy={186} rx={11} ry={3.5} fill="#b3b8bb" stroke="#555" strokeWidth={0.6} />
            <ellipse cx={x} cy={185} rx={7} ry={2} fill="#c9b27a" />
            <rect x={x + 14} y={178} width={6} height={9} fill="#c7cdd0" stroke="#666" strokeWidth={0.5} />
          </g>
        ))}
      </g>
      <Floor color="#7a6f5c" tiles="#5e5646" />
    </>
  );
}

// --- Библиотека --------------------------------------------------------------------------------

function Library() {
  const books = ['#7a2a22', '#2a4a6a', '#3a5a2a', '#8a6a2a', '#5a2a4a', '#2a2a2a', '#9a8a6a'];
  return (
    <>
      <rect width={W} height={FLOOR} fill="#7d8a6e" />
      <rect y={150} width={W} height={FLOOR - 150} fill="#5f6b52" />
      <Grime />
      {/* стеллажи */}
      {[10, 250].map((x0) => (
        <g key={x0} transform={`translate(${x0} 30)`}>
          <rect x={3} y={3} width={100} height={206} fill="#000" opacity={0.25} />
          <rect width={100} height={206} fill="#6b4a2c" stroke="#3a2716" />
          {[0, 1, 2, 3, 4].map((r) => (
            <g key={r}>
              {Array.from({ length: 13 }, (_, k) => {
                const h = 26 + ((k * 7 + r * 3) % 9);
                return <rect key={k} x={5 + k * 7.1} y={8 + r * 40 + (34 - h)} width={6.3} height={h} fill={books[(k + r * 3) % books.length]} stroke="#1a120a" strokeWidth={0.4} />;
              })}
              <rect x={2} y={42 + r * 40} width={96} height={4} fill="#4d341e" />
            </g>
          ))}
        </g>
      ))}
      {/* портрет и лампа */}
      <g transform="translate(152 22)">
        <rect width={56} height={70} fill="#caa55a" />
        <rect x={5} y={5} width={46} height={60} fill="#d9d1b8" />
        <circle cx={28} cy={28} r={11} fill="#b08a6a" />
        <path d="M14,64 C16,44 40,44 42,64 Z" fill="#3a3a44" />
        <path d="M19,26 C20,14 36,14 37,26 L37,32 C34,38 22,38 19,32 Z" fill="#6a5a4a" opacity={0.5} />
        <text x={28} y={82} fontSize={6} textAnchor="middle" fill="#2a2a20">
          Ф. М. ДОСТОЕВСКИЙ
        </text>
      </g>
      {/* стол библиотекаря */}
      <g>
        <rect x={130} y={180} width={100} height={8} fill="#7a5530" stroke="#3a2716" />
        <rect x={136} y={188} width={8} height={48} fill="#5a3d22" />
        <rect x={216} y={188} width={8} height={48} fill="#5a3d22" />
        <rect x={150} y={170} width={30} height={10} fill="#e9e1c6" stroke="#888" strokeWidth={0.5} />
        <rect x={186} y={172} width={22} height={8} fill="#2a4a6a" />
        <path d="M200,180 L204,150 L216,146" stroke="#2a3a2a" strokeWidth={2} fill="none" />
        <path d="M210,142 L226,148 L218,156 Z" fill="#3a6a4a" />
        <circle cx={218} cy={158} r={18} fill="#ffe9a0" opacity={0.25} filter="url(#sc-blur-s)" />
      </g>
      <Floor color="#5a4a36" tiles="#43372a" />
    </>
  );
}

// --- Клуб ------------------------------------------------------------------------------------

function Club() {
  return (
    <>
      <rect width={W} height={FLOOR} fill="#3b2a2a" />
      <Grime o={0.3} />
      {/* сцена с занавесом */}
      <g>
        <rect x={40} y={20} width={280} height={150} fill="#1a1414" />
        {Array.from({ length: 10 }, (_, i) => (
          <path key={`l${i}`} d={`M${40 + i * 7},20 Q${46 + i * 7},100 ${40 + i * 7},170`} stroke={i % 2 ? '#7a1a1a' : '#9a2222'} strokeWidth={8} fill="none" />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <path key={`r${i}`} d={`M${320 - i * 7},20 Q${314 - i * 7},100 ${320 - i * 7},170`} stroke={i % 2 ? '#7a1a1a' : '#9a2222'} strokeWidth={8} fill="none" />
        ))}
        <path d="M40,20 H320 V36 Q180,50 40,36 Z" fill="#8a1c1c" />
        <path d="M40,36 Q180,50 320,36" stroke="#caa55a" strokeWidth={2} fill="none" />
        <rect x={30} y={170} width={300} height={14} fill="#6a4a2a" stroke="#3a2716" />
        {/* плакат */}
        <g transform="translate(144 60)">
          <rect width={72} height={50} fill="#e8dfc4" />
          <text x={36} y={16} fontSize={7} textAnchor="middle" fill="#8a1a1a" fontWeight="bold">
            КОНЦЕРТ
          </text>
          <text x={36} y={28} fontSize={5.5} textAnchor="middle" fill="#333">
            художественной
          </text>
          <text x={36} y={36} fontSize={5.5} textAnchor="middle" fill="#333">
            самодеятельности
          </text>
          <text x={36} y={46} fontSize={5} textAnchor="middle" fill="#555">
            отряд №3
          </text>
        </g>
        {/* гитара и микрофон */}
        <g transform="translate(90 120) rotate(-12)">
          <ellipse cx={0} cy={30} rx={14} ry={17} fill="#a8641f" stroke="#4a2a10" />
          <circle cx={0} cy={26} r={4} fill="#2a1a0a" />
          <rect x={-2} y={-24} width={4} height={40} fill="#3a2410" />
        </g>
        <path d="M262,170 V112" stroke="#333" strokeWidth={2} />
        <ellipse cx={262} cy={110} rx={4} ry={6} fill="#555" />
      </g>
      {/* ряды стульев */}
      {[206, 226].map((y, r) => (
        <g key={y}>
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i} transform={`translate(${14 + i * 38 + r * 12} ${y})`}>
              <rect width={24} height={12} rx={2} fill="#6a2a2a" stroke="#2a1010" />
              <rect y={12} width={24} height={4} fill="#4a1a1a" />
            </g>
          ))}
        </g>
      ))}
      <Floor color="#3a2c22" />
    </>
  );
}

// --- Свиданка --------------------------------------------------------------------------------

function Visits() {
  return (
    <>
      <rect width={W} height={FLOOR} fill="#c4b79a" />
      <rect y={140} width={W} height={FLOOR - 140} fill="#8a9a8a" />
      <Grime />
      {/* кабинки с стеклом и трубками */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${30 + i * 106} 60)`}>
          <rect width={90} height={120} fill="#6f7f72" stroke="#3a4a3e" />
          <rect x={8} y={10} width={74} height={80} fill="#9ec2d0" />
          <rect x={8} y={10} width={74} height={80} fill="url(#sc-glass)" />
          {/* за стеклом — силуэт гостя */}
          {i === 1 && (
            <g opacity={0.55}>
              <circle cx={45} cy={46} r={12} fill="#6a5a50" />
              <path d="M25,90 C27,66 63,66 65,90 Z" fill="#7a4a5a" />
              <path d="M33,40 C35,30 55,30 57,40 L58,56 C52,52 38,52 32,56 Z" fill="#4a3020" />
            </g>
          )}
          <rect x={0} y={90} width={90} height={12} fill="#5a6a5e" />
          <path d="M14,70 C6,76 6,92 14,96" stroke="#222" strokeWidth={2} fill="none" />
          <rect x={10} y={62} width={8} height={14} rx={3} fill="#222" />
          <text x={45} y={116} fontSize={7} textAnchor="middle" fill="#e8e0c8">
            {i + 1}
          </text>
        </g>
      ))}
      <g transform="translate(118 18)">
        <rect width={124} height={26} fill="#efe8d0" stroke="#9a9a92" />
        <text x={62} y={11} fontSize={6.5} textAnchor="middle" fill="#2a4a8a" fontWeight="bold">
          КОМНАТА КРАТКОСРОЧНЫХ
        </text>
        <text x={62} y={20} fontSize={6.5} textAnchor="middle" fill="#2a4a8a" fontWeight="bold">
          СВИДАНИЙ
        </text>
      </g>
      {/* стулья у кабинок */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${60 + i * 106} 196)`}>
          <rect width={30} height={6} fill="#6a4a2a" />
          <rect x={2} y={-26} width={4} height={26} fill="#4a3018" />
          <rect x={2} y={6} width={3} height={34} fill="#4a3018" />
          <rect x={25} y={6} width={3} height={34} fill="#4a3018" />
        </g>
      ))}
      <Floor color="#8a7a5e" tiles="#6a5c44" />
    </>
  );
}

// --- Промка ------------------------------------------------------------------------------------

function Factory() {
  return (
    <>
      <rect width={W} height={FLOOR} fill="#6e6e66" />
      <Grime o={0.5} />
      {/* высокие окна цеха */}
      {[20, 130, 240].map((x) => (
        <Window key={x} x={x} y={14} w={96} h={60} />
      ))}
      <path d="M0,86 H360" stroke="#2e2e2a" strokeWidth={6} />
      {/* кран-балка */}
      <rect x={0} y={92} width={W} height={8} fill="#c9a52a" stroke="#6a5a10" />
      <g transform="translate(220 100)">
        <rect x={-10} y={0} width={20} height={10} fill="#8a7a20" />
      </g>
      {/* швейные машинки */}
      {[0, 1].map((i) => (
        <g key={i} transform={`translate(${20 + i * 90} 160)`}>
          <rect x={0} y={20} width={76} height={8} fill="#7a6a4a" stroke="#3a3020" />
          <rect x={6} y={28} width={4} height={48} fill="#333" />
          <rect x={66} y={28} width={4} height={48} fill="#333" />
          <path d="M18,20 V2 H56 V10 H50 V20" fill="#2a2a2a" stroke="#111" />
          <circle cx={56} cy={6} r={5} fill="#555" />
          <rect x={30} y={14} width={20} height={6} fill="#e8e0d0" />
        </g>
      ))}
      {/* станок */}
      <g transform="translate(250 126)">
        <rect x={0} y={60} width={100} height={50} fill="#4a5a5a" stroke="#222" />
        <rect x={10} y={20} width={50} height={40} fill="#5a6a6a" stroke="#222" />
        <circle cx={80} cy={50} r={16} fill="#777" stroke="#333" />
        <circle cx={80} cy={50} r={4} fill="#222" />
        <rect x={20} y={0} width={30} height={20} fill="#4a5a5a" stroke="#222" />
        <rect x={8} y={74} width={30} height={12} fill="#c9a52a" />
        <text x={23} y={83} fontSize={6} textAnchor="middle" fill="#222" fontWeight="bold">
          ТБ!
        </text>
      </g>
      {/* ящики с продукцией */}
      <g transform="translate(200 200)">
        <rect width={40} height={36} fill="#9a7a4a" stroke="#4a3a1a" />
        <path d="M0,12 H40 M0,24 H40" stroke="#4a3a1a" />
      </g>
      <Floor color="#4e4e48" />
      {/* разметка */}
      <path d="M0,258 H360" stroke="#c9a52a" strokeWidth={3} strokeDasharray="16 10" opacity={0.6} />
    </>
  );
}

// --- ШИЗО -------------------------------------------------------------------------------------

function Shizo() {
  return (
    <>
      <rect width={W} height={FLOOR} fill="#5a5a56" />
      <rect width={W} height={FLOOR} filter="url(#sc-chips)" opacity={0.5} />
      <Grime o={0.6} />
      {/* коридор: три двери камер */}
      {[30, 146, 262].map((x, i) => (
        <g key={x} transform={`translate(${x} 60)`}>
          <rect x={-4} y={-4} width={76} height={180} fill="#2e2e2c" />
          <rect width={68} height={176} fill="#4a5048" stroke="#1d1f1c" strokeWidth={2} />
          {[20, 88, 156].map((y) => <rect key={y} x={0} y={y} width={68} height={4} fill="#3a403a" />)}
          {[10, 58].map((cx) => [30, 100, 150].map((cy) => <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={1.8} fill="#2a2e2a" />))}
          {/* кормушка и глазок */}
          <rect x={16} y={96} width={36} height={16} fill="#2a2e2a" />
          {i === 1 && <rect x={18} y={98} width={32} height={12} fill="#0d0d0c" />}
          <circle cx={34} cy={60} r={3.5} fill="#1a1a18" stroke="#6a6e66" />
          <text x={34} y={-10} fontSize={8} textAnchor="middle" fill="#ddd" fontWeight="bold">
            {i + 7}
          </text>
          <rect x={58} y={70} width={8} height={24} rx={2} fill="#6a6e66" />
        </g>
      ))}
      {/* решётка-отсекатель и лампа в сетке */}
      <g transform="translate(180 14)">
        <circle r={8} fill="#f0e6b0" />
        <path d="M-9,0 H9 M0,-9 V9 M-6,-6 L6,6 M-6,6 L6,-6" stroke="#333" strokeWidth={1} />
      </g>
      <Floor color="#3e3e3a" />
      <path d="M0,240 H360" stroke="#000" strokeWidth={1} opacity={0.3} />
    </>
  );
}

// --- Жизнь в местах: то, что двигается поверх фона ---------------------------------------------

/** Мухи над столом: каждая по своей петле. */
const Flies = () => (
  <g>
    {[
      [70, 160, 0],
      [230, 150, 1.3],
      [300, 172, 2.1],
    ].map(([x, y, d]) => (
      <g key={x} transform={`translate(${x} ${y})`}>
        <g className="loc-fly" style={{ animationDelay: `${d}s` }}>
          <circle r={1.3} fill="#111" />
          <ellipse cx={-1} cy={-1.4} rx={1.4} ry={0.8} fill="#ddd" opacity={0.6} />
        </g>
      </g>
    ))}
  </g>
);

/** Капли с потолка: падают и разбиваются о пол. */
const Drips = ({ xs, color = '#bcd4e0' }: { xs: number[]; color?: string }) => (
  <g>
    {xs.map((x, i) => (
      <g key={x}>
        <ellipse className="loc-drip" style={{ animationDelay: `${i * 1.1}s` }} cx={x} cy={8} rx={1.4} ry={2.4} fill={color} opacity={0.8} />
        <ellipse className="loc-splash" style={{ animationDelay: `${i * 1.1}s` }} cx={x} cy={FLOOR + 6} rx={6} ry={1.5} fill="none" stroke={color} strokeWidth={0.8} />
      </g>
    ))}
  </g>
);

/** Пыль в луче лампы. */
const Dust = ({ x }: { x: number }) => (
  <g>
    {Array.from({ length: 10 }, (_, i) => (
      <circle key={i} className="loc-dust" style={{ animationDelay: `${i * 0.7}s`, animationDuration: `${6 + (i % 4)}s` }} cx={x - 50 + ((i * 37) % 100)} cy={60 + ((i * 53) % 110)} r={0.9 + (i % 3) * 0.4} fill="#fff6c8" opacity={0.7} />
    ))}
  </g>
);

/** Часы на стене: секундная стрелка идёт. */
const Clock = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r={13} fill="#efe8d0" stroke="#3a3a30" strokeWidth={2} />
    {Array.from({ length: 12 }, (_, i) => (
      <path key={i} d="M0,-11 V-9" stroke="#333" strokeWidth={1} transform={`rotate(${i * 30})`} />
    ))}
    <path d="M0,0 V-6" stroke="#222" strokeWidth={1.6} transform="rotate(130)" />
    <path d="M0,0 V-9" stroke="#222" strokeWidth={1.1} transform="rotate(40)" />
    <path className="loc-tick" d="M0,2 V-10" stroke="#a02020" strokeWidth={0.7} />
    <circle r={1.2} fill="#222" />
  </g>
);

/** Крыса перебегает коридор раз в несколько секунд. */
const Rat = () => (
  <g className="loc-rat">
    <g transform="translate(0 252)">
      <ellipse cx={0} cy={0} rx={9} ry={4.5} fill="#3a3530" />
      <circle cx={8} cy={-1} r={3.4} fill="#3a3530" />
      <circle cx={10} cy={-2} r={0.7} fill="#c33" />
      <path d="M-9,0 Q-20,4 -26,-2" stroke="#5a504a" strokeWidth={1.2} fill="none" />
    </g>
  </g>
);

/** Что двигается в каждом месте. */
function Life({ place }: { place: PlaceId }) {
  switch (place) {
    case 'canteen':
      return <Flies />;
    case 'bath':
      return <Drips xs={[44, 132, 214]} />;
    case 'library':
      return <Dust x={180} />;
    case 'club':
      return (
        <g className="loc-sway">
          <path d="M180,36 L120,176 H240 Z" fill="#fff2c0" opacity={0.14} />
        </g>
      );
    case 'visits':
      return <Clock x={320} y={30} />;
    case 'factory':
      return (
        <g>
          {[0, 1].map((i) => (
            <rect key={i} className="loc-needle" style={{ animationDelay: `${i * 0.13}s` }} x={20 + i * 90 + 41} y={162} width={1.6} height={14} fill="#bbb" />
          ))}
          <g transform="translate(330 176)">
            <g className="loc-spin">
              <circle r={16} fill="#777" stroke="#333" />
              {[0, 60, 120].map((a) => (
                <path key={a} d="M-15,0 H15" stroke="#444" strokeWidth={2.4} transform={`rotate(${a})`} />
              ))}
              <circle r={4} fill="#222" />
            </g>
          </g>
          <g transform="translate(220 100)">
            <g className="loc-swing">
              <path d="M0,10 V60" stroke="#333" strokeWidth={1.5} />
              <path d="M-6,60 H6 L0,70 Z" fill="#555" />
            </g>
          </g>
        </g>
      );
    case 'shizo':
      return (
        <>
          <Drips xs={[96, 250]} color="#9aa6a0" />
          <Rat />
        </>
      );
  }
  return null;
}

const BACKDROPS: Record<PlaceId, () => ReactNode> = { bath: Bath, canteen: Canteen, library: Library, club: Club, visits: Visits, factory: Factory, shizo: Shizo };

export function LocationScene({ place, children }: { place: PlaceId; children?: ReactNode }) {
  const B = BACKDROPS[place];
  return (
    <Scene backdrop={<B />}>
      {place === 'bath' && (
        <>
          {[60, 150, 240, 310].map((x, i) => (
            <path key={x} className="steam" style={{ animationDelay: `${i * 0.6}s` }} d={`M${x},200 Q${x - 10},160 ${x + 4},120 Q${x + 16},90 ${x},60`} stroke="#fff" strokeWidth={10} fill="none" opacity={0.18} filter="url(#sc-blur)" />
          ))}
        </>
      )}
      {place !== 'bath' && place !== 'club' && <Lamp x={180} />}
      <Life place={place} />
      {children}
    </Scene>
  );
}
