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
  // седьмой день — большой грев, восьмой — снова первый
  const q = g.newPlayer(2, 'Тест', null, T0);
  let t = T0;
  const got: number[] = [];
  for (let i = 0; i < 8; i++) {
    t += 25 * 3600_000;
    got.push(g.claimDaily(q, t).gold);
  }
  assert.deepEqual(got, [1, 1, 1, 1, 1, 1, 10, 1]);
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
  p.gold = 100;
  assert.throws(() => g.setFace(p, 9999), /Нет такого/);
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

test('бычки: растут со временем, собираются, меняются у барыги', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  g.growField(p, T0 + 3 * 240_000, fixed(0.5));
  assert.equal(p.field.length, 3);
  g.growField(p, T0 + 100 * 240_000, fixed(0.5));
  assert.equal(p.field.length, 8, 'не больше максимума');
  const id = p.field[0].id;
  g.pickButt(p, id);
  assert.equal(p.butts, 1);
  assert.throws(() => g.pickButt(p, id), /подобрали/);
  p.butts = 5;
  const r = g.trade(p, 'money', T0);
  assert.equal(p.butts, 0);
  assert.equal(r.money, 50);
  assert.throws(() => g.trade(p, 'gold', T0), /100/);
});

test('напёрстки: выигрыш 2.7x, проигрыш — ставка, лимиты', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  p.money = 1000;
  const w = g.playShells(p, 100, 1, T0, fixed(0.5)); // шарик под средним
  assert.equal(w.win, true);
  assert.equal(p.money, 1170);
  const l = g.playShells(p, 100, 0, T0, fixed(0.5));
  assert.equal(l.win, false);
  assert.equal(p.money, 1070);
  assert.throws(() => g.playShells(p, 10, 0, T0, fixed(0.5)), /от/);
  assert.throws(() => g.playShells(p, 5000, 0, T0, fixed(0.5)), /до/);
  assert.equal(g.shellsLeft(p, T0), 23);
});

test('неделя: событие по номеру недели, прогресс и ступени наград', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  const ev = g.weeklyEvent(T0);
  g.ensureWeekly(p, T0);
  assert.throws(() => g.claimWeekly(p, 0, T0), /не выполнена/);
  p.weekly.progress = ev.tiers[1];
  g.claimWeekly(p, 0, T0);
  g.claimWeekly(p, 1, T0);
  assert.throws(() => g.claimWeekly(p, 1, T0), /Уже/);
  assert.throws(() => g.claimWeekly(p, 2, T0), /не выполнена/);
  assert.equal(p.gold, 20 + 5 + 15);
  g.ensureWeekly(p, T0 + 8 * 86_400_000);
  assert.equal(p.weekly.progress, 0, 'новая неделя — с нуля');
  assert.notEqual(g.weeklyEvent(T0 + 7 * 86_400_000).id, ev.id, 'события чередуются');
});

test('церковь и турник — без энергии', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  p.energy = 0;
  const base = g.stats(p, T0).moneyBonus;
  g.pray(p, T0);
  assert.equal(g.stats(p, T0).moneyBonus, base + 10);
  assert.throws(() => g.pray(p, T0 + MIN), /торопись/);
  p.hp = 10;
  g.confess(p, T0);
  assert.ok(p.hp > 10);
  assert.throws(() => g.confess(p, T0 + MIN), /раз в день/);
  const r = g.pullups(p, 999, T0);
  assert.equal(r.reps, 40);
  assert.equal(r.xp, 13);
  assert.throws(() => g.pullups(p, 10, T0 + MIN), /отошли/);
  assert.equal(p.energy, 0);
});

// --- Перки и расходники ---------------------------------------------------------

import { CONSUMABLES, PERKS, perkById } from '../shared/perks.ts';
import { battleAct, battleAuto, newBattle } from '../server/combat.ts';

/** Прогон записи боя так же, как это делает клиент: здоровье сходится с сервером. */
function replayHp(r: g.FightResult): [number, number] {
  const hp: [number, number] = [...r.startHp];
  for (const x of r.rounds) {
    const o = x.by === 0 ? 1 : 0;
    hp[o] = Math.max(0, hp[o] - x.dmg);
    hp[x.by] = Math.min(r.maxHp[x.by], hp[x.by] + (x.heal ?? 0));
  }
  return hp;
}

