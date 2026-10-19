(function(){
  const toggle = document.getElementById('navToggle');
  const panel = document.getElementById('mobilePanel');
  if(!toggle || !panel) return;
  const header = toggle.closest('header');
  const mobile = window.matchMedia('(max-width: 1100px)');

  function setOpen(open, restoreFocus = false){
    open = Boolean(open && mobile.matches);
    const focusInside = panel.contains(document.activeElement);
    toggle.classList.toggle('open', open);
    panel.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    panel.hidden = !open;
    panel.inert = !open;
    if(!open && (restoreFocus || focusInside)) {
      if(mobile.matches) toggle.focus();
      else (header.querySelector('.topbar-tabs [aria-current="page"]') || header.querySelector('.topbar-title'))?.focus();
    }
  }

  window.closeSiteNavigation = () => setOpen(false);
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel.addEventListener('click', event => {
    if(event.target.closest('a[href], button')) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && !panel.hidden){
      event.preventDefault();
      setOpen(false, true);
    }
  });
  document.addEventListener('click', event => {
    if(!panel.hidden && !header.contains(event.target)) setOpen(false);
  });
  header.addEventListener('focusout', event => {
    if(!panel.hidden && event.relatedTarget && !header.contains(event.relatedTarget)) setOpen(false);
  });
  mobile.addEventListener('change', () => setOpen(false));
  setOpen(false);
})();
