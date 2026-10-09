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
  // рисунки наколок — в .tsx, который node не импортирует: проверяем по тексту
  const { readFileSync } = await import('node:fs');
  const art = readFileSync(new URL('../src/art/rig/tattoos.tsx', import.meta.url), 'utf8');
  for (const t of TATTOOS) assert.ok(art.includes(`  ${t.id}: {`), `наколка ${t.id} не нарисована`);
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

// --- Этап 1: этапирование, масть, срок, напоминания ------------------------------------------

import { INTRO, MAST_RULES, TERM, termDays } from '../shared/term.ts';

test('этапирование: новичок проходит сцены по порядку, старые игроки его пропускают', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  assert.equal(p.intro, 0);
  for (let i = 0; i < INTRO.length; i++) {
    const r = g.introStep(p, 0, T0);
    assert.ok(r.reply);
    assert.equal(r.done, i === INTRO.length - 1);
  }
  assert.equal(p.intro, -1);
  assert.ok((p.stash.c_sand ?? 0) >= 1);
  assert.throws(() => g.introStep(p, 0, T0), /пройден/);
  const old = g.migrate({ ...g.newPlayer(2, 'Старый', null, T0), intro: undefined } as unknown as g.Player);
  assert.equal(old.intro, -1);
});

test('масть: с 5 уровня, даёт бонусы, смена стоит золота и авторитета', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  assert.throws(() => g.chooseMast(p, 'muzhik', T0), /уровня/);
  p.level = MAST_RULES.minLevel;
  const e0 = g.stats(p, T0).maxEnergy;
  g.chooseMast(p, 'muzhik', T0);
  assert.equal(g.stats(p, T0).maxEnergy, e0 + 15);
  const job = g.doJob(p, 'j_floor', T0, fixed(0.5));
  assert.ok(job.xp > 4, 'мужику больше опыта за смены');
  p.authority = 100;
  p.gold = 0;
  assert.throws(() => g.chooseMast(p, 'otric', T0), /золота/);
  p.gold = 500;
  const atk0 = g.stats(p, T0).atk;
  g.chooseMast(p, 'otric', T0);
  assert.equal(p.authority, 70);
  assert.ok(g.stats(p, T0).atk > atk0);
});

test('срок: дела скашивают дни, УДО сбрасывает уровень и даёт бонус навсегда', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  assert.equal(p.term, termDays(1));
  g.doJob(p, 'j_floor', T0, fixed(0.5));
  assert.ok(p.term < termDays(1));
  assert.throws(() => g.release(p, T0), /До УДО/);
  p.term = 0;
  p.level = 20;
  p.str = 90;
  p.tattoos = ['t_cat'];
  const gold = p.gold;
  const r = g.release(p, T0);
  assert.equal(r.hodka, 2);
  assert.equal(p.level, 1);
  assert.equal(p.str, 5);
  assert.deepEqual(p.tattoos, ['t_cat']);
  assert.equal(p.gold, gold + TERM.releaseGold);
  assert.equal(p.term, termDays(2));
  assert.equal(g.hodkaBonus(p), TERM.bonusPerHodka);
  // бонус ходки к опыту
  const xp0 = p.xp;
  g.addXp(p, 10, T0);
  assert.equal(p.xp - xp0, 11);
});

test('напоминания: не ночью, не больше трёх в день, каждое — раз между заходами', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  const day = Date.UTC(2026, 0, 6, 9); // 12:00 по Москве
  p.lastSeen = day - 3 * 3600_000;
  p.energy = 999;
  p.dailyAt = day; // грев уже забран
  const n = g.pendingNotice(p, day);
  assert.equal(n?.kind, 'energy');
  g.markNotified(p, n!.kind, day);
  assert.equal(g.pendingNotice(p, day + 60_000)?.kind ?? null, null, 'про энергию второй раз не пишем');
  const night = Date.UTC(2026, 0, 6, 21); // полночь по Москве
  p.lastSeen = night - 3600_000;
  assert.equal(g.pendingNotice(p, night), null);
  p.notify = { on: true, day: g.dayKey(day), n: 3, last: {}, off: [] };
  assert.equal(g.canNotify(p, day), false);
  g.setNotify(p, false);
  p.notify.n = 0;
  assert.equal(g.canNotify(p, day), false);
});

// --- Этап 2: боссы с приёмами, комплекты, улучшения ---------------------------------------

import { SETS, UPGRADE, upgradeCost } from '../shared/content.ts';

test('комплект: бонус за две вещи и за полный набор', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  const set = SETS.find((s) => s.id === 'set_retro')!;
  p.inventory = [...set.items];
  p.equipped = { body: 'body_robe' };
  const hp1 = g.stats(p, T0).maxHp;
  g.equip(p, 'legs_pants', T0);
  const hp2 = g.stats(p, T0).maxHp;
  assert.equal(hp2 - hp1, set.two.hp ?? 0, 'у казённых штанов нет здоровья — вся прибавка от комплекта');
  g.equip(p, 'feet_slippers', T0);
  g.equip(p, 'cap_knit', T0);
  assert.ok(g.stats(p, T0).maxHp >= hp2 + (set.full.hp ?? 0));
});

test('улучшение у мастера: стоит денег, поднимает бонусы, не выше +5', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.money = 10_000_000;
  p.inventory.push('wpn_rebar');
  p.level = 10;
  g.equip(p, 'wpn_rebar', T0);
  const atk0 = g.stats(p, T0).atk;
  const money0 = p.money;
  g.upgradeItem(p, 'wpn_rebar');
  assert.equal(money0 - p.money, upgradeCost(itemByIdT.get('wpn_rebar')!, 0).amount);
  assert.ok(g.stats(p, T0).atk > atk0);
  for (let i = 1; i < UPGRADE.max; i++) g.upgradeItem(p, 'wpn_rebar');
  assert.throws(() => g.upgradeItem(p, 'wpn_rebar'), /Лучше/);
});

import { itemById as itemByIdT } from '../shared/content.ts';

test('случаи: больше сотни, цепочки ведут к продолжению, условия проверяются', async () => {
  const { EVENTS: all, eventById, eventFits, EVENT_TIMING } = await import('../shared/events.ts');
  const { tattooById } = await import('../shared/content.ts');
  assert.ok(all.length >= 100, `случаев ${all.length}`);
  const targets = new Set<string>();
  for (const e of all)
    for (const o of e.options) {
      if (o.need?.tattoo) assert.ok(tattooById.has(o.need.tattoo), `${e.id}: нет наколки ${o.need.tattoo}`);
      for (const x of o.outcomes)
        if (x.next) {
          assert.ok(eventById.get(x.next)?.chain, `${e.id} → ${x.next}: продолжение должно быть chain`);
          targets.add(x.next);
        }
    }
  for (const e of all) if (e.chain) assert.ok(targets.has(e.id), `до ${e.id} не дойти`);

  // цепочка: малява → через несколько минут продолжение, прогулка его не перебивает
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.event = { id: 'mal_1', until: T0 + 30 * MIN };
  const r = g.answerEvent(p, 0, T0, fixed(0.1));
  assert.equal(r.next, true);
  assert.equal(p.chain, 'mal_2');
  g.spawnEvent(p, T0 + MIN, fixed(0.5));
  assert.equal(p.event, null, 'рано');
  g.spawnEvent(p, T0 + (EVENT_TIMING.chainMin + 1) * MIN, fixed(0.5));
  assert.equal((p.event as { id: string } | null)?.id, 'mal_2');
  assert.equal(p.chain, null);
  const y = g.yardWalk(p, T0 + (EVENT_TIMING.chainMin + 2) * MIN, fixed(0.5));
  assert.equal(y.id, 'mal_2');

  // вариант только для масти
  p.event = { id: 'oper_2', until: T0 + 60 * MIN };
  assert.throws(() => g.answerEvent(p, 0, T0 + 10 * MIN, fixed(0.1)), /масть/);
  p.mast = 'kozel';
  assert.equal(g.answerEvent(p, 0, T0 + 10 * MIN, fixed(0.1)).next, true);

  // сами по себе не выпадают: продолжения, чужая масть, ночные днём, для бывалых
  const noon = Date.UTC(2026, 0, 1, 9); // 12:00 по Москве
  const night = Date.UTC(2026, 0, 1, 21); // полночь
  const who = { mast: 'blat' as const, tattoos: [] as string[], level: 1, authority: 0 };
  assert.equal(eventFits(eventById.get('mal_2')!, who, noon), false);
  assert.equal(eventFits(eventById.get('m_norma')!, who, noon), false);
  assert.equal(eventFits(eventById.get('m_razbor')!, who, noon), true);
  assert.equal(eventFits(eventById.get('n_dream')!, who, noon), false);
  assert.equal(eventFits(eventById.get('n_dream')!, who, night), true);
  assert.equal(eventFits(eventById.get('x_prosecutor')!, who, noon), false);
  assert.equal(eventFits(eventById.get('x_mother_tat')!, who, noon), false);
  assert.equal(eventFits(eventById.get('x_mother_tat')!, { ...who, tattoos: ['t_mother'] }, noon), true);
});

