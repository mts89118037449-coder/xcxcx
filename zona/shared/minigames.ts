// Мини-игры без энергии: у каждой дневной лимит — занятие есть всегда, но энергия важнее.

/** Очко (21) с блатным: ставка деньгами. */
export const CARDS = { perDay: 20, minBet: 50, betPerLevel: 200, payout: 2, blackjack: 2.5 };

/** Тараканьи бега: ставка бычками на одного из четырёх. Фаворит чаще приходит первым, но платит меньше. */
export const ROACHES = [
  { id: 'borka', name: 'Борька', color: '#7a3a14', chance: 0.4, payout: 2 },
  { id: 'shustry', name: 'Шустрый', color: '#3a2a1a', chance: 0.3, payout: 3 },
  { id: 'krivoy', name: 'Кривой', color: '#8a5a2a', chance: 0.2, payout: 4.5 },
  { id: 'general', name: 'Генерал', color: '#1a1a1a', chance: 0.1, payout: 8 },
];
export const RACE = { perDay: 15, bets: [3, 5, 10] };

/** Варить чифир: чем точнее момент, тем больше энергии. Немного — но бесплатно. */
export const BREW = { perDay: 4, cooldownMin: 20, minEnergy: 2, maxEnergy: 8 };

/** Кости с блатным: у кого больше на двух кубиках. Дубль при победе — втрое. */
export const DICE = { perDay: 20, minBet: 50, betPerLevel: 150, payout: 2, doublePayout: 3 };

/** Армрестлинг: кто больше раз нажмёт за отведённое время. Сила помогает. */
export const ARM = {
  perDay: 10,
  seconds: 6,
  maxTaps: 90, // больше физически не нажать — выше режем
  rivals: [
    { id: 'thin', name: 'Тощий', who: 'sheet/cast/thin', need: 28, xp: 6, butts: 3, authority: 0 },
    { id: 'worker', name: 'Работяга', who: 'sheet/cast/worker', need: 40, xp: 12, butts: 6, authority: 1 },
    { id: 'brute', name: 'Качок', who: 'sheet/cast/brute', need: 52, xp: 24, butts: 12, authority: 3 },
  ],
};

/** Заточка в мишень: три броска, очки по кольцам. */
export const DARTS = { perDay: 8, throws: 3, rings: [50, 25, 10, 5] as const, buttsPer: 10 };

/** Очки за бросок по точности (0 — мимо, 1 — в яблочко). */
export function dartPoints(acc: number): number {
  const a = Math.max(0, Math.min(1, acc));
  // пороги совпадают с кольцами мишени (радиусы 6, 14, 25, 36 из 46)
  return a > 0.87 ? DARTS.rings[0] : a > 0.69 ? DARTS.rings[1] : a > 0.45 ? DARTS.rings[2] : a > 0.21 ? DARTS.rings[3] : 0;
}

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];

export function cardValue(hand: string[]): number {
  let sum = 0;
  let aces = 0;
  for (const c of hand) {
    const r = c.slice(0, -1);
    if (r === 'Т') {
      aces++;
      sum += 11;
    } else if (r === 'В' || r === 'Д' || r === 'К') sum += 10;
    else sum += Number(r);
  }
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces--;
  }
  return sum;
}
