// Новые ступени обустройства хаты: рисунки для сцены камеры (холст 360×280, пол с y=236).
// Задник — в CellBackdrop, живое (свет, экраны, животные) — в CellLive.

/** Плакат с певицей над шконкой. */
export function Poster() {
  return (
    <g transform="translate(50 30)">
      <rect x={2} y={3} width={52} height={74} fill="#000" opacity={0.3} />
      <linearGradient id="poster-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d4467a" />
        <stop offset="1" stopColor="#4a1f5e" />
      </linearGradient>
      <rect width={52} height={74} fill="url(#poster-bg)" />
      {/* софиты */}
      <path d="M4,0 L18,50 M48,0 L34,50" stroke="#ffe7a8" strokeWidth={5} opacity={0.18} />
      {/* певица: волосы, лицо, платье, микрофон */}
      <path d="M17,22 C15,10 22,5 27,5 C33,5 39,10 37,22 C38,30 36,34 34,36 L20,36 C18,33 16,29 17,22 Z" fill="#e8c46a" />
      <ellipse cx={27} cy={18} rx={6.2} ry={7.6} fill="#f0c9a6" />
      <path d="M24,23 Q27,25 30,23" stroke="#a8323c" strokeWidth={1.4} fill="none" />
      <path d="M22,16 h3 M29,16 h3" stroke="#3a1f2a" strokeWidth={1} />
      <path d="M16,62 C16,44 20,34 27,34 C34,34 38,44 38,62 Z" fill="#b8e0f0" />
      <path d="M16,62 C16,44 20,34 27,34 C34,34 38,44 38,62 Z" fill="url(#sc-glass)" />
      <path d="M36,40 L41,30" stroke="#1a1a1a" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={41.5} cy={29} r={2.4} fill="#555" />
      <rect x={3} y={63} width={46} height={9} fill="#1a0f22" opacity={0.7} />
      <text x={26} y={70.5} fontSize={7} textAnchor="middle" fill="#ffd36a" fontWeight="bold" letterSpacing={1}>
        ЗВЕЗДА
      </text>
      <rect width={52} height={74} filter="url(#sc-grime)" opacity={0.5} />
      {/* кнопки и загнутый угол */}
      <circle cx={4} cy={4} r={1.4} fill="#c9c2a8" />
      <circle cx={48} cy={4} r={1.4} fill="#c9c2a8" />
      <path d="M44,74 L52,66 L52,74 Z" fill="#d8cfb8" />
    </g>
  );
}

/** Персидский ковёр: медальон, орнамент, бахрома. */
export function SilkCarpet() {
  return (
    <g transform="translate(14 24)">
      <rect x={3} y={4} width={132} height={92} fill="#000" opacity={0.32} />
      <rect width={132} height={92} fill="#1d2a52" />
      <rect x={5} y={5} width={122} height={82} fill="#8e1f24" />
      <rect x={5} y={5} width={122} height={82} fill="none" stroke="#d6ae57" strokeWidth={1.5} />
      <rect x={11} y={11} width={110} height={70} fill="#a8282c" stroke="#243664" strokeWidth={3} />
      {/* бордюр — ромбики */}
      {Array.from({ length: 13 }, (_, i) => (
        <g key={i}>
          <path d={`M${14 + i * 8.4},3 l2.6,2 l-2.6,2 l-2.6,-2 Z`} fill="#d6ae57" />
          <path d={`M${14 + i * 8.4},85 l2.6,2 l-2.6,2 l-2.6,-2 Z`} fill="#d6ae57" />
        </g>
      ))}
      {/* центральный медальон */}
      <ellipse cx={66} cy={46} rx={34} ry={22} fill="#1f3160" stroke="#d6ae57" strokeWidth={1.6} />
      <ellipse cx={66} cy={46} rx={22} ry={14} fill="#c79a3e" />
      <ellipse cx={66} cy={46} rx={13} ry={8} fill="#8e1f24" stroke="#f0d68c" strokeWidth={1} />
      <path d="M66,24 L70,34 L66,31 L62,34 Z M66,68 L70,58 L66,61 L62,58 Z M32,46 L42,42 L39,46 L42,50 Z M100,46 L90,42 L93,46 L90,50 Z" fill="#d6ae57" />
      {/* углы */}
      {[
        [11, 11, 0],
        [121, 11, 90],
        [121, 81, 180],
        [11, 81, 270],
      ].map(([x, y, r]) => (
        <path key={`${x}${y}`} d="M0,0 L18,0 C12,4 4,12 0,18 Z" fill="#1f3160" stroke="#d6ae57" strokeWidth={0.8} transform={`translate(${x} ${y}) rotate(${r})`} />
      ))}
      {/* бахрома */}
      <path d={Array.from({ length: 33 }, (_, i) => `M${2 + i * 4},92 v5`).join(' ')} stroke="#e8dcb8" strokeWidth={1} />
      <rect width={132} height={92} filter="url(#sc-grime)" opacity={0.45} />
    </g>
  );
}

/** Картина маслом в золотой раме. */
export function Painting() {
  return (
    <g transform="translate(30 28)">
      <rect x={3} y={4} width={104} height={80} fill="#000" opacity={0.35} />
      <linearGradient id="frame-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f5d77a" />
        <stop offset="0.5" stopColor="#a8761e" />
        <stop offset="1" stopColor="#f0cc68" />
      </linearGradient>
      <rect width={104} height={80} rx={3} fill="url(#frame-gold)" />
      <rect x={4} y={4} width={96} height={72} fill="none" stroke="#6b4a10" strokeWidth={1} />
      {[
        [0, 0],
        [104, 0],
        [0, 80],
        [104, 80],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={5} fill="url(#frame-gold)" stroke="#6b4a10" strokeWidth={0.8} />
      ))}
      <linearGradient id="paint-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6e8fb3" />
        <stop offset="1" stopColor="#f0c98c" />
      </linearGradient>
      <rect x={9} y={9} width={86} height={62} fill="url(#paint-sky)" />
      <circle cx={70} cy={30} r={7} fill="#fbe3a4" opacity={0.9} />
      <path d="M9,52 C24,40 36,46 50,40 C64,34 78,44 95,38 L95,71 L9,71 Z" fill="#4d6b3a" />
      <path d="M9,60 C30,54 58,62 95,55 L95,71 L9,71 Z" fill="#6e8a44" />
      <path d="M22,70 C30,62 46,60 60,66 C66,69 70,71 70,71 Z" fill="#8fb6c8" opacity={0.8} />
      {/* берёзки */}
      {[30, 36, 80].map((x) => (
        <g key={x}>
          <path d={`M${x},66 L${x},34`} stroke="#eee8d8" strokeWidth={1.6} />
          <ellipse cx={x} cy={34} rx={5} ry={9} fill="#7b9a3c" />
        </g>
      ))}
      <rect x={9} y={9} width={86} height={62} filter="url(#sc-grime)" opacity={0.25} />
      <rect x={40} y={82} width={24} height={6} fill="#c79a3e" />
    </g>
  );
}

/** Перина: пухлое одеяло и две подушки поверх матраса. */
export function Featherbed() {
  return (
    <g>
      <path d="M60,142 C80,136 150,136 162,142 L163,178 C150,182 80,182 58,178 Z" fill="#efe6cf" stroke="#8d8367" strokeWidth={0.9} />
      <path d="M72,146 C74,158 72,168 74,178 M96,142 C98,156 96,168 98,180 M122,142 C124,156 122,168 124,180 M146,142 C148,156 146,168 148,179" stroke="#b8ad8d" strokeWidth={1} fill="none" />
      <path d="M62,160 C90,164 130,164 162,160" stroke="#b8ad8d" strokeWidth={1} fill="none" />
      <rect x={58} y={138} width={106} height={44} filter="url(#sc-grime)" opacity={0.25} />
      <path d="M18,134 C14,142 18,152 30,153 C44,154 56,152 58,146 C60,138 54,132 42,131 C30,130 22,130 18,134 Z" fill="#f6f1e2" stroke="#9b9585" strokeWidth={0.8} />
      <path d="M40,128 C34,134 38,144 48,146 C60,148 70,144 70,138 C70,130 62,126 54,126 C48,126 43,126 40,128 Z" fill="#fbf7ea" stroke="#9b9585" strokeWidth={0.8} />
    </g>
  );
}

