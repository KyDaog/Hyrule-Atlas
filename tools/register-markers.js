'use strict';

/* ==========================================================================
   Measures how map_data.json's coordinates line up with hyrule_map.png.

   Idea: fish (bass, trout, carp, porgy, salmon) and rafts can only be in water,
   while Korok Seeds and shrines are almost always on land. So the right alignment
   is the one where the fish markers land on the map's rivers and lakes and the
   land markers do not. This program finds that alignment with a search and prints
   the result together with proof numbers, so nothing has to be judged by eye.

   Usage (from the project folder):
     node tools/make-preview.js                  (once: makes hyrule_map_preview.jpg)
     node tools/register-markers.js

   Optional: node tools/register-markers.js <preview.jpg> <map_data.json>
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v === undefined ? true : v];
  })
);

const previewPath = path.resolve(args[0] || path.join(__dirname, '..', 'hyrule_map_preview.jpg'));
const dataPath = path.resolve(args[1] || path.join(__dirname, '..', 'map_data.json'));
const reportPath = path.resolve(flags.out || path.join(__dirname, '..', 'registration_check.png'));

// The full map is 36000 x 30000 px; the preview is the same picture, smaller.
const FULL_W = 36000;
const FULL_H = 30000;

// Data categories: things that can only be in water, and things that are normally on land.
const WATER_IDS = new Set([7803, 7804, 7805, 7806, 7807, 7808, 7809, 7810, 7811, 7813, 7817, 6822]);
const LAND_IDS = new Set([6836, 6816, 6815]);        // Korok Seeds, Shrines, Sheikah Towers

// The web-map scale MapGenie's tiles use at their top zoom: 256 * 2^16 pixels around the whole globe.
const EXACT_SPAN = FULL_W / ((256 * 65536) / 360);

// Starting guess: the current built-in alignment (west, span in degrees, north).
const START = { west: -1.08958, north: 1.02490, span: 0.772476 };
if (flags.lockscale) START.span = EXACT_SPAN;
if (flags.init) {
  const [west, north, span] = String(flags.init).split(',').map(Number);
  Object.assign(START, { west, north, span });
}

/* --------------------------------------------------------------------------
   Web Mercator helpers (MapGenie's projection)
   -------------------------------------------------------------------------- */
const RAD = Math.PI / 180;
const mercY = (latDeg) => Math.log(Math.tan(Math.PI / 4 + (latDeg * RAD) / 2));         // radians
const latFromMercY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;

// A model is { west, north, span [, aspect] }: the map's top-left corner and width in degrees.
// The height follows from the image's shape (the pixels are square), so there are only 3 numbers.
function makeModel(p, W, H) {
  const spanRad = p.span * RAD;
  const vSpan = spanRad * (H / W) * (p.aspect || 1);
  const yTop = mercY(p.north);
  return {
    u: (lng) => (lng - p.west) / p.span,
    v: (lat) => (yTop - mercY(lat)) / vSpan,
    south: latFromMercY(yTop - vSpan),
    east: p.west + p.span
  };
}

/* --------------------------------------------------------------------------
   Water map from the picture
   -------------------------------------------------------------------------- */
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function boxBlur(src, W, H, radius) {
  // two passes of a running box blur (horizontal, vertical) = a soft edge around the water
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  const n = radius * 2 + 1;
  for (let y = 0; y < H; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = sum / n;
      sum += src[y * W + Math.min(W - 1, x + radius + 1)] - src[y * W + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = sum / n;
      sum += tmp[Math.min(H - 1, y + radius + 1) * W + x] - tmp[Math.max(0, y - radius) * W + x];
    }
  }
  return out;
}

