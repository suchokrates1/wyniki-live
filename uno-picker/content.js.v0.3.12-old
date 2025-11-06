// UNO Player Picker v0.3.12 - Fixed API + Improved UI
const API_BASE = 'https://score.vestmedia.pl';
const log = (...a) => console.log('[UNO Picker v0.3.12]', ...a);
const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
log('Init', { supportsPointer, api: API_BASE });

function storageGet(keys) {
  if (!chrome?.storage?.local?.get) return Promise.resolve({});
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        const err = chrome?.runtime?.lastError;
        if (err) { log('storage.get failed', err); resolve({}); return; }
        resolve(result || {});
      });
    } catch (err) { log('storage.get error', err); resolve({}); }
  });
}

function storageSet(items) {
  if (!chrome?.storage?.local?.set) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, () => {
        const err = chrome?.runtime?.lastError;
        if (err) { log('storage.set failed', err); resolve(false); return; }
        resolve(true);
      });
    } catch (err) { log('storage.set error', err); resolve(false); }
  });
}

let cachedPlayers = [];
let cacheTime = 0;
const CACHE_TTL = 300000;
let doublesMode = false;
let selectedPlayers = [];

async function fetchPlayers() {
  const now = Date.now();
  if (cachedPlayers.length > 0 && (now - cacheTime) < CACHE_TTL) {
    log('Cache hit:', cachedPlayers.length);
    return cachedPlayers;
  }
  try {
    log('Fetching from', API_BASE + '/api/players');
    const res = await fetch(API_BASE + '/api/players');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    log('API response:', data);
    const arr = Array.isArray(data?.players) ? data.players : (Array.isArray(data) ? data : []);
    cachedPlayers = arr.map(p => ({
      name: String(p.name || '').trim(),
      flag: String(p.flag || '').toLowerCase(),
      flagUrl: p.flagUrl || p.flag_url || ''
    })).filter(p => p.name);
    cacheTime = now;
    log('Loaded players:', cachedPlayers.length);
    return cachedPlayers;
  } catch (e) {
    log('Fetch failed:', e);
    return [];
  }
}

function formatDoublesName(players) {
  if (!Array.isArray(players) || players.length !== 2) return '';
  return players.map(p => p.name.split(' ').filter(Boolean).pop()).join(' / ');
}

async function commitInputValue(el, value) {
  const val = value == null ? '' : String(value);
  try { el.focus({ preventScroll: true }); } catch {}
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (desc?.set) desc.set.call(el, val); else el.value = val;
  const opts = { bubbles: true, cancelable: true, composed: true };
  try { el.dispatchEvent(new InputEvent('beforeinput', { ...opts, inputType: 'insertReplacementText', data: val })); } catch { el.dispatchEvent(new Event('beforeinput', opts)); }
  el.dispatchEvent(new Event('input', opts));
  try { el.dispatchEvent(new InputEvent('input', { ...opts, inputType: 'insertText', data: val })); } catch {}
  const mkKey = (t) => {
    let e;
    try { e = new KeyboardEvent(t, { ...opts, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }); }
    catch { e = document.createEvent('KeyboardEvent'); e.initKeyboardEvent?.(t, true, true, window, 'Enter', 0, '', false, ''); }
    try { Object.defineProperties(e, { keyCode: {value:13}, which: {value:13} }); } catch {}
    return e;
  };
  el.dispatchEvent(mkKey('keydown')); el.dispatchEvent(mkKey('keypress')); el.dispatchEvent(mkKey('keyup'));
  await new Promise(r => setTimeout(r, 80));
  try { el.dispatchEvent(new FocusEvent('blur', opts)); } catch { el.dispatchEvent(new Event('blur', opts)); }
  try { el.blur(); } catch {}
  await new Promise(r => setTimeout(r, 40));
  el.dispatchEvent(new Event('change', opts));
}

let openPopover = null;

function closePopover() {
  if (openPopover) {
    try { openPopover.remove(); } catch {}
    openPopover = null;
  }
}

