// Контрабанда: чай, сигареты, сахар, телефоны. Цены плавают каждый день (одинаково для всех),
// закупка через «кабур» дороже, сдача внутри дешевле — навар на разнице дней.
// Держишь товар — жди ночного шмона: прячь по местам, вертухай ищет.

export type GoodId = 'tea' | 'cigs' | 'sugar' | 'phone';

export interface Good {
  id: GoodId;
  name: string;
  emoji: string;
  base: number;
  /** размах колебаний, доля от базы */
  swing: number;
}

export const GOODS: Good[] = [
  { id: 'tea', name: 'Чай «Слон»', emoji: '🍵', base: 300, swing: 0.25 },
  { id: 'cigs', name: 'Блок сигарет', emoji: '🚬', base: 800, swing: 0.3 },
  { id: 'sugar', name: 'Сахар', emoji: '🧂', base: 150, swing: 0.2 },
  { id: 'phone', name: 'Мобила', emoji: '📱', base: 6000, swing: 0.45 },
];
export const goodById = new Map(GOODS.map((g) => [g.id, g]));

export const CONTRA = {
  minLevel: 6,
  /** сколько единиц всего можно держать */
  cap: 20,
  /** кабур: закупка дороже рынка, сдача дешевле */
  buyMul: 1.06,
  sellMul: 0.94,
  history: 14,
  /** шанс, что ночью придёт шмон, если что-то держишь, % */
  shmonChance: 35,
};

/** Детерминированный шум 0..1 от строки. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** Цена товара в день: две волны и немного шума, всегда положительная. */
export function goodPrice(g: Good, day: number): number {
  const wave = Math.sin(day / 3.1 + g.base) * 0.6 + Math.sin(day / 7.3 + g.base / 7) * 0.4;
  const noise = (hash01(`${g.id}:${day}`) - 0.5) * 0.5;
  return Math.max(1, Math.round(g.base * (1 + g.swing * (wave + noise) * 0.8)));
}

/** Тайники в хате: шанс, что вертухай там найдёт. */
export const HIDE_SPOTS: { id: string; name: string; emoji: string; find: number }[] = [
  { id: 'mattress', name: 'В матрасе', emoji: '🛏️', find: 0.5 },
  { id: 'vent', name: 'В вентиляции', emoji: '🌀', find: 0.25 },
  { id: 'book', name: 'В книге', emoji: '📕', find: 0.3 },
  { id: 'toilet', name: 'В бачке', emoji: '🚽', find: 0.4 },
  { id: 'wall', name: 'За плиткой', emoji: '🧱', find: 0.2 },
];

/** Будет ли шмон в эту ночь у игрока (одинаково весь день). */
export const shmonTonight = (pid: number, day: number) => hash01(`shmon:${pid}:${day}`) * 100 < CONTRA.shmonChance;
