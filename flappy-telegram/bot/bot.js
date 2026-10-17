// Telegram-бот для Flappy Bird. Без внешних зависимостей, нужен Node.js 18+.
//
//   BOT_TOKEN=123:abc WEBAPP_URL=https://example.com/ PORT=8080 node bot.js
//
// BOT_TOKEN  — токен от @BotFather
// WEBAPP_URL — HTTPS-адрес игры (папка webapp). Если игра лежит на другом
//              хостинге, добавьте к адресу ?api=https://адрес-этого-бота
// PORT       — порт HTTP-сервера: раздаёт игру и API для покупок/рекордов
//              (по умолчанию 8080; снаружи нужен HTTPS — ngrok, nginx и т.п.)

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const PORT = process.env.PORT || 8080;
if (!TOKEN || !WEBAPP_URL) {
  console.error('Укажите переменные окружения BOT_TOKEN и WEBAPP_URL');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}/`;
const DATA_FILE = path.join(__dirname, 'scores.json');

// Цены — те же, что в webapp/index.html
const CONTINUE_PRICES = [1, 3, 7, 15, 30, 60, 120, 250, 500, 1000, 2500, 5000, 10000];
const continuePrice = (n) => CONTINUE_PRICES[Math.min(n, CONTINUE_PRICES.length - 1)];
const SKIN_PRICES = { gold: 25, ninja: 50, ice: 100 };
const SKIN_NAMES = { gold: 'Золотая', ninja: 'Ниндзя', ice: 'Алмазная' };

// users[id] = { name, best, skins: [], run: { id, paid } }
let users = {};
try { users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}
function getUser(u) {
  const rec = users[u.id] || (users[u.id] = {});
  rec.name = displayName(u);
  rec.best = rec.best || 0;
  rec.skins = rec.skins || [];
  rec.run = rec.run || { id: '', paid: 0 };
  return rec;
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

const playKeyboard = {
  keyboard: [[{ text: '🐤 Играть', web_app: { url: WEBAPP_URL } }]],
  resize_keyboard: true,
};

function displayName(u) {
  return u.username ? '@' + u.username : [u.first_name, u.last_name].filter(Boolean).join(' ');
}

function leaderboard() {
  const top = Object.values(users).filter((s) => s.best > 0).sort((a, b) => b.best - a.best).slice(0, 10);
  if (!top.length) return 'Пока никто не играл. Будь первым!';
  const medals = ['🥇', '🥈', '🥉'];
  return '🏆 Топ игроков:\n\n' +
    top.map((s, i) => `${medals[i] || `${i + 1}.`} ${s.name} — ${s.best}`).join('\n');
}

// ---------- Платежи (Telegram Stars) ----------
// payload: "c|<runId>|<n>" — продолжение номер n в попытке runId; "s|<skin>" — скин

async function handlePreCheckout(q) {
  const user = getUser(q.from);
  const [kind, a, b] = q.invoice_payload.split('|');
  let error = null;
  if (kind === 'c') {
    if (user.run.id !== a || user.run.paid !== Number(b)) error = 'Цена устарела, попробуйте ещё раз.';
  } else if (kind === 's') {
    if (!SKIN_PRICES[a]) error = 'Такого скина нет.';
    else if (user.skins.includes(a)) error = 'Этот скин уже куплен.';
  } else {
    error = 'Неизвестная покупка.';
  }
  await api('answerPreCheckoutQuery', error
    ? { pre_checkout_query_id: q.id, ok: false, error_message: error }
    : { pre_checkout_query_id: q.id, ok: true });
}

function handlePayment(msg) {
  const user = getUser(msg.from);
  const [kind, a] = msg.successful_payment.invoice_payload.split('|');
  if (kind === 'c' && user.run.id === a) user.run.paid++;
  if (kind === 's' && !user.skins.includes(a)) user.skins.push(a);
  save();
  console.log(`Оплата ${msg.successful_payment.total_amount}⭐ от ${user.name}: ${msg.successful_payment.invoice_payload}`);
}

async function createInvoice(tgUser, body) {
  const user = getUser(tgUser);
  if (body.kind === 'continue') {
    const runId = String(body.runId || '').slice(0, 16);
    if (!runId) throw new Error('Нет runId');
    if (user.run.id !== runId) user.run = { id: runId, paid: 0 };
    const n = user.run.paid;
    save();
    return api('createInvoiceLink', {
      title: 'Продолжить игру',
      description: n ? `Продолжение №${n + 1} в этой попытке` : 'Продолжить с текущим счётом',
      payload: `c|${runId}|${n}`,
      currency: 'XTR',
      prices: [{ label: 'Продолжить', amount: continuePrice(n) }],
    });
  }
  if (body.kind === 'skin') {
    const price = SKIN_PRICES[body.skin];
    if (!price) throw new Error('Такого скина нет');
    if (user.skins.includes(body.skin)) throw new Error('Этот скин уже куплен');
    return api('createInvoiceLink', {
      title: `Скин «${SKIN_NAMES[body.skin]}»`,
      description: 'Новый облик для птички во Flappy Bird',
      payload: `s|${body.skin}`,
      currency: 'XTR',
      prices: [{ label: 'Скин', amount: price }],
    });
  }
  throw new Error('Неизвестная покупка');
}

// ---------- Сообщения ----------

async function handleMessage(msg) {
  const chatId = msg.chat.id;

  if (msg.successful_payment) {
    handlePayment(msg);
    return;
  }

  const cmd = (msg.text || '').split(/[\s@]/)[0];
  if (cmd === '/start' || cmd === '/play') {
    await api('sendMessage', {
      chat_id: chatId,
      text: 'Привет! Это Flappy Bird 🐤\n\nЖми «Играть», тапай по экрану и пролетай между трубами. ' +
        'Рекорд сохраняется автоматически.\n\n' +
        '🎨 Скины открываются за рекорды или покупаются за Telegram Stars.\n' +
        '⭐ Разбился? Можно продолжить за Stars — но каждое следующее продолжение в той же попытке дороже!\n\n' +
        '/top — таблица рекордов\n/me — мой рекорд\n/paysupport — вопросы по оплате',
      reply_markup: playKeyboard,
    });
  } else if (cmd === '/top') {
    await api('sendMessage', { chat_id: chatId, text: leaderboard(), reply_markup: playKeyboard });
  } else if (cmd === '/me') {
    const s = users[msg.from.id];
    await api('sendMessage', {
      chat_id: chatId,
      text: s && s.best ? `Твой рекорд: ${s.best}` : 'У тебя ещё нет результатов — сыграй!',
      reply_markup: playKeyboard,
    });
  } else if (cmd === '/paysupport') {
    await api('sendMessage', {
      chat_id: chatId,
      text: 'По вопросам оплаты напишите сюда, что случилось, и укажите дату покупки — мы ответим.',
    });
  }
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'pre_checkout_query'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) handleMessage(u.message).catch((e) => console.error(e.message));
        if (u.pre_checkout_query) handlePreCheckout(u.pre_checkout_query).catch((e) => console.error(e.message));
      }
    } catch (e) {
      console.error(e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// ---------- HTTP: игра + API ----------

// Проверка подписи initData из Telegram.WebApp
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function verifyInitData(initData) {
  const params = new URLSearchParams(initData || '');
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const checkString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const expected = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  if (expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date')) > 86400) return null;
  try { return JSON.parse(params.get('user')); } catch (e) { return null; }
}

const apiRoutes = {
  async state(user) {
    const u = getUser(user);
    return { best: u.best, skins: u.skins };
  },
  async score(user, body) {
    const u = getUser(user);
    const score = Math.max(0, Math.floor(Number(body.score)) || 0);
    const record = score > u.best;
    if (record) { u.best = score; save(); }
    return { best: u.best, record };
  },
  async invoice(user, body) {
    return { link: await createInvoice(user, body) };
  },
};

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function handleApi(req, res, route) {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
  req.on('end', async () => {
    try {
      const body = JSON.parse(raw || '{}');
      const user = verifyInitData(body.initData);
      if (!user) return sendJson(res, 401, { error: 'Откройте игру через Telegram' });
      sendJson(res, 200, await apiRoutes[route](user, body));
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

function startServer() {
  const dir = path.join(__dirname, '..', 'webapp');
  http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const urlPath = req.url.split('?')[0];
    const route = urlPath.startsWith('/api/') && urlPath.slice(5);
    if (route) {
      if (req.method !== 'POST' || !Object.hasOwn(apiRoutes, route)) return sendJson(res, 404, { error: 'Not found' });
      return handleApi(req, res, route);
    }

    let target;
    try { target = path.resolve(dir, '.' + decodeURIComponent(urlPath)); } catch (e) { target = ''; }
    if (target !== dir && !target.startsWith(dir + path.sep)) { res.writeHead(403); return res.end(); }
    if (target === dir) target = path.join(dir, 'index.html');
    fs.readFile(target, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(PORT, () => console.log(`Игра и API: http://localhost:${PORT}/`));
}

(async () => {
  startServer();
  const me = await api('getMe');
  await api('setMyCommands', {
    commands: [
      { command: 'play', description: 'Играть' },
      { command: 'top', description: 'Таблица рекордов' },
      { command: 'me', description: 'Мой рекорд' },
      { command: 'paysupport', description: 'Вопросы по оплате' },
    ],
  });
  await api('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Играть', web_app: { url: WEBAPP_URL } },
  });
  console.log(`Бот @${me.username} запущен`);
  poll();
})().catch((e) => { console.error(e.message); process.exit(1); });
