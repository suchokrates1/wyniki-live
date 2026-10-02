import {
  inferMixedPlayerBands,
  mixedCategoryDisplayLabel,
  planningDivisionKey as sharedPlanningDivisionKey,
  assignedTournamentCategoryId,
  playerMatchesDoublesCategory,
  playerMatchesTournamentCategory,
  categoryFilterKey,
  categoryFilterKeys,
  categoryFilterLabel,
} from '../shared/categories.js';
import { PLAY_FORMATS, normalizePlayFormat } from '../shared/playFormat.js';

export function createTournamentsAdmin() {
  return {
      // Tournaments
      tournaments: [],
      selectedTournament: null,
      editingTournamentId: null,
      courtStreams: { days: [], today: '', courts: [], links: {}, shared: {}, off_courts: [] },
      streamsSharedAll: false,
      streamsSaving: false,
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
      newCategoryPresetSelected: { B1K: true, B1M: true, B2K: true, B2M: true, B3K: true, B3M: true, B4K: true, B4M: true },
      newCategoryPresetDoubles: {},
      newCategoryCustomLabel: '',
      newCategoryCustomHints: '',
      newCategoryCustomDoubles: false,
      tournamentCategoriesCache: {},

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
      this.newCategoryPresetSelected = this.allAdminCategoryPresets();
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
    await this.loadAdminCourtStreams(tournament.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
      },

      applyAdminCourtStreams(payload = {}) {
        this.courtStreams = {
          days: Array.isArray(payload.days) ? payload.days : [],
          today: payload.today || '',
          courts: Array.isArray(payload.courts) ? payload.courts : [],
          links: payload.links && typeof payload.links === 'object' ? payload.links : {},
          shared: payload.shared && typeof payload.shared === 'object' ? payload.shared : {},
          off_courts: Array.isArray(payload.off_courts) ? payload.off_courts.map(String) : [],
        };
        this.streamsSharedAll = !!payload.shared_all_courts;
      },

      adminStreamUrl(day, kortId) {
        return this.courtStreams.links?.[day]?.[kortId] || '';
      },

      setAdminStreamUrl(day, kortId, value) {
        if (!this.courtStreams.links[day]) this.courtStreams.links[day] = {};
        this.courtStreams.links[day][kortId] = value;
      },

      adminSharedStreamUrl(day) {
        return this.courtStreams.shared?.[day] || '';
      },

      setAdminSharedStreamUrl(day, value) {
        if (!this.courtStreams.shared) this.courtStreams.shared = {};
        this.courtStreams.shared[day] = value;
      },

      isAdminStreamCourtOn(kortId) {
        return !(this.courtStreams.off_courts || []).includes(String(kortId));
      },

      toggleAdminStreamCourtOn(kortId) {
        const id = String(kortId);
        const current = new Set(this.courtStreams.off_courts || []);
        if (current.has(id)) current.delete(id);
        else current.add(id);
        this.courtStreams.off_courts = [...current];
      },

      toggleAdminStreamsSharedAll() {
        this.streamsSharedAll = !this.streamsSharedAll;
        if (!this.streamsSharedAll) return;
        if (!this.courtStreams.off_courts) this.courtStreams.off_courts = [];
        if (!this.courtStreams.shared) this.courtStreams.shared = {};
        for (const day of this.courtStreams.days || []) {
          if (this.courtStreams.shared[day]) continue;
          const row = this.courtStreams.links?.[day] || {};
          const first = Object.values(row).find((url) => String(url || '').trim());
          this.courtStreams.shared[day] = first || '';
        }
      },

      formatAdminStreamDay(day) {
        const date = new Date(`${day}T12:00:00`);
        if (Number.isNaN(date.getTime())) return String(day || '');
        try {
          return new Intl.DateTimeFormat('pl', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
        } catch {
          return String(day || '');
        }
      },

      isAdminStreamToday(day) {
        return String(day || '') === String(this.courtStreams.today || '');
      },

      async loadAdminCourtStreams(tournamentId) {
        if (!tournamentId) return;
        try {
          const response = await fetch(`/admin/api/tournaments/${tournamentId}/court-streams`);
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Błąd ładowania linków transmisji');
          this.applyAdminCourtStreams(payload.court_streams || {});
        } catch (err) {
          console.error('Failed to load court streams:', err);
          this.showToast('Błąd ładowania linków transmisji', 'error');
        }
      },

      async saveAdminCourtStreams() {
        if (!this.editTournament.id) return;
        this.streamsSaving = true;
        try {
          const response = await fetch(`/admin/api/tournaments/${this.editTournament.id}/court-streams`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shared_all_courts: !!this.streamsSharedAll,
              shared: this.courtStreams.shared || {},
              off_courts: this.courtStreams.off_courts || [],
              links: this.courtStreams.links || {},
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error === 'invalid_url' ? 'Nieprawidłowy adres URL' : (payload.error || 'Błąd zapisu linków'));
          }
          this.applyAdminCourtStreams(payload.court_streams || {});
          this.showToast('Zapisano linki do transmisji', 'success');
        } catch (err) {
          console.error('Failed to save court streams:', err);
          this.showToast(err.message || 'Błąd zapisu linków transmisji', 'error');
        } finally {
          this.streamsSaving = false;
        }
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
    this.courtStreams = { days: [], today: '', courts: [], links: {}, shared: {}, off_courts: [] };
    this.streamsSharedAll = false;
      },

      adminCategoryPresetKeys() {
    return ['B1K', 'B1M', 'B2K', 'B2M', 'B3K', 'B3M', 'B4K', 'B4M'];
      },

      // a fresh tournament starts with the standard B1–B4 women and men categories ticked
      allAdminCategoryPresets() {
    return Object.fromEntries(this.adminCategoryPresetKeys().map((key) => [key, true]));
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
      if (!categories.length) this.adminCategoryPresetSelected = this.allAdminCategoryPresets();
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
