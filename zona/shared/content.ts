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
  crafted?: boolean; // делается ремеслом
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
  /** свои приёмы босса (id перков); без них — подбираются по уровню */
  perks?: string[];
  /** чем опасен — подпись на плитке */
  trait?: string;
  /** босс только в этой колонии */
  colony?: 'north' | 'krytka' | 'red';
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
  /** платный пропуск текущего сезона */
  pass?: boolean;
  /** косметика: рамка или титул */
  cosmetic?: string;
  /** предложение дня: доступно только в свой день ротации, раз в день */
  offer?: boolean;
  items?: Record<string, number>;
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
  { id: 'cap_kevlar', name: 'Каска', emoji: '⛑️', slot: 'head', minLevel: 22, price: 55000, currency: 'money', def: 28, hp: 70, crit: 2 },
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
  { id: 'body_kevlar', name: 'Бронежилет', emoji: '🦺', slot: 'body', minLevel: 20, price: 65000, currency: 'money', def: 34, hp: 130 },
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
  { id: 'wpn_axe', name: 'Топорик с промки', emoji: '🪓', slot: 'weapon', minLevel: 18, price: 48000, currency: 'money', atk: 44, crit: 5 },
  // Талисманы
  { id: 'charm_beads', name: 'Чётки', emoji: '📿', slot: 'charm', minLevel: 3, price: 900, currency: 'money', crit: 3, money: 5 },
  { id: 'charm_ring', name: 'Печатка', emoji: '💍', slot: 'charm', minLevel: 10, price: 12000, currency: 'money', crit: 5, money: 10 },
  { id: 'charm_cross', name: 'Золотая цепура', emoji: '✝️', slot: 'charm', minLevel: 5, price: 180, currency: 'gold', crit: 8, money: 20, energy: 15 },
  { id: 'charm_dogtag', name: 'Армейский жетон', emoji: '🏷️', slot: 'charm', minLevel: 2, price: 500, currency: 'money', hp: 12, crit: 1 },
  { id: 'charm_watch', name: 'Часы «Командирские»', emoji: '⌚', slot: 'charm', minLevel: 6, price: 3200, currency: 'money', energy: 10, money: 6 },
  { id: 'charm_fiksa', name: 'Золотая фикса', emoji: '🦷', slot: 'charm', minLevel: 9, price: 70, currency: 'gold', crit: 5, money: 12 },
  // Знак сезона — с последнего уровня платного пропуска
  { id: 'charm_season', name: 'Знак сезона', emoji: '🎖️', slot: 'charm', minLevel: 1, price: 0, currency: 'money', bossOnly: true, crit: 6, money: 15, energy: 12, hp: 30 },
  // Только ремеслом (в ларьке нет — как и боссовые)
  { id: 'craft_beads', name: 'Чётки из мякиша', emoji: '📿', slot: 'charm', minLevel: 4, price: 0, currency: 'money', bossOnly: true, crafted: true, crit: 4, money: 7 },
  { id: 'craft_mouthpiece', name: 'Наборный мундштук', emoji: '🚬', slot: 'charm', minLevel: 8, price: 0, currency: 'money', bossOnly: true, crafted: true, crit: 5, money: 12, energy: 6 },
  { id: 'craft_ring', name: 'Перстень из проволоки', emoji: '💍', slot: 'charm', minLevel: 12, price: 0, currency: 'money', bossOnly: true, crafted: true, crit: 7, money: 16, energy: 8 },
  { id: 'craft_amulet', name: 'Ладанка с родной землёй', emoji: '🧿', slot: 'charm', minLevel: 16, price: 0, currency: 'money', bossOnly: true, crafted: true, hp: 60, crit: 7, money: 18, energy: 10 },
  // Только с боссов
  { id: 'drop_keys', name: 'Ключи вертухая', emoji: '🗝️', slot: 'charm', minLevel: 1, price: 0, currency: 'money', bossOnly: true, crit: 6, money: 15, energy: 10 },
  { id: 'drop_baton', name: 'Дубинка начкара', emoji: '🏏', slot: 'weapon', minLevel: 1, price: 0, currency: 'money', bossOnly: true, atk: 26, crit: 5 },
  { id: 'drop_uniform', name: 'Форма вертухая', emoji: '👮', slot: 'body', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 22, hp: 70, crit: 4 },
  { id: 'drop_coat', name: 'Тулуп хозяина', emoji: '🧥', slot: 'body', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 26, hp: 90 },
  { id: 'drop_folder', name: 'Папка кума', emoji: '🗂️', slot: 'charm', minLevel: 1, price: 0, currency: 'money', bossOnly: true, crit: 8, money: 25, energy: 15 },
  { id: 'drop_greatcoat', name: 'Генеральская шинель', emoji: '🧥', slot: 'body', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 42, hp: 160, crit: 4 },
  { id: 'drop_cap_general', name: 'Генеральская фуражка', emoji: '🎖️', slot: 'head', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 34, hp: 100, crit: 6 },
  { id: 'drop_ring_thief', name: 'Перстень вора', emoji: '💍', slot: 'charm', minLevel: 1, price: 0, currency: 'money', bossOnly: true, crit: 12, money: 30, energy: 20 },
  { id: 'drop_helmet', name: 'Шлем «Тайфуна»', emoji: '🪖', slot: 'head', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 48, hp: 150, crit: 5 },
  { id: 'drop_gloves', name: 'Перчатки щипача', emoji: '🧤', slot: 'charm', minLevel: 1, price: 0, currency: 'money', bossOnly: true, crit: 4, money: 8 },
  { id: 'drop_vohr_cap', name: 'Фуражка ВОХРа', emoji: '🪖', slot: 'head', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 12, hp: 30, crit: 2 },
  { id: 'drop_dog_tag', name: 'Жетон кинолога', emoji: '🐾', slot: 'charm', minLevel: 1, price: 0, currency: 'money', bossOnly: true, crit: 5, energy: 10, hp: 30 },
  { id: 'drop_notebook', name: 'Блокнот стукача', emoji: '📓', slot: 'charm', minLevel: 1, price: 0, currency: 'money', bossOnly: true, crit: 6, money: 20 },
  { id: 'drop_scalpel', name: 'Скальпель лепилы', emoji: '🔪', slot: 'weapon', minLevel: 1, price: 0, currency: 'money', bossOnly: true, atk: 40, crit: 8 },
  { id: 'drop_smotr_coat', name: 'Пальто смотрящего', emoji: '🧥', slot: 'body', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 38, hp: 140, money: 15 },
  { id: 'drop_major_cap', name: 'Фуражка режимника', emoji: '🎖️', slot: 'head', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 40, hp: 120, crit: 6 },
  { id: 'drop_prosecutor_suit', name: 'Мундир прокурора', emoji: '🥼', slot: 'body', minLevel: 1, price: 0, currency: 'money', bossOnly: true, def: 50, hp: 190, crit: 6, money: 10 },
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
  { id: 't_sun', name: 'Восходящее солнце', emoji: '🌅', meaning: 'Малолетка: впервые сел молодым', minLevel: 2, minAuthority: 0, price: 400, currency: 'money', energy: 5 },
  { id: 't_dots', name: 'Пять точек', emoji: '⁙', meaning: 'Один в четырёх стенах', minLevel: 2, minAuthority: 10, price: 600, currency: 'money', def: 2, hp: 10 },
  { id: 't_anchor', name: 'Якорь', emoji: '⚓', meaning: 'Надежда, флотская юность', minLevel: 3, minAuthority: 0, price: 900, currency: 'money', hp: 20 },
  { id: 't_heart', name: 'Сердце со стрелой', emoji: '💘', meaning: 'Любовь, оставшаяся на воле', minLevel: 3, minAuthority: 0, price: 1000, currency: 'money', energy: 8 },
  { id: 't_candle', name: 'Свеча', emoji: '🕯️', meaning: 'Память о погибших корешах', minLevel: 4, minAuthority: 30, price: 1500, currency: 'money', hp: 25, def: 2 },
  { id: 't_snake', name: 'Змея', emoji: '🐍', meaning: 'Хитрость и мудрость', minLevel: 5, minAuthority: 60, price: 2800, currency: 'money', crit: 3 },
  { id: 't_cards', name: 'Масти на пальцах', emoji: '♠️', meaning: 'Картёжник, игрок', minLevel: 5, minAuthority: 40, price: 2400, currency: 'money', money: 6 },
  { id: 't_bat', name: 'Летучая мышь', emoji: '🦇', meaning: 'Ночной вор', minLevel: 6, minAuthority: 80, price: 3800, currency: 'money', crit: 2, money: 4 },
  { id: 't_owl', name: 'Сова', emoji: '🦉', meaning: 'Не спит по ночам, всё видит', minLevel: 7, minAuthority: 120, price: 5200, currency: 'money', def: 5, crit: 2 },
  { id: 't_madonna', name: 'Мадонна с младенцем', emoji: '👼', meaning: 'С малолетства по тюрьмам', minLevel: 8, minAuthority: 150, price: 7500, currency: 'money', hp: 50, def: 5 },
  { id: 't_ship', name: 'Парусник', emoji: '⛵', meaning: 'Склонен к побегу', minLevel: 8, minAuthority: 100, price: 7000, currency: 'money', energy: 10, crit: 2 },
  { id: 't_beetle', name: 'Жук', emoji: '🪲', meaning: 'Воровская удача', minLevel: 9, minAuthority: 200, price: 9500, currency: 'money', money: 10, crit: 2 },
  { id: 't_wolf', name: 'Оскал волка', emoji: '🐺', meaning: 'Ненависть к конвою', minLevel: 10, minAuthority: 250, price: 12000, currency: 'money', atk: 10, crit: 2 },
  { id: 't_lighthouse', name: 'Маяк', emoji: '🗼', meaning: 'Стремление на свободу', minLevel: 10, minAuthority: 200, price: 11000, currency: 'money', energy: 12, hp: 30 },
  { id: 't_scales', name: 'Весы', emoji: '⚖️', meaning: 'Судья мне — совесть', minLevel: 11, minAuthority: 300, price: 14000, currency: 'money', def: 8, money: 6 },
  { id: 't_clock', name: 'Часы без стрелок', emoji: '🕰️', meaning: 'Срок, который не кончается', minLevel: 12, minAuthority: 350, price: 16000, currency: 'money', hp: 60, energy: 8 },
  { id: 't_barbwire', name: 'Колючка на запястье', emoji: '➰', meaning: 'Отсидел от звонка до звонка', minLevel: 12, minAuthority: 400, price: 17000, currency: 'money', def: 10, hp: 40 },
  { id: 't_sword', name: 'Меч и роза', emoji: '🗡️', meaning: 'За предательство отомщу', minLevel: 13, minAuthority: 500, price: 20000, currency: 'money', atk: 14, crit: 2 },
  { id: 't_bear', name: 'Медведь', emoji: '🐻', meaning: 'Медвежатник: вскрывает сейфы', minLevel: 14, minAuthority: 600, price: 24000, currency: 'money', money: 14, def: 6 },
  { id: 't_crucifix', name: 'Распятие', emoji: '✝️', meaning: 'Не предам', minLevel: 15, minAuthority: 800, price: 30000, currency: 'money', hp: 90, def: 10 },
  { id: 't_knee_stars', name: 'Звёзды на коленях', emoji: '✴️', meaning: 'Ни перед кем не встану на колени', minLevel: 16, minAuthority: 1000, price: 38000, currency: 'money', atk: 12, def: 12, crit: 3 },
  { id: 't_mother', name: '«Не забуду мать родную»', emoji: '📜', meaning: 'Память о матери', minLevel: 4, minAuthority: 0, price: 60, currency: 'gold', hp: 60, energy: 10 },
  { id: 't_devil', name: 'Чёрт', emoji: '😈', meaning: 'Не зли — вспыльчивый', minLevel: 9, minAuthority: 0, price: 140, currency: 'gold', atk: 18, crit: 4 },
  { id: 't_eyes', name: 'Глаза на животе', emoji: '👁️', meaning: 'Я всё вижу', minLevel: 12, minAuthority: 0, price: 200, currency: 'gold', crit: 6, def: 10, money: 8 },
  { id: 't_crown', name: 'Корона на плече', emoji: '👑', meaning: 'Авторитет среди своих', minLevel: 18, minAuthority: 1500, price: 320, currency: 'gold', atk: 22, def: 14, crit: 5, money: 12 },
  { id: 't_dove', name: 'Голубь', emoji: '🕊️', meaning: 'Мечта о свободе', minLevel: 3, minAuthority: 0, price: 800, currency: 'money', energy: 6 },
  { id: 't_key', name: 'Ключ', emoji: '🗝️', meaning: 'Вор-домушник', minLevel: 6, minAuthority: 70, price: 4200, currency: 'money', money: 7 },
  { id: 't_web', name: 'Паутина на локте', emoji: '🕸️', meaning: 'Долгий срок', minLevel: 11, minAuthority: 300, price: 15000, currency: 'money', hp: 50, def: 6 },
  { id: 't_lion', name: 'Лев', emoji: '🦁', meaning: 'Сила и власть', minLevel: 17, minAuthority: 1200, price: 45000, currency: 'money', atk: 18, hp: 70 },
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

