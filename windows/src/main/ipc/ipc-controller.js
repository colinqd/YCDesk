const { ipcMain } = require('electron')
const path = require('path')
const os = require('os')

function register(safeHandler, logFn, logger) {
  ipcMain.handle('controller:log', safeHandler(async (event, { level, message, data }) => {
    const logMessage = `[主控端] ${message}`
    logFn(level || 'info', logMessage, data || {})
    return { success: true }
  }, 'controller:log'))

  ipcMain.handle('controller:getLogPath', safeHandler(async () => {
    const logDir = logger ? logger.getLogDir() : path.join(os.homedir(), '.ycdesk_logs')
    const logFile = logger ? logger.getCurrentLogFile() : path.join(logDir, 'ycdesk-controller.log')
    return { success: true, logDir, logFile }
  }, 'controller:getLogPath'))
}

module.exports = { register }