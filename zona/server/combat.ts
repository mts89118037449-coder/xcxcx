// Бой: удары по очереди, перки с перезарядкой и одноразовые расходники.
// Чистая функция от бойцов и rng — сервер решает исход, клиент проигрывает запись ходов.
import { consumableById, perkById, PERKS, type Consumable, type Perk, type PerkKind } from '../shared/perks.ts';

export type Rng = () => number;

export interface Fighter {
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  crit: number;
  /** Надетые перки (id). */
  perks?: string[];
  /** Расходники на поясе (id), каждый срабатывает не больше раза. */
  items?: string[];
}

export interface Round {
  by: 0 | 1; // кто действует: 0 — нападающий, 1 — защищающийся
  dmg: number; // урон противнику того, кто действует
  crit: boolean;
  heal?: number; // лечение того, кто действует
  miss?: boolean;
  note?: string; // перк или расходник — всплывает над бойцом
}

export interface FightResult {
  win: boolean;
  log: string[];
  rounds: Round[];
  startHp: [number, number];
  maxHp: [number, number];
  damageDealt: number;
  hpLeft: number;
  /** Какие расходники нападающего потрачены. */
  used: string[];
  /** Бонус к деньгам за победу от расходников, %. */
  lootBonus: number;
}

interface Side {
  i: 0 | 1;
  f: Fighter;
  hp: number;
  maxHp: number;
  perks: Perk[];
  items: Consumable[];
  used: string[];
  ready: Map<string, number>; // перк → с какого своего хода готов
  turn: number;
  stunned: boolean;
  bleed: { pct: number; turns: number } | null;
  weak: { pct: number; turns: number } | null;
  blocks: { pct: number; n: number; note: string }[];
  dmgMul: number;
  atkMul: number;
  critAdd: number;
  critMul: number;
  counterAdd: number;
  doubleFirst: boolean;
  lootBonus: number;
}

function side(i: 0 | 1, f: Fighter): Side {
  const perks: Perk[] = [];
  for (const id of f.perks ?? []) {
    const p = perkById.get(id);
    if (p && !perks.some((x) => x.id === id)) perks.push(p);
  }
  const items: Consumable[] = [];
  for (const id of f.items ?? []) {
    const c = consumableById.get(id);
    if (c && !items.some((x) => x.id === id)) items.push(c);
  }
  return {
    i, f, hp: f.hp, maxHp: f.maxHp, perks, items, used: [], ready: new Map(), turn: 0,
    stunned: false, bleed: null, weak: null, blocks: [],
    dmgMul: 1, atkMul: 1, critAdd: 0, critMul: 1, counterAdd: 0, doubleFirst: false, lootBonus: 0,
  };
}

const passive = (s: Side, kind: PerkKind) => s.perks.find((p) => p.kind === kind)?.value ?? 0;
const has = (s: Side, id: string) => s.perks.some((p) => p.id === id);

/** Перк этого типа, если он готов на текущем ходу. */
function readyPerk(s: Side, kind: PerkKind | string): Perk | null {
  const p = s.perks.find((x) => x.kind === kind || x.id === kind);
  if (!p || p.cd === 0) return null;
  if ((s.ready.get(p.id) ?? 0) > s.turn) return null;
  return p;
}

function usePerk(s: Side, p: Perk) {
  s.ready.set(p.id, p.cd < 0 ? Infinity : s.turn + p.cd);
}

function takeItem(s: Side, kind: Consumable['kind']): Consumable | null {
  const k = s.items.findIndex((c) => c.kind === kind);
  if (k < 0) return null;
  const [c] = s.items.splice(k, 1);
  s.used.push(c.id);
  return c;
}

