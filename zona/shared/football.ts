// Футбол во дворе: серия из пяти пенальти. Каждый гол — в копилку клана на сегодня.
// Каждый день кланы бьются парами (пары тасуются по дню): у кого больше голов — 3 очка, ничья — 1.
// Таблица недели — кубок двора, тройке лучших кланов золото каждому участнику.

export const FOOT = {
  kicks: 5,
  perDay: 2,
  minLevel: 4,
  /** точность удара (0..1): слишком слабо или слишком сильно — мимо */
  missLow: 0.12,
  missHigh: 0.95,
  /** «в девятку»: сильный точный удар в верхний угол вратарь не берёт даже угадав — с таким шансом */
  sweet: [0.45, 0.65] as [number, number],
  sweetBeat: 0.5,
  rewards: [20, 12, 6],
};

/** 0..5: верх-лево, верх-центр, верх-право, низ-лево, низ-центр, низ-право. */
export const ZONES = 6;
export const isTop = (z: number) => z < 3;
export const isCorner = (z: number) => z % 3 !== 1;

export interface Kick {
  zone: number;
  acc: number;
}
export interface KickResult {
  zone: number;
  dive: number;
  goal: boolean;
  why: 'goal' | 'save' | 'over' | 'weak';
}

export function resolveKick(k: Kick, rnd: () => number): KickResult {
  const zone = Math.max(0, Math.min(ZONES - 1, Math.floor(Number(k.zone) || 0)));
  const acc = Math.max(0, Math.min(1, Number(k.acc) || 0));
  const dive = Math.floor(rnd() * ZONES);
  if (acc < FOOT.missLow) return { zone, dive, goal: false, why: 'weak' };
  if (acc > FOOT.missHigh) return { zone, dive, goal: false, why: 'over' };
  if (dive === zone) {
    const sweet = isTop(zone) && isCorner(zone) && acc >= FOOT.sweet[0] && acc <= FOOT.sweet[1];
    if (sweet && rnd() < FOOT.sweetBeat) return { zone, dive, goal: true, why: 'goal' };
    return { zone, dive, goal: false, why: 'save' };
  }
  return { zone, dive, goal: true, why: 'goal' };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Пары матчей дня: кланы, бившие в этот день, тасуются по дню; нечётному — победа без игры. */
export function dayPairs(day: number, clans: number[]): [number, number | null][] {
  const order = [...clans].sort((a, b) => hash(`${day}:${a}`) - hash(`${day}:${b}`));
  const out: [number, number | null][] = [];
  for (let i = 0; i < order.length; i += 2) out.push([order[i], order[i + 1] ?? null]);
  return out;
}

/** Очки недели по голам дней. */
export function footTable(goals: Record<string, Record<string, number>>): { id: number; pts: number; gf: number; ga: number; w: number; d: number; l: number }[] {
  const t = new Map<number, { id: number; pts: number; gf: number; ga: number; w: number; d: number; l: number }>();
  const row = (id: number) => t.get(id) ?? (t.set(id, { id, pts: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0 }), t.get(id)!);
  for (const [day, byClan] of Object.entries(goals)) {
    const ids = Object.keys(byClan).map(Number);
    for (const [a, b] of dayPairs(Number(day), ids)) {
      const ga = byClan[a] ?? 0;
      const ra = row(a);
      ra.gf += ga;
      if (b === null) {
        ra.pts += 3;
        ra.w++;
        continue;
      }
      const gb = byClan[b] ?? 0;
      const rb = row(b);
      rb.gf += gb;
      ra.ga += gb;
      rb.ga += ga;
      if (ga > gb) (ra.pts += 3), ra.w++, rb.l++;
      else if (gb > ga) (rb.pts += 3), rb.w++, ra.l++;
      else (ra.pts += 1), (rb.pts += 1), ra.d++, rb.d++;
    }
  }
  return [...t.values()].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
}
