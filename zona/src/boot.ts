// Загрузочный экран живёт в index.html (виден ещё до скриптов). Убираем его, когда игра готова,
// но не раньше чем через полторы секунды — чтобы картинка не мелькала.
const started = performance.now();
let gone = false;

export function hideBoot() {
  if (gone) return;
  gone = true;
  const el = document.getElementById('boot');
  if (!el) return;
  const w = window as unknown as { __bootT?: number; __bootW?: number };
  const bar = document.getElementById('boot-bar');
  if (bar) bar.style.width = '100%';
  setTimeout(() => {
    clearInterval(w.__bootT);
    clearInterval(w.__bootW);
    el.classList.add('gone');
    setTimeout(() => el.remove(), 600);
  }, Math.max(350, 1500 - (performance.now() - started)));
}
