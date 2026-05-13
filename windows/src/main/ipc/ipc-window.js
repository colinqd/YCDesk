const { ipcMain } = require('electron')

function register(safeHandler, windowManager) {
  ipcMain.handle('window-minimize', safeHandler(() => { windowManager.minimizeMainWindow(); return true }, 'window-minimize'))
  ipcMain.handle('window-maximize', safeHandler(() => { windowManager.maximizeMainWindow(); return true }, 'window-maximize'))
  ipcMain.handle('window-close', safeHandler(() => { windowManager.closeMainWindow(); return true }, 'window-close'))
  ipcMain.handle('show-main-window', safeHandler(() => { windowManager.showMainWindow(); return true }, 'show-main-window'))
  ipcMain.handle('set-tray-icon', safeHandler(() => ({ success: true }), 'set-tray-icon'))
}

module.exports = { register }