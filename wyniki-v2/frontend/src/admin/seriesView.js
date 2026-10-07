/**
 * Turnieje → Serie i konta: a series (a tour such as TWT), the people who run it, and the
 * tournaments it ranks with their tier. People get an invitation link to set a password;
 * when no mail goes out the link is shown here to pass on by hand.
 */
import { LANGUAGES } from '../organizer/i18n/index.js';
import { TIERS, dateRange, tierLabel } from '../organizer/route.js';

export const ROLE_OPTIONS = [
  { value: 'owner', label: 'właściciel' },
  { value: 'editor', label: 'edytor' },
];

export function memberStatus(member) {
  if (member.disabled) return { text: 'wyłączone', tone: 'warn' };
  if (!member.has_password) return { text: 'czeka na ustawienie hasła', tone: '' };
  return { text: 'aktywne', tone: 'ok' };
}

/** Tournaments not yet in the series, newest first, for the "add" list. */
export function attachableTournaments(all, series) {
  const taken = new Set((series?.tournaments || []).map((row) => row.id));
  return [...(all || [])]
    .filter((row) => !taken.has(row.id))
    .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
}

const emptyDraft = () => ({ name: '', website: '', valid_until: '', max_tournaments_per_year: 0, max_courts: 0 });

export function createSeriesView() {
  return {
    seriesList: [],
    seriesDraft: emptyDraft(),
    seriesMemberDraft: {},
    seriesAttachDraft: {},
    seriesInvite: null,
    seriesError: '',
    seriesContact: '',

    seriesTiers() {
      return [{ value: '', label: 'bez rangi' }, ...TIERS.map((tier) => ({ value: tier, label: tierLabel(tier) }))];
    },
    seriesRoles() { return ROLE_OPTIONS; },
    seriesLanguages() { return LANGUAGES; },
    seriesMemberStatus: memberStatus,
    seriesTierLabel: tierLabel,
    seriesDates: dateRange,

    seriesAttachable(item) {
      return attachableTournaments(this.tournaments, item);
    },

    memberDraft(item) {
      if (!this.seriesMemberDraft[item.id]) this.seriesMemberDraft[item.id] = { email: '', name: '', role: 'editor', language: 'en' };
      return this.seriesMemberDraft[item.id];
    },

    attachDraft(item) {
      if (!this.seriesAttachDraft[item.id]) this.seriesAttachDraft[item.id] = { tournament_id: '', tier: '' };
      return this.seriesAttachDraft[item.id];
    },

    async _seriesCall(url, method = 'GET', body) {
      this.seriesError = '';
      const response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        this.seriesError = data.error === 'A valid e-mail is required' ? 'Podaj poprawny adres e-mail.' : 'Nie udało się zapisać zmian. Spróbuj ponownie.';
        throw new Error(data.error || String(response.status));
      }
      return data;
    },

    async loadSeries() {
      try {
        this.seriesList = await this._seriesCall('/admin/api/series');
        this.seriesContact = (await this._seriesCall('/admin/api/series/settings')).contact_email;
      } catch (err) {
        console.error('Failed to load series:', err);
      }
    },

    async saveSeriesContact() {
      try {
        this.seriesContact = (await this._seriesCall('/admin/api/series/settings', 'PUT', { contact_email: this.seriesContact })).contact_email;
        this.showToast('Adres zapisany', 'success');
      } catch { /* message shown */ }
    },

    async createSeries() {
      if (!this.seriesDraft.name.trim()) {
        this.seriesError = 'Podaj nazwę serii.';
        return;
      }
      try {
        await this._seriesCall('/admin/api/series', 'POST', this.seriesDraft);
        this.seriesDraft = emptyDraft();
        this.showToast('Seria dodana', 'success');
        await this.loadSeries();
      } catch { /* message shown */ }
    },

    async saveSeries(item) {
      try {
        await this._seriesCall(`/admin/api/series/${item.id}`, 'PATCH', {
          name: item.name, website: item.website, valid_until: item.valid_until,
          max_tournaments_per_year: item.max_tournaments_per_year, max_courts: item.max_courts,
        });
        this.showToast('Seria zapisana', 'success');
      } catch { /* message shown */ }
    },

    async deleteSeries(item) {
      if (!window.confirm(`Usunąć serię „${item.name}”? Turnieje zostają, znika tylko przypisanie i dostęp osób.`)) return;
      try {
        await this._seriesCall(`/admin/api/series/${item.id}`, 'DELETE');
        await this.loadSeries();
      } catch { /* message shown */ }
    },

    async addSeriesMember(item) {
      const draft = this.memberDraft(item);
      try {
        this.seriesInvite = { seriesId: item.id, ...(await this._seriesCall(`/admin/api/series/${item.id}/members`, 'POST', draft)) };
        this.seriesMemberDraft[item.id] = { email: '', name: '', role: 'editor', language: 'en' };
        await this.loadSeries();
      } catch { /* message shown */ }
    },

    async reinviteSeriesMember(item, member) {
      try {
        this.seriesInvite = { seriesId: item.id, ...(await this._seriesCall(`/admin/api/series/${item.id}/members/${member.id}/invite`, 'POST')) };
      } catch { /* message shown */ }
    },

    async toggleSeriesMember(item, member) {
      try {
        await this._seriesCall(`/admin/api/series/${item.id}/members/${member.id}`, 'PATCH', { disabled: !member.disabled });
        await this.loadSeries();
      } catch { /* message shown */ }
    },

    async setSeriesMemberLanguage(item, member, language) {
      try {
        await this._seriesCall(`/admin/api/series/${item.id}/members/${member.id}`, 'PATCH', { language });
        await this.loadSeries();
      } catch { /* message shown */ }
    },

    async setSeriesMemberRole(item, member, role) {
      try {
        await this._seriesCall(`/admin/api/series/${item.id}/members/${member.id}`, 'PATCH', { role });
        await this.loadSeries();
      } catch { /* message shown */ }
    },

    async removeSeriesMember(item, member) {
      if (!window.confirm(`Odebrać ${member.email} dostęp do serii „${item.name}”?`)) return;
      try {
        await this._seriesCall(`/admin/api/series/${item.id}/members/${member.id}`, 'DELETE');
        await this.loadSeries();
      } catch { /* message shown */ }
    },

    async attachSeriesTournament(item) {
      const draft = this.attachDraft(item);
      if (!draft.tournament_id) {
        this.seriesError = 'Wybierz turniej.';
        return;
      }
      try {
        await this._seriesCall(`/admin/api/series/${item.id}/tournaments/${draft.tournament_id}`, 'PUT', { tier: draft.tier });
        this.seriesAttachDraft[item.id] = { tournament_id: '', tier: '' };
        await this.loadSeries();
      } catch { /* message shown */ }
    },

    async setSeriesTier(item, row, tier) {
      try {
        await this._seriesCall(`/admin/api/series/${item.id}/tournaments/${row.id}`, 'PUT', { tier });
        await this.loadSeries();
      } catch { /* message shown */ }
    },

    async detachSeriesTournament(item, row) {
      try {
        await this._seriesCall(`/admin/api/series/${item.id}/tournaments/${row.id}`, 'DELETE');
        await this.loadSeries();
      } catch { /* message shown */ }
    },

    async copySeriesInvite() {
      try {
        await navigator.clipboard.writeText(this.seriesInvite.invite_url);
        this.showToast('Link skopiowany', 'success');
      } catch {
        this.showToast('Zaznacz link i skopiuj ręcznie', 'warning');
      }
    },
  };
}