test('места зоны: откат, цена, условия, срок скашивается', async () => {
  const { PLACES } = await import('../shared/places.ts');
  const { NPC_RIGS } = await import('../src/art/rig/npcs.ts');
  assert.equal(PLACES.filter((x) => !x.colony).length, 7);
  assert.equal(PLACES.filter((x) => x.colony).length, 3);
  for (const pl of PLACES) {
    assert.ok(NPC_RIGS[pl.who], `нет НПС у ${pl.id}`);
    assert.ok(pl.activities.length >= 3);
    for (const a of pl.activities) assert.ok(a.outcomes.length && a.cdMin > 0, `${pl.id}.${a.id}`);
  }
  const p = g.newPlayer(1, 'Тест', null, T0);
  assert.throws(() => g.placeDo(p, 'library', 'read', T0, fixed(0.1)), /уровня/);
  const r = g.placeDo(p, 'bath', 'steam', T0, fixed(0.1));
  assert.ok(r.text);
  assert.throws(() => g.placeDo(p, 'bath', 'steam', T0 + MIN, fixed(0.1)), /Рано/);
  assert.throws(() => g.placeDo(p, 'canteen', 'blat_table', T0, fixed(0.1)), /авторитет/);
  const e0 = p.energy;
  g.placeDo(p, 'canteen', 'kitchen', T0, fixed(0.1));
  assert.equal(p.energy, e0 - 10);
  p.level = 10;
  const term = p.term;
  const law = g.placeDo(p, 'library', 'law', T0, fixed(0.1)); // первый исход — скостили
  assert.ok(law.term > 0 && p.term < term);
  p.gold = 0;
  p.level = 20;
  assert.throws(() => g.placeDo(p, 'visits', 'long', T0, fixed(0.1)), /Не на что/);
  assert.throws(() => g.placeDo(p, 'nowhere', 'x', T0, fixed(0.1)), /Нет такого/);
});

test('сюжет: 12 глав, у седьмой — своя версия для каждой масти', async () => {
  const { STORY, chapterOf } = await import('../shared/story.ts');
  const { NPC_RIGS } = await import('../src/art/rig/npcs.ts');
  const { consumableById } = await import('../shared/perks.ts');
  const { itemById } = await import('../shared/content.ts');
  assert.equal(STORY.length, 12);
  for (const c of STORY)
    for (const v of [c, ...Object.values(c.variants ?? {})]) {
      assert.ok(NPC_RIGS[v!.who], `${c.id}: нет НПС ${v!.who}`);
      for (const s of v!.steps) {
        if (s.reward.item) assert.ok(consumableById.has(s.reward.item), `${c.id}: ${s.reward.item}`);
        if (s.reward.gear) assert.ok(itemById.has(s.reward.gear), `${c.id}: ${s.reward.gear}`);
      }
    }
  const i = STORY.findIndex((c) => c.variants);
  assert.equal(chapterOf(i, 'muzhik')!.name, 'Золотые руки');
  assert.equal(chapterOf(i, null)!.name, 'Своя дорога');
  // сюжет считает шаги по версии своей масти
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.story = { ch: i, step: 0, progress: 0 };
  p.mast = 'muzhik';
  g.track(p, 'job', 40);
  assert.equal(p.story.progress, 40);
  const r = g.claimStory(p, T0);
  assert.equal(r.money, 8000);
});

test('хата: 16 мест, стиль хаты даёт бонус за то, что стоит в сцене', async () => {
  const { CELL_THEMES, SPOTS, FURNITURE, furnitureById } = await import('../shared/content.ts');
  assert.equal(SPOTS.length, 16);
  for (const s of SPOTS) assert.ok(FURNITURE.filter((f) => f.spot === s).length >= 2, s);
  for (const t of CELL_THEMES) {
    for (const grp of t.groups) for (const id of grp) assert.ok(furnitureById.has(id), `${t.id}: ${id}`);
    assert.ok(t.need <= t.groups.length);
  }
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.furniture = ['f_mattress', 'f_blanket', 'f_tumba', 'f_table', 'f_roach', 'f_cat'];
  const before = g.stats(p, T0).maxEnergy;
  p.furniture.push('f_curtains'); // одеяло, стол, кот, занавески — «Как дома» собрана
  assert.equal(g.stats(p, T0).maxEnergy - before, 15);
  // убрал кота из сцены — тема распалась
  p.cellShow.pet = 'f_roach';
  assert.equal(g.stats(p, T0).maxEnergy, before);
});

test('силы зоны: масть ускоряет, соперник теряет, звания дают бонус; общак', async () => {
  const { repRank, REP_THRESHOLDS, OBSHAK } = await import('../shared/factions.ts');
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.mast = 'kozel';
  assert.equal(g.gainRep(p, 'admin', 10), 15);
  p.rep.brat = 100;
  g.gainRep(p, 'admin', 10); // +15 администрации, братва −6
  assert.equal(p.rep.brat, 94);
  assert.equal(g.repBonus(p, 'questMoney'), 0);
  p.rep.admin = REP_THRESHOLDS[3];
  assert.equal(repRank(p.rep.admin), 3);
  assert.equal(g.repBonus(p, 'questMoney'), 15);
  // с «Твёрдо стал» срок скашивается быстрее
  const t0 = p.term;
  g.serve(p, 1);
  assert.ok(Math.abs(t0 - p.term - 1.15) < 0.01);
  // смена растит работяг, места — свою силу
  const w = p.rep.work;
  p.energy = 500;
  g.doJob(p, 'j_floor', T0, fixed(0.5));
  assert.equal(p.rep.work, w + 1);
  const r = g.placeDo(p, 'canteen', 'kitchen', T0, fixed(0.1));
  assert.equal(r.rep.work, 2);

  // общак
  const ob: g.Obshak = { total: 0, log: [] };
  p.money = 100_000;
  assert.throws(() => g.obshakGive(p, ob, 1, T0), /Минимум/);
  const give = g.obshakGive(p, ob, 10, T0);
  assert.equal(ob.total, give.money);
  assert.equal(ob.log[0].name, 'Тест');
  assert.ok(give.rep >= 10);
  p.rep.brat = 0;
  assert.throws(() => g.obshakAsk(p, ob, T0), /близким/);
  p.rep.brat = REP_THRESHOLDS[3];
  const ask = g.obshakAsk(p, ob, T0);
  assert.ok(ask.money > 0 && ask.money <= give.money * OBSHAK.askShare + 1);
  assert.throws(() => g.obshakAsk(p, ob, T0 + MIN), /завтра/);
});

test('долги: барыга под процент, счётчик за просрочку, выбивают силой; карточный долг', async () => {
  const { DEBT } = await import('../shared/factions.ts');
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.level = 10;
  p.money = 0;
  p.authority = 50;
  const r = g.loanTake(p, 10, T0);
  assert.equal(p.money, r.money);
  assert.equal(p.debt!.amount, Math.round(r.money * (1 + DEBT.interest)));
  assert.throws(() => g.loanTake(p, 5, T0), /старый/);
  assert.throws(() => g.loanTake(p, 7, T0), /столько/);
  // вовремя — никакого счётчика
  g.debtCounter(p, T0 + 23 * 60 * MIN);
  assert.equal(p.debt!.counted, 0);
  // просрочка на сутки: +15% и минус авторитет
  const owe = p.debt!.amount;
  g.debtCounter(p, T0 + 25 * 60 * MIN);
  assert.equal(p.debt!.counted, 1);
  assert.equal(p.debt!.amount, Math.round(owe * (1 + DEBT.counter)));
  assert.equal(p.authority, 50 - DEBT.authorityLoss);
  g.debtCounter(p, T0 + 26 * 60 * MIN); // в те же сутки второй раз не капает
  assert.equal(p.debt!.counted, 1);
  // третьи сутки — выбивают: забирают всё, что есть
  g.debtCounter(p, T0 + (24 * 3 + 1) * 60 * MIN);
  assert.equal(p.money, 0);
  assert.ok(p.debt === null || p.debt.amount > 0);
  // частичный и полный возврат
  p.debt = { amount: 1000, due: T0 + 60 * MIN, from: 'baryga', counted: 0 };
  p.money = 400;
  assert.equal(g.loanPay(p, 400, T0).left, 600);
  p.money = 5000;
  assert.equal(g.loanPay(p, 5000, T0).cleared, true);
  assert.equal(p.money, 4400);
  assert.equal(p.debt, null);
  assert.throws(() => g.loanPay(p, 10, T0), /никому/);
  // проигрыш катале в долг
  p.event = { id: 'x_katala', until: T0 + 30 * MIN };
  const lost = g.answerEvent(p, 0, T0, fixed(0.99));
  assert.ok(lost.debt > 0);
  assert.equal((p.debt as { from: string } | null)?.from, 'katala');
});

test('ремесло: материалы с промки, рецепты, «Мастеровой» получает вдвое', async () => {
  const { RECIPES, MATS } = await import('../shared/craft.ts');
  const { consumableById } = await import('../shared/perks.ts');
  const { itemById, REP_THRESHOLDS } = { ...(await import('../shared/content.ts')), ...(await import('../shared/factions.ts')) };
  for (const r of RECIPES) {
    if (r.out.item) assert.ok(consumableById.has(r.out.item), r.id);
    if (r.out.gear) assert.ok(itemById.get(r.out.gear)?.crafted, r.id);
    for (const id of Object.keys(r.mats)) assert.ok(MATS.some((m) => m.id === id), `${r.id}: ${id}`);
  }
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.level = 5;
  p.energy = 500;
  g.placeDo(p, 'factory', 'sew', T0, fixed(0.1));
  assert.equal(p.mats.thread, 2);
  assert.equal(p.mats.cloth, 1);
  assert.throws(() => g.craft(p, 'r_insert', T0), /материалов/);
  assert.throws(() => g.craft(p, 'r_ring', T0), /уровня/);
  const b0 = p.stash.c_bandage ?? 0;
  p.mats.cloth = 2;
  const r = g.craft(p, 'r_bandage', T0);
  assert.equal(p.stash.c_bandage, b0 + 2);
  assert.equal(p.mats.cloth, 0);
  assert.ok(r.rep > 0);
  // вещь ремеслом — одна
  p.mats = { bread: 8, thread: 4 };
  g.craft(p, 'r_beads', T0);
  assert.ok(p.inventory.includes('craft_beads'));
  assert.throws(() => g.craft(p, 'r_beads', T0), /уже есть/);
  // «Мастеровой» у работяг — материалов вдвое
  p.rep.work = REP_THRESHOLDS[3];
  assert.deepEqual(g.giveMats(p, { wire: 2 }), { wire: 4 });
});

