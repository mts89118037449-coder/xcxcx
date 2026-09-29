// Масть, срок до УДО и ходки, вступление-этапирование и неделя грева.
// Всё это задаёт долгую цель: выбрать путь, отсидеть срок, выйти — и зайти второй ходкой сильнее.

// --- Масть -----------------------------------------------------------------------

export type Mast = 'blat' | 'muzhik' | 'kozel' | 'otric';

export interface MastInfo {
  id: Mast;
  name: string;
  emoji: string;
  who: string; // кто зовёт в масть
  pitch: string;
  perks: string[];
  /** проценты: к добыче в наездах, авторитету, заработку на сменах, опыту смен, поручениям, атаке, криту (очки),
   *  макс. энергии (очки), откату боссов (минус), награде за побег */
  bonus: { pvpLoot?: number; authority?: number; jobMoney?: number; jobXp?: number; questMoney?: number; atk?: number; crit?: number; energy?: number; bossCd?: number; escape?: number };
}

export const MASTS: MastInfo[] = [
  {
    id: 'blat', name: 'Блатной', emoji: '🃏', who: 'sheet/cast/blatnoy',
    pitch: 'Живёшь по понятиям, решаешь вопросы, с тебя спрос — и тебе почёт.',
    perks: ['+25% добычи в наездах', '+20% авторитета', '+2% крита'],
    bonus: { pvpLoot: 25, authority: 20, crit: 2 },
  },
  {
    id: 'muzhik', name: 'Мужик', emoji: '⚒️', who: 'sheet/cast/worker',
    pitch: 'Работаешь, не лезешь в чужие дела. Тебя уважают за руки и слово.',
    perks: ['+25% денег за смены', '+15% опыта за смены', '+15 к энергии'],
    bonus: { jobMoney: 25, jobXp: 15, energy: 15 },
  },
  {
    id: 'kozel', name: 'Активист', emoji: '📋', who: 'sheet/cast/officer',
    pitch: 'Дружишь с администрацией: поблажки, поручения, быстрее откаты. Братва косится.',
    perks: ['+30% денег за поручения', 'Боссы откатываются на 20% быстрее', '−10% авторитета'],
    bonus: { questMoney: 30, bossCd: 20, authority: -10 },
  },
  {
    id: 'otric', name: 'Отрицала', emoji: '✊', who: 'sheet/cast/brute',
    pitch: 'Режим не признаёшь. Злой, резкий, в драке первый, в побеге последний сдаёшься.',
    perks: ['+10% к атаке', '+4% крита', '+30% награды за побег'],
    bonus: { atk: 10, crit: 4, escape: 30 },
  },
];

export const mastById = new Map(MASTS.map((m) => [m.id, m]));
/** С какого уровня выбирается масть и сколько стоит сменить. */
export const MAST_RULES = { minLevel: 5, changeGold: 100, changeAuthorityLoss: 0.3 };

// --- Срок и ходки ------------------------------------------------------------------

/** Сколько дней «сбрасывает» со срока каждое дело. Активный игрок выходит примерно за месяц, спокойный — за три. */
export const TERM = {
  baseDays: 180,
  perHodka: 60, // каждая следующая ходка длиннее
  perEnergy: 0.003, // день за ~330 энергии
  bossWin: 0.05,
  dailyTask: 0.3,
  storyStep: 0.6,
  event: 0.06,
  pvpWin: 0.03,
  escapeCaught: -2, // пойманный при побеге — довесок к сроку
  bonusPerHodka: 10, // % к деньгам и опыту за каждую отсиженную ходку
  maxHodkaBonus: 10, // не больше десяти ходок в бонус
  releaseGold: 50, // золото за освобождение (× номер ходки)
};

export function termDays(hodka: number): number {
  return TERM.baseDays + TERM.perHodka * (hodka - 1);
}

// --- Этапирование: первые минуты в игре ----------------------------------------------

export type IntroScene = 'road' | 'yard' | 'cell' | 'search';

export interface IntroStep {
  scene: IntroScene;
  who: string;
  name: string;
  text: string;
  options: { label: string; reply: string; money?: number; authority?: number; butts?: number; xp?: number; hint?: Mast }[];
}

