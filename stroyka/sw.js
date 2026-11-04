// Офлайн-режим: приложение открывается даже без связи с сервером.
// Файлы приложения — «сначала сеть, при ошибке кэш» (обновления приходят сразу);
// запросы к API в кэш не попадают — данные хранит само приложение (последняя копия на устройстве).
const CACHE = 'stroyka-v1';
const SHELL = [
  './', './index.html', './css/style.css', './js/main.js', './js/data.js', './js/scene.js', './js/scene-units.js', './js/seed.js', './js/seed-fin.js', './js/config.js',
  './vendor/three/three.module.js', './vendor/three/addons/controls/OrbitControls.js',
  './vendor/three/addons/environments/RoomEnvironment.js', './vendor/three/addons/renderers/CSS2DRenderer.js',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('/api') || u.pathname.includes('/api/') || u.pathname.endsWith('/healthz')) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || caches.match('./index.html')))
  );
});
