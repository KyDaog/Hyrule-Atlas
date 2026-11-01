'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The renderer can only read the bundled map data, and ask for two allow-listed links to be opened.
contextBridge.exposeInMainWorld('hyruleAPI', {
  loadMapData: () => ipcRenderer.invoke('map:load-data'),
  loadTilesMeta: () => ipcRenderer.invoke('map:load-tiles-meta'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  isDev: () => ipcRenderer.invoke('app:is-dev'),
  getVersion: () => ipcRenderer.invoke('app:get-version')
});
