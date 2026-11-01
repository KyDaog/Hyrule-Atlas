'use strict';

/* ==========================================================================
   Strips comments and extra whitespace from the app's own JavaScript files
   before they are packaged, so a curious person opening the installer sees
   compact code instead of the fully-commented source.

   This is NOT real protection - see the note the assistant gave about that -
   it just removes the easy, readable version. The code still runs exactly
   the same; only comments and formatting are removed, never logic. Line
   breaks are kept (nothing is joined onto one line), which is what makes
   this safe to do automatically with no hand-checking: JavaScript can behave
   differently if two lines get glued together with nothing between them, so
   this tool never does that.

   Usage (this runs automatically as part of "npm run pack" / "dist"; you do
   not need to run it by hand):
     node tools/minify.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'release');

// The app's own code. Third-party code (Leaflet) and data files are left alone.
const FILES = ['app.js', 'main.js', 'preload.js', 'categories.js', 'media.js'];

/* --------------------------------------------------------------------------
   Tokenizer: walks the file one character at a time, always knowing whether
   it is inside a string, a template literal, a regular expression, or a
   comment, so it never mistakes the text inside one of those for real code.
   -------------------------------------------------------------------------- */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let lastSignificant = '';   // last character emitted that helps tell /  apart from division

  const isIdentChar = (c) => /[A-Za-z0-9_$]/.test(c);

  function copyString(quote) {
    let s = src[i++];
    while (i < n) {
      const c = src[i];
      if (c === '\\') { s += c + (src[i + 1] || ''); i += 2; continue; }
      s += c; i++;
      if (c === quote) break;
    }
    return s;
  }

  // Template literals can contain ${ ... } with ordinary code inside, which can itself
  // contain another template literal, so this tracks how many `${` are still open.
  function copyTemplate() {
    let s = src[i++]; // opening `
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { s += c + (src[i + 1] || ''); i += 2; continue; }
      if (c === '`' && depth === 0) { s += c; i++; break; }
      if (c === '$' && src[i + 1] === '{') { s += '${'; i += 2; depth++; continue; }
      if (depth > 0 && c === '{') { depth++; s += c; i++; continue; }
      if (depth > 0 && c === '}') { depth--; s += c; i++; continue; }
      s += c; i++;
    }
    return s;
  }

  function copyRegex() {
    let s = src[i++]; // opening /
    let inClass = false;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { s += c + (src[i + 1] || ''); i += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { s += c; i++; break; }
      else if (c === '\n') break;               // not actually a regex; give up cleanly
      s += c; i++;
    }
    while (i < n && /[a-z]/i.test(src[i])) { s += src[i]; i++; }   // flags (g, i, u, ...)
    return s;
  }

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (c === '"' || c === "'") { const s = copyString(c); out += s; lastSignificant = c; continue; }
    if (c === '`') { const s = copyTemplate(); out += s; lastSignificant = '`'; continue; }

    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i++;              // drop a line comment; keep the newline itself
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '/' && !isIdentChar(lastSignificant) && !')]'.includes(lastSignificant)) {
      const s = copyRegex();
      out += s;
      lastSignificant = '/';
      continue;
    }

    out += c;
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }
  return out;
}

// Trims trailing whitespace and drops blank lines (comments often leave empty lines behind).
function tidyLines(src) {
  return src
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line, idx, all) => line.trim() !== '' || (idx > 0 && all[idx - 1].trim() === ''))
    .join('\n')
    .replace(/\n{2,}/g, '\n');
}

function minify(src) {
  return tidyLines(stripComments(src)).trim() + '\n';
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let before = 0;
  let after = 0;

  for (const name of FILES) {
    const srcPath = path.join(ROOT, name);
    if (!fs.existsSync(srcPath)) { console.log('  (skipping ' + name + ', not found)'); continue; }
    const original = fs.readFileSync(srcPath, 'utf8');
    const compact = minify(original);

    // Safety check: the compacted file must still be valid JavaScript. This only checks
    // that it PARSES correctly - it never runs the file - so it is safe to do here even
    // though app.js expects a browser window and main.js expects Electron, neither of
    // which exist in this plain Node tool. If not, ship the original untouched rather
    // than a broken app.
    try {
      new vm.Script(compact, { filename: name });
    } catch (error) {
      console.warn('  WARNING: could not safely minify ' + name + ' (' + error.message + ') - using the original instead.');
      fs.writeFileSync(path.join(OUT_DIR, name), original);
      before += original.length; after += original.length;
      continue;
    }

    fs.writeFileSync(path.join(OUT_DIR, name), compact);
    before += original.length; after += compact.length;
    console.log('  ' + name.padEnd(14) + original.length.toString().padStart(7) + ' -> ' + compact.length.toString().padStart(7) + ' bytes');
  }

  console.log('Total: ' + before + ' -> ' + after + ' bytes (' + (100 - (100 * after) / before).toFixed(0) + '% smaller)');
}

main();
