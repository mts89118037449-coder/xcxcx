// Альбом: коллекции наколок, трофеев с боссов, фото из сюжета и мест зоны.
// Собрал коллекцию целиком — золото и косметика. Трофеи можно повесить на стену хаты.

import { BOSSES, TATTOOS } from './content.ts';
import { PLACES } from './places.ts';
import { STORY } from './story.ts';

export type AlbumId = 'tattoos' | 'bosses' | 'story' | 'places';

export interface AlbumDef {
  id: AlbumId;
  name: string;
  emoji: string;
  desc: string;
  gold: number;
  cosmetic: string;
}

export const ALBUMS: AlbumDef[] = [
  { id: 'bosses', name: 'Трофеи', emoji: '🏆', desc: 'Победи каждого босса хотя бы раз', gold: 60, cosmetic: 'frame_trophy' },
  { id: 'tattoos', name: 'Наколки', emoji: '🖋️', desc: 'Набей все наколки', gold: 50, cosmetic: 'title_ink' },
  { id: 'story', name: 'Фото из сюжета', emoji: '📷', desc: 'Пройди все главы сюжета', gold: 40, cosmetic: 'title_chronicler' },
  { id: 'places', name: 'Места зоны', emoji: '🗺️', desc: 'Побывай делом в каждом месте', gold: 25, cosmetic: 'title_everywhere' },
];
export const albumById = new Map(ALBUMS.map((a) => [a.id, a]));

/** Сколько трофеев можно повесить на стену хаты. */
export const WALL_MAX = 3;

/** Что собрано в каждой коллекции: есть / всего. Одно и то же на сервере и в клиенте. */
export function albumProgress(p: { trophies: string[]; tattoos: string[]; story: { ch: number }; placeCd: Record<string, number> }) {
  const placeIds = new Set(Object.keys(p.placeCd).map((k) => k.split('.')[0]));
  return {
    bosses: { have: BOSSES.filter((b) => p.trophies.includes(b.id)).map((b) => b.id), total: BOSSES.map((b) => b.id) },
    tattoos: { have: TATTOOS.filter((t) => p.tattoos.includes(t.id)).map((t) => t.id), total: TATTOOS.map((t) => t.id) },
    story: { have: STORY.slice(0, p.story.ch).map((c) => c.id), total: STORY.map((c) => c.id) },
    places: { have: PLACES.filter((pl) => placeIds.has(pl.id)).map((pl): string => pl.id), total: PLACES.map((pl): string => pl.id) },
  } satisfies Record<AlbumId, { have: string[]; total: string[] }>;
}
