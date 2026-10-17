import { devices } from '@playwright/test';
import { screenReaderConfig } from '@guidepup/playwright';

// VoiceOver on macOS (the VoiceOver workflow): the built frontend on the mock API, one
// headed WebKit window, one test at a time — there is one VoiceOver per machine.
// npm run build first; the Guidepup packages are installed by the workflow only.
const port = Number(process.env.VOICEOVER_MOCK_PORT) || 8824;

export default {
  ...screenReaderConfig,
  testDir: './e2e/voiceover',
  testMatch: '**/*.spec.js',
  reportSlowTests: null,
  timeout: 15 * 60 * 1000,
  retries: 1, // GitHub's Macs now and then fail to start VoiceOver at all; a real finding fails twice
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, locale: 'pl-PL' },
  webServer: {
    command: `node scripts/a11y-mock-server.mjs ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    // screen readers cannot read a headless browser
    { name: 'webkit', use: { ...devices['Desktop Safari'], headless: false } },
  ],
};
