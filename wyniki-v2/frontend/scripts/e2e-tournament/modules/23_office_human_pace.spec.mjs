/**
 * Module 23: the office at human pace.
 *
 * A person types, pauses and clicks while data keeps refreshing (the "Odśwież" button, or
 * another operator saving something, which reaches this office over SSE). Each case starts
 * from the state a real operator has, refreshes in the middle of the work, waits like a
 * person would and checks nothing typed or picked was lost or swapped:
 *
 * - "+" on a category that already has a saved group keeps the new, still empty group
 * - "Wyczyść" and "Rozdziel automatycznie", each followed at once by a refresh, keep the count and the draw
 * - the header result dialog keeps its group, players and scores
 * - the viewer banner keeps the text being edited
 * - the match inspector keeps a changed time
 * - the category rename field and the new-player form keep their input
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, createTournament, addPlayers, confirmCategories, saveGroups, cleanup,
  resolveOfficeSlot, officeLogin, OFFICE_PASSWORD, launchBrowser,
} from '../fixtures.js';
import { OfficeLoginPage } from '../pages/officeLogin.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';
const KEEP = process.env.E2E_KEEP === '1';
const PAUSE_MS = 2500;
const log = (message) => console.log(`  ${message}`);

async function waitUntil(label, probe, { timeout = 20000, interval = 400 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

export default async function run() {
  const adminToken = await adminLogin();
  const today = new Date().toISOString().slice(0, 10);
  const tournament = await createTournament(adminToken, { startDate: today, endDate: today, courts: 3, isSimulation: false, isPublic: true });
  const tournamentId = tournament.id;
  const tag = tournament.name.split(' ')[0];

  const confirmed = await confirmCategories(adminToken, tournamentId, [{ preset_key: 'B1M' }, { preset_key: 'B2K' }]);
  const categories = confirmed.categories || [];
  const b1 = categories.find((cat) => cat.label.startsWith('B1'));
  const b2 = categories.find((cat) => cat.label.startsWith('B2'));
  const seed = [
    ...['Adam', 'Bogdan', 'Cyprian', 'Damian'].map((first) => ({ first, category: 'B1', gender: 'M' })),
    ...['Ewa', 'Fela', 'Gaja', 'Hela', 'Ida', 'Jola', 'Kaja', 'Lena'].map((first) => ({ first, category: 'B2', gender: 'K' })),
  ].map(({ first, category, gender }) => ({ name: `${first} ${tag}`, first_name: first, last_name: tag, category, gender, country: 'PL' }));
  const created = await addPlayers(adminToken, tournamentId, seed);
  const idOf = Object.fromEntries(seed.map((player, index) => [player.first_name, created.players[index].id]));
  // B1 M already has one saved group, as after a first draw or an import
  await saveGroups(adminToken, tournamentId, [{
    name: `${b1.label} — Grupa A`,
    tournament_category_id: b1.id,
    play_format: 'round_robin',
    players: ['Adam', 'Bogdan', 'Cyprian', 'Damian'].map((first) => idOf[first]),
  }]);

  const slot = await resolveOfficeSlot(tournament.name);
  const officeToken = (await officeLogin(slot)).token;
  const api = async (path, init = {}) => {
    const request = () => fetch(new URL(`/api/office/${slot}${path}`, BASE_URL), {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${officeToken}`, ...(init.headers || {}) },
    });
    let response;
    try {
      response = await request();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
      response = await request();
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} → ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  };

  const browser = await launchBrowser(chromium);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pl-PL' })).newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error).slice(0, 400)));
  page.on('dialog', (dialog) => dialog.accept());
  const alpine = (fn, arg) => page.evaluate(fn, arg);
  const openView = async (label) => {
    await page.locator('.office-tab').filter({ hasText: label }).click();
    await page.waitForFunction((text) => document.querySelector('.office-tab.is-active')?.textContent?.includes(text), label);
    await page.mouse.move(900, 500);
  };
  let otherOperatorEdits = 0;
  // Another operator saves something: the server invalidates this office over SSE.
  const otherOperatorSaves = async () => {
    otherOperatorEdits += 1;
    await api('/players', { method: 'POST', body: JSON.stringify({ first_name: `Gość${otherOperatorEdits}`, last_name: tag, category: 'B2', gender: 'K', country: 'PL' }) });
  };
  const refreshButton = () => page.locator('.office-topbar').getByRole('button', { name: 'Odśwież' });
  const humanPause = async ({ button = true } = {}) => {
    await otherOperatorSaves();
    if (button) await refreshButton().click();
    await page.waitForTimeout(PAUSE_MS);
  };

  try {
    const login = new OfficeLoginPage(page, BASE_URL);
    await login.goto(slot);
    await login.login(OFFICE_PASSWORD);

    // ——— "+" on a category with a saved group ———
    await openView('Grupy startowe');
    const divisionCard = (label) => page.locator('.office-groups button.rounded-2xl').filter({ hasText: label }).first();
    await divisionCard(b1.label).click();
    await page.waitForFunction(() => Number(Alpine.$data(document.body).planningGroupCount) === 1);
    await page.locator('.office-groups button').filter({ hasText: /^\+$/ }).click();
    await humanPause();
    const countAfterPlus = await alpine(() => Alpine.$data(document.body).planningGroupCount);
    if (Number(countAfterPlus) !== 2) throw new Error(`"+" on ${b1.label} went back to ${countAfterPlus} group(s) after a refresh`);
    await page.getByText(`${b1.label} — Grupa B`).first().waitFor({ state: 'visible', timeout: 5000 });
    log(`"+" on ${b1.label} (one saved group): still 2 groups with the empty Grupa B after a refresh`);

    // ——— clear, then auto draw, each followed at once by a refresh ———
    // ("Rozdziel automatycznie" only draws players who are not in a group yet)
    await page.locator('.office-groups').getByRole('button', { name: 'Wyczyść', exact: true }).click();
    await humanPause();
    const countAfterClear = await alpine(() => Alpine.$data(document.body).planningGroupCount);
    if (Number(countAfterClear) !== 2) throw new Error(`"Wyczyść" and a refresh took the group count to ${countAfterClear}`);
    await page.getByRole('button', { name: 'Rozdziel automatycznie' }).click();
    await humanPause();
    const b1Groups = await waitUntil('B1 draw saved as two groups', async () => {
      const groups = ((await api('/planning')).groups || []).filter((group) => Number(group.tournament_category_id) === Number(b1.id));
      return groups.length === 2 && groups.every((group) => group.players.length === 2) ? groups : null;
    }).catch(async (error) => {
      const groups = ((await api('/planning')).groups || []).map((group) => [group.name, group.players.map((player) => player.name)]);
      const ui = await alpine(() => {
        const data = Alpine.$data(document.body);
        return {
          count: data.planningGroupCount, division: data.planningSelectedDivision, revision: data.planningEditRevision,
          saving: data.planningSaving, timer: Boolean(data.planningSaveTimer), pending: data.pendingRemoteRefresh,
          assignments: data.planningGroupAssignments, targets: data.planningTargetGroupNames(),
        };
      });
      const toasts = await page.locator('.toast .alert').allInnerTexts().catch(() => []);
      throw new Error(`${error.message}; saved ${JSON.stringify(groups)}; UI ${JSON.stringify(ui)}; toasts ${toasts.join(' | ')}`);
    });
    await page.waitForTimeout(PAUSE_MS);
    const uiAssigned = await alpine(() => Object.values(Alpine.$data(document.body).planningGroupAssignments || {}).filter(Boolean).length);
    if (uiAssigned < 4) throw new Error(`After the draw and a refresh the office shows ${uiAssigned} of 4 players in groups`);
    log(`"Wyczyść", "Rozdziel automatycznie", each with an immediate refresh: saved as ${b1Groups.map((group) => `${group.name.split('— ').pop()} (${group.players.length})`).join(', ')} and still shown`);

    // ——— header result dialog ———
    const groupB = b1Groups.find((group) => group.name.endsWith('Grupa B'));
    const [first, second] = groupB.players.map((player) => player.name || player.player_name);
    await page.locator('.office-topbar').getByRole('button', { name: 'Dodaj wynik' }).click();
    const dialog = page.locator('.office-modal:visible');
    await dialog.waitFor({ state: 'visible' });
    await dialog.locator('label.form-control:visible').filter({ has: page.locator('span.label-text', { hasText: /^Grupa$/ }) }).locator('select').selectOption(String(groupB.id));
    await dialog.locator('label.form-control:visible').filter({ hasText: 'Zawodnik A' }).locator('select').selectOption(first);
    await dialog.locator('label.form-control:visible').filter({ hasText: 'Zawodnik B' }).locator('select').selectOption(second);
    const numbers = dialog.locator('input[type="number"]');
    for (const [index, value] of [4, 2, 3, 4].entries()) {
      await numbers.nth(index).fill(String(value));
      await numbers.nth(index).dispatchEvent('input');
    }
    await numbers.nth(4).fill('10');
    await numbers.nth(4).dispatchEvent('input');
    await numbers.nth(5).fill('8');
    await numbers.nth(5).dispatchEvent('input');
    await humanPause({ button: false });
    const form = await alpine(() => {
      const m = Alpine.$data(document.body).officeNewMatch;
      return { group: String(m.group_id), a: m.player1_name, b: m.player2_name, sets: [m.set1_p1, m.set1_p2, m.set2_p1, m.set2_p2, m.stb_p1, m.stb_p2].map(String) };
    });
    const expectedForm = { group: String(groupB.id), a: first, b: second, sets: ['4', '2', '3', '4', '10', '8'] };
    if (JSON.stringify(form) !== JSON.stringify(expectedForm)) throw new Error(`Result dialog changed during a refresh: ${JSON.stringify(form)}, expected ${JSON.stringify(expectedForm)}`);
    await dialog.getByRole('button', { name: 'Zapisz wynik' }).click();
    const saved = await waitUntil('dialog result saved', async () => ((await api('/dashboard')).matches || []).find((match) => (
      new Set([match.player1_name, match.player2_name]).has(first) && new Set([match.player1_name, match.player2_name]).has(second)
    )));
    if (saved.winner_name !== first) throw new Error(`Saved result winner ${saved.winner_name}, expected ${first}`);
    log(`Header result dialog: group, players and 4:2 3:4 10:8 survived a refresh from another operator; saved for ${first.split(' ')[0]} v ${second.split(' ')[0]}`);

    // ——— viewer banner being edited ———
    await openView('Komunikat dla zawodników');
    const bannerText = `Kort 2 wolny od 15:00 ${tag}`;
    await page.locator('#office-quick-info-message').fill(bannerText);
    await humanPause();
    const bannerUi = await page.locator('#office-quick-info-message').inputValue();
    if (bannerUi !== bannerText) throw new Error(`Banner text changed during a refresh: "${bannerUi}"`);
    await page.locator('#office-quick-info-active').check();
    await page.getByRole('button', { name: 'Opublikuj', exact: true }).click();
    await waitUntil('banner published', async () => (await fetch(new URL(`/api/tournament/${tournamentId}/info`, BASE_URL)).then((r) => r.json())).message === bannerText);
    const edited = `${bannerText} — zmiana`;
    await page.locator('#office-quick-info-message').fill(edited);
    await humanPause();
    if ((await page.locator('#office-quick-info-message').inputValue()) !== edited) throw new Error('Edited banner text was replaced by a refresh');
    await page.getByRole('button', { name: 'Opublikuj', exact: true }).click();
    await waitUntil('banner edit published', async () => (await fetch(new URL(`/api/tournament/${tournamentId}/info`, BASE_URL)).then((r) => r.json())).message === edited);
    log('Viewer banner: typed and edited text survived refreshes and were published as typed');

    // ——— match inspector ———
    const planning = await api('/planning');
    const courtId = planning.courts?.[0]?.kort_id || (await api('/autoschedule/config')).courts[0].kort_id;
    const entry = (planning.schedule || []).find((row) => row.source_type === 'group' && !row.match_id);
    await api(`/schedule/${entry.id}`, { method: 'PUT', body: JSON.stringify({ day_date: today, scheduled_time: '10:00', court_id: courtId, status: 'planned' }) });
    await openView('Terminarz');
    const block = page.locator(`[data-schedule-entry][data-schedule-id="${entry.id}"]`);
    await block.waitFor({ state: 'visible', timeout: 15000 });
    await block.click();
    const inspector = page.locator('.office-inspector');
    await inspector.locator('input[type="time"]').fill('15:30');
    await inspector.locator('input[type="time"]').dispatchEvent('input');
    await humanPause();
    const timeUi = await inspector.locator('input[type="time"]').inputValue();
    if (timeUi !== '15:30') throw new Error(`Inspector time changed during a refresh: ${timeUi}`);
    await inspector.getByRole('button', { name: 'Zapisz', exact: true }).click();
    await waitUntil('inspector time saved', async () => ((await api('/planning')).schedule || []).find((row) => row.id === entry.id)?.scheduled_time === '15:30');
    log('Match inspector: a changed time survived refreshes and was saved');

    // ——— category rename and new player form ———
    await openView('Grupy startowe');
    const categoryChip = page.locator('div.rounded-xl').filter({ hasText: b2.label }).filter({ has: page.getByRole('button', { name: 'Edytuj' }) }).first();
    await categoryChip.getByRole('button', { name: 'Edytuj' }).click();
    const renameInput = page.locator('input[x-model="categoryEditLabel"]');
    const renamed = `${b2.label} Open`;
    await renameInput.fill(renamed);
    await humanPause();
    if ((await renameInput.inputValue()) !== renamed) throw new Error(`Category rename field changed during a refresh: "${await renameInput.inputValue()}"`);
    await page.locator('div.grid').filter({ has: renameInput }).getByRole('button', { name: 'Zapisz' }).click();
    await waitUntil('category renamed', async () => ((await api('/planning')).tournament_categories || []).some((cat) => cat.label === renamed));

    await page.getByRole('button', { name: '+ Dodaj zawodnika' }).click();
    const playerForm = page.locator('div.grid').filter({ has: page.getByRole('button', { name: 'Dodaj zawodnika', exact: true }) }).last();
    await playerForm.getByPlaceholder('Imię').fill('Marta');
    await playerForm.getByPlaceholder('Nazwisko').fill(tag);
    await humanPause();
    const typed = [await playerForm.getByPlaceholder('Imię').inputValue(), await playerForm.getByPlaceholder('Nazwisko').inputValue()];
    if (typed[0] !== 'Marta' || typed[1] !== tag) throw new Error(`New player form changed during a refresh: ${typed.join(' ')}`);
    await playerForm.locator('select').nth(0).selectOption('B2');
    await playerForm.locator('select').nth(1).selectOption('K');
    await playerForm.getByRole('button', { name: 'Dodaj zawodnika', exact: true }).click();
    await waitUntil('player added', async () => ((await api('/planning')).players || []).some((player) => player.first_name === 'Marta'));
    log('Category rename and new-player form: typed values survived refreshes and were saved');

    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
    log(`${otherOperatorEdits} refreshes from another operator during the work, no page errors`);
  } finally {
    await browser.close();
  }
  if (!KEEP) await cleanup(adminToken);
}