/** Балдахин над VIP-шконкой. */
export function Canopy() {
  return (
    <g>
      <rect x={8} y={58} width={4} height={100} fill="#6b4a1e" />
      <rect x={161} y={58} width={4} height={100} fill="#6b4a1e" />
      <rect x={4} y={54} width={165} height={6} rx={2} fill="#c49a48" />
      <path d="M6,60 C30,82 60,82 86,64 C110,82 140,82 167,60 L167,64 C140,88 110,88 86,70 C60,88 30,88 6,64 Z" fill="#6e1522" />
      <path d="M6,60 L6,150 C12,120 16,96 22,74 Z" fill="#6e1522" opacity={0.9} />
      <path d="M167,60 L167,150 C160,120 156,96 150,74 Z" fill="#6e1522" opacity={0.9} />
      <path d="M8,72 C20,78 30,80 40,79 M132,79 C142,80 152,78 164,72" stroke="#c49a48" strokeWidth={1} fill="none" />
      <circle cx={86} cy={66} r={3} fill="#c49a48" />
    </g>
  );
}

/** Абажуры и люстра на месте лампочки (x=232). Возвращает и сам свет. */
export function Light({ kind }: { kind?: string }) {
  if (kind === 'f_chandelier') {
    return (
      <g>
        <path d="M232,0 L232,14" stroke="#b8902e" strokeWidth={1.6} />
        <circle className="lamp-flicker" cx={232} cy={34} r={140} fill="url(#sc-lamp)" />
        <ellipse cx={232} cy={30} rx={26} ry={6} fill="none" stroke="#c9a040" strokeWidth={1.8} />
        <path d="M232,14 L232,34 M232,18 L208,30 M232,18 L256,30 M232,18 L218,32 M232,18 L246,32" stroke="#c9a040" strokeWidth={1.3} />
        {[206, 219, 232, 245, 258].map((x, i) => (
          <g key={x}>
            <rect x={x - 1.6} y={22 + (i % 2) * 3} width={3.2} height={7} fill="#f3ead2" />
            <circle className="lamp-flicker" cx={x} cy={20 + (i % 2) * 3} r={2.4} fill="#fff3c2" />
            {[0, 1, 2].map((k) => (
              <path key={k} d={`M${x - 3 + k * 3},${33 + (i % 2) * 3} l1,4 l1,-4`} fill="#e2f2ff" stroke="#9fc9e6" strokeWidth={0.4} className="twinkle" />
            ))}
          </g>
        ))}
        <path d="M226,36 L232,46 L238,36 Z" fill="#e2f2ff" stroke="#9fc9e6" strokeWidth={0.5} />
      </g>
    );
  }
  const shade = kind === 'f_shade' || kind === 'f_garland';
  return (
    <g>
      <path d="M232,0 L232,34" stroke="#111" strokeWidth={1.2} />
      <rect x={228.5} y={32} width={7} height={6} rx={1} fill="#2a2a2a" />
      <circle className="lamp-flicker" cx={232} cy={44} r={shade ? 118 : 100} fill="url(#sc-lamp)" />
      <circle className="lamp-flicker" cx={232} cy={43} r={5.5} fill="#fff5cf" />
      {kind === 'f_newspaper' && (
        <g>
          <path d="M224,33 L240,33 L248,49 L216,49 Z" fill="#d6d0bd" stroke="#8a8474" strokeWidth={0.6} opacity={0.95} />
          <path d="M221,39 H243 M219,42 H245 M218,45 H246" stroke="#6b6658" strokeWidth={0.6} strokeDasharray="3 1" />
          <text x={232} y={38} fontSize={3.4} textAnchor="middle" fill="#2a2a2a" fontWeight="bold">
            ПРАВДА
          </text>
        </g>
      )}
      {shade && (
        <g>
          <path d="M222,32 L242,32 L252,50 L212,50 Z" fill="#b8612a" stroke="#6b3414" strokeWidth={0.8} />
          <path d="M222,32 L242,32 L252,50 L212,50 Z" fill="#ffd89a" opacity={0.25} />
          <path d={Array.from({ length: 11 }, (_, i) => `M${213 + i * 3.8},50 v3`).join(' ')} stroke="#e8c070" strokeWidth={0.9} />
          <ellipse cx={232} cy={50} rx={20} ry={2} fill="#ffe7b0" opacity={0.7} />
        </g>
      )}
    </g>
  );
}

/** Гирлянда по верху стены — лампочки мигают. */
export function Garland() {
  const colors = ['#ff5a4a', '#ffd84a', '#5ad06a', '#4aa8ff', '#e07aff'];
  const pts = Array.from({ length: 19 }, (_, i) => {
    const x = 6 + i * 19;
    const y = 12 + Math.sin((i / 18) * Math.PI * 3) * 4 + 4;
    return [x, y] as const;
  });
  return (
    <g>
      <path d={`M${pts.map(([x, y]) => `${x},${y}`).join(' L')}`} stroke="#1d2a1d" strokeWidth={0.9} fill="none" />
      {pts.map(([x, y], i) => (
        <g key={i} className="twinkle" style={{ animationDelay: `${(i % 5) * 0.37}s` }}>
          <circle cx={x} cy={y + 3} r={5} fill={colors[i % 5]} opacity={0.22} />
          <ellipse cx={x} cy={y + 3} rx={1.8} ry={2.6} fill={colors[i % 5]} />
        </g>
      ))}
    </g>
  );
}

/** Телевизоры на стене: плоский, гигантская плазма, плазма с приставкой. */
export function WallTv({ kind }: { kind: string }) {
  const big = kind !== 'f_lcd';
  const [x, y, w, h] = big ? [142, 42, 100, 60] : [160, 66, 64, 40];
  return (
    <g>
      <rect x={x + 3} y={y + 4} width={w} height={h} fill="#000" opacity={0.35} filter="url(#sc-blur-s)" />
      <rect x={x} y={y} width={w} height={h} rx={2} fill="#0d0f12" stroke="#3a3f47" strokeWidth={1} />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="#0a1a2a" />
      {kind === 'f_plasma' && (
        // футбол
        <g>
          <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="#2f7a34" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={x + 3 + i * ((w - 6) / 5)} y={y + 3} width={(w - 6) / 10} height={h - 6} fill="#347f38" />
          ))}
          <rect x={x + 10} y={y + 10} width={w - 20} height={h - 20} fill="none" stroke="#e8f2e0" strokeWidth={0.8} />
          <path d={`M${x + w / 2},${y + 10} V${y + h - 10}`} stroke="#e8f2e0" strokeWidth={0.8} />
          <circle cx={x + w / 2} cy={y + h / 2} r={7} fill="none" stroke="#e8f2e0" strokeWidth={0.8} />
          <rect x={x + 6} y={y + 5} width={30} height={6} fill="#10151c" opacity={0.8} />
          <text x={x + 21} y={y + 9.6} fontSize={4} textAnchor="middle" fill="#fff" fontWeight="bold">
            ЗЕН 1:0 СПР
          </text>
        </g>
      )}
      {kind === 'f_console' && (
        // гонки
        <g>
          <rect x={x + 3} y={y + 3} width={w - 6} height={(h - 6) * 0.45} fill="#e88a4a" />
          <path d={`M${x + 3},${y + 3 + (h - 6) * 0.45} H${x + w - 3} V${y + h - 3} H${x + 3} Z`} fill="#3a3f35" />
          <path d={`M${x + w / 2 - 4},${y + 3 + (h - 6) * 0.45} L${x + w / 2 + 4},${y + 3 + (h - 6) * 0.45} L${x + w / 2 + 30},${y + h - 3} L${x + w / 2 - 30},${y + h - 3} Z`} fill="#5a5d58" />
          <path d={`M${x + w / 2},${y + 30} V${y + h - 3}`} stroke="#f2e6a0" strokeWidth={1} strokeDasharray="3 3" />
          <path d={`M${x + w / 2 - 8},${y + h - 16} h16 l2,8 h-20 Z`} fill="#c42d2d" />
          <circle cx={x + 18} cy={y + 14} r={5} fill="#ffd38a" />
          <text x={x + w - 8} y={y + 10} fontSize={4.5} textAnchor="end" fill="#fff" fontWeight="bold">
            LAP 2/3
          </text>
        </g>
      )}
      {kind === 'f_lcd' && (
        <g>
          <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="#23466e" />
          <path d={`M${x + 3},${y + h - 12} C${x + 20},${y + h - 20} ${x + 40},${y + h - 8} ${x + w - 3},${y + h - 18} V${y + h - 3} H${x + 3} Z`} fill="#1a2f4a" />
          <circle cx={x + w - 16} cy={y + 12} r={4} fill="#f0e6c0" opacity={0.8} />
        </g>
      )}
      <rect className="tv-glow" x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="#fff" opacity={0.06} />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="url(#sc-glass)" />
      {big && <circle cx={x + w - 5} cy={y + h - 2} r={0.9} fill="#e33" />}
      {kind === 'f_console' && (
        <g>
          <rect x={206} y={226} width={30} height={9} rx={2} fill="#15171a" stroke="#3a3f47" strokeWidth={0.8} />
          <circle cx={230} cy={230.5} r={1.1} fill="#4ad06a" className="twinkle" />
          <path d={`M221,226 C226,210 236,196 238,${y + h}`} stroke="#15171a" strokeWidth={0.8} fill="none" />
          <g transform="translate(118 162) rotate(-12)">
            <path d="M0,4 C0,-1 6,-2 9,1 L15,1 C18,-2 24,-1 24,4 C24,9 20,11 17,8 L7,8 C4,11 0,9 0,4 Z" fill="#1d1f23" />
            <circle cx={5} cy={4} r={1.2} fill="#666" />
            <circle cx={19} cy={3} r={0.9} fill="#c44" />
            <circle cx={21} cy={5} r={0.9} fill="#4a4" />
          </g>
        </g>
      )}
    </g>
  );
}

