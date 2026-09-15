/**
 * Module 25: the "Drabinki" step — four groups of three in B2 K. The office sees the
 * default main draw with consolation, changes places and consolation, swaps two
 * first-round lines, survives a refresh mid-edit, confirms, and the planner gets exactly
 * the matches the preview promised. After the first knockout result the format is locked.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, apiUrl, cleanup, createTournament, confirmCategories, addPlayers, saveGroups, fetchGroups,
  resolveOfficeSlot, officeLogin, officeGroupMatch, officeKnockoutMatch, marker, OFFICE_PASSWORD, launchBrowser,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';
const log = (message) => console.log(`  ${message}`);

async function waitUntil(label, check, { timeout = 15000, interval = 300 } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export default async function run() {
  const token = await adminLogin();
  const tournament = await createTournament(token, { courts: 4 });
  const confirmed = await confirmCategories(token, tournament.id, [{ preset_key: 'B2K' }]);
  const category = (confirmed.categories || [])[0];
  if (!category?.id) throw new Error('B2 K category was not created');
  const tag = marker();
  const people = [];
  for (const letter of 'ABCD') {
    for (const rank of [1, 2, 3]) {
      people.push({ name: `Draw${letter}${rank} ${tag}`, first_name: `Draw${letter}${rank}`, last_name: tag, category: 'B2', gender: 'K' });
    }
  }
  const { player_ids: ids } = await addPlayers(token, tournament.id, people);
  await saveGroups(token, tournament.id, [...'ABCD'].map((letter, index) => ({
    name: `${category.label} — Grupa ${letter}`,
    tournament_category_id: category.id,
    play_format: 'groups_knockout',
    players: ids.slice(index * 3, index * 3 + 3),
  })));
  const slot = await resolveOfficeSlot(tournament.name);
  const auth = await officeLogin(slot, OFFICE_PASSWORD);
  const officeGet = async (path) => {
    const response = await fetch(apiUrl(`/api/office/${slot}/${path}`), { headers: { Authorization: `Bearer ${auth.token}` } });
    return response.json();
  };

  const browser = await launchBrowser(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
    const login = new OfficeLoginPage(page, BASE_URL);
    await login.goto(slot);
    await login.login(OFFICE_PASSWORD);

    // groups are drawn, so entering the office lands on step 2
    await page.waitForFunction(() => Alpine.$data(document.body).activeTab === 'draws', undefined, { timeout: 15000 });
    const steps = await page.locator('.office-step').evaluateAll((nodes) => nodes.map((node) => node.dataset.stepState));
    if (steps.slice(0, 2).join(',') !== 'done,current') throw new Error(`Expected Grupy startowe done and Drabinki current: ${steps.join(',')}`);
    log('Groups drawn → the office opens on step 2 "Drabinki"');

    const summary = page.locator('[data-draw-summary]:visible').first();
    const firstRound = () => page.locator('.office-draws__round').first().locator('.office-draws__line').evaluateAll(
      (nodes) => nodes.map((node) => node.querySelector('.office-draws__who')?.textContent.trim()),
    );
    await waitUntil('default preview', async () => (await summary.textContent())?.includes('meczów: 16'));
    if (await page.locator('[data-draw-format="main"]').getAttribute('aria-pressed') !== 'true') throw new Error('Four groups should default to the main draw');
    const defaultLines = await firstRound();
    if (defaultLines.join(',') !== 'A1,B2,D1,C2,B1,A2,C1,D2') throw new Error(`Default first round: ${defaultLines.join(',')}`);
    if (!(await summary.textContent()).includes('główna 12 · pocieszenie 4')) throw new Error(`Summary: ${await summary.textContent()}`);
    if ((await page.locator('.office-draws__line.is-seed').count()) !== 4) throw new Error('Four group winners should be seeded');
    if (await page.locator('[data-draw-clash]').isVisible()) throw new Error('The automatic draw must not pair players from one group');
    await page.locator('[data-draw-tab="consolation"]').click();
    const consolation = await firstRound();
    if (consolation.length !== 4 || !consolation.every((label) => label.endsWith('3'))) throw new Error(`Consolation first round: ${consolation.join(',')}`);
    await page.locator('[data-draw-tab="main"]').click();
    log(`Default: main draw ${defaultLines.join(' ')}, consolation ${consolation.join(' ')}, 16 matches`);

    // only the third-place match, no consolation
    await page.locator('[data-draw-places="third"]').click();
    await page.locator('[data-draw-consolation]').uncheck();
    await waitUntil('preview without placements and consolation', async () => (await summary.textContent())?.trim() === 'meczów: 8');
    if (await page.locator('[data-draw-tab="consolation"]').count()) throw new Error('Consolation tab should disappear');

    // swap B2 and C2
    const lines = page.locator('.office-draws__round').first().locator('.office-draws__line');
    await lines.nth(1).click();
    await page.locator('.office-draws__line.is-picked').waitFor({ state: 'visible' });
    if (!(await page.locator('.office-draws__edit').innerText()).includes('Wybrano')) throw new Error('The picked line is not announced');
    await lines.nth(3).click();
    await waitUntil('swapped first round', async () => (await firstRound()).join(',') === 'A1,C2,D1,B2,B1,A2,C1,D2');
    await page.locator('[data-draw-reset]').getByText('Przywróć automatyczne (1)').waitFor({ state: 'visible' });
    if ((await page.locator('.office-draws__line.is-moved').count()) !== 2) throw new Error('Both swapped lines should be marked');

    // a clash: swapping A2 next to A1 is allowed but flagged
    await lines.nth(1).click();
    await lines.nth(5).click();
    await page.locator('[data-draw-clash]').getByText('Meczów graczy z jednej grupy w 1. rundzie: 1').waitFor({ state: 'visible' });
    await page.locator('[data-draw-reset]').click();
    await waitUntil('reset to automatic', async () => (await firstRound()).join(',') === defaultLines.join(','));
    await lines.nth(1).click();
    await lines.nth(3).click();
    await waitUntil('swap again', async () => (await firstRound()).join(',') === 'A1,C2,D1,B2,B1,A2,C1,D2');
    log('Swap B2⇄C2 shows in the preview; a same-group pairing is flagged; "Przywróć automatyczne" undoes swaps');

    // data refreshing in the background must not drop the edit
    await page.evaluate(() => Promise.all([Alpine.$data(document.body).loadDrawFormats(), Alpine.$data(document.body).loadDashboard(false)]));
    await page.waitForTimeout(800);
    if (!(await page.getByText('Niezapisane zmiany').isVisible())) throw new Error('A background refresh dropped the unsaved draw');
    if ((await firstRound()).join(',') !== 'A1,C2,D1,B2,B1,A2,C1,D2') throw new Error('A background refresh reverted the swap');
    log('A refresh mid-edit keeps the unsaved draw');

    await page.locator('[data-draw-confirm]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.toast .alert')].some((node) => node.textContent.includes('Zatwierdzono drabinkę')), undefined, { timeout: 15000 });
    await waitUntil('confirmed badge', async () => (await page.locator('[data-draw-state]').first().getAttribute('data-draw-state')) === 'confirmed');
    const saved = (await officeGet('knockout-formats')).categories[0];
    if (!saved.config.confirmed || saved.config.places !== 'third' || saved.config.consolation || JSON.stringify(saved.config.swaps) !== '{"main":[[1,3]]}') {
      throw new Error(`Saved config: ${JSON.stringify(saved.config)}`);
    }
    const knockoutRows = await waitUntil('8 knockout rows for the planner', async () => {
      const rows = ((await officeGet('planning')).schedule || []).filter((row) => row.source_type === 'knockout');
      return rows.length === 8 ? rows : null;
    }, { timeout: 20000 }).catch(async (error) => {
      const rows = ((await officeGet('planning')).schedule || []).filter((row) => row.source_type === 'knockout');
      throw new Error(`${error.message}: ${rows.length} rows ${rows.map((row) => row.phase).join(' | ')}`);
    });
    await waitUntil('step 2 done', async () => (await page.locator('.office-step').nth(1).getAttribute('data-step-state')) === 'done');
    log(`Confirmed: ${knockoutRows.length} knockout matches in the schedule (as previewed), step 2 done`);

    // play the groups (first listed wins), then one quarterfinal
    const groups = await fetchGroups(token, tournament.id);
    for (const group of groups) {
      const names = (group.players || []).map((row) => row.name);
      for (let a = 0; a < names.length; a += 1) {
        for (let b = a + 1; b < names.length; b += 1) {
          await officeGroupMatch(slot, auth.token, {
            group_id: group.id, player1_name: names[a], player2_name: names[b],
            sets: [{ player1_games: 4, player2_games: 1 }, { player1_games: 4, player2_games: 2 }],
          });
        }
      }
    }
    const quarter = await waitUntil('quarterfinal A1 vs C2', async () => (
      ((await officeGet('dashboard')).progress?.knockout?.matches || [])
        .find((row) => String(row.phase).endsWith('Ćwierćfinał') && row.player1_name?.startsWith('DrawA1') && row.player2_name?.startsWith('DrawC2'))
    ), { timeout: 20000 });
    await officeKnockoutMatch(slot, auth.token, {
      schedule_id: quarter.schedule_id,
      sets: [{ player1_games: 4, player2_games: 1 }, { player1_games: 4, player2_games: 2 }],
    });
    log('Groups played; the swapped quarterfinal DrawA1 vs DrawC2 exists and has a result');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.office-rail', { state: 'visible' });
    await page.locator('.office-tab').filter({ hasText: 'Forma rozgrywek' }).click();
    await waitUntil('locked badge', async () => (await page.locator('[data-draw-state]').first().getAttribute('data-draw-state')) === 'locked');
    if (!(await page.locator('[data-draw-format="main"]').isDisabled())) throw new Error('Format cards should be disabled once the knockout started');
    if (!(await page.locator('.office-draws__locked').isVisible())) throw new Error('Locked note missing');
    const locked = await fetch(apiUrl(`/api/office/${slot}/knockout-formats/${category.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ config: { ...saved.config, places: 'all' } }),
    });
    if (locked.status !== 409) throw new Error(`Changing a started draw should be refused, got ${locked.status}`);
    log('After a knockout result the format is locked in the UI and refused by the API (409)');

    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await browser.close();
  }

  await cleanup(token);
}
