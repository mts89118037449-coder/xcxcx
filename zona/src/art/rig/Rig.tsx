// Персонаж-кукла на скелете (cutout-анимация): торс, голова, руки и ноги — отдельные части,
// повёрнутые вокруг суставов. Одежда рисуется поверх тех же частей и двигается вместе с ними.
// Швов не видно: у каждой конечности сначала общий контур всех её частей, потом заливка.
// Система координат как у старых поз: 120×210, ступни на y=210, центр x=60, лицом вправо.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { faceParts } from '../../../shared/content.ts';
import type { Look } from '../../../shared/types.ts';
import { FEET, HAIR_COLORS, HATS, LEGS, SKIN_TONES, TOPS, type LegWear, type Pattern, type TopWear } from './wear.ts';

// --- Матрицы -------------------------------------------------------------------

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const R = (deg: number): M => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
};
const S = (x: number, y = x): M => [x, 0, 0, y, 0, 0];
const mat = (m: M) => `matrix(${m.map((v) => +v.toFixed(3)).join(' ')})`;

// --- Поза ---------------------------------------------------------------------------
// Углы в градусах поворота SVG: у опущенной конечности «+» уводит её назад (влево), «−» — вперёд.
// Колено «+» сгибает голень назад, локоть «−» сгибает предплечье вперёд.

export interface Pose {
  x: number;
  y: number; // смещение таза вниз
  root: number; // поворот всего тела вокруг таза
  lean: number; // наклон корпуса
  neck: number;
  head: number;
  nS: number; nE: number; nW: number; // ближняя рука
  fS: number; fE: number; fW: number; // дальняя рука
  nH: number; nK: number; nA: number; // ближняя нога
  fH: number; fK: number; fA: number; // дальняя нога
  fist: number; // 0 — ладонь, 1 — кулак
  mouth: number; // 0 — сжат, 1 — открыт (крик, радость)
  brow: number; // −1 — грустно, 0 — спокойно, 1 — злой
}

const P0: Pose = {
  x: 0, y: 0, root: 0, lean: 0, neck: 0, head: 0,
  nS: -3, nE: -10, nW: 0, fS: 6, fE: -12, fW: 0,
  nH: -4, nK: 3, nA: 0, fH: 5, fK: 2, fA: 0,
  fist: 0, mouth: 0, brow: 0,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a };
  for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = lerp(a[k], b[k], t);
  return o;
}
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export type RigAnim = 'idle' | 'walk' | 'run' | 'sit' | 'floor' | 'guard' | 'punch' | 'hit' | 'ko' | 'cheer' | 'work' | 'crossed' | 'pullup';

/** Поза в момент t (мс с начала анимации). */
export function poseAt(anim: RigAnim, t: number): Pose {
  const s = t / 1000;
  switch (anim) {
    case 'idle': {
      const b = Math.sin(s * 2.1);
      return { ...P0, y: b * 0.6, lean: b * 0.8, nS: -3 + b * 1.5, fS: 6 - b * 1.5, head: Math.sin(s * 0.7) * 2 };
    }
    case 'crossed': {
      const b = Math.sin(s * 2.1);
      return { ...P0, y: b * 0.5, lean: 2 + b * 0.6, nS: 16, nE: 34, nW: 10, fS: 20, fE: 30, fW: 10, nH: -7, fH: 9, head: -4 + Math.sin(s * 0.6) * 2, brow: 0.6 };
    }
    case 'walk':
    case 'run': {
      const run = anim === 'run';
      const ph = s * Math.PI * 2 * (run ? 1.7 : 1.15);
      const sw = run ? 34 : 24;
      const leg = (k: number) => {
        const a = ph + k;
        return { h: -sw * Math.cos(a), k: 6 + (run ? 55 : 34) * Math.max(0, Math.sin(a)), a: -6 * Math.cos(a) };
      };
      const n = leg(0);
      const f = leg(Math.PI);
      return {
        ...P0,
        y: -(run ? 3 : 2) * Math.abs(Math.sin(ph)) + (run ? 4 : 0),
        lean: run ? -10 : -2,
        nH: n.h, nK: n.k, nA: n.a, fH: f.h, fK: f.k, fA: f.a,
        nS: (run ? 40 : 20) * Math.cos(ph), nE: run ? -80 : -18 - 10 * Math.max(0, -Math.cos(ph)),
        fS: -(run ? 40 : 20) * Math.cos(ph), fE: run ? -80 : -18 - 10 * Math.max(0, Math.cos(ph)),
        fist: run ? 1 : 0,
        head: run ? 4 : 0,
      };
    }
    case 'sit': {
      const b = Math.sin(s * 1.9);
      return { ...P0, y: 44 + b * 0.4, lean: -4 + b * 0.8, nH: -84, nK: 82, nA: -2, fH: -78, fK: 84, fA: -4, nS: -26, nE: -34, fS: -18, fE: -40, head: 4 + Math.sin(s * 0.5) * 3 };
    }
    case 'floor': {
      const b = Math.sin(s * 1.6);
      return { ...P0, y: 86 + b * 0.5, lean: 10, nH: -80, nK: 30, nA: -10, fH: -70, fK: 60, nS: 30, nE: -20, fS: 36, fE: -10, head: 14, brow: -1 };
    }
    case 'guard': {
      const b = Math.sin(s * 5);
      return { ...P0, y: 7 + b * 1.2, lean: -7, nH: -20, nK: 22, nA: 8, fH: 16, fK: 14, fA: -6, nS: -44, nE: -96, nW: -8, fS: -52, fE: -118, fW: -8, fist: 1, head: 6, brow: 1 };
    }
    case 'punch': {
      // быстрый выпад ближней рукой и возврат в стойку
      const g = poseAt('guard', t);
      const hit: Pose = { ...g, x: 10, lean: -16, nS: -92, nE: -4, nW: 0, nH: -28, nK: 16, fH: 22, fK: 8, head: 2, mouth: 1 };
      const k = s < 0.12 ? ease(s / 0.12) : s < 0.3 ? 1 : s < 0.55 ? 1 - ease((s - 0.3) / 0.25) : 0;
      return mix(g, hit, k);
    }
    case 'hit': {
      const g = poseAt('guard', t);
      const rec: Pose = { ...g, x: -6, lean: 14, head: -14, nS: -20, nE: -80, fS: 0, fE: -70, brow: -1, mouth: 1 };
      const k = s < 0.1 ? ease(s / 0.1) : s < 0.5 ? 1 - ease((s - 0.1) / 0.4) : 0;
      return mix(g, rec, k);
    }
    case 'ko': {
      const k = Math.min(1, ease(s / 0.5));
      const lie: Pose = { ...P0, root: -86, y: 84, x: 34, lean: 0, nS: -150, nE: -20, fS: -170, fE: -10, nH: -6, nK: 10, fH: 4, fK: 18, head: -8, brow: -1 };
      return mix(poseAt('guard', 0), lie, k);
    }
    case 'cheer': {
      const b = Math.abs(Math.sin(s * 5));
      return { ...P0, y: -b * 5, nS: -118, nE: -52, fS: -150, fE: -30, fist: 1, mouth: 1, brow: 0.4, nH: -6, fH: 8, nK: b * 6 };
    }
    case 'work': {
      const b = Math.sin(s * 5.2);
      return { ...P0, y: 6, lean: -18 + b * 4, nH: -22, nK: 20, fH: 18, fK: 6, nS: -62 + b * 14, nE: -34, fS: -52 + b * 14, fE: -40, fist: 1, head: 8 };
    }
    case 'pullup': {
      const b = (Math.sin(s * 4) + 1) / 2;
      return { ...P0, y: -30 * b, nS: -178, nE: -10 + 70 * b, fS: -176, fE: -8 + 70 * b, fist: 1, nH: 4, nK: 20, fH: 8, fK: 26, brow: 1 };
    }
  }
}

// --- Общие часы: одна анимация кадров на все риги на экране ---------------------------

