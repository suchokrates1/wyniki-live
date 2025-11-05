import { TRANSLATIONS, DEFAULT_LANG, SUPPORTED_LANGS, getTranslation } from './translations.js';
import { makeCourtCard, updateCourt, format, resolvePlayerName } from './common.js';

let COURTS = [];
const grid = document.getElementById('grid');
const nav = document.querySelector('nav');
const navlist = document.getElementById('navlist');
const errLine = document.getElementById('errLine');
const pauseBtn = document.getElementById('pauseBtn');
const langSelect = document.getElementById('langSelect');
const langLabel = document.getElementById('langLabel');
const headerTitle = document.querySelector('header h1');
const headerDesc = document.querySelector('.desc');
const lastRefreshText = document.getElementById('lastRefreshText');
const historySection = document.getElementById('history-section');
const historyBody = document.getElementById('history-body');
const historyTitle = document.getElementById('history-title');

let paused = false;
let prev = {};
const COURT_SET_STATE = {};
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

let latestHistory = [];
const SNAPSHOT_STORAGE_KEY = 'score.vestmedia.snapshot.v1';

let eventSource = null;
let reconnectTimer = null;
let reconnectDelay = INITIAL_RECONNECT_DELAY;
let lastRefreshDate = null;
let lastError = null;

const storedLang = localStorage.getItem('preferred-language');
let currentLang = SUPPORTED_LANGS.includes(storedLang) ? storedLang : DEFAULT_LANG;

function currentT() {
  return getTranslation(currentLang);
}

function currentLocale() {
  const t = currentT();
  return t.htmlLang || currentLang;
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

function formatShortcutRange(count) {
  if (!count || count < 1) return '';
  if (count === 1) return '[1]';
  return `[1–${count}]`;
}

function updateShortcutsDescription() {
  if (!headerDesc) return;
  const t = currentT();
  const parts = [];
  if (t.description) parts.push(t.description);

  const shortcuts = t.shortcuts || {};
  const range = formatShortcutRange(COURTS.length);
  let shortcutsText = '';

  if (range && shortcuts.template) {
    shortcutsText = format(shortcuts.template, {
      range,
      courtsLabel: shortcuts.courtsLabel || '',
      count: COURTS.length
    }).trim();
  } else if (shortcuts.fallback) {
    shortcutsText = shortcuts.fallback;
  }

  if (shortcutsText) parts.push(shortcutsText);
  if (shortcuts.autoRead) parts.push(shortcuts.autoRead);

  headerDesc.textContent = parts.join(' ');
}

function ensureCardsFromSnapshot(snap) {
  const t = currentT();
  const targetCourts = Object.keys(snap).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    const aNaN = Number.isNaN(na);
    const bNaN = Number.isNaN(nb);
    if (aNaN && bNaN) return String(a).localeCompare(String(b));
    if (aNaN) return 1;
    if (bNaN) return -1;
    return na - nb;
  });

  const sameOrder = COURTS.length === targetCourts.length &&
    targetCourts.every((kort, idx) => COURTS[idx] === kort);

  COURTS = targetCourts;
  updateShortcutsDescription();
  if (sameOrder) {
    return;
  }

  navlist.innerHTML = '';
  COURTS.forEach(k => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="#kort-${k}">${format(t.courtLabel, { court: k })}</a>`;
    navlist.appendChild(li);
  });
  // Add History link at the end
  const liHistory = document.createElement('li');
  const historyLabel = (t.history && t.history.title) ? t.history.title : 'Historia';
  liHistory.innerHTML = `<a href="#history-section">${historyLabel}</a>`;
  navlist.appendChild(liHistory);
  grid.innerHTML = '';
  COURTS.forEach(k => {
    const card = makeCourtCard(k, currentLang, { showAnnounce: true });
    const cb = card.querySelector(`#announce-${k}`);
    if (cb) {
      cb.checked = getAnnounce(k);
      cb.addEventListener('change', () => setAnnounce(k, cb.checked));
    }
    grid.appendChild(card);
  });
}

