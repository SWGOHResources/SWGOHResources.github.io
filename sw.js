/* SWGOH Resources service worker — makes the schedule installable and
   usable offline. Same-origin static assets are cached on first use
   (this automatically picks up ?v= cache-busters); page navigations
   go network-first so the schedule stays fresh, falling back to cache
   offline. Bump CACHE below on deploys that change the app shell. */
const CACHE = 'swgoh-schedule-v4';

// Closed-phone pushes (FCM): only when firebase-config.js holds real
// credentials. CDN/offline failures skip silently — push stays off.
try {
  self.importScripts('/firebase-config.js');
  const fbCfg = self.FIREBASE_CONFIG || null;
  if (fbCfg && fbCfg.apiKey && !/REPLACE|PLACEHOLDER/.test(fbCfg.apiKey)
      && fbCfg.vapidKey && !/REPLACE|PLACEHOLDER/.test(fbCfg.vapidKey)) {
    self.importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
    self.importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
    firebase.initializeApp(fbCfg);
    firebase.messaging().onBackgroundMessage(payload => {
      const n = payload.notification || {};
      const d = payload.data || {};
      const title = n.title || d.title || 'SWGOH event starting';
      const body = n.body || d.body || '';
      self.registration.showNotification(title, {
        body, icon: '/assets/img/icons/favicon-32.png', data: { url: d.url || '/' },
      });
    });
  }
} catch (e) { /* Firebase push stays off */ }
const CORE = ['/', '/index.html', '/site.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

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
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('/index.html')))
    );
    return;
  }

  // Local assets (CSS/JS/images): cache-first, network fallback.
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});

// Tapping an event alert focuses the open schedule (or opens it).
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if ('focus' in c) {
          try {
            if ('navigate' in c) c.navigate(new URL(url, self.location.origin).href);
          } catch (e) {}
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
