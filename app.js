'use strict';

/* ==========================================================================
   Hyrule Atlas - renderer process
   Everything here runs against local files only: the map tiles (or
   ./hyrule_map.png), the bundled Leaflet in node_modules, the pin images in
   this folder, and map_data.json (read by the main process and delivered
   through the preload bridge).
   ========================================================================== */

/* --------------------------------------------------------------------------
   Configuration
   -------------------------------------------------------------------------- */
const CONFIG = {
  mapImage: './hyrule_map.png',

  // How positions in map_data.json relate to the image:
  //   'mercator'     longitude / latitude through the web-map (Web Mercator) projection MapGenie uses,
  //                  mapped onto the image using `geo` below. This is what your export needs.
  //   'geo'          the same, but latitude is treated as a straight line (about 1 px different)
  //   'pixel'        x,y are image pixels, origin at the TOP-left (y grows downward)
  //   'pixel-bottom' x,y are image pixels, origin at the BOTTOM-left (y grows upward)
  //   'world'        x,y are game-world units scaled with `world` below
  coordinateMode: 'mercator',

  // The rectangle of the data's coordinate space that the image covers (west/east = longitude,
  // north/south = latitude). Measured, not judged by eye: the scale is MapGenie's exact web-map
  // scale (46603.4 map px per degree) and the position was found by fitting 747 fish and raft
  // markers onto the map's water (tools/register-markers.js), stable to about +-5 px of 36000.
  geo: { west: -1.08958, south: 0.38122, east: -0.31710, north: 1.02490 },

  world: { minX: -6000, maxX: 6000, minY: -5000, maxY: 5000 },

  // Pin appearance. Pins shrink when zoomed out so thousands stay readable.
  pinZoomRange: [-1, -5],        // map zoom levels between which the pin size changes (reversed on purpose)
  pinSizes: [30, 40],            // pin height in px at those two zoom levels: 30 zoomed in, 40 zoomed out
  glyphDir: './glyphs/',         // white icons drawn on top of the colored pins
  spriteDir: './sprites/',       // full pins and dots cut from markers.png
  iconDir: './icons/',           // white glyphs for the sidebar legend (icons/i<n>.png, same numbers as the sprites)
  dotScale: 0.62,                // size of round "dot" icons relative to the pin height

  // Text labels (categories with a "text" setting in categories.js, e.g. Region).
  // The catalog gives [zoom, font size] pairs in this map's own zoom units (about -4.75 is the whole
  // map in view, 0 is one image pixel per screen pixel) plus an optional fade-out range.
  // textZoomOffset is added to every zoom value in the catalog, so one number shifts all the timings.
  textZoomOffset: 0,
  textMinSize: 8,                // labels smaller than this are not drawn
  textColor: '#EACB78',          // Zelda gold; a category can override it with text: { color }
  textHalo: '#0A0201',           // dark outline that keeps the text readable on the map
  textFont: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  pinImages: {},                 // optional overrides: { '6816': './pin-205098.png' }
  autoPinByColor: true,          // categories with a "#rrggbb" color use ./pin-rrggbb.png if present

  maxZoom: 3,
  storagePrefix: 'hyrule-atlas.v1.'
};

const CATALOG = window.HYRULE_CATALOG || { groups: [], categories: {} };

// Screenshots for popups (media.js). Keys are a marker's title (any capitalization) or "id:<location id>".
const MEDIA_INDEX = new Map(
  Object.entries(window.HYRULE_MEDIA || {}).map(([key, files]) => [key.trim().toLowerCase(), files])
);

const STORAGE_KEYS = {
  progress: CONFIG.storagePrefix + 'progress',
  prefs: CONFIG.storagePrefix + 'prefs3',          // bumped when the categories were reorganized (resets layer choices once)
  geo: CONFIG.storagePrefix + 'alignment2'         // dev-only alignment tool; "2": older by-eye alignments are ignored
};

/* Look for categories that have no catalog entry (built-in colored pins). */
const KNOWN_STYLES = [
  ['shrine', { color: '#4cc9f0', icon: '\u25C8' }],
  ['tower', { color: '#f4b942', icon: '\u25B2' }],
  ['korok', { color: '#7bd88f', icon: '\u2663' }],
  ['stable', { color: '#ff9f5a', icon: '\u2302' }],
  ['village', { color: '#ff9f5a', icon: '\u2302' }],
  ['dungeon', { color: '#ff7a90', icon: '\u25A0' }],
  ['memory', { color: '#e879f9', icon: '\u2605' }],
  ['quest', { color: '#b18cff', icon: '!' }],
  ['chest', { color: '#d9b86a', icon: '\u25C6' }]
];
const FALLBACK_COLORS = ['#4cc9f0', '#f4b942', '#7bd88f', '#ff7a90', '#b18cff', '#ff9f5a', '#5eead4', '#e879f9'];
const DONE_GLYPH = '\u2713';

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
const state = {
  map: null,
  pins: null,                  // the canvas layer that draws every marker
  popup: null,                 // the popup that is currently open
  bounds: null,
  size: { width: 0, height: 0 },
  tiles: null,                 // tile pyramid metadata, or null when the single image is used
  geo: { ...CONFIG.geo },      // active image rectangle (defaults, or the saved alignment)
  geoBackup: null,
  calibrating: false,
  entries: [],                 // every marker record
  categories: new Map(),       // id -> category record
  groups: new Map(),           // id -> sidebar group record
  regionNames: new Map(),      // region id -> title
  completed: new Set(),        // ids of completed markers
  hidden: new Set(),           // ids of hidden categories
  hasSavedVisibility: false,
  dev: false,                  // true only for `npm run dev`
  looks: new Map(),            // per-data-category icons that differ from their category's icon
  hideCompleted: false,
  showDlc: false,              // include DLC / Master Mode markers?
  sidebarCollapsed: false,
  view: null,                  // last map view { lat, lng, zoom }
  query: ''
};

/* --------------------------------------------------------------------------
   DOM references
   -------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const dom = {
  sidebar: $('sidebar'),
  toggle: $('sidebar-toggle'),
  search: $('search-input'),
  searchClear: $('search-clear'),
  resultCount: $('result-count'),
  progressMeter: $('progress-meter'),
  progressFill: $('progress-fill'),
  progressText: $('progress-text'),
  categoryList: $('category-list'),
  layersAll: $('layers-all'),
  layersNone: $('layers-none'),
  hideCompleted: $('hide-completed'),
  showDlc: $('show-dlc'),
  layersCore: $('layers-core'),
  reset: $('reset-progress'),
  dataNote: $('data-note'),
  readout: $('cursor-readout'),
  overlay: $('overlay'),
  overlayTitle: $('overlay-title'),
  overlayMessage: $('overlay-message'),
  appVersion: $('app-version'),
  calibrateBtn: $('calibrate-btn'),
  calibrateHint: $('calibrate-hint'),
  calib: $('calibration'),
  calibValues: $('calib-values'),
  calibSave: $('calib-save'),
  calibReset: $('calib-reset'),
  calibCancel: $('calib-cancel'),
  aboutBtn: $('about-btn'),
  about: $('about-dialog'),
  aboutClose: $('about-close'),
  lightbox: $('lightbox'),
  lightboxImg: $('lightbox-img'),
  lightboxStage: $('lightbox-stage'),
  lightboxCaption: $('lightbox-caption'),
  lightboxClose: $('lightbox-close'),
  lightboxPrev: $('lightbox-prev'),
  lightboxNext: $('lightbox-next')
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* --------------------------------------------------------------------------
   Persistence (localStorage lives in Electron's userData folder)
   -------------------------------------------------------------------------- */
const store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.warn('Could not read saved data for', key, error);
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('Could not save data for', key, error);
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Could not remove saved data for', key, error);
    }
  }
};

function validGeo(g) {
  return !!g && [g.west, g.south, g.east, g.north].every(Number.isFinite) && g.east > g.west && g.north > g.south;
}

