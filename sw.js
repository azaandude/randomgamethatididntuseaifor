/* NAME-O-MATIC service worker: makes the site run offline after the first visit.
 * Same-origin files only. Firebase and AI provider requests go straight to the network.
 */
const CACHE = 'nom-v1';
const CORE = [
 "app.html",
 "arcade.html",
 "bingo.html",
 "career.html",
 "community.html",
 "compare.html",
 "connect.html",
 "database.html",
 "fantasy.html",
 "guessr.html",
 "hangman.html",
 "index.html",
 "kit.html",
 "login.html",
 "lucky.html",
 "manager.html",
 "mgrquiz.html",
 "multiplayer.html",
 "packs.html",
 "penalties.html",
 "physics.html",
 "quiz.html",
 "radio.html",
 "referee.html",
 "stadium-explorer.html",
 "tactics.html",
 "transfer.html",
 "trophy.html",
 "worldcup.html",
 "database.js",
 "nom-net.js",
 "manifest.json",
 "firebase-config.js",
 "fonts/fonts.css",
 "fonts/bangers.woff2",
 "fonts/fredoka-one.woff2",
 "fonts/nunito-400.woff2",
 "fonts/nunito-600.woff2",
 "fonts/nunito-700.woff2",
 "fonts/nunito-800.woff2",
 "fonts/nunito-900.woff2",
 "vendor/three.min.js",
 "vendor/GLTFLoader.js"
];
self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(function (u) { return cache.add(u).catch(function () {}); }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async function () {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(function (res) {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(function () { return null; });
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') {
      const fallback = await cache.match('index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
