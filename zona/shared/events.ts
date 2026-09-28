// Случаи, побег, санчасть и гости: всё, где решает рандом.

/** Эффект исхода. money — в «пайках»: 30 + уровень × 15 рублей за единицу. hp — доля от максимума. */
export interface Effects {
  money?: number;
  butts?: number;
  gold?: number;
  xp?: number;
  authority?: number;
  energy?: number;
  hp?: number;
  item?: boolean;
}

export interface Outcome extends Effects {
  w: number; // вес исхода
  text: string;
}

export interface EventOption {
  label: string;
  cost?: { money?: number; butts?: number; gold?: number };
  outcomes: Outcome[];
}

export interface GameEvent {
  id: string;
  who: string; // картинка персонажа
  name: string;
  text: string;
  where: 'any' | 'yard';
  options: EventOption[];
}

const nothing = (text: string): Outcome => ({ w: 1, text });

export const EVENTS: GameEvent[] = [
  {
    id: 'guard_drop', who: 'sheet/cast/officer', name: 'Вертухай', where: 'any',
    text: 'Вертухай на обходе выронил пачку сигарет и не заметил.',
    options: [
      { label: 'Окликнуть и вернуть', outcomes: [{ w: 7, text: '«Молодец, сознательный». Отпустил на лишнюю прогулку.', energy: 15, xp: 6 }, { w: 3, text: 'Буркнул что-то и ушёл. Ну хоть не шмонал.', xp: 3 }] },
      { label: 'Прикарманить', outcomes: [{ w: 6, text: 'Пачка твоя. Барыга такое любит.', butts: 8 }, { w: 4, text: 'Вернулся, увидел. Дубинкой по рёбрам.', hp: -0.15 }] },
      { label: 'Пройти мимо', outcomes: [nothing('Не твоё — не трогай.')] },
    ],
  },
  {
    id: 'parcel', who: 'sheet/cast/guardwoman', name: 'Приёмщица передач', where: 'any',
    text: 'С воли пришла передачка. Но проверка «затягивается».',
    options: [
      { label: 'Дать на лапу (2 пайки)', cost: { money: 2 }, outcomes: [{ w: 8, text: 'Всё целое, ещё и сверху положили.', money: 4, item: true }, { w: 2, text: 'Деньги взяла, передачку всё равно распотрошили.' }] },
      { label: 'Ждать по-честному', outcomes: [{ w: 5, text: 'Отдали, половину растащили.', money: 1.5 }, { w: 5, text: '«Запрещённые вложения». Ничего не отдали.' }] },
    ],
  },
  {
    id: 'cards', who: 'sheet/cast/blatnoy', name: 'Блатной', where: 'any',
    text: 'Садись, перекинемся в буру. Ставка — пайка.',
    options: [
      { label: 'Сыграть (1 пайка)', cost: { money: 1 }, outcomes: [{ w: 45, text: 'Прёт! Забрал банк.', money: 2.3, authority: 1 }, { w: 55, text: 'Карта не пошла. Банк ушёл блатному.' }] },
      { label: 'Сыграть по-крупному (4 пайки)', cost: { money: 4 }, outcomes: [{ w: 40, text: 'Сорвал куш — вся хата гудит.', money: 9.5, authority: 3 }, { w: 60, text: 'Раздели до нитки. Бывает.' }] },
      { label: 'Не играю', outcomes: [nothing('«Правильно, играть — дело тонкое».')] },
    ],
  },
  {
    id: 'newbie', who: 'sheet/cast/youngster', name: 'Новенький', where: 'yard',
    text: 'Во дворе двое прессуют новенького — отбирают передачку.',
    options: [
      { label: 'Заступиться', outcomes: [{ w: 6, text: 'Разогнал. Новенький теперь за тебя горой.', authority: 3, xp: 10 }, { w: 4, text: 'Отбились, но и тебе прилетело.', authority: 2, hp: -0.2 }] },
      { label: 'Не лезть', outcomes: [nothing('Каждый сам за себя. Но осадочек остался.')] },
    ],
  },
  {
    id: 'rat', who: 'sheet/cast/thin', name: 'Тощий', where: 'any',
    text: 'Застал тощего у своей тумбочки. Руки — в твоей заначке.',
    options: [
      { label: 'Предъявить', outcomes: [{ w: 7, text: 'Вернул всё и сверху за беспокойство.', money: 1.5, authority: 2 }, { w: 3, text: 'Вывернулся и убежал. Заточкой полоснул.', hp: -0.1 }] },
      { label: 'Отпустить с миром', outcomes: [{ w: 1, text: 'Ушёл, должен теперь. Когда-нибудь отдаст.', xp: 5 }] },
    ],
  },
  {
    id: 'kitchen', who: 'sheet/cast/cook', name: 'Повар', where: 'any',
    text: 'Повар подмигивает: сегодня добавка — с мясом.',
    options: [
      { label: 'Взять добавку', outcomes: [{ w: 8, text: 'Сытый зэк — добрый зэк.', hp: 0.3, energy: 5 }, { w: 2, text: 'Мясо было… странное. Полдня в сортире.', hp: -0.1 }] },
      { label: 'Отказаться', outcomes: [nothing('«Ну и ходи голодный».')] },
    ],
  },
  {
    id: 'letter', who: 'sheet/cast/writer', name: 'Писарь', where: 'any',
    text: 'Тебе письмо. Почерк мамин.',
    options: [
      { label: 'Прочитать', outcomes: [{ w: 8, text: 'Ждут дома. Сил сразу прибавилось.', energy: 15, xp: 5 }, { w: 2, text: 'В конверте ещё и фотография. Сберечь.', energy: 10, item: true }] },
    ],
  },
  {
    id: 'search', who: 'sheet/cast/omon', name: 'Шмон', where: 'any',
    text: 'Внезапный шмон! ОМОН в коридоре, через минуту будут в хате.',
    options: [
      { label: 'Спрятать бычки в матрас', outcomes: [{ w: 6, text: 'Не нашли. Ловко.', xp: 5 }, { w: 4, text: 'Матрас распороли. Бычков нет.', butts: -10 }] },
      { label: 'Сунуть бычки начальнику смены', cost: { butts: 5 }, outcomes: [{ w: 1, text: 'Твою шконку обошли стороной.', authority: 1 }] },
    ],
  },
  {
    id: 'kolshik', who: 'sheet/cast/kolshik', name: 'Кольщик', where: 'any',
    text: 'Кольщик скучает: «Набью по дружбе звёзды. Бесплатно».',
    options: [
      { label: 'Согласиться', outcomes: [{ w: 5, text: 'Красиво вышло. Уважение растёт.', authority: 3 }, { w: 5, text: 'Рука опухла, неделю не согнуть.', hp: -0.12, xp: 4 }] },
      { label: 'В другой раз', outcomes: [nothing('«Как знаешь».')] },
    ],
  },
  {
    id: 'bet', who: 'sheet/cast/brute', name: 'Качок', where: 'yard',
    text: 'Спорим, я больше тебя отожмусь? На пять бычков.',
    options: [
      { label: 'Спорим (5 🚬)', cost: { butts: 5 }, outcomes: [{ w: 5, text: 'Он сдулся на сороковом. Твои бычки.', butts: 11, xp: 6 }, { w: 5, text: 'Качок есть качок. Бычки ушли.' }] },
      { label: 'Не спорю', outcomes: [nothing('«Слабак». Ну и пусть.')] },
    ],
  },
  {
    id: 'oldman', who: 'sheet/cast/oldman', name: 'Старик', where: 'yard',
    text: 'Старик тащит тюфяк через весь двор. Кряхтит.',
    options: [
      { label: 'Помочь донести', outcomes: [{ w: 7, text: 'Спасибо, сынок. Вот, держи — пригодится.', xp: 10, item: true }, { w: 3, text: 'Донёс. Старик сразу уснул.', xp: 8 }] },
      { label: 'Некогда', outcomes: [nothing('Старик вздохнул и потащил дальше.')] },
    ],
  },
  {
    id: 'lawyer', who: 'sheet/cast/lawyer', name: 'Адвокат', where: 'any',
    text: 'Шепчет: «Есть человек в суде. За пять золотых пересмотрят дело».',
    options: [
      { label: 'Заплатить 5 🪙', cost: { gold: 5 }, outcomes: [{ w: 5, text: 'Пересмотрели! Срок тот же, но кум стал добрее.', xp: 40, energy: 30 }, { w: 5, text: 'Адвоката больше никто не видел.' }] },
      { label: 'Не верю адвокатам', outcomes: [nothing('И правильно.')] },
    ],
  },
  {
    id: 'pills', who: 'sheet/cast/doctor', name: 'Лепила', where: 'any',
    text: 'Лепила суёт горсть таблеток: «Витамины. Экспериментальные».',
    options: [
      { label: 'Выпить', outcomes: [{ w: 6, text: 'Бодрит! Горы свернёшь.', energy: 25 }, { w: 4, text: 'Сердце стучит, в глазах двоится.', hp: -0.15, energy: 5 }] },
      { label: 'Выбросить', outcomes: [nothing('От греха подальше.')] },
    ],
  },
  {
    id: 'crow', who: 'sheet/cast/hermit', name: 'Отшельник', where: 'any',
    text: 'Отшельник показывает на окно: «Ворона тебе что-то принесла. Прикормил, видать».',
    options: [
      { label: 'Посмотреть', outcomes: [{ w: 6, text: 'Три бычка. Умная птица.', butts: 3 }, { w: 3, text: 'Золотая коронка! Откуда…', gold: 2 }, { w: 1, text: 'Клюнула в палец и улетела.', hp: -0.03 }] },
    ],
  },
  {
    id: 'football', who: 'sheet/cast/sport', name: 'Физрук', where: 'yard',
    text: 'Во дворе гоняют мяч — одного не хватает.',
    options: [
      { label: 'Сыграть', outcomes: [{ w: 5, text: 'Забил победный. На руках носили.', authority: 2, xp: 8 }, { w: 3, text: 'Ничья, зато размялся.', xp: 6 }, { w: 2, text: 'Подкатом снесли. Колено…', hp: -0.12, xp: 4 }] },
      { label: 'Болеть со скамейки', outcomes: [{ w: 1, text: 'Поорал от души.', energy: 5 }] },
    ],
  },
  {
    id: 'chifir_round', who: 'sheet/cast/bandaged', name: 'Сосед по шконке', where: 'any',
    text: 'Сосед заварил чифир и пускает кружку по кругу.',
    options: [
      { label: 'Хлебнуть', outcomes: [{ w: 7, text: 'Горько, но бодрит!', energy: 12 }, { w: 3, text: 'Перебрал. Сердце скачет.', energy: 20, hp: -0.08 }] },
      { label: 'Добавить своей заварки (3 🚬)', cost: { butts: 3 }, outcomes: [{ w: 1, text: 'Уважение за щедрость. И кружка покрепче.', energy: 15, authority: 2 }] },
      { label: 'Отказаться', outcomes: [nothing('Не пьёшь — не пей.')] },
    ],
  },
  {
    id: 'yard_fight', who: 'sheet/cast/brute', name: 'Качок', where: 'yard',
    text: 'Во дворе двое сцепились. Народ ставит бычки — кто кого.',
    options: [
      { label: 'На здорового (5 🚬)', cost: { butts: 5 }, outcomes: [{ w: 6, text: 'Здоровый положил мелкого. Твоё!', butts: 9 }, { w: 4, text: 'Мелкий оказался вёртким. Бычки ушли.' }] },
      { label: 'На мелкого (5 🚬)', cost: { butts: 5 }, outcomes: [{ w: 3, text: 'Мелкий уложил здоровяка! Куш!', butts: 17 }, { w: 7, text: 'Предсказуемо. Мелкий лёг.' }] },
      { label: 'Разнять', outcomes: [{ w: 5, text: 'Растащил — оба теперь тебе должны.', authority: 3 }, { w: 5, text: 'Прилетело от обоих.', hp: -0.15, authority: 1 }] },
    ],
  },
  {
    id: 'phone', who: 'sheet/cast/youngster', name: 'Молодой', where: 'any',
    text: 'Шёпотом: «Есть мобила. Пять минут — позвонить домой. Сто рублей».',
    options: [
      { label: 'Позвонить (1 пайка)', cost: { money: 1 }, outcomes: [{ w: 7, text: 'Голос мамы. Жить хочется.', energy: 25, hp: 0.1 }, { w: 3, text: 'Спалили на шмоне. Мобилу забрали, тебя — в ШИЗО на ночь.', hp: -0.1 }] },
      { label: 'Сдать молодого куму', outcomes: [{ w: 5, text: 'Кум доволен. А вот хата — нет.', money: 2, authority: -3 }, { w: 5, text: 'Кум отмахнулся. Молодой всё понял.', authority: -2 }] },
      { label: 'Не надо', outcomes: [nothing('Меньше знаешь — крепче спишь.')] },
    ],
  },
  {
    id: 'extort', who: 'sheet/cast/officer', name: 'Вертухай', where: 'any',
    text: '«Что-то у тебя в тумбочке звенит. Поделишься — не замечу».',
    options: [
      { label: 'Поделиться (1 пайка)', cost: { money: 1 }, outcomes: [{ w: 1, text: 'Ушёл довольный. Неделю не тронет.', xp: 5 }] },
      { label: 'Послать', outcomes: [{ w: 5, text: 'Проверил — пусто. Ушёл злой.', authority: 2 }, { w: 5, text: 'Нашёл заначку и забрал с процентами.', money: -2 }] },
    ],
  },
  {
    id: 'library', who: 'sheet/cast/writer', name: 'Библиотекарь', where: 'any',
    text: 'В библиотеку завезли книги. «Граф Монте-Кристо» — как про тебя.',
    options: [
      { label: 'Взять почитать', outcomes: [{ w: 8, text: 'Зачитался до утра. Умнее стал.', xp: 20 }, { w: 2, text: 'Между страниц — чья-то заначка!', xp: 10, money: 1.5 }] },
      { label: 'Взять на самокрутки', outcomes: [{ w: 1, text: 'Бумага хорошая. Бычков прибавилось.', butts: 4, authority: -1 }] },
    ],
  },
  {
    id: 'rat_pet', who: 'sheet/cast/hermit', name: 'Отшельник', where: 'any',
    text: 'Под шконкой живёт крыса. Отшельник: «Прикорми — умная будет».',
    options: [
      { label: 'Прикормить (2 🚬)', cost: { butts: 2 }, outcomes: [{ w: 6, text: 'Крыса притащила монетку. Благодарная!', gold: 1 }, { w: 4, text: 'Сожрала и убежала.' }] },
      { label: 'Выгнать', outcomes: [nothing('Шваброй её, шваброй.')] },
    ],
  },
  {
    id: 'concert', who: 'sheet/cast/priest', name: 'Батюшка', where: 'any',
    text: 'В клубе самодеятельность. Нужен кто-то спеть под гитару.',
    options: [
      { label: 'Спеть', outcomes: [{ w: 5, text: 'Зал плакал. Даже кум хлопал.', authority: 4, xp: 10 }, { w: 3, text: 'Нормально. Похлопали.', xp: 8 }, { w: 2, text: 'Освистали. Запустили тапком.', authority: -1, hp: -0.03 }] },
      { label: 'Сидеть в зале', outcomes: [{ w: 1, text: 'Отдохнул душой.', energy: 8 }] },
    ],
  },
  {
    id: 'dogs', who: 'sheet/cast/spetsnaz', name: 'Кинолог', where: 'yard',
    text: 'Кинолог выгуливает овчарок у забора. Одна виляет хвостом тебе.',
    options: [
      { label: 'Угостить собаку', outcomes: [{ w: 6, text: 'Подружились. Кинолог разрешил гладить. Пригодится при побеге…', xp: 12 }, { w: 4, text: 'Цапнула за руку.', hp: -0.1 }] },
      { label: 'Держаться подальше', outcomes: [nothing('Правильно. Это не собака, это служба.')] },
    ],
  },
  {
    id: 'toothache', who: 'sheet/cast/doctor', name: 'Лепила', where: 'any',
    text: 'Зуб разболелся — на стенку лезешь. Лепила с плоскогубцами уже тут.',
    options: [
      { label: 'Рвать', outcomes: [{ w: 7, text: 'Выдрал с первого раза. Полегчало.', hp: 0.15 }, { w: 3, text: 'Со второго… с третьего…', hp: -0.1 }] },
      { label: 'Терпеть', outcomes: [{ w: 1, text: 'Ноет весь день. Ни на что сил нет.', energy: -10 }] },
      { label: 'Золотую коронку (3 🪙)', cost: { gold: 3 }, outcomes: [{ w: 1, text: 'Блестит! Сразу видно — серьёзный человек.', authority: 5, hp: 0.2 }] },
    ],
  },
  {
    id: 'date', who: 'sheet/cast/guardwoman', name: 'Надзирательница', where: 'any',
    text: 'Разрешили длительное свидание. Но места в комнате — по очереди.',
    options: [
      { label: 'Дать на лапу за очередь (2 пайки)', cost: { money: 2 }, outcomes: [{ w: 1, text: 'Три дня дома, хоть и за решёткой. Как заново родился.', hp: 0.5, energy: 40 }] },
      { label: 'Ждать своей очереди', outcomes: [{ w: 5, text: 'Дождался! Хоть на пару часов.', energy: 20, hp: 0.2 }, { w: 5, text: 'Очередь сдвинули. Опять ждать.' }] },
    ],
  },
  {
    id: 'smuggle', who: 'sheet/cast/seller', name: 'Барыга', where: 'any',
    text: '«Пронеси пакет в третий барак. Что внутри — не твоё дело».',
    options: [
      { label: 'Пронести', outcomes: [{ w: 6, text: 'Дошло. Барыга расплатился честно.', money: 3, xp: 8 }, { w: 4, text: 'Шмон на входе. Пакет изъяли, тебе — дубинкой.', hp: -0.2 }] },
      { label: 'Отказаться', outcomes: [nothing('«Ну, как знаешь». Барыга ушёл искать другого.')] },
    ],
  },
  {
    id: 'chess', who: 'sheet/cast/oldman', name: 'Старик-шахматист', where: 'yard',
    text: 'Старик расставил фигуры на лавке: «Партейку? На пять бычков».',
    options: [
      { label: 'Играть (5 🚬)', cost: { butts: 5 }, outcomes: [{ w: 3, text: 'Мат в двадцать ходов! Старик уважительно кивнул.', butts: 12, xp: 15 }, { w: 7, text: 'Разгромил за десять ходов. Зато научил.', xp: 10 }] },
      { label: 'Смотреть', outcomes: [{ w: 1, text: 'Понял пару приёмов.', xp: 5 }] },
    ],
  },
  {
    id: 'cheat', who: 'sheet/cast/blatnoy', name: 'Блатной', where: 'any',
    text: 'Заметил, как шулер в углу передёргивает карты новенькому.',
    options: [
      { label: 'Разоблачить', outcomes: [{ w: 6, text: 'Шулера прижали. Новенький вернул деньги — и поделился.', money: 1.5, authority: 3 }, { w: 4, text: 'Шулер оказался при заточке.', hp: -0.18, authority: 2 }] },
      { label: 'Попросить долю за молчание', outcomes: [{ w: 5, text: 'Шулер отстегнул.', money: 2, authority: -1 }, { w: 5, text: 'Шулер позвал своих. Лучше бы молчал.', hp: -0.15 }] },
      { label: 'Промолчать', outcomes: [nothing('Не твоё дело.')] },
    ],
  },
  {
    id: 'snow', who: 'sheet/cast/worker', name: 'Бригадир', where: 'yard',
    text: 'Навалило снега. Бригадир ищет, кто почистит плац.',
    options: [
      { label: 'Взять лопату', outcomes: [{ w: 8, text: 'Работа как работа. Бригадир заплатил.', money: 1.2, xp: 6 }, { w: 2, text: 'Под снегом — чей-то потерянный кошелёк!', money: 3 }] },
      { label: 'Отмазаться', outcomes: [{ w: 6, text: 'Прокатило.' }, { w: 4, text: 'Не прокатило. Чистил двойную норму бесплатно.', energy: -10 }] },
    ],
  },
  {
    id: 'rumor', who: 'sheet/cast/avtoritet', name: 'Авторитет', where: 'any',
    text: '«Слышал, кто-то на тебя куму стучит. Хочешь знать кто — сделай одолжение».',
    options: [
      { label: 'Сделать одолжение (1 пайка)', cost: { money: 1 }, outcomes: [{ w: 7, text: 'Назвал имя. Теперь ты предупреждён.', authority: 2, xp: 10 }, { w: 3, text: 'Взял деньги, имя — «потом».' }] },
      { label: 'Мне без разницы', outcomes: [{ w: 1, text: '«Смелый. Или глупый».' }] },
    ],
  },
  {
    id: 'package_found', who: 'sheet/cast/coverall', name: 'Работяга', where: 'yard',
    text: 'У забора — перекинутый с воли свёрток. Никто не видел?',
    options: [
      { label: 'Схватить и бежать', outcomes: [{ w: 5, text: 'Чай, сигареты и… аптечка!', butts: 8, item: true }, { w: 3, text: 'Пусто, одни газеты.', butts: 1 }, { w: 2, text: 'Вышка увидела. Лёг лицом в снег.', hp: -0.12 }] },
      { label: 'Пройти мимо', outcomes: [nothing('Может, и правильно.')] },
    ],
  },
];
export const eventById = new Map(EVENTS.map((e) => [e.id, e]));

