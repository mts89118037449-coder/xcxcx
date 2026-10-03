// Хранилище на встроенном SQLite (node:sqlite, Node >= 22.13).
// Игрок хранится JSON-документом, а поля для рейтингов и поиска соперников
// продублированы в колонки с индексами.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { migrate, type Player } from './game.ts';

export type Db = ReturnType<typeof openDb>;

export interface ClanRow {
  id: number;
  name: string;
  tag: string;
  owner_id: number;
  treasury: number;
  level: number;
}

export interface Lot {
  id: number;
  seller_id: number;
  seller_name: string;
  kind: 'item' | 'mat' | 'gear';
  ref: string;
  qty: number;
  price: number;
  created_at: number;
}

export interface Report {
  id: number;
  pid: number;
  name: string;
  topic: string;
  text: string;
  ctx: string;
  at: number;
  done: number;
}

export interface ClientError {
  hash: string;
  msg: string;
  stack: string;
  ua: string;
  pid: number | null;
  n: number;
  first: number;
  last: number;
}

export interface WorldBossRow {
  id: number;
  gen: number;
  hp: number;
  max_hp: number;
  started_at: number;
}

const LEAGUE_PTS = `(CASE WHEN json_extract(data, '$.league.week') = :w THEN json_extract(data, '$.league.pts')
  WHEN json_extract(data, '$.league.last.week') = :w THEN json_extract(data, '$.league.last.pts') ELSE 0 END)`;

