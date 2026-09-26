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
// Размеры PNG читаем из заголовка — нужны, чтобы спрайты разных поз были в одном масштабе.
const sizes = {};
for (const f of files) {
  if (!f.endsWith('.png')) continue;
  const buf = Buffer.alloc(24);
  const fd = fs.openSync(path.join(root, f), 'r');
  fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  sizes[f] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ files, sizes }) + '\n');
console.log(`manifest.json: ${files.length} файлов`);