test('барахолка: товар уходит с прилавка и возвращается, надетое не продать', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  p.stash = { c_bandage: 3 };
  p.belt = ['c_bandage'];
  g.takeGoods(p, 'item', 'c_bandage', 2);
  assert.equal(p.stash.c_bandage, 1);
  g.takeGoods(p, 'item', 'c_bandage', 1);
  assert.equal(p.stash.c_bandage, undefined);
  assert.ok(!p.belt.includes('c_bandage'));
  assert.throws(() => g.takeGoods(p, 'item', 'c_bandage', 1), /нет/);
  p.mats = { wire: 3 };
  assert.throws(() => g.takeGoods(p, 'mat', 'wire', 4), /нет/);
  assert.throws(() => g.takeGoods(p, 'mat', 'gold', 1), /нет/);
  g.takeGoods(p, 'mat', 'wire', 3);
  p.inventory = ['body_robe', 'cap_knit'];
  p.equipped.body = 'body_robe';
  assert.throws(() => g.takeGoods(p, 'gear', 'body_robe', 1), /сними/);
  p.upgrades.cap_knit = 2;
  g.takeGoods(p, 'gear', 'cap_knit', 1);
  assert.ok(!p.inventory.includes('cap_knit'));
  assert.equal(p.upgrades.cap_knit, undefined);
  const q = g.newPlayer(2, 'Покупатель', null, T0);
  g.giveGoods(q, 'gear', 'cap_knit', 1);
  g.giveGoods(q, 'mat', 'wire', 3);
  g.giveGoods(q, 'item', 'c_bandage', 2);
  assert.ok(q.inventory.includes('cap_knit'));
  assert.equal(q.mats.wire, 3);
  assert.equal(q.stash.c_bandage, 2 + (g.newPlayer(3, 'x', null, T0).stash.c_bandage ?? 0));
  assert.throws(() => g.takeGoods(p, 'item', 'c_sand', 0), /Сколько/);
});

test('мини-игры 2: нарды, домино, этюд и ловкость', async () => {
  const { NARDY, PUZZLES, legalMoves, isMateMove, nardyLand, SPEED } = await import('../shared/minigames2.ts');
  // этюды: у каждого есть мат в один ход, стартовая позиция без шаха
  for (const pz of PUZZLES) assert.ok(legalMoves(pz.pieces, true).some(([s, t]) => isMateMove(pz.pieces, s, t)), pz.id);
  assert.equal(nardyLand(5, 2), 2); // ловушка на 7 — назад на 5
  assert.equal(nardyLand(2, 2), 7); // мостик на 4 — вперёд на 3

  const p = g.newPlayer(1, 'Тест', null, T0);
  p.level = 10;
  p.money = 100_000;
  let seed = 1;
  const rng: g.Rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // нарды доигрываются до конца, ставка списана, выигрыш вдвое
  g.nardyStart(p, 500, T0, rng);
  assert.equal(p.money, 99_500);
  assert.throws(() => g.nardyStart(p, 500, T0, rng), /идёт/);
  let r;
  for (let i = 0; i < 60 && p.tables.nardy; i++) r = g.nardyMove(p, 'sum', rng);
  assert.ok(r && r.result);
  assert.equal(p.money, 99_500 + (r!.result === 'win' ? Math.round(500 * NARDY.payout) : 0));

  // домино доигрывается: ходим первой подходящей, иначе берём
  g.dominoStart(p, 500, T0, rng);
  let end = null;
  for (let i = 0; i < 80 && p.tables.domino; i++) {
    const d = p.tables.domino!;
    const l = d.chain[0][0];
    const rr = d.chain[d.chain.length - 1][1];
    const k = d.hand.findIndex((t) => t[0] === l || t[1] === l || t[0] === rr || t[1] === rr);
    const res = k < 0 ? g.dominoMove(p, -1, 'r') : g.dominoMove(p, k, d.hand[k][0] === rr || d.hand[k][1] === rr ? 'r' : 'l');
    end = res.end ?? end;
  }
  assert.ok(end, 'партия закончилась');
  assert.equal(p.tables.domino, undefined);

  // этюд: правильный ход — награда, неправильный — пусто
  const pz = g.chessPuzzle(p, T0, fixed(0));
  assert.equal(pz.id, PUZZLES[0].id);
  assert.equal(g.chessSolve(p, 'a1', 'a8', T0).ok, true);
  g.chessPuzzle(p, T0, fixed(0));
  assert.equal(g.chessSolve(p, 'a1', 'a7', T0).ok, false);

  // ловкость: фальстарт ничего не даёт, результаты режутся
  assert.equal(g.speedChifir(p, 50, T0).butts, 0);
  assert.equal(g.speedChifir(p, 200, T0).butts, SPEED.tiers[0].butts);
  const belt = g.beltShift(p, 10_000, 0, T0);
  assert.equal(belt.good, 30);
  assert.throws(() => g.beadsPlay(p, [1, 1], T0), /бусины/);
  const beads = g.beadsPlay(p, Array(10).fill(5), T0);
  assert.equal(beads.quality, 1);
  const fish = g.fishing(p, [1, 0.6, 0], T0, fixed(0.9));
  assert.deepEqual(fish.catches.map((c) => c.kind), ['butts', 'butts', 'none']);
});

test('ШИЗО: пять суток, ночь отнимает, ноль — сломался; выжил — авторитет и братва', async () => {
  const { SHIZO, SHIZO_CARDS } = await import('../shared/minigames2.ts');
  assert.ok(SHIZO_CARDS.length >= SHIZO.days);
  const p = g.newPlayer(1, 'Тест', null, T0);
  assert.throws(() => g.shizoStart(p, T0, fixed(0)), /уровня/);
  p.level = 10;
  g.shizoStart(p, T0, fixed(0));
  // с умом: поднимать самую слабую шкалу — выживаешь
  let r;
  for (let i = 0; i < 10 && p.tables.shizo; i++) {
    const st = p.tables.shizo!;
    const card = SHIZO_CARDS.find((c) => c.id === st.card)!;
    const after = (o: (typeof card.opts)[number]) => Math.min(st.heat + (o.d.heat ?? 0), st.food + (o.d.food ?? 0), st.spirit + (o.d.spirit ?? 0));
    const best = card.opts.map((o, k) => ({ k, s: after(o) - (o.butts ? 99 : 0) })).sort((a, b) => b.s - a.s)[0].k;
    r = g.shizoPick(p, best, T0, fixed(0.99));
  }
  assert.ok(r?.end?.won, 'выжил');
  assert.ok(p.rep.brat > 0);
  assert.throws(() => g.shizoStart(p, T0, fixed(0)), /завтра/);
  // худшие варианты — ломается
  const q = g.newPlayer(2, 'Слабак', null, T0);
  q.level = 10;
  g.shizoStart(q, T0, fixed(0));
  let r2;
  for (let i = 0; i < 10 && q.tables.shizo; i++) {
    const card = SHIZO_CARDS.find((c) => c.id === q.tables.shizo!.card)!;
    const worst = card.opts.map((o, k) => ({ k, s: (o.d.heat ?? 0) + (o.d.food ?? 0) + (o.d.spirit ?? 0) + (o.butts ? 99 : 0) })).sort((a, b) => a.s - b.s)[0].k;
    r2 = g.shizoPick(q, worst, T0, fixed(0.99));
  }
  assert.equal(r2?.end?.won, false);
});

test('клан: постройки хаты дают бонусы, очки войны копятся в клане, босс клана с откатом', () => {
  const p = g.newPlayer(1, 'Тест', null, T0);
  const s0 = g.stats(p, T0);
  p.clanHut = { kitchen: 2, gym: 5, cash: 1 };
  assert.equal(g.stats(p, T0).maxEnergy, s0.maxEnergy, 'без клана постройки не работают');
  p.clanId = 7;
  const s1 = g.stats(p, T0);
  assert.equal(s1.maxEnergy - s0.maxEnergy, 6);
  assert.ok(s1.atk > s0.atk);
  assert.equal(s1.moneyBonus - s0.moneyBonus, 2);
  // очки войны
  g.track(p, 'pvpWin');
  assert.equal(p.war.pts, 2);
  g.track(p, 'boss', 3);
  assert.equal(p.war.pts, 5);
  p.clanId = null;
  g.track(p, 'pvpWin');
  assert.equal(p.war.pts, 5, 'без клана очков нет');
  // босс клана
  assert.throws(() => g.clanBossHit(p, T0, fixed(0.5)), /не в клане/);
  p.clanId = 7;
  p.energy = 100;
  const h = g.clanBossHit(p, T0, fixed(0.5));
  assert.ok(h.damage > 0);
  assert.throws(() => g.clanBossHit(p, T0 + 1000, fixed(0.5)), /не готов/);
});

