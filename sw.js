const CACHE_NAME = 'moa-cache-v3';
const APP_SHELL = [
  './index.html',
  './calendar.html',
  './settings.html',
  './style.css',
  './calendar.css',
  './settings.css',
  './app.js',
  './hue.js',
  './spotify.js',
  './calendar.js',
  './settings.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isAppShellFile = APP_SHELL.some((f) => url.pathname.endsWith(f.replace('./', '/')));

  // Only intercept the app's own files. Everything else (weather, news,
  // Spotify, Claude, Ollama, Hue) passes straight through to the network.
  if (isAppShellFile) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
