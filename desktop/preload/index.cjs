'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  getTtsConfig: () => ipcRenderer.invoke('desktop:get-tts-config'),
  setTtsConfig: (payload) => ipcRenderer.invoke('desktop:set-tts-config', payload),
  detectJianying: () => ipcRenderer.invoke('desktop:detect-jianying'),
  chooseMaterialDir: () => ipcRenderer.invoke('desktop:choose-material-dir'),
  setMaterialRoot: (materialRoot) => ipcRenderer.invoke('desktop:set-material-root', materialRoot),
  openPath: (p) => ipcRenderer.invoke('desktop:open-path', p)
});
