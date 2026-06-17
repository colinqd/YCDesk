const { ipcMain } = require('electron')

function register(safeHandler, serviceIntegration, getMainWindow, getRemoteWindow, logFn) {
  ipcMain.handle('service:start', safeHandler(async () => {
    logFn('info', '启动服务...')
    await serviceIntegration.start()
    return { success: true, state: serviceIntegration.getState() }
  }, 'service:start'))

  ipcMain.handle('service:stop', safeHandler(async () => {
    logFn('info', '停止服务...')
    await serviceIntegration.stop()
    return { success: true, state: serviceIntegration.getState() }
  }, 'service:stop'))

  ipcMain.handle('service:restart', safeHandler(async () => {
    logFn('info', '重启服务...')
    await serviceIntegration.restart()
    return { success: true, state: serviceIntegration.getState() }
  }, 'service:restart'))

  ipcMain.handle('service:status', safeHandler(() => {
    const mode = serviceIntegration.isServiceModeEnabled() ? 'service' : 'process'
    return {
      state: serviceIntegration.getState(),
      isRunning: serviceIntegration.isRunning(),
      mode
    }
  }, 'service:status'))

  ipcMain.handle('service:captureScreen', safeHandler(async (event, options = {}) => {
    logFn('debug', '请求截屏', options)
    return await serviceIntegration.captureScreen(options)
  }, 'service:captureScreen'))

  ipcMain.handle('service:sendInput', safeHandler(async (event, type, params) => {
    logFn('debug', '发送输入事件', { type, params })
    return await serviceIntegration.sendInput(type, params)
  }, 'service:sendInput'))

  ipcMain.handle('service:lockScreen', safeHandler(async () => {
    logFn('info', '========== [锁屏] 请求锁定屏幕 ==========')
    try {
      const { execSync } = require('child_process')
      const path = require('path')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const rundll32Path = path.join(windir, 'System32', 'rundll32.exe')
      logFn('info', `[锁屏] 执行: "${rundll32Path}" user32.dll,LockWorkStation`)
      execSync(`"${rundll32Path}" user32.dll,LockWorkStation`, { timeout: 5000 })
      logFn('info', '[锁屏] LockWorkStation 调用成功')
      return { success: true, method: 'LockWorkStation' }
    } catch (e) {
      logFn('error', `[锁屏] 失败: ${e.message}`)
      logFn('error', `[锁屏] 退出码: ${e.status}`)
      return { success: false, error: e.message }
    }
  }, 'service:lockScreen'))

  ipcMain.handle('service:unlockScreen', safeHandler(async (event, password = '') => {
    logFn('info', `========== [解锁-服务模式] 请求解锁屏幕，密码长度: ${password.length} ==========`)
    try {
      const result = await serviceIntegration.unlockScreen(password)
      logFn('info', `[解锁-服务模式] 完整返回: ${JSON.stringify(result)}`)
      return result
    } catch (e) {
      logFn('error', `[解锁-服务模式] 异常: ${e.message}`)
      logFn('error', `[解锁-服务模式] 堆栈: ${e.stack || '无'}`)
      return { success: false, error: e.message }
    }
  }, 'service:unlockScreen'))

  ipcMain.handle('service:unlockScreenProcess', safeHandler(async (event, password = '') => {
    logFn('info', `========== [解锁-进程模式] 请求解锁屏幕，密码长度: ${password.length} ==========`)
    try {
      const { handleUnlockScreen } = require('./input-handler')
      await handleUnlockScreen(password)
      logFn('info', '[解锁-进程模式] handleUnlockScreen 调用完成')
      return { success: true }
    } catch (e) {
      logFn('error', `[解锁-进程模式] 异常: ${e.message}`)
      logFn('error', `[解锁-进程模式] 堆栈: ${e.stack || '无'}`)
      return { success: false, error: e.message }
    }
  }, 'service:unlockScreenProcess'))

  ipcMain.handle('service:isScreenLocked', safeHandler(async () => {
    logFn('info', '========== [状态检查] 检查屏幕锁定状态 ==========')
    try {
      const { execSync } = require('child_process')
      const windir = process.env.windir || process.env.SystemRoot || 'C:\\Windows'
      const powershellPath = require('path').join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const output = execSync(
        `"${powershellPath}" -Command "(Get-Process LogonUI -ErrorAction SilentlyContinue) -ne $null"`,
        { timeout: 5000, encoding: 'utf8' }
      ).trim()
      const isLocked = output === 'True'
      logFn('info', `[状态检查] PS 输出: "${output}", locked=${isLocked}`)
      return { success: true, locked: isLocked }
    } catch (e) {
      logFn('warn', `[状态检查] 异常: ${e.message}`)
      return { success: true, locked: false }
    }
  }, 'service:isScreenLocked'))

  ipcMain.handle('service:heartbeat', safeHandler(async () => {
    return await serviceIntegration.heartbeat()
  }, 'service:heartbeat'))

  ipcMain.handle('service:unlockWithPassword', safeHandler(async (event, { password } = {}) => {
    logFn('info', `[Service] 收到解锁请求，密码长度=${password ? password.length : 0}`)
    try {
      const result = await serviceIntegration.unlockScreen(password || '')
      logFn('info', `[Service] 解锁结果: ${JSON.stringify(result)}`)
      return { success: true, result }
    } catch (e) {
      logFn('error', `[Service] 解锁失败: ${e.message}`)
      return { success: false, error: e.message }
    }
  }, 'service:unlockWithPassword'))

  ipcMain.handle('service:startCapture', safeHandler(async (event, config = {}) => {
    try {
      const result = await serviceIntegration.startCapture(config)
      return { success: true, result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'service:startCapture'))

  ipcMain.handle('service:stopCapture', safeHandler(async () => {
    try {
      const result = await serviceIntegration.stopCapture()
      return { success: true, result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'service:stopCapture'))

  ipcMain.handle('service:setMode', safeHandler(async (event, mode) => {
    logFn('info', '设置服务模式: ' + mode)
    const { getServiceIntegration } = require('./service-integration')
    const si = getServiceIntegration()
    si.setServiceModeEnabled(mode === 'service')
    return { success: true, mode }
  }, 'service:setMode'))

  ipcMain.handle('service:connectToWindowsService', safeHandler(async () => {
    logFn('info', '连接到 Windows 服务')
    const { getServiceIntegration } = require('./service-integration')
    const si = getServiceIntegration()
    try {
      await si.connect()
      return { success: true }
    } catch (e) {
      logFn('error', '连接到 Windows 服务失败: ' + e.message)
      return { success: false, error: e.message }
    }
  }, 'service:connectToWindowsService'))

  ipcMain.handle('service:disconnectFromWindowsService', safeHandler(async () => {
    logFn('info', '断开与 Windows 服务的连接')
    const { getServiceIntegration } = require('./service-integration')
    const si = getServiceIntegration()
    try {
      await si.disconnect()
      return { success: true }
    } catch (e) {
      logFn('error', '断开连接失败: ' + e.message)
      return { success: false, error: e.message }
    }
  }, 'service:disconnectFromWindowsService'))

  ipcMain.handle('service:notifyWebRTCReady', safeHandler(async () => {
    try {
      const result = await serviceIntegration.notifyWebRTCReady()
      logFn('info', '已通知服务 WebRTC 就绪')
      return result
    } catch (e) {
      logFn('error', '通知服务 WebRTC 就绪失败: ' + e.message)
      return { errCode: 1, body: { error: e.message } }
    }
  }, 'service:notifyWebRTCReady'))

  serviceIntegration.on('stateChange', ({ oldState, newState }) => {
    logFn('info', `服务状态变化: ${oldState} -> ${newState}`)
    const mainWindow = getMainWindow()
    if (mainWindow) mainWindow.webContents.send('service:stateChange', { oldState, newState })
  })

  serviceIntegration.on('started', () => {
    logFn('info', '服务已启动')
    const mainWindow = getMainWindow()
    if (mainWindow) mainWindow.webContents.send('service:started')
  })

  serviceIntegration.on('stopped', () => {
    logFn('info', '服务已停止')
    const mainWindow = getMainWindow()
    if (mainWindow) mainWindow.webContents.send('service:stopped')
  })

  serviceIntegration.on('error', (error) => {
    logFn('error', `服务错误: ${error.message}`)
    const mainWindow = getMainWindow()
    if (mainWindow) mainWindow.webContents.send('service:error', { message: error.message })
  })

  serviceIntegration.on('frame', (frameData) => {
    const framePayload = {
      width: frameData.width,
      height: frameData.height,
      jpeg: frameData.jpeg.toString('base64'),
      timestamp: frameData.timestamp
    }
    const remoteWindow = getRemoteWindow()
    if (remoteWindow && !remoteWindow.isDestroyed()) {
      remoteWindow.webContents.send('lock-screen-frame', framePayload)
      remoteWindow.webContents.send('service-frame', framePayload)
    }
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lock-screen-frame', framePayload)
      mainWindow.webContents.send('service-frame', framePayload)
    }
  })

  serviceIntegration.on('connected', () => {
    logFn('info', '[Service] 服务已连接')
    const mainWindow = getMainWindow()
    if (mainWindow) mainWindow.webContents.send('service:state-changed', { connected: true })
  })

  serviceIntegration.on('disconnected', () => {
    logFn('info', '[Service] 服务已断开')
    const mainWindow = getMainWindow()
    if (mainWindow) mainWindow.webContents.send('service:state-changed', { connected: false })
  })
}

module.exports = { register }