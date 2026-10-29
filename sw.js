// Offline zuerst aus dem Cache, im Hintergrund wird jede Datei neu geladen (wie bei Recall).
// Neue Inhalte in content/ kommen so ohne Versionswechsel beim nächsten Start an.
const CACHE = 'klartext-v2';
const ASSETS = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'src/app.js', 'src/dates.js', 'src/daily.js', 'src/srs.js', 'src/store.js', 'src/progress.js', 'src/feedback.js',
  'content/techniken.json', 'content/challenges.json', 'content/tipps.json',
  'fonts/Geist-Variable.woff2', 'fonts/GeistMono-Variable.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const key = req.mode === 'navigate' ? './' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(req, { cache: 'no-cache' })
      .then(res => { if (res.ok && res.type === 'basic') cache.put(key, res.clone()); return res; })
      .catch(() => cached || Response.error());
    if (cached) { e.waitUntil(fresh.catch(() => {})); return cached; }
    return fresh;
  }));
});
