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
}

module.exports = { register }