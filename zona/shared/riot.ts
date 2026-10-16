// Бунт на зоне: любой авторитетный (с 10 уровня) может подбить зону — сутки голосуют.
// Набралось голосов и «за» больше — бунт: три волны ОМОНа, бьют все вместе, на каждую волну 4 часа.
// Отбились — всем участникам золото, авторитет и титул. Не успели — гайки закручивают на сутки: смены платят меньше.

export const RIOT = {
  minLevel: 10,
  callButts: 50,
  voteH: 24,
  minVotes: 5,
  waves: [
    { name: 'Наряд контролёров', emoji: '👮', hpPer: 2500 },
    { name: 'ОМОН со щитами', emoji: '🛡️', hpPer: 4000 },
    { name: 'Спецназ «Тайфун»', emoji: '🪖', hpPer: 6000 },
  ],
  waveH: 4,
  hitEnergy: 10,
  hitCdSec: 20,
  cooldownDays: 5,
  reward: { gold: 15, authority: 25 },
  penaltyH: 24,
  penaltyJob: 0.85,
};

export type RiotPhase = 'idle' | 'vote' | 'fight' | 'won' | 'lost';

export interface RiotState {
  phase: RiotPhase;
  by: { id: number; name: string } | null;
  startedAt: number;
  votes: Record<string, boolean>;
  wave: number;
  hp: number;
  max: number;
  waveEndsAt: number;
  hits: Record<string, { name: string; dmg: number }>;
  feed: { name: string; dmg: number; at: number }[];
  endedAt: number;
  claimed: number[];
}

export const riotIdle = (): RiotState => ({ phase: 'idle', by: null, startedAt: 0, votes: {}, wave: 0, hp: 0, max: 0, waveEndsAt: 0, hits: {}, feed: [], endedAt: 0, claimed: [] });

export const waveHp = (wave: number, people: number) => RIOT.waves[wave].hpPer * Math.max(RIOT.minVotes, people);

/** Сдвинуть бунт по времени: итог голосования, провал волны по таймеру. Возвращает true, если что-то поменялось. */
export function riotAdvance(s: RiotState, now: number): boolean {
  if (s.phase === 'vote' && now >= s.startedAt + RIOT.voteH * 3600_000) {
    const all = Object.values(s.votes);
    const yes = all.filter(Boolean).length;
    if (all.length >= RIOT.minVotes && yes > all.length / 2) {
      s.phase = 'fight';
      s.wave = 0;
      s.max = s.hp = waveHp(0, yes);
      s.waveEndsAt = now + RIOT.waveH * 3600_000;
    } else {
      s.phase = 'idle';
      s.endedAt = now;
    }
    return true;
  }
  if (s.phase === 'fight' && now >= s.waveEndsAt && s.hp > 0) {
    s.phase = 'lost';
    s.endedAt = now;
    return true;
  }
  return false;
}
