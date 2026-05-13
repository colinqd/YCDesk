const {
  getMainWindow,
  getRemoteWindow,
  minimizeMainWindow,
  maximizeMainWindow,
  closeMainWindow,
  showMainWindow,
  createRemoteWindow
} = require('./window-manager')
const inputHandler = require('./input-handler')
const credentialsManager = require('./credentials-manager')
const autoUnlockService = require('./auto-unlock-service')
const { getDeviceListManager } = require('./device-list-manager')
const {
  getLocalIps,
  startDirectServerImpl,
  stopDirectServerImpl,
  connectDirectClientImpl,
  sendDirectMessageImpl,
  closeDirectConnectionImpl,
  initLogger: initDirectServerLogger,
  cleanup: cleanupDirectServer
} = require('./direct-server')
const signalingServer = require('./signaling-server')
const authManager = require('./auth-manager')
const { getServiceIntegration, SERVICE_STATE } = require('./service-integration')
const elevationManager = require('./elevation-manager')
const testUnlockLogger = require('./test-unlock-logger')

const ipcDevice = require('./ipc/ipc-device')
const ipcScreen = require('./ipc/ipc-screen')
const ipcWindowMsg = require('./ipc/ipc-window-msg')
const ipcInput = require('./ipc/ipc-input')
const ipcAuth = require('./ipc/ipc-auth')
const ipcDirectConnection = require('./ipc/ipc-direct-connection')
const ipcSignaling = require('./ipc/ipc-signaling')
const ipcWindow = require('./ipc/ipc-window')
const ipcService = require('./ipc/ipc-service')
const ipcTestUnlock = require('./ipc/ipc-test-unlock')
const ipcCredProvider = require('./ipc/ipc-cred-provider')
const ipcElevation = require('./ipc/ipc-elevation')
const ipcDeviceList = require('./ipc/ipc-device-list')
const ipcAutoUnlock = require('./ipc/ipc-auto-unlock')
const ipcController = require('./ipc/ipc-controller')

let deviceId = null
let logger = null

function log(level, message, data) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](message, data)
  } else if (level === 'error') {
    console.error(`[IPC Error] ${message}`, data || '')
  }
}

function safeIpcHandler(handler, handlerName) {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      log('error', handlerName, { error: error.message })
      throw error
    }
  }
}

function init(deviceIdParam, loggerParam) {
  deviceId = deviceIdParam
  logger = loggerParam

  inputHandler.initLogger(logger)
  initDirectServerLogger(logger)

  log('info', 'IPC 处理器初始化', { deviceId })

  signalingServer.init(deviceId, logger)

  ipcDevice.register(deviceId, logger, safeIpcHandler,
    (newId) => signalingServer.updateDeviceId(newId))
  ipcScreen.register(safeIpcHandler, log)
  ipcWindow.register(safeIpcHandler, {
    minimizeMainWindow, maximizeMainWindow, closeMainWindow, showMainWindow
  })
  ipcWindowMsg.register(safeIpcHandler, getRemoteWindow, getMainWindow, log, { createRemoteWindow })
  ipcInput.register(safeIpcHandler, log, getMainWindow, inputHandler)
  ipcAuth.register(safeIpcHandler, authManager)

  ipcDirectConnection.register(safeIpcHandler, {
    getLocalIps, startDirectServerImpl, stopDirectServerImpl,
    connectDirectClientImpl, sendDirectMessageImpl, closeDirectConnectionImpl
  }, inputHandler)

  ipcSignaling.register(safeIpcHandler, log, getMainWindow, signalingServer, inputHandler)

  const serviceIntegration = getServiceIntegration({ logger })

  ipcService.register(safeIpcHandler, serviceIntegration, getMainWindow, getRemoteWindow, log)

  ipcTestUnlock.register(safeIpcHandler, log, testUnlockLogger, getServiceIntegration, SERVICE_STATE, inputHandler)

  ipcCredProvider.register(safeIpcHandler, log)
  ipcElevation.register(safeIpcHandler, elevationManager, log)

  ipcAutoUnlock.register(safeIpcHandler, credentialsManager, logger)

  ipcController.register(safeIpcHandler, log, logger)

  const deviceListManager = getDeviceListManager({ log })
  ipcDeviceList.register(safeIpcHandler, deviceListManager)
}

function notifyAllWindows(channel, data) {
  const windows = [getMainWindow(), getRemoteWindow()]
  for (const win of windows) {
    if (win && !win.isDestroyed()) {
      try { win.webContents.send(channel, data) } catch (e) {}
    }
  }
}

function cleanup() {
  log('info', '清理 IPC 处理器')
  inputHandler.cleanup()
  cleanupDirectServer()
  signalingServer.disconnect()

  const serviceIntegration = getServiceIntegration()
  if (serviceIntegration) {
    serviceIntegration.disconnect().catch(err => {
      log('error', '清理服务集成失败', { error: err.message })
    })
  }
}

module.exports = {
  init,
  generateDeviceId: ipcDevice.generateDeviceId,
  loadDeviceId: ipcDevice.loadDeviceId,
  cleanup
}