const subs = new Set<(t: number) => void>();
let raf = 0;
function loop(t: number) {
  subs.forEach((f) => f(t));
  raf = subs.size ? requestAnimationFrame(loop) : 0;
}
function useClock(on: boolean) {
  const [t, setT] = useState(() => performance.now());
  useEffect(() => {
    if (!on) return;
    let last = 0;
    const f = (now: number) => {
      if (now - last > 33) {
        last = now;
        setT(now);
      }
    };
    subs.add(f);
    if (!raf) raf = requestAnimationFrame(loop);
    return () => {
      subs.delete(f);
    };
  }, [on]);
  return t;
}

// --- Материалы: цвет, узор, светотень ---------------------------------------------------

const INK = '#1b130d';

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Узоры — в координатах части тела, поэтому полоски идут поперёк руки, как на настоящей ткани. */
function PatternDef({ id, p, c1, c2 }: { id: string; p: Pattern; c1: string; c2: string }) {
  switch (p) {
    case 'hstripes':
      return (
        <pattern id={id} width={8} height={5} patternUnits="userSpaceOnUse">
          <rect width={8} height={5} fill={c1} />
          <rect y={3.2} width={8} height={1.8} fill={c2} />
        </pattern>
      );
    case 'wstripes':
      return (
        <pattern id={id} width={8} height={8} patternUnits="userSpaceOnUse">
          <rect width={8} height={8} fill={c1} />
          <rect y={4} width={8} height={4} fill={c2} />
        </pattern>
      );
    case 'camo':
      return (
        <pattern id={id} width={26} height={24} patternUnits="userSpaceOnUse">
          <rect width={26} height={24} fill={c1} />
          <path d="M2,3 C8,0 12,6 8,9 C4,12 -1,7 2,3 Z M14,12 C20,9 25,14 21,18 C17,22 11,17 14,12 Z" fill={c2} />
          <path d="M16,1 C19,0 22,3 19,5 C16,7 13,3 16,1 Z M3,16 C6,14 9,18 6,21 C3,23 0,19 3,16 Z" fill={shade(c1, 0.25)} />
        </pattern>
      );
    case 'quilt':
      return (
        <pattern id={id} width={9} height={9} patternUnits="userSpaceOnUse">
          <rect width={9} height={9} fill={c1} />
          <path d="M0,0 L9,9 M9,0 L0,9" stroke={shade(c1, -0.4)} strokeWidth={0.6} />
          <circle cx={4.5} cy={4.5} r={3} fill={shade(c1, 0.08)} />
        </pattern>
      );
    case 'puffer':
      return (
        <pattern id={id} width={10} height={7} patternUnits="userSpaceOnUse">
          <rect width={10} height={7} fill={shade(c1, -0.25)} />
          <rect y={0.6} width={10} height={5.6} rx={2.8} fill={c1} />
          <rect y={1.4} width={10} height={1.4} fill={shade(c1, 0.15)} />
        </pattern>
      );
    case 'denim':
      return (
        <pattern id={id} width={3} height={3} patternUnits="userSpaceOnUse">
          <rect width={3} height={3} fill={c1} />
          <path d="M0,3 L3,0" stroke={shade(c1, 0.15)} strokeWidth={0.5} />
        </pattern>
      );
    case 'burlap':
      return (
        <pattern id={id} width={4} height={4} patternUnits="userSpaceOnUse">
          <rect width={4} height={4} fill={c1} />
          <path d="M0,1 H4 M1,0 V4" stroke={shade(c1, -0.2)} strokeWidth={0.7} />
        </pattern>
      );
    case 'fur':
      return (
        <pattern id={id} width={6} height={6} patternUnits="userSpaceOnUse">
          <rect width={6} height={6} fill={c1} />
          <path d="M1,5 L2,2 M4,6 L5,3" stroke={shade(c1, -0.25)} strokeWidth={0.7} />
        </pattern>
      );
    default:
      return null;
  }
}

