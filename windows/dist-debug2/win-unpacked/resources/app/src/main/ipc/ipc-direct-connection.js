const { ipcMain } = require('electron')

function register(safeHandler, directServer, inputHandler) {
  ipcMain.handle('get-local-ips', safeHandler(() => directServer.getLocalIps(), 'get-local-ips'))
  ipcMain.handle('start-direct-server', safeHandler((event, port) => directServer.startDirectServerImpl(port), 'start-direct-server'))
  ipcMain.handle('stop-direct-server', safeHandler(() => directServer.stopDirectServerImpl(), 'stop-direct-server'))
  ipcMain.handle('connect-direct-client', safeHandler((event, params) => directServer.connectDirectClientImpl(params.host, params.port), 'connect-direct-client'))
  ipcMain.handle('send-direct-message', safeHandler((event, params) => directServer.sendDirectMessageImpl(params.clientId, params.message), 'send-direct-message'))
  ipcMain.handle('close-direct-connection', safeHandler((event, clientId) => {
    if (inputHandler) inputHandler.cleanup()
    return directServer.closeDirectConnectionImpl(clientId)
  }, 'close-direct-connection'))
}

module.exports = { register }