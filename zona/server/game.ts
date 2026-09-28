// Игровая логика. Функции чистые относительно хранилища: получают игрока,
// меняют его и возвращают результат. Время и случайность передаются снаружи,
// чтобы всё можно было проверить тестами.

import type { DailyState, Look, Quest, QuestState } from '../shared/types.ts';
import {
  BALANCE,
  CHURCH,
  PULLUPS,
  WEEKLY_EVENTS,
  WEEKLY_REWARDS,
  type TrackKind,
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
  FURNITURE,
  SPOT_NAMES,
  type Spot,
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

import { battleAct, battleAuto, battleControls, battleResult, fight, newBattle, npcPerks, type BattleAction, type BattleState, type Fighter, type FightResult, type Round } from './combat.ts';
import { STORY } from '../shared/story.ts';
import { BREW, CARDS, RACE, ROACHES, RANKS, SUITS, cardValue } from '../shared/minigames.ts';
import { ESCAPE, ESCAPE_STAGES, EVENTS, EVENT_TIMING, MEDIC, VISIT, escapeReward, eventById, type Effects } from '../shared/events.ts';
import { CONSUMABLES as CONSUMABLES_ALL, CONSUMABLE_SLOTS, PERK_SLOTS, consumableById, perkById, rollConsumable } from '../shared/perks.ts';

export { fight, npcPerks };
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
  cellShow: Partial<Record<Spot, string>>;
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
  weekly: { week: number; progress: number; claimed: number[] };
  blessUntil: number;
  prayAt: number;
  confessDay: string;
  pullups: { at: number; day: string; n: number };
  snoop: { day: string; n: number };
  /** Сюжет: глава, шаг и прогресс шага. */
  story: { ch: number; step: number; progress: number };
  /** Раздача в очко (скрыта от клиента до конца). */
  cards: { deck: string[]; hand: string[]; dealer: string[]; bet: number } | null;
  /** Мини-игры без энергии: сколько раз сыграно сегодня и когда последний раз. */
  minigames: Record<string, { day: string; n: number; at: number }>;
  /** Режим бога (только админ): без трат и откатов; реальные ресурсы сохранены и вернутся. */
  god: { on: boolean; saved: { money: number; gold: number; energy: number; butts: number; chifir: number } | null };
  /** Текущая драка (пошаговая) — переживает перезапуск приложения. */
  battle: {
    kind: 'boss' | 'pvp';
    bossId: string | null;
    targetId: number | null;
    loot: number;
    enemy: { name: string; npc?: string; look?: Look };
    st: BattleState;
    at: number;
  } | null;
  event: { id: string; until: number } | null;
  eventAt: number;
  yardAt: number;
  escape: { cdUntil: number; run: { stage: number; at: number } | null; best: number };
  medBedAt: number;
  noteDay: string;
  daily: DailyState;
  quests: QuestState;
  clanId: number | null;
  clanLevel: number;
  respect: Record<string, string>;
  /** Надетые боевые перки (до PERK_SLOTS). */
  perks: string[];
  /** Расходники на поясе (до CONSUMABLE_SLOTS) и запас в мешке. */
  belt: string[];
  stash: Record<string, number>;
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

export type { Fighter, Round, FightResult } from './combat.ts';

const MIN = 60_000;
const BOSS_ITEM_CHANCE = 0.4;
const PVP_ITEM_CHANCE = 0.12;
const QUEST_ITEM_CHANCE = 0.35;

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
    cellShow: {},
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
    weekly: { week: 0, progress: 0, claimed: [] },
    blessUntil: 0,
    prayAt: 0,
    confessDay: '',
    pullups: { at: 0, day: '', n: 0 },
    snoop: { day: '', n: 0 },
    battle: null,
    god: { on: false, saved: null },
    minigames: {},
    story: { ch: 0, step: 0, progress: 0 },
    cards: null,
    event: null,
    eventAt: now + 5 * MIN,
    yardAt: 0,
    escape: { cdUntil: 0, run: null, best: 0 },
    medBedAt: 0,
    noteDay: '',
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
    perks: ['crit_1'],
    belt: ['c_bandage', 'c_sand'],
    stash: { c_bandage: 2, c_sand: 1 },
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
  p.cellShow ??= {};
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
  p.weekly ??= { week: 0, progress: 0, claimed: [] };
  p.blessUntil ??= 0;
  p.prayAt ??= 0;
  p.confessDay ??= '';
  p.pullups ??= { at: 0, day: '', n: 0 };
  p.snoop ??= { day: '', n: 0 };
  p.battle ??= null;
  p.god ??= { on: false, saved: null };
  p.minigames ??= {};
  p.story ??= { ch: 0, step: 0, progress: 0 };
  p.cards ??= null;
  p.event ??= null;
  p.eventAt ??= 0;
  p.yardAt ??= 0;
  p.escape ??= { cdUntil: 0, run: null, best: 0 };
  p.medBedAt ??= 0;
  p.noteDay ??= '';
  p.daily ??= { day: '', tasks: [], bonusClaimed: false };
  p.quests ??= { board: [], active: null };
  p.clanId ??= null;
  p.clanLevel ??= 0;
  p.respect ??= {};
  p.perks ??= ['crit_1'];
  p.belt ??= ['c_bandage', 'c_sand'];
  p.stash ??= { c_bandage: 2, c_sand: 1 };
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
    crit: Math.min(40, 2 + Math.floor(p.agi * 0.3) + b.crit + (p.blessUntil > now ? CHURCH.blessCrit : 0)),
    maxEnergy: BALANCE.baseEnergy + b.energy + (vip ? BALANCE.vipEnergyBonus : 0) + p.clanLevel * CLAN.energyPerLevel,
    moneyBonus: b.money + (vip ? BALANCE.vipMoneyBonus : 0) + p.clanLevel * CLAN.moneyPerLevel + (p.blessUntil > now ? CHURCH.blessMoney : 0),
  };
}

