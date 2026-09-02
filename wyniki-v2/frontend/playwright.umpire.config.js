import { defineConfig, devices } from '@playwright/test';
import { UMPIRE_E2E_VIEWPORTS } from './src/umpire/e2e/viewports.js';

const mobileProjects = [UMPIRE_E2E_VIEWPORTS.tablet, UMPIRE_E2E_VIEWPORTS.tabletLandscape];

if (mobileProjects.some((project) => !project.isMobile || !project.hasTouch)) {
  throw new Error('Umpire E2E must run as phone/tablet with touch — no desktop');
}

const iosDevices = [devices['iPhone 14'], devices['iPad Pro 11']];
if (iosDevices.some((device) => !device || device.isMobile === false)) {
  throw new Error('iOS WebKit E2E must use Playwright iPhone/iPad device presets');
}

const liveBase = process.env.UMPIRE_E2E_BASE_URL || '';

export default defineConfig({
  testDir: './e2e/umpire',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  use: {
    baseURL: liveBase || 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
  },
  ...(liveBase ? {} : {
    webServer: {
      command: 'npx vite --port 5180 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:5180/umpire.html',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  }),
  projects: [
    ...mobileProjects.map((project) => ({
      name: project.name,
      testIgnore: '**/ios-webkit.spec.js',
      use: {
        viewport: project.viewport,
        isMobile: true,
        hasTouch: true,
      },
    })),
    {
      name: 'ios-iphone',
      testMatch: '**/ios-webkit.spec.js',
      use: {
        ...devices['iPhone 14'],
        browserName: 'webkit',
      },
    },
    {
      name: 'ios-ipad',
      testMatch: '**/ios-webkit.spec.js',
      use: {
        ...devices['iPad Pro 11'],
        browserName: 'webkit',
      },
    },
  ],
});
