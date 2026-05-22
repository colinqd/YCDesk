const { ipcMain } = require('electron')
const fs = require('fs')
const DIAG_FILE = 'C:\\ProgramData\\YCDesk\\diag_ipc_input.log'

function register(safeHandler, logFn, getMainWindow, inputHandler) {
  ipcMain.on('remote-input', (event, inputData) => {
    const inputType = inputData && inputData.inputType
    const type = inputData && inputData.type

    // 核诊断：直接写文件确认 IPC 消息到达
    try {
      if (!fs.existsSync('C:\\ProgramData\\YCDesk')) fs.mkdirSync('C:\\ProgramData\\YCDesk', { recursive: true })
      fs.appendFileSync(DIAG_FILE, '[' + new Date().toISOString() + '] IPC收到: type=' + type + ' inputType=' + inputType + '\n', 'utf8')
    } catch (e) {}

    if (inputType === 'lock_screen' || inputType === 'unlock_screen') {
      logFn('info', '[IPC] 收到特殊命令: type=' + type + ', inputType=' + inputType)
    } else {
      logFn('info', '[IPC] 收到remote-input: type=' + type + ', inputType=' + inputType)
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