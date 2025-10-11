import { TRANSLATIONS, DEFAULT_LANG, SUPPORTED_LANGS, getTranslation } from './translations.js';

function format(str, values = {}) {
  return str.replace(/\{(\w+)\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : `{${key}}`;
  });
}

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

function resolveAccessibilityStrings(t) {
  const acc = t.accessibility || {};
  const columns = t.table?.columns || {};
  let versus = acc.versus;
  if (!versus) {
    if (currentLang === DEFAULT_LANG) {
      versus = 'kontra';
    } else if (currentLang === 'en') {
      versus = 'versus';
    } else {
      versus = t.versus || 'versus';
    }
  }
  const rawPoints = acc.points || columns.points || 'Points';
  const points = rawPoints.replace(/\s*\(.*?\)\s*/g, '').trim() || 'Points';
  const tieBreak = acc.tieBreak || columns.tieBreak || 'tie-break';
  const superTieBreak = acc.superTieBreak || columns.superTieBreak || `super ${tieBreak}`;
  let setTemplate = acc.set;
  if (!setTemplate) {
    const rawSet = columns?.set1;
    if (typeof rawSet === 'string') {
      const cleaned = rawSet.split('(')[0].trim();
      const replaced = cleaned.replace(/\d+/, '{number}');
      if (replaced && replaced.includes('{number}')) {
        setTemplate = replaced;
      }
    }
  }
  if (!setTemplate || !setTemplate.includes('{number}')) {
    setTemplate = 'Set {number}';
  }
  const active = acc.active || 'active';
  return { versus, points, tieBreak, superTieBreak, setTemplate, active };
}

function computeTieVisibility(tieState) {
  if (!tieState || typeof tieState !== 'object') return false;
  const rawA = Number.parseInt(tieState.A ?? tieState.a ?? 0, 10);
  const rawB = Number.parseInt(tieState.B ?? tieState.b ?? 0, 10);
  const safeA = Number.isNaN(rawA) ? 0 : rawA;
  const safeB = Number.isNaN(rawB) ? 0 : rawB;
  if (safeA !== 0 || safeB !== 0) {
    return true;
  }
  return false;
}

