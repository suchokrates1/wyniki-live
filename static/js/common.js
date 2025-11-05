'use strict';

import { getTranslation } from './translations.js';

let COURT_SET_STATE = {};

export function format(str, values = {}) {
  return str.replace(/\{(\w+)\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : `{${key}}`;
  });
}

function announce(k, text) {
  // Live region removed – keep function as no-op for compatibility
}

function fallbackPlayerName(surname, type, currentLang) {
    const t = getTranslation(currentLang);
  if (surname && surname !== '-') return surname;
  return type === 'opponent' ? t.players.fallbackOpponent : t.players.fallback;
}

function announcePoints(k, surname, pointsText, currentLang) {
    const t = getTranslation(currentLang);
  const player = fallbackPlayerName(surname, 'player', currentLang);
  announce(k, format(t.announcements.points, { player, value: pointsText }));
}

function announceGames(k, surname, games, currentLang) {
    const t = getTranslation(currentLang);
  const player = fallbackPlayerName(surname, 'player', currentLang);
  announce(k, format(t.announcements.games, { player, value: games }));
}

function announceSetEnd(k, winnerSurname, winnerGames, loserSurname, loserGames, currentLang) {
    const t = getTranslation(currentLang);
  const winner = fallbackPlayerName(winnerSurname, 'player', currentLang);
  const loser = fallbackPlayerName(loserSurname, 'opponent', currentLang);
  announce(k, format(t.announcements.setEnd, {
    winner,
    winnerGames,
    loser,
    loserGames
  }));
}

function announceTiePoint(k, surname, value, currentLang) {
    const t = getTranslation(currentLang);
  const player = fallbackPlayerName(surname, 'player', currentLang);
  announce(k, format(t.announcements.tiePoint, { player, value }));
}

function announceTieToggle(k, on, currentLang) {
    const t = getTranslation(currentLang);
  announce(k, on ? t.announcements.tieToggleOn : t.announcements.tieToggleOff);
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

function maybeAnnounceSetCompletion(k, info, surnames, currentLang) {
  const prevWinner = determineSetWinner(info.prevA, info.prevB);
  const newWinner = determineSetWinner(info.currentA, info.currentB);
  const changedScore = info.prevA !== info.currentA || info.prevB !== info.currentB;
  if (!newWinner) return;
  if (!prevWinner || prevWinner !== newWinner || changedScore) {
    const winnerName = newWinner === 'A' ? surnames.A : surnames.B;
    const loserName = newWinner === 'A' ? surnames.B : surnames.A;
    const winnerGames = newWinner === 'A' ? info.currentA : info.currentB;
    const loserGames = newWinner === 'A' ? info.currentB : info.currentA;
    announceSetEnd(k, winnerName, winnerGames ?? 0, loserName, loserGames ?? 0, currentLang);
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
  if (last === 'A' || last === 'B') return last;
  if (typeof last === 'string') {
    const upper = last.toUpperCase();
    if (upper.endsWith('A')) return 'A';
    if (upper.endsWith('B')) return 'B';
  }
  return null;
}

function handleTieScoreAnnouncements(k, tieNow, tiePrev, surnames, currentLang) {
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
    announceTiePoint(k, player === 'A' ? surnames.A : surnames.B, value, currentLang);
  });
}

