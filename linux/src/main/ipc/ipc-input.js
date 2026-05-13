const { ipcMain } = require('electron')

function register(safeHandler, logFn, getMainWindow, inputHandler) {
  ipcMain.on('remote-input', (event, inputData) => {
    logFn('debug', '收到远程输入', { type: inputData?.type, inputType: inputData?.inputType })
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