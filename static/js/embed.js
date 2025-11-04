'use strict';

(function () {
  const app = document.getElementById('app');

  function getKortIdFromPath() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
    return null;
  }

  const KORT_ID = getKortIdFromPath();

  function renderScoreboard(state) {
    if (!state) {
      app.innerHTML = '<p>Oczekiwanie na dane...</p>';
      return;
    }

    const { A, B, match_time, current_set, serve } = state;

    const formatTime = (seconds) => {
      const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
      const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
      const s = (seconds % 60).toString().padStart(2, '0');
      return `${h}:${m}:${s}`;
    };

    app.innerHTML = `
      <div class="scoreboard">
        <div class="header">
          <div class="time">${formatTime(match_time.seconds)}</div>
          <div class="court">Kort ${KORT_ID}</div>
        </div>
        <div class="players">
          <div class="player ${serve === 'A' ? 'serving' : ''}">
            <div class="name">${A.full_name || A.surname || '-'}</div>
            <div class="points">${A.points}</div>
            <div class="games">${A.current_games}</div>
            <div class="sets">${A.set1 || 0} | ${A.set2 || 0}</div>
          </div>
          <div class="player ${serve === 'B' ? 'serving' : ''}">
            <div class="name">${B.full_name || B.surname || '-'}</div>
            <div class="points">${B.points}</div>
            <div class="games">${B.current_games}</div>
            <div class="sets">${B.set1 || 0} | ${B.set2 || 0}</div>
          </div>
        </div>
      </div>
    `;
  }

  function connect() {
    const stream = new EventSource('/api/stream');

    stream.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'snapshot' || data.type === 'kort-update') {
        const courtState = data.state[KORT_ID];
        renderScoreboard(courtState);
      }
    };

    stream.onerror = () => {
      console.error('Błąd połączenia ze strumieniem zdarzeń. Ponawiam próbę za 3 sekundy...');
      stream.close();
      setTimeout(connect, 3000);
    };
  }

  if (KORT_ID) {
    connect();
  } else {
    app.innerHTML = '<p>Nieprawidłowy adres. Podaj numer kortu, np. /1</p>';
  }
})();
