export function subnavOverflowState({ scrollLeft = 0, scrollWidth = 0, clientWidth = 0 } = {}) {
  const hidden = scrollWidth - clientWidth;
  if (hidden <= 1) return { start: false, end: false };
  return {
    start: scrollLeft > 1,
    end: scrollLeft < hidden - 1,
  };
}

export function subnavRevealDelta({ scrollLeft = 0, clientWidth = 0, tabLeft = 0, tabWidth = 0 } = {}) {
  const viewRight = scrollLeft + clientWidth;
  const tabRight = tabLeft + tabWidth;
  if (tabLeft < scrollLeft) return tabLeft - scrollLeft;
  if (tabRight > viewRight) return tabRight - viewRight;
  return 0;
}

export function revealActiveSubnavTab(el) {
  const active = el?.querySelector?.('[aria-selected="true"]');
  if (!el || !active) return;
  const row = el.getBoundingClientRect();
  const tab = active.getBoundingClientRect();
  if (tab.left < row.left - 1) el.scrollLeft -= row.left - tab.left;
  else if (tab.right > row.right + 1) el.scrollLeft += tab.right - row.right;
}

export function applySubnavOverflow(el) {
  if (!el) return { start: false, end: false };
  const state = subnavOverflowState(el);
  el.classList.toggle('can-scroll-start', state.start);
  el.classList.toggle('can-scroll-end', state.end);
  return state;
}

export function bindSubnavOverflow(el) {
  if (!el || el.dataset.overflowBound === '1') return () => {};
  el.dataset.overflowBound = '1';
  const update = () => applySubnavOverflow(el);
  const sync = () => {
    revealActiveSubnavTab(el);
    update();
  };
  sync();
  el.addEventListener('scroll', update, { passive: true });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
  observer?.observe(el);
  for (const child of el.children) observer?.observe(child);
  const selected = typeof MutationObserver === 'function'
    ? new MutationObserver(sync)
    : null;
  selected?.observe(el, { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });
  return () => {
    el.removeEventListener('scroll', update);
    observer?.disconnect();
    selected?.disconnect();
    delete el.dataset.overflowBound;
  };
}
