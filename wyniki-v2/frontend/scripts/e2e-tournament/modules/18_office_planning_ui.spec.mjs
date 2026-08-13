/**
 * Module 18: Planning UI — doc 25 (confirm Debel, add players, add pair).
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, cleanup, resolveOfficeSlot, OFFICE_PASSWORD,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficePlanningPage } from '../pages/officePlanning.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token, { isSimulation: false, isPublic: true });
  const slot = await resolveOfficeSlot(tournament.name);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const planningPage = new OfficePlanningPage(page);
    await planningPage.navigateToTab();

    const customInput = page.locator('input[placeholder*="B2 Mixed"]').first();
    await customInput.waitFor({ state: 'visible', timeout: 10000 });
    await customInput.fill('B1 Double');
    await page.locator('label.mt-2:visible').filter({ hasText: 'Debel' }).locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Zatwierdź kategorie' }).click();
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes('debel')
        && document.body.innerText.includes('B1 Double'),
      undefined,
      { timeout: 12000 },
    );
    console.log('  Confirmed custom Double category from UI');

    await page.getByRole('button', { name: '+ Dodaj zawodnika' }).click();
    const firstName = page.getByPlaceholder('Imię');
    const lastName = page.getByPlaceholder('Nazwisko');
    await firstName.waitFor({ state: 'visible', timeout: 8000 });

    async function addOfficePlayerUi(first, last) {
      await firstName.fill(first);
      await lastName.fill(last);
      await page.getByRole('button', { name: 'Dodaj zawodnika', exact: true }).click();
      try {
        await page.waitForFunction(
          () => document.body.innerText.includes('Zawodnik dodany'),
          undefined,
          { timeout: 10000 },
        );
      } catch (err) {
        const snippet = await page.evaluate(() => document.body.innerText.replaceAll('\u200B', '').slice(0, 1800));
        throw new Error(`Player ${first} ${last} was not added: ${err.message}\nUI snippet: ${snippet}`);
      }
      await page.waitForFunction(
        () => !document.body.innerText.includes('Zawodnik dodany'),
        undefined,
        { timeout: 5000 },
      ).catch(() => {});
    }

    await addOfficePlayerUi('Anna', 'Kowalska');
    await addOfficePlayerUi('Jan', 'Nowak');
    console.log('  Added two players from UI');

    const closePlayerForm = page.getByRole('button', { name: /Nowy zawodnik/ });
    if (await closePlayerForm.isVisible().catch(() => false)) {
      await closePlayerForm.click();
    }

    await page.getByRole('button', { name: '+ Dodaj drużynę' }).click();
    const teamForm = page.locator('div.mt-3.grid').filter({
      has: page.getByRole('button', { name: 'Dodaj drużynę', exact: true }),
    });
    await teamForm.waitFor({ state: 'visible', timeout: 8000 });
    const partner1 = teamForm.locator('select').nth(0);
    const partner2 = teamForm.locator('select').nth(1);
    await page.waitForFunction(
      () => [...document.querySelectorAll('select option')].some((opt) => (opt.textContent || '').includes('Kowalska')),
      undefined,
      { timeout: 8000 },
    );
    const firstId = await partner1.locator('option').evaluateAll(
      (opts) => opts.map((opt) => opt.value).filter(Boolean)[0],
    );
    if (!firstId) throw new Error('Partner 1 select has no players');
    await partner1.selectOption(firstId);
    await page.waitForTimeout(300);
    const secondId = await partner2.locator('option').evaluateAll(
      (opts, taken) => opts.map((opt) => opt.value).filter((value) => value && value !== taken)[0],
      firstId,
    );
    if (!secondId) throw new Error('Partner 2 select has no remaining player');
    await partner2.selectOption(secondId);
    await page.getByRole('button', { name: 'Dodaj drużynę', exact: true }).click();
    try {
      await page.waitForFunction(
        () => document.body.innerText.replaceAll('\u200B', '').includes(' / '),
        undefined,
        { timeout: 12000 },
      );
    } catch (err) {
      const snippet = await page.evaluate(() => document.body.innerText.replaceAll('\u200B', '').slice(0, 1800));
      throw new Error(`${err.message}\nUI snippet: ${snippet}`);
    }
    console.log('  Added a pair from UI');

    await page.getByRole('button', { name: 'Przypisz wszystkie pary' }).waitFor({ state: 'visible', timeout: 8000 });
    await page.getByRole('button', { name: 'Przypisz wszystkie pary' }).click();
    await page.waitForTimeout(800);
    console.log('  Assign-all-pairs control clicked');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}
