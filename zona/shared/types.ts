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
  bossCd: Record<string, number>;
  pvpReadyAt: number;
  worldHitReadyAt: number;
  shieldUntil: number;
  refCount: number;
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
}

export interface FightReplay {
  win: boolean;
  log: string[];
  rounds: { by: 0 | 1; dmg: number; crit: boolean }[];
  startHp: [number, number];
  maxHp: [number, number];
}
