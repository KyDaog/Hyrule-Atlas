'use strict';

/* ==========================================================================
   Turns any picture (PNG with a transparent background works best) into the
   Windows icon the installer and app use: build/icon.ico

   Usage (from the project folder):
     node tools/make-icon.js path/to/your-image.png

   - The picture is trimmed, centered on a square and given a small margin, so a
     wide or tall image (like a 600 x 520 Triforce) is not stretched.
   - The .ico contains 16, 24, 32, 48, 64, 128 and 256 px versions.
   - Close the old icon in every program first, then rebuild the app.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const input = process.argv[2];
const output = path.resolve(process.argv[3] || path.join(__dirname, '..', 'build', 'icon.ico'));
const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  if (!input) throw new Error('Give the picture to use, for example: node tools/make-icon.js triforce.png');
  const source = path.resolve(input);
  if (!fs.existsSync(source)) throw new Error('Picture not found: ' + source);

  // Trim empty (transparent) margins, then place the picture on a square canvas with a little breathing room.
  const trimmed = await sharp(source).ensureAlpha().trim().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  const side = Math.round(Math.max(width, height) * 1.08);
  const master = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed, gravity: 'centre' }])
    .png()
    .toBuffer();

  const images = [];
  for (const size of SIZES) {
    images.push({ size, data: await sharp(master).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer() });
  }

  // ICO file: a small header, one 16-byte entry per picture, then the PNG data itself.
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);                 // reserved
  header.writeUInt16LE(1, 2);                 // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const at = 6 + i * 16;
    header.writeUInt8(image.size === 256 ? 0 : image.size, at);       // width  (0 means 256)
    header.writeUInt8(image.size === 256 ? 0 : image.size, at + 1);   // height
    header.writeUInt8(0, at + 2);                                     // palette colors
    header.writeUInt8(0, at + 3);
    header.writeUInt16LE(1, at + 4);                                  // color planes
    header.writeUInt16LE(32, at + 6);                                 // bits per pixel
    header.writeUInt32LE(image.data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += image.data.length;
  });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, Buffer.concat([header, ...images.map((i) => i.data)]));
  console.log('Wrote ' + output + ' (' + SIZES.join(', ') + ' px versions)');
}

main().catch((error) => {
  console.error('Failed: ' + error.message);
  process.exit(1);
});