async function showPickerFor(input, letter) {
  closePopover();
  const stored = await storageGet(['selectedPlayers']);
  selectedPlayers = stored.selectedPlayers || [];
  const players = await fetchPlayers();
  log('Players to show:', players.length);
  if (players.length === 0) {
    log('WARNING: No players loaded from API!');
  }
  const popover = document.createElement('div');
  popover.className = 'uno-picker-popover';
  openPopover = popover;
  const inputRect = input.getBoundingClientRect();
  const vh = window.innerHeight;
  const below = vh - inputRect.bottom;
  const above = inputRect.top;
  if (below < 400 && above > below) {
    popover.style.bottom = (vh - inputRect.top) + 'px';
  } else {
    popover.style.top = inputRect.bottom + 'px';
  }
  popover.style.left = inputRect.left + 'px';
  popover.style.width = Math.max(inputRect.width, 500) + 'px';
  popover.style.minWidth = '500px';
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Szukaj gracza...';
  search.className = 'picker-search';
  search.style.cssText = 'width:100%;box-sizing:border-box;min-height:44px;font-size:16px;padding:12px';
  const list = document.createElement('div');
  list.className = 'picker-list';
  list.style.maxHeight = '400px';
  list.style.overflowY = 'auto';
  popover.appendChild(search);
  popover.appendChild(list);
  document.body.appendChild(popover);
  const render = (q = '') => {
    list.innerHTML = '';
    const qq = q.toLowerCase().trim();
    const filt = qq ? players.filter(p => p.name.toLowerCase().includes(qq)) : players;
    if (filt.length === 0) {
      const nr = document.createElement('div');
      nr.style.cssText = 'text-align:center;padding:20px;color:#999';
      nr.textContent = players.length === 0 ? 'Brak graczy (sprawdź API)' : 'Brak wyników';
      list.appendChild(nr);
      return;
    }
    filt.forEach(player => {
      const row = document.createElement('div');
      row.className = 'picker-row';
      row.style.cssText = 'min-height:50px;display:flex;align-items:center;padding:12px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;border-bottom:1px solid #eee';
      if (player.flag) {
        const f = document.createElement('span');
        f.textContent = player.flag;
        f.style.cssText = 'margin-right:12px;font-size:24px;min-width:32px;text-align:center';
        row.appendChild(f);
      }
      const n = document.createElement('span');
      n.textContent = player.name;
      n.style.flex = '1';
      n.style.fontSize = '15px';
      row.appendChild(n);
      if (doublesMode) {
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.checked = selectedPlayers.some(p => p.name === player.name);
        c.style.cssText = 'width:20px;height:20px;margin-left:10px;pointer-events:none';
        row.appendChild(c);
      }
      const handleSel = async () => {
        if (doublesMode) {
          const idx = selectedPlayers.findIndex(p => p.name === player.name);
          if (idx >= 0) {
            selectedPlayers.splice(idx, 1);
          } else {
            if (selectedPlayers.length < 2) {
              selectedPlayers.push(player);
            }
          }
          await storageSet({ selectedPlayers });
          if (selectedPlayers.length === 2) {
            await commitInputValue(input, formatDoublesName(selectedPlayers));
            log('Debel ' + letter + ':', formatDoublesName(selectedPlayers));
            selectedPlayers = [];
            await storageSet({ selectedPlayers });
            closePopover();
          } else {
            render(search.value);
          }
        } else {
          await commitInputValue(input, player.name);
          log('Gracz ' + letter + ':', player.name);
          closePopover();
        }
      };
      if (supportsPointer) {
        let ts = null;
        row.addEventListener('pointerdown', (e) => {
          if (e.pointerType !== 'touch') return;
          ts = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        }, { passive: true });
        row.addEventListener('pointermove', (e) => {
          if (!ts || ts.id !== e.pointerId) return;
          if (Math.abs(e.clientX - ts.x) > 10 || Math.abs(e.clientY - ts.y) > 10) ts.moved = true;
        }, { passive: true });
        row.addEventListener('pointercancel', (e) => {
          if (!ts || ts.id !== e.pointerId) return;
          ts = null;
        }, { passive: true });
        row.addEventListener('pointerup', (e) => {
          if (e.pointerType !== 'touch' || !ts || ts.id !== e.pointerId) return;
          const m = ts.moved;
          ts = null;
          if (!m) Promise.resolve().then(handleSel);
        }, { passive: true });
      } else {
        row.addEventListener('touchend', () => {
          Promise.resolve().then(handleSel);
        }, { passive: true });
      }
      row.addEventListener('click', handleSel);
      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = '#f5f5f5';
      });
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = '';
      });
      list.appendChild(row);
    });
  };
  render();
  search.addEventListener('input', () => render(search.value));
  try { search.focus({ preventScroll: true }); } catch { search.focus(); }
  const oc = (e) => {
    if (!popover.contains(e.target) && e.target !== input) {
      closePopover();
      document.removeEventListener('click', oc, true);
    }
  };
  setTimeout(() => document.addEventListener('click', oc, true), 100);
}

