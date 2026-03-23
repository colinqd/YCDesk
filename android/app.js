import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { io } from 'socket.io-client';

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
let isDirectController = false
let dataChannel = null
let connectionLogDiv = null
let currentRole = null
let isConnected = false
let isMouseMode = false

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

function showToast(message, duration = 2000) {
  const toast = document.getElementById('toast')
  toast.textContent = message
  toast.classList.add('show')
  setTimeout(() => {
    toast.classList.remove('show')
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

function selectRole(role) {
  currentRole = role
  document.getElementById('rolePage').classList.remove('active')
  
  if (role === 'controller') {
    document.getElementById('controllerPage').classList.add('active')
    connectionLogDiv = document.getElementById('connectionLog')
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
  connectToServer(getServerUrl())
}

function controlledConnectToServer() {
  if (socket && socket.connected) {
    showToast('已经连接到服务器')
    log('已经连接到服务器，无需重复连接')
    return
  }
  connectToServer(getControlledServerUrl())
}

function disconnectFromServer() {
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

function connectToServer(serverUrl) {
  if (!serverUrl) {
    showToast('请先输入信令服务器地址')
    return
  }
  
  log('正在连接信令服务器: ' + serverUrl)
  updateServerStatus('连接中...', 'connecting')
  
  try {
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    })

    socket.on('connect', () => {
      log('✓ 已连接到信令服务器，Socket ID: ' + socket.id)
      log('正在注册设备 ID: ' + myDeviceId)
      socket.emit('register', myDeviceId)
      updateServerStatus('已连接', 'connected')
      showToast('已连接到信令服务器')
    })

    socket.on('disconnect', (reason) => {
      log('与信令服务器断开连接，原因: ' + reason)
      updateServerStatus('已断开', 'disconnected')
    })

    socket.on('connect_error', (error) => {
      log('✗ 连接错误: ' + (error.message || error))
      updateServerStatus('连接失败', 'error')
      showToast('连接服务器失败')
    })

    socket.on('reconnect_attempt', (attemptNumber) => {
      log('正在尝试重连... (第 ' + attemptNumber + ' 次)')
    })

    socket.on('reconnect_failed', () => {
      log('✗ 重连失败，请检查服务器地址和网络连接')
      showToast('重连失败')
    })

    socket.on('incoming-connection', (data) => {
      log('收到连接请求: ' + JSON.stringify(data))
      incomingFromDeviceId = data.fromDeviceId
      currentSessionId = data.sessionId
      isController = false
      showToast(`设备 ${data.fromDeviceId} 请求连接`)
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
  }
}

async function connectDevice() {
  const targetId = document.getElementById('targetDeviceId').value.trim().toUpperCase()
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

  incomingFromDeviceId = targetId
  socket.emit('connect-request', {
    fromDeviceId: myDeviceId,
    toDeviceId: targetId
  })

  showToast('连接请求已发送')
}

async function startListening() {
  const port = parseInt(document.getElementById('listenPort').value)
  if (isNaN(port) || port < 1024 || port > 65535) {
    showToast('请输入有效的端口号 (1024-65535)')
    return
  }
  
  log('开始监听端口 ' + port + '，等待连接...')
  updateServerStatus('监听中 (端口 ' + port + ')', 'connected')
  showToast('Android端监听功能开发中')
}

async function stopListening() {
  log('已停止监听')
  updateServerStatus('就绪', 'disconnected')
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
  
  log('正在连接到 ' + remoteIp + ':' + remotePort + '...')
  showToast('Android端直连功能开发中')
}

async function initController() {
  log('YCDesk Android 主控端初始化完成，设备ID: ' + myDeviceId)
}

async function initControlled() {
  document.getElementById('deviceId').textContent = myDeviceId
  log('YCDesk Android 被控端初始化完成，设备ID: ' + myDeviceId)
  log('注意：Android端仅作为控制端使用，被控端功能仅作演示')
  
  const localIpList = document.getElementById('localIpList')
  if (localIpList) {
    localIpList.innerHTML = '<div class="ip-item">Android端暂不支持获取本机IP</div>'
  }
}

async function startControllerConnection() {
  console.log('作为主控端建立连接')
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
    console.error('创建 offer 失败:', error)
    showToast('连接失败')
  }
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
    console.log('收到远程媒体流')
    const stream = event.streams[0]
    const remoteVideo = document.getElementById('remoteVideo')
    remoteVideo.srcObject = stream
    showRemoteScreen()
  }

  peerConnection.onconnectionstatechange = () => {
    console.log('连接状态:', peerConnection.connectionState)
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
    console.log('收到数据通道')
    dataChannel = event.channel
    setupDataChannel()
  }

  if (isController) {
    console.log('创建数据通道（主控端）')
    dataChannel = peerConnection.createDataChannel('control')
    setupDataChannel()
  }
}

function setupDataChannel() {
  dataChannel.onopen = () => {
    console.log('数据通道已打开')
  }

  dataChannel.onmessage = (event) => {
    console.log('收到数据通道消息:', event.data)
  }

  dataChannel.onclose = () => {
    console.log('数据通道已关闭')
  }

  dataChannel.onerror = (error) => {
    console.error('数据通道错误:', error)
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
  if (data.candidate && peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
  }
}

function showRemoteScreen() {
  document.getElementById('mainContainer').style.display = 'none'
  document.getElementById('remoteScreen').classList.add('active')
}

function hideRemoteScreen() {
  document.getElementById('mainContainer').style.display = 'block'
  document.getElementById('remoteScreen').classList.remove('active')
  const remoteVideo = document.getElementById('remoteVideo')
  remoteVideo.srcObject = null
}

function showKeyboard() {
  showToast('键盘功能开发中')
}

function toggleMouse() {
  isMouseMode = !isMouseMode
  showToast(isMouseMode ? '鼠标模式已开启' : '鼠标模式已关闭')
}

function disconnect() {
  if (confirm('确定要断开连接吗？')) {
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
    isConnected = false
    isController = false
    isDirectController = false
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
    }
  })
  
  App.addListener('backButton', ({ canGoBack }) => {
    if (isConnected) {
      disconnect()
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
window.showKeyboard = showKeyboard
window.toggleMouse = toggleMouse
window.disconnect = disconnect
window.manualConnectToServer = manualConnectToServer
window.disconnectFromServer = disconnectFromServer
window.controlledConnectToServer = controlledConnectToServer
window.controlledDisconnectFromServer = controlledDisconnectFromServer
window.startListening = startListening
window.stopListening = stopListening
