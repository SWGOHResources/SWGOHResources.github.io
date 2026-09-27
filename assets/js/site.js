/* SITE — shared chrome for the conquest page (mobile nav, cookie
   notice, footer year). The homepage uses app.js instead. No engine
   dependency. Loaded without defer at the end of <body>. */

(function(){
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
