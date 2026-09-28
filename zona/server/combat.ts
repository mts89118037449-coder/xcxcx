// Бой: пошаговый, с сохраняемым состоянием. Игрок на своём ходу выбирает: обычный удар,
// активный перк (у каждого — перезарядка в ходах) или расходник с пояса (не тратит ход).
// Противник ходит сам. Пассивные перки работают всегда. Автобой — тот же движок,
// только ходы за игрока выбирает ИИ. Всё решает сервер, клиент проигрывает запись.
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

interface SideState {
  i: 0 | 1;
  name: string;
  atk: number;
  def: number;
  crit: number;
  baseMaxHp: number;
  hp: number;
  maxHp: number;
  perks: string[];
  items: string[]; // ещё не использованные расходники
  used: string[];
  ready: Record<string, number>; // перк → с какого своего хода готов
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
  doubleNext: boolean;
  lootBonus: number;
}

/** Состояние боя — чистый JSON: хранится у игрока между ходами. */
export interface BattleState {
  s: [SideState, SideState];
  rounds: Round[];
  lines: string[];
  dealt: number;
  startHp: [number, number];
  maxHp: [number, number];
  done: boolean;
  exchanges: number;
}

export type BattleAction = { type: 'hit' } | { type: 'perk'; id: string } | { type: 'item'; id: string };

const NEVER = 1e9;
const MAX_EXCHANGES = 40;

function perksOf(s: SideState): Perk[] {
  return s.perks.map((id) => perkById.get(id)).filter((p): p is Perk => !!p);
}
const passive = (s: SideState, kind: PerkKind) => perksOf(s).find((p) => p.kind === kind)?.value ?? 0;
const has = (s: SideState, id: string) => s.perks.includes(id);

/** Можно ли сейчас нажать перк (активный и не на перезарядке). Реактивные — «Не дождётесь» — не нажимаются. */
export function perkReady(s: SideState, p: Perk): boolean {
  if (p.cd === 0 || p.id === 'legend_phoenix') return false;
  return (s.ready[p.id] ?? 0) <= s.turn + 1;
}

function usePerk(s: SideState, p: Perk) {
  s.ready[p.id] = p.cd < 0 ? NEVER : s.turn + p.cd;
}

function sideOf(i: 0 | 1, f: Fighter): SideState {
  const uniq = (a: string[] = []) => [...new Set(a)];
  return {
    i, name: f.name, atk: f.atk, def: f.def, crit: f.crit, baseMaxHp: f.maxHp, hp: f.hp, maxHp: f.maxHp,
    perks: uniq(f.perks).filter((id) => perkById.has(id)),
    items: uniq(f.items).filter((id) => consumableById.has(id)),
    used: [], ready: {}, turn: 0, stunned: false, bleed: null, weak: null, blocks: [],
    dmgMul: 1, atkMul: 1, critAdd: 0, critMul: 1, counterAdd: 0, doubleNext: false, lootBonus: 0,
  };
}

export function newBattle(a: Fighter, b: Fighter): BattleState {
  const st: BattleState = {
    s: [sideOf(0, a), sideOf(1, b)],
    rounds: [],
    lines: [],
    dealt: 0,
    startHp: [a.hp, b.hp],
    maxHp: [a.maxHp, b.maxHp],
    done: false,
    exchanges: 0,
  };
  // «Железный» противника — пассивно с начала боя; у игрока он нажимается
  const iron = perkById.get('legend_iron')!;
  if (has(st.s[1], iron.id)) st.s[1].blocks.push({ pct: 100, n: iron.value, note: `${iron.emoji} ${iron.name}` });
  return st;
}

/** Ходы, собранные за один вызов (для анимации на клиенте). */
class Turn {
  out: Round[] = [];
  st: BattleState;
  rng: Rng;
  constructor(st: BattleState, rng: Rng) {
    this.st = st;
    this.rng = rng;
  }

  push(r: Round) {
    this.out.push(r);
    this.st.rounds.push(r);
    if (r.by === 0) this.st.dealt += r.dmg;
  }

  heal(s: SideState, amount: number) {
    const h = Math.max(0, Math.min(s.maxHp - s.hp, Math.round(amount)));
    s.hp += h;
    return h;
  }

