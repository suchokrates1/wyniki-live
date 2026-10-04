import { defineConfig, devices } from '@playwright/test';

/**
 * Pictures of the public site, so a change to the stylesheets has to be meant.
 *
 * This is the safety net the CSS clean-up needs: nothing else in the suite notices when
 * a rule disappears and a page quietly shifts. It runs against the mock server, so the
 * data in every shot is the same from one run to the next.
 *
 * The baselines are rendered by the machine that takes them — the same page looks
 * slightly different on Windows and on Linux. These are committed for this laptop, which
 * is where the stylesheets get edited, and that is why CI does not run this suite.
 * Re-record with `npm run test:visual:update` and look at every changed picture before
 * committing it: an updated baseline is a decision that the new look is correct.
 */
const port = Number(process.env.PUBLIC_MOCK_PORT) || 8826;

export default defineConfig({
  testDir: './e2e/visual',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  },
  expect: {
    toHaveScreenshot: {
      // Font smoothing differs by a pixel here and there; a real layout change is far larger.
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  webServer: {
    command: 'node scripts/public-mock-serve.mjs',
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PUBLIC_MOCK_PORT: String(port) },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
