import { TRANSLATIONS, DEFAULT_LANG, SUPPORTED_LANGS, getTranslation } from './translations.js';
import { makeCourtCard, updateCourt, format, resolvePlayerName, announcePoints, announceGames } from './common.js';

let COURTS = [];
const grid = document.getElementById('grid');

let prev = {};

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

let eventSource = null;
let reconnectTimer = null;
let reconnectDelay = INITIAL_RECONNECT_DELAY;

const KORT_ID = grid.dataset.kort;
const LANG = grid.dataset.lang;

if (KORT_ID) {
    COURTS = [KORT_ID];
}

const storedLang = localStorage.getItem('preferred-language');
let currentLang = SUPPORTED_LANGS.includes(LANG) ? LANG : (SUPPORTED_LANGS.includes(storedLang) ? storedLang : DEFAULT_LANG);

function currentT() {
  return getTranslation(currentLang);
}

function lsKey(k) {
  return `announce-k${k}`;
}

function getAnnounce(k) {
  return localStorage.getItem(lsKey(k)) === 'on';
}

function setAnnounce(k, val) {
  localStorage.setItem(lsKey(k), val ? 'on' : 'off');
}

function ensureCardsFromSnapshot(snap) {
  if (!KORT_ID) return;
  const t = currentT();
  grid.innerHTML = '';
  const card = makeCourtCard(KORT_ID, currentLang, { showAnnounce: true });
  const cb = card.querySelector(`#announce-${KORT_ID}`);
  if (cb) {
      cb.checked = getAnnounce(KORT_ID);
      cb.addEventListener('change', () => setAnnounce(KORT_ID, cb.checked));
  }
  grid.appendChild(card);
}

function handleAnnouncement(k, type, ...args) {
    if (!getAnnounce(k)) return;
    const t = currentT();
    switch (type) {
        case 'announcePoints':
            announcePoints(k, ...args, currentLang);
            break;
        case 'announceGames':
            announceGames(k, ...args, currentLang);
            break;
    }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeEventSource() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function scheduleReconnect(reason) {
  clearReconnectTimer();
  const seconds = Math.round(reconnectDelay / 1000);
  console.error(`SSE disconnected: ${reason}; retrying in ${seconds}s`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectStream();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

function parseTimestamp(ts) {
  if (!ts) return null;
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date;
}

function handleStreamPayload(payload) {
    if (!payload) return;

    if (payload.type === 'snapshot') {
        const state = payload.state || {};
        if (state[KORT_ID]) {
            ensureCardsFromSnapshot(state);
            updateCourt(KORT_ID, state[KORT_ID], prev, currentLang, { announceCb: handleAnnouncement });
            prev = state;
        }
        return;
    }

    const kort = payload.kort;
    const state = payload.state;
    if (!kort || !state || kort !== KORT_ID) return;

    updateCourt(kort, state, prev, currentLang, { announceCb: handleAnnouncement });
    prev = { ...prev, [kort]: state };
}

function handleStreamMessage(event) {
  if (!event || !event.data) return;
  let payload = null;
  try {
    payload = JSON.parse(event.data);
  } catch (err) {
    console.error('Invalid SSE payload', err, event.data);
    return;
  }
  handleStreamPayload(payload);
}

function connectStream() {
  clearReconnectTimer();
  closeEventSource();
  try {
    eventSource = new EventSource('/api/stream');
  } catch (err) {
    scheduleReconnect('SSE connection error');
    return;
  }

  eventSource.addEventListener('open', () => {
    reconnectDelay = INITIAL_RECONNECT_DELAY;
  });
  eventSource.addEventListener('message', handleStreamMessage);
  eventSource.addEventListener('ping', () => {});
  eventSource.addEventListener('error', () => {
    closeEventSource();
    scheduleReconnect('SSE disconnected');
  });
}

window.addEventListener('beforeunload', () => {
  clearReconnectTimer();
  closeEventSource();
});

function computeCourts(data) {
  return Object.keys(data).sort((a, b) => Number(a) - Number(b));
}

(function () {
    if (KORT_ID) {
        const urlParams = new URLSearchParams(window.location.search);
        const langParam = urlParams.get('lang');
        if (langParam && SUPPORTED_LANGS.includes(langParam)) {
            currentLang = langParam;
        }
        ensureCardsFromSnapshot({});
        connectStream();
    } else {
        grid.innerHTML = '<p>Nieprawidłowy adres. Podaj numer kortu, np. /1</p>';
    }
})();
