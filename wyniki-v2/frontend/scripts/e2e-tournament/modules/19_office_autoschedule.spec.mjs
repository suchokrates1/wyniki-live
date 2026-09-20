/**
 * Module 19: Schedule + autoschedule controls — doc 26.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups, generateSchedule,
  cleanup, samplePlayers, resolveOfficeSlot, OFFICE_PASSWORD, launchBrowser,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeSchedulePage } from '../pages/officeSchedule.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token);
  const players = samplePlayers(4);
  const bulk = await addPlayers(token, tournament.id, players);
  await saveGroups(token, tournament.id, [{ name: 'B1 — Grupa A', players: bulk.player_ids }]);
  await generateSchedule(token, tournament.id);
  const slot = await resolveOfficeSlot(tournament.name);

  const browser = await launchBrowser(chromium);
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const schedulePage = new OfficeSchedulePage(page);
    await schedulePage.navigateToTab();
    await schedulePage.waitForEntries();
    await page.getByRole('button', { name: /Generuj mecze/i }).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /Generuj rewanże/i }).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: /Opublikuj wszystkie/i }).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: 'Rozstaw ten dzień' }).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: /Rozstaw (cały turniej|fazę)/ }).waitFor({ state: 'visible', timeout: 5000 });
    const body = await page.evaluate(() => document.body.innerText.toLowerCase());
    if (!body.includes('zakres') || !body.includes('koniec')) {
      throw new Error('Schedule step 2 missing Zakres control');
    }
    if (!(await page.locator('.office-daybar').isVisible())) {
      throw new Error('Schedule day header missing');
    }
    const courtHeader = await page.locator('.office-timetable__court').first().innerText();
    if (/slot\s+\d+\s+min/i.test(courtHeader)) {
      throw new Error('Court header still shows slot duration');
    }
    console.log('  Step 2 generate/publish/autoschedule controls visible');

    await page.getByRole('button', { name: 'Rozstaw ten dzień' }).click();
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => document.body.innerText);
    if (after.includes('Zatwierdź terminarz') || after.includes('Odrzuć propozycję') || after.includes('Rozstaw ten dzień')) {
      console.log('  Plan-this-day clicked (preview or board still present)');
    }

    await page.getByRole('button', { name: 'Opublikuj wszystkie' }).click();
    const publishConfirm = page.locator('[data-publish-confirm]');
    if (await publishConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publishConfirm.click();
    }
    await page.waitForTimeout(800);
    console.log('  Publish-all clicked');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}
