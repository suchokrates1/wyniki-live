// Counted words in the page's language: "1 mecz", "3 mecze", "5 meczów"; "34 lata".
// Each language gives its forms by the plural category Intl.PluralRules picks (one, few, many,
// other), with {n} where the number goes; a missing form falls back to "other".

import { resolveLocale } from '../i18n/locale.js';

/** The forms a language may give; Intl.PluralRules names the one a count takes. */
export const PLURAL_FORMS = ['one', 'few', 'many', 'other'];

const rulesByLang = new Map();

function rules(lang) {
  if (!rulesByLang.has(lang)) rulesByLang.set(lang, new Intl.PluralRules(resolveLocale(lang)));
  return rulesByLang.get(lang);
}

/** "3 mecze" — the form for n, with the number in it. */
export function countedText(lang, forms, n) {
  const count = Number(n) || 0;
  const form = forms?.[rules(lang).select(count)] ?? forms?.other ?? '{n}';
  return String(form).replace('{n}', String(count));
}

/** "mecze" — the same form without the number, for a label beside a number shown on its own. */
export function countedWord(lang, forms, n) {
  return countedText(lang, forms, n).replace(String(Number(n) || 0), '').trim();
}

/** A country's name in the page's language ("Polska" for PL); the code when the browser has none. */
export function countryName(lang, code) {
  const value = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return value;
  try {
    return new Intl.DisplayNames([resolveLocale(lang)], { type: 'region' }).of(value) || value;
  } catch {
    return value;
  }
}
