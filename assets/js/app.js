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

function openScheduleModal(){
  openModal(scheduleModal);
  scrollScheduleToToday();
}

document.getElementById('openFullScheduleBtn')?.addEventListener('click', openScheduleModal);
document.getElementById('openFullScheduleBtnMobile')?.addEventListener('click', openScheduleModal);
document.getElementById('footerFullScheduleBtn')?.addEventListener('click', openScheduleModal);
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

/* Guild TB picker (called from TB cards in the explorer and the
   dashboard status card). The pick is stored per rotation side. */
function setTbChoice(id, side){
  if(tbSetChoice(id, side)) renderAll();
}

/* Mobile Nav Panel */
const navToggle = document.getElementById('navToggle');

const mobilePanel = document.getElementById('mobilePanel');

function closeMobilePanel(){ navToggle.classList.remove('open'); mobilePanel.classList.remove('open'); navToggle.setAttribute('aria-expanded', 'false'); }
navToggle.onclick = () => {
  const willOpen = !mobilePanel.classList.contains('open');
  navToggle.classList.toggle('open', willOpen);
  mobilePanel.classList.toggle('open', willOpen);
  navToggle.setAttribute('aria-expanded', String(willOpen));
};

/* Display timezone picker (header + mobile panel). Defaults to the
   device's timezone; the choice persists and re-renders all dates. */
function tzSelectLabel(value){
  return value === 'local' ? `Local (${deviceTimeZone()})` : value.replace(/_/g, ' ');
}

function populateTzSelect(sel){
  if(!sel) return;
  const current = getTimeZoneSetting();
  const inList = v => TIMEZONE_OPTIONS.includes(v) || UTC_OFFSET_OPTIONS.includes(v);
  sel.innerHTML = `<option value="local">${tzSelectLabel('local')}</option>`
    + `<optgroup label="Presets">`
    + TIMEZONE_OPTIONS.map(z => `<option value="${z}">${z === 'UTC' ? 'UTC (game time)' : z.replace(/_/g, ' ')}</option>`).join('')
    + `</optgroup><optgroup label="Manual UTC offset">`
    + UTC_OFFSET_OPTIONS.map(z => `<option value="${z}">${z}</option>`).join('')
    + `</optgroup>`;
  sel.value = inList(current) ? current : 'local';
}

function syncTzSelects(){
  const current = getTimeZoneSetting();
  const inList = v => TIMEZONE_OPTIONS.includes(v) || UTC_OFFSET_OPTIONS.includes(v);
  const value = inList(current) ? current : 'local';
  ['tzSelect', 'tzSelectMobile'].forEach(id => {
    const sel = document.getElementById(id);
    if(sel && sel.options.length && sel.value !== value) sel.value = value;
  });
}

function onTzChange(sel){
  if(setTimeZone(sel.value)) renderAll();
  syncTzSelects();
}

['tzSelect', 'tzSelectMobile'].forEach(id => {
  const sel = document.getElementById(id);
  if(!sel) return;
  populateTzSelect(sel);
  sel.addEventListener('change', () => onTzChange(sel));
});

const footerMetaEl = document.getElementById('footerMeta');
if(footerMetaEl){
  footerMetaEl.textContent = `Resets 18:00 UTC daily · showing ${tzDisplayName()} · loaded ${new Date().toLocaleString('en-GB', { timeZone: tz(), hour12: false })}`;
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
