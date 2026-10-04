import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../src/i18n/locale.js';
import { applyTranslationPatches } from '../src/i18n/runtime.js';
import { TRANSLATIONS, TRANSLATION_PATCHES } from '../src/i18n/translations.js';
import { OFFICE_TRANSLATION_PATCHES } from '../src/i18n/officeTranslations.js';
import { findMissingTranslationKeys } from '../src/i18n/validation.js';
import { findUnusedKeys } from '../src/i18n/usage.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));

/** Every file that can read a text: the pages and the code under src, translations aside. */
function sourceText() {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (['node_modules', 'dist', 'i18n'].includes(name)) return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  const pages = readdirSync(FRONTEND).filter((name) => name.endsWith('.html')).map((name) => join(FRONTEND, name));
  return [...walk(join(FRONTEND, 'src')), ...pages]
    .filter((path) => ['.js', '.mjs', '.html'].includes(extname(path)) && !path.endsWith('.test.js'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
}

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
// A text nobody reads still costs seven translations to keep up; the base language is enough to find it.
const unusedKeys = findUnusedKeys(TRANSLATIONS[DEFAULT_LANGUAGE], sourceText());

if (missingLanguages.length || missingKeys.length || emptyValues.length || unusedKeys.length) {
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
  if (unusedKeys.length) {
    console.error('Translation keys no page reads (remove them from every language):');
    for (const key of unusedKeys) console.error(`- ${key}`);
  }
  process.exit(1);
}

console.log(`i18n OK for ${SUPPORTED_LANGUAGES.length} languages.`);