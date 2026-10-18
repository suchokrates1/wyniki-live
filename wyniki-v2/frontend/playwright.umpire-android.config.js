import { defineConfig } from '@playwright/test';

// The live umpire gates in Chrome on an Android device or emulator (e2e/umpire-live/device.js).
// Not part of CI: needs the E2E backend, adb and the phone's Chrome DevTools forwarded.
const base = process.env.UMPIRE_LIVE_BASE_URL || '';
if (!base || !process.env.UMPIRE_ANDROID_CDP || !process.env.UMPIRE_LIVE_PAGE_URL) {
  throw new Error('Set UMPIRE_LIVE_BASE_URL, UMPIRE_LIVE_PAGE_URL, UMPIRE_ANDROID_CDP and E2E_ADMIN_PASSWORD (see e2e/umpire-live/device.js)');
}

export default defineConfig({
  testDir: './e2e/umpire-live',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  // a stuck tap fails in 30 s (the soak then saves what the tablet showed) instead of at the test timeout
  use: { baseURL: base, trace: 'off', actionTimeout: 30_000 },
});
