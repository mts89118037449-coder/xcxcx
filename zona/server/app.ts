import express, { type Request, type Response, type NextFunction } from 'express';
import { EVENT_TIMING, MEDIC, eventById } from '../shared/events.ts';
import { OBSHAK } from '../shared/factions.ts';
import { ANTICHEAT } from '../shared/anticheat.ts';
import { CHAT } from '../shared/chat.ts';
import { seasonEndsAt, seasonIndex, seasonTheme } from '../shared/season.ts';
import { CLAN_BOSS, CLAN_WAR, HUT_RULES, PARCEL, REFERRAL, hutById, type HutId } from '../shared/clans.ts';
import { BEADS, BELT, CHESS, DOMINO, FISH, NARDY, SHIZO, SPEED } from '../shared/minigames2.ts';
import { ARM, BREW, CARDS, DARTS, DICE, RACE } from '../shared/minigames.ts';
import { NOTIFY, termDays } from '../shared/term.ts';
import { BALANCE, CHURCH, cellView, comfortOf, CLAN, offerOfDay, PULLUPS, WORLD_BOSS, packById, rankTitle, xpToNext, type Slot, type Stat } from '../shared/content.ts';
import type { ClanView, PlayerView, VisitView, WorldBossView } from '../shared/types.ts';
import { validateInitData, type TgUser } from './auth.ts';
import type { Db } from './db.ts';
import * as g from './game.ts';
import { battleResult } from './combat.ts';
import type { Bot, TgUpdate } from './telegram.ts';

export interface AppOptions {
  db: Db;
  bot: Bot | null;
  botToken: string;
  webAppUrl: string;
  botUsername?: string;
  webhookSecret: string;
  adminIds: number[];
  devAuth: boolean;
  now?: () => number;
  rng?: g.Rng;
  staticDir?: string;
  /** запросов на игрока: запас и пополнение в секунду (по умолчанию 40 и 8) */
  rateLimit?: { burst: number; perSec: number };
}

interface AuthedRequest extends Request {
  tgUser?: TgUser;
  startParam?: string | null;
}

