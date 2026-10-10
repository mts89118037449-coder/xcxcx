// Персонажи в духе «Южного парка»: плоские фигурки из простых форм — большая круглая голова,
// глаза-овалы, туловище-трапеция, ручки-культяпки и короткие ножки. Анимация «вырезками»:
// части поворачиваются и подпрыгивают целиком, без суставов — поэтому ничего не ломается.
// Та же система координат, что у прежней куклы: 120×210, ступни на y=210, центр x=60, лицом вправо.
import { useEffect, useRef, useState } from 'react';
import { faceParts } from '../../../shared/content.ts';
import type { Look } from '../../../shared/types.ts';
import { TATTOO_ART, TattooGlyph } from './tattoos.tsx';
import { FEET, HAIR_COLORS, HATS, LEGS, SKIN_TONES, TOPS, type HeadWear, type Pattern, type TopWear } from './wear.ts';
import { Weapon, type FaceFx, type RigAnim, type RigProps } from './Rig.tsx';

const INK = '#141010';
const OUT = 2.2;

// --- Геометрия -------------------------------------------------------------------------------

const HX = 60;
const HY = 66; // центр головы
const HR = 40; // радиус головы
const SH_Y = 110; // плечи
const HIP_Y = 170;
const ARM_L = 40;
const LEG_L = 30;

// --- Поза ------------------------------------------------------------------------------------

interface TPose {
  x: number;
  y: number;
  rot: number; // наклон всего тела вокруг ступней, «+» — вперёд
  sq: number; // приплюснутость (1 — норма)
  head: number; // наклон головы
  aN: number; // ближняя (правая) рука: 0 — вниз, «+» — вперёд, 180 — вверх
  aF: number;
  nL: number; // длина руки, доля
  fL: number;
  lN: number; // ноги: «+» — вперёд
  lF: number;
  mouth: number; // 0 — закрыт, 1 — открыт
  brow: number; // −1 грусть, 0, 1 злость
  eyes: number; // 1 — открыты, 0 — закрыты
  look: number; // куда смотрят зрачки: «+» — вперёд
  fist: number;
  lie: number; // лёг: −90 — на спину (назад), 0 — стоит
  cross: number; // руки скрещены
}

