import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { io } from 'socket.io-client';
import { registerPlugin } from '@capacitor/core';

const TCPSocket = registerPlugin('TCPSocket');
const InputExecutor = registerPlugin('InputExecutor');
const FloatingMouse = registerPlugin('FloatingMouse');

let myDeviceId = ''
let socket = null
let peerConnection = null
let currentSessionId = null
let incomingFromDeviceId = null
let isController = false
let controlledMode = 'direct'
let controllerMode = 'direct'

let currentDirectClientId = null
let directPeerConnection = null
let dataChannel = null
let connectionLogDiv = null
let currentRole = null
let isConnected = false
let isMouseMode = false
let pendingIceCandidates = []

const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
}

let connectionStatus = CONNECTION_STATUS.DISCONNECTED
let reconnectAttempts = 0
let reconnectTimeout = null
const MAX_RECONNECT_ATTEMPTS = 10
const BASE_RECONNECT_DELAY = 1000

let savedServerUrl = null
let savedRole = null

const STORAGE_KEYS = {
  DIRECT_HISTORY: 'ycdesk_direct_history',
  SIGNALING_HISTORY: 'ycdesk_signaling_history'
}

const MAX_HISTORY_ITEMS = 10

function setConnectionStatus(status) {
  connectionStatus = status
  log(`连接状态变更: ${status}`)
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

function generateDeviceId() {
  return Math.random().toString(36).substr(2, 9).toUpperCase()
}

function getServerUrl() {
  return document.getElementById('serverUrl')?.value || 'http://10.0.2.2:3000'
}

function getControlledServerUrl() {
  return document.getElementById('controlledServerUrl')?.value || 'http://10.0.2.2:3000'
}

function getIceConfig() {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
}

function showToast(message, duration = 3000) {
  const existingToast = document.querySelector('.toast')
  if (existingToast) {
    existingToast.remove()
  }
  
  const toast = document.createElement('div')
  toast.className = 'toast show'
  toast.textContent = message
  document.body.appendChild(toast)
  
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => {
      toast.remove()
    }, 300)
  }, duration)
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