  /** Смертельный удар: «Не дождётесь» или «Фото мамы» поднимают на ноги. */
  survive(s: SideState) {
    if (s.hp > 0) return;
    s.hp = 0;
    const ph = perksOf(s).find((p) => p.id === 'legend_phoenix' && (s.ready[p.id] ?? 0) <= s.turn + 1);
    let note = '';
    let pct = 0;
    if (ph) {
      usePerk(s, ph);
      pct = ph.value;
      note = `${ph.emoji} ${ph.name}`;
    } else {
      const k = s.items.findIndex((id) => consumableById.get(id)!.kind === 'revive');
      if (k >= 0) {
        const c = consumableById.get(s.items[k])!;
        s.items.splice(k, 1);
        s.used.push(c.id);
        pct = c.value;
        note = `${c.emoji} ${c.name}`;
      }
    }
    if (!pct) return;
    s.hp = Math.round(s.maxHp * pct / 100);
    this.push({ by: s.i, dmg: 0, crit: false, heal: s.hp, note });
  }

  strike(me: SideState, foe: SideState, mult: number, forcedCrit: boolean, note: string | undefined, isCounter = false): boolean {
    const rng = this.rng;
    const dodge = passive(foe, 'dodge') + (has(foe, 'legend_thief') ? 10 : 0);
    if (rng() * 100 < dodge) {
      this.push({ by: me.i, dmg: 0, crit: false, miss: true, note: note ? `${note} · 💨` : '💨 Уклон' });
      return false;
    }
    const crit = forcedCrit || rng() * 100 < me.crit + me.critAdd;
    const base = me.atk * me.atkMul * (1 - (me.weak?.pct ?? 0) / 100) * (0.85 + rng() * 0.3) - foe.def * 0.4;
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
    const h = leech && dmg ? this.heal(me, (dmg * leech) / 100) : 0;
    this.push({ by: me.i, dmg, crit, ...(h ? { heal: h } : {}), ...(note ? { note } : {}) });
    this.st.lines.push(`${me.name}${isCounter ? ' в ответ' : ''} бьёт на ${dmg}${crit ? ' 💥' : ''}${note ? ` (${note})` : ''}`);
    this.survive(foe);
    if (foe.hp > 0 && !isCounter) {
      const ch = passive(foe, 'counter') + foe.counterAdd;
      if (ch && rng() * 100 < ch) this.strike(foe, me, 0.8, false, '↩️ Встречка', true);
    }
    return true;
  }

  /** Начало хода: кровотечение, оглушение. false — ход пропущен или боец выбыл. */
  begin(me: SideState, foe: SideState): boolean {
    if (me.bleed) {
      const d = Math.max(1, Math.round(me.maxHp * me.bleed.pct / 100));
      me.hp -= d;
      this.push({ by: foe.i, dmg: d, crit: false, note: '🩸' });
      if (--me.bleed.turns <= 0) me.bleed = null;
      this.survive(me);
      if (me.hp <= 0) return false;
    }
    if (me.stunned) {
      me.stunned = false;
      me.turn++; // пропущенный ход тоже считается для перезарядок
      this.push({ by: me.i, dmg: 0, crit: false, note: '💫 Пропускает ход' });
      return false;
    }
    return true;
  }

  end(me: SideState, foe: SideState) {
    if (me.weak && --me.weak.turns <= 0) me.weak = null;
    if (me.doubleNext && foe.hp > 0 && me.hp > 0) {
      me.doubleNext = false;
      this.strike(me, foe, 1, false, '🌀 Второй удар');
    }
  }

