// Игровая логика. Функции чистые относительно хранилища: получают игрока,
// меняют его и возвращают результат. Время и случайность передаются снаружи,
// чтобы всё можно было проверить тестами.

import type { DailyState, Look, Quest, QuestState } from '../shared/types.ts';
import {
  BALANCE,
  BUTTS,
  SHELLS,
  TRADES,
  BUILDS,
  CLAN,
  DAILY_BONUS_GOLD,
  DAILY_KINDS,
  QUEST_TEMPLATES,
  SKINS,
  interiorById,
  type DailyKind,
  FACE_COUNT,
  ITEMS,
  GOLD_PRICES,
  STAT_NAMES,
  WORLD_BOSS,
  bossById,
  furnitureById,
  itemById,
  jobById,
  packById,
  tattooById,
  trainCost,
  xpToNext,
  type Bonus,
  type Slot,
  type Stat,
  type StarPack,
} from '../shared/content.ts';

export type Rng = () => number;

export class GameError extends Error {}

export interface JournalEntry {
  t: number;
  text: string;
}

export interface Player {
  id: number;
  name: string;
  username: string | null;
  level: number;
  xp: number;
  money: number;
  gold: number;
  str: number;
  agi: number;
  end: number;
  statPoints: number;
  authority: number;
  wins: number;
  losses: number;
  bossKills: number;
  hp: number;
  hpAt: number;
  energy: number;
  energyAt: number;
  vipUntil: number;
  vipGoldAt: number;
  dailyAt: number;
  dailyStreak: number;
  starterBought: boolean;
  equipped: Partial<Record<Slot, string>>;
  inventory: string[];
  tattoos: string[];
  furniture: string[];
  face: number;
  faceChosen: boolean;
  build: number;
  skin: number;
  nameChanged: boolean;
  interior: { wall: string; floor: string };
  ownedInteriors: string[];
  chifir: number;
  butts: number;
  field: { id: number; x: number; y: number; pack: boolean }[];
  fieldAt: number;
  fieldSeq: number;
  shells: { day: string; n: number };
  daily: DailyState;
  quests: QuestState;
  clanId: number | null;
  clanLevel: number;
  respect: Record<string, string>;
  bossCd: Record<string, number>;
  pvpAt: number;
  shieldUntil: number;
  worldHitAt: number;
  refBy: number | null;
  refCount: number;
  starsSpent: number;
  journal: JournalEntry[];
  createdAt: number;
  lastSeen: number;
}

export interface Fighter {
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  crit: number;
}

export interface Round {
  by: 0 | 1; // 0 — нападающий, 1 — защищающийся
  dmg: number;
  crit: boolean;
}

export interface FightResult {
  win: boolean;
  log: string[];
  rounds: Round[];
  startHp: [number, number];
  maxHp: [number, number];
  damageDealt: number;
  hpLeft: number;
}

const MIN = 60_000;

export function newPlayer(id: number, name: string, username: string | null, now: number): Player {
  const p: Player = {
    id,
    name: name.slice(0, 32) || `Зек ${id % 10000}`,
    username,
    level: 1,
    xp: 0,
    money: 300,
    gold: 20,
    str: 5,
    agi: 5,
    end: 5,
    statPoints: 0,
    authority: 0,
    wins: 0,
    losses: 0,
    bossKills: 0,
    hp: 0,
    hpAt: now,
    energy: BALANCE.baseEnergy,
    energyAt: now,
    vipUntil: 0,
    vipGoldAt: 0,
    dailyAt: 0,
    dailyStreak: 0,
    starterBought: false,
    equipped: { body: 'body_robe', feet: 'feet_slippers' },
    inventory: ['body_robe', 'feet_slippers'],
    tattoos: [],
    furniture: [],
    face: id % FACE_COUNT,
    faceChosen: false,
    build: 1,
    skin: 0,
    nameChanged: false,
    interior: { wall: 'w_green', floor: 'f_planks' },
    ownedInteriors: ['w_green', 'f_planks'],
    chifir: 1,
    butts: 0,
    field: [],
    fieldAt: now,
    fieldSeq: 0,
    shells: { day: '', n: 0 },
    daily: { day: '', tasks: [], bonusClaimed: false },
    quests: { board: [], active: null },
    clanId: null,
    clanLevel: 0,
    respect: {},
    bossCd: {},
    pvpAt: 0,
    shieldUntil: 0,
    worldHitAt: 0,
    refBy: null,
    refCount: 0,
    starsSpent: 0,
    journal: [{ t: now, text: 'Тебя заехал конвой. Добро пожаловать на зону.' }],
    createdAt: now,
    lastSeen: now,
  };
  p.hp = stats(p, now).maxHp;
  return p;
}

