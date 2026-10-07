import './styles/fonts.css';
import './styles/admin-login.css';
import { ORGANIZER_TOKEN_KEY, safeOrganizerNext } from './organizer/route.js';
import { showNotice, storageGet, storageSet, wireCapsLock, wirePasswordEyes, wireSignInForm } from './shared/signInForm.js';

// One page, two jobs: sign in with e-mail and password, or, from an invitation link
// (/organizer/invite?token=…), set the password and go straight in.

const NOTICES = {
  expired: ['Sesja wygasła. Zaloguj się ponownie.', 'warn'],
  out: ['Wylogowano z tego urządzenia.', ''],
};

const params = new URLSearchParams(window.location.search);
const next = safeOrganizerNext(params.get('next'));
const inviteToken = params.get('token') || '';

const $ = (id) => document.getElementById(id);
const email = $('organizerEmail');
const password = $('organizerPassword');
const repeat = $('organizerRepeat');
const notice = $('organizerNotice');
const button = $('organizerSubmit');

wirePasswordEyes();
wireCapsLock([password, repeat], $('organizerCaps'));

function enter(token) {
  storageSet(ORGANIZER_TOKEN_KEY, token);
  window.location.replace(next);
}

let mode = 'login';
let minLength = 10;

const form = wireSignInForm({
  form: $('organizerForm'),
  fields: [email, password, repeat],
  error: $('organizerError'),
  notice,
  button,
  get label() { return mode === 'invite' ? 'Ustaw hasło i wejdź' : 'Zaloguj'; },
  get busyLabel() { return mode === 'invite' ? 'Zapisywanie…' : 'Logowanie…'; },
  validate() {
    if (mode === 'login') {
      if (!email.value.trim()) return { message: 'Wpisz adres e-mail.', field: email };
      if (!password.value) return { message: 'Wpisz hasło.', field: password };
      return null;
    }
    if (password.value.length < minLength) return { message: `Hasło musi mieć co najmniej ${minLength} znaków.`, field: password };
    if (password.value !== repeat.value) return { message: 'Hasła się różnią.', field: repeat };
    return null;
  },
  async submit() {
    const invite = mode === 'invite';
    const response = await fetch(invite ? `/organizer/api/invite/${encodeURIComponent(inviteToken)}` : '/organizer/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invite ? { password: password.value } : { email: email.value.trim(), password: password.value }),
    });
    if (response.ok) {
      enter((await response.json()).token);
      return '';
    }
    if (response.status === 429) return 'Za dużo nieudanych prób. Spróbuj ponownie za kwadrans.';
    if (response.status === 410) return 'Ten link wygasł albo został już użyty. Poproś o nowy: contact@blindtennis.app.';
    return invite ? 'Nie udało się ustawić hasła.' : 'Nieprawidłowy e-mail lub hasło.';
  },
});

async function startInvite() {
  // the token stays in memory; the address bar and history keep no copy of it
  history.replaceState(null, '', '/organizer/invite');
  let info = null;
  try {
    const response = await fetch(`/organizer/api/invite/${encodeURIComponent(inviteToken)}`);
    if (response.ok) info = await response.json();
  } catch { /* shown below */ }
  if (!info) {
    showNotice(notice, 'Ten link wygasł albo został już użyty. Zaloguj się albo poproś o nowy link: contact@blindtennis.app.', 'warn');
    return;
  }
  mode = 'invite';
  minLength = info.min_length || minLength;
  $('organizerTitle').textContent = 'Ustaw hasło';
  $('organizerLead').textContent = `${info.series.join(', ') || 'Panel organizatora'}. Hasło: co najmniej ${minLength} znaków.`;
  email.value = info.email;
  email.readOnly = true;
  password.autocomplete = 'new-password';
  $('organizerPasswordLabel').textContent = 'Nowe hasło';
  $('organizerRepeatBlock').hidden = false;
  $('organizerFoot').hidden = true;
  button.textContent = 'Ustaw hasło i wejdź';
  password.focus();
}

if (inviteToken) {
  startInvite();
} else {
  // Already signed in on this tab: straight on. A stale token comes back here as "expired".
  if (storageGet(ORGANIZER_TOKEN_KEY)) window.location.replace(next);
  showNotice(notice, ...(NOTICES[params.get('reason')] || []));
}

export { form };
