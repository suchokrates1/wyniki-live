/**
 * Module 16: Office login + chrome — docs 20 / 21.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, cleanup, resolveOfficeSlot, OFFICE_PASSWORD, launchBrowser,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeChromePage } from '../pages/officeChrome.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token);
  const slot = await resolveOfficeSlot(tournament.name);

  const browser = await launchBrowser(chromium);
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.expectLoginScreen();
    const loginText = await page.evaluate(() => document.body.innerText);
    if (!loginText.includes(tournament.name)) {
      throw new Error(`Login meta missing tournament name ${tournament.name}`);
    }
    // /office/<n> still opens, but the office lives at /office with a tournament list
    await page.waitForFunction(() => window.location.pathname === '/office', undefined, { timeout: 5000 });
    const selected = await page.locator('#officeTournamentSelect').evaluate((select) => select.options[select.selectedIndex]?.textContent || '');
    if (!selected.includes(tournament.name)) throw new Error(`Tournament list selected "${selected}", expected ${tournament.name}`);
    await page.goto(`${BASE_URL}/office`, { waitUntil: 'domcontentloaded' });
    await loginPage.expectLoginScreen();
    const remembered = await page.locator('#officeTournamentSelect').evaluate((select) => select.options[select.selectedIndex]?.textContent || '');
    if (!remembered.includes(tournament.name)) throw new Error(`/office did not remember the tournament: "${remembered}"`);
    console.log('  Login screen: /office with the tournament list, the chosen tournament remembered on a plain /office visit');

    await loginPage.loginExpectFail('wrong-password');
    console.log('  Wrong password stays on login');

    await loginPage.login(OFFICE_PASSWORD);
    const chrome = new OfficeChromePage(page);
    await chrome.expectStats();
    await chrome.expectTabs();
    console.log('  Chrome: stats and six rail views');

    await page.getByRole('button', { name: 'Test powiadomienia' }).waitFor({ state: 'visible', timeout: 5000 });
    await chrome.refresh();
    await chrome.expectStats();
    console.log('  Refresh and notification controls visible');

    await chrome.openTab('Faza grupowa');
    await chrome.openTab('Drabinka');
    await chrome.openTab('Terminarz');
    await chrome.openTab('Grupy startowe');
    await chrome.openTab('Komunikat dla widzów');
    await chrome.openTab('Ostatnie mecze');
    console.log('  Tabs switch');

    await chrome.logout();
    await loginPage.expectLoginScreen();
    console.log('  Logout returns to login');

    // A session the server no longer accepts sends the office back to the login screen.
    await loginPage.login(OFFICE_PASSWORD);
    await page.evaluate(() => { Alpine.$data(document.body).token = 'expired-token'; });
    await chrome.refresh();
    await page.waitForFunction(
      () => document.body.innerText.includes('Wejście do biura zawodów') && document.body.innerText.includes('Sesja biura wygasła'),
      undefined,
      { timeout: 12000 },
    );
    console.log('  Expired office session returns to login with a message');

    // Same for the admin panel.
    const adminPage = await browser.newPage();
    await adminPage.addInitScript(() => { window.sessionStorage.setItem('wyniki-admin-token', 'expired-token'); });
    await adminPage.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForFunction(
      () => document.body.innerText.includes('Podaj hasło administratora') && document.body.innerText.includes('Sesja administratora wygasła'),
      undefined,
      { timeout: 15000 },
    );
    console.log('  Expired admin session returns to login with a message');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}
