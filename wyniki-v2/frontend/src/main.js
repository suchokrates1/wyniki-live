import Alpine from 'alpinejs';
import './main.css';

/* ============================================================
   TRANSLATIONS (ported from v1 translations.js)
   ============================================================ */
const TRANSLATIONS = {
  pl: {
    htmlLang: 'pl',
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
      active: 'aktywny'
    },
    history: { title: 'Historia meczów' }
  },
  de: {
    htmlLang: 'de',
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
      active: 'aktiv'
    },
    history: { title: 'Match-Historie' }
  },
  en: {
    htmlLang: 'en',
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
      active: 'active'
    },
    history: { title: 'Match history' }
  },
  it: {
    htmlLang: 'it',
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
      active: 'attivo'
    },
    history: { title: 'Storico incontri' }
  },
  es: {
    htmlLang: 'es',
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
      active: 'activo'
    },
    history: { title: 'Historial de partidos' }
  },
  fr: {
    htmlLang: 'fr',
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
      active: 'actif'
    },
    history: { title: 'Historique des matchs' }
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

  init() {
    // Restore dark mode preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.darkMode = true;
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    this.connectSSE();
    this.fetchInitialData();
  },

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
    return `${courtLabel}: ${nameA} ${vs} ${nameB}`;
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

    // Points label
    const pointsLabel = isTie
      ? (isSuper ? (a.superTieBreak || 'super tie-break') : (a.tieBreak || 'tie-break'))
      : (a.points || 'punkty');

    const ptsA = this.getDisplayPoints(courtId, 'A');
    const ptsB = this.getDisplayPoints(courtId, 'B');

    const parts = [`${pointsLabel} ${ptsA}:${ptsB}`];

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
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}));

Alpine.start();
