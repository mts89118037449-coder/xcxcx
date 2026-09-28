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
