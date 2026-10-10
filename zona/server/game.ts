// Игровая логика. Функции чистые относительно хранилища: получают игрока,
// меняют его и возвращают результат. Время и случайность передаются снаружи,
// чтобы всё можно было проверить тестами.

import type { DailyState, Look, Quest, QuestState } from '../shared/types.ts';
import {
  BALANCE,
  BOSSES,
  CHURCH,
  PULLUPS,
  WEEKLY_EVENTS,
  TATTOOS,
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
  SETS,
  UPGRADE,
  upgradeCost,
  type Item,
  jobById,
  packById,
  offerOfDay,
  tattooById,
  trainCost,
  xpToNext,
  type Bonus,
  type Slot,
  type Stat,
  type StarPack,
  activeThemes,
  cellView,
} from '../shared/content.ts';

import { battleAct, battleAuto, battleControls, battleResult, fight, newBattle, npcPerks, type BattleAction, type BattleState, type Fighter, type FightResult, type Round } from './combat.ts';
import { chapterOf } from '../shared/story.ts';
import { ARM, BREW, CARDS, DARTS, DICE, RACE, ROACHES, RANKS, SUITS, cardValue, dartPoints } from '../shared/minigames.ts';
import { SHIZO, SHIZO_CARDS, TOURNEY, shizoCardById, type ShizoStat } from '../shared/minigames2.ts';
import { BEADS, BELT, CHESS, DOMINO, FISH, NARDY, PUZZLES, SPEED, allTiles, fits, isMateMove, nardyLand, nardyStep, puzzleById, speedButts, type NardyPick, type Tile } from '../shared/minigames2.ts';
import { ANTICHEAT, RUNS, impossible, tooPerfect } from '../shared/anticheat.ts';
import { TUTORIAL, TUT_BUTTS, TUT_GIFT } from '../shared/tutorial.ts';
import { weatherAt, weatherFor, weatherFx } from '../shared/weather.ts';
import { WORD, markGuess, normWord, wordOfDay } from '../shared/fenya.ts';
import { PET, petByKind, type PetKind } from '../shared/pets.ts';
import { colonyById, colonyFx, type ColonyId } from '../shared/colonies.ts';
import { TRADE, type TradeKind, type TradeLine } from '../shared/trade.ts';
import { WALL_MAX, albumById, albumProgress, type AlbumId } from '../shared/album.ts';
import { liveById, type LiveEffects, type LiveRun } from '../shared/live.ts';
import { LEAGUE, LEAGUE_TIERS, REVENGE, leaguePoints, leagueTier, powerOf } from '../shared/league.ts';
import { DAILY_WEEK, INTRO, MAST_RULES, NOTICE_KINDS, NOTIFY, TERM, mastById, termDays, type Mast, type NoticeKind } from '../shared/term.ts';
import { PLACE_REP, placeById, type PlaceId } from '../shared/places.ts';
import { CLAN_BOSS, CLAN_WAR, HUT, PARCEL, REFERRAL, RING, refDonateGold, type HutId } from '../shared/clans.ts';
import { CHAT, phraseById, SYSTEM_PHRASES } from '../shared/chat.ts';
import { ACTION_UNLOCK, UNLOCKS, unlockById } from '../shared/unlocks.ts';
import { BARRACK, barrackBonus, barrackById, raidPts, type BarrackBonus } from '../shared/barracks.ts';
import { INK, inkQuality } from '../shared/ink.ts';
import { RIOT } from '../shared/riot.ts';
import { FOOT, resolveKick } from '../shared/football.ts';
import { CONTRA, HIDE_SPOTS, goodById, goodPrice, shmonTonight, type GoodId } from '../shared/contra.ts';
import { TUNNEL } from '../shared/tunnel.ts';
import { FAMILY, FAMILY_ROUNDS, familyOutcome, type Visitor } from '../shared/family.ts';
import { MALYAVA, malyavaById } from '../shared/malyava.ts';
import { PENPAL, PENPAL_GIRLS, PEN_ENDINGS, PEN_LETTERS, penEnding, type PenEnding } from '../shared/penpal.ts';
import { COURT, courtArgById, courtChance, type ArgId } from '../shared/court.ts';
import { BUILD, buildBonus, type BuildBonus } from '../shared/build.ts';
import { EGG, holidayAt, holidayById, type HolKind, type HolidayRun } from '../shared/holidays.ts';
import { PASS, SEASON_PTS, cosmeticById, passReward, seasonEndsAt, seasonIndex, seasonTheme } from '../shared/season.ts';
import { CRAFT, MATS, PLACE_MATS, matById, recipeById, type MatId } from '../shared/craft.ts';
import { DEBT, FACTIONS, OBSHAK, REP_RULES, factionById, repRank, type FactionId } from '../shared/factions.ts';
import { DUO, ESCAPE, ESCAPE_STAGES, EVENTS, EVENT_TIMING, MEDIC, VISIT, escapeReward, eventById, eventFits, needFail, type Effects } from '../shared/events.ts';
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
  /** партии в нарды и домино, текущий этюд */
  tables: {
    nardy?: { bet: number; me: number; him: number; dice: [number, number]; hisLast: [number, number] | null };
    domino?: { bet: number; hand: Tile[]; ai: Tile[]; bone: Tile[]; chain: Tile[]; last: string };
    chess?: string;
    shizo?: { day: number; heat: number; food: number; spirit: number; card: string; seen: string[] };
  };
  /** Режим бога (только админ): без трат и откатов; реальные ресурсы сохранены и вернутся. */
  god: { on: boolean; saved: { money: number; gold: number; energy: number; butts: number; chifir: number } | null };
  /** Текущая драка (пошаговая) — переживает перезапуск приложения. */
  battle: {
    kind: 'boss' | 'pvp';
    bossId: string | null;
    targetId: number | null;
    loot: number;
    /** сила соперника к твоей (для очков лиги); null — бот */
    ratio?: number | null;
    /** месть: время того наезда, за который мстим */
    revenge?: number | null;
    enemy: { name: string; npc?: string; look?: Look };
    st: BattleState;
    at: number;
  } | null;
  event: { id: string; until: number } | null;
  eventAt: number;
  /** продолжение цепочки случаев, придёт после eventAt */
  chain: string | null;
  /** откаты занятий в местах: «место.занятие» → когда снова можно */
  placeCd: Record<string, number>;
  /** репутация у братвы, работяг и администрации */
  rep: Record<FactionId, number>;
  obshakAskAt: number;
  /** чат: когда писал и сколько за день */
  chat: { at: number; day: string; n: number };
  /** материалы для ремесла */
  mats: Partial<Record<MatId, number>>;
  /** долг барыге или катале; счётчик тикает после due */
  debt: { amount: number; due: number; from: 'baryga' | 'katala'; counted: number; base?: number } | null;
  yardAt: number;
  escape: { cdUntil: number; run: { stage: number; at: number } | null; best: number };
  medBedAt: number;
  noteDay: string;
  daily: DailyState;
  quests: QuestState;
  clanId: number | null;
  clanLevel: number;
  /** постройки хаты клана (копия с клана) */
  clanHut: Partial<Record<HutId, number>>;
  clanHitAt: number;
  /** очки войны кланов за неделю */
  war: { week: number; pts: number };
  warClaimed: number;
  respect: Record<string, string>;
  /** Надетые боевые перки (до PERK_SLOTS). */
  perks: string[];
  /** Расходники на поясе (до CONSUMABLE_SLOTS) и запас в мешке. */
  belt: string[];
  stash: Record<string, number>;
  bossCd: Record<string, number>;
  /** день последнего золота с босса: золото — только за первую победу в сутки */
  bossGold: Record<string, string>;
  /** масть: выбирается с 5 уровня, даёт свои бонусы */
  mast: Mast | null;
  /** ступени улучшения вещей у мастера */
  upgrades: Record<string, number>;
  /** номер ходки и сколько дней осталось до УДО */
  hodka: number;
  term: number;
  /** шаг вступления-этапирования; −1 — пройдено */
  intro: number;
  /** уведомления от бота: включены ли, сколько за сегодня, когда какое слали */
  notify: { on: boolean; day: string; n: number; last: Record<string, number>; off: string[] };
  pvpAt: number;
  shieldUntil: number;
  worldHitAt: number;
  refBy: number | null;
  /** золото с покупок подтянутых кентов: всего и по каждому */
  refEarn: { total: number; by: Record<string, number> };
  refCount: number;
  /** за какие уровни этого игрока уже заплатили тому, кто подтянул */
  refPaid: number[];
  parcels: { day: string; n: number };
  /** сезон: очки, забранные уровни пропуска, куплен ли пропуск */
  season: { id: number; pts: number; free: number[]; paid: number[]; pass: boolean };
  cosmetics: string[];
  /** какие открытия игрок уже видел (окно «Открыто новое») */
  unlocksSeen: string[];
  frame: string | null;
  title: string | null;
  offerDay: number;
  starsSpent: number;
  /** начатые мини-игры: когда сервер засёк старт (защита от накруток) */
  runs: Record<string, { at: number; delay: number }>;
  /** обучение первых минут: шаг (-1 — пройдено или пропущено) и прогресс шага */
  tut: number;
  tutN: number;
  /** лига наездов: очки за неделю и за какую неделю забрана награда */
  league: { week: number; pts: number; wins: number; claimed: number; last: { week: number; pts: number } | null };
  /** кто на меня наезжал: повтор боя и можно отомстить */
  attacks: AttackRec[];
  /** боссы, которых побеждал хоть раз (трофеи), и что висит на стене хаты */
  trophies: string[];
  wall: string[];
  albums: string[];
  /** побег вдвоём: идущий забег и приглашение от кента */
  /** питомец в хате */
  pet: { kind: PetKind; name: string; level: number; xp: number; fedAt: number; trainAt: number } | null;
  /** праздник: прогресс заданий, валюта, покупки; сбрасывается с новым праздником */
  /** сколько очков вложил в стройку зоны */
  built: number;
  /** кольщик: своя машинка, опыт, очередь заказов */
  ink: { skill: number; jobs: number; stars: number; votes: number; queue: { id: number; client: number; clientName: string; tattoo: string; paid: number; at: number }[] } | null;
  /** свой заказ у кольщика */
  inkOrder: { artist: number; artistName: string; tattoo: string; at: number; id: number; done: boolean; quality: number; rated: boolean } | null;
  /** контрабанда: что держишь, почём брал; день последнего шмона */
  contra: { have: Partial<Record<GoodId, number>>; spent: number; earned: number; shmonDay: number };
  /** футбол: какую неделю уже забрал награду */
  footClaimed: number;
  /** когда последний раз бил ОМОН на бунте */
  riotAt: number;
  /** подкоп: один за ходку */
  tunnel: { hodka: number; depth: number; digAt: number; masked: number; found: number; done: boolean };
  /** свиданка с роднёй: раз в неделю */
  family: { week: number; who: Visitor; rounds: number[]; picks: number[]; mood: number; done: boolean; buffUntil: number; buffPct: number };
  /** входящие малявы */
  inbox: { id: number; from: number; fromName: string; msg: string; butts: number; at: number; read: boolean }[];
  /** заочница: переписка с концовками, одна за ходку */
  penpal: { hodka: number; name: string; scam: boolean; step: number; love: number; suspect: number; paid: number; nextAt: number; ending: PenEnding | null; picks: number[] } | null;
  /** апелляция: одна за ходку */
  appeal: { hodka: number; args: string[]; done: boolean; won: boolean; delta: number };
  hol: { id: string; key: number; prog: number[]; claimed: boolean[]; tokens: number; day: number; bought: Record<string, number>; tree: boolean; armBest: number; eggAt: number };
  /** слово дня: попытки сегодня и серия дней подряд */
  word: { day: number; guesses: string[]; done: boolean; won: boolean };
  wordStreak: { n: number; last: number; best: number };
  /** колония этой ходки */
  colony: ColonyId;
  duo: string | null;
  /** турнир за столами: партий начато сегодня, за какую неделю забран приз */
  duelsDay: { day: string; n: number };
  tourneyClaimed: number;
  /** обмены за сегодня */
  tradesDay: { day: string; n: number };
  duoInvite: { run: string; from: number; name: string; at: number } | null;
  /** кого сегодня уже били — не больше двух раз одного */
  pvpDay: { day: string; hits: Record<string, number> };
  /** подозрение в накрутке: счёт остывает со временем, журнал — для админа */
  sus: { score: number; at: number; log: { t: number; game: string; why: string }[] };
  banned: boolean;
  journal: JournalEntry[];
  createdAt: number;
  lastSeen: number;
}

export type { Fighter, Round, FightResult } from './combat.ts';

export interface AttackRec {
  at: number;
  by: number;
  name: string;
  look: Look;
  /** наехавший победил */
  won: boolean;
  loot: number;
  avenged: boolean;
  /** повтор с точки зрения того, на кого наехали: он слева */
  replay: { rounds: Round[]; startHp: [number, number]; maxHp: [number, number] };
}

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
    tables: {},
    story: { ch: 0, step: 0, progress: 0 },
    cards: null,
    event: null,
    eventAt: now + 5 * MIN,
    chain: null,
    placeCd: {},
    rep: { brat: 0, work: 0, admin: 0 },
    obshakAskAt: 0,
    chat: { at: 0, day: '', n: 0 },
    debt: null,
    mats: {},
    yardAt: 0,
    escape: { cdUntil: 0, run: null, best: 0 },
    medBedAt: 0,
    noteDay: '',
    daily: { day: '', tasks: [], bonusClaimed: false },
    quests: { board: [], active: null },
    clanId: null,
    clanLevel: 0,
    clanHut: {},
    clanHitAt: 0,
    war: { week: 0, pts: 0 },
    warClaimed: 0,
    respect: {},
    bossCd: {},
    bossGold: {},
    mast: null,
    upgrades: {},
    hodka: 1,
    term: termDays(1),
    intro: 0,
    notify: { on: true, day: '', n: 0, last: {}, off: [] },
    pvpAt: 0,
    shieldUntil: 0,
    worldHitAt: 0,
    refBy: null,
    refEarn: { total: 0, by: {} },
    refCount: 0,
    refPaid: [],
    parcels: { day: '', n: 0 },
    season: { id: seasonIndex(now), pts: 0, free: [], paid: [], pass: false },
    cosmetics: [],
    unlocksSeen: [],
    frame: null,
    title: null,
    offerDay: -1,
    starsSpent: 0,
    runs: {},
    tut: 0,
    tutN: 0,
    league: { week: 0, pts: 0, wins: 0, claimed: 0, last: null },
    attacks: [],
    trophies: [],
    wall: [],
    albums: [],
    colony: 'general',
    word: { day: 0, guesses: [], done: false, won: false },
    pet: null,
    built: 0,
    penpal: null,
    inbox: [],
    riotAt: 0,
    footClaimed: -1,
    contra: { have: {}, spent: 0, earned: 0, shmonDay: -1 },
    tunnel: { hodka: 0, depth: 0, digAt: 0, masked: 0, found: 0, done: false },
    family: { week: -1, who: 'mom', rounds: [], picks: [], mood: 0, done: false, buffUntil: 0, buffPct: 0 },
    ink: null,
    inkOrder: null,
    appeal: { hodka: 0, args: [], done: false, won: false, delta: 0 },
    hol: { id: '', key: 0, prog: [], claimed: [], tokens: 0, day: -1, bought: {}, tree: false, armBest: 0, eggAt: 0 },
    wordStreak: { n: 0, last: 0, best: 0 },
    duo: null,
    duoInvite: null,
    tradesDay: { day: '', n: 0 },
    duelsDay: { day: '', n: 0 },
    tourneyClaimed: 0,
    pvpDay: { day: '', hits: {} },
    sus: { score: 0, at: now, log: [] },
    banned: false,
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
  p.bossGold ??= {};
  p.mast ??= null;
  p.upgrades ??= {};
  p.hodka ??= 1;
  p.term ??= termDays(p.hodka);
  p.intro ??= -1; // старые игроки вступление уже прожили
  p.notify ??= { on: true, day: '', n: 0, last: {}, off: [] };
  p.notify.off ??= [];
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
  p.tables ??= {};
  p.story ??= { ch: 0, step: 0, progress: 0 };
  p.cards ??= null;
  p.event ??= null;
  p.eventAt ??= 0;
  p.chain ??= null;
  p.placeCd ??= {};
  p.rep ??= { brat: 0, work: 0, admin: 0 };
  p.obshakAskAt ??= 0;
  p.chat ??= { at: 0, day: '', n: 0 };
  p.refPaid ??= [];
  p.parcels ??= { day: '', n: 0 };
  p.season ??= { id: seasonIndex(Date.now()), pts: 0, free: [], paid: [], pass: false };
  p.cosmetics ??= [];
  // кто играл до открытий по уровням — всё уже открытое считаем увиденным, без вороха окон
  p.unlocksSeen ??= UNLOCKS.filter((u) => u.level <= p.level).map((u) => u.id);
  p.frame ??= null;
  p.title ??= null;
  p.offerDay ??= -1;
  p.runs ??= {};
  // кто играл до обучения — оно ему не нужно
  p.tut ??= -1;
  p.tutN ??= 0;
  p.league ??= { week: 0, pts: 0, wins: 0, claimed: 0, last: null };
  p.attacks ??= [];
  // кто бил боссов до трофеев — трофеи по золоту за первую победу
  p.trophies ??= Object.keys(p.bossGold ?? {});
  p.wall ??= [];
  p.albums ??= [];
  p.duo ??= null;
  p.colony ??= 'general';
  p.word ??= { day: 0, guesses: [], done: false, won: false };
  p.pet ??= null;
  p.built ??= 0;
  p.penpal ??= null;
  p.refEarn ??= { total: 0, by: {} };
  p.inbox ??= [];
  p.riotAt ??= 0;
  p.footClaimed ??= -1;
  p.contra ??= { have: {}, spent: 0, earned: 0, shmonDay: -1 };
  p.tunnel ??= { hodka: 0, depth: 0, digAt: 0, masked: 0, found: 0, done: false };
  p.family ??= { week: -1, who: 'mom', rounds: [], picks: [], mood: 0, done: false, buffUntil: 0, buffPct: 0 };
  p.ink ??= null;
  p.inkOrder ??= null;
  p.appeal ??= { hodka: 0, args: [], done: false, won: false, delta: 0 };
  p.hol ??= { id: '', key: 0, prog: [], claimed: [], tokens: 0, day: -1, bought: {}, tree: false, armBest: 0, eggAt: 0 };
  p.wordStreak ??= { n: 0, last: 0, best: 0 };
  p.tradesDay ??= { day: '', n: 0 };
  p.duelsDay ??= { day: '', n: 0 };
  p.tourneyClaimed ??= 0;
  p.duoInvite ??= null;
  p.pvpDay ??= { day: '', hits: {} };
  p.sus ??= { score: 0, at: 0, log: [] };
  p.banned ??= false;
  p.debt ??= null;
  p.mats ??= {};
  p.yardAt ??= 0;
  p.escape ??= { cdUntil: 0, run: null, best: 0 };
  p.medBedAt ??= 0;
  p.noteDay ??= '';
  p.daily ??= { day: '', tasks: [], bonusClaimed: false };
  p.quests ??= { board: [], active: null };
  p.clanId ??= null;
  p.clanLevel ??= 0;
  p.clanHut ??= {};
  p.clanHitAt ??= 0;
  p.war ??= { week: 0, pts: 0 };
  p.warClaimed ??= 0;
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
  const add = (b: Bonus, k = 1) => {
    for (const key of Object.keys(total) as (keyof Bonus)[]) total[key] += Math.round((b[key] ?? 0) * k);
  };
  // вещь работает только с её уровня: после выхода по УДО старый шмот ждёт, пока дорастёшь
  const worn = Object.values(p.equipped)
    .map((id) => (id ? itemById.get(id) : undefined))
    .filter((i): i is Item => !!i && i.minLevel <= p.level);
  for (const i of worn) add(i, 1 + ((p.upgrades[i.id] ?? 0) * UPGRADE.perLevel) / 100);
  for (const id of p.tattoos) {
    const t = tattooById.get(id);
    if (t) add(t);
  }
  for (const id of p.furniture) {
    const f = furnitureById.get(id);
    if (f) add(f);
  }
  // тема хаты: вещи одного стиля в сцене
  for (const t of activeThemes(cellView(p.furniture, p.cellShow))) add(t.bonus);
  // комплекты: за две вещи и за полный набор
  const ids = new Set(worn.map((i) => i.id));
  for (const set of SETS) {
    const n = set.items.filter((id) => ids.has(id)).length;
    if (n >= 2) add(set.two);
    if (n >= set.items.length) add(set.full);
  }
  return total;
}