/** Самовар и скатерть на столе (стол — как у f_table, в точке 244,186). */
export function Samovar() {
  return (
    <g transform="translate(244 186)">
      <path d="M-2,0 L82,0 L84,16 C70,20 10,20 -4,16 Z" fill="#f2ece0" />
      <path d="M-2,0 L82,0 L84,16 C70,20 10,20 -4,16 Z" fill="url(#sc-ticking)" opacity={0.35} />
      <path d="M0,2 H80 M-2,8 H82 M-3,14 H83" stroke="#b33a32" strokeWidth={1.2} opacity={0.8} />
      <g transform="translate(56 -38)">
        <linearGradient id="samovar" x1="0" x2="1">
          <stop offset="0" stopColor="#8a5a1a" />
          <stop offset="0.45" stopColor="#f4cf6a" />
          <stop offset="1" stopColor="#7a4e14" />
        </linearGradient>
        <rect x={6} y={0} width={10} height={6} rx={1} fill="url(#samovar)" />
        <path d="M2,6 C-4,14 -4,28 2,34 L20,34 C26,28 26,14 20,6 Z" fill="url(#samovar)" stroke="#5a3a0e" strokeWidth={0.8} />
        <path d="M-1,14 C-6,14 -6,22 -1,22 M23,14 C28,14 28,22 23,22" stroke="#5a3a0e" strokeWidth={1.4} fill="none" />
        <path d="M22,26 L28,27 L28,29" stroke="#5a3a0e" strokeWidth={1.4} fill="none" />
        <rect x={4} y={34} width={14} height={4} fill="#6b4410" />
        <path d="M6,14 C8,12 10,12 11,14" stroke="#fff6d0" strokeWidth={1.4} opacity={0.7} fill="none" />
      </g>
      <g transform="translate(24 -8)">
        <path d="M0,0 L9,0 L8,8 L1,8 Z" fill="#f4f0e4" stroke="#8a2a24" strokeWidth={0.6} />
        <path d="M9,2 C12,2 12,6 8.6,6" stroke="#8a2a24" strokeWidth={0.8} fill="none" />
        <ellipse cx={4.5} cy={0.4} rx={4.5} ry={1} fill="#7a3a14" />
      </g>
      <circle cx={46} cy={-3} r={3.4} fill="#c9853a" />
      <circle cx={44} cy={-4.5} r={2.6} fill="#e0a25a" />
    </g>
  );
}

/** Ковёр на пол перед шконкой. */
export function FloorCarpet() {
  return (
    <g>
      <path d="M92,242 L300,242 L326,278 L66,278 Z" fill="#7e1d22" />
      <path d="M100,245 L292,245 L314,275 L78,275 Z" fill="none" stroke="#d4a64e" strokeWidth={2} />
      <path d="M108,248 L284,248 L302,272 L90,272 Z" fill="#9c2a2c" stroke="#233462" strokeWidth={2.5} />
      <ellipse cx={196} cy={260} rx={46} ry={8} fill="#233462" stroke="#d4a64e" strokeWidth={1.2} />
      <ellipse cx={196} cy={260} rx={24} ry={4} fill="#d4a64e" />
      <path d="M92,242 L300,242 L326,278 L66,278 Z" filter="url(#sc-grime)" opacity={0.5} />
    </g>
  );
}

/** Шкура медведя с головой. */
export function BearSkin() {
  return (
    <g>
      <path
        d="M104,256 C96,246 110,240 122,246 C130,238 150,240 160,244 C190,238 230,238 252,246 C262,240 276,244 272,252 C286,254 290,264 278,268 C282,276 270,280 260,272 C230,280 170,280 140,274 C128,282 112,280 116,270 C102,270 98,262 104,256 Z"
        fill="#5a3a22"
        stroke="#2a1a0e"
        strokeWidth={1}
      />
      <path d="M130,252 C170,246 220,246 262,254 C230,270 170,272 130,262 Z" fill="#6e4a2c" opacity={0.8} />
      <rect x={96} y={238} width={196} height={44} filter="url(#sc-grime)" opacity={0.5} />
      {/* голова справа */}
      <g transform="translate(284 258)">
        <ellipse cx={8} cy={0} rx={14} ry={10} fill="#5a3a22" stroke="#2a1a0e" strokeWidth={1} />
        <circle cx={-2} cy={-9} r={4} fill="#5a3a22" stroke="#2a1a0e" strokeWidth={0.8} />
        <circle cx={14} cy={-9} r={4} fill="#5a3a22" stroke="#2a1a0e" strokeWidth={0.8} />
        <ellipse cx={17} cy={3} rx={6} ry={4.5} fill="#8a6a4a" />
        <ellipse cx={21} cy={2} rx={2} ry={1.4} fill="#111" />
        <circle cx={6} cy={-2} r={1.2} fill="#111" />
        <circle cx={13} cy={-3} r={1.2} fill="#111" />
        <path d="M14,7 L16,10 L18,7" fill="#eee" />
      </g>
    </g>
  );
}

/** Бархатные шторы с ламбрекеном и подхватами. */
export function Drapes() {
  return (
    <g>
      <rect x={238} y={34} width={112} height={4} fill="#c49a48" />
      <path d="M240,38 C246,70 244,100 252,128 L270,128 C262,100 268,70 262,38 Z" fill="#6a1020" />
      <path d="M348,38 C342,70 344,100 336,128 L318,128 C326,100 320,70 326,38 Z" fill="#6a1020" />
      <path d="M244,42 C250,70 250,100 256,126 M344,42 C338,70 338,100 332,126" stroke="#3a0810" strokeWidth={2} opacity={0.6} fill="none" />
      <path d="M252,44 C256,72 256,100 262,126 M336,44 C332,72 332,100 326,126" stroke="#a02a3a" strokeWidth={1.2} opacity={0.6} fill="none" />
      {/* ламбрекен */}
      <path d="M238,38 L350,38 L350,46 C336,56 322,56 308,46 C294,56 280,56 266,46 C256,54 246,54 238,46 Z" fill="#7e1426" stroke="#c49a48" strokeWidth={1} />
      {/* подхваты */}
      <path d="M248,92 C254,96 262,96 268,92" stroke="#e0b860" strokeWidth={2.4} fill="none" />
      <path d="M340,92 C334,96 326,96 320,92" stroke="#e0b860" strokeWidth={2.4} fill="none" />
      <circle cx={268} cy={93} r={2} fill="#e0b860" />
      <circle cx={320} cy={93} r={2} fill="#e0b860" />
    </g>
  );
}

