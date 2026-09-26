import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { createBot } from './telegram.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const botToken = process.env.BOT_TOKEN ?? '';
const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
const devAuth = process.env.DEV_AUTH === '1';
const port = Number(process.env.PORT ?? 8080);

if (!botToken && !devAuth) {
  console.error('BOT_TOKEN не задан. Для локальной отладки без бота запусти с DEV_AUTH=1');
  process.exit(1);
}

// Секрет webhook выводим из токена, чтобы не заводить ещё одну переменную.
const webhookSecret = botToken ? crypto.createHash('sha256').update(botToken).digest('hex').slice(0, 32) : '';
const bot = botToken ? createBot(botToken) : null;

// Имя бота нужно для реферальных ссылок.
const botUsername = bot
  ? await bot.call<{ username: string }>('getMe', {}).then((me) => me.username).catch(() => process.env.BOT_USERNAME ?? '')
  : '';

const { app } = createApp({
  db: openDb(process.env.DB_PATH ?? path.join(root, 'data', 'zona.db')),
  bot,
  botToken,
  webAppUrl: publicUrl,
  botUsername,
  webhookSecret,
  adminIds: (process.env.ADMIN_IDS ?? '').split(',').map(Number).filter(Boolean),
  devAuth,
  staticDir: path.join(root, 'dist'),
});

app.listen(port, async () => {
  console.log(`Зона запущена на :${port}${devAuth ? ' (DEV_AUTH включён — не для продакшена!)' : ''}`);
  if (bot && publicUrl) {
    try {
      await bot.call('setWebhook', {
        url: `${publicUrl}/tg/webhook`,
        secret_token: webhookSecret,
        allowed_updates: ['message', 'pre_checkout_query'],
      });
      await bot.call('setChatMenuButton', {
        menu_button: { type: 'web_app', text: 'Играть', web_app: { url: publicUrl } },
      });
      console.log(`Webhook: ${publicUrl}/tg/webhook`);
    } catch (e) {
      console.error('Не удалось настроить бота:', e);
    }
  }
});