/** Улучшить вещь у мастера на промке. */
export function upgradeItem(p: Player, itemId: string) {
  const item = itemById.get(itemId);
  if (!item || !p.inventory.includes(itemId)) throw new GameError('Нет в инвентаре');
  const lvl = p.upgrades[itemId] ?? 0;
  if (lvl >= UPGRADE.max) throw new GameError('Лучше уже не сделать');
  const cost = upgradeCost(item, lvl);
  spend(p, cost.amount, cost.currency);
  p.upgrades[itemId] = lvl + 1;
  return { level: lvl + 1, cost };
}

/** Бонус масти в процентах или очках (0 — масти нет). */
export function mastBonus(p: Player, k: keyof NonNullable<ReturnType<typeof mastById.get>>['bonus']): number {
  return (p.mast ? mastById.get(p.mast)?.bonus[k] : 0) ?? 0;
}

/** Бонус за отсиженные ходки: % к деньгам и опыту. */
export function hodkaBonus(p: Player): number {
  return Math.min(TERM.maxHodkaBonus, p.hodka - 1) * TERM.bonusPerHodka;
}

/** Скостить срок: дела сокращают дни до УДО (отрицательное — добавить). */
/** Репутация: своя масть растит быстрее, соперник теряет часть. */
export function gainRep(p: Player, id: FactionId, amount: number): number {
  const f = factionById.get(id)!;
  let n = amount;
  if (n > 0 && p.mast && f.mast.includes(p.mast)) n *= REP_RULES.mastMul;
  if (n > 0) n *= liveFx(clock.now()).rep ?? 1;
  if (n > 0) n *= colonyFx(p.colony).rep?.[id] ?? 1;
  n = Math.round(n);
  p.rep[id] = Math.max(0, p.rep[id] + n);
  if (n > 0 && f.rival) p.rep[f.rival] = Math.max(0, p.rep[f.rival] - Math.round(n * REP_RULES.rivalShare));
  return n;
}

/** Бонус от званий у сил зоны, %. */
export function repBonus(p: Player, key: 'pvpLoot' | 'jobMoney' | 'questMoney'): number {
  let sum = 0;
  for (const f of FACTIONS) if (f.perRank.key === key) sum += repRank(p.rep[f.id]) * f.perRank.pct;
  return sum;
}

export function serve(p: Player, days: number) {
  // «Твёрдо стал на путь исправления»: администрация скашивает срок быстрее
  if (days > 0 && repRank(p.rep?.admin ?? 0) >= 3) days *= 1.15;
  p.term = Math.max(0, Math.round((p.term - days) * 1000) / 1000);
}

/** Бонус построек хаты клана. */
export function hutBonus(p: Player, k: 'energy' | 'atk' | 'money' | 'def'): number {
  let sum = 0;
  for (const h of HUT) sum += (p.clanId ? (p.clanHut[h.id] ?? 0) : 0) * (h.bonus[k] ?? 0);
  return sum;
}

export function stats(p: Player, now: number) {
  const b = bonuses(p);
  const vip = isVip(p, now);
  return {
    atk: Math.round((5 + p.str * 3 + b.atk) * (1 + (mastBonus(p, 'atk') + hutBonus(p, 'atk') + zoneB('atk') + barB(p, 'atk')) / 100)),
    def: Math.round((p.agi * 2 + b.def) * (1 + (hutBonus(p, 'def') + zoneB('def') + barB(p, 'def')) / 100)),
    maxHp: Math.round((80 + p.end * 12 + b.hp) * (1 + petPower(p, 'cat', now) * 0.02 + (zoneB('hp') + barB(p, 'hp')) / 100)),
    crit: Math.min(40, 2 + Math.floor(p.agi * 0.3) + b.crit + mastBonus(p, 'crit') + (p.blessUntil > now ? CHURCH.blessCrit : 0)),
    maxEnergy: BALANCE.baseEnergy + b.energy + mastBonus(p, 'energy') + (vip ? BALANCE.vipEnergyBonus : 0) + p.clanLevel * CLAN.energyPerLevel + hutBonus(p, 'energy') + zoneB('energy') + barB(p, 'energy'),
    moneyBonus: b.money + hutBonus(p, 'money') + hodkaBonus(p) + (vip ? BALANCE.vipMoneyBonus : 0) + p.clanLevel * CLAN.moneyPerLevel + (p.blessUntil > now ? CHURCH.blessMoney : 0) + zoneB('money') + barB(p, 'money'),
  };
}