/** Досоздаёт поля, которых не было в старых сохранениях. */
export function migrate(p: Player): Player {
  p.furniture ??= [];
  p.face ??= p.id % FACE_COUNT;
  p.faceChosen ??= false;
  p.build ??= 1;
  p.skin ??= 0;
  p.nameChanged ??= false;
  p.interior ??= { wall: 'w_green', floor: 'f_planks' };
  p.ownedInteriors ??= ['w_green', 'f_planks'];
  p.chifir ??= 1;
  p.butts ??= 0;
  p.field ??= [];
  p.fieldAt ??= Date.now();
  p.fieldSeq ??= 0;
  p.shells ??= { day: '', n: 0 };
  p.daily ??= { day: '', tasks: [], bonusClaimed: false };
  p.quests ??= { board: [], active: null };
  p.clanId ??= null;
  p.clanLevel ??= 0;
  p.respect ??= {};
  return p;
}

export function isVip(p: Player, now: number): boolean {
  return p.vipUntil > now;
}

function bonuses(p: Player): Required<Bonus> {
  const total: Required<Bonus> = { atk: 0, def: 0, hp: 0, crit: 0, energy: 0, money: 0 };
  const sources = [
    ...Object.values(p.equipped).map((id) => (id ? itemById.get(id) : undefined)),
    ...p.tattoos.map((id) => tattooById.get(id)),
    ...p.furniture.map((id) => furnitureById.get(id)),
  ].filter((b): b is NonNullable<typeof b> => !!b);
  for (const b of sources) {
    for (const k of Object.keys(total) as (keyof Bonus)[]) total[k] += b[k] ?? 0;
  }
  return total;
}

export function stats(p: Player, now: number) {
  const b = bonuses(p);
  const vip = isVip(p, now);
  return {
    atk: 5 + p.str * 3 + b.atk,
    def: p.agi * 2 + b.def,
    maxHp: 80 + p.end * 12 + b.hp,
    crit: Math.min(40, 2 + Math.floor(p.agi * 0.3) + b.crit),
    maxEnergy: BALANCE.baseEnergy + b.energy + (vip ? BALANCE.vipEnergyBonus : 0) + p.clanLevel * CLAN.energyPerLevel,
    moneyBonus: b.money + (vip ? BALANCE.vipMoneyBonus : 0) + p.clanLevel * CLAN.moneyPerLevel,
  };
}

/** Восстановление энергии и здоровья по прошедшему времени. */
export function tick(p: Player, now: number): void {
  const s = stats(p, now);
  const regenSec = BALANCE.energyRegenSec / (isVip(p, now) ? 2 : 1);
  if (p.energy >= s.maxEnergy) {
    p.energyAt = now;
  } else {
    const gained = Math.floor((now - p.energyAt) / 1000 / regenSec);
    if (gained > 0) {
      p.energy = Math.min(s.maxEnergy, p.energy + gained);
      p.energyAt = p.energy >= s.maxEnergy ? now : p.energyAt + gained * regenSec * 1000;
    }
  }
  if (p.hp >= s.maxHp) {
    p.hp = s.maxHp;
    p.hpAt = now;
  } else {
    const perMin = Math.max(1, s.maxHp * BALANCE.hpRegenPerMin);
    const mins = Math.floor((now - p.hpAt) / MIN);
    if (mins > 0) {
      p.hp = Math.min(s.maxHp, Math.floor(p.hp + mins * perMin));
      p.hpAt += mins * MIN;
    }
  }
  if (isVip(p, now) && now - p.vipGoldAt >= 24 * 60 * MIN) {
    p.gold += BALANCE.vipDailyGold;
    p.vipGoldAt = now;
    log(p, now, `👑 Блатной статус: +${BALANCE.vipDailyGold} золота`);
  }
  ensureDaily(p, now);
  growField(p, now, Math.random);
}

export function log(p: Player, now: number, text: string): void {
  p.journal.unshift({ t: now, text });
  p.journal.length = Math.min(p.journal.length, 30);
}

function spendEnergy(p: Player, amount: number, now: number): void {
  if (p.energy < amount) throw new GameError(`Не хватает энергии: нужно ${amount}`);
  const wasFull = p.energy >= stats(p, now).maxEnergy;
  p.energy -= amount;
  if (wasFull) p.energyAt = now;
  track(p, 'spend', amount);
}

function spend(p: Player, amount: number, currency: 'money' | 'gold'): void {
  if (p[currency] < amount) {
    throw new GameError(currency === 'gold' ? 'Не хватает золота' : 'Не хватает денег');
  }
  p[currency] -= amount;
}

