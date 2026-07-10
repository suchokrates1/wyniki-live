import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LANGUAGES = ['pl', 'de', 'en'];
const THEMES = ['light', 'dark'];

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

function summarizeViolation(violation) {
  return {
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.length,
    targets: violation.nodes.slice(0, 5).map((node) => node.target.join(' ')),
  };
}

const baseUrl = argValue('--base-url', process.env.PUBLIC_A11Y_BASE_URL || 'https://score.vestmedia.pl');
const navigationTimeout = Number(argValue('--navigation-timeout', '45000'));
const readinessTimeout = Number(argValue('--readiness-timeout', '15000'));
const languages = listArg('--languages', LANGUAGES).filter((lang) => LANGUAGES.includes(lang));
const themes = listArg('--themes', THEMES).filter((theme) => THEMES.includes(theme));
const routeNames = listArg('--routes', ROUTES.map((route) => route.name));
const routes = ROUTES.filter((route) => routeNames.includes(route.name) || routeNames.includes(route.hash));
const reportPath = argValue('--report', '');

const failures = [];
const report = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  axeTags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  checks: [],
};

const browser = await chromium.launch({ headless: true });

try {
  for (const theme of themes) {
    for (const lang of languages) {
      for (const route of routes) {
        const context = await browser.newContext({
          colorScheme: theme === 'dark' ? 'dark' : 'light',
        });
        const page = await context.newPage();
        const url = pageUrl(baseUrl, lang, route.hash);
        const label = `${theme}/${lang}/${route.name}`;
        console.log(`scan ${label}`);

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
          await page.waitForFunction(
            () => document.documentElement.lang && !document.querySelector('[x-cloak]'),
            undefined,
            { timeout: readinessTimeout },
          );
          if (theme === 'dark') {
            await page.evaluate(() => {
              document.documentElement.setAttribute('data-theme', 'dark');
            });
          }
          await page.waitForTimeout(500);

          const axeResult = await new AxeBuilder({ page })
            .withTags(report.axeTags)
            .disableRules(['color-contrast'])
            .analyze();

          const violations = axeResult.violations.map(summarizeViolation);
          const incomplete = axeResult.incomplete.map(summarizeViolation);
          report.checks.push({
            theme,
            lang,
            route: route.name,
            url,
            violationCount: violations.length,
            incompleteCount: incomplete.length,
            violations,
            incomplete,
          });

          if (violations.length > 0) {
            failures.push(`${label}: ${violations.length} violations`);
            for (const violation of violations) {
              console.error(`  [${violation.impact}] ${violation.id} (${violation.nodes} nodes)`);
              for (const target of violation.targets) console.error(`    - ${target}`);
            }
          } else {
            console.log(`ok    ${label}`);
          }
          if (incomplete.length > 0) {
            console.warn(`warn  ${label}: ${incomplete.length} incomplete checks`);
          }
        } catch (error) {
          failures.push(`${label}: ${error.message}`);
          console.error(`fail ${label}: ${error.message}`);
        } finally {
          await context.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}

if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to ${reportPath}`);
}

if (failures.length > 0) {
  console.error('\nPublic a11y scan failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nPublic a11y scan passed for ${themes.length} themes, ${languages.length} languages, ${routes.length} routes.`);
