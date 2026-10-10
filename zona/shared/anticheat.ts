// Защита от накруток в мини-играх, где результат считает телефон.
// Начало игры засекает сервер: результат, пришедший быстрее, чем физически можно сыграть, не засчитывается.
// Подозрительно идеальные результаты не режем, а копим «подозрение» — админ видит список и решает сам.

import { ARM } from './minigames.ts';
import { BELT } from './minigames2.ts';
import { PULLUPS } from './content.ts';

export interface RunRule {
  /** меньше этого с начала игры не сыграть (мс) */
  minMs: number;
  /** случайная пауза, которую выбирает сервер (чифир на скорость) */
  delay?: [number, number];
}

export const RUNS: Record<string, RunRule> = {
  speed: { minMs: 0, delay: [1400, 4000] },
  conveyor: { minMs: BELT.seconds * 1000 + 3200 },
  beads: { minMs: 2500 },
  fish: { minMs: 1500 },
  darts: { minMs: 1200 },
  arm: { minMs: ARM.seconds * 1000 },
  pullups: { minMs: 10_000 },
  brew: { minMs: 1800 },
  tunnelDig: { minMs: 4000 },
  footShoot: { minMs: 2500 },
  raid: { minMs: 1500 },
};

export const ANTICHEAT = {
  /** запас на сеть: запрос «начал» мог дойти позже, чем телефон начал игру */
  slackMs: 700,
  /** старт протухает: долго не доигрывал — начинай заново */
  ttlMs: 10 * 60_000,
  /** с какого счёта игрок попадает в список админа */
  flagAt: 6,
  /** подозрение остывает: столько очков в сутки */
  decayPerDay: 2,
  /** очки за невозможный результат и за подозрительно идеальный */
  hard: 3,
  soft: 1,
  keepLog: 12,
};

/** Слишком хорошо, чтобы быть правдой: причина или null. Не запрет — только отметка. */
export function tooPerfect(game: string, body: Record<string, unknown>): string | null {
  const nums = (v: unknown) => (Array.isArray(v) ? v.map((x) => Number(x) || 0) : []);
  const accs = nums(body.accs);
  const all = (min: number) => accs.length > 0 && accs.every((a) => a >= min);
  switch (game) {
    case 'speed': {
      const ms = Number(body.ms) || 0;
      return ms > 0 && ms < 170 ? `реакция ${Math.round(ms)} мс` : null;
    }
    case 'beads':
      return accs.length && accs.reduce((a, b) => a + b, 0) / accs.length >= 0.97 ? 'чётки без единой ошибки' : null;
    case 'darts':
      return all(0.95) ? 'три в яблочко' : null;
    case 'fish':
      return all(0.97) ? 'три идеальных заброса' : null;
    case 'conveyor':
      return Number(body.missed) === 0 && Number(body.good) >= BELT.maxItems - 2 ? 'конвейер без брака' : null;
    case 'arm':
      return Number(body.taps) >= ARM.maxTaps * 0.9 ? `${body.taps} нажатий за ${ARM.seconds} с` : null;
    case 'pullups':
      return Number(body.reps) >= PULLUPS.maxReps - 1 ? `${body.reps} подтягиваний` : null;
    case 'brew':
      return null;
  }
  return null;
}

/** Невозможный результат: причина или null. Такое не засчитываем. */
export function impossible(game: string, body: Record<string, unknown>, elapsedMs: number): string | null {
  if (game === 'conveyor' && Number(body.good) + Number(body.missed) > BELT.maxItems) return 'коробок больше, чем было на ленте';
  if (game === 'arm' && Number(body.taps) > (elapsedMs / 1000) * 16) return 'нажатий быстрее, чем можно';
  if (game === 'pullups' && Number(body.reps) > (elapsedMs / 1000) * 6) return 'подтягиваний быстрее, чем можно';
  if (game === 'raid' && Number(body.sec) * 1000 > elapsedMs + 1500) return 'продержался дольше, чем играл';
  return null;
}
