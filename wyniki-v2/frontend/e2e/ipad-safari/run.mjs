/**
 * The iPad differences of the umpire PWA, in the real Safari of an iPad simulator (Appium XCUITest
 * drives Safari through Web Inspector, so the site keeps Safari's own storage between sessions,
 * unlike safaridriver's isolated windows). Runs on a macOS runner (.github/workflows/ipad-safari.yml)
 * with the backend started here on 127.0.0.1:8080, so this script can also stop it to cut the
 * tablet off from the server.
 *
 * Checks: the install instruction (iOS has no install button), Wake Lock while a match is on,
 * points scored without the server survive Safari being closed, and points queued while Safari was
 * in the background go out when it comes back.
 *
 * Env: IPAD_UDID (booted simulator), APPIUM_URL (default http://127.0.0.1:4723), BACKEND_DIR
 * (wyniki-v2), UMPIRE_LIVE_BASE_URL=http://127.0.0.1:8080, E2E_ADMIN_PASSWORD.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { remote } from 'webdriverio';
import { authorizeCourtApi, cleanupFixture, courtSnapshot, createFixture } from '../umpire-live/live.js';

const BASE = (process.env.UMPIRE_LIVE_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const UDID = process.env.IPAD_UDID;
const APPIUM = new URL(process.env.APPIUM_URL || 'http://127.0.0.1:4723');
const OUT = 'ipad-results';
const SAFARI = 'com.apple.mobilesafari';
mkdirSync(OUT, { recursive: true });

const results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const simctl = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' });

// --- the backend, so the tablet can lose and find it -------------------------------------------
let server = null;
async function startServer() {
  server = spawn('python', ['-m', 'gunicorn', '--worker-class', 'gevent', '--workers', '1', '--bind', '127.0.0.1:8080', 'app:app'], {
    cwd: process.env.BACKEND_DIR || '..',
    env: process.env,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch { /* starting */ }
    await sleep(500);
  }
  throw new Error('backend did not start');
}
async function stopServer() {
  if (!server) return;
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill('SIGTERM');
  await exited;
  server = null;
}

// --- Safari on the iPad ------------------------------------------------------------------------
async function safari() {
  const driver = await remote({
    hostname: APPIUM.hostname,
    port: Number(APPIUM.port),
    logLevel: 'warn',
    connectionRetryTimeout: 600_000,
    capabilities: {
      platformName: 'iOS',
      browserName: 'Safari',
      'appium:automationName': 'XCUITest',
      'appium:udid': UDID,
      ...(process.env.IPAD_VERSION ? { 'appium:platformVersion': process.env.IPAD_VERSION } : {}),
      // a fresh runner builds WebDriverAgent first: minutes, not seconds
      'appium:simulatorStartupTimeout': 300_000,
      'appium:wdaLaunchTimeout': 600_000,
      'appium:wdaConnectionTimeout': 600_000,
      'appium:showXcodeLog': true,
      // element clicks become real taps through XCUITest, so Safari sees a user gesture
      'appium:nativeWebTap': true,
      'appium:noReset': true,
      'appium:safariInitialUrl': `${BASE}/health`,
      'appium:newCommandTimeout': 600,
    },
  });
  // Appium's Safari session starts with no time for async scripts (IndexedDB, Wake Lock)
  await driver.setTimeout({ script: 30_000 });
  return driver;
}

async function shot(driver, name) {
  try {
    await driver.saveScreenshot(`${OUT}/${name}.png`);
  } catch { /* the session may be gone */ }
}

async function waitFor(description, fn, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn().catch((error) => `error: ${error.message}`);
    if (last === true) return;
    await sleep(500);
  }
  throw new Error(`${description} (last: ${JSON.stringify(last)})`);
}

const title = (driver) => driver.execute(() => document.querySelector('h1.ump-title')?.textContent?.trim() || '');
const points = (driver) => driver.execute(() => [...document.querySelectorAll('.ump-board__pts')].map((el) => el.textContent.trim()));
const outboxSize = (driver) => driver.executeAsync((done) => {
  const request = indexedDB.open('umpire-pwa');
  request.onsuccess = () => {
    const count = request.result.transaction('outbox').objectStore('outbox').count();
    count.onsuccess = () => done(count.result);
    count.onerror = () => done(-1);
  };
  request.onerror = () => done(-1);
});

/** Clicks a button by its text, the way a finger would reach it on the page. */
async function press(driver, text) {
  const ok = await driver.execute((wanted) => {
    const button = [...document.querySelectorAll('button')].find((el) => el.offsetParent !== null && el.textContent.includes(wanted));
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!ok) throw new Error(`no visible button "${text}"`);
}

async function winPoint(driver) {
  await driver.execute(() => {
    document.querySelector('.ump-announce.is-shown button')?.click();
    document.querySelector('.ump-win')?.click();
  });
  await sleep(400);
}

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '', seconds: Math.round((Date.now() - started) / 1000) });
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`FAIL  ${name} — ${error.message}`);
  }
}

