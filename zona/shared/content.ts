// Весь игровой контент в одном месте: баланс правится здесь, а сервер и клиент
// читают одни и те же таблицы.

export type Slot = 'head' | 'body' | 'legs' | 'feet' | 'weapon' | 'charm';
export type Stat = 'str' | 'agi' | 'end';

export interface Bonus {
  atk?: number;
  def?: number;
  hp?: number;
  crit?: number; // проценты
  energy?: number; // к максимуму энергии
  money?: number; // проценты к заработку на работах
}

export interface Item extends Bonus {
  id: string;
  name: string;
  emoji: string;
  slot: Slot;
  minLevel: number;
  price: number;
  currency: 'money' | 'gold';
  bossOnly?: boolean; // не продаётся, выпадает только с боссов
}

export interface Tattoo extends Bonus {
  id: string;
  name: string;
  emoji: string;
  meaning: string;
  minLevel: number;
  minAuthority: number;
  price: number;
  currency: 'money' | 'gold';
}

export interface Job {
  id: string;
  name: string;
  emoji: string;
  minLevel: number;
  energy: number;
  money: [number, number];
  xp: number;
}

export interface Boss {
  id: string;
  name: string;
  emoji: string;
  description: string;
  minLevel: number;
  hp: number;
  atk: number;
  def: number;
  energy: number;
  cooldownMin: number;
  reward: { money: [number, number]; xp: number; authority: number; gold: [number, number] };
  drops: { itemId: string; chance: number }[];
}

export interface StarPack {
  id: string;
  title: string;
  description: string;
  stars: number; // цена в Telegram Stars (XTR)
  gold?: number;
  vipDays?: number;
  badge?: string;
}

export const SLOT_NAMES: Record<Slot, string> = {
  head: 'Голова',
  body: 'Тело',
  legs: 'Штаны',
  feet: 'Обувь',
  weapon: 'Оружие',
  charm: 'Талисман',
};

export const STAT_NAMES: Record<Stat, string> = {
  str: 'Сила',
  agi: 'Ловкость',
  end: 'Выносливость',
};

export const ITEMS: Item[] = [
  // Голова
  { id: 'cap_knit', name: 'Вязаная шапка', emoji: '🧢', slot: 'head', minLevel: 1, price: 150, currency: 'money', def: 2 },
  { id: 'cap_ushanka', name: 'Ушанка', emoji: '🪖', slot: 'head', minLevel: 5, price: 1200, currency: 'money', def: 6, hp: 10 },
  { id: 'cap_bandana', name: 'Восьмиклинка смотрящего', emoji: '🧢', slot: 'head', minLevel: 12, price: 9000, currency: 'money', def: 14, hp: 25, crit: 2 },
  { id: 'cap_gold', name: 'Кепка «Пахан»', emoji: '👑', slot: 'head', minLevel: 8, price: 120, currency: 'gold', def: 16, hp: 40, crit: 3 },
  // Тело
  { id: 'body_tank', name: 'Майка-алкоголичка', emoji: '🎽', slot: 'body', minLevel: 1, price: 80, currency: 'money', def: 1, hp: 5 },
  { id: 'body_telnyashka', name: 'Тельняшка', emoji: '🎽', slot: 'body', minLevel: 3, price: 700, currency: 'money', def: 3, hp: 15 },
  { id: 'body_robe', name: 'Роба', emoji: '👕', slot: 'body', minLevel: 1, price: 200, currency: 'money', def: 3, hp: 10 },
  { id: 'body_quilted', name: 'Телогрейка', emoji: '🧥', slot: 'body', minLevel: 4, price: 1500, currency: 'money', def: 8, hp: 25 },
  { id: 'body_leather', name: 'Кожанка', emoji: '🥼', slot: 'body', minLevel: 10, price: 8000, currency: 'money', def: 16, hp: 50 },
  { id: 'body_tracksuit', name: 'Пуховик «Аляска»', emoji: '🦺', slot: 'body', minLevel: 6, price: 150, currency: 'gold', def: 20, hp: 70, energy: 10 },
  // Штаны
  { id: 'legs_pants', name: 'Казённые штаны', emoji: '👖', slot: 'legs', minLevel: 1, price: 120, currency: 'money', def: 2 },
  { id: 'legs_cargo', name: 'Камуфляж', emoji: '👖', slot: 'legs', minLevel: 7, price: 3000, currency: 'money', def: 8, hp: 15 },
  { id: 'legs_jeans', name: 'Треники', emoji: '👖', slot: 'legs', minLevel: 14, price: 14000, currency: 'money', def: 14, hp: 30 },
  // Обувь
  { id: 'feet_slippers', name: 'Тапки', emoji: '🩴', slot: 'feet', minLevel: 1, price: 80, currency: 'money', def: 1 },
  { id: 'feet_kirza', name: 'Берцы', emoji: '🥾', slot: 'feet', minLevel: 5, price: 1400, currency: 'money', def: 5, atk: 2 },
  { id: 'feet_sneakers', name: 'Ботинки-гады', emoji: '👟', slot: 'feet', minLevel: 11, price: 10000, currency: 'money', def: 10, crit: 3 },
  // Оружие
  { id: 'wpn_spoon', name: 'Заточенная ложка', emoji: '🥄', slot: 'weapon', minLevel: 1, price: 250, currency: 'money', atk: 4 },
  { id: 'wpn_rebar', name: 'Заточка', emoji: '🔩', slot: 'weapon', minLevel: 4, price: 1800, currency: 'money', atk: 10 },
  { id: 'wpn_knuckles', name: 'Кастет', emoji: '🥊', slot: 'weapon', minLevel: 9, price: 7500, currency: 'money', atk: 18, crit: 3 },
  { id: 'wpn_chain', name: 'Цепь', emoji: '⛓️', slot: 'weapon', minLevel: 15, price: 22000, currency: 'money', atk: 30, crit: 4 },
  { id: 'wpn_golden', name: 'Золотая финка', emoji: '🗡️', slot: 'weapon', minLevel: 8, price: 200, currency: 'gold', atk: 34, crit: 6 },
  // Талисманы
  { id: 'charm_beads', name: 'Чётки', emoji: '📿', slot: 'charm', minLevel: 3, price: 900, currency: 'money', crit: 3, money: 5 },
  { id: 'charm_ring', name: 'Печатка', emoji: '💍', slot: 'charm', minLevel: 10, price: 12000, currency: 'money', crit: 5, money: 10 },
  { id: 'charm_cross', name: 'Золотая цепура', emoji: '✝️', slot: 'charm', minLevel: 5, price: 180, currency: 'gold', crit: 8, money: 20, energy: 15 },
  // Только с боссов
  { id: 'drop_keys', name: 'Ключи вертухая', emoji: '🗝️', slot: 'charm', minLevel: 1, price: 0, currency: 'money', bossOnly: true, crit: 6, money: 15, energy: 10 },
  { id: 'drop_baton', name: 'Дубинка начкара', emoji: '🏏', slot: 'weapon', minLevel: 1, price: 0, currency: 'money', bossOnly: true, atk: 26, crit: 5 },
  { id: 'drop_coat', name: 'Бушлат хозяина', emoji: '🧥', slot: 'body', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 26, hp: 90 },
  { id: 'drop_crown', name: 'Корона смотрящего', emoji: '👑', slot: 'head', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 24, hp: 70, crit: 6 },
];