export function fight(a: Fighter, b: Fighter, rng: Rng, maxRounds = 30): FightResult {
  const A = side(0, a);
  const B = side(1, b);
  const rounds: Round[] = [];
  const lines: string[] = [];
  let dealt = 0;
  const push = (r: Round) => {
    rounds.push(r);
    if (r.by === 0) dealt += r.dmg;
  };

  // Расходники, что действуют с начала боя, и «Железный»
  for (const [me, foe] of [[A, B], [B, A]] as const) {
    for (const c of [...me.items]) {
      let fired = true;
      switch (c.kind) {
        case 'stunStart': foe.stunned = true; break;
        case 'block': me.blocks.push({ pct: 100, n: c.value, note: `${c.emoji} Блок` }); break;
        case 'dmgBuff': me.dmgMul *= 1 + c.value / 100; break;
        case 'critBuff': me.critAdd += c.value; break;
        case 'critDmg': me.critMul *= 1 + c.value / 100; break;
        case 'hpBuff': {
          const add = Math.round(me.maxHp * c.value / 100);
          me.maxHp += add;
          me.hp += add;
          break;
        }
        case 'weaken': foe.atkMul *= 1 - c.value / 100; break;
        case 'bleed': foe.bleed = { pct: c.value, turns: 4 }; break;
        case 'double': me.doubleFirst = true; break;
        case 'counter': me.counterAdd += c.value; break;
        case 'loot': me.lootBonus += c.value; break;
        default: fired = false;
      }
      if (fired) {
        takeItem(me, c.kind);
        push({ by: me.i, dmg: 0, crit: false, note: `${c.emoji} ${c.name}` });
      }
    }
    const iron = me.perks.find((p) => p.id === 'legend_iron');
    if (iron) me.blocks.push({ pct: 100, n: iron.value, note: `${iron.emoji} ${iron.name}` });
  }
  const startHp: [number, number] = [A.hp, B.hp];
  const maxHp: [number, number] = [A.maxHp, B.maxHp];

  /** Смертельный удар: «Не дождётесь» или «Фото мамы» поднимают на ноги. */
  const survive = (s: Side) => {
    if (s.hp > 0) return;
    s.hp = 0;
    const ph = readyPerk(s, 'legend_phoenix');
    const item = ph ? null : takeItem(s, 'revive');
    const pct = ph ? ph.value : item ? item.value : 0;
    if (!pct) return;
    if (ph) usePerk(s, ph);
    s.hp = Math.round(s.maxHp * pct / 100);
    push({ by: s.i, dmg: 0, crit: false, heal: s.hp, note: ph ? `${ph.emoji} ${ph.name}` : `${item!.emoji} ${item!.name}` });
  };

  const heal = (s: Side, amount: number) => {
    const h = Math.max(0, Math.min(s.maxHp - s.hp, Math.round(amount)));
    s.hp += h;
    return h;
  };

  /** Один удар. Возвращает, попал ли. */
  const strike = (me: Side, foe: Side, mult: number, forcedCrit: boolean, note: string | undefined, isCounter = false): boolean => {
    const dodge = passive(foe, 'dodge') + (has(foe, 'legend_thief') ? 10 : 0);
    if (rng() * 100 < dodge) {
      push({ by: me.i, dmg: 0, crit: false, miss: true, note: note ? `${note} · 💨` : '💨 Уклон' });
      return false;
    }
    const crit = forcedCrit || rng() * 100 < me.f.crit + me.critAdd;
    const base = me.f.atk * me.atkMul * (1 - (me.weak?.pct ?? 0) / 100) * (0.85 + rng() * 0.3) - foe.f.def * 0.4;
    let m = mult * me.dmgMul;
    if (crit) m *= (forcedCrit ? 1 : 2) * me.critMul;
    if (me.hp < me.maxHp * 0.4) m *= 1 + passive(me, 'rage') / 100;
    if (has(me, 'legend_thief')) m *= 1.22;
    let dmg = Math.max(1, Math.round(base * m));
    const blk = foe.blocks[0];
    if (blk) {
      dmg = Math.round(dmg * (1 - blk.pct / 100));
      note = note ? `${note} · ${blk.note}` : blk.note;
      if (--blk.n <= 0) foe.blocks.shift();
    }
    foe.hp -= dmg;
    const leech = passive(me, 'leech');
    const h = leech && dmg ? heal(me, (dmg * leech) / 100) : 0;
    push({ by: me.i, dmg, crit, ...(h ? { heal: h } : {}), ...(note ? { note } : {}) });
    lines.push(`${me.f.name}${isCounter ? ' в ответ' : ''} бьёт на ${dmg}${crit ? ' 💥' : ''}${note ? ` (${note})` : ''}`);
    survive(foe);
    if (foe.hp > 0 && !isCounter) {
      const ch = passive(foe, 'counter') + foe.counterAdd;
      if (ch && rng() * 100 < ch) strike(foe, me, 0.8, false, '↩️ Встречка', true);
    }
    return true;
  };

  /** Ход бойца. true — бой окончен. */
  const act = (me: Side, foe: Side): boolean => {
    me.turn++;
    if (me.bleed) {
      const d = Math.max(1, Math.round(me.maxHp * me.bleed.pct / 100));
      me.hp -= d;
      push({ by: foe.i, dmg: d, crit: false, note: '🩸' });
      if (--me.bleed.turns <= 0) me.bleed = null;
      survive(me);
      if (me.hp <= 0) return true;
    }
    if (me.stunned) {
      me.stunned = false;
      push({ by: me.i, dmg: 0, crit: false, note: '💫 Пропускает ход' });
      return false;
    }
    // Лечение — не тратит ход
    if (me.hp < me.maxHp * 0.5) {
      const p = readyPerk(me, 'heal');
      if (p) {
        usePerk(me, p);
        const h = heal(me, (me.maxHp * p.value) / 100);
        if (h) push({ by: me.i, dmg: 0, crit: false, heal: h, note: `${p.emoji} ${p.name}` });
      }
    }
    if (me.hp < me.maxHp * 0.4) {
      const c = takeItem(me, 'heal');
      if (c) push({ by: me.i, dmg: 0, crit: false, heal: heal(me, (me.maxHp * c.value) / 100), note: `${c.emoji} ${c.name}` });
    }
    // Добивание
    const ex = readyPerk(me, 'execute');
    if (ex && foe.hp <= foe.maxHp * ex.value / 100) {
      usePerk(me, ex);
      const d = foe.hp;
      foe.hp = 0;
      push({ by: me.i, dmg: d, crit: true, note: `${ex.emoji} ${ex.name}` });
      lines.push(`${me.f.name} добивает`);
      survive(foe);
      return foe.hp <= 0;
    }
    // Основной удар с перками
    let mult = 1;
    let forced = false;
    const notes: string[] = [];
    const cr = readyPerk(me, 'crit');
    if (cr) {
      usePerk(me, cr);
      mult *= cr.value;
      forced = true;
      notes.push(`${cr.emoji} ${cr.name}`);
    }
    const dog = me.perks.find((p) => p.id === 'legend_dog');
    if (dog && me.turn % dog.cd === 0) {
      mult *= dog.value;
      notes.push(`${dog.emoji} ${dog.name}`);
    }
    const bl = readyPerk(me, 'block');
    if (bl) {
      usePerk(me, bl);
      me.blocks.push({ pct: bl.value, n: 1, note: `${bl.emoji} Блок` });
    }
    const landed = strike(me, foe, mult, forced, notes.join(' · ') || undefined);
    if (foe.hp <= 0) return true;
    if (me.hp <= 0) return true; // встречка добила
    if (landed) {
      const st = readyPerk(me, 'stun');
      if (st) {
        usePerk(me, st);
        if (rng() * 100 < st.value) {
          foe.stunned = true;
          push({ by: me.i, dmg: 0, crit: false, note: `${st.emoji} ${st.name}` });
        }
      }
      const bd = readyPerk(me, 'bleed');
      if (bd) {
        usePerk(me, bd);
        foe.bleed = { pct: bd.value, turns: 3 };
        push({ by: me.i, dmg: 0, crit: false, note: `${bd.emoji} ${bd.name}` });
      }
      const ar = readyPerk(me, 'armor');
      if (ar) {
        usePerk(me, ar);
        foe.weak = { pct: ar.value, turns: 4 };
        push({ by: me.i, dmg: 0, crit: false, note: `${ar.emoji} ${ar.name}` });
      }
    }
    if (me.weak && --me.weak.turns <= 0) me.weak = null;
    const db = readyPerk(me, 'double');
    if (db || (me.doubleFirst && me.turn === 1)) {
      if (db) usePerk(me, db);
      strike(me, foe, db && !(me.doubleFirst && me.turn === 1) ? db.value / 100 : 1, false, db ? `${db.emoji} ${db.name}` : '🌀 Второй удар');
    }
    return foe.hp <= 0 || me.hp <= 0;
  };

  for (let round = 1; round <= maxRounds; round++) {
    if (act(A, B)) break;
    if (act(B, A)) break;
  }
  const log = lines.length > 12 ? [...lines.slice(0, 6), '…', ...lines.slice(-5)] : lines;
  return {
    win: B.hp <= 0 && A.hp > 0,
    log,
    rounds,
    startHp,
    maxHp,
    damageDealt: Math.min(dealt, startHp[1]),
    hpLeft: Math.max(0, Math.min(A.hp, a.maxHp)),
    used: A.used,
    lootBonus: A.lootBonus,
  };
}

/** Перки для НПС и ботов: чем выше уровень, тем больше и сильнее. */
export function npcPerks(level: number, seed: number): string[] {
  const n = level < 4 ? 0 : level < 12 ? 1 : level < 25 ? 2 : 3;
  const kinds: PerkKind[] = ['crit', 'stun', 'heal', 'double', 'block', 'bleed', 'armor', 'leech', 'dodge', 'counter', 'rage', 'execute'];
  const out: string[] = [];
  let k = Math.abs(seed) % kinds.length;
  while (out.length < n) {
    const kind = kinds[k % kinds.length];
    k += 5; // шаг взаимно прост с 12 — перебор без повторов
    const best = PERKS.filter((p) => p.kind === kind && p.minLevel <= level).pop();
    if (best) out.push(best.id);
    if (k > 200) break;
  }
  return out;
}
