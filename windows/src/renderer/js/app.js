/**
 * YCDesk 渲染进程入口 — 应用状态、初始化、日志
 *
 * 拆分自原 app.js（1453 行），职责分离至：
 *   - device-list.js    设备列表与历史记录管理
 *   - connection-status.js  信令服务器、角色切换、连接管理
 *   - settings.js       设置页面、窗口控制、解锁、捕获源
 *
 * 本文件保留：模块级状态、initializeApp、log、DOMContentLoaded 监听器。
 */

let myDeviceId = ''
let currentControlledMode = 'direct'
let currentControllerMode = 'direct'

let uiManager = null
let historyManager = null
let connectionManager = null
let signalingManager = null
let directManager = null
let networkManager = null

function initializeApp() {
  uiManager = new UIManager({
    log: log
  })

  historyManager = new HistoryManager({
    storageKeys: CONFIG.storage.keys,
    maxItems: CONFIG.maxHistoryItems,
    log: log
  })

  connectionManager = new ConnectionManager({
    maxReconnectAttempts: CONFIG.maxReconnectAttempts,
    baseReconnectDelay: CONFIG.baseReconnectDelay,
    heartbeatInterval: CONFIG.heartbeatInterval,
    log: log,
    onStatusChange: (status) => {
    }
  })

  signalingManager = new SignalingModeManager({
    log: log,
    uiManager: uiManager,
    config: CONFIG,
    onIncomingConnection: (fromDeviceId) => {
      const autoAccept = document.getElementById('autoAcceptConnection')?.checked
      if (autoAccept) {
        log('自动接受来自 ' + fromDeviceId + ' 的连接')
        acceptConnection()
      } else {
        if (uiManager.showIncomingConnectionDialog(fromDeviceId)) {
          acceptConnection()
        } else {
          rejectConnection()
        }
      }
    },
    onWebRTCConnected: (targetDeviceId, serverUrl) => {
      if (targetDeviceId) {
        saveConnectedDevice(targetDeviceId, serverUrl)
      }
    }
  })

  directManager = new DirectModeManager({
    log: log,
    uiManager: uiManager,
    config: CONFIG
  })
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString()
  const logMessage = `[${timestamp}] ${message}`
  console.log(logMessage)
  if (uiManager && uiManager.connectionLogDiv) {
    const div = document.createElement('div')
    div.textContent = logMessage
    uiManager.connectionLogDiv.appendChild(div)
    while (uiManager.connectionLogDiv.children.length > 200) {
      uiManager.connectionLogDiv.removeChild(uiManager.connectionLogDiv.firstChild)
    }
    uiManager.connectionLogDiv.scrollTop = uiManager.connectionLogDiv.scrollHeight
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeApp()

  // 加载解锁密码状态
  setTimeout(() => {
    loadUnlockPasswordStatus()
    checkCredProvider()
  }, 500)

  window.electronAPI.on('unlock-state-changed', (data) => {
    console.log('[app.js 全局] 收到 unlock-state-changed IPC: ' + JSON.stringify(data))
    if (data.isLocked) {
      updateServerStatusDisplay('已锁定', 'error')
      log('系统通知：屏幕已锁定（被控端）')
    } else {
      updateServerStatusDisplay('已连接', 'connected')
      log('系统通知：屏幕已解锁（被控端）')
    }

    if (directManager && directManager.dataChannelManager) {
      console.log('[app.js 全局] 通过 directManager 转发锁屏状态到主控端')
      directManager.dataChannelManager.send({ type: 'unlock-state-changed', ...data })
    }
    if (signalingManager && signalingManager.dataChannelManager) {
      console.log('[app.js 全局] 通过 signalingManager 转发锁屏状态到主控端')
      signalingManager.dataChannelManager.send({ type: 'unlock-state-changed', ...data })
    }
  })

  window.electronAPI.on('lock-screen-frame', (data) => {
    if (directManager && directManager.dataChannelManager) {
      directManager.dataChannelManager.send({ type: 'lock-screen-frame', ...data })
    }
    if (signalingManager && signalingManager.dataChannelManager) {
      signalingManager.dataChannelManager.send({ type: 'lock-screen-frame', ...data })
    }
  })
})
