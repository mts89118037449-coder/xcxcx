// Что открывается с каким уровнем. Новичок не тонет в десятках экранов: разделы приходят по одному,
// с окном «Открыто новое». Один список — и для сервера (не обойти через API), и для интерфейса.

export interface Unlock {
  id: string;
  name: string;
  emoji: string;
  level: number;
  desc: string;
  /** куда вести кнопкой «Посмотреть»: вкладка и раздел */
  go: { tab: 'home' | 'zone' | 'work' | 'fight' | 'gear' | 'top'; seg?: [string, string] };
}

export const UNLOCKS: Unlock[] = [
  // 2
  { id: 'dice', name: 'Кости', emoji: '🎲', level: 2, desc: 'Кто больше выбросит — тот забирает ставку', go: { tab: 'work', seg: ['work', 'games'] } },
  { id: 'speed', name: 'Чифир на скорость', emoji: '⚡', level: 2, desc: 'Успей снять кружку — бычки за реакцию', go: { tab: 'work', seg: ['work', 'games'] } },
  // 3
  { id: 'arm', name: 'Армрестлинг', emoji: '💪', level: 3, desc: 'Кто чаще жмёт — тот и сильнее', go: { tab: 'work', seg: ['work', 'games'] } },
  { id: 'darts', name: 'Мишень', emoji: '🎯', level: 3, desc: 'Заточка в цель — очки в бычки', go: { tab: 'work', seg: ['work', 'games'] } },
  { id: 'conveyor', name: 'Конвейер', emoji: '📦', level: 3, desc: 'Снимай брак с ленты — деньги и уважение работяг', go: { tab: 'work', seg: ['work', 'games'] } },
  { id: 'ring', name: 'Ринг', emoji: '🏟️', level: 3, desc: 'Живые бои и ставки зрителей', go: { tab: 'fight', seg: ['fight', 'ring'] } },
  { id: 'chat', name: 'Чат барака', emoji: '💬', level: 3, desc: 'Перекинься словом с братвой', go: { tab: 'top' } },
  // 4
  { id: 'market', name: 'Барахолка', emoji: '🛒', level: 4, desc: 'Торгуй с зэками: расходники, материалы, шмот', go: { tab: 'zone', seg: ['zone', 'market'] } },
  { id: 'craft', name: 'Ремесло', emoji: '🔧', level: 4, desc: 'Из материалов — бинты, заточки и талисманы', go: { tab: 'gear', seg: ['me', 'gear'] } },
  { id: 'nardy', name: 'Нарды', emoji: '🎲', level: 4, desc: 'Гонка с цыганом до 24-й клетки', go: { tab: 'work', seg: ['work', 'games'] } },
  { id: 'domino', name: 'Домино', emoji: '🁫', level: 4, desc: 'Выкладывай кости раньше старика', go: { tab: 'work', seg: ['work', 'games'] } },
  { id: 'shizo', name: 'Выжить в ШИЗО', emoji: '🧱', level: 4, desc: 'Пять суток в бетоне — и почёт у братвы', go: { tab: 'work', seg: ['work', 'games'] } },
  // 5
  { id: 'people', name: 'Люди зоны', emoji: '👥', level: 5, desc: 'Общак, долги и репутация у братвы, работяг и администрации', go: { tab: 'zone', seg: ['zone', 'people'] } },
  { id: 'chess', name: 'Шахматный этюд', emoji: '♟️', level: 5, desc: 'Найди мат в один ход', go: { tab: 'work', seg: ['work', 'games'] } },
  { id: 'clans', name: 'Кланы', emoji: '🏴', level: 5, desc: 'Свой клан: хата, босс дня и война кланов', go: { tab: 'top' } },
  // 6
  { id: 'beads', name: 'Чётки', emoji: '📿', level: 6, desc: 'Перебирай в такт — силы и опыт', go: { tab: 'work', seg: ['work', 'games'] } },
  { id: 'fish', name: 'Рыбалка из окна', emoji: '🎣', level: 6, desc: '«Конём» лови грев из соседнего окна', go: { tab: 'work', seg: ['work', 'games'] } },
];

export const unlockById = new Map(UNLOCKS.map((u) => [u.id, u]));

export function isOpen(id: string, level: number): boolean {
  const u = unlockById.get(id);
  return !u || level >= u.level;
}

/** Какие экшены сервера что требуют. */
export const ACTION_UNLOCK: Record<string, string> = {
  dice: 'dice',
  speed: 'speed',
  arm: 'arm',
  darts: 'darts',
  conveyor: 'conveyor',
  ringJoin: 'ring',
  ringBet: 'ring',
  chatSay: 'chat',
  lotPut: 'market',
  lotBuy: 'market',
  craft: 'craft',
  nardyStart: 'nardy',
  dominoStart: 'domino',
  shizoStart: 'shizo',
  obshakGive: 'people',
  obshakAsk: 'people',
  loanTake: 'people',
  chessPuzzle: 'chess',
  beads: 'beads',
  fish: 'fish',
};