/** Табурет с тазиком в углу. */
export function Stool() {
  return (
    <g transform="translate(318 196)">
      <rect x={-2} y={36} width={40} height={6} fill="#000" opacity={0.4} filter="url(#sc-blur-s)" />
      <rect x={0} y={8} width={34} height={5} fill="url(#sc-wood)" stroke="#2a1a0e" strokeWidth={0.8} />
      <path d="M4,13 L2,40 M30,13 L32,40 M8,13 L10,38 M26,13 L24,38" stroke="#4a2f1e" strokeWidth={2.4} />
      <path d="M-2,8 C0,0 34,0 36,8 Z" fill="#9aa3a8" stroke="#555" strokeWidth={0.8} />
      <ellipse cx={17} cy={2} rx={17} ry={3} fill="#b8c2c6" stroke="#555" strokeWidth={0.6} />
      <ellipse cx={17} cy={2.4} rx={13} ry={2} fill="#6f8a96" opacity={0.7} />
      <path d="M26,-4 C30,-10 34,-6 30,0" stroke="#e8e0cc" strokeWidth={2} fill="none" />
    </g>
  );
}

/** Мини-бар: шкафчик со стеклом и бутылками. */
export function MiniBar() {
  return (
    <g transform="translate(314 150)">
      <rect x={-3} y={80} width={46} height={10} fill="#000" opacity={0.45} filter="url(#sc-blur-s)" />
      <rect width={42} height={86} rx={2} fill="url(#sc-wood)" stroke="#2a1a0e" strokeWidth={1} />
      <rect x={4} y={6} width={34} height={44} fill="#1a1410" />
      {[0, 1].map((row) =>
        [0, 1, 2, 3].map((k) => {
          const x = 7 + k * 8;
          const y = 8 + row * 21;
          const c = ['#2d5a2a', '#7a3a14', '#b8b0a0', '#5a1420'][(k + row) % 4];
          return (
            <g key={`${row}${k}`}>
              <rect x={x} y={y + 6} width={5.5} height={13} rx={1.2} fill={c} />
              <rect x={x + 1.8} y={y + 1} width={2} height={6} fill={c} />
              <rect x={x + 0.5} y={y + 10} width={4.5} height={4} fill="#e8dcc0" opacity={0.8} />
            </g>
          );
        }),
      )}
      <rect x={4} y={6} width={34} height={44} fill="url(#sc-glass)" stroke="#8a6a3a" strokeWidth={1} />
      <rect x={4} y={54} width={34} height={28} fill="#5b3a24" stroke="#2a1a0e" strokeWidth={0.8} />
      <circle cx={21} cy={68} r={1.6} fill="#c9a86a" />
      {/* бокалы наверху */}
      <path d="M8,-10 L14,-10 L11,-4 Z M11,-4 V0 M8,0 H14" stroke="#cfe6f0" strokeWidth={0.8} fill="#cfe6f0" fillOpacity={0.3} />
      <path d="M26,-14 h6 v14 h-6 Z" fill="#2d5a2a" />
      <rect x={28} y={-18} width={2} height={5} fill="#2d5a2a" />
    </g>
  );
}

/** Спорт — в левом углу перед шконкой. */
export function Sport({ kind }: { kind: string }) {
  if (kind === 'f_dumbbells') {
    return (
      <g transform="translate(34 256)">
        <ellipse cx={20} cy={10} rx={26} ry={4} fill="#000" opacity={0.35} />
        {[0, 1].map((k) => (
          <g key={k} transform={`translate(${k * 22} ${k * 4}) rotate(${k ? -8 : 6})`}>
            <rect x={0} y={0} width={4} height={10} rx={1.5} fill="#5d8aa6" opacity={0.9} />
            <rect x={14} y={0} width={4} height={10} rx={1.5} fill="#5d8aa6" opacity={0.9} />
            <rect x={3} y={4} width={12} height={2.4} fill="#8a6a44" />
            <rect x={0.6} y={1} width={1.2} height={8} fill="#fff" opacity={0.4} />
          </g>
        ))}
      </g>
    );
  }
  if (kind === 'f_bench') {
    return (
      <g transform="translate(14 222)">
        <ellipse cx={50} cy={46} rx={56} ry={5} fill="#000" opacity={0.4} />
        <rect x={8} y={22} width={84} height={8} rx={3} fill="#3a2a22" stroke="#15100c" strokeWidth={0.8} />
        <path d="M16,30 L14,46 M84,30 L86,46" stroke="#2b2b2b" strokeWidth={3} />
        <path d="M22,22 L22,4 M78,22 L78,4" stroke="#444" strokeWidth={2.4} />
        <rect x={0} y={1} width={100} height={3} fill="url(#sc-steel)" />
        <rect x={2} y={-6} width={7} height={17} rx={1.5} fill="#1d1d1d" />
        <rect x={91} y={-6} width={7} height={17} rx={1.5} fill="#1d1d1d" />
      </g>
    );
  }
  if (kind === 'f_bag') {
    return (
      <g transform="translate(98 110)">
        <path d="M22,0 L22,160 M22,0 L0,0 M14,160 L30,160" stroke="#3a3a3a" strokeWidth={3} />
        <path d="M0,0 L0,14" stroke="#888" strokeWidth={1} strokeDasharray="1.5 1" />
        <g className="bag-swing">
          <rect x={-10} y={14} width={20} height={62} rx={8} fill="#7a2020" stroke="#3a0e0e" strokeWidth={1} />
          <path d="M-10,26 H10 M-10,64 H10" stroke="#3a0e0e" strokeWidth={1.4} />
          <path d="M-6,20 C-8,40 -8,56 -6,72" stroke="#b84a3a" strokeWidth={2} opacity={0.6} fill="none" />
        </g>
        <ellipse cx={22} cy={162} rx={18} ry={3} fill="#000" opacity={0.4} />
      </g>
    );
  }
  // тренажёр
  return (
    <g transform="translate(10 118)">
      <ellipse cx={58} cy={152} rx={64} ry={6} fill="#000" opacity={0.45} />
      <path d="M8,150 L8,4 L108,4 L108,150 M8,150 H108" stroke="#2b2f33" strokeWidth={4} fill="none" />
      <path d="M8,4 L40,4" stroke="#c9302c" strokeWidth={4} />
      {/* стопка блинов */}
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={86} y={96 + i * 5.6} width={18} height={4.8} fill="#2a2a2a" stroke="#555" strokeWidth={0.5} />
      ))}
      <path d="M95,6 V96" stroke="#aaa" strokeWidth={1} />
      <path d="M40,6 C40,30 60,40 70,34" stroke="#888" strokeWidth={0.9} fill="none" />
      <rect x={30} y={96} width={40} height={10} rx={4} fill="#1d1d1d" />
      <rect x={34} y={48} width={8} height={48} rx={3} fill="#1d1d1d" />
      <path d="M66,34 L80,34" stroke="#1d1d1d" strokeWidth={4} strokeLinecap="round" />
      <path d="M50,106 L50,148" stroke="#2b2f33" strokeWidth={3} />
      <text x={58} y={20} fontSize={7} textAnchor="middle" fill="#c9302c" fontWeight="bold">
        КАЧАЛКА
      </text>
    </g>
  );
}