/** Один на весь риг набор градиентов светотени: свет справа-сверху, тень слева. */
function ShadeDefs({ uid }: { uid: string }) {
  return (
    <>
      <linearGradient id={`${uid}-sh`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity={0.55} />
        <stop offset="0.3" stopColor="#000" stopOpacity={0.22} />
        <stop offset="0.5" stopColor="#000" stopOpacity={0.02} />
        <stop offset="0.72" stopColor="#fff" stopOpacity={0.16} />
        <stop offset="0.9" stopColor="#000" stopOpacity={0.05} />
        <stop offset="1" stopColor="#000" stopOpacity={0.3} />
      </linearGradient>
      <linearGradient id={`${uid}-gl`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0.55" stopColor="#fff" stopOpacity={0} />
        <stop offset="0.72" stopColor="#fff" stopOpacity={0.35} />
        <stop offset="0.82" stopColor="#fff" stopOpacity={0} />
      </linearGradient>
      <radialGradient id={`${uid}-face`} cx="0.62" cy="0.4" r="0.7">
        <stop offset="0" stopColor="#fff" stopOpacity={0.14} />
        <stop offset="0.6" stopColor="#000" stopOpacity={0} />
        <stop offset="1" stopColor="#000" stopOpacity={0.35} />
      </radialGradient>
    </>
  );
}

// --- Формы частей тела (локально: сустав в 0,0, часть идёт вниз по +y) -----------------

/** Суживающаяся капсула с мышечным изгибом спереди (bf) и сзади (bb). */
function limb(L: number, w0: number, w1: number, bf = 0, bb = 0): string {
  const a = w0 / 2;
  const b = w1 / 2;
  return [
    `M ${-a},0`,
    `C ${-a - bb},${L * 0.35} ${-b - bb * 0.7},${L * 0.72} ${-b},${L}`,
    `A ${b},${b} 0 0 0 ${b},${L}`,
    `C ${b + bf * 0.7},${L * 0.72} ${a + bf},${L * 0.35} ${a},0`,
    `A ${a},${a} 0 0 0 ${-a},0 Z`,
  ].join(' ');
}

interface Body {
  bw: number; // ширина корпуса
  mw: number; // толщина рук и ног
}

const ARM = { up: 30, fore: 27 };
const LEG = { thigh: 44, shin: 42 };

function torsoPath(bw: number, bulk: number, hem: number): string {
  const k = (x: number) => +(x * bw).toFixed(2);
  const g = bulk;
  return [
    `M ${k(-14) },${2 + hem}`,
    `C ${k(-14) },${-6} ${k(-12.5 - g * 0.1)},${-12} ${k(-12.5) - g},-18`,
    `C ${k(-14) - g},-28 ${k(-17) - g},-38 ${k(-15) - g},-46`,
    `C ${k(-12)},-50.5 ${k(-7)},-51.5 ${k(-4)},-52`,
    `L ${k(5)},-52`,
    `C ${k(9)},-51.5 ${k(15)},-50 ${k(18) + g},-45.5`,
    `C ${k(20) + g},-40 ${k(19) + g},-34 ${k(15) + g},-29`,
    `C ${k(13.5) + g},-22 ${k(12.5) + g},-16 ${k(12.5) + g},-12`,
    `C ${k(13) + g},-6 ${k(14)},-2 ${k(14)},${2 + hem}`,
    `Z`,
  ].join(' ');
}

/** Рисует части по цепочке: сначала общий контур, потом заливка — стыков не видно. */
function Chain({ parts, fill, uid, gloss, extra }: { parts: { m: M; d: string }[]; fill: string; uid: string; gloss?: boolean; extra?: ReactNode }) {
  return (
    <g>
      {parts.map((p, i) => (
        <path key={`o${i}`} transform={mat(p.m)} d={p.d} fill={INK} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      ))}
      {/* заливка и тень частей по очереди: следующая часть закрывает тень предыдущей на стыке */}
      {parts.map((p, i) => (
        <g key={`f${i}`} transform={mat(p.m)}>
          <path d={p.d} fill={fill} />
          <path d={p.d} fill={`url(#${uid}-sh)`} />
          {gloss && <path d={p.d} fill={`url(#${uid}-gl)`} />}
        </g>
      ))}
      {extra}
    </g>
  );
}

// --- Голова ---------------------------------------------------------------------------------

const JAWS = [
  // квадратная, узкая, тяжёлая
  'M -9,-17 C -10,-8 -7,-2 -2,1 C 2,3.5 7,3 10,0 C 12.5,-3 13.5,-8 13,-14',
  'M -8,-17 C -9,-9 -6,-3 -1,0.5 C 2.5,2.5 6,2.5 9,0 C 11.5,-3 12.5,-8 12.5,-14',
  'M -10,-17 C -11,-7 -8,0 -2,2.5 C 3,4.5 8,4 11.5,0.5 C 14,-3 14.5,-9 13.5,-14',
];

function Head({ look, pose, uid, skin }: { look: Look; pose: Pose; uid: string; skin: (typeof SKIN_TONES)[number] }) {
  const fp = faceParts(look.face ?? 0);
  const hairC = HAIR_COLORS[(look.face ?? 0) % HAIR_COLORS.length];
  const hat = look.equipped.head ? HATS[look.equipped.head] : undefined;
  const full = `${JAWS[fp.jaw]} C 14,-20 15,-28 13,-33 C 10,-39 2,-41 -3,-38 C -9,-35 -11,-26 -10,-17 Z`;
  const angry = pose.brow;
  const browY = -22 - (angry < 0 ? -1 : 0);
  return (
    <g>
      {/* уши и шея под головой */}
      <path d="M -8,-22 C -13,-24 -14,-16 -9,-13" fill={skin.base} stroke={INK} strokeWidth={1.4} />
      <path d="M -9,-20 C -11,-19 -11,-17 -9.5,-16" fill="none" stroke={skin.shade} strokeWidth={0.9} />
      {/* голова */}
      <path d={full} fill={INK} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <path d={full} fill={skin.base} />
      <path d={full} fill={`url(#${uid}-face)`} />
      {/* скула и тень под глазом */}
      <path d="M 1,-12 C 4,-9 8,-9 10,-11" fill="none" stroke={skin.shade} strokeWidth={1} opacity={0.7} />
      {/* глаза: дальний меньше — голова вполоборота */}
      <g>
        <path d="M 1,-18.5 C 2.5,-19.8 4.8,-19.8 6,-18.4 C 4.6,-17.4 2.6,-17.4 1,-18.5 Z" fill="#f2ede4" />
        <circle cx={4.2} cy={-18.5} r={1.05} fill="#1c140e" />
        <path d="M 8.8,-18.4 C 9.8,-19.5 11.4,-19.5 12.2,-18.4 C 11.3,-17.6 9.8,-17.6 8.8,-18.4 Z" fill="#f2ede4" />
        <circle cx={10.9} cy={-18.4} r={0.9} fill="#1c140e" />
        <path d="M 0.6,-18.8 C 2.6,-20.6 5,-20.4 6.4,-18.8 M 8.5,-18.7 C 9.8,-20 11.6,-19.9 12.5,-18.7" fill="none" stroke={INK} strokeWidth={1.1} />
      </g>
      {/* брови: сведены, если злой */}
      <path
        d={
          fp.brow === 1
            ? `M 0,${browY + 0.4 - angry} L 6.5,${browY + 1.4 + angry * 1.2} M 8.5,${browY + 1.4 + angry * 1.2} L 13,${browY + 0.4 - angry * 0.4}`
            : `M 0.4,${browY + 0.6 - angry * 0.6} C 2.8,${browY - 1} 5.2,${browY - 0.6} 6.6,${browY + 0.6 + angry}  M 8.6,${browY + 0.8 + angry} C 10.2,${browY - 0.4} 12,${browY - 0.4} 13,${browY + 0.6}`
        }
        fill="none"
        stroke={hairC}
        strokeWidth={fp.brow === 1 ? 2.1 : 1.7}
        strokeLinecap="round"
      />
      {/* нос вбок */}
      <path d="M 8.5,-17 C 9,-14 10.6,-11.8 13.2,-11.2 C 12.6,-10 10.8,-9.6 9.4,-10.2" fill="none" stroke={skin.shade} strokeWidth={1.2} strokeLinecap="round" />
      <path d="M 8.7,-11 L 10.6,-10.2" stroke={INK} strokeWidth={0.8} />
      {/* рот */}
      {pose.mouth > 0.5 ? (
        <path d="M 5,-5.8 C 7,-4.2 10,-4.2 11.6,-6 C 10.8,-2.6 6.4,-2.2 5,-5.8 Z" fill="#3a1a14" stroke={INK} strokeWidth={0.8} />
      ) : (
        <path d={angry < 0 ? 'M 5,-4.2 C 7,-5.6 9.8,-5.6 11.4,-4.4' : 'M 5.2,-5.2 C 7.4,-4.6 9.6,-4.7 11.4,-5.4'} fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
      )}
      <Beard kind={fp.beard} color={hairC} jaw={fp.jaw} />
      {!hat && <Hair kind={fp.hair} color={hairC} />}
      {hat && <Hat h={hat} />}
    </g>
  );
}

function Beard({ kind, color, jaw }: { kind: number; color: string; jaw: number }) {
  const low = jaw === 2 ? 1.5 : 0;
  switch (kind) {
    case 1: // щетина
      return <path d={`M -7,-12 C -6,-4 -2,${1 + low} 3,${2.2 + low} C 7,${2.5 + low} 11,0 12.4,-6 C 11,-3 8,-2.6 5,-3.4 C 2,-4 -2,-7 -7,-12 Z`} fill={color} opacity={0.35} />;
    case 2: // борода
      return (
        <g>
          <path d={`M -8.5,-14 C -8,-3 -3,${5 + low} 3,${6.5 + low} C 8,${7 + low} 12,${2 + low} 13,-6 C 11,-3.4 9.4,-2.4 8,-3.2 C 6,-4.4 4,-4.2 2.6,-3.2 C 0,-5 -4,-8 -8.5,-14 Z`} fill={color} stroke={INK} strokeWidth={1} />
          <path d="M 3,-7.2 C 5.5,-8.4 9.5,-8.4 12,-7 C 10,-6.2 5,-6.2 3,-7.2 Z" fill={color} />
        </g>
      );
    case 3: // усы
      return <path d="M 3.4,-7 C 5.5,-8.8 9.8,-8.6 12.2,-6.6 C 12.6,-5.2 11.6,-4.6 10.8,-5.8 C 8.6,-6.8 6,-6.6 4.2,-5.8 C 3.4,-5.4 2.8,-6 3.4,-7 Z" fill={color} stroke={INK} strokeWidth={0.6} />;
    case 4: // эспаньолка
      return (
        <g>
          <path d="M 4,-7 C 6,-8.4 9.6,-8.4 12,-6.8 C 11,-6 5,-6 4,-7 Z" fill={color} />
          <path d={`M 5.4,-3.6 C 6,${-0.5 + low} 7.6,${2.8 + low} 9,${2.8 + low} C 10.4,${2.4 + low} 11,${-0.5 + low} 11,-3.6 C 9,-2.8 7,-2.8 5.4,-3.6 Z`} fill={color} stroke={INK} strokeWidth={0.7} />
        </g>
      );
    case 5: // густая борода с усами
      return (
        <g>
          <path d={`M -9,-17 C -9,-2 -3,${8 + low} 3.5,${9.5 + low} C 9,${9.5 + low} 13.5,${3 + low} 13.5,-8 C 12,-4 10,-3 8,-3.6 C 6,-4.4 3.6,-4.4 2,-3.4 C -2,-6 -6,-10 -9,-17 Z`} fill={color} stroke={INK} strokeWidth={1.1} />
          <path d="M 2.6,-7.6 C 5.4,-9.4 10,-9.2 12.6,-7.2 C 11.8,-5.4 4.4,-5 2.6,-7.6 Z" fill={color} stroke={INK} strokeWidth={0.5} />
          <path d={`M -2,-2 C 0,${3 + low} 3,${6 + low} 6,${6.5 + low}`} stroke={shadeHex(color)} strokeWidth={0.8} fill="none" />
        </g>
      );
    default:
      return null;
  }
}
const shadeHex = (c: string) => shade(c, 0.25);

function Hair({ kind, color }: { kind: number; color: string }) {
  switch (kind) {
    case 0: // лысый: блик
      return <path d="M 0,-37 C 5,-38.5 10,-37 12,-33" fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={1.6} strokeLinecap="round" />;
    case 1: // ёжик
      return <path d="M -10.2,-19 C -12,-31 -5,-40.5 4,-40.5 C 12,-40.5 15.5,-33 14.6,-25 C 12,-31 6,-33.5 0,-32.5 C -4,-31.8 -7,-27 -8,-21 Z" fill={color} opacity={0.75} />;
    case 2: // короткая стрижка
      return <path d="M -10.5,-18 C -13,-32 -5,-42 4,-42 C 13,-42 17,-34 15,-25 C 13,-30 9,-33 4,-33 C 7,-35 4,-36 0,-34.5 C -4,-33 -7,-28 -8,-20 Z" fill={color} stroke={INK} strokeWidth={1.1} />;
    case 3: // зачёс назад
      return (
        <g>
          <path d="M -11,-17 C -14,-33 -6,-43.5 4,-43.5 C 13,-43.5 17.5,-36 15.5,-27 C 14,-32 11,-34.5 7,-35 C 3,-35 -2,-33 -5,-29 C -7,-26 -8,-22 -8.5,-18 Z" fill={color} stroke={INK} strokeWidth={1.1} />
          <path d="M -3,-38 C 2,-40 8,-40 12,-37 M -6,-34 C 0,-37 6,-37 11,-34" fill="none" stroke={shade(color, 0.3)} strokeWidth={0.8} />
        </g>
      );
    case 4: // чёлка
      return <path d="M -11,-18 C -14,-33 -6,-43 4,-43 C 13,-43 17,-35 15,-26 C 13,-24.5 11,-27 9,-28.5 C 6,-26 2,-27 0,-29 C -3,-27 -6,-24 -8,-19 Z" fill={color} stroke={INK} strokeWidth={1.1} />;
    case 5: // бритые виски, гребень
      return (
        <g>
          <path d="M -10,-19 C -11,-30 -5,-38 4,-38.5 C 12,-38.5 15,-32 14.5,-25" fill={color} opacity={0.3} />
          <path d="M -3,-38 C 1,-43 9,-43 12,-37 C 8,-38.5 3,-38.5 -3,-38 Z" fill={color} stroke={INK} strokeWidth={1} />
        </g>
      );
    case 6: // длинные
      return <path d="M -11.5,-10 C -16,-30 -6,-44 4,-44 C 14,-44 18,-35 15.5,-24 C 13,-30 9,-34 3,-34 C -2,-33 -6,-29 -7,-22 C -8,-16 -8,-10 -9,-6 Z" fill={color} stroke={INK} strokeWidth={1.1} />;
    default: // седой ёжик
      return <path d="M -10.2,-19 C -12,-31 -5,-40.5 4,-40.5 C 12,-40.5 15.5,-33 14.6,-25 C 12,-31 6,-33.5 0,-32.5 C -4,-31.8 -7,-27 -8,-21 Z" fill="#9a968e" opacity={0.8} />;
  }
}

function Hat({ h }: { h: (typeof HATS)[string] }) {
  switch (h.kind) {
    case 'beanie':
      return (
        <g>
          <path d="M -11.5,-24 C -13,-38 -4,-45 4,-45 C 13,-45 18,-38 16,-26 Z" fill={h.color} stroke={INK} strokeWidth={1.4} />
          <path d="M -12,-24 C -3,-28 8,-28 16.5,-25 L 16,-20.5 C 8,-23.5 -3,-23.5 -12,-19.5 Z" fill={shade(h.color, 0.1)} stroke={INK} strokeWidth={1.2} />
          {[-8, -4, 0, 4, 8, 12].map((x) => (
            <path key={x} d={`M ${x},-26.5 L ${x},-22`} stroke={shade(h.color, -0.4)} strokeWidth={0.7} />
          ))}
        </g>
      );
    case 'ushanka':
      return (
        <g>
          <path d="M -13,-8 C -16,-14 -15,-22 -12,-24 L -8,-22 C -9,-16 -9,-12 -9,-8 Z" fill={h.color} stroke={INK} strokeWidth={1.2} />
          <path d="M -12,-24 C -13,-38 -4,-46 4,-46 C 14,-46 19,-38 17,-26 Z" fill={h.color2} stroke={INK} strokeWidth={1.4} />
          <path d="M -13,-25 C -3,-31 9,-31 18,-26 L 17.5,-20 C 8,-25 -3,-25 -13,-19.5 Z" fill={h.color} stroke={INK} strokeWidth={1.3} />
          <path d="M -11,-22 L 16,-22" stroke={shade(h.color, 0.2)} strokeWidth={0.8} strokeDasharray="1.5 1.5" />
        </g>
      );
    case 'cap8':
      return (
        <g>
          <path d="M -12,-25 C -14,-37 -4,-44 5,-44 C 15,-44 19,-36 17,-27 C 8,-30 -3,-29 -12,-25 Z" fill={h.color} stroke={INK} strokeWidth={1.4} />
          <path d="M 5,-44 L 3,-29 M -4,-42 L -3,-28 M 12,-42 L 10,-28" stroke={shade(h.color, 0.2)} strokeWidth={0.7} />
          <path d="M 8,-29 C 14,-30 21,-29 24,-26.5 C 18,-24.5 12,-25 7,-26 Z" fill={shade(h.color, -0.2)} stroke={INK} strokeWidth={1.2} />
          <circle cx={4.5} cy={-44} r={1.3} fill={shade(h.color, 0.3)} />
        </g>
      );
    case 'capgold':
      return (
        <g>
          <path d="M -12,-25 C -13,-37 -4,-43 5,-43 C 15,-43 19,-35 17,-27 C 8,-30 -3,-29 -12,-25 Z" fill={h.color} stroke={INK} strokeWidth={1.4} />
          <path d="M -12,-26 C -2,-30 9,-30 17,-27.5 L 17,-25.5 C 8,-28 -2,-28 -12,-24 Z" fill={h.color2} />
          <path d="M 8,-28.5 C 15,-29.5 22,-28 25,-25.5 C 19,-23.5 12,-24 7,-25.5 Z" fill={h.color} stroke={INK} strokeWidth={1.2} />
          <circle cx={3} cy={-36} r={2.2} fill={h.color2} stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'furazhka':
      return (
        <g>
          <path d="M -12,-27 C -13,-33 -8,-37 3,-38 C 16,-39 22,-36 21,-31 C 13,-28 -2,-27 -12,-27 Z" fill={h.color} stroke={INK} strokeWidth={1.3} />
          <path d="M -11,-27 C -4,-28 10,-29 20,-31 L 19.5,-28.5 C 9,-26 -4,-25.5 -11,-25 Z" fill={h.color2} stroke={INK} strokeWidth={0.9} />
          <path d="M 8,-26 C 14,-26 21,-25 24,-22.5 C 18,-21 12,-22 7,-23.5 Z" fill="#141414" stroke={INK} strokeWidth={1} />
          <circle cx={9} cy={-31} r={1.6} fill="#d9a53a" />
        </g>
      );
    case 'beret':
      return <path d="M -12,-26 C -14,-36 -2,-43 8,-42 C 17,-41 22,-35 17,-29 C 8,-26 -4,-25 -12,-26 Z" fill={h.color} stroke={INK} strokeWidth={1.3} />;
    case 'chef':
      return (
        <g>
          <path d="M -9,-28 L -10,-40 C -16,-44 -12,-54 -4,-51 C -1,-58 9,-58 11,-51 C 19,-54 22,-44 16,-40 L 15,-28 Z" fill={h.color} stroke={INK} strokeWidth={1.3} />
          <path d="M -9,-31 L 15,-31" stroke="#c8c4b8" strokeWidth={1} />
        </g>
      );
    case 'helmet':
      return (
        <g>
          <path d="M -12,-22 C -15,-38 -5,-46 4,-46 C 15,-46 20,-37 18,-24 C 8,-27 -3,-26 -12,-22 Z" fill={h.color} stroke={INK} strokeWidth={1.4} />
          <path d="M -12,-22 C -3,-26 8,-27 18,-24 L 18,-21 C 8,-24 -3,-23 -12,-19 Z" fill={shade(h.color, -0.3)} stroke={INK} strokeWidth={1} />
        </g>
      );
    case 'crown':
      return (
        <g>
          <path d="M -9,-31 L -11,-45 L -4,-38 L 2,-48 L 8,-38 L 15,-45 L 14,-31 Z" fill={h.color} stroke={INK} strokeWidth={1.3} />
          <path d="M -9,-31 L 14,-31 L 14,-28 L -9,-28 Z" fill={shade(h.color, -0.2)} stroke={INK} strokeWidth={1} />
          <circle cx={2.5} cy={-35} r={1.8} fill={h.color2} />
          <circle cx={-4} cy={-33} r={1.1} fill="#3a6ab8" />
          <circle cx={9} cy={-33} r={1.1} fill="#3a6ab8" />
        </g>
      );
  }
}

// --- Кисти, стопы, оружие ----------------------------------------------------------------------

function handPath(fist: number): string {
  return fist > 0.5
    ? 'M -5.4,-1 C -6.6,3.6 -6,9.4 -2.4,11.2 C 1.2,12.8 5.6,11.2 6.3,7 C 6.8,3.5 5.8,0 4.7,-1 Z M 2,4 L 5.8,4.4 M 1.6,7.4 L 5.6,7.6'
    : 'M -4.9,-1 C -5.8,4.6 -5.1,11.6 -2.6,14.6 C -0.7,16.2 1.6,15.8 2.8,13.4 C 4.4,10.4 5.3,4.6 4.6,-1 Z';
}

function footPath(kind: string): string {
  if (kind === 'boots') return 'M -5.5,-14 L 5,-14 L 5.5,-3 C 10,-2.6 16,-1 17,2 L 17,5 L -6,5 Z';
  if (kind === 'shoes') return 'M -5.5,-4 L 5,-4 C 10,-3 16,-1 17,2 L 17,5 L -6,5 Z';
  return 'M -4.5,-2 L 4.5,-2 C 9,-1.4 14,0 15.5,2.6 C 16,4 15,5 13.5,5 L -5,5 C -5.6,3 -5.4,0 -4.5,-2 Z';
}

function Weapon({ id }: { id?: string }) {
  switch (id) {
    case 'wpn_spoon':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1} y={-2} width={2} height={18} rx={1} fill="#b9bdc2" stroke={INK} strokeWidth={0.6} />
          <ellipse cx={0} cy={18} rx={2.6} ry={3.8} fill="#cfd3d8" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_rebar':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.6} y={-5} width={3.2} height={8} fill="#3a2a1e" stroke={INK} strokeWidth={0.6} />
          <path d="M -1.3,3 L 1.3,3 L 0,24 Z" fill="#9aa0a6" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_knuckles':
      return <path d="M -5,1 C -4,-1 4,-1 5.5,1 L 5.5,5 C 3,4 -3,4 -5,5 Z" fill="#b8bcc0" stroke={INK} strokeWidth={0.7} />;
    case 'wpn_chain':
      return (
        <g>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <ellipse key={i} cx={1 + i * 0.6} cy={8 + i * 3.6} rx={1.5} ry={2.2} fill="none" stroke="#8a8e94" strokeWidth={1.1} />
          ))}
        </g>
      );
    case 'wpn_golden':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.8} y={-5} width={3.6} height={8} rx={1} fill="#6a3a1a" stroke={INK} strokeWidth={0.6} />
          <rect x={-3} y={2.6} width={6} height={1.6} fill="#d9a53a" />
          <path d="M -1.6,4 C -2,12 -1,20 0,26 C 1.4,20 2,12 1.6,4 Z" fill="#e8c35a" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'drop_baton':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-2} y={-6} width={4} height={36} rx={2} fill="#1c1c1c" stroke={INK} strokeWidth={0.6} />
          <rect x={-2.4} y={-2} width={4.8} height={3} fill="#3a3a3a" />
        </g>
      );
    default:
      return null;
  }
}