function roll(rng: Rng, [min, max]: [number, number]): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function addXp(p: Player, xp: number, now: number): number {
  p.xp += xp;
  let ups = 0;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    p.statPoints += BALANCE.statPointsPerLevel;
    ups += 1;
  }
  if (ups > 0) {
    const s = stats(p, now);
    p.energy = Math.max(p.energy, s.maxEnergy);
    p.energyAt = now;
    p.hp = s.maxHp;
    p.hpAt = now;
    log(p, now, `⬆️ Новый уровень: ${p.level}. +${ups * BALANCE.statPointsPerLevel} очков навыков`);
  }
  return ups;
}

export function doJob(p: Player, jobId: string, now: number, rng: Rng) {
  const job = jobById.get(jobId);
  if (!job) throw new GameError('Нет такой работы');
  if (p.level < job.minLevel) throw new GameError(`Доступно с ${job.minLevel} уровня`);
  spendEnergy(p, job.energy, now);
  const money = Math.round(roll(rng, job.money) * (1 + stats(p, now).moneyBonus / 100));
  p.money += money;
  const levelUps = addXp(p, job.xp, now);
  track(p, 'job');
  return { money, xp: job.xp, levelUps };
}

export function allocate(p: Player, stat: Stat) {
  if (!(stat in STAT_NAMES)) throw new GameError('Нет такого навыка');
  if (p.statPoints <= 0) throw new GameError('Нет свободных очков');
  p.statPoints -= 1;
  p[stat] += 1;
}

export function train(p: Player, stat: Stat) {
  if (!(stat in STAT_NAMES)) throw new GameError('Нет такого навыка');
  const cost = trainCost(p[stat]);
  spend(p, cost, 'money');
  p[stat] += 1;
  track(p, 'train');
  return { cost };
}

export function buyItem(p: Player, itemId: string) {
  const item = itemById.get(itemId);
  if (!item || item.bossOnly) throw new GameError('Такого нет в продаже');
  if (p.level < item.minLevel) throw new GameError(`Доступно с ${item.minLevel} уровня`);
  if (p.inventory.includes(itemId)) throw new GameError('Уже есть');
  spend(p, item.price, item.currency);
  p.inventory.push(itemId);
  p.equipped[item.slot] ??= itemId;
}

export function equip(p: Player, itemId: string, now: number) {
  const item = itemById.get(itemId);
  if (!item || !p.inventory.includes(itemId)) throw new GameError('Нет в инвентаре');
  if (p.level < item.minLevel) throw new GameError(`Доступно с ${item.minLevel} уровня`);
  p.equipped[item.slot] = itemId;
  clampHp(p, now);
}

export function unequip(p: Player, slot: Slot, now: number) {
  delete p.equipped[slot];
  clampHp(p, now);
}

export function sellItem(p: Player, itemId: string, now: number) {
  const item = itemById.get(itemId);
  if (!item || !p.inventory.includes(itemId)) throw new GameError('Нет в инвентаре');
  // Золотые вещи обратно не продаются, а трофеи с боссов оцениваются по уровню.
  if (item.currency === 'gold') throw new GameError('Золотые вещи не продаются');
  const price = item.bossOnly ? 2000 : Math.floor(item.price * 0.3);
  p.inventory = p.inventory.filter((id) => id !== itemId);
  if (p.equipped[item.slot] === itemId) delete p.equipped[item.slot];
  p.money += price;
  clampHp(p, now);
  return { price };
}

function clampHp(p: Player, now: number) {
  p.hp = Math.min(p.hp, stats(p, now).maxHp);
}

export function buyTattoo(p: Player, tattooId: string, now: number) {
  const t = tattooById.get(tattooId);
  if (!t) throw new GameError('Нет такой наколки');
  if (p.tattoos.includes(tattooId)) throw new GameError('Уже набита');
  if (p.level < t.minLevel) throw new GameError(`Доступно с ${t.minLevel} уровня`);
  if (p.authority < t.minAuthority) throw new GameError(`Нужно ${t.minAuthority} авторитета`);
  spend(p, t.price, t.currency);
  p.tattoos.push(tattooId);
  log(p, now, `${t.emoji} Набил наколку «${t.name}»`);
}

/** Выбор лица: первый раз бесплатно, дальше за золото. */
export function setFace(p: Player, face: number) {
  if (!Number.isInteger(face) || face < 0 || face >= FACE_COUNT) throw new GameError('Нет такого лица');
  if (face === p.face && p.faceChosen) throw new GameError('Это лицо уже выбрано');
  if (p.faceChosen) spend(p, GOLD_PRICES.faceChange, 'gold');
  p.face = face;
  p.faceChosen = true;
}

