// Второй пласт случаев: цепочки (исход ведёт к продолжению), случаи по масти, ночные и для бывалых.
// Цепочка: исход с next — через несколько минут придёт продолжение. Событие с chain: true само не выпадает.
import type { GameEvent, Outcome } from './events.ts';

const nothing = (text: string): Outcome => ({ w: 1, text });

// --- Цепочки ------------------------------------------------------------------------------

const CHAINS: GameEvent[] = [
  // Малява в соседний барак
  {
    id: 'mal_1', who: 'sheet/cast/thin', name: 'Шнырь', where: 'any',
    text: 'Шнырь суёт скрученную записку: «Малява в третий барак. Передашь — не забудут».',
    options: [
      { label: 'Взяться передать', outcomes: [{ w: 1, text: 'Спрятал маляву в шов. Теперь до вечера — не попадись.', xp: 4, next: 'mal_2' }] },
      { label: 'Развернуть и прочитать', outcomes: [{ w: 6, text: 'Шифр: цифры да крестики. Ничего не понял, а шнырь всё видел.', authority: -1 }, { w: 4, text: 'Там про общак третьего барака. Знание — тоже товар.', xp: 8 }] },
      { label: 'Отказаться', outcomes: [nothing('«Ну и сиди». Шнырь исчез так же тихо, как пришёл.')] },
    ],
  },
  {
    id: 'mal_2', who: 'sheet/cast/officer', name: 'Вертухай у калитки', where: 'yard', chain: true,
    text: 'У калитки в локалку третьего барака дежурит вертухай. Смотрит прямо на тебя.',
    options: [
      { label: 'Пройти как ни в чём не бывало', outcomes: [{ w: 6, text: 'Пропустил. Малява ушла по назначению.', xp: 6, next: 'mal_3' }, { w: 4, text: '«Стоять. Руки». Нашёл — в ШИЗО на сутки.', hp: -0.15, authority: 1 }] },
      { label: 'Сунуть пачку (5 🚬)', cost: { butts: 5 }, outcomes: [{ w: 1, text: 'Отвернулся ровно на три секунды. Хватило.', next: 'mal_3' }] },
      { label: 'Проглотить маляву', outcomes: [{ w: 1, text: 'Бумага встала поперёк горла. Задание провалено, но никого не сдал.', authority: 1, hp: -0.05 }] },
    ],
  },
  {
    id: 'mal_3', who: 'sheet/cast/avtoritet', name: 'Смотрящий третьего', where: 'any', chain: true,
    text: 'Вечером приходит ответ: «Смотрящий третьего кланяется. Спрашивает, чем отблагодарить».',
    options: [
      { label: 'Деньгами', outcomes: [{ w: 1, text: 'Передали конверт. Честно заработано.', money: 4 }] },
      { label: 'Словом за тебя', outcomes: [{ w: 1, text: 'По баракам прошло: «Надёжный». Это дороже денег.', authority: 4 }] },
      { label: 'Ничего не надо', outcomes: [{ w: 1, text: '«Уважаю». Через день принесли грев — просто так.', item: true, authority: 2 }] },
    ],
  },

  // Сява просит в долг
  {
    id: 'loan_1', who: 'sheet/cast/youngster', name: 'Сява', where: 'any', minLevel: 3,
    text: 'Молодой Сява мнётся: «Братан, выручи, до передачки. Верну с горкой, клянусь».',
    options: [
      { label: 'Дать (2 пайки)', cost: { money: 2 }, outcomes: [{ w: 1, text: 'Сява расцвёл: «Век не забуду!» Посмотрим.', next: 'loan_2' }] },
      { label: 'Дать бычками (6 🚬)', cost: { butts: 6 }, outcomes: [{ w: 1, text: 'Взял, пересчитал дважды. Обещал вернуть в двойне.', next: 'loan_2' }] },
      { label: 'Отказать', outcomes: [nothing('«Понял…» Ушёл просить к другим.')] },
    ],
  },
  {
    id: 'loan_2', who: 'sheet/cast/youngster', name: 'Сява', where: 'any', chain: true,
    text: 'Передачка у Сявы пришла. А он делает вид, что тебя не видит.',
    options: [
      { label: 'Спросить по-хорошему', outcomes: [{ w: 5, text: 'Отдал с процентами и даже покраснел.', money: 3, butts: 3 }, { w: 5, text: '«Нету, всё отобрали». Врёт — видно по глазам.', next: 'loan_3' }] },
      { label: 'Спросить при всех', outcomes: [{ w: 6, text: 'При хате отдал всё до копейки. Народ кивнул.', money: 3, authority: 2 }, { w: 4, text: 'Сява сбежал в баню. Там и договорим.', next: 'loan_3' }] },
      { label: 'Простить долг', outcomes: [{ w: 1, text: 'Сява теперь за тебя в огонь и в воду. Хоть что-то.', authority: 1, xp: 6 }] },
    ],
  },
  {
    id: 'loan_3', who: 'sheet/cast/youngster', name: 'Сява в бане', where: 'any', chain: true,
    text: 'В бане пар, Сява в углу, деваться некуда. «Ну не бей только…»',
    options: [
      { label: 'Выбить долг', outcomes: [{ w: 7, text: 'Нашлась и заначка, и сверху за беспокойство.', money: 4, authority: 2 }, { w: 3, text: 'Влетел банщик, досталось обоим.', hp: -0.15, money: 2 }] },
      { label: 'Взять часы в счёт долга', outcomes: [{ w: 1, text: 'Часы старые, но барыга возьмёт.', item: true, butts: 4 }] },
      { label: 'Махнуть рукой', outcomes: [nothing('Сява бормочет спасибо. Себе дороже связываться.')] },
    ],
  },

  // Опер вербует
  {
    id: 'oper_1', who: 'sheet/cast/lawyer', name: 'Опер', where: 'any', minLevel: 4,
    text: 'Вызов к оперу. Чай, печенье, улыбка: «Разговор есть. Неофициальный».',
    options: [
      { label: 'Выслушать', outcomes: [{ w: 1, text: '«Мне нужны глаза в бараке. Взамен — поблажки». Он ждёт ответа завтра.', next: 'oper_2' }] },
      { label: 'Молчать весь разговор', outcomes: [{ w: 1, text: 'Сорок минут тишины. Опер вздохнул и отпустил. Братва оценила.', authority: 3 }] },
      { label: 'Съесть печенье и уйти', outcomes: [{ w: 1, text: 'Вкусное. Опер записал что-то в блокнот.', energy: 10 }] },
    ],
  },
  {
    id: 'oper_2', who: 'sheet/cast/lawyer', name: 'Опер', where: 'any', chain: true,
    text: '«Ну? Кто в хате держит телефон? Одно имя — и условия твои».',
    options: [
      { label: 'Назвать имя', need: { mast: ['kozel'] }, outcomes: [{ w: 1, text: 'Опер доволен. Поблажки пошли — и косые взгляды тоже.', money: 5, energy: 30, authority: -3, next: 'oper_3' }] },
      { label: 'Назвать выдуманное имя', outcomes: [{ w: 5, text: 'Опер записал, поблагодарил. Через неделю поймёт.', money: 2 }, { w: 5, text: 'Проверил сразу. «Шутник?» Сутки ШИЗО.', hp: -0.2, authority: 2 }] },
      { label: '«Я не по этой части»', outcomes: [{ w: 1, text: '«Пожалеешь». Но в бараке узнали — и зауважали.', authority: 4 }] },
    ],
  },
  {
    id: 'oper_3', who: 'sheet/cast/brute', name: 'Братва', where: 'any', chain: true,
    text: 'Утром телефон нашли. Вечером к тебе подходят трое: «Разговор есть».',
    options: [
      { label: 'Отпираться', outcomes: [{ w: 4, text: 'Поверили. Пока.', xp: 5 }, { w: 6, text: 'Не поверили.', hp: -0.3, authority: -2 }] },
      { label: 'Откупиться (5 паек)', cost: { money: 5 }, outcomes: [{ w: 1, text: 'Деньги взяли. Осадок остался.' }] },
      { label: 'Позвать вертухая', outcomes: [{ w: 1, text: 'Спасли. Теперь ты у администрации на хорошем счету — и только там.', energy: 20, authority: -2 }] },
    ],
  },

  // Брага в цеху
  {
    id: 'brew_1', who: 'sheet/cast/coverall', name: 'Работяга', where: 'any', minLevel: 2,
    text: 'В цеху за станком работяга показывает флягу: «Брага доходит. Нужен сахар — в долю возьмём».',
    options: [
      { label: 'Вложиться (1 пайка)', cost: { money: 1 }, outcomes: [{ w: 1, text: 'Сахар добыт. Ждём три дня… ну, три часа.', next: 'brew_2' }] },
      { label: 'Сдать мастеру', outcomes: [{ w: 1, text: 'Мастер вылил, похвалил. Работяги больше не здороваются.', money: 2, authority: -2 }] },
      { label: 'Не моё дело', outcomes: [nothing('Отошёл к своему станку. Меньше знаешь — крепче спишь.')] },
    ],
  },
  {
    id: 'brew_2', who: 'sheet/cast/coverall', name: 'Работяга', where: 'any', chain: true,
    text: 'Брага готова. Пахнет на весь цех. «Гоним сейчас или тащим в барак?»',
    options: [
      { label: 'Гнать тут же', outcomes: [{ w: 5, text: 'Первач вышел знатный. Твоя доля — две бутылки.', butts: 10, next: 'brew_3' }, { w: 5, text: 'Змеевик рванул. Обожглись, разбежались.', hp: -0.15 }] },
      { label: 'Нести в барак', outcomes: [{ w: 6, text: 'Пронесли под робой. Вечер будет весёлым.', next: 'brew_3' }, { w: 4, text: 'Шмон на входе. Флягу — в канализацию.', authority: 1 }] },
      { label: 'Продать барыге целиком', outcomes: [{ w: 1, text: 'Барыга заплатил не торгуясь.', money: 3 }] },
    ],
  },
  {
    id: 'brew_3', who: 'sheet/cast/ushanka', name: 'Хата', where: 'any', chain: true,
    text: 'Вечер. Кружки, закуска из пайки. Дед Митрич поднимает: «За тех, кто не дожил».',
    options: [
      { label: 'Выпить со всеми', outcomes: [{ w: 7, text: 'Пели, вспоминали волю. Хата стала ближе.', authority: 3, energy: -10 }, { w: 3, text: 'Ночной обход учуял. Всем по выговору.', authority: 2, hp: -0.1 }] },
      { label: 'Налить деду и уйти спать', outcomes: [{ w: 1, text: 'Дед кивнул: «Голова у тебя на месте».', xp: 10, energy: 15 }] },
    ],
  },

  // Голубь с воли
  {
    id: 'dove_1', who: 'sheet/cast/hermit', name: 'Отшельник', where: 'yard',
    text: 'На решётку сел голубь с кольцом на лапке. Отшельник шепчет: «Почтовый. Не спугни».',
    options: [
      { label: 'Покормить хлебом', outcomes: [{ w: 7, text: 'Голубь ест с ладони. Приходит снова и снова.', xp: 4, next: 'dove_2' }, { w: 3, text: 'Вспорхнул и улетел. Может, вернётся.' }] },
      { label: 'Поймать', outcomes: [{ w: 4, text: 'Поймал! В кольце — записка с номером телефона.', xp: 6 }, { w: 6, text: 'Упустил, ещё и получил клювом.', hp: -0.03 }] },
    ],
  },
  {
    id: 'dove_2', who: 'sheet/cast/hermit', name: 'Отшельник', where: 'yard', chain: true,
    text: '«Он к тебе привык. Привяжи маляву — улетит к своим, на волю».',
    options: [
      { label: 'Написать родным', outcomes: [{ w: 1, text: 'Голубь улетел. Остаётся ждать.', xp: 5, next: 'dove_3' }] },
      { label: 'Написать барыге с воли', need: { mast: ['blat'] }, outcomes: [{ w: 1, text: 'Заказал грев по старым связям.', next: 'dove_3' }] },
      { label: 'Отпустить так', outcomes: [{ w: 1, text: 'Птица должна летать. Отшельник улыбнулся.', energy: 15 }] },
    ],
  },
  {
    id: 'dove_3', who: 'sheet/cast/hermit', name: 'Отшельник', where: 'yard', chain: true,
    text: 'Голубь вернулся! На лапке — туго свёрнутый свёрток.',
    options: [{ label: 'Развернуть', outcomes: [{ w: 6, text: 'Деньги и письмо. Руки дрожат.', money: 3, energy: 20 }, { w: 3, text: 'Пара бинтов и сигареты. Родные знают, что нужно.', item: true, butts: 5 }, { w: 1, text: 'Золотое колечко! Кто-то очень ждёт тебя.', gold: 3 }] }],
  },

  // Первоход просит защиты
  {
    id: 'rook_1', who: 'sheet/cast/youngster', name: 'Первоход', where: 'any', minLevel: 5,
    text: 'Первоход шепчет у шконки: «Меня прессуют. Скажи слово — отстанут».',
    options: [
      { label: 'Взять под крыло', outcomes: [{ w: 1, text: '«Он со мной». Посмотрим, кто полезет.', authority: 1, next: 'rook_2' }] },
      { label: 'Научить драться', outcomes: [{ w: 1, text: 'Показал пару приёмов. Способный.', xp: 12 }] },
      { label: 'Сам разберётся', outcomes: [nothing('Первоход ушёл, опустив голову. Зона учит всех.')] },
    ],
  },
  {
    id: 'rook_2', who: 'sheet/cast/brute', name: 'Качок', where: 'yard', chain: true,
    text: 'На прогулке Качок с дружками зажал твоего первохода: «Тебе чего? Он наш».',
    options: [
      { label: 'Встать рядом', outcomes: [{ w: 6, text: 'Качок смерил тебя взглядом и отступил.', authority: 3, next: 'rook_3' }, { w: 4, text: 'Сцепились. Отстоял, но нос в крови.', hp: -0.2, authority: 4, next: 'rook_3' }] },
      { label: 'Показать звёзды на плечах', need: { tattoo: 't_stars' }, outcomes: [{ w: 1, text: 'Качок увидел наколки, извинился и увёл своих.', authority: 5, next: 'rook_3' }] },
      { label: 'Договориться (6 🚬)', cost: { butts: 6 }, outcomes: [{ w: 1, text: 'Откупились. Первоход смотрит с благодарностью.', next: 'rook_3' }] },
    ],
  },
  {
    id: 'rook_3', who: 'sheet/cast/youngster', name: 'Первоход', where: 'any', chain: true,
    text: 'Первоход приносит свёрток: «Мать прислала. Это тебе — за всё».',
    options: [{ label: 'Принять', outcomes: [{ w: 1, text: 'Домашнее сало и носки. На зоне дороже золота.', item: true, energy: 25, xp: 10 }] }, { label: 'Отказаться — ему нужнее', outcomes: [{ w: 1, text: 'Пацан едва не заплакал. Слух о тебе разошёлся по зоне.', authority: 4 }] }],
  },

  // Письмо матери
  {
    id: 'mom_1', who: 'sheet/cast/guardwoman', name: 'Почтальонша', where: 'any',
    text: '«Тебе письмо. Мать пишет». Конверт вскрыт цензурой, но почерк родной.',
    options: [
      { label: 'Прочитать сразу', outcomes: [{ w: 1, text: '«Сынок, держись. Жду». Надо ответить.', energy: 15, next: 'mom_2' }] },
      { label: 'Спрятать до ночи', outcomes: [{ w: 1, text: 'Ночью при свете фонаря с вышки прочёл трижды.', xp: 8, next: 'mom_2' }] },
    ],
  },
  {
    id: 'mom_2', who: 'sheet/cast/writer', name: 'Писарь', where: 'any', chain: true,
    text: 'Писарь за пачку готов помочь с ответом: «Складно напишу, мать прослезится».',
    options: [
      { label: 'Писать самому', outcomes: [{ w: 1, text: 'Три черновика, кривые буквы. Зато честно.', xp: 12, next: 'mom_3' }] },
      { label: 'Попросить писаря (3 🚬)', cost: { butts: 3 }, outcomes: [{ w: 1, text: 'Вышло как в книжке. Отправили.', next: 'mom_3' }] },
    ],
  },
  {
    id: 'mom_3', who: 'sheet/cast/guardwoman', name: 'Почтальонша', where: 'any', chain: true,
    text: 'Через неделю — передача. В ней записка: «Получила. Плакала. Люблю».',
    options: [{ label: 'Открыть передачу', outcomes: [{ w: 1, text: 'Пироги, тёплые носки и немного денег.', money: 3, item: true, energy: 30 }] }],
  },

  // Карточный долг соседа
  {
    id: 'cdebt_1', who: 'sheet/cast/bandaged', name: 'Сосед по шконке', where: 'any', minLevel: 6,
    text: 'Сосед проигрался в буру: «Если до отбоя не отдам — мне конец. Помоги…»',
    options: [
      { label: 'Отыграть за него', outcomes: [{ w: 1, text: 'Садишься к катале. Ставки высокие.', next: 'cdebt_2' }] },
      { label: 'Дать денег (3 пайки)', cost: { money: 3 }, outcomes: [{ w: 1, text: 'Сосед отдал долг. Должен теперь тебе.', authority: 2, next: 'cdebt_3' }] },
      { label: 'Карточный долг — святое', outcomes: [nothing('«Проиграл — плати». Сосед побледнел.')] },
    ],
  },
  {
    id: 'cdebt_2', who: 'sheet/cast/gypsy', name: 'Катала', where: 'any', chain: true,
    text: 'Катала тасует колоду слишком ловко. «Ставишь за друга? Играем на всё».',
    options: [
      { label: 'Играть честно', outcomes: [{ w: 4, text: 'Отыграл! Долг закрыт, ещё и сверху.', money: 3, authority: 3, next: 'cdebt_3' }, { w: 6, text: 'Проиграл. Теперь должны оба.', money: -2 }] },
      { label: 'Поймать на шулерстве', need: { tattoo: 't_cards' }, outcomes: [{ w: 1, text: 'Масти на пальцах — знаешь все трюки. Катала пойман, долг списан.', authority: 5, money: 2, next: 'cdebt_3' }] },
      { label: 'Встать и уйти', outcomes: [nothing('Катала усмехнулся. Соседу не позавидуешь.')] },
    ],
  },
  {
    id: 'cdebt_3', who: 'sheet/cast/bandaged', name: 'Сосед по шконке', where: 'any', chain: true,
    text: 'Сосед отдаёт тебе заначку: «Жизнь мне спас. Тут всё, что есть».',
    options: [{ label: 'Взять', outcomes: [{ w: 1, text: 'Бычки, пайка и заточка.', butts: 8, item: true }] }, { label: 'Оставить ему половину', outcomes: [{ w: 1, text: 'Поделили по-людски.', butts: 4, authority: 2 }] }],
  },

  // Подкоп из-под бани
  {
    id: 'dig_1', who: 'sheet/cast/sport', name: 'Спортсмен', where: 'yard', minLevel: 8,
    text: 'Спортсмен отводит в сторону: «Мы под баней роем. Нужны руки. Выход — за периметр».',
    options: [
      { label: 'Вписаться', outcomes: [{ w: 1, text: 'Ночью первая смена. Руки в земле.', energy: -20, next: 'dig_2' }] },
      { label: 'Сдать подкоп', need: { mast: ['kozel'] }, outcomes: [{ w: 1, text: 'Начальник пожал руку. Спортсмен теперь твой враг.', money: 6, authority: -4 }] },
      { label: 'Не видел, не слышал', outcomes: [nothing('Спортсмен кивнул: «Молчание — тоже помощь».')] },
    ],
  },
  {
    id: 'dig_2', who: 'sheet/cast/sport', name: 'Спортсмен', where: 'any', chain: true, night: true,
    text: 'Ночь. Туннель уходит под фундамент. Сверху скрипят шаги обхода.',
    options: [
      { label: 'Копать дальше', outcomes: [{ w: 5, text: 'Проскочили. До забора — метров десять.', xp: 20, next: 'dig_3' }, { w: 5, text: 'Обвал! Еле вылез.', hp: -0.3 }] },
      { label: 'Замереть и ждать', outcomes: [{ w: 1, text: 'Обход прошёл. Сегодня хватит.', xp: 8, next: 'dig_3' }] },
    ],
  },
  {
    id: 'dig_3', who: 'sheet/cast/omon', name: 'Облава', where: 'any', chain: true,
    text: 'Утром — облава: собаки учуяли землю у бани. Всех строят на плацу.',
    options: [
      { label: 'Стоять спокойно', outcomes: [{ w: 6, text: 'На тебя не подумали. Подкоп засыпали, но слава осталась.', authority: 5 }, { w: 4, text: 'Земля под ногтями выдала. ШИЗО.', hp: -0.25, authority: 6 }] },
      { label: 'Взять вину на себя', outcomes: [{ w: 1, text: 'Неделя ШИЗО. Вся зона знает, кто не сдал своих.', hp: -0.3, authority: 10 }] },
    ],
  },
];

