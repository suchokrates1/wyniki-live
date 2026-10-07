import './styles/fonts.css';
import './styles/admin-login.css';
import { ADMIN_TOKEN_KEY } from './admin/auth.js';
import { safeAdminNext } from './admin/loginRoute.js';
import { showNotice, storageGet, storageSet, wireCapsLock, wirePasswordEyes, wireSignInForm } from './shared/signInForm.js';

// One page, three jobs: sign in with e-mail and password; from a mailed link
// (/admin/invite?token=…) set the password and go straight in; ask for that link.

const NOTICES = {
  expired: ['Sesja administratora wygasła. Zaloguj się ponownie.', 'warn'],
  out: ['Wylogowano z tego urządzenia.', ''],
};
const MODES = {
  login: { title: 'Panel administratora', lead: 'Zaloguj się adresem e-mail i hasłem.', submit: 'Zaloguj', busy: 'Logowanie…' },
  invite: { title: 'Ustaw hasło', lead: '', submit: 'Ustaw hasło i wejdź', busy: 'Zapisywanie…' },
  forgot: { title: 'Nowe hasło', lead: 'Podaj adres e-mail konta administratora. Wyślemy na niego link do ustawienia nowego hasła.', submit: 'Wyślij link', busy: 'Wysyłanie…' },
};
const SENT = 'Jeśli to adres administratora, za chwilę przyjdzie mail z linkiem.';

const params = new URLSearchParams(window.location.search);
const next = safeAdminNext(params.get('next'));
const inviteToken = params.get('token') || '';

const $ = (id) => document.getElementById(id);
const email = $('adminEmail');
const password = $('adminPassword');
const repeat = $('adminRepeat');
const notice = $('adminLoginNotice');
const button = $('adminLoginSubmit');

let mode = 'login';
let minLength = 10;

function render() {
  const texts = MODES[mode];
  $('adminTitle').textContent = texts.title;
  $('adminLead').textContent = mode === 'invite'
    ? `Konto: ${email.value}. Hasło ma mieć co najmniej ${minLength} znaków.`
    : texts.lead;
  $('adminPasswordBlock').hidden = mode === 'forgot';
  $('adminRepeatBlock').hidden = mode !== 'invite';
  $('adminPasswordLabel').textContent = mode === 'invite' ? 'Nowe hasło' : 'Hasło';
  $('adminForgot').hidden = mode !== 'login';
  $('adminBack').hidden = mode !== 'forgot';
  button.textContent = texts.submit;
}

function setMode(nextMode) {
  mode = nextMode;
  notice.hidden = true;
  render();
  email.focus();
}

wirePasswordEyes();
wireCapsLock([password, repeat], $('adminLoginCaps'));
$('adminForgot').addEventListener('click', () => setMode('forgot'));
$('adminBack').addEventListener('click', () => setMode('login'));

function enter(token) {
  storageSet(ADMIN_TOKEN_KEY, token);
  window.location.replace(next);
}

async function post(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

wireSignInForm({
  form: $('adminLoginForm'),
  fields: [email, password, repeat],
  error: $('adminLoginError'),
  notice,
  button,
  get label() { return MODES[mode].submit; },
  get busyLabel() { return MODES[mode].busy; },
  validate() {
    if (mode === 'invite') {
      if (password.value.length < minLength) return { message: `Hasło ma mieć co najmniej ${minLength} znaków.`, field: password };
      if (password.value !== repeat.value) return { message: 'Hasła się różnią.', field: repeat };
      return null;
    }
    if (!email.value.trim()) return { message: 'Wpisz adres e-mail.', field: email };
    if (mode === 'login' && !password.value) return { message: 'Wpisz hasło.', field: password };
    return null;
  },
  async submit() {
    if (mode === 'forgot') {
      const response = await post('/admin/api/forgot', { email: email.value.trim() });
      if (response.status === 429) return 'Za dużo prób. Odczekaj 15 minut i spróbuj ponownie.';
      showNotice(notice, SENT, '');
      return '';
    }
    if (mode === 'invite') {
      const response = await post(`/admin/api/invite/${encodeURIComponent(inviteToken)}`, { password: password.value });
      if (response.ok) {
        enter((await response.json()).token);
        return '';
      }
      return response.status === 410 ? 'Ten link już nie działa. Poproś o nowy.' : 'Nie udało się ustawić hasła. Spróbuj ponownie.';
    }
    const response = await post('/admin/api/auth', { email: email.value.trim(), password: password.value });
    if (response.ok) {
      enter((await response.json()).token);
      return '';
    }
    if (response.status === 429) return 'Za dużo nieudanych prób. Odczekaj 15 minut i spróbuj ponownie.';
    return response.status === 503
      ? 'Panel administratora nie jest skonfigurowany na tym serwerze.'
      : 'Nieprawidłowy e-mail lub hasło.';
  },
});

async function startInvite() {
  // the token stays in memory; the address bar and history keep no copy of it
  history.replaceState(null, '', '/admin/invite');
  let invite = null;
  try {
    const response = await fetch(`/admin/api/invite/${encodeURIComponent(inviteToken)}`);
    if (response.ok) invite = await response.json();
  } catch { /* shown below */ }
  if (!invite) {
    showNotice(notice, 'Ten link już nie działa albo został użyty. Zaloguj się albo poproś o nowy („Nie pamiętasz hasła?”).', 'warn');
    return;
  }
  mode = 'invite';
  minLength = invite.min_length || minLength;
  email.value = invite.email;
  email.readOnly = true;
  password.autocomplete = 'new-password';
  render();
  password.focus();
}

render();
if (inviteToken) {
  startInvite();
} else {
  // Already signed in on this tab: straight on. A stale token comes back here as "expired".
  if (storageGet(ADMIN_TOKEN_KEY)) window.location.replace(next);
  showNotice(notice, ...(NOTICES[params.get('reason')] || []));
}
