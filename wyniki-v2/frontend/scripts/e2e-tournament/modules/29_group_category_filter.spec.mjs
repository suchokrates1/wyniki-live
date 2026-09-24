/**
 * Module 29: group-assignment filter is exact to the tournament category.
 * B1 Plus people stay out of B1; B3 women stay out of B3-B4 when both exist.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, confirmCategories, saveGroups, cleanup,
  resolveOfficeSlot, OFFICE_PASSWORD, launchBrowser,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficePlanningPage } from '../pages/officePlanning.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';
const KEEP = process.env.E2E_KEEP === '1';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token, { courts: 2 });
  const tag = tournament.name.split(' ')[0];

  const confirmed = await confirmCategories(token, tournament.id, [
    { preset_key: 'B1M' },
    { label: 'B1 Plus', hint_bands: ['B1'] },
    { preset_key: 'B3K' },
    { label: 'B3-B4 Kobiety', hint_bands: ['B3', 'B4'] },
  ]);
  const cats = confirmed.categories || [];
  const b1 = cats.find((cat) => cat.preset_key === 'B1M');
  const plus = cats.find((cat) => cat.label === 'B1 Plus');
  const b3k = cats.find((cat) => cat.preset_key === 'B3K' && cat.label !== 'B3-B4 Kobiety');
  const b34k = cats.find((cat) => cat.label === 'B3-B4 Kobiety');
  if (!b1 || !plus || !b3k || !b34k) {
    throw new Error(`Missing categories: ${cats.map((cat) => cat.label).join(', ')}`);
  }

  const seed = [
    ...['Adam', 'Bartek'].map((first) => ({ first, category: 'B1', gender: 'M' })),
    ...['Ewa', 'Fiona'].map((first) => ({ first, category: 'B3', gender: 'K' })),
    ...['Gosia', 'Hania'].map((first) => ({ first, category: 'B4', gender: 'K' })),
  ].map(({ first, category, gender }) => ({
    name: `${first} ${tag}`, first_name: first, last_name: tag, category, gender, country: 'PL',
  }));
  const created = await addPlayers(token, tournament.id, seed);
  const idOf = Object.fromEntries(seed.map((player, index) => [player.first_name, created.players[index].id]));

  await saveGroups(token, tournament.id, [{
    name: plus.label,
    tournament_category_id: plus.id,
    play_format: 'round_robin',
    players: [idOf.Bartek],
  }]);

  const slot = await resolveOfficeSlot(tournament.name);
  const browser = await launchBrowser(chromium);
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const planningPage = new OfficePlanningPage(page);
    await planningPage.navigateToTab();
    await planningPage.waitForGroups();

    await page.waitForFunction(() => {
      const app = window.Alpine?.$data(document.body);
      return Boolean(app?.planningPlayersMatchingCategory && app.planningPlayers?.length);
    }, undefined, { timeout: 20000 });

    const seen = await page.evaluate((ids) => {
      const app = window.Alpine.$data(document.body);
      app.planningCategoryFilterEnabled = true;
      const names = (categoryId) => {
        const cat = (app.tournamentCategories || []).find((row) => Number(row.id) === Number(categoryId));
        return app.planningPlayersMatchingCategory(cat).map((player) => player.first_name || player.name);
      };
      const pool = (categoryId) => {
        app.planningSelectedCategoryId = categoryId;
        app.planningSelectedDivision = String(categoryId);
        return app.planningUnassignedPlayers().map((player) => player.first_name || player.name);
      };
      return {
        b1: names(ids.b1),
        plus: names(ids.plus),
        b3k: names(ids.b3k),
        b34k: names(ids.b34k),
        b1Pool: pool(ids.b1),
        plusPool: pool(ids.plus),
      };
    }, { b1: b1.id, plus: plus.id, b3k: b3k.id, b34k: b34k.id });
    const has = (list, first) => list.some((name) => String(name).startsWith(first));
    if (!has(seen.b1, 'Adam') || has(seen.b1, 'Bartek')) {
      throw new Error(`B1 Men filter should be Adam only, got ${seen.b1.join(', ')}`);
    }
    if (!has(seen.plus, 'Bartek') || has(seen.plus, 'Adam')) {
      throw new Error(`B1 Plus filter should be Bartek only, got ${seen.plus.join(', ')}`);
    }
    if (!has(seen.b3k, 'Ewa') || !has(seen.b3k, 'Fiona') || has(seen.b3k, 'Gosia')) {
      throw new Error(`B3 Women filter should be Ewa+Fiona, got ${seen.b3k.join(', ')}`);
    }
    if (!has(seen.b34k, 'Gosia') || !has(seen.b34k, 'Hania') || has(seen.b34k, 'Ewa')) {
      throw new Error(`B3-B4 Women filter should be Gosia+Hania, got ${seen.b34k.join(', ')}`);
    }
    if (!has(seen.b1Pool, 'Adam') || has(seen.b1Pool, 'Bartek')) {
      throw new Error(`B1 Men pool should hide Bartek already in Plus, got ${seen.b1Pool.join(', ')}`);
    }
    if (seen.plusPool.length) {
      throw new Error(`B1 Plus unassigned pool should be empty, got ${seen.plusPool.join(', ')}`);
    }
    console.log('  Filter: B1=Adam, Plus=Bartek, B3=Ewa+Fiona, B3-B4=Gosia+Hania');
  } finally {
    await browser.close();
    if (!KEEP) await cleanup(token);
  }
}