// --- Случаи по масти ---------------------------------------------------------------------

const MAST_EVENTS: GameEvent[] = [
  {
    id: 'm_razbor', who: 'sheet/cast/brute', name: 'Спорщики', where: 'any', mast: ['blat'],
    text: 'Двое не поделили место у окна и пришли к тебе: «Рассуди по понятиям».',
    options: [
      { label: 'Рассудить по справедливости', outcomes: [{ w: 8, text: 'Оба согласились. Слово твоё весит.', authority: 4 }, { w: 2, text: 'Один затаил обиду.', authority: 2 }] },
      { label: 'Взять за решение (4 🚬 с каждого)', outcomes: [{ w: 1, text: 'Бесплатно только сыр в мышеловке.', butts: 8, authority: 1 }] },
    ],
  },
  {
    id: 'm_obshak', who: 'sheet/cast/avtoritet', name: 'Смотрящий', where: 'any', mast: ['blat'],
    text: '«На общак собираем, на тех, кто в ШИЗО. Ты человек не последний».',
    options: [
      { label: 'Уделить (2 пайки)', cost: { money: 2 }, outcomes: [{ w: 1, text: '«Правильно». Смотрящий пожал руку.', authority: 5, rep: { brat: 6 } }] },
      { label: 'Уделить бычками (8 🚬)', cost: { butts: 8 }, outcomes: [{ w: 1, text: 'Бычки ушли в ШИЗО. Там их ждут.', authority: 4, rep: { brat: 5 } }] },
      { label: 'Сейчас пусто', outcomes: [{ w: 1, text: '«Бывает. Запомню». Прозвучало не очень.', authority: -2 }] },
    ],
  },
  {
    id: 'm_pravilka', who: 'sheet/cast/avtoritet', name: 'Правилка', where: 'any', mast: ['blat'], minLevel: 10,
    text: 'Тебя позвали на правилку: крысу поймали с чужой пайкой. «Твоё слово?»',
    options: [
      { label: 'Наказать строго', outcomes: [{ w: 1, text: 'Приговор жёсткий. Зона запомнит.', authority: 5 }] },
      { label: 'Дать шанс отработать', outcomes: [{ w: 1, text: 'Крыса месяц драит полы. Милосердие тоже сила.', authority: 3, xp: 10 }] },
    ],
  },
  {
    id: 'm_norma', who: 'sheet/cast/worker', name: 'Бригадир', where: 'any', mast: ['muzhik'],
    text: 'Бригадир: «Ты вчера две нормы дал. Мастер хочет видеть — премию обещают».',
    options: [
      { label: 'Пойти к мастеру', outcomes: [{ w: 7, text: 'Премия и доска почёта. Мелочь, а приятно.', money: 3, xp: 8 }, { w: 3, text: 'Премию «забыли» начислить. Зато норму подняли.', xp: 5 }] },
      { label: 'Отдать премию бригаде', outcomes: [{ w: 1, text: 'Бригада за тебя горой.', authority: 4, rep: { work: 8 } }] },
    ],
  },
  {
    id: 'm_stanok', who: 'sheet/cast/coverall', name: 'Мастер цеха', where: 'any', mast: ['muzhik'],
    text: 'Станок встал посреди смены. Мастер хватается за голову: «Кто починит — отпущу пораньше».',
    options: [
      { label: 'Разобрать и починить', outcomes: [{ w: 6, text: 'Ремень сменил, станок загудел.', energy: 25, xp: 10 }, { w: 4, text: 'Прищемил палец, но починил.', hp: -0.08, xp: 12 }] },
      { label: 'Подсказать, но не лезть', outcomes: [{ w: 1, text: 'Мастер сам справился по твоей подсказке.', xp: 5 }] },
    ],
  },
  {
    id: 'm_levak', who: 'sheet/cast/seller', name: 'Барыга', where: 'any', mast: ['muzhik'], minLevel: 8,
    text: 'Барыга: «Нарды из наборного дерева сделаешь? На воле за такие платят хорошо».',
    options: [
      { label: 'Сделать за вечер', outcomes: [{ w: 7, text: 'Нарды ушли на волю. Барыга рассчитался.', money: 5, energy: -15 }, { w: 3, text: 'Мастер застал за левой работой. Штраф.', money: -1 }] },
      { label: 'Отказаться', outcomes: [nothing('Руки для дела, а не для барыг.')] },
    ],
  },
  {
    id: 'm_sdp', who: 'sheet/cast/officer', name: 'Дежурный', where: 'any', mast: ['kozel'],
    text: '«Твоя смена на воротах локалки. Кто без повязки — записывай».',
    options: [
      { label: 'Записывать всех', outcomes: [{ w: 1, text: 'Администрация довольна. Барак — нет.', money: 3, energy: 20, authority: -2, rep: { admin: 6 } }] },
      { label: 'Закрыть глаза за бычки', outcomes: [{ w: 7, text: 'И волки сыты, и в кармане звенит.', butts: 8 }, { w: 3, text: 'Дежурный проверил списки. Выговор.', money: -1 }] },
    ],
  },
  {
    id: 'm_report', who: 'sheet/cast/lawyer', name: 'Опер', where: 'any', mast: ['kozel'],
    text: 'Опер ждёт недельный отчёт: «Что в бараке? Только без воды».',
    options: [
      { label: 'Рассказать правду', outcomes: [{ w: 1, text: 'Опер кивает, пишет. Характеристика к УДО — лучше.', xp: 15, authority: -2, rep: { admin: 5 } }] },
      { label: 'Наболтать общих слов', outcomes: [{ w: 6, text: 'Прокатило.', xp: 5 }, { w: 4, text: '«Халтуришь». Опер недоволен.', energy: -15 }] },
    ],
  },
  {
    id: 'm_aktiv', who: 'sheet/cast/officer', name: 'Собрание актива', where: 'any', mast: ['kozel'], minLevel: 10,
    text: 'Собрание актива. Начальник предлагает тебя в председатели совета отряда.',
    options: [
      { label: 'Согласиться', outcomes: [{ w: 1, text: 'Кабинет, чайник и ключ от ленинской комнаты.', money: 6, energy: 30, authority: -3 }] },
      { label: 'Скромно отказаться', outcomes: [{ w: 1, text: '«Похвально». Начальство запомнило, братва тоже.', xp: 12 }] },
    ],
  },
  {
    id: 'm_bunt', who: 'sheet/cast/brute', name: 'Отрицалы', where: 'any', mast: ['otric'],
    text: 'Отрицалы шепчутся: «Завтра все отказываемся выходить на работу. Ты с нами?»',
    options: [
      { label: 'Поддержать', outcomes: [{ w: 5, text: 'Отказ прошёл. Администрация пошла на уступки.', authority: 6, energy: 20 }, { w: 5, text: 'Всех зачинщиков — в ШИЗО.', hp: -0.25, authority: 6 }] },
      { label: 'Возглавить', outcomes: [{ w: 1, text: 'Ты теперь голос барака. Опасно, но почётно.', authority: 9, hp: -0.2, rep: { brat: 10 } }] },
    ],
  },
  {
    id: 'm_provoke', who: 'sheet/cast/omon', name: 'Прапор', where: 'yard', mast: ['otric'],
    text: 'Прапор цепляется: «Руки из карманов! Глаза в пол!»',
    options: [
      { label: 'Посмотреть в глаза', outcomes: [{ w: 5, text: 'Прапор отвёл взгляд первым.', authority: 4 }, { w: 5, text: 'Дубинка. Но взгляд ты не опустил.', hp: -0.2, authority: 5 }] },
      { label: 'Ответить острым словом', outcomes: [{ w: 1, text: 'Двор хохочет. Прапор багровеет — жди подлянки.', authority: 3, energy: -10 }] },
    ],
  },
  {
    id: 'm_golod', who: 'sheet/cast/doctor', name: 'Лепила', where: 'any', mast: ['otric'], minLevel: 10,
    text: 'Третий день голодовки. Лепила уговаривает: «Съешь хоть бульон, дурья голова».',
    options: [
      { label: 'Держаться', outcomes: [{ w: 6, text: 'Администрация сдалась — передачи вернули всему бараку.', authority: 8, hp: -0.3 }, { w: 4, text: 'Увезли в санчасть под капельницу.', hp: -0.2, authority: 4 }] },
      { label: 'Съесть бульон', outcomes: [{ w: 1, text: 'Тепло разлилось по телу. Ещё поборешься.', hp: 0.3 }] },
    ],
  },
];