// --- Одежда: рисуем по тем же матрицам, что и тело --------------------------------------------

interface Mats {
  torso: M;
  pelvis: M;
  neck: M;
  head: M;
  n: { s: M; e: M; w: M };
  f: { s: M; e: M; w: M };
  nl: { h: M; k: M; a: M };
  fl: { h: M; k: M; a: M };
}

function fillOf(uid: string, key: string, color: string, pattern?: Pattern): string {
  return pattern && pattern !== 'none' ? `url(#${uid}-${key})` : color;
}

// --- Главный компонент ------------------------------------------------------------------------

let uidSeq = 0;

export interface RigProps {
  look: Look;
  anim?: RigAnim;
  mirror?: boolean;
  /** не анимировать (иконки, портреты) */
  still?: boolean;
  shadow?: boolean;
  /** начало анимации — чтобы разовые (удар) шли с начала */
  startKey?: string | number;
  bare?: boolean;
}

export function Rig({ look, anim = 'idle', mirror, still, shadow = true, startKey, bare }: RigProps) {
  const uid = useRef(`rg${++uidSeq}`).current;
  const t = useClock(!still);
  const t0 = useRef(performance.now());
  const prev = useRef<{ anim: RigAnim; pose: Pose; at: number } | null>(null);
  const lastPose = useRef<Pose>(P0);
  const keyRef = useRef<string | number | undefined>(startKey);
  if (keyRef.current !== startKey || prev.current?.anim !== anim) {
    // смена анимации: плавно перетекаем из последней позы
    if (prev.current && prev.current.anim !== anim) prev.current = { anim, pose: lastPose.current, at: performance.now() };
    if (!prev.current) prev.current = { anim, pose: P0, at: -1e9 };
    keyRef.current = startKey;
    t0.current = performance.now();
  }
  const local = still ? 0 : t - t0.current;
  let pose = poseAt(anim, Math.max(0, local));
  const blend = prev.current ? (performance.now() - prev.current.at) / 180 : 1;
  if (prev.current && blend < 1) pose = mix(prev.current.pose, pose, ease(Math.max(0, blend)));
  lastPose.current = pose;
  return <RigBody look={look} pose={pose} uid={uid} mirror={mirror} shadow={shadow} bare={bare} />;
}