export function buyFurniture(p: Player, furnitureId: string, now: number) {
  const f = furnitureById.get(furnitureId);
  if (!f) throw new GameError('Нет такой мебели');
  if (p.furniture.includes(furnitureId)) throw new GameError('Уже стоит в хате');
  if (p.level < f.minLevel) throw new GameError(`Доступно с ${f.minLevel} уровня`);
  spend(p, f.price, f.currency);
  p.furniture.push(furnitureId);
  log(p, now, `${f.emoji} Обустроил хату: ${f.name}`);
}

export function fighter(p: Player, now: number): Fighter {
  const s = stats(p, now);
  return { name: p.name, hp: p.hp, maxHp: s.maxHp, atk: s.atk, def: s.def, crit: s.crit };
}

export function fight(a: Fighter, b: Fighter, rng: Rng, maxRounds = 30): FightResult {
  let aHp = a.hp;
  let bHp = b.hp;
  let dealt = 0;
  const lines: string[] = [];
  const rounds: Round[] = [];
  const hit = (from: Fighter, to: Fighter) => {
    const crit = rng() * 100 < from.crit;
    const base = from.atk * (0.85 + rng() * 0.3) - to.def * 0.4;
    const dmg = Math.max(1, Math.round(base * (crit ? 2 : 1)));
    return { dmg, crit };
  };
  for (let round = 1; round <= maxRounds; round++) {
    const h1 = hit(a, b);
    bHp -= h1.dmg;
    dealt += h1.dmg;
    rounds.push({ by: 0, ...h1 });
    lines.push(`${a.name} бьёт на ${h1.dmg}${h1.crit ? ' 💥' : ''}`);
    if (bHp <= 0) break;
    const h2 = hit(b, a);
    aHp -= h2.dmg;
    rounds.push({ by: 1, ...h2 });
    lines.push(`${b.name} отвечает на ${h2.dmg}${h2.crit ? ' 💥' : ''}`);
    if (aHp <= 0) break;
  }
  // Лог держим коротким: начало и развязка боя.
  const log = lines.length > 12 ? [...lines.slice(0, 6), '…', ...lines.slice(-5)] : lines;
  return {
    win: bHp <= 0,
    log,
    rounds,
    startHp: [a.hp, b.hp],
    maxHp: [a.maxHp, b.maxHp],
    damageDealt: Math.min(dealt, b.hp),
    hpLeft: Math.max(0, aHp),
  };
}

function requireHp(p: Player, now: number) {
  if (p.hp < stats(p, now).maxHp * BALANCE.pvpMinHpShare) {
    throw new GameError('Слишком слаб. Отлежись в санчасти');
  }
}

export function fightBoss(p: Player, bossId: string, now: number, rng: Rng) {
  const boss = bossById.get(bossId);
  if (!boss) throw new GameError('Нет такого босса');
  if (p.level < boss.minLevel) throw new GameError(`Доступно с ${boss.minLevel} уровня`);
  const cd = p.bossCd[bossId] ?? 0;
  if (cd > now) throw new GameError('Босс ещё не оклемался');
  requireHp(p, now);
  spendEnergy(p, boss.energy, now);

  const result = fight(
    fighter(p, now),
    { name: boss.name, hp: boss.hp, maxHp: boss.hp, atk: boss.atk, def: boss.def, crit: 5 },
    rng,
  );
  p.hp = result.hpLeft;
  p.hpAt = now;
  p.bossCd[bossId] = now + boss.cooldownMin * MIN * (result.win ? 1 : 0.25);

  const reward = { money: 0, xp: 0, authority: 0, gold: 0, drop: null as string | null, levelUps: 0 };
  if (result.win) {
    reward.money = Math.round(roll(rng, boss.reward.money) * (1 + stats(p, now).moneyBonus / 100));
    reward.xp = boss.reward.xp;
    reward.authority = boss.reward.authority;
    reward.gold = roll(rng, boss.reward.gold);
    for (const d of boss.drops) {
      if (!p.inventory.includes(d.itemId) && rng() < d.chance) {
        reward.drop = d.itemId;
        p.inventory.push(d.itemId);
        break;
      }
    }
    p.money += reward.money;
    p.gold += reward.gold;
    p.authority += reward.authority;
    p.bossKills += 1;
    track(p, 'boss');
    reward.levelUps = addXp(p, reward.xp, now);
    const drop = reward.drop ? itemById.get(reward.drop) : null;
    log(p, now, `${boss.emoji} Завалил «${boss.name}»${drop ? `, трофей: ${drop.emoji} ${drop.name}` : ''}`);
  } else {
    reward.xp = Math.round(boss.reward.xp * 0.15);
    reward.levelUps = addXp(p, reward.xp, now);
  }
  return { ...result, reward };
}

