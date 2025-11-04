'use strict';

import { TRANSLATIONS, DEFAULT_LANG, getTranslation } from './translations.js';

let currentLang = DEFAULT_LANG;
let prev = {};

function currentT() {
  return getTranslation(currentLang);
}

function format(str, values = {}) {
  return str.replace(/\{(\w+)\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : `{${key}}`;
  });
}

function resolveAccessibilityStrings(t) {
    const acc = t.accessibility || {};
    const columns = t.table?.columns || {};
    let versus = acc.versus || t.versus || 'vs';
    const rawPoints = acc.points || columns.points || 'Points';
    const points = rawPoints.replace(/\s*\(.*?\)\s*/g, '').trim() || 'Points';
    const tieBreak = acc.tieBreak || columns.tieBreak || 'tie-break';
    const superTieBreak = acc.superTieBreak || columns.superTieBreak || `super ${tieBreak}`;
    let setTemplate = acc.set || 'Set {number}';
    const active = acc.active || 'active';
    return { versus, points, tieBreak, superTieBreak, setTemplate, active };
}

function flash(el) {
    if (!el) return;
    el.classList.add('changed');
    setTimeout(() => el.classList.remove('changed'), 1200);
}

function resolvePlayerName(playerData, fallbackKey) {
    const t = currentT();
    if (playerData && typeof playerData === 'object') {
        const full = playerData.full_name || playerData.fullName;
        if (full && String(full).trim()) return String(full).trim();
        const surname = playerData.surname;
        if (surname && surname !== '-') return surname;
    }
    return t.players[fallbackKey];
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
        if (nameAEl) nameAEl.textContent = safeA;
        if (nameBEl) nameBEl.textContent = safeB;
    }
    const courtLabelText = format(t.courtLabel, { court: k });
    const courtLabel = document.getElementById(`court-label-${k}`);
    if (courtLabel) courtLabel.textContent = courtLabelText;
    const heading = document.getElementById(`heading-${k}`);
    if (heading) heading.setAttribute('aria-label', `${courtLabelText}: ${safeA} ${acc.versus} ${safeB}`);
}

function normalizePointsDisplay(value) {
    if (value === undefined || value === null) return '0';
    const text = String(value).trim();
    if (!text || text === '-') return '0';
    return text;
}

function normalizeTieDisplay(value) {
    if (value === undefined || value === null) return '0';
    return String(value);
}

function updateCourt(k, data) {
    const prevK = prev[k] || { A: {}, B: {} };
    const A = data.A || {};
    const B = data.B || {};

    updateTitle(k, A, B);

    const pointsA = normalizePointsDisplay(A.points);
    const pointsB = normalizePointsDisplay(B.points);
    const tieA = normalizeTieDisplay(data.tie?.A);
    const tieB = normalizeTieDisplay(data.tie?.B);

    const cellPtsA = document.getElementById(`k${k}-pts-A`);
    if (cellPtsA && cellPtsA.textContent !== pointsA) {
        cellPtsA.textContent = pointsA;
        flash(cellPtsA);
    }
    const cellPtsB = document.getElementById(`k${k}-pts-B`);
    if (cellPtsB && cellPtsB.textContent !== pointsB) {
        cellPtsB.textContent = pointsB;
        flash(cellPtsB);
    }

    ['1', '2'].forEach(setIdx => {
        const setA = A[`set${setIdx}`] ?? 0;
        const setB = B[`set${setIdx}`] ?? 0;
        const cellS1A = document.getElementById(`k${k}-s${setIdx}-A`);
        if (cellS1A && cellS1A.textContent != setA) {
            cellS1A.textContent = setA;
            flash(cellS1A);
        }
        const cellS1B = document.getElementById(`k${k}-s${setIdx}-B`);
        if (cellS1B && cellS1B.textContent != setB) {
            cellS1B.textContent = setB;
            flash(cellS1B);
        }
    });

    prev[k] = data;
}

function makeCourtCard(k) {
  const t = currentT();
  const acc = resolveAccessibilityStrings(t);
  const courtLabel = format(t.courtLabel, { court: k });
  const defaultA = t.players.defaultA;
  const defaultB = t.players.defaultB;
  const columns = t.table?.columns || {};
  const pointsLabel = columns.points || acc.points;
  const set1Label = columns.set1 || format(acc.setTemplate, { number: 1 });
  const set2Label = columns.set2 || format(acc.setTemplate, { number: 2 });

  const section = document.createElement('section');
  section.className = 'card wynik'; // Added .wynik class
  section.id = `kort-${k}`;
  section.setAttribute('aria-labelledby', `heading-${k}`);
  section.innerHTML = `
    <div class="card-head">
      <h2 id="heading-${k}">
        <span class="court-label" id="court-label-${k}">${courtLabel}</span>:
        <span id="title-${k}" class="match-title">
          <span class="match-player" data-title="A">${defaultA}</span>
          <span class="match-versus" aria-label="${acc.versus}"><span aria-hidden="true">${t.versus}</span></span>
          <span class="match-player" data-title="B">${defaultB}</span>
        </span>
      </h2>
    </div>
    <div class="score-wrapper">
      <dl class="score-list" aria-labelledby="heading-${k}">
        <div class="score-row" data-side="A">
          <dt class="player-cell">
            <span class="player-name" id="k${k}-name-A">${defaultA}</span>
          </dt>
          <dd class="metric points"><span class="metric-value" id="k${k}-pts-A">0</span></dd>
          <dd class="metric set-1"><span class="metric-value" id="k${k}-s1-A">0</span></dd>
          <dd class="metric set-2"><span class="metric-value" id="k${k}-s2-A">0</span></dd>
        </div>
        <div class="score-row" data-side="B">
          <dt class="player-cell">
            <span class="player-name" id="k${k}-name-B">${defaultB}</span>
          </dt>
          <dd class="metric points"><span class="metric-value" id="k${k}-pts-B">0</span></dd>
          <dd class="metric set-1"><span class="metric-value" id="k${k}-s1-B">0</span></dd>
          <dd class="metric set-2"><span class="metric-value" id="k${k}-s2-B">0</span></dd>
        </div>
      </dl>
    </div>
  `;
  return section;
}

(function () {
  const grid = document.getElementById('grid');
  let courtRendered = false;

  function getKortIdFromPath() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    return parts.length > 0 ? parts[0] : null;
  }

  const KORT_ID = getKortIdFromPath();

  function renderInitialScoreboard() {
      if (!KORT_ID || courtRendered) return;
      grid.innerHTML = '';
      const card = makeCourtCard(KORT_ID);
      grid.appendChild(card);
      courtRendered = true;
  }

  function connect() {
    if (!KORT_ID) return;
    const stream = new EventSource('/api/stream');

    stream.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'snapshot') {
          if (data.state && data.state[KORT_ID]) {
            renderInitialScoreboard();
            updateCourt(KORT_ID, data.state[KORT_ID]);
          }
      } else if (data.type === 'kort-update' && data.kort === KORT_ID) {
          renderInitialScoreboard();
          updateCourt(KORT_ID, data.state);
      }
    };

    stream.onerror = () => {
      stream.close();
      setTimeout(connect, 3000);
    };
  }

  if (KORT_ID) {
    renderInitialScoreboard();
    connect();
  } else {
    grid.innerHTML = '<p>Nieprawidłowy adres. Podaj numer kortu, np. /1</p>';
  }
})();