function formatHistoryTimestamp(iso) {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString(currentLocale(), { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function _formatDurationLocal(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return '–';
  const mins = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function formatSetHistorySegment(setData) {
  if (!setData || typeof setData !== 'object') return null;
  const rawA = Number.parseInt(setData.A ?? setData.a ?? 0, 10);
  const rawB = Number.parseInt(setData.B ?? setData.b ?? 0, 10);
  const gamesA = Number.isNaN(rawA) ? 0 : rawA;
  const gamesB = Number.isNaN(rawB) ? 0 : rawB;
  if (gamesA === 0 && gamesB === 0) return null;
  const base = `${gamesA}–${gamesB}`;
  const tb = setData.tb;
  if (tb && typeof tb === 'object') {
    const rawTbA = Number.parseInt(tb.A ?? tb.a ?? 0, 10);
    const rawTbB = Number.parseInt(tb.B ?? tb.b ?? 0, 10);
    const tieA = Number.isNaN(rawTbA) ? 0 : rawTbA;
    const tieB = Number.isNaN(rawTbB) ? 0 : rawTbB;
    const played = Boolean(tb.played ?? (tieA || tieB));
    if (played && (tieA || tieB)) {
      return `${base}(${tieA}:${tieB})`;
    }
  }
  return base;
}

function renderGlobalHistory(history = []) {
  const section = document.getElementById('history-section');
  const body = document.getElementById('history-body');
  const title = document.getElementById('history-title');
  if (!section || !body) return;

  const t = currentT();
  if (title && t.history?.title) title.textContent = t.history.title;

  const PAGE = window.__histPage || 1;
  const SIZE = window.__histPageSize || 10;
  const total = Array.isArray(history) ? history.length : 0;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const page = Math.min(Math.max(1, PAGE), pages);
  window.__histPage = page;

  body.innerHTML = '';
  if (!history || !history.length) {
    section.classList.add('is-empty');
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = t.history?.empty || 'Brak zapisanych wyników.';
    body.appendChild(empty);
    return;
  }

  section.classList.remove('is-empty');
  const columnTranslations = t.history?.columns || {};
  const columns = {
    description: columnTranslations.description || 'Mecz',
    category: columnTranslations.category || 'Kategoria',
    phase: columnTranslations.phase || 'Faza',
    duration: columnTranslations.duration || 'Czas'
  };
  const list = document.createElement('div');
  list.className = 'history-list';
  const start = (page - 1) * SIZE;
  const slice = history.slice(start, start + SIZE);
  slice.forEach((entry) => {
    const item = document.createElement('dl');
    item.className = 'history-item';
    const playerA = resolvePlayerName(entry.players?.A || {}, 'defaultA', currentLang);
    const playerB = resolvePlayerName(entry.players?.B || {}, 'defaultB', currentLang);
    const setSegments = [];
    const set1 = formatSetHistorySegment(entry.sets?.set1);
    const set2 = formatSetHistorySegment(entry.sets?.set2);
    if (set1) setSegments.push(set1);
    if (set2) setSegments.push(set2);
    const tie = entry.sets?.tie || {};
    const duration = entry.duration_text || _formatDurationLocal(entry.duration_seconds || 0);
    const rawCategory = typeof entry.category === 'string' ? entry.category.trim() : '';
    const categoryText = rawCategory || '—';
    const rawPhase = typeof entry.phase === 'string' ? entry.phase.trim() : '';
    const phaseText = rawPhase || '—';

    const courtLabel = format(currentT().courtLabel, { court: entry.kort });
    const versusText = t.versus || 'vs';
    const head = `${courtLabel}, ${playerA} ${versusText} ${playerB}`;
    const segments = [...setSegments];
    if (tie.played) {
      const label = t.history?.labels?.supertb || 'SUPERTB';
      segments.push(`${label}: ${(tie.A ?? 0)}–${tie.B ?? 0}`);
    }
    const description = segments.length ? `${head} ${segments.join(', ')}` : head;

    const terms = [
      { label: columns.description, value: description, className: 'description' },
      { label: columns.category, value: categoryText, className: 'category' },
      { label: columns.phase, value: phaseText, className: 'phase' },
      { label: columns.duration, value: duration, className: 'duration' }
    ];
    terms.forEach(({ label, value, className }) => {
      const dt = document.createElement('dt');
      dt.className = `history-term history-term-${className}`;
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.className = `history-value history-value-${className}`;
      dd.textContent = typeof value === 'string' ? value : String(value ?? '');
      item.appendChild(dt);
      item.appendChild(dd);
    });
    list.appendChild(item);
  });

  body.appendChild(list);
  const pager = document.createElement('div');
  pager.className = 'history-controls';
  pager.innerHTML = `
    <button class="btn hist-prev" ${page <= 1 ? 'disabled' : ''}>&laquo;</button>
    <span class="hist-page">${page} / ${pages}</span>
    <button class="btn hist-next" ${page >= pages ? 'disabled' : ''}>&raquo;</button>
  `;
  body.appendChild(pager);
  const btnPrev = pager.querySelector('.hist-prev');
  const btnNext = pager.querySelector('.hist-next');
  if (btnPrev) btnPrev.addEventListener('click', () => { if (window.__histPage > 1) { window.__histPage--; renderGlobalHistory(history); } });
  if (btnNext) btnNext.addEventListener('click', () => { if (window.__histPage < pages) { window.__histPage++; renderGlobalHistory(history); } });
}

function renderError() {
  if (!lastError) {
    errLine.textContent = '';
    return;
  }
  const t = currentT();
  if (lastError.type === 'fetch' || lastError.type === 'sse') {
    errLine.textContent = format(t.errors.fetch, { message: lastError.message });
    return;
  }
  errLine.textContent = lastError.message || '';
}

async function fetchSnapshot() {
  try {
    const r = await fetch('/api/snapshot', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    lastError = null;
    renderError();
    return data;
  } catch (e) {
    lastError = { type: 'fetch', message: e.message };
    renderError();
    return null;
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
  if (paused) return;
  const seconds = Math.round(reconnectDelay / 1000);
  lastError = { type: 'sse', message: `${reason}; retrying in ${seconds}s` };
  renderError();
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
  if (!payload || paused) return;

  console.debug('[score.vestmedia] SSE payload', payload);

  if (payload.type === 'snapshot') {
    const state = payload.state || {};
    latestHistory = Array.isArray(payload.history) ? payload.history : latestHistory;
    renderGlobalHistory(latestHistory);
    ensureCardsFromSnapshot(state);
    const keys = computeCourts(state);
    COURTS = keys;
    updateShortcutsDescription();
    keys.forEach(k => {
      if (state[k]) updateCourt(k, state[k], prev, currentLang, { announceCb: handleAnnouncement });
    });
    prev = state;
    const snapshotTime = parseTimestamp(payload.ts) || new Date();
    updateLastRefresh(snapshotTime);
    persistSnapshot(prev, latestHistory, snapshotTime.toISOString());
    return;
  }

  const kort = payload.kort;
  const state = payload.state;
  if (!kort || !state) return;

  if (!COURTS.includes(kort)) {
    const merged = { ...prev, [kort]: state };
    ensureCardsFromSnapshot(merged);
    const keys = computeCourts(merged);
    COURTS = keys;
    updateShortcutsDescription();
    keys.forEach(k => {
      const courtState = merged[k];
      if (courtState) updateCourt(k, courtState, prev, currentLang, { announceCb: handleAnnouncement });
    });
    prev = merged;
  } else {
    updateCourt(kort, state, prev, currentLang, { announceCb: handleAnnouncement });
    prev = { ...prev, [kort]: state };
  }

  if (Array.isArray(payload.history)) {
    latestHistory = payload.history;
    renderGlobalHistory(latestHistory);
  }

  const updateTime = parseTimestamp(payload.ts) || new Date();
  updateLastRefresh(updateTime);
  persistSnapshot(prev, latestHistory, updateTime.toISOString());
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
  if (paused) return;
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
    lastError = null;
    renderError();
  });
  eventSource.addEventListener('message', handleStreamMessage);
  eventSource.addEventListener('ping', () => { });
  eventSource.addEventListener('error', () => {
    closeEventSource();
    scheduleReconnect('SSE disconnected');
  });
}

window.addEventListener('beforeunload', () => {
  clearReconnectTimer();
  closeEventSource();
});

function ensureHistoryToggle() {
  const section = document.getElementById('history-section');
  const title = document.getElementById('history-title');
  if (!section || !title) return;
  if (title.querySelector('#history-toggle')) return;
  const btn = document.createElement('button');
  btn.id = 'history-toggle';
  btn.className = 'btn';
  btn.type = 'button';
  btn.style.marginLeft = '8px';
  btn.setAttribute('aria-expanded', 'true');
  btn.textContent = '▼';
  btn.addEventListener('click', () => {
    const collapsed = section.classList.toggle('is-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.textContent = collapsed ? '►' : '▼';
  });
  title.appendChild(btn);
}

function computeCourts(data) {
  return Object.keys(data).sort((a, b) => Number(a) - Number(b));
}

function cloneStateForStorage(state) {
  try {
    return JSON.parse(JSON.stringify(state, (key, value) => (key === 'log' ? undefined : value)));
  } catch (err) {
    console.warn('[score] snapshot clone failed', err);
    return null;
  }
}

function cloneHistoryForStorage(history) {
  try {
    return JSON.parse(JSON.stringify(history || []));
  } catch (err) {
    console.warn('[score] history clone failed', err);
    return [];
  }
}

function persistSnapshot(state, history, ts) {
  if (!state || typeof state !== 'object') return;
  const clone = cloneStateForStorage(state);
  if (!clone) return;
  const histClone = cloneHistoryForStorage(history);
  try {
    const payload = {
      ts: ts || new Date().toISOString(),
      state: clone,
      history: histClone
    };
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[score] snapshot persist failed', err);
  }
}

function hydrateFromStorage() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.state || typeof parsed.state !== 'object') {
      return false;
    }
    const state = parsed.state;
    latestHistory = Array.isArray(parsed.history) ? parsed.history : [];
    ensureCardsFromSnapshot(state);
    const courts = computeCourts(state);
    COURTS = courts;
    updateShortcutsDescription();
    const prevBackup = prev;
    prev = prevBackup || {};
    courts.forEach(k => {
      if (state[k]) updateCourt(k, state[k], prev, currentLang, { announceCb: handleAnnouncement });
    });
    prev = state;
    renderGlobalHistory(latestHistory);
    if (parsed.ts) {
      const dt = new Date(parsed.ts);
      if (!Number.isNaN(dt.getTime())) {
        updateLastRefresh(dt);
      }
    }
    return true;
  } catch (err) {
    console.warn('[score] snapshot hydrate failed', err);
    return false;
  }
}

function updateLastRefresh(now) {
  if (now) {
    lastRefreshDate = now;
  }
  const t = currentT();
  if (!lastRefreshDate) {
    lastRefreshText.textContent = t.meta.lastRefreshNever;
    return;
  }
  const time = lastRefreshDate.toLocaleTimeString(currentLocale());
  lastRefreshText.textContent = format(t.meta.lastRefresh, { time });
}

function refreshNavLanguage() {
  const t = currentT();
  const links = navlist.querySelectorAll('a');
  links.forEach((link, idx) => {
    const court = COURTS[idx];
    if (court) {
      link.textContent = format(t.courtLabel, { court });
    }
  });
  const histLink = navlist.querySelector('a[href="#history-section"]');
  if (histLink && t.history?.title) histLink.textContent = t.history.title;
}

function refreshCardsLanguage() {
  const t = currentT();
  COURTS.forEach(k => {
    const card = document.getElementById(`kort-${k}`);
    if (card) {
      const newCard = makeCourtCard(k, currentLang, { showAnnounce: true });
      card.innerHTML = newCard.innerHTML;
      const cb = card.querySelector(`#announce-${k}`);
      if (cb) {
        cb.checked = getAnnounce(k);
        cb.addEventListener('change', () => setAnnounce(k, cb.checked));
      }
    }
    if (prev[k]) {
      updateCourt(k, prev[k], {}, currentLang, { announceCb: handleAnnouncement });
    }
  });

  if (historyTitle && t.history?.title) historyTitle.textContent = t.history.title;
  renderGlobalHistory(latestHistory);
}

function renderLanguage() {
  const t = currentT();
  document.documentElement.lang = t.htmlLang;
  document.title = t.title;
  if (headerTitle) headerTitle.textContent = t.title;
  updateShortcutsDescription();
  const liveBadge = document.getElementById('live-badge');
  if (liveBadge) liveBadge.textContent = t.liveBadge || 'LIVE';
  if (nav) nav.setAttribute('aria-label', t.navLabel);
  if (langLabel) langLabel.textContent = t.languageLabel;
  if (pauseBtn) pauseBtn.textContent = paused ? t.pause.resume : t.pause.pause;
  refreshNavLanguage();
  refreshCardsLanguage();
  updateLastRefresh();
  renderError();
  ensureHistoryToggle();
}

function applyLanguage(lang, { skipSave = false, skipSelect = false } = {}) {
  if (!TRANSLATIONS[lang]) lang = DEFAULT_LANG;
  currentLang = lang;
  if (!skipSave) localStorage.setItem('preferred-language', lang);
  if (!skipSelect && langSelect) langSelect.value = lang;
  renderLanguage();
}

async function bootstrap() {
  const snapshot = await fetchSnapshot();
  if (!snapshot) {
    updateLastRefresh();
    return;
  }
  const state = snapshot.state || {};
  latestHistory = Array.isArray(snapshot.history) ? snapshot.history : [];
  renderGlobalHistory(latestHistory);
  ensureCardsFromSnapshot(state);
  const computedCourts = computeCourts(state);
  COURTS = computedCourts;
  updateShortcutsDescription();
  computedCourts.forEach(k => {
    if (state[k]) updateCourt(k, state[k], prev, currentLang, { announceCb: handleAnnouncement });
  });
  prev = state;
  const now = new Date();
  updateLastRefresh(now);
  persistSnapshot(prev, latestHistory, now.toISOString());
}

if (pauseBtn) {
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    const t = currentT();
    pauseBtn.textContent = paused ? t.pause.resume : t.pause.pause;
    if (paused) {
      clearReconnectTimer();
      closeEventSource();
      lastError = null;
      renderError();
    } else {
      reconnectDelay = INITIAL_RECONNECT_DELAY;
      connectStream();
    }
  });
} else {
  paused = false;
  reconnectDelay = INITIAL_RECONNECT_DELAY;
  connectStream();
}

if (langSelect) {
  langSelect.addEventListener('change', () => {
    applyLanguage(langSelect.value);
  });
}

applyLanguage(currentLang, { skipSave: true, skipSelect: true });
if (langSelect) langSelect.value = currentLang;

hydrateFromStorage();

bootstrap()
  .catch(err => {
    console.error('Bootstrap failed', err);
  })
  .finally(() => {
    renderLanguage();
    connectStream();
  });

document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const target = e.target;
  const isField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
  if (isField) return;
  const key = e.key;
  if (/^[1-9]$/.test(key)) {
    const idx = Number(key) - 1;
    const court = COURTS[idx];
    if (court) {
      const el = document.getElementById(`kort-${court}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
});