function loadSavedState() {
  const progress = store.read(STORAGE_KEYS.progress, []);
  if (Array.isArray(progress)) {
    progress.forEach((id) => state.completed.add(String(id)));
  }

  const geo = store.read(STORAGE_KEYS.geo, null);
  if (validGeo(geo)) state.geo = { west: geo.west, south: geo.south, east: geo.east, north: geo.north };

  const prefs = store.read(STORAGE_KEYS.prefs, {});
  if (prefs && typeof prefs === 'object') {
    // Saved layer choices only apply to the catalog layout they were made with.
    const sameCatalog = prefs.catalogVersion === (CATALOG.version || '');
    if (Array.isArray(prefs.hiddenCategories) && sameCatalog) {
      state.hasSavedVisibility = true;
      prefs.hiddenCategories.forEach((id) => state.hidden.add(String(id)));
    }
    state.hideCompleted = prefs.hideCompleted === true;
    state.showDlc = prefs.showDlc === true;
    state.sidebarCollapsed = prefs.sidebarCollapsed === true;
    if (prefs.view && Number.isFinite(prefs.view.lat) && Number.isFinite(prefs.view.lng) && Number.isFinite(prefs.view.zoom)) {
      state.view = prefs.view;
    }
  }
}

function saveProgress() {
  store.write(STORAGE_KEYS.progress, Array.from(state.completed));
}

function savePrefs() {
  store.write(STORAGE_KEYS.prefs, {
    catalogVersion: CATALOG.version || '',
    hiddenCategories: Array.from(state.hidden),
    hideCompleted: state.hideCompleted,
    showDlc: state.showDlc,
    sidebarCollapsed: state.sidebarCollapsed,
    view: state.view
  });
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* --------------------------------------------------------------------------
   Loading local assets
   -------------------------------------------------------------------------- */
function loadImageSize(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('The map image has no readable size: ' + src));
      } else {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.onerror = () => reject(new Error(
      'Could not load the map image ' + src + '. Make sure hyrule_map.png sits next to main.js. ' +
      'If it is very large (hundreds of MB), the app cannot decode it as one picture: run "npm run tiles" once to cut it into tiles, then restart.'
    ));
    img.src = src;
  });
}

async function loadMapData() {
  if (!window.hyruleAPI || typeof window.hyruleAPI.loadMapData !== 'function') {
    throw new Error('The preload bridge is missing. Make sure preload.js sits next to main.js.');
  }
  const result = await window.hyruleAPI.loadMapData();
  if (!result || !result.ok) {
    throw new Error((result && result.error) || 'map_data.json could not be loaded.');
  }
  return result.data;
}

// The version number from package.json (shown at the bottom of the sidebar).
async function loadAppVersion() {
  try {
    return (window.hyruleAPI && typeof window.hyruleAPI.getVersion === 'function' && await window.hyruleAPI.getVersion()) || '';
  } catch (error) {
    return '';
  }
}

// Developer runs (npm run dev) get the alignment tool; shipped builds never do.
async function loadDevFlag() {
  try {
    return !!(window.hyruleAPI && typeof window.hyruleAPI.isDev === 'function' && await window.hyruleAPI.isDev());
  } catch (error) {
    return false;
  }
}

// Returns { meta } on success, or { meta: null, reason } explaining why the tiles are not used.
async function loadTilesMeta() {
  if (!window.hyruleAPI || typeof window.hyruleAPI.loadTilesMeta !== 'function') {
    return { meta: null, reason: 'preload.js is out of date (no loadTilesMeta). Replace it with the latest version and fully restart the app.' };
  }
  try {
    const result = await window.hyruleAPI.loadTilesMeta();
    if (result && result.ok) return { meta: result.data };
    return { meta: null, reason: (result && result.error) || 'no tiles/meta.json found.' };
  } catch (error) {
    console.warn('Could not read tiles/meta.json', error);
    return { meta: null, reason: 'the main process does not know the tile request. Replace main.js with the latest version and fully restart the app.' };
  }
}

// Loaded images are kept so the canvas layer can draw them synchronously.
const imageCache = new Map();
const probeCache = new Map();
function probeImage(src) {
  if (!probeCache.has(src)) {
    probeCache.set(src, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        imageCache.set(src, img);
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = src;
    }));
  }
  return probeCache.get(src);
}

/* --------------------------------------------------------------------------
   Reading map_data.json
   Accepted shapes (extra fields are ignored):
     MapGenie export  { "locations": [ { category_id, title, description, latitude, longitude, region_id } ], "regions": [ ... ] }
     [ {marker}, ... ]
     { "categories": [ ... ], "markers": [ {marker}, ... ] }
     { "Shrines": [ {marker}, ... ], "Towers": [ {marker}, ... ] }
   -------------------------------------------------------------------------- */