function getPlayerInputsFromSection() {
  if (!document.body) {
    log('No body');
    return { A: null, B: null };
  }
  const hNodes = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const v = n.nodeValue?.trim();
      return (!v || !/^player\s+names$/i.test(v)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  let n;
  while ((n = w.nextNode())) hNodes.push(n);
  if (!hNodes.length) {
    log('Player Names not found');
    return { A: null, B: null };
  }
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return el.offsetParent !== null && r.width > 5 && r.height > 10;
  };
  for (const tn of hNodes) {
    let box = tn.parentElement;
    for (let i = 0; i < 5 && box; i++) {
      const inps = Array.from(box.querySelectorAll('input[type="text"], input:not([type])')).filter(vis);
      if (inps.length >= 2) {
        log('Found inputs:', inps.length);
        return { A: inps[0], B: inps[1] };
      }
      box = box.parentElement;
    }
  }
  log('Inputs not found');
  return { A: null, B: null };
}

async function ensureUI() {
  if (!document.body || !document.body.querySelector) return;
  const stored = await storageGet(['doublesMode']);
  doublesMode = stored.doublesMode || false;
  const { A, B } = getPlayerInputsFromSection();
  document.querySelectorAll('.uno-picker-button, .uno-doubles-toggle').forEach(b => {
    if (!b.previousSibling || !b.previousSibling.matches?.('input, button')) {
      b.remove();
    }
  });
  const attach = (inp, ltr) => {
    if (!inp || inp.__unoWired) return;
    inp.__unoWired = true;
    if (inp.parentElement?.querySelector('.uno-picker-button')) return;
    const wrapper = document.createElement('span');
    wrapper.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:10px';
    const btn = document.createElement('button');
    btn.className = 'uno-picker-button';
    btn.type = 'button';
    btn.textContent = 'Wybierz ' + ltr;
    btn.style.cssText = 'min-height:40px;min-width:100px;padding:8px 16px;font-size:14px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent';
    const toggleLabel = document.createElement('label');
    toggleLabel.style.cssText = 'display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;font-size:13px;white-space:nowrap';
    const toggleCheckbox = document.createElement('input');
    toggleCheckbox.type = 'checkbox';
    toggleCheckbox.checked = doublesMode;
    toggleCheckbox.className = 'uno-doubles-toggle';
    toggleCheckbox.style.cssText = 'width:18px;height:18px;cursor:pointer';
    const toggleText = document.createElement('span');
    toggleText.textContent = 'Debel';
    toggleLabel.appendChild(toggleCheckbox);
    toggleLabel.appendChild(toggleText);
    wrapper.appendChild(btn);
    wrapper.appendChild(toggleLabel);
    inp.parentElement?.insertBefore(wrapper, inp.nextSibling);
    toggleCheckbox.addEventListener('change', async () => {
      doublesMode = toggleCheckbox.checked;
      selectedPlayers = [];
      await storageSet({ doublesMode, selectedPlayers });
      log('Doubles mode:', doublesMode);
      document.querySelectorAll('.uno-doubles-toggle').forEach(c => {
        c.checked = doublesMode;
      });
    });
    if (supportsPointer) {
      let ts = null;
      btn.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        ts = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      }, { passive: true });
      btn.addEventListener('pointermove', (e) => {
        if (!ts || ts.id !== e.pointerId) return;
        if (Math.abs(e.clientX - ts.x) > 10 || Math.abs(e.clientY - ts.y) > 10) ts.moved = true;
      }, { passive: true });
      btn.addEventListener('pointercancel', (e) => {
        if (!ts || ts.id !== e.pointerId) return;
        ts = null;
      }, { passive: true });
      btn.addEventListener('pointerup', (e) => {
        if (e.pointerType !== 'touch' || !ts || ts.id !== e.pointerId) return;
        const m = ts.moved;
        ts = null;
        if (!m) {
          e.preventDefault();
          e.stopPropagation();
          showPickerFor(inp, ltr);
        }
      });
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPickerFor(inp, ltr);
    });
    inp.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      showPickerFor(inp, ltr);
    }, true);
    inp.addEventListener('focus', () => {
      showPickerFor(inp, ltr);
    }, true);
    log('Attached ' + ltr);
  };
  attach(A, 'A');
  attach(B, 'B');
}

const ready = (fn) => {
  log('ready', { state: document.readyState });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
};

log('Init script');
ready(() => {
  log('DOM ready');
  const mo = new MutationObserver(() => {
    try { ensureUI(); } catch (e) { log('Error:', e); }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  ensureUI();
  setTimeout(() => { log('Retry 1s'); ensureUI(); }, 1000);
  setTimeout(() => { log('Retry 3s'); ensureUI(); }, 3000);
});