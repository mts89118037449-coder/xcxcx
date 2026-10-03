import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.ts';
import { signInitData } from '../server/auth.ts';
import { openDb } from '../server/db.ts';
import type { Bot } from '../server/telegram.ts';

const TOKEN = '123:test-token';
const calls: { method: string; body: Record<string, unknown> }[] = [];
const bot: Bot = {
  async call<T>(method: string, body: Record<string, unknown>) {
    calls.push({ method, body });
    return (method === 'createInvoiceLink' ? 'https://t.me/$invoice' : true) as T;
  },
};

let base = '';
let close: () => void;
let app: ReturnType<typeof createApp>;
const db = openDb(':memory:');

before(async () => {
  app = createApp({
    db,
    bot,
    botToken: TOKEN,
    webAppUrl: 'https://zona.test',
    webhookSecret: 'secret',
    adminIds: [],
    devAuth: false,
    rng: () => 0.5,
  });
  const server = app.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(() => close());

function initData(id: number, name: string, extra: Record<string, string> = {}) {
  return signInitData(
    { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name }), ...extra },
    TOKEN,
  );
}

async function post(path: string, auth: string | null, body: unknown = {}) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `tma ${auth}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

test('без подписи Telegram не пускает', async () => {
  assert.equal((await post('/api/me', null)).status, 401);
  const forged = initData(1, 'Вася').replace('%D0%92', '%D0%93');
  assert.equal((await post('/api/me', forged)).status, 401);
});

test('регистрация и реферал', async () => {
  const a = await post('/api/me', initData(10, 'Пахан'));
  assert.equal(a.status, 200);
  assert.equal(a.json.player.name, 'Пахан');
  const b = await post('/api/me', initData(11, 'Новенький', { start_param: 'ref_10' }));
  assert.equal(b.json.player.gold, 70);
  const a2 = await post('/api/me', initData(10, 'Пахан'));
  assert.equal(a2.json.player.refCount, 1);
});

test('действия и ошибки', async () => {
  const auth = initData(20, 'Работяга');
  const r = await post('/api/action/job', auth, { jobId: 'j_floor' });
  assert.equal(r.status, 200);
  assert.equal(r.json.player.energy, 95);
  const bad = await post('/api/action/job', auth, { jobId: 'j_smuggle' });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /уровня/);
  assert.equal((await post('/api/action/hack', auth)).status, 404);
  const pvp = await post('/api/action/pvp', auth);
  assert.equal(pvp.status, 200);
  assert.ok(pvp.json.result.enemy);
  assert.ok(pvp.json.player.battle, 'бой пошаговый: висит у игрока');
  assert.equal((await post('/api/action/pvp', auth)).status, 400); // второй бой не начать
  const hit = await post('/api/action/battle', auth, { act: 'hit' });
  assert.equal(hit.status, 200);
  assert.ok(hit.json.result.rounds.length > 0);
  const end = await post('/api/action/battle', auth, { act: 'auto' });
  assert.equal(end.json.result.done, true);
  assert.equal(end.json.player.battle, null);
});

test('общий босс копит урон', async () => {
  const auth = initData(30, 'Бунтарь');
  const hit = await post('/api/action/worldHit', auth);
  assert.equal(hit.status, 200);
  assert.ok(hit.json.result.damage > 0);
  const w = await post('/api/world', auth);
  assert.equal(w.json.world.myDamage, hit.json.result.damage);
  assert.equal(w.json.world.hp, w.json.world.maxHp - hit.json.result.damage);
  assert.equal((await post('/api/action/worldHit', auth)).status, 400);
});

test('добитый общий босс делит награду и появляется снова', async () => {
  const a = initData(31, 'Первый');
  const b = initData(32, 'Второй');
  await post('/api/action/worldHit', a);
  const boss = db.worldBoss()!;
  db.setWorldBossHp(boss.id, 1);
  const kill = await post('/api/action/worldHit', b);
  assert.equal(kill.json.result.killed, true);
  assert.ok(kill.json.player.journal.some((j: { text: string }) => j.text.includes('Бунт подавлен')));
  const next = db.worldBoss()!;
  assert.equal(next.gen, boss.gen + 1);
  assert.ok(next.max_hp > boss.max_hp);
  const first = db.getPlayer(31)!;
  assert.ok(first.money > 300, 'участник получил долю');
});

test('кланы: создать, вступить, общак, уровень, выйти; визит к соседу', async () => {
  const boss = initData(50, 'Пахан');
  await post('/api/me', boss);
  const pb = db.getPlayer(50)!;
  pb.level = 6;
  pb.money = 100000;
  db.savePlayer(pb);
  const created = await post('/api/action/clanCreate', boss, { name: 'Бродяги', tag: 'бр' });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  const clanId = created.json.result.id;
  assert.equal(created.json.player.clan.tag, 'БР');
  assert.equal((await post('/api/action/clanCreate', initData(51, 'X'), { name: 'Бродяги', tag: 'XX' })).status, 400);
  const m = initData(52, 'Шнырь');
  assert.equal((await post('/api/action/clanJoin', m, { id: clanId })).status, 200);
  await post('/api/action/clanDonate', boss, { amount: 30000 });
  const up = await post('/api/action/clanUpgrade', boss);
  assert.equal(up.json.player.clan.level, 2);
  const info = await post('/api/clan', m, { id: clanId });
  assert.equal(info.json.clan.members.length, 2);
  const visit = await post('/api/visit', m, { id: 50 });
  assert.equal(visit.json.visit.clan.tag, 'БР');
  assert.equal((await post('/api/action/respect', m, { id: 50 })).status, 200);
  assert.equal((await post('/api/visit', m, { id: 50 })).json.visit.respectedToday, true);
  await post('/api/action/clanLeave', boss);
  assert.equal(db.getClan(clanId)!.owner_id, 52, 'главный ушёл — клан перешёл к оставшемуся');
});

test('оплата Stars: счёт, pre-checkout, зачисление ровно один раз', async () => {
  const auth = initData(40, 'Донатер');
  await post('/api/me', auth);
  const inv = await post('/api/invoice', auth, { packId: 'gold_m' });
  assert.equal(inv.json.link, 'https://t.me/$invoice');
  const invoiceCall = calls.find((c) => c.method === 'createInvoiceLink')!;
  assert.equal(invoiceCall.body.currency, 'XTR');
  const payload = invoiceCall.body.payload as string;

  await app.handleUpdate({
    update_id: 1,
    pre_checkout_query: { id: 'q1', from: { id: 40 }, currency: 'XTR', total_amount: 150, invoice_payload: payload },
  });
  assert.deepEqual(calls.at(-1), { method: 'answerPreCheckoutQuery', body: { pre_checkout_query_id: 'q1', ok: true } });

  await app.handleUpdate({
    update_id: 2,
    pre_checkout_query: { id: 'q2', from: { id: 40 }, currency: 'XTR', total_amount: 1, invoice_payload: payload },
  });
  assert.equal(calls.at(-1)!.body.ok, false);

  const paid = {
    update_id: 3,
    message: {
      message_id: 1,
      chat: { id: 40 },
      successful_payment: { currency: 'XTR', total_amount: 150, invoice_payload: payload, telegram_payment_charge_id: 'ch_1' },
    },
  };
  await app.handleUpdate(paid);
  await app.handleUpdate(paid); // Telegram может доставить повторно
  const me = await post('/api/me', auth);
  assert.equal(me.json.player.gold, 20 + 350);
});

test('webhook проверяет секрет', async () => {
  const res = await fetch(`${base}/tg/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('частые запросы одного игрока режутся, другие игроки не страдают', async () => {
  const spam = initData(990, 'Скрипт');
  const codes: number[] = [];
  for (let i = 0; i < 60; i++) codes.push((await post('/api/me', spam)).status);
  assert.ok(codes.includes(429), 'после запаса — 429');
  assert.equal(codes[0], 200);
  assert.equal((await post('/api/me', initData(991, 'Честный'))).status, 200);
});

