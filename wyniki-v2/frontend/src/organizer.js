import Alpine from 'alpinejs';
import './styles/fonts.css';
import './styles/admin.css';
import './styles/admin-list.css';
import './styles/admin-forms.css';
import './styles/organizer.css';
import { ORGANIZER_TOKEN_KEY, dateRange, organizerLoginUrl, tierLabel } from './organizer/route.js';
import { storageGet } from './shared/signInForm.js';

const ROLE_LABELS = { owner: 'właściciel', editor: 'edytor' };

function here() {
  return window.location.pathname + window.location.hash;
}

function toSignIn(reason) {
  try { sessionStorage.removeItem(ORGANIZER_TOKEN_KEY); } catch { /* private mode */ }
  window.location.replace(organizerLoginUrl({ next: reason === 'out' ? '' : here(), reason }));
}

/** Every organizer call carries the session; a 401 sends the person back to sign in. */
export async function organizerFetch(url, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${storageGet(ORGANIZER_TOKEN_KEY) || ''}`);
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401) toSignIn('expired');
  return response;
}

Alpine.data('organizerApp', () => ({
  loading: true,
  error: '',
  account: null,
  seriesList: [],
  currentId: null,

  async init() {
    try {
      const response = await organizerFetch('/organizer/api/me');
      if (response.status === 401) return;
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      this.account = data.account;
      this.seriesList = data.series || [];
      const fromHash = this.seriesList.find((item) => `#/${item.slug}` === window.location.hash);
      this.currentId = (fromHash || this.seriesList[0])?.id ?? null;
      this.keepSeriesInAddress();
    } catch {
      this.error = 'Nie udało się wczytać panelu. Odśwież stronę.';
    } finally {
      this.loading = false;
    }
    this.$watch('currentId', () => this.keepSeriesInAddress());
  },

  keepSeriesInAddress() {
    const item = this.current();
    if (item) history.replaceState(null, '', `#/${item.slug}`);
  },

  current() {
    return this.seriesList.find((item) => item.id === this.currentId) || null;
  },

  tournamentCountText() {
    const count = this.current()?.tournaments.length || 0;
    if (count === 1) return '1 turniej';
    const lastTwo = count % 100;
    const few = count % 10 >= 2 && count % 10 <= 4 && (lastTwo < 12 || lastTwo > 14);
    return `${count} ${few ? 'turnieje' : 'turniejów'}`;
  },

  roleLabel(role) {
    return ROLE_LABELS[role] || role;
  },

  tierLabel,
  dateRange,

  signOut() {
    toSignIn('out');
  },
}));

// Without a session the sign-in page takes over; the head script usually got there first.
if (storageGet(ORGANIZER_TOKEN_KEY)) Alpine.start();
else toSignIn('');
