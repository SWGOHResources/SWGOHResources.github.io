/* SITE — shared chrome for the conquest page (backdrop starfield, mobile
   nav, cookie notice, footer year). The homepage uses app.js instead. No
   engine dependency. Loaded without defer at the end of <body>. */

(function(){
  /* Backdrop starfield. The homepage builds its own in app.js; this page
     ships the same layer but nothing populated it, so it rendered as a
     flat gradient. Same budget as the homepage: ~70 nodes, ~25% of them
     twinkling on independent cycles (negative delays so nothing flashes
     in sync), and no animation at all under reduced-motion or save-data
     — too many infinite opacity animations reads as scroll jank. */
  const field = document.getElementById('starfield');
  if(field){
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = typeof navigator !== 'undefined' && navigator.connection && navigator.connection.saveData;
    const STAR_COUNT = 46;
    for(let i = 0; i < STAR_COUNT; i++){
      const s = document.createElement('span');
      const r = Math.random();
      const size = r < 0.55 ? 1 : r < 0.88 ? 2 : 3;
      if(size === 3) s.classList.add('bright');
      s.style.width = s.style.height = size + 'px';
      s.style.left = Math.random() * 100 + '%';
      s.style.top = Math.random() * 100 + '%';
      const tint = Math.random();
      if(tint < 0.16) s.classList.add('cool');
      else if(tint < 0.26) s.classList.add('warm');
      const base = (0.3 + Math.random() * 0.55).toFixed(2);
      // Only the small stars twinkle, and only a few of them: an animated
      // node costs a frame of work for the whole page, decoration doesn't
      // need a dozen of them.
      if(!reduceMotion && !saveData && size < 3 && Math.random() < 0.18){
        s.classList.add('tw');
        s.style.opacity = base;
        s.style.animationDuration = (3 + Math.random() * 5).toFixed(2) + 's';
        s.style.animationDelay = (-Math.random() * 8).toFixed(2) + 's';
      } else {
        s.style.opacity = base;
      }
      field.appendChild(s);
    }
  }

  const navToggle = document.getElementById('navToggle');
  const mobilePanel = document.getElementById('mobilePanel');
  if(navToggle && mobilePanel){
    navToggle.addEventListener('click', () => {
      const willOpen = !mobilePanel.classList.contains('open');
      navToggle.classList.toggle('open', willOpen);
      mobilePanel.classList.toggle('open', willOpen);
      navToggle.setAttribute('aria-expanded', String(willOpen));
    });
  }

  const COOKIE_NOTICE_KEY = 'swgoh_cookie_notice';
  const cookieNotice = document.getElementById('cookieNotice');
  const dismissBtn = document.getElementById('dismissCookieNotice');
  const hasCookie = name => document.cookie.split(';').some(c => c.trim().split('=')[0] === name);
  if(cookieNotice && !hasCookie(COOKIE_NOTICE_KEY)) cookieNotice.hidden = false;
  if(dismissBtn) dismissBtn.addEventListener('click', () => {
    document.cookie = `${COOKIE_NOTICE_KEY}=dismissed; max-age=15552000; path=/; SameSite=Lax`;
    if(cookieNotice) cookieNotice.hidden = true;
  });

  const footerYearEl = document.getElementById('footerYear');
  if(footerYearEl){ footerYearEl.textContent = `© ${new Date().getFullYear()} SWGOH::RESOURCES`; }

})();

/* Discord handle copy (footer buttons use inline onclick). Global so
   every page's footer works with just site.js loaded. */
function copyDiscordHandle(btnEl) {
  if(!btnEl) return;
  if(!navigator.clipboard || !navigator.clipboard.writeText){
    alert('Discord username: granddom');
    return;
  }
  navigator.clipboard.writeText('granddom').then(() => {
    const originalText = btnEl.innerHTML;
    btnEl.classList.add('copied');
    btnEl.setAttribute('aria-live', 'polite');
    btnEl.innerHTML = `<span>✓ Copied!</span>`;
    setTimeout(() => {
      btnEl.classList.remove('copied');
      btnEl.innerHTML = originalText;
    }, 2000);
  }).catch(() => {
    alert('Discord username: granddom');
  });
}
