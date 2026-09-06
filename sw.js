// Network-first with a cache fallback, deliberately not cache-first: with a
// connection the browser always gets current files, so a deploy takes effect
// immediately. The cache only serves when the network is unreachable.
// Bump CACHE_VERSION whenever PRECACHE changes.
const CACHE_VERSION = 'peak-panes-v3';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/styles.css',
  './assets/brand/logo.svg',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './src/app.js',
  './src/state.js',
  './src/storage.js',
  './src/domain.js',
  './src/backup.js',
  './src/icons.js',
  './src/views/canvassing.js',
  './src/views/header.js',
  './src/views/customers.js',
  './src/views/jobs.js',
  './src/views/modals.js',
  './src/views/nav.js',
  './src/views/settings.js',
  './src/views/stub.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Added one at a time so a single bad path can't fail the whole install.
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy).catch(() => {}));
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('./index.html')))
  );
});
