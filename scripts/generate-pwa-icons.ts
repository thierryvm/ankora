#!/usr/bin/env tsx
/**
 * Generate PWA icons (PNG) from the master SVG at public/brand/icon.svg.
 * Run with: npm run icons
 */
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, 'public', 'brand', 'icon.svg');
const OUT = path.join(ROOT, 'public', 'icons');

const SIZES: Array<{ file: string; size: number; maskable?: boolean }> = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
  { file: 'favicon-16.png', size: 16 },
];

async function main(): Promise<void> {
  const svg = await readFile(SRC);
  await mkdir(OUT, { recursive: true });

  for (const target of SIZES) {
    const pipeline = sharp(svg, { density: 384 }).resize(target.size, target.size, {
      fit: 'contain',
      background: target.maskable
        ? { r: 15, g: 118, b: 110, alpha: 1 }
        : { r: 0, g: 0, b: 0, alpha: 0 },
    });

    if (target.maskable) {
      // Safe zone for maskable: scale inner content to ~80% (sharp composite technique).
      await pipeline
        .extend({
          top: Math.round(target.size * 0.1),
          bottom: Math.round(target.size * 0.1),
          left: Math.round(target.size * 0.1),
          right: Math.round(target.size * 0.1),
          background: { r: 15, g: 118, b: 110, alpha: 1 },
        })
        .resize(target.size, target.size)
        .png({ compressionLevel: 9 })
        .toFile(path.join(OUT, target.file));
    } else {
      await pipeline.png({ compressionLevel: 9 }).toFile(path.join(OUT, target.file));
    }

    console.log(`  ✓ ${target.file} (${target.size}×${target.size})`);
  }

  console.log('\nDone. Icons written to public/icons/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
