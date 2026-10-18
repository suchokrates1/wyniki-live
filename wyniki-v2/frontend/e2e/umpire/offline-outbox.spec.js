import { expect, test } from '@playwright/test';
import { confirmMatchSetup, openUmpire, seedThroughCourt } from './helpers.js';

/** The umpire API with match writes failing while state.apiDown; the writes that got through are in state.writes. */
async function mockOutboxApi(page, state) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const isMatchWrite = method === 'PUT'
      || (method === 'POST' && (
        url.includes('/finish')
        || url.includes('/match-statistics')
        || url.includes('/match-events')
      ));
    if (state.apiDown && isMatchWrite) {
      return route.fulfill({ status: 503, json: { error: 'offline' } });
    }
    if (url.includes('/tournaments/active')) {
      return route.fulfill({ json: [{ id: 31, name: 'Vilnius E2E' }] });
    }
    if (url.includes('/authorize')) {
      return route.fulfill({
        json: {
          authorized: true,
          token: 'e2e-token',
          court_id: 't31-1',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      });
    }
    if (url.includes('/suggested-match')) {
      return route.fulfill({ json: { suggestion: null } });
    }
    if (url.includes('/courts')) {
      return route.fulfill({
        json: { courts: [{ kort_id: 't31-1', name: 'Court 1', is_available: true }] },
      });
    }
    if (url.includes('/players') && method === 'GET') {
      return route.fulfill({
        json: {
          players: [
            { id: 1, name: 'Kowalski', first_name: 'Jan', last_name: 'Kowalski' },
            { id: 2, name: 'Nowak', first_name: 'Adam', last_name: 'Nowak' },
          ],
        },
      });
    }
    if (url.includes('/match-events') && method === 'POST') {
      state.writes.push({ method, kind: 'event' });
      return route.fulfill({ json: { success: true } });
    }
    if (url.includes('/matches') && method === 'POST' && !url.includes('/finish')) {
      state.writes.push({ method, kind: 'create' });
      return route.fulfill({ json: { id: 99 } });
    }
    if (url.includes('/matches') && method === 'PUT') {
      state.writes.push({ method, kind: 'update' });
      return route.fulfill({ json: { id: 99, ok: true } });
    }
    if (url.includes('umpire-heartbeat') || url.includes('/umpire/commands')) {
      return route.fulfill({ json: { status: 'ok', commands: [] } });
    }
    return route.fulfill({ status: 200, json: { ok: true } });
  });
}

/** Two points scored while the server cannot be reached; returns how many events had gone out before. */
async function scoreTwoPointsWithoutServer(page, state) {
  await seedThroughCourt(page);
  await openUmpire(page, '#/players');
  await page.getByRole('button', { name: 'Kowalski' }).click();
  await page.getByRole('button', { name: 'Nowak' }).click();
  await confirmMatchSetup(page);
  await page.getByRole('button', { name: /Kowalski/ }).first().click();
  await expect(page.locator('.ump-win').first()).toBeVisible();

  await expect.poll(() => state.writes.some((item) => item.kind === 'create')).toBeTruthy();
  const eventsAfterStart = state.writes.filter((item) => item.kind === 'event').length;
  state.apiDown = true;
  await page.locator('.ump-win').first().click();
  await expect(page.locator('.ump-board__pts').first()).toHaveText('15');
  await page.locator('.ump-win').first().click();
  await expect(page.locator('.ump-board__pts').first()).toHaveText('30');
  expect(state.writes.filter((item) => item.kind === 'event').length).toBe(eventsAfterStart);
  return eventsAfterStart;
}

test('airplane scoring queues updates and flushes when back online', async ({ page }) => {
  const state = { writes: [], apiDown: false };
  await mockOutboxApi(page, state);
  const eventsAfterStart = await scoreTwoPointsWithoutServer(page, state);

  state.apiDown = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => state.writes.filter((item) => item.kind === 'event').length).toBeGreaterThan(eventsAfterStart);
});

test('back from the background, the queued points go out without an online event', async ({ page }) => {
  const state = { writes: [], apiDown: false };
  await mockOutboxApi(page, state);
  const eventsAfterStart = await scoreTwoPointsWithoutServer(page, state);

  // the tablet left the app; the server came back while it was away (no 'online' event: the
  // device never lost its own network)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  state.apiDown = false;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => state.writes.filter((item) => item.kind === 'event').length).toBeGreaterThan(eventsAfterStart);
});
