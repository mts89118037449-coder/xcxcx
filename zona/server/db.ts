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

export interface WorldBossRow {
  id: number;
  gen: number;
  hp: number;
  max_hp: number;
  started_at: number;
}

export function openDb(file: string) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
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
  `);

  // Колонка клана появилась позже — добавляем в старые базы.
  const cols = db.prepare('PRAGMA table_info(players)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'clan_id')) db.exec('ALTER TABLE players ADD COLUMN clan_id INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS players_clan ON players(clan_id)');

  const q = {
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
      ORDER BY RANDOM() LIMIT 20`),
    top: db.prepare("SELECT p.id, p.name, p.level, p.authority, json_extract(p.data, '$.face') AS face, c.tag AS tag FROM players p LEFT JOIN clans c ON c.id = p.clan_id ORDER BY p.authority DESC, p.level DESC LIMIT ?"),
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
    getPlayer(id: number): Player | null {
      const row = q.get.get(id) as { data: string } | undefined;
      return row ? migrate(JSON.parse(row.data) as Player) : null;
    },
    savePlayer(p: Player) {
      q.save.run(p.id, JSON.stringify(p), p.name, p.level, p.authority, p.lastSeen, p.clanId);
    },
    opponents(p: Player): Player[] {
      const rows = q.opponents.all(p.id, Math.max(1, p.level - 2), p.level + 2) as { data: string }[];
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