// --- Ночные ---------------------------------------------------------------------------------

const NIGHT: GameEvent[] = [
  {
    id: 'n_noise', who: 'sheet/cast/thin', name: 'Ночь', where: 'any', night: true,
    text: 'Среди ночи — шорох у твоей тумбочки. Тощая тень замирает.',
    options: [
      { label: 'Схватить за руку', outcomes: [{ w: 6, text: 'Крыса! Вернул своё и чужое.', butts: 6, authority: 2 }, { w: 4, text: 'Вырвался и убежал в темноту.', xp: 3 }] },
      { label: 'Притвориться спящим', outcomes: [{ w: 1, text: 'Утром пропала пачка. Зато знаешь, кто.', butts: -4, xp: 6 }] },
    ],
  },
  {
    id: 'n_shmon', who: 'sheet/cast/spetsnaz', name: 'Ночной шмон', where: 'any', night: true, minLevel: 3,
    text: 'Два часа ночи. Свет в лицо: «Подъём! Всем к стене!»',
    options: [
      { label: 'Встать спокойно', outcomes: [{ w: 6, text: 'Перевернули всё, но у тебя чисто.', xp: 5 }, { w: 4, text: 'Нашли заначку.', butts: -5 }] },
      { label: 'Огрызнуться', outcomes: [{ w: 1, text: 'Приклад в спину. Хата оценила.', hp: -0.15, authority: 3 }] },
    ],
  },
  {
    id: 'n_phone', who: 'sheet/cast/blatnoy', name: 'Сосед', where: 'any', night: true,
    text: 'Под подушкой соседа вибрирует телефон. Он сонно протягивает: «Хочешь позвонить домой? Пять минут».',
    options: [
      { label: 'Позвонить (3 🚬)', cost: { butts: 3 }, outcomes: [{ w: 8, text: 'Голос мамы. Всю ночь не спится — от счастья.', energy: 30 }, { w: 2, text: 'Спалились на обходе. Телефон изъяли.', authority: -1 }] },
      { label: 'Не рисковать', outcomes: [nothing('Отвернулся к стене. Утром звонок будет сниться.')] },
    ],
  },
  {
    id: 'n_dream', who: 'sheet/cast/priest', name: 'Сон', where: 'any', night: true,
    text: 'Снится воля: река, мост, запах хлеба. Кто-то зовёт по имени.',
    options: [
      { label: 'Идти на голос', outcomes: [{ w: 1, text: 'Проснулся с мокрыми глазами и странной силой.', energy: 20, xp: 5 }] },
      { label: 'Проснуться', outcomes: [{ w: 1, text: 'Потолок. Храп. Решётка. Но сон остался.', xp: 3 }] },
    ],
  },
  {
    id: 'n_fire', who: 'sheet/cast/bandaged', name: 'Пожар', where: 'any', night: true, minLevel: 4,
    text: 'Запах дыма! В соседней хате горит матрас, люди кашляют за дверью.',
    options: [
      { label: 'Выбить кормушку и лить воду', outcomes: [{ w: 7, text: 'Потушили. Соседи обязаны жизнью.', authority: 5, hp: -0.1 }, { w: 3, text: 'Надышался дыма, но всех спасли.', authority: 6, hp: -0.25 }] },
      { label: 'Колотить в дверь, звать конвой', outcomes: [{ w: 1, text: 'Конвой прибежал вовремя.', xp: 8 }] },
    ],
  },
  {
    id: 'n_star', who: 'sheet/cast/oldman', name: 'Старик у окна', where: 'any', night: true,
    text: 'Старик не спит у решётки: «Смотри — звезда падает. Загадывай, пока летит».',
    options: [
      { label: 'Загадать волю', outcomes: [{ w: 9, text: 'Звезда погасла. Но на душе светлее.', energy: 15 }, { w: 1, text: 'Наутро — неожиданный перевод денег с воли!', money: 4 }] },
      { label: 'Спросить, что загадал он', outcomes: [{ w: 1, text: '«Чтобы ты не вернулся сюда». Долго молчали.', xp: 10 }] },
    ],
  },
  {
    id: 'n_tea', who: 'sheet/cast/ushanka', name: 'Дед Митрич', where: 'any', night: true,
    text: 'Дед варит чифир на свечке: «Не спится? Садись, расскажу, как в восьмидесятых сидели».',
    options: [
      { label: 'Слушать до утра', outcomes: [{ w: 1, text: 'Истории — лучше любой книжки. Кое-что пригодится.', xp: 14, energy: -10 }] },
      { label: 'Хлебнуть и спать', outcomes: [{ w: 1, text: 'Сердце колотится, зато утром как огурец.', energy: 20 }] },
    ],
  },
  {
    id: 'n_escapee', who: 'sheet/cast/sport', name: 'Беглец', where: 'any', night: true, minLevel: 6,
    text: 'Сирена! В окно видно: кто-то лезет по крыше к забору.',
    options: [
      { label: 'Отвлечь вышку криком', outcomes: [{ w: 5, text: 'Прожектор метнулся к вашему окну. Беглец ушёл!', authority: 5 }, { w: 5, text: 'Беглеца взяли, тебе — рапорт.', authority: 3, energy: -15 }] },
      { label: 'Смотреть молча', outcomes: [nothing('Его взяли у самого забора. Утром — показательное построение.')] },
      { label: 'Доложить', need: { mast: ['kozel'] }, outcomes: [{ w: 1, text: 'Благодарность в личное дело.', money: 4, authority: -3 }] },
    ],
  },
];