const dummy = (o: Partial<g.Fighter> = {}): g.Fighter => ({ name: 'X', hp: 500, maxHp: 500, atk: 40, def: 10, crit: 0, ...o });

test('перков 100, расходников 25, уровни растут со ступенью', () => {
  assert.equal(PERKS.length, 100);
  assert.equal(new Set(PERKS.map((p) => p.id)).size, 100);
  assert.equal(CONSUMABLES.length, 25);
  assert.equal(new Set(CONSUMABLES.map((c) => c.id)).size, 25);
  assert.ok(perkById.get('crit_2')!.minLevel > perkById.get('crit_1')!.minLevel);
  assert.ok(PERKS.every((p) => p.minLevel >= 1 && p.minLevel <= 50));
});

test('бой с перками: откат, лечение и запись сходится с итогом', () => {
  let seed = 7;
  const rng: g.Rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 200; i++) {
    const r = g.fight(
      dummy({ perks: ['crit_3', 'heal_3', 'leech_3'], items: ['c_bandage', 'c_photo', 'c_salt'] }),
      dummy({ name: 'Y', atk: 55, perks: ['stun_3', 'bleed_3', 'counter_3'] }),
      rng,
    );
    const hp = replayHp(r);
    assert.equal(hp[0], r.hpLeft, `бой ${i}`);
    assert.equal(r.win, hp[1] <= 0 && hp[0] > 0);
  }
  // перки нажимаются вручную и уходят на перезарядку
  const st = newBattle(dummy({ hp: 5000, maxHp: 5000, perks: ['crit_1', 'execute_1'], items: ['c_bandage', 'c_insert'] }), dummy({ hp: 5000, maxHp: 5000, atk: 1 }));
  const cd = perkById.get('crit_1')!.cd;
  const r1 = battleAct(st, { type: 'perk', id: 'crit_1' }, fixed(0.5));
  assert.ok(r1.some((x) => x.by === 0 && x.note?.includes('Точный')));
  assert.throws(() => battleAct(st, { type: 'perk', id: 'crit_1' }, fixed(0.5)), /перезаряжается/);
  assert.throws(() => battleAct(st, { type: 'perk', id: 'execute_1' }, fixed(0.5)), /Рано/);
  for (let k = 1; k < cd; k++) battleAct(st, { type: 'hit' }, fixed(0.5));
  battleAct(st, { type: 'perk', id: 'crit_1' }, fixed(0.5));
  // расходник — без траты хода
  const before = st.rounds.length;
  const it = battleAct(st, { type: 'item', id: 'c_insert' }, fixed(0.5));
  assert.equal(it.length, 1);
  assert.equal(st.rounds.length, before + 1);
  assert.throws(() => battleAct(st, { type: 'item', id: 'c_insert' }, fixed(0.5)), /Нет такого/);
  battleAuto(st, fixed(0.5));
  assert.ok(st.done);
});

test('расходники: срабатывают раз и списываются с пояса', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  assert.deepEqual(p.belt, ['c_bandage', 'c_sand']);
  p.money = 10_000;
  g.buyConsumable(p, 'c_insert', 2);
  assert.equal(p.stash.c_insert, 2);
  assert.deepEqual(p.belt, ['c_bandage', 'c_sand', 'c_insert']);
  assert.throws(() => g.buyConsumable(p, 'c_photo', 1), /только найти/);
  p.level = BOSSES[0].minLevel;
  const r = g.fightBoss(p, BOSSES[0].id, T0, fixed(0.5));
  assert.ok(r.used.includes('c_sand') && r.used.includes('c_insert'));
  assert.equal(p.stash.c_sand, undefined);
  assert.equal(p.stash.c_insert, 1);
  assert.throws(() => g.setBelt(p, ['c_photo']), /нет/);
  assert.throws(() => g.setPerks(p, ['crit_1', 'crit_2']), /уровня|типа/);
  assert.throws(() => g.setPerks(p, ['legend_dog']), /уровня/);
  p.level = 20;
  assert.throws(() => g.setPerks(p, ['crit_1', 'crit_2']), /типа/);
  g.setPerks(p, ['crit_2', 'stun_2', 'heal_2']);
  assert.throws(() => g.setPerks(p, ['crit_2', 'stun_2', 'heal_2', 'dodge_1']), /не больше/);
});

