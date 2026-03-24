const DATA_CHANNEL_STATE = {
  CONNECTING: 'connecting',
  OPEN: 'open',
  CLOSING: 'closing',
  CLOSED: 'closed'
}

class DataChannelManager {
  constructor(options = {}) {
    this.dataChannel = null
    this.messageQueue = []
    this.messageIdCounter = 0
    this.pendingMessages = new Map()
    this.options = {
      maxRetries: 3,
      retryInterval: 1000,
      maxQueueSize: 100,
      ...options
    }
    this.callbacks = {
      onOpen: null,
      onClose: null,
      onError: null,
      onMessage: null,
      onBufferedAmountLow: null
    }
    this.isReconnecting = false
    this.logger = options.logger || console
  }

  setDataChannel(channel) {
    if (this.dataChannel) {
      this.removeEventListeners()
    }

    this.dataChannel = channel
    this.addEventListeners()
    this.flushQueue()
  }

  addEventListeners() {
    if (!this.dataChannel) return

    this.dataChannel.onopen = this.handleOpen.bind(this)
    this.dataChannel.onclose = this.handleClose.bind(this)
    this.dataChannel.onerror = this.handleError.bind(this)
    this.dataChannel.onmessage = this.handleMessage.bind(this)
    this.dataChannel.onbufferedamountlow = this.handleBufferedAmountLow.bind(this)
  }

  removeEventListeners() {
    if (!this.dataChannel) return

    this.dataChannel.onopen = null
    this.dataChannel.onclose = null
    this.dataChannel.onerror = null
    this.dataChannel.onmessage = null
    this.dataChannel.onbufferedamountlow = null
  }

  handleOpen() {
    this.logger.log('[DataChannel] 数据通道已打开')
    this.isReconnecting = false
    this.flushQueue()
    
    if (this.callbacks.onOpen) {
      this.callbacks.onOpen()
    }
  }

  handleClose() {
    this.logger.log('[DataChannel] 数据通道已关闭')
    
    if (this.callbacks.onClose) {
      this.callbacks.onClose()
    }
  }

  handleError(error) {
    this.logger.error('[DataChannel] 数据通道错误:', error)
    
    if (this.callbacks.onError) {
      this.callbacks.onError(error)
    }
  }

  handleMessage(event) {
    try {
      const data = JSON.parse(event.data)
      
      if (data.ack && this.pendingMessages.has(data.ackId)) {
        this.pendingMessages.delete(data.ackId)
        return
      }
      
      if (data.id) {
        this.sendAck(data.id)
      }
      
      if (this.callbacks.onMessage) {
        this.callbacks.onMessage(data)
      }
    } catch (e) {
      this.logger.error('[DataChannel] 解析消息失败:', e)
    }
  }

  handleBufferedAmountLow() {
    if (this.callbacks.onBufferedAmountLow) {
      this.callbacks.onBufferedAmountLow()
    }
    this.flushQueue()
  }

  send(data, requireAck = false) {
    const message = {
      ...data,
      id: requireAck ? ++this.messageIdCounter : undefined,
      timestamp: Date.now()
    }

    if (!this.isOpen()) {
      this.logger.log('[DataChannel] 通道未打开，加入队列')
      this.enqueue(message, requireAck)
      return false
    }

    return this.sendRaw(message, requireAck)
  }

  sendRaw(message, requireAck) {
    try {
      const json = JSON.stringify(message)
      
      if (this.dataChannel.bufferedAmount > 1024 * 1024) {
        this.logger.warn('[DataChannel] 缓冲区过大，加入队列')
        this.enqueue(message, requireAck)
        return false
      }

      this.dataChannel.send(json)
      
      if (requireAck && message.id) {
        this.trackPendingMessage(message)
      }
      
      return true
    } catch (e) {
      this.logger.error('[DataChannel] 发送失败:', e)
      this.enqueue(message, requireAck)
      return false
    }
  }

  sendAck(messageId) {
    this.send({ ack: true, ackId: messageId }, false)
  }

  trackPendingMessage(message) {
    const retryCount = 0
    const timer = setTimeout(() => {
      this.retryMessage(message, retryCount)
    }, this.options.retryInterval)

    this.pendingMessages.set(message.id, {
      message,
      timer,
      retryCount
    })
  }

  retryMessage(message, retryCount) {
    if (retryCount >= this.options.maxRetries) {
      this.logger.error('[DataChannel] 消息重发失败，放弃:', message.id)
      this.pendingMessages.delete(message.id)
      return
    }

    if (!this.isOpen()) {
      this.logger.log('[DataChannel] 通道关闭，停止重发')
      return
    }

    this.logger.log('[DataChannel] 重发消息:', message.id, '重试次数:', retryCount + 1)
    
    this.pendingMessages.delete(message.id)
    this.sendRaw(message, true)
  }

