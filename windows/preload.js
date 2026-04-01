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
  executeInRemoteWindow: (code) => ipcRenderer.invoke('execute-in-remote-window', code),
  
  // 远程窗口发送信令消息到主窗口
  sendSignalingMessage: (channel, data) => {
    const validChannels = [
      'send-signaling-offer', 'send-signaling-answer', 'send-signaling-ice-candidate'
    ]
    if (validChannels.includes(channel)) {
      console.log('[Preload] sendSignalingMessage 发送消息:', channel, JSON.stringify(data).substring(0, 200))
      ipcRenderer.send(channel, data)
      console.log('[Preload] sendSignalingMessage 发送完成')
    } else {
      console.log('[Preload] sendSignalingMessage 无效通道:', channel)
    }
  },
  
  send: (channel, data) => {
    const validChannels = [
      'toMain', 'fromMain', 'remote-input',
      'send-signaling-offer', 'send-signaling-answer', 'send-signaling-ice-candidate',
      'remote-window-ready'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  
  on: (channel, callback) => {
    const validChannels = [
      'toMain', 'fromMain', 'remote-stream', 
      'direct-incoming-connection', 'direct-message', 'direct-connection-closed', 
      'webrtc-answer', 'webrtc-ice-candidate', 'webrtc-offer',
      'signaling-mode-start', 'signaling-offer', 'signaling-answer', 
      'signaling-ice-candidate', 'signaling-disconnected',
      'direct-mode-start',
      'remote-window-ready',
      'send-signaling-offer', 'send-signaling-answer', 'send-signaling-ice-candidate'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => {
        console.log('[Preload] Received IPC event:', channel)
        callback(...args)
      })
    } else {
      console.log('[Preload] Invalid channel:', channel)
    }
  },
  
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
  
  getLocalIps: () => ipcRenderer.invoke('get-local-ips'),
  startDirectServer: (port) => ipcRenderer.invoke('start-direct-server', port),
  stopDirectServer: () => ipcRenderer.invoke('stop-direct-server'),
  connectDirectClient: (host, port) => ipcRenderer.invoke('connect-direct-client', { host, port }),
  sendDirectMessage: (clientId, message) => ipcRenderer.invoke('send-direct-message', { clientId, message }),
  closeDirectConnection: (clientId) => ipcRenderer.invoke('close-direct-connection', clientId),
  
  resetInputModifiers: () => ipcRenderer.invoke('reset-input-modifiers'),
  
  setConnectionPassword: (password) => ipcRenderer.invoke('set-connection-password', password),
  getConnectionPassword: () => ipcRenderer.invoke('get-connection-password'),
  hasConnectionPassword: () => ipcRenderer.invoke('has-connection-password'),
  clearConnectionPassword: () => ipcRenderer.invoke('clear-connection-password'),
  verifyConnectionPassword: (password) => ipcRenderer.invoke('verify-connection-password', password),
  encryptData: (data, password) => ipcRenderer.invoke('encrypt-data', { data, password }),
  decryptData: (encryptedData, password) => ipcRenderer.invoke('decrypt-data', { encryptedData, password }),
  
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  setTrayIcon: (visible) => ipcRenderer.invoke('set-tray-icon', visible)
})

console.log('YCDesk Preload 脚本已加载')
