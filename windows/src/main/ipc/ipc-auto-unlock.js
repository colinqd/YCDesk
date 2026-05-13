const { ipcMain } = require('electron')

function register(safeHandler, credentialsManager, logFn) {
  ipcMain.handle('auto-unlock-get-status', safeHandler(async () => {
    const passwordResult = await credentialsManager.getUnlockPassword()
    return {
      hasSavedPassword: passwordResult.success && passwordResult.password !== null
    }
  }, 'auto-unlock-get-status'))

  ipcMain.handle('auto-unlock-save-password', safeHandler(async (event, password) => {
    return await credentialsManager.saveUnlockPassword(password, true)
  }, 'auto-unlock-save-password'))

  ipcMain.handle('auto-unlock-clear-password', safeHandler(async () => {
    return await credentialsManager.clearUnlockPassword()
  }, 'auto-unlock-clear-password'))

  ipcMain.handle('auto-unlock-get-password', safeHandler(async () => {
    return await credentialsManager.getUnlockPassword()
  }, 'auto-unlock-get-password'))

  ipcMain.on('set-log-role', (event, role) => {
    if (logFn && logFn.setRole) {
      logFn.setRole(role)
    }
  })
}

module.exports = { register }