const { app } = require('electron')
const path = require('path')
const os = require('os')
const { createMainWindow, createRemoteWindow } = require('./window-manager')
const { init: initIpcHandlers, generateDeviceId, loadDeviceId } = require('./ipc-handlers')
const { createLogger } = require('./logger')

const isDevelopment = process.env.NODE_ENV === 'development'

const logger = createLogger({
  logLevel: isDevelopment ? 'debug' : 'info'
})

const instanceId = Math.random().toString(36).substr(2, 8)
const userDataPath = path.join(os.tmpdir(), `ycdesk-${instanceId}`)
const deviceId = loadDeviceId()

app.setPath('userData', userDataPath)
app.setAppUserModelId(`com.ycdesk.desktop.${instanceId}`)

app.commandLine.appendSwitch('disable-features', 'SingleProcess')
app.commandLine.appendSwitch('disable-gpu-sandbox')

// 允许自签名证书（仅开发环境）
if (isDevelopment) {
  app.commandLine.appendSwitch('ignore-certificate-errors')
  app.commandLine.appendSwitch('allow-insecure-localhost')
}

// 处理证书错误
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDevelopment) {
    logger.warn('忽略证书错误（开发环境）:', { url, error })
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})

app.whenReady().then(() => {
  logger.info('YCDesk 启动中...')
  logger.info('Electron 版本:', { version: process.versions.electron })
  logger.info('Node 版本:', { version: process.versions.node })
  logger.info('平台:', { platform: process.platform })
  logger.info('设备ID:', { deviceId: deviceId })
  
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
