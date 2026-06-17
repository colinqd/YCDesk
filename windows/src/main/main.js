const { app } = require('electron')
const path = require('path')
const os = require('os')
const { Worker } = require('worker_threads')
const { createMainWindow, createRemoteWindow, createTray } = require('./window-manager')
const { init: initIpcHandlers, generateDeviceId, loadDeviceId, notifyAllWindows, loadAutoConnectConfig } = require('./ipc-handlers')
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

let watchdogWorker = null

function initWatchdog() {
  try {
    const watchdogPath = path.join(__dirname, 'watchdog.js')
    watchdogWorker = new Worker(watchdogPath)
    
    watchdogWorker.on('message', (msg) => {
      switch (msg.type) {
        case 'watchdog-log':
          logger.info('[Watchdog] ' + msg.message)
          break
        case 'watchdog-ping':
          watchdogWorker.postMessage({ type: 'watchdog-pong' })
          break
        case 'watchdog-force-reconnect':
          logger.warn('[Watchdog] 自动强制重连: ' + JSON.stringify(msg))
          // 直接执行恢复，不通知用户
          handleWatchdogRecovery({ action: 'force-reconnect', reason: msg.reason, level: msg.level })
          break
        case 'watchdog-recover':
          logger.warn('[Watchdog] 自动恢复: ' + JSON.stringify(msg))
          handleWatchdogRecovery(msg)
          break
      }
    })
    
    watchdogWorker.on('error', (error) => {
      logger.error('[Watchdog] Worker 错误:', error.message)
    })
    
    watchdogWorker.on('exit', (code) => {
      logger.warn('[Watchdog] Worker 线程退出, code:', code)
      watchdogWorker = null
    })
    
    // 启动监控
    watchdogWorker.postMessage({ type: 'watchdog-start' })
    
    // 定期发送状态到 watchdog
    setInterval(() => {
      if (watchdogWorker) {
        const status = getConnectionHealthStatus()
        watchdogWorker.postMessage({
          type: 'watchdog-status',
          webrtcStatus: status,
          memoryUsage: process.memoryUsage().heapUsed
        })
      }
    }, 5000)
    
    logger.info('Watchdog 监控已启动')
  } catch (e) {
    logger.error('Watchdog 启动失败:', e.message)
  }
}

// 连接健康状态缓存（渲染进程通过 watchdog-status-response 更新）
global.connectionHealthCache = { connected: false, dataChannelOpen: false, connectionState: 'unknown', disconnected: false, lastUpdated: 0 }

function getConnectionHealthStatus() {
  // 从所有渲染进程收集连接健康状态
  const { BrowserWindow } = require('electron')

  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length === 0) return global.connectionHealthCache

  // 异步请求窗口的连接状态，结果通过 watchdog-status-response 异步更新缓存
  for (const win of allWindows) {
    if (!win.isDestroyed() && win.webContents) {
      try {
        win.webContents.send('watchdog-query-status')
      } catch (e) { /* ignore */ }
    }
  }

  return global.connectionHealthCache
}

function handleWatchdogRecovery(msg) {
  switch (msg.action) {
    case 'data-channel-recovery':
      // 自动触发数据通道恢复（渲染进程内自动执行，无弹窗）
      notifyAllWindows('watchdog-recover', { action: 'data-channel-recovery' })
      break
    case 'ice-restart':
      // 自动触发 ICE restart（渲染进程内自动执行，无弹窗）
      notifyAllWindows('watchdog-recover', { action: 'ice-restart' })
      break
    case 'force-reconnect':
      // 完全重连：通知渲染进程断开并重新通过信令服务器建立连接
      notifyAllWindows('watchdog-recover', { action: 'force-reconnect', level: msg.level })
      break
    case 'memory-warning':
      logger.warn('[Watchdog] 内存警告: ' + msg.level)
      // 自动触发 GC（不打扰用户）
      if (global.gc) { global.gc() }
      break
  }
}

function stopWatchdog() {
  if (watchdogWorker) {
    watchdogWorker.postMessage({ type: 'watchdog-stop' })
    setTimeout(() => {
      if (watchdogWorker) {
        try { watchdogWorker.terminate() } catch (e) {}
        watchdogWorker = null
      }
    }, 1000)
    logger.info('Watchdog 已停止')
  }
}

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

  const isAutoStart = process.argv.includes('--auto-start')
  if (isAutoStart) {
    logger.info('检测到自启动模式 (--auto-start)', { execPath: process.execPath })
  }

  const isServiceMode = process.argv.includes('--service-mode')
  if (isServiceMode) {
    logger.info('检测到服务模式 (--service-mode)')
    // 服务模式下，启用服务集成
    serviceIntegration.setServiceModeEnabled(true)
  }

  initIpcHandlers(deviceId, logger)

  createMainWindow()
  createTray()

  initWatchdog()

  // 自启动模式：通知渲染进程自动连接并最小化窗口
  if (isAutoStart) {
    const autoConnectConfig = loadAutoConnectConfig()
    if (autoConnectConfig && autoConnectConfig.enabled) {
      const { BrowserWindow } = require('electron')
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        mainWindow.webContents.on('did-finish-load', () => {
          mainWindow.webContents.send('auto-start:trigger-auto-connect', autoConnectConfig)
          logger.info('已发送自动连接通知到渲染进程', autoConnectConfig)
        })
        // 最小化到托盘
        mainWindow.minimize()
      }
    } else {
      logger.info('自启动模式但未找到有效的自动连接配置')
    }
  }

  // 服务模式：通过 ServiceIntegration 获取信令状态并通知渲染进程
  if (isServiceMode && isAutoStart) {
    const { BrowserWindow } = require('electron')
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      mainWindow.webContents.on('did-finish-load', async () => {
        try {
          const status = await serviceIntegration.getSignalingStatus()
          logger.info('从服务获取信令状态: ' + JSON.stringify(status))
          mainWindow.webContents.send('service-mode:signaling-status', status)
        } catch (e) {
          logger.warn('获取信令状态失败: ' + e.message)
          mainWindow.webContents.send('service-mode:signaling-status', { connected: false })
        }
      })
    }
  }

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
  stopWatchdog()

  // 清理服务集成（断开命名管道连接）
  try { getServiceIntegration().disconnect() } catch (e) { logger.debug('断开服务连接时出错:', e.message) }

  // 清理直连服务器（关闭 TCP 服务器和所有客户端连接）
  try {
    const { cleanup: cleanupDirectServer } = require('./direct-server')
    cleanupDirectServer()
    logger.info('直连服务器已清理')
  } catch (e) { logger.debug('清理直连服务器时出错:', e.message) }

  // 清理输入处理器
  try {
    const { resetAllInputState } = require('./input-handler')
    resetAllInputState()
  } catch (e) { logger.debug('清理输入处理器时出错:', e.message) }
})

app.on('will-quit', () => {
  logger.info('YCDesk 即将退出，强制清理残留资源')

  // 强制清理直连服务
  try {
    const { cleanup: cleanupDirectServer } = require('./direct-server')
    cleanupDirectServer()
  } catch (e) {}

  // 强制终止 watchdog
  if (watchdogWorker) {
    try { watchdogWorker.terminate() } catch (e) {}
    watchdogWorker = null
  }

  // 销毁所有窗口
  try {
    const { BrowserWindow } = require('electron')
    BrowserWindow.getAllWindows().forEach(w => {
      try { if (!w.isDestroyed()) w.destroy() } catch (e) {}
    })
  } catch (e) {}

  logger.info('清理完成')
})

logger.info('YCDesk 主进程已加载')