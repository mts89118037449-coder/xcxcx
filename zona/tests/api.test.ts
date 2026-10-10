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
  // цепочка: 38 подтянул 39, 39 подтянул 40
  await post('/api/me', initData(38, 'Дед'));
  await post('/api/me', initData(39, 'Батя', { start_param: 'ref_38' }));
  const auth = initData(40, 'Донатер', { start_param: 'ref_39' });
  await post('/api/me', auth);
  const gold39 = db.getPlayer(39)!.gold;
  const gold38 = db.getPlayer(38)!.gold;
  const gold40 = db.getPlayer(40)!.gold;
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
  assert.equal(me.json.player.gold, gold40 + 350);
  // 10% от 150 ⭐ по 2 🪙 за звезду — пригласившему, 3% — его пригласившему; повтор платежа не удваивает
  assert.equal(db.getPlayer(39)!.gold, gold39 + 30);
  assert.equal(db.getPlayer(38)!.gold, gold38 + 9);
  const refs = await post('/api/refs', initData(39, 'Батя'));
  assert.equal(refs.json.earned, 30);
  assert.equal(refs.json.refs[0].earned, 30);
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

test('событие зоны видно в профиле; запускать может только админ', async () => {
  const auth = initData(9301, 'Зевака');
  const me = await post('/api/me', auth);
  assert.ok('live' in me.json.player);
  assert.equal((await post('/api/admin/live', auth, { start: 'amnesty', hours: 3 })).status, 403);
});

test('таблица лиги: очки за неделю считаются и у тех, у кого неделя уже перевалила', async () => {
  const auth = initData(9401, 'Боец');
  await post('/api/me', auth);
  const p = db.getPlayer(9401)!;
  const week = (await import('../server/game.ts')).weekIndex(Date.now());
  p.league = { week, pts: 120, wins: 10, claimed: 0, last: null };
  db.savePlayer(p);
  const other = db.getPlayer(9101)!;
  other.league = { week: week + 1, pts: 5, wins: 1, claimed: 0, last: { week, pts: 200 } };
  db.savePlayer(other);
  const r = await post('/api/league', auth);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.top.slice(0, 2).map((x: { id: number }) => x.id), [9101, 9401]);
  assert.equal(r.json.myRank, 2);
});

test('клановый босс: лента ударов и ответ по площади всем, кто бил, на пороге здоровья', async () => {
  const auth = initData(9501, 'Главарь');
  await post('/api/me', auth);
  const pl = db.getPlayer(9501)!;
  pl.level = 20;
  pl.money = 1_000_000;
  db.savePlayer(pl);
  const c = await post('/api/action/clanCreate', auth, { name: 'Тестовые', tag: 'TST' });
  assert.equal(c.status, 200);
  const clanId = c.json.result.id;
  await post('/api/clan', auth, { id: clanId }); // босс появился
  const { dayKey } = await import('../server/game.ts');
  const st = db.kvGet<any>(`clan:${clanId}`, null);
  st.boss = { day: dayKey(Date.now()), hp: 5001, max: 10000, hits: {}, killed: false };
  db.kvSet(`clan:${clanId}`, st);
  const r = await post('/api/action/clanBossHit', auth);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.result.aoe, true);
  assert.ok(r.json.player.hp < r.json.player.stats.maxHp, 'досталось и тому, кто бил');
  const live = await post('/api/clanBoss', auth);
  assert.ok(live.json.boss.feed.some((f: { aoe?: boolean }) => f.aoe));
  assert.ok(live.json.boss.feed.some((f: { name: string }) => f.name === 'Главарь'));
});

