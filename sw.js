// Service worker: offline play. Network-first for everything on this origin (so every Vercel deploy
// shows up immediately), with the cache as fallback when offline.
const VERSION = 'bb-v2';
const ASSETS = [
  '/', '/index.html', '/css/style.css',
  '/js/main.js', '/js/game.js', '/js/shapes.js', '/js/themes.js', '/js/render.js', '/js/fx.js', '/js/audio.js', '/js/storage.js', '/js/ui.js',
  '/manifest.webmanifest', '/favicon.ico', '/assets/favicon.svg', '/assets/icon-192.png', '/assets/icon-512.png', '/assets/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;              // fonts etc. go straight to the network
  const key = req.mode === 'navigate' ? '/index.html' : req;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(key).then(hit => hit || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error())))
  );
});