export function resolveAccessibilityStrings(t) {
  const acc = t.accessibility || {};
  const columns = t.table?.columns || {};
  let versus = acc.versus;
  if (!versus) {
    if (t.htmlLang === 'pl') {
      versus = 'kontra';
    } else if (t.htmlLang === 'en') {
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

export function computeTieVisibility(tieState) {
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

export function flash(el) {
  if (!el) return;
  el.classList.add('changed');
  setTimeout(() => el.classList.remove('changed'), 1200);
}

export function makeCourtCard(k, currentLang, options = {}) {
  const t = getTranslation(currentLang);
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
  let headHTML = `
    <h2 id="heading-${k}">
      <span class="court-label" id="court-label-${k}">${courtLabel}</span>:
      <span id="title-${k}" class="match-title">
        <span class="match-player" data-title="A">${defaultA}</span>
        <span class="match-versus" id="title-${k}-versus" aria-label="${acc.versus}"><span aria-hidden="true">${t.versus}</span><span class="sr-only">${acc.versus}</span></span>
        <span class="match-player" data-title="B">${defaultB}</span>
      </span>
    </h2>
  `;
  if (options.showAnnounce) {
    headHTML += `
      <label class="control">
        <input type="checkbox" id="announce-${k}">
        <span>${t.announceLabel}</span>
      </label>
    `;
  }
  section.innerHTML = `
    <div class="card-head">${headHTML}</div>
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
  const heading = section.querySelector(`#heading-${k}`);
  if (heading) {
    heading.setAttribute('aria-label', `${courtLabel}: ${defaultA} ${acc.versus} ${defaultB}`);
  }
  return section;
}

export function updateTitle(k, Adata, Bdata, currentLang) {
  const t = getTranslation(currentLang);
  const acc = resolveAccessibilityStrings(t);
  const title = document.getElementById(`title-${k}`);
  const safeA = resolvePlayerName(Adata, 'defaultA', currentLang);
  const safeB = resolvePlayerName(Bdata, 'defaultB', currentLang);

  if (title) {
    const nameAEl = title.querySelector('[data-title="A"]');
    const nameBEl = title.querySelector('[data-title="B"]');
    const versusEl = title.querySelector('.match-versus');
    if (nameAEl && nameBEl && versusEl) {
      nameAEl.textContent = safeA;
      nameBEl.textContent = safeB;
      const vis = versusEl.querySelector('[aria-hidden="true"]');
      const sr = versusEl.querySelector('.sr-only');
      if (vis) vis.textContent = t.versus;
      if (sr) sr.textContent = acc.versus;
      versusEl.setAttribute('aria-label', acc.versus);
    } else {
      title.textContent = `${safeA} | ${safeB}`;
    }
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
export function resolvePlayerName(playerData, fallbackKey, currentLang) {
  const t = getTranslation(currentLang);
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

function normalizeCurrentSetValue(raw) {
  if (raw === undefined || raw === null) return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

function applyScoreAria(k, data, currentLang) {
  const section = document.getElementById(`kort-${k}`);
  if (!section) return;
  const list = section.querySelector('.score-list');
  if (!list) return;
  const summaryRoot = document.getElementById(`k${k}-summary`);
  const t = getTranslation(currentLang);
  const acc = resolveAccessibilityStrings(t);
  const currentSet = normalizeCurrentSetValue(data.current_set);
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

export function updateCourt(k, data, prev, currentLang, options = {}) {
  const { announceCb } = options;
  const prevK = prev[k] || { A: {}, B: {}, tie: {} };
  const rawTieNow = data.tie || {};
  const rawTiePrev = prevK.tie || {};
  const tieNow = { ...rawTieNow, visible: computeTieVisibility(rawTieNow) };
    const tiePrev = { ...rawTiePrev, visible: computeTieVisibility(rawTiePrev) };
  const dataWithTie = { ...data, tie: tieNow };

  const A = data.A || {};
  const B = data.B || {};
    const surnameA = A.surname || prevK?.A?.surname;
    const surnameB = B.surname || prevK?.B?.surname;

  updatePlayerFlag(k, 'A', A, prevK.A || {});
  updatePlayerFlag(k, 'B', B, prevK.B || {});

  const nextNameA = resolvePlayerName(A, 'defaultA', currentLang);
  const nextNameB = resolvePlayerName(B, 'defaultB', currentLang);
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
    updateTitle(k, A, B, currentLang);
  }

  const pointsA = resolveDisplayedPoints('A', A, prevK.A || {}, tieNow, rawTiePrev);
  const pointsB = resolveDisplayedPoints('B', B, prevK.B || {}, tieNow, rawTiePrev);

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
      announceCb(k, 'announcePoints', surnameA, nextText);
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
      announceCb(k, 'announcePoints', surnameB, nextText);
    }
  }

  if (A.set1 !== undefined && A.set1 !== prevK?.A?.set1) {
    const cell = document.getElementById(`k${k}-s1-A`);
    if (cell) {
      cell.textContent = A.set1 ?? 0;
      flash(cell);
      announceCb(k, 'announceGames', surnameA, cell.textContent);
    }
  }
  if (B.set1 !== undefined && B.set1 !== prevK?.B?.set1) {
    const cell = document.getElementById(`k${k}-s1-B`);
    if (cell) {
      cell.textContent = B.set1 ?? 0;
      flash(cell);
        announceCb(k, 'announceGames', surnameB, cell.textContent);
    }
  }
    if (A.set2 !== undefined && A.set2 !== prevK?.A?.set2) {
    const cell = document.getElementById(`k${k}-s2-A`);
    if (cell) {
      cell.textContent = A.set2 ?? 0;
      flash(cell);
        announceCb(k, 'announceGames', surnameA, cell.textContent);
    }
  }
  if (B.set2 !== undefined && B.set2 !== prevK?.B?.set2) {
    const cell = document.getElementById(`k${k}-s2-B`);
    if (cell) {
      cell.textContent = B.set2 ?? 0;
      flash(cell);
        announceCb(k, 'announceGames', surnameB, cell.textContent);
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
    maybeAnnounceSetCompletion(k, info, surnames, currentLang);
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
    announceTieToggle(k, true, currentLang);
  }

  COURT_SET_STATE[k] = { winsA: wins.A, winsB: wins.B, splitAnnounced: reachedSplitNow };

  if (tieNow.visible !== undefined && tieNow.visible !== tiePrev.visible) {
    announceTieToggle(k, tieNow.visible === true, currentLang);
  }

  handleTieScoreAnnouncements(k, tieNow, tiePrev, surnames, currentLang);

  applyScoreAria(k, dataWithTie, currentLang);
  applySetHighlight(k, data.current_set);
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
  const active = normalizeCurrentSetValue(currentSet);
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
