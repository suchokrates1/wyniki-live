import Alpine from 'alpinejs';
import { ignoreCancelledAlpineTransitions } from './shared/alpineTransitions.js';
import './main.css';
import './styles/tailwind-admin.css';
import './styles/admin.css';
import './styles/admin-list.css';
import './styles/admin-forms.css';
import './styles/admin-courts.css';
import { createAuthAdmin, installAdminFetchAuth } from './admin/auth.js';
import { createCourtsAdmin } from './admin/courts.js';
import { createDirectorPanel } from './admin/directorPanel.js';
import { createTournamentsAdmin } from './admin/tournaments.js';
import { createOfficeTabAdmin } from './admin/officeTab.js';
import { createGlobalPlayersAdmin } from './admin/globalPlayers.js';
import { createOverlayAdmin } from './admin/overlay.js';
import { createPanicAdmin } from './admin/panic.js';
import { createDevicesAdmin } from './admin/devices.js';
import { createAdminShell } from './admin/shell.js';
import { createTournamentsListView } from './admin/tournamentsList.js';
import tournamentsListHtml from './admin/sections/tournamentsList.html?raw';
import tournamentSettingsHtml from './admin/sections/tournamentSettings.html?raw';
import tournamentExtrasHtml from './admin/sections/tournamentExtras.html?raw';
import { createTournamentSettingsView } from './admin/tournamentSettings.js';
import { createTournamentCreateView } from './admin/tournamentCreate.js';
import tournamentCreateHtml from './admin/sections/tournamentCreate.html?raw';
import playersBaseHtml from './admin/sections/playersBase.html?raw';
import playersExtrasHtml from './admin/sections/playersExtras.html?raw';
import playerCreateHtml from './admin/sections/playerCreate.html?raw';
import { createPlayersView } from './admin/playersView.js';
import { createCourtPinsView } from './admin/courtPins.js';
import courtPinsHtml from './admin/sections/courtPins.html?raw';
import courtsListHtml from './admin/sections/courtsList.html?raw';
import { createCourtsListView } from './admin/courtsList.js';
import devicesListHtml from './admin/sections/devicesList.html?raw';
import { createDevicesListView } from './admin/devicesList.js';
import overlayPanelHtml from './admin/overlayPanel.html?raw';
import systemHtml from './admin/sections/system.html?raw';
import moreHtml from './admin/sections/more.html?raw';
import { createSystemView } from './admin/systemView.js';
import { createPluralView } from './admin/plural.js';
import { mergeAdminModules } from './admin/merge.js';
import { registerAnalyticsConsent } from './consent/banner.js';

window.Alpine = Alpine;
registerAnalyticsConsent(Alpine);
installAdminFetchAuth();

const mountAdminPartial = (id, html) => {
  const slot = document.getElementById(id);
  if (slot) slot.innerHTML = html.trim();
};

const adminOverlaySlot = document.getElementById('admin-overlay-panel');
if (adminOverlaySlot) adminOverlaySlot.outerHTML = overlayPanelHtml.trim();
mountAdminPartial('admin-tournaments-list', tournamentsListHtml);
mountAdminPartial('admin-tournament-settings', tournamentSettingsHtml);
mountAdminPartial('admin-tournament-extras', tournamentExtrasHtml);
mountAdminPartial('admin-tournament-create', tournamentCreateHtml);
mountAdminPartial('admin-players-base', playersBaseHtml);
mountAdminPartial('admin-players-extras', playersExtrasHtml);
mountAdminPartial('admin-player-create', playerCreateHtml);
mountAdminPartial('admin-court-pins', courtPinsHtml);
mountAdminPartial('admin-courts-list', courtsListHtml);
mountAdminPartial('admin-devices-list', devicesListHtml);
mountAdminPartial('admin-system', systemHtml);
mountAdminPartial('admin-more', moreHtml);

Alpine.data('adminApp', () => mergeAdminModules(
  {
    activeTab: 'tournaments',

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
      this.loadPanic();
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
  createDirectorPanel(),
  createTournamentsAdmin(),
  createOfficeTabAdmin(),
  createGlobalPlayersAdmin(),
  createOverlayAdmin(),
  createPanicAdmin(),
  createDevicesAdmin(),
  createAdminShell(),
  createTournamentsListView(),
  createTournamentSettingsView(),
  createTournamentCreateView(),
  createPlayersView(),
  createCourtPinsView(),
  createCourtsListView(),
  createDevicesListView(),
  createSystemView(),
  createPluralView(),
));

ignoreCancelledAlpineTransitions();
Alpine.start();