const BOSS_LIST: Boss[] = [
  // --- боссы колоний: только на своей зоне ---
  {
    id: 'b_lumber', name: 'Бригадир лесоповала', emoji: '🪓', description: 'Норму требует с кулаками. Топор держит не для красоты.', colony: 'north',
    minLevel: 8, hp: 1500, atk: 50, def: 22, energy: 32, cooldownMin: 120, perks: ['double_3'], trait: '🪓 рубит дважды',
    reward: { money: [1500, 2300], xp: 200, authority: 36, gold: [1, 2] },
    drops: [],
  },
  {
    id: 'b_frost', name: 'Начальник лагпункта Мороз', emoji: '🥶', description: 'Сорок лет на Севере. Холоднее только его взгляд.', colony: 'north',
    minLevel: 20, hp: 6400, atk: 160, def: 88, energy: 70, cooldownMin: 360, perks: ['armor_5', 'stun_5'], trait: '❄️ ледяная броня',
    reward: { money: [8000, 12000], xp: 950, authority: 260, gold: [2, 3] },
    drops: [],
  },
  {
    id: 'b_pakhan', name: 'Камерный пахан', emoji: '🗝️', description: 'Держит хату на крытке. Слово — закон, рука — тяжёлая.', colony: 'krytka',
    minLevel: 10, hp: 2100, atk: 62, def: 28, energy: 38, cooldownMin: 150, perks: ['counter_6'], trait: '😤 отвечает на удар',
    reward: { money: [2200, 3200], xp: 290, authority: 52, gold: [1, 2] },
    drops: [],
  },
  {
    id: 'b_korpus', name: 'Корпусной Цербер', emoji: '🔒', description: 'Ключи от всех дверей. И от твоей — тоже.', colony: 'krytka',
    minLevel: 22, hp: 7000, atk: 175, def: 95, energy: 75, cooldownMin: 420, perks: ['heal_6', 'stun_5'], trait: '💚 лечится, оглушает',
    reward: { money: [9000, 13000], xp: 1050, authority: 300, gold: [2, 3] },
    drops: [],
  },
  {
    id: 'b_sdp', name: 'Председатель СДП', emoji: '📋', description: 'Секция дисциплины и порядка. Пишет на всех — и прикрывается начальством.', colony: 'red',
    minLevel: 9, hp: 1700, atk: 54, def: 26, energy: 35, cooldownMin: 120, perks: ['block_3', 'heal_2'], trait: '📋 прикрывается',
    reward: { money: [1600, 2500], xp: 210, authority: 40, gold: [1, 2] },
    drops: [],
  },
  {
    id: 'b_podpolkovnik', name: 'Режимный подполковник', emoji: '🚩', description: 'Красная зона — его рук дело. Режим превыше всего.', colony: 'red',
    minLevel: 23, hp: 7400, atk: 180, def: 100, energy: 78, cooldownMin: 420, perks: ['armor_5', 'counter_6'], trait: '🚩 держит режим',
    reward: { money: [9500, 14000], xp: 1100, authority: 320, gold: [2, 3] },
    drops: [],
  },
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
    reward: { money: [4000, 6500], xp: 500, authority: 100, gold: [1, 3] },
    drops: [{ itemId: 'drop_coat', chance: 0.1 }, { itemId: 'drop_crown', chance: 0.04 }],
  },
  {
    id: 'b_kum', name: 'Кум', emoji: '🕵️', description: 'Оперчасть. Знает про тебя всё и хочет знать больше.',
    minLevel: 17, hp: 5800, atk: 140, def: 60, energy: 60, cooldownMin: 300,
    reward: { money: [5000, 8000], xp: 700, authority: 180, gold: [1, 3] },
    drops: [{ itemId: 'drop_folder', chance: 0.06 }],
  },
  {
    id: 'b_general', name: 'Генерал ФСИН', emoji: '⭐', description: 'Приехал с проверкой. Лампасы, шинель и свита.',
    minLevel: 21, hp: 7200, atk: 165, def: 90, energy: 70, cooldownMin: 360,
    reward: { money: [8000, 12000], xp: 1000, authority: 300, gold: [2, 3] },
    drops: [{ itemId: 'drop_greatcoat', chance: 0.05 }, { itemId: 'drop_cap_general', chance: 0.05 }],
  },
  {
    id: 'b_thief', name: 'Вор в законе', emoji: '💍', description: 'Коронованный. Его слово — закон для всей зоны.',
    minLevel: 26, hp: 9000, atk: 205, def: 110, energy: 80, cooldownMin: 480,
    reward: { money: [12000, 18000], xp: 1500, authority: 500, gold: [2, 4] },
    drops: [{ itemId: 'drop_ring_thief', chance: 0.05 }],
  },
  {
    id: 'b_typhoon', name: 'Спецназ «Тайфун»', emoji: '🪖', description: 'Подавление бунта. Щиты, дубинки, никаких разговоров.',
    minLevel: 32, hp: 11500, atk: 240, def: 130, energy: 100, cooldownMin: 720,
    reward: { money: [18000, 26000], xp: 2400, authority: 900, gold: [3, 5] },
    drops: [{ itemId: 'drop_helmet', chance: 0.05 }],
  },
  {
    id: 'b_pickpocket', name: 'Щипач Сёма', emoji: '🤏', description: 'Шарит по карманам в очереди за баландой.',
    minLevel: 3, hp: 380, atk: 18, def: 6, energy: 18, cooldownMin: 40, perks: ['dodge_1'], trait: '💨 увёртливый',
    reward: { money: [220, 350], xp: 45, authority: 7, gold: [0, 1] },
    drops: [{ itemId: 'drop_gloves', chance: 0.08 }],
  },
  {
    id: 'b_zavhoz', name: 'Завхоз', emoji: '📦', description: 'Держит склад и знает, кому что недодать.',
    minLevel: 7, hp: 1100, atk: 40, def: 18, energy: 30, cooldownMin: 90, perks: ['block_3', 'heal_2'], trait: '🛡️ прячется за стеллажом',
    reward: { money: [900, 1400], xp: 130, authority: 25, gold: [0, 2] },
    drops: [{ itemId: 'drop_vohr_cap', chance: 0.07 }],
  },
  {
    id: 'b_dog', name: 'Кинолог с Джульбарсом', emoji: '🐕', description: 'Овчарка рвётся с поводка, хозяин не лучше.',
    minLevel: 11, hp: 2600, atk: 70, def: 32, energy: 40, cooldownMin: 150, perks: ['bleed_4', 'double_3'], trait: '🩸 травит собакой',
    reward: { money: [2400, 3600], xp: 330, authority: 60, gold: [1, 2] },
    drops: [{ itemId: 'drop_dog_tag', chance: 0.07 }],
  },
  {
    id: 'b_snitch', name: 'Стукач Сивый', emoji: '🐍', description: 'Всё видит, всё пишет куму. Бьёт исподтишка.',
    minLevel: 15, hp: 4200, atk: 115, def: 50, energy: 55, cooldownMin: 240, perks: ['stun_5', 'dodge_4'], trait: '💫 бьёт исподтишка',
    reward: { money: [4500, 7000], xp: 600, authority: 140, gold: [1, 2] },
    drops: [{ itemId: 'drop_notebook', chance: 0.06 }],
  },
  {
    id: 'b_medic', name: 'Лепила-садист', emoji: '💉', description: 'Колет всем одно и то же. И себе тоже — для бодрости.',
    minLevel: 19, hp: 5500, atk: 150, def: 75, energy: 65, cooldownMin: 330, perks: ['heal_6', 'armor_5'], trait: '💚 лечит сам себя',
    reward: { money: [6500, 10000], xp: 850, authority: 240, gold: [1, 3] },
    drops: [{ itemId: 'drop_scalpel', chance: 0.06 }],
  },
  {
    id: 'b_smotr', name: 'Смотрящий за зоной', emoji: '👁️', description: 'Держит зону. Ответит на каждый удар — и злее.',
    minLevel: 24, hp: 7000, atk: 185, def: 100, energy: 75, cooldownMin: 420, perks: ['counter_6', 'rage_6'], trait: '😤 звереет, отвечает',
    reward: { money: [10000, 15000], xp: 1250, authority: 420, gold: [2, 3] },
    drops: [{ itemId: 'drop_smotr_coat', chance: 0.05 }],
  },
  {
    id: 'b_major', name: 'Майор-режимник', emoji: '🪪', description: 'Режим — его религия. Добьёт, если дашь слабину.',
    minLevel: 29, hp: 8800, atk: 220, def: 120, energy: 90, cooldownMin: 600, perks: ['execute_7', 'armor_7', 'stun_6'], trait: '☠️ добивает слабых',
    reward: { money: [15000, 22000], xp: 2000, authority: 700, gold: [2, 4] },
    drops: [{ itemId: 'drop_major_cap', chance: 0.05 }],
  },
  {
    id: 'b_prosecutor', name: 'Прокурор по надзору', emoji: '⚖️', description: 'Приехал с проверкой. За ним закон, охрана и терпение.',
    minLevel: 36, hp: 11800, atk: 270, def: 150, energy: 110, cooldownMin: 900, perks: ['heal_8', 'block_8', 'double_8'], trait: '⚖️ держит удар, лечится',
    reward: { money: [24000, 34000], xp: 3000, authority: 1200, gold: [3, 6] },
    drops: [{ itemId: 'drop_prosecutor_suit', chance: 0.05 }],
  },
  // --- камео: узнаваемые типажи из телевизора ---
  {
    id: 'b_gluhar', name: 'Следователь Глухарь', emoji: '🕵️', description: 'Двадцать сезонов раскрывает одно и то же дело. Колет на допросе — в обоих смыслах.',
    minLevel: 13, hp: 3300, atk: 92, def: 42, energy: 48, cooldownMin: 180, perks: ['stun_4', 'armor_4'], trait: '🕵️ колет на допросе',
    reward: { money: [3200, 4800], xp: 450, authority: 95, gold: [1, 2] },
    drops: [],
  },
  {
    id: 'b_streamer', name: 'Блогер-сиделец Стримыч', emoji: '📱', description: 'Ведёт стрим из хаты с запрещённого телефона. Уворачивается, пока капают донаты.',
    minLevel: 17, hp: 4800, atk: 128, def: 58, energy: 60, cooldownMin: 270, perks: ['dodge_4', 'double_5'], trait: '📱 уворачивается под донаты',
    reward: { money: [5500, 8200], xp: 720, authority: 180, gold: [1, 3] },
    drops: [],
  },
];