/** Живность: таракан в спичечном коробке, кот на шконке, попугай на окне. */
export function Pet({ kind }: { kind: string }) {
  if (kind === 'f_roach') {
    return (
      <g transform="translate(292 262)">
        <rect x={0} y={0} width={16} height={9} fill="#d9c9a0" stroke="#6b5a3a" strokeWidth={0.6} />
        <rect x={2} y={2} width={12} height={5} fill="#b84a2a" />
        <text x={8} y={6} fontSize={3} textAnchor="middle" fill="#fff">
          СПИЧКИ
        </text>
        <g className="roach">
          <ellipse cx={24} cy={6} rx={3.4} ry={1.8} fill="#5a2a10" />
          <path d="M27,5 L31,2 M27,7 L31,9 M22,4 L20,2 M22,8 L20,10 M24,4 L24,2 M24,8 L24,10" stroke="#3a1a08" strokeWidth={0.5} />
        </g>
      </g>
    );
  }
  if (kind === 'f_cat') {
    return (
      <g transform="translate(118 132)">
        <ellipse cx={14} cy={12} rx={16} ry={7} fill="#6d6a66" />
        <path d="M-2,10 C-10,8 -12,2 -8,0" className="cat-tail" stroke="#6d6a66" strokeWidth={3.4} strokeLinecap="round" fill="none" />
        <circle cx={28} cy={6} r={6.4} fill="#7a7672" />
        <path d="M23,2 L24,-5 L28,0 Z M30,0 L33,-5 L34,2 Z" fill="#7a7672" />
        <path d="M25,6 q1.4,-1 2.8,0 M30,6 q1.4,-1 2.8,0" stroke="#222" strokeWidth={0.8} fill="none" />
        <circle cx={30} cy={9} r={0.8} fill="#d88" />
        <path d="M8,8 C10,6 12,6 14,8 M16,9 C18,7 20,7 22,9" stroke="#55524e" strokeWidth={0.9} fill="none" />
      </g>
    );
  }
  // попугай в клетке на подоконнике
  return (
    <g transform="translate(262 84)">
      <path d="M0,34 L0,10 C0,-2 24,-2 24,10 L24,34 Z" fill="none" stroke="#c9a040" strokeWidth={1} />
      {[4, 8, 12, 16, 20].map((x) => (
        <path key={x} d={`M${x},34 L${x},${x < 6 || x > 18 ? 4 : 1}`} stroke="#c9a040" strokeWidth={0.6} />
      ))}
      <rect x={-2} y={33} width={28} height={3} fill="#8a6a2a" />
      <path d="M12,-4 V0" stroke="#c9a040" strokeWidth={1} />
      <path d="M4,22 H20" stroke="#8a6a2a" strokeWidth={1} />
      <g className="parrot">
        <ellipse cx={12} cy={16} rx={4.4} ry={6} fill="#3fae4a" />
        <circle cx={12} cy={9} r={3.4} fill="#4cc25a" />
        <path d="M14.5,9 L17,10.5 L14.5,11.5 Z" fill="#f2c14e" />
        <circle cx={13} cy={8.4} r={0.7} fill="#111" />
        <path d="M11,21 L10,27 L13,22 Z" fill="#2a7ac2" />
        <path d="M9,14 C8,17 9,20 11,21" stroke="#2f8a3a" strokeWidth={1} fill="none" />
      </g>
    </g>
  );
}

/** Музыка: гитара и баян лежат на шконке, магнитофон и музыкальный центр — под ней. */
export function Music({ kind }: { kind: string }) {
  if (kind === 'f_guitar')
    return (
      <g transform="translate(66 138) rotate(-8)">
        <ellipse cx={10} cy={10} rx={10.5} ry={8} fill="#a8622a" stroke="#2a1608" strokeWidth={1} />
        <ellipse cx={24} cy={10} rx={8} ry={6.4} fill="#a8622a" stroke="#2a1608" strokeWidth={1} />
        <ellipse cx={16} cy={10} rx={6} ry={5.4} fill="#a8622a" />
        <circle cx={18} cy={10} r={3} fill="#2a1608" />
        <rect x={31} y={8} width={30} height={4} fill="#4a2a14" stroke="#1a0e06" strokeWidth={0.6} />
        <path d="M61,7 L68,5.6 L68,14.4 L61,13 Z" fill="#3a2010" />
        <path d="M6,10 H63" stroke="#e8e0c8" strokeWidth={0.35} />
        <path d="M44,8 C42,3 38,4 40,8 C38,12 42,13 44,12 M44,8 L48,3 M44,12 L48,16" stroke="#c0302c" strokeWidth={1.4} fill="none" />
        <ellipse cx={10} cy={7} rx={6} ry={2.4} fill="#fff" opacity={0.18} />
      </g>
    );
  if (kind === 'f_bayan')
    return (
      <g transform="translate(70 124)">
        <rect x={0} y={4} width={12} height={24} rx={2} fill="#2a2a2e" stroke="#0e0e10" strokeWidth={0.8} />
        {[8, 13, 18, 23].map((y) => (
          <circle key={y} cx={6} cy={y} r={1.4} fill="#e8e4d8" />
        ))}
        <rect x={12} y={6} width={26} height={20} fill="#8a1c22" />
        {[15, 19, 23, 27, 31, 35].map((x) => (
          <path key={x} d={`M${x},6 V26`} stroke="#3a0a0e" strokeWidth={1.2} />
        ))}
        <path d="M12,6 H38 M12,26 H38" stroke="#e8c35a" strokeWidth={1} />
        <rect x={38} y={2} width={16} height={28} rx={2} fill="#1e1e22" stroke="#0e0e10" strokeWidth={0.8} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={41} y={5 + i * 4} width={10} height={2.6} rx={0.6} fill={i % 2 ? '#1a1a1a' : '#f2eee4'} stroke="#555" strokeWidth={0.3} />
        ))}
        <path d="M2,4 C10,-4 44,-6 52,2" stroke="#5a3a1c" strokeWidth={1.4} fill="none" />
      </g>
    );
  if (kind === 'f_tape')
    return (
      <g transform="translate(76 186)">
        <rect x={-2} y={26} width={54} height={5} fill="#000" opacity={0.4} />
        <path d="M12,0 C12,-6 38,-6 38,0" stroke="#2a2a2e" strokeWidth={2} fill="none" />
        <rect width={50} height={28} rx={3} fill="#b8bcc0" stroke="#3a3e44" strokeWidth={1} />
        <rect x={3} y={3} width={24} height={14} rx={1.6} fill="#1e2226" />
        <g className="reel" style={{ transformOrigin: '10px 10px' }}>
          <circle cx={10} cy={10} r={4.4} fill="#e8e4d8" />
          <path d="M10,6 V14 M6,10 H14" stroke="#555" strokeWidth={1} />
        </g>
        <g className="reel" style={{ transformOrigin: '20px 10px' }}>
          <circle cx={20} cy={10} r={4.4} fill="#e8e4d8" />
          <path d="M20,6 V14 M16,10 H24" stroke="#555" strokeWidth={1} />
        </g>
        <circle cx={39} cy={11} r={8} fill="#2a2e32" />
        <circle cx={39} cy={11} r={6} fill="none" stroke="#555a60" strokeDasharray="1 1" />
        {[4, 10, 16, 22].map((x) => (
          <rect key={x} x={x} y={20} width={4} height={5} rx={0.6} fill="#3a3e44" />
        ))}
        <text x={39} y={25.5} fontSize={3.2} textAnchor="middle" fill="#c0302c" fontWeight="bold">
          ВЕСНА
        </text>
      </g>
    );
  // музыкальный центр с колонками и эквалайзером
  return (
    <g transform="translate(40 182)">
      <rect x={-2} y={30} width={108} height={5} fill="#000" opacity={0.4} />
      {[0, 80].map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <rect width={24} height={32} rx={2} fill="#1a1a1e" stroke="#3a3a40" strokeWidth={0.8} />
          <circle cx={12} cy={10} r={6} fill="#2a2a30" stroke="#55555c" strokeWidth={0.8} />
          <circle cx={12} cy={23} r={4.4} fill="#2a2a30" stroke="#55555c" strokeWidth={0.8} />
          <circle cx={12} cy={10} r={2} fill="#101014" />
        </g>
      ))}
      <rect x={28} y={4} width={48} height={28} rx={2} fill="#2a2a30" stroke="#55555c" strokeWidth={0.8} />
      <rect x={32} y={8} width={40} height={10} rx={1} fill="#0a1a2a" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={i} className={`eq eq-${i % 4}`} x={34 + i * 4.6} y={9} width={3} height={8} fill={i % 3 ? '#4ac2ff' : '#7affc2'} style={{ transformOrigin: `0 17px` }} />
      ))}
      <rect x={34} y={21} width={36} height={6} rx={1} fill="#1a1a1e" />
      <circle cx={66} cy={24} r={1.2} fill="#ff5a4a" />
    </g>
  );
}

