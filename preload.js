const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  getSources: () => ipcRenderer.invoke('get-sources'),
  openRemoteWindow: () => ipcRenderer.invoke('open-remote-window'),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  send: (channel, data) => {
    const validChannels = ['toMain', 'fromMain']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  
  on: (channel, callback) => {
    const validChannels = ['toMain', 'fromMain']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args))
    }
  },
  
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  }
})

console.log('YCDesk Preload 脚本已加载')
