/** Full Lithuanian public catalog — tennis terms, not a calque of EN/PL. */
export const TRANSLATIONS_LT = {
  htmlLang: 'lt',
  pageTitle: 'Teniso rezultatai \u2013 tiesiogiai',
  navLabel: 'Spartusis kortų naršymas',
  courtLabel: 'Kortas {court}',
  liveBadge: 'LIVE',
  versus: 'prieš',
  tieBreakLabel: 'TB',
  superTieBreakLabel: 'STB',
  table: {
    columns: {
      points: 'Taškai',
      tieBreak: 'TB',
      superTieBreak: 'STB',
      set1: '1 setas', set2: '2 setas', set3: '3 setas'
    }
  },
  players: { defaultA: 'Žaidėjas A', defaultB: 'Žaidėjas B' },
  meta: { lastRefresh: 'Paskutinis atnaujinimas: {time}.' },
  accessibility: {
    versus: 'prieš',
    points: 'taškai',
    tieBreak: 'taibreikas',
    superTieBreak: 'super taibreikas',
    set: '{number} setas',
    active: 'aktyvus',
    serving: 'paduoda'
  },
  history: {
    title: 'Mačų istorija', court: 'Kortas', vs: 'prieš', score: 'rezultatas', time: 'laikas',
    category: 'Kategorija', phaseGroup: 'Grupių etapas', phaseKnockout: 'Atkrintamosios',
    phaseGroupRematch: 'Grupių etapas — revanšas', catWomen: 'Moterys', catMen: 'Vyrai', catMixed: 'Mišrios',
    catDoubles: 'Dvejetai', searchLabel: 'Ieškoti pagal pavardę', searchPlaceholder: 'Ieškoti pavardės...',
    allCategories: 'Visos kategorijos', allCourts: 'Visi kortai', allDates: 'Visos dienos',
    clearFilters: 'Išvalyti filtrus', noFilterResults: 'Pagal pasirinktus filtrus mačų nėra'
  },
  footer: { set: 'Setas' },
  stats: {
    aces: 'Esai', doubleFaults: 'Dvigubos klaidos', winners: 'Vinneriai',
    forcedErrors: 'Išprovokuotos klaidos', unforcedErrors: 'Neišprovokuotos klaidos',
    firstServe: '1-as padavimas', firstServePct: '1-as padavimas %', pointsWon: 'Laimėti taškai',
    advanced: 'Išplėstinė statistika', simple: 'Paprasta statistika'
  },
  emptyTitle: 'Nėra aktyvių kortų',
  emptyText: 'Kortus nustatykite administratoriaus skydelyje',
  loading: 'Kraunami rezultatai...',
  historyDetail: {
    details: 'Išsamiau',
    collapse: 'Suskleisti',
    loading: 'Kraunama...',
    noStats: 'Nėra statistikos',
    category: 'Kategorija',
    duration: 'Trukmė',
    startedAt: 'Pradžia:',
    endedAt: 'Pabaiga:'
  },
  tabs: { live: 'Tiesiogiai', tournaments: 'Turnyrai', players: 'Žaidėjai' },
  tournamentCard: { players: 'žaidėjų', active: 'Aktyvus', noTournaments: 'Nėra turnyrų', backToList: 'Grįžti į sąrašą' },
  playerSection: {
    title: 'Žaidėjų bazė', searchPlaceholder: 'Ieškoti žaidėjo...', all: 'Visi', men: 'Vyrai', women: 'Moterys',
    matchesPlayed: 'mačų', winsLabel: 'L', lossesLabel: 'P', noResults: 'Nėra rezultatų',
    allCountries: 'Visos šalys', allCategories: 'Visos kategorijos', genderShortM: 'V', genderShortF: 'M'
  },
  playerProfile: {
    back: 'Grįžti į sąrašą', category: 'Kategorija', country: 'Šalis', gender: 'Lytis',
    male: 'Vyras', female: 'Moteris', career: 'Karjera', tournaments: 'Turnyrai', matches: 'Mačai',
    wins: 'Pergalės', losses: 'Pralaimėjimai', winRate: 'Sėkmės proc.', medals: 'Medaliai',
    gold: 'Auksas', silver: 'Sidabras', bronze: 'Bronza', tournamentHistory: 'Turnyrų istorija',
    group: 'Grupė', place: 'vieta', of: 'iš', groupPhase: 'Grupių etapas', knockoutPhase: 'Atkrintamosios',
    noTournaments: 'Nėra turnyrų', matchesInTournament: 'Mačai turnyre', won: 'L', lost: 'P', vs: 'prieš', duration: 'Trukmė'
  },
  darkModeTooltip: { light: 'Perjungti šviesųjį režimą', dark: 'Perjungti tamsųjį režimą' },
  liveSub: { scores: 'Rezultatai gyvai', bracket: 'Turnyrinė lentelė', schedule: 'Tvarkaraštis', history: 'Istorija' },
  schedule: {
    title: 'Varžybų tvarkaraštis', emptyTitle: 'Tvarkaraštis dar nepaskelbtas',
    emptyText: 'Turnyro biuras papildys orientacines valandas ir kortus.',
    loading: 'Kraunamas tvarkaraštis...', refresh: 'Atnaujinti', time: 'Laikas', court: 'Kortas',
    category: 'Kategorija', phase: 'Etapas', match: 'Mačas', status: 'Būsena', notes: 'Pastabos',
    searchLabel: 'Ieškoti pagal pavardę', searchPlaceholder: 'Ieškoti pavardės...', sortLabel: 'Rikiavimas',
    sortCourt: 'Pagal kortą', sortCategory: 'Pagal kategoriją', tabsLabelCourt: 'Pasirinkite kortą',
    tabsLabelCategory: 'Pasirinkite kategoriją', noResultsTitle: 'Nėra atitinkančių mačų',
    noResultsText: 'Pakeiskite paiešką arba rikiavimą.', timeTbd: 'laikas bus patvirtintas',
    courtTbd: 'kortas bus patvirtintas', categoryTbd: 'kategorija bus patvirtinta',
    statusDraft: 'Juodraštis', statusPlanned: 'Suplanuotas', statusInProgress: 'Vyksta',
    statusCompleted: 'Baigtas', updated: 'Tvarkaraštis atnaujintas'
  },
  bracket: {
    emptyTitle: 'Nėra lentelės', emptyText: 'Turnyrinė lentelė dar nesudaryta',
    group: 'Grupė', player: 'Žaidėjas', pair: 'Pora', wins: 'L', losses: 'P',
    setsHeader: 'Setai', gamesHeader: 'Geimai', matchesTitle: 'Grupių mačai',
    knockoutTitle: 'Turnyrinė lentelė', semifinal: 'Pusfinalis',
    finalLabel: 'Finalas', thirdPlace: 'Mačas dėl 3 vietos', forPlace: 'dėl',
    doubles: 'Dvejetai',
    legendTitle: 'Lentelės legenda', legendWins: 'laimėti mačai', legendLosses: 'pralaimėti mačai',
    legendSets: 'laimėti setai prieš pralaimėtus', legendGames: 'laimėti geimai prieš pralaimėtus'
  },
  tournamentHistory: {
    selectTournament: 'Pasirinkite turnyrą',
    chooseTournament: '-- Pasirinkite turnyrą --',
    matchHistory: 'Mačų istorija',
    bracket: 'Turnyrinė lentelė',
    schedule: 'Turnyro planas',
    noMatches: 'Šiame turnyre nėra mačų'
  },
  connection: { lost: 'Ryšys nutrūko' }
};