export function RigBody({ look, pose, uid, mirror, shadow = true, bare }: { look: Look; pose: Pose; uid: string; mirror?: boolean; shadow?: boolean; bare?: boolean }) {
  const skin = SKIN_TONES[look.skin ?? 0] ?? SKIN_TONES[0];
  const build = [0.9, 1, 1.12][look.build ?? 1] ?? 1;
  const muscle = Math.min(1.25, 0.92 + (look.str ?? 5) * 0.006);
  const body: Body = { bw: build * 1.34, mw: build * muscle * 1.12 };
  const top = !bare && look.equipped.body ? TOPS[look.equipped.body] : undefined;
  const legs: LegWear | undefined = !bare ? (top?.legs ?? (look.equipped.legs ? LEGS[look.equipped.legs] : undefined)) : undefined;
  const feet = look.equipped.feet ? FEET[look.equipped.feet] : undefined;

  // скелет
  const base = mul(T(60 + pose.x, 112 + pose.y), R(pose.root));
  const torso = mul(base, R(pose.lean));
  const neck = mul(torso, mul(T(0.5 * body.bw, -50), R(pose.neck)));
  const head = mul(neck, mul(T(0, -7), R(pose.head)));
  const arm = (x: number, s: number, e: number, w: number) => {
    const sm = mul(torso, mul(T(x * body.bw, -44), R(s)));
    const em = mul(sm, mul(T(0, ARM.up), R(e)));
    const wm = mul(em, mul(T(0, ARM.fore), R(w)));
    return { s: sm, e: em, w: wm };
  };
  const leg = (x: number, h: number, k: number, a: number) => {
    const hm = mul(base, mul(T(x * body.bw, 5), R(h)));
    const km = mul(hm, mul(T(0, LEG.thigh), R(k)));
    const am = mul(km, mul(T(0, LEG.shin), R(-h - k + a)));
    return { h: hm, k: km, a: am };
  };
  const m: Mats = {
    torso,
    pelvis: base,
    neck,
    head,
    n: arm(-9.5, pose.nS, pose.nE, pose.nW),
    f: arm(14.5, pose.fS, pose.fE, pose.fW),
    nl: leg(-4, pose.nH, pose.nK, pose.nA),
    fl: leg(6.5, pose.fH, pose.fK, pose.fA),
  };

  const mw = body.mw;
  const bulk = top?.bulk ?? 0;
  const armParts = (a: Mats['n'], cover: 'none' | 'short' | 'long' | 'skin', extra = 0) => {
    const w = extra;
    if (cover === 'none') return [];
    const up = { m: a.s, d: limb(cover === 'short' ? 16 : ARM.up, 11.5 * mw + w, (cover === 'short' ? 10.5 : 8.8) * mw + w, 1.6 * mw, 0.6) };
    if (cover === 'short') return [up];
    const fore = { m: a.e, d: limb(cover === 'long' ? ARM.fore - 1 : ARM.fore, 8.8 * mw + w, (cover === 'long' ? 7.4 : 6.8) * mw + w, 0.8, 1.2 * mw) };
    return [up, fore];
  };
  const skinArm = (a: Mats['n']) => [...armParts(a, 'skin'), { m: a.w, d: handPath(pose.fist) }];
  const legParts = (l: Mats['nl'], k = 0) => [
    { m: l.h, d: limb(LEG.thigh, 16.5 * mw + k, 11.5 * mw + k, 1.4, 1) },
    { m: l.k, d: limb(LEG.shin, 11.2 * mw + k, 7.6 * mw + k * 0.6, 0.6, 2.2 * mw) },
  ];
  const footKind = feet?.kind ?? 'bare';
  const footPart = (l: Mats['nl']) => ({ m: l.a, d: footPath(footKind) });

  const sleeves = top?.sleeves ?? 'none';
  const sleeveFill = top ? fillOf(uid, top.sleeveColor ? 'sl' : 'top', top.sleeveColor ?? top.color, top.sleeveColor ? 'none' : top.pattern) : '';
  const legsFill = legs ? fillOf(uid, 'legs', legs.color, legs.pattern) : '';
  const footFill = feet ? feet.color : skin.base;

  const drawArm = (a: Mats['n'], near: boolean) => (
    <g>
      <Chain
        parts={skinArm(a)}
        fill={skin.base}
        uid={uid}
        extra={
          <>
            <path transform={mat(a.s)} d={`M ${2.2 * mw},6 C ${4 * mw},12 ${3.6 * mw},20 ${1.4 * mw},25 M ${-3 * mw},16 C ${-2 * mw},20 ${-2 * mw},24 ${-2.6 * mw},28`} fill="none" stroke={skin.shade} strokeWidth={0.9} opacity={0.8} />
            <path transform={mat(a.e)} d={`M ${1.8 * mw},3 C ${3 * mw},8 ${2.4 * mw},14 ${1 * mw},19`} fill="none" stroke={skin.shade} strokeWidth={0.8} opacity={0.7} />
            <ArmTattoo look={look} a={a} near={near} covered={sleeves} />
          </>
        }
      />
      {top && sleeves !== 'none' && (
        <Chain
          parts={armParts(a, sleeves, 1.2 + bulk * 0.45)}
          fill={sleeveFill}
          uid={uid}
          gloss={top.gloss}
          extra={
            <>
              {top.stripesSleeve && (
                <path transform={mat(a.s)} d={`M ${4 + bulk * 0.3},2 L ${3.4 + bulk * 0.3},${sleeves === 'short' ? 14 : ARM.up}`} stroke={top.stripesSleeve} strokeWidth={1.6} />
              )}
              {top.stripesSleeve && sleeves === 'long' && <path transform={mat(a.e)} d={`M ${3 + bulk * 0.3},0 L ${2.6 + bulk * 0.3},${ARM.fore - 2}`} stroke={top.stripesSleeve} strokeWidth={1.5} />}
              {sleeves === 'long' && (
                <path transform={mat(a.e)} d={`M ${-(3.9 * mw + bulk * 0.3)},${ARM.fore - 3.5} L ${3.9 * mw + bulk * 0.3},${ARM.fore - 3.5}`} stroke={INK} strokeWidth={0.8} opacity={0.6} />
              )}
              {/* складки ткани у локтя и плеча */}
              <path transform={mat(a.s)} d={`M -2,${ARM.up - 6} C 0,${ARM.up - 4} 2,${ARM.up - 5} 4,${ARM.up - 8} M -4,8 C -2,10 1,10 3,8`} fill="none" stroke={INK} strokeWidth={0.7} opacity={0.45} />
              {sleeves === 'long' && <path transform={mat(a.e)} d="M -3,3 C -1,5 1,5 3,2 M -2,11 C 0,12.5 2,12 3.4,10" fill="none" stroke={INK} strokeWidth={0.7} opacity={0.4} />}
            </>
          }
        />
      )}
      {near && (
        <g transform={mat(a.w)}>
          <Weapon id={look.equipped.weapon} />
          {look.equipped.charm === 'charm_beads' && <path d="M -4.4,-1 C -2,1 2,1 4.2,-1" fill="none" stroke="#8a3a1e" strokeWidth={1.6} strokeDasharray="1.4 0.8" />}
          {look.equipped.charm === 'charm_ring' && <circle cx={3.8} cy={pose.fist > 0.5 ? 5 : 8} r={1.3} fill="#e8c35a" stroke={INK} strokeWidth={0.4} />}
        </g>
      )}
    </g>
  );

  const drawLeg = (l: Mats['nl']) => (
    <g>
      <Chain parts={[...legParts(l), ...(feet ? [] : [footPart(l)])]} fill={skin.base} uid={uid} />
      {legs && (
        <Chain
          parts={legParts(l, 2).map((p, i) => (i === 1 ? { ...p, d: limb(LEG.shin - (footKind === 'boots' ? 12 : 3), 11.6 * mw + 2, 9.6 * mw + 1.4, 0.4, 1.4) } : p))}
          fill={legsFill}
          uid={uid}
          extra={
            legs.stripe ? (
              <>
                <path transform={mat(l.h)} d={`M ${-7.4 * mw},2 L ${-5.6 * mw},${LEG.thigh}`} stroke={legs.stripe} strokeWidth={1.6} />
                <path transform={mat(l.k)} d={`M ${-5.6 * mw},0 L ${-4.8 * mw},${LEG.shin - 4}`} stroke={legs.stripe} strokeWidth={1.5} />
              </>
            ) : legs.pockets ? (
              <path transform={mat(l.h)} d={`M ${-7 * mw},20 h 7 v 9 h -7 Z`} fill="none" stroke={INK} strokeWidth={0.7} opacity={0.7} />
            ) : (
              <>
                <path transform={mat(l.h)} d={`M 2,${LEG.thigh - 10} C 3,${LEG.thigh - 5} 1,${LEG.thigh - 2} -2,${LEG.thigh} M -4,10 C -3,16 -3,20 -4,26`} fill="none" stroke={INK} strokeWidth={0.7} opacity={0.35} />
                <path transform={mat(l.k)} d="M -2,4 C 0,6 2,6 3,3" fill="none" stroke={INK} strokeWidth={0.7} opacity={0.35} />
              </>
            )
          }
        />
      )}
      {!legs && !bare && null}
      {feet && <Chain parts={[footPart(l)]} fill={footFill} uid={uid} extra={feet.sole ? <path transform={mat(l.a)} d="M -6,4.2 L 17,4.2" stroke={feet.sole} strokeWidth={2} /> : null} />}
    </g>
  );

  const hem = top?.hem ?? 0;
  const torsoD = torsoPath(body.bw, 0, 0);
  const topD = torsoPath(body.bw, 1.2 + bulk * 0.5, Math.min(hem, 6));
  const skirt = hem > 6 ? `M ${-14 * body.bw - bulk * 0.5},2 L ${14 * body.bw + bulk * 0.5},2 L ${15 * body.bw + bulk * 0.6 + hem * 0.15},${2 + hem} C 5,${4 + hem} -5,${4 + hem} ${-15 * body.bw - bulk * 0.6 - hem * 0.12},${2 + hem} Z` : null;

  // трусы / брюки на тазу
  const pelvisD = `M ${-14 * body.bw},-6 L ${14 * body.bw},-6 L ${15 * body.bw},10 C 6,13 -6,13 ${-15 * body.bw},10 Z`;
  const wearsLegs = !!legs;
  const pelvisFill = wearsLegs ? legsFill : '#2c3a5a';

  const parts: ReactNode[] = [];
  // тень
  if (shadow && Math.abs(pose.root) < 30) parts.push(<ellipse key="sh" cx={60 + pose.x} cy={210} rx={24 * body.bw} ry={4.2} fill="#000" opacity={0.38} />);
  parts.push(<g key="fa">{drawArm(m.f, false)}</g>);
  parts.push(<g key="fl">{drawLeg(m.fl)}</g>);
  // таз
  parts.push(
    <g key="pel">
      <Chain parts={[{ m: m.pelvis, d: pelvisD }]} fill={pelvisFill} uid={uid} />
      {!wearsLegs && <path transform={mat(m.pelvis)} d={`M ${-14 * body.bw},-3 L ${14 * body.bw},-3`} stroke="#e8e4da" strokeWidth={1.6} />}
    </g>,
  );
  parts.push(<g key="nl">{drawLeg(m.nl)}</g>);
  // корпус и шея
  parts.push(
    <g key="torso">
      <Chain parts={[{ m: m.neck, d: 'M -6.5,3 C -6,-3 -5.6,-7 -5,-9.5 L 6,-9.5 C 6.4,-6 6.8,-2 7.5,3 Z' }]} fill={skin.base} uid={uid} />
      <Chain
        parts={[{ m: m.torso, d: torsoD }]}
        fill={skin.base}
        uid={uid}
        extra={
          <g transform={mat(m.torso)}>
            <path d={`M ${-2 * body.bw},-40 C ${4 * body.bw},-33 ${12 * body.bw},-34 ${16 * body.bw},-38 M ${-12 * body.bw},-39 C ${-8 * body.bw},-34 ${-4 * body.bw},-33 ${-2 * body.bw},-36`} fill="none" stroke={skin.shade} strokeWidth={1} />
            <path d="M 2,-30 L 2,-6 M -5,-24 C -1,-23 5,-23 9,-24 M -5,-17 C -1,-16 5,-16 9,-17 M -4,-10 C 0,-9 5,-9 8,-10" fill="none" stroke={skin.shade} strokeWidth={0.8} opacity={0.6} />
            <path d="M -6,-47 C -1,-45 4,-45 9,-47" fill="none" stroke={skin.shade} strokeWidth={0.8} />
            <ChestTattoo look={look} bw={body.bw} />
            {look.equipped.charm === 'charm_cross' && (
              <g>
                <path d={`M -5,-49 C -4,-38 6,-38 8,-49`} fill="none" stroke="#e8c35a" strokeWidth={1.1} />
                <path d="M 1.6,-39.5 v 7 M -0.6,-37.2 h 4.4" stroke="#e8c35a" strokeWidth={1.4} />
              </g>
            )}
          </g>
        }
      />
      {top && <TopLayer top={top} m={m} uid={uid} d={topD} skirt={skirt} bw={body.bw} bulk={bulk} />}
      {look.equipped.charm === 'drop_keys' && (
        <g transform={mat(m.pelvis)}>
          <circle cx={10 * body.bw} cy={2} r={2.4} fill="none" stroke="#9a9ea4" strokeWidth={1} />
          <path d={`M ${10 * body.bw},4 l 1,7 m -3,-6 l -1,6`} stroke="#b8bcc2" strokeWidth={1.2} />
        </g>
      )}
    </g>,
  );
  parts.push(
    <g key="head" transform={mat(m.head)}>
      <Head look={look} pose={pose} uid={uid} skin={skin} />
      {top && (top.neck === 'hood' || top.neck === 'fur') && pose.root > -30 && null}
    </g>,
  );
  parts.push(<g key="na">{drawArm(m.n, true)}</g>);

  return (
    <g transform={mirror ? 'translate(120 0) scale(-1 1)' : undefined}>
      <defs>
        <ShadeDefs uid={uid} />
        {top?.pattern && <PatternDef id={`${uid}-top`} p={top.pattern} c1={top.color} c2={top.pattern2 ?? shade(top.color, -0.3)} />}
        {legs?.pattern && <PatternDef id={`${uid}-legs`} p={legs.pattern} c1={legs.color} c2={legs.pattern2 ?? shade(legs.color, -0.3)} />}
      </defs>
      {parts}
    </g>
  );
}

