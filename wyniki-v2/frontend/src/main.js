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
    tabs: { live: 'Na żywo', tournaments: 'Historia', players: 'Zawodnicy' },
    tournamentCard: { players: 'zawodników', active: 'Aktywny', noTournaments: 'Brak turniejów', backToList: 'Powrót do listy' },
    playerSection: { title: 'Baza zawodników', searchPlaceholder: 'Szukaj zawodnika...', all: 'Wszyscy', men: 'Mężczyźni', women: 'Kobiety', matchesPlayed: 'meczów', winsLabel: 'W', lossesLabel: 'L', noResults: 'Brak wyników', allCountries: 'Wszystkie kraje', allCategories: 'Wszystkie kategorie', genderShortM: 'M', genderShortF: 'K' },
    playerProfile: { back: 'Powrót do listy', category: 'Kategoria', country: 'Kraj', gender: 'Płeć', male: 'Mężczyzna', female: 'Kobieta', career: 'Kariera', tournaments: 'Turnieje', matches: 'Mecze', wins: 'Wygrane', losses: 'Przegrane', winRate: 'Skuteczność', medals: 'Medale', gold: 'Złoto', silver: 'Srebro', bronze: 'Brąz', tournamentHistory: 'Historia turniejów', group: 'Grupa', place: 'miejsce', of: 'z', groupPhase: 'Faza grupowa', knockoutPhase: 'Faza pucharowa', noTournaments: 'Brak turniejów', matchesInTournament: 'Mecze w turnieju', won: 'W', lost: 'P', vs: 'vs', duration: 'Czas' },
    darkModeTooltip: { light: 'Zmień na tryb jasny', dark: 'Zmień na tryb ciemny' },
    liveSub: { scores: 'Wyniki live', bracket: 'Drabinka', history: 'Historia' },
    bracket: {
      emptyTitle: 'Brak drabinki', emptyText: 'Drabinka turniejowa nie została jeszcze skonfigurowana',
      group: 'Grupa', player: 'Zawodnik', wins: 'W', losses: 'L',
      setsHeader: 'Sety', gamesHeader: 'Gemy', matchesTitle: 'Mecze grupowe',
      knockoutTitle: 'Faza pucharowa', semifinal: 'Półfinał',
      finalLabel: 'Finał', thirdPlace: 'Mecz o 3. miejsce', forPlace: 'o'
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
    liveSub: { scores: 'Live-Ergebnisse', bracket: 'Turnierbaum', history: 'Historie' },
    bracket: {
      emptyTitle: 'Kein Turnierbaum', emptyText: 'Der Turnierbaum wurde noch nicht konfiguriert',
      group: 'Gruppe', player: 'Spieler', wins: 'S', losses: 'N',
      setsHeader: 'Sätze', gamesHeader: 'Spiele', matchesTitle: 'Gruppenspiele',
      knockoutTitle: 'K.O.-Phase', semifinal: 'Halbfinale',
      finalLabel: 'Finale', thirdPlace: 'Spiel um Platz 3', forPlace: 'um Platz'
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
    liveSub: { scores: 'Live scores', bracket: 'Bracket', history: 'History' },
    bracket: {
      emptyTitle: 'No bracket', emptyText: 'Tournament bracket has not been configured yet',
      group: 'Group', player: 'Player', wins: 'W', losses: 'L',
      setsHeader: 'Sets', gamesHeader: 'Games', matchesTitle: 'Group matches',
      knockoutTitle: 'Knockout stage', semifinal: 'Semifinal',
      finalLabel: 'Final', thirdPlace: 'Third place match', forPlace: 'for'
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
    liveSub: { scores: 'Risultati live', bracket: 'Tabellone', history: 'Cronologia' },
    bracket: {
      emptyTitle: 'Nessun tabellone', emptyText: 'Il tabellone del torneo non è ancora stato configurato',
      group: 'Girone', player: 'Giocatore', wins: 'V', losses: 'S',
      setsHeader: 'Set', gamesHeader: 'Game', matchesTitle: 'Partite del girone',
      knockoutTitle: 'Fase a eliminazione', semifinal: 'Semifinale',
      finalLabel: 'Finale', thirdPlace: 'Finale per il 3° posto', forPlace: 'per il'
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
    liveSub: { scores: 'En vivo', bracket: 'Cuadro', history: 'Historial' },
    bracket: {
      emptyTitle: 'Sin cuadro', emptyText: 'El cuadro del torneo aún no ha sido configurado',
      group: 'Grupo', player: 'Jugador', wins: 'V', losses: 'D',
      setsHeader: 'Sets', gamesHeader: 'Juegos', matchesTitle: 'Partidos del grupo',
      knockoutTitle: 'Fase eliminatoria', semifinal: 'Semifinal',
      finalLabel: 'Final', thirdPlace: 'Partido por el 3er lugar', forPlace: 'por el'
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
    liveSub: { scores: 'En direct', bracket: 'Tableau', history: 'Historique' },
    bracket: {
      emptyTitle: 'Pas de tableau', emptyText: 'Le tableau du tournoi n\'a pas encore été configuré',
      group: 'Groupe', player: 'Joueur', wins: 'V', losses: 'D',
      setsHeader: 'Sets', gamesHeader: 'Jeux', matchesTitle: 'Matchs de groupe',
      knockoutTitle: 'Phase à élimination', semifinal: 'Demi-finale',
      finalLabel: 'Finale', thirdPlace: 'Match pour la 3e place', forPlace: 'pour la'
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

  // Tournament history state
  tournaments: [],
  selectedTournamentId: '',
  tournamentHistory: [],
  tournamentBracket: null,
  tournamentBracketCategory: null,
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
    // Restore dark mode preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.darkMode = true;
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    this._applyHash();
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
      if (!this.bracketData) this.fetchBracket();
      if (parts[1]) this._pendingCategory = parts.slice(1).join('/');
    } else if (tab === 'tournaments' || tab === 'history' || tab === 'historia') {
      this.activeTab = 'tournaments';
      this.selectedPlayerId = null;
      if (parts[1]) {
        // #tournaments/3/bracket or #tournaments/3/matches
        this.selectedTournamentId = parts[1];
        if (parts[2] === 'matches') this.historySubTab = 'matches';
        else this.historySubTab = 'bracket';
        this.onTournamentSelected();
      } else {
        this.selectedTournamentId = '';
      }
    } else if (tab === 'players' || tab === 'zawodnicy') {
      this.activeTab = 'players';
      this.selectedTournamentId = '';
      if (parts[1]) {
        const pid = parseInt(parts[1], 10);
        if (this.selectedPlayerId !== pid) {
          this.selectedPlayerId = pid;
          this._profileIsGlobal = true;
          this.playerProfile = null;
          this.profileExpandedTournaments = {};
          this.fetchPlayerProfile(pid, true);
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
      hash = 'players/' + this.selectedPlayerId;
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
      this.courts = data.courts || {};
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
    return t ? t.name : '';
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
      return;
    }
    await Promise.all([
      this.fetchTournamentHistory(tid),
      this.fetchTournamentBracket(tid)
    ]);
  },

  async fetchTournamentHistory(tid) {
    try {
      const response = await fetch(`/api/tournament/${encodeURIComponent(tid)}/history`);
      if (!response.ok) { this.tournamentHistory = []; return; }
      const data = await response.json();
      this.tournamentHistory = Array.isArray(data) ? data : [];
    } catch { this.tournamentHistory = []; }
  },

  async fetchTournamentBracket(tid) {
    try {
      const response = await fetch(`/api/tournament/${encodeURIComponent(tid)}/bracket`);
      if (!response.ok) { this.tournamentBracket = null; return; }
      this.tournamentBracket = await response.json();
      this._buildBracketNameMap(this.tournamentBracket);
      const cats = this.tournamentBracketCategories();
      if (cats.length > 0) this.tournamentBracketCategory = cats[0].name;
    } catch { this.tournamentBracket = null; }
  },

  /* --- Pad sets to 3 columns for consistent table alignment --- */
  padSets(sets) {
    const arr = sets || [];
    const padded = arr.map(s => ({ ...s, played: true }));
    while (padded.length < 3) padded.push({ g1: 0, g2: 0, tb: null, stb: false, played: false });
    return padded;
  },

  async fetchBracket() {
    this.bracketLoading = true;
    try {
      const response = await fetch('/api/tournament/bracket');
      if (!response.ok) { this.bracketData = null; return; }
      this.bracketData = await response.json();
      // Build name map from bracket group matches (match names → surname lookup)
      this._buildBracketNameMap(this.bracketData);
      // Auto-select category from pending hash or first
      const cats = this.bracketCategories();
      if (this._pendingCategory && cats.find(c => c.name === this._pendingCategory)) {
        this.bracketCategory = this._pendingCategory;
        this._pendingCategory = null;
      } else if (cats.length > 0 && !this.bracketCategory) {
        this.bracketCategory = cats[0].name;
      }
    } catch { this.bracketData = null; }
    finally { this.bracketLoading = false; }
  },

  switchToBracket(cat) {
    this.activeTab = 'live';
    this.liveSubTab = 'bracket';
    if (cat) this.bracketCategory = cat;
    if (!this.bracketData) this.fetchBracket();
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
    this.fetchPlayerProfile(id, isGlobal);
    this._updateHash();
  },

  closePlayerProfile() {
    this.selectedPlayerId = null;
    this._profileIsGlobal = false;
    this.playerProfile = null;
    this.profileExpandedTournaments = {};
    history.back();
  },

  async fetchPlayerProfile(id, isGlobal = false) {
    this.playerProfileLoading = true;
    try {
      const qs = isGlobal ? '?global=1' : '';
      const response = await fetch(`/api/players/${encodeURIComponent(id)}/profile${qs}`);
      if (!response.ok) { this.playerProfile = null; return; }
      this.playerProfile = await response.json();
    } catch { this.playerProfile = null; }
    finally { this.playerProfileLoading = false; }
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
        // "B4M Finał" → "B4M"
        const prefix = phase.split(' ')[0];
        for (const [, cat] of cats) {
          if (cat.name === prefix || cat.name.startsWith(prefix)) {
            cat.knockout.push({ phase, slots });
            break;
          }
        }
      }
    }
    return [...cats.values()];
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
        const prefix = phase.split(' ')[0];
        for (const [, cat] of cats) {
          if (cat.name === prefix || cat.name.startsWith(prefix)) {
            cat.knockout.push({ phase, slots });
            break;
          }
        }
      }
    }
    return [...cats.values()];
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
    return Object.keys(this.courts)
      .map(id => parseInt(id))
      .filter(id => !isNaN(id) && id > 0)
      .sort((a, b) => a - b)
      .map(id => id.toString());
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
    const courtLabel = this.t('courtLabel', { court: courtId });
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

  isSuperTiebreak(courtId) {
    const court = this.courts[courtId];
    if (!court) return false;
    return this.isTiebreak(courtId) && (court.current_set === 3 || court.current_set === '3');
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
      if (currentSet >= 3 || court.A?.set3 || court.B?.set3) {
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

  getSetScore(courtId, side, setIdx) {
    const court = this.courts[courtId];
    if (!court) return '0';
    const currentSet = parseInt(court.current_set) || 1;
    // Active set: prefer current_games (updated in real-time via match-events)
    if (setIdx === currentSet) {
      const cg = court[side]?.current_games;
      if (cg !== undefined && cg !== null) return String(cg);
    }
    const val = court[side]?.[`set${setIdx}`];
    return val !== undefined && val !== null ? String(val) : '0';
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

      const setLabel = fmt(a.set || 'Set {number}', { number: idx });
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
    const court = `${h.court || 'Kort'} ${match.kort_id}`;
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
