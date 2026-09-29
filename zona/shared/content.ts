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
  chifir?: number;
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
  { id: 'cap_baseball', name: 'Бейсболка', emoji: '🧢', slot: 'head', minLevel: 3, price: 600, currency: 'money', def: 4, crit: 1 },
  { id: 'cap_vdv', name: 'Голубой берет', emoji: '🪖', slot: 'head', minLevel: 9, price: 5200, currency: 'money', def: 10, hp: 20, crit: 2 },
  { id: 'cap_mink', name: 'Норковая формовка', emoji: '🎩', slot: 'head', minLevel: 12, price: 150, currency: 'gold', def: 18, hp: 50, money: 10 },
  // Тело
  { id: 'body_tank', name: 'Майка-алкоголичка', emoji: '🎽', slot: 'body', minLevel: 1, price: 80, currency: 'money', def: 1, hp: 5 },
  { id: 'body_telnyashka', name: 'Тельняшка', emoji: '🎽', slot: 'body', minLevel: 3, price: 700, currency: 'money', def: 3, hp: 15 },
  { id: 'body_robe', name: 'Роба', emoji: '👕', slot: 'body', minLevel: 1, price: 200, currency: 'money', def: 3, hp: 10 },
  { id: 'body_quilted', name: 'Телогрейка', emoji: '🧥', slot: 'body', minLevel: 4, price: 1500, currency: 'money', def: 8, hp: 25 },
  { id: 'body_smock', name: 'Мешковина', emoji: '🥋', slot: 'body', minLevel: 1, price: 120, currency: 'money', def: 2, hp: 8 },
  { id: 'body_gown', name: 'Больничная рубаха', emoji: '🥼', slot: 'body', minLevel: 2, price: 300, currency: 'money', def: 1, hp: 30 },
  { id: 'body_overalls', name: 'Спецовка', emoji: '🦺', slot: 'body', minLevel: 3, price: 900, currency: 'money', def: 5, hp: 15, money: 5 },
  { id: 'body_apron', name: 'Фартук с толстовкой', emoji: '🧑‍🍳', slot: 'body', minLevel: 5, price: 2200, currency: 'money', def: 6, hp: 20, money: 8 },
  { id: 'body_vest', name: 'Стёганая безрукавка', emoji: '🦺', slot: 'body', minLevel: 7, price: 4200, currency: 'money', def: 11, hp: 35, crit: 2 },
  { id: 'body_bomber', name: 'Бомбер', emoji: '🧥', slot: 'body', minLevel: 9, price: 6500, currency: 'money', def: 14, hp: 45, atk: 3 },
  { id: 'body_camo', name: 'Горка камуфляж', emoji: '🪖', slot: 'body', minLevel: 8, price: 180, currency: 'gold', def: 24, hp: 80, crit: 3 },
  { id: 'body_denim', name: 'Джинсовка', emoji: '🧥', slot: 'body', minLevel: 4, price: 1800, currency: 'money', def: 7, hp: 20 },
  { id: 'body_bib', name: 'Комбинезон на лямках', emoji: '👖', slot: 'body', minLevel: 6, price: 3200, currency: 'money', def: 9, hp: 25, atk: 2 },
  { id: 'body_parka', name: 'Кожаная парка', emoji: '🧥', slot: 'body', minLevel: 12, price: 16000, currency: 'money', def: 20, hp: 60 },
  { id: 'body_alaska', name: 'Пуховик «Аляска»', emoji: '🧥', slot: 'body', minLevel: 10, price: 260, currency: 'gold', def: 28, hp: 110, energy: 15 },
  { id: 'body_leather', name: 'Кожанка', emoji: '🥼', slot: 'body', minLevel: 10, price: 8000, currency: 'money', def: 16, hp: 50 },
  { id: 'body_tracksuit', name: 'Спортивный костюм', emoji: '🦺', slot: 'body', minLevel: 6, price: 150, currency: 'gold', def: 20, hp: 70, energy: 10 },
  { id: 'body_orange', name: 'Роба ШИЗО', emoji: '🦺', slot: 'body', minLevel: 2, price: 400, currency: 'money', def: 3, hp: 18 },
  { id: 'body_hoodie', name: 'Толстовка с капюшоном', emoji: '🧥', slot: 'body', minLevel: 3, price: 950, currency: 'money', def: 4, hp: 18, energy: 5 },
  { id: 'body_flannel', name: 'Клетчатая рубаха', emoji: '👔', slot: 'body', minLevel: 5, price: 2400, currency: 'money', def: 6, hp: 22, money: 4 },
  { id: 'body_olympic', name: 'Олимпийка', emoji: '🧥', slot: 'body', minLevel: 8, price: 5200, currency: 'money', def: 11, hp: 38, crit: 2 },
  { id: 'body_sheepskin', name: 'Дублёнка', emoji: '🧥', slot: 'body', minLevel: 13, price: 19000, currency: 'money', def: 22, hp: 70, energy: 5 },
  { id: 'body_crimson', name: 'Малиновый пиджак', emoji: '🥻', slot: 'body', minLevel: 11, price: 220, currency: 'gold', def: 22, hp: 70, money: 20, crit: 3 },
  // Штаны
  { id: 'legs_pants', name: 'Казённые штаны', emoji: '👖', slot: 'legs', minLevel: 1, price: 120, currency: 'money', def: 2 },
  { id: 'legs_cargo', name: 'Камуфляж', emoji: '👖', slot: 'legs', minLevel: 7, price: 3000, currency: 'money', def: 8, hp: 15 },
  { id: 'legs_jeans', name: 'Треники', emoji: '👖', slot: 'legs', minLevel: 14, price: 14000, currency: 'money', def: 14, hp: 30 },
  { id: 'legs_wadded', name: 'Ватные штаны', emoji: '👖', slot: 'legs', minLevel: 4, price: 1300, currency: 'money', def: 5, hp: 15 },
  { id: 'legs_varenki', name: 'Джинсы-варёнки', emoji: '👖', slot: 'legs', minLevel: 6, price: 2200, currency: 'money', def: 6, hp: 12, crit: 1 },
  { id: 'legs_black', name: 'Чёрные брюки', emoji: '👖', slot: 'legs', minLevel: 10, price: 8500, currency: 'money', def: 11, hp: 24, money: 5 },
  // Обувь
  { id: 'feet_slippers', name: 'Тапки', emoji: '🩴', slot: 'feet', minLevel: 1, price: 80, currency: 'money', def: 1 },
  { id: 'feet_kirza', name: 'Берцы', emoji: '🥾', slot: 'feet', minLevel: 5, price: 1400, currency: 'money', def: 5, atk: 2 },
  { id: 'feet_sneakers', name: 'Ботинки-гады', emoji: '👟', slot: 'feet', minLevel: 11, price: 10000, currency: 'money', def: 10, crit: 3 },
  { id: 'feet_valenki', name: 'Валенки', emoji: '🥾', slot: 'feet', minLevel: 6, price: 2600, currency: 'money', def: 6, hp: 20 },
  { id: 'feet_lacquer', name: 'Лаковые туфли', emoji: '👞', slot: 'feet', minLevel: 12, price: 90, currency: 'gold', def: 9, crit: 4, money: 8 },
  // Оружие
  { id: 'wpn_spoon', name: 'Заточенная ложка', emoji: '🥄', slot: 'weapon', minLevel: 1, price: 250, currency: 'money', atk: 4 },
  { id: 'wpn_rebar', name: 'Заточка', emoji: '🔩', slot: 'weapon', minLevel: 4, price: 1800, currency: 'money', atk: 10 },
  { id: 'wpn_knuckles', name: 'Кастет', emoji: '🥊', slot: 'weapon', minLevel: 9, price: 7500, currency: 'money', atk: 18, crit: 3 },
  { id: 'wpn_chain', name: 'Цепь', emoji: '⛓️', slot: 'weapon', minLevel: 15, price: 22000, currency: 'money', atk: 30, crit: 4 },
  { id: 'wpn_golden', name: 'Золотая финка', emoji: '🗡️', slot: 'weapon', minLevel: 8, price: 200, currency: 'gold', atk: 34, crit: 6 },
  { id: 'wpn_toothbrush', name: 'Заточенная зубная щётка', emoji: '🪥', slot: 'weapon', minLevel: 2, price: 600, currency: 'money', atk: 6 },
  { id: 'wpn_pipe', name: 'Обрезок трубы', emoji: '🔧', slot: 'weapon', minLevel: 6, price: 3600, currency: 'money', atk: 14 },
  { id: 'wpn_razor', name: 'Опасная бритва', emoji: '🪒', slot: 'weapon', minLevel: 11, price: 12500, currency: 'money', atk: 22, crit: 5 },
  { id: 'wpn_nunchaku', name: 'Нунчаки из ножек табурета', emoji: '🥢', slot: 'weapon', minLevel: 13, price: 170, currency: 'gold', atk: 32, crit: 6 },
  // Талисманы
  { id: 'charm_beads', name: 'Чётки', emoji: '📿', slot: 'charm', minLevel: 3, price: 900, currency: 'money', crit: 3, money: 5 },
  { id: 'charm_ring', name: 'Печатка', emoji: '💍', slot: 'charm', minLevel: 10, price: 12000, currency: 'money', crit: 5, money: 10 },
  { id: 'charm_cross', name: 'Золотая цепура', emoji: '✝️', slot: 'charm', minLevel: 5, price: 180, currency: 'gold', crit: 8, money: 20, energy: 15 },
  { id: 'charm_dogtag', name: 'Армейский жетон', emoji: '🏷️', slot: 'charm', minLevel: 2, price: 500, currency: 'money', hp: 12, crit: 1 },
  { id: 'charm_watch', name: 'Часы «Командирские»', emoji: '⌚', slot: 'charm', minLevel: 6, price: 3200, currency: 'money', energy: 10, money: 6 },
  { id: 'charm_fiksa', name: 'Золотая фикса', emoji: '🦷', slot: 'charm', minLevel: 9, price: 70, currency: 'gold', crit: 5, money: 12 },
  // Только с боссов
  { id: 'drop_keys', name: 'Ключи вертухая', emoji: '🗝️', slot: 'charm', minLevel: 1, price: 0, currency: 'money', bossOnly: true, crit: 6, money: 15, energy: 10 },
  { id: 'drop_baton', name: 'Дубинка начкара', emoji: '🏏', slot: 'weapon', minLevel: 1, price: 0, currency: 'money', bossOnly: true, atk: 26, crit: 5 },
  { id: 'drop_uniform', name: 'Форма вертухая', emoji: '👮', slot: 'body', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 22, hp: 70, crit: 4 },
  { id: 'drop_coat', name: 'Тулуп хозяина', emoji: '🧥', slot: 'body', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 26, hp: 90 },
  { id: 'drop_crown', name: 'Корона смотрящего', emoji: '👑', slot: 'head', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 24, hp: 70, crit: 6 },
];

