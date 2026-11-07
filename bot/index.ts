// «КП за минуту» — Telegram-бот, который сам продаёт и генерирует коммерческие предложения.
// Оплата — Telegram Stars (встроены в Telegram, не нужен эквайринг и юрлицо).
// Запуск: npm run bot

import 'dotenv/config';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { Telegram, escapeHtml } from './telegram.ts';
import { Store, type User } from './store.ts';
import { buildDocx, generateProposal, previewText, type Brief } from './generator.ts';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!TOKEN || !GEMINI_KEY) {
  console.error('Нужны переменные окружения TELEGRAM_BOT_TOKEN и GEMINI_API_KEY (см. bot/README.md)');
  process.exit(1);
}
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const REFERRAL_BONUS = 2; // сколько КП дарим пригласившему после первой покупки друга

// Пакеты. Цена в Telegram Stars (XTR).
const PACKAGES = [
  { id: 'p1', credits: 1, stars: 75, label: '1 КП' },
  { id: 'p5', credits: 5, stars: 300, label: '5 КП (−20%)' },
  { id: 'p20', credits: 20, stars: 900, label: '20 КП (−40%)' },
];

const QUESTIONS: { key: keyof Brief; text: string }[] = [
  { key: 'company', text: '1/5. <b>Кто вы?</b> Название компании и чем занимаетесь (1–3 предложения).' },
  { key: 'offer', text: '2/5. <b>Что предлагаете?</b> Товар или услуга, ключевые преимущества, чем вы лучше других.' },
  { key: 'client', text: '3/5. <b>Кому отправляете КП?</b> Компания-клиент, её сфера и что для неё важно.' },
  { key: 'terms', text: '4/5. <b>Цены и условия:</b> тарифы, сроки, гарантии, скидки. Если не нужно — отправьте «-».' },
  { key: 'contacts', text: '5/5. <b>Контакты для КП:</b> имя, телефон, e-mail, сайт — каждый с новой строки.' },
];

const tg = new Telegram(TOKEN);
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
const store = new Store(process.env.DATA_FILE || path.join(import.meta.dirname, 'data', 'db.json'));
let botUsername = '';

const MENU = {
  reply_markup: {
    keyboard: [[{ text: '📝 Создать КП' }], [{ text: '💳 Купить' }, { text: '🎁 Пригласить друга' }, { text: '👛 Баланс' }]],
    resize_keyboard: true,
  },
};

const available = (u: User) => u.credits + (u.freeUsed ? 0 : 1);

async function showStart(u: User) {
  await tg.sendMessage(
    u.id,
    `Привет! Я делаю <b>продающие коммерческие предложения</b> за 1 минуту.\n\n` +
      `Ответьте на 5 вопросов, и я пришлю готовый документ Word с оформленным КП под конкретного клиента.\n\n` +
      `🎁 Первое КП — <b>бесплатно</b>.`,
    MENU,
  );
}

async function showBuy(u: User, reason = '') {
  await tg.sendMessage(u.id, `${reason}Выберите пакет (оплата Telegram Stars ⭐):`, {
    reply_markup: { inline_keyboard: PACKAGES.map((p) => [{ text: `${p.label} — ${p.stars} ⭐`, callback_data: `buy:${p.id}` }]) },
  });
}

async function startBrief(u: User) {
  if (available(u) <= 0) return showBuy(u, 'Бесплатное КП уже использовано. ');
  u.step = 0;
  u.answers = {};
  store.save();
  await tg.sendMessage(u.id, `Поехали! В любой момент: /cancel — отменить.\n\n${QUESTIONS[0].text}`);
}