// --- Хата, случаи, побег, санчасть, гости --------------------------------------

import { ESCAPE_STAGES, EVENTS } from '../shared/events.ts';
import { FURNITURE, SPOTS, cellView, comfortOf } from '../shared/content.ts';

test('хата: лестница улучшений, выбор что стоит, голые стены', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.level = 30;
  p.money = 1_000_000;
  p.gold = 10_000;
  assert.throws(() => g.buyFurniture(p, 'f_carpet', T0), /Сначала/);
  g.buyFurniture(p, 'f_calendar', T0);
  g.buyFurniture(p, 'f_poster', T0);
  g.buyFurniture(p, 'f_carpet', T0);
  assert.deepEqual(cellView(p.furniture, p.cellShow), ['f_carpet']);
  g.setCellShow(p, 'wall', 'f_calendar');
  assert.deepEqual(cellView(p.furniture, p.cellShow), ['f_calendar']);
  g.setCellShow(p, 'wall', 'none');
  assert.deepEqual(cellView(p.furniture, p.cellShow), []);
  assert.throws(() => g.setCellShow(p, 'wall', 'f_painting'), /нет/);
  assert.equal(comfortOf(p.furniture), 1 + 2 + 3);
  // у каждого места есть хотя бы 3 ступени
  for (const s of SPOTS) assert.ok(FURNITURE.filter((f) => f.spot === s).length >= 3, s);
  // бонусы всех ступеней складываются, даже если убраны
  assert.equal(g.stats(p, T0).def, g.stats({ ...p, furniture: [] }, T0).def + 5);
});

test('случаи: появляются со временем, ответ стоит денег и даёт исход', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  g.tick(p, T0 + 6 * MIN);
  assert.ok(p.event, 'случай появился');
  p.event = { id: 'cards', until: T0 + 60 * MIN };
  p.money = 0;
  assert.throws(() => g.answerEvent(p, 0, T0 + 7 * MIN, fixed(0.1)), /Не на что/);
  p.money = 10_000;
  const r = g.answerEvent(p, 0, T0 + 7 * MIN, fixed(0.1)); // выигрыш
  assert.ok(r.money > 0);
  assert.equal(p.event, null);
  assert.throws(() => g.answerEvent(p, 0, T0 + 7 * MIN, fixed(0.1)), /упущен/);
  // прогулка — случай сразу, раз в полчаса
  const y = g.yardWalk(p, T0 + 8 * MIN, fixed(0.5));
  assert.ok(EVENTS.some((e) => e.id === y.id));
  assert.throws(() => g.yardWalk(p, T0 + 9 * MIN, fixed(0.5)), /погоди/);
  for (const e of EVENTS) for (const o of e.options) assert.ok(o.outcomes.length > 0, e.id);
});

test('побег: никогда не удаётся, чем дальше — тем больше награда', () => {
  const run = (quality: number, rng: g.Rng) => {
    const p = g.newPlayer(1, 'Тест', null, T0);
    p.level = 10;
    p.energy = 100;
    g.escapeStart(p, T0);
    let r;
    for (let i = 0; i < 20; i++) {
      r = g.escapeStep(p, quality, T0, rng);
      if (!r.passed) break;
    }
    return { p, r: r! };
  };
  const lucky = run(1, fixed(0));
  assert.equal(lucky.r.passed, false, 'на вокзале ловят всегда');
  assert.equal(lucky.r.stage, ESCAPE_STAGES.length - 1);
  assert.ok(lucky.p.escape.cdUntil > T0);
  const early = run(0, fixed(0.99));
  assert.equal(early.r.stage, 0);
  assert.ok(lucky.p.money > early.p.money);
  assert.throws(() => g.escapeStart(lucky.p, T0 + MIN), /ШИЗО/);
  // вернуться самому — без ШИЗО надолго, но меньше
  const p = g.newPlayer(2, 'Тест', null, T0);
  p.level = 10;
  g.escapeStart(p, T0);
  g.escapeStep(p, 1, T0, fixed(0));
  g.escapeStep(p, 1, T0, fixed(0));
  const b = g.escapeEnd(p, false, T0, fixed(0.5));
  assert.equal(b.caught, false);
  assert.ok(b.reward.money > 0 && p.escape.cdUntil - T0 < 2 * 3600_000);
});

