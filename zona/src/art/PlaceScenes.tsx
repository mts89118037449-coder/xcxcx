// Санчасть и этапы побега. Та же система координат 360×280, пол на y=236.
import type { ReactNode } from 'react';
import { FLOOR, Scene } from './Scenes.tsx';

const W = 360;
const H = 280;

// --- Санчасть ----------------------------------------------------------------------

function MedicBackdrop() {
  return (
    <>
      <rect width={W} height={FLOOR} fill="#c9cfc8" />
      {/* кафель до середины стены */}
      <rect y={110} width={W} height={FLOOR - 110} fill="#dfe6e2" />
      {Array.from({ length: 24 }, (_, i) => (
        <path key={`v${i}`} d={`M${i * 16},110 V${FLOOR}`} stroke="#a9b3ae" strokeWidth={0.7} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <path key={`h${i}`} d={`M0,${110 + i * 16} H${W}`} stroke="#a9b3ae" strokeWidth={0.7} />
      ))}
      <rect y={106} width={W} height={4} fill="#7aa39a" />
      <rect width={W} height={FLOOR} filter="url(#sc-grime)" opacity={0.35} />
      <rect width={W} height={FLOOR} filter="url(#sc-stains)" opacity={0.3} />
      {/* красный крест и плакат */}
      <g transform="translate(150 30)">
        <rect width={50} height={50} fill="#f4f1ea" stroke="#9a9a92" strokeWidth={1} />
        <path d="M19,8 H31 V19 H42 V31 H31 V42 H19 V31 H8 V19 H19 Z" fill="#c9302c" />
      </g>
      <g transform="translate(222 26)">
        <rect width={40} height={56} fill="#efe8d0" stroke="#9a9a92" strokeWidth={0.8} />
        <text x={20} y={10} fontSize={5} textAnchor="middle" fill="#2a4a8a" fontWeight="bold">
          МОЙТЕ РУКИ
        </text>
        <circle cx={20} cy={28} r={10} fill="#8fc0d8" />
        <path d="M12,30 C14,24 18,24 20,28 C22,24 26,24 28,30" stroke="#b98b62" strokeWidth={3} fill="none" />
        <path d="M6,46 H34 M6,50 H30" stroke="#8a8474" strokeWidth={0.8} />
      </g>
      {/* шкаф с лекарствами */}
      <g transform="translate(20 70)">
        <rect x={2} y={4} width={62} height={166} fill="#000" opacity={0.25} />
        <rect width={60} height={166} fill="#e8ece8" stroke="#8a948f" strokeWidth={1} />
        <rect x={4} y={4} width={52} height={82} fill="#cfe2ea" stroke="#8a948f" strokeWidth={0.8} />
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3].map((k) => (
            <rect key={`${r}${k}`} x={8 + k * 12} y={12 + r * 26} width={8} height={16} rx={1.5} fill={['#c9853a', '#fff', '#6fa0c0', '#b33a32'][(r + k) % 4]} stroke="#555" strokeWidth={0.4} />
          )),
        )}
        {[34, 60].map((y) => <rect key={y} x={4} y={y} width={52} height={2} fill="#8a948f" />)}
        <rect x={4} y={4} width={52} height={82} fill="url(#sc-glass)" />
        <rect x={4} y={92} width={52} height={70} fill="#dfe4df" stroke="#8a948f" strokeWidth={0.8} />
        <path d="M30,92 V162" stroke="#8a948f" strokeWidth={0.8} />
        <circle cx={26} cy={128} r={1.6} fill="#777" />
        <circle cx={34} cy={128} r={1.6} fill="#777" />
      </g>
      {/* койка */}
      <g>
        <rect x={96} y={222} width={150} height={10} fill="#000" opacity={0.35} filter="url(#sc-blur-s)" />
        <rect x={100} y={176} width={140} height={10} fill="#e9ece6" stroke="#8a948f" strokeWidth={0.8} />
        <rect x={100} y={170} width={140} height={8} rx={2} fill="#f7f7f2" />
        <path d="M150,168 C170,166 200,166 238,170 L238,178 L150,178 Z" fill="#b8c9d6" />
        <rect x={104} y={160} width={36} height={12} rx={5} fill="#fbfbf8" stroke="#aaa" strokeWidth={0.6} />
        <path d="M100,150 V232 M240,166 V232 M100,150 H108 V186" stroke="#7d8783" strokeWidth={3} fill="none" />
      </g>
      {/* капельница */}
      <g transform="translate(268 96)">
        <path d="M10,0 V140 M0,140 H20" stroke="#8a948f" strokeWidth={2} />
        <path d="M2,6 H18" stroke="#8a948f" strokeWidth={1.6} />
        <rect x={12} y={8} width={12} height={20} rx={4} fill="#e6f2f8" stroke="#8aa" strokeWidth={0.6} opacity={0.9} />
        <path d="M18,28 C18,50 -40,60 -60,74" stroke="#bcd" strokeWidth={0.8} fill="none" />
      </g>
      {/* пол — линолеум */}
      <rect y={FLOOR} width={W} height={H - FLOOR} fill="#6f7a6a" />
      <rect y={FLOOR} width={W} height={H - FLOOR} filter="url(#sc-grime)" opacity={0.45} />
      <ellipse cx={180} cy={256} rx={140} ry={22} fill="#fff" opacity={0.08} />
    </>
  );
}

