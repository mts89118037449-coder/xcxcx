// Сюжет: главы с цепочкой шагов. Каждый шаг — счётчик действий (как в делах дня),
// за шаг — награда, за главу — ещё и звание/вещь. Всё, что игрок и так делает, двигает сюжет.
import type { TrackKind } from './content.ts';

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
];
