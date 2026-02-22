import Alpine from 'alpinejs';
import './main.css';

// Initialize Alpine.js
window.Alpine = Alpine;

// Tennis App Component
Alpine.data('tennisApp', () => ({
  courts: {},
  loading: true,
  error: null,
  lastUpdate: null,
  lang: 'pl',
  
  init() {
    this.connectSSE();
    this.fetchInitialData();
  },
  
  async fetchInitialData() {
    try {
      const response = await fetch('/api/courts');
      if (!response.ok) throw new Error('Failed to fetch courts');
      const data = await response.json();
      this.courts = data.courts || {};
      this.loading = false;
      this.lastUpdate = new Date();
    } catch (err) {
      this.error = err.message;
      this.loading = false;
    }
  },
  
  connectSSE() {
    const eventSource = new EventSource('/api/stream');
    
    eventSource.addEventListener('court_update', (e) => {
      const data = JSON.parse(e.data);
      this.courts[data.court_id] = data;
      this.lastUpdate = new Date();
    });
    
    eventSource.onerror = () => {
      this.error = 'Połączenie przerwane';
      setTimeout(() => this.connectSSE(), 5000);
    };
  },
  
  getCourtIds() {
    return Object.keys(this.courts).sort();
  },
  
  isMatchActive(courtId) {
    return this.courts[courtId]?.match_status?.active || false;
  },
  
  getScore(courtId, player) {
    const court = this.courts[courtId];
    if (!court) return { sets: [], points: '-' };
    
    const playerData = court[player];
    if (!playerData) return { sets: [], points: '-' };
    
    return {
      sets: playerData.sets || [],
      points: playerData.points || '0'
    };
  },
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}));

// Theme Store
Alpine.store('theme', {
  current: localStorage.getItem('theme') || 'light',
  
  toggle() {
    this.current = this.current === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', this.current);
    document.documentElement.setAttribute('data-theme', this.current);
  },
  
  init() {
    document.documentElement.setAttribute('data-theme', this.current);
  }
});

// Start Alpine
Alpine.start();

// Initialize theme
Alpine.store('theme').init();
