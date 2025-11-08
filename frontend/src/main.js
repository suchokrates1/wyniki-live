import Alpine from 'alpinejs';
import '../src/main.css';

// Initialize Alpine.js
window.Alpine = Alpine;

// Import composables
import { useSSE } from './composables/useSSE';
import { useCourtData } from './composables/useCourtData';
import { useTranslations } from './composables/useTranslations';
import { useTheme } from './composables/useTheme';

// Alpine.js main component
Alpine.data('tennisApp', () => ({
  courts: {},
  history: [],
  loading: true,
  error: null,
  lastUpdate: null,
  paused: false,
  lang: 'pl',
  
  init() {
    console.log('🎾 Tennis Live Scores - Initializing...');
    
    // Initialize theme
    const theme = useTheme();
    theme.init();
    
    // Initialize translations
    const translations = useTranslations();
    this.lang = translations.getCurrentLang();
    
    // Initialize SSE connection
    const sse = useSSE();
    sse.connect((data) => {
      if (data.courts) {
        this.courts = data.courts;
        this.lastUpdate = new Date();
        this.loading = false;
      }
      if (data.history) {
        this.history = data.history;
      }
    }, (error) => {
      this.error = error;
      this.loading = false;
    });
    
    // Load initial data
    this.loadSnapshot();
  },
  
  async loadSnapshot() {
    try {
      const response = await fetch('/api/snapshot');
      const data = await response.json();
      this.courts = data;
      this.lastUpdate = new Date();
      this.loading = false;
    } catch (err) {
      this.error = 'Failed to load initial data';
      console.error(err);
    }
  },
  
  async loadHistory() {
    try {
      const response = await fetch('/api/history');
      const data = await response.json();
      this.history = data;
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  },
  
  getCourtIds() {
    return Object.keys(this.courts).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
      if (isNaN(na)) return 1;
      if (isNaN(nb)) return -1;
      return na - nb;
    });
  },
  
  isMatchActive(courtId) {
    return this.courts[courtId]?.match_status?.active || false;
  },
  
  getScore(courtId, player) {
    const court = this.courts[courtId];
    if (!court) return { points: '0', games: 0, sets: [] };
    
    const playerData = court[player];
    return {
      points: playerData?.points || '0',
      games: playerData?.current_games || 0,
      sets: [
        playerData?.set1 || 0,
        playerData?.set2 || 0,
        playerData?.set3 || 0
      ].filter(s => s > 0 || court[player === 'A' ? 'B' : 'A']?.[`set${[1,2,3].indexOf(s)+1}`] > 0)
    };
  },
  
  formatTime(seconds) {
    if (!seconds) return '00:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  },
  
  togglePause() {
    this.paused = !this.paused;
    // Implement pause logic
  }
}));

// Start Alpine
Alpine.start();

console.log('✅ Alpine.js initialized');
