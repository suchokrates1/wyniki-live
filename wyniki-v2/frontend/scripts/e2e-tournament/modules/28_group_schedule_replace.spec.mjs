/**
 * Module 28: After a laid-out group timetable, changing A/B asks at
 * "Zatwierdź grupy" and replaces unplayed group matches on the board.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups, generateSchedule,
  fetchAdminSchedule, cleanup, samplePlayers, resolveOfficeSlot, officeLogin,
  OFFICE_PASSWORD, launchBrowser, apiUrl,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficePlanningPage } from '../pages/officePlanning.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

async function officeJson(slot, officeToken, path, { method = 'GET', body } = {}) {
  const resp = await fetch(apiUrl(`/api/office/${slot}${path}`), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${officeToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`${method} ${path} → ${resp.status}: ${data.error || resp.statusText}`);
  }
  return data;
}

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token, { courts: 2 });
  const players = samplePlayers(6);
  const bulk = await addPlayers(token, tournament.id, players);
  const ids = bulk.player_ids || [];
  await saveGroups(token, tournament.id, [
    { name: 'B1 — Grupa A', players: ids.slice(0, 3) },
    { name: 'B1 — Grupa B', players: ids.slice(3, 6) },
  ]);
  await generateSchedule(token, tournament.id);
  const slot = await resolveOfficeSlot(tournament.name);
  const officeAuth = await officeLogin(slot);
  const config = await officeJson(slot, officeAuth.token, '/autoschedule/config');
  const court = config.courts?.[0]?.kort_id;
  if (!court) throw new Error('No court to place group matches');
  const day = tournament.tournament?.start_date || new Date().toISOString().slice(0, 10);

  const beforePlace = await fetchAdminSchedule(token, tournament.id);
  const groupRows = beforePlace.filter((entry) => entry.source_type === 'group');
  if (groupRows.length < 6) throw new Error(`Expected 6 group matches, got ${groupRows.length}`);
  let hour = 10;
  for (const entry of groupRows) {
    await officeJson(slot, officeAuth.token, `/schedule/${entry.id}`, {
      method: 'PUT',
      body: { day_date: day, scheduled_time: `${String(hour).padStart(2, '0')}:00`, court_id: court },
    });
    hour += 1;
  }
  console.log('  Laid out every group match on the board');

  const browser = await launchBrowser(chromium);
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const planningPage = new OfficePlanningPage(page);
    await planningPage.navigateToTab();
    await planningPage.waitForGroups();

    const division = page.locator('[data-tour="divisions"] button').first();
    if (await division.isVisible().catch(() => false)) await division.click();

    await page.waitForFunction(() => {
      const app = window.Alpine?.$data(document.body);
      const names = app?.planningTargetGroupNames?.() || [];
      return names.length >= 2 && (app.planningAssignedPlayers?.(names[0]) || []).length;
    }, undefined, { timeout: 15000 });

    const moved = await page.evaluate(() => {
      const app = window.Alpine.$data(document.body);
      const names = app.planningTargetGroupNames();
      const player = app.planningAssignedPlayers(names[0])[0];
      app.planningGroupAssignments = { ...app.planningGroupAssignments, [player.id]: names[1] };
      app.schedulePlanningAutoSave();
      return { name: player.name, from: names[0], to: names[1] };
    });
    console.log(`  Moved ${moved.name} from ${moved.from} to ${moved.to}`);

    await page.locator('[data-confirm-groups]').waitFor({ state: 'visible', timeout: 12000 });
    await page.locator('[data-confirm-groups]').click();
    await page.locator('[data-replace-schedule-confirm]').waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('[data-replace-schedule-confirm]').click();
    await page.waitForFunction(
      () => document.body.innerText.includes('Terminarz grup został podmieniony'),
      undefined,
      { timeout: 20000 },
    );
    console.log('  Confirmed groups and replaced the timetable');
  } finally {
    await browser.close();
  }

  const after = await fetchAdminSchedule(token, tournament.id);
  const placed = after.filter((entry) => (
    entry.source_type === 'group'
    && String(entry.court_id || '').trim()
    && String(entry.scheduled_time || '').trim()
  ));
  const openUnplaced = after.filter((entry) => (
    entry.source_type === 'group'
    && !entry.match_id
    && !String(entry.court_id || '').trim()
  ));
  if (placed.length < 6) {
    throw new Error(`Expected replaced group matches back on the board, placed ${placed.length}`);
  }
  if (openUnplaced.length) {
    throw new Error(`Unplayed group matches still in the drawer: ${openUnplaced.length}`);
  }
  console.log(`  ${placed.length} group matches are back on the board`);

  await cleanup(token);
}
