import { defineConfig, devices } from '@playwright/test';

// The admin panel on the built frontend plus a mock API (npm run build first).
// No real credentials: the suite puts a stand-in token in sessionStorage and stubs /admin/api.
const port = Number(process.env.ADMIN_MOCK_PORT) || 8824;
// ADMIN_BASE_URL points the same suite at a deployed stack (test.blindtennis.app).
// The API stays stubbed, so nothing real is read or written there.
const remote = process.env.ADMIN_BASE_URL || '';

export default defineConfig({
  testDir: './e2e/admin',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: remote || `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    locale: 'pl-PL',
  },
  ...(remote ? {} : {
    webServer: {
      command: 'node scripts/public-mock-serve.mjs',
      url: `http://127.0.0.1:${port}/`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { PUBLIC_MOCK_PORT: String(port) },
    },
  }),
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
