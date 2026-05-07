const { powerMonitor, ipcMain } = require('electron')
const credentialsManager = require('./credentials-manager')
const unlockIpcServer = require('./unlock-ipc-server')
const windowManager = require('./window-manager')
const os = require('os')

class AutoUnlockService {
  constructor() {
    this.isLocked = false
    this.autoUnlockEnabled = false
    this.currentRemoteWindow = null
    this.ipcServerStarted = false
    this.setupListeners()
    this.startIpcServer()
  }

  startIpcServer() {
    try {
      this.ipcServerStarted = unlockIpcServer.start()
      console.log('[AutoUnlockService] IPC 服务器启动状态:', this.ipcServerStarted)
    } catch (error) {
      console.error('[AutoUnlockService] IPC 服务器启动失败:', error)
    }
  }

  setAutoUnlockEnabled(enabled) {
    this.autoUnlockEnabled = enabled
  }

  setRemoteWindow(window) {
    this.currentRemoteWindow = window
  }

  setupListeners() {
    powerMonitor.on('lock-screen', () => {
      this.isLocked = true
      console.log('[AutoUnlockService] 检测到屏幕锁定')
      this.notifyLockState()
    })

    powerMonitor.on('unlock-screen', () => {
      this.isLocked = false
      console.log('[AutoUnlockService] 屏幕已解锁')
      this.notifyLockState()
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

    if (this.currentRemoteWindow && !this.currentRemoteWindow.isDestroyed()) {
      this.currentRemoteWindow.webContents.send('unlock-state-changed', payload)
    }

    const mainWindow = windowManager.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('unlock-state-changed', payload)
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
      // 首先尝试 Credential Provider 方式
      const username = os.userInfo().username
      const result = await credentialsManager.unlockWithCredentialProvider(username, password)
      
      if (result.success) {
        return { success: true, message: '自动解锁成功 (Credential Provider)' }
      } else {
        // 回退到 robotjs 方式
        console.log('[AutoUnlockService] Credential Provider 不可用，回退到 robotjs')
        await this.simulatePasswordInput(password)
        return { success: true, message: '自动解锁成功' }
      }
    } catch (error) {
      console.error('[AutoUnlockService] 自动解锁失败:', error)
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
      // 首先尝试 Credential Provider 方式
      const username = os.userInfo().username
      const result = await credentialsManager.unlockWithCredentialProvider(username, password)
      
      if (result.success) {
        return { success: true, message: '解锁成功 (Credential Provider)' }
      } else {
        // 回退到 robotjs 方式
        console.log('[AutoUnlockService] Credential Provider 不可用，回退到 robotjs')
        await this.simulatePasswordInput(password)
        return { success: true, message: '解锁成功' }
      }
    } catch (error) {
      console.error('[AutoUnlockService] 手动解锁失败:', error)
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

    console.log('[AutoUnlockService] 开始模拟输入密码...')
    
    // 先按 ESC 或点击来唤醒登录界面
    try {
      robot.keyTap('escape')
      await this.sleep(300)
    } catch (e) {
      console.warn('[AutoUnlockService] ESC 失败:', e.message)
    }
    
    // 尝试点击屏幕中央（可能在锁定界面需要点击）
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
      console.warn('[AutoUnlockService] 点击屏幕失败:', e.message)
    }
    
    // 输入密码
    try {
      robot.typeString(password)
      await this.sleep(200)
    } catch (e) {
      console.error('[AutoUnlockService] 输入密码失败:', e.message)
      throw new Error('密码输入失败')
    }
    
    // 按下 Enter
    try {
      robot.keyTap('enter')
    } catch (e) {
      console.error('[AutoUnlockService] Enter 失败:', e.message)
      throw new Error('Enter 失败')
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = new AutoUnlockService()
