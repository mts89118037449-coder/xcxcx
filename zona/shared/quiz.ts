// Вечер в клубе: живая викторина по расписанию (13:00 и 20:00 по Москве). Вопросы идут у всех одновременно,
// на ответ 15 секунд, чем быстрее верно — тем больше очков. Половина вопросов — по фене, половина — про тюрьмы,
// кино, песни и саму игру. Тройке лучших — золото, всем, кто играл, — бычки.

import { FENYA } from './fenya.ts';

export const QUIZ = {
  hours: [13, 20],
  questions: 10,
  qSec: 15,
  revealSec: 5,
  lobbyMin: 15,
  rewards: [20, 12, 6],
  butts: 5,
  /** итоги висят столько минут — успеть забрать награду */
  keepMin: 30,
};

export const quizTotalMs = () => QUIZ.questions * (QUIZ.qSec + QUIZ.revealSec) * 1000;

export interface QuizQ {
  text: string;
  options: string[];
  answer: number;
}

const FIXED: QuizQ[] = [
  { text: 'Кто сыграл Доцента в «Джентльменах удачи»?', options: ['Евгений Леонов', 'Юрий Никулин', 'Георгий Вицин', 'Савелий Крамаров'], answer: 0 },
  { text: 'Кто снял фильм «Калина красная»?', options: ['Василий Шукшин', 'Леонид Гайдай', 'Эльдар Рязанов', 'Никита Михалков'], answer: 0 },
  { text: 'Кто пел «Владимирский централ»?', options: ['Михаил Круг', 'Александр Розенбаум', 'Владимир Высоцкий', 'Иван Кучин'], answer: 0 },
  { text: '«Побег из Шоушенка» снят по повести…', options: ['Стивена Кинга', 'Джона Гришэма', 'Агаты Кристи', 'Марио Пьюзо'], answer: 0 },
  { text: 'Как звали великана-заключённого в «Зелёной миле»?', options: ['Джон Коффи', 'Энди Дюфрейн', 'Ред', 'Перси'], answer: 0 },
  { text: 'Тюрьма «Кресты» находится в…', options: ['Санкт-Петербурге', 'Москве', 'Владимире', 'Екатеринбурге'], answer: 0 },
  { text: 'Тюрьма «Бутырка» находится в…', options: ['Москве', 'Санкт-Петербурге', 'Твери', 'Казани'], answer: 0 },
  { text: 'Колония «Белый лебедь» — в каком городе?', options: ['Соликамск', 'Соль-Илецк', 'Воркута', 'Магадан'], answer: 0 },
  { text: 'Колония «Чёрный дельфин» — в каком городе?', options: ['Соль-Илецк', 'Соликамск', 'Норильск', 'Мурманск'], answer: 0 },
  { text: 'Алькатрас стоит на острове в заливе…', options: ['Сан-Франциско', 'Нью-Йорка', 'Майами', 'Сиэтла'], answer: 0 },
  { text: 'О какой тюрьме песня «Таганка»?', options: ['Таганская тюрьма в Москве', 'Тюрьма в Таганроге', 'Лагерь на Колыме', 'Пересыльная в Ванино'], answer: 0 },
  { text: 'Сколько бараков делят кланы в игре?', options: ['6', '4', '8', '10'], answer: 0 },
  { text: 'Сколько попыток в слове дня?', options: ['6', '5', '7', '4'], answer: 0 },
  { text: 'Сколько ударов в серии пенальти во дворе?', options: ['5', '3', '7', '10'], answer: 0 },
  { text: 'Какой питомец лечит, если его покормить?', options: ['Кот', 'Крыса', 'Голубь', 'Таракан'], answer: 0 },
  { text: 'Какую долю с покупок кента получает пригласивший?', options: ['10%', '5%', '25%', '50%'], answer: 0 },
];

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Перемешать варианты, запомнив, где верный. */
function shuffleQ(q: QuizQ, r: () => number): QuizQ {
  const idx = q.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return { text: q.text, options: idx.map((i) => q.options[i]), answer: idx.indexOf(q.answer) };
}

/** Вопросы выпуска: одинаковые для всех. */
export function quizQuestions(seed: string): QuizQ[] {
  const r = rng(seed);
  const fixed = [...FIXED].sort(() => r() - 0.5).slice(0, QUIZ.questions / 2);
  const words = [...FENYA].sort(() => r() - 0.5);
  const fen: QuizQ[] = words.slice(0, QUIZ.questions / 2).map((w, k) => {
    const wrong = words.filter((x) => x !== w).slice(5 + k * 3, 8 + k * 3).map((x) => x.meaning);
    return { text: `Что значит «${w.word.toLowerCase()}»?`, options: [w.meaning, ...wrong], answer: 0 };
  });
  const all: QuizQ[] = [];
  for (let i = 0; i < QUIZ.questions / 2; i++) all.push(fen[i], fixed[i]);
  return all.map((q) => shuffleQ(q, r));
}

const MSK = 3 * 3600_000;
const DAY = 86_400_000;

/** Ближайший (или идущий) выпуск: старт в мс и его ключ. */
export function quizSlot(now: number, force?: number | null): { key: string; startsAt: number } {
  const total = quizTotalMs();
  if (force && now < force + total + QUIZ.keepMin * 60_000) return { key: `f${force}`, startsAt: force };
  const day = Math.floor((now + MSK) / DAY);
  for (const d of [day, day + 1])
    for (const h of QUIZ.hours) {
      const s = d * DAY - MSK + h * 3600_000;
      if (now < s + total + QUIZ.keepMin * 60_000) return { key: `${d}:${h}`, startsAt: s };
    }
  return { key: `${day + 1}:${QUIZ.hours[0]}`, startsAt: (day + 1) * DAY - MSK + QUIZ.hours[0] * 3600_000 };
}

/** Где мы сейчас внутри выпуска: номер вопроса и фаза. */
export function quizPhase(startsAt: number, now: number): { q: number; answering: boolean; msLeft: number; over: boolean; before: boolean } {
  const step = (QUIZ.qSec + QUIZ.revealSec) * 1000;
  if (now < startsAt) return { q: -1, answering: false, msLeft: startsAt - now, over: false, before: true };
  const el = now - startsAt;
  const q = Math.floor(el / step);
  if (q >= QUIZ.questions) return { q: QUIZ.questions, answering: false, msLeft: 0, over: true, before: false };
  const inQ = el - q * step;
  const answering = inQ < QUIZ.qSec * 1000;
  return { q, answering, msLeft: answering ? QUIZ.qSec * 1000 - inQ : step - inQ, over: false, before: false };
}

/** Очки за верный ответ: от 100 сразу до 50 в последнюю секунду. */
export const quizPoints = (msUsed: number) => Math.round(50 + 50 * Math.max(0, 1 - msUsed / (QUIZ.qSec * 1000)));
