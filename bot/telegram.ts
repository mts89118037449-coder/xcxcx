// Минимальный клиент Telegram Bot API без сторонних библиотек.

export class Telegram {
  private base: string;

  constructor(token: string) {
    this.base = `https://api.telegram.org/bot${token}`;
  }

  async call<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data: any = await res.json();
    if (!data.ok) throw new Error(`${method}: ${data.description ?? res.status}`);
    return data.result as T;
  }

  sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}) {
    return this.call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  }

  async sendDocument(chatId: number, file: Buffer, filename: string, caption?: string) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('document', new Blob([new Uint8Array(file)]), filename);
    if (caption) {
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
    }
    const res = await fetch(`${this.base}/sendDocument`, { method: 'POST', body: form });
    const data: any = await res.json();
    if (!data.ok) throw new Error(`sendDocument: ${data.description ?? res.status}`);
    return data.result;
  }
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
