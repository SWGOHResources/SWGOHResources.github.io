/* APP — wiring, countdown, modals, init. Depends on render.js globals. Loaded last. */

function tickCountdown(){
  const now = new Date();
  const nowMs = now.getTime();
  const stdH = (typeof stdHour === 'function') ? stdHour() : 18;
  const gacH = (typeof gacHour === 'function') ? gacHour() : 21;

  // Standard daily changeover (STD_CHANGEOVER_HOUR_UTC)
  let nextChangeoverMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), stdH, 0, 0, 0);
  if (nowMs >= nextChangeoverMs) {
    nextChangeoverMs += 86400000;
  }

  const diff = nextChangeoverMs - nowMs;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  const pad = n => String(n).padStart(2, '0');
  const cdEl = document.getElementById('countdown');
  if(cdEl) cdEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;

  // Refresh automatically if a standard or GAC changeover just occurred
  // (compare against the most recent past changeover, not the next future one)
  let prevStdChangeoverMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), stdH, 0, 0, 0);
  if (nowMs < prevStdChangeoverMs) prevStdChangeoverMs -= 86400000;
  let prevGacChangeoverMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), gacH, 0, 0, 0);
  if (nowMs < prevGacChangeoverMs) prevGacChangeoverMs -= 86400000;
  if (nowMs - prevStdChangeoverMs < 2000 || nowMs - prevGacChangeoverMs < 2000) {
    renderAll();
  }
}

const scheduleModal = document.getElementById('fullScheduleModal');

const aboutModal = document.getElementById('aboutModal');

const cookieNotice = document.getElementById('cookieNotice');
const dismissCookieNotice = document.getElementById('dismissCookieNotice');
const COOKIE_NOTICE_KEY = 'swgoh_cookie_notice';

function hasCookie(name){
  return document.cookie.split('; ').some(cookie => cookie.startsWith(`${name}=`));
}

function dismissCookies(){
  document.cookie = `${COOKIE_NOTICE_KEY}=dismissed; max-age=15552000; path=/; SameSite=Lax`;
  if(cookieNotice) cookieNotice.hidden = true;
}

if(cookieNotice && !hasCookie(COOKIE_NOTICE_KEY)) cookieNotice.hidden = false;
if(dismissCookieNotice) dismissCookieNotice.addEventListener('click', dismissCookies);

/* Opener per modal: two modals must never stack (backdrops pile up
   and a single shared opener restores focus to the wrong place), so
   opening one closes any other — without stealing its focus restore. */
const modalOpeners = new Map();

function openModal(modalEl) {
  if (!modalEl) return;
  document.querySelectorAll('.modal-backdrop.open').forEach(other => {
    if (other !== modalEl) closeModal(other, { restoreFocus: false });
  });
  if (!modalOpeners.has(modalEl)) modalOpeners.set(modalEl, document.activeElement);
  modalEl.classList.add('open');
  modalEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  closeMobilePanel();

  const focusables = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusables.length) focusables[0].focus();
}

function closeModal(modalEl, opts) {
  if (!modalEl) return;
  const restoreFocus = !opts || opts.restoreFocus !== false;
  modalEl.classList.remove('open');
  modalEl.setAttribute('aria-hidden', 'true');

  if (!document.querySelector('.modal-backdrop.open')) {
    document.body.classList.remove('modal-open');
  }

  const opener = modalOpeners.get(modalEl);
  modalOpeners.delete(modalEl);
  if (restoreFocus && opener && document.contains(opener)) opener.focus();
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

scheduleModal?.addEventListener('click', e => { if(e.target === scheduleModal) closeModal(scheduleModal); });
aboutModal?.addEventListener('click', e => { if(e.target === aboutModal) closeModal(aboutModal); });

function copyDiscordHandle(btnEl) {
  if(!btnEl) return;
  if(!navigator.clipboard || !navigator.clipboard.writeText){
    alert('Discord username: granddom');
    return;
  }
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
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const deck = document.querySelector('.xcard-deck');
  const deckScrollLeft = deck?.scrollLeft ?? 0;
  if(tbSetChoice(id, side)){
    renderAll();
    requestAnimationFrame(() => {
      window.scrollTo(scrollX, scrollY);
      const nextDeck = document.querySelector('.xcard-deck');
      if(nextDeck) nextDeck.scrollLeft = deckScrollLeft;
    });
  }
}

/* Mobile Nav Panel (null-safe: a missing toggle must not halt init) */
const navToggle = document.getElementById('navToggle');

const mobilePanel = document.getElementById('mobilePanel');

function closeMobilePanel(){
  if(!navToggle || !mobilePanel) return;
  navToggle.classList.remove('open'); mobilePanel.classList.remove('open'); navToggle.setAttribute('aria-expanded', 'false');
}
if(navToggle && mobilePanel){
  navToggle.addEventListener('click', () => {
    const willOpen = !mobilePanel.classList.contains('open');
    navToggle.classList.toggle('open', willOpen);
    mobilePanel.classList.toggle('open', willOpen);
    navToggle.setAttribute('aria-expanded', String(willOpen));
  });
}

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
  ['tzSelect', 'tzSelectMobile'].forEach(id => {
    const sel = document.getElementById(id);
    if(!sel) return;
    // A valid zone outside the preset lists (set via console) gets a
    // dynamic option so the select shows the actual zone instead of
    // misleadingly falling back to "Local".
    if(current !== 'local' && ![...sel.options].some(o => o.value === current)){
      const opt = document.createElement('option');
      opt.value = current;
      opt.textContent = tzSelectLabel(current);
      sel.appendChild(opt);
    }
    if(sel.options.length && sel.value !== current) sel.value = current;
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

/* footerMeta is refreshed on every renderAll() via updateFooterMeta()
   (render.js) so it never goes stale after a tz change or rollover. */

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

/* Surface config mistakes early: the next era edit shows up here
   instead of as a silently wrong schedule. */
if(typeof validateScheduleConfig === 'function'){
  const configIssues = validateScheduleConfig();
  if(configIssues.length) console.warn('[swgoh-schedule] config issues:\n- ' + configIssues.join('\n- '));
}

renderAll();
tickCountdown();
setInterval(tickCountdown, 1000);
// Skip background re-renders while the tab is hidden; the next visible
// tick catches up. Bump ASSET_VERSION in index.html on deploy so browsers
// fetch fresh CSS/JS instead of serving cached copies.
setInterval(() => { if(!document.hidden) renderAll({ preserveFocus: true }); }, 60000);
document.addEventListener('visibilitychange', () => { if(!document.hidden) renderAll({ preserveFocus: true }); });
