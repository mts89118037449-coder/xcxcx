// Репутация у трёх сил зоны и воровской общак.
// Братва и администрация тянут в разные стороны: что в плюс одним — в минус другим. Работяги ни с кем не ссорятся.
import type { Mast } from './term.ts';

export type FactionId = 'brat' | 'work' | 'admin';

export interface Faction {
  id: FactionId;
  name: string;
  emoji: string;
  who: string;
  /** звания по порогам репутации */
  ranks: string[];
  /** за что растёт */
  how: string;
  /** бонус за каждое звание, % */
  perRank: { key: 'pvpLoot' | 'jobMoney' | 'questMoney'; pct: number; label: string };
  /** что открывает третье звание */
  rank3: string;
  /** какая масть получает репутацию быстрее */
  mast: Mast[];
  /** кто теряет, когда эта растёт */
  rival?: FactionId;
}

export const REP_THRESHOLDS = [0, 60, 200, 500, 1100, 2400];

export const FACTIONS: Faction[] = [
  {
    id: 'brat', name: 'Братва', emoji: '🃏', who: 'sheet/cast/avtoritet',
    ranks: ['Чужой', 'Знакомый', 'Свой', 'Близкий', 'Уважаемый', 'Правая рука'],
    how: 'наезды, общак, грев в ШИЗО',
    perRank: { key: 'pvpLoot', pct: 4, label: 'добычи в наездах' },
    rank3: 'можно просить помощи из общака',
    mast: ['blat', 'otric'], rival: 'admin',
  },
  {
    id: 'work', name: 'Работяги', emoji: '⚒️', who: 'sheet/cast/worker',
    ranks: ['Новенький', 'Подсобник', 'Работник', 'Мастеровой', 'Бригадир', 'Золотые руки'],
    how: 'смены, промка, ремесло',
    perRank: { key: 'jobMoney', pct: 4, label: 'денег за смены' },
    rank3: 'вдвое больше материалов на промке',
    mast: ['muzhik'],
  },
  {
    id: 'admin', name: 'Администрация', emoji: '📋', who: 'sheet/cast/officer',
    ranks: ['Нарушитель', 'На заметке', 'Твёрдо стал', 'Поощряемый', 'Актив', 'Опора режима'],
    how: 'поручения, церковь, библиотека, клуб',
    perRank: { key: 'questMoney', pct: 5, label: 'денег за поручения' },
    rank3: 'дела скашивают срок на 15% быстрее',
    mast: ['kozel'], rival: 'brat',
  },
];

export const factionById = new Map(FACTIONS.map((f) => [f.id, f]));

export function repRank(rep: number): number {
  let r = 0;
  for (let i = 0; i < REP_THRESHOLDS.length; i++) if (rep >= REP_THRESHOLDS[i]) r = i;
  return r;
}

/** Множитель прироста для масти и доля, которую теряет соперник. */
export const REP_RULES = { mastMul: 1.5, rivalShare: 0.4 };

export const OBSHAK = {
  /** минимальный взнос в пайках */
  minGive: 2,
  /** репутации братвы за пайку */
  repPerRation: 1,
  /** помощь раз в сутки: столько паек, но не больше этой доли общака */
  askRations: 15,
  askShare: 0.05,
  askRepCost: 25,
  askCooldownH: 24,
  log: 12,
};