/** Под потолком: бельё на верёвке, вымпелы, часы с кукушкой, рога. */
export function Deco({ kind }: { kind: string }) {
  if (kind === 'f_laundry')
    return (
      <g>
        <path d="M14,12 Q80,24 148,14" stroke="#c8b890" strokeWidth={1} fill="none" />
        <g className="sway">
          <path d="M34,16 L48,17 L50,22 L46,22 L46,34 L36,33 L36,21 L32,21 Z" fill="#dcd6c4" stroke="#6a6450" strokeWidth={0.6} />
          <path d="M66,19 L78,19.4 L77,28 L72,26 L67,28 Z" fill="#3a4a66" stroke="#1e2638" strokeWidth={0.6} />
          <path d="M96,19.6 L100,19.4 L101,32 L96,33 L94,30 L97,29 Z M108,19 L112,19 L113,31 L108,32 L106,29 L109,28 Z" fill="#8a2a24" stroke="#3a0e0a" strokeWidth={0.5} />
          <path d="M124,17 L138,15.4 L138,27 L124,28 Z" fill="#e8e4d8" stroke="#6a6450" strokeWidth={0.6} />
          <path d="M127,17 V28 M131,16.6 V27.6 M135,16.2 V27.2" stroke="#c0302c" strokeWidth={0.8} />
        </g>
      </g>
    );
  if (kind === 'f_pennants')
    return (
      <g>
        <path d="M12,8 Q80,24 150,10" stroke="#3a2a1c" strokeWidth={0.8} fill="none" />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
          const x = 18 + i * 15;
          const y = 8 + Math.sin((i / 8) * Math.PI) * 8;
          return <path key={i} d={`M${x},${y} L${x + 11},${y + 0.4} L${x + 5.6},${y + 12} Z`} fill={i % 2 ? '#f2eee4' : '#b8242a'} stroke="#3a0e0a" strokeWidth={0.4} />;
        })}
        <g transform="translate(64 0)">
          <path d="M0,24 L28,24 L28,40 L14,52 L0,40 Z" fill="#b8242a" stroke="#e8c35a" strokeWidth={1} />
          <path d="M5,28 L23,28 L23,38 L14,46 L5,38 Z" fill="#f2eee4" />
          <path d="M9,32 L19,32 L19,37 L14,42 L9,37 Z" fill="#b8242a" />
          <text x={14} y={36.8} fontSize={4.6} textAnchor="middle" fill="#fff" fontWeight="bold">
            С
          </text>
        </g>
      </g>
    );
  if (kind === 'f_cuckoo')
    return (
      <g transform="translate(152 1) scale(0.82)">
        <path d="M-2,12 L14,0 L30,12 Z" fill="#4a2a14" stroke="#1a0e06" strokeWidth={0.8} />
        <rect x={1} y={12} width={26} height={24} fill="#7a4a24" stroke="#1a0e06" strokeWidth={0.8} />
        <rect x={11} y={13} width={6} height={5} fill="#1a0e06" />
        <circle cx={14} cy={27} r={7} fill="#efe6cc" stroke="#1a0e06" strokeWidth={0.6} />
        <path d="M14,27 V22.6 M14,27 L17,28.4" stroke="#1a0e06" strokeWidth={0.8} />
        <path d="M-1,12 L4,4 M29,12 L24,4" stroke="#6a3a1a" strokeWidth={1.4} />
        <g className="pendulum" style={{ transformOrigin: '14px 36px' }}>
          <path d="M14,36 V52" stroke="#c8a24a" strokeWidth={0.8} />
          <circle cx={14} cy={53} r={2.6} fill="#c8a24a" />
        </g>
        <path d="M8,36 V46 M20,36 V44" stroke="#8a8e94" strokeWidth={0.5} />
        <path d="M6.6,46 L9.4,46 L9,51 L7,51 Z M18.6,44 L21.4,44 L21,49 L19,49 Z" fill="#6a4a1a" />
      </g>
    );
  // рога на деревянном щите
  return (
    <g transform="translate(182 4)">
      <path d="M-6,14 C-6,6 6,6 6,14 L6,26 C6,30 -6,30 -6,26 Z" fill="#6a3a1a" stroke="#1a0e06" strokeWidth={0.8} />
      <path d="M-3,12 C-10,6 -16,0 -28,-2 M-14,3 L-18,-6 M-20,0 L-28,-8 M3,12 C10,6 16,0 28,-2 M14,3 L18,-6 M20,0 L28,-8" stroke="#1a0e06" strokeWidth={4.4} strokeLinecap="round" fill="none" />
      <path d="M-3,12 C-10,6 -16,0 -28,-2 M-14,3 L-18,-6 M-20,0 L-28,-8 M3,12 C10,6 16,0 28,-2 M14,3 L18,-6 M20,0 L28,-8" stroke="#e8dcbc" strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <circle cx={0} cy={18} r={2} fill="#c8a24a" />
    </g>
  );
}

/** Пёс Мухтар дремлет у шконки и виляет хвостом. */
export function Dog() {
  return (
    <g transform="translate(96 238)">
      <ellipse cx={24} cy={20} rx={28} ry={5} fill="#000" opacity={0.35} />
      <path d="M-2,14 C-10,10 -12,4 -8,2" className="dog-tail" stroke="#8a5a2a" strokeWidth={3.6} strokeLinecap="round" fill="none" />
      <ellipse cx={18} cy={12} rx={20} ry={8} fill="#8a5a2a" stroke="#2a1608" strokeWidth={1} />
      <ellipse cx={14} cy={9} rx={10} ry={4} fill="#1e1410" opacity={0.7} />
      <path d="M30,18 L44,18 M4,18 L16,18" stroke="#6a4020" strokeWidth={4} strokeLinecap="round" />
      <ellipse cx={44} cy={8} rx={8} ry={6.4} fill="#9a6a34" stroke="#2a1608" strokeWidth={1} />
      <path d="M48,10 C54,10 56,13 53,15 C50,16 47,14 47,12 Z" fill="#9a6a34" stroke="#2a1608" strokeWidth={0.8} />
      <circle cx={54} cy={12} r={1.2} fill="#111" />
      <path d="M38,4 C36,-2 40,-4 42,2 Z" fill="#5a3a1a" stroke="#2a1608" strokeWidth={0.8} />
      <path d="M44,8 q1.4,1 2.8,0" stroke="#111" strokeWidth={0.8} fill="none" />
      <path d="M37,13 H43" stroke="#b8242a" strokeWidth={1.6} />
    </g>
  );
}

// --- Полка, плитка, нычка, фото ------------------------------------------------------

/** Полка на стене между шконкой и окном. */
export function Shelf({ kind }: { kind: string }) {
  const books = ['#7a2a22', '#2a4a6a', '#3a5a2a', '#8a6a2a', '#5a2a4a', '#2a2a2a'];
  const carved = kind === 'f_shelf_carved';
  return (
    <g transform="translate(172 128)">
      <rect x={1} y={2} width={68} height={6} fill="#000" opacity={0.3} />
      <rect width={68} height={6} fill={carved ? '#6a3a1c' : kind === 'f_shelf_board' ? '#8a7454' : 'url(#sc-wood)'} stroke="#2a1a0e" strokeWidth={0.8} />
      {carved && <path d="M2,3 H66" stroke="#c49a48" strokeWidth={0.8} strokeDasharray="3 2" />}
      {kind === 'f_shelf_board' ? (
        <>
          <path d="M6,6 L10,14 M62,6 L58,14" stroke="#555" strokeWidth={1.4} />
          <rect x={8} y={-10} width={14} height={10} fill="#d8cfb8" transform="rotate(-8 15 -5)" />
          <rect x={30} y={-14} width={8} height={14} fill="#c8c4b8" stroke="#555" strokeWidth={0.5} />
          <ellipse cx={52} cy={-3} rx={7} ry={3} fill="#9aa0a4" />
        </>
      ) : (
        <>
          {/* книги */}
          {Array.from({ length: kind === 'f_shelf_books' ? 7 : 4 }, (_, k) => {
            const h = 14 + ((k * 5) % 7);
            return <rect key={k} x={4 + k * 5.4} y={-h} width={4.8} height={h} fill={books[k % books.length]} stroke="#1a120a" strokeWidth={0.4} />;
          })}
          {kind === 'f_shelf_books' && <rect x={44} y={-9} width={20} height={9} fill="#5a2a22" transform="rotate(-4 54 -4)" />}
        </>
      )}
      {(kind === 'f_shelf_trophy' || carved) && (
        <g>
          <g transform="translate(34 -20)">
            <path d="M0,0 H12 C12,8 9,11 6,11 C3,11 0,8 0,0 Z" fill="#d6ae4a" stroke="#6a5010" strokeWidth={0.6} />
            <path d="M0,2 C-4,2 -4,7 1,7 M12,2 C16,2 16,7 11,7" stroke="#d6ae4a" strokeWidth={1} fill="none" />
            <rect x={4.5} y={11} width={3} height={5} fill="#b8902e" />
            <rect x={2} y={16} width={8} height={4} fill="#4a2a14" />
          </g>
          <g transform="translate(52 -24)">
            <rect width={16} height={20} fill="#efe8d0" stroke="#b8902e" strokeWidth={1.2} />
            <path d="M3,6 H13 M3,10 H13 M3,14 H10" stroke="#8a2a22" strokeWidth={0.6} />
          </g>
        </g>
      )}
      {carved && (
        <g transform="translate(46 -12)">
          <rect width={20} height={12} fill="#7a4a24" stroke="#2a1a0e" strokeWidth={0.6} />
          <path d="M10,0 V12" stroke="#2a1a0e" strokeWidth={0.6} />
          <circle cx={5} cy={6} r={2} fill="#efe8d0" />
          <circle cx={15} cy={6} r={2} fill="#1a1a1a" />
        </g>
      )}
    </g>
  );
}

