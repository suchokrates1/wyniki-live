/**
 * One tournament in the organizer's panel: its settings, whether it is live, courts and
 * PINs, the office, overlay links for an outside stream, the categories and the change log.
 */
import { TITLE_SCOPES } from '../admin/tournamentSettings.js';
import { call, CallError } from './api.js';

export const CATEGORY_PRESETS = ['B1K', 'B1M', 'B2K', 'B2M', 'B3K', 'B3M', 'B4K', 'B4M'];
const PRESET_LABELS = { B1K: 'B1 kobiety', B1M: 'B1 mężczyźni', B2K: 'B2 kobiety', B2M: 'B2 mężczyźni', B3K: 'B3 kobiety', B3M: 'B3 mężczyźni', B4K: 'B4 kobiety', B4M: 'B4 mężczyźni' };

const ACTION_LABELS = {
  create: 'założono turniej', update: 'zmieniono ustawienia', set_active: 'zmieniono „Turniej trwa”',
  court_pin: 'zmieniono PIN kortu', office_session: 'otwarto biuro', category_create: 'dodano kategorię',
  categories_confirm: 'dodano kategorie', category_update: 'zmieniono kategorię', category_delete: 'usunięto kategorię',
  entry_add: 'dodano zgłoszenie', entry_update: 'zmieniono zgłoszenie', entry_delete: 'usunięto zgłoszenie',
  entry_bulk: 'zaimportowano zgłoszenia', entry_add_global: 'dodano zawodnika z bazy',
};

export function settingsForm(t = {}) {
  return {
    name: t.name || '', start_date: t.start_date || '', end_date: t.end_date || '',
    city: t.city || '', country: t.country || '', report_email: t.report_email || '',
    court_count: Number(t.court_count || 0), is_public: !!t.is_public, is_simulation: !!t.is_simulation,
    title_scope: t.title_scope || 'open', title_override: t.title_override || '', office_password: '',
  };
}

export function logLine(entry) {
  return ACTION_LABELS[entry?.action] || entry?.action || '';
}

export function createTournamentView() {
  return {
    t: null,
    tForm: settingsForm(),
    tBusy: false,
    tMessage: '',
    tError: '',
    tLog: [],
    tCategories: [],
    tPresetPick: {},
    tCustomCategory: '',
    tCategoryDoubles: false,
    tPins: {},

    titleScopes() { return TITLE_SCOPES; },
    presetLabel(key) { return PRESET_LABELS[key] || key; },
    categoryPresets() { return CATEGORY_PRESETS; },
    logLine,
    logWhen(entry) { return String(entry?.created_at || '').slice(0, 16).replace('T', ' '); },

    async _try(work, success = '') {
      this.tError = '';
      this.tMessage = '';
      try {
        await work();
        if (success) this.tMessage = success;
      } catch (error) {
        this.tError = error instanceof CallError ? error.message : 'Coś poszło nie tak. Odśwież stronę.';
      }
    },

    async loadTournament(id) {
      await this._try(async () => {
        this.t = await call(`/organizer/api/tournaments/${id}`);
        this.tForm = settingsForm(this.t);
        this.tPins = Object.fromEntries(this.t.courts.map((court) => [court.kort_id, court.pin]));
      });
    },

    async saveSettings() {
      await this._try(async () => {
        const body = await call(`/organizer/api/tournaments/${this.t.id}`, 'PUT', this.tForm);
        this.t = body.tournament;
        this.tForm = settingsForm(this.t);
        this.tPins = Object.fromEntries(this.t.courts.map((court) => [court.kort_id, court.pin]));
        await this.reloadSeries();
      }, 'Zapisano.');
    },

    async toggleLive() {
      await this._try(async () => {
        const body = await call(`/organizer/api/tournaments/${this.t.id}/active`, 'PUT', { active: !this.t.active });
        this.t = body.tournament;
      }, this.t.active ? 'Turniej zakończony: zniknął z aplikacji sędziego.' : 'Turniej trwa: sędziowie i biuro go widzą.');
    },

    async savePin(court) {
      await this._try(async () => {
        await call(`/organizer/api/tournaments/${this.t.id}/courts/${encodeURIComponent(court.kort_id)}/pin`, 'PUT', { pin: this.tPins[court.kort_id] });
        court.pin = this.tPins[court.kort_id];
      }, `PIN kortu ${court.name} zapisany.`);
    },

    async openOffice() {
      await this._try(async () => {
        const session = await call(`/organizer/api/tournaments/${this.t.id}/office-session`, 'POST');
        sessionStorage.setItem(`office-token-t${session.tournament_id}`, session.token);
        try { localStorage.setItem('office-tournament-id', String(session.tournament_id)); } catch { /* not remembered */ }
        window.location.href = `/office/${session.slot}`;
      });
    },

    overlayUrl(link) {
      return link.path ? window.location.origin + link.path : '';
    },

    async loadLog() {
      await this._try(async () => { this.tLog = await call(`/organizer/api/tournaments/${this.t.id}/log`); });
    },

    async loadCategories() {
      await this._try(async () => {
        this.tCategories = (await call(`/organizer/api/tournaments/${this.t.id}/categories`)).categories || [];
      });
    },

    async addCategories() {
      const entries = CATEGORY_PRESETS.filter((key) => this.tPresetPick[key]).map((key) => ({ preset_key: key, is_doubles: this.tCategoryDoubles }));
      if (this.tCustomCategory.trim()) entries.push({ label: this.tCustomCategory.trim(), is_doubles: this.tCategoryDoubles });
      if (!entries.length) {
        this.tError = 'Zaznacz kategorię albo wpisz własną.';
        return;
      }
      await this._try(async () => {
        this.tCategories = (await call(`/organizer/api/tournaments/${this.t.id}/categories/confirm`, 'POST', { categories: entries })).categories;
        this.tPresetPick = {};
        this.tCustomCategory = '';
        this.tCategoryDoubles = false;
      }, 'Kategorie dodane.');
    },

    async deleteCategory(category) {
      if (!window.confirm(`Usunąć kategorię „${category.label}”?`)) return;
      await this._try(async () => {
        this.tCategories = (await call(`/organizer/api/tournaments/${this.t.id}/categories/${category.id}`, 'DELETE')).categories;
      }, 'Kategoria usunięta.');
    },
  };
}
