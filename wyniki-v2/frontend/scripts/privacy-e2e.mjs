/**
 * Public privacy + consent e2e. Safe against test.blindtennis.app
 * (no admin login, no DB writes).
 *
 *   node scripts/privacy-e2e.mjs --base-url https://test.blindtennis.app
 */
import { chromium } from '@playwright/test';
import { PRIVACY_SECTION_IDS, getPrivacyContent } from '../src/i18n/legal/privacyContent.js';
import { ANALYTICS_CONSENT_KEY, UMAMI_WEBSITE_ID } from '../src/consent/analytics.js';

const LANGUAGES = ['pl', 'de', 'en', 'it', 'es', 'fr', 'lt'];

function argValue(name, fallback = '') {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function listArg(name, fallback) {
  const value = argValue(name, '');
  if (!value) return fallback;
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

const baseUrl = argValue('--base-url', process.env.PRIVACY_E2E_BASE_URL || 'https://test.blindtennis.app');
const navigationTimeout = Number(argValue('--navigation-timeout', '30000'));
const languages = listArg('--languages', LANGUAGES).filter((lang) => LANGUAGES.includes(lang));

function pageUrl(path, lang, hash = '') {
  const url = new URL(path, baseUrl);
  url.searchParams.set('lang', lang);
  if (hash) url.hash = hash;
  return url.toString();
}

async function inspectPrivacy(page) {
  return page.evaluate((sectionIds) => {
    const text = document.body.innerText.replaceAll('\u200B', '');
    return {
      statusOk: document.readyState === 'complete' || document.readyState === 'interactive',
      title: document.title,
      htmlLang: document.documentElement.lang || '',
      h1: document.querySelector('.privacy-article h1')?.textContent?.trim() || '',
      text,
      sectionIds: sectionIds.filter((id) => document.getElementById(id)),
      footerHref: document.querySelector('footer a.vm-footer__legal')?.getAttribute('href') || '',
      bannerVisible: Boolean(document.querySelector('.consent-banner') && document.body.classList.contains('has-consent-banner')),
    };
  }, [...PRIVACY_SECTION_IDS]);
}

async function measureBanner(page) {
  return page.evaluate(() => {
    const banner = document.querySelector('.consent-banner');
    const footer = document.querySelector('footer');
    const footerLink = document.querySelector('footer a.vm-footer__legal');
    const reject = document.querySelector('.consent-banner__btn--ghost');
    const accept = document.querySelector('.consent-banner__btn:not(.consent-banner__btn--ghost)');
    const privacy = document.querySelector('.consent-banner__link');
    if (!banner || getComputedStyle(banner).display === 'none') {
      return { visible: false };
    }
    const br = banner.getBoundingClientRect();
    const fr = footer?.getBoundingClientRect();
    const flr = footerLink?.getBoundingClientRect();
    const overlap = (a, b) => Boolean(a && b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom));
    return {
      visible: true,
      gap: fr ? Math.round(fr.top - br.bottom) : null,
      coversFooter: overlap(br, fr),
      coversFooterLink: overlap(br, flr),
      reject: reject && Math.round(reject.getBoundingClientRect().height),
      accept: accept && Math.round(accept.getBoundingClientRect().height),
      privacyHref: privacy?.getAttribute('href') || '',
      privacyHeight: privacy && Math.round(privacy.getBoundingClientRect().height),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  console.log(`Privacy e2e → ${baseUrl}`);

  for (const lang of languages) {
    const legal = getPrivacyContent(lang);
    const context = await browser.newContext();
    const page = await context.newPage();
    const url = pageUrl('/privacy', lang);
    console.log(`  policy ${lang}`);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    if (!response || response.status() >= 400) {
      failures.push(`${lang} /privacy → ${response?.status() || 'no response'}`);
      await context.close();
      continue;
    }
    await page.waitForFunction(() => document.querySelector('.privacy-article h1')?.textContent?.trim(), undefined, { timeout: 15000 });
    const info = await inspectPrivacy(page);
    if (info.htmlLang !== lang) failures.push(`${lang} html lang is ${info.htmlLang}`);
    if (info.h1 !== legal.title) failures.push(`${lang} h1 "${info.h1}" ≠ "${legal.title}"`);
    if (!info.text.includes('Vest Media')) failures.push(`${lang} missing Vest Media`);
    if (!info.text.includes('B1')) failures.push(`${lang} missing B1–B4`);
    if (!info.text.includes('stats.dawidsuchodolski.pl')) failures.push(`${lang} missing analytics host`);
    if (/\bUmami\b/i.test(info.text)) failures.push(`${lang} still names Umami`);
    const missing = PRIVACY_SECTION_IDS.filter((id) => !info.sectionIds.includes(id));
    if (missing.length) failures.push(`${lang} missing sections ${missing.join(',')}`);
    await context.close();
  }

  {
    console.log('  home footer + reject');
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(pageUrl('/', 'pl'), { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    if (!response || response.status() >= 400) {
      failures.push(`home → ${response?.status() || 'no response'}`);
    } else {
      await page.waitForSelector('.consent-banner', { timeout: 15000 });
      const footerHref = await page.locator('footer a.vm-footer__legal').getAttribute('href');
      if (!footerHref?.includes('/privacy?lang=pl')) failures.push(`home footer href ${footerHref}`);
      const bannerHref = await page.locator('.consent-banner__link').getAttribute('href');
      if (bannerHref !== '/privacy?lang=pl#analityka') failures.push(`banner href ${bannerHref}`);
      await page.locator('.consent-banner__btn--ghost').click();
      await page.waitForFunction(() => !document.body.classList.contains('has-consent-banner'), undefined, { timeout: 5000 });
      const stored = await page.evaluate((key) => localStorage.getItem(key), ANALYTICS_CONSENT_KEY);
      if (stored !== 'rejected') failures.push(`reject stored ${stored}`);
      const hasScript = await page.evaluate((id) => Boolean(document.querySelector(`script[data-website-id="${id}"]`)), UMAMI_WEBSITE_ID);
      if (hasScript) failures.push('reject still injected analytics script');
    }
    await context.close();
  }

  {
    console.log('  accept loads analytics');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(pageUrl('/', 'pl'), { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    await page.waitForSelector('.consent-banner__btn:not(.consent-banner__btn--ghost)', { timeout: 15000 });
    await page.locator('.consent-banner__btn:not(.consent-banner__btn--ghost)').click();
    await page.waitForFunction(() => !document.body.classList.contains('has-consent-banner'), undefined, { timeout: 5000 });
    const stored = await page.evaluate((key) => localStorage.getItem(key), ANALYTICS_CONSENT_KEY);
    if (stored !== 'accepted') failures.push(`accept stored ${stored}`);
    const hasScript = await page.evaluate((id) => Boolean(document.querySelector(`script[data-website-id="${id}"]`)), UMAMI_WEBSITE_ID);
    if (!hasScript) failures.push('accept did not inject analytics script');
    await context.close();
  }

  {
    console.log('  phone banner vs footer');
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(pageUrl('/', 'pl'), { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    await page.waitForSelector('.consent-banner', { timeout: 15000 });
    await page.waitForTimeout(500);
    const geometry = await measureBanner(page);
    if (!geometry.visible) failures.push('phone banner hidden');
    else {
      if (geometry.coversFooter || geometry.coversFooterLink) failures.push('phone banner covers footer');
      if (geometry.gap != null && geometry.gap < 0) failures.push(`phone banner gap ${geometry.gap}`);
      if ((geometry.reject || 0) < 44 || (geometry.accept || 0) < 44) failures.push('phone buttons below 44px');
      if ((geometry.privacyHeight || 0) < 44) failures.push('phone privacy link below 44px');
      if (geometry.privacyHref !== '/privacy?lang=pl#analityka') failures.push(`phone banner href ${geometry.privacyHref}`);
    }
    await context.close();
  }

  {
    console.log('  office login link');
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(pageUrl('/office', 'pl'), { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    if (!response || response.status() >= 400) {
      failures.push(`office → ${response?.status() || 'no response'}`);
    } else {
      const href = await page.locator('a[href*="/privacy"]').first().getAttribute('href').catch(() => '');
      if (!href?.includes('/privacy')) failures.push('office missing privacy link');
    }
    await context.close();
  }

  {
    console.log('  #analityka');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(pageUrl('/privacy', 'pl', 'analityka'), { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    await page.waitForSelector('#analityka', { timeout: 15000 });
    const inPage = await page.evaluate(() => Boolean(document.getElementById('analityka')));
    if (!inPage) failures.push('#analityka missing');
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nFAIL ${failures.length}`);
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}

console.log('\nPASS privacy e2e');
