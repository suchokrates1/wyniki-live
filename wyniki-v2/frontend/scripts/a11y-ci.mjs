/* CI runner: boot the mock server on the built frontend, run the public a11y
   scan (axe, color-contrast enabled) against it, then exit with its status. */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './a11y-mock-server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.A11Y_CI_PORT) || 8811;

const server = await start(PORT);

const extraArgs = process.argv.slice(2);
const scan = spawn(
  process.execPath,
  [join(__dirname, 'a11y-public.mjs'), '--base-url', `http://localhost:${PORT}`, ...extraArgs],
  { stdio: 'inherit' },
);

scan.on('exit', (code) => {
  server.close();
  process.exit(code ?? 1);
});
