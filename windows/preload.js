const { contextBridge, ipcRenderer } = require('electron')

const SEND_CHANNELS = Object.freeze([
  'remote-input',
  'remote-window-ready',
  'send-signaling-offer',
  'send-signaling-answer',
  'send-signaling-ice-candidate'
])

const RECEIVE_CHANNELS = Object.freeze([
  'webrtc-answer',
  'webrtc-ice-candidate',
  'webrtc-offer',
  'signaling-mode-start',
  'signaling-offer',
  'signaling-answer',
  'signaling-ice-candidate',
  'signaling-disconnected',
  'direct-mode-start',
  'direct-incoming-connection',
  'direct-message',
  'direct-connection-closed',
  'remote-window-ready',
  'send-signaling-offer',
  'send-signaling-answer',
  'send-signaling-ice-candidate'
])

const listenerRegistry = new Map()

contextBridge.exposeInMainWorld('electronAPI', {
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  setDeviceId: (id) => ipcRenderer.invoke('set-device-id', id),
  resetDeviceId: () => ipcRenderer.invoke('reset-device-id'),
  validateDeviceId: (id) => ipcRenderer.invoke('validate-device-id', id),
  getSources: () => ipcRenderer.invoke('get-sources'),
  openRemoteWindow: () => ipcRenderer.invoke('open-remote-window'),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  setRemoteStreamInfo: (info) => ipcRenderer.invoke('set-remote-stream-info', info),
  getRemoteStreamInfo: () => ipcRenderer.invoke('get-remote-stream-info'),
  sendToRemoteWindow: (channel, data) => ipcRenderer.invoke('send-to-remote-window', channel, data),
  sendToMainWindow: (channel, data) => ipcRenderer.invoke('send-to-main-window', channel, data),
  executeInRemoteWindow: (code) => ipcRenderer.invoke('execute-in-remote-window', code),
  
  sendSignalingMessage: (channel, data) => {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  
  send: (channel, data) => {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  
  on: (channel, callback) => {
    if (!RECEIVE_CHANNELS.includes(channel)) {
      return
    }
    
    const handler = (event, ...args) => callback(...args)
    
    if (!listenerRegistry.has(channel)) {
      listenerRegistry.set(channel, new Set())
    }
    listenerRegistry.get(channel).add(handler)
    
    ipcRenderer.on(channel, handler)
  },
  
  removeListener: (channel, callback) => {
    const handlers = listenerRegistry.get(channel)
    if (handlers) {
      for (const handler of handlers) {
        if (handler === callback || handler.callback === callback) {
          ipcRenderer.removeListener(channel, handler)
          handlers.delete(handler)
          break
        }
      }
    }
  },
  
  removeAllListeners: (channel) => {
    const handlers = listenerRegistry.get(channel)
    if (handlers) {
      for (const handler of handlers) {
        ipcRenderer.removeListener(channel, handler)
      }
      handlers.clear()
    }
  },
  
  getLocalIps: () => ipcRenderer.invoke('get-local-ips'),
  startDirectServer: (port) => ipcRenderer.invoke('start-direct-server', port),
  stopDirectServer: () => ipcRenderer.invoke('stop-direct-server'),
  connectDirectClient: (host, port) => ipcRenderer.invoke('connect-direct-client', { host, port }),
  sendDirectMessage: (clientId, message) => ipcRenderer.invoke('send-direct-message', { clientId, message }),
  closeDirectConnection: (clientId) => ipcRenderer.invoke('close-direct-connection', clientId),
  
  resetInputModifiers: () => ipcRenderer.invoke('reset-input-modifiers'),
  hideCursor: () => ipcRenderer.invoke('hide-cursor'),
  showCursor: () => ipcRenderer.invoke('show-cursor'),
  
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