test('мини-игра с результатом на телефоне требует старта на сервере', async () => {
  const auth = initData(9101, 'Шустрый');
  await post('/api/me', auth);
  const pl = db.getPlayer(9101)!;
  pl.level = 10;
  db.savePlayer(pl);
  const cheat = await post('/api/action/darts', auth, { accs: [1, 1, 1] });
  assert.equal(cheat.status, 400);
  assert.match(cheat.json.error, /сбилась/);
  const start = await post('/api/run', auth, { game: 'darts' });
  assert.equal(start.status, 200);
  const fast = await post('/api/action/darts', auth, { accs: [1, 1, 1] });
  assert.equal(fast.status, 400);
  assert.match(fast.json.error, /быстро/);
  assert.ok(db.getPlayer(9101)!.sus.score >= 4, 'подозрение сохранилось, хотя действие отклонено');
});

test('жалоба: сохраняется со снимком, уходит админу в бота; лимит в день; ошибки браузера склеиваются', async () => {
  const auth = initData(9201, 'Жалобщик');
  await post('/api/me', auth);
  assert.equal((await post('/api/report', auth, { topic: 'bug', text: '' })).status, 400);
  assert.equal((await post('/api/report', auth, { topic: 'nope', text: 'сломалось' })).status, 400);
  calls.length = 0;
  const r = await post('/api/report', auth, { topic: 'pay', text: 'купил золото, не пришло', ctx: { where: 'shop' } });
  assert.equal(r.status, 200);
  const saved = db.reports().find((x) => x.id === r.json.id)!;
  assert.equal(saved.pid, 9201);
  const ctx = JSON.parse(saved.ctx);
  assert.equal(ctx.client.where, 'shop');
  assert.equal(ctx.snap.level, 1);
  for (let i = 0; i < 4; i++) await post('/api/report', auth, { topic: 'bug', text: `ещё ${i}` });
  assert.equal((await post('/api/report', auth, { topic: 'bug', text: 'шестая' })).status, 429);
  // ошибки
  for (let i = 0; i < 3; i++) {
    const res = await fetch(base + '/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msg: 'x is undefined', stack: `at f (app.js:1:${i})` }) });
    assert.equal(res.status, 204);
  }
  const errs = db.errors().filter((e) => e.msg === 'x is undefined');
  assert.equal(errs.length, 1);
  assert.equal(errs[0].n, 3);
  // админка — только админу
  assert.equal((await post('/api/admin/reports', auth)).status, 403);
});
