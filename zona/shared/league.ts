// Лиги наездов: соперник по силе, очки за неделю, ступени лиг и награды по итогам недели.

export interface LeagueTier {
  id: string;
  name: string;
  emoji: string;
  /** очков за неделю, чтобы попасть */
  min: number;
  /** награда за неделю, закончившуюся в этой лиге */
  gold: number;
  money: number;
}

export const LEAGUE_TIERS: LeagueTier[] = [
  { id: 'muzhik', name: 'Мужики', emoji: '🥉', min: 0, gold: 0, money: 0 },
  { id: 'blatnoy', name: 'Блатные', emoji: '🥈', min: 100, gold: 8, money: 2000 },
  { id: 'avtoritet', name: 'Авторитеты', emoji: '🥇', min: 300, gold: 20, money: 6000 },
  { id: 'smotr', name: 'Смотрящие', emoji: '👑', min: 700, gold: 45, money: 15000 },
];

export const LEAGUE = {
  /** очков за победу над равным; сильнее — больше, слабее — меньше */
  win: 12,
  /** за поражение */
  loss: 4,
  /** за бота, когда живых соперников не нашлось */
  botShare: 0.5,
  /** соперник слабее этой доли твоей силы — очков нет: не фармим слабых */
  weakRatio: 0.7,
  /** множитель очков ограничен */
  ratioCap: [0.5, 1.6] as [number, number],
  /** подходящий соперник — по силе в этих пределах */
  band: [0.8, 1.25] as [number, number],
  /** одного и того же — не больше стольких раз в сутки */
  sameTargetPerDay: 2,
  /** доплата за место в недельной таблице */
  topGold: [50, 30, 20],
  /** титул первому месту */
  champTitle: 'title_champ',
  tableSize: 20,
};

/** Месть за наезд: сутки на ответ, одна попытка, очки лиги вдвойне, отжатое — назад. */
export const REVENGE = { hours: 24, leagueMul: 2, keep: 6 };

export function leagueTier(pts: number): LeagueTier {
  let t = LEAGUE_TIERS[0];
  for (const x of LEAGUE_TIERS) if (pts >= x.min) t = x;
  return t;
}

export function nextTier(pts: number): LeagueTier | null {
  return LEAGUE_TIERS.find((x) => x.min > pts) ?? null;
}

/** Сила бойца одной цифрой — для подбора соперника. */
export function powerOf(s: { atk: number; def: number; maxHp: number; crit: number }): number {
  return Math.round(s.atk * 2 + s.def * 1.6 + s.maxHp / 6 + s.crit * 2);
}

/** Очки лиги за бой: от соотношения сил (сила соперника / твоя). */
export function leaguePoints(win: boolean, ratio: number | null): number {
  if (!win) return -LEAGUE.loss;
  if (ratio === null) return Math.round(LEAGUE.win * LEAGUE.botShare);
  if (ratio < LEAGUE.weakRatio) return 0;
  return Math.round(LEAGUE.win * Math.max(LEAGUE.ratioCap[0], Math.min(LEAGUE.ratioCap[1], ratio)));
}