function flash(el) {
  if (!el) return;
  el.classList.add('changed');
  setTimeout(() => el.classList.remove('changed'), 1200);
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

function makeCourtCard(k) {
  const t = currentT();
  const acc = resolveAccessibilityStrings(t);
  const courtLabel = format(t.courtLabel, { court: k });
  const defaultA = t.players.defaultA;
  const defaultB = t.players.defaultB;
  const columns = t.table?.columns || {};
  const pointsLabel = columns.points || acc.points;
  const tieBreakLabel = columns.tieBreak || acc.tieBreak;
  const superTieBreakLabel = columns.superTieBreak || acc.superTieBreak;
  const setLabel = (idx) => columns[`set${idx}`] || format(acc.setTemplate, { number: idx });
  const set1Label = setLabel(1);
  const set2Label = setLabel(2);

  const section = document.createElement('section');
  section.className = 'card';
  section.id = `kort-${k}`;
  section.setAttribute('aria-labelledby', `heading-${k}`);
  section.innerHTML = `
    <div class="card-head">
      <h2 id="heading-${k}">
        <span class="court-label" id="court-label-${k}">${courtLabel}</span>:
        <span id="title-${k}" class="match-title">
          <span class="match-player" data-title="A">${defaultA}</span>
          <span class="match-versus" id="title-${k}-versus" aria-label="${acc.versus}"><span aria-hidden="true">${t.versus}</span><span class="sr-only">${acc.versus}</span></span>
          <span class="match-player" data-title="B">${defaultB}</span>
        </span>
      </h2>
      <label class="control">
        <input type="checkbox" id="announce-${k}">
        <span>${t.announceLabel}</span>
      </label>
    </div>

    <div class="score-wrapper">
      <dl class="score-list" aria-labelledby="heading-${k}" aria-hidden="true">
        <div class="score-row" data-side="A">
          <dt class="player-cell">
            <span class="player-flag" id="k${k}-flag-A" aria-hidden="true"></span>
            <span class="player-name" id="k${k}-name-A">${defaultA}</span>
          </dt>
          <dd class="metric points" aria-labelledby="k${k}-label-points k${k}-name-A">
            <span class="metric-label" id="k${k}-label-points" data-default-label="${pointsLabel}" data-tie-label="${tieBreakLabel}" data-super-label="${superTieBreakLabel}">${pointsLabel}</span>
            <span class="metric-value points" id="k${k}-pts-A">0</span>
          </dd>
          <dd class="metric set-1" aria-labelledby="k${k}-label-set1 k${k}-name-A">
            <span class="metric-label" id="k${k}-label-set1">${set1Label}</span>
            <span class="metric-value set set-1" id="k${k}-s1-A">0</span>
          </dd>
          <dd class="metric set-2" aria-labelledby="k${k}-label-set2 k${k}-name-A">
            <span class="metric-label" id="k${k}-label-set2">${set2Label}</span>
            <span class="metric-value set set-2" id="k${k}-s2-A">0</span>
          </dd>
        </div>
        <div class="score-row" data-side="B">
          <dt class="player-cell">
            <span class="player-flag" id="k${k}-flag-B" aria-hidden="true"></span>
            <span class="player-name" id="k${k}-name-B">${defaultB}</span>
          </dt>
          <dd class="metric points" aria-labelledby="k${k}-label-points k${k}-name-B">
            <span class="metric-value points" id="k${k}-pts-B">0</span>
          </dd>
          <dd class="metric set-1" aria-labelledby="k${k}-label-set1 k${k}-name-B">
            <span class="metric-value set set-1" id="k${k}-s1-B">0</span>
          </dd>
          <dd class="metric set-2" aria-labelledby="k${k}-label-set2 k${k}-name-B">
            <span class="metric-value set set-2" id="k${k}-s2-B">0</span>
          </dd>
        </div>
      </dl>
    </div>
    <p class="sr-only score-summary" id="k${k}-summary" aria-live="polite"></p>
  `;

  const cb = section.querySelector(`#announce-${k}`);
  cb.checked = getAnnounce(k);
  cb.addEventListener('change', () => setAnnounce(k, cb.checked));

  const heading = section.querySelector(`#heading-${k}`);
  if (heading) {
    heading.setAttribute('aria-label', `${courtLabel}: ${defaultA} ${acc.versus} ${defaultB}`);
  }

  // live region removed to reduce redundant announcements

  return section;
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
  COURTS.forEach(k => grid.appendChild(makeCourtCard(k)));
}

function setStatus(k, visible, tieVisible) {
  const t = currentT();
  const p = document.getElementById(`status-${k}`);
  if (!p) return;
  const dot = p.querySelector('.dot');
  const txt = p.querySelector('.txt');

  let stateKey = 'unknown';
  if (visible === true) stateKey = 'visible';
  else if (visible === false) stateKey = 'hidden';

  let tieKey = 'off';
  if (tieVisible === true) tieKey = 'yes';
  else if (tieVisible === false) tieKey = 'no';

  txt.textContent = format(t.status.label, {
    state: t.status.states[stateKey],
    tiebreak: t.status.tiebreak[tieKey]
  });

  if (visible === true) {
    dot.classList.remove('off');
    dot.classList.add('on');
  } else {
    dot.classList.remove('on');
    dot.classList.add('off');
  }
}

function announce(k, text) {
  // Live region removed – keep function as no-op for compatibility
}

function fallbackPlayerName(surname, type) {
  const t = currentT();
  if (surname && surname !== '-') return surname;
  return type === 'opponent' ? t.players.fallbackOpponent : t.players.fallback;
}

function announcePoints(k, surname, pointsText) {
  const t = currentT();
  const player = fallbackPlayerName(surname, 'player');
  announce(k, format(t.announcements.points, { player, value: pointsText }));
}

function announceGames(k, surname, games) {
  const t = currentT();
  const player = fallbackPlayerName(surname, 'player');
  announce(k, format(t.announcements.games, { player, value: games }));
}

function announceSetEnd(k, winnerSurname, winnerGames, loserSurname, loserGames) {
  const t = currentT();
  const winner = fallbackPlayerName(winnerSurname, 'player');
  const loser = fallbackPlayerName(loserSurname, 'opponent');
  announce(k, format(t.announcements.setEnd, {
    winner,
    winnerGames,
    loser,
    loserGames
  }));
}

function announceTiePoint(k, surname, value) {
  const t = currentT();
  const player = fallbackPlayerName(surname, 'player');
  announce(k, format(t.announcements.tiePoint, { player, value }));
}

function announceTieToggle(k, on) {
  const t = currentT();
  announce(k, on ? t.announcements.tieToggleOn : t.announcements.tieToggleOff);
}

function resolvePlayerName(playerData, fallbackKey) {
  const t = currentT();
  if (playerData && typeof playerData === 'object') {
    const full = playerData.full_name || playerData.fullName;
    if (full && String(full).trim()) return String(full).trim();
    const surname = playerData.surname;
    if (surname && surname !== '-') return surname;
  } else if (typeof playerData === 'string' && playerData.trim()) {
    return playerData.trim();
  }
  return t.players[fallbackKey];
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

  // pagination
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
    const playerA = resolvePlayerName(entry.players?.A || {}, 'defaultA');
    const playerB = resolvePlayerName(entry.players?.B || {}, 'defaultB');
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
    const accStrings = resolveAccessibilityStrings(t);
    const versusText = accStrings.versus || currentT().versus || 'vs';
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
    <button class="btn hist-prev" ${page<=1?'disabled':''}>&laquo;</button>
    <span class="hist-page">${page} / ${pages}</span>
    <button class="btn hist-next" ${page>=pages?'disabled':''}>&raquo;</button>
  `;
  body.appendChild(pager);
  const btnPrev = pager.querySelector('.hist-prev');
  const btnNext = pager.querySelector('.hist-next');
  if (btnPrev) btnPrev.addEventListener('click', () => { if (window.__histPage>1){ window.__histPage--; renderGlobalHistory(history); }});
  if (btnNext) btnNext.addEventListener('click', () => { if (window.__histPage<pages){ window.__histPage++; renderGlobalHistory(history); }});
}

function updatePointsLabelText(k, tieVisible, isSuperTieBreak) {
  const label = document.getElementById(`k${k}-label-points`);
  if (!label) return;
  const defaultLabel = label.getAttribute('data-default-label') || label.textContent || '';
  const tieLabel = label.getAttribute('data-tie-label') || defaultLabel;
  const superLabel = label.getAttribute('data-super-label') || tieLabel;
  const target = tieVisible ? (isSuperTieBreak ? superLabel : tieLabel) : defaultLabel;
  if (label.textContent !== target) {
    label.textContent = target;
  }
}

function applyScoreAria(k, data) {
  const section = document.getElementById(`kort-${k}`);
  if (!section) return;
  const list = section.querySelector('.score-list');
  if (!list) return;
  const summaryRoot = document.getElementById(`k${k}-summary`);
  const t = currentT();
  const acc = resolveAccessibilityStrings(t);
  const currentSet = Number(data.current_set || 1);
  const tieState = data.tie || {};
  const tieVisible = tieState.visible === true;
  const isSuperTieBreak = tieVisible && currentSet === 3;

  updatePointsLabelText(k, tieVisible, isSuperTieBreak);

  const pointsLabelEl = document.getElementById(`k${k}-label-points`);
  const domPointsLabel = (pointsLabelEl?.textContent || '').trim();
  const pointsLabelText = tieVisible
    ? (isSuperTieBreak ? acc.superTieBreak : acc.tieBreak)
    : (domPointsLabel || acc.points);

  const summaryParts = [];

  const pointsAText = tieVisible
    ? normalizeTieDisplay(tieState.A)
    : normalizePointsDisplay(data?.A?.points);
  const pointsBText = tieVisible
    ? normalizeTieDisplay(tieState.B)
    : normalizePointsDisplay(data?.B?.points);

  summaryParts.push(`${pointsLabelText} ${pointsAText}:${pointsBText}`);

  const setSegments = [];
  [
    { index: 1, a: data?.A?.set1, b: data?.B?.set1, nodeId: `k${k}-label-set1` },
    { index: 2, a: data?.A?.set2, b: data?.B?.set2, nodeId: `k${k}-label-set2` }
  ].forEach(({ index, a, b, nodeId }) => {
    const safeA = a === undefined || a === null ? '0' : String(a).trim() || '0';
    const safeB = b === undefined || b === null ? '0' : String(b).trim() || '0';
    const aNum = Number.parseInt(safeA, 10) || 0;
    const bNum = Number.parseInt(safeB, 10) || 0;
    const include = index === 1 || currentSet >= index || aNum > 0 || bNum > 0;
    if (!include) return;
    const labelEl = document.getElementById(nodeId);
    const fallbackLabel = format(acc.setTemplate, { number: index });
    const labelText = (labelEl?.textContent || '').trim() || fallbackLabel;
    const isActive = currentSet === index;
    if (labelEl) {
      if (isActive) {
        labelEl.setAttribute('aria-label', `${labelText}, ${acc.active}`);
      } else {
        labelEl.removeAttribute('aria-label');
      }
    }
    const segment = isActive
      ? `${labelText}, ${acc.active}, ${safeA}:${safeB}`
      : `${labelText} ${safeA}:${safeB}`;
    setSegments.push(segment);
  });

  setSegments.forEach(segment => summaryParts.push(segment));

  if (summaryRoot) {
    const summaryText = summaryParts.join('. ').trim();
    const finalText = summaryText.length ? summaryText : '';
    if (summaryRoot.textContent !== finalText) {
      summaryRoot.textContent = finalText;
    }
  }
}

function updateTitle(k, Adata, Bdata) {
  const t = currentT();
  const acc = resolveAccessibilityStrings(t);
  const title = document.getElementById(`title-${k}`);
  const safeA = resolvePlayerName(Adata, 'defaultA');
  const safeB = resolvePlayerName(Bdata, 'defaultB');

  if (title) {
    const nameAEl = title.querySelector('[data-title="A"]');
    const nameBEl = title.querySelector('[data-title="B"]');
    const versusEl = title.querySelector('.match-versus');
    if (nameAEl && nameBEl && versusEl) {
      nameAEl.textContent = safeA;
      nameBEl.textContent = safeB;
      // visible abbreviation + screenreader-friendly label
      const vis = versusEl.querySelector('[aria-hidden="true"]');
      const sr = versusEl.querySelector('.sr-only');
      if (vis) vis.textContent = t.versus;
      if (sr) sr.textContent = acc.versus;
      versusEl.setAttribute('aria-label', acc.versus);
    } else {
      title.textContent = `${safeA} | ${safeB}`;
    }
  }
  const legacyCaption = document.getElementById(`cap-${k}`);
  if (legacyCaption) {
    legacyCaption.remove();
  }
  const courtLabelText = format(t.courtLabel, { court: k });
  const courtLabel = document.getElementById(`court-label-${k}`);
  if (courtLabel) {
    courtLabel.textContent = courtLabelText;
  }
  const heading = document.getElementById(`heading-${k}`);
  if (heading) {
    heading.setAttribute('aria-label', `${courtLabelText}: ${safeA} ${acc.versus} ${safeB}`);
  }
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function latestValue(current, previous, key) {
  if (hasOwn(current, key)) return current[key];
  if (hasOwn(previous, key)) return previous[key];
  return undefined;
}

function normalizeGamesValue(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed === '-') return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function determineSetWinner(gamesA, gamesB) {
  if (typeof gamesA !== 'number' || typeof gamesB !== 'number') return null;
  if (gamesA < 0 || gamesB < 0) return null;
  const maxGames = Math.max(gamesA, gamesB);
  if (maxGames < 6) return null;
  const diff = Math.abs(gamesA - gamesB);
  if (diff >= 2) return gamesA > gamesB ? 'A' : 'B';
  if (gamesA === 7 && gamesB === 6) return 'A';
  if (gamesB === 7 && gamesA === 6) return 'B';
  return null;
}

function maybeAnnounceSetCompletion(k, info, surnames) {
  const prevWinner = determineSetWinner(info.prevA, info.prevB);
  const newWinner = determineSetWinner(info.currentA, info.currentB);
  const changedScore = info.prevA !== info.currentA || info.prevB !== info.currentB;
  if (!newWinner) return;
  if (!prevWinner || prevWinner !== newWinner || changedScore) {
    const winnerName = newWinner === 'A' ? surnames.A : surnames.B;
    const loserName = newWinner === 'A' ? surnames.B : surnames.A;
    const winnerGames = newWinner === 'A' ? info.currentA : info.currentB;
    const loserGames = newWinner === 'A' ? info.currentB : info.currentA;
    announceSetEnd(k, winnerName, winnerGames ?? 0, loserName, loserGames ?? 0);
  }
}

function comparableTieValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed === '-') return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? trimmed : parsed;
  }
  return value;
}

function collectTieScoreChanges(current, previous, path = [], acc = []) {
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    const normalizedCurrent = comparableTieValue(current);
    const normalizedPrev = comparableTieValue(previous);
    if (normalizedCurrent === undefined || normalizedCurrent === null) return acc;
    if (normalizedCurrent === normalizedPrev) return acc;
    acc.push({ path, value: normalizedCurrent });
    return acc;
  }

  Object.keys(current).forEach(key => {
    if (key === 'visible') return;
    collectTieScoreChanges(current[key], previous ? previous[key] : undefined, path.concat(key), acc);
  });
  return acc;
}

function resolveTiePlayerFromPath(path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  const last = path[path.length - 1];
  if (last === 'A' || last === 'B') return 'A' || 'B';
  if (typeof last === 'string') {
    const upper = last.toUpperCase();
    if (upper.endsWith('A')) return 'A';
    if (upper.endsWith('B')) return 'B';
  }
  return null;
}

function handleTieScoreAnnouncements(k, tieNow, tiePrev, surnames) {
  if (!tieNow || typeof tieNow !== 'object') return;
  const changes = collectTieScoreChanges(tieNow, tiePrev || {});
  if (!changes.length) return;

  const directPlayers = new Set(
    changes
      .filter(change => change.path.length === 1 && (change.path[0] === 'A' || change.path[0] === 'B'))
      .map(change => change.path[0])
  );

  changes.forEach(change => {
    const player = resolveTiePlayerFromPath(change.path);
    if (!player) return;
    if (change.path.length > 1 && directPlayers.has(player)) return;
    const value = change.value;
    if (value === undefined || value === null) return;
    announceTiePoint(k, player === 'A' ? surnames.A : surnames.B, value);
  });
}

function updateCourt(k, data) {
  const prevK = prev[k] || { A: {}, B: {}, tie: {} };
  const rawTieNow = data.tie || {};
  const rawTiePrev = prevK.tie || {};
  const tieNow = { ...rawTieNow, visible: computeTieVisibility(rawTieNow) };
  const tiePrev = { ...rawTiePrev, visible: computeTieVisibility(rawTiePrev) };
  const dataWithTie = { ...data, tie: tieNow };
  data.tie = tieNow;

  setStatus(k, data.overlay_visible, tieNow.visible);

  const A = data.A || {};
  const B = data.B || {};
  const surnameA = A.surname || prevK?.A?.surname;
  const surnameB = B.surname || prevK?.B?.surname;

  updatePlayerFlag(k, 'A', A, prevK.A || {});
  updatePlayerFlag(k, 'B', B, prevK.B || {});

  const nextNameA = resolvePlayerName(A, 'defaultA');
  const nextNameB = resolvePlayerName(B, 'defaultB');
  let nameAChanged = false;
  let nameBChanged = false;
  const nameCellA = document.getElementById(`k${k}-name-A`);
  if (nameCellA) {
    const prevText = nameCellA.textContent || '';
    if (prevText !== nextNameA) {
      nameCellA.textContent = nextNameA;
      flash(nameCellA);
      nameAChanged = true;
    }
  }
  const nameCellB = document.getElementById(`k${k}-name-B`);
  if (nameCellB) {
    const prevText = nameCellB.textContent || '';
    if (prevText !== nextNameB) {
      nameCellB.textContent = nextNameB;
      flash(nameCellB);
      nameBChanged = true;
    }
  }
  if (nameAChanged || nameBChanged) {
    updateTitle(k, A, B);
  }

  const pointsA = resolveDisplayedPoints('A', A, prevK.A || {}, tieNow, tiePrev);
  const pointsB = resolveDisplayedPoints('B', B, prevK.B || {}, tieNow, tiePrev);

  const cellA = document.getElementById(`k${k}-pts-A`);
  if (cellA) {
    const prevText = cellA.textContent;
    const nextText = pointsA.text;
    const textChanged = prevText !== nextText;
    if (textChanged) animatePointsChange(cellA, prevText, nextText); else cellA.textContent = nextText;
    cellA.classList.toggle('is-tiebreak', pointsA.isTie);
    if (textChanged) {
      flash(cellA);
      if (nextText === 'ADV' || nextText === '40') {
        cellA.classList.add('flip-strong');
        setTimeout(() => cellA.classList.remove('flip-strong'), 450);
      }
      announcePoints(k, surnameA, nextText);
    }
  }

  const cellB = document.getElementById(`k${k}-pts-B`);
  if (cellB) {
    const prevText = cellB.textContent;
    const nextText = pointsB.text;
    const textChanged = prevText !== nextText;
    if (textChanged) animatePointsChange(cellB, prevText, nextText); else cellB.textContent = nextText;
    cellB.classList.toggle('is-tiebreak', pointsB.isTie);
    if (textChanged) {
      flash(cellB);
      if (nextText === 'ADV' || nextText === '40') {
        cellB.classList.add('flip-strong');
        setTimeout(() => cellB.classList.remove('flip-strong'), 450);
      }
      announcePoints(k, surnameB, nextText);
    }
  }

  if (A.set1 !== undefined && A.set1 !== prevK?.A?.set1) {
    const cell = document.getElementById(`k${k}-s1-A`);
    if (cell) {
      cell.textContent = A.set1 ?? 0;
      flash(cell);
      announceGames(k, surnameA, cell.textContent);
    }
  }
  if (B.set1 !== undefined && B.set1 !== prevK?.B?.set1) {
    const cell = document.getElementById(`k${k}-s1-B`);
    if (cell) {
      cell.textContent = B.set1 ?? 0;
      flash(cell);
      announceGames(k, surnameB, cell.textContent);
    }
  }

  if (A.set2 !== undefined && A.set2 !== prevK?.A?.set2) {
    const cell = document.getElementById(`k${k}-s2-A`);
    if (cell) {
      cell.textContent = A.set2 ?? 0;
      flash(cell);
      announceGames(k, surnameA, cell.textContent);
    }
  }
  if (B.set2 !== undefined && B.set2 !== prevK?.B?.set2) {
    const cell = document.getElementById(`k${k}-s2-B`);
    if (cell) {
      cell.textContent = B.set2 ?? 0;
      flash(cell);
      announceGames(k, surnameB, cell.textContent);
    }
  }
  const surnames = { A: surnameA, B: surnameB };

  const setInfos = ['set1', 'set2', 'set3'].map(key => ({
    key,
    currentA: normalizeGamesValue(latestValue(A, prevK.A, key)),
    currentB: normalizeGamesValue(latestValue(B, prevK.B, key)),
    prevA: normalizeGamesValue(prevK?.A?.[key]),
    prevB: normalizeGamesValue(prevK?.B?.[key])
  }));

  setInfos.forEach(info => {
    if (info.currentA === undefined && info.currentB === undefined) return;
    maybeAnnounceSetCompletion(k, info, surnames);
  });

  const wins = setInfos.reduce((acc, info) => {
    const winner = determineSetWinner(info.currentA, info.currentB);
    if (winner === 'A') acc.A += 1;
    else if (winner === 'B') acc.B += 1;
    return acc;
  }, { A: 0, B: 0 });

  const hadPrevCounts = Object.prototype.hasOwnProperty.call(COURT_SET_STATE, k);
  const prevCounts = COURT_SET_STATE[k] || { winsA: 0, winsB: 0, splitAnnounced: false };
  const reachedSplitNow = wins.A === 1 && wins.B === 1;
  const tieVisibilityTurnedOn = tieNow.visible === true && tiePrev?.visible !== true;

  if (hadPrevCounts && reachedSplitNow && !prevCounts.splitAnnounced && !tieVisibilityTurnedOn) {
    announceTieToggle(k, true);
  }

  COURT_SET_STATE[k] = { winsA: wins.A, winsB: wins.B, splitAnnounced: reachedSplitNow };

  if (tieNow.visible !== undefined && tieNow.visible !== tiePrev.visible) {
    announceTieToggle(k, tieNow.visible === true);
  }

  handleTieScoreAnnouncements(k, tieNow, tiePrev, surnames);
  applyScoreAria(k, dataWithTie);

  applySetHighlight(k, data.current_set ?? 1);
}

function normalizePointsDisplay(value) {
  if (value === undefined || value === null) return '0';
  const text = String(value).trim();
  if (!text || text === '-') return '0';
  return text;
}

function normalizeTieDisplay(value) {
  if (value === undefined || value === null) return '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '0';
    return String(value);
  }
  const text = String(value).trim();
  if (!text || text === '-') return '0';
  const parsed = Number.parseInt(text, 10);
  return Number.isNaN(parsed) ? text : String(parsed);
}

function resolveDisplayedPoints(side, currentPlayer, previousPlayer, tieNow, tiePrev) {
  const tieCurrent = tieNow || {};
  const tiePrevious = tiePrev || {};
  if (tieCurrent.visible === true) {
    const raw = latestValue(tieCurrent, tiePrevious, side);
    return {
      text: normalizeTieDisplay(raw),
      isTie: true
    };
  }
  const rawPoints = latestValue(currentPlayer || {}, previousPlayer || {}, 'points');
  return {
    text: normalizePointsDisplay(rawPoints),
    isTie: false
  };
}

function animatePointsChange(cell, prevText, nextText) {
  try {
    const old = String(prevText ?? '');
    const neu = String(nextText ?? '');
    const max = Math.max(old.length, neu.length);
    const container = document.createElement('span');
    container.className = 'digits';
    for (let i = 0; i < max; i++) {
      const chOld = old[i] ?? '';
      const chNew = neu[i] ?? '';
      const digit = document.createElement('span');
      digit.className = 'digit';
      const spanOld = document.createElement('span');
      spanOld.className = 'd-old';
      spanOld.textContent = chOld;
      const spanNew = document.createElement('span');
      spanNew.className = 'd-new';
      spanNew.textContent = chNew;
      digit.append(spanOld, spanNew);
      container.appendChild(digit);
    }
    cell.innerHTML = '';
    cell.appendChild(container);
    cell.classList.add('rolling');
    setTimeout(() => {
      cell.classList.remove('rolling');
      cell.textContent = nextText;
    }, 350);
  } catch {
    cell.textContent = nextText;
  }
}

function updatePlayerFlag(k, side, current, previous) {
  const el = document.getElementById(`k${k}-flag-${side}`);
  if (!el) return;

  const currentUrl = current?.flag_url || current?.flagUrl || null;
  const previousUrl = previous?.flag_url || previous?.flagUrl || null;
  const currentCode = current?.flag_code || current?.flag || null;
  const previousCode = previous?.flag_code || previous?.flag || null;

  const urlChanged = currentUrl !== previousUrl;
  const codeChanged = (currentCode || null) !== (previousCode || null);
  if (!urlChanged && !codeChanged) return;

  if (currentUrl) {
    el.style.backgroundImage = `url(${currentUrl})`;
    el.textContent = '';
    el.classList.add('has-image');
  } else if (currentCode) {
    el.style.backgroundImage = '';
    el.textContent = String(currentCode).toUpperCase();
    el.classList.remove('has-image');
  } else {
    el.style.backgroundImage = '';
    el.textContent = '';
    el.classList.remove('has-image');
  }
}

function applySetHighlight(k, currentSet) {
  const active = Number(currentSet || 1);
  ['1', '2', '3'].forEach(idx => {
    ['A', 'B'].forEach(side => {
      const cell = document.getElementById(`k${k}-s${idx}-${side}`);
      if (!cell) return;
      if (Number(idx) === active) {
        cell.classList.add('is-active');
      } else {
        cell.classList.remove('is-active');
      }
    });
  });
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
      if (state[k]) updateCourt(k, state[k]);
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
      if (courtState) updateCourt(k, courtState);
    });
    prev = merged;
  } else {
    updateCourt(kort, state);
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
      if (state[k]) updateCourt(k, state[k]);
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
    updateTitle(k, prev[k]?.A, prev[k]?.B);

    const section = document.getElementById(`kort-${k}`);
    if (!section) return;

    const accStrings = resolveAccessibilityStrings(t);
    const columns = t.table?.columns || {};
    const pointsLabel = columns.points || accStrings.points;
    const tieBreakLabel = columns.tieBreak || accStrings.tieBreak;
    const superTieBreakLabel = columns.superTieBreak || accStrings.superTieBreak;
    const set1Label = columns.set1 || format(accStrings.setTemplate, { number: 1 });
    const set2Label = columns.set2 || format(accStrings.setTemplate, { number: 2 });

    const pointsLabelEl = document.getElementById(`k${k}-label-points`);
    if (pointsLabelEl) {
      pointsLabelEl.textContent = pointsLabel;
      pointsLabelEl.setAttribute('data-default-label', pointsLabel);
      pointsLabelEl.setAttribute('data-tie-label', tieBreakLabel);
      pointsLabelEl.setAttribute('data-super-label', superTieBreakLabel);
    }
    const set1LabelEl = document.getElementById(`k${k}-label-set1`);
    if (set1LabelEl) set1LabelEl.textContent = set1Label;
    const set2LabelEl = document.getElementById(`k${k}-label-set2`);
    if (set2LabelEl) set2LabelEl.textContent = set2Label;

    const controlLabel = section.querySelector('label.control span');
    if (controlLabel) controlLabel.textContent = t.announceLabel;

    const live = document.getElementById(`live-${k}`);
    if (live) live.setAttribute('lang', currentLocale());

    const nameACell = document.getElementById(`k${k}-name-A`);
    if (nameACell && (!prev[k]?.A?.surname || prev[k]?.A?.surname === '-')) {
      nameACell.textContent = resolvePlayerName(prev[k]?.A, 'defaultA');
    }
    const nameBCell = document.getElementById(`k${k}-name-B`);
    if (nameBCell && (!prev[k]?.B?.surname || prev[k]?.B?.surname === '-')) {
      nameBCell.textContent = resolvePlayerName(prev[k]?.B, 'defaultB');
    }
    updatePlayerFlag(k, 'A', prev[k]?.A || {}, {});
    updatePlayerFlag(k, 'B', prev[k]?.B || {}, {});
    applySetHighlight(k, prev[k]?.current_set ?? 1);
    const historyTitle = section.querySelector('.history-title');
    if (historyTitle && t.history?.title) historyTitle.textContent = t.history.title;
    if (prev[k]) {
      applyScoreAria(k, prev[k]);
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
    if (state[k]) updateCourt(k, state[k]);
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
  // No pause UI: always live
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

// Keyboard shortcuts: number keys navigate between courts
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
