// Новый год на зоне (20 декабря — 10 января): ёлка на плацу, Дед Мороз-конвоир раздаёт подарки раз в день.
export const NY = { butts: [10, 25] as [number, number], gold: 2 };

export function isNewYear(now: number): boolean {
  const d = new Date(now + 3 * 3600_000);
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return (m === 11 && day >= 20) || (m === 0 && day <= 10);
}

export const NY_LINES = [
  'Хо-хо-хо! Руки за спину — получай подарок!',
  'Вёл себя хорошо? Не верю. Но подарок — по уставу.',
  'В мешке — грев. Шмонать не буду. Сегодня.',
  'С Новым годом! Срок, к сожалению, не обнуляется.',
];