async function copyDeviceId() {
  try {
    await navigator.clipboard.writeText(myDeviceId)
    showToast('设备ID已复制')
    const el = document.getElementById('deviceId')
    if (el) {
      const originalText = el.textContent
      el.textContent = '已复制!'
      setTimeout(() => {
        el.textContent = originalText
      }, 1500)
    }
  } catch (err) {
    showToast('复制失败')
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
    document.getElementById('serverUrl').value = item.serverUrl
    document.getElementById('targetDeviceId').value = item.deviceId
    
    if (!socket || !socket.connected) {
      manualConnectToServer()
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
    showToast('重连失败，请检查网络后手动重试')
    return
  }

  reconnectAttempts++
  const delay = BASE_RECONNECT_DELAY * Math.pow(2, Math.min(reconnectAttempts, 5))
  
  log(`将在 ${Math.round(delay/1000)} 秒后尝试重连... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
  }
  
  reconnectTimeout = setTimeout(async () => {
    try {
      setConnectionStatus(CONNECTION_STATUS.CONNECTING)
      
      if (savedRole === 'controlled' && savedServerUrl) {
        await controlledConnectToServer()
      } else if (savedRole === 'controller' && savedServerUrl) {
        await manualConnectToServer()
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

function selectRole(role) {
  console.log('selectRole called with role: ' + role)
  log('选择角色: ' + role)
  currentRole = role
  document.getElementById('rolePage').classList.remove('active')
  
  if (role === 'controller') {
    document.getElementById('controllerPage').classList.add('active')
    connectionLogDiv = document.getElementById('connectionLog')
    console.log('Calling initController...')
    initController()
  } else {
    document.getElementById('controlledPage').classList.add('active')
    connectionLogDiv = document.getElementById('connectionLogControlled')
    initControlled()
  }
}

function goBack() {
  document.getElementById('controllerPage').classList.remove('active')
  document.getElementById('controlledPage').classList.remove('active')
  document.getElementById('rolePage').classList.add('active')
  stopListening()
  cancelReconnect()
  if (socket) {
    socket.disconnect()
    socket = null
  }
  currentRole = null
}

function switchControllerMode(mode) {
  controllerMode = mode
  
  document.querySelectorAll('#controllerPage .mode-tab').forEach(tab => tab.classList.remove('active'))
  event.target.classList.add('active')
  
  document.getElementById('controllerSignalingMode').classList.remove('active')
  document.getElementById('controllerDirectMode').classList.remove('active')
  
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

function switchControlledMode(mode) {
  controlledMode = mode
  
  document.querySelectorAll('#controlledPage .mode-tab').forEach(tab => tab.classList.remove('active'))
  event.target.classList.add('active')
  
  document.getElementById('controlledSignalingMode').classList.remove('active')
  document.getElementById('controlledDirectMode').classList.remove('active')
  const controlledDirectSection = document.getElementById('controlledDirectSection')
  if (controlledDirectSection) {
    controlledDirectSection.style.display = mode === 'direct' ? 'block' : 'none'
  }
  
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

function manualConnectToServer() {
  if (socket && socket.connected) {
    showToast('已经连接到服务器')
    log('已经连接到服务器，无需重复连接')
    return
  }
  connectToServer(getServerUrl(), 'controller')
}

function controlledConnectToServer() {
  if (socket && socket.connected) {
    showToast('已经连接到服务器')
    log('已经连接到服务器，无需重复连接')
    return
  }
  connectToServer(getControlledServerUrl(), 'controlled')
}

function disconnectFromServer() {
  cancelReconnect()
  if (socket) {
    socket.disconnect()
    socket = null
    log('已手动断开服务器连接')
    updateServerStatus('已断开', 'disconnected')
    showToast('已断开连接')
  } else {
    log('未连接到服务器')
    showToast('未连接到服务器')
  }
}

function controlledDisconnectFromServer() {
  cancelReconnect()
  if (socket) {
    socket.disconnect()
    socket = null
    log('已手动断开服务器连接')
    updateServerStatus('已断开', 'disconnected')
    showToast('已断开连接')
  } else {
    log('未连接到服务器')
    showToast('未连接到服务器')
  }
}

function connectToServer(serverUrl, role) {
  if (!serverUrl) {
    showToast('请先输入信令服务器地址')
    return
  }
  
  savedServerUrl = serverUrl
  savedRole = role
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
      reconnectionDelay: BASE_RECONNECT_DELAY,
      timeout: 10000
    })

    socket.on('connect', () => {
      log('✓ 已连接到信令服务器，Socket ID: ' + socket.id)
      log('正在注册设备 ID: ' + myDeviceId)
      socket.emit('register', myDeviceId)
      updateServerStatus('已连接', 'connected')
      setConnectionStatus(CONNECTION_STATUS.CONNECTED)
      reconnectAttempts = 0
      showToast('已连接到信令服务器')
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
      showToast('连接服务器失败')
    })

    socket.on('reconnect_attempt', (attemptNumber) => {
      log('正在尝试重连... (第 ' + attemptNumber + ' 次)')
      reconnectAttempts = attemptNumber
    })

    socket.on('reconnect_failed', () => {
      log('✗ 重连失败，请检查服务器地址和网络连接')
      updateServerStatus('重连失败', 'error')
      setConnectionStatus(CONNECTION_STATUS.ERROR)
      showToast('重连失败')
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
        showToast('对方拒绝了连接请求')
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
    showToast('连接失败')
    updateServerStatus('连接失败', 'error')
    setConnectionStatus(CONNECTION_STATUS.ERROR)
  }
}

async function connectDevice() {
  const targetId = document.getElementById('targetDeviceId').value.trim().toUpperCase()
  const serverUrl = getServerUrl()
  
  if (!targetId) {
    showToast('请输入设备 ID')
    return
  }
  if (targetId.length !== 9) {
    showToast('设备 ID 格式不正确')
    return
  }
  if (targetId === myDeviceId) {
    showToast('不能连接自己')
    return
  }
  if (!socket || !socket.connected) {
    showToast('未连接到信令服务器')
    return
  }

  saveToHistory('signaling', { deviceId: targetId, serverUrl: serverUrl })
  
  incomingFromDeviceId = targetId
  socket.emit('connect-request', {
    fromDeviceId: myDeviceId,
    toDeviceId: targetId
  })

  showToast('连接请求已发送')
}

function showIncomingConnectionDialog(fromDeviceId) {
  if (confirm(`设备 ${fromDeviceId} 想要连接到你的设备，是否接受？`)) {
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

async function startListening() {
  const port = parseInt(document.getElementById('listenPort').value)
  if (isNaN(port) || port < 1024 || port > 65535) {
    showToast('请输入有效的端口号 (1024-65535)')
    return
  }
  
  try {
    log('正在启动TCP服务器，端口: ' + port)
    const result = await TCPSocket.startServer({ port })
    
    if (result.success) {
      log('TCP服务器已启动，监听端口: ' + port)
      updateServerStatus('监听中 (端口 ' + port + ')', 'connected')
      showToast('已开始监听')
    } else {
      log('启动TCP服务器失败: ' + result.error)
      showToast('启动监听失败: ' + result.error)
    }
  } catch (error) {
    log('启动TCP服务器异常: ' + error.message)
    showToast('启动监听失败')
  }
}

async function stopListening() {
  try {
    await TCPSocket.stopServer()
    log('TCP服务器已停止')
    updateServerStatus('就绪', 'disconnected')
  } catch (error) {
    log('停止TCP服务器失败: ' + error.message)
  }
}

async function connectDirect() {
  const remoteIp = document.getElementById('remoteIp').value.trim()
  const remotePort = parseInt(document.getElementById('remotePort').value)
  
  if (!remoteIp) {
    showToast('请输入对方IP地址')
    return
  }
  
  if (isNaN(remotePort) || remotePort < 1024 || remotePort > 65535) {
    showToast('请输入有效的端口号 (1024-65535)')
    return
  }
  
  saveToHistory('direct', { ip: remoteIp, port: remotePort })
  
  log('正在连接到 ' + remoteIp + ':' + remotePort + '...')
  
  try {
    const result = await TCPSocket.connect({ host: remoteIp, port: remotePort })
    
    if (result.success) {
      currentDirectClientId = result.clientId
      log('TCP连接成功，clientId: ' + currentDirectClientId)
      showToast('已连接到服务器')
      
      startHeartbeat()
      
      await startDirectControllerConnection()
    } else {
      log('TCP连接失败: ' + result.error)
      showToast('连接失败: ' + result.error)
    }
  } catch (error) {
    log('TCP连接异常: ' + error.message)
    showToast('连接失败')
  }
}

let heartbeatInterval = null

function startHeartbeat() {
  stopHeartbeat()
  
  heartbeatInterval = setInterval(() => {
    if (currentDirectClientId) {
      sendDirectMessage(currentDirectClientId, { type: 'heartbeat' })
    }
  }, 5000)
  
  log('心跳已启动，每5秒发送一次')
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
    log('心跳已停止')
  }
}

async function sendDirectMessage(clientId, message) {
  try {
    await TCPSocket.send({ clientId, message: JSON.stringify(message) })
  } catch (error) {
    log('发送TCP消息失败: ' + error.message)
  }
}

async function handleDirectMessage(message) {
  log('收到TCP消息: ' + message.type)
  
  try {
    switch (message.type) {
      case 'offer':
        await handleDirectOffer(message.offer)
        break
      case 'answer':
        await handleDirectAnswer(message.answer)
        break
      case 'ice-candidate':
        await handleDirectIceCandidate(message.candidate)
        break
      case 'heartbeat':
        break
    }
  } catch (error) {
    log('处理TCP消息失败: ' + error.message)
  }
}

async function startDirectControllerConnection() {
  log('作为主控端建立直连WebRTC连接')
  
  directPeerConnection = new RTCPeerConnection({ iceServers: [] })
  
  directPeerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      log('发送ICE候选')
      sendDirectMessage(currentDirectClientId, {
        type: 'ice-candidate',
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        }
      })
    }
  }
  
  directPeerConnection.ontrack = (event) => {
    log('收到远程媒体流，track类型: ' + event.track.kind)
    const stream = event.streams[0]
    if (stream) {
      log('流ID: ' + stream.id + ', tracks数量: ' + stream.getTracks().length)
      const remoteVideo = document.getElementById('remoteVideo')
      remoteVideo.srcObject = stream
      remoteVideo.play().catch(e => log('播放视频失败: ' + e.message))
      log('视频流已设置到video元素')
    }
  }
  
  directPeerConnection.onconnectionstatechange = () => {
    log('WebRTC连接状态: ' + directPeerConnection.connectionState)
    if (directPeerConnection.connectionState === 'connected') {
      isConnected = true
      showToast('连接成功')
    } else if (directPeerConnection.connectionState === 'failed') {
      isConnected = false
      showToast('连接失败')
    }
  }
  
  directPeerConnection.ondatachannel = (event) => {
    log('收到数据通道')
    dataChannel = event.channel
    setupDataChannel()
  }
  
  directPeerConnection.addTransceiver('video', { direction: 'recvonly' })
  directPeerConnection.addTransceiver('audio', { direction: 'recvonly' })
  log('已添加视频和音频接收器')
  
  log('创建数据通道')
  dataChannel = directPeerConnection.createDataChannel('control')
  setupDataChannel()
  
  try {
    log('创建WebRTC Offer')
    const offer = await directPeerConnection.createOffer()
    await directPeerConnection.setLocalDescription(offer)
    
    log('发送Offer到被控端')
    sendDirectMessage(currentDirectClientId, {
      type: 'offer',
      offer: {
        type: offer.type,
        sdp: offer.sdp
      }
    })
    
    log('Offer已发送')
  } catch (error) {
    log('创建Offer失败: ' + error.message)
    showToast('连接失败')
  }
}

async function handleDirectOffer(offer) {
  if (!offer) {
    log('错误: offer为空')
    return
  }
  
  log('处理Offer')
  
  try {
    directPeerConnection = new RTCPeerConnection({ iceServers: [] })
    
    directPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendDirectMessage(currentDirectClientId, {
          type: 'ice-candidate',
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          }
        })
      }
    }
    
    directPeerConnection.onconnectionstatechange = () => {
      log('WebRTC连接状态: ' + directPeerConnection.connectionState)
    }
    
    directPeerConnection.ondatachannel = (event) => {
      log('收到数据通道')
      dataChannel = event.channel
      setupDataChannel()
    }
    
    await directPeerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    log('远程描述设置成功')
    
    const answer = await directPeerConnection.createAnswer()
    await directPeerConnection.setLocalDescription(answer)
    log('本地描述设置成功')
    
    sendDirectMessage(currentDirectClientId, {
      type: 'answer',
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    })
    
    log('Answer已发送')
  } catch (error) {
    log('处理Offer失败: ' + error.message)
  }
}

async function handleDirectAnswer(answer) {
  if (!answer) {
    log('错误: answer为空')
    return
  }
  
  try {
    await directPeerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    log('Answer设置成功')
  } catch (error) {
    log('设置Answer失败: ' + error.message)
  }
}

async function handleDirectIceCandidate(candidate) {
  if (!candidate || !directPeerConnection) return
  
  try {
    await directPeerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    log('ICE候选添加成功')
  } catch (error) {
    log('添加ICE候选失败: ' + error.message)
  }
}

async function initController() {
  log('YCDesk Android 主控端初始化完成，设备ID: ' + myDeviceId)
  renderHistory('direct')
  renderHistory('signaling')
  
  try {
    await FloatingMouse.startService()
    log('悬浮鼠标服务已启动')
    
    FloatingMouse.addListener('mouseEvent', (event) => {
      handleFloatingMouseEvent(event)
    })
    log('悬浮鼠标事件监听已注册')
  } catch (e) {
    log('启动悬浮鼠标服务失败: ' + e.message)
  }
  
  TCPSocket.addListener('message', (data) => {
    try {
      const message = JSON.parse(data.message)
      handleDirectMessage(message)
    } catch (e) {
      console.error('解析TCP消息失败:', e)
    }
  })
  
  TCPSocket.addListener('disconnected', (data) => {
    log('TCP连接断开: ' + data.clientId)
    if (data.clientId === currentDirectClientId) {
      currentDirectClientId = null
      isConnected = false
      stopHeartbeat()
      hideFloatingMouse()
      showToast('连接已断开')
    }
  })
}

async function initControlled() {
  document.getElementById('deviceId').textContent = myDeviceId
  isAndroidControlled = true
  log('YCDesk Android 被控端初始化完成，设备ID: ' + myDeviceId)
  log('Android端被控模式已启用，可以接收来自Windows端的控制指令')
  
  try {
    await InputExecutor.setControlledMode({ enabled: true })
    log('InputExecutor被控模式已启用')
  } catch (e) {
    log('设置InputExecutor模式失败: ' + e.message)
  }
  
  const localIpList = document.getElementById('localIpList')
  if (localIpList) {
    localIpList.innerHTML = '<div class="ip-item">Android端暂不支持获取本机IP，请使用Windows端显示的IP地址</div>'
  }
  
  TCPSocket.addListener('incomingConnection', async (data) => {
    log('收到来自 ' + data.remoteAddress + ':' + data.remotePort + ' 的连接')
    currentDirectClientId = data.clientId
    isAndroidControlled = true
    try {
      await InputExecutor.setControlledMode({ enabled: true })
    } catch (e) {
      log('设置InputExecutor模式失败: ' + e.message)
    }
    showToast('收到连接请求，正在建立连接...')
  })
  
  TCPSocket.addListener('message', (data) => {
    try {
      const message = JSON.parse(data.message)
      handleDirectMessage(message)
    } catch (e) {
      console.error('解析TCP消息失败:', e)
    }
  })
  
  TCPSocket.addListener('disconnected', (data) => {
    log('TCP连接断开: ' + data.clientId)
    if (data.clientId === currentDirectClientId) {
      currentDirectClientId = null
      isConnected = false
      isAndroidControlled = false
      InputExecutor.setControlledMode({ enabled: false }).catch(() => {})
    }
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
    showToast('连接失败')
  }
}

async function startControlledConnection() {
  log('作为被控端建立连接')
  await createPeerConnection()
}

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(getIceConfig())

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit('ice-candidate', {
        sessionId: currentSessionId,
        candidate: event.candidate,
        toDeviceId: incomingFromDeviceId
      })
    }
  }

  peerConnection.ontrack = (event) => {
    log('收到远程媒体流，track类型: ' + event.track.kind)
    const stream = event.streams[0]
    if (stream) {
      log('流ID: ' + stream.id + ', tracks数量: ' + stream.getTracks().length)
      const remoteVideo = document.getElementById('remoteVideo')
      remoteVideo.srcObject = stream
      remoteVideo.play().catch(e => log('播放视频失败: ' + e.message))
      log('视频流已设置到video元素')
    }
  }

  peerConnection.onconnectionstatechange = () => {
    log('连接状态: ' + peerConnection.connectionState)
    if (peerConnection.connectionState === 'connected') {
      isConnected = true
      showToast('连接成功')
    } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      isConnected = false
      showToast('连接已断开')
      hideRemoteScreen()
    }
  }

  peerConnection.ondatachannel = (event) => {
    log('收到数据通道')
    dataChannel = event.channel
    setupDataChannel()
  }

  if (isController) {
    peerConnection.addTransceiver('video', { direction: 'recvonly' })
    peerConnection.addTransceiver('audio', { direction: 'recvonly' })
    log('已添加视频和音频接收器')
    
    log('创建数据通道（主控端）')
    dataChannel = peerConnection.createDataChannel('control')
    setupDataChannel()
  }
}

function setupDataChannel() {
  dataChannel.onopen = () => {
    log('数据通道已打开')
    showToast('连接成功！正在加载远程屏幕...')
    
    setTimeout(() => {
      showRemoteScreen()
      setupTouchEvents()
      if (isMouseMode) {
        showFloatingMouse()
      }
    }, 500)
  }

  dataChannel.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      log('收到数据通道消息: ' + JSON.stringify(data).substring(0, 100))
      
      if (data.type === 'screen-size') {
        log('收到屏幕尺寸: ' + data.width + 'x' + data.height)
        updateScreenSize(data.width, data.height)
      } else if (data.type === 'input') {
        handleReceivedInput(data)
      } else if (data.type === 'ping') {
        dataChannel.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }))
      }
    } catch (e) {
      log('解析数据通道消息失败: ' + e.message)
    }
  }

  dataChannel.onclose = () => {
    log('数据通道已关闭')
    hideRemoteScreen()
  }

  dataChannel.onerror = (error) => {
    console.error('数据通道错误:', error)
    showToast('数据通道错误')
  }
}

let isAndroidControlled = false

async function handleReceivedInput(inputData) {
  if (!isAndroidControlled) {
    log('Android端不是被控模式，忽略输入')
    return
  }
  
  log('处理接收到的输入: ' + inputData.inputType)
  
  try {
    await InputExecutor.executeInput(inputData)
  } catch (e) {
    log('执行输入失败: ' + e.message)
  }
}

function simulateMouseMove(x, y) {
  log('模拟鼠标移动: ' + x + ', ' + y)
  InputExecutor.executeInput({
    inputType: 'mousemove',
    x: x,
    y: y
  }).catch(e => log('执行鼠标移动失败: ' + e.message))
}

function simulateMouseDown(x, y, button) {
  log('模拟鼠标按下: ' + x + ', ' + y + ', button: ' + button)
  InputExecutor.executeInput({
    inputType: 'mousedown',
    x: x,
    y: y,
    button: button
  }).catch(e => log('执行鼠标按下失败: ' + e.message))
}

function simulateMouseUp(x, y, button) {
  log('模拟鼠标释放: ' + x + ', ' + y + ', button: ' + button)
  InputExecutor.executeInput({
    inputType: 'mouseup',
    x: x,
    y: y,
    button: button
  }).catch(e => log('执行鼠标释放失败: ' + e.message))
}

function simulateWheel(deltaY, deltaX) {
  log('模拟滚轮: deltaY=' + deltaY + ', deltaX=' + deltaX)
  InputExecutor.executeInput({
    inputType: 'wheel',
    deltaY: deltaY,
    deltaX: deltaX
  }).catch(e => log('执行滚轮失败: ' + e.message))
}

function simulateKeyDown(code, key, modifiers) {
  log('模拟键盘按下: ' + code + ', key: ' + key + 
      ', ctrl: ' + (modifiers.ctrlKey || false) +
      ', shift: ' + (modifiers.shiftKey || false) +
      ', alt: ' + (modifiers.altKey || false))
  InputExecutor.executeInput({
    inputType: 'keydown',
    code: code,
    key: key,
    ctrlKey: modifiers.ctrlKey || false,
    shiftKey: modifiers.shiftKey || false,
    altKey: modifiers.altKey || false,
    metaKey: modifiers.metaKey || false
  }).catch(e => log('执行键盘按下失败: ' + e.message))
}

function simulateKeyUp(code, key, modifiers) {
  log('模拟键盘释放: ' + code + ', key: ' + key)
  InputExecutor.executeInput({
    inputType: 'keyup',
    code: code,
    key: key,
    ctrlKey: modifiers.ctrlKey || false,
    shiftKey: modifiers.shiftKey || false,
    altKey: modifiers.altKey || false,
    metaKey: modifiers.metaKey || false
  }).catch(e => log('执行键盘释放失败: ' + e.message))
}

function sendControlCommand(command) {
  if (dataChannel && dataChannel.readyState === 'open') {
    const inputCommand = convertToInputCommand(command)
    log('发送控制命令: ' + JSON.stringify(inputCommand))
    dataChannel.send(JSON.stringify(inputCommand))
  } else {
    log('数据通道未打开，无法发送命令')
  }
}

function convertToInputCommand(command) {
  const inputCommand = {
    type: 'input',
    timestamp: Date.now()
  }
  
  switch (command.type) {
    case 'mouse-move':
      inputCommand.inputType = 'mousemove'
      inputCommand.x = normalizeCoordinate(command.x)
      inputCommand.y = normalizeCoordinate(command.y)
      break
      
    case 'mouse-click':
      inputCommand.inputType = 'mousedown'
      inputCommand.x = normalizeCoordinate(command.x)
      inputCommand.y = normalizeCoordinate(command.y)
      inputCommand.button = normalizeButton(command.button)
      break
      
    case 'mouse-down':
      inputCommand.inputType = 'mousedown'
      inputCommand.x = normalizeCoordinate(command.x)
      inputCommand.y = normalizeCoordinate(command.y)
      inputCommand.button = normalizeButton(command.button)
      break
      
    case 'mouse-up':
      inputCommand.inputType = 'mouseup'
      inputCommand.x = normalizeCoordinate(command.x)
      inputCommand.y = normalizeCoordinate(command.y)
      inputCommand.button = normalizeButton(command.button)
      break
      
    case 'mouse-wheel':
      inputCommand.inputType = 'wheel'
      inputCommand.deltaY = command.deltaY || 0
      inputCommand.deltaX = command.deltaX || 0
      break
      
    case 'keyboard':
      inputCommand.inputType = command.eventType
      inputCommand.code = command.code
      inputCommand.key = command.key || getKeyFromCode(command.code)
      if (command.ctrlKey) inputCommand.ctrlKey = true
      if (command.shiftKey) inputCommand.shiftKey = true
      if (command.altKey) inputCommand.altKey = true
      if (command.metaKey) inputCommand.metaKey = true
      break
      
    default:
      return command
  }
  
  return inputCommand
}

function normalizeCoordinate(value, maxValue = 65535) {
  if (value === undefined || value === null) return 0
  if (value >= 0 && value <= 1) return value
  return value / maxValue
}

function normalizeButton(button) {
  if (typeof button === 'number') return button
  if (typeof button === 'string') {
    const lower = button.toLowerCase()
    if (lower === 'right') return 2
    if (lower === 'middle') return 1
  }
  return 0
}

function getKeyFromCode(code) {
  const keyMap = {
    'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
    'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9',
    'KeyA': 'a', 'KeyB': 'b', 'KeyC': 'c', 'KeyD': 'd', 'KeyE': 'e',
    'KeyF': 'f', 'KeyG': 'g', 'KeyH': 'h', 'KeyI': 'i', 'KeyJ': 'j',
    'KeyK': 'k', 'KeyL': 'l', 'KeyM': 'm', 'KeyN': 'n', 'KeyO': 'o',
    'KeyP': 'p', 'KeyQ': 'q', 'KeyR': 'r', 'KeyS': 's', 'KeyT': 't',
    'KeyU': 'u', 'KeyV': 'v', 'KeyW': 'w', 'KeyX': 'x', 'KeyY': 'y', 'KeyZ': 'z',
    'Space': ' ', 'Enter': 'Enter', 'Backspace': 'Backspace', 'Tab': 'Tab',
    'Escape': 'Escape', 'Delete': 'Delete', 'Insert': 'Insert',
    'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown', 'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
    'Home': 'Home', 'End': 'End', 'PageUp': 'PageUp', 'PageDown': 'PageDown',
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
    'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
    'Minus': '-', 'Equal': '=', 'BracketLeft': '[', 'BracketRight': ']',
    'Backslash': '\\', 'Semicolon': ';', 'Quote': "'", 'Comma': ',', 'Period': '.', 'Slash': '/',
    'Backquote': '`'
  }
  return keyMap[code] || code
}

let currentScale = 1
let lastTouchDistance = 0
let mouseCursorX = 0
let mouseCursorY = 0
let isFullscreen = false

function setupTouchEvents() {
  const remoteVideo = document.getElementById('remoteVideo')
  const videoContainer = document.getElementById('videoContainer')
  const mouseCursor = document.getElementById('mouseCursor')
  if (!remoteVideo) return
  
  let touchStartTime = 0
  let touchStartX = 0
  let touchStartY = 0
  let lastTapTime = 0
  let touchCount = 0
  let isMouseDown = false
  
  remoteVideo.addEventListener('touchstart', (e) => {
    e.preventDefault()
    touchCount = e.touches.length
    
    if (touchCount === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      lastTouchDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      return
    }
    
    const touch = e.touches[0]
    touchStartTime = Date.now()
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    
    const rect = remoteVideo.getBoundingClientRect()
    const x = Math.round((touch.clientX - rect.left) / rect.width * 65535)
    const y = Math.round((touch.clientY - rect.top) / rect.height * 65535)
    
    if (isMouseMode) {
      mouseCursorX = touch.clientX - rect.left
      mouseCursorY = touch.clientY - rect.top
      updateMouseCursor()
      sendControlCommand({
        type: 'mouse-move',
        x: x,
        y: y
      })
    } else {
      sendControlCommand({
        type: 'mouse-move',
        x: x,
        y: y
      })
      sendControlCommand({
        type: 'mouse-down',
        x: x,
        y: y,
        button: 'left'
      })
      isMouseDown = true
    }
  }, { passive: false })
  
  remoteVideo.addEventListener('touchmove', (e) => {
    e.preventDefault()
    touchCount = e.touches.length
    
    if (touchCount === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      
      if (lastTouchDistance > 0) {
        const scaleDelta = distance / lastTouchDistance
        currentScale = Math.max(1, Math.min(3, currentScale * scaleDelta))
        remoteVideo.style.transform = `scale(${currentScale})`
      }
      
      lastTouchDistance = distance
      return
    }
    
    const touch = e.touches[0]
    
    const rect = remoteVideo.getBoundingClientRect()
    const x = Math.round((touch.clientX - rect.left) / rect.width * 65535)
    const y = Math.round((touch.clientY - rect.top) / rect.height * 65535)
    
    if (isMouseMode) {
      mouseCursorX = touch.clientX - rect.left
      mouseCursorY = touch.clientY - rect.top
      updateMouseCursor()
      sendControlCommand({
        type: 'mouse-move',
        x: x,
        y: y
      })
    } else {
      sendControlCommand({
        type: 'mouse-move',
        x: x,
        y: y
      })
    }
  }, { passive: false })
  
  remoteVideo.addEventListener('touchend', (e) => {
    e.preventDefault()
    const touchEndTime = Date.now()
    const touchDuration = touchEndTime - touchStartTime
    
    if (touchCount === 2) {
      lastTouchDistance = 0
      touchCount = 0
      return
    }
    
    const rect = remoteVideo.getBoundingClientRect()
    const x = Math.round((touchStartX - rect.left) / rect.width * 65535)
    const y = Math.round((touchStartY - rect.top) / rect.height * 65535)
    
    if (isMouseMode) {
      if (touchDuration < 200) {
        const now = Date.now()
        if (now - lastTapTime < 300) {
          sendControlCommand({
            type: 'mouse-down',
            x: x,
            y: y,
            button: 'left'
          })
          sendControlCommand({
            type: 'mouse-up',
            x: x,
            y: y,
            button: 'left'
          })
          setTimeout(() => {
            sendControlCommand({
              type: 'mouse-down',
              x: x,
              y: y,
              button: 'left'
            })
            sendControlCommand({
              type: 'mouse-up',
              x: x,
              y: y,
              button: 'left'
            })
          }, 100)
        } else {
          sendControlCommand({
            type: 'mouse-down',
            x: x,
            y: y,
            button: 'left'
          })
          sendControlCommand({
            type: 'mouse-up',
            x: x,
            y: y,
            button: 'left'
          })
        }
        lastTapTime = now
      } else if (touchDuration >= 500) {
        sendControlCommand({
          type: 'mouse-down',
          x: x,
          y: y,
          button: 'right'
        })
        sendControlCommand({
          type: 'mouse-up',
          x: x,
          y: y,
          button: 'right'
        })
      }
    } else {
      if (isMouseDown) {
        sendControlCommand({
          type: 'mouse-up',
          x: x,
          y: y,
          button: 'left'
        })
        isMouseDown = false
      }
    }
    
    touchCount = 0
  }, { passive: false })
  
  remoteVideo.addEventListener('touchcancel', (e) => {
    e.preventDefault()
    if (isMouseDown) {
      const rect = remoteVideo.getBoundingClientRect()
      const x = Math.round((touchStartX - rect.left) / rect.width * 65535)
      const y = Math.round((touchStartY - rect.top) / rect.height * 65535)
      sendControlCommand({
        type: 'mouse-up',
        x: x,
        y: y,
        button: 'left'
      })
      isMouseDown = false
    }
    lastTouchDistance = 0
    touchCount = 0
  }, { passive: false })
  
  log('触摸事件已设置')
}

function updateMouseCursor() {
  const mouseCursor = document.getElementById('mouseCursor')
  if (!mouseCursor) return
  
  if (isMouseMode) {
    mouseCursor.style.display = 'block'
    mouseCursor.style.left = mouseCursorX + 'px'
    mouseCursor.style.top = mouseCursorY + 'px'
  } else {
    mouseCursor.style.display = 'none'
  }
}

function toggleMouseMode() {
  isMouseMode = !isMouseMode
  const mouseCursor = document.getElementById('mouseCursor')
  
  if (isMouseMode) {
    showToast('鼠标模式已开启 - 长按右键，双击双击')
    if (mouseCursor) mouseCursor.style.display = 'block'
    showFloatingMouse()
  } else {
    showToast('触摸模式已开启')
    if (mouseCursor) mouseCursor.style.display = 'none'
    hideFloatingMouse()
  }
}

async function showFloatingMouse() {
  try {
    // 先检查权限
    const permResult = await FloatingMouse.hasPermission()
    log('悬浮窗权限状态: ' + (permResult.granted ? '已授权' : '未授权'))
    
    if (!permResult.granted) {
      log('正在请求悬浮窗权限...')
      const requestResult = await FloatingMouse.requestPermission()
      if (!requestResult.granted) {
        showToast('请在设置中开启悬浮窗权限')
        return
      }
    }
    
    const result = await FloatingMouse.show()
    if (result.success) {
      log('悬浮鼠标已显示')
    } else {
      log('显示悬浮鼠标失败: ' + result.error)
      if (result.needPermission) {
        showToast('需要悬浮窗权限')
      } else if (result.needStartService) {
        log('服务未启动，正在启动...')
        await FloatingMouse.startService()
        await FloatingMouse.show()
      }
    }
  } catch (e) {
    log('显示悬浮鼠标失败: ' + e.message)
  }
}

async function hideFloatingMouse() {
  try {
    await FloatingMouse.hide()
    log('悬浮鼠标已隐藏')
  } catch (e) {
    log('隐藏悬浮鼠标失败: ' + e.message)
  }
}

function handleFloatingMouseEvent(event) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    log('数据通道未打开，无法发送鼠标事件')
    return
  }
  
  const inputCommand = {
    type: 'input',
    timestamp: Date.now()
  }
  
  switch (event.type) {
    case 'mousemove':
      inputCommand.inputType = 'mousemove'
      inputCommand.x = event.x
      inputCommand.y = event.y
      break
      
    case 'mousedown':
      inputCommand.inputType = 'mousedown'
      inputCommand.x = event.x
      inputCommand.y = event.y
      inputCommand.button = event.button
      break
      
    case 'mouseup':
      inputCommand.inputType = 'mouseup'
      inputCommand.x = event.x
      inputCommand.y = event.y
      inputCommand.button = event.button
      break
      
    case 'wheel':
      inputCommand.inputType = 'wheel'
      inputCommand.deltaY = event.delta
      break
      
    case 'dblclick':
      inputCommand.inputType = 'dblclick'
      inputCommand.x = event.x
      inputCommand.y = event.y
      inputCommand.button = event.button
      break
      
    case 'dragstart':
      inputCommand.inputType = 'mousedown'
      inputCommand.x = event.x
      inputCommand.y = event.y
      inputCommand.button = event.button
      break
      
    case 'dragend':
      inputCommand.inputType = 'mouseup'
      inputCommand.x = event.x
      inputCommand.y = event.y
      inputCommand.button = event.button
      break
      
    default:
      return
  }
  
  log('发送悬浮鼠标事件: ' + event.type)
  dataChannel.send(JSON.stringify(inputCommand))
}