test('санчасть и гости', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  const max = g.stats(p, T0).maxHp;
  p.hp = 10;
  const r = g.medBed(p, T0);
  assert.ok(r.hp > 0);
  assert.throws(() => g.medBed(p, T0 + MIN), /занята/);
  g.medNote(p, T0, fixed(0.1));
  assert.throws(() => g.medNote(p, T0, fixed(0.1)), /уже/);
  p.money = 100_000;
  g.medShot(p, T0);
  assert.ok(p.hp <= max);

  const host = g.newPlayer(2, 'Хозяин', null, T0);
  p.butts = 20;
  g.gift(p, host, T0);
  assert.equal(host.butts, 5);
  assert.throws(() => g.gift(p, host, T0), /уже/);
  const hp = p.hp;
  const c = g.snoop(p, host, T0, fixed(0.01));
  assert.equal(c.outcome, 'caught');
  assert.ok(p.hp < hp);
  g.snoop(p, host, T0, fixed(0.99));
  g.snoop(p, host, T0, fixed(0.99));
  assert.throws(() => g.snoop(p, host, T0, fixed(0.99)), /хватит/);
});

// --- Сюжет, мини-игры, режим бога ------------------------------------------------

import { STORY } from '../shared/story.ts';
import { cardValue } from '../shared/minigames.ts';

test('сюжет: шаги двигаются обычными действиями и дают награду', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  assert.throws(() => g.claimStory(p, T0), /не выполнен/);
  g.doJob(p, 'j_floor', T0, fixed(0.5));
  const money = p.money;
  const r = g.claimStory(p, T0);
  assert.equal(p.money, money + (STORY[0].steps[0].reward.money ?? 0));
  assert.equal(p.story.step, 1);
  assert.ok(r.xp > 0);
  // бычки — следующий шаг
  p.field = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, x: 0.5, y: 0.5, pack: false }));
  for (let i = 1; i <= 5; i++) g.pickButt(p, i);
  assert.equal(p.story.progress, 5);
});

test('сюжет: финал главы может выдать шмотку в инвентарь', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  const ch = STORY.findIndex((c) => c.steps.some((st) => st.reward.gear));
  const si = STORY[ch].steps.findIndex((st) => st.reward.gear);
  const gear = STORY[ch].steps[si].reward.gear!;
  p.story = { ch, step: si, progress: STORY[ch].steps[si].n };
  const r = g.claimStory(p, T0);
  assert.equal(r.gear, gear);
  assert.ok(p.inventory.includes(gear));
});

test('новый контент: у каждого случая и главы есть кукла НПС, вещи и наколки нарисованы', async () => {
  const { NPC_RIGS } = await import('../src/art/rig/npcs.ts');
  const { TOPS, LEGS, FEET, HATS } = await import('../src/art/rig/wear.ts');
  const { ITEMS, TATTOOS } = await import('../shared/content.ts');
  for (const e of EVENTS) assert.ok(NPC_RIGS[e.who], `нет НПС ${e.who} у случая ${e.id}`);
  for (const c of STORY) assert.ok(NPC_RIGS[c.who], `нет НПС ${c.who} у главы ${c.id}`);
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length);
  const table = { body: TOPS, legs: LEGS, feet: FEET, head: HATS } as Record<string, Record<string, unknown>>;
  for (const it of ITEMS) if (table[it.slot]) assert.ok(table[it.slot][it.id], `вещь ${it.id} не описана для рига`);
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  assert.equal(new Set(TATTOOS.map((t) => t.id)).size, TATTOOS.length);
});

test('очко, тараканьи бега и чифир: лимиты и расчёт', () => {
  assert.equal(cardValue(['Т♠', 'К♥']), 21);
  assert.equal(cardValue(['Т♠', 'Т♥', '9♦']), 21);
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.money = 100_000;
  const s = g.cardsStart(p, 50, T0, fixed(0.3));
  assert.ok(s.hand.length === 2);
  if (!s.done) {
    assert.equal(s.dealer[1], '?', 'вторая карта блатного скрыта');
    const end = g.cardsStand(p, T0);
    assert.ok(['win', 'lose', 'push'].includes(end.result));
  }
  assert.equal(p.cards, null);
  assert.throws(() => g.cardsStart(p, 10, T0, fixed(0.3)), /от/);
  p.butts = 100;
  const race = g.roachRace(p, 'borka', 5, T0, fixed(0.1));
  assert.equal(race.winner, 'borka');
  assert.equal(race.butts, 5); // ×2 минус ставка
  const e = p.energy;
  g.brew(p, 1, T0);
  assert.equal(p.energy, e + 8);
  assert.throws(() => g.brew(p, 1, T0 + MIN), /Погоди/);
});

