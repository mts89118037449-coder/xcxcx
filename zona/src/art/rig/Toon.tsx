// Персонажи в духе «Южного парка»: плоские фигурки из простых форм — большая круглая голова,
// глаза-овалы с веками, туловище-трапеция, руки и ноги из двух кусочков (локоть и колено).
// Анимация «вырезками»: части поворачиваются целиком, голова и волосы чуть запаздывают за телом,
// перед прыжком — присед, при приземлении — приплюснутость и пыль.
// Та же система координат, что у прежней куклы: 120×210, ступни на y=210, центр x=60, лицом вправо.
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
const HIP_Y = 172;
const UA = 19; // плечо
const FA = 18; // предплечье
const TH = 17; // бедро
const SN = 16; // голень

// --- Поза ------------------------------------------------------------------------------------

interface TPose {
  x: number;
  y: number;
  rot: number; // наклон всего тела вокруг ступней, «+» — вперёд
  sq: number; // приплюснутость (1 — норма, меньше — сплющен, больше — вытянут)
  head: number; // наклон головы
  hy: number; // голова выше/ниже тела (кивок, запаздывание)
  aN: number; // ближняя рука в плече: 0 — вниз, «+» — вперёд, 180 — вверх
  eN: number; // локоть: «+» — предплечье сгибается вперёд-вверх
  aF: number;
  eF: number;
  hN: number; // ближняя нога в бедре: «+» — вперёд
  kN: number; // колено: «+» — голень назад
  hF: number;
  kF: number;
  mouth: number; // 0 — закрыт, 1 — широко открыт
  smile: number; // −1 — грусть, 1 — улыбка
  teeth: number; // 1 — стиснул зубы
  brow: number; // −1 грусть, 0, 1 злость (веки)
  eyes: number; // 1 — открыты, 0 — закрыты
  look: number; // зрачки: −1 назад, 1 вперёд
  lookY: number;
  fist: number;
  lie: number; // лёг: −90 — на спину, 90 — лицом вниз
  dust: number; // пыль из-под ног
}

const P0: TPose = {
  x: 0, y: 0, rot: 0, sq: 1, head: 0, hy: 0,
  aN: 8, eN: 10, aF: -8, eF: 10,
  hN: 0, kN: 0, hF: 0, kF: 0,
  mouth: 0, smile: 0, teeth: 0, brow: 0, eyes: 1, look: 0.5, lookY: 0, fist: 0, lie: 0, dust: 0,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** С перелётом и возвратом — удар «щёлкает». */
const back = (t: number) => {
  const c = 1.9;
  const u = clamp01(t) - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
function mix(a: TPose, b: TPose, t: number): TPose {
  const o = { ...a };
  for (const k of Object.keys(a) as (keyof TPose)[]) o[k] = lerp(a[k], b[k], t);
  return o;
}
const step = (x: number, a: number, b: number) => ease(clamp01((x - a) / (b - a)));
/** «Рывки» вырезной анимации: значение меняется ступеньками. */
const choppy = (v: number, n = 1) => Math.round(v / n) * n;
/** Детерминированный шум 0..1 по номеру кадра. */
const noise = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Моргание: раз в ~3,5 с, иногда дважды. */
function blink(s: number, seed: number) {
  const c = (s + seed) % 3.6;
  if (c < 0.1) return 0.05;
  if (noise(Math.floor((s + seed) / 3.6)) > 0.7 && c > 0.22 && c < 0.3) return 0.05;
  return 1;
}
/** Взгляд: зрачки «перепрыгивают» с места на место, как у мультяшек. */
const glance = (s: number, seed: number) => {
  const i = Math.floor((s + seed) / 1.7);
  return { look: noise(i) * 1.6 - 0.4, lookY: noise(i + 99) * 0.8 - 0.4 };
};

/**
 * Рука тянется к точке (обратная кинематика на две кости): цель — смещение кисти от плеча.
 * Локоть выбираем тот, что ниже: так руки не выворачиваются.
 */
function reach(dx: number, dy: number): { a: number; e: number } {
  const L1 = UA;
  const L2 = FA + 3;
  const d = Math.max(Math.abs(L1 - L2) + 0.5, Math.min(L1 + L2 - 0.5, Math.hypot(dx, dy)));
  const base = (Math.atan2(dx, dy) * 180) / Math.PI;
  const off = (Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)) * 180) / Math.PI;
  const inner = (Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)) * 180) / Math.PI;
  const opt = [1, -1].map((sg) => {
    const a = base + sg * off;
    const r = (a * Math.PI) / 180;
    return { a, e: -sg * (180 - inner), elbowY: L1 * Math.cos(r) };
  });
  const best = opt[0].elbowY >= opt[1].elbowY ? opt[0] : opt[1];
  return { a: best.a, e: best.e };
}
/** Ближняя рука к точке на фигурке (координаты рига). */
const nearTo = (x: number, y: number) => {
  const r = reach(x - 82, y - SH_Y);
  return { aN: r.a, eN: r.e };
};
const farTo = (x: number, y: number) => {
  const r = reach(x - 38, y - SH_Y);
  return { aF: r.a, eF: r.e };
};
const MOUTH: [number, number] = [64, 86];
const CHIN: [number, number] = [68, 100];

/** Стойка: кулаки у подбородка, локти вниз. */
const GUARD: TPose = { ...P0, y: 3, rot: 4, ...nearTo(92, 96), ...farTo(70, 98), hN: 14, kN: 14, hF: -12, kF: 10, fist: 1, brow: 0.8, teeth: 0, look: 1 };

