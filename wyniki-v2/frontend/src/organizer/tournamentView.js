/**
 * One tournament in the organizer's panel: its settings, whether it is live, courts and
 * PINs, the office, overlay links for an outside stream, the categories and the change log.
 * Messages are text keys; the app translates them with t().
 */
import { call, CallError } from './api.js';

export const CATEGORY_PRESETS = ['B1K', 'B1M', 'B2K', 'B2M', 'B3K', 'B3M', 'B4K', 'B4M'];
export const TITLE_SCOPE_KEYS = [
  { value: 'world', key: 'scopeWorld' },
  { value: 'continental', key: 'scopeContinental' },
  { value: 'national', key: 'scopeNational' },
  { value: 'open', key: 'scopeOpen' },
];

const LOG_KEYS = {
  create: 'logCreate', update: 'logUpdate', set_active: 'logSetActive', court_pin: 'logCourtPin',
  office_session: 'logOfficeSession', category_create: 'logCategoryCreate', categories_confirm: 'logCategoriesConfirm',
  category_update: 'logCategoryUpdate', category_delete: 'logCategoryDelete', entry_add: 'logEntryAdd',
  entry_update: 'logEntryUpdate', entry_delete: 'logEntryDelete', entry_bulk: 'logEntryBulk',
  entry_add_global: 'logEntryAddGlobal', placings_save: 'logPlacings', logo_upload: 'logLogo', logo_remove: 'logLogoRemove',
};

export function settingsForm(t = {}) {
  return {
    name: t.name || '', start_date: t.start_date || '', end_date: t.end_date || '',
    city: t.city || '', country: t.country || '', report_email: t.report_email || '',
    court_count: Number(t.court_count || 0), is_public: !!t.is_public, is_simulation: !!t.is_simulation,
    title_scope: t.title_scope || 'open', title_override: t.title_override || '', office_password: '',
  };
}

/** The text key for a log line; null for an action this panel does not know yet. */
export function logKey(entry) {
  if (String(entry?.action || '').startsWith('admin.')) return 'logAdmin';
  return LOG_KEYS[entry?.action] || null;
}

/** A message to show: a text key with its values. */
const note = (key, vars = {}) => ({ key, vars });

export function createTournamentView() {
  return {
    t: null,
    tForm: settingsForm(),
    tMessage: null,
    tError: null,
    tLog: [],
    tCategories: [],
    tPresetPick: {},
    tCustomCategory: '',
    tCategoryDoubles: false,
    tPins: {},

    titleScopes() { return TITLE_SCOPE_KEYS; },
    categoryPresets() { return CATEGORY_PRESETS; },
    logLine(entry) {
      const key = logKey(entry);
      return key ? this.ot(key) : entry?.action || '';
    },
    logWhen(entry) { return String(entry?.created_at || '').slice(0, 16).replace('T', ' '); },

    async _try(work, success = null) {
      this.tError = null;
      this.tMessage = null;
      try {
        await work();
        if (success) this.tMessage = typeof success === 'function' ? success() : success;
      } catch (error) {
        this.tError = error instanceof CallError ? note(error.key, error.vars) : note('genericError');
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
      }, note('saved'));
    },

    async toggleLive() {
      const wasLive = this.t.active;
      await this._try(async () => {
        const body = await call(`/organizer/api/tournaments/${this.t.id}/active`, 'PUT', { active: !wasLive });
        this.t = body.tournament;
      }, note(wasLive ? 'liveOffMsg' : 'liveOnMsg'));
    },

    async savePin(court) {
      await this._try(async () => {
        await call(`/organizer/api/tournaments/${this.t.id}/courts/${encodeURIComponent(court.kort_id)}/pin`, 'PUT', { pin: this.tPins[court.kort_id] });
        court.pin = this.tPins[court.kort_id];
      }, note('pinSaved', { name: court.name }));
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
        this.tError = note('pickCategory');
        return;
      }
      await this._try(async () => {
        this.tCategories = (await call(`/organizer/api/tournaments/${this.t.id}/categories/confirm`, 'POST', { categories: entries })).categories;
        this.tPresetPick = {};
        this.tCustomCategory = '';
        this.tCategoryDoubles = false;
      }, note('categoriesAdded'));
    },

    async deleteCategory(category) {
      if (!window.confirm(this.ot('confirmDeleteCategory', { label: category.label }))) return;
      await this._try(async () => {
        this.tCategories = (await call(`/organizer/api/tournaments/${this.t.id}/categories/${category.id}`, 'DELETE')).categories;
      }, note('categoryDeleted'));
    },
  };
}
