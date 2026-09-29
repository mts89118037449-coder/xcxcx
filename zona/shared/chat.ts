// Чат барака: только готовые фразы — никакой модерации не нужно, а колорит сохраняется.

export interface Phrase {
  id: string;
  text: string;
}

export const PHRASE_GROUPS: { name: string; emoji: string; items: Phrase[] }[] = [
  {
    name: 'Привет', emoji: '👋',
    items: [
      { id: 'hi', text: 'Здорово, бродяги!' },
      { id: 'hi_night', text: 'Доброй ночи, арестанты. Мир вашему дому.' },
      { id: 'hi_new', text: 'Первоход. Подскажите, что тут как.' },
      { id: 'bye', text: 'Всем фарту, я на отбой.' },
    ],
  },
  {
    name: 'Дела', emoji: '🧰',
    items: [
      { id: 'boss_go', text: 'Иду на босса. Кто со мной?' },
      { id: 'riot_go', text: 'Бунт на централе! Все на удар!' },
      { id: 'ring_go', text: 'Выхожу на ринг. Ставьте на меня.' },
      { id: 'ring_who', text: 'Кто на ринг? Жду соперника.' },
      { id: 'market', text: 'Выставил хороший лот на барахолку, заглядывайте.' },
      { id: 'mats', text: 'Нужна проволока и тушь. Кто продаст?' },
      { id: 'obshak', text: 'Уделил на общак. Не забывайте про тех, кто в ШИЗО.' },
    ],
  },
  {
    name: 'Клан', emoji: '🏴',
    items: [
      { id: 'clan_boss', text: 'Братья, босс клана ждёт. Бьём!' },
      { id: 'clan_war', text: 'Неделя кончается — добиваем очки войны!' },
      { id: 'clan_look', text: 'Ищу клан. Работаю, не подведу.' },
      { id: 'clan_invite', text: 'Клан набирает людей. Вступайте.' },
      { id: 'clan_hut', text: 'Скидываемся в общак клана на постройку.' },
    ],
  },
  {
    name: 'Эмоции', emoji: '🎭',
    items: [
      { id: 'respect', text: 'Уважуха.' },
      { id: 'gg', text: 'Красиво отработал!' },
      { id: 'lol', text: 'Ха-ха, насмешил всю хату.' },
      { id: 'sad', text: 'Опять раздели в буру…' },
      { id: 'angry', text: 'Беспредел! Кто наехал — найду.' },
      { id: 'udo', text: 'Вышел по УДО! Иду на следующую ходку.' },
      { id: 'thanks', text: 'Благодарю, брат.' },
      { id: 'agree', text: 'По понятиям — всё верно.' },
    ],
  },
];

export const phraseById = new Map(PHRASE_GROUPS.flatMap((g) => g.items).map((p) => [p.id, p]));
export const CHAT = { cooldownSec: 8, perDay: 80, keep: 60 };
