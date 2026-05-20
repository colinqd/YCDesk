const { app } = require('electron')
const path = require('path')
const os = require('os')
const { createMainWindow, createRemoteWindow, createTray } = require('./window-manager')
const { init: initIpcHandlers, generateDeviceId, loadDeviceId } = require('./ipc-handlers')
const { createLogger } = require('./logger')
const { getServiceIntegration } = require('./service-integration')

const isDevelopment = !app.isPackaged && process.env.NODE_ENV === 'development'

const logger = createLogger({
  logLevel: isDevelopment ? 'debug' : 'info'
})

app.setPath('userData', path.join(os.homedir(), '.ycdesk'))
app.setAppUserModelId('com.ycdesk.desktop')

const deviceId = loadDeviceId()

app.commandLine.appendSwitch('disable-features', 'SingleProcess')

// 仅在非打包模式下且设置了环境变量时禁用 GPU 沙箱
// 使用场景：某些 NVIDIA 显卡驱动（<545.x）使用 NvFBC/NvENC 硬件编码时需要禁用沙箱
// 启用方式：YCDESK_DISABLE_GPU_SANDBOX=1 npm start
// 打包后的应用始终启用 GPU 沙箱以保障安全性
if (!app.isPackaged && process.env.YCDESK_DISABLE_GPU_SANDBOX === '1') {
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  logger.warn('GPU沙箱已禁用（YCDESK_DISABLE_GPU_SANDBOX=1）')
}

if (isDevelopment) {
  app.commandLine.appendSwitch('ignore-certificate-errors')
  app.commandLine.appendSwitch('allow-insecure-localhost')
  logger.warn('开发模式：证书验证已禁用')
}

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDevelopment) {
    logger.warn('忽略证书错误（开发环境）:', { url, error })
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})

process.on('uncaughtException', (error) => {
  logger.fatal('未捕获异常', { error: error.message, stack: error.stack?.split('\n').slice(0, 5).join('\n') })
  setTimeout(() => process.exit(1), 1000)
})

process.on('unhandledRejection', (reason) => {
  logger.error('未处理的Promise拒绝', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack?.split('\n').slice(0, 3).join('\n') : undefined
  })
})

app.on('render-process-gone', (event, webContents, details) => {
  logger.error('渲染进程崩溃', {
    reason: details.reason,
    exitCode: details.exitCode,
    url: webContents.getURL()
  })
  if (details.reason === 'crashed' || details.reason === 'oom') {
    webContents.reload()
  }
})

app.on('child-process-gone', (event, details) => {
  logger.error('子进程异常退出', { type: details.type, reason: details.reason, exitCode: details.exitCode })
})

app.whenReady().then(() => {
  logger.info('YCDesk 启动中...')
  logger.info('Electron 版本:', { version: process.versions.electron })
  logger.info('Node 版本:', { version: process.versions.node })
  logger.info('平台:', { platform: process.platform })
  logger.info('设备ID:', { deviceId: deviceId })
  logger.info('用户数据目录:', { userData: app.getPath('userData') })

  const serviceIntegration = getServiceIntegration({ logger })
  if (process.env.YCDESK_SERVICE_MODE === '1') {
    serviceIntegration.setServiceModeEnabled(true)
  }

  initIpcHandlers(deviceId, logger)

  createMainWindow()
  createTray()

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
  try { getServiceIntegration().disconnect() } catch (e) {}
})

logger.info('YCDesk 主进程已加载')