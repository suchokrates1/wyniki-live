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

test('while nobody has an account, the shared password is named; the way out stays', async ({ page }) => {
  await openSystem(page);
  const card = page.getByRole('region', { name: 'Dostęp do panelu' });
  await expect(card).toContainText('ADMIN_PASSWORD');
  await expect(card.getByText('Nie ma jeszcze kont administratorów.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Wyloguj z tego urządzenia' })).toBeVisible();
});

test('administrators: you are marked, another one is added with a link and can be removed', async ({ page }) => {
  const admins = {
    me: 1, shared_password: false,
    admins: [
      { id: 1, email: 'dawid@example.org', name: 'Dawid', has_password: 1, disabled: 0 },
      { id: 2, email: 'anna@example.org', name: '', has_password: 0, disabled: 0 },
    ],
  };
  await openSystem(page, { admins });
  const sent = [];
  await page.route(/\/admin\/api\/admins(\/\d+)?$/, (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fallback();
    sent.push(`${request.method()} ${new URL(request.url()).pathname}`);
    if (request.method() === 'POST') return route.fulfill({ status: 201, json: { account: { id: 3, email: 'nowy@example.org' }, invite_url: 'https://test.blindtennis.app/admin/invite?token=abc', emailed: false } });
    return route.fulfill({ json: { success: true } });
  });
  const card = page.getByRole('region', { name: 'Dostęp do panelu' });
  await expect(card.getByText('ADMIN_PASSWORD')).toBeHidden();
  const me = card.locator('.adm-row').filter({ hasText: 'dawid@example.org' });
  await expect(me.getByText('to Ty')).toBeVisible();
  await expect(me.getByRole('button', { name: /Odbierz uprawnienia/ })).toBeHidden();
  await expect(card.locator('.adm-row').filter({ hasText: 'anna@example.org' })).toContainText('czeka na ustawienie hasła');

  await card.getByLabel('E-mail nowego administratora').fill('nowy@example.org');
  await card.getByRole('button', { name: 'Dodaj administratora' }).click();
  await expect(card.getByLabel('Link do ustawienia hasła')).toHaveValue('https://test.blindtennis.app/admin/invite?token=abc');
  await expect(card.getByText('Mail nie wyszedł')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: /Odbierz uprawnienia\s*: anna@example\.org/ }).click();
  await expect.poll(() => sent).toEqual(['POST /admin/api/admins', 'DELETE /admin/api/admins/2']);
});

test('the change log says who changed what, from the admin and from the organizer panel', async ({ page }) => {
  await openSystem(page, { audit: [
    { id: 2, action: 'admin.admin_series.attach', account_email: 'dawid@example.org', created_at: '2026-10-08T09:41:12Z', tournament_name: '5th Dürener Handicup 2026', detail: { method: 'PUT', path: '/admin/api/series/1/tournaments/28' } },
    { id: 1, action: 'court_pin', account_email: 'organizer@example.org', created_at: '2026-10-08T08:00:00Z', tournament_name: '5th Dürener Handicup 2026', detail: {} },
  ] });
  const card = page.getByRole('region', { name: 'Dziennik zmian' });
  const rows = card.locator('.adm-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('admin_series.attach (PUT /admin/api/series/1/tournaments/28)');
  await expect(rows.first()).toContainText('2026-10-08 09:41 · dawid@example.org · 5th Dürener Handicup 2026');
  await expect(rows.nth(1)).toContainText('panel organizatora: court_pin');
});