test('обмен: отданное в залоге, принятие меняет вещи, отказ возвращает, у кого нет — не примет', async () => {
  const a = initData(9601, 'Меняла');
  const b = initData(9602, 'Покупатель');
  await post('/api/me', a);
  await post('/api/me', b);
  const pa = db.getPlayer(9601)!;
  pa.level = 6;
  pa.stash = { c_bandage: 3 };
  db.savePlayer(pa);
  const pb = db.getPlayer(9602)!;
  pb.level = 6;
  pb.mats = { thread: 5 } as never;
  db.savePlayer(pb);
  const off = await post('/api/action/tradeOffer', a, { to: 9602, give: [{ kind: 'item', ref: 'c_bandage', qty: 2 }], want: [{ kind: 'mat', ref: 'thread', qty: 3 }] });
  assert.equal(off.status, 200, JSON.stringify(off.json));
  assert.equal(db.getPlayer(9601)!.stash.c_bandage, 1, 'в залоге');
  const acc = await post('/api/action/tradeAccept', b, { id: off.json.result.id });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  assert.equal(db.getPlayer(9602)!.stash.c_bandage, (pb.stash.c_bandage ?? 0) + 2);
  assert.equal((db.getPlayer(9601)!.mats as Record<string, number>).thread, 3);
  // второй раз ниток уже не хватает — обмен не пройдёт, залог цел; отказ вернёт
  const off2 = await post('/api/action/tradeOffer', a, { to: 9602, give: [{ kind: 'mat', ref: 'thread', qty: 1 }], want: [{ kind: 'mat', ref: 'thread', qty: 9 }] });
  assert.equal((await post('/api/action/tradeAccept', b, { id: off2.json.result.id })).status, 400);
  assert.equal((await post('/api/action/tradeDecline', b, { id: off2.json.result.id })).status, 200);
  assert.equal((db.getPlayer(9601)!.mats as Record<string, number>).thread, 3);
  const list = await post('/api/trades', a);
  assert.ok(list.json.trades.length >= 2);
});

