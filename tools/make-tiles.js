'use strict';

/* ==========================================================================
   One-time tool: cuts hyrule_map.png into small map tiles (tiles/ folder).
   A 250 MB PNG is too big for Chromium to decode as a single image; tiles
   load quickly and stay sharp at every zoom level.

   Usage (from the project folder):
     npm install
     npm run tiles
   or with custom paths:
     node tools/make-tiles.js path/to/map.png path/to/output-folder

   Output: tiles/<level>/<row>/<column>.webp  plus  tiles/meta.json
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TILE_SIZE = 256;
const input = path.resolve(process.argv[2] || path.join(__dirname, '..', 'hyrule_map.png'));
const output = path.resolve(process.argv[3] || path.join(__dirname, '..', 'tiles'));

async function main() {
  if (!fs.existsSync(input)) throw new Error('Input image not found: ' + input);
  if (fs.existsSync(output)) {
    throw new Error('Output folder already exists: ' + output + '\nDelete it first if you want to rebuild the tiles.');
  }

  // Huge images are streamed from disk instead of being loaded into memory at once.
  sharp.cache(false);
  const source = () => sharp(input, { limitInputPixels: false, sequentialRead: true });

  const { width, height } = await source().metadata();
  console.log('Input: ' + input);
  console.log('Size:  ' + width + ' x ' + height + ' px');
  console.log('Cutting tiles. This can take several minutes for a very large image...');

  const started = Date.now();
  await source()
    .webp({ quality: 90 })
    .tile({
      size: TILE_SIZE,
      layout: 'google',
      overlap: 0,
      skipBlanks: -1,                              // write every tile, even empty ones
      background: { r: 0, g: 0, b: 0, alpha: 0 }   // padding for edge tiles
    })
    .toFile(output);

  const levels = fs.readdirSync(output)
    .filter((name) => /^\d+$/.test(name) && fs.statSync(path.join(output, name)).isDirectory())
    .map(Number);
  if (levels.length === 0) throw new Error('No tiles were written to ' + output);

  const meta = {
    width,
    height,
    tileSize: TILE_SIZE,
    maxLevel: Math.max(...levels),
    ext: 'webp'
  };
  fs.writeFileSync(path.join(output, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

  console.log('Done in ' + Math.round((Date.now() - started) / 1000) + ' s. Levels 0-' + meta.maxLevel + ' written to ' + output);
  console.log('Restart the app: it uses the tiles automatically.');
}

main().catch((error) => {
  console.error('\nTiling failed: ' + error.message);
  process.exit(1);
});
