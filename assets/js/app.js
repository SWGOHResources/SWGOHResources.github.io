/* APP — wiring, countdown, modals, init. Depends on render.js globals. Loaded last. */

function tickCountdown(){
  const now = new Date();
  const nowMs = now.getTime();
  
  // Standard daily changeover at 18:00 UTC
  let nextChangeoverMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18, 0, 0, 0);
  if (nowMs >= nextChangeoverMs) {
    nextChangeoverMs += 86400000;
  }

  const diff = nextChangeoverMs - nowMs;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  const pad = n => String(n).padStart(2, '0');
  document.getElementById('countdown').textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;

  // Refresh automatically if 18:00 UTC or 21:00 UTC changeover just occurred
  // (compare against the most recent past changeover, not the next future one)
  const prevStdChangeoverMs = nextChangeoverMs - 86400000;
  let prevGacChangeoverMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0, 0);
  if (nowMs < prevGacChangeoverMs) prevGacChangeoverMs -= 86400000;
  if (nowMs - prevStdChangeoverMs < 2000 || nowMs - prevGacChangeoverMs < 2000) {
    renderAll();
  }
}

const scheduleModal = document.getElementById('fullScheduleModal');

const aboutModal = document.getElementById('aboutModal');

let lastFocusedElement = null;

function openModal(modalEl) {
  if (!modalEl) return;
  lastFocusedElement = document.activeElement;
  modalEl.classList.add('open');
  modalEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  closeMobilePanel();

  const focusables = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusables.length) focusables[0].focus();
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('open');
  modalEl.setAttribute('aria-hidden', 'true');

  if (!document.querySelector('.modal-backdrop.open')) {
    document.body.classList.remove('modal-open');
  }

  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

// Trap Focus Inside Open Modals & Close on Escape Key
document.addEventListener('keydown', e => {
  const openModalEl = document.querySelector('.modal-backdrop.open');
  if (!openModalEl) return;

  if (e.key === 'Escape') {
    closeModal(openModalEl);
    return;
  }

  if (e.key === 'Tab') {
    const focusables = Array.from(openModalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }
});

document.getElementById('openFullScheduleBtn')?.addEventListener('click', () => openModal(scheduleModal));
document.getElementById('openFullScheduleBtnMobile')?.addEventListener('click', () => openModal(scheduleModal));
document.getElementById('footerFullScheduleBtn')?.addEventListener('click', () => openModal(scheduleModal));
document.getElementById('closeFullScheduleBtn')?.addEventListener('click', () => closeModal(scheduleModal));

document.getElementById('openAboutBtnHeader')?.addEventListener('click', () => openModal(aboutModal));
document.getElementById('openAboutBtnMobile')?.addEventListener('click', () => openModal(aboutModal));
document.getElementById('closeAboutBtn')?.addEventListener('click', () => closeModal(aboutModal));
document.getElementById('closeAboutBtn2')?.addEventListener('click', () => closeModal(aboutModal));

scheduleModal.addEventListener('click', e => { if(e.target === scheduleModal) closeModal(scheduleModal); });
aboutModal.addEventListener('click', e => { if(e.target === aboutModal) closeModal(aboutModal); });

function copyDiscordHandle(btnEl) {
  navigator.clipboard.writeText('granddom').then(() => {
    const originalText = btnEl.innerHTML;
    btnEl.classList.add('copied');
    btnEl.innerHTML = `<span>✓ Copied!</span>`;
    setTimeout(() => {
      btnEl.classList.remove('copied');
      btnEl.innerHTML = originalText;
    }, 2000);
  }).catch(() => {
    alert('Discord username: granddom');
  });
}

/* Mobile Nav Panel */
const navToggle = document.getElementById('navToggle');

const mobilePanel = document.getElementById('mobilePanel');

function closeMobilePanel(){ navToggle.classList.remove('open'); mobilePanel.classList.remove('open'); }
navToggle.onclick = () => {
  navToggle.classList.toggle('open');
  mobilePanel.classList.toggle('open');
};

const footerMetaEl = document.getElementById('footerMeta');
if(footerMetaEl){
  footerMetaEl.textContent = `Resets 18:00 UTC daily · page loaded ${new Date().toLocaleString('en-GB', { timeZone: 'UTC', hour12: false })} UTC`;
}

const footerYearEl = document.getElementById('footerYear');
if(footerYearEl){ footerYearEl.textContent = `© ${new Date().getFullYear()} SWGOH::RESOURCES`; }

/* Starfield Background */
(function(){
  const field = document.getElementById('starfield');
  if(!field) return;
  for(let i = 0; i < 50; i++){
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.animationDelay = (Math.random() * 4.5).toFixed(2) + 's';
    field.appendChild(s);
  }
})();

renderAll();
tickCountdown();
setInterval(tickCountdown, 1000);
// Skip background re-renders while the tab is hidden; the next visible
// tick catches up. Bump ASSET_VERSION in index.html on deploy so browsers
// fetch fresh CSS/JS instead of serving cached copies.
setInterval(() => { if(!document.hidden) renderAll(); }, 60000);
document.addEventListener('visibilitychange', () => { if(!document.hidden) renderAll(); });
