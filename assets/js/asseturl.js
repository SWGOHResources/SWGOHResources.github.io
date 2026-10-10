/* Cache-busted URLs for images the scripts build at runtime.
 *
 * CSS/JS references in the HTML carry their own content hash (see
 * scripts/cache-bust.mjs), but feat icons, crate art and unit portraits are
 * assembled in JS from data, so they need the site-wide token from
 * <meta name="swgoh-asset-v"> to change when the PNG behind them does.
 * Without it, replacing an image at the same path leaves the old one cached
 * in the browser and on the CDN.
 *
 * Load this before any script that builds an <img src>. */
(function () {
  'use strict';

  var META = 'swgoh-asset-v';

  function siteVersion() {
    if (typeof document === 'undefined' || !document.querySelector) return '';
    var el = document.querySelector('meta[name="' + META + '"]');
    return (el && el.getAttribute('content')) || '';
  }

  /**
   * Appends ?v=<site version> to a local asset path. Absolute URLs, data
   * URIs, fragments and anything already versioned are returned untouched,
   * so this is safe to wrap unconditionally.
   */
  function assetUrl(p) {
    var s = p === null || p === undefined ? '' : String(p);
    if (!s) return s;
    if (/^(?:[a-z]+:)?\/\//i.test(s) || /^(?:data|blob|mailto|tel|javascript):/i.test(s)) return s;
    if (s.charAt(0) === '#') return s;
    if (/[?&]v=/.test(s)) return s;
    var v = siteVersion();
    if (!v) return s;
    var hashAt = s.indexOf('#');
    var frag = '';
    if (hashAt >= 0) {
      frag = s.slice(hashAt);
      s = s.slice(0, hashAt);
    }
    return s + (s.indexOf('?') >= 0 ? '&' : '?') + 'v=' + v + frag;
  }

  if (typeof window !== 'undefined') window.assetUrl = assetUrl;
  if (typeof globalThis !== 'undefined') globalThis.assetUrl = assetUrl;
})();
