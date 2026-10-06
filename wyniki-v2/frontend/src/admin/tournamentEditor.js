import { inferMixedPlayerBands } from '../shared/categories.js';

/** The tournament settings panel: what it opens with, what it saves, and the logo. */

export function createTournamentEditorAdmin() {
  return {
      editTournament: {
        id: null,
        name: '',
        start_date: '',
        end_date: '',
        city: '',
        country: '',
        report_email: '',
        court_count: 0,
        active: false,
        is_public: true,
        stats_enabled: true,
        is_simulation: false,
        access_key: '',
        office_password: '',
        has_office_password: false,
        logo: null,
        logo_path: '',
        title_scope: 'open',
        title_override: '',
        title_scope_guessed: false,
      },

      async openTournamentEditor(tournament) {
    this.editingTournamentId = tournament.id;
    this.editTournament = {
      id: tournament.id,
      name: tournament.name || '',
      start_date: tournament.start_date || '',
      end_date: tournament.end_date || '',
      city: tournament.city || '',
      country: tournament.country || '',
      report_email: tournament.report_email || '',
      court_count: tournament.court_count || 0,
      active: !!tournament.active,
      is_public: !!tournament.is_public,
      stats_enabled: !!tournament.stats_enabled,
      title_scope: tournament.title_scope || 'open',
      title_override: tournament.title_override || '',
      title_scope_guessed: !!tournament.title_scope_guessed,
      is_simulation: !!tournament.is_simulation,
      access_key: tournament.access_key || '',
      office_password: '',
      has_office_password: !!tournament.has_office_password,
      logo: null,
      logo_path: tournament.logo_path || '',
    };
    this.adminCategorySetupOpen = true;
    this.adminCategoryEditId = null;
    this.adminCategoryEditLabel = '';
    this.adminCategoryCustomLabel = '';
    this.adminCategoryCustomHints = '';
    this.adminCategoryCustomDoubles = false;
    this.adminCategoryPresetSelected = {};
    this.adminCategoryPresetDoubles = {};
    await this.loadAdminTournamentCategories(tournament.id);
    await this.loadAdminCourtStreams(tournament.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
      },

      cancelTournamentEdit() {
    this.editingTournamentId = null;
    this.editTournament = {
      id: null,
      name: '',
      start_date: '',
      end_date: '',
      city: '',
      country: '',
      report_email: '',
      court_count: 0,
      active: false,
      is_public: true,
      stats_enabled: true,
      is_simulation: false,
      title_scope: 'open',
      title_override: '',
      title_scope_guessed: false,
      access_key: '',
      office_password: '',
      has_office_password: false,
      logo: null,
      logo_path: '',
    };
    this.adminTournamentCategories = [];
    this.adminCategorySetupOpen = true;
    this.courtStreams = { days: [], today: '', courts: [], links: {}, shared: {}, off_courts: [] };
    this.streamsSharedAll = false;
      },

      mixedBandsForTournament(tournamentId) {
    return inferMixedPlayerBands(this.tournamentCategoriesFor(tournamentId));
      },

      onEditTournamentLogoSelected(event) {
    this.editTournament.logo = event.target.files?.[0] || null;
      },

      async saveTournamentEdit() {
    if (!this.editTournament.id || !this.editTournament.name || !this.editTournament.start_date || !this.editTournament.end_date) {
      this.showToast('Wypełnij wszystkie pola turnieju', 'warning');
      return;
    }

    try {
      const payload = new FormData();
      Object.entries(this.editTournament).forEach(([key, value]) => {
        if (['id', 'logo', 'logo_path', 'title_scope_guessed'].includes(key)) return;
        payload.append(key, value ?? '');
      });
      if (this.editTournament.logo) {
        payload.append('logo', this.editTournament.logo);
      }

      const response = await fetch(`/admin/api/tournaments/${this.editTournament.id}`, {
        method: 'PUT',
        body: payload,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to update tournament');

      const editedTournamentId = this.editTournament.id;
      const parts = ['Turniej zapisany'];
      if (result.created_courts?.length) {
        parts.push(`dodano korty: ${result.created_courts.join(', ')}`);
      }
      if (result.deleted_courts?.length) {
        parts.push(`usunięto korty: ${result.deleted_courts.join(', ')}`);
      }
      this.showToast(parts.join(' | '), 'success');
      this.cancelTournamentEdit();
      await this.loadCourts();
      await this.loadTournaments();
      if (this.selectedTournament === editedTournamentId) {
        await this.loadPlayers(editedTournamentId);
      }
    } catch (err) {
      console.error('Failed to update tournament:', err);
      this.showToast(err.message || 'Błąd zapisu turnieju', 'error');
    }
      },
  };
}
