// Final results of a tournament played outside blindtennis.app: how far each entered player got.
// The bands are those of the series' points table; the public page lists them in place of a draw.

import { call, CallError } from './api.js';

export function createPlacingsView() {
  return {
    placings: { external: false, bands: [], placings: [] },
    placingsMessage: null,

    async loadPlacings() {
      try {
        this.placings = await call(`/organizer/api/tournaments/${this.t.id}/placings`);
      } catch (error) {
        this.placingsMessage = { key: error instanceof CallError ? error.key : 'errSave' };
      }
    },

    /** The entries grouped by the category they entered in. */
    placingGroups() {
      const groups = new Map();
      for (const row of this.placings.placings || []) {
        const name = row.category || '—';
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(row);
      }
      return [...groups].map(([category, rows]) => ({ category, rows }));
    },

    bandLabel(band) { return this.ot(band ? `band${band}` : 'bandNone'); },

    async savePlacings(external = this.placings.external) {
      this.placingsMessage = null;
      try {
        const body = { external, placings: (this.placings.placings || []).map(({ player_id: id, band }) => ({ player_id: id, band })) };
        this.placings = await call(`/organizer/api/tournaments/${this.t.id}/placings`, 'PUT', body);
        this.placingsMessage = { key: 'resultsSaved', ok: true };
      } catch (error) {
        this.placingsMessage = { key: error instanceof CallError ? error.key : 'errSave' };
      }
    },
  };
}
