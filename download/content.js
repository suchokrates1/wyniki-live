// content.js
const log = (...a) => console.log('[UNO Picker]', ...a);

function storageGet(keys) {
  if (!chrome?.storage?.local?.get) return Promise.resolve({});
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        const err = chrome?.runtime?.lastError;
        if (err) {
          log('storage.get failed', err.message || err);
          resolve({});
          return;
        }
        resolve(result || {});
      });
    } catch (err) {
      log('storage.get error', err);
      resolve({});
    }
  });
}

function storageSet(items) {
  if (!chrome?.storage?.local?.set) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, () => {
        const err = chrome?.runtime?.lastError;
        if (err) {
          log('storage.set failed', err.message || err);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (err) {
      log('storage.set error', err);
      resolve(false);
    }
  });
}

const ready = (fn) => {
  window.__unoKortMap = window.__unoKortMap || {
    'app_7kvfwf2n2tqtcgflgqsocg': '1'
  };
  log('kort map', window.__unoKortMap);
  log('ready handler', { state: document.readyState });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
};

log('UNO Picker content init', { readyState: document.readyState });

function resolveKortFromDom() {
  try {
    const attrSelectors = ['[data-kort]', '[data-court]', '[data-court-id]'];
    for (const sel of attrSelectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = el.getAttribute('data-kort') || el.getAttribute('data-court') || el.getAttribute('data-court-id');
      if (raw && /\d+/.test(raw)) return raw.match(/\d+/)[0];
    }
    const candidates = document.querySelectorAll('nav *, header *, [class*="kort"], [id*="kort"], [class*="court"], [id*="court"]');
    for (const el of candidates) {
      const text = (el.textContent || '').trim();
      if (!text) continue;
      const match = text.match(/\b(kort|court)\s*(\d+)/i);
      if (match) return match[2];
    }
    const bodyText = document.body?.textContent || '';
    const match = bodyText.match(/\b(kort|court)\s*(\d+)/i);
    if (match) return match[2];
  } catch (err) {
    log('resolveKortFromDom error', err);
  }
  return null;
}

// Wstrzykniecie stylow pickera
const ensureStyle = () => {
  const cssUrl = chrome.runtime.getURL('picker.css');
  if (!document.querySelector(`link[href="${cssUrl}"]`)) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = cssUrl;
    document.documentElement.appendChild(l);
  }
};

ready(() => {
  ensureStyle();
  documentKort = documentKort || resolveKortFromDom();
  if (documentKort) {
    log('Detected kort', { kort: documentKort });
    const locOverlay = overlayFromLocation();
    if (locOverlay) setKortForOverlay(locOverlay, documentKort);
    if (uno.appInstance) setKortForOverlay(uno.appInstance, documentKort);
    if (lastAppId) setKortForOverlay(lastAppId, documentKort);
  } else {
    setTimeout(() => {
      if (!documentKort) {
        documentKort = resolveKortFromDom();
        if (documentKort) {
          log('Detected kort (delayed)', { kort: documentKort });
          const locOverlayDelayed = overlayFromLocation();
          if (locOverlayDelayed) setKortForOverlay(locOverlayDelayed, documentKort);
          if (uno.appInstance) setKortForOverlay(uno.appInstance, documentKort);
          if (lastAppId) setKortForOverlay(lastAppId, documentKort);
        }
      }
    }, 1000);
  }
});

function normalizeOverlayId(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number' || /^\d+$/.test(String(input).trim())) {
    return `app_${String(input).trim()}`.toLowerCase();
  }
  const str = String(input).trim();
  const match = str.match(/app_([A-Za-z0-9]+)/i);
  if (match) return `app_${match[1].toLowerCase()}`;
  return null;
}

function extractAppId(source) {
  try {
    return normalizeOverlayId(source);
  } catch {
    return null;
  }
}

function overlayFromLocation() {
  try {
    const match = window.location.pathname.match(/(?:control|output)\/([A-Za-z0-9]+)/i);
    if (match) return normalizeOverlayId(match[1]);
  } catch {}
  return null;
}

function setKortForOverlay(overlay, kort) {
  const normalizedOverlay = normalizeOverlayId(overlay);
  if (!normalizedOverlay || !kort) return;
  window.__unoKortMap = window.__unoKortMap || {};
  window.__unoKortMap[normalizedOverlay] = String(kort);
}

function parseSocketIoFrame(frame) {
  if (!frame || typeof frame !== 'string') return null;
  if (frame.startsWith('42')) {
    const json = frame.slice(2);
    try {
      const arr = JSON.parse(json);
      if (Array.isArray(arr) && arr.length) {
        return { eventName: arr[0], payload: arr[1], raw: arr };
      }
    } catch {}
  }
  return null;
}

function extractCommandFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.command === 'string') return payload.command;
  if (typeof payload.name === 'string') return payload.name;
  if (payload.data && typeof payload.data.command === 'string') return payload.data.command;
  if (payload.message && typeof payload.message.command === 'string') return payload.message.command;
  return null;
}

const SCORE_FIELD_COMMANDS = {
  PointsPlayerA: 'SetPointsPlayerA',
  PointsPlayerB: 'SetPointsPlayerB',
  PlayerAName: 'SetNamePlayerA',
  PlayerBName: 'SetNamePlayerB',
  Set1PlayerA: 'SetSet1PlayerA',
  Set1PlayerB: 'SetSet1PlayerB',
  Set2PlayerA: 'SetSet2PlayerA',
  Set2PlayerB: 'SetSet2PlayerB',
  Set3PlayerA: 'SetSet3PlayerA',
  Set3PlayerB: 'SetSet3PlayerB',
  CurrentSetPlayerA: 'SetCurrentSetPlayerA',
  CurrentSetPlayerB: 'SetCurrentSetPlayerB',
  CurrentSet: 'SetCurrentSet',
  Set: 'SetSet',
  TieBreakPlayerA: 'SetTieBreakPlayerA',
  TieBreakPlayerB: 'SetTieBreakPlayerB',
  TieBreakVisible: 'SetTieVisible',
  ShowTieBreak: 'ShowTieBreak',
  HideTieBreak: 'HideTieBreak',
  Serve: 'SetServe',
  Mode: 'SetMode',
  OverlayVisible: 'SetOverlayVisible'
};

function normalizeScoreValue(field, value) {
  let out = value;
  if (out && typeof out === 'object') {
    if (Array.isArray(out.v) && out.v.length) {
      out = out.v[out.v.length - 1];
    } else if ('value' in out) {
      out = out.value;
    } else if ('text' in out) {
      out = out.text;
    } else if (Array.isArray(out) && out.length) {
      out = out[out.length - 1];
    }
  }
  if (Array.isArray(out) && out.length) out = out[out.length - 1];
  if (out === 0 || out === '0') return 0;
  if (out === null || out === undefined) return 0;
  if (typeof out === 'number') return out;
  if (typeof out === 'boolean') return out;
  const str = String(out).trim();
  if (!str) return null;
  if (str === 'true' || str === 'false') return str === 'true';
  const num = Number(str);
  if (!Number.isNaN(num) && !/^0[0-9]/.test(str)) {
    if (/PlayerA|PlayerB|Points|Set|Current|TieBreak/i.test(field)) return num;
  }
  return str;
}

function sendScoreCommand(command, value, appId, extras) {
  if (!command) return;
  if (!chrome?.runtime?.id || typeof chrome.runtime.sendMessage !== 'function') {
    log('Score command skipped: runtime unavailable', { command, value });
    return;
  }
  const overlay = normalizeOverlayId(appId || uno.appInstance || lastAppId);
  if (!overlay) {
    log('Score command skipped: overlay missing', { command, value });
    return;
  }
  lastAppId = overlay;
  if (!window.__unoKortMap) window.__unoKortMap = {};
  if (extras && typeof extras === 'object' && extras.kort) setKortForOverlay(overlay, extras.kort);
  if (documentKort) setKortForOverlay(overlay, documentKort);
  const kort = window.__unoKortMap[overlay] || documentKort || '1';
  const message = buildScoreReflectMessage(overlay, kort, command, value, extras);
  log('UNO score reflect send', { command, value, overlay: message.overlay, kort: message.kort });
  try {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) {
        log('UNO score reflect error', chrome.runtime.lastError.message);
        return;
      }
      if (resp && resp.ok) {
        log('UNO score reflect ack', { command, status: resp.status });
      } else {
        log('UNO score reflect response', resp);
      }
    });
  } catch (err) {
    log('UNO score reflect send failed (runtime)', { command, message: err?.message || String(err) });
  }
}

const scoreStateByOverlay = new Map();

function resolveOverlayKey(rawOverlay) {
  const direct = normalizeOverlayId(rawOverlay);
  if (direct) return direct;
  if (uno?.appInstance) {
    const fromUno = normalizeOverlayId(uno.appInstance);
    if (fromUno) return fromUno;
  }
  if (lastAppId) {
    const fromLast = normalizeOverlayId(lastAppId);
    if (fromLast) return fromLast;
  }
  return null;
}

function getOverlayScoreState(overlayKey) {
  if (!overlayKey) return null;
  if (!scoreStateByOverlay.has(overlayKey)) {
    scoreStateByOverlay.set(overlayKey, {
      points: { A: null, B: null },
      tieBreak: { A: null, B: null },
      tieBreakVisible: false,
      tieBreakExplicit: null
    });
  }
  return scoreStateByOverlay.get(overlayKey);
}