export const TRANSLATION_PATCHES_LT = {
  ui: {
    appName: 'Teniso rezultatai',
    pageDescription: 'Teniso rezultatai gyvai, turnyrinės lentelės, tvarkaraštis ir mačų istorija.',
    skipToContent: 'Eiti prie turinio',
    languageSelect: 'Pasirinkite kalbą',
    poweredBy: 'Technologija',
  },
  meta: { lastRefresh: 'Paskutinis atnaujinimas: {time}.' },
  history: { title: 'Naujausi rezultatai', noMatchesActive: 'Nėra baigtų aktyvaus turnyro mačų' },
  tabs: { navLabel: 'Pagrindinė navigacija' },
  tournamentCard: { backToList: 'Grįžti prie turnyrų' },
  playerSection: { genderFilter: 'Lyties filtras' },
  playerProfile: { ageLabel: '{years} m.', noMatches: 'Nėra mačų', notFound: 'Žaidėjas nerastas' },
  liveSub: { navLabel: 'Gyvosios skiltys', scores: 'Mačai gyvai', schedule: 'Turnyro planas', history: 'Rezultatai' },
  schedule: { title: 'Turnyro planas', emptyTitle: 'Turnyro planas dar nepaskelbtas', loading: 'Kraunamas turnyro planas...', updated: 'Turnyro planas atnaujintas' },
  bracket: {
    categoryTabsLabel: 'Turnyro kategorijos', podiumLabel: 'Pjedestalas',
    groupTableLabel: 'Grupės {group} lentelė', treeLabel: 'Lentelė {category}',
    placeMatch: 'Mačas dėl {number} vietos', pair: 'Pora',
  },
  tournamentHistory: { navLabel: 'Turnyro skiltys', matchHistory: 'Rezultatai', schedule: 'Turnyro planas' },
  accessibility: {
    scoreJoiner: 'prieš', winner: 'Nugalėtojas', result: 'Mačo rezultatas', court: 'Kortas',
    phase: 'Etapas', duration: 'Trukmė', unknownPlayer: 'žaidėjas nenustatytas',
    unknownPair: 'pora nenustatyta', unknownCourt: 'kortas nenustatytas',
    scorePending: 'rezultatas dar nepaskelbtas', stageMatch: '{phase}, {number} mačas',
    groupMatch: '{group}, {number} mačas', tournamentQuickInfoLabel: 'Turnyro pranešimas'
  },
};
