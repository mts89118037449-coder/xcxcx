import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOSSES, STAR_PACKS, xpToNext } from '../shared/content.ts';
import * as g from '../server/game.ts';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const fixed = (v: number): g.Rng => () => v;

test('новый игрок в полном здравии', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  const s = g.stats(p, T0);
  assert.equal(p.hp, s.maxHp);
  assert.equal(p.energy, s.maxEnergy);
  assert.equal(p.level, 1);
});

test('энергия восстанавливается со временем, VIP вдвое быстрее', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  g.doJob(p, 'j_floor', T0, fixed(0.5));
  g.doJob(p, 'j_floor', T0, fixed(0.5));
  assert.equal(p.energy, 90);
  g.tick(p, T0 + 9 * MIN); // 3 единицы по 3 минуты
  assert.equal(p.energy, 93);

  const v = g.newPlayer(2, 'Вип', null, T0);
  g.applyPack(v, STAR_PACKS.find((x) => x.id === 'vip_30')!, T0);
  v.energy = 10;
  v.energyAt = T0;
  g.tick(v, T0 + 9 * MIN);
  assert.equal(v.energy, 16);
});

test('работа тратит энергию и даёт уровень', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  p.xp = xpToNext(1) - 1;
  const r = g.doJob(p, 'j_floor', T0, fixed(0));
  assert.equal(r.levelUps, 1);
  assert.equal(p.level, 2);
  assert.equal(p.statPoints, 3);
  assert.throws(() => g.doJob(p, 'j_smuggle', T0, fixed(0)), g.GameError);
  p.energy = 0;
  assert.throws(() => g.doJob(p, 'j_floor', T0, fixed(0)), /энергии/);
});

test('магазин, экипировка и продажа', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  const before = g.stats(p, T0).atk;
  g.buyItem(p, 'wpn_spoon');
  assert.equal(p.equipped.weapon, 'wpn_spoon');
  assert.equal(g.stats(p, T0).atk, before + 4);
  assert.throws(() => g.buyItem(p, 'wpn_spoon'), /Уже есть/);
  assert.throws(() => g.buyItem(p, 'drop_crown'), /нет в продаже/);
  assert.throws(() => g.buyItem(p, 'wpn_golden'), /уровня/);
  const { price } = g.sellItem(p, 'wpn_spoon', T0);
  assert.equal(price, 75);
  assert.equal(p.equipped.weapon, undefined);
});

test('наколки требуют авторитет', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  p.level = 4;
  p.money = 10_000;
  assert.throws(() => g.buyTattoo(p, 't_spider', T0), /авторитета/);
  p.authority = 50;
  g.buyTattoo(p, 't_spider', T0);
  assert.deepEqual(p.tattoos, ['t_spider']);
});

test('босс: победа даёт награду и ставит откат', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  p.level = 20;
  p.str = 60;
  p.end = 40;
  p.hp = g.stats(p, T0).maxHp;
  const boss = BOSSES[0];
  const r = g.fightBoss(p, boss.id, T0, fixed(0.5));
  assert.equal(r.win, true);
  assert.ok(r.reward.money > 0);
  assert.equal(p.bossKills, 1);
  assert.throws(() => g.fightBoss(p, boss.id, T0 + MIN, fixed(0.5)), /оклемался/);
  p.gold = 100;
  g.resetBoss(p, boss.id, T0 + MIN);
  assert.equal(p.gold, 85);
});

test('новичок проигрывает сильному боссу и не может бить с низким здоровьем', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  p.level = 13;
  const r = g.fightBoss(p, 'b_warden', T0, fixed(0.5));
  assert.equal(r.win, false);
  p.bossCd = {};
  assert.throws(() => g.fightBoss(p, 'b_warden', T0, fixed(0.5)), /санчасти/);
});

test('наезд: победитель отжимает деньги, у жертвы щит', () => {
  const a = g.newPlayer(1, 'Сильный', null, T0);
  a.str = 50;
  const b = g.newPlayer(2, 'Слабый', null, T0);
  b.money = 1000;
  const r = g.pvp(a, b, T0, fixed(0.5));
  assert.equal(r.win, true);
  assert.equal(r.loot, 100);
  assert.equal(b.money, 900);
  assert.equal(a.money, 400);
  assert.equal(g.canBeAttacked(b, T0 + MIN), false);
  assert.throws(() => g.pvp(a, null, T0 + 1000, fixed(0.5)), /Отдышись/);
});

test('ежедневный бонус и серия', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  g.claimDaily(p, T0);
  assert.throws(() => g.claimDaily(p, T0 + MIN), /уже получал/);
  const r = g.claimDaily(p, T0 + 25 * 60 * MIN);
  assert.equal(r.streak, 2);
  const late = g.claimDaily(p, T0 + 25 * 60 * MIN + 72 * 60 * MIN);
  assert.equal(late.streak, 1);
});

test('стартовый набор продаётся один раз', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  const pack = g.checkPack(p, 'starter');
  g.applyPack(p, pack, T0);
  assert.equal(p.gold, 20 + 250);
  assert.ok(g.isVip(p, T0));
  assert.throws(() => g.checkPack(p, 'starter'), /уже куплен/);
});

