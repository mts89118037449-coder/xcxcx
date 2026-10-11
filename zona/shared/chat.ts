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

/** Системные фразы: пишет сама игра от имени игрока, в списке выбора их нет. */
/** Стикеры: портрет героя игры и его коронная фраза. В чате — крупно. */
export const STICKERS: { id: string; who: string; text: string }[] = [
  { id: 'st_ded', who: 'sheet/cast/ushanka', text: 'Не верь, не бойся, не проси' },
  { id: 'st_kum', who: 'sheet/cast/officer', text: 'Я всё вижу 👀' },
  { id: 'st_jora', who: 'sheet/cast/cook', text: 'Котлеты! Не спрашивай' },
  { id: 'st_amba', who: 'sheet/rival/1', text: 'Чё вылупился?' },
  { id: 'st_gluhar', who: 'sheet/boss/b_gluhar', text: 'Колись!' },
  { id: 'st_stream', who: 'sheet/boss/b_streamer', text: 'Ставьте лайки!' },
  { id: 'st_lyoha', who: 'sheet/rival/3', text: 'Спорим, не угадаешь?' },
  { id: 'st_priest', who: 'sheet/cast/priest', text: 'Прости им, ибо не ведают' },
];
export const stickerById = new Map(STICKERS.map((s) => [s.id, s]));
/** Реакции на сообщения: по одной каждого вида от игрока. */
export const REACTIONS = ['😂', '👍', '🔥', '💀', '🤝'];

export const SYSTEM_PHRASES: Phrase[] = [{ id: 'riot_call', text: '🔥 Братва, хватит терпеть! Поднимаем бунт — голосуйте на экране «Зона»!' }];

export const phraseById = new Map([...PHRASE_GROUPS.flatMap((g) => g.items), ...SYSTEM_PHRASES, ...STICKERS.map((s) => ({ id: s.id, text: `🖼️ ${s.text}` }))].map((p) => [p.id, p]));
export const CHAT = { cooldownSec: 8, perDay: 80, keep: 60 };
