import { umpireText } from '../i18n.js';
import { AVAILABLE_LANGUAGES } from '../session.js';
import { bindFullscreenChange, isFullscreen, toggleFullscreen } from '../fullscreen.js';
import { applyTheme, saveTheme } from '../offline/theme.js';
import {
  detectOsInstalledPwa,
  dismissPwaGate,
  enableInstalledPwa,
  isStandaloneDisplay,
  markPwaInstalled,
  pwaGateMode,
  shouldShowFullscreenButton,
} from '../pwaInstallGate.js';
import { isIosSafari } from '../../modules/iosInstallHint.js';

export function createUmpirePwaShellSlice({ registerServiceWorker = () => {} } = {}) {
  return {
    gateLang() {
      const raw = String(globalThis.navigator?.language || this.lang || 'en').slice(0, 2).toLowerCase();
      return AVAILABLE_LANGUAGES.some((item) => item.code === raw) ? raw : 'en';
    },

    gt(key, vars) {
      return umpireText(this.gateLang(), key, vars);
    },

    showFullscreenButton() {
      return shouldShowFullscreenButton();
    },

    pwaGate() {
      if (this.screen !== 'language') return null;
      return pwaGateMode({
        standalone: isStandaloneDisplay(),
        canInstall: this.canInstall,
        osInstalled: this.osInstalled,
        dismissed: this.pwaGateDismissed,
        iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints, navigator.platform),
      });
    },

    async toggleFullscreen() {
      try {
        await toggleFullscreen();
      } catch {
        this.isFullscreen = isFullscreen();
      }
    },

    bindFullscreenWatcher() {
      this.isFullscreen = isFullscreen();
      this._unbindFullscreen = bindFullscreenChange((value) => {
        this.isFullscreen = value;
      });
    },

    watchInstallPrompt() {
      this.installed = isStandaloneDisplay();
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        this._installEvent = event;
        this.canInstall = true;
      });
      window.addEventListener('appinstalled', () => {
        markPwaInstalled(globalThis.localStorage);
        this.installed = true;
        this.osInstalled = true;
        this.canInstall = false;
        this._installEvent = null;
      });
      if ('serviceWorker' in navigator) {
        registerServiceWorker();
      }
      detectOsInstalledPwa({
        storage: globalThis.localStorage,
        getRelatedApps: navigator.getInstalledRelatedApps?.bind(navigator),
      }).then((osInstalled) => {
        if (osInstalled) this.osInstalled = true;
      }).catch(() => {});
    },

    skipPwaGate() {
      dismissPwaGate(globalThis.sessionStorage);
      this.pwaGateDismissed = true;
    },

    async acceptPwaGate() {
      const mode = this.pwaGate();
      if (mode === 'install') {
        await this.installApp();
        return;
      }
      if (mode === 'open') {
        await this.openInstalledPwa();
        this.skipPwaGate();
      }
    },

    async openInstalledPwa() {
      await enableInstalledPwa({
        requestFullscreen: async () => {
          if (!isFullscreen()) await toggleFullscreen();
        },
        userAgent: globalThis.navigator?.userAgent || '',
        origin: globalThis.location?.origin || '',
        assignLocation: (url) => {
          globalThis.location.href = url;
        },
      });
    },

    async installApp() {
      if (!this._installEvent) return;
      this._installEvent.prompt();
      const choice = await this._installEvent.userChoice.catch(() => null);
      this._installEvent = null;
      this.canInstall = false;
      if (choice?.outcome === 'accepted') {
        markPwaInstalled(globalThis.localStorage);
        this.osInstalled = true;
        this.installed = true;
        return;
      }
      this.skipPwaGate();
    },

    setTheme(theme) {
      this.theme = saveTheme(theme);
      applyTheme(this.theme);
    },

    themeLabel(theme) {
      return this.t({
        light: 'themeLight',
        dark: 'themeDark',
        system: 'themeSystem',
      }[theme] || 'themeSystem');
    },
  };
}