test('обустройство хаты даёт бонусы', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  const hp = g.stats(p, T0).maxHp;
  assert.throws(() => g.buyFurniture(p, 'f_mattress', T0), /денег/);
  p.money = 1000;
  g.buyFurniture(p, 'f_mattress', T0);
  assert.equal(p.money, 600);
  assert.equal(g.stats(p, T0).maxHp, hp + 20);
  assert.throws(() => g.buyFurniture(p, 'f_mattress', T0), /Уже стоит/);
  assert.throws(() => g.buyFurniture(p, 'f_fridge', T0), /уровня/);
});

test('старое сохранение без мебели мигрирует', () => {
  const p = g.newPlayer(1, 'Вася', null, T0) as Partial<g.Player>;
  delete p.furniture;
  const m = g.migrate(p as g.Player);
  assert.deepEqual(m.furniture, []);
});

test('бой отдаёт раунды для анимации, сумма урона сходится', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  const r = g.pvp(p, null, T0, fixed(0.5));
  const toEnemy = r.rounds.filter((x) => x.by === 0).reduce((s, x) => s + x.dmg, 0);
  const toMe = r.rounds.filter((x) => x.by === 1).reduce((s, x) => s + x.dmg, 0);
  assert.equal(r.hpLeft, Math.max(0, r.startHp[0] - toMe));
  assert.equal(r.win, toEnemy >= r.startHp[1]);
  assert.ok(r.enemyLook.str > 0);
});

test('лицо: первый выбор бесплатный, смена за золото', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  g.setFace(p, 5);
  assert.equal(p.face, 5);
  assert.equal(p.gold, 20);
  g.setFace(p, 7);
  assert.equal(p.gold, 0);
  assert.throws(() => g.setFace(p, 8), /золота/);
  assert.throws(() => g.setFace(p, 99), /Нет такого/);
});

test('дейлики: одинаковые в течение дня, прогресс и награда', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  g.tick(p, T0);
  const tasks = JSON.stringify(p.daily.tasks.map((t) => t.kind));
  g.tick(p, T0 + 60 * MIN);
  assert.equal(JSON.stringify(p.daily.tasks.map((t) => t.kind)), tasks);
  assert.equal(p.daily.tasks.length, 3);
  const t0 = p.daily.tasks[0];
  assert.throws(() => g.claimTask(p, 0, T0), /не выполнено/);
  t0.progress = t0.target;
  const gold = p.gold;
  g.claimTask(p, 0, T0);
  assert.equal(p.gold, gold + t0.gold);
  assert.throws(() => g.claimTask(p, 0, T0), /Уже/);
  g.tick(p, T0 + 25 * 60 * MIN);
  assert.ok(p.daily.tasks.every((t) => !t.claimed), 'новый день — новые задания');
});

test('дейлики: работа засчитывается', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  g.tick(p, T0);
  p.daily.tasks = [{ kind: 'job', target: 2, progress: 0, money: 1, xp: 1, gold: 1, claimed: false }];
  g.doJob(p, 'j_floor', T0, fixed(0));
  g.doJob(p, 'j_floor', T0, fixed(0));
  assert.equal(p.daily.tasks[0].progress, 2);
});

test('поручения: старт, таймер, ускорение, результат', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  g.ensureBoard(p, fixed(0.3));
  assert.equal(p.quests.board.length, 3);
  assert.equal(new Set(p.quests.board.map((q) => q.tpl)).size, 3, 'поручения не повторяются');
  const q = p.quests.board[0];
  g.startQuest(p, q.key, T0);
  assert.equal(p.quests.board.length, 2);
  assert.throws(() => g.finishQuest(p, T0, fixed(0)), /не готово/);
  assert.throws(() => g.startQuest(p, p.quests.board[0].key, T0), /текущее/);
  p.gold = 100;
  g.skipQuest(p, T0);
  assert.ok(p.gold < 100);
  const r = g.finishQuest(p, T0, fixed(0)); // rng 0 < шанс — успех
  assert.equal(r.ok, true);
  assert.equal(p.quests.board.length, 3);
  assert.equal(p.quests.active, null);
});

test('имя: первый раз бесплатно, потом за золото; проверка символов', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  g.rename(p, 'Колян Питерский');
  assert.equal(p.gold, 20);
  assert.throws(() => g.rename(p, '<script>'), /Только/);
  p.gold = 30;
  g.rename(p, 'Колян');
  assert.equal(p.gold, 0);
});

test('интерьер и энергия', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  p.money = 2000;
  g.buyInterior(p, 'w_blue');
  assert.equal(p.interior.wall, 'w_blue');
  assert.equal(p.money, 500);
  g.buyInterior(p, 'w_green'); // уже своё — бесплатно
  assert.equal(p.money, 500);
  p.energy = 10;
  p.gold = 10;
  g.buyEnergy(p, T0);
  assert.equal(p.energy, 40);
  g.drinkChifir(p, T0);
  assert.equal(p.energy, g.stats(p, T0).maxEnergy);
  assert.equal(p.chifir, 0);
});

test('уважение: раз в день', () => {
  const a = g.newPlayer(1, 'А', null, T0);
  const b = g.newPlayer(2, 'Б', null, T0);
  g.respect(a, b, T0);
  assert.equal(b.authority, 1);
  assert.throws(() => g.respect(a, b, T0 + MIN), /уже/);
  assert.throws(() => g.respect(a, a, T0), /Себя/);
});
