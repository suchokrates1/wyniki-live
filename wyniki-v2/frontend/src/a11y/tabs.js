/* ============================================================
   WAI-ARIA Tabs keyboard support (roving tabindex + arrows)
   ------------------------------------------------------------
   Adds the APG keyboard pattern to every [role="tablist"] on the
   page without per-tablist wiring:
     - Left/Right (and Up/Down) move focus between tabs, wrapping.
     - Home/End jump to first/last tab.
     - Roving tabindex: only the selected (or focused) tab is a Tab
       stop; the rest are tabindex=-1 so Tab moves on to the panel.
   Manual activation: arrows only move focus; Enter/Space activates
   (native <button> behaviour), so arrowing never triggers data
   fetches. Uses event delegation + a scoped MutationObserver so it
   keeps working across Alpine re-renders and dynamic tablists.
   ============================================================ */

function tabsOf(tablist) {
  return Array.from(tablist.querySelectorAll('[role="tab"]'))
    .filter((tab) => tab.closest('[role="tablist"]') === tablist);
}

function selectedIndex(tabs) {
  const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  return i >= 0 ? i : 0;
}

// Make exactly one tab the Tab stop: the focused tab if focus is inside
// this tablist, otherwise the selected one.
function setRoving(tablist) {
  const tabs = tabsOf(tablist);
  if (!tabs.length) return;
  let anchor = tabs.indexOf(document.activeElement);
  if (anchor < 0) anchor = selectedIndex(tabs);
  tabs.forEach((tab, i) => {
    const ti = i === anchor ? 0 : -1;
    if (tab.tabIndex !== ti) tab.tabIndex = ti;
  });
}

function focusTabAt(tabs, index) {
  const n = tabs.length;
  const i = ((index % n) + n) % n;
  tabs.forEach((tab, j) => { tab.tabIndex = j === i ? 0 : -1; });
  tabs[i].focus();
}

function onKeydown(event) {
  const tab = event.target.closest && event.target.closest('[role="tab"]');
  if (!tab) return;
  const tablist = tab.closest('[role="tablist"]');
  if (!tablist) return;
  const tabs = tabsOf(tablist);
  const i = tabs.indexOf(tab);
  if (i < 0) return;

  let target;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown': target = i + 1; break;
    case 'ArrowLeft':
    case 'ArrowUp': target = i - 1; break;
    case 'Home': target = 0; break;
    case 'End': target = tabs.length - 1; break;
    default: return;
  }
  event.preventDefault();
  focusTabAt(tabs, target);
}

function onFocusin(event) {
  const tab = event.target.closest && event.target.closest('[role="tab"]');
  if (!tab) return;
  const tablist = tab.closest('[role="tablist"]');
  if (tablist) setRoving(tablist);
}

export function initTabsA11y() {
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('focusin', onFocusin);

  const applyAll = () => document.querySelectorAll('[role="tablist"]').forEach(setRoving);
  applyAll();
  requestAnimationFrame(applyAll);
  setTimeout(applyAll, 300);

  // Re-apply roving when tabs are activated (aria-selected flips) or when a
  // tablist appears / re-renders its tabs (Alpine x-for). Scoped so ordinary
  // score-text updates don't trigger work.
  const observer = new MutationObserver((mutations) => {
    const dirty = new Set();
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'aria-selected') {
        const tl = m.target.closest && m.target.closest('[role="tablist"]');
        if (tl) dirty.add(tl);
        continue;
      }
      if (m.type !== 'childList') continue;
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches('[role="tablist"]')) dirty.add(node);
        if (node.querySelectorAll) node.querySelectorAll('[role="tablist"]').forEach((t) => dirty.add(t));
        if (node.matches && node.matches('[role="tab"]')) {
          const tl = node.closest('[role="tablist"]');
          if (tl) dirty.add(tl);
        }
      });
    }
    dirty.forEach((tl) => setRoving(tl));
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-selected'],
  });
}