/** Верх одежды: корпус, воротник, подол, детали (молния, пуговицы, лямки, фартук). */
function TopLayer({ top, m, uid, d, skirt, bw, bulk }: { top: TopWear; m: Mats; uid: string; d: string; skirt: string | null; bw: number; bulk: number }) {
  const fill = fillOf(uid, 'top', top.color, top.pattern);
  const k = (x: number) => x * bw;
  const tank = top.neck === 'tank';
  // майка: вырез под руки и на груди
  const body = tank ? `M ${k(-12)},2 C ${k(-13)},-10 ${k(-12)},-20 ${k(-11)},-30 C ${k(-9)},-34 ${k(-7)},-44 ${k(-6)},-50 L ${k(-3)},-50 C ${k(-1)},-42 ${k(6)},-42 ${k(8)},-50 L ${k(11)},-50 C ${k(12)},-44 ${k(14)},-36 ${k(15)},-32 C ${k(13.5)},-22 ${k(12.5)},-12 ${k(13)},2 Z` : d;
  const parts = [{ m: m.torso, d: body }, ...(skirt ? [{ m: m.pelvis, d: skirt }] : [])];
  return (
    <g>
      <Chain
        parts={parts}
        fill={fill}
        uid={uid}
        gloss={top.gloss}
        extra={
          <g transform={mat(m.torso)}>
            {top.bib && (
              <g>
                <path d={`M ${k(-11)},2 L ${k(-10)},-24 L ${k(12)},-24 L ${k(12.5)},2 Z`} fill={top.bib} stroke={INK} strokeWidth={1.2} />
                <path d={`M ${k(-9)},-24 L ${k(-7)},-48 M ${k(10)},-24 L ${k(9)},-48`} stroke={top.bib} strokeWidth={3.2} />
                <circle cx={k(-8.6)} cy={-23} r={1.2} fill="#c8c8c8" />
                <circle cx={k(10.2)} cy={-23} r={1.2} fill="#c8c8c8" />
              </g>
            )}
            {top.apron && <path d={`M ${k(-9)},${4 + top.hem} L ${k(-8)},-28 C ${k(-3)},-30 ${k(6)},-30 ${k(11)},-28 L ${k(12)},${4 + top.hem} Z`} fill={top.apron} stroke={INK} strokeWidth={1.1} />}
            {top.zip && <path d={`M ${k(1.5)},-49 L ${k(1.5)},${Math.min(top.hem, 6)}`} stroke={shade(top.color, top.color < '#555' ? 0.35 : -0.4)} strokeWidth={1} />}
            {top.buttons &&
              [-40, -30, -20, -10].map((y) => <circle key={y} cx={k(1.5)} cy={y} r={1} fill={shade(top.color, -0.45)} />)}
            {top.pockets && (
              <>
                <path d={`M ${k(-9)},-36 h ${k(7)} v 6 h ${-k(7)} Z M ${k(5)},-36 h ${k(7)} v 6 h ${-k(7)} Z`} fill="none" stroke={shade(top.color, -0.45)} strokeWidth={0.8} />
              </>
            )}
            {top.belt && <path d={`M ${k(-13) - bulk * 0.5},-3 L ${k(13.5) + bulk * 0.5},-3`} stroke={top.belt} strokeWidth={3} />}
            {top.belt && <rect x={k(0)} y={-5} width={4} height={4} fill="none" stroke="#c8a860" strokeWidth={0.9} />}
            {top.epaulets && (
              <path d={`M ${k(-14)},-46 L ${k(-8)},-48 M ${k(12)},-47.5 L ${k(18)},-45.5`} stroke={shade(top.color, -0.35)} strokeWidth={2.6} />
            )}
            {/* воротник */}
            {top.neck === 'collar' && (
              <path d={`M ${k(-6)},-51 L ${k(-2)},-43 L ${k(1.5)},-47 L ${k(5)},-43 L ${k(9)},-51 L ${k(5.5)},-52.5 L ${k(1.5)},-49 L ${k(-2.5)},-52.5 Z`} fill={top.lining ?? shade(top.color, 0.12)} stroke={INK} strokeWidth={1} />
            )}
            {top.neck === 'v' && <path d={`M ${k(-4)},-51 L ${k(1.5)},-42 L ${k(7)},-51`} fill={shade(top.color, -0.2)} stroke={INK} strokeWidth={1} />}
            {top.neck === 'crew' && <path d={`M ${k(-5)},-51 C ${k(-2)},-47.5 ${k(4)},-47.5 ${k(7)},-51`} fill="none" stroke={INK} strokeWidth={1} />}
            {top.neck === 'zip' && <path d={`M ${k(-5)},-53 L ${k(-4.5)},-49 C ${k(-1)},-47.5 ${k(4)},-47.5 ${k(7.5)},-49 L ${k(8)},-53`} fill={shade(top.color, 0.08)} stroke={INK} strokeWidth={1} />}
            {top.neck === 'hood' && <path d={`M ${k(-12)},-47 C ${k(-16)},-54 ${k(-10)},-58 ${k(-4)},-54 C ${k(0)},-50 ${k(5)},-50 ${k(9)},-52 L ${k(8)},-48 C ${k(3)},-46 ${k(-3)},-46 ${k(-8)},-45 Z`} fill={fill} stroke={INK} strokeWidth={1.1} />}
            {top.neck === 'fur' && <path d={`M ${k(-9)},-50 C ${k(-8)},-56 ${k(9)},-57 ${k(11)},-50 C ${k(9)},-46 ${k(-6)},-45 ${k(-9)},-50 Z`} fill={top.lining ?? '#c8b89a'} stroke={INK} strokeWidth={1} strokeDasharray="2 0.6" />}
          </g>
        }
      />
    </g>
  );
}