function pick(obj, keys) {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function slug(value) {
  const text = String(value).trim().toLowerCase();
  return text.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'other';
}

function extractRaw(raw) {
  const categoryDefs = [];
  const markers = [];

  if (Array.isArray(raw)) {
    return { categoryDefs, markers: raw };
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('map_data.json must contain a list of markers or an object that holds them.');
  }

  const categoryKeys = ['categories', 'groups', 'types'];
  const markerKeys = ['markers', 'locations', 'points', 'items'];

  const catSource = pick(raw, categoryKeys);
  if (Array.isArray(catSource)) {
    categoryDefs.push(...catSource);
  } else if (catSource && typeof catSource === 'object') {
    for (const [id, def] of Object.entries(catSource)) {
      categoryDefs.push(def && typeof def === 'object' ? { id, ...def } : { id, name: String(def) });
    }
  }

  for (const def of categoryDefs) {
    if (def && typeof def === 'object') {
      const nested = pick(def, markerKeys);
      if (Array.isArray(nested)) {
        const catId = pick(def, ['id', 'key', 'name', 'label', 'title']);
        nested.forEach((m) => markers.push(m && typeof m === 'object' ? { category: catId, ...m } : m));
      }
    }
  }

  const list = pick(raw, markerKeys);
  if (Array.isArray(list)) {
    markers.push(...list);
  } else if (markers.length === 0) {
    for (const [key, value] of Object.entries(raw)) {
      if (categoryKeys.includes(key) || !Array.isArray(value)) continue;
      value.forEach((m) => markers.push(m && typeof m === 'object' ? { category: key, ...m } : m));
    }
  }

  if (markers.length === 0) {
    throw new Error('map_data.json does not contain any markers.');
  }
  return { categoryDefs, markers };
}

function readCoords(m) {
  let x;
  let y;
  const pair = pick(m, ['coords', 'coordinates', 'position', 'pos']);
  if (Array.isArray(pair) && pair.length >= 2) {
    x = pair[0];
    y = pair[1];
  } else if (pair && typeof pair === 'object') {
    x = pick(pair, ['x', 'lng', 'lon', 'long', 'longitude']);
    y = pick(pair, ['y', 'lat', 'latitude', 'z']);
  }
  if (x === undefined) x = pick(m, ['x', 'lng', 'lon', 'long', 'longitude']);
  if (y === undefined) y = pick(m, ['y', 'lat', 'latitude', 'z']);

  x = Number(x);   // MapGenie stores coordinates as strings
  y = Number(y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

// Web Mercator: how far north of the equator a latitude sits on the flat map (radians)
const mercY = (latDeg) => Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360));
const latFromMercY = (y) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

function toLatLng(point) {
  const { width, height } = state.size;
  switch (CONFIG.coordinateMode) {
    case 'mercator': {
      const g = state.geo;
      const px = ((point.x - g.west) / (g.east - g.west)) * width;
      const yNorth = mercY(g.north);
      const ySouth = mercY(g.south);
      const pyUp = ((mercY(point.y) - ySouth) / (yNorth - ySouth)) * height;
      return [pyUp, px];
    }
    case 'geo': {
      const g = state.geo;
      const px = ((point.x - g.west) / (g.east - g.west)) * width;
      const pyUp = ((point.y - g.south) / (g.north - g.south)) * height;
      return [pyUp, px];
    }
    case 'pixel-bottom':
      return [point.y, point.x];
    case 'world': {
      const w = CONFIG.world;
      const px = ((point.x - w.minX) / (w.maxX - w.minX)) * width;
      const pyFromTop = ((point.y - w.minY) / (w.maxY - w.minY)) * height;
      return [height - pyFromTop, px];
    }
    case 'pixel':
    default:
      return [height - point.y, point.x];
  }
}

// Inverse of toLatLng for the readout (geo mode only).
function toGeo(latlng) {
  const { width, height } = state.size;
  const g = state.geo;
  const lng = g.west + (latlng.lng / width) * (g.east - g.west);
  if (CONFIG.coordinateMode === 'mercator') {
    const ySouth = mercY(g.south);
    return { lng, lat: latFromMercY(ySouth + (latlng.lat / height) * (mercY(g.north) - ySouth)) };
  }
  return { lng, lat: g.south + (latlng.lat / height) * (g.north - g.south) };
}

// MapGenie descriptions are Markdown with links to their website; keep the text only.
function cleanDescription(text) {
  return String(text)
    .replace(/\r/g, '')
    .replace(/\[([^\]]+)\]\((?:https?:)?\/\/[^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* --------------------------------------------------------------------------
   Categories and sidebar groups
   -------------------------------------------------------------------------- */
const IMAGE_FILE = /\.(png|webp|gif|jpe?g|svg)$/i;

// Only local files inside the app folder are allowed as pin images.
function resolvePinImage(id, icon) {
  const candidate = CONFIG.pinImages[id] || (typeof icon === 'string' ? icon : '');
  if (!IMAGE_FILE.test(candidate)) return null;
  const path = candidate.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/') || path.includes('..')) return null;
  return './' + path;
}

// Local screenshot files for a marker: the ones listed in media.js, then any image the data file
// names (looked up in the media/ folder). Files that do not exist are simply not shown.
function mediaFor(marker, title, explicitId) {
  const found = [];
  const add = (file) => {
    const path = resolvePinImage('', String(file));      // same safety rules: local image files only
    if (path && !found.includes(path)) found.push(path);
  };

  const manual = MEDIA_INDEX.get(title.trim().toLowerCase()) ||
    (explicitId !== undefined ? MEDIA_INDEX.get('id:' + explicitId) : undefined);
  if (Array.isArray(manual)) manual.forEach(add);

  if (Array.isArray(marker.media)) {
    for (const item of marker.media) {
      if (item && item.type === 'image' && typeof item.file_name === 'string' && /^[\w.-]+$/.test(item.file_name)) {
        add('media/' + item.file_name);
      }
    }
  }
  return found.length ? found : null;
}

function defaultStyleFor(id, ordinal) {
  for (const [needle, style] of KNOWN_STYLES) {
    if (id.includes(needle)) return style;
  }
  return { color: FALLBACK_COLORS[ordinal % FALLBACK_COLORS.length], icon: '\u25CF' };
}

function newGroup(fields) {
  return { categories: [], total: 0, done: 0, headEl: null, countEl: null, ...fields };
}

function initGroups() {
  for (const g of CATALOG.groups) {
    state.groups.set(g.id, newGroup({
      id: g.id,
      name: g.name,
      pin: g.icon !== undefined ? CONFIG.spriteDir + 's' + g.icon + '.png' : resolvePinImage('', g.pin),
      color: g.color || null,
      flat: g.flat === true,                          // a single toggle row instead of a list
      defaultVisible: g.defaultVisible !== false,
      open: g.open === true
    }));
  }
}

function ensureGroup(groupId) {
  const id = groupId || (CATALOG.groups.length ? 'other' : 'all');
  if (!state.groups.has(id)) {
    state.groups.set(id, newGroup({
      id,
      name: id === 'other' ? 'Other' : 'All layers',
      pin: null,
      color: null,
      defaultVisible: true,
      open: true
    }));
  }
  return state.groups.get(id);
}

function registerCategory(def) {
  let id;
  let label;
  let color;
  let icon;

  if (def && typeof def === 'object') {
    const rawId = pick(def, ['id', 'key', 'name', 'label', 'title']);
    if (rawId === undefined) return null;
    id = slug(rawId);
    label = String(pick(def, ['name', 'label', 'title', 'id', 'key']));
    color = typeof def.color === 'string' ? def.color : undefined;
    icon = pick(def, ['icon', 'symbol', 'glyph']);
  } else if (def !== undefined && def !== null && String(def).trim() !== '') {
    id = slug(def);
    label = String(def).trim();
  } else {
    return null;
  }

  if (state.categories.has(id)) return state.categories.get(id);

  if (/^\d+$/.test(label)) label = 'Category ' + id;

  const group = ensureGroup(null);
  const fallback = defaultStyleFor(id, state.categories.size);
  const image =
    resolvePinImage(id, icon) ||
    (group.pin ? group.pin : null);

  const category = {
    id,
    label,
    groupId: group.id,
    color: color || group.color || fallback.color,
    dataColor: color || '',
    image,
    fallbackImage: group.pin || null,
    shape: 'pin',
    glyph: null,
    icon: icon !== undefined && !IMAGE_FILE.test(String(icon)) ? String(icon).slice(0, 2) : fallback.icon,
    total: 0,
    done: 0,
    countEl: null,
    itemEl: null
  };
  state.categories.set(id, category);
  group.categories.push(category);
  return category;
}

// A category from the catalog (categories.js). Several data categories can feed one of these.
function registerCatalogCategory(key) {
  if (state.categories.has(key)) return state.categories.get(key);
  const def = CATALOG.categories[key];
  if (!def) return null;

  const group = ensureGroup(def.group);
  let image = null;
  let glyph = null;
  let shape = 'pin';
  let text = null;
  if (def.text) {
    // Drawn as text on the map instead of a pin (the sprite number only picks the legend icon).
    shape = 'text';
    text = {
      stops: (def.text.stops || []).map(([zoom, size]) => [zoom + CONFIG.textZoomOffset, size]),
      fade: def.text.fade ? def.text.fade.map((zoom) => zoom + CONFIG.textZoomOffset) : null,   // alpha 1 -> 0 between these zooms
      color: def.text.color || CONFIG.textColor,
      halo: def.text.halo || CONFIG.textHalo,
      priority: def.text.priority !== undefined ? def.text.priority : 5     // lower = drawn first, wins overlaps
    };
  } else if (def.sprite !== undefined) {
    image = CONFIG.spriteDir + 's' + def.sprite + '.png';          // a full pin from the sprite sheet
  } else if (def.dot !== undefined) {
    image = CONFIG.spriteDir + 'd' + def.dot + '.png';             // a small round icon
    shape = 'dot';
  } else {
    image = group.pin;                                             // the group's plain colored pin
    if (def.glyph !== undefined) glyph = CONFIG.glyphDir + 'g' + def.glyph + '.png';
  }

  const category = {
    id: key,
    label: def.name,
    groupId: group.id,
    color: group.color || '#6fe3f0',
    dataColor: '',
    iconFile: def.sprite !== undefined ? def.sprite : (def.dot !== undefined ? def.dot : null),
    defaultOn: def.on !== false,
    image,
    fallbackImage: text ? null : (group.pin || null),
    shape,
    text,
    glyph,
    icon: '\u25CF',
    total: 0,
    done: 0,
    countEl: null,
    itemEl: null
  };
  state.categories.set(key, category);
  group.categories.push(category);
  return category;
}

// Markers tagged as DLC / Master Mode content in the data.
const DLC_PATTERN = /DLC|Champions.? Ballad|Master Trials|Expansion Pass|Master Mode/i;

// An icon that differs from its category's icon (e.g. mushrooms inside the Materials toggle).
function lookFor(category, spec) {
  if (spec.sprite === undefined && spec.dot === undefined) return category;
  const dot = spec.sprite === undefined;
  const file = dot ? 'd' + spec.dot : 's' + spec.sprite;
  const key = category.id + '#' + file;
  if (!state.looks.has(key)) {
    state.looks.set(key, {
      id: key,
      label: category.label,
      color: category.color,
      dataColor: '',
      shape: dot ? 'dot' : 'pin',
      image: CONFIG.spriteDir + file + '.png',
      fallbackImage: category.image || category.fallbackImage || null,
      glyph: null,
      icon: category.icon
    });
  }
  return state.looks.get(key);
}

// Decides which category (and icon) a marker gets, and whether it is DLC content.
function resolveCategory(rawCat, marker, rawText) {
  const catalogEntry = rawCat !== undefined && CATALOG.ids ? CATALOG.ids[String(rawCat)] : undefined;
  if (catalogEntry !== undefined) {
    const spec = typeof catalogEntry === 'string' ? { to: catalogEntry } : catalogEntry;
    let key = spec.to;
    if (spec.requires && !new RegExp(spec.requires.pattern, 'i').test(rawText)) key = spec.requires.else;
    const category = registerCatalogCategory(key);
    if (category) {
      const dlc = !!spec.dlc && ((Array.isArray(marker.tags) && marker.tags.length > 0) || DLC_PATTERN.test(rawText));
      return { category, look: lookFor(category, spec), dlc };
    }
  }
  const category = registerCategory(rawCat) || registerCategory('Other');
  return { category, look: category, dlc: false };
}

function ingest(raw) {
  const { categoryDefs, markers } = extractRaw(raw);

  if (raw && Array.isArray(raw.regions)) {
    for (const region of raw.regions) {
      if (region && region.id !== undefined && region.title) {
        state.regionNames.set(String(region.id), String(region.title));
      }
    }
  }

  initGroups();
  categoryDefs.forEach(registerCategory);

  const seenIds = new Set();
  const excludedIds = new Set((CATALOG.exclude || []).map(String));
  let skipped = 0;
  let excluded = 0;

  markers.forEach((m, index) => {
    if (!m || typeof m !== 'object') { skipped++; return; }

    const point = readCoords(m);
    if (!point) { skipped++; return; }

    const rawCat = pick(m, ['category', 'category_id', 'type', 'group', 'kind']);
    if (rawCat !== undefined && excludedIds.has(String(rawCat))) { excluded++; return; }

    const rawDescription = String(pick(m, ['description', 'desc', 'notes', 'details', 'text']) ?? '');
    const rawTitle = String(pick(m, ['name', 'title', 'label']) ?? '');
    const resolved = resolveCategory(rawCat, m, rawTitle + ' ' + rawDescription);
    const category = resolved.category;
    if (!category.dataColor && typeof m.color === 'string') category.dataColor = m.color;

    const name = rawTitle || category.label + ' ' + (index + 1);
    const description = cleanDescription(rawDescription);
    const regionRaw = pick(m, ['region', 'area']);
    const region = regionRaw !== undefined
      ? String(regionRaw)
      : (state.regionNames.get(String(m.region_id)) || '');

    // Stable ids keep saved progress attached to the right marker between launches.
    const explicit = pick(m, ['id', 'uid', 'key', 'slug']);
    // (Built from the original data category, not the merged one, so saved progress stays valid.)
    const dataCat = rawCat !== null && typeof rawCat === 'object'
      ? slug(pick(rawCat, ['id', 'key', 'name', 'label', 'title']) ?? 'other')
      : slug(rawCat ?? 'other');
    let id = explicit !== undefined
      ? dataCat + ':' + explicit
      : [dataCat, name, point.x, point.y].join('|');
    if (seenIds.has(id)) {
      let n = 2;
      while (seenIds.has(id + '#' + n)) n++;
      id = id + '#' + n;
    }
    seenIds.add(id);

    category.total++;
    state.entries.push({
      id,
      name,
      description,
      region,
      category,
      media: mediaFor(m, name, explicit),   // screenshots shown at the top of the popup (or null)
      look: resolved.look,         // the icon to draw (usually the category's own)
      dlc: resolved.dlc,           // DLC / Master Mode content, hidden unless switched on
      categoryId: category.id,
      point,                       // original position from the data file
      latlng: toLatLng(point),     // position on the map (recomputed when the alignment changes)
      searchText: [name, description, region, category.label].join(' ').toLowerCase(),
      matched: false
    });
  });

  // Drop categories that ended up empty.
  for (const [id, category] of Array.from(state.categories)) {
    if (category.total === 0) {
      state.categories.delete(id);
      const group = state.groups.get(category.groupId);
      if (group) group.categories = group.categories.filter((c) => c !== category);
    }
  }

  if (state.entries.length === 0) {
    throw new Error(
      'None of the ' + markers.length + ' markers has a usable position. ' +
      'Check the position fields in map_data.json and the coordinateMode setting at the top of app.js.'
    );
  }

  // First launch: start with only the groups flagged defaultVisible switched on.
  if (!state.hasSavedVisibility) {
    for (const category of state.categories.values()) {
      const group = state.groups.get(category.groupId);
      if ((group && group.defaultVisible === false) || category.defaultOn === false) state.hidden.add(category.id);
    }
    savePrefs();
  }

  dom.dataNote.textContent = state.entries.length.toLocaleString() + ' markers loaded' +
    (skipped > 0 ? ', ' + skipped + ' skipped (no usable position)' : '') +
    (excluded > 0 ? ', ' + excluded + ' excluded by the catalog' : '') + '.';
  if (skipped > 0) console.warn(skipped + ' marker(s) were skipped (missing or invalid position).');
}

/* --------------------------------------------------------------------------
   Pin images: explicit config first, then group pin, then pin-<hex>.png
   -------------------------------------------------------------------------- */
async function resolveCategoryImages() {
  const jobs = [];
  for (const category of [...state.categories.values(), ...state.looks.values()]) {
    jobs.push((async () => {
      const candidates = [];
      if (category.image) candidates.push(category.image);

      const hex = /^#?([0-9a-f]{6})$/i.exec(String(category.dataColor).trim());
      if (CONFIG.autoPinByColor && hex) candidates.push('./pin-' + hex[1].toLowerCase() + '.png');

      const wanted = category.image;
      if (category.fallbackImage) candidates.push(category.fallbackImage);

      category.image = null;
      for (const candidate of candidates) {
        if (await probeImage(candidate)) {
          category.image = candidate;
          break;
        }
      }

      // If a sprite file is missing, fall back to the group's plain pin (and its shape).
      if (category.image !== wanted) {
        category.shape = 'pin';
        category.glyph = null;
      }
      // Glyphs are only drawn on image pins.
      if (!category.image || (category.glyph && !(await probeImage(category.glyph)))) category.glyph = null;
    })());
  }

  for (const group of state.groups.values()) {
    if (group.pin && !(await probeImage(group.pin))) group.pin = null;
  }
  await Promise.all(jobs);
}

// DOM version of a pin (used for the small thumbnails in the sidebar).
function buildPinImages(category, height) {
  const base = document.createElement('img');
  base.className = 'pin-base';
  base.src = category.image;
  base.alt = '';
  base.draggable = false;
  base.style.height = height + 'px';
  const nodes = [base];

  if (category.glyph) {
    const glyph = document.createElement('img');
    glyph.className = 'pin-glyph-img';
    glyph.src = category.glyph;
    glyph.alt = '';
    glyph.draggable = false;
    glyph.style.height = height + 'px';
    nodes.push(glyph);
  }
  return { base, nodes };
}

/* --------------------------------------------------------------------------
   Canvas pins
   Thousands of DOM markers are far too slow, so every pin is drawn onto one
   canvas. Each category/completed combination is pre-composed into a 66x88
   sprite that is then stamped onto the map.
   -------------------------------------------------------------------------- */
const SPRITE_W = 66;      // pins are 66 x 88
const SPRITE_H = 88;
const DOT_SIZE = 50;      // round dot icons are 50 x 50
const spriteCache = new Map();

function drawFallbackPin(ctx, category) {
  ctx.beginPath();
  ctx.moveTo(33, 86);
  ctx.bezierCurveTo(12, 62, 3, 48, 3, 33);
  ctx.arc(33, 33, 30, Math.PI, 0);
  ctx.bezierCurveTo(63, 48, 54, 62, 33, 86);
  ctx.closePath();
  ctx.fillStyle = category.color || '#6fe3f0';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.stroke();
  ctx.fillStyle = '#0a1218';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(category.icon || '\u25CF', 33, 34);
}

// Small cyan disc with a check mark, drawn on completed markers.
function drawDoneBadge(ctx, cx, cy, r) {
  const k = r / 13;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#6fe3f0';
  ctx.fill();
  ctx.lineWidth = 3.5 * k;
  ctx.strokeStyle = '#0a1218';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 6 * k, cy + 0.5 * k);
  ctx.lineTo(cx - 1.5 * k, cy + 5 * k);
  ctx.lineTo(cx + 6.5 * k, cy - 4.5 * k);
  ctx.stroke();
}

function getSprite(category, done) {
  const key = category.id + (done ? ':done' : '');
  let sprite = spriteCache.get(key);
  if (sprite) return sprite;

  const dot = category.shape === 'dot';
  const sw = dot ? DOT_SIZE : SPRITE_W;
  const sh = dot ? DOT_SIZE : SPRITE_H;

  sprite = document.createElement('canvas');
  sprite.width = sw;
  sprite.height = sh;
  const ctx = sprite.getContext('2d');

  if (done) ctx.filter = 'grayscale(0.9) brightness(0.72)';
  const base = category.image ? imageCache.get(category.image) : null;
  if (base) {
    ctx.drawImage(base, 0, 0, sw, sh);
    const glyph = !dot && category.glyph ? imageCache.get(category.glyph) : null;
    if (glyph) ctx.drawImage(glyph, 0, 0, sw, sh);
  } else if (!dot) {
    drawFallbackPin(ctx, category);
  }
  ctx.filter = 'none';

  if (done) {
    if (dot) drawDoneBadge(ctx, 40, 10, 10);
    else drawDoneBadge(ctx, 54, 14, 13);
  }

  spriteCache.set(key, sprite);
  return sprite;
}

// Font size of a text label at a map zoom: linear between the catalog's stops, flat outside them.
function textSizeFor(spec, zoom) {
  const stops = spec.stops;
  if (!stops.length) return 0;
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (zoom <= stops[i][0]) {
      const [z0, s0] = stops[i - 1];
      const [z1, s1] = stops[i];
      return s0 + ((zoom - z0) / (z1 - z0)) * (s1 - s0);
    }
  }
  return stops[stops.length - 1][1];
}

// Opacity of a label at a map zoom: 1, fading to 0 between the catalog's two "fade" zooms.
function textAlphaFor(spec, zoom) {
  if (!spec.fade) return 1;
  const [z0, z1] = spec.fade;
  return Math.min(1, Math.max(0, 1 - (zoom - z0) / (z1 - z0)));
}

function pinHeightFor(zoom) {
  const [z0, z1] = CONFIG.pinZoomRange;
  const [h0, h1] = CONFIG.pinSizes;
  const t = Math.min(1, Math.max(0, (zoom - z0) / (z1 - z0)));
  return h0 + t * (h1 - h0);
}

const PinLayer = L.Layer.extend({
  initialize() {
    this._items = [];
    this._texts = [];
    this._pins = [];
    this._hover = null;
    this._tip = null;
    this._raf = 0;
    this._lastMove = 0;
  },

  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'atlas-pins');
    this._ctx = this._canvas.getContext('2d');
    map.getPane('markerPane').appendChild(this._canvas);

    this._events = {
      moveend: this.redraw,
      zoomend: this.redraw,
      resize: this.redraw,
      move: this._onViewMove,
      mousemove: this._onMouseMove,
      mouseout: this._onMouseOut,
      click: this._onClick
    };
    map.on(this._events, this);
    this.redraw();
  },

  onRemove(map) {
    map.off(this._events, this);
    if (this._tip) map.closeTooltip(this._tip);
    this._canvas.remove();
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  },

  setItems(items) {
    this._items = items;
    this._texts = items.filter((entry) => entry.look.shape === 'text');       // drawn as labels, not clickable
    this._pins = items.filter((entry) => entry.look.shape !== 'text');
    this._setHover(null);
    this.redraw();
  },

  redraw() {
    if (!this._map || this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._render();
    });
  },

  // Screen position of a data point: layerPoint = origin + lat * ay (etc.). Exact, allocation free.
  _coefficients() {
    const map = this._map;
    const crs = map.options.crs;
    const zoom = map.getZoom();
    const origin = map.getPixelOrigin();
    const p0 = crs.latLngToPoint(L.latLng(0, 0), zoom);
    const p1 = crs.latLngToPoint(L.latLng(1, 1), zoom);
    return { x0: p0.x - origin.x, y0: p0.y - origin.y, ax: p1.x - p0.x, ay: p1.y - p0.y };
  },

  _render() {
    const map = this._map;
    if (!map) return;

    const size = map.getSize();
    const pad = 0.25;                                  // extra canvas around the viewport, so dragging shows no gaps
    const w = Math.ceil(size.x * (1 + 2 * pad));
    const h = Math.ceil(size.y * (1 + 2 * pad));
    const dpr = window.devicePixelRatio || 1;
    const canvas = this._canvas;
    const ctx = this._ctx;

    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }

    const topLeft = map.containerPointToLayerPoint(L.point(-size.x * pad, -size.y * pad)).round();
    L.DomUtil.setPosition(canvas, topLeft);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const t = this._coefficients();
    const ph = pinHeightFor(map.getZoom());
    const pw = ph * (SPRITE_W / SPRITE_H);
    const dd = ph * CONFIG.dotScale;
    const ox = t.x0 - topLeft.x;
    const oy = t.y0 - topLeft.y;
    const completed = state.completed;

    // Labels sit underneath the pins.
    if (this._texts.length) this._drawTexts(ctx, ox, oy, t, w, h);

    for (const entry of this._pins) {
      const x = ox + entry.latlng[1] * t.ax;
      const y = oy + entry.latlng[0] * t.ay;
      const look = entry.look;

      if (look.shape === 'dot') {
        if (x < -dd || x > w + dd || y < -dd || y > h + dd) continue;
        ctx.drawImage(getSprite(look, completed.has(entry.id)), x - dd / 2, y - dd / 2, dd, dd);
      } else {
        if (x < -pw || x > w + pw || y < 0 || y > h + ph) continue;
        ctx.drawImage(getSprite(look, completed.has(entry.id)), x - pw / 2, y - ph, pw, ph);
      }
    }
  },

  // Place names: colored text with a dark outline, biggest categories first, skipping any label
  // that would overlap one that is already placed.
  _drawTexts(ctx, ox, oy, t, w, h) {
    const zoom = this._map.getZoom();
    const shown = [];
    for (const entry of this._texts) {
      const spec = entry.category.text;
      const size = textSizeFor(spec, zoom);
      if (size < CONFIG.textMinSize) continue;
      const alpha = textAlphaFor(spec, zoom);
      if (alpha <= 0.02) continue;
      const x = ox + entry.latlng[1] * t.ax;
      const y = oy + entry.latlng[0] * t.ay;
      if (x < -300 || x > w + 300 || y < -40 || y > h + 40) continue;
      shown.push({ entry, spec, size, alpha, x, y });
    }
    if (!shown.length) return;
    shown.sort((a, b) => a.spec.priority - b.spec.priority || b.size - a.size);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const placed = [];
    for (const label of shown) {
      ctx.font = '600 ' + label.size.toFixed(1) + 'px ' + CONFIG.textFont;
      const halfW = ctx.measureText(label.entry.name).width / 2 + 4;
      const halfH = label.size * 0.62;
      const box = [label.x - halfW, label.y - halfH, label.x + halfW, label.y + halfH];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      placed.push(box);

      ctx.globalAlpha = label.alpha;
      ctx.lineWidth = Math.max(2, label.size * 0.2);
      ctx.strokeStyle = label.spec.halo;
      ctx.strokeText(label.entry.name, label.x, label.y);
      ctx.fillStyle = label.spec.color;
      ctx.fillText(label.entry.name, label.x, label.y);
    }
    ctx.globalAlpha = 1;
  },

  // Topmost pin under a container point, or null.
  _hit(containerPoint) {
    const map = this._map;
    const m = map.containerPointToLayerPoint(containerPoint);
    const t = this._coefficients();
    const ph = pinHeightFor(map.getZoom());
    const halfW = Math.max((ph * (SPRITE_W / SPRITE_H)) / 2, 6);
    const halfDot = Math.max((ph * CONFIG.dotScale) / 2, 6);      // tiny dots stay easy to hit
    const items = this._pins;

    for (let i = items.length - 1; i >= 0; i--) {
      const e = items[i];
      const x = t.x0 + e.latlng[1] * t.ax;
      const y = t.y0 + e.latlng[0] * t.ay;
      if (e.look.shape === 'dot') {
        if (Math.abs(m.x - x) <= halfDot && Math.abs(m.y - y) <= halfDot) return e;
      } else if (m.y <= y && m.y >= y - ph && Math.abs(m.x - x) <= halfW) {
        return e;
      }
    }
    return null;
  },

  _onViewMove() {
    const now = performance.now();
    if (now - this._lastMove > 120) {     // keep pins filled in while dragging, without redrawing every frame
      this._lastMove = now;
      this.redraw();
    }
  },

  _onMouseMove(event) {
    if (this._map.dragging && this._map.dragging.moving()) return;
    this._setHover(this._hit(event.containerPoint));
  },

  _onMouseOut() {
    this._setHover(null);
  },

  _onClick(event) {
    const hit = this._hit(event.containerPoint);
    if (hit) openEntryPopup(hit);
  },

  _setHover(entry) {
    if (entry === this._hover) return;
    this._hover = entry;
    this._map.getContainer().style.cursor = entry ? 'pointer' : '';

    if (!entry) {
      if (this._tip) this._map.closeTooltip(this._tip);
      return;
    }
    if (!this._tip) {
      this._tip = L.tooltip({ direction: 'top', className: 'atlas-tooltip', opacity: 1 });
    }
    this._tip.options.offset = [0, -anchorHeight(entry, this._map.getZoom())];
    this._tip.setContent(entry.name);
    this._tip.setLatLng(entry.latlng);
    this._map.openTooltip(this._tip);
  }
});