export const TATTOOS: Tattoo[] = [
  { id: 't_cat', name: 'Кот', emoji: '🐈‍⬛', meaning: 'Коренной обитатель тюрьмы', minLevel: 2, minAuthority: 0, price: 500, currency: 'money', money: 5 },
  { id: 't_spider', name: 'Паук в паутине', emoji: '🕷️', meaning: 'Вор, живущий по понятиям', minLevel: 4, minAuthority: 50, price: 2500, currency: 'money', atk: 5 },
  { id: 't_church', name: 'Купола', emoji: '⛪', meaning: 'Каждый купол — ходка', minLevel: 6, minAuthority: 150, price: 6000, currency: 'money', hp: 40, def: 4 },
  { id: 't_stars', name: 'Звёзды на плечах', emoji: '⭐', meaning: 'Отрицала — не встанет на колени', minLevel: 9, minAuthority: 400, price: 15000, currency: 'money', atk: 10, crit: 3 },
  { id: 't_rose', name: 'Роза за колючкой', emoji: '🥀', meaning: 'Совершеннолетие встретил за решёткой', minLevel: 12, minAuthority: 800, price: 30000, currency: 'money', def: 12, hp: 60 },
  { id: 't_tiger', name: 'Оскал тигра', emoji: '🐅', meaning: 'Злоба к режиму', minLevel: 5, minAuthority: 0, price: 90, currency: 'gold', atk: 14, crit: 4 },
  { id: 't_rings', name: 'Перстни', emoji: '💍', meaning: 'Каждый перстень — статья и срок', minLevel: 3, minAuthority: 20, price: 1200, currency: 'money', crit: 2, money: 3 },
  { id: 't_dagger', name: 'Кинжал со змеёй', emoji: '🗡️', meaning: 'Мститель: обиду не прощает', minLevel: 7, minAuthority: 200, price: 9000, currency: 'money', atk: 8, crit: 2 },
  { id: 't_skull', name: 'Череп', emoji: '💀', meaning: 'Смерти не боится', minLevel: 11, minAuthority: 600, price: 22000, currency: 'money', atk: 12, def: 6 },
  { id: 't_epaulets', name: 'Погоны', emoji: '🎖️', meaning: 'Отрицала: режим не признаёт', minLevel: 14, minAuthority: 1200, price: 45000, currency: 'money', def: 16, hp: 80, crit: 3 },
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
    drops: [{ itemId: 'drop_keys', chance: 0.1 }, { itemId: 'drop_uniform', chance: 0.05 }, { itemId: 'drop_baton', chance: 0.03 }],
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
// В каждом месте — лестница улучшений: следующую ступень можно купить, только когда есть предыдущая.
// Бонусы всех купленных ступеней складываются, а в сцене стоит выбранная (по умолчанию — лучшая),
// или ничего — голые стены тоже стиль.
export type Spot = 'bed' | 'wall' | 'light' | 'tech' | 'table' | 'floor' | 'window' | 'corner' | 'sport' | 'pet';

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
  wall: 'Стена',
  light: 'Свет',
  tech: 'Техника',
  table: 'Стол',
  floor: 'Пол',
  window: 'Окно',
  corner: 'Угол',
  sport: 'Спорт',
  pet: 'Живность',
};