const P0: TPose = { x: 0, y: 0, rot: 0, sq: 1, head: 0, aN: 6, aF: -6, nL: 1, fL: 1, lN: 0, lF: 0, mouth: 0, brow: 0, eyes: 1, look: 0.6, fist: 0, lie: 0, cross: 0 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
function mix(a: TPose, b: TPose, t: number): TPose {
  const o = { ...a };
  for (const k of Object.keys(a) as (keyof TPose)[]) o[k] = lerp(a[k], b[k], t);
  return o;
}
const step = (x: number, a: number, b: number) => ease(Math.max(0, Math.min(1, (x - a) / (b - a))));
/** «Рывки» как в вырезной анимации: значение меняется ступеньками, а не плавно. */
const choppy = (v: number, n = 3) => Math.round(v / n) * n;

/** Моргание: каждые ~3,4 с на десятую долю секунды. */
const blink = (s: number, seed: number) => ((s + seed) % 3.4 < 0.12 ? 0.05 : 1);

export function toonPose(anim: RigAnim, t: number, seed = 0): TPose {
  const s = t / 1000;
  const eyes = blink(s, seed);
  switch (anim) {
    case 'idle': {
      const b = Math.sin(s * 2.2);
      return { ...P0, y: choppy(b * 1.6, 1), aN: 6 + b * 2, aF: -6 - b * 2, eyes, look: 0.6 + Math.sin(s * 0.4) * 0.4 };
    }
    case 'crossed': {
      const b = Math.sin(s * 2);
      return { ...P0, y: choppy(b * 1.2, 1), cross: 1, brow: 0.6, eyes, head: Math.sin(s * 0.6) * 3 };
    }
    case 'walk':
    case 'run': {
      const run = anim === 'run';
      const ph = s * Math.PI * 2 * (run ? 2.2 : 1.6);
      const sw = Math.sin(ph);
      return {
        ...P0,
        y: -Math.abs(sw) * (run ? 7 : 4),
        rot: run ? 8 : 2,
        lN: sw * (run ? 34 : 24),
        lF: -sw * (run ? 34 : 24),
        aN: -sw * (run ? 40 : 22) + (run ? 30 : 6),
        aF: sw * (run ? 40 : 22) + (run ? 20 : -6),
        fist: run ? 1 : 0,
        eyes,
        mouth: run ? 0.6 : 0,
      };
    }
    case 'sit': {
      const b = Math.sin(s * 1.8);
      return { ...P0, y: 28 + choppy(b, 1), lN: 84, lF: 80, aN: 34, aF: 26, eyes, head: Math.sin(s * 0.5) * 3 };
    }
    case 'floor': {
      return { ...P0, y: 36, lN: 86, lF: 84, aN: 40, aF: 20, head: 8, brow: -1, eyes: 0.6 };
    }
    case 'guard': {
      const b = Math.sin(s * 6);
      return { ...P0, y: 3 + choppy(b * 2, 1), rot: 3, aN: 128, aF: 112, nL: 0.85, fL: 0.85, fist: 1, brow: 1, lN: 12, lF: -12, eyes };
    }
    case 'punch': {
      const g = toonPose('guard', t, seed);
      const hit: TPose = { ...g, x: 12, rot: 10, aN: 92, nL: 1.35, mouth: 1, brow: 1, lN: 20, lF: -20 };
      const k = s < 0.08 ? s / 0.08 : s < 0.28 ? 1 : s < 0.5 ? 1 - ease((s - 0.28) / 0.22) : 0;
      return mix(g, hit, k);
    }
    case 'hit': {
      const g = toonPose('guard', t, seed);
      const rec: TPose = { ...g, x: -10, rot: -14, head: -12, brow: -1, mouth: 1, eyes: 0.3, aN: 40, aF: 20, sq: 0.94 };
      const k = s < 0.06 ? s / 0.06 : s < 0.4 ? 1 - ease((s - 0.06) / 0.34) : 0;
      return mix(g, rec, k);
    }
    case 'ko': {
      const k = ease(Math.min(1, s / 0.45));
      const lie: TPose = { ...P0, lie: -90, aN: 150, aF: -150, lN: 10, lF: -10, eyes: 0, brow: -1, mouth: 0.4 };
      return mix(toonPose('guard', 0, seed), lie, k);
    }
    case 'cheer': {
      const b = Math.abs(Math.sin(s * 5));
      return { ...P0, y: -b * 12, sq: 1 + b * 0.04, aN: 158, aF: -158, fist: 1, mouth: 1, brow: 0.3, lN: b * 14, lF: -b * 14, eyes };
    }
    case 'work': {
      const c = (s * 1.6) % 1;
      const k = c < 0.62 ? ease(c / 0.62) : Math.max(0, 1 - (c - 0.62) / 0.1);
      return { ...P0, y: lerp(3, 0, k), rot: lerp(6, -2, k), aN: lerp(70, 175, k), aF: 20, fist: 1, brow: 0.6, mouth: k < 0.15 ? 0.5 : 0, eyes, look: 1 };
    }
    case 'smoke': {
      const c = s % 4.4;
      const up = step(c, 0, 0.5) - step(c, 1.8, 2.3);
      return { ...P0, aN: lerp(10, -132, up), nL: lerp(1, 0.62, up), aF: -6, mouth: c > 2.3 && c < 3.1 ? 0.6 : 0, eyes: up > 0.8 ? 0.4 : eyes, head: lerp(0, -4, up) };
    }
    case 'drink': {
      const c = s % 3.4;
      const up = step(c, 0, 0.6) - step(c, 2.2, 2.8);
      return { ...P0, aN: lerp(10, -136, up), nL: lerp(1, 0.6, up), head: lerp(0, -8, up), eyes: up > 0.8 ? 0.2 : eyes };
    }
    case 'eat': {
      const up = (1 - Math.cos(s * 3.2)) / 2;
      return { ...toonPose('sit', t, seed), aN: lerp(40, -128, up), nL: lerp(1, 0.6, up), aF: 50, fL: 0.8, mouth: up > 0.85 ? 0.7 : 0, eyes };
    }
    case 'think': {
      const b = Math.sin(s * 1.3);
      return { ...P0, aN: -140, nL: 0.55, fist: 1, aF: -10, head: 4 + b * 3, brow: 0.5, look: 1, eyes: 0.7 };
    }
    case 'stretch': {
      const k = step(s, 0, 0.5) - step(s, 1.8, 2.5);
      return { ...P0, y: -3 * k, sq: 1 + 0.05 * k, aN: lerp(6, 176, k), aF: lerp(-6, -176, k), mouth: k > 0.7 ? 1 : 0, eyes: k > 0.5 ? 0.1 : eyes };
    }
    case 'wave': {
      const k = step(s, 0, 0.25) - step(s, 1.6, 2);
      return { ...P0, aN: lerp(6, 160 + Math.sin(s * 14) * 18 * k, k), mouth: k > 0.5 ? 0.6 : 0, eyes, look: 1 };
    }
    case 'flex': {
      const k = step(s, 0, 0.3) - step(s, 1.7, 2.2);
      const w = Math.sin(s * 10) * 6 * k;
      return { ...P0, sq: 1 - 0.04 * k, aN: lerp(6, 120 + w, k), aF: lerp(-6, -120 - w, k), nL: lerp(1, 0.75, k), fL: lerp(1, 0.75, k), fist: 1, brow: k, mouth: 0.3 * k, eyes };
    }
    case 'cold': {
      const tr = choppy(Math.sin(s * 40) * 1.4, 1);
      return { ...P0, x: tr, cross: 1, brow: -0.8, head: 6, sq: 0.97, eyes };
    }
    case 'squat': {
      const k = (1 - Math.cos(s * 3.6)) / 2;
      return { ...P0, y: 22 * k, sq: 1 - 0.06 * k, aN: 90 * k, aF: 80 * k, lN: 50 * k, lF: 40 * k, fist: 1, brow: k, eyes };
    }
    case 'crouch': {
      const b = Math.sin(s * 1.4);
      return { ...P0, y: 26 + choppy(b, 1), lN: 70, lF: 60, aN: 60, aF: 48, head: Math.sin(s * 0.5) * 6, look: Math.sin(s * 0.5), brow: 0.3, eyes };
    }
    case 'pushup': {
      const k = (1 - Math.cos(s * 3.8)) / 2;
      return { ...P0, lie: 78, y: lerp(-6, 6, k), aN: lerp(-70, -40, k), aF: lerp(-70, -40, k), brow: 0.6 + k * 0.4, eyes };
    }
    case 'sleep': {
      const b = Math.sin(s * 1.4);
      return { ...P0, lie: -90, sq: 1 + b * 0.02, aN: 20, aF: -20, eyes: 0, mouth: 0.2 };
    }
    case 'dance': {
      const ph = s * Math.PI * 2 * 1.3;
      const sw = Math.sin(ph);
      return { ...P0, y: -Math.abs(sw) * 7, rot: sw * 8, aN: 100 + sw * 60, aF: -100 + sw * 60, lN: Math.max(0, sw) * 30, lF: -Math.max(0, -sw) * 30, mouth: 1, fist: 1, eyes };
    }
    case 'taunt': {
      const b = Math.sin(s * 7);
      return { ...toonPose('guard', t, seed), aN: 88 + b * 14, nL: 1.1, fist: 0, brow: 1, mouth: Math.sin(s * 1.6) > 0.5 ? 1 : 0.2, head: -4 };
    }
    case 'kick': {
      const g = toonPose('guard', t, seed);
      const hit: TPose = { ...g, x: 6, rot: -10, lN: 88, lF: -6, mouth: 1 };
      const k = s < 0.1 ? s / 0.1 : s < 0.32 ? 1 : s < 0.56 ? 1 - ease((s - 0.32) / 0.24) : 0;
      return mix(g, hit, k);
    }
    case 'dodge': {
      const g = toonPose('guard', t, seed);
      const out: TPose = { ...g, x: -12, rot: -20, y: 6, sq: 0.95, head: -8 };
      const k = s < 0.1 ? s / 0.1 : s < 0.38 ? 1 : s < 0.66 ? 1 - ease((s - 0.38) / 0.28) : 0;
      return mix(g, out, k);
    }
    case 'pullup': {
      const b = (Math.sin(s * 4) + 1) / 2;
      return { ...P0, y: -24 * b, aN: 176, aF: -176, nL: lerp(1, 0.6, b), fL: lerp(1, 0.6, b), fist: 1, lN: 10, lF: -10, brow: 1, mouth: b > 0.8 ? 0.6 : 0, eyes };
    }
  }
}

// --- Часы: одни на все фигурки на экране -----------------------------------------------------

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
    // 15 кадров в секунду — как в мультике, заодно бережёт батарею
    const f = (now: number) => {
      if (now - last > 66) {
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

const FIDGETS: [RigAnim, number][] = [['smoke', 4400], ['think', 3600], ['drink', 3400], ['stretch', 2600], ['wave', 2000], ['flex', 2200], ['cold', 2400]];
const PROP: Partial<Record<RigAnim, 'cig' | 'mug' | 'bowl' | 'zzz' | 'hammer'>> = { smoke: 'cig', drink: 'mug', eat: 'bowl', sleep: 'zzz', work: 'hammer' };

let seq = 0;

/** Фигурка: тот же интерфейс, что у прежней куклы. */
export function Toon({ look, anim = 'idle', mirror, still, shadow = true, startKey, bare, fidget = true, fx }: RigProps) {
  const id = useRef(++seq).current;
  const seed = useRef(Math.random() * 3).current;
  const t = useClock(!still);
  const now = performance.now();
  const fid = useRef<{ anim: RigAnim; until: number } | null>(null);
  const nextFid = useRef(now + 3000 + Math.random() * 9000);
  if (anim !== 'idle' || still || !fidget) fid.current = null;
  else if (fid.current && now > fid.current.until) {
    fid.current = null;
    nextFid.current = now + 7000 + Math.random() * 12000;
  } else if (!fid.current && now > nextFid.current) {
    const [a, d] = FIDGETS[Math.floor(Math.random() * FIDGETS.length)];
    fid.current = { anim: a, until: now + d };
  }
  const eff: RigAnim = fid.current?.anim ?? anim;
  const t0 = useRef(now);
  const prev = useRef<{ anim: RigAnim; pose: TPose; at: number } | null>(null);
  const last = useRef<TPose>(P0);
  const key = useRef(startKey);
  if (key.current !== startKey || prev.current?.anim !== eff) {
    prev.current = { anim: eff, pose: prev.current ? last.current : P0, at: prev.current ? now : -1e9 };
    key.current = startKey;
    t0.current = now;
  }
  const local = still ? 0 : t - t0.current;
  let pose = toonPose(eff, Math.max(0, local), seed);
  const k = prev.current ? (now - prev.current.at) / 160 : 1;
  if (prev.current && k < 1) pose = mix(prev.current.pose, pose, ease(Math.max(0, k)));
  last.current = pose;
  return <ToonBody look={look} pose={pose} mirror={mirror} shadow={shadow} bare={bare} prop={PROP[eff]} fx={fx} uid={`tn${id}`} time={local} ko={eff === 'ko'} />;
}

// --- Цвета и ткань -----------------------------------------------------------------------------

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Плоские узоры «из бумаги»: крупные полосы и пятна. */
function Fabric({ id, p, c1, c2 }: { id: string; p?: Pattern; c1: string; c2?: string }) {
  const b = c2 ?? shade(c1, -0.3);
  switch (p) {
    case 'hstripes':
      return (
        <pattern id={id} width={10} height={8} patternUnits="userSpaceOnUse">
          <rect width={10} height={8} fill={c1} />
          <rect y={5} width={10} height={3} fill={b} />
        </pattern>
      );
    case 'wstripes':
      return (
        <pattern id={id} width={10} height={12} patternUnits="userSpaceOnUse">
          <rect width={10} height={12} fill={c1} />
          <rect y={6} width={10} height={6} fill={b} />
        </pattern>
      );
    case 'camo':
      return (
        <pattern id={id} width={30} height={26} patternUnits="userSpaceOnUse">
          <rect width={30} height={26} fill={c1} />
          <path d="M3,4 C10,0 14,8 9,11 C4,14 -1,8 3,4 Z M17,13 C24,10 29,16 24,21 C19,25 13,19 17,13 Z" fill={b} />
        </pattern>
      );
    case 'check':
      return (
        <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse">
          <rect width={10} height={10} fill={c1} />
          <rect y={3.5} width={10} height={3} fill={b} opacity={0.6} />
          <rect x={3.5} width={3} height={10} fill={b} opacity={0.6} />
        </pattern>
      );
    case 'quilt':
    case 'puffer':
      return (
        <pattern id={id} width={10} height={9} patternUnits="userSpaceOnUse">
          <rect width={10} height={9} fill={c1} />
          <path d="M0,8.5 H10" stroke={shade(c1, -0.35)} strokeWidth={1.2} />
        </pattern>
      );
    default:
      return null;
  }
}
const hasFabric = (p?: Pattern) => !!p && ['hstripes', 'wstripes', 'camo', 'check', 'quilt', 'puffer'].includes(p);

// --- Тело --------------------------------------------------------------------------------------

interface BodyProps {
  look: Look;
  pose: TPose;
  mirror?: boolean;
  shadow?: boolean;
  bare?: boolean;
  prop?: 'cig' | 'mug' | 'bowl' | 'zzz' | 'hammer';
  fx?: FaceFx;
  uid: string;
  time: number;
  ko?: boolean;
}

/** Рука-культяпка: рукав (или кожа) и кулачок-варежка на конце. */
function Arm({ x, angle, len, skin, sleeve, sleeveLen, fist, children, cuff }: { x: number; angle: number; len: number; skin: string; sleeve: string | null; sleeveLen: number; fist: boolean; children?: React.ReactNode; cuff?: string }) {
  const L = ARM_L * len;
  const w = 13;
  return (
    <g transform={`translate(${x} ${SH_Y}) rotate(${-angle})`}>
      <rect x={-w / 2} y={-4} width={w} height={L + 4} rx={w / 2} fill={skin} stroke={INK} strokeWidth={OUT} />
      {sleeve && <rect x={-w / 2 - 0.6} y={-4} width={w + 1.2} height={Math.min(L, ARM_L * sleeveLen) + 4} rx={w / 2} fill={sleeve} stroke={INK} strokeWidth={OUT} />}
      {sleeve && cuff && sleeveLen >= 1 && <rect x={-w / 2} y={L - 6} width={w} height={3} fill={cuff} />}
      <g transform={`translate(0 ${L + 2})`}>
        <circle r={fist ? 6.4 : 7.2} fill={skin} stroke={INK} strokeWidth={OUT} />
        {!fist && <path d="M -2,-4 L -2,2 M 1.5,-4 L 1.5,2" stroke={INK} strokeWidth={0.8} opacity={0.5} />}
        {children}
      </g>
    </g>
  );
}

function Leg({ x, angle, color, foot, stripe }: { x: number; angle: number; color: string; foot: { kind: string; color: string; sole?: string }; stripe?: string }) {
  const L = LEG_L;
  return (
    <g transform={`translate(${x} ${HIP_Y}) rotate(${-angle})`}>
      <rect x={-8} y={-6} width={16} height={L + 6} rx={3} fill={color} stroke={INK} strokeWidth={OUT} />
      {stripe && <rect x={5} y={-4} width={2.2} height={L + 2} fill={stripe} />}
      <g transform={`translate(2 ${L + 2})`}>
        {foot.kind === 'boots' ? (
          <path d="M -9,-8 L 7,-8 L 7,-2 C 12,-2 15,0 15,4 L -9,4 Z" fill={foot.color} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
        ) : foot.kind === 'slippers' ? (
          <path d="M -9,0 C -9,-4 10,-5 14,1 C 14,4 -9,5 -9,0 Z" fill={foot.color} stroke={INK} strokeWidth={OUT} />
        ) : (
          <path d="M -9,-3 C -9,-7 6,-7 9,-4 C 13,-4 15,-1 15,3 L -9,3 Z" fill={foot.color} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
        )}
        {foot.sole && <path d="M -9,3.6 H 15" stroke={foot.sole} strokeWidth={2} />}
      </g>
    </g>
  );
}

/** Предмет в ближней руке. */
function Prop({ kind }: { kind: 'cig' | 'mug' | 'bowl' | 'hammer' }) {
  if (kind === 'cig')
    return (
      <g transform="translate(4 -2) rotate(-60)">
        <rect x={0} y={-1.3} width={12} height={2.6} fill="#f4f0e6" stroke={INK} strokeWidth={0.8} />
        <rect x={0} y={-1.3} width={3.6} height={2.6} fill="#d08a4a" />
        <circle cx={12.4} cy={0} r={1.4} fill="#ff6a1a" />
      </g>
    );
  if (kind === 'mug')
    return (
      <g transform="translate(3 -6)">
        <rect x={0} y={0} width={11} height={13} rx={1.5} fill="#8a9098" stroke={INK} strokeWidth={1.4} />
        <path d="M 11,3 C 16,3 16,10 11,10" fill="none" stroke={INK} strokeWidth={1.6} />
      </g>
    );
  if (kind === 'bowl') return <path d="M -10,2 C -9,12 9,12 10,2 Z" fill="#a0a6ac" stroke={INK} strokeWidth={1.4} />;
  return (
    <g transform="rotate(180) translate(-2 -4)">
      <rect x={-3} y={-1.8} width={30} height={3.6} rx={1.2} fill="#a06a3a" stroke={INK} strokeWidth={1.2} />
      <rect x={24} y={-7} width={8} height={14} rx={1} fill="#6d7378" stroke={INK} strokeWidth={1.2} />
    </g>
  );
}

export function ToonBody({ look, pose, mirror, shadow = true, bare, prop, fx, uid, time, ko }: BodyProps) {
  const skin = SKIN_TONES[look.skin ?? 0] ?? SKIN_TONES[0];
  const build = [0.88, 1, 1.16][look.build ?? 1] ?? 1;
  const beef = Math.min(1.18, 0.96 + (look.str ?? 5) * 0.004);
  const top: TopWear | undefined = !bare && look.equipped.body ? TOPS[look.equipped.body] : undefined;
  const legsWear = top?.legs ?? (look.equipped.legs ? LEGS[look.equipped.legs] : undefined);
  const foot = (look.equipped.feet && FEET[look.equipped.feet]) || { kind: 'shoes', color: '#2a2420' };
  const pants = legsWear?.color ?? (bare ? '#3a3c40' : '#3a3c40');
  const bulk = (top?.bulk ?? 0) * 1.4;
  const w = 26 * build * beef + bulk; // полуширина в плечах
  const wb = 30 * build + bulk; // полуширина у пояса
  const hem = top ? Math.min(34, top.hem * 0.9) : 0;
  const bottom = HIP_Y + 4 + hem;
  const bodyFill = top ? (hasFabric(top.pattern) ? `url(#${uid}-top)` : top.color) : skin.base;
  const sleeveFill = top && top.sleeves !== 'none' ? (top.sleeveColor ?? (hasFabric(top.pattern) ? `url(#${uid}-top)` : top.color)) : null;
  const sleeveLen = top?.sleeves === 'long' ? 1.05 : top?.sleeves === 'short' ? 0.4 : 0;
  const legFill = legsWear && hasFabric(legsWear.pattern) ? `url(#${uid}-leg)` : pants;
  const torso = `M ${HX - w},${SH_Y - 8} C ${HX - w},${SH_Y - 16} ${HX + w},${SH_Y - 16} ${HX + w},${SH_Y - 8} L ${HX + wb},${bottom - 4} C ${HX + wb},${bottom + 1} ${HX - wb},${bottom + 1} ${HX - wb},${bottom - 4} Z`;
  const fist = pose.fist > 0.5;
  // поворот всего тела: стоит — вокруг ступней, лежит — набок вокруг таза
  const lieT = pose.lie ? `translate(${(pose.lie < 0 ? 44 : -44) * Math.min(1, Math.abs(pose.lie) / 80)} 0) rotate(${pose.lie} 60 196)` : '';
  const flip = mirror ? 'translate(120 0) scale(-1 1)' : '';
  const chestTat = bare ? look.tattoos.find((id) => TATTOO_ART[id]?.place === 'chest' || TATTOO_ART[id]?.place === 'belly') : undefined;
  const armTats = bare || sleeveLen < 1 ? look.tattoos.filter((id) => TATTOO_ART[id]?.place === 'arm' || TATTOO_ART[id]?.place === 'shoulder').slice(0, 2) : [];
  const charm = look.equipped.charm;
  const nearArm = (
    <Arm x={HX + w - 2} angle={pose.aN} len={pose.nL} skin={skin.base} sleeve={sleeveFill} sleeveLen={sleeveLen} fist={fist} cuff={top?.stripesSleeve}>
      {prop && prop !== 'zzz' && <Prop kind={prop} />}
      {look.equipped.weapon && (
        <g transform="scale(1.5) rotate(-10)">
          <Weapon id={look.equipped.weapon} />
        </g>
      )}
      {charm === 'charm_watch' && <rect x={-6} y={-9} width={12} height={4} rx={1} fill="#c8b070" stroke={INK} strokeWidth={1} />}
      {(charm === 'charm_ring' || charm === 'drop_ring_thief') && <circle cx={3} cy={4} r={2.2} fill="#e8c35a" stroke={INK} strokeWidth={0.8} />}
      {armTats[0] && sleeveLen < 0.5 && (
        <g transform={`translate(0 ${-ARM_L * pose.nL * 0.45}) scale(0.32)`} opacity={0.85}>
          <TattooGlyph id={armTats[0]} />
        </g>
      )}
    </Arm>
  );
  const farArm = (
    <Arm x={HX - w + 2} angle={pose.aF} len={pose.fL} skin={skin.base} sleeve={sleeveFill} sleeveLen={sleeveLen} fist={fist} cuff={top?.stripesSleeve}>
      {prop === 'bowl' && <Prop kind="bowl" />}
      {armTats[1] && sleeveLen < 0.5 && (
        <g transform={`translate(0 ${-ARM_L * pose.fL * 0.45}) scale(0.32)`} opacity={0.85}>
          <TattooGlyph id={armTats[1]} />
        </g>
      )}
    </Arm>
  );
  return (
    <g transform={flip}>
      <defs>
        {top && hasFabric(top.pattern) && <Fabric id={`${uid}-top`} p={top.pattern} c1={top.color} c2={top.pattern2} />}
        {legsWear && hasFabric(legsWear.pattern) && <Fabric id={`${uid}-leg`} p={legsWear.pattern} c1={legsWear.color} c2={legsWear.pattern2} />}
      </defs>
      {shadow && <ellipse cx={60} cy={209} rx={pose.lie ? 54 : 30} ry={4} fill="#000" opacity={0.3} />}
      <g transform={lieT}>
        <g transform={`translate(${pose.x} ${pose.y}) rotate(${pose.rot} 60 208) translate(0 ${(1 - pose.sq) * 208}) scale(1 ${pose.sq})`}>
          {/* ноги из-под туловища */}
          <Leg x={HX - 13} angle={pose.lF} color={legFill} foot={foot} stripe={legsWear?.stripe} />
          <Leg x={HX + 13} angle={pose.lN} color={legFill} foot={foot} stripe={legsWear?.stripe} />
          {/* капюшон и длинные волосы — за туловищем */}
          {top?.neck === 'hood' && <ellipse cx={HX - 6} cy={SH_Y - 10} rx={w * 0.8} ry={14} fill={top.color} stroke={INK} strokeWidth={OUT} />}
          {/* туловище */}
          <path d={torso} fill={bodyFill} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
          {top && <TopDetails top={top} w={w} wb={wb} bottom={bottom} />}
          {!top && (
            <>
              <path d={`M ${HX - 12},${SH_Y + 12} Q ${HX - 6},${SH_Y + 17} ${HX - 1},${SH_Y + 12} M ${HX + 1},${SH_Y + 12} Q ${HX + 6},${SH_Y + 17} ${HX + 12},${SH_Y + 12}`} fill="none" stroke={skin.shade} strokeWidth={1.6} />
              <circle cx={HX} cy={SH_Y + 36} r={1.6} fill={skin.shade} />
            </>
          )}
          {chestTat && (
            <g transform={`translate(${HX} ${SH_Y + 24}) scale(0.95)`} opacity={0.85}>
              <TattooGlyph id={chestTat} />
            </g>
          )}
          {charm === 'charm_cross' && (
            <g>
              <path d={`M ${HX - 12},${SH_Y - 6} Q ${HX},${SH_Y + 18} ${HX + 12},${SH_Y - 6}`} fill="none" stroke="#e8c35a" strokeWidth={2} />
              <path d={`M ${HX},${SH_Y + 10} V ${SH_Y + 22} M ${HX - 4},${SH_Y + 14} H ${HX + 4}`} stroke="#e8c35a" strokeWidth={2.6} strokeLinecap="round" />
            </g>
          )}
          {(charm === 'charm_beads' || charm === 'charm_dogtag') && (
            <path d={`M ${HX - 10},${SH_Y - 6} Q ${HX},${SH_Y + 14} ${HX + 10},${SH_Y - 6}`} fill="none" stroke={charm === 'charm_beads' ? '#8a3a1e' : '#a8b0b8'} strokeWidth={2.4} strokeDasharray={charm === 'charm_beads' ? '2 1.4' : undefined} />
          )}
          {/* руки: скрещённые — поперёк груди, иначе — по бокам */}
          {pose.cross > 0.5 ? (
            <g>
              <rect x={HX - w - 4} y={SH_Y + 16} width={(w + 4) * 2} height={13} rx={6.5} fill={sleeveFill ?? skin.base} stroke={INK} strokeWidth={OUT} />
              <circle cx={HX - w + 2} cy={SH_Y + 22} r={6.4} fill={skin.base} stroke={INK} strokeWidth={OUT} />
              <circle cx={HX + w - 2} cy={SH_Y + 24} r={6.4} fill={skin.base} stroke={INK} strokeWidth={OUT} />
            </g>
          ) : (
            <>
              {farArm}
              {nearArm}
            </>
          )}
          <g transform={`rotate(${pose.head} ${HX} ${HY + 30})`}>
            <ToonHead look={look} pose={pose} fx={fx} skin={skin} ko={ko} time={time} />
          </g>
          {prop === 'zzz' && (
            <text className="toon-zzz" x={HX + 30} y={HY - 30} fontSize={16} fontWeight={900} fill="#dfe8ff" stroke={INK} strokeWidth={0.8}>
              Z<tspan fontSize={11} dy={-8}>z</tspan>
            </text>
          )}
        </g>
      </g>
    </g>
  );
}

/** Детали одежды поверх туловища: молния, пуговицы, воротник, пояс, фартук, погоны. */
function TopDetails({ top, w, wb, bottom }: { top: TopWear; w: number; wb: number; bottom: number }) {
  const dark = shade(top.color, -0.35);
  return (
    <g>
      {top.neck === 'v' && <path d={`M ${HX - 9},${SH_Y - 11} L ${HX},${SH_Y + 6} L ${HX + 9},${SH_Y - 11}`} fill="#d9a888" stroke={INK} strokeWidth={1.4} />}
      {top.neck === 'tank' && <path d={`M ${HX - 14},${SH_Y - 12} Q ${HX},${SH_Y + 8} ${HX + 14},${SH_Y - 12}`} fill="#d9a888" stroke={INK} strokeWidth={1.4} />}
      {top.neck === 'collar' && <path d={`M ${HX - 14},${SH_Y - 12} L ${HX - 2},${SH_Y + 2} L ${HX - 4},${SH_Y - 12} Z M ${HX + 14},${SH_Y - 12} L ${HX + 2},${SH_Y + 2} L ${HX + 4},${SH_Y - 12} Z`} fill={top.lining ?? shade(top.color, 0.15)} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />}
      {top.neck === 'fur' && <path d={`M ${HX - w},${SH_Y - 8} Q ${HX},${SH_Y + 6} ${HX + w},${SH_Y - 8} Q ${HX},${SH_Y - 18} ${HX - w},${SH_Y - 8} Z`} fill={top.lining ?? '#d8c8a8'} stroke={INK} strokeWidth={1.4} />}
      {(top.zip || top.neck === 'zip') && <path d={`M ${HX},${SH_Y - 10} V ${bottom - 2}`} stroke={dark} strokeWidth={1.8} />}
      {top.buttons && [0, 1, 2, 3].map((i) => <circle key={i} cx={HX} cy={SH_Y + 2 + i * ((bottom - SH_Y - 8) / 4)} r={1.8} fill={dark} />)}
      {top.pockets && (
        <>
          <rect x={HX - wb + 7} y={bottom - 26} width={12} height={9} fill="none" stroke={dark} strokeWidth={1.4} />
          <rect x={HX + wb - 19} y={bottom - 26} width={12} height={9} fill="none" stroke={dark} strokeWidth={1.4} />
        </>
      )}
      {top.belt && <rect x={HX - wb + 1} y={HIP_Y - 8} width={(wb - 1) * 2} height={6} fill={top.belt} stroke={INK} strokeWidth={1} />}
      {top.apron && <path d={`M ${HX - 15},${SH_Y + 8} H ${HX + 15} L ${HX + 18},${bottom - 2} H ${HX - 18} Z`} fill={top.apron} stroke={INK} strokeWidth={1.4} />}
      {top.bib && (
        <>
          <rect x={HX - 14} y={SH_Y + 22} width={28} height={bottom - SH_Y - 24} fill={top.bib} stroke={INK} strokeWidth={1.4} />
          <path d={`M ${HX - 12},${SH_Y + 22} L ${HX - 18},${SH_Y - 10} M ${HX + 12},${SH_Y + 22} L ${HX + 18},${SH_Y - 10}`} stroke={top.bib} strokeWidth={4} />
        </>
      )}
      {top.epaulets && (
        <>
          <rect x={HX - w - 2} y={SH_Y - 14} width={14} height={5} rx={1} fill="#c8a24a" stroke={INK} strokeWidth={1} />
          <rect x={HX + w - 12} y={SH_Y - 14} width={14} height={5} rx={1} fill="#c8a24a" stroke={INK} strokeWidth={1} />
        </>
      )}
      {top.gloss && <path d={`M ${HX + w - 8},${SH_Y - 4} L ${HX + wb - 6},${bottom - 10}`} stroke="#fff" strokeOpacity={0.25} strokeWidth={3} strokeLinecap="round" />}
    </g>
  );
}

// --- Голова -------------------------------------------------------------------------------------

function ToonHead({ look, pose, fx, skin, ko, time }: { look: Look; pose: TPose; fx?: FaceFx; skin: (typeof SKIN_TONES)[number]; ko?: boolean; time: number }) {
  const fp = faceParts(look.face ?? 0);
  const hairC = HAIR_COLORS[(look.face ?? 0) % HAIR_COLORS.length];
  const hat = look.equipped.head ? HATS[look.equipped.head] : undefined;
  const rx = fp.jaw === 1 ? HR - 3 : fp.jaw === 2 ? HR + 2 : HR;
  const ry = HR - 3;
  const eyeY = HY - 6;
  const open = Math.max(0.06, pose.eyes);
  const px = pose.look * 3.2;
  const angry = pose.brow;
  const mY = HY + 19;
  return (
    <g>
      {fp.hair === 6 && !hat && <path d={`M ${HX - rx + 2},${HY - 10} Q ${HX - rx - 6},${HY + 34} ${HX - rx + 10},${HY + 40} L ${HX + rx - 10},${HY + 40} Q ${HX + rx + 6},${HY + 34} ${HX + rx - 2},${HY - 10} Z`} fill={hairC} stroke={INK} strokeWidth={OUT} />}
      {/* голова-круг; тяжёлая челюсть — шире книзу */}
      <ellipse cx={HX} cy={HY} rx={rx} ry={ry} fill={skin.base} stroke={INK} strokeWidth={OUT} />
      {fp.jaw === 2 && <ellipse cx={HX} cy={HY + 18} rx={rx - 4} ry={18} fill={skin.base} stroke={INK} strokeWidth={OUT} />}
      {fp.jaw === 2 && <ellipse cx={HX} cy={HY + 6} rx={rx - 1} ry={ry - 6} fill={skin.base} />}
      {/* щетина — как у отцов из мультика: тень на нижней половине лица */}
      {fp.beard === 1 && <path d={`M ${HX - rx + 3},${HY + 10} A ${rx - 1},${ry - 1} 0 0 0 ${HX + rx - 3},${HY + 10} Z`} fill={hairC} opacity={0.22} />}
      {fx?.bruise && <ellipse cx={HX + 9} cy={eyeY + 2} rx={13} ry={12} fill="#6a3a7a" opacity={0.45} />}
      {/* глаза: два овала впритык, зрачки-точки */}
      {ko ? (
        <g stroke={INK} strokeWidth={2.4} strokeLinecap="round">
          <path d={`M ${HX - 14},${eyeY - 4} l 8,8 m 0,-8 l -8,8 M ${HX + 6},${eyeY - 4} l 8,8 m 0,-8 l -8,8`} />
        </g>
      ) : (
        <g>
          <ellipse cx={HX - 9} cy={eyeY} rx={10} ry={12 * open} fill="#fff" stroke={INK} strokeWidth={1.6} />
          <ellipse cx={HX + 9} cy={eyeY} rx={10} ry={12 * open} fill="#fff" stroke={INK} strokeWidth={1.6} />
          {open > 0.3 && (
            <>
              <circle cx={HX - 7 + px} cy={eyeY + 1} r={2.4} fill={INK} />
              <circle cx={HX + 11 + px} cy={eyeY + 1} r={2.4} fill={INK} />
            </>
          )}
        </g>
      )}
      {/* брови: злость — галочкой к переносице, грусть — домиком */}
      {(Math.abs(angry) > 0.25 || fp.brow === 1) && (
        <path
          d={`M ${HX - 20},${eyeY - 14 - angry * 2} L ${HX - 2},${eyeY - 12 + angry * 4} M ${HX + 2},${eyeY - 12 + angry * 4} L ${HX + 20},${eyeY - 14 - angry * 2}`}
          stroke={hairC}
          strokeWidth={fp.brow === 1 ? 4.4 : 3}
          strokeLinecap="round"
        />
      )}
      {/* борода и усы */}
      {fp.beard === 2 && <path d={`M ${HX - rx + 5},${HY + 4} Q ${HX - rx + 8},${HY + ry + 12} ${HX},${HY + ry + 12} Q ${HX + rx - 8},${HY + ry + 12} ${HX + rx - 5},${HY + 4} Q ${HX + 10},${HY + 12} ${HX},${HY + 12} Q ${HX - 10},${HY + 12} ${HX - rx + 5},${HY + 4} Z`} fill={hairC} stroke={INK} strokeWidth={1.6} />}
      {fp.beard === 5 && <path d={`M ${HX - rx + 4},${HY} Q ${HX - rx},${HY + ry + 28} ${HX},${HY + ry + 30} Q ${HX + rx},${HY + ry + 28} ${HX + rx - 4},${HY} Q ${HX + 10},${HY + 13} ${HX},${HY + 13} Q ${HX - 10},${HY + 13} ${HX - rx + 4},${HY} Z`} fill="#c8c4bc" stroke={INK} strokeWidth={1.6} />}
      {fp.beard === 4 && <path d={`M ${HX - 6},${mY + 4} Q ${HX},${mY + 18} ${HX + 6},${mY + 4} Z`} fill={hairC} stroke={INK} strokeWidth={1.4} />}
      {/* рот */}
      {pose.mouth > 0.5 ? (
        <g>
          <path d={`M ${HX - 9},${mY - 2} Q ${HX},${mY - 4} ${HX + 9},${mY - 2} Q ${HX + 7},${mY + 11} ${HX},${mY + 11} Q ${HX - 7},${mY + 11} ${HX - 9},${mY - 2} Z`} fill="#4a1a14" stroke={INK} strokeWidth={1.6} />
          <path d={`M ${HX - 6},${mY - 1} H ${HX + 6}`} stroke="#f4eee4" strokeWidth={2.4} />
          {look.equipped.charm === 'charm_fiksa' && <rect x={HX + 1} y={mY - 2.4} width={3.4} height={3} fill="#f0c850" />}
        </g>
      ) : ko ? (
        <path d={`M ${HX - 8},${mY + 2} q 4,-4 8,0 q 4,4 8,0`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      ) : (
        <path
          d={fx?.smile ? `M ${HX - 8},${mY} Q ${HX},${mY + 7} ${HX + 8},${mY}` : angry < -0.3 ? `M ${HX - 7},${mY + 3} Q ${HX},${mY - 2} ${HX + 7},${mY + 3}` : `M ${HX - 6},${mY + 1} Q ${HX},${mY + 2.6} ${HX + 6},${mY + 1}`}
          fill="none"
          stroke={INK}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      {(fp.beard === 3 || fp.beard === 4 || fp.beard === 5) && <path d={`M ${HX - 12},${mY - 3} Q ${HX - 6},${mY - 9} ${HX},${mY - 5} Q ${HX + 6},${mY - 9} ${HX + 12},${mY - 3} Q ${HX},${mY - 2} ${HX - 12},${mY - 3} Z`} fill={fp.beard === 5 ? '#c8c4bc' : hairC} stroke={INK} strokeWidth={1.2} />}
      {fx?.blood && (
        <g>
          <path d={`M ${HX + 4},${mY + 3} Q ${HX + 5},${mY + 9} ${HX + 4},${mY + 14}`} stroke="#b01a1a" strokeWidth={2.4} strokeLinecap="round" fill="none" />
          <circle className="face-drip" cx={HX + 4} cy={mY + 16} r={1.8} fill="#c0201a" />
        </g>
      )}
      {fx?.sweat &&
        [[HX - 30, HY - 18, 0], [HX + 32, HY - 10, 0.7]].map(([x, y, d]) => (
          <path key={x} className="face-sweat" style={{ animationDelay: `${d}s` }} d={`M ${x},${y} c -3,4 -3,7 0,7 c 3,0 3,-3 0,-7 Z`} fill="#cfe6f4" stroke="#5a8aaa" strokeWidth={0.8} />
        ))}
      {fx?.breath && (
        <g className="face-breath">
          <circle cx={HX + 26} cy={mY} r={4} fill="#fff" opacity={0.5} />
          <circle cx={HX + 34} cy={mY - 4} r={5.4} fill="#fff" opacity={0.3} />
        </g>
      )}
      {!hat && <ToonHair kind={fp.hair} color={hairC} rx={rx} ry={ry} />}
      {hat && (
        <g transform="translate(0 -6)">
          <ToonHat h={hat} rx={rx} ry={ry} />
        </g>
      )}
      {ko && (
        <g className="toon-stars" style={{ transformOrigin: `${HX}px ${HY - ry - 4}px` }}>
          {[0, 1, 2].map((i) => {
            const a = (time / 300 + (i * Math.PI * 2) / 3) % (Math.PI * 2);
            return (
              <text key={i} x={HX + Math.cos(a) * 26} y={HY - ry - 4 + Math.sin(a) * 7} fontSize={12} textAnchor="middle">
                ⭐
              </text>
            );
          })}
        </g>
      )}
    </g>
  );
}

function ToonHair({ kind, color, rx, ry }: { kind: number; color: string; rx: number; ry: number }) {
  const top = HY - ry;
  // «шапка» волос: верхняя часть головы до линии роста
  const cap = (line: number) => `M ${HX - rx + 1},${line} A ${rx - 1},${ry - 1} 0 0 1 ${HX + rx - 1},${line} Q ${HX},${line - 8} ${HX - rx + 1},${line} Z`;
  switch (kind) {
    case 0:
      return <path d={`M ${HX - 14},${top + 8} Q ${HX},${top + 2} ${HX + 14},${top + 8}`} fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" />;
    case 1:
      return <path d={cap(HY - 22)} fill={color} opacity={0.55} />;
    case 7:
      return <path d={cap(HY - 22)} fill="#9a968e" opacity={0.75} />;
    case 2:
      return <path d={cap(HY - 21)} fill={color} stroke={INK} strokeWidth={1.6} />;
    case 3:
      return (
        <g>
          <path d={cap(HY - 23)} fill={color} stroke={INK} strokeWidth={1.6} />
          <path d={`M ${HX - 20},${top + 10} Q ${HX},${top + 2} ${HX + 24},${top + 14}`} fill="none" stroke={shade(color, 0.3)} strokeWidth={2} />
        </g>
      );
    case 4:
      return <path d={`M ${HX - rx + 1},${HY - 16} A ${rx - 1},${ry - 1} 0 0 1 ${HX + rx - 1},${HY - 16} L ${HX + 22},${HY - 22} L ${HX + 14},${HY - 19} L ${HX + 6},${HY - 25} L ${HX - 2},${HY - 19} L ${HX - 10},${HY - 25} L ${HX - 18},${HY - 19} Z`} fill={color} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />;
    case 5:
      return <path d={`M ${HX - 8},${top + 4} Q ${HX},${top - 14} ${HX + 8},${top + 4} Z`} fill={color} stroke={INK} strokeWidth={1.6} />;
    default:
      return <path d={cap(HY - 20)} fill={color} stroke={INK} strokeWidth={1.6} />;
  }
}

function ToonHat({ h, rx, ry }: { h: HeadWear; rx: number; ry: number }) {
  const top = HY - ry;
  const c2 = h.color2 ?? shade(h.color, 0.3);
  const dome = (line: number, extra = 2) => `M ${HX - rx - extra},${line} A ${rx + extra},${ry + extra} 0 0 1 ${HX + rx + extra},${line} Z`;
  switch (h.kind) {
    case 'beanie':
      return (
        <g>
          <path d={dome(HY - 14)} fill={h.color} stroke={INK} strokeWidth={OUT} />
          <rect x={HX - rx - 3} y={HY - 20} width={(rx + 3) * 2} height={9} rx={3} fill={shade(h.color, 0.15)} stroke={INK} strokeWidth={OUT} />
        </g>
      );
    case 'ushanka':
      return (
        <g>
          <path d={`M ${HX - rx - 4},${HY - 16} L ${HX - rx - 6},${HY + 18} L ${HX - rx + 8},${HY + 14} L ${HX - rx + 6},${HY - 12} Z M ${HX + rx + 4},${HY - 16} L ${HX + rx + 6},${HY + 18} L ${HX + rx - 8},${HY + 14} L ${HX + rx - 6},${HY - 12} Z`} fill={c2} stroke={INK} strokeWidth={OUT} />
          <path d={dome(HY - 14, 4)} fill={h.color} stroke={INK} strokeWidth={OUT} />
          <rect x={HX - rx - 5} y={HY - 22} width={(rx + 5) * 2} height={10} rx={4} fill={c2} stroke={INK} strokeWidth={OUT} />
        </g>
      );
    case 'cap8':
    case 'capgold':
      return (
        <g>
          <path d={`M ${HX - rx - 4},${HY - 14} Q ${HX - rx},${top - 10} ${HX + 4},${top - 8} Q ${HX + rx + 8},${top - 4} ${HX + rx + 6},${HY - 14} Z`} fill={h.color} stroke={INK} strokeWidth={OUT} />
          <path d={`M ${HX + 6},${HY - 16} Q ${HX + rx + 18},${HY - 18} ${HX + rx + 18},${HY - 12} L ${HX + 6},${HY - 12} Z`} fill={shade(h.color, -0.2)} stroke={INK} strokeWidth={OUT} />
          {h.kind === 'capgold' && <path d={`M ${HX - rx},${HY - 17} H ${HX + rx + 4}`} stroke={c2} strokeWidth={3} />}
        </g>
      );
    case 'crown':
      return <path d={`M ${HX - 22},${top + 10} L ${HX - 24},${top - 14} L ${HX - 11},${top - 2} L ${HX},${top - 18} L ${HX + 11},${top - 2} L ${HX + 24},${top - 14} L ${HX + 22},${top + 10} Z`} fill={h.color} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />;
    case 'furazhka':
      return (
        <g>
          <ellipse cx={HX + 2} cy={top + 2} rx={rx + 10} ry={10} fill={h.color} stroke={INK} strokeWidth={OUT} />
          <rect x={HX - rx + 4} y={top + 4} width={(rx - 4) * 2} height={12} fill={shade(h.color, -0.15)} stroke={INK} strokeWidth={OUT} />
          <rect x={HX - rx + 4} y={top + 8} width={(rx - 4) * 2} height={4} fill={c2} />
          <path d={`M ${HX + 4},${top + 16} Q ${HX + rx + 10},${top + 16} ${HX + rx + 12},${top + 22} L ${HX + 4},${top + 20} Z`} fill="#141414" stroke={INK} strokeWidth={1.4} />
          <circle cx={HX} cy={top + 10} r={3} fill="#e8c35a" stroke={INK} strokeWidth={1} />
        </g>
      );
    case 'beret':
      return <path d={`M ${HX - rx - 2},${HY - 16} Q ${HX - rx},${top - 12} ${HX + 10},${top - 6} Q ${HX + rx + 10},${top + 4} ${HX + rx},${HY - 18} Z`} fill={h.color} stroke={INK} strokeWidth={OUT} />;
    case 'chef':
      return (
        <g>
          <path d={`M ${HX - 26},${top + 12} L ${HX - 28},${top - 20} Q ${HX - 30},${top - 40} ${HX - 10},${top - 34} Q ${HX},${top - 48} ${HX + 12},${top - 34} Q ${HX + 32},${top - 40} ${HX + 28},${top - 20} L ${HX + 26},${top + 12} Z`} fill={h.color} stroke={INK} strokeWidth={OUT} />
          <path d={`M ${HX - 26},${top + 4} H ${HX + 26}`} stroke={INK} strokeWidth={1.2} />
        </g>
      );
    case 'helmet':
      return (
        <g>
          <path d={dome(HY - 10, 5)} fill={h.color} stroke={INK} strokeWidth={OUT} />
          <rect x={HX - rx - 6} y={HY - 14} width={(rx + 6) * 2} height={6} rx={3} fill={shade(h.color, -0.3)} stroke={INK} strokeWidth={1.4} />
        </g>
      );
    case 'baseball':
      return (
        <g>
          <path d={dome(HY - 14, 2)} fill={h.color} stroke={INK} strokeWidth={OUT} />
          <path d={`M ${HX + 6},${HY - 16} Q ${HX + rx + 22},${HY - 18} ${HX + rx + 22},${HY - 11} L ${HX + 6},${HY - 12} Z`} fill={h.color} stroke={INK} strokeWidth={OUT} />
          <text x={HX} y={HY - 26} fontSize={11} fontWeight={900} textAnchor="middle" fill={c2}>
            Z
          </text>
        </g>
      );
    case 'mink':
      return <path d={`M ${HX - rx - 4},${HY - 12} Q ${HX - rx - 6},${top - 12} ${HX},${top - 14} Q ${HX + rx + 6},${top - 12} ${HX + rx + 4},${HY - 12} Q ${HX},${HY - 20} ${HX - rx - 4},${HY - 12} Z`} fill={h.color} stroke={INK} strokeWidth={OUT} />;
    default:
      return null;
  }
}

/** Портрет: только голова, кружком. */
export function ToonHeadPortrait({ look, size = 40, className }: { look: Look; size?: number; className?: string }) {
  const skin = SKIN_TONES[look.skin ?? 0] ?? SKIN_TONES[0];
  return (
    <svg className={className} width={size} height={size} viewBox="12 14 96 96" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect x={12} y={14} width={96} height={96} fill="#2a241c" />
      <path d={`M ${HX - 30},${SH_Y + 20} C ${HX - 30},${SH_Y - 14} ${HX + 30},${SH_Y - 14} ${HX + 30},${SH_Y + 20} Z`} fill={(look.equipped.body && TOPS[look.equipped.body]?.color) || '#4a4c50'} stroke={INK} strokeWidth={OUT} />
      <ToonHead look={look} pose={{ ...P0, look: 0.3 }} skin={skin} time={0} />
    </svg>
  );
}