// How far above the map point a tooltip or popup should sit (pins reach up; dots are centered).
function anchorHeight(entry, zoom) {
  const ph = pinHeightFor(zoom);
  if (entry.look.shape === 'text') return 6;
  return Math.round(entry.look.shape === 'dot' ? (ph * CONFIG.dotScale) / 2 : ph);
}

function openEntryPopup(entry) {
  if (!state.map) return;
  const popup = L.popup({
    className: 'atlas-popup' + (entry.media ? ' has-media' : ''),
    minWidth: 230,
    maxWidth: 340,
    autoPanPadding: [30, 30],
    offset: [0, -anchorHeight(entry, state.map.getZoom())]
  })
    .setLatLng(entry.latlng)
    .setContent(buildPopup(entry));
  state.popup = popup;
  popup.openOn(state.map);
}

// Screenshots at the top of a popup. Nothing shows (and no space is used) unless at least one file loads.
function buildMedia(entry) {
  const wrap = el('div', 'popup-media');
  wrap.hidden = true;

  for (const src of entry.media) {
    const img = document.createElement('img');
    img.className = 'popup-shot';
    img.alt = 'Screenshot: ' + entry.name;
    img.title = 'Click to enlarge';
    img.draggable = false;
    img.addEventListener('load', () => {
      if (wrap.hidden) {
        wrap.hidden = false;
        if (state.popup) state.popup.update();          // the popup just got taller
      }
    });
    img.addEventListener('error', () => img.remove());
    img.addEventListener('click', () => {
      const shots = Array.from(wrap.querySelectorAll('img.popup-shot')).map((node) => node.getAttribute('src'));
      openLightbox(shots, shots.indexOf(img.getAttribute('src')), entry.name);
    });
    img.src = src;
    wrap.appendChild(img);
  }
  wrap.appendChild(el('span', 'popup-media-hint', 'Click to enlarge'));
  return wrap;
}

