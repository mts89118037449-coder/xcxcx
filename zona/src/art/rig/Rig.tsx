// Персонаж-кукла на скелете (cutout-анимация): торс, голова, руки и ноги — отдельные части,
// повёрнутые вокруг суставов. Одежда рисуется поверх тех же частей и двигается вместе с ними.
// Швов не видно: у каждой конечности сначала общий контур всех её частей, потом заливка.
// Система координат как у старых поз: 120×210, ступни на y=210, центр x=60, лицом вправо.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { faceParts } from '../../../shared/content.ts';
import type { Look } from '../../../shared/types.ts';
import { HandInk, TATTOO_ART, Rings, armSlots, firstOf, handInks } from './tattoos.tsx';
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

export type RigAnim =
  | 'idle' | 'walk' | 'run' | 'sit' | 'floor' | 'guard' | 'punch' | 'hit' | 'ko' | 'cheer' | 'work' | 'crossed' | 'pullup'
  | 'smoke' | 'drink' | 'eat' | 'think' | 'stretch' | 'wave' | 'flex' | 'squat' | 'pushup' | 'sleep' | 'dance' | 'taunt' | 'kick' | 'dodge' | 'cold' | 'crouch';

/** Что персонаж держит в руках в этой анимации. */
export const ANIM_PROP: Partial<Record<RigAnim, 'cig' | 'mug' | 'bowl' | 'zzz' | 'hammer'>> = { smoke: 'cig', drink: 'mug', eat: 'bowl', sleep: 'zzz', work: 'hammer' };

/** Бытовые движения, которыми персонаж сам себя занимает, пока стоит без дела (длительность в мс). */
const FIDGETS: [RigAnim, number][] = [['smoke', 4400], ['think', 3600], ['drink', 3400], ['stretch', 2600], ['wave', 2000], ['flex', 2200], ['cold', 2600]];