/** Плитка/кипятильник на полу между шконкой и столом. */
export function Stove({ kind, onTable }: { kind: string; onTable: boolean }) {
  return (
    <g transform={onTable ? 'translate(250 156)' : 'translate(200 206)'}>
      <rect x={-4} y={26} width={46} height={6} fill="#000" opacity={0.4} filter="url(#sc-blur-s)" />
      {kind === 'f_boiler' && (
        <g transform="translate(8 0)">
          <rect x={0} y={6} width={18} height={24} rx={3} fill="#bcd6dc" opacity={0.7} stroke="#8aa" strokeWidth={0.6} />
          <rect x={1} y={12} width={16} height={17} rx={2} fill="#6a4a1a" opacity={0.7} />
          <path d="M9,-10 V14 C4,16 14,18 9,22" stroke="#555" strokeWidth={1.4} fill="none" />
          <path d="M9,-10 C14,-16 24,-8 30,-2" stroke="#222" strokeWidth={1} fill="none" />
          <path className="steam" d="M5,4 Q2,-4 6,-12" stroke="#fff" strokeWidth={1.4} fill="none" opacity={0.5} />
        </g>
      )}
      {kind === 'f_hotplate' && (
        <g>
          <rect x={0} y={18} width={34} height={12} rx={2} fill="#e8e4da" stroke="#555" strokeWidth={0.6} />
          <ellipse cx={17} cy={18} rx={12} ry={3} fill="#3a3a3a" />
          <path d="M8,18 C6,6 28,6 26,18 Z" fill="#c9302c" stroke="#5a1010" strokeWidth={0.6} />
          <path d="M26,12 L33,6" stroke="#c9302c" strokeWidth={2.4} />
          <circle cx={17} cy={7} r={2} fill="#1a1a1a" />
          <path className="steam" d="M33,4 Q30,-4 34,-12" stroke="#fff" strokeWidth={1.4} fill="none" opacity={0.5} />
        </g>
      )}
      {kind === 'f_microwave' && (
        <g>
          <rect x={-2} y={22} width={42} height={8} fill="#5a3d22" />
          <rect x={0} y={0} width={40} height={22} rx={2} fill="#e8e8e2" stroke="#555" strokeWidth={0.7} />
          <rect x={3} y={3} width={26} height={16} rx={1} fill="#2a2e30" />
          <rect x={4} y={4} width={24} height={14} fill="#f0d070" opacity={0.25} className="lamp-flicker" />
          <rect x={31} y={4} width={6} height={4} fill="#3a8a3a" />
          {[10, 14].map((y) => <circle key={y} cx={34} cy={y} r={1.2} fill="#555" />)}
        </g>
      )}
      {kind === 'f_coffee' && (
        <g>
          <rect x={-2} y={22} width={42} height={8} fill="#3a2416" />
          <rect x={6} y={-8} width={26} height={30} rx={3} fill="#2a2a2e" stroke="#111" strokeWidth={0.7} />
          <rect x={9} y={-5} width={20} height={6} rx={1} fill="#c9a040" />
          <rect x={14} y={4} width={10} height={4} fill="#555" />
          <rect x={15} y={12} width={8} height={9} rx={1} fill="#f1efe6" />
          <path className="steam" d="M19,10 Q16,4 20,-2" stroke="#fff" strokeWidth={1.2} fill="none" opacity={0.5} />
        </g>
      )}
    </g>
  );
}

/** Нычка: в стене, под половицей, в матрасе или сейф под шконкой. */
export function Stash({ kind }: { kind: string }) {
  if (kind === 'f_stash_brick')
    return (
      <g transform="translate(196 178)">
        <rect width={20} height={10} fill="url(#sc-bricks)" stroke="#2a1a10" strokeWidth={0.6} transform="rotate(-6 10 5)" />
        <rect x={2} y={2} width={16} height={7} fill="#1a120c" opacity={0.6} />
        <path d="M6,6 L9,4 L12,6" stroke="#d6ae4a" strokeWidth={1} fill="none" />
      </g>
    );
  if (kind === 'f_stash_floor')
    return (
      <g transform="translate(174 248)">
        <path d="M0,0 L40,0 L42,6 L2,6 Z" fill="#1a0f0a" />
        <path d="M0,0 L40,0 L44,-10 L4,-10 Z" fill="#6a3a24" stroke="#2c130d" strokeWidth={0.8} />
        <rect x={12} y={1} width={10} height={4} fill="#d6ae4a" />
        <rect x={24} y={1} width={8} height={4} fill="#3a7a3a" />
      </g>
    );
  if (kind === 'f_stash_mattress')
    return (
      <g transform="translate(120 162)">
        <path d="M0,0 C4,-3 10,-3 14,0 L14,8 L0,8 Z" fill="#6a5a3a" />
        <rect x={2} y={-5} width={10} height={6} fill="#3a7a3a" stroke="#1a3a1a" strokeWidth={0.5} transform="rotate(-10 7 -2)" />
        <path d="M-2,4 L16,4" stroke="#d8d2c2" strokeWidth={0.8} strokeDasharray="1.5 1.5" />
      </g>
    );
  return (
    <g transform="translate(112 196)">
      <rect x={-2} y={36} width={46} height={6} fill="#000" opacity={0.45} filter="url(#sc-blur-s)" />
      <rect width={40} height={36} rx={2} fill="#3a4448" stroke="#111" strokeWidth={1} />
      <rect x={4} y={4} width={32} height={28} rx={1} fill="#4a565a" stroke="#222" strokeWidth={0.6} />
      <circle cx={20} cy={18} r={6} fill="#8a9296" stroke="#222" strokeWidth={0.8} />
      <path d="M20,12 V14 M20,22 V24 M14,18 H16 M24,18 H26" stroke="#222" strokeWidth={0.8} />
      <rect x={30} y={14} width={3} height={9} rx={1} fill="#c9a040" />
    </g>
  );
}

/** Фото на стене над полкой. */
export function Photos({ kind, tv }: { kind: string; tv: boolean }) {
  // с большим телевизором на стене фото уходят в угол ковра над шконкой
  const [ox, oy] = tv ? [-68, 22] : [0, 0];
  const photo = (x: number, y: number, r: number, tint: string, key: number) => (
    <g key={key} transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x={0.8} y={1} width={16} height={20} fill="#000" opacity={0.3} />
      <rect width={16} height={20} fill="#f1ebd8" />
      <rect x={2} y={2} width={12} height={13} fill={tint} />
      <circle cx={8} cy={7} r={2.6} fill="#8a6a50" />
      <path d="M4,15 C4,10 12,10 12,15 Z" fill="#4a4a50" />
      <path d="M7,-1 L9,-1 L9,2 L7,2 Z" fill="#c9c2a8" opacity={0.8} />
    </g>
  );
  if (kind === 'f_photo_frame')
    return (
      <g transform={`translate(${186 + ox} ${62 + oy})`}>
        <rect x={2} y={2} width={40} height={48} fill="#000" opacity={0.3} />
        <rect width={40} height={48} fill="#c49a48" stroke="#6a5010" strokeWidth={1} />
        <rect x={5} y={5} width={30} height={38} fill="#c9b89a" />
        <circle cx={20} cy={18} r={7} fill="#9a7a5a" />
        <path d="M9,43 C10,30 30,30 31,43 Z" fill="#3a3a44" />
        <path d="M13,16 C14,8 26,8 27,16 L27,22 C24,19 16,19 13,22 Z" fill="#6a4a2a" />
      </g>
    );
  const n = kind === 'f_photo_mom' ? 1 : kind === 'f_photo_family' ? 3 : 4;
  const tints = ['#b8a88a', '#9ab0b8', '#c0a0a0', '#a8b890'];
  return (
    <g>
      {Array.from({ length: n }, (_, i) => photo(180 + ox + i * 15, 70 + oy + (i % 2) * 8, i % 2 ? 6 : -5, tints[i], i))}
      {kind === 'f_photo_girl' && (
        <g transform={`translate(${212 + ox} ${96 + oy})`}>
          <rect width={20} height={13} fill="#efe8d0" stroke="#aaa" strokeWidth={0.5} />
          <path d="M0,0 L10,7 L20,0" stroke="#aaa" strokeWidth={0.5} fill="none" />
          <path d="M8,4 C8,2 10,2 10,4 C10,2 12,2 12,4 C12,6 10,7 10,8 C10,7 8,6 8,4 Z" fill="#c9302c" />
        </g>
      )}
    </g>
  );
}

