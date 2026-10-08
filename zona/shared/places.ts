// Места зоны: баня, столовая, библиотека, клуб, свиданка, промка, ШИЗО.
// У каждого места — хозяин и несколько занятий со своим откатом. Исход — жребий, как у случаев.
import type { Need, Outcome } from './events.ts';
import type { FactionId } from './factions.ts';

export type PlaceId = 'bath' | 'canteen' | 'library' | 'club' | 'visits' | 'factory' | 'shizo' | 'logging' | 'kamera' | 'plac';

export interface PlaceActivity {
  id: string;
  icon: string;
  label: string;
  hint: string;
  /** деньги — в пайках, как у случаев */
  cost?: { money?: number; butts?: number; gold?: number; energy?: number };
  cdMin: number;
  need?: Need;
  outcomes: Outcome[];
}

export interface PlaceDef {
  id: PlaceId;
  name: string;
  icon: string;
  minLevel: number;
  who: string;
  host: string;
  greet: string;
  activities: PlaceActivity[];
  /** место только в этой колонии */
  colony?: import('./colonies.ts').ColonyId;
}

const H = 60;

export const PLACES: PlaceDef[] = [
  {
    id: 'logging', name: 'Лесоповал', icon: '🪓', minLevel: 1, who: 'sheet/cast/worker', host: 'Бригадир Тайга', colony: 'north',
    greet: 'Норма — сорок кубов. Кто не выполнил — ночует у костра.',
    activities: [
      { id: 'saw', icon: '🪚', label: 'Валить лес', hint: 'тяжело, но платят', cost: { energy: 15 }, cdMin: 2 * H, outcomes: [{ w: 8, text: 'Сосна легла, куда надо. Бригадир доволен.', money: 3, xp: 8 }, { w: 2, text: 'Пила заела, норму не сделал.', money: 1, hp: -0.05 }] },
      { id: 'stack', icon: '🪵', label: 'Складывать штабель', hint: 'дерево и опыт', cost: { energy: 8 }, cdMin: 2 * H, outcomes: [{ w: 1, text: 'Ровный штабель. Пару досок прибрал себе.', xp: 10 }] },
      { id: 'fire', icon: '🔥', label: 'Погреться у костра', hint: 'лечит, бесплатно', cdMin: 4 * H, outcomes: [{ w: 8, text: 'Отогрелся, кружку кипятка налили.', hp: 0.3, energy: 10 }, { w: 2, text: 'Дым в глаза, но тепло.', hp: 0.15 }] },
      { id: 'top', icon: '🌲', label: 'Верхолаз', hint: 'лезть на кедр за шишкой', need: { level: 8 }, cdMin: 8 * H, outcomes: [{ w: 6, text: 'Мешок кедровых шишек — барыга возьмёт!', money: 4, authority: 2 }, { w: 4, text: 'Сорвался с сука. Повезло, что в сугроб.', hp: -0.2, xp: 6 }] },
    ],
  },
  {
    id: 'kamera', name: 'Камера', icon: '🗝️', minLevel: 1, who: 'sheet/cast/blatnoy', host: 'Смотрящий хаты', colony: 'krytka',
    greet: 'Заходи, присаживайся. Тут все на виду — и все друг про друга знают.',
    activities: [
      { id: 'road', icon: '🧵', label: 'Гнать коня', hint: 'дорога между камерами', cdMin: 3 * H, outcomes: [{ w: 6, text: 'Малява дошла, обратно — грев.', item: true, xp: 6 }, { w: 4, text: 'Коня перехватил продольный.', xp: 3 }] },
      { id: 'talk', icon: '🗣️', label: 'Рассказать за жизнь', hint: 'авторитет', cdMin: 4 * H, outcomes: [{ w: 7, text: 'Слушали молча. Уважают.', authority: 3 }, { w: 3, text: 'Перебили: «Не гони».', authority: -1 }] },
      { id: 'cards', icon: '🃏', label: 'Партейка под нары', hint: 'на бычки', cost: { butts: 5 }, cdMin: 3 * H, outcomes: [{ w: 5, text: 'Поднял банк.', butts: 12, authority: 1 }, { w: 5, text: 'Проигрался в пух.', butts: 0 }] },
      { id: 'quiet', icon: '😶', label: 'Отлежаться', hint: 'лечит', cdMin: 4 * H, outcomes: [{ w: 1, text: 'Тишина. Даже вертухай не стучит.', hp: 0.35 }] },
    ],
  },
  {
    id: 'plac', name: 'Плац', icon: '🚩', minLevel: 1, who: 'sheet/cast/officer', host: 'Дневальный СДП', colony: 'red',
    greet: 'Шаг чеканить! Здесь порядок, а не ваш «понятийный» базар.',
    activities: [
      { id: 'drill', icon: '🥾', label: 'Строевая', hint: 'опыт, уважение начальства', cost: { energy: 8 }, cdMin: 2 * H, outcomes: [{ w: 1, text: 'Отмаршировал. Начальник отряда кивнул.', xp: 10 }] },
      { id: 'paper', icon: '📰', label: 'Стенгазета', hint: 'деньги, почёт у администрации', cdMin: 6 * H, outcomes: [{ w: 7, text: 'Повесили на видном месте. Премия!', money: 2, xp: 6 }, { w: 3, text: 'Нашли ошибку в лозунге. Переписывай.', xp: 3 }] },
      { id: 'report', icon: '📝', label: 'Доложить дневальному', hint: 'администрации — да, братве — нет', cdMin: 8 * H, outcomes: [{ w: 1, text: 'Доклад принят. Братва косо смотрит.', xp: 8, authority: -2 }] },
      { id: 'sport', icon: '🏋️', label: 'Зарядка на плацу', hint: 'бодрость', cdMin: 4 * H, outcomes: [{ w: 1, text: 'Сто приседаний под счёт. Бодрит!', energy: 15, hp: 0.1 }] },
    ],
  },
  {
    id: 'canteen', name: 'Столовая', icon: '🍲', minLevel: 1, who: 'sheet/cast/cook', host: 'Повар Жора',
    greet: 'Баланда сегодня густая. Чего стоишь — миску бери.',
    activities: [
      { id: 'meal', icon: '🥣', label: 'Пайка', hint: 'бесплатно, силы', cdMin: 6 * H, outcomes: [{ w: 8, text: 'Каша с тушёнкой — повезло.', energy: 20 }, { w: 2, text: 'Баланда, как вода. Ну хоть горячая.', energy: 10 }] },
      { id: 'extra', icon: '🍖', label: 'Добавка', hint: 'котлета с офицерского', cost: { money: 1 }, cdMin: 6 * H, outcomes: [{ w: 9, text: 'Жора положил двойную. Сытно!', energy: 35, hp: 0.15 }, { w: 1, text: 'Котлета оказалась с сюрпризом.', energy: 15, hp: -0.1 }] },
      { id: 'kitchen', icon: '🔪', label: 'Помочь на кухне', hint: 'чистить картошку', cost: { energy: 10 }, cdMin: 3 * H, outcomes: [{ w: 7, text: 'Ведро картошки. Жора сунул денег и сала.', money: 1.5, xp: 6 }, { w: 3, text: 'Порезался, но Жора не обидел.', money: 1, hp: -0.05 }] },
      { id: 'blat_table', icon: '🪑', label: 'Сесть за блатной стол', hint: 'только для своих', need: { authority: 40 }, cdMin: 6 * H, outcomes: [{ w: 7, text: 'Подвинулись. Разговоры о делах — ты в курсе.', authority: 3, xp: 8 }, { w: 3, text: '«Рано тебе». Пришлось пересесть.', authority: -1 }] },
    ],
  },
  {
    id: 'bath', name: 'Баня', icon: '🧖', minLevel: 1, who: 'sheet/cast/ushanka', host: 'Банщик Митрич',
    greet: 'Пар сегодня хороший. Шайку бери, мыло своё.',
    activities: [
      { id: 'steam', icon: '♨️', label: 'Попариться', hint: 'лечит и бодрит', cdMin: 4 * H, outcomes: [{ w: 1, text: 'Пар до костей. Как заново родился.', hp: 0.35, energy: 10 }] },
      { id: 'broom', icon: '🌿', label: 'Веник у Митрича', hint: 'дубовый, настоящий', cost: { butts: 4 }, cdMin: 6 * H, outcomes: [{ w: 1, text: 'Митрич отхлестал по всем правилам. Лёгкость в теле.', hp: 0.7, energy: 35 }] },
      { id: 'back', icon: '🤝', label: 'Потереть спину авторитету', hint: 'связи через мочалку', cdMin: 4 * H, outcomes: [{ w: 6, text: 'Разговорились. Авторитет запомнил тебя.', authority: 2, xp: 5 }, { w: 4, text: '«Слабо трёшь». Отогнали.', xp: 2 }] },
      { id: 'wash', icon: '👕', label: 'Постирать робу', hint: 'чистый — уважаемый', cdMin: 8 * H, outcomes: [{ w: 8, text: 'Роба как новая.', xp: 6, authority: 1 }, { w: 2, text: 'Робу стащили, пока сохла. Нашёл в предбаннике.', xp: 3 }] },
    ],
  },
  {
    id: 'library', name: 'Библиотека', icon: '📚', minLevel: 3, who: 'sheet/cast/librarian', host: 'Библиотекарь Семёныч',
    greet: 'Тише. Здесь единственное место на зоне, где можно подумать.',
    activities: [
      { id: 'read', icon: '📖', label: 'Почитать', hint: 'опыт', cdMin: 2 * H, outcomes: [{ w: 5, text: 'Дюма. Граф Монте-Кристо тоже сидел.', xp: 18 }, { w: 5, text: 'Справочник слесаря. Скучно, но полезно.', xp: 12 }] },
      { id: 'law', icon: '⚖️', label: 'Писать ходатайство', hint: 'может скостить срок', cdMin: 12 * H, outcomes: [{ w: 4, text: 'Ходатайство приняли! Срок скостили.', term: 1.5, xp: 10 }, { w: 6, text: 'Отказ по формальным основаниям. Опыт — тоже результат.', xp: 12 }] },
      { id: 'order', icon: '📦', label: 'Книга под заказ', hint: 'в корешке бывает всякое', cost: { butts: 3 }, cdMin: 6 * H, outcomes: [{ w: 5, text: 'В корешке — лезвие и записка. Семёныч подмигнул.', item: true }, { w: 5, text: 'Просто книга. Хорошая, кстати.', xp: 10 }] },
      { id: 'poem', icon: '✍️', label: 'Стихи в газету', hint: 'вдруг напечатают', cdMin: 24 * H, outcomes: [{ w: 3, text: 'Напечатали в «Вестнике колонии»! Гонорар — золотом.', gold: 2, authority: 2 }, { w: 7, text: 'Вернули с пометкой «слабо». Пиши ещё.', xp: 8 }] },
    ],
  },
  {
    id: 'club', name: 'Клуб', icon: '🎸', minLevel: 5, who: 'sheet/cast/writer', host: 'Худрук Лёва',
    greet: 'Самодеятельность — прямая дорога к УДО. Ну и девчонки из бухгалтерии на концерт приходят.',
    activities: [
      { id: 'movie', icon: '🎬', label: 'Кино', hint: 'по субботам и не только', cdMin: 8 * H, outcomes: [{ w: 6, text: '«Джентльмены удачи». Смеялся весь зал.', energy: 20 }, { w: 4, text: 'Плёнка порвалась на самом интересном.', energy: 10 }] },
      { id: 'rehearse', icon: '🎸', label: 'Репетиция ансамбля', hint: 'опыт и уважение', cost: { energy: 10 }, cdMin: 4 * H, outcomes: [{ w: 7, text: 'Три блатных аккорда уже получаются.', xp: 12, authority: 1 }, { w: 3, text: 'Порвал струну. Лёва ругается.', xp: 6 }] },
      { id: 'concert', icon: '🎤', label: 'Концерт самодеятельности', hint: 'раз в сутки, срок и слава', cost: { energy: 25 }, cdMin: 24 * H, outcomes: [{ w: 6, text: 'Овация! Начальник отметил в характеристике.', authority: 4, term: 0.5, money: 2 }, { w: 4, text: 'Забыл слова, но зал поддержал.', authority: 2, xp: 10 }] },
      { id: 'kvn', icon: '😂', label: 'Шутка про кума', hint: 'рискованно', need: { mast: ['blat', 'otric'] }, cdMin: 12 * H, outcomes: [{ w: 6, text: 'Зал лёг. Кум не понял, что про него.', authority: 5 }, { w: 4, text: 'Кум понял.', authority: 5, hp: -0.2 }] },
    ],
  },
  {
    id: 'factory', name: 'Промка', icon: '🏭', minLevel: 2, who: 'sheet/cast/coverall', host: 'Мастер Палыч',
    greet: 'Норма есть норма. Сделал — получи. Не сделал — сам знаешь.',
    activities: [
      { id: 'sew', icon: '🧵', label: 'Швейный цех', hint: 'рукавицы да робы', cost: { energy: 15 }, cdMin: 60, outcomes: [{ w: 1, text: 'Сотня рукавиц. Палыч расписался в ведомости.', money: 2, xp: 5 }] },
      { id: 'wood', icon: '🪚', label: 'Столярка', hint: 'бывают находки', cost: { energy: 20 }, cdMin: 90, outcomes: [{ w: 7, text: 'Табуретки для офицерской столовой.', money: 2.5, xp: 6 }, { w: 3, text: 'Из обрезков вышла полезная вещь.', money: 1.5, item: true }] },
      { id: 'foundry', icon: '🔥', label: 'Литейка', hint: 'тяжело, но платят', cost: { energy: 30 }, cdMin: 120, need: { level: 10 }, outcomes: [{ w: 8, text: 'Отлили партию решёток. Палыч доволен.', money: 4.5, xp: 12 }, { w: 2, text: 'Брызнуло металлом.', money: 3, hp: -0.15 }] },
      { id: 'carry', icon: '🎒', label: 'Вынести с промки', hint: 'риск на КПП', cdMin: 8 * H, outcomes: [{ w: 5, text: 'Пронёс под робой. Барыга возьмёт.', item: true, butts: 5 }, { w: 5, text: 'Шмон на КПП. Отобрали и дали по шее.', hp: -0.15, authority: 1 }] },
    ],
  },
  {
    id: 'visits', name: 'Свиданка', icon: '💌', minLevel: 8, who: 'sheet/cast/guardwoman', host: 'Прапорщица Галя',
    greet: 'Заявление подано? Время — по часам, передачи — через меня.',
    activities: [
      { id: 'phone', icon: '☎️', label: 'Таксофон', hint: 'позвонить домой', cost: { money: 1 }, cdMin: 6 * H, outcomes: [{ w: 8, text: 'Голос родных. Сразу легче.', energy: 25, xp: 4 }, { w: 2, text: 'Никто не взял трубку.', energy: 5 }] },
      { id: 'short', icon: '🪟', label: 'Краткое свидание', hint: 'через стекло', cost: { money: 3 }, cdMin: 24 * H, outcomes: [{ w: 1, text: 'Час через стекло, трубка в руке. Мать плакала, ты держался.', energy: 60, hp: 0.3, xp: 15 }] },
      { id: 'long', icon: '🏠', label: 'Длительное свидание', hint: 'трое суток — как на воле', cost: { gold: 5 }, cdMin: 72 * H, outcomes: [{ w: 1, text: 'Трое суток в комнате с кухней. Домашняя еда, тёплые руки.', energy: 120, hp: 1, term: 1, item: true, xp: 30 }] },
      { id: 'parcel', icon: '📦', label: 'Забрать передачу', hint: 'Галя проверяет', cdMin: 12 * H, outcomes: [{ w: 6, text: 'Всё целое. Сало, чай, сигареты.', butts: 8, item: true }, { w: 4, text: 'Половину «изъяли». Галя пьёт твой чай.', butts: 3 }] },
    ],
  },
  {
    id: 'shizo', name: 'ШИЗО', icon: '🧱', minLevel: 4, who: 'sheet/cast/omon', host: 'Контролёр ШИЗО',
    greet: 'Здесь сидят те, кто не понял с первого раза. Тебе туда, или так, поглазеть?',
    activities: [
      { id: 'grev', icon: '🚬', label: 'Загнать грев в ШИЗО', hint: 'свои не забудут', cost: { butts: 5 }, cdMin: 4 * H, outcomes: [{ w: 8, text: 'Грев дошёл. Из кормушки — «Благодарю, брат».', authority: 3 }, { w: 2, text: 'Контролёр перехватил. Спасибо, что не тебя.', authority: 1 }] },
      { id: 'knock', icon: '🔨', label: 'Перестукиваться', hint: 'новости через стену', cdMin: 2 * H, outcomes: [{ w: 6, text: 'Азбука через трубу: кто сел, за что, кто сдал.', xp: 10 }, { w: 4, text: 'Контролёр постучал в ответ. Дубинкой.', hp: -0.1, xp: 5 }] },
      { id: 'sit', icon: '⛓️', label: 'Сесть за друга', hint: 'сутки в бетоне — и почёт', cdMin: 24 * H, need: { level: 6 }, outcomes: [{ w: 1, text: 'Сутки на откидной шконке. Холод, хлеб, вода. Выходишь — братва встречает.', hp: -0.35, energy: -30, authority: 9, xp: 20 }] },
      { id: 'bribe', icon: '💰', label: 'Выкупить соседа', hint: 'дорого, но честно', cost: { money: 6 }, cdMin: 24 * H, need: { mast: ['blat', 'kozel'] }, outcomes: [{ w: 1, text: 'Контролёр пересчитал и открыл дверь. Сосед обязан тебе.', authority: 6 }] },
    ],
  },
];

export const placeById = new Map(PLACES.map((p) => [p.id, p]));

/** Репутация за занятие: «место.занятие» → кому и сколько. */
export const PLACE_REP: Record<string, Partial<Record<FactionId, number>>> = {
  'canteen.kitchen': { work: 2 },
  'logging.saw': { work: 4 },
  'logging.stack': { work: 2 },
  'kamera.talk': { brat: 3 },
  'kamera.road': { brat: 2 },
  'plac.drill': { admin: 2 },
  'plac.paper': { admin: 3 },
  'plac.report': { admin: 5, brat: -5 },
  'canteen.blat_table': { brat: 3 },
  'bath.back': { brat: 2 },
  'library.read': { admin: 1 },
  'library.law': { admin: 3 },
  'club.rehearse': { admin: 2 },
  'club.concert': { admin: 6 },
  'club.kvn': { brat: 4 },
  'factory.sew': { work: 3 },
  'factory.wood': { work: 3 },
  'factory.foundry': { work: 5 },
  'factory.carry': { brat: 2 },
  'shizo.grev': { brat: 5 },
  'shizo.sit': { brat: 12 },
  'shizo.bribe': { brat: 6 },
};
