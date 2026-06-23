const { ipcMain } = require('electron')

function register(safeHandler, elevationManager, logFn) {
  ipcMain.handle('service:install', safeHandler(async () => {
    try {
      logFn('info', '安装 Windows 服务')
      return await elevationManager.installService()
    } catch (e) {
      logFn('error', '安装服务失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'service:install'))

  ipcMain.handle('service:uninstall', safeHandler(async () => {
    try {
      logFn('info', '卸载 Windows 服务')
      return await elevationManager.uninstallService()
    } catch (e) {
      logFn('error', '卸载服务失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'service:uninstall'))

  ipcMain.handle('service:getWindowsServiceStatus', safeHandler(async () => {
    try {
      return await elevationManager.queryServiceStatus()
    } catch (e) {
      logFn('error', '查询服务状态失败', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'service:getWindowsServiceStatus'))

  ipcMain.handle('service:installWithElevation', safeHandler(async () => {
    try {
      logFn('info', '请求 UAC 提权安装服务')
      const result = await elevationManager.installService()
      if (result.success) logFn('info', '服务安装成功')
      else logFn('error', '服务安装失败: ' + (result.error || '未知错误'))
      return result
    } catch (e) {
      logFn('error', '安装服务异常', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'service:installWithElevation'))

  ipcMain.handle('service:uninstallWithElevation', safeHandler(async () => {
    try {
      logFn('info', '请求 UAC 提权卸载服务')
      const result = await elevationManager.uninstallService()
      if (result.success) logFn('info', '服务卸载成功')
      else logFn('error', '服务卸载失败: ' + (result.error || '未知错误'))
      return result
    } catch (e) {
      logFn('error', '卸载服务异常', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'service:uninstallWithElevation'))

  ipcMain.handle('service:startWindowsService', safeHandler(async () => {
    try {
      logFn('info', '启动 Windows 服务')
      const result = await elevationManager.startService()
      if (result.success) logFn('info', '服务启动成功')
      else logFn('error', '服务启动失败: ' + (result.error || '未知错误'))
      return result
    } catch (e) {
      logFn('error', '启动服务异常', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'service:startWindowsService'))

  ipcMain.handle('service:stopWindowsService', safeHandler(async () => {
    try {
      logFn('info', '停止 Windows 服务')
      const result = await elevationManager.stopService()
      if (result.success) logFn('info', '服务停止成功')
      else logFn('error', '服务停止失败: ' + (result.error || '未知错误'))
      return result
    } catch (e) {
      logFn('error', '停止服务异常', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'service:stopWindowsService'))

  ipcMain.handle('service:startWithElevation', safeHandler(async () => {
    try {
      logFn('info', '请求 UAC 提权启动服务')
      const result = await elevationManager.startService()
      if (result.success) logFn('info', '服务启动成功')
      else logFn('error', '服务启动失败: ' + (result.error || '未知错误'))
      return result
    } catch (e) {
      logFn('error', '启动服务异常', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'service:startWithElevation'))

  ipcMain.handle('service:stopWithElevation', safeHandler(async () => {
    try {
      logFn('info', '请求 UAC 提权停止服务')
      const result = await elevationManager.stopService()
      if (result.success) logFn('info', '服务停止成功')
      else logFn('error', '服务停止失败: ' + (result.error || '未知错误'))
      return result
    } catch (e) {
      logFn('error', '停止服务异常', { error: e.message })
      return { success: false, error: e.message }
    }
  }, 'service:stopWithElevation'))
}

module.exports = { register }