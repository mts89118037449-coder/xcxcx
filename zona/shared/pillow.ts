// Подушечный бой в хате: три раунда «камень-ножницы-бумага» на подушках.
// Голова бьёт бок, бок пробивает блок, блок держит удар в голову.
export const PILLOW = { perDay: 3, winButts: 6, winAuthority: 1, prizes: [10, 6, 3] };

export type PillowMove = 'head' | 'side' | 'block';
export const PILLOW_MOVES: { id: PillowMove; label: string; emoji: string }[] = [
  { id: 'head', label: 'По голове', emoji: '🙆' },
  { id: 'side', label: 'В бок', emoji: '↪️' },
  { id: 'block', label: 'Блок', emoji: '🛡️' },
];
const BEATS: Record<PillowMove, PillowMove> = { head: 'side', side: 'block', block: 'head' };

/** 1 — мой раунд, -1 — его, 0 — ничья. */
export const pillowRound = (a: PillowMove, b: PillowMove): number => (a === b ? 0 : BEATS[a] === b ? 1 : -1);

export const PILLOW_TAUNTS = ['Перья тебе к лицу!', 'Это была подушка деда. Он не простит.', 'Пух не пахнет.', 'Ещё раз — и подушка твоя. В смысле, в тебе.'];
