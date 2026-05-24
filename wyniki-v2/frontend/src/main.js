import Alpine from 'alpinejs';
import './main.css';

function codeToFlag(code) {
  if (!code || code.length < 2) return '';
  return 'https://flagcdn.com/w40/' + code.toLowerCase().slice(0, 2) + '.png';
}

/* ============================================================
   TRANSLATIONS (ported from v1 translations.js)
   ============================================================ */
const TRANSLATIONS = {
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
    history: { title: 'Historia meczów', court: 'Kort', vs: 'vs', score: 'wynik', time: 'czas', category: 'Kategoria', phaseGroup: 'Grupowa', phaseKnockout: 'Pucharowa', catWomen: 'Kobiety', catMen: 'Mężczyźni' },
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
      noMatches: 'Brak meczów w tym turnieju'
    }
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
    history: { title: 'Match-Historie', court: 'Platz', vs: 'gegen', score: 'Ergebnis', time: 'Zeit', category: 'Kategorie', phaseGroup: 'Gruppenphase', phaseKnockout: 'K.O.-Phase', catWomen: 'Frauen', catMen: 'Männer' },
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
      bracket: 'Turnierplan',
      noMatches: 'Keine Spiele in diesem Turnier'
    }
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
    history: { title: 'Match history', court: 'Court', vs: 'vs', score: 'score', time: 'time', category: 'Category', phaseGroup: 'Group stage', phaseKnockout: 'Knockout', catWomen: 'Women', catMen: 'Men' },
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
      noMatches: 'No matches in this tournament'
    }
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
    history: { title: 'Storico incontri', court: 'Campo', vs: 'contro', score: 'risultato', time: 'tempo', category: 'Categoria', phaseGroup: 'Fase a gironi', phaseKnockout: 'Eliminazione', catWomen: 'Donne', catMen: 'Uomini' },
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
      noMatches: 'Nessuna partita in questo torneo'
    }
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
    history: { title: 'Historial de partidos', court: 'Cancha', vs: 'contra', score: 'resultado', time: 'tiempo', category: 'Categoría', phaseGroup: 'Fase de grupos', phaseKnockout: 'Eliminatoria', catWomen: 'Mujeres', catMen: 'Hombres' },
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
      noMatches: 'No hay partidos en este torneo'
    }
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
    history: { title: 'Historique des matchs', court: 'Court', vs: 'contre', score: 'score', time: 'temps', category: 'Catégorie', phaseGroup: 'Phase de groupes', phaseKnockout: 'Phase éliminatoire', catWomen: 'Femmes', catMen: 'Hommes' },
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
      noMatches: 'Aucun match dans ce tournoi'
    }
  }
};

function getTranslation(lang) {
  return TRANSLATIONS[lang] || TRANSLATIONS.pl;
}

