// Наколки для рига: каждая — рисунок в своих координатах и место на теле.
// Рисуются тушью поверх кожи (под одеждой), поэтому видны, только когда место не закрыто.
import type { ReactNode } from 'react';

export const TAT = '#26384f';

export type TatPlace = 'chest' | 'collar' | 'belly' | 'shoulder' | 'arm' | 'hand' | 'knee';

/** Рука и предплечье, куда встаёт наколка: nu/fu — плечо ближней/дальней руки, nf/ff — предплечье. */
export type ArmSlot = 'nu' | 'fu' | 'nf' | 'ff';

const S = { fill: 'none', stroke: TAT, strokeWidth: 0.55, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Восьмиконечная воровская звезда: половина лучей залита. */
const star = (
  <g>
    <path d="M 0,-4 L 0.9,-0.9 L 4,0 L 0.9,0.9 L 0,4 L -0.9,0.9 L -4,0 L -0.9,-0.9 Z" {...S} />
    <path d="M 0,-4 L 0.9,-0.9 L 0,0 Z M 4,0 L 0.9,0.9 L 0,0 Z M 0,4 L -0.9,0.9 L 0,0 Z M -4,0 L -0.9,-0.9 L 0,0 Z" fill={TAT} />
    <path d="M 2.5,-2.5 L 0.5,-0.2 M 2.5,2.5 L 0.2,0.5 M -2.5,2.5 L -0.5,0.2 M -2.5,-2.5 L -0.2,-0.5" {...S} strokeWidth={0.45} />
  </g>
);

const dome = (x: number, base: number, w: number, h: number) => (
  <g>
    <path d={`M ${x - w},${base} C ${x - w - 0.4},${base - h * 0.55} ${x - w * 0.3},${base - h * 0.75} ${x},${base - h} C ${x + w * 0.3},${base - h * 0.75} ${x + w + 0.4},${base - h * 0.55} ${x + w},${base} Z`} {...S} fill={TAT} fillOpacity={0.35} />
    <path d={`M ${x},${base - h} v ${-h * 0.55} M ${x - 0.9},${base - h * 1.3} h 1.8 M ${x - 0.6},${base - h * 1.12} l 1.2,-0.4`} {...S} />
  </g>
);

export const TATTOO_ART: Record<string, { place: TatPlace; slots?: ArmSlot[]; art: ReactNode }> = {
  t_church: {
    place: 'chest',
    art: (
      <g>
        {/* храм с тремя куполами: каждый купол — ходка */}
        <path d="M -9,7 L -9,0 L 9,0 L 9,7 M -11,7 L 11,7" {...S} />
        <path d="M -2.6,0 V -5.4 H 2.6 V 0 M -8,0 V -3 H -4 V 0 M 4,0 V -3 H 8 V 0" {...S} />
        {dome(0, -5.4, 2.8, 4.4)}
        {dome(-6, -3, 2, 3.2)}
        {dome(6, -3, 2, 3.2)}
        <path d="M -1.1,7 V 3.8 C -1.1,2.6 1.1,2.6 1.1,3.8 V 7 M -6.6,2 v 2 M -5.4,2 v 2 M 5.4,2 v 2 M 6.6,2 v 2 M -1,-3.6 v 1.6 M 1,-3.6 v 1.6" {...S} strokeWidth={0.45} />
        <path d="M -9,4.6 H -3 M 3,4.6 H 9 M -9,2.2 H -8 M 8,2.2 H 9" {...S} strokeWidth={0.35} />
      </g>
    ),
  },
  t_stars: { place: 'collar', art: star },
  t_eagle: {
    place: 'belly',
    art: (
      <g>
        {/* орёл с короной, крылья раскинуты */}
        <path d="M 0,-1.6 C -3,-5.6 -8,-6.6 -11.4,-3.6 C -8.6,-3.8 -6.4,-2 -5.4,0 C -7.4,0 -9.4,1 -10.4,3 C -6.4,2 -3.2,2.2 0,4.2 C 3.2,2.2 6.4,2 10.4,3 C 9.4,1 7.4,0 5.4,0 C 6.4,-2 8.6,-3.8 11.4,-3.6 C 8,-6.6 3,-5.6 0,-1.6 Z" {...S} fill={TAT} fillOpacity={0.25} />
        <path d="M -9,-3.4 C -7,-3 -5.4,-1.6 -4.4,0.4 M -7,-4.6 C -5,-3.6 -3.6,-2 -2.8,0 M 9,-3.4 C 7,-3 5.4,-1.6 4.4,0.4 M 7,-4.6 C 5,-3.6 3.6,-2 2.8,0 M -8,2 C -5.4,1.8 -3,2.4 -1.4,3.4 M 8,2 C 5.4,1.8 3,2.4 1.4,3.4" {...S} strokeWidth={0.4} />
        <path d="M -1,-1.6 C -1.2,-3.6 0.6,-4.4 1.6,-3.2 L 2.8,-2.8 L 1.2,-2 Z" fill={TAT} />
        <path d="M -1.6,4 L 0,7.4 L 1.6,4 M -0.6,4.6 L 0,6.4 L 0.6,4.6" {...S} />
        <path d="M -2,-5.4 L -2.2,-7.6 L -1,-6.6 L 0,-8.4 L 1,-6.6 L 2.2,-7.6 L 2,-5.4 Z" {...S} fill={TAT} fillOpacity={0.6} />
      </g>
    ),
  },
  t_epaulets: {
    place: 'shoulder',
    art: (
      <g>
        {/* погоны с бахромой и звездой — отрицала */}
        <path d="M -4.6,-1.4 C -2,-2.2 2,-2.2 4.6,-1.4 L 4.6,2.4 L -4.6,2.4 Z" {...S} fill={TAT} fillOpacity={0.3} />
        <path d="M -4.2,2.4 v 2.2 M -2.6,2.4 v 2.6 M -1,2.4 v 2.8 M 0.6,2.4 v 2.8 M 2.2,2.4 v 2.6 M 3.8,2.4 v 2.2" {...S} strokeWidth={0.45} />
        <g transform="translate(0 0.4) scale(0.34)">{star}</g>
      </g>
    ),
  },
  t_spider: {
    place: 'arm',
    slots: ['nu', 'fu', 'nf'],
    art: (
      <g>
        {/* паук в паутине */}
        <path d="M 0,-5 V 5 M -4.8,0 H 4.8 M -3.5,-3.5 L 3.5,3.5 M 3.5,-3.5 L -3.5,3.5" {...S} strokeWidth={0.4} />
        <path d="M 0,-2.2 L 1.6,-1.6 L 2.2,0 L 1.6,1.6 L 0,2.2 L -1.6,1.6 L -2.2,0 L -1.6,-1.6 Z M 0,-4 L 2.8,-2.8 L 4,0 L 2.8,2.8 L 0,4 L -2.8,2.8 L -4,0 L -2.8,-2.8 Z" {...S} strokeWidth={0.4} />
        <ellipse cx={0.8} cy={1.4} rx={1.1} ry={1.4} fill={TAT} />
        <circle cx={0.8} cy={-0.4} r={0.65} fill={TAT} />
        <path d="M 0,0.6 L -1.6,-0.6 M 0,1.4 L -1.8,1.4 M 0,2 L -1.4,3.4 M 1.6,0.6 L 3.2,-0.6 M 1.6,1.4 L 3.4,1.4 M 1.6,2 L 3,3.4" {...S} strokeWidth={0.45} />
      </g>
    ),
  },
  t_tiger: {
    place: 'arm',
    slots: ['nu', 'fu', 'ff', 'nf'],
    art: (
      <g>
        {/* оскал тигра */}
        <path d="M -3.8,-2.6 C -3.4,-4.6 -1.8,-4.8 -1.1,-3.4 C 0,-3.9 1,-3.9 2.1,-3.4 C 2.8,-4.8 4.4,-4.6 4.8,-2.6 C 5.4,-0.6 5,1.8 3.4,3.6 C 2.2,4.8 -1,4.8 -2.4,3.6 C -4,1.8 -4.4,-0.6 -3.8,-2.6 Z" {...S} />
        <path d="M -2.4,-1.2 L -0.5,-0.4 L -1.8,-0.2 Z M 3.4,-1.2 L 1.5,-0.4 L 2.8,-0.2 Z" fill={TAT} />
        <path d="M -0.6,0.8 L 0.5,1.6 L 1.6,0.8 Z" fill={TAT} />
        <path d="M -1.8,2.4 C -0.6,3.6 1.6,3.6 2.8,2.4 M -1.2,2.8 L -0.9,3.8 M 2.2,2.8 L 1.9,3.8 M 0.5,1.6 V 2.9" {...S} />
        <path d="M -3.6,-1.4 L -2.6,-1 M -3.8,0.4 L -2.8,0.4 M 4.6,-1.4 L 3.6,-1 M 4.8,0.4 L 3.8,0.4 M 0.5,-3.8 V -2.4 M -0.6,-3.6 L -0.3,-2.6 M 1.6,-3.6 L 1.3,-2.6" {...S} strokeWidth={0.45} />
      </g>
    ),
  },
  t_rose: {
    place: 'arm',
    slots: ['fu', 'nu', 'ff'],
    art: (
      <g>
        {/* роза за колючей проволокой */}
        <path d="M 0,-4.2 C 2.6,-4.6 3.8,-1.8 2.2,0 C 0.8,1.4 -2,1.2 -2.6,-0.8 C -3.2,-2.8 -1.8,-4.4 0,-4.2 Z" {...S} fill={TAT} fillOpacity={0.3} />
        <path d="M -0.6,-3 C 0.9,-3.4 1.8,-2 0.9,-1.1 C 0.1,-0.4 -1.1,-1.2 -0.6,-2.4 M -1.6,-1.6 C -1.4,-0.4 0,0.2 1.4,-0.6" {...S} strokeWidth={0.45} />
        <path d="M 0,0.8 C -0.4,2.6 0.2,4.2 0,5.8 M 0,2.8 C 1.4,1.8 2.8,2.2 3.2,3 C 2.2,3.6 1,3.4 0,2.8 Z M 0,4.2 C -1.2,3.4 -2.4,3.6 -2.8,4.4 C -1.8,4.9 -0.8,4.8 0,4.2 Z" {...S} strokeWidth={0.5} />
        <path d="M -4.8,1.4 C -2,0.2 1.6,4 4.8,2.6 M -3.4,0.6 L -2.8,2.2 M -3.8,1.8 L -2.4,1 M 0.4,2.2 L 0.8,3.6 M -0.2,3.2 L 1.4,2.6 M 3,2.6 L 3.4,4 M 2.6,3.6 L 4,3" {...S} strokeWidth={0.45} />
      </g>
    ),
  },
  t_cat: {
    place: 'arm',
    slots: ['nf', 'ff', 'fu', 'nu'],
    art: (
      <g>
        {/* кот в цилиндре с бабочкой — «коренной обитатель тюрьмы» */}
        <path d="M -3.2,3.4 L -3.4,-1.6 L -2.4,-3.8 L -0.8,-2 L 0.8,-2 L 2.4,-3.8 L 3.4,-1.6 L 3.2,3.4 C 1.4,4.6 -1.4,4.6 -3.2,3.4 Z" {...S} />
        <path d="M -2.4,-3.4 L -2.2,-6 L 2.2,-6 L 2.4,-3.4 M -3.6,-3.4 H 3.6" {...S} />
        <path d="M -2.2,-6 L 2.2,-6 L 2.3,-4.4 L -2.3,-4.4 Z" fill={TAT} />
        <ellipse cx={-1.3} cy={0} rx={0.8} ry={0.55} fill={TAT} />
        <ellipse cx={1.3} cy={0} rx={0.8} ry={0.55} fill={TAT} />
        <path d="M 0,1.2 L -0.5,1.8 H 0.5 Z M -0.4,2.4 C -0.2,2.8 0.2,2.8 0.4,2.4 M -1.2,1.6 L -4,1 M -1.2,2 L -4,2.4 M 1.2,1.6 L 4,1 M 1.2,2 L 4,2.4" {...S} strokeWidth={0.4} />
        <path d="M 0,4.6 L -1.6,3.8 L -1.6,5.4 Z M 0,4.6 L 1.6,3.8 L 1.6,5.4 Z" fill={TAT} />
      </g>
    ),
  },
  t_skull: {
    place: 'arm',
    slots: ['ff', 'nf', 'nu', 'fu'],
    art: (
      <g>
        {/* череп — «смерть мусорам» */}
        <path d="M -3.2,0.6 C -4,-2.4 -2.4,-4.8 0,-4.8 C 2.4,-4.8 4,-2.4 3.2,0.6 L 2.2,1.4 L 2,3.4 L -2,3.4 L -2.2,1.4 Z" {...S} fill={TAT} fillOpacity={0.2} />
        <ellipse cx={-1.3} cy={-1} rx={1.05} ry={1.2} fill={TAT} />
        <ellipse cx={1.3} cy={-1} rx={1.05} ry={1.2} fill={TAT} />
        <path d="M 0,0.4 L -0.6,1.4 H 0.6 Z" fill={TAT} />
        <path d="M -1.4,2.2 V 3.4 M -0.5,2.2 V 3.4 M 0.5,2.2 V 3.4 M 1.4,2.2 V 3.4 M -2.2,2.2 H 2.2" {...S} strokeWidth={0.4} />
        <path d="M -4.4,4.6 L 4.4,-3.6 M -4.4,-3.6 L 4.4,4.6" {...S} strokeWidth={0.7} opacity={0.6} />
      </g>
    ),
  },
  t_dagger: {
    place: 'arm',
    slots: ['nf', 'ff'],
    art: (
      <g>
        {/* кинжал со змеёй — «мститель» */}
        <path d="M 0,-2.6 L 1.1,-1.6 L 0.6,7.2 L 0,8.8 L -0.6,7.2 L -1.1,-1.6 Z" {...S} fill={TAT} fillOpacity={0.25} />
        <path d="M 0,-1.6 V 7" {...S} strokeWidth={0.35} />
        <path d="M -3,-2.8 H 3" {...S} strokeWidth={0.9} />
        <path d="M 0,-2.8 V -6.6" {...S} strokeWidth={1.1} />
        <circle cx={0} cy={-7.4} r={0.8} fill={TAT} />
        <path d="M -2.4,5.6 C -2.6,3.6 2.6,3.4 2.4,1.4 C 2.2,-0.4 -2.4,-0.2 -2.4,-2 C -2.2,-3.6 1,-4.6 2,-3.6" {...S} strokeWidth={0.6} />
        <path d="M 0.4,9.6 C 0.2,10.4 -0.2,10.6 -0.4,10 C -0.4,9.6 0,9.2 0.4,9.6 Z" fill="#7a2a22" />
      </g>
    ),
  },
  t_rings: {
    place: 'hand',
    art: null,
  },
  // --- вторая волна: 25 наколок ---
  t_snake: {
    place: 'arm', slots: ['nf', 'ff', 'nu', 'fu'],
    art: (
      <g>
        {/* змея вокруг кинжала нет — просто змея: хитрость */}
        <path d="M -3,5 C -5,3 -2,1 0,2 C 3,3 4,0 2,-1 C 0,-2 -3,-1 -3,-3 C -3,-5 0,-5.4 1.6,-4.4" {...S} strokeWidth={1.1} />
        <path d="M 1.6,-4.4 L 3.2,-5.2 L 2.4,-3.6 Z" fill={TAT} />
        <path d="M 3.2,-5.2 L 4.6,-5.8 M 3.2,-5.2 L 4.4,-4.4" {...S} strokeWidth={0.4} />
      </g>
    ),
  },
  t_heart: {
    place: 'arm', slots: ['fu', 'nu', 'ff'],
    art: (
      <g>
        {/* сердце, пронзённое стрелой — любовь, оставленная на воле */}
        <path d="M 0,4 C -5,0 -4.6,-4.4 -2,-4 C -1,-3.8 -0.4,-3 0,-2.2 C 0.4,-3 1,-3.8 2,-4 C 4.6,-4.4 5,0 0,4 Z" {...S} fill={TAT} fillOpacity={0.3} />
        <path d="M -5,3 L 5,-3.4 M 5,-3.4 L 3.6,-3.4 M 5,-3.4 L 4.6,-2 M -5,3 L -5.6,2 M -5,3 L -4.2,3.6" {...S} />
      </g>
    ),
  },
  t_anchor: {
    place: 'arm', slots: ['ff', 'nf', 'fu', 'nu'],
    art: (
      <g>
        {/* якорь — флотский, «надежда» */}
        <circle cx={0} cy={-4.4} r={1.1} {...S} />
        <path d="M 0,-3.3 V 4.6 M -2.6,-2 H 2.6 M -4,1.8 C -3.6,4.6 -1.4,5.4 0,4.6 C 1.4,5.4 3.6,4.6 4,1.8 M -4,1.8 L -4.8,2.6 M 4,1.8 L 4.8,2.6" {...S} strokeWidth={0.7} />
      </g>
    ),
  },
  t_owl: {
    place: 'arm', slots: ['nu', 'fu', 'nf'],
    art: (
      <g>
        {/* сова — ночной вор, не спит */}
        <path d="M -3.4,4.6 C -4.4,1 -4.4,-2 -3,-4 L -1.6,-2.8 C -0.6,-3.2 0.6,-3.2 1.6,-2.8 L 3,-4 C 4.4,-2 4.4,1 3.4,4.6 Z" {...S} fill={TAT} fillOpacity={0.2} />
        <circle cx={-1.5} cy={-0.8} r={1.3} {...S} />
        <circle cx={1.5} cy={-0.8} r={1.3} {...S} />
        <circle cx={-1.5} cy={-0.8} r={0.5} fill={TAT} />
        <circle cx={1.5} cy={-0.8} r={0.5} fill={TAT} />
        <path d="M -0.5,0.4 L 0,1.4 L 0.5,0.4 Z M -2,2.6 L -1,3.2 M 2,2.6 L 1,3.2" {...S} strokeWidth={0.45} />
      </g>
    ),
  },
  t_wolf: {
    place: 'arm', slots: ['nu', 'fu', 'nf', 'ff'],
    art: (
      <g>
        {/* волчий оскал — ненависть к конвою */}
        <path d="M -4,-4 L -2.4,-1.6 C -1,-2.4 1,-2.4 2.4,-1.6 L 4,-4 L 3.6,0.4 C 3,3 1.4,4.6 0,5 C -1.4,4.6 -3,3 -3.6,0.4 Z" {...S} fill={TAT} fillOpacity={0.2} />
        <path d="M -2,0 L -0.6,0.6 M 2,0 L 0.6,0.6" {...S} strokeWidth={0.8} />
        <path d="M -1.4,2.6 L -0.8,3.8 L -0.2,2.8 L 0.2,2.8 L 0.8,3.8 L 1.4,2.6" {...S} strokeWidth={0.45} />
        <path d="M 0,1.4 L -0.5,2 H 0.5 Z" fill={TAT} />
      </g>
    ),
  },
  t_clock: {
    place: 'arm', slots: ['nf', 'ff'],
    art: (
      <g>
        {/* часы без стрелок — срок, который не кончается */}
        <circle r={4.2} {...S} strokeWidth={0.8} />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
          <path key={i} d={`M ${Math.sin((i * Math.PI) / 6) * 3.3},${-Math.cos((i * Math.PI) / 6) * 3.3} L ${Math.sin((i * Math.PI) / 6) * 3.9},${-Math.cos((i * Math.PI) / 6) * 3.9}`} {...S} strokeWidth={0.45} />
        ))}
        <circle r={0.5} fill={TAT} />
        <path d="M -1.6,-5.8 H 1.6 M 0,-5.8 V -4.2" {...S} strokeWidth={0.6} />
      </g>
    ),
  },
  t_bat: {
    place: 'arm', slots: ['fu', 'nu', 'ff', 'nf'],
    art: (
      <path d="M 0,-1.4 C -1,-3 -2.6,-3.4 -3.4,-2.4 C -4.2,-3.6 -5.6,-3.4 -5.8,-2 C -5,-1.6 -4.6,-0.4 -4.8,0.6 C -3.6,0 -2.4,0.4 -1.8,1.4 C -1.2,1 -0.6,1.2 0,2 C 0.6,1.2 1.2,1 1.8,1.4 C 2.4,0.4 3.6,0 4.8,0.6 C 4.6,-0.4 5,-1.6 5.8,-2 C 5.6,-3.4 4.2,-3.6 3.4,-2.4 C 2.6,-3.4 1,-3 0,-1.4 Z" {...S} fill={TAT} fillOpacity={0.5} />
    ),
  },
  t_barbwire: {
    place: 'arm', slots: ['nf', 'ff'],
    art: (
      <g>
        {/* браслет из колючки — срок от звонка до звонка */}
        <path d="M -6,-1 C -3,0.6 3,-2.4 6,-0.6 M -6,1 C -3,2.6 3,-0.4 6,1.4" {...S} strokeWidth={0.6} />
        {[-4.4, -1.4, 1.6, 4.4].map((x) => (
          <path key={x} d={`M ${x - 0.8},${-1.2} L ${x + 0.8},${1.8} M ${x + 0.8},${-1.2} L ${x - 0.8},${1.8}`} {...S} strokeWidth={0.5} />
        ))}
      </g>
    ),
  },
  t_candle: {
    place: 'arm', slots: ['ff', 'fu', 'nf', 'nu'],
    art: (
      <g>
        {/* свеча — память о погибших друзьях */}
        <rect x={-1.4} y={-1} width={2.8} height={6} {...S} fill={TAT} fillOpacity={0.2} />
        <path d="M 0,-1 V -2 M 0,-2.2 C -1.2,-3.4 -0.6,-5 0,-5.8 C 0.6,-5 1.2,-3.4 0,-2.2 Z" {...S} strokeWidth={0.5} />
        <path d="M -2.6,5 H 2.6 M 1.4,1 C 1.8,1.8 1.8,2.4 1.4,3" {...S} strokeWidth={0.45} />
      </g>
    ),
  },
  t_sword: {
    place: 'arm', slots: ['nf', 'ff', 'nu'],
    art: (
      <g>
        {/* меч и роза — «за предательство отомщу» */}
        <path d="M 0,-6 L 0.9,-4.6 L 0.6,4 L 0,5 L -0.6,4 L -0.9,-4.6 Z" {...S} fill={TAT} fillOpacity={0.2} />
        <path d="M -3,-4 H 3 M 0,-4 V -6.6" {...S} strokeWidth={0.8} />
        <path d="M 1,1 C 3,0 4,1.6 2.8,2.8 C 1.8,3.6 0.8,2.6 1,1.8" {...S} strokeWidth={0.5} />
      </g>
    ),
  },
  t_devil: {
    place: 'arm', slots: ['fu', 'nu', 'ff', 'nf'],
    art: (
      <g>
        {/* чёрт — «не зли», вспыльчивый */}
        <path d="M -3.4,-1 C -3.4,2.6 -1.6,4.6 0,4.6 C 1.6,4.6 3.4,2.6 3.4,-1 C 3.4,-3.4 1.6,-4.4 0,-4.4 C -1.6,-4.4 -3.4,-3.4 -3.4,-1 Z" {...S} fill={TAT} fillOpacity={0.15} />
        <path d="M -2.6,-3.4 L -3.8,-6 L -1.4,-4.2 M 2.6,-3.4 L 3.8,-6 L 1.4,-4.2" {...S} fill={TAT} />
        <path d="M -2,-1.2 L -0.6,-0.4 M 2,-1.2 L 0.6,-0.4 M -1.6,2 C -0.6,3 0.6,3 1.6,2 M -0.8,2.6 L -0.6,3.4 M 0.8,2.6 L 0.6,3.4" {...S} strokeWidth={0.5} />
      </g>
    ),
  },
  t_scales: {
    place: 'arm', slots: ['ff', 'nf', 'fu', 'nu'],
    art: (
      <g>
        {/* весы — «судья мне совесть» */}
        <path d="M 0,-5 V 4.4 M -3,4.4 H 3 M -4.4,-3 H 4.4" {...S} strokeWidth={0.7} />
        <path d="M -4.4,-3 L -5.6,0.6 H -3.2 Z M 4.4,-3 L 3.2,0.6 H 5.6 Z" {...S} strokeWidth={0.5} />
        <path d="M -5.8,0.6 C -5.4,2 -3.4,2 -3,0.6 M 3,0.6 C 3.4,2 5.4,2 5.8,0.6" {...S} strokeWidth={0.5} />
      </g>
    ),
  },
  t_madonna: {
    place: 'chest',
    art: (
      <g>
        {/* мадонна с младенцем — с малолетства по тюрьмам */}
        <path d="M -6,8 C -6,1 -4,-2 0,-2 C 4,-2 6,1 6,8" {...S} fill={TAT} fillOpacity={0.2} />
        <ellipse cx={0} cy={-5} rx={2.6} ry={3.2} {...S} />
        <path d="M -3.6,-5 C -4,-9 4,-9 3.6,-5" {...S} />
        <circle cx={0} cy={-6.4} r={5} {...S} strokeWidth={0.35} strokeDasharray="0.6 0.8" />
        <ellipse cx={1.6} cy={3} rx={2.2} ry={1.8} {...S} />
        <circle cx={3.2} cy={1.6} r={1.2} {...S} />
        <path d="M -1,-5.6 h 0.6 M 0.8,-5.6 h 0.6 M -0.4,-3.6 C 0,-3.2 0.4,-3.2 0.6,-3.6" {...S} strokeWidth={0.4} />
      </g>
    ),
  },
  t_crucifix: {
    place: 'chest',
    art: (
      <g>
        {/* распятие — «не предам» */}
        <path d="M -1.2,-9 H 1.2 V -4 H 6 V -1.6 H 1.2 V 9 H -1.2 V -1.6 H -6 V -4 H -1.2 Z" {...S} fill={TAT} fillOpacity={0.25} />
        <circle cx={0} cy={-6.6} r={2.4} {...S} strokeWidth={0.4} strokeDasharray="0.5 0.6" />
        <path d="M -5,-2.8 L 5,-2.8 M 0,-2.8 V 5" {...S} strokeWidth={0.35} />
      </g>
    ),
  },
  t_lighthouse: {
    place: 'chest',
    art: (
      <g>
        {/* маяк — «ищу свободу» */}
        <path d="M -2.4,7 L -1.6,-4 H 1.6 L 2.4,7 Z" {...S} fill={TAT} fillOpacity={0.2} />
        <path d="M -2.2,3 H 2.2 M -2,-0.6 H 2 M -2,-4 H 2 V -6 H -2 Z M 0,-6 V -7.6" {...S} />
        <path d="M 2,-5 L 9,-8 M 2,-5 L 9,-2 M -2,-5 L -9,-8 M -2,-5 L -9,-2" {...S} strokeWidth={0.35} />
        <path d="M -9,7 C -6,6 -3,8 0,7 C 3,6 6,8 9,7" {...S} strokeWidth={0.5} />
      </g>
    ),
  },
  t_ship: {
    place: 'chest',
    art: (
      <g>
        {/* парусник — тяга к побегу */}
        <path d="M -7,3 H 7 L 5,6 H -5 Z" {...S} fill={TAT} fillOpacity={0.3} />
        <path d="M -1,3 V -8 M 3,3 V -6" {...S} />
        <path d="M -1,-7 C -5,-5 -5,0 -1,1.6 Z M 3,-5.4 C 6,-4 6,0 3,1.6 Z" {...S} fill={TAT} fillOpacity={0.15} />
        <path d="M -1,-8 L 1.6,-7 L -1,-6.2" {...S} strokeWidth={0.4} />
        <path d="M -9,7.4 C -6,6.4 -3,8.4 0,7.4 C 3,6.4 6,8.4 9,7.4" {...S} strokeWidth={0.5} />
      </g>
    ),
  },
  t_mother: {
    place: 'chest',
    art: (
      <g>
        {/* лента с надписью — «не забуду мать родную» */}
        <path d="M -10,-2 L -8,-4 H 8 L 10,-2 L 8,0 H -8 Z" {...S} fill={TAT} fillOpacity={0.15} />
        <text x={0} y={-1.2} fontSize={2.6} textAnchor="middle" fill={TAT} fontFamily="serif" fontStyle="italic">
          Не забуду мать родную
        </text>
        <path d="M -2,2 C -4,6 4,6 2,2 M 0,1 V 7" {...S} strokeWidth={0.4} />
      </g>
    ),
  },
  t_eyes: {
    place: 'belly',
    art: (
      <g>
        {/* глаза — «я всё вижу» */}
        {[-4.6, 4.6].map((x) => (
          <g key={x}>
            <path d={`M ${x - 4},0 C ${x - 2},-3 ${x + 2},-3 ${x + 4},0 C ${x + 2},3 ${x - 2},3 ${x - 4},0 Z`} {...S} />
            <circle cx={x} cy={0} r={1.6} fill={TAT} />
            <path d={`M ${x - 4},-2.6 C ${x - 1},-4.6 ${x + 1},-4.6 ${x + 4},-2.6`} {...S} strokeWidth={0.5} />
          </g>
        ))}
      </g>
    ),
  },
  t_beetle: {
    place: 'belly',
    art: (
      <g>
        {/* жук — воровская удача */}
        <ellipse cx={0} cy={1} rx={3.4} ry={4.4} {...S} fill={TAT} fillOpacity={0.25} />
        <circle cx={0} cy={-4.4} r={1.6} {...S} />
        <path d="M 0,-3 V 5.4 M -3.2,-1 L -6,-3 M 3.2,-1 L 6,-3 M -3.4,1.6 L -6.4,1.6 M 3.4,1.6 L 6.4,1.6 M -3,4 L -5.6,6 M 3,4 L 5.6,6 M -0.8,-5.8 L -2,-7.4 M 0.8,-5.8 L 2,-7.4" {...S} strokeWidth={0.5} />
      </g>
    ),
  },
  t_bear: {
    place: 'belly',
    art: (
      <g>
        {/* медведь — медвежатник, вскрыватель сейфов */}
        <path d="M -5,4 C -6,-1 -3,-5 0,-5 C 3,-5 6,-1 5,4 C 3,6 -3,6 -5,4 Z" {...S} fill={TAT} fillOpacity={0.2} />
        <circle cx={-3.6} cy={-4.6} r={1.4} {...S} />
        <circle cx={3.6} cy={-4.6} r={1.4} {...S} />
        <ellipse cx={0} cy={1.4} rx={2} ry={1.4} {...S} />
        <circle cx={0} cy={0.8} r={0.5} fill={TAT} />
        <circle cx={-2} cy={-1.4} r={0.5} fill={TAT} />
        <circle cx={2} cy={-1.4} r={0.5} fill={TAT} />
      </g>
    ),
  },
  t_crown: {
    place: 'shoulder',
    art: (
      <g>
        {/* корона — авторитет */}
        <path d="M -4.4,2.4 L -5,-2.4 L -2.4,0 L 0,-3.4 L 2.4,0 L 5,-2.4 L 4.4,2.4 Z" {...S} fill={TAT} fillOpacity={0.3} />
        <path d="M -4.4,3.6 H 4.4" {...S} />
        <circle cx={0} cy={-3.8} r={0.5} fill={TAT} />
      </g>
    ),
  },
  t_dove: {
    place: 'arm', slots: ['fu', 'nu', 'ff'],
    art: (
      <g>
        {/* голубь — мечта о свободе */}
        <path d="M -5,1 C -3,-1 -1,-1 0,0 C 1,-3 3,-5 5.4,-5 C 4,-3 3.4,-1 2.6,0.4 C 3.6,0.6 4.6,1.4 5,2.4 C 2,2.8 0,3 -2,2.4 L -4.4,3.6 L -3.4,1.8 Z" {...S} fill={TAT} fillOpacity={0.25} />
        <circle cx={-3.4} cy={0.6} r={0.35} fill={TAT} />
        <path d="M -5,1 L -6,1.4" {...S} strokeWidth={0.5} />
      </g>
    ),
  },
  t_key: {
    place: 'arm', slots: ['ff', 'nf', 'fu', 'nu'],
    art: (
      <g>
        {/* ключ — вор-домушник */}
        <circle cx={0} cy={-3.2} r={2.2} {...S} strokeWidth={0.8} />
        <circle cx={0} cy={-3.2} r={0.8} {...S} strokeWidth={0.5} />
        <path d="M 0,-1 V 5 M 0,2.6 H 2 M 0,4.2 H 1.6" {...S} strokeWidth={0.8} />
      </g>
    ),
  },
  t_web: {
    place: 'arm', slots: ['nf', 'ff', 'nu', 'fu'],
    art: (
      <g>
        {/* паутина на локте — долгий срок */}
        <path d="M 0,-5 V 5 M -5,0 H 5 M -3.5,-3.5 L 3.5,3.5 M 3.5,-3.5 L -3.5,3.5" {...S} strokeWidth={0.4} />
        {[1.6, 3, 4.4].map((r) => (
          <path key={r} d={`M 0,${-r} L ${r * 0.7},${-r * 0.7} L ${r},0 L ${r * 0.7},${r * 0.7} L 0,${r} L ${-r * 0.7},${r * 0.7} L ${-r},0 L ${-r * 0.7},${-r * 0.7} Z`} {...S} strokeWidth={0.4} />
        ))}
      </g>
    ),
  },
  t_lion: {
    place: 'belly',
    art: (
      <g>
        {/* лев — сила и власть */}
        {Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          return <path key={i} d={`M ${Math.cos(a) * 4},${Math.sin(a) * 4} L ${Math.cos(a) * 7},${Math.sin(a) * 7}`} {...S} strokeWidth={0.8} />;
        })}
        <circle r={4.2} {...S} fill={TAT} fillOpacity={0.15} />
        <path d="M -1.8,-1 L -0.6,-0.4 M 1.8,-1 L 0.6,-0.4 M -0.8,1 L 0,1.8 L 0.8,1 Z M -1.6,2.8 C -0.6,3.6 0.6,3.6 1.6,2.8" {...S} strokeWidth={0.5} />
      </g>
    ),
  },
  t_sun: { place: 'hand', art: null },
  t_dots: { place: 'hand', art: null },
  t_cards: { place: 'hand', art: null },
  t_knee_stars: { place: 'knee', art: star },
};

