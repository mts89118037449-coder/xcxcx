// Сюжет: главы с цепочкой шагов. Каждый шаг — счётчик действий (как в делах дня),
// за шаг — награда, за главу — ещё и звание/вещь. Всё, что игрок и так делает, двигает сюжет.
import type { TrackKind } from './content.ts';
import type { Mast } from './term.ts';

export interface StoryStep {
  text: string;
  kind: TrackKind;
  n: number;
  reward: { money?: number; xp?: number; gold?: number; butts?: number; item?: string; gear?: string };
}

export interface StoryChapter {
  id: string;
  who: string; // кто ведёт главу
  name: string;
  intro: string;
  steps: StoryStep[];
  /** своя версия главы для каждой масти */
  variants?: Partial<Record<Mast, Omit<StoryChapter, 'id' | 'variants'>>>;
}

export const STORY: StoryChapter[] = [
  {
    id: 'first',
    who: 'sheet/cast/ushanka',
    name: 'Первая ходка',
    intro: 'Дед Митрич: «Новенький? Держись меня — научу, как тут выжить».',
    steps: [
      { text: 'Отработай смену на промке', kind: 'job', n: 1, reward: { money: 150, xp: 10 } },
      { text: 'Собери 5 бычков на зоне', kind: 'butts', n: 5, reward: { money: 100, butts: 5 } },
      { text: 'Разберись со случаем', kind: 'event', n: 1, reward: { xp: 15, item: 'c_bandage' } },
      { text: 'Поставь что-нибудь в хату', kind: 'furnish', n: 1, reward: { money: 300 } },
      { text: 'Победи в наезде', kind: 'pvpWin', n: 1, reward: { xp: 25, gold: 3 } },
      { text: 'Завали Крысу Шныря', kind: 'boss', n: 1, reward: { money: 600, gold: 5, item: 'c_sand' } },
    ],
  },
  {
    id: 'yard',
    who: 'sheet/cast/blatnoy',
    name: 'Свой среди своих',
    intro: 'Блатной: «Шустрый… Покажи, что ты не фраер — и будешь при деле».',
    steps: [
      { text: 'Прогуляйся по двору 2 раза', kind: 'yard', n: 2, reward: { xp: 20, butts: 5 } },
      { text: 'Сыграй в мини-игры 3 раза', kind: 'minigame', n: 3, reward: { money: 400 } },
      { text: 'Загляни в 3 чужие хаты', kind: 'visit', n: 3, reward: { xp: 25, item: 'c_insert' } },
      { text: 'Выполни 2 поручения', kind: 'quest', n: 2, reward: { money: 700, gold: 3 } },
      { text: 'Выиграй 3 наезда', kind: 'pvpWin', n: 3, reward: { xp: 60, gold: 5 } },
      { text: 'Сходи в церковь', kind: 'church', n: 1, reward: { item: 'c_holywater', xp: 20 } },
    ],
  },
  {
    id: 'run',
    who: 'sheet/cast/hermit',
    name: 'Подкоп',
    intro: 'Отшельник: «Под моей шконкой — начатый подкоп. Поможешь — расскажу, куда он ведёт».',
    steps: [
      { text: 'Собери 30 бычков — на ложку', kind: 'butts', n: 30, reward: { money: 800 } },
      { text: 'Сбеги хотя бы раз', kind: 'escape', n: 1, reward: { xp: 50, item: 'c_towel' } },
      { text: 'Реши 5 случаев', kind: 'event', n: 5, reward: { gold: 5, butts: 10 } },
      { text: 'Обустрой хату: 5 вещей', kind: 'furnish', n: 5, reward: { money: 2000 } },
      { text: 'Пройди в побеге 15 этапов суммарно', kind: 'escape', n: 15, reward: { xp: 150, gold: 10, item: 'c_photo' } },
      { text: 'Завали 5 боссов', kind: 'boss', n: 5, reward: { money: 5000, gold: 15, item: 'c_goldtooth' } },
    ],
  },
  {
    id: 'boss',
    who: 'sheet/cast/avtoritet',
    name: 'Смотрящий',
    intro: 'Авторитет: «Хочешь держать хату — держи и зону. Докажи».',
    steps: [
      { text: 'Выиграй 10 наездов', kind: 'pvpWin', n: 10, reward: { xp: 200, gold: 10 } },
      { text: 'Ударь бунт 10 раз', kind: 'worldHit', n: 10, reward: { money: 5000 } },
      { text: 'Сыграй в мини-игры 20 раз', kind: 'minigame', n: 20, reward: { gold: 10, item: 'c_bribe' } },
      { text: 'Выполни 10 поручений', kind: 'quest', n: 10, reward: { money: 10000, gold: 10 } },
      { text: 'Завали 20 боссов', kind: 'boss', n: 20, reward: { xp: 1000, gold: 30, item: 'c_icon' } },
    ],
  },
  {
    id: 'ink',
    who: 'sheet/cast/kolshik',
    name: 'Масть',
    intro: 'Кольщик: «Наколку надо заслужить. Покажи, кто ты есть, — и я набью тебе историю».',
    steps: [
      { text: 'Потренируйся 5 раз', kind: 'train', n: 5, reward: { money: 1500, xp: 40 } },
      { text: 'Реши 10 случаев', kind: 'event', n: 10, reward: { butts: 20, item: 'c_razor' } },
      { text: 'Сходи в церковь 3 раза', kind: 'church', n: 3, reward: { xp: 80, gold: 5 } },
      { text: 'Прогуляйся по двору 10 раз', kind: 'yard', n: 10, reward: { money: 3000, gear: 'charm_dogtag' } },
      { text: 'Выиграй 15 наездов', kind: 'pvpWin', n: 15, reward: { xp: 300, gold: 10, item: 'c_goldtooth' } },
      { text: 'Сыграй в мини-игры 15 раз', kind: 'minigame', n: 15, reward: { money: 8000, gear: 'cap_vdv' } },
    ],
  },
  {
    id: 'gypsy',
    who: 'sheet/cast/gypsy',
    name: 'Цыганское счастье',
    intro: 'Цыган: «Вижу, фартовый ты. Пойдёшь со мной — будешь при золоте. Или без зубов».',
    steps: [
      { text: 'Собери 60 бычков', kind: 'butts', n: 60, reward: { money: 4000, item: 'c_letter' } },
      { text: 'Загляни в 10 чужих хат', kind: 'visit', n: 10, reward: { xp: 150, butts: 15 } },
      { text: 'Сыграй в мини-игры 30 раз', kind: 'minigame', n: 30, reward: { gold: 15, gear: 'charm_fiksa' } },
      { text: 'Пройди в побеге 40 этапов суммарно', kind: 'escape', n: 40, reward: { xp: 500, item: 'c_photo' } },
      { text: 'Выполни 20 поручений', kind: 'quest', n: 20, reward: { money: 20000, gold: 10 } },
      { text: 'Завали 40 боссов', kind: 'boss', n: 40, reward: { xp: 2000, gold: 50, gear: 'body_crimson' } },
    ],
  },
  {
    id: 'path',
    who: 'sheet/cast/ushanka',
    name: 'Своя дорога',
    intro: 'Дед Митрич: «Пора решать, кто ты тут. Без масти — ни туда, ни сюда».',
    steps: [
      { text: 'Сходи в места зоны 5 раз', kind: 'place', n: 5, reward: { money: 5000, xp: 200 } },
      { text: 'Реши 15 случаев', kind: 'event', n: 15, reward: { gold: 10, item: 'c_bribe' } },
      { text: 'Выиграй 20 наездов', kind: 'pvpWin', n: 20, reward: { xp: 800, gold: 10 } },
      { text: 'Завали 50 боссов', kind: 'boss', n: 50, reward: { money: 30000, gold: 20 } },
    ],
    variants: {
      blat: {
        who: 'sheet/cast/avtoritet',
        name: 'Воровской ход',
        intro: 'Смотрящий: «Ты при понятиях. Теперь покажи, что и зону удержишь».',
        steps: [
          { text: 'Загони грев в ШИЗО и сходи по местам 6 раз', kind: 'place', n: 6, reward: { money: 5000, butts: 30 } },
          { text: 'Загляни в 15 чужих хат', kind: 'visit', n: 15, reward: { xp: 300, item: 'c_bribe' } },
          { text: 'Выиграй 25 наездов', kind: 'pvpWin', n: 25, reward: { gold: 15, item: 'c_goldtooth' } },
          { text: 'Реши 15 случаев', kind: 'event', n: 15, reward: { money: 15000, xp: 500 } },
          { text: 'Завали 50 боссов', kind: 'boss', n: 50, reward: { gold: 30, gear: 'charm_fiksa' } },
        ],
      },
      muzhik: {
        who: 'sheet/cast/worker',
        name: 'Золотые руки',
        intro: 'Бригадир: «Руки у тебя правильные. Покажешь класс — будешь бригадиром».',
        steps: [
          { text: 'Отработай 40 смен', kind: 'job', n: 40, reward: { money: 8000, xp: 300 } },
          { text: 'Поработай на промке и в местах 8 раз', kind: 'place', n: 8, reward: { money: 6000, item: 'c_insert' } },
          { text: 'Потрать 3000 энергии', kind: 'spend', n: 3000, reward: { gold: 15, xp: 500 } },
          { text: 'Потренируйся 20 раз', kind: 'train', n: 20, reward: { money: 15000 } },
          { text: 'Завали 50 боссов', kind: 'boss', n: 50, reward: { gold: 30, gear: 'cap_vdv' } },
        ],
      },
      kozel: {
        who: 'sheet/cast/officer',
        name: 'Совет отряда',
        intro: 'Начальник отряда: «Будешь в активе — будет и УДО. Но работать придётся».',
        steps: [
          { text: 'Выполни 15 поручений', kind: 'quest', n: 15, reward: { money: 10000, xp: 300 } },
          { text: 'Сходи в церковь 5 раз', kind: 'church', n: 5, reward: { gold: 10, item: 'c_icon' } },
          { text: 'Сходи по местам зоны 8 раз', kind: 'place', n: 8, reward: { money: 8000, butts: 30 } },
          { text: 'Реши 15 случаев', kind: 'event', n: 15, reward: { xp: 600, gold: 10 } },
          { text: 'Завали 50 боссов', kind: 'boss', n: 50, reward: { money: 30000, gold: 25 } },
        ],
      },
      otric: {
        who: 'sheet/cast/brute',
        name: 'Отрицалово',
        intro: 'Отрицала: «Режим ломает слабых. Покажи, что тебя не сломать».',
        steps: [
          { text: 'Пройди в побеге 30 этапов', kind: 'escape', n: 30, reward: { money: 8000, xp: 300 } },
          { text: 'Выиграй 30 наездов', kind: 'pvpWin', n: 30, reward: { gold: 15, item: 'c_goldtooth' } },
          { text: 'Потренируйся 20 раз', kind: 'train', n: 20, reward: { money: 12000 } },
          { text: 'Ударь бунт 20 раз', kind: 'worldHit', n: 20, reward: { xp: 600, gold: 10 } },
          { text: 'Завали 50 боссов', kind: 'boss', n: 50, reward: { gold: 30, gear: 'charm_fiksa' } },
        ],
      },
    },
  },
  {
    id: 'riot',
    who: 'sheet/cast/brute',
    name: 'Бунт на централе',
    intro: 'Качок: «На централе поднялись. Или ты с ними, или против — в стороне не отсидишься».',
    steps: [
      { text: 'Ударь бунт 25 раз', kind: 'worldHit', n: 25, reward: { money: 15000, xp: 500 } },
      { text: 'Выиграй 30 наездов', kind: 'pvpWin', n: 30, reward: { gold: 15 } },
      { text: 'Сходи в санчасть и церковь 5 раз', kind: 'church', n: 5, reward: { item: 'c_holywater', xp: 300 } },
      { text: 'Реши 20 случаев', kind: 'event', n: 20, reward: { money: 20000, item: 'c_bribe' } },
      { text: 'Завали 70 боссов', kind: 'boss', n: 70, reward: { gold: 40, xp: 2000 } },
    ],
  },
  {
    id: 'kharakter',
    who: 'sheet/cast/librarian',
    name: 'Характеристика',
    intro: 'Библиотекарь: «Хочешь на УДО — нужна бумага. Хорошая бумага пишется делами».',
    steps: [
      { text: 'Сходи по местам зоны 15 раз', kind: 'place', n: 15, reward: { money: 20000, xp: 600 } },
      { text: 'Выполни 25 поручений', kind: 'quest', n: 25, reward: { gold: 15, item: 'c_letter' } },
      { text: 'Отработай 80 смен', kind: 'job', n: 80, reward: { money: 30000 } },
      { text: 'Обустрой хату: ещё 5 вещей', kind: 'furnish', n: 5, reward: { xp: 1000, gold: 10 } },
      { text: 'Реши 25 случаев', kind: 'event', n: 25, reward: { gold: 25, item: 'c_photo' } },
    ],
  },
  {
    id: 'check',
    who: 'sheet/cast/lawyer',
    name: 'Прокурорская проверка',
    intro: 'Адвокат: «Едет прокурор. Кто-то из начальства сядет — главное, чтобы не ты».',
    steps: [
      { text: 'Потрать 6000 энергии', kind: 'spend', n: 6000, reward: { money: 30000, xp: 800 } },
      { text: 'Выиграй 40 наездов', kind: 'pvpWin', n: 40, reward: { gold: 20 } },
      { text: 'Сыграй в мини-игры 40 раз', kind: 'minigame', n: 40, reward: { money: 25000, item: 'c_bribe' } },
      { text: 'Загляни в 25 чужих хат', kind: 'visit', n: 25, reward: { xp: 1500, gold: 15 } },
      { text: 'Завали 100 боссов', kind: 'boss', n: 100, reward: { gold: 50, gear: 'body_crimson' } },
    ],
  },
  {
    id: 'legend',
    who: 'sheet/cast/oldman',
    name: 'Легенда зоны',
    intro: 'Старик: «О тебе уже байки травят. Осталось, чтобы их рассказывали и после тебя».',
    steps: [
      { text: 'Пройди в побеге 80 этапов', kind: 'escape', n: 80, reward: { money: 40000, xp: 1500 } },
      { text: 'Реши 40 случаев', kind: 'event', n: 40, reward: { gold: 25, item: 'c_icon' } },
      { text: 'Сходи по местам зоны 30 раз', kind: 'place', n: 30, reward: { money: 50000 } },
      { text: 'Ударь бунт 50 раз', kind: 'worldHit', n: 50, reward: { xp: 3000, gold: 20 } },
      { text: 'Завали 140 боссов', kind: 'boss', n: 140, reward: { gold: 60, item: 'c_goldtooth' } },
    ],
  },
  {
    id: 'bell',
    who: 'sheet/cast/priest',
    name: 'Последний звонок',
    intro: 'Отец Никодим: «Срок кончается, сын мой. Уйти надо так, чтобы не вернуться. Или вернуться — но человеком».',
    steps: [
      { text: 'Сходи в церковь 10 раз', kind: 'church', n: 10, reward: { money: 50000, xp: 2000 } },
      { text: 'Выполни 40 поручений', kind: 'quest', n: 40, reward: { gold: 30 } },
      { text: 'Выиграй 60 наездов', kind: 'pvpWin', n: 60, reward: { money: 80000, item: 'c_bribe' } },
      { text: 'Потрать 12000 энергии', kind: 'spend', n: 12000, reward: { xp: 5000, gold: 30 } },
      { text: 'Завали 200 боссов', kind: 'boss', n: 200, reward: { gold: 100, gear: 'body_crimson' } },
    ],
  },
];

/** Глава с учётом масти: у некоторых глав своя версия для каждого пути. */
export function chapterOf(ch: number, mast: Mast | null): StoryChapter | undefined {
  const c = STORY[ch];
  const v = c && mast ? c.variants?.[mast] : undefined;
  return v ? { ...c, ...v } : c;
}
