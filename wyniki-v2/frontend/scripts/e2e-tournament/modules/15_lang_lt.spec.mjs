/**
 * Module 15: Lithuanian UI — ?lang=lt on public + office; Lietuvių selected; no raw PL keys on doubles screens.
 */
import { chromium } from '@playwright/test';
import {
  adminLogin, cleanup, seedDoublesTournament, OFFICE_PASSWORD,
} from '../fixtures.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:18087';

const RAW_KEYS = ['planning.doubles', 'planning.playFormat', 'modals.teamA', 'bracket.pair'];

export default async function run() {
  const token = await adminLogin();
  const seeded = await seedDoublesTournament(token, { pairCount: 2, playFormat: 'round_robin' });
  const { slot } = seeded;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();

    await page.goto(`${BASE_URL}/?lang=lt`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(
      () => document.documentElement.lang === 'lt' || document.body.innerText.toLowerCase().includes('lietuvi'),
      undefined,
      { timeout: 15000 },
    );
    const publicLang = await page.locator('#langSelect').inputValue().catch(() => '');
    if (publicLang && publicLang !== 'lt') {
      throw new Error(`Public select expected lt, got ${publicLang}`);
    }
    const publicText = await page.evaluate(() => document.body.innerText);
    for (const key of RAW_KEYS) {
      if (publicText.includes(key)) throw new Error(`Public LT UI leaked raw key ${key}`);
    }
    if (!/kortas|lentel|tiesiog/i.test(publicText) && !publicText.includes('Lietuvių')) {
      throw new Error('Public LT page does not look Lithuanian');
    }
    console.log('  Public ?lang=lt: html lang/select OK, no raw keys');

    await page.goto(`${BASE_URL}/office/${slot}?lang=lt`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForFunction(
      () => document.body.innerText.includes('Įėjimas į varžybų biurą')
        || document.body.innerText.includes('Lietuvių')
        || document.documentElement.lang === 'lt',
      undefined,
      { timeout: 15000 },
    );
    const officeSelect = await page.locator('#officeLangSelect').inputValue().catch(() => '');
    if (officeSelect && officeSelect !== 'lt') {
      throw new Error(`Office select expected lt, got ${officeSelect}`);
    }
    const password = page.locator('input[type="password"]');
    if (await password.count()) {
      await password.fill(OFFICE_PASSWORD);
      const enter = page.getByRole('button').filter({ hasText: /Įeiti|Wejdź/ }).first();
      await enter.click();
      await page.waitForTimeout(1500);
    }
    const officeText = await page.evaluate(() => document.body.innerText);
    for (const key of RAW_KEYS) {
      if (officeText.includes(key)) throw new Error(`Office LT UI leaked raw key ${key}`);
    }
    console.log('  Office ?lang=lt: Lietuvių selected, no raw PL keys');
  } finally {
    await browser.close();
  }

  await cleanup(token);
}