  enqueue(message, requireAck) {
    if (this.messageQueue.length >= this.options.maxQueueSize) {
      this.logger.warn('[DataChannel] 队列已满，丢弃最早的消息')
      this.messageQueue.shift()
    }
    this.messageQueue.push({ message, requireAck })
  }

  flushQueue() {
    if (!this.isOpen() || this.messageQueue.length === 0) {
      return
    }

    this.logger.log('[DataChannel] 刷新队列，剩余:', this.messageQueue.length)
    
    while (this.messageQueue.length > 0 && this.isOpen()) {
      const { message, requireAck } = this.messageQueue[0]
      if (this.sendRaw(message, requireAck)) {
        this.messageQueue.shift()
      } else {
        break
      }
    }
  }

  isOpen() {
    return this.dataChannel && this.dataChannel.readyState === 'open'
  }

  getReadyState() {
    return this.dataChannel ? this.dataChannel.readyState : 'closed'
  }

  getBufferedAmount() {
    return this.dataChannel ? this.dataChannel.bufferedAmount : 0
  }

  setOnOpen(callback) {
    this.callbacks.onOpen = callback
  }

  setOnClose(callback) {
    this.callbacks.onClose = callback
  }

  setOnError(callback) {
    this.callbacks.onError = callback
  }

  setOnMessage(callback) {
    this.callbacks.onMessage = callback
  }

  setOnBufferedAmountLow(callback) {
    this.callbacks.onBufferedAmountLow = callback
  }

  close() {
    this.messageQueue = []
    this.pendingMessages.forEach(({ timer }) => {
      clearTimeout(timer)
    })
    this.pendingMessages.clear()
    
    if (this.dataChannel) {
      this.removeEventListeners()
      this.dataChannel.close()
      this.dataChannel = null
    }
  }

  reset() {
    this.close()
    this.messageIdCounter = 0
  }
}

let myDeviceId = ''
let localStream = null
let socket = null
let peerConnection = null
let currentSessionId = null
let incomingFromDeviceId = null
let isController = false
let controlledMode = 'direct'
let controllerMode = 'direct'

let currentDirectClientId = null
let directPeerConnection = null
let isDirectController = false
let dataChannelManager = null
let connectionLogDiv = null
let pendingIceCandidates = []

const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
}

let connectionStatus = CONNECTION_STATUS.DISCONNECTED
let heartbeatInterval = null
let reconnectAttempts = 0
let reconnectTimeout = null
const MAX_RECONNECT_ATTEMPTS = 10
const BASE_RECONNECT_DELAY = 1000
const HEARTBEAT_INTERVAL = 5000

let savedServerUrl = null
let savedRole = null
let savedConnectionInfo = null

let networkManager = null

const STORAGE_KEYS = {
  DIRECT_HISTORY: 'ycdesk_direct_history',
  SIGNALING_HISTORY: 'ycdesk_signaling_history'
}

const MAX_HISTORY_ITEMS = 10

function setConnectionStatus(status) {
  connectionStatus = status
  log(`连接状态变更: ${status}`)
}

