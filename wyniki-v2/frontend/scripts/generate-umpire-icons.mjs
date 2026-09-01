import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const outDir = fileURLToPath(new URL('../public/umpire-icons/', import.meta.url));

function crc32(buffer) {
  return zlib.crc32(buffer) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header, data])));
  return Buffer.concat([length, header, data, crc]);
}

function pngRgba(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function tennisIcon(size) {
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size * 0.34;
  const bg = [11, 18, 32, 255];
  const ball = [196, 230, 70, 255];
  const seam = [11, 18, 32, 255];
  return pngRgba(size, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) return bg;
    const nx = dx / radius;
    const ny = dy / radius;
    const leftSeam = Math.abs(nx + 0.55) ** 2 + (ny * 0.72) ** 2;
    const rightSeam = Math.abs(nx - 0.55) ** 2 + (ny * 0.72) ** 2;
    if (Math.abs(leftSeam - 0.42) < 0.08 || Math.abs(rightSeam - 0.42) < 0.08) {
      return seam;
    }
    return ball;
  });
}

await mkdir(outDir, { recursive: true });
for (const size of [192, 512]) {
  const file = path.join(outDir, `icon-${size}.png`);
  const bytes = tennisIcon(size);
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(file);
    stream.on('finish', resolve);
    stream.on('error', reject);
    stream.end(bytes);
  });
}
