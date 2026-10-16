// «Кто стукач?»: каждую неделю в клане (от 4 человек) тайно назначается стукач. Он знает о себе
// и может сливать куму общак — за каждый слив клан получает улику. Остальные голосуют, кого подозревают.
// Большинство на стукаче — раскрыт: общак вернут, угадавшим — золото. Большинство на невиновном — стукач победил.

export const SNITCH = {
  minMembers: 4,
  /** слив: доля общака, но не меньше */
  leakShare: 0.03,
  leakMin: 500,
  leakMax: 20_000,
  leaksPerDay: 1,
  /** награды */
  voterGold: 5,
  snitchWinGold: 15,
  caughtAuthority: 0.2,
};

export interface SnitchState {
  snitch: number;
  members: number[];
  votes: Record<string, number>;
  leaks: { at: number; amount: number; clue: string }[];
  resolved: { who: number; caught: boolean; at: number } | null;
}

/** Стукач недели: детерминированно от клана и недели. */
export function pickSnitch(members: number[], rnd: number): number {
  const sorted = [...members].sort((a, b) => a - b);
  return sorted[Math.floor(rnd * sorted.length) % sorted.length];
}

/** Улика о стукаче — по номеру слива разные. */
export function snitchClue(n: number, s: { name: string; level: number }, members: { level: number }[]): string {
  const levels = members.map((m) => m.level).sort((a, b) => a - b);
  const median = levels[Math.floor(levels.length / 2)];
  switch (n % 4) {
    case 0:
      return s.level >= median ? 'Слил кто-то из старших по уровню' : 'Слил кто-то из младших по уровню';
    case 1:
      return `Имя стукача начинается на «${s.name.trim()[0]?.toUpperCase() ?? '?'}»`;
    case 2:
      return s.level % 2 ? 'У стукача нечётный уровень' : 'У стукача чётный уровень';
    default:
      return `Длина имени стукача — ${s.name.trim().length} знаков`;
  }
}

/** Голосование решено? Большинство от всех участников на одном человеке. */
export function snitchMajority(votes: Record<string, number>, members: number): number | null {
  const count: Record<number, number> = {};
  for (const v of Object.values(votes)) count[v] = (count[v] ?? 0) + 1;
  for (const [id, n] of Object.entries(count)) if (n > members / 2) return Number(id);
  return null;
}
