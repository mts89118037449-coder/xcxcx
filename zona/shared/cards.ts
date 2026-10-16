// Карточки «Типажи зоны»: раз в день бесплатная пачка, дубли можно дарить другим игрокам.
// Собрал всех — золото и уважение коллекционеров.
export type Rarity = 'common' | 'rare' | 'epic' | 'legend';

export interface ZoneCard {
  id: string;
  name: string;
  who: string;
  rarity: Rarity;
  quote: string;
}

export const ZONE_CARDS: ZoneCard[] = [
  { id: 'k_ded', name: 'Дед Митрич', who: 'sheet/cast/ushanka', rarity: 'common', quote: 'Не верь, не бойся, не проси' },
  { id: 'k_lyoha', name: 'Лёха-напёрсточник', who: 'sheet/rival/3', rarity: 'common', quote: 'Шарик тут. Наверное' },
  { id: 'k_amba', name: 'Амбал', who: 'sheet/rival/1', rarity: 'common', quote: 'Чё вылупился?' },
  { id: 'k_cook', name: 'Повар Жора', who: 'sheet/cast/cook', rarity: 'common', quote: 'Котлеты не обсуждаются' },
  { id: 'k_thin', name: 'Шнырь', who: 'sheet/cast/thin', rarity: 'common', quote: 'Я ничего не видел. Почти' },
  { id: 'k_young', name: 'Первоход', who: 'sheet/cast/youngster', rarity: 'common', quote: 'А тут кормят?' },
  { id: 'k_doctor', name: 'Лепила', who: 'sheet/cast/doctor', rarity: 'rare', quote: 'Зелёнка лечит всё' },
  { id: 'k_priest', name: 'Отец Никодим', who: 'sheet/cast/priest', rarity: 'rare', quote: 'Грехи — до 18:00' },
  { id: 'k_kolshik', name: 'Кольщик', who: 'sheet/cast/kolshik', rarity: 'rare', quote: 'Не дёргайся — «Мать» не дорисую' },
  { id: 'k_gypsy', name: 'Цыган', who: 'sheet/cast/gypsy', rarity: 'rare', quote: 'Слух — товар' },
  { id: 'k_officer', name: 'Кум', who: 'sheet/cast/officer', rarity: 'epic', quote: 'Я всё вижу' },
  { id: 'k_blatnoy', name: 'Блатной', who: 'sheet/cast/blatnoy', rarity: 'epic', quote: 'Живу по понятиям' },
  { id: 'k_omon', name: 'ОМОН', who: 'sheet/cast/omon', rarity: 'epic', quote: 'Руки на стену' },
  { id: 'k_gluhar', name: 'Следователь Глухарь', who: 'sheet/boss/b_gluhar', rarity: 'legend', quote: 'Колись!' },
  { id: 'k_stream', name: 'Стримыч', who: 'sheet/boss/b_streamer', rarity: 'legend', quote: 'Ставьте лайки' },
  { id: 'k_avtoritet', name: 'Авторитет', who: 'sheet/cast/avtoritet', rarity: 'legend', quote: 'Слово — закон' },
];
export const cardById = new Map(ZONE_CARDS.map((c) => [c.id, c]));
export const RARITY_W: Record<Rarity, number> = { common: 60, rare: 25, epic: 11, legend: 4 };
export const RARITY_NAME: Record<Rarity, string> = { common: 'обычная', rare: 'редкая', epic: 'эпическая', legend: 'легенда' };
export const CARD_SET = { gold: 20 };
