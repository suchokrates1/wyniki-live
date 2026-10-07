import './styles/fonts.css';
import './styles/admin-login.css';
import { ADMIN_TOKEN_KEY } from './admin/auth.js';
import { safeAdminNext } from './admin/loginRoute.js';

const NOTICES = {
  expired: 'Sesja administratora wygasła. Zaloguj się ponownie.',
  out: 'Wylogowano z tego urządzenia.',
};

const params = new URLSearchParams(window.location.search);
const next = safeAdminNext(params.get('next'));

function readToken() {
  try { return sessionStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
}

// Already signed in on this tab: straight on. A stale token comes back here as "expired".
if (readToken()) window.location.replace(next);

const form = document.getElementById('adminLoginForm');
const input = document.getElementById('adminPassword');
const toggle = document.getElementById('adminPasswordToggle');
const submit = document.getElementById('adminLoginSubmit');
const notice = document.getElementById('adminLoginNotice');
const error = document.getElementById('adminLoginError');
const caps = document.getElementById('adminLoginCaps');

const reason = NOTICES[params.get('reason')];
if (reason) {
  notice.textContent = reason;
  notice.classList.toggle('is-warn', params.get('reason') === 'expired');
  notice.hidden = false;
}

function showError(message) {
  error.textContent = message;
  error.hidden = !message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

toggle.addEventListener('click', () => {
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  toggle.setAttribute('aria-pressed', String(visible));
  toggle.setAttribute('aria-label', visible ? 'Ukryj hasło' : 'Pokaż hasło');
  input.focus();
});

const watchCaps = (event) => {
  if (typeof event.getModifierState === 'function') caps.hidden = !event.getModifierState('CapsLock');
};
input.addEventListener('keydown', watchCaps);
input.addEventListener('keyup', watchCaps);
input.addEventListener('input', () => { if (!error.hidden) showError(''); });

function busy(on) {
  submit.disabled = on;
  submit.textContent = on ? 'Logowanie…' : 'Zaloguj';
  form.setAttribute('aria-busy', String(on));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!input.value) {
    showError('Wpisz hasło.');
    input.focus();
    return;
  }
  showError('');
  notice.hidden = true;
  busy(true);
  try {
    const response = await fetch('/admin/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    });
    if (response.ok) {
      const payload = await response.json();
      sessionStorage.setItem(ADMIN_TOKEN_KEY, payload.token);
      window.location.replace(next);
      return;
    }
    showError(response.status === 503
      ? 'Panel administratora nie jest skonfigurowany na tym serwerze.'
      : 'Nieprawidłowe hasło administratora.');
  } catch {
    showError('Brak połączenia z serwerem. Spróbuj ponownie.');
  }
  busy(false);
  input.select();
  input.focus();
});
