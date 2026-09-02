export const PWA_INSTALLED_KEY = 'umpire.pwa_installed';
export const PWA_GATE_DISMISSED_KEY = 'umpire.pwa_gate_dismissed';

export function isStandaloneDisplay(win = window) {
  return Boolean(
    win.matchMedia?.('(display-mode: standalone)').matches
    || win.navigator?.standalone
  );
}

export function pwaGateMode({ standalone, canInstall, osInstalled, dismissed }) {
  if (standalone || dismissed) return null;
  if (osInstalled) return 'open';
  if (canInstall) return 'install';
  return null;
}

export function markPwaInstalled(storage) {
  storage?.setItem?.(PWA_INSTALLED_KEY, '1');
}

export function wasPwaGateDismissed(storage) {
  return storage?.getItem?.(PWA_GATE_DISMISSED_KEY) === '1';
}

export function dismissPwaGate(storage) {
  storage?.setItem?.(PWA_GATE_DISMISSED_KEY, '1');
}

export async function detectOsInstalledPwa({
  storage,
  getRelatedApps,
} = {}) {
  if (storage?.getItem?.(PWA_INSTALLED_KEY) === '1') return true;
  if (typeof getRelatedApps !== 'function') return false;
  try {
    const apps = await getRelatedApps();
    return Array.isArray(apps) && apps.some((app) => (
      app?.platform === 'webapp'
      || String(app?.url || '').includes('umpire')
    ));
  } catch {
    return false;
  }
}

export async function enableInstalledPwa({
  requestFullscreen,
  userAgent = '',
  assignLocation,
  origin = '',
} = {}) {
  if (typeof requestFullscreen === 'function') {
    try {
      await requestFullscreen();
      return 'fullscreen';
    } catch {
      /* Chrome may still keep the URL bar; try handing off to the WebAPK. */
    }
  }
  if (/Android/i.test(userAgent) && typeof assignLocation === 'function' && origin) {
    const host = origin.replace(/^https?:\/\//, '');
    assignLocation(`intent://${host}/umpire#Intent;scheme=https;action=android.intent.action.VIEW;end`);
    return 'intent';
  }
  return 'none';
}