function buildPopup(entry) {
  const category = entry.category;

  const root = el('div', 'popup');
  if (entry.media) root.appendChild(buildMedia(entry));

  const badge = el('div', 'popup-badge', category.label);
  badge.style.setProperty('--pin-color', category.color);
  root.appendChild(badge);

  root.appendChild(el('h3', 'popup-title', entry.name));
  if (entry.region) root.appendChild(el('p', 'popup-region', entry.region));
  root.appendChild(el('p', 'popup-desc', entry.description || 'No description available for this marker.'));

  if (category.text) return root;             // place names are labels: nothing to complete

  const button = el('button', 'btn popup-btn');
  button.type = 'button';

  const refresh = () => {
    const done = state.completed.has(entry.id);
    button.textContent = done ? 'Completed (click to undo)' : 'Mark as Completed';
    button.classList.toggle('is-done', done);
    button.setAttribute('aria-pressed', String(done));
  };
  button.addEventListener('click', () => {
    setCompleted(entry, !state.completed.has(entry.id));
    refresh();
  });
  refresh();

  root.appendChild(button);
  return root;
}

function setCompleted(entry, done) {
  if (done) state.completed.add(entry.id);
  else state.completed.delete(entry.id);

  saveProgress();
  refreshProgress();
  if (state.hideCompleted) applyFilters();
  else if (state.pins) state.pins.redraw();
}

