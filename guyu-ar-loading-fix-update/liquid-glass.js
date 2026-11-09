(() => {
  'use strict';
  const selector = '.ai-dock-button,.mobile-nav,.slide-entry,.slide-thumb,.welcome-history,.primary-btn,.secondary-btn,.catalog-select,.camera-toggle,.journey-bar button,.catalog-filters button,.choice-row button,.camera-zones button,.rating-options button,.life-button,.life-round,.life-feelings button,.life-modal-close,.mechanism-controls button:not(#mechanism-replay),.skin-loupe';
  const nav = document.querySelector('.mobile-nav');
  const lens = document.createElement('span'); lens.className = 'glass-nav-lens'; lens.setAttribute('aria-hidden', 'true'); nav?.prepend(lens);
  let workFrame = null, glintFrame = null, glintTarget = null, pressed = null, pendingPointer = null;
  function decorate() {
    document.querySelectorAll(selector).forEach(element => {
      if (element.classList.contains('guyu-glass')) return;
      if (getComputedStyle(element).position === 'static') element.classList.add('glass-local');
      element.classList.add('guyu-glass');
    });
  }
  function updateLens() {
    const active = nav?.querySelector('button[aria-current="page"]');
    if (!active || !nav.offsetWidth) return;
    nav.style.setProperty('--nav-lens-left', `${active.offsetLeft}px`);
    nav.style.setProperty('--nav-lens-width', `${active.offsetWidth}px`);
  }
  function schedule() {
    if (workFrame !== null) return;
    workFrame = requestAnimationFrame(() => { workFrame = null; decorate(); updateLens(); });
  }
  function setGlint() {
    glintFrame = null;
    if (!pendingPointer) return;
    const { target, x, y } = pendingPointer; pendingPointer = null;
    if (!target.isConnected) return;
    const rect = target.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    if (glintTarget && glintTarget !== target) { glintTarget.style.removeProperty('--glass-x'); glintTarget.style.removeProperty('--glass-y'); }
    glintTarget = target;
    target.style.setProperty('--glass-x', `${Math.max(0, Math.min(100, (x - rect.left) / rect.width * 100)).toFixed(1)}%`);
    target.style.setProperty('--glass-y', `${Math.max(0, Math.min(100, (y - rect.top) / rect.height * 100)).toFixed(1)}%`);
  }
  function follow(event) {
    const target = event.target.closest?.('.guyu-glass'); if (!target) return;
    // Pointer glints are decorative; dragging, scrolling and camera events remain untouched.
    pendingPointer = { target, x: event.clientX, y: event.clientY };
    if (glintFrame === null) glintFrame = requestAnimationFrame(setGlint);
  }
  function release() { pressed?.classList.remove('glass-down'); pressed = null; }
  document.addEventListener('pointermove', follow, { passive: true });
  document.addEventListener('pointerdown', event => {
    follow(event); release();
    const target = event.target.closest?.('button.guyu-glass');
    if (target && !target.disabled) { pressed = target; target.classList.add('glass-down'); }
  }, { passive: true });
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key) || event.repeat) return;
    const target = event.target.closest?.('button.guyu-glass');
    if (target && !target.disabled) { release(); pressed = target; target.classList.add('glass-down'); }
  });
  document.addEventListener('keyup', event => { if (['Enter', ' '].includes(event.key)) release(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  window.addEventListener('blur', release);
  window.addEventListener('resize', schedule, { passive: true });
  if (nav && window.ResizeObserver) new ResizeObserver(schedule).observe(nav);
  new MutationObserver(changes => {
    if (changes.some(change => change.type === 'attributes' || [...change.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE))) schedule();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  decorate(); schedule();
})();
