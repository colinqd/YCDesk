const { contextBridge, ipcRenderer } = require('electron')

const SEND_CHANNELS = Object.freeze([
  'remote-input',
  'remote-window-ready',
  'send-signaling-offer',
  'send-signaling-answer',
  'send-signaling-ice-candidate',
  'send-signaling-renegotiate',
  'webrtc-renegotiate',
  'webrtc-signaling',
  'file-transfer:status',
  'file-transfer:requestFile',
  'watchdog-status-response'
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
  'send-signaling-ice-candidate',
  'send-signaling-renegotiate',
  'signaling-renegotiate',
  'watchdog-recover',
  'clipboard-changed',
  'file-transfer:status',
  'file-transfer:requestFile',
  'watchdog-query-status',
  'watchdog-status-response',
  'credProvider:progress',
  'test-unlock-log',
  'service:stateChange',
  'service:state-changed',
  'service:started',
  'service:stopped',
  'service:error',
  'unlock-state-changed',
  'incoming-connection',
  'connection-result',
  'offer',
  'answer',
  'ice-candidate',
  'lock-screen-frame',
  'screen-capture-control',
  'service-frame',
  'remote-reconnect-request',
  'auto-start:trigger-auto-connect',
  'service-mode:signaling-status'
])

const listenerRegistry = new Map()

