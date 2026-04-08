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
      if (uiManager.showIncomingConnectionDialog(fromDeviceId)) {
        acceptConnection()
      } else {
        rejectConnection()
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
    uiManager.connectionLogDiv.scrollTop = uiManager.connectionLogDiv.scrollHeight
  }
}

function renderHistory(type) {
  const history = historyManager.loadHistory(type)
  const listId = type === 'direct' ? 'directHistoryList' : 'signalingHistoryList'
  const listEl = document.getElementById(listId)

  if (!listEl) return

  if (history.length === 0) {
    listEl.innerHTML = '<div class="history-empty">暂无历史连接记录</div>'
    return
  }

  listEl.innerHTML = history.map((item, index) => {
    const time = new Date(item.timestamp).toLocaleString('zh-CN')
    let targetText = ''

    if (type === 'direct') {
      targetText = `${item.ip}:${item.port}`
    } else {
      targetText = `设备: ${item.deviceId}`
    }

    return `
      <div class="history-item">
        <div class="history-info">
          <div class="history-target">${targetText}</div>
          <div class="history-time">${time}</div>
        </div>
        <div class="history-actions">
          <button class="history-btn history-btn-connect" onclick="reconnectFromHistory('${type}', ${index})">重连</button>
          <button class="history-btn history-btn-delete" onclick="deleteFromHistory('${type}', ${index})">删除</button>
        </div>
      </div>
    `
  }).join('')
}

function reconnectFromHistory(type, index) {
  const item = historyManager.getHistoryItem(type, index)
  if (!item) return

  if (type === 'direct') {
    document.getElementById('remoteIp').value = item.ip
    document.getElementById('remotePort').value = item.port
    connectDirect()
  } else {
    document.getElementById('controllerServerUrl').value = item.serverUrl
    document.getElementById('targetDeviceId').value = item.deviceId

    if (!signalingManager.socket || !signalingManager.socket.connected) {
      controllerConnectToServer()
    } else {
      connectDevice()
    }
  }
}

function deleteFromHistory(type, index) {
  historyManager.deleteFromHistory(type, index)
  renderHistory(type)
}

function selectRole(role) {
  const selectedRole = uiManager.selectRole(role)

  if (selectedRole === 'controlled') {
    initControlled()
  } else {
    initController()
  }
}

function switchControlledMode(mode) {
  currentControlledMode = mode
  uiManager.switchMode('controlled', mode)

  if (mode === 'direct') {
    if (signalingManager) {
      signalingManager.disconnect()
    }
  } else {
    stopListening()
  }

  log('被控端切换到 ' + (mode === 'direct' ? '直连模式' : '信令服务器模式'))
}

function switchControllerMode(mode) {
  currentControllerMode = mode
  uiManager.switchMode('controller', mode)

  if (mode === 'direct') {
    if (signalingManager) {
      signalingManager.disconnect()
    }
  }

  log('主控端切换到 ' + (mode === 'direct' ? '直连模式' : '信令服务器模式'))
}

function goBack() {
  uiManager.goBack()
  stopListening()
  if (signalingManager) {
    signalingManager.disconnect()
  }
}

async function initControlled() {
  myDeviceId = await window.electronAPI.getDeviceId()
  uiManager.setDeviceId(myDeviceId)
  signalingManager.setDeviceId(myDeviceId)
  directManager.setDeviceId(myDeviceId)

  log('YCDesk 被控端初始化完成，设备ID: ' + myDeviceId)

  window.electronAPI.on('direct-incoming-connection', (data) => {
    log('收到来自 ' + data.remoteAddress + ':' + data.remotePort + ' 的连接')
    directManager.startControlledConnection(data.clientId)
  })

  window.electronAPI.on('direct-message', async (data) => {
    await directManager.handleMessage(data.clientId, data.message)
  })

  window.electronAPI.on('direct-connection-closed', (data) => {
    log('连接已关闭')
    uiManager.updateServerStatus('就绪', 'disconnected')
  })

  await getLocalIps()
}

