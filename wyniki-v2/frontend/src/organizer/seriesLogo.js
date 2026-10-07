// Logos, each in two versions (the logo, and one for a dark background): the series' and the
// open tournament's. They show in the panel and on the public page, each where it reads.

import { LOGO_VARIANTS, pickSeriesLogo } from '../shared/seriesLogo.js';
import { call, CallError } from './api.js';

export function createSeriesLogoView() {
  return {
    logoMessage: null,

    logoVariants() { return LOGO_VARIANTS; },
    /** This panel is dark: the dark-background version, else the logo on a white plate. */
    panelLogo(item) { return pickSeriesLogo(item, true); },
    logoTarget(scope) { return scope === 'tournament' ? this.t : this.current(); },
    logoLocked(scope) { return scope === 'tournament' ? !!this.t?.read_only : this.readOnlySeries(); },
    _logoUrl(scope) {
      return scope === 'tournament' ? `/organizer/api/tournaments/${this.t.id}/logo` : `/organizer/api/series/${this.currentId}/logo`;
    },

    async uploadLogo(event, variant = '', scope = 'series') {
      const file = event.target.files?.[0];
      if (!file) return;
      const body = new FormData();
      body.append('logo', file);
      await this._logoCall(scope, 'POST', variant, body, 'logoSaved');
      event.target.value = '';
    },

    async removeLogo(variant = '', scope = 'series') {
      await this._logoCall(scope, 'DELETE', variant, undefined, 'logoRemoved');
    },

    async _logoCall(scope, method, variant, body, done) {
      this.logoMessage = null;
      try {
        const saved = await call(`${this._logoUrl(scope)}${variant ? `?variant=${variant}` : ''}`, method, body);
        Object.assign(this.logoTarget(scope), saved);
        this.logoMessage = { scope, key: done, ok: true };
      } catch (error) {
        this.logoMessage = { scope, key: error instanceof CallError ? error.key : 'errSave' };
      }
    },
  };
}