export const INTRO: IntroStep[] = [
  {
    scene: 'road', who: 'sheet/cast/omon', name: 'Конвой',
    text: 'Автозак встал на обочине посреди ночи. Конвоир выводит по одному и светит фонарём в лицо: «Фамилия? Статья? Первоход?»',
    options: [
      { label: 'Назвать всё как есть', reply: '«Честный. Такие тут долго не живут… или живут долго». Конвоир хмыкнул.', xp: 5, hint: 'muzhik' },
      { label: 'Промолчать и смотреть в пол', reply: 'Конвоир ткнул дубинкой, но отстал. В углу кто-то одобрительно кивнул.', authority: 2, hint: 'otric' },
      { label: 'Попросить закурить', reply: '«Наглый». Сигарету не дал, но и бить не стал. Сосед по лавке сунул тебе бычок.', butts: 3, hint: 'blat' },
    ],
  },
  {
    scene: 'search', who: 'sheet/cast/officer', name: 'Приёмка',
    text: 'Шмон на входе. Вертухай вытряхивает сумку: «Что везём? Деньги, телефоны, колюще-режущее?»',
    options: [
      { label: 'Отдать заначку сразу', reply: 'Вертухай пересчитал, половину вернул: «Молодец. Запомню». Кажется, это не комплимент.', money: 60, hint: 'kozel' },
      { label: 'Спрятать деньги в носок', reply: 'Не нашли! Первые рубли на зоне — твои.', money: 150, hint: 'blat' },
      { label: 'Сказать, что ничего нет', reply: 'Нашли, отобрали, дали по рёбрам. Зато в бараке уже знают: этот не сдаёт.', authority: 3, hint: 'otric' },
    ],
  },
  {
    scene: 'cell', who: 'sheet/cast/ushanka', name: 'Дед Митрич',
    text: 'Хата. Шконки, дым, десяток глаз. Старик в ушанке кивает на свободную койку у параши: «Твоя, первоход. Пока».',
    options: [
      { label: 'Молча занять её', reply: '«Правильно. Место заслужишь делом». Дед протянул кружку с чифиром.', xp: 10, hint: 'muzhik' },
      { label: 'Сказать, что у параши не спишь', reply: 'Тишина. Потом смешок: «Характер есть». Место дали получше — пока присмотрятся.', authority: 3, hint: 'blat' },
      { label: 'Спросить, кто тут смотрящий', reply: '«Шустрый. Узнаешь, когда надо будет». Дед отвернулся к стене.', xp: 5, hint: 'kozel' },
    ],
  },
  {
    scene: 'yard', who: 'sheet/cast/brute', name: 'Качок',
    text: 'Первая прогулка. Здоровяк преграждает путь: «Новенький? С тебя подгон за вход во двор».',
    options: [
      { label: 'Врезать первым', reply: 'Качок опешил, потом засмеялся и хлопнул по плечу: «Годится. Проходи».', authority: 4, hint: 'otric' },
      { label: 'Отдать пару бычков', reply: 'Взял, отошёл. Двор твой — но ненадолго, ещё придёт.', butts: -2, xp: 5, hint: 'muzhik' },
      { label: 'Позвать вертухая', reply: 'Вертухай разогнал. Качок запомнил. Весь двор тоже.', money: 50, authority: -1, hint: 'kozel' },
    ],
  },
  {
    scene: 'cell', who: 'sheet/cast/ushanka', name: 'Дед Митрич',
    text: 'Ночью дед шепчет: «Тут у каждого своя масть. Отсидишь срок с умом — выйдешь по УДО и зайдёшь в следующий раз уже человеком. Держись меня».',
    options: [{ label: 'Держаться деда', reply: 'Дед сунул тебе бинт и песок: «В драке пригодится». Срок пошёл.', xp: 20, money: 100 }],
  },
];

// --- Неделя грева -----------------------------------------------------------------------

/** Награда за каждый день подряд: седьмой — большой. Деньги умножаются на уровень. */
export const DAILY_WEEK: { money?: number; butts?: number; gold?: number; item?: string; chifir?: number; label: string }[] = [
  { money: 100, gold: 1, label: 'Пайка' },
  { butts: 10, gold: 1, label: 'Бычки' },
  { money: 150, item: 'c_bandage', gold: 1, label: 'Бинт' },
  { money: 200, gold: 1, label: 'Деньги' },
  { chifir: 1, gold: 1, label: 'Чифир' },
  { money: 250, item: 'c_insert', gold: 1, label: 'Свинчатка' },
  { money: 400, gold: 10, item: 'c_vodka', label: 'Большой грев' },
];

// --- Уведомления бота ----------------------------------------------------------------------

export const NOTIFY = {
  maxPerDay: 3,
  quietFrom: 23, // по Москве
  quietTo: 9,
  activeWithinDays: 14, // кто давно не заходил — не беспокоим
};
