// Обратная связь: жалобы игроков и ошибки из браузера.

export const REPORT = {
  perDay: 5,
  minText: 3,
  maxText: 600,
  /** снимок состояния с телефона — не больше стольких символов */
  maxCtx: 4000,
  topics: [
    { id: 'bug', icon: '🐞', label: 'Что-то сломалось' },
    { id: 'pay', icon: '⭐', label: 'Оплата' },
    { id: 'balance', icon: '⚖️', label: 'Нечестно / баланс' },
    { id: 'idea', icon: '💡', label: 'Идея' },
    { id: 'other', icon: '💬', label: 'Другое' },
  ],
} as const;
export type ReportTopic = (typeof REPORT.topics)[number]['id'];

export const ERRLOG = {
  /** с одного открытия игры — не больше стольких ошибок */
  perSession: 15,
  maxMsg: 300,
  maxStack: 1500,
  /** с одного адреса — не больше стольких в минуту */
  perMinute: 30,
};
