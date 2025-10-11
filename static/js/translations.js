export const DEFAULT_LANG = 'pl';

export const TRANSLATIONS = {
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
        tieBreak: 'Tie Break',
        superTieBreak: 'Super TB',
        set1: 'Set 1',
        set2: 'Set 2'
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
        category: 'Kategoria',
        phase: 'Faza',
        duration: 'Czas'
      },
      labels: {
        supertb: 'Wynik SUPERTB'
      }
    },
    accessibility: {
      versus: 'kontra',
      points: 'punkty',
      tieBreak: 'tie-break',
      superTieBreak: 'super tie-break',
      set: 'Set {number}',
      active: 'aktywny'
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
        tieBreak: 'Tiebreak',
        superTieBreak: 'Super-Tiebreak',
        set1: 'Satz 1',
        set2: 'Satz 2'
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
        category: 'Kategorie',
        phase: 'Phase',
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
      set: 'Satz {number}',
      active: 'aktiv'
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
        tieBreak: 'Tie-break',
        superTieBreak: 'Super tie-break',
        set1: 'Set 1',
        set2: 'Set 2'
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
        category: 'Category',
        phase: 'Phase',
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
      set: 'Set {number}',
      active: 'active'
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
        tieBreak: 'Tie-break',
        superTieBreak: 'Super tie-break',
        set1: 'Set 1',
        set2: 'Set 2'
      }
    },
    players: { defaultA: 'Giocatore A', defaultB: 'Giocatore B', fallback: 'giocatore', fallbackOpponent: 'avversario' },
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
        category: 'Categoria',
        phase: 'Fase',
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
      set: 'Set {number}',
      active: 'attivo'
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
        tieBreak: 'Tie break',
        superTieBreak: 'Súper tie break',
        set1: 'Set 1',
        set2: 'Set 2'
      }
    },
    players: { defaultA: 'Jugador A', defaultB: 'Jugador B', fallback: 'jugador', fallbackOpponent: 'rival' },
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
        category: 'Categoría',
        phase: 'Fase',
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
      set: 'Set {number}',
      active: 'activo'
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
        tieBreak: 'Tie-break',
        superTieBreak: 'Super-tie-break',
        set1: 'Erä 1',
        set2: 'Erä 2'
      }
    },
    players: { defaultA: 'Pelaaja A', defaultB: 'Pelaaja B', fallback: 'pelaaja', fallbackOpponent: 'vastustaja' },
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
        category: 'Luokka',
        phase: 'Vaihe',
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
      set: 'Erä {number}',
      active: 'käynnissä'
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
        tieBreak: 'Тай-брейк',
        superTieBreak: 'Супер тай-брейк',
        set1: 'Сет 1',
        set2: 'Сет 2'
      }
    },
    players: { defaultA: 'Гравець A', defaultB: 'Гравець B', fallback: 'гравець', fallbackOpponent: 'суперник' },
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
        category: 'Категорія',
        phase: 'Стадія',
        duration: 'Тривалість'
      },
      labels: {
        supertb: 'Результат супер-тайбрейку'
      }
    },
    accessibility: {
      versus: 'проти',
      points: 'очки',
      tieBreak: 'тай-брейк',
      superTieBreak: 'супер тай-брейк',
      set: 'Сет {number}',
      active: 'активний'
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
      label: 'Statut : {state}{tiebreak}',
      states: { unknown: 'inconnu', visible: 'visible', hidden: 'masqué' },
      tiebreak: {
        yes: ' | Super tie-break : OUI',
        no: ' | Super tie-break : NON',
        off: ''
      }
    },
    table: {
      caption: 'Scores – Court {court} : {playerA} {versus} {playerB}',
      columns: {
        name: 'Nom',
        points: 'Points',
        tieBreak: 'Tie-break',
        superTieBreak: 'Super tie-break',
        set1: 'Set 1',
        set2: 'Set 2'
      }
    },
    players: { defaultA: 'Joueur A', defaultB: 'Joueur B', fallback: 'joueur', fallbackOpponent: 'adversaire' },
    liveBadge: 'EN DIRECT',
    shortcuts: { desc: 'Raccourcis : [1–6] courts, H – historique.' },
    versus: 'contre',
    meta: {
      lastRefresh: 'Dernière mise à jour : {time}.',
      lastRefreshNever: 'Dernière mise à jour : aucune.'
    },
    errors: { fetch: 'Erreur lors du chargement des données ({message}).' },
    announcements: {
      points: 'points {player} {value}',
      games: 'jeux {player} {value}',
      setEnd: 'fin de set : {winner} {winnerGames} à {loser} {loserGames}',
      tiePoint: 'tie-break {player} {value}',
      tieToggleOn: 'Super tie-break commencé',
      tieToggleOff: 'Super tie-break terminé'
    },
    history: {
      title: 'Historique des matchs',
      empty: 'Aucun résultat enregistré.',
      columns: {
        description: 'Match',
        category: 'Catégorie',
        phase: 'Phase',
        duration: 'Durée'
      },
      labels: {
        supertb: 'Résultat super tie-break'
      }
    },
    accessibility: {
      versus: 'contre',
      points: 'points',
      tieBreak: 'tie-break',
      superTieBreak: 'super tie-break',
      set: 'Set {number}',
      active: 'actif'
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
        tieBreak: 'Taibreikas',
        superTieBreak: 'Super taibreikas',
        set1: 'Setas 1',
        set2: 'Setas 2'
      }
    },
    players: { defaultA: 'Žaidėjas A', defaultB: 'Žaidėjas B', fallback: 'žaidėjas', fallbackOpponent: 'varžovas' },
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
        category: 'Kategorija',
        phase: 'Etapas',
        duration: 'Trukmė'
      },
      labels: {
        supertb: 'Super taibreiko rezultatas'
      }
    },
    accessibility: {
      versus: 'prieš',
      points: 'taškai',
      tieBreak: 'taibreikas',
      superTieBreak: 'super taibreikas',
      set: 'Setas {number}',
      active: 'aktyvus'
    }
  }
};

export const SUPPORTED_LANGS = Object.keys(TRANSLATIONS);

export function getTranslation(lang) {
  return TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANG];
}
