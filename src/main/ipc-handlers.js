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
const { handleRemoteInput, resetModifiers } = require('./input-handler')
const {
  getLocalIps,
  startDirectServerImpl,
  stopDirectServerImpl,
  connectDirectClientImpl,
  sendDirectMessageImpl,
  closeDirectConnectionImpl
} = require('./direct-server')
const signalingServer = require('./signaling-server')
const authManager = require('./auth-manager')

let deviceId = null
let remoteStreamInfo = null
let logger = null

function generateDeviceId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase()
}

function safeIpcHandler(handler, handlerName) {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      if (logger) {
        logger.error(`[IPC Error] ${handlerName}`, { error: error.message })
      } else {
        console.error(`[IPC Error] ${handlerName}:`, error)
      }
      throw error
    }
  }
}

function init(deviceIdParam, loggerParam) {
  deviceId = deviceIdParam
  logger = loggerParam
  
  if (logger) {
    logger.info('IPC 处理器初始化', { deviceId })
  } else {
    console.log('IPC 处理器初始化，设备ID:', deviceId)
  }
  
  signalingServer.init(deviceId, logger)
  createTray()
  
  ipcMain.handle('get-device-id', safeIpcHandler(() => {
    return deviceId
  }, 'get-device-id'))

  ipcMain.handle('get-sources', safeIpcHandler(async () => {
    if (logger) {
      logger.info('正在获取屏幕源...')
    } else {
      console.log('正在获取屏幕源...')
    }
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: {
        width: 320,
        height: 240
      },
      fetchWindowIcons: true
    })
    
    if (logger) {
      logger.info(`找到 ${sources.length} 个屏幕源`)
    } else {
      console.log(`找到 ${sources.length} 个屏幕源`)
    }
    
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }))
  }, 'get-sources'))

  ipcMain.handle('open-remote-window', safeIpcHandler(() => {
    console.log('打开远程控制窗口')
    createRemoteWindow()
    return true
  }, 'open-remote-window'))

  ipcMain.handle('get-screen-size', safeIpcHandler(() => {
    const primaryDisplay = screen.getPrimaryDisplay()
    const result = {
      width: primaryDisplay.size.width,
      height: primaryDisplay.size.height,
      scaleFactor: primaryDisplay.scaleFactor,
      workArea: primaryDisplay.workArea
    }
    console.log('屏幕尺寸:', result)
    return result
  }, 'get-screen-size'))

  ipcMain.handle('get-platform', safeIpcHandler(() => {
    return {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node
    }
  }, 'get-platform'))

  ipcMain.handle('set-remote-stream-info', safeIpcHandler((event, info) => {
    remoteStreamInfo = info
    console.log('设置远程流信息:', info)
    return true
  }, 'set-remote-stream-info'))

  ipcMain.handle('get-remote-stream-info', safeIpcHandler(() => {
    console.log('获取远程流信息:', remoteStreamInfo)
    return remoteStreamInfo
  }, 'get-remote-stream-info'))

  ipcMain.handle('send-to-remote-window', safeIpcHandler((event, channel, data) => {
    const remoteWindow = getRemoteWindow()
    if (remoteWindow) {
      remoteWindow.webContents.send(channel, data)
      return true
    }
    console.warn('远程窗口不存在，无法发送消息')
    return false
  }, 'send-to-remote-window'))

  ipcMain.handle('execute-in-remote-window', safeIpcHandler((event, code) => {
    const remoteWindow = getRemoteWindow()
    if (remoteWindow) {
      remoteWindow.webContents.executeJavaScript(code)
      return true
    }
    console.warn('远程窗口不存在，无法执行代码')
    return false
  }, 'execute-in-remote-window'))

  ipcMain.handle('send-to-main-window', safeIpcHandler((event, channel, data) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send(channel, data)
      return true
    }
    console.warn('主窗口不存在，无法发送消息')
    return false
  }, 'send-to-main-window'))

  ipcMain.on('remote-input', (event, inputData) => {
    try {
      handleRemoteInput(event, inputData)
    } catch (error) {
      console.error('[IPC Error] remote-input:', error)
    }
  })

  ipcMain.handle('reset-input-modifiers', safeIpcHandler(() => {
    resetModifiers()
    logger?.info('已重置输入修饰键状态')
    return { success: true }
  }, 'reset-input-modifiers'))

  ipcMain.handle('get-local-ips', safeIpcHandler(() => {
    return getLocalIps()
  }, 'get-local-ips'))
  
  ipcMain.handle('start-direct-server', safeIpcHandler((event, port) => {
    return startDirectServerImpl(port)
  }, 'start-direct-server'))
  
  ipcMain.handle('stop-direct-server', safeIpcHandler(() => {
    return stopDirectServerImpl()
  }, 'stop-direct-server'))
  
  ipcMain.handle('connect-direct-client', safeIpcHandler((event, params) => {
    return connectDirectClientImpl(params.host, params.port)
  }, 'connect-direct-client'))
  
  ipcMain.handle('send-direct-message', safeIpcHandler((event, params) => {
    return sendDirectMessageImpl(params.clientId, params.message)
  }, 'send-direct-message'))
  
  ipcMain.handle('close-direct-connection', safeIpcHandler((event, clientId) => {
    return closeDirectConnectionImpl(clientId)
  }, 'close-direct-connection'))

  ipcMain.handle('set-connection-password', safeIpcHandler((event, password) => {
    return authManager.setPassword(password)
  }, 'set-connection-password'))
  
  ipcMain.handle('get-connection-password', safeIpcHandler(() => {
    return authManager.getPassword()
  }, 'get-connection-password'))
  
  ipcMain.handle('has-connection-password', safeIpcHandler(() => {
    return authManager.hasPassword()
  }, 'has-connection-password'))
  
  ipcMain.handle('clear-connection-password', safeIpcHandler(() => {
    authManager.clearPassword()
    return { success: true }
  }, 'clear-connection-password'))
  
  ipcMain.handle('verify-connection-password', safeIpcHandler((event, password) => {
    return authManager.verifyPassword(password)
  }, 'verify-connection-password'))
  
  ipcMain.handle('encrypt-data', safeIpcHandler((event, params) => {
    return authManager.encrypt(params.data, params.password)
  }, 'encrypt-data'))
  
  ipcMain.handle('decrypt-data', safeIpcHandler((event, params) => {
    return authManager.decrypt(params.encryptedData, params.password)
  }, 'decrypt-data'))

  ipcMain.handle('window-minimize', safeIpcHandler(() => {
    return minimizeMainWindow()
  }, 'window-minimize'))

  ipcMain.handle('window-maximize', safeIpcHandler(() => {
    return maximizeMainWindow()
  }, 'window-maximize'))

  ipcMain.handle('window-close', safeIpcHandler(() => {
    return closeMainWindow()
  }, 'window-close'))

  ipcMain.handle('show-main-window', safeIpcHandler(() => {
    return showMainWindow()
  }, 'show-main-window'))

  ipcMain.handle('set-tray-icon', safeIpcHandler((event, visible) => {
    return { success: true }
  }, 'set-tray-icon'))

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

  ipcMain.handle('get-signaling-status', safeIpcHandler(() => {
    return signalingServer.getConnectionStatus()
  }, 'get-signaling-status'))

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

module.exports = {
  init,
  generateDeviceId
}
