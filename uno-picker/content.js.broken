// UNO Player Picker v0.3.11 - API + Tryb Debla// content.js

const API_BASE = 'https://score.vestmedia.pl';const log = (...a) => console.log('[UNO Picker]', ...a);

const log = (...a) => console.log('[UNO Picker v0.3.11]', ...a);const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;



// Cache dla graczy (5 min TTL)function storageGet(keys) {

let cachedPlayers = [];  if (!chrome?.storage?.local?.get) return Promise.resolve({});

let cacheTime = 0;  return new Promise((resolve) => {

const CACHE_TTL = 5 * 60 * 1000;    try {

      chrome.storage.local.get(keys, (result) => {

// Stan trybu debla        const err = chrome?.runtime?.lastError;

let doublesMode = false;        if (err) {

let selectedPlayers = [];          log('storage.get failed', err.message || err);

          resolve({});

// Storage helpers          return;

async function storageGet(key, fallback = null) {        }

  try {        resolve(result || {});

    const result = await chrome.storage.local.get([key]);      });

    return result[key] !== undefined ? result[key] : fallback;    } catch (err) {

  } catch {      log('storage.get error', err);

    return fallback;      resolve({});

  }    }

}  });

}

async function storageSet(key, value) {

  try {function storageSet(items) {

    await chrome.storage.local.set({ [key]: value });  if (!chrome?.storage?.local?.set) return Promise.resolve(false);

  } catch (e) {  return new Promise((resolve) => {

    log('Storage error:', e);    try {

  }      chrome.storage.local.set(items, () => {

}        const err = chrome?.runtime?.lastError;

        if (err) {

// Pobieranie graczy z API          log('storage.set failed', err.message || err);

async function fetchPlayers() {          resolve(false);

  const now = Date.now();          return;

  if (cachedPlayers.length && (now - cacheTime < CACHE_TTL)) {        }

    log('Using cached players:', cachedPlayers.length);        resolve(true);

    return cachedPlayers;      });

  }    } catch (err) {

      log('storage.set error', err);

  try {      resolve(false);

    log('Fetching players from API...');    }

    const res = await fetch(`${API_BASE}/api/players`);  });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);}

    

    const data = await res.json();const ready = (fn) => {

    const players = Array.isArray(data) ? data : (data.players || []);  window.__unoKortMap = window.__unoKortMap || {

        'app_7kvfwf2n2tqtcgflgqsocg': '1'

    cachedPlayers = players.map(p => ({  };

      name: p.name || '',  log('kort map', window.__unoKortMap);

      flag: p.flag || '',  log('ready handler', { state: document.readyState });

      flagUrl: p.flag_url || p.flagUrl || ''  if (document.readyState === 'loading') {

    })).filter(p => p.name);    document.addEventListener('DOMContentLoaded', fn, { once: true });

      } else {

    cacheTime = now;    fn();

    log('Fetched players:', cachedPlayers.length);  }

    return cachedPlayers;};

  } catch (e) {

    log('API error:', e);log('UNO Picker content init', { readyState: document.readyState });

    return [];

  }function resolveKortFromDom() {

}  try {

    const attrSelectors = ['[data-kort]', '[data-court]', '[data-court-id]'];

// Formatowanie nazwisk dla debla    for (const sel of attrSelectors) {

function formatDoublesName(name1, name2) {      const el = document.querySelector(sel);

  const getSurname = (name) => name.trim().split(/\s+/).pop();      if (!el) continue;

  return `${getSurname(name1)}/${getSurname(name2)}`;      const raw = el.getAttribute('data-kort') || el.getAttribute('data-court') || el.getAttribute('data-court-id');

}      if (raw && /\d+/.test(raw)) return raw.match(/\d+/)[0];

    }

// Ustawianie flag przez API    const candidates = document.querySelectorAll('nav *, header *, [class*="kort"], [id*="kort"], [class*="court"], [id*="court"]');

async function setFlag(player, flag, flagUrl) {    for (const el of candidates) {

  try {      const text = (el.textContent || '').trim();

    const res = await fetch(`${API_BASE}/api/set_flag`, {      if (!text) continue;

      method: 'POST',      const match = text.match(/\b(kort|court)\s*(\d+)/i);

      headers: { 'Content-Type': 'application/json' },      if (match) return match[2];

      body: JSON.stringify({ player, flag, flag_url: flagUrl })    }

    });    const bodyText = document.body?.textContent || '';

    if (res.ok) {    const match = bodyText.match(/\b(kort|court)\s*(\d+)/i);

      log(`Flag set for Player ${player}:`, flag);    if (match) return match[2];

      return true;  } catch (err) {

    }    log('resolveKortFromDom error', err);

  } catch (e) {  }

    log('Set flag error:', e);  return null;

  }}

  return false;

}// Wstrzykniecie stylow pickera

const ensureStyle = () => {

// Wpisywanie wartości do inputa (React-compatible)  const cssUrl = chrome.runtime.getURL('picker.css');

function setInputValue(el, value) {  if (!document.querySelector(`link[href="${cssUrl}"]`)) {

  if (!el) return;    const l = document.createElement('link');

  const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;    l.rel = 'stylesheet';

  nativeSet.call(el, value);    l.href = cssUrl;

  el.dispatchEvent(new Event('input', { bubbles: true }));    document.documentElement.appendChild(l);

  el.dispatchEvent(new Event('change', { bubbles: true }));  }

}};



// Znajdowanie pól Player A/Bready(() => {

