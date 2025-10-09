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
    announceLabel: 'Automatyczny odczyt',
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
    liveBadge: 'LIVE',
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
    },
    history: {
      title: 'Historia meczów',
      empty: 'Brak zapisanych wyników.',
      columns: {
        description: 'Mecz',
        duration: 'Czas'
      },
      labels: {
        supertb: 'Wynik SUPERTB'
      }
    },
    accessibility: {
      versus: 'kontra',
      points: 'punkty',
      tieBreak: 'tiebreak',
      superTieBreak: 'super tiebreak',
      set: 'Set {number}'
    },
    shortcuts: {
      desc: 'Skróty: [1–6] – korty, H – historia.'
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
    announceLabel: 'Automatische Ansage',
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
    liveBadge: 'LIVE',
    shortcuts: { desc: 'Kurzbefehle: [1–6] Plätze, H – Historie.' },
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
    },
    history: {
      title: 'Match-Historie',
      empty: 'Keine gespeicherten Ergebnisse.',
      columns: {
        description: 'Begegnung',
        duration: 'Dauer'
      },
      labels: {
        supertb: 'Super-Tiebreak'
      }
    },
    accessibility: {
      versus: 'gegen',
      points: 'Punkte',
      tieBreak: 'Tiebreak',
      superTieBreak: 'Super-Tiebreak',
      set: 'Satz {number}'
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
    announceLabel: 'Automatic readout',
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
    liveBadge: 'LIVE',
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
    },
    history: {
      title: 'Match history',
      empty: 'No saved results.',
      columns: {
        description: 'Match',
        duration: 'Duration'
      },
      labels: {
        supertb: 'Super tiebreak'
      }
    },
    shortcuts: { desc: 'Shortcuts: [1–6] courts, H – history.' },
    accessibility: {
      versus: 'versus',
      points: 'points',
      tieBreak: 'tie-break',
      superTieBreak: 'super tie-break',
      set: 'Set {number}'
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
    announceLabel: 'Lettura automatica',
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
    liveBadge: 'LIVE',
    shortcuts: { desc: 'Scorciatoie: [1–6] campi, H – storia.' },
    liveBadge: 'LIVE',
    shortcuts: { desc: 'Scorciatoie: [1–6] campi, H – storia.' },
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
    },
    history: {
      title: 'Storico incontri',
      empty: 'Nessun risultato salvato.',
      columns: {
        description: 'Incontro',
        duration: 'Durata'
      },
      labels: {
        supertb: 'Super tie-break'
      }
    },
    accessibility: {
      versus: 'contro',
      points: 'punti',
      tieBreak: 'tie-break',
      superTieBreak: 'super tie-break',
      set: 'Set {number}'
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
    announceLabel: 'Lectura automática',
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
    liveBadge: 'EN VIVO',
    shortcuts: { desc: 'Atajos: [1–6] canchas, H – historial.' },
    liveBadge: 'EN VIVO',
    shortcuts: { desc: 'Atajos: [1–6] canchas, H – historial.' },
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
    },
    history: {
      title: 'Historial de partidos',
      empty: 'No hay resultados guardados.',
      columns: {
        description: 'Partido',
        duration: 'Duración'
      },
      labels: {
        supertb: 'Resultado super desempate'
      }
    },
    accessibility: {
      versus: 'contra',
      points: 'puntos',
      tieBreak: 'tie-break',
      superTieBreak: 'super tie-break',
      set: 'Set {number}'
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
    announceLabel: 'Automaattinen kuulutus',
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
    liveBadge: 'LIVE',
    shortcuts: { desc: 'Pikanäppäimet: [1–6] kentät, H – historia.' },
    liveBadge: 'LIVE',
    shortcuts: { desc: 'Pikanäppäimet: [1–6] kentät, H – historia.' },
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
    },
    history: {
      title: 'Otteluhistoria',
      empty: 'Ei tallennettuja tuloksia.',
      columns: {
        description: 'Ottelu',
        duration: 'Kesto'
      },
      labels: {
        supertb: 'Super-tiebreak-tulos'
      }
    },
    accessibility: {
      versus: 'vastaan',
      points: 'pisteet',
      tieBreak: 'tiebreak',
      superTieBreak: 'super-tiebreak',
      set: 'Erä {number}'
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
    announceLabel: 'Автоматичне озвучування',
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
    liveBadge: 'LIVE',
    shortcuts: { desc: 'Скорочення: [1–6] корти, H – історія.' },
    liveBadge: 'LIVE',
    shortcuts: { desc: 'Скорочення: [1–6] корти, H – історія.' },
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
    },
    history: {
      title: 'Історія матчів',
      empty: 'Немає збережених результатів.',
      columns: {
        description: 'Матч',
        duration: 'Тривалість'
      },
      labels: {
        supertb: 'Результат супер-тайбрейку'
      }
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
    announceLabel: 'Lecture automatique',
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
    liveBadge: 'EN DIRECT',
    shortcuts: { desc: 'Raccourcis : [1–6] courts, H – historique.' },
    liveBadge: 'EN DIRECT',
    shortcuts: { desc: 'Raccourcis : [1–6] courts, H – historique.' },
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
    },
    history: {
      title: 'Historique des matchs',
      empty: 'Aucun résultat enregistré.',
      columns: {
        description: 'Match',
        duration: 'Durée'
      },
      labels: {
        supertb: 'Résultat super tie-break'
      }
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
    announceLabel: 'Automatinis skaitymas',
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
    liveBadge: 'TIESIOGIAI',
    shortcuts: { desc: 'Trumpiniai: [1–6] aikštės, H – istorija.' },
    liveBadge: 'TIESIOGIAI',
    shortcuts: { desc: 'Trumpiniai: [1–6] aikštės, H – istorija.' },
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
    },
    history: {
      title: 'Mačo istorija',
      empty: 'Nėra išsaugotų rezultatų.',
      columns: {
        description: 'Mačas',
        duration: 'Trukmė'
      },
      labels: {
        supertb: 'Super taibreiko rezultatas'
      }
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
let currentLang = TRANSLATIONS[storedLang] ? storedLang : 'pl';

function currentT() {
  return getTranslation(currentLang);
}

function currentLocale() {
  const t = currentT();
  return t.htmlLang || currentLang;
}

function resolveAccessibilityStrings(t) {
  const acc = t.accessibility || {};
  let versus = acc.versus;
  if (!versus) {
    if (currentLang === 'pl') {
      versus = 'kontra';
    } else if (currentLang === 'en') {
      versus = 'versus';
    } else {
      versus = t.versus || 'versus';
    }
  }
  const rawPoints = acc.points || t.table?.columns?.points || 'Points';
  const points = rawPoints.replace(/\s*\(.*?\)\s*/g, '').trim() || 'Points';
  const tieBreak = acc.tieBreak || 'tie-break';
  const superTieBreak = acc.superTieBreak || `super ${tieBreak}`;
  let setTemplate = acc.set;
  if (!setTemplate) {
    const rawSet = t.table?.columns?.set1;
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
  return { versus, points, tieBreak, superTieBreak, setTemplate };
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
  const acc = resolveAccessibilityStrings(t);
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

    <table class="score-table" role="presentation" aria-labelledby="heading-${k}">
      <tbody>
      <tr>
        <th scope="row" class="player-cell">
          <span class="player-flag" id="k${k}-flag-A" aria-hidden="true"></span>
          <span class="player-name" id="k${k}-name-A">${defaultA}</span>
        </th>
        <td class="points" id="k${k}-pts-A">0</td>
        <td class="set set-1" id="k${k}-s1-A">0</td>
        <td class="set set-2" id="k${k}-s2-A">0</td>
      </tr>
      <tr>
        <th scope="row" class="player-cell">
          <span class="player-flag" id="k${k}-flag-B" aria-hidden="true"></span>
          <span class="player-name" id="k${k}-name-B">${defaultB}</span>
        </th>
        <td class="points" id="k${k}-pts-B">0</td>
        <td class="set set-1" id="k${k}-s1-B">0</td>
        <td class="set set-2" id="k${k}-s2-B">0</td>
      </tr>
    </tbody>
  </table>
  `;

  const cb = section.querySelector(`#announce-${k}`);
  cb.checked = getAnnounce(k);
  cb.addEventListener('change', () => setAnnounce(k, cb.checked));

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
  const table = document.createElement('table');
  table.className = 'history-table';
  const cols = t.history?.columns || {
    description: 'Mecz',
    duration: 'Czas'
  };
  table.innerHTML = `
    <thead>
      <tr>
        <th scope="col">${cols.description}</th>
        <th scope="col">${cols.duration}</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  const start = (page - 1) * SIZE;
  const slice = history.slice(start, start + SIZE);
  slice.forEach((entry) => {
    const row = document.createElement('tr');
    const playerA = resolvePlayerName(entry.players?.A || {}, 'defaultA');
    const playerB = resolvePlayerName(entry.players?.B || {}, 'defaultB');
    const set1 = `${entry.sets?.set1?.A ?? 0}:${entry.sets?.set1?.B ?? 0}`;
    const set2 = `${entry.sets?.set2?.A ?? 0}:${entry.sets?.set2?.B ?? 0}`;
    const tie = entry.sets?.tie || {};
    const duration = entry.duration_text || _formatDurationLocal(entry.duration_seconds || 0);

    const courtLabel = format(currentT().courtLabel, { court: entry.kort });
    const head = `${courtLabel}, ${playerA} : ${playerB}`;
    const segments = [set1, set2];
    if (tie.played) {
      const label = t.history?.labels?.supertb || 'SUPERTB';
      segments.push(`${label} ${tie.A ?? 0}:${tie.B ?? 0}`);
    }
    const description = [head, ...segments].join(' | ');

    const cells = [description, duration];
    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = typeof value === 'string' ? value : String(value ?? '');
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });

  body.appendChild(table);
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

function applyScoreAria(k, data) {
  const section = document.getElementById(`kort-${k}`);
  if (!section) return;
  const table = section.querySelector('.score-table');
  if (!table) return;
  const t = currentT();
  const acc = resolveAccessibilityStrings(t);
  const nameA = resolvePlayerName(data.A || {}, 'defaultA');
  const nameB = resolvePlayerName(data.B || {}, 'defaultB');
  const pointsA = (document.getElementById(`k${k}-pts-A`)?.textContent || '0').trim();
  const pointsB = (document.getElementById(`k${k}-pts-B`)?.textContent || '0').trim();
  const set1A = (document.getElementById(`k${k}-s1-A`)?.textContent || '0').trim();
  const set1B = (document.getElementById(`k${k}-s1-B`)?.textContent || '0').trim();
  const set2A = (document.getElementById(`k${k}-s2-A`)?.textContent || '0').trim();
  const set2B = (document.getElementById(`k${k}-s2-B`)?.textContent || '0').trim();
  const currentSet = Number(data.current_set || 1);
  const tieVisible = data.tie?.visible === true;
  const isSuperTieBreak = tieVisible && currentSet === 3;

  const summaryParts = [`${nameA} ${acc.versus} ${nameB}`];
  let pointsSegment = `${acc.points} ${pointsA}:${pointsB}`;
  if (tieVisible) {
    const tieLabel = isSuperTieBreak ? acc.superTieBreak : acc.tieBreak;
    pointsSegment += `, ${tieLabel}`;
  }
  summaryParts.push(pointsSegment);

  const setSegments = [];
  [
    { index: 1, a: set1A, b: set1B },
    { index: 2, a: set2A, b: set2B }
  ].forEach(({ index, a, b }) => {
    const aNum = Number.parseInt(a, 10) || 0;
    const bNum = Number.parseInt(b, 10) || 0;
    const include = index === 1 || currentSet >= index || aNum > 0 || bNum > 0;
    if (!include) return;
    const label = format(acc.setTemplate, { number: index });
    setSegments.push(`${label}: ${a}:${b}`);
  });

  if (setSegments.length) {
    summaryParts.push(setSegments.join(', '));
  }

  const summary = summaryParts.join('. ');
  table.setAttribute('aria-label', summary);
  section.setAttribute('aria-label', summary);
}

function updateTitle(k, Adata, Bdata) {
  const t = currentT();
  const title = document.getElementById(`title-${k}`);
  const safeA = resolvePlayerName(Adata, 'defaultA');
  const safeB = resolvePlayerName(Bdata, 'defaultB');

  if (title) {
    const nameAEl = title.querySelector('[data-title="A"]');
    const nameBEl = title.querySelector('[data-title="B"]');
    const versusEl = title.querySelector('.match-versus');
    if (nameAEl && nameBEl && versusEl) {
      const acc = resolveAccessibilityStrings(t);
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
  const courtLabel = document.getElementById(`court-label-${k}`);
  if (courtLabel) {
    courtLabel.textContent = format(t.courtLabel, { court: k });
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
  if (last === 'A' || last === 'B') return last;
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
  setStatus(k, data.overlay_visible, data.tie?.visible);

  const prevK = prev[k] || { A: {}, B: {}, tie: {} };
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

  const tieNow = data.tie || {};
  const tiePrev = prevK.tie || {};

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
  applyScoreAria(k, data);

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
  if (headerDesc) headerDesc.textContent = (t.shortcuts && t.shortcuts.desc)
    ? t.shortcuts.desc
    : t.description;
  const liveBadge = document.getElementById('live-badge');
  if (liveBadge) liveBadge.textContent = t.liveBadge || 'LIVE';
  if (nav) nav.setAttribute('aria-label', t.navLabel);
  if (controlsTitle) controlsTitle.textContent = t.controlsTitle;
  if (langLabel) langLabel.textContent = t.languageLabel;
  if (pauseBtn) pauseBtn.textContent = paused ? t.pause.resume : t.pause.pause;
  refreshNavLanguage();
  refreshCardsLanguage();
  updateLastRefresh();
  renderError();
  ensureHistoryToggle();
}

function applyLanguage(lang, { skipSave = false, skipSelect = false } = {}) {
  if (!TRANSLATIONS[lang]) lang = 'pl';
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
  COURTS = computeCourts(state);
  COURTS.forEach(k => {
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

// Keyboard shortcuts: 1–6 courts, H = history
document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const target = e.target;
  const isField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
  if (isField) return;
  const key = e.key;
  if (/^[1-6]$/.test(key)) {
    const idx = Number(key) - 1;
    const court = COURTS[idx];
    if (court) {
      const el = document.getElementById(`kort-${court}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else if (key === 'h' || key === 'H') {
    const hist = document.getElementById('history-section');
    if (hist) hist.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