/** Боссы по порядку уровней. */
export const BOSSES: Boss[] = [...BOSS_LIST].sort((x, y) => x.minLevel - y.minLevel);

// Обустройство хаты: мебель видна в сцене камеры и даёт постоянные бонусы.
// В каждом месте — лестница улучшений: следующую ступень можно купить, только когда есть предыдущая.
// Бонусы всех купленных ступеней складываются, а в сцене стоит выбранная (по умолчанию — лучшая),
// или ничего — голые стены тоже стиль.
export type Spot = 'bed' | 'wall' | 'light' | 'tech' | 'table' | 'floor' | 'window' | 'corner' | 'sport' | 'pet' | 'music' | 'deco' | 'shelf' | 'stove' | 'stash' | 'photo';

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
  music: 'Музыка',
  deco: 'Декор',
  shelf: 'Полка',
  stove: 'Плитка',
  stash: 'Нычка',
  photo: 'Фото',
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
  music: 'Свист сквозь зубы',
  deco: 'Голый потолок',
  shelf: 'Всё на полу',
  stove: 'Чай из-под крана',
  stash: 'Всё на виду',
  photo: 'Никого не ждёшь',
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
  { id: 'f_dog', name: 'Пёс Мухтар', emoji: '🐕', spot: 'pet', minLevel: 17, price: 160, currency: 'gold', def: 8, hp: 40, money: 5 },

  { id: 'f_guitar', name: 'Гитара с бантом', emoji: '🎸', spot: 'music', minLevel: 3, price: 1100, currency: 'money', energy: 4 },
  { id: 'f_bayan', name: 'Баян', emoji: '🪗', spot: 'music', minLevel: 8, price: 6500, currency: 'money', energy: 8, money: 3 },
  { id: 'f_tape', name: 'Магнитофон «Весна»', emoji: '📼', spot: 'music', minLevel: 12, price: 17000, currency: 'money', energy: 12, money: 5 },
  { id: 'f_hifi', name: 'Музыкальный центр', emoji: '🔊', spot: 'music', minLevel: 16, price: 170, currency: 'gold', energy: 18, money: 8, crit: 2 },

  // Полка
  { id: 'f_shelf_board', name: 'Доска на гвоздях', emoji: '🪵', spot: 'shelf', minLevel: 4, price: 800, currency: 'money', energy: 3 },
  { id: 'f_shelf_books', name: 'Полка с книгами', emoji: '📚', spot: 'shelf', minLevel: 9, price: 6000, currency: 'money', money: 4, energy: 4 },
  { id: 'f_shelf_trophy', name: 'Грамоты и кубки', emoji: '🏆', spot: 'shelf', minLevel: 14, price: 20000, currency: 'money', crit: 2, money: 5 },
  { id: 'f_shelf_carved', name: 'Резная полка с нардами', emoji: '🎲', spot: 'shelf', minLevel: 18, price: 140, currency: 'gold', crit: 3, money: 10 },
  // Плитка
  { id: 'f_boiler', name: 'Кипятильник в банке', emoji: '🫙', spot: 'stove', minLevel: 2, price: 400, currency: 'money', energy: 5 },
  { id: 'f_hotplate', name: 'Плитка с чайником', emoji: '🫖', spot: 'stove', minLevel: 7, price: 4500, currency: 'money', energy: 8, hp: 15 },
  { id: 'f_microwave', name: 'Микроволновка', emoji: '📦', spot: 'stove', minLevel: 13, price: 16000, currency: 'money', energy: 12, hp: 25 },
  { id: 'f_coffee', name: 'Кофемашина', emoji: '☕', spot: 'stove', minLevel: 17, price: 160, currency: 'gold', energy: 20, money: 6 },
  // Нычка
  { id: 'f_stash_brick', name: 'Нычка в стене', emoji: '🧱', spot: 'stash', minLevel: 3, price: 600, currency: 'money', money: 4 },
  { id: 'f_stash_floor', name: 'Тайник под половицей', emoji: '🪚', spot: 'stash', minLevel: 8, price: 5000, currency: 'money', money: 6 },
  { id: 'f_stash_mattress', name: 'Заначка в матрасе', emoji: '💰', spot: 'stash', minLevel: 12, price: 14000, currency: 'money', money: 8, def: 3 },
  { id: 'f_stash_safe', name: 'Сейф под шконкой', emoji: '🔐', spot: 'stash', minLevel: 18, price: 170, currency: 'gold', money: 14 },
  // Фото
  { id: 'f_photo_mom', name: 'Фото мамы', emoji: '🖼️', spot: 'photo', minLevel: 1, price: 150, currency: 'money', hp: 10 },
  { id: 'f_photo_family', name: 'Семейные фото', emoji: '👨‍👩‍👦', spot: 'photo', minLevel: 6, price: 3000, currency: 'money', hp: 20, energy: 4 },
  { id: 'f_photo_girl', name: 'Письма и фото любимой', emoji: '💌', spot: 'photo', minLevel: 11, price: 12000, currency: 'money', energy: 8, crit: 1 },
  { id: 'f_photo_frame', name: 'Портрет в золотой раме', emoji: '🖼', spot: 'photo', minLevel: 16, price: 120, currency: 'gold', hp: 40, crit: 2 },
  { id: 'f_laundry', name: 'Верёвка с бельём', emoji: '🧺', spot: 'deco', minLevel: 2, price: 250, currency: 'money', hp: 8 },
  { id: 'f_pennants', name: 'Вымпелы «Спартак»', emoji: '🚩', spot: 'deco', minLevel: 6, price: 2800, currency: 'money', crit: 1, energy: 3 },
  { id: 'f_cuckoo', name: 'Часы с кукушкой', emoji: '🕰️', spot: 'deco', minLevel: 10, price: 13000, currency: 'money', energy: 8, money: 4 },
  { id: 'f_antlers', name: 'Оленьи рога', emoji: '🦌', spot: 'deco', minLevel: 15, price: 130, currency: 'gold', def: 6, crit: 3 },
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