test('ринг: очередь, ставки зрителей, тотализатор и доля на общак', async () => {
  const { RING } = await import('../shared/clans.ts');
  const db = new Map<number, g.Player>();
  const mk = (id: number, lvl: number) => {
    const x = g.newPlayer(id, `И${id}`, null, T0);
    x.level = lvl;
    x.money = 100_000;
    x.str = lvl * 3;
    db.set(id, x);
    return x;
  };
  const a = mk(1, 10);
  const b = mk(2, 10);
  const fan1 = mk(3, 10);
  const fan2 = mk(4, 10);
  const ring = g.emptyRing();
  g.ringJoin(a, ring, T0);
  assert.equal(ring.cur, null);
  assert.throws(() => g.ringJoin(a, ring, T0), /записан/);
  g.ringJoin(b, ring, T0);
  assert.ok(ring.cur);
  assert.equal((ring.cur as g.RingMatch | null)!.fee, 2 * g.ration(a));
  assert.throws(() => g.ringBet(a, ring, 'a', 500, T0), /свой/);
  g.ringBet(fan1, ring, 'a', 1000, T0);
  g.ringBet(fan2, ring, 'b', 1500, T0);
  assert.throws(() => g.ringBet(fan1, ring, 'b', 500, T0), /уже/);
  // рано — бой не идёт
  assert.equal(g.ringResolve(ring, T0 + MIN, (id) => db.get(id)!, () => {}, fixed(0.5)), 0);
  assert.ok(ring.cur);
  const cut = g.ringResolve(ring, T0 + RING.delayMin * MIN, (id) => db.get(id)!, () => {}, fixed(0.5));
  assert.equal(ring.cur, null);
  const done = ring.last[0];
  assert.equal(done.pool, 2500);
  const winFan = done.winner === 'a' ? fan1 : fan2;
  const loseFan = done.winner === 'a' ? fan2 : fan1;
  const lost = done.winner === 'a' ? 1500 : 1000;
  const stake = done.winner === 'a' ? 1000 : 1500;
  assert.equal(cut, Math.floor(lost * RING.cut));
  assert.equal(winFan.money, 100_000 - stake + stake + (lost - cut));
  assert.equal(loseFan.money, 100_000 - lost);
  // сорвавшийся бой: ставки возвращаются
  const r2 = g.emptyRing();
  g.ringJoin(a, r2, T0);
  g.ringJoin(b, r2, T0);
  g.ringBet(fan1, r2, 'a', 500, T0);
  const m1 = fan1.money;
  g.ringResolve(r2, T0 + 10 * MIN, (id) => (id === 2 ? null : db.get(id)!), () => {}, fixed(0.5));
  assert.equal(fan1.money, m1 + 500);
});

test('чат: только готовые фразы, откат и дневной лимит', async () => {
  const { CHAT } = await import('../shared/chat.ts');
  const p = g.newPlayer(1, 'Тест', null, T0);
  assert.throws(() => g.chatSay(p, 'мат-перемат', T0), /нет/);
  g.chatSay(p, 'hi', T0);
  assert.throws(() => g.chatSay(p, 'hi', T0 + 1000), /части/);
  let t = T0;
  for (let i = 1; i < CHAT.perDay; i++) g.chatSay(p, 'gg', (t += CHAT.cooldownSec * 1000));
  assert.throws(() => g.chatSay(p, 'gg', (t += CHAT.cooldownSec * 1000)), /наговорился/);
});

test('грев посылкой и цепочка кентов', async () => {
  const { PARCEL, REFERRAL } = await import('../shared/clans.ts');
  const a = g.newPlayer(1, 'Отправитель', null, T0);
  const b = g.newPlayer(2, 'Получатель', null, T0);
  assert.throws(() => g.sendParcel(a, b, 'item', 'c_bandage', 1, T0), /уровня/);
  a.level = 5;
  a.stash = { c_bandage: 5 };
  a.mats = { wire: 10 };
  const b0 = b.stash.c_bandage ?? 0;
  g.sendParcel(a, b, 'item', 'c_bandage', 1, T0);
  assert.equal(b.stash.c_bandage, b0 + 1);
  assert.throws(() => g.sendParcel(a, b, 'mat', 'wire', 6, T0), /много/);
  g.sendParcel(a, b, 'mat', 'wire', 5, T0);
  assert.equal(b.mats.wire, 5);
  for (let i = 2; i < PARCEL.perDay; i++) g.sendParcel(a, b, 'item', 'c_bandage', 1, T0);
  assert.throws(() => g.sendParcel(a, b, 'item', 'c_bandage', 1, T0), /хватит/);
  assert.throws(() => g.sendParcel(a, a, 'item', 'c_bandage', 1, T0), /Себе/);
  // вехи кентов
  assert.deepEqual(g.refDue(b), []);
  b.refBy = 1;
  b.level = 12;
  assert.deepEqual(g.refDue(b).map((m) => m.level), [5, 10]);
  b.refPaid = [5, 10];
  assert.deepEqual(g.refDue(b), []);
  b.level = 25;
  assert.deepEqual(g.refDue(b).map((m) => m.gold), [REFERRAL.milestones[2].gold]);
});

test('сезон: очки, тема ×2, пропуск, предложение дня, косметика, новый месяц', async () => {
  const { PASS, seasonIndex, seasonTheme, passReward } = await import('../shared/season.ts');
  const { packById, offerOfDay, itemById } = await import('../shared/content.ts');
  const now = Date.now();
  const p = g.newPlayer(1, 'Тест', null, now);
  const th = seasonTheme(seasonIndex(now));
  g.track(p, th.focus);
  const one = p.season.pts;
  assert.ok(one >= 2, 'тема месяца даёт вдвое');
  // все награды пропуска существуют
  for (let L = 1; L <= PASS.levels; L++) for (const paid of [false, true]) {
    const r = passReward(L, paid);
    if (r.gear) assert.ok(itemById.has(r.gear));
  }
  assert.throws(() => g.seasonClaim(p, 1, false, now, fixed(0.1)), /не открыт/);
  p.season.pts = PASS.perLevel * 10;
  g.seasonClaim(p, 1, false, now, fixed(0.1));
  assert.throws(() => g.seasonClaim(p, 1, false, now, fixed(0.1)), /Уже/);
  assert.throws(() => g.seasonClaim(p, 1, true, now, fixed(0.1)), /пропуск/);
  // покупка пропуска
  const pass = g.checkPack(p, 'season_pass', now);
  g.applyPack(p, pass, now);
  assert.throws(() => g.checkPack(p, 'season_pass', now), /уже/);
  g.seasonClaim(p, 10, true, now, fixed(0.1));
  assert.ok(p.cosmetics.includes('frame_season'));
  g.wearCosmetic(p, 'frame', 'frame_season');
  assert.equal(p.frame, 'frame_season');
  assert.throws(() => g.wearCosmetic(p, 'frame', 'frame_gold'), /нет/);
  // косметика и предложение дня
  g.applyPack(p, packById.get('cos_frame_gold')!, now);
  assert.throws(() => g.checkPack(p, 'cos_frame_gold', now), /твоё/);
  const off = offerOfDay(now);
  const other = [...packById.values()].find((x) => x.offer && x.id !== off.id)!;
  assert.throws(() => g.checkPack(p, other.id, now), /закончилось/);
  g.applyPack(p, g.checkPack(p, off.id, now), now);
  assert.throws(() => g.checkPack(p, off.id, now), /брал/);
  // новый месяц — всё с нуля
  const later = now + 32 * 86_400_000;
  g.ensureSeason(p, later);
  assert.equal(p.season.pts, 0);
  assert.equal(p.season.pass, false);
  assert.ok(p.cosmetics.includes('frame_season'), 'косметика остаётся');
});

test('открытия по уровням: сервер не пускает раньше, старым игрокам окна не сыплются', async () => {
  const { UNLOCKS } = await import('../shared/unlocks.ts');
  const p = g.newPlayer(1, 'Тест', null, T0);
  assert.throws(() => g.requireUnlock(p, 'lotPut'), /4 уровня/);
  assert.throws(() => g.requireUnlock(p, 'ringJoin'), /3 уровня/);
  g.requireUnlock(p, 'job'); // не в списке — открыто
  g.requireUnlock(p, 'pvp'); // наезды с первого — их ждёт сюжет
  p.level = 4;
  g.requireUnlock(p, 'lotPut');
  // старый игрок 10 уровня без поля — всё до 10 уровня уже «видел»
  const old = g.newPlayer(2, 'Старый', null, T0) as unknown as Record<string, unknown>;
  old.level = 10;
  delete old.unlocksSeen;
  const m = g.migrate(old as unknown as g.Player);
  assert.equal(m.unlocksSeen.length, UNLOCKS.filter((u) => u.level <= 10).length);
  g.seeUnlocks(p, ['dice', 'dice', 'нет такого']);
  assert.deepEqual(p.unlocksSeen, ['dice']);
});

test('защита от накруток: без старта и слишком быстро не засчитывается, подозрение копится и остывает', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  assert.match(g.runCheck(p, 'darts', { accs: [1, 1, 1] }, T0)!, /сбилась/);
  assert.ok(p.sus.score > 0);
  g.runStart(p, 'darts', T0, fixed(0.5));
  assert.match(g.runCheck(p, 'darts', { accs: [1, 1, 1] }, T0 + 100)!, /быстро/);
  const afterFast = p.sus.score;
  assert.ok(afterFast >= 4);
  // честная игра проходит; идеальная — проходит, но отмечается
  g.runStart(p, 'darts', T0, fixed(0.5));
  assert.equal(g.runCheck(p, 'darts', { accs: [0.5, 0.6, 0.4] }, T0 + 3000), null);
  assert.equal(p.sus.score, afterFast);
  g.runStart(p, 'darts', T0, fixed(0.5));
  assert.equal(g.runCheck(p, 'darts', { accs: [1, 1, 1] }, T0 + 3000), null);
  assert.ok(p.sus.score > afterFast);
  // старт одноразовый
  assert.match(g.runCheck(p, 'darts', { accs: [0.5, 0.5, 0.5] }, T0 + 4000)!, /сбилась/);
  // остывает
  assert.ok(g.susScore(p, T0 + 10 * 24 * 60 * MIN) === 0);
  // невозможное
  g.runStart(p, 'conveyor', T0, fixed(0.5));
  assert.match(g.runCheck(p, 'conveyor', { good: 30, missed: 30 }, T0 + 30_000)!, /не бывает/);
  // не мини-игры не трогаем
  assert.equal(g.runCheck(p, 'job', {}, T0), null);
});

