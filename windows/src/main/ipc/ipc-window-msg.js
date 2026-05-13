const { ipcMain } = require('electron')

function register(safeHandler, getRemoteWindow, getMainWindow, logFn, windowManager) {
  let remoteStreamInfo = null

  ipcMain.handle('open-remote-window', safeHandler(() => {
    logFn('info', '打开远程控制窗口')
    windowManager.createRemoteWindow()
    return true
  }, 'open-remote-window'))

  ipcMain.handle('set-remote-stream-info', safeHandler((event, info) => {
    remoteStreamInfo = info
    return true
  }, 'set-remote-stream-info'))

  ipcMain.handle('get-remote-stream-info', safeHandler(() => remoteStreamInfo, 'get-remote-stream-info'))

  ipcMain.handle('send-to-remote-window', safeHandler((event, channel, data) => {
    const w = getRemoteWindow()
    if (w) { w.webContents.send(channel, data); return true }
    return false
  }, 'send-to-remote-window'))

  ipcMain.handle('send-to-main-window', safeHandler((event, channel, data) => {
    const w = getMainWindow()
    if (w) { w.webContents.send(channel, data); return true }
    return false
  }, 'send-to-main-window'))

  ipcMain.on('send-signaling-offer', (event, data) => forwardToMain(getMainWindow(), 'send-signaling-offer', data))
  ipcMain.on('send-signaling-answer', (event, data) => forwardToMain(getMainWindow(), 'send-signaling-answer', data))
  ipcMain.on('send-signaling-ice-candidate', (event, data) => forwardToMain(getMainWindow(), 'send-signaling-ice-candidate', data))
}

function forwardToMain(mainWindow, channel, data) {
  if (mainWindow) mainWindow.webContents.send(channel, data)
}

module.exports = { register }