/** Тема хаты: если в сцене стоят вещи одного стиля — бонус сверху. Каждая группа — одно место (любая из вещей). */
export interface CellTheme {
  id: string;
  name: string;
  emoji: string;
  need: number;
  groups: string[][];
  bonus: Bonus;
}

export const CELL_THEMES: CellTheme[] = [
  {
    id: 'home', name: 'Как дома', emoji: '🏠', need: 4, bonus: { energy: 15, hp: 30 },
    groups: [['f_blanket', 'f_featherbed'], ['f_samovar', 'f_table'], ['f_cat'], ['f_curtains', 'f_plant'], ['f_rug', 'f_floorcarpet'], ['f_photo_family', 'f_photo_mom'], ['f_cuckoo'], ['f_hotplate', 'f_boiler']],
  },
  {
    id: 'gym', name: 'Качалка', emoji: '🏋️', need: 4, bonus: { atk: 8, hp: 40 },
    groups: [['f_gym', 'f_bag', 'f_bench'], ['f_pennants'], ['f_radio', 'f_tape'], ['f_fridge'], ['f_mattress'], ['f_shelf_trophy'], ['f_poster', 'f_calendar']],
  },
  {
    id: 'reader', name: 'Изба-читальня', emoji: '📚', need: 4, bonus: { energy: 10, money: 6 },
    groups: [['f_shelf_books', 'f_shelf_board'], ['f_shade', 'f_newspaper'], ['f_tumba', 'f_table'], ['f_radio'], ['f_plant'], ['f_photo_mom', 'f_photo_girl'], ['f_guitar']],
  },
  {
    id: 'holy', name: 'Святой угол', emoji: '⛪', need: 4, bonus: { crit: 3, def: 8 },
    groups: [['f_icons'], ['f_shade'], ['f_plant', 'f_drapes'], ['f_tumba'], ['f_photo_frame', 'f_photo_mom'], ['f_stool'], ['f_cuckoo']],
  },
  {
    id: 'music', name: 'Музыкальная хата', emoji: '🎸', need: 4, bonus: { energy: 15, crit: 2 },
    groups: [['f_hifi', 'f_tape', 'f_bayan', 'f_guitar'], ['f_poster'], ['f_garland'], ['f_parrot'], ['f_lcd', 'f_tv'], ['f_pennants']],
  },
  {
    id: 'boss', name: 'Блатная хата', emoji: '👑', need: 5, bonus: { money: 12, crit: 3 },
    groups: [['f_bed_vip'], ['f_painting', 'f_carpet_silk'], ['f_chandelier'], ['f_plasma', 'f_console'], ['f_bar'], ['f_bearskin'], ['f_drapes'], ['f_stash_safe'], ['f_coffee'], ['f_shelf_carved']],
  },
];

