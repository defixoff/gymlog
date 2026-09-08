/* GymLog service worker v2 — офлайн для статики, API никогда не кэшируется */
const CACHE = 'gymlog-v28';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json',
  './vendor/motion.js', './vendor/confetti.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); // ждём сигнала SKIP_WAITING от страницы
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // FIX: API — только сеть
  // stale-while-revalidate: мгновенно из кэша, в фоне обновляем
  e.respondWith(caches.open(CACHE).then(async c => {
    const cached = await c.match(e.request);
    const net = fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => null);
    if (cached) { e.waitUntil(net); return cached; }
    const res = await net;
    return res || (e.request.mode === 'navigate' ? c.match('./index.html') : Response.error());
  }));
});
