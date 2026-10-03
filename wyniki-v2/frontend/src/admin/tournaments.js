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

    // Players

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

      // a fresh tournament starts with the standard B1–B4 women and men categories ticked

      
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
      

      // ===== TOURNAMENT PLANNING =====
      
      

      

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
