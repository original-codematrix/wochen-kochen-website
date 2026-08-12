// Upgrade to kochbuch-v17: the weekly-plan dinner cards open the full recipe
// (ingredients incl. seasonings) on tap.
const CACHE = 'kochbuch-v19';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './import.css',
  './recipe-seasonings.js',
  './recipe-expansion.js',
  './data.js',
  './knuspr-api.js',
  './knuspr-ui.js',
  './app.js',
  './manifest.webmanifest',
  './server/current-plan.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  ]));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => caches.match('./server/current-plan.json')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
