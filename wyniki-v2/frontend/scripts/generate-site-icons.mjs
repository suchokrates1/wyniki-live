import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const svgPath = fileURLToPath(new URL('../public/brand/blindtennis-icon-512.svg', import.meta.url));
const outDir = fileURLToPath(new URL('../public/site-icons/', import.meta.url));
const icon192 = fileURLToPath(new URL('../public/site-icons/icon-192.png', import.meta.url));
const icon512 = fileURLToPath(new URL('../public/site-icons/icon-512.png', import.meta.url));

await mkdir(outDir, { recursive: true });

const svg = await readFile(svgPath);
const dataUri = `data:image/svg+xml;base64,${svg.toString('base64')}`;

async function render(size, outPath) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!DOCTYPE html><html><head><style>
        html,body{margin:0;width:${size}px;height:${size}px;background:#0b1220;overflow:hidden}
        img{display:block;width:${size}px;height:${size}px;object-fit:contain}
      </style></head><body><img id="i" src="${dataUri}" alt=""></body></html>`,
      { waitUntil: 'load' },
    );
    await page.waitForFunction(() => {
      const img = document.getElementById('i');
      return img && img.complete && img.naturalWidth > 0;
    }, undefined, { timeout: 10_000 });
    await page.screenshot({ path: outPath, type: 'png' });
  } finally {
    await browser.close();
  }
}

try {
  await render(192, icon192);
  await render(512, icon512);
  console.log('site icons: wrote icon-192.png and icon-512.png');
} catch (err) {
  if (existsSync(icon192) && existsSync(icon512)) {
    console.warn(`site icons: using committed PNGs (${err?.message || err})`);
    process.exit(0);
  }
  throw err;
}
