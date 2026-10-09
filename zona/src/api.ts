import type { ClanView, PlayerView, VisitView, WorldBossView } from '../shared/types.ts';

export const tg = window.Telegram?.WebApp;

export interface MarketLot {
  id: number;
  seller_id: number;
  seller_name: string;
  kind: 'item' | 'mat' | 'gear';
  ref: string;
  qty: number;
  price: number;
  created_at: number;
}

function authHeader(): string {
  if (tg?.initData) return `tma ${tg.initData}`;
  // Отладка в браузере: /?dev=42 — работает, только если сервер запущен с DEV_AUTH=1.
  const dev = new URLSearchParams(location.search).get('dev');
  return dev ? `tma dev:${dev}:${encodeURIComponent(`Тестер ${dev}`)}` : '';
}

export interface AdminReport {
  id: number;
  pid: number;
  name: string;
  topic: string;
  text: string;
  ctx: { client?: Record<string, unknown>; snap?: Record<string, unknown> };
  at: number;
  done: number;
}

export interface AdminError {
  hash: string;
  msg: string;
  stack: string;
  ua: string;
  pid: number | null;
  n: number;
  first: number;
  last: number;
}

export interface TradeView {
  id: number;
  from_id: number;
  from_name: string;
  to_id: number;
  to_name: string;
  give: import('../shared/trade.ts').TradeLine[];
  want: import('../shared/trade.ts').TradeLine[];
  status: 'open' | 'done' | 'declined' | 'cancelled' | 'expired';
  created_at: number;
}

export interface SusRow {
  id: number;
  name: string;
  level: number;
  score: number;
  banned: boolean;
  log: { t: number; game: string; why: string }[];
}

export class ApiError extends Error {}

export function authHeaderValue(): string {
  return authHeader();
}

/** Начало мини-игры для сервера; ошибку покажет уже сам результат. */
export function startRun(game: string): Promise<{ delay: number } | null> {
  return api.run(game).catch(() => null);
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader() },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: 'Сервер недоступен' }));
  if (!res.ok) throw new ApiError(json.error ?? 'Ошибка');
  return json as T;
}

export const api = {
  me: () => post<{ player: PlayerView; online: number; botUsername: string }>('/me'),
  action: <R = unknown>(type: string, body: Record<string, unknown> = {}) =>
    post<{ ok: true; result: R; player: PlayerView }>(`/action/${type}`, body),
  top: () =>
    post<{ top: { id: number; name: string; level: number; authority: number; rank: string; face: number | null; tag: string | null }[]; online: number; total: number }>('/top'),
  market: () => post<{ lots: MarketLot[] }>('/market'),
  attack: (at: number) => post<{ attack: { name: string; look: import('../shared/types.ts').Look; won: boolean; loot: number; replay: import('../shared/types.ts').FightReplay }; me: { name: string; look: import('../shared/types.ts').Look } }>('/attack', { at }),
  clanBoss: () => post<{ boss: NonNullable<ClanView['boss']> | null }>('/clanBoss'),
  trades: () => post<{ trades: TradeView[]; ttlMs: number }>('/trades'),
  duels: <T,>() => post<T>('/duels'),
  word: () => post<{ solved: number; top: { id: number; name: string; tries: number; at: number }[] }>('/word'),
  league: () =>
    post<{ top: { id: number; name: string; level: number; pts: number; title: string | null }[]; prev: { id: number; name: string; level: number; pts: number; title: string | null }[]; myRank: number | null; endsAt: number }>('/league'),
  build: () => post<{ state: { idx: number; pts: number; done: string[] }; top: { id: number; name: string; pts: number }[] }>('/build'),
  inkers: () => post<{ list: { id: number; name: string; skill: number; stars: number; votes: number; jobs: number; queue: number }[] }>('/inkers'),
  kum: () => post<{ feed: { from: string; to: string; msg: string; at: number }[] }>('/kum'),
  holiday: () => post<{ arm: { id: number; name: string; power: number }[] }>('/holiday'),
  adminHoliday: (body: { start?: string; days?: number; stop?: boolean } = {}) =>
    post<{ cur: { id: string; startsAt: number; endsAt: number } | null; list: { id: string; name: string; emoji: string }[] }>('/admin/holiday', body),
  adminStats: <T,>() => post<T>('/admin/stats'),
  report: (topic: string, text: string, ctx: unknown) => post<{ id: number }>('/report', { topic, text, ctx }),
  adminReports: (body: { done?: number; reply?: { id: number; text: string }; errDel?: string } = {}) =>
    post<{ reports: AdminReport[]; errors: AdminError[] }>('/admin/reports', body),
  adminLive: (body: { start?: string; hours?: number; stop?: boolean } = {}) =>
    post<{ cur: { id: string; startsAt: number; endsAt: number; by: 'auto' | 'admin' } | null; next: { id: string; startsAt: number; endsAt: number }; list: { id: string; name: string; emoji: string; short: string; desc: string }[] }>('/admin/live', body),
  adminSus: (id?: number, act?: 'clear' | 'ban' | 'unban') => post<{ list: SusRow[]; flagAt: number }>('/admin/sus', { id, act }),
  season: () => post<{ top: { id: number; name: string; face: number | null; frame: string | null; pts: number }[] }>('/season'),
  refs: () => post<{ refs: { id: number; name: string; level: number }[] }>('/refs'),
  chat: (channel: 'all' | 'clan') => post<{ messages: { id: number; pid: number; name: string; face: number | null; phrase: string; at: number; frame: string | null; title: string | null }[] }>('/chat', { channel }),
  ring: () => post<{ ring: import('./Ring.tsx').RingView; now: number }>('/ring'),
  world: () => post<{ world: WorldBossView; online: number }>('/world'),
  visit: (id: number, skip: number[] = []) => post<{ visit: VisitView }>('/visit', { id, skip }),
  clans: () => post<{ clans: { id: number; name: string; tag: string; level: number; members: number; authority: number }[] }>('/clans'),
  clan: (id: number) => post<{ clan: ClanView }>('/clan', { id }),
  /** сервер засекает начало мини-игры (защита от накруток) */
  run: (game: string) => post<{ delay: number }>('/run', { game }),
  invoice: (packId: string) => post<{ link: string }>('/invoice', { packId }),
};
