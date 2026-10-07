import './styles/fonts.css';
import './styles/admin-login.css';
import { ADMIN_TOKEN_KEY } from './admin/auth.js';
import { safeAdminNext } from './admin/loginRoute.js';
import { showNotice, storageGet, storageSet, wireCapsLock, wirePasswordEyes, wireSignInForm } from './shared/signInForm.js';

const NOTICES = {
  expired: ['Sesja administratora wygasła. Zaloguj się ponownie.', 'warn'],
  out: ['Wylogowano z tego urządzenia.', ''],
};

const params = new URLSearchParams(window.location.search);
const next = safeAdminNext(params.get('next'));

// Already signed in on this tab: straight on. A stale token comes back here as "expired".
if (storageGet(ADMIN_TOKEN_KEY)) window.location.replace(next);

const input = document.getElementById('adminPassword');
const notice = document.getElementById('adminLoginNotice');
showNotice(notice, ...(NOTICES[params.get('reason')] || []));
wirePasswordEyes();
wireCapsLock([input], document.getElementById('adminLoginCaps'));

wireSignInForm({
  form: document.getElementById('adminLoginForm'),
  fields: [input],
  error: document.getElementById('adminLoginError'),
  notice,
  button: document.getElementById('adminLoginSubmit'),
  label: 'Zaloguj',
  busyLabel: 'Logowanie…',
  validate: () => (input.value ? null : { message: 'Wpisz hasło.', field: input }),
  async submit() {
    const response = await fetch('/admin/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    });
    if (response.ok) {
      storageSet(ADMIN_TOKEN_KEY, (await response.json()).token);
      window.location.replace(next);
      return '';
    }
    if (response.status === 429) return 'Za dużo nieudanych prób. Odczekaj 15 minut i spróbuj ponownie.';
    return response.status === 503
      ? 'Panel administratora nie jest skonfigurowany na tym serwerze.'
      : 'Nieprawidłowe hasło administratora.';
  },
});