// --- Наколки ---------------------------------------------------------------------------------

const TAT = '#2b3f5c';

function ChestTattoo({ look, bw }: { look: Look; bw: number }) {
  const t = look.tattoos;
  return (
    <g opacity={0.8}>
      {t.includes('t_church') && (
        <g transform={`translate(${2 * bw} -34)`}>
          <path d="M -7,6 L -7,-2 L -4,-5 L -1,-2 L -1,6 M 1,6 L 1,-4 L 4,-8 L 7,-4 L 7,6 M -8,6 L 8,6" fill="none" stroke={TAT} strokeWidth={0.9} />
          <path d="M -4,-7 L -4,-9 M 4,-10 L 4,-13 M 3,-11.5 H 5" stroke={TAT} strokeWidth={0.8} />
        </g>
      )}
      {t.includes('t_stars') &&
        [-10 * bw, 13 * bw].map((x) => (
          <path key={x} transform={`translate(${x} -45) scale(0.9)`} d="M 0,-3 L 0.9,-0.9 L 3,-0.9 L 1.3,0.5 L 2,2.8 L 0,1.4 L -2,2.8 L -1.3,0.5 L -3,-0.9 L -0.9,-0.9 Z" fill={TAT} />
        ))}
      {t.includes('t_eagle') && (
        <g transform={`translate(${2 * bw} -14)`}>
          <path d="M -10,-2 C -6,-6 -3,-4 0,0 C 3,-4 6,-6 10,-2 C 6,-2 3,0 0,3 C -3,0 -6,-2 -10,-2 Z" fill="none" stroke={TAT} strokeWidth={0.9} />
        </g>
      )}
    </g>
  );
}

