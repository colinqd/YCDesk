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
const { getDeviceListManager } = require('./device-list-manager')
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
const path = require('path')
const fs = require('fs')
const os = require('os')

let deviceId = null
let remoteStreamInfo = null
let logger = null
const deviceIdFilePath = path.join(os.homedir(), '.ycdesk_device_id')

function generateDeviceId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = ''
  for (let i = 0; i < 9; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id.toUpperCase()
}

function validateDeviceId(id) {
  if (!id || typeof id !== 'string') {
    return { valid: false, message: '设备ID不能为空' }
  }
  const trimmedId = id.trim()
  if (trimmedId.length < 6 || trimmedId.length > 16) {
    return { valid: false, message: '设备ID长度必须在6-16个字符之间' }
  }
  const allowedChars = /^[a-zA-Z0-9]+$/
  if (!allowedChars.test(trimmedId)) {
    return { valid: false, message: '设备ID只能包含字母和数字' }
  }
  return { valid: true, message: '设备ID格式正确' }
}

function loadDeviceId() {
  try {
    if (fs.existsSync(deviceIdFilePath)) {
      const storedId = fs.readFileSync(deviceIdFilePath, 'utf8').trim()
      const validation = validateDeviceId(storedId)
      if (validation.valid) {
        return storedId.toUpperCase()
      }
    }
  } catch (e) {
    console.error('读取设备ID失败:', e)
  }
  const newId = generateDeviceId()
  saveDeviceId(newId)
  return newId
}

function saveDeviceId(id) {
  const validation = validateDeviceId(id)
  if (!validation.valid) {
    throw new Error(validation.message)
  }
  try {
    fs.writeFileSync(deviceIdFilePath, id.trim().toUpperCase(), 'utf8')
    return true
  } catch (e) {
    console.error('保存设备ID失败:', e)
    throw new Error('保存设备ID失败')
  }
}

function resetDeviceId() {
  const newId = generateDeviceId()
  saveDeviceId(newId)
  return newId
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

  ipcMain.handle('set-device-id', safeIpcHandler((event, id) => {
    saveDeviceId(id)
    deviceId = id.trim().toUpperCase()
    signalingServer.updateDeviceId(deviceId)
    log('info', '设备ID已更新', { deviceId })
    return { success: true, deviceId }
  }, 'set-device-id'))

  ipcMain.handle('reset-device-id', safeIpcHandler(() => {
    deviceId = resetDeviceId()
    signalingServer.updateDeviceId(deviceId)
    log('info', '设备ID已重置', { deviceId })
    return { success: true, deviceId }
  }, 'reset-device-id'))

  ipcMain.handle('validate-device-id', safeIpcHandler((event, id) => {
    return validateDeviceId(id)
  }, 'validate-device-id'))

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
    log('debug', '收到远程输入', { type: inputData?.type, inputType: inputData?.inputType })
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

  ipcMain.handle('get-local-ips', safeIpcHandler(() => getLocalIps(), 'get-local-ips'))
  
  ipcMain.handle('start-direct-server', safeIpcHandler((event, port) => startDirectServerImpl(port), 'start-direct-server'))
  
  ipcMain.handle('stop-direct-server', safeIpcHandler(() => stopDirectServerImpl(), 'stop-direct-server'))
  
  ipcMain.handle('connect-direct-client', safeIpcHandler((event, params) => connectDirectClientImpl(params.host, params.port), 'connect-direct-client'))
  
  ipcMain.handle('send-direct-message', safeIpcHandler((event, params) => sendDirectMessageImpl(params.clientId, params.message), 'send-direct-message'))
  
  ipcMain.handle('close-direct-connection', safeIpcHandler((event, clientId) => {
    inputHandler.cleanup()
    return closeDirectConnectionImpl(clientId)
  }, 'close-direct-connection'))

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
    inputHandler.cleanup()
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

  ipcMain.handle('device-list:add', safeIpcHandler((event, deviceId, alias, serverUrl) => {
    const manager = getDeviceListManager({ log: (msg) => log('info', msg) })
    return manager.addDevice(deviceId, alias, serverUrl)
  }, 'device-list:add'))

  ipcMain.handle('device-list:remove', safeIpcHandler((event, deviceId) => {
    const manager = getDeviceListManager({ log: (msg) => log('info', msg) })
    return manager.removeDevice(deviceId)
  }, 'device-list:remove'))

  ipcMain.handle('device-list:get', safeIpcHandler(() => {
    const manager = getDeviceListManager({ log: (msg) => log('info', msg) })
    return manager.getDevices()
  }, 'device-list:get'))

  ipcMain.handle('device-list:updateAlias', safeIpcHandler((event, deviceId, alias) => {
    const manager = getDeviceListManager({ log: (msg) => log('info', msg) })
    return manager.updateDeviceAlias(deviceId, alias)
  }, 'device-list:updateAlias'))

  ipcMain.handle('device-list:clear', safeIpcHandler(() => {
    const manager = getDeviceListManager({ log: (msg) => log('info', msg) })
    return manager.clearDevices()
  }, 'device-list:clear'))

  // 设置日志角色
  ipcMain.on('set-log-role', (event, role) => {
    if (logger && logger.setRole) {
      logger.setRole(role)
      log('info', '日志角色已设置', { role })
    }
  })

  // Linux 锁屏/解锁功能（简化版）
  ipcMain.handle('service:lockScreen', safeIpcHandler(async () => {
    log('info', '[锁屏] 请求锁定屏幕（Linux）')
    try {
      const { execSync } = require('child_process')
      
      let success = false
      let method = ''
      
      // 尝试多种Linux锁屏方式
      const lockCommands = [
        { cmd: 'loginctl lock-session', name: 'loginctl' },
        { cmd: 'gnome-screensaver-command -l', name: 'gnome-screensaver' },
        { cmd: 'xdg-screensaver lock', name: 'xdg-screensaver' },
        { cmd: 'dbus-send --type=method_call --dest=org.gnome.ScreenSaver /org/gnome/ScreenSaver org.gnome.ScreenSaver.Lock', name: 'gnome-dbus' }
      ]
      
      for (const lock of lockCommands) {
        try {
          log('info', `[锁屏] 尝试 ${lock.name}`)
          execSync(lock.cmd, { timeout: 3000 })
          success = true
          method = lock.name
          log('info', `[锁屏] ${lock.name} 调用成功`)
          break
        } catch (e) {
          log('warn', `[锁屏] ${lock.name} 失败: ${e.message}`)
        }
      }
      
      return { success, method }
    } catch (e) {
      log('error', `[锁屏] 失败: ${e.message}`)
      return { success: false, error: e.message }
    }
  }, 'service:lockScreen'))

  ipcMain.handle('service:isScreenLocked', safeIpcHandler(async () => {
    log('info', '[状态检查] 检查屏幕锁定状态（Linux）')
    return { success: true, locked: false } // Linux简化版，暂不支持检测
  }, 'service:isScreenLocked'))
}

module.exports = {
  init,
  loadDeviceId
}