export function toonPose(anim: RigAnim, t: number, seed = 0): TPose {
  const s = t / 1000;
  const eyes = blink(s, seed);
  const g = glance(s, seed);
  switch (anim) {
    case 'idle': {
      // дыхание, перенос веса с ноги на ногу, взгляд по сторонам
      const b = Math.sin(s * 2.2);
      const w = Math.sin(s * 0.55 + seed);
      return { ...P0, y: choppy(b * 1.2), sq: 1 + b * 0.008, x: choppy(w * 1.5), rot: w * 1.2, hN: w * 3, hF: w * 3, aN: 8 + b * 2, aF: -8 - b * 2, eyes, ...g };
    }
    case 'crossed': {
      const b = Math.sin(s * 2);
      return { ...P0, y: choppy(b), ...nearTo(44, 128), ...farTo(78, 124), brow: 0.6, eyes, ...g, head: Math.sin(s * 0.6) * 3, smile: -0.2 };
    }
    case 'walk':
    case 'run': {
      const run = anim === 'run';
      const ph = s * Math.PI * 2 * (run ? 2.1 : 1.5);
      const sw = Math.sin(ph);
      const lift = (a: number) => Math.max(0, Math.sin(a)); // нога в воздухе — колено согнуто
      const A = run ? 38 : 24;
      return {
        ...P0,
        y: -Math.abs(Math.cos(ph)) * (run ? 6 : 3) + (run ? 3 : 1),
        rot: run ? 10 : 3,
        hN: sw * A, kN: lift(ph + Math.PI / 2) * (run ? 70 : 40),
        hF: -sw * A, kF: lift(ph - Math.PI / 2) * (run ? 70 : 40),
        aN: -sw * (run ? 46 : 26) + (run ? 20 : 4), eN: run ? 80 : 18,
        aF: sw * (run ? 46 : 26) + (run ? 20 : -4), eF: run ? 80 : 18,
        fist: run ? 1 : 0,
        eyes,
        look: 1,
        mouth: run ? 0.45 : 0,
        smile: run ? 0 : 0.2,
      };
    }
    case 'sit': {
      const b = Math.sin(s * 1.8);
      return { ...P0, y: 18 + choppy(b * 0.8), hN: 88, kN: 88, hF: 84, kF: 92, aN: 30, eN: 40, aF: 22, eF: 46, eyes, ...g, head: Math.sin(s * 0.5) * 3 };
    }
    case 'floor': {
      return { ...P0, y: 30, hN: 86, kN: 10, hF: 82, kF: 22, aN: 50, eN: 30, aF: 30, eF: 40, head: 8, brow: -1, eyes: 0.55, smile: -0.6 };
    }
    case 'guard': {
      const b = Math.sin(s * 6);
      return { ...GUARD, y: GUARD.y + choppy(b * 1.6), eyes, x: choppy(Math.sin(s * 3) * 1.5) };
    }
    case 'punch': {
      // замах назад → выпад с перелётом → возврат
      const gp = toonPose('guard', t, seed);
      const wind: TPose = { ...gp, x: -4, rot: -2, aN: 20, eN: 130 };
      const hit: TPose = { ...gp, x: 14, rot: 12, aN: 90, eN: 0, aF: 30, eF: 118, mouth: 0.8, brow: 1, hN: 24, kN: 6, hF: -22, kF: 20, sq: 1.03 };
      if (s < 0.08) return mix(gp, wind, ease(s / 0.08));
      if (s < 0.2) return mix(wind, hit, back((s - 0.08) / 0.12));
      if (s < 0.32) return hit;
      return mix(hit, gp, ease(clamp01((s - 0.32) / 0.2)));
    }
    case 'kick': {
      const gp = toonPose('guard', t, seed);
      const chamber: TPose = { ...gp, rot: -6, hN: 70, kN: 110, aF: 60 };
      const hit: TPose = { ...gp, x: 8, rot: -14, hN: 92, kN: 0, hF: -6, kF: 6, mouth: 0.9, aN: 60, eN: 60, aF: 70, eF: 40 };
      if (s < 0.1) return mix(gp, chamber, ease(s / 0.1));
      if (s < 0.22) return mix(chamber, hit, back((s - 0.1) / 0.12));
      if (s < 0.34) return hit;
      return mix(hit, gp, ease(clamp01((s - 0.34) / 0.24)));
    }
    case 'hit': {
      const gp = toonPose('guard', t, seed);
      const rec: TPose = { ...gp, x: -12, rot: -16, head: -18, hy: -3, brow: -1, eyes: 0.15, teeth: 1, aN: 50, eN: 70, aF: 40, eF: 60, sq: 0.92 };
      if (s < 0.05) return mix(gp, rec, s / 0.05);
      return mix(rec, gp, ease(clamp01((s - 0.12) / 0.32)));
    }
    case 'ko': {
      // откидывается назад, падает и подпрыгивает от удара о землю
      const fall = ease(clamp01(s / 0.42));
      const lie: TPose = { ...P0, lie: -90, aN: 140, eN: 20, aF: -150, eF: 10, hN: 20, kN: 30, hF: -6, kF: 20, eyes: 0, brow: -1, mouth: 0.35 };
      const p = mix(toonPose('hit', 60, seed), lie, fall);
      const bounce = s > 0.42 && s < 0.7 ? Math.sin(((s - 0.42) / 0.28) * Math.PI) * 6 : 0;
      return { ...p, y: p.y - bounce, dust: s > 0.4 && s < 0.9 ? 1 - (s - 0.4) / 0.5 : 0 };
    }
    case 'cheer': {
      // присед → прыжок с руками вверх → приземление с пылью
      const c = s % 0.9;
      const crouch = c < 0.18 ? Math.sin((c / 0.18) * Math.PI) : 0;
      const air = c >= 0.18 && c < 0.66 ? Math.sin(((c - 0.18) / 0.48) * Math.PI) : 0;
      const land = c >= 0.66 && c < 0.8 ? Math.sin(((c - 0.66) / 0.14) * Math.PI) : 0;
      return {
        ...P0,
        y: crouch * 6 + land * 4 - air * 20,
        sq: 1 - crouch * 0.07 - land * 0.08 + air * 0.05,
        aN: 160 - crouch * 60, eN: 10, aF: -160 + crouch * 60, eF: 10,
        hN: air * 18, kN: crouch * 30 + air * 40, hF: -air * 10, kF: crouch * 30 + air * 50,
        fist: 1, mouth: 1, smile: 1, eyes,
        dust: land,
      };
    }
    case 'work': {
      // молотком: медленный замах, быстрый удар, отдача
      const c = (s * 1.4) % 1;
      const up = c < 0.6 ? ease(c / 0.6) : Math.max(0, 1 - (c - 0.6) / 0.08);
      return { ...P0, y: lerp(3, 0, up), rot: lerp(8, -2, up), aN: lerp(60, 170, up), eN: lerp(30, 20, up), aF: 30, eF: 60, fist: 1, brow: 0.6, teeth: up < 0.1 ? 1 : 0, eyes, look: 1, lookY: 0.6 };
    }
    case 'smoke': {
      const c = s % 4.4;
      const up = step(c, 0, 0.5) - step(c, 1.8, 2.3);
      const m = nearTo(...MOUTH);
      return { ...P0, aN: lerp(8, m.aN, up), eN: lerp(10, m.eN, up), aF: -8, mouth: c > 2.3 && c < 3.1 ? 0.35 : 0, eyes: up > 0.8 ? 0.45 : eyes, head: lerp(0, -4, up), look: 0.2 };
    }
    case 'drink': {
      const c = s % 3.4;
      const up = step(c, 0, 0.6) - step(c, 2.2, 2.8);
      const m = nearTo(MOUTH[0] + 4, MOUTH[1] + 4);
      return { ...P0, aN: lerp(8, m.aN, up), eN: lerp(10, m.eN, up), head: lerp(0, -10, up), eyes: up > 0.8 ? 0.15 : eyes, smile: up < 0.2 ? 0.4 : 0 };
    }
    case 'eat': {
      const up = (1 - Math.cos(s * 3.2)) / 2;
      const m = nearTo(MOUTH[0] + 2, MOUTH[1] + 2);
      const bowl = farTo(72, 128);
      return { ...toonPose('sit', t, seed), aN: lerp(46, m.aN, up), eN: lerp(60, m.eN, up), ...bowl, mouth: up > 0.85 ? 0.7 : 0, eyes, look: 0.8, lookY: 0.6 };
    }
    case 'think': {
      const b = Math.sin(s * 1.3);
      return { ...P0, ...nearTo(...CHIN), fist: 1, ...farTo(70, 132), head: 4 + b * 3, brow: 0.4, look: 0.4, lookY: -0.8, eyes: 0.75, smile: -0.3 };
    }
    case 'stretch': {
      const k = step(s, 0, 0.5) - step(s, 1.8, 2.5);
      return { ...P0, y: -3 * k, sq: 1 + 0.06 * k, aN: lerp(8, 172, k), aF: lerp(-8, -172, k), eN: 0, eF: 0, mouth: k > 0.6 ? 1 : 0, eyes: k > 0.5 ? 0.05 : eyes };
    }
    case 'wave': {
      const k = step(s, 0, 0.25) - step(s, 1.6, 2);
      return { ...P0, aN: lerp(8, 130, k), eN: lerp(10, 40 + Math.sin(s * 14) * 26, k), smile: k, mouth: k > 0.5 ? 0.4 : 0, eyes, look: 1 };
    }
    case 'flex': {
      // «двойной бицепс»: локти в стороны, кулаки к голове, мышцы дрожат
      const k = step(s, 0, 0.3) - step(s, 1.7, 2.2);
      const w = Math.sin(s * 22) * 3 * k;
      return { ...P0, sq: 1 - 0.03 * k, aN: lerp(8, 92 + w, k), eN: lerp(10, 110, k), aF: lerp(-8, -92 - w, k), eF: lerp(10, -110, k), fist: 1, brow: k, teeth: k > 0.5 ? 1 : 0, eyes };
    }
    case 'cold': {
      const tr = choppy(Math.sin(s * 40) * 1.4);
      return { ...P0, x: tr, ...nearTo(46, 126), ...farTo(76, 122), fist: 1, brow: -0.8, head: 6, sq: 0.97, teeth: 1, eyes };
    }
    case 'squat': {
      const k = (1 - Math.cos(s * 3.6)) / 2;
      return { ...P0, y: 16 * k, rot: 4 * k, aN: 90 * k, eN: 0, aF: 80 * k, eF: 0, hN: 60 * k, kN: 100 * k, hF: 54 * k, kF: 100 * k, fist: 1, brow: k, teeth: k > 0.7 ? 1 : 0, eyes };
    }
    case 'crouch': {
      const b = Math.sin(s * 1.4);
      return { ...P0, y: 18 + choppy(b), hN: 74, kN: 140, hF: 66, kF: 140, aN: 50, eN: 50, aF: 40, eF: 60, head: Math.sin(s * 0.5) * 6, look: Math.sin(s * 0.5), brow: 0.3, eyes };
    }
    case 'pushup': {
      const k = (1 - Math.cos(s * 3.8)) / 2;
      return { ...P0, lie: 80, y: lerp(-4, 8, k), aN: -80, eN: lerp(0, 70, k), aF: -80, eF: lerp(0, 70, k), brow: 0.6 + k * 0.4, teeth: k > 0.6 ? 1 : 0, eyes };
    }
    case 'sleep': {
      const b = Math.sin(s * 1.4);
      return { ...P0, lie: -90, sq: 1 + b * 0.02, aN: 30, eN: 60, aF: -20, eF: 30, hN: 10, kN: 20, eyes: 0, mouth: 0.15 + Math.max(0, b) * 0.2 };
    }
    case 'dance': {
      const ph = s * Math.PI * 2 * 1.3;
      const sw = Math.sin(ph);
      return { ...P0, y: -Math.abs(sw) * 6, rot: sw * 8, aN: 110 + sw * 50, eN: 30, aF: -110 + sw * 50, eF: -30, hN: Math.max(0, sw) * 40, kN: Math.max(0, sw) * 60, hF: -Math.max(0, -sw) * 40, kF: Math.max(0, -sw) * 60, mouth: 1, smile: 1, fist: 1, eyes };
    }
    case 'taunt': {
      // «иди сюда»: ладонь вверх, пальцы подманивают, ухмылка
      const b = Math.sin(s * 8);
      return { ...toonPose('guard', t, seed), aN: 70, eN: 50 + b * 22, fist: 0, brow: 1, smile: 0.8, mouth: 0, head: -4 };
    }
    case 'dodge': {
      const gp = toonPose('guard', t, seed);
      const out: TPose = { ...gp, x: -14, rot: -22, y: 6, sq: 0.95, head: -10, hN: -10, kN: 30, hF: -30, kF: 10, eyes: 1, mouth: 0.5 };
      if (s < 0.1) return mix(gp, out, back(s / 0.1));
      if (s < 0.36) return out;
      return mix(out, gp, ease(clamp01((s - 0.36) / 0.28)));
    }
    case 'pullup': {
      const b = (Math.sin(s * 4) + 1) / 2;
      return { ...P0, y: -24 * b, aN: 176, eN: lerp(0, 100, b), aF: -176, eF: lerp(0, -100, b), fist: 1, hN: 10, kN: 30, hF: -10, kF: 40, brow: 1, teeth: b > 0.6 ? 1 : 0, eyes };
    }
    case 'talk': {
      // говорит: рот хлопает слогами, кивки, жест рукой
      const i = Math.floor(s * 9);
      const syl = noise(i + seed * 13) > 0.25 ? 0.25 + noise(i * 3 + 7) * 0.6 : 0;
      const pause = (s + seed) % 3 > 2.3;
      return { ...P0, mouth: pause ? 0 : syl, hy: choppy(Math.sin(s * 5) * 1.2), head: Math.sin(s * 2.4) * 3, aN: 40 + Math.sin(s * 3) * 12, eN: 70 + Math.sin(s * 4) * 18, eyes, look: 0.9, smile: 0.2 };
    }
    case 'scratch': {
      // чешет затылок
      const sc = Math.sin(s * 22) * 6;
      const h = farTo(40 + sc * 0.4, 44);
      return { ...P0, ...h, head: 5, eyes: 0.8, look: -0.4, lookY: -0.6, smile: -0.3 };
    }
    case 'yawn': {
      const k = step(s, 0, 0.4) - step(s, 1.6, 2.1);
      const m = nearTo(MOUTH[0] + 2, MOUTH[1] + 6);
      return { ...P0, y: -k, sq: 1 + 0.04 * k, aN: lerp(8, m.aN, k), eN: lerp(10, m.eN, k), mouth: k, eyes: k > 0.4 ? 0.05 : eyes, head: -6 * k };
    }
  }
  return P0;
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
    // 20 кадров в секунду: мультяшная «ступенчатость», но удары не дёргаются
    const f = (now: number) => {
      if (now - last > 48) {
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

const FIDGETS: [RigAnim, number][] = [['smoke', 4400], ['think', 3200], ['drink', 3400], ['stretch', 2600], ['wave', 2000], ['flex', 2200], ['scratch', 1800], ['yawn', 2200]];
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
  const k = prev.current ? (now - prev.current.at) / 170 : 1;
  if (prev.current && k < 1) pose = mix(prev.current.pose, pose, ease(Math.max(0, k)));
  // голова запаздывает за телом: тело пошло вниз — голова ещё вверху, и наоборот
  const lag = useRef(0);
  const dy = pose.y - last.current.y;
  lag.current = still ? 0 : Math.max(-4, Math.min(4, lag.current * 0.55 - dy * 0.7));
  last.current = pose;
  const shown = lag.current ? { ...pose, hy: pose.hy + lag.current } : pose;
  return <ToonBody look={look} pose={shown} mirror={mirror} shadow={shadow} bare={bare} prop={PROP[eff]} fx={fx} uid={`tn${id}`} time={local} ko={eff === 'ko'} />;
}

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

/** Капсула вдоль кости: полуширина w0 у сустава, w1 у конца — «вырезанный» кусок картона. */
function seg(len: number, w0: number, w1: number) {
  return `M ${-w0},0 L ${-w1},${len} A ${w1},${w1} 0 0 0 ${w1},${len} L ${w0},0 A ${w0},${w0} 0 0 0 ${-w0},0 Z`;
}

/** Ладонь-варежка с большим пальцем или кулак с костяшками. */
function Hand({ skin, fist, children }: { skin: string; fist: boolean; children?: ReactNode }) {
  return (
    <g>
      {fist ? (
        <>
          <circle r={6.6} fill={skin} stroke={INK} strokeWidth={OUT} />
          <path d="M 2,-4.5 Q 5.5,-1 2,3" fill="none" stroke={INK} strokeWidth={1} opacity={0.55} />
        </>
      ) : (
        <>
          <path d="M -5.5,-3 C -6.5,4 -3,9 1,9 C 5,9 7,4 6,-3 Z" fill={skin} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
          <path d="M 5.4,-1 C 9,-1 10,3 7,5" fill={skin} stroke={INK} strokeWidth={1.6} />
        </>
      )}
      {children}
    </g>
  );
}

/** Рука из двух кусков: плечо и предплечье, локоть прячется под круглым стыком. */
function Arm({ x, a, e, skin, sleeve, sleeveTo, cuff, fist, dark, children, tattoo }: { x: number; a: number; e: number; skin: string; sleeve: string | null; sleeveTo: number; cuff?: string; fist: boolean; dark?: boolean; children?: ReactNode; tattoo?: string }) {
  // sleeveTo: 0 — без рукава, 0.6 — короткий, 2 — длинный
  const up = sleeve && sleeveTo > 0 ? sleeve : skin;
  const fore = sleeve && sleeveTo >= 2 ? sleeve : skin;
  return (
    <g transform={`translate(${x} ${SH_Y}) rotate(${-a})`} style={dark ? { filter: 'brightness(0.86)' } : undefined}>
      <path d={seg(UA, 7.2, 6.4)} fill={skin} stroke={INK} strokeWidth={OUT} />
      {sleeve && sleeveTo > 0 && sleeveTo < 1 && <path d={seg(UA * sleeveTo, 7.8, 7.4)} fill={up} stroke={INK} strokeWidth={OUT} />}
      {sleeveTo >= 1 && <path d={seg(UA, 7.6, 6.8)} fill={up} stroke={INK} strokeWidth={OUT} />}
      {tattoo && sleeveTo < 0.7 && (
        <g transform={`translate(0 ${UA * 0.62}) scale(0.3)`} opacity={0.85}>
          <TattooGlyph id={tattoo} />
        </g>
      )}
      <g transform={`translate(0 ${UA}) rotate(${-e})`}>
        <path d={seg(FA, 6.6, 5.8)} fill={fore} stroke={INK} strokeWidth={OUT} />
        {cuff && sleeveTo >= 2 && <path d={`M -6.2,${FA - 3} H 6.2`} stroke={cuff} strokeWidth={2.6} />}
        {/* шов локтя закрываем кружком того же цвета — сустав не виден */}
        <circle r={5.9} fill={up} />
        <g transform={`translate(0 ${FA + 3})`}>
          <Hand skin={skin} fist={fist}>
            {children}
          </Hand>
        </g>
      </g>
    </g>
  );
}

/** Нога: бедро и голень, ступня всегда стоит ровно, носком вперёд. */
function Leg({ x, h, k, color, foot, stripe, dark }: { x: number; h: number; k: number; color: string; foot: { kind: string; color: string; sole?: string }; stripe?: string; dark?: boolean }) {
  return (
    <g transform={`translate(${x} ${HIP_Y}) rotate(${-h})`} style={dark ? { filter: 'brightness(0.84)' } : undefined}>
      <path d={seg(TH, 8.6, 7.8)} fill={color} stroke={INK} strokeWidth={OUT} />
      {stripe && <path d={`M 6,0 L 5.4,${TH}`} stroke={stripe} strokeWidth={2.2} />}
      <g transform={`translate(0 ${TH}) rotate(${k})`}>
        <path d={seg(SN, 7.8, 7.2)} fill={color} stroke={INK} strokeWidth={OUT} />
        {stripe && <path d={`M 5.4,0 L 5,${SN}`} stroke={stripe} strokeWidth={2.2} />}
        <circle r={7.2} fill={color} />
        <g transform={`translate(0 ${SN + 2}) rotate(${h - k})`}>
          <g transform="translate(2 0)">
            {foot.kind === 'boots' ? (
              <path d="M -9,-9 L 7,-9 L 7,-3 C 12,-3 15,-1 15,4 L -9,4 Z" fill={foot.color} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            ) : foot.kind === 'slippers' ? (
              <path d="M -9,0 C -9,-5 10,-6 14,1 C 14,4 -9,5 -9,0 Z" fill={foot.color} stroke={INK} strokeWidth={OUT} />
            ) : (
              <path d="M -9,-4 C -9,-8 6,-8 9,-5 C 13,-5 15,-1 15,3 L -9,3 Z" fill={foot.color} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            )}
            {foot.sole && <path d="M -9,3.6 H 15" stroke={foot.sole} strokeWidth={2} />}
          </g>
        </g>
      </g>
    </g>
  );
}

/** Предмет в ближней руке. */
function Prop({ kind }: { kind: 'cig' | 'mug' | 'bowl' | 'hammer' }) {
  if (kind === 'cig')
    return (
      <g transform="translate(5 -3) rotate(-50)">
        <rect x={0} y={-1.3} width={12} height={2.6} fill="#f4f0e6" stroke={INK} strokeWidth={0.8} />
        <rect x={0} y={-1.3} width={3.6} height={2.6} fill="#d08a4a" />
        <circle className="toon-ember" cx={12.4} cy={0} r={1.5} fill="#ff6a1a" />
      </g>
    );
  if (kind === 'mug')
    return (
      <g transform="translate(2 -8)">
        <rect x={0} y={0} width={11} height={13} rx={1.5} fill="#8a9098" stroke={INK} strokeWidth={1.4} />
        <path d="M 11,3 C 16,3 16,10 11,10" fill="none" stroke={INK} strokeWidth={1.6} />
        <path className="steam" d="M 4,-2 Q 2,-6 5,-10" fill="none" stroke="#fff" strokeWidth={1.2} opacity={0.6} />
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
  const pants = legsWear?.color ?? '#3a3c40';
  const bulk = (top?.bulk ?? 0) * 1.4;
  const w = 25 * build * beef + bulk; // полуширина в плечах
  const wb = 28 * build + bulk; // у пояса
  const hem = top ? Math.min(34, top.hem * 0.9) : 0;
  const bottom = HIP_Y + 2 + hem;
  const fabric = top && hasFabric(top.pattern);
  const bodyFill = top ? (fabric ? `url(#${uid}-top)` : top.color) : skin.base;
  const sleeveFill = top && top.sleeves !== 'none' ? (top.sleeveColor ?? (fabric ? `url(#${uid}-top)` : top.color)) : null;
  const sleeveTo = top?.sleeves === 'long' ? 2 : top?.sleeves === 'short' ? 0.6 : 0;
  const legFill = legsWear && hasFabric(legsWear.pattern) ? `url(#${uid}-leg)` : pants;
  const torso = `M ${HX - w},${SH_Y - 6} C ${HX - w},${SH_Y - 17} ${HX + w},${SH_Y - 17} ${HX + w},${SH_Y - 6} L ${HX + wb},${bottom - 5} C ${HX + wb},${bottom + 2} ${HX - wb},${bottom + 2} ${HX - wb},${bottom - 5} Z`;
  const fist = pose.fist > 0.5;
  const lieK = Math.min(1, Math.abs(pose.lie) / 80);
  const lieT = pose.lie ? `translate(${(pose.lie < 0 ? 44 : -44) * lieK} 0) rotate(${pose.lie} 60 196)` : '';
  const flip = mirror ? 'translate(120 0) scale(-1 1)' : '';
  const chestTat = bare ? look.tattoos.find((id) => TATTOO_ART[id]?.place === 'chest' || TATTOO_ART[id]?.place === 'belly') : undefined;
  const armTats = bare || sleeveTo < 1 ? look.tattoos.filter((id) => TATTOO_ART[id]?.place === 'arm' || TATTOO_ART[id]?.place === 'shoulder').slice(0, 2) : [];
  const charm = look.equipped.charm;
  // где кисть ближней руки: поднята к лицу — рисуем руку поверх головы (курит, пьёт, думает)
  const rad = (d: number) => (d * Math.PI) / 180;
  const handY = SH_Y + UA * Math.cos(rad(pose.aN)) + (FA + 3) * Math.cos(rad(pose.aN + pose.eN));
  const handX = HX + w - 3 + UA * Math.sin(rad(pose.aN)) + (FA + 3) * Math.sin(rad(pose.aN + pose.eN));
  const handOnFace = handY < SH_Y - 6 && Math.abs(handX - HX) < HR + 4;
  // дальняя рука прячется за туловище, пока висит; поднятая — впереди
  const farFront = Math.abs(pose.aF) > 28 || Math.abs(pose.eF) > 40;
  const nearArm = (
    <Arm x={HX + w - 3} a={pose.aN} e={pose.eN} skin={skin.base} sleeve={sleeveFill} sleeveTo={sleeveTo} fist={fist} cuff={top?.stripesSleeve} tattoo={armTats[0]}>
      {prop && prop !== 'zzz' && <Prop kind={prop} />}
      {look.equipped.weapon && (
        <g transform="scale(1.5) rotate(-10)">
          <Weapon id={look.equipped.weapon} />
        </g>
      )}
      {charm === 'charm_watch' && <rect x={-6} y={-10} width={12} height={4} rx={1} fill="#c8b070" stroke={INK} strokeWidth={1} />}
      {(charm === 'charm_ring' || charm === 'drop_ring_thief') && <circle cx={3} cy={4} r={2.2} fill="#e8c35a" stroke={INK} strokeWidth={0.8} />}
    </Arm>
  );
  const farArm = (
    <Arm x={HX - w + 3} a={pose.aF} e={pose.eF} skin={skin.base} sleeve={sleeveFill} sleeveTo={sleeveTo} fist={fist} cuff={top?.stripesSleeve} dark tattoo={armTats[1]}>
      {prop === 'bowl' && <Prop kind="bowl" />}
    </Arm>
  );
  return (
    <g transform={flip}>
      <defs>
        {fabric && <Fabric id={`${uid}-top`} p={top!.pattern} c1={top!.color} c2={top!.pattern2} />}
        {legsWear && hasFabric(legsWear.pattern) && <Fabric id={`${uid}-leg`} p={legsWear.pattern} c1={legsWear.color} c2={legsWear.pattern2} />}
      </defs>
      {shadow && <ellipse cx={60 + pose.x * 0.5} cy={209} rx={(pose.lie ? 54 : 30) * (1 + Math.min(0, pose.y) / 60)} ry={4} fill="#000" opacity={0.3} />}
      {pose.dust > 0.05 && (
        <g opacity={pose.dust}>
          {[-26, -14, 14, 26].map((dx, i) => (
            <circle key={i} cx={60 + dx * (1.6 - pose.dust * 0.6)} cy={205 - (i % 2) * 3} r={4 + (1 - pose.dust) * 4} fill="#d8ccb0" opacity={0.7} />
          ))}
        </g>
      )}
      <g transform={lieT}>
        <g transform={`translate(${pose.x} ${pose.y}) rotate(${pose.rot} 60 208) translate(0 ${(1 - pose.sq) * 208}) scale(1 ${pose.sq})`}>
          {/* дальняя нога и рука — за телом, чуть темнее: так фигурка объёмнее */}
          <Leg x={HX - 12} h={pose.hF} k={pose.kF} color={legFill} foot={foot} stripe={legsWear?.stripe} dark />
          {!farFront && farArm}
          {top?.neck === 'hood' && <ellipse cx={HX - 6} cy={SH_Y - 10} rx={w * 0.8} ry={14} fill={top.color} stroke={INK} strokeWidth={OUT} />}
          <Leg x={HX + 12} h={pose.hN} k={pose.kN} color={legFill} foot={foot} stripe={legsWear?.stripe} />
          {/* туловище */}
          <path d={torso} fill={bodyFill} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
          {/* тень от головы на груди и тень вдоль дальнего бока */}
          <clipPath id={`${uid}-tc`}>
            <path d={torso} />
          </clipPath>
          <g clipPath={`url(#${uid}-tc)`}>
            <ellipse cx={HX} cy={SH_Y - 12} rx={w * 0.8} ry={10} fill="#000" opacity={0.18} />
            <rect x={HX - wb - 2} y={SH_Y - 20} width={7} height={bottom} fill="#000" opacity={0.1} />
          </g>
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
          {farFront && farArm}
          {!handOnFace && nearArm}
          <g transform={`translate(0 ${pose.hy}) rotate(${pose.head} ${HX} ${HY + 30})`}>
            <ToonHead look={look} pose={pose} fx={fx} skin={skin} ko={ko} time={time} uid={uid} />
          </g>
          {handOnFace && nearArm}
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

// --- Голова -------------------------------------------------------------------------------------

/** Глаз-овал с веком: злость — веко косо к переносице, грусть — домиком, усталость — наполовину. */
function Eye({ cx, cy, open, px, py, brow, inner, uid, i }: { cx: number; cy: number; open: number; px: number; py: number; brow: number; inner: number; uid: string; i: number }) {
  const rx = 10;
  const ry = 12;
  const id = `${uid}-e${i}`;
  // веко — линия поперёк глаза: y на внутреннем и внешнем краях
  const lidTop = cy - ry * (2 * open - 1) - 1;
  const angry = Math.max(0, brow) * 9;
  const sad = Math.max(0, -brow) * 8;
  const yIn = lidTop + angry - sad * 0.3;
  const yOut = lidTop - angry * 0.4 + sad;
  const xIn = cx + inner * rx;
  const xOut = cx - inner * rx;
  if (open < 0.16)
    // закрытый глаз — дуга ресниц, без белка
    return <path d={`M ${cx - rx + 1},${cy + 2} Q ${cx},${cy + 7} ${cx + rx - 1},${cy + 2}`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />;
  return (
    <g>
      <clipPath id={id}>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
      </clipPath>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" />
      <circle cx={cx + px * 3.2 + inner * 1.5} cy={cy + 1 + py * 3.4} r={2.6} fill={INK} clipPath={`url(#${id})`} />
      <path d={`M ${xOut - inner * 2},${cy - ry - 4} L ${xOut - inner * 2},${yOut} L ${xIn + inner * 2},${yIn} L ${xIn + inner * 2},${cy - ry - 4} Z`} fill="var(--toon-skin)" clipPath={`url(#${id})`} />
      {(angry > 1 || sad > 1 || open < 0.95) && <path d={`M ${xOut},${yOut} L ${xIn},${yIn}`} stroke={INK} strokeWidth={1.6} clipPath={`url(#${id})`} />}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={INK} strokeWidth={1.6} />
    </g>
  );
}

function ToonHead({ look, pose, fx, skin, ko, time, uid }: { look: Look; pose: TPose; fx?: FaceFx; skin: (typeof SKIN_TONES)[number]; ko?: boolean; time: number; uid: string }) {
  const fp = faceParts(look.face ?? 0);
  const hairC = HAIR_COLORS[(look.face ?? 0) % HAIR_COLORS.length];
  const hat = look.equipped.head ? HATS[look.equipped.head] : undefined;
  const rx = fp.jaw === 1 ? HR - 3 : fp.jaw === 2 ? HR + 2 : HR;
  const ry = HR - 3;
  const eyeY = HY - 6;
  const open = Math.max(0.04, pose.eyes);
  const angry = pose.brow;
  const mY = HY + 19;
  const old = fp.beard === 5 || fp.hair === 7;
  const mw = 7 + pose.mouth * 3;
  const mh = 3 + pose.mouth * 10;
  return (
    <g style={{ ['--toon-skin' as string]: skin.base }}>
      {fp.hair === 6 && !hat && <path d={`M ${HX - rx + 2},${HY - 10} Q ${HX - rx - 6},${HY + 34} ${HX - rx + 10},${HY + 40} L ${HX + rx - 10},${HY + 40} Q ${HX + rx + 6},${HY + 34} ${HX + rx - 2},${HY - 10} Z`} fill={hairC} stroke={INK} strokeWidth={OUT} />}
      <ellipse cx={HX} cy={HY} rx={rx} ry={ry} fill={skin.base} stroke={INK} strokeWidth={OUT} />
      {fp.jaw === 2 && <ellipse cx={HX} cy={HY + 18} rx={rx - 4} ry={18} fill={skin.base} stroke={INK} strokeWidth={OUT} />}
      {fp.jaw === 2 && <ellipse cx={HX} cy={HY + 6} rx={rx - 1} ry={ry - 6} fill={skin.base} />}
      {/* лёгкая тень снизу головы — объём без градиентов */}
      <path d={`M ${HX - rx + 4},${HY + 14} A ${rx - 2},${ry - 2} 0 0 0 ${HX + rx - 4},${HY + 14} Q ${HX},${HY + ry + 4} ${HX - rx + 4},${HY + 14} Z`} fill={skin.shade} opacity={0.22} />
      {fp.beard === 1 && <path d={`M ${HX - rx + 3},${HY + 10} A ${rx - 1},${ry - 1} 0 0 0 ${HX + rx - 3},${HY + 10} Z`} fill={hairC} opacity={0.22} />}
      {fx?.bruise && <ellipse cx={HX + 9} cy={eyeY + 2} rx={13} ry={12} fill="#6a3a7a" opacity={0.45} />}
      {/* глаза */}
      {ko ? (
        <g stroke={INK} strokeWidth={2.6} strokeLinecap="round">
          <path d={`M ${HX - 14},${eyeY - 4} l 8,8 m 0,-8 l -8,8 M ${HX + 6},${eyeY - 4} l 8,8 m 0,-8 l -8,8`} />
        </g>
      ) : (
        <g>
          <Eye cx={HX - 9} cy={eyeY} open={open} px={pose.look} py={pose.lookY} brow={angry} inner={1} uid={uid} i={0} />
          <Eye cx={HX + 9} cy={eyeY} open={open} px={pose.look} py={pose.lookY} brow={angry} inner={-1} uid={uid} i={1} />
        </g>
      )}
      {/* мешки под глазами у стариков */}
      {old && !ko && <path d={`M ${HX - 16},${eyeY + 14} q 7,4 13,0 M ${HX + 3},${eyeY + 14} q 7,4 13,0`} fill="none" stroke={skin.shade} strokeWidth={1.2} />}
      {fp.brow === 1 && <path d={`M ${HX - 20},${eyeY - 15 - Math.max(0, angry) * 2} L ${HX - 2},${eyeY - 12 + Math.max(0, angry) * 4} M ${HX + 2},${eyeY - 12 + Math.max(0, angry) * 4} L ${HX + 20},${eyeY - 15 - Math.max(0, angry) * 2}`} stroke={hairC} strokeWidth={4.2} strokeLinecap="round" />}
      {/* борода */}
      {fp.beard === 2 && <path d={`M ${HX - rx + 5},${HY + 4} Q ${HX - rx + 8},${HY + ry + 12} ${HX},${HY + ry + 12} Q ${HX + rx - 8},${HY + ry + 12} ${HX + rx - 5},${HY + 4} Q ${HX + 10},${HY + 12} ${HX},${HY + 12} Q ${HX - 10},${HY + 12} ${HX - rx + 5},${HY + 4} Z`} fill={hairC} stroke={INK} strokeWidth={1.6} />}
      {fp.beard === 5 && <path d={`M ${HX - rx + 4},${HY} Q ${HX - rx},${HY + ry + 28} ${HX},${HY + ry + 30} Q ${HX + rx},${HY + ry + 28} ${HX + rx - 4},${HY} Q ${HX + 10},${HY + 13} ${HX},${HY + 13} Q ${HX - 10},${HY + 13} ${HX - rx + 4},${HY} Z`} fill="#c8c4bc" stroke={INK} strokeWidth={1.6} />}
      {fp.beard === 4 && <path d={`M ${HX - 6},${mY + 4} Q ${HX},${mY + 18} ${HX + 6},${mY + 4} Z`} fill={hairC} stroke={INK} strokeWidth={1.4} />}
      {/* рот: открыт, стиснутые зубы, улыбка или грусть */}
      {pose.mouth > 0.15 ? (
        <g>
          <path d={`M ${HX - mw},${mY - 1} Q ${HX},${mY - 2 + pose.smile} ${HX + mw},${mY - 1} Q ${HX + mw * 0.8},${mY + mh} ${HX},${mY + mh} Q ${HX - mw * 0.8},${mY + mh} ${HX - mw},${mY - 1} Z`} fill="#4a1a14" stroke={INK} strokeWidth={1.6} />
          {pose.mouth > 0.45 && <path d={`M ${HX - mw * 0.7},${mY} H ${HX + mw * 0.7}`} stroke="#f4eee4" strokeWidth={2.4} />}
          {pose.mouth > 0.6 && <ellipse cx={HX} cy={mY + mh - 2.5} rx={mw * 0.5} ry={2.2} fill="#c04a4a" />}
          {look.equipped.charm === 'charm_fiksa' && pose.mouth > 0.45 && <rect x={HX + 1} y={mY - 1.4} width={3.4} height={3} fill="#f0c850" />}
        </g>
      ) : pose.teeth > 0.5 ? (
        <g>
          <rect x={HX - 9} y={mY - 3} width={18} height={7} rx={2} fill="#f4eee4" stroke={INK} strokeWidth={1.6} />
          <path d={`M ${HX - 9},${mY + 0.5} H ${HX + 9} M ${HX - 3},${mY - 3} V ${mY + 4} M ${HX + 3},${mY - 3} V ${mY + 4}`} stroke={INK} strokeWidth={0.9} />
        </g>
      ) : ko ? (
        <path d={`M ${HX - 8},${mY + 2} q 4,-4 8,0 q 4,4 8,0`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      ) : (
        (() => {
          const sm = fx?.smile ? Math.max(0.8, pose.smile) : pose.smile + (angry < -0.3 ? -0.8 : 0);
          return <path d={`M ${HX - 6 - Math.abs(sm) * 2},${mY + 1 - sm * 1.5} Q ${HX},${mY + 1 + sm * 7} ${HX + 6 + Math.abs(sm) * 2},${mY + 1 - sm * 1.5}`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />;
        })()
      )}
      {(fp.beard === 3 || fp.beard === 4 || fp.beard === 5) && <path d={`M ${HX - 12},${mY - 4} Q ${HX - 6},${mY - 10} ${HX},${mY - 6} Q ${HX + 6},${mY - 10} ${HX + 12},${mY - 4} Q ${HX},${mY - 3} ${HX - 12},${mY - 4} Z`} fill={fp.beard === 5 ? '#c8c4bc' : hairC} stroke={INK} strokeWidth={1.2} />}
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
      {/* волосы и шапка подпрыгивают чуть позже головы */}
      <g transform={`translate(0 ${-pose.hy * 0.5})`}>
        {!hat && <ToonHair kind={fp.hair} color={hairC} rx={rx} ry={ry} />}
        {hat && (
          <g transform="translate(0 -6)">
            <ToonHat h={hat} rx={rx} ry={ry} />
          </g>
        )}
      </g>
      {ko && (
        <g>
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


function ToonHair({ kind, color, rx, ry }: { kind: number; color: string; rx: number; ry: number }) {
  const top = HY - ry;
  // «шапка» волос: верхняя часть головы до линии роста
  const cap = (line: number) => {
    const hw = (rx - 1) * Math.sqrt(Math.max(0, 1 - ((line - HY) / (ry - 1)) ** 2));
    return `M ${HX - hw},${line} A ${rx - 1},${ry - 1} 0 0 1 ${HX + hw},${line} Q ${HX},${line - 8} ${HX - hw},${line} Z`;
  };
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

let pseq = 0;
/** Портрет: только голова, кружком. */
export function ToonHeadPortrait({ look, size = 40, className }: { look: Look; size?: number; className?: string }) {
  const uid = useRef(`tp${++pseq}`).current;
  const skin = SKIN_TONES[look.skin ?? 0] ?? SKIN_TONES[0];
  return (
    <svg className={className} width={size} height={size} viewBox="12 14 96 96" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect x={12} y={14} width={96} height={96} fill="#2a241c" />
      <path d={`M ${HX - 30},${SH_Y + 20} C ${HX - 30},${SH_Y - 14} ${HX + 30},${SH_Y - 14} ${HX + 30},${SH_Y + 20} Z`} fill={(look.equipped.body && TOPS[look.equipped.body]?.color) || '#4a4c50'} stroke={INK} strokeWidth={OUT} />
      <ToonHead look={look} pose={{ ...P0, look: 0.3 }} skin={skin} time={0} uid={uid} />
    </svg>
  );
}