export const TATTOOS: Tattoo[] = [
  { id: 't_cat', name: 'Кот', emoji: '🐈‍⬛', meaning: 'Коренной обитатель тюрьмы', minLevel: 2, minAuthority: 0, price: 500, currency: 'money', money: 5 },
  { id: 't_spider', name: 'Паук в паутине', emoji: '🕷️', meaning: 'Вор, живущий по понятиям', minLevel: 4, minAuthority: 50, price: 2500, currency: 'money', atk: 5 },
  { id: 't_church', name: 'Купола', emoji: '⛪', meaning: 'Каждый купол — ходка', minLevel: 6, minAuthority: 150, price: 6000, currency: 'money', hp: 40, def: 4 },
  { id: 't_stars', name: 'Звёзды на плечах', emoji: '⭐', meaning: 'Отрицала — не встанет на колени', minLevel: 9, minAuthority: 400, price: 15000, currency: 'money', atk: 10, crit: 3 },
  { id: 't_rose', name: 'Роза за колючкой', emoji: '🥀', meaning: 'Совершеннолетие встретил за решёткой', minLevel: 12, minAuthority: 800, price: 30000, currency: 'money', def: 12, hp: 60 },
  { id: 't_tiger', name: 'Оскал тигра', emoji: '🐅', meaning: 'Злоба к режиму', minLevel: 5, minAuthority: 0, price: 90, currency: 'gold', atk: 14, crit: 4 },
  { id: 't_eagle', name: 'Орёл с короной', emoji: '🦅', meaning: 'Власть и свобода', minLevel: 10, minAuthority: 0, price: 250, currency: 'gold', atk: 20, def: 12, energy: 20, money: 15 },
];

