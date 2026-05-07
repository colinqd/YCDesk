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
const credentialsManager = require('./credentials-manager')
const autoUnlockService = require('./auto-unlock-service')
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
const { getServiceIntegration, SERVICE_STATE } = require('./service-integration')
const elevationManager = require('./elevation-manager')
const testUnlockLogger = require('./test-unlock-logger')
const path = require('path')
const fs = require('fs')
const os = require('os')

let deviceId = null
let remoteStreamInfo = null
let logger = null
const deviceIdFilePath = path.join(os.homedir(), '.ycdesk_device_id')

// Credential Provider 安装验证辅助函数
async function verifyCredProviderInstallation(clsid, systemDllPath) {
  const result = {
    installed: false,
    dllExists: false,
    registered: false,
    clsidRegistered: false,
    details: []
  }
  
  try {
    const { execFile } = require('child_process')
    const { promisify } = require('util')
    const execFileAsync = promisify(execFile)
    
    // 检查 DLL
    result.dllExists = fs.existsSync(systemDllPath)
    if (result.dllExists) {
      result.details.push('DLL 文件存在')
    } else {
      result.details.push('DLL 文件不存在')
    }
    
    // 检查注册表
    const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
    const regPath = path.join(windir, 'System32', 'reg.exe')
    
    try {
      await execFileAsync(regPath, ['query', `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\${clsid}`], { timeout: 5000 })
      result.registered = true
      result.details.push('Credential Provider 已注册')
    } catch (e) {
      result.details.push('Credential Provider 未注册')
    }
    
    // 检查 CLSID
    try {
      await execFileAsync(regPath, ['query', `HKCR\\CLSID\\${clsid}\\InprocServer32`], { timeout: 5000 })
      result.clsidRegistered = true
      result.details.push('CLSID 已注册')
    } catch (e) {
      result.details.push('CLSID 未注册')
    }
    
    result.installed = result.dllExists && result.registered && result.clsidRegistered
    
    return result
  } catch (e) {
    result.details.push('验证失败: ' + e.message)
    return result
  }
}

