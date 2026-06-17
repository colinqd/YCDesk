const { powerMonitor, ipcMain } = require('electron')
const credentialsManager = require('./credentials-manager')
const unlockIpcServer = require('./unlock-ipc-server')
const os = require('os')
const { createLogger } = require('./logger')

const logger = createLogger()

let robot = null
try {
  robot = require('robotjs')
} catch (e) {
  logger.error('[AutoUnlockService] robotjs 加载失败:', e.message)
}

class AutoUnlockService {
  constructor() {
    this.isLocked = false
    this.autoUnlockEnabled = false
    this.currentRemoteWindow = null
    this.currentMainWindow = null
    this.ipcServerStarted = false
    this.setupListeners()
    this.startIpcServer()
  }

  startIpcServer() {
    try {
      this.ipcServerStarted = unlockIpcServer.start()
      logger.info('[AutoUnlockService] IPC 服务器启动状态:', this.ipcServerStarted)
    } catch (error) {
      logger.error('[AutoUnlockService] IPC 服务器启动失败:', error)
    }
  }

  setAutoUnlockEnabled(enabled) {
    this.autoUnlockEnabled = enabled
  }

  setRemoteWindow(window) {
    this.currentRemoteWindow = window
  }

  setMainWindow(window) {
    this.currentMainWindow = window
    logger.info('[AutoUnlockService] mainWindow 已设置, id=' + (window ? window.id : 'null'))
  }

  setupListeners() {
    powerMonitor.on('lock-screen', () => {
      this.isLocked = true
      logger.info('[AutoUnlockService] 检测到屏幕锁定')
      this.notifyLockState()
      
      if (this.currentMainWindow && !this.currentMainWindow.isDestroyed()) {
        logger.info('[AutoUnlockService] 通知渲染进程停止屏幕捕获')
        this.currentMainWindow.webContents.send('screen-capture-control', { action: 'stop' })
      }
    })

    powerMonitor.on('unlock-screen', () => {
      this.isLocked = false
      logger.info('[AutoUnlockService] 屏幕已解锁')
      this.notifyLockState()
      
      if (this.currentMainWindow && !this.currentMainWindow.isDestroyed()) {
        logger.info('[AutoUnlockService] 通知渲染进程恢复屏幕捕获')
        this.currentMainWindow.webContents.send('screen-capture-control', { action: 'start' })
      }
    })

    ipcMain.handle('auto-unlock:get-state', async () => {
      const savedPasswordResult = await credentialsManager.getUnlockPassword()
      const hasSavedPassword = savedPasswordResult.success && savedPasswordResult.password !== null
      
      return {
        isLocked: this.isLocked,
        autoUnlockEnabled: this.autoUnlockEnabled,
        hasSavedPassword
      }
    })

    ipcMain.handle('auto-unlock:try', async () => {
      return await this.tryAutoUnlock()
    })

    ipcMain.handle('auto-unlock:manual', async (event, password) => {
      return await this.manualUnlock(password)
    })

    ipcMain.handle('auto-unlock:save-password', async (event, password, remember) => {
      return await credentialsManager.saveUnlockPassword(password, remember)
    })

    ipcMain.handle('auto-unlock:clear-password', async () => {
      return await credentialsManager.clearUnlockPassword()
    })
  }

