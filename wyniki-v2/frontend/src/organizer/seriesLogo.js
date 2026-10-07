// The series' logo: the people of the series put it up or take it down; it shows in the
// panel's header and next to the series' tournaments on the public page.

import { call, CallError } from './api.js';

export function createSeriesLogoView() {
  return {
    logoMessage: null,

    async uploadLogo(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      const body = new FormData();
      body.append('logo', file);
      await this._logoCall('POST', body, 'logoSaved');
      event.target.value = '';
    },

    async removeLogo() {
      await this._logoCall('DELETE', undefined, 'logoRemoved');
    },

    async _logoCall(method, body, done) {
      this.logoMessage = null;
      try {
        const { logo_path: path } = await call(`/organizer/api/series/${this.currentId}/logo`, method, body);
        this.current().logo_path = path;
        this.logoMessage = { key: done, ok: true };
      } catch (error) {
        this.logoMessage = { key: error instanceof CallError ? error.key : 'errSave' };
      }
    },
  };
}
