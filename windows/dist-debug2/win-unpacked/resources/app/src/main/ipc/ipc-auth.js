const { ipcMain } = require('electron')

function register(safeHandler, authManager) {
  ipcMain.handle('set-connection-password', safeHandler((event, pwd) => authManager.setPassword(pwd), 'set-connection-password'))
  ipcMain.handle('has-connection-password', safeHandler(() => authManager.hasPassword(), 'has-connection-password'))
  ipcMain.handle('clear-connection-password', safeHandler(() => { authManager.clearPassword(); return { success: true } }, 'clear-connection-password'))
  ipcMain.handle('verify-connection-password', safeHandler((event, pwd) => authManager.verifyPassword(pwd), 'verify-connection-password'))
  ipcMain.handle('encrypt-data', safeHandler((event, params) => authManager.encrypt(params.data, params.password), 'encrypt-data'))
  ipcMain.handle('decrypt-data', safeHandler((event, params) => authManager.decrypt(params.encryptedData, params.password), 'decrypt-data'))
}

module.exports = { register }