/** Что стоит в месте, пока ничего не куплено. */
export const SPOT_BARE: Record<Spot, string> = {
  bed: 'Голые пружины',
  wall: 'Облезлая штукатурка',
  light: 'Лампочка на шнуре',
  tech: 'Тишина',
  table: 'Пусто',
  floor: 'Голые доски',
  window: 'Решётка',
  corner: 'Паутина',
  sport: 'Отжимания от пола',
  pet: 'Только ворона за окном',
};

export const FURNITURE: Furniture[] = [
  { id: 'f_mattress', name: 'Ватный матрас', emoji: '🛏️', spot: 'bed', minLevel: 1, price: 400, currency: 'money', hp: 20 },
  { id: 'f_blanket', name: 'Шерстяное одеяло', emoji: '🧶', spot: 'bed', minLevel: 5, price: 3500, currency: 'money', hp: 50 },
  { id: 'f_featherbed', name: 'Перина с подушками', emoji: '🪶', spot: 'bed', minLevel: 9, price: 12000, currency: 'money', hp: 70, energy: 5 },
  { id: 'f_bed_vip', name: 'Шконка с балдахином', emoji: '👑', spot: 'bed', minLevel: 12, price: 150, currency: 'gold', hp: 100, energy: 10 },

  { id: 'f_calendar', name: 'Календарь с красоткой', emoji: '📅', spot: 'wall', minLevel: 1, price: 250, currency: 'money', energy: 5 },
  { id: 'f_poster', name: 'Плакат с певицей', emoji: '🎤', spot: 'wall', minLevel: 3, price: 900, currency: 'money', energy: 3, money: 2 },
  { id: 'f_carpet', name: 'Ковёр на стену', emoji: '🟥', spot: 'wall', minLevel: 5, price: 3000, currency: 'money', def: 5, hp: 20 },
  { id: 'f_carpet_silk', name: 'Персидский ковёр', emoji: '🧿', spot: 'wall', minLevel: 9, price: 11000, currency: 'money', def: 6, hp: 30 },
  { id: 'f_icons', name: 'Иконостас', emoji: '🖼️', spot: 'wall', minLevel: 12, price: 20000, currency: 'money', crit: 3, def: 5 },
  { id: 'f_painting', name: 'Картина в золотой раме', emoji: '🖼', spot: 'wall', minLevel: 16, price: 120, currency: 'gold', crit: 3, money: 8 },

  { id: 'f_newspaper', name: 'Абажур из газеты', emoji: '📰', spot: 'light', minLevel: 2, price: 300, currency: 'money', energy: 3 },
  { id: 'f_shade', name: 'Тканевый абажур', emoji: '🏮', spot: 'light', minLevel: 6, price: 2500, currency: 'money', energy: 5, money: 2 },
  { id: 'f_garland', name: 'Гирлянда', emoji: '✨', spot: 'light', minLevel: 9, price: 7000, currency: 'money', money: 4, crit: 1 },
  { id: 'f_chandelier', name: 'Хрустальная люстра', emoji: '💎', spot: 'light', minLevel: 13, price: 90, currency: 'gold', money: 10, energy: 10 },

  { id: 'f_radio', name: 'Радиоприёмник', emoji: '📻', spot: 'tech', minLevel: 3, price: 2000, currency: 'money', energy: 10 },
  { id: 'f_tv', name: 'Пузатый телевизор', emoji: '📺', spot: 'tech', minLevel: 5, price: 6000, currency: 'money', energy: 15, money: 3 },
  { id: 'f_lcd', name: 'Плоский телевизор', emoji: '🖥️', spot: 'tech', minLevel: 10, price: 22000, currency: 'money', energy: 20, money: 6 },
  { id: 'f_plasma', name: 'Гигантская плазма', emoji: '📡', spot: 'tech', minLevel: 14, price: 250, currency: 'gold', energy: 30, money: 12, crit: 2 },
  { id: 'f_console', name: 'Плазма с приставкой', emoji: '🎮', spot: 'tech', minLevel: 20, price: 400, currency: 'gold', energy: 40, money: 15, crit: 3 },

  { id: 'f_tumba', name: 'Тумбочка', emoji: '🗄️', spot: 'table', minLevel: 2, price: 700, currency: 'money', money: 5 },
  { id: 'f_table', name: 'Стол с чифирбаком', emoji: '🫖', spot: 'table', minLevel: 6, price: 5000, currency: 'money', money: 10, energy: 5 },
  { id: 'f_samovar', name: 'Стол с самоваром', emoji: '🍯', spot: 'table', minLevel: 12, price: 18000, currency: 'money', money: 12, energy: 8, hp: 20 },

  { id: 'f_rug', name: 'Половик', emoji: '🟫', spot: 'floor', minLevel: 2, price: 350, currency: 'money', def: 2 },
  { id: 'f_floorcarpet', name: 'Ковёр на пол', emoji: '🧶', spot: 'floor', minLevel: 7, price: 4500, currency: 'money', def: 4, hp: 20 },
  { id: 'f_bearskin', name: 'Шкура медведя', emoji: '🐻', spot: 'floor', minLevel: 12, price: 100, currency: 'gold', def: 8, hp: 40 },

  { id: 'f_curtains', name: 'Занавески', emoji: '🪟', spot: 'window', minLevel: 4, price: 1200, currency: 'money', money: 3 },
  { id: 'f_plant', name: 'Цветок на окне', emoji: '🪴', spot: 'window', minLevel: 8, price: 6000, currency: 'money', hp: 30, money: 5 },
  { id: 'f_drapes', name: 'Бархатные шторы', emoji: '🎭', spot: 'window', minLevel: 12, price: 16000, currency: 'money', money: 8, hp: 20 },

  { id: 'f_stool', name: 'Табурет с тазиком', emoji: '🪣', spot: 'corner', minLevel: 2, price: 300, currency: 'money', hp: 10 },
  { id: 'f_aquarium', name: 'Аквариум', emoji: '🐠', spot: 'corner', minLevel: 6, price: 7000, currency: 'money', money: 10, crit: 2 },
  { id: 'f_fridge', name: 'Холодильник «ЗИЛ»', emoji: '🧊', spot: 'corner', minLevel: 11, price: 15000, currency: 'money', hp: 40, energy: 10 },
  { id: 'f_bar', name: 'Мини-бар', emoji: '🍾', spot: 'corner', minLevel: 16, price: 180, currency: 'gold', money: 12, energy: 15 },

  { id: 'f_dumbbells', name: 'Гантели из бутылок', emoji: '🏋️', spot: 'sport', minLevel: 3, price: 500, currency: 'money', atk: 2 },
  { id: 'f_bench', name: 'Скамья для жима', emoji: '🪑', spot: 'sport', minLevel: 8, price: 5000, currency: 'money', atk: 5, hp: 20 },
  { id: 'f_bag', name: 'Боксёрская груша', emoji: '🥊', spot: 'sport', minLevel: 13, price: 14000, currency: 'money', atk: 8, crit: 2 },
  { id: 'f_gym', name: 'Тренажёр «Качалка»', emoji: '💪', spot: 'sport', minLevel: 18, price: 150, currency: 'gold', atk: 12, hp: 50 },

  { id: 'f_roach', name: 'Таракан Борька', emoji: '🪳', spot: 'pet', minLevel: 1, price: 100, currency: 'money', crit: 1 },
  { id: 'f_cat', name: 'Кот Васька', emoji: '🐈', spot: 'pet', minLevel: 7, price: 4000, currency: 'money', hp: 20, money: 3 },
  { id: 'f_parrot', name: 'Попугай Кеша', emoji: '🦜', spot: 'pet', minLevel: 11, price: 60, currency: 'gold', money: 6, energy: 5 },
];

