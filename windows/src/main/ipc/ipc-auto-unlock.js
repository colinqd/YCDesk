const { ipcMain } = require('electron')

function register(safeHandler, credentialsManager, logFn) {
  ipcMain.handle('auto-unlock-get-status', safeHandler(async () => {
    try {
      const passwordResult = await credentialsManager.getUnlockPassword()
      return {
        hasSavedPassword: passwordResult.success && passwordResult.password !== null
      }
    } catch (e) {
      if (logFn) logFn.error('获取自动解锁状态失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'auto-unlock-get-status'))

  ipcMain.handle('auto-unlock-save-password', safeHandler(async (event, password) => {
    try {
      return await credentialsManager.saveUnlockPassword(password, true)
    } catch (e) {
      if (logFn) logFn.error('保存自动解锁密码失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'auto-unlock-save-password'))

  ipcMain.handle('auto-unlock-clear-password', safeHandler(async () => {
    try {
      return await credentialsManager.clearUnlockPassword()
    } catch (e) {
      if (logFn) logFn.error('清除自动解锁密码失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'auto-unlock-clear-password'))

  ipcMain.on('set-log-role', (event, role) => {
    try {
      if (logFn && logFn.setRole) {
        logFn.setRole(role)
      }
    } catch (e) {
      console.error('set-log-role handler error:', e.message)
    }
  })
}

module.exports = { register }