test('чифир на скорость: паузу выбирает сервер, раньше неё результат не принимается, фальстарт честный', () => {
  const p = g.newPlayer(1, 'Вася', null, T0);
  const { delay } = g.runStart(p, 'speed', T0, fixed(0.5));
  assert.ok(delay >= 1400 && delay <= 4000);
  assert.match(g.runCheck(p, 'speed', { ms: 250 }, T0 + 300)!, /быстро/);
  g.runStart(p, 'speed', T0, fixed(0.5));
  assert.equal(g.runCheck(p, 'speed', { ms: 250 }, T0 + delay + 400), null);
  const before = p.sus.score;
  g.runStart(p, 'speed', T0, fixed(0.5));
  assert.equal(g.runCheck(p, 'speed', { ms: 0 }, T0 + 200), null);
  assert.equal(p.sus.score, before);
});

test('напоминания: долг горит, клановый босс, конец сезона, каждое выключается отдельно', () => {
  const day = Date.UTC(2026, 0, 30, 10); // 13:00 по Москве, за два дня до конца сезона
  const p = g.newPlayer(1, 'Вася', null, day - 24 * 3600_000);
  p.lastSeen = day - 3600_000;
  p.dailyAt = day;
  p.energy = 0;
  p.debt = { amount: 500, base: 400, due: day + 2 * 3600_000, from: 'baryga', counted: 0 } as never;
  assert.equal(g.pendingNotice(p, day)?.kind, 'debt');
  g.setNotifyKind(p, 'debt', false);
  assert.notEqual(g.pendingNotice(p, day)?.kind, 'debt');
  p.clanId = 5;
  assert.equal(g.pendingNotice(p, day, { clanBoss: true })?.kind, 'clanBoss');
  assert.equal(g.pendingNotice(p, day, { clanBoss: false }), null);
  g.ensureSeason(p, day);
  p.season.pts = 3 * 260;
  assert.equal(g.pendingNotice(p, day)?.kind, 'season');
  g.setNotifyKind(p, 'debt', true);
  assert.equal(g.pendingNotice(p, day)?.kind, 'debt');
  assert.throws(() => g.setNotifyKind(p, 'spam', false), /Нет таких/);
  assert.equal(g.pendingNotice(p, day, { live: { startsAt: day - 1000, text: '🎪 Шмон!' } })?.kind, 'debt', 'долг важнее');
  g.setNotifyKind(p, 'debt', false);
  assert.equal(g.pendingNotice(p, day, { live: { startsAt: day - 1000, text: '🎪 Шмон!' } })?.text, '🎪 Шмон!');
});

import { TUTORIAL, TUT_GIFT } from '../shared/tutorial.ts';

test('обучение: после вступления сыплет бычки, шаги идут по действиям, в конце подарок; старым игрокам не показывается', () => {
  const p = g.newPlayer(1, 'Новичок', null, T0);
  for (let i = 0; p.intro >= 0 && i < 20; i++) g.introStep(p, 0, T0);
  assert.equal(p.intro, -1);
  assert.equal(TUTORIAL[p.tut].id, 'look');
  assert.equal(g.tutAdvance(p, 'job', T0), null, 'чужое действие не считается');
  g.setFace(p, 3);
  g.tutAdvance(p, 'face', T0);
  assert.equal(TUTORIAL[p.tut].id, 'butts');
  assert.ok(p.field.length >= 5, 'бычки насыпаны');
  for (let i = 0; i < 5; i++) {
    g.pickButt(p, p.field[0].id);
    g.tutAdvance(p, 'butt', T0);
  }
  assert.equal(TUTORIAL[p.tut].id, 'trade');
  const gold0 = p.gold;
  g.tutAdvance(p, 'trade', T0);
  g.tutAdvance(p, 'job', T0);
  assert.ok(p.level >= 2, 'после смены — второй уровень, чтобы открылся первый босс');
  for (const a of ['boss', 'furnish']) g.tutAdvance(p, a, T0);
  assert.equal(p.tut, -1);
  assert.equal(p.gold, gold0 + TUT_GIFT.gold);
  assert.throws(() => g.tutSkip(p), /позади/);
  // лицо уже выбрано до конца вступления — шаг пропускается
  const q = g.newPlayer(2, 'Б', null, T0);
  g.setFace(q, 2);
  for (let i = 0; q.intro >= 0 && i < 20; i++) g.introStep(q, 0, T0);
  assert.equal(TUTORIAL[q.tut].id, 'butts');
  // старый игрок
  const old = g.migrate({ ...g.newPlayer(3, 'В', null, T0), tut: undefined } as never);
  assert.equal(old.tut, -1);
});

import { autoLive, currentLive, nextAutoLive } from '../shared/live.ts';

test('события зоны: по выходным сами по кругу, ручное важнее; опыт и деньги умножаются', () => {
  const fri = Date.UTC(2026, 9, 2, 12); // пятница
  const sat = Date.UTC(2026, 9, 3, 9); // суббота 12:00 МСК
  const sun = Date.UTC(2026, 9, 4, 19); // воскресенье 22:00 МСК
  const mon = Date.UTC(2026, 9, 5, 9);
  assert.equal(autoLive(fri), null);
  assert.ok(autoLive(sat));
  assert.equal(autoLive(sun)?.id, autoLive(sat)!.id);
  assert.equal(autoLive(mon), null);
  assert.notEqual(autoLive(sat + 7 * 24 * 3600_000)!.id, autoLive(sat)!.id, 'на следующих выходных — другое');
  assert.equal(nextAutoLive(fri).startsAt, autoLive(sat)!.startsAt);
  const manual = { id: 'payday' as const, startsAt: fri, endsAt: fri + 3600_000, by: 'admin' as const };
  assert.equal(currentLive(fri + 1000, manual)?.id, 'payday');
  assert.equal(currentLive(fri + 2 * 3600_000, manual), null);

  const p = g.newPlayer(1, 'Вася', null, T0);
  const q = g.newPlayer(2, 'Петя', null, T0);
  g.live.cur = { id: 'amnesty', startsAt: T0 - 1, endsAt: T0 + 3600_000, by: 'admin' };
  g.addXp(p, 10, T0);
  g.live.cur = null;
  g.addXp(q, 10, T0);
  assert.equal(p.xp, q.xp * 2);
  g.live.cur = { id: 'payday', startsAt: T0 - 1, endsAt: T0 + 3600_000, by: 'admin' };
  const rich = g.doJob(p, 'j_floor', T0, fixed(0.5)).money;
  g.live.cur = null;
  const poor = g.doJob(q, 'j_floor', T0, fixed(0.5)).money;
  assert.equal(rich, Math.round(poor * 1.5));
  // шмон: находки
  g.live.cur = { id: 'shmon', startsAt: T0 - 1, endsAt: T0 + 3600_000, by: 'admin' };
  const r = g.doJob(p, 'j_floor', T0, fixed(0.01));
  assert.ok(r.found);
  g.live.cur = null;
});

import { LEAGUE, leaguePoints, leagueTier } from '../shared/league.ts';

test('лиги: соперник по силе, за слабого очков нет, одного не больше двух раз в день, награда за прошлую неделю', () => {
  const p = g.newPlayer(1, 'Я', null, T0);
  p.level = 10;
  p.str = 30;
  const mk = (id: number, str: number, level = 10) => Object.assign(g.newPlayer(id, `Б${id}`, null, T0), { level, str });
  const weak = mk(2, 5, 4);
  const equal = mk(3, 30);
  const strong = mk(4, 80, 20);
  assert.equal(g.pickOpponent(p, [weak, equal, strong], T0, fixed(0))!.id, 3);
  // очки
  assert.equal(leaguePoints(true, 1), LEAGUE.win);
  assert.equal(leaguePoints(true, 0.5), 0, 'слабый — без очков');
  assert.ok(leaguePoints(true, 1.5) > LEAGUE.win);
  assert.equal(leaguePoints(false, 1), -LEAGUE.loss);
  assert.equal(leaguePoints(true, null), Math.round(LEAGUE.win * LEAGUE.botShare));
  // не больше двух раз одного
  const res = g.pvpFinish(p, equal, 0, { win: true, hpLeft: 100, used: [], lootBonus: 0 } as never, T0, fixed(0.5), 1);
  assert.equal(res.league.pts, LEAGUE.win);
  g.pvpFinish(p, equal, 0, { win: true, hpLeft: 100, used: [], lootBonus: 0 } as never, T0, fixed(0.5), 1);
  assert.equal(g.pickOpponent(p, [equal], T0, fixed(0)), null);
  assert.ok(g.pickOpponent(p, [equal], T0 + 24 * 3600_000, fixed(0)), 'назавтра — снова можно');
  // неделя закончилась: прошлая неделя помнится, награда по лиге
  p.league.pts = 350;
  const week = p.league.week;
  g.ensureLeague(p, T0 + 7 * 24 * 3600_000);
  assert.equal(p.league.pts, 0);
  assert.deepEqual(p.league.last, { week, pts: 350 });
  const gold0 = p.gold;
  const r = g.leagueClaim(p, { week, pts: 350, rank: 0 }, T0);
  assert.equal(r.gold, leagueTier(350).gold + LEAGUE.topGold[0]);
  assert.equal(p.gold, gold0 + r.gold);
  assert.ok(p.cosmetics.includes(LEAGUE.champTitle));
  assert.throws(() => g.leagueClaim(p, { week, pts: 350, rank: 0 }, T0), /уже получена/);
});

import { PLACES } from '../shared/places.ts';

test('список экранов мест в клиенте совпадает с местами игры', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const m = src.match(/PLACE_SCREENS = new Set<string>\(\[([^\]]*)\]\)/)!;
  const ids = m[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort();
  assert.deepEqual(ids, PLACES.map((p) => p.id).sort());
});

import { REVENGE } from '../shared/league.ts';

