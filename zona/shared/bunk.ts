// Разговор у шконки: раз в сутки сокамерник подсаживается поговорить. Один вопрос — три ответа,
// у каждого своя награда. Вопрос дня одинаков для всех (по номеру дня), кто спрашивает — Лёха или Дед.

export type BunkWho = 'lyoha' | 'ded';

export interface BunkReward {
  butts?: number;
  xp?: number;
  authority?: number;
  energy?: number;
  /** доля от максимума здоровья */
  hp?: number;
}

export interface BunkTalk {
  who: BunkWho;
  line: string;
  options: { text: string; reply: string; reward: BunkReward }[];
}

export const BUNK_WHO: Record<BunkWho, { name: string; npc: string }> = {
  lyoha: { name: 'Лёха', npc: 'sheet/rival/3' },
  ded: { name: 'Дед', npc: 'sheet/cast/ushanka' },
};

export const BUNK: BunkTalk[] = [
  { who: 'lyoha', line: 'Слышь, а ты на воле кем был?', options: [
    { text: 'Водилой. Дальнобой', reply: 'О, уважаю! Значит, байки есть. Вечером расскажешь.', reward: { authority: 2 } },
    { text: 'Не твоё дело', reply: 'Понял, понял. Не лезу.', reward: { xp: 10 } },
    { text: 'Студентом. Недоучился', reply: 'Учёный, значит! Поможешь маляву написать — с меня бычки.', reward: { butts: 6 } },
  ] },
  { who: 'ded', line: 'Сынок, чаю хочешь? Настоящего, не веник.', options: [
    { text: 'Давай, отец. Спасибо', reply: 'Пей. Чай — он душу греет.', reward: { energy: 15 } },
    { text: 'Сам пей, мне некогда', reply: 'Эх, молодёжь… Ну беги.', reward: { xp: 8 } },
    { text: 'Давай я тебе сахару принесу', reply: 'Вот это по-людски. Запомню.', reward: { authority: 3 } },
  ] },
  { who: 'lyoha', line: 'Говорят, завтра шмон. Ты своё спрятал?', options: [
    { text: 'В матрасе, как все', reply: 'Как все — значит, найдут. Ладно, держи совет: под плинтус.', reward: { xp: 12 } },
    { text: 'Мне прятать нечего', reply: 'Чистый, значит. Ну-ну.', reward: { authority: 1 } },
    { text: 'Помоги спрятать — поделюсь', reply: 'Договорились. Я в доле!', reward: { butts: 5 } },
  ] },
  { who: 'ded', line: 'Я в шестьдесят восьмом сидел — вот тогда зона была! Рассказать?', options: [
    { text: 'Рассказывай, отец', reply: 'Слушай… (два часа спустя) Вот так и жили.', reward: { xp: 18 } },
    { text: 'В другой раз', reply: 'Другого раза может и не быть, сынок.', reward: { energy: 5 } },
    { text: 'Ты уже рассказывал', reply: 'Да? Ну, значит, запомнил. Молодец.', reward: { authority: 1 } },
  ] },
  { who: 'lyoha', line: 'Спина ноет. Помнёшь? Потом я тебе.', options: [
    { text: 'Ложись, помну', reply: 'О-о-о… золотые руки!', reward: { authority: 2 } },
    { text: 'Сначала ты мне', reply: 'Хитрый! Ладно, ложись.', reward: { hp: 0.2 } },
    { text: 'Сходи в баню', reply: 'Тоже дело. Пойдём вместе?', reward: { energy: 10 } },
  ] },
  { who: 'ded', line: 'Письмо пришло, а очки разбил. Прочтёшь?', options: [
    { text: 'Конечно. Давай', reply: 'Внучка пишет… Спасибо, сынок. На вот, угощайся.', reward: { butts: 8 } },
    { text: 'Попроси кого-нибудь ещё', reply: 'Да кого ж ещё…', reward: { xp: 5 } },
    { text: 'Прочту и ответ напишу', reply: 'Вот за это — земной поклон. Я тебя не забуду.', reward: { authority: 4 } },
  ] },
  { who: 'lyoha', line: 'Давай на отжимания поспорим? Кто больше!', options: [
    { text: 'Давай! На бычки', reply: 'Тридцать… тридцать один… Всё, ты победил!', reward: { butts: 5 } },
    { text: 'Неохота', reply: 'Слабак! Шучу, шучу.', reward: { energy: 8 } },
    { text: 'Только по-честному', reply: 'Ничья! Зато оба в форме.', reward: { xp: 12, hp: 0.1 } },
  ] },
  { who: 'ded', line: 'Знаешь, как отличить настоящего вора от фраера?', options: [
    { text: 'Как?', reply: 'Настоящий никогда не хвастает. Запомни.', reward: { xp: 14 } },
    { text: 'По наколкам', reply: 'Наколки и фраер набьёт. Смотри в глаза.', reward: { authority: 2 } },
    { text: 'Мне без разницы', reply: 'Разница будет, когда обманут.', reward: { energy: 5 } },
  ] },
  { who: 'lyoha', line: 'У меня день рождения сегодня. Никто не помнит…', options: [
    { text: 'С днём рождения, брат!', reply: 'Спасибо… Правда, спасибо.', reward: { authority: 3 } },
    { text: 'Держи бычок, отметим', reply: 'Вот это праздник!', reward: { xp: 10, energy: 5 } },
    { text: 'Ну и что?', reply: 'Да ничего… Проехали.', reward: { xp: 4 } },
  ] },
  { who: 'ded', line: 'Ночью не спится. Посиди со мной немного.', options: [
    { text: 'Посижу, отец', reply: 'Хорошо с тобой молчать.', reward: { hp: 0.15, authority: 1 } },
    { text: 'Мне вставать рано', reply: 'Иди, иди. Отдыхай.', reward: { energy: 12 } },
    { text: 'Давай в шахматы', reply: 'Мат! Ну ничего, научишься.', reward: { xp: 15 } },
  ] },
  { who: 'lyoha', line: 'Как думаешь, по УДО отпустят?', options: [
    { text: 'Отпустят, если не дурить', reply: 'Тогда буду паинькой. До весны.', reward: { authority: 2 } },
    { text: 'Не знаю, брат', reply: 'Вот и я не знаю…', reward: { xp: 8 } },
    { text: 'Пиши ходатайство, помогу', reply: 'Поможешь? Ты человек!', reward: { butts: 4, xp: 6 } },
  ] },
  { who: 'ded', line: 'Носки тебе связал. Шерстяные. Зима ведь.', options: [
    { text: 'Спасибо, отец!', reply: 'Носи на здоровье, не мёрзни.', reward: { hp: 0.2 } },
    { text: 'Сколько с меня?', reply: 'Обидеть хочешь? Бесплатно.', reward: { authority: 1, energy: 5 } },
    { text: 'Научи вязать', reply: 'Держи спицы. Петля, ещё петля…', reward: { xp: 16 } },
  ] },
];

/** Вопрос дня: один на всех. */
export function bunkOfDay(day: number): BunkTalk {
  return BUNK[((day % BUNK.length) + BUNK.length) % BUNK.length];
}
