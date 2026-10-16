// Свиданка с роднёй: раз в неделю приезжает мать (а после свадьбы с заочницей — через неделю жена).
// Три реплики, на каждую — ответ. От тепла разговора зависит передача и бафф на сутки: опыт и деньги со смен.

export type Visitor = 'mom' | 'wife';

export const FAMILY = { minLevel: 3, buffH: 24 };

export interface FamOption {
  text: string;
  mood: number;
}
export interface FamRound {
  line: string;
  options: FamOption[];
}

export const FAMILY_WHO: Record<Visitor, { name: string; emoji: string; hello: string }> = {
  mom: { name: 'Мама', emoji: '👵', hello: 'Сыночек… похудел-то как. Садись, я пирожков привезла.' },
  wife: { name: 'Жена', emoji: '👩', hello: 'Ну здравствуй, муж. Соскучилась — сил нет.' },
};

export const FAMILY_ROUNDS: Record<Visitor, FamRound[]> = {
  mom: [
    { line: 'Тебя там не обижают? Ты мне правду скажи.', options: [{ text: 'Всё хорошо, мам. Не переживай', mood: 2 }, { text: 'Бывает всякое. Справляюсь', mood: 1 }, { text: 'Не твоё это дело', mood: -2 }] },
    { line: 'Соседка спрашивала, когда выйдешь. Что ей сказать?', options: [{ text: 'Скажи — скоро, работаю на УДО', mood: 2 }, { text: 'Пусть своих детей считает', mood: 0 }, { text: 'Не знаю, мам. Не жди', mood: -1 }] },
    { line: 'Отец твой… болеет он. Но гордый, не приедет.', options: [{ text: 'Передай, что я его люблю', mood: 2 }, { text: 'Пусть лечится, я напишу ему', mood: 1 }, { text: 'Сам виноват', mood: -2 }] },
    { line: 'Денег немного собрала. Может, тебе на ларёк?', options: [{ text: 'Оставь себе, мам. Я сам', mood: 2 }, { text: 'Спасибо. Отдам, как выйду', mood: 1 }, { text: 'Мало как-то', mood: -2 }] },
    { line: 'Ты в церковь там ходишь? Я за тебя свечку ставлю.', options: [{ text: 'Хожу. И за тебя молюсь', mood: 2 }, { text: 'Иногда', mood: 1 }, { text: 'Брось ты это', mood: -1 }] },
    { line: 'Котлеты тёплые ещё. Ешь при мне, я посмотрю.', options: [{ text: 'Ем! Как в детстве', mood: 2 }, { text: 'Потом, с ребятами поделюсь', mood: 1 }, { text: 'Не голодный я', mood: -1 }] },
  ],
  wife: [
    { line: 'Я квартиру присмотрела. Будем жить вместе, когда выйдешь?', options: [{ text: 'Конечно. Только тебя и жду', mood: 2 }, { text: 'Сначала выйти надо', mood: 0 }, { text: 'Рано об этом', mood: -2 }] },
    { line: 'Тут один на работе клеится. Я его отшила, не волнуйся.', options: [{ text: 'Верю тебе', mood: 2 }, { text: 'Кто такой? Имя скажи', mood: -1 }, { text: 'Правильно сделала', mood: 1 }] },
    { line: 'Испекла твой любимый торт. Половину на проходной съели.', options: [{ text: 'Ха! Главное — ты приехала', mood: 2 }, { text: 'Надо было жаловаться', mood: 0 }, { text: 'Вечно ты так', mood: -2 }] },
    { line: 'Мне снилось, что ты вышел и мы на море.', options: [{ text: 'Так и будет. Обещаю', mood: 2 }, { text: 'Море подождёт', mood: 0 }, { text: 'Сны — ерунда', mood: -1 }] },
    { line: 'Ты там не связался с кем не надо?', options: [{ text: 'Держусь в стороне. Ради тебя', mood: 2 }, { text: 'Тут без этого никак', mood: 0 }, { text: 'Не лезь', mood: -2 }] },
  ],
};

export interface FamOutcome {
  title: string;
  text: string;
  buffPct: number;
  butts: number;
  items: number;
  rations: number;
}

/** Чем кончилась свиданка. */
export function familyOutcome(mood: number): FamOutcome {
  if (mood >= 5) return { title: 'Тёплое прощание', text: 'Обнялись у двери. Ушёл с полными руками и лёгким сердцем.', buffPct: 15, butts: 20, items: 2, rations: 3 };
  if (mood >= 2) return { title: 'Хорошо поговорили', text: 'Посидели, попили чаю. На душе спокойно.', buffPct: 10, butts: 12, items: 1, rations: 2 };
  if (mood >= 0) return { title: 'Скомканно вышло', text: 'Говорили о пустом. Время пролетело.', buffPct: 5, butts: 6, items: 0, rations: 1 };
  return { title: 'Ушла в слезах', text: 'Не нашёл нужных слов. Передачу оставили на проходной.', buffPct: 0, butts: 3, items: 0, rations: 0 };
}
