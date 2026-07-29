const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Click-through management for transparent overlay
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),

  // Resize window when chat opens/closes
  resizeWindow: (isOpen, layout) => ipcRenderer.send('resize-window', isOpen, layout),

  // Smooth dragging
  dragStart: (mouseX, mouseY) => ipcRenderer.send('drag-start', mouseX, mouseY),
  dragMove: (mouseX, mouseY) => ipcRenderer.send('drag-move', mouseX, mouseY),

  // Global hotkey listener
  onGlobalHotkey: (callback) => {
    ipcRenderer.on('global-hotkey-triggered', () => callback())
  }
})