export const EVENT_TIMING = {
  minGapMin: 12, // между случаями
  maxGapMin: 30,
  ttlMin: 40, // сколько случай ждёт ответа
  yardCooldownMin: 30, // прогулка по двору — случай сразу
};

// --- Побег --------------------------------------------------------------------------
// Никогда не удаётся: на последнем этапе всегда ловят. Чем дальше ушёл — тем больше
// «за дерзость». Можно вернуться раньше: меньше награда, зато без ШИЗО.

export interface EscapeStage {
  id: string;
  name: string;
  text: string;
  pass: number; // базовый шанс пройти
  game: 'timing' | 'mash' | 'hold';
}

export const ESCAPE_STAGES: EscapeStage[] = [
  { id: 'tunnel', name: 'Подкоп под шконкой', text: 'Ложкой, ночами, три месяца. Пора.', pass: 0.92, game: 'mash' },
  { id: 'yard', name: 'Двор', text: 'Проползти вдоль стены, пока дежурный курит.', pass: 0.85, game: 'timing' },
  { id: 'light', name: 'Прожектор', text: 'Луч гуляет по двору — замри, когда подходит.', pass: 0.78, game: 'timing' },
  { id: 'dogs', name: 'Собаки', text: 'Овчарки учуяли. Беги!', pass: 0.72, game: 'mash' },
  { id: 'wire', name: 'Колючка', text: 'Бушлат на проволоку — и перелезть.', pass: 0.66, game: 'timing' },
  { id: 'wall', name: 'Забор', text: 'Пять метров бетона. Не сорвись.', pass: 0.6, game: 'mash' },
  { id: 'forest', name: 'Тайга', text: 'Ночь, болото, вертолёт над головой.', pass: 0.55, game: 'timing' },
  { id: 'road', name: 'Трасса', text: 'Фура тормозит. Водитель смотрит странно.', pass: 0.5, game: 'timing' },
  { id: 'station', name: 'Вокзал', text: 'Билет куплен, поезд через минуту…', pass: 0, game: 'timing' },
];

export const ESCAPE = {
  energy: 20,
  cooldownMin: 360, // ШИЗО после поимки
  bailCooldownMin: 90, // вернулся сам
  bailShare: 0.6, // вернулся сам — доля награды
  qualityBonus: 0.15, // за идеальный тап
};

/** Награда за этапы: растёт быстрее, чем линейно. */
export function escapeReward(level: number, stages: number) {
  const k = Math.pow(stages, 1.6);
  return {
    money: Math.round((40 + level * 20) * k),
    xp: Math.round((8 + level * 1.5) * k),
    authority: stages * 2 + (stages >= 6 ? 5 : 0),
    gold: stages >= 7 ? stages - 5 : 0,
    item: stages >= 4,
  };
}

// --- Санчасть -------------------------------------------------------------------------
export const MEDIC = {
  bedHeal: 0.3, // полежать на койке — бесплатно
  bedCooldownMin: 90,
  shotHeal: 0.6, // укол за деньги
  shotPerLevel: 40,
  noteChance: 0.45, // справка «освобождение от работ»
  noteEnergy: 25,
};

// --- В гостях ----------------------------------------------------------------------------
export const VISIT = {
  giftButts: 5,
  snoopPerDay: 3,
  caught: 0.3,
  empty: 0.25,
};