function toggleFullscreen() {
  const remoteScreen = document.getElementById('remoteScreen')
  const remoteVideo = document.getElementById('remoteVideo')
  
  if (!isFullscreen) {
    if (remoteScreen.requestFullscreen) {
      remoteScreen.requestFullscreen()
    } else if (remoteScreen.webkitRequestFullscreen) {
      remoteScreen.webkitRequestFullscreen()
    } else if (remoteScreen.msRequestFullscreen) {
      remoteScreen.msRequestFullscreen()
    }
    remoteScreen.classList.add('fullscreen-mode')
    remoteVideo.classList.add('fullscreen')
    isFullscreen = true
    showToast('全屏模式已开启')
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen()
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen()
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen()
    }
    remoteScreen.classList.remove('fullscreen-mode')
    remoteVideo.classList.remove('fullscreen')
    isFullscreen = false
    showToast('已退出全屏')
  }
}

function handleOrientationChange() {
  const orientation = window.orientation || 0
  const remoteVideo = document.getElementById('remoteVideo')
  const remoteScreen = document.getElementById('remoteScreen')
  
  if (orientation === 90 || orientation === -90) {
    log('横屏模式')
    if (remoteVideo) {
      remoteVideo.classList.add('fullscreen')
    }
    if (remoteScreen) {
      remoteScreen.classList.add('fullscreen-mode')
    }
  } else {
    log('竖屏模式')
    if (remoteVideo && !isFullscreen) {
      remoteVideo.classList.remove('fullscreen')
    }
  }
}

