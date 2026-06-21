// Minimal offline cache for LANCEFALL (registered only on mobile, see src/mobile/pwa.ts).
// Navigation requests = network-first (always try fresh HTML so a new deploy is picked up the
// next time online); other same-origin GETs = cache-first (Vite assets are content-hashed and
// immutable) with a network fill. Never touches non-GET or cross-origin requests.
const CACHE = 'lancefall-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let sameOrigin = false;
  try {
    sameOrigin = new URL(req.url).origin === self.location.origin;
  } catch {
    return;
  }
  if (!sameOrigin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          cachePut(req, r.clone());
          return r;
        })
        .catch(() => caches.match('/').then((hit) => hit || Response.error())),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          cachePut(req, r.clone());
          return r;
        }),
    ),
  );
});

function cachePut(req, res) {
  if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res)).catch(() => {});
}
