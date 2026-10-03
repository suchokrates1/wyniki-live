/** System: who gets the panic alarm, the SMTP that sends the reports, and the way out of the panel. */
import { expect, test } from '@playwright/test';

import { openAdmin, openSection } from './helpers.js';

async function openSystem(page, options) {
  await openAdmin(page, options);
  await openSection(page, 'system', 'System');
}

test('the panic list says who hears the alarm and who is muted', async ({ page }) => {
  await openSystem(page);
  const rows = page.locator('#admin-system .adm-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Reżyserka');
  await expect(rows.first()).toContainText('48111222333@c.us');
  await expect(rows.first().locator('.adm-chip')).toHaveText('dostaje alarm');
  await expect(rows.nth(1).locator('.adm-chip')).toHaveText('wyciszony');
});

test('nobody on the list is stated plainly', async ({ page }) => {
  await openSystem(page, { panic: { enabled: false, recipients: [] } });
  await expect(page.locator('#admin-system .adm-empty').first()).toContainText('Nikt nie dostaje alarmu');
});

test('a new recipient is posted with the name and the WAHA number', async ({ page }) => {
  const calls = [];
  await openSystem(page, { onRequest: (call) => calls.push(call) });
  await page.locator('#adm-panic-name').fill('Sędzia główny');
  await page.locator('#adm-panic-chat').fill('48999888777@c.us');
  const add = page.getByRole('button', { name: 'Dodaj odbiorcę' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => calls.filter((call) => call.method === 'POST' && call.url.includes('/panic')).length).toBeGreaterThan(0);
  const post = calls.find((call) => call.method === 'POST' && call.url.includes('/panic'));
  expect(JSON.stringify(post.body)).toContain('48999888777@c.us');
});

test('SMTP lives here now, filled from the server, and saves', async ({ page }) => {
  const calls = [];
  await openSystem(page, { onRequest: (call) => calls.push(call) });
  await expect(page.locator('#adm-smtp-smtp-host')).toHaveValue('smtp.ovh.net');
  await expect(page.locator('#adm-smtp-smtp-from-email')).toHaveValue('turniej@blindtennis.app');
  const save = page.getByRole('button', { name: 'Zapisz SMTP' });
  await save.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => calls.filter((call) => call.method === 'PUT' && call.url.includes('/settings/email')).length).toBe(1);
});

test('the SMTP password stays hidden until asked for', async ({ page }) => {
  await openSystem(page);
  const field = page.locator('#adm-smtp-pass');
  await expect(field).toHaveAttribute('type', 'password');
  const toggle = page.getByRole('button', { name: 'Pokaż hasło' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(field).toHaveAttribute('type', 'text');
});

test('the Turnieje section no longer carries the SMTP form', async ({ page }) => {
  await openAdmin(page);
  await expect(page.locator('#admin-tournaments-list')).toBeVisible();
  await expect(page.locator('#adm-smtp-smtp-host')).toBeHidden();
});

test('the panel says where the password lives and offers the way out', async ({ page }) => {
  await openSystem(page);
  const card = page.locator('#admin-system .adm-card').last();
  await expect(card).toContainText('ADMIN_PASSWORD');
  await expect(card.getByRole('button', { name: 'Wyloguj z tego urządzenia' })).toBeVisible();
});
