// Выборы смотрящего: неделю идут выборы, голос весит по авторитету (корень — чтобы один богач всё не решал).
// Победитель держит зону всю следующую неделю: ставит налог со смен в стройку зоны (себе десятая доля),
// раз в день оглашает указ и раз за неделю милует одного — минус дни срока.

export const ELECT = {
  nominateLevel: 12,
  nominateAuthority: 300,
  nominateFee: 5000,
  voteLevel: 3,
  maxTax: 5,
  salaryShare: 0.1,
  pardonDays: 2,
  gold: 30,
};

export const voteWeight = (authority: number) => Math.max(1, Math.round(Math.sqrt(Math.max(0, authority)) / 3));

export const DECREES: { id: string; text: string }[] = [
  { id: 'quiet', text: '🤫 Неделя тишины: без беспредела, новичков не трогать' },
  { id: 'build', text: '🏗️ Общак — святое. Все скидываемся на стройку' },
  { id: 'clans', text: '⚔️ Кланы, делите бараки по-честному' },
  { id: 'respect', text: '🤝 Уважай соседа — и тебя уважат' },
  { id: 'grev', text: '📦 Не забываем греть тех, кто в ШИЗО' },
  { id: 'work', text: '⚒️ Кто работает — тот ест. Все на промку' },
  { id: 'party', text: '🎉 Сегодня гуляем: нарды, домино, чифир' },
];

export interface ElectRow {
  name: string;
  face: number | null;
  votes: number;
  voters: number;
}

export interface SmotrState {
  id: number;
  name: string;
  face: number | null;
  week: number;
  tax: number;
  decree: string | null;
  decreeDay: number;
  pardoned: number | null;
  collected: number;
  salary: number;
}
