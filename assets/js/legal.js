const navToggle = document.getElementById('navToggle');
const mobilePanel = document.getElementById('mobilePanel');
const aboutModal = document.getElementById('aboutModal');
let lastFocusedElement = null;

function closeMobilePanel(){
  if(!navToggle || !mobilePanel) return;
  navToggle.classList.remove('open');
  mobilePanel.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
}

navToggle?.addEventListener('click', () => {
  if(!mobilePanel) return;
  const willOpen = !mobilePanel.classList.contains('open');
  navToggle.classList.toggle('open', willOpen);
  mobilePanel.classList.toggle('open', willOpen);
  navToggle.setAttribute('aria-expanded', String(willOpen));
});

function closeAboutModal(){
  if(!aboutModal) return;
  aboutModal.classList.remove('open');
  aboutModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  lastFocusedElement?.focus();
  lastFocusedElement = null;
}

function openAboutModal(){
  if(!aboutModal) return;
  lastFocusedElement = document.activeElement;
  closeMobilePanel();
  aboutModal.classList.add('open');
  aboutModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  aboutModal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
}

document.getElementById('openAboutBtnHeader')?.addEventListener('click', openAboutModal);
document.getElementById('openAboutBtnMobile')?.addEventListener('click', openAboutModal);
document.getElementById('openAboutBtnFooter')?.addEventListener('click', openAboutModal);
document.getElementById('closeAboutBtn')?.addEventListener('click', closeAboutModal);
document.getElementById('closeAboutBtn2')?.addEventListener('click', closeAboutModal);
aboutModal?.addEventListener('click', event => {
  if(event.target === aboutModal) closeAboutModal();
});
document.addEventListener('keydown', event => {
  if(!aboutModal?.classList.contains('open')) return;
  if(event.key === 'Escape') {
    closeAboutModal();
    return;
  }
  if(event.key !== 'Tab') return;
  const focusables = Array.from(aboutModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
  if(!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if(event.shiftKey && document.activeElement === first) {
    last.focus();
    event.preventDefault();
  } else if(!event.shiftKey && document.activeElement === last) {
    first.focus();
    event.preventDefault();
  }
});

function copyDiscordHandle(button){
  if(!button || !navigator.clipboard || !navigator.clipboard.writeText){
    alert('Discord username: granddom');
    return;
  }
  navigator.clipboard.writeText('granddom').then(() => {
    const originalText = button.innerHTML;
    button.classList.add('copied');
    button.innerHTML = '<span>✓ Copied!</span>';
    setTimeout(() => {
      button.classList.remove('copied');
      button.innerHTML = originalText;
    }, 2000);
  }).catch(() => alert('Discord username: granddom'));
}