// Праздники на зоне: Новый год, 23 февраля, Пасха. Пока идёт праздник — свои задания,
// своя валюта (мандарины, звёздочки, крашенки), свой магазинчик с косметикой и своя забава.

const DAY = 24 * 3600_000;
/** Москва: UTC+3 круглый год */
const MSK = 3 * 3600_000;

export type HolidayId = 'newyear' | 'feb23' | 'easter';
/** что засчитывается в праздничные задания */
export type HolKind = 'job' | 'pvpWin' | 'boss' | 'minigame' | 'train' | 'church' | 'quest' | 'arm' | 'egg' | 'tree';

export interface HolTask {
  kind: HolKind;
  n: number;
  text: string;
  tokens: number;
}

export interface HolShopItem {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  give: { cosmetic?: string; gold?: number; chifir?: number; butts?: number; heal?: number };
  /** сколько раз можно взять за праздник (по умолчанию 1) */
  max?: number;
}

export interface Holiday {
  id: HolidayId;
  name: string;
  emoji: string;
  token: { emoji: string; name: string };
  /** окно праздника по московскому времени; key — год, к которому праздник относится */
  window(year: number): [number, number];
  /** праздничный грев раз в сутки */
  daily: number;
  tasks: HolTask[];
  shop: HolShopItem[];
  /** главная забава праздника */
  fun: { id: 'tree' | 'arm' | 'egg'; name: string; text: string };
}

/** Православная Пасха (юлианский расчёт + 13 дней), полночь по Москве. */
export function orthodoxEaster(y: number): number {
  const a = y % 4;
  const b = y % 7;
  const c = y % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const m = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return Date.UTC(y, m - 1, day + 13) - MSK;
}

const msk = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) - MSK;

export const HOLIDAYS: Holiday[] = [
  {
    id: 'newyear',
    name: 'Новый год',
    emoji: '🎄',
    token: { emoji: '🍊', name: 'мандарины' },
    window: (y) => [msk(y - 1, 12, 25), msk(y, 1, 9)],
    daily: 3,
    tasks: [
      { kind: 'tree', n: 1, text: 'Нарядить ёлку в хате', tokens: 5 },
      { kind: 'job', n: 10, text: 'Отработать 10 смен', tokens: 6 },
      { kind: 'pvpWin', n: 5, text: 'Выиграть 5 драк', tokens: 6 },
      { kind: 'boss', n: 3, text: 'Побить 3 боссов', tokens: 6 },
      { kind: 'minigame', n: 5, text: 'Сыграть 5 мини-игр', tokens: 5 },
    ],
    shop: [
      { id: 'ny_frame', name: 'Рамка «Гирлянда»', emoji: '✨', cost: 20, give: { cosmetic: 'frame_ny' } },
      { id: 'ny_title', name: 'Титул «Дед Мороз зоны»', emoji: '🎅', cost: 25, give: { cosmetic: 'title_ny' } },
      { id: 'ny_tang', name: 'Съесть мандарин: ❤️ +25%', emoji: '🍊', cost: 1, give: { heal: 25 }, max: 30 },
      { id: 'ny_gold', name: '5 рыжья', emoji: '🪙', cost: 8, give: { gold: 5 }, max: 3 },
      { id: 'ny_chifir', name: 'Праздничный чифир', emoji: '☕', cost: 4, give: { chifir: 1 }, max: 5 },
    ],
    fun: { id: 'tree', name: 'Ёлка в хате', text: 'Нарядите ёлку — горит до конца праздника, а под ней каждый день мандарины.' },
  },
  {
    id: 'feb23',
    name: '23 февраля',
    emoji: '🎖️',
    token: { emoji: '⭐', name: 'звёздочки' },
    window: (y) => [msk(y, 2, 20), msk(y, 2, 27)],
    daily: 2,
    tasks: [
      { kind: 'arm', n: 3, text: 'Победить 3 раза на руках', tokens: 6 },
      { kind: 'pvpWin', n: 5, text: 'Выиграть 5 драк', tokens: 6 },
      { kind: 'train', n: 8, text: '8 раз потренироваться', tokens: 5 },
      { kind: 'boss', n: 2, text: 'Побить 2 боссов', tokens: 5 },
    ],
    shop: [
      { id: 'f23_frame', name: 'Рамка «Погоны»', emoji: '🎖️', cost: 18, give: { cosmetic: 'frame_army' } },
      { id: 'f23_title', name: 'Титул «Железная рука»', emoji: '💪', cost: 22, give: { cosmetic: 'title_arm' } },
      { id: 'f23_ration', name: 'Сухпаёк: ❤️ +40%', emoji: '🥫', cost: 2, give: { heal: 40 }, max: 10 },
      { id: 'f23_gold', name: '5 рыжья', emoji: '🪙', cost: 8, give: { gold: 5 }, max: 3 },
    ],
    fun: { id: 'arm', name: 'Турнир по армрестлингу', text: 'Лучшая сила на руках за праздник идёт в таблицу. Тройка лучших — на доску почёта.' },
  },
  {
    id: 'easter',
    name: 'Пасха',
    emoji: '🥚',
    token: { emoji: '🥚', name: 'крашенки' },
    window: (y) => {
      const e = orthodoxEaster(y);
      return [e - 3 * DAY, e + 4 * DAY];
    },
    daily: 3,
    tasks: [
      { kind: 'church', n: 3, text: 'Сходить в церковь 3 раза', tokens: 6 },
      { kind: 'egg', n: 5, text: 'Побиться яйцами 5 раз', tokens: 5 },
      { kind: 'job', n: 8, text: 'Отработать 8 смен', tokens: 5 },
      { kind: 'quest', n: 3, text: 'Сделать 3 поручения', tokens: 5 },
    ],
    shop: [
      { id: 'eas_frame', name: 'Рамка «Пасхальная»', emoji: '🌸', cost: 18, give: { cosmetic: 'frame_easter' } },
      { id: 'eas_title', name: 'Титул «Битый, но целый»', emoji: '🥚', cost: 22, give: { cosmetic: 'title_egg' } },
      { id: 'eas_kulich', name: 'Кулич: ❤️ +30%', emoji: '🍞', cost: 2, give: { heal: 30 }, max: 10 },
      { id: 'eas_butts', name: '20 бычков', emoji: '🚬', cost: 4, give: { butts: 20 }, max: 5 },
    ],
    fun: { id: 'egg', name: 'Битки яйцами', text: 'Стукнись крашенкой с сокамерником: чья целая — забирает чужую.' },
  },
];
export const holidayById = new Map(HOLIDAYS.map((h) => [h.id, h]));

export const EGG = { cooldownMin: 20, winBase: 0.5 };

export interface HolidayRun {
  id: HolidayId;
  key: number;
  startsAt: number;
  endsAt: number;
}

/** Какой праздник идёт сейчас (или принудительно включённый админом). */
export function holidayAt(now: number, force?: HolidayRun | null): HolidayRun | null {
  if (force && now < force.endsAt) return force;
  const y = new Date(now + MSK).getUTCFullYear();
  for (const h of HOLIDAYS)
    for (const key of [y, y + 1]) {
      const [s, e] = h.window(key);
      if (now >= s && now < e) return { id: h.id, key, startsAt: s, endsAt: e };
    }
  return null;
}
