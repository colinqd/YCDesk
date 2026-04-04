const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('serverAPI', {
  startServer: (options) => ipcRenderer.invoke('start-server', options),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  selectCertFile: () => ipcRenderer.invoke('select-cert-file'),
  selectKeyFile: () => ipcRenderer.invoke('select-key-file'),
  onServerLog: (callback) => ipcRenderer.on('server-log', (event, data) => callback(data)),
  onServerStarted: (callback) => ipcRenderer.on('server-started', () => callback()),
  onServerStopped: (callback) => ipcRenderer.on('server-stopped', () => callback())
})