window.addEventListener('orientationchange', handleOrientationChange)
window.addEventListener('resize', () => {
  if (window.innerWidth > window.innerHeight) {
    log('横屏检测')
  }
})

function updateScreenSize(width, height) {
  log('更新屏幕尺寸: ' + width + 'x' + height)
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
  if (data.candidate && peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
  }
}

function showRemoteScreen() {
  document.getElementById('mainContainer').style.display = 'none'
  document.getElementById('remoteScreen').classList.add('active')
  startStatsMonitoring()
}

function hideRemoteScreen() {
  document.getElementById('mainContainer').style.display = 'block'
  document.getElementById('remoteScreen').classList.remove('active')
  const remoteVideo = document.getElementById('remoteVideo')
  remoteVideo.srcObject = null
  stopStatsMonitoring()
}

let statsInterval = null

function startStatsMonitoring() {
  if (statsInterval) {
    clearInterval(statsInterval)
  }
  
  statsInterval = setInterval(async () => {
    const pc = directPeerConnection || peerConnection
    if (!pc) return
    
    try {
      const stats = await pc.getStats()
      let videoStats = null
      let candidatePairStats = null
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          videoStats = report
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          candidatePairStats = report
        }
      })
      
      if (videoStats) {
        const width = videoStats.frameWidth || 0
        const height = videoStats.frameHeight || 0
        const fps = videoStats.framesPerSecond || 0
        const bitrate = videoStats.bytesReceived || 0
        
        document.getElementById('statsResolution').textContent = 
          width > 0 ? `${width}x${height}` : '-'
        document.getElementById('statsFps').textContent = 
          fps > 0 ? `${fps} fps` : '-'
        
        if (videoStats.lastStatsTime) {
          const timeDiff = (Date.now() - videoStats.lastStatsTime) / 1000
          const bytesDiff = bitrate - (videoStats.lastBytesReceived || 0)
          const bitrateMbps = ((bytesDiff * 8) / timeDiff / 1000000).toFixed(2)
          document.getElementById('statsBitrate').textContent = `${bitrateMbps} Mbps`
        }
        
        videoStats.lastStatsTime = Date.now()
        videoStats.lastBytesReceived = bitrate
      }
      
      if (candidatePairStats) {
        const rtt = candidatePairStats.currentRoundTripTime
        if (rtt !== undefined) {
          const latencyMs = (rtt * 1000).toFixed(0)
          document.getElementById('statsLatency').textContent = `${latencyMs} ms`
        }
      }
    } catch (error) {
      console.error('获取统计信息失败:', error)
    }
  }, 1000)
}