/* --------------------------------------------------------------------------
   Filtering: layer toggles + search + "hide completed" + DLC switch
   -------------------------------------------------------------------------- */
const isActive = (entry) => state.showDlc || !entry.dlc;

function applyFilters() {
  if (!state.pins) return;

  const tokens = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = tokens.length > 0;
  const list = [];

  for (const entry of state.entries) {
    // While searching, every layer is searched, not just the switched-on ones.
    const wanted =
      isActive(entry) &&
      (searching || !state.hidden.has(entry.categoryId)) &&
      (!state.hideCompleted || !state.completed.has(entry.id)) &&
      (!searching || tokens.every((token) => entry.searchText.includes(token)));

    entry.matched = wanted;
    if (wanted) list.push(entry);
  }

  state.pins.setItems(list);

  dom.resultCount.textContent =
    list.length.toLocaleString() + ' of ' + state.entries.filter(isActive).length.toLocaleString() + ' markers ' +
    (searching ? 'match (all layers searched)' : 'in active layers');
}

// A category is "on" unless it is in the hidden set; off entries are struck through and grayed out.
function updateCategoryUI(category) {
  const visible = !state.hidden.has(category.id);
  if (category.itemEl) {
    category.itemEl.classList.toggle('is-off', !visible);
    category.itemEl.setAttribute('aria-pressed', String(visible));
  }
}

function refreshGroupChecks() {
  for (const group of state.groups.values()) {
    if (!group.headEl) continue;
    const on = group.categories.filter((c) => !state.hidden.has(c.id)).length;
    group.headEl.classList.toggle('is-off', on === 0);
    group.headEl.classList.toggle('is-partial', on > 0 && on < group.categories.length);
  }
}

function setCategoryVisible(id, visible) {
  if (visible) state.hidden.delete(id);
  else state.hidden.add(id);
  updateCategoryUI(state.categories.get(id));
  refreshGroupChecks();
  savePrefs();
  applyFilters();
}

function setGroupVisible(group, visible) {
  for (const category of group.categories) {
    if (visible) state.hidden.delete(category.id);
    else state.hidden.add(category.id);
    updateCategoryUI(category);
  }
  refreshGroupChecks();
  savePrefs();
  applyFilters();
}

function setAllCategories(visible) {
  for (const category of state.categories.values()) {
    if (visible) state.hidden.delete(category.id);
    else state.hidden.add(category.id);
    updateCategoryUI(category);
  }
  refreshGroupChecks();
  savePrefs();
  applyFilters();
}

// Quick button: show only these categories
function showOnly(keys) {
  const only = new Set(keys);
  for (const category of state.categories.values()) {
    if (only.has(category.id)) state.hidden.delete(category.id);
    else state.hidden.add(category.id);
    updateCategoryUI(category);
  }
  refreshGroupChecks();
  savePrefs();
  applyFilters();
}

function jumpToResults() {
  if (!state.map) return;
  const found = state.entries.filter((entry) => entry.matched);
  if (found.length === 0) return;

  if (found.length === 1) {
    const [only] = found;
    state.map.setView(only.latlng, Math.max(state.map.getZoom(), 0), { animate: false });
    openEntryPopup(only);
    return;
  }
  const area = L.latLngBounds(found.map((entry) => entry.latlng));
  state.map.fitBounds(area.pad(0.25), { maxZoom: 1, animate: false });
}

/* --------------------------------------------------------------------------
   Alignment tool: nudge and scale all markers until they sit on the terrain,
   then save. The result is stored and reused on the next launch.
   -------------------------------------------------------------------------- */
function recomputePositions() {
  for (const entry of state.entries) entry.latlng = toLatLng(entry.point);
  if (state.pins) state.pins.redraw();
  updateCalibrationReadout();
}

function updateCalibrationReadout() {
  const g = state.geo;
  dom.calibValues.textContent =
    'west ' + g.west.toFixed(5) + '   east ' + g.east.toFixed(5) +
    '   south ' + g.south.toFixed(5) + '   north ' + g.north.toFixed(5);
}

function nudgeMarkers(dxScreen, dyScreen) {
  const scale = Math.pow(2, state.map.getZoom());
  const g = state.geo;
  const spanX = g.east - g.west;
  const spanY = g.north - g.south;
  const dLng = -((dxScreen / scale) * spanX) / state.size.width;
  const dLat = -((dyScreen / scale) * spanY) / state.size.height;
  g.west += dLng;
  g.east += dLng;
  g.south += dLat;
  g.north += dLat;
  recomputePositions();
}

