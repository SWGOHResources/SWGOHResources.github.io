(() => {
  const detail = document.getElementById('dayDetail');
  const original = document.getElementById('previewCurrentLayout');
  const full = document.getElementById('previewFullImage');
  function applyLayout(){
    const expanded = document.body.classList.contains('full-image-preview');
    original.setAttribute('aria-pressed', String(!expanded));
    full.setAttribute('aria-pressed', String(expanded));
  }
  function selectLayout(expanded){
    document.body.classList.toggle('full-image-preview', expanded);
    applyLayout();
  }
  function prepareSquareArt(){
    detail.querySelectorAll('.xcard-art:not(.fit) > img').forEach(img => {
      if(img.dataset.layoutReady) return;
      img.dataset.layoutReady = 'true';
      const prepare = () => {
        if(!img.naturalWidth || img.naturalWidth !== img.naturalHeight) return;
        const art = img.parentElement;
        if(art.querySelector('.art-fill')) return;
        const fill = document.createElement('div');
        fill.className = 'art-fill';
        fill.setAttribute('aria-hidden', 'true');
        fill.style.backgroundImage = `url("${img.src}")`;
        art.insertBefore(fill, img);
      };
      if(img.complete) prepare();
      else img.addEventListener('load', prepare, { once:true });
    });
  }
  original.addEventListener('click', () => selectLayout(false));
  full.addEventListener('click', () => selectLayout(true));
  new MutationObserver(prepareSquareArt).observe(detail, { childList:true, subtree:true });
  prepareSquareArt();
  applyLayout();
})();
