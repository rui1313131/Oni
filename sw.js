const CACHE_NAME = 'oni-v3';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/firebase-config.js',
  './js/utils.js',
  './js/icons.js',
  './js/location.js',
  './js/skills.js',
  './js/shooting.js',
  './js/items.js',
  './js/voice.js',
  './js/safety.js',
  './js/game.js',
  './js/room.js',
  './js/ads.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // ネットワーク優先（リアルタイム通信のため）
  if (event.request.url.includes('firebaseio.com') ||
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('gstatic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 広告ネットワークはキャッシュしない
  if (event.request.url.includes('googlesyndication.com') ||
      event.request.url.includes('doubleclick.net') ||
      event.request.url.includes('googleads') ||
      event.request.url.includes('adservice.google')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 地図タイルはキャッシュ優先
  if (event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // その他のアセットはキャッシュ優先、フォールバックでネットワーク
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
