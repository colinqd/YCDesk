const { ipcMain } = require('electron')

function register(safeHandler, deviceListManager) {
  ipcMain.handle('device-list:get', safeHandler(async () => {
    const devices = deviceListManager.getDevices()
    return { success: true, devices }
  }, 'device-list:get'))

  ipcMain.handle('device-list:add', safeHandler(async (event, { deviceId, alias, serverUrl }) => {
    return deviceListManager.addDevice(deviceId, alias, serverUrl)
  }, 'device-list:add'))

  ipcMain.handle('device-list:remove', safeHandler(async (event, { deviceId }) => {
    return deviceListManager.removeDevice(deviceId)
  }, 'device-list:remove'))

  ipcMain.handle('device-list:update-alias', safeHandler(async (event, { deviceId, alias }) => {
    return deviceListManager.updateDeviceAlias(deviceId, alias)
  }, 'device-list:update-alias'))

  ipcMain.handle('device-list:clear', safeHandler(async () => {
    return deviceListManager.clearDevices()
  }, 'device-list:clear'))

  // ==================== 信令服务器列表 ====================

  ipcMain.handle('signaling-server:get', safeHandler(async () => {
    const servers = deviceListManager.getServers()
    return { success: true, servers }
  }, 'signaling-server:get'))

  ipcMain.handle('signaling-server:save', safeHandler(async (event, servers) => {
    return deviceListManager.saveServers(servers)
  }, 'signaling-server:save'))

  ipcMain.handle('signaling-server:add', safeHandler(async (event, { name, url }) => {
    return deviceListManager.addServer(name, url)
  }, 'signaling-server:add'))

  ipcMain.handle('signaling-server:edit', safeHandler(async (event, { index, name, url }) => {
    return deviceListManager.editServer(index, name, url)
  }, 'signaling-server:edit'))

  ipcMain.handle('signaling-server:delete', safeHandler(async (event, { index }) => {
    return deviceListManager.deleteServer(index)
  }, 'signaling-server:delete'))
}

module.exports = { register }