// Минимальный клиент Telegram Bot API на fetch — без сторонних библиотек.

export interface Bot {
  call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T>;
}

export function createBot(token: string): Bot {
  return {
    async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; result: T; description?: string };
      if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
      return json.result;
    },
  };
}

export interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; first_name: string; username?: string };
    text?: string;
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
    };
  };
  pre_checkout_query?: {
    id: string;
    from: { id: number };
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
}
