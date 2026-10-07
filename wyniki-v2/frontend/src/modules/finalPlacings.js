// A tournament played outside blindtennis.app has no draw here, only final results: how far
// each player got. The tournament page lists them by category, best band first.

import { publicApi } from '../api/publicApi.js';

const ORDER = ['W', 'F', 'SF', 'QF', 'R16', 'R32', 'Q'];

/** [{category, rows}] in the order the rows came (the API sorts by category, then band). */
export function groupPlacings(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    if (!ORDER.includes(row.band)) continue;
    const name = row.category || '—';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return [...groups].map(([category, list]) => ({ category, rows: list }));
}

export function createFinalPlacingsView() {
  return {
    finalPlacings: [],
    async loadFinalPlacings(tournamentId) {
      this.finalPlacings = [];
      try {
        const body = await publicApi.getTournamentPlacings(tournamentId);
        if (body?.external && String(this.selectedTournamentId) === String(tournamentId)) this.finalPlacings = groupPlacings(body.placings);
      } catch { /* no final results: the draw shows as usual */ }
    },
    bandText(band) { return this.tr().finalResults?.[band] || band; },
  };
}
