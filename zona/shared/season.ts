// Сезоны: каждый месяц — своя тема, пропуск на 30 уровней (бесплатная и платная дорожка), рейтинг сезона.
// Плюс косметика за Stars: рамки аватара и титулы. Ничего из этого не даёт силы, которую нельзя добыть игрой.
import type { TrackKind } from './content.ts';

export interface SeasonTheme {
  name: string;
  emoji: string;
  desc: string;
  /** за это дело в сезон очки вдвое */
  focus: TrackKind;
  focusLabel: string;
}

export const SEASON_THEMES: SeasonTheme[] = [
  { name: 'Этап', emoji: '🚂', desc: 'Новые этапы, новые лица. Кто кого — решает двор.', focus: 'pvpWin', focusLabel: 'наезды' },
  { name: 'Бунт на централе', emoji: '🔥', desc: 'Централ горит. Каждый удар по бунту на счету.', focus: 'worldHit', focusLabel: 'удары по бунту' },
  { name: 'Промзона', emoji: '🏭', desc: 'План горит — работяги в почёте.', focus: 'job', focusLabel: 'смены' },
  { name: 'Большой шмон', emoji: '🔦', desc: 'Кум роет. Случаи на каждом шагу.', focus: 'event', focusLabel: 'случаи' },
  { name: 'Воровской сход', emoji: '🃏', desc: 'Решаются судьбы. Боссы зоны делят власть.', focus: 'boss', focusLabel: 'боссы' },
  { name: 'Зимовка', emoji: '❄️', desc: 'Холодно. Грейтесь в бане, в клубе и за нардами.', focus: 'place', focusLabel: 'места зоны' },
];

/** Сколько очков сезона за дело. */
export const SEASON_PTS: Partial<Record<TrackKind, number>> = {
  job: 1, boss: 3, pvpWin: 2, event: 2, place: 1, minigame: 1, clanBoss: 5, quest: 3, worldHit: 1,
  church: 1, yard: 1, escape: 2, visit: 1, furnish: 2, train: 1,
};

export const PASS = { levels: 30, perLevel: 260 };

/** Номер сезона — месяц по Москве. */
export function seasonIndex(now: number): number {
  const d = new Date(now + 3 * 3600_000);
  return (d.getUTCFullYear() - 2026) * 12 + d.getUTCMonth();
}
export function seasonEndsAt(now: number): number {
  const d = new Date(now + 3 * 3600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 3 * 3600_000;
}
export const seasonTheme = (idx: number) => SEASON_THEMES[((idx % SEASON_THEMES.length) + SEASON_THEMES.length) % SEASON_THEMES.length];

export interface PassReward {
  rations?: number;
  butts?: number;
  gold?: number;
  item?: string;
  mats?: number;
  chifir?: number;
  cosmetic?: string;
  gear?: string;
}

/** Награда уровня пропуска. Бесплатная — всем, платная — с пропуском. */
export function passReward(level: number, paid: boolean): PassReward {
  if (!paid) {
    if (level % 10 === 0) return { gold: 10, item: 'c_medkit' };
    if (level % 5 === 0) return { gold: 4 };
    if (level % 3 === 0) return { mats: 3 };
    if (level % 2 === 0) return { butts: 12 };
    return { rations: 4 };
  }
  if (level === 30) return { gear: 'charm_season', gold: 40 };
  if (level === 20) return { cosmetic: 'title_season', gold: 25 };
  if (level === 10) return { cosmetic: 'frame_season', gold: 15 };
  if (level % 5 === 0) return { chifir: 2, gold: 8 };
  if (level % 2 === 0) return { gold: 5, item: level % 4 === 0 ? 'c_adrenaline' : 'c_vodka' };
  return { gold: 3, rations: 6 };
}

// --- Косметика ------------------------------------------------------------------------------

export interface Cosmetic {
  id: string;
  kind: 'frame' | 'title';
  name: string;
  /** для рамки — css-класс, для титула — текст */
  value: string;
}

export const COSMETICS: Cosmetic[] = [
  { id: 'frame_gold', kind: 'frame', name: 'Золотая рамка', value: 'gold' },
  { id: 'frame_fire', kind: 'frame', name: 'Огненная рамка', value: 'fire' },
  { id: 'frame_ice', kind: 'frame', name: 'Ледяная рамка', value: 'ice' },
  { id: 'frame_blood', kind: 'frame', name: 'Кровавая рамка', value: 'blood' },
  { id: 'frame_season', kind: 'frame', name: 'Рамка сезона', value: 'season' },
  { id: 'title_legend', kind: 'title', name: 'Титул «Легенда зоны»', value: 'Легенда зоны' },
  { id: 'title_boss', kind: 'title', name: 'Титул «Хозяин положения»', value: 'Хозяин положения' },
  { id: 'title_season', kind: 'title', name: 'Титул «Ветеран сезона»', value: 'Ветеран сезона' },
  { id: 'title_champ', kind: 'title', name: 'Титул «Чемпион двора»', value: 'Чемпион двора' },
  { id: 'frame_trophy', kind: 'frame', name: 'Рамка трофеев', value: 'trophy' },
  { id: 'title_ink', kind: 'title', name: 'Титул «Расписной»', value: 'Расписной' },
  { id: 'title_chronicler', kind: 'title', name: 'Титул «Летописец зоны»', value: 'Летописец зоны' },
  { id: 'title_everywhere', kind: 'title', name: 'Титул «Свой везде»', value: 'Свой везде' },
  { id: 'frame_ny', kind: 'frame', name: 'Рамка «Гирлянда»', value: 'ny' },
  { id: 'title_ny', kind: 'title', name: 'Титул «Дед Мороз зоны»', value: 'Дед Мороз зоны' },
  { id: 'frame_army', kind: 'frame', name: 'Рамка «Погоны»', value: 'army' },
  { id: 'title_arm', kind: 'title', name: 'Титул «Железная рука»', value: 'Железная рука' },
  { id: 'frame_easter', kind: 'frame', name: 'Рамка «Пасхальная»', value: 'easter' },
  { id: 'title_married', kind: 'title', name: 'Титул «Женатик»', value: 'Женатик' },
  { id: 'title_wise', kind: 'title', name: 'Титул «Учёный жизнью»', value: 'Учёный жизнью' },
  { id: 'title_builder', kind: 'title', name: 'Титул «Прораб зоны»', value: 'Прораб зоны' },
  { id: 'title_egg', kind: 'title', name: 'Титул «Битый, но целый»', value: 'Битый, но целый' },
];
export const cosmeticById = new Map(COSMETICS.map((c) => [c.id, c]));
