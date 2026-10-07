// Which language the doors page speaks, and where its links lead (each keeps the language).

import { PANEL_TEXTS } from './texts.js';

export const STORAGE_KEY = 'lang';

export function pickPanelLanguage(search, saved, browserLanguages = []) {
  const ok = (code) => (Object.prototype.hasOwnProperty.call(PANEL_TEXTS, code) ? code : '');
  const fromQuery = ok(new URLSearchParams(search).get('lang') || '');
  if (fromQuery) return fromQuery;
  if (ok(saved || '')) return saved;
  for (const tag of browserLanguages) {
    const code = ok(String(tag || '').slice(0, 2).toLowerCase());
    if (code) return code;
  }
  return 'en';
}

/** The page's links, each carrying the language. */
export function doorLinks(lang) {
  return {
    panelOffice: `/office?lang=${lang}`,
    panelOrganizer: `/organizer/login?lang=${lang}`,
    panelBack: `/?lang=${lang}`,
    panelHome: `/?lang=${lang}`,
    panelPrivacy: `/privacy?lang=${lang}`,
  };
}