/** Восстановление энергии и здоровья по прошедшему времени. */
export function tick(p: Player, now: number): void {
  const s = stats(p, now);
  const regenSec = BALANCE.energyRegenSec / (isVip(p, now) ? 2 : 1) / (weeklyEvent(now).id === 'amnesty' ? 1.5 : 1);
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
  spawnEvent(p, now, Math.random);
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
  // рандом смены: иногда премия от бригадира, иногда находка на промке
  const bonus = rng() < 0.1;
  const money = Math.round(roll(rng, job.money) * (1 + stats(p, now).moneyBonus / 100) * (bonus ? 2 : 1));
  p.money += money;
  let item: string | null = null;
  if (rng() < 0.05) {
    item = rollConsumable(rng);
    giveItem(p, item);
  }
  const levelUps = addXp(p, job.xp, now);
  track(p, 'job');
  return { money, xp: job.xp, levelUps, bonus, item };
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
  const ladder = FURNITURE.filter((x) => x.spot === f.spot);
  const prev = ladder[ladder.indexOf(f) - 1];
  if (prev && !p.furniture.includes(prev.id)) throw new GameError(`Сначала — ${prev.name}`);
  spend(p, f.price, f.currency);
  p.furniture.push(furnitureId);
  delete p.cellShow[f.spot]; // новинку сразу видно
  track(p, 'furnish');
  log(p, now, `${f.emoji} Обустроил хату: ${f.name}`);
}

/** Что поставить на место в сцене: купленную вещь, 'none' — пусто, '' — лучшее. */
export function setCellShow(p: Player, spot: string, id: string) {
  if (!(spot in SPOT_NAMES)) throw new GameError('Нет такого места');
  const sp = spot as Spot;
  if (id === '') delete p.cellShow[sp];
  else if (id === 'none') p.cellShow[sp] = 'none';
  else {
    const f = furnitureById.get(id);
    if (!f || f.spot !== sp || !p.furniture.includes(id)) throw new GameError('Этого у тебя нет');
    p.cellShow[sp] = id;
  }
}

export function fighter(p: Player, now: number): Fighter {
  const s = stats(p, now);
  return {
    name: p.name, hp: p.hp, maxHp: s.maxHp, atk: s.atk, def: s.def, crit: s.crit,
    perks: p.perks.filter((id) => (perkById.get(id)?.minLevel ?? Infinity) <= p.level),
    items: p.belt.filter((id) => (p.stash[id] ?? 0) > 0),
  };
}

/** Списывает потраченные в бою расходники. */
function spendItems(p: Player, used: string[]) {
  for (const id of used) {
    p.stash[id] = Math.max(0, (p.stash[id] ?? 0) - 1);
    if (!p.stash[id]) delete p.stash[id];
  }
}

export function giveItem(p: Player, id: string, n = 1) {
  p.stash[id] = (p.stash[id] ?? 0) + n;
  // пустой слот на поясе — сразу туда
  if (!p.belt.includes(id) && p.belt.length < CONSUMABLE_SLOTS) p.belt.push(id);
}

// --- Перки и расходники ---------------------------------------------------------

export function setPerks(p: Player, ids: string[]) {
  if (!Array.isArray(ids) || ids.length > PERK_SLOTS) throw new GameError(`Перков — не больше ${PERK_SLOTS}`);
  const kinds = new Set<string>();
  for (const id of ids) {
    const perk = perkById.get(String(id));
    if (!perk) throw new GameError('Нет такого перка');
    if (perk.minLevel > p.level) throw new GameError(`«${perk.name}» — с ${perk.minLevel} уровня`);
    const k = perk.kind === 'legend' ? perk.id : perk.kind;
    if (kinds.has(k)) throw new GameError('Два перка одного типа не взять');
    kinds.add(k);
  }
  p.perks = ids.map(String);
}

export function setBelt(p: Player, ids: string[]) {
  if (!Array.isArray(ids) || ids.length > CONSUMABLE_SLOTS) throw new GameError(`На поясе — не больше ${CONSUMABLE_SLOTS}`);
  const uniq = [...new Set(ids.map(String))];
  for (const id of uniq) {
    if (!consumableById.has(id)) throw new GameError('Нет такой вещи');
    if (!p.stash[id]) throw new GameError('Этого у тебя нет');
  }
  p.belt = uniq;
}

export function buyConsumable(p: Player, id: string, count: number) {
  const c = consumableById.get(id);
  if (!c || !c.price) throw new GameError('Это не продаётся — только найти');
  const n = Math.max(1, Math.min(10, Math.floor(Number(count) || 1)));
  spend(p, c.price * n, c.currency);
  giveItem(p, id, n);
}

function requireHp(p: Player, now: number) {
  if (p.hp < stats(p, now).maxHp * BALANCE.pvpMinHpShare) {
    throw new GameError('Слишком слаб. Отлежись в санчасти');
  }
}

function bossFighter(bossId: string): Fighter {
  const boss = bossById.get(bossId)!;
  const bossIdx = [...bossById.keys()].indexOf(bossId);
  return { name: boss.name, hp: boss.hp, maxHp: boss.hp, atk: boss.atk, def: boss.def, crit: 5, perks: npcPerks(boss.minLevel + 2, bossIdx * 7 + 1) };
}

