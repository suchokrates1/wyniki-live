/**
 * Module 26: the office guide. A fresh tournament offers it; the guide walks all steps
 * (categories, groups, form of play, schedule, notes), opens the right view for each, points
 * a ringed bubble at the control when it is on screen and says so when it is not yet.
 * "Nie teraz" keeps the offer away after a reload.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, cleanup, createTournament, addPlayers, resolveOfficeSlot, marker, OFFICE_PASSWORD, launchBrowser,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';
const log = (message) => console.log(`  ${message}`);
const SHOTS = process.env.E2E_TOUR_SHOTS === '1';

const EXPECTED = [
  ['1. Kategorie', 'groups'],
  ['Zawodnicy', 'groups'],
  ['2. Grupy — wybierz kategorię', 'groups'],
  ['Grupy i zawodnicy', 'groups'],
  ['3. Forma rozgrywek', 'draws'],
  ['Zatwierdź formę', 'draws'],
  ['4. Terminarz — korty B1', 'planning'],
  ['Wygeneruj mecze', 'planning'],
  ['Godziny dnia', 'planning'],
  ['Ułóż automatycznie', 'planning'],
  ['Sprawdź wszystkie dni', 'planning'],
  ['Przesuwaj ręcznie', 'planning'],
  ['Zatwierdź i opublikuj', 'planning'],
  ['5. Uwagi do meczów', 'planning'],
  ['Uwagi hurtem albo pojedynczo', 'quickinfo'],
];

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token, { courts: 3 });
  const tag = marker();
  await addPlayers(token, tournament.id, [1, 2, 3, 4].map((n) => ({ name: `Tour${n} ${tag}`, first_name: `Tour${n}`, last_name: tag, category: 'B2', gender: 'K' })));
  const slot = await resolveOfficeSlot(tournament.name);

  const browser = await launchBrowser(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
    const login = new OfficeLoginPage(page, BASE_URL);
    await login.goto(slot);
    await login.login(OFFICE_PASSWORD);

    const offer = page.locator('[data-tour-offer]');
    await offer.waitFor({ state: 'visible', timeout: 15000 });
    if (!(await offer.innerText()).includes('Pierwszy raz w biurze?')) throw new Error('Fresh tournament should offer the guide');
    await page.locator('[data-tour-offer-start]').click();
    log('Fresh tournament offers the guide; "Uruchom przewodnik" starts it');

    const bubble = page.locator('[data-tour-bubble]');
    const visited = [];
    for (const [index, [title, view]] of EXPECTED.entries()) {
      await page.waitForFunction(
        ([text, id]) => document.querySelector('[data-tour-title]')?.textContent === text && Alpine.$data(document.body).activeTab === id,
        [title, view],
        { timeout: 10000 },
      ).catch(async () => {
        throw new Error(`Step ${index + 1}: expected "${title}" on ${view}, got ${JSON.stringify(await page.evaluate(() => ({ title: document.querySelector('[data-tour-title]')?.textContent, view: Alpine.$data(document.body).activeTab })))}`);
      });
      await page.waitForTimeout(450);
      const state = await page.evaluate(() => {
        const box = document.querySelector('[data-tour-bubble]').getBoundingClientRect();
        const ring = document.querySelector('.office-tour__ring');
        const ringBox = ring && getComputedStyle(ring).display !== 'none' ? ring.getBoundingClientRect() : null;
        const data = Alpine.$data(document.body);
        return {
          counter: document.querySelector('[data-tour-counter]').textContent,
          inside: box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth + 1 && box.bottom <= window.innerHeight + 1,
          found: data.tourTargetFound,
          ring: ringBox ? { width: ringBox.width, height: ringBox.height } : null,
          missingShown: getComputedStyle(document.querySelector('.office-tour__missing')).display !== 'none',
        };
      });
      if (state.counter !== `Krok ${index + 1} z ${EXPECTED.length}`) throw new Error(`Step ${index + 1} counter: ${state.counter}`);
      if (!state.inside) throw new Error(`Step ${index + 1}: the bubble leaves the screen`);
      if (state.found && !(state.ring && state.ring.width > 0)) throw new Error(`Step ${index + 1}: control found but not ringed`);
      if (!state.found && !state.missingShown) throw new Error(`Step ${index + 1}: a control not on screen must be explained`);
      visited.push(`${index + 1}${state.found ? '' : '*'}`);
      if (SHOTS) await page.screenshot({ path: `test-results/tour-${String(index + 1).padStart(2, '0')}.png` });
      if (index === 1) {
        // back goes one step back and forward again
        await page.locator('[data-tour-back]').click();
        await page.waitForFunction((text) => document.querySelector('[data-tour-title]')?.textContent === text, EXPECTED[0][0]);
        await page.locator('[data-tour-next]').click();
        await page.waitForFunction((text) => document.querySelector('[data-tour-title]')?.textContent === text, EXPECTED[1][0]);
      }
      const next = page.locator('[data-tour-next]');
      if (index === EXPECTED.length - 1 && (await next.textContent()).trim() !== 'Zakończ') throw new Error('The last step should finish the guide');
      await next.click();
    }
    await bubble.waitFor({ state: 'hidden', timeout: 5000 });
    log(`Guide walked ${EXPECTED.length} steps across Grupy startowe, Forma rozgrywek, Terminarz and Komunikat dla zawodników (controls not on screen yet marked *: ${visited.join(' ')})`);

    // the offer stays away once the guide was started, also after a reload; the rail restarts it
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.office-rail', { state: 'visible' });
    await page.waitForTimeout(1500);
    if (await offer.isVisible()) throw new Error('The offer came back after the guide was started');
    await page.locator('[data-tour-start]').click();
    await page.waitForFunction(() => document.querySelector('[data-tour-title]')?.textContent === '1. Kategorie', undefined, { timeout: 10000 });
    await page.keyboard.press('Escape');
    await bubble.waitFor({ state: 'hidden', timeout: 5000 });
    log('No offer after a reload; "Przewodnik" in the rail restarts the guide and Escape closes it');

    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await browser.close();
  }
  await cleanup(token);
}
