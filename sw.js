/* Capitalism service worker.
   Code is fetched network-first so a deploy is never half-stale; the cache is
   the offline fallback. Pictures and the manifest are cache-first.
   Bump VERSION when the asset list changes. */
const VERSION = 'capitalism-v5';
const SHELL = [
  './', './index.html', './manifest.json',
  './css/main.css',
  './js/main.js', './js/ui.js', './js/sim.js', './js/field.js', './js/state.js', './js/data.js', './js/events.js', './js/util.js',
  './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isCode = (url) => /\.(?:js|css|html)$/.test(url.pathname) || url.pathname.endsWith('/');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (isCode(url) || req.mode === 'navigate') {
    /* fresh when we can reach the network, cached when we cannot */
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => { try { c.put(req, copy); } catch (_) { } });
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => { try { c.put(req, copy); } catch (_) { } });
      return res;
    }))
  );
});
