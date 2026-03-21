const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  getSources: () => ipcRenderer.invoke('get-sources'),
  openRemoteWindow: () => ipcRenderer.invoke('open-remote-window'),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  setRemoteStreamInfo: (info) => ipcRenderer.invoke('set-remote-stream-info', info),
  getRemoteStreamInfo: () => ipcRenderer.invoke('get-remote-stream-info'),
  sendToRemoteWindow: (channel, data) => ipcRenderer.invoke('send-to-remote-window', channel, data),
  sendToMainWindow: (channel, data) => ipcRenderer.invoke('send-to-main-window', channel, data),
  
  send: (channel, data) => {
    const validChannels = ['toMain', 'fromMain', 'remote-input']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  
  on: (channel, callback) => {
    const validChannels = ['toMain', 'fromMain', 'remote-stream']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args))
    }
  },
  
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  }
})

console.log('YCDesk Preload 脚本已加载')
