const { ipcMain } = require('electron')

function register(safeHandler, logFn, getMainWindow, signalingServer, inputHandler) {
  ipcMain.handle('connect-signaling-server', safeHandler(async (event, url) => signalingServer.connect(url), 'connect-signaling-server'))
  ipcMain.handle('disconnect-signaling-server', safeHandler(() => {
    if (inputHandler) inputHandler.cleanup()
    signalingServer.disconnect()
    return { success: true, message: '已断开连接' }
  }, 'disconnect-signaling-server'))
  ipcMain.handle('send-connect-request', safeHandler((event, toId) => signalingServer.sendConnectRequest(toId), 'send-connect-request'))
  ipcMain.handle('send-connection-response', safeHandler((event, sid, accept, from, to) => signalingServer.sendConnectionResponse(sid, accept, from, to), 'send-connection-response'))
  ipcMain.handle('send-offer', safeHandler((event, sid, offer, to) => signalingServer.sendOffer(sid, offer, to), 'send-offer'))
  ipcMain.handle('send-answer', safeHandler((event, sid, answer, to) => signalingServer.sendAnswer(sid, answer, to), 'send-answer'))
  ipcMain.handle('send-ice-candidate', safeHandler((event, sid, cand, to) => signalingServer.sendIceCandidate(sid, cand, to), 'send-ice-candidate'))
  ipcMain.handle('get-signaling-status', safeHandler(() => signalingServer.getConnectionStatus(), 'get-signaling-status'))
}

module.exports = { register }