/** Свой питомец игрока: кот сидит у ног, крыса шныряет вдоль стены, голубь ходит по подоконнику. */
export function PlayerPet({ kind }: { kind: string }) {
  if (kind === 'cat')
    return (
      <g transform="translate(278 248) scale(1.15)">
        <path className="pet-tail" d="M16,20 C26,22 30,14 26,8" stroke="#c77a2e" strokeWidth={3.2} strokeLinecap="round" fill="none" />
        <ellipse cx={10} cy={16} rx={9} ry={8} fill="#d88a3a" />
        <path d="M4,12 q6,-3 12,0 M3,17 q7,-3 14,0" stroke="#a8641f" strokeWidth={1.2} fill="none" />
        <g className="pet-head">
          <circle cx={10} cy={4} r={6} fill="#e09444" />
          <path d="M5,0 L5,-7 L9,-2 Z M11,-2 L15,-7 L15,0 Z" fill="#e09444" />
          <path d="M6,-1 L6,-4 L8,-2 Z M12,-2 L14,-4 L14,-1 Z" fill="#f2b8a0" />
          <ellipse cx={7.6} cy={3.4} rx={1.1} ry={1.5} fill="#2a3a1a" />
          <ellipse cx={12.4} cy={3.4} rx={1.1} ry={1.5} fill="#2a3a1a" />
          <path d="M9.2,6 L10.8,6 L10,7 Z" fill="#c45a5a" />
          <path d="M3,6 H7 M13,6 H17" stroke="#fff" strokeWidth={0.35} />
        </g>
        <ellipse cx={6} cy={23} rx={2.6} ry={1.4} fill="#e8a050" />
        <ellipse cx={14} cy={23} rx={2.6} ry={1.4} fill="#e8a050" />
      </g>
    );
  if (kind === 'rat')
    return (
      <g className="pet-rat" transform="translate(40 262)">
        <path d="M-2,2 C-12,4 -18,0 -22,4" stroke="#c99a9a" strokeWidth={1.2} fill="none" />
        <ellipse cx={6} cy={0} rx={9} ry={5} fill="#7d7570" />
        <path d="M14,-2 L20,1 L14,3 Z" fill="#8a827c" />
        <circle cx={20} cy={1} r={0.9} fill="#e0a0a0" />
        <circle cx={12} cy={-4} r={2.4} fill="#c99a9a" />
        <circle cx={15.4} cy={-0.6} r={0.8} fill="#111" />
        <path d="M2,4 v2 M9,4 v2" stroke="#5a5450" strokeWidth={1} />
      </g>
    );
  return (
    <g className="pet-pigeon" transform="translate(228 118)">
      <ellipse cx={0} cy={0} rx={7} ry={5} fill="#8b93a0" />
      <path d="M-6,-1 L-12,2 L-6,3 Z" fill="#5d6470" />
      <path d="M-3,-2 C0,-5 4,-4 5,-1" stroke="#6a7280" strokeWidth={1.2} fill="none" />
      <g className="pet-head">
        <circle cx={6} cy={-5} r={3.4} fill="#7a8290" />
        <path d="M4,-2 C5,0 7,0 8,-2" stroke="#5bb08a" strokeWidth={1.4} fill="none" />
        <path d="M9,-5.6 L11.6,-4.6 L9,-4 Z" fill="#d9a07a" />
        <circle cx={7.2} cy={-5.8} r={0.7} fill="#d0502a" />
      </g>
      <path d="M-1,5 v3 M2,5 v3" stroke="#c0605a" strokeWidth={0.9} />
    </g>
  );
}

/** Праздник в хате: ёлка с огоньками, звезда с флажками на 23 февраля, корзинка крашенок на Пасху. */
export function HolidayDeco({ kind }: { kind: string }) {
  if (kind === 'tree') {
    const lights: [number, number, string][] = [[0, 14, '#f2c14e'], [-8, 28, '#e04a3a'], [7, 32, '#4ab0e0'], [-12, 46, '#f2c14e'], [10, 48, '#e04a3a'], [-2, 40, '#7ae04a'], [-16, 62, '#4ab0e0'], [14, 62, '#f2c14e'], [0, 58, '#e04a3a']];
    return (
      <g transform="translate(140 188)">
        <rect x={-3} y={70} width={6} height={8} fill="#5a3a1a" />
        <path d="M-12,78 H12 L9,84 H-9 Z" fill="#8a2a1a" />
        <path d="M0,4 L-12,26 H-6 L-18,46 H-10 L-24,72 H24 L10,46 H18 L6,26 H12 Z" fill="#1f6a34" stroke="#0e3a1a" strokeWidth={1} />
        <path d="M-6,26 H6 M-10,46 H10" stroke="#2f8a4a" strokeWidth={1.2} />
        <path d="M-10,22 Q2,30 9,24 M-15,42 Q0,52 15,42 M-20,64 Q0,74 20,64" stroke="#c9c9d9" strokeWidth={0.8} fill="none" opacity={0.8} />
        {lights.map(([x, y, c], i) => (
          <circle key={i} className="tree-light" cx={x} cy={y} r={2} fill={c} />
        ))}
        <path d="M0,-4 L2,1 L7,1 L3,4 L5,9 L0,6 L-5,9 L-3,4 L-7,1 L-2,1 Z" fill="#f2c14e" stroke="#a07a1a" strokeWidth={0.5} />
        <circle cx={-20} cy={80} r={4} fill="#f08a1a" />
        <circle cx={-14} cy={82} r={3.4} fill="#f59a2a" />
        <path d="M-20,76 l1,-2" stroke="#3a7a2a" strokeWidth={1} />
      </g>
    );
  }
  if (kind === 'feb23')
    return (
      <g transform="translate(118 46)">
        <path d="M0,0 Q40,10 80,0" stroke="#3a3a3a" strokeWidth={0.6} fill="none" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M${6 + i * 11},${2 + Math.sin(i / 2) * 2} l4,9 l4,-9 Z`} fill={i % 2 ? '#c0302c' : '#4a6a2a'} />
        ))}
        <g transform="translate(40 26)">
          <circle r={11} fill="#c0302c" stroke="#8a1a1a" />
          <path d="M0,-8 L2.3,-2.5 L8,-2.5 L3.5,1.2 L5,7 L0,3.6 L-5,7 L-3.5,1.2 L-8,-2.5 L-2.3,-2.5 Z" fill="#f2c14e" />
        </g>
      </g>
    );
  if (kind === 'easter')
    return (
      <g transform="translate(138 248)">
        <path d="M-16,0 Q0,-24 16,0" stroke="#8a5a2a" strokeWidth={2} fill="none" />
        <ellipse cx={-7} cy={0} rx={4.6} ry={6} fill="#c0302c" />
        <ellipse cx={1} cy={-2} rx={4.6} ry={6} fill="#4a8ac0" />
        <ellipse cx={8} cy={0} rx={4.6} ry={6} fill="#e0b040" />
        <path d="M-1,-3 h4 M-1,-1 h4" stroke="#fff" strokeWidth={0.6} />
        <path d="M-17,2 H17 L13,14 H-13 Z" fill="#a8763a" stroke="#6a4a1a" strokeWidth={0.8} />
        <path d="M-15,6 H15 M-14,10 H14" stroke="#7a5a2a" strokeWidth={0.7} />
      </g>
    );
  return null;
}