/** Бот-противник, когда живых соперников подходящего уровня нет. */
export function botOpponent(level: number, rng: Rng): Fighter & { money: number; look: Look } {
  const names = ['Фраер Вася', 'Шестёрка Лёха', 'Баклан Гоша', 'Чушок Петя', 'Барыга Сеня'];
  const k = 0.6 + rng() * 0.25; // боты слабее живых игроков того же уровня
  const maxHp = Math.round((80 + (5 + level) * 12) * k);
  return {
    name: names[Math.floor(rng() * names.length)],
    hp: maxHp,
    maxHp,
    atk: Math.round((20 + level * 5) * k),
    def: Math.round((10 + level * 3) * k),
    crit: 3,
    money: 40 + level * 30,
    look: botLook(level, rng),
  };
}

/** Бот одет в случайный дешёвый шмот своего уровня — чтобы в бою выглядел живым. */
function botLook(level: number, rng: Rng): Look {
  const equipped: Look['equipped'] = {};
  for (const item of ITEMS) {
    if (item.currency === 'money' && !item.bossOnly && item.minLevel <= level && rng() < 0.5) {
      equipped[item.slot] = item.id;
    }
  }
  return { equipped, tattoos: [], str: 5 + level, face: Math.floor(rng() * FACE_COUNT) };
}

export function lookOf(p: Player): Look {
  return { equipped: p.equipped, tattoos: p.tattoos, str: p.str, face: p.face };
}

export function canBeAttacked(target: Player, now: number): boolean {
  return target.shieldUntil <= now;
}

/** Наезд на другого игрока (или бота). Возвращает изменения для обеих сторон. */
export function pvp(p: Player, target: Player | null, now: number, rng: Rng) {
  if (p.pvpAt + BALANCE.pvpCooldownSec * 1000 > now) throw new GameError('Отдышись немного');
  requireHp(p, now);
  spendEnergy(p, BALANCE.pvpEnergy, now);
  p.pvpAt = now;

  let enemy: Fighter;
  let loot: number;
  let enemyLook: Look;
  if (target) {
    // Защищающийся бьётся в полную силу: оффлайн-игрока не обижаем на израненном здоровье.
    tick(target, now);
    enemy = { ...fighter(target, now), hp: stats(target, now).maxHp };
    loot = Math.min(Math.floor(target.money * BALANCE.pvpStealShare), target.level * 300);
    enemyLook = lookOf(target);
  } else {
    const bot = botOpponent(p.level, rng);
    enemy = bot;
    loot = bot.money;
    enemyLook = bot.look;
  }

  const result = fight(fighter(p, now), enemy, rng);
  p.hp = result.hpLeft;
  p.hpAt = now;
  let authority = 0;
  let xp = 0;
  if (result.win) {
    authority = 3 + Math.floor(rng() * 6);
    xp = 8 + p.level * 2;
    p.money += loot;
    p.authority += authority;
    track(p, 'pvpWin');
    p.wins += 1;
    if (target) {
      target.money -= loot;
      target.losses += 1;
      target.shieldUntil = now + 15 * MIN;
      log(target, now, `🥊 ${p.name} наехал и отжал ${loot} ₽`);
    }
  } else {
    loot = 0;
    authority = -Math.min(p.authority, 2);
    p.authority += authority;
    p.losses += 1;
    xp = 3;
    if (target) {
      target.wins += 1;
      target.authority += 2;
      log(target, now, `🛡️ ${p.name} полез на тебя и огрёб. +2 авторитета`);
    }
  }
  const levelUps = addXp(p, xp, now);
  return { ...result, enemy: enemy.name, enemyLook, loot, authority, xp, levelUps };
}

export function claimDaily(p: Player, now: number) {
  const day = 24 * 60 * MIN;
  if (now - p.dailyAt < day) throw new GameError('Сегодня уже получал');
  p.dailyStreak = now - p.dailyAt < 2 * day ? Math.min(p.dailyStreak + 1, 7) : 1;
  p.dailyAt = now;
  const money = BALANCE.dailyBase * p.dailyStreak + p.level * 20;
  const gold = p.dailyStreak === 7 ? 10 : 1;
  p.money += money;
  p.gold += gold;
  return { money, gold, streak: p.dailyStreak };
}

export function refillEnergy(p: Player, now: number) {
  const max = stats(p, now).maxEnergy;
  if (p.energy >= max) throw new GameError('Энергия и так полная');
  spend(p, GOLD_PRICES.energyRefill, 'gold');
  p.energy = max;
  p.energyAt = now;
}

export function heal(p: Player, now: number) {
  const max = stats(p, now).maxHp;
  if (p.hp >= max) throw new GameError('Ты и так здоров');
  spend(p, GOLD_PRICES.heal, 'gold');
  p.hp = max;
  p.hpAt = now;
}