export function createApp(opts: AppOptions) {
  const { db, bot } = opts;
  const now = opts.now ?? Date.now;
  const rng = opts.rng ?? Math.random;
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // --- Авторизация ---------------------------------------------------------
  function auth(req: AuthedRequest, res: Response, next: NextFunction) {
    const header = req.get('authorization') ?? '';
    const raw = header.startsWith('tma ') ? header.slice(4) : '';
    if (opts.devAuth && raw.startsWith('dev:')) {
      // Локальная отладка в обычном браузере: "tma dev:<id>:<имя>".
      const [, id, name] = raw.split(':');
      req.tgUser = { id: Number(id) || 1, first_name: decodeURIComponent(name || 'Тестер') };
      req.startParam = null;
      return next();
    }
    const data = validateInitData(raw, opts.botToken);
    if (!data) return res.status(401).json({ error: 'Открой игру через Telegram' });
    req.tgUser = data.user;
    req.startParam = data.startParam;
    next();
  }

  function loadOrCreate(user: TgUser, startParam: string | null, t: number): g.Player {
    let p = db.getPlayer(user.id);
    if (!p) {
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
      p = g.newPlayer(user.id, name, user.username ?? null, t);
      const refId = startParam?.startsWith('ref_') ? Number(startParam.slice(4)) : NaN;
      const referrer = Number.isFinite(refId) && refId !== user.id ? db.getPlayer(refId) : null;
      if (referrer) {
        p.refBy = referrer.id;
        p.gold += BALANCE.referralGold;
        g.log(p, t, `🤝 Тебя подтянул ${referrer.name}: +${BALANCE.referralGold} золота`);
        referrer.gold += BALANCE.referralGold;
        referrer.refCount += 1;
        g.log(referrer, t, `🤝 По твоей ссылке заехал ${p.name}: +${BALANCE.referralGold} золота`);
        db.savePlayer(referrer);
      }
    }
    g.tick(p, t);
    db.markSeen(g.dayKey(t), p.id);
    syncClan(p);
    g.ensureBoard(p, rng);
    p.lastSeen = t;
    return p;
  }

  /** Уровень клана кэшируется в игроке: от него зависят бонусы в stats(). */
  function syncClan(p: g.Player) {
    const clan = p.clanId ? db.getClan(p.clanId) : null;
    if (!clan) p.clanId = null;
    p.clanLevel = clan?.level ?? 0;
    p.clanHut = clan ? clanState(clan.id).hut : {};
  }

  // Состояние клана сверх таблицы: постройки хаты и босс дня
  interface ClanState {
    hut: Partial<Record<HutId, number>>;
    boss: { day: string; hp: number; max: number; hits: Record<string, number>; killed: boolean } | null;
  }
  const clanState = (id: number) => db.kvGet<ClanState>(`clan:${id}`, { hut: {}, boss: null });
  const saveClanState = (id: number, st: ClanState) => db.kvSet(`clan:${id}`, st);
  const warTable = (week: number) => db.kvGet<Record<string, number>>(`clanwar:${week}`, {});
  const addWar = (clanId: number, week: number, pts: number) => {
    const w = warTable(week);
    w[clanId] = (w[clanId] ?? 0) + pts;
    db.kvSet(`clanwar:${week}`, w);
  };
  const warRanking = (week: number) =>
    Object.entries(warTable(week))
      .map(([id, pts]) => ({ id: Number(id), pts }))
      .sort((a, b) => b.pts - a.pts);

  /** Подтянутый вырос: золото тому, кто подтянул, и доля — тому, кто подтянул его. */
  function payReferral(p: g.Player, t: number) {
    const due = g.refDue(p);
    if (!due.length) return;
    const ref = db.getPlayer(p.refBy!);
    for (const m of due) {
      p.refPaid.push(m.level);
      if (!ref) continue;
      ref.gold += m.gold;
      g.log(ref, t, `🤝 ${p.name} дорос до ${m.level} уровня: +${m.gold} 🪙`);
      notifyPlayer(ref.id, `🤝 Твой кент ${p.name} дорос до ${m.level} уровня — тебе ${m.gold} золота`);
      const grand = ref.refBy ? db.getPlayer(ref.refBy) : null;
      if (grand && grand.id !== p.id) {
        const share = Math.round(m.gold * REFERRAL.grandShare);
        grand.gold += share;
        g.log(grand, t, `🤝 Кент твоего кента (${p.name}) дорос до ${m.level} уровня: +${share} 🪙`);
        db.savePlayer(grand);
      }
    }
    if (ref) db.savePlayer(ref);
  }

  /** Ринг: провести бой, если пора, и сделать действие. Банк с тотализатора — на общак. */
  function withRing<T>(p: g.Player | null, t: number, fn: (ring: g.Ring) => T): T {
    const ring = db.kvGet<g.Ring>('ring', g.emptyRing());
    const cut = g.ringResolve(
      ring,
      t,
      (id) => (p && id === p.id ? p : db.getPlayer(id)),
      (x) => x !== p && db.savePlayer(x),
      rng,
    );
    if (cut > 0) {
      const ob = db.kvGet<g.Obshak>('obshak', { total: 0, log: [] });
      ob.total += cut;
      db.kvSet('obshak', ob);
    }
    const r = fn(ring);
    db.kvSet('ring', ring);
    return r;
  }

  /** Босс клана на сегодня: новый каждый день, толщина от числа участников и уровня. */
  function clanBossToday(clanId: number, t: number): ClanState {
    const st = clanState(clanId);
    const day = g.dayKey(t);
    if (!st.boss || st.boss.day !== day) {
      const c = db.getClan(clanId)!;
      const max = Math.round(CLAN_BOSS.hpPerMember * Math.max(1, db.clanMembers(clanId).length) * (1 + c.level * CLAN_BOSS.hpPerLevel));
      st.boss = { day, hp: max, max, hits: {}, killed: false };
      saveClanState(clanId, st);
    }
    return st;
  }

  function view(p: g.Player, t: number): PlayerView {
    const s = g.stats(p, t);
    const vip = g.isVip(p, t);
    const regenMs = (BALANCE.energyRegenSec * 1000) / (vip ? 2 : 1);
    return {
      id: p.id,
      name: p.name,
      level: p.level,
      xp: p.xp,
      xpNext: xpToNext(p.level),
      money: p.money,
      gold: p.gold,
      str: p.str,
      agi: p.agi,
      end: p.end,
      statPoints: p.statPoints,
      authority: p.authority,
      rank: rankTitle(p.authority),
      place: db.rank(p.authority),
      wins: p.wins,
      losses: p.losses,
      bossKills: p.bossKills,
      hp: p.hp,
      energy: p.energy,
      nextEnergyAt: p.energy >= s.maxEnergy ? null : p.energyAt + regenMs,
      stats: s,
      vipUntil: vip ? p.vipUntil : null,
      dailyReadyAt: p.dailyAt + 24 * 3600 * 1000,
      dailyStreak: p.dailyStreak,
      starterBought: p.starterBought,
      equipped: p.equipped,
      inventory: p.inventory,
      tattoos: p.tattoos,
      furniture: p.furniture,
      face: p.face,
      faceChosen: p.faceChosen,
      build: p.build,
      skin: p.skin,
      nameChanged: p.nameChanged,
      interior: p.interior,
      ownedInteriors: p.ownedInteriors,
      chifir: p.chifir,
      butts: p.butts,
      field: p.field,
      nextButtAt: g.nextButtAt(p),
      shellsLeft: g.shellsLeft(p, t),
      weekly: (() => {
        g.ensureWeekly(p, t);
        return { ...p.weekly, event: g.weeklyEvent(t).id, endsAt: g.weekEndsAt(t) };
      })(),
      blessUntil: p.blessUntil,
      prayReadyAt: p.prayAt + CHURCH.prayCooldownMin * 60_000,
      confessReady: p.confessDay !== g.dayKey(t),
      pullupsReadyAt: p.pullups.at + PULLUPS.cooldownMin * 60_000,
      pullupsLeft: g.pullupsLeft(p, t),
      daily: p.daily,
      quests: p.quests,
      clan: (() => {
        const c = p.clanId ? db.getClan(p.clanId) : null;
        return c ? { id: c.id, name: c.name, tag: c.tag, level: c.level, owner: c.owner_id === p.id } : null;
      })(),
      bossCd: p.bossCd,
      pvpReadyAt: p.pvpAt + BALANCE.pvpCooldownSec * 1000,
      worldHitReadyAt: p.worldHitAt + WORLD_BOSS.cooldownSec * 1000,
      shieldUntil: p.shieldUntil,
      refCount: p.refCount,
      cell: cellView(p.furniture, p.cellShow),
      cellShow: p.cellShow,
      comfort: comfortOf(p.furniture),
      event: p.event && p.event.until > t ? { ...p.event, who: eventById.get(p.event.id)?.who, name: eventById.get(p.event.id)?.name } : null,
      placeCd: p.placeCd,
      rep: p.rep,
      debt: p.debt,
      mats: p.mats,
      season: (() => {
        g.ensureSeason(p, t);
        const th = seasonTheme(p.season.id);
        return { ...p.season, name: th.name, emoji: th.emoji, desc: th.desc, focus: th.focusLabel, endsAt: seasonEndsAt(t) };
      })(),
      cosmetics: p.cosmetics,
      unlocksSeen: p.unlocksSeen,
      frame: p.frame,
      title: p.title,
      offer: { id: offerOfDay(t).id, bought: p.offerDay === Math.floor((t + 3 * 3600_000) / 86_400_000) },
      parcelsLeft: p.parcels.day === g.dayKey(t) ? Math.max(0, PARCEL.perDay - p.parcels.n) : PARCEL.perDay,
      clanHitReadyAt: p.clanHitAt + CLAN_BOSS.cooldownSec * 1000,
      war: p.war,
      warClaimed: p.warClaimed,
      week: g.weekIndex(t),
      loanLimit: g.loanLimit(p),
      obshak: { ...db.kvGet<g.Obshak>('obshak', { total: 0, log: [] }), askReadyAt: p.obshakAskAt + OBSHAK.askCooldownH * 3600_000 },
      yardReadyAt: p.yardAt + EVENT_TIMING.yardCooldownMin * 60_000,
      escape: { cdUntil: p.escape.cdUntil, stage: p.escape.run?.stage ?? null, best: p.escape.best },
      medBedReadyAt: p.medBedAt + MEDIC.bedCooldownMin * 60_000,
      noteReady: p.noteDay !== g.dayKey(t),
      snoopsLeft: g.snoopsLeft(p, t),
      battle: g.battleView(p),
      admin: opts.adminIds.includes(p.id),
      story: p.story,
      mast: p.mast,
      upgrades: p.upgrades,
      hodka: p.hodka,
      term: p.term,
      termTotal: termDays(p.hodka),
      hodkaBonus: g.hodkaBonus(p),
      intro: p.intro,
      notifyOn: p.notify.on,
      games: {
        cards: g.playsLeft(p, 'cards', CARDS.perDay, t),
        race: g.playsLeft(p, 'race', RACE.perDay, t),
        brew: g.playsLeft(p, 'brew', BREW.perDay, t),
        brewReadyAt: (p.minigames.brew?.at ?? 0) + BREW.cooldownMin * 60_000,
        cardsMaxBet: g.cardsMaxBet(p),
        dice: g.playsLeft(p, 'dice', DICE.perDay, t),
        diceMaxBet: g.diceMaxBet(p),
        arm: g.playsLeft(p, 'arm', ARM.perDay, t),
        darts: g.playsLeft(p, 'darts', DARTS.perDay, t),
        nardy: g.playsLeft(p, 'nardy', NARDY.perDay, t),
        domino: g.playsLeft(p, 'domino', DOMINO.perDay, t),
        chess: g.playsLeft(p, 'chess', CHESS.perDay, t),
        speed: g.playsLeft(p, 'speed', SPEED.perDay, t),
        conveyor: g.playsLeft(p, 'conveyor', BELT.perDay, t),
        beads: g.playsLeft(p, 'beads', BEADS.perDay, t),
        beadsReadyAt: (p.minigames.beads?.at ?? 0) + BEADS.cooldownMin * 60_000,
        fish: g.playsLeft(p, 'fish', FISH.perDay, t),
        shizo: g.playsLeft(p, 'shizo', SHIZO.perDay, t),
        tableMaxBet: NARDY.minBet + p.level * NARDY.betPerLevel,
      },
      tables: p.tables,
      god: p.god.on,
      perks: p.perks,
      belt: p.belt,
      stash: p.stash,
      journal: p.journal.slice(0, 15),
    };
  }

  function worldBoss(t: number): NonNullable<ReturnType<Db['worldBoss']>> {
    const boss = db.worldBoss();
    if (boss) return boss;
    const gen = db.lastBossGen() + 1;
    db.spawnWorldBoss(gen, Math.round(WORLD_BOSS.baseHp * Math.pow(WORLD_BOSS.hpGrowth, gen - 1)), t);
    return db.worldBoss()!;
  }

  function worldView(playerId: number, t: number): WorldBossView {
    const boss = worldBoss(t);
    return {
      gen: boss.gen,
      hp: boss.hp,
      maxHp: boss.max_hp,
      top: db.hits(boss.id).slice(0, 10),
      myDamage: db.myHit(boss.id, playerId),
      participants: db.hits(boss.id).length,
    };
  }

  /** Делёж награды за общего босса пропорционально урону. */
  function rewardWorldBoss(bossId: number, hitter: g.Player, t: number) {
    const hits = db.hits(bossId);
    const total = hits.reduce((sum, h) => sum + h.damage, 0) || 1;
    hits.forEach((h, i) => {
      const p = h.id === hitter.id ? hitter : db.getPlayer(h.id);
      if (!p) return;
      const share = h.damage / total;
      const money = Math.round(WORLD_BOSS.rewardPool.money * share);
      const xp = Math.max(5, Math.round(WORLD_BOSS.rewardPool.xp * share));
      const authority = Math.round(WORLD_BOSS.rewardPool.authority * share);
      const gold = WORLD_BOSS.topGold[i] ?? 0;
      p.money += money;
      p.gold += gold;
      p.authority += authority;
      g.addXp(p, xp, t);
      g.log(p, t, `${WORLD_BOSS.emoji} Бунт подавлен! Твоя доля: ${money} ₽, ${xp} опыта${gold ? `, ${gold} золота` : ''} (место ${i + 1})`);
      if (p !== hitter) db.savePlayer(p);
    });
  }

  /** Сообщение игроку от бота с кнопкой «Играть». */
  function notifyPlayer(id: number, text: string) {
    const markup = opts.webAppUrl ? { reply_markup: { inline_keyboard: [[{ text: '🎮 Играть', web_app: { url: opts.webAppUrl } }]] } } : {};
    return bot?.call('sendMessage', { chat_id: id, text, ...markup }).catch(() => null);
  }

  /** Раз в несколько минут: кому из недавно игравших есть что сказать. */
  function runNotifier() {
    if (!bot) return 0;
    const t = now();
    let sent = 0;
    for (const p of db.recentPlayers(t - NOTIFY.activeWithinDays * 24 * 3600_000)) {
      g.tick(p, t);
      const n = g.pendingNotice(p, t);
      if (!n) continue;
      g.markNotified(p, n.kind, t);
      db.savePlayer(p);
      notifyPlayer(p.id, n.text);
      sent++;
    }
    return sent;
  }

  // --- API игры ------------------------------------------------------------
  const api = express.Router();
  api.use(auth);

  // Ограничение частоты на игрока (ведро с жетонами): живой игрок столько не нажмёт,
  // а скрипт, долбящий мини-игры или бои, упрётся и не положит сервер.
  const limit = opts.rateLimit ?? { burst: 40, perSec: 8 };
  const buckets = new Map<number, { tokens: number; at: number }>();
  api.use((req: AuthedRequest, res, next) => {
    const id = req.tgUser!.id;
    const t = Date.now();
    const b = buckets.get(id) ?? { tokens: limit.burst, at: t };
    b.tokens = Math.min(limit.burst, b.tokens + ((t - b.at) / 1000) * limit.perSec);
    b.at = t;
    if (b.tokens < 1) {
      buckets.set(id, b);
      return res.status(429).json({ error: 'Слишком часто — подожди секунду' });
    }
    b.tokens -= 1;
    buckets.set(id, b);
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (t - v.at > 60_000) buckets.delete(k);
    next();
  });

  api.post('/me', (req: AuthedRequest, res) => {
    const t = now();
    const p = db.transaction(() => {
      const p = loadOrCreate(req.tgUser!, req.startParam ?? null, t);
      db.savePlayer(p);
      return p;
    });
    res.json({ player: view(p, t), online: db.online(t - BALANCE.onlineWindowSec * 1000), botUsername: opts.botUsername ?? '' });
  });

  type Handler = (p: g.Player, body: Record<string, unknown>, t: number) => unknown;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  const clanOf = (p: g.Player) => {
    const c = p.clanId ? db.getClan(p.clanId) : null;
    if (!c) throw new g.GameError('Ты не в клане');
    return c;
  };
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));

  const actions: Record<string, Handler> = {
    look: (p, b) => g.setLook(p, num(b.build), num(b.skin)),
    mast: (p, b, t) => g.chooseMast(p, str(b.id), t),
    release: (p, _b, t) => g.release(p, t),
    upgrade: (p, b) => g.upgradeItem(p, str(b.itemId)),
    intro: (p, b, t) => g.introStep(p, num(b.choice), t),
    notify: (p, b) => g.setNotify(p, !!b.on),
    story: (p, _b, t) => g.claimStory(p, t),
    cardsStart: (p, b, t) => g.cardsStart(p, num(b.bet), t, rng),
    cardsHit: (p, _b, t) => g.cardsHit(p, t),
    cardsStand: (p, _b, t) => g.cardsStand(p, t),
    race: (p, b, t) => g.roachRace(p, str(b.pick), num(b.bet), t, rng),
    brew: (p, b, t) => g.brew(p, num(b.quality), t),
    dice: (p, b, t) => g.dice(p, num(b.bet), t, rng),
    arm: (p, b, t) => g.armWrestle(p, str(b.rival), num(b.taps), t, rng),
    darts: (p, b, t) => g.darts(p, b.accs, t),
    nardyStart: (p, b, t) => g.nardyStart(p, num(b.bet), t, rng),
    nardyMove: (p, b) => g.nardyMove(p, str(b.pick) as 'a' | 'b' | 'sum', rng),
    dominoStart: (p, b, t) => g.dominoStart(p, num(b.bet), t, rng),
    dominoMove: (p, b) => g.dominoMove(p, Math.floor(num(b.index)), str(b.side) === 'l' ? 'l' : 'r'),
    chessPuzzle: (p, _b, t) => g.chessPuzzle(p, t, rng),
    chessSolve: (p, b, t) => g.chessSolve(p, str(b.from), str(b.to), t),
    speed: (p, b, t) => g.speedChifir(p, num(b.ms), t),
    conveyor: (p, b, t) => g.beltShift(p, num(b.good), num(b.missed), t),
    beads: (p, b, t) => g.beadsPlay(p, b.accs, t),
    fish: (p, b, t) => g.fishing(p, b.accs, t, rng),
    shizoStart: (p, _b, t) => g.shizoStart(p, t, rng),
    shizoPick: (p, b, t) => g.shizoPick(p, Math.floor(num(b.choice)), t, rng),
    adminGod: (p, _b, t) => g.toggleGod(p, t),
    adminTool: (p, b, t) => g.adminTool(p, str(b.tool), str(b.arg), t),
    cellShow: (p, b) => g.setCellShow(p, str(b.spot), str(b.id)),
    event: (p, b, t) => g.answerEvent(p, num(b.choice), t, rng),
    yard: (p, _b, t) => g.yardWalk(p, t, rng),
    escapeStart: (p, _b, t) => g.escapeStart(p, t),
    escapeStep: (p, b, t) => g.escapeStep(p, num(b.quality), t, rng),
    escapeBail: (p, _b, t) => g.escapeEnd(p, false, t, rng),
    medBed: (p, _b, t) => g.medBed(p, t),
    medShot: (p, _b, t) => g.medShot(p, t),
    medNote: (p, _b, t) => g.medNote(p, t, rng),
    gift: (p, b, t) => {
      const target = db.getPlayer(num(b.id));
      if (!target) throw new g.GameError('Нет такого игрока');
      g.gift(p, target, t);
      db.savePlayer(target);
    },
    parcel: (p, b, t) => {
      const target = db.getPlayer(num(b.id));
      if (!target) throw new g.GameError('Нет такого игрока');
      const r = g.sendParcel(p, target, str(b.kind) as 'item' | 'mat', str(b.ref), Math.floor(num(b.qty)), t);
      db.savePlayer(target);
      notifyPlayer(target.id, `📦 ${p.name} прислал тебе грев: ${r.label} ×${r.qty}`);
      return r;
    },
    snoop: (p, b, t) => {
      const target = db.getPlayer(num(b.id));
      if (!target) throw new g.GameError('Нет такого игрока');
      const r = g.snoop(p, target, t, rng);
      db.savePlayer(target);
      return r;
    },
    perks: (p, b) => g.setPerks(p, Array.isArray(b.ids) ? b.ids.map(str) : []),
    belt: (p, b) => g.setBelt(p, Array.isArray(b.ids) ? b.ids.map(str) : []),
    buyItem: (p, b) => g.buyConsumable(p, str(b.id), num(b.n)),
    rename: (p, b) => g.rename(p, str(b.name)),
    interior: (p, b) => g.buyInterior(p, str(b.id)),
    energy: (p, _b, t) => g.buyEnergy(p, t),
    buyChifir: (p) => g.buyChifir(p),
    chifir: (p, _b, t) => g.drinkChifir(p, t),
    butt: (p, b) => g.pickButt(p, num(b.id)),
    trade: (p, b, t) => g.trade(p, str(b.offer), t),
    weekly: (p, b, t) => g.claimWeekly(p, num(b.tier), t),
    pray: (p, _b, t) => g.pray(p, t),
    place: (p, b, t) => g.placeDo(p, String(b.place), String(b.act), t, rng),
    chatSay: (p, b, t) => {
      const channel = str(b.channel) === 'clan' ? 'clan' : 'all';
      if (channel === 'clan' && !p.clanId) throw new g.GameError('Ты не в клане');
      g.chatSay(p, str(b.phrase), t);
      return { id: db.chatAdd(channel === 'clan' ? `clan:${p.clanId}` : 'all', p.id, p.name, p.face ?? null, str(b.phrase), t, p.frame, p.title) };
    },
    unlocksSeen: (p, b) => g.seeUnlocks(p, Array.isArray(b.ids) ? b.ids.map(str) : []),
    seasonClaim: (p, b, t) => g.seasonClaim(p, Math.floor(num(b.level)), b.paid === true, t, rng),
    wear: (p, b) => g.wearCosmetic(p, str(b.kind) === 'title' ? 'title' : 'frame', str(b.id)),
    ringJoin: (p, _b, t) => withRing(p, t, (ring) => g.ringJoin(p, ring, t)),
    ringBet: (p, b, t) => withRing(p, t, (ring) => g.ringBet(p, ring, str(b.side) as 'a' | 'b', num(b.amount), t)),
    obshakGive: (p, b, t) => {
      const ob = db.kvGet<g.Obshak>('obshak', { total: 0, log: [] });
      const r = g.obshakGive(p, ob, num(b.rations), t);
      db.kvSet('obshak', ob);
      return r;
    },
    craft: (p, b, t) => g.craft(p, str(b.recipe), t),
    lotPut: (p, b, t) => {
      const kind = str(b.kind) as g.GoodsKind;
      const ref = str(b.ref);
      const qty = Math.floor(num(b.qty));
      const price = Math.floor(num(b.price));
      if (!(price >= 1 && price <= g.MARKET.maxPrice)) throw new g.GameError('Странная цена');
      if (db.lotsBy(p.id) >= g.MARKET.maxLots) throw new g.GameError(`Не больше ${g.MARKET.maxLots} лотов на прилавке`);
      g.takeGoods(p, kind, ref, qty);
      return { id: db.lotAdd({ seller_id: p.id, seller_name: p.name, kind, ref, qty, price, created_at: t }) };
    },
    lotTake: (p, b) => {
      const lot = db.lotGet(num(b.id));
      if (!lot || lot.seller_id !== p.id) throw new g.GameError('Нет такого лота');
      db.lotDel(lot.id);
      g.giveGoods(p, lot.kind, lot.ref, lot.qty);
    },
    lotBuy: (p, b, t) => {
      const lot = db.lotGet(num(b.id));
      if (!lot) throw new g.GameError('Уже купили');
      if (lot.seller_id === p.id) throw new g.GameError('Своё не покупают');
      if (lot.kind === 'gear' && p.inventory.includes(lot.ref)) throw new g.GameError('Такая вещь уже есть');
      if (p.money < lot.price) throw new g.GameError('Не хватает денег');
      const seller = db.getPlayer(lot.seller_id);
      p.money -= lot.price;
      g.giveGoods(p, lot.kind, lot.ref, lot.qty);
      db.lotDel(lot.id);
      const fee = Math.floor(lot.price * g.MARKET.fee);
      if (seller) {
        seller.money += lot.price - fee;
        g.log(seller, t, `🛒 ${p.name} купил твой лот за ${lot.price} ₽ (−${fee} ₽ в общак)`);
        db.savePlayer(seller);
      }
      // процент с барахолки идёт на общак
      const ob = db.kvGet<g.Obshak>('obshak', { total: 0, log: [] });
      ob.total += fee;
      db.kvSet('obshak', ob);
      return { kind: lot.kind, ref: lot.ref, qty: lot.qty, price: lot.price };
    },
    loanTake: (p, b, t) => g.loanTake(p, num(b.rations), t),
    loanPay: (p, b, t) => g.loanPay(p, num(b.amount), t),
    obshakAsk: (p, _b, t) => {
      const ob = db.kvGet<g.Obshak>('obshak', { total: 0, log: [] });
      const r = g.obshakAsk(p, ob, t);
      db.kvSet('obshak', ob);
      return r;
    },
    candle: (p, _b, t) => g.lightCandle(p, t),
    confess: (p, _b, t) => g.confess(p, t),
    pullups: (p, b, t) => g.pullups(p, num(b.reps), t),
    shells: (p, b, t) => g.playShells(p, num(b.bet), num(b.pick), t, rng),
    task: (p, b, t) => g.claimTask(p, num(b.index), t),
    questStart: (p, b, t) => g.startQuest(p, str(b.key), t),
    questSkip: (p, _b, t) => g.skipQuest(p, t),
    questFinish: (p, _b, t) => g.finishQuest(p, t, rng),
    questReroll: (p) => g.rerollBoard(p, rng),
    respect: (p, b, t) => {
      const target = db.getPlayer(num(b.id));
      if (!target) throw new g.GameError('Нет такого игрока');
      g.respect(p, target, t);
      db.savePlayer(target);
    },
    clanCreate: (p, b, t) => {
      if (p.clanId) throw new g.GameError('Сначала выйди из клана');
      if (p.level < CLAN.minLevel) throw new g.GameError(`Клан можно создать с ${CLAN.minLevel} уровня`);
      const name = str(b.name).replace(/\s+/g, ' ').trim();
      const tag = str(b.tag).trim().toUpperCase();
      if (name.length < 3 || name.length > 20) throw new g.GameError('Название — от 3 до 20 символов');
      if (!/^[\p{L}\p{N}]{2,4}$/u.test(tag)) throw new g.GameError('Тег — 2–4 буквы или цифры');
      if (db.clanNameTaken(name)) throw new g.GameError('Такое название уже занято');
      if (p.money < CLAN.createCost) throw new g.GameError('Не хватает денег');
      p.money -= CLAN.createCost;
      p.clanId = db.createClan(name, tag, p.id, t);
      syncClan(p);
      g.log(p, t, `🏴 Основал клан «${name}» [${tag}]`);
      return { id: p.clanId };
    },
    clanJoin: (p, b, t) => {
      if (p.clanId) throw new g.GameError('Сначала выйди из клана');
      const c = db.getClan(num(b.id));
      if (!c) throw new g.GameError('Нет такого клана');
      if (db.clanMembers(c.id).length >= CLAN.maxMembers) throw new g.GameError('В клане нет мест');
      p.clanId = c.id;
      syncClan(p);
      g.log(p, t, `🏴 Вступил в клан «${c.name}»`);
    },
    clanLeave: (p) => {
      const c = clanOf(p);
      const others = db.clanMembers(c.id).filter((m) => m.id !== p.id);
      if (c.owner_id === p.id) {
        if (others.length) {
          c.owner_id = others[0].id; // главным становится самый авторитетный
          db.saveClan(c);
        } else db.deleteClan(c.id);
      }
      p.clanId = null;
      syncClan(p);
    },
    clanDonate: (p, b, t) => {
      const c = clanOf(p);
      const amount = Math.floor(num(b.amount));
      if (!(amount >= 100)) throw new g.GameError('Минимум 100 ₽');
      if (p.money < amount) throw new g.GameError('Не хватает денег');
      p.money -= amount;
      c.treasury += amount;
      db.saveClan(c);
      g.log(p, t, `💰 Закинул в общак ${amount} ₽`);
    },
    clanUpgrade: (p) => {
      const c = clanOf(p);
      if (c.owner_id !== p.id) throw new g.GameError('Развивает клан только главный');
      if (c.level >= CLAN.maxLevel) throw new g.GameError('Клан уже максимального уровня');
      const cost = CLAN.upgradeCost(c.level);
      if (c.treasury < cost) throw new g.GameError(`В общаке нужно ${cost} ₽`);
      c.treasury -= cost;
      c.level += 1;
      db.saveClan(c);
      syncClan(p);
    },
    clanHutBuild: (p, b) => {
      const c = clanOf(p);
      if (c.owner_id !== p.id) throw new g.GameError('Строит только главный');
      const h = hutById.get(str(b.hut) as HutId);
      if (!h) throw new g.GameError('Нет такой постройки');
      const st = clanState(c.id);
      const lvl = st.hut[h.id] ?? 0;
      if (lvl >= HUT_RULES.maxLevel) throw new g.GameError('Выше некуда');
      const cost = HUT_RULES.cost(lvl);
      if (c.treasury < cost) throw new g.GameError(`В общаке клана нужно ${cost} ₽`);
      c.treasury -= cost;
      st.hut[h.id] = lvl + 1;
      db.saveClan(c);
      saveClanState(c.id, st);
      syncClan(p);
      return { hut: h.id, level: lvl + 1 };
    },
    clanBossHit: (p, _b, t) => {
      const c = clanOf(p);
      const st = clanBossToday(c.id, t);
      const boss = st.boss!;
      if (boss.killed) throw new g.GameError('Сегодня уже разобрались — завтра новые');
      const hit = g.clanBossHit(p, t, rng);
      const damage = Math.min(hit.damage, boss.hp);
      boss.hp -= damage;
      boss.hits[p.id] = (boss.hits[p.id] ?? 0) + damage;
      let reward: { money: number; gold: number } | null = null;
      if (boss.hp <= 0) {
        boss.killed = true;
        const total = Object.values(boss.hits).reduce((a, b2) => a + b2, 0);
        const members = Object.keys(boss.hits).length;
        for (const [pid, dmg] of Object.entries(boss.hits)) {
          const who = Number(pid) === p.id ? p : db.getPlayer(Number(pid));
          if (!who) continue;
          // своя пайка × доля урона × число бивших: поровну бившим — по 25 паек, больше бил — больше, но не выше потолка
          const r = g.ration(who) * (1 + c.level * 0.1);
          const money = Math.round(Math.min(CLAN_BOSS.rationsCap * r, CLAN_BOSS.rationsPerMember * r * members * (dmg / total)));
          who.money += money;
          who.gold += CLAN_BOSS.gold;
          g.log(who, t, `${CLAN_BOSS.emoji} Клан разобрался с беспредельщиками: +${money} ₽, +${CLAN_BOSS.gold} 🪙`);
          if (who !== p) db.savePlayer(who);
          else reward = { money, gold: CLAN_BOSS.gold };
        }
        c.treasury += Math.round(CLAN_BOSS.treasuryRations * g.ration(p) * members);
        db.saveClan(c);
        addWar(c.id, g.weekIndex(t), CLAN_WAR.points.clanBoss);
      }
      saveClanState(c.id, st);
      return { damage, crit: hit.crit, killed: boss.killed, reward };
    },
    clanWarClaim: (p, _b, t) => {
      const c = clanOf(p);
      const prev = g.weekIndex(t) - 1;
      if (p.warClaimed >= prev) throw new g.GameError('Награда за ту неделю уже получена');
      const rank = warRanking(prev).findIndex((r) => r.id === c.id);
      if (rank < 0 || rank >= CLAN_WAR.rewards.length) throw new g.GameError('Клан не вошёл в тройку');
      p.warClaimed = prev;
      const gold = CLAN_WAR.rewards[rank];
      p.gold += gold;
      // общак клана получает награду один раз — первый забравший приносит
      const paid = db.kvGet<number[]>(`clanwar:${prev}:paid`, []);
      if (!paid.includes(c.id)) {
        paid.push(c.id);
        db.kvSet(`clanwar:${prev}:paid`, paid);
        c.treasury += CLAN_WAR.treasury[rank];
        db.saveClan(c);
      }
      return { rank: rank + 1, gold };
    },
    clanKick: (p, b, t) => {
      const c = clanOf(p);
      if (c.owner_id !== p.id) throw new g.GameError('Выгнать может только главный');
      const target = db.getPlayer(num(b.id));
      if (!target || target.clanId !== c.id || target.id === p.id) throw new g.GameError('Нет такого участника');
      target.clanId = null;
      target.clanLevel = 0;
      g.log(target, t, `🏴 Тебя выгнали из клана «${c.name}»`);
      db.savePlayer(target);
    },
    job: (p, b, t) => g.doJob(p, str(b.jobId), t, rng),
    allocate: (p, b) => g.allocate(p, str(b.stat) as Stat),
    train: (p, b) => g.train(p, str(b.stat) as Stat),
    buy: (p, b) => g.buyItem(p, str(b.itemId)),
    equip: (p, b, t) => g.equip(p, str(b.itemId), t),
    unequip: (p, b, t) => g.unequip(p, str(b.slot) as Slot, t),
    sell: (p, b, t) => g.sellItem(p, str(b.itemId), t),
    tattoo: (p, b, t) => g.buyTattoo(p, str(b.tattooId), t),
    furnish: (p, b, t) => g.buyFurniture(p, str(b.furnitureId), t),
    face: (p, b) => g.setFace(p, Number(b.face)),
    boss: (p, b, t) => g.bossStart(p, str(b.bossId), t),
    daily: (p, _b, t) => g.claimDaily(p, t),
    refill: (p, _b, t) => g.refillEnergy(p, t),
    heal: (p, _b, t) => g.heal(p, t),
    bossReset: (p, b, t) => g.resetBoss(p, str(b.bossId), t),
    statReset: (p, _b, t) => g.resetStats(p, t),
    pvp: (p, _b, t) => {
      const target = db.opponents(p).find((o) => g.canBeAttacked(o, t)) ?? null;
      return g.pvpStart(p, target, t, rng);
    },
    // ход в текущем бою: удар, перк, расходник или «авто» до конца
    battle: (p, b, t) => {
      const kind = str(b.act);
      const action =
        kind === 'perk' ? { type: 'perk' as const, id: str(b.id) } : kind === 'item' ? { type: 'item' as const, id: str(b.id) } : kind === 'auto' ? { type: 'auto' as const } : { type: 'hit' as const };
      const step = g.battleStep(p, action, rng);
      if (!step.done) return { rounds: step.rounds, battle: g.battleView(p) };
      const bt = p.battle!;
      p.battle = null;
      const result = battleResult(bt.st);
      if (bt.kind === 'boss') {
        const r = g.bossFinish(p, bt.bossId!, result, t, rng);
        return { rounds: step.rounds, done: true, win: r.win, reward: r.reward, used: r.used };
      }
      const target = bt.targetId ? db.getPlayer(bt.targetId) : null;
      const r = g.pvpFinish(p, target, bt.loot, result, t, rng);
      if (target) {
        // на тебя наехали — сразу сообщение от бота (если можно писать)
        if (r.win && bot && g.canNotify(target, t)) {
          g.markNotified(target, 'attacked', t);
          notifyPlayer(target.id, `🥊 ${p.name} наехал и отжал ${r.loot} ₽. Отомстить?`);
        }
        db.savePlayer(target);
      }
      return { rounds: step.rounds, done: true, win: r.win, reward: { money: r.loot, xp: r.xp, authority: r.authority, item: r.item, levelUps: r.levelUps }, used: r.used };
    },
    worldHit: (p, _b, t) => {
      const boss = worldBoss(t);
      const hit = g.worldBossHit(p, t, rng);
      const damage = Math.min(hit.damage, boss.hp);
      db.addHit(boss.id, p.id, damage);
      const killed = boss.hp - damage <= 0;
      if (killed) {
        db.savePlayer(p); // новичок должен уже быть в базе, иначе выпадет из списка участников
        db.endWorldBoss(boss.id, t);
        rewardWorldBoss(boss.id, p, t);
        worldBoss(t); // следующий бунт
      } else {
        db.setWorldBossHp(boss.id, boss.hp - damage);
      }
      return { damage, crit: hit.crit, killed };
    },
  };

  api.post('/action/:type', (req: AuthedRequest, res) => {
    const handler = actions[req.params.type];
    if (!handler) return res.status(404).json({ error: 'Нет такого действия' });
    const t = now();
    try {
      const { p, result, rejected } = db.transaction(() => {
        const p = loadOrCreate(req.tgUser!, req.startParam ?? null, t);
        const admin = opts.adminIds.includes(p.id);
        if (req.params.type.startsWith('admin') && !admin) throw new g.GameError('Только для админа');
        if (p.banned) throw new g.GameError('Аккаунт заблокирован за накрутку. Вопросы — /paysupport в боте');
        // результат мини-игры: сервер сверяет со временем старта; подозрение сохраняем даже при отказе
        const rejected = g.runCheck(p, req.params.type, req.body ?? {}, t);
        if (rejected) {
          db.savePlayer(p);
          return { p, result: null, rejected };
        }
        if (admin && p.god.on) g.godTopUp(p, t);
        const week = g.weekIndex(t);
        const war0 = p.war.week === week ? p.war.pts : 0;
        g.requireUnlock(p, req.params.type);
        const result = handler(p, req.body ?? {}, t);
        // очки войны кланов — в недельную таблицу клана
        const war1 = p.war.week === week ? p.war.pts : 0;
        if (p.clanId && war1 > war0) addWar(p.clanId, week, war1 - war0);
        payReferral(p, t);
        if (admin && p.god.on) g.godTopUp(p, t);
        db.savePlayer(p);
        return { p, result, rejected: null };
      });
      if (rejected) return res.status(400).json({ error: rejected, player: view(p, t) });
      res.json({ ok: true, result: result ?? true, player: view(p, t) });
    } catch (e) {
      if (e instanceof g.GameError) return res.status(400).json({ error: e.message });
      throw e;
    }
  });

  // Старт мини-игры с результатом на телефоне: сервер засекает время (и для чифира — когда закипит)
  api.post('/run', (req: AuthedRequest, res) => {
    const t = now();
    try {
      const r = db.transaction(() => {
        const p = loadOrCreate(req.tgUser!, req.startParam ?? null, t);
        if (p.banned) throw new g.GameError('Аккаунт заблокирован');
        g.requireUnlock(p, str(req.body?.game));
        const r = g.runStart(p, str(req.body?.game), t, rng);
        db.savePlayer(p);
        return r;
      });
      res.json(r);
    } catch (e) {
      if (e instanceof g.GameError) return res.status(400).json({ error: e.message });
      throw e;
    }
  });

  // Подозреваемые в накрутке: список и решение админа (простить или заблокировать)
  api.post('/admin/sus', (req: AuthedRequest, res) => {
    if (!opts.adminIds.includes(req.tgUser!.id)) return res.status(403).json({ error: 'Только для админа' });
    const t = now();
    const id = Number(req.body?.id);
    const verdict = str(req.body?.act);
    if (id && ['clear', 'ban', 'unban'].includes(verdict)) {
      db.transaction(() => {
        const p = db.getPlayer(id);
        if (!p) return;
        if (verdict === 'clear') p.sus = { score: 0, at: t, log: [] };
        p.banned = verdict === 'ban';
        db.savePlayer(p);
      });
    }
    const list = db
      .suspects()
      .map((p) => ({ id: p.id, name: p.name, level: p.level, score: Math.round(g.susScore(p, t) * 10) / 10, banned: p.banned, log: p.sus.log.slice(0, 6) }))
      .filter((x) => x.banned || x.score >= ANTICHEAT.flagAt / 2)
      .sort((a, b) => Number(b.banned) - Number(a.banned) || b.score - a.score);
    res.json({ list, flagAt: ANTICHEAT.flagAt });
  });

  api.post('/admin/stats', (req: AuthedRequest, res) => {
    if (!opts.adminIds.includes(req.tgUser!.id)) return res.status(403).json({ error: 'Только для админа' });
    const t = now();
    res.json({ stats: db.analytics(t, g.dayKey), total: db.totalPlayers(), online: db.online(t - BALANCE.onlineWindowSec * 1000) });
  });

  api.post('/season', (_req, res) => {
    res.json({ top: db.seasonTop(seasonIndex(now())) });
  });

  api.post('/refs', (req: AuthedRequest, res) => {
    res.json({ refs: db.referrals(req.tgUser!.id) });
  });

  api.post('/chat', (req: AuthedRequest, res) => {
    const clanChat = req.body?.channel === 'clan';
    let channel = 'all';
    if (clanChat) {
      const p = db.getPlayer(req.tgUser!.id);
      if (!p?.clanId) return res.json({ messages: [] });
      channel = `clan:${p.clanId}`;
    }
    res.json({ messages: db.chatList(channel, CHAT.keep) });
  });

  api.post('/ring', (req: AuthedRequest, res) => {
    const t = now();
    const ring = db.transaction(() => {
      const p = db.getPlayer(req.tgUser!.id);
      const r = withRing(p, t, (x) => x);
      if (p) db.savePlayer(p);
      return r;
    });
    res.json({ ring, now: t });
  });

  api.post('/market', (_req, res) => {
    res.json({ lots: db.lots() });
  });

  api.post('/top', (_req, res) => {
    const t = now();
    res.json({
      top: db.top(50).map((r) => ({ ...r, rank: rankTitle(r.authority) })),
      online: db.online(t - BALANCE.onlineWindowSec * 1000),
      total: db.totalPlayers(),
    });
  });

  api.post('/visit', (req: AuthedRequest, res) => {
    const t = now();
    // id = 0 — обход бараков: случайный сосед (не тот, у кого только что были)
    let id = Number(req.body?.id);
    if (!id) id = db.randomNeighbour(req.tgUser!.id, Array.isArray(req.body?.skip) ? req.body.skip.map(Number) : []) ?? 0;
    const v = db.getPlayer(id);
    if (!v) return res.status(404).json({ error: 'В бараке никого' });
    const me = db.getPlayer(req.tgUser!.id);
    const c = v.clanId ? db.getClan(v.clanId) : null;
    const visit: VisitView = {
      id: v.id,
      name: v.name,
      level: v.level,
      rank: rankTitle(v.authority),
      authority: v.authority,
      wins: v.wins,
      face: v.face,
      build: v.build,
      skin: v.skin,
      furniture: cellView(v.furniture, v.cellShow),
      comfort: comfortOf(v.furniture),
      equipped: v.equipped,
      str: v.str,
      interior: v.interior,
      tattoos: v.tattoos,
      clan: c ? { id: c.id, name: c.name, tag: c.tag } : null,
      respectedToday: !!me && me.respect[v.id] === g.dayKey(t),
      giftedToday: !!me && me.respect[`g${v.id}`] === g.dayKey(t),
      online: t - v.lastSeen < BALANCE.onlineWindowSec * 1000,
    };
    res.json({ visit });
  });

  api.post('/clans', (_req, res) => {
    res.json({ clans: db.clans() });
  });

  api.post('/clan', (req: AuthedRequest, res) => {
    const c = db.getClan(Number(req.body?.id));
    if (!c) return res.status(404).json({ error: 'Нет такого клана' });
    const clan: ClanView = {
      id: c.id,
      name: c.name,
      tag: c.tag,
      level: c.level,
      treasury: c.treasury,
      ownerId: c.owner_id,
      members: db.clanMembers(c.id),
      upgradeCost: c.level < CLAN.maxLevel ? CLAN.upgradeCost(c.level) : null,
    };
    const t = now();
    const st = clanBossToday(c.id, t);
    const names = new Map(clan.members.map((m) => [m.id, m.name]));
    const week = g.weekIndex(t);
    const rankOf = (list: { id: number; pts: number }[]) =>
      list.slice(0, 10).map((r) => {
        const cc = db.getClan(r.id);
        return { id: r.id, name: cc?.name ?? '—', tag: cc?.tag ?? '', pts: r.pts };
      });
    const prev = warRanking(week - 1);
    const extra = {
      hut: st.hut,
      boss: {
        hp: st.boss!.hp,
        max: st.boss!.max,
        killed: st.boss!.killed,
        top: Object.entries(st.boss!.hits)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, dmg]) => ({ name: names.get(Number(id)) ?? '—', dmg })),
      },
      war: { ranking: rankOf(warRanking(week)), prevTop: rankOf(prev).slice(0, 3), prevRank: prev.findIndex((r) => r.id === c.id) + 1 },
    };
    res.json({ clan: { ...clan, ...extra } });
    return;
  });

  api.post('/world', (req: AuthedRequest, res) => {
    const t = now();
    const w = db.transaction(() => worldView(req.tgUser!.id, t));
    res.json({ world: w, online: db.online(t - BALANCE.onlineWindowSec * 1000) });
  });

  // Ссылка на оплату в Telegram Stars. Зачисление — только по webhook successful_payment.
  api.post('/invoice', async (req: AuthedRequest, res) => {
    if (!bot) return res.status(503).json({ error: 'Оплата не настроена' });
    const p = db.getPlayer(req.tgUser!.id);
    if (!p) return res.status(400).json({ error: 'Сначала зайди в игру' });
    try {
      const pack = g.checkPack(p, str(req.body?.packId));
      const link = await bot.call<string>('createInvoiceLink', {
        title: pack.title,
        description: pack.description,
        payload: JSON.stringify({ p: p.id, k: pack.id }),
        currency: 'XTR',
        prices: [{ label: pack.title, amount: pack.stars }],
      });
      res.json({ link });
    } catch (e) {
      if (e instanceof g.GameError) return res.status(400).json({ error: e.message });
      console.error(e);
      res.status(502).json({ error: 'Не удалось создать счёт' });
    }
  });

  app.use('/api', api);

  // --- Webhook бота ----------------------------------------------------------
  app.post('/tg/webhook', async (req, res) => {
    if (opts.webhookSecret && req.get('x-telegram-bot-api-secret-token') !== opts.webhookSecret) {
      return res.sendStatus(403);
    }
    try {
      await handleUpdate(req.body as TgUpdate);
    } catch (e) {
      console.error('webhook', e);
    }
    res.sendStatus(200);
  });

  function parsePayload(raw: string): { playerId: number; packId: string } | null {
    try {
      const { p, k } = JSON.parse(raw) as { p: number; k: string };
      return typeof p === 'number' && typeof k === 'string' ? { playerId: p, packId: k } : null;
    } catch {
      return null;
    }
  }

  /** Зачисление платежа; повторная доставка того же платежа ничего не меняет. */
  function creditPayment(chargeId: string, payload: string, currency: string, amount: number, t: number) {
    const parsed = parsePayload(payload);
    const pack = parsed && packById.get(parsed.packId);
    if (!parsed || !pack) throw new Error(`bad payload ${payload}`);
    if (currency !== 'XTR' || amount !== pack.stars) throw new Error(`amount mismatch ${amount} ${currency}`);
    return db.transaction(() => {
      if (db.hasPayment(chargeId)) return { pack, duplicate: true };
      const p = db.getPlayer(parsed.playerId);
      if (!p) throw new Error(`no player ${parsed.playerId}`);
      g.tick(p, t);
      g.applyPack(p, pack, t);
      db.addPayment(chargeId, p.id, pack.id, pack.stars, t);
      db.savePlayer(p);
      return { pack, duplicate: false };
    });
  }

  async function handleUpdate(u: TgUpdate) {
    const t = now();
    if (u.pre_checkout_query) {
      const q = u.pre_checkout_query;
      const parsed = parsePayload(q.invoice_payload);
      const p = parsed && parsed.playerId === q.from.id ? db.getPlayer(parsed.playerId) : null;
      let error: string | null = p ? null : 'Игрок не найден';
      if (p && parsed) {
        try {
          const pack = g.checkPack(p, parsed.packId);
          if (q.currency !== 'XTR' || q.total_amount !== pack.stars) error = 'Цена изменилась, открой магазин заново';
        } catch (e) {
          error = e instanceof g.GameError ? e.message : 'Ошибка';
        }
      }
      await bot?.call('answerPreCheckoutQuery', error
        ? { pre_checkout_query_id: q.id, ok: false, error_message: error }
        : { pre_checkout_query_id: q.id, ok: true });
      return;
    }

    const msg = u.message;
    if (!msg) return;
    const notifyAdmins = (text: string) =>
      Promise.all(opts.adminIds.map((id) => bot?.call('sendMessage', { chat_id: id, text }).catch(() => null)));
    if (msg.successful_payment) {
      const sp = msg.successful_payment;
      const { pack, duplicate } = creditPayment(sp.telegram_payment_charge_id, sp.invoice_payload, sp.currency, sp.total_amount, t);
      if (!duplicate) {
        await bot?.call('sendMessage', { chat_id: msg.chat.id, text: `✅ Зачислено: ${pack.title}. Возвращайся в игру!` });
        const who = msg.from ? `${msg.from.first_name ?? ''} (id ${msg.from.id}${msg.from.username ? `, @${msg.from.username}` : ''})` : '?';
        await notifyAdmins(`💰 Покупка: ${pack.title} — ${sp.total_amount} ⭐\nОт: ${who}`);
      }
      return;
    }

    const text = msg.text ?? '';
    const [cmd, ...args] = text.split(/\s+/);
    const reply = (t: string, extra: Record<string, unknown> = {}) =>
      bot?.call('sendMessage', { chat_id: msg.chat.id, text: t, ...extra });

    if (cmd === '/start') {
      // Реферальная ссылка вида t.me/<bot>?start=ref_<id>: заводим игрока сразу, чтобы не потерять пригласившего.
      if (msg.from && args[0]?.startsWith('ref_') && !db.getPlayer(msg.from.id)) {
        const from = msg.from;
        db.transaction(() => db.savePlayer(loadOrCreate(from, args[0], t)));
      }
      await reply(
        '🔒 Добро пожаловать на зону.\n\nЗарабатывай авторитет, собирай шмот, набивай наколки и вали боссов вместе с сокамерниками.',
        { reply_markup: { inline_keyboard: [[{ text: '▶️ Играть', web_app: { url: opts.webAppUrl } }]] } },
      );
    } else if (cmd === '/paysupport') {
      if (args.length && msg.from) {
        // обращение уходит админам: id, имя и текст
        await notifyAdmins(`🆘 Поддержка от ${msg.from.first_name ?? ''} (id ${msg.from.id}${msg.from.username ? `, @${msg.from.username}` : ''}):\n${args.join(' ')}`);
        await reply('Передали администрации. Ответим в течение 24 часов.');
      } else {
        await reply('Опиши проблему одной строкой после команды, например:\n/paysupport купил золото 12.10, не пришло');
      }
    } else if (cmd === '/terms') {
      await reply('Покупки — внутриигровая валюта и статусы без денежной ценности вне игры. Возврат — через /paysupport.');
    } else if (cmd === '/stats' && msg.from && opts.adminIds.includes(msg.from.id)) {
      const r = db.revenue();
      await reply(`Игроков: ${db.totalPlayers()}\nОнлайн: ${db.online(t - BALANCE.onlineWindowSec * 1000)}\nПлатежей: ${r.n}\nЗвёзд: ${r.stars} ⭐`);
    }
  }

  if (opts.staticDir) {
    app.use(express.static(opts.staticDir));
    app.get(/^\/(?!api|tg).*/, (_req, res) => res.sendFile('index.html', { root: opts.staticDir }));
  }

  return { app, handleUpdate, creditPayment, runNotifier };
}