function fmt(str, values = {}) {
  return str.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

/* ============================================================
   SCORE ANIMATION HELPERS (ported from v1)
   ============================================================ */
function flash(el) {
  if (!el) return;
  el.classList.add('changed');
  setTimeout(() => el.classList.remove('changed'), 1200);
}

function animatePointsChange(cell, prevText, nextText) {
  try {
    const old = String(prevText ?? '');
    const neu = String(nextText ?? '');
    const max = Math.max(old.length, neu.length);
    const container = document.createElement('span');
    container.className = 'digits';
    for (let i = 0; i < max; i++) {
      const digit = document.createElement('span');
      digit.className = 'digit';
      const spanOld = document.createElement('span');
      spanOld.className = 'd-old';
      spanOld.textContent = old[i] ?? '';
      const spanNew = document.createElement('span');
      spanNew.className = 'd-new';
      spanNew.textContent = neu[i] ?? '';
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

/* ============================================================
   TIEBREAK DETECTION
   ============================================================ */
function computeTieVisibility(tieState) {
  if (!tieState || typeof tieState !== 'object') return false;
  const rawA = parseInt(tieState.A ?? tieState.a ?? 0, 10);
  const rawB = parseInt(tieState.B ?? tieState.b ?? 0, 10);
  return (isNaN(rawA) ? 0 : rawA) !== 0 || (isNaN(rawB) ? 0 : rawB) !== 0;
}

/* ============================================================
   ALPINE.JS APP
   ============================================================ */
window.Alpine = Alpine;

Alpine.data('tennisApp', () => ({
  courts: {},
  publicCourtIds: {},
  prevCourts: {},
  loading: true,
  error: null,
  lastUpdate: null,
  lang: 'pl',
  darkMode: false,
  history: [],
  tournamentName: null,
  expandedMatchStats: {},  // match_id -> stats data (for Details button)
  activeTab: 'live',
  bracketData: null,
  bracketLoading: false,
  bracketNameMap: {},  // surname -> full_name lookup
  bracketCategory: null, // active bracket category tab
  scheduleData: null,
  scheduleLoading: false,
  scheduleAnnouncement: '',
  scheduleSearch: '',
  scheduleSortMode: 'court',
  scheduleSelectedGroups: {},

  // Tournament history state
  tournaments: [],
  selectedTournamentId: '',
  tournamentHistory: [],
  tournamentBracket: null,
  tournamentSchedule: null,
  tournamentBracketCategory: null,
  privateTournamentAccessKey: '',
  simulationStage: '',
  historySubTab: 'bracket',

  // Live sub-tab state
  liveSubTab: 'scores',

  // Players tab state
  allPlayers: [],
  filteredPlayers: [],
  playerSearch: '',
  playerGender: '',
  playerCountry: '',
  playerCategory: '',
  playersLoading: false,
  selectedPlayerId: null,
  playerProfile: null,
  playerProfileLoading: false,
  profileExpandedTournaments: {},
  _navigating: false,
  _profileIsGlobal: false,
  _playerProfileRequestId: 0,

  /* --- Sorted history (newest first) --- */
  sortedHistory() {
    return [...this.history].sort((a, b) => {
      const ta = a.ended_ts || a.timestamp || '';
      const tb = b.ended_ts || b.timestamp || '';
      return tb.localeCompare(ta);
    });
  },

  /* --- Sorted tournament history (newest first) --- */
  sortedTournamentHistory() {
    return [...this.tournamentHistory].sort((a, b) => {
      const ta = a.ended_ts || a.timestamp || '';
      const tb = b.ended_ts || b.timestamp || '';
      return tb.localeCompare(ta);
    });
  },

  init() {
    // Restore language from URL param or localStorage
    const urlParams = new URLSearchParams(location.search);
    const urlLang = urlParams.get('lang');
    const urlTournamentId = urlParams.get('tournament_id') || urlParams.get('tid');
    this.privateTournamentAccessKey = urlParams.get('access_key') || urlParams.get('key') || '';
    this.simulationStage = urlParams.get('etap') || urlParams.get('stage') || '';
    if (urlLang && TRANSLATIONS[urlLang]) {
      this.lang = urlLang;
    } else {
      const savedLang = localStorage.getItem('lang');
      if (savedLang && TRANSLATIONS[savedLang]) this.lang = savedLang;
    }
    this.onLangChange();
    // Restore dark mode preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.darkMode = true;
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    this._applyHash();
    if (urlTournamentId && !location.hash) {
      this.activeTab = 'tournaments';
      this.selectedTournamentId = String(urlTournamentId);
      this.selectedPlayerId = null;
      this.historySubTab = 'bracket';
      this.onTournamentSelected();
      this._updateHash(true);
    }
    window.addEventListener('hashchange', () => this._applyHash());
    window.addEventListener('popstate', () => this._applyHash());
    this.connectSSE();
    this.fetchInitialData();
    this.fetchHistory();
    this.fetchTournaments();
    this.fetchAllPlayers();
  },

  /* --- Hash routing --- */
  _applyHash() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!hash) {
      this.activeTab = 'live';
      this.liveSubTab = 'scores';
      this.selectedTournamentId = '';
      this.selectedPlayerId = null;
      this._profileIsGlobal = false;
      this.playerProfile = null;
      return;
    }
    this._navigating = true;
    const parts = hash.split('/');
    const tab = parts[0];
    if (tab === 'bracket' || tab === 'drabinka') {
      this.activeTab = 'live';
      this.liveSubTab = 'bracket';
      this.selectedPlayerId = null;
      this.selectedTournamentId = '';
      this.fetchBracket();
      if (parts[1]) this._pendingCategory = parts.slice(1).join('/');
    } else if (tab === 'tournaments' || tab === 'history' || tab === 'historia') {
      this.activeTab = 'tournaments';
      this.selectedPlayerId = null;
      if (parts[1]) {
        // #tournaments/3/bracket or #tournaments/3/matches
        this.selectedTournamentId = parts[1];
        if (parts[2] === 'matches') this.historySubTab = 'matches';
        else if (parts[2] === 'schedule') this.historySubTab = 'schedule';
        else this.historySubTab = 'bracket';
        this.onTournamentSelected();
      } else {
        this.selectedTournamentId = '';
      }
    } else if (tab === 'players' || tab === 'zawodnicy') {
      this.activeTab = 'players';
      this.selectedTournamentId = '';
      if (parts[1]) {
        let mode = 'auto';
        let idPart = parts[1];
        if (parts[1] === 'global' || parts[1] === 'local') {
          mode = parts[1];
          idPart = parts[2];
        }
        const pid = parseInt(idPart, 10);
        if (Number.isFinite(pid)) {
          this.selectedPlayerId = pid;
          this._profileIsGlobal = mode === 'global';
          this.playerProfile = null;
          this.profileExpandedTournaments = {};
          this.fetchPlayerProfile(pid, mode);
        } else {
          this.selectedPlayerId = null;
          this._profileIsGlobal = false;
          this.playerProfile = null;
        }
      } else {
        this.selectedPlayerId = null;
        this._profileIsGlobal = false;
        this.playerProfile = null;
      }
    } else if (tab === 'live') {
      this.activeTab = 'live';
      this.selectedPlayerId = null;
      this.selectedTournamentId = '';
      if (parts[1]) this.liveSubTab = parts[1];
      else this.liveSubTab = 'scores';
      if (this.liveSubTab === 'schedule' && !this.scheduleData) this.fetchSchedule();
    }
    this._navigating = false;
  },
  _updateHash(replace = false) {
    if (this._navigating) return;
    let hash = this.activeTab;
    if (this.activeTab === 'live' && this.liveSubTab !== 'scores') {
      hash = 'live/' + this.liveSubTab;
    } else if (this.activeTab === 'tournaments' && this.selectedTournamentId) {
      hash = 'tournaments/' + this.selectedTournamentId + '/' + this.historySubTab;
    } else if (this.activeTab === 'players' && this.selectedPlayerId) {
      const mode = this._profileIsGlobal ? 'global/' : 'local/';
      hash = 'players/' + mode + this.selectedPlayerId;
    }
    const encoded = '#' + encodeURIComponent(hash);
    if (location.hash !== encoded) {
      if (replace) {
        history.replaceState(null, '', encoded);
      } else {
        history.pushState(null, '', encoded);
      }
    }
  },

  /* --- Flag helper --- */
  codeToFlag(code) { return codeToFlag(code); },

  /* --- Translation helpers --- */
  tr() { return getTranslation(this.lang); },
  acc() { return this.tr().accessibility || {}; },

  t(key, values = {}) {
    const tr = this.tr();
    const val = key.split('.').reduce((o, k) => o?.[k], tr);
    if (typeof val === 'string') return fmt(val, values);
    // Fallback for special keys
    if (key === 'setLabel') return fmt(this.acc().set || 'Set {number}', values);
    if (key === 'courtLabel') return fmt(tr.courtLabel || 'Kort {court}', values);
    if (key === 'navLabel') return tr.navLabel || 'Nawigacja';
    return '';
  },

  onLangChange() {
    document.documentElement.lang = this.tr().htmlLang || this.lang;
    document.title = this.tr().pageTitle || 'Wyniki tenisowe – na żywo';
    localStorage.setItem('lang', this.lang);
    // Update ?lang= URL parameter
    const url = new URL(location.href);
    url.searchParams.set('lang', this.lang);
    history.replaceState(null, '', url.toString());
  },

  /* --- Dark mode --- */
  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    const theme = this.darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  },

  /* --- Data fetching --- */
  async fetchInitialData() {
    try {
      const response = await fetch('/api/snapshot');
      if (!response.ok) throw new Error('Failed to fetch courts');
      const data = await response.json();
      const courts = data.courts || {};
      this.courts = courts;
      this.publicCourtIds = Object.keys(courts).reduce((acc, courtId) => {
        acc[String(courtId)] = true;
        return acc;
      }, {});
      this.tournamentName = data.tournament_name || null;
      this.loading = false;
      this.lastUpdate = new Date();
    } catch (err) {
      this.error = err.message;
      this.loading = false;
    }
  },

  async fetchHistory() {
    try {
      const response = await fetch('/api/history');
      if (!response.ok) return;
      const data = await response.json();
      this.history = Array.isArray(data) ? data : [];
      // Build surname -> full_name lookup from history data
      for (const m of this.history) {
        if (m.player_a && m.player_a.includes(' ')) {
          const parts = m.player_a.trim().split(/\s+/);
          const surname = parts[parts.length - 1];
          this.bracketNameMap[surname] = m.player_a;
        }
        if (m.player_b && m.player_b.includes(' ')) {
          const parts = m.player_b.trim().split(/\s+/);
          const surname = parts[parts.length - 1];
          this.bracketNameMap[surname] = m.player_b;
        }
      }
    } catch { /* ignore */ }
  },

  /* --- Tournament history methods --- */
  async fetchTournaments() {
    try {
      const response = await fetch('/api/tournament/list');
      if (!response.ok) return;
      const data = await response.json();
      this.tournaments = Array.isArray(data) ? data : [];
    } catch { /* ignore */ }
  },

  openTournament(tid) {
    this.selectedTournamentId = String(tid);
    this.historySubTab = 'bracket';
    this.onTournamentSelected();
    this._updateHash();
  },

  selectedTournamentName() {
    const t = this.tournaments.find(t => String(t.id) === this.selectedTournamentId);
    return t ? t.name : (this.tournamentBracket?.tournament?.name || '');
  },

  closeTournamentDetail() {
    this.selectedTournamentId = '';
    history.back();
  },

  async onTournamentSelected() {
    const tid = this.selectedTournamentId;
    if (!tid) {
      this.tournamentHistory = [];
      this.tournamentBracket = null;
      this.tournamentSchedule = null;
      return;
    }
    await Promise.all([
      this.fetchTournamentHistory(tid),
      this.fetchTournamentBracket(tid),
      this.fetchTournamentSchedule(tid)
    ]);
  },

  async fetchTournamentHistory(tid) {
    try {
      const response = await fetch(`/api/tournament/${encodeURIComponent(tid)}/history${this._tournamentAccessQuery()}`);
      if (!response.ok) { this.tournamentHistory = []; return; }
      const data = await response.json();
      this.tournamentHistory = Array.isArray(data) ? data : [];
    } catch { this.tournamentHistory = []; }
  },

  async fetchTournamentBracket(tid) {
    try {
      const response = await fetch(this.withNoCacheQuery(
        `/api/tournament/${encodeURIComponent(tid)}/bracket`,
        this._tournamentAccessQuery()
      ), { cache: 'no-store' });
      if (!response.ok) { this.tournamentBracket = null; return; }
      this.tournamentBracket = await response.json();
      this._buildBracketNameMap(this.tournamentBracket);
      const cats = this.tournamentBracketCategories();
      if (cats.length > 0) {
        if (!cats.find(c => c.name === this.tournamentBracketCategory)) {
          this.tournamentBracketCategory = cats[0].name;
        }
      }
    } catch { this.tournamentBracket = null; }
  },

  async fetchTournamentSchedule(tid) {
    try {
      const response = await fetch(`/api/tournament/${encodeURIComponent(tid)}/schedule${this._tournamentAccessQuery()}`);
      if (!response.ok) { this.tournamentSchedule = null; return; }
      this.tournamentSchedule = await response.json();
    } catch { this.tournamentSchedule = null; }
  },

  _tournamentAccessQuery() {
    const params = new URLSearchParams();
    if (this.privateTournamentAccessKey) params.set('access_key', this.privateTournamentAccessKey);
    if (this.simulationStage) params.set('etap', this.simulationStage);
    const query = params.toString();
    return query ? `?${query}` : '';
  },

  withNoCacheQuery(path, existingQuery = '') {
    const params = new URLSearchParams(String(existingQuery || '').replace(/^\?/, ''));
    params.set('_', Date.now().toString());
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  },

  /* --- Pad sets to 3 columns for consistent table alignment --- */
  padSets(sets) {
    const arr = sets || [];
    const padded = arr.map(s => ({ ...s, played: true }));
    while (padded.length < 3) padded.push({ g1: 0, g2: 0, tb: null, stb: false, played: false });
    return padded;
  },

  tableLegendItems() {
    const b = this.tr().bracket || {};
    return [
      { term: b.wins || 'W', description: b.legendWins || 'wygrane mecze' },
      { term: b.losses || 'L', description: b.legendLosses || 'przegrane mecze' },
      { term: b.setsHeader || 'Sety', description: b.legendSets || 'sety wygrane do przegranych' },
      { term: b.gamesHeader || 'Gemy', description: b.legendGames || 'gemy wygrane do przegranych' },
    ];
  },

  groupStandingsRows(group, siblingGroups = []) {
    const rows = Array.isArray(group?.standings) ? [...group.standings] : [];
    const maxRows = Math.max(0, ...siblingGroups.map((entry) => Array.isArray(entry?.standings) ? entry.standings.length : 0));
    while (rows.length < maxRows) rows.push({ _placeholder: true, _key: `placeholder-${group?.name || 'group'}-${rows.length}` });
    return rows;
  },

  knockoutPodiumEntries(knockout = []) {
    const entries = [];
    const finalPhase = knockout.find((entry) => this.isFinalPhase(entry.phase) && entry.slots?.[0]?.winner);
    const thirdPlacePhase = knockout.find((entry) => this.knockoutPlaceNumber(entry.phase) === 3 && entry.slots?.[0]?.winner);
    const finalSlot = finalPhase?.slots?.[0];
    if (!finalSlot?.winner) return [];
    const secondPlace = this.knockoutSlotLoser(finalSlot);
    const thirdPlace = thirdPlacePhase?.slots?.[0]?.winner || '';
    if (!secondPlace || !thirdPlace) return [];
    entries.push({ medal: '🥇', cls: 'bt-podium-item--gold', player: finalSlot.winner, place: '1.' });
    entries.push({ medal: '🥈', cls: 'bt-podium-item--silver', player: secondPlace, place: '2.' });
    entries.push({ medal: '🥉', cls: 'bt-podium-item--bronze', player: thirdPlace, place: '3.' });
    return entries;
  },

  isFinalPhase(phase) {
    const text = String(phase || '');
    return text.includes('Finał') && !text.includes('Półfinał');
  },

  isSemifinalPhase(phase) {
    return String(phase || '').includes('Półfinał');
  },

  isPlacementPhase(phase) {
    return /o\s+\d+\.\s*miejsce/i.test(String(phase || ''));
  },

  knockoutPhaseClass(phase) {
    return {
      'bt-round--final': this.isFinalPhase(phase),
      'bt-round--semifinal': this.isSemifinalPhase(phase),
      'bt-round--placement': this.isPlacementPhase(phase),
    };
  },

  knockoutPlaceNumber(phase) {
    const match = String(phase || '').match(/o\s+(\d+)\.\s*miejsce/i);
    return match ? Number(match[1]) : null;
  },

  knockoutSlotLoser(slot) {
    if (!slot || !slot.winner) return '';
    if (slot.winner === slot.player1) return slot.player2 || '';
    if (slot.winner === slot.player2) return slot.player1 || '';
    return '';
  },

  formatKnockoutScore(slot) {
    const sets = slot?.sets || [];
    if (!sets.length) return 'wynik jeszcze nieustalony';
    return sets.map((set, index) => {
      const first = set.g1 ?? 0;
      const second = set.g2 ?? 0;
      if (set.stb) return `super tie-break ${first} do ${second}`;
      const tieBreak = set.tb !== null && set.tb !== undefined ? `, tie-break ${set.tb}` : '';
      return `set ${index + 1}: ${first} do ${second}${tieBreak}`;
    }).join('; ');
  },

  knockoutMatchAria(slot, phase, index = 0) {
    const p1 = this.resolveBracketName(slot?.player1) || 'zawodnik nieustalony';
    const p2 = this.resolveBracketName(slot?.player2) || 'zawodnik nieustalony';
    const phaseName = this.translateCategory(phase || 'Faza pucharowa');
    const score = this.formatKnockoutScore(slot);
    const winner = this.resolveBracketName(slot?.winner) || '';
    const loser = this.resolveBracketName(this.knockoutSlotLoser(slot)) || '';
    const parts = [`${phaseName}, mecz ${index + 1}: ${p1} kontra ${p2}. Wynik: ${score}.`];
    if (winner) parts.push(`Zwycięzca: ${winner}.`);
    if (this.isSemifinalPhase(phase)) {
      parts.push(`Zwycięzca półfinału przechodzi do finału${winner ? ': ' + winner : ''}.`);
      if (loser) parts.push(`Przegrany przechodzi do meczu o 3. miejsce: ${loser}.`);
    } else if (this.isFinalPhase(phase)) {
      if (winner) parts.push(`Pierwsze miejsce: ${winner}.`);
      if (loser) parts.push(`Drugie miejsce: ${loser}.`);
    } else {
      const place = this.knockoutPlaceNumber(phase);
      if (place && winner) parts.push(`${place}. miejsce: ${winner}.`);
    }
    return parts.join(' ');
  },

  async fetchBracket() {
    this.bracketLoading = true;
    try {
      const response = await fetch(this.withNoCacheQuery('/api/tournament/bracket'), { cache: 'no-store' });
      if (!response.ok) { this.bracketData = null; return; }
      this.bracketData = await response.json();
      // Build name map from bracket group matches (match names → surname lookup)
      this._buildBracketNameMap(this.bracketData);
      // Auto-select category from pending hash or first
      const cats = this.bracketCategories();
      if (this._pendingCategory && cats.find(c => c.name === this._pendingCategory)) {
        this.bracketCategory = this._pendingCategory;
        this._pendingCategory = null;
      } else if (cats.length > 0 && !cats.find(c => c.name === this.bracketCategory)) {
        this.bracketCategory = cats[0].name;
      }
    } catch { this.bracketData = null; }
    finally { this.bracketLoading = false; }
  },

  async fetchSchedule() {
    this.scheduleLoading = true;
    try {
      const response = await fetch('/api/tournament/schedule');
      if (!response.ok) { this.scheduleData = null; return; }
      this.scheduleData = await response.json();
      const matchCount = this.scheduleMatchCount(this.scheduleData);
      this.scheduleAnnouncement = `${this.scheduleText().updated}: ${matchCount}`;
    } catch {
      this.scheduleData = null;
    } finally {
      this.scheduleLoading = false;
    }
  },

  scheduleText() {
    const fallback = TRANSLATIONS.pl.schedule || {};
    return { ...fallback, ...(this.tr().schedule || {}) };
  },

  scheduleDays(data = this.scheduleData) {
    return Array.isArray(data?.days) ? data.days : [];
  },

  scheduleMatchCount(data = this.scheduleData) {
    return this.scheduleDays(data).reduce((total, day) => {
      const categories = Array.isArray(day?.categories) ? day.categories : [];
      return total + categories.reduce((sum, category) => sum + (Array.isArray(category?.matches) ? category.matches.length : 0), 0);
    }, 0);
  },

  scheduleVisibleDays(data = this.scheduleData) {
    return this.schedulePreparedDays(data);
  },

  schedulePreparedDays(data = this.scheduleData) {
    return this.scheduleDays(data)
      .map((day) => ({
        ...day,
        groups: this.scheduleGroups(day),
        bucket: this.scheduleDayBucket(day),
      }))
      .sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')))
      .filter((day) => day.groups.length > 0);
  },

  scheduleCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  scheduleDayBucket(day) {
    const date = String(day?.date || '');
    const today = this.scheduleCurrentDate();
    if (!date) return 'future';
    if (date === today) return 'today';
    return date < today ? 'past' : 'future';
  },

  schedulePrimaryDays(data = this.scheduleData) {
    const order = { today: 0, future: 1, past: 2 };
    return this.schedulePreparedDays(data)
      .filter((day) => day.bucket !== 'past')
      .sort((left, right) => {
        const bucketOrder = (order[left.bucket] ?? 9) - (order[right.bucket] ?? 9);
        if (bucketOrder !== 0) return bucketOrder;
        return String(left?.date || '').localeCompare(String(right?.date || ''));
      });
  },

  schedulePastDays(data = this.scheduleData) {
    return this.schedulePreparedDays(data)
      .filter((day) => day.bucket === 'past')
      .sort((left, right) => String(right?.date || '').localeCompare(String(left?.date || '')));
  },

  scheduleArchivedDaysLabel(count) {
    const custom = this.tr().schedule?.archivedDaysLabel;
    if (typeof custom === 'string' && custom.includes('{count}')) {
      return fmt(custom, { count });
    }
    if (typeof custom === 'string' && custom.trim()) {
      return `${custom} (${count})`;
    }
    if ((this.lang || 'pl') === 'pl') return `Zakończone dni (${count})`;
    return `Completed days (${count})`;
  },

  scheduleGroups(day) {
    const mode = this.scheduleSortMode === 'category' ? 'category' : 'court';
    const query = this.normalizeScheduleText(this.scheduleSearch);
    const groups = new Map();

    for (const match of this.scheduleFlattenDay(day)) {
      if (query && !this.scheduleMatchMatchesQuery(match, query)) continue;
      const meta = this.scheduleGroupMeta(match, mode);
      if (!groups.has(meta.key)) {
        groups.set(meta.key, {
          id: meta.key,
          title: meta.label,
          sortOrder: meta.sortOrder,
          matches: [],
        });
      }
      groups.get(meta.key).matches.push(match);
    }

    const result = Array.from(groups.values());
    for (const group of result) {
      group.matches.sort((left, right) => this.compareScheduleMatches(left, right));
    }

    result.sort((left, right) => {
      if (mode === 'court') {
        return (left.sortOrder - right.sortOrder)
          || left.title.localeCompare(right.title, this.lang || 'pl', { sensitivity: 'base' });
      }
      return left.title.localeCompare(right.title, this.lang || 'pl', { sensitivity: 'base' });
    });

    return result;
  },

  scheduleSelectionKey(day) {
    return `${day?.date || 'unknown'}::${this.scheduleSortMode === 'category' ? 'category' : 'court'}`;
  },

  scheduleActiveGroup(day) {
    const groups = Array.isArray(day?.groups) ? day.groups : [];
    if (!groups.length) return null;
    const key = this.scheduleSelectionKey(day);
    const selectedId = this.scheduleSelectedGroups[key];
    return groups.find((group) => group.id === selectedId) || groups[0];
  },

  scheduleActiveGroupId(day) {
    return this.scheduleActiveGroup(day)?.id || '';
  },

  selectScheduleGroup(day, groupId) {
    if (!day || !groupId) return;
    this.scheduleSelectedGroups = {
      ...this.scheduleSelectedGroups,
      [this.scheduleSelectionKey(day)]: groupId,
    };
  },

  scheduleTablistLabel() {
    return this.scheduleSortMode === 'category'
      ? this.scheduleText().tabsLabelCategory
      : this.scheduleText().tabsLabelCourt;
  },

  scheduleDomId(prefix, day, group) {
    const raw = `${prefix}-${day?.date || 'unknown'}-${group?.id || 'none'}`;
    return raw.replace(/[^a-zA-Z0-9_-]/g, '-');
  },

  focusScheduleGroupTab(day, group) {
    if (!day || !group) return;
    requestAnimationFrame(() => {
      document.getElementById(this.scheduleDomId('schedule-tab', day, group))?.focus();
    });
  },

  focusScheduleAdjacentGroup(day, currentGroupId, direction) {
    const groups = Array.isArray(day?.groups) ? day.groups : [];
    if (!groups.length) return;
    let index = groups.findIndex((group) => group.id === currentGroupId);
    if (index < 0) index = 0;
    const nextIndex = (index + direction + groups.length) % groups.length;
    const nextGroup = groups[nextIndex];
    this.selectScheduleGroup(day, nextGroup.id);
    this.focusScheduleGroupTab(day, nextGroup);
  },

  focusScheduleEdgeGroup(day, edge) {
    const groups = Array.isArray(day?.groups) ? day.groups : [];
    if (!groups.length) return;
    const target = edge === 'last' ? groups[groups.length - 1] : groups[0];
    this.selectScheduleGroup(day, target.id);
    this.focusScheduleGroupTab(day, target);
  },

  scheduleFlattenDay(day) {
    const matches = [];
    for (const category of Array.isArray(day?.categories) ? day.categories : []) {
      for (const match of Array.isArray(category?.matches) ? category.matches : []) {
        matches.push(match);
      }
    }
    return matches;
  },

  scheduleGroupMeta(match, mode) {
    if (mode === 'category') {
      const label = this.scheduleCategoryLabel(match);
      return {
        key: `category-${this.normalizeScheduleText(match?.category_name || label || 'other') || 'other'}`,
        label,
        sortOrder: 9999,
      };
    }

    const label = this.scheduleCourtTabLabel(match);
    const rawOrder = Number(match?.court_display_order);
    return {
      key: `court-${match?.court_id || this.normalizeScheduleText(label) || 'tbd'}`,
      label,
      sortOrder: Number.isFinite(rawOrder) ? rawOrder : 9999,
    };
  },

  scheduleCourtTabLabel(match) {
    const rawLabel = String(match?.court_label || match?.court_id || '').trim();
    if (!rawLabel) return this.scheduleText().courtTbd;

    const normalized = rawLabel
      .replace(/^(kort|court|platz|cancha|campo)\s*/i, '')
      .trim();

    if (!normalized) return this.scheduleCourtLabel(match);
    const pattern = this.tr().courtLabel || 'Kort {court}';
    return pattern.replace('{court}', normalized);
  },

  scheduleCategoryLabel(match) {
    return this.translateCategory(match?.category_name || '') || this.scheduleText().categoryTbd;
  },

  normalizeScheduleText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  },

  scheduleMatchMatchesQuery(match, query) {
    const player1 = match?.player1_name || '';
    const player2 = match?.player2_name || '';
    const haystack = [
      player1,
      player2,
      this.resolveBracketName(player1),
      this.resolveBracketName(player2),
      this.scheduleCourtLabel(match),
      this.scheduleCategoryLabel(match),
      match?.notes_public || '',
    ].join(' ');
    return this.normalizeScheduleText(haystack).includes(query);
  },

  compareScheduleMatches(left, right) {
    const timeLeft = left?.scheduled_time || '99:99';
    const timeRight = right?.scheduled_time || '99:99';
    if (timeLeft !== timeRight) return timeLeft.localeCompare(timeRight);

    const leftOrderRaw = Number(left?.court_display_order);
    const rightOrderRaw = Number(right?.court_display_order);
    const leftOrder = Number.isFinite(leftOrderRaw) ? leftOrderRaw : 9999;
    const rightOrder = Number.isFinite(rightOrderRaw) ? rightOrderRaw : 9999;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    const courtCompare = this.scheduleCourtLabel(left).localeCompare(this.scheduleCourtLabel(right), this.lang || 'pl', { sensitivity: 'base' });
    if (courtCompare !== 0) return courtCompare;

    const leftPlayers = `${left?.player1_name || ''} ${left?.player2_name || ''}`;
    const rightPlayers = `${right?.player1_name || ''} ${right?.player2_name || ''}`;
    return leftPlayers.localeCompare(rightPlayers, this.lang || 'pl', { sensitivity: 'base' });
  },

  formatScheduleDate(value) {
    if (!value) return '';
    const parsed = new Date(`${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(this.lang || 'pl', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(parsed);
  },

  formatScheduleTime(value) {
    return value || this.scheduleText().timeTbd;
  },

  scheduleCourtLabel(match) {
    return match?.court_label || match?.court_id || this.scheduleText().courtTbd;
  },

  scheduleStatusLabel(status) {
    const labels = this.scheduleText();
    const map = {
      draft: labels.statusDraft,
      planned: labels.statusPlanned,
      in_progress: labels.statusInProgress,
      completed: labels.statusCompleted,
    };
    return map[status] || status || labels.statusPlanned;
  },

  scheduleMatchAria(match) {
    const labels = this.scheduleText();
    return [
      `${labels.time}: ${this.formatScheduleTime(match?.scheduled_time)}`,
      `${labels.court}: ${this.scheduleCourtLabel(match)}`,
      `${labels.category}: ${this.scheduleCategoryLabel(match)}`,
      `${labels.phase}: ${this.translatePhase(match?.phase || '')}`,
      `${labels.match}: ${match?.player1_name || ''} ${this.acc().versus || 'kontra'} ${match?.player2_name || ''}`,
      `${labels.status}: ${this.scheduleStatusLabel(match?.status)}`,
      match?.notes_public ? `${labels.notes}: ${match.notes_public}` : '',
    ].filter(Boolean).join('. ');
  },

  switchToBracket(cat) {
    this.activeTab = 'live';
    this.liveSubTab = 'bracket';
    if (cat) this.bracketCategory = cat;
    this.fetchBracket();
    this._updateHash();
  },

  /* --- Players methods --- */
  async fetchAllPlayers() {
    this.playersLoading = true;
    try {
      const response = await fetch('/api/players/all');
      if (!response.ok) { this.allPlayers = []; this.filteredPlayers = []; return; }
      const data = await response.json();
      this.allPlayers = Array.isArray(data) ? data : [];
      // Build name map from all players (surname -> full name)
      for (const p of this.allPlayers) {
        const name = p.name || '';
        if (name.includes(' ')) {
          const parts = name.trim().split(/\s+/);
          const surname = parts[parts.length - 1];
          this.bracketNameMap[surname] = name;
        }
      }
      this.filterPlayers();
    } catch { this.allPlayers = []; this.filteredPlayers = []; }
    finally { this.playersLoading = false; }
  },

  filterPlayers() {
    let list = this.allPlayers;
    const q = (this.playerSearch || '').trim().toLowerCase();
    if (q) {
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.first_name || '').toLowerCase().includes(q) || (p.last_name || '').toLowerCase().includes(q));
    }
    if (this.playerGender === 'M') {
      list = list.filter(p => (p.gender || '').toUpperCase() === 'M');
    } else if (this.playerGender === 'F') {
      list = list.filter(p => (p.gender || '').toUpperCase() === 'F');
    }
    if (this.playerCountry) {
      list = list.filter(p => (p.country || '').toUpperCase() === this.playerCountry.toUpperCase());
    }
    if (this.playerCategory) {
      list = list.filter(p => p.category === this.playerCategory);
    }
    this.filteredPlayers = list;
  },

  playerCountryOptions() {
    const map = {};
    for (const p of this.allPlayers) {
      const c = (p.country || '').toUpperCase();
      if (c) map[c] = (map[c] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([code, count]) => ({ code, count }));
  },

  playerCategoryOptions() {
    const map = {};
    for (const p of this.allPlayers) {
      const c = p.category || '';
      if (c) map[c] = (map[c] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
  },

  /* --- Player Profile --- */
  openPlayerProfile(id, isGlobal = false) {
    this.selectedPlayerId = id;
    this._profileIsGlobal = isGlobal;
    this.playerProfile = null;
    this.profileExpandedTournaments = {};
    this.fetchPlayerProfile(id, isGlobal ? 'global' : 'local');
    this._updateHash();
  },

  closePlayerProfile() {
    this.selectedPlayerId = null;
    this._profileIsGlobal = false;
    this.playerProfile = null;
    this.profileExpandedTournaments = {};
    history.back();
  },

  async fetchPlayerProfile(id, mode = 'auto') {
    const requestId = ++this._playerProfileRequestId;
    this.playerProfileLoading = true;
    try {
      const requestedMode = mode === 'global' || mode === 'local' ? mode : 'auto';
      const localExists = this.allPlayers.some((player) => Number(player?.id) === Number(id));
      const globalExists = this.allPlayers.some((player) => Number(player?.global_player_id) === Number(id));
      const candidates = [];

      if (requestedMode === 'global') {
        candidates.push(true);
      } else if (requestedMode === 'local') {
        candidates.push(false);
      } else if (globalExists !== localExists) {
        candidates.push(globalExists, localExists);
      } else {
        candidates.push(true, false);
      }

      for (const isGlobal of candidates.filter((value, index, arr) => arr.indexOf(value) === index)) {
        try {
          const qs = isGlobal ? '?global=1' : '';
          const response = await fetch(`/api/players/${encodeURIComponent(id)}/profile${qs}`);
          if (!response.ok) continue;
          const data = await response.json();
          if (requestId !== this._playerProfileRequestId || this.selectedPlayerId !== id) return;
          this.playerProfile = data;
          this._profileIsGlobal = isGlobal;
          if (requestedMode === 'auto') this._updateHash(true);
          return;
        } catch {
          continue;
        }
      }

      if (requestId !== this._playerProfileRequestId || this.selectedPlayerId !== id) return;
      this.playerProfile = null;
      this._profileIsGlobal = false;
    } catch {
      if (requestId !== this._playerProfileRequestId || this.selectedPlayerId !== id) return;
      this.playerProfile = null;
      this._profileIsGlobal = false;
    } finally {
      if (requestId === this._playerProfileRequestId) this.playerProfileLoading = false;
    }
  },

  toggleProfileTournament(tid) {
    this.profileExpandedTournaments[tid] = !this.profileExpandedTournaments[tid];
  },

  profileMedalEmoji(medal) {
    if (medal === 'gold') return '🥇';
    if (medal === 'silver') return '🥈';
    if (medal === 'bronze') return '🥉';
    return '';
  },

  profileWinRate() {
    if (!this.playerProfile?.career) return '0%';
    const c = this.playerProfile.career;
    if (c.matches === 0) return '0%';
    return Math.round((c.wins / c.matches) * 100) + '%';
  },

  resolveBracketName(surname) {
    if (!surname) return '';
    return this.bracketNameMap[surname] || surname;
  },

  translatePhase(phase) {
    if (!phase) return '';
    const t = this.tr();
    const map = {
      'Grupowa': t.history?.phaseGroup || 'Group',
      'Pucharowa': t.history?.phaseKnockout || 'Knockout',
    };
    return map[phase] || phase;
  },

  translateCategory(name) {
    if (!name) return '';
    const t = this.tr();
    const women = t.history?.catWomen || 'Women';
    const men = t.history?.catMen || 'Men';
    const final_ = t.bracket?.finalLabel || 'Final';
    const forPlace = t.bracket?.forPlace || 'for';
    const place = t.playerProfile?.place || 'place';
    return name
      .replace(/Kobiety/g, women)
      .replace(/Mężczyźni/g, men)
      .replace(/Finał/g, final_)
      .replace(/o (\d+)\. miejsce/g, `${forPlace} $1. ${place}`);
  },

  parseBracketCategory(name) {
    const rawName = String(name || '').trim();
    const baseName = rawName.split(' — ')[0].trim();
    const divisionMatch = baseName.match(/^B\d+\+?/i);
    const division = divisionMatch ? divisionMatch[0].toUpperCase() : '';
    const normalized = baseName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    let gender = '';
    if (normalized.includes('kobiet')) gender = 'women';
    else if (normalized.includes('mezczyzn')) gender = 'men';
    return { rawName, baseName, division, gender };
  },

  bracketCategoryLabel(name) {
    const parsed = this.parseBracketCategory(name);
    if (!parsed.division || !parsed.gender) return this.translateCategory(name);
    const t = this.tr();
    const genderLabel = parsed.gender === 'women'
      ? (t.history?.catWomen || 'Women')
      : (t.history?.catMen || 'Men');
    return `${genderLabel} ${parsed.division}`;
  },

  compareBracketCategoryNames(leftName, rightName) {
    const left = this.parseBracketCategory(leftName);
    const right = this.parseBracketCategory(rightName);
    const leftNum = Number.parseInt(left.division.replace(/\D/g, ''), 10);
    const rightNum = Number.parseInt(right.division.replace(/\D/g, ''), 10);
    const safeLeftNum = Number.isFinite(leftNum) ? leftNum : Number.MAX_SAFE_INTEGER;
    const safeRightNum = Number.isFinite(rightNum) ? rightNum : Number.MAX_SAFE_INTEGER;
    if (safeLeftNum !== safeRightNum) return safeLeftNum - safeRightNum;

    const genderOrder = { women: 0, men: 1, '': 2 };
    const leftGender = genderOrder[left.gender] ?? 3;
    const rightGender = genderOrder[right.gender] ?? 3;
    if (leftGender !== rightGender) return leftGender - rightGender;

    return this.bracketCategoryLabel(leftName).localeCompare(
      this.bracketCategoryLabel(rightName),
      this.lang || 'pl',
      { sensitivity: 'base', numeric: true }
    );
  },

  _buildBracketNameMap(data) {
    if (!data) return;
    // From group matches: map player names to surnames for lookup
    for (const g of (data.groups || [])) {
      for (const m of (g.matches || [])) {
        for (const pName of [m.player_a, m.player_b]) {
          if (pName && pName.includes(' ')) {
            const parts = pName.trim().split(/\s+/);
            const surname = parts[parts.length - 1];
            this.bracketNameMap[surname] = pName;
          }
        }
      }
    }
    // From knockout slots
    if (data.knockout) {
      for (const slots of Object.values(data.knockout)) {
        for (const slot of (Array.isArray(slots) ? slots : [])) {
          for (const pName of [slot.player1, slot.player2, slot.winner]) {
            if (pName && pName.includes(' ')) {
              const parts = pName.trim().split(/\s+/);
              const surname = parts[parts.length - 1];
              this.bracketNameMap[surname] = pName;
            }
          }
        }
      }
    }
  },

  /* --- Bracket category helpers --- */
  bracketCategories() {
    if (!this.bracketData || !this.bracketData.groups) return [];
    const cats = new Map();
    for (const g of this.bracketData.groups) {
      // Extract category prefix: "B4M — A" → "B4M", "B1 Kobiety" → "B1 Kobiety"
      const sep = g.name.indexOf(' — ');
      const cat = sep > -1 ? g.name.substring(0, sep) : g.name;
      if (!cats.has(cat)) cats.set(cat, { name: cat, groups: [], knockout: [] });
      cats.get(cat).groups.push(g);
    }
    // Assign knockout slots to categories by phase prefix
    if (this.bracketData.knockout) {
      for (const [phase, slots] of Object.entries(this.bracketData.knockout)) {
        const sep = phase.indexOf(' — ');
        const prefix = sep > -1 ? phase.substring(0, sep) : phase.split(' ')[0];
        for (const [, cat] of cats) {
          if (cat.name === prefix || (sep === -1 && cat.name.startsWith(prefix))) {
            cat.knockout.push({ phase, slots });
            break;
          }
        }
      }
    }
    return [...cats.values()].sort((left, right) => this.compareBracketCategoryNames(left.name, right.name));
  },

  activeBracketCategory() {
    const cats = this.bracketCategories();
    if (cats.length === 0) return null;
    if (this.bracketCategory && cats.find(c => c.name === this.bracketCategory)) {
      return cats.find(c => c.name === this.bracketCategory);
    }
    this.bracketCategory = cats[0].name;
    return cats[0];
  },

  tournamentBracketCategories() {
    if (!this.tournamentBracket || !this.tournamentBracket.groups) return [];
    const cats = new Map();
    for (const g of this.tournamentBracket.groups) {
      const sep = g.name.indexOf(' — ');
      const cat = sep > -1 ? g.name.substring(0, sep) : g.name;
      if (!cats.has(cat)) cats.set(cat, { name: cat, groups: [], knockout: [] });
      cats.get(cat).groups.push(g);
    }
    if (this.tournamentBracket.knockout) {
      for (const [phase, slots] of Object.entries(this.tournamentBracket.knockout)) {
        const sep = phase.indexOf(' — ');
        const prefix = sep > -1 ? phase.substring(0, sep) : phase.split(' ')[0];
        for (const [, cat] of cats) {
          if (cat.name === prefix || (sep === -1 && cat.name.startsWith(prefix))) {
            cat.knockout.push({ phase, slots });
            break;
          }
        }
      }
    }
    return [...cats.values()].sort((left, right) => this.compareBracketCategoryNames(left.name, right.name));
  },

  activeTournamentBracketCategory() {
    const cats = this.tournamentBracketCategories();
    if (cats.length === 0) return null;
    if (this.tournamentBracketCategory && cats.find(c => c.name === this.tournamentBracketCategory)) {
      return cats.find(c => c.name === this.tournamentBracketCategory);
    }
    this.tournamentBracketCategory = cats[0].name;
    return cats[0];
  },

  connectSSE() {
    const eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('court_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        const courtId = String(data.court_id);
        if (!this.publicCourtIds[courtId]) return;
        const prev = this.courts[courtId];

        // Trigger DOM animations after Alpine renders
        this.$nextTick(() => {
          this.animateChanges(courtId, prev, data);
        });

        this.prevCourts[courtId] = prev ? { ...prev } : {};
        this.courts[courtId] = data;
        this.lastUpdate = new Date();
        // Refresh history when a match finishes
        if (prev?.match_status?.active && !data?.match_status?.active) {
          this.fetchHistory();
          if (this.liveSubTab === 'schedule') this.fetchSchedule();
        }
      } catch { /* ignore parse errors */ }
    });

    eventSource.onerror = () => {
      this.error = 'Połączenie przerwane';
      setTimeout(() => this.connectSSE(), 5000);
    };
  },

  /* --- DOM animations on score change --- */
  animateChanges(courtId, prev, next) {
    if (!prev) return;
    const sides = ['A', 'B'];

    // Points animation
    sides.forEach(side => {
      const prevPts = this.resolveDisplayPoints(prev, side);
      const nextPts = this.resolveDisplayPoints(next, side);
      if (prevPts !== nextPts) {
        const el = document.getElementById(`k${courtId}-pts-${side}`);
        if (el) {
          animatePointsChange(el, prevPts, nextPts);
          flash(el);
          if (nextPts === 'ADV' || nextPts === '40') {
            el.classList.add('flip-strong');
            setTimeout(() => el.classList.remove('flip-strong'), 450);
          }
        }
      }
    });

    // Set score animation
    for (let s = 1; s <= 3; s++) {
      sides.forEach(side => {
        const key = `set${s}`;
        const prevVal = prev[side]?.[key];
        const nextVal = next[side]?.[key];
        if (nextVal !== undefined && nextVal !== prevVal) {
          const el = document.getElementById(`k${courtId}-s${s}-${side}`);
          if (el) flash(el);
        }
      });
    }

    // Player name animation
    sides.forEach(side => {
      const prevName = prev[side]?.full_name || prev[side]?.surname;
      const nextName = next[side]?.full_name || next[side]?.surname;
      if (nextName && prevName !== nextName) {
        const el = document.getElementById(`k${courtId}-name-${side}`);
        if (el) flash(el);
      }
    });
  },

  resolveDisplayPoints(court, side) {
    if (!court) return '0';
    const tie = court.tie || {};
    const tieVisible = computeTieVisibility(tie);
    if (tieVisible) {
      const raw = tie[side] ?? tie[side.toLowerCase()];
      return raw !== undefined && raw !== null ? String(raw) : '0';
    }
    const pts = court[side]?.points;
    return pts !== undefined && pts !== null ? String(pts) : '0';
  },

  /* --- Court helpers --- */
  getCourtIds() {
    return Object.entries(this.courts)
      .sort(([, a], [, b]) => {
        const tournamentA = String(a?.tournament_name || '');
        const tournamentB = String(b?.tournament_name || '');
        if (tournamentA !== tournamentB) return tournamentA.localeCompare(tournamentB);
        const orderA = Number(a?.display_order || 0);
        const orderB = Number(b?.display_order || 0);
        if (orderA !== orderB) return orderA - orderB;
        return String(a?.court_name || '').localeCompare(String(b?.court_name || ''));
      })
      .map(([id]) => id);
  },

  getCourtDisplayLabel(courtId) {
    const court = this.courts[courtId] || {};
    const display = court.court_name || courtId;
    return this.t('courtLabel', { court: display });
  },

  hasActiveCourts() {
    return Object.values(this.courts).some(c => c.match_status?.active);
  },

  isMatchActive(courtId) {
    return this.courts[courtId]?.match_status?.active || false;
  },

  /* --- Player name with fallback --- */
  getPlayerName(courtId, side) {
    const player = this.courts[courtId]?.[side];
    if (player) {
      const full = player.full_name;
      if (full && String(full).trim()) return String(full).trim();
      const surname = player.surname;
      if (surname && surname !== '-') return surname;
    }
    const tr = this.tr();
    return side === 'A' ? tr.players.defaultA : tr.players.defaultB;
  },

  /* --- Heading aria for screen readers --- */
  getHeadingAria(courtId) {
    const court = this.courts[courtId] || {};
    const courtLabel = court.tournament_name
      ? `${court.tournament_name}: ${this.getCourtDisplayLabel(courtId)}`
      : this.getCourtDisplayLabel(courtId);
    const nameA = this.getPlayerName(courtId, 'A');
    const nameB = this.getPlayerName(courtId, 'B');
    const vs = this.acc().versus || 'kontra';
    const serve = this.courts[courtId]?.serve;
    const servingText = this.acc().serving || 'serwuje';
    const labelA = serve === 'A' ? `${nameA} (${servingText})` : nameA;
    const labelB = serve === 'B' ? `${nameB} (${servingText})` : nameB;
    return `${courtLabel}: ${labelA} ${vs} ${labelB}`;
  },

  /* --- Tiebreak detection --- */
  isTiebreak(courtId) {
    const tie = this.courts[courtId]?.tie;
    return computeTieVisibility(tie);
  },

  getRegularSetWins(courtId) {
    const court = this.courts[courtId];
    if (!court) return { A: 0, B: 0 };

    const wins = { A: 0, B: 0 };
    const detail = Array.isArray(court.sets_detail) ? court.sets_detail : [];

    if (detail.length) {
      for (const setInfo of detail) {
        if (setInfo?.stb) continue;
        const a = Number(setInfo?.p1 ?? 0);
        const b = Number(setInfo?.p2 ?? 0);
        if (a > b) wins.A += 1;
        else if (b > a) wins.B += 1;
      }
      return wins;
    }

    for (let setIdx = 1; setIdx <= 2; setIdx += 1) {
      const a = this.getStoredSetScore(court, 'A', setIdx);
      const b = this.getStoredSetScore(court, 'B', setIdx);
      if (a > b) wins.A += 1;
      else if (b > a) wins.B += 1;
    }
    return wins;
  },

  isDecidingSuperTiebreak(courtId) {
    const court = this.courts[courtId];
    if (!court) return false;
    const currentSet = parseInt(court.current_set) || 1;
    if (currentSet !== 3) return false;
    const wins = this.getRegularSetWins(courtId);
    return wins.A === 1 && wins.B === 1;
  },

  isSuperTiebreak(courtId) {
    const court = this.courts[courtId];
    if (!court) return false;
    return !!court.super_tiebreak_active
      || this.isDecidingSuperTiebreak(courtId)
      || (this.isTiebreak(courtId) && (court.current_set === 3 || court.current_set === '3'));
  },

  /* --- Points display --- */
  getDisplayPoints(courtId, side) {
    return this.resolveDisplayPoints(this.courts[courtId], side);
  },

  getPointsLabel(courtId) {
    const tr = this.tr();
    const cols = tr.table?.columns || {};
    if (this.isSuperTiebreak(courtId)) return cols.superTieBreak || 'Super TB';
    if (this.isTiebreak(courtId)) return cols.tieBreak || 'Tie Break';
    return cols.points || 'Punkty';
  },

  /* --- Set scores --- */
  getSetIndices(courtId) {
    const court = this.courts[courtId];
    if (!court) return [1, 2];
    const currentSet = parseInt(court.current_set) || 1;
    const detail = court.sets_detail || [];
    
    // Only count regular (non-STB) sets for columns
    const regularSets = detail.filter(s => !s.stb).length;
    const indices = [];
    for (let i = 1; i <= Math.max(regularSets, 2); i++) indices.push(i);
    
    // Show current set column if match is active and not in super tiebreak
    const isActive = court.match_status?.active;
    if (isActive && !this.isSuperTiebreak(courtId) && currentSet > indices.length) {
      while (indices.length < currentSet) indices.push(indices.length + 1);
    }
    
    // Fallback for courts without sets_detail
    if (!detail.length && !this.isSuperTiebreak(courtId)) {
      const hasThirdSetScore = this.getStoredSetScore(court, 'A', 3) > 0 || this.getStoredSetScore(court, 'B', 3) > 0;
      if (hasThirdSetScore || (isActive && currentSet >= 3)) {
        if (!indices.includes(3)) indices.push(3);
      }
    }
    return indices;
  },

  /** Returns true if this court has a super tiebreak entry in sets_detail */
  hasSuperTiebreak(courtId) {
    const court = this.courts[courtId];
    return court?.sets_detail?.some(s => s.stb) || false;
  },

  /** Get super tiebreak scores {a, b} or null */
  getSuperTiebreakScore(courtId) {
    const court = this.courts[courtId];
    const stb = court?.sets_detail?.find(s => s.stb);
    if (!stb) return null;
    return { a: stb.p1, b: stb.p2 };
  },

  /** Get tiebreak loser points for a specific set index (1-based) */
  getTiebreakInfo(courtId, setIdx) {
    const court = this.courts[courtId];
    const detail = court?.sets_detail;
    if (!detail || !detail[setIdx - 1]) return null;
    const entry = detail[setIdx - 1];
    if (entry.stb) return null; // No TB superscript on super tiebreak
    return entry.tb;
  },

  getStoredSetScore(court, side, setIdx) {
    if (!court) return 0;
    const active = court.match_status?.active;
    const currentSet = parseInt(court.current_set) || 1;
    const hasSetDetail = Array.isArray(court.sets_detail) && court.sets_detail.length > 0;
    if (active && !hasSetDetail && setIdx > currentSet) return 0;
    return Number(court[side]?.[`set${setIdx}`] ?? 0) || 0;
  },

  getSetScore(courtId, side, setIdx) {
    const court = this.courts[courtId];
    if (!court) return '0';
    const currentSet = parseInt(court.current_set) || 1;
    // Active set: prefer current_games (updated in real-time via match-events)
    if (setIdx === currentSet) {
      const cg = court[side]?.current_games;
      if (cg !== undefined && cg !== null) return String(cg);
    }
    return String(this.getStoredSetScore(court, side, setIdx));
  },

  getCurrentSetLabel(courtId) {
    const tr = this.tr();
    const currentSet = this.courts[courtId]?.current_set || 1;
    if (this.isSuperTiebreak(courtId)) {
      return tr.table?.columns?.superTieBreak || tr.superTieBreakLabel || 'Super TB';
    }
    return (tr.footer?.set || 'Set') + ' ' + currentSet;
  },

  /* --- Screen reader summary (the key accessibility feature) --- */
  getScoreSummary(courtId) {
    const court = this.courts[courtId];
    if (!court) return '';
    const a = this.acc();
    const isTie = this.isTiebreak(courtId);
    const isSuper = this.isSuperTiebreak(courtId);
    const currentSet = parseInt(court.current_set) || 1;

    // Serving info
    const serve = court.serve;
    const servingText = a.serving || 'serwuje';
    const servingPart = serve === 'A'
      ? `${this.getPlayerName(courtId, 'A')} ${servingText}`
      : serve === 'B'
        ? `${this.getPlayerName(courtId, 'B')} ${servingText}`
        : null;

    // Points label
    const pointsLabel = isTie
      ? (isSuper ? (a.superTieBreak || 'super tie-break') : (a.tieBreak || 'tie-break'))
      : (a.points || 'punkty');

    const ptsA = this.getDisplayPoints(courtId, 'A');
    const ptsB = this.getDisplayPoints(courtId, 'B');

    const parts = [];
    if (servingPart) parts.push(servingPart);
    parts.push(`${pointsLabel} ${ptsA}:${ptsB}`);

    // Set scores
    const setIndices = this.getSetIndices(courtId);
    setIndices.forEach(idx => {
      const sA = this.getSetScore(courtId, 'A', idx);
      const sB = this.getSetScore(courtId, 'B', idx);
      const numA = parseInt(sA) || 0;
      const numB = parseInt(sB) || 0;
      const include = idx === 1 || currentSet >= idx || numA > 0 || numB > 0;
      if (!include) return;

      const setLabel = isSuper && idx === currentSet
        ? (a.superTieBreak || 'super tie-break')
        : fmt(a.set || 'Set {number}', { number: idx });
      const isActive = currentSet === idx;
      const segment = isActive
        ? `${setLabel}, ${a.active || 'aktywny'}, ${sA}:${sB}`
        : `${setLabel} ${sA}:${sB}`;
      parts.push(segment);
    });

    return parts.join('. ').trim();
  },

  /* --- Score helpers (legacy) --- */
  getScore(courtId, player) {
    const court = this.courts[courtId];
    if (!court) return { sets: [], points: '-' };
    const playerData = court[player];
    if (!playerData) return { sets: [], points: '-' };
    return {
      sets: playerData.sets || [],
      points: playerData.points || '0'
    };
  },

  formatTime(seconds) {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  },

  formatDateTime(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return isoStr; }
  },

  formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return isoStr; }
  },

  /* --- History formatting helpers --- */
  /**
   * Format score arrays into tennis-friendly display with tiebreak scores.
   * Uses sets_history (from Android) to show full TB scores.
   * e.g., [7,4,0] vs [6,4,0] with TB → "7:6(3:7), 4:1" or "6:4, 6:7(5:7), STB 10:7"
   */
  formatHistoryScore(scoreA, scoreB, setsHistory) {
    if (!scoreA || !scoreB) return '–';
    const parts = [];
    const numSets = Math.max(scoreA.length, scoreB.length);
    for (let i = 0; i < numSets; i++) {
      let a = scoreA[i] ?? 0;
      let b = scoreB[i] ?? 0;
      if (a === 0 && b === 0 && i > 0) continue; // Skip unplayed sets
      
      // Check for tiebreak info from sets_history
      const setInfo = setsHistory?.find(sh => sh.set_number === i + 1);
      const tbLoser = setInfo?.tiebreak_loser_points;
      
      // Detect super tiebreak
      const isSuperTB = setInfo?.is_super_tiebreak || (i === 2 && parts.length === 2 && Math.abs(a - b) <= 1);
      
      if (isSuperTB && tbLoser != null) {
        const winnerPts = Math.max(10, tbLoser + 2);
        if (a > b) { a = winnerPts; b = tbLoser; }
        else { a = tbLoser; b = winnerPts; }
        parts.push(`[${a}:${b}]`);
      } else if (tbLoser != null && tbLoser >= 0) {
        // Tiebreak was played — compute full TB score
        // The set winner (more games) won the tiebreak
        const tbTarget = 7; // regular TB to 7
        const winnerTB = Math.max(tbTarget, tbLoser + 2);
        let tbA, tbB;
        if (a > b) {
          // Player A won this set's tiebreak
          tbA = winnerTB;
          tbB = tbLoser;
        } else {
          tbA = tbLoser;
          tbB = winnerTB;
        }
        parts.push(`${a}:${b}(${tbA}:${tbB})`);
      } else {
        parts.push(`${a}:${b}`);
      }
    }
    return parts.join(', ') || '–';
  },

  /**
   * Determine match winner from set scores.
   * Returns 'A', 'B', or null.
   */
  getMatchWinner(match) {
    if (!match.score_a || !match.score_b) return null;
    let setsA = 0, setsB = 0;
    for (let i = 0; i < Math.max(match.score_a.length, match.score_b.length); i++) {
      const a = match.score_a[i] ?? 0;
      const b = match.score_b[i] ?? 0;
      if (a === 0 && b === 0 && i > 0) continue;
      if (a > b) setsA++;
      else if (b > a) setsB++;
    }
    if (setsA > setsB) return 'A';
    if (setsB > setsA) return 'B';
    return null;
  },

  /**
   * Parse match into per-set data objects for tabular scoreboard.
   * Returns: [{ a, b, tb, isSuperTB }, ...]
   * For STB sets, converts raw games (1:0) to actual STB points.
   */
  getMatchSets(match) {
    if (!match.score_a || !match.score_b) return [];
    const sets = [];
    const numSets = Math.max(match.score_a.length, match.score_b.length);
    for (let i = 0; i < numSets; i++) {
      let a = match.score_a[i] ?? 0;
      let b = match.score_b[i] ?? 0;
      if (a === 0 && b === 0 && i > 0) continue;
      const setInfo = match.sets_history?.find(sh => sh.set_number === i + 1);
      const tb = setInfo?.tiebreak_loser_points ?? null;
      const isSuperTB = setInfo?.is_super_tiebreak || (i === 2 && sets.length === 2 && Math.abs(a - b) <= 1);
      if (isSuperTB && tb !== null && tb !== undefined) {
        const winnerPts = Math.max(10, tb + 2);
        if (a > b) { a = winnerPts; b = tb; }
        else { a = tb; b = winnerPts; }
      }
      sets.push({ a, b, tb: isSuperTB ? null : tb, isSuperTB });
    }
    return sets;
  },

  /**
   * Build stats rows as paired comparison (P1 value | label | P2 value).
   * Used in the centered comparison table.
   */
  getStatsRowsPaired(stats) {
    if (!stats || !stats.player1_stats) return [];
    const s1 = stats.player1_stats;
    const s2 = stats.player2_stats || {};
    const mode = (stats.stats_mode || 'ADVANCED').toUpperCase();
    const st = this.tr().stats || {};
    const rows = [];

    const push = (label, v1, v2, lowerIsBetter = false) => {
      const n1 = typeof v1 === 'string' ? parseFloat(v1) : v1;
      const n2 = typeof v2 === 'string' ? parseFloat(v2) : v2;
      const cmp = lowerIsBetter ? -1 : 1;
      rows.push({
        label,
        p1: v1,
        p2: v2,
        p1Better: !isNaN(n1) && !isNaN(n2) && (n1 - n2) * cmp > 0,
        p2Better: !isNaN(n1) && !isNaN(n2) && (n2 - n1) * cmp > 0
      });
    };

    if (mode === 'ADVANCED') {
      push(st.aces || 'Aces', s1.aces ?? 0, s2.aces ?? 0);
    }
    push(st.doubleFaults || 'Double faults', s1.double_faults ?? 0, s2.double_faults ?? 0, true);
    push(st.winners || 'Winners', s1.winners ?? 0, s2.winners ?? 0);
    if (mode === 'ADVANCED') {
      push(st.forcedErrors || 'Forced errors', s1.forced_errors ?? 0, s2.forced_errors ?? 0, true);
      push(st.unforcedErrors || 'Unforced errors', s1.unforced_errors ?? 0, s2.unforced_errors ?? 0, true);
    }
    if (s1.first_serves > 0 || s1.first_serve_percentage > 0) {
      if (mode === 'ADVANCED' && s1.first_serves > 0) {
        push(st.firstServe || '1st serve', `${s1.first_serves_in ?? 0}/${s1.first_serves}`, `${s2.first_serves_in ?? 0}/${s2.first_serves || 0}`);
      }
      const pct1 = s1.first_serve_percentage != null
        ? Math.round(s1.first_serve_percentage) + '%'
        : (s1.first_serves > 0 ? Math.round(((s1.first_serves_in ?? 0) / s1.first_serves) * 100) + '%' : '–');
      const pct2 = s2.first_serve_percentage != null
        ? Math.round(s2.first_serve_percentage) + '%'
        : (s2.first_serves > 0 ? Math.round(((s2.first_serves_in ?? 0) / s2.first_serves) * 100) + '%' : '–');
      push(st.firstServePct || '1st serve %', pct1, pct2);
    }
    if (mode === 'ADVANCED') {
      const pw1 = (s1.aces ?? 0) + (s1.winners ?? 0) + (s2.double_faults ?? 0) + (s2.forced_errors ?? 0) + (s2.unforced_errors ?? 0);
      const pw2 = (s2.aces ?? 0) + (s2.winners ?? 0) + (s1.double_faults ?? 0) + (s1.forced_errors ?? 0) + (s1.unforced_errors ?? 0);
      push(st.pointsWon || 'Points won', pw1, pw2);
    }

    return rows;
  },

  /**
   * Build accessible single-string description for screen readers (NVDA, VoiceOver).
   */
  getHistoryAriaLabel(match) {
    const h = this.tr().history || {};
    const courtName = match.court_name || match.kort_id;
    const court = match.tournament_name
      ? `${match.tournament_name}: ${h.court || 'Kort'} ${courtName}`
      : `${h.court || 'Kort'} ${courtName}`;
    const players = `${match.player_a || '-'} ${h.vs || 'vs'} ${match.player_b || '-'}`;
    const parts = [court, players];

    if (match.category) {
      parts.push(`${h.category || 'Kategoria'} ${match.category}`);
    }
    
    const scoreStr = this.formatHistoryScore(match.score_a, match.score_b, match.sets_history);
    if (scoreStr && scoreStr !== '–') {
      parts.push(`${h.score || 'wynik'} ${scoreStr}`);
    }

    const winner = this.getMatchWinner(match);
    if (winner === 'A') parts.push(`zwycięzca ${match.player_a}`);
    else if (winner === 'B') parts.push(`zwycięzca ${match.player_b}`);

    if (match.duration_seconds) {
      parts.push(`${h.time || 'czas'} ${this.formatTime(match.duration_seconds)}`);
    }

    return parts.join(', ');
  },

  /**
   * Toggle details panel for a history match.
   * Fetches stats from server if not already loaded.
   */
  async toggleMatchDetails(matchId) {
    if (!matchId) return;
    const key = String(matchId);
    
    if (this.expandedMatchStats[key]) {
      // Collapse: remove entry
      delete this.expandedMatchStats[key];
      this.expandedMatchStats = { ...this.expandedMatchStats };
      return;
    }

    // Fetch stats from server
    try {
      this.expandedMatchStats = { ...this.expandedMatchStats, [key]: { loading: true } };
      const response = await fetch(`/api/match-stats/${matchId}`);
      if (!response.ok) {
        this.expandedMatchStats = { ...this.expandedMatchStats, [key]: { error: true } };
        return;
      }
      const data = await response.json();
      this.expandedMatchStats = { ...this.expandedMatchStats, [key]: data };
    } catch {
      this.expandedMatchStats = { ...this.expandedMatchStats, [key]: { error: true } };
    }
  },

  isMatchExpanded(matchId) {
    return matchId && !!this.expandedMatchStats[String(matchId)];
  },

  getMatchStats(matchId) {
    return matchId ? this.expandedMatchStats[String(matchId)] : null;
  },

  /**
   * Get stats rows to display, filtered by stats_mode.
   * SIMPLE: double faults, winners, first serve %
   * ADVANCED: aces, double faults, winners, forced errors, unforced errors,
   *           first serve (ratio + %), second serve %, points won
   */
  getStatsRows(stats, playerKey, otherPlayerKey) {
    if (!stats || !stats[playerKey]) return [];
    const s = stats[playerKey];
    const opp = stats[otherPlayerKey] || {};
    const mode = (stats.stats_mode || 'ADVANCED').toUpperCase();
    const st = this.tr().stats || {};
    const rows = [];

    if (mode === 'ADVANCED') {
      rows.push({ label: st.aces || 'Aces', value: s.aces ?? 0 });
    }
    rows.push({ label: st.doubleFaults || 'Double faults', value: s.double_faults ?? 0 });
    rows.push({ label: st.winners || 'Winners', value: s.winners ?? 0 });
    if (mode === 'ADVANCED') {
      rows.push({ label: st.forcedErrors || 'Forced errors', value: s.forced_errors ?? 0 });
      rows.push({ label: st.unforcedErrors || 'Unforced errors', value: s.unforced_errors ?? 0 });
    }
    // First serve percentage
    if (s.first_serves > 0 || s.first_serve_percentage > 0) {
      if (mode === 'ADVANCED' && s.first_serves > 0) {
        rows.push({ label: st.firstServe || '1st serve', value: `${s.first_serves_in ?? 0}/${s.first_serves}` });
      }
      const pct = s.first_serve_percentage != null
        ? Math.round(s.first_serve_percentage) + '%'
        : (s.first_serves > 0 ? Math.round(((s.first_serves_in ?? 0) / s.first_serves) * 100) + '%' : '–');
      rows.push({ label: st.firstServePct || '1st serve %', value: pct });
    }
    // Advanced: points won (aces + winners + opponent's errors)
    if (mode === 'ADVANCED') {
      const ptsWon = (s.aces ?? 0) + (s.winners ?? 0) + (opp.double_faults ?? 0) + (opp.forced_errors ?? 0) + (opp.unforced_errors ?? 0);
      rows.push({ label: st.pointsWon || 'Points won', value: ptsWon });
    }

    return rows;
  }
}));

Alpine.start();
