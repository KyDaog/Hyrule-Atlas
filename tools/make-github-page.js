'use strict';

/* ==========================================================================
   Builds the GitHub page for Hyrule Atlas: README.md, LICENSE, RELEASE_NOTES.md
   and .gitignore, written to the project folder. Numbers (version, marker
   counts, categories) are read from package.json, categories.js and
   map_data.json, so they are always correct.

   Usage (from the project folder):
     npm run github
     node tools/make-github-page.js

   Screenshots: put PNG/JPG files in  docs/screenshots/  and run it again.
   They are listed in the README gallery in alphabetical order. The first
   file named "hero" (for example hero.png) is shown at the top of the page.
   Use names like 01-overview.png, 02-legend.png to control the order.

   Settings you may want to change are in the SETTINGS block below.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ------------------------------- SETTINGS ------------------------------- */
const SETTINGS = {
  githubUser: 'KyDaog',
  repoName: 'hyrule-atlas',
  youtube: 'https://www.youtube.com/kydaog',
  discord: 'https://discord.gg/gEWnBUtMrx',
  tagline: 'A completely offline, interactive Breath of the Wild map and 100% completion tracker for Windows. No internet, no account, no subscription.',
  screenshotsDir: 'docs/screenshots'
};
/* ------------------------------------------------------------------------ */

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const year = new Date().getFullYear();
const repoUrl = 'https://github.com/' + SETTINGS.githubUser + '/' + SETTINGS.repoName;
const installerName = 'Hyrule-Atlas-Setup-' + version + '.exe';
const portableName = 'Hyrule-Atlas-Portable-' + version + '.zip';

function loadCatalog() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'categories.js'), 'utf8'), sandbox);
  return sandbox.window.HYRULE_CATALOG;
}

function gatherStats() {
  const catalog = loadCatalog();
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'map_data.json'), 'utf8'));
  const counts = {};
  let placed = 0;
  for (const loc of data.locations) {
    const route = catalog.ids[loc.category_id];
    if (!route) continue;
    const key = typeof route === 'string' ? route : route.to;
    counts[key] = (counts[key] || 0) + 1;
    placed++;
  }
  const cats = Object.keys(catalog.categories);
  const groups = catalog.groups.filter((g) => !g.flat).map((g) => g.name);
  return {
    markers: placed,
    categories: cats.length,
    groups,
    counts,
    catalog,
    shrines: counts['shrine'] || 0,
    koroks: counts['korok-seed'] || 0
  };
}

const n = (x) => x.toLocaleString('en-US');

function screenshotSection() {
  const dir = path.join(ROOT, SETTINGS.screenshotsDir);
  if (!fs.existsSync(dir)) return { hero: '', gallery: '', count: 0 };
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)).sort();
  const heroFile = files.find((f) => /^hero\./i.test(f));
  const rest = files.filter((f) => f !== heroFile);
  const label = (f) => f.replace(/\.[^.]+$/, '').replace(/^\d+[-_ ]*/, '').replace(/[-_]+/g, ' ').trim() || f;
  const img = (f, w) => '<img src="' + SETTINGS.screenshotsDir + '/' + encodeURI(f) + '" alt="' + label(f) + '"' + (w ? ' width="' + w + '"' : '') + '>';
  const hero = heroFile ? '<p align="center">' + img(heroFile) + '</p>\n\n' : '';
  let gallery = '';
  if (rest.length) {
    gallery = '## Screenshots\n\n<table>\n';
    for (let i = 0; i < rest.length; i += 2) {
      gallery += '  <tr>\n';
      for (const f of rest.slice(i, i + 2)) {
        gallery += '    <td align="center">' + img(f, 460) + '<br><sub>' + label(f) + '</sub></td>\n';
      }
      gallery += '  </tr>\n';
    }
    gallery += '</table>\n\n';
  }
  return { hero, gallery, count: files.length };
}

