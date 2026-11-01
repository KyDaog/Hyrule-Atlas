'use strict';

/* ==========================================================================
   Makes a small copy of hyrule_map.png (3600 x 3000, about 1/10 size) so the
   map's exact position can be measured. Run it from the project folder:

     node tools/make-preview.js

   Output: hyrule_map_preview.jpg (a few MB)
   ========================================================================== */

const path = require('path');
const sharp = require('sharp');

const input = path.resolve(process.argv[2] || path.join(__dirname, '..', 'hyrule_map.png'));
const output = path.resolve(process.argv[3] || path.join(__dirname, '..', 'hyrule_map_preview.jpg'));

async function main() {
  sharp.cache(false);
  const source = () => sharp(input, { limitInputPixels: false, sequentialRead: true });

  const { width, height } = await source().metadata();
  console.log('Input: ' + input + '  (' + width + ' x ' + height + ' px)');

  const outW = Math.round(width / 10);
  const outH = Math.round(height / 10);
  await source()
    .resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' })
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toFile(output);

  console.log('Wrote ' + output + '  (' + outW + ' x ' + outH + ' px)');
}

main().catch((error) => {
  console.error('Failed: ' + error.message);
  process.exit(1);
});
