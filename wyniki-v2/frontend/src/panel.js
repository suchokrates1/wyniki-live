import './styles/fonts.css';
import './styles/admin-login.css';
import './styles/panel.css';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from './i18n/locale.js';
import { PANEL_TEXTS } from './panel/texts.js';
import { STORAGE_KEY, doorLinks, pickPanelLanguage } from './panel/doors.js';

// The doors page: the same language as the public site (?lang=, then the site's saved choice),
// and every door keeps it.

function saved() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

function render(lang) {
  const texts = PANEL_TEXTS[lang];
  document.documentElement.lang = lang;
  document.title = texts.pageTitle;
  document.querySelectorAll('[data-t]').forEach((node) => { node.textContent = texts[node.dataset.t] ?? ''; });
  document.querySelectorAll('[data-t-aria]').forEach((node) => node.setAttribute('aria-label', texts[node.dataset.tAria] ?? ''));
  for (const [id, href] of Object.entries(doorLinks(lang))) document.getElementById(id)?.setAttribute('href', href);
}

if (typeof document !== 'undefined') {
  const select = document.getElementById('panelLang');
  let lang = pickPanelLanguage(window.location.search, saved(), navigator.languages || []);
  select.innerHTML = SUPPORTED_LANGUAGES.map((code) => `<option value="${code}" lang="${code}">${LANGUAGE_LABELS[code]}</option>`).join('');
  select.value = lang;
  select.addEventListener('change', () => {
    lang = select.value;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
    render(lang);
  });
  render(lang);
}
