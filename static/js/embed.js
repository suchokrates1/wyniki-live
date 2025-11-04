'use strict';

import { TRANSLATIONS, DEFAULT_LANG, SUPPORTED_LANGS, getTranslation } from './translations.js';

let currentLang = DEFAULT_LANG;

function currentT() {
  return getTranslation(currentLang);
}

function format(str, values = {}) {
  return str.replace(/\\{(\\w+)\\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : `{\${key}}`;
  });
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
  const points = rawPoints.replace(/\\s*\\(.*?\\)\\s*/g, '').trim() || 'Points';
  const tieBreak = acc.tieBreak || columns.tieBreak || 'tie-break';
  const superTieBreak = acc.superTieBreak || columns.superTieBreak || `super \${tieBreak}`;
  let setTemplate = acc.set;
  if (!setTemplate) {
    const rawSet = columns?.set1;
    if (typeof rawSet === 'string') {
      const cleaned = rawSet.split('(')[0].trim();
      const replaced = cleaned.replace(/\\d+/, '{number}');
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
  const setLabel = (idx) => columns[`set\${idx}`] || format(acc.setTemplate, { number: idx });
  const set1Label = setLabel(1);
  const set2Label = setLabel(2);

  const section = document.createElement('section');
  section.className = 'card';
  section.id = `kort-\${k}`;
  section.setAttribute('aria-labelledby', `heading-\${k}`);
  section.innerHTML = `
    <div class="card-head">
      <h2 id="heading-\${k}">
        <span class="court-label" id="court-label-\${k}">${courtLabel}</span>:
        <span id="title-\${k}" class="match-title">
          <span class="match-player" data-title="A">\${defaultA}</span>
          <span class="match-versus" id="title-\${k}-versus" aria-label="\${acc.versus}"><span aria-hidden="true">\${t.versus}</span><span class="sr-only">\${acc.versus}</span></span>
          <span class="match-player" data-title="B">\${defaultB}</span>
        </span>
      </h2>
    </div>

    <div class="score-wrapper">
      <dl class="score-list" aria-labelledby="heading-\${k}" aria-hidden="true">
        <div class="score-row" data-side="A">
          <dt class="player-cell">
            <span class="player-flag" id="k\${k}-flag-A" aria-hidden="true"></span>
            <span class="player-name" id="k\${k}-name-A">\${defaultA}</span>
          </dt>
          <dd class="metric points" aria-labelledby="k\${k}-label-points k\${k}-name-A">
            <span class="metric-label" id="k\${k}-label-points" data-default-label="\${pointsLabel}" data-tie-label="\${tieBreakLabel}" data-super-label="\${superTieBreakLabel}">\${pointsLabel}</span>
            <span class="metric-value points" id="k\${k}-pts-A">0</span>
          </dd>
          <dd class="metric set-1" aria-labelledby="k\${k}-label-set1 k\${k}-name-A">
            <span class="metric-label" id="k\${k}-label-set1">\${set1Label}</span>
            <span class="metric-value set set-1" id="k\${k}-s1-A">0</span>
          </dd>
          <dd class="metric set-2" aria-labelledby="k\${k}-label-set2 k\${k}-name-A">
            <span class="metric-label" id="k\${k}-label-set2">\${set2Label}</span>
            <span class="metric-value set set-2" id="k\${k}-s2-A">0</span>
          </dd>
        </div>
        <div class="score-row" data-side="B">
          <dt class="player-cell">
            <span class="player-flag" id="k\${k}-flag-B" aria-hidden="true"></span>
            <span class="player-name" id="k\${k}-name-B">\${defaultB}</span>
          </dt>
          <dd class="metric points" aria-labelledby="k\${k}-label-points k\${k}-name-B">
            <span class="metric-value points" id="k\${k}-pts-B">0</span>
          </dd>
          <dd class="metric set-1" aria-labelledby="k\${k}-label-set1 k\${k}-name-B">
            <span class="metric-value set set-1" id="k\${k}-s1-B">0</span>
          </dd>
          <dd class="metric set-2" aria-labelledby="k\${k}-label-set2 k\${k}-name-B">
            <span class="metric-value set set-2" id="k\${k}-s2-B">0</span>
          </dd>
        </div>
      </dl>
    </div>
    <p class="sr-only score-summary" id="k\${k}-summary" aria-live="polite"></p>
  `;

  const heading = section.querySelector(`#heading-\${k}`);
  if (heading) {
    heading.setAttribute('aria-label', `\${courtLabel}: \${defaultA} \${acc.versus} \${defaultB}`);
  }

  return section;
}


(function () {
  const grid = document.getElementById('grid');

  function getKortIdFromPath() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
    return null;
  }

  const KORT_ID = getKortIdFromPath();

  function renderScoreboard(kortId) {
    if (grid.querySelector(`#kort-\${kortId}`)) {
      return;
    }
    grid.innerHTML = '';
    const card = makeCourtCard(kortId);
    grid.appendChild(card);
  }

  function connect() {
    const stream = new EventSource('/api/stream');

    stream.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'snapshot') {
        const courtState = data.state[KORT_ID];
        if (courtState) {
          renderScoreboard(KORT_ID);
        }
      } else if (data.type === 'kort-update' && data.kort === KORT_ID) {
        renderScoreboard(KORT_ID);
      }
    };

    stream.onerror = () => {
      console.error('Błąd połączenia ze strumieniem zdarzeń. Ponawiam próbę za 3 sekundy...');
      stream.close();
      setTimeout(connect, 3000);
    };
  }

  if (KORT_ID) {
    renderScoreboard(KORT_ID);
    connect();
  } else {
    grid.innerHTML = '<p>Nieprawidłowy adres. Podaj numer kortu, np. /1</p>';
  }
})();