function startHeartbeat(clientId) {
  stopHeartbeat()
  heartbeatInterval = setInterval(() => {
    if (currentDirectClientId) {
      sendDirectMessage(currentDirectClientId, { type: 'heartbeat' })
    }
  }, HEARTBEAT_INTERVAL)
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

function saveToHistory(type, data) {
  try {
    const key = type === 'direct' ? STORAGE_KEYS.DIRECT_HISTORY : STORAGE_KEYS.SIGNALING_HISTORY
    let history = JSON.parse(localStorage.getItem(key) || '[]')
    
    const existingIndex = history.findIndex(item => {
      if (type === 'direct') {
        return item.ip === data.ip && item.port === data.port
      } else {
        return item.deviceId === data.deviceId && item.serverUrl === data.serverUrl
      }
    })
    
    if (existingIndex !== -1) {
      history.splice(existingIndex, 1)
    }
    
    history.unshift({
      ...data,
      timestamp: Date.now()
    })
    
    history = history.slice(0, MAX_HISTORY_ITEMS)
    localStorage.setItem(key, JSON.stringify(history))
    
    renderHistory(type)
  } catch (error) {
    console.error('保存历史记录失败:', error)
  }
}

function loadHistory(type) {
  try {
    const key = type === 'direct' ? STORAGE_KEYS.DIRECT_HISTORY : STORAGE_KEYS.SIGNALING_HISTORY
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch (error) {
    console.error('加载历史记录失败:', error)
    return []
  }
}

function deleteFromHistory(type, index) {
  try {
    const key = type === 'direct' ? STORAGE_KEYS.DIRECT_HISTORY : STORAGE_KEYS.SIGNALING_HISTORY
    let history = JSON.parse(localStorage.getItem(key) || '[]')
    history.splice(index, 1)
    localStorage.setItem(key, JSON.stringify(history))
    renderHistory(type)
  } catch (error) {
    console.error('删除历史记录失败:', error)
  }
}

function renderHistory(type) {
  const history = loadHistory(type)
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
  const history = loadHistory(type)
  const item = history[index]
  
  if (!item) return
  
  if (type === 'direct') {
    document.getElementById('remoteIp').value = item.ip
    document.getElementById('remotePort').value = item.port
    connectDirect()
  } else {
    document.getElementById('controllerServerUrl').value = item.serverUrl
    document.getElementById('targetDeviceId').value = item.deviceId
    
    if (!socket || !socket.connected) {
      controllerConnectToServer()
    } else {
      connectDevice()
    }
  }
}

async function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('重连次数已达上限，停止重连')
    reconnectAttempts = 0
    setConnectionStatus(CONNECTION_STATUS.ERROR)
    if (typeof showToast === 'function') {
      showToast('重连失败，请检查网络后手动重试', 'error')
    }
    return
  }

  if (networkManager && !networkManager.isOnline()) {
    log('网络离线，等待网络恢复...')
    return
  }

  reconnectAttempts++
  const delay = networkManager 
    ? networkManager.calculateReconnectDelay(reconnectAttempts, BASE_RECONNECT_DELAY)
    : BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts)
  
  log(`将在 ${Math.round(delay/1000)} 秒后尝试重连... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
  }
  
  reconnectTimeout = setTimeout(async () => {
    try {
      setConnectionStatus(CONNECTION_STATUS.CONNECTING)
      
      if (savedConnectionInfo && savedConnectionInfo.type === 'direct') {
        await connectDirect()
      } else if (savedRole === 'controlled' && savedServerUrl) {
        await controlledConnectToServer()
      } else if (savedRole === 'controller' && savedServerUrl) {
        await controllerConnectToServer()
      }
    } catch (error) {
      log('重连失败: ' + error.message)
      attemptReconnect()
    }
  }, delay)
}

function cancelReconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }
  reconnectAttempts = 0
}

function saveConnectionInfo(type, data) {
  savedConnectionInfo = { type, ...data }
}

function clearConnectionInfo() {
  savedConnectionInfo = null
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString()
  const logMessage = `[${timestamp}] ${message}`
  console.log(logMessage)
  if (connectionLogDiv) {
    const div = document.createElement('div')
    div.textContent = logMessage
    connectionLogDiv.appendChild(div)
    connectionLogDiv.scrollTop = connectionLogDiv.scrollHeight
  }
}

function selectRole(role) {
  document.getElementById('rolePage').classList.remove('active')
  
  if (role === 'controlled') {
    document.getElementById('controlledPage').classList.add('active')
    connectionLogDiv = document.getElementById('connectionLog')
    initControlled()
  } else {
    document.getElementById('controllerPage').classList.add('active')
    connectionLogDiv = document.getElementById('connectionLogController')
    initController()
  }
}

function switchControlledMode(mode) {
  controlledMode = mode
  
  document.querySelectorAll('#controlledPage .mode-tab').forEach(tab => tab.classList.remove('active'))
  event.target.classList.add('active')
  
  document.getElementById('controlledDirectMode').classList.remove('active')
  document.getElementById('controlledSignalingMode').classList.remove('active')
  document.getElementById('controlledDirectSection').style.display = mode === 'direct' ? 'block' : 'none'
  
  if (mode === 'direct') {
    document.getElementById('controlledDirectMode').classList.add('active')
    if (socket) {
      socket.disconnect()
      socket = null
    }
  } else {
    document.getElementById('controlledSignalingMode').classList.add('active')
    stopListening()
  }
  
  log('被控端切换到 ' + (mode === 'direct' ? '直连模式' : '信令服务器模式'))
}

function switchControllerMode(mode) {
  controllerMode = mode
  
  document.querySelectorAll('#controllerPage .mode-tab').forEach(tab => tab.classList.remove('active'))
  event.target.classList.add('active')
  
  document.getElementById('controllerDirectMode').classList.remove('active')
  document.getElementById('controllerSignalingMode').classList.remove('active')
  
  if (mode === 'direct') {
    document.getElementById('controllerDirectMode').classList.add('active')
    if (socket) {
      socket.disconnect()
      socket = null
    }
  } else {
    document.getElementById('controllerSignalingMode').classList.add('active')
  }
  
  log('主控端切换到 ' + (mode === 'direct' ? '直连模式' : '信令服务器模式'))
}

function goBack() {
  document.getElementById('controlledPage').classList.remove('active')
  document.getElementById('controllerPage').classList.remove('active')
  document.getElementById('rolePage').classList.add('active')
  stopListening()
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

async function initControlled() {
  myDeviceId = await window.electronAPI.getDeviceId()
  document.getElementById('deviceId').textContent = myDeviceId
  
  log('YCDesk 被控端初始化完成，设备ID: ' + myDeviceId)
  
  window.electronAPI.on('direct-incoming-connection', (data) => {
    log('收到来自 ' + data.remoteAddress + ':' + data.remotePort + ' 的连接')
    currentDirectClientId = data.clientId
    isDirectController = false
    startDirectControlledConnection(data.clientId)
  })
  
  window.electronAPI.on('direct-message', async (data) => {
    await handleDirectMessage(data.clientId, data.message)
  })
  
  window.electronAPI.on('direct-connection-closed', (data) => {
    log('连接已关闭')
    updateServerStatus('就绪', 'disconnected')
  })
  
  await getLocalIps()
}

async function initController() {
  myDeviceId = await window.electronAPI.getDeviceId()
  log('YCDesk 主控端初始化完成，设备ID: ' + myDeviceId)
  
  window.electronAPI.on('direct-message', async (data) => {
    await handleDirectMessage(data.clientId, data.message)
  })
  
  window.electronAPI.on('direct-connection-closed', (data) => {
    log('连接已关闭')
  })
  
  window.electronAPI.on('webrtc-offer', async (data) => {
    log('收到远程窗口的offer，转发给被控端')
    if (currentDirectClientId) {
      sendDirectMessage(currentDirectClientId, {
        type: 'offer',
        offer: data.offer
      })
    }
  })
  
  window.electronAPI.on('webrtc-ice-candidate', async (data) => {
    log('收到远程窗口的ICE候选，转发给被控端')
    if (currentDirectClientId) {
      sendDirectMessage(currentDirectClientId, {
        type: 'ice-candidate',
        candidate: data.candidate
      })
    }
  })
  
  renderHistory('direct')
  renderHistory('signaling')
}

async function getLocalIps() {
  try {
    const ipList = await window.electronAPI.getLocalIps()
    const displayList = ipList.map(ip => {
      const addr = ip.family === 'IPv6' ? `[${ip.address}]` : ip.address
      return `<div class="ip-item">${addr} (${ip.name})</div>`
    })
    
    if (displayList.length === 0) {
      displayList.push('<div class="ip-item">未找到可用网络接口</div>')
    }
    
    document.getElementById('localIpList').innerHTML = displayList.join('')
    log('获取本地IP地址成功')
  } catch (error) {
    log('获取本地IP地址失败: ' + error.message)
    document.getElementById('localIpList').innerHTML = '<div class="ip-item">获取失败</div>'
  }
}

async function startListening() {
  const port = parseInt(document.getElementById('listenPort').value)
  if (isNaN(port) || port < 1024 || port > 65535) {
    alert('请输入有效的端口号 (1024-65535)')
    return
  }
  
  try {
    const result = await window.electronAPI.startDirectServer(port)
    if (result.success) {
      log('开始监听端口 ' + port + '，等待连接...')
      updateServerStatus('监听中 (端口 ' + port + ')', 'connected')
    } else {
      log('启动监听失败: ' + result.error)
      alert('监听失败: ' + result.error)
    }
  } catch (error) {
    log('启动监听失败: ' + error.message)
    alert('启动监听失败: ' + error.message)
  }
}

async function stopListening() {
  try {
    await window.electronAPI.stopDirectServer()
    log('已停止监听')
    updateServerStatus('就绪', 'disconnected')
  } catch (error) {
    log('停止监听失败: ' + error.message)
  }
}

async function connectDirect() {
  const remoteIp = document.getElementById('remoteIp').value.trim()
  const remotePort = parseInt(document.getElementById('remotePort').value)
  
  if (!remoteIp) {
    alert('请输入对方IP地址')
    return
  }
  
  if (isNaN(remotePort) || remotePort < 1024 || remotePort > 65535) {
    alert('请输入有效的端口号 (1024-65535)')
    return
  }
  
  log('正在连接到 ' + remoteIp + ':' + remotePort + '...')
  
  try {
    const result = await window.electronAPI.connectDirectClient(remoteIp, remotePort)
    if (result.success) {
      log('已连接到 ' + remoteIp + ':' + remotePort)
      saveToHistory('direct', { ip: remoteIp, port: remotePort })
      currentDirectClientId = result.clientId
      isDirectController = true
      startDirectControllerConnection(result.clientId)
    } else {
      log('连接失败: ' + result.error)
      alert('连接失败: ' + result.error)
    }
  } catch (error) {
    log('连接失败: ' + error.message)
    alert('连接失败: ' + error.message)
  }
}

async function sendDirectMessage(clientId, message) {
  try {
    await window.electronAPI.sendDirectMessage(clientId, message)
  } catch (e) {
    log('发送消息失败: ' + e.message)
  }
}

async function handleDirectMessage(clientId, message) {
  log('收到消息: ' + message.type + ', 内容: ' + JSON.stringify(message).substring(0, 200))
  
  try {
    switch (message.type) {
      case 'offer':
        log('offer内容: ' + (message.offer ? '存在' : '为空'))
        await handleDirectOffer(clientId, message.offer)
        break
      case 'answer':
        log('answer内容: ' + (message.answer ? '存在' : '为空'))
        if (isDirectController) {
          log('转发answer到远程窗口')
          window.electronAPI.sendToRemoteWindow('webrtc-answer', { answer: message.answer })
        } else {
          await handleDirectAnswer(clientId, message.answer)
        }
        break
      case 'ice-candidate':
        if (isDirectController) {
          log('转发ICE候选到远程窗口')
          window.electronAPI.sendToRemoteWindow('webrtc-ice-candidate', { candidate: message.candidate })
        } else {
          await handleDirectIceCandidate(clientId, message.candidate)
        }
        break
    }
  } catch (error) {
    log('处理消息失败: ' + error.message)
    console.error('处理消息详细错误:', error)
  }
}

async function startDirectControllerConnection(clientId) {
  log('作为主控端建立直连，打开远程窗口')
  window.electronAPI.openRemoteWindow()
}

async function startDirectControlledConnection(clientId) {
  log('作为被控端建立直连')
  await createDirectPeerConnection(clientId)
}

async function createDirectPeerConnection(clientId) {
  directPeerConnection = new RTCPeerConnection({ iceServers: [] })
  
  dataChannelManager = new DataChannelManager({ logger: { log: log, error: console.error } })
  
  dataChannelManager.setOnOpen(() => {
    log('数据通道已打开')
  })
  
  dataChannelManager.setOnMessage((data) => {
    if (data.type === 'input') {
      log('收到输入命令: ' + data.inputType + ', x=' + data.x + ', y=' + data.y)
      window.electronAPI.send('remote-input', data)
    } else if (data.type === 'ping') {
      dataChannelManager.send({ type: 'pong', timestamp: data.timestamp })
    } else if (data.type === 'screen-size') {
      log('收到屏幕尺寸: ' + data.width + 'x' + data.height)
    }
  })
  
  dataChannelManager.setOnClose(() => {
    log('数据通道已关闭')
  })
  
  dataChannelManager.setOnError((error) => {
    console.error('数据通道错误:', error)
  })
  
  directPeerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      log('发送ICE候选')
      sendDirectMessage(clientId, {
        type: 'ice-candidate',
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        }
      })
    }
  }
  
  directPeerConnection.oniceconnectionstatechange = () => {
    log('ICE连接状态: ' + directPeerConnection.iceConnectionState)
  }
  
  directPeerConnection.onconnectionstatechange = () => {
    log('直连状态: ' + directPeerConnection.connectionState)
    
    if (directPeerConnection.connectionState === 'connected') {
      log('WebRTC连接已建立')
    } else if (directPeerConnection.connectionState === 'failed') {
      log('WebRTC连接失败')
    }
  }
  
  directPeerConnection.ondatachannel = (event) => {
    log('收到数据通道')
    dataChannelManager.setDataChannel(event.channel)
  }
}

async function handleDirectOffer(clientId, offer) {
  if (!offer) {
    log('错误: offer为空')
    return
  }
  
  log('收到offer')
  
  try {
    log('设置远程描述...')
    await directPeerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    log('远程描述设置成功')
    
    log('检查transceivers...')
    const transceivers = directPeerConnection.getTransceivers()
    log('transceivers数量: ' + transceivers.length)
    transceivers.forEach((t, i) => {
      log('Transceiver ' + i + ': mid=' + t.mid + ', direction=' + t.direction + ', sender.track=' + (t.sender.track ? t.sender.track.kind : 'null') + ', receiver.track=' + (t.receiver.track ? t.receiver.track.kind : 'null'))
    })
    
    await addPendingIceCandidates()
    
    log('开始捕获屏幕...')
    await startScreenCaptureForDirect()
    
    log('添加track后检查transceivers...')
    const transceivers2 = directPeerConnection.getTransceivers()
    log('transceivers数量: ' + transceivers2.length)
    transceivers2.forEach((t, i) => {
      log('Transceiver ' + i + ': mid=' + t.mid + ', direction=' + t.direction + ', sender.track=' + (t.sender.track ? t.sender.track.kind : 'null'))
    })
    
    log('创建answer...')
    const answer = await directPeerConnection.createAnswer()
    await directPeerConnection.setLocalDescription(answer)
    log('本地描述设置成功')
    
    sendDirectMessage(clientId, {
      type: 'answer',
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    })
    
    log('已发送answer')
  } catch (error) {
    log('处理offer失败: ' + error.message)
    console.error('处理offer详细错误:', error)
  }
}

async function handleDirectAnswer(clientId, answer) {
  if (!answer) {
    log('错误: answer为空')
    return
  }
  
  try {
    await directPeerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    log('answer设置成功')
    
    await addPendingIceCandidates()
  } catch (error) {
    log('设置answer失败: ' + error.message)
  }
}

async function handleDirectIceCandidate(clientId, candidate) {
  if (!candidate) {
    return
  }
  
  try {
    if (candidate.sdpMid === null && candidate.sdpMLineIndex === null) {
      return
    }
    
    if (!directPeerConnection || !directPeerConnection.remoteDescription) {
      log('缓存ICE候选（远程描述未设置）')
      pendingIceCandidates.push(candidate)
      return
    }
    
    await directPeerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    log('ICE候选添加成功')
  } catch (error) {
    log('添加ICE候选失败: ' + error.message)
  }
}

async function addPendingIceCandidates() {
  log('添加缓存的ICE候选: ' + pendingIceCandidates.length + ' 个')
  for (const candidate of pendingIceCandidates) {
    try {
      await directPeerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      log('添加缓存ICE候选失败: ' + error.message)
    }
  }
  pendingIceCandidates = []
}

async function startScreenCaptureForDirect() {
  try {
    const sources = await window.electronAPI.getSources()
    log('可用屏幕源: ' + sources.length + ' 个')
    
    if (sources.length > 0) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sources[0].id,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30
          }
        }
      })

      const tracks = stream.getTracks()
      log('获取到 ' + tracks.length + ' 个媒体轨道')
      
      tracks.forEach(track => {
        directPeerConnection.addTrack(track, stream)
        log('已添加媒体轨道: ' + track.kind + ', label: ' + track.label)
      })

      log('屏幕捕获成功，分辨率: ' + stream.getVideoTracks()[0].getSettings().width + 'x' + stream.getVideoTracks()[0].getSettings().height)
    } else {
      log('没有找到可用的屏幕源')
    }
  } catch (error) {
    log('屏幕捕获失败: ' + error.message)
    console.error('屏幕捕获详细错误:', error)
  }
}

function updateServerStatus(text, status) {
  const statusText = document.getElementById('serverStatusText')
  const statusBadge = document.getElementById('serverStatus')
  const statusDot = document.querySelector('.status-dot')
  
  if (!statusText || !statusBadge || !statusDot) return
  
  statusText.textContent = text
  
  const statusStyles = {
    'connected': { bg: '#e6f4ea', color: '#135429', dotColor: '#2ecc71' },
    'connecting': { bg: '#fff3cd', color: '#856404', dotColor: '#ffc107' },
    'disconnected': { bg: '#f8d7da', color: '#721c24', dotColor: '#e74c3c' },
    'error': { bg: '#f8d7da', color: '#721c24', dotColor: '#e74c3c' }
  }
  
  const style = statusStyles[status] || statusStyles['disconnected']
  statusBadge.style.background = style.bg
  statusBadge.style.color = style.color
  statusDot.style.background = style.dotColor
}

function copyDeviceId() {
  if (!myDeviceId) return
  
  navigator.clipboard.writeText(myDeviceId).then(() => {
    const el = document.getElementById('deviceId')
    if (!el) return
    
    const originalText = el.textContent
    el.textContent = '已复制!'
    setTimeout(() => {
      el.textContent = originalText
    }, 1500)
  }).catch(err => {
    console.error('复制失败:', err)
  })
}

function openRemoteWindow() {
  window.electronAPI.openRemoteWindow()
}

function getControlledServerUrl() {
  return document.getElementById('controlledServerUrl')?.value || 'http://localhost:3000'
}

function getControllerServerUrl() {
  return document.getElementById('controllerServerUrl')?.value || 'http://localhost:3000'
}

function getIceConfig() {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
}

async function controlledConnectToServer() {
  const serverUrl = getControlledServerUrl()
  savedServerUrl = serverUrl
  savedRole = 'controlled'
  reconnectAttempts = 0
  
  log('正在连接信令服务器: ' + serverUrl)
  updateServerStatus('连接中...', 'connecting')
  setConnectionStatus(CONNECTION_STATUS.CONNECTING)
  
  try {
    if (socket) {
      socket.disconnect()
    }
    
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY,
      timeout: 10000
    })

    socket.on('connect', () => {
      log('✓ 已连接到信令服务器，Socket ID: ' + socket.id)
      log('正在注册设备 ID: ' + myDeviceId)
      socket.emit('register', myDeviceId)
      updateServerStatus('已连接', 'connected')
      setConnectionStatus(CONNECTION_STATUS.CONNECTED)
      reconnectAttempts = 0
    })

    socket.on('disconnect', (reason) => {
      log('与信令服务器断开连接，原因: ' + reason)
      updateServerStatus('已断开', 'disconnected')
      setConnectionStatus(CONNECTION_STATUS.DISCONNECTED)
    })

    socket.on('connect_error', (error) => {
      log('✗ 连接错误: ' + (error.message || error))
      updateServerStatus('连接失败', 'error')
      setConnectionStatus(CONNECTION_STATUS.ERROR)
    })

    socket.on('reconnect_attempt', (attemptNumber) => {
      log('正在尝试重连... (第 ' + attemptNumber + ' 次)')
      reconnectAttempts = attemptNumber
    })

    socket.on('reconnect_failed', () => {
      log('✗ 重连失败，请检查服务器地址和网络连接')
      updateServerStatus('重连失败', 'error')
      setConnectionStatus(CONNECTION_STATUS.ERROR)
    })

    socket.on('incoming-connection', (data) => {
      log('收到连接请求: ' + JSON.stringify(data))
      incomingFromDeviceId = data.fromDeviceId
      currentSessionId = data.sessionId
      isController = false
      showIncomingConnectionDialog(data.fromDeviceId)
    })

    socket.on('connection-result', async (data) => {
      log('连接结果: ' + JSON.stringify(data))
      if (data.accepted) {
        isController = true
        await startControllerConnection()
      } else {
        alert('对方拒绝了连接请求')
      }
    })

    socket.on('offer', async (data) => {
      log('收到 offer')
      await handleOffer(data)
    })

    socket.on('answer', async (data) => {
      log('收到 answer')
      await handleAnswer(data)
    })

    socket.on('ice-candidate', async (data) => {
      log('收到 ICE candidate')
      await handleIceCandidate(data)
    })
  } catch (error) {
    log('✗ 连接初始化错误: ' + error.message)
    updateServerStatus('连接失败', 'error')
    setConnectionStatus(CONNECTION_STATUS.ERROR)
  }
}

function controlledDisconnectFromServer() {
  if (socket) {
    socket.disconnect()
    socket = null
    log('已手动断开服务器连接')
    updateServerStatus('已断开', 'disconnected')
  } else {
    log('未连接到服务器')
  }
}

async function controllerConnectToServer() {
  const serverUrl = getControllerServerUrl()
  savedServerUrl = serverUrl
  savedRole = 'controller'
  reconnectAttempts = 0
  
  log('正在连接信令服务器: ' + serverUrl)
  setConnectionStatus(CONNECTION_STATUS.CONNECTING)
  
  try {
    if (socket) {
      socket.disconnect()
    }
    
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY,
      timeout: 10000
    })

    socket.on('connect', () => {
      log('✓ 已连接到信令服务器，Socket ID: ' + socket.id)
      log('正在注册设备 ID: ' + myDeviceId)
      socket.emit('register', myDeviceId)
      setConnectionStatus(CONNECTION_STATUS.CONNECTED)
      reconnectAttempts = 0
    })

    socket.on('disconnect', (reason) => {
      log('与信令服务器断开连接，原因: ' + reason)
      setConnectionStatus(CONNECTION_STATUS.DISCONNECTED)
    })

    socket.on('connect_error', (error) => {
      log('✗ 连接错误: ' + (error.message || error))
      setConnectionStatus(CONNECTION_STATUS.ERROR)
    })

    socket.on('reconnect_attempt', (attemptNumber) => {
      log('正在尝试重连... (第 ' + attemptNumber + ' 次)')
      reconnectAttempts = attemptNumber
    })

    socket.on('reconnect_failed', () => {
      log('✗ 重连失败，请检查服务器地址和网络连接')
      setConnectionStatus(CONNECTION_STATUS.ERROR)
    })

    socket.on('connection-result', async (data) => {
      log('连接结果: ' + JSON.stringify(data))
      if (data.accepted) {
        isController = true
        await startControllerConnection()
      } else {
        alert('对方拒绝了连接请求')
      }
    })

    socket.on('answer', async (data) => {
      log('收到 answer')
      await handleAnswer(data)
    })

    socket.on('ice-candidate', async (data) => {
      log('收到 ICE candidate')
      await handleIceCandidate(data)
    })
  } catch (error) {
    log('✗ 连接初始化错误: ' + error.message)
    setConnectionStatus(CONNECTION_STATUS.ERROR)
  }
}

function controllerDisconnectFromServer() {
  if (socket) {
    socket.disconnect()
    socket = null
    log('已手动断开服务器连接')
  } else {
    log('未连接到服务器')
  }
}

async function connectDevice() {
  const targetId = document.getElementById('targetDeviceId').value.trim().toUpperCase()
  const serverUrl = getControllerServerUrl()
  
  if (!targetId) {
    alert('请输入设备 ID')
    return
  }
  if (targetId.length !== 9) {
    alert('设备 ID 格式不正确（需要 9 位字符）')
    return
  }
  if (targetId === myDeviceId) {
    alert('不能连接自己')
    return
  }
  if (!socket || !socket.connected) {
    alert('未连接到信令服务器，请先连接服务器')
    return
  }

  saveToHistory('signaling', { deviceId: targetId, serverUrl: serverUrl })
  
  incomingFromDeviceId = targetId
  socket.emit('connect-request', {
    fromDeviceId: myDeviceId,
    toDeviceId: targetId
  })

  alert('连接请求已发送，请等待对方确认...')
}

function showIncomingConnectionDialog(fromDeviceId) {
  if (confirm(`设备 ${fromDeviceId} 想要连接到你的电脑，是否接受？`)) {
    acceptConnection()
  } else {
    rejectConnection()
  }
}

async function acceptConnection() {
  socket.emit('connection-response', {
    sessionId: currentSessionId,
    accepted: true,
    fromDeviceId: incomingFromDeviceId,
    toDeviceId: myDeviceId
  })

  await startControlledConnection()
}

function rejectConnection() {
  socket.emit('connection-response', {
    sessionId: currentSessionId,
    accepted: false,
    fromDeviceId: incomingFromDeviceId,
    toDeviceId: myDeviceId
  })
}

async function startControllerConnection() {
  log('作为主控端建立连接')
  await createPeerConnection()
  
  try {
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    
    socket.emit('offer', {
      sessionId: currentSessionId,
      offer: offer,
      toDeviceId: incomingFromDeviceId
    })
  } catch (error) {
    log('创建 offer 失败: ' + error.message)
  }
}

async function startControlledConnection() {
  log('作为被控端建立连接')
  await createPeerConnection()
  await startScreenCapture()
}

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(getIceConfig())

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        sessionId: currentSessionId,
        candidate: event.candidate,
        toDeviceId: incomingFromDeviceId
      })
    }
  }

  peerConnection.ontrack = (event) => {
    log('收到远程媒体流')
    const stream = event.streams[0]
    window.remoteStream = stream
    window.electronAPI.openRemoteWindow()
    
    setTimeout(() => {
      window.electronAPI.sendToRemoteWindow('remote-stream', { hasStream: true })
    }, 500)
  }

  peerConnection.onconnectionstatechange = () => {
    log('连接状态: ' + peerConnection.connectionState)
  }

  peerConnection.ondatachannel = (event) => {
    log('收到数据通道')
    dataChannel = event.channel
    setupDataChannel()
  }

  if (isController) {
    log('创建数据通道（主控端）')
    dataChannel = peerConnection.createDataChannel('control')
    setupDataChannel()
  }
}

async function handleOffer(data) {
  incomingFromDeviceId = data.fromDeviceId || incomingFromDeviceId
  currentSessionId = data.sessionId
  
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
  
  const answer = await peerConnection.createAnswer()
  await peerConnection.setLocalDescription(answer)
  
  socket.emit('answer', {
    sessionId: currentSessionId,
    answer: answer,
    toDeviceId: incomingFromDeviceId
  })
}

async function handleAnswer(data) {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
}

async function handleIceCandidate(data) {
  if (data.candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
  }
}

async function startScreenCapture() {
  try {
    const sources = await window.electronAPI.getSources()
    log('可用屏幕源:', sources)
    
    if (sources.length > 0) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sources[0].id,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30
          }
        }
      })

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream)
      })

      log('屏幕捕获成功')
    }
  } catch (error) {
    log('屏幕捕获失败: ' + error.message)
  }
}
