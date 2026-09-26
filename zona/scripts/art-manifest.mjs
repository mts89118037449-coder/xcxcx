// Собирает public/art/manifest.json — список всех картинок, которые видит игра.
// Запуск: npm run art (после того как положил новые файлы в public/art).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'public', 'art');
const files = [];
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(webp|png)$/i.test(e.name)) files.push(path.relative(root, full).split(path.sep).join('/'));
  }
})(root);
files.sort();
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ files }, null, 2) + '\n');
console.log(`manifest.json: ${files.length} файлов`);
