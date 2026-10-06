import { defineConfig, devices } from '@playwright/test';

// The redesigned bracket, player profile and results, end to end on a deployed stack that holds
// a big draw (a copy of Wilno 2026, groups + 1/8 + consolation + placings) and a small one.
// Read-only: nothing is written. REDESIGN_BASE_URL defaults to the test stack.
const base = process.env.REDESIGN_BASE_URL || 'https://test.blindtennis.app';

export default defineConfig({
  testDir: './e2e/redesign',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  workers: 3,
  // a live stack over the network: one retry tells a slow response from a broken page
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: base,
    trace: 'retain-on-failure',
    locale: 'pl-PL',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-dark', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
    { name: 'tablet-landscape', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: 'tablet-portrait', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
});