export function MedicScene({ children }: { children?: ReactNode }) {
  return (
    <Scene backdrop={<MedicBackdrop />}>
      {/* лампа дневного света */}
      <rect x={120} y={4} width={120} height={6} rx={2} fill="#f8f8f0" />
      <rect className="lamp-flicker" x={100} y={10} width={160} height={120} fill="url(#sc-lamp)" opacity={0.6} />
      {/* капля в капельнице */}
      <circle className="drip" cx={286} cy={126} r={1.2} fill="#cfe6f0" />
      {children}
    </Scene>
  );
}

// --- Побег ---------------------------------------------------------------------------

function Night({ moon = true }: { moon?: boolean }) {
  return (
    <>
      <linearGradient id="esc-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#070a16" />
        <stop offset="1" stopColor="#1c2742" />
      </linearGradient>
      <rect width={W} height={H} fill="url(#esc-sky)" />
      {Array.from({ length: 26 }, (_, i) => (
        <circle key={i} cx={(i * 97) % W} cy={(i * 53) % 110} r={i % 4 ? 0.6 : 1} fill="#fff" opacity={0.6} />
      ))}
      {moon && <circle cx={300} cy={40} r={14} fill="#efe9c4" filter="url(#sc-blur-s)" />}
    </>
  );
}

const Ground = ({ color = '#2a2a26' }: { color?: string }) => (
  <>
    <rect y={FLOOR} width={W} height={H - FLOOR} fill={color} />
    <rect y={FLOOR} width={W} height={H - FLOOR} filter="url(#sc-grime)" opacity={0.6} />
  </>
);

function Fence({ y = 120 }: { y?: number }) {
  return (
    <g>
      <rect y={y} width={W} height={FLOOR - y} fill="#4a4a44" />
      <rect y={y} width={W} height={FLOOR - y} filter="url(#sc-grime)" opacity={0.6} />
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d={`M${i * 48},${y} V${FLOOR}`} stroke="#2e2e2a" strokeWidth={2} />
      ))}
      <path d={Array.from({ length: 40 }, (_, i) => `M${i * 9},${y - 6} l4,-6 l4,6`).join(' ')} stroke="#777" strokeWidth={1} fill="none" />
      <path d={`M0,${y - 8} H${W}`} stroke="#555" strokeWidth={1} />
    </g>
  );
}