contextBridge.exposeInMainWorld('electronAPI', {
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  setDeviceId: (id) => ipcRenderer.invoke('set-device-id', id),
  resetDeviceId: () => ipcRenderer.invoke('reset-device-id'),
  validateDeviceId: (id) => ipcRenderer.invoke('validate-device-id', id),
  getSources: () => ipcRenderer.invoke('get-sources'),
  detectWdaProtection: () => ipcRenderer.invoke('detect-wda-protection'),
  tryBypassWda: () => ipcRenderer.invoke('try-bypass-wda'),
  serviceStartCapture: (config) => ipcRenderer.invoke('service:startCapture', config),
  onServiceFrame: (callback) => {
    const handler = (event, data) => callback(data)
    if (!listenerRegistry.has('service-frame')) {
      listenerRegistry.set('service-frame', new Set())
    }
    listenerRegistry.get('service-frame').add(handler)
    ipcRenderer.on('service-frame', handler)
  },
  openRemoteWindow: () => ipcRenderer.invoke('open-remote-window'),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  setRemoteStreamInfo: (info) => ipcRenderer.invoke('set-remote-stream-info', info),
  getRemoteStreamInfo: () => ipcRenderer.invoke('get-remote-stream-info'),
  sendToRemoteWindow: (channel, data) => ipcRenderer.invoke('send-to-remote-window', channel, data),
  sendToMainWindow: (channel, data) => ipcRenderer.invoke('send-to-main-window', channel, data),
  executeInRemoteWindow: undefined,
  
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
      console.warn('[Preload] 拒绝未授权的IPC监听通道:', channel)
      return
    }
    const handler = (event, ...args) => callback(...args)
    handler._callback = callback
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
        if (handler === callback || handler._callback === callback) {
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
  setTrayIcon: (visible) => ipcRenderer.invoke('set-tray-icon', visible),

  // 解锁设置相关
  getUnlockStatus: () => ipcRenderer.invoke('auto-unlock-get-status'),
  saveUnlockPassword: (password) => ipcRenderer.invoke('auto-unlock-save-password', password),
  clearUnlockPassword: () => ipcRenderer.invoke('auto-unlock-clear-password'),
  getUnlockPassword: () => ipcRenderer.invoke('auto-unlock-get-password'),
  
  // Credential Provider 相关
  checkCredProvider: () => ipcRenderer.invoke('credProvider:check'),
  installCredProvider: () => ipcRenderer.invoke('credProvider:install'),
  uninstallCredProvider: () => ipcRenderer.invoke('credProvider:uninstall'),

  // 自启动相关
  getAutoStartStatus: () => ipcRenderer.invoke('auto-start:get-status'),
  setAutoStart: (enabled) => ipcRenderer.invoke('auto-start:set', { enabled }),
  disableAutoStartForService: () => ipcRenderer.invoke('auto-start:disable-for-service'),
  restoreAutoStartAfterService: () => ipcRenderer.invoke('auto-start:restore-after-service'),

  // 自动连接配置相关
  saveAutoConnectConfig: (config) => ipcRenderer.invoke('auto-connect:save', config),
  loadAutoConnectConfig: () => ipcRenderer.invoke('auto-connect:load'),

  // 服务相关
  getServiceStatus: () => ipcRenderer.invoke('service:status'),
  startService: () => ipcRenderer.invoke('service:start'),
  stopService: () => ipcRenderer.invoke('service:stop'),
  restartService: () => ipcRenderer.invoke('service:restart'),
  setServiceMode: (mode) => ipcRenderer.invoke('service:setMode', mode),
  installService: () => ipcRenderer.invoke('service:install'),
  uninstallService: () => ipcRenderer.invoke('service:uninstall'),
  installServiceWithElevation: () => ipcRenderer.invoke('service:installWithElevation'),
  uninstallServiceWithElevation: () => ipcRenderer.invoke('service:uninstallWithElevation'),

  // 服务模式 WebRTC 就绪通知
  notifyServiceWebRTCReady: () => ipcRenderer.invoke('service:notifyWebRTCReady'),
  
  // 解锁测试相关
  testUnlock: (password) => ipcRenderer.invoke('service:testUnlock', password),
  getTestUnlockLog: () => ipcRenderer.invoke('service:getTestUnlockLog'),
  runFullUnlockTest: (password) => ipcRenderer.invoke('service:runFullUnlockTest', password),
  
  // 设备列表管理
  getDeviceList: () => ipcRenderer.invoke('device-list:get'),
  addDevice: (deviceId, alias, serverUrl) => ipcRenderer.invoke('device-list:add', { deviceId, alias, serverUrl }),
  removeDevice: (deviceId) => ipcRenderer.invoke('device-list:remove', { deviceId }),
  updateDeviceAlias: (deviceId, alias) => ipcRenderer.invoke('device-list:update-alias', { deviceId, alias }),
  clearDeviceList: () => ipcRenderer.invoke('device-list:clear'),

  // 信令服务器列表管理
  getSignalingServers: () => ipcRenderer.invoke('signaling-server:get'),
  saveSignalingServers: (servers) => ipcRenderer.invoke('signaling-server:save', servers),
  addSignalingServer: (name, url) => ipcRenderer.invoke('signaling-server:add', { name, url }),
  editSignalingServer: (index, name, url) => ipcRenderer.invoke('signaling-server:edit', { index, name, url }),
  deleteSignalingServer: (index) => ipcRenderer.invoke('signaling-server:delete', { index }),

  // ========== 剪贴板 API ==========
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  clipboardWrite: (data) => ipcRenderer.invoke('clipboard:write', data),
  clipboardStartMonitor: (interval) => ipcRenderer.invoke('clipboard:startMonitor', interval),
  clipboardStopMonitor: () => ipcRenderer.invoke('clipboard:stopMonitor'),

  // ========== 文件传输 API ==========
  fileTransferSelectFiles: () => ipcRenderer.invoke('file-transfer:selectFiles'),
  fileTransferReadChunk: (filePath, offset, size) => ipcRenderer.invoke('file-transfer:readChunk', { filePath, offset, size }),
  fileTransferSaveFile: (options) => ipcRenderer.invoke('file-transfer:saveFile', options),
  fileTransferCreateWriter: (fileId, savePath) => ipcRenderer.invoke('file-transfer:createWriter', { fileId, savePath }),
  fileTransferWriteChunk: (fileId, data, offset) => ipcRenderer.invoke('file-transfer:writeChunk', { fileId, data, offset }),
  fileTransferCloseWriter: (fileId, expectedSize) => ipcRenderer.invoke('file-transfer:closeWriter', { fileId, expectedSize }),
  fileTransferVerifyFile: (filePath, expectedSize) => ipcRenderer.invoke('file-transfer:verifyFile', { filePath, expectedSize }),
  fileTransferGetSaveDir: () => ipcRenderer.invoke('file-transfer:getSaveDir'),
  fileTransferShowInFolder: (filePath) => ipcRenderer.invoke('file-transfer:showInFolder', filePath)
})
