import Alpine from 'alpinejs';
import './main.css';

window.Alpine = Alpine;

Alpine.data('adminApp', () => ({
  activeTab: 'courts',
  
  // Courts
  courts: [],
  newCourtId: '',
  newCourtPin: '',
  editingCourt: null,
  editCourtId: '',
  
  // Tournaments
  tournaments: [],
  selectedTournament: null,
  newTournament: {
    name: '',
    start_date: '',
    end_date: '',
  },
  
  // Players
  players: [],
  newPlayer: {
    name: '',
    category: '',
    country: '',
  },
  importText: '',
  
  // UI State
  loading: {
    courts: false,
    tournaments: false,
    players: false,
  },
  
  toast: {
    show: false,
    message: '',
    type: 'info', // info, success, warning, error
  },
  
  // Computed
  get filteredPlayers() {
    return this.players;
  },
  
  init() {
    this.loadCourts();
    this.loadTournaments();
  },
  
  // ===== TOAST =====
  showToast(message, type = 'info') {
    this.toast = { show: true, message, type };
    setTimeout(() => {
      this.toast.show = false;
    }, 3000);
  },
  
  // ===== COURTS =====
  async loadCourts() {
    this.loading.courts = true;
    try {
      const response = await fetch('/admin/api/courts');
      if (!response.ok) throw new Error('Failed to load courts');
      this.courts = await response.json();
    } catch (err) {
      console.error('Failed to load courts:', err);
      this.showToast('Błąd ładowania kortów', 'error');
    } finally {
      this.loading.courts = false;
    }
  },
  
  async refreshCourts() {
    await this.loadCourts();
    this.showToast('Korty odświeżone', 'success');
  },
  
  async updateCourtPin(kortId, pin) {
    try {
      // Validate PIN format
      if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
        this.showToast('PIN musi mieć 4 cyfry', 'warning');
        await this.loadCourts(); // Reload to reset invalid input
        return;
      }
      
      const response = await fetch(`/admin/api/courts/${kortId}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin || null }),
      });
      
      if (!response.ok) throw new Error('Failed to update PIN');
      
      this.showToast(`PIN dla kortu ${kortId} zaktualizowany`, 'success');
      await this.loadCourts();
    } catch (err) {
      console.error('Failed to update PIN:', err);
      this.showToast('Błąd aktualizacji PIN', 'error');
    }
  },
  
  async addCourt() {
    if (!this.newCourtId) {
      this.showToast('Wprowadź ID kortu', 'warning');
      return;
    }
    
    // Validate PIN if provided
    if (this.newCourtPin && (this.newCourtPin.length !== 4 || !/^\d{4}$/.test(this.newCourtPin))) {
      this.showToast('PIN musi mieć 4 cyfry', 'warning');
      return;
    }
    
    try {
      const response = await fetch('/admin/api/courts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kort_id: this.newCourtId,
          pin: this.newCourtPin || null,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to add court');
      
      this.showToast(`Kort ${this.newCourtId} dodany`, 'success');
      this.newCourtId = '';
      this.newCourtPin = '';
      await this.loadCourts();
    } catch (err) {
      console.error('Failed to add court:', err);
      this.showToast('Błąd dodawania kortu', 'error');
    }
  },
  
  startEdit(kortId) {
    this.editingCourt = kortId;
    this.editCourtId = kortId;
  },
  
  cancelEdit() {
    this.editingCourt = null;
    this.editCourtId = '';
  },
  
  async saveCourt(oldKortId) {
    if (!this.editCourtId) {
      this.showToast('ID kortu nie może być puste', 'warning');
      return;
    }
    
    if (this.editCourtId === oldKortId) {
      this.cancelEdit();
      return;
    }
    
    try {
      const response = await fetch(`/admin/api/courts/${oldKortId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kort_id: this.editCourtId }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to rename court');
      }
      
      this.showToast(`Kort ${oldKortId} zmieniono na ${this.editCourtId}`, 'success');
      this.cancelEdit();
      await this.loadCourts();
    } catch (err) {
      console.error('Failed to rename court:', err);
      this.showToast(err.message || 'Błąd zmiany nazwy kortu', 'error');
    }
  },
  
  async deleteCourt(kortId) {
    if (!confirm(`Czy na pewno chcesz usunąć Kort ${kortId}?`)) {
      return;
    }
    
    try {
      const response = await fetch(`/admin/api/courts/${kortId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete court');
      
      this.showToast(`Kort ${kortId} usunięty`, 'success');
      await this.loadCourts();
    } catch (err) {
      console.error('Failed to delete court:', err);
      this.showToast('Błąd usuwania kortu', 'error');
    }
  },
  
  // ===== TOURNAMENTS =====
  async loadTournaments() {
    this.loading.tournaments = true;
    try {
      const response = await fetch('/admin/api/tournaments');
      if (!response.ok) throw new Error('Failed to load tournaments');
      this.tournaments = await response.json();
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
      const response = await fetch('/admin/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.newTournament),
      });
      
      if (!response.ok) throw new Error('Failed to create tournament');
      
      this.showToast('Turniej utworzony', 'success');
      this.newTournament = { name: '', start_date: '', end_date: '' };
      await this.loadTournaments();
    } catch (err) {
      console.error('Failed to create tournament:', err);
      this.showToast('Błąd tworzenia turnieju', 'error');
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
  
  async activateTournament(tournamentId) {
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/activate`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to activate tournament');
      
      this.showToast('Turniej aktywowany', 'success');
      await this.loadTournaments();
    } catch (err) {
      console.error('Failed to activate tournament:', err);
      this.showToast('Błąd aktywacji turnieju', 'error');
    }
  },
  
  async selectTournament(tournamentId) {
    this.selectedTournament = tournamentId;
    this.activeTab = 'players';
    await this.loadPlayers(tournamentId);
  },
  
  // ===== PLAYERS =====
  async loadPlayers(tournamentId) {
    if (!tournamentId) return;
    
    this.loading.players = true;
    try {
      const response = await fetch(`/admin/api/tournaments/${tournamentId}/players`);
      if (!response.ok) throw new Error('Failed to load players');
      this.players = await response.json();
    } catch (err) {
      console.error('Failed to load players:', err);
      this.showToast('Błąd ładowania graczy', 'error');
    } finally {
      this.loading.players = false;
    }
  },
  
  async addPlayer() {
    if (!this.selectedTournament || !this.newPlayer.name) {
      this.showToast('Wprowadź imię i nazwisko gracza', 'warning');
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
      this.newPlayer = { name: '', category: '', country: '' };
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
  
  async importPlayers() {
    if (!this.selectedTournament || !this.importText.trim()) {
      this.showToast('Wprowadź dane graczy', 'warning');
      return;
    }
    
    try {
      const lines = this.importText.trim().split('\n');
      const players = lines
        .filter(line => line.trim())
        .map(line => {
          const parts = line.trim().split(/\s+/);
          const name = parts.slice(0, -2).join(' ') || parts.join(' ');
          const category = parts[parts.length - 2] || '';
          const country = parts[parts.length - 1] || '';
          return { name, category, country };
        });
      
      const response = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players }),
      });
      
      if (!response.ok) throw new Error('Failed to import players');
      
      this.showToast(`Zaimportowano ${players.length} graczy`, 'success');
      this.importText = '';
      await this.loadPlayers(this.selectedTournament);
    } catch (err) {
      console.error('Failed to import players:', err);
      this.showToast('Błąd importu graczy', 'error');
    }
  },
}));

Alpine.start();
