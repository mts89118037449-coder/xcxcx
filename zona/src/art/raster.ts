// Растровая графика от художника/нейросети: слои PNG/WebP, нарисованные
// сразу в позе. Всё лежит в public/art, список файлов — public/art/manifest.json
// (собирается командой `npm run art`). Пока нужных слоёв нет, игра рисует SVG.
//
// Соглашения (подробно — docs/ART_BRIEF.md):
//   bg/<локация>.webp                 фон локации, холст 1440×1120
//   bg/cell/<мебель>.webp             мебель поверх фона камеры, тот же холст
//   pose/<поза>/body.webp             тело в позе (в трусах), холст позы
//   pose/<поза>/hurt.webp             синяки/кровь поверх лица и тела (необязательно)
//   pose/<поза>/tattoo/<id>.webp      наколка в этой позе
//   pose/<поза>/item/<id>.webp        вещь в этой позе
//   npc/<id>.webp                     босс в боевой стойке, холст боя, стоит справа

import { useEffect, useState } from 'react';
import type { Look } from '../../shared/types.ts';

export type Pose = 'bunk' | 'work' | 'yard' | 'stand' | 'fight';

/** Порядок слоёв снизу вверх. */
const SLOT_ORDER = ['legs', 'feet', 'body', 'charm', 'weapon', 'head'] as const;
const EXT = ['webp', 'png'];

let manifest: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;
const sizes = new Map<string, [number, number]>();

function load(): Promise<Set<string>> {
  loading ??= fetch('/art/manifest.json')
    .then((r) => (r.ok ? r.json() : { files: [] }))
    .catch(() => ({ files: [] }))
    .then((m: { files?: string[]; sizes?: Record<string, [number, number]> }) => {
      for (const [k, v] of Object.entries(m.sizes ?? {})) sizes.set(`/art/${k}`, v);
      return (manifest = new Set(m.files ?? []));
    });
  return loading;
}

/** Размер картинки в пикселях (из манифеста). */
export function artSize(url: string): [number, number] | null {
  return sizes.get(url) ?? null;
}

/** Набор доступных файлов; null пока манифест грузится. */
export function useArt(): Set<string> | null {
  const [art, setArt] = useState(manifest);
  useEffect(() => {
    if (!art) load().then(setArt);
  }, [art]);
  return art;
}

/** Путь к файлу без расширения → URL, если файл есть. */
export function artUrl(art: Set<string> | null, name: string): string | null {
  if (!art) return null;
  for (const ext of EXT) if (art.has(`${name}.${ext}`)) return `/art/${name}.${ext}`;
  return null;
}

/**
 * Слои персонажа для позы. Если нет тела или хоть одной надетой вещи —
 * null: смешивать растр с SVG нельзя, персонаж получится лоскутным.
 */
export function characterLayers(art: Set<string> | null, pose: Pose, look: Look, opts: { bare?: boolean; hurt?: boolean } = {}): string[] | null {
  const body = artUrl(art, `pose/${pose}/body`);
  if (!body) return null;
  const layers = [body];
  for (const t of look.tattoos) {
    const url = artUrl(art, `pose/${pose}/tattoo/${t}`);
    if (url) layers.push(url); // наколка без картинки просто не видна
  }
  if (opts.hurt) {
    const url = artUrl(art, `pose/${pose}/hurt`);
    if (url) layers.push(url);
  }
  for (const slot of SLOT_ORDER) {
    const id = look.equipped[slot];
    if (!id || (opts.bare && slot === 'body')) continue;
    const url = artUrl(art, `pose/${pose}/item/${id}`);
    if (!url) return null;
    layers.push(url);
  }
  return layers;
}
