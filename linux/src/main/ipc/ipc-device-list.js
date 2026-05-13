const { ipcMain } = require('electron')

function register(safeHandler, getDeviceListManager, logFn) {
  ipcMain.handle('device-list:add', safeHandler((event, deviceId, alias, serverUrl) => {
    const manager = getDeviceListManager({ log: (msg) => logFn('info', msg) })
    return manager.addDevice(deviceId, alias, serverUrl)
  }, 'device-list:add'))

  ipcMain.handle('device-list:remove', safeHandler((event, deviceId) => {
    const manager = getDeviceListManager({ log: (msg) => logFn('info', msg) })
    return manager.removeDevice(deviceId)
  }, 'device-list:remove'))

  ipcMain.handle('device-list:get', safeHandler(() => {
    const manager = getDeviceListManager({ log: (msg) => logFn('info', msg) })
    return manager.getDevices()
  }, 'device-list:get'))

  ipcMain.handle('device-list:updateAlias', safeHandler((event, deviceId, alias) => {
    const manager = getDeviceListManager({ log: (msg) => logFn('info', msg) })
    return manager.updateDeviceAlias(deviceId, alias)
  }, 'device-list:updateAlias'))

  ipcMain.handle('device-list:clear', safeHandler(() => {
    const manager = getDeviceListManager({ log: (msg) => logFn('info', msg) })
    return manager.clearDevices()
  }, 'device-list:clear'))
}

module.exports = { register }