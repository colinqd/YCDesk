import s from './state.js'
import { io } from 'socket.io-client'
import { registerPlugin } from '@capacitor/core'
import '../shared/config.js'

const TCPSocket = registerPlugin('TCPSocket')

async function sendDirectMessage(clientId, message) {
  try {
    await TCPSocket.send({ clientId, message: JSON.stringify(message) })
  } catch (error) {
    if (typeof window.log === 'function') window.log('发送TCP消息失败: ' + error.message)
  }
}

function extractHostname(url) {
  let hostname = url.trim()
  hostname = hostname.replace(/^wss?:\/\//i, '')
  hostname = hostname.replace(/^https?:\/\//i, '')
  hostname = hostname.replace(/^\/\//, '')
  const slashIndex = hostname.indexOf('/')
  if (slashIndex > 0) {
    hostname = hostname.substring(0, slashIndex)
  }
  const colonIndex = hostname.lastIndexOf(':')
  if (colonIndex > 0) {
    hostname = hostname.substring(0, colonIndex)
  }
  return hostname
}

function isIpAddress(str) {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6Pattern = /^\[?[0-9a-fA-F:]+\]?$/
  return ipv4Pattern.test(str) || ipv6Pattern.test(str)
}

async function resolveHostname(hostname) {
  const log = typeof window.log === 'function' ? window.log : console.log
  
  if (isIpAddress(hostname)) {
    log('输入的是IP地址，无需DNS解析: ' + hostname)
    return { success: true, ipAddress: hostname, hostname: hostname, isResolved: false }
  }
  
  try {
    const result = await TCPSocket.resolveDns({ hostname: hostname })
    if (result.success) {
      log('DNS解析成功: ' + hostname + ' -> ' + result.ipAddress)
    }
    return result
  } catch (error) {
    log('DNS解析失败: ' + error.message)
    return { success: false, error: error.message, ipAddress: hostname, hostname: hostname }
  }
}

function buildWsUrl(serverUrl) {
  let url = serverUrl.trim()
  url = url.replace(/^https:\/\//i, 'wss://')
  url = url.replace(/^http:\/\//i, 'ws://')
  if (!url.match(/^wss?:\/\//i)) {
    url = 'ws://' + url
  }
  return url
}

function buildHttpUrl(serverUrl) {
  let url = serverUrl.trim()
  url = url.replace(/^wss:\/\//i, 'https://')
  url = url.replace(/^ws:\/\//i, 'http://')
  if (!url.match(/^https?:\/\//i)) {
    url = 'http://' + url
  }
  return url
}

function setConnectionMode(mode) {
  s.connectionMode = mode
  if (typeof window.log === 'function') window.log('连接方式已设置为: ' + (mode === 'websocket' ? '原始 WebSocket' : 'Socket.IO'))
}

function startWsHeartbeat() {
  stopWsHeartbeat()
  s.wsHeartbeatInterval = setInterval(() => {
    if (s.socket && s.socket.readyState === WebSocket.OPEN) {
      s.socket.send(JSON.stringify({ type: 'ping' }))
    }
  }, 5000)
}

function stopWsHeartbeat() {
  if (s.wsHeartbeatInterval) {
    clearInterval(s.wsHeartbeatInterval)
    s.wsHeartbeatInterval = null
  }
}

function wsSend(type, data) {
  if (!s.socket) return
  
  if (s.connectionMode === 'websocket') {
    if (s.socket.readyState === WebSocket.OPEN) {
      s.socket.send(JSON.stringify({ type, ...data }))
    }
  } else {
    if (s.socket && s.socket.connected) {
      s.socket.emit(type, data)
    }
  }
}

function isSocketConnected() {
  if (s.connectionMode === 'websocket') {
    return s.socket && s.socket.readyState === WebSocket.OPEN
  } else {
    return s.socket && s.socket.connected
  }
}

function handleWsMessage(data) {
  const log = typeof window.log === 'function' ? window.log : console.log
  
  switch (data.type) {
    case 'registered':
      log('设备注册成功: ' + data.deviceId)
      break

    case 'incoming-connection':
      log('收到连接请求: ' + JSON.stringify(data))
      s.incomingFromDeviceId = data.fromDeviceId
      s.currentSessionId = data.sessionId
      s.isController = false
      const autoAccept = document.getElementById('autoAcceptConnection')?.checked
      if (autoAccept) {
        log('自动接受来自 ' + data.fromDeviceId + ' 的连接')
        if (typeof window.acceptConnection === 'function') {
          window.acceptConnection()
        }
      } else {
        if (typeof window.showIncomingConnectionDialog === 'function') {
          window.showIncomingConnectionDialog(data.fromDeviceId)
        }
      }
      break

    case 'connection-result':
      log('连接结果: ' + JSON.stringify(data))
      if (data.accepted) {
        s.currentSessionId = data.sessionId
        s.isController = true
        if (typeof window.startControllerConnection === 'function') {
          window.startControllerConnection()
        }
      } else {
        if (typeof window.showToast === 'function') window.showToast('对方拒绝了连接请求')
      }
      break

    case 'connection-failed':
      log('连接失败: ' + (data.reason || '未知原因'))
      if (typeof window.showToast === 'function') window.showToast('连接失败: ' + (data.reason === 'device-offline' ? '目标设备不在线' : data.reason))
      break

    case 'offer':
      log('收到 offer')
      if (typeof window.handleOffer === 'function') window.handleOffer(data)
      break

    case 'answer':
      log('收到 answer')
      if (typeof window.handleAnswer === 'function') window.handleAnswer(data)
      break

    case 'ice-candidate':
      log('收到 ICE candidate')
      if (typeof window.handleIceCandidate === 'function') window.handleIceCandidate(data)
      break

    case 'pong':
      break
  }
}

async function connectToServer(serverUrl, role) {
  const log = typeof window.log === 'function' ? window.log : console.log
  log('连接方式: 自动检测')
  if (!serverUrl) {
    if (typeof window.showToast === 'function') window.showToast('请先输入信令服务器地址')
    return
  }
  
  log('原始地址: ' + serverUrl)
  const originalUrl = serverUrl
  serverUrl = CONFIG.normalizeServerUrl(serverUrl)
  log('normalize后: ' + serverUrl)
  if (originalUrl !== serverUrl) {
    log('自动修正服务器地址: ' + originalUrl + ' -> ' + serverUrl)
  }
  
  const hostname = extractHostname(serverUrl)
  log('提取主机名: ' + hostname)
  
  const dnsResult = await resolveHostname(hostname)
  if (dnsResult.success && dnsResult.isResolved) {
    log('域名解析结果: ' + hostname + ' -> ' + dnsResult.ipAddress)
  } else if (!dnsResult.success) {
    log('DNS解析失败，尝试直接连接: ' + dnsResult.error)
  }
  
  s.savedServerUrl = serverUrl
  s.savedRole = role
  s.reconnectAttempts = 0
  
  _connectAuto(serverUrl)
}

function _connectAuto(serverUrl) {
  const log = typeof window.log === 'function' ? window.log : console.log
  log('自动检测服务器协议...')
  s._autoSettled = false
  s._autoServerUrl = serverUrl

  s._autoTimer = setTimeout(() => {
    if (!s._autoSettled) {
      s._autoSettled = true
      _cleanupSocketIO()
      log('Socket.IO 超时，切换到原始 WebSocket')
      s.connectionMode = 'websocket'
      _connectWebSocket(serverUrl)
    }
  }, 2500)

  s.connectionMode = 'socketio'
  _connectSocketIO(serverUrl)
}

function _cleanupSocketIO() {
  if (s.socket && typeof s.socket.disconnect === 'function') {
    try {
      s.socket.removeAllListeners()
      s.socket.disconnect()
    } catch (e) {}
  }
  s.socket = null
}

function _connectWebSocket(serverUrl) {
  const log = typeof window.log === 'function' ? window.log : console.log
  const wsUrl = buildWsUrl(serverUrl)
  log('最终WebSocket地址: ' + wsUrl)
  log('连接信令服务器: ' + wsUrl)
  if (typeof window.updateServerStatus === 'function') window.updateServerStatus('连接中...', 'connecting')
  s.connectionStatus = s.CONNECTION_STATUS.CONNECTING
  
  try {
    if (s.socket) {
      s.socket.close()
    }
    
    s.socket = new WebSocket(wsUrl)

    s.socket.onopen = () => {
      log('✓ 已连接到信令服务器')
      log('正在注册设备 ID: ' + s.myDeviceId)
      wsSend('register', { deviceId: s.myDeviceId })
      if (typeof window.updateServerStatus === 'function') window.updateServerStatus('已连接 (WebSocket)', 'connected')
      s.connectionStatus = s.CONNECTION_STATUS.CONNECTED
      s.reconnectAttempts = 0
      if (typeof window.showToast === 'function') window.showToast('已连接到信令服务器')
      startWsHeartbeat()
    }

    s.socket.onclose = (event) => {
      log('与信令服务器断开连接, code: ' + event.code)
      stopWsHeartbeat()
      if (typeof window.updateServerStatus === 'function') window.updateServerStatus('已断开', 'disconnected')
      s.connectionStatus = s.CONNECTION_STATUS.DISCONNECTED
    }

    s.socket.onerror = (error) => {
      log('✗ 连接错误')
      if (typeof window.updateServerStatus === 'function') window.updateServerStatus('连接失败', 'error')
      s.connectionStatus = s.CONNECTION_STATUS.ERROR
      if (typeof window.showToast === 'function') window.showToast('连接服务器失败')
    }

    s.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleWsMessage(data)
      } catch (e) {
        log('解析消息失败: ' + e.message)
      }
    }
  } catch (error) {
    log('✗ 连接初始化错误: ' + error.message)
    if (typeof window.showToast === 'function') window.showToast('连接失败')
    if (typeof window.updateServerStatus === 'function') window.updateServerStatus('连接失败', 'error')
    s.connectionStatus = s.CONNECTION_STATUS.ERROR
  }
}

function _connectSocketIO(serverUrl) {
  const log = typeof window.log === 'function' ? window.log : console.log
  const httpUrl = buildHttpUrl(serverUrl)
  log('最终Socket.IO地址: ' + httpUrl)
  log('连接信令服务器 [Socket.IO]: ' + httpUrl)
  if (typeof window.updateServerStatus === 'function') window.updateServerStatus('连接中...', 'connecting')
  s.connectionStatus = s.CONNECTION_STATUS.CONNECTING
  
  try {
    if (s.socket) {
      s.socket.disconnect()
    }
    
    s.socket = io(httpUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: s.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: s.BASE_RECONNECT_DELAY,
      timeout: 10000
    })

    s.socket.on('connect', () => {
      if (s._autoTimer && !s._autoSettled) {
        s._autoSettled = true
        clearTimeout(s._autoTimer)
        s._autoTimer = null
        log('✓ 协议协商成功: Socket.IO')
      }
      log('✓ 已连接到信令服务器，Socket ID: ' + s.socket.id)
      log('正在注册设备 ID: ' + s.myDeviceId)
      s.socket.emit('register', { deviceId: s.myDeviceId })
      if (typeof window.updateServerStatus === 'function') window.updateServerStatus('已连接 (Socket.IO)', 'connected')
      s.connectionStatus = s.CONNECTION_STATUS.CONNECTED
      s.reconnectAttempts = 0
      if (typeof window.showToast === 'function') window.showToast('已连接到信令服务器')
    })

    s.socket.on('disconnect', (reason) => {
      if (s._autoTimer && !s._autoSettled) return
      log('与信令服务器断开连接，原因: ' + reason)
      if (typeof window.updateServerStatus === 'function') window.updateServerStatus('已断开', 'disconnected')
      s.connectionStatus = s.CONNECTION_STATUS.DISCONNECTED
    })

    s.socket.on('connect_error', (error) => {
      if (s._autoTimer && !s._autoSettled) {
        s._autoSettled = true
        clearTimeout(s._autoTimer)
        s._autoTimer = null
        _cleanupSocketIO()
        log('Socket.IO 连接失败，切换到原始 WebSocket')
        s.connectionMode = 'websocket'
        _connectWebSocket(s._autoServerUrl)
        return
      }
      log('✗ 连接错误: ' + (error.message || error))
      if (typeof window.updateServerStatus === 'function') window.updateServerStatus('连接失败', 'error')
      s.connectionStatus = s.CONNECTION_STATUS.ERROR
      if (typeof window.showToast === 'function') window.showToast('连接服务器失败')
    })

    s.socket.on('registered', (data) => {
      log('设备注册成功: ' + data.deviceId)
    })

    s.socket.on('incoming-connection', (data) => {
      log('收到连接请求: ' + JSON.stringify(data))
      s.incomingFromDeviceId = data.fromDeviceId
      s.currentSessionId = data.sessionId
      s.isController = false
      const autoAccept = document.getElementById('autoAcceptConnection')?.checked
      if (autoAccept) {
        log('自动接受来自 ' + data.fromDeviceId + ' 的连接')
        if (typeof window.acceptConnection === 'function') {
          window.acceptConnection()
        }
      } else {
        if (typeof window.showIncomingConnectionDialog === 'function') {
          window.showIncomingConnectionDialog(data.fromDeviceId)
        }
      }
    })

    s.socket.on('connection-result', (data) => {
      log('连接结果: ' + JSON.stringify(data))
      if (data.accepted) {
        s.currentSessionId = data.sessionId
        s.isController = true
        if (typeof window.startControllerConnection === 'function') {
          window.startControllerConnection()
        }
      } else {
        if (typeof window.showToast === 'function') window.showToast('对方拒绝了连接请求')
      }
    })

    s.socket.on('connection-failed', (data) => {
      log('连接失败: ' + (data.reason || '未知原因'))
      if (typeof window.showToast === 'function') window.showToast('连接失败: ' + (data.reason === 'device-offline' ? '目标设备不在线' : data.reason))
    })

    s.socket.on('offer', (data) => {
      log('收到 offer')
      if (typeof window.handleOffer === 'function') window.handleOffer(data)
    })

    s.socket.on('answer', (data) => {
      log('收到 answer')
      if (typeof window.handleAnswer === 'function') window.handleAnswer(data)
    })

    s.socket.on('ice-candidate', (data) => {
      log('收到 ICE candidate')
      if (typeof window.handleIceCandidate === 'function') window.handleIceCandidate(data)
    })
  } catch (error) {
    log('✗ 连接初始化错误: ' + error.message)
    if (typeof window.showToast === 'function') window.showToast('连接失败')
    if (typeof window.updateServerStatus === 'function') window.updateServerStatus('连接失败', 'error')
    s.connectionStatus = s.CONNECTION_STATUS.ERROR
  }
}

function disconnectFromServer() {
  cancelReconnect()
  s._autoSettled = true
  if (s._autoTimer) {
    clearTimeout(s._autoTimer)
    s._autoTimer = null
  }
  if (s.connectionMode === 'websocket') {
    stopWsHeartbeat()
  }
  if (s.socket) {
    if (s.connectionMode === 'websocket') {
      s.socket.close()
    } else {
      s.socket.disconnect()
    }
    s.socket = null
    if (typeof window.log === 'function') window.log('已手动断开服务器连接')
    if (typeof window.updateServerStatus === 'function') window.updateServerStatus('已断开', 'disconnected')
    if (typeof window.showToast === 'function') window.showToast('已断开连接')
  } else {
    if (typeof window.log === 'function') window.log('未连接到服务器')
    if (typeof window.showToast === 'function') window.showToast('未连接到服务器')
  }
}

async function attemptReconnect() {
  if (!s.savedServerUrl || !s.savedRole) return
  if (s.reconnectAttempts >= s.MAX_RECONNECT_ATTEMPTS) {
    if (typeof window.log === 'function') window.log('已达到最大重连次数')
    return
  }
  
  s.reconnectAttempts++
  const delay = s.BASE_RECONNECT_DELAY * Math.pow(2, s.reconnectAttempts - 1)
  if (typeof window.log === 'function') window.log(`尝试重连 (${s.reconnectAttempts}/${s.MAX_RECONNECT_ATTEMPTS})，${delay}ms 后重试...`)
  
  s.reconnectTimeout = setTimeout(() => {
    connectToServer(s.savedServerUrl, s.savedRole)
  }, delay)
}

function cancelReconnect() {
  if (s.reconnectTimeout) {
    clearTimeout(s.reconnectTimeout)
    s.reconnectTimeout = null
  }
  s.reconnectAttempts = 0
}

export {
  buildWsUrl,
  buildHttpUrl,
  setConnectionMode,
  startWsHeartbeat,
  stopWsHeartbeat,
  wsSend,
  sendDirectMessage,
  isSocketConnected,
  handleWsMessage,
  connectToServer,
  _connectWebSocket,
  _connectSocketIO,
  _connectAuto,
  _cleanupSocketIO,
  disconnectFromServer,
  extractHostname,
  isIpAddress,
  resolveHostname,
  attemptReconnect,
  cancelReconnect
}