export const SPOTS = Object.keys(SPOT_NAMES) as Spot[];

/** Уют хаты: сумма ступеней всех купленных вещей — для рейтинга и в гостях. */
export function comfortOf(owned: string[]): number {
  let c = 0;
  for (const spot of SPOTS) {
    FURNITURE.filter((f) => f.spot === spot).forEach((f, i) => {
      if (owned.includes(f.id)) c += i + 1;
    });
  }
  return c;
}

/** Что показать в сцене: выбранное игроком, иначе лучшее купленное по каждому месту. */
export function cellView(owned: string[], show: Partial<Record<Spot, string>> = {}): string[] {
  const out: string[] = [];
  for (const spot of SPOTS) {
    const pick = show[spot];
    if (pick === 'none') continue;
    if (pick && owned.includes(pick)) {
      out.push(pick);
      continue;
    }
    const best = FURNITURE.filter((f) => f.spot === spot && owned.includes(f.id)).pop();
    if (best) out.push(best.id);
  }
  return out;
}

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
  { id: 'chifir_10', title: '10 кружек чифира', description: 'Каждая — полная энергия в любой момент', stars: 75, chifir: 10, badge: 'Энергия' },
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
  rename: 30,
  energySmall: 10, // +30 энергии
  chifir: 20, // одна кружка про запас
  questReroll: 5,
  questSkipPer10Min: 2,
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

