const { ipcMain, desktopCapturer, screen } = require('electron')
const { 
  createRemoteWindow, 
  getMainWindow, 
  getRemoteWindow,
  minimizeMainWindow,
  maximizeMainWindow,
  closeMainWindow,
  showMainWindow,
  createTray
} = require('./window-manager')
const inputHandler = require('./input-handler')
const {
  getLocalIps,
  startDirectServerImpl,
  stopDirectServerImpl,
  connectDirectClientImpl,
  sendDirectMessageImpl,
  closeDirectConnectionImpl,
  initLogger: initDirectServerLogger,
  cleanup: cleanupDirectServer
} = require('./direct-server')
const signalingServer = require('./signaling-server')
const authManager = require('./auth-manager')

let deviceId = null
let remoteStreamInfo = null
let logger = null

function generateDeviceId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase()
}

function log(level, message, data) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](message, data)
  } else if (level === 'error') {
    console.error(`[IPC Error] ${message}`, data || '')
  }
}

function safeIpcHandler(handler, handlerName) {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      log('error', `${handlerName}`, { error: error.message })
      throw error
    }
  }
}

function init(deviceIdParam, loggerParam) {
  deviceId = deviceIdParam
  logger = loggerParam
  
  inputHandler.initLogger(logger)
  initDirectServerLogger(logger)
  
  log('info', 'IPC 处理器初始化', { deviceId })
  
  signalingServer.init(deviceId, logger)
  createTray()
  
  ipcMain.handle('get-device-id', safeIpcHandler(() => deviceId, 'get-device-id'))

  ipcMain.handle('get-sources', safeIpcHandler(async () => {
    log('info', '正在获取屏幕源...')
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 240 },
      fetchWindowIcons: true
    })
    
    log('info', `找到 ${sources.length} 个屏幕源`)
    
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }))
  }, 'get-sources'))

  ipcMain.handle('open-remote-window', safeIpcHandler(() => {
    log('info', '打开远程控制窗口')
    createRemoteWindow()
    return true
  }, 'open-remote-window'))

  ipcMain.handle('get-screen-size', safeIpcHandler(() => {
    const primaryDisplay = screen.getPrimaryDisplay()
    return {
      width: primaryDisplay.size.width,
      height: primaryDisplay.size.height,
      scaleFactor: primaryDisplay.scaleFactor,
      workArea: primaryDisplay.workArea
    }
  }, 'get-screen-size'))

  ipcMain.handle('get-platform', safeIpcHandler(() => ({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node
  }), 'get-platform'))

  ipcMain.handle('set-remote-stream-info', safeIpcHandler((event, info) => {
    remoteStreamInfo = info
    return true
  }, 'set-remote-stream-info'))

  ipcMain.handle('get-remote-stream-info', safeIpcHandler(() => remoteStreamInfo, 'get-remote-stream-info'))

  ipcMain.handle('send-to-remote-window', safeIpcHandler((event, channel, data) => {
    const remoteWindow = getRemoteWindow()
    if (remoteWindow) {
      remoteWindow.webContents.send(channel, data)
      return true
    }
    return false
  }, 'send-to-remote-window'))

  ipcMain.handle('execute-in-remote-window', safeIpcHandler((event, code) => {
    const remoteWindow = getRemoteWindow()
    if (remoteWindow) {
      remoteWindow.webContents.executeJavaScript(code)
      return true
    }
    return false
  }, 'execute-in-remote-window'))

  ipcMain.handle('send-to-main-window', safeIpcHandler((event, channel, data) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send(channel, data)
      return true
    }
    return false
  }, 'send-to-main-window'))

  ipcMain.on('send-signaling-offer', (event, data) => {
    log('debug', '收到远程窗口的 offer，转发到主窗口')
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('send-signaling-offer', data)
    }
  })

  ipcMain.on('send-signaling-answer', (event, data) => {
    log('debug', '收到远程窗口的 answer，转发到主窗口')
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('send-signaling-answer', data)
    }
  })

  ipcMain.on('send-signaling-ice-candidate', (event, data) => {
    log('debug', '收到远程窗口的 ICE candidate，转发到主窗口')
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('send-signaling-ice-candidate', data)
    }
  })

  ipcMain.on('remote-input', (event, inputData) => {
    inputHandler.handleRemoteInput(event, inputData)
  })

  ipcMain.on('remote-window-ready', (event) => {
    log('debug', '收到远程窗口准备就绪信号')
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('remote-window-ready', {})
    }
  })

  ipcMain.handle('reset-input-modifiers', safeIpcHandler(() => {
    inputHandler.resetModifiers()
    return { success: true }
  }, 'reset-input-modifiers'))

  ipcMain.handle('hide-cursor', safeIpcHandler(() => {
    inputHandler.hideCursor()
    return { success: true }
  }, 'hide-cursor'))

  ipcMain.handle('show-cursor', safeIpcHandler(() => {
    inputHandler.showCursor()
    return { success: true }
  }, 'show-cursor'))

  ipcMain.handle('get-local-ips', safeIpcHandler(() => getLocalIps(), 'get-local-ips'))
  
  ipcMain.handle('start-direct-server', safeIpcHandler((event, port) => startDirectServerImpl(port), 'start-direct-server'))
  
  ipcMain.handle('stop-direct-server', safeIpcHandler(() => stopDirectServerImpl(), 'stop-direct-server'))
  
  ipcMain.handle('connect-direct-client', safeIpcHandler((event, params) => connectDirectClientImpl(params.host, params.port), 'connect-direct-client'))
  
  ipcMain.handle('send-direct-message', safeIpcHandler((event, params) => sendDirectMessageImpl(params.clientId, params.message), 'send-direct-message'))
  
  ipcMain.handle('close-direct-connection', safeIpcHandler((event, clientId) => closeDirectConnectionImpl(clientId), 'close-direct-connection'))

  ipcMain.handle('set-connection-password', safeIpcHandler((event, password) => authManager.setPassword(password), 'set-connection-password'))
  
  ipcMain.handle('get-connection-password', safeIpcHandler(() => authManager.getPassword(), 'get-connection-password'))
  
  ipcMain.handle('has-connection-password', safeIpcHandler(() => authManager.hasPassword(), 'has-connection-password'))
  
  ipcMain.handle('clear-connection-password', safeIpcHandler(() => {
    authManager.clearPassword()
    return { success: true }
  }, 'clear-connection-password'))
  
  ipcMain.handle('verify-connection-password', safeIpcHandler((event, password) => authManager.verifyPassword(password), 'verify-connection-password'))
  
  ipcMain.handle('encrypt-data', safeIpcHandler((event, params) => authManager.encrypt(params.data, params.password), 'encrypt-data'))
  
  ipcMain.handle('decrypt-data', safeIpcHandler((event, params) => authManager.decrypt(params.encryptedData, params.password), 'decrypt-data'))

  ipcMain.handle('window-minimize', safeIpcHandler(() => minimizeMainWindow(), 'window-minimize'))

  ipcMain.handle('window-maximize', safeIpcHandler(() => maximizeMainWindow(), 'window-maximize'))

  ipcMain.handle('window-close', safeIpcHandler(() => closeMainWindow(), 'window-close'))

  ipcMain.handle('show-main-window', safeIpcHandler(() => showMainWindow(), 'show-main-window'))

  ipcMain.handle('set-tray-icon', safeIpcHandler(() => ({ success: true }), 'set-tray-icon'))

  ipcMain.handle('connect-signaling-server', safeIpcHandler(async (event, serverUrl) => {
    return await signalingServer.connect(serverUrl)
  }, 'connect-signaling-server'))

  ipcMain.handle('disconnect-signaling-server', safeIpcHandler(() => {
    signalingServer.disconnect()
    return { success: true, message: '已断开连接' }
  }, 'disconnect-signaling-server'))

  ipcMain.handle('send-connect-request', safeIpcHandler((event, toDeviceId) => {
    return signalingServer.sendConnectRequest(toDeviceId)
  }, 'send-connect-request'))

  ipcMain.handle('send-connection-response', safeIpcHandler((event, sessionId, accepted, fromDeviceId, toDeviceId) => {
    return signalingServer.sendConnectionResponse(sessionId, accepted, fromDeviceId, toDeviceId)
  }, 'send-connection-response'))

  ipcMain.handle('send-offer', safeIpcHandler((event, sessionId, offer, toDeviceId) => {
    return signalingServer.sendOffer(sessionId, offer, toDeviceId)
  }, 'send-offer'))

  ipcMain.handle('send-answer', safeIpcHandler((event, sessionId, answer, toDeviceId) => {
    return signalingServer.sendAnswer(sessionId, answer, toDeviceId)
  }, 'send-answer'))

  ipcMain.handle('send-ice-candidate', safeIpcHandler((event, sessionId, candidate, toDeviceId) => {
    return signalingServer.sendIceCandidate(sessionId, candidate, toDeviceId)
  }, 'send-ice-candidate'))

  ipcMain.handle('get-signaling-status', safeIpcHandler(() => signalingServer.getConnectionStatus(), 'get-signaling-status'))

  signalingServer.onIncomingConnection((data) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('incoming-connection', data)
    }
  })

  signalingServer.onConnectionResult((data) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('connection-result', data)
    }
  })

  signalingServer.onOffer((data) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('offer', data)
    }
  })

  signalingServer.onAnswer((data) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('answer', data)
    }
  })

  signalingServer.onIceCandidate((data) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('ice-candidate', data)
    }
  })
}

function cleanup() {
  log('info', '清理 IPC 处理器')
  remoteStreamInfo = null
  inputHandler.cleanup()
  cleanupDirectServer()
  signalingServer.disconnect()
}

module.exports = {
  init,
  generateDeviceId,
  cleanup
}
