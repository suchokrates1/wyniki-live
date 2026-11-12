// The stats panel of the stream overlay and of its preview in the admin editor.
// Names and numbers come from the umpire's device through the court state, so every
// value is escaped here, once, before either page builds markup from it.
import { escapeTvHtml } from './tvScoreboard.js';

const DASH = '—';

const STATS_LABELS = {
  pl: {
    title: 'Statystyki',
    titleAdvanced: 'Statystyki zaawansowane',
    noActiveMatch: 'Brak aktywnego meczu',
    aces: 'Asy',
    doubleFaults: 'Podw. błędy',
    winners: 'Winnery',
    forcedErrors: 'Bł. wymuszone',
    unforcedErrors: 'Bł. niewymuszone',
    firstServe: '1. serwis',
    firstServePct: '1. serwis %',
    secondServePct: '2. serwis %',
    pointsWon: 'Pkt wygrane',
  },
  en: {
    title: 'Statistics',
    titleAdvanced: 'Advanced Statistics',
    noActiveMatch: 'No active match',
    aces: 'Aces',
    doubleFaults: 'Double faults',
    winners: 'Winners',
    forcedErrors: 'Forced errors',
    unforcedErrors: 'Unforced errors',
    firstServe: '1st serve',
    firstServePct: '1st serve %',
    secondServePct: '2nd serve %',
    pointsWon: 'Points won',
  },
  de: {
    title: 'Statistik',
    titleAdvanced: 'Erweiterte Statistik',
    noActiveMatch: 'Kein aktives Spiel',
    aces: 'Asse',
    doubleFaults: 'Doppelfehler',
    winners: 'Winner',
    forcedErrors: 'Erzw. Fehler',
    unforcedErrors: 'Unerzw. Fehler',
    firstServe: '1. Aufschlag',
    firstServePct: '1. Aufschlag %',
    secondServePct: '2. Aufschlag %',
    pointsWon: 'Gew. Punkte',
  },
  es: {
    title: 'Estadísticas',
    titleAdvanced: 'Estadísticas avanzadas',
    noActiveMatch: 'Sin partido activo',
    aces: 'Saques directos',
    doubleFaults: 'Dobles faltas',
    winners: 'Ganadores',
    forcedErrors: 'Err. forzados',
    unforcedErrors: 'Err. no forzados',
    firstServe: '1.er servicio',
    firstServePct: '1.er servicio %',
    secondServePct: '2.º servicio %',
    pointsWon: 'Puntos ganados',
  },
  fr: {
    title: 'Statistiques',
    titleAdvanced: 'Statistiques avancées',
    noActiveMatch: 'Aucun match actif',
    aces: 'Aces',
    doubleFaults: 'Doubles fautes',
    winners: 'Coups gagnants',
    forcedErrors: 'Fautes provoquées',
    unforcedErrors: 'Fautes directes',
    firstServe: '1er service',
    firstServePct: '1er service %',
    secondServePct: '2e service %',
    pointsWon: 'Points gagnés',
  },
  it: {
    title: 'Statistiche',
    titleAdvanced: 'Statistiche avanzate',
    noActiveMatch: 'Nessuna partita attiva',
    aces: 'Ace',
    doubleFaults: 'Doppi falli',
    winners: 'Vincenti',
    forcedErrors: 'Err. forzati',
    unforcedErrors: 'Err. non forzati',
    firstServe: '1° servizio',
    firstServePct: '1° servizio %',
    secondServePct: '2° servizio %',
    pointsWon: 'Punti vinti',
  },
  lt: {
    title: 'Statistika',
    titleAdvanced: 'Išplėstinė statistika',
    noActiveMatch: 'Nėra aktyvaus mačo',
    aces: 'Esai',
    doubleFaults: 'Dvigubos klaidos',
    winners: 'Vinneriai',
    forcedErrors: 'Išprov. klaidos',
    unforcedErrors: 'Neišprov. klaidos',
    firstServe: '1-as padavimas',
    firstServePct: '1-as padavimas %',
    secondServePct: '2-as padavimas %',
    pointsWon: 'Laimėti taškai',
  },
};

export function statsPanelLabels(language = 'pl') {
  const code = String(language || 'pl').trim().toLowerCase();
  return STATS_LABELS[code] || STATS_LABELS.pl;
}

function value(raw, suffix) {
  return raw != null ? escapeTvHtml(raw) + (suffix || '') : DASH;
}

function serveRatio(servesIn, servesTotal) {
  return servesIn != null && servesTotal != null
    ? escapeTvHtml(servesIn) + '/' + escapeTvHtml(servesTotal)
    : DASH;
}

function count(raw) {
  const number = Number(raw);
  return Number.isFinite(number) ? number : 0;
}

function pointsWon(own, opponent) {
  return count(own.aces) + count(own.winners)
    + count(opponent.double_faults) + count(opponent.forced_errors) + count(opponent.unforced_errors);
}

/**
 * @param {object} court court state as the server publishes it
 * @param {string} mode 'simple' or 'advanced'
 * @param {(name: string) => string} [shorten] applied to each name before escaping
 * @param {string} [language] tournament language ('pl', 'en', 'de', 'es', 'fr', 'it', 'lt')
 * @returns {{ title: string, nameA: string, nameB: string, rows: { label: string, a: string, b: string }[] }}
 *   every string is safe to place in HTML
 */
export function statsPanelData(court, mode, shorten, language) {
  const labels = statsPanelLabels(language || court?.tournament_language || 'pl');
  const stats = (court && court.stats) || {};
  const a = stats.player_a || {};
  const b = stats.player_b || {};
  const advanced = mode === 'advanced';
  const name = (player, fallback) => {
    const raw = String((player && (player.full_name || player.surname)) || fallback);
    return escapeTvHtml(shorten ? shorten(raw) : raw);
  };

  const rows = [
    { label: labels.aces, a: value(a.aces), b: value(b.aces) },
    { label: labels.doubleFaults, a: value(a.double_faults), b: value(b.double_faults) },
    { label: labels.winners, a: value(a.winners), b: value(b.winners) },
  ];
  if (advanced) {
    rows.push({ label: labels.forcedErrors, a: value(a.forced_errors), b: value(b.forced_errors) });
  }
  rows.push({ label: labels.unforcedErrors, a: value(a.unforced_errors), b: value(b.unforced_errors) });
  if (advanced) {
    rows.push({
      label: labels.firstServe,
      a: serveRatio(a.first_serves_in, a.first_serves_total),
      b: serveRatio(b.first_serves_in, b.first_serves_total),
    });
  }
  rows.push({ label: labels.firstServePct, a: value(a.first_serve_pct, '%'), b: value(b.first_serve_pct, '%') });
  if (advanced) {
    rows.push({ label: labels.secondServePct, a: value(a.second_serve_pct, '%'), b: value(b.second_serve_pct, '%') });
    rows.push({ label: labels.pointsWon, a: String(pointsWon(a, b)), b: String(pointsWon(b, a)) });
  }

  return {
    title: advanced ? labels.titleAdvanced : labels.title,
    nameA: name(court && court.A, 'A'),
    nameB: name(court && court.B, 'B'),
    rows,
  };
}