function buildReadme(s) {
  const shots = screenshotSection();
  const groupList = s.groups.join(', ') + ', plus Ore Deposits, Materials and Creatures';
  return `<h1 align="center">Hyrule Atlas</h1>

<p align="center"><b>${SETTINGS.tagline}</b></p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-${version}-EACB78?style=flat-square">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows-0A0201?style=flat-square">
  <img alt="offline" src="https://img.shields.io/badge/works-100%25%20offline-EACB78?style=flat-square">
  <img alt="no subscription" src="https://img.shields.io/badge/subscription-none-0A0201?style=flat-square">
  <img alt="license" src="https://img.shields.io/badge/license-free%20for%20personal%20use-0A0201?style=flat-square">
</p>

<p align="center">
  <a href="${repoUrl}/releases/latest"><b>Download</b></a> ·
  <a href="${SETTINGS.youtube}">YouTube</a> ·
  <a href="${SETTINGS.discord}">Discord</a>
</p>

${shots.hero}---

## What is it?

Hyrule Atlas is a standalone desktop map for *The Legend of Zelda: Breath of the Wild*. Everything is bundled inside the app: the map, every marker and every screenshot. Open it on a plane, at a LAN party, or next to your Switch.

## Offline by design

Hyrule Atlas never needs the internet. Not to install it, not to run it, not to update your progress.

- **Everything is hosted locally.** The map tiles, all ${n(s.markers)} markers, every icon and every screenshot ship inside the app. Nothing is loaded from a website.
- **No internet needed at all.** Unplug the cable, turn on airplane mode, it works the same.
- **No subscription, no account, no ads.** Free to use, with nothing to sign up for and nothing to renew.
- **Your saves stay on your machine.** Progress and settings are stored in a local folder on your PC (\`%APPDATA%\\Hyrule Atlas\`). Nothing is uploaded, synced or shared.
- **Progress survives every update.** Install a new release over the old one and your checkmarks, layers and settings are still there. Uninstalling does not delete them either.

## Features

- **${n(s.markers)} markers** across **${s.categories} categories**, including ${n(s.shrines)} shrines and ${n(s.koroks)} Korok Seeds.
- **Fully offline.** Everything is hosted locally, so no internet is ever needed. See [Offline by design](#offline-by-design).
- **Mark as Completed.** Click any marker, tick it off, and it is remembered on your PC between sessions and releases.
- **100% Completion preset.** One click shows only what the in-game completion counter tracks: shrines, Korok Seeds, Divine Beasts and landmarks.
- **Organised layer panel** with ${groupList}. Click a name to hide or show it, and expand groups for the detail.
- **Live search** across every marker title.
- **Include DLC & Master Mode** switch for the Champions' Ballad and Master Trials content.
- **Smooth on a big map.** A custom pin layer draws thousands of markers without lag, with pins that scale as you zoom.
- **Region and province names** drawn on the map as gold text, like in the game.
- **Screenshots inside popups** for the puzzle shrines, with click-to-enlarge.
- **Pins line up exactly.** Alignment is built in, with no calibration needed.

${shots.gallery}## Roadmap

- Fill in the remaining puzzle screenshots for shrine and quest popups. This will take a while, because the Ocarina of Time remake is coming first.

Hyrule Atlas is complete and fully usable as it is today.

## Install

1. Open the [latest release](${repoUrl}/releases/latest).
2. Download **${installerName}** and run it.
3. Choose Express or Custom install, and launch **Hyrule Atlas** from the Start menu or desktop.

Prefer no installer? Download **${portableName}**, unzip it anywhere, and run \`Hyrule Atlas.exe\`.

**Updating:** run the newer installer. It replaces the old version in the same folder and keeps your saved progress.

> **Windows SmartScreen:** the installer is not code-signed (certificates cost money), so Windows may show "Windows protected your PC". Click **More info**, then **Run anyway**.

## Where is my progress saved?

Only on your own computer, in \`%APPDATA%\\Hyrule Atlas\`. It is never uploaded anywhere. Updating or uninstalling leaves it in place, so a new release or a reinstall picks up where you stopped. To back it up or move to another PC, copy that folder. Use **Reset progress** in the sidebar to clear it.

## Build from source

Requires [Node.js](https://nodejs.org) 20 or newer.

\`\`\`bash
npm install
npm start            # run the app
npm run dev          # run with developer tools
npm run dist         # build the Windows installer into dist/
npm run dist:all     # installer + portable zip
\`\`\`

Handy tools (run from the project folder):

| Command | What it does |
| --- | --- |
| \`npm run tiles\` | Cuts \`hyrule_map.png\` into map tiles |
| \`npm run icon -- logo.png\` | Makes \`build/icon.ico\` from a picture |
| \`npm run format-data\` | Re-formats \`map_data.json\` into readable lines |
| \`npm run minify\` | Compacts the app code (runs automatically on build) |
| \`npm run github\` | Rebuilds this README, LICENSE and release notes |

The map image and tiles are large and are not stored in the repository. See \`.gitignore\`.

## Made by KyDa

Built by KyDa, in coordination with Claude (an AI assistant made by Anthropic).

- YouTube: ${SETTINGS.youtube}
- Discord: ${SETTINGS.discord}

## Disclaimer

Hyrule Atlas is an unofficial fan project and is not affiliated with or endorsed by Nintendo. *The Legend of Zelda* and *Breath of the Wild*, with their names, characters, maps and artwork, are the property of Nintendo. Marker data is based on community map projects. See [LICENSE](LICENSE) for the terms of use.
`;
}

