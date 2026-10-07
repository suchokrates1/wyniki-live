// A tournament's series on the public page: its logo and name by the tournament's name
// (a TWT tournament carries the TWT logo), on the cards, the tournament's page and the live tab.

import { tierLabel } from '../organizer/route.js';
import { pickSeriesLogo } from '../shared/seriesLogo.js';

/** The first series a tournament belongs to, or null. */
export function seriesOf(tournament) {
  const list = tournament?.series;
  return Array.isArray(list) && list.length ? list[0] : null;
}

/** "Takei World Tennis Tour · Challenger 50" */
export function seriesLine(series) {
  if (!series) return '';
  const tier = tierLabel(series.tier);
  return tier ? `${series.name} · ${tier}` : series.name;
}

export function createSeriesMarkView() {
  return {
    tournamentSeries: [],
    seriesOf,
    seriesLine,
    selectedTournamentSeries() {
      return seriesOf((this.tournaments || []).find((t) => String(t.id) === String(this.selectedTournamentId)));
    },
    liveSeries() {
      return seriesOf({ series: this.tournamentSeries });
    },
    /** The logo version that reads on the page's theme now. */
    markLogo(series) {
      return pickSeriesLogo(series, this.darkMode);
    },
  };
}
