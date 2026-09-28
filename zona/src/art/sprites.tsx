// Рисованные позы персонажа (public/art/sheet/pose/*.png) и лица (sheet/face/<n>.png).
// Все позы вырезаны с одного листа в одном масштабе, поэтому высоту считаем
// относительно стоячей позы: сидящий получается ниже, как и должно быть.

import { useEffect, useState, type ReactNode } from 'react';
import { OUTFITS, type OutfitPose } from '../../shared/content.ts';
import type { Look } from '../../shared/types.ts';
import { artSize, artUrl, useArt } from './raster.ts';
import { Rig, RigHead, type RigAnim } from './rig/Rig.tsx';
import { NPC_RIGS } from './rig/npcs.ts';

export type PoseName =
  | 'stand' | 'stand34' | 'crossed' | 'squat' | 'sit' | 'sit34' | 'lunge' | 'run'
  | 'guard' | 'guard34' | 'guard2' | 'guard3' | 'walk1' | 'walk2' | 'walk3' | 'walk4' | 'push' | 'lying' | 'floor';

const REQUIRED: PoseName[] = ['stand', 'stand34', 'sit', 'crossed', 'guard34', 'lunge', 'push', 'walk1', 'walk2', 'walk3', 'walk4'];
export const WALK: PoseName[] = ['walk1', 'walk2', 'walk3', 'walk4'];

/** Рост стоячей фигуры в единицах SVG-персонажа (ступни на y≈208). */
const H = 214;

/** Есть ли все нужные позы. */
export function usePoses(): boolean {
  const art = useArt();
  return !!art && REQUIRED.every((n) => art.has(`sheet/pose/${n}.png`));
}

/** Рост самой высокой стоячей фигуры с листа персонажей — от неё масштаб NPC. */
const NPC_REF = 'sheet/boss/b_warden';
const RIVALS = [
  'sheet/rival/0', 'sheet/rival/1', 'sheet/rival/2', 'sheet/rival/3', 'sheet/rival/4', 'sheet/rival/5', 'sheet/hero',
  ...['brute', 'ushanka', 'coverall', 'youngster', 'oldman', 'worker', 'sport', 'blatnoy', 'thin', 'bandaged', 'hermit', 'writer'].map((n) => `sheet/cast/${n}`),
];

export interface Npc {
  url: string;
  height: number;
}

function npcOf(art: Set<string> | null, name: string): Npc | null {
  // НПС нарисованы тем же ригом, что и герой — единый стиль
  if (NPC_RIGS[name]) return { url: `rig:${name}`, height: 204 };
  const url = artUrl(art, name);
  if (!url) return null;
  // у каждого листа свой масштаб: эталон — офицер/хозяин в полный рост
  const ref = artUrl(art, name.startsWith('sheet/cast/') ? 'sheet/cast/officer' : NPC_REF);
  const size = artSize(url);
  const refSize = ref ? artSize(ref) : null;
  // лист с татуированным героем другой, у него свой масштаб
  const height = name === 'sheet/hero' || !size || !refSize ? 204 : (size[1] / refSize[1]) * 208;
  return { url, height };
}

/** Соперник-зэк: один и тот же для одного имени. */
export function useRival(seed: string): Npc | null {
  const art = useArt();
  const pool = RIVALS.filter((r) => artUrl(art, r));
  if (!pool.length) return null;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return npcOf(art, pool[h % pool.length]);
}

export function useBoss(id: string | undefined): Npc | null {
  const art = useArt();
  return id ? npcOf(art, `sheet/boss/${id}`) : null;
}

/** Фоновые персонажи локаций. */
export function useNpc(name: string): Npc | null {
  return npcOf(useArt(), name);
}

export function poseUrl(name: PoseName) {
  return `/art/sheet/pose/${name}.png`;
}

