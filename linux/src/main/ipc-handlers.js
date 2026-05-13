const {
  getMainWindow,
  getRemoteWindow,
  minimizeMainWindow,
  maximizeMainWindow,
  closeMainWindow,
  showMainWindow,
  createRemoteWindow,
  createTray
} = require('./window-manager')
const { ipcMain } = require('electron')
const inputHandler = require('./input-handler')
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

const ipcDevice = require('./ipc/ipc-device')
const ipcScreen = require('./ipc/ipc-screen')
const ipcWindowMsg = require('./ipc/ipc-window-msg')
const ipcInput = require('./ipc/ipc-input')
const ipcAuth = require('./ipc/ipc-auth')
const ipcDirectConnection = require('./ipc/ipc-direct-connection')
const ipcSignaling = require('./ipc/ipc-signaling')
const ipcWindow = require('./ipc/ipc-window')
const ipcService = require('./ipc/ipc-service')
const ipcDeviceList = require('./ipc/ipc-device-list')

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
  createTray()

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

  ipcService.register(safeIpcHandler, log)
  ipcDeviceList.register(safeIpcHandler, getDeviceListManager, log)

  ipcMain.on('set-log-role', (event, role) => {
    if (logger && logger.setRole) logger.setRole(role)
  })
}

function cleanup() {
  log('info', '清理 IPC 处理器')
  inputHandler.cleanup()
  cleanupDirectServer()
  signalingServer.disconnect()
}

module.exports = {
  init,
  loadDeviceId: ipcDevice.loadDeviceId
}