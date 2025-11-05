'use strict';

import { TRANSLATIONS, DEFAULT_LANG, SUPPORTED_LANGS, getTranslation } from './translations.js';
import { makeCourtCard, updateCourt } from './common.js';

let currentLang = DEFAULT_LANG;
let prev = {};

function currentT() {
  return getTranslation(currentLang);
}

function getKortIdFromPath() {
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);
  return parts.length > 0 ? parts[0] : null;
}

const KORT_ID = getKortIdFromPath();

function renderInitialScoreboard() {
  const grid = document.getElementById('grid');
  if (!KORT_ID || grid.querySelector(`#kort-${KORT_ID}`)) return;
  grid.innerHTML = '';
    const card = makeCourtCard(KORT_ID, currentLang, { showAnnounce: true });
    const cb = card.querySelector(`#announce-${KORT_ID}`);
    if (cb) {
        cb.checked = localStorage.getItem(`announce-k${KORT_ID}`) === 'on';
        cb.addEventListener('change', () => {
            localStorage.setItem(`announce-k${KORT_ID}`, cb.checked ? 'on' : 'off');
        });
    }
  grid.appendChild(card);
}

function handleAnnouncement(k, type, ...args) {
    if (localStorage.getItem(`announce-k${k}`) !== 'on') return;
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

function connect() {
  if (!KORT_ID) return;
  const stream = new EventSource('/api/stream');

  stream.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'snapshot') {
      if (data.state && data.state[KORT_ID]) {
        renderInitialScoreboard();
        updateCourt(KORT_ID, data.state[KORT_ID], prev, currentLang, { announceCb: handleAnnouncement });
        prev[KORT_ID] = data.state[KORT_ID];
      }
    } else if (data.type === 'kort-update' && data.kort === KORT_ID) {
      renderInitialScoreboard();
      updateCourt(KORT_ID, data.state, prev, currentLang, { announceCb: handleAnnouncement });
      prev[KORT_ID] = data.state;
    }
  };

  stream.onerror = () => {
    stream.close();
    setTimeout(connect, 3000);
  };
}

(function () {
  const grid = document.getElementById('grid');
  if (KORT_ID) {
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    if (langParam && SUPPORTED_LANGS.includes(langParam)) {
      currentLang = langParam;
    }
    renderInitialScoreboard();
    connect();
  } else {
    grid.innerHTML = '<p>Nieprawidłowy adres. Podaj numer kortu, np. /1</p>';
  }
})();
