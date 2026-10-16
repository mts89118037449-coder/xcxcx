// Симуляция экономики: бот-игрок играет по настоящим серверным правилам N дней.
// Запуск: node --disable-warning=ExperimentalWarning scripts/sim.ts [дней] [seed]
// Профили: казуал (3 захода в день), активный (8) и задрот (16). Никто не донатит.
import { PASS } from '../shared/season.ts';
import * as g from '../server/game.ts';
import { BOSSES as ALL_BOSSES, CLAN, FURNITURE, ITEMS, JOBS, TATTOOS, trainCost, type Item } from '../shared/content.ts';
// симуляция идёт на общем режиме: боссы колоний не в счёт
const BOSSES = ALL_BOSSES.filter((b) => !b.colony);
import { ARM, BREW, CARDS, DARTS, DICE, RACE } from '../shared/minigames.ts';
import { DOMINO, NARDY, PUZZLES, SHIZO_CARDS, isMateMove, legalMoves, nardyLand, nardyStep } from '../shared/minigames2.ts';
import { PLACES } from '../shared/places.ts';
import { RECIPES } from '../shared/craft.ts';
import { CLAN_BOSS } from '../shared/clans.ts';
import { isOpen } from '../shared/unlocks.ts';

const DAYS = Number(process.argv[2] ?? 30);
const SEED = process.argv[3] ?? 'sim';
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 5, 5); // понедельник, 8:00 по Москве

const PROFILES = [
  { name: 'казуал', sessions: 3, games: 0.3 },
  { name: 'активный', sessions: 8, games: 0.7 },
  { name: 'задрот', sessions: 16, games: 1 },
];

const tryIt = <T>(f: () => T): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};

/** Грубая ценность вещи для выбора, что купить и надеть. */
const worth = (b: Partial<Item>) => (b.atk ?? 0) * 1.6 + (b.def ?? 0) * 1.2 + (b.hp ?? 0) * 0.25 + (b.crit ?? 0) * 3 + (b.energy ?? 0) * 0.6 + (b.money ?? 0) * 1.5;

interface Day {
  level: number;
  money: number;
  gold: number;
  butts: number;
  atk: number;
  def: number;
  hp: number;
  bosses: number;
  top: string;
  items: number;
  furniture: number;
  tattoos: number;
  term: number;
  income: Record<string, number>;
}

