(() => {
  const toggle = document.getElementById('navToggle');
  const panel = document.getElementById('mobilePanel');
  if (!toggle || !panel) return;
  const label = toggle.querySelector('.nav-label');
  const mobile = window.matchMedia('(max-width: 760px)');
  function setOpen(open) {
    toggle.classList.toggle('open', open);
    panel.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (label) label.textContent = open ? 'Close' : 'Menu';
  }
  toggle.addEventListener('click', event => {
    event.stopImmediatePropagation();
    setOpen(!panel.classList.contains('open'));
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.top-header')) setOpen(false);
  });
  panel.addEventListener('click', event => {
    if (event.target.closest('a, button')) setOpen(false);
  });
  document.querySelector('.top-header').addEventListener('focusout', event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  });
  mobile.addEventListener('change', () => setOpen(false));
  new MutationObserver(() => {
    const open = panel.classList.contains('open');
    if (label) label.textContent = open ? 'Close' : 'Menu';
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  setOpen(false);
})();