// --- Персонаж ---------------------------------------------------------------
export const BUILDS = [
  { id: 0, name: 'Сухой', scale: 0.9 },
  { id: 1, name: 'Обычный', scale: 1 },
  { id: 2, name: 'Здоровый', scale: 1.12 },
];
export const SKINS = [
  { id: 0, name: 'Как есть', filter: '' },
  { id: 1, name: 'Бледный', filter: 'brightness(1.08) saturate(0.7)' },
  { id: 2, name: 'Загорелый', filter: 'sepia(0.35) saturate(1.3) brightness(0.92)' },
  { id: 3, name: 'Смуглый', filter: 'sepia(0.5) saturate(1.2) brightness(0.72)' },
];

// --- Интерьер хаты ------------------------------------------------------------
export interface Interior {
  id: string;
  kind: 'wall' | 'floor';
  name: string;
  price: number;
  currency: 'money' | 'gold';
  color: string; // основной цвет
  accent: string; // полосы, швы
}
export const INTERIORS: Interior[] = [
  { id: 'w_green', kind: 'wall', name: 'Казённая зелёнка', price: 0, currency: 'money', color: '#2f4234', accent: '#1f2d23' },
  { id: 'w_blue', kind: 'wall', name: 'Синяя панель', price: 1500, currency: 'money', color: '#2b3d55', accent: '#1b2839' },
  { id: 'w_tiles', kind: 'wall', name: 'Белый кафель', price: 4000, currency: 'money', color: '#b9bdb6', accent: '#8d928b' },
  { id: 'w_wood', kind: 'wall', name: 'Вагонка', price: 9000, currency: 'money', color: '#7a5433', accent: '#4f341e' },
  { id: 'w_royal', kind: 'wall', name: 'Бордо с золотом', price: 120, currency: 'gold', color: '#5b1620', accent: '#c49a48' },
  { id: 'f_planks', kind: 'floor', name: 'Крашеные доски', price: 0, currency: 'money', color: '#5a2a1f', accent: '#2c130d' },
  { id: 'f_linoleum', kind: 'floor', name: 'Линолеум', price: 1200, currency: 'money', color: '#6b6a4c', accent: '#4a4933' },
  { id: 'f_tile', kind: 'floor', name: 'Плитка', price: 5000, currency: 'money', color: '#5d6166', accent: '#3a3d41' },
  { id: 'f_parquet', kind: 'floor', name: 'Паркет ёлочкой', price: 90, currency: 'gold', color: '#8a5a2e', accent: '#5a3818' },
];
export const interiorById = new Map(INTERIORS.map((i) => [i.id, i]));

