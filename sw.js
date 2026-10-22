const CACHE_PREFIX = 'swgoh-schedule-';
const CACHE = CACHE_PREFIX + 'v10';
const CORE = ['/', '/index.html', '/site.webmanifest'];
const FONT_ORIGINS = new Set(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function storeResponse(req, res) {
  return caches.open(CACHE).then(cache => cache.put(req, res)).catch(() => {});
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET' || req.headers?.has('range')) return;
  const url = new URL(req.url);
  if(!['http:', 'https:'].includes(url.protocol)) return;
  if(url.origin !== self.location.origin && !FONT_ORIGINS.has(url.origin)) return;

  const writes = [];
  const save = res => {
    if(res && res.status !== 206 && (res.ok || res.type === 'opaque')) writes.push(storeResponse(req, res.clone()));
    return res;
  };
  const response = (async () => {
    const cache = await caches.open(CACHE).catch(() => null);
    const hit = cache ? await cache.match(req).catch(() => undefined) : undefined;
    if(url.origin !== self.location.origin) {
      const net = fetch(req).then(save).catch(() => hit || Response.error());
      writes.push(net.then(() => undefined));
      return hit || net;
    }
    const mutable = req.mode === 'navigate'
      || url.pathname.startsWith('/assets/data/')
      || url.pathname === '/assets/img/live/era-icon.png'
      || (url.pathname.endsWith('.js') && !url.searchParams.has('v'));
    if(!mutable && hit) return hit;
    try {
      return save(await fetch(req, { cache: mutable ? 'no-cache' : 'default' }));
    } catch(error) {
      if(hit) return hit;
      if(req.mode === 'navigate' && url.pathname === '/') {
        const home = cache ? await cache.match('/index.html').catch(() => undefined) : undefined;
        if(home) return home;
      }
      return Response.error();
    }
  })();
  event.respondWith(response);
  event.waitUntil(response.then(async () => {
    while(writes.length) await Promise.all(writes.splice(0));
  }).catch(() => {}));
});
