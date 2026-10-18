/**
 * The live gates on a real Chrome for Android (an emulator or a tablet over adb) instead of desktop
 * Chromium: the same specs, with the phone's own Chrome profile, a real airplane mode and a real
 * Chrome restart. Without UMPIRE_ANDROID_CDP everything stays on desktop Chromium.
 *
 * UMPIRE_ANDROID_CDP     DevTools of the phone's Chrome (`adb forward tcp:9333 localabstract:chrome_devtools_remote`)
 * UMPIRE_LIVE_PAGE_URL   the backend as the phone sees it, e.g. http://10.0.2.2:18087 (emulator → this computer)
 * ADB                    adb binary (default: adb on PATH)
 */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { test as base } from '@playwright/test';

export const ANDROID_CDP = process.env.UMPIRE_ANDROID_CDP || '';
export const PAGE_URL = (process.env.UMPIRE_LIVE_PAGE_URL || process.env.UMPIRE_LIVE_BASE_URL || '').replace(/\/$/, '');
const CHROME = 'com.android.chrome';

export function adb(...args) {
  return execFileSync(process.env.ADB || 'adb', args, { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
}

async function connect() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const browser = await chromium.connectOverCDP(ANDROID_CDP);
      return { browser, context: browser.contexts()[0] };
    } catch (error) {
      if (attempt >= 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/** Forgets what the umpire app kept on the phone (storage, databases, caches, service worker) between tests. */
async function clearSite(context) {
  const page = await context.newPage();
  try {
    await page.goto(`${PAGE_URL}/umpire.webmanifest`);
    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();
      for (const db of (await indexedDB.databases?.()) || []) {
        if (db.name) await new Promise((resolve) => { const request = indexedDB.deleteDatabase(db.name); request.onsuccess = request.onerror = request.onblocked = () => resolve(); });
      }
      for (const key of await caches.keys()) await caches.delete(key);
      for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    });
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * The page's network: on Android the whole phone goes to airplane mode (navigator.onLine turns
 * false and the radio is off), on desktop the context goes offline.
 */
export async function setNetwork(context, online) {
  if (!ANDROID_CDP) {
    await context.setOffline(!online);
    return;
  }
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', online ? 'disable' : 'enable');
  if (online) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (/Active default network: \d+/.test(adb('shell', 'dumpsys', 'connectivity'))) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Chrome killed the way it happens on a tablet: the umpire leaves it (home, another app, swiped
 * from recents) and Android stops the process. Chrome writes localStorage to disk when it goes to
 * the background; a kill while it is in front loses the last few seconds (measured: a write 3 s
 * old is gone, 12 s old survives).
 */
export async function restartAndroidChrome(current, url) {
  await current.browser.close().catch(() => {});
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  adb('shell', 'am', 'force-stop', CHROME);
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, CHROME);
  const next = await connect();
  const deadline = Date.now() + 20_000;
  let page = null;
  while (!page && Date.now() < deadline) {
    page = next.context.pages().find((candidate) => candidate.url().startsWith(url.split('#')[0]));
    if (!page) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!page) throw new Error(`Chrome did not reopen ${url}; tabs: ${next.context.pages().map((p) => p.url())}`);
  return { ...next, page };
}

export const test = base.extend({
  context: async ({ context }, use) => {
    if (!ANDROID_CDP) {
      await use(context);
      return;
    }
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
    const phone = await connect();
    await clearSite(phone.context);
    for (const page of phone.context.pages()) {
      if (page.url().startsWith(PAGE_URL)) await page.close().catch(() => {});
    }
    phone.context.__phone = phone;
    await use(phone.context);
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
    for (const page of phone.context.pages()) {
      if (page.url().startsWith(PAGE_URL)) await page.close().catch(() => {});
    }
    await phone.browser.close().catch(() => {});
  },
});

export { expect } from '@playwright/test';
