import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
const SOURCE = join(PUBLIC, 'north-signal-logo-transparent.png');

async function generate() {
  // Standard PWA icons — just resize
  for (const size of [192, 512]) {
    await sharp(SOURCE)
      .resize(size, size)
      .toFile(join(PUBLIC, `pwa-${size}x${size}.png`));
    console.log(`  Created pwa-${size}x${size}.png`);
  }

  // Apple touch icon
  await sharp(SOURCE)
    .resize(180, 180)
    .toFile(join(PUBLIC, 'apple-touch-icon-180x180.png'));
  console.log('  Created apple-touch-icon-180x180.png');

  // Maskable icons — logo with padding on dark background
  for (const size of [192, 512]) {
    const padding = Math.round(size * 0.1);
    const inner = size - padding * 2;
    const resized = await sharp(SOURCE).resize(inner, inner).toBuffer();
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 5, g: 5, b: 5, alpha: 1 },
      },
    })
      .composite([{ input: resized, top: padding, left: padding }])
      .png()
      .toFile(join(PUBLIC, `pwa-maskable-${size}x${size}.png`));
    console.log(`  Created pwa-maskable-${size}x${size}.png`);
  }

  console.log('\nAll PWA icons generated successfully!');
}

generate().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
