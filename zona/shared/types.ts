import type { Mast } from './term.ts';
import type { Slot } from './content.ts';

export interface PlayerView {
  id: number;
  name: string;
  level: number;
  xp: number;
  xpNext: number;
  money: number;
  gold: number;
  str: number;
  agi: number;
  end: number;
  statPoints: number;
  authority: number;
  rank: string;
  place: number;
  wins: number;
  losses: number;
  bossKills: number;
  hp: number;
  energy: number;
  nextEnergyAt: number | null;
  stats: {
    atk: number;
    def: number;
    maxHp: number;
    crit: number;
    maxEnergy: number;
    moneyBonus: number;
  };
  vipUntil: number | null;
  dailyReadyAt: number;
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
  nextButtAt: number | null;
  shellsLeft: number;
  weekly: { week: number; event: string; progress: number; claimed: number[]; endsAt: number };
  blessUntil: number;
  prayReadyAt: number;
  confessReady: boolean;
  pullupsReadyAt: number;
  pullupsLeft: number;
  daily: DailyState;
  quests: QuestState;
  clan: { id: number; name: string; tag: string; level: number; owner: boolean } | null;
  bossCd: Record<string, number>;
  pvpReadyAt: number;
  worldHitReadyAt: number;
  shieldUntil: number;
  refCount: number;
  battle: BattleView | null;
  admin: boolean;
  story: { ch: number; step: number; progress: number };
  mast: Mast | null;
  upgrades: Record<string, number>;
  hodka: number;
  term: number;
  termTotal: number;
  hodkaBonus: number;
  intro: number;
  /** обучение первых минут: номер шага и прогресс; null — позади */
  tut: { step: number; n: number } | null;
  word: { len: number; guesses: { g: string; marks: ('g' | 'y' | 'x')[] }[]; done: boolean; won: boolean; answer: string | null; meaning: string | null; streak: number; best: number };
  pet: { kind: 'cat' | 'rat' | 'pigeon'; name: string; level: number; xp: number; fedAt: number; trainAt: number; wear?: string[]; on?: string | null } | null;
  built: number;
  ink: { skill: number; jobs: number; stars: number; votes: number; queue: { id: number; client: number; clientName: string; tattoo: string; paid: number; at: number }[] } | null;
  inkOrder: { artist: number; artistName: string; tattoo: string; at: number; id: number; done: boolean; quality: number; rated: boolean } | null;
  smotr: { id: number; name: string; face: number | null; tax: number; decree: string | null } | null;
  riot: { phase: 'idle' | 'vote' | 'fight' | 'won' | 'lost'; by: string | null; endsAt: number; yes: number; no: number; myVote: boolean | null; wave: number; hp: number; max: number; myDmg: number; canClaim: boolean; canCall: boolean; hitAt: number };
  contra: { have: Partial<Record<'tea' | 'cigs' | 'sugar' | 'phone', number>>; spent: number; earned: number; shmon: boolean; day: number };
  tunnel: { depth: number; digAt: number; masked: number; found: number; done: boolean };
  family: { who: 'mom' | 'wife'; rounds: number[]; picks: number[]; mood: number; done: boolean; buffUntil: number; buffPct: number; nextAt: number };
  inbox: { id: number; from: number; fromName: string; msg: string; butts: number; at: number; read: boolean }[];
  intros: string[];
  feats: Record<string, number>;
  streamToday: boolean;
  joke: { day: number; voted: boolean };
  catsFed: string[];
  pumpkins: string[];
  streams: { id: number; name: string; face: number | null; skin: number; topic: string; until: number; likes: number; liked: boolean; comments: { name: string; msg: number }[]; gifts: { butts: number; heart: number } }[];
  featsClaimed: string[];
  bunk: { done: boolean; pick: number; day: number };
  reno: { stage: number; until: number; rush: number };
  penpal: { name: string; step: number; love: number; nextAt: number; ending: 'wedding' | 'wait' | 'gone' | 'scam' | 'caught' | null; picks: number[]; canRestart: boolean } | null;
  appeal: { args: string[]; done: boolean; won: boolean; delta: number };
  zoneBuild: { idx: number; pts: number; done: string[] };
  holiday: { id: 'newyear' | 'feb23' | 'easter'; endsAt: number; tokens: number; prog: number[]; claimed: boolean[]; bought: Record<string, number>; tree: boolean; armBest: number; eggAt: number; dailyReady: boolean } | null;
  colony: 'general' | 'north' | 'krytka' | 'red';
  trophies: string[];
  duo: { status: 'invite' | 'run' | 'over'; partner: string; partnerId: number; stage: number; myMove: boolean; theirMove: boolean; log: string[]; inviteUntil: number } | null;
  duoInvite: { run: string; from: number; name: string; at: number } | null;
  wall: string[];
  albums: string[];
  attacks: { at: number; by: number; name: string; won: boolean; loot: number; canAvenge: boolean; avenged: boolean }[];
  league: { week: number; pts: number; wins: number; last: { week: number; pts: number } | null; claimable: boolean; power: number };
  /** событие зоны, которое идёт сейчас */
  live: { id: string; name: string; emoji: string; desc: string; short: string; endsAt: number } | null;
  notifyOn: boolean;
  notifyOff: string[];
  games: {
    cards: number; race: number; brew: number; brewReadyAt: number; cardsMaxBet: number; dice: number; diceMaxBet: number; arm: number; darts: number;
    nardy: number; domino: number; chess: number; speed: number; conveyor: number; beads: number; beadsReadyAt: number; fish: number; shizo: number; raid: number; pillow: number; sling: number; tableMaxBet: number;
  };
  tables: {
    nardy?: { bet: number; me: number; him: number; dice: [number, number]; hisLast: [number, number] | null };
    domino?: { bet: number; hand: [number, number][]; ai: [number, number][]; bone: [number, number][]; chain: [number, number][]; last: string };
    chess?: string;
    shizo?: { day: number; heat: number; food: number; spirit: number; card: string; seen: string[] };
  };
  god: boolean;
  cell: string[];
  cellShow: Record<string, string>;
  comfort: number;
  event: { id: string; until: number; who?: string; name?: string } | null;
  placeCd: Record<string, number>;
  rep: Record<'brat' | 'work' | 'admin', number>;
  debt: { amount: number; due: number; from: 'baryga' | 'katala'; counted: number } | null;
  loanLimit: number;
  mats: Partial<Record<string, number>>;
  clanHitReadyAt: number;
  parcelsLeft: number;
  season: { id: number; pts: number; free: number[]; paid: number[]; pass: boolean; name: string; emoji: string; desc: string; focus: string; endsAt: number };
  cosmetics: string[];
  unlocksSeen: string[];
  frame: string | null;
  title: string | null;
  offer: { id: string; bought: boolean };
  war: { week: number; pts: number };
  warClaimed: number;
  week: number;
  obshak: { total: number; log: { name: string; amount: number; at: number }[]; askReadyAt: number };
  yardReadyAt: number;
  escape: { cdUntil: number; stage: number | null; best: number };
  medBedReadyAt: number;
  noteReady: boolean;
  snoopsLeft: number;
  perks: string[];
  belt: string[];
  stash: Record<string, number>;
  journal: { t: number; text: string }[];
}

