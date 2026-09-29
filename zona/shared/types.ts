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
  notifyOn: boolean;
  games: { cards: number; race: number; brew: number; brewReadyAt: number; cardsMaxBet: number; dice: number; diceMaxBet: number; arm: number; darts: number };
  god: boolean;
  cell: string[];
  cellShow: Record<string, string>;
  comfort: number;
  event: { id: string; until: number } | null;
  placeCd: Record<string, number>;
  rep: Record<'brat' | 'work' | 'admin', number>;
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
  rounds: { by: 0 | 1; dmg: number; crit: boolean; heal?: number; miss?: boolean; note?: string }[];
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
