// Вторая пачка мини-игр: нарды, домино, шахматный этюд — с сервером; чифир на скорость, конвейер,
// чётки и рыбалка из окна — ловкость, клиент присылает результат, сервер его режет по разумным границам.

// --- Нарды: гонка по доске с ловушками ---------------------------------------------------

export const NARDY = {
  perDay: 10,
  minBet: 50,
  betPerLevel: 150,
  /** первый ход — жребий, так что при ×1.85 у цыгана ~7% форы, как в костях */
  payout: 1.85,
  finish: 24,
  /** встал на ловушку — назад на 5 */
  traps: [7, 15, 21],
  trapBack: 5,
  /** на мостике — вперёд на 3 */
  bridges: [4, 11, 18],
  bridgeFwd: 3,
};

/** Куда встанет фишка с учётом ловушек и мостиков. */
/** Турнир за столами: нарды с живыми игроками, ход раз в несколько часов, таблица на неделю. */
export const TOURNEY = {
  minLevel: 3,
  /** сколько партий можно начать в день и держать одновременно */
  perDay: 5,
  maxActive: 4,
  /** не ходит дольше — соперник может забрать победу */
  turnH: 8,
  win: 3,
  /** победа, потому что соперник пропал, — меньше */
  forfeitWin: 1,
  loss: 0,
  topGold: [40, 25, 15],
  tableSize: 15,
};

export function nardyLand(pos: number, step: number): number {
  let to = Math.min(NARDY.finish, pos + step);
  if (NARDY.traps.includes(to)) to = Math.max(0, to - NARDY.trapBack);
  else if (NARDY.bridges.includes(to)) to = Math.min(NARDY.finish, to + NARDY.bridgeFwd);
  return to;
}

export type NardyPick = 'a' | 'b' | 'sum';
export function nardyStep(dice: [number, number], pick: NardyPick): number {
  return pick === 'a' ? dice[0] : pick === 'b' ? dice[1] : dice[0] + dice[1];
}

// --- Домино --------------------------------------------------------------------------------

export type Tile = [number, number];
export const DOMINO = { perDay: 10, minBet: 50, betPerLevel: 150, payout: 2, hand: 6 };

export function allTiles(): Tile[] {
  const out: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) out.push([a, b]);
  return out;
}

export function fits(t: Tile, end: number): boolean {
  return t[0] === end || t[1] === end;
}

// --- Шахматный этюд: мат в один ход ---------------------------------------------------------

export type Board = Record<string, string>; // 'e4' → 'K' (белые — заглавные, чёрные — строчные)

export interface Puzzle {
  id: string;
  name: string;
  pieces: Board;
}

/** Все этюды — белые начинают и ставят мат в один ход. Любой матующий ход засчитывается. */
export const PUZZLES: Puzzle[] = [
  { id: 'back_rank', name: 'Коридорный мат', pieces: { g1: 'K', a1: 'R', g8: 'k', f7: 'p', g7: 'p', h7: 'p' } },
  { id: 'queen_king', name: 'Ферзь под защитой', pieces: { g6: 'K', a7: 'Q', g8: 'k' } },
  { id: 'smothered', name: 'Спёртый мат', pieces: { g1: 'K', g5: 'N', h8: 'k', g8: 'r', g7: 'p', h7: 'p' } },
  { id: 'ladder', name: 'Две ладьи', pieces: { g1: 'K', a7: 'R', h1: 'R', d8: 'k' } },
  { id: 'greek', name: 'Слон и ферзь', pieces: { g1: 'K', h5: 'Q', d3: 'B', g8: 'k', f8: 'r', f7: 'p', g7: 'p' } },
  { id: 'arabian', name: 'Арабский мат', pieces: { g1: 'K', f6: 'N', b7: 'R', h8: 'k' } },
  { id: 'corner', name: 'Мат в углу', pieces: { b6: 'K', e7: 'Q', a8: 'k' } },
];
export const puzzleById = new Map(PUZZLES.map((p) => [p.id, p]));
export const CHESS = { perDay: 4, xp: 20, butts: 6 };

const FILES = 'abcdefgh';
const at = (f: number, r: number) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? `${FILES[f]}${r + 1}` : null);
const fr = (s: string): [number, number] => [FILES.indexOf(s[0]), Number(s[1]) - 1];
const isWhite = (pc: string) => pc === pc.toUpperCase();

