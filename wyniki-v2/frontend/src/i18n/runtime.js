export function mergeTranslations(base, patch) {
  const result = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && result[key]
      && typeof result[key] === 'object'
      && !Array.isArray(result[key])
    ) {
      result[key] = mergeTranslations(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function applyTranslationPatches(translations, patches) {
  Object.entries(patches || {}).forEach(([lang, patch]) => {
    translations[lang] = mergeTranslations(translations[lang], patch);
  });
  return translations;
}

export function lookupTranslation(translations, lang, fallbackLang = 'pl') {
  return translations[lang] || translations[fallbackLang];
}