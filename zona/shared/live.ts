// События зоны: короткие общие для всех режимы на несколько часов или выходные.
// Идут сами по выходным по кругу; админ может запустить любое когда угодно.

export type LiveId = 'amnesty' | 'payday' | 'etap' | 'shmon' | 'hunger';

export interface LiveEffects {
  /** опыт за всё */
  xp?: number;
  /** деньги со смен и боссов */
  money?: number;
  /** скорость восстановления энергии */
  energy?: number;
  /** случаи на зоне — чаще во столько раз */
  events?: number;
  /** шанс найти заныканное (расходник или материал) после смены и боя */
  find?: number;
  /** репутация у администрации и у братвы */
  rep?: number;
}

export interface LiveDef {
  id: LiveId;
  name: string;
  emoji: string;
  /** что происходит — для баннера */
  desc: string;
  /** коротко эффекты: «опыт ×2» */
  short: string;
  /** текст рассылки от бота */
  notice: string;
  fx: LiveEffects;
}

export const LIVE: LiveDef[] = [
  {
    id: 'amnesty',
    name: 'Амнистия',
    emoji: '🕊️',
    desc: 'По зоне прошёл указ: кто ведёт себя тихо — выйдет раньше. Все стараются.',
    short: 'опыт ×2',
    notice: '🕊️ На зоне амнистия: двойной опыт за всё. Заходи, пока не кончилась.',
    fx: { xp: 2 },
  },
  {
    id: 'payday',
    name: 'Получка',
    emoji: '💰',
    desc: 'Бухгалтерия наконец перевела зарплату за промку. Нарядчик щедрый.',
    short: 'деньги со смен и боссов ×1.5',
    notice: '💰 На зоне получка: деньги со смен и боссов в полтора раза больше.',
    fx: { money: 1.5 },
  },
  {
    id: 'etap',
    name: 'Этап',
    emoji: '🚌',
    desc: 'Пришёл этап: новые лица, новые истории. На зоне неспокойно.',
    short: 'случаи вдвое чаще · находки после боёв',
    notice: '🚌 Пришёл этап — на зоне неспокойно: случаи вдвое чаще, после боёв кое-что находится.',
    fx: { events: 2, find: 0.15 },
  },
  {
    id: 'shmon',
    name: 'Шмон',
    emoji: '🔦',
    desc: 'Вертухаи шмонают бараки. Кто что заныкал — валяется по углам, успевай подобрать.',
    short: 'находки после смен и боёв · репутация ×2',
    notice: '🔦 На зоне шмон: по углам валяется заныканное. Каждая смена и бой — шанс найти.',
    fx: { find: 0.3, rep: 2 },
  },
  {
    id: 'hunger',
    name: 'Голодовка',
    emoji: '🥣',
    desc: 'Зона объявила голодовку против нового хозяина. Сил меньше, зато уважение растёт.',
    short: 'энергия медленнее · опыт ×1.5 · репутация ×2',
    notice: '🥣 Зона держит голодовку: энергия восстанавливается медленнее, но опыт и репутация растут быстрее.',
    fx: { energy: 0.75, xp: 1.5, rep: 2 },
  },
];

export const liveById = new Map(LIVE.map((l) => [l.id, l]));

export interface LiveRun {
  id: LiveId;
  startsAt: number;
  endsAt: number;
  by: 'auto' | 'admin';
}

const H = 3600_000;
const DAY = 24 * H;
/** Понедельник 00:00 по Москве для недели, в которую попадает t. */
function weekStartMsk(t: number): number {
  const msk = t + 3 * H;
  const d = new Date(msk);
  const dow = (d.getUTCDay() + 6) % 7; // 0 — понедельник
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY - 3 * H;
}

/** По выходным событие идёт само: с субботы 10:00 до воскресенья 23:00 по Москве, по кругу. */
export const LIVE_AUTO = { rotation: ['amnesty', 'payday', 'etap', 'shmon', 'hunger'] as LiveId[], fromH: 5 * 24 + 10, toH: 6 * 24 + 23 };

export function autoLive(t: number): LiveRun | null {
  const ws = weekStartMsk(t);
  const startsAt = ws + LIVE_AUTO.fromH * H;
  const endsAt = ws + LIVE_AUTO.toH * H;
  if (t < startsAt || t >= endsAt) return null;
  const week = Math.floor((ws + 3 * H) / (7 * DAY));
  return { id: LIVE_AUTO.rotation[((week % LIVE_AUTO.rotation.length) + LIVE_AUTO.rotation.length) % LIVE_AUTO.rotation.length], startsAt, endsAt, by: 'auto' };
}

/** Следующее событие по расписанию (для админки). */
export function nextAutoLive(t: number): LiveRun {
  let ws = weekStartMsk(t);
  if (t >= ws + LIVE_AUTO.fromH * H) ws += 7 * DAY;
  return autoLive(ws + LIVE_AUTO.fromH * H + 1)!;
}

/** Что идёт сейчас: запущенное админом важнее расписания. */
export function currentLive(t: number, manual: LiveRun | null): LiveRun | null {
  if (manual && t >= manual.startsAt && t < manual.endsAt) return manual;
  return autoLive(t);
}
