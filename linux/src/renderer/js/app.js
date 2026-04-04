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
  console.log('[App] 开始初始化应用...')
  console.log('[App] CONFIG 是否可用:', typeof CONFIG !== 'undefined' ? '是' : '否')
  
  try {
    uiManager = new UIManager({
      log: log
    })
    console.log('[App] uiManager 初始化成功')

    historyManager = new HistoryManager({
      storageKeys: CONFIG.storage.keys,
      maxItems: CONFIG.maxHistoryItems,
      log: log
    })
    console.log('[App] historyManager 初始化成功')

    connectionManager = new ConnectionManager({
      maxReconnectAttempts: CONFIG.maxReconnectAttempts,
      baseReconnectDelay: CONFIG.baseReconnectDelay,
      heartbeatInterval: CONFIG.heartbeatInterval,
      log: log,
      onStatusChange: (status) => {
      }
    })
    console.log('[App] connectionManager 初始化成功, saveRoleAndServer 存在:', typeof connectionManager.saveRoleAndServer === 'function')

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
    console.log('[App] signalingManager 初始化成功')

    directManager = new DirectModeManager({
      log: log,
      uiManager: uiManager,
      config: CONFIG
    })
    console.log('[App] directManager 初始化成功')
    
    console.log('[App] 应用初始化完成')
  } catch (error) {
    console.error('[App] 初始化失败:', error)
    alert('应用初始化失败: ' + error.message)
  }
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
    log('[App-Controlled] 收到直连消息: ' + data.message.type + ', 完整内容: ' + JSON.stringify(data.message).substring(0, 300))
    log('[App-Controlled] clientId: ' + data.clientId)
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
    log('[App] 收到直连消息: ' + data.message.type + ', 完整内容: ' + JSON.stringify(data.message).substring(0, 200))
    log('[App] directManager 存在: ' + (directManager ? '是' : '否'))
    log('[App] isDirectController: ' + (directManager ? directManager.isDirectController : 'N/A'))
    
    // 如果是主控端，且收到 answer 或 ice-candidate，转发到远程窗口
    if (directManager && directManager.isDirectController) {
      log('[App] 是主控端，准备转发消息')
      if (data.message.type === 'answer') {
        log('[App] 主控端收到 answer，转发到远程窗口')
        log('[App] answer 数据: ' + JSON.stringify(data.message.answer).substring(0, 200))
        try {
          const result = await window.electronAPI.sendToRemoteWindow('webrtc-answer', { answer: data.message.answer })
          log('[App] sendToRemoteWindow(answer) 返回: ' + JSON.stringify(result))
        } catch (error) {
          log('[App] sendToRemoteWindow(answer) 错误: ' + error.message)
          console.error('[App] sendToRemoteWindow(answer) 详细错误:', error)
        }
      } else if (data.message.type === 'ice-candidate') {
        log('[App] 主控端收到 ICE 候选，转发到远程窗口')
        try {
          const result = await window.electronAPI.sendToRemoteWindow('webrtc-ice-candidate', { candidate: data.message.candidate })
          log('[App] sendToRemoteWindow(ice-candidate) 返回: ' + JSON.stringify(result))
        } catch (error) {
          log('[App] sendToRemoteWindow(ice-candidate) 错误: ' + error.message)
          console.error('[App] sendToRemoteWindow(ice-candidate) 详细错误:', error)
        }
      }
    }
    await directManager.handleMessage(data.clientId, data.message)
  })

  window.electronAPI.on('direct-connection-closed', (data) => {
    log('连接已关闭')
  })

  window.electronAPI.on('remote-window-ready', async () => {
    log('[App] 收到远程窗口准备就绪信号')
    log('[App] signalingManager.pendingStartSignal:', signalingManager ? signalingManager.pendingStartSignal : 'signalingManager is null')
    log('[App] directManager.pendingStartSignal:', directManager ? directManager.pendingStartSignal : 'directManager is null')
    
    // 检查信令模式是否有待发送的启动信号
    if (signalingManager && signalingManager.pendingStartSignal) {
      log('[App] 发送信令模式启动信号到远程窗口: ' + JSON.stringify(signalingManager.pendingStartSignal))
      try {
        const result = await window.electronAPI.sendToRemoteWindow('signaling-mode-start', signalingManager.pendingStartSignal)
        log('[App] sendToRemoteWindow 返回: ' + JSON.stringify(result))
      } catch (error) {
        log('[App] sendToRemoteWindow 错误: ' + error.message)
      }
      signalingManager.pendingStartSignal = null
    }
    
    // 检查直连模式是否有待发送的启动信号
    if (directManager && directManager.pendingStartSignal) {
      log('[App] 发送直连模式启动信号到远程窗口: ' + JSON.stringify(directManager.pendingStartSignal))
      try {
        const result = await window.electronAPI.sendToRemoteWindow('direct-mode-start', directManager.pendingStartSignal)
        log('[App] sendToRemoteWindow 返回: ' + JSON.stringify(result))
      } catch (error) {
        log('[App] sendToRemoteWindow 错误: ' + error.message)
      }
      directManager.pendingStartSignal = null
    }
  })

  window.electronAPI.on('webrtc-offer', async (data) => {
    log('[App] 收到远程窗口的offer，转发给被控端')
    log('[App] offer 数据: ' + JSON.stringify(data).substring(0, 200))
    log('[App] directManager 存在: ' + (directManager ? '是' : '否'))
    if (directManager) {
      log('[App] 调用 directManager.sendMessage')
      try {
        await directManager.sendMessage({
          type: 'offer',
          offer: data.offer
        })
        log('[App] sendMessage 调用完成')
      } catch (error) {
        log('[App] sendMessage 错误: ' + error.message)
        console.error('[App] sendMessage 详细错误:', error)
      }
    } else {
      log('[App] 无法转发，directManager 不存在')
    }
  })

  window.electronAPI.on('webrtc-answer', async (data) => {
    log('[App] 收到远程窗口的answer，转发给被控端')
    directManager.sendMessage({
      type: 'answer',
      answer: data.answer
    })
  })

  window.electronAPI.on('webrtc-ice-candidate', async (data) => {
    log('[App] 收到远程窗口的ICE候选，转发给被控端')
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
  console.log('[App] controlledConnectToServer 被调用')
  console.log('[App] connectionManager 是否可用:', connectionManager !== null)
  
  if (!connectionManager) {
    console.error('[App] connectionManager 未初始化！')
    alert('应用未正确初始化，请刷新页面')
    return
  }
  
  if (typeof connectionManager.saveRoleAndServer !== 'function') {
    console.error('[App] saveRoleAndServer 不是函数！')
    alert('应用未正确初始化，请刷新页面')
    return
  }
  
  const serverUrl = uiManager.getControlledServerUrl()
  connectionManager.saveRoleAndServer('controlled', serverUrl)
  connectionManager.cancelReconnect()

  await signalingManager.connect(serverUrl, 'controlled')
}

function controlledDisconnectFromServer() {
  signalingManager.disconnect()
}

async function controllerConnectToServer() {
  console.log('[App] controllerConnectToServer 被调用')
  console.log('[App] connectionManager 是否可用:', connectionManager !== null)
  
  if (!connectionManager) {
    console.error('[App] connectionManager 未初始化！')
    alert('应用未正确初始化，请刷新页面')
    return
  }
  
  if (typeof connectionManager.saveRoleAndServer !== 'function') {
    console.error('[App] saveRoleAndServer 不是函数！')
    alert('应用未正确初始化，请刷新页面')
    return
  }
  
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
