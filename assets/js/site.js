const siteModalOpeners = new Map();
const siteFocusables = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function closeMobilePanel() {
  document.getElementById('navToggle')?.classList.remove('open');
  document.getElementById('navToggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('mobilePanel')?.classList.remove('open');
}

function openModal(modal) {
  if (!modal) return;
  document.querySelectorAll('.modal-backdrop.open').forEach(other => {
    if (other !== modal) closeModal(other, { restoreFocus: false });
  });
  if (!siteModalOpeners.has(modal)) siteModalOpeners.set(modal, document.activeElement);
  closeMobilePanel();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  modal.querySelector(siteFocusables)?.focus();
}

function closeModal(modal, { restoreFocus = true } = {}) {
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal-backdrop.open')) document.body.classList.remove('modal-open');
  const opener = siteModalOpeners.get(modal);
  siteModalOpeners.delete(modal);
  if (!restoreFocus || !opener?.isConnected) return;
  const panel = document.getElementById('mobilePanel');
  const target = panel?.contains(opener) && !panel.classList.contains('open')
    ? document.getElementById('navToggle') : opener;
  target?.focus();
}

(function () {
  const navToggle = document.getElementById('navToggle');
  const mobilePanel = document.getElementById('mobilePanel');
  navToggle?.addEventListener('click', () => {
    if (!mobilePanel) return;
    const open = !mobilePanel.classList.contains('open');
    navToggle.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    mobilePanel.classList.toggle('open', open);
  });
  mobilePanel?.addEventListener('click', event => {
    if (event.target.closest('a')) closeMobilePanel();
  });
  document.addEventListener('click', event => {
    if (!mobilePanel?.contains(event.target) && !navToggle?.contains(event.target)) closeMobilePanel();
  });
  document.addEventListener('focusin', event => {
    if (!mobilePanel?.contains(event.target) && !navToggle?.contains(event.target)) closeMobilePanel();
  });
  window.matchMedia?.('(max-width: 760px)').addEventListener?.('change', () => closeMobilePanel());

  document.addEventListener('keydown', event => {
    const modal = document.querySelector('.modal-backdrop.open');
    if (event.key === 'Escape') {
      if (modal) { event.preventDefault(); closeModal(modal); }
      else if (mobilePanel?.classList.contains('open')) {
        event.preventDefault(); closeMobilePanel(); navToggle?.focus();
      }
      return;
    }
    if (!modal || event.key !== 'Tab') return;
    const focusables = [...modal.querySelectorAll(siteFocusables)].filter(el => !el.closest('[hidden]'));
    const first = focusables[0], last = focusables.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });

  const about = document.getElementById('aboutModal');
  for (const id of ['openAboutBtnHeader', 'openAboutBtnMobile']) {
    document.getElementById(id)?.addEventListener('click', () => openModal(about));
  }
  for (const id of ['closeAboutBtn', 'closeAboutBtn2']) {
    document.getElementById(id)?.addEventListener('click', () => closeModal(about));
  }
  about?.addEventListener('click', event => { if (event.target === about) closeModal(about); });

  const cookieNotice = document.getElementById('cookieNotice');
  const cookieKey = 'swgoh_cookie_notice';
  if (cookieNotice && !document.cookie.split(';').some(c => c.trim().split('=')[0] === cookieKey)) cookieNotice.hidden = false;
  document.getElementById('dismissCookieNotice')?.addEventListener('click', () => {
    document.cookie = `${cookieKey}=dismissed; max-age=15552000; path=/; SameSite=Lax`;
    if (cookieNotice) cookieNotice.hidden = true;
  });

  const year = document.getElementById('footerYear');
  if (year) year.textContent = `© ${new Date().getFullYear()} SWGOH::RESOURCES`;
  if (!document.getElementById('mergedHero')) {
    document.getElementById('footerMeta')?.remove();
    document.querySelector('.footer-bottom .dot')?.remove();
  }

  const field = document.getElementById('starfield');
  if (!field) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData;
  for (let i = 0; i < 46; i++) {
    const star = document.createElement('span'), r = Math.random();
    const size = r < 0.55 ? 1 : r < 0.88 ? 2 : 3;
    if (size === 3) star.classList.add('bright');
    star.style.width = star.style.height = size + 'px';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    const tint = Math.random();
    if (tint < 0.16) star.classList.add('cool');
    else if (tint < 0.26) star.classList.add('warm');
    star.style.opacity = (0.3 + Math.random() * 0.55).toFixed(2);
    if (!reduceMotion && !saveData && size < 3 && Math.random() < 0.18) {
      star.classList.add('tw');
      star.style.animationDuration = (3 + Math.random() * 5).toFixed(2) + 's';
      star.style.animationDelay = (-Math.random() * 8).toFixed(2) + 's';
    }
    field.appendChild(star);
  }
})();

const siteCopyStates = new WeakMap();
function copyDiscordHandle(button) {
  if (!button) return;
  if (!navigator.clipboard?.writeText) { alert('Discord username: granddom'); return; }
  let state = siteCopyStates.get(button);
  if (!state) {
    state = { html: button.innerHTML, live: button.getAttribute('aria-live') };
    siteCopyStates.set(button, state);
  }
  navigator.clipboard.writeText('granddom').then(() => {
    clearTimeout(state.timer);
    button.classList.add('copied');
    button.setAttribute('aria-live', 'polite');
    button.innerHTML = '<span>✓ Copied!</span>';
    state.timer = setTimeout(() => {
      button.classList.remove('copied');
      button.innerHTML = state.html;
      if (state.live === null) button.removeAttribute('aria-live');
      else button.setAttribute('aria-live', state.live);
    }, 2000);
  }).catch(() => alert('Discord username: granddom'));
}
