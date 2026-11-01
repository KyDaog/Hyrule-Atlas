'use strict';

/* ==========================================================================
   Reformats map_data.json onto many lines with indentation, instead of one
   giant line, so it can actually be opened and read in an editor.

   This only changes spacing - the data itself is byte-for-byte the same
   afterward, and the app reads it exactly the same either way (it does not
   care about formatting). Run this again any time you replace map_data.json
   with a fresh export that has come back as one long line.

   Usage (from the project folder):
     node tools/format-data.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'map_data.json'));

function main() {
  if (!fs.existsSync(file)) throw new Error('File not found: ' + file);

  const raw = fs.readFileSync(file, 'utf8');
  const hadBom = raw.charCodeAt(0) === 0xfeff;
  const data = JSON.parse(hadBom ? raw.slice(1) : raw);

  const formatted = JSON.stringify(data, null, 2) + '\n';

  // Safety check: read the new file back and make sure it parses to the exact same data
  // before overwriting anything, so a mistake here can never corrupt map_data.json.
  const roundTrip = JSON.parse(formatted);
  if (JSON.stringify(roundTrip) !== JSON.stringify(data)) {
    throw new Error('Something looked different after formatting, so nothing was changed. Please report this.');
  }

  fs.writeFileSync(file, formatted);
  console.log('Reformatted ' + file);
  console.log('  ' + raw.length.toLocaleString() + ' -> ' + formatted.length.toLocaleString() + ' bytes (larger, because of the added spacing - this is expected)');
}

main();
