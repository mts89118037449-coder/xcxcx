// Хэллоуин на зоне (25 октября — 2 ноября): по локациям спрятаны тыквы, над двором летает призрак кота Васьки.
// Нашёл все пять — золото и бычки.
export const PUMPKINS = [
  { id: 'cell', where: 'в хате' },
  { id: 'zone', where: 'на зоне' },
  { id: 'yard', where: 'во дворе' },
  { id: 'work', where: 'на промке' },
  { id: 'canteen', where: 'в столовой' },
];
export const HALLOWEEN = { gold: 6, butts: 20 };

/** Идёт ли Хэллоуин (по Москве). */
export function isHalloween(now: number): boolean {
  const d = new Date(now + 3 * 3600_000);
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return (m === 9 && day >= 25) || (m === 10 && day <= 2);
}