function StageBackdrop({ stage }: { stage: string }) {
  switch (stage) {
    case 'tunnel':
      return (
        <>
          <rect width={W} height={H} fill="#2a1d12" />
          <rect width={W} height={H} filter="url(#sc-stains)" opacity={0.6} />
          <ellipse cx={180} cy={150} rx={150} ry={90} fill="#120b06" />
          <ellipse cx={180} cy={150} rx={120} ry={70} fill="#070402" />
          {[60, 120, 240, 300].map((x) => (
            <path key={x} d={`M${x},70 L${x + 6},230`} stroke="#5a3e22" strokeWidth={6} />
          ))}
          <path d="M40,64 H320" stroke="#5a3e22" strokeWidth={7} />
          <Ground color="#3a2818" />
        </>
      );
    case 'yard':
      return (
        <>
          <Night />
          <rect y={60} width={W} height={FLOOR - 60} fill="#3b3a36" />
          {[30, 110, 190, 270].map((x) => (
            <rect key={x} x={x} y={90} width={40} height={30} fill="#1a1a18" />
          ))}
          <rect x={200} y={90} width={40} height={30} fill="#d9b85a" opacity={0.7} />
          <Ground />
        </>
      );
    case 'light':
      return (
        <>
          <Night moon={false} />
          <Fence y={130} />
          <path d="M300,20 L300,130 M288,20 H312 L306,6 H294 Z" stroke="#333" strokeWidth={4} fill="#333" />
          <Ground />
        </>
      );
    case 'dogs':
      return (
        <>
          <Night />
          <rect y={140} width={W} height={FLOOR - 140} fill="#20231c" />
          {[20, 90, 160, 230, 300].map((x) => (
            <path key={x} d={`M${x},${FLOOR} L${x + 20},140 L${x + 40},${FLOOR}`} fill="#141710" />
          ))}
          <Ground color="#1e2018" />
        </>
      );
    case 'wire':
      return (
        <>
          <Night />
          {[0, 1, 2].map((r) => (
            <path key={r} d={Array.from({ length: 24 }, (_, i) => `M${i * 16},${120 + r * 34} c4,-8 8,8 16,0`).join(' ')} stroke="#9a9a92" strokeWidth={1.2} fill="none" />
          ))}
          {[20, 120, 220, 320].map((x) => <rect key={x} x={x} y={100} width={4} height={FLOOR - 100} fill="#555" />)}
          <Ground />
        </>
      );
    case 'wall':
      return (
        <>
          <Night />
          <rect x={0} y={20} width={W} height={FLOOR - 20} fill="#5a5850" />
          <rect x={0} y={20} width={W} height={FLOOR - 20} fill="url(#sc-bricks)" opacity={0.35} />
          <rect x={0} y={20} width={W} height={FLOOR - 20} filter="url(#sc-grime)" opacity={0.7} />
          <path d={Array.from({ length: 40 }, (_, i) => `M${i * 9},18 l4,-6 l4,6`).join(' ')} stroke="#888" strokeWidth={1} fill="none" />
          <Ground />
        </>
      );
    case 'forest':
      return (
        <>
          <Night />
          {Array.from({ length: 14 }, (_, i) => {
            const x = i * 28 - 10;
            const h = 110 + ((i * 37) % 60);
            return <path key={i} d={`M${x},${FLOOR} L${x + 18},${FLOOR - h} L${x + 36},${FLOOR} Z`} fill={i % 2 ? '#0f1a12' : '#13211a'} />;
          })}
          <Ground color="#1a1f14" />
          <ellipse cx={180} cy={250} rx={90} ry={10} fill="#2a3a3a" opacity={0.7} />
        </>
      );
    case 'road':
      return (
        <>
          <Night />
          <rect y={170} width={W} height={H - 170} fill="#2b2b2b" />
          <path d={`M0,${FLOOR - 20} H${W}`} stroke="#d9d0a0" strokeWidth={3} strokeDasharray="22 16" />
          <path d="M0,170 H360" stroke="#555" strokeWidth={2} />
          {[30, 140, 250].map((x) => (
            <g key={x}>
              <rect x={x} y={70} width={4} height={100} fill="#444" />
              <circle cx={x + 2} cy={70} r={5} fill="#ffd98a" />
              <path d={`M${x + 2},72 L${x - 30},170 L${x + 34},170 Z`} fill="#ffd98a" opacity={0.08} />
            </g>
          ))}
        </>
      );
    case 'station':
      return (
        <>
          <Night moon={false} />
          <rect y={80} width={W} height={FLOOR - 80} fill="#3c3a35" />
          <rect x={20} y={40} width={100} height={20} fill="#1d3a6b" />
          <text x={70} y={54} fontSize={10} textAnchor="middle" fill="#fff" fontWeight="bold">
            ВОКЗАЛ
          </text>
          <rect x={200} y={120} width={160} height={90} rx={6} fill="#2d5a3a" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={210 + i * 36} y={132} width={26} height={24} fill="#d9c98a" opacity={0.8} />)}
          <rect y={FLOOR - 16} width={W} height={16} fill="#6b6a62" />
          <Ground color="#4a4944" />
        </>
      );
    default:
      return <Night />;
  }
}

/** Живые детали этапа: прожектор ходит, собаки лают, фары мигают. */
function StageLive({ stage, alarm }: { stage: string; alarm: boolean }) {
  return (
    <>
      {stage === 'light' && <path className="esc-beam" d="M300,20 L200,236 L280,236 Z" fill="#fff6c8" opacity={0.25} />}
      {stage === 'yard' && <circle className="lamp-flicker" cx={220} cy={105} r={30} fill="url(#sc-lamp)" />}
      {stage === 'dogs' && (
        <g className="esc-dogs">
          {[0, 1].map((k) => (
            <g key={k} transform={`translate(${250 + k * 50} ${222 - k * 4})`}>
              <path d="M0,0 C4,-10 20,-12 30,-6 L38,-14 L42,-6 L38,0 L32,2 L30,12 M4,0 L2,12 M26,4 L26,12" stroke="#0a0a0a" strokeWidth={3} fill="#0a0a0a" />
              <circle cx={38} cy={-8} r={1} fill="#e33" />
            </g>
          ))}
        </g>
      )}
      {stage === 'forest' && <g className="esc-heli"><rect x={40} y={30} width={40} height={14} rx={7} fill="#111" /><path d="M20,28 H100" stroke="#333" strokeWidth={2} /><path className="esc-beam" d="M60,44 L20,236 L100,236 Z" fill="#fff6c8" opacity={0.18} /></g>}
      {stage === 'road' && <g className="esc-truck"><rect x={-120} y={150} width={110} height={60} fill="#7a2a22" /><rect x={-10} y={170} width={36} height={40} fill="#5a1a14" /><circle cx={24} cy={200} r={5} fill="#ffe7a0" /><circle cx={-90} cy={212} r={9} fill="#111" /><circle cx={0} cy={212} r={9} fill="#111" /></g>}
      {stage === 'station' && <circle className="lamp-flicker" cx={70} cy={50} r={40} fill="url(#sc-lamp)" />}
      {alarm && <rect className="esc-alarm" width={W} height={H} fill="#d02020" />}
    </>
  );
}

export function EscapeScene({ stage, alarm, children }: { stage: string; alarm: boolean; children?: ReactNode }) {
  return (
    <Scene backdrop={<StageBackdrop stage={stage} />} className="escape-scene">
      <StageLive stage={stage} alarm={alarm} />
      {children}
    </Scene>
  );
}
