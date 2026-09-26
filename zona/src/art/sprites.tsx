// Рисованные позы персонажа (public/art/sheet/pose/*.png) и лица (sheet/face/<n>.png).
// Все позы вырезаны с одного листа в одном масштабе, поэтому высоту считаем
// относительно стоячей позы: сидящий получается ниже, как и должно быть.

import { useEffect, useState, type ReactNode } from 'react';
import { OUTFITS, type OutfitPose } from '../../shared/content.ts';
import type { Look } from '../../shared/types.ts';
import { artSize, artUrl, useArt } from './raster.ts';

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

/** Надет ли комплект, у которого нет своей ходьбы — тогда во дворе стоим. */
export function hasOutfit(art: Set<string> | null, look?: Look): boolean {
  return !!outfitSprite(art, look, 'stand');
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
export function PoseG({ name, mirror, tone, look, noShadow }: { name: PoseName; mirror?: boolean; tone?: string; look?: Look; noShadow?: boolean }) {
  const art = useArt();
  const outfit = outfitSprite(art, look, name);
  const url = outfit?.url ?? poseUrl(name);
  const ref = artSize(outfit?.ref ?? poseUrl('stand'));
  const size = artSize(url);
  // на листе комплектов герой коренастее — уменьшаем, чтобы стоял вровень с остальными
  const h = (ref && size ? (size[1] / ref[1]) * H : H) * (outfit ? 0.78 : 1);
  const w = size ? (size[0] / size[1]) * h : h * 0.4;
  const x = 60 - w / 2;
  const y = 210 - h;
  const layers = outfit ? [] : dressLayers(art, name, look);
  // у комплектов голова своя, мелкая — шапка закрывала бы лицо
  const hat = !outfit && look?.equipped.head ? artUrl(art, `sheet/icons/${look.equipped.head}`) : null;
  const hb = outfit ? outfitMeta?.[outfit.key] : dressMeta?.[name]?.head;
  let hatEl = null;
  if (hat && hb) {
    const headW = (hb[2] - hb[0]) * w;
    const headH = (hb[3] - hb[1]) * h;
    const hsz = artSize(hat);
    const ratio = hsz ? hsz[1] / hsz[0] : 0.8;
    // сколько картинки шапки брать сверху: у ушанки без свисающих клапанов, иначе закрывают лицо
    const keep = HAT_KEEP[look!.equipped.head!] ?? 1;
    const hw = headW * 1.22;
    const hh = hw * ratio * keep;
    const cx = x + ((hb[0] + hb[2]) / 2) * w;
    // край шапки — на лбу, чуть выше бровей
    const brow = y + hb[1] * h + headH * 0.3;
    hatEl = (
      <svg x={cx - hw / 2} y={brow - hh} width={hw} height={hh} viewBox={`0 0 100 ${100 * ratio * keep}`} preserveAspectRatio="none" overflow="hidden">
        <image
          href={hat}
          width={100}
          height={100 * ratio}
          style={look?.equipped.head === 'cap_gold' ? { filter: GOLD_TINT } : undefined}
        />
      </svg>
    );
  }
  return (
    <g className="char-breathe">
      <g transform={mirror ? 'translate(120 0) scale(-1 1)' : undefined} style={tone ? { filter: tone } : undefined}>
        {/* тень строго под ступнями — иначе фигура «висит» */}
        {!noShadow && (() => {
          const f = (!outfit && dressMeta?.[name]?.feet) || [0.2, 0.8];
          const fx0 = x + f[0] * w;
          const fx1 = x + f[1] * w;
          return <ellipse cx={(fx0 + fx1) / 2} cy={209} rx={Math.max(12, (fx1 - fx0) / 2 + 6)} ry={4.5} fill="#000" opacity={0.45} style={{ filter: 'none' }} />;
        })()}
        <image href={url} x={x} y={y} width={w} height={h} />
        {layers.map((u) => (
          <image key={u} href={u} x={x} y={y} width={w} height={h} />
        ))}
        {hatEl}
      </g>
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
export function Face({ face, size = 36, className = '' }: { face: number | null | undefined; size?: number; className?: string }) {
  const url = faceUrl(useArt(), face);
  if (!url) return null;
  return <img className={`face ${className}`} src={url} alt="" style={{ width: size, height: size }} />;
}

/** Персонаж-«хозяин» экрана: поясной портрет с репликой. */
export function NpcBanner({ who, name, text, children }: { who: string; name: string; text: string; children?: ReactNode }) {
  const url = artUrl(useArt(), `sheet/cast/${who}`);
  if (!url) return null;
  return (
    <div className="npc-banner">
      <div className="npc-pic">
        <img src={url} alt={name} />
      </div>
      <div className="npc-say">
        <b>{name}</b>
        <span>«{text}»</span>
        {children}
      </div>
    </div>
  );
}
