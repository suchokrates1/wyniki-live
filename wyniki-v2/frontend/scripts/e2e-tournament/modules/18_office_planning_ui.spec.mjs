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
    const doublesBox = page.locator('label').filter({ hasText: 'Debel' }).locator('input[type="checkbox"]').last();
    await doublesBox.check();
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
    await firstName.fill('Anna');
    await lastName.fill('Kowalska');
    await page.locator('button').filter({ hasText: /^Dodaj zawodnika$/ }).click();
    await page.waitForTimeout(600);
    await firstName.fill('Jan');
    await lastName.fill('Nowak');
    await page.locator('button').filter({ hasText: /^Dodaj zawodnika$/ }).click();
    await page.waitForFunction(
      () => document.body.innerText.includes('Kowalska') && document.body.innerText.includes('Nowak'),
      undefined,
      { timeout: 10000 },
    );
    console.log('  Added two players from UI');

    await page.getByRole('button', { name: '+ Dodaj drużynę' }).click();
    await page.waitForTimeout(400);
    const allSelects = page.locator('select:visible');
    const n = await allSelects.count();
    const picked = [];
    for (let i = 0; i < n && picked.length < 2; i += 1) {
      const values = await allSelects.nth(i).locator('option').evaluateAll(
        (opts) => opts.map((opt) => opt.value).filter(Boolean),
      );
      const next = values.find((value) => !picked.includes(value));
      if (next && values.length >= 2) {
        await allSelects.nth(i).selectOption(next);
        picked.push(next);
      }
    }
    if (picked.length < 2) throw new Error('Could not select two partners for the pair');
    await page.getByRole('button', { name: 'Dodaj drużynę', exact: true }).click();
    await page.waitForFunction(
      () => document.body.innerText.replaceAll('\u200B', '').includes(' / '),
      undefined,
      { timeout: 12000 },
    );
    console.log('  Added a pair from UI');

    await page.getByRole('button', { name: 'Przypisz wszystkie pary' }).click();
    await page.waitForTimeout(800);
    console.log('  Assign-all-pairs control clicked');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}