  notifyLockState() {
    const payload = {
      isLocked: this.isLocked,
      autoUnlockEnabled: this.autoUnlockEnabled
    }

    logger.info('[AutoUnlockService] ========== notifyLockState 被调用 ==========')
    logger.info('[AutoUnlockService] payload:', JSON.stringify(payload))
    logger.info('[AutoUnlockService] remoteWindow 存在:', !!this.currentRemoteWindow, ', 销毁:', this.currentRemoteWindow ? this.currentRemoteWindow.isDestroyed() : 'N/A')
    logger.info('[AutoUnlockService] mainWindow 存在:', !!this.currentMainWindow, ', 销毁:', this.currentMainWindow ? this.currentMainWindow.isDestroyed() : 'N/A')

    if (this.currentRemoteWindow && !this.currentRemoteWindow.isDestroyed()) {
      logger.info('[AutoUnlockService] 正在发送到 remoteWindow...')
      this.currentRemoteWindow.webContents.send('unlock-state-changed', payload)
      logger.info('[AutoUnlockService] remoteWindow 发送完成')
    } else {
      logger.info('[AutoUnlockService] remoteWindow 不可用，跳过')
    }

    if (this.currentMainWindow && !this.currentMainWindow.isDestroyed()) {
      logger.info('[AutoUnlockService] 正在发送到 mainWindow...')
      this.currentMainWindow.webContents.send('unlock-state-changed', payload)
      logger.info('[AutoUnlockService] mainWindow 发送完成')
    } else {
      logger.info('[AutoUnlockService] mainWindow 不可用，跳过 (存在=' + !!this.currentMainWindow + ')')
    }

    try {
      const { notifyLockStateToClients, notifyLockStateToServer } = require('./direct-server')
      const sent = notifyLockStateToClients(payload) || notifyLockStateToServer(payload)
      logger.info('[AutoUnlockService] TCP旁路通知结果: ' + sent + ' 个客户端')
    } catch (e) {
      logger.info('[AutoUnlockService] TCP旁路通知失败: ' + e.message)
    }

    logger.info('[AutoUnlockService] ========== notifyLockState 完成 ==========')

    // 通知服务切换采集桌面
    try {
      const { getServiceIntegration } = require('./service-integration')
      const svc = getServiceIntegration()
      if (svc.isServiceModeEnabled() && svc.isRunning()) {
        if (this.isLocked) {
          svc.switchToWinlogon().catch(e => logger.info('[AutoUnlockService] switchToWinlogon failed:', e.message))
        } else {
          svc.switchToDefault().catch(e => logger.info('[AutoUnlockService] switchToDefault failed:', e.message))
        }
      }
    } catch (e) {
      logger.info('[AutoUnlockService] 服务通知失败:', e.message)
    }
  }

  async tryAutoUnlock() {
    if (!this.isLocked) {
      return { success: false, message: '屏幕未锁定' }
    }

    const { success, password } = await credentialsManager.getUnlockPassword()
    if (!success || !password) {
      return { success: false, message: '未保存解锁密码' }
    }

    try {
      const username = os.userInfo().username
      const result = await credentialsManager.unlockWithCredentialProvider(username, password)
      
      if (result.success) {
        return { success: true, message: '自动解锁成功 (Credential Provider)' }
      } else {
        logger.info('[AutoUnlockService] Credential Provider 不可用，回退到 robotjs')
        await this.simulatePasswordInput(password)
        return { success: true, message: '自动解锁成功' }
      }
    } catch (error) {
      logger.error('[AutoUnlockService] 自动解锁失败:', error)
      return { 
        success: false, 
        message: error.message || '自动解锁失败' 
      }
    }
  }

  async manualUnlock(password) {
    if (!password) {
      return { success: false, message: '密码不能为空' }
    }

    try {
      const username = os.userInfo().username
      const result = await credentialsManager.unlockWithCredentialProvider(username, password)
      
      if (result.success) {
        return { success: true, message: '解锁成功 (Credential Provider)' }
      } else {
        logger.info('[AutoUnlockService] Credential Provider 不可用，回退到 robotjs')
        await this.simulatePasswordInput(password)
        return { success: true, message: '解锁成功' }
      }
    } catch (error) {
      logger.error('[AutoUnlockService] 手动解锁失败:', error)
      return { 
        success: false, 
        message: error.message || '解锁失败' 
      }
    }
  }

  async simulatePasswordInput(password) {
    if (!robot) {
      throw new Error('robotjs 不可用')
    }

    logger.info('[AutoUnlockService] 开始模拟输入密码...')
    
    try {
      robot.keyTap('escape')
      await this.sleep(300)
    } catch (e) {
      logger.warn('[AutoUnlockService] ESC 失败:', e.message)
    }
    
    try {
      const { screen } = require('electron')
      const primaryDisplay = screen.getPrimaryDisplay()
      const centerX = Math.floor(primaryDisplay.size.width / 2)
      const centerY = Math.floor(primaryDisplay.size.height / 2)
      
      robot.moveMouse(centerX, centerY)
      await this.sleep(100)
      robot.mouseClick()
      await this.sleep(200)
    } catch (e) {
      logger.warn('[AutoUnlockService] 点击屏幕失败:', e.message)
    }
    
    try {
      robot.typeString(password)
      await this.sleep(200)
    } catch (e) {
      logger.error('[AutoUnlockService] 输入密码失败:', e.message)
      throw new Error('密码输入失败')
    }
    
    try {
      robot.keyTap('enter')
    } catch (e) {
      logger.error('[AutoUnlockService] Enter 失败:', e.message)
      throw new Error('Enter 失败')
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = new AutoUnlockService()
