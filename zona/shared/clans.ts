// Клан: хата клана с постройками, ежедневный босс клана и недельная война кланов.

export type HutId = 'kitchen' | 'gym' | 'cash' | 'lookout';

export const HUT: { id: HutId; name: string; emoji: string; per: string; bonus: { energy?: number; atk?: number; money?: number; def?: number } }[] = [
  { id: 'kitchen', name: 'Общая кухня', emoji: '🍲', per: '+3 к макс. энергии', bonus: { energy: 3 } },
  { id: 'gym', name: 'Качалка клана', emoji: '🏋️', per: '+2% к атаке', bonus: { atk: 2 } },
  { id: 'cash', name: 'Касса', emoji: '💰', per: '+2% к деньгам', bonus: { money: 2 } },
  { id: 'lookout', name: 'Стрёма', emoji: '👀', per: '+3% к защите', bonus: { def: 3 } },
];
export const hutById = new Map(HUT.map((h) => [h.id, h]));
export const HUT_RULES = { maxLevel: 5, cost: (lvl: number) => Math.round(15000 * Math.pow(lvl + 1, 1.7)) };

/** Босс клана: один на день, бьют все свои. Чем больше клан, тем толще. */
export const CLAN_BOSS = {
  name: 'Беспредельщики с соседнего барака',
  emoji: '🏚️',
  hpPerMember: 6000,
  hpPerLevel: 0.15,
  energy: 10,
  cooldownSec: 30,
  /** награда каждому, кто бил: деньги по доле урона, золото — всем */
  moneyPool: 40000,
  gold: 4,
  /** доля пула в общак клана */
  treasuryShare: 0.1,
};

/** Война кланов: очки за неделю. Топ-3 кланов в конце недели — золото каждому участнику. */
export const CLAN_WAR = {
  points: { pvpWin: 2, boss: 1, clanBoss: 25, worldHit: 1 } as Record<string, number>,
  rewards: [30, 20, 10],
  treasury: [50000, 25000, 10000],
};

/** Ринг: живые бои по очереди. Пока бой не начался — зрители ставят на бойцов. */
export const RING = {
  minLevel: 3,
  /** взнос за выход, в пайках: победитель забирает оба */
  feeRations: 1,
  delayMin: 2,
  minBet: 50,
  betPerLevel: 150,
  /** доля с тотализатора — на общак */
  cut: 0.1,
  winnerAuthority: 5,
  last: 6,
};

/** Грев посылкой: расходник или материалы из своих запасов. Деньги не шлются — чтобы не качать твинков. */
export const PARCEL = { perDay: 3, maxItems: 3, maxMats: 5, minLevel: 3 };

/** Цепочка кентов: подтянутый вырос — тебе золото, и тому, кто подтянул тебя, — доля. */
export const REFERRAL = {
  milestones: [
    { level: 5, gold: 20 },
    { level: 10, gold: 40 },
    { level: 20, gold: 80 },
  ],
  grandShare: 0.25,
};