function stopStatsMonitoring() {
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
}

let keyboardVisible = false
let activeModifiers = {
  Control: false,
  Shift: false,
  Alt: false,
  Meta: false,
  CapsLock: false
}

function toggleKeyboard() {
  keyboardVisible = !keyboardVisible
  const keyboardOverlay = document.getElementById('keyboardOverlay')
  if (keyboardVisible) {
    keyboardOverlay.classList.add('active')
    showToast('键盘已打开')
  } else {
    keyboardOverlay.classList.remove('active')
    showToast('键盘已关闭')
  }
}

function sendKey(keyCode) {
  const event = {
    type: 'keyboard',
    eventType: 'keydown',
    code: keyCode,
    key: getKeyFromCode(keyCode),
    ctrlKey: activeModifiers.Control,
    shiftKey: activeModifiers.Shift,
    altKey: activeModifiers.Alt,
    metaKey: activeModifiers.Meta
  }
  
  sendControlCommand(event)
  
  setTimeout(() => {
    sendControlCommand({
      ...event,
      eventType: 'keyup'
    })
  }, 50)
  
  if (activeModifiers.Shift) {
    toggleModifier('Shift')
  }
}

function toggleModifier(modifier) {
  activeModifiers[modifier] = !activeModifiers[modifier]
  
  const keyIds = {
    'Control': ['keyControl', 'keyControl2'],
    'Shift': ['keyShift', 'keyShift2'],
    'Alt': ['keyAlt', 'keyAlt2'],
    'Meta': ['keyMeta'],
    'CapsLock': ['keyCapsLock']
  }
  
  const ids = keyIds[modifier] || []
  ids.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      if (activeModifiers[modifier]) {
        el.classList.add('active')
      } else {
        el.classList.remove('active')
      }
    }
  })
  
  showToast(`${modifier} ${activeModifiers[modifier] ? '已按下' : '已释放'}`)
}

