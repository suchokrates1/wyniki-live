/* ============================================================
   TRANSLATIONS (ported from v1 translations.js)
   ============================================================ */
export const TRANSLATIONS = {
  pl: {
    htmlLang: 'pl',
    pageTitle: 'Wyniki tenisowe \u2013 na \u017cywo',
    navLabel: 'Szybka nawigacja po kortach',
    courtLabel: 'Kort {court}',
    liveBadge: 'LIVE',
    versus: 'vs',
    tieBreakLabel: 'TB',
    superTieBreakLabel: 'STB',
    table: {
      columns: {
        points: 'Punkty',
        tieBreak: 'TB',
        superTieBreak: 'STB',
        set1: 'Set 1', set2: 'Set 2', set3: 'Set 3'
      }
    },
    players: { defaultA: 'Gracz A', defaultB: 'Gracz B' },
    meta: { lastRefresh: 'Ostatnie odświeżenie: {time}.' },
    accessibility: {
      versus: 'kontra',
      points: 'punkty',
      tieBreak: 'tie-break',
      superTieBreak: 'super tie-break',
      set: 'Set {number}',
      active: 'aktywny',
      serving: 'serwuje'
    },
    history: { title: 'Historia meczów', court: 'Kort', vs: 'vs', score: 'wynik', time: 'czas', category: 'Kategoria', phaseGroup: 'Grupowa', phaseKnockout: 'Pucharowa', catWomen: 'Kobiety', catMen: 'Mężczyźni', catMixed: 'Mieszane' },
    footer: { set: 'Set' },
    stats: {
      aces: 'Asy', doubleFaults: 'Podwójne błędy', winners: 'Winnery',
      forcedErrors: 'Wymuszone błędy', unforcedErrors: 'Niewymuszone błędy',
      firstServe: '1. serwis', firstServePct: '1. serwis %', pointsWon: 'Pkt wygrane',
      advanced: 'Statystyki zaawansowane', simple: 'Statystyki podstawowe'
    },
    emptyTitle: 'Brak aktywnych kortów',
    emptyText: 'Skonfiguruj korty w panelu administratora',
    loading: 'Ładowanie wyników...',
    historyDetail: {
      details: 'Szczegóły',
      collapse: 'Zwiń',
      loading: 'Ładowanie...',
      noStats: 'Brak statystyk',
      category: 'Kategoria',
      duration: 'Czas',
      startedAt: 'Rozpoczęcie:',
      endedAt: 'Zakończenie:'
    },
    tabs: { live: 'Na żywo', tournaments: 'Turnieje', players: 'Zawodnicy' },
    tournamentCard: { players: 'zawodników', active: 'Aktywny', noTournaments: 'Brak turniejów', backToList: 'Powrót do listy' },
    playerSection: { title: 'Baza zawodników', searchPlaceholder: 'Szukaj zawodnika...', all: 'Wszyscy', men: 'Mężczyźni', women: 'Kobiety', matchesPlayed: 'meczów', winsLabel: 'W', lossesLabel: 'L', noResults: 'Brak wyników', allCountries: 'Wszystkie kraje', allCategories: 'Wszystkie kategorie', genderShortM: 'M', genderShortF: 'K' },
    playerProfile: { back: 'Powrót do listy', category: 'Kategoria', country: 'Kraj', gender: 'Płeć', male: 'Mężczyzna', female: 'Kobieta', career: 'Kariera', tournaments: 'Turnieje', matches: 'Mecze', wins: 'Wygrane', losses: 'Przegrane', winRate: 'Skuteczność', medals: 'Medale', gold: 'Złoto', silver: 'Srebro', bronze: 'Brąz', tournamentHistory: 'Historia turniejów', group: 'Grupa', place: 'miejsce', of: 'z', groupPhase: 'Faza grupowa', knockoutPhase: 'Faza pucharowa', noTournaments: 'Brak turniejów', matchesInTournament: 'Mecze w turnieju', won: 'W', lost: 'P', vs: 'vs', duration: 'Czas' },
    darkModeTooltip: { light: 'Zmień na tryb jasny', dark: 'Zmień na tryb ciemny' },
    liveSub: { scores: 'Wyniki live', bracket: 'Drabinka', schedule: 'Terminarz', history: 'Historia' },
    schedule: { title: 'Terminarz rozgrywek', emptyTitle: 'Terminarz nie jest jeszcze opublikowany', emptyText: 'Biuro zawodów uzupełni orientacyjne godziny i korty.', loading: 'Ładowanie terminarza...', refresh: 'Odśwież', time: 'Godzina', court: 'Kort', category: 'Kategoria', phase: 'Etap', match: 'Mecz', status: 'Status', notes: 'Uwagi', searchLabel: 'Szukaj po nazwisku', searchPlaceholder: 'Szukaj nazwiska...', sortLabel: 'Sortowanie', sortCourt: 'Po korcie', sortCategory: 'Po kategorii', tabsLabelCourt: 'Wybierz kort', tabsLabelCategory: 'Wybierz kategorię', noResultsTitle: 'Brak dopasowanych meczów', noResultsText: 'Zmień wyszukiwaną frazę albo przełącz sposób sortowania.', timeTbd: 'godzina do potwierdzenia', courtTbd: 'kort do potwierdzenia', categoryTbd: 'kategoria do potwierdzenia', statusDraft: 'Roboczy', statusPlanned: 'Zaplanowany', statusInProgress: 'W trakcie', statusCompleted: 'Zakończony', updated: 'Terminarz zaktualizowany' },
    bracket: {
      emptyTitle: 'Brak drabinki', emptyText: 'Drabinka turniejowa nie została jeszcze skonfigurowana',
      group: 'Grupa', player: 'Zawodnik', wins: 'W', losses: 'L',
      setsHeader: 'Sety', gamesHeader: 'Gemy', matchesTitle: 'Mecze grupowe',
      knockoutTitle: 'Faza pucharowa', semifinal: 'Półfinał',
      finalLabel: 'Finał', thirdPlace: 'Mecz o 3. miejsce', forPlace: 'o',
      legendTitle: 'Legenda tabeli', legendWins: 'wygrane mecze', legendLosses: 'przegrane mecze',
      legendSets: 'sety wygrane do przegranych', legendGames: 'gemy wygrane do przegranych'
    },
    tournamentHistory: {
      selectTournament: 'Wybierz turniej',
      chooseTournament: '-- Wybierz turniej --',
      matchHistory: 'Historia meczów',
      bracket: 'Drabinka',
      schedule: 'Plan turnieju',
      noMatches: 'Brak meczów w tym turnieju'
    },
    connection: { lost: 'Połączenie przerwane' }
  },
  de: {
    htmlLang: 'de',
    pageTitle: 'Tennis-Ergebnisse – live',
    navLabel: 'Schnellnavigation zu den Plätzen',
    courtLabel: 'Platz {court}',
    liveBadge: 'LIVE',
    versus: 'gegen',
    tieBreakLabel: 'TB',
    superTieBreakLabel: 'STB',
    table: {
      columns: {
        points: 'Punkte',
        tieBreak: 'TB',
        superTieBreak: 'STB',
        set1: 'Satz 1', set2: 'Satz 2', set3: 'Satz 3'
      }
    },
    players: { defaultA: 'Spieler A', defaultB: 'Spieler B' },
    meta: { lastRefresh: 'Letzte Aktualisierung: {time}.' },
    accessibility: {
      versus: 'gegen',
      points: 'Punkte',
      tieBreak: 'Tiebreak',
      superTieBreak: 'Super-Tiebreak',
      set: 'Satz {number}',
      active: 'aktiv',
      serving: 'Aufschlag'
    },
    history: { title: 'Match-Historie', court: 'Platz', vs: 'gegen', score: 'Ergebnis', time: 'Zeit', category: 'Kategorie', phaseGroup: 'Gruppenphase', phaseKnockout: 'K.O.-Phase', catWomen: 'Frauen', catMen: 'Männer', catMixed: 'Mixed' },
    footer: { set: 'Satz' },
    stats: {
      aces: 'Asse', doubleFaults: 'Doppelfehler', winners: 'Winner',
      forcedErrors: 'Erzwungene Fehler', unforcedErrors: 'Unerzwungene Fehler',
      firstServe: '1. Aufschlag', firstServePct: '1. Aufschlag %', pointsWon: 'Gew. Punkte',
      advanced: 'Erweiterte Statistiken', simple: 'Einfache Statistiken'
    },
    emptyTitle: 'Keine aktiven Plätze',
    emptyText: 'Plätze im Adminbereich konfigurieren',
    loading: 'Ergebnisse werden geladen...',
    historyDetail: {
      details: 'Details',
      collapse: 'Einklappen',
      loading: 'Laden...',
      noStats: 'Keine Statistiken',
      category: 'Kategorie',
      duration: 'Dauer',
      startedAt: 'Beginn:',
      endedAt: 'Ende:'
    },
    tabs: { live: 'Live', tournaments: 'Turniere', players: 'Spieler' },
    tournamentCard: { players: 'Spieler', active: 'Aktiv', noTournaments: 'Keine Turniere', backToList: 'Zurück zur Liste' },
    playerSection: { title: 'Spielerdatenbank', searchPlaceholder: 'Spieler suchen...', all: 'Alle', men: 'Männer', women: 'Frauen', matchesPlayed: 'Spiele', winsLabel: 'S', lossesLabel: 'N', noResults: 'Keine Ergebnisse', allCountries: 'Alle Länder', allCategories: 'Alle Kategorien', genderShortM: 'M', genderShortF: 'W' },
    playerProfile: { back: 'Zurück zur Liste', category: 'Kategorie', country: 'Land', gender: 'Geschlecht', male: 'Mann', female: 'Frau', career: 'Karriere', tournaments: 'Turniere', matches: 'Spiele', wins: 'Siege', losses: 'Niederlagen', winRate: 'Siegquote', medals: 'Medaillen', gold: 'Gold', silver: 'Silber', bronze: 'Bronze', tournamentHistory: 'Turniergeschichte', group: 'Gruppe', place: 'Platz', of: 'von', groupPhase: 'Gruppenphase', knockoutPhase: 'K.-o.-Phase', noTournaments: 'Keine Turniere', matchesInTournament: 'Spiele im Turnier', won: 'S', lost: 'N', vs: 'vs', duration: 'Dauer' },
    darkModeTooltip: { light: 'Zum hellen Modus wechseln', dark: 'Zum dunklen Modus wechseln' },
    liveSub: { scores: 'Live-Ergebnisse', bracket: 'Turnierbaum', schedule: 'Zeitplan', history: 'Historie' },
    bracket: {
      emptyTitle: 'Kein Turnierbaum', emptyText: 'Der Turnierbaum wurde noch nicht konfiguriert',
      group: 'Gruppe', player: 'Spieler', wins: 'S', losses: 'N',
      setsHeader: 'Sätze', gamesHeader: 'Spiele', matchesTitle: 'Gruppenspiele',
      knockoutTitle: 'K.O.-Phase', semifinal: 'Halbfinale',
      finalLabel: 'Finale', thirdPlace: 'Spiel um Platz 3', forPlace: 'um Platz',
      legendTitle: 'Tabellenlegende', legendWins: 'gewonnene Spiele', legendLosses: 'verlorene Spiele',
      legendSets: 'gewonnene zu verlorenen Sätzen', legendGames: 'gewonnene zu verlorenen Spielen'
    },
    tournamentHistory: {
      selectTournament: 'Turnier auswählen',
      chooseTournament: '-- Turnier auswählen --',
      matchHistory: 'Spielhistorie',
      bracket: 'Turnierbaum',
      schedule: 'Turnierplan',
      noMatches: 'Keine Spiele in diesem Turnier'
    },
    connection: { lost: 'Verbindung unterbrochen' }
  },
  en: {
    htmlLang: 'en',
    pageTitle: 'Tennis Scores \u2013 Live',
    navLabel: 'Quick court navigation',
    courtLabel: 'Court {court}',
    liveBadge: 'LIVE',
    versus: 'vs',
    tieBreakLabel: 'TB',
    superTieBreakLabel: 'STB',
    table: {
      columns: {
        points: 'Points',
        tieBreak: 'TB',
        superTieBreak: 'STB',
        set1: 'Set 1', set2: 'Set 2', set3: 'Set 3'
      }
    },
    players: { defaultA: 'Player A', defaultB: 'Player B' },
    meta: { lastRefresh: 'Last refresh: {time}.' },
    accessibility: {
      versus: 'versus',
      points: 'points',
      tieBreak: 'tie-break',
      superTieBreak: 'super tie-break',
      set: 'Set {number}',
      active: 'active',
      serving: 'serving'
    },
    history: { title: 'Match history', court: 'Court', vs: 'vs', score: 'score', time: 'time', category: 'Category', phaseGroup: 'Group stage', phaseKnockout: 'Knockout', catWomen: 'Women', catMen: 'Men', catMixed: 'Mixed' },
    footer: { set: 'Set' },
    stats: {
      aces: 'Aces', doubleFaults: 'Double faults', winners: 'Winners',
      forcedErrors: 'Forced errors', unforcedErrors: 'Unforced errors',
      firstServe: '1st serve', firstServePct: '1st serve %', pointsWon: 'Points won',
      advanced: 'Advanced statistics', simple: 'Basic statistics'
    },
    emptyTitle: 'No active courts',
    emptyText: 'Configure courts in the admin panel',
    loading: 'Loading scores...',
    historyDetail: {
      details: 'Details',
      collapse: 'Collapse',
      loading: 'Loading...',
      noStats: 'No statistics',
      category: 'Category',
      duration: 'Duration',
      startedAt: 'Started:',
      endedAt: 'Ended:'
    },
    tabs: { live: 'Live', tournaments: 'Tournaments', players: 'Players' },
    tournamentCard: { players: 'players', active: 'Active', noTournaments: 'No tournaments', backToList: 'Back to list' },
    playerSection: { title: 'Player database', searchPlaceholder: 'Search player...', all: 'All', men: 'Men', women: 'Women', matchesPlayed: 'matches', winsLabel: 'W', lossesLabel: 'L', noResults: 'No results', allCountries: 'All countries', allCategories: 'All categories', genderShortM: 'M', genderShortF: 'F' },
    playerProfile: { back: 'Back to list', category: 'Category', country: 'Country', gender: 'Gender', male: 'Male', female: 'Female', career: 'Career', tournaments: 'Tournaments', matches: 'Matches', wins: 'Wins', losses: 'Losses', winRate: 'Win rate', medals: 'Medals', gold: 'Gold', silver: 'Silver', bronze: 'Bronze', tournamentHistory: 'Tournament history', group: 'Group', place: 'place', of: 'of', groupPhase: 'Group phase', knockoutPhase: 'Knockout phase', noTournaments: 'No tournaments', matchesInTournament: 'Tournament matches', won: 'W', lost: 'L', vs: 'vs', duration: 'Duration' },
    darkModeTooltip: { light: 'Switch to light mode', dark: 'Switch to dark mode' },
    liveSub: { scores: 'Live scores', bracket: 'Bracket', schedule: 'Schedule', history: 'History' },
    schedule: { title: 'Tournament schedule', emptyTitle: 'The schedule is not published yet', emptyText: 'The tournament office will add approximate times and courts.', loading: 'Loading schedule...', refresh: 'Refresh', time: 'Time', court: 'Court', category: 'Category', phase: 'Stage', match: 'Match', status: 'Status', notes: 'Notes', searchLabel: 'Search by surname', searchPlaceholder: 'Search surname...', sortLabel: 'Sorting', sortCourt: 'By court', sortCategory: 'By category', tabsLabelCourt: 'Choose court', tabsLabelCategory: 'Choose category', noResultsTitle: 'No matching matches', noResultsText: 'Change the search phrase or switch the sort mode.', timeTbd: 'time to be confirmed', courtTbd: 'court to be confirmed', categoryTbd: 'category to be confirmed', statusDraft: 'Draft', statusPlanned: 'Planned', statusInProgress: 'In progress', statusCompleted: 'Finished', updated: 'Schedule updated' },
    bracket: {
      emptyTitle: 'No bracket', emptyText: 'Tournament bracket has not been configured yet',
      group: 'Group', player: 'Player', wins: 'W', losses: 'L',
      setsHeader: 'Sets', gamesHeader: 'Games', matchesTitle: 'Group matches',
      knockoutTitle: 'Knockout stage', semifinal: 'Semifinal',
      finalLabel: 'Final', thirdPlace: 'Third place match', forPlace: 'for',
      legendTitle: 'Table legend', legendWins: 'matches won', legendLosses: 'matches lost',
      legendSets: 'sets won to sets lost', legendGames: 'games won to games lost'
    },
    tournamentHistory: {
      selectTournament: 'Select tournament',
      chooseTournament: '-- Select tournament --',
      matchHistory: 'Match history',
      bracket: 'Bracket',
      schedule: 'Tournament schedule',
      noMatches: 'No matches in this tournament'
    },
    connection: { lost: 'Connection interrupted' }
  },
  it: {
    htmlLang: 'it',
    pageTitle: 'Risultati tennis \u2013 in diretta',
    navLabel: 'Navigazione rapida dei campi',
    courtLabel: 'Campo {court}',
    liveBadge: 'LIVE',
    versus: 'contro',
    tieBreakLabel: 'TB',
    superTieBreakLabel: 'STB',
    table: {
      columns: {
        points: 'Punti',
        tieBreak: 'TB',
        superTieBreak: 'STB',
        set1: 'Set 1', set2: 'Set 2', set3: 'Set 3'
      }
    },
    players: { defaultA: 'Giocatore A', defaultB: 'Giocatore B' },
    meta: { lastRefresh: 'Ultimo aggiornamento: {time}.' },
    accessibility: {
      versus: 'contro',
      points: 'punti',
      tieBreak: 'tie-break',
      superTieBreak: 'super tie-break',
      set: 'Set {number}',
      active: 'attivo',
      serving: 'al servizio'
    },
    history: { title: 'Storico incontri', court: 'Campo', vs: 'contro', score: 'risultato', time: 'tempo', category: 'Categoria', phaseGroup: 'Fase a gironi', phaseKnockout: 'Eliminazione', catWomen: 'Donne', catMen: 'Uomini', catMixed: 'Misto' },
    footer: { set: 'Set' },
    stats: {
      aces: 'Ace', doubleFaults: 'Doppi falli', winners: 'Vincenti',
      forcedErrors: 'Errori forzati', unforcedErrors: 'Errori non forzati',
      firstServe: '1° servizio', firstServePct: '1° servizio %', pointsWon: 'Punti vinti',
      advanced: 'Statistiche avanzate', simple: 'Statistiche base'
    },
    emptyTitle: 'Nessun campo attivo',
    emptyText: 'Configura i campi nel pannello di amministrazione',
    loading: 'Caricamento risultati...',
    historyDetail: {
      details: 'Dettagli',
      collapse: 'Chiudi',
      loading: 'Caricamento...',
      noStats: 'Nessuna statistica',
      category: 'Categoria',
      duration: 'Durata',
      startedAt: 'Inizio:',
      endedAt: 'Fine:'
    },
    tabs: { live: 'Live', tournaments: 'Tornei', players: 'Giocatori' },
    tournamentCard: { players: 'giocatori', active: 'Attivo', noTournaments: 'Nessun torneo', backToList: 'Torna alla lista' },
    playerSection: { title: 'Database giocatori', searchPlaceholder: 'Cerca giocatore...', all: 'Tutti', men: 'Uomini', women: 'Donne', matchesPlayed: 'partite', winsLabel: 'V', lossesLabel: 'S', noResults: 'Nessun risultato', allCountries: 'Tutti i paesi', allCategories: 'Tutte le categorie', genderShortM: 'M', genderShortF: 'F' },
    playerProfile: { back: 'Torna alla lista', category: 'Categoria', country: 'Paese', gender: 'Genere', male: 'Uomo', female: 'Donna', career: 'Carriera', tournaments: 'Tornei', matches: 'Partite', wins: 'Vittorie', losses: 'Sconfitte', winRate: 'Percentuale', medals: 'Medaglie', gold: 'Oro', silver: 'Argento', bronze: 'Bronzo', tournamentHistory: 'Storico tornei', group: 'Girone', place: 'posto', of: 'di', groupPhase: 'Fase a gironi', knockoutPhase: 'Fase a eliminazione', noTournaments: 'Nessun torneo', matchesInTournament: 'Partite nel torneo', won: 'V', lost: 'S', vs: 'vs', duration: 'Durata' },
    darkModeTooltip: { light: 'Passa alla modalità chiara', dark: 'Passa alla modalità scura' },
    liveSub: { scores: 'Risultati live', bracket: 'Tabellone', schedule: 'Programma', history: 'Cronologia' },
    bracket: {
      emptyTitle: 'Nessun tabellone', emptyText: 'Il tabellone del torneo non è ancora stato configurato',
      group: 'Girone', player: 'Giocatore', wins: 'V', losses: 'S',
      setsHeader: 'Set', gamesHeader: 'Game', matchesTitle: 'Partite del girone',
      knockoutTitle: 'Fase a eliminazione', semifinal: 'Semifinale',
      finalLabel: 'Finale', thirdPlace: 'Finale per il 3° posto', forPlace: 'per il',
      legendTitle: 'Legenda tabella', legendWins: 'partite vinte', legendLosses: 'partite perse',
      legendSets: 'set vinti rispetto ai set persi', legendGames: 'game vinti rispetto ai game persi'
    },
    tournamentHistory: {
      selectTournament: 'Seleziona torneo',
      chooseTournament: '-- Seleziona torneo --',
      matchHistory: 'Cronologia partite',
      bracket: 'Tabellone',
      schedule: 'Programma del torneo',
      noMatches: 'Nessuna partita in questo torneo'
    },
    connection: { lost: 'Connessione interrotta' }
  },
  es: {
    htmlLang: 'es',
    pageTitle: 'Resultados de tenis – en vivo',
    navLabel: 'Navegación rápida por canchas',
    courtLabel: 'Cancha {court}',
    liveBadge: 'EN VIVO',
    versus: 'contra',
    tieBreakLabel: 'TB',
    superTieBreakLabel: 'STB',
    table: {
      columns: {
        points: 'Puntos',
        tieBreak: 'TB',
        superTieBreak: 'STB',
        set1: 'Set 1', set2: 'Set 2', set3: 'Set 3'
      }
    },
    players: { defaultA: 'Jugador A', defaultB: 'Jugador B' },
    meta: { lastRefresh: 'Última actualización: {time}.' },
    accessibility: {
      versus: 'contra',
      points: 'puntos',
      tieBreak: 'tie-break',
      superTieBreak: 'super tie-break',
      set: 'Set {number}',
      active: 'activo',
      serving: 'al servicio'
    },
    history: { title: 'Historial de partidos', court: 'Cancha', vs: 'contra', score: 'resultado', time: 'tiempo', category: 'Categoría', phaseGroup: 'Fase de grupos', phaseKnockout: 'Eliminatoria', catWomen: 'Mujeres', catMen: 'Hombres', catMixed: 'Mixto' },
    footer: { set: 'Set' },
    stats: {
      aces: 'Aces', doubleFaults: 'Dobles faltas', winners: 'Ganadores',
      forcedErrors: 'Errores forzados', unforcedErrors: 'Errores no forzados',
      firstServe: '1er servicio', firstServePct: '1er servicio %', pointsWon: 'Puntos ganados',
      advanced: 'Estadísticas avanzadas', simple: 'Estadísticas básicas'
    },
    emptyTitle: 'No hay canchas activas',
    emptyText: 'Configure las canchas en el panel de administración',
    loading: 'Cargando resultados...',
    historyDetail: {
      details: 'Detalles',
      collapse: 'Cerrar',
      loading: 'Cargando...',
      noStats: 'Sin estadísticas',
      category: 'Categoría',
      duration: 'Duración',
      startedAt: 'Inicio:',
      endedAt: 'Fin:'
    },
    tabs: { live: 'En vivo', tournaments: 'Torneos', players: 'Jugadores' },
    tournamentCard: { players: 'jugadores', active: 'Activo', noTournaments: 'Sin torneos', backToList: 'Volver a la lista' },
    playerSection: { title: 'Base de jugadores', searchPlaceholder: 'Buscar jugador...', all: 'Todos', men: 'Hombres', women: 'Mujeres', matchesPlayed: 'partidos', winsLabel: 'V', lossesLabel: 'D', noResults: 'Sin resultados', allCountries: 'Todos los países', allCategories: 'Todas las categorías', genderShortM: 'M', genderShortF: 'F' },
    playerProfile: { back: 'Volver a la lista', category: 'Categoría', country: 'País', gender: 'Género', male: 'Hombre', female: 'Mujer', career: 'Carrera', tournaments: 'Torneos', matches: 'Partidos', wins: 'Victorias', losses: 'Derrotas', winRate: 'Efectividad', medals: 'Medallas', gold: 'Oro', silver: 'Plata', bronze: 'Bronce', tournamentHistory: 'Historial de torneos', group: 'Grupo', place: 'puesto', of: 'de', groupPhase: 'Fase de grupos', knockoutPhase: 'Fase eliminatoria', noTournaments: 'Sin torneos', matchesInTournament: 'Partidos del torneo', won: 'V', lost: 'D', vs: 'vs', duration: 'Duración' },
    darkModeTooltip: { light: 'Cambiar a modo claro', dark: 'Cambiar a modo oscuro' },
    liveSub: { scores: 'En vivo', bracket: 'Cuadro', schedule: 'Calendario', history: 'Historial' },
    bracket: {
      emptyTitle: 'Sin cuadro', emptyText: 'El cuadro del torneo aún no ha sido configurado',
      group: 'Grupo', player: 'Jugador', wins: 'V', losses: 'D',
      setsHeader: 'Sets', gamesHeader: 'Juegos', matchesTitle: 'Partidos del grupo',
      knockoutTitle: 'Fase eliminatoria', semifinal: 'Semifinal',
      finalLabel: 'Final', thirdPlace: 'Partido por el 3er lugar', forPlace: 'por el',
      legendTitle: 'Leyenda de la tabla', legendWins: 'partidos ganados', legendLosses: 'partidos perdidos',
      legendSets: 'sets ganados frente a perdidos', legendGames: 'juegos ganados frente a perdidos'
    },
    tournamentHistory: {
      selectTournament: 'Seleccionar torneo',
      chooseTournament: '-- Seleccionar torneo --',
      matchHistory: 'Historial de partidos',
      bracket: 'Cuadro',
      schedule: 'Calendario del torneo',
      noMatches: 'No hay partidos en este torneo'
    },
    connection: { lost: 'Conexión interrumpida' }
  },
  fr: {
    htmlLang: 'fr',
    pageTitle: 'R\u00e9sultats tennis \u2013 en direct',
    navLabel: 'Navigation rapide des courts',
    courtLabel: 'Court {court}',
    liveBadge: 'EN DIRECT',
    versus: 'contre',
    tieBreakLabel: 'TB',
    superTieBreakLabel: 'STB',
    table: {
      columns: {
        points: 'Points',
        tieBreak: 'TB',
        superTieBreak: 'STB',
        set1: 'Set 1', set2: 'Set 2', set3: 'Set 3'
      }
    },
    players: { defaultA: 'Joueur A', defaultB: 'Joueur B' },
    meta: { lastRefresh: 'Dernière mise à jour: {time}.' },
    accessibility: {
      versus: 'contre',
      points: 'points',
      tieBreak: 'jeu décisif',
      superTieBreak: 'super jeu décisif',
      set: 'Set {number}',
      active: 'actif',
      serving: 'au service'
    },
    history: { title: 'Historique des matchs', court: 'Court', vs: 'contre', score: 'score', time: 'temps', category: 'Catégorie', phaseGroup: 'Phase de groupes', phaseKnockout: 'Phase éliminatoire', catWomen: 'Femmes', catMen: 'Hommes', catMixed: 'Mixte' },
    footer: { set: 'Set' },
    stats: {
      aces: 'Aces', doubleFaults: 'Doubles fautes', winners: 'Coups gagnants',
      forcedErrors: 'Fautes provoquées', unforcedErrors: 'Fautes directes',
      firstServe: '1er service', firstServePct: '1er service %', pointsWon: 'Points gagnés',
      advanced: 'Statistiques avancées', simple: 'Statistiques de base'
    },
    emptyTitle: 'Aucun court actif',
    emptyText: 'Configurez les courts dans le panneau d\'administration',
    loading: 'Chargement des résultats...',
    historyDetail: {
      details: 'Détails',
      collapse: 'Réduire',
      loading: 'Chargement...',
      noStats: 'Pas de statistiques',
      category: 'Catégorie',
      duration: 'Durée',
      startedAt: 'Début:',
      endedAt: 'Fin:'
    },
    tabs: { live: 'En direct', tournaments: 'Tournois', players: 'Joueurs' },
    tournamentCard: { players: 'joueurs', active: 'Actif', noTournaments: 'Aucun tournoi', backToList: 'Retour à la liste' },
    playerSection: { title: 'Base de joueurs', searchPlaceholder: 'Rechercher un joueur...', all: 'Tous', men: 'Hommes', women: 'Femmes', matchesPlayed: 'matchs', winsLabel: 'V', lossesLabel: 'D', noResults: 'Aucun résultat', allCountries: 'Tous les pays', allCategories: 'Toutes les catégories', genderShortM: 'H', genderShortF: 'F' },
    playerProfile: { back: 'Retour à la liste', category: 'Catégorie', country: 'Pays', gender: 'Genre', male: 'Homme', female: 'Femme', career: 'Carrière', tournaments: 'Tournois', matches: 'Matchs', wins: 'Victoires', losses: 'Défaites', winRate: 'Taux de victoire', medals: 'Médailles', gold: 'Or', silver: 'Argent', bronze: 'Bronze', tournamentHistory: 'Historique des tournois', group: 'Groupe', place: 'place', of: 'sur', groupPhase: 'Phase de groupes', knockoutPhase: 'Phase éliminatoire', noTournaments: 'Aucun tournoi', matchesInTournament: 'Matchs du tournoi', won: 'V', lost: 'D', vs: 'vs', duration: 'Durée' },
    darkModeTooltip: { light: 'Passer au mode clair', dark: 'Passer au mode sombre' },
    liveSub: { scores: 'En direct', bracket: 'Tableau', schedule: 'Programme', history: 'Historique' },
    bracket: {
      emptyTitle: 'Pas de tableau', emptyText: 'Le tableau du tournoi n\'a pas encore été configuré',
      group: 'Groupe', player: 'Joueur', wins: 'V', losses: 'D',
      setsHeader: 'Sets', gamesHeader: 'Jeux', matchesTitle: 'Matchs de groupe',
      knockoutTitle: 'Phase à élimination', semifinal: 'Demi-finale',
      finalLabel: 'Finale', thirdPlace: 'Match pour la 3e place', forPlace: 'pour la',
      legendTitle: 'Légende du tableau', legendWins: 'matchs gagnés', legendLosses: 'matchs perdus',
      legendSets: 'sets gagnés contre sets perdus', legendGames: 'jeux gagnés contre jeux perdus'
    },
    tournamentHistory: {
      selectTournament: 'Sélectionner le tournoi',
      chooseTournament: '-- Sélectionner le tournoi --',
      matchHistory: 'Historique des matchs',
      bracket: 'Tableau',
      schedule: 'Programme du tournoi',
      noMatches: 'Aucun match dans ce tournoi'
    },
    connection: { lost: 'Connexion interrompue' }
  }
};