test('месть: наезд записывается с повтором, отомстить можно сутки один раз, очки лиги вдвойне и отжатое назад', () => {
  const a = Object.assign(g.newPlayer(1, 'Наглый', null, T0), { level: 10, str: 30, money: 5000 });
  const v = Object.assign(g.newPlayer(2, 'Жертва', null, T0), { level: 10, str: 30, money: 5000 });
  const win = { win: true, hpLeft: 50, used: [], lootBonus: 0, rounds: [{ by: 0, dmg: 10, crit: false }], startHp: [100, 90], maxHp: [100, 90], log: [], damageDealt: 10 } as never;
  const r1 = g.pvpFinish(a, v, 400, win, T0, fixed(0.9), 1);
  assert.equal(v.attacks.length, 1);
  const rec = v.attacks[0];
  assert.equal(rec.by, 1);
  assert.equal(rec.replay.rounds[0].by, 1, 'в повторе жертва слева');
  assert.deepEqual(rec.replay.startHp, [90, 100]);
  assert.ok(g.canAvenge(rec, T0 + 3600_000));
  assert.ok(!g.canAvenge(rec, T0 + (REVENGE.hours + 1) * 3600_000));
  assert.throws(() => g.revengeStart(v, rec.at, null, T0 + 1000, fixed(0.5)), /Некому/);
  v.pvpAt = 0;
  g.revengeStart(v, rec.at, a, T0 + 1000, fixed(0.5));
  assert.ok(rec.avenged);
  const bt = v.battle!;
  v.battle = null;
  assert.equal(bt.revenge, rec.at);
  const r2 = g.pvpFinish(v, a, 10, win, T0 + 2000, fixed(0.9), 1, bt.revenge);
  assert.ok(r2.revenge);
  assert.equal(r2.league.pts, r1.league.pts * REVENGE.leagueMul);
  assert.ok(r2.loot >= r1.loot, 'вернул отжатое');
  assert.equal(a.attacks.length, 0, 'месть не плодит новый «наезд»');
  v.pvpAt = 0;
  assert.throws(() => g.revengeStart(v, rec.at, a, T0 + 3000, fixed(0.5)), /Уже/);
});

import { weatherAt, weatherFx, seasonOf } from '../shared/weather.ts';

test('погода: по сезону, одна на 6 часов, влияет на побег и ШИЗО', () => {
  const jan = Date.UTC(2027, 0, 10, 9);
  const jul = Date.UTC(2027, 6, 10, 9);
  assert.equal(seasonOf(jan), 'winter');
  assert.equal(seasonOf(jul), 'summer');
  assert.deepEqual(weatherAt(jan), weatherAt(jan + 3600_000), 'внутри шести часов — та же');
  for (let d = 0; d < 60; d++) {
    const w = weatherAt(jan + d * 6 * 3600_000);
    assert.ok(w.temp < 5, 'зимой не тепло');
    assert.ok(['snow', 'frost', 'cloudy', 'clear'].includes(w.kind));
  }
  assert.ok(weatherFx({ ...weatherAt(jan), kind: 'rain' }).escape > 0);
  assert.ok(weatherFx({ ...weatherAt(jan), kind: 'snow' }).escape < 0);
  assert.equal(weatherFx({ ...weatherAt(jan), kind: 'frost' }).shizoCold, 1);
});

import { ALBUMS } from '../shared/album.ts';

test('альбом: трофеи за боссов, награда только за полную коллекцию и один раз, стена до трёх трофеев', () => {
  const p = g.newPlayer(1, 'Коллекционер', null, T0);
  assert.throws(() => g.albumClaim(p, 'bosses', T0), /Собрано 0/);
  p.trophies = BOSSES.map((b) => b.id);
  const gold = p.gold;
  const r = g.albumClaim(p, 'bosses', T0);
  assert.equal(p.gold, gold + ALBUMS[0].gold);
  assert.ok(p.cosmetics.includes(r.cosmetic));
  assert.throws(() => g.albumClaim(p, 'bosses', T0), /Уже/);
  for (const b of BOSSES.slice(0, 3)) g.wallToggle(p, b.id);
  assert.throws(() => g.wallToggle(p, BOSSES[3].id), /места/);
  g.wallToggle(p, BOSSES[0].id);
  assert.equal(p.wall.length, 2);
  const q = g.newPlayer(2, 'Б', null, T0);
  assert.throws(() => g.wallToggle(q, BOSSES[0].id), /нет/);
  // старые игроки: трофеи — по золоту за первую победу
  const old = g.migrate({ ...g.newPlayer(3, 'В', null, T0), bossGold: { b_rat: '2026-01-01' }, trophies: undefined } as never);
  assert.deepEqual(old.trophies, ['b_rat']);
});

import { DUO, ESCAPE as ESC2 } from '../shared/events.ts';

test('побег вдвоём: приглашение, ходят оба, прошедший тянет сорвавшегося, награда больше; отказ возвращает энергию', () => {
  const mk = (id: number) => Object.assign(g.newPlayer(id, `Б${id}`, null, T0), { level: 10, energy: 100 });
  const a = mk(1);
  const b = mk(2);
  const run = g.duoNew(a, b, T0);
  g.duoInvite(a, b, run, T0);
  assert.equal(a.energy, 100 - ESC2.energy);
  assert.throws(() => g.escapeStart(a, T0), /кентом/);
  g.duoAccept(b, run, T0 + 1000);
  assert.equal(run.status, 'run');
  // первый ход — ждём второго
  assert.equal(g.duoStep(a, b, run, 1, T0, fixed(0)).resolved, false);
  assert.throws(() => g.duoStep(a, b, run, 1, T0, fixed(0)), /ждём/);
  const r1 = g.duoStep(b, a, run, 1, T0, fixed(0));
  assert.ok(r1.resolved && 'passed' in r1);
  assert.equal(run.stage, 1);
  // вернулись тихо: каждому — доля награды ×DUO
  const money = a.money;
  const end = g.duoFinish(a, b, run, false, T0, fixed(0.5));
  assert.ok(end.rewards[1].reward.money > 0);
  assert.ok(a.money > money);
  assert.equal(a.duo, null);
  assert.equal(b.duo, null);
  // отказ: позвавшему энергия назад
  const c = mk(3);
  const d = mk(4);
  const run2 = g.duoNew(c, d, T0);
  g.duoInvite(c, d, run2, T0);
  g.duoDecline(d, c, run2);
  assert.equal(c.energy, 100);
  assert.equal(c.duo, null);
  // сорвался один, вытащить не вышло — берут обоих
  const e = mk(5);
  const f = mk(6);
  const run3 = g.duoNew(e, f, T0);
  g.duoInvite(e, f, run3, T0);
  g.duoAccept(f, run3, T0);
  g.duoStep(e, f, run3, 0, T0, fixed(0.99));
  let k = 0;
  const seq = [0.0, 0.99, 0.99];
  const r3 = g.duoStep(f, e, run3, 0, T0, () => seq[k++ % 3]);
  assert.ok(r3.resolved && 'caught' in r3 && r3.caught);
  assert.ok(e.escape.cdUntil > T0 && f.escape.cdUntil > T0, 'оба в ШИЗО');
  assert.equal(DUO.rewardMul > 1, true);
  assert.ok(ESCAPE_STAGES.length > 1);
});

import { TOURNEY } from '../shared/minigames2.ts';

test('турнир в нарды: жребий, ходы по очереди, победа на финише, забрать победу у пропавшего', () => {
  const mk = (id: number) => Object.assign(g.newPlayer(id, `Н${id}`, null, T0), { level: 5 });
  const a = mk(1);
  const b = mk(2);
  const d = g.duelNew(a, b, T0, fixed(0.1));
  assert.equal(d.turn, 0);
  assert.throws(() => g.duelMove(d, 2, 'a', T0, fixed(0.5)), /соперника/);
  assert.throws(() => g.duelMove(d, 3, 'a', T0, fixed(0.5)), /не твоя/);
  d.pos = [22, 0];
  d.dice = [2, 5];
  const r = g.duelMove(d, 1, 'a', T0, fixed(0.5));
  assert.ok(r.over);
  assert.equal(d.winner, 0);
  assert.deepEqual(g.duelPoints(d), [TOURNEY.win, TOURNEY.loss]);
  // пропал — забрать победу можно только после срока
  const d2 = g.duelNew(a, b, T0, fixed(0.9));
  assert.equal(d2.turn, 1);
  assert.throws(() => g.duelForfeit(d2, 1, T0 + 1000, false), /ещё может/);
  g.duelForfeit(d2, 1, T0 + (TOURNEY.turnH + 1) * 3600_000, false);
  assert.equal(d2.winner, 0);
  assert.deepEqual(g.duelPoints(d2), [TOURNEY.forfeitWin, TOURNEY.loss]);
  // лимит партий в день
  for (let i = 0; i < TOURNEY.perDay - 2; i++) g.duelNew(a, b, T0, fixed(0.5));
  assert.throws(() => g.duelNew(a, b, T0, fixed(0.5)), /хватит/);
  // приз
  assert.equal(g.tourneyClaim(a, 5, 0, T0).gold, TOURNEY.topGold[0]);
  assert.throws(() => g.tourneyClaim(a, 5, 0, T0), /уже/);
});

import { COLONIES } from '../shared/colonies.ts';
import { weatherFor } from '../shared/weather.ts';

