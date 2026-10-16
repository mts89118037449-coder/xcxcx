// Питомцы: живут в хате, растут от заботы. Кот лечит, крыса таскает находки, голубь носит посылки.

export type PetKind = 'cat' | 'rat' | 'pigeon' | 'dog';

export interface PetDef {
  kind: PetKind;
  name: string;
  emoji: string;
  desc: string;
  price: number;
  minLevel: number;
  /** что даёт на уровне L — строкой для экрана */
  perk(level: number): string;
}

export const PET = {
  maxLevel: 10,
  xpTo: (level: number) => 40 * level,
  feedH: 8,
  feedButts: 3,
  feedXp: 12,
  trainH: 4,
  trainEnergy: 10,
  trainXp: 18,
  /** не кормил дольше — питомец грустит, польза вдвое меньше */
  hungryH: 48,
};

export const PETS: PetDef[] = [
  { kind: 'cat', name: 'Кот', emoji: '🐈', desc: 'Мурлычет на груди — заживает быстрее', price: 1500, minLevel: 2, perk: (l) => `+${2 * l}% здоровья, кормёжка лечит ${10 + 2 * l}%` },
  { kind: 'rat', name: 'Крыса', emoji: '🐀', desc: 'Шныряет по бараку и тащит, что плохо лежит', price: 1000, minLevel: 3, perk: (l) => `${3 + l}% шанс находки после смены и боя` },
  { kind: 'dog', name: 'Пёс', emoji: '🐕', desc: 'Сторожит хату и рычит на наезжающих', price: 3500, minLevel: 8, perk: (l) => `+${2 * l}% защиты, на выставке — по уровню и командам` },
  { kind: 'pigeon', name: 'Голубь', emoji: '🕊️', desc: 'Носит посылки через забор', price: 2500, minLevel: 6, perk: (l) => `+${1 + Math.floor(l / 4)} посылки в день, +${l}% опыта со смен` },
];
export const petByKind = new Map(PETS.map((x) => [x.kind, x]));

/** Косметика для кота: покупаешь раз, носит одну вещь. Чисто для красоты и уважения хаты. */
export const CAT_WEAR: { id: string; name: string; emoji: string; butts: number; gold: number; minLevel: number }[] = [
  { id: 'cap', name: 'Кепочка-восьмиклинка', emoji: '🧢', butts: 30, gold: 0, minLevel: 1 },
  { id: 'bandana', name: 'Бандана', emoji: '🏴', butts: 40, gold: 0, minLevel: 2 },
  { id: 'bow', name: 'Бабочка на свадьбу', emoji: '🎀', butts: 50, gold: 0, minLevel: 3 },
  { id: 'murka', name: 'Наколка «МУРКА»', emoji: '🖋️', butts: 0, gold: 8, minLevel: 4 },
  { id: 'chain', name: 'Голда на шею', emoji: '📿', butts: 0, gold: 15, minLevel: 6 },
];

/** Команды собаке: учишь по одной за дрессировку (с 2-го уровня — каждые два уровня новая). */
export const DOG_TRICKS = [
  { id: 'sit', name: 'Сидеть', emoji: '🪑', level: 1 },
  { id: 'voice', name: 'Голос', emoji: '🗣️', level: 2 },
  { id: 'paw', name: 'Дай лапу', emoji: '🐾', level: 4 },
  { id: 'kum', name: 'Фас на кума', emoji: '👮', level: 6 },
  { id: 'dead', name: 'Умри', emoji: '💀', level: 8 },
];
/** Очки на выставке собак: уровень и выученные команды. */
export const dogScore = (level: number) => level * 10 + DOG_TRICKS.filter((t) => level >= t.level).length * 15;
export const DOG_SHOW = { prizes: [12, 6, 3] };
