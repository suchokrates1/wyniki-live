import { chromium } from '@playwright/test';

function argValue(name, fallback = '') {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function appUrl(baseUrl, path) {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function readJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${payload.error || response.statusText}`);
  }
  return payload;
}

async function inspectPage(page) {
  return page.evaluate(() => ({
    title: document.title || '',
    text: document.body.innerText || '',
    activeTab: document.querySelector('.office-tab.is-active')?.textContent?.trim() || '',
    hasBrokenText: /\bundefined\b|\[object Object\]/.test(document.body.innerText),
  }));
}

const baseUrl = argValue('--base-url', process.env.OFFICE_SMOKE_BASE_URL || 'https://score.vestmedia.pl');
const slot = Number(argValue('--slot', process.env.OFFICE_SMOKE_SLOT || '3'));
const meta = await readJson(appUrl(baseUrl, `/api/office/${slot}/meta`));
const tournament = meta.tournament || {};
const password = argValue('--password', process.env.OFFICE_SMOKE_PASSWORD || (tournament.is_simulation ? 'test' : ''));
const failures = [];

if (!slot || Number.isNaN(slot)) {
  failures.push('office slot must be a number');
}

if (tournament.has_office_password && password) {
  const authPayload = await readJson(appUrl(baseUrl, `/api/office/${slot}/auth`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const dashboard = authPayload.dashboard || {};
  if (!dashboard.progress?.groups) failures.push('dashboard payload missing progress.groups');
  if (!dashboard.progress?.knockout) failures.push('dashboard payload missing progress.knockout');
  if (!Array.isArray(dashboard.progress?.knockout?.matches)) failures.push('dashboard progress.knockout.matches is not an array');
}

const browser = await chromium.launch({ headless: true });

try {
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

  console.log(`check office slot ${slot}: ${tournament.name || 'unknown tournament'}`);
  await page.goto(appUrl(baseUrl, `/office/${slot}`), { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(() => document.body.innerText.includes('Wejście do biura zawodów'), undefined, { timeout: 10000 });

  let snapshot = await inspectPage(page);
  if (!snapshot.title.trim()) failures.push('office page missing document title');
  if (!snapshot.text.includes(tournament.name || '')) failures.push('office login page does not show tournament name');
  if (snapshot.hasBrokenText) failures.push('office login page contains undefined or [object Object]');

  if (tournament.has_office_password && password) {
    await page.getByLabel('Hasło modułu biura').fill(password);
    await page.getByRole('button', { name: 'Wejdź do biura' }).click();
    await page.waitForFunction(() => document.body.innerText.includes('Ostatnie mecze'), undefined, { timeout: 12000 });
    await page.getByRole('button', { name: 'Drabinka' }).click();
    await page.waitForFunction(() => document.querySelector('.office-tab.is-active')?.textContent?.includes('Drabinka'), undefined, { timeout: 8000 });
    await page.waitForFunction(
      () => document.body.innerText.toLocaleLowerCase('pl-PL').includes('wygenerowane'),
      undefined,
      { timeout: 8000 }
    );

    snapshot = await inspectPage(page);
    const normalizedText = snapshot.text.toLocaleLowerCase('pl-PL');
    if (snapshot.activeTab !== 'Drabinka') failures.push(`expected active office tab "Drabinka", got "${snapshot.activeTab}"`);
    if (!normalizedText.includes('wygenerowane')) failures.push('knockout tab missing generated counter');
    if (!normalizedText.includes('gotowe do gry')) failures.push('knockout tab missing ready counter');
    if (snapshot.hasBrokenText) failures.push('authenticated office page contains undefined or [object Object]');
  } else if (tournament.has_office_password) {
    console.log('skip authenticated office checks: no password provided');
  }

  if (runtimeErrors.length > 0) failures.push(runtimeErrors.join(' | '));
  await context.close();
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error('\nOffice smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Office smoke passed for slot ${slot}.`);