function noBattle(p: Player) {
  if (p.battle) throw new GameError('Сначала закончи текущую драку');
}

/** Начать бой с боссом: энергия списывается сразу, дальше — ходы игрока. */
export function bossStart(p: Player, bossId: string, now: number) {
  const boss = bossById.get(bossId);
  if (!boss) throw new GameError('Нет такого босса');
  noBattle(p);
  if (p.level < boss.minLevel) throw new GameError(`Доступно с ${boss.minLevel} уровня`);
  const cd = p.bossCd[bossId] ?? 0;
  if (cd > now) throw new GameError('Босс ещё не оклемался');
  requireHp(p, now);
  spendEnergy(p, boss.energy, now);
  p.battle = { kind: 'boss', bossId, targetId: null, loot: 0, enemy: { name: boss.name, npc: bossId }, st: newBattle(fighter(p, now), bossFighter(bossId)), at: now };
  return battleView(p);
}

export function bossFinish(p: Player, bossId: string, result: FightResult, now: number, rng: Rng) {
  const boss = bossById.get(bossId)!;
  spendItems(p, result.used);
  p.hp = result.hpLeft;
  p.hpAt = now;
  p.bossCd[bossId] = now + boss.cooldownMin * MIN * (result.win ? 1 : 0.25);

  const reward = { money: 0, xp: 0, authority: 0, gold: 0, drop: null as string | null, item: null as string | null, levelUps: 0 };
  if (result.win) {
    reward.money = Math.round(roll(rng, boss.reward.money) * (1 + stats(p, now).moneyBonus / 100) * (weeklyEvent(now).id === 'search' ? 1.5 : 1) * (1 + result.lootBonus / 100));
    if (rng() < BOSS_ITEM_CHANCE) {
      reward.item = rollConsumable(rng);
      giveItem(p, reward.item);
    }
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

/** Бой с боссом целиком автоматически (автобой и тесты). */
export function fightBoss(p: Player, bossId: string, now: number, rng: Rng) {
  bossStart(p, bossId, now);
  const st = p.battle!.st;
  p.battle = null;
  battleAuto(st, rng);
  return bossFinish(p, bossId, battleResult(st), now, rng);
}

/** Что видит клиент: противник, запись ходов, кнопки. */
export function battleView(p: Player) {
  const b = p.battle;
  if (!b) return null;
  return {
    kind: b.kind,
    enemy: b.enemy,
    rounds: b.st.rounds,
    startHp: b.st.startHp,
    ...battleControls(b.st),
  };
}

/** Ход игрока в текущем бою. done — бой окончен, награды раздаёт вызывающий (ему нужен противник-игрок). */
export function battleStep(p: Player, action: BattleAction | { type: 'auto' }, rng: Rng) {
  const b = p.battle;
  if (!b) throw new GameError('Ты ни с кем не дерёшься');
  let rounds: Round[];
  try {
    rounds = action.type === 'auto' ? battleAuto(b.st, rng) : battleAct(b.st, action, rng);
  } catch (e) {
    if (e instanceof GameError) throw e;
    throw new GameError(e instanceof Error ? e.message : 'Нельзя');
  }
  return { rounds, done: b.st.done };
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
    perks: npcPerks(level - 2, Math.floor(rng() * 1000)),
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

/** Начать наезд: противник — живой игрок (бьётся сам) или бот. */
export function pvpStart(p: Player, target: Player | null, now: number, rng: Rng) {
  if (p.pvpAt + BALANCE.pvpCooldownSec * 1000 > now) throw new GameError('Отдышись немного');
  noBattle(p);
  requireHp(p, now);
  spendEnergy(p, BALANCE.pvpEnergy, now);
  p.pvpAt = now;
  let enemy: Fighter;
  let loot: number;
  let enemyLook: Look;
  if (target) {
    // Защищающийся бьётся в полную силу: оффлайн-игрока не обижаем на израненном здоровье.
    tick(target, now);
    enemy = { ...fighter(target, now), hp: stats(target, now).maxHp, items: [] };
    loot = Math.min(Math.floor(target.money * BALANCE.pvpStealShare), target.level * 300);
    enemyLook = lookOf(target);
  } else {
    const bot = botOpponent(p.level, rng);
    enemy = bot;
    loot = bot.money;
    enemyLook = bot.look;
  }
  p.battle = { kind: 'pvp', bossId: null, targetId: target?.id ?? null, loot, enemy: { name: enemy.name, look: enemyLook }, st: newBattle(fighter(p, now), enemy), at: now };
  return battleView(p);
}

export function pvpFinish(p: Player, target: Player | null, loot0: number, result: FightResult, now: number, rng: Rng) {
  let loot = loot0;
  spendItems(p, result.used);
  p.hp = result.hpLeft;
  let item: string | null = null;
  p.hpAt = now;
  let authority = 0;
  let xp = 0;
  if (result.win) {
    authority = (3 + Math.floor(rng() * 6)) * (weeklyEvent(now).id === 'tournament' ? 2 : 1);
    xp = 8 + p.level * 2;
    if (target) loot = Math.min(loot, Math.max(0, target.money));
    loot = Math.round(loot * (1 + result.lootBonus / 100));
    p.money += loot;
    p.authority += authority;
    if (rng() < PVP_ITEM_CHANCE) {
      item = rollConsumable(rng);
      giveItem(p, item);
    }
    track(p, 'pvpWin');
    p.wins += 1;
    if (target) {
      target.money = Math.max(0, target.money - loot);
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
  return { ...result, loot, authority, xp, levelUps, item };
}

/** Наезд целиком автоматически (тесты). */
export function pvp(p: Player, target: Player | null, now: number, rng: Rng) {
  pvpStart(p, target, now, rng);
  const b = p.battle!;
  p.battle = null;
  battleAuto(b.st, rng);
  const r = pvpFinish(p, target, b.loot, battleResult(b.st), now, rng);
  return { ...r, enemy: b.enemy.name, enemyLook: b.enemy.look! };
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
  const k = weeklyEvent(now).id === 'riot' ? 2 : 1;
  return { damage: Math.round(s.atk * 4 * (0.85 + rng() * 0.3) * (crit ? 2 : 1) * k), crit };
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

export function track(p: Player, kind: TrackKind, amount = 1) {
  const step = STORY[p.story.ch]?.steps[p.story.step];
  if (step && step.kind === kind) p.story.progress = Math.min(step.n, p.story.progress + amount);
  if (weeklyEvent(Date.now()).goal.kind === kind) {
    ensureWeekly(p, Date.now());
    p.weekly.progress += amount;
  }
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
  const rng = seeded(`${p.id}:${p.daily.day}:${index}`);
  const items: string[] = [];
  if (rng() < 0.3) items.push(rollConsumable(rng));
  let bonus = 0;
  if (!p.daily.bonusClaimed && p.daily.tasks.every((x) => x.claimed)) {
    p.daily.bonusClaimed = true;
    bonus = DAILY_BONUS_GOLD;
    p.gold += bonus;
    items.push(rollConsumable(rng));
    log(p, now, `📋 Все дела на день закрыты: +${bonus} золота`);
  }
  for (const id of items) giveItem(p, id);
  return { money: t.money, gold: t.gold, xp: t.xp, bonus, items };
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
  let item: string | null = null;
  if (ok && rng() < QUEST_ITEM_CHANCE) {
    item = rollConsumable(rng);
    giveItem(p, item);
  }
  track(p, 'quest');
  ensureBoard(p, rng);
  return { ok, money, gold, xp, levelUps, tpl: a.tpl, item };
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
  track(p, 'visit');
  log(target, now, `🤝 ${p.name} зашёл в хату и выразил уважение: +1 авторитета`);
  addXp(p, 5, now);
}

/** Подогреть соседа бычками: раз в день на каждого. */
export function gift(p: Player, target: Player, now: number) {
  if (p.id === target.id) throw new GameError('Себе не греют');
  const day = dayKey(now);
  if (p.respect[`g${target.id}`] === day) throw new GameError('Сегодня уже грел');
  if (p.butts < VISIT.giftButts) throw new GameError(`Нужно ${VISIT.giftButts} бычков`);
  p.butts -= VISIT.giftButts;
  p.respect[`g${target.id}`] = day;
  track(p, 'visit');
  target.butts += VISIT.giftButts;
  target.authority += 2;
  p.authority += 1;
  log(target, now, `🚬 ${p.name} подогрел хату: +${VISIT.giftButts} бычков, +2 авторитета`);
  addXp(p, 8, now);
}

export function snoopsLeft(p: Player, now: number) {
  return p.snoop.day === dayKey(now) ? Math.max(0, VISIT.snoopPerDay - p.snoop.n) : VISIT.snoopPerDay;
}

/** Пошарить в чужой хате, пока хозяин на прогулке. Заначка, пусто или спалился. */
export function snoop(p: Player, target: Player, now: number, rng: Rng) {
  if (p.id === target.id) throw new GameError('В своей хате не шарят');
  if (snoopsLeft(p, now) <= 0) throw new GameError('На сегодня хватит — и так косо смотрят');
  const day = dayKey(now);
  p.snoop = { day, n: (p.snoop.day === day ? p.snoop.n : 0) + 1 };
  track(p, 'visit');
  // живность сторожит хату
  const guard = target.furniture.includes('f_parrot') ? 0.15 : target.furniture.includes('f_cat') ? 0.08 : 0;
  const r = rng();
  if (r < VISIT.caught + guard) {
    const max = stats(p, now).maxHp;
    const hp = Math.round(max * 0.15);
    p.hp = Math.max(1, p.hp - hp);
    p.hpAt = now;
    const auth = Math.min(p.authority, 2);
    p.authority -= auth;
    target.authority += 1;
    log(target, now, `🫵 Застал ${p.name} за шмоном своей хаты. Навешал люлей, +1 авторитета`);
    return { outcome: 'caught' as const, hp, authority: auth, by: guard && rng() < 0.5 ? (target.furniture.includes('f_parrot') ? 'parrot' : 'cat') : 'host' };
  }
  if (r < VISIT.caught + guard + VISIT.empty) return { outcome: 'empty' as const };
  const k = rng();
  if (k < 0.15) {
    const item = rollConsumable(rng);
    giveItem(p, item);
    return { outcome: 'item' as const, item };
  }
  if (k < 0.5) {
    const butts = 2 + Math.floor(rng() * 5);
    p.butts += butts;
    return { outcome: 'butts' as const, butts };
  }
  const money = Math.round((30 + target.level * 25) * (0.6 + rng() * 0.8));
  p.money += money;
  return { outcome: 'money' as const, money };
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
  const got = (b.pack ? BUTTS.packValue : 1) * (weeklyEvent(Date.now()).id === 'tobacco' ? 2 : 1);
  track(p, 'butts', got);
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
  track(p, 'minigame');
  const ball = Math.floor(rng() * 3);
  const win = ball === pick;
  const payout = win ? Math.floor(bet * SHELLS.payout) : 0;
  p.money += payout - bet;
  return { ball, win, payout };
}

// --- Еженедельные события --------------------------------------------------------

/** Номер недели по Москве, неделя начинается в понедельник. */
export function weekIndex(now: number): number {
  return Math.floor((now + 3 * 3600_000 + 3 * 86_400_000) / (7 * 86_400_000));
}

export function weekEndsAt(now: number): number {
  return (weekIndex(now) + 1) * 7 * 86_400_000 - 3 * 86_400_000 - 3 * 3600_000;
}

export function weeklyEvent(now: number) {
  return WEEKLY_EVENTS[weekIndex(now) % WEEKLY_EVENTS.length];
}

export function ensureWeekly(p: Player, now: number) {
  const w = weekIndex(now);
  if (p.weekly.week !== w) p.weekly = { week: w, progress: 0, claimed: [] };
}

export function claimWeekly(p: Player, tier: number, now: number) {
  ensureWeekly(p, now);
  const ev = weeklyEvent(now);
  if (![0, 1, 2].includes(tier)) throw new GameError('Нет такой награды');
  if (p.weekly.claimed.includes(tier)) throw new GameError('Уже забрал');
  if (p.weekly.progress < ev.tiers[tier]) throw new GameError('Цель ещё не выполнена');
  const r = WEEKLY_REWARDS[tier];
  p.weekly.claimed.push(tier);
  p.money += r.money;
  p.gold += r.gold;
  p.chifir += r.chifir;
  const rng = seeded(`${p.id}:${p.weekly.week}:${tier}`);
  const items = Array.from({ length: tier + 1 }, () => rollConsumable(rng));
  for (const id of items) giveItem(p, id);
  log(p, now, `🏆 ${ev.name}: награда ${tier + 1}-й ступени`);
  return { ...r, items };
}

// --- Церковь -----------------------------------------------------------------------

export function pray(p: Player, now: number) {
  if (p.prayAt + CHURCH.prayCooldownMin * MIN > now) throw new GameError('Батюшка: «Не торопись, сын мой»');
  p.prayAt = now;
  track(p, 'church');
  p.blessUntil = Math.max(p.blessUntil, now) + CHURCH.prayBlessMin * MIN;
  addXp(p, 5, now);
}

export function lightCandle(p: Player, now: number) {
  if (p.butts < CHURCH.candleCost) throw new GameError(`Свечка — ${CHURCH.candleCost} бычков`);
  p.butts -= CHURCH.candleCost;
  track(p, 'church');
  p.blessUntil = Math.max(p.blessUntil, now) + CHURCH.candleBlessMin * MIN;
}

export function confess(p: Player, now: number) {
  const day = dayKey(now);
  if (p.confessDay === day) throw new GameError('Исповедь — раз в день');
  p.confessDay = day;
  track(p, 'church');
  const max = stats(p, now).maxHp;
  p.hp = Math.min(max, p.hp + Math.round(max * CHURCH.confessHeal));
  p.hpAt = now;
  giveItem(p, 'c_holywater'); // батюшка даёт с собой святой воды
}

// --- Турник ------------------------------------------------------------------------

export function pullupsLeft(p: Player, now: number) {
  return p.pullups.day === dayKey(now) ? Math.max(0, PULLUPS.perDay - p.pullups.n) : PULLUPS.perDay;
}

/** Подтягивания без энергии: сколько натапал (не больше предела) — столько опыта по чуть-чуть. */
export function pullups(p: Player, reps: number, now: number) {
  if (p.pullups.at + PULLUPS.cooldownMin * MIN > now) throw new GameError('Руки ещё не отошли');
  if (pullupsLeft(p, now) <= 0) throw new GameError('На сегодня хватит');
  const n = Math.max(0, Math.min(PULLUPS.maxReps, Math.floor(reps)));
  const day = dayKey(now);
  p.pullups = { at: now, day, n: (p.pullups.day === day ? p.pullups.n : 0) + 1 };
  track(p, 'minigame');
  const xp = Math.floor(n / PULLUPS.repsPerXp);
  addXp(p, xp, now);
  return { reps: n, xp };
}

// --- Случаи --------------------------------------------------------------------------

/** Пайка — единица денег в случаях, растёт с уровнем. */
export const ration = (p: Player) => 30 + p.level * 15;

function pickWeighted<T extends { w: number }>(list: T[], rng: Rng): T {
  const sum = list.reduce((a, x) => a + x.w, 0);
  let r = rng() * sum;
  for (const x of list) if ((r -= x.w) < 0) return x;
  return list[list.length - 1];
}

/** Время от времени на зоне что-то случается — висит, пока не ответишь. */
export function spawnEvent(p: Player, now: number, rng: Rng, where: 'any' | 'yard' = 'any') {
  if (p.event && p.event.until <= now) p.event = null;
  if (where === 'any' && (p.event || now < p.eventAt)) return;
  const pool = EVENTS.filter((e) => e.where === 'any' || e.where === where);
  const ev = pool[Math.floor(rng() * pool.length)];
  p.event = { id: ev.id, until: now + EVENT_TIMING.ttlMin * MIN };
  const gap = EVENT_TIMING.minGapMin + rng() * (EVENT_TIMING.maxGapMin - EVENT_TIMING.minGapMin);
  p.eventAt = now + gap * MIN;
}

export interface Applied {
  money: number;
  butts: number;
  gold: number;
  xp: number;
  authority: number;
  energy: number;
  hp: number;
  item: string | null;
  levelUps: number;
}

function applyEffects(p: Player, e: Effects, now: number, rng: Rng): Applied {
  const max = stats(p, now);
  const out: Applied = { money: 0, butts: 0, gold: 0, xp: 0, authority: 0, energy: 0, hp: 0, item: null, levelUps: 0 };
  if (e.money) {
    out.money = Math.max(-p.money, Math.round(e.money * ration(p)));
    p.money += out.money;
  }
  if (e.butts) {
    out.butts = Math.max(-p.butts, e.butts);
    p.butts += out.butts;
  }
  if (e.gold) {
    out.gold = e.gold;
    p.gold += e.gold;
  }
  if (e.authority) {
    out.authority = Math.max(-p.authority, e.authority);
    p.authority += out.authority;
  }
  if (e.energy) {
    out.energy = e.energy;
    p.energy = Math.max(0, p.energy + e.energy); // сверх максимума — можно, как с чифиром
  }
  if (e.hp) {
    const before = p.hp;
    p.hp = Math.max(1, Math.min(max.maxHp, Math.round(p.hp + e.hp * max.maxHp)));
    p.hpAt = now;
    out.hp = p.hp - before;
  }
  if (e.item) {
    out.item = rollConsumable(rng);
    giveItem(p, out.item);
  }
  if (e.xp) {
    out.xp = e.xp;
    out.levelUps = addXp(p, e.xp, now);
  }
  return out;
}

export function answerEvent(p: Player, choice: number, now: number, rng: Rng) {
  if (!p.event || p.event.until <= now) {
    p.event = null;
    throw new GameError('Момент упущен');
  }
  const ev = eventById.get(p.event.id);
  const opt = ev?.options[choice];
  if (!ev || !opt) throw new GameError('Нет такого ответа');
  const cost = opt.cost ?? {};
  const money = Math.round((cost.money ?? 0) * ration(p));
  if (p.money < money || p.butts < (cost.butts ?? 0) || p.gold < (cost.gold ?? 0)) throw new GameError('Не на что');
  p.money -= money;
  p.butts -= cost.butts ?? 0;
  p.gold -= cost.gold ?? 0;
  p.event = null;
  track(p, 'event');
  const o = pickWeighted(opt.outcomes, rng);
  const got = applyEffects(p, o, now, rng);
  return { text: o.text, who: ev.who, name: ev.name, ...got };
}

/** Прогулка по двору: случай прямо сейчас (раз в полчаса), без энергии. */
export function yardWalk(p: Player, now: number, rng: Rng) {
  if (p.yardAt + EVENT_TIMING.yardCooldownMin * MIN > now) throw new GameError('Прогулка уже была — погоди');
  p.yardAt = now;
  const keepAt = p.eventAt;
  spawnEvent(p, now, rng, 'yard');
  p.eventAt = keepAt;
  track(p, 'yard');
  return { id: p.event!.id };
}

// --- Побег ----------------------------------------------------------------------------

export function escapeStart(p: Player, now: number) {
  if (p.escape.run) throw new GameError('Ты уже в бегах');
  if (p.escape.cdUntil > now) throw new GameError('Сидишь в ШИЗО');
  if (p.level < 3) throw new GameError('Побег — с 3 уровня. Сначала осмотрись');
  spendEnergy(p, ESCAPE.energy, now);
  p.escape.run = { stage: 0, at: now };
  return { stage: 0 };
}

/** Этап побега: quality — насколько точно сыграл мини-игру (0..1). */
export function escapeStep(p: Player, quality: number, now: number, rng: Rng) {
  const run = p.escape.run;
  if (!run) throw new GameError('Ты не в бегах');
  const st = ESCAPE_STAGES[run.stage];
  const q = Math.max(0, Math.min(1, Number(quality) || 0));
  const agi = Math.min(0.1, p.agi * 0.002);
  const chance = st.pass ? Math.min(0.97, st.pass + q * ESCAPE.qualityBonus + agi) : 0;
  if (rng() < chance) {
    run.stage += 1;
    return { passed: true, stage: run.stage, caught: false as const };
  }
  return { passed: false, ...escapeEnd(p, true, now, rng) };
}

/** Конец побега: пойман (ШИЗО, побои) или вернулся сам (меньше награды). */
export function escapeEnd(p: Player, caught: boolean, now: number, rng: Rng) {
  const run = p.escape.run;
  if (!run) throw new GameError('Ты не в бегах');
  p.escape.run = null;
  const stages = run.stage;
  p.escape.best = Math.max(p.escape.best, stages);
  if (stages > 0) track(p, 'escape', stages);
  const r = escapeReward(p.level, stages);
  const k = caught ? 1 : ESCAPE.bailShare;
  const reward = applyEffects(p, { xp: Math.round(r.xp * k), authority: Math.round(r.authority * k), gold: caught ? r.gold : 0, item: r.item && caught }, now, rng);
  const money = Math.round(r.money * k);
  p.money += money;
  reward.money = money;
  if (caught) {
    const max = stats(p, now).maxHp;
    p.hp = Math.max(1, Math.min(p.hp, Math.round(max * 0.4)));
    p.hpAt = now;
    p.escape.cdUntil = now + ESCAPE.cooldownMin * MIN;
    log(p, now, `🏃 Побег: дошёл до «${ESCAPE_STAGES[Math.min(stages, ESCAPE_STAGES.length - 1)].name}». Поймали — ШИЗО`);
  } else {
    p.escape.cdUntil = now + ESCAPE.bailCooldownMin * MIN;
  }
  return { caught, stage: stages, reward };
}

// --- Санчасть ---------------------------------------------------------------------------

export function medBed(p: Player, now: number) {
  const max = stats(p, now).maxHp;
  if (p.hp >= max) throw new GameError('Лепила: «Здоров — иди работай»');
  if (p.medBedAt + MEDIC.bedCooldownMin * MIN > now) throw new GameError('Койка занята');
  p.medBedAt = now;
  const before = p.hp;
  p.hp = Math.min(max, p.hp + Math.round(max * MEDIC.bedHeal));
  p.hpAt = now;
  return { hp: p.hp - before };
}

export function medShot(p: Player, now: number) {
  const max = stats(p, now).maxHp;
  if (p.hp >= max) throw new GameError('Ты и так здоров');
  spend(p, MEDIC.shotPerLevel * p.level, 'money');
  const before = p.hp;
  p.hp = Math.min(max, p.hp + Math.round(max * MEDIC.shotHeal));
  p.hpAt = now;
  return { hp: p.hp - before };
}

/** Справка «освобождение от работ»: раз в день, как повезёт. */
export function medNote(p: Player, now: number, rng: Rng) {
  const day = dayKey(now);
  if (p.noteDay === day) throw new GameError('Сегодня уже просил');
  p.noteDay = day;
  if (rng() < MEDIC.noteChance) {
    p.energy += MEDIC.noteEnergy;
    return { ok: true, energy: MEDIC.noteEnergy };
  }
  return { ok: false, energy: 0 };
}

// --- Админ: режим бога и инструменты для тестов --------------------------------

/** Включить/выключить режим бога. При выключении ресурсы возвращаются как были. */
export function toggleGod(p: Player, now: number) {
  if (p.god.on) {
    const sv = p.god.saved;
    if (sv) Object.assign(p, sv);
    p.god = { on: false, saved: null };
  } else {
    p.god = { on: true, saved: { money: p.money, gold: p.gold, energy: p.energy, butts: p.butts, chifir: p.chifir } };
    godTopUp(p, now);
  }
  return { god: p.god.on };
}

/** Перед каждым действием бога: всего вдоволь, все откаты сброшены. */
export function godTopUp(p: Player, now: number) {
  const s = stats(p, now);
  p.money = Math.max(p.money, 100_000_000);
  p.gold = Math.max(p.gold, 1_000_000);
  p.butts = Math.max(p.butts, 100_000);
  p.chifir = Math.max(p.chifir, 99);
  p.energy = Math.max(p.energy, s.maxEnergy + 1000);
  p.energyAt = now;
  p.hp = s.maxHp;
  p.hpAt = now;
  p.bossCd = {};
  p.pvpAt = 0;
  p.worldHitAt = 0;
  p.escape.cdUntil = 0;
  p.medBedAt = 0;
  p.yardAt = 0;
  p.prayAt = 0;
  p.confessDay = '';
  p.noteDay = '';
  p.dailyAt = 0;
  p.pullups = { at: 0, day: '', n: 0 };
  p.shells = { day: '', n: 0 };
  p.snoop = { day: '', n: 0 };
  p.respect = {};
  if (p.quests.active) p.quests.active.endsAt = now;
  p.minigames = {};
}

/** Инструменты админа (работают в любом режиме). */
export function adminTool(p: Player, tool: string, arg: string, now: number) {
  switch (tool) {
    case 'level': {
      const lvl = Math.max(1, Math.min(60, Math.floor(Number(arg)) || 1));
      p.level = lvl;
      p.xp = 0;
      break;
    }
    case 'furniture':
      p.furniture = FURNITURE.map((f) => f.id);
      break;
    case 'items':
      for (const c of CONSUMABLES_ALL) p.stash[c.id] = (p.stash[c.id] ?? 0) + 10;
      break;
    case 'gear':
      for (const it of ITEMS) if (!p.inventory.includes(it.id)) p.inventory.push(it.id);
      break;
    case 'event': {
      const ev = EVENTS.find((e) => e.id === arg) ?? EVENTS[Math.floor(Math.random() * EVENTS.length)];
      p.event = { id: ev.id, until: now + 60 * MIN };
      return { id: ev.id };
    }
    case 'battleEnd':
      p.battle = null;
      break;
    case 'newbie': {
      const fresh = newPlayer(p.id, p.name, p.username, now);
      const keep = { god: p.god, clanId: p.clanId, clanLevel: p.clanLevel, journal: p.journal };
      Object.assign(p, fresh, keep);
      p.god = { on: false, saved: null };
      break;
    }
    default:
      throw new GameError('Нет такого инструмента');
  }
  return { ok: true };
}

// --- Сюжет -----------------------------------------------------------------------

export function claimStory(p: Player, now: number) {
  const ch = STORY[p.story.ch];
  const step = ch?.steps[p.story.step];
  if (!step) throw new GameError('Сюжет пройден');
  if (p.story.progress < step.n) throw new GameError('Шаг ещё не выполнен');
  const r = step.reward;
  p.money += r.money ?? 0;
  p.gold += r.gold ?? 0;
  p.butts += r.butts ?? 0;
  if (r.item) giveItem(p, r.item);
  const levelUps = r.xp ? addXp(p, r.xp, now) : 0;
  p.story.step++;
  p.story.progress = 0;
  let chapterDone = false;
  if (p.story.step >= ch.steps.length) {
    chapterDone = true;
    log(p, now, `📖 Глава «${ch.name}» пройдена`);
    p.story = { ch: p.story.ch + 1, step: 0, progress: 0 };
  }
  return { money: r.money ?? 0, gold: r.gold ?? 0, butts: r.butts ?? 0, xp: r.xp ?? 0, item: r.item ?? null, levelUps, chapterDone };
}

// --- Мини-игры ---------------------------------------------------------------------

function playLimit(p: Player, id: string, perDay: number, now: number, cooldownMin = 0) {
  const day = dayKey(now);
  const m = p.minigames[id] && p.minigames[id].day === day ? p.minigames[id] : { day, n: 0, at: 0 };
  if (m.n >= perDay) throw new GameError('На сегодня хватит — приходи завтра');
  if (cooldownMin && m.at + cooldownMin * MIN > now) throw new GameError('Погоди немного');
  m.n++;
  m.at = now;
  p.minigames[id] = m;
  track(p, 'minigame');
}

export function playsLeft(p: Player, id: string, perDay: number, now: number) {
  const m = p.minigames[id];
  return m && m.day === dayKey(now) ? Math.max(0, perDay - m.n) : perDay;
}

export function cardsMaxBet(p: Player) {
  return CARDS.minBet + p.level * CARDS.betPerLevel;
}

function cardsView(c: NonNullable<Player['cards']>, reveal: boolean) {
  return { hand: c.hand, dealer: reveal ? c.dealer : [c.dealer[0], '?'], sum: cardValue(c.hand), dealerSum: reveal ? cardValue(c.dealer) : null, bet: c.bet };
}

export function cardsStart(p: Player, bet: number, now: number, rng: Rng) {
  if (p.cards) throw new GameError('Доиграй раздачу');
  const b = Math.floor(Number(bet));
  if (!(b >= CARDS.minBet)) throw new GameError(`Ставка от ${CARDS.minBet} ₽`);
  if (b > cardsMaxBet(p)) throw new GameError(`На твоём уровне — не больше ${cardsMaxBet(p)} ₽`);
  if (p.money < b) throw new GameError('Не хватает денег');
  playLimit(p, 'cards', CARDS.perDay, now);
  p.money -= b;
  const deck: string[] = [];
  for (const su of SUITS) for (const r of RANKS) deck.push(r + su);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  p.cards = { deck, hand: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!], bet: b };
  if (cardValue(p.cards.hand) === 21) return cardsStand(p, now);
  return { ...cardsView(p.cards, false), done: false };
}

export function cardsHit(p: Player, now: number) {
  const c = p.cards;
  if (!c) throw new GameError('Раздачи нет');
  c.hand.push(c.deck.pop()!);
  if (cardValue(c.hand) > 21) {
    p.cards = null;
    return { ...cardsView(c, true), done: true, result: 'bust' as const, money: -c.bet };
  }
  if (cardValue(c.hand) === 21) return cardsStand(p, now);
  return { ...cardsView(c, false), done: false };
}

export function cardsStand(p: Player, _now: number) {
  const c = p.cards;
  if (!c) throw new GameError('Раздачи нет');
  while (cardValue(c.dealer) < 17) c.dealer.push(c.deck.pop()!);
  p.cards = null;
  const me = cardValue(c.hand);
  const him = cardValue(c.dealer);
  const natural = me === 21 && c.hand.length === 2;
  let result: 'win' | 'lose' | 'push';
  if (him > 21 || me > him) result = 'win';
  else if (me === him) result = 'push';
  else result = 'lose';
  const back = result === 'win' ? Math.round(c.bet * (natural ? CARDS.blackjack : CARDS.payout)) : result === 'push' ? c.bet : 0;
  p.money += back;
  return { ...cardsView(c, true), done: true, result, money: back - c.bet };
}

/** Тараканьи бега: победитель выбирается по шансам, клиент показывает забег. */
export function roachRace(p: Player, pick: string, bet: number, now: number, rng: Rng) {
  const roach = ROACHES.find((r) => r.id === pick);
  if (!roach) throw new GameError('Нет такого таракана');
  if (!RACE.bets.includes(bet)) throw new GameError('Ставка: 3, 5 или 10 бычков');
  if (p.butts < bet) throw new GameError('Не хватает бычков');
  playLimit(p, 'race', RACE.perDay, now);
  p.butts -= bet;
  let r = rng();
  let winner = ROACHES[ROACHES.length - 1];
  for (const x of ROACHES) {
    if ((r -= x.chance) < 0) {
      winner = x;
      break;
    }
  }
  const order = [winner.id, ...ROACHES.filter((x) => x.id !== winner.id).map((x) => x.id).sort(() => rng() - 0.5)];
  const won = winner.id === roach.id;
  const payout = won ? Math.round(bet * roach.payout) : 0;
  p.butts += payout;
  return { order, winner: winner.id, won, butts: payout - bet };
}

/** Сварить чифир: quality — насколько точно снял с огня (0..1). */
export function brew(p: Player, quality: number, now: number) {
  playLimit(p, 'brew', BREW.perDay, now, BREW.cooldownMin);
  const q = Math.max(0, Math.min(1, Number(quality) || 0));
  const energy = Math.round(BREW.minEnergy + (BREW.maxEnergy - BREW.minEnergy) * q);
  p.energy += energy;
  return { energy, quality: q };
}
