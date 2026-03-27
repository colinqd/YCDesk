const { ipcMain, desktopCapturer, screen } = require('electron')
const { createRemoteWindow, getMainWindow, getRemoteWindow } = require('./window-manager')
const { handleRemoteInput } = require('./input-handler')
const {
  getLocalIps,
  startDirectServer,
  stopDirectServer,
  connectDirectClient,
  sendDirectMessage,
  closeDirectConnection
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
  return async (...args) => {
    try {
      return await handler(...args)
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
  
  // 初始化信令服务器
  signalingServer.init(deviceId, logger)
  
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
    const remoteWindow = getRemoteWindow()
    if (!remoteWindow) {
      createRemoteWindow()
    } else {
      remoteWindow.focus()
    }
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

  ipcMain.handle('get-local-ips', safeIpcHandler(getLocalIps, 'get-local-ips'))
  ipcMain.handle('start-direct-server', safeIpcHandler(startDirectServer, 'start-direct-server'))
  ipcMain.handle('stop-direct-server', safeIpcHandler(stopDirectServer, 'stop-direct-server'))
  ipcMain.handle('connect-direct-client', safeIpcHandler(connectDirectClient, 'connect-direct-client'))
  ipcMain.handle('send-direct-message', safeIpcHandler(sendDirectMessage, 'send-direct-message'))
  ipcMain.handle('close-direct-connection', safeIpcHandler(closeDirectConnection, 'close-direct-connection'))

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
  
  ipcMain.handle('encrypt-data', safeIpcHandler((event, data, password) => {
    return authManager.encrypt(data, password)
  }, 'encrypt-data'))
  
  ipcMain.handle('decrypt-data', safeIpcHandler((event, encryptedData, password) => {
    return authManager.decrypt(encryptedData, password)
  }, 'decrypt-data'))

  // 信令服务器相关
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

  // 信令服务器事件监听
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
