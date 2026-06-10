import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../src/i18n/locale.js';
import { applyTranslationPatches } from '../src/i18n/runtime.js';
import { TRANSLATIONS, TRANSLATION_PATCHES } from '../src/i18n/translations.js';
import { OFFICE_TRANSLATION_PATCHES } from '../src/i18n/officeTranslations.js';
import { findMissingTranslationKeys } from '../src/i18n/validation.js';

function collectEmptyLeaves(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return typeof value === 'string' && !value.trim() ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return collectEmptyLeaves(child, path);
  });
}

applyTranslationPatches(TRANSLATIONS, TRANSLATION_PATCHES);
applyTranslationPatches(TRANSLATIONS, OFFICE_TRANSLATION_PATCHES);

const missingLanguages = SUPPORTED_LANGUAGES.filter((lang) => !TRANSLATIONS[lang]);
const missingKeys = findMissingTranslationKeys(TRANSLATIONS, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE);
const emptyValues = SUPPORTED_LANGUAGES.flatMap((lang) => (
  collectEmptyLeaves(TRANSLATIONS[lang]).map((key) => ({ lang, key }))
));

if (missingLanguages.length || missingKeys.length || emptyValues.length) {
  if (missingLanguages.length) {
    console.error('Missing language tables:');
    for (const lang of missingLanguages) console.error(`- ${lang}`);
  }
  if (missingKeys.length) {
    console.error('Missing translation keys:');
    for (const { lang, key } of missingKeys) console.error(`- ${lang}: ${key}`);
  }
  if (emptyValues.length) {
    console.error('Empty translation values:');
    for (const { lang, key } of emptyValues) console.error(`- ${lang}: ${key}`);
  }
  process.exit(1);
}

console.log(`i18n OK for ${SUPPORTED_LANGUAGES.length} languages.`);