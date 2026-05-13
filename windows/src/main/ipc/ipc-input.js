const { ipcMain } = require('electron')

function register(safeHandler, logFn, getMainWindow, inputHandler) {
  ipcMain.on('remote-input', (event, inputData) => {
    const inputType = inputData && inputData.inputType
    const type = inputData && inputData.type
    if (inputType === 'lock_screen' || inputType === 'unlock_screen') {
      logFn('info', '[IPC] 收到特殊命令: type=' + type + ', inputType=' + inputType)
    } else {
      logFn('debug', 'DIAG IPC: 收到remote-input, type=' + type + ', inputType=' + inputType)
    }
    inputHandler.handleRemoteInput(event, inputData)
  })

  ipcMain.on('remote-window-ready', (event) => {
    logFn('debug', '收到远程窗口准备就绪信号')
    const mainWindow = getMainWindow()
    if (mainWindow) mainWindow.webContents.send('remote-window-ready', {})
  })

  ipcMain.handle('reset-input-modifiers', safeHandler(() => {
    inputHandler.resetModifiers()
    return { success: true }
  }, 'reset-input-modifiers'))
}

module.exports = { register }