/** Восстановление энергии и здоровья по прошедшему времени. */
export function tick(p: Player, now: number): void {
  const s = stats(p, now);
  const regenSec = BALANCE.energyRegenSec / (isVip(p, now) ? 2 : 1) / (weeklyEvent(now).id === 'amnesty' ? 1.5 : 1) / (liveFx(now).energy ?? 1) / (colonyFx(p.colony).energy ?? 1);
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
  debtCounter(p, now);
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
  serve(p, amount * TERM.perEnergy);
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

export function addXp(p: Player, xp0: number, now: number): number {
  const xp = Math.round(xp0 * (1 + hodkaBonus(p) / 100) * (xp0 > 0 ? (liveFx(now).xp ?? 1) : 1));
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
  const money = Math.round(roll(rng, job.money) * (1 + (stats(p, now).moneyBonus + mastBonus(p, 'jobMoney') + repBonus(p, 'jobMoney') + famBuff(p, now)) / 100) * (riotPenalty.until > now ? RIOT.penaltyJob : 1) * (bonus ? 2 : 1) * (liveFx(now).money ?? 1) * (colonyFx(p.colony).jobMoney ?? 1));
  // налог смотрящего со смены — в стройку зоны
  const tax = zoneTax.rate > 0 ? Math.floor((money * zoneTax.rate) / 100) : 0;
  zoneTax.pending += tax;
  p.money += money - tax;
  let item: string | null = null;
  if (rng() < 0.05) {
    item = rollConsumable(rng);
    giveItem(p, item);
  }
  const xp = Math.round(job.xp * (1 + (mastBonus(p, 'jobXp') + petPower(p, 'pigeon', now) + zoneB('jobXp') + barB(p, 'jobXp') + famBuff(p, now)) / 100));
  const levelUps = addXp(p, xp, now);
  track(p, 'job');
  gainRep(p, 'work', 1);
  const mats = rng() < CRAFT.jobChance ? giveMats(p, { [rollMat(rng)]: 1 }) : {};
  const found = liveFind(p, now, rng) ?? petFind(p, now, rng);
  return { money: money - tax, tax, xp, levelUps, bonus, item, mats, found };
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
  return { name: boss.name, hp: boss.hp, maxHp: boss.hp, atk: boss.atk, def: boss.def, crit: 5, perks: boss.perks ?? npcPerks(boss.minLevel + 2, bossIdx * 7 + 1) };
}

function noBattle(p: Player) {
  if (p.battle) throw new GameError('Сначала закончи текущую драку');
}

/** Начать бой с боссом: энергия списывается сразу, дальше — ходы игрока. */
export function bossStart(p: Player, bossId: string, now: number) {
  const boss = bossById.get(bossId);
  if (!boss) throw new GameError('Нет такого босса');
  if (boss.colony && boss.colony !== p.colony) throw new GameError('Этот босс — на другой зоне');
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
  p.bossCd[bossId] = now + boss.cooldownMin * MIN * (result.win ? 1 : 0.25) * (1 - mastBonus(p, 'bossCd') / 100);

  const reward = { money: 0, xp: 0, authority: 0, gold: 0, drop: null as string | null, item: null as string | null, levelUps: 0 };
  if (result.win) {
    reward.money = Math.round(roll(rng, boss.reward.money) * (1 + stats(p, now).moneyBonus / 100) * (weeklyEvent(now).id === 'search' ? 1.5 : 1) * (1 + result.lootBonus / 100) * (liveFx(now).money ?? 1));
    if (rng() < BOSS_ITEM_CHANCE) {
      reward.item = rollConsumable(rng);
      giveItem(p, reward.item);
    }
    reward.xp = boss.reward.xp;
    reward.authority = Math.round(boss.reward.authority * (1 + mastBonus(p, 'authority') / 100) * (colonyFx(p.colony).authority ?? 1));
    serve(p, TERM.bossWin);
    // золото — только за первую победу над этим боссом за сутки, иначе фарм обесценивает донат
    reward.gold = p.bossGold[bossId] === dayKey(now) ? 0 : roll(rng, boss.reward.gold);
    if (reward.gold > 0) p.bossGold[bossId] = dayKey(now);
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
    if (!p.trophies.includes(bossId)) p.trophies.push(bossId);
    track(p, 'boss');
    if (rng() < CRAFT.bossChance) giveMats(p, { [rollMat(rng)]: 1 });
    liveFind(p, now, rng);
    petFind(p, now, rng);
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
export function pvpStart(p: Player, target: Player | null, now: number, rng: Rng, revenge: number | null = null) {
  if (p.pvpAt + BALANCE.pvpCooldownSec * 1000 > now) throw new GameError('Отдышись немного');
  noBattle(p);
  requireHp(p, now);
  spendEnergy(p, BALANCE.pvpEnergy, now);
  p.pvpAt = now;
  let enemy: Fighter;
  let loot: number;
  let enemyLook: Look;
  let ratio: number | null = null;
  if (target) {
    // Защищающийся бьётся в полную силу: оффлайн-игрока не обижаем на израненном здоровье.
    tick(target, now);
    enemy = { ...fighter(target, now), hp: stats(target, now).maxHp, items: [] };
    loot = Math.min(Math.floor(target.money * BALANCE.pvpStealShare), target.level * 300);
    enemyLook = lookOf(target);
    ratio = power(target, now) / Math.max(1, power(p, now));
  } else {
    const bot = botOpponent(p.level, rng);
    enemy = bot;
    loot = bot.money;
    enemyLook = bot.look;
  }
  p.battle = { kind: 'pvp', bossId: null, targetId: target?.id ?? null, loot, ratio, revenge, enemy: { name: enemy.name, look: enemyLook }, st: newBattle(fighter(p, now), enemy), at: now };
  return battleView(p);
}

export function pvpFinish(p: Player, target: Player | null, loot0: number, result: FightResult, now: number, rng: Rng, ratio: number | null = null, revenge: number | null = null) {
  let loot = loot0;
  // месть: очки лиги вдвойне и можно вернуть отжатое
  const rec = revenge !== null && target ? p.attacks.find((a) => a.at === revenge && a.by === target.id) : null;
  if (rec) loot = Math.max(loot, rec.loot);
  const league = leagueAdd(p, result.win, target ? ratio : null, now, rec ? REVENGE.leagueMul : 1);
  if (target) {
    const day = dayKey(now);
    if (p.pvpDay.day !== day) p.pvpDay = { day, hits: {} };
    p.pvpDay.hits[target.id] = (p.pvpDay.hits[target.id] ?? 0) + 1;
  }
  spendItems(p, result.used);
  p.hp = result.hpLeft;
  let item: string | null = null;
  p.hpAt = now;
  let authority = 0;
  let xp = 0;
  if (result.win) {
    authority = Math.round((3 + Math.floor(rng() * 6)) * (weeklyEvent(now).id === 'tournament' ? 2 : 1) * (1 + mastBonus(p, 'authority') / 100) * (colonyFx(p.colony).authority ?? 1));
    serve(p, TERM.pvpWin);
    xp = 8 + p.level * 2;
    if (target) loot = Math.min(loot, Math.max(0, target.money));
    loot = Math.round(loot * (1 + (result.lootBonus + mastBonus(p, 'pvpLoot') + repBonus(p, 'pvpLoot')) / 100) * (colonyFx(p.colony).pvpLoot ?? 1));
    p.money += loot;
    p.authority += authority;
    if (rng() < PVP_ITEM_CHANCE) {
      item = rollConsumable(rng);
      giveItem(p, item);
    }
    track(p, 'pvpWin');
    gainRep(p, 'brat', 2);
    p.wins += 1;
    if (target) {
      target.money = Math.max(0, target.money - loot);
      target.losses += 1;
      target.shieldUntil = now + 15 * MIN;
      log(target, now, rec ? `😤 ${p.name} отомстил и забрал ${loot} ₽` : `🥊 ${p.name} наехал и отжал ${loot} ₽`);
    }
    if (rec) log(p, now, `😤 Отомстил ${target!.name}: вернул ${loot} ₽`);
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
  if (target && !rec) recordAttack(target, p, result, loot, now);
  const levelUps = addXp(p, xp, now);
  return { ...result, loot, authority, xp, levelUps, item, league, revenge: !!rec };
}

/** Запомнить наезд у того, на кого наехали: повтор и право отомстить. */
function recordAttack(target: Player, by: Player, result: FightResult, loot: number, now: number) {
  const rec: AttackRec = {
    at: now,
    by: by.id,
    name: by.name,
    look: lookOf(by),
    won: result.win,
    loot: result.win ? loot : 0,
    avenged: false,
    // в повторе защищающийся — слева: стороны меняются местами
    replay: {
      rounds: (result.rounds ?? []).map((r) => ({ ...r, by: (r.by === 0 ? 1 : 0) as 0 | 1 })),
      startHp: [result.startHp?.[1] ?? 0, result.startHp?.[0] ?? 0],
      maxHp: [result.maxHp?.[1] ?? 1, result.maxHp?.[0] ?? 1],
    },
  };
  target.attacks = [rec, ...target.attacks].slice(0, REVENGE.keep);
}

/** Можно ли ещё отомстить за этот наезд. */
export function canAvenge(rec: AttackRec, now: number) {
  return rec.won && !rec.avenged && now - rec.at < REVENGE.hours * 60 * MIN;
}

/** Начать месть: бой с тем, кто наехал, — без щита и лимита «двух раз». Попытка одна. */
export function revengeStart(p: Player, at: number, target: Player | null, now: number, rng: Rng) {
  const rec = p.attacks.find((a) => a.at === at);
  if (!rec || !target || rec.by !== target.id) throw new GameError('Некому мстить');
  if (!canAvenge(rec, now)) throw new GameError(rec.avenged ? 'Уже мстил' : 'Поздно — дело остыло');
  const view = pvpStart(p, target, now, rng, at);
  rec.avenged = true;
  return view;
}

/** Наезд целиком автоматически (тесты). */
export function pvp(p: Player, target: Player | null, now: number, rng: Rng) {
  pvpStart(p, target, now, rng);
  const b = p.battle!;
  p.battle = null;
  battleAuto(b.st, rng);
  const r = pvpFinish(p, target, b.loot, battleResult(b.st), now, rng, b.ratio ?? null);
  return { ...r, enemy: b.enemy.name, enemyLook: b.enemy.look! };
}

export function claimDaily(p: Player, now: number) {
  const day = 24 * 60 * MIN;
  if (now - p.dailyAt < day) throw new GameError('Сегодня уже получал');
  // серия идёт по кругу 1…7: большой грев на седьмой день, потом новая неделя
  p.dailyStreak = now - p.dailyAt < 2 * day ? (p.dailyStreak % 7) + 1 : 1;
  p.dailyAt = now;
  const w = DAILY_WEEK[p.dailyStreak - 1];
  const money = Math.round((w.money ?? 0) * (1 + p.level / 5));
  const gold = w.gold ?? 0;
  p.money += money;
  p.gold += gold;
  p.butts += w.butts ?? 0;
  p.chifir += w.chifir ?? 0;
  if (w.item) giveItem(p, w.item);
  return { money, gold, butts: w.butts ?? 0, chifir: w.chifir ?? 0, item: w.item ?? null, streak: p.dailyStreak };
}

// --- Масть, срок, этапирование ---------------------------------------------------------

export function chooseMast(p: Player, id: string, now: number) {
  const m = mastById.get(id as Mast);
  if (!m) throw new GameError('Нет такой масти');
  if (p.level < MAST_RULES.minLevel) throw new GameError(`Масть выбирают с ${MAST_RULES.minLevel} уровня`);
  if (p.mast === m.id) throw new GameError('Ты и так в этой масти');
  let lost = 0;
  if (p.mast) {
    // перейти в другую масть — дорого и с потерей уважения
    spend(p, MAST_RULES.changeGold, 'gold');
    lost = Math.floor(p.authority * MAST_RULES.changeAuthorityLoss);
    p.authority -= lost;
  }
  p.mast = m.id;
  clampHp(p, now);
  log(p, now, `${m.emoji} Масть: ${m.name}`);
  return { mast: m.id, lost };
}

/** Выход по УДО: следующая ходка с нуля по уровню, но с бонусом к деньгам и опыту навсегда. */
export function release(p: Player, now: number, colony: string = 'general') {
  if (p.term > 0) throw new GameError(`До УДО ещё ${Math.ceil(p.term)} дн.`);
  noBattle(p);
  if (!colonyById.has(colony as ColonyId)) throw new GameError('Нет такой колонии');
  if (p.duo) throw new GameError('Сначала закончи побег с кентом');
  p.colony = colony as ColonyId;
  const done = p.hodka;
  const gold = TERM.releaseGold * done;
  p.hodka += 1;
  p.term = termDays(p.hodka);
  p.level = 1;
  p.xp = 0;
  p.str = 5;
  p.agi = 5;
  p.end = 5;
  p.statPoints = 0;
  p.money = 300;
  p.gold += gold;
  p.bossCd = {};
  p.escape = { cdUntil: 0, run: null, best: p.escape.best };
  const s = stats(p, now);
  p.hp = s.maxHp;
  p.hpAt = now;
  p.energy = Math.max(p.energy, s.maxEnergy);
  p.energyAt = now;
  log(p, now, `🔓 Вышел по УДО после ${done}-й ходки. Бонус ходок: +${hodkaBonus(p)}% к деньгам и опыту. Новый этап — ${colonyById.get(p.colony)!.name}`);
  return { hodka: p.hodka, gold, bonus: hodkaBonus(p), term: p.term, colony: p.colony };
}

/** Шаг вступления: выбор ответа в сцене этапирования. */
export function introStep(p: Player, choice: number, now: number) {
  const step = INTRO[p.intro];
  if (p.intro < 0 || !step) throw new GameError('Этап уже пройден');
  const o = step.options[choice];
  if (!o) throw new GameError('Нет такого ответа');
  p.money = Math.max(0, p.money + (o.money ?? 0));
  p.authority = Math.max(0, p.authority + (o.authority ?? 0));
  p.butts = Math.max(0, p.butts + (o.butts ?? 0));
  const levelUps = o.xp ? addXp(p, o.xp, now) : 0;
  p.intro = p.intro + 1 >= INTRO.length ? -1 : p.intro + 1;
  if (p.intro === -1) {
    giveItem(p, 'c_bandage');
    giveItem(p, 'c_sand');
    tutSkipDone(p, now);
  }
  return { reply: o.reply, money: o.money ?? 0, authority: o.authority ?? 0, butts: o.butts ?? 0, xp: o.xp ?? 0, levelUps, done: p.intro === -1 };
}

// --- Уведомления от бота ------------------------------------------------------------------

export function setNotify(p: Player, on: boolean) {
  p.notify.on = !!on;
  return { on: p.notify.on };
}

/** Включить или выключить один вид напоминаний. */
export function setNotifyKind(p: Player, kind: string, on: boolean) {
  if (!NOTICE_KINDS.some((k) => k.id === kind)) throw new GameError('Нет таких напоминаний');
  p.notify.off = on ? p.notify.off.filter((k) => k !== kind) : [...new Set([...p.notify.off, kind])];
  return { off: p.notify.off };
}

/** Можно ли написать игроку именно об этом. */
export function wantsNotice(p: Player, kind: NoticeKind, now: number): boolean {
  return canNotify(p, now) && !p.notify.off.includes(kind);
}

/** Час по Москве — для тихих часов. */
function mskHour(now: number): number {
  return new Date(now + 3 * 60 * MIN).getUTCHours();
}

/** Можно ли сейчас написать игроку: включено, не ночь, лимит на день, давно не в игре. */
export function canNotify(p: Player, now: number): boolean {
  if (!p.notify.on) return false;
  const h = mskHour(now);
  if (h >= NOTIFY.quietFrom || h < NOTIFY.quietTo) return false;
  if (now - p.lastSeen > NOTIFY.activeWithinDays * 24 * 60 * MIN) return false;
  if (now - p.lastSeen < 10 * MIN) return false; // и так в игре
  const day = dayKey(now);
  return p.notify.day !== day || p.notify.n < NOTIFY.maxPerDay;
}

export function markNotified(p: Player, kind: string, now: number) {
  const day = dayKey(now);
  if (p.notify.day !== day) p.notify = { ...p.notify, day, n: 0 };
  p.notify.n += 1;
  p.notify.last[kind] = now;
}

/** Что сказать игроку, если есть повод. Каждое напоминание — не чаще раза между заходами. */
export interface NoticeCtx {
  /** клановый босс сегодня ещё жив */
  clanBoss?: boolean;
  /** идёт событие зоны */
  live?: { startsAt: number; text: string } | null;
}

export function pendingNotice(p: Player, now: number, ctx: NoticeCtx = {}): { kind: NoticeKind; text: string } | null {
  if (!canNotify(p, now)) return null;
  const fresh = (kind: NoticeKind) => !p.notify.off.includes(kind) && (p.notify.last[kind] ?? 0) < p.lastSeen;
  const s = stats(p, now);
  const H = 60 * MIN;
  if (fresh('debt') && p.debt) {
    const left = p.debt.due - now;
    if (left <= 0) return { kind: 'debt', text: `💸 Долг просрочен — счётчик капает. Уже ${p.debt.amount} ₽. Отдай, пока не поставили на счётчик ещё.` };
    if (left <= NOTIFY.debtWarnH * H) return { kind: 'debt', text: `💸 Долг ${p.debt.amount} ₽ горит через ${Math.ceil(left / H)} ч. Не отдашь — включат счётчик.` };
  }
  if (fresh('live') && ctx.live && (p.notify.last.live ?? 0) < ctx.live.startsAt) return { kind: 'live', text: ctx.live.text };
  if (fresh('daily') && now - p.dailyAt >= 24 * 60 * MIN) {
    const w = DAILY_WEEK[(p.dailyStreak % 7)];
    return { kind: 'daily', text: `📦 Грев пришёл: ${w.label.toLowerCase()} ждёт в хате. Заходи, пока серия не сгорела.` };
  }
  if (fresh('energy') && p.energy >= s.maxEnergy) return { kind: 'energy', text: `⚡ Энергия полная (${p.energy}). Промка, боссы и поручения ждут.` };
  if (fresh('event') && p.event && p.event.until > now) {
    const ev = eventById.get(p.event.id);
    if (ev) return { kind: 'event', text: `❗ ${ev.name}: ${ev.text}` };
  }
  if (fresh('boss')) {
    const ready = BOSSES.filter((b) => (!b.colony || b.colony === p.colony) && b.minLevel <= p.level && (p.bossCd[b.id] ?? 0) <= now).pop();
    if (ready && (p.bossCd[ready.id] ?? 0) > p.lastSeen) return { kind: 'boss', text: `${ready.emoji} ${ready.name} оклемался. Самое время снова разобраться.` };
  }
  if (fresh('clanBoss') && ctx.clanBoss && p.clanId && dayKey(p.clanHitAt) !== dayKey(now))
    return { kind: 'clanBoss', text: `${CLAN_BOSS.emoji} Клан разбирается с беспредельщиками — подключайся, пока не добили без тебя.` };
  if (fresh('season') && seasonEndsAt(now) - now <= NOTIFY.seasonWarnDays * 24 * H) {
    const reached = Math.min(PASS.levels, Math.floor(p.season.pts / PASS.perLevel));
    const left = reached - p.season.free.filter((l) => l <= reached).length;
    if (p.season.id === seasonIndex(now) && left > 0) return { kind: 'season', text: `🏆 Сезон кончается через ${Math.ceil((seasonEndsAt(now) - now) / (24 * H))} дн. Не забрано наград: ${left}. Потом сгорят.` };
  }
  if (fresh('term') && p.term <= 0) return { kind: 'term', text: '🔓 Срок вышел! Можешь выйти по УДО и зайти следующей ходкой сильнее.' };
  return null;
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
export function checkPack(p: Player, packId: string, now = Date.now()): StarPack {
  const pack = packById.get(packId);
  if (!pack) throw new GameError('Нет такого товара');
  if (pack.id === 'starter' && p.starterBought) throw new GameError('Стартовый набор уже куплен');
  if (pack.pass) {
    ensureSeason(p, now);
    if (p.season.pass) throw new GameError('Пропуск этого сезона уже есть');
  }
  if (pack.cosmetic && p.cosmetics.includes(pack.cosmetic)) throw new GameError('Это уже твоё');
  if (pack.offer) {
    if (offerOfDay(now).id !== pack.id) throw new GameError('Предложение закончилось');
    if (p.offerDay === dayNum(now)) throw new GameError('Сегодня уже брал');
  }
  return pack;
}

const dayNum = (now: number) => Math.floor((now + 3 * 3600_000) / 86_400_000);

/** Забрать уровень пропуска: бесплатная дорожка — всем, платная — с пропуском. */
export function seasonClaim(p: Player, level: number, paid: boolean, now: number, rng: Rng) {
  ensureSeason(p, now);
  if (!(level >= 1 && level <= PASS.levels)) throw new GameError('Нет такого уровня');
  if (p.season.pts < level * PASS.perLevel) throw new GameError('Уровень ещё не открыт');
  if (paid && !p.season.pass) throw new GameError('Нужен пропуск сезона');
  const list = paid ? p.season.paid : p.season.free;
  if (list.includes(level)) throw new GameError('Уже забрал');
  list.push(level);
  const r = passReward(level, paid);
  if (r.rations) p.money += r.rations * ration(p);
  if (r.butts) p.butts += r.butts;
  if (r.gold) p.gold += r.gold;
  if (r.item) giveItem(p, r.item);
  if (r.chifir) p.chifir += r.chifir;
  if (r.mats) for (let i = 0; i < r.mats; i++) giveMats(p, { [rollMat(rng)]: 1 });
  if (r.cosmetic && !p.cosmetics.includes(r.cosmetic)) p.cosmetics.push(r.cosmetic);
  if (r.gear && !p.inventory.includes(r.gear)) p.inventory.push(r.gear);
  return { ...r, money: r.rations ? r.rations * ration(p) : 0 };
}

/** Надеть рамку или титул (или снять — id пустой). */
export function wearCosmetic(p: Player, kind: 'frame' | 'title', id: string) {
  if (!id) {
    if (kind === 'frame') p.frame = null;
    else p.title = null;
    return;
  }
  const c = cosmeticById.get(id);
  if (!c || c.kind !== kind || !p.cosmetics.includes(id)) throw new GameError('Этого у тебя нет');
  if (kind === 'frame') p.frame = id;
  else p.title = id;
}

/** Зачисление оплаченного пакета. Идемпотентность обеспечивает вызывающий код. */
export function applyPack(p: Player, pack: StarPack, now: number) {
  if (pack.gold) p.gold += pack.gold;
  if (pack.vipDays) {
    p.vipUntil = Math.max(p.vipUntil, now) + pack.vipDays * 24 * 60 * MIN;
  }
  if (pack.chifir) p.chifir += pack.chifir;
  if (pack.id === 'starter') p.starterBought = true;
  if (pack.pass) {
    ensureSeason(p, now);
    p.season.pass = true;
  }
  if (pack.cosmetic && !p.cosmetics.includes(pack.cosmetic)) p.cosmetics.push(pack.cosmetic);
  if (pack.offer) p.offerDay = dayNum(now);
  if (pack.items) for (const [id, n] of Object.entries(pack.items)) giveItem(p, id, n);
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

/** Удар по боссу клана: как по бунту, но свой откат. */
export function clanBossHit(p: Player, now: number, rng: Rng) {
  if (!p.clanId) throw new GameError('Ты не в клане');
  if (p.clanHitAt + CLAN_BOSS.cooldownSec * 1000 > now) throw new GameError('Удар ещё не готов');
  requireHp(p, now);
  spendEnergy(p, CLAN_BOSS.energy, now);
  p.clanHitAt = now;
  const s = stats(p, now);
  const crit = rng() * 100 < s.crit;
  return { damage: Math.round(s.atk * 4 * (0.85 + rng() * 0.3) * (crit ? 2 : 1)), crit };
}

// --- Открытия по уровням ------------------------------------------------------------------

/** Экшен закрыт до своего уровня. */
export function requireUnlock(p: Player, action: string) {
  const id = ACTION_UNLOCK[action];
  const u = id ? unlockById.get(id) : null;
  if (u && p.level < u.level) throw new GameError(`${u.emoji} ${u.name} — с ${u.level} уровня`);
}

/** Отметить открытия увиденными. */
export function seeUnlocks(p: Player, ids: string[]) {
  for (const id of ids) if (unlockById.has(id) && !p.unlocksSeen.includes(id)) p.unlocksSeen.push(id);
}

// --- Чат ------------------------------------------------------------------------------

/** Можно ли сказать фразу: только готовые, не чаще раза в несколько секунд и с дневным лимитом. */
export function chatSay(p: Player, phrase: string, now: number) {
  if (!phraseById.has(phrase) || SYSTEM_PHRASES.some((x) => x.id === phrase)) throw new GameError('Такой фразы нет');
  if (p.chat.at + CHAT.cooldownSec * 1000 > now) throw new GameError('Не части');
  const day = dayKey(now);
  if (p.chat.day !== day) p.chat = { at: 0, day, n: 0 };
  if (p.chat.n >= CHAT.perDay) throw new GameError('На сегодня наговорился');
  p.chat.at = now;
  p.chat.n++;
}

// --- Ринг ----------------------------------------------------------------------------

export interface RingFighter {
  id: number;
  name: string;
  level: number;
  look: Look;
  fee: number;
}
export interface RingMatch {
  id: number;
  a: RingFighter;
  b: RingFighter;
  startsAt: number;
  fee: number;
  bets: { pid: number; name: string; side: 'a' | 'b'; amount: number }[];
}
export interface RingDone extends RingMatch {
  winner: 'a' | 'b';
  replay: { win: boolean; log: string[]; rounds: Round[]; startHp: [number, number]; maxHp: [number, number] };
  pool: number;
}
export interface Ring {
  seq: number;
  queue: RingFighter[];
  cur: RingMatch | null;
  last: RingDone[];
}
export const emptyRing = (): Ring => ({ seq: 0, queue: [], cur: null, last: [] });

function ringNext(ring: Ring, now: number) {
  if (ring.cur || ring.queue.length < 2) return;
  const [a, b] = ring.queue.splice(0, 2);
  ring.cur = { id: ++ring.seq, a, b, startsAt: now + RING.delayMin * MIN, fee: a.fee + b.fee, bets: [] };
}

export function ringJoin(p: Player, ring: Ring, now: number) {
  if (p.level < RING.minLevel) throw new GameError(`Ринг — с ${RING.minLevel} уровня`);
  if (ring.queue.some((f) => f.id === p.id) || (ring.cur && (ring.cur.a.id === p.id || ring.cur.b.id === p.id))) throw new GameError('Ты уже записан');
  requireHp(p, now);
  const fee = RING.feeRations * ration(p);
  if (p.money < fee) throw new GameError('Нечем заплатить за выход');
  p.money -= fee;
  ring.queue.push({ id: p.id, name: p.name, level: p.level, look: lookOf(p), fee });
  ringNext(ring, now);
  return { fee, queued: ring.queue.length };
}

export function ringBet(p: Player, ring: Ring, side: 'a' | 'b', amount: number, now: number) {
  const m = ring.cur;
  if (!m || now >= m.startsAt) throw new GameError('Ставки не принимаются');
  if (m.a.id === p.id || m.b.id === p.id) throw new GameError('На свой бой ставить нельзя');
  if (m.bets.some((b) => b.pid === p.id)) throw new GameError('Ставка уже сделана');
  if (side !== 'a' && side !== 'b') throw new GameError('На кого?');
  const a = Math.floor(Number(amount));
  const max = RING.minBet + p.level * RING.betPerLevel;
  if (!(a >= RING.minBet)) throw new GameError(`Ставка от ${RING.minBet} ₽`);
  if (a > max) throw new GameError(`На твоём уровне — не больше ${max} ₽`);
  if (p.money < a) throw new GameError('Не хватает денег');
  p.money -= a;
  m.bets.push({ pid: p.id, name: p.name, side, amount: a });
  return { side, amount: a };
}

/**
 * Провести бой, если пора: бойцы бьются в полную силу, ставки — тотализатор (победители делят банк
 * пропорционально ставке, доля — на общак). load/save — работа с базой снаружи.
 * Возвращает, сколько ушло на общак.
 */
export function ringResolve(ring: Ring, now: number, load: (id: number) => Player | null, save: (p: Player) => void, rng: Rng): number {
  const m = ring.cur;
  if (!m || now < m.startsAt) return 0;
  ring.cur = null;
  const fa = load(m.a.id);
  const fb = load(m.b.id);
  const pay = (id: number, money: number, text: string) => {
    const who = load(id);
    if (!who) return;
    who.money += money;
    log(who, now, text);
    save(who);
  };
  if (!fa || !fb) {
    for (const b of m.bets) pay(b.pid, b.amount, '🥊 Бой на ринге сорвался — ставка вернулась');
    ringNext(ring, now);
    return 0;
  }
  const full = (x: Player) => ({ ...fighter(x, now), hp: stats(x, now).maxHp, items: [] });
  const st = newBattle(full(fa), full(fb));
  battleAuto(st, rng);
  const r = battleResult(st);
  const winner: 'a' | 'b' = r.win ? 'a' : 'b';
  const w = winner === 'a' ? fa : fb;
  const l = winner === 'a' ? fb : fa;
  w.money += m.fee;
  w.authority += RING.winnerAuthority;
  track(w, 'pvpWin');
  log(w, now, `🥊 Победа на ринге над ${l.name}: +${m.fee} ₽, +${RING.winnerAuthority} авторитета`);
  log(l, now, `🥊 Проиграл на ринге ${w.name}`);
  save(fa);
  save(fb);
  const pool = m.bets.reduce((s2, b) => s2 + b.amount, 0);
  const winSum = m.bets.filter((b) => b.side === winner).reduce((s2, b) => s2 + b.amount, 0);
  const cut = Math.floor((pool - winSum) * RING.cut);
  for (const b of m.bets) {
    if (b.side !== winner) continue;
    const win = b.amount + Math.floor(((pool - winSum - cut) * b.amount) / winSum);
    pay(b.pid, win, `🥊 Ставка на ${w.name} сыграла: +${win} ₽`);
  }
  ring.last.unshift({ ...m, winner, pool, replay: { win: r.win, log: r.log, rounds: r.rounds, startHp: r.startHp, maxHp: r.maxHp } });
  ring.last.length = Math.min(ring.last.length, RING.last);
  ringNext(ring, now);
  // никто не угадал — банк целиком на общак
  return winSum ? cut : pool;
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

/** Очки войны кланов: копятся за неделю, клан суммирует. */
export function warPoints(p: Player, now: number, pts: number) {
  const w = weekIndex(now);
  if (p.war.week !== w) p.war = { week: w, pts: 0 };
  p.war.pts += pts;
}

/** Часы для счётчиков без явного now (сюжет, неделя, сезон, война). Симуляция подменяет на своё время. */
export const clock = { now: () => Date.now() };

/** Событие зоны, которое идёт сейчас: сервер кладёт сюда текущее перед каждым запросом. */
export const live = { cur: null as LiveRun | null };

/** Эффекты текущего события зоны (пусто, если ничего не идёт). */
export function liveFx(now: number): LiveEffects {
  const c = live.cur;
  return c && now >= c.startsAt && now < c.endsAt ? (liveById.get(c.id)?.fx ?? {}) : {};
}

/** Находка во время события: расходник или материал. */
function liveFind(p: Player, now: number, rng: Rng): string | null {
  const chance = liveFx(now).find ?? 0;
  if (!chance || rng() >= chance) return null;
  if (rng() < 0.5) {
    const id = rollConsumable(rng);
    giveItem(p, id);
    const c = consumableById.get(id);
    log(p, now, `🔦 Нашёл заныканное: ${c?.emoji ?? ''} ${c?.name ?? id}`);
    return id;
  }
  const m = rollMat(rng);
  giveMats(p, { [m]: 1 });
  log(p, now, `🔦 Нашёл заныканное: ${matById.get(m)?.emoji ?? ''} ${matById.get(m)?.name ?? m}`);
  return m;
}

/** Новый месяц — новый сезон: очки и пропуск обнуляются. */
export function ensureSeason(p: Player, now: number) {
  const id = seasonIndex(now);
  if (p.season.id !== id) p.season = { id, pts: 0, free: [], paid: [], pass: false };
}

export function track(p: Player, kind: TrackKind, amount = 1) {
  const sp = SEASON_PTS[kind];
  if (sp) {
    const t = clock.now();
    ensureSeason(p, t);
    p.season.pts += sp * amount * (seasonTheme(p.season.id).focus === kind ? 2 : 1);
  }
  if (p.clanId && CLAN_WAR.points[kind]) warPoints(p, clock.now(), CLAN_WAR.points[kind] * amount);
  const step = chapterOf(p.story.ch, p.mast)?.steps[p.story.step];
  if (step && step.kind === kind) p.story.progress = Math.min(step.n, p.story.progress + amount);
  if (weeklyEvent(clock.now()).goal.kind === kind) {
    ensureWeekly(p, clock.now());
    p.weekly.progress += amount;
  }
  for (const t of p.daily.tasks) if (t.kind === kind && !t.claimed) t.progress = Math.min(t.target, t.progress + amount);
  holTrack(p, kind as HolKind, clock.now(), amount);
}

export function claimTask(p: Player, index: number, now: number) {
  const t = p.daily.tasks[index];
  if (!t) throw new GameError('Нет такого задания');
  if (t.claimed) throw new GameError('Уже получено');
  if (t.progress < t.target) throw new GameError('Задание не выполнено');
  t.claimed = true;
  serve(p, TERM.dailyTask);
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
  const money = ok ? Math.round(a.money * (1 + (stats(p, now).moneyBonus + mastBonus(p, 'questMoney') + repBonus(p, 'questMoney')) / 100)) : 0;
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
  if (ok) gainRep(p, 'admin', 3);
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

/** Грев посылкой: расходник или материалы из своих запасов, три посылки в день. */
export function sendParcel(p: Player, target: Player, kind: 'item' | 'mat', ref: string, qty: number, now: number) {
  if (p.id === target.id) throw new GameError('Себе не греют');
  if (p.level < PARCEL.minLevel) throw new GameError(`Посылки — с ${PARCEL.minLevel} уровня`);
  if (kind !== 'item' && kind !== 'mat') throw new GameError('Такое не шлют');
  if (qty > (kind === 'item' ? PARCEL.maxItems : PARCEL.maxMats)) throw new GameError('Слишком много в одну посылку');
  const day = dayKey(now);
  if (p.parcels.day !== day) p.parcels = { day, n: 0 };
  if (p.parcels.n >= PARCEL.perDay + petParcels(p, now)) throw new GameError('На сегодня посылок хватит');
  takeGoods(p, kind, ref, qty);
  giveGoods(target, kind, ref, qty);
  p.parcels.n++;
  p.authority += 1;
  track(p, 'visit');
  const label = kind === 'item' ? (consumableById.get(ref)?.name ?? ref) : (matById.get(ref as MatId)?.name ?? ref);
  log(target, now, `📦 ${p.name} прислал грев: ${label} ×${qty}`);
  return { label, qty, left: PARCEL.perDay - p.parcels.n };
}

/** Какие вехи подтянутого ещё не оплачены тому, кто подтянул. */
export function refDue(p: Player): { level: number; gold: number }[] {
  if (!p.refBy) return [];
  return REFERRAL.milestones.filter((m) => p.level >= m.level && !p.refPaid.includes(m.level));
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
  const got = (b.pack ? BUTTS.packValue : 1) * (weeklyEvent(clock.now()).id === 'tobacco' ? 2 : 1);
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
  gainRep(p, 'admin', 1);
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
  // продолжение цепочки не перебивается прогулкой
  if (p.event && eventById.get(p.event.id)?.chain) return;
  if (p.chain && !p.event && now >= p.eventAt) {
    p.event = { id: p.chain, until: now + EVENT_TIMING.ttlMin * MIN };
    p.chain = null;
  } else {
    if (where === 'any' && (p.event || now < p.eventAt)) return;
    const pool = EVENTS.filter((e) => (e.where === 'any' || e.where === where) && eventFits(e, p, now));
    const ev = pool[Math.floor(rng() * pool.length)];
    p.event = { id: ev.id, until: now + EVENT_TIMING.ttlMin * MIN };
  }
  const gap = (EVENT_TIMING.minGapMin + rng() * (EVENT_TIMING.maxGapMin - EVENT_TIMING.minGapMin)) / (liveFx(now).events ?? 1) / (colonyFx(p.colony).events ?? 1);
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
  term: number;
  rep: Partial<Record<FactionId, number>>;
  debt: number;
}

function applyEffects(p: Player, e: Effects, now: number, rng: Rng): Applied {
  const max = stats(p, now);
  const out: Applied = { money: 0, butts: 0, gold: 0, xp: 0, authority: 0, energy: 0, hp: 0, item: null, levelUps: 0, term: 0, rep: {}, debt: 0 };
  if (e.rep) for (const [id, n] of Object.entries(e.rep) as [FactionId, number][]) out.rep[id] = gainRep(p, id, n);
  if (e.debt) {
    out.debt = Math.round(e.debt * ration(p));
    addDebt(p, out.debt, 'katala', now);
  }
  if (e.term) {
    out.term = Math.min(p.term, e.term);
    serve(p, e.term);
  }
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
  const why = needFail(opt.need, p);
  if (why) throw new GameError(`Не получится: ${why}`);
  const cost = opt.cost ?? {};
  const money = Math.round((cost.money ?? 0) * ration(p));
  if (p.money < money || p.butts < (cost.butts ?? 0) || p.gold < (cost.gold ?? 0)) throw new GameError('Не на что');
  p.money -= money;
  p.butts -= cost.butts ?? 0;
  p.gold -= cost.gold ?? 0;
  p.event = null;
  track(p, 'event');
  serve(p, TERM.event);
  const o = pickWeighted(opt.outcomes, rng);
  const got = applyEffects(p, o, now, rng);
  if (o.next) {
    p.chain = o.next;
    p.eventAt = now + EVENT_TIMING.chainMin * MIN;
  }
  return { text: o.text, who: ev.who, name: ev.name, next: !!o.next, ...got };
}

/** Занятие в месте зоны: баня, столовая, библиотека… */
// --- Ремесло -------------------------------------------------------------------------

/** Выдать материалы; «Мастеровой» у работяг получает вдвое больше. */
export function giveMats(p: Player, mats: Partial<Record<MatId, number>>): Partial<Record<MatId, number>> {
  const k = repRank(p.rep.work) >= 3 ? 2 : 1;
  const out: Partial<Record<MatId, number>> = {};
  for (const [id, n] of Object.entries(mats) as [MatId, number][]) {
    out[id] = n * k;
    p.mats[id] = (p.mats[id] ?? 0) + n * k;
  }
  return out;
}

/** Случайный материал: чаще простые, реже лезвия и тушь. */
export function rollMat(rng: Rng): MatId {
  return pickWeighted(MATS, rng).id;
}

export function craft(p: Player, recipeId: string, now: number) {
  const r = recipeById.get(recipeId);
  if (!r) throw new GameError('Нет такого рецепта');
  if (p.level < r.minLevel) throw new GameError(`Рецепт с ${r.minLevel} уровня`);
  for (const [id, n] of Object.entries(r.mats) as [MatId, number][]) if ((p.mats[id] ?? 0) < n) throw new GameError('Не хватает материалов');
  if (r.out.gear && p.inventory.includes(r.out.gear)) throw new GameError('Такая вещь уже есть');
  for (const [id, n] of Object.entries(r.mats) as [MatId, number][]) p.mats[id] = (p.mats[id] ?? 0) - n;
  if (r.out.item) giveItem(p, r.out.item, r.out.n ?? 1);
  if (r.out.gear) p.inventory.push(r.out.gear);
  const rep = gainRep(p, 'work', CRAFT.repPerCraft);
  addXp(p, 3 + r.minLevel, now);
  return { item: r.out.item ?? null, gear: r.out.gear ?? null, n: r.out.n ?? 1, rep };
}

// --- Барахолка -------------------------------------------------------------------------

export type GoodsKind = 'item' | 'mat' | 'gear';
export const MARKET = { maxLots: 5, fee: 0.05, maxPrice: 50_000_000, maxQty: 99 };

/** Забрать товар у продавца на прилавок. */
export function takeGoods(p: Player, kind: GoodsKind, ref: string, qty: number) {
  if (!(qty >= 1 && qty <= MARKET.maxQty && Number.isInteger(qty))) throw new GameError('Сколько штук?');
  if (kind === 'item') {
    if ((p.stash[ref] ?? 0) < qty) throw new GameError('Столько нет');
    p.stash[ref] -= qty;
    if (!p.stash[ref]) {
      delete p.stash[ref];
      p.belt = p.belt.filter((x) => x !== ref);
    }
  } else if (kind === 'mat') {
    if (!matById.has(ref as MatId) || (p.mats[ref as MatId] ?? 0) < qty) throw new GameError('Столько нет');
    p.mats[ref as MatId]! -= qty;
  } else if (kind === 'gear') {
    if (qty !== 1 || !p.inventory.includes(ref)) throw new GameError('Этого у тебя нет');
    if (Object.values(p.equipped).includes(ref)) throw new GameError('Сначала сними');
    p.inventory = p.inventory.filter((x) => x !== ref);
    delete p.upgrades[ref];
  } else throw new GameError('Такое не продаётся');
}

/** Отдать товар покупателю (или вернуть продавцу при снятии). */
export function giveGoods(p: Player, kind: GoodsKind, ref: string, qty: number) {
  if (kind === 'item') giveItem(p, ref, qty);
  else if (kind === 'mat') p.mats[ref as MatId] = (p.mats[ref as MatId] ?? 0) + qty;
  else if (!p.inventory.includes(ref)) p.inventory.push(ref);
}

// --- Долги ---------------------------------------------------------------------------

const DAY = 24 * 60 * MIN;

/** Сколько можно занять у барыги сейчас. */
export function loanLimit(p: Player): number {
  return DEBT.maxPerLevel * p.level * ration(p);
}

/** Добавить к долгу (новый — со сроком). */
function addDebt(p: Player, amount: number, from: 'baryga' | 'katala', now: number) {
  if (p.debt) {
    p.debt.amount += amount;
    p.debt.base = (p.debt.base ?? p.debt.amount - amount) + amount;
  }
  else p.debt = { amount, due: now + DEBT.termH * 60 * MIN, from, counted: 0, base: amount };
}

/** Занять у барыги под процент. */
export function loanTake(p: Player, rations: number, now: number) {
  if (!DEBT.loanRations.includes(rations)) throw new GameError('Барыга столько не даёт');
  if (p.debt) throw new GameError('Сначала верни старый долг');
  const money = rations * ration(p);
  if (money > loanLimit(p)) throw new GameError('Барыга тебе столько не доверит');
  p.money += money;
  addDebt(p, Math.round(money * (1 + DEBT.interest)), 'baryga', now);
  log(p, now, `💸 Занял у барыги ${money} ₽ — вернуть ${p.debt!.amount} ₽`);
  return { money, owe: p.debt!.amount, due: p.debt!.due };
}

/** Вернуть долг целиком или частью. */
export function loanPay(p: Player, amount: number, now: number) {
  if (!p.debt) throw new GameError('Ты никому не должен');
  const pay = Math.min(p.debt.amount, Math.floor(amount));
  if (!(pay > 0)) throw new GameError('Сколько отдаёшь?');
  if (p.money < pay) throw new GameError('Не хватает денег');
  p.money -= pay;
  p.debt.amount -= pay;
  const cleared = p.debt.amount <= 0;
  if (cleared) {
    // вернул вовремя — уважение, с просрочкой — просто закрыл
    if (p.debt.counted === 0) gainRep(p, 'brat', 2);
    p.debt = null;
    log(p, now, '🤝 Долг закрыт');
  }
  return { paid: pay, left: p.debt?.amount ?? 0, cleared };
}

/** Счётчик: каждые сутки просрочки — процент сверху и удар по репутации; долго не платишь — выбивают. */
export function debtCounter(p: Player, now: number) {
  const d = p.debt;
  if (!d || now <= d.due) return;
  const days = Math.floor((now - d.due) / DAY) + 1;
  while (d.counted < days) {
    d.counted++;
    d.amount = Math.min(Math.round(d.amount * (1 + DEBT.counter)), Math.round((d.base ?? d.amount) * DEBT.maxGrowth));
    p.authority = Math.max(0, p.authority - DEBT.authorityLoss);
    p.rep.brat = Math.max(0, p.rep.brat - DEBT.repLoss);
    log(p, now, `⏳ Долг на счётчике: теперь ${d.amount} ₽`);
    if (d.counted >= DEBT.forceAfterDays) {
      const take = Math.min(p.money, d.amount);
      p.money -= take;
      d.amount -= take;
      p.hp = Math.max(1, Math.round(p.hp * 0.5));
      p.hpAt = now;
      log(p, now, `🥊 Пришли за долгом: забрали ${take} ₽ и отбили бока`);
      if (d.amount <= 0) {
        p.debt = null;
        return;
      }
    }
  }
}

// --- Воровской общак ---------------------------------------------------------------

export interface Obshak {
  total: number;
  log: { name: string; amount: number; at: number }[];
}

/** Уделить на общак: деньги в пайках, взамен — репутация у братвы и немного авторитета. */
export function obshakGive(p: Player, ob: Obshak, rations: number, now: number) {
  if (!(rations >= OBSHAK.minGive) || rations > 1000) throw new GameError(`Минимум ${OBSHAK.minGive} пайки`);
  const money = Math.round(Math.floor(rations) * ration(p));
  if (p.money < money) throw new GameError('Не хватает денег');
  p.money -= money;
  ob.total += money;
  ob.log.unshift({ name: p.name, amount: money, at: now });
  ob.log.length = Math.min(ob.log.length, OBSHAK.log);
  const rep = gainRep(p, 'brat', Math.floor(rations) * OBSHAK.repPerRation);
  const authority = Math.min(10, Math.floor(rations / 5));
  p.authority += authority;
  log(p, now, `🃏 Уделил на общак ${money} ₽`);
  return { money, rep, authority };
}

/** Помощь из общака: своим, раз в сутки, за счёт репутации. */
export function obshakAsk(p: Player, ob: Obshak, now: number) {
  if (p.obshakAskAt + OBSHAK.askCooldownH * 60 * MIN > now) throw new GameError('Уже просил — приходи завтра');
  if (repRank(p.rep.brat) < 3) throw new GameError(`Общак помогает близким: нужно звание «${factionById.get('brat')!.ranks[3]}»`);
  const money = Math.min(Math.round(OBSHAK.askRations * ration(p)), Math.floor(ob.total * OBSHAK.askShare));
  if (money <= 0) throw new GameError('Общак пуст');
  ob.total -= money;
  p.money += money;
  p.obshakAskAt = now;
  p.rep.brat = Math.max(0, p.rep.brat - OBSHAK.askRepCost);
  log(p, now, `🃏 Общак помог: ${money} ₽`);
  return { money };
}

export function placeDo(p: Player, placeId: string, actId: string, now: number, rng: Rng) {
  const pl = placeById.get(placeId as PlaceId);
  const a = pl?.activities.find((x) => x.id === actId);
  if (!pl || !a) throw new GameError('Нет такого места');
  if (pl.colony && pl.colony !== p.colony) throw new GameError('Это место — на другой зоне');
  if (p.level < pl.minLevel) throw new GameError(`Сюда пускают с ${pl.minLevel} уровня`);
  const why = needFail(a.need, p);
  if (why) throw new GameError(`Не получится: ${why}`);
  const key = `${pl.id}.${a.id}`;
  if ((p.placeCd[key] ?? 0) > now) throw new GameError('Рано, приходи позже');
  const cost = a.cost ?? {};
  const money = Math.round((cost.money ?? 0) * ration(p));
  if (p.money < money || p.butts < (cost.butts ?? 0) || p.gold < (cost.gold ?? 0)) throw new GameError('Не на что');
  if (cost.energy) spendEnergy(p, cost.energy, now);
  p.money -= money;
  p.butts -= cost.butts ?? 0;
  p.gold -= cost.gold ?? 0;
  p.placeCd[key] = now + a.cdMin * MIN;
  track(p, 'place');
  const o = pickWeighted(a.outcomes, rng);
  const got = applyEffects(p, { ...o, rep: { ...PLACE_REP[key], ...o.rep } }, now, rng);
  const mats = PLACE_MATS[key] ? giveMats(p, PLACE_MATS[key]) : {};
  return { text: o.text, who: pl.who, name: pl.host, ...got, mats };
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
  if (p.duo) throw new GameError('Ты в побеге с кентом');
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
  const chance = st.pass ? Math.max(0.05, Math.min(0.97, st.pass + q * ESCAPE.qualityBonus + agi + weatherFx(weatherFor(now, p.colony)).escape)) : 0;
  if (rng() < chance) {
    run.stage += 1;
    return { passed: true, stage: run.stage, caught: false as const };
  }
  return { passed: false, ...escapeEnd(p, true, now, rng) };
}

/** Конец побега: пойман (ШИЗО, побои) или вернулся сам (меньше награды). */
export function escapeEnd(p: Player, caught: boolean, now: number, rng: Rng, mul = 1) {
  const run = p.escape.run;
  if (!run) throw new GameError('Ты не в бегах');
  p.escape.run = null;
  const stages = run.stage;
  p.escape.best = Math.max(p.escape.best, stages);
  if (stages > 0) track(p, 'escape', stages);
  const r = escapeReward(p.level, stages);
  const k = (caught ? 1 : ESCAPE.bailShare) * mul;
  const reward = applyEffects(p, { xp: Math.round(r.xp * k), authority: Math.round(r.authority * k), gold: caught ? r.gold : 0, item: r.item && caught }, now, rng);
  const money = Math.round(r.money * k * (1 + mastBonus(p, 'escape') / 100));
  p.money += money;
  reward.money = money;
  if (caught) {
    serve(p, TERM.escapeCaught);
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
      for (const m of MATS) p.mats[m.id] = (p.mats[m.id] ?? 0) + 10;
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
      const keep = { god: p.god, clanId: p.clanId, clanLevel: p.clanLevel, clanHut: p.clanHut, journal: p.journal };
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
  const ch = chapterOf(p.story.ch, p.mast);
  const step = ch?.steps[p.story.step];
  if (!step) throw new GameError('Сюжет пройден');
  if (p.story.progress < step.n) throw new GameError('Шаг ещё не выполнен');
  const r = step.reward;
  p.money += r.money ?? 0;
  p.gold += r.gold ?? 0;
  p.butts += r.butts ?? 0;
  serve(p, TERM.storyStep);
  if (r.item) giveItem(p, r.item);
  if (r.gear && itemById.has(r.gear) && !p.inventory.includes(r.gear)) p.inventory.push(r.gear);
  const levelUps = r.xp ? addXp(p, r.xp, now) : 0;
  p.story.step++;
  p.story.progress = 0;
  let chapterDone = false;
  if (p.story.step >= ch.steps.length) {
    chapterDone = true;
    log(p, now, `📖 Глава «${ch.name}» пройдена`);
    p.story = { ch: p.story.ch + 1, step: 0, progress: 0 };
  }
  return { money: r.money ?? 0, gold: r.gold ?? 0, butts: r.butts ?? 0, xp: r.xp ?? 0, item: r.item ?? null, gear: r.gear ?? null, levelUps, chapterDone };
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

export function diceMaxBet(p: Player) {
  return DICE.minBet + p.level * DICE.betPerLevel;
}

/** Кости: по два кубика тебе и блатному, у кого больше — забирает. Ничья — ставка назад. */
export function dice(p: Player, bet: number, now: number, rng: Rng) {
  const b = Math.floor(Number(bet));
  if (!(b >= DICE.minBet)) throw new GameError(`Ставка от ${DICE.minBet} ₽`);
  if (b > diceMaxBet(p)) throw new GameError(`На твоём уровне — не больше ${diceMaxBet(p)} ₽`);
  if (p.money < b) throw new GameError('Не хватает денег');
  playLimit(p, 'dice', DICE.perDay, now);
  p.money -= b;
  const roll = () => 1 + Math.floor(rng() * 6);
  const me = [roll(), roll()];
  const him = [roll(), roll()];
  const sm = me[0] + me[1];
  const sh = him[0] + him[1];
  // ничья — в пользу цыгана: иначе игра выгодна игроку (+7,6% к ставке)
  const result: 'win' | 'lose' = sm > sh ? 'win' : 'lose';
  const back = result === 'win' ? b * (me[0] === me[1] ? DICE.doublePayout : DICE.payout) : 0;
  p.money += back;
  return { me, him, result, money: back - b };
}

/** Армрестлинг: taps — сколько раз нажал за раунд. Сила даёт фору, больше maxTaps не засчитываем. */
export function armWrestle(p: Player, rivalId: string, taps: number, now: number, rng: Rng) {
  const rival = ARM.rivals.find((r) => r.id === rivalId);
  if (!rival) throw new GameError('Нет такого соперника');
  playLimit(p, 'arm', ARM.perDay, now);
  const t = Math.max(0, Math.min(ARM.maxTaps, Math.floor(Number(taps) || 0)));
  const power = t + p.str * 0.25;
  const need = rival.need * (0.9 + rng() * 0.2); // соперник тоже бывает не в духе
  const won = power >= need;
  const out = { won, power: Math.round(power), need: Math.round(need), xp: 0, butts: 0, authority: 0, levelUps: 0 };
  if (won) {
    out.xp = rival.xp;
    out.butts = rival.butts;
    out.authority = rival.authority;
    p.butts += rival.butts;
    p.authority += rival.authority;
    out.levelUps = addXp(p, rival.xp, now);
    holTrack(p, 'arm', now);
  }
  if (curHoliday(now)?.id === 'feb23') p.hol.armBest = Math.max(p.hol.armBest, out.power);
  return out;
}

/** Заточка в мишень: точность трёх бросков (0..1) → очки → бычки. */
export function darts(p: Player, accs: unknown, now: number) {
  const list = Array.isArray(accs) ? accs.slice(0, DARTS.throws).map((a) => Number(a) || 0) : [];
  if (list.length !== DARTS.throws) throw new GameError('Нужно три броска');
  playLimit(p, 'darts', DARTS.perDay, now);
  const points = list.map(dartPoints);
  const score = points.reduce((a, b) => a + b, 0);
  const butts = Math.floor(score / DARTS.buttsPer);
  p.butts += butts;
  return { points, score, butts };
}

// --- Нарды ----------------------------------------------------------------------------

const die = (rng: Rng) => 1 + Math.floor(rng() * 6);

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const tableBet = (p: Player, bet: number, min: number, perLevel: number) => {
  const b = Math.floor(Number(bet));
  const max = min + p.level * perLevel;
  if (!(b >= min)) throw new GameError(`Ставка от ${min} ₽`);
  if (b > max) throw new GameError(`На твоём уровне — не больше ${max} ₽`);
  if (p.money < b) throw new GameError('Не хватает денег');
  return b;
};

/** Цыган ходит жадно: берёт то, что дальше продвинет. */
function nardyAi(pos: number, d: [number, number]): number {
  return Math.max(...(['a', 'b', 'sum'] as NardyPick[]).map((k) => nardyLand(pos, nardyStep(d, k))));
}

export function nardyStart(p: Player, bet: number, now: number, rng: Rng) {
  if (p.tables.nardy) throw new GameError('Партия уже идёт');
  const b = tableBet(p, bet, NARDY.minBet, NARDY.betPerLevel);
  playLimit(p, 'nardy', NARDY.perDay, now);
  p.money -= b;
  // кто ходит первым — жребий: на короткой доске первый ход даёт ~70% победы
  const hisFirst = rng() < 0.5;
  const his: [number, number] | null = hisFirst ? [die(rng), die(rng)] : null;
  p.tables.nardy = { bet: b, me: 0, him: his ? nardyAi(0, his) : 0, dice: [die(rng), die(rng)], hisLast: his };
  return p.tables.nardy;
}

export function nardyMove(p: Player, pick: NardyPick, rng: Rng) {
  const g = p.tables.nardy;
  if (!g) throw new GameError('Партии нет');
  if (!['a', 'b', 'sum'].includes(pick)) throw new GameError('Нет такого хода');
  g.me = nardyLand(g.me, nardyStep(g.dice, pick));
  let result: 'win' | 'lose' | null = null;
  if (g.me >= NARDY.finish) result = 'win';
  else {
    g.hisLast = [die(rng), die(rng)];
    g.him = nardyAi(g.him, g.hisLast);
    if (g.him >= NARDY.finish) result = 'lose';
    else g.dice = [die(rng), die(rng)];
  }
  const state = { ...g };
  let money = 0;
  if (result) {
    money = result === 'win' ? Math.round(g.bet * NARDY.payout) : 0;
    p.money += money;
    delete p.tables.nardy;
  }
  return { state, result, money };
}

// --- Домино ----------------------------------------------------------------------------

const ends = (chain: Tile[]): [number, number] => [chain[0][0], chain[chain.length - 1][1]];
const pips = (h: Tile[]) => h.reduce((s, t) => s + t[0] + t[1], 0);

/** Положить кость к цепочке: слева или справа, развернув как надо. */
function lay(chain: Tile[], t: Tile, side: 'l' | 'r'): boolean {
  if (!chain.length) {
    chain.push(t);
    return true;
  }
  const [l, r] = ends(chain);
  if (side === 'l' && fits(t, l)) {
    chain.unshift(t[1] === l ? t : [t[1], t[0]]);
    return true;
  }
  if (side === 'r' && fits(t, r)) {
    chain.push(t[0] === r ? t : [t[1], t[0]]);
    return true;
  }
  return false;
}

/** Ход «козла» (соперника): самая тяжёлая подходящая, иначе берёт из базара. */
function dominoAi(d: NonNullable<Player['tables']['domino']>): string {
  for (;;) {
    const [l, r] = ends(d.chain);
    const opts = d.ai.map((t, i) => ({ t, i })).filter(({ t }) => fits(t, l) || fits(t, r));
    if (opts.length) {
      opts.sort((a, b) => b.t[0] + b.t[1] - (a.t[0] + a.t[1]));
      const { t, i } = opts[0];
      d.ai.splice(i, 1);
      lay(d.chain, t, fits(t, r) ? 'r' : 'l');
      return `положил ${t[0]}:${t[1]}`;
    }
    if (!d.bone.length) return 'пропустил';
    d.ai.push(d.bone.pop()!);
  }
}

function dominoEnd(p: Player): { result: 'win' | 'lose'; money: number } | null {
  const d = p.tables.domino!;
  let result: 'win' | 'lose' | null = null;
  if (!d.hand.length) result = 'win';
  else if (!d.ai.length) result = 'lose';
  else {
    const [l, r] = ends(d.chain);
    const stuck = (h: Tile[]) => !h.some((t) => fits(t, l) || fits(t, r));
    // рыба: ходить некому — побеждает тот, у кого меньше очков на руках
    if (!d.bone.length && stuck(d.hand) && stuck(d.ai)) result = pips(d.hand) < pips(d.ai) ? 'win' : 'lose';
  }
  if (!result) return null;
  const money = result === 'win' ? d.bet * DOMINO.payout : 0;
  p.money += money;
  delete p.tables.domino;
  return { result, money };
}

export function dominoStart(p: Player, bet: number, now: number, rng: Rng) {
  if (p.tables.domino) throw new GameError('Партия уже идёт');
  const b = tableBet(p, bet, DOMINO.minBet, DOMINO.betPerLevel);
  playLimit(p, 'domino', DOMINO.perDay, now);
  p.money -= b;
  const deck = shuffle(allTiles(), rng);
  const d = { bet: b, hand: deck.splice(0, DOMINO.hand), ai: deck.splice(0, DOMINO.hand), bone: deck, chain: [] as Tile[], last: '' };
  // первым ходит соперник — кладёт самую тяжёлую
  d.ai.sort((x, y) => y[0] + y[1] - (x[0] + x[1]));
  d.chain.push(d.ai.shift()!);
  d.last = `начал с ${d.chain[0][0]}:${d.chain[0][1]}`;
  p.tables.domino = d;
  return { state: d };
}

/** Ход игрока: положить кость (index, side) или взять из базара (index = -1). */
export function dominoMove(p: Player, index: number, side: 'l' | 'r') {
  const d = p.tables.domino;
  if (!d) throw new GameError('Партии нет');
  const [l, r] = ends(d.chain);
  const canPlay = d.hand.some((t) => fits(t, l) || fits(t, r));
  if (index === -1) {
    if (canPlay) throw new GameError('Есть чем ходить');
    if (d.bone.length) {
      d.hand.push(d.bone.pop()!);
      return { state: { ...d }, end: dominoEnd(p) };
    }
    // базар пуст — пропуск хода
  } else {
    const t = d.hand[index];
    if (!t || !lay(d.chain, t, side)) throw new GameError('Эта кость сюда не ляжет');
    d.hand.splice(index, 1);
    const end = dominoEnd(p);
    if (end) return { state: { ...d }, end };
  }
  d.last = dominoAi(d);
  return { state: { ...d }, end: dominoEnd(p) };
}

// --- Шахматный этюд -------------------------------------------------------------------------

export function chessPuzzle(p: Player, now: number, rng: Rng) {
  if (!p.tables.chess) {
    if (playsLeft(p, 'chess', CHESS.perDay, now) <= 0) throw new GameError('На сегодня этюдов хватит');
    p.tables.chess = PUZZLES[Math.floor(rng() * PUZZLES.length)].id;
  }
  return { id: p.tables.chess };
}

export function chessSolve(p: Player, from: string, to: string, now: number) {
  const pz = p.tables.chess ? puzzleById.get(p.tables.chess) : null;
  if (!pz) throw new GameError('Этюда нет');
  playLimit(p, 'chess', CHESS.perDay, now);
  delete p.tables.chess;
  const ok = isMateMove(pz.pieces, String(from), String(to));
  const out = { ok, xp: 0, butts: 0, levelUps: 0 };
  if (ok) {
    out.xp = CHESS.xp + p.level;
    out.butts = CHESS.butts;
    p.butts += out.butts;
    out.levelUps = addXp(p, out.xp, now);
  }
  return out;
}

// --- Выжить в ШИЗО --------------------------------------------------------------------------

function shizoDraw(s: { seen: string[] }, rng: Rng): string {
  const pool = SHIZO_CARDS.filter((c) => !s.seen.includes(c.id));
  const c = (pool.length ? pool : SHIZO_CARDS)[Math.floor(rng() * (pool.length || SHIZO_CARDS.length))];
  s.seen.push(c.id);
  return c.id;
}

export function shizoStart(p: Player, now: number, rng: Rng) {
  if (p.tables.shizo) return { state: p.tables.shizo };
  if (p.level < SHIZO.minLevel) throw new GameError(`ШИЗО — с ${SHIZO.minLevel} уровня`);
  playLimit(p, 'shizo', SHIZO.perDay, now);
  const s = { day: 1, heat: SHIZO.start, food: SHIZO.start, spirit: SHIZO.start, card: '', seen: [] as string[] };
  s.card = shizoDraw(s, rng);
  p.tables.shizo = s;
  return { state: s };
}

/** Выбор на сегодня, потом ночь: минус по каждой шкале. Ноль по любой — срыв. */
export function shizoPick(p: Player, choice: number, now: number, rng: Rng) {
  const s = p.tables.shizo;
  if (!s) throw new GameError('Ты не в ШИЗО');
  const card = shizoCardById.get(s.card)!;
  const o = card.opts[choice];
  if (!o) throw new GameError('Нет такого выбора');
  if (o.butts) {
    if (p.butts < o.butts) throw new GameError('Нет бычков');
    p.butts -= o.butts;
  }
  const failed = !!o.risk && rng() < o.risk.chance;
  const d = failed ? o.risk!.d : o.d;
  for (const k of ['heat', 'food', 'spirit'] as ShizoStat[]) s[k] = Math.min(SHIZO.max, s[k] + (d[k] ?? 0) - SHIZO.nightLoss - (k === 'heat' ? weatherFx(weatherFor(now, p.colony)).shizoCold : 0));
  const text = failed ? o.risk!.text : o.text;
  const broke = s.heat <= 0 || s.food <= 0 || s.spirit <= 0;
  let end: null | { won: boolean; authority: number; xp: number; rep: number; term: number; levelUps: number } = null;
  if (broke || s.day >= SHIZO.days) {
    const won = !broke;
    const authority = won ? 8 + Math.floor(p.level / 2) : 0;
    const xp = won ? 30 + p.level * 3 : 10;
    p.authority += authority;
    const rep = won ? gainRep(p, 'brat', 10) : 0;
    const term = won ? 0.5 : 0;
    if (won) serve(p, term);
    else {
      p.hp = Math.max(1, Math.round(stats(p, now).maxHp * 0.3));
      p.hpAt = now;
    }
    const levelUps = addXp(p, xp, now);
    log(p, now, won ? `🧱 Отсидел пять суток в ШИЗО — не сломался. +${authority} авторитета` : '🧱 Сломался в ШИЗО. Увезли в санчасть');
    end = { won, authority, xp, rep, term, levelUps };
    delete p.tables.shizo;
  } else {
    s.day++;
    s.card = shizoDraw(s, rng);
  }
  return { text, failed, state: { ...s }, end };
}

// --- Ловкость -------------------------------------------------------------------------------

export function speedChifir(p: Player, ms: number, now: number) {
  playLimit(p, 'speed', SPEED.perDay, now);
  const butts = speedButts(Number(ms));
  p.butts += butts;
  return { butts, ms: Math.round(Number(ms) || 0) };
}

export function beltShift(p: Player, good: number, missed: number, now: number) {
  playLimit(p, 'conveyor', BELT.perDay, now);
  const g0 = Math.max(0, Math.min(BELT.maxItems, Math.floor(Number(good) || 0)));
  const m0 = Math.max(0, Math.min(BELT.maxItems, Math.floor(Number(missed) || 0)));
  const money = Math.max(0, Math.round((g0 * BELT.payPerGood - m0 * BELT.finePerMiss) * ration(p)));
  p.money += money;
  const rep = money > 0 ? gainRep(p, 'work', BELT.rep) : 0;
  return { money, good: g0, missed: m0, rep };
}

export function beadsPlay(p: Player, accs: unknown, now: number) {
  const list = Array.isArray(accs) ? accs.slice(0, BEADS.beads).map((a) => Math.max(0, Math.min(1, Number(a) || 0))) : [];
  if (list.length !== BEADS.beads) throw new GameError('Перебери все бусины');
  playLimit(p, 'beads', BEADS.perDay, now, BEADS.cooldownMin);
  const q = list.reduce((a, b) => a + b, 0) / list.length;
  const energy = Math.round(BEADS.maxEnergy * q);
  const xp = Math.round(BEADS.maxXp * q);
  p.energy += energy;
  const levelUps = addXp(p, xp, now);
  return { quality: q, energy, xp, levelUps };
}

export function fishing(p: Player, accs: unknown, now: number, rng: Rng) {
  const list = Array.isArray(accs) ? accs.slice(0, FISH.casts).map((a) => Math.max(0, Math.min(1, Number(a) || 0))) : [];
  if (list.length !== FISH.casts) throw new GameError('Три заброса');
  playLimit(p, 'fish', FISH.perDay, now);
  const catches = list.map((a) => {
    if (a >= FISH.good) {
      const r = rng();
      if (r < 0.35) {
        const item = rollConsumable(rng);
        giveItem(p, item);
        return { kind: 'item' as const, id: item };
      }
      if (r < 0.7) {
        const m = rollMat(rng);
        giveMats(p, { [m]: 1 });
        return { kind: 'mat' as const, id: m };
      }
      p.butts += 5;
      return { kind: 'butts' as const, n: 5 };
    }
    if (a >= FISH.ok) {
      p.butts += 2;
      return { kind: 'butts' as const, n: 2 };
    }
    return { kind: 'none' as const };
  });
  return { catches };
}

/** Сварить чифир: quality — насколько точно снял с огня (0..1). */
export function brew(p: Player, quality: number, now: number) {
  playLimit(p, 'brew', BREW.perDay, now, BREW.cooldownMin);
  const q = Math.max(0, Math.min(1, Number(quality) || 0));
  const energy = Math.round(BREW.minEnergy + (BREW.maxEnergy - BREW.minEnergy) * q);
  p.energy += energy;
  return { energy, quality: q };
}

// --- Защита от накруток ----------------------------------------------------------------

/** Сервер засёк начало мини-игры. Для чифира на скорость сам выбирает, когда закипит. */
export function runStart(p: Player, game: string, now: number, rng: Rng) {
  const rule = RUNS[game];
  if (!rule) throw new GameError('Нет такой игры');
  const delay = rule.delay ? Math.round(rule.delay[0] + rng() * (rule.delay[1] - rule.delay[0])) : 0;
  p.runs[game] = { at: now, delay };
  return { delay };
}

/** Текущий счёт подозрения с учётом остывания. */
export function susScore(p: Player, now: number): number {
  const days = Math.max(0, (now - p.sus.at) / (24 * 60 * MIN));
  return Math.max(0, p.sus.score - days * ANTICHEAT.decayPerDay);
}

export function suspect(p: Player, game: string, why: string, pts: number, now: number) {
  p.sus = {
    score: Math.round((susScore(p, now) + pts) * 10) / 10,
    at: now,
    log: [{ t: now, game, why }, ...p.sus.log].slice(0, ANTICHEAT.keepLog),
  };
}

/**
 * Проверка результата мини-игры перед зачётом. Возвращает текст ошибки или null.
 * Не бросает: подозрение должно сохраниться, даже если результат отклонён.
 */
export function runCheck(p: Player, game: string, body: Record<string, unknown>, now: number): string | null {
  const rule = RUNS[game];
  if (!rule) return null;
  const run = p.runs[game];
  delete p.runs[game];
  // фальстарт на чифире честный: ничего не даёт, время не проверяем
  const ms = game === 'speed' ? Number(body.ms) || 0 : 0;
  if (!run || now - run.at > ANTICHEAT.ttlMs) {
    if (!(game === 'speed' && ms <= 0)) suspect(p, game, 'результат без начала игры', ANTICHEAT.soft, now);
    return 'Игра сбилась — начни заново';
  }
  const el = now - run.at;
  if (!(game === 'speed' && ms <= 0)) {
    const need = rule.minMs + run.delay + ms - ANTICHEAT.slackMs;
    if (el < need) {
      suspect(p, game, `за ${el} мс, а быстрее ${need} мс не сыграть`, ANTICHEAT.hard, now);
      return 'Слишком быстро — так не бывает';
    }
  }
  const bad = impossible(game, body, el);
  if (bad) {
    suspect(p, game, bad, ANTICHEAT.hard, now);
    return 'Не засчитано: так не бывает';
  }
  const odd = tooPerfect(game, body);
  if (odd) suspect(p, game, odd, ANTICHEAT.soft, now);
  return null;
}

// --- Обучение первых минут ------------------------------------------------------------

/** Насыпать бычков у ног, чтобы шаг с бычками не ждал. */
function tutSeedButts(p: Player) {
  const need = TUT_BUTTS - p.field.length;
  for (let i = 0; i < need; i++) {
    p.field.push({ id: ++p.fieldSeq, x: Math.round((0.12 + (i / TUT_BUTTS) * 0.76) * 1000) / 1000, y: 0.78 + (i % 2) * 0.1, pack: false });
  }
}

/** Пропустить шаги, которые уже сделаны (лицо выбрано), и подготовить следующий. */
function tutSkipDone(p: Player, _now: number) {
  while (p.tut >= 0 && p.tut < TUTORIAL.length && TUTORIAL[p.tut].id === 'look' && p.faceChosen) p.tut++;
  if (p.tut >= 0 && TUTORIAL[p.tut]?.id === 'butts') tutSeedButts(p);
}

/** Действие сделано — двигаем обучение. Возвращает, что выдали, если шаг закрылся. */
export function tutAdvance(p: Player, action: string, now: number) {
  if (p.intro >= 0 || p.tut < 0) return null;
  const step = TUTORIAL[p.tut];
  if (!step || !step.actions.includes(action)) return null;
  p.tutN += 1;
  if (p.tutN < step.n) return null;
  p.tutN = 0;
  p.money += step.reward.money ?? 0;
  p.butts += step.reward.butts ?? 0;
  if (step.reward.xp) addXp(p, step.reward.xp, now);
  if (step.reward.level && p.level < step.reward.level) addXp(p, Math.max(0, xpToNext(p.level) - p.xp), now);
  p.tut += 1;
  tutSkipDone(p, now);
  if (p.tut < TUTORIAL.length) return { step: step.id, done: false };
  p.tut = -1;
  p.gold += TUT_GIFT.gold;
  p.money += TUT_GIFT.money;
  for (const id of TUT_GIFT.items) giveItem(p, id);
  log(p, now, `🎁 Обучение пройдено: +${TUT_GIFT.gold} 🪙, +${TUT_GIFT.money} ₽ и грев`);
  return { step: step.id, done: true };
}

export function tutSkip(p: Player) {
  if (p.tut < 0) throw new GameError('Обучение уже позади');
  p.tut = -1;
  p.tutN = 0;
}

// --- Лиги наездов -------------------------------------------------------------------------

/** Сила бойца одной цифрой. */
export function power(p: Player, now: number): number {
  return powerOf(stats(p, now));
}

export function ensureLeague(p: Player, now: number) {
  const w = weekIndex(now);
  if (p.league.week === w) return;
  // прошлую неделю помним — за неё ещё забирать награду
  const last = p.league.week === w - 1 ? { week: w - 1, pts: p.league.pts } : p.league.last?.week === w - 1 ? p.league.last : null;
  p.league = { week: w, pts: 0, wins: 0, claimed: p.league.claimed, last };
}

/** Очки лиги за наезд. Возвращает, сколько добавилось и почему ноль. */
function leagueAdd(p: Player, win: boolean, ratio: number | null, now: number, mul = 1) {
  ensureLeague(p, now);
  const base = leaguePoints(win, ratio);
  const pts = base > 0 ? base * mul : base;
  const before = leagueTier(p.league.pts);
  p.league.pts = Math.max(0, p.league.pts + pts);
  if (win) p.league.wins += 1;
  const after = leagueTier(p.league.pts);
  if (after.min > before.min) log(p, now, `${after.emoji} Ты в лиге «${after.name}»!`);
  return { pts, total: p.league.pts, weak: win && ratio !== null && ratio < LEAGUE.weakRatio, up: after.min > before.min ? after.id : null };
}

/**
 * Подбор соперника по силе: из кандидатов — кого можно бить (без щита, не надоел сегодня),
 * ближе всего по силе; среди близких — случайно.
 */
export function pickOpponent(p: Player, candidates: Player[], now: number, rng: Rng): Player | null {
  const me = Math.max(1, power(p, now));
  const day = dayKey(now);
  const hits = p.pvpDay.day === day ? p.pvpDay.hits : {};
  const ok = candidates
    .filter((c) => c.id !== p.id && canBeAttacked(c, now) && (hits[c.id] ?? 0) < LEAGUE.sameTargetPerDay)
    .map((c) => ({ c, r: power(c, now) / me }))
    .sort((a, b) => Math.abs(Math.log(a.r)) - Math.abs(Math.log(b.r)));
  if (!ok.length) return null;
  const band = ok.filter((x) => x.r >= LEAGUE.band[0] && x.r <= LEAGUE.band[1]);
  const pool = band.length ? band : ok.slice(0, 1);
  return pool[Math.floor(rng() * Math.min(pool.length, 4))].c;
}

/** Награда за прошлую неделю: по лиге, где закончил, и за место в таблице (место считает сервер). */
export function leagueClaim(p: Player, prev: { week: number; pts: number; rank: number | null }, now: number) {
  if (p.league.claimed >= prev.week) throw new GameError('Награда за ту неделю уже получена');
  const tier = leagueTier(prev.pts);
  const top = prev.rank !== null && prev.rank < LEAGUE.topGold.length ? LEAGUE.topGold[prev.rank] : 0;
  if (!tier.gold && !top) throw new GameError('За ту неделю награды нет — подними лигу');
  p.league.claimed = prev.week;
  p.gold += tier.gold + top;
  p.money += tier.money;
  const title = prev.rank === 0 && !p.cosmetics.includes(LEAGUE.champTitle);
  if (title) p.cosmetics.push(LEAGUE.champTitle);
  log(p, now, `${tier.emoji} Итоги недели в лиге: +${tier.gold + top} 🪙, +${tier.money} ₽${title ? ', титул «Чемпион двора»' : ''}`);
  return { tier: tier.id, gold: tier.gold + top, money: tier.money, title };
}

export { LEAGUE_TIERS };

// --- Альбом и стена трофеев ----------------------------------------------------------------

export { albumProgress };

export function albumClaim(p: Player, id: string, now: number) {
  const a = albumById.get(id as AlbumId);
  if (!a) throw new GameError('Нет такой коллекции');
  if (p.albums.includes(a.id)) throw new GameError('Уже забрал');
  const pr = albumProgress(p)[a.id];
  if (pr.have.length < pr.total.length) throw new GameError(`Собрано ${pr.have.length} из ${pr.total.length}`);
  p.albums.push(a.id);
  p.gold += a.gold;
  if (!p.cosmetics.includes(a.cosmetic)) p.cosmetics.push(a.cosmetic);
  log(p, now, `${a.emoji} Коллекция «${a.name}» собрана: +${a.gold} 🪙 и ${cosmeticById.get(a.cosmetic)?.name ?? 'награда'}`);
  return { gold: a.gold, cosmetic: a.cosmetic };
}

/** Повесить трофей на стену хаты или снять. */
export function wallToggle(p: Player, bossId: string) {
  if (p.wall.includes(bossId)) {
    p.wall = p.wall.filter((x) => x !== bossId);
    return { wall: p.wall };
  }
  if (!p.trophies.includes(bossId)) throw new GameError('Этого трофея у тебя нет');
  if (p.wall.length >= WALL_MAX) throw new GameError(`На стене места на ${WALL_MAX} трофея — сними один`);
  p.wall.push(bossId);
  return { wall: p.wall };
}

// --- Побег вдвоём ----------------------------------------------------------------------------
// Забег общий: на каждом этапе ходят оба (каждый в своё время). Кто прошёл — пытается вытащить
// сорвавшегося кента: вытащил — бегут дальше, нет — берут обоих. Награда каждому — больше, чем в одиночку.

export interface DuoRun {
  id: string;
  a: number;
  b: number;
  names: [string, string];
  status: 'invite' | 'run' | 'over';
  stage: number;
  /** качество хода на текущем этапе: кто уже сходил */
  moves: Record<string, number>;
  at: number;
  /** последний ход — для таймаута «кент пропал» */
  turnAt: number;
  log: string[];
  result: { caught: boolean; stage: number } | null;
}

export function duoNew(a: Player, b: Player, now: number): DuoRun {
  return { id: `${a.id}-${b.id}-${now}`, a: a.id, b: b.id, names: [a.name, b.name], status: 'invite', stage: 0, moves: {}, at: now, turnAt: now, log: [], result: null };
}

function duoReady(p: Player, now: number) {
  if (p.level < DUO.minLevel) throw new GameError(`Побег вдвоём — с ${DUO.minLevel} уровня`);
  if (p.escape.run) throw new GameError('Ты уже в бегах');
  if (p.escape.cdUntil > now) throw new GameError('Сидишь в ШИЗО');
  if (p.duo) throw new GameError('Уже бежишь с кентом');
}

/** Позвать кента: энергия списывается сразу, у кента появляется приглашение на час. */
export function duoInvite(a: Player, b: Player, run: DuoRun, now: number) {
  if (a.id === b.id) throw new GameError('С самим собой не бегут');
  duoReady(a, now);
  if (b.level < DUO.minLevel) throw new GameError(`Кенту нужен ${DUO.minLevel} уровень`);
  if (b.duo || (b.duoInvite && now - b.duoInvite.at < DUO.inviteH * 60 * MIN)) throw new GameError('Кент уже занят другим побегом');
  spendEnergy(a, ESCAPE.energy, now);
  a.duo = run.id;
  b.duoInvite = { run: run.id, from: a.id, name: a.name, at: now };
  log(b, now, `🤝 ${a.name} зовёт тебя в побег вдвоём`);
}

export function duoAccept(b: Player, run: DuoRun, now: number) {
  if (!b.duoInvite || b.duoInvite.run !== run.id || run.status !== 'invite') throw new GameError('Приглашение уже не действует');
  if (now - b.duoInvite.at > DUO.inviteH * 60 * MIN) throw new GameError('Кент ждал час и передумал');
  duoReady(b, now);
  spendEnergy(b, ESCAPE.energy, now);
  b.duo = run.id;
  b.duoInvite = null;
  run.status = 'run';
  run.turnAt = now;
  run.log.unshift(`${run.names[1]} в деле. Этап 1: ${ESCAPE_STAGES[0].name}`);
}

/** Отказ от приглашения (или оно протухло): позвавшему возвращаем энергию. */
export function duoDecline(b: Player, a: Player | null, run: DuoRun) {
  b.duoInvite = null;
  run.status = 'over';
  run.result = { caught: false, stage: 0 };
  if (a && a.duo === run.id) {
    a.duo = null;
    a.energy += ESCAPE.energy;
  }
}

/**
 * Ход на этапе. Когда сходили оба — этап разрешается. Возвращает, что случилось.
 * Игроки — оба загружены (второй может быть не в сети).
 */
export function duoStep(me: Player, other: Player, run: DuoRun, quality: number, now: number, rng: Rng) {
  if (run.status !== 'run' || me.duo !== run.id) throw new GameError('Забега нет');
  if (run.moves[me.id] !== undefined) throw new GameError('Ты свой ход сделал — ждём кента');
  run.moves[me.id] = Math.max(0, Math.min(1, Number(quality) || 0));
  run.turnAt = now;
  if (run.moves[other.id] === undefined) return { resolved: false as const };
  const st = ESCAPE_STAGES[run.stage];
  const wx = weatherFx(weatherFor(now, me.colony)).escape;
  const chance = (pl: Player) => (st.pass ? Math.max(0.05, Math.min(0.97, st.pass + run.moves[pl.id] * ESCAPE.qualityBonus + Math.min(0.1, pl.agi * 0.002) + wx + DUO.teamBonus)) : 0);
  const okMe = rng() < chance(me);
  const okOther = rng() < chance(other);
  run.moves = {};
  let caught = false;
  const name = (pl: Player) => (pl.id === run.a ? run.names[0] : run.names[1]);
  if (okMe && okOther) run.log.unshift(`✅ ${st.name}: прошли оба`);
  else if (okMe || okOther) {
    const helper = okMe ? me : other;
    const fell = okMe ? other : me;
    const pull = Math.min(DUO.pullMax, DUO.pullBase + helper.str * 0.003);
    if (rng() < pull) run.log.unshift(`🤝 ${st.name}: ${name(fell)} сорвался — ${name(helper)} вытащил!`);
    else {
      run.log.unshift(`🚨 ${st.name}: ${name(fell)} сорвался, ${name(helper)} не бросил — взяли обоих`);
      caught = true;
    }
  } else {
    run.log.unshift(`🚨 ${st.name}: взяли обоих`);
    caught = true;
  }
  run.log = run.log.slice(0, 12);
  if (!caught) run.stage += 1;
  if (!caught && run.stage >= ESCAPE_STAGES.length) caught = true;
  if (caught) return { resolved: true as const, ...duoFinish(me, other, run, true, now, rng) };
  run.log.unshift(`Дальше: ${ESCAPE_STAGES[run.stage].name}`);
  return { resolved: true as const, passed: true, stage: run.stage };
}

/** Конец забега для обоих: пойманы или вернулись тихо. */
export function duoFinish(a: Player, b: Player, run: DuoRun, caught: boolean, now: number, rng: Rng) {
  run.status = 'over';
  run.result = { caught, stage: run.stage };
  const rewards: Record<number, ReturnType<typeof escapeEnd>> = {};
  for (const pl of [a, b]) {
    if (pl.duo !== run.id) continue;
    pl.duo = null;
    pl.escape.run = { stage: run.stage, at: run.at };
    rewards[pl.id] = escapeEnd(pl, caught, now, rng, DUO.rewardMul);
  }
  return { caught, stage: run.stage, rewards };
}

// --- Обмен между игроками ---------------------------------------------------------------------

/** Проверить и привести строки обмена к порядку. */
export function tradeLines(raw: unknown): TradeLine[] {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length || list.length > TRADE.maxLines) throw new GameError(`От 1 до ${TRADE.maxLines} вещей с каждой стороны`);
  return list.map((x) => {
    const l = x as Record<string, unknown>;
    const kind = String(l.kind) as TradeKind;
    const ref = String(l.ref);
    const qty = Math.floor(Number(l.qty));
    if (!['item', 'mat', 'gear'].includes(kind)) throw new GameError('Такое не меняют');
    if (kind === 'item' && !consumableById.has(ref)) throw new GameError('Нет такой вещи');
    if (kind === 'mat' && !matById.has(ref as MatId)) throw new GameError('Нет такого материала');
    if (kind === 'gear' && !itemById.has(ref)) throw new GameError('Нет такого шмота');
    if (!(qty >= 1 && qty <= (kind === 'gear' ? 1 : TRADE.maxQty))) throw new GameError('Сколько штук?');
    return { kind, ref, qty };
  });
}

/** Предложить обмен: отдаваемое уходит в залог. */
export function tradeOffer(p: Player, to: Player, give: TradeLine[], want: TradeLine[], openCount: number, now: number) {
  if (p.id === to.id) throw new GameError('Сам с собой не меняются');
  if (p.level < TRADE.minLevel || to.level < TRADE.minLevel) throw new GameError(`Обмен — с ${TRADE.minLevel} уровня у обоих`);
  if (openCount >= TRADE.maxOpen) throw new GameError(`Не больше ${TRADE.maxOpen} открытых предложений`);
  const day = dayKey(now);
  if (p.tradesDay.day !== day) p.tradesDay = { day, n: 0 };
  if (p.tradesDay.n >= TRADE.perDay) throw new GameError('На сегодня обменов хватит');
  for (const l of give) takeGoods(p, l.kind, l.ref, l.qty);
  p.tradesDay.n++;
}

/** Принять: у второго берём то, что просили, и раздаём обоим. */
export function tradeAccept(to: Player, from: Player | null, give: TradeLine[], want: TradeLine[], now: number) {
  for (const l of want) if (l.kind === 'gear' && from?.inventory.includes(l.ref)) throw new GameError('Такая вещь у него уже есть');
  for (const l of give) if (l.kind === 'gear' && to.inventory.includes(l.ref)) throw new GameError('Такая вещь у тебя уже есть');
  for (const l of want) takeGoods(to, l.kind, l.ref, l.qty);
  for (const l of give) giveGoods(to, l.kind, l.ref, l.qty);
  if (from) for (const l of want) giveGoods(from, l.kind, l.ref, l.qty);
  log(to, now, `🔄 Обмен с ${from?.name ?? '?'} состоялся`);
  if (from) log(from, now, `🔄 ${to.name} принял твой обмен`);
}

/** Вернуть залог (отказ, отмена, протухло). */
export function tradeRefund(from: Player, give: TradeLine[]) {
  for (const l of give) giveGoods(from, l.kind, l.ref, l.qty);
}

// --- Турнир за столами: нарды с живыми игроками ---------------------------------------------

export interface Duel {
  id: string;
  ids: [number, number];
  names: [string, string];
  pos: [number, number];
  /** чей ход: 0 или 1 */
  turn: 0 | 1;
  dice: [number, number];
  status: 'play' | 'over';
  winner: 0 | 1 | null;
  forfeit: boolean;
  week: number;
  at: number;
  turnAt: number;
  log: string[];
}

export function duelNew(a: Player, b: Player, now: number, rng: Rng): Duel {
  if (a.id === b.id) throw new GameError('С самим собой не играют');
  if (a.level < TOURNEY.minLevel || b.level < TOURNEY.minLevel) throw new GameError(`Турнир — с ${TOURNEY.minLevel} уровня`);
  const day = dayKey(now);
  if (a.duelsDay.day !== day) a.duelsDay = { day, n: 0 };
  if (a.duelsDay.n >= TOURNEY.perDay) throw new GameError('На сегодня партий хватит');
  a.duelsDay.n++;
  // кто ходит первым — жребий
  const turn: 0 | 1 = rng() < 0.5 ? 0 : 1;
  return {
    id: `${a.id}-${b.id}-${now}`,
    ids: [a.id, b.id],
    names: [a.name, b.name],
    pos: [0, 0],
    turn,
    dice: [die(rng), die(rng)],
    status: 'play',
    winner: null,
    forfeit: false,
    week: weekIndex(now),
    at: now,
    turnAt: now,
    log: [`Жребий: первым ходит ${[a.name, b.name][turn]}`],
  };
}

/** Ход: выбрать кубик или сумму. Возвращает, кончилась ли партия. */
export function duelMove(d: Duel, pid: number, pick: NardyPick, now: number, rng: Rng) {
  if (d.status !== 'play') throw new GameError('Партия окончена');
  const idx = d.ids.indexOf(pid);
  if (idx < 0) throw new GameError('Это не твоя партия');
  const me = idx as 0 | 1;
  if (d.turn !== me) throw new GameError('Сейчас ход соперника');
  if (!['a', 'b', 'sum'].includes(pick)) throw new GameError('Нет такого хода');
  const step = nardyStep(d.dice, pick);
  const from = d.pos[me];
  d.pos[me] = nardyLand(from, step);
  const note = d.pos[me] < from + step && d.pos[me] < NARDY.finish ? ' (ловушка!)' : d.pos[me] > from + step ? ' (мостик!)' : '';
  d.log.unshift(`${d.names[me]}: ${d.dice.join('·')} → ${pick === 'sum' ? 'сумма' : 'кубик'} ${step}, клетка ${d.pos[me]}${note}`);
  d.log = d.log.slice(0, 10);
  d.turnAt = now;
  if (d.pos[me] >= NARDY.finish) {
    d.status = 'over';
    d.winner = me;
    d.log.unshift(`🏆 ${d.names[me]} выиграл`);
    return { over: true, winner: me };
  }
  d.turn = me === 0 ? 1 : 0;
  d.dice = [die(rng), die(rng)];
  return { over: false, winner: null };
}

/** Соперник не ходит дольше срока — забрать победу (поменьше очков). Или сдаться самому. */
export function duelForfeit(d: Duel, pid: number, now: number, resign: boolean) {
  if (d.status !== 'play') throw new GameError('Партия окончена');
  const idx = d.ids.indexOf(pid);
  if (idx < 0) throw new GameError('Это не твоя партия');
  const me = idx as 0 | 1;
  const other: 0 | 1 = me === 0 ? 1 : 0;
  if (!resign) {
    if (d.turn === me) throw new GameError('Сейчас твой ход');
    if (now - d.turnAt < TOURNEY.turnH * 60 * MIN) throw new GameError('Соперник ещё может походить');
  }
  const winner: 0 | 1 = resign ? other : me;
  d.winner = winner;
  d.status = 'over';
  d.forfeit = true;
  d.log.unshift(resign ? `🏳️ ${d.names[me]} сдался` : `⌛ ${d.names[other]} пропал — победа ${d.names[winner]}`);
}

/** Очки турнира за законченную партию: [первому, второму]. */
export function duelPoints(d: Duel): [number, number] {
  if (d.winner === null) return [0, 0];
  const w = d.forfeit ? TOURNEY.forfeitWin : TOURNEY.win;
  return d.winner === 0 ? [w, TOURNEY.loss] : [TOURNEY.loss, w];
}

/** Приз за прошлую неделю: место в таблице считает сервер. */
export function tourneyClaim(p: Player, week: number, rank: number | null, now: number) {
  if (p.tourneyClaimed >= week) throw new GameError('Приз за ту неделю уже получен');
  if (rank === null || rank >= TOURNEY.topGold.length) throw new GameError('Приз — первым трём');
  p.tourneyClaimed = week;
  const gold = TOURNEY.topGold[rank];
  p.gold += gold;
  log(p, now, `🎲 Турнир за столами: ${rank + 1} место, +${gold} 🪙`);
  return { gold, rank: rank + 1 };
}

// --- Слово дня по фене ------------------------------------------------------------------------

/** Номер дня по Москве — общий для всех. */
export const dayIndex = (now: number) => Math.floor((now + 3 * 60 * MIN) / (24 * 60 * MIN));

export function ensureWord(p: Player, now: number) {
  const d = dayIndex(now);
  if (p.word.day !== d) p.word = { day: d, guesses: [], done: false, won: false };
}

export function wordGuess(p: Player, raw: string, now: number) {
  ensureWord(p, now);
  if (p.word.done) throw new GameError('На сегодня всё — новое слово завтра');
  const ans = wordOfDay(p.word.day);
  const g = normWord(raw);
  if (g.length !== ans.word.length) throw new GameError(`Нужно слово из ${ans.word.length} букв`);
  p.word.guesses.push(g);
  const marks = markGuess(g, ans.word);
  const won = g === normWord(ans.word);
  let reward: { money: number; butts: number; gold: number } | null = null;
  if (won || p.word.guesses.length >= WORD.tries) {
    p.word.done = true;
    p.word.won = won;
    if (won) {
      const d = p.word.day;
      p.wordStreak.n = p.wordStreak.last === d - 1 ? p.wordStreak.n + 1 : 1;
      p.wordStreak.last = d;
      p.wordStreak.best = Math.max(p.wordStreak.best, p.wordStreak.n);
      const left = WORD.tries - p.word.guesses.length;
      const gold = WORD.streakGold.find(([n]) => n === p.wordStreak.n)?.[1] ?? 0;
      reward = { money: Math.round(ration(p) * (2 + left)), butts: 3 + left, gold };
      p.money += reward.money;
      p.butts += reward.butts;
      p.gold += gold;
      track(p, 'minigame');
    } else p.wordStreak.n = 0;
  }
  return { marks, won, done: p.word.done, reward, answer: p.word.done ? ans.word : null, meaning: p.word.done ? ans.meaning : null, tries: p.word.guesses.length };
}

// --- Питомцы -------------------------------------------------------------------------------------

/** Уровень пользы питомца нужного вида (0 — нет такого); голодный — вдвое слабее. */
export function petPower(p: Player, kind: PetKind, now: number): number {
  const pet = p.pet;
  if (!pet || pet.kind !== kind) return 0;
  return now - pet.fedAt > PET.hungryH * 60 * MIN ? pet.level / 2 : pet.level;
}

export const petParcels = (p: Player, now: number) => (p.pet?.kind === 'pigeon' ? 1 + Math.floor(petPower(p, 'pigeon', now) / 4) : 0);

/** Крыса притащила: расходник или материал. */
function petFind(p: Player, now: number, rng: Rng): string | null {
  const lvl = petPower(p, 'rat', now);
  if (!lvl || rng() >= (3 + lvl) / 100) return null;
  if (rng() < 0.5) {
    const id = rollConsumable(rng);
    giveItem(p, id);
    log(p, now, `🐀 ${p.pet!.name} притащила: ${consumableById.get(id)?.emoji ?? ''} ${consumableById.get(id)?.name ?? id}`);
    return id;
  }
  const m = rollMat(rng);
  giveMats(p, { [m]: 1 });
  log(p, now, `🐀 ${p.pet!.name} притащила: ${matById.get(m)?.emoji ?? ''} ${matById.get(m)?.name ?? m}`);
  return m;
}

function petXp(p: Player, xp: number, now: number) {
  const pet = p.pet!;
  if (pet.level >= PET.maxLevel) return false;
  pet.xp += xp;
  let up = false;
  while (pet.level < PET.maxLevel && pet.xp >= PET.xpTo(pet.level)) {
    pet.xp -= PET.xpTo(pet.level);
    pet.level++;
    up = true;
  }
  if (up) log(p, now, `🐾 ${pet.name} подрос: ${pet.level} уровень`);
  return up;
}

export function petBuy(p: Player, kind: string, name: string, now: number) {
  const def = petByKind.get(kind as PetKind);
  if (!def) throw new GameError('Такого не держат');
  if (p.pet) throw new GameError('Питомец уже есть');
  if (p.level < def.minLevel) throw new GameError(`С ${def.minLevel} уровня`);
  spend(p, def.price, 'money');
  const nm = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 16) || def.name;
  p.pet = { kind: def.kind, name: nm, level: 1, xp: 0, fedAt: now, trainAt: 0 };
  log(p, now, `${def.emoji} В хате завёлся ${def.name.toLowerCase()} — ${nm}`);
  return p.pet;
}

export function petFeed(p: Player, now: number) {
  const pet = p.pet;
  if (!pet) throw new GameError('Питомца нет');
  if (now - pet.fedAt < PET.feedH * 60 * MIN) throw new GameError('Ещё сытый');
  if (p.butts < PET.feedButts) throw new GameError(`Нужно ${PET.feedButts} 🚬 на корм`);
  p.butts -= PET.feedButts;
  pet.fedAt = now;
  const up = petXp(p, PET.feedXp, now);
  // кот на руках — лечит
  let heal = 0;
  if (pet.kind === 'cat') {
    const max = stats(p, now).maxHp;
    heal = Math.min(max - p.hp, Math.round(max * (10 + 2 * pet.level) / 100));
    p.hp += heal;
  }
  return { up, heal, level: pet.level };
}

export function petTrain(p: Player, now: number) {
  const pet = p.pet;
  if (!pet) throw new GameError('Питомца нет');
  if (now - pet.trainAt < PET.trainH * 60 * MIN) throw new GameError('Устал — дай отдохнуть');
  spendEnergy(p, PET.trainEnergy, now);
  pet.trainAt = now;
  return { up: petXp(p, PET.trainXp, now), level: pet.level };
}

// --- Праздники -----------------------------------------------------------------------------------

/** Праздник, включённый админом поверх календаря (ставит app из kv). */
export const holidayForce: { run: HolidayRun | null } = { run: null };
export const curHoliday = (now: number) => holidayAt(now, holidayForce.run);

/** Текущий праздник и состояние игрока в нём (сброс, если праздник сменился). */
export function ensureHol(p: Player, now: number) {
  const run = curHoliday(now);
  if (!run) return null;
  const def = holidayById.get(run.id)!;
  if (p.hol.id !== run.id || p.hol.key !== run.key)
    p.hol = { id: run.id, key: run.key, prog: def.tasks.map(() => 0), claimed: def.tasks.map(() => false), tokens: 0, day: -1, bought: {}, tree: false, armBest: 0, eggAt: 0 };
  return { run, def };
}

function holTrack(p: Player, kind: HolKind, now: number, amount = 1) {
  const h = ensureHol(p, now);
  if (!h) return;
  h.def.tasks.forEach((t, i) => {
    if (t.kind === kind && !p.hol.claimed[i]) p.hol.prog[i] = Math.min(t.n, (p.hol.prog[i] ?? 0) + amount);
  });
}

function needHol(p: Player, now: number) {
  const h = ensureHol(p, now);
  if (!h) throw new GameError('Сейчас не праздник');
  return h;
}

/** Праздничный грев раз в сутки; под наряженной ёлкой — больше. */
export function holDaily(p: Player, now: number) {
  const { def } = needHol(p, now);
  const d = dayIndex(now);
  if (p.hol.day === d) throw new GameError('Сегодня уже получал');
  p.hol.day = d;
  const n = def.daily + (p.hol.tree ? 2 : 0);
  p.hol.tokens += n;
  return { tokens: n };
}

export function holClaim(p: Player, index: number, now: number) {
  const { def } = needHol(p, now);
  const t = def.tasks[index];
  if (!t) throw new GameError('Нет такого задания');
  if (p.hol.claimed[index]) throw new GameError('Уже получено');
  if ((p.hol.prog[index] ?? 0) < t.n) throw new GameError('Задание не выполнено');
  p.hol.claimed[index] = true;
  p.hol.tokens += t.tokens;
  return { tokens: t.tokens };
}

export function holBuy(p: Player, itemId: string, now: number) {
  const { def } = needHol(p, now);
  const it = def.shop.find((x) => x.id === itemId);
  if (!it) throw new GameError('Такого нет');
  const had = p.hol.bought[it.id] ?? 0;
  if (had >= (it.max ?? 1)) throw new GameError('Больше не дают');
  if (it.give.cosmetic && p.cosmetics.includes(it.give.cosmetic)) throw new GameError('Уже есть');
  if (p.hol.tokens < it.cost) throw new GameError(`Не хватает: ${def.token.name}`);
  p.hol.tokens -= it.cost;
  p.hol.bought[it.id] = had + 1;
  const g = it.give;
  if (g.cosmetic) p.cosmetics.push(g.cosmetic);
  if (g.gold) p.gold += g.gold;
  if (g.chifir) p.chifir += g.chifir;
  if (g.butts) p.butts += g.butts;
  let heal = 0;
  if (g.heal) {
    const max = stats(p, now).maxHp;
    heal = Math.min(max - p.hp, Math.round((max * g.heal) / 100));
    p.hp += heal;
  }
  return { heal };
}

/** Новый год: нарядить ёлку в хате. */
export function holTree(p: Player, now: number) {
  const { run } = needHol(p, now);
  if (run.id !== 'newyear') throw new GameError('Ёлку ставят на Новый год');
  if (p.hol.tree) throw new GameError('Ёлка уже стоит');
  p.hol.tree = true;
  holTrack(p, 'tree', now);
  log(p, now, '🎄 В хате нарядили ёлку');
}

/** Пасха: битки яйцами с сокамерником. Сила яйца — немного от удачи и от силы руки. */
export function holEgg(p: Player, now: number, rng: Rng) {
  const { run } = needHol(p, now);
  if (run.id !== 'easter') throw new GameError('Яйцами бьются на Пасху');
  if (now - p.hol.eggAt < EGG.cooldownMin * MIN) throw new GameError('Новое яйцо ещё сохнет');
  if (p.hol.tokens < 1) throw new GameError('Нет ни одной крашенки');
  p.hol.eggAt = now;
  const won = rng() < EGG.winBase + Math.min(0.1, p.str / 1000);
  p.hol.tokens += won ? 1 : -1;
  holTrack(p, 'egg', now);
  return { won };
}

// --- Стройка зоны --------------------------------------------------------------------------------

/** Что уже построено всей зоной (ставит app из kv). */
export const zoneBuilt: { done: string[] } = { done: [] };
const zoneB = (k: BuildBonus) => buildBonus(zoneBuilt.done, k);

/** Взнос в стройку: деньги или материалы. Возвращает очки; общий счёт ведёт app. */
export function buildGive(p: Player, kind: 'money' | 'mat', ref: string, qty: number, now: number) {
  const n = Math.floor(Number(qty) || 0);
  if (n <= 0) throw new GameError('Сколько даёшь?');
  let pts: number;
  if (kind === 'money') {
    if (!BUILD.money.includes(n)) throw new GameError('Такой взнос не принимают');
    spend(p, n, 'money');
    pts = n;
  } else {
    const m = matById.get(ref as MatId);
    if (!m) throw new GameError('Такого материала нет');
    if ((p.mats[m.id] ?? 0) < n) throw new GameError(`Не хватает: ${m.name}`);
    p.mats[m.id] = (p.mats[m.id] ?? 0) - n;
    pts = n * BUILD.matPts;
  }
  const before = p.built;
  p.built += pts;
  const auth = Math.floor(p.built / BUILD.authorityPer) - Math.floor(before / BUILD.authorityPer);
  p.authority += auth;
  let title = false;
  if (p.built >= BUILD.titleAt && !p.cosmetics.includes('title_builder')) {
    p.cosmetics.push('title_builder');
    title = true;
  }
  log(p, now, `🏗️ Вложился в стройку зоны: ${pts} очков`);
  return { pts, authority: auth, title };
}

// --- Суд и апелляция -----------------------------------------------------------------------------

function ensureAppeal(p: Player) {
  if (p.appeal.hodka !== p.hodka) p.appeal = { hodka: p.hodka, args: [], done: false, won: false, delta: 0 };
  return p.appeal;
}

/** Собрать довод для апелляции. */
export function courtArg(p: Player, id: string, now: number) {
  if (p.level < COURT.minLevel) throw new GameError(`С ${COURT.minLevel} уровня`);
  const a = ensureAppeal(p);
  if (a.done) throw new GameError('Апелляция в эту ходку уже была');
  const arg = courtArgById.get(id as ArgId);
  if (!arg) throw new GameError('Такого довода нет');
  if (a.args.includes(arg.id)) throw new GameError('Этот довод уже собран');
  switch (arg.id) {
    case 'lawyer':
      spend(p, COURT.lawyerPerLevel * p.level, 'money');
      break;
    case 'work':
    case 'admin':
      if (repRank(p.rep[arg.id]) < COURT.repRank) throw new GameError(`Нужно звание ${COURT.repRank}+`);
      break;
    case 'witness':
      if (p.authority < COURT.witnessAuthorityPerLevel * p.level) throw new GameError('Мало авторитета — никто не пойдёт');
      if (p.butts < COURT.witnessButts) throw new GameError(`Свидетелям нужно ${COURT.witnessButts} 🚬`);
      p.butts -= COURT.witnessButts;
      break;
    case 'church':
      if (p.blessUntil <= now) throw new GameError('Сначала благословение в церкви');
      break;
    case 'medic':
      spend(p, COURT.medicGold, 'gold');
      break;
  }
  a.args.push(arg.id);
  return { chance: courtChance(a.args) };
}

/** Заседание: шанс от доводов; удача — скостят часть срока, провал — добавят. */
export function courtHearing(p: Player, now: number, rng: Rng) {
  if (p.level < COURT.minLevel) throw new GameError(`С ${COURT.minLevel} уровня`);
  const a = ensureAppeal(p);
  if (a.done) throw new GameError('Апелляция в эту ходку уже была');
  if (p.term < COURT.minTerm) throw new GameError('Срок и так почти вышел');
  const chance = courtChance(a.args);
  a.done = true;
  a.won = rng() * 100 < chance;
  if (a.won) {
    const pct = COURT.cut[0] + rng() * (COURT.cut[1] - COURT.cut[0]);
    a.delta = -Math.round((p.term * pct) / 100);
    log(p, now, `⚖️ Апелляция удовлетворена: −${-a.delta} дн. срока`);
  } else {
    a.delta = Math.round((termDays(p.hodka) * COURT.add) / 100);
    log(p, now, `⚖️ В апелляции отказали и добавили ${a.delta} дн.`);
  }
  p.term = Math.max(0, p.term + a.delta);
  return { won: a.won, delta: a.delta, chance };
}

// --- Заочница ------------------------------------------------------------------------------------

export function penStart(p: Player, now: number, rng: Rng) {
  if (p.level < PENPAL.minLevel) throw new GameError(`С ${PENPAL.minLevel} уровня`);
  if (p.penpal && (!p.penpal.ending || p.penpal.hodka === p.hodka)) throw new GameError(p.penpal.ending ? 'Новая заочница — в следующую ходку' : 'Переписка уже идёт');
  const name = PENPAL_GIRLS[Math.floor(rng() * PENPAL_GIRLS.length)];
  p.penpal = { hodka: p.hodka, name, scam: rng() < 0.35, step: 0, love: 0, suspect: 0, paid: 0, nextAt: now, ending: null, picks: [] };
  return { name };
}

/** Ответить на письмо: посылка из конверта, выбор ответа, следующее письмо через несколько часов. */
export function penReply(p: Player, choice: number, now: number, rng: Rng) {
  const s = p.penpal;
  if (!s || s.ending) throw new GameError('Писем нет');
  if (now < s.nextAt) throw new GameError('Письмо ещё в пути');
  const letter = PEN_LETTERS[s.step];
  const c = letter.choices[choice];
  if (!c) throw new GameError('Нет такого ответа');
  if (c.pay) spend(p, PENPAL.moneyAsk, 'money');
  // посылка: у честной — всегда, у аферистки — только первая, для доверия
  const got: { butts?: number; heal?: number; item?: string; money?: number } = {};
  const pc = letter.parcel;
  if (pc && (!s.scam || s.step === 1)) {
    if (pc.butts) p.butts += got.butts = pc.butts;
    if (pc.money) p.money += got.money = pc.money;
    if (pc.item) giveItem(p, (got.item = rollConsumable(rng)));
    if (pc.heal) {
      const max = stats(p, now).maxHp;
      got.heal = Math.min(max - p.hp, Math.round((max * pc.heal) / 100));
      p.hp += got.heal;
    }
  }
  s.love += c.love;
  s.suspect += c.suspect ?? 0;
  if (c.pay) s.paid++;
  s.picks.push(choice);
  s.step++;
  s.nextAt = now + PENPAL.gapH * 60 * MIN;
  let ending: PenEnding | null = null;
  if (s.step >= PEN_LETTERS.length) {
    ending = s.ending = penEnding(s);
    const e = PEN_ENDINGS[ending];
    p.gold += e.gold;
    if (e.cosmetic && !p.cosmetics.includes(e.cosmetic)) p.cosmetics.push(e.cosmetic);
    log(p, now, `${e.emoji} Заочница: ${e.title}`);
  }
  return { got, ending };
}

// --- Малявы --------------------------------------------------------------------------------------

/** Отправить маляву. Перехват: бычки пропадают, отправителю добавляют срок. */
export function malyavaSend(p: Player, to: Player, msgId: string, butts: number, safe: boolean, now: number, rng: Rng) {
  if (p.level < MALYAVA.minLevel) throw new GameError(`С ${MALYAVA.minLevel} уровня`);
  if (to.id === p.id) throw new GameError('Себе не пишут');
  const m = malyavaById.get(msgId);
  if (!m) throw new GameError('Что писать-то?');
  const b = Math.floor(Number(butts) || 0);
  if (!MALYAVA.butts.includes(b)) throw new GameError('Столько не вложишь');
  if (p.butts < b) throw new GameError('Не хватает бычков');
  playLimit(p, 'malyava', MALYAVA.perDay, now);
  if (safe) spend(p, MALYAVA.safeGold, 'gold');
  p.butts -= b;
  const caught = !safe && rng() * 100 < (m.risky ? MALYAVA.interceptRisky : MALYAVA.intercept);
  if (caught) {
    const days = m.risky ? MALYAVA.termPenaltyRisky : MALYAVA.termPenalty;
    p.term += days;
    log(p, now, `👮 Маляву для ${to.name} перехватили. Кум читал вслух, тебе +${days} дн.`);
    return { caught: true, days };
  }
  to.inbox.unshift({ id: now + Math.floor(rng() * 1000), from: p.id, fromName: p.name, msg: m.id, butts: b, at: now, read: false });
  to.inbox.length = Math.min(to.inbox.length, MALYAVA.inbox);
  to.butts += b;
  return { caught: false, days: 0 };
}

export function malyavaRead(p: Player) {
  for (const m of p.inbox) m.read = true;
}

// --- Кольщик -------------------------------------------------------------------------------------

export function inkBecome(p: Player) {
  if (p.level < INK.minLevel) throw new GameError(`С ${INK.minLevel} уровня`);
  if (p.ink) throw new GameError('Машинка уже есть');
  spend(p, INK.machinePrice, 'money');
  p.ink = { skill: 0, jobs: 0, stars: 0, votes: 0, queue: [] };
}

/** Заказать наколку у мастера: деньги вперёд, заказ в очередь мастера. */
export function inkOrder(p: Player, artist: Player, tattooId: string, now: number) {
  if (!artist.ink) throw new GameError('Он не кольщик');
  if (artist.id === p.id) throw new GameError('Сам себе не набьёшь — попроси другого');
  if (p.inkOrder && !p.inkOrder.done) throw new GameError('Уже ждёшь одну наколку');
  const t = tattooById.get(tattooId);
  if (!t || t.currency !== 'money') throw new GameError('Такую мастер не бьёт');
  if (p.tattoos.includes(t.id)) throw new GameError('Уже набита');
  if (p.level < t.minLevel) throw new GameError(`Доступно с ${t.minLevel} уровня`);
  if (p.authority < t.minAuthority) throw new GameError(`Нужно ${t.minAuthority} авторитета`);
  if (artist.ink.queue.length >= INK.queue) throw new GameError('У мастера очередь');
  const paid = Math.round(t.price * INK.discount);
  spend(p, paid, 'money');
  const id = now;
  artist.ink.queue.push({ id, client: p.id, clientName: p.name, tattoo: t.id, paid, at: now });
  p.inkOrder = { artist: artist.id, artistName: artist.name, tattoo: t.id, at: now, id, done: false, quality: 0, rated: false };
  return { paid };
}

/** Мастер бьёт наколку из очереди: acc — точность иглы в мини-игре (0..1). */
export function inkDo(artist: Player, client: Player | null, orderId: number, acc: number, now: number) {
  const ink = artist.ink;
  if (!ink) throw new GameError('Машинки нет');
  const i = ink.queue.findIndex((o) => o.id === orderId);
  if (i < 0) throw new GameError('Нет такого заказа');
  const o = ink.queue[i];
  ink.queue.splice(i, 1);
  const quality = inkQuality(ink.skill, Number(acc) || 0);
  const t = tattooById.get(o.tattoo)!;
  artist.money += o.paid;
  ink.jobs++;
  ink.skill = Math.min(100, ink.skill + INK.skillPerJob + (acc >= INK.skillBonusAcc ? 1 : 0));
  const crooked = quality < INK.crooked;
  if (client && client.inkOrder?.id === o.id) {
    if (!client.tattoos.includes(t.id)) client.tattoos.push(t.id);
    client.inkOrder = { ...client.inkOrder, done: true, quality };
    if (crooked) client.authority = Math.max(0, client.authority - INK.crookedAuthority);
    log(client, now, `${t.emoji} ${artist.name} набил «${t.name}»${crooked ? ' — криво, братва ржёт' : `, качество ${quality}%`}`);
  }
  log(artist, now, `🖋️ Набил «${t.name}» для ${o.clientName}: ${quality}%`);
  return { quality, crooked, paid: o.paid, skill: ink.skill };
}

/** Клиент оценивает мастера. */
export function inkRate(p: Player, artist: Player | null, stars: number) {
  const o = p.inkOrder;
  if (!o || !o.done) throw new GameError('Нечего оценивать');
  if (o.rated) throw new GameError('Уже оценил');
  const n = Math.max(1, Math.min(5, Math.round(Number(stars) || 0)));
  o.rated = true;
  if (artist?.ink) {
    artist.ink.stars += n;
    artist.ink.votes++;
  }
  return { stars: n };
}

/** Мастер не успел за сутки — клиент забирает деньги. */
export function inkCancel(p: Player, artist: Player | null, now: number) {
  const o = p.inkOrder;
  if (!o || o.done) throw new GameError('Нечего отменять');
  if (now - o.at < INK.cancelH * 60 * MIN) throw new GameError(`Отменить можно через ${INK.cancelH} ч`);
  const q = artist?.ink?.queue.find((x) => x.id === o.id);
  if (artist?.ink) artist.ink.queue = artist.ink.queue.filter((x) => x.id !== o.id);
  p.money += q?.paid ?? Math.round((tattooById.get(o.tattoo)?.price ?? 0) * INK.discount);
  p.inkOrder = null;
}

// --- Бараки --------------------------------------------------------------------------------------

/** Кто держит бараки на этой неделе (ставит app из kv по итогам прошлой). */
export const barracks: { owners: Record<string, number> } = { owners: {} };
const barB = (p: Player, k: BarrackBonus) => barrackBonus(barracks.owners, p.clanId, k);

/** Набег на барак: энергия, лимит в день; влияние идёт клану (считает app). */
export function barrackRaid(p: Player, barrackId: string, now: number, rng: Rng) {
  if (!p.clanId) throw new GameError('Бараки делят кланы — вступи в клан');
  if (p.level < BARRACK.minLevel) throw new GameError(`С ${BARRACK.minLevel} уровня`);
  const b = barrackById.get(barrackId);
  if (!b) throw new GameError('Нет такого барака');
  playLimit(p, 'raid', BARRACK.perDay, now);
  spendEnergy(p, BARRACK.energy, now);
  const pts = raidPts(p.str, rng());
  warPoints(p, now, 1);
  return { pts };
}

// --- Доля с покупок кентов -----------------------------------------------------------------------

/** Кент что-то купил: пригласившему — доля золотом. */
export function refDonate(ref: Player, from: Player, stars: number, share: number, now: number) {
  const gold = refDonateGold(stars, share);
  ref.gold += gold;
  ref.refEarn.total += gold;
  ref.refEarn.by[from.id] = (ref.refEarn.by[from.id] ?? 0) + gold;
  log(ref, now, `🤝 ${from.name} поддержал зону — тебе ${gold} 🪙 (${Math.round(share * 100)}%)`);
  return gold;
}

// --- Свиданка с роднёй ---------------------------------------------------------------------------

const famBuff = (p: Player, now: number) => (p.family.buffUntil > now ? p.family.buffPct : 0);

/** Кто приедет на этой неделе и о чём будут говорить. */
export function ensureFamily(p: Player, now: number) {
  const w = weekIndex(now);
  if (p.family.week !== w) {
    const married = p.cosmetics.includes('title_married');
    const who: Visitor = married && w % 2 === 1 ? 'wife' : 'mom';
    const rng = seeded(`fam:${p.id}:${w}`);
    const pool = FAMILY_ROUNDS[who].map((_, i) => i);
    const rounds: number[] = [];
    while (rounds.length < 3) rounds.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    p.family = { ...p.family, week: w, who, rounds, picks: [], mood: 0, done: false };
  }
  return p.family;
}

/** Ответ на реплику; после третьей — передача и бафф на сутки. */
export function familyTalk(p: Player, choice: number, now: number, rng: Rng) {
  if (p.level < FAMILY.minLevel) throw new GameError(`С ${FAMILY.minLevel} уровня`);
  const f = ensureFamily(p, now);
  if (f.done) throw new GameError('На этой неделе уже виделись');
  const round = FAMILY_ROUNDS[f.who][f.rounds[f.picks.length]];
  const o = round.options[choice];
  if (!o) throw new GameError('Нет такого ответа');
  f.picks.push(choice);
  f.mood += o.mood;
  if (f.picks.length < f.rounds.length) return { mood: f.mood, end: null };
  f.done = true;
  const out = familyOutcome(f.mood);
  p.butts += out.butts;
  const money = out.rations * ration(p);
  p.money += money;
  const items: string[] = [];
  for (let i = 0; i < out.items; i++) {
    const id = rollConsumable(rng);
    giveItem(p, id);
    items.push(id);
  }
  if (out.buffPct) {
    f.buffPct = out.buffPct;
    f.buffUntil = now + FAMILY.buffH * 60 * MIN;
  }
  log(p, now, `👪 Свиданка: ${out.title}`);
  return { mood: f.mood, end: { ...out, money, items } };
}

// --- Подкоп --------------------------------------------------------------------------------------

export function ensureTunnel(p: Player) {
  if (p.tunnel.hodka !== p.hodka) p.tunnel = { hodka: p.hodka, depth: 0, digAt: 0, masked: 0, found: 0, done: false };
  return p.tunnel;
}

/** Копнуть: acc — как ловко копал в мини-игре (0..1). */
export function tunnelDig(p: Player, acc: number, now: number, rng: Rng) {
  if (p.level < TUNNEL.minLevel) throw new GameError(`С ${TUNNEL.minLevel} уровня`);
  const t = ensureTunnel(p);
  if (t.done) throw new GameError('Ты уже ушёл подкопом в эту ходку');
  if (t.depth >= TUNNEL.goal) throw new GameError('Лаз готов — пора уходить');
  if (now - t.digAt < TUNNEL.cooldownH * 60 * MIN) throw new GameError('Шумно копать подряд — вертухай услышит');
  spendEnergy(p, TUNNEL.energy, now);
  t.digAt = now;
  const risk = (t.masked > 0 ? TUNNEL.riskMasked : TUNNEL.risk) * (live.cur?.id === 'shmon' ? 2 : 1);
  if (t.masked > 0) t.masked--;
  if (rng() * 100 < risk) {
    const lost = Math.round(t.depth * TUNNEL.collapse * 10) / 10;
    t.depth = Math.round((t.depth - lost) * 10) / 10;
    t.found++;
    p.term += TUNNEL.foundTerm;
    log(p, now, `🔦 Шмон нашёл лаз: засыпали ${lost} м, тебе +${TUNNEL.foundTerm} дн.`);
    return { found: true, lost, dug: 0, depth: t.depth };
  }
  const dug = Math.round((TUNNEL.base + Math.max(0, Math.min(1, Number(acc) || 0)) * TUNNEL.hand) * 10) / 10;
  t.depth = Math.min(TUNNEL.goal, Math.round((t.depth + dug) * 10) / 10);
  return { found: false, lost: 0, dug, depth: t.depth };
}

/** Замаскировать лаз досками и тряпьём: несколько раскопок почти без риска. */
export function tunnelMask(p: Player) {
  const t = ensureTunnel(p);
  if (t.done) throw new GameError('Лаз уже не нужен');
  if (t.masked > 0) throw new GameError('Уже замаскирован');
  for (const [m, n] of Object.entries(TUNNEL.mask.mats)) if ((p.mats[m as MatId] ?? 0) < n) throw new GameError(`Не хватает: ${matById.get(m as MatId)?.name}`);
  for (const [m, n] of Object.entries(TUNNEL.mask.mats)) p.mats[m as MatId] = (p.mats[m as MatId] ?? 0) - n;
  t.masked = TUNNEL.mask.digs;
}

/** Уйти подкопом: половина оставшегося срока долой, авторитет и титул. */
export function tunnelEscape(p: Player, now: number) {
  const t = ensureTunnel(p);
  if (t.done) throw new GameError('Уже уходил');
  if (t.depth < TUNNEL.goal) throw new GameError('Ещё не докопал');
  t.done = true;
  const cut = Math.round(p.term * TUNNEL.cut * 10) / 10;
  p.term = Math.max(0, Math.round((p.term - cut) * 10) / 10);
  p.authority += TUNNEL.authority;
  if (!p.cosmetics.includes('title_mole')) p.cosmetics.push('title_mole');
  log(p, now, `⛏️ Ушёл подкопом! −${cut} дн. срока`);
  return { cut };
}

// --- Контрабанда и ночной шмон -------------------------------------------------------------------

const contraCount = (p: Player) => Object.values(p.contra.have).reduce((a, b) => a + (b ?? 0), 0);

/** Сегодня пора на шмон: держишь товар, шмона сегодня не было, и выпало. */
export function shmonDue(p: Player, now: number) {
  const d = dayIndex(now);
  return contraCount(p) > 0 && p.contra.shmonDay !== d && shmonTonight(p.id, d);
}

export function contraTrade(p: Player, good: string, qty: number, buy: boolean, now: number) {
  if (p.level < CONTRA.minLevel) throw new GameError(`С ${CONTRA.minLevel} уровня`);
  const g = goodById.get(good as GoodId);
  if (!g) throw new GameError('Такого не возят');
  const n = Math.floor(Number(qty) || 0);
  if (n < 1 || n > CONTRA.cap) throw new GameError('Сколько?');
  if (shmonDue(p, now)) throw new GameError('Шмон на подходе — сначала спрячь товар');
  const price = goodPrice(g, dayIndex(now));
  if (buy) {
    if (contraCount(p) + n > CONTRA.cap) throw new GameError(`Больше ${CONTRA.cap} не спрятать`);
    const cost = Math.round(price * CONTRA.buyMul) * n;
    spend(p, cost, 'money');
    p.contra.have[g.id] = (p.contra.have[g.id] ?? 0) + n;
    p.contra.spent += cost;
    return { money: -cost };
  }
  if ((p.contra.have[g.id] ?? 0) < n) throw new GameError('Столько нет');
  const got = Math.round(price * CONTRA.sellMul) * n;
  p.contra.have[g.id] = (p.contra.have[g.id] ?? 0) - n;
  p.money += got;
  p.contra.earned += got;
  return { money: got };
}

/** Ночной шмон: игрок разложил товар по тайникам; вертухай проверяет каждый тайник со своим шансом. */
export function shmonHide(p: Player, hide: Record<string, string>, now: number, rng: Rng) {
  if (!shmonDue(p, now)) throw new GameError('Сегодня тихо');
  p.contra.shmonDay = dayIndex(now);
  const used = new Set<string>();
  const lost: Partial<Record<GoodId, number>> = {};
  const checked: string[] = [];
  const spotFound: Record<string, boolean> = {};
  for (const s of HIDE_SPOTS) {
    spotFound[s.id] = rng() < s.find;
    if (spotFound[s.id]) checked.push(s.id);
  }
  for (const [gid, n] of Object.entries(p.contra.have) as [GoodId, number][]) {
    if (!n) continue;
    const spot = HIDE_SPOTS.find((s) => s.id === hide?.[gid]);
    // не спрятал или в один тайник два товара — найдут
    const caught = !spot || used.has(spot.id) || spotFound[spot.id];
    if (spot) used.add(spot.id);
    if (caught) {
      lost[gid] = n;
      p.contra.have[gid] = 0;
    }
  }
  const any = Object.keys(lost).length > 0;
  log(p, now, any ? '🔦 Ночной шмон: часть товара изъяли' : '🔦 Ночной шмон: ничего не нашли');
  return { lost, checked };
}

// --- Бунт ----------------------------------------------------------------------------------------

/** После проигранного бунта гайки закручены до этого времени (ставит app). */
export const riotPenalty = { until: 0 };

/** Удар по волне ОМОНа: энергия и откат; урон от атаки. */
export function riotHit(p: Player, lastAt: number, now: number, rng: Rng) {
  if (now - lastAt < RIOT.hitCdSec * 1000) throw new GameError('Отдышись');
  requireHp(p, now);
  spendEnergy(p, RIOT.hitEnergy, now);
  const crit = rng() < stats(p, now).crit / 100;
  const dmg = Math.round(stats(p, now).atk * (0.8 + rng() * 0.4) * (crit ? 2 : 1));
  return { dmg, crit };
}

// --- Смотрящий -----------------------------------------------------------------------------------

/** Налог смотрящего (%) и сколько набежало за запрос — app переносит в стройку. */
export const zoneTax = { rate: 0, pending: 0 };

// --- Футбол во дворе -----------------------------------------------------------------------------

/** Серия пенальти: пять ударов, вратарь прыгает наугад. Голы клану считает app. */
export function footShoot(p: Player, kicks: unknown, now: number, rng: Rng) {
  if (!p.clanId) throw new GameError('Футбол — клан на клан. Вступи в клан');
  if (p.level < FOOT.minLevel) throw new GameError(`С ${FOOT.minLevel} уровня`);
  const list = Array.isArray(kicks) ? kicks.slice(0, FOOT.kicks) : [];
  if (list.length !== FOOT.kicks) throw new GameError(`Нужно ${FOOT.kicks} ударов`);
  playLimit(p, 'foot', FOOT.perDay, now);
  const res = list.map((k) => resolveKick(k as { zone: number; acc: number }, rng));
  const goals = res.filter((r) => r.goal).length;
  track(p, 'minigame');
  if (goals >= 4) p.authority += 2;
  return { res, goals };
}
