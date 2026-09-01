export const THEMES = Object.freeze(['system', 'light', 'dark']);
const THEME_KEY = 'umpire.app_theme';

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system';
}

export function readTheme(store = globalThis.localStorage) {
  try {
    return normalizeTheme(store?.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

export function saveTheme(theme, store = globalThis.localStorage) {
  const next = normalizeTheme(theme);
  store?.setItem(THEME_KEY, next);
  return next;
}

export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return;
  root.dataset.theme = normalizeTheme(theme);
}
