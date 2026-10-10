/* Preserve old bookmarks and shared plans while using directory URLs.
   The HTML's root base keeps existing relative asset/data URLs working. */
(function () {
  'use strict';
  if (!/^https?:$/.test(location.protocol)) return;
  const routes = {
    '/index.html': '/',
    '/conquest.html': '/conquest/',
    '/privacy.html': '/privacy/',
    '/cookie-policy.html': '/cookie-policy/',
    '/terms.html': '/terms/',
  };
  const pathname = location.pathname;
  const route = routes[pathname] || Object.values(routes).find(p => pathname === p + 'index.html');
  if (!route) return;
  history.replaceState(history.state, '', route + location.search + location.hash);
})();