function getPlayerInputs() {  ensureStyle();

  const headers = Array.from(document.querySelectorAll('.app-field-label, .app-section-header'));  documentKort = documentKort || resolveKortFromDom();

  const playerSection = headers.find(h => /Player\s+Names?/i.test(h.textContent || ''));  if (documentKort) {

      log('Detected kort', { kort: documentKort });

  if (!playerSection) return { A: null, B: null };    const locOverlay = overlayFromLocation();

      if (locOverlay) setKortForOverlay(locOverlay, documentKort);

  let section = playerSection.closest('section, div.app-section, div[class*="section"]')     if (uno.appInstance) setKortForOverlay(uno.appInstance, documentKort);

                || playerSection.parentElement;    if (lastAppId) setKortForOverlay(lastAppId, documentKort);

  if (!section) return { A: null, B: null };  } else {

      setTimeout(() => {

  const inputs = Array.from(section.querySelectorAll('input[type="text"]'));      if (!documentKort) {

  const labeled = [];        documentKort = resolveKortFromDom();

          if (documentKort) {

  for (const inp of inputs) {          log('Detected kort (delayed)', { kort: documentKort });

    const wrapper = inp.closest('.app-field, div[class*="field"]');          const locOverlayDelayed = overlayFromLocation();

    if (!wrapper) continue;          if (locOverlayDelayed) setKortForOverlay(locOverlayDelayed, documentKort);

    const label = wrapper.querySelector('.app-field-label');          if (uno.appInstance) setKortForOverlay(uno.appInstance, documentKort);

    const text = label?.textContent || '';          if (lastAppId) setKortForOverlay(lastAppId, documentKort);

    if (/Player\s*A/i.test(text)) labeled.push({ input: inp, type: 'A' });        }

    else if (/Player\s*B/i.test(text)) labeled.push({ input: inp, type: 'B' });      }

  }    }, 1000);

    }

  return {});

    A: labeled.find(x => x.type === 'A')?.input || null,

    B: labeled.find(x => x.type === 'B')?.input || nullfunction normalizeOverlayId(input) {

  };  if (input === null || input === undefined) return null;

}  if (typeof input === 'number' || /^\d+$/.test(String(input).trim())) {

    return `app_${String(input).trim()}`.toLowerCase();

// Popover  }

let openPopover = null;  const str = String(input).trim();

  const match = str.match(/app_([A-Za-z0-9]+)/i);

function closePopover() {  if (match) return `app_${match[1].toLowerCase()}`;

  if (openPopover) {  return null;

    openPopover.remove();}

    openPopover = null;

  }function extractAppId(source) {

}  try {

    return normalizeOverlayId(source);

function showPicker(targetInput, playerLetter) {  } catch {

  closePopover();    return null;

    }

  const pop = document.createElement('div');}

  pop.style.cssText = `

    position: absolute;function overlayFromLocation() {

    z-index: 2147483647;  try {

    background: white;    const match = window.location.pathname.match(/(?:control|output)\/([A-Za-z0-9]+)/i);

    border: 1px solid #ccc;    if (match) return normalizeOverlayId(match[1]);

    border-radius: 8px;  } catch {}

    box-shadow: 0 4px 12px rgba(0,0,0,0.15);  return null;

    padding: 12px;}

    min-width: 320px;

    max-width: 400px;function setKortForOverlay(overlay, kort) {

  `;  const normalizedOverlay = normalizeOverlayId(overlay);

    if (!normalizedOverlay || !kort) return;

  // Checkbox debla  window.__unoKortMap = window.__unoKortMap || {};

  const checkDiv = document.createElement('div');  window.__unoKortMap[normalizedOverlay] = String(kort);

  checkDiv.style.cssText = 'margin-bottom: 10px;';}

  

  const checkbox = document.createElement('input');function parseSocketIoFrame(frame) {

  checkbox.type = 'checkbox';  if (!frame || typeof frame !== 'string') return null;

  checkbox.checked = doublesMode;  if (frame.startsWith('42')) {

  checkbox.style.marginRight = '8px';    const json = frame.slice(2);

      try {

  const label = document.createElement('label');      const arr = JSON.parse(json);

  label.textContent = 'Tryb debla (2 zawodników)';      if (Array.isArray(arr) && arr.length) {

  label.style.cursor = 'pointer';        return { eventName: arr[0], payload: arr[1], raw: arr };

  label.prepend(checkbox);      }

      } catch {}

  checkDiv.appendChild(label);  }

    return null;

  // Search input}

  const search = document.createElement('input');

  search.placeholder = 'Szukaj...';function extractCommandFromPayload(payload) {

  search.style.cssText = `  if (!payload || typeof payload !== 'object') return null;

    width: 100%;  if (typeof payload.command === 'string') return payload.command;

    padding: 8px;  if (typeof payload.name === 'string') return payload.name;

    border: 1px solid #ddd;  if (payload.data && typeof payload.data.command === 'string') return payload.data.command;

    border-radius: 4px;  if (payload.message && typeof payload.message.command === 'string') return payload.message.command;

    margin-bottom: 10px;  return null;

  `;}

  

  // Selected list (doubles only)const SCORE_FIELD_COMMANDS = {

  const selectedDiv = document.createElement('div');  PointsPlayerA: 'SetPointsPlayerA',

  selectedDiv.style.cssText = 'margin-bottom: 10px; display: none;';  PointsPlayerB: 'SetPointsPlayerB',

    PlayerAName: 'SetNamePlayerA',

  // Players list  PlayerBName: 'SetNamePlayerB',

  const list = document.createElement('div');  Set1PlayerA: 'SetSet1PlayerA',

  list.style.cssText = `  Set1PlayerB: 'SetSet1PlayerB',

    max-height: 300px;  Set2PlayerA: 'SetSet2PlayerA',

    overflow-y: auto;  Set2PlayerB: 'SetSet2PlayerB',

    border: 1px solid #eee;  Set3PlayerA: 'SetSet3PlayerA',

    border-radius: 4px;  Set3PlayerB: 'SetSet3PlayerB',

  `;  CurrentSetPlayerA: 'SetCurrentSetPlayerA',

    CurrentSetPlayerB: 'SetCurrentSetPlayerB',

  pop.append(checkDiv, search, selectedDiv, list);  CurrentSet: 'SetCurrentSet',

  document.body.appendChild(pop);  Set: 'SetSet',

  openPopover = pop;  TieBreakPlayerA: 'SetTieBreakPlayerA',

    TieBreakPlayerB: 'SetTieBreakPlayerB',

  // Position  TieBreakVisible: 'SetTieVisible',

  const rect = targetInput.getBoundingClientRect();  ShowTieBreak: 'ShowTieBreak',

  pop.style.top = `${rect.bottom + window.scrollY + 8}px`;  HideTieBreak: 'HideTieBreak',

  pop.style.left = `${rect.left + window.scrollX}px`;  Serve: 'SetServe',

    Mode: 'SetMode',

  // Close handlers  OverlayVisible: 'SetOverlayVisible'

  const closeOnOutside = (e) => {};

    if (!pop.contains(e.target) && e.target !== targetInput) closePopover();

  };function normalizeScoreValue(field, value) {

  const closeOnEsc = (e) => {  let out = value;

    if (e.key === 'Escape') closePopover();  if (out && typeof out === 'object') {

  };    if (Array.isArray(out.v) && out.v.length) {

        out = out.v[out.v.length - 1];

  document.addEventListener('mousedown', closeOnOutside, true);    } else if ('value' in out) {

  document.addEventListener('keydown', closeOnEsc, true);      out = out.value;

  window.addEventListener('resize', closePopover, true);    } else if ('text' in out) {

        out = out.text;

  // Cleanup    } else if (Array.isArray(out) && out.length) {

  pop.__cleanup = () => {      out = out[out.length - 1];

    document.removeEventListener('mousedown', closeOnOutside, true);    }

    document.removeEventListener('keydown', closeOnEsc, true);  }

    window.removeEventListener('resize', closePopover, true);  if (Array.isArray(out) && out.length) out = out[out.length - 1];

  };  if (out === 0 || out === '0') return 0;

    if (out === null || out === undefined) return 0;

  // Checkbox handler  if (typeof out === 'number') return out;

  checkbox.addEventListener('change', () => {  if (typeof out === 'boolean') return out;

    doublesMode = checkbox.checked;  const str = String(out).trim();

    storageSet('doublesMode', doublesMode);  if (!str) return null;

    selectedPlayers = [];  if (str === 'true' || str === 'false') return str === 'true';

    renderSelected();  const num = Number(str);

    renderList();  if (!Number.isNaN(num) && !/^0[0-9]/.test(str)) {

  });    if (/PlayerA|PlayerB|Points|Set|Current|TieBreak/i.test(field)) return num;

    }

  // Render selected  return str;

  const renderSelected = () => {}

    if (!checkbox.checked) {

      selectedDiv.style.display = 'none';function sendScoreCommand(command, value, appId, extras) {

      return;  if (!command) return;

    }  if (!chrome?.runtime?.id || typeof chrome.runtime.sendMessage !== 'function') {

        log('Score command skipped: runtime unavailable', { command, value });

    selectedDiv.style.display = 'block';    return;

    selectedDiv.innerHTML = `<div style="font-size: 12px; font-weight: 600; margin-bottom: 6px;">Wybrani (${selectedPlayers.length}/2):</div>`;  }

      const overlay = normalizeOverlayId(appId || uno.appInstance || lastAppId || overlayFromLocation());

    if (selectedPlayers.length === 0) {  if (!overlay) {

      selectedDiv.innerHTML += '<div style="font-size: 12px; color: #999;">Brak</div>';    log('Score command skipped: overlay missing', { command, value });

    } else {    return;

      selectedPlayers.forEach((p, idx) => {  }

        const item = document.createElement('div');  lastAppId = overlay;

        item.style.cssText = 'display: flex; align-items: center; padding: 4px; background: #f0f0f0; border-radius: 4px; margin-bottom: 4px;';  if (!window.__unoKortMap) window.__unoKortMap = {};

          if (extras && typeof extras === 'object' && extras.kort) setKortForOverlay(overlay, extras.kort);

        const flagHTML = p.flagUrl   if (documentKort) setKortForOverlay(overlay, documentKort);

          ? `<img src="${p.flagUrl}" style="height: 16px; margin-right: 6px;">`   const kort = window.__unoKortMap[overlay] || documentKort || '1';

          : `<span style="margin-right: 6px; font-weight: bold;">${(p.flag || '?').toUpperCase()}</span>`;  const message = buildScoreReflectMessage(overlay, kort, command, value, extras);

          log('UNO score reflect send', { command, value, overlay: message.overlay, kort: message.kort });

        const removeBtn = document.createElement('button');  try {

        removeBtn.textContent = '✕';    chrome.runtime.sendMessage(message, (resp) => {

        removeBtn.style.cssText = 'margin-left: auto; background: none; border: none; cursor: pointer; font-size: 16px; color: #666;';      if (chrome.runtime.lastError) {

        removeBtn.addEventListener('click', () => {        log('UNO score reflect error', chrome.runtime.lastError.message);

          selectedPlayers.splice(idx, 1);        return;

          renderSelected();      }

          renderList();      if (resp && resp.ok) {

        });        log('UNO score reflect ack', { command, status: resp.status });

              } else {

        item.innerHTML = `${flagHTML}<span>${p.name}</span>`;        log('UNO score reflect response', resp);

        item.appendChild(removeBtn);      }

        selectedDiv.appendChild(item);    });

      });  } catch (err) {

    }    log('UNO score reflect send failed (runtime)', { command, message: err?.message || String(err) });

  };  }

  }

  // Render list

  let allPlayers = [];const scoreStateByOverlay = new Map();

  

  const renderList = (query = '') => {function resolveOverlayKey(rawOverlay) {

    list.innerHTML = '';  const direct = normalizeOverlayId(rawOverlay);

      if (direct) return direct;

    if (!allPlayers.length) {  if (uno?.appInstance) {

      list.innerHTML = '<div style="padding: 12px; text-align: center; color: #999;">Ładowanie...</div>';    const fromUno = normalizeOverlayId(uno.appInstance);

      return;    if (fromUno) return fromUno;

    }  }

      if (lastAppId) {

    const needle = query.trim().toLowerCase();    const fromLast = normalizeOverlayId(lastAppId);

    const filtered = needle     if (fromLast) return fromLast;

      ? allPlayers.filter(p => p.name.toLowerCase().includes(needle) || p.flag.toLowerCase().includes(needle))  }

      : allPlayers;  return null;

    }

    if (!filtered.length) {

      list.innerHTML = '<div style="padding: 12px; text-align: center; color: #999;">Brak wyników</div>';function getOverlayScoreState(overlayKey) {

      return;  if (!overlayKey) return null;

    }  if (!scoreStateByOverlay.has(overlayKey)) {

        scoreStateByOverlay.set(overlayKey, {

    filtered.forEach(p => {      points: { A: null, B: null },

      const row = document.createElement('div');      tieBreak: { A: null, B: null },

      row.style.cssText = `      tieBreakVisible: false,

        padding: 10px;      tieBreakExplicit: null

        cursor: pointer;    });

        display: flex;  }

        align-items: center;  return scoreStateByOverlay.get(overlayKey);

        border-bottom: 1px solid #f0f0f0;}

      `;

      row.addEventListener('mouseenter', () => row.style.background = '#f5f5f5');function isTieBreakValueActive(value) {

      row.addEventListener('mouseleave', () => row.style.background = 'white');  if (value === null || value === undefined) return false;

        if (typeof value === 'number') {

      const flagEl = p.flagUrl    return value !== 0; // 0 nie aktywuje TB

        ? `<img src="${p.flagUrl}" style="height: 18px; margin-right: 10px;">`  }

        : `<span style="margin-right: 10px; font-weight: bold;">${(p.flag || '?').toUpperCase()}</span>`;  const str = String(value).trim();

        if (!str.length) return false;

      row.innerHTML = `${flagEl}<span>${p.name}</span>`;  if (str === '0') return false;

        const n = Number(str);

      row.addEventListener('click', async () => {  if (!Number.isNaN(n)) return n !== 0;

        if (checkbox.checked) {  return true;

          // Doubles mode}

          if (selectedPlayers.length >= 2) {

            alert('Maksymalnie 2 zawodników!');function setTieBreakVisibility(state, overlayKey, nextVisible, reason = 'auto') {

            return;  if (!state) return;

          }  if (state.tieBreakVisible === nextVisible && reason === 'auto') return;

            state.tieBreakVisible = nextVisible;

          if (selectedPlayers.find(sp => sp.name === p.name)) {  if (reason !== 'auto') {

            alert('Ten zawodnik jest już wybrany!');    state.tieBreak.A = 0;

            return;    state.tieBreak.B = 0;

          }    state.points.A = 0;

              state.points.B = 0;

          selectedPlayers.push(p);  }

          renderSelected();  const extras = { source: reason, player: null };

            if (reason === 'auto') extras.reason = 'tie-break-values';

          if (selectedPlayers.length === 2) {  sendScoreCommand('SetTieVisible', nextVisible, overlayKey, extras);

            const doublesName = formatDoublesName(selectedPlayers[0].name, selectedPlayers[1].name);  if (!nextVisible) {

            setInputValue(targetInput, doublesName);    sendScoreCommand('HideTieBreak', false, overlayKey, { source: reason });

            await setFlag(playerLetter, selectedPlayers[0].flag, selectedPlayers[0].flagUrl);  }

            log(`Doubles: ${doublesName} for Player ${playerLetter}`);}

            closePopover();

          }function reflectPointsWithTieState(overlayKey, playerLetter) {

        } else {  const state = getOverlayScoreState(overlayKey);

          // Singles mode  if (!state) return false;

          setInputValue(targetInput, p.name);  const tieActive = !!state.tieBreakVisible;

          await setFlag(playerLetter, p.flag, p.flagUrl);  const tieValue = state.tieBreak[playerLetter];

          log(`Selected: ${p.name} for Player ${playerLetter}`);  const baseValue = state.points[playerLetter];

          closePopover();  const valueToSend = tieActive && tieValue !== null && tieValue !== undefined

        }    ? tieValue

      });    : baseValue;

        if (valueToSend === null || valueToSend === undefined) return false;

      list.appendChild(row);

    });  const command = playerLetter === 'A' ? 'SetPointsPlayerA' : 'SetPointsPlayerB';

  };  const extras = {

      tieBreakActive: tieActive,

  // Load players    pointsSource: tieActive ? 'tie-break' : 'regular',

  fetchPlayers().then(players => {    player: playerLetter,

    allPlayers = players;    tieBreakValue: tieActive ? tieValue ?? valueToSend : null

    renderList();  };

    renderSelected();  if (tieActive) {

  });    extras.pointsColor = '#2b2b2b';

    }

  search.addEventListener('input', () => renderList(search.value));  if (!extras.tieBreakActive || extras.tieBreakValue === null || extras.tieBreakValue === undefined) {

  search.focus();    delete extras.tieBreakValue;

}  }

  if (tieActive && (tieValue === null || tieValue === undefined)) {

// Add buttons    extras.tieBreakFallback = true;

function ensureUI() {  }

  if (!document.body) return;  log('Reflect points with tie state', {

      overlay: overlayKey,

  const { A, B } = getPlayerInputs();    player: playerLetter,

      value: valueToSend,

  const attach = (input, letter) => {    tieBreakActive: tieActive,

    if (!input || input.__pickerWired) return;    source: extras.pointsSource

    input.__pickerWired = true;  });

      sendScoreCommand(command, valueToSend, overlayKey, extras);

    if (input.parentElement?.querySelector('.uno-picker-btn')) return;  return true;

    }

    const btn = document.createElement('button');

    btn.className = 'uno-picker-btn';function handleScoreFieldUpdate(overlayForEvent, field, command, value) {

    btn.type = 'button';  const overlayKey = resolveOverlayKey(overlayForEvent);

    btn.textContent = `Wybierz ${letter}`;  const state = getOverlayScoreState(overlayKey);

    btn.style.cssText = `  if (!state) return false;

      margin-left: 10px;

      padding: 6px 12px;  const updatePointsFor = (letter) => {

      background: #007bff;    reflectPointsWithTieState(overlayKey, letter);

      color: white;  };

      border: none;

      border-radius: 4px;  if (field === 'PointsPlayerA') {

      cursor: pointer;    state.points.A = value;

      font-size: 13px;    updatePointsFor('A');

    `;    return true;

      }

    input.parentElement?.insertBefore(btn, input.nextSibling);  if (field === 'PointsPlayerB') {

        state.points.B = value;

    btn.addEventListener('click', () => showPicker(input, letter));    updatePointsFor('B');

    input.addEventListener('focus', () => showPicker(input, letter), true);    return true;

      }

    log(`Attached picker to Player ${letter}`);  if (field === 'TieBreakPlayerA') {

  };    state.tieBreak.A = value;

      const wasVisible = state.tieBreakVisible;

  attach(A, 'A');    const valueActive = isTieBreakValueActive(value);

  attach(B, 'B');    const otherActive = isTieBreakValueActive(state.tieBreak.B);

}    if (state.tieBreakExplicit === null) {

      const nextVisible = valueActive || otherActive;

// Init      if (nextVisible !== wasVisible) {

(async function init() {        setTieBreakVisibility(state, overlayKey, nextVisible, 'auto');

  log('Init UNO Player Picker v0.3.11');      }

      } else if (state.tieBreakExplicit === true) {

  doublesMode = await storageGet('doublesMode', false);      // jeśli oba są nieaktywne (0) – wyłącz TB mimo trybu explicit

  log('Doubles mode:', doublesMode);      if (!valueActive && !otherActive) {

          state.tieBreakExplicit = false;

  fetchPlayers().catch(e => log('Preload error:', e));        setTieBreakVisibility(state, overlayKey, false, 'auto');

        } else {

  const observer = new MutationObserver(() => {        state.tieBreakVisible = true;

    try { ensureUI(); } catch (e) { log('UI error:', e); }      }

  });    } else if (state.tieBreakExplicit === false) {

        state.tieBreakVisible = false;

  observer.observe(document.documentElement, { childList: true, subtree: true });    }

  ensureUI();    const extras = {

})();      player: 'A',

      tieBreakActive: state.tieBreakVisible,
      tieBreakValue: value,
      pointsColor: '#2b2b2b'
    };
    if (!state.tieBreakVisible) delete extras.tieBreakActive;
    if (value === null || value === undefined) delete extras.tieBreakValue;
    sendScoreCommand(command, value, overlayKey, Object.keys(extras).length ? extras : null);
    if (state.tieBreakVisible) updatePointsFor('A');
    return true;
  }
  if (field === 'TieBreakPlayerB') {
    state.tieBreak.B = value;
    const wasVisible = state.tieBreakVisible;
    const valueActive = isTieBreakValueActive(value);
    const otherActive = isTieBreakValueActive(state.tieBreak.A);
    if (state.tieBreakExplicit === null) {
      const nextVisible = valueActive || otherActive;
      if (nextVisible !== wasVisible) {
        setTieBreakVisibility(state, overlayKey, nextVisible, 'auto');
      }
    } else if (state.tieBreakExplicit === true) {
      if (!valueActive && !otherActive) {
        state.tieBreakExplicit = false;
        setTieBreakVisibility(state, overlayKey, false, 'auto');
      } else {
        state.tieBreakVisible = true;
      }
    } else if (state.tieBreakExplicit === false) {
      state.tieBreakVisible = false;
    }
    const extras = {
      player: 'B',
      tieBreakActive: state.tieBreakVisible,
      tieBreakValue: value,
      pointsColor: '#2b2b2b'
    };
    if (!state.tieBreakVisible) delete extras.tieBreakActive;
    if (value === null || value === undefined) delete extras.tieBreakValue;
    sendScoreCommand(command, value, overlayKey, Object.keys(extras).length ? extras : null);
    if (state.tieBreakVisible) updatePointsFor('B');
    return true;
  }
  if (field === 'TieBreakVisible') {
    const active = value === true || value === 'true' || value === 1 || value === '1';
    state.tieBreakExplicit = active;
    state.tieBreak.A = 0;
    state.tieBreak.B = 0;
    state.points.A = 0;
    state.points.B = 0;
    setTieBreakVisibility(state, overlayKey, active, 'explicit');
    updatePointsFor('A');
    updatePointsFor('B');
    return true;
  }
  if (field === 'ShowTieBreak') {
    state.tieBreakExplicit = true;
    state.tieBreak.A = 0;
    state.tieBreak.B = 0;
    state.points.A = 0;
    state.points.B = 0;
    setTieBreakVisibility(state, overlayKey, true, 'explicit');
    updatePointsFor('A');
    updatePointsFor('B');
    sendScoreCommand(command, true, overlayKey, { source: 'update-field' });
    return true;
  }
  if (field === 'HideTieBreak') {
    state.tieBreakExplicit = false;
    state.tieBreak.A = 0;
    state.tieBreak.B = 0;
    state.points.A = 0;
    state.points.B = 0;
    setTieBreakVisibility(state, overlayKey, false, 'explicit');
    updatePointsFor('A');
    updatePointsFor('B');
    sendScoreCommand(command, false, overlayKey, { source: 'update-field' });
    return true;
  }

  return false;
}

function processUpdatePayload(overlayForEvent, parsed) {
  const payload = parsed.payload || {};
  const dataSection = (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') ? payload.data : (typeof payload === 'object' ? payload : null);
  if (!dataSection || typeof dataSection !== 'object') return false;

  const isMap = typeof Map !== 'undefined' && dataSection instanceof Map;
  const keys = isMap ? Array.from(dataSection.keys()) : Object.getOwnPropertyNames(dataSection);
  log('UNO update keys', { total: keys.length, sample: keys.slice(0, 8) });

  let mirrored = false;
  const iterator = isMap ? dataSection.entries() : Object.entries(dataSection);
  for (const [path, rawValue] of iterator) {
    if (typeof path !== 'string') continue;
    const match = path.match(/\.payload\.([A-Za-z0-9_]+)$/);
    if (!match) continue;
    const field = match[1];
    const command = SCORE_FIELD_COMMANDS[field];
    if (!command) continue;
    const normalized = normalizeScoreValue(field, rawValue);
    if (normalized === null || normalized === undefined) continue;
    log('UNO update -> score', { field, command, value: normalized });
    const handled = handleScoreFieldUpdate(overlayForEvent, field, command, normalized);
    if (!handled) {
      sendScoreCommand(command, normalized, overlayForEvent, null);
    }
    mirrored = true;
  }
  return mirrored;
}

// Wstrzykniecie skryptu na strone (bridge: token/app + capture API)
(function inject() {
  if (window.__unoInjected) {
    log('inject.js already present');
    return;
  }
  window.__unoInjected = true;
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  } catch {}
})();

const uno = { token: null, appInstance: null };
let lastAppId = null;
let documentKort = null;
const API_PATTERN_KEY = 'uno_flag_api_pattern';

function buildScoreReflectMessage(overlay, kortInput, command, value, extras) {
  const storedPattern = loadApiPattern() || {};
  const { url: unoUrl, method: unoMethod } = normalizeUnoApiTarget(storedPattern.url, storedPattern.method);
  const normalizedOverlay = normalizeOverlayId(overlay) || (overlay ? String(overlay) : null);
  const normalizedKort = String(kortInput || '1');
  const normalizedUnoApp = normalizeOverlayId(uno.appInstance) || (uno.appInstance ? String(uno.appInstance) : null);
  const extrasPayload = (extras && typeof extras === 'object') ? { ...extras } : null;
  return {
    type: 'UNO_SCORE_REFLECT',
    overlay: normalizedOverlay,
    kort: normalizedKort,
    command,
    value,
    extras: extrasPayload,
    unoUrl: unoUrl || null,
    unoMethod,
    unoToken: uno.token || null,
    unoApp: normalizedUnoApp,
    reflectedAt: new Date().toISOString()
  };
}

  async function mirrorScoreUpdate(command, value, extras = null) {
    if (!command) return;
    const overlay = normalizeOverlayId(uno.appInstance || lastAppId || overlayFromLocation()) || null;
    if (!overlay) {
      log('Mirror update: overlay missing, sending without overlay context', { command });
    } else if (documentKort) {
      setKortForOverlay(overlay, documentKort);
    }
    const kort = (overlay && window.__unoKortMap?.[overlay]) || documentKort || '1';
    const message = buildScoreReflectMessage(overlay, kort, command, value, extras);
  try {
    await chrome.runtime.sendMessage(message);
  } catch (err) {
    log('Score mirror failed', err);
  }
}

function normalizeUnoApiTarget(rawUrl, rawMethod) {
  const fallbackMethod = 'PUT';
  if (!rawUrl) {
    return { url: null, method: fallbackMethod };
  }

  let normalizedUrl = String(rawUrl);
  try {
    const urlObj = new URL(normalizedUrl);
    urlObj.pathname = urlObj.pathname
      .replace(/\/api\/info\/?$/i, '/api')
      .replace(/\/info\/?$/i, '/api');
    normalizedUrl = urlObj.toString();
  } catch {
    normalizedUrl = normalizedUrl
      .replace(/\/api\/info(?=$|[/?#])/i, '/api')
      .replace(/\/info(?=$|[/?#])/i, '/api');
  }

  const method = typeof rawMethod === 'string' && rawMethod.toUpperCase() === 'PUT'
    ? 'PUT'
    : fallbackMethod;

  return { url: normalizedUrl, method };
}

window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || !d.type) return;
  if (d.type === 'UNO_BRIDGE_INFO') {
    if (d.token) uno.token = d.token;
    if (d.appInstance) uno.appInstance = d.appInstance;
    storageSet({ unoToken: uno.token, unoApp: uno.appInstance });
    log('Bridge OK', { token: !!uno.token, app: !!uno.appInstance });
  } else if (d.type === 'UNO_API_CAPTURE') {
    try {
      const normalized = normalizeUnoApiTarget(d.url, d.method);
      localStorage.setItem(API_PATTERN_KEY, JSON.stringify(normalized));
      log('Zapamietano endpoint API do flag:', normalized);
    } catch {}
  } else if (d.type === 'UNO_API_EVENT') {
    handleUnoApiEvent(d);
  } else {
    const relayTypes = ['UNO_WS_OPEN','UNO_WS_SEND','UNO_WS_RECV','UNO_WS_CLOSE','UNO_WS_ERROR','UNO_BRIDGE_CALL'];
    if (relayTypes.includes(d.type)) {
      log('Debug event', d);
      try { chrome.runtime.sendMessage({ type: 'UNO_DEBUG_EVENT', event: d }); } catch {}

      let parsed = null;
      if (d.type.startsWith('UNO_WS_') && typeof d.data === 'string') {
        parsed = parseSocketIoFrame(d.data);
      } else if (d.type === 'UNO_BRIDGE_CALL' && Array.isArray(d.args) && typeof d.args[0] === 'string' && d.args[1]) {
        parsed = { eventName: String(d.args[0]), payload: d.args[1], raw: d.args };
      }

    if (parsed && parsed.eventName === 'login') {
        const loginOverlay = typeof parsed.payload === 'string' ? normalizeOverlayId(parsed.payload) : extractAppId(parsed.payload);
        if (loginOverlay) {
          lastAppId = loginOverlay;
          if (documentKort) setKortForOverlay(lastAppId, documentKort);
          log('UNO login event', { appId: lastAppId, kort: window.__unoKortMap?.[lastAppId] || documentKort || null });
        }
      }

      if (parsed) {
        const command = extractCommandFromPayload(parsed.payload);
        let overlayCandidate = normalizeOverlayId(uno.appInstance);
        if (!overlayCandidate) overlayCandidate = extractAppId(d.url);
        if (!overlayCandidate) overlayCandidate = extractAppId(parsed.payload?.ds);
        if (!overlayCandidate && parsed.payload && Object.prototype.hasOwnProperty.call(parsed.payload, 'appId')) {
          overlayCandidate = extractAppId(parsed.payload.appId);
        }
        if (!overlayCandidate) overlayCandidate = lastAppId;
        const overlayForEvent = overlayCandidate || null;
        const kortForEvent = (overlayForEvent && window.__unoKortMap?.[overlayForEvent]) || documentKort || null;
        const direction = d.type === 'UNO_WS_SEND' ? 'send' : (d.type === 'UNO_WS_RECV' ? 'recv' : d.type === 'UNO_BRIDGE_CALL' ? 'bridge' : 'other');

        let handled = false;
        if (parsed.eventName === 'update') {
          handled = processUpdatePayload(overlayForEvent, parsed);
        } else if (parsed.eventName === 'control:command' && command) {
          const value = parsed.payload && typeof parsed.payload === 'object'
            ? (parsed.payload.value ?? parsed.payload.payload ?? parsed.payload.data?.value)
            : undefined;
          const controlExtras = (parsed.payload && typeof parsed.payload === "object") ? parsed.payload : null;
          sendScoreCommand(command, value, overlayForEvent, controlExtras);
          handled = true;
        }

        const commandForRelay = handled ? null : command;
        try {
          chrome.runtime.sendMessage({
            type: 'UNO_SOCKET_EVENT',
            direction,
            app: overlayForEvent || null,
            kort: kortForEvent || null,
            url: d.url || null,
            eventName: parsed.eventName || null,
            payload: parsed.payload || null,
            raw: parsed.raw || null,
            command: commandForRelay
          }, (resp) => {
            if (chrome.runtime.lastError) {
              log('UNO socket mirror error', chrome.runtime.lastError.message);
              return;
            }
            if (resp && resp.ok) {
              log('UNO socket mirror ack', { event: parsed.eventName, command: resp.command, status: resp.status });
            } else if (resp && resp.skipped) {
              log('UNO socket mirror skipped', { event: parsed.eventName, reason: resp.reason || 'no command', sample: parsed.payload });
            }
          });
        } catch (err) {
          log('UNO socket mirror send failed', err);
        }

        if (!handled && command) {
          const value = parsed.payload && typeof parsed.payload === 'object' ? (parsed.payload.value ?? parsed.payload.payload ?? parsed.payload.data?.value) : undefined;
          sendScoreCommand(command, value, overlayForEvent, null);
        }
      }
      return;
    }
  }
}, false);

(async () => {
  const { unoToken, unoApp } = await storageGet(['unoToken','unoApp']);
  if (unoToken && !uno.token) uno.token = unoToken;
  if (unoApp && !uno.appInstance) uno.appInstance = unoApp;
})();

function loadApiPattern() {
  try { return JSON.parse(localStorage.getItem(API_PATTERN_KEY) || 'null'); }
  catch { return null; }
}

function handleUnoApiEvent(evt) {
  if (!evt || !evt.body || typeof evt.body !== 'object') return;
  if (!evt.body.command || typeof evt.body.command !== 'string') return;
  if (!uno.appInstance) return;
  log('Forwarding UNO command to mirror', {
    command: evt.body.command,
    method: evt.method,
    url: evt.url,
    body: evt.body
  });
  try {
    chrome.runtime.sendMessage({
      type: 'UNO_API_MIRROR',
      app: uno.appInstance,
      url: evt.url,
      method: evt.method,
      body: evt.body,
      raw: evt.raw || null
    }, (resp) => {
      log('UNO mirror ack', { command: evt.body.command, ok: resp?.ok, status: resp?.status, error: resp?.error });
    });
  } catch (err) {
    log('Forward UNO API event failed', err);
  }
}

// -------- players.json
function normalizePlayer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw.name || raw.player || raw.playerName || raw.fullname || raw.fullName || raw.label;
  const flagRaw = raw.flag ?? raw.code ?? raw.iso2 ?? raw.country_code ?? raw.country ?? raw.nation ?? raw.nationality;
  const flagUrl = raw.flagUrl || null;
  if (!name) return null;
  let flag = '';
  if (typeof flagRaw === 'string') {
    const m = flagRaw.trim().match(/[a-z]{2}/i);
    if (m) flag = m[0].toLowerCase();
  }
  return { name: String(name), flag, flagUrl };
}

async function loadPlayers() {
  try {
    const res = await fetch(chrome.runtime.getURL('players.json'));
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.players) ? data.players : []);
    const out = arr.map(normalizePlayer).filter(Boolean);
    log('Lista graczy:', out.length);
    return out;
  } catch (e) {
    console.warn('[UNO Picker] nie wczytano players.json', e);
    return [];
  }
}

// Prawdziwe wpisanie do inputa (aby React/UNO zarejestrowal zmiane)
async function commitInputValue(el, value) {
  const normalizedValue = value == null ? '' : String(value);
  try { el.focus({ preventScroll: true }); } catch {}
  const proto = Object.getPrototypeOf(el);
  const desc =
    Object.getOwnPropertyDescriptor(proto, 'value') ||
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  if (desc?.set) desc.set.call(el, normalizedValue);
  else el.value = normalizedValue;

  const evtOpts = { bubbles: true, cancelable: true, composed: true };
  try {
    el.dispatchEvent(new InputEvent('beforeinput', {
      ...evtOpts,
      inputType: 'insertReplacementText',
      data: normalizedValue
    }));
  } catch {
    el.dispatchEvent(new Event('beforeinput', evtOpts));
  }
  el.dispatchEvent(new Event('input', evtOpts));
  try {
    el.dispatchEvent(new InputEvent('input', {
      ...evtOpts,
      inputType: 'insertText',
      data: normalizedValue
    }));
  } catch {}

  const createEnterEvent = (type) => {
    let event;
    try {
      event = new KeyboardEvent(type, { ...evtOpts, key: 'Enter', code: 'Enter', keyCode: 13, which: 13, charCode: 13 });
    } catch (err) {
      event = document.createEvent('KeyboardEvent');
      event.initKeyboardEvent?.(type, true, true, window, 'Enter', 0, '', false, 'Enter');
    }
    try {
      Object.defineProperties(event, {
        keyCode: { value: 13 },
        which: { value: 13 },
        charCode: { value: 13 }
      });
    } catch {}
    return event;
  };

  el.dispatchEvent(createEnterEvent('keydown'));
  el.dispatchEvent(createEnterEvent('keypress'));
  el.dispatchEvent(createEnterEvent('keyup'));

  await new Promise(r => setTimeout(r, 80));
  try { el.dispatchEvent(new FocusEvent('blur', evtOpts)); } catch { el.dispatchEvent(new Event('blur', evtOpts)); }
  try { el.blur(); } catch {}

  await new Promise(r => setTimeout(r, 40));
  el.dispatchEvent(new Event('change', evtOpts));
}

// Flagi: API -> UI fallback
async function setFlagViaApi(player, code2, flagUrl) {
  if (!flagUrl) return false;
  const storedPattern = loadApiPattern() || {};
  const { url: apiUrl, method } = normalizeUnoApiTarget(storedPattern.url, storedPattern.method);
  if (!apiUrl) {
    log('Brak zapisanego endpointu UNO - pomijam wysylke flagi.');
    return false;
  }
  if (!uno.token) {
    log('Brak tokenu UNO - pomijam wysylke flagi.');
    return false;
  }

  const fieldId = player === 'A' ? 'Player A Flag' : 'Player B Flag';
  const payload = {
    command: 'SetCustomizationField',
    fieldId,
    value: String(flagUrl)
  };

  log('UNO API flag request', { url: apiUrl, method, fieldId, value: payload.value });

  let resp;
  try {
    resp = await chrome.runtime.sendMessage({
      type: 'UNO_API_POST',
      url: apiUrl,
      method,
      token: uno.token,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    log('UNO API flag request failed', error);
    return false;
  }

  log('UNO API flag response', resp);

  return !!(resp && resp.ok);
}

function setFlagViaUI(root, player, code2) {
  const want = (player === 'A' ? 'player a flag' : 'player b flag');
  const inputs = Array.from(root.querySelectorAll('input'));
  for (const el of inputs) {
    const lab = nearestLabelText(el).toLowerCase();
    if (lab === want) {
      el.focus();
      el.value = (code2 || '').toLowerCase();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      try { el.blur(); } catch {}
      return true;
      }
  }
  return false;
}

function nearestLabelText(inputEl) {
  let node = inputEl;
  for (let i = 0; i < 5 && node; i++) {
    const t = node.querySelector?.('.app-field-label')?.textContent
           || node.querySelector?.('label')?.textContent || '';
    if (t && t.trim()) return t.trim();
    node = node.parentElement;
  }
  return '';
}

// Odszukanie pol Player A/B po sekcji "Player Names"
function getPlayerInputsFromSection() {
  if (!document.body) {
    log('getPlayerInputsFromSection: no body, skipping UI wiring');
    return { A: null, B: null };
  }
  // 1) znajdz naglowek tekstowy "Player Names"
  const headerNodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const v = n.nodeValue?.trim();
      if (!v) return NodeFilter.FILTER_REJECT;
      return /^player\s+names$/i.test(v) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
  });
  let n; while ((n = walker.nextNode())) headerNodes.push(n);

  if (!headerNodes.length) return { A: null, B: null };

  // 2) wez najblizszy sensowny kontener (kilka poziomow w gore),
  //    a potem w dol pierwsze 2 WIDOCZNE inputy typu text
  function visible(el) { const r = el.getBoundingClientRect(); return el.offsetParent !== null && r.width > 5 && r.height > 10; }

  for (const textNode of headerNodes) {
    let box = textNode.parentElement;
    for (let i = 0; i < 5 && box; i++) {
      const inputs = Array.from(box.querySelectorAll('input[type="text"], input:not([type])'))
        .filter(visible);
      if (inputs.length >= 2) {
        return { A: inputs[0], B: inputs[1] };
      }
      box = box.parentElement;
      }
  }
  return { A: null, B: null };
}

// UI pickera

let openPopover = null;
let openPopoverCleanups = [];

function registerPopoverCleanup(fn) {
  if (typeof fn === 'function') openPopoverCleanups.push(fn);
}

function closePopover() {
  while (openPopoverCleanups.length) {
    const fn = openPopoverCleanups.pop();
    try { fn(); } catch {}
  }
  if (openPopover) {
    openPopover.remove();
    openPopover = null;
  }
}

function showPickerFor(targetInput, playerLetter, opts = {}) {
  closePopover();

  const pop = document.createElement('div');
  pop.className = 'uno-picker-popover';
  pop.style.zIndex = '2147483647';

  const search = document.createElement('input');
  search.className = 'uno-picker-search';
  search.placeholder = 'Szukaj zawodnika...';

  const list = document.createElement('div');
  pop.append(search, list);
  document.body.appendChild(pop);
  openPopover = pop;
  openPopoverCleanups = [];

  const rect = targetInput.getBoundingClientRect();
  pop.style.top = `${Math.round(rect.bottom + window.scrollY + 8)}px`;
  pop.style.left = `${Math.round(rect.left + window.scrollX)}px`;

  const closeOnOutside = (e) => {
    if (!pop.contains(e.target) && e.target !== targetInput) {
      closePopover();
      }
  };
  const closeOnKey = (e) => {
    if (e.key === 'Escape') closePopover();
  };
  const closeOnResize = () => closePopover();

  document.addEventListener('mousedown', closeOnOutside, true);
  document.addEventListener('keydown', closeOnKey, true);
  window.addEventListener('resize', closeOnResize, true);

  registerPopoverCleanup(() => document.removeEventListener('mousedown', closeOnOutside, true));
  registerPopoverCleanup(() => document.removeEventListener('keydown', closeOnKey, true));
  registerPopoverCleanup(() => window.removeEventListener('resize', closeOnResize, true));

  let players = [];
  const render = (q = '') => {
    list.innerHTML = '';
    if (!players.length) {
      const empty = document.createElement('div');
      empty.className = 'uno-picker-item';
      empty.style.opacity = '0.7';
      empty.textContent = 'Brak zawodnikow - sprawdz players.json';
      list.appendChild(empty);
      return;
    }
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? players.filter(p =>
          p.name.toLowerCase().includes(needle) ||
          (p.flag && p.flag.toLowerCase().includes(needle)))
      : players;

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'uno-picker-item';
      empty.style.opacity = '0.7';
      empty.textContent = 'Brak wynikow';
      list.appendChild(empty);
      return;
    }

    for (const p of filtered) {
      const row = document.createElement('div');
      row.className = 'uno-picker-item';

      let flagEl;
      if (p.flagUrl) {
        const img = document.createElement('img');
        img.src = p.flagUrl;
        img.alt = (p.flag || '').toUpperCase();
        img.className = 'uno-picker-flag';
        img.style.height = '18px';
        img.style.verticalAlign = 'middle';
        img.style.marginRight = '8px';
        flagEl = img;
      } else {
        const span = document.createElement('span');
        span.className = 'uno-picker-flag';
        if (p.flag) {
          span.textContent = String(p.flag).toUpperCase();
        } else {
          span.textContent = '?';
          span.style.opacity = '.5';
        }
        flagEl = span;
      }

      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;

      row.appendChild(flagEl);
      row.appendChild(nameSpan);

      let handled = false;
      const handleSelect = async () => {
        if (handled) return;
        handled = true;

        if (!opts.noNameWrite) await commitInputValue(targetInput, p.name);

        const extras = {};
        if (p.flagUrl) extras.flagUrl = p.flagUrl;
        if (p.flag) {
          extras.flag = p.flag;
          extras.flagCode = p.flag;
        }
        await mirrorScoreUpdate(
          playerLetter === 'A' ? 'SetNamePlayerA' : 'SetNamePlayerB',
          p.name,
          Object.keys(extras).length ? extras : null
        );

        const viaApi = await setFlagViaApi(playerLetter, p.flag || '', p.flagUrl);
        if (!viaApi && p.flag) setFlagViaUI(document, playerLetter, p.flag);

        closePopover();
        if (opts.noNameWrite && targetInput.__tempDummy) targetInput.remove();
      };

      // Desktop/mysz
      row.addEventListener('click', handleSelect);
      // Dotyk/tablet (gdy 'click' bywa połykany/opóźniony)
      if (supportsPointerEvents) {
        let touchSession = null;
        let touchMoved = false;
        const resetTouchSession = () => { touchSession = null; touchMoved = false; };
        row.addEventListener('pointerdown', (ev) => {
          if (ev.pointerType !== 'touch') return;
          touchSession = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
          touchMoved = false;
        }, { passive: true });
        row.addEventListener('pointermove', (ev) => {
          if (ev.pointerType !== 'touch' || !touchSession || touchSession.id !== ev.pointerId) return;
          const dx = Math.abs(ev.clientX - touchSession.x);
          const dy = Math.abs(ev.clientY - touchSession.y);
          if (dx > 6 || dy > 6) touchMoved = true;
        }, { passive: true });
        row.addEventListener('pointercancel', (ev) => {
          if (!touchSession || touchSession.id !== ev.pointerId) return;
          resetTouchSession();
        }, { passive: true });
        row.addEventListener('pointerup', (ev) => {
          if (ev.pointerType !== 'touch' || !touchSession || touchSession.id !== ev.pointerId) return;
          const moved = touchMoved;
          resetTouchSession();
          if (moved) return;
          Promise.resolve().then(handleSelect);
        }, { passive: true });
      } else {
        // Fallback dla starszych WebView
        row.addEventListener('touchend', () => {
          Promise.resolve().then(handleSelect);
        }, { passive: true });
      }

      list.appendChild(row);
      }
  };

  loadPlayers().then(ps => { players = ps; render(); }).catch(() => render());
  search.addEventListener('input', () => render(search.value));
  try { search.focus({ preventScroll: true }); } catch { search.focus(); }
}


// Wpiecie przyciskow i obsluga wejscia
function ensureUI() {
  if (!document.body) {
    return;
  }
  if (!document.body.querySelector || !document.body.querySelector('.app-field-label')) {
    return;
  }
  const { A, B } = getPlayerInputsFromSection();

  // Usun panel plywajacy jesli istnieje
  if (window.floatingPanel) {
    try { window.floatingPanel.remove(); } catch {}
    window.floatingPanel = null;
  }

  // Usun zblakane przyciski pickera poza sekcja Player Names
  document.querySelectorAll('.uno-picker-button').forEach(btn => {
    if (!btn.previousSibling || !btn.previousSibling.matches?.('input')) {
      btn.remove();
      }
  });

  const attach = (input, letter) => {
    if (!input || input.__unoWired) return;
    input.__unoWired = true;

    if (input.parentElement?.querySelector('.uno-picker-button')) return;

    const btn = document.createElement('button');
    btn.className = 'uno-picker-button';
    btn.type = 'button';
    btn.textContent = `Wybierz gracza ${letter}`;
    btn.style.marginLeft = '10px';
    input.parentElement?.insertBefore(btn, input.nextSibling);

    btn.addEventListener('click', () => showPickerFor(input, letter));
    input.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); showPickerFor(input, letter); }, true);
    input.addEventListener('focus', () => showPickerFor(input, letter), true);

    log(`Podlaczono picker do Player ${letter}`);
  };

  attach(A, 'A');
  attach(B, 'B');
}

const mo = new MutationObserver(() => { try { ensureUI(); } catch {} });
mo.observe(document.documentElement, { childList: true, subtree: true });
ensureUI();

