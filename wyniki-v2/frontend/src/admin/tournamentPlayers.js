/** Entries of one tournament: the list, adding, editing and removing a player. */

export function createTournamentPlayersAdmin() {
  return {
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

      get filteredPlayers() {
     return this.players;
      },

      async selectTournament(tournamentId) {
    this.selectedTournament = tournamentId;
    this.activeTab = 'players';
    await this.loadPlayers(tournamentId);
      },

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
  };
}
