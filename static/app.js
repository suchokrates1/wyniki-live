const TRANSLATIONS = {
  pl: {
    langName: 'Polski',
    htmlLang: 'pl',
    title: 'Wyniki tenisowe – na żywo',
    description: 'Strona odświeża wyniki automatycznie. Dostępna dla czytników ekranu.',
    navLabel: 'Szybka nawigacja po kortach',
    courtLabel: 'Kort {court}',
    controlsTitle: 'Sterowanie',
    languageLabel: 'Wybierz język',
    pause: { pause: 'Wstrzymaj odświeżanie', resume: 'Wznów odświeżanie' },
    announceLabel: 'Czytaj wynik',
    status: {
      label: 'Status: {state}{tiebreak}',
      states: { unknown: 'nieznany', visible: 'widoczny', hidden: 'ukryty' },
      tiebreak: {
        yes: ' | Super tiebreak: TAK',
        no: ' | Super tiebreak: NIE',
        off: ''
      }
    },
    table: {
      caption: 'Wyniki – Kort {court}: {playerA} {versus} {playerB}',
      columns: {
        name: 'Nazwisko',
        points: 'Punkty',
        set1: 'Set 1 (gemy)',
        set2: 'Set 2 (gemy)'
      }
    },
    players: { defaultA: 'Gracz A', defaultB: 'Gracz B', fallback: 'zawodnik', fallbackOpponent: 'rywal' },
    versus: 'vs',
    meta: {
      lastRefresh: 'Ostatnie odświeżenie: {time}.',
      lastRefreshNever: 'Ostatnie odświeżenie: brak.'
    },
    errors: { fetch: 'Błąd pobierania danych ({message}).' },
    announcements: {
      points: 'punkty {player} {value}',
      games: 'gemy {player} {value}',
      setEnd: 'koniec seta: {winner} {winnerGames} do {loser} {loserGames}',
      tiePoint: 'tiebreak {player} {value}',
      tieToggleOn: 'Super tiebreak rozpoczęty',
      tieToggleOff: 'Super tiebreak zakończony'
    }
  },
  de: {
    langName: 'Deutsch',
    htmlLang: 'de',
    title: 'Tennis-Ergebnisse – live',
    description: 'Die Seite aktualisiert die Ergebnisse automatisch. Für Screenreader optimiert.',
    navLabel: 'Schnellnavigation zu den Plätzen',
    courtLabel: 'Platz {court}',
    controlsTitle: 'Steuerung',
    languageLabel: 'Sprache wählen',
    pause: { pause: 'Aktualisierung anhalten', resume: 'Aktualisierung fortsetzen' },
    announceLabel: 'Ergebnis ansagen',
    status: {
      label: 'Status: {state}{tiebreak}',
      states: { unknown: 'unbekannt', visible: 'sichtbar', hidden: 'ausgeblendet' },
      tiebreak: {
        yes: ' | Super-Tiebreak: JA',
        no: ' | Super-Tiebreak: NEIN',
        off: ''
      }
    },
    table: {
      caption: 'Ergebnisse – Platz {court}: {playerA} {versus} {playerB}',
      columns: {
        name: 'Nachname',
        points: 'Punkte',
        set1: 'Satz 1 (Spiele)',
        set2: 'Satz 2 (Spiele)'
      }
    },
    players: { defaultA: 'Spieler A', defaultB: 'Spieler B', fallback: 'Spieler', fallbackOpponent: 'Gegner' },
    versus: 'gegen',
    meta: {
      lastRefresh: 'Letzte Aktualisierung: {time}.',
      lastRefreshNever: 'Letzte Aktualisierung: keine.'
    },
    errors: { fetch: 'Fehler beim Laden der Daten ({message}).' },
    announcements: {
      points: 'Punkte {player} {value}',
      games: 'Spiele {player} {value}',
      setEnd: 'Satzende: {winner} {winnerGames} zu {loser} {loserGames}',
      tiePoint: 'Tiebreak {player} {value}',
      tieToggleOn: 'Super-Tiebreak gestartet',
      tieToggleOff: 'Super-Tiebreak beendet'
    }
  },
  en: {
    langName: 'English',
    htmlLang: 'en',
    title: 'Live tennis scores',
    description: 'Scores refresh automatically. Accessible for screen readers.',
    navLabel: 'Quick court navigation',
    courtLabel: 'Court {court}',
    controlsTitle: 'Controls',
    languageLabel: 'Choose language',
    pause: { pause: 'Pause updates', resume: 'Resume updates' },
    announceLabel: 'Announce score',
    status: {
      label: 'Status: {state}{tiebreak}',
      states: { unknown: 'unknown', visible: 'visible', hidden: 'hidden' },
      tiebreak: {
        yes: ' | Super tiebreak: YES',
        no: ' | Super tiebreak: NO',
        off: ''
      }
    },
    table: {
      caption: 'Scores – Court {court}: {playerA} {versus} {playerB}',
      columns: {
        name: 'Surname',
        points: 'Points',
        set1: 'Set 1 (games)',
        set2: 'Set 2 (games)'
      }
    },
    players: { defaultA: 'Player A', defaultB: 'Player B', fallback: 'player', fallbackOpponent: 'opponent' },
    versus: 'vs',
    meta: {
      lastRefresh: 'Last refresh: {time}.',
      lastRefreshNever: 'Last refresh: none.'
    },
    errors: { fetch: 'Error fetching data ({message}).' },
    announcements: {
      points: 'points {player} {value}',
      games: 'games {player} {value}',
      setEnd: 'set over: {winner} {winnerGames} to {loser} {loserGames}',
      tiePoint: 'tiebreak {player} {value}',
      tieToggleOn: 'Super tiebreak started',
      tieToggleOff: 'Super tiebreak finished'
    }
  },
  it: {
    langName: 'Italiano',
    htmlLang: 'it',
    title: 'Risultati tennis – live',
    description: 'La pagina aggiorna i punteggi automaticamente. Accessibile ai lettori di schermo.',
    navLabel: 'Navigazione rapida dei campi',
    courtLabel: 'Campo {court}',
    controlsTitle: 'Controlli',
    languageLabel: 'Scegli lingua',
    pause: { pause: 'Metti in pausa gli aggiornamenti', resume: 'Riprendi gli aggiornamenti' },
    announceLabel: 'Leggi il punteggio',
    status: {
      label: 'Stato: {state}{tiebreak}',
      states: { unknown: 'sconosciuto', visible: 'visibile', hidden: 'nascosto' },
      tiebreak: {
        yes: ' | Super tiebreak: SÌ',
        no: ' | Super tiebreak: NO',
        off: ''
      }
    },
    table: {
      caption: 'Risultati – Campo {court}: {playerA} {versus} {playerB}',
      columns: {
        name: 'Cognome',
        points: 'Punti',
        set1: 'Set 1 (giochi)',
        set2: 'Set 2 (giochi)'
      }
    },
    players: { defaultA: 'Giocatore A', defaultB: 'Giocatore B', fallback: 'giocatore', fallbackOpponent: 'avversario' },
    versus: 'contro',
    meta: {
      lastRefresh: 'Ultimo aggiornamento: {time}.',
      lastRefreshNever: 'Ultimo aggiornamento: nessuno.'
    },
    errors: { fetch: 'Errore durante il recupero dati ({message}).' },
    announcements: {
      points: 'punti {player} {value}',
      games: 'game {player} {value}',
      setEnd: 'fine set: {winner} {winnerGames} a {loser} {loserGames}',
      tiePoint: 'tiebreak {player} {value}',
      tieToggleOn: 'Super tiebreak iniziato',
      tieToggleOff: 'Super tiebreak terminato'
    }
  },
  es: {
    langName: 'Español',
    htmlLang: 'es',
    title: 'Marcadores de tenis en vivo',
    description: 'La página actualiza los marcadores automáticamente. Accesible para lectores de pantalla.',
    navLabel: 'Navegación rápida por canchas',
    courtLabel: 'Cancha {court}',
    controlsTitle: 'Controles',
    languageLabel: 'Elegir idioma',
    pause: { pause: 'Pausar actualizaciones', resume: 'Reanudar actualizaciones' },
    announceLabel: 'Anunciar marcador',
    status: {
      label: 'Estado: {state}{tiebreak}',
      states: { unknown: 'desconocido', visible: 'visible', hidden: 'oculto' },
      tiebreak: {
        yes: ' | Súper desempate: SÍ',
        no: ' | Súper desempate: NO',
        off: ''
      }
    },
    table: {
      caption: 'Marcadores – Cancha {court}: {playerA} {versus} {playerB}',
      columns: {
        name: 'Apellido',
        points: 'Puntos',
        set1: 'Set 1 (juegos)',
        set2: 'Set 2 (juegos)'
      }
    },
    players: { defaultA: 'Jugador A', defaultB: 'Jugador B', fallback: 'jugador', fallbackOpponent: 'rival' },
    versus: 'contra',
    meta: {
      lastRefresh: 'Última actualización: {time}.',
      lastRefreshNever: 'Última actualización: ninguna.'
    },
    errors: { fetch: 'Error al obtener datos ({message}).' },
    announcements: {
      points: 'puntos {player} {value}',
      games: 'juegos {player} {value}',
      setEnd: 'fin de set: {winner} {winnerGames} contra {loser} {loserGames}',
      tiePoint: 'desempate {player} {value}',
      tieToggleOn: 'Súper desempate iniciado',
      tieToggleOff: 'Súper desempate finalizado'
    }
  },
  fi: {
    langName: 'Suomi',
    htmlLang: 'fi',
    title: 'Tennistulokset – livenä',
    description: 'Sivu päivittää tulokset automaattisesti. Saavutettava ruudunlukijoille.',
    navLabel: 'Kenttien pikanavigointi',
    courtLabel: 'Kenttä {court}',
    controlsTitle: 'Ohjaimet',
    languageLabel: 'Valitse kieli',
    pause: { pause: 'Keskeytä päivitykset', resume: 'Jatka päivityksiä' },
    announceLabel: 'Ilmoita tulos',
    status: {
      label: 'Tila: {state}{tiebreak}',
      states: { unknown: 'tuntematon', visible: 'näkyvissä', hidden: 'piilotettu' },
      tiebreak: {
        yes: ' | Super-tiebreak: KYLLÄ',
        no: ' | Super-tiebreak: EI',
        off: ''
      }
    },
    table: {
      caption: 'Tulokset – Kenttä {court}: {playerA} {versus} {playerB}',
      columns: {
        name: 'Sukunimi',
        points: 'Pisteet',
        set1: 'Erä 1 (pelit)',
        set2: 'Erä 2 (pelit)'
      }
    },
    players: { defaultA: 'Pelaaja A', defaultB: 'Pelaaja B', fallback: 'pelaaja', fallbackOpponent: 'vastustaja' },
    versus: 'vastaan',
    meta: {
      lastRefresh: 'Viimeisin päivitys: {time}.',
      lastRefreshNever: 'Viimeisin päivitys: ei vielä.'
    },
    errors: { fetch: 'Virhe tietoja haettaessa ({message}).' },
    announcements: {
      points: 'pisteet {player} {value}',
      games: 'pelit {player} {value}',
      setEnd: 'erä päättyi: {winner} {winnerGames} – {loser} {loserGames}',
      tiePoint: 'tiebreak {player} {value}',
      tieToggleOn: 'Super-tiebreak alkoi',
      tieToggleOff: 'Super-tiebreak päättyi'
    }
  },
  uk: {
    langName: 'Українська',
    htmlLang: 'uk',
    title: 'Тенісні результати наживо',
    description: 'Сторінка автоматично оновлює рахунки. Доступна для читачів екрана.',
    navLabel: 'Швидка навігація по кортах',
    courtLabel: 'Корт {court}',
    controlsTitle: 'Керування',
    languageLabel: 'Оберіть мову',
    pause: { pause: 'Призупинити оновлення', resume: 'Відновити оновлення' },
    announceLabel: 'Озвучувати рахунок',
    status: {
      label: 'Статус: {state}{tiebreak}',
      states: { unknown: 'невідомо', visible: 'видно', hidden: 'приховано' },
      tiebreak: {
        yes: ' | Супер-тайбрейк: ТАК',
        no: ' | Супер-тайбрейк: НІ',
        off: ''
      }
    },
    table: {
      caption: 'Рахунок – Корт {court}: {playerA} {versus} {playerB}',
      columns: {
        name: 'Прізвище',
        points: 'Очки',
        set1: 'Сет 1 (гейми)',
        set2: 'Сет 2 (гейми)'
      }
    },
    players: { defaultA: 'Гравець A', defaultB: 'Гравець B', fallback: 'гравець', fallbackOpponent: 'суперник' },
    versus: 'проти',
    meta: {
      lastRefresh: 'Останнє оновлення: {time}.',
      lastRefreshNever: 'Останнє оновлення: ще немає.'
    },
    errors: { fetch: 'Помилка під час отримання даних ({message}).' },
    announcements: {
      points: 'очки {player} {value}',
      games: 'гейми {player} {value}',
      setEnd: 'кінець сету: {winner} {winnerGames} проти {loser} {loserGames}',
      tiePoint: 'тайбрейк {player} {value}',
      tieToggleOn: 'Супер-тайбрейк розпочато',
      tieToggleOff: 'Супер-тайбрейк завершено'
    }
  },
  fr: {
    langName: 'Français',
    htmlLang: 'fr',
    title: 'Scores de tennis en direct',
    description: 'La page met à jour les scores automatiquement. Accessible aux lecteurs d’écran.',
    navLabel: 'Navigation rapide entre les courts',
    courtLabel: 'Court {court}',
    controlsTitle: 'Commandes',
    languageLabel: 'Choisir la langue',
    pause: { pause: 'Mettre les mises à jour en pause', resume: 'Reprendre les mises à jour' },
    announceLabel: 'Annoncer le score',
    status: {
      label: 'Statut : {state}{tiebreak}',
      states: { unknown: 'inconnu', visible: 'visible', hidden: 'masqué' },
      tiebreak: {
        yes: ' | Super tie-break : OUI',
        no: ' | Super tie-break : NON',
        off: ''
      }
    },
    table: {
      caption: 'Scores – Court {court} : {playerA} {versus} {playerB}',
      columns: {
        name: 'Nom',
        points: 'Points',
        set1: 'Set 1 (jeux)',
        set2: 'Set 2 (jeux)'
      }
    },
    players: { defaultA: 'Joueur A', defaultB: 'Joueur B', fallback: 'joueur', fallbackOpponent: 'adversaire' },
    versus: 'contre',
    meta: {
      lastRefresh: 'Dernière mise à jour : {time}.',
      lastRefreshNever: 'Dernière mise à jour : aucune.'
    },
    errors: { fetch: 'Erreur lors du chargement des données ({message}).' },
    announcements: {
      points: 'points {player} {value}',
      games: 'jeux {player} {value}',
      setEnd: 'fin de set : {winner} {winnerGames} à {loser} {loserGames}',
      tiePoint: 'tie-break {player} {value}',
      tieToggleOn: 'Super tie-break commencé',
      tieToggleOff: 'Super tie-break terminé'
    }
  },
  lt: {
    langName: 'Lietuvių',
    htmlLang: 'lt',
    title: 'Teniso rezultatai – tiesiogiai',
    description: 'Puslapis automatiškai atnaujina rezultatus. Prieinamas ekrano skaitytuvams.',
    navLabel: 'Greita navigacija po aikštes',
    courtLabel: 'Aikštė {court}',
    controlsTitle: 'Valdikliai',
    languageLabel: 'Pasirinkite kalbą',
    pause: { pause: 'Pristabdyti atnaujinimus', resume: 'Tęsti atnaujinimus' },
    announceLabel: 'Skaityti rezultatą',
    status: {
      label: 'Būsena: {state}{tiebreak}',
      states: { unknown: 'nežinoma', visible: 'rodoma', hidden: 'paslėpta' },
      tiebreak: {
        yes: ' | Super taibreikas: TAIP',
        no: ' | Super taibreikas: NE',
        off: ''
      }
    },
    table: {
      caption: 'Rezultatai – Aikštė {court}: {playerA} {versus} {playerB}',
      columns: {
        name: 'Pavardė',
        points: 'Taškai',
        set1: 'Setas 1 (geimai)',
        set2: 'Setas 2 (geimai)'
      }
    },
    players: { defaultA: 'Žaidėjas A', defaultB: 'Žaidėjas B', fallback: 'žaidėjas', fallbackOpponent: 'varžovas' },
    versus: 'prieš',
    meta: {
      lastRefresh: 'Paskutinis atnaujinimas: {time}.',
      lastRefreshNever: 'Paskutinis atnaujinimas: dar nėra.'
    },
    errors: { fetch: 'Klaida gaunant duomenis ({message}).' },
    announcements: {
      points: 'taškai {player} {value}',
      games: 'geimai {player} {value}',
      setEnd: 'setas baigtas: {winner} {winnerGames} prieš {loser} {loserGames}',
      tiePoint: 'taibreikas {player} {value}',
      tieToggleOn: 'Super taibreikas pradėtas',
      tieToggleOff: 'Super taibreikas baigtas'
    }
  }
};