async function initController() {
  myDeviceId = await window.electronAPI.getDeviceId()
  signalingManager.setDeviceId(myDeviceId)
  directManager.setDeviceId(myDeviceId)

  log('YCDesk 主控端初始化完成，设备ID: ' + myDeviceId)

  window.electronAPI.on('direct-message', async (data) => {
    await directManager.handleMessage(data.clientId, data.message)
  })

  window.electronAPI.on('direct-connection-closed', (data) => {
    log('连接已关闭')
  })

  window.electronAPI.on('remote-window-ready', async () => {
    log('收到远程窗口准备就绪信号')
    
    // 检查信令模式是否有待发送的启动信号
    if (signalingManager && signalingManager.pendingStartSignal) {
      log('发送信令模式启动信号到远程窗口: ' + JSON.stringify(signalingManager.pendingStartSignal))
      try {
        const result = await window.electronAPI.sendToRemoteWindow('signaling-mode-start', signalingManager.pendingStartSignal)
        log('sendToRemoteWindow 返回: ' + JSON.stringify(result))
      } catch (error) {
        log('sendToRemoteWindow 错误: ' + error.message)
      }
      signalingManager.pendingStartSignal = null
    }
    
    // 检查直连模式是否有待发送的启动信号
    if (directManager && directManager.pendingStartSignal) {
      log('发送直连模式启动信号到远程窗口: ' + JSON.stringify(directManager.pendingStartSignal))
      try {
        const result = await window.electronAPI.sendToRemoteWindow('direct-mode-start', directManager.pendingStartSignal)
        log('sendToRemoteWindow 返回: ' + JSON.stringify(result))
      } catch (error) {
        log('sendToRemoteWindow 错误: ' + error.message)
      }
      directManager.pendingStartSignal = null
    }
  })

  window.electronAPI.on('webrtc-offer', async (data) => {
    log('收到远程窗口的offer，转发给被控端')
    directManager.sendMessage({
      type: 'offer',
      offer: data.offer
    })
  })

  window.electronAPI.on('webrtc-answer', async (data) => {
    log('收到远程窗口的answer，转发给被控端')
    directManager.sendMessage({
      type: 'answer',
      answer: data.answer
    })
  })

  window.electronAPI.on('webrtc-ice-candidate', async (data) => {
    log('收到远程窗口的ICE候选，转发给被控端')
    directManager.sendMessage({
      type: 'ice-candidate',
      candidate: data.candidate
    })
  })

  renderHistory('direct')
  renderHistory('signaling')
}

async function getLocalIps() {
  try {
    const ipList = await window.electronAPI.getLocalIps()
    uiManager.updateLocalIpList(ipList)
    log('获取本地IP地址成功')
  } catch (error) {
    log('获取本地IP地址失败: ' + error.message)
    uiManager.updateLocalIpList([])
  }
}

async function startListening() {
  console.log('startListening 函数被调用')
  const port = uiManager.getListenPort()
  console.log('获取到的端口:', port)
  if (!uiManager._validatePort(port)) {
    alert('请输入有效的端口号 (1024-65535)')
    return
  }

  console.log('调用 directManager.startListening')
  await directManager.startListening(port)
}

async function stopListening() {
  await directManager.stopListening()
}

async function connectDirect() {
  const remoteIp = uiManager.getRemoteIp()
  const remotePort = uiManager.getRemotePort()

  if (!remoteIp) {
    alert('请输入对方IP地址')
    return
  }

  if (!uiManager._validateIpAddress(remoteIp) && remoteIp !== 'localhost') {
    alert('请输入有效的IP地址')
    return
  }

  if (!uiManager._validatePort(remotePort)) {
    alert('请输入有效的端口号 (1024-65535)')
    return
  }

  const success = await directManager.connect(remoteIp, remotePort)
  if (success) {
    historyManager.saveToHistory('direct', { ip: remoteIp, port: remotePort })
    renderHistory('direct')
  }
}

async function controlledConnectToServer() {
  const serverUrl = uiManager.getControlledServerUrl()
  connectionManager.saveRoleAndServer('controlled', serverUrl)
  connectionManager.cancelReconnect()

  await signalingManager.connect(serverUrl, 'controlled')
}

function controlledDisconnectFromServer() {
  signalingManager.disconnect()
}

async function controllerConnectToServer() {
  const serverUrl = uiManager.getControllerServerUrl()
  connectionManager.saveRoleAndServer('controller', serverUrl)
  connectionManager.cancelReconnect()

  await signalingManager.connect(serverUrl, 'controller')
}

function controllerDisconnectFromServer() {
  signalingManager.disconnect()
}

function connectDevice() {
  const targetDeviceId = uiManager.getTargetDeviceId()
  if (!uiManager._validateDeviceId(targetDeviceId)) {
    alert('请输入有效的设备 ID（需要 9 位字符）')
    return false
  }
  if (targetDeviceId === myDeviceId) {
    alert('不能连接自己')
    return false
  }
  if (!signalingManager.socket || !signalingManager.socket.connected) {
    alert('未连接到信令服务器，请先连接服务器')
    return false
  }
  if (signalingManager.connectDevice(targetDeviceId)) {
    historyManager.saveToHistory('signaling', {
      deviceId: targetDeviceId,
      serverUrl: uiManager.getControllerServerUrl()
    })
    renderHistory('signaling')
  }
}

function acceptConnection() {
  signalingManager.acceptConnection()
}

function rejectConnection() {
  signalingManager.rejectConnection()
}

function copyDeviceId() {
  uiManager.copyDeviceId(myDeviceId)
}

function openRemoteWindow() {
  window.electronAPI.openRemoteWindow()
}

async function minimizeWindow() {
  try {
    await window.electronAPI.windowMinimize()
  } catch (e) {
    console.error('最小化失败:', e)
  }
}

async function closeWindow() {
  try {
    await window.electronAPI.windowClose()
  } catch (e) {
    console.error('关闭失败:', e)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeApp()
})
