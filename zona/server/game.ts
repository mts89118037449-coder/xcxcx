// Игровая логика. Функции чистые относительно хранилища: получают игрока,
// меняют его и возвращают результат. Время и случайность передаются снаружи,
// чтобы всё можно было проверить тестами.

import {
  BALANCE,
  GOLD_PRICES,
  STAT_NAMES,
  WORLD_BOSS,
  bossById,
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

export interface FightResult {
  win: boolean;
  log: string[];
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

export function isVip(p: Player, now: number): boolean {
  return p.vipUntil > now;
}

function bonuses(p: Player): Required<Bonus> {
  const total: Required<Bonus> = { atk: 0, def: 0, hp: 0, crit: 0, energy: 0, money: 0 };
  const sources = [
    ...Object.values(p.equipped).map((id) => (id ? itemById.get(id) : undefined)),
    ...p.tattoos.map((id) => tattooById.get(id)),
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
    maxEnergy: BALANCE.baseEnergy + b.energy + (vip ? BALANCE.vipEnergyBonus : 0),
    moneyBonus: b.money + (vip ? BALANCE.vipMoneyBonus : 0),
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

export function fighter(p: Player, now: number): Fighter {
  const s = stats(p, now);
  return { name: p.name, hp: p.hp, maxHp: s.maxHp, atk: s.atk, def: s.def, crit: s.crit };
}

export function fight(a: Fighter, b: Fighter, rng: Rng, maxRounds = 30): FightResult {
  let aHp = a.hp;
  let bHp = b.hp;
  let dealt = 0;
  const lines: string[] = [];
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
    lines.push(`${a.name} бьёт на ${h1.dmg}${h1.crit ? ' 💥' : ''}`);
    if (bHp <= 0) break;
    const h2 = hit(b, a);
    aHp -= h2.dmg;
    lines.push(`${b.name} отвечает на ${h2.dmg}${h2.crit ? ' 💥' : ''}`);
    if (aHp <= 0) break;
  }
  // Лог держим коротким: начало и развязка боя.
  const log = lines.length > 12 ? [...lines.slice(0, 6), '…', ...lines.slice(-5)] : lines;
  return { win: bHp <= 0, log, damageDealt: Math.min(dealt, b.hp), hpLeft: Math.max(0, aHp) };
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
export function botOpponent(level: number, rng: Rng): Fighter & { money: number } {
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
  };
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
  if (target) {
    // Защищающийся бьётся в полную силу: оффлайн-игрока не обижаем на израненном здоровье.
    tick(target, now);
    enemy = { ...fighter(target, now), hp: stats(target, now).maxHp };
    loot = Math.min(Math.floor(target.money * BALANCE.pvpStealShare), target.level * 300);
  } else {
    const bot = botOpponent(p.level, rng);
    enemy = bot;
    loot = bot.money;
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
  return { ...result, enemy: enemy.name, loot, authority, xp, levelUps };
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
  const s = stats(p, now);
  const crit = rng() * 100 < s.crit;
  return { damage: Math.round(s.atk * 4 * (0.85 + rng() * 0.3) * (crit ? 2 : 1)), crit };
}