export function resetBoss(p: Player, bossId: string, now: number) {
  if (!bossById.has(bossId)) throw new GameError('Нет такого босса');
  if ((p.bossCd[bossId] ?? 0) <= now) throw new GameError('Босс и так доступен');
  spend(p, GOLD_PRICES.bossReset, 'gold');
  p.bossCd[bossId] = 0;
}

export function resetStats(p: Player, now: number) {
  spend(p, GOLD_PRICES.statReset, 'gold');
  const spent = p.str + p.agi + p.end - 15;
  p.str = p.agi = p.end = 5;
  p.statPoints += spent;
  clampHp(p, now);
}

/** Может ли игрок купить пакет (стартовый — один раз). */
export function checkPack(p: Player, packId: string): StarPack {
  const pack = packById.get(packId);
  if (!pack) throw new GameError('Нет такого товара');
  if (pack.id === 'starter' && p.starterBought) throw new GameError('Стартовый набор уже куплен');
  return pack;
}

/** Зачисление оплаченного пакета. Идемпотентность обеспечивает вызывающий код. */
export function applyPack(p: Player, pack: StarPack, now: number) {
  if (pack.gold) p.gold += pack.gold;
  if (pack.vipDays) {
    p.vipUntil = Math.max(p.vipUntil, now) + pack.vipDays * 24 * 60 * MIN;
  }
  if (pack.chifir) p.chifir += pack.chifir;
  if (pack.id === 'starter') p.starterBought = true;
  p.starsSpent += pack.stars;
  log(p, now, `⭐ Покупка: ${pack.title}. Спасибо за поддержку!`);
}

/** Удар по общему боссу: списывает энергию и возвращает урон. */
export function worldBossHit(p: Player, now: number, rng: Rng) {
  if (p.worldHitAt + WORLD_BOSS.cooldownSec * 1000 > now) throw new GameError('Удар ещё не готов');
  requireHp(p, now);
  spendEnergy(p, WORLD_BOSS.energy, now);
  p.worldHitAt = now;
  track(p, 'worldHit');
  const s = stats(p, now);
  const crit = rng() * 100 < s.crit;
  return { damage: Math.round(s.atk * 4 * (0.85 + rng() * 0.3) * (crit ? 2 : 1)), crit };
}

// --- Персонаж -----------------------------------------------------------------

export function setLook(p: Player, build: number, skin: number) {
  if (!BUILDS.some((b) => b.id === build)) throw new GameError('Нет такого телосложения');
  if (!SKINS.some((s) => s.id === skin)) throw new GameError('Нет такого цвета кожи');
  p.build = build;
  p.skin = skin;
}

/** Смена имени: первый раз бесплатно, дальше за золото. */
export function rename(p: Player, raw: string) {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 24) throw new GameError('Имя — от 2 до 24 символов');
  if (!/^[\p{L}\p{N} ._-]+$/u.test(name)) throw new GameError('Только буквы, цифры, пробел, точка, дефис');
  if (name === p.name) throw new GameError('Имя то же самое');
  if (p.nameChanged) spend(p, GOLD_PRICES.rename, 'gold');
  p.name = name;
  p.nameChanged = true;
}

// --- Интерьер ------------------------------------------------------------------

export function buyInterior(p: Player, id: string) {
  const it = interiorById.get(id);
  if (!it) throw new GameError('Нет такой отделки');
  if (!p.ownedInteriors.includes(id)) {
    spend(p, it.price, it.currency);
    p.ownedInteriors.push(id);
  }
  p.interior[it.kind] = id;
}

// --- Энергия -------------------------------------------------------------------

export function buyEnergy(p: Player, now: number) {
  const max = stats(p, now).maxEnergy;
  if (p.energy >= max) throw new GameError('Энергия и так полная');
  spend(p, GOLD_PRICES.energySmall, 'gold');
  p.energy = Math.min(max, p.energy + 30);
  if (p.energy >= max) p.energyAt = now;
}

export function buyChifir(p: Player) {
  spend(p, GOLD_PRICES.chifir, 'gold');
  p.chifir += 1;
}

export function drinkChifir(p: Player, now: number) {
  if (p.chifir <= 0) throw new GameError('Чифира нет');
  const max = stats(p, now).maxEnergy;
  if (p.energy >= max) throw new GameError('Энергия и так полная');
  p.chifir -= 1;
  p.energy = max;
  p.energyAt = now;
}

// --- Дейлики -------------------------------------------------------------------

/** День по Москве — дейлики сбрасываются в полночь МСК. */
export function dayKey(now: number): string {
  return new Date(now + 3 * 3600_000).toISOString().slice(0, 10);
}

