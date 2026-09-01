import { defineConfig } from '@playwright/test';
import { UMPIRE_E2E_VIEWPORTS } from './src/umpire/e2e/viewports.js';

const mobileProjects = [UMPIRE_E2E_VIEWPORTS.phone, UMPIRE_E2E_VIEWPORTS.tablet];

if (mobileProjects.some((project) => !project.isMobile || !project.hasTouch)) {
  throw new Error('Umpire E2E must run as phone/tablet with touch — no desktop');
}

export default defineConfig({
  testDir: './e2e/umpire',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5180 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5180/umpire.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: mobileProjects.map((project) => ({
    name: project.name,
    use: {
      viewport: project.viewport,
      isMobile: true,
      hasTouch: true,
    },
  })),
});
