const { ipcMain } = require('electron')
const path = require('path')
const os = require('os')

function register(safeHandler, logFn, logger) {
  ipcMain.handle('controller:log', safeHandler(async (event, { level, message, data }) => {
    try {
      const logMessage = `[主控端] ${message}`
      logFn(level || 'info', logMessage, data || {})
      return { success: true }
    } catch (e) {
      logFn('error', '记录日志失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'controller:log'))

  ipcMain.handle('controller:getLogPath', safeHandler(async () => {
    try {
      const logDir = logger ? logger.getLogDir() : path.join(os.homedir(), '.ycdesk_logs')
      const logFile = logger ? logger.getCurrentLogFile() : path.join(logDir, 'ycdesk-controller.log')
      return { success: true, logDir, logFile }
    } catch (e) {
      logFn('error', '获取日志路径失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'controller:getLogPath'))
}

module.exports = { register }