export interface WorldBossView {
  gen: number;
  hp: number;
  maxHp: number;
  top: { id: number; name: string; damage: number }[];
  myDamage: number;
  participants: number;
}

/** Внешний вид персонажа: из чего рисуется фигурка. */
export interface Look {
  equipped: Partial<Record<Slot, string>>;
  tattoos: string[];
  str: number;
  face?: number;
  build?: number;
  skin?: number;
}

export interface FightReplay {
  win: boolean;
  log: string[];
  rounds: { by: 0 | 1; dmg: number; crit: boolean; heal?: number; miss?: boolean; note?: string; combo?: number; fin?: boolean }[];
  startHp: [number, number];
  maxHp: [number, number];
}

export interface DailyTask {
  kind: import('./content.ts').DailyKind;
  target: number;
  progress: number;
  money: number;
  xp: number;
  gold: number;
  claimed: boolean;
}

export interface DailyState {
  day: string;
  tasks: DailyTask[];
  bonusClaimed: boolean;
}

export interface Quest {
  key: string;
  tpl: string;
  minutes: number;
  energy: number;
  money: number;
  xp: number;
  gold: number;
  chance: number;
}

export interface QuestState {
  board: Quest[];
  active: (Quest & { endsAt: number }) | null;
  seq?: number;
}

/** Что видно, когда заходишь в хату к соседу. */
export interface VisitView {
  feats: string[];
  id: number;
  name: string;
  level: number;
  rank: string;
  authority: number;
  wins: number;
  face: number;
  build: number;
  skin: number;
  furniture: string[];
  comfort: number;
  equipped: Look['equipped'];
  str: number;
  interior: { wall: string; floor: string };
  tattoos: string[];
  wall: string[];
  pet: { kind: 'cat' | 'rat' | 'pigeon'; name: string; level: number } | null;
  clan: { id: number; name: string; tag: string } | null;
  respectedToday: boolean;
  giftedToday: boolean;
  online: boolean;
}

export interface ClanView {
  id: number;
  name: string;
  tag: string;
  level: number;
  treasury: number;
  ownerId: number;
  members: { id: number; name: string; level: number; authority: number; face: number | null }[];
  upgradeCost: number | null;
  hut?: Partial<Record<'kitchen' | 'gym' | 'cash' | 'lookout', number>>;
  boss?: { hp: number; max: number; killed: boolean; top: { name: string; dmg: number }[]; feed?: { name: string; dmg: number; crit: boolean; at: number; aoe?: boolean }[] };
  war?: { ranking: { id: number; name: string; tag: string; pts: number }[]; prevTop: { id: number; name: string; tag: string; pts: number }[]; prevRank: number };
}

export interface BattleView {
  kind: 'boss' | 'pvp';
  enemy: { name: string; npc?: string; look?: Look };
  rounds: FightReplay['rounds'];
  startHp: [number, number];
  hp: [number, number];
  maxHp: [number, number];
  perks: { id: string; passive: boolean; usable: boolean; cdLeft: number; spent: boolean }[];
  items: string[];
  done: boolean;
}
