/* SWGOH Resources service worker — makes the schedule installable and
   usable offline. Same-origin static assets are cached on first use
   (this automatically picks up ?v= cache-busters); page navigations
   and live data go network-first so the schedule stays fresh, falling
   back to cache offline. Bump CACHE below on deploys that change the
   app shell. */
const CACHE = 'swgoh-schedule-v11';

const CORE = ['/', '/index.html', '/site.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('swgoh-schedule-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers?.has('range')) return;
  const url = new URL(req.url);

  async function networkFirst({ fallback, revalidate = false } = {}) {
    const cached = async () => (await caches.match(req)) || (fallback && await caches.match(fallback));
    try {
      const res = await fetch(req, revalidate ? { cache: 'no-cache' } : undefined);
      if (res.ok) {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {}));
      } else if (res.status >= 500) {
        const hit = await cached();
        if (hit) return hit;
      }
      return res;
    } catch (error) {
      const hit = await cached();
      if (hit) return hit;
      throw error;
    }
  }

  // Google Fonts: stale-while-revalidate (opaque responses are fine).
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(req).then(hit => {
          const net = fetch(req).then(res => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // Navigations: network-first, cache fallback (offline still opens).
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst({ fallback: '/index.html' }));
    return;
  }

  // Live data snapshots refresh every few hours — a cache-first rule
  // would pin the first copy served and never pick up the 4-hourly
  // refresh, so they go network-first (cache fallback keeps them
  // available offline).
  // The era emblem is overwritten in-place by the live-event pull.
  // Revalidate it as well so an installed browser sees the next era.
  // Versioned scripts are immutable; revalidate any unversioned script URL.
  const script = url.pathname.startsWith('/assets/js/') && url.pathname.endsWith('.js') && !url.searchParams.has('v');
  if (url.pathname.startsWith('/assets/data/') || url.pathname === '/assets/img/live/era-icon.png' || script) {
    event.respondWith(networkFirst({ revalidate: true }));
    return;
  }

  // Local assets (CSS/JS/images): cache-first, network fallback.
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {}));
        }
        return res;
      });
    })
  );
});
