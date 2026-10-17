// Telegram-бот для Flappy Bird. Без внешних зависимостей, нужен Node.js 18+.
//
//   BOT_TOKEN=123:abc WEBAPP_URL=https://example.com/ node bot.js
//
// BOT_TOKEN  — токен от @BotFather
// WEBAPP_URL — HTTPS-адрес, где открыт webapp/index.html
// PORT       — если задан, бот сам раздаёт папку webapp по HTTP на этом порту
//              (поставьте перед ним HTTPS: ngrok, Cloudflare Tunnel, nginx и т.п.)

const fs = require('fs');
const path = require('path');
const http = require('http');

const TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const PORT = process.env.PORT;
if (!TOKEN || !WEBAPP_URL) {
  console.error('Укажите переменные окружения BOT_TOKEN и WEBAPP_URL');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}/`;
const SCORES_FILE = path.join(__dirname, 'scores.json');

let scores = {};
try { scores = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')); } catch (e) {}
function saveScores() {
  fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2));
}

async function api(method, params = {}) {
  const res = await fetch(API + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

// sendData из Mini App работает только при запуске с кнопки обычной клавиатуры
const playKeyboard = {
  keyboard: [[{ text: '🐤 Играть', web_app: { url: WEBAPP_URL } }]],
  resize_keyboard: true,
};

function displayName(u) {
  return u.username ? '@' + u.username : [u.first_name, u.last_name].filter(Boolean).join(' ');
}

function leaderboard() {
  const top = Object.values(scores).sort((a, b) => b.best - a.best).slice(0, 10);
  if (!top.length) return 'Пока никто не играл. Будь первым!';
  const medals = ['🥇', '🥈', '🥉'];
  return '🏆 Топ игроков:\n\n' +
    top.map((s, i) => `${medals[i] || `${i + 1}.`} ${s.name} — ${s.best}`).join('\n');
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const user = msg.from;

  if (msg.web_app_data) {
    let score = 0;
    try { score = Math.max(0, Math.floor(Number(JSON.parse(msg.web_app_data.data).score)) || 0); } catch (e) {}
    const prev = scores[user.id];
    const isRecord = !prev || score > prev.best;
    scores[user.id] = { name: displayName(user), best: isRecord ? score : prev.best };
    saveScores();
    await api('sendMessage', {
      chat_id: chatId,
      text: isRecord
        ? `🎉 Новый рекорд: ${score}!`
        : `Результат: ${score}. Твой рекорд: ${prev.best}.`,
      reply_markup: playKeyboard,
    });
    return;
  }

  const cmd = (msg.text || '').split(/[\s@]/)[0];
  if (cmd === '/start' || cmd === '/play') {
    await api('sendMessage', {
      chat_id: chatId,
      text: 'Привет! Это Flappy Bird 🐤\n\nЖми «Играть», тапай по экрану, пролетай между трубами. ' +
        'После проигрыша нажми «Отправить результат» — он попадёт в таблицу рекордов.\n\n' +
        '/top — таблица рекордов\n/me — мой рекорд',
      reply_markup: playKeyboard,
    });
  } else if (cmd === '/top') {
    await api('sendMessage', { chat_id: chatId, text: leaderboard(), reply_markup: playKeyboard });
  } else if (cmd === '/me') {
    const s = scores[user.id];
    await api('sendMessage', {
      chat_id: chatId,
      text: s ? `Твой рекорд: ${s.best}` : 'У тебя ещё нет результатов — сыграй!',
      reply_markup: playKeyboard,
    });
  }
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) handleMessage(u.message).catch((e) => console.error(e.message));
      }
    } catch (e) {
      console.error(e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

function serveWebapp() {
  const dir = path.join(__dirname, '..', 'webapp');
  http.createServer((req, res) => {
    let target;
    try { target = path.resolve(dir, '.' + decodeURIComponent(req.url.split('?')[0])); } catch (e) { target = ''; }
    if (target !== dir && !target.startsWith(dir + path.sep)) { res.writeHead(403); return res.end(); }
    if (target === dir) target = path.join(dir, 'index.html');
    fs.readFile(target, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': target.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(data);
    });
  }).listen(PORT, () => console.log(`Игра доступна на http://localhost:${PORT}/`));
}

(async () => {
  if (PORT) serveWebapp();
  const me = await api('getMe');
  await api('setMyCommands', {
    commands: [
      { command: 'play', description: 'Играть' },
      { command: 'top', description: 'Таблица рекордов' },
      { command: 'me', description: 'Мой рекорд' },
    ],
  });
  // Кнопка «Играть» рядом с полем ввода
  await api('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Играть', web_app: { url: WEBAPP_URL } },
  });
  console.log(`Бот @${me.username} запущен`);
  poll();
})().catch((e) => { console.error(e.message); process.exit(1); });