// --- Поручения (случайные задания с таймером) ---------------------------------
export interface QuestTemplate {
  id: string;
  name: string;
  text: string;
  minutes: number;
  energy: number;
  money: [number, number];
  xp: number;
  chance: number; // шанс успеха
}
export const QUEST_TEMPLATES: QuestTemplate[] = [
  { id: 'q_note', name: 'Затянуть маляву', text: 'Переправить записку в соседний барак мимо вертухаев', minutes: 5, energy: 5, money: [40, 70], xp: 8, chance: 0.95 },
  { id: 'q_wagon', name: 'Разгрузить вагон', text: 'Ночная разгрузка на промке, начальник обещал доплатить', minutes: 15, energy: 12, money: [120, 200], xp: 18, chance: 0.9 },
  { id: 'q_cards', name: 'Катран у барыги', text: 'Сесть за стол с барыгой и не остаться без штанов', minutes: 10, energy: 8, money: [60, 260], xp: 12, chance: 0.6 },
  { id: 'q_rat', name: 'Найти крысу', text: 'Кто-то тянет из общака. Вычислить и предъявить', minutes: 30, energy: 15, money: [200, 320], xp: 30, chance: 0.8 },
  { id: 'q_kum', name: 'Отмазать кента', text: 'Кента вызвал кум. Надо зайти и развести по понятиям', minutes: 20, energy: 10, money: [150, 240], xp: 22, chance: 0.75 },
  { id: 'q_grev', name: 'Принять грев', text: 'Встретить передачку у забора, пока смена меняется', minutes: 45, energy: 18, money: [300, 480], xp: 40, chance: 0.85 },
  { id: 'q_tattoo', name: 'Постоять на шухере', text: 'Кольщик бьёт наколку — нужен человек на атасе', minutes: 5, energy: 4, money: [30, 60], xp: 6, chance: 0.97 },
  { id: 'q_tunnel', name: 'Копать подкоп', text: 'Смотрящий поручил ночную смену в подвале. Никому ни слова', minutes: 60, energy: 25, money: [450, 700], xp: 60, chance: 0.7 },
  { id: 'q_debt', name: 'Выбить долг', text: 'Фраер проиграл и не отдаёт. Объяснить ему правила', minutes: 15, energy: 12, money: [150, 260], xp: 18, chance: 0.8 },
  { id: 'q_laundry', name: 'Постирать за блатного', text: 'Блатной не стирает сам. Постирать, погладить — и не забыть про стрелки', minutes: 8, energy: 5, money: [50, 90], xp: 9, chance: 0.97 },
  { id: 'q_radio', name: 'Спаять приёмник', text: 'Работяга просит помочь собрать радио из деталей с промки', minutes: 25, energy: 12, money: [170, 260], xp: 26, chance: 0.8 },
  { id: 'q_bet', name: 'Принять ставки на бои', text: 'За баней бои. Кто-то должен записывать ставки и не проговориться', minutes: 20, energy: 10, money: [90, 380], xp: 20, chance: 0.65 },
  { id: 'q_crow', name: 'Приручить ворону', text: 'Отшельник уверяет: прирученная ворона носит грев с воли', minutes: 40, energy: 14, money: [220, 420], xp: 36, chance: 0.7 },
  { id: 'q_snow', name: 'Расчистить плац', text: 'Начальник лагеря обещал поблажку тем, кто выйдет на снег', minutes: 12, energy: 9, money: [90, 140], xp: 14, chance: 0.95 },
  { id: 'q_letter', name: 'Написать письмо на волю', text: 'Неграмотный сосед диктует письмо жене. Писать надо красиво', minutes: 6, energy: 4, money: [40, 80], xp: 8, chance: 0.98 },
  { id: 'q_kitchen', name: 'Подрезать на кухне', text: 'Вынести из столовой тушёнку, пока повар отвернулся', minutes: 10, energy: 6, money: [70, 120], xp: 10, chance: 0.85 },
];

