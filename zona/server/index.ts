import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { createBot } from './telegram.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const botToken = process.env.BOT_TOKEN ?? '';
// Полный адрес игры, с портом, если он не 443: https://домен:8443. Из него — webhook, кнопка «Играть» и ссылки.
const publicUrl = (process.env.WEBAPP_URL || process.env.PUBLIC_URL || '').replace(/\/$/, '');
if (publicUrl) {
  const p = new URL(publicUrl).port || '443';
  if (!['443', '80', '88', '8443'].includes(p)) console.warn(`⚠️ PUBLIC_URL на порту ${p}: Telegram принимает webhook только на 443, 80, 88 и 8443`);
}
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

const { app, runNotifier } = createApp({
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

// напоминания от бота: раз в 10 минут смотрим, кому есть что сказать
setInterval(() => {
  try {
    const n = runNotifier();
    if (n) console.log(`Напоминаний отправлено: ${n}`);
  } catch (e) {
    console.error('Напоминания:', e);
  }
}, 10 * 60_000);

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
      // профиль бота: команды и описание — чтобы не настраивать руками в BotFather
      await bot.call('setMyCommands', {
        commands: [
          { command: 'start', description: 'Играть' },
          { command: 'paysupport', description: 'Помощь с оплатой' },
          { command: 'terms', description: 'Условия покупок' },
        ],
      });
      await bot.call('setMyShortDescription', { short_description: 'Тюремная RPG: авторитет, шмот, наколки, боссы, побег. Играй прямо в Telegram.' });
      await bot.call('setMyDescription', {
        description:
          '🔒 Зона — тюремная RPG в Telegram.\n\nЗарабатывай авторитет, обустраивай хату, собирай шмот и наколки, бейся с сокамерниками и боссами, пробуй сбежать.\n\nЖми «Играть».',
      });
      console.log(`Webhook: ${publicUrl}/tg/webhook`);
    } catch (e) {
      console.error('Не удалось настроить бота:', e);
    }
  }
});
