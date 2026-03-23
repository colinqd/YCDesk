const { app } = require('electron')
const path = require('path')
const os = require('os')
const { createMainWindow, createRemoteWindow } = require('./window-manager')
const { init: initIpcHandlers, generateDeviceId } = require('./ipc-handlers')

const instanceId = Math.random().toString(36).substr(2, 8)
const userDataPath = path.join(os.tmpdir(), `ycdesk-${instanceId}`)
const deviceId = generateDeviceId()

app.setPath('userData', userDataPath)
app.setAppUserModelId(`com.ycdesk.desktop.${instanceId}`)

app.commandLine.appendSwitch('disable-features', 'SingleProcess')
app.commandLine.appendSwitch('disable-gpu-sandbox')

app.whenReady().then(() => {
  console.log('YCDesk 启动中...')
  console.log('Electron 版本:', process.versions.electron)
  console.log('Node 版本:', process.versions.node)
  console.log('平台:', process.platform)
  
  initIpcHandlers(deviceId)
  createMainWindow()

  app.on('activate', () => {
    if (require('electron').BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  console.log('YCDesk 正在退出...')
})

console.log('YCDesk 主进程已加载')
