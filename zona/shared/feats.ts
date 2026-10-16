// Абсурдные ачивки: награда за то, чем на воле не хвастаются. Считаются по счётчикам игрока.

export interface Feat {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** какой счётчик смотреть; особые: wins, losses, intros, reno */
  key: string;
  goal: number;
  gold: number;
}

export const FEATS: Feat[] = [
  { id: 'f_cutlets', name: 'Желудок из титана', emoji: '🍖', desc: 'Съешь 25 добавок у Жоры. И выживи', key: 'place:canteen.extra', goal: 25, gold: 5 },
  { id: 'f_floor', name: 'Пол — мой лучший друг', emoji: '🫠', desc: 'Проиграй 20 драк. Пол уже узнаёт тебя в лицо', key: 'losses', goal: 20, gold: 3 },
  { id: 'f_butts', name: 'Санитар двора', emoji: '🚬', desc: 'Подбери 300 бычков. Дворник плачет от зависти', key: 'butts', goal: 300, gold: 4 },
  { id: 'f_events', name: 'Со мной вечно что-то случается', emoji: '🎲', desc: 'Попади в 50 случаев. Кум завёл на тебя отдельную папку', key: 'event', goal: 50, gold: 5 },
  { id: 'f_heal', name: 'Постоянный клиент зелёнки', emoji: '🧪', desc: 'Подлечись у лепилы 15 раз. Тебе положена скидка. Не положена', key: 'heal', goal: 15, gold: 3 },
  { id: 'f_jobs', name: 'Стахановец поневоле', emoji: '⚒️', desc: 'Отработай 100 смен. Государство благодарит. Устно', key: 'job', goal: 100, gold: 6 },
  { id: 'f_shells', name: '«Лёха, я тебе верю»', emoji: '🥜', desc: 'Проиграй Лёхе в напёрстки 30 раз. Шарика там нет. Никогда не было', key: 'shells_lost', goal: 30, gold: 4 },
  { id: 'f_bunk', name: 'Психолог хаты', emoji: '🛏️', desc: 'Поговори у шконки 14 раз. Бесплатно, без лицензии', key: 'bunk', goal: 14, gold: 4 },
  { id: 'f_wins', name: 'Местный терминатор', emoji: '🤖', desc: 'Выиграй 100 драк. Ты вернёшься. Через забор — нет', key: 'wins', goal: 100, gold: 8 },
  { id: 'f_tourist', name: 'Турист строгого режима', emoji: '🧳', desc: 'Познакомься со всеми хозяевами мест. Путёвка — пожизненная', key: 'intros', goal: 10, gold: 4 },
  { id: 'f_reno', name: 'Дизайнер интерьера', emoji: '🪟', desc: 'Закончи ремонт хаты. Занавеска в цветочек — это стиль', key: 'reno', goal: 5, gold: 6 },
  { id: 'f_bath', name: 'Чистюля', emoji: '🧼', desc: 'Попарься в бане 30 раз. Мыло так ни разу и не уронил', key: 'place:bath.steam', goal: 30, gold: 3 },
  { id: 'f_church', name: 'Грешник со стажем', emoji: '🕯️', desc: 'Сходи в церковь 25 раз. Батюшка устал, но держится', key: 'church', goal: 25, gold: 3 },
  { id: 'f_boss', name: 'Гроза начальства', emoji: '🥊', desc: 'Победи боссов 50 раз. Начальство в курсе. Начальство записывает', key: 'boss', goal: 50, gold: 6 },
];
export const featById = new Map(FEATS.map((f) => [f.id, f]));

/** Сколько набрано по ачивке. */
export function featProgress(f: Feat, p: { feats: Record<string, number>; wins: number; losses: number; intros: string[]; reno: { stage: number } }): number {
  const v = f.key === 'wins' ? p.wins : f.key === 'losses' ? p.losses : f.key === 'intros' ? p.intros.length : f.key === 'reno' ? p.reno.stage : (p.feats[f.key] ?? 0);
  return Math.min(f.goal, v);
}
