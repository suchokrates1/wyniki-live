import Alpine from 'alpinejs';
import './main.css';
import { createAuthAdmin, installAdminFetchAuth } from './admin/auth.js';
import { createCourtsAdmin } from './admin/courts.js';
import { createTournamentsAdmin } from './admin/tournaments.js';
import { createOfficeTabAdmin } from './admin/officeTab.js';
import { createGlobalPlayersAdmin } from './admin/globalPlayers.js';
import { createOverlayAdmin } from './admin/overlay.js';
import { mergeAdminModules } from './admin/merge.js';

window.Alpine = Alpine;
installAdminFetchAuth();

Alpine.data('adminApp', () => mergeAdminModules(
  {
    activeTab: 'courts',

    // UI State
    loading: {
      courts: false,
      tournaments: false,
      players: false,
      office: false,
    },

    async init() {
      if (this.adminNeedsAuth) return;
      this.loadCourts();
      this.loadTournaments();
      this.loadEmailSettings();
      this.loadOverlaySettings();
      this.loadGlobalPlayers();
      this._loadDemoStatus();
      // Load live court data (battery, scores) for courts tab
      fetch('/api/snapshot').then(r => r.json()).then(d => {
        const c = d.courts || d;
        Object.keys(c).forEach(id => { this.courtData[id] = c[id]; });
      }).catch(() => {});
      // Start SSE for live updates (battery, scores)
      this._initGlobalSSE();
      // Recalc canvas scale on resize
      window.addEventListener('resize', () => this.updateCanvasScale());
      this.$nextTick(() => this.updateCanvasScale());
      // Keyboard nudge for selected element(s)
      window.addEventListener('keydown', (e) => this._handleKeyNudge(e));
      window.addEventListener('visibilitychange', () => {
        if (document.hidden || this.activeTab !== 'office' || !this.officeTournamentId) return;
        this.officeSseFailures = 0;
        this.connectAdminOfficeSSE();
        this.loadOfficeDashboard(false);
      });
      window.addEventListener('pagehide', () => this.stopAdminOfficeSSE());
      this.$watch('activeTab', (tab) => {
        if (tab === 'office' && this.officeTournamentId) this.connectAdminOfficeSSE();
        else this.stopAdminOfficeSSE();
      });
      this.$watch('officeTournamentId', (tournamentId) => {
        if (this.activeTab === 'office' && tournamentId) this.connectAdminOfficeSSE();
        else if (!tournamentId) this.stopAdminOfficeSSE();
      });
    },
  },
  createAuthAdmin(),
  createCourtsAdmin(),
  createTournamentsAdmin(),
  createOfficeTabAdmin(),
  createGlobalPlayersAdmin(),
  createOverlayAdmin(),
));

Alpine.start();
