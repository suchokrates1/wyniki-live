import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../src/umpire/match-engine/', import.meta.url));
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => path.join(dir, name))
  .sort();

if (files.length === 0) {
  console.error('No match-engine tests found');
  process.exit(1);
}

const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