  /** Расходник — мгновенно, ход не тратит. */
  item(me: SideState, foe: SideState, id: string) {
    const k = me.items.indexOf(id);
    const c = consumableById.get(id);
    if (k < 0 || !c) throw new Error('Нет такого расходника');
    if (c.kind === 'revive') throw new Error('Сработает сам при смертельном ударе');
    me.items.splice(k, 1);
    me.used.push(id);
    let heal = 0;
    switch (c.kind) {
      case 'heal': heal = this.heal(me, (me.maxHp * c.value) / 100); break;
      case 'stunStart': foe.stunned = true; break;
      case 'block': me.blocks.push({ pct: 100, n: c.value, note: `${c.emoji} Блок` }); break;
      case 'dmgBuff': me.dmgMul *= 1 + c.value / 100; break;
      case 'critBuff': me.critAdd += c.value; break;
      case 'critDmg': me.critMul *= 1 + c.value / 100; break;
      case 'hpBuff': {
        const add = Math.round(me.baseMaxHp * c.value / 100);
        me.maxHp += add;
        heal = this.heal(me, add);
        this.st.maxHp[me.i] = me.maxHp;
        break;
      }
      case 'weaken': foe.atkMul *= 1 - c.value / 100; break;
      case 'bleed': foe.bleed = { pct: c.value, turns: 4 }; break;
      case 'double': me.doubleNext = true; break;
      case 'counter': me.counterAdd += c.value; break;
      case 'loot': me.lootBonus += c.value; break;
    }
    this.push({ by: me.i, dmg: 0, crit: false, ...(heal ? { heal } : {}), note: `${c.emoji} ${c.name}` });
  }

  /** Активный перк или обычный удар. */
  act(me: SideState, foe: SideState, perk: Perk | null) {
    const tag = perk ? `${perk.emoji} ${perk.name}` : undefined;
    me.turn++;
    if (perk) usePerk(me, perk);
    switch (perk?.kind === 'legend' ? perk.id : perk?.kind) {
      case 'heal': {
        const h = this.heal(me, (me.maxHp * perk!.value) / 100);
        this.push({ by: me.i, dmg: 0, crit: false, heal: h, note: tag });
        this.strike(me, foe, 0.5, false, undefined);
        return;
      }
      case 'execute': {
        const d = foe.hp;
        foe.hp = 0;
        this.push({ by: me.i, dmg: d, crit: true, note: tag });
        this.st.lines.push(`${me.name} добивает`);
        this.survive(foe);
        return;
      }
      case 'crit':
        this.strike(me, foe, perk!.value, true, tag);
        return;
      case 'legend_dog':
        this.strike(me, foe, perk!.value, false, tag);
        return;
      case 'legend_iron':
        me.blocks.push({ pct: 100, n: perk!.value, note: `${perk!.emoji} ${perk!.name}` });
        this.push({ by: me.i, dmg: 0, crit: false, note: tag });
        this.strike(me, foe, 1, false, undefined);
        return;
      case 'block':
        me.blocks.push({ pct: perk!.value, n: 1, note: `${perk!.emoji} Блок` });
        this.strike(me, foe, 1, false, tag);
        return;
      case 'double':
        this.strike(me, foe, 1, false, undefined);
        if (foe.hp > 0 && me.hp > 0) this.strike(me, foe, perk!.value / 100, false, tag);
        return;
      case 'stun':
      case 'bleed':
      case 'armor': {
        const landed = this.strike(me, foe, 1, false, tag);
        if (!landed || foe.hp <= 0) return;
        if (perk!.kind === 'stun' && this.rng() * 100 < perk!.value) {
          foe.stunned = true;
          this.push({ by: me.i, dmg: 0, crit: false, note: '💫 Оглушён' });
        }
        if (perk!.kind === 'bleed') foe.bleed = { pct: perk!.value, turns: 3 };
        if (perk!.kind === 'armor') foe.weak = { pct: perk!.value, turns: 4 };
        return;
      }
      default:
        this.strike(me, foe, 1, false, undefined);
    }
  }
}

/** Условие, при котором перк вообще имеет смысл нажимать. */
export function perkUsable(me: SideState, foe: SideState, p: Perk): boolean {
  if (!perkReady(me, p)) return false;
  if (p.kind === 'execute') return foe.hp <= foe.maxHp * p.value / 100;
  if (p.kind === 'heal') return me.hp < me.maxHp;
  return true;
}

/** ИИ: какой перк нажать (или null — обычный удар). Для противника и автобоя. */
function aiPick(me: SideState, foe: SideState): Perk | null {
  const order = ['execute', 'heal', 'legend_dog', 'crit', 'stun', 'bleed', 'armor', 'double', 'legend_iron', 'block'];
  const ps = perksOf(me).filter((p) => perkUsable(me, foe, p));
  for (const key of order) {
    const p = ps.find((x) => x.kind === key || x.id === key);
    if (!p) continue;
    if (p.kind === 'heal' && me.hp >= me.maxHp * 0.5) continue;
    return p;
  }
  return null;
}

