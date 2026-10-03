// Нагрузочный тест: N игроков одновременно ходят по игре — заходят, работают, дерутся, смотрят топы.
// Сервер поднимается здесь же на временной базе (как в продакшене — файл SQLite с WAL).
//
//   npm run load                 — 500 игроков, 30 секунд, с паузами «как люди»
//   npm run load -- 1000 60      — 1000 игроков, 60 секунд
//   npm run load -- 200 20 burst — без пауз: сколько запросов в секунду сервер вытянет

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { openDb } from '../server/db.ts';

const players = Number(process.argv[2] ?? 500);
const seconds = Number(process.argv[3] ?? 30);
const burst = process.argv[4] === 'burst';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zona-load-'));
const db = openDb(path.join(dir, 'load.db'));
const { app } = createApp({
  db,
  bot: null,
  botToken: '',
  webAppUrl: '',
  webhookSecret: '',
  adminIds: [],
  devAuth: true,
  rateLimit: { burst: 1000, perSec: 1000 },
});
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

interface Stat {
  ms: number[];
  fail: number;
  game: number;
}
const stats = new Map<string, Stat>();
const statOf = (k: string) => stats.get(k) ?? (stats.set(k, { ms: [], fail: 0, game: 0 }), stats.get(k)!);

async function call(id: number, route: string, body: unknown = {}, label = route) {
  const t = performance.now();
  const s = statOf(label);
  try {
    const res = await fetch(base + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `tma dev:${id}:${encodeURIComponent(`Нагрузка ${id}`)}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { result?: unknown; player?: { field?: { id: number }[] } } | null;
    s.ms.push(performance.now() - t);
    if (res.status >= 500) s.fail++;
    else if (res.status >= 400) s.game++; // отказ по правилам игры — это нормально
    return json;
  } catch {
    s.fail++;
    return null;
  }
}

// Подготовка: заводим игроков и поднимаем им уровень, чтобы открылось всё
console.log(`Заводим ${players} игроков…`);
for (let i = 0; i < players; i += 50) {
  await Promise.all(Array.from({ length: Math.min(50, players - i) }, (_, k) => call(100_000 + i + k, '/api/me', {}, 'prep')));
}
db.transaction(() => {
  for (let i = 0; i < players; i++) {
    const p = db.getPlayer(100_000 + i)!;
    p.level = 5 + (i % 20);
    p.str = 5 + (i % 40);
    p.money = 50_000;
    p.intro = -1;
    p.tut = -1;
    db.savePlayer(p);
  }
});
stats.clear();

// Что делает игрок: веса — примерно как ходят живые люди
const ACTIONS: [number, (id: number) => Promise<unknown>][] = [
  [25, (id) => call(id, '/api/me')],
  [14, (id) => call(id, '/api/action/job', { jobId: 'j_floor' }, 'action:job')],
  [6, (id) => call(id, '/api/action/yard', {}, 'action:yard')],
  [6, async (id) => {
    const r = await call(id, '/api/action/pvp', {}, 'action:pvp');
    if (r?.result) await call(id, '/api/action/battle', { act: 'auto' }, 'action:battle');
  }],
  [5, (id) => call(id, '/api/action/place', { place: 'canteen', act: 'meal' }, 'action:place')],
  [5, (id) => call(id, '/api/action/dice', { bet: 100 }, 'action:dice')],
  [4, (id) => call(id, '/api/action/worldHit', {}, 'action:worldHit')],
  [8, (id) => call(id, '/api/top')],
  [5, (id) => call(id, '/api/league')],
  [4, (id) => call(id, '/api/clans')],
  [5, (id) => call(id, '/api/chat', { channel: 'all' })],
  [4, (id) => call(id, '/api/world')],
  [4, (id) => call(id, '/api/market')],
  [3, (id) => call(id, '/api/visit', { id: 0 })],
  [2, (id) => call(id, '/api/action/chatSay', { phrase: 'hi', channel: 'all' }, 'action:chatSay')],
];
const total = ACTIONS.reduce((a, [w]) => a + w, 0);
const pick = () => {
  let r = Math.random() * total;
  for (const [w, f] of ACTIONS) if ((r -= w) < 0) return f;
  return ACTIONS[0][1];
};

console.log(`Поехали: ${players} игроков, ${seconds} с${burst ? ', без пауз' : ', пауза 1–4 с между нажатиями'}…`);
const until = Date.now() + seconds * 1000;
const t0 = performance.now();
const cpu0 = process.cpuUsage();
await Promise.all(
  Array.from({ length: players }, async (_, i) => {
    const id = 100_000 + i;
    await new Promise((r) => setTimeout(r, Math.random() * 1000));
    while (Date.now() < until) {
      await pick()(id);
      if (!burst) await new Promise((r) => setTimeout(r, 1000 + Math.random() * 3000));
    }
  }),
);
const wall = (performance.now() - t0) / 1000;
const cpu = process.cpuUsage(cpu0);

const pct = (a: number[], q: number) => a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? 0;
let all: number[] = [];
let fails = 0;
const rows = [...stats.entries()].sort((a, b) => b[1].ms.length - a[1].ms.length);
console.log('\nзапрос                     кол-во   p50 мс   p95 мс   p99 мс  ошибки  отказы игры');
for (const [k, s] of rows) {
  const ms = s.ms.sort((a, b) => a - b);
  all = all.concat(ms);
  fails += s.fail;
  console.log(
    `${k.padEnd(26)} ${String(ms.length).padStart(6)} ${pct(ms, 0.5).toFixed(1).padStart(8)} ${pct(ms, 0.95).toFixed(1).padStart(8)} ${pct(ms, 0.99).toFixed(1).padStart(8)} ${String(s.fail).padStart(7)} ${String(s.game).padStart(12)}`,
  );
}
all.sort((a, b) => a - b);
console.log(
  `\nВсего: ${all.length} запросов за ${wall.toFixed(1)} с — ${(all.length / wall).toFixed(0)} в секунду. ` +
    `p50 ${pct(all, 0.5).toFixed(1)} мс, p95 ${pct(all, 0.95).toFixed(1)} мс, p99 ${pct(all, 0.99).toFixed(1)} мс. ` +
    `Ошибок сервера: ${fails}. Процессор: ${(((cpu.user + cpu.system) / 1e6 / wall) * 100).toFixed(0)}% одного ядра ` +
    `(вместе с генератором нагрузки).`,
);
server.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
