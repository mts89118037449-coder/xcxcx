// «Мисс и Мистер Зона»: раз в неделю выставляешь фото из фото-режима, другие голосуют.
// Тройке лучших прошлой недели — золото.
import type { Look } from './types.ts';

export const BEAUTY = { minLevel: 3, votesPerDay: 5, prizes: [15, 8, 4] };

/** Что можно выставить: поза и лицо из фото-режима, фон — один из четырёх. */
export const BEAUTY_ANIMS = ['proud', 'flex', 'crossed', 'guard', 'punch', 'kick', 'cheer', 'wave', 'smoke', 'drink', 'think', 'dance', 'sit', 'sad'];
export const BEAUTY_FX = ['none', 'smile', 'sweat', 'bruise', 'blood', 'breath'];
export const BEAUTY_BGS = ['cell', 'yard', 'gold', 'night'];

export interface BeautyEntry {
  id: number;
  name: string;
  look: Look;
  anim: string;
  fx: string;
  bg: string;
  votes: number;
  voters: number[];
}
