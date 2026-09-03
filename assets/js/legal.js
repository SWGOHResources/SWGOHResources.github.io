const navToggle = document.getElementById('navToggle');
const mobilePanel = document.getElementById('mobilePanel');
const aboutModal = document.getElementById('aboutModal');

function closeMobilePanel(){
  if(!navToggle || !mobilePanel) return;
  navToggle.classList.remove('open');
  mobilePanel.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
}

navToggle?.addEventListener('click', () => {
  const willOpen = !mobilePanel.classList.contains('open');
  navToggle.classList.toggle('open', willOpen);
  mobilePanel.classList.toggle('open', willOpen);
  navToggle.setAttribute('aria-expanded', String(willOpen));
});

function closeAboutModal(){
  if(!aboutModal) return;
  aboutModal.classList.remove('open');
  aboutModal.setAttribute('aria-hidden', 'true');
}

function openAboutModal(){
  if(!aboutModal) return;
  closeMobilePanel();
  aboutModal.classList.add('open');
  aboutModal.setAttribute('aria-hidden', 'false');
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
  if(event.key === 'Escape') closeAboutModal();
});

function copyDiscordHandle(button){
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