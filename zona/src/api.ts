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

export interface SusRow {
  id: number;
  name: string;
  level: number;
  score: number;
  banned: boolean;
  log: { t: number; game: string; why: string }[];
}

export class ApiError extends Error {}

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
  adminStats: <T,>() => post<T>('/admin/stats'),
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