/** Картинка в системе координат персонажа, ступнями на y=210, по центру x=60. */
export function ImageG({ url, height = H, mirror, tone, className }: { url: string; height?: number; mirror?: boolean; tone?: string; className?: string }) {
  if (url.startsWith('rig:')) {
    const n = NPC_RIGS[url.slice(4)];
    return (
      <g style={tone ? { filter: tone } : undefined}>
        <Rig look={n.look} anim={n.anim} mirror={mirror} />
      </g>
    );
  }
  const size = artSize(url);
  const h = height;
  const w = size ? (size[0] / size[1]) * h : h * 0.4;
  return (
    <g className={className}>
      <ellipse cx={60} cy={209} rx={Math.min(40, w / 2)} ry={5} fill="#000" opacity={0.4} />
      <image
        href={url}
        x={60 - w / 2}
        y={210 - h}
        width={w}
        height={h}
        transform={mirror ? 'translate(120 0) scale(-1 1)' : undefined}
        style={tone ? { filter: tone } : undefined}
      />
    </g>
  );
}

/** Какую позу комплекта брать для позы героя (если нет — stand). */
const OUTFIT_POSE: Partial<Record<PoseName, OutfitPose>> = {
  sit: 'sit', floor: 'sit', squat: 'sit', push: 'guard', lunge: 'guard', guard34: 'guard', guard: 'guard',
};
let outfitMeta: Record<string, [number, number, number, number]> | null = null;
fetch('/art/sheet/outfit/meta.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((m) => (outfitMeta = m))
  .catch(() => {});

/** Картинка комплекта для позы (или null, если комплекта нет). */
export function outfitSprite(art: Set<string> | null, look: Look | undefined, name: PoseName): { url: string; key: string; ref: string } | null {
  const o = look?.equipped.body ? OUTFITS[look.equipped.body] : undefined;
  if (!o || !art) return null;
  const want = OUTFIT_POSE[name] ?? 'stand';
  const pose = o.poses.includes(want) ? want : 'stand';
  const url = artUrl(art, `sheet/outfit/${o.set}/${pose}`);
  const ref = artUrl(art, `sheet/outfit/${o.set}/stand`);
  return url && ref ? { url, key: `${o.set}/${pose}`, ref } : null;
}

/** Надет ли комплект — тогда во дворе стоим: у комплектов нет покадровой ходьбы. */
export function hasOutfit(_art: Set<string> | null, _look?: Look): boolean {
  return false; // риг ходит в любой одежде
}

/** Где у позы голова — чтобы надеть шапку (доли картинки: x0, y0, x1, y1). */
let dressMeta: Record<string, { head: [number, number, number, number]; feet: [number, number] }> | null = null;
fetch('/art/sheet/dress/meta.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((m) => (dressMeta = m))
  .catch(() => {});

const SLOT_ORDER = ['legs', 'feet', 'body'] as const;
/** Доля иконки шапки, которую надеваем (сверху вниз). */
const HAT_KEEP: Record<string, number> = { cap_ushanka: 0.55, cap_knit: 0.9 };
const GOLD_TINT = 'sepia(1) saturate(3.2) hue-rotate(-8deg) brightness(1.15) contrast(1.1)';

/** Слои одежды и наколок для позы: только те, что реально нарисованы. */
function dressLayers(art: Set<string> | null, name: PoseName, look?: Look): string[] {
  if (!art || !look) return [];
  const out: string[] = [];
  const add = (id: string) => {
    const u = artUrl(art, `sheet/dress/${name}/${id}`);
    if (u) out.push(u);
  };
  look.tattoos.forEach(add);
  for (const slot of SLOT_ORDER) {
    const id = look.equipped[slot];
    if (id) add(id);
  }
  return out;
}

/** Одета ли хоть одна вещь, которую умеем рисовать на теле. */
export function isDressed(art: Set<string> | null, look?: Look): boolean {
  return !!look && SLOT_ORDER.some((s) => look.equipped[s] && artUrl(art, `sheet/dress/stand/${look.equipped[s]}`));
}

/** Поза игрока в правильном масштабе относительно стоячей — вместе со шмотками и наколками. */
/** Какая анимация рига у старых имён поз. */
const POSE_ANIM: Record<PoseName, RigAnim> = {
  stand: 'idle', stand34: 'idle', crossed: 'crossed', squat: 'sit', sit: 'sit', sit34: 'sit', lunge: 'punch', run: 'run',
  guard: 'guard', guard34: 'guard', guard2: 'guard', guard3: 'guard', walk1: 'walk', walk2: 'walk', walk3: 'walk', walk4: 'walk',
  push: 'work', lying: 'ko', floor: 'floor',
};

/** Персонаж игрока: кукла на скелете — одежда, наколки и внешность видны и двигаются вместе с телом. */
export function PoseG({ name, mirror, tone, look, noShadow, anim }: { name: PoseName; mirror?: boolean; tone?: string; look?: Look; noShadow?: boolean; anim?: RigAnim }) {
  const l = look ?? { equipped: {}, tattoos: [], str: 5 };
  const a = anim ?? POSE_ANIM[name] ?? 'idle';
  return (
    <g style={tone ? { filter: tone } : undefined}>
      {a === 'sit' && <Stool />}
      <Rig look={l} anim={a} mirror={mirror} shadow={!noShadow} />
    </g>
  );
}

/** Покадровая анимация (ходьба). */
export function useFlipbook(frames: PoseName[], ms: number, on = true): PoseName {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setI((x) => (x + 1) % frames.length), ms);
    return () => clearInterval(id);
  }, [frames.length, ms, on]);
  return frames[i];
}

