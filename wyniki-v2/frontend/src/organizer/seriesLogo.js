// The series' logo, in two versions (the logo, and one for a dark background): the people of
// the series put them up or take them down. They show in the panel's header and next to the
// series' tournaments on the public page, each where it reads.

import { LOGO_VARIANTS, pickSeriesLogo } from '../shared/seriesLogo.js';
import { call, CallError } from './api.js';

export function createSeriesLogoView() {
  return {
    logoMessage: null,

    logoVariants() { return LOGO_VARIANTS; },
    /** This panel is dark: the dark-background version, else the logo on a white plate. */
    panelLogo(series) { return pickSeriesLogo(series, true); },

    async uploadLogo(event, variant = '') {
      const file = event.target.files?.[0];
      if (!file) return;
      const body = new FormData();
      body.append('logo', file);
      await this._logoCall('POST', variant, body, 'logoSaved');
      event.target.value = '';
    },

    async removeLogo(variant = '') {
      await this._logoCall('DELETE', variant, undefined, 'logoRemoved');
    },

    async _logoCall(method, variant, body, done) {
      this.logoMessage = null;
      try {
        const query = variant ? `?variant=${variant}` : '';
        const saved = await call(`/organizer/api/series/${this.currentId}/logo${query}`, method, body);
        Object.assign(this.current(), saved);
        this.logoMessage = { key: done, ok: true };
      } catch (error) {
        this.logoMessage = { key: error instanceof CallError ? error.key : 'errSave' };
      }
    },
  };
}
