import type { ClanView, PlayerView, VisitView, WorldBossView } from '../shared/types.ts';

export const tg = window.Telegram?.WebApp;

function authHeader(): string {
  if (tg?.initData) return `tma ${tg.initData}`;
  // Отладка в браузере: /?dev=42 — работает, только если сервер запущен с DEV_AUTH=1.
  const dev = new URLSearchParams(location.search).get('dev');
  return dev ? `tma dev:${dev}:${encodeURIComponent(`Тестер ${dev}`)}` : '';
}

export class ApiError extends Error {}

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
  world: () => post<{ world: WorldBossView; online: number }>('/world'),
  visit: (id: number, skip: number[] = []) => post<{ visit: VisitView }>('/visit', { id, skip }),
  clans: () => post<{ clans: { id: number; name: string; tag: string; level: number; members: number; authority: number }[] }>('/clans'),
  clan: (id: number) => post<{ clan: ClanView }>('/clan', { id }),
  invoice: (packId: string) => post<{ link: string }>('/invoice', { packId }),
};
