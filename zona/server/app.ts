import express, { type Request, type Response, type NextFunction } from 'express';
import { EVENT_TIMING, MEDIC, eventById } from '../shared/events.ts';
import { OBSHAK } from '../shared/factions.ts';
import { ANTICHEAT } from '../shared/anticheat.ts';
import { isOpen } from '../shared/unlocks.ts';
import { ERRLOG, REPORT } from '../shared/support.ts';
import { LEAGUE, leagueTier } from '../shared/league.ts';
import { LIVE, currentLive, liveById, nextAutoLive, type LiveId, type LiveRun } from '../shared/live.ts';
import crypto from 'node:crypto';
import { CHAT } from '../shared/chat.ts';
import { seasonEndsAt, seasonIndex, seasonTheme } from '../shared/season.ts';
import { CLAN_BOSS, CLAN_WAR, HUT_RULES, PARCEL, REFERRAL, RING, hutById, type HutId } from '../shared/clans.ts';
import { BEADS, BELT, CHESS, DOMINO, FISH, NARDY, SHIZO, SPEED } from '../shared/minigames2.ts';
import { ARM, BREW, CARDS, DARTS, DICE, RACE } from '../shared/minigames.ts';
import { DUO } from '../shared/events.ts';
import { TRADE } from '../shared/trade.ts';
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
  /** сколько держать общие списки (топ, кланы, онлайн) в памяти, мс; 0 — не кэшировать */
  cacheMs?: number;
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
  // Общие для всех списки считаются раз в несколько секунд, а не на каждый запрос каждого игрока
  const cacheMs = opts.cacheMs ?? 10_000;
  const memoStore = new Map<string, { at: number; v: unknown }>();
  function memo<T>(key: string, fn: () => T, ttl = cacheMs): T {
    if (ttl <= 0) return fn();
    const hit = memoStore.get(key);
    const t = Date.now();
    if (hit && t - hit.at < ttl) return hit.v as T;
    const v = fn();
    memoStore.set(key, { at: t, v });
    if (memoStore.size > 500) memoStore.clear();
    return v;
  }
  const onlineNow = (t: number) => memo('online', () => db.online(t - BALANCE.onlineWindowSec * 1000));
  // за Caddy: настоящий адрес игрока — из X-Forwarded-For (для ограничения частоты)
  app.set('trust proxy', 'loopback');
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
    liveNow(t);
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
    duoTidy(p, t);
    db.markSeen(g.dayKey(t), p.id);
    syncClan(p);
    g.ensureBoard(p, rng);
    p.lastSeen = t;
    return p;
  }

  // --- Побег вдвоём: общий забег в kv, игроки ссылаются на него
  const duoGet = (id: string | null) => (id ? db.kvGet<g.DuoRun | null>(`duo:${id}`, null) : null);
  const duoSave = (run: g.DuoRun) => db.kvSet(`duo:${run.id}`, run);
  /** Висящие ссылки на закончившиеся забеги и протухшие приглашения — убрать. */
  function duoTidy(p: g.Player, t: number) {
    if (p.duoInvite && t - p.duoInvite.at > DUO.inviteH * 3600_000) {
      const run = duoGet(p.duoInvite.run);
      const a = run ? db.getPlayer(run.a) : null;
      if (run && run.status === 'invite') {
        g.duoDecline(p, a, run);
        duoSave(run);
        if (a) db.savePlayer(a);
      } else p.duoInvite = null;
    }
    if (p.duo) {
      const run = duoGet(p.duo);
      if (!run || run.status === 'over') p.duo = null;
      else if (run.status === 'invite' && t - run.at > DUO.inviteH * 3600_000) {
        const b = db.getPlayer(run.b);
        if (b) {
          g.duoDecline(b, p, run);
          db.savePlayer(b);
        } else p.duo = null;
        duoSave(run);
      }
    }
  }
  const duoOther = (p: g.Player, run: g.DuoRun) => {
    const o = db.getPlayer(run.a === p.id ? run.b : run.a);
    if (!o) throw new g.GameError('Кент пропал');
    return o;
  };

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
    boss: { day: string; hp: number; max: number; hits: Record<string, number>; killed: boolean; feed?: { name: string; dmg: number; crit: boolean; at: number; aoe?: boolean }[]; aoe?: number[] } | null;
  }
  // --- События зоны: запущенное админом лежит в kv, остальное — по расписанию выходных
  let liveCache: { at: number; manual: LiveRun | null; skip: number } = { at: 0, manual: null, skip: 0 };
  const liveNow = (t: number): LiveRun | null => {
    if (Date.now() - liveCache.at > 5000) liveCache = { at: Date.now(), manual: db.kvGet<LiveRun | null>('live:manual', null), skip: db.kvGet<number>('live:skip', 0) };
    let cur = currentLive(t, liveCache.manual);
    // выходные по расписанию админ может отменить
    if (cur?.by === 'auto' && cur.startsAt === liveCache.skip) cur = null;
    g.live.cur = cur;
    return cur;
  };
  const liveNotice = (t: number): g.NoticeCtx['live'] => {
    const cur = liveNow(t);
    const def = cur && liveById.get(cur.id);
    return cur && def ? { startsAt: cur.startsAt, text: def.notice } : null;
  };
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
    const before = ring.cur?.id ?? 0;
    const r = fn(ring);
    db.kvSet('ring', ring);
    // собралась новая пара — бойцам, кого нет в игре, пишет бот
    if (ring.cur && ring.cur.id !== before && bot) {
      for (const f of [ring.cur.a, ring.cur.b]) {
        const who = p && f.id === p.id ? null : db.getPlayer(f.id);
        if (!who || !g.wantsNotice(who, 'ring', t)) continue;
        const rival = f.id === ring.cur.a.id ? ring.cur.b : ring.cur.a;
        g.markNotified(who, 'ring', t);
        db.savePlayer(who);
        notifyPlayer(who.id, `🥊 Твой бой на ринге через ${RING.delayMin} мин: против ${rival.name}. Зайди поддержать себя ставкой.`);
      }
    }
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
      tut: p.tut >= 0 ? { step: p.tut, n: p.tutN } : null,
      trophies: p.trophies,
      duo: (() => {
        const run = duoGet(p.duo);
        if (!run) return null;
        const meA = run.a === p.id;
        const other = meA ? run.b : run.a;
        return {
          status: run.status,
          partner: meA ? run.names[1] : run.names[0],
          partnerId: other,
          stage: run.stage,
          myMove: run.moves[p.id] !== undefined,
          theirMove: run.moves[other] !== undefined,
          log: run.log.slice(0, 6),
          inviteUntil: run.at + DUO.inviteH * 3600_000,
        };
      })(),
      duoInvite: p.duoInvite,
      wall: p.wall,
      albums: p.albums,
      attacks: p.attacks.map((a) => ({ at: a.at, by: a.by, name: a.name, won: a.won, loot: a.loot, canAvenge: g.canAvenge(a, t), avenged: a.avenged })),
      league: (() => {
        g.ensureLeague(p, t);
        const last = p.league.last;
        const claimable = !!last && last.pts > 0 && p.league.claimed < last.week && (leagueTier(last.pts).gold > 0 || db.leagueRank(last.week, last.pts) < LEAGUE.topGold.length);
        return { week: p.league.week, pts: p.league.pts, wins: p.league.wins, last, claimable, power: g.power(p, t) };
      })(),
      live: (() => {
        const cur = liveNow(t);
        const def = cur && liveById.get(cur.id);
        return cur && def ? { id: def.id, name: def.name, emoji: def.emoji, desc: def.desc, short: def.short, endsAt: cur.endsAt } : null;
      })(),
      notifyOn: p.notify.on,
      notifyOff: p.notify.off,
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
    const today = g.dayKey(t);
    // жив ли сегодня клановый босс — один раз на клан
    const bossAlive = new Map<number, boolean>();
    const clanBoss = (id: number | null) => {
      if (!id) return false;
      if (!bossAlive.has(id)) {
        const b = clanState(id).boss;
        bossAlive.set(id, !(b && b.day === today && b.killed));
      }
      return bossAlive.get(id)!;
    };
    const live = liveNotice(t);
    for (const p of db.recentPlayers(t - NOTIFY.activeWithinDays * 24 * 3600_000)) {
      g.tick(p, t);
      const n = g.pendingNotice(p, t, { clanBoss: isOpen('clans', p.level) && clanBoss(p.clanId), live });
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
    res.json({ player: view(p, t), online: onlineNow(t), botUsername: opts.botUsername ?? '' });
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
    tutSkip: (p) => g.tutSkip(p),
    notifyKind: (p, b) => g.setNotifyKind(p, str(b.kind), !!b.on),
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
      const before = boss.hp;
      boss.hp -= damage;
      boss.hits[p.id] = (boss.hits[p.id] ?? 0) + damage;
      boss.feed = [{ name: p.name, dmg: damage, crit: hit.crit, at: t }, ...(boss.feed ?? [])].slice(0, CLAN_BOSS.feedKeep);
      // перешли порог — беспредельщики отвечают по всем, кто сегодня бил
      boss.aoe ??= [];
      let aoe = false;
      for (const th of CLAN_BOSS.aoeAt) {
        if (boss.hp > 0 && before > boss.max * th && boss.hp <= boss.max * th && !boss.aoe.includes(th)) {
          boss.aoe.push(th);
          aoe = true;
          for (const pid of Object.keys(boss.hits)) {
            const who = Number(pid) === p.id ? p : db.getPlayer(Number(pid));
            if (!who) continue;
            g.tick(who, t);
            const max = g.stats(who, t).maxHp;
            who.hp = Math.max(1, who.hp - Math.round(max * CLAN_BOSS.aoeShare));
            who.hpAt = t;
            g.log(who, t, `${CLAN_BOSS.emoji} Беспредельщики ответили всей толпой: −${Math.round(CLAN_BOSS.aoeShare * 100)}% здоровья`);
            if (who !== p) db.savePlayer(who);
          }
          boss.feed.unshift({ name: 'Беспредельщики', dmg: Math.round(CLAN_BOSS.aoeShare * 100), crit: false, at: t, aoe: true });
        }
      }
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
      return { damage, crit: hit.crit, killed: boss.killed, reward, aoe };
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
      // соперник по силе, не тот, кого сегодня уже дважды били
      const target = g.pickOpponent(p, db.opponents(p), t, rng);
      return g.pvpStart(p, target, t, rng);
    },
    revenge: (p, b, t) => {
      const at = num(b.at);
      const rec = p.attacks.find((a) => a.at === at);
      return g.revengeStart(p, at, rec ? db.getPlayer(rec.by) : null, t, rng);
    },
    duoInvite: (p, b, t) => {
      const target = db.getPlayer(num(b.id));
      if (!target) throw new g.GameError('Нет такого игрока');
      duoTidy(target, t);
      const run = g.duoNew(p, target, t);
      g.duoInvite(p, target, run, t);
      duoSave(run);
      db.savePlayer(target);
      notifyPlayer(target.id, `🤝 ${p.name} зовёт тебя в побег вдвоём. Приглашение — час.`);
      return { run: run.id };
    },
    duoAccept: (p, _b, t) => {
      const run = duoGet(p.duoInvite?.run ?? null);
      if (!run) throw new g.GameError('Приглашение уже не действует');
      g.duoAccept(p, run, t);
      duoSave(run);
      notifyPlayer(run.a, `🤝 ${p.name} согласился бежать. Первый этап — твой ход!`);
    },
    duoDecline: (p) => {
      const run = duoGet(p.duoInvite?.run ?? null);
      if (!run) {
        p.duoInvite = null;
        return;
      }
      const a = db.getPlayer(run.a);
      g.duoDecline(p, a, run);
      duoSave(run);
      if (a) db.savePlayer(a);
    },
    duoStep: (p, b, t) => {
      const run = duoGet(p.duo);
      if (!run) throw new g.GameError('Забега нет');
      const other = duoOther(p, run);
      const r = g.duoStep(p, other, run, num(b.quality), t, rng);
      duoSave(run);
      db.savePlayer(other);
      notifyPlayer(other.id, !r.resolved ? `🏃 ${p.name} прошёл свою часть этапа — твой ход в побеге!` : 'caught' in r && r.caught ? `🚨 Побег вдвоём кончился: ${run.log[0]}` : `🏃 ${run.log[1] ?? ''} Твой ход: ${run.log[0]}`);
      return r;
    },
    duoBail: (p, _b, t) => {
      const run = duoGet(p.duo);
      if (!run) throw new g.GameError('Забега нет');
      const other = duoOther(p, run);
      run.log.unshift(`🤫 ${p.name} дал отбой — вернулись тихо`);
      const r = g.duoFinish(p, other, run, false, t, rng);
      duoSave(run);
      db.savePlayer(other);
      notifyPlayer(other.id, `🤫 ${p.name} дал отбой — побег окончен, вернулись тихо`);
      return r;
    },
    tradeOffer: (p, b, t) => {
      const to = db.getPlayer(num(b.to));
      if (!to) throw new g.GameError('Нет такого игрока');
      const give = g.tradeLines(b.give);
      const want = g.tradeLines(b.want);
      g.tradeOffer(p, to, give, want, db.tradesOpenFrom(p.id), t);
      const id = db.tradeAdd({ from_id: p.id, from_name: p.name, to_id: to.id, to_name: to.name, give: JSON.stringify(give), want: JSON.stringify(want), created_at: t });
      notifyPlayer(to.id, `🔄 ${p.name} предлагает обмен. Ответь в течение суток.`);
      return { id };
    },
    tradeAccept: (p, b, t) => {
      const tr = db.tradeGet(num(b.id));
      if (!tr || tr.to_id !== p.id || tr.status !== 'open') throw new g.GameError('Обмен уже не действует');
      const from = db.getPlayer(tr.from_id);
      g.tradeAccept(p, from, JSON.parse(tr.give), JSON.parse(tr.want), t);
      db.tradeSet(tr.id, 'done');
      if (from) db.savePlayer(from);
      notifyPlayer(tr.from_id, `🔄 ${p.name} принял твой обмен`);
    },
    tradeDecline: (p, b) => {
      const tr = db.tradeGet(num(b.id));
      if (!tr || tr.status !== 'open' || (tr.to_id !== p.id && tr.from_id !== p.id)) throw new g.GameError('Обмен уже не действует');
      const from = tr.from_id === p.id ? p : db.getPlayer(tr.from_id);
      if (from) g.tradeRefund(from, JSON.parse(tr.give));
      db.tradeSet(tr.id, tr.from_id === p.id ? 'cancelled' : 'declined');
      if (from && from !== p) db.savePlayer(from);
    },
    albumClaim: (p, b, t) => g.albumClaim(p, str(b.id), t),
    wall: (p, b) => g.wallToggle(p, str(b.id)),
    leagueClaim: (p, _b, t) => {
      g.ensureLeague(p, t);
      const last = p.league.last;
      if (!last) throw new g.GameError('За прошлую неделю наездов не было');
      return g.leagueClaim(p, { week: last.week, pts: last.pts, rank: last.pts > 0 ? db.leagueRank(last.week, last.pts) : null }, t);
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
      const r = g.pvpFinish(p, target, bt.loot, result, t, rng, bt.ratio ?? null, bt.revenge ?? null);
      if (target) {
        // на тебя наехали — сразу сообщение от бота (если можно писать)
        if (r.win && bot && g.wantsNotice(target, 'attacked', t)) {
          g.markNotified(target, 'attacked', t);
          notifyPlayer(target.id, r.revenge ? `😤 ${p.name} отомстил тебе и забрал ${r.loot} ₽` : `🥊 ${p.name} наехал и отжал ${r.loot} ₽. Отомстить можно сутки — двойные очки лиги.`);
        }
        db.savePlayer(target);
      }
      return { rounds: step.rounds, done: true, win: r.win, reward: { money: r.loot, xp: r.xp, authority: r.authority, item: r.item, levelUps: r.levelUps, league: r.league, revenge: r.revenge }, used: r.used };
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
        g.tutAdvance(p, req.params.type, t);
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

  // Жалоба игрока: текст, тема и снимок состояния — уходит админам в бота и в админку
  api.post('/report', (req: AuthedRequest, res) => {
    const t = now();
    const topic = REPORT.topics.find((x) => x.id === str(req.body?.topic));
    const text = str(req.body?.text).trim().slice(0, REPORT.maxText);
    if (!topic) return res.status(400).json({ error: 'Выбери, о чём жалоба' });
    if (text.length < REPORT.minText) return res.status(400).json({ error: 'Напиши пару слов, что случилось' });
    const p = db.getPlayer(req.tgUser!.id);
    if (!p) return res.status(400).json({ error: 'Сначала зайди в игру' });
    if (db.reportsSince(p.id, t - 24 * 3600_000) >= REPORT.perDay) return res.status(429).json({ error: 'Хватит на сегодня — мы уже читаем' });
    const raw = JSON.stringify(req.body?.ctx ?? {});
    const client = raw.length <= REPORT.maxCtx ? (req.body?.ctx ?? {}) : { cut: raw.slice(0, REPORT.maxCtx) };
    const snap = {
      level: p.level, money: p.money, gold: p.gold, butts: p.butts, hp: p.hp, energy: p.energy,
      battle: p.battle ? p.battle.kind : null, event: p.event?.id ?? null, debt: p.debt, story: p.story,
      clan: p.clanId, stars: p.starsSpent, journal: p.journal.slice(0, 6).map((j) => j.text),
    };
    const id = db.reportAdd({ pid: p.id, name: p.name, topic: topic.id, text, ctx: JSON.stringify({ client, snap }), at: t });
    for (const a of opts.adminIds) bot?.call('sendMessage', { chat_id: a, text: `🆘 Жалоба #${id} · ${topic.icon} ${topic.label}\nОт: ${p.name} (id ${p.id}, ур. ${p.level})\n\n${text}` }).catch(() => null);
    res.json({ id });
  });

  // Жалобы и ошибки для админа: прочитать, закрыть, ответить игроку через бота
  api.post('/admin/reports', async (req: AuthedRequest, res) => {
    if (!opts.adminIds.includes(req.tgUser!.id)) return res.status(403).json({ error: 'Только для админа' });
    const b = req.body ?? {};
    if (b.done) db.reportDone(Number(b.done));
    if (b.reply && typeof b.reply.text === 'string' && b.reply.text.trim()) {
      const r = db.reportGet(Number(b.reply.id));
      if (r) {
        await notifyPlayer(r.pid, `💬 Ответ администрации на твою жалобу:\n\n${b.reply.text.trim().slice(0, 1000)}`);
        db.reportDone(r.id);
      }
    }
    if (b.errDel) db.errorDel(b.errDel === 'all' ? null : str(b.errDel));
    res.json({
      reports: db.reports().map((r) => ({ ...r, ctx: JSON.parse(r.ctx) })),
      errors: db.errors(),
    });
  });

  // События зоны: что идёт, что дальше по расписанию, запустить или остановить
  api.post('/admin/live', (req: AuthedRequest, res) => {
    if (!opts.adminIds.includes(req.tgUser!.id)) return res.status(403).json({ error: 'Только для админа' });
    const t = now();
    const b = req.body ?? {};
    if (b.stop) {
      liveCache.at = 0;
      const cur = liveNow(t);
      if (cur?.by === 'admin') db.kvSet('live:manual', null);
      else if (cur?.by === 'auto') db.kvSet('live:skip', cur.startsAt);
    } else if (b.start && liveById.has(b.start)) {
      const hours = Math.max(1, Math.min(72, Number(b.hours) || 3));
      db.kvSet('live:manual', { id: b.start as LiveId, startsAt: t, endsAt: t + hours * 3600_000, by: 'admin' } satisfies LiveRun);
    }
    liveCache.at = 0;
    const cur = liveNow(t);
    res.json({ cur, next: nextAutoLive(t), list: LIVE.map((l) => ({ id: l.id, name: l.name, emoji: l.emoji, short: l.short, desc: l.desc })) });
  });

  api.post('/admin/stats', (req: AuthedRequest, res) => {
    if (!opts.adminIds.includes(req.tgUser!.id)) return res.status(403).json({ error: 'Только для админа' });
    const t = now();
    res.json({ stats: db.analytics(t, g.dayKey), total: db.totalPlayers(), online: onlineNow(t) });
  });

  api.post('/season', (_req, res) => {
    const season = seasonIndex(now());
    res.json({ top: memo(`season:${season}`, () => db.seasonTop(season)) });
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

  // Обмены: входящие и свои; протухшие — назад отправителю
  api.post('/trades', (req: AuthedRequest, res) => {
    const t = now();
    const list = db.transaction(() => {
      for (const tr of db.tradesStale(t - TRADE.ttlH * 3600_000)) {
        const from = db.getPlayer(tr.from_id);
        if (from) {
          g.tradeRefund(from, JSON.parse(tr.give));
          db.savePlayer(from);
        }
        db.tradeSet(tr.id, 'expired');
      }
      return db.tradesOf(req.tgUser!.id, t - 3 * 24 * 3600_000);
    });
    res.json({ trades: list.map((x) => ({ ...x, give: JSON.parse(x.give), want: JSON.parse(x.want) })), ttlMs: TRADE.ttlH * 3600_000 });
  });

  // Повтор наезда на меня: кто, как и чем кончилось
  api.post('/attack', (req: AuthedRequest, res) => {
    const p = db.getPlayer(req.tgUser!.id);
    const a = p?.attacks.find((x) => x.at === Number(req.body?.at));
    if (!p || !a) return res.status(404).json({ error: 'Нет такого наезда' });
    res.json({ attack: { name: a.name, look: a.look, won: a.won, loot: a.loot, replay: { ...a.replay, win: !a.won, log: [] } }, me: { name: p.name, look: g.lookOf(p) } });
  });

  // Таблица лиги за неделю и итоги прошлой
  api.post('/league', (req: AuthedRequest, res) => {
    const t = now();
    const week = g.weekIndex(t);
    const me = db.getPlayer(req.tgUser!.id);
    const pts = me && me.league.week === week ? me.league.pts : 0;
    res.json({
      top: memo(`league:${week}`, () => db.leagueTop(week, LEAGUE.tableSize), Math.min(cacheMs, 5000)),
      prev: memo(`league:${week - 1}:top3`, () => db.leagueTop(week - 1, 3), cacheMs * 6),
      myRank: pts > 0 ? db.leagueRank(week, pts) + 1 : null,
      endsAt: g.weekEndsAt(t),
    });
  });

  api.post('/market', (_req, res) => {
    res.json({ lots: db.lots() });
  });

  api.post('/top', (_req, res) => {
    const t = now();
    res.json({
      top: memo('top', () => db.top(50).map((r) => ({ ...r, rank: rankTitle(r.authority) }))),
      online: onlineNow(t),
      total: memo('total', () => db.totalPlayers()),
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
      wall: v.wall,
      clan: c ? { id: c.id, name: c.name, tag: c.tag } : null,
      respectedToday: !!me && me.respect[v.id] === g.dayKey(t),
      giftedToday: !!me && me.respect[`g${v.id}`] === g.dayKey(t),
      online: t - v.lastSeen < BALANCE.onlineWindowSec * 1000,
    };
    res.json({ visit });
  });

  api.post('/clans', (_req, res) => {
    res.json({ clans: memo('clans', () => db.clans()) });
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
        feed: st.boss!.feed ?? [],
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

  // Клановый босс вживую: опрашивается раз в несколько секунд, пока экран открыт
  api.post('/clanBoss', (req: AuthedRequest, res) => {
    const p = db.getPlayer(req.tgUser!.id);
    if (!p?.clanId) return res.status(404).json({ error: 'Ты не в клане' });
    const st = clanState(p.clanId);
    const b = st.boss && st.boss.day === g.dayKey(now()) ? st.boss : null;
    if (!b) return res.json({ boss: null });
    const names = new Map(db.clanMembers(p.clanId).map((m) => [String(m.id), m.name]));
    res.json({
      boss: {
        hp: b.hp,
        max: b.max,
        killed: b.killed,
        feed: b.feed ?? [],
        top: Object.entries(b.hits)
          .sort((x, y) => y[1] - x[1])
          .slice(0, 5)
          .map(([id, dmg]) => ({ name: names.get(id) ?? '—', dmg })),
      },
    });
  });

  api.post('/world', (req: AuthedRequest, res) => {
    const t = now();
    const w = db.transaction(() => worldView(req.tgUser!.id, t));
    res.json({ world: w, online: onlineNow(t) });
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

  // --- Ошибки из браузера --------------------------------------------------------
  // Без обязательной авторизации: ошибка могла случиться до входа. Ограничение — по адресу.
  const errBuckets = new Map<string, { n: number; at: number }>();
  app.post('/log', (req, res) => {
    const t = Date.now();
    const ip = req.ip ?? '';
    const bucket = errBuckets.get(ip);
    if (bucket && t - bucket.at < 60_000 && bucket.n >= ERRLOG.perMinute) return res.sendStatus(429);
    errBuckets.set(ip, bucket && t - bucket.at < 60_000 ? { n: bucket.n + 1, at: bucket.at } : { n: 1, at: t });
    if (errBuckets.size > 10_000) errBuckets.clear();
    const msg = str(req.body?.msg).slice(0, ERRLOG.maxMsg);
    if (!msg) return res.sendStatus(400);
    const stack = str(req.body?.stack).slice(0, ERRLOG.maxStack);
    const header = req.get('authorization') ?? '';
    const user = header.startsWith('tma ') ? validateInitData(header.slice(4), opts.botToken)?.user : null;
    // одна и та же ошибка — одна строка: склеиваем по тексту и началу стека без номеров колонок
    const sig = msg + stack.split('\n').slice(0, 3).join('\n').replace(/:\d+:\d+/g, '');
    const hash = crypto.createHash('sha1').update(sig).digest('hex').slice(0, 16);
    db.errorAdd(hash, msg, stack, str(req.body?.ua).slice(0, 200) || (req.get('user-agent') ?? '').slice(0, 200), user?.id ?? null, now());
    res.sendStatus(204);
  });

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
      await reply(`Игроков: ${db.totalPlayers()}\nОнлайн: ${onlineNow(t)}\nПлатежей: ${r.n}\nЗвёзд: ${r.stars} ⭐`);
    }
  }

  if (opts.staticDir) {
    app.use(express.static(opts.staticDir));
    app.get(/^\/(?!api|tg).*/, (_req, res) => res.sendFile('index.html', { root: opts.staticDir }));
  }

  return { app, handleUpdate, creditPayment, runNotifier };
}