export const JOBS: Job[] = [
  { id: 'j_floor', name: 'Помыть полы в хате', emoji: '🧹', minLevel: 1, energy: 5, money: [15, 30], xp: 4 },
  { id: 'j_sew', name: 'Смена на швейке', emoji: '🧵', minLevel: 2, energy: 8, money: [35, 60], xp: 7 },
  { id: 'j_boiler', name: 'Кочегарка', emoji: '🔥', minLevel: 4, energy: 12, money: [70, 120], xp: 11 },
  { id: 'j_trade', name: 'Барыжить куревом', emoji: '🚬', minLevel: 6, energy: 15, money: [130, 220], xp: 15 },
  { id: 'j_letters', name: 'Писать малявы на заказ', emoji: '✉️', minLevel: 9, energy: 18, money: [230, 360], xp: 20 },
  { id: 'j_cards', name: 'Катать в карты', emoji: '🃏', minLevel: 12, energy: 22, money: [350, 620], xp: 26 },
  { id: 'j_smuggle', name: 'Затянуть грев с воли', emoji: '📦', minLevel: 15, energy: 28, money: [600, 1000], xp: 34 },
];

export const BOSSES: Boss[] = [
  {
    id: 'b_rat', name: 'Крыса Шнырь', emoji: '🐀', description: 'Ворует пайки у своих. Пора наказать.',
    minLevel: 2, hp: 220, atk: 14, def: 4, energy: 15, cooldownMin: 30,
    reward: { money: [150, 250], xp: 30, authority: 5, gold: [0, 1] },
    drops: [{ itemId: 'drop_keys', chance: 0.04 }],
  },
  {
    id: 'b_guard', name: 'Вертухай Палыч', emoji: '👮', description: 'Любит шмонать по ночам.',
    minLevel: 5, hp: 650, atk: 28, def: 12, energy: 25, cooldownMin: 60,
    reward: { money: [500, 800], xp: 80, authority: 15, gold: [0, 2] },
    drops: [{ itemId: 'drop_keys', chance: 0.1 }, { itemId: 'drop_baton', chance: 0.03 }],
  },
  {
    id: 'b_chief', name: 'Начкар Кувалда', emoji: '💂', description: 'Начальник караула. Бьёт первым.',
    minLevel: 9, hp: 1600, atk: 52, def: 24, energy: 35, cooldownMin: 120,
    reward: { money: [1500, 2400], xp: 200, authority: 40, gold: [1, 3] },
    drops: [{ itemId: 'drop_baton', chance: 0.1 }, { itemId: 'drop_coat', chance: 0.04 }],
  },
  {
    id: 'b_warden', name: 'Хозяин зоны', emoji: '🎖️', description: 'Начальник колонии. За ним стоит вся система.',
    minLevel: 13, hp: 4000, atk: 90, def: 40, energy: 50, cooldownMin: 240,
    reward: { money: [4000, 6500], xp: 500, authority: 100, gold: [2, 6] },
    drops: [{ itemId: 'drop_coat', chance: 0.1 }, { itemId: 'drop_crown', chance: 0.04 }],
  },
];

// Обустройство хаты: мебель видна в сцене камеры и даёт постоянные бонусы.
export type Spot = 'bed' | 'table' | 'wall' | 'tech' | 'floor' | 'window' | 'corner';

export interface Furniture extends Bonus {
  id: string;
  name: string;
  emoji: string;
  spot: Spot;
  minLevel: number;
  price: number;
  currency: 'money' | 'gold';
}

export const SPOT_NAMES: Record<Spot, string> = {
  bed: 'Шконка',
  table: 'Стол',
  wall: 'Стена',
  tech: 'Техника',
  floor: 'Пол',
  window: 'Окно',
  corner: 'Угол',
};

// Внутри одного места более поздняя вещь — апгрейд: в сцене рисуется лучшая из купленных.
export const FURNITURE: Furniture[] = [
  { id: 'f_mattress', name: 'Ватный матрас', emoji: '🛏️', spot: 'bed', minLevel: 1, price: 400, currency: 'money', hp: 20 },
  { id: 'f_blanket', name: 'Шерстяное одеяло', emoji: '🧶', spot: 'bed', minLevel: 5, price: 3500, currency: 'money', hp: 50 },
  { id: 'f_bed_vip', name: 'Шконка с периной', emoji: '👑', spot: 'bed', minLevel: 5, price: 150, currency: 'gold', hp: 100, energy: 10 },
  { id: 'f_tumba', name: 'Тумбочка', emoji: '🗄️', spot: 'table', minLevel: 2, price: 700, currency: 'money', money: 5 },
  { id: 'f_table', name: 'Стол с чифирбаком', emoji: '🫖', spot: 'table', minLevel: 6, price: 5000, currency: 'money', money: 10, energy: 5 },
  { id: 'f_calendar', name: 'Календарь с красоткой', emoji: '📅', spot: 'wall', minLevel: 1, price: 250, currency: 'money', energy: 5 },
  { id: 'f_carpet', name: 'Ковёр на стену', emoji: '🟥', spot: 'wall', minLevel: 5, price: 3000, currency: 'money', def: 5, hp: 20 },
  { id: 'f_icons', name: 'Иконостас', emoji: '🖼️', spot: 'wall', minLevel: 10, price: 9000, currency: 'money', crit: 3, def: 5 },
  { id: 'f_radio', name: 'Радиоприёмник', emoji: '📻', spot: 'tech', minLevel: 3, price: 2000, currency: 'money', energy: 10 },
  { id: 'f_tv', name: 'Телевизор', emoji: '📺', spot: 'tech', minLevel: 5, price: 120, currency: 'gold', energy: 20, money: 5 },
  { id: 'f_rug', name: 'Половик', emoji: '🟫', spot: 'floor', minLevel: 2, price: 350, currency: 'money', def: 2 },
  { id: 'f_curtains', name: 'Занавески', emoji: '🪟', spot: 'window', minLevel: 4, price: 1200, currency: 'money', money: 3 },
  { id: 'f_plant', name: 'Цветок на окне', emoji: '🪴', spot: 'window', minLevel: 8, price: 6000, currency: 'money', hp: 30, money: 5 },
  { id: 'f_fridge', name: 'Холодильник', emoji: '🧊', spot: 'corner', minLevel: 12, price: 15000, currency: 'money', hp: 40, energy: 10 },
  { id: 'f_aquarium', name: 'Аквариум', emoji: '🐠', spot: 'corner', minLevel: 6, price: 200, currency: 'gold', money: 15, crit: 3 },
];

