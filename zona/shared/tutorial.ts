// Первые минуты новичка: короткие шаги со стрелкой на экране и подарком в конце.
// Шаг засчитывает сервер — по успешному действию нужного вида.

export interface TutStep {
  id: string;
  /** какие действия сервера двигают шаг */
  actions: string[];
  n: number;
  /** куда вести: вкладка, раздел и элементы на экране (data-tut), по порядку важности */
  tab: 'home' | 'zone' | 'work' | 'fight' | 'gear';
  seg?: [string, string];
  targets: string[];
  text: string;
  /** почему это важно — одной строкой */
  why: string;
  /** маленькая награда за шаг */
  /** level — дотянуть до этого уровня (первый босс открывается со 2-го) */
  reward: { money?: number; butts?: number; xp?: number; level?: number };
}

export const TUTORIAL: TutStep[] = [
  { id: 'look', actions: ['face'], n: 1, tab: 'home', seg: ['home', 'look'], targets: ['face'], text: 'Выбери себе лицо', why: 'Так тебя увидят в хате и во дворе', reward: { xp: 5 } },
  { id: 'butts', actions: ['butt'], n: 5, tab: 'zone', targets: ['butt'], text: 'Подбери бычки на земле', why: 'Бычки — валюта зоны', reward: { xp: 5 } },
  { id: 'trade', actions: ['trade'], n: 1, tab: 'zone', targets: ['trade', 'baryga'], text: 'Толкни бычки барыге', why: 'Барыга меняет бычки на деньги, энергию и золото', reward: { money: 50 } },
  { id: 'job', actions: ['job'], n: 1, tab: 'work', seg: ['work', 'jobs'], targets: ['job'], text: 'Отработай смену', why: 'Работа — деньги и опыт за энергию', reward: { xp: 10, level: 2 } },
  { id: 'fight', actions: ['boss', 'pvp'], n: 1, tab: 'fight', seg: ['fight', 'bosses'], targets: ['boss'], text: 'Разберись с первым боссом', why: 'Бои дают авторитет и шмот', reward: { money: 80 } },
  { id: 'cell', actions: ['furnish'], n: 1, tab: 'home', seg: ['home', 'cell'], targets: ['furnish'], text: 'Поставь первую вещь в хату', why: 'Хата даёт бонусы ко всему', reward: { xp: 10 } },
];

/** Подарок за всё обучение. */
export const TUT_GIFT = { gold: 15, money: 300, items: ['c_bandage', 'c_bandage', 'c_sand'] };

/** Сколько бычков насыпать на землю к шагу с бычками — чтобы не ждать. */
export const TUT_BUTTS = 6;
