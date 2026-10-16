// Стройка зоны: всем миром скидываются деньгами и материалами. Достроили — бонус всей зоне навсегда
// и открывается следующая стройка. Самые щедрые — в таблице прорабов.

export type BuildBonus = 'money' | 'hp' | 'atk' | 'jobXp' | 'energy' | 'def';

export interface Building {
  id: string;
  name: string;
  emoji: string;
  /** очков нужно всей зоной */
  goal: number;
  bonus: BuildBonus;
  value: number;
  text: string;
}

export const BUILDINGS: Building[] = [
  { id: 'canteen', name: 'Новая столовая', emoji: '🍲', goal: 300_000, bonus: 'money', value: 5, text: '+5% денег со всего' },
  { id: 'medbay', name: 'Медчасть', emoji: '🏥', goal: 600_000, bonus: 'hp', value: 5, text: '+5% здоровья' },
  { id: 'gym', name: 'Спортгородок', emoji: '🏋️', goal: 1_000_000, bonus: 'atk', value: 3, text: '+3% атаки' },
  { id: 'library', name: 'Библиотека', emoji: '📚', goal: 1_500_000, bonus: 'jobXp', value: 5, text: '+5% опыта со смен' },
  { id: 'bath', name: 'Баня', emoji: '🧖', goal: 2_200_000, bonus: 'energy', value: 5, text: '+5 к запасу энергии' },
  { id: 'chapel', name: 'Часовня', emoji: '⛪', goal: 3_000_000, bonus: 'def', value: 5, text: '+5% защиты' },
];

export const BUILD = {
  /** сколько очков даёт один материал */
  matPts: 400,
  /** взносы деньгами — такими шагами */
  money: [1_000, 10_000, 100_000],
  /** авторитет: +1 за каждые столько очков взноса */
  authorityPer: 2_000,
  /** титул «Прораб зоны» — за столько очков всего */
  titleAt: 50_000,
};

export interface BuildState {
  /** индекс текущей стройки; = BUILDINGS.length — всё построено */
  idx: number;
  pts: number;
  done: string[];
}

/** Суммарный бонус построенного. */
export function buildBonus(done: readonly string[], kind: BuildBonus): number {
  let v = 0;
  for (const b of BUILDINGS) if (b.bonus === kind && done.includes(b.id)) v += b.value;
  return v;
}

/** Добавить очки к стройке: может достроить одно или несколько зданий подряд. */
export function addBuildPts(s: BuildState, pts: number): string[] {
  const finished: string[] = [];
  s.pts += pts;
  while (s.idx < BUILDINGS.length && s.pts >= BUILDINGS[s.idx].goal) {
    s.pts -= BUILDINGS[s.idx].goal;
    s.done.push(BUILDINGS[s.idx].id);
    finished.push(BUILDINGS[s.idx].id);
    s.idx++;
  }
  if (s.idx >= BUILDINGS.length) s.pts = 0;
  return finished;
}
