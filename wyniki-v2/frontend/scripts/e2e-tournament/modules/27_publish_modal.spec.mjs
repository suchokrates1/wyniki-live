/**
 * Module 27: publish modal — all days vs one day, cancel leaves drafts.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups, generateSchedule,
  cleanup, samplePlayers, resolveOfficeSlot, officeLogin, OFFICE_PASSWORD,
  fetchPublicSchedule, launchBrowser,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeSchedulePage } from '../pages/officeSchedule.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

const isoDay = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

async function waitUntil(label, probe, { timeout = 15000, interval = 300 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

function publicMatchCount(schedule, day) {
  const row = (schedule.days || []).find((entry) => entry.date === day);
  return (row?.categories || []).flatMap((category) => category.matches || []).length;
}

export default async function run() {
  const token = await adminLogin();
  const day1 = isoDay(0);
  const day2 = isoDay(1);
  const tournament = await createTournament(token, {
    startDate: day1, endDate: day2, courts: 2, isSimulation: false, isPublic: true,
  });
  const players = samplePlayers(4);
  const bulk = await addPlayers(token, tournament.id, players);
  await saveGroups(token, tournament.id, [{ name: 'B1 — Grupa A', players: bulk.player_ids }]);
  await generateSchedule(token, tournament.id);
  const slot = await resolveOfficeSlot(tournament.name);
  const officeToken = (await officeLogin(slot)).token;
  const api = async (path, init = {}) => {
    const response = await fetch(new URL(`/api/office/${slot}${path}`, BASE_URL), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${officeToken}`,
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${init.method || 'GET'} ${path} → ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
    }
    return body;
  };

  const planning = () => api('/planning');
  const seeded = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group');
  if (seeded.length < 2) throw new Error(`Need at least two group matches, got ${seeded.length}`);
  const courtId = String(((await planning()).courts || [])[0]?.kort_id || seeded[0].court_id || '');
  if (!courtId) throw new Error('No court id for placing draft matches');
  const mid = Math.ceil(seeded.length / 2);
  for (const [index, entry] of seeded.entries()) {
    const day = index < mid ? day1 : day2;
    await api(`/schedule/${entry.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        day_date: day,
        scheduled_time: index < mid ? '10:00' : '11:00',
        court_id: courtId,
        status: 'draft',
      }),
    });
  }
  const placed = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group');
  const day1Drafts = placed.filter((entry) => entry.day_date === day1 && entry.status === 'draft');
  const day2Drafts = placed.filter((entry) => entry.day_date === day2 && entry.status === 'draft');
  if (!day1Drafts.length || !day2Drafts.length) {
    throw new Error(`Expected drafts on both days: day1=${day1Drafts.length} day2=${day2Drafts.length}`);
  }
  console.log(`  Seeded ${day1Drafts.length} drafts on ${day1} and ${day2Drafts.length} on ${day2}`);

  const browser = await launchBrowser(chromium);
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);
    const schedulePage = new OfficeSchedulePage(page);
    await schedulePage.navigateToTab();
    await schedulePage.waitForEntries();

    const publishButton = page.getByRole('button', { name: /Opublikuj wszystkie/i });
    const dialog = page.getByRole('dialog', { name: /Publikacja terminarza/i });
    await publishButton.click();
    await dialog.waitFor({ state: 'visible', timeout: 8000 });
    const radios = dialog.locator('input[name="publishScope"]');
    if ((await radios.count()) !== 3) {
      throw new Error(`Modal should offer all-days plus both days, got ${await radios.count()} radios`);
    }
    if (await radios.nth(0).inputValue() !== '') {
      throw new Error('First radio should publish every remaining draft');
    }
    await dialog.getByRole('button', { name: /Anuluj/i }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 5000 });
    const afterCancel = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group');
    if (afterCancel.some((entry) => entry.status !== 'draft')) {
      throw new Error('Cancel must leave every match as draft');
    }
    console.log('  Cancel closes the modal and leaves drafts unpublished');

    await publishButton.click();
    await dialog.waitFor({ state: 'visible', timeout: 8000 });
    await dialog.locator(`input[name="publishScope"][value="${day1}"]`).check();
    await dialog.locator('[data-publish-confirm]').click();
    await dialog.waitFor({ state: 'hidden', timeout: 8000 });
    await waitUntil('day 1 published, day 2 still draft', async () => {
      const rows = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group');
      const first = rows.filter((entry) => entry.day_date === day1);
      const second = rows.filter((entry) => entry.day_date === day2);
      return first.length && first.every((entry) => entry.status === 'planned')
        && second.length && second.every((entry) => entry.status === 'draft');
    });
    const afterDay = await fetchPublicSchedule(tournament.id);
    if (!publicMatchCount(afterDay, day1) || publicMatchCount(afterDay, day2)) {
      throw new Error(`Public site should list only ${day1} after a one-day publish`);
    }
    console.log(`  Published ${day1} only; ${day2} stayed draft`);

    await publishButton.click();
    await dialog.waitFor({ state: 'visible', timeout: 8000 });
    const leftover = dialog.locator('input[name="publishScope"]');
    if ((await leftover.count()) !== 2) {
      throw new Error(`After publishing day 1 the modal should offer all + leftover day, got ${await leftover.count()}`);
    }
    await dialog.locator('[data-publish-confirm]').click();
    await dialog.waitFor({ state: 'hidden', timeout: 8000 });
    await waitUntil('remaining day published', async () => {
      const rows = ((await planning()).schedule || []).filter((entry) => entry.source_type === 'group');
      return rows.length && rows.every((entry) => entry.status === 'planned');
    });
    const afterAll = await fetchPublicSchedule(tournament.id);
    if (!publicMatchCount(afterAll, day1) || !publicMatchCount(afterAll, day2)) {
      throw new Error(`Public schedule should list both days after publish-all: ${JSON.stringify(afterAll.days)}`);
    }
    console.log('  Default confirm published the leftover day');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}