/** Сколько групп темы собрано в том, что стоит в хате. */
export function themeCount(t: CellTheme, shown: string[]): number {
  return t.groups.filter((g) => g.some((id) => shown.includes(id))).length;
}

/** Активные темы хаты. */
export function activeThemes(shown: string[]): CellTheme[] {
  return CELL_THEMES.filter((t) => themeCount(t, shown) >= t.need);
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
  { id: 'season_pass', title: 'Пропуск сезона', description: 'Платная дорожка сезона: золото, чифир, рамка, титул и знак сезона', stars: 250, pass: true, badge: 'Сезон' },
  { id: 'cos_frame_gold', title: 'Золотая рамка', description: 'Рамка аватара — видна в чате, хатах и рейтинге', stars: 120, cosmetic: 'frame_gold' },
  { id: 'cos_frame_fire', title: 'Огненная рамка', description: 'Рамка аватара с языками пламени', stars: 150, cosmetic: 'frame_fire' },
  { id: 'cos_frame_ice', title: 'Ледяная рамка', description: 'Рамка аватара — холодный блеск', stars: 150, cosmetic: 'frame_ice' },
  { id: 'cos_frame_blood', title: 'Кровавая рамка', description: 'Рамка аватара для тех, кто в крови не боится', stars: 150, cosmetic: 'frame_blood' },
  { id: 'cos_title_legend', title: 'Титул «Легенда зоны»', description: 'Подпись под именем в чате и в хате', stars: 200, cosmetic: 'title_legend' },
  { id: 'cos_title_boss', title: 'Титул «Хозяин положения»', description: 'Подпись под именем в чате и в хате', stars: 200, cosmetic: 'title_boss' },
  // предложения дня: по одному в день по кругу
  { id: 'offer_chifir', title: 'Грев энергии', description: '5 кружек чифира + 60 золота. Только сегодня', stars: 99, chifir: 5, gold: 60, offer: true, badge: '−40%' },
  { id: 'offer_gold', title: 'Мешок рыжья', description: '600 золота вместо 350. Только сегодня', stars: 150, gold: 600, offer: true, badge: '×1.7' },
  { id: 'offer_vip', title: 'Блатной на неделю', description: 'VIP на 7 дней + 100 золота. Только сегодня', stars: 120, vipDays: 7, gold: 100, offer: true, badge: 'Выгодно' },
  { id: 'offer_fight', title: 'Боевой набор', description: '3 аптечки, 3 адреналина, 3 самогона + 50 золота. Только сегодня', stars: 110, gold: 50, items: { c_medkit: 3, c_adrenaline: 3, c_vodka: 3 }, offer: true, badge: 'Набор' },
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
export type TrackKind = DailyKind | 'butts' | 'event' | 'escape' | 'visit' | 'minigame' | 'furnish' | 'church' | 'yard' | 'place' | 'clanBoss';
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

// --- Комплекты, редкость, улучшение -------------------------------------------------------

export interface GearSet {
  id: string;
  name: string;
  items: string[];
  /** бонус за 2 вещи и за полный комплект (складываются) */
  two: Bonus;
  full: Bonus;
}

export const SETS: GearSet[] = [
  { id: 'set_retro', name: 'Лагерный ретро', items: ['body_robe', 'legs_pants', 'feet_slippers', 'cap_knit'], two: { hp: 30 }, full: { hp: 80, money: 5 } },
  { id: 'set_sport', name: 'Спортивный', items: ['body_tracksuit', 'legs_jeans', 'feet_sneakers', 'cap_baseball'], two: { energy: 15 }, full: { atk: 10, energy: 25 } },
  { id: 'set_vohr', name: 'Форма ВОХРа', items: ['drop_uniform', 'drop_vohr_cap', 'drop_baton', 'feet_kirza'], two: { def: 10 }, full: { crit: 5, hp: 80 } },
  { id: 'set_thief', name: 'Воровской', items: ['body_crimson', 'cap_mink', 'feet_lacquer', 'drop_ring_thief'], two: { money: 10 }, full: { crit: 8, atk: 15 } },
  { id: 'set_storm', name: 'Штурмовой', items: ['body_kevlar', 'cap_kevlar', 'legs_cargo', 'feet_kirza'], two: { def: 15 }, full: { def: 30, hp: 120 } },
  { id: 'set_boss', name: 'Хозяйский', items: ['drop_coat', 'drop_crown', 'drop_keys', 'drop_baton'], two: { atk: 10, hp: 40 }, full: { crit: 10, money: 15, energy: 20 } },
];

export type Rarity = 'common' | 'good' | 'rare' | 'epic';
export const RARITY_NAMES: Record<Rarity, string> = { common: 'обычная', good: 'добротная', rare: 'редкая', epic: 'трофей' };

export function rarityOf(item: Item): Rarity {
  if (item.bossOnly) return 'epic';
  if (item.currency === 'gold') return 'rare';
  return item.price >= 5000 ? 'good' : 'common';
}

/** Улучшение у мастера на промке: +10% к бонусам вещи за ступень, до +5. */
export const UPGRADE = { max: 5, perLevel: 10 };

export function upgradeCost(item: Item, level: number): { amount: number; currency: 'money' | 'gold' } {
  if (item.bossOnly) return { amount: 4000 * (level + 1) * (level + 1), currency: 'money' };
  if (item.currency === 'gold') return { amount: Math.ceil(item.price * 0.15 * (level + 1)), currency: 'gold' };
  return { amount: Math.max(150, Math.round(item.price * 0.4 * (level + 1))), currency: 'money' };
}
export const tattooById = new Map(TATTOOS.map((t) => [t.id, t]));
export const jobById = new Map(JOBS.map((j) => [j.id, j]));
export const bossById = new Map(BOSSES.map((b) => [b.id, b]));
export const packById = new Map(STAR_PACKS.map((p) => [p.id, p]));
export const OFFERS = STAR_PACKS.filter((p) => p.offer);
/** Предложение дня: по кругу, день — по Москве. */
export function offerOfDay(now: number): StarPack {
  const day = Math.floor((now + 3 * 3600_000) / 86_400_000);
  return OFFERS[day % OFFERS.length];
}
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
