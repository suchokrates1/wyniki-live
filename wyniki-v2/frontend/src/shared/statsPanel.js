// The stats panel of the stream overlay and of its preview in the admin editor.
// Names and numbers come from the umpire's device through the court state, so every
// value is escaped here, once, before either page builds markup from it.
import { escapeTvHtml } from './tvScoreboard.js';

const DASH = '—';

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
 * @returns {{ title: string, nameA: string, nameB: string, rows: { label: string, a: string, b: string }[] }}
 *   every string is safe to place in HTML
 */
export function statsPanelData(court, mode, shorten) {
  const stats = (court && court.stats) || {};
  const a = stats.player_a || {};
  const b = stats.player_b || {};
  const advanced = mode === 'advanced';
  const name = (player, fallback) => {
    const raw = String((player && (player.full_name || player.surname)) || fallback);
    return escapeTvHtml(shorten ? shorten(raw) : raw);
  };

  const rows = [
    { label: 'Asy', a: value(a.aces), b: value(b.aces) },
    { label: 'Podw. błędy', a: value(a.double_faults), b: value(b.double_faults) },
    { label: 'Winnery', a: value(a.winners), b: value(b.winners) },
  ];
  if (advanced) {
    rows.push({ label: 'Bł. wymuszone', a: value(a.forced_errors), b: value(b.forced_errors) });
  }
  rows.push({ label: 'Bł. niewymuszone', a: value(a.unforced_errors), b: value(b.unforced_errors) });
  if (advanced) {
    rows.push({
      label: '1. serwis',
      a: serveRatio(a.first_serves_in, a.first_serves_total),
      b: serveRatio(b.first_serves_in, b.first_serves_total),
    });
  }
  rows.push({ label: '1. serwis %', a: value(a.first_serve_pct, '%'), b: value(b.first_serve_pct, '%') });
  if (advanced) {
    rows.push({ label: '2. serwis %', a: value(a.second_serve_pct, '%'), b: value(b.second_serve_pct, '%') });
    rows.push({ label: 'Pkt wygrane', a: String(pointsWon(a, b)), b: String(pointsWon(b, a)) });
  }

  return {
    title: advanced ? 'Statystyki zaawansowane' : 'Statystyki',
    nameA: name(court && court.A, 'A'),
    nameB: name(court && court.B, 'B'),
    rows,
  };
}