/** Поля, куда фигура бьёт (для пешки — только диагонали). */
function attacks(b: Board, from: string): string[] {
  const pc = b[from];
  const [f, r] = fr(from);
  const white = isWhite(pc);
  const out: string[] = [];
  const ray = (df: number, dr: number) => {
    for (let k = 1; k < 8; k++) {
      const s = at(f + df * k, r + dr * k);
      if (!s) break;
      out.push(s);
      if (b[s]) break;
    }
  };
  const one = (df: number, dr: number) => {
    const s = at(f + df, r + dr);
    if (s) out.push(s);
  };
  switch (pc.toLowerCase()) {
    case 'k':
      for (const df of [-1, 0, 1]) for (const dr of [-1, 0, 1]) if (df || dr) one(df, dr);
      break;
    case 'n':
      for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) one(df, dr);
      break;
    case 'p':
      one(-1, white ? 1 : -1);
      one(1, white ? 1 : -1);
      break;
    default: {
      const t = pc.toLowerCase();
      if (t === 'r' || t === 'q') for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray(df, dr);
      if (t === 'b' || t === 'q') for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(df, dr);
    }
  }
  return out;
}

/** Ходы без учёта шаха своему королю (без рокировки и взятия на проходе). */
function pseudo(b: Board, from: string): string[] {
  const pc = b[from];
  const white = isWhite(pc);
  if (pc.toLowerCase() === 'p') {
    const [f, r] = fr(from);
    const dir = white ? 1 : -1;
    const out: string[] = [];
    const s1 = at(f, r + dir);
    if (s1 && !b[s1]) {
      out.push(s1);
      const s2 = at(f, r + 2 * dir);
      if ((white ? r === 1 : r === 6) && s2 && !b[s2]) out.push(s2);
    }
    for (const s of attacks(b, from)) if (b[s] && isWhite(b[s]) !== white) out.push(s);
    return out;
  }
  return attacks(b, from).filter((s) => !b[s] || isWhite(b[s]) !== white);
}

export function applyMove(b: Board, from: string, to: string): Board {
  const n = { ...b };
  let pc = n[from];
  delete n[from];
  if (pc === 'P' && to[1] === '8') pc = 'Q';
  if (pc === 'p' && to[1] === '1') pc = 'q';
  n[to] = pc;
  return n;
}

export function inCheck(b: Board, white: boolean): boolean {
  const king = Object.keys(b).find((s) => b[s] === (white ? 'K' : 'k'));
  if (!king) return true;
  return Object.keys(b).some((s) => isWhite(b[s]) !== white && attacks(b, s).includes(king));
}

export function legalMoves(b: Board, white: boolean): [string, string][] {
  const out: [string, string][] = [];
  for (const s of Object.keys(b)) {
    if (isWhite(b[s]) !== white) continue;
    for (const t of pseudo(b, s)) if (!inCheck(applyMove(b, s, t), white)) out.push([s, t]);
  }
  return out;
}

/** Ход белых — мат? */
export function isMateMove(b: Board, from: string, to: string): boolean {
  if (!b[from] || !isWhite(b[from])) return false;
  if (!legalMoves(b, true).some(([s, t]) => s === from && t === to)) return false;
  const n = applyMove(b, from, to);
  return inCheck(n, false) && legalMoves(n, false).length === 0;
}

// --- Ловкость: результат присылает клиент ---------------------------------------------------

/** Чифир на скорость: снять кружку, как только закипит. Быстрее 150 мс — фальстарт. */
export const SPEED = { perDay: 6, minMs: 150, tiers: [{ ms: 260, butts: 6 }, { ms: 360, butts: 4 }, { ms: 520, butts: 2 }] };
export function speedButts(ms: number): number {
  if (!(ms >= SPEED.minMs)) return 0;
  return SPEED.tiers.find((t) => ms <= t.ms)?.butts ?? 0;
}

/** Конвейер: 20 секунд, брак — в сторону. Платят за чистую работу. */
export const BELT = { perDay: 5, seconds: 20, maxItems: 30, payPerGood: 0.12, finePerMiss: 0.2, rep: 2 };

/** Чётки: десять бусин в такт. Хорошо перебрал — голова ясная. */
export const BEADS = { perDay: 4, cooldownMin: 30, beads: 10, maxEnergy: 12, maxXp: 16 };

/** Рыбалка из окна: «конём» ловишь грев из соседнего окна. Три заброса. */
export const FISH = { perDay: 5, casts: 3, good: 0.8, ok: 0.5 };

// --- Выжить в ШИЗО: пять суток, три шкалы -----------------------------------------------------

export type ShizoStat = 'heat' | 'food' | 'spirit';
export interface ShizoOpt {
  label: string;
  d: Partial<Record<ShizoStat, number>>;
  /** шанс неудачи и что тогда */
  risk?: { chance: number; d: Partial<Record<ShizoStat, number>>; text: string };
  butts?: number;
  text: string;
}
export interface ShizoCard {
  id: string;
  text: string;
  opts: ShizoOpt[];
}

export const SHIZO = { perDay: 1, days: 5, start: 6, max: 8, nightLoss: 1, minLevel: 4 };

