// Рисованные позы персонажа (public/art/sheet/pose/*.png) и лица (sheet/face/<n>.png).
// Все позы вырезаны с одного листа в одном масштабе, поэтому высоту считаем
// относительно стоячей позы: сидящий получается ниже, как и должно быть.

import { useEffect, useState } from 'react';
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
const RIVALS = ['sheet/rival/0', 'sheet/rival/1', 'sheet/rival/2', 'sheet/rival/3', 'sheet/rival/4', 'sheet/rival/5', 'sheet/hero'];

export interface Npc {
  url: string;
  height: number;
}

function npcOf(art: Set<string> | null, name: string): Npc | null {
  const url = artUrl(art, name);
  if (!url) return null;
  const ref = artUrl(art, NPC_REF);
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

/** Поза игрока в правильном масштабе относительно стоячей. */
export function PoseG({ name, mirror, tone }: { name: PoseName; mirror?: boolean; tone?: string }) {
  const url = poseUrl(name);
  const ref = artSize(poseUrl('stand'));
  const size = artSize(url);
  const h = ref && size ? (size[1] / ref[1]) * H : H;
  return <ImageG url={url} height={h} mirror={mirror} tone={tone} className="char-breathe" />;
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