/** Плавная «ступенька» 0→1 на отрезке [a, b]. */
const step = (x: number, a: number, b: number) => ease(Math.max(0, Math.min(1, (x - a) / (b - a))));

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
      return { ...P0, y: b * 0.5, lean: 2 + b * 0.6, nS: 10, nE: 28, nW: -34, fS: 14, fE: 24, fW: -34, fist: 1, nH: -7, fH: 9, head: -4 + Math.sin(s * 0.6) * 2, brow: 0.6 };
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
      const k = ease(Math.min(1, s / 0.5));
      const lie: Pose = { ...P0, root: -86, y: 84, x: 34, lean: 0, nS: -150, nE: -20, fS: -170, fE: -10, nH: -6, nK: 10, fH: 4, fK: 18, head: -8, brow: -1 };
      return mix(poseAt('guard', 0), lie, k);
    }
    case 'cheer': {
      // руки вверх буквой V: ближняя — чуть назад, чтобы не закрывать лицо
      const b = Math.abs(Math.sin(s * 5));
      return { ...P0, y: -b * 5, nS: -196 - b * 4, nE: 14, fS: -150, fE: -24, fist: 1, mouth: 1, brow: 0.4, nH: -6, fH: 8, nK: b * 6, head: -6 };
    }
    case 'work': {
      // молотком: медленный замах над головой, быстрый удар вниз, корпус чуть вперёд
      const c = (s * 1.7) % 1;
      const k = c < 0.6 ? ease(c / 0.6) : Math.max(0, 1 - (c - 0.6) / 0.12);
      return {
        ...P0,
        y: lerp(4, 1, k),
        lean: lerp(-9, 3, k),
        nH: -12, nK: 10, fH: 12, fK: 4,
        nS: lerp(-58, -170, k), nE: lerp(-28, -56, k), nW: lerp(-40, 10, k),
        fS: lerp(-4, -12, k), fE: lerp(-38, -56, k),
        fist: 1, head: lerp(12, 0, k), brow: 0.6, mouth: k < 0.1 ? 0.5 : 0,
      };
    }
    case 'smoke': {
      // затяжка: рука ко рту, выдох, рука вниз
      const c = s % 4.4;
      const up = step(c, 0, 0.6) - step(c, 1.8, 2.4);
      const b = Math.sin(s * 2.1);
      return { ...P0, y: b * 0.5, lean: 1, nS: lerp(-12, -36, up), nE: lerp(-64, -134, up), nW: lerp(-10, -16, up), fS: 8, fE: -14, head: lerp(2, -4, up), mouth: c > 2.4 && c < 3.2 ? 0.7 : 0, brow: 0.2 };
    }
    case 'drink': {
      const c = s % 3.4;
      const up = step(c, 0, 0.7) - step(c, 2.2, 2.9);
      return { ...P0, nS: lerp(-14, -40, up), nE: lerp(-70, -128, up), nW: -6, fS: 6, fE: -16, head: lerp(0, -10, up), lean: lerp(0, 3, up) };
    }
    case 'eat': {
      // сидя: миска в дальней руке, ложка — от миски ко рту
      const b = Math.sin(s * 1.9);
      const up = (1 - Math.cos(s * 3.2)) / 2;
      return { ...poseAt('sit', t), lean: -6 + b * 0.5, fS: -24, fE: -84, fW: -30, nS: lerp(-26, -36, up), nE: lerp(-76, -132, up), nW: -10, fist: 1, head: lerp(10, 2, up), mouth: up > 0.85 ? 0.6 : 0 };
    }
    case 'think': {
      const b = Math.sin(s * 1.3);
      return { ...P0, y: b * 0.4, nS: -22, nE: -128, nW: -26, fist: 1, fS: 10, fE: -40, head: 5 + b * 2, lean: 2, brow: 0.5 + b * 0.3 };
    }
    case 'stretch': {
      const k = step(s, 0, 0.6) - step(s, 1.8, 2.5);
      return { ...P0, y: -1.5 * k, lean: 4 * k, nS: lerp(-3, -168, k), nE: lerp(-10, -20, k), fS: lerp(6, -160, k), fE: lerp(-12, -26, k), head: -8 * k, mouth: k > 0.7 ? 1 : 0, brow: -0.4 * k };
    }
    case 'wave': {
      const k = step(s, 0, 0.3) - step(s, 1.6, 2);
      // машет над головой, а не перед лицом
      return { ...P0, nS: lerp(-3, -192, k), nE: lerp(-10, 18 + 22 * Math.sin(s * 14), k), nW: 10 * Math.sin(s * 14) * k, mouth: k > 0.5 ? 0.6 : 0, head: -3 * k };
    }
    case 'flex': {
      // «двойной бицепс» — похвастаться обновкой
      const k = step(s, 0, 0.35) - step(s, 1.7, 2.2);
      const b = Math.sin(s * 9) * 3 * k;
      return { ...P0, lean: -3 * k, nS: lerp(-3, -84, k), nE: lerp(-10, -112 + b, k), fS: lerp(6, -96, k), fE: lerp(-12, -104 - b, k), fist: k > 0.3 ? 1 : 0, brow: k, head: -4 * k, nH: -8, fH: 10 };
    }
    case 'cold': {
      // обхватил себя руками и дрожит
      const tr = Math.sin(s * 40) * 0.8;
      return { ...P0, y: 2, lean: -4 + tr * 0.4, nS: -4, nE: -100, nW: -10, fS: 8, fE: -34, fist: 1, head: 8 + tr, brow: -0.8, nH: -2, fH: 2 };
    }
    case 'squat': {
      const k = (1 - Math.cos(s * 3.6)) / 2;
      return { ...P0, x: -14 * k, y: 44 * k, lean: -22 * k, nH: -84 * k, nK: 124 * k, fH: -80 * k, fK: 120 * k, nS: -84 * k, nE: -8, fS: -90 * k, fE: -6, fist: 1, head: 8 * k, brow: k };
    }
    case 'crouch': {
      // «на кортах»: сидит на пятках, локти на коленях, покачивается и поглядывает по сторонам
      const b = Math.sin(s * 1.4);
      const sq = poseAt('squat', Math.PI / 3.6 * 1000);
      return { ...sq, y: sq.y + b * 0.8, lean: -14, nS: -62, nE: 34, nW: 10, fS: -52, fE: 28, fist: 0, head: 6 + Math.sin(s * 0.5) * 6, brow: 0.3 };
    }
    case 'pushup': {
      // тело прямое, опора на носки и ладони; вниз — локти назад
      const k = (1 - Math.cos(s * 3.8)) / 2;
      const root = lerp(64, 76, k);
      return { ...P0, x: 16, y: lerp(56, 70, k), root, nS: lerp(-root, 38 - root, k), nE: lerp(0, -48, k), fS: lerp(-root - 4, 34 - root, k), fE: lerp(0, -44, k), nW: 70 - root / 2, fW: 70 - root / 2, nH: 0, nK: 0, fH: 2, fK: 0, head: -28, brow: 0.6 + k * 0.4, fist: 0 };
    }
    case 'sleep': {
      const b = Math.sin(s * 1.4);
      return { ...P0, root: -88, y: 86, x: 34, lean: b * 1.2, nS: 8, nE: -26, nW: -10, fS: -6, fE: -40, nH: -4, nK: 22, fH: -10, fK: 30, head: -6, brow: -0.2 };
    }
    case 'dance': {
      const ph = s * Math.PI * 2 * 1.3;
      const b = Math.abs(Math.sin(ph));
      return {
        ...P0,
        y: -b * 4 + 2,
        lean: 6 * Math.sin(ph),
        nS: -100 + 40 * Math.sin(ph), nE: -40, fS: -60 - 40 * Math.sin(ph), fE: -60,
        nH: -40 * Math.max(0, Math.sin(ph)), nK: 60 * Math.max(0, Math.sin(ph)),
        fH: -40 * Math.max(0, -Math.sin(ph)), fK: 60 * Math.max(0, -Math.sin(ph)),
        head: 6 * Math.sin(ph * 0.5), mouth: 1, fist: 1,
      };
    }
    case 'taunt': {
      // «иди сюда»: ладонь вверх, пальцы подманивают
      const b = Math.sin(s * 7);
      return { ...poseAt('guard', t), lean: 4, nS: -70, nE: -30, nW: -40 + 24 * b, fist: 0, head: -8, brow: 1, mouth: Math.sin(s * 1.6) > 0.6 ? 1 : 0 };
    }
    case 'kick': {
      // прямой удар ногой и возврат в стойку
      const g = poseAt('guard', t);
      const hit: Pose = { ...g, x: 4, lean: 16, nH: -96, nK: 6, nA: -30, fH: 8, fK: 12, nS: -30, nE: -110, fS: -20, fE: -120, head: 4, mouth: 1 };
      const k = s < 0.14 ? ease(s / 0.14) : s < 0.34 ? 1 : s < 0.6 ? 1 - ease((s - 0.34) / 0.26) : 0;
      return mix(g, hit, k);
    }
    case 'dodge': {
      // уклон назад: корпус отклоняется, удар проходит мимо
      const g = poseAt('guard', t);
      const out: Pose = { ...g, x: -8, lean: 24, head: -10, nH: -30, nK: 18, fH: 24, fK: 24, y: 9 };
      const k = s < 0.12 ? ease(s / 0.12) : s < 0.4 ? 1 : s < 0.7 ? 1 - ease((s - 0.4) / 0.3) : 0;
      return mix(g, out, k);
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
    case 'check':
      return (
        <pattern id={id} width={8} height={8} patternUnits="userSpaceOnUse">
          <rect width={8} height={8} fill={c1} />
          <rect width={8} height={2.6} y={2.7} fill={c2} opacity={0.45} />
          <rect width={2.6} height={8} x={2.7} fill={c2} opacity={0.45} />
          <path d="M 0,7.5 H 8 M 7.5,0 V 8" stroke={shade(c1, 0.3)} strokeWidth={0.5} />
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

/** Один на весь риг набор: мягкий объём, блик кожи, штриховка теней. Свет справа-сверху. */
function ShadeDefs({ uid }: { uid: string }) {
  return (
    <>
      <linearGradient id={`${uid}-sh`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity={0.22} />
        <stop offset="0.4" stopColor="#000" stopOpacity={0.04} />
        <stop offset="0.62" stopColor="#fff" stopOpacity={0.06} />
        <stop offset="0.8" stopColor="#fff" stopOpacity={0.1} />
        <stop offset="1" stopColor="#000" stopOpacity={0.14} />
      </linearGradient>
      <linearGradient id={`${uid}-gl`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0.55" stopColor="#fff" stopOpacity={0} />
        <stop offset="0.7" stopColor="#fff" stopOpacity={0.32} />
        <stop offset="0.8" stopColor="#fff" stopOpacity={0} />
      </linearGradient>
      <radialGradient id={`${uid}-face`} cx="0.66" cy="0.42" r="0.75">
        <stop offset="0" stopColor="#fff" stopOpacity={0.12} />
        <stop offset="0.55" stopColor="#000" stopOpacity={0} />
        <stop offset="1" stopColor="#000" stopOpacity={0.2} />
      </radialGradient>
      <pattern id={`${uid}-hatch`} width={2.4} height={2.4} patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
        <path d="M 0,0 V 2.4" stroke={INK} strokeWidth={0.5} />
      </pattern>
    </>
  );
}

// --- Формы частей тела (локально: сустав в 0,0, часть идёт вниз по +y) -----------------

type Pt = [number, number];
const f2 = (v: number) => +v.toFixed(2);

/** Плавная кривая через точки (Катмулл-Ром → кубические Безье), без начального M. */
function cr(pts: Pt[], closed = false): string {
  const n = pts.length;
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = '';
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += ` C ${f2(p1[0] + (p2[0] - p0[0]) / 6)},${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)},${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])},${f2(p2[1])}`;
  }
  return d;
}

/** Профиль конечности: [доля длины, полуширина спереди, полуширина сзади] при толщине 1. */
type Station = [number, number, number];

const UPPER_ARM: Station[] = [[0, 6, 6], [0.18, 6.7, 6.2], [0.45, 6.2, 6], [0.75, 5.1, 5], [1, 4.4, 4.3]];
const FOREARM: Station[] = [[0, 4.4, 4.3], [0.22, 4.7, 5.1], [0.55, 3.9, 3.9], [0.85, 3.2, 3.2], [1, 3, 3]];
const THIGH: Station[] = [[0, 8.2, 8.3], [0.25, 8.7, 8], [0.6, 7.3, 6.8], [0.88, 5.9, 5.6], [1, 5.6, 5.4]];
const SHIN: Station[] = [[0, 5.5, 5.4], [0.12, 5.2, 6.2], [0.32, 4.6, 6.4], [0.65, 3.8, 4.2], [1, 3.2, 3.4]];
// ткань не повторяет мышцы — ровнее
const SLEEVE_UP: Station[] = [[0, 6.1, 6.1], [0.5, 5.8, 5.6], [1, 4.8, 4.6]];
const SLEEVE_FORE: Station[] = [[0, 4.8, 4.8], [0.5, 4.3, 4.4], [1, 3.9, 3.9]];
const TROUSER_UP: Station[] = [[0, 8.4, 8.4], [0.5, 7.7, 7.3], [1, 6.2, 6]];
const TROUSER_LOW: Station[] = [[0, 6, 6], [0.5, 5.3, 5.6], [1, 5.3, 5.3]];

function widthAt(st: Station[], t: number): [number, number] {
  for (let i = 1; i < st.length; i++) {
    if (t <= st[i][0]) {
      const [t0, a0, b0] = st[i - 1];
      const [t1, a1, b1] = st[i];
      const k = (t - t0) / (t1 - t0 || 1);
      return [a0 + (a1 - a0) * k, b0 + (b1 - b0) * k];
    }
  }
  const l = st[st.length - 1];
  return [l[1], l[2]];
}

/**
 * Конечность: контур, собственная тень (полумесяц сзади — со стороны от света) и блик спереди.
 * L — полная длина кости, len — сколько рисовать (короткий рукав), s — толщина, p — запас ткани.
 */
function limb(st: Station[], L: number, s: number, p = 0, len = L): Part {
  const ts = [...st.map((x) => x[0]).filter((t) => t * L < len - 0.5), len / L];
  const W = ts.map((t) => {
    const [f, b] = widthAt(st, t);
    return { y: t * L, f: f * s + p, b: b * s + p };
  });
  const front: Pt[] = W.map((w) => [w.f, w.y]);
  const back: Pt[] = W.map((w): Pt => [-w.b, w.y]).reverse();
  const e = W[W.length - 1];
  const o = W[0];
  const d = `M ${f2(front[0][0])},0${cr(front)} A ${f2((e.f + e.b) / 2)},${f2((e.f + e.b) / 2.4)} 0 0 1 ${f2(-e.b)},${f2(e.y)}${cr(back)} A ${f2((o.f + o.b) / 2)},${f2((o.f + o.b) / 2)} 0 0 1 ${f2(o.f)},0 Z`;
  const inner: Pt[] = W.map((w) => [-w.b + 0.36 * (w.f + w.b), w.y]);
  const sh = `M -40,-12 L ${f2(inner[0][0])},-12${cr([[inner[0][0], -12], ...inner, [inner[inner.length - 1][0], e.y + 12]])} L -40,${f2(e.y + 12)} Z`;
  const hlPts: Pt[] = W.filter((w) => w.y > len * 0.08 && w.y < len * 0.8).map((w) => [w.f - 0.24 * (w.f + w.b), w.y]);
  const hl = hlPts.length > 1 ? `M ${f2(hlPts[0][0])},${f2(hlPts[0][1])}${cr(hlPts)}` : undefined;
  return { m: I, d, sh, hl };
}

interface Body {
  bw: number; // ширина корпуса
  mw: number; // толщина рук и ног
}

const ARM = { up: 30, fore: 27 };
const LEG = { thigh: 44, shin: 42 };

/** Корпус: таз, талия, широчайшие, плечи, трапеции, грудь, рёбра, живот. g — толщина одежды. */
function torsoPath(bw: number, g: number, hem: number): string {
  const k = (x: number) => x * bw + Math.sign(x) * g;
  const pts: Pt[] = [
    [k(-14), 2 + hem],
    [k(-12.8), -12],
    [k(-15), -28],
    [k(-15.4), -41],
    [k(-11), -48.6],
    [k(-4.5), -51.8],
    [k(5.5), -51.8],
    [k(12.5), -49.4],
    [k(18), -44.6],
    [k(19.2), -36],
    [k(16.4), -28.4],
    [k(13.6), -20],
    [k(12.8), -12],
    [k(13.6), -5],
    [k(14), 2 + hem],
    [0, 3.4 + hem],
  ];
  return `M ${f2(pts[0][0])},${f2(pts[0][1])}${cr(pts)} Z`;
}

/** Собственная тень корпуса: полоса вдоль спины и широчайших. */
function torsoShade(bw: number, g: number): string {
  const k = (x: number) => x * bw + Math.sign(x) * g;
  return `M -60,12 L -60,-70 L ${f2(k(-9))},-70 C ${f2(k(-9.6))},-48 ${f2(k(-8.2))},-38 ${f2(k(-8.6))},-27 C ${f2(k(-9))},-16 ${f2(k(-7.6))},-6 ${f2(k(-9))},12 Z`;
}

interface Part {
  m: M;
  d: string;
  sh?: string; // собственная тень (обрезается по контуру части)
  hl?: string; // блик
  ln?: string; // линии-детали (пальцы, шнурки)
}

/**
 * Рисует части по цепочке: сначала общий контур всех частей, потом у каждой заливка, тень и блик.
 * Следующая часть закрывает тень предыдущей на стыке — шва не видно.
 */
function Chain({ parts, fill, uid, gloss, extra, shadeC = '#000', shadeO = 0.26, hatch = true }: { parts: Part[]; fill: string; uid: string; gloss?: boolean; extra?: ReactNode; shadeC?: string; shadeO?: number; hatch?: boolean }) {
  const cid = `${uid}c${useId().replace(/[^a-z0-9]/gi, '')}`;
  return (
    <g>
      {parts.map((p, i) => (
        <path key={`o${i}`} transform={mat(p.m)} d={p.d} fill={INK} stroke={INK} strokeWidth={2.3} strokeLinejoin="round" />
      ))}
      {parts.map((p, i) => (
        <g key={`f${i}`} transform={mat(p.m)}>
          <path d={p.d} fill={fill} />
          <path d={p.d} fill={`url(#${uid}-sh)`} />
          {p.sh && (
            <>
              <clipPath id={`${cid}-${i}`}>
                <path d={p.d} />
              </clipPath>
              <g clipPath={`url(#${cid}-${i})`}>
                <path d={p.sh} fill={shadeC} opacity={shadeO} />
                {hatch && <path d={p.sh} fill={`url(#${uid}-hatch)`} opacity={0.16} />}
              </g>
            </>
          )}
          {gloss && <path d={p.d} fill={`url(#${uid}-gl)`} />}
          {p.hl && <path d={p.hl} fill="none" stroke="#fff" strokeOpacity={gloss ? 0.4 : 0.22} strokeWidth={1.3} strokeLinecap="round" />}
          {p.ln && <path d={p.ln} fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={0.7} strokeLinecap="round" />}
        </g>
      ))}
      {extra}
    </g>
  );
}

// --- Голова ---------------------------------------------------------------------------------
// Вполоборота вправо: профиль носа, губ и подбородка — на контуре, дальний глаз меньше ближнего.

const HEAD_SCALE = [0.86, 0.8];

/** Череп и лицо; jaw: 0 — обычная, 1 — узкая, 2 — тяжёлая челюсть. */
function headPath(jaw: number): string {
  const [dx, dy] = [[0, 0], [1, -0.8], [-1.4, 1.4]][jaw] ?? [0, 0];
  return [
    `M ${-9 + dx},-15`,
    `C ${-7 + dx},${-4 + dy} ${0 + dx * 0.5},${2.5 + dy} 5.5,${3 + dy}`,
    `C 9,${3.2 + dy} 11.2,${1.5 + dy * 0.6} 11.8,-1`,
    'C 12.2,-2.6 12.2,-3.6 13.2,-4.6',
    'C 13.8,-5.6 13.2,-6.6 13,-7.4',
    'C 14.4,-7.8 15.8,-9 15.6,-10.6',
    'C 15.2,-12.6 13.6,-15 12.8,-18',
    'C 13.8,-19.2 14,-20.8 13.2,-22.2',
    'C 13.8,-27 12.6,-32 9,-35.8',
    'C 4,-40.6 -5,-40 -9.6,-33.6',
    `C -13.6,-28 -13,-19.6 ${-9 + dx},-15 Z`,
  ].join(' ');
}

function Head({ look, pose, uid, skin, fx }: { look: Look; pose: Pose; uid: string; skin: (typeof SKIN_TONES)[number]; fx?: FaceFx }) {
  const fp = faceParts(look.face ?? 0);
  const hairC = HAIR_COLORS[(look.face ?? 0) % HAIR_COLORS.length];
  const hat = look.equipped.head ? HATS[look.equipped.head] : undefined;
  const full = headPath(fp.jaw);
  const angry = pose.brow;
  const clip = `${uid}-head`;
  // брови: внутренние концы опускаются, когда злой
  const nIn = -22.6 + angry * 1.2;
  const nOut = -22 - angry * 0.5;
  const fIn = -22.6 + angry * 1.1;
  const thick = fp.brow === 1 ? 1.9 : 1.3;
  return (
    <g transform={`scale(${HEAD_SCALE[0]} ${HEAD_SCALE[1]})`}>
      <clipPath id={clip}>
        <path d={full} />
      </clipPath>
      {/* голова */}
      <path d={full} fill={INK} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <path d={full} fill={skin.base} />
      <g clipPath={`url(#${clip})`}>
        <path d={full} fill={`url(#${uid}-face)`} />
        {/* собственная тень: затылок, под челюстью */}
        <path d="M -9,-15 C -13,-19.6 -13.6,-28 -9.6,-33.6 C -8.2,-35.6 -6.4,-37 -4.4,-38 C -7.4,-33 -8.6,-27 -7.8,-22 C -7,-17 -4,-11 -0.4,-6.8 C 2,-4 3.6,-0.4 5.5,4 C 0,4 -6,-4 -9,-15 Z" fill={skin.shade} opacity={0.55} />
        {/* глазницы и тень под носом */}
        <path d="M 0,-19.4 C 0.8,-22.6 6.8,-23 7.8,-20.4 C 6.6,-21.2 4.4,-21.4 2.6,-21 C 1.6,-20.8 0.6,-20.2 0,-19.4 Z" fill={skin.shade} opacity={0.55} />
        <path d="M 10.2,-20.2 C 11,-21.8 13.2,-22 13.8,-20.6 C 12.6,-21 11.2,-20.8 10.2,-20.2 Z" fill={skin.shade} opacity={0.55} />
        <path d="M 10.4,-8.2 C 11.6,-7.2 13.2,-7 14,-7.8 C 13.4,-6.6 11.4,-6.4 10.4,-8.2 Z" fill={skin.shade} opacity={0.8} />
        {/* скула, носогубка, подбородок */}
        <path d="M 5.4,-13.4 C 7,-12.6 8.6,-12.6 9.8,-13.2" fill="none" stroke={skin.shade} strokeWidth={0.7} strokeLinecap="round" opacity={0.5} />
        <path d="M 11.2,-8.6 C 9.8,-7.6 9,-6.2 9.1,-4.8" fill="none" stroke={skin.shade} strokeWidth={0.8} strokeLinecap="round" />
        <path d="M 8.4,-1.2 C 9.4,-0.6 10.6,-0.8 11.2,-1.6" fill="none" stroke={skin.shade} strokeWidth={0.8} strokeLinecap="round" />
        {/* блик на лбу */}
        <path d="M 3.6,-33.6 C 7,-34.4 10,-31.6 11,-27.6" fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={1.6} strokeLinecap="round" />
        <path d="M 13.2,-16.6 C 14,-14.4 14.8,-12.6 15,-11" fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={0.9} strokeLinecap="round" />
      </g>
      {/* фингал: синяк вокруг ближнего глаза */}
      {fx?.bruise && (
        <g clipPath={`url(#${clip})`}>
          <ellipse cx={3.8} cy={-18.6} rx={4.6} ry={3.6} fill="#5a2a6a" opacity={0.5} />
          <ellipse cx={3.8} cy={-17.6} rx={3.6} ry={2.2} fill="#7a3a5a" opacity={0.35} />
        </g>
      )}
      {/* глаза вполоборота: ближний крупный, дальний за переносицей и частично закрыт контуром */}
      <path d="M 1,-19.2 C 2,-20.7 4.9,-20.9 6.3,-19.4 C 5,-18 2.4,-17.8 1,-19.2 Z" fill="#efe8dc" />
      <circle cx={4} cy={-19.3} r={1.3} fill="#3a2a1c" />
      <circle cx={4.1} cy={-19.3} r={0.7} fill="#0e0a08" />
      <circle cx={4.5} cy={-19.8} r={0.35} fill="#fff" />
      <path d="M 0.5,-18.9 C 1.8,-21.1 5.1,-21.4 6.7,-19.3" fill="none" stroke={INK} strokeWidth={1.3} strokeLinecap="round" />
      <path d="M 2,-18.2 C 3.3,-17.5 4.8,-17.6 5.8,-18.4" fill="none" stroke={skin.shade} strokeWidth={0.6} />
      <path
        d={`M -0.4,${nOut + 0.4} C 1.8,${nOut - 1.6} 4.8,${nIn - 1.6} 7.2,${nIn} C 4.8,${nIn - 1.6 + thick} 2,${nOut - 1.4 + thick} -0.4,${nOut + 0.4} Z`}
        fill={hairC}
        stroke={hairC}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <g clipPath={`url(#${clip})`}>
        <path d="M 10,-19.4 C 10.6,-20.4 12.2,-20.6 13,-19.6 C 12.4,-18.6 10.8,-18.6 10,-19.4 Z" fill="#efe8dc" />
        <circle cx={11.7} cy={-19.5} r={0.95} fill="#0e0a08" />
        <path d="M 9.7,-19.2 C 10.6,-20.9 12.6,-20.9 13.4,-19.5" fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
        <path d={`M 9.8,${fIn} C 11,${fIn - 1.4} 12.6,${fIn - 1.2} 14,${fIn + 0.2} C 12.8,${fIn - 0.6 + thick * 0.8} 11.2,${fIn - 0.4 + thick * 0.8} 9.8,${fIn} Z`} fill={hairC} stroke={hairC} strokeWidth={0.5} />
      </g>
      {angry > 0.3 && <path d="M 8.2,-24.2 L 8.6,-22.6" stroke={skin.shade} strokeWidth={0.7} />}
      {/* нос: крыло и ноздря */}
      <path d="M 8.6,-18.4 C 8.2,-15.4 8.6,-12.6 10.2,-10.6" fill="none" stroke={skin.shade} strokeWidth={0.9} strokeLinecap="round" />
      <path d="M 11,-10.4 C 11.2,-8.8 12.8,-8.4 13.8,-9.2" fill="none" stroke={INK} strokeWidth={0.9} strokeLinecap="round" />
      {/* рот */}
      {pose.mouth > 0.5 ? (
        <g>
          <path d="M 6.8,-5.2 C 9.2,-4.4 11.8,-4.6 13.1,-5.6 C 12.9,-1.8 8.6,-1.2 6.8,-5.2 Z" fill="#3a1812" stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
          <path d="M 8.8,-4.9 C 10.4,-4.5 11.8,-4.5 12.8,-5.1 L 12.6,-4.3 C 11.4,-3.9 10,-4 8.9,-4.3 Z" fill="#ece4d6" />
        </g>
      ) : (
        <g>
          <path d={fx?.smile ? 'M 6.4,-5.6 C 8.6,-3.4 11.4,-3.4 13.1,-5.8' : angry < 0 ? 'M 6.6,-3.9 C 8.8,-5 11.2,-5.1 12.9,-4.5' : 'M 6.6,-4.4 C 8.8,-4.1 11.2,-4.2 12.9,-4.9'} fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
          {fx?.smile && <path d="M 13,-6.4 C 13.6,-6 13.8,-5.4 13.6,-4.8" fill="none" stroke={skin.shade} strokeWidth={0.7} />}
          <path d="M 8.4,-3 C 10,-2.6 11.6,-2.8 12.4,-3.4" fill="none" stroke={skin.shade} strokeWidth={0.8} strokeLinecap="round" />
        </g>
      )}
      {look.equipped.charm === 'charm_fiksa' &&
        (pose.mouth > 0.5 ? <rect x={10.2} y={-5.1} width={1.6} height={1.3} rx={0.3} fill="#f0c850" stroke={INK} strokeWidth={0.3} /> : <path d="M 10.2,-4.3 L 11.8,-4.5" stroke="#f0c850" strokeWidth={1} strokeLinecap="round" />)}
      <Beard kind={fp.beard} color={hairC} jaw={fp.jaw} clip={clip} />
      {/* кровь из разбитой губы */}
      {fx?.blood && (
        <g>
          <path d="M 7.4,-4 C 7.9,-2.4 7.2,-0.6 7.6,1.4" fill="none" stroke="#9a1414" strokeWidth={1.3} strokeLinecap="round" />
          <circle className="face-drip" cx={7.6} cy={2.2} r={0.9} fill="#b01a1a" />
          <path d="M 12.6,-8.8 C 12.8,-7.8 12.4,-7.2 12.7,-6.4" fill="none" stroke="#9a1414" strokeWidth={0.9} strokeLinecap="round" />
        </g>
      )}
      {fx?.breath && (
        <g className="face-breath">
          <circle cx={17} cy={-5} r={2.2} fill="#fff" opacity={0.5} />
          <circle cx={21} cy={-7} r={3} fill="#fff" opacity={0.35} />
          <circle cx={26} cy={-9} r={3.6} fill="#fff" opacity={0.2} />
        </g>
      )}
      {/* пот: капли на виске и лбу */}
      {fx?.sweat && (
        <g>
          {[[0.5, -24.5, 0], [-6.5, -20, 0.7], [14.2, -15.5, 1.3]].map(([x, y, d]) => (
            <path key={x} className="face-sweat" style={{ animationDelay: `${d}s` }} d={`M ${x},${y} C ${x - 1},${y + 1.6} ${x - 1},${y + 2.8} ${x},${y + 3} C ${x + 1},${y + 2.8} ${x + 1},${y + 1.6} ${x},${y} Z`} fill="#cfe6f4" stroke="#7aa6c4" strokeWidth={0.4} />
          ))}
        </g>
      )}
      {!hat && <Hair kind={fp.hair} color={hairC} />}
      {/* ухо поверх волос */}
      <g transform="translate(-2.4 0.6)">
      <path d="M -5.4,-21.6 C -4,-24.4 -0.6,-24 -0.4,-20.6 C -0.2,-17.4 -1.8,-14.6 -4,-14.4 C -5.6,-14.4 -6.2,-16.4 -5.8,-18 Z" fill={skin.base} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M -2,-21.4 C -1,-20.2 -1.2,-18 -2.8,-16.8 M -3.6,-20.4 C -3,-19.6 -3,-18.6 -3.6,-18" fill="none" stroke={skin.shade} strokeWidth={0.8} strokeLinecap="round" />
      </g>
      {hat && (
        <g transform="translate(0.2 0) scale(1.08 1) translate(-1.75 0)">
          <Hat h={hat} />
        </g>
      )}
    </g>
  );
}

function Beard({ kind, color, jaw, clip }: { kind: number; color: string; jaw: number; clip: string }) {
  const low = jaw === 2 ? 1.4 : jaw === 1 ? -0.8 : 0;
  const stache = 'M 8,-6.8 C 9.8,-8 12.4,-8 13.6,-6.8 C 13.4,-5.6 12.4,-5.4 11.8,-6 C 10.6,-6.4 9.2,-6.2 8.4,-5.6 C 7.6,-5.4 7.4,-6.2 8,-6.8 Z';
  switch (kind) {
    case 1: // щетина — по челюсти и над губой
      return (
        <g clipPath={`url(#${clip})`} opacity={0.34}>
          <path d={`M -9,-15 C -6,-4 0,${3 + low} 5.5,${3.4 + low} C 9,${3.6 + low} 12,${1.5 + low} 13,-3.6 C 11,-3 9,-2.4 7,-3.6 C 3,-6 -1,-10 -3,-14 Z`} fill={color} />
          <path d="M 8.4,-6.4 C 10,-7.6 12.4,-7.6 13.6,-6.6 L 13.4,-5.6 C 12,-6 9.8,-5.8 8.4,-5.4 Z" fill={color} />
        </g>
      );
    case 2: // борода
      return (
        <g>
          <path d={`M -8.8,-15 C -8.6,-4 -3,${5.6 + low} 3.8,${7 + low} C 9,${7.4 + low} 12.6,${3 + low} 13.4,-4 C 12,-3 10.6,-2.4 9.4,-2.8 C 8,-3.4 6.6,-3.6 5.4,-2.8 C 2,-4.4 -2,-8 -4.4,-14 Z`} fill={color} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
          <path d={`M -1,-2 C 1,${2 + low} 4,${4.6 + low} 7,${5 + low} M 3,-1 C 5,${2 + low} 8,${3 + low} 10,${2 + low}`} fill="none" stroke={shade(color, 0.25)} strokeWidth={0.7} />
          <path d={stache} fill={color} />
        </g>
      );
    case 3: // усы
      return <path d={stache} fill={color} stroke={INK} strokeWidth={0.6} strokeLinejoin="round" />;
    case 4: // эспаньолка
      return (
        <g>
          <path d={stache} fill={color} />
          <path d={`M 8,-3 C 8.2,${0 + low} 9.2,${3 + low} 10.6,${3.4 + low} C 12,${3 + low} 12.6,${0 + low} 12.6,-2.6 C 11,-2 9.6,-2 8,-3 Z`} fill={color} stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />
        </g>
      );
    case 5: // густая борода с усами
      return (
        <g>
          <path d={`M -9.6,-19 C -10,-3 -3,${9 + low} 4,${10 + low} C 10,${10 + low} 14.4,${4 + low} 14,-5 C 12.4,-3.4 10.8,-2.6 9.4,-3 C 8,-3.6 6.4,-3.8 5.2,-3 C 1,-5 -3,-10 -5,-17 Z`} fill={color} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
          <path d={`M -4,-6 C -2,${2 + low} 1,${6 + low} 5,${7.4 + low} M 1,-3 C 3,${2 + low} 6,${4.4 + low} 9,${4.6 + low} M -6,-12 C -5,-8 -4,-6 -2,-3`} fill="none" stroke={shade(color, 0.25)} strokeWidth={0.7} />
          <path d="M 7.4,-7.2 C 9.6,-8.6 12.6,-8.6 14,-7 C 13.6,-5.2 12.2,-5 11.6,-5.8 C 10.4,-6.2 8.8,-6 7.8,-5.2 C 6.8,-5 6.6,-6.4 7.4,-7.2 Z" fill={color} stroke={INK} strokeWidth={0.5} />
        </g>
      );
    default:
      return null;
  }
}

/** Волосы по форме нового черепа: шапка волос, линия роста, висок перед ухом. */
function Hair({ kind, color }: { kind: number; color: string }) {
  const cap = 'M 13.4,-27.2 C 14,-32 11.4,-37.2 7,-39.8 C 1,-42.8 -7.2,-41.2 -11.8,-35 C -15.2,-30 -15,-21 -11,-14.6 C -8.6,-15.4 -6.6,-17 -5.2,-19 L -2,-17.4 C -1.6,-21 -0.8,-24.6 1.8,-27 C 5,-29.4 9.6,-29 13.4,-27.2 Z';
  const hi = shade(color, 0.28);
  switch (kind) {
    case 0: // лысый: блик
      return <path d="M -2,-37.6 C 3,-39.4 8.6,-37.6 11,-33.4" fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={1.8} strokeLinecap="round" />;
    case 1: // ёжик
      return <path d={cap} fill={color} opacity={0.72} />;
    case 7: // седой ёжик
      return <path d={cap} fill="#9a968e" opacity={0.8} />;
    case 2: // короткая стрижка
      return (
        <g>
          <path d="M 14,-26.4 C 15,-32.6 12,-38.6 7,-41.2 C 0.4,-44.4 -8,-42.4 -12.6,-35.6 C -16,-30 -15.6,-21 -11.4,-14.2 C -8.8,-15 -6.6,-17 -5.2,-19 L -2,-17.4 C -1.6,-21.4 -0.4,-25 2.4,-27.6 C 4.8,-29.2 7.2,-28.4 8.6,-29.8 C 10.2,-28.2 12.2,-27.4 14,-26.4 Z" fill={color} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
          <path d="M -8,-36 C -4,-39.6 2,-40.6 7,-38.6 M -11,-30 C -8,-34 -3,-36 2,-35.4" fill="none" stroke={hi} strokeWidth={0.8} strokeLinecap="round" />
        </g>
      );
    case 3: // зачёс назад
      return (
        <g>
          <path d="M 13.6,-28 C 15,-35 11.6,-41.8 5,-43.4 C -3,-45.4 -11,-41.6 -13.6,-34 C -15.4,-28 -14.4,-20 -11,-14.4 C -8.6,-15.2 -6.6,-17 -5.2,-19 L -2,-17.4 C -1.6,-22 0,-27.4 4.2,-30.4 C 7.4,-32 11,-30.6 13.6,-28 Z" fill={color} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
          <path d="M 11,-31.6 C 6,-37 -2,-39 -9,-35.4 M 8,-29.4 C 3,-34 -3,-35 -10,-31 M 12.6,-34 C 8,-40 1,-41.6 -5,-40" fill="none" stroke={hi} strokeWidth={0.8} strokeLinecap="round" />
        </g>
      );
    case 4: // чёлка
      return (
        <g>
          <path d="M 14.2,-25 C 15.4,-33 12,-39.6 6,-41.8 C -1,-44.4 -9,-42 -12.8,-35.4 C -16,-29.6 -15.4,-21 -11.4,-14.2 C -8.8,-15 -6.6,-17 -5.2,-19 L -2,-17.4 C -1.6,-21 -0.4,-24 1.6,-25.8 C 3,-24.6 4.6,-24.4 5.8,-25.6 C 7.2,-24 9.2,-23.8 10.4,-25 C 11.6,-24 13,-24 14.2,-25 Z" fill={color} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
          <path d="M 3,-26 C 3.4,-30 5,-34 8,-37 M 7.6,-25.6 C 8.4,-30 10,-33 12,-35" fill="none" stroke={hi} strokeWidth={0.8} strokeLinecap="round" />
        </g>
      );
    case 5: // бритые виски, гребень
      return (
        <g>
          <path d={cap} fill={color} opacity={0.28} />
          <path d="M -8,-38.6 C -3,-45.6 7,-45.4 12,-37.6 C 9,-40 -3,-41 -8,-38.6 Z" fill={color} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
        </g>
      );
    default: // 6: длинные, до плеч
      return (
        <g>
          <path d="M 14,-26.4 C 15.2,-34 11.6,-40.6 5,-42.8 C -3,-45.2 -11.4,-41.4 -14.4,-33.6 C -16.6,-26 -15.6,-14 -12.6,-6 C -10.6,-5 -8.6,-5.4 -7,-6.6 C -7.2,-11 -6.6,-15.4 -5.2,-19 L -2,-17.4 C -1.4,-22 0.4,-26.4 4,-28.6 C 7.4,-30 11,-28.6 14,-26.4 Z" fill={color} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
          <path d="M -12,-10 C -13,-20 -12,-30 -6,-36 M -9,-9 C -10,-18 -8,-27 -3,-33 M 6,-38 C 0,-38 -5,-34 -7,-28" fill="none" stroke={hi} strokeWidth={0.8} strokeLinecap="round" />
        </g>
      );
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
    case 'baseball':
      return (
        <g>
          <path d="M -12,-25 C -13.4,-36 -4,-43 5,-43 C 14.6,-43 18.6,-35.6 17,-27 C 8,-29.6 -3,-29 -12,-25 Z" fill={h.color} stroke={INK} strokeWidth={1.4} />
          <path d="M 7,-28.6 C 14,-29.6 22,-28.4 26,-25.6 C 20,-23.4 12,-24 6.4,-25.6 Z" fill={shade(h.color, -0.25)} stroke={INK} strokeWidth={1.2} />
          <path d="M 5,-43 L 4,-29 M -4,-41 L -3.4,-28.4" stroke={shade(h.color, 0.25)} strokeWidth={0.7} />
          <path d="M 7.6,-37 L 11.6,-37 M 9.6,-39 L 9.6,-33" stroke={h.color2} strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={5} cy={-43} r={1.2} fill={shade(h.color, 0.3)} />
        </g>
      );
    case 'mink':
      // норковая формовка: высокий меховой цилиндр
      return (
        <g>
          <path d="M -12,-24 C -13.4,-31 -12.6,-40 -9.6,-45 C -2,-48.6 9,-48.6 15.4,-45 C 17.6,-39 17.8,-31 16.8,-24.6 C 8,-27.4 -3,-27.4 -12,-24 Z" fill={h.color} stroke={INK} strokeWidth={1.4} />
          <path d="M -9.6,-45 C -2,-42.4 9,-42.4 15.4,-45" fill="none" stroke={shade(h.color, -0.35)} strokeWidth={1} />
          <path d="M -9,-40 L -8,-36 M -5,-41 L -4.4,-37 M -1,-41.4 L -0.6,-37 M 3,-41.4 L 3.2,-37 M 7,-41 L 7.2,-36.6 M 11,-40.4 L 11,-36 M 14.4,-39 L 14.2,-35 M -10,-32 L -9,-28.4 M -4,-33 L -3.6,-29 M 2,-33.4 L 2.2,-29.4 M 8,-33 L 8,-29 M 13.6,-32 L 13.4,-28" stroke={shade(h.color, 0.25)} strokeWidth={0.8} strokeLinecap="round" />
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

/** Кисть: запястье в 0,0, пальцы вниз, большой палец спереди. Кулак — с костяшками. */
function handPart(fist: number): Omit<Part, 'm'> {
  const sh = 'M -20,-6 L -1.8,-6 C -2.6,2 -2.8,9 -1.6,20 L -20,20 Z';
  return fist > 0.5
    ? {
        // кулак: тыльная сторона сзади, костяшки внизу-спереди, большой палец поперёк пальцев
        d: 'M -3.2,-0.8 C -4.4,1.8 -5.8,5.4 -5.2,8.8 C -4.6,11.4 -2.4,12.8 0.6,12.8 C 3.6,12.8 6,11.6 6.6,9.2 C 7.2,6.8 6.8,4 5.6,2.6 C 4.6,1.4 3.6,0.4 3,-0.8 Z',
        sh,
        hl: 'M -2.6,10.4 C -0.6,11.6 2.4,11.6 4.4,10.6',
        ln: 'M 6.5,5.2 C 5.2,5.2 3.8,5 2.8,4.6 M 6.6,7.8 C 5.2,8 3.8,7.8 2.6,7.4 M 6,10.4 C 4.8,10.6 3.4,10.4 2.4,10 M -2.2,5.8 C -0.2,4 2.6,3.8 4.4,5.2 M -4.6,9.6 C -2.8,10.4 -0.8,10.6 1,10.2',
      }
    : {
        // расслабленная кисть: пальцы чуть согнуты к ладони, большой палец спереди
        d: 'M -3,-0.8 C -3.6,1.6 -4.8,3.6 -5,6.4 C -5.2,9.6 -4.4,12.8 -2.8,14.8 C -1.8,16 -0.2,16.2 0.8,15.2 C 1.6,14.4 1.6,13.2 1,12.2 C 1.4,11.6 2.2,10.8 2.6,10 C 3.6,10 4.6,9.4 4.8,8.2 C 5,6.8 4.2,5.2 3.4,3.8 C 3.2,2.4 3.1,1 3,-0.8 Z',
        sh,
        hl: 'M -3.6,4 C -4,7 -3.6,10 -2.6,12.4',
        ln: 'M -3.8,9.2 C -3.2,11.6 -2.2,13.6 -0.8,14.8 M -1.8,9.6 C -1.2,11.2 -0.4,12.4 0.6,13.2 M 2.6,10 C 1.8,8.6 1.8,6.4 2.8,4.8',
      };
}

/** Стопа: голеностоп в 0,0, носок вперёд (+x). Подошва и нижняя половина — в тени. */
function footPart(kind: string): Omit<Part, 'm'> {
  const sh = 'M -20,1.6 C 0,2.4 10,2.4 30,1 L 30,20 L -20,20 Z';
  if (kind === 'boots')
    return {
      d: 'M -5.8,-14 L 5,-14 C 5.4,-9 5.4,-5.6 5.8,-3.6 C 10,-3.2 15.4,-1.8 17,1.2 C 17.6,2.4 17.6,3.8 17.4,5 L -6,5 C -6.6,0 -6.4,-8 -5.8,-14 Z',
      sh,
      hl: 'M 8,-2.2 C 11,-1.8 14,-0.8 15.6,0.8',
      ln: 'M -5.8,-11.6 L 5.2,-11.6 M 7.6,-2.6 C 8.4,-0.6 8.4,1.6 8,3.4',
    };
  if (kind === 'shoes')
    return {
      d: 'M -5.6,-5 C -2,-5.8 2,-5.6 5.2,-4.2 C 10,-3.4 15.6,-1.6 17,1.4 C 17.4,2.6 17.4,3.8 17.2,5 L -6,5 C -6.4,2 -6.2,-2 -5.6,-5 Z',
      sh,
      hl: 'M 9,-2.2 C 12,-1.6 14.6,-0.4 16,1',
      ln: 'M 5.4,-3.6 L 7,-1.8 M 7.8,-3 L 9.2,-1.2 M -5.4,-1.6 C 0,-1 6,-0.2 12,2',
    };
  if (kind === 'slippers')
    return {
      d: 'M -4.8,-2 C 0,-3.2 8,-2.8 13,-1 C 15.6,0.2 16.6,2.6 15.6,4.2 L 15,5 L -5.4,5 C -6,3 -5.6,0 -4.8,-2 Z',
      sh,
      hl: 'M 6,-2 C 9,-1.6 12,-0.6 13.8,0.6',
      ln: 'M 2,-2.6 C 3.4,-0.4 3.6,1.6 3.2,3.6',
    };
  // босая: пятка, свод, пальцы
  return {
    d: 'M -4.4,-4 C -4.8,-1 -6.6,2 -5.8,4.2 C -5.4,5.2 -4,5.2 -2,5 C 2,4.6 5,4.6 8,5 C 11,5.4 14.4,5.4 15.8,4.6 C 16.8,3.8 16.4,2.4 15,1.8 C 12.4,0.8 9.4,-0.4 6.8,-2 C 5.4,-2.8 4.6,-3.6 4.4,-4 Z',
    sh: 'M -20,2.4 C -4,3.4 4,2.6 8,3.4 C 12,4 20,3.4 30,2.4 L 30,20 L -20,20 Z',
    ln: 'M 12.4,5 C 12.6,4.2 12.8,3.4 12.6,2.8 M 14.4,4.9 C 14.8,4.2 14.8,3.4 14.6,2.8 M -2,1 C 0.6,1.8 3,2.2 5,2',
  };
}

export function Weapon({ id }: { id?: string }) {
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
    case 'wpn_toothbrush':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.1} y={-4} width={2.2} height={16} rx={1} fill="#3a8ad8" stroke={INK} strokeWidth={0.6} />
          <path d="M -1,12 L 0,20 L 1,12 Z" fill="#dfe3e8" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_pipe':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-2.2} y={-6} width={4.4} height={30} rx={0.8} fill="#6e747a" stroke={INK} strokeWidth={0.7} />
          <rect x={-2.8} y={20} width={5.6} height={4} rx={0.6} fill="#555a60" stroke={INK} strokeWidth={0.6} />
          <path d="M -1.2,-4 V 18" stroke="#9aa0a6" strokeWidth={0.8} />
        </g>
      );
    case 'wpn_razor':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.4} y={-5} width={2.8} height={10} rx={1} fill="#1e1c1c" stroke={INK} strokeWidth={0.6} />
          <path d="M -1.2,5 L 3.4,5 L 3,16 C 2,17 -1,17 -1.2,15 Z" fill="#d8dde2" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_nunchaku':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.6} y={-5} width={3.2} height={13} rx={1.4} fill="#8a5a32" stroke={INK} strokeWidth={0.6} />
          <path d="M 0,8 C 1,11 3,12 5,12" fill="none" stroke="#9aa0a6" strokeWidth={0.9} strokeDasharray="1 0.6" />
          <rect x={4} y={10} width={3.2} height={13} rx={1.4} transform="rotate(-30 5.6 11)" fill="#8a5a32" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'drop_scalpel':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.2} y={-4} width={2.4} height={12} rx={1} fill="#c8ccd2" stroke={INK} strokeWidth={0.6} />
          <path d="M -1.2,8 L 1.4,8 L 0.6,16 C 0,17 -1.2,16 -1.2,14 Z" fill="#eef2f6" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_axe':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.6} y={-6} width={3.2} height={30} rx={1.2} fill="#8a5a32" stroke={INK} strokeWidth={0.6} />
          <path d="M -1.6,16 L -9,13 C -12,17 -12,24 -9,28 L -1.6,24 Z" fill="#9aa0a6" stroke={INK} strokeWidth={0.7} />
          <path d="M -9,13.6 C -11.2,17.6 -11.2,23.6 -9,27.4" fill="none" stroke="#e8ecf0" strokeWidth={0.8} />
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

/** Следы на лице: пот после работы, кровь после крита, фингал при низком здоровье, улыбка после победы. */
export interface FaceFx {
  sweat?: boolean;
  blood?: boolean;
  bruise?: boolean;
  smile?: boolean;
  /** мороз: пар изо рта */
  breath?: boolean;
}

export interface RigProps {
  /** следы и эмоции на лице */
  fx?: FaceFx;
  look: Look;
  anim?: RigAnim;
  mirror?: boolean;
  /** не анимировать (иконки, портреты) */
  still?: boolean;
  shadow?: boolean;
  /** начало анимации — чтобы разовые (удар) шли с начала */
  startKey?: string | number;
  bare?: boolean;
  /** стоя без дела — иногда закурить, попить чаю, потянуться (по умолчанию да) */
  fidget?: boolean;
}

export function Rig({ look, anim = 'idle', mirror, still, shadow = true, startKey, bare, fidget = true, fx }: RigProps) {
  const uid = useRef(`rg${++uidSeq}`).current;
  const t = useClock(!still);
  const now = performance.now();
  // бытовое движение поверх «idle»: у каждого своё расписание, чтобы толпа не двигалась хором
  const fid = useRef<{ anim: RigAnim; until: number } | null>(null);
  const nextFid = useRef(now + 2500 + Math.random() * 9000);
  if (anim !== 'idle' || still || !fidget) {
    fid.current = null;
  } else if (fid.current && now > fid.current.until) {
    fid.current = null;
    nextFid.current = now + 7000 + Math.random() * 12000;
  } else if (!fid.current && now > nextFid.current) {
    const [a, d] = FIDGETS[Math.floor(Math.random() * FIDGETS.length)];
    fid.current = { anim: a, until: now + d };
  }
  const eff: RigAnim = fid.current?.anim ?? anim;
  const t0 = useRef(now);
  const prev = useRef<{ anim: RigAnim; pose: Pose; at: number; dur: number } | null>(null);
  const lastPose = useRef<Pose>(P0);
  const keyRef = useRef<string | number | undefined>(startKey);
  if (keyRef.current !== startKey || prev.current?.anim !== eff) {
    // смена анимации: плавно перетекаем из последней позы (в бытовые движения — медленнее)
    const dur = fid.current || prev.current?.anim !== anim ? 360 : 180;
    if (prev.current) prev.current = { anim: eff, pose: lastPose.current, at: now, dur };
    if (!prev.current) prev.current = { anim: eff, pose: P0, at: -1e9, dur };
    keyRef.current = startKey;
    t0.current = now;
  }
  const local = still ? 0 : t - t0.current;
  let pose = poseAt(eff, Math.max(0, local));
  const blend = prev.current ? (now - prev.current.at) / prev.current.dur : 1;
  if (prev.current && blend < 1) pose = mix(prev.current.pose, pose, ease(Math.max(0, blend)));
  lastPose.current = pose;
  return <RigBody look={look} pose={pose} uid={uid} mirror={mirror} shadow={shadow} bare={bare} prop={ANIM_PROP[eff]} time={local} fx={fx} />;
}

/** Предмет в руке: сигарета, кружка, миска с ложкой. */
function HandProp({ kind, near, fist }: { kind: 'cig' | 'mug' | 'bowl' | 'hammer'; near: boolean; fist: boolean }) {
  if (kind === 'hammer' && near)
    // молоток в кулаке: рукоять поперёк ладони, боёк на конце
    return (
      <g transform="translate(1.5 7) rotate(180)">
        <rect x={-4} y={-1.2} width={22} height={2.4} rx={1} fill="#9a6a3a" stroke={INK} strokeWidth={0.5} />
        <rect x={16} y={-5} width={5.5} height={10} rx={0.8} fill="#6d7378" stroke={INK} strokeWidth={0.6} />
        <rect x={16.6} y={-4.4} width={1.6} height={8.8} fill="#a7adb2" />
      </g>
    );
  if (kind === 'cig' && near)
    return (
      <g transform={`translate(${fist ? 3 : 1.4} ${fist ? 8 : 12.6}) rotate(-72)`}>
        <rect x={0} y={-0.75} width={7.4} height={1.5} rx={0.4} fill="#efeae0" stroke={INK} strokeWidth={0.4} />
        <rect x={0} y={-0.75} width={2.2} height={1.5} fill="#c8894a" />
        <circle cx={7.5} cy={0} r={0.8} fill="#ff7a2a" />
      </g>
    );
  if (kind === 'mug' && near)
    return (
      <g transform="translate(1.6 5.6)">
        <path d="M 0,-4 L 7.4,-4 L 7.4,4 C 7.4,5.6 0,5.6 0,4 Z" fill="#8a8e94" stroke={INK} strokeWidth={0.8} />
        <path d="M 7.4,-2 C 10.4,-2 10.4,2.4 7.4,2.4" fill="none" stroke={INK} strokeWidth={1} />
        <path d="M 0.4,-3.2 L 7,-3.2" stroke="#3a2210" strokeWidth={1.2} />
      </g>
    );
  if (kind === 'bowl' && !near)
    return <path d="M -7,8 C -6,15 10,15 11,8 Z" fill="#9aa0a6" stroke={INK} strokeWidth={0.9} />;
  if (kind === 'bowl' && near)
    return (
      <g transform="translate(2 8) rotate(-80)">
        <rect x={-0.6} y={-1} width={1.2} height={10} rx={0.6} fill="#c3c7cc" stroke={INK} strokeWidth={0.4} />
        <ellipse cx={0} cy={10} rx={1.6} ry={2.4} fill="#d4d8dc" stroke={INK} strokeWidth={0.4} />
      </g>
    );
  return null;
}

/** Точка в системе координат части → координаты рига. */
const apply = (m: M, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function RigBody({ look, pose, uid, mirror, shadow = true, bare, prop, time = 0, fx }: { look: Look; pose: Pose; uid: string; mirror?: boolean; shadow?: boolean; bare?: boolean; prop?: (typeof ANIM_PROP)[RigAnim]; time?: number; fx?: FaceFx }) {
  const skin = SKIN_TONES[look.skin ?? 0] ?? SKIN_TONES[0];
  const build = [0.9, 1, 1.12][look.build ?? 1] ?? 1;
  const muscle = Math.min(1.25, 0.92 + (look.str ?? 5) * 0.006);
  const body: Body = { bw: build * 1.14, mw: build * muscle * 1.06 };
  const top = !bare && look.equipped.body ? TOPS[look.equipped.body] : undefined;
  const legs: LegWear | undefined = !bare ? (top?.legs ?? (look.equipped.legs ? LEGS[look.equipped.legs] : undefined)) : undefined;
  const feet = look.equipped.feet ? FEET[look.equipped.feet] : undefined;

  // скелет
  const base = mul(T(60 + pose.x, 112 + pose.y), R(pose.root));
  const torso = mul(base, R(pose.lean));
  const neck = mul(torso, mul(T(0.5 * body.bw, -50), R(pose.neck)));
  const head = mul(neck, mul(T(0, -4.5), R(pose.head)));
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
  const on = (mm: M, p: Omit<Part, 'm'>): Part => ({ ...p, m: mm });
  const skinArm = (a: Mats['n']) => [on(a.s, limb(UPPER_ARM, ARM.up, mw)), on(a.e, limb(FOREARM, ARM.fore, mw)), on(a.w, handPart(pose.fist))];
  const sleeveParts = (a: Mats['n'], cover: 'short' | 'long', pad: number) =>
    cover === 'short' ? [on(a.s, limb(SLEEVE_UP, ARM.up, mw, pad, 16))] : [on(a.s, limb(SLEEVE_UP, ARM.up, mw, pad)), on(a.e, limb(SLEEVE_FORE, ARM.fore, mw, pad, ARM.fore - 1))];
  const skinLeg = (l: Mats['nl']) => [on(l.h, limb(THIGH, LEG.thigh, mw)), on(l.k, limb(SHIN, LEG.shin, mw))];
  const footKind = feet?.kind ?? 'bare';
  const footOf = (l: Mats['nl']) => on(l.a, footPart(footKind));
  const skinShade = { shadeC: skin.shade, shadeO: 0.78 };

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
        {...skinShade}
        hatch={false}
        extra={
          <>
            {/* граница бицепса и локтевая ямка */}
            <path transform={mat(a.s)} d={`M ${1.6 * mw},${ARM.up * 0.7} C ${3.2 * mw},${ARM.up * 0.8} ${4 * mw},${ARM.up * 0.9} ${4.2 * mw},${ARM.up - 1}`} fill="none" stroke={skin.shade} strokeWidth={0.8} strokeLinecap="round" />
            <path transform={mat(a.s)} d={`M ${-1.4 * mw},4 C ${0.6 * mw},7 ${2.8 * mw},7.6 ${5.4 * mw},6.4`} fill="none" stroke={skin.shade} strokeWidth={0.8} strokeLinecap="round" opacity={0.8} />
            <ArmTattoo look={look} a={a} near={near} covered={sleeves} />
          </>
        }
      />
      {top && sleeves !== 'none' && (
        <Chain
          parts={sleeveParts(a, sleeves as 'short' | 'long', 1.2 + bulk * 0.45)}
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
      {!near && handInks(look.tattoos)[1] && (
        <g transform={mat(a.w)}>
          {handInks(look.tattoos)[1] === 't_rings' ? <Rings fist={pose.fist > 0.5} /> : <HandInk id={handInks(look.tattoos)[1]!} fist={pose.fist > 0.5} />}
        </g>
      )}
      {!near && prop === 'bowl' && (
        <g transform={mat(a.w)}>
          <HandProp kind="bowl" near={false} fist={false} />
        </g>
      )}
      {near && (
        <g transform={mat(a.w)}>
          {handInks(look.tattoos)[0] === 't_rings' ? <Rings fist={pose.fist > 0.5} /> : handInks(look.tattoos)[0] && <HandInk id={handInks(look.tattoos)[0]!} fist={pose.fist > 0.5} />}
          {look.equipped.charm === 'charm_watch' && (
            <g>
              <rect x={-3.6} y={-2.2} width={7.4} height={3} rx={0.8} fill="#2a2420" stroke={INK} strokeWidth={0.5} />
              <rect x={1.6} y={-3.4} width={3.6} height={5.2} rx={1} fill="#c8b070" stroke={INK} strokeWidth={0.6} />
              <rect x={2.2} y={-2.8} width={2.4} height={4} rx={0.6} fill="#f2ecd8" />
            </g>
          )}
          {prop && prop !== 'zzz' && <HandProp kind={prop} near fist={pose.fist > 0.5} />}
          <Weapon id={look.equipped.weapon} />
          {look.equipped.charm === 'charm_beads' && <path d="M -4.4,-1 C -2,1 2,1 4.2,-1" fill="none" stroke="#8a3a1e" strokeWidth={1.6} strokeDasharray="1.4 0.8" />}
          {look.equipped.charm === 'charm_ring' && <circle cx={3.8} cy={pose.fist > 0.5 ? 5 : 8} r={1.3} fill="#e8c35a" stroke={INK} strokeWidth={0.4} />}
          {look.equipped.charm === 'drop_ring_thief' && (
            <g>
              <circle cx={3.8} cy={pose.fist > 0.5 ? 5 : 8} r={1.8} fill="#e8c35a" stroke={INK} strokeWidth={0.4} />
              <circle cx={3.8} cy={pose.fist > 0.5 ? 5 : 8} r={0.9} fill="#b8242a" />
            </g>
          )}
        </g>
      )}
    </g>
  );

  const drawLeg = (l: Mats['nl']) => (
    <g>
      <Chain
        parts={[...skinLeg(l), ...(feet ? [] : [footOf(l)])]}
        fill={skin.base}
        uid={uid}
        {...skinShade}
        hatch={false}
        extra={
          <>
            <path transform={mat(l.k)} d={`M ${-1 * mw},3 C ${1.4 * mw},5 ${3.4 * mw},4 ${4.4 * mw},1.4`} fill="none" stroke={skin.shade} strokeWidth={0.8} strokeLinecap="round" />
            {!legs && look.tattoos.includes('t_knee_stars') && <g transform={`${mat(l.k)} translate(${1.2 * mw} 3) scale(0.8)`} opacity={0.85}>{TATTOO_ART.t_knee_stars.art}</g>}
          </>
        }
      />
      {legs && (
        <Chain
          parts={[on(l.h, limb(TROUSER_UP, LEG.thigh, mw, 1.4)), on(l.k, limb(TROUSER_LOW, LEG.shin, mw, 1, LEG.shin - (footKind === 'boots' ? 12 : 3)))]}
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
      {feet && <Chain parts={[footOf(l)]} fill={footFill} uid={uid} extra={feet.sole ? <path transform={mat(l.a)} d="M -6,4.2 L 17,4.2" stroke={feet.sole} strokeWidth={2} /> : null} />}
    </g>
  );

  const hem = top?.hem ?? 0;
  const torsoD = torsoPath(body.bw, 0, 0);
  const topG = 1.2 + bulk * 0.5;
  const topD = torsoPath(body.bw, topG, Math.min(hem, 6));
  const def = Math.min(1, 0.45 + (muscle - 0.92) * 2);
  const k = (x: number) => +(x * body.bw).toFixed(2);
  const skirt = hem > 6 ? `M ${-14 * body.bw - bulk * 0.5},2 L ${14 * body.bw + bulk * 0.5},2 L ${15 * body.bw + bulk * 0.6 + hem * 0.15},${2 + hem} C 5,${4 + hem} -5,${4 + hem} ${-15 * body.bw - bulk * 0.6 - hem * 0.12},${2 + hem} Z` : null;

  // трусы / брюки на тазу
  const pelvisD = `M ${-14 * body.bw},-6 L ${14 * body.bw},-6 C ${14.6 * body.bw},0 ${15 * body.bw},5 ${15 * body.bw},9 C ${10 * body.bw},10 ${5 * body.bw},11 ${1 * body.bw},14 C ${-4 * body.bw},11 ${-10 * body.bw},10.4 ${-15 * body.bw},10 C ${-15 * body.bw},4 ${-14.6 * body.bw},0 ${-14 * body.bw},-6 Z`;
  const pelvisSh = `M -60,-20 L ${-5 * body.bw},-20 C ${-4.6 * body.bw},-4 ${-5.6 * body.bw},6 ${-7 * body.bw},20 L -60,20 Z`;
  const wearsLegs = !!legs;
  const pelvisFill = wearsLegs ? legsFill : '#2c3a5a';

  const parts: ReactNode[] = [];
  // тень
  if (shadow && Math.abs(pose.root) < 30) {
    // тень — под ступнями, где бы они ни были (присед, шаг, удар ногой), а не под тазом
    const an = apply(m.nl.a, 5, 0);
    const af = apply(m.fl.a, 5, 0);
    const down = [an, af].filter((p) => p[1] > 180);
    const cx = down.length ? down.reduce((a, p) => a + p[0], 0) / down.length : 60 + pose.x;
    const spread = down.length === 2 ? Math.abs(an[0] - af[0]) / 2 : 0;
    parts.push(<ellipse key="sh" cx={cx} cy={210} rx={Math.max(20 * body.bw, spread + 12)} ry={4.2} fill="#000" opacity={0.38} />);
  }
  parts.push(<g key="fa">{drawArm(m.f, false)}</g>);
  parts.push(<g key="fl">{drawLeg(m.fl)}</g>);
  // таз
  parts.push(
    <g key="pel">
      <Chain parts={[{ m: m.pelvis, d: pelvisD, sh: pelvisSh }]} fill={pelvisFill} uid={uid} />
      {!wearsLegs && <path transform={mat(m.pelvis)} d={`M ${-14 * body.bw},-3 L ${14 * body.bw},-3`} stroke="#e8e4da" strokeWidth={1.6} />}
    </g>,
  );
  parts.push(<g key="nl">{drawLeg(m.nl)}</g>);
  // корпус и шея
  parts.push(
    <g key="torso">
      <Chain
        parts={[{ m: m.neck, d: 'M -7,3 C -7,-4 -7.6,-10 -8.6,-16 L 5,-16 C 6,-8 6.6,-2 7.6,3 Z', sh: 'M -30,-30 L -2.6,-30 C -2.4,-14 -2,-6 -1,6 L -30,6 Z', ln: 'M 0.4,-2 C 2,0 4.4,1 6.4,0.6' }]}
        fill={skin.base}
        uid={uid}
        {...skinShade}
        hatch={false}
      />
      <Chain
        parts={[{ m: m.torso, d: torsoD, sh: torsoShade(body.bw, 0) }]}
        fill={skin.base}
        uid={uid}
        {...skinShade}
        hatch={false}
        extra={
          <g transform={mat(m.torso)} fill="none" stroke={skin.shade} strokeLinecap="round">
            {/* грудные: нижний край с тенью, грудина, ключицы */}
            <path d={`M ${k(-1)},-30.4 C ${k(4)},-26.2 ${k(12)},-26.4 ${k(17.4)},-30.6 C ${k(12)},-28.6 ${k(4)},-28.4 ${k(-1)},-30.4 Z`} fill={skin.shade} stroke="none" opacity={0.5 + def * 0.4} />
            <path d={`M ${k(-1)},-30.4 C ${k(4)},-26.2 ${k(12)},-26.4 ${k(17.4)},-30.6`} strokeWidth={1} />
            <path d={`M ${k(2.4)},-45 L ${k(2.4)},-31`} strokeWidth={0.8} opacity={def} />
            <path d={`M ${k(-7)},-47.2 C ${k(-3)},-45.6 ${k(0)},-45.8 ${k(1.8)},-47.4 M ${k(3.2)},-47.4 C ${k(6.4)},-45.8 ${k(10.6)},-45.8 ${k(14.6)},-47.8`} strokeWidth={0.9} />
            {/* пресс, пупок, косые, широчайшие */}
            <g opacity={def * 0.85} strokeWidth={0.8}>
              <path d={`M ${k(2.2)},-25.6 L ${k(2.2)},-5`} />
              <path d={`M ${k(-3.4)},-20.6 C ${k(-0.4)},-19.6 ${k(4.4)},-19.6 ${k(8.2)},-20.8 M ${k(-3.2)},-14 C ${k(-0.2)},-13.2 ${k(4.4)},-13.2 ${k(8)},-14.2 M ${k(-2.8)},-7.8 C ${k(0)},-7.2 ${k(4.2)},-7.2 ${k(7.4)},-8`} />
              <path d={`M ${k(10.8)},-25 l ${1.8 * body.bw},1 M ${k(10.4)},-21 l ${1.8 * body.bw},1 M ${k(10.2)},-17 l ${1.6 * body.bw},0.8`} />
              <path d={`M ${k(9.4)},-12 C ${k(10.4)},-8 ${k(10.6)},-4 ${k(10)},0`} />
            </g>
            <path d={`M ${k(2.4)},-2.8 c 0.7,0.7 0.7,1.5 0,2.2`} strokeWidth={0.9} />
            <path d={`M ${k(-9.6)},-40 C ${k(-11)},-32 ${k(-10.6)},-24 ${k(-9.8)},-16`} strokeWidth={0.8} opacity={0.7} />
            <path d={`M ${k(11)},-44 C ${k(14)},-40 ${k(16)},-36 ${k(15.6)},-33`} stroke="#fff" strokeOpacity={0.22} strokeWidth={1.4} />
            <ChestTattoo look={look} bw={body.bw} />
            {look.equipped.charm === 'charm_dogtag' && (
              <g>
                <path d={`M ${k(-5)},-49 C ${k(-4)},-40 ${k(6)},-40 ${k(8)},-49`} fill="none" stroke="#9aa0a6" strokeWidth={0.9} strokeDasharray="1 0.5" />
                <rect x={k(1.4) - 2} y={-41.4} width={4} height={5.6} rx={1.4} fill="#b8bcc2" stroke={INK} strokeWidth={0.6} />
                <path d={`M ${k(1.4) - 1},-39.6 h 2 M ${k(1.4) - 1},-38 h 2`} stroke="#6a6e74" strokeWidth={0.4} />
              </g>
            )}
            {look.equipped.charm === 'charm_cross' && (
              <g>
                <path d={`M -5,-49 C -4,-38 6,-38 8,-49`} fill="none" stroke="#e8c35a" strokeWidth={1.1} />
                <path d="M 1.6,-39.5 v 7 M -0.6,-37.2 h 4.4" stroke="#e8c35a" strokeWidth={1.4} />
              </g>
            )}
          </g>
        }
      />
      {top && <TopLayer top={top} m={m} uid={uid} d={topD} sh={torsoShade(body.bw, topG)} skirt={skirt} bw={body.bw} bulk={bulk} />}
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
      <Head look={look} pose={pose} uid={uid} skin={skin} fx={fx} />
    </g>,
  );
  parts.push(<g key="na">{drawArm(m.n, true)}</g>);
  if (prop === 'cig') {
    // дым от сигареты и выдох: колечки поднимаются и тают
    const [hx, hy] = apply(m.n.w, 4, 6);
    parts.push(
      <g key="smoke" fill="#e8e6e0">
        {[0, 1, 2].map((i) => {
          const ph = ((time / 1000 + i * 0.7) % 2.1) / 2.1;
          return <circle key={i} cx={hx + Math.sin(ph * 6 + i) * 2.4} cy={hy - 6 - ph * 22} r={1 + ph * 3.2} opacity={(1 - ph) * 0.45} />;
        })}
        {pose.mouth > 0.5 && (() => {
          const [mx, my] = apply(m.head, 12, -4);
          return <ellipse cx={mx + 6} cy={my - 1} rx={5} ry={2.6} opacity={0.5} />;
        })()}
      </g>,
    );
  }
  if (prop === 'zzz') {
    const [zx, zy] = apply(m.head, 4, -30);
    parts.push(
      <g key="zzz" fill="#dfe6ff" fontWeight={700} fontFamily="sans-serif">
        {[0, 1, 2].map((i) => {
          const ph = ((time / 1000 + i * 0.9) % 2.7) / 2.7;
          return (
            <text key={i} x={zx + 4 + ph * 12} y={zy - 4 - ph * 18} fontSize={6 + ph * 5} opacity={Math.sin(ph * Math.PI)} transform={mirror ? `scale(-1 1) translate(${-2 * (zx + 4 + ph * 12)} 0)` : undefined}>
              z
            </text>
          );
        })}
      </g>,
    );
  }

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
function TopLayer({ top, m, uid, d, sh, skirt, bw, bulk }: { top: TopWear; m: Mats; uid: string; d: string; sh: string; skirt: string | null; bw: number; bulk: number }) {
  const fill = fillOf(uid, 'top', top.color, top.pattern);
  const k = (x: number) => x * bw;
  const tank = top.neck === 'tank';
  // майка: вырез под руки и на груди
  const body = tank ? `M ${k(-12)},2 C ${k(-13)},-10 ${k(-12)},-20 ${k(-11)},-30 C ${k(-9)},-34 ${k(-7)},-44 ${k(-6)},-50 L ${k(-3)},-50 C ${k(-1)},-42 ${k(6)},-42 ${k(8)},-50 L ${k(11)},-50 C ${k(12)},-44 ${k(14)},-36 ${k(15)},-32 C ${k(13.5)},-22 ${k(12.5)},-12 ${k(13)},2 Z` : d;
  const parts: Part[] = [{ m: m.torso, d: body, sh }, ...(skirt ? [{ m: m.pelvis, d: skirt, sh: `M -60,-10 L ${-6 * bw},-10 L ${-7 * bw},80 L -60,80 Z` }] : [])];
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

function ChestTattoo({ look, bw }: { look: Look; bw: number }) {
  const t = look.tattoos;
  const at = (id: string, x: number, y: number, sx = 1, sy = sx) => t.includes(id) && <g transform={`translate(${x * bw} ${y}) scale(${sx} ${sy})`}>{TATTOO_ART[id].art}</g>;
  const chest = firstOf(t, ['t_church', 't_madonna', 't_crucifix', 't_lighthouse', 't_ship', 't_mother']);
  const belly = firstOf(t, ['t_eagle', 't_eyes', 't_lion', 't_beetle', 't_bear']);
  return (
    <g opacity={0.85}>
      {/* на грудь и живот — по одной: первая набитая из списка */}
      {chest && at(chest, 3, chest === 't_mother' ? -38 : -35.6, 0.95)}
      {at('t_stars', -5.6, -43.6, 0.72)}
      {at('t_stars', 12.4, -44, 0.52, 0.66)}
      {belly && at(belly, 3.4, -13.6, 0.82)}
    </g>
  );
}

function ArmTattoo({ look, a, near, covered }: { look: Look; a: Mats['n']; near: boolean; covered: string }) {
  if (covered === 'long') return null;
  const slots = armSlots(look.tattoos);
  const up = slots[near ? 'nu' : 'fu'];
  // на ближнем плече — погоны, на дальнем — корона (если набиты обе)
  const shoulders = ['t_epaulets', 't_crown'].filter((id) => look.tattoos.includes(id));
  const shoulder = near ? shoulders[0] : shoulders[1] ?? (shoulders.length === 1 ? shoulders[0] : undefined);
  const fore = slots[near ? 'nf' : 'ff'];
  const upOk = covered !== 'short';
  return (
    <g opacity={0.85}>
      {upOk && shoulder && <g transform={`${mat(a.s)} translate(0.8 2.6) scale(0.9)`}>{TATTOO_ART[shoulder].art}</g>}
      {upOk && up && <g transform={`${mat(a.s)} translate(0.6 ${shoulder ? 15 : 13}) scale(0.9)`}>{TATTOO_ART[up].art}</g>}
      {fore && <g transform={`${mat(a.e)} translate(0.4 11) scale(${fore === 't_dagger' ? 0.9 : 0.78})`}>{TATTOO_ART[fore].art}</g>}
    </g>
  );
}

// --- Портрет: только голова, для шапки, топа и полос здоровья ---------------------------------

export function RigHead({ look, size = 40, className }: { look: Look; size?: number; className?: string }) {
  const uid = useRef(`rh${++uidSeq}`).current;
  const skin = SKIN_TONES[look.skin ?? 0] ?? SKIN_TONES[0];
  return (
    <svg className={className} width={size} height={size} viewBox="-17 -43 44 48" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <ShadeDefs uid={uid} />
      </defs>
      <rect x={-17} y={-43} width={44} height={48} fill="#2a241c" />
      <path d="M -7,8 C -6.6,2 -6.8,-2 -7.4,-6 L 4.6,-6 C 5.2,-1 5.8,3 7,8 Z" fill={skin.shade} stroke={INK} strokeWidth={1.2} />
      <Head look={look} pose={P0} uid={uid} skin={skin} />
    </svg>
  );
}

export { I as IDENTITY, S as SCALE };
