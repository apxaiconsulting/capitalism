/* Capitalism service worker - bump VERSION on every deploy */
const VERSION = 'capitalism-v4';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/main.css',
  './js/main.js', './js/ui.js', './js/sim.js', './js/field.js', './js/state.js', './js/data.js', './js/events.js', './js/util.js',
  './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => { try { c.put(req, copy); } catch (_) { } });
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
