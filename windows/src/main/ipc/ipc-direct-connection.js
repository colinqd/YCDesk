const { ipcMain } = require('electron')

function register(safeHandler, directServer, inputHandler) {
  ipcMain.handle('get-local-ips', safeHandler(() => {
    try {
      return directServer.getLocalIps()
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'get-local-ips'))

  ipcMain.handle('start-direct-server', safeHandler(async (event, port) => {
    try {
      return await directServer.startDirectServerImpl(port)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'start-direct-server'))

  ipcMain.handle('stop-direct-server', safeHandler(async () => {
    try {
      return await directServer.stopDirectServerImpl()
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'stop-direct-server'))

  ipcMain.handle('connect-direct-client', safeHandler(async (event, params) => {
    try {
      return await directServer.connectDirectClientImpl(params.host, params.port)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'connect-direct-client'))

  ipcMain.handle('send-direct-message', safeHandler(async (event, params) => {
    try {
      return await directServer.sendDirectMessageImpl(params.clientId, params.message)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'send-direct-message'))

  ipcMain.handle('close-direct-connection', safeHandler(async (event, clientId) => {
    try {
      if (inputHandler) inputHandler.cleanup()
      return await directServer.closeDirectConnectionImpl(clientId)
    } catch (e) {
      return { success: false, error: e.message }
    }
  }, 'close-direct-connection'))
}

module.exports = { register }