// --- the run -----------------------------------------------------------------------------------
await startServer();
const fixture = await createFixture({ label: 'iPad Safari', players: 2 });
const court = fixture.court(1);
const [a, b] = fixture.players;
let driver = await safari();

await check('install instruction shows in Safari (iOS has no install button)', async () => {
  await driver.url(`${BASE}/umpire`);
  await waitFor('install instruction', async () => (await driver.execute(() => document.body.innerText)).includes('Add to Home Screen'));
  await shot(driver, '1-install-hint');
  return 'Share → Add to Home Screen';
});

await check('a match starts on the iPad', async () => {
  const token = await authorizeCourtApi(court);
  const day = new Date().toISOString().slice(0, 10);
  await driver.execute((seed) => {
    localStorage.setItem('umpire.selected_language', 'en');
    localStorage.setItem('umpire.tutorial_prompted', '1');
    localStorage.setItem('umpire.selected_tournament', JSON.stringify(seed.tournament));
    localStorage.setItem('umpire.court_session', JSON.stringify(seed.court));
    sessionStorage.setItem('umpire.pwa_gate_dismissed', '1');
  }, {
    tournament: { id: fixture.tournamentId, name: fixture.name, day },
    court: { courtId: court, courtName: 'Court 1', token, expiresAtMillis: Date.now() + 3_600_000 },
  });
  await driver.url(`${BASE}/umpire#/players`);
  await waitFor('players screen', async () => (await title(driver)) === 'Select Players');
  await press(driver, a.last);
  await press(driver, b.last);
  await waitFor('match setup', async () => (await title(driver)) === 'Match Setup');
  await press(driver, 'Next');
  await waitFor('server choice', async () => (await title(driver)) === 'Who serves first?');
  // a real tap (not a script click): Safari grants the wake lock only on a user gesture
  await (await driver.$('.ump-serve-btn')).click();
  await waitFor('scoring screen', async () => (await title(driver)) === 'Match');
  await winPoint(driver);
  await winPoint(driver);
  await waitFor('30:0 on the overlay', async () => (await courtSnapshot(court))?.A?.points === '30');
  await shot(driver, '2-match');
});

await check('Wake Lock is held while the match is on (the screen does not dim)', async () => {
  const held = () => driver.execute(() => window.Alpine?.$data(document.querySelector('[x-data]'))?.wakeLockHeld?.() === true);
  try {
    await waitFor('the app holds a screen wake lock', held, 10_000);
  } catch (error) {
    const support = await driver.execute(() => ('wakeLock' in navigator ? 'API present' : 'no Wake Lock API'));
    throw new Error(`${error.message}; ${support}`);
  }
  return 'navigator.wakeLock sentinel held by the app';
});

await check('points scored without the server survive Safari being closed', async () => {
  await stopServer();
  await winPoint(driver);
  await waitFor('40 on the board', async () => (await points(driver))[0] === '40');
  const queued = await outboxSize(driver);
  if (!(queued > 0)) throw new Error(`outbox holds ${queued}`);
  // the umpire leaves Safari and iPadOS closes it
  simctl('launch', UDID, 'com.apple.Preferences');
  await sleep(3000);
  simctl('terminate', UDID, SAFARI);
  await driver.deleteSession().catch(() => {});
  await startServer();
  driver = await safari();
  await driver.url(`${BASE}/umpire`);
  await waitFor('back on the match', async () => (await title(driver)) === 'Match');
  await waitFor('40 still on the board', async () => (await points(driver))[0] === '40');
  await waitFor('the overlay catches up with the queued point', async () => (await courtSnapshot(court))?.A?.points === '40', 40_000);
  await shot(driver, '3-after-safari-closed');
  return `${queued} queued writes sent after Safari reopened`;
});

await check('points queued while Safari was in the background go out when it comes back', async () => {
  await stopServer();
  await winPoint(driver); // 40 → game
  await waitFor('game on the board', async () => (await points(driver))[0] === '0');
  simctl('launch', UDID, 'com.apple.Preferences');
  await startServer();
  await sleep(2000);
  simctl('launch', UDID, SAFARI);
  await waitFor('the overlay has the game without another point', async () => (await courtSnapshot(court))?.A?.current_games === 1, 40_000);
  await shot(driver, '4-back-from-background');
});

await driver.deleteSession().catch(() => {});
await cleanupFixture(fixture).catch(() => {});
await stopServer();
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