/** Наколки на кисти (в координатах кисти): солнце, пять точек, масти на пальцах. */
export function HandInk({ id, fist }: { id: string; fist: boolean }) {
  const y = fist ? 6 : 6.5;
  if (id === 't_sun')
    return (
      <g transform={`translate(${fist ? 0.4 : -0.4} ${y}) scale(0.5)`}>
        <path d="M -4,2 A 4,4 0 0 1 4,2 Z" {...S} fill={TAT} fillOpacity={0.4} />
        <path d="M 0,-2 V -5 M -3,-1 L -5,-3 M 3,-1 L 5,-3 M -4,1 L -6.4,0.6 M 4,1 L 6.4,0.6" {...S} strokeWidth={0.8} />
      </g>
    );
  if (id === 't_dots')
    return (
      <g transform={`translate(${fist ? 0.4 : -0.6} ${y})`} fill={TAT}>
        {[[-1.4, -1.4], [1.4, -1.4], [0, 0], [-1.4, 1.4], [1.4, 1.4]].map(([x, yy], i) => (
          <circle key={i} cx={x} cy={yy} r={0.45} />
        ))}
      </g>
    );
  if (id === 't_cards')
    return (
      <g fontSize={1.8} fill={TAT} textAnchor="middle">
        {(fist ? [[4.2, 4.6], [4.2, 7.2], [4, 9.8]] : [[-3, 10.4], [-1, 11], [1, 11.2]]).map(([x, yy], i) => (
          <text key={i} x={x} y={yy}>
            {'♠♥♣'[i]}
          </text>
        ))}
      </g>
    );
  return null;
}