/** ИИ расходников: лечилка — при низком здоровье, остальное — в первые ходы. */
function aiItems(t: Turn, me: SideState, foe: SideState) {
  for (const id of [...me.items]) {
    const c = consumableById.get(id)!;
    if (c.kind === 'revive') continue;
    if (c.kind === 'heal' && me.hp >= me.maxHp * 0.4) continue;
    t.item(me, foe, id);
  }
}

function finished(st: BattleState) {
  const [A, B] = st.s;
  if (A.hp <= 0 || B.hp <= 0 || st.exchanges >= MAX_EXCHANGES) st.done = true;
  return st.done;
}

/** Ход противника, затем — пропуски игрока, если он оглушён (сразу снова ходит противник). */
function enemyPhase(t: Turn, st: BattleState) {
  const [A, B] = st.s;
  for (;;) {
    if (finished(st)) return;
    if (t.begin(B, A)) {
      t.act(B, A, aiPick(B, A));
      t.end(B, A);
    }
    st.exchanges++;
    if (finished(st)) return;
    // у игрока в начале хода: кровотечение и оглушение (оглушён — сразу снова ход противника)
    if (t.begin(A, B)) return;
    if (finished(st)) return;
  }
}

/** Действие игрока (сторона 0). Возвращает новые ходы для анимации. */
export function battleAct(st: BattleState, action: BattleAction, rng: Rng): Round[] {
  if (st.done) throw new Error('Бой окончен');
  const t = new Turn(st, rng);
  const [A, B] = st.s;
  if (action.type === 'item') {
    t.item(A, B, action.id);
    return t.out;
  }
  let perk: Perk | null = null;
  if (action.type === 'perk') {
    perk = perkById.get(action.id) ?? null;
    if (!perk || !A.perks.includes(perk.id)) throw new Error('Нет такого перка');
    if (!perkUsable(A, B, perk)) throw new Error(perk.kind === 'execute' ? 'Рано добивать' : 'Перк перезаряжается');
  }
  // кровотечение и оглушение игрока уже отработали в enemyPhase — тут только ход
  t.act(A, B, perk);
  t.end(A, B);
  enemyPhase(t, st);
  return t.out;
}

/** Довести бой до конца автоматически (кнопка «Авто», боты, защита в наездах). */
export function battleAuto(st: BattleState, rng: Rng): Round[] {
  const t = new Turn(st, rng);
  const [A, B] = st.s;
  let guard = 0;
  while (!st.done && guard++ < 200) {
    aiItems(t, A, B);
    if (finished(st)) break;
    t.act(A, B, aiPick(A, B));
    t.end(A, B);
    enemyPhase(t, st);
  }
  return t.out;
}

export function battleResult(st: BattleState): FightResult {
  const [A, B] = st.s;
  const log = st.lines.length > 12 ? [...st.lines.slice(0, 6), '…', ...st.lines.slice(-5)] : st.lines;
  return {
    win: B.hp <= 0 && A.hp > 0,
    log,
    rounds: st.rounds,
    startHp: st.startHp,
    maxHp: st.maxHp,
    damageDealt: Math.min(st.dealt, st.startHp[1]),
    hpLeft: Math.max(0, Math.min(A.hp, A.baseMaxHp)),
    used: A.used,
    lootBonus: A.lootBonus,
  };
}

/** Что показать игроку на панели действий. */
export function battleControls(st: BattleState) {
  const [A, B] = st.s;
  return {
    hp: [Math.max(0, A.hp), Math.max(0, B.hp)] as [number, number],
    maxHp: [A.maxHp, B.maxHp] as [number, number],
    perks: perksOf(A).map((p) => ({
      id: p.id,
      passive: p.cd === 0 || p.id === 'legend_phoenix',
      usable: perkUsable(A, B, p),
      cdLeft: p.cd === 0 ? 0 : Math.max(0, (A.ready[p.id] ?? 0) - (A.turn + 1)),
      spent: (A.ready[p.id] ?? 0) >= NEVER,
    })),
    items: A.items,
    done: st.done,
  };
}

/** Бой целиком автоматически — для ботов, защиты и тестов. */
export function fight(a: Fighter, b: Fighter, rng: Rng): FightResult {
  const st = newBattle(a, b);
  battleAuto(st, rng);
  return battleResult(st);
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

export type { Consumable };