function ArmTattoo({ look, a, near, covered }: { look: Look; a: Mats['n']; near: boolean; covered: string }) {
  const t = look.tattoos;
  if (covered === 'long') return null;
  const up = near ? (t.includes('t_spider') ? 'spider' : t.includes('t_tiger') ? 'tiger' : null) : t.includes('t_rose') ? 'rose' : t.includes('t_cat') ? 'cat' : null;
  const fore = covered === 'none' || covered === 'short' ? (near ? (t.includes('t_cat') ? 'cat' : null) : t.includes('t_tiger') ? 'tiger' : null) : null;
  const glyph = (k: string | null) => {
    switch (k) {
      case 'spider':
        return <path d="M -3,-3 L 3,3 M 3,-3 L -3,3 M 0,-4 L 0,4 M -4,0 L 4,0" stroke={TAT} strokeWidth={0.7} fill="none" />;
      case 'tiger':
        return <path d="M -3,-2 C -1,-4 1,-4 3,-2 C 3,1 1,3 0,3 C -1,3 -3,1 -3,-2 Z M -1.5,-1 L -0.5,0 M 1.5,-1 L 0.5,0" stroke={TAT} strokeWidth={0.7} fill="none" />;
      case 'rose':
        return <path d="M 0,-2 C 2,-3 3,-1 1,1 C -1,2 -3,0 -1,-2 C 0,-3 1,-2 0,-1 M 0,1 L 0,5 M 0,3 L 2,2" stroke={TAT} strokeWidth={0.7} fill="none" />;
      case 'cat':
        return <path d="M -2.5,2 L -2.5,-2 L -1,-0.5 L 1,-0.5 L 2.5,-2 L 2.5,2 C 1,3.5 -1,3.5 -2.5,2 Z" stroke={TAT} strokeWidth={0.7} fill="none" />;
      default:
        return null;
    }
  };
  return (
    <g opacity={0.8}>
      {covered !== 'short' && up && <g transform={`${mat(a.s)} translate(1 18)`}>{glyph(up)}</g>}
      {fore && <g transform={`${mat(a.e)} translate(0.5 12)`}>{glyph(fore)}</g>}
    </g>
  );
}

// --- Портрет: только голова, для шапки, топа и полос здоровья ---------------------------------

export function RigHead({ look, size = 40, className }: { look: Look; size?: number; className?: string }) {
  const uid = useRef(`rh${++uidSeq}`).current;
  const skin = SKIN_TONES[look.skin ?? 0] ?? SKIN_TONES[0];
  return (
    <svg className={className} width={size} height={size} viewBox="-19 -47 48 52" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <ShadeDefs uid={uid} />
      </defs>
      <rect x={-19} y={-47} width={48} height={52} fill="#2a241c" />
      <path d="M -6,8 L -5,-2 L 7,-2 L 8,8 Z" fill={skin.base} stroke={INK} strokeWidth={1.2} />
      <Head look={look} pose={P0} uid={uid} skin={skin} />
    </svg>
  );
}

export { I as IDENTITY, S as SCALE };
