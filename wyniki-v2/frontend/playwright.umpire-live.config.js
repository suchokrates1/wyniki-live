import { defineConfig } from '@playwright/test';

// Umpire PWA against a real backend: see e2e/umpire-live/live.js. Not part of CI.
const base = process.env.UMPIRE_LIVE_BASE_URL || '';
if (!base) throw new Error('Set UMPIRE_LIVE_BASE_URL (e.g. http://192.168.31.10:18087) and E2E_ADMIN_PASSWORD');

export default defineConfig({
  testDir: './e2e/umpire-live',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    baseURL: base,
    trace: 'retain-on-failure',
    viewport: { width: 800, height: 1280 },
    isMobile: true,
    hasTouch: true,
  },
});