// Общий босс для всего сервера: его бьют все игроки онлайн, награду делят по урону.
export const WORLD_BOSS = {
  name: 'Бунт на централе',
  emoji: '🔥',
  baseHp: 20000,
  hpGrowth: 1.25, // каждое следующее появление крепче
  energy: 10,
  cooldownSec: 60,
  rewardPool: { money: 30000, xp: 3000, authority: 300 },
  topGold: [30, 15, 10],
};

// Донат за Telegram Stars. Цифровые товары в Telegram продаются только за Stars.
export const STAR_PACKS: StarPack[] = [
  { id: 'starter', title: 'Стартовый грев', description: '250 золота + VIP на 7 дней. Один раз на аккаунт', stars: 99, gold: 250, vipDays: 7, badge: '−60%' },
  { id: 'gold_s', title: '100 золота', description: 'Горсть рыжья', stars: 50, gold: 100 },
  { id: 'gold_m', title: '350 золота', description: '+17% бонус', stars: 150, gold: 350, badge: 'Хит' },
  { id: 'gold_l', title: '1300 золота', description: '+30% бонус', stars: 500, gold: 1300 },
  { id: 'gold_xl', title: '3000 золота', description: '+50% бонус', stars: 1000, gold: 3000, badge: 'Выгодно' },
  { id: 'vip_30', title: 'Блатной статус · 30 дней', description: 'x2 восстановление энергии, +20% денег, +30 макс. энергии, 10 золота в день', stars: 300, vipDays: 30, badge: 'VIP' },
];

// Траты золота внутри игры.
export const GOLD_PRICES = {
  faceChange: 20,
  energyRefill: 25,
  heal: 10,
  bossReset: 15,
  statReset: 60,
};

export const BALANCE = {
  baseEnergy: 100,
  energyRegenSec: 180, // +1 энергии раз в 3 минуты
  hpRegenPerMin: 0.02, // 2% от максимума в минуту
  statPointsPerLevel: 3,
  pvpEnergy: 10,
  pvpMinHpShare: 0.3,
  pvpCooldownSec: 30,
  pvpStealShare: 0.1,
  vipMoneyBonus: 20,
  vipEnergyBonus: 30,
  vipDailyGold: 10,
  dailyBase: 100,
  referralGold: 50,
  onlineWindowSec: 300,
};

/** Сколько лиц на выбор (картинки public/art/sheet/face/<n>.png). */
export const FACE_COUNT = 32;

export function xpToNext(level: number): number {
  return Math.round(60 * Math.pow(level, 1.6));
}

export function trainCost(value: number): number {
  return Math.round(20 * Math.pow(value, 1.55));
}

export function rankTitle(authority: number): string {
  if (authority >= 5000) return 'Вор в законе';
  if (authority >= 2000) return 'Положенец';
  if (authority >= 800) return 'Смотрящий';
  if (authority >= 300) return 'Блатной';
  if (authority >= 100) return 'Мужик';
  if (authority >= 20) return 'Первоход';
  return 'Новичок';
}

export const itemById = new Map(ITEMS.map((i) => [i.id, i]));
export const tattooById = new Map(TATTOOS.map((t) => [t.id, t]));
export const jobById = new Map(JOBS.map((j) => [j.id, j]));
export const bossById = new Map(BOSSES.map((b) => [b.id, b]));
export const packById = new Map(STAR_PACKS.map((p) => [p.id, p]));
export const furnitureById = new Map(FURNITURE.map((f) => [f.id, f]));