/** Какие наколки на кистях: ближняя и дальняя рука. */
export function handInks(tattoos: string[]): [string | null, string | null] {
  const list = ['t_rings', 't_cards', 't_dots', 't_sun'].filter((id) => tattoos.includes(id));
  return [list[0] ?? null, list[1] ?? null];
}

/** Первая набитая из списка — на груди и животе помещается по одной. */
export function firstOf(tattoos: string[], order: string[]): string | null {
  return order.find((id) => tattoos.includes(id)) ?? null;
}

/** Перстни на пальцах (в координатах кисти): у кулака — на фалангах спереди. */
export function Rings({ fist }: { fist: boolean }) {
  return fist ? (
    <g>
      <rect x={3.1} y={3.3} width={2} height={1.9} fill={TAT} opacity={0.8} />
      <path d="M 3.3,6 h 1.8 v 1.8 h -1.8 Z M 3.3,6 L 5.1,7.8" {...S} strokeWidth={0.45} />
      <rect x={2.9} y={8.7} width={1.8} height={1.6} fill="none" stroke={TAT} strokeWidth={0.45} />
      <circle cx={3.8} cy={9.5} r={0.4} fill={TAT} />
    </g>
  ) : (
    <g>
      <rect x={-3.6} y={10.2} width={1.7} height={1.6} fill={TAT} opacity={0.8} />
      <path d="M -1.5,10.6 h 1.5 v 1.5 h -1.5 Z M -1.5,10.6 L 0,12.1" {...S} strokeWidth={0.45} />
    </g>
  );
}

