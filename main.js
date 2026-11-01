'use strict';

const { app, BrowserWindow, Menu, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const isDev = process.argv.includes('--dev');
const MAP_DATA_PATH = path.join(__dirname, 'map_data.json');
const INDEX_PATH = path.join(__dirname, 'index.html');
const TILES_META_PATH = path.join(__dirname, 'tiles', 'meta.json');

let mainWindow = null;

/* --------------------------------------------------------------------------
   Offline guarantee: cancel every request that is not a local resource.
   -------------------------------------------------------------------------- */
const LOCAL_PROTOCOLS = new Set(['file:', 'devtools:', 'data:', 'blob:', 'chrome-extension:']);

function lockDownNetwork() {
  const ses = session.defaultSession;

  ses.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      allowed = LOCAL_PROTOCOLS.has(new URL(details.url).protocol);
    } catch {
      allowed = false;
    }
    callback({ cancel: !allowed });
  });

  // Deny camera, geolocation, notifications, etc.
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
}

/* --------------------------------------------------------------------------
   Window
   -------------------------------------------------------------------------- */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: '#0e141b',
    title: 'Hyrule Atlas',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
      devTools: isDev
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Never open new windows or navigate away from the local page.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  // F11 toggles fullscreen (there is no menu bar to do it for us).
  // In dev mode (npm run dev), F12 or Ctrl+Shift+I opens the developer tools.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    } else if (isDev && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(INDEX_PATH);
}

/* --------------------------------------------------------------------------
   IPC: the sandboxed renderer cannot read files, so the main process reads
   map_data.json from the app folder and hands back the parsed JSON.
   -------------------------------------------------------------------------- */
ipcMain.handle('map:load-data', async (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { ok: false, error: 'Unauthorized sender.' };
  }
  try {
    const text = await fs.readFile(MAP_DATA_PATH, 'utf8');
    return { ok: true, data: JSON.parse(text.replace(/^\uFEFF/, '')) };
  } catch (error) {
    return { ok: false, error: `Could not read map_data.json: ${error.message}` };
  }
});

// The version shown in the sidebar: it comes from "version" in package.json.
ipcMain.handle('app:get-version', (event) => (mainWindow && event.sender === mainWindow.webContents ? app.getVersion() : ''));

// Developer tools (like the marker alignment tool) are only offered when started with `npm run dev`.
ipcMain.handle('app:is-dev', (event) => Boolean(mainWindow && event.sender === mainWindow.webContents && isDev));

// The only web addresses the app is allowed to open (in the user's default browser).
const EXTERNAL_LINKS = new Set([
  'https://www.youtube.com/kydaog',
  'https://discord.gg/gEWnBUtMrx'
]);

ipcMain.handle('app:open-external', async (event, url) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false };
  if (typeof url !== 'string' || !EXTERNAL_LINKS.has(url)) return { ok: false };
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

// Optional map tiles (created once by `npm run tiles`). Answers { ok: false } when absent.
ipcMain.handle('map:load-tiles-meta', async (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { ok: false, error: 'Unauthorized sender.' };
  }
  try {
    const meta = JSON.parse(await fs.readFile(TILES_META_PATH, 'utf8'));
    const valid =
      Number.isFinite(meta.width) && meta.width > 0 &&
      Number.isFinite(meta.height) && meta.height > 0 &&
      Number.isInteger(meta.tileSize) && meta.tileSize > 0 &&
      Number.isInteger(meta.maxLevel) && meta.maxLevel >= 0 &&
      typeof meta.ext === 'string' && /^[a-z0-9]+$/i.test(meta.ext);
    return valid ? { ok: true, data: meta } : { ok: false, error: 'tiles/meta.json is not valid.' };
  } catch (error) {
    return { ok: false, error: 'could not read ' + TILES_META_PATH + ' (' + (error.code || error.message) + ')' };
  }
});

/* --------------------------------------------------------------------------
   App lifecycle
   -------------------------------------------------------------------------- */
if (!app.requestSingleInstanceLock()) {
  // A second instance would fight the first over the localStorage database.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    lockDownNetwork();

    if (process.platform === 'darwin') {
      // macOS needs a global menu for Cmd+C / Cmd+V / Cmd+Q to work.
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      );
    } else {
      Menu.setApplicationMenu(null);
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Make sure localStorage (completion progress) is written to disk on exit.
  app.on('before-quit', () => {
    session.defaultSession.flushStorageData();
  });
}