async function handleAnswer(u: User, text: string) {
  const q = QUESTIONS[u.step!];
  u.answers[q.key] = text.slice(0, 2000);
  u.step!++;
  if (u.step! < QUESTIONS.length) {
    store.save();
    return tg.sendMessage(u.id, QUESTIONS[u.step!].text);
  }
  u.step = undefined;
  const brief = u.answers as Brief;

  // Списываем генерацию заранее, при ошибке — возвращаем.
  const usedFree = !u.freeUsed;
  if (usedFree) u.freeUsed = true;
  else u.credits--;
  store.save();

  await tg.sendMessage(u.id, '⏳ Пишу КП… Обычно это 15–30 секунд.');
  await tg.call('sendChatAction', { chat_id: u.id, action: 'upload_document' }).catch(() => {});
  try {
    const proposal = await generateProposal(ai, MODEL, brief);
    const file = await buildDocx(proposal, brief.contacts);
    await tg.sendMessage(u.id, previewText(proposal));
    await tg.sendDocument(u.id, file, 'Коммерческое_предложение.docx', `Готово! Осталось КП: <b>${available(u)}</b>`);
    u.generated++;
    store.save();
    if (available(u) === 0) await showBuy(u, 'Понравилось? Следующие КП — в пакетах со скидкой.\n');
  } catch (err) {
    console.error('generation failed', err);
    if (usedFree) u.freeUsed = false;
    else u.credits++;
    store.save();
    await tg.sendMessage(u.id, '😔 Не получилось сгенерировать КП. Генерация не списана — попробуйте ещё раз: «📝 Создать КП».');
  }
}

async function onMessage(msg: any) {
  const from = msg.from;
  if (!from || msg.chat?.type !== 'private') return;
  const text: string = msg.text ?? '';
  const { user: u, isNew } = store.getOrCreate(from.id, [from.first_name, from.last_name].filter(Boolean).join(' '));

  if (msg.successful_payment) return onPaid(u, msg.successful_payment);

  if (text.startsWith('/start')) {
    const payload = text.split(' ')[1] ?? '';
    const ref = Number(payload.replace('ref_', ''));
    if (isNew && payload.startsWith('ref_') && ref && ref !== u.id && store.get(ref)) {
      u.referrer = ref;
      store.save();
    }
    return showStart(u);
  }

  if (text === '/cancel') {
    u.step = undefined;
    store.save();
    return tg.sendMessage(u.id, 'Отменено.', MENU);
  }
  if (text === '/new' || text === '📝 Создать КП') return startBrief(u);
  if (text === '/buy' || text === '💳 Купить') return showBuy(u);
  if (text === '/balance' || text === '👛 Баланс')
    return tg.sendMessage(u.id, `Доступно КП: <b>${available(u)}</b>\nСоздано всего: ${u.generated}`);
  if (text === '/invite' || text === '🎁 Пригласить друга')
    return tg.sendMessage(
      u.id,
      `Отправьте другу ссылку. Когда он сделает первую покупку, вы получите <b>${REFERRAL_BONUS} КП бесплатно</b>:\n\nhttps://t.me/${botUsername}?start=ref_${u.id}`,
    );
  if (text === '/paysupport' || text === '/terms')
    return tg.sendMessage(
      u.id,
      'Оплата — Telegram Stars. Если КП не сгенерировалось, генерация не списывается. ' +
        'По вопросам оплаты и возврата напишите сюда сообщение, начиная со слова «Поддержка» — администратор ответит.',
    );
  if (text.toLowerCase().startsWith('поддержка') && ADMIN_ID) {
    await tg.sendMessage(ADMIN_ID, `🆘 Обращение от ${escapeHtml(u.name)} (id <code>${u.id}</code>):\n${escapeHtml(text)}`);
    return tg.sendMessage(u.id, 'Передал администратору, ответим в ближайшее время.');
  }

  if (u.id === ADMIN_ID && (await onAdmin(text))) return;

  if (u.step !== undefined && text && !text.startsWith('/')) return handleAnswer(u, text);

  return tg.sendMessage(u.id, 'Нажмите «📝 Создать КП», чтобы начать.', MENU);
}