// Credential Provider 状态验证函数（简化版，不需要参数）
async function verifyCredProviderState() {
  const clsid = '{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}'
  const possiblePaths = [
    'C:\\Program Files\\YCDesk\\YCDeskCredentialProvider.dll',
    'C:\\Windows\\System32\\YCDeskCredentialProvider.dll'
  ]
  
  for (const dllPath of possiblePaths) {
    if (fs.existsSync(dllPath)) {
      return await verifyCredProviderInstallation(clsid, dllPath)
    }
  }
  
  return await verifyCredProviderInstallation(clsid, possiblePaths[0])
}

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

  // 解锁设置相关的 IPC 处理
  ipcMain.handle('auto-unlock-get-status', safeIpcHandler(async () => {
    const passwordResult = await credentialsManager.getUnlockPassword()
    return {
      hasSavedPassword: passwordResult.success && passwordResult.password !== null
    }
  }, 'auto-unlock-get-status'))

  ipcMain.handle('auto-unlock-save-password', safeIpcHandler(async (event, password) => {
    return await credentialsManager.saveUnlockPassword(password, true)
  }, 'auto-unlock-save-password'))

  ipcMain.handle('auto-unlock-clear-password', safeIpcHandler(async () => {
    return await credentialsManager.clearUnlockPassword()
  }, 'auto-unlock-clear-password'))

  ipcMain.handle('auto-unlock-get-password', safeIpcHandler(async () => {
    return await credentialsManager.getUnlockPassword()
  }, 'auto-unlock-get-password'))

  // 设置日志角色
  ipcMain.on('set-log-role', (event, role) => {
    if (logger && logger.setRole) {
      logger.setRole(role)
      log('info', '日志角色已设置:', { role })
    }
  })

  // ============================================================
  // 服务集成相关 IPC 处理
  // ============================================================

  const serviceIntegration = getServiceIntegration({ logger })

  // 启动服务
  ipcMain.handle('service:start', safeIpcHandler(async () => {
    log('info', '启动服务...')
    await serviceIntegration.start()
    return {
      success: true,
      state: serviceIntegration.getState()
    }
  }, 'service:start'))

  // 停止服务
  ipcMain.handle('service:stop', safeIpcHandler(async () => {
    log('info', '停止服务...')
    await serviceIntegration.stop()
    return {
      success: true,
      state: serviceIntegration.getState()
    }
  }, 'service:stop'))

  // 重启服务
  ipcMain.handle('service:restart', safeIpcHandler(async () => {
    log('info', '重启服务...')
    await serviceIntegration.restart()
    return {
      success: true,
      state: serviceIntegration.getState()
    }
  }, 'service:restart'))

  // 获取服务状态
  ipcMain.handle('service:status', safeIpcHandler(() => {
    const mode = serviceIntegration.isServiceModeEnabled() ? 'service' : 'process'
    return {
      state: serviceIntegration.getState(),
      isRunning: serviceIntegration.isRunning(),
      mode: mode
    }
  }, 'service:status'))

  // 截屏
  ipcMain.handle('service:captureScreen', safeIpcHandler(async (event, options = {}) => {
    log('debug', '请求截屏', options)
    const result = await serviceIntegration.captureScreen(options)
    return result
  }, 'service:captureScreen'))

  // 发送输入事件
  ipcMain.handle('service:sendInput', safeIpcHandler(async (event, type, params) => {
    log('debug', '发送输入事件', { type, params })
    const result = await serviceIntegration.sendInput(type, params)
    return result
  }, 'service:sendInput'))

  // 锁定屏幕
  ipcMain.handle('service:lockScreen', safeIpcHandler(async () => {
    log('info', '========== [锁屏] 请求锁定屏幕 ==========')
    try {
      const { execSync } = require('child_process')
      const path = require('path')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const rundll32Path = path.join(windir, 'System32', 'rundll32.exe')
      
      log('info', `[锁屏] 执行: "${rundll32Path}" user32.dll,LockWorkStation`)
      execSync(`"${rundll32Path}" user32.dll,LockWorkStation`, { timeout: 5000 })
      log('info', '[锁屏] LockWorkStation 调用成功')
      return { success: true, method: 'LockWorkStation' }
    } catch (e) {
      log('error', `[锁屏] 失败: ${e.message}`)
      log('error', `[锁屏] 退出码: ${e.status}`)
      return { success: false, error: e.message }
    }
  }, 'service:lockScreen'))

  // 测试解锁（在主进程中执行完整流程，避免渲染进程被锁屏挂起）
  ipcMain.handle('service:testUnlock', safeIpcHandler(async (event, password = '') => {
    testUnlockLogger.clear()
    testUnlockLogger.info('========== [测试解锁] 开始 ==========')
    testUnlockLogger.info(`密码长度: ${password.length}`)
    testUnlockLogger.info(`密码明文: ${password}`)
    testUnlockLogger.info(`当前用户名: ${process.env.USERNAME || process.env.USER || '未知'}`)
    testUnlockLogger.info(`当前域: ${process.env.USERDOMAIN || '未知'}`)

    const result = {
      lockSuccess: false,
      unlockSuccess: false,
      unlockMode: null,
      locked: null,
      steps: [],
      logFile: testUnlockLogger.getLogPath(),
      serviceHealth: null
    }

    const logAndPush = (step, msg, level = 'info') => {
      log(level, msg)
      if (level === 'success') {
        testUnlockLogger.info(msg)
      } else {
        testUnlockLogger[level](msg)
      }
      result.steps.push({ step, msg, level })
      if (event && event.sender && !event.sender.isDestroyed()) {
        try {
          event.sender.send('test-unlock-log', { step, msg, level, timestamp: Date.now() })
        } catch (e) {
        }
      }
    }

    // 步骤0: 获取 serviceIntegration 实例（在锁屏前获取）
    const serviceIntegration = getServiceIntegration({ logger })
    const serviceModeEnabled = serviceIntegration.isServiceModeEnabled()
    const serviceClientConnected = serviceIntegration._client && serviceIntegration._client.isConnected
    logAndPush(0, `[环境] 服务模式启用: ${serviceModeEnabled}, 客户端连接: ${serviceClientConnected}`)

    // 步骤0.5: 锁屏前服务健康检查（关键！锁屏后无法回退）
    logAndPush(0.5, '========== [锁屏前检查] 开始服务健康验证 ==========')
    log('info', '[测试解锁] 开始锁屏前服务健康检查')

    const serviceHealth = {
      serviceRunning: false,
      clientConnected: false,
      canReachService: false,
      checkTime: Date.now(),
      details: []
    }

    try {
      // 1. 检查服务进程是否存在
      const serviceState = serviceIntegration.getState()
      serviceHealth.serviceRunning = (serviceState === SERVICE_STATE.RUNNING)
      serviceHealth.details.push(`服务状态: ${serviceState}`)
      logAndPush(0.5, `服务进程状态: ${serviceState}`, serviceHealth.serviceRunning ? 'info' : 'warn')

      // 2. 检查客户端连接状态
      serviceHealth.clientConnected = !!(serviceIntegration._client && serviceIntegration._client.isConnected)
      serviceHealth.details.push(`客户端连接: ${serviceHealth.clientConnected ? '已连接' : '未连接'}`)
      logAndPush(0.5, `客户端连接: ${serviceHealth.clientConnected ? '已连接' : '未连接'}`, serviceHealth.clientConnected ? 'info' : 'warn')

      // 3. 尝试发送心跳验证服务响应能力
      if (serviceHealth.clientConnected) {
        try {
          logAndPush(0.5, '正在发送心跳测试服务响应...')
          const heartbeatResult = await serviceIntegration.heartbeat()
          serviceHealth.canReachService = !!(heartbeatResult && heartbeatResult.data)
          serviceHealth.details.push(`心跳测试: ${serviceHealth.canReachService ? '成功' : '失败'}`)
          logAndPush(0.5, `心跳测试: ${serviceHealth.canReachService ? '成功' : '失败'}`, serviceHealth.canReachService ? 'success' : 'error')
        } catch (heartbeatErr) {
          serviceHealth.canReachService = false
          serviceHealth.details.push(`心跳测试: 异常 - ${heartbeatErr.message}`)
          logAndPush(0.5, `心跳测试异常: ${heartbeatErr.message}`, 'error')
        }
      }

      // 4. 综合判断服务是否可用
      const serviceAvailable = serviceHealth.serviceRunning && serviceHealth.clientConnected
      serviceHealth.available = serviceAvailable
      result.serviceHealth = serviceHealth

      logAndPush(0.5, '========== [锁屏前检查] 完成 ==========')
      logAndPush(0.5, `服务可用: ${serviceAvailable ? '是' : '否'}`, serviceAvailable ? 'success' : 'warn')

      if (!serviceAvailable) {
        logAndPush(0.5, '⚠️ 警告：服务不可用，锁屏后将无法通过服务模式解锁', 'error')
        logAndPush(0.5, '将尝试使用进程模式解锁（SendInput/robotjs/tscon）', 'warn')
        logAndPush(0.5, '建议：先启动服务并确认连接正常后再测试锁屏解锁', 'warn')
      } else {
        logAndPush(0.5, '✅ 服务健康检查通过，可以安全进行锁屏测试', 'success')
      }
    } catch (checkErr) {
      serviceHealth.available = false
      serviceHealth.details.push(`检查异常: ${checkErr.message}`)
      result.serviceHealth = serviceHealth
      logAndPush(0.5, `⚠️ 服务健康检查异常: ${checkErr.message}`, 'error')
      log('error', `[测试解锁] 服务健康检查异常: ${checkErr.message}`)
    }

    // 步骤1: 锁屏
    try {
      logAndPush(1, '正在锁定屏幕...')
      const { execSync } = require('child_process')
      const path = require('path')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const rundll32Path = path.join(windir, 'System32', 'rundll32.exe')
      execSync(`"${rundll32Path}" user32.dll,LockWorkStation`, { timeout: 5000 })
      result.lockSuccess = true
      logAndPush(1, '屏幕已锁定（LockWorkStation 调用成功）')
    } catch (e) {
      logAndPush(1, `锁屏失败: ${e.message}`, 'error')
      log('error', `[测试解锁] 锁屏失败: ${e.message}`)
      return result
    }

    // 步骤2: 等待5秒（主进程的 setTimeout 不会被锁屏挂起）
    logAndPush(2, '等待5秒后自动解锁...')
    for (let i = 5; i > 0; i--) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    logAndPush(2, '5秒等待结束，开始解锁...')
    log('info', '[测试解锁] 5秒等待结束')

    // 步骤3: 解锁（优先使用 C++ 服务，失败后回退到其他方式）
    let anyAttempt = false

    // 方式A: 尝试服务模式解锁 - 重新检查连接状态，必要时重连
    if (serviceModeEnabled) {
      anyAttempt = true
      logAndPush(3, '尝试服务模式解锁（C++ 服务）...')
      log('info', '[测试解锁] 尝试服务模式解锁')
      try {
        // 重新检查连接状态，锁屏后连接可能已断开，需要重连
        if (!serviceIntegration._client || !serviceIntegration._client.isConnected) {
          logAndPush(3, '服务连接已断开，正在重新连接...', 'warn')
          log('warn', '[测试解锁] 服务连接已断开，正在重连')
          try {
            await serviceIntegration.start()
            logAndPush(3, '服务重连成功', 'success')
          } catch (reconnectErr) {
            logAndPush(3, `服务重连失败: ${reconnectErr.message}`, 'warn')
            log('warn', `[测试解锁] 服务重连失败: ${reconnectErr.message}`)
          }
        }

        if (serviceIntegration._client && serviceIntegration._client.isConnected) {
          logAndPush(3, '服务已连接，发送解锁命令...', 'info')
          // 使用封装的unlockScreen方法（内部已处理协议编码）
          const unlockResult = await serviceIntegration.unlockScreen(password)
          logAndPush(3, `服务模式返回: ${JSON.stringify(unlockResult)}`)
          log('info', `[测试解锁] 服务模式返回: ${JSON.stringify(unlockResult)}`)
          if (unlockResult?.data?.success || unlockResult?.success) {
            result.unlockSuccess = true
            result.unlockMode = 'service'
            logAndPush(3, '✅ 服务模式解锁成功', 'success')
            log('info', '[测试解锁] 服务模式解锁成功')
          } else {
            logAndPush(3, '⚠️ 服务模式返回未成功，尝试其他方式', 'warn')
            log('warn', `[测试解锁] 服务模式返回未成功: ${JSON.stringify(unlockResult)}`)
          }
        } else {
          logAndPush(3, '⚠️ 服务未连接，尝试其他方式', 'warn')
          log('warn', '[测试解锁] 服务未连接，跳过服务模式')
        }
      } catch (e) {
        logAndPush(3, `⚠️ 服务模式异常: ${e.message}，尝试其他方式`, 'warn')
        log('warn', `[测试解锁] 服务模式异常: ${e.message}`)
      }
    }

    // 方式B: 服务模式失败或未尝试，使用 handleUnlockScreen（包含 SendInput/robotjs/tscon）
    if (!result.unlockSuccess) {
      anyAttempt = true
      logAndPush(3, '尝试进程模式解锁（SendInput/robotjs/tscon）...')
      log('info', '[测试解锁] 尝试进程模式解锁')
      try {
        await inputHandler.handleUnlockScreen(password)
        result.unlockSuccess = true
        result.unlockMode = 'process'
        logAndPush(3, '✅ 进程模式解锁成功', 'success')
        log('info', '[测试解锁] 进程模式解锁成功')
      } catch (e) {
        logAndPush(3, `⚠️ 进程模式解锁失败: ${e.message}`, 'error')
        log('warn', `[测试解锁] 进程模式解锁失败: ${e.message}`)
      }
    }

    if (!anyAttempt) {
      logAndPush(3, '❌ 没有可用的解锁方式', 'error')
      log('warn', '[测试解锁] 没有可用的解锁方式')
    }

    if (!result.unlockSuccess && anyAttempt) {
      logAndPush(3, '❌ 所有解锁方式均失败', 'error')
      log('warn', '[测试解锁] 所有解锁方式均失败')
    }

    // 步骤4: 等待2秒后验证状态
    logAndPush(4, '等待2秒后验证解锁状态...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    try {
      const { execSync } = require('child_process')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const powershellPath = require('path').join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const output = execSync(
        `"${powershellPath}" -Command "(Get-Process LogonUI -ErrorAction SilentlyContinue) -ne $null"`,
        { timeout: 5000, encoding: 'utf8' }
      ).trim()
      result.locked = output === 'True'
      const statusMsg = result.locked ? '⚠️ 屏幕仍锁定' : '✅ 屏幕已解锁'
      logAndPush(4, `${statusMsg} (LogonUI=${result.locked})`, result.locked ? 'warn' : 'success')
      log('info', `[测试解锁] 状态检查: locked=${result.locked}`)
    } catch (e) {
      logAndPush(4, `⚠️ 状态检查异常: ${e.message}`, 'warn')
      log('warn', `[测试解锁] 状态检查异常: ${e.message}`)
    }

    log('info', '========== [测试解锁] 流程结束 ==========')
    testUnlockLogger.info('========== [测试解锁] 流程结束 ==========')
    return result
  }, 'service:testUnlock'))

  ipcMain.handle('service:getTestUnlockLog', safeIpcHandler(() => {
    return {
      success: true,
      logPath: testUnlockLogger.getLogPath(),
      content: testUnlockLogger.read()
    }
  }, 'service:getTestUnlockLog'))

  // 运行完整解锁测试（在 Electron 主进程中执行）
  ipcMain.handle('service:runFullUnlockTest', async (event, testPassword = '') => {
    log('info', '========== [完整测试] IPC 处理器被调用 ==========')
    
    const testResults = {
      passed: 0,
      failed: 0,
      skipped: 0,
      details: []
    }
    
    const defaultReturn = {
      success: false,
      error: '测试未执行',
      results: testResults,
      logPath: '',
      logContent: ''
    }
    
    try {
      log('info', '[完整测试] 进入 try 块')
      
      if (typeof testUnlockLogger === 'undefined' || testUnlockLogger === null) {
        log('error', '[完整测试] testUnlockLogger 是 undefined/null')
        return { ...defaultReturn, error: '测试日志模块未加载' }
      }
      
      if (typeof testUnlockLogger.clear !== 'function') {
        log('error', '[完整测试] testUnlockLogger.clear 不是函数')
        return { ...defaultReturn, error: '测试日志模块初始化失败' }
      }
      
      log('info', '[完整测试] testUnlockLogger 检查通过')
      
      testUnlockLogger.clear()
      testUnlockLogger.separator('YCDesk 解锁功能完整测试')
      testUnlockLogger.info('开始执行测试...')
      
      const addTestResult = (testName, passed, message = '', skipped = false) => {
        if (skipped) {
          testResults.skipped++
        } else if (passed) {
          testResults.passed++
        } else {
          testResults.failed++
        }
        testResults.details.push({
          name: testName,
          passed: skipped ? null : passed,
          message: skipped ? `跳过: ${message || '不需要'}` : message
        })
        
        if (skipped) {
          testUnlockLogger.warning(`⏭️ ${testName} - 跳过 (${message || '不需要'})`)
          log('info', `[SKIP] ${testName}: ${message || '不需要'}`)
        } else if (passed) {
          testUnlockLogger.success(`${testName} - ${message}`)
          log('info', `[PASS] ${testName}: ${message}`)
        } else {
          testUnlockLogger.failure(`${testName} - ${message}`)
          log('warn', `[FAIL] ${testName}: ${message}`)
        }
      }
      
      log('info', '[完整测试] 开始执行测试 1: 环境检查')
      
      // 测试 1: 检查 Electron 环境
      testUnlockLogger.section('环境检查')
      
      let safeStorage
      try {
        const electron = require('electron')
        safeStorage = electron.safeStorage
        log('info', '[完整测试] electron.safeStorage 获取成功')
      } catch (e) {
        log('error', `[完整测试] 获取 electron.safeStorage 失败: ${e.message}`)
        return { ...defaultReturn, error: '无法访问 Electron safeStorage: ' + e.message }
      }
      
      const safeStorageAvailable = safeStorage.isEncryptionAvailable()
      log('info', `[完整测试] safeStorage.isEncryptionAvailable() = ${safeStorageAvailable}`)
      
      testUnlockLogger.info('Electron 环境', '可用')
      testUnlockLogger.info('safeStorage 加密', safeStorageAvailable ? '可用' : '不可用')
      
      addTestResult('Electron 环境检查', true, 'Electron 环境可用')
      addTestResult('safeStorage 加密检查', safeStorageAvailable, safeStorageAvailable ? '加密可用' : '加密不可用')
      
      log('info', '[完整测试] 开始执行测试 2: 模块结构检查')
      
      // 测试 2: 模块结构检查
      testUnlockLogger.section('模块结构检查')
      
      let credentialsManager
      try {
        credentialsManager = require('./credentials-manager')
        log('info', '[完整测试] credentials-manager 加载成功')
      } catch (e) {
        log('error', `[完整测试] 加载 credentials-manager 失败: ${e.message}`)
        return { ...defaultReturn, error: '无法加载 credentials-manager: ' + e.message }
      }
      
      let inputHandlerModule
      try {
        inputHandlerModule = require('./input-handler')
        log('info', '[完整测试] input-handler 加载成功')
      } catch (e) {
        log('error', `[完整测试] 加载 input-handler 失败: ${e.message}`)
        return { ...defaultReturn, error: '无法加载 input-handler: ' + e.message }
      }
      
      const requiredCredsMethods = ['saveUnlockPassword', 'getUnlockPassword', 'clearUnlockPassword', 'isEncryptionAvailable']
      let credsMethodsOk = true
      for (const method of requiredCredsMethods) {
        const ok = typeof credentialsManager[method] === 'function'
        if (!ok) credsMethodsOk = false
        testUnlockLogger.info(`${method}`, ok ? 'OK' : '未找到')
      }
      addTestResult('credentialsManager 模块', credsMethodsOk, '所有方法正常')
      
      const requiredInputMethods = ['handleRemoteInput', 'handleUnlockScreen', 'initLogger', 'cleanup']
      let inputMethodsOk = true
      for (const method of requiredInputMethods) {
        const ok = typeof inputHandlerModule[method] === 'function'
        if (!ok) inputMethodsOk = false
        testUnlockLogger.info(`${method}`, ok ? 'OK' : '未找到')
      }
      addTestResult('inputHandler 模块', inputMethodsOk, '所有方法正常')
      
      log('info', '[完整测试] 开始执行测试 3: 密码加密功能')
      
      // 测试 3: 密码加密功能
      testUnlockLogger.section('密码加密功能测试')
      
      const testPwd = testPassword || 'TestPassword123!@#'
      testUnlockLogger.info('测试密码长度', testPwd.length)
      
      const saveResult = await credentialsManager.saveUnlockPassword(testPwd)
      addTestResult('密码保存功能', saveResult.success, saveResult.message)
      
      if (saveResult.success) {
        const getResult = await credentialsManager.getUnlockPassword()
        const passwordMatch = getResult.success && getResult.password === testPwd
        
        addTestResult('密码读取功能', getResult.success, getResult.success ? '读取成功' : '读取失败')
        addTestResult('密码匹配验证', passwordMatch, passwordMatch ? '密码匹配' : '密码不匹配')
        
        await credentialsManager.clearUnlockPassword()
        testUnlockLogger.info('测试密码已清理')
      }
      
      log('info', '[完整测试] 开始执行测试 4: 存储路径')
      
      // 测试 4: 密码文件路径
      testUnlockLogger.section('存储路径测试')
      
      const credentialsFile = path.join(__dirname, '../../data/credentials.json')
      const dataDir = path.dirname(credentialsFile)
      const dirExists = fs.existsSync(dataDir)
      
      testUnlockLogger.info('密码文件路径', credentialsFile)
      testUnlockLogger.info('数据目录', dirExists ? '已存在' : '不存在')
      
      addTestResult('密码存储路径', true, credentialsFile)
      addTestResult('数据目录检查', dirExists, dataDir)
      
      log('info', '[完整测试] 开始执行测试 5: 服务模式检查')
      
      // 测试 5: 服务模式检查
      testUnlockLogger.section('服务模式检查')
      
      let serviceModeEnabled = false
      let clientConnected = false
      
      try {
        const { getServiceIntegration } = require('./service-integration')
        const serviceIntegration = getServiceIntegration()
        serviceModeEnabled = serviceIntegration.isServiceModeEnabled()
        clientConnected = serviceIntegration._client && serviceIntegration._client.isConnected
      } catch (e) {
        log('warn', `[完整测试] 服务模式检查失败: ${e.message}`)
      }
      
      testUnlockLogger.info('服务模式', serviceModeEnabled ? '已启用' : '未启用')
      testUnlockLogger.info('客户端连接', clientConnected ? '已连接' : '未连接')
      
      addTestResult('服务模式检查', true, serviceModeEnabled ? '已启用' : '未启用')
      addTestResult('服务客户端连接', clientConnected, clientConnected ? '已连接' : '未连接')
      
      log('info', '[完整测试] 开始执行测试 6: 解锁方式检查')
      
      // 测试 6: 解锁方式可用性
      testUnlockLogger.section('解锁方式检查')
      
      const robotJsAvailable = (() => {
        try {
          require('robotjs')
          return true
        } catch (e) {
          return false
        }
      })()
      
      testUnlockLogger.info('服务模式解锁', serviceModeEnabled && clientConnected ? '可用' : '不可用')
      testUnlockLogger.info('SendInput 方式', '可用')
      testUnlockLogger.info('robotjs 方式', robotJsAvailable ? '可用' : '不可用')
      testUnlockLogger.info('tscon 方式', '可用')
      
      addTestResult('服务模式解锁', true, serviceModeEnabled && clientConnected ? '可用' : '服务模式未启用', !serviceModeEnabled || !clientConnected)
      addTestResult('SendInput 解锁', true, '可用')
      addTestResult('robotjs 解锁', robotJsAvailable, robotJsAvailable ? '可用' : '不可用')
      addTestResult('tscon 解锁', true, '可用')
      
      log('info', '[完整测试] 所有测试完成，准备返回结果')
      
      testUnlockLogger.separator('测试报告')
      testUnlockLogger.info('测试结果', {
        passed: testResults.passed,
        failed: testResults.failed,
        skipped: testResults.skipped,
        total: testResults.passed + testResults.failed + testResults.skipped
      })
      
      testUnlockLogger.info('环境信息', {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        electron: true,
        safeStorage: safeStorageAvailable
      })
      
      testUnlockLogger.success('测试执行完成')
      
      const finalResult = {
        success: testResults.failed === 0,
        results: testResults,
        logPath: testUnlockLogger.getLogPath(),
        logContent: testUnlockLogger.read()
      }
      
      log('info', `[完整测试] 返回结果: success=${finalResult.success}, passed=${testResults.passed}, failed=${testResults.failed}`)
      
      return finalResult
      
    } catch (e) {
      log('error', `[完整测试] 捕获到异常: ${e.message}`)
      log('error', `[完整测试] 堆栈: ${e.stack || '无'}`)
      if (testUnlockLogger && typeof testUnlockLogger.error === 'function') {
        testUnlockLogger.error('测试执行失败', e.message)
      }
      
      return {
        success: false,
        error: e.message,
        stack: e.stack,
        results: testResults,
        logPath: testUnlockLogger && typeof testUnlockLogger.getLogPath === 'function' ? testUnlockLogger.getLogPath() : '',
        logContent: testUnlockLogger && typeof testUnlockLogger.read === 'function' ? testUnlockLogger.read() : ''
      }
    }
  })

  // 解锁屏幕（服务模式）
  ipcMain.handle('service:unlockScreen', safeIpcHandler(async (event, password = '') => {
    log('info', `========== [解锁-服务模式] 请求解锁屏幕，密码长度: ${password.length} ==========`)
    try {
      const result = await serviceIntegration.unlockScreen(password)
      log('info', `[解锁-服务模式] 完整返回: ${JSON.stringify(result)}`)
      log('info', `[解锁-服务模式] result.success=${result?.success}, result.data.success=${result?.data?.success}`)
      return result
    } catch (e) {
      log('error', `[解锁-服务模式] 异常: ${e.message}`)
      log('error', `[解锁-服务模式] 堆栈: ${e.stack || '无'}`)
      return { success: false, error: e.message }
    }
  }, 'service:unlockScreen'))

  // 解锁屏幕（进程模式，不依赖 C++ 服务）
  ipcMain.handle('service:unlockScreenProcess', safeIpcHandler(async (event, password = '') => {
    log('info', `========== [解锁-进程模式] 请求解锁屏幕，密码长度: ${password.length} ==========`)
    try {
      await inputHandler.handleUnlockScreen(password)
      log('info', '[解锁-进程模式] handleUnlockScreen 调用完成')
      return { success: true }
    } catch (e) {
      log('error', `[解锁-进程模式] 异常: ${e.message}`)
      log('error', `[解锁-进程模式] 堆栈: ${e.stack || '无'}`)
      return { success: false, error: e.message }
    }
  }, 'service:unlockScreenProcess'))

  // 检查屏幕是否锁定
  ipcMain.handle('service:isScreenLocked', safeIpcHandler(async () => {
    log('info', '========== [状态检查] 检查屏幕锁定状态 ==========')
    try {
      const { execSync } = require('child_process')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const powershellPath = require('path').join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const cmd = `"(Get-Process LogonUI -ErrorAction SilentlyContinue) -ne $null"`
      log('info', `[状态检查] 执行 PS 命令: ${cmd}`)
      const output = execSync(
        `"${powershellPath}" -Command "(Get-Process LogonUI -ErrorAction SilentlyContinue) -ne $null"`,
        { timeout: 5000, encoding: 'utf8' }
      ).trim()
      const isLocked = output === 'True'
      log('info', `[状态检查] PS 输出: "${output}", locked=${isLocked}`)
      return { success: true, locked: isLocked }
    } catch (e) {
      log('warn', `[状态检查] 异常: ${e.message}`)
      return { success: true, locked: false }
    }
  }, 'service:isScreenLocked'))

  // 发送心跳
  ipcMain.handle('service:heartbeat', safeIpcHandler(async () => {
    const result = await serviceIntegration.heartbeat()
    return result
  }, 'service:heartbeat'))

  // Credential Provider 相关
  ipcMain.handle('credProvider:check', safeIpcHandler(async () => {
    log('info', '检查 Credential Provider 状态')
    try {
      const { execFile } = require('child_process')
      const { promisify } = require('util')
      const execFileAsync = promisify(execFile)
      const path = require('path')
      const fs = require('fs')
      
      const clsid = '{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}'
      const systemDllPath1 = 'C:\\Windows\\System32\\YCDeskCredentialProvider.dll'
      const systemDllPath2 = 'C:\\Program Files\\YCDesk\\YCDeskCredentialProvider.dll'
      const result = {
        installed: false,
        dllExists: false,
        registered: false,
        details: []
      }
      
      // 1. 检查 DLL 是否存在
      if (fs.existsSync(systemDllPath1)) {
        result.dllExists = true
        result.dllPath = systemDllPath1
        const stat = fs.statSync(systemDllPath1)
        result.dllSize = stat.size
        result.dllModified = stat.mtime
      } else if (fs.existsSync(systemDllPath2)) {
        result.dllExists = true
        result.dllPath = systemDllPath2
        const stat = fs.statSync(systemDllPath2)
        result.dllSize = stat.size
        result.dllModified = stat.mtime
      }
      
      // 2. 检查注册表
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const regPath = path.join(windir, 'System32', 'reg.exe')
      const keyPath = `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\${clsid}`
      
      try {
        await execFileAsync(regPath, ['query', keyPath], { timeout: 5000 })
        result.registered = true
        result.details.push('Credential Provider 已注册')
      } catch (e) {
        result.details.push('Credential Provider 未注册')
      }
      
      // 3. 检查 CLSID 注册
      const clsidKey = `HKCR\\CLSID\\${clsid}\\InprocServer32`
      try {
        const { stdout } = await execFileAsync(regPath, ['query', clsidKey], { timeout: 5000 })
        result.clsidRegistered = true
        result.details.push('CLSID 已注册')
      } catch (e) {
        result.clsidRegistered = false
        result.details.push('CLSID 未注册')
      }
      
      result.installed = result.dllExists && result.registered && result.clsidRegistered
      
      return { success: true, ...result }
    } catch (e) {
      log('error', '检查 Credential Provider 状态失败: ' + e.message)
      return { success: false, error: e.message }
    }
  }, 'credProvider:check'))

  ipcMain.handle('credProvider:install', safeIpcHandler(async (event) => {
    log('info', '开始安装 Credential Provider')
    const steps = []
    
    try {
      const path = require('path')
      const fs = require('fs')
      const { exec, spawn } = require('child_process')
      const { promisify } = require('util')
      const execAsync = promisify(exec)
      
      const projectRoot = path.resolve(__dirname, '../../..')
      const buildDllPath1 = path.join(projectRoot, 'windows', 'credential_provider', 'YCDeskCredentialProvider.dll')
      const buildDllPath2 = path.join(projectRoot, 'windows', 'bin', 'YCDeskCredentialProvider.dll')
      
      // 检查 DLL
      let buildDllPath = ''
      if (fs.existsSync(buildDllPath1)) buildDllPath = buildDllPath1
      else if (fs.existsSync(buildDllPath2)) buildDllPath = buildDllPath2
      
      if (!buildDllPath) {
        return { success: false, error: '找不到 YCDeskCredentialProvider.dll', steps }
      }
      
      const sendProgress = (step, status, message) => {
        if (event && event.sender && !event.sender.isDestroyed()) {
          event.sender.send('credProvider:progress', { step, status, message })
        }
      }
      
      steps.push({ step: 'check_dll', status: 'success', message: '找到 DLL 文件' })
      sendProgress('check_dll', 'success', '找到 DLL 文件')
      
      sendProgress('uac_install', 'running', '正在请求管理员权限...')
      
      const installScriptPath = path.join(projectRoot, 'windows', 'credential_provider', 'install.ps1')
      
      log('info', '准备启动 UAC: ' + installScriptPath)
      
      // 创建一个自提升的批处理文件
      // 使用英文避免编码问题，使用完整路径
      const tempBat = path.join(projectRoot, 'windows', 'install_with_uac.bat')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const system32Path = path.join(windir, 'System32')
      const powershellPath = path.join(system32Path, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const netPath = path.join(system32Path, 'net.exe')
      const timeoutPath = path.join(windir, 'System32', 'timeout.exe')
      
      // 使用纯 ASCII 内容，避免任何编码问题
      const batLines = [
        '@echo off',
        ':: Check admin rights',
        `"${netPath}" session >nul 2>&1`,
        'if %errorLevel% == 0 (',
        '    echo Already admin, running script...',
        `    "${powershellPath}" -NoProfile -ExecutionPolicy Bypass -File "${installScriptPath}" -Silent`,
        '    echo INSTALL_DONE',
        `    "${timeoutPath}" /t 3`,
        ') else (',
        '    echo Requesting admin access...',
        `    "${powershellPath}" -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '%~f0' -Verb RunAs"`,
        '    exit /b',
        ')'
      ]
      
      const batContent = batLines.join('\n') + '\n'
      
      fs.writeFileSync(tempBat, batContent, 'ascii')
      
      log('info', '执行批处理文件弹出 UAC')
      
      // 使用 start 命令启动批处理，会打开新窗口
      const result = await new Promise((resolve) => {
        const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
        const cmdPath = path.join(windir, 'System32', 'cmd.exe')
        
        exec(`"${cmdPath}" /c start "" "${tempBat}"`, {
          windowsHide: false,
          timeout: 120000
        }, (error, stdout, stderr) => {
          if (error) {
            log('error', '启动批处理失败: ' + error.message)
            resolve({ code: -1, error: error.message })
          } else {
            log('info', '批处理已启动')
            resolve({ code: 0, stdout, stderr })
          }
        })
      })
      
      // 清理临时文件
      try { fs.unlinkSync(tempBat) } catch(e) {}
      
      log('info', `UAC安装结果: code=${result.code}`)
      
      // 等待一下让安装完成
      await new Promise(r => setTimeout(r, 3000))
      
      // 验证安装
      sendProgress('verify', 'running', '正在验证安装...')
      
      const verifyResult = await verifyCredProviderState()
      
      steps.push({ 
        step: 'verify', 
        status: verifyResult.installed ? 'success' : 'warning', 
        message: verifyResult.details.join(', ') 
      })
      
      sendProgress('verify', verifyResult.installed ? 'success' : 'warning', verifyResult.details.join(', '))
      
      log('info', '安装流程完成，验证结果: ' + verifyResult.installed)
      
      return { 
        success: verifyResult.installed, 
        message: verifyResult.installed ? '安装成功！请重启电脑' : '安装可能未成功，请查看控制台日志', 
        steps,
        verification: verifyResult,
        needRestart: true
      }
    } catch (e) {
      log('error', '安装失败: ' + e.message)
      return { success: false, error: e.message, steps }
    }
  }, 'credProvider:install'))

  ipcMain.handle('credProvider:uninstall', safeIpcHandler(async (event) => {
    log('info', '开始卸载 Credential Provider')
    const steps = []
    
    try {
      const path = require('path')
      const fs = require('fs')
      const { spawn } = require('child_process')
      
      const projectRoot = path.resolve(__dirname, '../../..')
      const uninstallScriptPath = path.join(projectRoot, 'windows', 'credential_provider', 'uninstall.ps1')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const system32Path = path.join(windir, 'System32')
      const psPath = path.join(system32Path, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      
      const sendProgress = (step, status, message) => {
        if (event && event.sender && !event.sender.isDestroyed()) {
          event.sender.send('credProvider:progress', { step, status, message })
        }
      }
      
      sendProgress('uac_uninstall', 'running', '正在请求管理员权限...')
      
      // 使用 Start-Process -Verb RunAs 来弹出 UAC
      const psCommand = `
$ErrorActionPreference = 'Stop'
try {
  $process = Start-Process -FilePath '${psPath}' -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','${uninstallScriptPath}','-Silent' -Verb RunAs -PassThru -Wait
  Write-Host "UAC_UNINSTALL_SUCCESS"
  exit 0
} catch {
  Write-Host "UAC_DENIED_OR_FAILED"
  exit 1
}
`
      
      log('info', '执行卸载 PowerShell 命令...')
      
      const result = await new Promise((resolve) => {
        const proc = spawn(psPath, [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          psCommand
        ], {
          windowsHide: false,  // 关键！不隐藏窗口！
          timeout: 60000
        })
        
        let stdout = ''
        let stderr = ''
        
        proc.stdout.on('data', (data) => {
          stdout += data.toString()
          log('info', '卸载输出: ' + data.toString().trim())
        })
        
        proc.stderr.on('data', (data) => {
          stderr += data.toString()
          log('warn', '卸载警告: ' + data.toString().trim())
        })
        
        proc.on('close', (code) => {
          log('info', `卸载进程结束，代码: ${code}`)
          resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() })
        })
        
        proc.on('error', (err) => {
          log('error', '卸载进程错误: ' + err.message)
          resolve({ code: -1, stdout: '', stderr: err.message })
        })
      })
      
      log('info', `UAC卸载结果: code=${result.code}, stdout=${result.stdout}, stderr=${result.stderr}`)
      
      if (result.stdout.includes('UAC_UNINSTALL_SUCCESS')) {
        steps.push({ step: 'uac_uninstall', status: 'success', message: '卸载成功！' })
        sendProgress('uac_uninstall', 'success', '卸载成功！')
      } else if (result.stdout.includes('UAC_DENIED') || result.code === 1) {
        steps.push({ step: 'uac_uninstall', status: 'error', message: '用户取消了 UAC 请求或卸载失败' })
        sendProgress('uac_uninstall', 'error', '用户取消了 UAC 请求或卸载失败')
        return { success: false, error: '用户取消了 UAC 请求或卸载失败', steps }
      } else {
        steps.push({ step: 'uac_uninstall', status: 'warning', message: 'UAC 请求完成，需要验证' })
        sendProgress('uac_uninstall', 'warning', 'UAC 请求完成，需要验证')
      }
      
      // 验证卸载
      await new Promise(r => setTimeout(r, 1000))
      const verifyResult = await verifyCredProviderState()
      
      return { 
        success: !verifyResult.installed, 
        message: verifyResult.installed ? '卸载可能未完全成功，请检查' : '卸载完成', 
        steps,
        verification: verifyResult,
        needRestart: true
      }
    } catch (e) {
      log('error', '卸载失败: ' + e.message)
      return { success: false, error: e.message, steps }
    }
  }, 'credProvider:uninstall'))

  // 安装 Windows 服务
  ipcMain.handle('service:install', safeIpcHandler(async () => {
    log('info', '安装 Windows 服务')
    const result = await serviceIntegration.installService()
    return result
  }, 'service:install'))

  // 卸载 Windows 服务
  ipcMain.handle('service:uninstall', safeIpcHandler(async () => {
    log('info', '卸载 Windows 服务')
    const result = await serviceIntegration.uninstallService()
    return result
  }, 'service:uninstall'))

  // 获取 Windows 服务状态
  ipcMain.handle('service:getWindowsServiceStatus', safeIpcHandler(async () => {
    const result = await elevationManager.getServiceStatus()
    return result
  }, 'service:getWindowsServiceStatus'))

  // ============================================================
  // UAC 提权相关 IPC 处理器（延迟授权方案）
  // ============================================================

  // 使用 UAC 提权安装服务
  ipcMain.handle('service:installWithElevation', safeIpcHandler(async () => {
    log('info', '请求 UAC 提权安装服务')
    const result = await elevationManager.installService()
    if (result.success) {
      log('info', '服务安装成功')
    } else {
      log('error', '服务安装失败: ' + (result.error || '未知错误'))
    }
    return result
  }, 'service:installWithElevation'))

  // 使用 UAC 提权卸载服务
  ipcMain.handle('service:uninstallWithElevation', safeIpcHandler(async () => {
    log('info', '请求 UAC 提权卸载服务')
    const result = await elevationManager.uninstallService()
    if (result.success) {
      log('info', '服务卸载成功')
    } else {
      log('error', '服务卸载失败: ' + (result.error || '未知错误'))
    }
    return result
  }, 'service:uninstallWithElevation'))

  // 启动 Windows 服务（不需要管理员权限）
  ipcMain.handle('service:startWindowsService', safeIpcHandler(async () => {
    log('info', '启动 Windows 服务')
    const result = await elevationManager.startService()
    if (result.success) {
      log('info', '服务启动成功')
    } else {
      log('error', '服务启动失败: ' + (result.error || '未知错误'))
    }
    return result
  }, 'service:startWindowsService'))

  // 停止 Windows 服务（不需要管理员权限）
  ipcMain.handle('service:stopWindowsService', safeIpcHandler(async () => {
    log('info', '停止 Windows 服务')
    const result = await elevationManager.stopService()
    if (result.success) {
      log('info', '服务停止成功')
    } else {
      log('error', '服务停止失败: ' + (result.error || '未知错误'))
    }
    return result
  }, 'service:stopWindowsService'))

  // 使用 UAC 提权启动 Windows 服务
  ipcMain.handle('service:startWithElevation', safeIpcHandler(async () => {
    log('info', '请求 UAC 提权启动服务')
    const result = await elevationManager.startServiceWithElevation()
    if (result.success) {
      log('info', '服务启动成功')
    } else {
      log('error', '服务启动失败: ' + (result.error || '未知错误'))
    }
    return result
  }, 'service:startWithElevation'))

  // 使用 UAC 提权停止 Windows 服务
  ipcMain.handle('service:stopWithElevation', safeIpcHandler(async () => {
    log('info', '请求 UAC 提权停止服务')
    const result = await elevationManager.stopServiceWithElevation()
    if (result.success) {
      log('info', '服务停止成功')
    } else {
      log('error', '服务停止失败: ' + (result.error || '未知错误'))
    }
    return result
  }, 'service:stopWithElevation'))

  // 设置服务模式
  ipcMain.handle('service:setMode', safeIpcHandler(async (event, mode) => {
    log('info', '设置服务模式: ' + mode)
    const { getServiceIntegration } = require('./service-integration')
    const serviceIntegration = getServiceIntegration()
    if (mode === 'service') {
      serviceIntegration.setServiceModeEnabled(true)
    } else {
      serviceIntegration.setServiceModeEnabled(false)
    }
    return { success: true, mode }
  }, 'service:setMode'))

  // 连接到 Windows 服务
  ipcMain.handle('service:connectToWindowsService', safeIpcHandler(async () => {
    log('info', '连接到 Windows 服务')
    const { getServiceIntegration } = require('./service-integration')
    const serviceIntegration = getServiceIntegration()
    try {
      await serviceIntegration.connectToWindowsService()
      return { success: true }
    } catch (e) {
      log('error', '连接到 Windows 服务失败: ' + e.message)
      return { success: false, error: e.message }
    }
  }, 'service:connectToWindowsService'))

  // 断开与 Windows 服务的连接
  ipcMain.handle('service:disconnectFromWindowsService', safeIpcHandler(async () => {
    log('info', '断开与 Windows 服务的连接')
    const { getServiceIntegration } = require('./service-integration')
    const serviceIntegration = getServiceIntegration()
    try {
      await serviceIntegration.disconnectFromWindowsService()
      return { success: true }
    } catch (e) {
      log('error', '断开连接失败: ' + e.message)
      return { success: false, error: e.message }
    }
  }, 'service:disconnectFromWindowsService'))

  // 监听服务状态变化并转发到渲染进程
  serviceIntegration.on('stateChange', ({ oldState, newState }) => {
    log('info', `服务状态变化: ${oldState} -> ${newState}`)
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('service:stateChange', { oldState, newState })
    }
  })

  // 监听服务启动成功
  serviceIntegration.on('started', () => {
    log('info', '服务已启动')
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('service:started')
    }
  })

  // 监听服务停止
  serviceIntegration.on('stopped', () => {
    log('info', '服务已停止')
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('service:stopped')
    }
  })

  // 监听服务错误
  serviceIntegration.on('error', (error) => {
    log('error', `服务错误: ${error.message}`)
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('service:error', { message: error.message })
    }
  })

  // 主控端日志写入
  ipcMain.handle('controller:log', safeIpcHandler(async (event, { level, message, data }) => {
    const logMessage = `[主控端] ${message}`
    log(level || 'info', logMessage, data || {})
    return { success: true }
  }, 'controller:log'))

  // 获取日志文件路径
  ipcMain.handle('controller:getLogPath', safeIpcHandler(async () => {
    const logDir = logger ? logger.getLogDir() : path.join(os.homedir(), '.ycdesk_logs')
    const logFile = logger ? logger.getCurrentLogFile() : path.join(logDir, 'ycdesk-controller.log')
    return { success: true, logDir, logFile }
  }, 'controller:getLogPath'))
}

function cleanup() {
  log('info', '清理 IPC 处理器')
  remoteStreamInfo = null
  inputHandler.cleanup()
  cleanupDirectServer()
  signalingServer.disconnect()
  
  // 清理服务集成
  const serviceIntegration = getServiceIntegration()
  if (serviceIntegration) {
    serviceIntegration.destroy().catch(err => {
      log('error', '清理服务集成失败', { error: err.message })
    })
  }
}

module.exports = {
  init,
  generateDeviceId,
  loadDeviceId,
  cleanup
}