export function faceUrl(art: Set<string> | null, face: number | null | undefined): string | null {
  return face == null ? null : artUrl(art, `sheet/face/${face}`);
}

/** Круглый портрет. */
/** Круглый портрет — голова рига: та же внешность, что у персонажа. */
export function Face({ face, size = 36, className = '', skin, hat }: { face: number | null | undefined; size?: number; className?: string; skin?: number; hat?: string }) {
  if (face == null) return null;
  return (
    <span className={`face rig-face ${className}`} style={{ width: size, height: size }}>
      <RigHead look={{ equipped: hat ? { head: hat } : {}, tattoos: [], str: 5, face, skin }} size={size} />
    </span>
  );
}

/** Персонаж-«хозяин» экрана: поясной портрет с репликой. */
export function NpcBanner({ who, name, text, children }: { who: string; name: string; text: string; children?: ReactNode }) {
  return (
    <div className="npc-banner">
      <div className="npc-pic">
        <NpcPortrait who={`sheet/cast/${who}`} />
      </div>
      <div className="npc-say">
        <b>{name}</b>
        <span>«{text}»</span>
        {children}
      </div>
    </div>
  );
}

/** Поясной портрет НПС — тот же риг, крупно по пояс. */
export function NpcPortrait({ who, className }: { who: string; className?: string }) {
  const art = useArt();
  const n = NPC_RIGS[who];
  if (!n) {
    const url = artUrl(art, who);
    return url ? <img className={className} src={url} alt="" /> : null;
  }
  return (
    <svg className={`npc-portrait ${className ?? ''}`} viewBox="18 4 84 118" preserveAspectRatio="xMidYMin slice" aria-hidden>
      <Rig look={n.look} anim="idle" shadow={false} />
    </svg>
  );
}

/** Табурет под сидящим героем. */
function Stool() {
  return (
    <g>
      <ellipse cx={58} cy={209} rx={22} ry={3.5} fill="#000" opacity={0.35} />
      <path d="M 42,166 L 38,209 M 74,166 L 78,209 M 47,166 L 49,204 M 69,166 L 67,204" stroke="#1b130d" strokeWidth={5} strokeLinecap="round" />
      <path d="M 42,166 L 38,209 M 74,166 L 78,209 M 47,166 L 49,204 M 69,166 L 67,204" stroke="#6a4a2e" strokeWidth={3} strokeLinecap="round" />
      <path d="M 40,187 L 76,187" stroke="#1b130d" strokeWidth={3.4} />
      <path d="M 40,187 L 76,187" stroke="#5a3c24" strokeWidth={1.8} />
      <rect x={34} y={160} width={48} height={8} rx={2} fill="#7a5634" stroke="#1b130d" strokeWidth={1.6} />
      <rect x={36} y={161} width={44} height={2} fill="#9a7650" />
    </g>
  );
}