async function loadWater() {
  const { data, info } = await sharp(previewPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const mask = new Float32Array(W * H);
  let waterPixels = 0;
  for (let i = 0; i < W * H; i++) {
    const [h, s, v] = rgbToHsv(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    if (h > 170 && h < 260 && s > 0.12 && v > 0.15) {         // the map's rivers, lakes and sea are blue-gray; land is brown
      mask[i] = 1;
      waterPixels++;
    }
  }
  const soft = boxBlur(boxBlur(mask, W, H, 2), W, H, 2);    // ~ a 5-pixel soft edge
  return { W, H, mask, soft, waterShare: waterPixels / (W * H), rgb: data };
}

/* --------------------------------------------------------------------------
   Markers
   -------------------------------------------------------------------------- */
function loadMarkers() {
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8').replace(/^\uFEFF/, ''));
  const water = [];
  const land = [];
  for (const m of raw.locations) {
    const lng = Number(m.longitude);
    const lat = Number(m.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (WATER_IDS.has(m.category_id)) water.push([lng, lat]);
    else if (LAND_IDS.has(m.category_id)) land.push([lng, lat]);
  }
  return { water, land };
}

/* --------------------------------------------------------------------------
   Scoring: how much more of the water markers than of the land markers sit on water
   -------------------------------------------------------------------------- */
function sample(map, W, H, x, y) {
  if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  return (
    map[y0 * W + x0] * (1 - fx) * (1 - fy) + map[y0 * W + x1] * fx * (1 - fy) +
    map[y1 * W + x0] * (1 - fx) * fy + map[y1 * W + x1] * fx * fy
  );
}

// Pixel i of the preview is centred on coordinate i, so the picture's left/top edge sits at -0.5.
// (Ignoring this would shift every result by half a preview pixel, about 5 px on the full map.)
const EDGE = 0.5;

function makeScorer(img, markers) {
  return (p) => {
    const model = makeModel(p, img.W, img.H);
    let w = 0;
    for (const [lng, lat] of markers.water) w += sample(img.soft, img.W, img.H, model.u(lng) * img.W - EDGE, model.v(lat) * img.H - EDGE);
    let l = 0;
    for (const [lng, lat] of markers.land) l += sample(img.soft, img.W, img.H, model.u(lng) * img.W - EDGE, model.v(lat) * img.H - EDGE);
    return w / markers.water.length - l / markers.land.length;
  };
}

function hitRate(p, img, markers, group) {
  const model = makeModel(p, img.W, img.H);
  let inside = 0;
  for (const [lng, lat] of markers[group]) {
    const x = Math.round(model.u(lng) * img.W - EDGE);
    const y = Math.round(model.v(lat) * img.H - EDGE);
    if (x >= 0 && y >= 0 && x < img.W && y < img.H && img.mask[y * img.W + x] > 0) inside++;
  }
  return inside / markers[group].length;
}

/* --------------------------------------------------------------------------
   Search: coarse grid around the starting guess, then repeated finer steps
   -------------------------------------------------------------------------- */
function search(score, img) {
  const degPerPx = START.span / img.W;                       // one preview pixel, in degrees of longitude
  const range = Number(flags.range || 40);                    // how far to look, in preview pixels
  const step = 1.5 * degPerPx;
  const spanSteps = Number(flags.spanrange || 1.5);          // percent
  let best = { ...START };
  let bestScore = -Infinity;

  const n = Math.round((range * degPerPx) / step);
  for (let a = -n; a <= n; a++) {
    for (let b = -n; b <= n; b++) {
      const cMax = flags.lockscale ? 0 : Math.round(spanSteps / 0.1);
      for (let c = -cMax; c <= cMax; c++) {
        const p = {
          west: START.west + a * step,
          north: START.north + b * step,
          span: START.span * (1 + (c * 0.1) / 100)
        };
        const s = score(p);
        if (s > bestScore) { bestScore = s; best = p; }
      }
    }
  }

  // Refine: shrink the step and look at the neighbours until it stops improving.
  let fine = step;
  const dims = ['west', 'north', 'span', 'aspect'];
  best.aspect = 1;
  for (let round = 0; round < 40; round++) {
    let improved = false;
    for (const key of dims) {
      if (flags.lockscale && key === 'span') continue;
      for (const sign of [-1, 1]) {
        const p = { ...best };
        if (key === 'span') p.span = best.span * (1 + (sign * fine) / 20);
        else if (key === 'aspect') p.aspect = best.aspect * (1 + (sign * fine) / 20);
        else p[key] = best[key] + sign * fine;
        if (!flags.freeaspect && key === 'aspect') continue;
        const s = score(p);
        if (s > bestScore + 1e-9) { bestScore = s; best = p; improved = true; }
      }
    }
    if (!improved) fine /= 2;
    if (fine < degPerPx * 0.02) break;
  }
  return { best, bestScore };
}

/* --------------------------------------------------------------------------
   Report
   -------------------------------------------------------------------------- */
async function writeCheckImage(img, markers, p) {
  const model = makeModel(p, img.W, img.H);
  const scale = 0.5;
  const outW = Math.round(img.W * scale);
  const outH = Math.round(img.H * scale);
  const circles = [];
  for (const [lng, lat] of markers.water) {
    const x = model.u(lng) * img.W;
    const y = model.v(lat) * img.H;
    const ix = Math.round(x - EDGE);
    const iy = Math.round(y - EDGE);
    const on = ix >= 0 && iy >= 0 && ix < img.W && iy < img.H && img.mask[iy * img.W + ix] > 0;
    circles.push('<circle cx="' + (x * scale).toFixed(1) + '" cy="' + (y * scale).toFixed(1) + '" r="2.4" fill="' + (on ? '#2ee6a6' : '#ff3b3b') + '"/>');
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + outW + '" height="' + outH + '">' + circles.join('') + '</svg>';
  await sharp(previewPath).resize(outW, outH).composite([{ input: Buffer.from(svg) }]).png().toFile(reportPath);
}

function fmt(n, d = 5) { return n.toFixed(d); }

async function main() {
  if (!fs.existsSync(previewPath)) throw new Error('Preview image not found: ' + previewPath + '\nRun "node tools/make-preview.js" first.');
  if (!fs.existsSync(dataPath)) throw new Error('Data file not found: ' + dataPath);

  console.log('Preview: ' + previewPath);
  const img = await loadWater();
  console.log('  ' + img.W + ' x ' + img.H + ' px, ' + (img.waterShare * 100).toFixed(1) + '% of it looks like water');
  const markers = loadMarkers();
  console.log('Markers: ' + markers.water.length + ' that must be in water (fish, rafts), ' + markers.land.length + ' land markers');
  if (img.waterShare < 0.02 || img.waterShare > 0.5) console.log('  WARNING: the water share looks odd; the color rules may not fit this picture.');

  const score = makeScorer(img, markers);
  const before = { ...START, aspect: 1 };
  console.log('\nSearching (this takes a little while)...');
  const { best, bestScore } = search(score, img);

  const m0 = makeModel(before, img.W, img.H);
  const m1 = makeModel(best, img.W, img.H);
  const pxPerPreviewPx = FULL_W / img.W;
  const degToFullPx = FULL_W / best.span;

  console.log('\n=== Result ===');
  console.log('                           by-eye start      measured');
  console.log('west (longitude)        ' + fmt(before.west).padStart(14) + fmt(best.west).padStart(14));
  console.log('east (longitude)        ' + fmt(m0.east).padStart(14) + fmt(m1.east).padStart(14));
  console.log('north (latitude)        ' + fmt(before.north).padStart(14) + fmt(best.north).padStart(14));
  console.log('south (latitude)        ' + fmt(m0.south).padStart(14) + fmt(m1.south).padStart(14));
  console.log('width in degrees        ' + fmt(before.span).padStart(14) + fmt(best.span).padStart(14));
  console.log('');
  console.log('Fish/raft markers on water:  ' + (hitRate(before, img, markers, 'water') * 100).toFixed(1) + '%  ->  ' + (hitRate(best, img, markers, 'water') * 100).toFixed(1) + '%');
  console.log('Land markers on water:       ' + (hitRate(before, img, markers, 'land') * 100).toFixed(1) + '%  ->  ' + (hitRate(best, img, markers, 'land') * 100).toFixed(1) + '%');
  console.log('Score (higher is better):    ' + score(before).toFixed(4) + '  ->  ' + bestScore.toFixed(4));

  const shiftX = (best.west - before.west) * degToFullPx;
  const spanChange = (best.span / before.span - 1) * 100;
  console.log('\nMoved by about ' + Math.abs(shiftX).toFixed(0) + ' px sideways and ' + Math.abs((best.north - before.north) * degToFullPx).toFixed(0) +
    ' px vertically (full-size map pixels); size changed ' + spanChange.toFixed(2) + '%.');
  console.log('Scale: ' + (FULL_W / best.span).toFixed(1) + ' map px per degree (' + (flags.lockscale ? 'fixed at the exact web-map value' : 'measured; the exact web-map value is 46603.4') + ').');

  // How sharp is the answer? Score when shifted by a few full-size pixels.
  console.log('\nHow sharp is the peak (score drop when shifted):');
  for (const px of [25, 50, 100]) {
    const d = px / degToFullPx;
    const worst = Math.min(
      score({ ...best, west: best.west + d }), score({ ...best, west: best.west - d }),
      score({ ...best, north: best.north + d }), score({ ...best, north: best.north - d })
    );
    console.log('  ' + String(px).padStart(3) + ' px off:  ' + (bestScore - worst).toFixed(4));
  }

  if (flags.freeaspect) console.log('\nVertical stretch found: ' + ((best.aspect - 1) * 100).toFixed(3) + '% (0 means square pixels, as expected).');

  await writeCheckImage(img, markers, best);
  console.log('\nCheck picture written: ' + reportPath + ' (green = fish marker on water, red = not)');

  console.log('\nPaste-ready values for app.js:');
  console.log('  geo: { west: ' + fmt(best.west) + ', south: ' + fmt(m1.south) + ', east: ' + fmt(m1.east) + ', north: ' + fmt(best.north) + ' },');
}

main().catch((error) => {
  console.error('\nFailed: ' + error.message);
  process.exit(1);
});
