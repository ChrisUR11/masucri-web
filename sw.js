const CACHE_NAME = 'masucri-cache-v9.1';
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './logo-masucri.png',
    './manifest.json'
];

// Instalar el Service Worker y guardar en caché local
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
});

// Interceptar peticiones para que funcione offline
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});