function simulate(profile: (typeof PROFILES)[number]) {
  const rng = g.seeded(`${SEED}:${profile.name}`);
  const p = g.newPlayer(1, 'Бот', null, T0);
  p.faceChosen = true;
  const days: Day[] = [];
  const income: Record<string, number> = {};
  const add = (k: string, v: number) => (income[k] = (income[k] ?? 0) + v);
  const gold: Record<string, number> = {};
  let gMark = 0;
  const gFrom = (k: string) => {
    gold[k] = (gold[k] ?? 0) + p.gold - gMark;
    gMark = p.gold;
  };
  let bossWins = 0;
  let janPts = 0; // очки сезона за январь (5–31): сезон месячный, в феврале обнуляется
  const tries: Record<string, [number, number]> = {};
  let topBoss = '—';

  for (let d = 0; d < DAYS; d++) {
    for (const k of Object.keys(income)) income[k] = 0;
    for (let s = 0; s < profile.sessions; s++) {
      // заходы равномерно с 8:00 до 24:00
      const now = T0 + d * 24 * HOUR + Math.floor((16 * HOUR * s) / profile.sessions) + Math.floor(rng() * 20 * 60_000);
      gMark = p.gold;
      g.clock.now = () => now;
      g.tick(p, now);
      gFrom('прочее');
      const m0 = p.money;
      if (tryIt(() => g.claimDaily(p, now))) add('грев', p.money - m0);
      gFrom('грев');
      for (let i = 0; i < p.daily.tasks.length; i++) {
        const before = p.money;
        if (tryIt(() => g.claimTask(p, i, now))) add('дела дня', p.money - before);
      }
      gFrom('дела дня');
      if (p.quests.active && p.quests.active.endsAt <= now) {
        const r = tryIt(() => g.finishQuest(p, now, rng));
        if (r) add('поручения', r.money);
      }
      gFrom('поручения');
      g.ensureBoard(p, rng);
      if (!p.quests.active && p.quests.board[0]) tryIt(() => g.startQuest(p, p.quests.board[0].key, now));
      while (tryIt(() => g.claimStory(p, now))) {
        /* забираем всё готовое */
      }
      gFrom('сюжет');

      // бычки с земли и случай
      for (const b of [...p.field]) g.pickButt(p, b.id);
      if (p.event) {
        const before = p.money;
        tryIt(() => g.answerEvent(p, 0, now, rng));
        add('случаи', p.money - before);
      }
      if (now >= p.yardAt) {
        const ev = tryIt(() => g.yardWalk(p, now, rng));
        if (ev) {
          const before = p.money;
          tryIt(() => g.answerEvent(p, 0, now, rng));
          add('случаи', p.money - before);
        }
      }

      gFrom('случаи');
      // мини-игры: часть лимита, пропорционально увлечённости
      if (rng() < profile.games) {
        const share = (n: number) => Math.ceil((n / profile.sessions) * 1.2);
        for (let i = 0; i < share(ARM.perDay); i++) tryIt(() => g.armWrestle(p, ARM.rivals[p.str > 40 ? 2 : p.str > 20 ? 1 : 0].id, 55, now, rng));
        for (let i = 0; i < share(DARTS.perDay); i++) tryIt(() => g.darts(p, [0.5 + rng() * 0.4, 0.5 + rng() * 0.4, 0.4 + rng() * 0.4], now));
        tryIt(() => g.brew(p, 0.7 + rng() * 0.3, now));
        for (let i = 0; i < share(DICE.perDay); i++) {
          const r = tryIt(() => g.dice(p, Math.min(g.diceMaxBet(p), Math.floor(p.money * 0.05)), now, rng));
          if (r) add('кости', r.money);
        }
        for (let i = 0; i < share(RACE.perDay); i++) tryIt(() => g.roachRace(p, 'shustry', 3, now, rng));
        for (let i = 0; i < share(CARDS.perDay); i++) {
          const bet = Math.min(g.cardsMaxBet(p), Math.max(CARDS.minBet, Math.floor(p.money * 0.05)));
          let r = tryIt(() => g.cardsStart(p, bet, now, rng));
          while (r && !r.done) r = r.sum < 16 ? tryIt(() => g.cardsHit(p, now)) : tryIt(() => g.cardsStand(p, now));
          if (r && 'money' in r) add('очко', r.money as number);
        }
      }
      gFrom('мини-игры');

      // --- новое: места, ремесло, вторые мини-игры, ШИЗО, клан, общак, пропуск
      if (rng() < profile.games) {
        for (const pl of PLACES) {
          if (p.level < pl.minLevel) continue;
          for (const a of pl.activities) {
            if (a.cost?.gold || (a.cost?.energy ?? 0) > p.energy * 0.3) continue;
            const before = p.money;
            if (tryIt(() => g.placeDo(p, pl.id, a.id, now, rng))) add('места', p.money - before);
          }
        }
        const lvlOk = (id: string) => isOpen(id, p.level);
        if (lvlOk('speed')) tryIt(() => g.speedChifir(p, 260 + rng() * 200, now));
        if (lvlOk('conveyor')) {
          const r = tryIt(() => g.beltShift(p, 20 + Math.floor(rng() * 8), Math.floor(rng() * 4), now));
          if (r) add('конвейер', r.money);
        }
        if (lvlOk('beads')) tryIt(() => g.beadsPlay(p, Array.from({ length: 10 }, () => 0.5 + rng() * 0.45), now));
        if (lvlOk('fish')) tryIt(() => g.fishing(p, [rng(), rng(), rng()], now, rng));
        if (lvlOk('chess') && tryIt(() => g.chessPuzzle(p, now, rng))) {
          const pz = PUZZLES.find((x) => x.id === p.tables.chess)!;
          const mate = legalMoves(pz.pieces, true).find(([a, b]) => isMateMove(pz.pieces, a, b))!;
          tryIt(() => g.chessSolve(p, rng() < 0.6 ? mate[0] : 'a1', rng() < 0.6 ? mate[1] : 'h8', now));
        }
        const bet = (max: number) => Math.min(max, Math.max(50, Math.floor(p.money * 0.05)));
        if (lvlOk('nardy') && tryIt(() => g.nardyStart(p, bet(NARDY.minBet + p.level * NARDY.betPerLevel), now, rng))) {
          let r: ReturnType<typeof g.nardyMove> | null = null;
          while (p.tables.nardy) {
            const d = p.tables.nardy;
            const k = (['a', 'b', 'sum'] as const).map((x) => ({ x, to: nardyLand(d.me, nardyStep(d.dice, x)) })).sort((a, b) => b.to - a.to)[0].x;
            r = g.nardyMove(p, k, rng);
          }
          add('нарды', (r?.money ?? 0) - (r?.state.bet ?? 0));
        }
        if (lvlOk('domino') && tryIt(() => g.dominoStart(p, bet(DOMINO.minBet + p.level * DOMINO.betPerLevel), now, rng))) {
          const stake = p.tables.domino!.bet;
          let end: { money: number } | null = null;
          while (p.tables.domino) {
            const d = p.tables.domino;
            const l = d.chain[0][0];
            const rr = d.chain[d.chain.length - 1][1];
            const k = d.hand.findIndex((t) => t[0] === l || t[1] === l || t[0] === rr || t[1] === rr);
            const res = k < 0 ? g.dominoMove(p, -1, 'r') : g.dominoMove(p, k, d.hand[k][0] === rr || d.hand[k][1] === rr ? 'r' : 'l');
            end = res.end ?? end;
          }
          add('домино', (end?.money ?? 0) - stake);
        }
        if (lvlOk('shizo') && tryIt(() => g.shizoStart(p, now, rng))) {
          while (p.tables.shizo) {
            const st = p.tables.shizo;
            const card = SHIZO_CARDS.find((c) => c.id === st.card)!;
            const after = (o: (typeof card.opts)[number]) => Math.min(st.heat + (o.d.heat ?? 0), st.food + (o.d.food ?? 0), st.spirit + (o.d.spirit ?? 0));
            const k = card.opts.map((o, i) => ({ i, v: after(o) - (o.butts && p.butts < o.butts ? 99 : 0) })).sort((a, b) => b.v - a.v)[0].i;
            g.shizoPick(p, k, now, rng);
          }
        }
        // ремесло: всё, что можно сделать
        for (const r of RECIPES) while (tryIt(() => g.craft(p, r.id, now))) add('ремесло (шт)', 1);
      }
      // клан (как будто в клане из пяти таких же): пара ударов в заход, к вечеру босс добит
      if (p.level >= CLAN.minLevel) {
        p.clanId = 1;
        for (let i = 0; i < 2; i++) tryIt(() => g.clanBossHit(p, now + i * 31_000, rng));
        if (s === profile.sessions - 1) {
          const money = Math.round(CLAN_BOSS.rationsPerMember * g.ration(p) * 1.1);
          p.money += money;
          p.gold += CLAN_BOSS.gold;
          add('босс клана', money);
        }
      }
      gFrom('клан');
      if (isOpen('people', p.level)) {
        const before = p.money;
        if (tryIt(() => g.obshakAsk(p, { total: 1e9, log: [] }, now))) add('общак (помощь)', p.money - before);
      }
      for (let L = 1; L <= PASS.levels; L++) {
        const before = p.money;
        if (tryIt(() => g.seasonClaim(p, L, false, now, rng))) add('пропуск', p.money - before);
      }
      gFrom('пропуск');
      // бычки → энергия у барыги, если есть куда
      while (p.butts >= 8 && tryIt(() => g.trade(p, 'energy', now))) add('бычки→энергия', 15);

      // тратим энергию: сильнейший доступный босс, наезды, лучшая смена
      const failed = new Set<string>();
      for (let guard = 0; guard < 60; guard++) {
        const hpOk = p.hp >= g.stats(p, now).maxHp * 0.3;
        const boss = [...BOSSES].reverse().find((b) => b.minLevel <= p.level && (p.bossCd[b.id] ?? 0) <= now && p.energy >= b.energy && !failed.has(b.id));
        if (boss && hpOk) {
          const before = p.money;
          const r = tryIt(() => g.fightBoss(p, boss.id, now, rng));
          const t = (tries[boss.name] ??= [0, 0]);
          t[0]++;
          if (r?.win) t[1]++;
          if (r?.win) {
            bossWins++;
            if (BOSSES.indexOf(boss) >= BOSSES.findIndex((b) => b.name === topBoss)) topBoss = boss.name;
            add('боссы', p.money - before);
          } else failed.add(boss.id);
          continue;
        }
        if (hpOk && p.energy >= 10 && rng() < 0.3) {
          const r = tryIt(() => g.pvp(p, null, now, rng));
          if (r) {
            add('наезды', r.loot);
            continue;
          }
        }
        const job = [...JOBS].reverse().find((j) => j.minLevel <= p.level && p.energy >= j.energy);
        if (!job) break;
        const r = g.doJob(p, job.id, now, rng);
        add('работа', r.money);
      }

      gFrom('бои');
      if (!p.mast && p.level >= 5) g.chooseMast(p, profile.sessions >= 16 ? 'otric' : profile.sessions >= 8 ? 'blat' : 'muzhik', now);
      // покупки: очки навыков, шмот, мебель, наколки, качалка
      while (p.statPoints > 0) g.allocate(p, p.str <= p.end * 1.6 ? 'str' : p.end <= p.agi * 1.4 ? 'end' : 'agi');
      for (const slot of ['weapon', 'body', 'head', 'legs', 'feet', 'charm'] as const) {
        const cur = ITEMS.find((i) => i.id === p.equipped[slot]);
        const best = ITEMS.filter((i) => i.slot === slot && i.currency === 'money' && !i.bossOnly && i.minLevel <= p.level && !p.inventory.includes(i.id) && worth(i) > (cur ? worth(cur) : 0) && i.price <= p.money * 0.7).sort((a, b) => worth(b) - worth(a))[0];
        if (best && tryIt(() => g.buyItem(p, best.id))) {
          add('трата: шмот', -best.price);
          g.equip(p, best.id, now);
        }
        const owned = ITEMS.filter((i) => i.slot === slot && p.inventory.includes(i.id) && i.minLevel <= p.level).sort((a, b) => worth(b) - worth(a))[0];
        if (owned && owned.id !== p.equipped[slot]) g.equip(p, owned.id, now);
      }
      for (const f of FURNITURE) {
        if (f.currency !== 'money' || p.furniture.includes(f.id) || f.price > p.money * 0.5) continue;
        if (tryIt(() => g.buyFurniture(p, f.id, now))) add('трата: мебель', -f.price);
      }
      for (const t of TATTOOS) {
        if (t.currency !== 'money' || p.tattoos.includes(t.id) || t.price > p.money * 0.5) continue;
        if (tryIt(() => g.buyTattoo(p, t.id, now))) add('трата: наколки', -t.price);
      }
      for (let i = 0; i < 30; i++) {
        const stat = p.str <= p.end * 1.6 ? 'str' : 'end';
        const cost = trainCost(p[stat]);
        if (cost > p.money * 0.35) break;
        g.train(p, stat);
        add('трата: качалка', -cost);
      }
    }
    const st = g.stats(p, T0 + (d + 1) * 24 * HOUR);
    if (d < 27) janPts = p.season.pts;
    days.push({
      level: p.level,
      money: p.money,
      gold: p.gold,
      butts: p.butts,
      atk: st.atk,
      def: st.def,
      hp: st.maxHp,
      bosses: bossWins,
      top: topBoss,
      items: p.inventory.length,
      furniture: p.furniture.length,
      tattoos: p.tattoos.length,
      term: Math.ceil(p.term),
      income: { ...income },
    });
  }
  return { days, tries, gold, seasonPerDay: janPts / 27 };
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
for (const pr of PROFILES) {
  const { days, tries, gold, seasonPerDay } = simulate(pr);
  console.log(`\n=== ${pr.name}: ${pr.sessions} заходов в день ===`);
  console.log('день  ур   деньги   золото бычки  атк  защ   хп  боссов лучший босс          шмот мебель наколки срок');
  for (const [i, d] of days.entries()) {
    if (![0, 1, 2, 4, 6, 9, 13, 19, 29, 44, 59].includes(i) && i !== days.length - 1) continue;
    console.log(
      `${String(i + 1).padStart(4)} ${String(d.level).padStart(4)} ${fmt(d.money).padStart(9)} ${String(d.gold).padStart(6)} ${String(d.butts).padStart(5)} ${String(d.atk).padStart(4)} ${String(d.def).padStart(4)} ${String(d.hp).padStart(5)} ${String(d.bosses).padStart(6)} ${d.top.padEnd(20)} ${String(d.items).padStart(4)}/${ITEMS.length} ${String(d.furniture).padStart(3)}/${FURNITURE.length} ${String(d.tattoos).padStart(3)}/${TATTOOS.length} ${String(d.term).padStart(4)}`,
    );
  }
  const last = days[days.length - 1].income;
  const early = days[Math.min(4, days.length - 1)].income;
  console.log('доходы на 5-й день:', Object.entries(early).filter(([, v]) => v).map(([k, v]) => `${k} ${fmt(v)}`).join(' · '));
  console.log(`золото за ${DAYS} дн. по источникам:`, Object.entries(gold).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log('боссы (побед/попыток):', Object.entries(tries).map(([k, [n, w]]) => `${k} ${w}/${n}`).join(' · '));
  console.log(`очки сезона: ~${Math.round(seasonPerDay)} в день → за 27 дней января уровень пропуска ≈ ${Math.min(PASS.levels, Math.floor((seasonPerDay * 27) / PASS.perLevel))}/${PASS.levels}`);
  console.log('доходы и траты за последний день:', Object.entries(last).map(([k, v]) => `${k} ${fmt(v)}`).join(' · '));
}
