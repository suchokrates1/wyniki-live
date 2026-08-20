import {
  inferMixedPlayerBands,
  mixedCategoryDisplayLabel,
  planningDivisionFromGroupName as sharedPlanningDivisionFromGroupName,
  planningDivisionKey as sharedPlanningDivisionKey,
  playerMatchesTournamentCategory,
} from '../shared/categories.js';
import { PLAY_FORMATS, normalizePlayFormat } from '../shared/playFormat.js';

export function createTournamentsAdmin() {
  return {
      // Tournaments
      tournaments: [],
      selectedTournament: null,
      editingTournamentId: null,
      newTournament: {
        name: '',
        start_date: '',
        end_date: '',
        city: '',
        country: '',
        report_email: '',
        court_count: 1,
        is_public: true,
        stats_enabled: true,
        is_simulation: false,
        access_key: '',
        office_password: '',
        logo: null,
      },
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
      },

      adminTournamentCategories: [],
      adminCategoryPresetSelected: {},
      adminCategoryPresetDoubles: {},
      adminCategoryCustomLabel: '',
      adminCategoryCustomHints: '',
      adminCategoryCustomDoubles: false,
      adminCategoryEditId: null,
      adminCategoryEditLabel: '',
      adminCategorySetupOpen: true,
      newCategoryPresetSelected: {},
      newCategoryPresetDoubles: {},
      newCategoryCustomLabel: '',
      newCategoryCustomHints: '',
      newCategoryCustomDoubles: false,
      tournamentCategoriesCache: {},

     // Tournament planning dashboard
     planningTournamentId: null,
     planningLoading: false,
     planningPlayers: [],
     planningMixedCategories: [],
     planningGroups: [],
     planningSchedule: [],
     planningCourts: [],
     planningSelectedDivision: '',
     planningSelectedCategoryId: null,
     planningGroupCount: 1,
     planningCategoryFilterEnabled: true,
     planningGroupAssignments: {},
     planningTeamAssignments: {},
     planningGroupFormats: {},
     planningTeams: [],
     planningNewTeam: { player1_id: '', player2_id: '' },
     planningScheduleFilter: { day: '', category: '', court: '' },
     planningNewSchedule: {
       day_date: '',
       scheduled_time: '',
       court_id: '',
       category_name: '',
       phase: 'Grupowa',
       player1_name: '',
       player2_name: '',
       status: 'planned',
       notes_public: '',
       notes_internal: '',
     },

     emailSettings: {
       smtp_host: '',
       smtp_port: 587,
       smtp_username: '',
       smtp_password: '',
       smtp_use_tls: true,
       smtp_from_email: '',
       smtp_from_name: 'Wyniki Live',
     },

    // Players
    players: [],
    editingPlayerId: null,
    editPlayerData: { first_name: '', last_name: '', category: '', gender: '', country: '' },
    newPlayer: {
      first_name: '',
      last_name: '',
      category: '',
      gender: '',
      country: '',
    },
    importText: '',
    importPreview: {
      players: [],
      count: 0,
      needs_attention_count: 0,
    },

      get filteredPlayers() {
     return this.players;
      },

      isActiveTournamentId(tournamentId) {
     const normalizedId = Number(tournamentId);
     if (!normalizedId) return false;
     return this.activeTournamentsList().some(tournament => Number(tournament.id) === normalizedId);
      },

      async loadTournaments() {
    this.loading.tournaments = true;
    try {
      const response = await fetch('/admin/api/tournaments');
      if (!response.ok) throw new Error('Failed to load tournaments');
      this.tournaments = await response.json();
      const activeTournaments = this.activeTournamentsList();
      const selectedStillActive = activeTournaments.some(t => Number(t.id) === Number(this.selectedTournament));

      if (!selectedStillActive) {
        this.selectedTournament = activeTournaments[0]?.id || null;
        this.players = [];
      }

      if (!this.officeTournamentId || !this.getTournamentById(this.officeTournamentId)) {
        this.officeTournamentId = activeTournaments[0]?.id || null;
      }

      if (this.selectedTournament) {
        await this.loadPlayers(this.selectedTournament);
      }
    } catch (err) {
      console.error('Failed to load tournaments:', err);
      this.showToast('Błąd ładowania turniejów', 'error');
    } finally {
      this.loading.tournaments = false;
    }
      },
      
      async createTournament() {
    if (!this.newTournament.name || !this.newTournament.start_date || !this.newTournament.end_date) {
      this.showToast('Wypełnij wszystkie pola', 'warning');
      return;
    }

    try {
      const payload = new FormData();
      Object.entries(this.newTournament).forEach(([key, value]) => {
        if (key === 'logo') return;
        payload.append(key, value ?? '');
      });
      if (this.newTournament.logo) {
        payload.append('logo', this.newTournament.logo);
      }

      const response = await fetch('/admin/api/tournaments', {
        method: 'POST',
        body: payload,
      });
      
      if (!response.ok) throw new Error('Failed to create tournament');

      const created = await response.json().catch(() => ({}));
      const createdId = Number(created?.id);
      const categoryEntries = this.buildAdminCategoryEntries(
        this.newCategoryPresetSelected,
        this.newCategoryCustomLabel,
        this.newCategoryCustomHints,
        this.newCategoryPresetDoubles,
        this.newCategoryCustomDoubles,
      );
      if (createdId && categoryEntries.length) {
        await this.confirmAdminTournamentCategories(createdId, categoryEntries, { silent: true });
      }

      this.showToast('Turniej utworzony', 'success');
      this.newTournament = {
        name: '',
        start_date: '',
        end_date: '',
        city: '',
        country: '',
        report_email: '',
        court_count: 1,
        is_public: true,
        stats_enabled: true,
        is_simulation: false,
        access_key: '',
        office_password: '',
        logo: null,
      };
      this.newCategoryPresetSelected = {};
      this.newCategoryPresetDoubles = {};
      this.newCategoryCustomLabel = '';
      this.newCategoryCustomHints = '';
      this.newCategoryCustomDoubles = false;
      await this.loadTournaments();
    } catch (err) {
      console.error('Failed to create tournament:', err);
      this.showToast('Błąd tworzenia turnieju', 'error');
    }
      },

      onTournamentLogoSelected(event) {
    this.newTournament.logo = event.target.files?.[0] || null;
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
      access_key: '',
      office_password: '',
      has_office_password: false,
      logo: null,
      logo_path: '',
    };
    this.adminTournamentCategories = [];
    this.adminCategorySetupOpen = true;
      },

      adminCategoryPresetKeys() {
    return ['B1M', 'B1K', 'B2M', 'B2K', 'B3M', 'B3K', 'B4M', 'B4K'];
      },

      adminCategoryPresetLabel(key) {
    const labels = {
      B1M: 'B1 M', B1K: 'B1 K', B2M: 'B2 M', B2K: 'B2 K',
      B3M: 'B3 M', B3K: 'B3 K', B4M: 'B4 M', B4K: 'B4 K',
    };
    return labels[key] || key;
      },

      buildAdminCategoryEntries(presetSelected, customLabel, customHints, presetDoubles = {}, customDoubles = false) {
    const presets = this.adminCategoryPresetKeys()
      .filter(key => presetSelected[key])
      .map(key => ({ preset_key: key, is_doubles: Boolean(presetDoubles[key]) }));
    const label = String(customLabel || '').trim();
    const entries = [...presets];
    if (label) {
      entries.push({
        label,
        hint_bands: String(customHints || '').split(/[,/]/).map(v => v.trim()).filter(Boolean),
        is_doubles: Boolean(customDoubles),
      });
    }
    return entries;
      },

      async loadAdminTournamentCategories(tournamentId) {
    if (!tournamentId) {
      this.adminTournamentCategories = [];
      return;
    }
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/categories`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load categories');
      const categories = Array.isArray(payload.categories) ? payload.categories : [];
      this.adminTournamentCategories = categories;
      this.tournamentCategoriesCache[tournamentId] = categories;
      this.adminCategorySetupOpen = !categories.length;
    } catch (error) {
      console.error('Failed to load tournament categories:', error);
      this.showToast('Błąd ładowania kategorii turnieju', 'error');
    }
      },

      async loadTournamentCategoriesCache(tournamentId) {
    if (!tournamentId) return;
    if (Array.isArray(this.tournamentCategoriesCache[tournamentId])) return;
    await this.loadAdminTournamentCategories(tournamentId);
      },

      tournamentCategoriesFor(tournamentId) {
    if (Number(this.editingTournamentId) === Number(tournamentId)) {
      return this.adminTournamentCategories || [];
    }
    return this.tournamentCategoriesCache[tournamentId] || [];
      },

      mixedBandsForTournament(tournamentId) {
    return inferMixedPlayerBands(this.tournamentCategoriesFor(tournamentId));
      },

      async confirmAdminTournamentCategories(tournamentId, entries = null, options = {}) {
    const payloadEntries = entries || this.buildAdminCategoryEntries(
      this.adminCategoryPresetSelected,
      this.adminCategoryCustomLabel,
      this.adminCategoryCustomHints,
      this.adminCategoryPresetDoubles,
      this.adminCategoryCustomDoubles,
    );
    if (!payloadEntries.length) {
      if (!options.silent) this.showToast('Wybierz co najmniej jedną kategorię', 'warning');
      return false;
    }
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/categories/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: payloadEntries }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to confirm categories');
      this.adminTournamentCategories = Array.isArray(payload.categories) ? payload.categories : [];
      this.tournamentCategoriesCache[tournamentId] = this.adminTournamentCategories;
      this.adminCategorySetupOpen = false;
      this.adminCategoryCustomLabel = '';
      this.adminCategoryCustomHints = '';
      this.adminCategoryCustomDoubles = false;
      this.adminCategoryPresetSelected = {};
      this.adminCategoryPresetDoubles = {};
      if (!options.silent) this.showToast('Kategorie zapisane', 'success');
      return true;
    } catch (error) {
      console.error('Failed to confirm tournament categories:', error);
      if (!options.silent) this.showToast(error.message || 'Błąd zapisu kategorii', 'error');
      return false;
    }
      },

      async addAdminTournamentCategory(tournamentId) {
    const label = String(this.adminCategoryCustomLabel || '').trim();
    if (!label) return;
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          hint_bands: String(this.adminCategoryCustomHints || '').split(/[,/]/).map(v => v.trim()).filter(Boolean),
          is_doubles: Boolean(this.adminCategoryCustomDoubles),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to add category');
      this.adminTournamentCategories = Array.isArray(payload.categories) ? payload.categories : this.adminTournamentCategories;
      this.tournamentCategoriesCache[tournamentId] = this.adminTournamentCategories;
      this.adminCategoryCustomLabel = '';
      this.adminCategoryCustomHints = '';
      this.adminCategoryCustomDoubles = false;
      this.showToast('Kategoria dodana', 'success');
    } catch (error) {
      this.showToast(error.message || 'Błąd dodawania kategorii', 'error');
    }
      },

      startAdminCategoryEdit(category) {
    this.adminCategoryEditId = category?.id || null;
    this.adminCategoryEditLabel = category?.label || '';
      },

      async saveAdminCategoryEdit(tournamentId) {
    if (!this.adminCategoryEditId) return;
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/categories/${this.adminCategoryEditId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: String(this.adminCategoryEditLabel || '').trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to update category');
      this.adminTournamentCategories = Array.isArray(payload.categories) ? payload.categories : this.adminTournamentCategories;
      this.tournamentCategoriesCache[tournamentId] = this.adminTournamentCategories;
      this.adminCategoryEditId = null;
      this.adminCategoryEditLabel = '';
      this.showToast('Kategoria zaktualizowana', 'success');
    } catch (error) {
      this.showToast(error.message || 'Błąd aktualizacji kategorii', 'error');
    }
      },

      async deleteAdminTournamentCategory(tournamentId, categoryId) {
    if (!categoryId || !confirm('Usunąć tę kategorię turniejową?')) return;
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/categories/${categoryId}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to delete category');
      this.adminTournamentCategories = Array.isArray(payload.categories) ? payload.categories : [];
      this.tournamentCategoriesCache[tournamentId] = this.adminTournamentCategories;
      this.showToast('Kategoria usunięta', 'success');
    } catch (error) {
      this.showToast(error.message || 'Błąd usuwania kategorii', 'error');
    }
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
        if (['id', 'logo', 'logo_path'].includes(key)) return;
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

      async loadEmailSettings() {
    try {
      const response = await fetch('/admin/api/settings/email');
      if (!response.ok) throw new Error('Failed to load email settings');
      this.emailSettings = { ...this.emailSettings, ...(await response.json()) };
    } catch (err) {
      console.error('Failed to load email settings:', err);
      this.showToast('Błąd ładowania ustawień SMTP', 'error');
    }
      },

      async saveEmailSettings() {
    try {
      const response = await fetch('/admin/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.emailSettings),
      });
      if (!response.ok) throw new Error('Failed to save email settings');
      this.showToast('Ustawienia SMTP zapisane', 'success');
    } catch (err) {
      console.error('Failed to save email settings:', err);
      this.showToast('Błąd zapisu ustawień SMTP', 'error');
    }
      },
      
      async deleteTournament(tournamentId) {
    if (!confirm('Czy na pewno usunąć ten turniej?')) return;

    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete tournament');
      
      this.showToast('Turniej usunięty', 'success');
      await this.loadTournaments();
    } catch (err) {
      console.error('Failed to delete tournament:', err);
      this.showToast('Błąd usuwania turnieju', 'error');
    }
      },
      
      async toggleTournamentActive(tournamentId, active) {
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/active`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ active }),
      });
      
      if (!response.ok) throw new Error('Failed to update tournament state');
      
      this.showToast(active ? 'Turniej aktywowany' : 'Turniej dezaktywowany', 'success');
      await this.loadTournaments();
    } catch (err) {
      console.error('Failed to update tournament state:', err);
      this.showToast('Błąd zmiany statusu turnieju', 'error');
    }
      },
      
      async selectTournament(tournamentId) {
    this.selectedTournament = tournamentId;
    this.activeTab = 'players';
    await this.loadPlayers(tournamentId);
      },

      // ===== TOURNAMENT PLANNING =====
      async openPlanningDashboard(tournamentId = null) {
        this.activeTab = 'planning';
        if (tournamentId) this.planningTournamentId = tournamentId;
        if (!this.planningTournamentId) {
     this.planningTournamentId = this.selectedTournament || this.activeTournamentsList()[0]?.id || null;
        }
        if (this.planningTournamentId) {
     await this.loadPlanningData();
        }
      },

      async loadPlanningData() {
        if (!this.planningTournamentId) return;
        this.planningLoading = true;
        try {
     const [playersResponse, groupsResponse, scheduleResponse, courtsResponse, tournamentResponse, teamsResponse] = await Promise.all([
       fetch(`/admin/api/tournaments/${this.planningTournamentId}/players`),
       fetch(`/admin/api/tournaments/${this.planningTournamentId}/bracket/groups`),
       fetch(`/admin/api/tournaments/${this.planningTournamentId}/schedule`),
       fetch('/admin/api/courts'),
       fetch(`/admin/api/tournaments/${this.planningTournamentId}`),
       fetch(`/admin/api/tournaments/${this.planningTournamentId}/teams`),
     ]);
     if (!playersResponse.ok || !groupsResponse.ok || !scheduleResponse.ok || !courtsResponse.ok || !tournamentResponse.ok) {
       throw new Error('Failed to load planning data');
     }
     const tournamentPayload = await tournamentResponse.json();
     const categories = Array.isArray(tournamentPayload.tournament_categories) ? tournamentPayload.tournament_categories : [];
     this.tournamentCategoriesCache[this.planningTournamentId] = categories;
     this.planningMixedCategories = inferMixedPlayerBands(categories);
     this.planningPlayers = await playersResponse.json();
     this.planningGroups = await groupsResponse.json();
     const teamsPayload = teamsResponse.ok ? await teamsResponse.json().catch(() => ({})) : {};
     this.planningTeams = Array.isArray(teamsPayload.teams) ? teamsPayload.teams : [];
     const schedulePayload = await scheduleResponse.json();
     this.planningSchedule = Array.isArray(schedulePayload.schedule) ? schedulePayload.schedule : [];
     const allCourts = await courtsResponse.json();
     this.courts = Array.isArray(allCourts) ? allCourts : this.courts;
     this.planningCourts = (this.courts || [])
       .filter(court => Number(court.tournament_id) === Number(this.planningTournamentId))
       .sort((left, right) => {
         const orderDelta = Number(left.display_order || 0) - Number(right.display_order || 0);
         if (orderDelta !== 0) return orderDelta;
         return String(left.name || left.kort_id).localeCompare(String(right.name || right.kort_id), 'pl', { numeric: true });
       });
     this.syncPlanningGroupAssignments();
     this.ensurePlanningDefaults();
        } catch (err) {
     console.error('Failed to load planning data:', err);
     this.showToast('Błąd ładowania planu turnieju', 'error');
        } finally {
     this.planningLoading = false;
        }
      },

      ensurePlanningDefaults() {
        const divisions = this.planningDivisions();
        if (!divisions.find(division => String(division.key) === String(this.planningSelectedDivision))) {
     this.planningSelectedDivision = divisions[0]?.key || '';
     this.planningSelectedCategoryId = divisions[0]?.id ?? null;
        }
        if (this.planningUsesTournamentCategories() && this.planningSelectedDivision) {
          this.planningSelectedCategoryId = Number(this.planningSelectedDivision);
        }
        const selectedGroups = this.planningGroupsForDivision(this.planningSelectedDivision);
        if (selectedGroups.length) {
     this.planningGroupCount = Math.max(1, selectedGroups.length);
        } else {
     this.planningGroupCount = 1;
        }
        const tournament = this.getTournamentById(this.planningTournamentId);
        this.planningNewSchedule.day_date = this.planningNewSchedule.day_date || tournament?.start_date || '';
        this.planningNewSchedule.court_id = this.planningNewSchedule.court_id || this.planningCourts[0]?.kort_id || '';
      },

      syncPlanningGroupAssignments() {
        const assignments = {};
        const teamAssignments = {};
        const formats = { ...(this.planningGroupFormats || {}) };
        for (const group of this.planningGroups || []) {
     formats[group.name] = normalizePlayFormat(group.play_format);
     for (const player of group.players || []) {
       if (player.team_id) teamAssignments[player.team_id] = group.name;
       else if (player.player_id) assignments[player.player_id] = group.name;
     }
        }
        this.planningGroupAssignments = assignments;
        this.planningTeamAssignments = teamAssignments;
        this.planningGroupFormats = formats;
      },

      normalizePlanningGender(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (raw === 'K' || raw === 'F' || raw === 'W') return 'K';
        if (raw === 'M') return 'M';
        return '';
      },

      planningDivisionKey(player) {
        return sharedPlanningDivisionKey(
     player?.category || '',
     player?.gender || '',
     this.planningMixedCategories,
        );
      },

      planningDivisionLabel(key = this.planningSelectedDivision) {
        const value = String(key || '').toUpperCase();
        const mixedLabel = mixedCategoryDisplayLabel(value, this.planningMixedCategories);
        if (mixedLabel) return mixedLabel;
        const category = (value.match(/^B\d{1,2}/) || [''])[0];
        const gender = value.endsWith('K') ? 'Kobiety' : value.endsWith('M') ? 'Mężczyźni' : '';
        if (category && gender) return `${category} ${gender}`;
        return category || gender || 'Nieprzypisani';
      },

      planningDivisionFromGroupName(groupName) {
        return sharedPlanningDivisionFromGroupName(groupName, this.planningMixedCategories);
      },

      planningUsesTournamentCategories() {
        return this.tournamentCategoriesFor(this.planningTournamentId).some(cat => cat.is_active !== 0);
      },

      planningSelectedCategory() {
        const id = this.planningSelectedCategoryId ?? this.planningSelectedDivision;
        return this.tournamentCategoriesFor(this.planningTournamentId).find(cat => String(cat.id) === String(id)) || null;
      },

      planningSelectedCategoryIsDoubles() {
        return Boolean(this.planningSelectedCategory()?.is_doubles);
      },

      planningTeamsForCategory(categoryId) {
        const id = Number(categoryId || 0);
        if (!id) return [];
        return (this.planningTeams || []).filter(team => Number(team.category_id) === id);
      },

      planningGroupPlayFormat(groupName) {
        return normalizePlayFormat((this.planningGroupFormats || {})[groupName]);
      },

      planningPlayFormatOptions() {
        return PLAY_FORMATS.map(value => ({
          value,
          label: ({
            groups_knockout: 'Grupy + puchar',
            round_robin: 'Tylko każdy z każdym',
            knockout: 'Tylko puchar',
          })[value] || value,
        }));
      },

      setPlanningGroupPlayFormat(groupName, value) {
        if (!groupName) return;
        this.planningGroupFormats = {
          ...(this.planningGroupFormats || {}),
          [groupName]: normalizePlayFormat(value),
        };
      },

      planningDivisions() {
        if (this.planningUsesTournamentCategories()) {
          return this.tournamentCategoriesFor(this.planningTournamentId)
            .filter(cat => cat.is_active !== 0)
            .map(cat => ({
              key: String(cat.id),
              id: cat.id,
              label: cat.label,
              count: cat.is_doubles
                ? this.planningTeamsForCategory(cat.id).length
                : this.planningPlayersMatchingCategory(cat).length,
              is_doubles: Boolean(cat.is_doubles),
            }));
        }
        const grouped = new Map();
        for (const player of this.planningPlayers || []) {
     const key = this.planningDivisionKey(player);
     if (!grouped.has(key)) grouped.set(key, { key, label: this.planningDivisionLabel(key), count: 0 });
     grouped.get(key).count += 1;
        }
        return [...grouped.values()].sort((left, right) => {
     if (left.key === 'NIEPRZYPISANI') return 1;
     if (right.key === 'NIEPRZYPISANI') return -1;
     return left.key.localeCompare(right.key, 'pl', { numeric: true });
        });
      },

      planningPlayersMatchingCategory(category = this.planningSelectedCategory()) {
        return (this.planningPlayers || []).filter(player => (
          playerMatchesTournamentCategory(player, category, this.planningMixedCategories)
        ));
      },

      planningPlayersForDivision(key = this.planningSelectedDivision) {
        if (this.planningUsesTournamentCategories()) {
          if (!this.planningCategoryFilterEnabled) return this.planningPlayers || [];
          const cat = String(key) === String(this.planningSelectedDivision)
            ? this.planningSelectedCategory()
            : this.tournamentCategoriesFor(this.planningTournamentId).find(item => String(item.id) === String(key));
          return this.planningPlayersMatchingCategory(cat);
        }
        return (this.planningPlayers || []).filter(player => this.planningDivisionKey(player) === key);
      },

      planningGroupsForDivision(key = this.planningSelectedDivision) {
        if (this.planningUsesTournamentCategories()) {
          const categoryId = Number(key || this.planningSelectedCategoryId || this.planningSelectedDivision);
          const cat = this.tournamentCategoriesFor(this.planningTournamentId).find(item => Number(item.id) === categoryId);
          return (this.planningGroups || []).filter(group => {
            if (group.tournament_category_id != null) return Number(group.tournament_category_id) === categoryId;
            if (!cat) return false;
            return group.name === cat.label || String(group.name || '').startsWith(`${cat.label} —`);
          });
        }
        return (this.planningGroups || []).filter(group => this.planningDivisionFromGroupName(group.name) === key);
      },

      planningTargetGroupNames() {
        if (this.planningUsesTournamentCategories()) {
          const cat = this.planningSelectedCategory();
          if (!cat) return [];
          const label = cat.label;
          const count = Math.max(1, Math.min(8, Number(this.planningGroupCount || 1)));
          if (count === 1) return [label];
          return Array.from({ length: count }, (_, index) => `${label} — Grupa ${String.fromCharCode(65 + index)}`);
        }
        const count = Math.max(1, Math.min(8, Number(this.planningGroupCount || 1)));
        const label = this.planningDivisionLabel();
        if (!this.planningSelectedDivision) return [];
        if (count === 1) return [label];
        return Array.from({ length: count }, (_, index) => `${label} — Grupa ${String.fromCharCode(65 + index)}`);
      },

      planningDivisionGroupNames() {
        const names = new Set(this.planningTargetGroupNames());
        for (const group of this.planningGroupsForDivision()) names.add(group.name);
        for (const player of this.planningPlayersForDivision()) {
     const assigned = this.planningGroupAssignments[player.id];
     if (assigned) names.add(assigned);
        }
        for (const team of this.planningTeamsForCategory(this.planningSelectedCategoryId)) {
          const assigned = this.planningTeamAssignments[team.id];
          if (assigned) names.add(assigned);
        }
        return [...names];
      },

      planningAssignedPlayers(groupName) {
        return (this.planningPlayers || []).filter(player => this.planningGroupAssignments[player.id] === groupName);
      },

      planningUnassignedPlayers() {
        return this.planningPlayersForDivision().filter(player => !this.planningGroupAssignments[player.id]);
      },

      planningAssignedTeams(groupName) {
        return this.planningTeamsForCategory(this.planningSelectedCategoryId).filter(team => (
          this.planningTeamAssignments[team.id] === groupName
        ));
      },

      planningUnassignedTeams() {
        return this.planningTeamsForCategory(this.planningSelectedCategoryId).filter(team => !this.planningTeamAssignments[team.id]);
      },

      planningTeamPartnerOptions(excludeId = null) {
        const taken = new Set();
        for (const team of this.planningTeamsForCategory(this.planningSelectedCategoryId)) {
          if (team.player1_id) taken.add(Number(team.player1_id));
          if (team.player2_id) taken.add(Number(team.player2_id));
        }
        const exclude = Number(excludeId || 0);
        return (this.planningPlayers || []).filter(player => {
          if (taken.has(Number(player.id))) return false;
          if (exclude && Number(player.id) === exclude) return false;
          return true;
        });
      },

      autoAssignPlanningGroups() {
        const groupNames = this.planningTargetGroupNames();
        if (!groupNames.length) return;
        if (this.planningSelectedCategoryIsDoubles()) {
          this.planningUnassignedTeams().forEach((team, index) => {
            this.planningTeamAssignments[team.id] = groupNames[index % groupNames.length];
          });
          this.planningTeamAssignments = { ...this.planningTeamAssignments };
          return;
        }
        this.planningUnassignedPlayers().forEach((player, index) => {
     this.planningGroupAssignments[player.id] = groupNames[index % groupNames.length];
        });
        this.planningGroupAssignments = { ...this.planningGroupAssignments };
      },

      clearPlanningDivisionAssignments() {
        if (this.planningSelectedCategoryIsDoubles()) {
          const assignments = { ...this.planningTeamAssignments };
          for (const team of this.planningTeamsForCategory(this.planningSelectedCategoryId)) {
            delete assignments[team.id];
          }
          this.planningTeamAssignments = assignments;
          return;
        }
        if (this.planningUsesTournamentCategories()) {
          const valid = new Set(this.planningTargetGroupNames());
          const assignments = { ...this.planningGroupAssignments };
          for (const player of this.planningPlayers || []) {
            if (valid.has(assignments[player.id])) delete assignments[player.id];
          }
          this.planningGroupAssignments = assignments;
          return;
        }
        for (const player of this.planningPlayersForDivision()) {
     delete this.planningGroupAssignments[player.id];
        }
        this.planningGroupAssignments = { ...this.planningGroupAssignments };
      },

      planningSerializeStoredGroup(group) {
        const rows = group.players || [];
        return {
          name: group.name,
          tournament_category_id: group.tournament_category_id || null,
          play_format: normalizePlayFormat(group.play_format || this.planningGroupFormats?.[group.name]),
          players: rows.filter(row => row.player_id && !row.team_id).map(row => row.player_id),
          teams: rows.filter(row => row.team_id).map(row => row.team_id),
        };
      },

      async savePlanningGroups() {
        if (!this.planningTournamentId || !this.planningSelectedDivision) return;
        const selectedCategoryId = this.planningUsesTournamentCategories()
          ? Number(this.planningSelectedCategoryId || this.planningSelectedDivision)
          : null;
        const isDoubles = this.planningSelectedCategoryIsDoubles();
        const otherGroups = (this.planningGroups || [])
     .filter(group => {
       if (selectedCategoryId != null) {
         const cat = this.planningSelectedCategory();
         const gid = group.tournament_category_id != null ? Number(group.tournament_category_id) : null;
         const inSelected = gid === selectedCategoryId
           || (cat && (group.name === cat.label || String(group.name || '').startsWith(`${cat.label} —`)));
         return !inSelected;
       }
       return this.planningDivisionFromGroupName(group.name) !== this.planningSelectedDivision;
     })
     .map(group => this.planningSerializeStoredGroup(group));

        const divisionGroups = this.planningDivisionGroupNames()
     .map(groupName => {
       const payload = {
         name: groupName,
         tournament_category_id: selectedCategoryId,
         play_format: this.planningGroupPlayFormat(groupName),
         players: [],
         teams: [],
       };
       if (isDoubles) payload.teams = this.planningAssignedTeams(groupName).map(team => team.id);
       else payload.players = this.planningAssignedPlayers(groupName).map(player => player.id);
       return payload;
     })
     .filter(group => (group.players.length + group.teams.length) > 0);

        if (!divisionGroups.length) {
     this.showToast(isDoubles ? 'Przypisz przynajmniej jedną parę do grupy' : 'Przypisz przynajmniej jednego zawodnika do grupy', 'warning');
     return;
        }

        try {
     const response = await fetch(`/admin/api/tournaments/${this.planningTournamentId}/bracket/groups`, {
       method: 'PUT',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ groups: [...otherGroups, ...divisionGroups] }),
     });
     if (!response.ok) throw new Error('Failed to save groups');
     this.showToast('Grupy zapisane', 'success');
     await this.loadPlanningData();
     if (this.officeTournamentId && Number(this.officeTournamentId) === Number(this.planningTournamentId)) {
       await this.loadOfficeDashboard(false);
     }
        } catch (err) {
     console.error('Failed to save planning groups:', err);
     this.showToast('Błąd zapisu grup', 'error');
        }
      },

      planningScheduleDays() {
        return [...new Set((this.planningSchedule || []).map(entry => entry.day_date).filter(Boolean))];
      },

      planningScheduleCategories() {
        return [...new Set((this.planningSchedule || []).map(entry => entry.category_name || entry.group_name || entry.phase).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
      },

      planningScheduleEntries() {
        return (this.planningSchedule || []).filter(entry => {
     if (this.planningScheduleFilter.day && entry.day_date !== this.planningScheduleFilter.day) return false;
     if (this.planningScheduleFilter.court && entry.court_id !== this.planningScheduleFilter.court) return false;
     if (this.planningScheduleFilter.category) {
       const category = entry.category_name || entry.group_name || entry.phase || '';
       if (category !== this.planningScheduleFilter.category) return false;
     }
     return true;
        });
      },

      planningScheduleStatusLabel(status) {
        const labels = { draft: 'Roboczy', planned: 'Zaplanowany', scheduled: 'Zaplanowany', in_progress: 'W toku', completed: 'Zakończony', cancelled: 'Odwołany', moved: 'Przeniesiony' };
        return labels[status] || status || 'Roboczy';
      },

      planningPlayerNameOptions() {
        return (this.planningPlayers || []).map(player => player.name || `${player.first_name || ''} ${player.last_name || ''}`.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pl'));
      },

      planningScheduleCategoryIsDoubles() {
        const label = String(this.planningNewSchedule?.category_name || '').trim();
        const cats = this.tournamentCategoriesFor(this.planningTournamentId).filter(cat => cat.is_doubles && cat.is_active !== 0);
        if (label) return cats.find(cat => cat.label === label) || null;
        return this.planningSelectedCategoryIsDoubles() ? this.planningSelectedCategory() : null;
      },

      planningScheduleNameOptions() {
        const doublesCat = this.planningScheduleCategoryIsDoubles();
        if (doublesCat) {
          return this.planningTeamsForCategory(doublesCat.id)
            .map(team => team.display_name)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'pl'));
        }
        return this.planningPlayerNameOptions();
      },

      async addPlanningTeam() {
        const category = this.planningSelectedCategory();
        if (!this.planningTournamentId || !category?.is_doubles) return;
        const player1Id = Number(this.planningNewTeam.player1_id || 0);
        const player2Id = Number(this.planningNewTeam.player2_id || 0);
        if (!player1Id || !player2Id || player1Id === player2Id) {
          this.showToast('Wybierz dwóch różnych zawodników', 'warning');
          return;
        }
        try {
          const response = await fetch(`/admin/api/tournaments/${this.planningTournamentId}/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category_id: category.id,
              player1_id: player1Id,
              player2_id: player2Id,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Failed to add team');
          this.planningTeams = Array.isArray(payload.teams) ? payload.teams : this.planningTeams;
          this.planningNewTeam = { player1_id: '', player2_id: '' };
          this.showToast('Para dodana', 'success');
        } catch (err) {
          this.showToast(err.message || 'Błąd dodawania pary', 'error');
        }
      },

      async deletePlanningTeam(team) {
        if (!this.planningTournamentId || !team?.id) return;
        if (this.planningTeamAssignments[team.id]) {
          this.showToast('Nie można usunąć pary przypisanej do grupy', 'warning');
          return;
        }
        if (!confirm('Usunąć tę parę z kategorii?')) return;
        try {
          const response = await fetch(`/admin/api/tournaments/${this.planningTournamentId}/teams/${team.id}`, { method: 'DELETE' });
          const payload = await response.json().catch(() => ({}));
          if (response.status === 409) {
            this.showToast(payload.error || 'Nie można usunąć pary przypisanej do grupy', 'warning');
            return;
          }
          if (!response.ok) throw new Error(payload.error || 'Failed to delete team');
          this.planningTeams = Array.isArray(payload.teams) ? payload.teams : this.planningTeams;
          this.showToast('Para usunięta', 'success');
        } catch (err) {
          this.showToast(err.message || 'Błąd usuwania pary', 'error');
        }
      },

      planningCourtLabel(courtId) {
        const court = (this.planningCourts || []).find(item => String(item.kort_id) === String(courtId));
        return court?.name || court?.kort_id || courtId || '';
      },

      async generatePlanningSchedule() {
        if (!this.planningTournamentId) return;
        try {
     const response = await fetch(`/admin/api/tournaments/${this.planningTournamentId}/schedule/generate`, { method: 'POST' });
     if (!response.ok) throw new Error('Failed to generate schedule');
     const payload = await response.json();
     this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : [];
     this.showToast('Wpisy terminarza wygenerowane', 'success');
        } catch (err) {
     console.error('Failed to generate schedule:', err);
     this.showToast('Błąd generowania terminarza', 'error');
        }
      },

      async savePlanningScheduleEntry(entry) {
        if (!this.planningTournamentId || !entry?.id) return;
        try {
     const response = await fetch(`/admin/api/tournaments/${this.planningTournamentId}/schedule/${entry.id}`, {
       method: 'PATCH',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(entry),
     });
     if (!response.ok) throw new Error('Failed to save schedule entry');
     const payload = await response.json();
     this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
     this.showToast('Wpis terminarza zapisany', 'success');
        } catch (err) {
     console.error('Failed to save schedule entry:', err);
     this.showToast('Błąd zapisu wpisu terminarza', 'error');
        }
      },

      async addPlanningScheduleEntry() {
        if (!this.planningTournamentId) return;
        if (!this.planningNewSchedule.player1_name || !this.planningNewSchedule.player2_name || this.planningNewSchedule.player1_name === this.planningNewSchedule.player2_name) {
     this.showToast('Wybierz dwóch różnych zawodników', 'warning');
     return;
        }
        try {
     const response = await fetch(`/admin/api/tournaments/${this.planningTournamentId}/schedule`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(this.planningNewSchedule),
     });
     const payload = await response.json().catch(() => ({}));
     if (!response.ok) throw new Error(payload.error || 'Failed to add schedule entry');
     this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : this.planningSchedule;
     const dayDate = this.planningNewSchedule.day_date;
     const courtId = this.planningNewSchedule.court_id;
     const category = this.planningNewSchedule.category_name;
     this.planningNewSchedule = {
       day_date: dayDate,
       scheduled_time: '',
       court_id: courtId,
       category_name: category,
       phase: 'Grupowa',
       player1_name: '',
       player2_name: '',
       status: 'planned',
       notes_public: '',
       notes_internal: '',
     };
     this.showToast('Dodano wpis terminarza', 'success');
        } catch (err) {
     console.error('Failed to add schedule entry:', err);
     this.showToast(err.message || 'Błąd dodawania wpisu terminarza', 'error');
        }
      },

      async deletePlanningScheduleEntry(entry) {
        if (!this.planningTournamentId || !entry?.id) return;
        if (!confirm('Usunąć ten wpis terminarza?')) return;
        try {
     const response = await fetch(`/admin/api/tournaments/${this.planningTournamentId}/schedule/${entry.id}`, { method: 'DELETE' });
     if (!response.ok) throw new Error('Failed to delete schedule entry');
     const payload = await response.json();
     this.planningSchedule = Array.isArray(payload.schedule) ? payload.schedule : [];
     this.showToast('Wpis usunięty', 'success');
        } catch (err) {
     console.error('Failed to delete schedule entry:', err);
     this.showToast('Błąd usuwania wpisu terminarza', 'error');
        }
      },
      
      // ===== PLAYERS =====
      async loadPlayers(tournamentId) {
        if (!tournamentId) return;
        
        this.loading.players = true;
        try {
     const response = await fetch(`/admin/api/tournaments/${tournamentId}/players`);
     if (!response.ok) throw new Error('Failed to load players');
     this.players = await response.json();
     await this.loadTournamentCategoriesCache(tournamentId);
        } catch (err) {
     console.error('Failed to load players:', err);
     this.showToast('Błąd ładowania graczy', 'error');
        } finally {
     this.loading.players = false;
        }
      },
      
      async addPlayer() {
        if (!this.selectedTournament || !this.newPlayer.last_name) {
     this.showToast('Wprowadź nazwisko gracza', 'warning');
     return;
        }
        
        try {
     const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(this.newPlayer),
     });
     
     if (!response.ok) throw new Error('Failed to add player');
     
     this.showToast('Gracz dodany', 'success');
     this.newPlayer = { first_name: '', last_name: '', category: '', gender: '', country: '' };
     await this.loadPlayers(this.selectedTournament);
        } catch (err) {
     console.error('Failed to add player:', err);
     this.showToast('Błąd dodawania gracza', 'error');
        }
      },
      
      async deletePlayer(playerId) {
        if (!confirm('Czy na pewno usunąć tego gracza?')) return;
        
        try {
     const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/${playerId}`, {
       method: 'DELETE',
     });
     
     if (!response.ok) throw new Error('Failed to delete player');
     
     this.showToast('Gracz usunięty', 'success');
     await this.loadPlayers(this.selectedTournament);
        } catch (err) {
     console.error('Failed to delete player:', err);
     this.showToast('Błąd usuwania gracza', 'error');
        }
      },

      editPlayer(player) {
        this.editingPlayerId = player.id;
        this.editPlayerData = {
     first_name: player.first_name || '',
     last_name: player.last_name || '',
     category: player.category || '',
     gender: player.gender || '',
     country: player.country || '',
        };
      },

      cancelEditPlayer() {
        this.editingPlayerId = null;
      },

      async savePlayer(playerId) {
        try {
     const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/${playerId}`, {
       method: 'PUT',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(this.editPlayerData),
     });
     if (!response.ok) throw new Error('Failed to update player');
     this.editingPlayerId = null;
     this.showToast('Gracz zaktualizowany', 'success');
     await this.loadPlayers(this.selectedTournament);
        } catch (err) {
     console.error('Failed to update player:', err);
     this.showToast('Błąd edycji gracza', 'error');
        }
      },
      
      async importPlayers() {
        if (!this.selectedTournament || !this.importText.trim()) {
     this.showToast('Wprowadź dane graczy', 'warning');
     return;
        }
        
        try {
     const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/parse-import`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ text: this.importText }),
     });
     
     if (!response.ok) throw new Error('Failed to import players');

     const payload = await response.json();
     this.importPreview = {
       players: Array.isArray(payload.players) ? payload.players : [],
       count: Number(payload.count || 0),
       needs_attention_count: Number(payload.needs_attention_count || 0),
     };
     this.$nextTick(() => this.$refs.importPreviewModal?.showModal());
        } catch (err) {
     console.error('Failed to import players:', err);
     this.showToast('Błąd importu graczy', 'error');
        }
      },

      normalizeImportGender(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (raw === 'K' || raw === 'M') return raw;
        return '';
      },

      normalizeImportCategory(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      },

      normalizeImportCountry(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
      },

      importPreviewRowKey(player, index) {
        return `${player?.line_number || 'row'}-${player?.raw_line || ''}-${index}`;
      },

      importPreviewDisplayName(player) {
        return `${player?.first_name || ''} ${player?.last_name || ''}`.trim() || player?.name || '';
      },

      importStartGroup(player) {
        if (player?.start_group) return player.start_group;
        return sharedPlanningDivisionKey(
     player?.category || '',
     player?.gender || '',
     this.mixedBandsForTournament(this.selectedTournament),
        );
      },

      importPreviewSummary() {
        const grouped = new Map();
        for (const player of this.importPreview.players || []) {
     const startGroup = this.importStartGroup(player);
     if (!grouped.has(startGroup)) {
       grouped.set(startGroup, { start_group: startGroup, count: 0, players: [] });
     }
     const bucket = grouped.get(startGroup);
     bucket.count += 1;
     bucket.players.push(this.importPreviewDisplayName(player));
        }
        return [...grouped.values()].sort((left, right) => {
     if (left.start_group === 'NIEPRZYPISANI') return 1;
     if (right.start_group === 'NIEPRZYPISANI') return -1;
     return left.start_group.localeCompare(right.start_group, 'pl');
        });
      },

      importPreviewWarnings(player) {
        const warnings = [];
        const firstName = String(player?.first_name || '').trim();
        const lastName = String(player?.last_name || '').trim();
        const country = String(player?.country || '').trim().toUpperCase();

        if (!firstName && !lastName) warnings.push('Brak imienia i nazwiska');
        else if (!firstName || !lastName) warnings.push('Sprawdz podzial imienia i nazwiska');
        if (!this.normalizeImportCategory(player?.category || '')) warnings.push('Brak kategorii startowej');
        if (!this.normalizeImportGender(player?.gender || '')) warnings.push('Brak podzialu K/M');
        if (!country) warnings.push('Brak kraju');
        else if (this.normalizeImportCountry(country) !== country) warnings.push('Kraj powinien miec kod 2-literowy');
        return [...new Set(warnings)];
      },

      normalizeImportPreviewPlayer(player) {
        player.first_name = String(player?.first_name || '').trim();
        player.last_name = String(player?.last_name || '').trim();
        player.category = this.normalizeImportCategory(player?.category || '');
        player.gender = this.normalizeImportGender(player?.gender || '');
        player.country = this.normalizeImportCountry(player?.country || '');
      },

      removeImportPreviewPlayer(index) {
        this.importPreview.players.splice(index, 1);
      },

      closeImportPreview() {
        this.$refs.importPreviewModal?.close();
      },

      async confirmImportPlayers() {
        if (!this.selectedTournament || !(this.importPreview.players || []).length) {
     this.showToast('Brak graczy do importu', 'warning');
     return;
        }

        try {
     const players = this.importPreview.players.map(player => {
       this.normalizeImportPreviewPlayer(player);
       return {
         name: this.importPreviewDisplayName(player),
         first_name: player.first_name || '',
         last_name: player.last_name || '',
         category: player.category || '',
         gender: player.gender || '',
         country: player.country || '',
       };
     });

     const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/bulk`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ players }),
     });

     if (!response.ok) throw new Error('Failed to import players');

     this.showToast(`Zaimportowano ${players.length} graczy`, 'success');
     this.importText = '';
     this.importPreview = { players: [], count: 0, needs_attention_count: 0 };
     this.closeImportPreview();
     await this.loadPlayers(this.selectedTournament);
        } catch (err) {
     console.error('Failed to confirm import players:', err);
     this.showToast('Błąd importu graczy', 'error');
        }
      },

      getTournamentById(tournamentId) {
        const normalizedId = Number(tournamentId);
        if (!normalizedId) return null;
        return this.tournaments.find(tournament => Number(tournament.id) === normalizedId) || null;
      },

      activeTournamentsList() {
        return (this.tournaments || []).filter(tournament => tournament.active);
      },

      officeTournamentsList() {
        return [...(this.tournaments || [])].sort((left, right) => {
    const activeDelta = Number(right.active || 0) - Number(left.active || 0);
    if (activeDelta !== 0) return activeDelta;
    return String(left.name || '').localeCompare(String(right.name || ''), 'pl');
        });
      },

      activeTournamentSlot(tournamentId) {
        const normalizedId = Number(tournamentId);
        if (!normalizedId) return null;
        const index = this.activeTournamentsList().findIndex(tournament => Number(tournament.id) === normalizedId);
        return index >= 0 ? index + 1 : null;
      },
  };
}