function disconnect() {
  if (confirm('确定要断开连接吗？')) {
    stopHeartbeat()
    hideFloatingMouse()
    if (dataChannel) {
      dataChannel.close()
      dataChannel = null
    }
    if (peerConnection) {
      peerConnection.close()
      peerConnection = null
    }
    if (directPeerConnection) {
      directPeerConnection.close()
      directPeerConnection = null
    }
    if (currentDirectClientId) {
      TCPSocket.disconnect({ clientId: currentDirectClientId })
      currentDirectClientId = null
    }
    isConnected = false
    isController = false
    keyboardVisible = false
    const keyboardOverlay = document.getElementById('keyboardOverlay')
    if (keyboardOverlay) keyboardOverlay.classList.remove('active')
    hideRemoteScreen()
    showToast('已断开连接')
  }
}

async function init() {
  console.log('YCDesk Android 初始化')
  
  try {
    const deviceInfo = await Device.getInfo()
    console.log('设备信息:', deviceInfo)
  } catch (e) {
    console.log('获取设备信息失败')
  }
  
  myDeviceId = generateDeviceId()
  
  const networkStatus = await Network.getStatus()
  console.log('网络状态:', networkStatus)
  
  Network.addListener('networkStatusChange', (status) => {
    console.log('网络状态变化:', status)
    if (!status.connected) {
      showToast('网络已断开')
      if (connectionStatus === CONNECTION_STATUS.CONNECTED) {
        attemptReconnect()
      }
    }
  })
  
  App.addListener('backButton', ({ canGoBack }) => {
    if (isConnected) {
      disconnect()
    } else if (currentRole) {
      goBack()
    } else {
      App.exitApp()
    }
  })
  
  console.log('初始化完成，设备ID:', myDeviceId)
}

document.addEventListener('DOMContentLoaded', init)

window.selectRole = selectRole
window.goBack = goBack
window.switchControllerMode = switchControllerMode
window.switchControlledMode = switchControlledMode
window.copyDeviceId = copyDeviceId
window.connectDevice = connectDevice
window.connectDirect = connectDirect
window.toggleKeyboard = toggleKeyboard
window.toggleMouseMode = toggleMouseMode
window.toggleFullscreen = toggleFullscreen
window.sendKey = sendKey
window.toggleModifier = toggleModifier
window.disconnect = disconnect
window.manualConnectToServer = manualConnectToServer
window.disconnectFromServer = disconnectFromServer
window.controlledConnectToServer = controlledConnectToServer
window.controlledDisconnectFromServer = controlledDisconnectFromServer
window.startListening = startListening
window.stopListening = stopListening
window.acceptConnection = acceptConnection
window.rejectConnection = rejectConnection
window.deleteFromHistory = deleteFromHistory
window.reconnectFromHistory = reconnectFromHistory