export const TRANSLATION_PATCHES = {
  pl: {
    ui: {
      appName: 'Wyniki tenisowe',
      pageDescription: 'Wyniki tenisowe na żywo, drabinki, plan turnieju i historia meczów.',
      skipToContent: 'Przejdź do treści',
      languageSelect: 'Wybierz język',
      poweredBy: 'Technologia',
    },
    meta: { lastRefresh: 'Ostatnia aktualizacja: {time}.' },
    history: { title: 'Ostatnie wyniki', noMatchesActive: 'Brak zakończonych meczów aktywnego turnieju' },
    tabs: { navLabel: 'Główna nawigacja' },
    tournamentCard: { backToList: 'Powrót do turniejów' },
    playerSection: { genderFilter: 'Filtr płci' },
    playerProfile: { ageLabel: '{years} lat', noMatches: 'Brak meczów', notFound: 'Nie znaleziono zawodnika' },
    liveSub: { navLabel: 'Sekcje na żywo', scores: 'Mecze na żywo', schedule: 'Plan turnieju', history: 'Wyniki' },
    schedule: { title: 'Plan turnieju', emptyTitle: 'Plan turnieju nie jest jeszcze opublikowany', loading: 'Ładowanie planu turnieju...', updated: 'Plan turnieju zaktualizowany' },
    bracket: { categoryTabsLabel: 'Kategorie turniejowe', podiumLabel: 'Podium', groupTableLabel: 'Tabela grupy {group}', treeLabel: 'Drabinka {category}', placeMatch: 'Mecz o {number}. miejsce' },
    tournamentHistory: { navLabel: 'Sekcje turnieju', matchHistory: 'Wyniki', schedule: 'Plan turnieju' },
    accessibility: { scoreJoiner: 'do', winner: 'Zwycięzca', result: 'Wynik meczu', court: 'Kort', phase: 'Etap', duration: 'Czas', unknownPlayer: 'zawodnik nieustalony', unknownCourt: 'kort nieustalony', scorePending: 'wynik nie jest jeszcze dostępny', stageMatch: '{phase}, mecz {number}', groupMatch: '{group}, mecz {number}', tournamentQuickInfoLabel: 'Komunikat turniejowy' },
  },
  de: {
    ui: { appName: 'Tennis-Ergebnisse', pageDescription: 'Live-Tennis-Ergebnisse, Turnierbaum, Turnierplan und Spielhistorie.', skipToContent: 'Zum Inhalt springen', languageSelect: 'Sprache auswählen', poweredBy: 'Bereitgestellt von' },
    tabs: { navLabel: 'Hauptnavigation' },
    history: { title: 'Letzte Ergebnisse', noMatchesActive: 'Keine abgeschlossenen Spiele des aktiven Turniers' },
    tournamentCard: { backToList: 'Zurück zu den Turnieren' },
    playerSection: { genderFilter: 'Geschlechtsfilter' },
    playerProfile: { ageLabel: '{years} Jahre', noMatches: 'Keine Spiele', notFound: 'Spieler nicht gefunden' },
    liveSub: { navLabel: 'Live-Bereiche', scores: 'Live-Spiele', schedule: 'Turnierplan', history: 'Ergebnisse' },
    schedule: { title: 'Turnierplan', emptyTitle: 'Der Turnierplan ist noch nicht veröffentlicht', emptyText: 'Das Turnierbüro ergänzt ungefähre Zeiten und Plätze.', loading: 'Turnierplan wird geladen...', refresh: 'Aktualisieren', time: 'Uhrzeit', court: 'Platz', category: 'Kategorie', phase: 'Phase', match: 'Spiel', status: 'Status', notes: 'Hinweise', searchLabel: 'Nach Nachnamen suchen', searchPlaceholder: 'Nachnamen suchen...', sortLabel: 'Sortierung', sortCourt: 'Nach Platz', sortCategory: 'Nach Kategorie', tabsLabelCourt: 'Platz auswählen', tabsLabelCategory: 'Kategorie auswählen', noResultsTitle: 'Keine passenden Spiele', noResultsText: 'Ändere den Suchbegriff oder die Sortierung.', timeTbd: 'Uhrzeit wird bestätigt', courtTbd: 'Platz wird bestätigt', categoryTbd: 'Kategorie wird bestätigt', statusDraft: 'Entwurf', statusPlanned: 'Geplant', statusInProgress: 'Läuft', statusCompleted: 'Beendet', updated: 'Turnierplan aktualisiert' },
    bracket: { categoryTabsLabel: 'Turnierkategorien', podiumLabel: 'Podium', groupTableLabel: 'Tabelle der Gruppe {group}', treeLabel: 'Turnierbaum {category}', placeMatch: 'Spiel um Platz {number}' },
    tournamentHistory: { navLabel: 'Turnierbereiche', matchHistory: 'Ergebnisse', schedule: 'Turnierplan' },
    accessibility: { scoreJoiner: 'zu', winner: 'Sieger', result: 'Spielstand', court: 'Platz', phase: 'Phase', duration: 'Dauer', unknownPlayer: 'Spieler steht noch nicht fest', unknownCourt: 'Platz steht noch nicht fest', scorePending: 'Ergebnis ist noch nicht verfügbar', stageMatch: '{phase}, Spiel {number}', groupMatch: '{group}, Spiel {number}', tournamentQuickInfoLabel: 'Turnierinfo' },
  },
  en: {
    ui: { appName: 'Tennis Scores', pageDescription: 'Live tennis scores, brackets, tournament schedule and match history.', skipToContent: 'Skip to main content', languageSelect: 'Select language', poweredBy: 'Powered by' },
    tabs: { navLabel: 'Main navigation' },
    history: { title: 'Latest results', noMatchesActive: 'No finished matches for the active tournament' },
    tournamentCard: { backToList: 'Back to tournaments' },
    playerSection: { genderFilter: 'Gender filter' },
    playerProfile: { ageLabel: '{years} years', noMatches: 'No matches', notFound: 'Player not found' },
    liveSub: { navLabel: 'Live sections', scores: 'Live matches', schedule: 'Tournament schedule', history: 'Results' },
    schedule: { title: 'Tournament schedule', updated: 'Tournament schedule updated' },
    bracket: { categoryTabsLabel: 'Tournament categories', podiumLabel: 'Podium', groupTableLabel: 'Standings for group {group}', treeLabel: 'Bracket {category}', placeMatch: 'Match for place {number}' },
    tournamentHistory: { navLabel: 'Tournament sections', matchHistory: 'Results', schedule: 'Tournament schedule' },
    accessibility: { scoreJoiner: 'to', winner: 'Winner', result: 'Match score', court: 'Court', phase: 'Stage', duration: 'Duration', unknownPlayer: 'player to be confirmed', unknownCourt: 'court to be confirmed', scorePending: 'score is not available yet', stageMatch: '{phase}, match {number}', groupMatch: '{group}, match {number}', tournamentQuickInfoLabel: 'Tournament announcement' },
  },
  it: {
    ui: { appName: 'Risultati tennis', pageDescription: 'Risultati tennis in diretta, tabelloni, programma del torneo e storico partite.', skipToContent: 'Vai al contenuto principale', languageSelect: 'Seleziona lingua', poweredBy: 'Offerto da' },
    tabs: { navLabel: 'Navigazione principale' },
    history: { title: 'Ultimi risultati', noMatchesActive: 'Nessuna partita conclusa del torneo attivo' },
    tournamentCard: { backToList: 'Torna ai tornei' },
    playerSection: { genderFilter: 'Filtro genere' },
    playerProfile: { ageLabel: '{years} anni', noMatches: 'Nessuna partita', notFound: 'Giocatore non trovato' },
    liveSub: { navLabel: 'Sezioni live', scores: 'Partite live', schedule: 'Programma del torneo', history: 'Risultati' },
    schedule: { title: 'Programma del torneo', emptyTitle: 'Il programma del torneo non è ancora pubblicato', emptyText: 'L\'ufficio del torneo aggiungerà orari e campi indicativi.', loading: 'Caricamento del programma del torneo...', refresh: 'Aggiorna', time: 'Ora', court: 'Campo', category: 'Categoria', phase: 'Fase', match: 'Partita', status: 'Stato', notes: 'Note', searchLabel: 'Cerca per cognome', searchPlaceholder: 'Cerca cognome...', sortLabel: 'Ordinamento', sortCourt: 'Per campo', sortCategory: 'Per categoria', tabsLabelCourt: 'Scegli campo', tabsLabelCategory: 'Scegli categoria', noResultsTitle: 'Nessuna partita corrispondente', noResultsText: 'Modifica la ricerca o cambia ordinamento.', timeTbd: 'orario da confermare', courtTbd: 'campo da confermare', categoryTbd: 'categoria da confermare', statusDraft: 'Bozza', statusPlanned: 'Programmato', statusInProgress: 'In corso', statusCompleted: 'Concluso', updated: 'Programma del torneo aggiornato' },
    bracket: { categoryTabsLabel: 'Categorie del torneo', podiumLabel: 'Podio', groupTableLabel: 'Classifica del girone {group}', treeLabel: 'Tabellone {category}', placeMatch: 'Partita per il {number}° posto' },
    tournamentHistory: { navLabel: 'Sezioni del torneo', matchHistory: 'Risultati', schedule: 'Programma del torneo' },
    accessibility: { scoreJoiner: 'a', winner: 'Vincitore', result: 'Punteggio del match', court: 'Campo', phase: 'Fase', duration: 'Durata', unknownPlayer: 'giocatore da definire', unknownCourt: 'campo da definire', scorePending: 'risultato non ancora disponibile', stageMatch: '{phase}, partita {number}', groupMatch: '{group}, partita {number}', tournamentQuickInfoLabel: 'Annuncio del torneo' },
  },
  es: {
    ui: { appName: 'Resultados de tenis', pageDescription: 'Resultados de tenis en vivo, cuadros, calendario del torneo e historial de partidos.', skipToContent: 'Saltar al contenido principal', languageSelect: 'Seleccionar idioma', poweredBy: 'Desarrollado por' },
    tabs: { navLabel: 'Navegación principal' },
    history: { title: 'Últimos resultados', noMatchesActive: 'No hay partidos finalizados del torneo activo' },
    tournamentCard: { backToList: 'Volver a los torneos' },
    playerSection: { genderFilter: 'Filtro de género' },
    playerProfile: { ageLabel: '{years} años', noMatches: 'Sin partidos', notFound: 'Jugador no encontrado' },
    liveSub: { navLabel: 'Secciones en vivo', scores: 'Partidos en vivo', schedule: 'Calendario del torneo', history: 'Resultados' },
    schedule: { title: 'Calendario del torneo', emptyTitle: 'El calendario del torneo aún no está publicado', emptyText: 'La oficina del torneo añadirá horarios y canchas orientativos.', loading: 'Cargando calendario del torneo...', refresh: 'Actualizar', time: 'Hora', court: 'Cancha', category: 'Categoría', phase: 'Fase', match: 'Partido', status: 'Estado', notes: 'Notas', searchLabel: 'Buscar por apellido', searchPlaceholder: 'Buscar apellido...', sortLabel: 'Ordenación', sortCourt: 'Por cancha', sortCategory: 'Por categoría', tabsLabelCourt: 'Elegir cancha', tabsLabelCategory: 'Elegir categoría', noResultsTitle: 'No hay partidos coincidentes', noResultsText: 'Cambia la búsqueda o el modo de ordenación.', timeTbd: 'hora por confirmar', courtTbd: 'cancha por confirmar', categoryTbd: 'categoría por confirmar', statusDraft: 'Borrador', statusPlanned: 'Planificado', statusInProgress: 'En curso', statusCompleted: 'Finalizado', updated: 'Calendario del torneo actualizado' },
    bracket: { categoryTabsLabel: 'Categorías del torneo', podiumLabel: 'Podio', groupTableLabel: 'Tabla del grupo {group}', treeLabel: 'Cuadro {category}', placeMatch: 'Partido por el {number}.º puesto' },
    tournamentHistory: { navLabel: 'Secciones del torneo', matchHistory: 'Resultados', schedule: 'Calendario del torneo' },
    accessibility: { scoreJoiner: 'a', winner: 'Ganador', result: 'Marcador del partido', court: 'Cancha', phase: 'Fase', duration: 'Duración', unknownPlayer: 'jugador por confirmar', unknownCourt: 'cancha por confirmar', scorePending: 'el resultado aún no está disponible', stageMatch: '{phase}, partido {number}', groupMatch: '{group}, partido {number}', tournamentQuickInfoLabel: 'Anuncio del torneo' },
  },
  fr: {
    ui: { appName: 'Résultats tennis', pageDescription: 'Résultats tennis en direct, tableaux, programme du tournoi et historique des matchs.', skipToContent: 'Aller au contenu principal', languageSelect: 'Choisir la langue', poweredBy: 'Propulsé par' },
    tabs: { navLabel: 'Navigation principale' },
    history: { title: 'Derniers résultats', noMatchesActive: 'Aucun match terminé pour le tournoi actif' },
    tournamentCard: { backToList: 'Retour aux tournois' },
    playerSection: { genderFilter: 'Filtre par genre' },
    playerProfile: { ageLabel: '{years} ans', noMatches: 'Aucun match', notFound: 'Joueur introuvable' },
    liveSub: { navLabel: 'Sections en direct', scores: 'Matchs en direct', schedule: 'Programme du tournoi', history: 'Résultats' },
    schedule: { title: 'Programme du tournoi', emptyTitle: 'Le programme du tournoi n\'est pas encore publié', emptyText: 'Le bureau du tournoi ajoutera les horaires et courts indicatifs.', loading: 'Chargement du programme du tournoi...', refresh: 'Actualiser', time: 'Heure', court: 'Court', category: 'Catégorie', phase: 'Phase', match: 'Match', status: 'Statut', notes: 'Notes', searchLabel: 'Rechercher par nom', searchPlaceholder: 'Rechercher un nom...', sortLabel: 'Tri', sortCourt: 'Par court', sortCategory: 'Par catégorie', tabsLabelCourt: 'Choisir un court', tabsLabelCategory: 'Choisir une catégorie', noResultsTitle: 'Aucun match correspondant', noResultsText: 'Modifiez la recherche ou le mode de tri.', timeTbd: 'heure à confirmer', courtTbd: 'court à confirmer', categoryTbd: 'catégorie à confirmer', statusDraft: 'Brouillon', statusPlanned: 'Planifié', statusInProgress: 'En cours', statusCompleted: 'Terminé', updated: 'Programme du tournoi mis à jour' },
    bracket: { categoryTabsLabel: 'Catégories du tournoi', podiumLabel: 'Podium', groupTableLabel: 'Classement du groupe {group}', treeLabel: 'Tableau {category}', placeMatch: 'Match pour la {number}e place' },
    tournamentHistory: { navLabel: 'Sections du tournoi', matchHistory: 'Résultats', schedule: 'Programme du tournoi' },
    accessibility: { scoreJoiner: 'à', winner: 'Vainqueur', result: 'Score du match', court: 'Court', phase: 'Phase', duration: 'Durée', unknownPlayer: 'joueur à confirmer', unknownCourt: 'court à confirmer', scorePending: 'le score n’est pas encore disponible', stageMatch: '{phase}, match {number}', groupMatch: '{group}, match {number}', tournamentQuickInfoLabel: 'Annonce du tournoi' },
  },
};