export function openDb(file: string) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    -- с WAL так же надёжно при сбое процесса, но запись в разы быстрее
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -32000;
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL,
      authority INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS players_level ON players(level);
    CREATE INDEX IF NOT EXISTS players_authority ON players(authority DESC);
    CREATE INDEX IF NOT EXISTS players_seen ON players(last_seen);

    CREATE TABLE IF NOT EXISTS clans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      tag TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      treasury INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      charge_id TEXT PRIMARY KEY,
      player_id INTEGER NOT NULL,
      pack_id TEXT NOT NULL,
      stars INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      refunded INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS world_boss (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gen INTEGER NOT NULL,
      hp INTEGER NOT NULL,
      max_hp INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS world_boss_hits (
      boss_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      damage INTEGER NOT NULL,
      PRIMARY KEY (boss_id, player_id)
    );
    -- барахолка: лоты игроков
    CREATE TABLE IF NOT EXISTS market (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL,
      seller_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    -- чат барака: только готовые фразы
    CREATE TABLE IF NOT EXISTS chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      pid INTEGER NOT NULL,
      name TEXT NOT NULL,
      face INTEGER,
      phrase TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_channel ON chat(channel, id);
    -- кто заходил в какой день (по Москве): удержание и активные за день
    CREATE TABLE IF NOT EXISTS activity (
      day TEXT NOT NULL,
      pid INTEGER NOT NULL,
      PRIMARY KEY (day, pid)
    );
    -- жалобы игроков: текст, тема и снимок состояния
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid INTEGER NOT NULL,
      name TEXT NOT NULL,
      topic TEXT NOT NULL,
      text TEXT NOT NULL,
      ctx TEXT NOT NULL,
      at INTEGER NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS reports_pid ON reports(pid, at);
    -- ошибки в браузере игроков: одинаковые склеиваются в одну строку со счётчиком
    CREATE TABLE IF NOT EXISTS client_errors (
      hash TEXT PRIMARY KEY,
      msg TEXT NOT NULL,
      stack TEXT NOT NULL,
      ua TEXT NOT NULL,
      pid INTEGER,
      n INTEGER NOT NULL,
      first INTEGER NOT NULL,
      last INTEGER NOT NULL
    );
    -- общее состояние зоны: общак и прочее, JSON по ключу
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Рамка и титул в чате появились позже
  const chatCols = db.prepare('PRAGMA table_info(chat)').all() as { name: string }[];
  if (!chatCols.some((c) => c.name === 'frame')) db.exec('ALTER TABLE chat ADD COLUMN frame TEXT; ALTER TABLE chat ADD COLUMN title TEXT');
  // Колонка клана появилась позже — добавляем в старые базы.
  const cols = db.prepare('PRAGMA table_info(players)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'clan_id')) db.exec('ALTER TABLE players ADD COLUMN clan_id INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS players_clan ON players(clan_id)');
  // индексы по полям внутри JSON игрока: кого подтянул, сезон, подозрения
  db.exec(`
    CREATE INDEX IF NOT EXISTS players_ref ON players(json_extract(data, '$.refBy'));
    CREATE INDEX IF NOT EXISTS players_season ON players(json_extract(data, '$.season.id'), json_extract(data, '$.season.pts'));
    CREATE INDEX IF NOT EXISTS players_league ON players(json_extract(data, '$.league.week'));
    CREATE INDEX IF NOT EXISTS players_league_last ON players(json_extract(data, '$.league.last.week'));
    CREATE INDEX IF NOT EXISTS players_sus ON players(json_extract(data, '$.sus.score'));
    CREATE INDEX IF NOT EXISTS reports_done ON reports(done, id);
    CREATE INDEX IF NOT EXISTS client_errors_last ON client_errors(last);
  `);

  const seenCache = new Set<string>();
  const q = {
    lotAdd: db.prepare('INSERT INTO market (seller_id, seller_name, kind, ref, qty, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    lotGet: db.prepare('SELECT * FROM market WHERE id = ?'),
    lotDel: db.prepare('DELETE FROM market WHERE id = ?'),
    lots: db.prepare('SELECT * FROM market ORDER BY id DESC LIMIT 80'),
    lotsBy: db.prepare('SELECT COUNT(*) AS n FROM market WHERE seller_id = ?'),
    refs: db.prepare("SELECT id, name, level FROM players WHERE json_extract(data, '$.refBy') = ? ORDER BY level DESC LIMIT 50"),
    chatAdd: db.prepare('INSERT INTO chat (channel, pid, name, face, phrase, at, frame, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    chatList: db.prepare('SELECT id, pid, name, face, phrase, at, frame, title FROM chat WHERE channel = ? ORDER BY id DESC LIMIT ?'),
    seasonTop: db.prepare(
      "SELECT id, name, json_extract(data, '$.face') AS face, json_extract(data, '$.frame') AS frame, json_extract(data, '$.season.pts') AS pts FROM players WHERE json_extract(data, '$.season.id') = ? AND json_extract(data, '$.season.pts') > 0 ORDER BY pts DESC LIMIT 20",
    ),
    chatTrim: db.prepare('DELETE FROM chat WHERE channel = ? AND id < ?'),
    seen: db.prepare('INSERT OR IGNORE INTO activity (day, pid) VALUES (?, ?)'),
    dau: db.prepare('SELECT day, COUNT(*) AS n FROM activity WHERE day >= ? GROUP BY day'),
    newByDay: db.prepare(
      "SELECT date(json_extract(data, '$.createdAt') / 1000 + 10800, 'unixepoch') AS day, COUNT(*) AS n FROM players WHERE json_extract(data, '$.createdAt') >= ? GROUP BY day",
    ),
    cohort: db.prepare(
      `SELECT COUNT(*) AS n FROM players p JOIN activity a ON a.pid = p.id
       WHERE date(json_extract(p.data, '$.createdAt') / 1000 + 10800, 'unixepoch') = ? AND a.day = ?`,
    ),
    churnByLevel: db.prepare('SELECT level, COUNT(*) AS n FROM players WHERE last_seen < ? AND json_extract(data, \'$.createdAt\') >= ? GROUP BY level ORDER BY level'),
    introStuck: db.prepare("SELECT COUNT(*) AS n FROM players WHERE json_extract(data, '$.intro') >= 0"),
    chapters: db.prepare("SELECT json_extract(data, '$.story.ch') AS ch, COUNT(*) AS n FROM players GROUP BY ch ORDER BY ch"),
    masts: db.prepare("SELECT COALESCE(json_extract(data, '$.mast'), '—') AS mast, COUNT(*) AS n FROM players GROUP BY mast"),
    levels: db.prepare('SELECT level, COUNT(*) AS n FROM players GROUP BY level ORDER BY level'),
    payByPack: db.prepare('SELECT pack_id AS pack, COUNT(*) AS n, SUM(stars) AS stars FROM payments WHERE refunded = 0 GROUP BY pack_id ORDER BY stars DESC'),
    paySince: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(stars), 0) AS stars, COUNT(DISTINCT player_id) AS payers FROM payments WHERE refunded = 0 AND created_at >= ?'),
    suspects: db.prepare("SELECT data FROM players WHERE json_extract(data, '$.sus.score') >= 1 OR json_extract(data, '$.banned') = 1 ORDER BY json_extract(data, '$.sus.score') DESC LIMIT 60"),
    reportAdd: db.prepare('INSERT INTO reports (pid, name, topic, text, ctx, at) VALUES (?, ?, ?, ?, ?, ?)'),
    reportsSince: db.prepare('SELECT COUNT(*) AS n FROM reports WHERE pid = ? AND at >= ?'),
    reports: db.prepare('SELECT id, pid, name, topic, text, ctx, at, done FROM reports ORDER BY done, id DESC LIMIT 60'),
    reportGet: db.prepare('SELECT id, pid, name, topic, text, ctx, at, done FROM reports WHERE id = ?'),
    reportDone: db.prepare('UPDATE reports SET done = 1 WHERE id = ?'),
    errAdd: db.prepare(`INSERT INTO client_errors (hash, msg, stack, ua, pid, n, first, last) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(hash) DO UPDATE SET n = n + 1, last = excluded.last, pid = COALESCE(excluded.pid, pid), ua = excluded.ua`),
    errs: db.prepare('SELECT hash, msg, stack, ua, pid, n, first, last FROM client_errors ORDER BY last DESC LIMIT 40'),
    errCount: db.prepare('SELECT COUNT(*) AS n FROM client_errors'),
    errDel: db.prepare('DELETE FROM client_errors WHERE hash = ?'),
    errClear: db.prepare('DELETE FROM client_errors'),
    errTrim: db.prepare('DELETE FROM client_errors WHERE hash IN (SELECT hash FROM client_errors ORDER BY last LIMIT 100)'),
    // очки лиги за неделю: у кого неделя ещё текущая — из pts, у кого уже перевалила — из last
    leagueTop: db.prepare(`SELECT id, name, level, json_extract(data, '$.face') AS face, json_extract(data, '$.frame') AS frame, json_extract(data, '$.title') AS title, ${LEAGUE_PTS} AS pts
      FROM players WHERE (json_extract(data, '$.league.week') = :w OR json_extract(data, '$.league.last.week') = :w) AND ${LEAGUE_PTS} > 0
      ORDER BY pts DESC, level DESC LIMIT ?`),
    leagueRank: db.prepare(`SELECT COUNT(*) AS n FROM players WHERE (json_extract(data, '$.league.week') = :w OR json_extract(data, '$.league.last.week') = :w) AND ${LEAGUE_PTS} > ?`),
    kvGet: db.prepare('SELECT value FROM kv WHERE key = ?'),
    kvSet: db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    get: db.prepare('SELECT data FROM players WHERE id = ?'),
    save: db.prepare(`
      INSERT INTO players (id, data, name, level, authority, last_seen, clan_id) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, name = excluded.name,
        level = excluded.level, authority = excluded.authority, last_seen = excluded.last_seen, clan_id = excluded.clan_id`),
    clanGet: db.prepare('SELECT id, name, tag, owner_id, treasury, level FROM clans WHERE id = ?'),
    clanByName: db.prepare('SELECT id FROM clans WHERE name = ?'),
    clanAdd: db.prepare('INSERT INTO clans (name, tag, owner_id, created_at) VALUES (?, ?, ?, ?)'),
    clanSave: db.prepare('UPDATE clans SET owner_id = ?, treasury = ?, level = ? WHERE id = ?'),
    clanDel: db.prepare('DELETE FROM clans WHERE id = ?'),
    clanList: db.prepare(`
      SELECT c.id, c.name, c.tag, c.level, COUNT(p.id) AS members, COALESCE(SUM(p.authority), 0) AS authority
      FROM clans c LEFT JOIN players p ON p.clan_id = c.id
      GROUP BY c.id ORDER BY authority DESC LIMIT 50`),
    clanMembers: db.prepare(`
      SELECT id, name, level, authority, json_extract(data, '$.face') AS face
      FROM players WHERE clan_id = ? ORDER BY authority DESC`),
    opponents: db.prepare(`
      SELECT data FROM players
      WHERE id != ? AND level BETWEEN ? AND ?
      ORDER BY RANDOM() LIMIT 40`),
    top: db.prepare("SELECT p.id, p.name, p.level, p.authority, json_extract(p.data, '$.face') AS face, c.tag AS tag FROM players p LEFT JOIN clans c ON c.id = p.clan_id ORDER BY p.authority DESC, p.level DESC LIMIT ?"),
    recent: db.prepare('SELECT data FROM players WHERE last_seen > ?'),
    randomIds: db.prepare('SELECT id FROM players WHERE id != ? ORDER BY last_seen DESC LIMIT 60'),
    rank: db.prepare('SELECT COUNT(*) + 1 AS r FROM players WHERE authority > ?'),
    online: db.prepare('SELECT COUNT(*) AS n FROM players WHERE last_seen > ?'),
    total: db.prepare('SELECT COUNT(*) AS n FROM players'),
    payment: db.prepare('SELECT charge_id FROM payments WHERE charge_id = ?'),
    addPayment: db.prepare(
      'INSERT INTO payments (charge_id, player_id, pack_id, stars, created_at) VALUES (?, ?, ?, ?, ?)',
    ),
    revenue: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(stars), 0) AS stars FROM payments WHERE refunded = 0'),
    boss: db.prepare('SELECT id, gen, hp, max_hp, started_at FROM world_boss WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1'),
    lastGen: db.prepare('SELECT COALESCE(MAX(gen), 0) AS g FROM world_boss'),
    spawn: db.prepare('INSERT INTO world_boss (gen, hp, max_hp, started_at) VALUES (?, ?, ?, ?)'),
    bossHp: db.prepare('UPDATE world_boss SET hp = ? WHERE id = ?'),
    bossEnd: db.prepare('UPDATE world_boss SET hp = 0, ended_at = ? WHERE id = ?'),
    hit: db.prepare(`
      INSERT INTO world_boss_hits (boss_id, player_id, damage) VALUES (?, ?, ?)
      ON CONFLICT(boss_id, player_id) DO UPDATE SET damage = damage + excluded.damage`),
    hits: db.prepare(`
      SELECT h.player_id AS id, p.name AS name, h.damage AS damage
      FROM world_boss_hits h JOIN players p ON p.id = h.player_id
      WHERE h.boss_id = ? ORDER BY h.damage DESC`),
    myHit: db.prepare('SELECT damage FROM world_boss_hits WHERE boss_id = ? AND player_id = ?'),
  };

  return {
    raw: db,
    transaction<T>(fn: () => T): T {
      db.exec('BEGIN IMMEDIATE');
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    lotAdd(l: Omit<Lot, 'id'>): number {
      return Number(q.lotAdd.run(l.seller_id, l.seller_name, l.kind, l.ref, l.qty, l.price, l.created_at).lastInsertRowid);
    },
    lotGet(id: number): Lot | null {
      return (q.lotGet.get(id) as Lot | undefined) ?? null;
    },
    lotDel(id: number) {
      q.lotDel.run(id);
    },
    lots(): Lot[] {
      return q.lots.all() as unknown as Lot[];
    },
    lotsBy(sellerId: number): number {
      return (q.lotsBy.get(sellerId) as { n: number }).n;
    },
    chatAdd(channel: string, pid: number, name: string, face: number | null, phrase: string, at: number, frame: string | null = null, title: string | null = null) {
      const id = Number(q.chatAdd.run(channel, pid, name, face, phrase, at, frame, title).lastInsertRowid);
      // храним только хвост: старое чистим
      if (id % 50 === 0) q.chatTrim.run(channel, id - 500);
      return id;
    },
    referrals(id: number) {
      return q.refs.all(id) as { id: number; name: string; level: number }[];
    },
    chatList(channel: string, limit: number) {
      return (q.chatList.all(channel, limit) as { id: number; pid: number; name: string; face: number | null; phrase: string; at: number; frame: string | null; title: string | null }[]).reverse();
    },
    seasonTop(season: number) {
      return q.seasonTop.all(season) as { id: number; name: string; face: number | null; frame: string | null; pts: number }[];
    },
    /** Отметить, что игрок заходил сегодня (повторы — бесплатно). */
    markSeen(day: string, pid: number) {
      const k = `${day}:${pid}`;
      if (seenCache.has(k)) return;
      if (seenCache.size > 50_000) seenCache.clear();
      seenCache.add(k);
      q.seen.run(day, pid);
    },
    /** Сводка для админа: активные, новые, удержание, где бросают, платежи. */
    analytics(now: number, dayKey: (t: number) => string) {
      const DAY = 86_400_000;
      const days = Array.from({ length: 14 }, (_, i) => dayKey(now - (13 - i) * DAY));
      const dau = new Map((q.dau.all(days[0]) as { day: string; n: number }[]).map((r) => [r.day, r.n]));
      const fresh = new Map((q.newByDay.all(now - 15 * DAY) as { day: string; n: number }[]).map((r) => [r.day, r.n]));
      const ret = (d: string, after: number) => {
        const target = dayKey(Date.parse(`${d}T12:00:00+03:00`) + after * DAY);
        return target > days[days.length - 1] ? null : (q.cohort.get(d, target) as { n: number }).n;
      };
      return {
        days: days.map((d) => ({ day: d, active: dau.get(d) ?? 0, fresh: fresh.get(d) ?? 0, d1: ret(d, 1), d7: ret(d, 7) })),
        churn: q.churnByLevel.all(now - 3 * DAY, now - 30 * DAY) as { level: number; n: number }[],
        introStuck: (q.introStuck.get() as { n: number }).n,
        chapters: q.chapters.all() as { ch: number; n: number }[],
        masts: q.masts.all() as { mast: string; n: number }[],
        levels: q.levels.all() as { level: number; n: number }[],
        pay: {
          byPack: q.payByPack.all() as { pack: string; n: number; stars: number }[],
          week: q.paySince.get(now - 7 * DAY) as { n: number; stars: number; payers: number },
          all: q.paySince.get(0) as { n: number; stars: number; payers: number },
        },
      };
    },
    reportAdd(r: Omit<Report, 'id' | 'done'>): number {
      return Number(q.reportAdd.run(r.pid, r.name, r.topic, r.text, r.ctx, r.at).lastInsertRowid);
    },
    reportsSince(pid: number, since: number): number {
      return (q.reportsSince.get(pid, since) as { n: number }).n;
    },
    reports(): Report[] {
      return q.reports.all() as unknown as Report[];
    },
    reportGet(id: number): Report | null {
      return (q.reportGet.get(id) as Report | undefined) ?? null;
    },
    reportDone(id: number) {
      q.reportDone.run(id);
    },
    /** Ошибка из браузера: одинаковые копятся счётчиком, таблица не растёт бесконечно. */
    errorAdd(hash: string, msg: string, stack: string, ua: string, pid: number | null, at: number) {
      q.errAdd.run(hash, msg, stack, ua, pid, at, at);
      if ((q.errCount.get() as { n: number }).n > 500) q.errTrim.run();
    },
    errors(): ClientError[] {
      return q.errs.all() as unknown as ClientError[];
    },
    errorDel(hash: string | null) {
      if (hash) q.errDel.run(hash);
      else q.errClear.run();
    },
    leagueTop(week: number, limit: number) {
      return q.leagueTop.all({ w: week }, limit) as { id: number; name: string; level: number; face: number | null; frame: string | null; title: string | null; pts: number }[];
    },
    /** Место по очкам лиги за неделю, с нуля. */
    leagueRank(week: number, pts: number): number {
      return (q.leagueRank.get({ w: week }, pts) as { n: number }).n;
    },
    /** Кого подозревают в накрутке (счёт без остывания — остывание считает сервер). */
    suspects(): Player[] {
      return (q.suspects.all() as { data: string }[]).map((r) => migrate(JSON.parse(r.data) as Player));
    },
    kvGet<T>(key: string, fallback: T): T {
      const row = q.kvGet.get(key) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as T) : fallback;
    },
    kvSet(key: string, value: unknown) {
      q.kvSet.run(key, JSON.stringify(value));
    },
    getPlayer(id: number): Player | null {
      const row = q.get.get(id) as { data: string } | undefined;
      return row ? migrate(JSON.parse(row.data) as Player) : null;
    },
    savePlayer(p: Player) {
      q.save.run(p.id, JSON.stringify(p), p.name, p.level, p.authority, p.lastSeen, p.clanId);
    },
    opponents(p: Player): Player[] {
      const rows = q.opponents.all(p.id, Math.max(1, p.level - 3), p.level + 3) as { data: string }[];
      return rows.map((r) => migrate(JSON.parse(r.data) as Player));
    },
    top(limit: number) {
      return q.top.all(limit) as { id: number; name: string; level: number; authority: number; face: number | null; tag: string | null }[];
    },
    /** Случайный сосед из недавно заходивших — для обхода бараков. */
    randomNeighbour(exceptId: number, skip: number[] = []): number | null {
      const ids = (q.randomIds.all(exceptId) as { id: number }[]).map((r) => r.id).filter((id) => !skip.includes(id));
      return ids.length ? ids[Math.floor(Math.random() * ids.length)] : null;
    },
    /** Все, кто заходил после since — для рассылки напоминаний. */
    recentPlayers(since: number): Player[] {
      return (q.recent.all(since) as { data: string }[]).map((r) => migrate(JSON.parse(r.data) as Player));
    },
    rank(authority: number): number {
      return (q.rank.get(authority) as { r: number }).r;
    },
    online(since: number): number {
      return (q.online.get(since) as { n: number }).n;
    },
    totalPlayers(): number {
      return (q.total.get() as { n: number }).n;
    },
    hasPayment(chargeId: string): boolean {
      return !!q.payment.get(chargeId);
    },
    addPayment(chargeId: string, playerId: number, packId: string, stars: number, now: number) {
      q.addPayment.run(chargeId, playerId, packId, stars, now);
    },
    revenue() {
      return q.revenue.get() as { n: number; stars: number };
    },
    getClan(id: number): ClanRow | null {
      return (q.clanGet.get(id) as ClanRow | undefined) ?? null;
    },
    clanNameTaken(name: string): boolean {
      return !!q.clanByName.get(name);
    },
    createClan(name: string, tag: string, ownerId: number, now: number): number {
      return Number(q.clanAdd.run(name, tag, ownerId, now).lastInsertRowid);
    },
    saveClan(c: ClanRow) {
      q.clanSave.run(c.owner_id, c.treasury, c.level, c.id);
    },
    deleteClan(id: number) {
      q.clanDel.run(id);
    },
    clans() {
      return q.clanList.all() as { id: number; name: string; tag: string; level: number; members: number; authority: number }[];
    },
    clanMembers(id: number) {
      return q.clanMembers.all(id) as { id: number; name: string; level: number; authority: number; face: number | null }[];
    },
    worldBoss(): WorldBossRow | null {
      return (q.boss.get() as WorldBossRow | undefined) ?? null;
    },
    lastBossGen(): number {
      return (q.lastGen.get() as { g: number }).g;
    },
    spawnWorldBoss(gen: number, hp: number, now: number) {
      q.spawn.run(gen, hp, hp, now);
    },
    setWorldBossHp(id: number, hp: number) {
      q.bossHp.run(hp, id);
    },
    endWorldBoss(id: number, now: number) {
      q.bossEnd.run(now, id);
    },
    addHit(bossId: number, playerId: number, damage: number) {
      q.hit.run(bossId, playerId, damage);
    },
    hits(bossId: number) {
      return q.hits.all(bossId) as { id: number; name: string; damage: number }[];
    },
    myHit(bossId: number, playerId: number): number {
      return (q.myHit.get(bossId, playerId) as { damage: number } | undefined)?.damage ?? 0;
    },
  };
}