/** Следующая полночь по Москве. */
export function nextDayAt(now: number): number {
  const msk = now + 3 * 3600_000;
  return msk - (msk % 86_400_000) + 86_400_000 - 3 * 3600_000;
}

/** Детерминированный генератор: задания дня одинаковы при любом числе заходов. */
export function seeded(seed: string): Rng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ensureDaily(p: Player, now: number) {
  const day = dayKey(now);
  if (p.daily.day === day) return;
  const rng = seeded(`${p.id}:${day}`);
  const kinds = [...DAILY_KINDS].sort(() => rng() - 0.5).slice(0, 3);
  p.daily = {
    day,
    bonusClaimed: false,
    tasks: kinds.map((k) => {
      const target = k.range[0] + Math.floor(rng() * (k.range[1] - k.range[0] + 1));
      return { kind: k.kind, target, progress: 0, money: 100 + p.level * 60, xp: 20 + p.level * 5, gold: 2, claimed: false };
    }),
  };
}

export function track(p: Player, kind: DailyKind, amount = 1) {
  for (const t of p.daily.tasks) if (t.kind === kind && !t.claimed) t.progress = Math.min(t.target, t.progress + amount);
}

export function claimTask(p: Player, index: number, now: number) {
  const t = p.daily.tasks[index];
  if (!t) throw new GameError('Нет такого задания');
  if (t.claimed) throw new GameError('Уже получено');
  if (t.progress < t.target) throw new GameError('Задание не выполнено');
  t.claimed = true;
  p.money += t.money;
  p.gold += t.gold;
  addXp(p, t.xp, now);
  let bonus = 0;
  if (!p.daily.bonusClaimed && p.daily.tasks.every((x) => x.claimed)) {
    p.daily.bonusClaimed = true;
    bonus = DAILY_BONUS_GOLD;
    p.gold += bonus;
    log(p, now, `📋 Все дела на день закрыты: +${bonus} золота`);
  }
  return { money: t.money, gold: t.gold, xp: t.xp, bonus };
}

// --- Поручения -----------------------------------------------------------------

function makeQuest(p: Player, rng: Rng): Quest {
  // без повторов: на доске и в работе — разные поручения
  const busy = new Set([...p.quests.board.map((q) => q.tpl), p.quests.active?.tpl]);
  const pool = QUEST_TEMPLATES.filter((t) => !busy.has(t.id));
  const tpl = pool[Math.floor(rng() * pool.length)];
  const k = 1 + p.level * 0.15;
  return {
    key: String((p.quests.seq = (p.quests.seq ?? 0) + 1)),
    tpl: tpl.id,
    minutes: tpl.minutes,
    energy: tpl.energy,
    money: Math.round(roll(rng, tpl.money) * k),
    xp: Math.round(tpl.xp * (1 + p.level * 0.1)),
    gold: rng() < 0.2 ? 1 + Math.floor(rng() * 3) : 0,
    chance: tpl.chance,
  };
}

export function ensureBoard(p: Player, rng: Rng) {
  while (p.quests.board.length < 3) p.quests.board.push(makeQuest(p, rng));
}

export function rerollBoard(p: Player, rng: Rng) {
  spend(p, GOLD_PRICES.questReroll, 'gold');
  p.quests.board = [];
  ensureBoard(p, rng);
}

export function startQuest(p: Player, key: string, now: number) {
  if (p.quests.active) throw new GameError('Сначала закончи текущее поручение');
  const q = p.quests.board.find((x) => x.key === key);
  if (!q) throw new GameError('Нет такого поручения');
  spendEnergy(p, q.energy, now);
  p.quests.board = p.quests.board.filter((x) => x.key !== key);
  p.quests.active = { ...q, endsAt: now + q.minutes * MIN };
}

export function skipCost(p: Player, now: number): number {
  const a = p.quests.active;
  if (!a) return 0;
  return Math.max(1, Math.ceil((a.endsAt - now) / (10 * MIN))) * GOLD_PRICES.questSkipPer10Min;
}

export function skipQuest(p: Player, now: number) {
  const a = p.quests.active;
  if (!a) throw new GameError('Нет поручения');
  if (a.endsAt <= now) throw new GameError('Уже готово');
  spend(p, skipCost(p, now), 'gold');
  a.endsAt = now;
}