// --- Дейлики ----------------------------------------------------------------------
export type DailyKind = 'job' | 'pvpWin' | 'boss' | 'worldHit' | 'train' | 'quest' | 'spend';
export type TrackKind = DailyKind | 'butts' | 'event' | 'escape' | 'visit' | 'minigame' | 'furnish' | 'church' | 'yard';
export const DAILY_KINDS: { kind: DailyKind; label: string; range: [number, number] }[] = [
  { kind: 'job', label: 'Отработать смен', range: [3, 6] },
  { kind: 'pvpWin', label: 'Выиграть наездов', range: [1, 3] },
  { kind: 'boss', label: 'Завалить босса', range: [1, 1] },
  { kind: 'worldHit', label: 'Ударить по бунту', range: [2, 4] },
  { kind: 'train', label: 'Потренироваться', range: [1, 3] },
  { kind: 'quest', label: 'Выполнить поручений', range: [1, 3] },
  { kind: 'spend', label: 'Потратить энергии', range: [50, 100] },
];
export const DAILY_BONUS_GOLD = 10;

// --- Кланы --------------------------------------------------------------------
export const CLAN = {
  minLevel: 5,
  createCost: 5000,
  maxMembers: 20,
  maxLevel: 10,
  upgradeCost: (level: number) => Math.round(20000 * Math.pow(level, 1.5)),
  // бонус каждому участнику за уровень клана
  moneyPerLevel: 3,
  energyPerLevel: 2,
};

/** Сколько лиц на выбор (картинки public/art/sheet/face/<n>.png). */
/** Внешность героя собирается из частей: причёска × борода × форма лица × брови. Номер лица = их комбинация. */
export const FACE_PARTS = { hair: 8, beard: 6, jaw: 3, brow: 2 };
export const FACE_COUNT = FACE_PARTS.hair * FACE_PARTS.beard * FACE_PARTS.jaw * FACE_PARTS.brow;

export function faceParts(face: number) {
  const f = Math.max(0, Math.floor(face)) % FACE_COUNT;
  const hair = f % FACE_PARTS.hair;
  const beard = Math.floor(f / FACE_PARTS.hair) % FACE_PARTS.beard;
  const jaw = Math.floor(f / (FACE_PARTS.hair * FACE_PARTS.beard)) % FACE_PARTS.jaw;
  const brow = Math.floor(f / (FACE_PARTS.hair * FACE_PARTS.beard * FACE_PARTS.jaw)) % FACE_PARTS.brow;
  return { hair, beard, jaw, brow };
}

export function faceOf(parts: { hair: number; beard: number; jaw: number; brow: number }) {
  return parts.hair + FACE_PARTS.hair * (parts.beard + FACE_PARTS.beard * (parts.jaw + FACE_PARTS.jaw * parts.brow));
}

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

