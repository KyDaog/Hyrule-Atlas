'use strict';

/* ==========================================================================
   Removes every MapGenie / YouTube web link from map_data.json.

   This does not change what the app shows or does - popups already display
   these links as plain text, never as a clickable address (app.js's
   cleanDescription does that at read time). This tool bakes the same
   cleanup into the file itself, so the links are gone even if someone opens
   map_data.json directly, and drops a few other MapGenie-only fields (like
   a font-server address for their own website's map) that this app never
   reads. Nothing the app uses is touched:
     - marker names, descriptions (links removed, the rest of the text kept)
     - positions, categories, regions
     - the local screenshot filename a marker points to (media/<file>.png),
       which is a plain file name, not a link, and still gets kept

   Run this once (or again after replacing map_data.json with a fresh export):
     node tools/purge-links.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'map_data.json'));

// [Link text](https://mapgenie.io/...) -> Link text
const MARKDOWN_LINK = /\[([^\]]+)\]\((?:https?:)?\/\/[^)]*\)/g;
const LOOKS_LIKE_URL = /^https?:\/\//i;

function purgeDescription(text, stats) {
  if (typeof text !== 'string' || !text.includes('](')) return text;
  return text.replace(MARKDOWN_LINK, (whole, label) => { stats.links++; return label; });
}

// Keeps only what mediaFor() in app.js actually looks at: local image file names.
// Drops the MapGenie / YouTube web address and everything else in each entry.
function purgeMedia(media, stats) {
  if (!Array.isArray(media)) return media;
  const kept = [];
  for (const item of media) {
    if (item && item.type === 'image' && typeof item.file_name === 'string') {
      kept.push({ type: 'image', file_name: item.file_name });
    }
    stats.mediaBefore++;
  }
  stats.mediaAfter += kept.length;
  return kept.length ? kept : undefined;
}

function main() {
  if (!fs.existsSync(file)) throw new Error('File not found: ' + file);
  const raw = fs.readFileSync(file, 'utf8');
  const hadBom = raw.charCodeAt(0) === 0xfeff;
  const data = JSON.parse(hadBom ? raw.slice(1) : raw);

  const stats = { links: 0, mediaBefore: 0, mediaAfter: 0, ignIds: 0 };

  for (const location of data.locations || []) {
    location.description = purgeDescription(location.description, stats);
    if (location.media !== undefined) {
      const cleaned = purgeMedia(location.media, stats);
      if (cleaned === undefined) delete location.media; else location.media = cleaned;
    }
    if (typeof location.ign_page_id === 'string' && LOOKS_LIKE_URL.test(location.ign_page_id)) {
      location.ign_page_id = null;    // one entry in the MapGenie export has a URL here instead of an id
      stats.ignIds++;
    }
  }

  // A MapGenie-only rendering config for their own website's map (fonts, region borders, etc.).
  // app.js never reads this key at all, and it is the one place left holding a web address
  // (a font-server URL), so it goes with the rest of the links.
  let removedStyles = false;
  if (data.styles !== undefined) { delete data.styles; removedStyles = true; }

  const formatted = JSON.stringify(data, null, 2) + '\n';

  // Safety check: confirm no web link of any kind survived, and that the file is still
  // valid, complete JSON, before anything is written to disk.
  if (/https?:\/\//i.test(formatted)) {
    throw new Error('A web address is still present after cleanup, so nothing was changed. Please report this.');
  }
  JSON.parse(formatted);

  fs.writeFileSync(file, formatted);
  console.log('Cleaned ' + file);
  console.log('  ' + stats.links + ' link(s) removed from descriptions (the visible text was kept)');
  console.log('  ' + stats.mediaBefore + ' -> ' + stats.mediaAfter + ' screenshot/video entries (only local picture references are kept)');
  if (stats.ignIds) console.log('  ' + stats.ignIds + ' stray link cleared from an id field');
  if (removedStyles) console.log('  removed the unused MapGenie website styling section (this app never reads it)');
  console.log('  ' + raw.length.toLocaleString() + ' -> ' + formatted.length.toLocaleString() + ' bytes');
}

main();