test('колонии: выбор на УДО, свои места и боссы, правила зоны', () => {
  const p = g.newPlayer(1, 'Этапник', null, T0);
  p.term = 0;
  assert.throws(() => g.release(p, T0, 'mars'), /Нет такой/);
  g.release(p, T0, 'north');
  assert.equal(p.colony, 'north');
  p.level = 30;
  p.energy = 500;
  // своё место и свой босс доступны, чужие — нет
  assert.ok(g.placeDo(p, 'logging', 'fire', T0, fixed(0.1)).text);
  assert.throws(() => g.placeDo(p, 'plac', 'sport', T0, fixed(0.1)), /другой зоне/);
  assert.throws(() => g.bossStart(p, 'b_pakhan', T0), /другой зоне/);
  assert.ok(g.bossStart(p, 'b_lumber', T0));
  p.battle = null;
  // на Севере смены платят больше, погода — зима круглый год
  const q = Object.assign(g.newPlayer(2, 'Общий', null, T0), { level: 30, energy: 500 });
  const mNorth = g.doJob(p, 'j_floor', T0, fixed(0.5)).money;
  const mGen = g.doJob(q, 'j_floor', T0, fixed(0.5)).money;
  assert.ok(mNorth > mGen);
  const july = Date.UTC(2027, 6, 1, 9);
  assert.equal(weatherFor(july, 'north').season, 'winter');
  assert.equal(weatherFor(july, 'general').season, 'summer');
  // красная зона: администрация ×2, братва ×0.5
  const r = Object.assign(g.newPlayer(3, 'Красный', null, T0), { colony: 'red' as const });
  const admin = g.gainRep(r, 'admin', 10);
  assert.equal(admin, 20);
  assert.equal(COLONIES.length, 4);
});

import { markGuess, wordOfDay, FENYA } from '../shared/fenya.ts';

test('слово дня: одинаковое для всех, подсветка с повторами, серия и награда, шесть попыток', () => {
  assert.deepEqual(markGuess('КОКОС', 'КОСЯК'), ['g', 'g', 'y', 'x', 'y']);
  assert.ok(FENYA.length >= 40);
  const p = g.newPlayer(1, 'Филолог', null, T0);
  const d = g.dayIndex(T0);
  const ans = wordOfDay(d).word;
  assert.throws(() => g.wordGuess(p, 'АБ', T0), /букв/);
  const wrong = 'Ъ'.repeat(ans.length);
  g.wordGuess(p, wrong, T0);
  const r = g.wordGuess(p, ans.toLowerCase(), T0);
  assert.ok(r.won && r.done && r.reward!.money > 0);
  assert.equal(p.wordStreak.n, 1);
  assert.throws(() => g.wordGuess(p, ans, T0), /завтра/);
  // завтра — новое слово, серия растёт
  const t2 = T0 + 24 * 3600_000;
  g.wordGuess(p, wordOfDay(d + 1).word, t2);
  assert.equal(p.wordStreak.n, 2);
  // шесть промахов — серия сгорает
  const t3 = t2 + 24 * 3600_000;
  const w3 = 'Ъ'.repeat(wordOfDay(d + 2).word.length);
  for (let i = 0; i < 6; i++) g.wordGuess(p, w3, t3);
  assert.ok(p.word.done && !p.word.won);
  assert.equal(p.wordStreak.n, 0);
});

import { PET } from '../shared/pets.ts';

test('питомцы: покупка, кормёжка с откатом, кот лечит и добавляет здоровья, голодный слабее, голубь — посылки', () => {
  const H = 3600_000;
  const p = g.newPlayer(1, 'Кошатник', null, T0);
  p.money = 10_000;
  assert.throws(() => g.petBuy(p, 'cat', 'Барсик', T0), /уровня/);
  p.level = 10;
  const hp0 = g.stats(p, T0).maxHp;
  g.petBuy(p, 'cat', '  Барсик  ', T0);
  assert.equal(p.pet!.name, 'Барсик');
  assert.equal(p.money, 8_500);
  assert.throws(() => g.petBuy(p, 'rat', '', T0), /уже/);
  assert.ok(g.stats(p, T0).maxHp > hp0);
  assert.throws(() => g.petFeed(p, T0), /сытый/);
  const t1 = T0 + PET.feedH * H;
  p.butts = 10;
  p.hp = 1;
  const r = g.petFeed(p, t1);
  assert.ok(r.heal > 0 && p.hp > 1);
  assert.equal(p.butts, 10 - PET.feedButts);
  // тренировка до 2 уровня
  p.energy = 100;
  g.petTrain(p, t1);
  assert.throws(() => g.petTrain(p, t1), /Устал/);
  g.petTrain(p, t1 + PET.trainH * H);
  assert.equal(p.pet!.level, 2);
  // двое суток без еды — сила вдвое меньше
  assert.equal(g.petPower(p, 'cat', t1 + (PET.hungryH + 1) * H), 1);
  assert.equal(g.petPower(p, 'rat', t1), 0);
  const q = g.newPlayer(2, 'Голубятник', null, T0);
  q.level = 10;
  q.money = 10_000;
  g.petBuy(q, 'pigeon', '', T0);
  assert.equal(q.pet!.name, 'Голубь');
  assert.equal(g.petParcels(q, T0), 1);
});

import { HOLIDAYS as HOLS, holidayAt, orthodoxEaster } from '../shared/holidays.ts';

test('праздники: календарь, Пасха, задания, грев, магазин, ёлка, яйца', () => {
  // православная Пасха: 2024 — 5 мая, 2025 — 20 апреля, 2026 — 12 апреля (по Москве)
  for (const [y, m, d] of [[2024, 5, 5], [2025, 4, 20], [2026, 4, 12]]) assert.equal(orthodoxEaster(y), Date.UTC(y, m - 1, d) - 3 * 3600_000);
  assert.equal(holidayAt(Date.UTC(2026, 0, 3))?.id, 'newyear');
  assert.equal(holidayAt(Date.UTC(2025, 11, 31))?.key, 2026);
  assert.equal(holidayAt(Date.UTC(2026, 1, 23))?.id, 'feb23');
  assert.equal(holidayAt(Date.UTC(2026, 3, 12))?.id, 'easter');
  assert.equal(holidayAt(Date.UTC(2026, 6, 1)), null);
  assert.equal(HOLS.length, 3);

  const ny = Date.UTC(2026, 0, 3, 12);
  const p = g.newPlayer(1, 'Снегурочка', null, ny);
  const saved = g.clock.now;
  g.clock.now = () => ny;
  try {
    assert.throws(() => g.holEgg(p, ny, () => 0), /Пасху/);
    g.holDaily(p, ny);
    assert.equal(p.hol.tokens, 3);
    assert.throws(() => g.holDaily(p, ny), /уже/);
    g.holTree(p, ny);
    g.holClaim(p, 0, ny); // «нарядить ёлку» засчиталась
    assert.equal(p.hol.tokens, 8);
    for (let i = 0; i < 10; i++) g.track(p, 'job');
    g.holClaim(p, 1, ny);
    assert.equal(p.hol.tokens, 14);
    assert.throws(() => g.holClaim(p, 2, ny), /не выполнено/);
    // под ёлкой грев больше
    g.holDaily(p, ny + 24 * 3600_000);
    assert.equal(p.hol.tokens, 19);
    p.hol.tokens = 30;
    g.holBuy(p, 'ny_frame', ny);
    assert.ok(p.cosmetics.includes('frame_ny'));
    assert.throws(() => g.holBuy(p, 'ny_frame', ny), /Больше|Уже/);
    // праздник кончился — состояние сбрасывается со следующим
    const eas = Date.UTC(2026, 3, 12, 12);
    g.clock.now = () => eas;
    g.ensureHol(p, eas);
    assert.equal(p.hol.id, 'easter');
    assert.equal(p.hol.tokens, 0);
    assert.throws(() => g.holEgg(p, eas, () => 0), /крашенки/);
    p.hol.tokens = 2;
    assert.ok(g.holEgg(p, eas, () => 0).won);
    assert.equal(p.hol.tokens, 3);
    assert.throws(() => g.holEgg(p, eas + 60_000, () => 0), /сохнет/);
    assert.ok(!g.holEgg(p, eas + 30 * 60_000, () => 0.99).won);
    assert.equal(p.hol.tokens, 2);
    assert.throws(() => g.holDaily(p, Date.UTC(2026, 6, 1)), /не праздник/);
  } finally {
    g.clock.now = saved;
  }
});

import { BUILDINGS, BUILD, addBuildPts, buildBonus } from '../shared/build.ts';

test('стройка зоны: взносы деньгами и материалом, авторитет, титул, бонус построенного', () => {
  const p = g.newPlayer(1, 'Прораб', null, T0);
  p.money = 200_000;
  p.mats = { wood: 3 };
  assert.throws(() => g.buildGive(p, 'money', '', 777, T0), /не принимают/);
  const r = g.buildGive(p, 'money', '', 10_000, T0);
  assert.equal(r.pts, 10_000);
  assert.equal(r.authority, 10_000 / BUILD.authorityPer);
  assert.throws(() => g.buildGive(p, 'mat', 'wood', 5, T0), /Не хватает/);
  assert.equal(g.buildGive(p, 'mat', 'wood', 3, T0).pts, 3 * BUILD.matPts);
  assert.equal(p.mats.wood, 0);
  for (let i = 0; i < 1; i++) g.buildGive(p, 'money', '', 100_000, T0);
  assert.ok(p.cosmetics.includes('title_builder'));
  // общий счёт: перелив достраивает следующее здание
  const st = { idx: 0, pts: 0, done: [] as string[] };
  const fin = addBuildPts(st, BUILDINGS[0].goal + BUILDINGS[1].goal + 5);
  assert.deepEqual(fin, ['canteen', 'medbay']);
  assert.equal(st.pts, 5);
  // бонус «Медчасти» работает на здоровье
  const hp0 = g.stats(p, T0).maxHp;
  g.zoneBuilt.done = st.done;
  try {
    assert.ok(g.stats(p, T0).maxHp > hp0);
    assert.equal(buildBonus(st.done, 'money'), 5);
  } finally {
    g.zoneBuilt.done = [];
  }
});

import { COURT, courtChance } from '../shared/court.ts';

