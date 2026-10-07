/** The "Nowy turniej" dialog: which fields it asks for and when it may be submitted. */

import { TOURNAMENT_FLAGS } from './tournamentSettings.js';

export const CREATE_FIELDS = [
  { key: 'name', label: 'Nazwa turnieju', type: 'text', wide: true, placeholder: 'np. RAKIETY ATNiS VIII' },
  { key: 'start_date', label: 'Data rozpoczęcia', type: 'date' },
  { key: 'end_date', label: 'Data zakończenia', type: 'date' },
  { key: 'city', label: 'Miasto', type: 'text', placeholder: 'Giebułtów' },
  { key: 'country', label: 'Kraj', type: 'text', placeholder: 'PL' },
  { key: 'court_count', label: 'Liczba kortów', type: 'number', min: 1, hint: 'Tyle kortów dostaje PIN-y.' },
  { key: 'report_email', label: 'E-mail raportów', type: 'email', placeholder: 'biuro@klub.pl' },
  { key: 'office_password', label: 'Hasło modułu biura', type: 'password', wide: true, hint: 'Bez niego biuro nie wejdzie do turnieju.' },
];

/** Name and both dates are what the server insists on; the rest can wait. */
export function missingCreateFields(draft = {}) {
  return ['name', 'start_date', 'end_date'].filter((key) => !String(draft[key] || '').trim());
}

export function createFieldsFor(prefix = 'adm-new') {
  return CREATE_FIELDS.map((field) => ({ ...field, id: `${prefix}-${field.key.replace(/_/g, '-')}` }));
}

export function createTournamentDraft() {
  return {
    name: '', start_date: '', end_date: '', city: '', country: '', report_email: '',
    court_count: 1, is_public: true, stats_enabled: true, is_simulation: false,
    access_key: '', office_password: '', logo: null,
  };
}

const focusById = (id) => {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.focus();
};

export function createTournamentCreateView() {
  return {
    tournamentCreateOpen: false,
    tournamentCreateError: '',

    adminCreateFields() {
      return createFieldsFor('adm-new');
    },

    adminCreateFlags() {
      // A brand new tournament is never the active one: it is switched on from the list when ready.
      // It is in no series yet either, so there is no publication to lock.
      return TOURNAMENT_FLAGS.filter((flag) => flag.key !== 'active' && flag.key !== 'visibility_lock');
    },

    openTournamentCreate() {
      this.newTournament = createTournamentDraft();
      this.tournamentCreateError = '';
      this.tournamentCreateOpen = true;
      this.$nextTick(() => focusById('adm-new-name'));
    },

    closeTournamentCreate() {
      this.tournamentCreateOpen = false;
      this.tournamentCreateError = '';
    },

    async submitTournamentCreate() {
      const missing = missingCreateFields(this.newTournament);
      if (missing.length) {
        this.tournamentCreateError = 'Nazwa i obie daty są potrzebne, żeby założyć turniej.';
        focusById(`adm-new-${missing[0].replace(/_/g, '-')}`);
        return;
      }
      this.tournamentCreateError = '';
      const before = (Array.isArray(this.tournaments) ? this.tournaments : []).length;
      await this.createTournament();
      // createTournament() reloads the list; a longer list means the server took it.
      if ((Array.isArray(this.tournaments) ? this.tournaments : []).length !== before) this.closeTournamentCreate();
    },
  };
}
