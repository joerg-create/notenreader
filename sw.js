// Offline-Unterstützung: App-Dateien werden zwischengespeichert.
// Bei einer neuen Version CACHE hochzählen.
const CACHE = 'notenreader-v20';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './db.js', './forscore.js', './scan.js', './practice.js', './manifest.webmanifest',
  './vendor/pdf.min.mjs', './vendor/pdf.worker.min.mjs', './vendor/Bravura.woff2', './vendor/wach.mp4',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Erst aus dem Netz laden (damit Updates sofort da sind), offline aus dem Zwischenspeicher.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) || Response.error();
    }
  }));
});