async function onAdmin(text: string): Promise<boolean> {
  if (text === '/stats') {
    const s = store.stats();
    await tg.sendMessage(
      ADMIN_ID,
      `📊 Пользователей: ${s.users} (+${s.newToday} за сутки)\nСоздано КП: ${s.generated}\nПокупок: ${s.payments}\n` +
        `Заработано: <b>${s.stars} ⭐</b> (за сутки ${s.starsToday} ⭐)`,
    );
    return true;
  }
  const refund = text.match(/^\/refund (\d+) (\S+)$/);
  if (refund) {
    await tg
      .call('refundStarPayment', { user_id: Number(refund[1]), telegram_payment_charge_id: refund[2] })
      .then(() => tg.sendMessage(ADMIN_ID, 'Возврат выполнен.'))
      .catch((e) => tg.sendMessage(ADMIN_ID, `Ошибка возврата: ${escapeHtml(String(e))}`));
    return true;
  }
  const say = text.match(/^\/reply (\d+) ([\s\S]+)$/);
  if (say) {
    await tg.sendMessage(Number(say[1]), `💬 Поддержка: ${escapeHtml(say[2])}`);
    return true;
  }
  return false;
}

async function onCallback(cb: any) {
  await tg.call('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
  const pkg = PACKAGES.find((p) => cb.data === `buy:${p.id}`);
  if (!pkg) return;
  await tg.call('sendInvoice', {
    chat_id: cb.from.id,
    title: `«КП за минуту» — ${pkg.label}`,
    description: `${pkg.credits} генераций коммерческого предложения в формате Word`,
    payload: `pkg:${pkg.id}`,
    currency: 'XTR',
    prices: [{ label: pkg.label, amount: pkg.stars }],
  });
}

async function onPreCheckout(q: any) {
  const ok = PACKAGES.some((p) => q.invoice_payload === `pkg:${p.id}` && q.total_amount === p.stars && q.currency === 'XTR');
  await tg.call('answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok, error_message: ok ? undefined : 'Пакет не найден' });
}

async function onPaid(u: User, pay: any) {
  if (store.hasPayment(pay.telegram_payment_charge_id)) return;
  const pkg = PACKAGES.find((p) => pay.invoice_payload === `pkg:${p.id}`);
  if (!pkg) return;
  u.credits += pkg.credits;
  u.paidStars += pay.total_amount;
  store.addPayment({ userId: u.id, packageId: pkg.id, stars: pay.total_amount, chargeId: pay.telegram_payment_charge_id, at: new Date().toISOString() });

  await tg.sendMessage(u.id, `✅ Оплата прошла! Начислено КП: ${pkg.credits}. Доступно: <b>${available(u)}</b>`, MENU);

  if (u.referrer && !u.referralRewarded) {
    const ref = store.get(u.referrer);
    u.referralRewarded = true;
    if (ref) {
      ref.credits += REFERRAL_BONUS;
      await tg.sendMessage(ref.id, `🎁 Ваш друг сделал покупку — вам начислено ${REFERRAL_BONUS} КП!`).catch(() => {});
    }
  }
  store.save();
  if (ADMIN_ID) await tg.sendMessage(ADMIN_ID, `💰 +${pay.total_amount} ⭐ от ${escapeHtml(u.name)} (${pkg.label})`).catch(() => {});
}

async function main() {
  const me = await tg.call('getMe');
  botUsername = me.username;
  await tg.call('setMyCommands', {
    commands: [
      { command: 'new', description: 'Создать КП' },
      { command: 'buy', description: 'Купить пакет' },
      { command: 'balance', description: 'Баланс' },
      { command: 'invite', description: 'Пригласить друга' },
      { command: 'paysupport', description: 'Помощь с оплатой' },
    ],
  });
  console.log(`Бот @${botUsername} запущен`);

  let offset = 0;
  for (;;) {
    try {
      const updates: any[] = await tg.call('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
      });
      for (const up of updates) {
        offset = up.update_id + 1;
        // Каждое обновление обрабатываем независимо, чтобы долгая генерация не тормозила других.
        const job = up.message ? onMessage(up.message) : up.callback_query ? onCallback(up.callback_query) : up.pre_checkout_query ? onPreCheckout(up.pre_checkout_query) : null;
        job?.catch((e) => console.error('update failed', e));
      }
    } catch (e) {
      console.error('polling error', e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main();