test('карточка «поделиться»: принимает только JPEG, отдаёт картинку по ссылке', async () => {
  const auth = initData(9301, 'Фотограф');
  await post('/api/me', auth);
  const bad = await fetch(`${base}/api/share`, { method: 'POST', headers: { 'content-type': 'image/jpeg', authorization: `tma ${auth}` }, body: new Uint8Array(200) });
  assert.equal(bad.status, 400);
  const jpg = new Uint8Array(300);
  jpg.set([0xff, 0xd8, 0xff, 0xe0]);
  const ok = await fetch(`${base}/api/share?caption=hi`, { method: 'POST', headers: { 'content-type': 'image/jpeg', authorization: `tma ${auth}` }, body: jpg });
  assert.equal(ok.status, 200);
  const r = (await ok.json()) as { url: string; ref: string };
  const img = await fetch(`${base}${new URL(r.url).pathname}`);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal((await img.arrayBuffer()).byteLength, 300);
  assert.match(r.ref, /ref_9301|\//);
});

test('бунт: агитация, голосование сутки, три волны ОМОНа, награда участникам', async () => {
  const ids = [9401, 9402, 9403, 9404, 9405];
  for (const id of ids) {
    await post('/api/me', initData(id, `Бунтарь ${id}`));
    const pl = db.getPlayer(id)!;
    pl.level = 12;
    pl.butts = 100;
    pl.str = 400;
    pl.energy = 1000;
    pl.intro = -1;
    pl.tut = -1;
    db.savePlayer(pl);
  }
  const a = (id: number) => initData(id, `Бунтарь ${id}`);
  const call = await post('/api/action/riotCall', a(9401));
  assert.equal(call.status, 200, JSON.stringify(call.json));
  for (const id of ids.slice(1)) assert.equal((await post('/api/action/riotVote', a(id), { yes: true })).status, 200);
  assert.equal((await post('/api/action/riotHit', a(9401))).status, 400, 'пока голосуют — не бьются');
  // сутки прошли: сдвигаем время голосования назад
  const st = db.kvGet<any>('riot', null);
  st.startedAt -= 25 * 3600_000;
  db.kvSet('riot', st);
  const r = await post('/api/riot', a(9401));
  assert.equal(r.json.riot.phase, 'fight');
  // добиваем волны напрямую по здоровью, чтобы не ждать откатов
  for (let w = 0; w < 3; w++) {
    const s = db.kvGet<any>('riot', null);
    s.hp = 1;
    db.kvSet('riot', s);
    const pl = db.getPlayer(9402)!;
    pl.riotAt = 0;
    db.savePlayer(pl);
    const h = await post('/api/action/riotHit', a(9402));
    assert.equal(h.status, 200, JSON.stringify(h.json));
  }
  assert.equal(db.kvGet<any>('riot', null).phase, 'won');
  const gold = db.getPlayer(9402)!.gold;
  assert.equal((await post('/api/action/riotClaim', a(9402))).status, 200);
  assert.equal(db.getPlayer(9402)!.gold, gold + 15);
  assert.equal((await post('/api/action/riotClaim', a(9402))).status, 400);
  assert.equal((await post('/api/action/riotClaim', a(9403))).status, 400, 'не бил — не получает');
});

test('выборы смотрящего: выдвижение, голос по авторитету, победитель прошлой недели ставит налог — деньги со смен идут в стройку', async () => {
  const { weekIndex } = await import('../server/game.ts');
  const w = weekIndex(Date.now());
  const boss = initData(9501, 'Кандидат');
  const fan = initData(9502, 'Избиратель');
  for (const id of [9501, 9502]) {
    await post('/api/me', id === 9501 ? boss : fan);
    const pl = db.getPlayer(id)!;
    Object.assign(pl, { level: 15, authority: 900, money: 100_000, intro: -1, tut: -1, energy: 200 });
    db.savePlayer(pl);
  }
  assert.equal((await post('/api/action/electNominate', boss)).status, 200);
  const v = await post('/api/action/electVote', fan, { id: 9501 });
  assert.equal(v.status, 200);
  assert.equal(v.json.result.candidates[0].votes, 10); // корень из 900 / 3
  assert.equal((await post('/api/action/electVote', fan, { id: 9501 })).status, 400);
  // итоги «прошлой недели»: переносим таблицу на неделю назад и сбрасываем текущего
  db.kvSet(`elect:${w - 1}`, db.kvGet(`elect:${w}`, {}));
  db.kvSet('smotr', null);
  const e = await post('/api/elect', fan);
  // кэш смотрящего живёт 5 секунд — дождаться не нужно: при пустом kv берётся свежий
  assert.equal(e.json.smotr?.id, 9501, JSON.stringify(e.json.smotr));
  assert.equal((await post('/api/action/smotrTax', fan, { tax: 5 })).status, 400, 'налог ставит только смотрящий');
  assert.equal((await post('/api/action/smotrTax', boss, { tax: 5 })).status, 200);
  const pts0 = db.kvGet<any>('build', { pts: 0 }).pts;
  const job = await post('/api/action/job', fan, { jobId: 'j_floor' });
  assert.equal(job.status, 200);
  assert.ok(job.json.result.tax > 0);
  assert.ok(db.kvGet<any>('build', { pts: 0 }).pts > pts0, 'налог ушёл в стройку');
  assert.equal((await post('/api/action/smotrPardon', boss, { id: 9502 })).status, 200);
  assert.equal((await post('/api/action/smotrPardon', boss, { id: 9502 })).status, 400);
});

test('стенгазета: выпуск недели собирается, хроника пишет громкие события', async () => {
  const auth = initData(9601, 'Читатель');
  await post('/api/me', auth);
  const r = await post('/api/paper', auth);
  assert.equal(r.status, 200);
  assert.equal(r.json.barracks.length, 6);
  assert.ok(Array.isArray(r.json.chron));
  // подкоп в хронике
  const pl = db.getPlayer(9601)!;
  pl.level = 10;
  pl.tunnel = { hodka: pl.hodka, depth: 25, digAt: 0, masked: 0, found: 0, done: false };
  db.savePlayer(pl);
  assert.equal((await post('/api/action/tunnelEscape', auth)).status, 200);
  const r2 = await post('/api/paper', auth);
  assert.match(r2.json.chron[0].text, /подкопом/);
});

test('журнал ошибок: «Script error.» без файла не пишется', async () => {
  const res = await fetch(`${base}/log`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msg: 'Script error.', stack: ':0:0' }) });
  assert.equal(res.status, 204);
  assert.ok(!db.errors().some((e) => e.msg === 'Script error.'));
});
