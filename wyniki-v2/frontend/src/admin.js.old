import Alpine from 'alpinejs';
import './main.css';

/* Initialize Alpine.js */
window.Alpine = Alpine;

/* Admin App Component */
Alpine.data('adminApp', () => ({
  activeTab: 'tournaments',
  tournaments: [],
  selectedTournament: null,
  courts: {},
  loading: false,
  
  init() {
    this.loadTournaments();
  },
  
  async loadTournaments() {
    try {
      const response = await fetch('/api/admin/tournaments');
      const data = await response.json();
      this.tournaments = data.tournaments || [];
    } catch (err) {
      console.error('Failed to load tournaments:', err);
    }
  },
  
  async saveCourt(courtId) {
    // Implementation for saving court data
    console.log('Saving court:', courtId);
  }
}));

Alpine.start();
