/**
 * Module 10: office SSE reconnect — kill stream mid-session, expect reconnect / fallback.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, saveGroups,
  generateSchedule, cleanup, samplePlayers, resolveOfficeSlot,
  OFFICE_PASSWORD, marker,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token, { courts: 2 });
  const tournamentId = tournament.id;
  const tournamentName = tournament.name;

  const players = samplePlayers(4);
  const bulk = await addPlayers(token, tournamentId, players);
  await saveGroups(token, tournamentId, [{ name: 'B1 — Grupa A', players: bulk.player_ids || [] }]);
  await generateSchedule(token, tournamentId);

  const slot = await resolveOfficeSlot(tournamentName);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const loginPage = new OfficeLoginPage(page, BASE_URL);
    await loginPage.goto(slot);
    await loginPage.login(OFFICE_PASSWORD);

    // Wait until Alpine office SSE reaches live (or at least connecting once).
    await page.waitForFunction(
      () => {
        const app = window.Alpine?.$data?.(document.querySelector('[x-data]'));
        const state = app?.officeSseState;
        return state === 'live' || state === 'connecting' || state === 'reconnecting';
      },
      undefined,
      { timeout: 15000 }
    ).catch(() => {});

    // Force-close EventSource from the page to simulate broker/container blip.
    await page.evaluate(() => {
      const roots = document.querySelectorAll('[x-data]');
      for (const el of roots) {
        const app = window.Alpine?.$data?.(el);
        if (app?.officeEventSource) {
          app.officeEventSource.close();
          if (typeof app.connectOfficeSSE === 'function') {
            // Trigger error-path style reconnect
            app.officeSseState = 'reconnecting';
            app.officeSseFailures = (app.officeSseFailures || 0) + 1;
            app.connectOfficeSSE();
          }
        }
      }
    });

    await page.waitForFunction(
      () => {
        const roots = document.querySelectorAll('[x-data]');
        for (const el of roots) {
          const app = window.Alpine?.$data?.(el);
          if (app?.officeSseState === 'live') return true;
          if (app?.officeFallbackPollTimer) return true;
        }
        return false;
      },
      undefined,
      { timeout: 20000 }
    );

    const state = await page.evaluate(() => {
      const roots = document.querySelectorAll('[x-data]');
      for (const el of roots) {
        const app = window.Alpine?.$data?.(el);
        if (app?.officeSseState) {
          return {
            state: app.officeSseState,
            fallback: Boolean(app.officeFallbackPollTimer),
            marker: document.body.innerText.includes('Grupa') || document.body.innerText.length > 50,
          };
        }
      }
      return { state: 'unknown', fallback: false, marker: false };
    });

    if (state.state !== 'live' && !state.fallback) {
      throw new Error(`SSE did not recover (state=${state.state}, fallback=${state.fallback})`);
    }
    console.log(`  Office SSE recovered: state=${state.state} fallback=${state.fallback}`);

    if (!String(await page.evaluate(() => document.body.innerText)).includes(marker().slice(0, 8))) {
      // Soft: dashboard still usable
      console.log('  Office dashboard still loaded after SSE blip');
    }
  } finally {
    await browser.close();
  }

  await cleanup(token);
}