export function finishQuest(p: Player, now: number, rng: Rng) {
  const a = p.quests.active;
  if (!a) throw new GameError('Нет поручения');
  if (a.endsAt > now) throw new GameError('Ещё не готово');
  p.quests.active = null;
  const ok = rng() < a.chance;
  const money = ok ? Math.round(a.money * (1 + stats(p, now).moneyBonus / 100)) : 0;
  const gold = ok ? a.gold : 0;
  const xp = ok ? a.xp : Math.round(a.xp / 3);
  p.money += money;
  p.gold += gold;
  const levelUps = addXp(p, xp, now);
  track(p, 'quest');
  ensureBoard(p, rng);
  return { ok, money, gold, xp, levelUps, tpl: a.tpl };
}

// --- Соседи --------------------------------------------------------------------

/** Уважить соседа: раз в день на каждого. */
export function respect(p: Player, target: Player, now: number) {
  if (p.id === target.id) throw new GameError('Себя не уважают — себя уважать заставляют');
  const day = dayKey(now);
  if (p.respect[target.id] === day) throw new GameError('Сегодня уже уважил');
  p.respect[target.id] = day;
  // чистим старые записи, чтобы документ не рос
  for (const [k, v] of Object.entries(p.respect)) if (v !== day) delete p.respect[k];
  target.authority += 1;
  log(target, now, `🤝 ${p.name} зашёл в хату и выразил уважение: +1 авторитета`);
  addXp(p, 5, now);
}

// --- Бычки ---------------------------------------------------------------------

/** Раз в regenSec на зоне появляется бычок (не больше maxOnField). */
export function growField(p: Player, now: number, rng: Rng) {
  const step = BUTTS.regenSec * 1000;
  if (p.field.length >= BUTTS.maxOnField) {
    p.fieldAt = now;
    return;
  }
  let n = Math.floor((now - p.fieldAt) / step);
  while (n-- > 0 && p.field.length < BUTTS.maxOnField) {
    p.field.push({
      id: ++p.fieldSeq,
      x: Math.round((0.06 + rng() * 0.88) * 1000) / 1000,
      y: Math.round((0.7 + rng() * 0.26) * 1000) / 1000,
      pack: rng() < BUTTS.packChance,
    });
    p.fieldAt += step;
  }
  if (p.field.length >= BUTTS.maxOnField) p.fieldAt = now;
}

export function nextButtAt(p: Player): number | null {
  return p.field.length >= BUTTS.maxOnField ? null : p.fieldAt + BUTTS.regenSec * 1000;
}

export function pickButt(p: Player, id: number) {
  const b = p.field.find((x) => x.id === id);
  if (!b) throw new GameError('Уже подобрали');
  p.field = p.field.filter((x) => x.id !== id);
  const got = b.pack ? BUTTS.packValue : 1;
  p.butts += got;
  return { got };
}

export function trade(p: Player, offerId: string, now: number) {
  const o = TRADES.find((t) => t.id === offerId);
  if (!o) throw new GameError('Барыга такого не берёт');
  if (p.butts < o.cost) throw new GameError(`Нужно ${o.cost} бычков`);
  if (o.give === 'energy') {
    const max = stats(p, now).maxEnergy;
    if (p.energy >= max) throw new GameError('Энергия и так полная');
    p.energy = Math.min(max, p.energy + 15);
  }
  p.butts -= o.cost;
  let money = 0;
  if (o.give === 'money') {
    money = 40 + p.level * 10;
    p.money += money;
  }
  if (o.give === 'chifir') p.chifir += 1;
  if (o.give === 'gold') p.gold += 5;
  return { money };
}

// --- Напёрстки ------------------------------------------------------------------

export function shellsLeft(p: Player, now: number): number {
  return p.shells.day === dayKey(now) ? Math.max(0, SHELLS.maxPerDay - p.shells.n) : SHELLS.maxPerDay;
}

export function maxBet(p: Player): number {
  return SHELLS.betPerLevel * p.level;
}

/** Шарик кладётся под случайный напёрсток уже после выбора игрока — честно 1 к 3. */
export function playShells(p: Player, bet: number, pick: number, now: number, rng: Rng) {
  if (!Number.isInteger(bet) || bet < SHELLS.minBet) throw new GameError(`Ставка от ${SHELLS.minBet} ₽`);
  if (bet > maxBet(p)) throw new GameError(`На твоём уровне ставка до ${maxBet(p)} ₽`);
  if (![0, 1, 2].includes(pick)) throw new GameError('Выбери напёрсток');
  if (shellsLeft(p, now) <= 0) throw new GameError('Лёха на сегодня наигрался');
  if (p.money < bet) throw new GameError('Не хватает денег');
  const day = dayKey(now);
  p.shells = { day, n: (p.shells.day === day ? p.shells.n : 0) + 1 };
  const ball = Math.floor(rng() * 3);
  const win = ball === pick;
  const payout = win ? Math.floor(bet * SHELLS.payout) : 0;
  p.money += payout - bet;
  return { ball, win, payout };
}
