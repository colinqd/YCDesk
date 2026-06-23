const { ipcMain } = require('electron')

function register(safeHandler, deviceListManager) {
  ipcMain.handle('device-list:get', safeHandler(async () => {
    try {
      const devices = deviceListManager.getDevices()
      return { success: true, devices }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'device-list:get'))

  ipcMain.handle('device-list:add', safeHandler(async (event, { deviceId, alias, serverUrl }) => {
    try {
      return deviceListManager.addDevice(deviceId, alias, serverUrl)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'device-list:add'))

  ipcMain.handle('device-list:remove', safeHandler(async (event, { deviceId }) => {
    try {
      return deviceListManager.removeDevice(deviceId)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'device-list:remove'))

  ipcMain.handle('device-list:update-alias', safeHandler(async (event, { deviceId, alias }) => {
    try {
      return deviceListManager.updateDeviceAlias(deviceId, alias)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'device-list:update-alias'))

  ipcMain.handle('device-list:clear', safeHandler(async () => {
    try {
      return deviceListManager.clearDevices()
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'device-list:clear'))

  // ==================== 信令服务器列表 ====================

  ipcMain.handle('signaling-server:get', safeHandler(async () => {
    try {
      const servers = deviceListManager.getServers()
      return { success: true, servers }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'signaling-server:get'))

  ipcMain.handle('signaling-server:save', safeHandler(async (event, servers) => {
    try {
      return deviceListManager.saveServers(servers)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'signaling-server:save'))

  ipcMain.handle('signaling-server:add', safeHandler(async (event, { name, url }) => {
    try {
      return deviceListManager.addServer(name, url)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'signaling-server:add'))

  ipcMain.handle('signaling-server:edit', safeHandler(async (event, { index, name, url }) => {
    try {
      return deviceListManager.editServer(index, name, url)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'signaling-server:edit'))

  ipcMain.handle('signaling-server:delete', safeHandler(async (event, { index }) => {
    try {
      return deviceListManager.deleteServer(index)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'signaling-server:delete'))
}

module.exports = { register }