test('режим бога: без ограничений, выключение возвращает ресурсы', () => {
  const p = g.newPlayer(1, 'Админ', null, T0);
  const money = p.money;
  g.toggleGod(p, T0);
  assert.ok(p.god.on && p.money >= 100_000_000);
  p.level = 20;
  g.fightBoss(p, 'b_warden', T0, fixed(0.5));
  g.godTopUp(p, T0);
  assert.deepEqual(p.bossCd, {});
  g.toggleGod(p, T0);
  assert.equal(p.money, money);
  g.adminTool(p, 'level', '15', T0);
  assert.equal(p.level, 15);
  g.adminTool(p, 'event', 'cards', T0);
  assert.equal(p.event?.id, 'cards');
});

// --- Кости, армрестлинг, мишень -------------------------------------------------------

import { ARM, DARTS, DICE, dartPoints } from '../shared/minigames.ts';

test('кости: ставка списывается, выигрыш вдвое, дубль втрое, лимит на день', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.money = 1_000_000;
  // rng: 0.99 → шестёрки у игрока, 0 → единицы у блатного
  const seq = [0.99, 0.99, 0, 0];
  let i = 0;
  const r = g.dice(p, 100, T0, () => seq[i++ % seq.length]);
  assert.deepEqual(r.me, [6, 6]);
  assert.equal(r.result, 'win');
  assert.equal(r.money, 100 * DICE.doublePayout - 100);
  // ничья — в пользу цыгана: одинаковые кубики у обоих
  const tie = g.dice(p, 100, T0, fixed(0.5));
  assert.equal(tie.result, 'lose');
  assert.equal(tie.money, -100);
  assert.throws(() => g.dice(p, 10, T0, fixed(0.5)), /Ставка от/);
  assert.throws(() => g.dice(p, g.diceMaxBet(p) + 1, T0, fixed(0.5)), /не больше/);
  for (let k = 2; k < DICE.perDay; k++) g.dice(p, 100, T0, fixed(0.5));
  assert.throws(() => g.dice(p, 100, T0, fixed(0.5)), /хватит/);
});

test('армрестлинг: нажатия выше предела не засчитываются, победа даёт опыт и бычки', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  const brute = ARM.rivals[2];
  const lose = g.armWrestle(p, brute.id, 5, T0, fixed(0.5));
  assert.equal(lose.won, false);
  const butts = p.butts;
  const win = g.armWrestle(p, brute.id, 10_000, T0, fixed(0.5));
  assert.equal(win.won, true);
  assert.ok(win.power <= ARM.maxTaps + p.str, 'читерские нажатия обрезаны');
  assert.equal(p.butts, butts + brute.butts);
  assert.throws(() => g.armWrestle(p, 'nobody', 10, T0, fixed(0.5)), /Нет такого/);
});

test('мишень: очки по кольцам, бычки за очки, ровно три броска', () => {
  assert.equal(dartPoints(1), DARTS.rings[0]);
  assert.equal(dartPoints(0.1), 0);
  const p = g.newPlayer(1, 'Тест', null, T0);
  const butts = p.butts;
  const r = g.darts(p, [1, 1, 0.8], T0);
  assert.equal(r.score, 50 + 50 + 25);
  assert.equal(p.butts, butts + Math.floor(125 / DARTS.buttsPer));
  assert.throws(() => g.darts(p, [1], T0), /три броска/);
  assert.throws(() => g.darts(p, 'x', T0), /три броска/);
});

test('золото с босса — только за первую победу в сутки', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.level = 20;
  p.str = 200;
  p.end = 200;
  p.energy = 500;
  p.hp = g.stats(p, T0).maxHp;
  const first = g.fightBoss(p, 'b_rat', T0, fixed(0.99));
  assert.ok(first.win);
  p.bossCd = {};
  p.hp = g.stats(p, T0).maxHp;
  const second = g.fightBoss(p, 'b_rat', T0 + 60_000, fixed(0.99));
  assert.ok(second.win);
  assert.equal(second.reward.gold, 0);
});