export const SHIZO_CARDS: ShizoCard[] = [
  {
    id: 'cold', text: 'Ночь. Батарея ледяная, изо рта пар. Шконку пристегнули к стене до отбоя.',
    opts: [
      { label: 'Отжиматься до утра', d: { heat: 2, food: -1 }, text: 'Сто раз, ещё сто. Согрелся, но живот сводит.' },
      { label: 'Завернуться в робу', d: { heat: 1 }, text: 'Чуть теплее. Тоска.' },
      { label: 'Колотить в дверь', d: { spirit: 1 }, risk: { chance: 0.35, d: { spirit: -2, heat: -1 }, text: 'Вертухай открыл кормушку и окатил водой.' }, text: 'Покричал — полегчало на душе.' },
    ],
  },
  {
    id: 'soup', text: 'В кормушку сунули миску баланды и кусок хлеба. Через трубу стучит сосед: голодный.',
    opts: [
      { label: 'Съесть всё', d: { food: 2 }, text: 'Горячая. Живём.' },
      { label: 'Поделиться хлебом', d: { food: 1, spirit: 2 }, text: 'Протолкнул корку в щель. Сосед стукнул «спасибо».' },
      { label: 'Оставить на ночь', d: { food: 1, heat: 1 }, text: 'Ночью пожевал корку — сразу теплее.' },
    ],
  },
  {
    id: 'guard', text: 'Вертухай стучит дубинкой по двери: «Ну что, наказанный, ещё не сломался?»',
    opts: [
      { label: 'Промолчать', d: { spirit: -1 }, text: 'Проглотил. Неприятно.' },
      { label: 'Ответить как надо', d: { spirit: 2 }, risk: { chance: 0.4, d: { heat: -2 }, text: 'Открыл окно настежь «проветрить». Холодно.' }, text: 'Вертухай плюнул и ушёл.' },
      { label: 'Сунуть бычки (3 🚬)', d: { food: 1, spirit: 1 }, butts: 3, text: 'Взял, принёс кипятка и сахара.' },
    ],
  },
  {
    id: 'knock', text: 'Из-за стены — стук. Кто-то передаёт азбукой: «Кто ты? Держись».',
    opts: [
      { label: 'Выучить азбуку', d: { spirit: 2, heat: -1 }, text: 'Полночи сидел у стены. Замёрз, но на душе светлее.' },
      { label: 'Передать новости', d: { spirit: 1 }, text: 'Рассказал, кто сдал. Ответ — «Понял, брат».' },
      { label: 'Спать', d: { heat: 1 }, text: 'Свернулся на полу. Хоть отдохнул.' },
    ],
  },
  {
    id: 'mouse', text: 'Из-под двери вылезла мышь и смотрит на твой хлеб.',
    opts: [
      { label: 'Прикормить', d: { food: -1, spirit: 2 }, text: 'Теперь у тебя есть друг. Назвал его Кумом.' },
      { label: 'Прогнать', d: {}, text: 'Убежала. Опять один.' },
      { label: 'Поймать и съесть', d: { food: 2, spirit: -2 }, text: 'Голод не тётка. Но противно.' },
    ],
  },
  {
    id: 'draft', text: 'Из разбитого окна под потолком сквозит. Метель.',
    opts: [
      { label: 'Заткнуть робой', d: { heat: 2, spirit: -1 }, text: 'Дует меньше, но сидишь в одной майке.' },
      { label: 'Терпеть', d: { heat: -1, spirit: 1 }, text: 'Злость греет.' },
      { label: 'Попросить одеяло', d: { heat: 2 }, risk: { chance: 0.5, d: { spirit: -1 }, text: '«Не положено». Смех за дверью.' }, text: 'Кинули старое одеяло. Роскошь.' },
    ],
  },
  {
    id: 'pray', text: 'Под утро не спится. Вспоминается мать и дом.',
    opts: [
      { label: 'Помолиться', d: { spirit: 2 }, text: 'Шёпотом, как умел. Стало спокойнее.' },
      { label: 'Петь вполголоса', d: { spirit: 1, heat: 1 }, text: '«Владимирский централ»… Сосед подтянул.' },
      { label: 'Считать трещины', d: { spirit: -1, food: 1 }, text: '147 трещин. Время тянется.' },
    ],
  },
  {
    id: 'check', text: 'Утренняя проверка: «Руки за спину! Лицом к стене!» Контролёр ищет, к чему придраться.',
    opts: [
      { label: 'Выполнить всё чётко', d: { spirit: -1, food: 1 }, text: 'Придраться не к чему. Дали лишний хлеб.' },
      { label: 'Встать с ленцой', d: { spirit: 1 }, risk: { chance: 0.45, d: { heat: -2, food: -1 }, text: 'Лишили пайки и открыли окно.' }, text: 'Сошло с рук.' },
    ],
  },
];
export const shizoCardById = new Map(SHIZO_CARDS.map((c) => [c.id, c]));