function isTieBreakValueActive(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') {
    return value !== 0; // 0 nie aktywuje TB
  }
  const str = String(value).trim();
  if (!str.length) return false;
  if (str === '0') return false;
  const n = Number(str);
  if (!Number.isNaN(n)) return n !== 0;
  return true;
}

function setTieBreakVisibility(state, overlayKey, nextVisible, reason = 'auto') {
  if (!state) return;
  if (state.tieBreakVisible === nextVisible && reason === 'auto') return;
  state.tieBreakVisible = nextVisible;
  if (reason !== 'auto') {
    state.tieBreak.A = 0;
    state.tieBreak.B = 0;
    state.points.A = 0;
    state.points.B = 0;
  }
  const extras = { source: reason, player: null };
  if (reason === 'auto') extras.reason = 'tie-break-values';
  sendScoreCommand('SetTieVisible', nextVisible, overlayKey, extras);
  if (!nextVisible) {
    sendScoreCommand('HideTieBreak', false, overlayKey, { source: reason });
  }
}

function reflectPointsWithTieState(overlayKey, playerLetter) {
  const state = getOverlayScoreState(overlayKey);
  if (!state) return false;
  const tieActive = !!state.tieBreakVisible;
  const tieValue = state.tieBreak[playerLetter];
  const baseValue = state.points[playerLetter];
  const valueToSend = tieActive && tieValue !== null && tieValue !== undefined
    ? tieValue
    : baseValue;
  if (valueToSend === null || valueToSend === undefined) return false;

  const command = playerLetter === 'A' ? 'SetPointsPlayerA' : 'SetPointsPlayerB';
  const extras = {
    tieBreakActive: tieActive,
    pointsSource: tieActive ? 'tie-break' : 'regular',
    player: playerLetter,
    tieBreakValue: tieActive ? tieValue ?? valueToSend : null
  };
  if (tieActive) {
    extras.pointsColor = '#2b2b2b';
  }
  if (!extras.tieBreakActive || extras.tieBreakValue === null || extras.tieBreakValue === undefined) {
    delete extras.tieBreakValue;
  }
  if (tieActive && (tieValue === null || tieValue === undefined)) {
    extras.tieBreakFallback = true;
  }
  log('Reflect points with tie state', {
    overlay: overlayKey,
    player: playerLetter,
    value: valueToSend,
    tieBreakActive: tieActive,
    source: extras.pointsSource
  });
  sendScoreCommand(command, valueToSend, overlayKey, extras);
  return true;
}

function handleScoreFieldUpdate(overlayForEvent, field, command, value) {
  const overlayKey = resolveOverlayKey(overlayForEvent);
  const state = getOverlayScoreState(overlayKey);
  if (!state) return false;

  const updatePointsFor = (letter) => {
    reflectPointsWithTieState(overlayKey, letter);
  };

  if (field === 'PointsPlayerA') {
    state.points.A = value;
    updatePointsFor('A');
    return true;
  }
  if (field === 'PointsPlayerB') {
    state.points.B = value;
    updatePointsFor('B');
    return true;
  }
  if (field === 'TieBreakPlayerA') {
    state.tieBreak.A = value;
    const wasVisible = state.tieBreakVisible;
    const valueActive = isTieBreakValueActive(value);
    const otherActive = isTieBreakValueActive(state.tieBreak.B);
    if (state.tieBreakExplicit === null) {
      const nextVisible = valueActive || otherActive;
      if (nextVisible !== wasVisible) {
        setTieBreakVisibility(state, overlayKey, nextVisible, 'auto');
      }
    } else if (state.tieBreakExplicit === true) {
      // jeśli oba są nieaktywne (0) – wyłącz TB mimo trybu explicit
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
      player: 'A',
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
  if (!uno.appInstance || !command) return;
  const overlay = normalizeOverlayId(uno.appInstance);
  if (!overlay) return;
  const kort = window.__unoKortMap?.[overlay] || documentKort || '1';
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
  try { el.focus({ preventScroll: true }); } catch {}
  const proto = Object.getPrototypeOf(el);
  const desc =
    Object.getOwnPropertyDescriptor(proto, 'value') ||
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  if (desc?.set) desc.set.call(el, value);
  else el.value = value;

  const evtOpts = { bubbles: true, cancelable: true, composed: true };
  el.dispatchEvent(new Event('input', evtOpts));
  try { el.dispatchEvent(new InputEvent('input', { ...evtOpts, inputType: 'insertFromPaste', data: value })); } catch {}

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
  el.dispatchEvent(new Event('change', evtOpts));

  await new Promise(r => setTimeout(r, 30));
  try { el.dispatchEvent(new FocusEvent('blur', evtOpts)); } catch { el.dispatchEvent(new Event('blur', evtOpts)); }
  try { el.blur(); } catch {}
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
      row.addEventListener('click', async () => {
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
      });
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

