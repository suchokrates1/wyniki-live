// The organizer's side in the site's seven languages: texts, plurals and which language to use.

import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, resolveLocale } from '../../i18n/locale.js';
import de from './de.js';
import en from './en.js';
import es from './es.js';
import fr from './fr.js';
import it from './it.js';
import lt from './lt.js';
import pl from './pl.js';

export const TEXTS = { pl, en, de, it, es, fr, lt };
export const FALLBACK = 'en';
export const STORAGE_KEY = 'organizer-lang';

/** [{code, label}] in the site's order, each language named in itself. */
export const LANGUAGES = SUPPORTED_LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] }));

export function supported(code) {
  return Object.prototype.hasOwnProperty.call(TEXTS, code) ? code : '';
}

function fill(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/** The text for a key; English when a language lacks it, the key itself as the last resort. */
export function translate(lang, key, vars) {
  const value = TEXTS[lang]?.[key] ?? TEXTS[FALLBACK][key];
  if (value === undefined) return key;
  if (typeof value === 'object') return plural(lang, key, vars?.n ?? 0, vars);
  return fill(value, vars);
}

/** A counted text: the language's own plural rules pick the form. */
export function plural(lang, key, n, vars = {}) {
  const forms = TEXTS[lang]?.[key] ?? TEXTS[FALLBACK][key];
  if (!forms || typeof forms !== 'object') return translate(lang, key, { ...vars, n });
  const form = new Intl.PluralRules(resolveLocale(lang)).select(Number(n));
  return fill(forms[form] ?? forms.other, { ...vars, n });
}

/** ?lang=, then what this browser chose before, then the browser's language, then English. */
export function pickLanguage({ search = '', stored = '', navigatorLanguages = [] } = {}) {
  const fromQuery = supported(new URLSearchParams(search).get('lang') || '');
  if (fromQuery) return fromQuery;
  if (supported(stored)) return stored;
  for (const tag of navigatorLanguages) {
    const code = supported(String(tag || '').slice(0, 2).toLowerCase());
    if (code) return code;
  }
  return FALLBACK;
}

export function rememberLanguage(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* private mode */ }
}

export function storedLanguage() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

/** A date as the language writes it: 31.10.2027, 31/10/2027, 2027-10-31. */
export function formatDate(lang, iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  if (!d) return iso;
  if (lang === 'lt') return `${y}-${m}-${d}`;
  return ['pl', 'de'].includes(lang) ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
}
