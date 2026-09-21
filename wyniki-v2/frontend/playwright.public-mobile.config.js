import { defineConfig, devices } from '@playwright/test';

// The public site on phones. Default: the built frontend on the mock API (npm run build first).
// PUBLIC_MOBILE_BASE_URL=https://test.blindtennis.app runs the same suite against a live stack.
const live = process.env.PUBLIC_MOBILE_BASE_URL || '';
const port = Number(process.env.PUBLIC_MOCK_PORT) || 8823;

export default defineConfig({
  testDir: './e2e/public-mobile',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list']] : [['list']],
  use: {
    baseURL: live || `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    locale: 'pl-PL',
  },
  ...(live ? {} : {
    webServer: {
      command: 'node scripts/public-mock-serve.mjs',
      url: `http://127.0.0.1:${port}/`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { PUBLIC_MOCK_PORT: String(port) },
    },
  }),
  projects: [
    { name: 'android-pixel7', use: { ...devices['Pixel 7'] } },
    { name: 'android-small-360', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 740 } } },
    { name: 'ios-iphone14', use: { ...devices['iPhone 14'] } },
    { name: 'android-dark', use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
  ],
});
