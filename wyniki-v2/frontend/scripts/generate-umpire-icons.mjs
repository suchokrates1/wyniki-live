import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('./umpire-icon-android.png', import.meta.url));
const outDir = fileURLToPath(new URL('../public/umpire-icons/', import.meta.url));
const icon192 = fileURLToPath(new URL('../public/umpire-icons/icon-192.png', import.meta.url));
const icon512 = fileURLToPath(new URL('../public/umpire-icons/icon-512.png', import.meta.url));

await mkdir(outDir, { recursive: true });

const result = spawnSync(
  'python',
  ['-c', [
    'from pathlib import Path',
    'from PIL import Image',
    'import sys',
    'src, out = Path(sys.argv[1]), Path(sys.argv[2])',
    'im = Image.open(src).convert("RGBA")',
    'im.resize((192, 192), Image.Resampling.LANCZOS).save(out / "icon-192.png", "PNG")',
    'im.resize((512, 512), Image.Resampling.LANCZOS).save(out / "icon-512.png", "PNG")',
  ].join('\n'), source, outDir],
  { encoding: 'utf8' },
);

if (result.status === 0) process.exit(0);

if (existsSync(icon192) && existsSync(icon512)) {
  console.warn('umpire icons: using committed PNGs (python/Pillow unavailable)');
  process.exit(0);
}

throw new Error(result.stderr || result.stdout || result.error?.message || `icon generate failed (${result.status})`);
