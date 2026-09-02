import { expect, test } from '@playwright/test';
import { confirmMatchSetup, openUmpire, todayKey } from './helpers.js';

async function seedCourtTwo(page) {
  await page.addInitScript((day) => {
    localStorage.setItem('umpire.selected_language', 'en');
    localStorage.setItem('umpire.tutorial_prompted', '1');
    localStorage.setItem('umpire.selected_tournament', JSON.stringify({
      id: 31,
      name: 'Vilnius E2E',
      day,
    }));
    localStorage.setItem('umpire.court_session', JSON.stringify({
      courtId: 't31-2',
      courtName: 'Court 2',
      token: 'token-court-2',
      expiresAtMillis: Date.now() + 3_600_000,
    }));
  }, todayKey());
}

test('Director moves a live tablet off the shared court', async ({ page }) => {
  const writes = [];
  let matchCreated = false;
  let commandDelivered = false;
  let createdUuid = '';

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const auth = route.request().headers().authorization || '';

    if (url.includes('/tournaments/active')) {
      return route.fulfill({ json: [{ id: 31, name: 'Vilnius E2E' }] });
    }
    if (url.includes('/authorize')) {
      return route.fulfill({
        json: {
          authorized: true,
          token: 'token-court-2',
          court_id: 't31-2',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      });
    }
    if (url.includes('/suggested-match')) {
      return route.fulfill({ json: { suggestion: null } });
    }
    if (url.includes('/courts')) {
      return route.fulfill({
        json: {
          courts: [
            { kort_id: 't31-2', name: 'Court 2', is_available: true },
            { kort_id: 't31-8', name: 'Court 8', is_available: true },
          ],
        },
      });
    }
    if (url.includes('/players') && method === 'GET') {
      return route.fulfill({
        json: {
          players: [
            { id: 1, name: 'González', first_name: 'Jessica', last_name: 'González' },
            { id: 2, name: 'Schmidt', first_name: 'Daniela', last_name: 'Schmidt' },
          ],
        },
      });
    }
    if (url.includes('/matches') && method === 'POST' && !url.includes('/finish')) {
      const body = route.request().postDataJSON() || {};
      createdUuid = body.client_match_uuid || '';
      matchCreated = true;
      writes.push({ method, kind: 'create', courtId: body.court_id, auth });
      return route.fulfill({ json: { id: 671 } });
    }
    if (url.includes('/matches') && method === 'PUT') {
      const body = route.request().postDataJSON() || {};
      writes.push({ method, kind: 'update', courtId: body.court_id, auth });
      return route.fulfill({ json: { id: 671, ok: true } });
    }
    if (url.includes('/match-events') && method === 'POST') {
      const body = route.request().postDataJSON() || {};
      writes.push({ method, kind: 'event', courtId: body.court_id, auth });
      return route.fulfill({ json: { success: true } });
    }
    if (url.includes('/umpire/commands') && method === 'GET') {
      if (matchCreated && !commandDelivered) {
        commandDelivered = true;
        return route.fulfill({
          json: {
            commands: [{
              id: 'cmd-vilnius',
              type: 'director_control',
              match_id: 671,
              client_match_uuid: createdUuid,
              court_id: 't31-8',
              court_name: 'Court 8',
              court_token: 'token-court-8',
              court_token_expires_at: Math.floor(Date.now() / 1000) + 3600,
              player1_name: 'Jessica González',
              player2_name: 'Daniela Schmidt',
            }],
          },
        });
      }
      return route.fulfill({ json: { commands: [] } });
    }
    if (url.includes('umpire-heartbeat') || url.includes('/umpire/commands')) {
      return route.fulfill({ json: { status: 'ok', commands: [] } });
    }
    return route.fulfill({ status: 200, json: { ok: true } });
  });

  await seedCourtTwo(page);
  await openUmpire(page, '#/players');
  await page.getByRole('button', { name: 'González' }).click();
  await page.getByRole('button', { name: 'Schmidt' }).click();
  await confirmMatchSetup(page);
  await page.getByRole('button', { name: /González/ }).first().click();
  await expect(page.locator('.ump-win').first()).toBeVisible();

  await expect(page.locator('.ump-toast')).toHaveText('Updated from director');
  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('umpire.court_session');
    return raw ? JSON.parse(raw) : null;
  })).toMatchObject({
    courtId: 't31-8',
    token: 'token-court-8',
  });

  await page.locator('.ump-win').first().click();
  await expect.poll(() => writes.some((item) => (
    (item.kind === 'update' || item.kind === 'event')
    && item.courtId === 't31-8'
    && item.auth.includes('token-court-8')
  ))).toBeTruthy();
  expect(writes.filter((item) => item.kind === 'create')[0].courtId).toBe('t31-2');
});
