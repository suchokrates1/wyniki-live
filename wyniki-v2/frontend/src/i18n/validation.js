function collectLeafKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];

  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return collectLeafKeys(child, path);
  });
}

function hasPath(value, path) {
  return path.split('.').every((key) => {
    if (!value || typeof value !== 'object' || !(key in value)) return false;
    value = value[key];
    return true;
  });
}

export function findMissingTranslationKeys(translations, languages, baseLang = 'pl') {
  const base = translations?.[baseLang] || {};
  const baseKeys = collectLeafKeys(base).filter(Boolean);

  return (languages || [])
    .filter((lang) => lang !== baseLang)
    .flatMap((lang) => {
      const translation = translations?.[lang] || {};
      return baseKeys
        .filter((key) => !hasPath(translation, key))
        .map((key) => ({ lang, key }));
    });
}

export function warnMissingTranslationKeys(translations, languages, baseLang = 'pl') {
  const missing = findMissingTranslationKeys(translations, languages, baseLang);
  if (missing.length) {
    console.warn('[i18n] Missing translation keys:', missing);
  }
  return missing;
}