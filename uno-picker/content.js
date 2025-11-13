// UNO Player Picker v0.3.22 - English UI
const API_BASE = 'https://score.vestmedia.pl';
const log = (...a) => console.log('[UNO Picker v0.3.22]', ...a);
const supportsPointer = 'PointerEvent' in window;
log('Init', { api: API_BASE, supportsPointer });

function storageGet(keys) {
  if (!chrome?.storage?.local?.get) return Promise.resolve({});
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(keys, result => {
        if (chrome?.runtime?.lastError) { log('storage err:', chrome.runtime.lastError); resolve({}); return; }
        resolve(result || {});
      });
    } catch (e) { log('storage error:', e); resolve({}); }
  });
}

function storageSet(items) {
  if (!chrome?.storage?.local?.set) return Promise.resolve(false);
  return new Promise(resolve => {
    try {
      chrome.storage.local.set(items, () => {
        if (chrome?.runtime?.lastError) { log('storage set err:', chrome.runtime.lastError); resolve(false); return; }
        resolve(true);
      });
    } catch (e) { log('storage set error:', e); resolve(false); }
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
    const res = await fetch(API_BASE + '/api/players', { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    log('API response:', data);
    const arr = Array.isArray(data?.players) ? data.players : [];
    cachedPlayers = arr.map(p => ({
      name: String(p.name || '').trim(),
      flag: String(p.flag || '').toLowerCase(),
      flagUrl: p.flagUrl || p.flag_url || ''
    })).filter(p => p.name);
    cacheTime = now;
    log('Loaded players:', cachedPlayers.length, cachedPlayers);
    return cachedPlayers;
  } catch (e) {
    log('Fetch ERROR:', e);
    return [];
  }
}

function formatDoublesName(players) {
  if (!Array.isArray(players) || players.length !== 2) return '';
  // Bierz pierwsze litery każdego słowa w nazwisku
  return players.map(p => {
    const parts = p.name.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0]; // Jeśli jedno słowo, zwróć całe
    // Dla wielu słów: pierwsze litery każdego słowa, oprócz ostatniego (które bierzemy całe)
    const initials = parts.slice(0, -1).map(word => word[0].toUpperCase()).join('.');
    const lastName = parts[parts.length - 1];
    return initials ? `${initials}. ${lastName}` : lastName;
  }).join(' / ');
}

function getOverlayId() {
  const match = window.location.href.match(/app_([a-z0-9]+)/i);
  return match ? `app_${match[1].toLowerCase()}` : null;
}

async function sendFlagToUNO(playerLetter, flagUrl) {
  if (!flagUrl) return;
  const overlayId = getOverlayId();
  if (!overlayId) {
    log('No overlay ID found in URL');
    return;
  }
  const unoApiUrl = `https://app.overlays.uno/apiv2/controlapps/${overlayId}/api`;
  const fieldId = playerLetter === 'A' ? 'Player A Flag' : 'Player B Flag';
  const payload = {
    command: 'SetCustomizationField',
    fieldId: fieldId,
    value: flagUrl
  };
  try {
    log('Sending flag to UNO:', payload);
    const res = await fetch(unoApiUrl, { 
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      credentials: 'omit'
    });
    if (res.ok) {
      log('Flag sent to UNO for Player', playerLetter, ':', flagUrl);
    } else {
      log('UNO API error:', res.status, await res.text());
    }
  } catch (e) {
    log('Error sending flag to UNO:', e);
  }
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
  const mkKey = t => {
    let e;
    try { e = new KeyboardEvent(t, { ...opts, key: 'Enter', keyCode: 13, which: 13 }); }
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

let openModal = null;

function closeModal() {
  if (openModal) {
    try { openModal.remove(); } catch {}
    openModal = null;
  }
}

async function showPickerFor(input, letter) {
  closeModal();
  const stored = await storageGet(['selectedPlayers']);
  selectedPlayers = stored.selectedPlayers || [];
  const players = await fetchPlayers();
  log('Players to show:', players.length);
  if (players.length === 0) {
    alert('No players in API! Check connection to ' + API_BASE + '/api/players');
    return;
  }
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px';
  openModal = modal;
  const content = document.createElement('div');
  content.style.cssText = 'background:#2d2d2d;border-radius:8px;width:100%;max-width:800px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
  const header = document.createElement('div');
  header.style.cssText = 'padding:20px;border-bottom:1px solid #444;display:flex;justify-content:space-between;align-items:center';
  const title = document.createElement('h2');
  title.textContent = 'Select Player ' + letter + (doublesMode ? ' (doubles - pick 2)' : '');
  title.style.cssText = 'margin:0;font-size:20px;font-weight:600;color:#fff';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '';
  closeBtn.style.cssText = 'background:none;border:none;font-size:32px;cursor:pointer;padding:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:#aaa';
  closeBtn.onclick = closeModal;
  header.appendChild(title);
  header.appendChild(closeBtn);
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Search player...';
  search.style.cssText = 'width:100%;box-sizing:border-box;padding:16px 20px;font-size:16px;border:none;border-bottom:1px solid #444;background:#1a1a1a;color:#fff';
  const list = document.createElement('div');
  list.style.cssText = 'flex:1;overflow-y:auto;padding:10px 0';
  content.appendChild(header);
  content.appendChild(search);
  content.appendChild(list);
  modal.appendChild(content);
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  const render = (q = '') => {
    list.innerHTML = '';
    const qq = q.toLowerCase().trim();
    const filt = qq ? players.filter(p => p.name.toLowerCase().includes(qq)) : players;
    if (filt.length === 0) {
      const nr = document.createElement('div');
      nr.style.cssText = 'text-align:center;padding:40px 20px;color:#888;font-size:16px';
      nr.textContent = 'No results';
      list.appendChild(nr);
      return;
    }
    filt.forEach(player => {
      const isSelected = doublesMode && selectedPlayers.some(p => p.name === player.name);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;padding:16px 20px;cursor:pointer;border-bottom:1px solid #444;transition:background 0.2s;color:#fff;background:' + (isSelected ? '#007bff' : 'transparent');
      if (player.flag) {
        const f = document.createElement('span');
        f.textContent = player.flag;
        f.style.cssText = 'font-size:28px;margin-right:16px;min-width:40px;text-align:center';
        row.appendChild(f);
      }
      const n = document.createElement('span');
      n.textContent = player.name;
      n.style.cssText = 'flex:1;font-size:16px;font-weight:500;color:#fff';
      row.appendChild(n);
      if (doublesMode) {
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.checked = isSelected;
        c.style.cssText = 'width:24px;height:24px;margin-left:16px;pointer-events:none';
        row.appendChild(c);
      }
      const handleSel = async () => {
        log('handleSel for', player.name, 'doublesMode:', doublesMode);
        if (doublesMode) {
          const idx = selectedPlayers.findIndex(p => p.name === player.name);
          if (idx >= 0) {
            log('Removing player', player.name);
            selectedPlayers.splice(idx, 1);
          } else {
            if (selectedPlayers.length < 2) {
              log('Adding player', player.name);
              selectedPlayers.push(player);
            } else {
              log('Already 2 players selected');
              return;
            }
          }
          log('Selected players:', selectedPlayers.length, selectedPlayers.map(p => p.name));
          await storageSet({ selectedPlayers });
          if (selectedPlayers.length === 2) {
            await commitInputValue(input, formatDoublesName(selectedPlayers));
            log('Doubles ' + letter + ':', formatDoublesName(selectedPlayers));
            const firstPlayerFlag = selectedPlayers[0].flagUrl;
            if (firstPlayerFlag) {
              await sendFlagToUNO(letter, firstPlayerFlag);
            }
            selectedPlayers = [];
            await storageSet({ selectedPlayers });
            closeModal();
          } else {
            log('Re-rendering list');
            render(search.value);
          }
        } else {
          await commitInputValue(input, player.name);
          log('Player ' + letter + ':', player.name);
          if (player.flagUrl) {
            await sendFlagToUNO(letter, player.flagUrl);
          }
          closeModal();
        }
      };
      // Prosta obsługa kliknięcia - działa dla mouse i touch
      row.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        handleSel();
      });
      row.addEventListener('mouseenter', () => { 
        const nowSelected = doublesMode && selectedPlayers.some(p => p.name === player.name);
        if (!nowSelected) row.style.backgroundColor = '#3a3a3a'; 
      });
      row.addEventListener('mouseleave', () => { 
        const nowSelected = doublesMode && selectedPlayers.some(p => p.name === player.name);
        row.style.backgroundColor = nowSelected ? '#007bff' : ''; 
      });
      list.appendChild(row);
    });
  };
  render();
  search.addEventListener('input', () => render(search.value));
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
      return v && /^player\s+names$/i.test(v) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  let n;
  while ((n = w.nextNode())) hNodes.push(n);
  if (!hNodes.length) {
    log('Player Names not found');
    return { A: null, B: null };
  }
  const vis = el => {
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
  if (!document.body) return;
  const stored = await storageGet(['doublesMode']);
  doublesMode = stored.doublesMode || false;
  const { A, B } = getPlayerInputsFromSection();
  if (!A || !B) return;
  if (document.querySelector('.uno-global-controls')) return;
  const globalWrapper = document.createElement('div');
  globalWrapper.className = 'uno-global-controls';
  globalWrapper.style.cssText = 'margin-bottom:16px;padding:12px;background:#2d2d2d;border-radius:6px;display:flex;align-items:center;gap:12px';
  const toggleLabel = document.createElement('label');
  toggleLabel.style.cssText = 'display:flex;align-items:center;gap:12px;cursor:pointer;user-select:none;font-size:15px;font-weight:500;color:#fff;padding:8px 12px;border-radius:6px;transition:background 0.2s';
  const updateToggleStyle = () => {
    toggleLabel.style.backgroundColor = doublesMode ? '#007bff' : '#1a1a1a';
  };
  updateToggleStyle();
  const toggleCheckbox = document.createElement('input');
  toggleCheckbox.type = 'checkbox';
  toggleCheckbox.checked = doublesMode;
  toggleCheckbox.style.cssText = 'width:20px;height:20px;cursor:pointer;flex-shrink:0';
  const toggleText = document.createElement('span');
  toggleText.textContent = 'Doubles Mode (2 players)';
  toggleLabel.appendChild(toggleCheckbox);
  toggleLabel.appendChild(toggleText);
  globalWrapper.appendChild(toggleLabel);
  const targetContainer = A.parentElement?.parentElement?.parentElement;
  if (targetContainer) {
    targetContainer.insertBefore(globalWrapper, targetContainer.firstChild);
  } else {
    A.parentElement?.parentElement?.insertBefore(globalWrapper, A.parentElement);
  }
  toggleCheckbox.addEventListener('change', async () => {
    doublesMode = toggleCheckbox.checked;
    selectedPlayers = [];
    await storageSet({ doublesMode, selectedPlayers });
    updateToggleStyle();
    log('Doubles mode:', doublesMode);
  });
  const attach = (inp, ltr) => {
    if (inp.__unoWired) return;
    inp.__unoWired = true;
    if (inp.parentElement?.querySelector('.uno-picker-button')) return;
    const btn = document.createElement('button');
    btn.className = 'uno-picker-button';
    btn.type = 'button';
    btn.textContent = 'Select ' + ltr;
    btn.style.cssText = 'margin-left:10px;min-height:40px;min-width:120px;padding:10px 20px;font-size:15px;cursor:pointer;background:#007bff;color:#fff;border:none;border-radius:6px;font-weight:500';
    inp.parentElement?.insertBefore(btn, inp.nextSibling);
    if (supportsPointer) {
      let ts = null;
      btn.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch') return;
        ts = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      }, { passive: true });
      btn.addEventListener('pointermove', e => {
        if (!ts || ts.id !== e.pointerId) return;
        if (Math.abs(e.clientX - ts.x) > 10 || Math.abs(e.clientY - ts.y) > 10) ts.moved = true;
      }, { passive: true });
      btn.addEventListener('pointercancel', e => {
        if (!ts || ts.id !== e.pointerId) return;
        ts = null;
      }, { passive: true });
      btn.addEventListener('pointerup', e => {
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
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      showPickerFor(inp, ltr);
    });
    inp.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      showPickerFor(inp, ltr);
    }, true);
    inp.addEventListener('focus', () => showPickerFor(inp, ltr), true);
    log('Attached ' + ltr);
  };
  attach(A, 'A');
  attach(B, 'B');
}

const ready = fn => {
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