// --- Бычки и барыга ---------------------------------------------------------------
export const BUTTS = {
  regenSec: 240, // новый бычок на зоне раз в 4 минуты
  maxOnField: 8,
  packChance: 0.08, // иногда вместо бычка — целая пачка
  packValue: 5,
};
export const TRADES = [
  { id: 'money', label: 'Толкнуть барыге', cost: 5, give: 'money' as const },
  { id: 'energy', label: '+15 энергии', cost: 8, give: 'energy' as const },
  { id: 'chifir', label: 'Кружка чифира', cost: 25, give: 'chifir' as const },
  { id: 'gold', label: '5 золота', cost: 100, give: 'gold' as const },
];

// --- Напёрстки ------------------------------------------------------------------
export const SHELLS = { payout: 2.7, maxPerDay: 25, minBet: 50, betPerLevel: 250 };

// --- Еженедельные события -------------------------------------------------------
export interface WeeklyEvent {
  id: 'riot' | 'search' | 'amnesty' | 'tobacco' | 'tournament';
  name: string;
  desc: string;
  goal: { kind: TrackKind; label: string };
  tiers: [number, number, number];
}
export const WEEKLY_EVENTS: WeeklyEvent[] = [
  { id: 'riot', name: 'Неделя бунта', desc: 'Урон по бунту на централе ×2', goal: { kind: 'worldHit', label: 'Ударов по бунту' }, tiers: [10, 30, 70] },
  { id: 'search', name: 'Большой шмон', desc: 'С боссов в полтора раза больше денег', goal: { kind: 'boss', label: 'Боссов завалено' }, tiers: [5, 15, 35] },
  { id: 'amnesty', name: 'Слухи об амнистии', desc: 'Энергия восстанавливается в 1,5 раза быстрее', goal: { kind: 'job', label: 'Смен отработано' }, tiers: [20, 60, 140] },
  { id: 'tobacco', name: 'Табачный кризис', desc: 'Каждый поднятый бычок идёт за два', goal: { kind: 'butts', label: 'Бычков собрано' }, tiers: [40, 120, 280] },
  { id: 'tournament', name: 'Турнир на дворе', desc: 'Авторитет за победу в наезде ×2', goal: { kind: 'pvpWin', label: 'Побед в наездах' }, tiers: [10, 30, 70] },
];
/** Награды за три ступени недельной цели. */
export const WEEKLY_REWARDS = [
  { money: 3000, gold: 5, chifir: 0 },
  { money: 8000, gold: 15, chifir: 2 },
  { money: 20000, gold: 40, chifir: 5 },
];

// --- Бесплатные занятия (когда нет энергии) --------------------------------------
export const CHURCH = {
  prayCooldownMin: 60,
  prayBlessMin: 120,
  candleCost: 10, // бычков
  candleBlessMin: 360,
  blessMoney: 10, // % к деньгам
  blessCrit: 3,
  confessHeal: 0.3, // доля здоровья, раз в день
};
export const PULLUPS = { maxReps: 40, cooldownMin: 10, perDay: 12, repsPerXp: 3 };

/** Комплекты одежды, нарисованные на герое целиком (public/art/sheet/outfit/<set>/<поза>.png).
 *  У всех есть stand; guard — боевая стойка, walk — шаг, sit — сидя. */
export type OutfitPose = 'stand' | 'guard' | 'walk' | 'sit';
export const OUTFITS: Record<string, { set: string; poses: OutfitPose[] }> = {
  body_robe: { set: 'c_stripes', poses: ['stand'] },
  body_tank: { set: 'c_tank', poses: ['stand', 'guard'] },
  body_telnyashka: { set: 'c_telnyashka', poses: ['stand'] },
  body_quilted: { set: 'c_bushlat', poses: ['stand'] },
  body_tracksuit: { set: 'c_tracksuit', poses: ['stand'] },
  body_overalls: { set: 'c_overalls', poses: ['stand'] },
  body_bib: { set: 'c_bib', poses: ['stand', 'guard'] },
  body_denim: { set: 'c_denim', poses: ['stand'] },
  body_vest: { set: 'c_vest', poses: ['stand', 'walk'] },
  body_camo: { set: 'c_camo', poses: ['stand', 'guard', 'walk'] },
  body_leather: { set: 'c_leather', poses: ['stand', 'walk'] },
  body_parka: { set: 'c_parka', poses: ['stand'] },
  body_alaska: { set: 'c_alaska', poses: ['stand'] },
  body_smock: { set: 'c_smock', poses: ['stand', 'walk'] },
  body_bomber: { set: 'c_bomber', poses: ['stand'] },
  body_apron: { set: 'c_apron', poses: ['stand'] },
  body_gown: { set: 'a_gown', poses: ['stand'] },
  drop_coat: { set: 'c_tulup', poses: ['stand'] },
  drop_uniform: { set: 'c_guardform', poses: ['stand', 'guard', 'walk'] },
};
