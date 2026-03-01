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
    tieBreakLabel: 'TIE-BREAK',
    superTieBreakLabel: 'SUPER TIE-BREAK',
    table: {
      columns: {
        points: 'Punkty',
        tieBreak: 'Tie Break',
        superTieBreak: 'Super TB',
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
    history: { title: 'Historia meczów', court: 'Kort', vs: 'vs', score: 'wynik', time: 'czas', category: 'Kategoria' },
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
      duration: 'Czas'
    }
  },
  de: {
    htmlLang: 'de',
    pageTitle: 'Tennis-Ergebnisse – live',
    navLabel: 'Schnellnavigation zu den Plätzen',
    courtLabel: 'Platz {court}',
    liveBadge: 'LIVE',
    versus: 'gegen',
    tieBreakLabel: 'TIEBREAK',
    superTieBreakLabel: 'SUPER-TIEBREAK',
    table: {
      columns: {
        points: 'Punkte',
        tieBreak: 'Tiebreak',
        superTieBreak: 'Super-Tiebreak',
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
    history: { title: 'Match-Historie', court: 'Platz', vs: 'gegen', score: 'Ergebnis', time: 'Zeit', category: 'Kategorie' },
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
      duration: 'Dauer'
    }
  },
  en: {
    htmlLang: 'en',
    pageTitle: 'Tennis Scores \u2013 Live',
    navLabel: 'Quick court navigation',
    courtLabel: 'Court {court}',
    liveBadge: 'LIVE',
    versus: 'vs',
    tieBreakLabel: 'TIE-BREAK',
    superTieBreakLabel: 'SUPER TIE-BREAK',
    table: {
      columns: {
        points: 'Points',
        tieBreak: 'Tie-break',
        superTieBreak: 'Super tie-break',
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
    history: { title: 'Match history', court: 'Court', vs: 'vs', score: 'score', time: 'time', category: 'Category' },
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
      duration: 'Duration'
    }
  },
  it: {
    htmlLang: 'it',
    pageTitle: 'Risultati tennis \u2013 in diretta',
    navLabel: 'Navigazione rapida dei campi',
    courtLabel: 'Campo {court}',
    liveBadge: 'LIVE',
    versus: 'contro',
    tieBreakLabel: 'TIE-BREAK',
    superTieBreakLabel: 'SUPER TIE-BREAK',
    table: {
      columns: {
        points: 'Punti',
        tieBreak: 'Tie-break',
        superTieBreak: 'Super tie-break',
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
    history: { title: 'Storico incontri', court: 'Campo', vs: 'contro', score: 'risultato', time: 'tempo', category: 'Categoria' },
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
      duration: 'Durata'
    }
  },
  es: {
    htmlLang: 'es',
    pageTitle: 'Resultados de tenis – en vivo',
    navLabel: 'Navegación rápida por canchas',
    courtLabel: 'Cancha {court}',
    liveBadge: 'EN VIVO',
    versus: 'contra',
    tieBreakLabel: 'TIE BREAK',
    superTieBreakLabel: 'SUPER TIE BREAK',
    table: {
      columns: {
        points: 'Puntos',
        tieBreak: 'Tie break',
        superTieBreak: 'Súper tie break',
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
    history: { title: 'Historial de partidos', court: 'Cancha', vs: 'contra', score: 'resultado', time: 'tiempo', category: 'Categoría' },
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
      duration: 'Duración'
    }
  },
  fr: {
    htmlLang: 'fr',
    pageTitle: 'R\u00e9sultats tennis \u2013 en direct',
    navLabel: 'Navigation rapide des courts',
    courtLabel: 'Court {court}',
    liveBadge: 'EN DIRECT',
    versus: 'contre',
    tieBreakLabel: 'JEU DÉCISIF',
    superTieBreakLabel: 'SUPER JEU DÉCISIF',
    table: {
      columns: {
        points: 'Points',
        tieBreak: 'Jeu décisif',
        superTieBreak: 'Super jeu décisif',
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
    history: { title: 'Historique des matchs', court: 'Court', vs: 'contre', score: 'score', time: 'temps', category: 'Catégorie' },
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
      duration: 'Durée'
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
  expandedMatchStats: {},  // match_id -> stats data (for Details button)

  init() {
    // Restore dark mode preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.darkMode = true;
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    this.connectSSE();
    this.fetchInitialData();
    this.fetchHistory();
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
    } catch { /* ignore */ }
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
    const indices = [1, 2];
    // Show set 3 if we're in it or if either player has set3 data
    if (currentSet >= 3 || court.A?.set3 || court.B?.set3) {
      indices.push(3);
    }
    return indices;
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
      const a = scoreA[i] ?? 0;
      const b = scoreB[i] ?? 0;
      if (a === 0 && b === 0 && i > 0) continue; // Skip unplayed sets
      
      // Check for tiebreak info from sets_history
      const setInfo = setsHistory?.find(sh => sh.set_number === i + 1);
      const tbLoser = setInfo?.tiebreak_loser_points;
      
      // Detect super tiebreak (set 3, usually lower scores like 10:7)
      const isSuperTB = i === 2 && parts.length === 2;
      
      if (isSuperTB) {
        parts.push(`STB ${a}:${b}`);
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
   * Build accessible single-string description for NVDA.
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