// factor > 1 spreads the markers out, pivoting around the middle of the image
function scaleMarkers(factor) {
  const g = state.geo;
  const cx = (g.west + g.east) / 2;
  const cy = (g.south + g.north) / 2;
  const hx = (g.east - g.west) / 2 / factor;
  const hy = (g.north - g.south) / 2 / factor;
  g.west = cx - hx;
  g.east = cx + hx;
  g.south = cy - hy;
  g.north = cy + hy;
  recomputePositions();
}

function startCalibration() {
  if ((CONFIG.coordinateMode !== 'geo' && CONFIG.coordinateMode !== 'mercator') || !state.map) return;
  state.calibrating = true;
  state.geoBackup = { ...state.geo };
  dom.calib.hidden = false;
  dom.calibrateBtn.textContent = 'Alignment mode is on';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  updateCalibrationReadout();
}

function endCalibration() {
  state.calibrating = false;
  dom.calib.hidden = true;
  dom.calibrateBtn.textContent = 'Align markers to map';
}

function wireCalibration() {
  dom.calibrateBtn.addEventListener('click', () => {
    if (state.calibrating) endCalibration();
    else startCalibration();
  });

  dom.calibSave.addEventListener('click', () => {
    store.write(STORAGE_KEYS.geo, state.geo);
    endCalibration();
  });

  dom.calibReset.addEventListener('click', () => {
    state.geo = { ...CONFIG.geo };
    store.remove(STORAGE_KEYS.geo);
    recomputePositions();
  });

  dom.calibCancel.addEventListener('click', () => {
    if (state.geoBackup) state.geo = { ...state.geoBackup };
    recomputePositions();
    endCalibration();
  });

  window.addEventListener('keydown', (event) => {
    if (!state.calibrating || !state.map) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const step = event.shiftKey ? 20 : event.altKey ? 0.5 : 2;               // screen pixels
    const factor = event.shiftKey ? 1.01 : event.altKey ? 1.0002 : 1.001;

    switch (event.key) {
      case 'ArrowLeft': nudgeMarkers(-step, 0); break;
      case 'ArrowRight': nudgeMarkers(step, 0); break;
      case 'ArrowUp': nudgeMarkers(0, step); break;
      case 'ArrowDown': nudgeMarkers(0, -step); break;
      case '+':
      case '=': scaleMarkers(factor); break;
      case '-':
      case '_': scaleMarkers(1 / factor); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

/* --------------------------------------------------------------------------
   Screenshot viewer: click a popup screenshot to see it large. Click the picture
   again for actual size, use the arrows (or the arrow keys) when there are several.
   -------------------------------------------------------------------------- */
const lightbox = { shots: [], index: 0, title: '' };

function showLightboxShot() {
  const { shots, index, title } = lightbox;
  dom.lightboxImg.src = shots[index];
  dom.lightboxImg.alt = title;
  dom.lightboxStage.classList.remove('is-zoomed');
  dom.lightboxStage.scrollTo(0, 0);
  dom.lightboxCaption.textContent = title + (shots.length > 1 ? '  (' + (index + 1) + ' of ' + shots.length + ')' : '');
  dom.lightboxPrev.hidden = dom.lightboxNext.hidden = shots.length < 2;
}

function openLightbox(shots, index, title) {
  if (!shots.length) return;
  lightbox.shots = shots;
  lightbox.index = Math.max(0, index);
  lightbox.title = title;
  showLightboxShot();
  dom.lightbox.hidden = false;
  dom.lightboxClose.focus();
}

function closeLightbox() {
  dom.lightbox.hidden = true;
  dom.lightboxImg.removeAttribute('src');
}

function stepLightbox(step) {
  const count = lightbox.shots.length;
  if (count < 2) return;
  lightbox.index = (lightbox.index + step + count) % count;
  showLightboxShot();
}

function wireLightbox() {
  dom.lightboxClose.addEventListener('click', closeLightbox);
  dom.lightboxPrev.addEventListener('click', () => stepLightbox(-1));
  dom.lightboxNext.addEventListener('click', () => stepLightbox(1));
  dom.lightboxImg.addEventListener('click', () => dom.lightboxStage.classList.toggle('is-zoomed'));
  dom.lightbox.addEventListener('click', (event) => {
    // a click on the dark background (not on the picture or a button) closes the viewer
    if (event.target === dom.lightbox || event.target === dom.lightboxStage) closeLightbox();
  });

  window.addEventListener('keydown', (event) => {
    if (dom.lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    else if (event.key === 'ArrowLeft') stepLightbox(-1);
    else if (event.key === 'ArrowRight') stepLightbox(1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

/* --------------------------------------------------------------------------
   "Click me" message. Links open in the default browser (the main process only
   allows the exact addresses listed in main.js).
   -------------------------------------------------------------------------- */
function wireAbout() {
  const close = () => {
    dom.about.hidden = true;
    dom.aboutBtn.focus();
  };

  dom.aboutBtn.addEventListener('click', () => {
    dom.about.hidden = false;
    dom.aboutClose.focus();
  });
  dom.aboutClose.addEventListener('click', close);

  dom.about.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a[data-external]');
    if (link) {
      event.preventDefault();
      if (window.hyruleAPI && typeof window.hyruleAPI.openExternal === 'function') {
        window.hyruleAPI.openExternal(link.href);
      }
    } else if (event.target === dom.about) {
      close();                                   // click on the dimmed background
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dom.about.hidden) {
      event.preventDefault();
      close();
    }
  });
}

/* --------------------------------------------------------------------------
   Sidebar UI
   -------------------------------------------------------------------------- */
// "12" normally, "3/12" once something is completed.
function countLabel(done, total) {
  return done > 0 ? done + '/' + total : String(total);
}

function layerIcon(category) {
  if (category.iconFile === null || category.iconFile === undefined) {
    const dot = el('span', 'layer-dot');                     // categories without a legend icon
    dot.style.setProperty('--pin-color', category.color || '#6fe3f0');
    return dot;
  }
  const img = document.createElement('img');
  img.className = 'layer-icon';
  img.alt = '';
  img.draggable = false;
  img.src = CONFIG.iconDir + 'i' + category.iconFile + '.png';
  img.addEventListener('error', () => { img.style.visibility = 'hidden'; });   // blank sprites: keep the space, show nothing
  return img;
}

// One legend entry: icon, name, count. Clicking it switches the layer on or off.
function layerButton(category, extraClass) {
  const button = el('button', 'layer-btn' + (extraClass ? ' ' + extraClass : ''));
  button.type = 'button';
  button.title = category.label;
  const count = el('span', 'layer-count');
  button.append(layerIcon(category), el('span', 'layer-name', category.label), count);
  button.addEventListener('click', () => setCategoryVisible(category.id, state.hidden.has(category.id)));
  category.countEl = count;
  category.itemEl = button;
  updateCategoryUI(category);
  return button;
}

function renderCategoryList() {
  dom.categoryList.replaceChildren();
  dom.categoryList.className = 'layer-list';

  for (const group of state.groups.values()) {
    if (group.categories.length === 0) continue;
    group.categories.sort((a, b) => a.label.localeCompare(b.label));

    const section = el('li', 'layer-group');

    if (group.flat) {
      // A toggle that shows a whole family of items (Ore Deposits, Materials, Creatures).
      const button = layerButton(group.categories[0], 'layer-head');
      section.appendChild(button);
      dom.categoryList.appendChild(section);
      continue;
    }

    // Group heading: clicking it switches the whole group on (or off, if everything is already on).
    const head = el('button', 'layer-head', group.name);
    head.type = 'button';
    head.title = 'Show or hide everything in ' + group.name;
    head.addEventListener('click', () => {
      const allOn = group.categories.every((c) => !state.hidden.has(c.id));
      setGroupVisible(group, !allOn);
    });
    group.headEl = head;
    section.appendChild(head);

    const grid = el('ul', 'layer-grid');
    for (const category of group.categories) {
      const item = el('li', 'layer-item');
      item.appendChild(layerButton(category));
      grid.appendChild(item);
    }
    section.appendChild(grid);
    dom.categoryList.appendChild(section);
  }
  refreshGroupChecks();
}

function refreshProgress() {
  let done = 0;
  for (const category of state.categories.values()) { category.done = 0; category.total = 0; }
  for (const group of state.groups.values()) { group.done = 0; group.total = 0; }
  let total = 0;

  for (const entry of state.entries) {
    if (!isActive(entry)) continue;          // DLC content only counts when it is switched on
    const category = entry.category;
    category.total++;
    if (category.text) continue;             // place names cannot be completed, so they are not counted
    const group = state.groups.get(category.groupId);
    total++;
    group.total++;
    if (state.completed.has(entry.id)) {
      category.done++;
      group.done++;
      done++;
    }
  }

  const percent = total ? Math.round((done / total) * 100) : 0;

  dom.progressFill.style.width = percent + '%';
  dom.progressMeter.setAttribute('aria-valuenow', String(percent));
  dom.progressText.textContent = done.toLocaleString() + ' of ' + total.toLocaleString() + ' completed (' + percent + '%)';

  for (const category of state.categories.values()) {
    if (category.countEl) category.countEl.textContent = countLabel(category.done, category.total);
  }
}

function applySidebarState() {
  document.body.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
  dom.sidebar.inert = state.sidebarCollapsed;
  dom.toggle.setAttribute('aria-expanded', String(!state.sidebarCollapsed));
  dom.toggle.setAttribute('aria-label', state.sidebarCollapsed ? 'Show side panel' : 'Hide side panel');
}

function toggleSidebar(collapsed = !state.sidebarCollapsed) {
  state.sidebarCollapsed = collapsed;
  applySidebarState();
  savePrefs();
}

function clearSearch() {
  dom.search.value = '';
  state.query = '';
  dom.searchClear.hidden = true;
  applyFilters();
}

function wireControls() {
  dom.toggle.addEventListener('click', () => toggleSidebar());

  dom.search.addEventListener('input', () => {
    state.query = dom.search.value;
    dom.searchClear.hidden = state.query === '';
    applyFilters();
  });
  dom.search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      jumpToResults();
    } else if (event.key === 'Escape') {
      clearSearch();
    }
  });
  dom.searchClear.addEventListener('click', () => {
    clearSearch();
    dom.search.focus();
  });

  dom.layersAll.addEventListener('click', () => setAllCategories(true));
  dom.layersNone.addEventListener('click', () => setAllCategories(false));

  dom.showDlc.checked = state.showDlc;
  dom.showDlc.addEventListener('change', () => {
    state.showDlc = dom.showDlc.checked;
    savePrefs();
    refreshProgress();
    applyFilters();
  });

  const completionPreset = (CATALOG.presets && CATALOG.presets.completion) || [];
  dom.layersCore.hidden = completionPreset.length === 0;
  dom.layersCore.addEventListener('click', () => showOnly(completionPreset));

  dom.hideCompleted.checked = state.hideCompleted;
  dom.hideCompleted.addEventListener('change', () => {
    state.hideCompleted = dom.hideCompleted.checked;
    savePrefs();
    applyFilters();
  });

  dom.reset.addEventListener('click', () => {
    if (state.completed.size === 0) return;
    if (!window.confirm('Reset all completion progress? This cannot be undone.')) return;
    state.completed.clear();
    saveProgress();
    if (state.map) state.map.closePopup();
    refreshProgress();
    applyFilters();
  });

  window.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === 'f') {
      event.preventDefault();
      toggleSidebar(false);
      dom.search.focus();
      dom.search.select();
    } else if (key === 'b') {
      event.preventDefault();
      toggleSidebar();
    }
  });

  wireCalibration();
  wireAbout();
  wireLightbox();
}

/* --------------------------------------------------------------------------
   Map
   -------------------------------------------------------------------------- */
function buildMap() {
  const { width, height } = state.size;
  const bounds = L.latLngBounds([0, 0], [height, width]);
  state.bounds = bounds;

  // With tiles, the tile grid must start at the image's top-left corner, so the
  // layer's y coordinate is (height - lat). Note the -1: latitude still points up.
  const crs = state.tiles
    ? L.extend({}, L.CRS.Simple, { transformation: new L.Transformation(1, 0, -1, height) })
    : L.CRS.Simple;

  const map = L.map('map', {
    crs,
    minZoom: -8,
    maxZoom: CONFIG.maxZoom,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    zoomAnimation: false,          // keeps the pin canvas perfectly in step with the tiles
    markerZoomAnimation: false,
    maxBoundsViscosity: 0.9,
    attributionControl: false,
    zoomControl: false
  });
  state.map = map;

  L.control.zoom({ position: 'topright' }).addTo(map);

  if (state.tiles) {
    const t = state.tiles;
    L.tileLayer('./tiles/{z}/{y}/{x}.' + t.ext, {
      tileSize: t.tileSize,
      bounds,
      noWrap: true,
      minZoom: -20,                       // Leaflet hides tile layers below zoom 0 by default
      maxZoom: CONFIG.maxZoom,
      minNativeZoom: -t.maxLevel,         // most zoomed-out pyramid level
      maxNativeZoom: 0,                   // full resolution: 1 map unit = 1 image pixel
      zoomOffset: t.maxLevel,             // Leaflet zoom -> pyramid level folder
      keepBuffer: 2,
      updateWhenZooming: false,
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
    }).addTo(map);
  } else {
    L.imageOverlay('./hyrule_map.png', bounds).addTo(map);
  }

  map.fitBounds(bounds, { animate: false });
  map.setMinZoom(map.getBoundsZoom(bounds, false) - 1);
  map.setMaxBounds(bounds.pad(0.25));

  if (state.view && bounds.contains([state.view.lat, state.view.lng])) {
    map.setView([state.view.lat, state.view.lng], state.view.zoom, { animate: false });
  }

  state.pins = new PinLayer().addTo(map);

  // Keep the map correctly sized when the sidebar slides in and out.
  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe($('map'));

  const rememberView = debounce(() => {
    const center = map.getCenter();
    state.view = { lat: center.lat, lng: center.lng, zoom: map.getZoom() };
    savePrefs();
  }, 400);
  map.on('moveend', rememberView);

  map.on('mousemove', (event) => {
    if (!bounds.contains(event.latlng)) {
      dom.readout.textContent = '';
      return;
    }
    let text = 'x ' + Math.round(event.latlng.lng) + '   y ' + Math.round(height - event.latlng.lat) + ' px';
    if (CONFIG.coordinateMode === 'geo' || CONFIG.coordinateMode === 'mercator') {
      const geo = toGeo(event.latlng);
      text += '   lng ' + geo.lng.toFixed(4) + '   lat ' + geo.lat.toFixed(4);
    }
    dom.readout.textContent = text;
  });
  map.on('mouseout', () => { dom.readout.textContent = ''; });
}

/* --------------------------------------------------------------------------
   Overlay helpers
   -------------------------------------------------------------------------- */
function hideOverlay() {
  dom.overlay.hidden = true;
}

function showError(error) {
  console.error(error);
  dom.overlay.hidden = false;
  dom.overlay.classList.add('is-error');
  dom.overlayTitle.textContent = 'The map could not be opened';
  dom.overlayMessage.textContent = error && error.message ? error.message : String(error);
}

/* --------------------------------------------------------------------------
   Startup
   -------------------------------------------------------------------------- */
async function init() {
  loadSavedState();
  applySidebarState();

  try {
    const [tilesResult, raw] = await Promise.all([loadTilesMeta(), loadMapData()]);
    const tiles = tilesResult.meta;
    state.tiles = tiles;
    if (tiles) {
      state.size = { width: tiles.width, height: tiles.height };
    } else {
      try {
        state.size = await loadImageSize(CONFIG.mapImage);
      } catch (error) {
        error.message += ' Tile data was not used: ' + tilesResult.reason;
        throw error;
      }
    }

    // Shipped builds always use the built-in alignment (CONFIG.geo): no tool, no saved override,
    // so nobody can shift the pins by accident.
    state.dev = await loadDevFlag();
    if (!state.dev) state.geo = { ...CONFIG.geo };
    const version = await loadAppVersion();
    if (dom.appVersion) dom.appVersion.textContent = version ? 'Version ' + version + (state.dev ? ' (developer run)' : '') : '';
    dom.calibrateBtn.hidden = !state.dev;
    if (dom.calibrateHint) dom.calibrateHint.hidden = !state.dev;

    buildMap();
    ingest(raw);
    await resolveCategoryImages();
    renderCategoryList();
    wireControls();
    refreshProgress();
    applyFilters();
    hideOverlay();
  } catch (error) {
    wireControls();
    showError(error);
  }
}

init();