// --- Для бывалых и двора -----------------------------------------------------------------------

const MORE: GameEvent[] = [
  {
    id: 'x_prosecutor', who: 'sheet/cast/lawyer', name: 'Проверка из прокуратуры', where: 'any', minLevel: 10,
    text: 'Прокурорская проверка. Мужчина в костюме: «Жалобы на условия содержания есть?»',
    options: [
      { label: 'Пожаловаться на всё', outcomes: [{ w: 5, text: 'Записал. Через неделю — новые матрасы.', authority: 3, energy: 15 }, { w: 5, text: 'Проверка уехала, а начальник остался.', hp: -0.15, authority: 3 }] },
      { label: '«Всё хорошо, гражданин прокурор»', outcomes: [{ w: 1, text: 'Начальник довольно улыбается.', money: 2, authority: -1 }] },
      { label: 'Передать жалобу за весь барак', need: { level: 15 }, outcomes: [{ w: 1, text: 'Жалобу приняли. Барак тебе должен.', authority: 7 }] },
    ],
  },
  {
    id: 'x_tv', who: 'sheet/cast/youngster', name: 'Ленинская комната', where: 'any',
    text: 'В ленинке телевизор: футбол, наши проигрывают. Спор, кто щёлкнет каналом на сериал.',
    options: [
      { label: 'Болеть за наших', outcomes: [{ w: 5, text: 'Отыгрались на последней минуте! Ор на всю зону.', energy: 15 }, { w: 5, text: 'Проиграли. Весь вечер хмурые рожи.', xp: 2 }] },
      { label: 'Переключить на сериал', outcomes: [{ w: 1, text: 'Половина комнаты освистала, половина — благодарит.', authority: -1, xp: 4 }] },
    ],
  },
  {
    id: 'x_rain', who: 'sheet/cast/omon', name: 'Ливень', where: 'yard',
    text: 'Посреди прогулки хлынул ливень. Конвой не пускает внутрь: «Время ещё не вышло».',
    options: [
      { label: 'Стоять и мокнуть', outcomes: [{ w: 7, text: 'Промок до нитки, но стоял как скала.', authority: 2, hp: -0.05 }, { w: 3, text: 'Простыл.', hp: -0.15 }] },
      { label: 'Встать под навес со всеми', outcomes: [{ w: 1, text: 'Прижались плечами, травили байки. Хорошо.', energy: 10 }] },
    ],
  },
  {
    id: 'x_dog', who: 'sheet/cast/hermit', name: 'Бездомный пёс', where: 'yard',
    text: 'Под забором пролез тощий пёс и жмётся к твоим ногам.',
    options: [
      { label: 'Поделиться пайкой', outcomes: [{ w: 1, text: 'Пёс приходит каждый день. Зона стала чуть теплее.', energy: 15, xp: 5 }] },
      { label: 'Прогнать', outcomes: [{ w: 1, text: 'Убежал, поджав хвост.' }] },
    ],
  },
  {
    id: 'x_pullup', who: 'sheet/cast/sport', name: 'Спортсмен', where: 'yard', minLevel: 2,
    text: '«На турнике — кто больше подтянется. Ставка — пачка».',
    options: [
      { label: 'Принять спор (5 🚬)', cost: { butts: 5 }, outcomes: [{ w: 45, text: 'Двадцать раз! Спортсмен развёл руками.', butts: 11, authority: 2 }, { w: 55, text: 'Сорвался на пятнадцатом. Спортсмен — двадцать.', xp: 5 }] },
      { label: 'Просто позаниматься', outcomes: [{ w: 1, text: 'Руки гудят. Сила растёт.', xp: 8, energy: -10 }] },
    ],
  },
  {
    id: 'x_snitch', who: 'sheet/cast/thin', name: 'Записка', where: 'any', minLevel: 4,
    text: 'В матрасе нашёл чужую записку: чей-то донос оперу, ещё не отправленный.',
    options: [
      { label: 'Показать смотрящему', outcomes: [{ w: 1, text: 'Стукача вычислили. Ты — молодец.', authority: 5 }] },
      { label: 'Сжечь', outcomes: [{ w: 1, text: 'Пепел в парашу. Никто не пострадал.', xp: 6 }] },
      { label: 'Шантажировать автора', outcomes: [{ w: 6, text: 'Платит исправно.', butts: 10 }, { w: 4, text: 'Автор оказался с зубами.', hp: -0.2 }] },
    ],
  },
  {
    id: 'x_barber2', who: 'sheet/cast/barber', name: 'Парикмахер', where: 'any',
    text: 'Парикмахер щёлкает ножницами: «Под ноль положено. Но могу оставить чёлку — за пачку».',
    options: [
      { label: 'Под ноль', outcomes: [{ w: 1, text: 'Голова мёрзнет, зато по уставу.', xp: 3 }] },
      { label: 'Оставить чёлку (5 🚬)', cost: { butts: 5 }, outcomes: [{ w: 7, text: 'Модный, как на воле.', authority: 2 }, { w: 3, text: 'Дежурный заметил — обрили заново.', xp: 1 }] },
    ],
  },
  {
    id: 'x_cook_leftover', who: 'sheet/cast/cook', name: 'Повар', where: 'any',
    text: 'Повар подмигивает у раздачи: «Котлеты остались. С офицерского стола».',
    options: [
      { label: 'Взять (1 пайка)', cost: { money: 1 }, outcomes: [{ w: 8, text: 'Настоящее мясо! Силы прибавилось.', energy: 25, hp: 0.15 }, { w: 2, text: 'Котлета оказалась вчерашней…', hp: -0.1 }] },
      { label: 'Отказаться', outcomes: [nothing('Каша так каша.')] },
    ],
  },
  {
    id: 'x_chess2', who: 'sheet/cast/oldman', name: 'Профессор', where: 'any', minLevel: 5,
    text: 'Бывший профессор математики расставляет шахматы: «Сыграем на интерес? Я даю ферзя форы».',
    options: [
      { label: 'Сыграть на интерес', outcomes: [{ w: 3, text: 'Даже с форой… Нет, выиграл!', xp: 15, authority: 2 }, { w: 7, text: 'Мат на двенадцатом ходу. Профессор разбирает ошибки.', xp: 10 }] },
      { label: 'Попросить научить', outcomes: [{ w: 1, text: 'Час лекции. Голова пухнет, но становишься умнее.', xp: 12, energy: -10 }] },
    ],
  },
  {
    id: 'x_icon', who: 'sheet/cast/priest', name: 'Батюшка', where: 'any',
    text: 'Батюшка раздаёт бумажные иконки: «Возьми, сын. Может, пригодится».',
    options: [
      { label: 'Взять и поблагодарить', outcomes: [{ w: 1, text: 'Спрятал под подушку. Спится спокойнее.', energy: 15 }] },
      { label: 'Показать распятие на груди', need: { tattoo: 't_crucifix' }, outcomes: [{ w: 1, text: 'Батюшка перекрестил: «Вижу, веруешь». Благословил на дорогу.', hp: 0.3, energy: 20 }] },
      { label: '«Не верю я, отец»', outcomes: [{ w: 1, text: '«А Он в тебя верит». Батюшка ушёл, оставив иконку на тумбочке.', xp: 4 }] },
    ],
  },
  {
    id: 'x_letter_wife', who: 'sheet/cast/guardwoman', name: 'Почтальонша', where: 'any', minLevel: 7,
    text: 'Письмо от жены. Короткое. Пишет, что устала ждать.',
    options: [
      { label: 'Написать длинный ответ', outcomes: [{ w: 5, text: 'Через месяц: «Прости. Жду». Камень с души.', energy: 30 }, { w: 5, text: 'Ответа нет. Держись.', xp: 10 }] },
      { label: 'Отпустить её', outcomes: [{ w: 1, text: 'Больно, но честно. Сердце станет крепче.', xp: 15, authority: 2 }] },
    ],
  },
  {
    id: 'x_heart_tat', who: 'sheet/cast/kolshik', name: 'Кольщик', where: 'any',
    text: 'Кольщик заметил твою наколку: «Сердце со стрелой? Ну-ка рассказывай, кто она».',
    need: { tattoo: 't_heart' },
    options: [
      { label: 'Рассказать', outcomes: [{ w: 1, text: 'Вся хата слушала. Кольщик набил бесплатно ещё пару точек.', xp: 10, energy: 10 }] },
      { label: '«Не твоё дело»', outcomes: [{ w: 1, text: '«Уважаю». Кольщик отстал.', authority: 1 }] },
    ],
  },
  {
    id: 'x_wolf_tat', who: 'sheet/cast/brute', name: 'Беспредельщик', where: 'yard', minLevel: 9,
    text: 'Новый этап. Здоровый беспредельщик ищет, кого бы подмять.',
    options: [
      { label: 'Оскалиться волком', need: { tattoo: 't_wolf' }, outcomes: [{ w: 1, text: 'Он увидел наколку и решил не связываться.', authority: 4 }] },
      { label: 'Драться', outcomes: [{ w: 5, text: 'Лёг. Этап понял, кто тут кто.', authority: 5, hp: -0.15 }, { w: 5, text: 'Здоровый, гад. Разошлись вничью.', hp: -0.3, authority: 2 }] },
      { label: 'Обойти стороной', outcomes: [nothing('Пусть других ищет.')] },
    ],
  },
  {
    id: 'x_medal', who: 'sheet/cast/oldman', name: 'Ветеран', where: 'any', minLevel: 6,
    text: 'Старый зэк достаёт орден: «Афган. Двое детей. И вот я здесь. Сохрани, если помру».',
    options: [
      { label: 'Сохранить', outcomes: [{ w: 1, text: 'Завернул в тряпицу. Слово дал — держи.', authority: 3, xp: 8 }] },
      { label: 'Отказаться — не имею права', outcomes: [{ w: 1, text: '«Правильный ты». Ветеран убрал орден.', xp: 5 }] },
    ],
  },
  {
    id: 'x_gym_bet', who: 'sheet/cast/sport', name: 'Качалка', where: 'any', minLevel: 12,
    text: 'В самодельной качалке спор: жим штанги из траков. «Пожмёшь сотку — пачка твоя».',
    options: [
      { label: 'Жать', outcomes: [{ w: 5, text: 'Сотка! Зал ревёт.', butts: 10, authority: 3 }, { w: 5, text: 'Штанга легла на грудь. Сняли вдвоём.', hp: -0.15 }] },
      { label: 'Подстраховать другого', outcomes: [{ w: 1, text: 'Спас от травмы. Благодарны.', authority: 2 }] },
    ],
  },
  {
    id: 'x_tunnel_rumor', who: 'sheet/cast/gypsy', name: 'Цыган', where: 'yard', minLevel: 8,
    text: 'Цыган торгует слухами: «Кум на пенсию уходит. Новый — зверь. Знать, кому занести, — дорого стоит».',
    options: [
      { label: 'Купить слух (2 пайки)', cost: { money: 2 }, outcomes: [{ w: 7, text: 'Слух верный. Подготовился заранее.', xp: 20 }, { w: 3, text: 'Цыган наврал. Деньги ушли.' }] },
      { label: 'Послать', outcomes: [nothing('Цыган пожал плечами и пошёл к следующему.')] },
    ],
  },
  {
    id: 'x_quarantine', who: 'sheet/cast/doctor', name: 'Санчасть', where: 'any', minLevel: 5,
    text: 'В бараке грипп. Лепила ставит на карантин: неделя без работы и прогулок.',
    options: [
      { label: 'Отлежаться', outcomes: [{ w: 1, text: 'Отоспался впервые за годы.', hp: 0.5, energy: 30 }] },
      { label: 'Выпросить работу в санчасти', outcomes: [{ w: 1, text: 'Моешь полы, зато кормят лучше.', money: 2, xp: 8 }] },
    ],
  },
  {
    id: 'x_mother_tat', who: 'sheet/cast/ushanka', name: 'Дед Митрич', where: 'any',
    need: { tattoo: 't_mother' },
    text: 'Дед увидел твою наколку «Не забуду мать родную» и молча протянул фотокарточку своей матери.',
    options: [{ label: 'Посидеть рядом', outcomes: [{ w: 1, text: 'Долго молчали. Потом дед отдал тебе свою пайку сала.', energy: 25, authority: 2 }] }],
  },
];

export const EVENTS_MORE: GameEvent[] = [...CHAINS, ...MAST_EVENTS, ...NIGHT, ...MORE];
