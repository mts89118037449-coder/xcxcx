// Горячий бэкап SQLite без остановки сервера: VACUUM INTO даёт целостную копию.
// node deploy/backup.mjs <база> <папка> [сколько дней хранить]
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [src, dir, keepDays = '14'] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `zona-${new Date().toISOString().slice(0, 10)}.db`);
fs.rmSync(out, { force: true });
new DatabaseSync(src).exec(`VACUUM INTO '${out.replaceAll("'", "''")}'`);
const cutoff = Date.now() - Number(keepDays) * 86400e3;
for (const f of fs.readdirSync(dir)) {
  const p = path.join(dir, f);
  if (f.endsWith('.db') && fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p);
}
console.log(new Date().toISOString(), 'backup', out);
