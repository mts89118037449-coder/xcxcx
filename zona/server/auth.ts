// Проверка подписи Telegram Mini App initData.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

import crypto from 'node:crypto';

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface InitData {
  user: TgUser;
  startParam: string | null;
  authDate: number;
}

export function validateInitData(raw: string, botToken: string, maxAgeSec = 24 * 3600): InitData | null {
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  if (expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) {
    return null;
  }
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    const user = JSON.parse(userJson) as TgUser;
    if (typeof user.id !== 'number') return null;
    return { user, startParam: params.get('start_param'), authDate };
  } catch {
    return null;
  }
}

/** Подписывает initData — нужно для тестов и локальной отладки. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
