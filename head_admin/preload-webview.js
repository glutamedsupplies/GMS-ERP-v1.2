// Preload script for webview pages
const { ipcRenderer, contextBridge } = require('electron');

// Expose ipcRenderer to window so employees.js can use it
window.ipcRenderer = ipcRenderer;

// Or use contextBridge for safer access (recommended)
contextBridge.exposeInMainWorld('electronAPI', {
  // Invoke: send message and wait for response
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  // Send: fire and forget
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  
  // On: listen for messages
  on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
  
  // Once: listen once
  once: (channel, callback) => ipcRenderer.once(channel, (event, ...args) => callback(...args)),
  
  // Remove listener
  removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback)
});