function format(str, values = {}) {
  return str.replace(/\{(\w+)\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : `{${key}}`;
  });
}

function getTranslation(lang) {
  return TRANSLATIONS[lang] || TRANSLATIONS.pl;
}

let COURTS = [];
const grid = document.getElementById('grid');
const nav = document.querySelector('nav');
const navlist = document.getElementById('navlist');
const errLine = document.getElementById('errLine');
const pauseBtn = document.getElementById('pauseBtn');
const langSelect = document.getElementById('langSelect');
const langLabel = document.getElementById('langLabel');
const controlsTitle = document.getElementById('ctrl-title');
const headerTitle = document.querySelector('header h1');
const headerDesc = document.querySelector('.desc');
const lastRefreshText = document.getElementById('lastRefreshText');

let paused = false;
let prev = {};
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

let eventSource = null;
let reconnectTimer = null;
let reconnectDelay = INITIAL_RECONNECT_DELAY;
let lastRefreshDate = null;
let lastError = null;

const storedLang = localStorage.getItem('preferred-language');
let currentLang = TRANSLATIONS[storedLang] ? storedLang : 'pl';

function currentT() {
  return getTranslation(currentLang);
}

function currentLocale() {
  const t = currentT();
  return t.htmlLang || currentLang;
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

function makeCourtCard(k) {
  const t = currentT();
  const courtLabel = format(t.courtLabel, { court: k });
  const defaultA = t.players.defaultA;
  const defaultB = t.players.defaultB;

  const section = document.createElement('section');
  section.className = 'card';
  section.id = `kort-${k}`;
  section.setAttribute('aria-labelledby', `heading-${k}`);
  section.innerHTML = `
    <div class="card-head">
      <h2 id="heading-${k}">
        <span class="court-label" id="court-label-${k}">${courtLabel}</span>
        — <span id="title-${k}">${defaultA} ${t.versus} ${defaultB}</span>
      </h2>
      <label class="control">
        <input type="checkbox" id="announce-${k}">
        <span>${t.announceLabel}</span>
      </label>
    </div>

    <p class="status" id="status-${k}">
      <span class="dot off" aria-hidden="true"></span>
      <span class="txt">${format(t.status.label, { state: t.status.states.unknown, tiebreak: t.status.tiebreak.off })}</span>
    </p>

    <table aria-describedby="status-${k}">
      <caption id="cap-${k}" class="sr-only">${format(t.table.caption, {
        court: k,
        playerA: defaultA,
        playerB: defaultB,
        versus: t.versus
      })}</caption>
      <thead>
        <tr>
          <th scope="col">${t.table.columns.name}</th>
          <th scope="col">${t.table.columns.points}</th>
          <th scope="col">${t.table.columns.set1}</th>
          <th scope="col">${t.table.columns.set2}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th id="k${k}-name-A" scope="row">${defaultA}</th>
          <td id="k${k}-pts-A">-</td>
          <td id="k${k}-s1-A">0</td>
          <td id="k${k}-s2-A">0</td>
        </tr>
        <tr>
          <th id="k${k}-name-B" scope="row">${defaultB}</th>
          <td id="k${k}-pts-B">-</td>
          <td id="k${k}-s1-B">0</td>
          <td id="k${k}-s2-B">0</td>
        </tr>
      </tbody>
    </table>

    <div id="live-${k}" class="sr-only" aria-live="polite" aria-atomic="true"></div>
  `;

  const cb = section.querySelector(`#announce-${k}`);
  cb.checked = getAnnounce(k);
  cb.addEventListener('change', () => setAnnounce(k, cb.checked));

  const liveRegion = section.querySelector(`#live-${k}`);
  liveRegion.setAttribute('lang', currentLocale());

  return section;
}

function ensureCardsFromSnapshot(snap) {
  const t = currentT();
  COURTS = Object.keys(snap).sort((a, b) => Number(a) - Number(b));
  navlist.innerHTML = '';
  COURTS.forEach(k => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="#kort-${k}">${format(t.courtLabel, { court: k })}</a>`;
    navlist.appendChild(li);
  });
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
  if (!getAnnounce(k)) return;
  const live = document.getElementById(`live-${k}`);
  if (!live) return;
  live.setAttribute('lang', currentLocale());
  live.textContent = text;
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

function resolvePlayerName(surname, fallbackKey) {
  const t = currentT();
  if (surname && surname !== '-') return surname;
  return t.players[fallbackKey];
}

function updateTitle(k, Aname, Bname) {
  const t = currentT();
  const title = document.getElementById(`title-${k}`);
  const cap = document.getElementById(`cap-${k}`);
  const safeA = resolvePlayerName(Aname, 'defaultA');
  const safeB = resolvePlayerName(Bname, 'defaultB');

  if (title) {
    title.textContent = `${safeA} ${t.versus} ${safeB}`;
  }
  if (cap) {
    cap.textContent = format(t.table.caption, {
      court: k,
      playerA: safeA,
      playerB: safeB,
      versus: t.versus
    });
  }
  const courtLabel = document.getElementById(`court-label-${k}`);
  if (courtLabel) {
    courtLabel.textContent = format(t.courtLabel, { court: k });
  }
}

function updateCourt(k, data) {
  setStatus(k, data.overlay_visible, data.tie?.visible);

  const prevK = prev[k] || { A: {}, B: {}, tie: {} };
  const A = data.A || {};
  const B = data.B || {};

  const nameAChanged = A.surname !== undefined && A.surname !== prevK?.A?.surname;
  const nameBChanged = B.surname !== undefined && B.surname !== prevK?.B?.surname;
  if (nameAChanged) {
    const cell = document.getElementById(`k${k}-name-A`);
    if (cell) {
      cell.textContent = resolvePlayerName(A.surname, 'defaultA');
      flash(cell);
    }
  }
  if (nameBChanged) {
    const cell = document.getElementById(`k${k}-name-B`);
    if (cell) {
      cell.textContent = resolvePlayerName(B.surname, 'defaultB');
      flash(cell);
    }
  }
  if (nameAChanged || nameBChanged) {
    updateTitle(k, A.surname, B.surname);
  }

  if (A.points !== undefined && A.points !== prevK?.A?.points) {
    const cell = document.getElementById(`k${k}-pts-A`);
    if (cell) {
      cell.textContent = A.points ?? '-';
      flash(cell);
      announcePoints(k, A.surname || prevK?.A?.surname, cell.textContent);
    }
  }
  if (B.points !== undefined && B.points !== prevK?.B?.points) {
    const cell = document.getElementById(`k${k}-pts-B`);
    if (cell) {
      cell.textContent = B.points ?? '-';
      flash(cell);
      announcePoints(k, B.surname || prevK?.B?.surname, cell.textContent);
    }
  }

  if (A.set1 !== undefined && A.set1 !== prevK?.A?.set1) {
    const cell = document.getElementById(`k${k}-s1-A`);
    if (cell) {
      cell.textContent = A.set1 ?? 0;
      flash(cell);
      announceGames(k, A.surname || prevK?.A?.surname, cell.textContent);
    }
  }
  if (B.set1 !== undefined && B.set1 !== prevK?.B?.set1) {
    const cell = document.getElementById(`k${k}-s1-B`);
    if (cell) {
      cell.textContent = B.set1 ?? 0;
      flash(cell);
      announceGames(k, B.surname || prevK?.B?.surname, cell.textContent);
    }
  }

  const s1A = A.set1 ?? prevK?.A?.set1;
  const s1B = B.set1 ?? prevK?.B?.set1;
  const s1Aprev = prevK?.A?.set1;
  const s1Bprev = prevK?.B?.set1;
  if ((s1A === 4 && s1Aprev !== 4) || (s1B === 4 && s1Bprev !== 4)) {
    const winner = s1A === 4 ? (A.surname || prevK?.A?.surname) : (B.surname || prevK?.B?.surname);
    const loser = s1A === 4 ? (B.surname || prevK?.B?.surname) : (A.surname || prevK?.A?.surname);
    const wGames = 4;
    const lGames = s1A === 4 ? (s1B ?? 0) : (s1A ?? 0);
    announceSetEnd(k, winner, wGames, loser, lGames);
  }

  if (A.set2 !== undefined && A.set2 !== prevK?.A?.set2) {
    const cell = document.getElementById(`k${k}-s2-A`);
    if (cell) {
      cell.textContent = A.set2 ?? 0;
      flash(cell);
      announceGames(k, A.surname || prevK?.A?.surname, cell.textContent);
    }
  }
  if (B.set2 !== undefined && B.set2 !== prevK?.B?.set2) {
    const cell = document.getElementById(`k${k}-s2-B`);
    if (cell) {
      cell.textContent = B.set2 ?? 0;
      flash(cell);
      announceGames(k, B.surname || prevK?.B?.surname, cell.textContent);
    }
  }

  const s2A = A.set2 ?? prevK?.A?.set2;
  const s2B = B.set2 ?? prevK?.B?.set2;
  const s2Aprev = prevK?.A?.set2;
  const s2Bprev = prevK?.B?.set2;
  if ((s2A === 4 && s2Aprev !== 4) || (s2B === 4 && s2Bprev !== 4)) {
    const winner = s2A === 4 ? (A.surname || prevK?.A?.surname) : (B.surname || prevK?.B?.surname);
    const loser = s2A === 4 ? (B.surname || prevK?.B?.surname) : (A.surname || prevK?.A?.surname);
    const wGames = 4;
    const lGames = s2A === 4 ? (s2B ?? 0) : (s2A ?? 0);
    announceSetEnd(k, winner, wGames, loser, lGames);
  }

  const tieNow = data.tie || {};
  const tiePrev = prevK.tie || {};

  if (tieNow.visible !== undefined && tieNow.visible !== tiePrev.visible) {
    announceTieToggle(k, tieNow.visible === true);
  }
  if (typeof tieNow.A === 'number' && tieNow.A !== tiePrev.A) {
    announceTiePoint(k, A.surname || prevK?.A?.surname, tieNow.A);
  }
  if (typeof tieNow.B === 'number' && tieNow.B !== tiePrev.B) {
    announceTiePoint(k, B.surname || prevK?.B?.surname, tieNow.B);
  }
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

  if (payload.type === 'snapshot') {
    const state = payload.state || {};
    ensureCardsFromSnapshot(state);
    const keys = computeCourts(state);
    keys.forEach(k => {
      if (state[k]) updateCourt(k, state[k]);
    });
    prev = state;
    updateLastRefresh(parseTimestamp(payload.ts) || new Date());
    return;
  }

  const kort = payload.kort;
  const state = payload.state;
  if (!kort || !state) return;

  if (!COURTS.includes(kort)) {
    const merged = { ...prev, [kort]: state };
    ensureCardsFromSnapshot(merged);
    const keys = computeCourts(merged);
    keys.forEach(k => {
      const courtState = merged[k];
      if (courtState) updateCourt(k, courtState);
    });
    prev = merged;
  } else {
    updateCourt(kort, state);
    prev = { ...prev, [kort]: state };
  }

  updateLastRefresh(parseTimestamp(payload.ts) || new Date());
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

function computeCourts(data) {
  return Object.keys(data).sort((a, b) => Number(a) - Number(b));
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
}

function refreshCardsLanguage() {
  const t = currentT();
  COURTS.forEach(k => {
    updateTitle(k, prev[k]?.A?.surname, prev[k]?.B?.surname);
    setStatus(k, prev[k]?.overlay_visible, prev[k]?.tie?.visible);

    const section = document.getElementById(`kort-${k}`);
    if (!section) return;

    const controlLabel = section.querySelector('label.control span');
    if (controlLabel) controlLabel.textContent = t.announceLabel;

    const table = section.querySelector('table thead tr');
    if (table) {
      const headers = table.querySelectorAll('th');
      if (headers[0]) headers[0].textContent = t.table.columns.name;
      if (headers[1]) headers[1].textContent = t.table.columns.points;
      if (headers[2]) headers[2].textContent = t.table.columns.set1;
      if (headers[3]) headers[3].textContent = t.table.columns.set2;
    }

    const live = document.getElementById(`live-${k}`);
    if (live) live.setAttribute('lang', currentLocale());

    const nameACell = document.getElementById(`k${k}-name-A`);
    if (nameACell && (!prev[k]?.A?.surname || prev[k]?.A?.surname === '-')) {
      nameACell.textContent = resolvePlayerName(prev[k]?.A?.surname, 'defaultA');
    }
    const nameBCell = document.getElementById(`k${k}-name-B`);
    if (nameBCell && (!prev[k]?.B?.surname || prev[k]?.B?.surname === '-')) {
      nameBCell.textContent = resolvePlayerName(prev[k]?.B?.surname, 'defaultB');
    }
  });
}

function renderLanguage() {
  const t = currentT();
  document.documentElement.lang = t.htmlLang;
  document.title = t.title;
  if (headerTitle) headerTitle.textContent = t.title;
  if (headerDesc) headerDesc.textContent = t.description;
  if (nav) nav.setAttribute('aria-label', t.navLabel);
  if (controlsTitle) controlsTitle.textContent = t.controlsTitle;
  if (langLabel) langLabel.textContent = t.languageLabel;
  if (pauseBtn) pauseBtn.textContent = paused ? t.pause.resume : t.pause.pause;
  refreshNavLanguage();
  refreshCardsLanguage();
  updateLastRefresh();
  renderError();
}

function applyLanguage(lang, { skipSave = false, skipSelect = false } = {}) {
  if (!TRANSLATIONS[lang]) lang = 'pl';
  currentLang = lang;
  if (!skipSave) localStorage.setItem('preferred-language', lang);
  if (!skipSelect && langSelect) langSelect.value = lang;
  renderLanguage();
}

async function bootstrap() {
  const data = await fetchSnapshot();
  if (!data) {
    updateLastRefresh();
    return;
  }
  ensureCardsFromSnapshot(data);
  COURTS = computeCourts(data);
  COURTS.forEach(k => {
    if (data[k]) updateCourt(k, data[k]);
  });
  prev = data;
  updateLastRefresh(new Date());
}

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

if (langSelect) {
  langSelect.addEventListener('change', () => {
    applyLanguage(langSelect.value);
  });
}

applyLanguage(currentLang, { skipSave: true, skipSelect: true });
if (langSelect) langSelect.value = currentLang;

bootstrap()
  .catch(err => {
    console.error('Bootstrap failed', err);
  })
  .finally(() => {
    renderLanguage();
    connectStream();
  });
