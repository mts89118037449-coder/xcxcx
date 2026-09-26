// Боевые перки и расходники.
// Перков 100: 12 типов × 8 ступеней + 4 легендарных. Открываются с уровнем,
// в бою одновременно не больше 3 и не больше одного каждого типа.
// Расходников 20: одноразовые, срабатывают один раз за бой, в бой берутся 3.

export type PerkKind =
  | 'crit' // точный удар: следующий удар — крит с множителем
  | 'stun' // оглушение: противник пропускает ход
  | 'heal' // второе дыхание: лечит, когда здоровья меньше половины
  | 'double' // двоечка: два удара за ход
  | 'block' // глухая защита: следующий удар противника в блок
  | 'bleed' // заточка в бок: кровотечение на 3 хода
  | 'armor' // ломка: противник бьёт слабее 4 хода
  | 'leech' // кровопийца (пассивно): лечит долей нанесённого урона
  | 'dodge' // уклон (пассивно): шанс увернуться
  | 'counter' // встречка (пассивно): шанс ответить на удар
  | 'rage' // ярость (пассивно): больше урона при здоровье ниже 40%
  | 'execute' // добивание: мгновенно добивает ослабленного противника (раз за бой)
  | 'legend';

export interface Perk {
  id: string;
  kind: PerkKind;
  tier: number;
  name: string;
  emoji: string;
  desc: string;
  minLevel: number;
  /** Перезарядка в ходах; 0 — пассивный, -1 — раз за бой. */
  cd: number;
  /** Главное число эффекта: множитель, процент, шанс — зависит от типа. */
  value: number;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

interface Archetype {
  kind: Exclude<PerkKind, 'legend'>;
  name: string;
  emoji: string;
  value: (t: number) => number;
  cd: (t: number) => number;
  desc: (v: number, cd: number) => string;
}

const ARCHETYPES: Archetype[] = [
  { kind: 'crit', name: 'Точный удар', emoji: '🎯', value: (t) => +(1.7 + 0.16 * t).toFixed(2), cd: (t) => 8 - Math.floor(t / 3), desc: (v, cd) => `Удар ×${v} (крит). Перезарядка ${cd} ход.` },
  { kind: 'stun', name: 'Оглушение', emoji: '💫', value: (t) => 40 + 7 * t, cd: (t) => 6 - Math.floor(t / 3), desc: (v, cd) => `С шансом ${v}% противник пропускает ход. Перезарядка ${cd}.` },
  { kind: 'heal', name: 'Второе дыхание', emoji: '💚', value: (t) => Math.round(10 + 1.75 * t), cd: (t) => 8 - Math.floor(t / 4), desc: (v, cd) => `Когда здоровья меньше половины — лечит ${v}%. Перезарядка ${cd}.` },
  { kind: 'double', name: 'Двоечка', emoji: '👊', value: (t) => 50 + 6 * t, cd: (t) => 5 - Math.floor(t / 4), desc: (v, cd) => `Второй удар за ход на ${v}% силы. Перезарядка ${cd}.` },
  { kind: 'block', name: 'Глухая защита', emoji: '🛡️', value: (t) => 60 + 5 * t, cd: (t) => 6 - Math.floor(t / 3), desc: (v, cd) => `Следующий удар противника ослаблен на ${v}%. Перезарядка ${cd}.` },
  { kind: 'bleed', name: 'Заточка в бок', emoji: '🩸', value: (t) => +(1.6 + 0.45 * t).toFixed(1), cd: () => 7, desc: (v) => `Кровотечение: ${v}% здоровья противника за ход, 3 хода. Перезарядка 7.` },
  { kind: 'armor', name: 'Ломка', emoji: '🔨', value: (t) => Math.round(12 + 3.5 * t), cd: () => 7, desc: (v) => `Урон противника −${v}% на 4 хода. Перезарядка 7.` },
  { kind: 'leech', name: 'Кровопийца', emoji: '🧛', value: (t) => 6 + 3 * t, cd: () => 0, desc: (v) => `Пассивно: лечит ${v}% от нанесённого урона.` },
  { kind: 'dodge', name: 'Уклон', emoji: '💨', value: (t) => +(5 + 2.5 * t).toFixed(1), cd: () => 0, desc: (v) => `Пассивно: ${v}% шанс увернуться.` },
  { kind: 'counter', name: 'Встречка', emoji: '↩️', value: (t) => 12 + 3 * t, cd: () => 0, desc: (v) => `Пассивно: ${v}% шанс ответить ударом на 80% силы.` },
  { kind: 'rage', name: 'Ярость', emoji: '😤', value: (t) => 20 + 8 * t, cd: () => 0, desc: (v) => `Пассивно: +${v}% урона, когда здоровья меньше 40%.` },
  { kind: 'execute', name: 'Добивание', emoji: '☠️', value: (t) => +(12 + 2.8 * t).toFixed(1), cd: () => -1, desc: (v) => `Раз за бой: добивает, если у противника меньше ${v}% здоровья.` },
];

export const PERKS: Perk[] = [];
ARCHETYPES.forEach((a, ai) => {
  for (let t = 1; t <= 8; t++) {
    const value = a.value(t);
    const cd = a.cd(t);
    PERKS.push({
      id: `${a.kind}_${t}`,
      kind: a.kind,
      tier: t,
      name: `${a.name} ${ROMAN[t - 1]}`,
      emoji: a.emoji,
      desc: a.desc(value, cd),
      minLevel: 1 + (t - 1) * 6 + Math.floor(ai / 2),
      cd,
      value,
    });
  }
});
PERKS.push(
  { id: 'legend_thief', kind: 'legend', tier: 9, name: 'Вор в законе', emoji: '👑', desc: 'Пассивно: +22% урона и 10% шанс увернуться.', minLevel: 40, cd: 0, value: 22 },
  { id: 'legend_iron', kind: 'legend', tier: 9, name: 'Железный', emoji: '🗿', desc: 'Раз за бой: первые четыре удара противника в полный блок.', minLevel: 42, cd: -1, value: 4 },
  { id: 'legend_dog', kind: 'legend', tier: 9, name: 'Бешеный пёс', emoji: '🐺', desc: 'Каждый четвёртый ход — удар ×3.', minLevel: 45, cd: 4, value: 3 },
  { id: 'legend_phoenix', kind: 'legend', tier: 9, name: 'Не дождётесь', emoji: '🔥', desc: 'Раз за бой: при смертельном ударе остаётся 35% здоровья.', minLevel: 48, cd: -1, value: 35 },
);

export const perkById = new Map(PERKS.map((p) => [p.id, p]));
export const PERK_SLOTS = 3;

// --- Расходники -------------------------------------------------------------------

export type ConsumableKind =
  | 'heal' // лечит value% при здоровье ниже 40%
  | 'revive' // при смертельном ударе остаётся value% здоровья
  | 'stunStart' // противник пропускает первый ход
  | 'block' // value ударов противника в блок
  | 'dmgBuff' // +value% урона на весь бой
  | 'critBuff' // +value% шанса крита на весь бой
  | 'critDmg' // крит бьёт сильнее на value%
  | 'hpBuff' // +value% максимального здоровья
  | 'weaken' // атака противника −value% на весь бой
  | 'bleed' // кровотечение value% за ход на 4 хода с первого удара
  | 'double' // первый ход — двойной удар
  | 'counter' // +value% шанса встречки
  | 'loot'; // +value% денег за победу

export interface Consumable {
  id: string;
  name: string;
  emoji: string;
  kind: ConsumableKind;
  value: number;
  desc: string;
  /** Цена в ларьке: деньги или золото; 0 — не продаётся (только найти). */
  price: number;
  currency: 'money' | 'gold';
  rarity: 'common' | 'rare' | 'epic';
}

export const CONSUMABLES: Consumable[] = [
  { id: 'c_bandage', name: 'Бинт', emoji: '🩹', kind: 'heal', value: 20, desc: 'Лечит 20% при здоровье ниже 40%', price: 300, currency: 'money', rarity: 'common' },
  { id: 'c_medkit', name: 'Аптечка', emoji: '💊', kind: 'heal', value: 45, desc: 'Лечит 45% при здоровье ниже 40%', price: 8, currency: 'gold', rarity: 'rare' },
  { id: 'c_holywater', name: 'Святая вода', emoji: '💧', kind: 'heal', value: 30, desc: 'Лечит 30% при здоровье ниже 40%', price: 0, currency: 'money', rarity: 'rare' },
  { id: 'c_photo', name: 'Фото мамы', emoji: '🖼️', kind: 'revive', value: 30, desc: 'При смертельном ударе — встаёшь с 30%', price: 0, currency: 'money', rarity: 'epic' },
  { id: 'c_adrenaline', name: 'Ампула адреналина', emoji: '💉', kind: 'revive', value: 20, desc: 'При смертельном ударе — встаёшь с 20%', price: 15, currency: 'gold', rarity: 'epic' },
  { id: 'c_sand', name: 'Песок в глаза', emoji: '🏜️', kind: 'stunStart', value: 1, desc: 'Противник пропускает первый ход', price: 400, currency: 'money', rarity: 'common' },
  { id: 'c_book', name: 'Книга под робой', emoji: '📕', kind: 'block', value: 1, desc: 'Первый удар противника в блок', price: 350, currency: 'money', rarity: 'common' },
  { id: 'c_towel', name: 'Мокрое полотенце', emoji: '🧻', kind: 'block', value: 2, desc: 'Два удара противника в блок', price: 0, currency: 'money', rarity: 'rare' },
  { id: 'c_insert', name: 'Свинчатка', emoji: '🪨', kind: 'dmgBuff', value: 15, desc: '+15% урона на весь бой', price: 600, currency: 'money', rarity: 'common' },
  { id: 'c_vodka', name: 'Самогон', emoji: '🍶', kind: 'dmgBuff', value: 30, desc: '+30% урона на весь бой', price: 10, currency: 'gold', rarity: 'rare' },
  { id: 'c_chifir', name: 'Крепкий чифир', emoji: '☕', kind: 'critBuff', value: 15, desc: '+15% шанса крита на весь бой', price: 500, currency: 'money', rarity: 'common' },
  { id: 'c_goldtooth', name: 'Золотой зуб', emoji: '🦷', kind: 'critDmg', value: 100, desc: 'Криты бьют вдвое сильнее', price: 0, currency: 'money', rarity: 'epic' },
  { id: 'c_salo', name: 'Шмат сала', emoji: '🥓', kind: 'hpBuff', value: 15, desc: '+15% здоровья на бой', price: 450, currency: 'money', rarity: 'common' },
  { id: 'c_salt', name: 'Соль в карман', emoji: '🧂', kind: 'weaken', value: 20, desc: 'Атака противника −20% на весь бой', price: 700, currency: 'money', rarity: 'common' },
  { id: 'c_bribe', name: 'Пачка «Примы»', emoji: '🚬', kind: 'weaken', value: 35, desc: 'Подкуп: атака противника −35%', price: 12, currency: 'gold', rarity: 'rare' },
  { id: 'c_blade', name: 'Одноразовая заточка', emoji: '🔪', kind: 'bleed', value: 4, desc: 'Кровотечение 4% за ход, 4 хода', price: 800, currency: 'money', rarity: 'common' },
  { id: 'c_spring', name: 'Пружина от шконки', emoji: '🌀', kind: 'double', value: 1, desc: 'Первый ход — два удара', price: 550, currency: 'money', rarity: 'common' },
  { id: 'c_razor', name: 'Лезвие за губой', emoji: '🪒', kind: 'counter', value: 30, desc: '+30% шанса встречного удара', price: 0, currency: 'money', rarity: 'rare' },
  { id: 'c_letter', name: 'Малява от вора', emoji: '✉️', kind: 'loot', value: 50, desc: '+50% денег за победу', price: 0, currency: 'money', rarity: 'rare' },
  { id: 'c_icon', name: 'Иконка-оберег', emoji: '📿', kind: 'hpBuff', value: 30, desc: '+30% здоровья на бой', price: 14, currency: 'gold', rarity: 'epic' },
];

export const consumableById = new Map(CONSUMABLES.map((c) => [c.id, c]));
export const CONSUMABLE_SLOTS = 3;

/** Случайная находка: чаще обычные, реже редкие и эпические. */
export function rollConsumable(rng: () => number): string {
  const r = rng();
  const rarity = r < 0.65 ? 'common' : r < 0.93 ? 'rare' : 'epic';
  const pool = CONSUMABLES.filter((c) => c.rarity === rarity);
  return pool[Math.floor(rng() * pool.length)].id;
}
