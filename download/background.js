// background.js
const SCORE_HOSTS = [
  'https://score.vestmediia.pl',
  'https://score.vestmedia.pl'
];
const REFLECT_PATH = '/api/local/reflect';
const SCORE_TIMEOUT_MS = 8000;

async function postScoreJson(path, payload, options = {}) {
  const { timeoutMs = SCORE_TIMEOUT_MS, headers: extraHeaders = {} } = options;
  const errors = [];

  for (const baseUrl of SCORE_HOSTS) {
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...extraHeaders
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const raw = await res.text();
      console.log('[UNO Picker][BG] score post', { url, status: res.status, ok: res.ok, preview: raw?.slice(0, 200) ?? null });
      if (res.ok) {
        clearTimeout(timer);
        return { ok: true, status: res.status, raw, url };
      }
      errors.push({ url, status: res.status, body: raw });
    } catch (err) {
      const message = err?.message || String(err);
      console.warn('[UNO Picker][BG] score post failed', { url, message });
      errors.push({ url, error: message });
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, errors };
}

function storageSet(items) {
  if (!chrome?.storage?.local?.set) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, () => {
        const err = chrome?.runtime?.lastError;
        if (err) {
          console.warn('[UNO Picker] storage.set failed', err.message || err);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (err) {
      console.warn('[UNO Picker] storage.set error', err);
      resolve(false);
    }
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'UNO_API_POST') {
      try {
        if (!msg.url) {
          sendResponse({ ok: false, error: 'Missing URL' });
          return;
        }

        const method = (msg.method || 'PUT').toUpperCase();
        const bodyString = typeof msg.body === 'string'
          ? msg.body
          : JSON.stringify(msg.body || {});

        let bodyParsed = null;
        if (typeof msg.body === 'string') {
          try { bodyParsed = JSON.parse(msg.body); } catch (_) {}
        } else if (msg.body && typeof msg.body === 'object') {
          bodyParsed = msg.body;
        }

        const fetchOptions = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(msg.token ? { Authorization: `Bearer ${msg.token}` } : {})
          },
          credentials: 'include'
        };

        if (method !== 'GET') {
          fetchOptions.body = bodyString;
        }

        console.log('[UNO Picker][BG] -> UNO', {
          url: msg.url,
          method,
          body: bodyParsed ?? bodyString
        });

        const res = await fetch(msg.url, fetchOptions);

        const raw = await res.text();
        let data = null;
        try { data = JSON.parse(raw); } catch (_) {}

        console.log('[UNO Picker][BG] <- UNO', {
          url: msg.url,
          status: res.status,
          ok: res.ok,
          rawPreview: raw?.slice(0, 200) ?? null
        });

        sendResponse({ ok: res.ok, status: res.status, data, raw });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    } else if (msg?.type === 'UNO_SCORE_REFLECT') {
      try {
        if (!msg.command) {
          sendResponse({ ok: false, error: 'command missing' });
          return;
        }
        const kort = String(msg.kort || '1');
        const path = `${REFLECT_PATH}/${encodeURIComponent(kort)}`;
        const body = { command: msg.command };
        if (msg.value !== undefined) body.value = msg.value;
        if (msg.extras && typeof msg.extras === 'object') {
          for (const [key, val] of Object.entries(msg.extras)) {
            if (key !== 'command' && key !== 'value') body[key] = val;
          }
        }
        if (msg.overlay) body.overlay = msg.overlay;
        body.kort = kort;
        if (msg.unoUrl) body.unoUrl = msg.unoUrl;
        if (msg.unoMethod) body.unoMethod = msg.unoMethod;
        if (msg.unoToken !== undefined) body.unoToken = msg.unoToken;
        if (msg.unoApp) body.unoApp = msg.unoApp;
        if (msg.reflectedAt) body.reflectedAt = msg.reflectedAt;

        console.log('[UNO Picker][BG] -> reflect', { kort, overlay: msg.overlay || null, command: msg.command });
        const result = await postScoreJson(path, body);
        if (result.ok) {
          sendResponse({ ok: true, status: result.status, host: result.url });
        } else {
          sendResponse({ ok: false, error: 'All score hosts failed', details: result.errors });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    } else if (msg?.type === 'UNO_SOCKET_EVENT') {
      console.log('[UNO Picker][BG] socket event', msg);
      sendResponse({ ok: true });
    } else if (msg?.type === 'UNO_DEBUG_EVENT') {
      console.log('[UNO Picker][BG] debug event', msg.event);
      sendResponse({ ok: true });
    } else if (msg?.type === 'UNO_BRIDGE_BROADCAST') {
      await storageSet({
        unoToken: msg.token || null,
        unoApp: msg.appInstance || null
      });
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: true });
    }
  })();
  return true; // async
});
