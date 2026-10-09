// Суд и апелляция: раз за ходку можно подать на пересмотр. Сначала собираешь доводы —
// каждый что-то стоит или требует репутации, — потом заседание: скостят срок или добавят.

export type ArgId = 'lawyer' | 'work' | 'admin' | 'witness' | 'church' | 'medic';

export interface CourtArg {
  id: ArgId;
  name: string;
  emoji: string;
  /** прибавка к шансу, % */
  pct: number;
  need: string;
}

export const COURT = {
  minLevel: 8,
  /** с каким сроком вообще есть смысл подавать, дней */
  minTerm: 5,
  basePct: 15,
  maxPct: 90,
  /** удача: скостят столько процентов от оставшегося срока */
  cut: [20, 40] as [number, number],
  /** провал: добавят столько процентов от полного срока ходки */
  add: 10,
  lawyerPerLevel: 3000,
  witnessButts: 20,
  witnessAuthorityPerLevel: 40,
  medicGold: 20,
  repRank: 2,
};

export const COURT_ARGS: CourtArg[] = [
  { id: 'lawyer', name: 'Адвокат', emoji: '💼', pct: 20, need: `${COURT.lawyerPerLevel} ₽ за уровень` },
  { id: 'work', name: 'Характеристика с промки', emoji: '⚒️', pct: 20, need: `звание у работяг ${COURT.repRank}+` },
  { id: 'admin', name: 'Ходатайство администрации', emoji: '📋', pct: 20, need: `звание у администрации ${COURT.repRank}+` },
  { id: 'witness', name: 'Свидетели из барака', emoji: '👥', pct: 15, need: `${COURT.witnessButts} 🚬 и авторитет ${COURT.witnessAuthorityPerLevel}×уровень` },
  { id: 'church', name: 'Справка от батюшки', emoji: '⛪', pct: 10, need: 'благословение в церкви' },
  { id: 'medic', name: 'Справка из санчасти', emoji: '🩺', pct: 15, need: `${COURT.medicGold} 🪙` },
];
export const courtArgById = new Map(COURT_ARGS.map((a) => [a.id, a]));

export const courtChance = (args: readonly string[]) =>
  Math.min(COURT.maxPct, COURT.basePct + args.reduce((s, id) => s + (courtArgById.get(id as ArgId)?.pct ?? 0), 0));
