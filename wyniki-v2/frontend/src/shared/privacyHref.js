export function privacyHref(lang = 'pl', hash = '') {
  const url = `/privacy?lang=${encodeURIComponent(lang || 'pl')}`;
  return hash ? `${url}#${hash}` : url;
}