function buildLicense() {
  return `HYRULE ATLAS - Offline Map and Completion Tracker

Copyright (c) ${year} KyDa. All rights reserved.

Created by KyDa, in coordination with Claude (an AI assistant made by Anthropic).
YouTube: ${SETTINGS.youtube}
Discord: ${SETTINGS.discord}


TERMS OF USE

1. Free of charge. You may install and use Hyrule Atlas for personal,
   non-commercial purposes at no cost.

2. Sharing. You may share unmodified copies of the installer with others free
   of charge, as long as this notice stays with it. You may not sell Hyrule
   Atlas or charge for access to it.

3. Source code. The source code is published so it can be read and so the app
   can be built for personal use. Copying, modifying or redistributing the
   source code, or releasing a derived work, requires written permission
   from KyDa.

4. No warranty. Hyrule Atlas is provided "as is", without warranty of any
   kind. KyDa is not liable for any damage or loss resulting from its use.

5. Not affiliated with Nintendo. Hyrule Atlas is an unofficial fan project.
   The Legend of Zelda and Breath of the Wild, along with their names,
   characters, maps and artwork, are the property of Nintendo. Marker data is
   based on community map projects.
`;
}

function buildReleaseNotes(s) {
  return `# Hyrule Atlas ${version}

An offline, interactive Breath of the Wild map and 100% completion tracker.

## Highlights

- 100% offline: the map, ${n(s.markers)} markers in ${s.categories} categories and every screenshot are built in. No internet, no account, no subscription.
- Mark markers as completed. Your progress is saved only on your PC and is kept through every update.
- 100% Completion preset, live search and an Include DLC & Master Mode switch.
- Exact pin placement and a smooth, lag-free map.

## Downloads

| File | Use it for |
| --- | --- |
| \`${installerName}\` | Recommended. Installs the app and upgrades older versions in place. |
| \`${portableName}\` | No install. Unzip and run \`Hyrule Atlas.exe\`. |

## Upgrading

Run the new installer over your old one. Your saved progress is kept.

## Coming later

More popup screenshots for puzzle shrines and quests. Everything else is fully working today.

## Heads up

The installer is not code-signed, so Windows SmartScreen may warn you. Click **More info**, then **Run anyway**.

Questions or feedback? Join the Discord: ${SETTINGS.discord}
`;
}

function buildGitignore() {
  return `# dependencies and build output
node_modules/
dist/
release/

# big map files (host these on the release page instead)
hyrule_map.png
hyrule_map_preview.jpg
tiles/

# generated archives
*.zip
*.asar

# OS / editor
.DS_Store
Thumbs.db
*.log
`;
}

function write(name, text) {
  fs.writeFileSync(path.join(ROOT, name), text);
  console.log('  wrote ' + name.padEnd(18) + text.length.toString().padStart(6) + ' bytes');
}

function main() {
  const s = gatherStats();
  console.log('Hyrule Atlas ' + version + ': ' + n(s.markers) + ' markers, ' + s.categories + ' categories, ' +
    n(s.shrines) + ' shrines, ' + n(s.koroks) + ' Korok Seeds');
  write('README.md', buildReadme(s));
  write('LICENSE', buildLicense());
  write('RELEASE_NOTES.md', buildReleaseNotes(s));
  if (!fs.existsSync(path.join(ROOT, '.gitignore'))) write('.gitignore', buildGitignore());
  else console.log('  kept existing .gitignore');
  const shots = screenshotSection().count;
  console.log(shots ? '  ' + shots + ' screenshot(s) included' : '  no screenshots yet: add PNGs to ' + SETTINGS.screenshotsDir + ' and run again');
}

main();
