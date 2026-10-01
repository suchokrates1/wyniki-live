import { expect, test } from '@playwright/test';
import { mockUmpireApi, openUmpire, seedLanguage } from './helpers.js';

test('the umpire asks for help and hears that support is on the way', async ({ page }) => {
  await mockUmpireApi(page);
  await seedLanguage(page, 'pl');
  let panicBody = null;
  await page.route('**/api/umpire/panic', async (route) => {
    panicBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: { sent: 1 } });
  });
  await openUmpire(page);

  await page.getByRole('button', { name: 'Poproś o pomoc' }).click();
  await expect(page.getByRole('heading', { name: 'Czy wysłać prośbę o pomoc?' })).toBeVisible();
  await expect(page.getByText('Reżyserka dostanie WhatsApp, że potrzebujesz pomocy na tym korcie.')).toBeVisible();
  await page.getByRole('button', { name: 'Wyślij' }).click();

  await expect(page.getByText('Obsługa techniczna jest w drodze.')).toBeVisible();
  expect(panicBody).toMatchObject({ note: '' });
});
