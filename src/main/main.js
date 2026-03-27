const { app } = require('electron')
const path = require('path')
const os = require('os')
const { createMainWindow, createRemoteWindow } = require('./window-manager')
const { init: initIpcHandlers, generateDeviceId } = require('./ipc-handlers')
const { createLogger } = require('./logger')

const logger = createLogger({
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
})

const instanceId = Math.random().toString(36).substr(2, 8)
const userDataPath = path.join(os.tmpdir(), `ycdesk-${instanceId}`)
const deviceId = generateDeviceId()

app.setPath('userData', userDataPath)
app.setAppUserModelId(`com.ycdesk.desktop.${instanceId}`)

app.commandLine.appendSwitch('disable-features', 'SingleProcess')
app.commandLine.appendSwitch('disable-gpu-sandbox')

app.whenReady().then(() => {
  logger.info('YCDesk 启动中...')
  logger.info('Electron 版本:', { version: process.versions.electron })
  logger.info('Node 版本:', { version: process.versions.node })
  logger.info('平台:', { platform: process.platform })
  logger.info('日志目录:', { dir: logger.getLogDir() })
  
  initIpcHandlers(deviceId, logger)
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
  logger.info('YCDesk 正在退出...')
})

logger.info('YCDesk 主进程已加载')
