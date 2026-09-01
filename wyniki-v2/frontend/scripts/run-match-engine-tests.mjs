import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(next));
    else if (entry.name.endsWith('.test.js')) files.push(next);
  }
  return files;
}

const dir = fileURLToPath(new URL('../src/umpire/', import.meta.url));
const files = walk(dir).sort();

if (files.length === 0) {
  console.error('No match-engine tests found');
  process.exit(1);
}

const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
