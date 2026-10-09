// Бараки: шесть бараков зоны, за каждый неделю бьются кланы — набегами копят влияние.
// Кто больше набрал за неделю, тот держит барак всю следующую: его люди получают бонус барака.

export type BarrackBonus = 'money' | 'jobXp' | 'energy' | 'atk' | 'def' | 'hp';

export interface Barrack {
  id: string;
  name: string;
  emoji: string;
  bonus: BarrackBonus;
  value: number;
  text: string;
}

export const BARRACKS: Barrack[] = [
  { id: 'b1', name: 'Первый барак', emoji: '1️⃣', bonus: 'money', value: 5, text: '+5% денег' },
  { id: 'b2', name: 'Второй барак', emoji: '2️⃣', bonus: 'jobXp', value: 7, text: '+7% опыта со смен' },
  { id: 'b3', name: 'Третий барак', emoji: '3️⃣', bonus: 'energy', value: 10, text: '+10 к энергии' },
  { id: 'b4', name: 'Четвёртый барак', emoji: '4️⃣', bonus: 'atk', value: 4, text: '+4% атаки' },
  { id: 'b5', name: 'Пятый барак', emoji: '5️⃣', bonus: 'def', value: 5, text: '+5% защиты' },
  { id: 'b6', name: 'Шестой барак', emoji: '6️⃣', bonus: 'hp', value: 5, text: '+5% здоровья' },
];
export const barrackById = new Map(BARRACKS.map((b) => [b.id, b]));

export const BARRACK = { minLevel: 5, energy: 15, perDay: 8 };

/** Влияние за один набег: сила, немного удачи. */
export const raidPts = (str: number, roll: number) => 5 + Math.floor(str / 10) + Math.floor(roll * 6);

/** Кто держит каждый барак по итогам недели: id клана или нет. */
export function barrackOwners(table: Record<string, Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of BARRACKS) {
    const row = Object.entries(table[b.id] ?? {}).sort((x, y) => y[1] - x[1])[0];
    if (row && row[1] > 0) out[b.id] = Number(row[0]);
  }
  return out;
}

/** Сумма бонусов бараков клана. */
export function barrackBonus(owners: Record<string, number>, clanId: number | null, kind: BarrackBonus): number {
  if (!clanId) return 0;
  let v = 0;
  for (const b of BARRACKS) if (b.bonus === kind && owners[b.id] === clanId) v += b.value;
  return v;
}
