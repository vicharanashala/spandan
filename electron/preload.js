const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => process.versions.electron,
  showNotification: (payload) => ipcRenderer.invoke('notification:show', payload),
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options)
});

contextBridge.exposeInMainWorld('isDesktopApp', true);
