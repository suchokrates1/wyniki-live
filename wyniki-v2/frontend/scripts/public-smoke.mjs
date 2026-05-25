import { chromium } from '@playwright/test';

const LANGUAGES = ['pl', 'de', 'en', 'it', 'es', 'fr'];

const ROUTES = [
  { name: 'live scores', hash: 'live/scores' },
  { name: 'live bracket', hash: 'live/bracket' },
  { name: 'live schedule', hash: 'live/schedule' },
  { name: 'live history', hash: 'live/history' },
  { name: 'tournaments', hash: 'tournaments' },
  { name: 'players', hash: 'players' },
];

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

function pageUrl(baseUrl, lang, hash) {
  const url = new URL(baseUrl);
  url.searchParams.set('lang', lang);
  url.hash = hash;
  return url.toString();
}

async function inspectPage(page) {
  return page.evaluate(() => ({
    htmlLang: document.documentElement.lang || '',
    title: document.title || '',
    textLength: document.body.innerText.trim().length,
    ariaLabels: document.querySelectorAll('[aria-label]').length,
    selectedItems: document.querySelectorAll('[aria-selected="true"], [aria-current="page"]').length,
    hasBrokenText: /\bundefined\b|\[object Object\]/.test(document.body.innerText),
  }));
}

const baseUrl = argValue('--base-url', process.env.PUBLIC_SMOKE_BASE_URL || 'http://localhost:4173');
const languages = listArg('--languages', LANGUAGES).filter((lang) => LANGUAGES.includes(lang));
const routeNames = listArg('--routes', ROUTES.map((route) => route.name));
const routes = ROUTES.filter((route) => routeNames.includes(route.name) || routeNames.includes(route.hash));
const failures = [];
const browser = await chromium.launch({ headless: true });

try {
  for (const lang of languages) {
    for (const route of routes) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const runtimeErrors = [];
      page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (/^Failed to load resource:/i.test(text)) return;
        runtimeErrors.push(`console: ${text}`);
      });

      const url = pageUrl(baseUrl, lang, route.hash);
      const routeFailures = [];
      console.log(`check ${lang.padEnd(2)} ${route.name}`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForFunction(
          () => document.documentElement.lang,
          undefined,
          { timeout: 8000 }
        );
        await page.waitForTimeout(300);
        const snapshot = await inspectPage(page);

        if (!snapshot.htmlLang.toLowerCase().startsWith(lang)) {
          routeFailures.push(`html lang is "${snapshot.htmlLang}"`);
        }
        if (!snapshot.title.trim()) {
          routeFailures.push('missing document title');
        }
        if (snapshot.ariaLabels < 1) {
          routeFailures.push('no aria-label attributes found');
        }
        if (snapshot.selectedItems < 1) {
          routeFailures.push('no selected/current navigation item found');
        }
        if (snapshot.hasBrokenText) {
          routeFailures.push('visible text contains undefined or [object Object]');
        }
        if (runtimeErrors.length > 0) {
          routeFailures.push(runtimeErrors.join(' | '));
        }
        if (routeFailures.length > 0) {
          for (const failure of routeFailures) failures.push(`${lang} ${route.name}: ${failure}`);
          console.error(`fail ${lang.padEnd(2)} ${route.name}: ${routeFailures.join(' | ')}`);
        } else {
          console.log(`ok    ${lang.padEnd(2)} ${route.name}`);
        }
      } catch (error) {
        const failure = `${lang} ${route.name}: ${error.message}`;
        failures.push(failure);
        console.error(`fail ${failure}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error('\nPublic smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nPublic smoke passed for ${languages.length} languages and ${routes.length} routes.`);