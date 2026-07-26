/**
 * E2E tournament test runner — discovers and runs spec modules in order.
 *
 * Usage:
 *   node scripts/e2e-tournament/run.mjs                    # all modules
 *   node scripts/e2e-tournament/run.mjs --module 01_bootstrap
 */
import { readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const MODULES_DIR = resolve(import.meta.dirname, 'modules');

function argValue(name, fallback = '') {
  const prefix = `${name}=`;
  const inline = process.argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const moduleFilter = argValue('--module');

const specFiles = readdirSync(MODULES_DIR)
  .filter((f) => f.endsWith('.spec.mjs'))
  .sort();

const toRun = moduleFilter
  ? specFiles.filter((f) => f.includes(moduleFilter))
  : specFiles;

if (toRun.length === 0) {
  console.error(`No modules matched filter: "${moduleFilter}"`);
  process.exit(1);
}

console.log(`\n=== E2E Tournament Runner ===`);
console.log(`Base URL: ${process.env.E2E_BASE_URL || 'http://localhost:18087'}`);
console.log(`Modules: ${toRun.length}\n`);

const results = [];
const t0 = Date.now();

for (const file of toRun) {
  const modName = basename(file, '.spec.mjs');
  const modPath = pathToFileURL(resolve(MODULES_DIR, file)).href;
  console.log(`--- [${modName}] ---`);
  const mt0 = Date.now();
  try {
    const mod = await import(modPath);
    if (typeof mod.default === 'function') {
      await mod.default();
    } else if (typeof mod.run === 'function') {
      await mod.run();
    }
    const elapsed = ((Date.now() - mt0) / 1000).toFixed(1);
    console.log(`  PASS (${elapsed}s)\n`);
    results.push({ name: modName, pass: true, elapsed });
  } catch (err) {
    const elapsed = ((Date.now() - mt0) / 1000).toFixed(1);
    console.error(`  FAIL (${elapsed}s): ${err.message}\n`);
    results.push({ name: modName, pass: false, elapsed, error: err.message });
  }
}

const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;

console.log(`\n=== Summary: ${passed} passed, ${failed} failed (${totalElapsed}s) ===`);
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'} ${r.name} (${r.elapsed}s)`);
}

if (failed > 0) process.exit(1);
