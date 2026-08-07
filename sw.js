const CACHE = 'saf-log-v6';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon.png', './logo-header.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const req = e.request;
  // team file: always try the network first so preset updates propagate
  if (req.url.endsWith('.enc')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  const isPage = req.mode === 'navigate' || (req.destination === 'document') || req.url.endsWith('/') || req.url.endsWith('index.html');
  if (isPage) {
    // network-first for the app page so redeploys show up on the next open when online
    e.respondWith(
      fetch(req).then(resp => {
        if (resp && resp.status === 200) caches.open(CACHE).then(c => c.put(req, resp.clone()));
        return resp;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // stale-while-revalidate for other assets
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req).then(resp => {
          if (resp && resp.status === 200 && req.url.startsWith('http')) cache.put(req, resp.clone());
          return resp;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