/** Раскладывает наколки на руках по свободным местам (в порядке покупки). */
export function armSlots(tattoos: string[]): Partial<Record<ArmSlot, string>> {
  const out: Partial<Record<ArmSlot, string>> = {};
  for (const id of tattoos) {
    const t = TATTOO_ART[id];
    if (t?.place !== 'arm') continue;
    const slot = t.slots?.find((s) => !out[s]);
    if (slot) out[slot] = id;
  }
  return out;
}

/** Иконка наколки: рисунок на коже. */
export function TattooGlyph({ id }: { id: string }) {
  const t = TATTOO_ART[id];
  if (!t) return null;
  if (t.place === 'hand' && id !== 't_rings')
    return (
      <g transform="scale(1.6) translate(-1 -8)">
        <path d="M -4.4,-0.6 C -5.4,2 -5.8,6 -5,9 C -4.4,11.4 -2.4,12.6 0.4,12.6 C 3.4,12.6 5.8,11.6 6.4,9.2 C 7,6.8 6.6,4 5.6,2.4 C 5,1.4 4.4,0.4 4.2,-0.6 Z" fill="#d9a888" stroke="#1b130d" strokeWidth={0.9} />
        <HandInk id={id} fist />
      </g>
    );
  if (t.place === 'hand')
    return (
      <g transform="scale(1.6) translate(-1 -8)">
        <path d="M -4.4,-0.6 C -5.4,2 -5.8,6 -5,9 C -4.4,11.4 -2.4,12.6 0.4,12.6 C 3.4,12.6 5.8,11.6 6.4,9.2 C 7,6.8 6.6,4 5.6,2.4 C 5,1.4 4.4,0.4 4.2,-0.6 Z" fill="#d9a888" stroke="#1b130d" strokeWidth={0.9} />
        <Rings fist />
      </g>
    );
  const k = t.place === 'chest' || t.place === 'belly' ? 1.05 : 2.2;
  return <g transform={`scale(${k})`}>{t.art}</g>;
}