test('апелляция: доводы поднимают шанс, одна за ходку, удача скашивает срок, провал добавляет', () => {
  const p = g.newPlayer(1, 'Сутяга', null, T0);
  assert.throws(() => g.courtArg(p, 'lawyer', T0), /уровня/);
  p.level = 10;
  p.money = 100_000;
  p.gold = 50;
  g.courtArg(p, 'lawyer', T0);
  assert.equal(p.money, 100_000 - COURT.lawyerPerLevel * 10);
  assert.throws(() => g.courtArg(p, 'lawyer', T0), /уже собран/);
  assert.throws(() => g.courtArg(p, 'work', T0), /звание/);
  assert.throws(() => g.courtArg(p, 'church', T0), /благословение/);
  g.courtArg(p, 'medic', T0);
  assert.equal(courtChance(p.appeal.args), 50);
  const term = p.term;
  const r = g.courtHearing(p, T0, () => 0);
  assert.ok(r.won && r.delta < 0 && p.term < term);
  assert.throws(() => g.courtHearing(p, T0, () => 0), /уже была/);
  // новая ходка — новая апелляция; без доводов и с невезением — добавят
  p.hodka = 2;
  const t2 = p.term;
  const r2 = g.courtHearing(p, T0, () => 0.99);
  assert.ok(!r2.won && r2.delta > 0 && p.term > t2);
});

import { PEN_LETTERS, PENPAL, penEnding } from '../shared/penpal.ts';

test('заочница: письма по таймеру, посылки, деньги аферистке пропадают, концовки', () => {
  const H = 3600_000;
  assert.equal(penEnding({ scam: true, love: 20, suspect: 0, paid: 1 }), 'scam');
  assert.equal(penEnding({ scam: true, love: 0, suspect: 3, paid: 0 }), 'caught');
  assert.equal(penEnding({ scam: false, love: 15, suspect: 0, paid: 0 }), 'wedding');
  assert.equal(penEnding({ scam: false, love: 7, suspect: 0, paid: 0 }), 'wait');
  const p = g.newPlayer(1, 'Романтик', null, T0);
  p.level = 5;
  p.money = 50_000;
  g.penStart(p, T0, () => 0.9); // честная
  assert.throws(() => g.penStart(p, T0, () => 0.9), /уже идёт/);
  let t = T0;
  g.penReply(p, 0, t, () => 0);
  assert.throws(() => g.penReply(p, 0, t, () => 0), /в пути/);
  const butts = p.butts;
  t += PENPAL.gapH * H;
  g.penReply(p, 0, t, () => 0);
  assert.equal(p.butts, butts + 15);
  // дальше всё время лучшие ответы: деньги на лекарства и билет уходят
  let last: { ending: string | null } = { ending: null };
  while (p.penpal!.step < PEN_LETTERS.length) {
    t += PENPAL.gapH * H;
    last = g.penReply(p, 0, t, () => 0);
  }
  assert.equal(last.ending, 'wedding');
  assert.ok(p.cosmetics.includes('title_married'));
  assert.equal(p.penpal!.paid, 2);
  assert.throws(() => g.penStart(p, t, () => 0), /следующую ходку/);
  // аферистка: посылка только первая, деньги ушли — пропала
  const q = g.newPlayer(2, 'Доверчивый', null, T0);
  q.level = 5;
  q.money = 50_000;
  g.penStart(q, T0, () => 0); // аферистка
  t = T0;
  for (let i = 0; i < PEN_LETTERS.length; i++) {
    last = g.penReply(q, 0, t, () => 0);
    t += PENPAL.gapH * H;
  }
  assert.equal(last.ending, 'scam');
  assert.equal(q.money, 50_000 - 2 * PENPAL.moneyAsk);
});

import { MALYAVA } from '../shared/malyava.ts';

test('малявы: доходят с бычками, перехват добавляет срок, через шныря — наверняка, лимит в день', () => {
  const a = g.newPlayer(1, 'Писарь', null, T0);
  const b = g.newPlayer(2, 'Адресат', null, T0);
  a.level = 5;
  a.butts = 100;
  a.gold = 10;
  assert.throws(() => g.malyavaSend(a, a, 'hi', 0, false, T0, () => 0.99), /Себе/);
  assert.throws(() => g.malyavaSend(a, b, 'hi', 7, false, T0, () => 0.99), /Столько/);
  const r = g.malyavaSend(a, b, 'hi', 10, false, T0, () => 0.99);
  assert.ok(!r.caught);
  assert.equal(b.inbox.length, 1);
  assert.equal(b.butts, 10);
  assert.equal(a.butts, 90);
  const term = a.term;
  const c = g.malyavaSend(a, b, 'escape', 50, false, T0, () => 0);
  assert.ok(c.caught);
  assert.equal(a.term, term + MALYAVA.termPenaltyRisky);
  assert.equal(b.inbox.length, 1);
  assert.equal(a.butts, 40);
  assert.ok(!g.malyavaSend(a, b, 'escape', 0, true, T0, () => 0).caught);
  assert.equal(a.gold, 10 - MALYAVA.safeGold);
  g.malyavaRead(b);
  assert.ok(b.inbox.every((m) => m.read));
  for (let i = 3; i < MALYAVA.perDay; i++) g.malyavaSend(a, b, 'hi', 0, false, T0, () => 0.99);
  assert.throws(() => g.malyavaSend(a, b, 'hi', 0, false, T0, () => 0.99));
});

import { INK, inkQuality } from '../shared/ink.ts';

test('кольщик: машинка, заказ со скидкой, очередь, качество от опыта и руки, кривая — позор, звёзды, отмена', () => {
  const H = 3600_000;
  const m = g.newPlayer(1, 'Мастер', null, T0);
  const c = g.newPlayer(2, 'Клиент', null, T0);
  m.level = 10;
  m.money = 10_000;
  c.level = 10;
  c.money = 50_000;
  c.authority = 500;
  assert.throws(() => g.inkOrder(c, m, 't_cat', T0), /не кольщик/);
  g.inkBecome(m);
  assert.equal(m.money, 10_000 - INK.machinePrice);
  assert.throws(() => g.inkOrder(c, m, 't_tiger', T0), /не бьёт/); // за золото — только в ларьке
  const r = g.inkOrder(c, m, 't_spider', T0);
  assert.equal(r.paid, 2000);
  assert.throws(() => g.inkOrder(c, m, 't_cat', T0), /ждёшь/);
  // новичок, рука дрогнула — криво
  const auth = c.authority;
  const d = g.inkDo(m, c, m.ink!.queue[0].id, 0.1, T0);
  assert.ok(d.crooked);
  assert.ok(c.tattoos.includes('t_spider'));
  assert.equal(c.authority, auth - INK.crookedAuthority);
  assert.equal(m.money, 10_000 - INK.machinePrice + 2000);
  g.inkRate(c, m, 2);
  assert.throws(() => g.inkRate(c, m, 5), /Нечего|Уже/);
  assert.deepEqual([m.ink!.stars, m.ink!.votes], [2, 1]);
  assert.ok(inkQuality(100, 1) === 100 && inkQuality(0, 0) === 0);
  // отмена через сутки — деньги назад
  g.inkOrder(c, m, 't_cat', T0);
  assert.throws(() => g.inkCancel(c, m, T0 + H), /через/);
  const money = c.money;
  g.inkCancel(c, m, T0 + INK.cancelH * H);
  assert.equal(c.money, money + 400);
  assert.equal(m.ink!.queue.length, 0);
});

import { BARRACK, barrackBonus, barrackOwners } from '../shared/barracks.ts';

test('бараки: набег только с кланом, лимит, хозяин недели по влиянию, бонус людям хозяина', () => {
  const p = g.newPlayer(1, 'Бригадир', null, T0);
  p.level = 10;
  p.energy = 500;
  assert.throws(() => g.barrackRaid(p, 'b1', T0, () => 0), /клан/);
  p.clanId = 7;
  assert.throws(() => g.barrackRaid(p, 'b9', T0, () => 0), /Нет такого/);
  const r = g.barrackRaid(p, 'b1', T0, () => 0.5);
  assert.ok(r.pts >= 5);
  for (let i = 1; i < BARRACK.perDay; i++) g.barrackRaid(p, 'b1', T0, () => 0);
  assert.throws(() => g.barrackRaid(p, 'b1', T0, () => 0));
  const owners = barrackOwners({ b1: { 7: 50, 9: 40 }, b3: { 9: 10 }, b4: {} });
  assert.deepEqual(owners, { b1: 7, b3: 9 });
  assert.equal(barrackBonus(owners, 7, 'money'), 5);
  assert.equal(barrackBonus(owners, null, 'money'), 0);
  const e0 = g.stats(p, T0).maxEnergy;
  g.barracks.owners = { b3: 7 };
  try {
    assert.equal(g.stats(p, T0).maxEnergy, e0 + 10);
  } finally {
    g.barracks.owners = {};
  }
});

import { pickSnitch, snitchClue, snitchMajority } from '../shared/snitch.ts';

test('кто стукач: выбор стукача, улики, большинство голосов', () => {
  assert.equal(pickSnitch([5, 3, 9, 1], 0), 1);
  assert.equal(pickSnitch([5, 3, 9, 1], 0.99), 9);
  const ms = [{ level: 3 }, { level: 10 }, { level: 20 }, { level: 7 }];
  assert.match(snitchClue(0, { name: 'Вася', level: 20 }, ms), /старших/);
  assert.match(snitchClue(1, { name: 'вася', level: 20 }, ms), /«В»/);
  assert.match(snitchClue(2, { name: 'Вася', level: 7 }, ms), /нечётный/);
  assert.match(snitchClue(3, { name: 'Вася', level: 7 }, ms), /4/);
  assert.equal(snitchMajority({ 1: 5, 2: 5 }, 4), null);
  assert.equal(snitchMajority({ 1: 5, 2: 5, 3: 5 }, 4), 5);
});
