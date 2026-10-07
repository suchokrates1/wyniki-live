import './styles/fonts.css';
import './styles/admin-login.css';
import { LANGUAGES, pickLanguage, rememberChoice, rememberLanguage, storedLanguage, supported, translate } from './organizer/i18n/index.js';
import { ORGANIZER_TOKEN_KEY, safeOrganizerNext } from './organizer/route.js';
import { showNotice, storageGet, storageSet, wireCapsLock, wirePasswordEyes, wireSignInForm } from './shared/signInForm.js';

// One page, two jobs: sign in with e-mail and password, or, from an invitation link
// (/organizer/invite?token=…), set the password and go straight in. In the person's language:
// the invitation's, else ?lang=, else what this browser chose before, else the browser's.

const NOTICES = { expired: ['noticeExpired', 'warn'], out: ['noticeOut', ''] };
const SUBMIT = { login: 'signIn', invite: 'inviteSubmit', forgot: 'forgotSubmit' };
const BUSY = { login: 'signingIn', invite: 'saving', forgot: 'sending' };

const params = new URLSearchParams(window.location.search);
const next = safeOrganizerNext(params.get('next'));
const inviteToken = params.get('token') || '';

const $ = (id) => document.getElementById(id);
const email = $('organizerEmail');
const password = $('organizerPassword');
const repeat = $('organizerRepeat');
const notice = $('organizerNotice');
const button = $('organizerSubmit');
const languageSelect = $('organizerLang');

let lang = pickLanguage({ search: window.location.search, stored: storedLanguage(), navigatorLanguages: navigator.languages || [] });
let contact = 'organizers@blindtennis.app';
let mode = 'login';
let minLength = 10;
let invite = null;
let noticeState = null;

const t = (key, vars) => translate(lang, key, vars);

/** Puts every text of the page in the current language; states (invite, notice) included. */
function render() {
  document.documentElement.lang = lang;
  document.title = t('pageTitleLogin');
  document.querySelectorAll('[data-t]').forEach((node) => { node.textContent = t(node.dataset.t); });
  document.querySelectorAll('[data-t-aria]').forEach((node) => node.setAttribute('aria-label', t(node.dataset.tAria)));
  document.querySelectorAll('.adl-eye').forEach((eye) => eye.setAttribute('aria-label', t(eye.getAttribute('aria-pressed') === 'true' ? 'hidePassword' : 'showPassword')));
  $('organizerPrivacy').href = `/privacy?lang=${lang}`;
  $('organizerPasswordBlock').hidden = mode === 'forgot';
  $('organizerForgot').hidden = mode !== 'login';
  $('organizerBack').hidden = mode !== 'forgot';
  if (mode === 'forgot') {
    $('organizerTitle').textContent = t('forgotTitle');
    $('organizerLead').textContent = t('forgotLead');
  }
  if (mode === 'invite') {
    $('organizerTitle').textContent = t('inviteTitle');
    $('organizerLead').textContent = t('inviteLead', { series: invite.series.join(', '), n: minLength });
    $('organizerPasswordLabel').textContent = t('newPassword');
  }
  button.textContent = t(SUBMIT[mode]);
  if (noticeState) showNotice(notice, t(noticeState.key, { contact }), noticeState.tone);
}

function setLanguage(code, { chosen = true } = {}) {
  lang = supported(code) || lang;
  rememberLanguage(lang);
  if (chosen) rememberChoice(lang);
  languageSelect.value = lang;
  render();
}

languageSelect.innerHTML = LANGUAGES.map(({ code, label }) => `<option value="${code}" lang="${code}">${label}</option>`).join('');
languageSelect.value = lang;
languageSelect.addEventListener('change', () => setLanguage(languageSelect.value));

wirePasswordEyes(document, (shown) => t(shown ? 'hidePassword' : 'showPassword'));
wireCapsLock([password, repeat], $('organizerCaps'));

function enter(token) {
  storageSet(ORGANIZER_TOKEN_KEY, token);
  window.location.replace(next);
}

const form = wireSignInForm({
  form: $('organizerForm'),
  fields: [email, password, repeat],
  error: $('organizerError'),
  notice,
  button,
  get label() { return t(SUBMIT[mode]); },
  get busyLabel() { return t(BUSY[mode]); },
  get offline() { return t('errConnection'); },
  validate() {
    if (mode === 'forgot') return email.value.trim() ? null : { message: t('errEnterEmail'), field: email };
    if (mode === 'login') {
      if (!email.value.trim()) return { message: t('errEnterEmail'), field: email };
      if (!password.value) return { message: t('errEnterPassword'), field: password };
      return null;
    }
    if (password.value.length < minLength) return { message: t('errTooShort', { n: minLength }), field: password };
    if (password.value !== repeat.value) return { message: t('errMismatch'), field: repeat };
    return null;
  },
  async submit() {
    if (mode === 'forgot') return askForLink();
    const inviting = mode === 'invite';
    const response = await fetch(inviting ? `/organizer/api/invite/${encodeURIComponent(inviteToken)}` : '/organizer/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviting ? { password: password.value } : { email: email.value.trim(), password: password.value }),
    });
    if (response.ok) {
      enter((await response.json()).token);
      return '';
    }
    if (response.status === 429) return t('errThrottled');
    if (response.status === 410) return t('errLinkSpent', { contact });
    return t(inviting ? 'errSetFailed' : 'errBadLogin');
  },
});

async function askForLink() {
  const response = await fetch('/organizer/api/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.value.trim() }),
  });
  if (response.status === 429) return t('errThrottled');
  if (!response.ok) return t('errConnection');
  noticeState = { key: 'forgotSent', tone: '' };
  render();
  return '';
}

function setMode(next) {
  mode = next;
  noticeState = null;
  notice.hidden = true;
  render();
  email.focus();
}

$('organizerForgot').addEventListener('click', () => setMode('forgot'));
$('organizerBack').addEventListener('click', () => setMode('login'));

async function loadContact() {
  try {
    const body = await fetch('/organizer/api/contact').then((response) => response.json());
    contact = body.contact_email || contact;
  } catch { /* the default address stands */ }
}

async function startInvite() {
  // the token stays in memory; the address bar and history keep no copy of it
  history.replaceState(null, '', '/organizer/invite');
  try {
    const response = await fetch(`/organizer/api/invite/${encodeURIComponent(inviteToken)}`);
    if (response.ok) invite = await response.json();
  } catch { /* shown below */ }
  if (!invite) {
    noticeState = { key: 'inviteSpentNotice', tone: 'warn' };
    render();
    return;
  }
  mode = 'invite';
  minLength = invite.min_length || minLength;
  email.value = invite.email;
  email.readOnly = true;
  password.autocomplete = 'new-password';
  $('organizerRepeatBlock').hidden = false;
  $('organizerFoot').hidden = true;
  // the invitation names the person's language; their own choice on this page still wins
  if (!params.get('lang') && supported(invite.language)) setLanguage(invite.language, { chosen: false });
  else render();
  password.focus();
}

// a link from a mail names its language: the panel will follow it after sign-in
if (supported(params.get('lang') || '')) rememberChoice(lang);
render();
loadContact().then(render);
if (inviteToken) {
  startInvite();
} else {
  // Already signed in on this tab: straight on. A stale token comes back here as "expired".
  if (storageGet(ORGANIZER_TOKEN_KEY)) window.location.replace(next);
  const [key, tone] = NOTICES[params.get('reason')] || [];
  if (key) {
    noticeState = { key, tone };
    render();
  }
}

export { form };
