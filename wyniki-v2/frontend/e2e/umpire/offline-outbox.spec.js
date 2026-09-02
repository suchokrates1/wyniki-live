import { expect, test } from '@playwright/test';
import { openUmpire, seedThroughCourt } from './helpers.js';

test('airplane scoring queues updates and flushes when back online', async ({ page }) => {
  const writes = [];
  let apiDown = false;

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const isMatchWrite = method === 'PUT'
      || (method === 'POST' && (
        url.includes('/finish')
        || url.includes('/match-statistics')
        || url.includes('/match-events')
      ));
    if (apiDown && isMatchWrite) {
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
      writes.push({ method, kind: 'event' });
      return route.fulfill({ json: { success: true } });
    }
    if (url.includes('/matches') && method === 'POST' && !url.includes('/finish')) {
      writes.push({ method, kind: 'create' });
      return route.fulfill({ json: { id: 99 } });
    }
    if (url.includes('/matches') && method === 'PUT') {
      writes.push({ method, kind: 'update' });
      return route.fulfill({ json: { id: 99, ok: true } });
    }
    if (url.includes('umpire-heartbeat') || url.includes('/umpire/commands')) {
      return route.fulfill({ json: { status: 'ok', commands: [] } });
    }
    return route.fulfill({ status: 200, json: { ok: true } });
  });

  await seedThroughCourt(page);
  await openUmpire(page, '#/players');
  await page.getByRole('button', { name: 'Kowalski' }).click();
  await page.getByRole('button', { name: 'Nowak' }).click();
  await expect(page.locator('h1.ump-title')).toHaveText('Match Setup', { timeout: 5_000 });
  await page.locator('.ump-mode').filter({ hasText: 'Basic' }).click();
  await page.getByRole('button', { name: /Kowalski/ }).first().click();
  await expect(page.locator('.ump-win').first()).toBeVisible();

  await expect.poll(() => writes.some((item) => item.kind === 'create')).toBeTruthy();
  const eventsAfterStart = writes.filter((item) => item.kind === 'event').length;
  apiDown = true;
  await page.locator('.ump-win').first().click();
  await expect(page.locator('.ump-board__pts').first()).toHaveText('15');
  await page.locator('.ump-win').first().click();
  await expect(page.locator('.ump-board__pts').first()).toHaveText('30');
  expect(writes.filter((item) => item.kind === 'event').length).toBe(eventsAfterStart);

  apiDown = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => writes.filter((item) => item.kind === 'event').length).toBeGreaterThan(eventsAfterStart);
});
