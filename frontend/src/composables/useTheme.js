// Theme Management
export function useTheme() {
  const THEME_KEY = 'tennis-theme';

  function init() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(theme);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    const current = localStorage.getItem(THEME_KEY) || 'light';
    const newTheme = current === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    return newTheme;
  }

  function getCurrentTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
  }

  return { init, setTheme, toggleTheme, getCurrentTheme };
}
