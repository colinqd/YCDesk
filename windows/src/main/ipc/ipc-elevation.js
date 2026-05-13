const { ipcMain } = require('electron')

function register(safeHandler, elevationManager, logFn) {
  ipcMain.handle('service:install', safeHandler(async () => {
    logFn('info', '安装 Windows 服务')
    return await elevationManager.installService()
  }, 'service:install'))

  ipcMain.handle('service:uninstall', safeHandler(async () => {
    logFn('info', '卸载 Windows 服务')
    return await elevationManager.uninstallService()
  }, 'service:uninstall'))

  ipcMain.handle('service:getWindowsServiceStatus', safeHandler(async () => {
    return await elevationManager.queryServiceStatus()
  }, 'service:getWindowsServiceStatus'))

  ipcMain.handle('service:installWithElevation', safeHandler(async () => {
    logFn('info', '请求 UAC 提权安装服务')
    const result = await elevationManager.installService()
    if (result.success) logFn('info', '服务安装成功')
    else logFn('error', '服务安装失败: ' + (result.error || '未知错误'))
    return result
  }, 'service:installWithElevation'))

  ipcMain.handle('service:uninstallWithElevation', safeHandler(async () => {
    logFn('info', '请求 UAC 提权卸载服务')
    const result = await elevationManager.uninstallService()
    if (result.success) logFn('info', '服务卸载成功')
    else logFn('error', '服务卸载失败: ' + (result.error || '未知错误'))
    return result
  }, 'service:uninstallWithElevation'))

  ipcMain.handle('service:startWindowsService', safeHandler(async () => {
    logFn('info', '启动 Windows 服务')
    const result = await elevationManager.startService()
    if (result.success) logFn('info', '服务启动成功')
    else logFn('error', '服务启动失败: ' + (result.error || '未知错误'))
    return result
  }, 'service:startWindowsService'))

  ipcMain.handle('service:stopWindowsService', safeHandler(async () => {
    logFn('info', '停止 Windows 服务')
    const result = await elevationManager.stopService()
    if (result.success) logFn('info', '服务停止成功')
    else logFn('error', '服务停止失败: ' + (result.error || '未知错误'))
    return result
  }, 'service:stopWindowsService'))

  ipcMain.handle('service:startWithElevation', safeHandler(async () => {
    logFn('info', '请求 UAC 提权启动服务')
    const result = await elevationManager.startService()
    if (result.success) logFn('info', '服务启动成功')
    else logFn('error', '服务启动失败: ' + (result.error || '未知错误'))
    return result
  }, 'service:startWithElevation'))

  ipcMain.handle('service:stopWithElevation', safeHandler(async () => {
    logFn('info', '请求 UAC 提权停止服务')
    const result = await elevationManager.stopService()
    if (result.success) logFn('info', '服务停止成功')
    else logFn('error', '服务停止失败: ' + (result.error || '未知错误'))
    return result
  }, 'service:stopWithElevation'))
}

module.exports = { register }