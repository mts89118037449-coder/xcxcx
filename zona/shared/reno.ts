// Ремонт хаты: пять этапов подряд. Каждый стоит денег и идёт несколько часов — сокамерники работают,
// это видно в сцене. Готовый этап навсегда добавляет уют и бонус.
import type { Bonus } from './content.ts';

export interface RenoStage {
  id: string;
  name: string;
  emoji: string;
  /** цена в рублях, растёт с уровнем игрока */
  base: number;
  perLevel: number;
  hours: number;
  minLevel: number;
  comfort: number;
  bonus: Bonus;
  text: string;
}

export const RENO: RenoStage[] = [
  { id: 'plaster', name: 'Зашпаклевать стены', emoji: '🧱', base: 400, perLevel: 40, hours: 1, minLevel: 2, comfort: 2, bonus: { hp: 6 }, text: 'Трещины замазаны, со стен больше не сыплется.' },
  { id: 'paint', name: 'Покрасить стены', emoji: '🎨', base: 900, perLevel: 80, hours: 2, minLevel: 4, comfort: 3, bonus: { energy: 3 }, text: 'Свежая краска. Пахнет — как на воле.' },
  { id: 'floor', name: 'Перестелить пол', emoji: '🪵', base: 2000, perLevel: 150, hours: 4, minLevel: 6, comfort: 4, bonus: { def: 4 }, text: 'Половицы не скрипят. Даже шмон тише проходит.' },
  { id: 'light', name: 'Проводка и абажур', emoji: '💡', base: 4500, perLevel: 300, hours: 6, minLevel: 9, comfort: 5, bonus: { crit: 2, money: 2 }, text: 'Тёплый свет вместо мигающей лампочки.' },
  { id: 'window', name: 'Окно с занавеской', emoji: '🪟', base: 9000, perLevel: 500, hours: 10, minLevel: 12, comfort: 6, bonus: { hp: 15, energy: 5 }, text: 'Решётка та же, но занавеска — в цветочек. Уют.' },
];

export const renoCost = (s: RenoStage, level: number) => s.base + s.perLevel * level;

/** Уют от готовых этапов ремонта. */
export const renoComfort = (stage: number) => RENO.slice(0, stage).reduce((a, s) => a + s.comfort, 0);
