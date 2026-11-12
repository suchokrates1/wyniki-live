import Alpine from 'alpinejs';
import { mergeAdminModules } from '../admin/merge.js';
import { createUmpireApi } from './api.js';
import { umpireText } from './i18n.js';
import { DEFAULT_MATCH_CONFIG_FORM } from './matchConfigForm.js';
import { createPinPad } from './pinPad.js';
import { AVAILABLE_LANGUAGES, createUmpireSession, firstScreen } from './session.js';
import { createMatchController } from './match/matchController.js';
import { matchTimerText } from './match/matchTimer.js';
import { emptyMotionUi } from './match/matchMotion.js';
import { createWakeLock } from './match/wakeLock.js';
import { createDiagnostics } from './offline/diagnostics.js';
import { createBatteryMonitor } from './offline/battery.js';
import { umpireClientHeaders } from './offline/clientHeaders.js';
import { APP_VERSION } from './offline/heartbeat.js';
import { applyTheme, readTheme, THEMES } from './offline/theme.js';
import { wasPwaGateDismissed } from './pwaInstallGate.js';
import { createUmpireCourtPinSlice } from './app/courtPinSlice.js';
import { createUmpireDirectorAndSyncSlice } from './app/directorAndSyncSlice.js';
import { createUmpireMatchFinishSlice } from './app/matchFinishSlice.js';
import { createUmpireMatchScreenSlice } from './app/matchScreenSlice.js';
import { createUmpireNavigationSlice } from './app/navigationSlice.js';
import { createUmpirePlayersAndConfigSlice } from './app/playersAndConfigSlice.js';
import { createUmpirePwaShellSlice } from './app/pwaShellSlice.js';
import { createUmpireSettingsHistoryPanicSlice } from './app/settingsHistoryPanicSlice.js';
import { createUmpireTutorialSlice } from './app/tutorialSlice.js';
import '../styles/fonts.css';
import './umpire.css';

const session = createUmpireSession();
const wakeLock = createWakeLock();

/** Scope for this worker. The public PWA owns '/', so we must not register there too. */
const UMPIRE_SW_SCOPE = '/umpire';

async function registerUmpireServiceWorker() {
  try {
    await navigator.serviceWorker.register('/umpire-sw.js', { scope: UMPIRE_SW_SCOPE });
  } catch {
    return;
  }
  try {
    const stale = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      stale
        .filter((registration) => {
          const scope = new URL(registration.scope).pathname;
          const script = registration.active?.scriptURL || registration.waiting?.scriptURL
            || registration.installing?.scriptURL || '';
          return scope === '/' && script.endsWith('/umpire-sw.js');
        })
        .map((registration) => registration.unregister().catch(() => false)),
    );
  } catch {
    /* the new registration is in place either way */
  }
}

export function createUmpireApp() {
  const pinPad = createPinPad();
  const battery = createBatteryMonitor();
  const api = createUmpireApi({
    getToken: () => session.getCourtSession()?.token || null,
    getClientHeaders: () => umpireClientHeaders({
      appVersion: APP_VERSION,
      locale: session.getLanguage() || globalThis.navigator?.language || '',
    }),
    getBattery: () => battery.get(),
  });

  return mergeAdminModules(
    {
      languages: AVAILABLE_LANGUAGES,
      screen: firstScreen({
        hasLanguage: session.hasLanguageSelected(),
        hasTournamentToday: Boolean(session.getTournamentForToday()),
      }),
      lang: session.hasLanguageSelected() ? session.getLanguage() : 'en',
      loading: false,
      error: '',
      tournaments: [],
      courts: [],
      players: [],
      suggestion: null,
      selectedIds: [],
      isDoubles: false,
      search: '',
      showAddPlayer: false,
      addForm: { firstName: '', lastName: '', country: '', category: '' },
      team1Name: null,
      team2Name: null,
      selectedScheduleId: null,
      _advanceTimer: null,
      pinOpen: false,
      pinCourt: null,
      pinBusy: false,
      pinError: '',
      pinBoxes: ['', '', '', ''],
      configForm: { ...DEFAULT_MATCH_CONFIG_FORM },
      draft: null,
      settingsFrom: 'court',
      match: null,
      matchRev: 0,
      motion: emptyMotionUi(),
      _motionPrev: null,
      _motionTimers: {},
      _lastAnnouncement: null,
      timerText: '00:00',
      _timerId: null,
      dialog: null,
      finishStep: null,
      panicNote: '',
      panicStatus: '',
      panicToast: '',
      theme: readTheme(),
      themes: THEMES,
      historyEntries: [],
      historyDetail: null,
      diagnosticsCopyOk: false,
      canInstall: false,
      installed: false,
      osInstalled: false,
      pwaGateDismissed: wasPwaGateDismissed(globalThis.sessionStorage),
      isFullscreen: false,
      directorToast: false,
      _directorToastTimer: null,
      _pollActive: false,
      _outbox: null,
      _history: null,
      _diagnostics: createDiagnostics(),
      _heartbeat: null,
      _battery: battery,
      tutorialMode: false,
      tutorialStepIndex: 0,
      tutorialActionOk: false,
      tutorialReturnScreen: 'settings',
      tutorialCourtSession: null,
      tutorialBanner: false,

      t(key, vars) {
        return umpireText(this.lang, key, vars);
      },

      async init() {
        applyTheme(this.theme);
        this.applyChromeLanguage(this.lang);
        this.watchInstallPrompt();
        this.match = createMatchController({
          onChange: () => this.onMatchChange(),
          onSync: (reason, state, extra) => this.syncMatch(reason, state, extra),
        });
        await this.initOffline();
        const hashScreen = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
        if (hashScreen) this.screen = hashScreen;
        if (!session.isTutorialMode()) this.restoreActiveMatch();
        this.ensureMatchFromDraft();
        this.go(this.screen, { replace: true });
        this.maybeShowTutorialBanner();
        window.addEventListener('hashchange', () => this.syncFromHash());
        window.addEventListener('online', () => {
          if (!this.tutorialMode) this.flushOutbox();
        });
        window.addEventListener('beforeunload', (event) => {
          if (this.match?.chrome()?.confirmLeave) {
            event.preventDefault();
            event.returnValue = '';
          }
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          if (this.screen === 'match' && this.match?.state?.matchStartTime) wakeLock.request();
          if (navigator.onLine && !this.tutorialMode) this.flushOutbox();
        });
        this._timerId = setInterval(() => {
          if (this.match?.state) this.timerText = matchTimerText(this.match.state, Date.now());
        }, 1000);
        this.bindFullscreenWatcher();
      },
    },
    createUmpireNavigationSlice({ session, wakeLock }),
    createUmpirePwaShellSlice({ registerServiceWorker: registerUmpireServiceWorker }),
    createUmpireDirectorAndSyncSlice({ api, session }),
    createUmpireCourtPinSlice({ api, session, pinPad }),
    createUmpirePlayersAndConfigSlice({ api, session }),
    createUmpireSettingsHistoryPanicSlice({ api, session }),
    createUmpireTutorialSlice({ session }),
    createUmpireMatchScreenSlice({ wakeLock }),
    createUmpireMatchFinishSlice({ session, wakeLock }),
  );
}

if (typeof window !== 'undefined') {
  window.Alpine = Alpine;
  Alpine.data('umpireApp', createUmpireApp);
  Alpine.start();
}
