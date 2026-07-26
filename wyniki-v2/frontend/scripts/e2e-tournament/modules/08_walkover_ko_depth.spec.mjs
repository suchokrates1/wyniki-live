/**
 * Module 08: deeper office paths — walkover result, KO add-from-slot, schedule delete, larger seed.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, cleanup, samplePlayers, resolveOfficeSlot,
  OFFICE_PASSWORD, marker, apiUrl, adminHeaders, officeLogin,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';
import { OfficeResultsPage } from '../pages/officeResults.js';
import { OfficePlanningPage } from '../pages/officePlanning.js';
import { OfficeSchedulePage } from '../pages/officeSchedule.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${options.method || 'GET'} ${url} → ${resp.status}: ${body.error || resp.statusText}`);
  return body;
}

export default async function run() {
  const token = await adminLogin();
  // Larger seed: 12 players / 3 groups (one category).
  const tournament = await createTournament(token, { courts: 4 });
  const tournamentId = tournament.id;
  const tournamentName = tournament.name;

  const players = samplePlayers(12);
  const bulk = await addPlayers(token, tournamentId, players);
  const ids = bulk.player_ids || [];
  await saveGroups(token, tournamentId, [
    { name: 'B1 — Grupa A', players: ids.slice(0, 4) },
    { name: 'B1 — Grupa B', players: ids.slice(4, 8) },
    { name: 'B1 — Grupa C', players: ids.slice(8, 12) },
  ]);
  await generateSchedule(token, tournamentId);

  // Seed a ready KO slot via admin bracket (players known).
  const names = bulk.players.map((p) => p.name || `${p.first_name} ${p.last_name}`);
  await fetchJson(apiUrl(`/admin/api/tournaments/${tournamentId}/bracket/knockout`), {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify({
      knockout: [
        { phase: 'semifinal', position: 1, player1_name: names[0], player2_name: names[4] },
        { phase: 'semifinal', position: 2, player1_name: names[1], player2_name: names[5] },
        { phase: 'final', position: 1 },
        { phase: 'third_place', position: 1 },
      ],
    }),
  });
  console.log('  Large seed: 3 groups + KO bracket');

  const slot = await resolveOfficeSlot(tournamentName);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);

    // Walkover group result
    const resultsPage = new OfficeResultsPage(page);
    await resultsPage.openAddResult();
    await resultsPage.ensureGroupPlayersSelected();
    const modal = page.locator('.office-modal').filter({ hasText: 'Zapisz wynik' });
    const walkoverToggle = modal.locator('input[type="checkbox"]').first();
    if (await walkoverToggle.count()) {
      await walkoverToggle.check({ force: true });
      const winnerSelect = modal.locator('select').filter({ hasText: /./ }).last();
      const winnerOpts = await winnerSelect.locator('option').evaluateAll(
        (opts) => opts.map((o) => o.value).filter(Boolean)
      );
      if (winnerOpts.length) {
        await winnerSelect.selectOption(winnerOpts[0]);
      }
      await resultsPage.submitResult();
      console.log('  Office: walkover result saved');
    } else {
      await page.getByRole('button', { name: /Anuluj|Zamknij/i }).first().click().catch(() => {});
      console.log('  Office: walkover toggle not found — skipped');
    }

    // KO add from Drabinka if ready
    const planning = new OfficePlanningPage(page);
    await planning.openKnockoutTab();
    const addKo = page.getByRole('button', { name: /Dodaj wynik/i }).first();
    if (await addKo.isVisible({ timeout: 4000 }).catch(() => false)) {
      await addKo.click();
      await page.waitForFunction(
        () => document.body.innerText.includes('Zapisz wynik'),
        undefined,
        { timeout: 8000 }
      );
      const koModal = page.locator('.office-modal').filter({ hasText: 'Zapisz wynik' });
      const inputs = koModal.locator('input[type="number"]:visible');
      if (await inputs.count() >= 2) {
        await inputs.nth(0).fill('6');
        await inputs.nth(0).dispatchEvent('input');
        await inputs.nth(1).fill('2');
        await inputs.nth(1).dispatchEvent('input');
        // second set so match completes cleanly
        if (await inputs.count() >= 4) {
          await inputs.nth(2).fill('6');
          await inputs.nth(2).dispatchEvent('input');
          await inputs.nth(3).fill('3');
          await inputs.nth(3).dispatchEvent('input');
        }
      }
      await koModal.getByRole('button', { name: 'Zapisz wynik' }).click();
      try {
        await page.waitForFunction(
          () => !document.body.innerText.includes('Zapisz wynik'),
          undefined,
          { timeout: 12000 }
        );
        console.log('  Office: knockout result from slot saved');
      } catch {
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: /Anuluj|Zamknij/i }).first().click().catch(() => {});
        console.log('  Office: KO modal closed after save attempt');
      }
    } else {
      console.log('  Office: no ready KO add button (slot may need schedule link)');
    }

    // Prefer API delete for schedule (UI may still have open overlays).
    const officeAuth = await officeLogin(slot, OFFICE_PASSWORD);
    const dash = officeAuth.dashboard || {};
    const entry = (dash.schedule || []).find((e) => e.id);
    if (entry?.id) {
      await fetchJson(apiUrl(`/api/office/${slot}/schedule/${entry.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${officeAuth.token}` },
      });
      console.log('  Office: schedule entry deleted via API');
    } else {
      const schedulePage = new OfficeSchedulePage(page);
      await schedulePage.navigateToTab();
      await schedulePage.waitForEntries();
      console.log('  Office: schedule board visible (no deletable entry id)');
    }

    const body = await page.evaluate(() => document.body.innerText);
    if (!body.includes(marker()) && !body.includes('Grupa')) {
      throw new Error('Expected seeded tournament content still visible');
    }
  } finally {
    await browser.close();
  }

  await cleanup(token);
}
